import type {
  MessagingAmbientSurface,
  MessagingBindingListResult,
  MessagingGatewayRuntimeStatus,
  MessagingRemoteSurfaceActivationCard,
  MessagingRemoteSurfaceActivationCardPhase,
} from "../../shared/messagingGateway";
import type { TelegramBridgePollingRuntimeStatus } from "../telegram/telegramBridgePolling";
import {
  buildTelegramOwnerLoopActivationPlan,
  telegramOwnerLoopActivationCard,
  telegramOwnerLoopActivationInput,
  type TelegramOwnerLoopActivationPlan,
} from "../telegram/telegramOwnerLoopActivation";

const TELEGRAM_PROVIDER_ID = "telegram-tdlib";
const TELEGRAM_OWNER_LOOP_ACTIVATION_PLAN_TOOL = "ambient_messaging_telegram_owner_loop_activation_plan";
const REMOTE_SURFACE_ACTIVATION_PLAN_TOOL = "ambient_messaging_remote_surface_activation_plan";
const REMOTE_SURFACE_PROVIDER_SUPPORT_PLAN_TOOL = "ambient_messaging_remote_surface_provider_support_plan";

const TELEGRAM_LOW_LEVEL_TOOLS = [
  "ambient_messaging_gateway_lifecycle_preview",
  "ambient_messaging_gateway_lifecycle_apply",
  "ambient_messaging_telegram_conversation_directory_preview",
  "ambient_messaging_telegram_conversation_directory_apply",
  "ambient_messaging_telegram_owner_handoff_preview",
  "ambient_messaging_telegram_owner_handoff_apply",
  "ambient_messaging_telegram_remote_surface_preview",
  "ambient_messaging_telegram_remote_surface_apply",
  "ambient_messaging_telegram_bridge_poll_preview",
  "ambient_messaging_telegram_bridge_poll_apply",
  "ambient_messaging_telegram_bridge_polling_preview",
  "ambient_messaging_telegram_bridge_polling_apply",
  "ambient_messaging_remote_surface_command_preview",
  "ambient_messaging_remote_surface_command_apply",
  "ambient_messaging_remote_surface_reply_preview",
  "ambient_messaging_remote_surface_reply_apply",
];

export type MessagingRemoteSurfaceActivationStatus =
  | "route_ready"
  | "needs_provider_choice"
  | "unsupported_provider"
  | "blocked";

export interface MessagingRemoteSurfaceActivationInput {
  requestText?: string;
  providerId?: string;
  provider?: string;
  profileId?: string;
  conversationId?: string;
  setupCode?: string;
  ownerUserId?: string;
  ownerHandoffSourceMessageId?: string;
  bindingId?: string;
  ambientSurface?: MessagingAmbientSurface;
  maxDisclosureLabel?: string;
  minReceivedAt?: string;
  intervalMs?: number;
  limit?: number;
}

export interface MessagingRemoteSurfaceActivationPlan {
  status: MessagingRemoteSurfaceActivationStatus;
  intent: "remote_ambient_surface";
  selectedProviderId?: "telegram-tdlib";
  requestedProvider?: string;
  ambientSurface: MessagingAmbientSurface;
  recommendedNextTool?: string;
  delegatedRecommendedNextTool?: string;
  activationPlanFirstTool?: string;
  supportedProviderIds: string[];
  repairPrompts: string[];
  lowLevelToolPolicy: {
    activationPlanRequiredBeforeLowLevel: boolean;
    blockedUntilActivationPlan: string[];
    allowedFirstTools: string[];
  };
  telegramPlan?: TelegramOwnerLoopActivationPlan;
  safety: {
    startsBridge: false;
    listsProviderChats: false;
    readsProviderMessages: false;
    readsProviderHistory: false;
    mutatesBindings: false;
    startsPolling: false;
    sendsProviderMessages: false;
  };
  policyNotes: string[];
}

export type MessagingRemoteSurfaceProviderSupportPlanStatus =
  | "planning_ready"
  | "already_supported"
  | "needs_provider_name";

export interface MessagingRemoteSurfaceProviderSupportPlanInput {
  requestText?: string;
  providerId?: string;
  provider?: string;
  ambientSurface?: MessagingAmbientSurface;
  blockerContext?: string;
}

