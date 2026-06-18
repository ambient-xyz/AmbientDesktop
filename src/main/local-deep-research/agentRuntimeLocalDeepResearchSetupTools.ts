import type { AgentToolResult, ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type {
  DesktopEvent,
} from "../../shared/desktopTypes";
import type {
  LocalDeepResearchInstallProgress,
  LocalDeepResearchSetupAction,
  LocalDeepResearchSetupResult,
  LocalDeepResearchSmokeResult,
  LocalDeepResearchValidationResult,
  LocalModelResourcePolicyDecision,
} from "../../shared/localRuntimeTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import {
  formatLocalDeepResearchBytes,
  localDeepResearchSetupToolInput,
} from "./agentRuntimeLocalDeepResearchInput";
import { localDeepResearchToolDescriptor } from "../desktop-tools/desktopToolRegistry";
import { registerDesktopTool } from "../desktop-tools/desktopToolRegistration";
import {
  installLocalDeepResearchManagedAssets,
  localDeepResearchInstallText,
  type LocalDeepResearchInstallRequest,
  type LocalDeepResearchInstallServiceResult,
} from "./localDeepResearchInstallService";
import type { LocalDeepResearchManagedAssetDetection } from "./localDeepResearchManagedAssets";
import type { LocalDeepResearchModelProfileId } from "./localDeepResearchModelProfiles";
import {
  localDeepResearchSetupContractText,
  type LocalDeepResearchSetupContract,
  type LocalDeepResearchSetupInput,
} from "./localDeepResearchSetup";
import {
  localDeepResearchSmokeText,
  runLocalDeepResearchRealAssetSmoke,
  type LocalDeepResearchSmokeRequest,
} from "./localDeepResearchSmoke";
import { localDeepResearchValidationText, validateLocalDeepResearchSetup } from "./localDeepResearchValidation";

const DEFAULT_LOCAL_DEEP_RESEARCH_INSTALL_TIMEOUT_MS = 60 * 60_000;
const DEFAULT_LOCAL_DEEP_RESEARCH_READINESS_TIMEOUT_MS = 90_000;

type LocalDeepResearchToolUpdate = AgentToolResult<Record<string, unknown>>;
type LocalDeepResearchToolUpdateHandler = (update: LocalDeepResearchToolUpdate) => void;

export interface LocalDeepResearchSetupReadiness {
  contract: LocalDeepResearchSetupContract;
  managedAssets: LocalDeepResearchManagedAssetDetection;
}

export interface LocalDeepResearchSetupToolRegistrationOptions {
  threadId: string;
  workspace: WorkspaceState;
  readReadiness: (
    workspace: WorkspaceState,
    input: LocalDeepResearchSetupInput,
    signal?: AbortSignal,
  ) => Promise<LocalDeepResearchSetupReadiness> | LocalDeepResearchSetupReadiness;
  emit: (event: DesktopEvent) => void;
  install?: (input: LocalDeepResearchInstallRequest) => Promise<LocalDeepResearchInstallServiceResult> | LocalDeepResearchInstallServiceResult;
  validate?: (input: {
    workspacePath: string;
    setup: LocalDeepResearchSetupContract;
    managedAssets: LocalDeepResearchManagedAssetDetection;
  }) => Promise<LocalDeepResearchValidationResult> | LocalDeepResearchValidationResult;
  smoke?: (input: LocalDeepResearchSmokeRequest) => Promise<LocalDeepResearchSmokeResult> | LocalDeepResearchSmokeResult;
  approveResourceLimitExceed?: (decision: LocalModelResourcePolicyDecision) => Promise<boolean> | boolean;
}

export function registerLocalDeepResearchSetupTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: LocalDeepResearchSetupToolRegistrationOptions,
): void {
  const { threadId, workspace } = options;

  registerDesktopTool(pi, localDeepResearchToolDescriptor("ambient_local_deep_research_setup"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, signal, onUpdate?: LocalDeepResearchToolUpdateHandler) => {
      const input = localDeepResearchSetupToolInput(params);
      const setupInput: LocalDeepResearchSetupInput = input.q8Override ? { q8Override: true } : {};
      onUpdate?.(localDeepResearchToolUpdate(
        "ambient_local_deep_research_setup",
        input.action === "status"
          ? "Reading Local Deep Research setup contract."
          : input.action === "validate"
            ? "Preparing Local Deep Research validation."
            : input.action === "smoke"
              ? "Preparing Local Deep Research real-asset smoke."
              : "Preparing Local Deep Research install.",
      ));
      let initial: LocalDeepResearchSetupReadiness;
      try {
        initial = await readLocalDeepResearchReadinessWithHeartbeat(options, workspace, setupInput, signal, onUpdate, "Local Deep Research setup status is still checking provider, model, and runtime state.");
      } catch (error) {
        return localDeepResearchReadinessErrorResult(input.action, error);
      }
      let installResult: LocalDeepResearchInstallServiceResult | undefined;
      let validationResult: LocalDeepResearchValidationResult | undefined;
      let smokeResult: LocalDeepResearchSmokeResult | undefined;
      if (input.action === "install" || input.action === "repair") {
        const installAction = input.action;
        onUpdate?.(localDeepResearchToolUpdate("ambient_local_deep_research_setup", "Installing Ambient-managed Local Deep Research assets."));
        const onInstallProgress = (progress: LocalDeepResearchInstallProgress) => {
          onUpdate?.(localDeepResearchInstallProgressToolUpdate("ambient_local_deep_research_setup", progress));
          options.emit({ type: "local-deep-research-install-progress", progress, workspacePath: workspace.path });
        };
        installResult = await withLocalDeepResearchToolHeartbeat(
          "ambient_local_deep_research_setup",
          "Local Deep Research install is still running. Large model downloads may take several minutes.",
          () => (
            options.install
              ? options.install({
                  workspacePath: workspace.path,
                  setup: initial.contract,
                  action: installAction,
                  installModel: true,
                  installRuntime: true,
                  signal,
                  onProgress: onInstallProgress,
                })
              : installLocalDeepResearchManagedAssets({
                  workspacePath: workspace.path,
                  setup: initial.contract,
                  action: installAction,
                  installModel: true,
                  installRuntime: true,
                  signal,
                  onProgress: onInstallProgress,
                })
          ),
          { signal, timeoutMs: localDeepResearchInstallTimeoutMs(), heartbeatMs: 10_000 },
          onUpdate,
        );
      }
      let refreshed: LocalDeepResearchSetupReadiness;
      try {
        refreshed = installResult
          ? await readLocalDeepResearchReadinessWithHeartbeat(options, workspace, setupInput, signal, onUpdate, "Local Deep Research setup status is refreshing after install.")
          : initial;
      } catch (error) {
        return localDeepResearchReadinessErrorResult(input.action, error, installResult);
      }
      const { contract, managedAssets } = refreshed;
      if (input.action === "validate") {
        onUpdate?.(localDeepResearchToolUpdate("ambient_local_deep_research_setup", "Running Local Deep Research validation."));
        validationResult = await (
          options.validate
            ? options.validate({
                workspacePath: workspace.path,
                setup: contract,
                managedAssets,
              })
            : validateLocalDeepResearchSetup({
                workspacePath: workspace.path,
                setup: contract,
                managedAssets,
              })
        );
      }
      if (input.action === "smoke") {
        onUpdate?.(localDeepResearchToolUpdate("ambient_local_deep_research_setup", "Running Local Deep Research real-asset smoke."));
        smokeResult = await (
          options.smoke
            ? options.smoke({
                workspacePath: workspace.path,
                setup: contract,
                managedAssets,
                ownerThreadId: threadId,
                approveResourceLimitExceed: options.approveResourceLimitExceed,
                signal,
              })
            : runLocalDeepResearchRealAssetSmoke({
                workspacePath: workspace.path,
                setup: contract,
                managedAssets,
                ownerThreadId: threadId,
                approveResourceLimitExceed: options.approveResourceLimitExceed,
                signal,
              })
        );
      }
      const text = installResult
        ? `${localDeepResearchInstallText(installResult)}\n\n${localDeepResearchSetupContractText(contract)}`
        : validationResult
          ? `${localDeepResearchValidationText(validationResult)}\n\n${localDeepResearchSetupContractText(contract)}`
          : smokeResult
            ? `${localDeepResearchSmokeText(smokeResult)}\n\n${localDeepResearchSetupContractText(contract)}`
            : localDeepResearchSetupContractText(contract);
      const setupResult = localDeepResearchSetupResultForDesktopEvent(
        input.action,
        contract,
        managedAssets,
        installResult,
        validationResult,
        smokeResult,
      );
      options.emit({ type: "local-deep-research-setup-updated", result: setupResult, workspacePath: workspace.path });
      return localDeepResearchToolResult(text, {
        toolName: "ambient_local_deep_research_setup",
        status: "complete",
        ...setupResult,
      });
    },
  });
}

