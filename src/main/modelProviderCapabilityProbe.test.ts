import { describe, expect, it } from "vitest";
import {
  AMBIENT_DEFAULT_MODEL,
  AMBIENT_PROVIDER_AMBIENT,
  AMBIENT_PROVIDER_LOCAL,
  resolveAmbientModelRuntimeProfile,
  type AmbientModelRuntimeProfile,
} from "../shared/ambientModels";
import {
  buildModelProviderCapabilityProbePlan,
  MODEL_PROVIDER_CAPABILITY_PROBE_SCHEMA_VERSION,
  MODEL_PROVIDER_INSTALL_TEMPLATES,
  modelProviderInstallTemplateById,
  modelProviderInstallTemplatesForProvider,
  modelRuntimeProfileWithCapabilityProbeEligibility,
  probeModelProviderCapabilityEligibility,
  providerDescriptorFromInstallTemplate,
  type ModelProviderCapabilityProbeId,
  type ModelProviderCapabilityProbeObservation,
  type ModelProviderCapabilityProbeReport,
} from "./modelProviderCapabilityProbe";

describe("modelProviderCapabilityProbe", () => {
  it("defines known provider templates and generic endpoint installer shapes with Ambient-managed secret flows", () => {
    const templateIds = MODEL_PROVIDER_INSTALL_TEMPLATES.map((template) => template.id);

    expect(templateIds).toEqual(expect.arrayContaining([
      "ambient-managed",
      "gmi-cloud",
      "generic-openai-compatible",
      "generic-anthropic-compatible",
      "local-text-runtime",
    ]));
    expect(modelProviderInstallTemplateById("generic-openai-compatible")).toMatchObject({
      kind: "generic_openai_compatible",
      compatibility: "openai-compatible",
      secretFlow: "ambient_cli_secret_request",
      endpointBaseUrlRequired: true,
      defaultProbeIds: expect.arrayContaining([
        "streaming",
        "image_input",
        "structured_json",
        "schema_output",
        "tool_use",
        "latency",
        "error_shape",
        "context_window",
      ]),
    });
    expect(modelProviderInstallTemplateById("generic-anthropic-compatible")).toMatchObject({
      kind: "generic_anthropic_compatible",
      compatibility: "anthropic-compatible",
      secretFlow: "ambient_cli_secret_request",
      endpointBaseUrlRequired: true,
    });
    expect(modelProviderInstallTemplateById("gmi-cloud")).toMatchObject({
      secretFlow: "ambient_cli_env_bind",
    });
    expect(modelProviderInstallTemplatesForProvider(AMBIENT_PROVIDER_LOCAL)).toEqual([
      expect.objectContaining({
        id: "local-text-runtime",
        defaultProbeIds: expect.arrayContaining(["health", "local_memory", "reliability"]),
      }),
    ]);
  });

  it("builds probe plans that preserve custom model ids exactly", () => {
    const template = modelProviderInstallTemplateById("generic-openai-compatible");
    if (!template) throw new Error("missing generic-openai-compatible template");

    const plan = buildModelProviderCapabilityProbePlan({
      template,
      providerId: "customer-router",
      modelId: "CUSTOM/Router Model v2",
      generatedAt: "2026-06-06T00:00:00.000Z",
      extraProbeIds: ["reliability"],
    });
    const provider = providerDescriptorFromInstallTemplate({
      template,
      providerId: "customer-router",
      label: "Customer router",
      notes: ["Installed from Settings generic OpenAI-compatible flow."],
    });

    expect(plan).toMatchObject({
      schemaVersion: MODEL_PROVIDER_CAPABILITY_PROBE_SCHEMA_VERSION,
      templateId: "generic-openai-compatible",
      providerId: "customer-router",
      modelId: "CUSTOM/Router Model v2",
      compatibility: "openai-compatible",
      secretFlow: "ambient_cli_secret_request",
      probeIds: expect.arrayContaining([
        "streaming",
        "context_window",
        "structured_json",
        "schema_output",
        "tool_use",
        "image_input",
        "latency",
        "error_shape",
        "reliability",
      ]),
    });
    expect(provider).toMatchObject({
      id: "customer-router",
      label: "Customer router",
      secretRequirement: "user-secret",
      supportsStreaming: true,
      supportsTools: true,
    });
  });

  it("marks main and sub-agent eligibility only after required capability probes pass", () => {
    const template = modelProviderInstallTemplateById("generic-openai-compatible");
    if (!template) throw new Error("missing generic-openai-compatible template");
    const profile = customProfile({
      providerId: "customer-router",
      modelId: "custom/tool-model",
      supportsVision: true,
      toolUse: "ambient-tools",
      structuredOutput: "schema",
    });

    const passed = probeModelProviderCapabilityEligibility({
      template,
      profile,
      report: report({
        templateId: template.id,
        providerId: "customer-router",
        modelId: "custom/tool-model",
        passedProbeIds: [
          "streaming",
          "context_window",
          "structured_json",
          "schema_output",
          "tool_use",
          "image_input",
          "latency",
          "error_shape",
          "reliability",
        ],
      }),
    });

    expect(passed).toMatchObject({
      schemaVersion: "ambient-model-provider-capability-eligibility-v1",
      eligibleAsMain: true,
      eligibleAsSubagent: true,
      mainBlockers: [],
      subagentBlockers: [],
    });
    expect(passed.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ probeId: "image_input", requiredForSubagent: true, status: "passed" }),
      expect.objectContaining({ probeId: "tool_use", requiredForSubagent: true, status: "passed" }),
      expect.objectContaining({ probeId: "reliability", requiredForMain: true, requiredForSubagent: true, status: "passed" }),
    ]));
    expect(modelRuntimeProfileWithCapabilityProbeEligibility(profile, passed)).toMatchObject({
      modelId: "custom/tool-model",
      available: true,
      selectableAsMain: true,
      selectableAsSubagent: true,
    });

    const failed = probeModelProviderCapabilityEligibility({
      template,
      profile,
      report: report({
        templateId: template.id,
        providerId: "customer-router",
        modelId: "custom/tool-model",
        passedProbeIds: ["streaming", "context_window", "latency", "error_shape", "reliability"],
        failedProbeIds: ["tool_use"],
      }),
    });
    const failedProfile = modelRuntimeProfileWithCapabilityProbeEligibility(profile, failed);

    expect(failed.eligibleAsMain).toBe(true);
    expect(failed.eligibleAsSubagent).toBe(false);
    expect(failed.subagentBlockers).toEqual(expect.arrayContaining([
      "Missing required capability probe: structured_json.",
      "Missing required capability probe: schema_output.",
      expect.stringContaining("Capability probe tool_use failed"),
      "Missing required capability probe: image_input.",
    ]));
    expect(failedProfile).toMatchObject({
      available: true,
      selectableAsMain: true,
      selectableAsSubagent: false,
    });
  });

  it("blocks local sub-agent eligibility without health, memory, and reliability evidence", () => {
    const template = modelProviderInstallTemplateById("local-text-runtime");
    if (!template) throw new Error("missing local-text-runtime template");
    const profile = {
      ...resolveAmbientModelRuntimeProfile("local/text-4b"),
      available: true,
      selectableAsMain: true,
      selectableAsSubagent: true,
      structuredOutput: "json-mode",
    } satisfies AmbientModelRuntimeProfile;

    const eligibility = probeModelProviderCapabilityEligibility({
      template,
      profile,
      report: report({
        templateId: template.id,
        providerId: AMBIENT_PROVIDER_LOCAL,
        modelId: "local/text-4b",
        passedProbeIds: ["streaming", "context_window", "structured_json", "latency", "error_shape"],
      }),
    });

    expect(eligibility.eligibleAsMain).toBe(false);
    expect(eligibility.eligibleAsSubagent).toBe(false);
    expect(eligibility.mainBlockers).toEqual(expect.arrayContaining([
      "Missing required capability probe: health.",
      "Missing required capability probe: local_memory.",
      "Missing required capability probe: reliability.",
    ]));
    expect(eligibility.subagentBlockers).toEqual(expect.arrayContaining([
      "Missing required capability probe: health.",
      "Missing required capability probe: local_memory.",
      "Missing required capability probe: reliability.",
    ]));
    expect(modelRuntimeProfileWithCapabilityProbeEligibility(profile, eligibility)).toMatchObject({
      available: false,
      selectableAsMain: false,
      selectableAsSubagent: false,
      unavailableReason: "Missing required capability probe: health.",
    });
  });

  it("rejects stale capability reports from another template, provider, or model id", () => {
    const template = modelProviderInstallTemplateById("generic-openai-compatible");
    if (!template) throw new Error("missing generic-openai-compatible template");
    const profile = customProfile({
      providerId: "customer-router",
      modelId: "custom/exact-model",
      toolUse: "ambient-tools",
      structuredOutput: "schema",
    });

    const eligibility = probeModelProviderCapabilityEligibility({
      template,
      profile,
      report: report({
        templateId: "generic-anthropic-compatible",
        providerId: "other-router",
        modelId: "custom/exact-model-normalized",
        passedProbeIds: [
          "streaming",
          "context_window",
          "structured_json",
          "schema_output",
          "tool_use",
          "latency",
          "error_shape",
        ],
      }),
    });

    expect(eligibility.eligibleAsMain).toBe(false);
    expect(eligibility.eligibleAsSubagent).toBe(false);
    expect(eligibility.subagentBlockers).toEqual(expect.arrayContaining([
      "Capability probe report template generic-anthropic-compatible does not match generic-openai-compatible.",
      "Capability probe report provider other-router does not match profile provider customer-router.",
      "Capability probe report model custom/exact-model-normalized does not match profile model custom/exact-model.",
    ]));
  });

  it("keeps Ambient known-provider probes compatible with the default profile", () => {
    const template = modelProviderInstallTemplateById("ambient-managed");
    if (!template) throw new Error("missing ambient-managed template");
    const profile = resolveAmbientModelRuntimeProfile(AMBIENT_DEFAULT_MODEL);
    const plan = buildModelProviderCapabilityProbePlan({
      template,
      modelId: AMBIENT_DEFAULT_MODEL,
      generatedAt: "2026-06-06T00:00:00.000Z",
    });
    const eligibility = probeModelProviderCapabilityEligibility({
      template,
      profile,
      report: report({
        templateId: template.id,
        providerId: AMBIENT_PROVIDER_AMBIENT,
        modelId: AMBIENT_DEFAULT_MODEL,
        passedProbeIds: plan.probeIds,
      }),
    });

    expect(eligibility.eligibleAsMain).toBe(true);
    expect(eligibility.eligibleAsSubagent).toBe(true);
    expect(eligibility.diagnostics.map((diagnostic) => diagnostic.probeId)).toEqual(expect.arrayContaining([
      "streaming",
      "context_window",
      "structured_json",
      "schema_output",
      "tool_use",
      "latency",
      "error_shape",
    ]));
  });
});

