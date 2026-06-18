import type {
  LocalModelResourcePolicyDecision,
  LocalDeepResearchSmokeCheck,
  LocalDeepResearchSmokeResult,
  LocalDeepResearchSmokeStatus,
} from "../../shared/localRuntimeTypes";
import { localDeepResearchToolBudgetState, resolveLocalDeepResearchRunBudget } from "../../shared/localDeepResearchBudget";
import {
  enforceLocalModelResourceLaunchPolicy,
  type LocalModelResourceLaunchPreflightResult,
} from "../local-runtime/localModelResourceRegistry";
import {
  createLocalDeepResearchLlamaChatClient,
  type LocalDeepResearchLlamaChatClientOptions,
} from "./localDeepResearchLlamaClient";
import type { LocalDeepResearchManagedAssetDetection } from "./localDeepResearchManagedAssets";
import type { LocalDeepResearchModelProfileId } from "./localDeepResearchModelProfiles";
import {
  buildLocalDeepResearchLlamaServerAcquireInput,
} from "./localDeepResearchServerSupervisor";
import type { LocalDeepResearchSetupContract } from "./localDeepResearchSetup";
import { LocalLlamaServerSupervisor, type LocalLlamaServerAcquireInput, type LocalLlamaServerLease } from "../local-llama/localLlamaServerSupervisor";
import type { LocalDeepResearchChatClient } from "./localDeepResearchRunner";
import { writeWorkspaceTextFile } from "../workspace/workspaceFiles";

const smokeRoot = ".ambient/local-deep-research/smoke";
const smokePrompt = "Reply with one short sentence containing the exact token LOCAL_DEEP_RESEARCH_SMOKE_OK.";
const smokeSuccessToken = "LOCAL_DEEP_RESEARCH_SMOKE_OK";

export interface LocalDeepResearchSmokeRequest {
  workspacePath: string;
  setup: LocalDeepResearchSetupContract;
  managedAssets: LocalDeepResearchManagedAssetDetection;
  ownerThreadId?: string;
  approveResourceLimitExceed?: (decision: LocalModelResourcePolicyDecision) => Promise<boolean> | boolean;
  killLocalModelProcess?: (pid: number, signal?: NodeJS.Signals) => void;
  supervisor?: Pick<LocalLlamaServerSupervisor, "acquire">;
  serverOptions?: Partial<Pick<LocalLlamaServerAcquireInput, "host" | "port" | "gpuLayers" | "startupTimeoutMs" | "idleTimeoutMs" | "offline" | "extraArgs" | "env">>;
  chatOptions?: Partial<Omit<LocalDeepResearchLlamaChatClientOptions, "endpointUrl">>;
  chatClientFactory?: (endpointUrl: string) => LocalDeepResearchChatClient;
  now?: () => Date;
  signal?: AbortSignal;
}

