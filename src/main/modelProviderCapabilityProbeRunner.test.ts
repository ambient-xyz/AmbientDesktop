import { describe, expect, it } from "vitest";
import {
  buildModelProviderCapabilityProbePlan,
  MODEL_PROVIDER_CAPABILITY_PROBE_SCHEMA_VERSION,
  modelProviderInstallTemplateById,
  type ModelProviderCapabilityProbeId,
} from "../shared/modelProviderInstallTemplates";
import { probeModelProviderCapabilityEligibility } from "./modelProviderCapabilityProbe";
import {
  MODEL_PROVIDER_CAPABILITY_PROBE_EVIDENCE_MAX_CHARS,
  MODEL_PROVIDER_CAPABILITY_PROBE_RUNNER_SCHEMA_VERSION,
  runModelProviderCapabilityProbePlan,
  type ModelProviderCapabilityProbeExecutionInput,
  type ModelProviderCapabilityProbeRunnerAdapter,
} from "./modelProviderCapabilityProbeRunner";
import { resolveAmbientModelRuntimeProfile, type AmbientModelRuntimeProfile } from "../shared/ambientModels";

describe("runModelProviderCapabilityProbePlan", () => {
  it("executes every planned probe and preserves the exact provider/model identity", async () => {
    const template = requiredTemplate("generic-openai-compatible");
    const plan = buildModelProviderCapabilityProbePlan({
      template,
      providerId: "customer-router",
      modelId: "CUSTOM/Router Model v2",
      generatedAt: "2026-06-06T00:00:00.000Z",
    });
    const calls: ModelProviderCapabilityProbeExecutionInput[] = [];
    const adapter: ModelProviderCapabilityProbeRunnerAdapter = {
      adapterId: "deterministic-openai-compatible",
      runCapabilityProbe(input) {
        calls.push(input);
        return {
          status: "passed",
          latencyMs: 12,
          evidence: `observed ${input.probeId}`,
          value: { compatibility: input.plan.compatibility, modelId: input.plan.modelId },
        };
      },
    };

    const report = await runModelProviderCapabilityProbePlan({
      plan,
      adapter,
      generatedAt: "2026-06-06T00:01:00.000Z",
      measuredAt: "2026-06-06T00:01:01.000Z",
    });

    expect(report).toMatchObject({
      schemaVersion: MODEL_PROVIDER_CAPABILITY_PROBE_SCHEMA_VERSION,
      templateId: "generic-openai-compatible",
      providerId: "customer-router",
      modelId: "CUSTOM/Router Model v2",
      generatedAt: "2026-06-06T00:01:00.000Z",
    });
    expect(report.observations.map((observation) => observation.probeId)).toEqual(plan.probeIds);
    expect(report.observations).toEqual(plan.probeIds.map((probeId) => expect.objectContaining({
      probeId,
      status: "passed",
      measuredAt: "2026-06-06T00:01:01.000Z",
      latencyMs: 12,
    })));
    expect(calls.map((call) => call.probeId)).toEqual(plan.probeIds);
    expect(calls[0]).toMatchObject({
      schemaVersion: MODEL_PROVIDER_CAPABILITY_PROBE_RUNNER_SCHEMA_VERSION,
      plan,
    });
  });

  it("feeds eligibility only from actual probe observations", async () => {
    const template = requiredTemplate("generic-openai-compatible");
    const plan = buildModelProviderCapabilityProbePlan({
      template,
      providerId: "customer-router",
      modelId: "custom/tool-model",
      generatedAt: "2026-06-06T00:00:00.000Z",
    });
    const adapter: ModelProviderCapabilityProbeRunnerAdapter = {
      adapterId: "partial-openai-compatible",
      runCapabilityProbe(input) {
        return {
          status: input.probeId === "tool_use" ? "skipped" : "passed",
          evidence: `observed ${input.probeId}`,
        };
      },
    };

    const report = await runModelProviderCapabilityProbePlan({
      plan,
      adapter,
      generatedAt: "2026-06-06T00:02:00.000Z",
      measuredAt: "2026-06-06T00:02:01.000Z",
    });
    const eligibility = probeModelProviderCapabilityEligibility({
      template,
      profile: customProfile({
        providerId: "customer-router",
        modelId: "custom/tool-model",
        toolUse: "ambient-tools",
        structuredOutput: "schema",
      }),
      report,
    });

    expect(report.observations).toContainEqual(expect.objectContaining({ probeId: "tool_use", status: "skipped" }));
    expect(eligibility.eligibleAsMain).toBe(true);
    expect(eligibility.eligibleAsSubagent).toBe(false);
    expect(eligibility.subagentBlockers).toEqual(expect.arrayContaining([
      "Capability probe tool_use was skipped.",
    ]));
  });

  it("records thrown probe failures without leaking secret-shaped evidence", async () => {
    const template = requiredTemplate("gmi-cloud");
    const plan = buildModelProviderCapabilityProbePlan({
      template,
      modelId: "zai-org/GLM-5.1-FP8",
      generatedAt: "2026-06-06T00:00:00.000Z",
      extraProbeIds: ["health"],
    });
    const adapter: ModelProviderCapabilityProbeRunnerAdapter = {
      adapterId: "secret-redaction",
      runCapabilityProbe(input) {
        if (input.probeId === "health") {
          throw new Error("authorization: Bearer sk-super-secret-token-123456789 failed");
        }
        return {
          status: "passed",
          evidence: "x-api-key=sk-other-secret-token-123456789 accepted",
          value: {
            token: "sk-nested-secret-token-123456789",
            nested: ["authorization=sk-array-secret-token-123456789"],
          },
        };
      },
    };

    const report = await runModelProviderCapabilityProbePlan({
      plan,
      adapter,
      generatedAt: "2026-06-06T00:03:00.000Z",
      measuredAt: "2026-06-06T00:03:01.000Z",
    });
    const serialized = JSON.stringify(report);

    expect(report.observations).toContainEqual(expect.objectContaining({
      probeId: "health",
      status: "failed",
      error: expect.stringContaining("[REDACTED]"),
    }));
    expect(serialized).not.toContain("sk-super-secret-token");
    expect(serialized).not.toContain("sk-other-secret-token");
    expect(serialized).not.toContain("sk-nested-secret-token");
    expect(serialized).not.toContain("sk-array-secret-token");
    expect(serialized).not.toContain("Bearer sk-");
  });

  it("bounds large probe evidence before it enters the report", async () => {
    const template = requiredTemplate("local-text-runtime");
    const plan = buildModelProviderCapabilityProbePlan({
      template,
      modelId: "local/text-4b",
      generatedAt: "2026-06-06T00:00:00.000Z",
    });
    const adapter: ModelProviderCapabilityProbeRunnerAdapter = {
      adapterId: "large-evidence",
      runCapabilityProbe() {
        return {
          status: "passed",
          evidence: "local-runtime-health ".repeat(100),
        };
      },
    };

    const report = await runModelProviderCapabilityProbePlan({
      plan,
      adapter,
      generatedAt: "2026-06-06T00:04:00.000Z",
      measuredAt: "2026-06-06T00:04:01.000Z",
    });

    expect(report.observations[0].evidence?.length).toBeLessThanOrEqual(MODEL_PROVIDER_CAPABILITY_PROBE_EVIDENCE_MAX_CHARS + "... [truncated]".length);
    expect(report.observations[0].evidence).toContain("[truncated]");
  });

  it("turns invalid adapter statuses into failed observations", async () => {
    const template = requiredTemplate("ambient-managed");
    const plan = buildModelProviderCapabilityProbePlan({
      template,
      modelId: "zai-org/GLM-5.1-FP8",
      generatedAt: "2026-06-06T00:00:00.000Z",
      extraProbeIds: ["health"],
    });
    const adapter: ModelProviderCapabilityProbeRunnerAdapter = {
      adapterId: "invalid-status",
      runCapabilityProbe() {
        return { status: "green" as never };
      },
    };

    const report = await runModelProviderCapabilityProbePlan({
      plan: { ...plan, probeIds: ["health"] },
      adapter,
      generatedAt: "2026-06-06T00:05:00.000Z",
      measuredAt: "2026-06-06T00:05:01.000Z",
    });

    expect(report.observations).toEqual([
      expect.objectContaining({
        probeId: "health",
        status: "failed",
        error: "Probe adapter returned invalid status: green",
      }),
    ]);
  });
});

function requiredTemplate(templateId: string) {
  const template = modelProviderInstallTemplateById(templateId);
  if (!template) throw new Error(`missing template ${templateId}`);
  return template;
}

function customProfile(input: {
  providerId: string;
  modelId: string;
  toolUse?: AmbientModelRuntimeProfile["toolUse"];
  structuredOutput?: AmbientModelRuntimeProfile["structuredOutput"];
}): AmbientModelRuntimeProfile {
  return {
    ...resolveAmbientModelRuntimeProfile("zai-org/GLM-5.1-FP8"),
    profileId: `${input.providerId}:${input.modelId}`,
    providerId: input.providerId,
    modelId: input.modelId,
    label: input.modelId,
    costClass: "metered",
    trustClass: "user-configured",
    privacyLabel: "User configured provider",
    toolUse: input.toolUse ?? "none",
    structuredOutput: input.structuredOutput ?? "json-mode",
    providerQuirks: ["Configured through Settings provider onboarding."],
  };
}
