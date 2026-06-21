import {
  ambientModelReasoningEffortForThinkingLevel,
  normalizeAmbientModelId,
  resolveAmbientModelReasoningCapability,
  resolveAmbientModelReasoningThinkingLevel,
  type AmbientModelReasoningPayloadStrategy,
  type AmbientModelReasoningThinkingLevel,
} from "./ambientModels";

export const MODEL_REASONING_PAYLOAD_EVIDENCE_SCHEMA_VERSION = "ambient-model-reasoning-payload-v1" as const;

export interface ModelReasoningPayloadEvidence {
  schemaVersion: typeof MODEL_REASONING_PAYLOAD_EVIDENCE_SCHEMA_VERSION;
  modelId: string;
  requestedThinkingLevel?: AmbientModelReasoningThinkingLevel;
  resolvedThinkingLevel: AmbientModelReasoningThinkingLevel;
  strategy: AmbientModelReasoningPayloadStrategy;
  requestFields: string[];
  fieldPresence: Record<string, boolean>;
  reasoningEffort?: string;
  changed: boolean;
}

export interface ShapeModelReasoningPayloadInput {
  payload: unknown;
  modelId?: string;
  thinkingLevel?: AmbientModelReasoningThinkingLevel;
}

export interface ShapeModelReasoningPayloadResult {
  payload: unknown;
  changed: boolean;
  evidence: ModelReasoningPayloadEvidence;
}

const REASONING_CONTROL_FIELDS = ["enable_thinking", "reasoning_effort", "thinking", "reasoning"] as const;

export function shapeModelReasoningPayload(input: ShapeModelReasoningPayloadInput): ShapeModelReasoningPayloadResult {
  const modelId = normalizeAmbientModelId(modelIdFromPayload(input.payload) ?? input.modelId);
  const capability = resolveAmbientModelReasoningCapability(modelId);
  const resolvedThinkingLevel = resolveAmbientModelReasoningThinkingLevel(modelId, input.thinkingLevel);
  const original = isRecord(input.payload) ? input.payload : {};
  const payload = { ...original };

  if (!isRecord(input.payload)) {
    payload.model = modelId;
  }

  if (capability.payloadStrategy === "zai-reasoning-effort") {
    const effort = ambientModelReasoningEffortForThinkingLevel(modelId, input.thinkingLevel);
    payload.enable_thinking = true;
    if (effort) payload.reasoning_effort = effort;
  } else if (capability.payloadStrategy === "omit-reasoning-controls") {
    for (const field of REASONING_CONTROL_FIELDS) {
      delete payload[field];
    }
  }

  const changed = !samePayloadShape(original, payload);
  return {
    payload,
    changed,
    evidence: {
      schemaVersion: MODEL_REASONING_PAYLOAD_EVIDENCE_SCHEMA_VERSION,
      modelId,
      ...(input.thinkingLevel ? { requestedThinkingLevel: input.thinkingLevel } : {}),
      resolvedThinkingLevel,
      strategy: capability.payloadStrategy,
      requestFields: [...capability.requestFields],
      fieldPresence: fieldPresence(payload),
      ...(typeof payload.reasoning_effort === "string" ? { reasoningEffort: payload.reasoning_effort } : {}),
      changed,
    },
  };
}

function modelIdFromPayload(payload: unknown): string | undefined {
  if (!isRecord(payload)) return undefined;
  return typeof payload.model === "string" ? payload.model : undefined;
}

function fieldPresence(payload: Record<string, unknown>): Record<string, boolean> {
  return Object.fromEntries(REASONING_CONTROL_FIELDS.map((field) => [field, Object.hasOwn(payload, field)]));
}

function samePayloadShape(before: Record<string, unknown>, after: Record<string, unknown>): boolean {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (!Object.is(before[key], after[key])) return false;
  }
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
