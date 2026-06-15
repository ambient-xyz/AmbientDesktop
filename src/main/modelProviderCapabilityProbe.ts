import type {
  AmbientModelRuntimeProfile,
  AmbientModelStructuredOutputSupport,
  AmbientModelToolUseSupport,
} from "../shared/ambientModels";
import {
  MODEL_PROVIDER_CAPABILITY_ELIGIBILITY_SCHEMA_VERSION,
  MODEL_PROVIDER_CAPABILITY_PROBE_SCHEMA_VERSION,
  type ModelProviderCapabilityDiagnostic,
  type ModelProviderCapabilityEligibility,
  type ModelProviderCapabilityProbeId,
  type ModelProviderCapabilityProbeObservation,
  type ModelProviderCapabilityProbeReport,
  type ModelProviderInstallTemplate,
} from "../shared/modelProviderInstallTemplates";

export {
  buildModelProviderCapabilityProbePlan,
  MODEL_PROVIDER_CAPABILITY_ELIGIBILITY_SCHEMA_VERSION,
  MODEL_PROVIDER_CAPABILITY_PROBE_SCHEMA_VERSION,
  MODEL_PROVIDER_INSTALL_TEMPLATE_SCHEMA_VERSION,
  MODEL_PROVIDER_INSTALL_TEMPLATES,
  modelProviderInstallTemplateById,
  modelProviderInstallTemplatesForProvider,
  providerDescriptorFromInstallTemplate,
} from "../shared/modelProviderInstallTemplates";
export type {
  ModelProviderCapabilityDiagnostic,
  ModelProviderCapabilityEligibility,
  ModelProviderCapabilityProbeId,
  ModelProviderCapabilityProbeObservation,
  ModelProviderCapabilityProbePlan,
  ModelProviderCapabilityProbeReport,
  ModelProviderCapabilityProbeStatus,
  ModelProviderEndpointCompatibility,
  ModelProviderInstallTemplate,
  ModelProviderInstallTemplateKind,
  ModelProviderSecretFlow,
} from "../shared/modelProviderInstallTemplates";

export function probeModelProviderCapabilityEligibility(input: {
  template: ModelProviderInstallTemplate;
  profile: AmbientModelRuntimeProfile;
  report: ModelProviderCapabilityProbeReport;
}): ModelProviderCapabilityEligibility {
  const requiredForMain = requiredMainProbeIds(input.template);
  const requiredForSubagent = requiredSubagentProbeIds(input.template, input.profile);
  const allProbeIds = uniqueProbeIds([
    ...input.template.defaultProbeIds,
    ...requiredForMain,
    ...requiredForSubagent,
    ...input.report.observations.map((observation) => observation.probeId),
  ]);
  const observationById = new Map(input.report.observations.map((observation) => [observation.probeId, observation]));
  const diagnostics = allProbeIds.map((probeId) => capabilityDiagnostic({
    probeId,
    observation: observationById.get(probeId),
    requiredForMain: requiredForMain.includes(probeId),
    requiredForSubagent: requiredForSubagent.includes(probeId),
  }));
  const identityBlockers = probeIdentityBlockers(input);
  const mainBlockers = [
    ...identityBlockers,
    ...blockersForRequiredProbes(diagnostics, "main"),
  ];
  const subagentBlockers = [
    ...identityBlockers,
    ...blockersForRequiredProbes(diagnostics, "subagent"),
  ];
  const warnings = diagnostics
    .filter((diagnostic) => !diagnostic.requiredForMain && !diagnostic.requiredForSubagent && diagnostic.status !== "passed")
    .map((diagnostic) => diagnostic.message);

  return {
    schemaVersion: MODEL_PROVIDER_CAPABILITY_ELIGIBILITY_SCHEMA_VERSION,
    providerId: input.report.providerId,
    modelId: input.report.modelId,
    templateId: input.template.id,
    eligibleAsMain: mainBlockers.length === 0,
    eligibleAsSubagent: subagentBlockers.length === 0,
    mainBlockers,
    subagentBlockers,
    warnings,
    diagnostics,
  };
}

function probeIdentityBlockers(input: {
  template: ModelProviderInstallTemplate;
  profile: AmbientModelRuntimeProfile;
  report: ModelProviderCapabilityProbeReport;
}): string[] {
  const blockers: string[] = [];
  if (input.report.schemaVersion !== MODEL_PROVIDER_CAPABILITY_PROBE_SCHEMA_VERSION) {
    blockers.push(`Capability probe report schema version is not ${MODEL_PROVIDER_CAPABILITY_PROBE_SCHEMA_VERSION}.`);
  }
  if (input.report.templateId !== input.template.id) {
    blockers.push(`Capability probe report template ${input.report.templateId} does not match ${input.template.id}.`);
  }
  if (input.report.providerId !== input.profile.providerId) {
    blockers.push(`Capability probe report provider ${input.report.providerId} does not match profile provider ${input.profile.providerId}.`);
  }
  if (input.report.modelId !== input.profile.modelId) {
    blockers.push(`Capability probe report model ${input.report.modelId} does not match profile model ${input.profile.modelId}.`);
  }
  return blockers;
}