export interface MessagingRemoteSurfaceProviderSupportPlan {
  status: MessagingRemoteSurfaceProviderSupportPlanStatus;
  intent: "remote_ambient_surface_provider_support";
  requestedProvider?: string;
  selectedProviderId?: string;
  ambientSurface: MessagingAmbientSurface;
  recommendedNextTool?: string;
  adapterRequirements: string[];
  ownerAuthConstraints: string[];
  headlessSupportRequirements: string[];
  approvalGates: string[];
  validationTargets: string[];
  blockedActions: string[];
  repairPrompts: string[];
  safety: {
    startsBridge: false;
    listsProviderChats: false;
    readsProviderMessages: false;
    readsProviderHistory: false;
    mutatesBindings: false;
    startsPolling: false;
    sendsProviderMessages: false;
    installsDependencies: false;
    scaffoldsProviderSupport: false;
  };
  policyNotes: string[];
}

export function messagingRemoteSurfaceActivationInput(params: unknown): MessagingRemoteSurfaceActivationInput {
  const raw = params as Record<string, unknown> | undefined;
  const ambientSurface = optionalString(raw?.ambientSurface);
  if (ambientSurface && !isMessagingAmbientSurface(ambientSurface)) {
    throw new Error("ambientSurface must be chat, projects, workflow_agents, settings, or notifications.");
  }
  const intervalMs = typeof raw?.intervalMs === "number" && Number.isFinite(raw.intervalMs)
    ? Math.floor(raw.intervalMs)
    : undefined;
  const limit = typeof raw?.limit === "number" && Number.isFinite(raw.limit)
    ? Math.floor(raw.limit)
    : undefined;
  return {
    requestText: optionalString(raw?.requestText),
    providerId: optionalString(raw?.providerId),
    provider: optionalString(raw?.provider),
    profileId: optionalString(raw?.profileId),
    conversationId: optionalString(raw?.conversationId),
    setupCode: optionalString(raw?.setupCode),
    ownerUserId: optionalString(raw?.ownerUserId),
    ownerHandoffSourceMessageId: optionalString(raw?.ownerHandoffSourceMessageId),
    bindingId: optionalString(raw?.bindingId),
    ambientSurface: ambientSurface as MessagingAmbientSurface | undefined,
    maxDisclosureLabel: optionalString(raw?.maxDisclosureLabel),
    minReceivedAt: optionalString(raw?.minReceivedAt),
    ...(intervalMs !== undefined ? { intervalMs } : {}),
    ...(limit !== undefined ? { limit } : {}),
  };
}

export function messagingRemoteSurfaceProviderSupportPlanInput(params: unknown): MessagingRemoteSurfaceProviderSupportPlanInput {
  const raw = params as Record<string, unknown> | undefined;
  const ambientSurface = optionalString(raw?.ambientSurface);
  if (ambientSurface && !isMessagingAmbientSurface(ambientSurface)) {
    throw new Error("ambientSurface must be chat, projects, workflow_agents, settings, or notifications.");
  }
  return {
    requestText: optionalString(raw?.requestText),
    providerId: optionalString(raw?.providerId),
    provider: optionalString(raw?.provider),
    ambientSurface: ambientSurface as MessagingAmbientSurface | undefined,
    blockerContext: optionalString(raw?.blockerContext),
  };
}

