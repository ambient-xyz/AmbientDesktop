import type { AgentToolResult, ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type {
  LocalDeepResearchFinalSynthesisMode,
  LocalModelResourcePolicyDecision,
  WorkspaceState,
} from "../shared/types";
import { localDeepResearchToolDescriptor } from "./desktopToolRegistry";
import { registerDesktopTool } from "./desktopToolRegistration";
import type { LocalDeepResearchBroker } from "./localDeepResearchAdapter";
import type { LocalDeepResearchManagedAssetDetection } from "./localDeepResearchManagedAssets";
import { LOCAL_DEEP_RESEARCH_PROVIDER_IDS } from "./localDeepResearchProviderStack";
import {
  localDeepResearchRunText,
  runLocalDeepResearchWithManagedLlama,
  type LocalDeepResearchRunRequest,
  type LocalDeepResearchRunServiceResult,
} from "./localDeepResearchRunService";
import {
  localDeepResearchSetupContractText,
  type LocalDeepResearchProviderSnapshot,
  type LocalDeepResearchSetupContract,
  type LocalDeepResearchSetupInput,
} from "./localDeepResearchSetup";

type LocalDeepResearchToolUpdate = AgentToolResult<Record<string, unknown>>;
type LocalDeepResearchToolUpdateHandler = (update: LocalDeepResearchToolUpdate) => void;

export interface LocalDeepResearchRunReadiness {
  contract: LocalDeepResearchSetupContract;
  managedAssets: LocalDeepResearchManagedAssetDetection;
}

export interface LocalDeepResearchRunBrokerInput {
  threadId: string;
  workspace: WorkspaceState;
  providerSnapshot: LocalDeepResearchProviderSnapshot;
  signal?: AbortSignal;
  onUpdate?: LocalDeepResearchToolUpdateHandler;
}

export interface LocalDeepResearchRunToolRegistrationOptions {
  threadId: string;
  workspace: WorkspaceState;
  readReadiness: (
    workspace: WorkspaceState,
    input: LocalDeepResearchSetupInput,
    signal?: AbortSignal,
  ) => Promise<LocalDeepResearchRunReadiness> | LocalDeepResearchRunReadiness;
  createBroker: (input: LocalDeepResearchRunBrokerInput) => LocalDeepResearchBroker;
  run?: (input: LocalDeepResearchRunRequest) => Promise<LocalDeepResearchRunServiceResult> | LocalDeepResearchRunServiceResult;
  approveResourceLimitExceed?: (decision: LocalModelResourcePolicyDecision) => Promise<boolean> | boolean;
}

export function registerLocalDeepResearchRunTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: LocalDeepResearchRunToolRegistrationOptions,
): void {
  const { threadId, workspace } = options;

  registerDesktopTool(pi, localDeepResearchToolDescriptor("ambient_local_deep_research_run"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, signal, onUpdate?: LocalDeepResearchToolUpdateHandler) => {
      const input = localDeepResearchRunToolInput(params);
      onUpdate?.(localDeepResearchToolUpdate("ambient_local_deep_research_run", "Preparing Local Deep Research run."));
      const { contract, managedAssets } = await options.readReadiness(workspace, { q8Override: input.q8Override }, signal);
      if (contract.status !== "ready") {
        return localDeepResearchToolResult([
          "Local Deep Research is not ready to run.",
          localDeepResearchSetupContractText(contract),
        ].join("\n\n"), {
          toolName: "ambient_local_deep_research_run",
          status: "blocked",
          capabilityId: contract.capabilityId,
          setupStatus: contract.status,
          modelSelection: contract.modelSelection,
          modelInstall: contract.modelInstall,
          llamaRuntime: contract.runtime,
          managedAssets,
          localModelResources: contract.localModelResources,
          localRuntimeInventory: contract.localRuntimeInventory,
          providerSnapshot: contract.providerSnapshot,
          warnings: contract.warnings,
          blockers: contract.blockers,
          nextActions: contract.nextActions,
        });
      }
      const activeProvider = contract.providerSnapshot.activeProvider;
      if (activeProvider?.providerId !== LOCAL_DEEP_RESEARCH_PROVIDER_IDS.liteResearcher && !options.run) {
        return localDeepResearchToolResult([
          "Local Deep Research provider is not runnable in this runtime.",
          `${activeProvider ? `${activeProvider.label} (${activeProvider.providerId})` : "No active provider"} is top priority, but Ambient only has a built-in LiteResearcher runner loaded here.`,
          "Use ambient_local_deep_research_provider_update with action=reset_defaults or configure a runtime adapter for the selected provider.",
        ].join("\n"), {
          toolName: "ambient_local_deep_research_run",
          status: "blocked",
          capabilityId: contract.capabilityId,
          setupStatus: contract.status,
          activeProvider,
          providerOrder: contract.providerSnapshot.providerOrder,
          providerSnapshot: contract.providerSnapshot,
          localRuntimeInventory: contract.localRuntimeInventory,
          blockers: ["Active Local Deep Research provider has no loaded runtime adapter."],
          nextActions: ["Reset Local Deep Research provider defaults or install/configure a runtime adapter for the selected provider."],
        });
      }
      const broker = options.createBroker({ threadId, workspace, providerSnapshot: contract.providerSnapshot, signal, onUpdate });
      onUpdate?.(localDeepResearchToolUpdate("ambient_local_deep_research_run", `Starting ${activeProvider?.label ?? "LiteResearcher"} through Ambient Local Deep Research.`));
      const run = options.run ?? runLocalDeepResearchWithManagedLlama;
      const result = await withLocalDeepResearchToolHeartbeat(
        "ambient_local_deep_research_run",
        "Local Deep Research is still running with the managed llama.cpp server.",
        () => run({
          workspacePath: workspace.path,
          question: input.question,
          setup: contract,
          managedAssets,
          broker,
          ownerThreadId: threadId,
          approveResourceLimitExceed: options.approveResourceLimitExceed,
          maxToolCalls: input.maxToolCalls,
          maxTurns: input.maxTurns,
          finalSynthesis: input.finalSynthesisMode ? { mode: input.finalSynthesisMode } : undefined,
          signal,
        }),
        { signal, timeoutMs: localDeepResearchRunTimeoutMs(), heartbeatMs: 10_000 },
        onUpdate,
      );
      return localDeepResearchToolResult(localDeepResearchRunText(result), {
        toolName: "ambient_local_deep_research_run",
        status: result.status,
        capabilityId: contract.capabilityId,
        setupStatus: contract.status,
        activeProvider: contract.providerSnapshot.activeProvider,
        providerOrder: contract.providerSnapshot.providerOrder,
        modelProfileId: result.run.modelProfileId,
        contextTokens: result.run.contextTokens,
        providerSnapshot: result.run.providerSnapshot,
        finalSynthesis: result.run.finalSynthesis,
        localModelResources: contract.localModelResources,
        localRuntimeInventory: contract.localRuntimeInventory,
        localModelResourcePreflight: result.localModelResourcePreflight,
        toolExecutions: result.run.toolExecutions,
        finalText: result.finalText,
        error: result.error,
        artifacts: result.artifacts,
        llamaServer: result.llamaServer,
        release: result.release,
      });
    },
  });
}

function localDeepResearchRunTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env.AMBIENT_LOCAL_DEEP_RESEARCH_RUN_TIMEOUT_MS);
  if (Number.isFinite(parsed) && parsed > 0) return Math.max(1, Math.round(parsed));
  return 30 * 60_000;
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
  const timeoutMs = Math.max(1, Math.floor(options.timeoutMs ?? localDeepResearchRunTimeoutMs()));
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

function localDeepResearchRunToolInput(params: unknown): {
  question: string;
  q8Override?: boolean;
  maxToolCalls?: number;
  maxTurns?: number;
  finalSynthesisMode?: LocalDeepResearchFinalSynthesisMode;
} {
  const input = objectRecord(params);
  const finalSynthesisMode = optionalString(input.finalSynthesisMode);
  if (finalSynthesisMode && !["local", "evidence_only"].includes(finalSynthesisMode)) throw new Error("finalSynthesisMode must be local or evidence_only.");
  return {
    question: requiredString(input, "question").trim(),
    ...(input.q8Override === true ? { q8Override: true } : {}),
    ...(optionalNumber(input.maxToolCalls) !== undefined ? { maxToolCalls: optionalNumber(input.maxToolCalls) } : {}),
    ...(optionalNumber(input.maxTurns) !== undefined ? { maxTurns: optionalNumber(input.maxTurns) } : {}),
    ...(finalSynthesisMode ? { finalSynthesisMode: finalSynthesisMode as LocalDeepResearchFinalSynthesisMode } : {}),
  };
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required.`);
  return value;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
