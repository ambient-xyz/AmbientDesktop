import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { estimateJsonByteLength, estimateTokensFromBytes, estimateTokensFromText } from "../../shared/contextAccounting";

const GLM_TOKENIZER_MODEL_ID = "zai-org/GLM-5.1";
const GLM_TOKENIZER_REVISION = process.env.AMBIENT_GLM_TOKENIZER_REVISION || "main";
const GLM_TOKENIZER_FILES = ["tokenizer.json", "tokenizer_config.json", "chat_template.jinja"] as const;

type TokenizerModule = typeof import("@huggingface/tokenizers");
type TokenizerInstance = InstanceType<TokenizerModule["Tokenizer"]>;

export interface TokenCountResult {
  source: "local-tokenizer" | "estimate";
  tokens: number;
  latencyMs: number;
  error?: string;
}

export interface GlmTokenizerStatus {
  enabled: boolean;
  loaded: boolean;
  runtime: "@huggingface/tokenizers";
  modelId: string;
  revision: string;
  artifactDir?: string;
  tokenizerJsonSha256?: string;
  loadMs?: number;
  lastCountMs?: number;
  error?: string;
}

export class GlmTokenizerService {
  private tokenizerPromise?: Promise<TokenizerInstance>;
  private status: GlmTokenizerStatus = {
    enabled: process.env.AMBIENT_GLM_TOKENIZER === "1",
    loaded: false,
    runtime: "@huggingface/tokenizers",
    modelId: GLM_TOKENIZER_MODEL_ID,
    revision: GLM_TOKENIZER_REVISION,
  };

  constructor(private readonly statePath: () => string) {}

  getStatus(): GlmTokenizerStatus {
    return { ...this.status };
  }

  async countText(text: string): Promise<TokenCountResult> {
    const startedAt = performance.now();
    if (!this.status.enabled) {
      return {
        source: "estimate",
        tokens: estimateTokensFromText(text),
        latencyMs: elapsed(startedAt),
        error: "GLM tokenizer is disabled. Set AMBIENT_GLM_TOKENIZER=1 to enable lazy loading.",
      };
    }

    try {
      const tokenizer = await this.loadTokenizer();
      const encoded = tokenizer.encode(text, { add_special_tokens: false });
      const latencyMs = elapsed(startedAt);
      this.status.lastCountMs = latencyMs;
      return { source: "local-tokenizer", tokens: encoded.ids.length, latencyMs };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.status.error = message;
      return {
        source: "estimate",
        tokens: estimateTokensFromText(text),
        latencyMs: elapsed(startedAt),
        error: message,
      };
    }
  }

  async countSerializedPayload(payload: unknown, fallbackTokens?: number): Promise<TokenCountResult> {
    const startedAt = performance.now();
    if (!this.status.enabled) {
      return {
        source: "estimate",
        tokens: fallbackTokens ?? estimateTokensFromBytes(estimateJsonByteLength(payload)),
        latencyMs: elapsed(startedAt),
        error: "GLM tokenizer is disabled. Using redacted payload accounting estimate.",
      };
    }
    return this.countText(safeJson(payload));
  }

  private async loadTokenizer(): Promise<TokenizerInstance> {
    this.tokenizerPromise ??= this.loadTokenizerOnce();
    return this.tokenizerPromise;
  }

  private async loadTokenizerOnce(): Promise<TokenizerInstance> {
    const startedAt = performance.now();
    const artifactDir = join(this.statePath(), "tokenizers", "glm-5.1");
    this.status.artifactDir = artifactDir;
    mkdirSync(artifactDir, { recursive: true });
    await ensureArtifacts(artifactDir);

    const tokenizerJsonPath = join(artifactDir, "tokenizer.json");
    const tokenizerConfigPath = join(artifactDir, "tokenizer_config.json");
    const tokenizerJson = JSON.parse(readFileSync(tokenizerJsonPath, "utf8"));
    const tokenizerConfig = JSON.parse(readFileSync(tokenizerConfigPath, "utf8"));
    const { Tokenizer } = await import("@huggingface/tokenizers");
    const tokenizer = new Tokenizer(tokenizerJson, tokenizerConfig);

    this.status = {
      ...this.status,
      loaded: true,
      tokenizerJsonSha256: sha256(readFileSync(tokenizerJsonPath)),
      loadMs: elapsed(startedAt),
      error: undefined,
    };
    return tokenizer;
  }
}

async function ensureArtifacts(artifactDir: string): Promise<void> {
  for (const fileName of GLM_TOKENIZER_FILES) {
    const target = join(artifactDir, fileName);
    if (existsSync(target)) continue;
    const response = await fetch(huggingFaceArtifactUrl(fileName));
    if (!response.ok) throw new Error(`Failed to download GLM tokenizer artifact ${fileName}: HTTP ${response.status}`);
    writeFileSync(target, Buffer.from(await response.arrayBuffer()));
  }
}

function huggingFaceArtifactUrl(fileName: string): string {
  return `https://huggingface.co/${GLM_TOKENIZER_MODEL_ID}/resolve/${GLM_TOKENIZER_REVISION}/${fileName}`;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function elapsed(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 100) / 100;
}