export function buildMessagingRemoteSurfaceActivationPlan(input: {
  toolInput: MessagingRemoteSurfaceActivationInput;
  runtimeStatus: MessagingGatewayRuntimeStatus;
  bindings: MessagingBindingListResult;
  telegramPollingStatus: TelegramBridgePollingRuntimeStatus;
}): MessagingRemoteSurfaceActivationPlan {
  const ambientSurface = input.toolInput.ambientSurface ?? "projects";
  const requestedProvider = requestedProviderText(input.toolInput);
  const selectedProviderId = resolveProviderId(requestedProvider);
  if (!selectedProviderId) {
    return basePlan({
      status: "needs_provider_choice",
      requestedProvider,
      ambientSurface,
      repairPrompts: [
        "Choose a reviewed Remote Ambient Surface provider before any provider-specific setup. Telegram is currently the reviewed activation path.",
        "If the owner asked for Signal or another provider, explain that it needs its own reviewed product activation planner before remote-control setup.",
      ],
      recommendedNextTool: REMOTE_SURFACE_ACTIVATION_PLAN_TOOL,
    });
  }
  if (selectedProviderId !== TELEGRAM_PROVIDER_ID) {
    return basePlan({
      status: "unsupported_provider",
      requestedProvider,
      ambientSurface,
      repairPrompts: [
        `No reviewed Remote Ambient Surface activation shortcut exists for ${requestedProvider ?? "that provider"}.`,
        "Ask the owner to use Telegram for the current product activation path, or treat this as future provider onboarding rather than falling back to external Messaging Connector tools.",
      ],
    });
  }

  const telegramPlan = buildTelegramOwnerLoopActivationPlan({
    toolInput: telegramOwnerLoopActivationInput({
      profileId: input.toolInput.profileId,
      conversationId: input.toolInput.conversationId,
      setupCode: input.toolInput.setupCode,
      ownerUserId: input.toolInput.ownerUserId,
      ownerHandoffSourceMessageId: input.toolInput.ownerHandoffSourceMessageId,
      bindingId: input.toolInput.bindingId,
      ambientSurface,
      maxDisclosureLabel: input.toolInput.maxDisclosureLabel,
      minReceivedAt: input.toolInput.minReceivedAt,
      intervalMs: input.toolInput.intervalMs,
      limit: input.toolInput.limit,
    }),
    runtimeStatus: input.runtimeStatus,
    bindings: input.bindings,
    pollingStatus: input.telegramPollingStatus,
  });
  return {
    ...basePlan({
      status: telegramPlan.status === "blocked" ? "blocked" : "route_ready",
      requestedProvider,
      selectedProviderId: TELEGRAM_PROVIDER_ID,
      ambientSurface,
      recommendedNextTool: TELEGRAM_OWNER_LOOP_ACTIVATION_PLAN_TOOL,
      repairPrompts: telegramRepairPrompts(telegramPlan),
    }),
    activationPlanFirstTool: TELEGRAM_OWNER_LOOP_ACTIVATION_PLAN_TOOL,
    delegatedRecommendedNextTool: telegramPlan.recommendedNextTool,
    telegramPlan,
  };
}

export function buildMessagingRemoteSurfaceProviderSupportPlan(
  input: MessagingRemoteSurfaceProviderSupportPlanInput,
): MessagingRemoteSurfaceProviderSupportPlan {
  const ambientSurface = input.ambientSurface ?? "projects";
  const requestedProvider = requestedProviderText(input);
  const selectedProviderId = providerSupportId(requestedProvider);
  if (!requestedProvider) {
    return baseProviderSupportPlan({
      status: "needs_provider_name",
      ambientSurface,
      repairPrompts: [
        "Name the messaging provider before planning reviewed Remote Ambient Surface support.",
        "Use ambient_messaging_remote_surface_activation_plan first for ordinary setup/start/repair requests; use this planning tool only after an unsupported provider is identified or the owner explicitly asks to plan provider support.",
      ],
    });
  }
  if (resolveProviderId(requestedProvider) === TELEGRAM_PROVIDER_ID) {
    return baseProviderSupportPlan({
      status: "already_supported",
      requestedProvider,
      selectedProviderId: TELEGRAM_PROVIDER_ID,
      ambientSurface,
      recommendedNextTool: REMOTE_SURFACE_ACTIVATION_PLAN_TOOL,
      repairPrompts: [
        "Telegram already has a reviewed Remote Ambient Surface activation route. Use the product activation shortcut rather than planning new provider support.",
      ],
    });
  }
  return baseProviderSupportPlan({
    status: "planning_ready",
    requestedProvider,
    selectedProviderId,
    ambientSurface,
    repairPrompts: [
      `Plan reviewed Remote Ambient Surface provider support for ${requestedProvider}; do not activate it in this turn.`,
      "Ask for approval before implementing adapters, installing dependencies, scaffolding provider support, linking accounts/devices, running validation, starting polling, or sending provider messages.",
    ],
  });
}

