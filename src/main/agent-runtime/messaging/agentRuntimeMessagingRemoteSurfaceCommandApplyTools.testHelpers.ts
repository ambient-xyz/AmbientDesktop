import type { MessagingBindingDescriptor, MessagingBindingListResult, RuntimeSurfaceSnapshot } from "../../../shared/messagingGateway";
import type { SttProviderCandidate, SttSettings, VoiceSettings } from "../../../shared/localRuntimeTypes";
import type { ThreadSummary } from "../../../shared/threadTypes";
import type { MessagingRemoteSurfaceCommandSettingUpdateApplyOptions } from "./agentRuntimeMessagingRemoteSurfaceCommandApplyTools";
import type { MessagingRemoteSurfaceCommandPreview, MessagingRemoteSurfaceCommandResult } from "../agentRuntimeMessagingFacade";

type QueuedProjection = NonNullable<MessagingRemoteSurfaceCommandResult["queuedProjection"]>;
type AmbientCliPackageCatalogFixture = Awaited<
  ReturnType<MessagingRemoteSurfaceCommandSettingUpdateApplyOptions["discoverAmbientCliPackages"]>
>;

export function commandPreview(overrides: Partial<MessagingRemoteSurfaceCommandPreview> = {}): MessagingRemoteSurfaceCommandPreview {
  return {
    status: "ready",
    canApplyNow: true,
    queuedProjectionId: "projection-ready",
    commandText: "run workflow",
    commandKind: "workflow_action",
    approvalRequired: true,
    wouldPersistBinding: true,
    wouldReadProviderMessages: false,
    wouldSendProviderMessages: false,
    blockers: [],
    policyNotes: ["Policy note."],
    nextSteps: ["Next step."],
    textPreview: "run workflow",
    ...overrides,
  };
}

export function pendingProjectSwitch() {
  return {
    workspacePath: "/workspace/research",
    reason: "remote-surface-command:switch_project",
    projectName: "Research project",
    runtimeEventId: "remote-surface-event-1",
  };
}

export function commandResult(): MessagingRemoteSurfaceCommandResult {
  return {
    ...commandPreview(),
    applyStatus: "applied",
    applied: true,
    approvalRecorded: true,
  };
}

export function activeBinding(overrides: Partial<MessagingBindingDescriptor> = {}): MessagingBindingDescriptor {
  return {
    id: "binding-1",
    providerId: "telegram-tdlib",
    authProfileId: "owner-profile",
    conversationId: "owner-chat",
    purpose: "remote_ambient_surface",
    status: "active",
    createdAt: "2026-06-11T00:00:00.000Z",
    updatedAt: "2026-06-11T00:00:00.000Z",
    ...overrides,
  };
}

export function bindingList(binding: MessagingBindingDescriptor = activeBinding()): MessagingBindingListResult {
  return {
    bindings: [binding],
    bindingCount: 1,
    activeBindingCount: binding.status === "active" ? 1 : 0,
    remoteAmbientSurfaceCount: binding.purpose === "remote_ambient_surface" ? 1 : 0,
    messagingConnectorCount: binding.purpose === "messaging_connector" ? 1 : 0,
    headlessSafeBindingCount: binding.headlessSafe ? 1 : 0,
  };
}

export function runtimeSurface(): RuntimeSurfaceSnapshot {
  return {
    workspace: {
      name: "ambientCoder",
      path: "/workspace",
    },
    projects: [
      {
        id: "/workspace/new-project",
        name: "New project",
        path: "/workspace/new-project",
        updatedAt: "2026-06-11T00:00:00.000Z",
        threadCount: 0,
        active: false,
      },
    ],
    chats: [
      {
        id: "chat-created",
        title: "Launch room",
        updatedAt: "2026-06-11T00:00:00.000Z",
        permissionMode: "standard",
        collaborationMode: "default",
        model: "ambient",
        thinkingLevel: "medium",
        messagePreview: "",
      },
    ],
    workflowAgents: [
      {
        id: "workflow-created",
        title: "Launch workflow",
        projectPath: "/workspace",
        phase: "discovery",
      },
    ],
    pendingApprovals: [],
    permissionGrants: [],
    permissionAudit: [],
    relaySummaries: [],
    settings: [],
    limits: {
      projectCount: 1,
      chatCount: 1,
      workflowAgentCount: 1,
      pendingApprovalCount: 0,
      permissionGrantCount: 0,
      permissionAuditCount: 0,
      relaySummaryCount: 0,
      returnedProjectCount: 1,
      returnedChatCount: 1,
      returnedWorkflowAgentCount: 1,
      returnedPendingApprovalCount: 0,
      returnedPermissionGrantCount: 0,
      returnedPermissionAuditCount: 0,
      returnedRelaySummaryCount: 0,
    },
  };
}