export async function runLocalDeepResearchRealAssetSmoke(input: LocalDeepResearchSmokeRequest): Promise<LocalDeepResearchSmokeResult> {
  const now = input.now ?? (() => new Date());
  const checkedAt = now().toISOString();
  const base = smokeBase(input, checkedAt);
  const readinessChecks = localDeepResearchSmokeReadinessChecks(input.setup, input.managedAssets);
  const preflightStatus = localDeepResearchSmokePreflightStatus(readinessChecks);
  if (preflightStatus !== "passed") {
    return persistLocalDeepResearchSmokeResult(input.workspacePath, {
      ...base,
      status: preflightStatus,
      checks: readinessChecks,
    });
  }
  const resourcePreflight = await enforceLocalModelResourceLaunchPolicy({
    registry: input.setup.localModelResources,
    approveExceed: input.approveResourceLimitExceed,
    killProcess: input.killLocalModelProcess,
  });
  const resourceCheck = localDeepResearchSmokeResourcePolicyCheck(resourcePreflight);
  if (!resourcePreflight.allowed) {
    return persistLocalDeepResearchSmokeResult(input.workspacePath, {
      ...base,
      status: resourceCheck.status === "failed" ? "failed" : "blocked",
      checks: [...readinessChecks, resourceCheck],
      error: resourcePreflight.reason,
    });
  }

  const supervisor = input.supervisor ?? new LocalLlamaServerSupervisor();
  let lease: LocalLlamaServerLease | undefined;
  const requestTimeoutMs = input.chatOptions?.requestTimeoutMs ?? 60_000;
  const startedAt = Date.now();
  try {
    throwIfAborted(input.signal);
    lease = await supervisor.acquire(buildLocalDeepResearchLlamaServerAcquireInput({
      workspacePath: input.workspacePath,
      setup: input.setup,
      managedAssets: input.managedAssets,
      allowBlockedSetup: true,
      idleTimeoutMs: 0,
      startupTimeoutMs: 180_000,
      ownerThreadId: input.ownerThreadId,
      ...input.serverOptions,
    }));
    const chat = input.chatClientFactory
      ? input.chatClientFactory(lease.state.endpointUrl)
      : createLocalDeepResearchLlamaChatClient({
          endpointUrl: lease.state.endpointUrl,
          modelId: input.setup.modelInstall.selectedProfileId,
          maxTokens: 256,
          temperature: 0,
          requestTimeoutMs,
          signal: input.signal,
          ...input.chatOptions,
        });
    const completion = await chat.complete({
      setup: input.setup,
      toolCallCount: 0,
      toolBudget: localDeepResearchToolBudgetState(resolveLocalDeepResearchRunBudget(undefined), 0),
      messages: [
        {
          role: "system",
          content: "You are running a local Ambient Desktop smoke test. Do not call tools.",
        },
        {
          role: "user",
          content: smokePrompt,
        },
      ],
    });
    const response = completion.content.trim();
    const chatCheck: LocalDeepResearchSmokeCheck = response.includes(smokeSuccessToken)
      ? {
          id: "llama-chat",
          title: "llama.cpp chat completion",
          status: "passed",
          detail: "Managed llama-server returned the expected local smoke sentinel token.",
        }
      : {
          id: "llama-chat",
          title: "llama.cpp chat completion",
          status: "failed",
          detail: response
            ? "Managed llama-server returned a chat completion, but it did not contain the expected smoke sentinel token."
            : "Managed llama-server returned an empty chat completion.",
          nextAction: "Inspect the smoke artifact and llama-server logs, then retry Local Deep Research repair.",
        };
    const release = await releaseSmokeLease(lease);
    lease = undefined;
    return persistLocalDeepResearchSmokeResult(input.workspacePath, {
      ...base,
      status: chatCheck.status === "passed" ? "passed" : "failed",
      checks: [...readinessChecks, resourceCheck, chatCheck],
      llamaServer: llamaServerSummaryForSmoke(release.lease),
      chat: {
        prompt: smokePrompt,
        response,
        durationMs: Date.now() - startedAt,
        requestTimeoutMs,
      },
      release: release.result,
    });
  } catch (error) {
    const message = errorMessage(error);
    const release = lease ? await releaseSmokeLease(lease).catch((releaseError: unknown) => ({
      lease,
      result: {
        status: "failed" as const,
        detail: errorMessage(releaseError),
      },
    })) : undefined;
    return persistLocalDeepResearchSmokeResult(input.workspacePath, {
      ...base,
      status: "failed",
      checks: [
        ...readinessChecks,
        resourceCheck,
        {
          id: "llama-chat",
          title: "llama.cpp chat completion",
          status: "failed",
          detail: message,
          nextAction: "Inspect the smoke artifact and llama-server logs, then retry Local Deep Research repair.",
        },
      ],
      ...(release?.lease ? { llamaServer: llamaServerSummaryForSmoke(release.lease) } : {}),
      ...(release ? { release: release.result } : {}),
      error: message,
    });
  }
}

