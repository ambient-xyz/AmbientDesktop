import {
  MODEL_PROVIDER_INSTALL_TEMPLATES,
  type ModelProviderCapabilityProbeId,
  type ModelProviderEndpointCompatibility,
  type ModelProviderInstallTemplate,
  type ModelProviderInstallTemplateKind,
  type ModelProviderSecretFlow,
} from "../../shared/modelProviderInstallTemplates";
import type { InstallModelProviderEndpointInput, SaveModelProviderCredentialInput } from "../../shared/types";
import type { ModelRuntimeCatalogTone } from "./modelRuntimeCatalogUiModel";

export interface ModelProviderOnboardingCard {
  id: string;
  label: string;
  providerId: string;
  secretFlow: ModelProviderSecretFlow;
  compatibility: ModelProviderEndpointCompatibility;
  endpointInstallable: boolean;
  kindLabel: string;
  compatibilityLabel: string;
  localityLabel: string;
  secretFlowLabel: string;
  endpointLabel: string;
  actionLabel: string;
  tone: ModelRuntimeCatalogTone;
  probeLabels: string[];
  requiredMainProbeLabels: string[];
  requiredSubagentProbeLabels: string[];
  safetyLabels: string[];
  notes: string[];
  searchText: string;
}

export interface ModelProviderOnboardingSettingsModel {
  statusLabel: string;
  summary: string;
  knownProviderCards: ModelProviderOnboardingCard[];
  genericEndpointCards: ModelProviderOnboardingCard[];
  localRuntimeCards: ModelProviderOnboardingCard[];
  cards: ModelProviderOnboardingCard[];
  searchText: string;
}

export interface ModelProviderEndpointInstallDraft {
  templateId: string;
  providerId: string;
  providerLabel: string;
  modelId: string;
  modelLabel: string;
  baseUrl: string;
  managedSecretRef: string;
  credentialLabel: string;
  reliabilitySampleCount: number;
  enabled: boolean;
}

export interface ModelProviderEndpointInstallDraftModel {
  templateId: string;
  templateLabel: string;
  canInstall: boolean;
  actionLabel: string;
  statusLabel: string;
  validationRows: string[];
  input?: InstallModelProviderEndpointInput;
  searchText: string;
}

export interface ModelProviderCredentialSaveDraftModel {
  canSave: boolean;
  actionLabel: string;
  statusLabel: string;
  validationRows: string[];
  searchText: string;
}

export function emptyModelProviderEndpointInstallDraft(templateId = "generic-openai-compatible"): ModelProviderEndpointInstallDraft {
  return {
    templateId,
    providerId: "",
    providerLabel: "",
    modelId: "",
    modelLabel: "",
    baseUrl: "",
    managedSecretRef: "",
    credentialLabel: "Desktop secret request",
    reliabilitySampleCount: 2,
    enabled: true,
  };
}

export function modelProviderOnboardingSettingsModel(
  templates: readonly ModelProviderInstallTemplate[] = MODEL_PROVIDER_INSTALL_TEMPLATES,
): ModelProviderOnboardingSettingsModel {
  const cards = templates.map(modelProviderOnboardingCard);
  const knownProviderCards = cards.filter((card) => card.kindLabel === "Known provider");
  const genericEndpointCards = cards.filter((card) => card.kindLabel.startsWith("Generic "));
  const localRuntimeCards = cards.filter((card) => card.kindLabel === "Local runtime");
  const statusLabel = `${cards.length} provider template${cards.length === 1 ? "" : "s"}`;
  const summary = `${knownProviderCards.length} known / ${genericEndpointCards.length} generic / ${localRuntimeCards.length} local`;
  const searchText = [
    statusLabel,
    summary,
    cards.map((card) => card.searchText).join(" "),
  ].join(" ");
  return {
    statusLabel,
    summary,
    knownProviderCards,
    genericEndpointCards,
    localRuntimeCards,
    cards,
    searchText,
  };
}

