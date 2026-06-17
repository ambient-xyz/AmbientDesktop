import type {
  MessagingBindingDescriptor,
  MessagingBindingListResult,
  MessagingBindingPurpose,
  MessagingGatewayProviderReadiness,
  MessagingGatewayProviderSessionReadiness,
  MessagingGatewayRuntimeStatus,
  MessagingProviderDescriptor,
} from "../../shared/messagingGateway";
import {
  messagingConversationDirectoryMetadataContract,
  type MessagingConversationDirectoryMetadataContract,
} from "./messagingConversationDirectoryContract";
import {
  createDefaultMessagingConversationDirectoryAdapterRegistry,
  type MessagingConversationDirectoryAdapterKind,
  type MessagingConversationDirectoryAdapterPlan,
  type MessagingConversationDirectoryAdapterRegistry,
  type MessagingConversationDirectoryAdapterSafety,
  type MessagingConversationDirectoryAdapterStatus,
} from "./messagingConversationDirectoryAdapters";

export type MessagingConversationDirectoryStatus = "ready" | "limited" | "blocked";

export type MessagingConversationDirectoryMode =
  | "provider-directory"
  | "existing-bindings-only"
  | "planned";

export interface MessagingConversationDirectoryInput {
  providerId?: string;
  authProfileId?: string;
  purpose?: MessagingBindingPurpose;
  includeInactive: boolean;
  limit: number;
}

export interface MessagingConversationDirectoryKnownConversation {
  conversationId: string;
  threadId?: string;
  authProfileId: string;
  bindingId: string;
  purpose: MessagingBindingPurpose;
  status: MessagingBindingDescriptor["status"];
  ambientSurface?: MessagingBindingDescriptor["ambientSurface"];
  ownerUserId?: string;
  maxDisclosureLabel?: string;
}

export interface MessagingConversationDirectoryAuthProfile {
  profileId: string;
  metadataReadable: boolean;
  tdlibStateDirPresent: boolean;
  phoneNumberPresent: boolean;
  databaseEncryptionKeyPresent: boolean;
}

export interface MessagingConversationDirectoryProviderPreview {
  providerId: string;
  providerLabel: string;
  status: MessagingConversationDirectoryStatus;
  mode: MessagingConversationDirectoryMode;
  implementationStatus: MessagingProviderDescriptor["implementation"]["status"];
  purposeSupported: boolean;
  conversationDiscoveryDeclared: boolean;
  canListProviderConversationsNow: boolean;
  directoryAdapterStatus: MessagingConversationDirectoryAdapterStatus | "missing";
  directoryAdapterKind?: MessagingConversationDirectoryAdapterKind;
  directoryAdapterRequiresApproval: boolean;
  directoryAdapterCanApplyWithReadiness: boolean;
  directoryAdapterSafety?: MessagingConversationDirectoryAdapterSafety;
  providerDirectoryTool?: string;
  providerDirectoryApplyTool?: string;
  bindingPreviewTool?: string;
  bindingApplyTool?: string;
  metadataOnlyContract: MessagingConversationDirectoryMetadataContract;
  readinessStatus?: MessagingGatewayProviderReadiness["status"];
  bridgeReachable?: boolean;
  configured?: boolean;
  knownAuthProfiles: MessagingConversationDirectoryAuthProfile[];
  knownConversations: MessagingConversationDirectoryKnownConversation[];
  blockers: string[];
  warnings: string[];
  policyNotes: string[];
  nextSteps: string[];
}

export interface MessagingConversationDirectoryPreview {
  status: MessagingConversationDirectoryStatus;
  providerCount: number;
  providers: MessagingConversationDirectoryProviderPreview[];
  filters: MessagingConversationDirectoryInput;
  safety: {
    startsBridge: false;
    readsProviderMessages: false;
    readsProviderHistory: false;
    sendsProviderMessages: false;
    mutatesBindings: false;
  };
}

export interface MessagingConversationDirectoryProviderRegistryLike {
  get(providerId: string): { descriptor: MessagingProviderDescriptor } | undefined;
  descriptors(): MessagingProviderDescriptor[];
}

