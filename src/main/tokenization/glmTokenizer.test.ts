import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GlmTokenizerService } from "./glmTokenizer";

describe("GlmTokenizerService", () => {
  let statePath = "";
  const previousFlag = process.env.AMBIENT_GLM_TOKENIZER;

  beforeEach(async () => {
    statePath = await mkdtemp(join(tmpdir(), "ambient-tokenizer-"));
    delete process.env.AMBIENT_GLM_TOKENIZER;
  });

  afterEach(async () => {
    if (previousFlag === undefined) delete process.env.AMBIENT_GLM_TOKENIZER;
    else process.env.AMBIENT_GLM_TOKENIZER = previousFlag;
    await rm(statePath, { recursive: true, force: true });
  });

  it("falls back to estimates when the local tokenizer feature flag is disabled", async () => {
    const service = new GlmTokenizerService(() => statePath);
    const result = await service.countText("Hello GLM");

    expect(result.source).toBe("estimate");
    expect(result.tokens).toBeGreaterThan(0);
    expect(service.getStatus()).toMatchObject({
      enabled: false,
      loaded: false,
      runtime: "@huggingface/tokenizers",
      modelId: "zai-org/GLM-5.1",
    });
  });

  it("does not serialize full provider payloads when the tokenizer is disabled", async () => {
    const service = new GlmTokenizerService(() => statePath);
    const result = await service.countSerializedPayload(
      {
        messages: [
          {
            role: "user",
            content: "Hello GLM",
          },
        ],
        toJSON() {
          throw new Error("must not stringify payload");
        },
      },
      123,
    );

    expect(result).toMatchObject({
      source: "estimate",
      tokens: 123,
    });
    expect(service.getStatus().loaded).toBe(false);
  });
});