export function messagingRemoteSurfaceActivationPlanText(plan: MessagingRemoteSurfaceActivationPlan): string {
  return [
    "Remote Ambient Surface activation shortcut",
    `Status: ${plan.status}`,
    `Intent: ${plan.intent}`,
    `Requested provider: ${plan.requestedProvider ?? "none"}`,
    `Selected provider: ${plan.selectedProviderId ?? "none"}`,
    `Ambient surface: ${plan.ambientSurface}`,
    `Recommended next tool: ${plan.recommendedNextTool ?? "none"}`,
    plan.activationPlanFirstTool ? `Activation plan first tool: ${plan.activationPlanFirstTool}` : undefined,
    plan.delegatedRecommendedNextTool ? `Delegated next tool after activation plan: ${plan.delegatedRecommendedNextTool}` : undefined,
    `Supported reviewed providers: ${plan.supportedProviderIds.join(", ")}`,
    "",
    "Low-level tool policy:",
    `- Activation plan required before low-level tools: ${plan.lowLevelToolPolicy.activationPlanRequiredBeforeLowLevel ? "yes" : "no"}`,
    `- Allowed first tools: ${plan.lowLevelToolPolicy.allowedFirstTools.join(", ")}`,
    `- Blocked until activation plan: ${plan.lowLevelToolPolicy.blockedUntilActivationPlan.join(", ")}`,
    "",
    "Repair/status prompts:",
    ...plan.repairPrompts.map((prompt) => `- ${prompt}`),
    "",
    "Telegram activation summary:",
    plan.telegramPlan ? `- Status if Telegram activation plan is called now: ${plan.telegramPlan.status}` : "- No provider-specific plan selected yet.",
    plan.telegramPlan?.recommendedNextTool ? `- Provider-specific next tool after plan: ${plan.telegramPlan.recommendedNextTool}` : undefined,
    plan.telegramPlan ? `- Provider readiness: ${plan.telegramPlan.providerState.readinessStatus}; runtime ${plan.telegramPlan.providerState.runtimeState}/${plan.telegramPlan.providerState.mode}` : undefined,
    plan.telegramPlan ? `- Active owner bindings: ${plan.telegramPlan.activeOwnerBindings.length}` : undefined,
    plan.telegramPlan ? `- Polling running: ${plan.telegramPlan.polling.running ? "yes" : "no"}` : undefined,
    "",
    "Safety boundary:",
    `- Starts bridge: ${plan.safety.startsBridge ? "yes" : "no"}`,
    `- Lists provider chats: ${plan.safety.listsProviderChats ? "yes" : "no"}`,
    `- Reads provider messages: ${plan.safety.readsProviderMessages ? "yes" : "no"}`,
    `- Reads provider history: ${plan.safety.readsProviderHistory ? "yes" : "no"}`,
    `- Mutates bindings: ${plan.safety.mutatesBindings ? "yes" : "no"}`,
    `- Starts polling: ${plan.safety.startsPolling ? "yes" : "no"}`,
    `- Sends provider messages: ${plan.safety.sendsProviderMessages ? "yes" : "no"}`,
    "",
    "Policy notes:",
    ...plan.policyNotes.map((note) => `- ${note}`),
  ].filter((line): line is string => line !== undefined).join("\n");
}