function localDeepResearchToolUpdate(toolName: string, text: string): LocalDeepResearchToolUpdate {
  return {
    content: [{ type: "text", text }],
    details: {
      runtime: "ambient-local-deep-research",
      toolName,
      status: "running",
    },
  };
}

async function readLocalDeepResearchReadinessWithHeartbeat(
  options: LocalDeepResearchSetupToolRegistrationOptions,
  workspace: WorkspaceState,
  setupInput: LocalDeepResearchSetupInput,
  signal: AbortSignal | undefined,
  onUpdate: LocalDeepResearchToolUpdateHandler | undefined,
  heartbeatMessage: string,
): Promise<LocalDeepResearchSetupReadiness> {
  return withLocalDeepResearchToolHeartbeat(
    "ambient_local_deep_research_setup",
    heartbeatMessage,
    () => options.readReadiness(workspace, setupInput, signal),
    { signal, timeoutMs: localDeepResearchReadinessTimeoutMs(), heartbeatMs: 10_000 },
    onUpdate,
  );
}

function localDeepResearchInstallProgressToolUpdate(
  toolName: string,
  progress: LocalDeepResearchInstallProgress,
): AgentToolResult<Record<string, unknown>> {
  return {
    content: [{ type: "text", text: localDeepResearchInstallProgressText(progress) }],
    details: {
      runtime: "ambient-local-deep-research",
      toolName,
      status: "running",
      progress,
    },
  };
}

function localDeepResearchInstallProgressText(progress: LocalDeepResearchInstallProgress): string {
  const received = typeof progress.bytesReceived === "number" ? progress.bytesReceived : undefined;
  const total = typeof progress.totalBytes === "number" ? progress.totalBytes : undefined;
  const percent = typeof progress.percent === "number" ? `${Math.round(progress.percent)}%` : undefined;
  const size =
    received !== undefined && total !== undefined
      ? `${formatLocalDeepResearchBytes(received)} of ${formatLocalDeepResearchBytes(total)}`
      : received !== undefined
        ? formatLocalDeepResearchBytes(received)
        : undefined;
  const suffix = [size, percent].filter(Boolean).join(", ");
  return suffix ? `${progress.message} (${suffix})` : progress.message;
}

async function withLocalDeepResearchToolHeartbeat<T>(
  toolName: string,
  message: string,
  operation: () => Promise<T> | T,
  options: { signal?: AbortSignal; timeoutMs?: number; heartbeatMs?: number } = {},
  onUpdate?: (update: AgentToolResult<Record<string, unknown>>) => void,
): Promise<T> {
  let timer: ReturnType<typeof setInterval> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const heartbeatMs = Math.max(1, Math.floor(options.heartbeatMs ?? 10_000));
  const timeoutMs = Math.max(1, Math.floor(options.timeoutMs ?? 30 * 60_000));
  if (onUpdate) {
    timer = setInterval(() => {
      onUpdate(localDeepResearchToolUpdate(toolName, message));
    }, heartbeatMs);
  }
  try {
    return await new Promise<T>((resolve, reject) => {
      let settled = false;
      const settle = (callback: () => void) => {
        if (settled) return;
        settled = true;
        options.signal?.removeEventListener("abort", abort);
        callback();
      };
      const abort = () => settle(() => reject(options.signal?.reason instanceof Error ? options.signal.reason : new Error(`${toolName} was aborted.`)));
      if (options.signal?.aborted) {
        abort();
        return;
      }
      options.signal?.addEventListener("abort", abort, { once: true });
      timeout = setTimeout(() => {
        settle(() => reject(new Error(`${toolName} timed out after ${timeoutMs}ms while Local Deep Research was running.`)));
      }, timeoutMs);
      Promise.resolve()
        .then(() => operation())
        .then(
          (value) => settle(() => resolve(value)),
          (error) => settle(() => reject(error)),
        );
    });
  } finally {
    if (timer) clearInterval(timer);
    if (timeout) clearTimeout(timeout);
  }
}

