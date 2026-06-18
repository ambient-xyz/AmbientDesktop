import { existsSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";

import type { UpdateSttSettingsInput } from "../../shared/desktopTypes";
import type { SttProviderCandidate, SttSettings } from "../../shared/localRuntimeTypes";
import type { PermissionGrantScopeKind, PermissionRisk } from "../../shared/permissionTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import { sttToolDescriptor } from "../desktop-tools/desktopToolRegistry";
import { registerDesktopTool } from "../desktop-tools/desktopToolRegistration";
import { runAmbientCliPackageCommand } from "./sttAmbientCliFacade";
import { managedSttThreadRoot } from "./sttArtifacts";
import { transcribeWithAmbientCliSttProvider, type AmbientCliSttRunner } from "./sttProvider";
import {
  buildSttStatus,
  planSttPolicyUpdate,
  planSttSelection,
  sttPolicyApprovalDetail,
  sttPolicyNoopText,
  sttPolicyText,
  sttProviderTestText,
  sttSelectApprovalDetail,
  sttSelectNoopText,
  sttSelectText,
  sttStatusText,
  type SttPolicyInput,
  type SttSelectInput,
  type SttTestInput,
} from "./sttSettingsTools";

export interface SttToolPermissionRequest {
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

export interface AgentRuntimeSttToolExtensionOptions {
  threadId: string;
  workspace: WorkspaceState;
  getThread: (threadId: string) => ThreadSummary;
  listProviders: (workspacePath: string) => Promise<SttProviderCandidate[]> | SttProviderCandidate[];
  resolveFirstPartyPluginPermission: (input: SttToolPermissionRequest) => Promise<boolean>;
  stt?: {
    readSettings: () => SttSettings;
    updateSettings?: (input: UpdateSttSettingsInput) => Promise<SttSettings> | SttSettings;
    testRunner?: AmbientCliSttRunner;
  };
}

export function createSttSettingsToolExtension(options: AgentRuntimeSttToolExtensionOptions): ExtensionFactory {
  const { threadId, workspace, getThread, listProviders, resolveFirstPartyPluginPermission, stt } = options;
  return (pi) => {
    registerDesktopTool(pi, sttToolDescriptor("ambient_stt_status"), {
      executionMode: "sequential",
      execute: async () => {
        const settings = stt?.readSettings();
        if (!settings) throw new Error("Ambient STT settings are not available in this runtime.");
        const providers = await listProviders(workspace.path);
        const result = buildSttStatus(settings, providers);
        return {
          content: [{ type: "text", text: sttStatusText(result) }],
          details: {
            runtime: "ambient-stt",
            toolName: "ambient_stt_status",
            status: "complete",
            settings: result.settings,
            providerCount: result.providerCount,
            availableProviderCount: result.availableProviderCount,
            selectedProviderCapabilityId: result.selectedProvider?.capabilityId ?? result.settings.providerCapabilityId,
            providers: result.providers,
          },
        };
      },
    });

    registerDesktopTool(pi, sttToolDescriptor("ambient_stt_select"), {
      executionMode: "sequential",
      execute: async (_toolCallId, params, _signal, onUpdate) => {
        const thread = getThread(threadId);
        if (thread.collaborationMode === "planner") throw new Error("STT settings changes are blocked in Planner Mode.");
        const current = stt?.readSettings();
        if (!current || !stt?.updateSettings) throw new Error("Ambient STT settings updates are not available in this runtime.");
        const providers = await listProviders(workspace.path);
        const plan = planSttSelection(params as SttSelectInput, current, providers);
        if (!plan.hasChanges) {
          return {
            content: [{ type: "text", text: sttSelectNoopText(plan) }],
            details: {
              runtime: "ambient-stt",
              toolName: "ambient_stt_select",
              status: "no-op",
              previousSettings: plan.previousSettings,
              settings: plan.nextSettings,
              selectedProviderCapabilityId: plan.nextProvider.capabilityId,
            },
          };
        }
        const detail = sttSelectApprovalDetail(plan, workspace.path);
        const allowed = await resolveFirstPartyPluginPermission({
          thread,
          workspace,
          toolName: "ambient_stt_select",
          title: `Switch Ambient speech input to "${plan.nextProvider.label}"?`,
          message: "Ambient wants to update the selected speech input provider or spoken language.",
          detail,
          grantTargetLabel: `Switch Ambient speech input to ${plan.nextProvider.label}`,
          grantTargetIdentity: [
            "ambient_stt_select",
            plan.previousSettings.providerCapabilityId ?? "",
            plan.previousSettings.spokenLanguage,
            plan.nextSettings.providerCapabilityId ?? "",
            plan.nextSettings.spokenLanguage,
            String(plan.nextSettings.enabled),
          ].join("\0"),
          allowedReason: "Ambient STT settings change approved by Ambient permission grant policy.",
          deniedReason: "Ambient STT settings change prompt denied or timed out.",
        });
        if (!allowed) throw new Error("Ambient STT settings change blocked by approval prompt.");
        onUpdate?.(sttToolUpdate("ambient_stt_select", `Switching Ambient speech input provider to ${plan.nextProvider.label}.`));
        const savedSettings = await stt.updateSettings(plan.nextSettings);
        return {
          content: [{ type: "text", text: sttSelectText(plan, savedSettings) }],
          details: {
            runtime: "ambient-stt",
            toolName: "ambient_stt_select",
            status: "complete",
            previousSettings: plan.previousSettings,
            settings: savedSettings,
            previousProviderCapabilityId: plan.previousProvider?.capabilityId,
            selectedProviderCapabilityId: plan.nextProvider.capabilityId,
          },
        };
      },
    });

    registerDesktopTool(pi, sttToolDescriptor("ambient_stt_policy_update"), {
      executionMode: "sequential",
      execute: async (_toolCallId, params, _signal, onUpdate) => {
        const thread = getThread(threadId);
        if (thread.collaborationMode === "planner") throw new Error("STT policy changes are blocked in Planner Mode.");
        const current = stt?.readSettings();
        if (!current || !stt?.updateSettings) throw new Error("Ambient STT settings updates are not available in this runtime.");
        const providers = await listProviders(workspace.path);
        const plan = planSttPolicyUpdate(params as SttPolicyInput, current, providers);
        if (!plan.hasChanges) {
          return {
            content: [{ type: "text", text: sttPolicyNoopText(plan) }],
            details: {
              runtime: "ambient-stt",
              toolName: "ambient_stt_policy_update",
              status: "no-op",
              previousSettings: plan.previousSettings,
              settings: plan.nextSettings,
            },
          };
        }
        const detail = sttPolicyApprovalDetail(plan, workspace.path);
        const allowed = await resolveFirstPartyPluginPermission({
          thread,
          workspace,
          toolName: "ambient_stt_policy_update",
          title: "Update Ambient speech input policy?",
          message: "Ambient wants to update speech input policy settings.",
          detail,
          grantTargetLabel: "Update Ambient STT policy",
          grantTargetIdentity: [
            "ambient_stt_policy_update",
            JSON.stringify(plan.previousSettings),
            JSON.stringify(plan.nextSettings),
          ].join("\0"),
          allowedReason: "Ambient STT policy change approved by Ambient permission grant policy.",
          deniedReason: "Ambient STT policy change prompt denied or timed out.",
        });
        if (!allowed) throw new Error("Ambient STT policy change blocked by approval prompt.");
        onUpdate?.(sttToolUpdate("ambient_stt_policy_update", "Updating Ambient speech input policy settings."));
        const savedSettings = await stt.updateSettings(plan.nextSettings);
        return {
          content: [{ type: "text", text: sttPolicyText(plan, savedSettings) }],
          details: {
            runtime: "ambient-stt",
            toolName: "ambient_stt_policy_update",
            status: "complete",
            previousSettings: plan.previousSettings,
            settings: savedSettings,
          },
        };
      },
    });

    registerDesktopTool(pi, sttToolDescriptor("ambient_stt_test"), {
      executionMode: "sequential",
      execute: async (_toolCallId, params, _signal, onUpdate) => {
        const thread = getThread(threadId);
        if (thread.collaborationMode === "planner") throw new Error("STT provider tests are blocked in Planner Mode.");
        const settings = stt?.readSettings();
        if (!settings?.providerCapabilityId) throw new Error("Select an available STT provider before testing speech input.");
        const providers = await listProviders(workspace.path);
        const selectedProvider = providers.find((provider) => provider.capabilityId === settings.providerCapabilityId);
        if (!selectedProvider) throw new Error(`Selected STT provider "${settings.providerCapabilityId}" is not installed.`);
        if (!selectedProvider.available) throw new Error(`Selected STT provider "${selectedProvider.label}" is not available: ${selectedProvider.availabilityReason}`);
        const input = params as SttTestInput;
        const audioPath = optionalString(input.audioPath) ?? latestSettingsSttValidationAudioPath(workspace.path);
        if (!audioPath) throw new Error("Pass a workspace-relative WAV audioPath, or record a Settings microphone validation sample first.");
        const spokenLanguage = optionalString(input.spokenLanguage) ?? settings.spokenLanguage;
        const testSettings: SttSettings = {
          ...settings,
          enabled: true,
          providerCapabilityId: selectedProvider.capabilityId,
          spokenLanguage,
        };
        const reason = optionalString(input.reason);
        const detail = [
          `Workspace: ${workspace.path}`,
          `Provider: ${selectedProvider.label} (${selectedProvider.capabilityId})`,
          `Audio artifact: ${audioPath}`,
          `Spoken language: ${spokenLanguage}`,
          `No-speech gate: ${testSettings.noSpeechGate.enabled} at ${testSettings.noSpeechGate.rmsThresholdDbfs} dBFS RMS`,
          reason ? `Reason: ${reason}` : undefined,
          "Raw audio bytes will not be returned to the agent.",
        ].filter(Boolean).join("\n");
        const allowed = await resolveFirstPartyPluginPermission({
          thread,
          workspace,
          toolName: "ambient_stt_test",
          title: `Test Ambient STT provider "${selectedProvider.label}"?`,
          message: "Ambient wants to transcribe a workspace audio artifact through the selected speech input provider.",
          detail,
          grantTargetLabel: `Test Ambient STT provider ${selectedProvider.label}`,
          grantTargetIdentity: ["ambient_stt_test", settings.providerCapabilityId, audioPath, spokenLanguage].join("\0"),
          allowedReason: "Ambient STT provider test approved by Ambient permission grant policy.",
          deniedReason: "Ambient STT provider test prompt denied or timed out.",
        });
        if (!allowed) throw new Error("Ambient STT provider test blocked by approval prompt.");
        onUpdate?.(sttToolUpdate("ambient_stt_test", `Testing Ambient STT provider ${selectedProvider.label}.`));
        const state = await transcribeWithAmbientCliSttProvider({
          workspacePath: workspace.path,
          threadId: "stt-tool-test",
          utteranceId: `stt-tool-test-${Date.now().toString(36)}`,
          audioPath,
          settings: testSettings,
          runner: stt?.testRunner ?? runAmbientCliPackageCommand,
        });
        return {
          content: [{ type: "text", text: sttProviderTestText(selectedProvider.label, state) }],
          details: {
            runtime: "ambient-stt",
            toolName: "ambient_stt_test",
            status: "complete",
            testStatus: state.status,
            providerCapabilityId: selectedProvider.capabilityId,
            language: state.language,
            transcript: state.text,
            audioPath: state.audioPath,
            normalizedAudioPath: state.normalizedAudioPath,
            transcriptPath: state.transcriptPath,
            jsonPath: state.jsonPath,
            stdoutPath: state.stdoutPath,
            stderrPath: state.stderrPath,
            durationMs: state.durationMs,
            noSpeechGate: state.noSpeechGate,
          },
        };
      },
    });
  };
}

function sttToolUpdate(toolName: string, text: string): { content: { type: "text"; text: string }[]; details: Record<string, unknown> } {
  return {
    content: [{ type: "text", text }],
    details: {
      runtime: "ambient-stt",
      toolName,
      status: "running",
    },
  };
}

function latestSettingsSttValidationAudioPath(workspacePath: string): string | undefined {
  const validationRoot = managedSttThreadRoot(workspacePath, "validation");
  if (!existsSync(validationRoot)) return undefined;
  const candidates = readdirSync(validationRoot)
    .filter((name) => name.endsWith(".raw.wav"))
    .map((name) => {
      const absolutePath = resolve(validationRoot, name);
      const stats = statSync(absolutePath);
      return stats.isFile() ? { absolutePath, mtimeMs: stats.mtimeMs } : undefined;
    })
    .filter((candidate): candidate is { absolutePath: string; mtimeMs: number } => Boolean(candidate))
    .sort((left, right) => right.mtimeMs - left.mtimeMs);
  const latest = candidates[0]?.absolutePath;
  return latest ? relative(workspacePath, latest).replace(/\\/g, "/") : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
