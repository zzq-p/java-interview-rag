import { desc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "@/db";
import { chunks, documents } from "@/db/schema";

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ["txt", "md", "java", "json", "xml", "csv", "properties"];

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "资料服务暂时不可用";
  const isSetup = message.includes("no such table") || message.includes("binding");
  return Response.json({ error: isSetup ? "资料库正在初始化，请稍后再试。" : message }, { status: 500 });
}

function splitIntoChunks(source: string) {
  const clean = source.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];
  const paragraphs = clean.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  const result: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if (`${current}\n\n${paragraph}`.length > 900 && current) { result.push(current); current = paragraph; }
    else current = current ? `${current}\n\n${paragraph}` : paragraph;
  }
  if (current) result.push(current);
  return result.flatMap((part) => part.length <= 1100 ? [part] : part.match(/[\s\S]{1,900}/g) ?? []);
}

export async function GET() {
  try {
    const rows = await getDb().select().from(documents).orderBy(desc(documents.createdAt), desc(documents.id));
    return Response.json({ documents: rows });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "请选择要上传的文件。" }, { status: 400 });
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXTENSIONS.includes(extension)) return Response.json({ error: "仅支持 TXT、Markdown、Java、JSON、XML、CSV 和 Properties 文件。" }, { status: 400 });
    if (file.size > MAX_BYTES) return Response.json({ error: "单个文件不能超过 2MB。" }, { status: 400 });
    const content = (await file.text()).trim();
    const pieces = splitIntoChunks(content);
    if (!pieces.length) return Response.json({ error: "文件中没有可用于出题的文本。" }, { status: 400 });
    if (pieces.length > 2500) return Response.json({ error: "文档内容过长，请拆分后上传。" }, { status: 400 });
    if (!env.BUCKET) throw new Error("R2 binding `BUCKET` is unavailable");
    const objectKey = `documents/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-\u4e00-\u9fa5]/g, "_")}`;
    await env.BUCKET.put(objectKey, file.stream(), { httpMetadata: { contentType: file.type || "text/plain" } });
    const db = getDb();
    const [document] = await db.insert(documents).values({ name: file.name, objectKey, mimeType: file.type || "text/plain", size: file.size, chunkCount: pieces.length }).returning();
    try {
      // Keep each statement below D1's bound-parameter limit while indexing the whole file.
      for (let position = 0; position < pieces.length; position += 25) {
        await db.insert(chunks).values(pieces.slice(position, position + 25).map((content, offset) => ({ documentId: document.id, position: position + offset, content })));
      }
    } catch (error) {
      await db.delete(documents).where(eq(documents.id, document.id));
      await env.BUCKET.delete(objectKey);
      throw error;
    }
    return Response.json({ document }, { status: 201 });
  } catch (error) { return routeError(error); }
}

export async function DELETE(request: Request) {
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isSafeInteger(id) || id <= 0) return Response.json({ error: "文档编号无效。" }, { status: 400 });
    const db = getDb();
    const [document] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
    if (!document) return Response.json({ error: "没有找到这份文档。" }, { status: 404 });
    if (env.BUCKET) await env.BUCKET.delete(document.objectKey);
    await db.delete(chunks).where(eq(chunks.documentId, id));
    await db.delete(documents).where(eq(documents.id, id));
    return Response.json({ deleted: id });
  } catch (error) { return routeError(error); }
}