function localDeepResearchToolResult(text: string, details: Record<string, unknown>): AgentToolResult<Record<string, unknown>> {
  return {
    content: [{ type: "text", text }],
    details: {
      runtime: "ambient-local-deep-research",
      ...details,
    },
  };
}

function localDeepResearchReadinessErrorResult(
  action: LocalDeepResearchSetupAction,
  error: unknown,
  installResult?: LocalDeepResearchInstallServiceResult,
): AgentToolResult<Record<string, unknown>> & { isError: true } {
  const message = error instanceof Error ? error.message : String(error);
  return {
    ...localDeepResearchToolResult([
      "Local Deep Research setup status is unavailable.",
      `Reason: ${message}`,
      "Ambient stopped this setup check before the agent tool watchdog. Retry after resolving provider/runtime discovery, or inspect Search & Web and local runtime diagnostics first.",
    ].join("\n"), {
      toolName: "ambient_local_deep_research_setup",
      status: "error",
      action,
      setupStatus: "unknown",
      error: message,
      ...(installResult ? { installResult } : {}),
    }),
    isError: true,
  };
}

function localDeepResearchSetupResultForDesktopEvent(
  action: LocalDeepResearchSetupAction,
  contract: LocalDeepResearchSetupContract,
  managedAssets: LocalDeepResearchManagedAssetDetection,
  installResult?: LocalDeepResearchInstallServiceResult,
  validation?: LocalDeepResearchValidationResult,
  smoke?: LocalDeepResearchSmokeResult,
): LocalDeepResearchSetupResult {
  return {
    schemaVersion: "ambient-local-deep-research-setup-result-v1",
    action,
    capabilityId: contract.capabilityId,
    setupStatus: contract.status,
    modelSelection: contract.modelSelection,
    modelInstall: {
      ...contract.modelInstall,
      selectedProfileId: contract.modelInstall.selectedProfileId as LocalDeepResearchModelProfileId,
    },
    llamaRuntime: contract.runtime,
    installerShape: contract.installerShape,
    localModelResources: contract.localModelResources,
    localRuntimeInventory: contract.localRuntimeInventory,
    providerSnapshot: contract.providerSnapshot,
    managedAssets,
    ...(installResult ? { installResult } : {}),
    ...(validation ? { validation } : {}),
    ...(smoke ? { smoke } : {}),
    warnings: contract.warnings,
    blockers: contract.blockers,
    nextActions: contract.nextActions,
  };
}

function localDeepResearchInstallTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env.AMBIENT_LOCAL_DEEP_RESEARCH_INSTALL_TIMEOUT_MS);
  if (Number.isFinite(parsed) && parsed > 0) return Math.max(1, Math.round(parsed));
  return DEFAULT_LOCAL_DEEP_RESEARCH_INSTALL_TIMEOUT_MS;
}

function localDeepResearchReadinessTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env.AMBIENT_LOCAL_DEEP_RESEARCH_READINESS_TIMEOUT_MS);
  if (Number.isFinite(parsed) && parsed > 0) return Math.max(1, Math.round(parsed));
  return DEFAULT_LOCAL_DEEP_RESEARCH_READINESS_TIMEOUT_MS;
}
