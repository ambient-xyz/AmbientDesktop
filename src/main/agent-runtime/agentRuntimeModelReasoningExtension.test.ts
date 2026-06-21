import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import { AMBIENT_GLM_5_2_FP8_MODEL, AMBIENT_KIMI_K2_7_CODE_MODEL } from "../../shared/ambientModels";
import { createModelReasoningPayloadExtension } from "./agentRuntimeModelReasoningExtension";

type ProviderRequestHandler = (event: { payload: unknown }) => Promise<unknown>;

describe("createModelReasoningPayloadExtension", () => {
  it("returns a GLM payload with the selected provider reasoning effort and records redacted evidence", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-model-reasoning-"));
    const evidencePath = join(workspace, "payloads", "model-reasoning.jsonl");
    const recorded: unknown[] = [];
    const pi = fakePi();
    createModelReasoningPayloadExtension({
      modelId: AMBIENT_GLM_5_2_FP8_MODEL,
      getThinkingLevel: () => "xhigh",
      evidencePath,
      recordEvidence: (evidence) => recorded.push(evidence),
    })(pi.instance as never);

    const result = await pi.beforeProviderRequest()({
      payload: {
        model: AMBIENT_GLM_5_2_FP8_MODEL,
        messages: [{ role: "user", content: "private prompt text" }],
      },
    });

    expect(result).toMatchObject({
      model: AMBIENT_GLM_5_2_FP8_MODEL,
      enable_thinking: true,
      reasoning_effort: "max",
    });
    expect(recorded).toEqual([
      expect.objectContaining({
        modelId: AMBIENT_GLM_5_2_FP8_MODEL,
        resolvedThinkingLevel: "xhigh",
        reasoningEffort: "max",
      }),
    ]);
    const evidenceText = await readFile(evidencePath, "utf8");
    expect(evidenceText).toContain('"reasoningEffort":"max"');
    expect(evidenceText).not.toContain("private prompt");
  });

  it("returns undefined when Kimi payloads already omit unsupported request controls", async () => {
    const recorded: unknown[] = [];
    const pi = fakePi();
    createModelReasoningPayloadExtension({
      modelId: AMBIENT_KIMI_K2_7_CODE_MODEL,
      getThinkingLevel: () => "medium",
      recordEvidence: (evidence) => recorded.push(evidence),
    })(pi.instance as never);

    await expect(
      pi.beforeProviderRequest()({
        payload: {
          model: AMBIENT_KIMI_K2_7_CODE_MODEL,
          messages: [{ role: "user", content: "hello" }],
        },
      }),
    ).resolves.toBeUndefined();
    expect(recorded).toEqual([
      expect.objectContaining({
        modelId: AMBIENT_KIMI_K2_7_CODE_MODEL,
        strategy: "omit-reasoning-controls",
        changed: false,
        fieldPresence: {
          enable_thinking: false,
          reasoning_effort: false,
          thinking: false,
          reasoning: false,
        },
      }),
    ]);
  });
});

function fakePi() {
  let beforeProviderRequest: ProviderRequestHandler | undefined;
  return {
    instance: {
      on: (eventName: string, handler: ProviderRequestHandler) => {
        if (eventName === "before_provider_request") beforeProviderRequest = handler;
      },
    },
    beforeProviderRequest: () => {
      expect(beforeProviderRequest).toBeDefined();
      return beforeProviderRequest!;
    },
  };
}