export function switchProjectResult(): MessagingRemoteSurfaceCommandResult {
  return {
    ...commandResult(),
    queuedProjectionId: "projection-switch",
    commandText: "switch project Research project",
    commandKind: "switch_project",
    textPreview: "switch project Research project",
    queuedProjection: {
      id: "projection-switch",
      providerId: "telegram-tdlib",
      conversationId: "owner-chat",
      sourceEventId: "source-event-1",
      bindingId: "binding-1",
      projection: {} as QueuedProjection["projection"],
      queuedAt: "2026-06-11T00:00:00.000Z",
    },
    binding: {
      id: "binding-1",
      providerId: "telegram-tdlib",
      authProfileId: "owner-profile",
      conversationId: "owner-chat",
      purpose: "remote_ambient_surface",
      status: "active",
      createdAt: "2026-06-11T00:00:00.000Z",
      updatedAt: "2026-06-11T00:00:00.000Z",
    },
    targetProject: {
      id: "/workspace/research",
      path: "/workspace/research",
      name: "Research project",
      updatedAt: "2026-06-11T00:00:00.000Z",
      threadCount: 0,
      active: false,
    },
  };
}

export function workflowThread(overrides: Partial<{ id: string; title: string; phase: string }> = {}): {
  id: string;
  title: string;
  phase: string;
} {
  return {
    id: "workflow-1",
    title: "Launch workflow",
    phase: "discovery",
    ...overrides,
  };
}

export function threadSummary(overrides: Record<string, unknown> = {}): ThreadSummary {
  return {
    id: "thread-1",
    title: "Launch room",
    collaborationMode: "agent",
    thinkingLevel: "medium",
    model: "ambient",
    ...overrides,
  } as ThreadSummary;
}

export function voiceSettings(overrides: Record<string, unknown> = {}): VoiceSettings {
  return {
    enabled: true,
    mode: "assistant-final",
    autoplay: false,
    providerCapabilityId: "voice-cap",
    voiceId: "alloy",
    maxChars: 1200,
    longReply: "summarize",
    format: "mp3",
    artifactCacheMaxMb: 64,
    ...overrides,
  } as VoiceSettings;
}

export function sttSettings(overrides: Record<string, unknown> = {}): SttSettings {
  return {
    enabled: true,
    providerCapabilityId: "stt-cap",
    spokenLanguage: "en",
    mode: "push-to-talk",
    autoSendAfterTranscription: true,
    silenceFinalizeSeconds: 1,
    noSpeechGate: {
      enabled: true,
      rmsThresholdDbfs: -45,
    },
    bargeIn: {
      stopTtsOnSpeech: true,
      queueWhileAgentRuns: false,
    },
    ...overrides,
  } as SttSettings;
}

export function sttProvider(overrides: Record<string, unknown> = {}): SttProviderCandidate {
  return {
    packageId: "stt-package",
    packageName: "ambient-stt",
    command: "transcribe",
    capabilityId: "stt-cap",
    providerId: "stt-provider",
    label: "Ambient STT",
    languages: ["en"],
    defaultLanguage: "en",
    installed: true,
    available: true,
    availabilityReason: "ready",
    ...overrides,
  } as SttProviderCandidate;
}

export function searchCatalog(): AmbientCliPackageCatalogFixture {
  return {
    packages: [
      {
        id: "pkg-brave",
        name: "brave-search",
        description: "Brave Search provider",
        installed: true,
        errors: [],
        envRequirements: [],
        skills: [],
        generated: {
          installerShape: "search-provider",
          provider: "Brave Search",
        },
        commands: [
          {
            name: "search",
            description: "Search the public web",
          },
        ],
        healthChecks: [],
      },
    ],
    errors: [],
  } as unknown as AmbientCliPackageCatalogFixture;
}