export function messagingRemoteSurfaceProviderSupportPlanText(
  plan: MessagingRemoteSurfaceProviderSupportPlan,
): string {
  return [
    "Remote Ambient Surface provider support plan",
    `Status: ${plan.status}`,
    `Intent: ${plan.intent}`,
    `Requested provider: ${plan.requestedProvider ?? "none"}`,
    `Selected provider id: ${plan.selectedProviderId ?? "none"}`,
    `Ambient surface: ${plan.ambientSurface}`,
    `Recommended next tool: ${plan.recommendedNextTool ?? "none"}`,
    "",
    "Adapter requirements:",
    ...plan.adapterRequirements.map((requirement) => `- ${requirement}`),
    "",
    "Owner-auth constraints:",
    ...plan.ownerAuthConstraints.map((constraint) => `- ${constraint}`),
    "",
    "Headless support requirements:",
    ...plan.headlessSupportRequirements.map((requirement) => `- ${requirement}`),
    "",
    "Approval gates:",
    ...plan.approvalGates.map((gate) => `- ${gate}`),
    "",
    "Validation targets:",
    ...plan.validationTargets.map((target) => `- ${target}`),
    "",
    "Blocked actions before explicit implementation approval:",
    ...plan.blockedActions.map((action) => `- ${action}`),
    "",
    "Repair/status prompts:",
    ...plan.repairPrompts.map((prompt) => `- ${prompt}`),
    "",
    "Safety boundary:",
    `- Starts bridge: ${plan.safety.startsBridge ? "yes" : "no"}`,
    `- Lists provider chats: ${plan.safety.listsProviderChats ? "yes" : "no"}`,
    `- Reads provider messages: ${plan.safety.readsProviderMessages ? "yes" : "no"}`,
    `- Reads provider history: ${plan.safety.readsProviderHistory ? "yes" : "no"}`,
    `- Mutates bindings: ${plan.safety.mutatesBindings ? "yes" : "no"}`,
    `- Starts polling: ${plan.safety.startsPolling ? "yes" : "no"}`,
    `- Sends provider messages: ${plan.safety.sendsProviderMessages ? "yes" : "no"}`,
    `- Installs dependencies: ${plan.safety.installsDependencies ? "yes" : "no"}`,
    `- Scaffolds provider support: ${plan.safety.scaffoldsProviderSupport ? "yes" : "no"}`,
    "",
    "Policy notes:",
    ...plan.policyNotes.map((note) => `- ${note}`),
  ].join("\n");
}

export function messagingRemoteSurfaceActivationCard(plan: MessagingRemoteSurfaceActivationPlan): MessagingRemoteSurfaceActivationCard {
  const telegramCard = plan.telegramPlan ? telegramOwnerLoopActivationCard(plan.telegramPlan) : undefined;
  const productPhase = productActivationPhase(plan);
  const repairPrompts = plan.repairPrompts.slice(0, 4);
  return {
    kind: "messaging-remote-surface-activation",
    intent: "remote_ambient_surface",
    ...(plan.selectedProviderId ? { providerId: plan.selectedProviderId } : {}),
    ...(plan.selectedProviderId === TELEGRAM_PROVIDER_ID ? { providerLabel: "Telegram" } : {}),
    ...(plan.requestedProvider ? { requestedProvider: plan.requestedProvider } : {}),
    status: plan.status,
    title: "Remote Ambient Surface activation",
    summary: remoteActivationSummary(plan),
    detail: remoteActivationDetail(plan, productPhase, telegramCard?.currentPhase),
    ambientSurface: plan.ambientSurface,
    currentPhase: telegramCard?.currentPhase ?? productPhase,
    phaseChips: [
      productPhase,
      ...(telegramCard?.phaseChips ?? []),
    ],
    ...(plan.recommendedNextTool ? { recommendedNextTool: plan.recommendedNextTool } : {}),
    ...(plan.delegatedRecommendedNextTool ? { delegatedRecommendedNextTool: plan.delegatedRecommendedNextTool } : {}),
    ...(plan.activationPlanFirstTool ? { activationPlanFirstTool: plan.activationPlanFirstTool } : {}),
    ...(repairPrompts[0] ? { repairPrompt: repairPrompts[0] } : {}),
    repairPrompts,
    blockedUntilActivationPlan: plan.lowLevelToolPolicy.blockedUntilActivationPlan,
    previewSendSafety: {
      commandPreviewTool: "ambient_messaging_remote_surface_command_preview",
      replyPreviewTool: "ambient_messaging_remote_surface_reply_preview",
      providerSendApplyTool: "ambient_messaging_remote_surface_reply_apply",
      previewRequiredBeforeProviderSend: true,
      providerSendRequiresSeparateApproval: true,
      providerSendReady: false,
    },
    safety: {
      startsBridge: false,
      listsProviderChats: false,
      readsProviderMessages: false,
      readsProviderHistory: false,
      mutatesBindings: false,
      startsPolling: false,
      sendsProviderMessages: false,
    },
  };
}