export function messagingConversationDirectoryInput(params: unknown): MessagingConversationDirectoryInput {
  const raw = params as Record<string, unknown> | undefined;
  const purpose = optionalString(raw?.purpose);
  if (purpose && purpose !== "remote_ambient_surface" && purpose !== "messaging_connector") {
    throw new Error("purpose must be remote_ambient_surface or messaging_connector when supplied.");
  }
  const limitValue = typeof raw?.limit === "number" ? raw.limit : 10;
  return {
    providerId: optionalString(raw?.providerId),
    authProfileId: optionalString(raw?.authProfileId) ?? optionalString(raw?.profileId),
    purpose: purpose as MessagingBindingPurpose | undefined,
    includeInactive: raw?.includeInactive === true,
    limit: Math.max(1, Math.min(25, Math.floor(limitValue))),
  };
}

export function buildMessagingConversationDirectoryPreview(input: {
  toolInput: MessagingConversationDirectoryInput;
  providers: MessagingConversationDirectoryProviderRegistryLike;
  directoryAdapters?: MessagingConversationDirectoryAdapterRegistry;
  bindings: MessagingBindingListResult;
  runtimeStatus?: MessagingGatewayRuntimeStatus;
}): MessagingConversationDirectoryPreview {
  const providerDescriptors = input.toolInput.providerId
    ? [providerDescriptor(input.providers, input.toolInput.providerId)]
    : input.providers.descriptors();
  const purpose = input.toolInput.purpose ?? "remote_ambient_surface";
  const directoryAdapters = input.directoryAdapters ?? createDefaultMessagingConversationDirectoryAdapterRegistry();
  const adapterPlans = directoryAdapters.plansForDescriptors({
    descriptors: providerDescriptors,
    purpose,
    runtimeStatus: input.runtimeStatus,
  });
  const providers = providerDescriptors.map((descriptor) => providerDirectoryPreview({
    descriptor,
    toolInput: input.toolInput,
    bindings: input.bindings,
    runtimeStatus: input.runtimeStatus,
    adapterPlan: adapterPlans.get(descriptor.providerId),
  }));
  return {
    status: aggregateStatus(providers),
    providerCount: providers.length,
    providers,
    filters: input.toolInput,
    safety: {
      startsBridge: false,
      readsProviderMessages: false,
      readsProviderHistory: false,
      sendsProviderMessages: false,
      mutatesBindings: false,
    },
  };
}

