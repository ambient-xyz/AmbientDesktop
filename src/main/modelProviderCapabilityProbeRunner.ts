import {
  MODEL_PROVIDER_CAPABILITY_PROBE_SCHEMA_VERSION,
  type ModelProviderCapabilityProbeId,
  type ModelProviderCapabilityProbeObservation,
  type ModelProviderCapabilityProbePlan,
  type ModelProviderCapabilityProbeReport,
  type ModelProviderCapabilityProbeStatus,
} from "../shared/modelProviderInstallTemplates";

export const MODEL_PROVIDER_CAPABILITY_PROBE_RUNNER_SCHEMA_VERSION = "ambient-model-provider-capability-probe-runner-v1" as const;
export const MODEL_PROVIDER_CAPABILITY_PROBE_EVIDENCE_MAX_CHARS = 500;

export interface ModelProviderCapabilityProbeExecutionInput {
  schemaVersion: typeof MODEL_PROVIDER_CAPABILITY_PROBE_RUNNER_SCHEMA_VERSION;
  plan: ModelProviderCapabilityProbePlan;
  probeId: ModelProviderCapabilityProbeId;
  requiredForMain: boolean;
  requiredForSubagent: boolean;
}

export interface ModelProviderCapabilityProbeExecutionResult {
  status: ModelProviderCapabilityProbeStatus;
  latencyMs?: number;
  value?: unknown;
  evidence?: string;
  error?: string;
}

export interface ModelProviderCapabilityProbeRunnerAdapter {
  adapterId: string;
  runCapabilityProbe(input: ModelProviderCapabilityProbeExecutionInput): Promise<ModelProviderCapabilityProbeExecutionResult> | ModelProviderCapabilityProbeExecutionResult;
}

export async function runModelProviderCapabilityProbePlan(input: {
  plan: ModelProviderCapabilityProbePlan;
  adapter: ModelProviderCapabilityProbeRunnerAdapter;
  generatedAt?: string;
  measuredAt?: string;
}): Promise<ModelProviderCapabilityProbeReport> {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const measuredAt = input.measuredAt ?? generatedAt;
  const observations: ModelProviderCapabilityProbeObservation[] = [];

  for (const probeId of input.plan.probeIds) {
    observations.push(await runSingleCapabilityProbe({
      plan: input.plan,
      adapter: input.adapter,
      probeId,
      measuredAt,
    }));
  }

  return {
    schemaVersion: MODEL_PROVIDER_CAPABILITY_PROBE_SCHEMA_VERSION,
    templateId: input.plan.templateId,
    providerId: input.plan.providerId,
    modelId: input.plan.modelId,
    generatedAt,
    observations,
  };
}

async function runSingleCapabilityProbe(input: {
  plan: ModelProviderCapabilityProbePlan;
  adapter: ModelProviderCapabilityProbeRunnerAdapter;
  probeId: ModelProviderCapabilityProbeId;
  measuredAt: string;
}): Promise<ModelProviderCapabilityProbeObservation> {
  const start = Date.now();
  try {
    const result = await input.adapter.runCapabilityProbe({
      schemaVersion: MODEL_PROVIDER_CAPABILITY_PROBE_RUNNER_SCHEMA_VERSION,
      plan: input.plan,
      probeId: input.probeId,
      requiredForMain: input.plan.requiredProbeIdsForMain.includes(input.probeId),
      requiredForSubagent: input.plan.requiredProbeIdsForSubagent.includes(input.probeId),
    });
    return observationFromExecutionResult({
      probeId: input.probeId,
      result,
      measuredAt: input.measuredAt,
      fallbackLatencyMs: Date.now() - start,
    });
  } catch (error) {
    return {
      probeId: input.probeId,
      status: "failed",
      measuredAt: input.measuredAt,
      latencyMs: Date.now() - start,
      error: boundedSecretSafeText(errorMessage(error)),
    };
  }
}

function observationFromExecutionResult(input: {
  probeId: ModelProviderCapabilityProbeId;
  result: ModelProviderCapabilityProbeExecutionResult;
  measuredAt: string;
  fallbackLatencyMs: number;
}): ModelProviderCapabilityProbeObservation {
  const status = normalizedProbeStatus(input.result.status);
  const observation: ModelProviderCapabilityProbeObservation = {
    probeId: input.probeId,
    status,
    measuredAt: input.measuredAt,
  };
  if (input.result.latencyMs !== undefined) {
    observation.latencyMs = finiteNonNegative(input.result.latencyMs) ? input.result.latencyMs : input.fallbackLatencyMs;
  } else {
    observation.latencyMs = input.fallbackLatencyMs;
  }
  if (input.result.value !== undefined) observation.value = secretSafeValue(input.result.value);
  if (input.result.evidence !== undefined) observation.evidence = boundedSecretSafeText(input.result.evidence);
  if (input.result.error !== undefined) observation.error = boundedSecretSafeText(input.result.error);
  if (status === "failed" && !observation.error && input.result.status !== "failed") {
    observation.error = `Probe adapter returned invalid status: ${boundedSecretSafeText(String(input.result.status))}`;
  }
  return observation;
}

function normalizedProbeStatus(status: unknown): ModelProviderCapabilityProbeStatus {
  return status === "passed" || status === "failed" || status === "skipped" || status === "unknown"
    ? status
    : "failed";
}

function secretSafeValue(value: unknown): unknown {
  if (typeof value === "string") return boundedSecretSafeText(value);
  if (Array.isArray(value)) return value.map(secretSafeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, secretSafeValue(nested)]),
    );
  }
  return value;
}

function boundedSecretSafeText(value: string): string {
  const redacted = redactSecretLikeText(value);
  if (redacted.length <= MODEL_PROVIDER_CAPABILITY_PROBE_EVIDENCE_MAX_CHARS) return redacted;
  return `${redacted.slice(0, MODEL_PROVIDER_CAPABILITY_PROBE_EVIDENCE_MAX_CHARS)}... [truncated]`;
}

function redactSecretLikeText(value: string): string {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[REDACTED]")
    .replace(/\b(api[_-]?key|authorization|x-api-key|token|secret)\s*[:=]\s*([^\s,;]+)/gi, "$1=[REDACTED]");
}

function finiteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