export function modelProviderEndpointInstallDraftModel(
  draft: ModelProviderEndpointInstallDraft,
  templates: readonly ModelProviderInstallTemplate[] = MODEL_PROVIDER_INSTALL_TEMPLATES,
): ModelProviderEndpointInstallDraftModel {
  const template = templates.find((candidate) => candidate.id === draft.templateId);
  const validationRows: string[] = [];
  if (!template) {
    validationRows.push("Choose a provider template.");
  } else {
    if (template.compatibility === "local-text") validationRows.push("Local runtime templates use local runtime onboarding.");
    if (template.secretFlow !== "ambient_cli_secret_request" && template.secretFlow !== "ambient_cli_env_bind") {
      validationRows.push("This template does not use a user-managed endpoint credential.");
    }
  }
  const modelId = draft.modelId.trim();
  const baseUrl = draft.baseUrl.trim();
  const managedSecretRef = draft.managedSecretRef.trim();
  const providerId = draft.providerId.trim();
  const providerLabel = draft.providerLabel.trim();
  const modelLabel = draft.modelLabel.trim();
  const credentialLabel = draft.credentialLabel.trim();
  const reliabilitySampleCount = Math.max(1, Math.min(10, Math.round(draft.reliabilitySampleCount || 1)));
  if (!modelId) validationRows.push("Enter the exact model ID to probe.");
  if (!baseUrl) validationRows.push("Enter the endpoint base URL.");
  if (baseUrl && !/^https?:\/\//i.test(baseUrl)) validationRows.push("Endpoint base URL must start with http:// or https://.");
  if (!managedSecretRef) validationRows.push("Choose an Ambient-managed credential reference.");
  if (managedSecretRef && !/^ambient-secret-ref:v1:[a-f0-9]{64}$/.test(managedSecretRef)) {
    validationRows.push("Credential reference must be an Ambient-managed secret ref.");
  }

  const input = template && validationRows.length === 0
    ? {
        templateId: template.id,
        ...(providerId ? { providerId } : {}),
        ...(providerLabel ? { providerLabel } : {}),
        modelId,
        ...(modelLabel ? { modelLabel } : {}),
        baseUrl,
        credentialRef: {
          flow: template.secretFlow as "ambient_cli_secret_request" | "ambient_cli_env_bind",
          managedSecretRef,
          ...(credentialLabel ? { label: credentialLabel } : {}),
        },
        reliabilitySampleCount,
        enabled: draft.enabled,
      } satisfies InstallModelProviderEndpointInput
    : undefined;
  const templateLabel = template?.label ?? "Unknown provider template";
  const statusLabel = validationRows.length
    ? `${validationRows.length} required field${validationRows.length === 1 ? "" : "s"}`
    : "Ready to probe";
  const searchText = [
    templateLabel,
    draft.templateId,
    providerId,
    providerLabel,
    modelId,
    modelLabel,
    baseUrl,
    statusLabel,
    validationRows.join(" "),
    "managed credential ref",
    "Probe endpoint before eligibility",
  ].join(" ");
  return {
    templateId: draft.templateId,
    templateLabel,
    canInstall: Boolean(input),
    actionLabel: "Probe endpoint",
    statusLabel,
    validationRows,
    ...(input ? { input } : {}),
    searchText,
  };
}

export function modelProviderCredentialSaveDraftModel(
  draft: ModelProviderEndpointInstallDraft,
  credentialValue: string,
  templates: readonly ModelProviderInstallTemplate[] = MODEL_PROVIDER_INSTALL_TEMPLATES,
): ModelProviderCredentialSaveDraftModel {
  const validationRows = modelProviderCredentialSaveValidationRows(draft, credentialValue, templates);
  const template = templates.find((candidate) => candidate.id === draft.templateId);
  const statusLabel = validationRows.length
    ? `${validationRows.length} required field${validationRows.length === 1 ? "" : "s"}`
    : "Ready to save";
  const searchText = [
    template?.label ?? "Unknown provider template",
    draft.templateId,
    draft.providerId,
    draft.modelId,
    draft.baseUrl,
    statusLabel,
    validationRows.join(" "),
    "Ambient-managed credential",
    "Save credential",
  ].join(" ");
  return {
    canSave: validationRows.length === 0,
    actionLabel: "Save credential",
    statusLabel,
    validationRows,
    searchText,
  };
}

export function modelProviderCredentialSaveInputFromDraft(
  draft: ModelProviderEndpointInstallDraft,
  credentialValue: string,
  templates: readonly ModelProviderInstallTemplate[] = MODEL_PROVIDER_INSTALL_TEMPLATES,
): SaveModelProviderCredentialInput | undefined {
  if (modelProviderCredentialSaveValidationRows(draft, credentialValue, templates).length > 0) return undefined;
  const template = templates.find((candidate) => candidate.id === draft.templateId);
  if (!template) return undefined;
  const providerId = draft.providerId.trim();
  const credentialLabel = draft.credentialLabel.trim();
  return {
    templateId: template.id,
    ...(providerId ? { providerId } : {}),
    modelId: draft.modelId.trim(),
    baseUrl: draft.baseUrl.trim(),
    ...(credentialLabel ? { label: credentialLabel } : {}),
    value: credentialValue,
  };
}

function modelProviderCredentialSaveValidationRows(
  draft: ModelProviderEndpointInstallDraft,
  credentialValue: string,
  templates: readonly ModelProviderInstallTemplate[],
): string[] {
  const template = templates.find((candidate) => candidate.id === draft.templateId);
  const validationRows: string[] = [];
  if (!template) {
    validationRows.push("Choose a provider template.");
  } else {
    if (template.compatibility === "local-text" || template.secretFlow === "none") validationRows.push("Local runtime templates do not need endpoint credentials.");
    if (template.secretFlow === "ambient-managed") validationRows.push("Ambient-managed templates do not accept user credentials.");
    if (template.secretFlow !== "ambient_cli_secret_request" && template.secretFlow !== "ambient_cli_env_bind" && template.secretFlow !== "ambient-managed" && template.secretFlow !== "none") {
      validationRows.push("This template does not use a supported Ambient-managed credential flow.");
    }
  }
  const modelId = draft.modelId.trim();
  const baseUrl = draft.baseUrl.trim();
  if (!modelId) validationRows.push("Enter the exact model ID to probe.");
  if (!baseUrl) validationRows.push("Enter the endpoint base URL.");
  if (baseUrl && !/^https?:\/\//i.test(baseUrl)) validationRows.push("Endpoint base URL must start with http:// or https://.");
  if (!credentialValue.trim()) validationRows.push("Enter the endpoint credential in Settings.");
  return validationRows;
}

function modelProviderOnboardingCard(template: ModelProviderInstallTemplate): ModelProviderOnboardingCard {
  const kindLabel = templateKindLabel(template.kind);
  const compatibilityLabel = endpointCompatibilityLabel(template.compatibility);
  const localityLabel = template.locality === "local" ? "Local" : "Cloud";
  const secretFlowLabel = modelProviderSecretFlowLabel(template.secretFlow);
  const endpointLabel = template.endpointBaseUrlRequired ? "Endpoint URL required" : "Managed endpoint";
  const probeLabels = template.defaultProbeIds.map(capabilityProbeLabel);
  const requiredMainProbeLabels = template.requiredProbeIdsForMain.map(capabilityProbeLabel);
  const requiredSubagentProbeLabels = template.requiredProbeIdsForSubagent.map(capabilityProbeLabel);
  const endpointInstallable = template.compatibility !== "local-text" && (
    template.secretFlow === "ambient_cli_secret_request" ||
    template.secretFlow === "ambient_cli_env_bind"
  );
  const safetyLabels = [
    "Real capability probes",
    template.secretFlow === "ambient_cli_secret_request" || template.secretFlow === "ambient_cli_env_bind"
      ? "No chat secrets"
      : template.secretFlow === "none"
        ? "No secret required"
        : "Ambient-managed secret",
    template.locality === "local" ? "Memory gated" : "Provider gated",
  ];
  const actionLabel = template.kind === "local_runtime"
    ? "Probe health and memory before eligibility"
    : "Probe endpoint before eligibility";
  const tone: ModelRuntimeCatalogTone = template.kind === "local_runtime" ? "warning" : "info";
  const searchText = [
    template.id,
    template.label,
    template.providerId,
    kindLabel,
    compatibilityLabel,
    localityLabel,
    secretFlowLabel,
    endpointLabel,
    actionLabel,
    probeLabels.join(" "),
    requiredMainProbeLabels.join(" "),
    requiredSubagentProbeLabels.join(" "),
    safetyLabels.join(" "),
    template.notes.join(" "),
  ].join(" ");

  return {
    id: template.id,
    label: template.label,
    providerId: template.providerId,
    secretFlow: template.secretFlow,
    compatibility: template.compatibility,
    endpointInstallable,
    kindLabel,
    compatibilityLabel,
    localityLabel,
    secretFlowLabel,
    endpointLabel,
    actionLabel,
    tone,
    probeLabels,
    requiredMainProbeLabels,
    requiredSubagentProbeLabels,
    safetyLabels,
    notes: [...template.notes],
    searchText,
  };
}

function templateKindLabel(kind: ModelProviderInstallTemplateKind): string {
  if (kind === "known_provider") return "Known provider";
  if (kind === "generic_openai_compatible") return "Generic OpenAI-compatible";
  if (kind === "generic_anthropic_compatible") return "Generic Anthropic-compatible";
  return "Local runtime";
}

function endpointCompatibilityLabel(compatibility: ModelProviderEndpointCompatibility): string {
  if (compatibility === "ambient-compatible") return "Ambient-compatible endpoint";
  if (compatibility === "openai-compatible") return "OpenAI-compatible endpoint";
  if (compatibility === "anthropic-compatible") return "Anthropic-compatible endpoint";
  return "Local text endpoint";
}

function modelProviderSecretFlowLabel(secretFlow: ModelProviderSecretFlow): string {
  if (secretFlow === "ambient-managed") return "Ambient-managed secret";
  if (secretFlow === "ambient_cli_secret_request") return "Desktop secret request";
  if (secretFlow === "ambient_cli_env_bind") return "Ignored env-bound secret file";
  return "No secret";
}

function capabilityProbeLabel(probeId: ModelProviderCapabilityProbeId): string {
  if (probeId === "context_window") return "Context window";
  if (probeId === "structured_json") return "Structured JSON";
  if (probeId === "schema_output") return "Schema output";
  if (probeId === "tool_use") return "Tool use";
  if (probeId === "image_input") return "Image input";
  if (probeId === "error_shape") return "Error shape";
  if (probeId === "local_memory") return "Local memory";
  return capitalize(probeId);
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