function basePlan(input: {
  status: MessagingRemoteSurfaceActivationStatus;
  requestedProvider?: string;
  selectedProviderId?: "telegram-tdlib";
  ambientSurface: MessagingAmbientSurface;
  recommendedNextTool?: string;
  repairPrompts: string[];
}): MessagingRemoteSurfaceActivationPlan {
  return {
    status: input.status,
    intent: "remote_ambient_surface",
    ...(input.requestedProvider ? { requestedProvider: input.requestedProvider } : {}),
    ...(input.selectedProviderId ? { selectedProviderId: input.selectedProviderId } : {}),
    ambientSurface: input.ambientSurface,
    ...(input.recommendedNextTool ? { recommendedNextTool: input.recommendedNextTool } : {}),
    supportedProviderIds: [TELEGRAM_PROVIDER_ID],
    repairPrompts: input.repairPrompts,
    lowLevelToolPolicy: {
      activationPlanRequiredBeforeLowLevel: true,
      blockedUntilActivationPlan: TELEGRAM_LOW_LEVEL_TOOLS,
      allowedFirstTools: [REMOTE_SURFACE_ACTIVATION_PLAN_TOOL, TELEGRAM_OWNER_LOOP_ACTIVATION_PLAN_TOOL],
    },
    safety: {
      startsBridge: false,
      listsProviderChats: false,
      readsProviderMessages: false,
      readsProviderHistory: false,
      mutatesBindings: false,
      startsPolling: false,
      sendsProviderMessages: false,
    },
    policyNotes: [
      "This is the owner-authenticated Remote Ambient Surface setup path, not external Messaging Connector chat-with-others.",
      "For Telegram, call ambient_messaging_telegram_owner_loop_activation_plan next before lifecycle, directory, handoff, binding, polling, command, or relay tools.",
      "Do not use shell, browser automation, Telegram Desktop UI, provider CLIs, arbitrary history reads, or generic messaging tools as setup fallbacks.",
      "Default to preview-only relay behavior; provider sends require a separate explicit approval after preview.",
    ],
  };
}

