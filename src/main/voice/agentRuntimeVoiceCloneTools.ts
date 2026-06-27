import { existsSync, statSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";

import type { UpdateVoiceSettingsInput } from "../../shared/desktopTypes";
import type { VoiceProviderCandidate, VoiceSettings, VoiceSettingsAuditSource } from "../../shared/localRuntimeTypes";
import type { PermissionGrantScopeKind, PermissionRisk } from "../../shared/permissionTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import { registerDesktopTool, voiceToolDescriptor } from "./voiceDesktopToolFacade";
import { isPathInside } from "./voiceSessionFacade";
import {
  readVoiceDiscoveryCache,
  removeVoiceDiscoveryCacheVoice,
  upsertVoiceDiscoveryCacheVoice,
} from "./voiceDiscoveryCache";
import {
  buildVoiceCloneCreatePlan,
  buildVoiceCloneCreatePreview,
  buildVoiceCloneManagePlan,
  buildVoiceClonePlan,
  parseVoiceCloneCreateStdout,
  parseVoiceCloneDeleteStdout,
  summarizeVoiceCloneStatus,
  voiceCloneCreateApprovalDetail,
  voiceCloneCreatePreviewText,
  voiceCloneCreateText,
  voiceCloneDeleteApprovalDetail,
  voiceCloneDeleteText,
  voiceClonePlanText,
  voiceCloneStatusText,
  type VoiceCloneCreateInput,
  type VoiceCloneCreatePreviewInput,
  type VoiceCloneManageInput,
  type VoiceClonePlanInput,
} from "./voiceSettingsTools";
import { runAmbientCliPackageCommand } from "./voiceAmbientCliFacade";
import { voiceToolUpdate } from "./agentRuntimeVoiceToolSupport";

type VoiceToolRegistrar = Parameters<ExtensionFactory>[0];

interface VoiceCloneSettingsAuditContext {
  source: VoiceSettingsAuditSource;
  toolName?: string;
  threadId?: string;
  summary?: string;
}

interface VoiceCloneToolPermissionRequest {
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

export interface VoiceCloneToolRegistrationOptions {
  threadId: string;
  workspace: WorkspaceState;
  getThread: (threadId: string) => ThreadSummary;
  listProviders: (workspacePath: string) => Promise<VoiceProviderCandidate[]> | VoiceProviderCandidate[];
  voiceProviderWorkspacePathForCapabilityId: (providerCapabilityId: string | undefined) => Promise<string> | string;
  resolveFirstPartyPluginPermission: (input: VoiceCloneToolPermissionRequest) => Promise<boolean>;
  voice?: {
    readSettings: () => VoiceSettings;
    updateSettings?: (input: UpdateVoiceSettingsInput, audit?: VoiceCloneSettingsAuditContext) => Promise<VoiceSettings> | VoiceSettings;
  };
}

export function registerVoiceCloneTools(
  pi: VoiceToolRegistrar,
  {
    threadId,
    workspace,
    getThread,
    listProviders,
    voiceProviderWorkspacePathForCapabilityId,
    resolveFirstPartyPluginPermission,
    voice,
  }: VoiceCloneToolRegistrationOptions,
): void {
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