export function messagingConversationDirectoryPreviewText(preview: MessagingConversationDirectoryPreview): string {
  const lines = [
    `Ambient messaging conversation directory preview: ${preview.status}`,
    `Providers: ${preview.providerCount}`,
    preview.filters.providerId ? `Provider filter: ${preview.filters.providerId}` : undefined,
    preview.filters.authProfileId ? `Profile filter: ${preview.filters.authProfileId}` : undefined,
    preview.filters.purpose ? `Purpose filter: ${preview.filters.purpose}` : undefined,
    `Include inactive bindings: ${preview.filters.includeInactive ? "yes" : "no"}`,
    `Limit: ${preview.filters.limit}`,
    "",
    "Safety:",
    "- Starts bridge: no",
    "- Reads provider messages: no",
    "- Reads provider history: no",
    "- Sends provider messages: no",
    "- Mutates bindings: no",
  ].filter((line): line is string => line !== undefined);
  for (const provider of preview.providers) {
    lines.push(
      "",
      `Provider: ${provider.providerLabel} (${provider.providerId})`,
      `Status: ${provider.status}`,
      `Directory mode: ${provider.mode}`,
      `Implementation: ${provider.implementationStatus}`,
      `Purpose support: ${provider.purposeSupported ? "yes" : "no"}`,
      `Conversation discovery declared: ${provider.conversationDiscoveryDeclared ? "yes" : "no"}`,
      `Can list provider conversations now: ${provider.canListProviderConversationsNow ? "yes" : "no"}`,
      `Directory adapter: ${provider.directoryAdapterStatus}${provider.directoryAdapterKind ? ` (${provider.directoryAdapterKind})` : ""}`,
      `Directory adapter readiness: ${provider.directoryAdapterCanApplyWithReadiness ? "ready" : "blocked"}`,
      `Directory apply approval: ${provider.directoryAdapterRequiresApproval ? "required" : "not required"}`,
      provider.providerDirectoryTool ? `Provider directory tool: ${provider.providerDirectoryTool}` : "Provider directory tool: none",
      provider.providerDirectoryApplyTool ? `Provider directory apply tool: ${provider.providerDirectoryApplyTool}` : "Provider directory apply tool: none",
      `Metadata-only contract: ${provider.metadataOnlyContract.kind}`,
      `Allowed result fields: ${provider.metadataOnlyContract.allowedFields.join(", ")}`,
      `Forbidden payload fields fail closed: ${provider.metadataOnlyContract.forbiddenPayloadFields.join(", ")}`,
      provider.readinessStatus ? `Readiness: ${provider.readinessStatus}` : "Readiness: not refreshed",
      `Known auth profiles: ${provider.knownAuthProfiles.length}`,
    );
    if (provider.bindingPreviewTool) lines.push(`Binding preview tool: ${provider.bindingPreviewTool}`);
    if (provider.bindingApplyTool) lines.push(`Binding apply tool: ${provider.bindingApplyTool}`);
    if (provider.directoryAdapterSafety) {
      lines.push(
        "Directory adapter safety:",
        `- Starts bridge: ${provider.directoryAdapterSafety.startsBridge ? "yes" : "no"}`,
        `- Runs provider CLI: ${provider.directoryAdapterSafety.runsProviderCli ? "yes" : "no"}`,
        `- Inspects provider desktop: ${provider.directoryAdapterSafety.inspectsProviderDesktop ? "yes" : "no"}`,
        `- Reads provider messages: ${provider.directoryAdapterSafety.readsProviderMessages ? "yes" : "no"}`,
        `- Reads provider history: ${provider.directoryAdapterSafety.readsProviderHistory ? "yes" : "no"}`,
        `- Sends provider messages: ${provider.directoryAdapterSafety.sendsProviderMessages ? "yes" : "no"}`,
        `- Mutates bindings: ${provider.directoryAdapterSafety.mutatesBindings ? "yes" : "no"}`,
      );
    }
    if (typeof provider.configured === "boolean") lines.push(`Configured: ${provider.configured ? "yes" : "no"}`);
    if (typeof provider.bridgeReachable === "boolean") lines.push(`Bridge reachable: ${provider.bridgeReachable ? "yes" : "no"}`);
    for (const profile of provider.knownAuthProfiles) {
      lines.push(
        `- ${profile.profileId}: metadata=${profile.metadataReadable ? "readable" : "unreadable"}, stateDir=${profile.tdlibStateDirPresent ? "present" : "missing"}, key=${profile.databaseEncryptionKeyPresent ? "present" : "missing"}, phoneMarker=${profile.phoneNumberPresent ? "present" : "missing"}`,
      );
    }
    lines.push(`Known conversations from bindings: ${provider.knownConversations.length}`);
    for (const conversation of provider.knownConversations) {
      lines.push(
        `- ${conversation.conversationId}${conversation.threadId ? ` / ${conversation.threadId}` : ""}: binding=${conversation.bindingId}, profile=${conversation.authProfileId}, purpose=${conversation.purpose}, status=${conversation.status}${conversation.ambientSurface ? `, surface=${conversation.ambientSurface}` : ""}`,
      );
    }
    lines.push(
      "",
      "Blockers:",
      ...(provider.blockers.length ? provider.blockers.map((blocker) => `- ${blocker}`) : ["- None"]),
      "",
      "Warnings:",
      ...(provider.warnings.length ? provider.warnings.map((warning) => `- ${warning}`) : ["- None"]),
      "",
      "Policy notes:",
      ...provider.policyNotes.map((note) => `- ${note}`),
      "",
      "Next steps:",
      ...provider.nextSteps.map((step) => `- ${step}`),
    );
  }
  return lines.join("\n");
}

