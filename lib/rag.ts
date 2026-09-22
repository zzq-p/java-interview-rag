import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { chunks, documents } from "@/db/schema";

export type RetrievedChunk = { id: number; content: string; documentName: string; position: number };

function terms(value: string) {
  const lower = value.toLowerCase();
  const latin = lower.match(/[a-z][a-z0-9+.#-]{1,}/g) ?? [];
  const chineseRuns = lower.match(/[\u4e00-\u9fff]{2,}/g) ?? [];
  const chinese = chineseRuns.flatMap((run) => run.length <= 4 ? [run] : Array.from({ length: run.length - 1 }, (_, index) => run.slice(index, index + 2)));
  return Array.from(new Set([...latin, ...chinese]));
}

export async function retrieveChunks(query: string, limit = 8) {
  const rows = await getDb().select({ id: chunks.id, content: chunks.content, documentName: documents.name, position: chunks.position }).from(chunks).innerJoin(documents, eq(chunks.documentId, documents.id)).limit(400);
  const queryTerms = terms(query);
  if (!queryTerms.length) return rows.slice(0, limit);
  return rows.map((row, index) => {
    const haystack = `${row.documentName}\n${row.content}`.toLowerCase();
    const score = queryTerms.reduce((total, term) => total + (haystack.includes(term) ? term.length > 3 ? 3 : 2 : 0), 0);
    return { row, index, score };
  }).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, limit).map(({ row }) => row);
}

export function formatContext(rows: RetrievedChunk[]) {
  return rows.map((row, index) => `[来源 ${index + 1}] 文档：${row.documentName}；片段：${row.position + 1}\n${row.content.slice(0, 1200)}`).join("\n\n---\n\n");
}