function customProfile(input: {
  providerId: string;
  modelId: string;
  supportsVision?: boolean;
  toolUse?: AmbientModelRuntimeProfile["toolUse"];
  structuredOutput?: AmbientModelRuntimeProfile["structuredOutput"];
}): AmbientModelRuntimeProfile {
  return {
    ...resolveAmbientModelRuntimeProfile(AMBIENT_DEFAULT_MODEL),
    profileId: `${input.providerId}:${input.modelId}`,
    providerId: input.providerId,
    modelId: input.modelId,
    label: input.modelId,
    costClass: "metered",
    trustClass: "user-configured",
    privacyLabel: "User configured provider",
    supportsVision: input.supportsVision ?? false,
    toolUse: input.toolUse ?? "none",
    structuredOutput: input.structuredOutput ?? "json-mode",
    providerQuirks: ["Configured through Settings provider onboarding."],
  };
}

function report(input: {
  templateId: string;
  providerId: string;
  modelId: string;
  passedProbeIds?: readonly ModelProviderCapabilityProbeId[];
  failedProbeIds?: readonly ModelProviderCapabilityProbeId[];
}): ModelProviderCapabilityProbeReport {
  return {
    schemaVersion: MODEL_PROVIDER_CAPABILITY_PROBE_SCHEMA_VERSION,
    templateId: input.templateId,
    providerId: input.providerId,
    modelId: input.modelId,
    generatedAt: "2026-06-06T00:00:00.000Z",
    observations: [
      ...(input.passedProbeIds ?? []).map((probeId) => observation(probeId, "passed")),
      ...(input.failedProbeIds ?? []).map((probeId) => observation(probeId, "failed")),
    ],
  };
}

function observation(
  probeId: ModelProviderCapabilityProbeId,
  status: ModelProviderCapabilityProbeObservation["status"],
): ModelProviderCapabilityProbeObservation {
  return {
    probeId,
    status,
    measuredAt: "2026-06-06T00:00:00.000Z",
    latencyMs: probeId === "latency" ? 250 : undefined,
    error: status === "failed" ? `${probeId} did not behave as required.` : undefined,
  };
}