function providerDirectoryPreview(input: {
  descriptor: MessagingProviderDescriptor;
  toolInput: MessagingConversationDirectoryInput;
  bindings: MessagingBindingListResult;
  runtimeStatus?: MessagingGatewayRuntimeStatus;
  adapterPlan?: MessagingConversationDirectoryAdapterPlan;
}): MessagingConversationDirectoryProviderPreview {
  const descriptor = input.descriptor;
  const purpose = input.toolInput.purpose ?? "remote_ambient_surface";
  const runtimeProvider = input.runtimeStatus?.providers.find((provider) => provider.providerId === descriptor.providerId);
  const readiness = runtimeProvider?.readiness;
  const adapterPlan = input.adapterPlan;
  const knownConversations = knownConversationsFromBindings({
    providerId: descriptor.providerId,
    authProfileId: input.toolInput.authProfileId,
    purpose: input.toolInput.purpose,
    bindings: input.bindings,
    limit: input.toolInput.limit,
  });
  const knownAuthProfiles = knownAuthProfilesFromReadiness(readiness, input.toolInput.authProfileId, input.toolInput.limit);
  const blockers = implementationBlockers(descriptor, purpose);
  if (!adapterPlan) {
    blockers.push(`No reviewed provider conversation-directory adapter is registered for ${descriptor.providerId}.`);
  } else {
    blockers.push(...adapterPlan.readinessBlockers);
  }
  const canListProviderConversationsNow = Boolean(
    adapterPlan
      && adapterPlan.status === "available"
      && adapterPlan.canApplyWithReadiness
      && !blockers.length,
  );
  const mode: MessagingConversationDirectoryMode = canListProviderConversationsNow
    ? "provider-directory"
    : descriptor.implementation.status === "planned" || adapterPlan?.status === "blocked"
    ? "planned"
    : "existing-bindings-only";
  const status: MessagingConversationDirectoryStatus = canListProviderConversationsNow
    ? "ready"
    : descriptor.implementation.status === "planned" || !descriptor.purposeSupport[purpose]
    ? "blocked"
    : "limited";
  return {
    providerId: descriptor.providerId,
    providerLabel: descriptor.label,
    status,
    mode,
    implementationStatus: descriptor.implementation.status,
    purposeSupported: descriptor.purposeSupport[purpose],
    conversationDiscoveryDeclared: descriptor.capabilities.conversationDiscovery,
    canListProviderConversationsNow,
    directoryAdapterStatus: adapterPlan?.status ?? "missing",
    directoryAdapterKind: adapterPlan?.kind,
    directoryAdapterRequiresApproval: adapterPlan?.requiresApprovalForApply ?? false,
    directoryAdapterCanApplyWithReadiness: adapterPlan?.canApplyWithReadiness ?? false,
    directoryAdapterSafety: adapterPlan?.safety,
    providerDirectoryTool: adapterPlan?.previewToolName,
    providerDirectoryApplyTool: adapterPlan?.applyToolName,
    ...bindingTools(descriptor, purpose),
    metadataOnlyContract: adapterPlan?.metadataOnlyContract ?? messagingConversationDirectoryMetadataContract(),
    readinessStatus: readiness?.status,
    bridgeReachable: readiness?.bridgeReachable,
    configured: readiness?.configured,
    knownAuthProfiles,
    knownConversations,
    blockers,
    warnings: warningsForProvider(descriptor, knownConversations, readiness, adapterPlan),
    policyNotes: policyNotesForProvider(descriptor, adapterPlan),
    nextSteps: nextStepsForProvider(descriptor, purpose, knownConversations, readiness, canListProviderConversationsNow, adapterPlan),
  };
}

function providerDescriptor(
  providers: MessagingConversationDirectoryProviderRegistryLike,
  providerId: string,
): MessagingProviderDescriptor {
  const provider = providers.get(providerId.trim())?.descriptor;
  if (!provider) throw new Error(`Ambient messaging provider not found: ${providerId}`);
  return provider;
}