export function localDeepResearchSmokeText(result: LocalDeepResearchSmokeResult): string {
  return [
    `Local Deep Research real-asset smoke ${result.status}.`,
    `Model: ${result.modelProfileId}; context: ${result.contextTokens}.`,
    result.chat ? `Response: ${result.chat.response}` : undefined,
    result.error ? `Error: ${result.error}` : undefined,
    `Checks: ${result.checks.map((check) => `${check.id}:${check.status}`).join(", ")}.`,
    `Artifacts: ${result.markdownPath} and ${result.artifactPath}.`,
  ].filter((line): line is string => line !== undefined).join("\n");
}

function smokeBase(
  input: Pick<LocalDeepResearchSmokeRequest, "setup">,
  checkedAt: string,
): Omit<LocalDeepResearchSmokeResult, "status" | "checks" | "artifactPath" | "markdownPath"> {
  return {
    schemaVersion: "ambient-local-deep-research-smoke-v1",
    checkedAt,
    setupStatus: input.setup.status,
    modelProfileId: input.setup.modelInstall.selectedProfileId as LocalDeepResearchModelProfileId,
    contextTokens: input.setup.modelInstall.contextTokens,
    providerSnapshot: input.setup.providerSnapshot,
  };
}

function localDeepResearchSmokeReadinessChecks(
  setup: LocalDeepResearchSetupContract,
  managedAssets: LocalDeepResearchManagedAssetDetection,
): LocalDeepResearchSmokeCheck[] {
  return [
    {
      id: "setup-contract",
      title: "Setup contract",
      status: setup.status === "ready" ? "passed" : "warning",
      detail: setup.status === "ready"
        ? "Setup is ready for full Local Deep Research runs."
        : `Setup is ${setup.status}; the smoke can still verify local model/runtime assets before provider-dependent runs.`,
      ...(setup.status === "ready" ? {} : { nextAction: "Resolve setup warnings or blockers before running the full research tool." }),
    },
    managedAssets.model.status === "present"
      ? {
          id: "model-cache",
          title: "LiteResearcher model cache",
          status: "passed",
          detail: `${managedAssets.model.filename} is present in Ambient-managed model cache.`,
        }
      : {
          id: "model-cache",
          title: "LiteResearcher model cache",
          status: managedAssets.model.status === "mismatch" ? "failed" : "warning",
          detail: managedAssets.model.reason ?? `${managedAssets.model.filename} is not ready in Ambient-managed model cache.`,
          nextAction: "Run Local Deep Research install or repair before the real-asset smoke.",
        },
    managedAssets.runtime.status === "present" && managedAssets.runtime.binaryPath
      ? {
          id: "runtime-cache",
          title: "Shared llama.cpp runtime",
          status: "passed",
          detail: `Shared llama.cpp runtime binary is present for ${managedAssets.runtime.artifactId ?? "selected artifact"}.`,
        }
      : {
          id: "runtime-cache",
          title: "Shared llama.cpp runtime",
          status: managedAssets.runtime.status === "unsupported" || managedAssets.runtime.status === "mismatch" ? "blocked" : "warning",
          detail: managedAssets.runtime.reason ?? "Shared llama.cpp runtime binary is not ready in Ambient-managed runtime cache.",
          nextAction: "Run Local Deep Research install or repair before the real-asset smoke.",
        },
  ];
}

function localDeepResearchSmokeResourcePolicyCheck(
  preflight: LocalModelResourceLaunchPreflightResult,
): LocalDeepResearchSmokeCheck {
  if (preflight.allowed) {
    return {
      id: "local-model-resource-policy",
      title: "Local model resource policy",
      status: preflight.outcome === "warn" ? "warning" : "passed",
      detail: preflight.reason,
      ...(preflight.outcome === "warn" ? { nextAction: "Review the configured local-model memory ceiling if warnings are unexpected." } : {}),
    };
  }
  return {
    id: "local-model-resource-policy",
    title: "Local model resource policy",
    status: preflight.outcome === "unload-idle" ? "failed" : "blocked",
    detail: preflight.reason,
    nextAction: preflight.outcome === "ask-to-exceed"
      ? "Approve the memory ceiling exception or lower local model resident memory before retrying."
      : "Raise the local-model memory ceiling, unload idle local models, or change the ceiling behavior before retrying.",
  };
}

