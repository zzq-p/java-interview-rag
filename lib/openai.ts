import { env } from "cloudflare:workers";

type JsonSchema = Record<string, unknown>;

function readOutputText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === "string") return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as { content?: unknown }).content) ? (item as { content: unknown[] }).content : [];
    for (const part of content) {
      if (part && typeof part === "object" && (part as { type?: string }).type === "output_text" && typeof (part as { text?: unknown }).text === "string") return (part as { text: string }).text;
    }
  }
  throw new Error("模型没有返回可读取的结果。");
}

export async function createStructuredResponse<T>({ name, schema, instructions, input, maxOutputTokens = 2200 }: { name: string; schema: JsonSchema; instructions: string; input: string; maxOutputTokens?: number }) {
  if (!env.OPENAI_API_KEY) throw new Error("MODEL_NOT_CONFIGURED");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || "gpt-5-mini",
      store: false,
      max_output_tokens: maxOutputTokens,
      instructions,
      input,
      text: { format: { type: "json_schema", name, strict: true, schema } },
    }),
  });
  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    const error = payload.error && typeof payload.error === "object" ? (payload.error as { message?: string }).message : undefined;
    throw new Error(error || `模型请求失败（${response.status}）`);
  }
  return JSON.parse(readOutputText(payload)) as T;
}