function knownConversationsFromBindings(input: {
  providerId: string;
  authProfileId?: string;
  purpose?: MessagingBindingPurpose;
  bindings: MessagingBindingListResult;
  limit: number;
}): MessagingConversationDirectoryKnownConversation[] {
  return input.bindings.bindings
    .filter((binding) => binding.providerId === input.providerId)
    .filter((binding) => !input.authProfileId || binding.authProfileId === input.authProfileId)
    .filter((binding) => !input.purpose || binding.purpose === input.purpose)
    .slice(0, input.limit)
    .map((binding) => ({
      conversationId: binding.conversationId,
      threadId: binding.threadId,
      authProfileId: binding.authProfileId,
      bindingId: binding.id,
      purpose: binding.purpose,
      status: binding.status,
      ambientSurface: binding.ambientSurface,
      ownerUserId: binding.ownerUserId,
      maxDisclosureLabel: binding.maxDisclosureLabel,
    }));
}

function knownAuthProfilesFromReadiness(
  readiness: MessagingGatewayProviderReadiness | undefined,
  authProfileId: string | undefined,
  limit: number,
): MessagingConversationDirectoryAuthProfile[] {
  return (readiness?.sessions ?? [])
    .filter((session) => !authProfileId || session.profileId === authProfileId)
    .slice(0, limit)
    .map((session) => sessionSummary(session));
}

function sessionSummary(session: MessagingGatewayProviderSessionReadiness): MessagingConversationDirectoryAuthProfile {
  return {
    profileId: session.profileId,
    metadataReadable: session.metadataReadable,
    tdlibStateDirPresent: session.tdlibStateDirPresent,
    phoneNumberPresent: session.phoneNumberPresent,
    databaseEncryptionKeyPresent: session.databaseEncryptionKeyPresent,
  };
}

function implementationBlockers(
  descriptor: MessagingProviderDescriptor,
  purpose: MessagingBindingPurpose,
): string[] {
  const blockers: string[] = [];
  if (descriptor.implementation.status !== "available") {
    blockers.push(`Provider implementation is ${descriptor.implementation.status}.`);
  }
  if (!descriptor.purposeSupport[purpose]) {
    blockers.push(`Provider does not currently enable ${purpose} purpose support.`);
  }
  if (!descriptor.capabilities.conversationDiscovery) {
    blockers.push("Provider descriptor does not declare conversationDiscovery capability.");
  }
  return blockers;
}

function bindingTools(
  descriptor: MessagingProviderDescriptor,
  purpose: MessagingBindingPurpose,
): Pick<MessagingConversationDirectoryProviderPreview, "bindingPreviewTool" | "bindingApplyTool"> {
  if (purpose !== "remote_ambient_surface") return {};
  if (descriptor.providerId === "telegram-tdlib") {
    return {
      bindingPreviewTool: "ambient_messaging_telegram_remote_surface_preview",
      bindingApplyTool: "ambient_messaging_telegram_remote_surface_apply",
    };
  }
  return {
    bindingPreviewTool: "ambient_messaging_remote_surface_binding_preview",
  };
}

function warningsForProvider(
  descriptor: MessagingProviderDescriptor,
  knownConversations: MessagingConversationDirectoryKnownConversation[],
  readiness: MessagingGatewayProviderReadiness | undefined,
  adapterPlan: MessagingConversationDirectoryAdapterPlan | undefined,
): string[] {
  const warnings: string[] = [];
  if (knownConversations.length) {
    warnings.push("Known conversations come from Ambient binding records only; they are not a provider chat list.");
  }
  if (descriptor.providerId === "telegram-tdlib" && !readiness?.configured) {
    warnings.push("Telegram session readiness is not configured; new conversation binding still requires a known conversation id and approved session setup.");
  }
  if (adapterPlan) warnings.push(...adapterPlan.warnings);
  return warnings;
}

