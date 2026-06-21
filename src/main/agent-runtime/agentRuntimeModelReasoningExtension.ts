import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";

import type { AmbientModelReasoningThinkingLevel } from "../../shared/ambientModels";
import { shapeModelReasoningPayload, type ModelReasoningPayloadEvidence } from "../../shared/modelReasoningPayload";

export interface ModelReasoningPayloadExtensionOptions {
  modelId: string;
  getThinkingLevel: () => AmbientModelReasoningThinkingLevel | undefined;
  evidencePath?: string;
  recordEvidence?: (evidence: ModelReasoningPayloadEvidence) => void;
}

export function createModelReasoningPayloadExtension(options: ModelReasoningPayloadExtensionOptions): ExtensionFactory {
  return (pi) => {
    (pi as any).on("before_provider_request", async (event: any) => {
      const result = shapeModelReasoningPayload({
        payload: event.payload,
        modelId: options.modelId,
        thinkingLevel: options.getThinkingLevel(),
      });
      recordModelReasoningPayloadEvidence(options, result.evidence);
      return result.changed ? result.payload : undefined;
    });
  };
}

function recordModelReasoningPayloadEvidence(
  options: ModelReasoningPayloadExtensionOptions,
  evidence: ModelReasoningPayloadEvidence,
): void {
  try {
    options.recordEvidence?.(evidence);
  } catch (error) {
    console.warn(`[model-reasoning] Failed to record reasoning payload evidence: ${errorMessage(error)}`);
  }

  if (!options.evidencePath) return;
  try {
    mkdirSync(dirname(options.evidencePath), { recursive: true });
    appendFileSync(options.evidencePath, `${JSON.stringify(evidence)}\n`, "utf8");
  } catch (error) {
    console.warn(`[model-reasoning] Failed to append reasoning payload evidence: ${errorMessage(error)}`);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
