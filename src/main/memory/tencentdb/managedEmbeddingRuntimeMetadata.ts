import { resolve } from "node:path";

export const AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID = "ambient:memory:embeddings:embeddinggemma-300m-q8_0" as const;
export const AMBIENT_MEMORY_EMBEDDING_RUNTIME_ID = "ambient-memory-embeddinggemma-300m-q8_0" as const;
export const AMBIENT_MEMORY_EMBEDDING_PROFILE_ID = "embeddinggemma-300m-q8_0" as const;
export const AMBIENT_MEMORY_EMBEDDING_MODEL_ID = "embeddinggemma-300m-q8_0" as const;

export const modelRepo = "ggml-org/embeddinggemma-300m-qat-q8_0-GGUF";
export const modelRevision = "66f974f8cd48cc3b9c41c516b95508e75b4bee64";
export const modelFilename = "embeddinggemma-300m-qat-Q8_0.gguf";
export const modelRoot = ".ambient/memory/tencentdb/embeddings/models";
export const serverStateRoot = ".ambient/memory/tencentdb/embeddings/llama-server";
export const modelSha256 = "6fa0c02a9c302be6f977521d399b4de3a46310a4f2621ee0063747881b673f67";
export const modelXetHash = "4920b629844676a28f95d4815d795ba4c7cd5846ed68501e0764bc5fa48491ab";
export const modelSizeBytes = 328_577_056;
export const estimatedResidentMemoryBytes = 768 * 1024 * 1024;
export const contextTokens = 2048;
export const dimensions = 768;
export const maxInputChars = 512;

export interface AmbientMemoryEmbeddingModelProfile {
  id: typeof AMBIENT_MEMORY_EMBEDDING_PROFILE_ID;
  modelId: typeof AMBIENT_MEMORY_EMBEDDING_MODEL_ID;
  displayName: "EmbeddingGemma 300M Q8_0";
  repoId: typeof modelRepo;
  revision: typeof modelRevision;
  filename: typeof modelFilename;
  sourceUrl: string;
  sizeBytes: typeof modelSizeBytes;
  sha256: typeof modelSha256;
  xetHash: typeof modelXetHash;
  dimensions: typeof dimensions;
  maxInputChars: typeof maxInputChars;
  contextTokens: typeof contextTokens;
  estimatedResidentMemoryBytes: typeof estimatedResidentMemoryBytes;
  licenseNote: string;
}

export const ambientMemoryEmbeddingModelProfile: AmbientMemoryEmbeddingModelProfile = {
  id: AMBIENT_MEMORY_EMBEDDING_PROFILE_ID,
  modelId: AMBIENT_MEMORY_EMBEDDING_MODEL_ID,
  displayName: "EmbeddingGemma 300M Q8_0",
  repoId: modelRepo,
  revision: modelRevision,
  filename: modelFilename,
  sourceUrl: `https://huggingface.co/${modelRepo}/resolve/${modelRevision}/${modelFilename}`,
  sizeBytes: modelSizeBytes,
  sha256: modelSha256,
  xetHash: modelXetHash,
  dimensions,
  maxInputChars,
  contextTokens,
  estimatedResidentMemoryBytes,
  licenseNote: "Gemma license; keep as user-managed experimental local model until redistribution policy is reviewed.",
};

export function ambientMemoryEmbeddingModelCachePath(managedRoot: string): string {
  return resolve(managedRoot, modelRoot, sanitizePathSegment(modelRepo), modelRevision, modelFilename);
}

export function ambientMemoryEmbeddingServerStateRoot(managedRoot: string): string {
  return resolve(managedRoot, serverStateRoot);
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "--");
}