function policyNotesForProvider(
  descriptor: MessagingProviderDescriptor,
  adapterPlan: MessagingConversationDirectoryAdapterPlan | undefined,
): string[] {
  return [
    "Conversation directory preview is read-only and does not list provider chats unless a reviewed provider directory adapter is present.",
    "Existing binding records are Ambient-owned metadata and are safe to summarize; provider chat history is not read.",
    "Reviewed provider directory adapters must return only the metadata-only routing contract and fail closed if provider message payload fields are present.",
    "Provider conversation IDs are routing identifiers, not permission grants. Binding creation remains purpose-scoped and approval-gated.",
    "Remote Ambient Surface remains separate from Messaging Connector.",
    ...(adapterPlan?.policyNotes ?? []),
    ...descriptor.privacyNotes,
    ...descriptor.implementation.notes,
  ];
}

function nextStepsForProvider(
  descriptor: MessagingProviderDescriptor,
  purpose: MessagingBindingPurpose,
  knownConversations: MessagingConversationDirectoryKnownConversation[],
  readiness: MessagingGatewayProviderReadiness | undefined,
  canListProviderConversationsNow: boolean,
  adapterPlan: MessagingConversationDirectoryAdapterPlan | undefined,
): string[] {
  if (canListProviderConversationsNow) {
    return [
      `Use ${adapterPlan?.previewToolName} to choose a conversation id, then preview the purpose-scoped binding.`,
      ...(adapterPlan?.nextSteps ?? []),
    ];
  }
  if (descriptor.implementation.status === "planned") {
    if (adapterPlan?.canApplyWithReadiness) {
      return [
        `${descriptor.label} (${descriptor.providerId}) has a ready metadata-only directory adapter, but provider binding lifecycle and message runtime remain planned.`,
        `Use ${adapterPlan.previewToolName} and ${adapterPlan.applyToolName ?? "the provider directory apply tool"} only for approved metadata-only conversation discovery.`,
        ...(adapterPlan.nextSteps ?? []),
        "Use returned conversation ids only with later purpose-specific binding preview. Do not claim Signal binding apply, inbound ingestion, unread windows, or replies are enabled.",
        "Do not use provider CLIs, shell commands, browser automation, app UI automation, or Telegram-specific tools as a substitute for missing Signal runtime features.",
      ];
    }
    return [
      `Treat ${descriptor.label} (${descriptor.providerId}) as planned metadata only for conversation discovery in this build.`,
      adapterPlan?.previewToolName
        ? `Use ${adapterPlan.previewToolName} for provider-specific adapter contract guidance only; do not treat it as live provider access.`
        : undefined,
      ...(adapterPlan?.nextSteps ?? []),
      "Implement a reviewed local/provider adapter with safe readiness, deterministic conversation directory, binding lifecycle, inbound normalization, and reply support before enabling it.",
      "Do not use provider CLIs, shell commands, browser automation, app UI automation, or Telegram-specific tools as a substitute for the missing adapter.",
    ].filter((step): step is string => Boolean(step));
  }
  const steps = [
    adapterPlan?.previewToolName
      ? `Use ${adapterPlan.previewToolName} to inspect provider-specific directory blockers before any apply.`
      : undefined,
    ...(adapterPlan?.nextSteps ?? []),
    knownConversations.length
      ? "Use the known conversation ids from existing Ambient bindings when the user wants to inspect or revoke a current binding."
      : "Ask the user for an exact provider conversation id, or implement the provider directory adapter before offering a provider chat picker.",
    purpose === "remote_ambient_surface"
      ? "When a conversation id is known, use the Remote Ambient Surface binding preview before any apply."
      : "When a conversation id is known, use the Messaging Connector binding preview before any apply.",
    "Do not list chats, read provider history, or infer conversation ids through shell/browser/provider-specific tools in this generic flow.",
  ].filter((step): step is string => Boolean(step));
  if (descriptor.providerId === "telegram-tdlib" && !readiness?.configured) {
    steps.unshift("Run Telegram session setup/status first if the user wants live Telegram provider operation.");
  }
  return steps;
}

function aggregateStatus(providers: MessagingConversationDirectoryProviderPreview[]): MessagingConversationDirectoryStatus {
  if (providers.some((provider) => provider.status === "ready")) return "ready";
  if (providers.some((provider) => provider.status === "limited")) return "limited";
  return "blocked";
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