function baseProviderSupportPlan(input: {
  status: MessagingRemoteSurfaceProviderSupportPlanStatus;
  requestedProvider?: string;
  selectedProviderId?: string;
  ambientSurface: MessagingAmbientSurface;
  recommendedNextTool?: string;
  repairPrompts: string[];
}): MessagingRemoteSurfaceProviderSupportPlan {
  const isSignal = providerLooksLike(input.requestedProvider, "signal") || input.selectedProviderId === "signal-cli";
  return {
    status: input.status,
    intent: "remote_ambient_surface_provider_support",
    ...(input.requestedProvider ? { requestedProvider: input.requestedProvider } : {}),
    ...(input.selectedProviderId ? { selectedProviderId: input.selectedProviderId } : {}),
    ambientSurface: input.ambientSurface,
    ...(input.recommendedNextTool ? { recommendedNextTool: input.recommendedNextTool } : {}),
    adapterRequirements: [
      "Create a reviewed provider adapter descriptor that explicitly declares Remote Ambient Surface support; do not treat generic Messaging Connector or chat-with-others support as sufficient.",
      "Define provider readiness, metadata-only owner conversation discovery, owner handoff, owner binding, polling/event intake, command preview/apply, reply preview/apply, diagnostics, and teardown surfaces as typed Ambient tools before activation.",
      "Keep message-body access out of discovery and setup. Directory/readiness surfaces should use metadata-only rows unless a later explicitly approved command requires bounded message content.",
      "Preserve preview-before-apply semantics for all binding, polling, command, and provider-send operations.",
      ...(isSignal ? [
        "For Signal, Signal Desktop being installed is not an activation route. Prefer a reviewed headless bridge such as signal-cli or an equivalent adapter, with explicit account/device linking and recoverability notes.",
      ] : [
        "For this provider, first identify whether a maintained headless API/bridge exists before considering any desktop UI automation path.",
      ]),
    ],
    ownerAuthConstraints: [
      "Remote Ambient Surface is owner-authenticated chat-to-self control, not external chat-with-others messaging.",
      "Bind only a verified owner identity and conversation after an explicit owner handoff, setup code, or provider-native account linking flow.",
      "Never infer owner identity from arbitrary history, contact names, unread messages, or a provider desktop app being open.",
      "Keep activation and provider-send approval separate; a successful owner binding does not authorize arbitrary sends.",
    ],
    headlessSupportRequirements: [
      "The provider support route must work in a headless Ambient process without a renderer, GUI, or provider desktop window.",
      "If provider auth requires a QR code, device link, or browser handoff, expose that as an explicit setup state and resume path rather than a hidden UI automation dependency.",
      "All settings, status, diagnostics, polling, and teardown controls must be addressable through headless tools and runtime snapshots.",
    ],
    approvalGates: [
      "Provider/adapter source selection and trust review.",
      "Dependency installation and account/device-link setup.",
      "Owner identity/conversation binding creation.",
      "Polling or webhook start.",
      "Each provider send after an explicit preview.",
      "Validation against live provider messages only after the owner approves the exact validation target.",
    ],
    validationTargets: [
      "Deterministic descriptor tests prove the provider declares Remote Ambient Surface purpose support, headless readiness, and preview/apply tool coverage.",
      "Activation shortcut keeps returning unsupported_provider until the reviewed provider route exists.",
      "Provider support planning does not start bridges, list chats, read message bodies/history, mutate bindings, start polling, install dependencies, scaffold provider support, or send provider messages.",
      "Live dogfood first uses synthetic or metadata-only events, then validates owner handoff, polling, command preview, and reply preview before any apply step.",
    ],
    blockedActions: [
      "Provider-specific low-level tools.",
      "Provider desktop UI automation.",
      "Shell, browser automation, provider CLIs, or install commands.",
      "Generic Messaging Connector setup.",
      "Arbitrary provider history reads.",
      "Provider message reads.",
      "Provider sends.",
      "Lifecycle, binding, polling, command apply, reply apply, or future-provider scaffolding tools.",
    ],
    repairPrompts: input.repairPrompts,
    safety: {
      startsBridge: false,
      listsProviderChats: false,
      readsProviderMessages: false,
      readsProviderHistory: false,
      mutatesBindings: false,
      startsPolling: false,
      sendsProviderMessages: false,
      installsDependencies: false,
      scaffoldsProviderSupport: false,
    },
    policyNotes: [
      `This tool (${REMOTE_SURFACE_PROVIDER_SUPPORT_PLAN_TOOL}) is planning-only. It gives Pi the Ambient product contract for future provider onboarding without starting a provider lifecycle.`,
      "Ask the owner for approval before implementing or validating provider support.",
      "Do not let Pi discover the contract by searching app bundles, packaged markdown, source trees, provider desktop UI, or guessed documentation paths.",
      "Known provider templates are preferred when they exist, but unknown providers should still use this reviewed adapter-planning shape before custom exploration.",
    ],
  };
}

function productActivationPhase(plan: MessagingRemoteSurfaceActivationPlan): MessagingRemoteSurfaceActivationCardPhase {
  return {
    id: "product-provider-route",
    title: "Choose reviewed provider route",
    status: plan.status === "route_ready" ? "complete" : plan.status === "needs_provider_choice" ? "waiting" : "blocked",
    approvalRequired: false,
    ...(plan.recommendedNextTool ? { nextTool: plan.recommendedNextTool } : {}),
    blockerCount: plan.status === "route_ready" ? 0 : Math.max(1, plan.repairPrompts.length),
  };
}

function remoteActivationSummary(plan: MessagingRemoteSurfaceActivationPlan): string {
  if (plan.status === "route_ready") return "Reviewed provider route selected.";
  if (plan.status === "needs_provider_choice") return "Choose a reviewed Remote Ambient Surface provider.";
  if (plan.status === "unsupported_provider") return "No reviewed activation route exists for this provider.";
  return "Activation route is blocked.";
}

function remoteActivationDetail(
  plan: MessagingRemoteSurfaceActivationPlan,
  productPhase: MessagingRemoteSurfaceActivationCardPhase,
  telegramPhase?: MessagingRemoteSurfaceActivationCardPhase,
): string {
  if (plan.status === "route_ready" && telegramPhase) return `Next Telegram phase: ${telegramPhase.title}.`;
  if (plan.status === "route_ready") return `Next tool: ${plan.recommendedNextTool ?? "none"}.`;
  return `${productPhase.title}: ${productPhase.status}.`;
}