export function modelRuntimeProfileWithCapabilityProbeEligibility(
  profile: AmbientModelRuntimeProfile,
  eligibility: ModelProviderCapabilityEligibility,
): AmbientModelRuntimeProfile {
  const selectableAsMain = profile.selectableAsMain && eligibility.eligibleAsMain;
  const selectableAsSubagent = profile.selectableAsSubagent && eligibility.eligibleAsSubagent;
  const available = selectableAsMain || selectableAsSubagent;
  return {
    ...profile,
    selectableAsMain,
    selectableAsSubagent,
    available,
    ...(!available
      ? { unavailableReason: firstBlocker(eligibility) ?? "Model capability probes did not prove eligibility." }
      : { unavailableReason: undefined }),
    providerQuirks: [
      ...profile.providerQuirks,
      eligibility.eligibleAsSubagent
        ? "Capability probes proved sub-agent eligibility for this provider/model profile."
        : `Capability probes did not prove sub-agent eligibility: ${eligibility.subagentBlockers.join(" ") || "no sub-agent eligibility requested."}`,
    ],
  };
}

function requiredMainProbeIds(template: ModelProviderInstallTemplate): ModelProviderCapabilityProbeId[] {
  return uniqueProbeIds(template.requiredProbeIdsForMain);
}

function requiredSubagentProbeIds(
  template: ModelProviderInstallTemplate,
  profile: AmbientModelRuntimeProfile,
): ModelProviderCapabilityProbeId[] {
  return uniqueProbeIds([
    ...template.requiredProbeIdsForSubagent,
    ...structuredOutputProbeIds(profile.structuredOutput),
    ...toolUseProbeIds(profile.toolUse),
    ...(profile.supportsVision ? ["image_input" as const] : []),
    ...(profile.locality === "local" ? ["health" as const, "local_memory" as const, "reliability" as const] : []),
  ]);
}

function structuredOutputProbeIds(structuredOutput: AmbientModelStructuredOutputSupport): ModelProviderCapabilityProbeId[] {
  if (structuredOutput === "schema") return ["structured_json", "schema_output"];
  if (structuredOutput === "json-mode") return ["structured_json"];
  return [];
}

function toolUseProbeIds(toolUse: AmbientModelToolUseSupport): ModelProviderCapabilityProbeId[] {
  return toolUse === "none" ? [] : ["tool_use"];
}

function capabilityDiagnostic(input: {
  probeId: ModelProviderCapabilityProbeId;
  observation?: ModelProviderCapabilityProbeObservation;
  requiredForMain: boolean;
  requiredForSubagent: boolean;
}): ModelProviderCapabilityDiagnostic {
  const status = input.observation?.status ?? "missing";
  return {
    probeId: input.probeId,
    requiredForMain: input.requiredForMain,
    requiredForSubagent: input.requiredForSubagent,
    status,
    message: capabilityDiagnosticMessage(input.probeId, status, input.observation),
  };
}

function capabilityDiagnosticMessage(
  probeId: ModelProviderCapabilityProbeId,
  status: ModelProviderCapabilityDiagnostic["status"],
  observation?: ModelProviderCapabilityProbeObservation,
): string {
  if (status === "passed") return `Capability probe ${probeId} passed.`;
  if (status === "missing") return `Missing required capability probe: ${probeId}.`;
  if (status === "failed") return `Capability probe ${probeId} failed${observation?.error ? `: ${observation.error}` : "."}`;
  if (status === "skipped") return `Capability probe ${probeId} was skipped.`;
  return `Capability probe ${probeId} is unknown.`;
}

function blockersForRequiredProbes(
  diagnostics: readonly ModelProviderCapabilityDiagnostic[],
  scope: "main" | "subagent",
): string[] {
  return diagnostics
    .filter((diagnostic) => scope === "main" ? diagnostic.requiredForMain : diagnostic.requiredForSubagent)
    .filter((diagnostic) => diagnostic.status !== "passed")
    .map((diagnostic) => diagnostic.message);
}

function firstBlocker(eligibility: ModelProviderCapabilityEligibility): string | undefined {
  return eligibility.subagentBlockers[0] ?? eligibility.mainBlockers[0];
}

function uniqueProbeIds(ids: readonly ModelProviderCapabilityProbeId[]): ModelProviderCapabilityProbeId[] {
  return [...new Set(ids)];
}
