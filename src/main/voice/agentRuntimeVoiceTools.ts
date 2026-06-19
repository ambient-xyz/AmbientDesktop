import { existsSync, statSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";

import type { UpdateVoiceSettingsInput } from "../../shared/desktopTypes";
import type { VoiceProviderCandidate, VoiceSettings, VoiceSettingsAuditSource } from "../../shared/localRuntimeTypes";
import type { PermissionGrantScopeKind, PermissionRisk } from "../../shared/permissionTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import { runAmbientCliPackageCommand } from "./voiceAmbientCliFacade";
import { registerDesktopTool, voiceToolDescriptor } from "../desktop-tools/desktopToolFirstPartyRuntimeContract";
import { isPathInside } from "./voiceSessionFacade";
import {
  listVoiceProviderVoices,
  readVoiceDiscoveryCache,
  removeVoiceDiscoveryCacheVoice,
  refreshVoiceProviderVoices,
  upsertVoiceDiscoveryCacheVoice,
  voiceListText,
  voiceRefreshRequiresApproval,
  voiceRefreshText,
  type VoiceListInput,
  type VoiceRefreshInput,
} from "./voiceDiscoveryCache";
import {
  buildVoiceCloneCreatePlan,
  buildVoiceCloneCreatePreview,
  buildVoiceCloneManagePlan,
  buildVoiceClonePlan,
  buildVoiceStatus,
  parseVoiceCloneCreateStdout,
  parseVoiceCloneDeleteStdout,
  planVoicePolicyUpdate,
  planVoiceSelection,
  summarizeVoiceCloneStatus,
  voiceCloneCreateApprovalDetail,
  voiceCloneCreatePreviewText,
  voiceCloneCreateText,
  voiceCloneDeleteApprovalDetail,
  voiceCloneDeleteText,
  voiceClonePlanText,
  voiceCloneStatusText,
  voicePolicyApprovalDetail,
  voicePolicyNoopText,
  voicePolicyText,
  voiceSelectApprovalDetail,
  voiceSelectNoopText,
  voiceSelectText,
  voiceStatusText,
  type VoiceCloneCreateInput,
  type VoiceCloneCreatePreviewInput,
  type VoiceCloneManageInput,
  type VoiceClonePlanInput,
  type VoicePolicyInput,
  type VoiceSelectInput,
} from "./voiceSettingsTools";

export interface VoiceToolPermissionRequest {
  thread: ThreadSummary;
  workspace: WorkspaceState;
  toolName: string;
  title: string;
  message: string;
  detail: string;
  risk?: PermissionRisk;
  reusableScopes?: PermissionGrantScopeKind[];
  grantTargetLabel: string;
  grantTargetIdentity?: string;
  grantConditions?: Record<string, unknown>;
  requireFreshPrompt?: boolean;
  allowedReason: string;
  deniedReason: string;
}

interface VoiceSettingsAuditContext {
  source: VoiceSettingsAuditSource;
  toolName?: string;
  threadId?: string;
  summary?: string;
}

interface VoiceToolDogfoodResult {
  status: "succeeded";
  audioPath?: string;
  mimeType?: string;
  durationMs?: number;
}

export interface AgentRuntimeVoiceToolExtensionOptions {
  threadId: string;
  workspace: WorkspaceState;
  getThread: (threadId: string) => ThreadSummary;
  listProviders: (workspacePath: string) => Promise<VoiceProviderCandidate[]> | VoiceProviderCandidate[];
  voiceProviderWorkspacePathForCapabilityId: (providerCapabilityId: string | undefined) => Promise<string> | string;
  resolveFirstPartyPluginPermission: (input: VoiceToolPermissionRequest) => Promise<boolean>;
  dogfoodSelectedVoiceProvider: (
    thread: ThreadSummary,
    workspace: WorkspaceState,
    settings: VoiceSettings,
    options?: { text?: string },
  ) => Promise<VoiceToolDogfoodResult>;
  voice?: {
    readSettings: () => VoiceSettings;
    updateSettings?: (input: UpdateVoiceSettingsInput, audit?: VoiceSettingsAuditContext) => Promise<VoiceSettings> | VoiceSettings;
  };
}

export function createVoiceSettingsToolExtension(options: AgentRuntimeVoiceToolExtensionOptions): ExtensionFactory {
  const {
    threadId,
    workspace,
    getThread,
    listProviders,
    voiceProviderWorkspacePathForCapabilityId,
    resolveFirstPartyPluginPermission,
    dogfoodSelectedVoiceProvider,
    voice,
  } = options;

  return (pi) => {
    registerDesktopTool(pi, voiceToolDescriptor("ambient_voice_status"), {
      executionMode: "sequential",
      execute: async () => {
        const settings = voice?.readSettings();
        if (!settings) throw new Error("Ambient voice settings are not available in this runtime.");
        const providers = await listProviders(workspace.path);
        const result = buildVoiceStatus(settings, providers);
        return {
          content: [{ type: "text", text: voiceStatusText(result) }],
          details: {
            runtime: "ambient-voice",
            toolName: "ambient_voice_status",
            status: "complete",
            settings: result.settings,
            providerCount: result.providerCount,
            availableProviderCount: result.availableProviderCount,
            selectedProviderCapabilityId: result.selectedProvider?.capabilityId ?? result.settings.providerCapabilityId,
            selectedVoiceId: result.selectedVoice?.id ?? result.settings.voiceId,
            providers: result.providers,
          },
        };
      },
    });

    registerDesktopTool(pi, voiceToolDescriptor("ambient_voice_list_voices"), {
      executionMode: "sequential",
      execute: async (_toolCallId, params) => {
        const input = params as VoiceListInput;
        const providers = await listProviders(workspace.path);
        const cache = await readVoiceDiscoveryCache(await voiceProviderWorkspacePathForCapabilityId(input.providerCapabilityId));
        const result = listVoiceProviderVoices(providers, cache, input);
        return {
          content: [{ type: "text", text: voiceListText(result) }],
          details: {
            runtime: "ambient-voice",
            toolName: "ambient_voice_list_voices",
            status: "complete",
            providerCapabilityId: result.provider.capabilityId,
            providerLabel: result.provider.label,
            cacheStatus: result.cacheStatus,
            refreshedAt: result.refreshedAt,
            expiresAt: result.expiresAt,
            stale: result.stale,
            totalVoices: result.totalVoices,
            matchedVoices: result.matchedVoices,
            returnedVoices: result.returnedVoices,
            truncated: result.truncated,
            voices: result.voices,
          },
        };
      },
    });

    registerDesktopTool(pi, voiceToolDescriptor("ambient_voice_refresh_voices"), {
      executionMode: "sequential",
      execute: async (_toolCallId, params, _signal, onUpdate) => {
        const thread = getThread(threadId);
        if (thread.collaborationMode === "planner") throw new Error("Voice catalog refresh is blocked in Planner Mode.");
        const providers = await listProviders(workspace.path);
        const input = params as VoiceRefreshInput;
        const provider = providers.find((candidate) => candidate.capabilityId === input.providerCapabilityId);
        if (!provider) throw new Error(`Voice provider "${input.providerCapabilityId}" is not installed.`);
        if (!provider.voiceDiscovery) throw new Error(`Voice provider "${provider.label}" does not declare dynamic voice discovery.`);
        if (voiceRefreshRequiresApproval(provider)) {
          const discovery = provider.voiceDiscovery;
          const reason = optionalString(input.reason);
          const detail = [
            `Workspace: ${workspace.path}`,
            `Provider: ${provider.label} (${provider.capabilityId})`,
            `Package: ${provider.packageName}`,
            `Command: ${discovery.command} --list-voices`,
            `Source: ${discovery.source ?? "unspecified"}`,
            `Network: ${discovery.requiresNetwork ? "yes" : "no"}`,
            discovery.requiresSecret?.length ? `Required secrets: ${discovery.requiresSecret.join(", ")}` : undefined,
            discovery.cacheTtlSeconds ? `Cache TTL: ${discovery.cacheTtlSeconds}s` : undefined,
            reason ? `Reason: ${reason}` : undefined,
          ].filter(Boolean).join("\n");
          const allowed = await resolveFirstPartyPluginPermission({
            thread,
            workspace,
            toolName: "ambient_voice_refresh_voices",
            title: `Refresh voice catalog for "${provider.label}"?`,
            message: "Ambient wants to refresh cached voice metadata for this chat voice provider.",
            detail,
            grantTargetLabel: `Refresh voice catalog for ${provider.label}`,
            grantTargetIdentity: [
              "ambient_voice_refresh_voices",
              provider.capabilityId,
              provider.packageId,
              discovery.command,
              discovery.source ?? "",
              String(discovery.requiresNetwork === true),
              ...(discovery.requiresSecret ?? []),
            ].join("\0"),
            allowedReason: "Ambient voice catalog refresh approved by Ambient permission grant policy.",
            deniedReason: "Ambient voice catalog refresh prompt denied or timed out.",
          });
          if (!allowed) throw new Error("Ambient voice catalog refresh blocked by approval prompt.");
        }
        onUpdate?.(voiceToolUpdate("ambient_voice_refresh_voices", `Refreshing voice catalog for ${provider.label}.`));
        const providerWorkspacePath = await voiceProviderWorkspacePathForCapabilityId(provider.capabilityId);
        const result = await refreshVoiceProviderVoices(providerWorkspacePath, providers, input, runAmbientCliPackageCommand);
        return {
          content: [{ type: "text", text: voiceRefreshText(result) }],
          details: {
            runtime: "ambient-voice",
            toolName: "ambient_voice_refresh_voices",
            status: "complete",
            providerCapabilityId: result.provider.capabilityId,
            providerLabel: result.provider.label,
            source: result.entry.source,
            refreshedAt: result.entry.refreshedAt,
            expiresAt: result.entry.expiresAt,
            voiceCount: result.entry.voiceCount,
            durationMs: result.durationMs,
            stdoutArtifactPath: result.stdoutArtifactPath,
            stderrArtifactPath: result.stderrArtifactPath,
          },
        };
      },
    });

    registerDesktopTool(pi, voiceToolDescriptor("ambient_voice_clone_plan"), {
      executionMode: "sequential",
      execute: async (_toolCallId, params) => {
        const settings = voice?.readSettings();
        if (!settings) throw new Error("Ambient voice settings are not available in this runtime.");
        const providers = await listProviders(workspace.path);
        const plan = buildVoiceClonePlan(params as VoiceClonePlanInput, settings, providers);
        return {
          content: [{ type: "text", text: voiceClonePlanText(plan) }],
          details: {
            runtime: "ambient-voice",
            toolName: "ambient_voice_clone_plan",
            status: "complete",
            providerCapabilityId: plan.provider.capabilityId,
            providerLabel: plan.provider.label,
            selected: plan.selected,
            supported: plan.supported,
            voiceCloning: plan.provider.voiceCloning,
            requirements: plan.requirements,
            guardrails: plan.guardrails,
            nextSteps: plan.nextSteps,
          },
        };
      },
    });

    registerDesktopTool(pi, voiceToolDescriptor("ambient_voice_clone_create_preview"), {
      executionMode: "sequential",
      execute: async (_toolCallId, params) => {
        const settings = voice?.readSettings();
        if (!settings) throw new Error("Ambient voice settings are not available in this runtime.");
        const input = params as VoiceCloneCreatePreviewInput;
        const providers = await listProviders(workspace.path);
        const sourceFiles = voiceClonePreviewSourceFiles(workspace.path, input.sourceAudioFiles ?? []);
        const preview = buildVoiceCloneCreatePreview(input, settings, providers, sourceFiles);
        return {
          content: [{ type: "text", text: voiceCloneCreatePreviewText(preview) }],
          details: {
            runtime: "ambient-voice",
            toolName: "ambient_voice_clone_create_preview",
            status: preview.readyForCreateApproval ? "ready" : "blocked",
            providerCapabilityId: preview.provider.capabilityId,
            providerLabel: preview.provider.label,
            supported: preview.supported,
            consentConfirmed: preview.consentConfirmed,
            readyForCreateApproval: preview.readyForCreateApproval,
            cloneName: preview.cloneName,
            sourceFiles: preview.sourceFiles,
            errors: preview.errors,
            warnings: preview.warnings,
            guardrails: preview.guardrails,
            nextSteps: preview.nextSteps,
          },
        };
      },
    });

    registerDesktopTool(pi, voiceToolDescriptor("ambient_voice_clone_create"), {
      executionMode: "sequential",
      execute: async (_toolCallId, params, _signal, onUpdate) => {
        const thread = getThread(threadId);
        if (thread.collaborationMode === "planner") throw new Error("Voice clone creation is blocked in Planner Mode.");
        const settings = voice?.readSettings();
        if (!settings) throw new Error("Ambient voice settings are not available in this runtime.");
        const input = params as VoiceCloneCreateInput;
        const providers = await listProviders(workspace.path);
        const sourceFiles = voiceClonePreviewSourceFiles(workspace.path, input.sourceAudioFiles ?? []);
        const plan = buildVoiceCloneCreatePlan(input, settings, providers, sourceFiles);
        const detail = voiceCloneCreateApprovalDetail(plan, workspace.path);
        const allowed = await resolveFirstPartyPluginPermission({
          thread,
          workspace,
          toolName: "ambient_voice_clone_create",
          title: `Create cloned voice "${plan.cloneName}" with ${plan.provider.label}?`,
          message: "Ambient wants to create a cloned voice from user-selected source audio.",
          detail,
          grantTargetLabel: `Create cloned voice ${plan.cloneName}`,
          grantTargetIdentity: [
            "ambient_voice_clone_create",
            plan.provider.capabilityId,
            plan.createCommand,
            plan.cloneName ?? "",
            ...plan.sourceFiles.map((file) => `${file.path}:${file.bytes}`),
          ].join("\0"),
          allowedReason: "Ambient voice clone creation approved by Ambient permission grant policy.",
          deniedReason: "Ambient voice clone creation prompt denied or timed out.",
        });
        if (!allowed) throw new Error("Ambient voice clone creation blocked by approval prompt.");
        onUpdate?.(voiceToolUpdate("ambient_voice_clone_create", `Creating cloned voice "${plan.cloneName}" with ${plan.provider.label}.`));
        const providerWorkspacePath = await voiceProviderWorkspacePathForCapabilityId(plan.provider.capabilityId);
        const result = await runAmbientCliPackageCommand(providerWorkspacePath, {
          packageId: plan.provider.packageId,
          command: plan.createCommand,
          executionWorkspacePath: workspace.path,
          args: [
            "--clone-create",
            "--clone-name",
            plan.cloneName ?? "",
            ...(input.notes?.trim() ? ["--notes", input.notes.trim()] : []),
            ...sourceFiles.flatMap((file) => ["--source-audio", resolve(workspace.path, file.path)]),
          ],
        });
        const commandResult = parseVoiceCloneCreateStdout(result.stdout);
        const cacheEntry = await upsertVoiceDiscoveryCacheVoice(providerWorkspacePath, plan.provider, {
          id: commandResult.voiceId,
          ...(commandResult.label ?? plan.cloneName ? { label: commandResult.label ?? plan.cloneName } : {}),
          cloned: true,
          providerMetadata: {
            source: "ambient_voice_clone_create",
            providerId: commandResult.providerId,
            status: commandResult.status,
            localArtifactPaths: commandResult.localArtifactPaths,
            createdAt: new Date().toISOString(),
          },
        });
        let savedSettings: VoiceSettings | undefined;
        if (plan.selectCreatedVoice) {
          if (!voice?.updateSettings) throw new Error("Ambient voice settings updates are not available in this runtime.");
          const nextSettings: VoiceSettings = {
            ...settings,
            providerCapabilityId: plan.provider.capabilityId,
            voiceId: commandResult.voiceId,
            preferredVoicesByProvider: {
              ...(settings.preferredVoicesByProvider ?? {}),
              [plan.provider.capabilityId]: commandResult.voiceId,
            },
          };
          savedSettings = await voice.updateSettings(nextSettings, {
            source: "chat-tool",
            toolName: "ambient_voice_clone_create",
            threadId,
            summary: `Chat created and selected cloned voice ${commandResult.label ?? commandResult.voiceId}.`,
          });
        }
        return {
          content: [{
            type: "text",
            text: voiceCloneCreateText(plan, commandResult, {
              selected: Boolean(savedSettings),
              cacheUpdated: cacheEntry.voices.some((voice) => voice.id === commandResult.voiceId),
              durationMs: result.durationMs,
              ...(result.stdoutOutput?.artifactPath ? { stdoutArtifactPath: result.stdoutOutput.artifactPath } : {}),
              ...(result.stderrOutput?.artifactPath ? { stderrArtifactPath: result.stderrOutput.artifactPath } : {}),
            }),
          }],
          details: {
            runtime: "ambient-voice",
            toolName: "ambient_voice_clone_create",
            status: "complete",
            providerCapabilityId: plan.provider.capabilityId,
            providerLabel: plan.provider.label,
            voiceId: commandResult.voiceId,
            voiceLabel: commandResult.label ?? plan.cloneName,
            providerStatus: commandResult.status,
            localArtifactPaths: commandResult.localArtifactPaths,
            selected: Boolean(savedSettings),
            settings: savedSettings,
            cacheVoiceCount: cacheEntry.voiceCount,
            stdoutArtifactPath: result.stdoutOutput?.artifactPath,
            stderrArtifactPath: result.stderrOutput?.artifactPath,
          },
        };
      },
    });

    registerDesktopTool(pi, voiceToolDescriptor("ambient_voice_clone_status"), {
      executionMode: "sequential",
      execute: async (_toolCallId, params, _signal, onUpdate) => {
        const settings = voice?.readSettings();
        if (!settings) throw new Error("Ambient voice settings are not available in this runtime.");
        const providers = await listProviders(workspace.path);
        const plan = buildVoiceCloneManagePlan(params as VoiceCloneManageInput, settings, providers);
        if (!plan.statusCommand) throw new Error(`Voice provider "${plan.provider.label}" does not declare a reviewed clone status command.`);
        if (plan.statusCommand !== plan.provider.command) throw new Error(`Voice provider "${plan.provider.label}" clone statusCommand "${plan.statusCommand}" is not the installed provider command "${plan.provider.command}".`);
        onUpdate?.(voiceToolUpdate("ambient_voice_clone_status", `Checking cloned voice "${plan.voice.id}" with ${plan.provider.label}.`));
        const providerWorkspacePath = await voiceProviderWorkspacePathForCapabilityId(plan.provider.capabilityId);
        const result = await runAmbientCliPackageCommand(providerWorkspacePath, {
          packageId: plan.provider.packageId,
          command: plan.statusCommand,
          executionWorkspacePath: workspace.path,
          args: ["--clone-status", "--voice-id", plan.voice.id],
        });
        const status = parseVoiceCloneCreateStdout(result.stdout);
        const cache = await readVoiceDiscoveryCache(providerWorkspacePath);
        const cachedVoice = cache.providers[plan.provider.capabilityId]?.voices.find((voice) => voice.id === status.voiceId);
        const localArtifacts = (status.localArtifactPaths ?? []).map((path) => {
          const absolutePath = resolve(workspace.path, path);
          return {
            path,
            exists: isPathInside(workspace.path, absolutePath) && existsSync(absolutePath),
          };
        });
        const reconcile = {
          ...(cachedVoice ? { cachedVoice } : {}),
          ...(localArtifacts.length ? { localArtifacts } : {}),
        };
        const summary = summarizeVoiceCloneStatus(plan.provider, status, reconcile);
        return {
          content: [{ type: "text", text: voiceCloneStatusText(plan, status, reconcile) }],
          details: {
            runtime: "ambient-voice",
            toolName: "ambient_voice_clone_status",
            status: "complete",
            providerCapabilityId: plan.provider.capabilityId,
            providerLabel: plan.provider.label,
            voiceId: status.voiceId,
            voiceLabel: status.label ?? plan.voice.label,
            providerStatus: status.status,
            readiness: summary.readiness,
            readyForSelection: summary.readyForSelection,
            shouldRetryStatus: summary.shouldRetryStatus,
            progressPercent: summary.progressPercent,
            retryAfterSeconds: summary.retryAfterSeconds,
            dashboardUrl: summary.dashboardUrl,
            verificationUrl: summary.verificationUrl,
            failureReason: summary.failureReason,
            cacheStatus: summary.cacheStatus,
            localArtifactPaths: summary.localArtifactPaths,
            missingLocalArtifactPaths: summary.missingLocalArtifactPaths,
            nextSteps: summary.nextSteps,
            cloned: status.cloned,
            stdoutArtifactPath: result.stdoutOutput?.artifactPath,
            stderrArtifactPath: result.stderrOutput?.artifactPath,
          },
        };
      },
    });

    registerDesktopTool(pi, voiceToolDescriptor("ambient_voice_clone_delete"), {
      executionMode: "sequential",
      execute: async (_toolCallId, params, _signal, onUpdate) => {
        const thread = getThread(threadId);
        if (thread.collaborationMode === "planner") throw new Error("Voice clone deletion is blocked in Planner Mode.");
        const settings = voice?.readSettings();
        if (!settings) throw new Error("Ambient voice settings are not available in this runtime.");
        const providers = await listProviders(workspace.path);
        const plan = buildVoiceCloneManagePlan(params as VoiceCloneManageInput, settings, providers);
        if (!plan.deleteCommand) throw new Error(`Voice provider "${plan.provider.label}" does not declare a reviewed clone delete command.`);
        if (plan.deleteCommand !== plan.provider.command) throw new Error(`Voice provider "${plan.provider.label}" clone deleteCommand "${plan.deleteCommand}" is not the installed provider command "${plan.provider.command}".`);
        const detail = voiceCloneDeleteApprovalDetail(plan, workspace.path);
        const allowed = await resolveFirstPartyPluginPermission({
          thread,
          workspace,
          toolName: "ambient_voice_clone_delete",
          title: `Delete cloned voice "${plan.voice.label ?? plan.voice.id}"?`,
          message: "Ambient wants to delete a cloned voice from the selected voice provider.",
          detail,
          grantTargetLabel: `Delete cloned voice ${plan.voice.label ?? plan.voice.id}`,
          grantTargetIdentity: ["ambient_voice_clone_delete", plan.provider.capabilityId, plan.deleteCommand, plan.voice.id].join("\0"),
          allowedReason: "Ambient voice clone deletion approved by Ambient permission grant policy.",
          deniedReason: "Ambient voice clone deletion prompt denied or timed out.",
        });
        if (!allowed) throw new Error("Ambient voice clone deletion blocked by approval prompt.");
        onUpdate?.(voiceToolUpdate("ambient_voice_clone_delete", `Deleting cloned voice "${plan.voice.id}" with ${plan.provider.label}.`));
        const providerWorkspacePath = await voiceProviderWorkspacePathForCapabilityId(plan.provider.capabilityId);
        const result = await runAmbientCliPackageCommand(providerWorkspacePath, {
          packageId: plan.provider.packageId,
          command: plan.deleteCommand,
          executionWorkspacePath: workspace.path,
          args: ["--clone-delete", "--voice-id", plan.voice.id],
        });
        const deleted = parseVoiceCloneDeleteStdout(result.stdout, plan.voice.id);
        const cacheEntry = await removeVoiceDiscoveryCacheVoice(providerWorkspacePath, plan.provider.capabilityId, deleted.voiceId);
        let savedSettings: VoiceSettings | undefined;
        const selectedVoiceCleared = settings.providerCapabilityId === plan.provider.capabilityId && settings.voiceId === deleted.voiceId;
        if (selectedVoiceCleared) {
          if (!voice?.updateSettings) throw new Error("Ambient voice settings updates are not available in this runtime.");
          const fallbackVoice = plan.provider.voices.find((voice) => voice.id !== deleted.voiceId);
          const preferredVoicesByProvider = { ...(settings.preferredVoicesByProvider ?? {}) };
          delete preferredVoicesByProvider[plan.provider.capabilityId];
          savedSettings = await voice.updateSettings({
            ...settings,
            ...(fallbackVoice ? { voiceId: fallbackVoice.id } : { voiceId: undefined }),
            preferredVoicesByProvider,
          }, {
            source: "chat-tool",
            toolName: "ambient_voice_clone_delete",
            threadId,
            summary: `Chat deleted cloned voice ${plan.voice.label ?? deleted.voiceId}.`,
          });
        }
        return {
          content: [{
            type: "text",
            text: voiceCloneDeleteText(plan, deleted, {
              cacheUpdated: Boolean(cacheEntry),
              selectedVoiceCleared,
              durationMs: result.durationMs,
              ...(result.stdoutOutput?.artifactPath ? { stdoutArtifactPath: result.stdoutOutput.artifactPath } : {}),
              ...(result.stderrOutput?.artifactPath ? { stderrArtifactPath: result.stderrOutput.artifactPath } : {}),
            }),
          }],
          details: {
            runtime: "ambient-voice",
            toolName: "ambient_voice_clone_delete",
            status: "complete",
            providerCapabilityId: plan.provider.capabilityId,
            providerLabel: plan.provider.label,
            voiceId: deleted.voiceId,
            deleted: deleted.deleted,
            selectedVoiceCleared,
            settings: savedSettings,
            cacheVoiceCount: cacheEntry?.voiceCount,
            removedArtifactPaths: deleted.removedArtifactPaths,
            stdoutArtifactPath: result.stdoutOutput?.artifactPath,
            stderrArtifactPath: result.stderrOutput?.artifactPath,
          },
        };
      },
    });

    registerDesktopTool(pi, voiceToolDescriptor("ambient_voice_select"), {
      executionMode: "sequential",
      execute: async (_toolCallId, params, _signal, onUpdate) => {
        const thread = getThread(threadId);
        if (thread.collaborationMode === "planner") throw new Error("Voice settings changes are blocked in Planner Mode.");
        const current = voice?.readSettings();
        if (!current || !voice?.updateSettings) throw new Error("Ambient voice settings updates are not available in this runtime.");
        const providers = await listProviders(workspace.path);
        const plan = planVoiceSelection(params as VoiceSelectInput, current, providers);
        if (!plan.hasChanges) {
          return {
            content: [{ type: "text", text: voiceSelectNoopText(plan) }],
            details: {
              runtime: "ambient-voice",
              toolName: "ambient_voice_select",
              status: "no-op",
              previousSettings: plan.previousSettings,
              settings: plan.nextSettings,
              selectedProviderCapabilityId: plan.nextProvider.capabilityId,
              selectedVoiceId: plan.nextSettings.voiceId,
            },
          };
        }
        const detail = voiceSelectApprovalDetail(plan, workspace.path);
        const allowed = await resolveFirstPartyPluginPermission({
          thread,
          workspace,
          toolName: "ambient_voice_select",
          title: `Switch Ambient voice to "${plan.nextProvider.label}"?`,
          message: "Ambient wants to update the selected chat voice provider or voice.",
          detail,
          grantTargetLabel: `Switch Ambient voice to ${plan.nextProvider.label}`,
          grantTargetIdentity: [
            "ambient_voice_select",
            plan.previousSettings.providerCapabilityId ?? "",
            plan.previousSettings.voiceId ?? "",
            plan.nextSettings.providerCapabilityId ?? "",
            plan.nextSettings.voiceId ?? "",
            String(plan.nextSettings.enabled),
            String(plan.nextSettings.autoplay),
            plan.nextSettings.format,
          ].join("\0"),
          allowedReason: "Ambient voice settings change approved by Ambient permission grant policy.",
          deniedReason: "Ambient voice settings change prompt denied or timed out.",
        });
        if (!allowed) throw new Error("Ambient voice settings change blocked by approval prompt.");
        onUpdate?.(voiceToolUpdate("ambient_voice_select", `Switching Ambient voice provider to ${plan.nextProvider.label}.`));
        const savedSettings = await voice.updateSettings(plan.nextSettings, {
          source: "chat-tool",
          toolName: "ambient_voice_select",
          threadId,
          summary: `Chat switched voice provider to ${plan.nextProvider.label}.`,
        });
        return {
          content: [{ type: "text", text: voiceSelectText(plan, savedSettings) }],
          details: {
            runtime: "ambient-voice",
            toolName: "ambient_voice_select",
            status: "complete",
            previousSettings: plan.previousSettings,
            settings: savedSettings,
            previousProviderCapabilityId: plan.previousProvider?.capabilityId,
            selectedProviderCapabilityId: plan.nextProvider.capabilityId,
            selectedVoiceId: savedSettings.voiceId,
          },
        };
      },
    });

    registerDesktopTool(pi, voiceToolDescriptor("ambient_voice_policy_update"), {
      executionMode: "sequential",
      execute: async (_toolCallId, params, _signal, onUpdate) => {
        const thread = getThread(threadId);
        if (thread.collaborationMode === "planner") throw new Error("Voice policy changes are blocked in Planner Mode.");
        const current = voice?.readSettings();
        if (!current || !voice?.updateSettings) throw new Error("Ambient voice settings updates are not available in this runtime.");
        const plan = planVoicePolicyUpdate(params as VoicePolicyInput, current);
        if (!plan.hasChanges) {
          return {
            content: [{ type: "text", text: voicePolicyNoopText(plan) }],
            details: {
              runtime: "ambient-voice",
              toolName: "ambient_voice_policy_update",
              status: "no-op",
              previousSettings: plan.previousSettings,
              settings: plan.nextSettings,
            },
          };
        }
        const detail = voicePolicyApprovalDetail(plan, workspace.path);
        const allowed = await resolveFirstPartyPluginPermission({
          thread,
          workspace,
          toolName: "ambient_voice_policy_update",
          title: "Update Ambient voice policy?",
          message: "Ambient wants to update chat voice output policy settings.",
          detail,
          grantTargetLabel: "Update Ambient voice policy",
          grantTargetIdentity: [
            "ambient_voice_policy_update",
            String(plan.previousSettings.enabled),
            String(plan.previousSettings.autoplay),
            plan.previousSettings.mode,
            plan.previousSettings.longReply,
            String(plan.previousSettings.maxChars),
            String(plan.previousSettings.artifactCacheMaxMb),
            String(plan.nextSettings.enabled),
            String(plan.nextSettings.autoplay),
            plan.nextSettings.mode,
            plan.nextSettings.longReply,
            String(plan.nextSettings.maxChars),
            String(plan.nextSettings.artifactCacheMaxMb),
          ].join("\0"),
          allowedReason: "Ambient voice policy change approved by Ambient permission grant policy.",
          deniedReason: "Ambient voice policy change prompt denied or timed out.",
        });
        if (!allowed) throw new Error("Ambient voice policy change blocked by approval prompt.");
        onUpdate?.(voiceToolUpdate("ambient_voice_policy_update", "Updating Ambient voice policy settings."));
        const savedSettings = await voice.updateSettings(plan.nextSettings, {
          source: "chat-tool",
          toolName: "ambient_voice_policy_update",
          threadId,
          summary: "Chat updated voice policy settings.",
        });
        return {
          content: [{ type: "text", text: voicePolicyText(plan, savedSettings) }],
          details: {
            runtime: "ambient-voice",
            toolName: "ambient_voice_policy_update",
            status: "complete",
            previousSettings: plan.previousSettings,
            settings: savedSettings,
          },
        };
      },
    });

    registerDesktopTool(pi, voiceToolDescriptor("ambient_voice_test"), {
      executionMode: "sequential",
      execute: async (_toolCallId, params, _signal, onUpdate) => {
        const thread = getThread(threadId);
        if (thread.collaborationMode === "planner") throw new Error("Voice provider tests are blocked in Planner Mode.");
        const settings = voice?.readSettings();
        if (!settings?.providerCapabilityId) throw new Error("Select an available voice provider before testing voice output.");
        const providers = await listProviders(workspace.path);
        const selectedProvider = providers.find((provider) => provider.capabilityId === settings.providerCapabilityId);
        if (!selectedProvider) throw new Error(`Selected voice provider "${settings.providerCapabilityId}" is not installed.`);
        if (!selectedProvider.available) throw new Error(`Selected voice provider "${selectedProvider.label}" is not available: ${selectedProvider.availabilityReason}`);
        const input = params as Record<string, unknown>;
        const text = shortVoiceTestText(input.text);
        const reason = optionalString(input.reason);
        const detail = [
          `Workspace: ${workspace.path}`,
          `Provider: ${selectedProvider.label} (${selectedProvider.capabilityId})`,
          `Voice: ${settings.voiceId ?? "default"}`,
          `Format: ${settings.format}`,
          `Test text: ${text}`,
          reason ? `Reason: ${reason}` : undefined,
        ].filter(Boolean).join("\n");
        const allowed = await resolveFirstPartyPluginPermission({
          thread,
          workspace,
          toolName: "ambient_voice_test",
          title: `Test Ambient voice provider "${selectedProvider.label}"?`,
          message: "Ambient wants to synthesize a short test phrase through the selected chat voice provider.",
          detail,
          grantTargetLabel: `Test Ambient voice provider ${selectedProvider.label}`,
          grantTargetIdentity: ["ambient_voice_test", settings.providerCapabilityId, settings.voiceId ?? "", settings.format, text].join("\0"),
          allowedReason: "Ambient voice provider test approved by Ambient permission grant policy.",
          deniedReason: "Ambient voice provider test prompt denied or timed out.",
        });
        if (!allowed) throw new Error("Ambient voice provider test blocked by approval prompt.");
        onUpdate?.(voiceToolUpdate("ambient_voice_test", `Testing Ambient voice provider ${selectedProvider.label}.`));
        const result = await dogfoodSelectedVoiceProvider(thread, workspace, settings, { text });
        return {
          content: [{ type: "text", text: voiceProviderTestText(selectedProvider.label, result) }],
          details: {
            runtime: "ambient-voice",
            toolName: "ambient_voice_test",
            status: "complete",
            testStatus: result.status,
            providerCapabilityId: selectedProvider.capabilityId,
            voiceId: settings.voiceId,
            audioPath: result.audioPath,
            mimeType: result.mimeType,
            durationMs: result.durationMs,
          },
        };
      },
    });
  };
}

function voiceToolUpdate(toolName: string, text: string): { content: { type: "text"; text: string }[]; details: Record<string, unknown> } {
  return {
    content: [{ type: "text", text }],
    details: {
      runtime: "ambient-voice",
      toolName,
      status: "running",
    },
  };
}

function shortVoiceTestText(value: unknown): string {
  const text = typeof value === "string" && value.trim() ? value.trim().replace(/\s+/g, " ") : "Ambient voice provider test.";
  return [...text].slice(0, 240).join("");
}

function voiceClonePreviewSourceFiles(workspacePath: string, sourceAudioFiles: string[]): Array<{ path: string; bytes: number; extension?: string }> {
  return sourceAudioFiles.map((filePath) => {
    const normalized = filePath.trim();
    if (!normalized) throw new Error("Voice clone source audio file paths must be non-empty.");
    const absolutePath = resolve(workspacePath, normalized);
    if (!isPathInside(workspacePath, absolutePath)) throw new Error(`Voice clone source audio file is outside the workspace: ${normalized}`);
    if (!existsSync(absolutePath)) throw new Error(`Voice clone source audio file was not found: ${normalized}`);
    const stat = statSync(absolutePath);
    if (!stat.isFile()) throw new Error(`Voice clone source audio path is not a file: ${normalized}`);
    const relativePath = relative(workspacePath, absolutePath).split("/").join("/");
    const extension = extname(absolutePath).replace(/^\./, "").toLowerCase();
    return {
      path: relativePath,
      bytes: stat.size,
      ...(extension ? { extension } : {}),
    };
  });
}

function voiceProviderTestText(providerLabel: string, result: VoiceToolDogfoodResult): string {
  return [
    "Ambient voice provider test succeeded",
    `Provider: ${providerLabel}`,
    result.audioPath ? `Audio: ${result.audioPath}` : undefined,
    result.mimeType ? `MIME type: ${result.mimeType}` : undefined,
    result.durationMs !== undefined ? `Duration: ${result.durationMs} ms` : undefined,
  ].filter(Boolean).join("\n");
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
