export const AMBIENT_TENCENT_MEMORY_LOCAL_EMBEDDING_API_KEY = "ambient-local-embedding" as const;

export interface OpenAiCompatibleEmbeddingPreflightInput {
  fetchImpl?: typeof fetch;
  baseUrl: string;
  model: string;
  dimensions: number;
  sendDimensions: boolean;
  timeoutMs: number;
}

export interface OpenAiCompatibleEmbeddingPreflightResult {
  ok: boolean;
  message: string;
  sendDimensions: boolean;
}

export function normalizeOpenAiEmbeddingBaseUrl(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, "");
  return /\/v1$/i.test(trimmed) ? trimmed : `${trimmed}/v1`;
}

export async function preflightOpenAiCompatibleEmbeddingEndpoint(
  input: OpenAiCompatibleEmbeddingPreflightInput,
): Promise<OpenAiCompatibleEmbeddingPreflightResult> {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) return { ok: false, message: "No fetch implementation is available for embedding preflight.", sendDimensions: input.sendDimensions };
  const first = await tryPreflightEmbedding(fetchImpl, input);
  if (first.ok || !input.sendDimensions) return first;
  const retry = await tryPreflightEmbedding(fetchImpl, { ...input, sendDimensions: false });
  if (retry.ok) return retry;
  return first;
}

async function tryPreflightEmbedding(
  fetchImpl: typeof fetch,
  input: OpenAiCompatibleEmbeddingPreflightInput,
): Promise<OpenAiCompatibleEmbeddingPreflightResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
  const body: Record<string, unknown> = {
    model: input.model,
    input: "ambient memory embedding preflight",
  };
  if (input.sendDimensions) body.dimensions = input.dimensions;
  try {
    const response = await fetchImpl(`${input.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AMBIENT_TENCENT_MEMORY_LOCAL_EMBEDDING_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      return { ok: false, message: `Embedding endpoint returned HTTP ${response.status}.`, sendDimensions: input.sendDimensions };
    }
    const json = await response.json() as { data?: Array<{ embedding?: unknown }> };
    const embedding = json.data?.[0]?.embedding;
    if (!Array.isArray(embedding)) {
      return { ok: false, message: "Embedding endpoint response did not include data[0].embedding.", sendDimensions: input.sendDimensions };
    }
    if (embedding.length !== input.dimensions) {
      return { ok: false, message: `Embedding endpoint returned ${embedding.length} dimensions; expected ${input.dimensions}.`, sendDimensions: input.sendDimensions };
    }
    return { ok: true, message: "Embedding endpoint preflight passed.", sendDimensions: input.sendDimensions };
  } catch (error) {
    return { ok: false, message: errorMessage(error), sendDimensions: input.sendDimensions };
  } finally {
    clearTimeout(timeout);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