function localDeepResearchSmokePreflightStatus(checks: LocalDeepResearchSmokeCheck[]): LocalDeepResearchSmokeStatus {
  if (checks.some((check) => check.status === "blocked")) return "blocked";
  if (checks.some((check) => check.id !== "setup-contract" && check.status === "failed")) return "failed";
  if (checks.some((check) => check.id !== "setup-contract" && check.status === "warning")) return "needs-install";
  return "passed";
}

async function persistLocalDeepResearchSmokeResult(
  workspacePath: string,
  result: Omit<LocalDeepResearchSmokeResult, "artifactPath" | "markdownPath">,
): Promise<LocalDeepResearchSmokeResult> {
  const stamp = result.checkedAt.replace(/[:.]/g, "-");
  const basePath = `${smokeRoot}/${stamp}-${result.status}`;
  const pending = {
    ...result,
    artifactPath: `${basePath}.json`,
    markdownPath: `${basePath}.md`,
  };
  const json = await writeWorkspaceTextFile(workspacePath, pending.artifactPath, `${JSON.stringify(pending, null, 2)}\n`);
  const markdown = await writeWorkspaceTextFile(workspacePath, pending.markdownPath, localDeepResearchSmokeMarkdown(pending));
  return {
    ...pending,
    artifactPath: json.path,
    markdownPath: markdown.path,
  };
}

function localDeepResearchSmokeMarkdown(result: LocalDeepResearchSmokeResult): string {
  return [
    "# Local Deep Research Real-Asset Smoke",
    "",
    `Checked: ${result.checkedAt}`,
    `Status: ${result.status}`,
    `Model: ${result.modelProfileId}`,
    `Context: ${result.contextTokens}`,
    "",
    "## Checks",
    "",
    ...result.checks.map((check) => `- ${check.title}: ${check.status}. ${check.detail}`),
    "",
    "## Chat",
    "",
    result.chat ? `Prompt: ${result.chat.prompt}\n\nResponse: ${result.chat.response}\n\nDuration: ${result.chat.durationMs} ms` : "No chat request was sent.",
    "",
    "## Runtime",
    "",
    result.llamaServer
      ? [
          `Endpoint: ${result.llamaServer.endpointUrl}`,
          `PID: ${result.llamaServer.pid}`,
          `Runtime: ${result.llamaServer.runtimeBinaryPath}`,
          `Model path: ${result.llamaServer.modelPath}`,
          `Log: ${result.llamaServer.logPath}`,
        ].join("\n")
      : "No llama-server lease was acquired.",
    "",
    result.error ? `Error: ${result.error}\n` : "",
  ].join("\n");
}

async function releaseSmokeLease(lease: LocalLlamaServerLease): Promise<{
  lease: LocalLlamaServerLease;
  result: NonNullable<LocalDeepResearchSmokeResult["release"]>;
}> {
  try {
    await lease.release();
    return {
      lease,
      result: { status: lease.state.idleTimeoutMs <= 0 ? "stopped" : "released" },
    };
  } catch (error) {
    return {
      lease,
      result: {
        status: "failed",
        detail: errorMessage(error),
      },
    };
  }
}

function llamaServerSummaryForSmoke(lease: LocalLlamaServerLease): NonNullable<LocalDeepResearchSmokeResult["llamaServer"]> {
  return {
    endpointUrl: lease.state.endpointUrl,
    pid: lease.state.pid,
    profileId: lease.state.profileId,
    modelPath: lease.state.modelPath,
    runtimeBinaryPath: lease.state.runtimeBinaryPath,
    stateDir: lease.state.stateDir,
    logPath: lease.state.logPath,
    stdoutPath: lease.state.stdoutPath,
    stderrPath: lease.state.stderrPath,
  };
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  const error = new Error("Local Deep Research smoke was canceled.");
  error.name = "AbortError";
  throw error;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