function telegramRepairPrompts(plan: TelegramOwnerLoopActivationPlan): string[] {
  const prompts: string[] = [];
  const providerPhase = phaseById(plan, "provider-readiness");
  if (providerPhase && providerPhase.status !== "complete") {
    prompts.push(`Provider readiness: ${providerPhase.blockers.join("; ") || "needs confirmation"}. Call the Telegram activation plan next, then use its provider-readiness sequence; do not inspect Telegram Desktop or shell out to provider CLIs.`);
  }
  const directoryPhase = phaseById(plan, "metadata-directory");
  if (directoryPhase && directoryPhase.status !== "complete") {
    prompts.push(`Owner conversation: ${directoryPhase.blockers.join("; ") || "choose metadata-only directory row"}. Use metadata-only directory preview/apply only after the Telegram activation plan has been called.`);
  }
  const handoffPhase = phaseById(plan, "owner-handoff");
  if (handoffPhase && handoffPhase.status !== "complete") {
    prompts.push(`Owner handoff: ${handoffPhase.blockers.join("; ") || "needs exact one-time setup code"}. Ask for or generate a unique setup code, then use the reviewed owner-handoff preview/apply sequence.`);
  }
  const bindingPhase = phaseById(plan, "owner-binding");
  if (bindingPhase && bindingPhase.status !== "complete") {
    prompts.push(`Owner binding: ${bindingPhase.blockers.join("; ") || "needs approved Remote Ambient Surface binding creation"}. Create only the typed owner binding after handoff; do not enable external Messaging Connector access.`);
  }
  const pollingPhase = phaseById(plan, "periodic-polling");
  if (pollingPhase && pollingPhase.status !== "complete") {
    prompts.push(`Polling start: ${pollingPhase.blockers.join("; ") || "needs approved periodic polling start"}. Preview/apply polling only after an active owner binding exists, then inspect polling status and gateway status.`);
  }
  if (!plan.polling.minReceivedAt && !plan.polling.running) {
    prompts.push("Freshness anchor: when setup/handoff just happened, carry minReceivedAt from the activation or first-command boundary so old unread Telegram backlog is counted stale.");
  }
  if (plan.status === "active") {
    prompts.push("Remote control is active: inspect polling status and gateway status before summarizing, and preview any provider reply before requesting send approval.");
  }
  return prompts.length ? prompts : ["Call the Telegram activation plan next, then follow its recommended phase sequence exactly."];
}

function phaseById(plan: TelegramOwnerLoopActivationPlan, id: string) {
  return plan.phases.find((phase) => phase.id === id);
}

function requestedProviderText(input: MessagingRemoteSurfaceActivationInput): string | undefined {
  return input.providerId ?? input.provider ?? providerNameFromRequestText(input.requestText);
}

function providerSupportId(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const resolved = resolveProviderId(value);
  if (resolved) return resolved;
  const normalized = value.toLowerCase();
  if (normalized.includes("whatsapp")) return "whatsapp";
  if (normalized.includes("matrix")) return "matrix";
  if (normalized.includes("discord")) return "discord";
  if (normalized.includes("slack")) return "slack";
  if (normalized.includes("sms")) return "sms";
  return undefined;
}

function providerLooksLike(value: string | undefined, needle: string): boolean {
  return value?.toLowerCase().includes(needle) ?? false;
}

function resolveProviderId(value: string | undefined): "telegram-tdlib" | "signal-cli" | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (normalized.includes("telegram") || normalized.includes("tdlib")) return TELEGRAM_PROVIDER_ID;
  if (normalized.includes("signal")) return "signal-cli";
  return undefined;
}

function providerNameFromRequestText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (normalized.includes("telegram") || normalized.includes("tdlib")) return "Telegram";
  if (normalized.includes("signal")) return "Signal";
  if (normalized.includes("whatsapp")) return "WhatsApp";
  if (normalized.includes("matrix")) return "Matrix";
  if (normalized.includes("discord")) return "Discord";
  if (normalized.includes("slack")) return "Slack";
  if (normalized.includes("sms")) return "SMS";
  return undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isMessagingAmbientSurface(value: string): value is MessagingAmbientSurface {
  return value === "chat"
    || value === "projects"
    || value === "workflow_agents"
    || value === "settings"
    || value === "notifications";
}
