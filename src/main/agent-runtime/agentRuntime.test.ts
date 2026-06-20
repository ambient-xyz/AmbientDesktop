import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, open, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it, vi } from "vitest";
import type { BrowserUserActionState } from "../../shared/browserTypes";
import type {
  LocalDeepResearchSettings,
  LocalDeepResearchSmokeResult,
  LocalDeepResearchValidationResult,
  LocalRuntimeLeaseRecord,
  SttProviderCandidate,
  SttSettings,
  VoiceProviderCandidate,
  VoiceSettings,
} from "../../shared/localRuntimeTypes";
import type { PermissionRequest } from "../../shared/permissionTypes";
import type { ProjectSummary } from "../../shared/projectBoardTypes";
import {
  AMBIENT_KIMI_K2_7_CODE_MODEL,
  AMBIENT_LOCAL_TEXT_MODEL,
  createAmbientModelRuntimeSnapshot,
  resolveAmbientModelRuntimeProfile,
  type AmbientModelRuntimeProfile,
} from "../../shared/ambientModels";
import { AMBIENT_SUBAGENTS_FEATURE_FLAG, resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import { getDefaultSubagentRoleProfile } from "../../shared/subagentRoles";
import { SYMPHONY_WORKFLOW_PATTERN_IDS } from "../../shared/symphonyWorkflowRecipes";
import { BrowserUnavailableError, BrowserUserActionCanceledError, BrowserUserActionTimedOutError } from "./agentRuntimeBrowserFacade";
import { browserRuntimeForAgentProfile, browserToolFallback, browserUnavailableText, selectAgentBrowserRuntime } from "./agentRuntimeAgentFacade";
import {
  AgentRuntime,
  assistantFinalizationRetryAttemptsUsedForReason,
  BrowserToolTimeoutError,
  PLANNER_MODE_SYSTEM_PROMPT,
  browserToolTimeoutMs,
  browserUserActionContinuationLinesFromToolContent,
  buildRuntimeProviderFailureDiagnostic,
  createPostToolContinuationRequest,
  isAmbientProviderAuthFailure,
  postToolIdleContinuationPrompt,
  privilegedContinuationLinesFromToolContent,
  piRetryOverridesFromModelRuntimeSettings,
  runtimeProviderErrorDiagnostic,
  runtimeProviderFailureIdleSource,
  ambientMcpBridgeActiveToolNamesForRecoveredTranscript,
  shouldDeliverPostToolContinuation,
  validatePostToolContinuationRequest,
  withBrowserToolHeartbeat,
} from "./agentRuntime";
import {
  ambientCliLazySkillsEnabled,
  resolveAmbientCliSkillMount,
} from "./agentRuntimeAmbientCliSkillMount";
import { ambientCapabilityBuilderPlanInput } from "./agentRuntimeCapabilityBuilderFacade";
import { AMBIENT_DIRECT_MCP_TOOL_BRIDGE_NAMES } from "./agentRuntimeAmbientFacade";
import { MacosAuthorizedHelperUnavailableAdapter, type PrivilegedActionAdapter, type PrivilegedActionAdapterExecuteInput } from "./agentRuntimePrivilegedActionFacade";
import { privilegedActionAdapterStatus, successfulPrivilegedActionNativeRequest } from "./agentRuntimePrivilegedActionFacade";
import { scaffoldCapabilityBuilderPackage } from "./agentRuntimeCapabilityBuilderFacade";
import { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import type { LocalModelRuntimeLease, LocalModelRuntimeReleaseResult } from "./agentRuntimeLocalRuntimeFacade";
import { TelegramBridgeSupervisor } from "./agentRuntimeTelegramFacade";
import { createMessagingBindingStore } from "./agentRuntimeMessagingFacade";
import { createDefaultMessagingProviderRegistry } from "./agentRuntimeMessagingFacade";
import { providerCatalogBootstrapReminder } from "./agentRuntimeProviderFacade";
import { createProviderCatalogToolExtension } from "./agentRuntimeProviderCatalogTools";
import { createVisionToolExtension } from "./agentRuntimeVisionTools";
import { createSttSettingsToolExtension } from "./agentRuntimeSttFacade";
import { createVoiceSettingsToolExtension } from "./agentRuntimeVoiceFacade";
import { writePcm16Wav } from "./agentRuntimeSttFacade";
import { normalizeWebResearchProviderStackSettings } from "./agentRuntimeWebResearchFacade";
import { normalizeLocalDeepResearchSettings } from "./agentRuntimeLocalDeepResearchFacade";
import { localDeepResearchToolBudgetState, normalizeLocalDeepResearchRunBudget } from "../../shared/localDeepResearchBudget";
import { detectLocalDeepResearchManagedAssets, localDeepResearchModelCachePath } from "./agentRuntimeLocalDeepResearchFacade";
import { localDeepResearchProfileById } from "./agentRuntimeLocalDeepResearchFacade";
import { detectLocalLlamaResidentProcesses, selectLocalLlamaRuntimeArtifact } from "./agentRuntimeLocalLlamaFacade";
import { miniCpmRuntimeReleaseManifestPrototype } from "./agentRuntimeMiniCpmFacade";
import { buildLocalDeepResearchSetupContract } from "./agentRuntimeLocalDeepResearchFacade";
import type { LocalDeepResearchRunServiceResult } from "./agentRuntimeLocalDeepResearchFacade";
import type { LocalDeepResearchInstallServiceResult } from "./agentRuntimeLocalDeepResearchFacade";
import { resolveSubagentApprovalDecision } from "./agentRuntimeSubagentsFacade";
import { resolveSubagentChildActiveToolNames } from "./agentRuntimeSubagentsFacade";
import { appendMappedSubagentRuntimeEvent } from "./agentRuntimeSubagentsFacade";
import {
  buildCallableWorkflowRegistry,
  buildCallableWorkflowRunPlan,
  callableWorkflowToolName,
} from "./agentRuntimeCallableWorkflowFacade";
import { buildCallableWorkflowExecutionPlan } from "./agentRuntimeCallableWorkflowFacade";
import { CALLABLE_WORKFLOW_PARENT_BLOCKED_MAILBOX_TYPE } from "./agentRuntimeCallableWorkflowFacade";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;
const gib = 1024 ** 3;
const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync("git", ["-C", cwd, ...args]);
}

async function initializeGitWorkspace(workspacePath: string): Promise<void> {
  await git(workspacePath, ["init"]);
  await git(workspacePath, ["config", "user.email", "ambient-test@example.invalid"]);
  await git(workspacePath, ["config", "user.name", "Ambient Test"]);
  await writeFile(join(workspacePath, ".gitignore"), ".ambient/\n", "utf8");
  await writeFile(join(workspacePath, "README.md"), "# Ambient worker worktree test\n", "utf8");
  await git(workspacePath, ["add", ".gitignore", "README.md"]);
  await git(workspacePath, ["commit", "-m", "initial"]);
}

describe("agent browser runtime selection", () => {
  it("keeps isolated agent sessions on Chrome", () => {
    expect(browserRuntimeForAgentProfile("isolated")).toBe("chrome");
  });

  it("keeps copied-profile sessions on Chrome", () => {
    expect(browserRuntimeForAgentProfile("copied")).toBe("chrome");
  });

  it("does not inherit an already-running internal browser for direct agent browser tools", () => {
    expect(
      selectAgentBrowserRuntime({
        browserState: {
          running: true,
          runtime: "internal",
          profileMode: "isolated",
          internalAvailable: true,
          copiedProfileAvailable: false,
          chromeAvailable: true,
          sourceProfilePath: undefined,
        },
      }),
    ).toMatchObject({
      profileMode: "isolated",
      runtime: "chrome",
      reason: "default-isolated-managed-chrome",
    });
  });

  it("reuses an already-running isolated managed Chrome profile without switching to the internal browser", () => {
    expect(
      selectAgentBrowserRuntime({
        browserState: {
          running: true,
          runtime: "chrome",
          profileMode: "isolated",
          internalAvailable: true,
          copiedProfileAvailable: false,
          chromeAvailable: true,
          sourceProfilePath: "/Users/example/Chrome",
        },
      }),
    ).toMatchObject({
      profileMode: "isolated",
      runtime: "chrome",
      shouldCopyProfile: false,
      reason: "reuse-running-managed-chrome",
    });
  });

  it("does not use a copied Chrome profile unless the caller explicitly requests it", () => {
    expect(
      selectAgentBrowserRuntime({
        browserState: {
          running: false,
          runtime: "chrome",
          profileMode: "isolated",
          internalAvailable: true,
          copiedProfileAvailable: true,
          chromeAvailable: true,
          sourceProfilePath: "/Users/example/Chrome",
        },
      }),
    ).toMatchObject({
      profileMode: "isolated",
      runtime: "chrome",
      shouldCopyProfile: false,
      reason: "default-isolated-managed-chrome",
    });

    expect(
      selectAgentBrowserRuntime({
        requestedProfileMode: "copied",
        browserState: {
          running: false,
          runtime: "chrome",
          profileMode: "isolated",
          internalAvailable: true,
          copiedProfileAvailable: true,
          chromeAvailable: true,
          sourceProfilePath: "/Users/example/Chrome",
        },
      }),
    ).toMatchObject({
      profileMode: "copied",
      runtime: "chrome",
      shouldCopyProfile: false,
      reason: "requested-copied-profile",
    });
  });

  it("allows the internal runtime only when a caller opts into that narrow path", () => {
    expect(
      selectAgentBrowserRuntime({
        requestedRuntime: "internal",
        allowInternalRuntime: true,
        browserState: {
          running: false,
          runtime: "internal",
          profileMode: "isolated",
          internalAvailable: true,
          copiedProfileAvailable: true,
          chromeAvailable: true,
          sourceProfilePath: "/Users/example/Chrome",
        },
      }),
    ).toMatchObject({
      profileMode: "isolated",
      runtime: "internal",
      shouldCopyProfile: false,
      reason: "explicit-internal-runtime",
    });
  });
});

function agentRuntimeLocalTextProfile(overrides: Partial<AmbientModelRuntimeProfile> = {}): AmbientModelRuntimeProfile {
  return {
    ...resolveAmbientModelRuntimeProfile(AMBIENT_LOCAL_TEXT_MODEL),
    profileId: `local:${AMBIENT_LOCAL_TEXT_MODEL}:configured`,
    selectableAsSubagent: true,
    available: true,
    unavailableReason: undefined,
    providerQuirks: ["Resolved from an active local runtime descriptor."],
    ...overrides,
  };
}

function agentRuntimeLocalModelLease(
  workspacePath: string,
  options: { release?: () => Promise<LocalModelRuntimeReleaseResult> } = {},
): LocalModelRuntimeLease {
  const state = {
    schemaVersion: "ambient-local-model-runtime-state-v1" as const,
    runtimeId: "local-text-runtime",
    providerId: "local",
    modelId: AMBIENT_LOCAL_TEXT_MODEL,
    profileId: `local:${AMBIENT_LOCAL_TEXT_MODEL}:configured`,
    pid: 5001,
    status: "running" as const,
    command: ["/runtime/local-text", "serve"],
    cwd: workspacePath,
    stateDir: join(workspacePath, ".ambient/local-model-runtime/local-text-runtime"),
    stdoutPath: join(workspacePath, ".ambient/local-model-runtime/local-text-runtime/runtime.stdout.log"),
    stderrPath: join(workspacePath, ".ambient/local-model-runtime/local-text-runtime/runtime.stderr.log"),
    startedAt: "2026-06-05T00:00:00.000Z",
    lastUsedAt: "2026-06-05T00:00:00.000Z",
    idleTimeoutMs: 300000,
    estimatedResidentMemoryBytes: 6 * gib,
    actualResidentMemoryBytes: 4 * gib,
    memorySampledAt: "2026-06-05T00:00:01.000Z",
  };
  const runtimeLeaseRecord = {
    schemaVersion: "ambient-local-runtime-lease-v1" as const,
    leaseId: "lease-1",
    modelRuntimeId: state.runtimeId,
    modelProfileId: state.profileId,
    modelId: state.modelId,
    providerId: state.providerId,
    capabilityKind: "local-text" as const,
    estimatedResidentMemoryBytes: state.estimatedResidentMemoryBytes,
    actualResidentMemoryBytes: state.actualResidentMemoryBytes,
    pid: state.pid,
    acquiredAt: state.lastUsedAt,
    lastHeartbeatAt: state.lastUsedAt,
    status: "running" as const,
  };
  return {
    leaseId: "lease-1",
    state,
    acquisition: {
      schemaVersion: "ambient-local-model-runtime-acquisition-v1",
      source: "started",
      leaseId: "lease-1",
      runtimeId: state.runtimeId,
      providerId: state.providerId,
      modelId: state.modelId,
      ...(state.profileId ? { profileId: state.profileId } : {}),
      pid: state.pid,
      acquiredAt: state.lastUsedAt,
      activeLeases: 1,
      runtimeLease: runtimeLeaseRecord,
    },
    runtimeLease: runtimeLeaseRecord,
    release: options.release ?? (async () => agentRuntimeLocalModelRelease()),
    touch: async () => state,
  };
}

function agentRuntimeLocalModelRelease(overrides: Partial<LocalModelRuntimeReleaseResult> = {}): LocalModelRuntimeReleaseResult {
  return {
    status: "released",
    leaseId: "lease-1",
    pid: 5001,
    remainingLeases: 0,
    ...overrides,
  };
}

function agentRuntimeJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function agentRuntimeBudgetOverrunFixture(input: { roleId: "explorer" | "reviewer"; allowPartialResult: boolean }) {
  const workspacePath = await mkdtemp(join(tmpdir(), `ambient-runtime-subagent-budget-${input.allowPartialResult ? "partial" : "failed"}-`));
  const store = new ProjectStore();
  store.openWorkspace(workspacePath);
  store.setFeatureFlagSettings({ subagents: true });
  const parent = store.createThread("parent with budgeted child");
  const assistant = store.addMessage({
    threadId: parent.id,
    role: "assistant",
    content: "",
    metadata: { status: "streaming", runtime: "pi" },
  });
  const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
  const featureFlags = resolveAmbientFeatureFlags({
    settings: store.getFeatureFlagSettings(),
    generatedAt: "2026-06-05T00:00:00.000Z",
  });
  const baseRoleProfile = getDefaultSubagentRoleProfile(input.roleId);
  const roleProfileSnapshot = {
    ...baseRoleProfile,
    guardPolicy: {
      ...baseRoleProfile.guardPolicy,
      maxRuntimeMs: 0,
      allowPartialResult: input.allowPartialResult,
    },
  };
  const created = store.createSubagentRun({
    parentThreadId: parent.id,
    parentRunId: parentRun.id,
    parentMessageId: assistant.id,
    title: "Budgeted child",
    roleId: input.roleId,
    roleProfileSnapshot,
    canonicalTaskPath: `root/0:${input.roleId}`,
    featureFlagSnapshot: featureFlags,
    modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
    dependencyMode: "required",
  });
  const running = store.markSubagentRunStatus(created.id, "running");
  const waitBarrier = store.createSubagentWaitBarrier({
    parentThreadId: parent.id,
    parentRunId: parentRun.id,
    childRunIds: [running.id],
    dependencyMode: "required_all",
    failurePolicy: input.allowPartialResult ? "degrade_partial" : "ask_user",
    timeoutMs: 60_000,
  });
  const abort = vi.fn(async () => undefined);
  const emitted: any[] = [];
  const runtimeEvents: any[] = [];
  const runtime = new AgentRuntime(
    store,
    {} as any,
    {} as any,
    () =>
      ({
        isDestroyed: () => false,
        webContents: {
          isDestroyed: () => false,
          isCrashed: () => false,
          send: (_channel: string, event: any) => emitted.push(event),
        },
      }) as any,
    {
      request: vi.fn(),
      denyThread: () => undefined,
    },
  );
  (runtime as any).activeRuns.set(running.childThreadId, {
    abort,
    detach: vi.fn(),
    queue: vi.fn(),
  });
  (runtime as any).subagentChildExecutions.set(running.id, {
    childThreadId: running.childThreadId,
    promise: new Promise<void>(() => undefined),
    startedAt: new Date().toISOString(),
  });

  const waited = await (runtime as any).waitForResolvedSubagentChildRun({
    run: running,
    timeoutMs: 1,
    emitEvent: (event: any) => {
      const persisted = appendMappedSubagentRuntimeEvent(store, {
        run: running,
        source: "wait_agent",
        event,
      });
      runtimeEvents.push(persisted.runtimeEvent);
      return persisted.runEvent;
    },
  });

  return {
    workspacePath,
    store,
    assistant,
    waitBarrier,
    running,
    waited,
    run: store.getSubagentRun(running.id),
    abort,
    emitted,
    runtime,
    runtimeEvents,
    close: async () => {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    },
  };
}

describe("agent browser unavailable fallback", () => {
  it("turns unavailable browser errors into clear tool text", () => {
    const fallback = browserToolFallback(new BrowserUnavailableError("Chrome missing"));

    expect(fallback).toMatchObject({ unavailable: true, message: "Chrome missing" });
    if (!("unavailable" in fallback)) throw new Error("Expected browser unavailable fallback.");
    expect(browserUnavailableText(fallback)).toContain("Browser unavailable.");
    expect(browserUnavailableText(fallback)).toContain("Chrome missing");
  });

  it("preserves canceled user-action waits as tool failures", () => {
    const state = browserUserActionState("canceled");

    expect(() => browserToolFallback(new BrowserUserActionCanceledError(state))).toThrow(BrowserUserActionCanceledError);
  });

  it("preserves timed-out user-action waits as tool failures", () => {
    const state = browserUserActionState("timed-out");

    expect(() => browserToolFallback(new BrowserUserActionTimedOutError(state))).toThrow(BrowserUserActionTimedOutError);
  });
});

describe("AgentRuntime search preference tools", () => {
  it("registers web_research_preferences_update and writes the canonical global webResearch model", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-search-pref-tool-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const thread = store.createThread("search preference update");
      const currentSettings = {
        webResearch: {
          schemaVersion: "ambient-web-research-provider-stack-v1",
          providers: [
            { providerId: "exa-mcp-default", label: "Exa Search", kind: "remote-mcp", roles: ["search", "fetch"], status: "enabled" },
            { providerId: "ambient-browser", label: "Ambient Browser", kind: "built-in-browser", roles: ["search", "fetch"], status: "enabled" },
            { providerId: "ambient-brave-search", label: "Brave Search", kind: "ambient-cli", roles: ["search"], status: "enabled" },
          ],
          preferences: {
            search: ["ambient-brave-search", "exa-mcp-default", "ambient-browser"],
            fetch: ["exa-mcp-default", "ambient-browser"],
          },
          fallbackPolicy: { allowBrowserFallback: false },
        },
      };
      const updateSettings = vi.fn(async (input: any) => input);
      const permissionRequester = vi.fn(async (request: any) => {
        expect(request.toolName).toBe("web_research_preferences_update");
        expect(request.detail).toContain("Scope: Global Search & Web settings");
        expect(request.grantTargetLabel).toBe("Update Search & Web routing preference");
        expect(request.grantTargetHash).toMatch(/^[a-f0-9]{64}$/);
        return { allowed: true, mode: "allow_once" as const };
      });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: permissionRequester,
        denyThread: () => undefined,
      }, {
        search: {
          readSettings: () => currentSettings as any,
          updateSettings,
        },
      });
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      (runtime as any).createSearchPreferenceToolExtension(thread.id, workspace)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });

      expect(registeredTools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
        "web_research_preferences_update",
      ]));
      expect(registeredTools.map((tool) => tool.name)).not.toContain("ambient_search_preference_update");

      const update = registeredTools.find((tool) => tool.name === "web_research_preferences_update");
      if (!update) throw new Error("Missing web_research_preferences_update.");
      const result = await update.execute("search-pref-swap", {
        role: "search",
        providerOrder: ["Ambient Browser", "Exa Search"],
        reason: "Temporarily test provider order.",
      });

      expect(result.details).toMatchObject({
        toolName: "web_research_preferences_update",
        status: "complete",
        role: "search",
        providerOrder: ["ambient-browser", "exa-mcp-default"],
      });
      expect(updateSettings).toHaveBeenCalledWith(expect.objectContaining({
        webResearch: expect.objectContaining({
          preferences: expect.objectContaining({
            search: ["ambient-browser", "exa-mcp-default"],
          }),
          fallbackPolicy: { allowBrowserFallback: false },
        }),
      }));
      expect(result.details.settings.webSearch).toBeUndefined();
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});

describe("AgentRuntime sub-agent local runtime routing", () => {
  it("blocks explicit subagent prompts before opening a Pi session when the feature is disabled", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-preflight-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const thread = store.createThread("subagent feature disabled");
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });
      const getSession = vi.spyOn(runtime as any, "getSession");

      await runtime.send({
        threadId: thread.id,
        content: "Use one feedback subagent and one separate judge subagent for this draft.",
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: "ambient-preview",
        thinkingLevel: "medium",
        delivery: "prompt",
        context: [],
      });

      const assistant = store.listMessages(thread.id).find((message) => message.role === "assistant");
      expect(getSession).not.toHaveBeenCalled();
      expect(assistant?.metadata).toMatchObject({
        status: "error",
        preflightBlock: "subagent_unavailable",
      });
      expect(assistant?.content).toContain("ambient.subagents is disabled");
      expect(assistant?.content).toContain("I will not simulate sub-agents");
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("routes configured local text main chat through the local runtime without Pi", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-local-main-"));
    const store = new ProjectStore();
    const emitted: any[] = [];
    try {
      store.openWorkspace(workspacePath);
      const thread = store.updateThreadSettings(store.createThread("local main").id, {
        model: AMBIENT_LOCAL_TEXT_MODEL,
      });
      const release = vi.fn(async () => agentRuntimeLocalModelRelease());
      const runtimeManager = { acquire: vi.fn(async () => agentRuntimeLocalModelLease(workspacePath, { release })) };
      const fetchImpl = vi.fn(async () => agentRuntimeJsonResponse({ output_text: "Local main answer." }));
      const getWindow = () =>
        ({
          isDestroyed: () => false,
          webContents: {
            isDestroyed: () => false,
            isCrashed: () => false,
            send: (_channel: string, event: any) => emitted.push(event),
          },
        }) as any;
      const localProfile = agentRuntimeLocalTextProfile({ selectableAsMain: true });
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        getWindow,
        {
          request: vi.fn(async () => ({ allowed: true, mode: "allow_once" as const })),
          denyThread: () => undefined,
        },
        {
          localTextSubagents: {
            resolveModelRuntimeProfile: (modelId) => {
              if (modelId === AMBIENT_LOCAL_TEXT_MODEL) return localProfile;
              return resolveAmbientModelRuntimeProfile(modelId);
            },
            resolveRuntimeForMain: ({ thread: mainThread, runId, model }) => ({
              launch: {
                runtimeId: "local-text-runtime",
                command: "/runtime/local-text",
                args: ["serve"],
                cwd: mainThread.workspacePath,
                estimatedResidentMemoryBytes: 6 * gib,
                profileId: model.profileId,
              },
              completionUrl: "http://127.0.0.1:43123/v1/chat/completions",
              artifactRootPath: join(mainThread.workspacePath, ".ambient/local-main", runId),
              maxInlineChars: 1024,
            }),
            runtimeManager,
            fetchImpl: fetchImpl as typeof fetch,
          },
        },
      );
      const getSessionSpy = vi.spyOn(runtime as any, "getSession");

      await runtime.send({
        threadId: thread.id,
        content: "Answer locally.",
        permissionMode: thread.permissionMode,
        collaborationMode: thread.collaborationMode,
        model: AMBIENT_LOCAL_TEXT_MODEL,
        thinkingLevel: thread.thinkingLevel,
      });

      const messages = store.listMessages(thread.id);
      const assistant = messages.find((message) => message.role === "assistant");
      expect(assistant).toMatchObject({
        content: "Local main answer.",
        metadata: expect.objectContaining({
          status: "completed",
          runtime: "local_text",
          provider: "local",
          model: AMBIENT_LOCAL_TEXT_MODEL,
          localTextResult: expect.objectContaining({
            schemaVersion: "ambient-local-text-result-v1",
            runId: expect.any(String),
            textPreview: "Local main answer.",
          }),
        }),
      });
      expect(store.listActiveRuns()).toEqual([]);
      expect(emitted.map((event) => event.type)).toEqual(expect.arrayContaining([
        "message-created",
        "message-updated",
        "run-status",
        "thread-updated",
      ]));
      expect(emitted.filter((event) => event.type === "run-status").map((event) => event.status)).toEqual([
        "starting",
        "streaming",
        "idle",
      ]);
      expect(runtimeManager.acquire).toHaveBeenCalledWith(expect.objectContaining({
        runtimeId: "local-text-runtime",
        ownerThreadId: thread.id,
        modelId: AMBIENT_LOCAL_TEXT_MODEL,
      }));
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(release).toHaveBeenCalledTimes(1);
      expect(getSessionSpy).not.toHaveBeenCalled();
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("keeps Symphony parent mode on the tool-capable Pi path when a local text main model is selected", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-local-main-symphony-"));
    const store = new ProjectStore();
    const emitted: any[] = [];
    try {
      const workspace = store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const threadSessionDir = join(workspace.sessionPath, "local-symphony-session");
      await mkdir(threadSessionDir, { recursive: true });
      const sessionFile = join(threadSessionDir, "session.jsonl");
      await writeFile(sessionFile, "", "utf8");
      const thread = store.updateThreadSettings(store.createThread("local main Symphony").id, {
        model: AMBIENT_LOCAL_TEXT_MODEL,
        piSessionFile: sessionFile,
      });
      const release = vi.fn(async () => agentRuntimeLocalModelRelease());
      const runtimeManager = { acquire: vi.fn(async () => agentRuntimeLocalModelLease(workspacePath, { release })) };
      const fetchImpl = vi.fn(async () => agentRuntimeJsonResponse({ output_text: "Local main should not answer." }));
      const getWindow = () =>
        ({
          isDestroyed: () => false,
          webContents: {
            isDestroyed: () => false,
            isCrashed: () => false,
            send: (_channel: string, event: any) => emitted.push(event),
          },
        }) as any;
      const localProfile = agentRuntimeLocalTextProfile({ selectableAsMain: true });
      const subscribers: Array<(event: any) => void> = [];
      const emit = (event: any) => {
        for (const subscriber of [...subscribers]) subscriber(event);
      };
      const session = {
        ...fakePiSession(sessionFile),
        isStreaming: true,
        subscribe: vi.fn((subscriber: (event: any) => void) => {
          subscribers.push(subscriber);
          return () => {
            const index = subscribers.indexOf(subscriber);
            if (index >= 0) subscribers.splice(index, 1);
          };
        }),
        prompt: vi.fn(async () => {
          emit({
            type: "message_end",
            message: {
              role: "assistant",
              stopReason: "stop",
              content: [{ type: "text", text: "I cannot run local text for Symphony." }],
            },
          });
        }),
        steer: vi.fn(async () => undefined),
        compact: vi.fn(async () => undefined),
        agent: {
          abort: vi.fn(),
          waitForIdle: vi.fn(async () => undefined),
        },
      };
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        getWindow,
        {
          request: vi.fn(async () => ({ allowed: true, mode: "allow_once" as const })),
          denyThread: () => undefined,
        },
        {
          localTextSubagents: {
            resolveModelRuntimeProfile: (modelId) => {
              if (modelId === AMBIENT_LOCAL_TEXT_MODEL) return localProfile;
              return resolveAmbientModelRuntimeProfile(modelId);
            },
            resolveRuntimeForMain: ({ thread: mainThread, runId, model }) => ({
              launch: {
                runtimeId: "local-text-runtime",
                command: "/runtime/local-text",
                args: ["serve"],
                cwd: mainThread.workspacePath,
                estimatedResidentMemoryBytes: 6 * gib,
                profileId: model.profileId,
              },
              completionUrl: "http://127.0.0.1:43123/v1/chat/completions",
              artifactRootPath: join(mainThread.workspacePath, ".ambient/local-main", runId),
              maxInlineChars: 1024,
            }),
            runtimeManager,
            fetchImpl: fetchImpl as typeof fetch,
          },
        },
      );
      const getSessionSpy = vi.spyOn(runtime as any, "getSession").mockResolvedValue(session);

      await runtime.send({
        threadId: thread.id,
        content: "Use Symphony to compare these options.",
        permissionMode: thread.permissionMode,
        collaborationMode: thread.collaborationMode,
        model: AMBIENT_LOCAL_TEXT_MODEL,
        thinkingLevel: thread.thinkingLevel,
        composerIntent: {
          kind: "symphony-workflow",
          action: "run-once",
          patternId: "map_reduce",
          metricCustomizations: {
            "map_reduce-metric": "Reducer must cite each child result before synthesis.",
          },
        },
      });

      expect(runtimeManager.acquire).not.toHaveBeenCalled();
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(getSessionSpy).toHaveBeenCalledTimes(1);
      expect(getSessionSpy.mock.calls[0]?.[0]).toMatchObject({ model: AMBIENT_KIMI_K2_7_CODE_MODEL });
      expect(store.getThread(thread.id).model).toBe(AMBIENT_KIMI_K2_7_CODE_MODEL);
      expect(session.prompt).toHaveBeenCalledTimes(1);
      const prompt = String((session.prompt as any).mock.calls[0]?.[0] ?? "");
      expect(prompt).toContain("ambient_workflow_symphony_map_reduce");
      expect(prompt).not.toContain("Use ambient_subagent");
      expect(prompt).not.toContain("Ambient sub-agent orchestration pattern detected");
      expect(store.listCallableWorkflowTasksForParentThread(thread.id)).toEqual([]);
      expect(store.listMessages(thread.id).at(-1)).toMatchObject({
        metadata: expect.objectContaining({ status: "error", runtime: "pi" }),
      });
      expect(store.listMessages(thread.id).at(-1)?.metadata?.localTextResult).toBeUndefined();
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("routes configured local text child runs through the local runtime adapter", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-local-subagent-"));
    const store = new ProjectStore();
    const emitted: any[] = [];
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("local sub-agent parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const release = vi.fn(async () => agentRuntimeLocalModelRelease());
      const runtimeManager = { acquire: vi.fn(async () => agentRuntimeLocalModelLease(workspacePath, { release })) };
      const fetchImpl = vi.fn(async () => agentRuntimeJsonResponse({ output_text: "Local sub-agent result." }));
      const getWindow = () =>
        ({
          isDestroyed: () => false,
          webContents: {
            isDestroyed: () => false,
            isCrashed: () => false,
            send: (_channel: string, event: any) => emitted.push(event),
          },
        }) as any;
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        getWindow,
        {
          request: vi.fn(async () => ({ allowed: true, mode: "allow_once" as const })),
          denyThread: () => undefined,
        },
        {
        featureFlags: {
          readSnapshot: () => resolveAmbientFeatureFlags({
            startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
            generatedAt: "2026-06-05T00:00:00.000Z",
          }),
        },
        localTextSubagents: {
          resolveModelRuntimeProfile: (modelId) => {
            if (modelId === AMBIENT_LOCAL_TEXT_MODEL) return agentRuntimeLocalTextProfile();
            return resolveAmbientModelRuntimeProfile(modelId);
          },
          resolveRuntime: ({ parentThread, run, model }) => ({
            launch: {
              runtimeId: "local-text-runtime",
              command: "/runtime/local-text",
              args: ["serve"],
              cwd: parentThread.workspacePath,
              estimatedResidentMemoryBytes: 6 * gib,
              profileId: model.profileId,
            },
            completionUrl: "http://127.0.0.1:43123/v1/chat/completions",
            artifactRootPath: join(parentThread.workspacePath, ".ambient/subagents", run.id),
            maxInlineChars: 1024,
          }),
          runtimeManager,
          fetchImpl: fetchImpl as typeof fetch,
          now: () => new Date("2026-06-05T00:00:00.000Z"),
        },
      });
      const sendSpy = vi.spyOn(runtime as any, "send").mockRejectedValue(new Error("Pi child session should not run."));
      (runtime as any).activeRunIds.set(parent.id, parentRun.id);
      const registeredTools: any[] = [];
      (runtime as any).createSubagentToolExtension(parent.id)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const subagentTool = registeredTools.find((tool) => tool.name === "ambient_subagent");
      if (!subagentTool) throw new Error("ambient_subagent tool was not registered.");

      const spawned = await subagentTool.execute("spawn-local-text", {
        action: "spawn_agent",
        roleId: "summarizer",
        task: "Summarize the local evidence.",
        modelId: AMBIENT_LOCAL_TEXT_MODEL,
        dependencyMode: "required",
        forkMode: "no_history",
        promptMode: "fresh",
        toolScope: { requestedCategories: ["artifact.read"] },
        idempotencyKey: "spawn:agent-runtime-local-text",
      });
      const runId = spawned.details.run.id as string;
      const waited = await subagentTool.execute("wait-local-text", {
        action: "wait_agent",
        childRunId: runId,
        wait: { timeoutMs: 5000 },
      });
      const run = store.getSubagentRun(runId);

      expect(waited.details).toMatchObject({
        status: "completed",
        synthesisAllowed: true,
      });
      expect(run).toMatchObject({
        status: "completed",
        modelRuntimeSnapshot: {
          requestedModelId: AMBIENT_LOCAL_TEXT_MODEL,
          profile: {
            modelId: AMBIENT_LOCAL_TEXT_MODEL,
            locality: "local",
            available: true,
          },
        },
        resultArtifact: {
          status: "completed",
          summary: "Local sub-agent result.",
        },
      });
      expect(store.listMessages(run.childThreadId).map((message) => message.role)).toEqual([
        "system",
        "system",
        "assistant",
      ]);
      const runUpdates = emitted.filter((event) => event.type === "subagent-run-updated");
      expect(runUpdates.map((event) => event.run.status)).toEqual(expect.arrayContaining(["reserved", "starting", "running", "completed"]));
      expect(runUpdates.at(-1)).toMatchObject({
        type: "subagent-run-updated",
        run: expect.objectContaining({ id: runId, status: "completed" }),
        workspacePath,
      });
      const runEventUpdates = emitted.filter((event) => event.type === "subagent-run-event-created");
      expect(runEventUpdates.map((event) => event.event.type)).toEqual(expect.arrayContaining([
        "subagent.reserved",
        "subagent.spawn_requested",
        "subagent.status_changed",
        "subagent.runtime_event",
        "subagent.local_text_completed",
      ]));
      expect(runEventUpdates).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "subagent-run-event-created",
          run: expect.objectContaining({ id: runId }),
          event: expect.objectContaining({ runId, type: "subagent.local_text_completed" }),
          workspacePath,
        }),
      ]));
      expect(emitted).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "subagent-tool-scope-snapshot-recorded",
          run: expect.objectContaining({ id: runId }),
          snapshot: expect.objectContaining({
            runId,
            scope: expect.objectContaining({
              piVisibleCategories: ["artifact.read"],
            }),
          }),
          workspacePath,
        }),
      ]));
      const barrierUpdates = emitted.filter((event) => event.type === "subagent-wait-barrier-updated");
      expect(barrierUpdates.map((event) => event.barrier.status)).toEqual(expect.arrayContaining(["waiting_on_children", "satisfied"]));
      expect(barrierUpdates.at(-1)).toMatchObject({
        type: "subagent-wait-barrier-updated",
        barrier: expect.objectContaining({
          parentThreadId: parent.id,
          parentRunId: parentRun.id,
          childRunIds: [runId],
          status: "satisfied",
        }),
        workspacePath,
      });
      expect(runtimeManager.acquire).toHaveBeenCalledWith(expect.objectContaining({
        runtimeId: "local-text-runtime",
        ownerThreadId: run.childThreadId,
        modelId: AMBIENT_LOCAL_TEXT_MODEL,
      }));
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(release).toHaveBeenCalledTimes(1);
      expect(sendSpy).not.toHaveBeenCalled();
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("uses structured child JSON when the result status marker is present without a colon", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-malformed-status-"));
    const store = new ProjectStore();
    const emitted: any[] = [];
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("malformed status sub-agent parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const getWindow = () =>
        ({
          isDestroyed: () => false,
          webContents: {
            isDestroyed: () => false,
            isCrashed: () => false,
            send: (_channel: string, event: any) => emitted.push(event),
          },
        }) as any;
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        getWindow,
        {
          request: vi.fn(async () => ({ allowed: true, mode: "allow_once" as const })),
          denyThread: () => undefined,
        },
        {
          featureFlags: {
            readSnapshot: () => resolveAmbientFeatureFlags({
              startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
              generatedAt: "2026-06-05T00:00:00.000Z",
            }),
          },
        },
      );
      vi.spyOn(runtime as any, "send").mockImplementation(async (input: any) => {
        store.addMessage({
          threadId: input.threadId,
          role: "user",
          content: input.visibleUserContent ?? input.content,
          metadata: { delivery: input.delivery, internal: input.internal },
        });
        const structuredOutput = {
          schemaVersion: "ambient-subagent-structured-result-v1",
          roleId: "summarizer",
          status: "complete",
          summary: "Live child smoke completed with SUBAGENT_CHILD_DONE.",
          evidence: ["SUBAGENT_CHILD_DONE"],
          artifacts: [],
          risks: [],
          nextActions: [],
          roleOutput: {
            keyPoints: ["SUBAGENT_CHILD_DONE"],
            sourceRefs: [],
          },
        };
        store.addMessage({
          threadId: input.threadId,
          role: "assistant",
          content: [
            "SUBAGENT_RESULT_JSON:",
            "```json",
            JSON.stringify(structuredOutput, null, 2),
            "```",
            "SUBAGENT_RESULT_STATUS",
            "The model emitted explanatory prose after a malformed status marker.",
          ].join("\n"),
          metadata: { status: "done" },
        });
        store.addMessage({
          threadId: input.threadId,
          role: "assistant",
          content: "Trailing assistant prose should not replace the structured child result.",
          metadata: { status: "done" },
        });
      });
      (runtime as any).activeRunIds.set(parent.id, parentRun.id);
      const registeredTools: any[] = [];
      (runtime as any).createSubagentToolExtension(parent.id)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const subagentTool = registeredTools.find((tool) => tool.name === "ambient_subagent");
      if (!subagentTool) throw new Error("ambient_subagent tool was not registered.");

      const spawned = await subagentTool.execute("spawn-malformed-status-child", {
        action: "spawn_agent",
        roleId: "summarizer",
        task: "Complete the child smoke result.",
        dependencyMode: "required",
        idempotencyKey: "spawn:malformed-status-child",
      });
      const runId = spawned.details.run.id as string;
      const waited = await subagentTool.execute("wait-malformed-status-child", {
        action: "wait_agent",
        childRunId: runId,
        wait: { timeoutMs: 5000 },
      });
      const run = store.getSubagentRun(runId);

      expect(waited.details).toMatchObject({
        status: "completed",
        synthesisAllowed: true,
      });
      expect(run).toMatchObject({
        status: "completed",
        resultArtifact: {
          status: "completed",
          structuredOutput: {
            roleId: "summarizer",
            status: "complete",
            summary: "Live child smoke completed with SUBAGENT_CHILD_DONE.",
          },
        },
      });
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)).toEqual([]);
      expect(store.listSubagentRunEvents(runId).map((event) => event.type)).toEqual(expect.arrayContaining([
        "subagent.result_ready",
      ]));
      expect(store.listMessages(run.childThreadId).filter((message) => message.metadata?.runtime === "ambient-recovery")).toEqual([]);
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("recovers missing child result contracts without reusing stale assistant output", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-result-contract-followup-"));
    const store = new ProjectStore();
    const emitted: any[] = [];
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("result contract follow-up sub-agent parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const getWindow = () =>
        ({
          isDestroyed: () => false,
          webContents: {
            isDestroyed: () => false,
            isCrashed: () => false,
            send: (_channel: string, event: any) => emitted.push(event),
          },
        }) as any;
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        getWindow,
        {
          request: vi.fn(async () => ({ allowed: true, mode: "allow_once" as const })),
          denyThread: () => undefined,
        },
        {
          featureFlags: {
            readSnapshot: () => resolveAmbientFeatureFlags({
              startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
              generatedAt: "2026-06-05T00:00:00.000Z",
            }),
          },
        },
      );
      const sent: any[] = [];
      const sendSpy = vi.spyOn(runtime as any, "send").mockImplementation(async (input: any) => {
        sent.push(input);
        store.addMessage({
          threadId: input.threadId,
          role: "user",
          content: input.visibleUserContent ?? input.content,
          metadata: { delivery: input.delivery, internal: input.internal },
        });
        if (sent.length === 1) {
          store.addMessage({
            threadId: input.threadId,
            role: "assistant",
            content: "I found the requested answer, but forgot the structured result contract.",
            metadata: { status: "done" },
          });
          return;
        }
        if (sent.length === 2) {
          return;
        }
        const structuredOutput = {
          schemaVersion: "ambient-subagent-structured-result-v1",
          roleId: "explorer",
          status: "complete",
          summary: "Recovered the child result contract after a blank recovery turn.",
          evidence: ["The first child answer contained useful prose."],
          artifacts: [],
          risks: [],
          nextActions: [],
          roleOutput: {
            findings: [{ summary: "The child task result was recovered from the visible transcript.", provenance: ["visible child transcript"] }],
            openQuestions: [],
          },
        };
        store.addMessage({
          threadId: input.threadId,
          role: "assistant",
          content: [
            "Recovered the missing result contract.",
            `SUBAGENT_RESULT_JSON: ${JSON.stringify(structuredOutput)}`,
            "SUBAGENT_RESULT_STATUS: complete",
          ].join("\n"),
          metadata: { status: "done" },
        });
      });
      (runtime as any).activeRunIds.set(parent.id, parentRun.id);
      const registeredTools: any[] = [];
      (runtime as any).createSubagentToolExtension(parent.id)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const subagentTool = registeredTools.find((tool) => tool.name === "ambient_subagent");
      if (!subagentTool) throw new Error("ambient_subagent tool was not registered.");

      const spawned = await subagentTool.execute("spawn-result-contract-followup-child", {
        action: "spawn_agent",
        roleId: "explorer",
        task: "Answer a bounded question and return the child result contract.",
        dependencyMode: "required",
        idempotencyKey: "spawn:result-contract-followup-child",
      });
      const runId = spawned.details.run.id as string;
      const waited = await subagentTool.execute("wait-result-contract-followup-child", {
        action: "wait_agent",
        childRunId: runId,
        wait: { timeoutMs: 5000 },
      });
      const run = store.getSubagentRun(runId);
      const contractFollowups = store
        .listSubagentRunEvents(runId)
        .filter((event) => event.type === "subagent.result_contract_followup_required")
        .map((event) => event.preview as { hadAssistantText?: boolean; reason?: string });

      expect(sendSpy).toHaveBeenCalledTimes(3);
      expect(sent[1]).toMatchObject({
        threadId: run.childThreadId,
        delivery: "follow-up",
        preserveActiveThread: true,
        internal: true,
        visibleUserContent: expect.stringContaining("Sub-agent runtime follow-up: Structured-output role result is missing"),
      });
      expect(sent[1].modelContentOverride).toContain("Do not redo long prose unless required");
      expect(sent[2].modelContentOverride).toContain("The previous turn did not leave a usable assistant answer");
      expect(contractFollowups).toMatchObject([
        { hadAssistantText: true, reason: "Structured-output role result is missing the SUBAGENT_RESULT_STATUS status line." },
        { hadAssistantText: false, reason: "Structured-output role result is missing the SUBAGENT_RESULT_STATUS status line." },
      ]);
      expect(waited.details).toMatchObject({
        status: "completed",
        waitSatisfied: true,
        synthesisAllowed: true,
      });
      expect(run).toMatchObject({
        status: "completed",
        resultArtifact: {
          status: "completed",
          summary: expect.stringContaining("Recovered the missing result contract."),
          structuredOutput: {
            roleId: "explorer",
            status: "complete",
          },
        },
      });
      expect(store.listMessages(run.childThreadId).map((message) => message.role)).toEqual([
        "system",
        "user",
        "assistant",
        "user",
        "user",
        "assistant",
      ]);
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("repairs invalid structured child result envelopes before terminal policy failure", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-invalid-structured-followup-"));
    const store = new ProjectStore();
    const emitted: any[] = [];
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("invalid structured follow-up sub-agent parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const getWindow = () =>
        ({
          isDestroyed: () => false,
          webContents: {
            isDestroyed: () => false,
            isCrashed: () => false,
            send: (_channel: string, event: any) => emitted.push(event),
          },
        }) as any;
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        getWindow,
        {
          request: vi.fn(async () => ({ allowed: true, mode: "allow_once" as const })),
          denyThread: () => undefined,
        },
        {
          featureFlags: {
            readSnapshot: () => resolveAmbientFeatureFlags({
              startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
              generatedAt: "2026-06-05T00:00:00.000Z",
            }),
          },
        },
      );
      const sent: any[] = [];
      const sendSpy = vi.spyOn(runtime as any, "send").mockImplementation(async (input: any) => {
        sent.push(input);
        store.addMessage({
          threadId: input.threadId,
          role: "user",
          content: input.visibleUserContent ?? input.content,
          metadata: { delivery: input.delivery, internal: input.internal },
        });
        if (sent.length === 1) {
          store.addMessage({
            threadId: input.threadId,
            role: "assistant",
            content: [
              "The fixture answer is blue, but this envelope uses the wrong role id.",
              `SUBAGENT_RESULT_JSON: ${JSON.stringify({
                schemaVersion: "ambient-subagent-structured-result-v1",
                roleId: "summarizer",
                status: "complete",
                summary: "The fixture answer is blue.",
                evidence: ["visible child transcript"],
                artifacts: [],
                risks: [],
                nextActions: [],
                roleOutput: {
                  keyPoints: ["The fixture answer is blue."],
                  sourceRefs: ["visible child transcript"],
                },
              })}`,
              "SUBAGENT_RESULT_STATUS: complete",
            ].join("\n"),
            metadata: { status: "done" },
          });
          return;
        }
        store.addMessage({
          threadId: input.threadId,
          role: "assistant",
          content: [
            "Recovered the structured envelope with the correct explorer role.",
            `SUBAGENT_RESULT_JSON: ${JSON.stringify({
              schemaVersion: "ambient-subagent-structured-result-v1",
              roleId: "explorer",
              status: "complete",
              summary: "The fixture answer is blue.",
              evidence: ["visible child transcript"],
              artifacts: [],
              risks: [],
              nextActions: [],
              roleOutput: {
                findings: [{ summary: "The fixture answer is blue.", provenance: ["visible child transcript"] }],
                openQuestions: [],
              },
            })}`,
            "SUBAGENT_RESULT_STATUS: complete",
          ].join("\n"),
          metadata: { status: "done" },
        });
      });
      (runtime as any).activeRunIds.set(parent.id, parentRun.id);
      const registeredTools: any[] = [];
      (runtime as any).createSubagentToolExtension(parent.id)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const subagentTool = registeredTools.find((tool) => tool.name === "ambient_subagent");
      if (!subagentTool) throw new Error("ambient_subagent tool was not registered.");

      const spawned = await subagentTool.execute("spawn-invalid-structured-followup-child", {
        action: "spawn_agent",
        roleId: "explorer",
        task: "Answer a bounded fixture question and return the child result contract.",
        dependencyMode: "required",
        idempotencyKey: "spawn:invalid-structured-followup-child",
      });
      const runId = spawned.details.run.id as string;
      const waited = await subagentTool.execute("wait-invalid-structured-followup-child", {
        action: "wait_agent",
        childRunId: runId,
        wait: { timeoutMs: 5000 },
      });
      const run = store.getSubagentRun(runId);
      const contractFollowups = store
        .listSubagentRunEvents(runId)
        .filter((event) => event.type === "subagent.result_contract_followup_required")
        .map((event) => event.preview as { hadAssistantText?: boolean; reason?: string });

      expect(sendSpy).toHaveBeenCalledTimes(2);
      expect(sent[1]).toMatchObject({
        threadId: run.childThreadId,
        delivery: "follow-up",
        preserveActiveThread: true,
        internal: true,
        visibleUserContent: expect.stringContaining("Sub-agent runtime follow-up: Structured result roleId must match child role explorer."),
      });
      expect(sent[1].modelContentOverride).toContain("summarize that answer in the structured result");
      expect(contractFollowups).toMatchObject([
        { hadAssistantText: true, reason: "Structured result roleId must match child role explorer." },
      ]);
      expect(waited.details).toMatchObject({
        status: "completed",
        waitSatisfied: true,
        synthesisAllowed: true,
      });
      expect(run).toMatchObject({
        status: "completed",
        resultArtifact: {
          status: "completed",
          summary: expect.stringContaining("The fixture answer is blue."),
          structuredOutput: {
            roleId: "explorer",
            status: "complete",
          },
        },
      });
      expect(store.listSubagentRunEvents(runId).map((event) => event.type)).toEqual(expect.arrayContaining([
        "subagent.result_contract_followup_required",
        "subagent.internal_post_tool_followup_started",
        "subagent.result_ready",
      ]));
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("records terminal evidence when structured child result repair is exhausted", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-structured-repair-exhausted-"));
    const store = new ProjectStore();
    const emitted: any[] = [];
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("structured repair exhausted sub-agent parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const getWindow = () =>
        ({
          isDestroyed: () => false,
          webContents: {
            isDestroyed: () => false,
            isCrashed: () => false,
            send: (_channel: string, event: any) => emitted.push(event),
          },
        }) as any;
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        getWindow,
        {
          request: vi.fn(async () => ({ allowed: true, mode: "allow_once" as const })),
          denyThread: () => undefined,
        },
        {
          featureFlags: {
            readSnapshot: () => resolveAmbientFeatureFlags({
              startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
              generatedAt: "2026-06-05T00:00:00.000Z",
            }),
          },
        },
      );
      const sent: any[] = [];
      const sendSpy = vi.spyOn(runtime as any, "send").mockImplementation(async (input: any) => {
        sent.push(input);
        store.addMessage({
          threadId: input.threadId,
          role: "user",
          content: input.visibleUserContent ?? input.content,
          metadata: { delivery: input.delivery, internal: input.internal },
        });
        store.addMessage({
          threadId: input.threadId,
          role: "assistant",
          content: [
            "I keep returning the wrong structured envelope.",
            `SUBAGENT_RESULT_JSON: ${JSON.stringify({
              schemaVersion: "ambient-subagent-structured-result-v1",
              roleId: "summarizer",
              status: "complete",
              summary: "The fixture answer is blue.",
              evidence: ["visible child transcript"],
              artifacts: [],
              risks: [],
              nextActions: [],
              roleOutput: {
                keyPoints: ["The fixture answer is blue."],
                sourceRefs: ["visible child transcript"],
              },
            })}`,
            "SUBAGENT_RESULT_STATUS: complete",
          ].join("\n"),
          metadata: { status: "done" },
        });
      });
      (runtime as any).activeRunIds.set(parent.id, parentRun.id);
      const registeredTools: any[] = [];
      (runtime as any).createSubagentToolExtension(parent.id)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const subagentTool = registeredTools.find((tool) => tool.name === "ambient_subagent");
      if (!subagentTool) throw new Error("ambient_subagent tool was not registered.");

      const spawned = await subagentTool.execute("spawn-structured-repair-exhausted-child", {
        action: "spawn_agent",
        roleId: "explorer",
        task: "Answer a bounded fixture question and return the child result contract.",
        dependencyMode: "required",
        idempotencyKey: "spawn:structured-repair-exhausted-child",
      });
      const runId = spawned.details.run.id as string;
      const waited = await subagentTool.execute("wait-structured-repair-exhausted-child", {
        action: "wait_agent",
        childRunId: runId,
        wait: { timeoutMs: 5000 },
      });
      const run = store.getSubagentRun(runId);
      const eventTypes = store.listSubagentRunEvents(runId).map((event) => event.type);

      expect(sendSpy).toHaveBeenCalledTimes(4);
      expect(sent.slice(1).every((input) => input.delivery === "follow-up")).toBe(true);
      expect(eventTypes.filter((type) => type === "subagent.result_contract_followup_required")).toHaveLength(4);
      expect(eventTypes.filter((type) => type === "subagent.internal_post_tool_followup_started")).toHaveLength(3);
      expect(eventTypes).toEqual(expect.arrayContaining([
        "subagent.result_contract_repair_exhausted",
        "subagent.child_session_failed",
      ]));
      expect(run).toMatchObject({
        status: "failed",
        resultArtifact: {
          status: "failed",
          summary: expect.stringContaining("Ambient exhausted automatic child post-tool finalization follow-ups"),
        },
      });
      expect(waited.details).toMatchObject({
        status: "failed",
        waitSatisfied: true,
        synthesisAllowed: false,
        waitBarrier: {
          status: "failed",
        },
        waitBarrierEvaluation: {
          impossible: true,
          terminalUnsafeChildRunIds: [runId],
        },
        waitBarrierBlockers: [
          expect.objectContaining({
            childRunId: runId,
            blockingState: "terminal_unsafe",
            resultRepairState: expect.objectContaining({
              state: "result_contract_repair_exhausted",
              reason: "Structured result roleId must match child role explorer.",
              maxAttempts: 3,
            }),
          }),
        ],
      });
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("continues a child turn that ends after tool results without a structured result", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-post-tool-followup-"));
    const store = new ProjectStore();
    const emitted: any[] = [];
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("post-tool follow-up sub-agent parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const getWindow = () =>
        ({
          isDestroyed: () => false,
          webContents: {
            isDestroyed: () => false,
            isCrashed: () => false,
            send: (_channel: string, event: any) => emitted.push(event),
          },
        }) as any;
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        getWindow,
        {
          request: vi.fn(async () => ({ allowed: true, mode: "allow_once" as const })),
          denyThread: () => undefined,
        },
        {
          featureFlags: {
            readSnapshot: () => resolveAmbientFeatureFlags({
              startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
              generatedAt: "2026-06-05T00:00:00.000Z",
            }),
          },
        },
      );
      const sent: any[] = [];
      const sendSpy = vi.spyOn(runtime as any, "send").mockImplementation(async (input: any) => {
        sent.push(input);
        store.addMessage({
          threadId: input.threadId,
          role: "user",
          content: input.visibleUserContent ?? input.content,
          metadata: { delivery: input.delivery, internal: input.internal },
        });
        if (sent.length === 1) {
          store.addMessage({
            threadId: input.threadId,
            role: "assistant",
            content: "I'll inspect the granted file first.",
            metadata: { status: "done" },
          });
          store.addMessage({
            threadId: input.threadId,
            role: "tool",
            content: "read completed\n\nResult\nTEXT_AUTHORITY_OK: native text read is allowed.",
            metadata: {
              status: "done",
              toolName: "read",
              registeredName: "read",
              toolCallId: "call-read-1",
            },
          });
          return;
        }
        const structuredOutput = {
          schemaVersion: "ambient-subagent-structured-result-v1",
          roleId: "explorer",
          status: "complete",
          summary: "Recovered after post-tool follow-up.",
          evidence: ["TEXT_AUTHORITY_OK"],
          artifacts: [],
          risks: [],
          nextActions: [],
          roleOutput: {
            findings: [{ summary: "The granted file was readable.", provenance: ["read tool result"] }],
            openQuestions: [],
          },
        };
        store.addMessage({
          threadId: input.threadId,
          role: "assistant",
          content: [
            "Recovered after post-tool follow-up.",
            `SUBAGENT_RESULT_JSON: ${JSON.stringify(structuredOutput)}`,
            "SUBAGENT_RESULT_STATUS: complete",
          ].join("\n"),
          metadata: { status: "done" },
        });
      });
      (runtime as any).activeRunIds.set(parent.id, parentRun.id);
      const registeredTools: any[] = [];
      (runtime as any).createSubagentToolExtension(parent.id)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const subagentTool = registeredTools.find((tool) => tool.name === "ambient_subagent");
      if (!subagentTool) throw new Error("ambient_subagent tool was not registered.");

      const spawned = await subagentTool.execute("spawn-post-tool-followup-child", {
        action: "spawn_agent",
        roleId: "explorer",
        task: "Read the granted note and report the result.",
        dependencyMode: "required",
        toolScope: { requestedCategories: ["workspace.read"] },
        idempotencyKey: "spawn:post-tool-followup-child",
      });
      const runId = spawned.details.run.id as string;
      const waited = await subagentTool.execute("wait-post-tool-followup-child", {
        action: "wait_agent",
        childRunId: runId,
        wait: { timeoutMs: 5000 },
      });
      const run = store.getSubagentRun(runId);

      expect(sendSpy).toHaveBeenCalledTimes(2);
      expect(sent[1]).toMatchObject({
        threadId: run.childThreadId,
        delivery: "follow-up",
        preserveActiveThread: true,
        internal: true,
        visibleUserContent: expect.stringContaining("Sub-agent runtime follow-up: Child produced tool results"),
      });
      expect(sent[1].modelContentOverride).toContain("Continue from the visible child transcript.");
      expect(sent[1].modelContentOverride).toContain("SUBAGENT_RESULT_STATUS: complete");
      expect(waited.details).toMatchObject({
        status: "completed",
        waitSatisfied: true,
        synthesisAllowed: true,
      });
      expect(run).toMatchObject({
        status: "completed",
        resultArtifact: {
          status: "completed",
          summary: expect.stringContaining("Recovered after post-tool follow-up."),
          structuredOutput: {
            roleId: "explorer",
            status: "complete",
          },
        },
      });
      expect(store.listSubagentRunEvents(runId).map((event) => event.type)).toEqual(expect.arrayContaining([
        "subagent.post_tool_followup_required",
        "subagent.internal_post_tool_followup_started",
        "subagent.result_ready",
      ]));
      expect(store.listMessages(run.childThreadId).map((message) => message.role)).toEqual([
        "system",
        "user",
        "assistant",
        "tool",
        "user",
        "assistant",
      ]);
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("runs an idle Pi child follow-up turn through mailbox delivery and wait", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-followup-"));
    const store = new ProjectStore();
    const emitted: any[] = [];
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("follow-up sub-agent parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const getWindow = () =>
        ({
          isDestroyed: () => false,
          webContents: {
            isDestroyed: () => false,
            isCrashed: () => false,
            send: (_channel: string, event: any) => emitted.push(event),
          },
        }) as any;
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        getWindow,
        {
          request: vi.fn(async () => ({ allowed: true, mode: "allow_once" as const })),
          denyThread: () => undefined,
        },
        {
          featureFlags: {
            readSnapshot: () => resolveAmbientFeatureFlags({
              startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
              generatedAt: "2026-06-05T00:00:00.000Z",
            }),
          },
        },
      );
      const sent: any[] = [];
      const sendSpy = vi.spyOn(runtime as any, "send").mockImplementation(async (input: any) => {
        sent.push(input);
        store.addMessage({
          threadId: input.threadId,
          role: "user",
          content: input.visibleUserContent ?? input.content,
          metadata: { delivery: input.delivery, internal: input.internal },
        });
        const firstTurn = sent.length === 1;
        const completeSummary = `Inspected restart-smoke fixture. ${"Preserved full child output in the transcript artifact. ".repeat(40)}`;
        const structuredOutput = firstTurn
          ? {
            schemaVersion: "ambient-subagent-structured-result-v1",
            roleId: "explorer",
            status: "needs_attention",
            summary: "Need the parent to pick a fixture.",
            evidence: [],
            artifacts: [],
            risks: [],
            nextActions: ["Send the chosen fixture name as a follow-up."],
            roleOutput: { findings: [], openQuestions: ["Which fixture should I inspect?"] },
          }
          : {
            schemaVersion: "ambient-subagent-structured-result-v1",
            roleId: "explorer",
            status: "complete",
            summary: completeSummary,
            evidence: ["Parent follow-up selected restart-smoke."],
            artifacts: [],
            risks: [],
            nextActions: [],
            roleOutput: { findings: [{ summary: "restart-smoke fixture is ready.", provenance: ["parent follow-up"] }], openQuestions: [] },
          };
        store.addMessage({
          threadId: input.threadId,
          role: "assistant",
          content: [
            structuredOutput.summary,
            `SUBAGENT_RESULT_STATUS: ${firstTurn ? "needs_attention" : "complete"}`,
            `SUBAGENT_RESULT_JSON: ${JSON.stringify(structuredOutput)}`,
          ].join("\n"),
          metadata: { status: "done" },
        });
      });
      (runtime as any).activeRunIds.set(parent.id, parentRun.id);
      const registeredTools: any[] = [];
      (runtime as any).createSubagentToolExtension(parent.id)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const subagentTool = registeredTools.find((tool) => tool.name === "ambient_subagent");
      if (!subagentTool) throw new Error("ambient_subagent tool was not registered.");

      const spawned = await subagentTool.execute("spawn-followup-child", {
        action: "spawn_agent",
        roleId: "explorer",
        task: "Inspect a fixture after asking the parent which one to use.",
        dependencyMode: "required",
        idempotencyKey: "spawn:agent-runtime-followup",
      });
      const runId = spawned.details.run.id as string;
      const firstWait = await subagentTool.execute("wait-needs-attention", {
        action: "wait_agent",
        childRunId: runId,
        wait: { timeoutMs: 5000 },
      });
      expect(firstWait.details).toMatchObject({
        status: "needs_attention",
        synthesisAllowed: false,
        parentResolution: {
          action: "ask_user",
          requiresUserInput: true,
        },
      });

      const followed = await subagentTool.execute("followup-idle-child", {
        action: "followup_agent",
        childRunId: runId,
        message: "Use the restart-smoke fixture.",
        idempotencyKey: "follow:restart-smoke",
      });
      expect(followed.details).toMatchObject({
        status: "queued",
        runtimeFollowup: {
          accepted: true,
        },
      });
      expect(["delivered", "consumed"]).toContain(followed.details.mailboxEvent.deliveryState);

      const secondWait = await subagentTool.execute("wait-followup-complete", {
        action: "wait_agent",
        childRunId: runId,
        wait: { timeoutMs: 5000 },
      });
      const run = store.getSubagentRun(runId);
      const followupMailbox = store.listSubagentMailboxEvents(runId).find((event) => event.type === "subagent.followup");
      const assistantRuntimeEvents = store
        .listSubagentRunEvents(runId)
        .filter((event) => {
          const preview = event.preview as { type?: string } | undefined;
          return preview?.type === "assistant_delta";
        });

      expect(sendSpy).toHaveBeenCalledTimes(2);
      expect(sendSpy.mock.calls[0]?.[1]).toMatchObject({ awaitInternalRetryCompletion: true });
      expect(sendSpy.mock.calls[1]?.[1]).toMatchObject({ awaitInternalRetryCompletion: true });
      expect(sent[0]).toMatchObject({
        threadId: run.childThreadId,
        delivery: "prompt",
        preserveActiveThread: true,
        internal: true,
      });
      expect(sent[1]).toMatchObject({
        threadId: run.childThreadId,
        delivery: "follow-up",
        preserveActiveThread: true,
        internal: true,
        visibleUserContent: "Child follow-up: Use the restart-smoke fixture.",
      });
      expect(sent[1].modelContentOverride).toContain("Parent follow-up:");
      expect(sent[1].modelContentOverride).toContain("Use the restart-smoke fixture.");
      expect(sent[1].modelContentOverride).toContain("Ambient sub-agent follow-up turn.");
      expect(sent[1].modelContentOverride).toContain("treat the transcript as authoritative");
      expect(sent[1].modelContentOverride).toContain("- childRunId:");
      expect(sent[1].modelContentOverride).toContain("SUBAGENT_RESULT_JSON:");
      expect(sent[1].modelContentOverride).toContain("SUBAGENT_RESULT_STATUS: complete");
      expect(followupMailbox).toMatchObject({
        type: "subagent.followup",
        direction: "parent_to_child",
        deliveryState: "consumed",
      });
      expect(secondWait.details).toMatchObject({
        status: "completed",
        waitSatisfied: true,
        synthesisAllowed: true,
        resultValidation: {
          valid: true,
          synthesisAllowed: true,
        },
      });
      expect(run).toMatchObject({
        status: "completed",
        resultArtifact: {
          status: "completed",
          summary: expect.stringContaining("Inspected restart-smoke fixture."),
          structuredOutput: {
            status: "complete",
            roleId: "explorer",
          },
        },
      });
      expect(store.listSubagentRunEvents(runId).map((event) => event.type)).toEqual(expect.arrayContaining([
        "subagent.followup_child_session_starting",
        "subagent.followup_child_session_started",
        "subagent.followup_consumed",
        "subagent.result_ready",
      ]));
      expect(assistantRuntimeEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({
          artifactPath: `ambient://threads/${run.childThreadId}/transcript`,
          preview: expect.objectContaining({
            type: "assistant_delta",
            artifactPath: `ambient://threads/${run.childThreadId}/transcript`,
            textPreview: expect.stringMatching(/\.\.\.$/),
          }),
        }),
      ]));
      expect(store.listMessages(run.childThreadId).map((message) => message.role)).toEqual([
        "system",
        "user",
        "assistant",
        "system",
        "user",
        "assistant",
      ]);
      expect(store.listMessages(run.childThreadId)[3]).toMatchObject({
        role: "system",
        metadata: {
          status: "queued",
          mailboxEventId: followupMailbox?.id,
        },
      });
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("prepares an isolated git worktree before starting worker child sessions", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-worker-subagent-"));
    const store = new ProjectStore();
    const emitted: any[] = [];
    try {
      await initializeGitWorkspace(workspacePath);
      store.openWorkspace(workspacePath);
      const parent = store.createThread("worker sub-agent parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const getWindow = () =>
        ({
          isDestroyed: () => false,
          webContents: {
            isDestroyed: () => false,
            isCrashed: () => false,
            send: (_channel: string, event: any) => emitted.push(event),
          },
        }) as any;
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        getWindow,
        {
          request: vi.fn(async () => ({ allowed: true, mode: "allow_once" as const })),
          denyThread: () => undefined,
        },
        {
          featureFlags: {
            readSnapshot: () => resolveAmbientFeatureFlags({
              startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
              generatedAt: "2026-06-05T00:00:00.000Z",
            }),
          },
        },
      );
      const sent: Array<{ input: any; childThread: any }> = [];
      let permissionAuditId: string | undefined;
      const sendSpy = vi.spyOn(runtime as any, "send").mockImplementation(async (input: any) => {
        const childThread = store.getThread(input.threadId);
        sent.push({ input, childThread });
        const audit = store.addPermissionAudit({
          threadId: input.threadId,
          permissionMode: childThread.permissionMode,
          toolName: "write",
          risk: "workspace-command",
          decision: "allowed",
          detail: "README.md",
          reason: "Allowed by isolated worker worktree policy.",
          decisionSource: "policy",
        });
        permissionAuditId = audit.id;
        store.addMessage({
          threadId: input.threadId,
          role: "tool",
          content: [
            "write done",
            "",
            "Input",
            JSON.stringify({ path: "README.md", content: "Worker update." }),
            "",
            "Result",
            "Wrote README.md",
          ].join("\n"),
          metadata: {
            status: "done",
            toolCallId: "tool-call-worker",
            toolName: "write",
          },
        });
        const structuredOutput = {
          schemaVersion: "ambient-subagent-structured-result-v1",
          roleId: "worker",
          status: "complete",
          summary: "Worker completed in the isolated worktree.",
          evidence: ["stubbed worker send"],
          artifacts: [],
          risks: [],
          nextActions: [],
          roleOutput: {
            changes: ["README.md"],
            validation: ["stubbed"],
            mutationEvidence: [{
              toolCallId: "tool-call-worker",
              path: "README.md",
              category: "workspace.write",
              worktreeIsolated: true,
              worktreePath: childThread.workspacePath,
              approvalId: "approval-worker",
            }],
          },
        };
        store.addMessage({
          threadId: input.threadId,
          role: "assistant",
          content: [
            "Worker completed in the isolated worktree.",
            "SUBAGENT_RESULT_STATUS: complete",
            `SUBAGENT_RESULT_JSON: ${JSON.stringify(structuredOutput)}`,
          ].join("\n"),
          metadata: { status: "done" },
        });
      });
      (runtime as any).activeRunIds.set(parent.id, parentRun.id);
      const registeredTools: any[] = [];
      (runtime as any).createSubagentToolExtension(parent.id)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const subagentTool = registeredTools.find((tool) => tool.name === "ambient_subagent");
      if (!subagentTool) throw new Error("ambient_subagent tool was not registered.");

      const spawned = await subagentTool.execute("spawn-worker-worktree", {
        action: "spawn_agent",
        roleId: "worker",
        task: "Make a scoped README change.",
        idempotencyKey: "spawn:agent-runtime-worker-worktree",
      });
      const runId = spawned.details.run.id as string;
      const waited = await subagentTool.execute("wait-worker-worktree", {
        action: "wait_agent",
        childRunId: runId,
        wait: { timeoutMs: 5000 },
      });
      const run = store.getSubagentRun(runId);
      const childThread = store.getThread(run.childThreadId);
      const [toolScopeSnapshot] = store.listSubagentToolScopeSnapshots(runId);

      expect(sendSpy).toHaveBeenCalledTimes(1);
      expect(sendSpy.mock.calls[0]?.[1]).toMatchObject({ awaitInternalRetryCompletion: true });
      expect(sent[0]).toMatchObject({
        input: {
          threadId: run.childThreadId,
          permissionMode: childThread.permissionMode,
          model: run.modelRuntimeSnapshot.profile.modelId,
          preserveActiveThread: true,
          internal: true,
        },
        childThread: {
          id: run.childThreadId,
          workspacePath: childThread.workspacePath,
          gitWorktree: expect.objectContaining({
            status: "active",
            worktreePath: childThread.workspacePath,
          }),
        },
      });
      expect(childThread.workspacePath).not.toBe(workspacePath);
      expect(childThread.gitWorktree).toMatchObject({
        threadId: run.childThreadId,
        projectRoot: workspacePath,
        worktreePath: childThread.workspacePath,
        status: "active",
      });
      expect(toolScopeSnapshot.scope).toMatchObject({
        worktreeIsolated: true,
        loadedCategories: expect.arrayContaining(["workspace.write", "artifact.write"]),
        deniedCategories: [],
      });
      expect(waited.details).toMatchObject({
        status: "completed",
        synthesisAllowed: true,
        resultValidation: {
          completionGuardValidation: {
            valid: true,
            synthesisAllowed: true,
            ambientEvidenceCount: 1,
            isolatedWorktreeEvidenceCount: 1,
            approvalEvidenceCount: 1,
          },
        },
      });
      expect(store.listSubagentRunEvents(runId)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "subagent.runtime_event",
          preview: expect.objectContaining({
            type: "tool_result",
            source: "child_runtime",
            runId,
            childThreadId: run.childThreadId,
            toolName: "write",
            details: expect.objectContaining({
              status: "done",
              toolCallId: "tool-call-worker",
              category: "workspace.write",
              path: "README.md",
              worktreeIsolated: true,
              worktreePath: childThread.workspacePath,
              approvalId: permissionAuditId,
              approvalSource: "policy",
            }),
          }),
        }),
      ]));
      expect(store.listSubagentRunEvents(runId).map((event) => event.type)).toEqual(expect.arrayContaining([
        "subagent.worktree_prepared",
        "subagent.spawn_requested",
        "subagent.child_session_starting",
      ]));
      expect(spawned.details).toMatchObject({
        childWorktree: {
          threadId: run.childThreadId,
          status: "active",
          worktreePath: childThread.workspacePath,
        },
        toolScopeSnapshot: {
          worktreeIsolated: true,
          loadedCategories: expect.arrayContaining(["workspace.write", "artifact.write"]),
        },
      });
      expect(emitted).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "thread-updated",
          thread: expect.objectContaining({
            id: run.childThreadId,
            workspacePath: childThread.workspacePath,
            gitWorktree: expect.objectContaining({ status: "active" }),
          }),
        }),
      ]));
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("does not abort an active child only because the role runtime budget elapsed when partial output is allowed", async () => {
    const fixture = await agentRuntimeBudgetOverrunFixture({ roleId: "explorer", allowPartialResult: true });
    try {
      expect(fixture.waited).toMatchObject({
        timedOut: false,
        outcome: { kind: "progress_return", reason: "parent_wait_window_elapsed" },
        run: {
          status: "running",
        },
      });
      expect(fixture.run).toMatchObject({
        status: "running",
      });
      expect(fixture.run.resultArtifact).toBeUndefined();
      expect(fixture.abort).not.toHaveBeenCalled();
      expect((fixture.runtime as any).activeRuns.has(fixture.running.childThreadId)).toBe(true);
      expect(fixture.runtimeEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "status",
          source: "wait_agent",
          status: "running",
          message: "wait_agent timed out before the child run reached a terminal status; child runtime remains active.",
          details: expect.objectContaining({
            childRunId: fixture.running.id,
            childThreadId: fixture.running.childThreadId,
            waitTimeoutMs: 1,
            childIdleTimeoutMs: 600_000,
            childHardTimeoutMs: 600_000,
            lastChildActivityAt: expect.any(String),
            lastChildActivitySource: expect.any(String),
          }),
        }),
      ]));
      expect(fixture.store.listSubagentMailboxEvents(fixture.running.id)).toEqual([]);
      expect(fixture.store.listSubagentParentMailboxEventsForParentRun(fixture.running.parentRunId)).toEqual([]);
      expect(fixture.emitted).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "subagent-parent-mailbox-event-updated" }),
        expect.objectContaining({ type: "run-status", threadId: fixture.running.childThreadId, status: "idle" }),
      ]));
    } finally {
      await fixture.close();
    }
  });

  it("emits wait heartbeats while a live child runtime is still pending", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-wait-heartbeat-"));
    const store = new ProjectStore();
    store.openWorkspace(workspacePath);
    try {
      store.setFeatureFlagSettings({ subagents: true });
      const parent = store.createThread("parent waiting on child heartbeat");
      const assistant = store.addMessage({
        threadId: parent.id,
        role: "assistant",
        content: "",
        metadata: { status: "streaming", runtime: "pi" },
      });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const featureFlags = resolveAmbientFeatureFlags({
        settings: store.getFeatureFlagSettings(),
        generatedAt: "2026-06-05T00:00:00.000Z",
      });
      const baseRoleProfile = getDefaultSubagentRoleProfile("explorer");
      const roleProfileSnapshot = {
        ...baseRoleProfile,
        guardPolicy: {
          ...baseRoleProfile.guardPolicy,
          maxRuntimeMs: 120_000,
        },
      };
      const created = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Heartbeat child",
        roleId: "explorer",
        roleProfileSnapshot,
        canonicalTaskPath: "root/0:explorer",
        featureFlagSnapshot: featureFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });
      const running = store.markSubagentRunStatus(created.id, "running");
      const runtimeEvents: any[] = [];
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });

      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-05T00:00:00.000Z"));
      try {
        (runtime as any).subagentChildExecutions.set(running.id, {
          childThreadId: running.childThreadId,
          promise: new Promise<void>(() => undefined),
          startedAt: "2026-06-05T00:00:00.000Z",
        });

        const waitedPromise = (runtime as any).waitForResolvedSubagentChildRun({
          run: running,
          timeoutMs: 35_000,
          emitEvent: (event: any) => {
            const persisted = appendMappedSubagentRuntimeEvent(store, {
              run: store.getSubagentRun(running.id),
              source: "wait_agent",
              event,
            });
            runtimeEvents.push(persisted.runtimeEvent);
            return persisted.runEvent;
          },
        });

        await vi.advanceTimersByTimeAsync(15_000);
        await vi.advanceTimersByTimeAsync(15_000);
        await vi.advanceTimersByTimeAsync(5_000);
        const waited = await waitedPromise;

        expect(waited).toMatchObject({
          timedOut: false,
          outcome: { kind: "progress_return", reason: "parent_wait_window_elapsed" },
          run: {
            id: running.id,
            status: "running",
          },
        });
        expect(runtimeEvents).toEqual(expect.arrayContaining([
          expect.objectContaining({
            type: "status",
            source: "wait_agent",
            status: "running",
            message: "wait_agent is still waiting on the live child runtime.",
            details: expect.objectContaining({
              childRunId: running.id,
              childThreadId: running.childThreadId,
              waitElapsedMs: 15_000,
            }),
          }),
          expect.objectContaining({
            type: "status",
            source: "wait_agent",
            status: "running",
            message: "wait_agent is still waiting on the live child runtime.",
            details: expect.objectContaining({
              waitElapsedMs: 30_000,
            }),
          }),
          expect.objectContaining({
            type: "status",
            source: "wait_agent",
            status: "running",
            message: "wait_agent timed out before the child run reached a terminal status; child runtime remains active.",
          }),
        ]));
      } finally {
        vi.useRealTimers();
      }
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("does not abort an active child only because the role runtime budget elapsed when partial output is forbidden", async () => {
    const fixture = await agentRuntimeBudgetOverrunFixture({ roleId: "reviewer", allowPartialResult: false });
    try {
      expect(fixture.waited).toMatchObject({
        timedOut: false,
        outcome: { kind: "progress_return", reason: "parent_wait_window_elapsed" },
        run: {
          status: "running",
        },
      });
      expect(fixture.run).toMatchObject({
        status: "running",
      });
      expect(fixture.run.resultArtifact).toBeUndefined();
      expect(fixture.abort).not.toHaveBeenCalled();
      expect((fixture.runtime as any).activeRuns.has(fixture.running.childThreadId)).toBe(true);
      expect(fixture.runtimeEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "status",
          source: "wait_agent",
          status: "running",
          message: "wait_agent timed out before the child run reached a terminal status; child runtime remains active.",
          details: expect.objectContaining({
            childRunId: fixture.running.id,
            childThreadId: fixture.running.childThreadId,
            waitTimeoutMs: 1,
            childIdleTimeoutMs: 600_000,
            childHardTimeoutMs: 600_000,
            lastChildActivityAt: expect.any(String),
            lastChildActivitySource: expect.any(String),
          }),
        }),
      ]));
      expect(fixture.store.listSubagentMailboxEvents(fixture.running.id)).toEqual([]);
      expect(fixture.store.listSubagentParentMailboxEventsForParentRun(fixture.running.parentRunId)).toEqual([]);
    } finally {
      await fixture.close();
    }
  });

  it("settles a child only after the child activity idle timeout elapses with liveness evidence", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-05T00:00:00.000Z"));
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-idle-timeout-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const parent = store.createThread("parent with idle child");
      const assistant = store.addMessage({
        threadId: parent.id,
        role: "assistant",
        content: "",
        metadata: { status: "streaming", runtime: "pi" },
      });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const featureFlags = resolveAmbientFeatureFlags({
        settings: store.getFeatureFlagSettings(),
        generatedAt: "2026-06-05T00:00:00.000Z",
      });
      const baseRoleProfile = getDefaultSubagentRoleProfile("reviewer");
      const roleProfileSnapshot = {
        ...baseRoleProfile,
        guardPolicy: {
          ...baseRoleProfile.guardPolicy,
          maxRuntimeMs: 20 * 60_000,
          allowPartialResult: false,
        },
      };
      const created = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Idle child",
        roleId: "reviewer",
        roleProfileSnapshot,
        canonicalTaskPath: "root/0:reviewer",
        featureFlagSnapshot: featureFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });
      const running = store.markSubagentRunStatus(created.id, "running");
      store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        childRunIds: [running.id],
        dependencyMode: "required_all",
        failurePolicy: "ask_user",
        timeoutMs: 12 * 60_000,
      });
      const abort = vi.fn(async () => undefined);
      const runtimeEvents: any[] = [];
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        () => undefined,
        {
          request: vi.fn(),
          denyThread: () => undefined,
        },
      );
      (runtime as any).activeRuns.set(running.childThreadId, {
        abort,
        detach: vi.fn(),
        queue: vi.fn(),
      });
      (runtime as any).subagentChildExecutions.set(running.id, {
        childThreadId: running.childThreadId,
        promise: new Promise<void>(() => undefined),
        startedAt: "2026-06-05T00:00:00.000Z",
      });

      const waitedPromise = (runtime as any).waitForResolvedSubagentChildRun({
        run: running,
        timeoutMs: 12 * 60_000,
        emitEvent: (event: any) => {
          const persisted = appendMappedSubagentRuntimeEvent(store, {
            run: store.getSubagentRun(running.id),
            source: "wait_agent",
            event,
          });
          runtimeEvents.push(persisted.runtimeEvent);
          return persisted.runEvent;
        },
      });

      await vi.advanceTimersByTimeAsync(10 * 60_000);
      const waited = await waitedPromise;

      expect(waited).toMatchObject({
        timedOut: true,
        outcome: { kind: "child_runtime_timeout", reason: "runtime_idle_timeout" },
        run: {
          id: running.id,
          status: "timed_out",
          resultArtifact: expect.objectContaining({
            status: "timed_out",
            partial: false,
          }),
        },
      });
      expect(abort).toHaveBeenCalledTimes(1);
      expect(runtimeEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "error",
          source: "child_runtime",
          status: "timed_out",
          artifactPath: `ambient://threads/${running.childThreadId}/transcript`,
          details: expect.objectContaining({
            reason: "runtime_idle_timeout",
            maxRuntimeMs: 600_000,
            idleElapsedMs: 600_000,
            elapsedMs: 600_000,
            lastChildActivityAt: "2026-06-05T00:00:00.000Z",
            lastChildActivitySource: expect.any(String),
          }),
        }),
      ]));
      expect(store.listSubagentMailboxEvents(running.id)).toEqual([
        expect.objectContaining({
          direction: "child_to_parent",
          type: "subagent.failed",
          payload: expect.objectContaining({
            status: "timed_out",
            partial: false,
            reason: "runtime_idle_timeout",
            idleElapsedMs: 600_000,
            artifactPath: `ambient://threads/${running.childThreadId}/transcript`,
          }),
        }),
      ]);
      expect(store.listSubagentRunEvents(running.id)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "subagent.runtime_idle_timeout",
          preview: expect.objectContaining({
            status: "timed_out",
            partial: false,
            reason: "runtime_idle_timeout",
            maxRuntimeMs: 600_000,
            idleElapsedMs: 600_000,
            artifactPath: `ambient://threads/${running.childThreadId}/transcript`,
          }),
        }),
      ]));
      expect(store.listSubagentParentMailboxEventsForParentRun(running.parentRunId)).toEqual([
        expect.objectContaining({
          parentMessageId: assistant.id,
          type: "subagent.lifecycle_interrupted",
          payload: expect.objectContaining({
            schemaVersion: "ambient-subagent-lifecycle-interruption-v1",
            childRunId: running.id,
            childThreadId: running.childThreadId,
            previousStatus: "running",
            status: "timed_out",
            source: "runtime_idle_timeout",
          }),
        }),
      ]);
    } finally {
      vi.useRealTimers();
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("settles an active child at the hard cap even when recent activity prevents idle timeout", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-05T00:00:00.000Z"));
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-hard-cap-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const parent = store.createThread("parent with hard-cap child");
      const assistant = store.addMessage({
        threadId: parent.id,
        role: "assistant",
        content: "",
        metadata: { status: "streaming", runtime: "pi" },
      });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const featureFlags = resolveAmbientFeatureFlags({
        settings: store.getFeatureFlagSettings(),
        generatedAt: "2026-06-05T00:00:00.000Z",
      });
      const baseRoleProfile = getDefaultSubagentRoleProfile("reviewer");
      const roleProfileSnapshot = {
        ...baseRoleProfile,
        guardPolicy: {
          ...baseRoleProfile.guardPolicy,
          maxRuntimeMs: 10 * 60_000,
          allowPartialResult: false,
        },
      };
      const created = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Hard cap child",
        roleId: "reviewer",
        roleProfileSnapshot,
        canonicalTaskPath: "root/0:reviewer",
        featureFlagSnapshot: featureFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });
      const running = store.markSubagentRunStatus(created.id, "running");
      store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        childRunIds: [running.id],
        dependencyMode: "required_all",
        failurePolicy: "ask_user",
        timeoutMs: 12 * 60_000,
      });
      const abort = vi.fn(async () => undefined);
      const runtimeEvents: any[] = [];
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        () => undefined,
        {
          request: vi.fn(),
          denyThread: () => undefined,
        },
      );
      (runtime as any).activeRuns.set(running.childThreadId, {
        abort,
        detach: vi.fn(),
        queue: vi.fn(),
      });
      (runtime as any).subagentChildExecutions.set(running.id, {
        childThreadId: running.childThreadId,
        promise: new Promise<void>(() => undefined),
        startedAt: "2026-06-05T00:00:00.000Z",
      });

      vi.setSystemTime(new Date("2026-06-05T00:09:59.000Z"));
      const activityMessage = store.addMessage({
        threadId: running.childThreadId,
        role: "assistant",
        content: "Still working with fresh activity before the hard cap.",
      });

      const waitedPromise = (runtime as any).waitForResolvedSubagentChildRun({
        run: running,
        timeoutMs: 12 * 60_000,
        emitEvent: (event: any) => {
          const persisted = appendMappedSubagentRuntimeEvent(store, {
            run: store.getSubagentRun(running.id),
            source: "wait_agent",
            event,
          });
          runtimeEvents.push(persisted.runtimeEvent);
          return persisted.runEvent;
        },
      });

      await vi.advanceTimersByTimeAsync(1_000);
      const waited = await waitedPromise;

      expect(waited).toMatchObject({
        timedOut: true,
        outcome: { kind: "child_runtime_timeout", reason: "runtime_hard_cap_exceeded" },
        run: {
          id: running.id,
          status: "timed_out",
          resultArtifact: expect.objectContaining({
            status: "timed_out",
            partial: false,
          }),
        },
      });
      expect(abort).toHaveBeenCalledTimes(1);
      expect(runtimeEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "error",
          source: "child_runtime",
          status: "timed_out",
          artifactPath: `ambient://threads/${running.childThreadId}/transcript`,
          details: expect.objectContaining({
            reason: "runtime_hard_cap_exceeded",
            maxRuntimeMs: 600_000,
            elapsedMs: 600_000,
            idleElapsedMs: 1_000,
            lastChildActivityAt: "2026-06-05T00:09:59.000Z",
            lastChildActivitySource: "message:assistant",
            lastChildActivityDetail: `message ${activityMessage.id}`,
          }),
        }),
      ]));
      expect(store.listSubagentMailboxEvents(running.id)).toEqual([
        expect.objectContaining({
          direction: "child_to_parent",
          type: "subagent.failed",
          payload: expect.objectContaining({
            status: "timed_out",
            partial: false,
            reason: "runtime_hard_cap_exceeded",
            elapsedMs: 600_000,
            idleElapsedMs: 1_000,
            lastChildActivityAt: "2026-06-05T00:09:59.000Z",
            lastChildActivitySource: "message:assistant",
            artifactPath: `ambient://threads/${running.childThreadId}/transcript`,
          }),
        }),
      ]);
      expect(store.listSubagentRunEvents(running.id)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "subagent.runtime_hard_cap_exceeded",
          preview: expect.objectContaining({
            status: "timed_out",
            partial: false,
            reason: "runtime_hard_cap_exceeded",
            maxRuntimeMs: 600_000,
            elapsedMs: 600_000,
            idleElapsedMs: 1_000,
            lastChildActivityAt: "2026-06-05T00:09:59.000Z",
            lastChildActivitySource: "message:assistant",
            artifactPath: `ambient://threads/${running.childThreadId}/transcript`,
          }),
        }),
      ]));
      expect(store.listSubagentParentMailboxEventsForParentRun(running.parentRunId)).toEqual([
        expect.objectContaining({
          parentMessageId: assistant.id,
          type: "subagent.lifecycle_interrupted",
          payload: expect.objectContaining({
            schemaVersion: "ambient-subagent-lifecycle-interruption-v1",
            childRunId: running.id,
            childThreadId: running.childThreadId,
            previousStatus: "running",
            status: "timed_out",
            source: "runtime_hard_cap_exceeded",
          }),
        }),
      ]);
    } finally {
      vi.useRealTimers();
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("surfaces native child permission prompts as parent-forwarded approval requests", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-permission-wait-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const parent = store.createThread("parent with child permission wait");
      const assistant = store.addMessage({
        threadId: parent.id,
        role: "assistant",
        content: "",
        metadata: { status: "streaming", runtime: "pi" },
      });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const featureFlags = resolveAmbientFeatureFlags({
        settings: store.getFeatureFlagSettings(),
        generatedAt: "2026-06-06T00:00:00.000Z",
      });
      const created = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Child write",
        roleId: "worker",
        roleProfileSnapshot: getDefaultSubagentRoleProfile("worker"),
        canonicalTaskPath: "root/0:worker",
        featureFlagSnapshot: featureFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-06T00:00:00.000Z"),
        dependencyMode: "required",
      });
      const running = store.markSubagentRunStatus(created.id, "running");
      const pendingPermission: PermissionRequest = {
        id: "permission-child-write",
        threadId: running.childThreadId,
        toolName: "write",
        title: "Allow child write?",
        message: "The child wants to write a file.",
        detail: "Target path: /repo/child-output.md",
        risk: "outside-workspace",
        reusableScopes: ["thread", "project"],
        grantActionKind: "local_file_write",
        grantTargetKind: "path",
        grantTargetLabel: "/repo/child-output.md",
        grantTargetHash: "hash-child-output",
      };
      const runtimeEvents: any[] = [];
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        () => undefined,
        {
          request: vi.fn(),
          denyThread: () => undefined,
          listPending: () => [pendingPermission],
        },
      );
      (runtime as any).subagentChildExecutions.set(running.id, {
        childThreadId: running.childThreadId,
        promise: new Promise<void>(() => undefined),
        startedAt: "2026-06-06T00:00:00.000Z",
      });

      const waited = await (runtime as any).waitForResolvedSubagentChildRun({
        run: running,
        timeoutMs: 60_000,
        emitEvent: (event: any) => {
          const persisted = appendMappedSubagentRuntimeEvent(store, {
            run: store.getSubagentRun(running.id),
            source: "wait_agent",
            event,
          });
          runtimeEvents.push(persisted.runtimeEvent);
          return persisted.runEvent;
        },
      });

      expect(waited).toMatchObject({
        timedOut: false,
        run: {
          id: running.id,
          status: "needs_attention",
        },
        approvalRequests: [
          {
            approvalId: "permission-child-write",
            title: "Allow child write?",
            prompt: expect.stringContaining("Target path: /repo/child-output.md"),
            requestedAction: "local_file_write",
            requestedToolId: "write",
            requestedToolCategory: "outside-workspace",
            requestedScope: "project",
            idempotencyKey: `subagent:native-permission-request:${running.id}:permission-child-write:write`,
          },
        ],
      });
      expect(store.getSubagentRun(running.id).status).toBe("needs_attention");
      expect(runtimeEvents).toEqual([
        expect.objectContaining({
          type: "status",
          source: "wait_agent",
          status: "needs_attention",
          message: "Child runtime is waiting for parent approval.",
          details: {
            approvalIds: ["permission-child-write"],
            pendingApprovalCount: 1,
          },
        }),
      ]);
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("routes child file authority misses through the permission broker and records transient roots", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-child-file-authority-request-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const parent = store.createThread("parent with child file authority request");
      const assistant = store.addMessage({
        threadId: parent.id,
        role: "assistant",
        content: "",
        metadata: { status: "streaming", runtime: "pi" },
      });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const featureFlags = resolveAmbientFeatureFlags({
        settings: store.getFeatureFlagSettings(),
        generatedAt: "2026-06-06T00:00:00.000Z",
      });
      const created = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Child reader",
        roleId: "explorer",
        roleProfileSnapshot: getDefaultSubagentRoleProfile("explorer"),
        canonicalTaskPath: "root/0:explorer",
        featureFlagSnapshot: featureFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-06T00:00:00.000Z"),
        dependencyMode: "required",
      });
      const running = store.markSubagentRunStatus(created.id, "running");
      const requestedPath = join(workspacePath, "needs-approval.txt");
      const requestPermission = vi.fn(async (
        input: Omit<PermissionRequest, "id">,
        options?: { onRequest?: (request: PermissionRequest) => void },
      ) => {
        options?.onRequest?.({ ...input, id: "permission-child-read" });
        return { allowed: true, mode: "allow_once" as const };
      });
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        () => undefined,
        {
          request: requestPermission,
          denyThread: () => undefined,
          listPending: () => [],
        },
      );

      const approved = await (runtime as any).requestFileAuthorityForThread(running.childThreadId, store.getWorkspace(), {
        access: "read",
        toolName: "read",
        requestedPath,
        absolutePath: requestedPath,
        reason: "Path is outside the current workspace authority.",
      });

      expect(approved).toBe(true);
      expect(requestPermission).toHaveBeenCalledWith(
        expect.objectContaining({
          threadId: running.childThreadId,
          toolName: "read",
          title: "Allow read to read needs-approval.txt?",
          grantActionKind: "file_content_read",
          grantTargetKind: "path",
          grantTargetLabel: requestedPath,
          grantConditions: expect.objectContaining({ path: requestedPath, access: "read" }),
        }),
        expect.anything(),
      );
      expect((runtime as any).fileAuthorityRootPathsForThread(running.childThreadId, "read")).toContain(requestedPath);
      expect(store.listPermissionAudit(10)).toEqual([
        expect.objectContaining({
          threadId: running.childThreadId,
          toolName: "read",
          decision: "allowed",
          decisionSource: "prompt_allow_once",
        }),
      ]);
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("keeps non-interactive child file authority misses as policy denials", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-child-file-authority-noninteractive-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const parent = store.createThread("parent with non-interactive child");
      const assistant = store.addMessage({
        threadId: parent.id,
        role: "assistant",
        content: "",
        metadata: { status: "streaming", runtime: "pi" },
      });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const featureFlags = resolveAmbientFeatureFlags({
        settings: store.getFeatureFlagSettings(),
        generatedAt: "2026-06-06T00:00:00.000Z",
      });
      const created = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Child reader",
        roleId: "explorer",
        roleProfileSnapshot: getDefaultSubagentRoleProfile("explorer"),
        canonicalTaskPath: "root/0:explorer",
        featureFlagSnapshot: featureFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-06T00:00:00.000Z"),
        dependencyMode: "required",
      });
      const running = store.markSubagentRunStatus(created.id, "running");
      store.recordSubagentToolScopeSnapshot(running.id, {
        scope: { approvalMode: "non_interactive" } as any,
      });
      const requestPermission = vi.fn();
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        () => undefined,
        {
          request: requestPermission,
          denyThread: () => undefined,
          listPending: () => [],
        },
      );
      const requestedPath = join(workspacePath, "needs-approval.txt");

      const approved = await (runtime as any).requestFileAuthorityForThread(running.childThreadId, store.getWorkspace(), {
        access: "read",
        toolName: "read",
        requestedPath,
        absolutePath: requestedPath,
        reason: "Path is outside the current workspace authority.",
      });

      expect(approved).toBe(false);
      expect(requestPermission).not.toHaveBeenCalled();
      expect(store.listPermissionAudit(10)).toEqual([
        expect.objectContaining({
          threadId: running.childThreadId,
          toolName: "read",
          decision: "denied",
          decisionSource: "denied_by_policy",
          reason: expect.stringContaining("non-interactive"),
        }),
      ]);
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("round-trips native child permission prompts through parent approval and child resume", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-permission-roundtrip-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const parent = store.createThread("parent with child permission roundtrip");
      const assistant = store.addMessage({
        threadId: parent.id,
        role: "assistant",
        content: "",
        metadata: { status: "streaming", runtime: "pi" },
      });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const pendingPermissions: PermissionRequest[] = [];
      const permissionResponses: Array<{ id: string; response: string }> = [];
      const respond = vi.fn((id: string, response: string) => {
        permissionResponses.push({ id, response });
        const index = pendingPermissions.findIndex((request) => request.id === id);
        if (index >= 0) pendingPermissions.splice(index, 1);
      });
      let resolveChildSendStarted!: () => void;
      const childSendStarted = new Promise<void>((resolve) => {
        resolveChildSendStarted = resolve;
      });
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        () => undefined,
        {
          request: vi.fn(),
          denyThread: () => undefined,
          listPending: () => pendingPermissions,
          respond,
        },
      );
      const sendSpy = vi.spyOn(runtime as any, "send").mockImplementation(async (input: any) => {
        store.addMessage({
          threadId: input.threadId,
          role: "user",
          content: input.visibleUserContent ?? input.content,
          metadata: { delivery: input.delivery, internal: input.internal },
        });
        if (!pendingPermissions.length) {
          pendingPermissions.push({
            id: "permission-child-write",
            threadId: input.threadId,
            toolName: "write",
            title: "Allow child write?",
            message: "The child wants to write a file.",
            detail: "Target path: /repo/child-output.md",
            risk: "outside-workspace",
            reusableScopes: ["thread", "project"],
            grantActionKind: "local_file_write",
            grantTargetKind: "path",
            grantTargetLabel: "/repo/child-output.md",
            grantTargetHash: "hash-child-output",
          });
        }
        resolveChildSendStarted();
        await new Promise<void>(() => undefined);
      });
      (runtime as any).activeRunIds.set(parent.id, parentRun.id);
      const registeredTools: any[] = [];
      (runtime as any).createSubagentToolExtension(parent.id)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const subagentTool = registeredTools.find((tool) => tool.name === "ambient_subagent");
      if (!subagentTool) throw new Error("ambient_subagent tool was not registered.");

      const spawned = await subagentTool.execute("spawn-native-approval-roundtrip", {
        action: "spawn_agent",
        roleId: "summarizer",
        task: "Wait for a native child approval prompt before continuing.",
        dependencyMode: "required",
        forkMode: "no_history",
        promptMode: "fresh",
        toolScope: { requestedCategories: ["artifact.read"] },
        idempotencyKey: "spawn:native-approval-roundtrip",
      });
      expect(spawned.details).toMatchObject({
        orchestrationStarted: true,
        toolScopeSnapshot: {
          loadedCategories: ["artifact.read"],
          piVisibleCategories: ["artifact.read"],
        },
      });
      const runId = spawned.details.run.id as string;
      await Promise.race([
        childSendStarted,
        new Promise((_, reject) => setTimeout(
          () => reject(new Error(`Child permission roundtrip send did not start: ${JSON.stringify(spawned.details)}`)),
          1_000,
        )),
      ]);

      const waited = await subagentTool.execute("wait-native-approval-roundtrip", {
        action: "wait_agent",
        childRunId: runId,
        wait: { timeoutMs: 5000 },
        idempotencyKey: "wait:native-approval-roundtrip-request",
      });

      expect(waited.details).toMatchObject({
        status: "needs_attention",
        waitSatisfied: false,
        synthesisAllowed: false,
        waitNotice: "Child requested approval; parent approval was forwarded to the parent mailbox and the parent remains blocked on this child.",
        parentResolution: {
          status: "blocked",
          action: "ask_user",
          canSynthesize: false,
          requiresUserInput: true,
          childRunId: runId,
          childStatus: "needs_attention",
        },
        approvalRequestRecords: [
          {
            idempotencyKey: `subagent:native-permission-request:${runId}:permission-child-write:write`,
            childMailboxEvent: {
              runId,
              direction: "child_to_parent",
              type: "subagent.approval_requested",
              deliveryState: "delivered",
            },
            parentMailboxEvent: {
              parentThreadId: parent.id,
              parentRunId: parentRun.id,
              parentMessageId: assistant.id,
              type: "subagent.child_approval_requested",
              deliveryState: "queued",
              childRunIds: [runId],
            },
          },
        ],
      });
      expect(store.getSubagentRun(runId).status).toBe("needs_attention");
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "subagent.child_approval_requested",
          deliveryState: "queued",
          payload: expect.objectContaining({
            childRunId: runId,
            childThreadId: store.getSubagentRun(runId).childThreadId,
            approvalId: "permission-child-write",
            requestedToolId: "write",
            requestedScope: "project",
            parentBlockingState: expect.objectContaining({
              action: "forward_child_approval_then_wait",
              childRunId: runId,
              resumeParentBlocking: true,
              resumeAction: "wait_agent",
            }),
          }),
        }),
      ]));

      const decision = resolveSubagentApprovalDecision(store, {
        childRunId: runId,
        approvalId: "permission-child-write",
        decision: "approved",
        requestedScope: "this_child_thread",
        userDecision: "Approve this child write for the rest of this child thread.",
      }, { now: "2026-06-06T00:01:00.000Z" });

      expect(decision).toMatchObject({
        approvalId: "permission-child-write",
        decision: "approved",
        requestedScope: "this_child_thread",
        effectiveScope: "this_child_thread",
        parentRemainsBlocked: true,
        approvalRequestParentMailboxEvent: {
          deliveryState: "consumed",
        },
        approvalResponseChildMailboxEvent: {
          type: "subagent.approval_response",
          deliveryState: "queued",
        },
      });

      const resumed = await subagentTool.execute("wait-native-approval-response-roundtrip", {
        action: "wait_agent",
        childRunId: runId,
        wait: { timeoutMs: 1 },
        idempotencyKey: "wait:native-approval-roundtrip-response",
      });

      expect(sendSpy).toHaveBeenCalledTimes(1);
      expect(respond).toHaveBeenCalledWith("permission-child-write", "always_thread");
      expect(permissionResponses).toEqual([
        { id: "permission-child-write", response: "always_thread" },
      ]);
      expect(pendingPermissions).toEqual([]);
      expect(resumed.details).toMatchObject({
        status: "running",
        waitSatisfied: false,
        waitTimedOut: false,
        waitSessionExpired: true,
        waitOutcome: { kind: "progress_return", reason: "parent_wait_window_elapsed" },
        synthesisAllowed: false,
        waitNotice: "Child approval response was delivered to the child runtime; the parent remains blocked until the child reaches a synthesis-safe result.",
        parentResolution: {
          status: "blocked",
          action: "wait_for_child",
          canSynthesize: false,
          requiresUserInput: false,
          childRunId: runId,
          childStatus: "running",
        },
        approvalResponseDeliveries: [
          {
            accepted: true,
            run: {
              id: runId,
              status: "running",
            },
            mailboxEvent: {
              runId,
              direction: "parent_to_child",
              type: "subagent.approval_response",
              deliveryState: "consumed",
            },
            message: "Child approval response was delivered and the parent remains blocked until the child completes or needs more attention.",
          },
        ],
      });
      expect(store.getSubagentRun(runId).status).toBe("running");
      expect(store.listSubagentRunEvents(runId)).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "subagent.approval_requested" }),
        expect.objectContaining({ type: "subagent.child_approval_forwarded" }),
        expect.objectContaining({ type: "subagent.approval_response.consumed" }),
      ]));
      expect(store.listSubagentWaitBarriersForParentRun(parentRun.id)).toEqual([
        expect.objectContaining({
          parentRunId: parentRun.id,
          childRunIds: [runId],
          status: "waiting_on_children",
        }),
      ]);
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("launches ordinary child web research with brokered tools and without browser fallback", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-web-research-scope-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const parent = store.createThread("parent with brokered child web research");
      const assistant = store.addMessage({
        threadId: parent.id,
        role: "assistant",
        content: "",
        metadata: { status: "streaming", runtime: "pi" },
      });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        () => undefined,
        {
          request: vi.fn(async () => ({ allowed: true, mode: "allow_once" as const })),
          denyThread: () => undefined,
        },
      );
      vi.spyOn(runtime as any, "send").mockImplementation(async (input: any) => {
        const structuredOutput = {
          schemaVersion: "ambient-subagent-structured-result-v1",
          roleId: "explorer",
          status: "complete",
          summary: "Brokered web research scope was prepared.",
          evidence: ["tool scope snapshot"],
          artifacts: [],
          risks: [],
          nextActions: [],
          roleOutput: {
            findings: [{ summary: "Child launch uses brokered web research tools.", provenance: ["tool scope snapshot"] }],
            openQuestions: [],
          },
        };
        store.addMessage({
          threadId: input.threadId,
          role: "user",
          content: input.visibleUserContent ?? input.content,
          metadata: { delivery: input.delivery, internal: input.internal },
        });
        store.addMessage({
          threadId: input.threadId,
          role: "assistant",
          content: [
            "Brokered web research scope was prepared.",
            `SUBAGENT_RESULT_JSON: ${JSON.stringify(structuredOutput)}`,
            "SUBAGENT_RESULT_STATUS: complete",
          ].join("\n"),
          metadata: { status: "done" },
        });
      });
      (runtime as any).activeRunIds.set(parent.id, parentRun.id);
      const registeredTools: any[] = [];
      (runtime as any).createSubagentToolExtension(parent.id)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const subagentTool = registeredTools.find((tool) => tool.name === "ambient_subagent");
      if (!subagentTool) throw new Error("ambient_subagent tool was not registered.");

      const spawned = await subagentTool.execute("spawn-brokered-web-research-child", {
        action: "spawn_agent",
        roleId: "explorer",
        task: "Research current travel details using ordinary web research; do not use an interactive browser.",
        dependencyMode: "required",
        forkMode: "recent_turns",
        promptMode: "fresh",
        toolScope: {
          requestedCategories: ["connector.read", "browser.read"],
          childAuthority: {
            taskIntent: "web_research",
            network: "allow",
            mutation: "deny",
          },
        },
        idempotencyKey: "spawn:brokered-web-research-child",
      });
      const runId = spawned.details.run.id as string;
      const snapshots = store.listSubagentToolScopeSnapshots(runId);

      expect(snapshots).toHaveLength(1);
      expect(snapshots[0]).toMatchObject({
        runId,
        scope: {
          loadedCategories: ["connector.read"],
          piVisibleCategories: ["connector.read"],
          deniedCategories: [
            {
              id: "browser.read",
              reason: "Denied by child task intent web_research; allowed categories: workspace.read, artifact.read, connector.read.",
            },
          ],
        },
      });
      expect(resolveSubagentChildActiveToolNames({
        subagentToolScopeSnapshots: snapshots,
      })).toEqual([
        "web_research_status",
        "web_research_search",
        "web_research_fetch",
      ]);
      expect(JSON.stringify(snapshots[0].scope)).not.toContain("browser_search");
      expect(JSON.stringify(snapshots[0].scope)).not.toContain("browser_content");
      expect(spawned.details).toMatchObject({
        toolScopeSnapshot: {
          loadedCategories: ["connector.read"],
          deniedCategories: [
            {
              id: "browser.read",
              reason: "Denied by child task intent web_research; allowed categories: workspace.read, artifact.read, connector.read.",
            },
          ],
        },
      });
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("round-trips child browser authority prompts through parent approval and child resume", async () => {
    vi.useRealTimers();
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-browser-approval-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const parentBase = store.createThread("parent with child browser approval");
      const parent = store.updateThreadSettings(parentBase.id, { permissionMode: "full-access" });
      const assistant = store.addMessage({
        threadId: parent.id,
        role: "assistant",
        content: "",
        metadata: { status: "streaming", runtime: "pi" },
      });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const pendingPermissions: PermissionRequest[] = [];
      const permissionResponses: Array<{ id: string; response: string }> = [];
      const permissionResolvers = new Map<string, (resolution: { allowed: boolean; mode: any }) => void>();
      let resolveBrowserPromptStarted!: () => void;
      const browserPromptStarted = new Promise<void>((resolve) => {
        resolveBrowserPromptStarted = resolve;
      });
      const requestPermission = vi.fn((
        input: Omit<PermissionRequest, "id">,
        options?: { onRequest?: (request: PermissionRequest) => void },
      ) => new Promise<{ allowed: boolean; mode: any }>((resolve) => {
        const request = { ...input, id: "permission-child-browser" };
        pendingPermissions.push(request);
        permissionResolvers.set(request.id, resolve);
        options?.onRequest?.(request);
        resolveBrowserPromptStarted();
      }));
      const respond = vi.fn((id: string, response: string) => {
        permissionResponses.push({ id, response });
        const index = pendingPermissions.findIndex((request) => request.id === id);
        if (index >= 0) pendingPermissions.splice(index, 1);
        permissionResolvers.get(id)?.({ allowed: response !== "deny", mode: response });
        permissionResolvers.delete(id);
      });
      let resolveChildSendStarted!: () => void;
      const childSendStarted = new Promise<void>((resolve) => {
        resolveChildSendStarted = resolve;
      });
      let resolveChildSendFinished!: () => void;
      const childSendFinished = new Promise<void>((resolve) => {
        resolveChildSendFinished = resolve;
      });
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        () => undefined,
        {
          request: requestPermission,
          denyThread: () => undefined,
          listPending: () => pendingPermissions,
          respond,
        },
      );
      const sendSpy = vi.spyOn(runtime as any, "send").mockImplementation(async (input: any) => {
        store.addMessage({
          threadId: input.threadId,
          role: "user",
          content: input.visibleUserContent ?? input.content,
          metadata: { delivery: input.delivery, internal: input.internal },
        });
        resolveChildSendStarted();
        await childSendFinished;
        const structuredOutput = {
          schemaVersion: "ambient-subagent-structured-result-v1",
          roleId: "explorer",
          status: "complete",
          summary: "Child browser approval response was consumed.",
          evidence: ["permission-child-browser"],
          artifacts: [],
          risks: [],
          nextActions: [],
          roleOutput: {
            findings: [{ summary: "Browser permission response reached the child runtime.", provenance: ["permission-child-browser"] }],
            openQuestions: [],
          },
        };
        store.addMessage({
          threadId: input.threadId,
          role: "assistant",
          content: [
            "Child browser approval response was consumed.",
            `SUBAGENT_RESULT_JSON: ${JSON.stringify(structuredOutput)}`,
            "SUBAGENT_RESULT_STATUS: complete",
          ].join("\n"),
          metadata: { status: "done" },
        });
      });
      (runtime as any).activeRunIds.set(parent.id, parentRun.id);
      const registeredTools: any[] = [];
      (runtime as any).createSubagentToolExtension(parent.id)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const subagentTool = registeredTools.find((tool) => tool.name === "ambient_subagent");
      if (!subagentTool) throw new Error("ambient_subagent tool was not registered.");

      const spawned = await Promise.race([
        subagentTool.execute("spawn-browser-approval-roundtrip", {
          action: "spawn_agent",
          roleId: "explorer",
          task: "Read one browser URL only if the parent approves child browser network access.",
          dependencyMode: "required",
          forkMode: "recent_turns",
          promptMode: "fresh",
          toolScope: {
            requestedCategories: ["browser.interactive"],
            childAuthority: {
              taskIntent: "analysis",
              network: "ask_parent",
              mutation: "deny",
            },
          },
          idempotencyKey: "spawn:browser-approval-roundtrip",
        }),
        new Promise<any>((_, reject) => setTimeout(
          () => reject(new Error(`Browser approval spawn did not return: ${JSON.stringify({
            parentRun,
            runs: store.listSubagentRunsForParentThread(parent.id),
          })}`)),
          1_000,
        )),
      ]);
      const runId = spawned.details.run.id as string;
      await childSendStarted;
      const run = store.getSubagentRun(runId);
      store.recordSubagentToolScopeSnapshot(run.id, {
        resolverInputs: {
          childAuthorityProfile: {
            childRunId: run.id,
            childThreadId: run.childThreadId,
            approvalRouting: { mode: "interactive" },
            resourceScopes: {
              browser: {
                networkDecision: "ask_parent",
                domains: ["ambient.test"],
              },
            },
          },
        },
        scope: {
          schemaVersion: "ambient-subagent-tool-scope-v1",
          loadedCategories: ["browser.interactive"],
          piVisibleCategories: ["browser.interactive"],
          deniedCategories: [],
          loadedTools: ["browser_content"],
          piVisibleTools: ["browser_content"],
          deniedTools: [],
          approvalMode: "interactive",
          worktreeIsolated: false,
          fanoutAvailable: false,
        } as any,
      });

      const browserPermissionPromise = (runtime as any).resolveToolCallPermission(
        run.childThreadId,
        store.getWorkspace(),
        "browser_content",
        { url: "https://ambient.test/current-child-browser-approval-behavior" },
      ) as Promise<{ reason: string } | undefined>;
      await Promise.race([
        browserPromptStarted,
        new Promise((_, reject) => setTimeout(
          () => reject(new Error(`Browser approval prompt did not start: ${JSON.stringify({
            run: store.getSubagentRun(run.id),
            snapshots: store.listSubagentToolScopeSnapshots(run.id),
            pendingPermissions,
          })}`)),
          1_000,
        )),
      ]);

      expect(pendingPermissions).toEqual([
        expect.objectContaining({
          id: "permission-child-browser",
          threadId: run.childThreadId,
          toolName: "browser_content",
          title: "Allow child browser network access?",
          risk: "browser-network",
          grantActionKind: "browser_network",
          grantTargetKind: "browser_origin",
          grantTargetLabel: "ambient.test",
          grantConditions: expect.objectContaining({
            childRunId: run.id,
            childThreadId: run.childThreadId,
            domain: "ambient.test",
            source: "subagent-child-browser-authority",
          }),
        }),
      ]);

      const waited = await Promise.race([
        subagentTool.execute("wait-browser-approval-roundtrip", {
          action: "wait_agent",
          childRunId: run.id,
          wait: { timeoutMs: 50 },
          idempotencyKey: "wait:browser-approval-roundtrip-request",
        }),
        new Promise<any>((_, reject) => setTimeout(
          () => reject(new Error(`Browser approval wait did not return: ${JSON.stringify({
            run: store.getSubagentRun(run.id),
            pendingPermissions,
            parentMailbox: store.listSubagentParentMailboxEventsForParentRun(parentRun.id),
            runEvents: store.listSubagentRunEvents(run.id).map((event) => event.type),
          })}`)),
          1_000,
        )),
      ]);

      expect(waited.details).toMatchObject({
        status: "needs_attention",
        waitSatisfied: false,
        synthesisAllowed: false,
        waitNotice: "Child requested approval; parent approval was forwarded to the parent mailbox and the parent remains blocked on this child.",
        parentResolution: {
          status: "blocked",
          action: "ask_user",
          canSynthesize: false,
          requiresUserInput: true,
          childRunId: run.id,
          childStatus: "needs_attention",
        },
        approvalRequestRecords: [
          {
            idempotencyKey: `subagent:native-permission-request:${run.id}:permission-child-browser:browser_content`,
            parentMailboxEvent: {
              parentThreadId: parent.id,
              parentRunId: parentRun.id,
              parentMessageId: assistant.id,
              type: "subagent.child_approval_requested",
              deliveryState: "queued",
              childRunIds: [run.id],
            },
          },
        ],
      });
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "subagent.child_approval_requested",
          deliveryState: "queued",
          payload: expect.objectContaining({
            childRunId: run.id,
            childThreadId: run.childThreadId,
            approvalId: "permission-child-browser",
            requestedToolId: "browser_content",
            requestedAction: "browser_network",
            requestedToolCategory: "browser-network",
            parentBlockingState: expect.objectContaining({
              action: "forward_child_approval_then_wait",
              childRunId: run.id,
              childThreadId: run.childThreadId,
              resumeParentBlocking: true,
              resumeAction: "wait_agent",
            }),
          }),
        }),
      ]));

      const decision = resolveSubagentApprovalDecision(store, {
        childRunId: run.id,
        approvalId: "permission-child-browser",
        decision: "approved",
        requestedScope: "this_child_thread",
        userDecision: "Approve child browser content for the rest of this child thread.",
      }, { now: "2026-06-06T00:02:00.000Z" });

      expect(decision).toMatchObject({
        approvalId: "permission-child-browser",
        decision: "approved",
        effectiveScope: "this_child_thread",
        parentRemainsBlocked: true,
        approvalRequestParentMailboxEvent: {
          deliveryState: "consumed",
        },
        approvalResponseChildMailboxEvent: {
          type: "subagent.approval_response",
          deliveryState: "queued",
        },
      });
      resolveChildSendFinished();

      const resumed = await Promise.race([
        subagentTool.execute("wait-browser-approval-response-roundtrip", {
          action: "wait_agent",
          childRunId: run.id,
          wait: { timeoutMs: 5000 },
          idempotencyKey: "wait:browser-approval-roundtrip-response",
        }),
        new Promise<any>((_, reject) => setTimeout(
          () => reject(new Error(`Browser approval response wait did not return: ${JSON.stringify({
            run: store.getSubagentRun(run.id),
            pendingPermissions,
            parentMailbox: store.listSubagentParentMailboxEventsForParentRun(parentRun.id),
            childMailbox: store.listSubagentMailboxEvents(run.id),
            runEvents: store.listSubagentRunEvents(run.id).map((event) => event.type),
          })}`)),
          1_000,
        )),
      ]);

      expect(sendSpy).toHaveBeenCalledTimes(1);
      expect(respond).toHaveBeenCalledWith("permission-child-browser", "always_thread");
      expect(permissionResponses).toEqual([
        { id: "permission-child-browser", response: "always_thread" },
      ]);
      expect(pendingPermissions).toEqual([]);
      await expect(Promise.race([
        browserPermissionPromise,
        new Promise((_, reject) => setTimeout(
          () => reject(new Error(`Browser permission promise did not resolve: ${JSON.stringify({
            run: store.getSubagentRun(run.id),
            pendingPermissions,
            permissionResponses,
          })}`)),
          1_000,
        )),
      ])).resolves.toBeUndefined();
      expect(resumed.details).toMatchObject({
        status: "completed",
        waitSatisfied: true,
        waitTimedOut: false,
        waitOutcome: { kind: "child_terminal" },
        synthesisAllowed: true,
        parentResolution: {
          status: "ready",
          action: "synthesize",
          canSynthesize: true,
          requiresUserInput: false,
          childRunId: run.id,
          childStatus: "completed",
        },
      });
      expect(store.listSubagentRunEvents(run.id)).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "subagent.approval_requested" }),
        expect.objectContaining({ type: "subagent.child_approval_forwarded" }),
        expect.objectContaining({ type: "subagent.approval_response.consumed" }),
      ]));
      await Promise.resolve();
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("refuses direct child runtime starts when ambient.subagents is disabled", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-flag-start-"));
    const store = new ProjectStore();
    const runtimeEvents: any[] = [];
    try {
      store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const parent = store.createThread("parent with disabled runtime start");
      const assistant = store.addMessage({
        threadId: parent.id,
        role: "assistant",
        content: "",
        metadata: { status: "streaming", runtime: "pi" },
      });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const role = getDefaultSubagentRoleProfile("explorer");
      const featureFlags = resolveAmbientFeatureFlags({
        settings: store.getFeatureFlagSettings(),
        generatedAt: "2026-06-06T00:00:00.000Z",
      });
      const created = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Disabled child",
        roleId: role.id,
        roleProfileSnapshot: role,
        canonicalTaskPath: "root/0:explorer",
        featureFlagSnapshot: featureFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-06T00:00:00.000Z"),
        dependencyMode: "required",
      });
      store.setFeatureFlagSettings({ subagents: false });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });

      const started = await (runtime as any).startResolvedSubagentChildRun({
        parentThread: parent,
        run: created,
        task: "This should not start while the feature flag is off.",
        role,
        dependencyMode: "required",
        forkMode: "no_history",
        promptMode: "fresh",
        toolScope: {} as any,
        toolScopeSnapshot: {} as any,
        turnBudgetPolicy: {} as any,
        idempotencyKey: "start:disabled-feature",
        emitEvent: (event: any) => {
          runtimeEvents.push(event);
          return {} as any;
        },
      });

      expect(started).toMatchObject({
        started: false,
        message: "ambient.subagents is disabled; refusing to start sub-agent child runtime.",
        run: {
          id: created.id,
          status: "failed",
          resultArtifact: {
            schemaVersion: "ambient-subagent-result-artifact-v1",
            runId: created.id,
            status: "failed",
            partial: false,
            summary: "ambient.subagents is disabled; refusing to start sub-agent child runtime.",
            childThreadId: created.childThreadId,
          },
        },
      });
      expect(runtimeEvents).toEqual([
        expect.objectContaining({
          type: "error",
          source: "child_runtime",
          status: "failed",
          message: "ambient.subagents is disabled; refusing to start sub-agent child runtime.",
          details: expect.objectContaining({
            reason: "ambient_subagents_disabled",
            featureFlagSnapshot: expect.objectContaining({
              flags: expect.objectContaining({
                [AMBIENT_SUBAGENTS_FEATURE_FLAG]: expect.objectContaining({ enabled: false }),
              }),
            }),
          }),
        }),
      ]);
      expect(store.listSubagentMailboxEvents(created.id)).toEqual([
        expect.objectContaining({
          direction: "child_to_parent",
          type: "subagent.failed",
          payload: expect.objectContaining({
            status: "failed",
            reason: "ambient_subagents_disabled",
            childThreadId: created.childThreadId,
          }),
        }),
      ]);
      expect(store.listSubagentRunEvents(created.id)).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "subagent.status_changed" }),
        expect.objectContaining({ type: "subagent.lifecycle_stopped" }),
        expect.objectContaining({
          type: "subagent.child_runtime_refused",
          preview: expect.objectContaining({
            reason: "ambient_subagents_disabled",
            idempotencyKey: "start:disabled-feature",
          }),
        }),
      ]));
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("keeps followups and approval responses queued when ambient.subagents is disabled", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-flag-mailbox-"));
    const store = new ProjectStore();
    const runtimeEvents: any[] = [];
    const respond = vi.fn();
    try {
      store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const parent = store.createThread("parent with disabled child mailbox");
      const assistant = store.addMessage({
        threadId: parent.id,
        role: "assistant",
        content: "",
        metadata: { status: "streaming", runtime: "pi" },
      });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const role = getDefaultSubagentRoleProfile("reviewer");
      const featureFlags = resolveAmbientFeatureFlags({
        settings: store.getFeatureFlagSettings(),
        generatedAt: "2026-06-06T00:00:00.000Z",
      });
      const created = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Mailbox child",
        roleId: role.id,
        roleProfileSnapshot: role,
        canonicalTaskPath: "root/0:reviewer",
        featureFlagSnapshot: featureFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-06T00:00:00.000Z"),
        dependencyMode: "required",
      });
      const waiting = store.markSubagentRunStatus(created.id, "waiting");
      const followupMailbox = store.appendSubagentMailboxEvent(waiting.id, {
        direction: "parent_to_child",
        type: "subagent.followup",
        payload: { message: "Please inspect the retry path." },
      });
      const approvalMailbox = store.appendSubagentMailboxEvent(waiting.id, {
        direction: "parent_to_child",
        type: "subagent.approval_response",
        payload: { approvalId: "approval-disabled", decision: "approved", effectiveScope: "this_child_thread" },
      });
      store.setFeatureFlagSettings({ subagents: false });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
        listPending: () => [{
          id: "approval-disabled",
          threadId: waiting.childThreadId,
          toolName: "read",
          title: "Allow child read?",
          message: "The child wants to read a file.",
          risk: "workspace-command",
        }],
        respond,
      });
      const markFollowupDelivered = vi.fn(() => store.updateSubagentMailboxEventDeliveryState(followupMailbox.id, "delivered"));
      const markFollowupConsumed = vi.fn(() => store.updateSubagentMailboxEventDeliveryState(followupMailbox.id, "consumed"));
      const markApprovalDelivered = vi.fn(() => store.updateSubagentMailboxEventDeliveryState(approvalMailbox.id, "delivered"));
      const markApprovalConsumed = vi.fn(() => store.updateSubagentMailboxEventDeliveryState(approvalMailbox.id, "consumed"));
      const emitEvent = (event: any) => {
        runtimeEvents.push(event);
        return {} as any;
      };

      const followup = await (runtime as any).followupResolvedSubagentChildRun({
        run: waiting,
        message: "Please inspect the retry path.",
        mailboxEvent: followupMailbox,
        idempotencyKey: "followup:disabled-feature",
        emitEvent,
        markMailboxDelivered: markFollowupDelivered,
        markMailboxConsumed: markFollowupConsumed,
      });
      const approval = await (runtime as any).resolveResolvedSubagentChildApprovalResponse({
        run: waiting,
        mailboxEvent: approvalMailbox,
        approvalId: "approval-disabled",
        decision: "approved",
        effectiveScope: "this_child_thread",
        idempotencyKey: "approval:disabled-feature",
        emitEvent,
        markMailboxDelivered: markApprovalDelivered,
        markMailboxConsumed: markApprovalConsumed,
      });

      expect(followup).toMatchObject({
        accepted: false,
        message: "ambient.subagents is disabled; refusing to deliver sub-agent follow-up. The follow-up remains queued.",
        mailboxEvent: {
          id: followupMailbox.id,
          deliveryState: "queued",
        },
      });
      expect(approval).toMatchObject({
        accepted: false,
        message: "ambient.subagents is disabled; refusing to deliver child approval response. The approval response remains queued.",
        mailboxEvent: {
          id: approvalMailbox.id,
          deliveryState: "queued",
        },
      });
      expect(markFollowupDelivered).not.toHaveBeenCalled();
      expect(markFollowupConsumed).not.toHaveBeenCalled();
      expect(markApprovalDelivered).not.toHaveBeenCalled();
      expect(markApprovalConsumed).not.toHaveBeenCalled();
      expect(respond).not.toHaveBeenCalled();
      expect(store.getSubagentMailboxEvent(followupMailbox.id).deliveryState).toBe("queued");
      expect(store.getSubagentMailboxEvent(approvalMailbox.id).deliveryState).toBe("queued");
      expect(store.getSubagentRun(waiting.id).status).toBe("waiting");
      expect(runtimeEvents).toEqual([
        expect.objectContaining({
          type: "status",
          source: "followup_agent",
          status: "waiting",
          details: expect.objectContaining({
            reason: "ambient_subagents_disabled",
            mailboxEventId: followupMailbox.id,
          }),
        }),
        expect.objectContaining({
          type: "status",
          source: "approval_response",
          status: "waiting",
          details: expect.objectContaining({
            reason: "ambient_subagents_disabled",
            mailboxEventId: approvalMailbox.id,
            approvalId: "approval-disabled",
          }),
        }),
      ]);
      expect(store.listSubagentRunEvents(waiting.id)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "subagent.followup_refused",
          preview: expect.objectContaining({
            reason: "ambient_subagents_disabled",
            mailboxEventId: followupMailbox.id,
            idempotencyKey: "followup:disabled-feature",
          }),
        }),
        expect.objectContaining({
          type: "subagent.approval_response.refused",
          preview: expect.objectContaining({
            reason: "ambient_subagents_disabled",
            mailboxEventId: approvalMailbox.id,
            approvalId: "approval-disabled",
            effectiveScope: "this_child_thread",
            idempotencyKey: "approval:disabled-feature",
          }),
        }),
      ]));
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("stops only the selected child thread and returns a structured cancellation result to the parent", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-child-stop-"));
    const store = new ProjectStore();
    const emitted: any[] = [];
    try {
      store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const parent = store.createThread("parent");
      const assistant = store.addMessage({
        threadId: parent.id,
        role: "assistant",
        content: "",
        metadata: { status: "streaming", runtime: "pi" },
      });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const featureFlags = resolveAmbientFeatureFlags({
        settings: store.getFeatureFlagSettings(),
        generatedAt: "2026-06-05T00:00:00.000Z",
      });
      const child = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Required child",
        roleId: "explorer",
        canonicalTaskPath: "root/0:explorer",
        featureFlagSnapshot: featureFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });
      const sibling = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Sibling child",
        roleId: "summarizer",
        canonicalTaskPath: "root/1:summarizer",
        featureFlagSnapshot: featureFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "optional_background",
      });
      store.markSubagentRunStatus(child.id, "running");
      store.markSubagentRunStatus(sibling.id, "running");
      store.appendSubagentMailboxEvent(child.id, {
        direction: "parent_to_child",
        type: "subagent.task",
        payload: { task: "Inspect this branch." },
      });
      store.appendSubagentMailboxEvent(child.id, {
        direction: "parent_to_child",
        type: "subagent.followup",
        payload: { message: "Also check restart recovery." },
      });
      const barrier = store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        childRunIds: [child.id],
        dependencyMode: "required_all",
        failurePolicy: "ask_user",
      });
      const childAbort = vi.fn(async () => undefined);
      const siblingAbort = vi.fn(async () => undefined);
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        () =>
          ({
            isDestroyed: () => false,
            webContents: {
              isDestroyed: () => false,
              isCrashed: () => false,
              send: (_channel: string, event: any) => emitted.push(event),
            },
          }) as any,
        {
          request: vi.fn(),
          denyThread: () => undefined,
        },
      );
      (runtime as any).activeRuns.set(child.childThreadId, {
        abort: childAbort,
        detach: vi.fn(),
        queue: vi.fn(),
      });
      (runtime as any).activeRuns.set(sibling.childThreadId, {
        abort: siblingAbort,
        detach: vi.fn(),
        queue: vi.fn(),
      });
      (runtime as any).activeRunIds.set(child.childThreadId, "child-runtime-run");
      (runtime as any).activeRunIds.set(sibling.childThreadId, "sibling-runtime-run");

      await runtime.abort(child.childThreadId);

      expect(childAbort).toHaveBeenCalledTimes(1);
      expect(siblingAbort).not.toHaveBeenCalled();
      expect((runtime as any).activeRuns.has(child.childThreadId)).toBe(false);
      expect((runtime as any).activeRuns.has(sibling.childThreadId)).toBe(true);
      expect((runtime as any).activeRunIds.has(child.childThreadId)).toBe(false);
      expect((runtime as any).activeRunIds.has(sibling.childThreadId)).toBe(true);
      expect(store.getSubagentRun(child.id)).toMatchObject({
        status: "cancelled",
        resultArtifact: {
          status: "cancelled",
          partial: false,
          summary: "Sub-agent child thread stopped by user.",
          childThreadId: child.childThreadId,
        },
      });
      expect(store.getSubagentRun(sibling.id).status).toBe("running");
      expect(store.getThread(child.childThreadId).childStatus).toBe("cancelled");
      expect(store.getThread(sibling.childThreadId).childStatus).toBe("running");
      expect(store.listSubagentMailboxEvents(child.id)).toHaveLength(3);
      expect(store.listSubagentMailboxEvents(child.id)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "subagent.task",
          direction: "parent_to_child",
          deliveryState: "cancelled",
        }),
        expect.objectContaining({
          type: "subagent.followup",
          direction: "parent_to_child",
          deliveryState: "cancelled",
        }),
        expect.objectContaining({
          type: "subagent.cancelled",
          direction: "child_to_parent",
          payload: expect.objectContaining({
            status: "cancelled",
            source: "child_stop",
            childThreadId: child.childThreadId,
          }),
        }),
      ]));
      expect(store.getSubagentWaitBarrier(barrier.id)).toMatchObject({
        status: "cancelled",
        resolutionArtifact: expect.objectContaining({
          synthesisAllowed: false,
          childStatuses: [{ childRunId: child.id, status: "cancelled" }],
          transitionEvidence: expect.objectContaining({
            schemaVersion: "ambient-subagent-wait-barrier-transition-evidence-v1",
            kind: "child_cancelled",
            source: "cancel_agent",
            childRunId: child.id,
            reason: "Sub-agent child thread stopped by user.",
            idempotencyKey: `direct-child-stop:${child.id}`,
          }),
          waitBarrierEvaluation: expect.objectContaining({
            synthesisAllowed: false,
            terminalUnsafeChildRunIds: [child.id],
          }),
          resultArtifact: expect.objectContaining({
            status: "cancelled",
            summary: "Sub-agent child thread stopped by user.",
          }),
        }),
      });
      expect(store.listSubagentRunEvents(child.id)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "subagent.child_stopped",
          preview: expect.objectContaining({
            previousStatus: "running",
            source: "direct_child_stop",
            cancelledMailboxEvents: expect.arrayContaining([
              expect.objectContaining({ type: "subagent.task", deliveryState: "cancelled" }),
              expect.objectContaining({ type: "subagent.followup", deliveryState: "cancelled" }),
            ]),
          }),
        }),
      ]));
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)).toEqual([
        expect.objectContaining({
          parentMessageId: assistant.id,
          type: "subagent.lifecycle_interrupted",
          payload: expect.objectContaining({
            schemaVersion: "ambient-subagent-lifecycle-interruption-v1",
            parentMessageId: assistant.id,
            childRunId: child.id,
            childThreadId: child.childThreadId,
            previousStatus: "running",
            status: "cancelled",
            source: "direct_child_stop",
            waitBarrierIds: [barrier.id],
            resultArtifact: expect.objectContaining({
              status: "cancelled",
              partial: false,
            }),
          }),
        }),
      ]);
      expect(store.listMessages(child.childThreadId)).toEqual([
        expect.objectContaining({
          role: "system",
          content: expect.stringContaining("Sub-agent stopped by user."),
          metadata: expect.objectContaining({
            status: "cancelled",
            subagentRunId: child.id,
          }),
        }),
      ]);
      expect(emitted).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "subagent-run-updated",
          run: expect.objectContaining({ id: child.id, status: "cancelled" }),
          workspacePath,
        }),
        expect.objectContaining({
          type: "subagent-wait-barrier-updated",
          barrier: expect.objectContaining({ id: barrier.id, status: "cancelled" }),
          workspacePath,
        }),
        expect.objectContaining({
          type: "subagent-parent-mailbox-event-updated",
          mailboxEvent: expect.objectContaining({
            type: "subagent.lifecycle_interrupted",
            parentMessageId: assistant.id,
          }),
          workspacePath,
        }),
        expect.objectContaining({
          type: "runtime-activity",
          activity: expect.objectContaining({
            threadId: parent.id,
            message: expect.stringContaining("sibling children continue"),
          }),
          workspacePath,
        }),
        expect.objectContaining({
          type: "run-status",
          threadId: child.childThreadId,
          status: "idle",
          workspacePath,
        }),
      ]));
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});

describe("agent browser tool timeout", () => {
  it("marks screenshots as uninspected pixels and points to active visual analysis", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-browser-screenshot-vision-hint-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const thread = store.createThread("browser screenshot vision hint");
      const browserState = {
        running: true,
        profileMode: "isolated",
        runtime: "internal",
        internalAvailable: true,
        copiedProfileAvailable: false,
        chromeAvailable: true,
        browserLoginBrokerAvailable: false,
      };
      const browser = {
        getState: vi.fn(async () => browserState),
        screenshot: vi.fn(async () => ({
          path: join(workspacePath, ".ambient-codex/browser/screenshots/current.png"),
          artifactPath: ".ambient-codex/browser/screenshots/current.png",
          title: "Fixture",
          url: "http://127.0.0.1:4321/",
          width: 1280,
          height: 720,
          bytes: 12345,
          mimeType: "image/png",
        })),
      };
      const runtime = new AgentRuntime(store, browser as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      (runtime as any).createBrowserToolExtension(thread.id, workspace)({
        registerTool: (tool: any) => registeredTools.push(tool),
        getActiveTools: () => ["browser_screenshot", "ambient_visual_analyze"],
        getAllTools: () => [{ name: "browser_screenshot" }, { name: "ambient_visual_analyze" }],
      });

      const screenshot = registeredTools.find((tool) => tool.name === "browser_screenshot")!;
      const result = await screenshot.execute("screenshot", {});
      const text = result.content[0].text;

      expect(text).toContain("Visual evidence status: screenshot pixels have not been inspected by the model.");
      expect(text).toContain("Do not claim visible UI, text, layout, game state, or design quality from this screenshot result alone.");
      expect(text).toContain("call ambient_visual_analyze");
      expect(text).toContain("\"browserScreenshot\":{\"ref\":\"latest\"");
      expect(result.details.visualEvidence).toEqual({
        inspected: false,
        analyzer: "direct",
        artifactRef: "latest_browser_screenshot",
        analyzeInput: {
          browserScreenshot: {
            ref: "latest",
            artifactRef: "latest_browser_screenshot",
            label: "browser screenshot",
          },
          task: "ui_review",
        },
      });
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("bounds hung browser tool operations while continuing heartbeat updates", async () => {
    vi.useFakeTimers();
    try {
      const updates: string[] = [];
      const pending = withBrowserToolHeartbeat(
        "browser_nav",
        "Browser navigation is still running.",
        () => new Promise<string>(() => undefined),
        (update) => updates.push(update.content[0]?.text ?? ""),
        { timeoutMs: 50, heartbeatMs: 20 },
      ).catch((error) => error);

      await vi.advanceTimersByTimeAsync(20);
      expect(updates).toEqual(["Browser navigation is still running."]);

      await vi.advanceTimersByTimeAsync(30);
      const error = await pending;
      expect(error).toBeInstanceOf(BrowserToolTimeoutError);
      expect(error.message).toContain("browser_nav timed out after 50ms");
    } finally {
      vi.useRealTimers();
    }
  });

  it("honors runtime abort signals for browser tool operations", async () => {
    const controller = new AbortController();
    const pending = withBrowserToolHeartbeat(
      "browser_screenshot",
      "Browser screenshot capture is still running.",
      () => new Promise<string>(() => undefined),
      undefined,
      { signal: controller.signal, timeoutMs: 1_000 },
    ).catch((error) => error);

    controller.abort(new Error("Run canceled."));

    const error = await pending;
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Run canceled.");
  });

  it("resets the browser idle timeout on operation activity", async () => {
    vi.useFakeTimers();
    try {
      const updates: string[] = [];
      const pending = withBrowserToolHeartbeat(
        "browser_nav",
        "Browser navigation is still running.",
        (markActivity) =>
          new Promise<string>((resolve) => {
            setTimeout(() => markActivity("Browser received navigation progress."), 40);
            setTimeout(() => markActivity("Browser DOM is still changing."), 80);
            setTimeout(() => resolve("loaded"), 120);
          }),
        (update) => updates.push(update.content[0]?.text ?? ""),
        { timeoutMs: 50, heartbeatMs: 1_000 },
      );

      await vi.advanceTimersByTimeAsync(120);

      await expect(pending).resolves.toBe("loaded");
      expect(updates).toEqual([
        "Browser received navigation progress.",
        "Browser DOM is still changing.",
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses a bounded default browser tool timeout with environment override", () => {
    expect(browserToolTimeoutMs({})).toBe(90_000);
    expect(browserToolTimeoutMs({ AMBIENT_BROWSER_TOOL_TIMEOUT_MS: "2500" })).toBe(2_500);
    expect(browserToolTimeoutMs({ AMBIENT_BROWSER_TOOL_TIMEOUT_MS: "0" })).toBe(90_000);
  });
});

describe("AgentRuntime planner tool activation", () => {
  it("activates MiniCPM-V visual analysis directly in Planner Mode without activating setup", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-planner-vision-tool-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const thread = store.updateThreadSettings(store.createThread("planner visual evidence").id, { collaborationMode: "planner" });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });
      let activeTools = ["read", "browser_screenshot", "ambient_tool_search", "ambient_tool_describe", "ambient_tool_call"];
      const handlers = new Map<string, Array<(...args: any[]) => unknown>>();
      (runtime as any).createPlannerModeExtension(thread.id)({
        on: (event: string, handler: (...args: any[]) => unknown) => {
          handlers.set(event, [...(handlers.get(event) ?? []), handler]);
        },
        getActiveTools: () => activeTools,
        getAllTools: () => [
          { name: "read" },
          { name: "browser_screenshot" },
          { name: "ambient_visual_analyze" },
          { name: "ambient_visual_minicpm_setup" },
        ],
        setActiveTools: (tools: string[]) => {
          activeTools = tools;
        },
      });

      await handlers.get("session_start")?.[0]?.();

      expect(activeTools).toContain("browser_screenshot");
      expect(activeTools).toContain("ambient_visual_analyze");
      expect(activeTools).not.toContain("ambient_visual_minicpm_setup");
      expect(activeTools).not.toContain("ambient_tool_call");
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});

function browserUserActionState(status: BrowserUserActionState["status"]): BrowserUserActionState {
  return {
    id: `test-${status}`,
    active: false,
    status,
    kind: "captcha",
    provider: "google",
    toolName: "browser_search",
    runtime: "chrome",
    profileMode: "isolated",
    url: "https://www.google.com/search?q=bunny",
    title: "Google Search",
    origin: "https://www.google.com",
    message: "Complete the CAPTCHA in the browser.",
    startedAt: "2026-05-06T00:00:00.000Z",
    lastCheckedAt: "2026-05-06T00:00:01.000Z",
    canAutoResume: true,
  };
}

function fakePiSession(sessionFile: string) {
  return {
    sessionFile,
    sessionManager: {
      getEntries: () => [],
    },
    model: {
      contextWindow: 128_000,
    },
    getContextUsage: () => ({
      tokens: 512,
      contextWindow: 128_000,
      percent: 0.4,
    }),
    sendCustomMessage: vi.fn(async () => undefined),
    dispose: vi.fn(),
  };
}

function normalizedIsoFromEnv(value: string | undefined, name: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${name} must be an ISO timestamp when supplied.`);
  }
  return date.toISOString();
}

describe("AgentRuntime visible thinking", () => {
  it("streams Kimi thinking events as visible thinking messages", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-kimi-thinking-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const created = store.createThread("kimi thinking streaming");
      const threadSessionDir = join(workspace.sessionPath, created.id);
      await mkdir(threadSessionDir, { recursive: true });
      const sessionFile = join(threadSessionDir, "session.jsonl");
      await writeFile(sessionFile, "", "utf8");
      const thread = store.updateThreadSettings(created.id, {
        model: AMBIENT_KIMI_K2_7_CODE_MODEL,
        piSessionFile: sessionFile,
      });

      const subscribers: Array<(event: any) => void> = [];
      const emit = (event: any) => {
        for (const subscriber of [...subscribers]) subscriber(event);
      };
      const thinkingText = "This reasoning should stream into the thinking panel.";
      const finalText = "thinking-ok";
      const session = {
        ...fakePiSession(sessionFile),
        isStreaming: true,
        subscribe: vi.fn((subscriber: (event: any) => void) => {
          subscribers.push(subscriber);
          return () => {
            const index = subscribers.indexOf(subscriber);
            if (index >= 0) subscribers.splice(index, 1);
          };
        }),
        prompt: vi.fn(async () => {
          emit({ type: "message_update", assistantMessageEvent: { type: "thinking_start" } });
          emit({ type: "message_update", assistantMessageEvent: { type: "thinking_delta", delta: thinkingText } });
          emit({ type: "message_update", assistantMessageEvent: { type: "thinking_end", content: thinkingText } });
          emit({
            type: "message_end",
            message: {
              role: "assistant",
              stopReason: "stop",
              content: [{ type: "text", text: finalText }],
            },
          });
        }),
        steer: vi.fn(async () => undefined),
        compact: vi.fn(async () => undefined),
        agent: {
          abort: vi.fn(),
          waitForIdle: vi.fn(async () => undefined),
        },
      };

      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });
      vi.spyOn(runtime as any, "getSession").mockResolvedValue(session);

      await runtime.send({
        threadId: thread.id,
        content: "Answer after thinking.",
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: AMBIENT_KIMI_K2_7_CODE_MODEL,
        thinkingLevel: "medium",
        delivery: "prompt",
        context: [],
      });

      const assistantMessages = store.listMessages(thread.id).filter((message) => message.role === "assistant");
      const thinkingMessage = assistantMessages.find((message) => message.metadata?.kind === "thinking");
      expect(thinkingMessage).toMatchObject({
        content: thinkingText,
        metadata: expect.objectContaining({
          kind: "thinking",
          runtime: "pi",
          provider: "ambient",
          status: "done",
        }),
      });
      expect(assistantMessages.find((message) => message.content === finalText)).toMatchObject({
        content: finalText,
        metadata: expect.objectContaining({ status: "done" }),
      });
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});

describe("Planner Mode system prompt", () => {
  it("makes the native question block contract explicit", () => {
    expect(PLANNER_MODE_SYSTEM_PROMPT).toContain("Ambient Desktop native planner decision questions");
    expect(PLANNER_MODE_SYSTEM_PROMPT).toContain("Native Planner questions only render if they are emitted as that fenced block.");
    expect(PLANNER_MODE_SYSTEM_PROMPT).toContain("Do not write ambient-planner-questions as a heading, label, XML tag, or plain text.");
    expect(PLANNER_MODE_SYSTEM_PROMPT).toContain("Do not use a generic ```json fence for native questions.");
    expect(PLANNER_MODE_SYSTEM_PROMPT).toContain("Do not duplicate native planner decision questions in the plan body.");
    expect(PLANNER_MODE_SYSTEM_PROMPT).toContain("one-at-a-time multiple choice UI with custom answer support");
    expect(PLANNER_MODE_SYSTEM_PROMPT).toContain("Before sending, verify the response contains exactly one native question block");
    expect(PLANNER_MODE_SYSTEM_PROMPT).toContain("the opening line is exactly ```ambient-planner-questions");
    expect(PLANNER_MODE_SYSTEM_PROMPT).not.toContain("Codex-style decision questions");
  });

});

describe("Ambient CLI lazy skill mounting policy", () => {
  it("excludes Ambient CLI skill paths by default", () => {
    expect(ambientCliLazySkillsEnabled({})).toBe(true);
    expect(resolveAmbientCliSkillMount({
      cliSkillPaths: ["/workspace/.ambient/cli-packages/imported/json/skills/json-cli"],
      installedCliPackageCount: 1,
      lazyModeEnabled: true,
    })).toEqual({
      lazyModeEnabled: true,
      installedCliPackageCount: 1,
      eagerCliSkillCount: 1,
      mountedCliSkillCount: 0,
      mountedCliSkillPaths: [],
    });
  });

  it("keeps a temporary eager mounting escape hatch", () => {
    expect(ambientCliLazySkillsEnabled({ AMBIENT_CLI_EAGER_SKILLS: "1" })).toBe(false);
    expect(resolveAmbientCliSkillMount({
      cliSkillPaths: ["/workspace/.ambient/cli-packages/imported/json/skills/json-cli"],
      installedCliPackageCount: 2,
      lazyModeEnabled: false,
    })).toEqual({
      lazyModeEnabled: false,
      installedCliPackageCount: 2,
      eagerCliSkillCount: 1,
      mountedCliSkillCount: 1,
      mountedCliSkillPaths: ["/workspace/.ambient/cli-packages/imported/json/skills/json-cli"],
    });
  });
});

describe("Aggressive retry runtime overrides", () => {
  it("leaves Pi retry overrides unset when aggressive retries are disabled", () => {
    expect(piRetryOverridesFromModelRuntimeSettings({
      aggressiveRetries: false,
      providerPreStreamTimeoutMs: 45_000,
      providerStreamIdleTimeoutMs: 30_000,
      installedProviders: [],
    })).toBeUndefined();
  });

  it("maps aggressive retries into the Pi-supported retry override shape", () => {
    expect(piRetryOverridesFromModelRuntimeSettings({
      aggressiveRetries: true,
      providerPreStreamTimeoutMs: 45_000,
      providerStreamIdleTimeoutMs: 30_000,
      installedProviders: [],
    })).toEqual({
      enabled: true,
      maxRetries: 10,
      baseDelayMs: 1_000,
      provider: {
        maxRetries: 10,
        maxRetryDelayMs: 5_000,
      },
    });
  });
});

describe("AgentRuntime provider catalog tools", () => {
  it("normalizes known Brave Search Builder plan inputs from older Pi argument shapes", () => {
    const input = ambientCapabilityBuilderPlanInput({
      goal: "Can we add brave search as a provider to Ambient?",
      installerShape: "search-provider",
      outputFileArtifactTypes: "[]",
    });

    expect(input).toMatchObject({
      capabilityName: "ambient-brave-search",
      installerShape: "search-provider",
      provider: "Brave Search",
      locality: "network",
      responseFormats: ["JSON"],
      envNames: ["BRAVE_API_KEY"],
      networkHosts: ["api.search.brave.com"],
    });
    expect(input.outputFileArtifacts).toBeUndefined();
  });

  it("registers a read-only provider catalog tool that returns catalog guidance", async () => {
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const handlers: Record<string, (event: any) => Promise<any> | any> = {};
    const fakePi = {
      registerTool: (tool: any) => registeredTools.push(tool),
      on: (event: string, handler: (event: any) => Promise<any> | any) => {
        handlers[event] = handler;
      },
    } as any;

    createProviderCatalogToolExtension()(fakePi);

    const catalogTool = registeredTools.find((tool) => tool.name === "ambient_provider_catalog");
    expect(catalogTool).toBeDefined();
    expect(handlers.before_agent_start).toBeDefined();
    expect(handlers.context).toBeDefined();

    const startContext = await handlers.before_agent_start({ systemPrompt: "Base system prompt" });
    expect(startContext.systemPrompt).toContain("Base system prompt");
    expect(startContext.systemPrompt).toContain("Ambient provider-selection reminder");
    expect(startContext.message).toMatchObject({
      customType: "ambient-provider-selection-context",
      content: providerCatalogBootstrapReminder,
      display: false,
    });

    const filtered = await handlers.context({
      messages: [
        { customType: "ambient-provider-selection-context", content: "stale reminder" },
        { customType: "other", content: "keep" },
      ],
    });
    expect(filtered.messages).toEqual([{ customType: "other", content: "keep" }]);

    const result = await catalogTool!.execute("catalog-call", {
      capabilityArea: "deep-research",
      includeExperimental: true,
      includeNeedsResearch: true,
    });

    expect(result.content[0].text).toContain("LiteResearcher-4B");
    expect(result.content[0].text).toContain("localArtifacts=conditional-local");
    expect(result.details).toMatchObject({
      runtime: "ambient-provider-catalog",
      toolName: "ambient_provider_catalog",
      status: "complete",
    });
    expect(result.details.providers.some((provider: { id: string }) => provider.id === "deep.step-deepresearch")).toBe(true);
  });
});

describe("AgentRuntime install route gates", () => {
  it("blocks install side-effect tools after a needs-clarification route plan until Pi replans", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-install-route-gate-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const thread = store.updateThreadSettings(store.createThread("install route gate").id, { permissionMode: "full-access" });
      const permissionRequest = vi.fn();
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: permissionRequest,
        denyThread: () => undefined,
      });
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      (runtime as any).createPluginInstallToolExtension(thread.id, workspace, {} as any, undefined)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });

      const routeTool = registeredTools.find((tool) => tool.name === "ambient_install_route_plan");
      expect(routeTool).toBeDefined();

      const ambiguousPlan = await routeTool!.execute("route-ambiguous", {
        userRequest: "Install this thing.",
        requestedKind: "unknown",
      });
      expect(ambiguousPlan.details).toMatchObject({
        runtime: "ambient-install-route",
        toolName: "ambient_install_route_plan",
        lane: "needs-clarification",
      });

      const blocked = await (runtime as any).resolveToolCallPermission(thread.id, workspace, "bash", {
        command: "mkdir -p ~/.agents/skills/mystery",
      });
      expect(blocked?.reason).toContain("needs-clarification");
      expect(permissionRequest).not.toHaveBeenCalled();

      const gateMessage = store
        .listMessages(thread.id)
        .find((message) => message.metadata?.runtime === "ambient-install-route-gate");
      expect(gateMessage?.content).toContain("Ambient install route gate blocked bash.");
      expect(gateMessage?.content).toContain("Ask one targeted clarification before any install side effects.");
      expect(gateMessage?.content).toContain("Retry ambient_install_route_plan with sourceUrl, localPath, packageName, or requestedKind");

      const clarifiedPlan = await routeTool!.execute("route-clarified", {
        userRequest: "Install ffmpeg for this project.",
      });
      expect(clarifiedPlan.details).toMatchObject({
        runtime: "ambient-install-route",
        toolName: "ambient_install_route_plan",
        lane: "normal-app-setup",
      });

      await expect((runtime as any).resolveToolCallPermission(thread.id, workspace, "bash", {
        command: "echo ok",
      })).resolves.toBeUndefined();
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("blocks MCP install-like bash commands before permission approval", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-mcp-install-shell-guard-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const thread = store.updateThreadSettings(store.createThread("mcp shell guard").id, { permissionMode: "full-access" });
      store.addMessage({
        threadId: thread.id,
        role: "user",
        content: "Install this MCP from https://github.com/alanpcf/brasil-data-mcp",
      });
      const permissionRequest = vi.fn();
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: permissionRequest,
        denyThread: () => undefined,
      });

      const blocked = await (runtime as any).resolveToolCallPermission(thread.id, workspace, "bash", {
        command: "git clone https://github.com/alanpcf/brasil-data-mcp /tmp/brasil-data-mcp",
      });
      const blockedReadmeFetch = await (runtime as any).resolveToolCallPermission(thread.id, workspace, "bash", {
        command: "curl -L https://raw.githubusercontent.com/Ratnaditya-J/csvglow/main/README.md",
      });
      const blockedToolHiveRun = await (runtime as any).resolveToolCallPermission(thread.id, workspace, "bash", {
        command: "thv run uvx://csvglow --name ambient-csvglow",
      });
      const allowedReadOnlyPathCheck = await (runtime as any).resolveToolCallPermission(thread.id, workspace, "bash", {
        command: "ls -la /private/tmp/ambient-mcp-toolhive-route-detection && find . -name 'test_csvglow*' -maxdepth 2",
      });

      expect(blocked?.reason).toContain("Blocked MCP install-like bash command");
      expect(blockedReadmeFetch?.reason).toContain("Blocked MCP install-like bash command");
      expect(blockedToolHiveRun?.reason).toContain("Blocked MCP install-like bash command");
      expect(allowedReadOnlyPathCheck).toBeUndefined();
      expect(permissionRequest).not.toHaveBeenCalled();
      const guardMessage = store
        .listMessages(thread.id)
        .find((message) => message.metadata?.runtime === "ambient-mcp-install-shell-guard");
      expect(guardMessage?.content).toContain("Ambient MCP install guard blocked bash.");
      expect(guardMessage?.content).toContain("ToolHive wrapper");
      expect(guardMessage?.content).toContain("ambient_mcp_autowire_plan");
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("allows ToolHive shell diagnostics outside MCP install context", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-mcp-install-shell-guard-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const thread = store.updateThreadSettings(store.createThread("mcp shell guard diagnostic").id, { permissionMode: "full-access" });
      store.addMessage({
        threadId: thread.id,
        role: "user",
        content: "Check the ToolHive version.",
      });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });

      await expect((runtime as any).resolveToolCallPermission(thread.id, workspace, "bash", {
        command: "toolhive version",
      })).resolves.toBeUndefined();
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});

describe("AgentRuntime Ambient workflow playbook tools", () => {
  it("registers workflow management tools through workflowRecording feature hooks", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-workflow-management-tools-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const thread = store.createThread("workflow management tools");
      const playbook = {
        id: "date-night",
        title: "Date night theatre finder",
        version: 2,
        enabled: true,
        savedAt: "2026-05-28T01:00:00.000Z",
        manifestPath: join(workspacePath, ".ambient/workflows/date-night/ambient-workflow.json"),
        markdownPath: join(workspacePath, ".ambient/workflows/date-night/workflow.md"),
        sidecarPath: join(workspacePath, ".ambient/workflows/date-night/workflow.json"),
        transcriptPath: join(workspacePath, ".ambient/workflows/date-night/transcript.jsonl"),
        summary: "Find date night theatre.",
        toolNames: ["browser_search"],
        outputShape: ["Shortlist"],
        versions: [],
        markdownPreview: "",
        markdownIncluded: false,
        markdownTruncated: false,
        guidance: [],
      };
      const update = vi.fn(async () => playbook);
      const archive = vi.fn(async () => ({
        ...playbook,
        archivedAt: "2026-05-28T02:00:00.000Z",
        archivedReason: "Superseded.",
      }));
      const unarchive = vi.fn(async () => playbook);
      const restoreVersion = vi.fn(async () => ({ ...playbook, version: 3 }));
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      }, {
        workflowRecordings: {
          update,
          archive,
          unarchive,
          restoreVersion,
        },
      });
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      (runtime as any).createPluginInstallToolExtension(thread.id, workspace, {} as any, undefined)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });

      expect(registeredTools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
        "ambient_workflows_update",
        "ambient_workflows_archive",
        "ambient_workflows_unarchive",
        "ambient_workflows_restore_version",
      ]));

      const updateTool = registeredTools.find((tool) => tool.name === "ambient_workflows_update");
      const archiveTool = registeredTools.find((tool) => tool.name === "ambient_workflows_archive");
      const unarchiveTool = registeredTools.find((tool) => tool.name === "ambient_workflows_unarchive");
      const restoreTool = registeredTools.find((tool) => tool.name === "ambient_workflows_restore_version");
      if (!updateTool || !archiveTool || !unarchiveTool || !restoreTool) throw new Error("Missing workflow management tools.");

      await updateTool.execute("workflow-update", {
        id: "date-night",
        baseVersion: 2,
        draft: {
          intent: "Find date night theatre.",
          inputs: ["Location"],
          successfulExamples: [{ toolName: "browser_search" }],
          doNot: [],
          validation: ["Check current venue pages."],
          outputShape: ["Shortlist"],
        },
      });
      await archiveTool.execute("workflow-archive", { id: "date-night", baseVersion: 2, reason: "Superseded." });
      await unarchiveTool.execute("workflow-unarchive", { id: "date-night", baseVersion: 2 });
      await restoreTool.execute("workflow-restore", { id: "date-night", version: 1 });

      expect(update).toHaveBeenCalledWith(expect.objectContaining({ id: "date-night", baseVersion: 2 }));
      expect(archive).toHaveBeenCalledWith({ id: "date-night", baseVersion: 2, reason: "Superseded." });
      expect(unarchive).toHaveBeenCalledWith({ id: "date-night", baseVersion: 2 });
      expect(restoreVersion).toHaveBeenCalledWith({ id: "date-night", version: 1 });
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});

describe("AgentRuntime voice settings tools", () => {
  it("registers typed status, list, select, policy, and test tools backed by injected voice dependencies", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-voice-tools-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const thread = store.createThread("voice tools");
      const provider = runtimeVoiceProvider();
      let currentSettings = runtimeVoiceSettings({
        providerCapabilityId: provider.capabilityId,
        voiceId: "voice-warm",
        enabled: false,
      });
      const permissionRequests: Array<{ toolName: string; detail: string }> = [];
      const dogfoodSelectedVoiceProvider = vi.fn(async (
        _thread: unknown,
        _workspace: unknown,
        _settings: VoiceSettings,
        _options?: { text?: string },
      ) => ({
        status: "succeeded" as const,
        audioPath: ".ambient/voice/test.mp3",
        mimeType: "audio/mpeg",
        durationMs: 123,
      }));
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];

      createVoiceSettingsToolExtension({
        threadId: thread.id,
        workspace: store.getWorkspace(),
        getThread: (id) => store.getThread(id),
        listProviders: async () => [provider],
        voiceProviderWorkspacePathForCapabilityId: async () => workspacePath,
        resolveFirstPartyPluginPermission: async (input) => {
          permissionRequests.push({ toolName: input.toolName, detail: input.detail });
          return true;
        },
        dogfoodSelectedVoiceProvider,
        voice: {
          readSettings: () => currentSettings,
          updateSettings: async (input) => {
            currentSettings = { ...currentSettings, ...input };
            return currentSettings;
          },
        },
      })({
        registerTool: (tool: any) => registeredTools.push(tool),
      } as any);

      const status = registeredTools.find((tool) => tool.name === "ambient_voice_status")!;
      const listVoices = registeredTools.find((tool) => tool.name === "ambient_voice_list_voices")!;
      const select = registeredTools.find((tool) => tool.name === "ambient_voice_select")!;
      const policy = registeredTools.find((tool) => tool.name === "ambient_voice_policy_update")!;
      const test = registeredTools.find((tool) => tool.name === "ambient_voice_test")!;
      expect(status).toBeDefined();
      expect(listVoices).toBeDefined();
      expect(select).toBeDefined();
      expect(policy).toBeDefined();
      expect(test).toBeDefined();

      const statusResult = await status.execute("status", {});
      expect(statusResult.content[0].text).toContain("Ambient voice status");
      expect(statusResult.details).toMatchObject({
        runtime: "ambient-voice",
        toolName: "ambient_voice_status",
        status: "complete",
        providerCount: 1,
        availableProviderCount: 1,
        selectedProviderCapabilityId: provider.capabilityId,
        selectedVoiceId: "voice-warm",
      });

      const listResult = await listVoices.execute("list", {
        providerCapabilityId: provider.capabilityId,
        query: "bright",
      });
      expect(listResult.content[0].text).toContain("Ambient voice list");
      expect(listResult.details).toMatchObject({
        runtime: "ambient-voice",
        toolName: "ambient_voice_list_voices",
        status: "complete",
        providerCapabilityId: provider.capabilityId,
        totalVoices: 2,
        matchedVoices: 1,
        returnedVoices: 1,
        voices: [expect.objectContaining({ id: "voice-bright", label: "Bright Narrator" })],
      });

      const selectResult = await select.execute("select", {
        providerCapabilityId: provider.capabilityId,
        voiceId: "voice-bright",
        enabled: true,
        autoplay: false,
        format: "wav",
        reason: "fixture voice switch",
      });
      expect(selectResult.content[0].text).toContain("Ambient voice settings updated");
      expect(selectResult.details).toMatchObject({
        runtime: "ambient-voice",
        toolName: "ambient_voice_select",
        status: "complete",
        selectedProviderCapabilityId: provider.capabilityId,
        selectedVoiceId: "voice-bright",
        settings: {
          enabled: true,
          autoplay: false,
          format: "wav",
          voiceId: "voice-bright",
        },
      });

      const policyResult = await policy.execute("policy", {
        mode: "tagged",
        maxChars: 900,
        longReply: "skip",
        artifactCacheMaxMb: 24,
        reason: "fixture voice policy",
      });
      expect(policyResult.content[0].text).toContain("Ambient voice policy updated");
      expect(policyResult.details).toMatchObject({
        runtime: "ambient-voice",
        toolName: "ambient_voice_policy_update",
        status: "complete",
        settings: {
          mode: "tagged",
          maxChars: 900,
          longReply: "skip",
          artifactCacheMaxMb: 24,
        },
      });

      const testResult = await test.execute("test", {
        text: "Hello from Ambient voice.",
        reason: "fixture dogfood",
      });
      expect(testResult.content[0].text).toContain("Ambient voice provider test succeeded");
      expect(testResult.details).toMatchObject({
        runtime: "ambient-voice",
        toolName: "ambient_voice_test",
        status: "complete",
        testStatus: "succeeded",
        providerCapabilityId: provider.capabilityId,
        voiceId: "voice-bright",
        audioPath: ".ambient/voice/test.mp3",
        mimeType: "audio/mpeg",
        durationMs: 123,
      });
      expect(dogfoodSelectedVoiceProvider).toHaveBeenCalledTimes(1);
      expect(dogfoodSelectedVoiceProvider.mock.calls[0]?.[2]).toMatchObject({
        providerCapabilityId: provider.capabilityId,
        voiceId: "voice-bright",
        maxChars: 900,
      });
      expect(dogfoodSelectedVoiceProvider.mock.calls[0]?.[3]).toEqual({ text: "Hello from Ambient voice." });
      expect(permissionRequests.map((request) => request.toolName)).toEqual([
        "ambient_voice_select",
        "ambient_voice_policy_update",
        "ambient_voice_test",
      ]);
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});

function runtimeVoiceSettings(input: Partial<VoiceSettings> = {}): VoiceSettings {
  return {
    enabled: input.enabled ?? true,
    mode: input.mode ?? "assistant-final",
    autoplay: input.autoplay ?? true,
    providerCapabilityId: "providerCapabilityId" in input ? input.providerCapabilityId : "ambient-cli:fixture-voice:tool:voice_tts",
    voiceId: "voiceId" in input ? input.voiceId : "voice-warm",
    preferredVoicesByProvider: input.preferredVoicesByProvider,
    maxChars: input.maxChars ?? 1200,
    longReply: input.longReply ?? "summarize",
    format: input.format ?? "mp3",
    artifactCacheMaxMb: input.artifactCacheMaxMb ?? 32,
  };
}

function runtimeVoiceProvider(input: Partial<VoiceProviderCandidate> = {}): VoiceProviderCandidate {
  return {
    packageId: input.packageId ?? "ambient-cli:fixture-voice",
    packageName: input.packageName ?? "ambient-fixture-voice",
    command: input.command ?? "voice_tts",
    capabilityId: input.capabilityId ?? "ambient-cli:fixture-voice:tool:voice_tts",
    providerId: input.providerId ?? "fixture-voice",
    label: input.label ?? "Fixture Voice",
    description: input.description,
    format: input.format ?? "mp3",
    formats: input.formats ?? ["mp3", "wav"],
    voices: input.voices ?? [
      { id: "voice-warm", label: "Warm Narrator", locale: "en-US" },
      { id: "voice-bright", label: "Bright Narrator", locale: "en-GB" },
    ],
    local: input.local ?? true,
    installed: input.installed ?? true,
    available: input.available ?? true,
    availabilityReason: input.availabilityReason ?? "Installed Ambient CLI package is available.",
    ...(input.voiceCatalog ? { voiceCatalog: input.voiceCatalog } : {}),
    ...(input.voiceDiscovery ? { voiceDiscovery: input.voiceDiscovery } : {}),
    ...(input.voiceCloning ? { voiceCloning: input.voiceCloning } : {}),
    ...(input.diagnostics ? { diagnostics: input.diagnostics } : {}),
  };
}

describe("AgentRuntime STT settings tools", () => {
  it("registers typed status, select, policy, and test tools backed by injected STT dependencies", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-stt-tools-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const speechPath = "speech.wav";
      await writeFile(join(workspacePath, speechPath), writePcm16Wav({
        sampleRate: 16_000,
        channels: 1,
        samples: new Int16Array(1600).fill(1800),
      }));
      const thread = store.createThread("stt tools");
      const provider = runtimeSttProvider();
      let currentSettings = runtimeSttSettings({
        providerCapabilityId: provider.capabilityId,
        enabled: false,
      });
      const permissionRequests: Array<{ toolName: string; detail: string }> = [];
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];

      createSttSettingsToolExtension({
        threadId: thread.id,
        workspace: store.getWorkspace(),
        getThread: (id) => store.getThread(id),
        listProviders: async () => [provider],
        resolveFirstPartyPluginPermission: async (input) => {
          permissionRequests.push({ toolName: input.toolName, detail: input.detail });
          return true;
        },
        stt: {
          readSettings: () => currentSettings,
          updateSettings: async (input) => {
            currentSettings = { ...currentSettings, ...input };
            return currentSettings;
          },
          testRunner: async (_workspacePath, input) => {
            const outputJsonPath = runtimeRequiredCliArg(input.args, "--output-json");
            await mkdir(dirname(outputJsonPath), { recursive: true });
            await writeFile(
              outputJsonPath,
              `${JSON.stringify({
                text: "ambient speech recognition spike",
                language: "English",
                durationMs: 321,
                providerId: "qwen3-asr-fixture",
              })}\n`,
              "utf8",
            );
            return {
              packageId: input.packageId ?? "ambient-cli:ambient-qwen3-asr",
              packageName: input.packageName ?? "ambient-qwen3-asr",
              commandName: input.command,
              command: [input.command, ...(input.args ?? [])],
              cwd: "",
              durationMs: 7,
              stdout: JSON.stringify({ text: "ambient speech recognition spike" }),
              stderr: "",
            };
          },
        },
      })({
        registerTool: (tool: any) => registeredTools.push(tool),
      } as any);

      const status = registeredTools.find((tool) => tool.name === "ambient_stt_status")!;
      const select = registeredTools.find((tool) => tool.name === "ambient_stt_select")!;
      const policy = registeredTools.find((tool) => tool.name === "ambient_stt_policy_update")!;
      const test = registeredTools.find((tool) => tool.name === "ambient_stt_test")!;
      expect(status).toBeDefined();
      expect(select).toBeDefined();
      expect(policy).toBeDefined();
      expect(test).toBeDefined();

      const statusResult = await status.execute("status", {});
      expect(statusResult.content[0].text).toContain("Ambient STT status");
      expect(statusResult.details).toMatchObject({
        runtime: "ambient-stt",
        toolName: "ambient_stt_status",
        status: "complete",
        providerCount: 1,
        availableProviderCount: 1,
        selectedProviderCapabilityId: provider.capabilityId,
      });

      const selectResult = await select.execute("select", {
        providerCapabilityId: provider.capabilityId,
        spokenLanguage: "Spanish",
        enabled: true,
      });
      expect(selectResult.content[0].text).toContain("Ambient STT settings updated");
      expect(selectResult.details).toMatchObject({
        runtime: "ambient-stt",
        toolName: "ambient_stt_select",
        status: "complete",
        selectedProviderCapabilityId: provider.capabilityId,
        settings: {
          enabled: true,
          spokenLanguage: "Spanish",
        },
      });

      const policyResult = await policy.execute("policy", {
        autoSendAfterTranscription: false,
        silenceFinalizeSeconds: 1.2,
        reason: "fixture policy change",
      });
      expect(policyResult.content[0].text).toContain("Ambient STT policy updated");
      expect(policyResult.details).toMatchObject({
        runtime: "ambient-stt",
        toolName: "ambient_stt_policy_update",
        status: "complete",
        settings: {
          autoSendAfterTranscription: false,
          silenceFinalizeSeconds: 1.2,
        },
      });

      const testResult = await test.execute("test", {
        audioPath: speechPath,
        spokenLanguage: "English",
      });
      expect(testResult.content[0].text).toContain("Ambient STT test succeeded");
      expect(testResult.content[0].text).toContain("Transcript: ambient speech recognition spike");
      expect(testResult.details).toMatchObject({
        runtime: "ambient-stt",
        toolName: "ambient_stt_test",
        status: "complete",
        testStatus: "ready",
        providerCapabilityId: provider.capabilityId,
        language: "English",
        transcript: "ambient speech recognition spike",
        audioPath: speechPath,
        transcriptPath: expect.stringContaining(".ambient/stt/stt-tool-test/"),
        jsonPath: expect.stringContaining(".ambient/stt/stt-tool-test/"),
      });
      expect(permissionRequests.map((request) => request.toolName)).toEqual([
        "ambient_stt_select",
        "ambient_stt_policy_update",
        "ambient_stt_test",
      ]);
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});

function runtimeSttSettings(input: Partial<SttSettings> = {}): SttSettings {
  return {
    enabled: input.enabled ?? true,
    providerCapabilityId: "providerCapabilityId" in input ? input.providerCapabilityId : "ambient-cli:ambient-qwen3-asr:tool:qwen3_asr_transcribe",
    spokenLanguage: input.spokenLanguage ?? "English",
    pushToTalkShortcut: input.pushToTalkShortcut,
    mode: input.mode ?? "push-to-talk",
    autoSendAfterTranscription: input.autoSendAfterTranscription ?? true,
    silenceFinalizeSeconds: input.silenceFinalizeSeconds ?? 0.8,
    noSpeechGate: input.noSpeechGate ?? { enabled: false, rmsThresholdDbfs: -55 },
    bargeIn: input.bargeIn ?? { stopTtsOnSpeech: true, queueWhileAgentRuns: true },
  };
}

function runtimeSttProvider(input: Partial<SttProviderCandidate> = {}): SttProviderCandidate {
  return {
    packageId: input.packageId ?? "ambient-cli:ambient-qwen3-asr",
    packageName: input.packageName ?? "ambient-qwen3-asr",
    command: input.command ?? "qwen3_asr_transcribe",
    capabilityId: input.capabilityId ?? "ambient-cli:ambient-qwen3-asr:tool:qwen3_asr_transcribe",
    providerId: input.providerId ?? "qwen3-asr-0.6b-llamacpp",
    label: input.label ?? "Qwen3-ASR Local",
    description: input.description,
    languages: input.languages ?? ["English", "Spanish", "Japanese"],
    defaultLanguage: input.defaultLanguage ?? "English",
    local: input.local ?? true,
    installed: input.installed ?? true,
    available: input.available ?? true,
    availabilityReason: input.availabilityReason ?? "Installed Ambient CLI package is available.",
    ...(input.diagnostics ? { diagnostics: input.diagnostics } : {}),
    ...(input.validation ? { validation: input.validation } : {}),
  };
}

function runtimeRequiredCliArg(args: string[] | undefined, name: string): string {
  const index = args?.indexOf(name) ?? -1;
  const value = index >= 0 ? args?.[index + 1] : undefined;
  if (!value) throw new Error(`Missing required test argument: ${name}`);
  return value;
}

describe("AgentRuntime MiniCPM-V vision tools", () => {
  it("registers typed setup and analyze tools backed by the MiniCPM adapter surface", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-minicpm-vision-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const thread = store.createThread("vision tools");
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      let latestBrowserScreenshotArtifact: {
        artifactRef: "latest_browser_screenshot";
        artifactPath: string;
        path: string;
        bytes: number;
        width: number;
        height: number;
      } | undefined = {
        artifactRef: "latest_browser_screenshot" as const,
        artifactPath: ".ambient-codex/browser/screenshots/current.png",
        path: join(workspacePath, ".ambient-codex/browser/screenshots/current.png"),
        bytes: 12345,
        width: 1280,
        height: 720,
      };
      createVisionToolExtension({
        threadId: thread.id,
        workspace: store.getWorkspace(),
        getThread: (id) => store.getThread(id),
        getLatestBrowserScreenshotArtifact: () => latestBrowserScreenshotArtifact,
        vision: {
          setupMiniCpm: async (_workspacePath, input) => {
            const stopped = input.action === "stop";
            return {
              provider: "minicpm-v",
              action: input.action ?? "install",
              status: stopped ? "stopped" : "ready",
              packageName: "ambient-minicpm-v-vision",
              installStatuses: [{ packageName: "ambient-minicpm-v-vision", source: "bundled:ambient-minicpm-v-vision", status: "already_installed" }],
              runtimeCandidates: [],
              validation: {
                schemaVersion: "ambient-minicpm-v-provider-validation-v1",
                provider: "minicpm-v",
                packageName: "ambient-minicpm-v-vision",
                status: stopped ? "stopped" : "runtime-ready",
                updatedAt: "2026-05-11T00:00:00.000Z",
                platform: "darwin",
                arch: "arm64",
                lane: "macos-arm64-metal",
                model: "openbmb/MiniCPM-V-4_5-gguf:q4_k_m",
                missingHints: [],
                diagnostics: [],
                ...(stopped
                  ? {
                      runtimeState: {
                        status: "stopped" as const,
                        running: false,
                        recordedAt: "2026-05-11T00:01:00.000Z",
                        previousPid: 4242,
                      },
                    }
                  : {}),
              },
              diagnostics: [],
              nextSteps: stopped ? ["Runtime stopped."] : ["Run visual analysis."],
            };
          },
          analyzeMiniCpm: async (_workspacePath, input) => ({
            provider: "minicpm-v",
            status: "passed",
            packageName: "ambient-minicpm-v-vision",
            task: input.task ?? "ui_review",
            prompt: input.prompt ?? "fixture prompt",
            model: "openbmb/MiniCPM-V-4_5-gguf:q4_k_m",
            durationMs: 42,
            latencyMs: 24,
            summary: "The screenshot shows an Ambient UI fixture.",
            observations: [{
              kind: "layout",
              description: "The sidebar and main content are visible.",
              confidence: "high",
              evidence: "left sidebar and center panel",
            }],
            limitations: ["Fixture mode did not inspect real pixels."],
            image: {
              path: input.image?.path ?? input.imagePath ?? (input.video ? ".ambient/vision/minicpm-v/frames/fake-video-frame.png" : "screen.png"),
              basename: input.video ? "fake-video-frame.png" : "screen.png",
              bytes: 128,
              sha256: "a".repeat(64),
              ...(input.image?.source ? { source: input.image.source } : {}),
              ...(input.video ? { source: "video_frame" as const, label: "fixture clip frame 500ms" } : {}),
            },
            ...(input.video || input.videoPath
              ? {
                  video: {
                    path: input.video?.path ?? input.videoPath ?? "clip.mp4",
                    basename: "clip.mp4",
                    bytes: 4096,
                    sha256: "c".repeat(64),
                    source: input.video?.source ?? "media_artifact",
                    label: input.video?.label ?? "fixture clip",
                    frameTimestampMs: input.video?.frameTimestampMs ?? input.frameTimestampMs ?? 500,
                    frameImagePath: ".ambient/vision/minicpm-v/frames/fake-video-frame.png",
                  },
                  sampledFrames: [{
                    path: ".ambient/vision/minicpm-v/frames/fake-video-frame.png",
                    basename: "fake-video-frame.png",
                    bytes: 128,
                    sha256: "a".repeat(64),
                    source: "video_frame" as const,
                    label: "fixture clip frame 500ms",
                  }],
                }
              : {}),
            ...(input.referenceImage || input.referenceImagePath
              ? {
                  referenceImage: {
                    path: input.referenceImage?.path ?? input.referenceImagePath ?? "reference.png",
                    basename: "reference.png",
                    bytes: 128,
                    sha256: "b".repeat(64),
                  },
                }
              : {}),
            artifacts: { jsonPath: ".ambient/vision/minicpm-v/analysis/fake.json" },
            installStatuses: [{ packageName: "ambient-minicpm-v-vision", source: "bundled:ambient-minicpm-v-vision", status: "already_installed" }],
            commands: [{ command: "analyze", durationMs: 24 }],
            validation: { valid: true, errors: [] },
            redaction: {
              returnedImagePathIsWorkspaceRelative: true,
              stdoutDoesNotContainAbsoluteImagePath: true,
              artifactPathIsWorkspaceRelative: true,
            },
          }),
        },
      })({
        registerTool: (tool: any) => registeredTools.push(tool),
      } as any);

      const setup = registeredTools.find((tool) => tool.name === "ambient_visual_minicpm_setup")!;
      const analyze = registeredTools.find((tool) => tool.name === "ambient_visual_analyze")!;
      expect(setup).toBeDefined();
      expect(analyze).toBeDefined();

      const setupResult = await setup.execute("setup", { action: "repair" });
      expect(setupResult.content[0].text).toContain("MiniCPM-V visual provider setup completed.");
      expect(setupResult.details).toMatchObject({
        runtime: "ambient-vision",
        toolName: "ambient_visual_minicpm_setup",
        setupStatus: "ready",
      });

      const stopResult = await setup.execute("setup-stop", { action: "stop" });
      expect(stopResult.content[0].text).toContain("Runtime state: stopped previous pid 4242");
      expect(stopResult.details).toMatchObject({
        runtime: "ambient-vision",
        toolName: "ambient_visual_minicpm_setup",
        setupStatus: "stopped",
        action: "stop",
      });

      const analysisResult = await analyze.execute("analyze", { imagePath: "screen.png", task: "ui_review" });
      expect(analysisResult.content[0].text).toContain("MiniCPM-V visual analysis completed.");
      expect(analysisResult.content[0].text).toContain("The screenshot shows an Ambient UI fixture.");
      expect(analysisResult.details).toMatchObject({
        runtime: "ambient-vision",
        toolName: "ambient_visual_analyze",
        status: "complete",
        task: "ui_review",
        artifacts: { jsonPath: ".ambient/vision/minicpm-v/analysis/fake.json" },
      });

      const latestScreenshotResult = await analyze.execute("analyze-latest-browser-screenshot", {
        browserScreenshot: { ref: "latest" },
        task: "ui_review",
      });
      expect(latestScreenshotResult.details).toMatchObject({
        image: { path: ".ambient-codex/browser/screenshots/current.png", source: "browser_screenshot" },
        browserScreenshot: { ref: "latest" },
      });

      latestBrowserScreenshotArtifact = undefined;
      const missingLatestResult = await analyze.execute("analyze-missing-latest-browser-screenshot", {
        browserScreenshot: { ref: "latest" },
        task: "ui_review",
      });
      expect(missingLatestResult.isError).toBe(true);
      expect(missingLatestResult.content[0].text).toContain("No latest browser_screenshot artifact is available");
      expect(missingLatestResult.details.diagnostics).toEqual([
        expect.objectContaining({ code: "input-permission-or-path" }),
      ]);

      const comparisonResult = await analyze.execute("analyze", {
        image: { path: "screens/current.png", source: "browser_screenshot", label: "current" },
        referenceImage: { path: "screens/reference.png", source: "chat_attachment", label: "reference" },
        task: "design_comparison",
      });
      expect(comparisonResult.content[0].text).toContain("Reference image: screens/reference.png");
      expect(comparisonResult.details).toMatchObject({
        image: { path: "screens/current.png" },
        referenceImage: { path: "screens/reference.png" },
      });

      const videoResult = await analyze.execute("analyze", {
        video: { path: "clips/run.mp4", source: "media_artifact", label: "fixture clip", frameTimestampMs: 500 },
        task: "video_frame_review",
      });
      expect(videoResult.content[0].text).toContain("Video: clips/run.mp4");
      expect(videoResult.content[0].text).toContain("frame 500ms");
      expect(videoResult.details).toMatchObject({
        video: { path: "clips/run.mp4", frameTimestampMs: 500 },
        sampledFrames: [{ path: ".ambient/vision/minicpm-v/frames/fake-video-frame.png" }],
      });
    } finally {
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});

describe("AgentRuntime Local Deep Research tools", () => {
  it("registers a read-only setup contract tool using current provider preferences", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-local-research-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const currentSettings = {
        webResearch: normalizeWebResearchProviderStackSettings({
          providers: [
            {
              providerId: "ambient-brave-search",
              label: "Brave Search",
              kind: "ambient-cli",
              roles: ["search"],
              status: "enabled",
            },
            {
              providerId: "custom-fetch",
              label: "Custom Fetch",
              kind: "toolhive-mcp",
              roles: ["fetch"],
              status: "enabled",
            },
          ],
          preferences: {
            search: ["ambient-brave-search", "ambient-browser"],
            fetch: ["custom-fetch", "scrapling-mcp-default"],
          },
          fallbackPolicy: { allowBrowserFallback: true },
        }),
      };
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      }, {
        search: {
          readSettings: () => currentSettings as any,
          updateSettings: async (input: any) => input,
        },
      });
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      const updates: string[] = [];
      (runtime as any).createLocalDeepResearchToolExtension("thread-local-research", workspace)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });

      const setup = registeredTools.find((tool) => tool.name === "ambient_local_deep_research_setup")!;
      expect(setup).toBeDefined();
      const result = await setup.execute("local-research-setup", { q8Override: true }, undefined, (update: any) => {
        updates.push(update.content[0]?.text ?? "");
      });

      expect(updates).toEqual(["Reading Local Deep Research setup contract."]);
      expect(result.content[0].text).toContain("Local Deep Research setup status:");
      expect(result.content[0].text).toContain("Provider preferences are captured at call time");
      expect(result.details).toMatchObject({
        runtime: "ambient-local-deep-research",
        toolName: "ambient_local_deep_research_setup",
        status: "complete",
        capabilityId: "local.deep-research.literesearcher",
        llamaRuntime: {
          source: "shared-llama-cpp-runtime",
        },
        installerShape: {
          schemaVersion: "ambient-local-model-installer-shape-v1",
          installerKind: "local-model",
          modelFamily: "LiteResearcher-4B",
          confirmation: {
            requiredForActions: ["install", "repair", "smoke"],
          },
          server: {
            host: "127.0.0.1",
            port: "auto",
          },
          lifecycle: {
            progressEvent: "local-deep-research-install-progress",
          },
        },
        managedAssets: {
          schemaVersion: "ambient-local-deep-research-managed-assets-v1",
          model: {
            status: "missing",
            profileId: expect.stringMatching(/^literesearcher-4b-/),
          },
        },
        providerSnapshot: {
          searchOrder: ["ambient-brave-search", "ambient-browser", "exa-mcp-default"],
          fetchOrder: ["custom-fetch", "scrapling-mcp-default", "exa-mcp-default", "ambient-browser"],
        },
      });
      expect(["accepted", "warned", "rejected"]).toContain(result.details.modelSelection.q8OverrideDecision);
      expect(result.details.nextActions).toEqual(expect.arrayContaining([
        expect.stringContaining("Install the selected LiteResearcher GGUF profile"),
      ]));
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("surfaces active sub-agent local runtime leases in Local Deep Research setup", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-local-research-lease-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const runtimeStateDir = join(workspacePath, ".ambient/local-model-runtime/local-text-runtime");
      await mkdir(runtimeStateDir, { recursive: true });
      await writeFile(join(runtimeStateDir, "runtime-state.json"), JSON.stringify({
        schemaVersion: "ambient-local-model-runtime-state-v1",
        runtimeId: "local-text-runtime",
        providerId: "local",
        modelId: "local/text-4b",
        profileId: "local-text-4b-q4",
        pid: process.pid,
        status: "running",
        healthUrl: "http://127.0.0.1:43123/health",
        ownerThreadId: "parent-thread",
        parentThreadId: "parent-thread",
        subagentThreadId: "child-thread",
        ownerDisplayName: "Review worker",
        estimatedResidentMemoryBytes: 6 * gib,
        startedAt: "2026-06-05T00:00:00.000Z",
        lastUsedAt: "2026-06-05T00:00:00.000Z",
      }, null, 2), "utf8");
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      }, {
        localModelResidentProcesses: (workspacePath) => detectLocalLlamaResidentProcesses(workspacePath, {
          includeUntracked: false,
        }),
        search: {
          readSettings: () => localDeepResearchProviderSnapshotSettings("ambient-brave-search", "custom-fetch") as any,
          updateSettings: async (input: any) => input,
        },
      });
      (runtime as any).localModelRuntimeManager = {
        activeRuntimeLeases: () => [{
          schemaVersion: "ambient-local-runtime-lease-v1",
          leaseId: "lease-review",
          parentThreadId: "parent-thread",
          subagentThreadId: "child-thread",
          ownerDisplayName: "Review worker",
          modelRuntimeId: "local-text-runtime",
          modelProfileId: "local-text-4b-q4",
          modelId: "local/text-4b",
          providerId: "local",
          capabilityKind: "local-text",
          estimatedResidentMemoryBytes: 6 * gib,
          pid: process.pid,
          endpoint: "http://127.0.0.1:43123/health",
          acquiredAt: "2026-06-05T00:00:00.000Z",
          lastHeartbeatAt: "2026-06-05T00:01:00.000Z",
          status: "running",
        }],
      };

      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      (runtime as any).createLocalDeepResearchToolExtension("thread-local-research", workspace)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const setup = registeredTools.find((tool) => tool.name === "ambient_local_deep_research_setup")!;
      const result = await setup.execute("local-research-setup", { q8Override: true });

      expect(result.content[0].text).toContain("Local runtime inventory: 2 runtimes; 1 active lease; In use by sub-agent Review worker.");
      expect(result.details.localRuntimeInventory.activeLeases).toEqual([
        expect.objectContaining({
          leaseId: "lease-review",
          parentThreadId: "parent-thread",
          subagentThreadId: "child-thread",
          ownerDisplayName: "Review worker",
        }),
      ]);
      expect(result.details.localRuntimeInventory.entries).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: `local-text:local-text-runtime:${process.pid}`,
          owners: [
            {
              leaseId: "lease-review",
              parentThreadId: "parent-thread",
              subagentThreadId: "child-thread",
              displayName: "sub-agent Review worker",
              status: "running",
            },
          ],
          stopDecision: expect.objectContaining({
            ordinaryStopAllowed: false,
            reason: "In use by sub-agent Review worker.",
            blockerLeaseIds: ["lease-review"],
            forceTerminationAllowed: true,
            forceRequiresSubagentCancellation: true,
            untracked: false,
          }),
        }),
      ]));
      expect(result.details.localModelResources).toMatchObject({
        requestedLaunch: expect.objectContaining({
          capability: "local-deep-research",
        }),
      });
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("cancels owning sub-agents when resolving forced local runtime ownership", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-local-ownership-resolver-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const parent = store.createThread("Parent with local runtime child");
      const assistant = store.addMessage({
        threadId: parent.id,
        role: "assistant",
        content: "",
        metadata: { status: "streaming", runtime: "pi" },
      });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const featureFlags = resolveAmbientFeatureFlags({
        settings: store.getFeatureFlagSettings(),
        generatedAt: "2026-06-06T00:00:00.000Z",
      });
      const created = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Local review worker",
        roleId: "reviewer",
        roleProfileSnapshot: getDefaultSubagentRoleProfile("reviewer"),
        canonicalTaskPath: "root/0:reviewer",
        featureFlagSnapshot: featureFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-06T00:00:00.000Z"),
        dependencyMode: "required",
      });
      const running = store.markSubagentRunStatus(created.id, "running");
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });

      const result = await (runtime as any).resolveLocalRuntimeOwnershipForForcedAction({
        schemaVersion: "ambient-local-runtime-ownership-resolution-request-v1",
        action: "stop",
        runtimeId: "local-text-runtime",
        entryId: "local-text:local-text-runtime:5001",
        modelRuntimeId: "local-text-runtime",
        modelProfileId: "local-text-4b-q4",
        modelId: "local/text-4b",
        providerId: "local",
        capabilityKind: "local-text",
        blockerLeaseIds: ["lease-review"],
        affectedSubagents: [{
          leaseId: "lease-review",
          parentThreadId: parent.id,
          subagentThreadId: running.childThreadId,
          subagentRunId: running.id,
          displayName: "sub-agent Review worker",
          status: "running",
          modelRuntimeId: "local-text-runtime",
          modelProfileId: "local-text-4b-q4",
          modelId: "local/text-4b",
          providerId: "local",
          capabilityKind: "local-text",
        }],
        activeLeases: [{
          schemaVersion: "ambient-local-runtime-lease-v1",
          leaseId: "lease-review",
          parentThreadId: parent.id,
          subagentThreadId: running.childThreadId,
          subagentRunId: running.id,
          ownerDisplayName: "Review worker",
          modelRuntimeId: "local-text-runtime",
          modelProfileId: "local-text-4b-q4",
          modelId: "local/text-4b",
          providerId: "local",
          capabilityKind: "local-text",
          estimatedResidentMemoryBytes: 6 * gib,
          pid: process.pid,
          endpoint: "http://127.0.0.1:43123/health",
          acquiredAt: "2026-06-06T00:00:00.000Z",
          lastHeartbeatAt: "2026-06-06T00:01:00.000Z",
          status: "running",
        }],
        reason: "In use by sub-agent Review worker.",
      });

      expect(result).toMatchObject({
        schemaVersion: "ambient-local-runtime-ownership-resolution-result-v1",
        action: "stop",
        runtimeId: "local-text-runtime",
        status: "resolved",
        resolvedLeaseIds: ["lease-review"],
        resolvedChildRunIds: [running.id],
      });
      expect(store.getSubagentRun(running.id).status).toBe("cancelled");
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "subagent.lifecycle_interrupted",
          payload: expect.objectContaining({
            childRunId: running.id,
            childThreadId: running.childThreadId,
            status: "cancelled",
            source: "parent_cancel_request",
            toolCallId: "local-runtime-stop-ownership",
          }),
        }),
      ]));
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("blocks forced local runtime ownership resolution when the lease cannot be mapped to a child run", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-local-ownership-blocked-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });

      const result = await (runtime as any).resolveLocalRuntimeOwnershipForForcedAction({
        schemaVersion: "ambient-local-runtime-ownership-resolution-request-v1",
        action: "restart",
        runtimeId: "local-text-runtime",
        entryId: "local-text:local-text-runtime:5001",
        modelRuntimeId: "local-text-runtime",
        capabilityKind: "local-text",
        blockerLeaseIds: ["lease-missing"],
        affectedSubagents: [{
          leaseId: "lease-missing",
          subagentThreadId: "missing-child-thread",
          displayName: "sub-agent Missing worker",
          status: "running",
          capabilityKind: "local-text",
        }],
        activeLeases: [],
        reason: "In use by sub-agent Missing worker.",
      });

      expect(result).toMatchObject({
        schemaVersion: "ambient-local-runtime-ownership-resolution-result-v1",
        action: "restart",
        runtimeId: "local-text-runtime",
        status: "blocked",
        resolvedLeaseIds: [],
        resolvedChildRunIds: [],
        blockedLeaseIds: ["lease-missing"],
      });
      expect(result.reason).toContain("No active sub-agent run maps to child thread missing-child-thread.");
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("blocks forced local runtime ownership resolution when exact lease run metadata mismatches the child thread", async () => {
    const fixture = await createAgentRuntimeLocalRuntimeOwnershipFixture("ambient-runtime-local-ownership-run-mismatch-");
    try {
      const result = await (fixture.runtime as any).resolveLocalRuntimeOwnershipForForcedAction({
        schemaVersion: "ambient-local-runtime-ownership-resolution-request-v1",
        action: "stop",
        runtimeId: "local-text-runtime",
        entryId: "local-text:local-text-runtime:5001",
        modelRuntimeId: "local-text-runtime",
        capabilityKind: "local-text",
        blockerLeaseIds: ["lease-review"],
        affectedSubagents: [{
          leaseId: "lease-review",
          parentThreadId: fixture.childRun.parentThreadId,
          subagentThreadId: fixture.childRun.childThreadId,
          subagentRunId: "wrong-run",
          displayName: "sub-agent Review worker",
          status: "running",
          capabilityKind: "local-text",
        }],
        activeLeases: [{
          ...fixture.activeLeases()[0]!,
          subagentRunId: "wrong-run",
        }],
        reason: "In use by sub-agent Review worker.",
      });

      expect(result).toMatchObject({
        schemaVersion: "ambient-local-runtime-ownership-resolution-result-v1",
        action: "stop",
        runtimeId: "local-text-runtime",
        status: "blocked",
        resolvedLeaseIds: [],
        resolvedChildRunIds: [],
        blockedLeaseIds: ["lease-review"],
      });
      expect(result.reason).toContain(`No active sub-agent run maps to run wrong-run / child thread ${fixture.childRun.childThreadId}.`);
      expect(fixture.store.getSubagentRun(fixture.childRun.id).status).toBe("running");
    } finally {
      await fixture.cleanup();
    }
  });

  it("forces Stop by cancelling the owning sub-agent before the managed local runtime action", async () => {
    const fixture = await createAgentRuntimeLocalRuntimeOwnershipFixture("ambient-runtime-local-action-stop-");
    try {
      const stopRuntime = vi.fn(async (input: any) => {
        await writeAgentRuntimeLocalTextRuntimeState(fixture.workspacePath, { status: "stopped" });
        return {
          schemaVersion: "ambient-local-model-runtime-stop-v1" as const,
          status: "stopped" as const,
          runtimeId: input.runtimeId,
          forceRequested: input.force === true,
          pid: process.pid,
          stoppedAt: "2026-06-06T00:02:00.000Z",
        };
      });
      (fixture.runtime as any).localModelRuntimeManager = {
        activeRuntimeLeases: () => fixture.activeLeases(),
        stopRuntime,
      };

      const result = await fixture.runtime.runLocalModelRuntimeLifecycleAction({
        action: "stop",
        runtimeId: "local-text-runtime",
        force: true,
      });

      expect(stopRuntime).toHaveBeenCalledTimes(1);
      expect(stopRuntime).toHaveBeenCalledWith(expect.objectContaining({
        runtimeId: "local-text-runtime",
        force: true,
      }));
      expect(result).toMatchObject({
        schemaVersion: "ambient-local-model-runtime-lifecycle-action-v1",
        action: "stop",
        runtimeId: "local-text-runtime",
        status: "stopped",
        forceRequested: true,
        before: {
          inventory: {
            activeLeases: [
              expect.objectContaining({ leaseId: "lease-review" }),
            ],
          },
        },
        after: {
          inventory: {
            activeLeases: [],
          },
        },
      });
      expect(result.message).toContain("Ownership resolution resolved");
      expect(result.message).toContain("Cancelled 1 sub-agent run before forced local runtime Stop");
      expect(fixture.store.getSubagentRun(fixture.childRun.id).status).toBe("cancelled");
      expect(fixture.store.listSubagentParentMailboxEventsForParentRun(fixture.parentRun.id)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "subagent.lifecycle_interrupted",
          payload: expect.objectContaining({
            childRunId: fixture.childRun.id,
            childThreadId: fixture.childRun.childThreadId,
            source: "parent_cancel_request",
            toolCallId: "local-runtime-stop-ownership",
          }),
        }),
      ]));
    } finally {
      await fixture.cleanup();
    }
  });

  it("keeps forced Stop blocked when the owning sub-agent is cancelled but its local runtime lease remains active", async () => {
    const fixture = await createAgentRuntimeLocalRuntimeOwnershipFixture("ambient-runtime-local-action-stop-retained-lease-");
    try {
      const retainedLease = fixture.activeLeases()[0]!;
      const stopRuntime = vi.fn(async () => {
        throw new Error("Stop should not run while the resolved lease remains active.");
      });
      (fixture.runtime as any).localModelRuntimeManager = {
        activeRuntimeLeases: () => [retainedLease],
        stopRuntime,
      };

      const result = await fixture.runtime.runLocalModelRuntimeLifecycleAction({
        action: "stop",
        runtimeId: "local-text-runtime",
        force: true,
      });

      expect(stopRuntime).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        schemaVersion: "ambient-local-model-runtime-lifecycle-action-v1",
        action: "stop",
        runtimeId: "local-text-runtime",
        status: "blocked",
        forceRequested: true,
      });
      expect(result.message).toContain("Ownership resolution blocked");
      expect(result.message).toContain("lease lease-review still active");
      expect(fixture.store.getSubagentRun(fixture.childRun.id).status).toBe("cancelled");
    } finally {
      await fixture.cleanup();
    }
  });

  it("forces Restart by cancelling the owning sub-agent before the managed local runtime action", async () => {
    const fixture = await createAgentRuntimeLocalRuntimeOwnershipFixture("ambient-runtime-local-action-restart-");
    try {
      const restartRuntime = vi.fn(async (input: any) => ({
        schemaVersion: "ambient-local-model-runtime-restart-v1" as const,
        status: "restarted" as const,
        runtimeId: input.runtimeId,
        forceRequested: input.force === true,
        previousPid: process.pid,
        pid: process.pid,
        restartedAt: "2026-06-06T00:02:00.000Z",
      }));
      (fixture.runtime as any).localModelRuntimeManager = {
        activeRuntimeLeases: () => fixture.activeLeases(),
        restartRuntime,
      };

      const result = await fixture.runtime.runLocalModelRuntimeLifecycleAction({
        action: "restart",
        runtimeId: "local-text-runtime",
        force: true,
      });

      expect(restartRuntime).toHaveBeenCalledTimes(1);
      expect(restartRuntime).toHaveBeenCalledWith(expect.objectContaining({
        runtimeId: "local-text-runtime",
        force: true,
      }));
      expect(result).toMatchObject({
        schemaVersion: "ambient-local-model-runtime-lifecycle-action-v1",
        action: "restart",
        runtimeId: "local-text-runtime",
        status: "restarted",
        forceRequested: true,
        before: {
          inventory: {
            activeLeases: [
              expect.objectContaining({ leaseId: "lease-review" }),
            ],
          },
        },
        after: {
          inventory: {
            activeLeases: [],
          },
        },
      });
      expect(result.message).toContain("Ownership resolution resolved");
      expect(result.message).toContain("Cancelled 1 sub-agent run before forced local runtime Restart");
      expect(fixture.store.getSubagentRun(fixture.childRun.id).status).toBe("cancelled");
      expect(fixture.store.listSubagentParentMailboxEventsForParentRun(fixture.parentRun.id)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "subagent.lifecycle_interrupted",
          payload: expect.objectContaining({
            childRunId: fixture.childRun.id,
            childThreadId: fixture.childRun.childThreadId,
            source: "parent_cancel_request",
            toolCallId: "local-runtime-restart-ownership",
          }),
        }),
      ]));
    } finally {
      await fixture.cleanup();
    }
  });

  it("brokers Local Deep Research install permission with computed installer shape details", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-local-research-permission-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const thread = store.updateThreadSettings(store.createThread("local research install").id, { permissionMode: "workspace" });
      const requester = vi.fn(async (_request: any) => ({ allowed: true, mode: "allow_once" as const }));
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: requester,
        denyThread: () => undefined,
      });

      await expect((runtime as any).resolveToolCallPermission(thread.id, workspace, "ambient_local_deep_research_setup", {
        action: "install",
      })).resolves.toBeUndefined();

      expect(requester).toHaveBeenCalledTimes(1);
      const request = requester.mock.calls[0][0];
      expect(request).toMatchObject({
        title: "Install Local Deep Research model?",
        risk: "plugin-tool",
        grantActionKind: "plugin_tool_execute",
        grantTargetKind: "tool",
      });
      expect(request.detail).toContain("Model family: LiteResearcher-4B");
      expect(request.detail).toContain("Expected disk:");
      expect(request.detail).toContain("Estimated resident memory:");
      expect(request.detail).toContain("Server: 127.0.0.1:auto");
      expect(request.detail).toContain("Progress: local-deep-research-install-progress events");
      expect(request.grantConditions).toMatchObject({
        operation: "ambient_local_deep_research_setup",
        action: "install",
        installerShapeSchemaVersion: "ambient-local-model-installer-shape-v1",
        serverHost: "127.0.0.1",
        serverPort: "auto",
      });
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("registers a Local Deep Research run tool that refreshes readiness and uses the run service boundary", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-local-research-run-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      await installSyntheticLocalDeepResearchAssets(workspacePath);
      const runFeature = vi.fn(async (input: any): Promise<LocalDeepResearchRunServiceResult> => ({
        schemaVersion: "ambient-local-deep-research-service-result-v1",
        status: "completed",
        finalText: "Local synthesis with citation https://example.com/source",
        run: {
          schemaVersion: "ambient-local-deep-research-run-v1",
          status: "completed",
          question: input.question,
          setupStatus: input.setup.status,
          modelProfileId: input.setup.modelInstall.selectedProfileId,
          contextTokens: input.setup.modelInstall.contextTokens,
          providerSnapshot: input.setup.providerSnapshot,
          finalSynthesis: {
            schemaVersion: "ambient-local-deep-research-final-synthesis-v1",
            mode: "local",
            sourceLimit: 12,
            evidencePreviewChars: 1200,
          },
          finalSynthesisReserveTurns: 3,
          toolBudget: localDeepResearchToolBudgetState(normalizeLocalDeepResearchRunBudget(input.localResearchBudget, {
            effort: "custom",
            maxToolCalls: input.maxToolCalls,
            source: input.localResearchBudget ? input.localResearchBudget.source : "tool_input",
          }), 0),
          messages: [],
          toolExecutions: [],
          finalText: "Local synthesis with citation https://example.com/source",
        },
        artifacts: {
          jsonPath: ".ambient/local-deep-research/runs/test.json",
          markdownPath: ".ambient/local-deep-research/runs/test.md",
          jsonBytes: 100,
          markdownBytes: 80,
        },
        localModelResourcePreflight: {
          allowed: true,
          outcome: "unlimited",
          reason: input.setup.localModelResources.policyDecision.reason,
          registry: input.setup.localModelResources,
        },
        llamaServer: {
          endpointUrl: "http://127.0.0.1:43123",
          pid: 1234,
          profileId: input.setup.modelInstall.selectedProfileId,
          modelPath: input.managedAssets.model.cachePath,
          runtimeBinaryPath: input.managedAssets.runtime.binaryPath,
          stateDir: ".ambient/local-deep-research/server",
          logPath: "llama-server.log",
          stdoutPath: "llama-server.stdout.log",
          stderrPath: "llama-server.stderr.log",
        },
        release: { status: "released" },
      }));
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      }, {
        localModelResidentProcesses: async () => [],
        search: {
          readSettings: () => ({
            webResearch: normalizeWebResearchProviderStackSettings({
              preferences: {
                search: ["exa-mcp-default", "ambient-browser"],
                fetch: ["scrapling-mcp-default", "exa-mcp-default", "ambient-browser"],
              },
            }),
          }) as any,
          updateSettings: async (input: any) => input,
        },
        localDeepResearch: {
          buildSetupContract: (_workspacePath: string, input: any) => buildLocalDeepResearchSetupContract({
            ...input,
            runtimeBinaryPath: undefined,
            runtimeInstalled: true,
          }),
          run: runFeature,
        },
      });
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      const updates: string[] = [];
      (runtime as any).createLocalDeepResearchToolExtension("thread-local-research-run", workspace)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });

      expect(registeredTools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
        "ambient_local_deep_research_setup",
        "ambient_local_deep_research_run",
      ]));
      const run = registeredTools.find((tool) => tool.name === "ambient_local_deep_research_run")!;
      const result = await run.execute("local-research-run", {
        question: "Synthesize the local research path.",
        maxToolCalls: 3,
        localResearchBudget: normalizeLocalDeepResearchRunBudget(undefined, {
          effort: "custom",
          maxToolCalls: 3,
          source: "tool_input",
        }),
      }, undefined, (update: any) => {
        updates.push(update.content[0]?.text ?? "");
      });
      expect(updates).toEqual([
        "Preparing Local Deep Research run.",
        "Local Deep Research setup is ready; checking local resource pressure.",
        "Starting LiteResearcher through Ambient Local Deep Research.",
      ]);
      expect(runFeature).toHaveBeenCalledWith(expect.objectContaining({
        workspacePath,
        question: "Synthesize the local research path.",
        maxToolCalls: 3,
        localResearchBudget: expect.objectContaining({
          maxToolCalls: 3,
          source: "tool_input",
        }),
        setup: expect.objectContaining({ status: "ready" }),
        managedAssets: expect.objectContaining({
          model: expect.objectContaining({ status: "present" }),
          runtime: expect.objectContaining({ status: "present" }),
        }),
        broker: expect.objectContaining({
          search: expect.any(Function),
          visit: expect.any(Function),
        }),
      }));
      expect(result.content[0].text).toContain("Local Deep Research completed.");
      expect(result.details).toMatchObject({
        runtime: "ambient-local-deep-research",
        toolName: "ambient_local_deep_research_run",
        status: "completed",
        setupStatus: "ready",
        artifacts: {
          jsonPath: ".ambient/local-deep-research/runs/test.json",
          markdownPath: ".ambient/local-deep-research/runs/test.md",
        },
        providerSnapshot: {
          searchOrder: ["exa-mcp-default", "ambient-browser"],
          fetchOrder: ["scrapling-mcp-default", "exa-mcp-default", "ambient-browser"],
        },
      });
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("uses Local Deep Research provider order when executing multiple configured providers", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-local-research-provider-order-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const thread = store.createThread("local research provider order");
      await installSyntheticLocalDeepResearchAssets(workspacePath);
      let localDeepResearchSettings: LocalDeepResearchSettings = normalizeLocalDeepResearchSettings({
        providerStack: {
          providers: [
            {
              providerId: "local.deep-research.fixture",
              label: "Fixture Research",
              kind: "test-adapter",
              roles: ["research"],
              status: "enabled",
            },
          ],
          preferences: {
            research: ["local.deep-research.literesearcher", "local.deep-research.fixture"],
          },
        },
      });
      const runObservations: Array<{ activeProviderId?: string; providerOrder: string[] }> = [];
      const runFeature = vi.fn(async (input: any): Promise<LocalDeepResearchRunServiceResult> => {
        runObservations.push({
          activeProviderId: input.setup.providerSnapshot.activeProvider?.providerId,
          providerOrder: [...input.setup.providerSnapshot.providerOrder],
        });
        const activeProviderId = input.setup.providerSnapshot.activeProvider?.providerId ?? "none";
        return {
          schemaVersion: "ambient-local-deep-research-service-result-v1",
          status: "completed",
          finalText: `Completed with ${activeProviderId}`,
          run: {
            schemaVersion: "ambient-local-deep-research-run-v1",
            status: "completed",
            question: input.question,
            setupStatus: input.setup.status,
            modelProfileId: input.setup.modelInstall.selectedProfileId,
            contextTokens: input.setup.modelInstall.contextTokens,
            providerSnapshot: input.setup.providerSnapshot,
            finalSynthesis: {
              schemaVersion: "ambient-local-deep-research-final-synthesis-v1",
              mode: "local",
              sourceLimit: 12,
              evidencePreviewChars: 1200,
            },
            finalSynthesisReserveTurns: 3,
            toolBudget: localDeepResearchToolBudgetState(normalizeLocalDeepResearchRunBudget(input.localResearchBudget, {
              effort: "custom",
              maxToolCalls: input.maxToolCalls,
              source: input.localResearchBudget ? input.localResearchBudget.source : "tool_input",
            }), 0),
            messages: [],
            toolExecutions: [],
            finalText: `Completed with ${activeProviderId}`,
          },
          artifacts: {
            jsonPath: `.ambient/local-deep-research/runs/${activeProviderId}.json`,
            markdownPath: `.ambient/local-deep-research/runs/${activeProviderId}.md`,
            jsonBytes: 120,
            markdownBytes: 80,
          },
          localModelResourcePreflight: {
            allowed: true,
            outcome: "unlimited",
            reason: input.setup.localModelResources.policyDecision.reason,
            registry: input.setup.localModelResources,
          },
          llamaServer: {
            endpointUrl: "http://127.0.0.1:43123",
            pid: 1234,
            profileId: input.setup.modelInstall.selectedProfileId,
            modelPath: input.managedAssets.model.cachePath,
            runtimeBinaryPath: input.managedAssets.runtime.binaryPath,
            stateDir: ".ambient/local-deep-research/server",
            logPath: "llama-server.log",
            stdoutPath: "llama-server.stdout.log",
            stderrPath: "llama-server.stderr.log",
          },
          release: { status: "released" },
        };
      });
      const permissionRequester = vi.fn(async () => ({ allowed: true, mode: "allow_once" as const }));
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: permissionRequester,
        denyThread: () => undefined,
      }, {
        localModelResidentProcesses: async () => [],
        search: {
          readSettings: () => ({
            webResearch: normalizeWebResearchProviderStackSettings({
              preferences: {
                search: ["exa-mcp-default", "ambient-browser"],
                fetch: ["scrapling-mcp-default", "exa-mcp-default", "ambient-browser"],
              },
            }),
          }) as any,
          updateSettings: async (input: any) => input,
        },
        localDeepResearch: {
          readSettings: () => localDeepResearchSettings,
          updateSettings: async (input) => {
            localDeepResearchSettings = normalizeLocalDeepResearchSettings(input);
            return localDeepResearchSettings;
          },
          buildSetupContract: (_workspacePath: string, input: any) => buildLocalDeepResearchSetupContract({
            ...input,
            runtimeBinaryPath: undefined,
            runtimeInstalled: true,
          }),
          run: runFeature,
        },
      });
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      (runtime as any).createLocalDeepResearchToolExtension(thread.id, workspace)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const update = registeredTools.find((tool) => tool.name === "ambient_local_deep_research_provider_update")!;
      const run = registeredTools.find((tool) => tool.name === "ambient_local_deep_research_run")!;

      await update.execute("prefer-fixture", {
        action: "prefer_provider",
        providerId: "local.deep-research.fixture",
        reason: "Exercise alternate local provider.",
      });
      const fixtureRun = await run.execute("run-fixture", { question: "Run through the fixture provider." });

      await update.execute("prefer-lite", {
        action: "prefer_provider",
        providerId: "local.deep-research.literesearcher",
        reason: "Return to the first-party default.",
      });
      const liteRun = await run.execute("run-lite", { question: "Run through LiteResearcher." });

      expect(permissionRequester).toHaveBeenCalledTimes(2);
      expect(runObservations).toEqual([
        {
          activeProviderId: "local.deep-research.fixture",
          providerOrder: ["local.deep-research.fixture", "local.deep-research.literesearcher"],
        },
        {
          activeProviderId: "local.deep-research.literesearcher",
          providerOrder: ["local.deep-research.literesearcher", "local.deep-research.fixture"],
        },
      ]);
      expect(fixtureRun.details).toMatchObject({
        status: "completed",
        activeProvider: { providerId: "local.deep-research.fixture" },
        providerOrder: ["local.deep-research.fixture", "local.deep-research.literesearcher"],
        artifacts: { jsonPath: ".ambient/local-deep-research/runs/local.deep-research.fixture.json" },
      });
      expect(liteRun.details).toMatchObject({
        status: "completed",
        activeProvider: { providerId: "local.deep-research.literesearcher" },
        providerOrder: ["local.deep-research.literesearcher", "local.deep-research.fixture"],
        artifacts: { jsonPath: ".ambient/local-deep-research/runs/local.deep-research.literesearcher.json" },
      });
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("keeps Local Deep Research broker routing on the run-start provider snapshot", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-local-research-provider-snapshot-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      await installSyntheticLocalDeepResearchAssets(workspacePath);
      let currentSettings = localDeepResearchProviderSnapshotSettings("snapshot-search", "snapshot-fetch");
      const brokerObservations: Array<{ selectedProvider?: string; attempts: Array<{ providerId: string; status: string }> }> = [];
      const runFeature = vi.fn(async (input: any): Promise<LocalDeepResearchRunServiceResult> => {
        expect(input.setup.providerSnapshot.searchOrder).toEqual(["snapshot-search"]);
        expect(input.setup.providerSnapshot.fetchOrder).toEqual(["snapshot-fetch"]);

        currentSettings = localDeepResearchProviderSnapshotSettings("next-search", "next-fetch");
        brokerObservations.push(await input.broker.search({ query: "provider snapshot probe", maxResults: 1 }));
        brokerObservations.push(await input.broker.visit({ url: "https://example.com/provider-snapshot", maxCharacters: 200 }));

        return {
          schemaVersion: "ambient-local-deep-research-service-result-v1",
          status: "completed",
          finalText: "Provider snapshot route held for the in-flight run.",
          run: {
            schemaVersion: "ambient-local-deep-research-run-v1",
            status: "completed",
            question: input.question,
            setupStatus: input.setup.status,
            modelProfileId: input.setup.modelInstall.selectedProfileId,
            contextTokens: input.setup.modelInstall.contextTokens,
            providerSnapshot: input.setup.providerSnapshot,
            finalSynthesis: {
              schemaVersion: "ambient-local-deep-research-final-synthesis-v1",
              mode: "local",
              sourceLimit: 12,
              evidencePreviewChars: 1200,
            },
            finalSynthesisReserveTurns: 3,
            toolBudget: localDeepResearchToolBudgetState(normalizeLocalDeepResearchRunBudget(input.localResearchBudget, {
              effort: "custom",
              maxToolCalls: input.maxToolCalls,
              source: input.localResearchBudget ? input.localResearchBudget.source : "tool_input",
            }), 0),
            messages: [],
            toolExecutions: [],
            finalText: "Provider snapshot route held for the in-flight run.",
          },
          artifacts: {
            jsonPath: ".ambient/local-deep-research/runs/provider-snapshot.json",
            markdownPath: ".ambient/local-deep-research/runs/provider-snapshot.md",
            jsonBytes: 100,
            markdownBytes: 80,
          },
          localModelResourcePreflight: {
            allowed: true,
            outcome: "unlimited",
            reason: input.setup.localModelResources.policyDecision.reason,
            registry: input.setup.localModelResources,
          },
          llamaServer: {
            endpointUrl: "http://127.0.0.1:43123",
            pid: 1234,
            profileId: input.setup.modelInstall.selectedProfileId,
            modelPath: input.managedAssets.model.cachePath,
            runtimeBinaryPath: input.managedAssets.runtime.binaryPath,
            stateDir: ".ambient/local-deep-research/server",
            logPath: "llama-server.log",
            stdoutPath: "llama-server.stdout.log",
            stderrPath: "llama-server.stderr.log",
          },
          release: { status: "released" },
        };
      });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      }, {
        localModelResidentProcesses: async () => [],
        search: {
          readSettings: () => currentSettings as any,
          updateSettings: async (input: any) => input,
        },
        localDeepResearch: {
          buildSetupContract: (_workspacePath: string, input: any) => buildLocalDeepResearchSetupContract({
            ...input,
            runtimeBinaryPath: undefined,
            runtimeInstalled: true,
          }),
          run: runFeature,
        },
      });
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      (runtime as any).createLocalDeepResearchToolExtension("thread-local-research-provider-snapshot", workspace)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });

      const run = registeredTools.find((tool) => tool.name === "ambient_local_deep_research_run")!;
      const result = await run.execute("local-research-provider-snapshot", {
        question: "Check provider snapshot stability.",
      });

      expect(brokerObservations).toHaveLength(2);
      expect(brokerObservations[0].attempts.map((attempt) => attempt.providerId)).toEqual(["snapshot-search"]);
      expect(brokerObservations[1].attempts.map((attempt) => attempt.providerId)).toEqual(["snapshot-fetch"]);
      expect(brokerObservations.flatMap((observation) => observation.attempts.map((attempt) => attempt.providerId))).not.toContain("next-search");
      expect(brokerObservations.flatMap((observation) => observation.attempts.map((attempt) => attempt.providerId))).not.toContain("next-fetch");
      expect(result.details.providerSnapshot).toMatchObject({
        searchOrder: ["snapshot-search"],
        fetchOrder: ["snapshot-fetch"],
      });
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("runs Local Deep Research setup install through the managed asset install boundary", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-local-research-install-"));
    const store = new ProjectStore();
    const emitted: any[] = [];
    try {
      const workspace = store.openWorkspace(workspacePath);
      const installFeature = vi.fn(async (input: any): Promise<LocalDeepResearchInstallServiceResult> => {
        await installSyntheticLocalDeepResearchAssets(workspacePath);
        const managedAssets = await detectLocalDeepResearchManagedAssets(workspacePath, {
          selectedProfileId: input.setup.modelInstall.selectedProfileId,
        });
        return {
          schemaVersion: "ambient-local-deep-research-install-result-v1",
          status: "installed",
          modelInstall: {
            attempted: true,
            status: "installed",
            profileId: input.setup.modelInstall.selectedProfileId,
            filename: input.setup.modelInstall.filename,
            sourceUrl: input.setup.modelInstall.sourceUrl,
            cachePath: managedAssets.model.cachePath,
            bytes: input.setup.modelInstall.sizeBytes,
            sha256: input.setup.modelInstall.sha256,
            downloadStatus: "downloaded",
            downloadDurationMs: 25,
            missingHints: [],
          },
          runtimeInstall: {
            attempted: true,
            status: "already-installed",
            source: "managed-download",
            artifactId: managedAssets.runtime.artifactId,
            binaryPath: managedAssets.runtime.binaryPath,
            cacheSubdir: managedAssets.runtime.cacheSubdir,
            missingHints: [],
          },
          managedAssets,
          nextActions: ["Run Local Deep Research setup status, then start a bounded validation research run."],
        };
      });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => (
        {
          isDestroyed: () => false,
          webContents: {
            isDestroyed: () => false,
            isCrashed: () => false,
            send: (_channel: string, event: any) => emitted.push(event),
          },
        } as any
      ), {
        request: vi.fn(),
        denyThread: () => undefined,
      }, {
        localModelResidentProcesses: async () => [],
        search: {
          readSettings: () => ({
            webResearch: normalizeWebResearchProviderStackSettings({
              preferences: {
                search: ["exa-mcp-default", "ambient-browser"],
                fetch: ["scrapling-mcp-default", "ambient-browser"],
              },
            }),
          }) as any,
          updateSettings: async (input: any) => input,
        },
        localDeepResearch: {
          buildSetupContract: (_workspacePath: string, input: any) => buildLocalDeepResearchSetupContract({
            ...input,
            runtimeBinaryPath: undefined,
            runtimeInstalled: Boolean(input.runtimeInstalled),
          }),
          install: installFeature,
        },
      });
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      const updates: string[] = [];
      (runtime as any).createLocalDeepResearchToolExtension("thread-local-research-install", workspace)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });

      const setup = registeredTools.find((tool) => tool.name === "ambient_local_deep_research_setup")!;
      const result = await setup.execute("local-research-install", {
        action: "install",
      }, undefined, (update: any) => {
        updates.push(update.content[0]?.text ?? "");
      });

      expect(updates).toEqual([
        "Preparing Local Deep Research install.",
        "Installing Ambient-managed Local Deep Research assets.",
      ]);
      expect(installFeature).toHaveBeenCalledWith(expect.objectContaining({
        workspacePath,
        setup: expect.objectContaining({ status: "needs-install" }),
        installModel: true,
        installRuntime: true,
      }));
      expect(result.content[0].text).toContain("Local Deep Research install installed.");
      expect(result.content[0].text).toContain("Local Deep Research setup status: ready.");
      expect(result.details).toMatchObject({
        runtime: "ambient-local-deep-research",
        toolName: "ambient_local_deep_research_setup",
        action: "install",
        setupStatus: "ready",
        installResult: {
          status: "installed",
        },
      });
      expect(emitted).toContainEqual(expect.objectContaining({
        type: "local-deep-research-setup-updated",
        workspacePath,
        result: expect.objectContaining({
          schemaVersion: "ambient-local-deep-research-setup-result-v1",
          action: "install",
          setupStatus: "ready",
          installResult: expect.objectContaining({ status: "installed" }),
        }),
      }));
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("runs Local Deep Research setup validation through the validation boundary", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-local-research-validate-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      await installSyntheticLocalDeepResearchAssets(workspacePath);
      const validateFeature = vi.fn(async (input: any): Promise<LocalDeepResearchValidationResult> => ({
        schemaVersion: "ambient-local-deep-research-validation-v1",
        checkedAt: "2026-05-28T14:20:00.000Z",
        status: "passed",
        setupStatus: input.setup.status,
        modelProfileId: input.setup.modelInstall.selectedProfileId,
        contextTokens: input.setup.modelInstall.contextTokens,
        providerSnapshot: input.setup.providerSnapshot,
        checks: [
          {
            id: "setup-contract",
            title: "Setup contract",
            status: "passed",
            detail: "Synthetic validation passed.",
          },
          {
            id: "provider-preference-smoke",
            title: "Provider preference product smoke",
            status: "passed",
            detail: "Synthetic provider preference smoke passed.",
          },
        ],
        artifactPath: ".ambient/local-deep-research/validation.json",
      }));
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      }, {
        localModelResidentProcesses: async () => [],
        search: {
          readSettings: () => ({
            webResearch: normalizeWebResearchProviderStackSettings({
              preferences: {
                search: ["exa-mcp-default", "ambient-browser"],
                fetch: ["scrapling-mcp-default", "ambient-browser"],
              },
            }),
          }) as any,
          updateSettings: async (input: any) => input,
        },
        localDeepResearch: {
          buildSetupContract: (_workspacePath: string, input: any) => buildLocalDeepResearchSetupContract({
            ...input,
            runtimeBinaryPath: undefined,
            runtimeInstalled: true,
          }),
          validate: validateFeature,
        },
      });
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      const updates: string[] = [];
      (runtime as any).createLocalDeepResearchToolExtension("thread-local-research-validate", workspace)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });

      const setup = registeredTools.find((tool) => tool.name === "ambient_local_deep_research_setup")!;
      const result = await setup.execute("local-research-validate", {
        action: "validate",
      }, undefined, (update: any) => {
        updates.push(update.content[0]?.text ?? "");
      });

      expect(updates).toEqual([
        "Preparing Local Deep Research validation.",
        "Running Local Deep Research validation.",
      ]);
      expect(validateFeature).toHaveBeenCalledWith(expect.objectContaining({
        workspacePath,
        setup: expect.objectContaining({ status: "ready" }),
        managedAssets: expect.objectContaining({
          model: expect.objectContaining({ status: "present" }),
          runtime: expect.objectContaining({ status: "present" }),
        }),
      }));
      expect(result.content[0].text).toContain("Local Deep Research validation passed.");
      expect(result.content[0].text).toContain(".ambient/local-deep-research/validation.json");
      expect(result.details).toMatchObject({
        runtime: "ambient-local-deep-research",
        toolName: "ambient_local_deep_research_setup",
        action: "validate",
        setupStatus: "ready",
        validation: {
          status: "passed",
          artifactPath: ".ambient/local-deep-research/validation.json",
        },
      });
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("runs Local Deep Research setup smoke through the real-asset smoke boundary", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-local-research-smoke-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      await installSyntheticLocalDeepResearchAssets(workspacePath);
      const smokeFeature = vi.fn(async (input: any): Promise<LocalDeepResearchSmokeResult> => ({
        schemaVersion: "ambient-local-deep-research-smoke-v1",
        checkedAt: "2026-05-28T14:10:00.000Z",
        status: "passed",
        setupStatus: input.setup.status,
        modelProfileId: input.setup.modelInstall.selectedProfileId,
        contextTokens: input.setup.modelInstall.contextTokens,
        providerSnapshot: input.setup.providerSnapshot,
        checks: [
          {
            id: "llama-chat",
            title: "llama.cpp chat completion",
            status: "passed",
            detail: "Synthetic smoke passed.",
          },
        ],
        artifactPath: ".ambient/local-deep-research/smoke/test.json",
        markdownPath: ".ambient/local-deep-research/smoke/test.md",
        chat: {
          prompt: "smoke",
          response: "LOCAL_DEEP_RESEARCH_SMOKE_OK",
          durationMs: 25,
          requestTimeoutMs: 60000,
        },
      }));
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      }, {
        localModelResidentProcesses: async () => [],
        search: {
          readSettings: () => ({
            webResearch: normalizeWebResearchProviderStackSettings({
              preferences: {
                search: ["exa-mcp-default", "ambient-browser"],
                fetch: ["scrapling-mcp-default", "ambient-browser"],
              },
            }),
          }) as any,
          updateSettings: async (input: any) => input,
        },
        localDeepResearch: {
          buildSetupContract: (_workspacePath: string, input: any) => buildLocalDeepResearchSetupContract({
            ...input,
            runtimeBinaryPath: undefined,
            runtimeInstalled: true,
          }),
          smoke: smokeFeature,
        },
      });
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      const updates: string[] = [];
      (runtime as any).createLocalDeepResearchToolExtension("thread-local-research-smoke", workspace)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });

      const setup = registeredTools.find((tool) => tool.name === "ambient_local_deep_research_setup")!;
      const result = await setup.execute("local-research-smoke", {
        action: "smoke",
      }, undefined, (update: any) => {
        updates.push(update.content[0]?.text ?? "");
      });

      expect(updates).toEqual([
        "Preparing Local Deep Research real-asset smoke.",
        "Running Local Deep Research real-asset smoke.",
      ]);
      expect(smokeFeature).toHaveBeenCalledWith(expect.objectContaining({
        workspacePath,
        setup: expect.objectContaining({ status: "ready" }),
        managedAssets: expect.objectContaining({
          model: expect.objectContaining({ status: "present" }),
          runtime: expect.objectContaining({ status: "present" }),
        }),
      }));
      expect(result.content[0].text).toContain("Local Deep Research real-asset smoke passed.");
      expect(result.content[0].text).toContain(".ambient/local-deep-research/smoke/test.md");
      expect(result.details).toMatchObject({
        runtime: "ambient-local-deep-research",
        toolName: "ambient_local_deep_research_setup",
        action: "smoke",
        setupStatus: "ready",
        smoke: {
          status: "passed",
          artifactPath: ".ambient/local-deep-research/smoke/test.json",
        },
      });
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});

async function createAgentRuntimeLocalRuntimeOwnershipFixture(prefix: string) {
  const workspacePath = await mkdtemp(join(tmpdir(), prefix));
  const store = new ProjectStore();
  store.openWorkspace(workspacePath);
  await writeAgentRuntimeLocalTextRuntimeState(workspacePath);
  store.setFeatureFlagSettings({ subagents: true });
  const parent = store.createThread("Parent with local runtime lifecycle child");
  const assistant = store.addMessage({
    threadId: parent.id,
    role: "assistant",
    content: "",
    metadata: { status: "streaming", runtime: "pi" },
  });
  const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
  const featureFlags = resolveAmbientFeatureFlags({
    settings: store.getFeatureFlagSettings(),
    generatedAt: "2026-06-06T00:00:00.000Z",
  });
  const created = store.createSubagentRun({
    parentThreadId: parent.id,
    parentRunId: parentRun.id,
    parentMessageId: assistant.id,
    title: "Local review worker",
    roleId: "reviewer",
    roleProfileSnapshot: getDefaultSubagentRoleProfile("reviewer"),
    canonicalTaskPath: "root/0:reviewer",
    featureFlagSnapshot: featureFlags,
    modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(AMBIENT_LOCAL_TEXT_MODEL, "2026-06-06T00:00:00.000Z"),
    dependencyMode: "required",
  });
  const childRun = store.markSubagentRunStatus(created.id, "running");
  const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
    request: vi.fn(),
    denyThread: () => undefined,
  }, {
    localModelResidentProcesses: (targetWorkspacePath) => detectLocalLlamaResidentProcesses(targetWorkspacePath, {
      includeUntracked: false,
      sampleProcessMemory: false,
    }),
  });
  const lease = (): LocalRuntimeLeaseRecord => ({
    schemaVersion: "ambient-local-runtime-lease-v1",
    leaseId: "lease-review",
    parentThreadId: parent.id,
    subagentThreadId: childRun.childThreadId,
    subagentRunId: childRun.id,
    ownerDisplayName: "Review worker",
    modelRuntimeId: "local-text-runtime",
    modelProfileId: "local-text-4b-q4",
    modelId: "local/text-4b",
    providerId: "local",
    capabilityKind: "local-text",
    estimatedResidentMemoryBytes: 6 * gib,
    pid: process.pid,
    endpoint: "http://127.0.0.1:43123/health",
    acquiredAt: "2026-06-06T00:00:00.000Z",
    lastHeartbeatAt: new Date().toISOString(),
    status: "running",
  });
  return {
    workspacePath,
    store,
    runtime,
    parentRun,
    childRun,
    activeLeases: () => store.getSubagentRun(childRun.id).status === "cancelled" ? [] : [lease()],
    cleanup: async () => {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    },
  };
}

async function writeAgentRuntimeLocalTextRuntimeState(
  workspacePath: string,
  input: { status?: "running" | "stopped" } = {},
): Promise<void> {
  const stateDir = join(workspacePath, ".ambient/local-model-runtime/local-text-runtime");
  await mkdir(stateDir, { recursive: true });
  const status = input.status ?? "running";
  await writeFile(join(stateDir, "runtime-state.json"), JSON.stringify({
    schemaVersion: "ambient-local-model-runtime-state-v1",
    runtimeId: "local-text-runtime",
    providerId: "local",
    modelId: "local/text-4b",
    profileId: "local-text-4b-q4",
    pid: process.pid,
    status,
    command: ["/runtime/local-text", "serve"],
    cwd: workspacePath,
    stateDir,
    stdoutPath: join(stateDir, "runtime.stdout.log"),
    stderrPath: join(stateDir, "runtime.stderr.log"),
    startedAt: "2026-06-06T00:00:00.000Z",
    lastUsedAt: "2026-06-06T00:00:00.000Z",
    ...(status === "stopped" ? { stoppedAt: "2026-06-06T00:02:00.000Z" } : {}),
    idleTimeoutMs: 300000,
    healthUrl: "http://127.0.0.1:43123/health",
    estimatedResidentMemoryBytes: 6 * gib,
  }, null, 2), "utf8");
}

function localDeepResearchProviderSnapshotSettings(searchProviderId: string, fetchProviderId: string) {
  return {
    webResearch: normalizeWebResearchProviderStackSettings({
      providers: [
        { providerId: "exa-mcp-default", label: "Exa Search", kind: "remote-mcp", roles: ["search", "fetch"], status: "disabled" },
        { providerId: "scrapling-mcp-default", label: "Scrapling", kind: "toolhive-mcp", roles: ["fetch"], status: "disabled" },
        { providerId: "ambient-browser", label: "Ambient Browser", kind: "built-in-browser", roles: ["search", "fetch", "interactive_browser"], status: "disabled" },
        { providerId: searchProviderId, label: searchProviderId, kind: "remote-mcp", roles: ["search"], status: "enabled" },
        { providerId: fetchProviderId, label: fetchProviderId, kind: "remote-mcp", roles: ["fetch"], status: "enabled" },
      ],
      preferences: {
        search: [searchProviderId, "exa-mcp-default", "ambient-browser"],
        fetch: [fetchProviderId, "scrapling-mcp-default", "ambient-browser"],
      },
      fallbackPolicy: { allowBrowserFallback: false },
    }),
  };
}

async function installSyntheticLocalDeepResearchAssets(workspacePath: string): Promise<void> {
  for (const profileId of ["literesearcher-4b-q4-k-m", "literesearcher-4b-q8-0"] as const) {
    const profile = localDeepResearchProfileById(profileId);
    const modelPath = localDeepResearchModelCachePath(workspacePath, profile);
    await mkdir(dirname(modelPath), { recursive: true });
    const handle = await open(modelPath, "w");
    try {
      await handle.truncate(profile.sizeBytes);
    } finally {
      await handle.close();
    }
  }
  const artifact = selectLocalLlamaRuntimeArtifact(miniCpmRuntimeReleaseManifestPrototype.artifacts, {
    platform: "darwin",
    arch: "arm64",
  });
  if (!artifact) throw new Error("Expected macOS arm64 llama.cpp runtime artifact.");
  const runtimePath = join(workspacePath, ".ambient/vision/minicpm-v/runtime", artifact.cacheSubdir, artifact.binaryRelativePath);
  await mkdir(dirname(runtimePath), { recursive: true });
  await writeFile(runtimePath, "synthetic llama-server", "utf8");
}

describeNative("AgentRuntime messaging gateway tools", () => {
  const itManualTelegramRelaySmoke = process.env.AMBIENT_MANUAL_TELEGRAM_RELAY_SMOKE === "1" ? it : it.skip;
  const itManualTelegramDirectorySmoke = process.env.AMBIENT_MANUAL_TELEGRAM_DIRECTORY_SMOKE === "1" ? it : it.skip;
  const itManualTelegramDirectoryListSmoke = process.env.AMBIENT_MANUAL_TELEGRAM_DIRECTORY_LIST_SMOKE === "1" ? it : it.skip;
  const itManualTelegramOwnerHandoffCheckSmoke = process.env.AMBIENT_MANUAL_TELEGRAM_OWNER_HANDOFF_CHECK_SMOKE === "1" ? it : it.skip;
  const itManualTelegramGuidedOwnerLoopSmoke = process.env.AMBIENT_MANUAL_TELEGRAM_GUIDED_OWNER_LOOP_SMOKE === "1" ? it : it.skip;
  const itManualTelegramOwnerLoopSmoke = process.env.AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SMOKE === "1" ? it : it.skip;

  it("surfaces Signal local preflight readiness through gateway status without enabling Signal actions", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-signal-readiness-"));
    const signalProfileRoot = join(workspacePath, ".ambient-agent-state", "signal", "owner");
    const store = new ProjectStore();
    const originalEnv = {
      bridgeUrl: process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL,
      apiId: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
      apiHash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
      signalCliPath: process.env.AMBIENT_SIGNAL_CLI_PATH,
      signalCliConfigDir: process.env.AMBIENT_SIGNAL_CLI_CONFIG_DIR,
    };
    try {
      await mkdir(signalProfileRoot, { recursive: true });
      await writeFile(join(signalProfileRoot, "bridge-session.json"), JSON.stringify({
        profileId: "owner",
        signalCliConfigDir: signalProfileRoot,
        accountIdentifierPresent: true,
        linkedDevicePresent: true,
        registrationMetadataPresent: true,
        bridgeSessionReadable: true,
        phoneNumber: "+15551234567",
      }));
      process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = "http://127.0.0.1:1";
      delete process.env.AMBIENT_AGENT_TELEGRAM_API_ID;
      delete process.env.AMBIENT_AGENT_TELEGRAM_API_HASH;
      process.env.AMBIENT_SIGNAL_CLI_PATH = join(workspacePath, "missing-signal-cli");
      process.env.AMBIENT_SIGNAL_CLI_CONFIG_DIR = signalProfileRoot;
      store.openWorkspace(workspacePath);
      const thread = store.updateThreadSettings(store.createThread("signal readiness").id, { permissionMode: "workspace" });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: async () => ({ allowed: true, mode: "allow_once" }),
        denyThread: () => undefined,
      });
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      (runtime as any).createMessagingGatewayToolExtension(thread.id, store.getWorkspace())({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const status = registeredTools.find((tool) => tool.name === "ambient_messaging_gateway_status")!;
      const lifecycleApply = registeredTools.find((tool) => tool.name === "ambient_messaging_gateway_lifecycle_apply")!;
      const conversationDirectory = registeredTools.find((tool) => tool.name === "ambient_messaging_conversation_directory_preview")!;
      const signalDirectoryPreview = registeredTools.find((tool) => tool.name === "ambient_messaging_signal_conversation_directory_preview")!;
      const signalDirectoryApply = registeredTools.find((tool) => tool.name === "ambient_messaging_signal_conversation_directory_apply")!;
      const signalUnreadPreview = registeredTools.find((tool) => tool.name === "ambient_messaging_signal_unread_window_preview")!;
      const signalUnreadStatus = registeredTools.find((tool) => tool.name === "ambient_messaging_signal_unread_window_status")!;
      const signalRealUnreadPreview = registeredTools.find((tool) => tool.name === "ambient_messaging_signal_real_unread_window_preview")!;
      const signalRealUnreadApply = registeredTools.find((tool) => tool.name === "ambient_messaging_signal_real_unread_window_apply")!;
      const signalRealPollingStatus = registeredTools.find((tool) => tool.name === "ambient_messaging_signal_real_polling_status")!;
      const signalRealPollingPreview = registeredTools.find((tool) => tool.name === "ambient_messaging_signal_real_polling_preview")!;
      const signalRealPollingApply = registeredTools.find((tool) => tool.name === "ambient_messaging_signal_real_polling_apply")!;
      const signalBridgeReplyPreview = registeredTools.find((tool) => tool.name === "ambient_messaging_signal_bridge_reply_preview")!;
      const signalBridgeReplyApply = registeredTools.find((tool) => tool.name === "ambient_messaging_signal_bridge_reply_apply")!;
      const signalBindingReadinessPreview = registeredTools.find((tool) => tool.name === "ambient_messaging_signal_binding_readiness_preview")!;
      const signalOwnerHandoffPreview = registeredTools.find((tool) => tool.name === "ambient_messaging_signal_owner_handoff_preview")!;
      const signalOwnerHandoffApply = registeredTools.find((tool) => tool.name === "ambient_messaging_signal_owner_handoff_apply")!;
      const signalRemoteSurfacePreview = registeredTools.find((tool) => tool.name === "ambient_messaging_signal_remote_surface_preview")!;
      const signalRemoteSurfaceApply = registeredTools.find((tool) => tool.name === "ambient_messaging_signal_remote_surface_apply")!;
      const bindingPreview = registeredTools.find((tool) => tool.name === "ambient_messaging_remote_surface_binding_preview")!;
      const eventPreview = registeredTools.find((tool) => tool.name === "ambient_messaging_remote_surface_event_preview")!;

      const gatewayStatus = await status.execute("gateway-status", {});
      expect(gatewayStatus.content[0].text).toContain("Signal (signal-cli)");
      expect(gatewayStatus.content[0].text).toContain("Signal real polling runner status");
      expect(gatewayStatus.content[0].text).toContain("Signal outbound reply contract status");
      expect(gatewayStatus.content[0].text).toContain("Readiness: unavailable");
      expect(gatewayStatus.content[0].text).toContain("Signal readiness performs redacted local preflight");
      expect(gatewayStatus.content[0].text).toContain("Signal typed Remote Ambient Surface binding metadata may be persisted");
      expect(gatewayStatus.details.providers.find((provider: any) => provider.providerId === "signal-cli")).toMatchObject({
        state: "stopped",
        mode: "none",
        readiness: {
          status: "unavailable",
          configured: true,
          bridgeReachable: false,
          apiCredentialsPresent: false,
          persistedSessionCount: 1,
        },
      });
      expect(JSON.stringify(gatewayStatus.details.providers.find((provider: any) => provider.providerId === "signal-cli"))).not.toContain("+15551234567");

      const signalLifecycle = await lifecycleApply.execute("signal-start", {
        action: "start",
        providerId: "signal-cli",
        mode: "synthetic",
      });
      expect(signalLifecycle.details).toMatchObject({
        status: "blocked",
        providerId: "signal-cli",
        applied: false,
        applyStatus: "blocked",
        blockedReason: "Messaging provider lifecycle is not implemented for signal-cli.",
      });

      const signalDirectory = await conversationDirectory.execute("signal-directory", {
        providerId: "signal-cli",
        purpose: "remote_ambient_surface",
      });
      expect(signalDirectory.content[0].text).toContain("Ambient messaging conversation directory preview: blocked");
      expect(signalDirectory.content[0].text).toContain("Provider directory tool: ambient_messaging_signal_conversation_directory_preview");
      expect(signalDirectory.content[0].text).toContain("Directory mode: planned");
      expect(signalDirectory.details).toMatchObject({
        status: "blocked",
        providers: [{
          providerId: "signal-cli",
          canListProviderConversationsNow: false,
          knownConversations: [],
        }],
      });

      const signalTypedPreview = await signalDirectoryPreview.execute("signal-directory-preview", {
        providerId: "signal-cli",
        profileId: "owner",
        purpose: "remote_ambient_surface",
        query: "owner",
        limit: 5,
      });
      expect(signalTypedPreview.content[0].text).toContain("Signal conversation directory preview: blocked");
      expect(signalTypedPreview.content[0].text).toContain("Runs provider CLI: no");
      expect(signalTypedPreview.content[0].text).toContain("Signal session metadata contract: signal-local-bridge-session-metadata");
      expect(signalTypedPreview.content[0].text).toContain("Signal readiness performs redacted local preflight");
      expect(signalTypedPreview.details).toMatchObject({
        status: "blocked",
        canApplyNow: false,
        profileId: "owner",
        providerDirectoryApplyTool: "ambient_messaging_signal_conversation_directory_apply",
        safety: {
          readsProviderMessages: false,
          runsProviderCli: false,
          inspectsSignalDesktop: false,
        },
        adapterExecution: {
          kind: "messaging-conversation-directory-adapter-execution",
          executionStatus: "preview",
          adapterStatus: "available",
          adapterKind: "live-metadata-only-adapter",
          requiresApprovalForApply: true,
          approvalRecorded: false,
          failureMode: "bridge-unreachable",
        },
      });

      const signalTypedApply = await signalDirectoryApply.execute("signal-directory-apply", {
        providerId: "signal-cli",
        profileId: "owner",
        purpose: "remote_ambient_surface",
        query: "owner",
        limit: 5,
      });
      expect(signalTypedApply.content[0].text).toContain("Signal conversation directory result: blocked");
      expect(signalTypedApply.content[0].text).toContain("Returned conversations: 0");
      expect(signalTypedApply.details).toMatchObject({
        status: "blocked",
        applyStatus: "blocked",
        failureMode: "bridge-unreachable",
        conversations: [],
        adapterExecution: {
          kind: "messaging-conversation-directory-adapter-execution",
          executionStatus: "blocked",
          adapterStatus: "available",
          adapterKind: "live-metadata-only-adapter",
          requiresApprovalForApply: true,
          approvalRecorded: false,
          failureMode: "bridge-unreachable",
        },
      });

      const signalUnread = await signalUnreadPreview.execute("signal-unread-preview", {
        providerId: "signal-cli",
        profileId: "owner",
        conversationId: "signal-owner-chat",
        limit: 5,
      });
      expect(signalUnread.content[0].text).toContain("Signal bounded unread-window preview");
      expect(signalUnread.content[0].text).toContain("Apply tool: ambient_messaging_signal_unread_window_apply");
      expect(signalUnread.content[0].text).toContain("Returns provider message bodies to Pi: no");
      expect(signalUnread.details).toMatchObject({
        status: "blocked",
        previewOnly: true,
        canApplyNow: false,
        applyToolName: "ambient_messaging_signal_unread_window_apply",
        safety: {
          readsProviderUnreadMessages: false,
          returnsProviderMessageBodiesToPi: false,
          sendsProviderMessages: false,
        },
      });

      const signalUnreadDiagnostics = await signalUnreadStatus.execute("signal-unread-status", {
        providerId: "signal-cli",
        profileId: "owner",
        conversationId: "signal-owner-chat",
      });
      expect(signalUnreadDiagnostics.content[0].text).toContain("Signal unread-window status");
      expect(signalUnreadDiagnostics.content[0].text).toContain("Real Signal unread ingestion enabled: no");
      expect(signalUnreadDiagnostics.content[0].text).toContain("Returns provider message bodies to Pi: no");
      expect(signalUnreadDiagnostics.details).toMatchObject({
        status: "blocked",
        fakeBridgeApplyEnabled: false,
        realBridgeUnreadEnabled: false,
        selectedBindingCount: 0,
        safety: {
          readsProviderUnreadMessages: false,
          returnsProviderMessageBodiesToPi: false,
          sendsProviderMessages: false,
        },
      });

      const signalRealUnread = await signalRealUnreadPreview.execute("signal-real-unread-preview", {
        providerId: "signal-cli",
        profileId: "owner",
        conversationId: "signal-owner-chat",
        limit: 5,
      });
      expect(signalRealUnread.content[0].text).toContain("Signal real unread-window preview: blocked");
      expect(signalRealUnread.content[0].text).toContain("Approval required before apply: yes");
      expect(signalRealUnread.content[0].text).toContain("Contacts bridge unread endpoint: no");
      expect(signalRealUnread.details).toMatchObject({
        status: "blocked",
        canApplyNow: false,
        approvalRequired: true,
        applyToolName: "ambient_messaging_signal_real_unread_window_apply",
        safety: {
          requestsApproval: false,
          contactsBridgeUnreadEndpoint: false,
          readsProviderUnreadMessages: false,
          returnsProviderMessageBodiesToPi: false,
          sendsProviderMessages: false,
        },
      });

      const signalRealUnreadBlocked = await signalRealUnreadApply.execute("signal-real-unread-apply", {
        providerId: "signal-cli",
        profileId: "owner",
        conversationId: "signal-owner-chat",
        limit: 5,
      });
      expect(signalRealUnreadBlocked.content[0].text).toContain("Signal real unread-window apply");
      expect(signalRealUnreadBlocked.content[0].text).toContain("Approval requested: no");
      expect(signalRealUnreadBlocked.content[0].text).toContain("Polled: no");
      expect(signalRealUnreadBlocked.details).toMatchObject({
        status: "blocked",
        applyStatus: "blocked",
        approvalRequested: false,
        approvalRecorded: false,
        polled: false,
        fetchedMessageCount: 0,
        safety: {
          requestsApproval: false,
          contactsBridgeUnreadEndpoint: false,
          readsProviderUnreadMessages: false,
          sendsProviderMessages: false,
        },
      });

      const signalPollingStatus = await signalRealPollingStatus.execute("signal-real-polling-status", {});
      expect(signalPollingStatus.content[0].text).toContain("Signal real polling runner status");
      expect(signalPollingStatus.content[0].text).toContain("Background loop implemented: yes");
      expect(signalPollingStatus.content[0].text).toContain("Running: no");
      expect(signalPollingStatus.details.signalRealPolling).toMatchObject({
        runnerState: "stopped",
        running: false,
        backgroundLoopImplemented: true,
      });

      const signalPollingPreview = await signalRealPollingPreview.execute("signal-real-polling-preview", {
        action: "start",
        providerId: "signal-cli",
        bindingId: "signal-binding-missing",
        profileId: "owner",
        conversationId: "signal-owner-chat",
        limit: 5,
      });
      expect(signalPollingPreview.content[0].text).toContain("Signal real polling start preview");
      expect(signalPollingPreview.content[0].text).toContain("Background loop implemented: yes");
      expect(signalPollingPreview.content[0].text).toContain("Reads provider unread messages: no");
      expect(signalPollingPreview.details).toMatchObject({
        status: "blocked",
        canApplyNow: false,
        approvalRequired: false,
        safety: {
          startsTimer: false,
          readsProviderUnreadMessages: false,
          sendsProviderMessages: false,
        },
      });

      const signalPollingBlocked = await signalRealPollingApply.execute("signal-real-polling-apply", {
        action: "start",
        providerId: "signal-cli",
        bindingId: "signal-binding-missing",
        profileId: "owner",
        conversationId: "signal-owner-chat",
        limit: 5,
      });
      expect(signalPollingBlocked.content[0].text).toContain("Signal real polling start apply");
      expect(signalPollingBlocked.content[0].text).toContain("Apply status: blocked");
      expect(signalPollingBlocked.content[0].text).toContain("Immediate poll attempted: no");
      expect(signalPollingBlocked.details).toMatchObject({
        status: "blocked",
        applyStatus: "blocked",
        immediatePollAttempted: false,
      });

      const signalReplyPreview = await signalBridgeReplyPreview.execute("signal-bridge-reply-preview", {
        providerId: "signal-cli",
        bindingId: "signal-binding-missing",
        profileId: "owner",
        conversationId: "signal-owner-chat",
        replyToMessageId: "message-1",
        text: "status update",
      });
      expect(signalReplyPreview.content[0].text).toContain("Signal bridge reply preview");
      expect(signalReplyPreview.content[0].text).toContain("Sends provider messages: no");
      expect(signalReplyPreview.content[0].text).toContain("Bridge approvedReplySend capability: no");
      expect(signalReplyPreview.details).toMatchObject({
        status: "blocked",
        canApplyNow: false,
        approvalRequired: true,
        futureApprovalRequired: true,
        safety: {
          requestsApproval: false,
          sendsProviderMessages: false,
          readsProviderMessages: false,
          usesReviewedBridgeSendContract: false,
        },
      });

      const signalReplyBlocked = await signalBridgeReplyApply.execute("signal-bridge-reply-apply", {
        providerId: "signal-cli",
        bindingId: "signal-binding-missing",
        profileId: "owner",
        conversationId: "signal-owner-chat",
        replyToMessageId: "message-1",
        text: "status update",
      });
      expect(signalReplyBlocked.content[0].text).toContain("Apply result:");
      expect(signalReplyBlocked.content[0].text).toContain("Apply status: blocked");
      expect(signalReplyBlocked.content[0].text).toContain("Approval requested: no");
      expect(signalReplyBlocked.content[0].text).toContain("Sent: no");
      expect(signalReplyBlocked.details).toMatchObject({
        status: "blocked",
        applyStatus: "blocked",
        approvalRequested: false,
        approvalRecorded: false,
        sent: false,
        safety: {
          requestsApproval: false,
          sendsProviderMessages: false,
        },
      });

      const signalBindingReadiness = await signalBindingReadinessPreview.execute("signal-binding-readiness-preview", {
        providerId: "signal-cli",
        profileId: "owner",
        conversationId: "signal-owner-chat",
        ownerUserId: "owner-signal",
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
        limit: 5,
      });
      expect(signalBindingReadiness.content[0].text).toContain("Signal Remote Ambient Surface binding readiness preview: blocked");
      expect(signalBindingReadiness.content[0].text).toContain("Generic binding apply allowed: no");
      expect(signalBindingReadiness.content[0].text).toContain("Telegram owner handoff allowed: no");
      expect(signalBindingReadiness.content[0].text).toContain("Owner authentication: missing");
      expect(signalBindingReadiness.details).toMatchObject({
        status: "blocked",
        canApplyNow: false,
        typedApplyTool: "ambient_messaging_signal_remote_surface_apply",
        genericBindingApplyAllowed: false,
        telegramOwnerHandoffAllowed: false,
        safety: {
          mutatesBindings: false,
          readsProviderMessages: false,
          usesTelegramOwnerHandoff: false,
        },
      });

      const signalOwnerHandoff = await signalOwnerHandoffPreview.execute("signal-owner-handoff-preview", {
        providerId: "signal-cli",
        profileId: "owner",
        conversationId: "signal-owner-chat",
        setupCode: "ambient-signal-setup-code-12345",
        limit: 5,
      });
      expect(signalOwnerHandoff.content[0].text).toContain("Signal owner handoff preview: blocked");
      expect(signalOwnerHandoff.content[0].text).toContain("Typed apply tool: ambient_messaging_signal_owner_handoff_apply");
      expect(signalOwnerHandoff.content[0].text).toContain("Binding apply tool: none");
      expect(signalOwnerHandoff.content[0].text).toContain("Reads Signal unread messages now: no");
      expect(signalOwnerHandoff.content[0].text).toContain("Uses Telegram owner handoff: no");
      expect(signalOwnerHandoff.content[0].text).not.toContain("ambient-signal-setup-code-12345");
      expect(signalOwnerHandoff.details).toMatchObject({
        status: "blocked",
        canApplyNow: false,
        typedApplyTool: "ambient_messaging_signal_owner_handoff_apply",
        bindingApplyTool: "none",
        setupCodePreview: "31 chars",
        safety: {
          readsProviderUnreadMessages: false,
          returnsProviderMessageContent: false,
          createsBinding: false,
          usesTelegramOwnerHandoff: false,
        },
      });

      const signalOwnerApply = await signalOwnerHandoffApply.execute("signal-owner-handoff-apply", {
        providerId: "signal-cli",
        profileId: "owner",
        conversationId: "signal-owner-chat",
        setupCode: "ambient-signal-setup-code-12345",
        limit: 5,
      });
      expect(signalOwnerApply.content[0].text).toContain("Signal owner handoff apply: blocked");
      expect(signalOwnerApply.content[0].text).toContain("Handoff status: not-attempted");
      expect(signalOwnerApply.content[0].text).toContain("Can feed binding apply: no");
      expect(signalOwnerApply.content[0].text).toContain("Reads Signal unread messages: no");
      expect(signalOwnerApply.content[0].text).not.toContain("ambient-signal-setup-code-12345");
      expect(signalOwnerApply.details).toMatchObject({
        status: "blocked",
        applyStatus: "blocked",
        handoffStatus: "not-attempted",
        approvalRequested: false,
        approvalRecorded: false,
        canFeedBindingApply: false,
        bindingApplyInputReady: false,
        failureMode: "fake-bridge-apply-disabled",
        fetchedMessageCount: 0,
        matchedSenderCount: 0,
        initialSeenMessageIds: [],
        safety: {
          readsProviderUnreadMessages: false,
          returnsMatchedSenderId: false,
          returnsProviderMessageContent: false,
          createsBinding: false,
          usesTelegramOwnerHandoff: false,
        },
      });
      expect("ownerUserId" in signalOwnerApply.details).toBe(false);

      const signalRemotePreview = await signalRemoteSurfacePreview.execute("signal-remote-surface-preview", {
        providerId: "signal-cli",
        profileId: "owner",
        conversationId: "signal-owner-chat",
        ownerUserId: "owner-signal",
        ownerHandoffSourceMessageId: "signal-owner-setup-message",
        initialSeenMessageIds: ["signal-owner-setup-message", "signal-owner-other-message"],
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
        limit: 5,
      });
      expect(signalRemotePreview.content[0].text).toContain("Signal Remote Ambient Surface binding preview blocked");
      expect(signalRemotePreview.content[0].text).toContain("Generic binding apply allowed: no");
      expect(signalRemotePreview.content[0].text).toContain("Uses Telegram owner handoff: no");
      expect(signalRemotePreview.content[0].text).toContain("Persists binding: no");
      expect(signalRemotePreview.details).toMatchObject({
        status: "blocked",
        canApplyNow: false,
        typedApplyTool: "ambient_messaging_signal_remote_surface_apply",
        genericBindingApplyAllowed: false,
        telegramOwnerHandoffAllowed: false,
        ownerHandoffSourceMessageId: "signal-owner-setup-message",
        initialSeenMessageIds: ["signal-owner-setup-message", "signal-owner-other-message"],
        safety: {
          mutatesBindings: false,
          persistsBinding: false,
          usesGenericBindingApply: false,
          usesTelegramOwnerHandoff: false,
        },
      });

      const signalRemoteApply = await signalRemoteSurfaceApply.execute("signal-remote-surface-apply", {
        providerId: "signal-cli",
        profileId: "owner",
        conversationId: "signal-owner-chat",
        ownerUserId: "owner-signal",
        ownerHandoffSourceMessageId: "signal-owner-setup-message",
        initialSeenMessageIds: ["signal-owner-setup-message", "signal-owner-other-message"],
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
        limit: 5,
      });
      expect(signalRemoteApply.content[0].text).toContain("Signal Remote Ambient Surface binding blocked");
      expect(signalRemoteApply.content[0].text).toContain("Can feed future binding lifecycle: yes");
      expect(signalRemoteApply.content[0].text).toContain("Persisted: no");
      expect(signalRemoteApply.details).toMatchObject({
        status: "blocked",
        applyStatus: "blocked",
        approvalRequested: false,
        approvalRecorded: false,
        persisted: false,
        canFeedFutureBindingLifecycle: true,
        bindingApplyInputReady: false,
        failureMode: "readiness-blocked",
      });

      const signalBindingPreview = await bindingPreview.execute("signal-binding-preview", {
        action: "create",
        providerId: "signal-cli",
        authProfileId: "owner",
        conversationId: "signal-owner-chat",
        ownerUserId: "owner-signal",
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
      });
      expect(signalBindingPreview.content[0].text).toContain("Remote Ambient Surface binding preview: blocked");
      expect(signalBindingPreview.content[0].text).toContain("Typed preview tool: ambient_messaging_signal_remote_surface_preview");
      expect(signalBindingPreview.content[0].text).toContain("Typed apply tool: ambient_messaging_signal_remote_surface_apply");
      expect(signalBindingPreview.content[0].text).toContain("Provider implementation is planned");
      expect(signalBindingPreview.details).toMatchObject({
        status: "blocked",
        providerId: "signal-cli",
        canApplyNow: false,
        bindingLifecycleEnabled: true,
        purposeSupported: true,
      });

      const signalEventPreview = await eventPreview.execute("signal-event-preview", {
        providerId: "signal-cli",
        authProfileId: "owner",
        conversationId: "signal-owner-chat",
        senderId: "owner-signal",
        text: "status",
      });
      expect(signalEventPreview.content[0].text).toContain("Remote Ambient Surface inbound event preview: blocked");
      expect(signalEventPreview.content[0].text).toContain("Typed route tool: none");
      expect(signalEventPreview.content[0].text).toContain("Provider inbound ingestion is disabled");
      expect(signalEventPreview.details).toMatchObject({
        status: "blocked",
        providerId: "signal-cli",
        canRouteWithTypedTool: false,
        inboundIngestionEnabled: false,
        purposeSupported: true,
      });
    } finally {
      if (originalEnv.bridgeUrl === undefined) delete process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL;
      else process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = originalEnv.bridgeUrl;
      if (originalEnv.apiId === undefined) delete process.env.AMBIENT_AGENT_TELEGRAM_API_ID;
      else process.env.AMBIENT_AGENT_TELEGRAM_API_ID = originalEnv.apiId;
      if (originalEnv.apiHash === undefined) delete process.env.AMBIENT_AGENT_TELEGRAM_API_HASH;
      else process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = originalEnv.apiHash;
      if (originalEnv.signalCliPath === undefined) delete process.env.AMBIENT_SIGNAL_CLI_PATH;
      else process.env.AMBIENT_SIGNAL_CLI_PATH = originalEnv.signalCliPath;
      if (originalEnv.signalCliConfigDir === undefined) delete process.env.AMBIENT_SIGNAL_CLI_CONFIG_DIR;
      else process.env.AMBIENT_SIGNAL_CLI_CONFIG_DIR = originalEnv.signalCliConfigDir;
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("applies Signal setup metadata without enabling Signal runtime actions", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-signal-session-"));
    const signalConfigDir = join(workspacePath, "signal-cli-config");
    const store = new ProjectStore();
    try {
      await mkdir(signalConfigDir, { recursive: true });
      store.openWorkspace(workspacePath);
      const thread = store.updateThreadSettings(store.createThread("signal session setup").id, { permissionMode: "workspace" });
      const permissionRequester = vi.fn(async () => ({ allowed: true, mode: "allow_once" as const }));
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: permissionRequester,
        denyThread: () => undefined,
      });
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      (runtime as any).createMessagingGatewayToolExtension(thread.id, store.getWorkspace())({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const preview = registeredTools.find((tool) => tool.name === "ambient_messaging_signal_session_preview")!;
      const apply = registeredTools.find((tool) => tool.name === "ambient_messaging_signal_session_apply")!;
      const status = registeredTools.find((tool) => tool.name === "ambient_messaging_gateway_status")!;

      const previewResult = await preview.execute("signal-session-preview", {
        providerId: "signal-cli",
        profileId: "owner",
        signalCliConfigDir: signalConfigDir,
      });
      expect(previewResult.content[0].text).toContain("Signal session setup preview");
      expect(previewResult.content[0].text).toContain("Runs signal-cli: no");
      expect(previewResult.content[0].text).toContain("Reads Signal messages: no");
      expect(previewResult.details).toMatchObject({
        providerId: "signal-cli",
        profileId: "owner",
        canApplyNow: true,
        wouldRunProviderCli: false,
        wouldInspectSignalDesktop: false,
      });

      const applyResult = await apply.execute("signal-session-apply", {
        providerId: "signal-cli",
        profileId: "owner",
        signalCliConfigDir: signalConfigDir,
        accountIdentifierPresent: true,
        linkedDevicePresent: true,
        registrationMetadataPresent: true,
      });
      expect(permissionRequester).toHaveBeenCalledTimes(1);
      expect(applyResult.content[0].text).toContain("Signal session setup apply");
      expect(applyResult.content[0].text).toContain("Apply status: applied");
      expect(applyResult.content[0].text).toContain("Bridge session readable: no");
      expect(applyResult.details).toMatchObject({
        providerId: "signal-cli",
        profileId: "owner",
        applyStatus: "applied",
        applied: true,
        bridgeSessionReadable: false,
      });
      const metadata = JSON.parse(await readFile(join(workspacePath, ".ambient-agent-state", "signal", "owner", "bridge-session.json"), "utf8"));
      expect(metadata).toMatchObject({
        profileId: "owner",
        signalCliConfigDir: signalConfigDir,
        accountIdentifierPresent: true,
        linkedDevicePresent: true,
        registrationMetadataPresent: true,
        bridgeSessionReadable: false,
      });
      expect(JSON.stringify(applyResult)).not.toContain("phoneNumber");
      expect(JSON.stringify(applyResult)).not.toContain("sessionKeys");

      const gatewayStatus = await status.execute("gateway-status", {});
      expect(gatewayStatus.content[0].text).toContain("Signal (signal-cli)");
      expect(gatewayStatus.content[0].text).toContain("Persisted sessions: 1");
      expect(gatewayStatus.content[0].text).toContain("Signal session metadata exists, but it is not yet sufficient");
      expect(gatewayStatus.details.providers.find((provider: any) => provider.providerId === "signal-cli")).toMatchObject({
        readiness: {
          status: "unavailable",
          configured: false,
          persistedSessionCount: 1,
        },
      });
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("applies Telegram conversation directory through the real-mode AgentRuntime tool path", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-telegram-directory-"));
    const tdlibStateDir = join(workspacePath, ".ambient-agent-state", "telegram", "owner-profile", "tdlib");
    await mkdir(tdlibStateDir, { recursive: true });
    await writeFile(
      join(workspacePath, ".ambient-agent-state", "telegram", "owner-profile", "bridge-session.json"),
      JSON.stringify({
        profileId: "owner-profile",
        phoneNumber: "+15550000000",
        tdlibStateDir,
        databaseEncryptionKey: "directory-key",
      }),
      "utf8",
    );
    const originalFetch = globalThis.fetch;
    const originalEnv = {
      bridgeUrl: process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL,
      apiId: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
      apiHash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
    };
    const requests: Array<{ method: string; url: string; headers?: HeadersInit }> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;
      requests.push({ method: init?.method ?? "GET", url, headers: init?.headers });
      if (url === "http://127.0.0.1:19091/") {
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => ({
            ok: true,
            stateRoot: join(workspacePath, ".ambient-agent-state", "telegram"),
            sessionCount: 1,
          }),
        } as Response;
      }
      if (url === "http://127.0.0.1:19091/sessions/owner-profile/chats?limit=5&metadataOnly=true&query=ops") {
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => ({
            chats: [{
              id: "telegram-chat-1",
              title: "Ops",
              type: "private",
              unreadCount: 1,
              folderIds: [1],
              updatedAt: "2026-05-10T00:00:00.000Z",
            }],
          }),
        } as Response;
      }
      return {
        ok: false,
        status: 404,
        statusText: "Not Found",
        json: async () => ({}),
      } as Response;
    }) as typeof fetch;

    const store = new ProjectStore();
    try {
      process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = "http://127.0.0.1:19091";
      process.env.AMBIENT_AGENT_TELEGRAM_API_ID = "123";
      process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = "hash";
      store.openWorkspace(workspacePath);
      const thread = store.updateThreadSettings(store.createThread("telegram directory fake-real").id, { permissionMode: "workspace" });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: async (request) => {
          if (
            request.toolName === "ambient_messaging_gateway_lifecycle_apply" ||
            request.toolName === "ambient_messaging_telegram_conversation_directory_apply" ||
            request.toolName === "ambient_messaging_telegram_remote_surface_apply"
          ) {
            return { allowed: true, mode: "allow_once" };
          }
          throw new Error(`Unexpected Telegram directory permission request: ${request.title}`);
        },
        denyThread: () => undefined,
      });
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      (runtime as any).createMessagingGatewayToolExtension(thread.id, store.getWorkspace())({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const tool = (name: string) => {
        const found = registeredTools.find((candidate) => candidate.name === name);
        if (!found) throw new Error(`Missing tool ${name}`);
        return found;
      };

      const lifecycle = await tool("ambient_messaging_gateway_lifecycle_apply").execute("start-real", {
        action: "start",
        providerId: "telegram-tdlib",
        mode: "real",
      });
      expect(lifecycle.details.status).toBe("applied");

      const preview = await tool("ambient_messaging_telegram_conversation_directory_preview").execute("directory-preview", {
        profileId: "owner-profile",
        query: "ops",
        limit: 5,
      });
      expect(preview.details).toMatchObject({
        status: "ready",
        directoryStatus: "ready",
        canApplyNow: true,
        endpointPath: "/sessions/owner-profile/chats?limit=5&metadataOnly=true&query=ops",
        messagingConversationDirectorySetup: {
          kind: "messaging-conversation-directory-setup",
          providerId: "telegram-tdlib",
          status: "preview",
          directoryStatus: "ready",
          adapterStatus: "available",
          adapterKind: "live-metadata-only-adapter",
          previewToolName: "ambient_messaging_telegram_conversation_directory_preview",
          applyToolName: "ambient_messaging_telegram_conversation_directory_apply",
          canApplyNow: true,
          safety: {
            readsProviderMessages: false,
            readsProviderHistory: false,
            sendsProviderMessages: false,
          },
        },
      });

      const result = await tool("ambient_messaging_telegram_conversation_directory_apply").execute("directory-apply", {
        profileId: "owner-profile",
        query: "ops",
        limit: 5,
      });
      expect(result.details).toMatchObject({
        status: "applied",
        applyStatus: "applied",
        failureMode: "none",
        returnedConversationCount: 1,
        messagingConversationDirectorySetup: {
          kind: "messaging-conversation-directory-setup",
          providerId: "telegram-tdlib",
          status: "applied",
          returnedConversationCount: 1,
          conversations: [{
            conversationId: "telegram-chat-1",
            title: "Ops",
          }],
        },
        conversations: [{
          conversationId: "telegram-chat-1",
          title: "Ops",
        }],
      });
      expect(result.content[0].text).toContain("Failure mode: none");
      expect(result.content[0].text).toContain("metadataOnly=true");
      expect(JSON.stringify(result.details.conversations)).not.toContain("lastMessage");
      expect(requests.some((request) => request.url === "http://127.0.0.1:19091/sessions/owner-profile/chats?limit=5&metadataOnly=true&query=ops")).toBe(true);
      const conversationId = result.details.conversations[0].conversationId;

      const bindingPreview = await tool("ambient_messaging_telegram_remote_surface_preview").execute("binding-preview", {
        action: "create",
        purpose: "remote_ambient_surface",
        profileId: "owner-profile",
        conversationId,
        ownerUserId: "owner-1",
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
      });
      expect(bindingPreview.details).toMatchObject({
        status: "ready",
        canApplyNow: true,
        lifecycle: {
          binding: {
            authProfileId: "owner-profile",
            conversationId,
            ownerUserId: "owner-1",
            purpose: "remote_ambient_surface",
          },
        },
      });

      const bindingApply = await tool("ambient_messaging_telegram_remote_surface_apply").execute("binding-apply", {
        action: "create",
        purpose: "remote_ambient_surface",
        profileId: "owner-profile",
        conversationId,
        ownerUserId: "owner-1",
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
      });
      expect(bindingApply.details).toMatchObject({
        status: "applied",
        persisted: true,
        lifecycle: {
          binding: {
            conversationId,
            ownerUserId: "owner-1",
            purpose: "remote_ambient_surface",
          },
        },
      });
      const bindingId = bindingApply.details.lifecycle.binding.id;

      const routed = await tool("ambient_messaging_telegram_bridge_event_route").execute("route-owner-event", {
        profileId: "owner-profile",
        conversationId,
        messageId: "directory-message-1",
        senderId: "owner-1",
        senderLabel: "Owner",
        text: "status",
      });
      expect(routed.details).toMatchObject({
        status: "accepted",
        accepted: true,
        queuedProjection: {
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId,
          bindingId,
          purpose: "remote_ambient_surface",
        },
      });
      const queuedProjectionId = routed.details.queuedProjection.id;

      const diagnostics = await tool("ambient_messaging_telegram_relay_diagnostics").execute("relay-diagnostics", {
        profileId: "owner-profile",
        conversationId,
      });
      expect(diagnostics.details).toMatchObject({
        status: "ready",
        selectedOwnerBindings: [{
          bindingId,
          conversationId,
        }],
        queuedOwnerProjections: [{
          queuedProjectionId,
          conversationId,
        }],
      });
      expect(diagnostics.content[0].text).toContain("Bridge mode: real Telegram bridge running");

      const replyPreview = await tool("ambient_messaging_telegram_bridge_reply_preview").execute("reply-preview", {
        queuedProjectionId,
        text: "Ambient received your status request.",
      });
      expect(replyPreview.details).toMatchObject({
        status: "ready",
        canApplyNow: true,
        endpointPath: "/sessions/owner-profile/messages/send",
        binding: {
          id: bindingId,
          purpose: "remote_ambient_surface",
        },
      });

      const revoked = await tool("ambient_messaging_telegram_remote_surface_apply").execute("binding-revoke", {
        action: "revoke",
        bindingId,
        reason: "directory-to-binding smoke cleanup",
      });
      expect(revoked.details).toMatchObject({
        status: "applied",
        persisted: true,
        lifecycle: {
          binding: {
            id: bindingId,
            status: "revoked",
          },
        },
      });
    } finally {
      globalThis.fetch = originalFetch;
      if (originalEnv.bridgeUrl === undefined) delete process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL;
      else process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = originalEnv.bridgeUrl;
      if (originalEnv.apiId === undefined) delete process.env.AMBIENT_AGENT_TELEGRAM_API_ID;
      else process.env.AMBIENT_AGENT_TELEGRAM_API_ID = originalEnv.apiId;
      if (originalEnv.apiHash === undefined) delete process.env.AMBIENT_AGENT_TELEGRAM_API_HASH;
      else process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = originalEnv.apiHash;
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("requests Telegram login codes through secure input instead of Pi tool arguments", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-telegram-secure-input-"));
    const store = new ProjectStore();
    const originalEnv = {
      id: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
      hash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
    };
    const originalFetch = globalThis.fetch;
    const supervisorStatus: any = {
      providerId: "telegram-tdlib",
      state: "running",
      managed: true,
      pid: 12345,
      command: "pnpm",
      args: ["--dir", "/path/to/user/ambientAgent", "telegram:bridge"],
      cwd: "/path/to/user/ambientAgent",
      bridgeBaseUrl: "http://127.0.0.1:8091",
      stateRoot: `${workspacePath}/.ambient-agent-state/telegram`,
      envKeys: ["AMBIENT_AGENT_TELEGRAM_API_HASH", "AMBIENT_AGENT_TELEGRAM_API_ID"],
      safeRootProbeOnly: true,
      recentLogs: [],
    };
    const statusSpy = vi.spyOn(TelegramBridgeSupervisor.prototype, "status").mockReturnValue(supervisorStatus);
    const startSpy = vi.spyOn(TelegramBridgeSupervisor.prototype, "startForSetup").mockResolvedValue(supervisorStatus);
    const fetchRequests: Array<{ input: string; body?: Record<string, unknown> }> = [];
    globalThis.fetch = (async (input: string, init?: RequestInit) => {
      fetchRequests.push({
        input,
        body: typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : undefined,
      });
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => input.endsWith("/code")
          ? { state: "ready", ready: true, needsCode: false, needsPassword: false }
          : { ok: true, stateRoot: `${workspacePath}/.ambient-agent-state/telegram`, sessionCount: 1 },
      } as any;
    }) as any;
    process.env.AMBIENT_AGENT_TELEGRAM_API_ID = "123";
    process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = "secret-hash";
    try {
      store.openWorkspace(workspacePath);
      const thread = store.updateThreadSettings(store.createThread("telegram secure input").id, { permissionMode: "workspace" });
      const permissionRequester = vi.fn(async () => ({ allowed: true, mode: "allow_once" as const }));
      const secureInputRequester = vi.fn(async (request) => {
        expect(request).toMatchObject({
          inputKind: "telegram_login_code",
          inputMode: "text",
          providerId: "telegram-tdlib",
          profileId: "owner",
        });
        expect(JSON.stringify(request)).not.toContain("86420");
        return { allowed: true, value: "86420" };
      });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: permissionRequester,
        denyThread: () => undefined,
      }, {
        secureInputs: {
          request: secureInputRequester,
        },
      });
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      (runtime as any).createMessagingGatewayToolExtension(thread.id, store.getWorkspace())({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const apply = registeredTools.find((tool) => tool.name === "ambient_messaging_telegram_session_apply");

      const result = await apply!.execute("telegram-code", {
        action: "submit_code",
        providerId: "telegram-tdlib",
        profileId: "owner",
      });

      expect(permissionRequester).toHaveBeenCalledTimes(1);
      expect(secureInputRequester).toHaveBeenCalledTimes(1);
      expect(startSpy).toHaveBeenCalledWith({ apiCredentialsPresent: true });
      expect(fetchRequests.find((request) => request.input.endsWith("/sessions/owner/code"))?.body).toEqual({
        profileId: "owner",
        code: "86420",
      });
      expect(result.content[0].text).toContain("Apply status: applied");
      expect(result.details.telegramSessionSetup).toMatchObject({
        kind: "telegram-session-setup",
        providerId: "telegram-tdlib",
        profileId: "owner",
        status: "ready",
        safety: {
          readsProviderMessages: false,
          sendsProviderMessages: false,
          createsBinding: false,
          enablesInboundIngestion: false,
        },
      });
      expect(JSON.stringify(result)).not.toContain("86420");
    } finally {
      statusSpy.mockRestore();
      startSpy.mockRestore();
      globalThis.fetch = originalFetch;
      if (originalEnv.id === undefined) delete process.env.AMBIENT_AGENT_TELEGRAM_API_ID;
      else process.env.AMBIENT_AGENT_TELEGRAM_API_ID = originalEnv.id;
      if (originalEnv.hash === undefined) delete process.env.AMBIENT_AGENT_TELEGRAM_API_HASH;
      else process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = originalEnv.hash;
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("records failed Remote Ambient Surface project switches in gateway status", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-remote-switch-status-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const thread = store.updateThreadSettings(store.createThread("remote switch status").id, { permissionMode: "workspace" });
      const providers = createDefaultMessagingProviderRegistry();
      createMessagingBindingStore({
        stateRoot: store.getWorkspace().statePath,
        providers,
      }).create({
        providerId: "telegram-tdlib",
        authProfileId: "owner-profile",
        conversationId: "owner-chat",
        purpose: "remote_ambient_surface",
        ownerUserId: "owner-1",
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
      });
      const researchProjectPath = join(workspacePath, "research-project");
      const project = (path: string, name: string): ProjectSummary => ({
        id: path,
        path,
        name,
        statePath: join(path, ".ambient-codex"),
        sessionPath: join(path, ".ambient-codex", "sessions"),
        createdAt: "2026-05-10T00:00:00.000Z",
        updatedAt: "2026-05-10T00:00:01.000Z",
        threads: [],
      });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: async () => ({ allowed: true, mode: "allow_once" }),
        denyThread: () => undefined,
      }, {
        projects: {
          listProjects: () => [
            project(workspacePath, "Active project"),
            project(researchProjectPath, "Research project"),
          ],
        },
      });
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      (runtime as any).createMessagingGatewayToolExtension(thread.id, store.getWorkspace())({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const route = registeredTools.find((tool) => tool.name === "ambient_messaging_telegram_bridge_event_route")!;
      const apply = registeredTools.find((tool) => tool.name === "ambient_messaging_remote_surface_command_apply")!;
      const status = registeredTools.find((tool) => tool.name === "ambient_messaging_gateway_status")!;

      const routed = await route.execute("route-switch-project", {
        profileId: "owner-profile",
        conversationId: "owner-chat",
        messageId: "message-switch-project",
        senderId: "owner-1",
        senderLabel: "Owner",
        text: "switch project Research project",
      });
      const queuedProjectionId = routed.details.queuedProjection.id;

      await expect(apply.execute("apply-switch-project", { queuedProjectionId })).rejects.toThrow("Ambient active project switching is not available");

      const gatewayStatus = await status.execute("gateway-status", {});
      expect(gatewayStatus.content[0].text).toContain("Remote Ambient Surface runtime events:");
      expect(gatewayStatus.content[0].text).toContain("Status: failed");
      expect(gatewayStatus.content[0].text).toContain("Project: Research project");
      expect(gatewayStatus.content[0].text).toContain("Relay suggested: yes");
      expect(gatewayStatus.content[0].text).toContain("Relay action status: preview-ready");
      expect(gatewayStatus.content[0].text).toContain(`Provider-neutral relay preview command: ambient_messaging_remote_surface_reply_preview runtimeEventId=${gatewayStatus.details.remoteSurfaceRuntimeEvents[0].id}`);
      expect(gatewayStatus.content[0].text).toContain(`Provider-neutral relay apply command: ambient_messaging_remote_surface_reply_apply runtimeEventId=${gatewayStatus.details.remoteSurfaceRuntimeEvents[0].id}`);
      expect(gatewayStatus.details.remoteSurfaceRelaySummaries).toEqual(expect.arrayContaining([
        expect.objectContaining({
          relayActionStatus: "preview-ready",
          previewToolName: "ambient_messaging_remote_surface_reply_preview",
          applyToolName: "ambient_messaging_remote_surface_reply_apply",
          duplicateBlocked: false,
        }),
      ]));
      expect(gatewayStatus.details.remoteSurfaceRuntimeEvents).toMatchObject([
        {
          kind: "active_project_switch",
          status: "failed",
          queuedProjectionId,
          projectName: "Research project",
          relaySuggested: true,
        },
      ]);
      expect(gatewayStatus.details.pendingRemoteSurfaceRuntimeEventCount).toBe(0);
      expect(gatewayStatus.details.recentRemoteSurfaceRuntimeEventCount).toBe(1);
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("applies Remote Ambient Surface project switches immediately outside an active Pi run", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-remote-switch-immediate-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const thread = store.updateThreadSettings(store.createThread("remote switch immediate").id, { permissionMode: "workspace" });
      const providers = createDefaultMessagingProviderRegistry();
      createMessagingBindingStore({
        stateRoot: store.getWorkspace().statePath,
        providers,
      }).create({
        providerId: "telegram-tdlib",
        authProfileId: "owner-profile",
        conversationId: "owner-chat",
        purpose: "remote_ambient_surface",
        ownerUserId: "owner-1",
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
      });
      const researchProjectPath = join(workspacePath, "research-project");
      const project = (path: string, name: string): ProjectSummary => ({
        id: path,
        path,
        name,
        statePath: join(path, ".ambient-codex"),
        sessionPath: join(path, ".ambient-codex", "sessions"),
        createdAt: "2026-05-10T00:00:00.000Z",
        updatedAt: "2026-05-10T00:00:01.000Z",
        threads: [],
      });
      const switchCalls: Array<{ workspacePath: string; reason: string }> = [];
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: async () => ({ allowed: true, mode: "allow_once" }),
        denyThread: () => undefined,
      }, {
        projects: {
          listProjects: () => [
            project(workspacePath, "Active project"),
            project(researchProjectPath, "Research project"),
          ],
          switchProject: (input) => {
            switchCalls.push(input);
          },
        },
      });
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      (runtime as any).createMessagingGatewayToolExtension(thread.id, store.getWorkspace())({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const route = registeredTools.find((tool) => tool.name === "ambient_messaging_telegram_bridge_event_route")!;
      const apply = registeredTools.find((tool) => tool.name === "ambient_messaging_remote_surface_command_apply")!;
      const status = registeredTools.find((tool) => tool.name === "ambient_messaging_gateway_status")!;

      const routed = await route.execute("route-switch-project", {
        profileId: "owner-profile",
        conversationId: "owner-chat",
        messageId: "message-switch-project",
        senderId: "owner-1",
        senderLabel: "Owner",
        text: "switch project Research project",
      });
      const queuedProjectionId = routed.details.queuedProjection.id;

      const result = await apply.execute("apply-switch-project", { queuedProjectionId });

      expect(result.content[0].text).toContain("Completed active project switch: Research project");
      expect(result.details).toMatchObject({
        status: "applied",
        commandStatus: "ready",
        completedProjectSwitch: {
          path: researchProjectPath,
          name: "Research project",
        },
      });
      expect(switchCalls).toEqual([{ workspacePath: researchProjectPath, reason: "remote-surface-command:switch_project" }]);

      const gatewayStatus = await status.execute("gateway-status", {});
      expect(gatewayStatus.content[0].text).toContain("Remote Ambient Surface runtime events:");
      expect(gatewayStatus.content[0].text).toContain("Status: completed");
      expect(gatewayStatus.content[0].text).toContain("Project: Research project");
      expect(gatewayStatus.content[0].text).toContain("Relay suggested: yes");
      expect(gatewayStatus.content[0].text).toContain("Relay action status: preview-ready");
      expect(gatewayStatus.details.remoteSurfaceRuntimeEvents).toMatchObject([
        {
          kind: "active_project_switch",
          status: "completed",
          queuedProjectionId,
          projectName: "Research project",
          relaySuggested: true,
        },
      ]);
      expect(gatewayStatus.details.pendingRemoteSurfaceRuntimeEventCount).toBe(0);
      expect(gatewayStatus.details.recentRemoteSurfaceRuntimeEventCount).toBe(1);
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("records real-mode Telegram runtime event relay outcomes and blocks duplicate sent relays", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-real-relay-"));
    const store = new ProjectStore();
    const originalFetch = globalThis.fetch;
    const originalEnv = {
      apiId: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
      apiHash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
      bridgeUrl: process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL,
      stateRoot: process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT,
    };
    const sentRequests: Array<{ path: string; body: Record<string, unknown> }> = [];
    const jsonResponse = (ok: boolean, status: number, statusText: string, body: Record<string, unknown>) => ({
      ok,
      status,
      statusText,
      json: async () => body,
    });
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const inputUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(inputUrl);
      if ((init?.method ?? "GET") === "GET" && url.pathname === "/") {
        return jsonResponse(true, 200, "OK", {
          ok: true,
          stateRoot: process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT,
          sessionCount: 1,
        }) as any;
      }
      if (init?.method === "POST" && url.pathname === "/sessions/owner-profile/messages/send") {
        const body = typeof init.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : {};
        sentRequests.push({ path: url.pathname, body });
        if (String(body.text ?? "").includes("Failure project")) {
          return jsonResponse(false, 503, "Service Unavailable", { error: "forced relay failure" }) as any;
        }
        return jsonResponse(true, 200, "OK", {
          messageId: `provider-message-${sentRequests.length}`,
          date: "2026-05-10T00:00:10.000Z",
        }) as any;
      }
      return jsonResponse(false, 404, "Not Found", { error: "not found" }) as any;
    }) as any;

    try {
      store.openWorkspace(workspacePath);
      const stateRoot = join(workspacePath, ".ambient-agent-state", "telegram");
      const profileRoot = join(stateRoot, "owner-profile");
      await mkdir(profileRoot, { recursive: true });
      await writeFile(join(profileRoot, "bridge-session.json"), JSON.stringify({
        profileId: "owner-profile",
        phoneNumber: "+15550000000",
        tdlibStateDir: profileRoot,
        databaseEncryptionKey: "test-encryption-key",
      }), "utf8");
      process.env.AMBIENT_AGENT_TELEGRAM_API_ID = "12345";
      process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = "test-api-hash";
      process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = "http://127.0.0.1:8091";
      process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT = stateRoot;

      const thread = store.updateThreadSettings(store.createThread("runtime relay").id, { permissionMode: "workspace" });
      const providers = createDefaultMessagingProviderRegistry();
      const binding = createMessagingBindingStore({
        stateRoot: store.getWorkspace().statePath,
        providers,
      }).create({
        providerId: "telegram-tdlib",
        authProfileId: "owner-profile",
        conversationId: "owner-chat",
        purpose: "remote_ambient_surface",
        ownerUserId: "owner-1",
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
      }).binding;
      const permissionRequests: any[] = [];
      let deniedRuntimeEventId = "";
      const permissionRequester = vi.fn(async (request: any) => {
        permissionRequests.push(request);
        if (
          request.toolName === "ambient_messaging_telegram_bridge_reply_apply" &&
          deniedRuntimeEventId &&
          request.detail.includes(deniedRuntimeEventId)
        ) {
          return { allowed: false, mode: "deny" as const };
        }
        return { allowed: true, mode: "allow_once" as const };
      });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: permissionRequester,
        denyThread: () => undefined,
      });
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      (runtime as any).createMessagingGatewayToolExtension(thread.id, store.getWorkspace())({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const lifecycleApply = registeredTools.find((tool) => tool.name === "ambient_messaging_gateway_lifecycle_apply")!;
      const route = registeredTools.find((tool) => tool.name === "ambient_messaging_telegram_bridge_event_route")!;
      const replyPreview = registeredTools.find((tool) => tool.name === "ambient_messaging_telegram_bridge_reply_preview")!;
      const replyApply = registeredTools.find((tool) => tool.name === "ambient_messaging_telegram_bridge_reply_apply")!;
      const remoteReplyPreview = registeredTools.find((tool) => tool.name === "ambient_messaging_remote_surface_reply_preview")!;
      const remoteReplyApply = registeredTools.find((tool) => tool.name === "ambient_messaging_remote_surface_reply_apply")!;
      const relayDiagnostics = registeredTools.find((tool) => tool.name === "ambient_messaging_telegram_relay_diagnostics")!;
      const status = registeredTools.find((tool) => tool.name === "ambient_messaging_gateway_status")!;

      const lifecycle = await lifecycleApply.execute("start-real", {
        action: "start",
        providerId: "telegram-tdlib",
        mode: "real",
      });
      expect(lifecycle.details.status).toBe("applied");

      const routed = await route.execute("route-owner-message", {
        profileId: "owner-profile",
        conversationId: "owner-chat",
        messageId: "100",
        senderId: "owner-1",
        senderLabel: "Owner",
        text: "status",
      });
      const queuedProjectionId = routed.details.queuedProjection.id;
      const recordRuntimeEvent = (projectName: string, overrides: Record<string, unknown> = {}) => (runtime as any).recordRemoteSurfaceRuntimeEvent({
        kind: "active_project_switch",
        status: "completed",
        title: `Switch to ${projectName}`,
        summary: `Active Ambient project switched to ${projectName}.`,
        threadId: thread.id,
        queuedProjectionId,
        bindingId: binding.id,
        projectName,
        completedAt: "2026-05-10T00:00:09.000Z",
        relaySuggested: true,
        ...overrides,
      });

      const sentEvent = recordRuntimeEvent("Relay success project");
      const diagnostics = await relayDiagnostics.execute("relay-diagnostics", {
        profileId: "owner-profile",
        conversationId: "owner-chat",
      });
      expect(diagnostics.content[0].text).toContain("Bridge mode: real Telegram bridge running");
      expect(diagnostics.content[0].text).toContain(`Event ${sentEvent.id}`);
      expect(diagnostics.details).toMatchObject({
        status: "ready",
        bridgeModeLabel: "real Telegram bridge running",
        canSendOwnerRelayNow: true,
        providerLabel: "Telegram",
        selectedOwnerBindings: [{ bindingId: binding.id }],
        relayableRuntimeEvents: [{ runtimeEventId: sentEvent.id }],
      });
      const sentPreview = await replyPreview.execute("preview-sent-runtime-event", {
        runtimeEventId: sentEvent.id,
      });
      expect(sentPreview.details).toMatchObject({
        status: "ready",
        runtimeEvent: { id: sentEvent.id, status: "completed" },
      });

      const sentResult = await replyApply.execute("apply-sent-runtime-event", {
        runtimeEventId: sentEvent.id,
      });
      expect(sentResult.details).toMatchObject({
        status: "sent",
        delivery: {
          status: "sent",
          runtimeEventId: sentEvent.id,
          sourceProjectionId: queuedProjectionId,
          replyToMessageId: "100",
          providerMessageId: "provider-message-1",
        },
      });
      expect(sentRequests).toHaveLength(1);
      expect(sentRequests[0]).toMatchObject({
        path: "/sessions/owner-profile/messages/send",
        body: {
          chatId: "owner-chat",
          text: "Ambient switched the active project to Relay success project.",
          replyToMessageId: "100",
        },
      });
      const sentPermission = permissionRequests.find((request) =>
        request.toolName === "ambient_messaging_telegram_bridge_reply_apply" &&
        request.detail.includes(sentEvent.id));
      expect(sentPermission?.detail).toContain(`Runtime event: ${sentEvent.id}`);
      expect(sentPermission?.detail).toContain("Conversation: owner-chat");
      expect(sentPermission?.detail).toContain("Reply to provider message: 100");
      expect(sentPermission?.detail).toContain("Exact text: Ambient switched the active project to Relay success project.");

      const statusAfterSent = await status.execute("status-after-sent", {});
      expect(statusAfterSent.content[0].text).toContain(`Runtime event: ${sentEvent.id}`);
      expect(statusAfterSent.content[0].text).toContain("Relay status: sent");
      expect(statusAfterSent.details.remoteSurfaceRuntimeEvents.find((event: any) => event.id === sentEvent.id)).toMatchObject({
        relayStatus: "sent",
        relayProviderId: "telegram-tdlib",
        relaySuggested: false,
      });

      const duplicateResult = await replyApply.execute("apply-duplicate-runtime-event", {
        runtimeEventId: sentEvent.id,
      });
      expect(duplicateResult.details.status).toBe("blocked");
      expect(duplicateResult.content[0].text).toContain("Remote Ambient Surface runtime event has already been relayed.");
      expect(sentRequests).toHaveLength(1);
      const statusAfterDuplicate = await status.execute("status-after-duplicate", {});
      expect(statusAfterDuplicate.details.remoteSurfaceRuntimeEvents.find((event: any) => event.id === sentEvent.id)).toMatchObject({
        relayStatus: "sent",
        relaySuggested: false,
      });

      const aliasEvent = recordRuntimeEvent("Relay alias project");
      const aliasPreview = await remoteReplyPreview.execute("preview-alias-runtime-event", {
        runtimeEventId: aliasEvent.id,
      });
      expect(aliasPreview.content[0].text).toContain("Remote Ambient Surface reply preview");
      expect(aliasPreview.content[0].text).toContain("Delegated tool: ambient_messaging_telegram_bridge_reply_preview");
      expect(aliasPreview.details).toMatchObject({
        status: "ready",
        delegatedToolName: "ambient_messaging_telegram_bridge_reply_preview",
        delegatedProviderId: "telegram-tdlib",
        runtimeEvent: { id: aliasEvent.id, status: "completed" },
      });

      const aliasResult = await remoteReplyApply.execute("apply-alias-runtime-event", {
        runtimeEventId: aliasEvent.id,
      });
      expect(aliasResult.content[0].text).toContain("Remote Ambient Surface reply apply");
      expect(aliasResult.content[0].text).toContain("Delegated tool: ambient_messaging_telegram_bridge_reply_apply");
      expect(aliasResult.details).toMatchObject({
        status: "sent",
        delegatedToolName: "ambient_messaging_telegram_bridge_reply_apply",
        delegatedProviderId: "telegram-tdlib",
        delivery: {
          status: "sent",
          runtimeEventId: aliasEvent.id,
          sourceProjectionId: queuedProjectionId,
          replyToMessageId: "100",
          providerMessageId: "provider-message-2",
        },
      });
      expect(sentRequests).toHaveLength(2);
      expect(sentRequests[1]).toMatchObject({
        path: "/sessions/owner-profile/messages/send",
        body: {
          chatId: "owner-chat",
          text: "Ambient switched the active project to Relay alias project.",
          replyToMessageId: "100",
        },
      });

      const expiredProjectionEvent = recordRuntimeEvent("Expired projection project", {
        queuedProjectionId: "projection-telegram-expired",
        sourceEventId: "telegram-owner-profile-owner-chat-101",
      });
      const expiredProjectionPreview = await remoteReplyPreview.execute("preview-expired-projection-runtime-event", {
        runtimeEventId: expiredProjectionEvent.id,
      });
      expect(expiredProjectionPreview.content[0].text).toContain("Remote Ambient Surface reply preview");
      expect(expiredProjectionPreview.content[0].text).toContain("Delegated tool: ambient_messaging_telegram_bridge_reply_preview");
      expect(expiredProjectionPreview.details).toMatchObject({
        status: "ready",
        delegatedToolName: "ambient_messaging_telegram_bridge_reply_preview",
        delegatedProviderId: "telegram-tdlib",
        queuedProjectionId: "projection-telegram-expired",
        replyToMessageId: "101",
        runtimeEvent: { id: expiredProjectionEvent.id, status: "completed" },
      });

      const expiredProjectionResult = await remoteReplyApply.execute("apply-expired-projection-runtime-event", {
        runtimeEventId: expiredProjectionEvent.id,
      });
      expect(expiredProjectionResult.details).toMatchObject({
        status: "sent",
        delegatedToolName: "ambient_messaging_telegram_bridge_reply_apply",
        delegatedProviderId: "telegram-tdlib",
        delivery: {
          status: "sent",
          runtimeEventId: expiredProjectionEvent.id,
          sourceProjectionId: "projection-telegram-expired",
          replyToMessageId: "101",
          providerMessageId: "provider-message-3",
        },
      });
      expect(sentRequests).toHaveLength(3);
      expect(sentRequests[2]).toMatchObject({
        path: "/sessions/owner-profile/messages/send",
        body: {
          chatId: "owner-chat",
          text: "Ambient switched the active project to Expired projection project.",
          replyToMessageId: "101",
        },
      });

      const unsupportedProviderEvent = recordRuntimeEvent("Unsupported provider project", {
        queuedProjectionId: "projection-unsupported-provider",
        sourceEventId: "telegram-owner-profile-owner-chat-102",
        relayProviderId: "matrix-bridge",
      });
      const unsupportedProviderStatus = await status.execute("status-unsupported-provider", {});
      const unsupportedSummary = unsupportedProviderStatus.details.remoteSurfaceRelaySummaries.find((summary: any) => summary.runtimeEventId === unsupportedProviderEvent.id);
      expect(unsupportedSummary).toMatchObject({
        relayActionStatus: "repair-needed",
        targetProviderId: "matrix-bridge",
        previewToolName: "ambient_messaging_remote_surface_reply_preview",
        previewCommand: `ambient_messaging_remote_surface_reply_preview runtimeEventId=${unsupportedProviderEvent.id}`,
      });
      expect(unsupportedSummary.applyToolName).toBeUndefined();
      const unsupportedProviderPreview = await remoteReplyPreview.execute("preview-unsupported-provider-runtime-event", {
        runtimeEventId: unsupportedProviderEvent.id,
      });
      expect(unsupportedProviderPreview.details.status).toBe("blocked");
      expect(unsupportedProviderPreview.content[0].text).toContain("Remote Ambient Surface reply alias does not support provider matrix-bridge.");
      expect(unsupportedProviderPreview.content[0].text).toContain("Provider matrix-bridge has no reviewed Remote Ambient Surface reply adapter");
      expect(unsupportedProviderPreview.content[0].text).toContain("Do not use shell, browser, provider desktop apps, provider CLIs, generic messaging tools, or Messaging Connector sends as a workaround.");
      expect(unsupportedProviderPreview.content[0].text).not.toContain("Delegated tool:");
      const unsupportedProviderApply = await remoteReplyApply.execute("apply-unsupported-provider-runtime-event", {
        runtimeEventId: unsupportedProviderEvent.id,
      });
      expect(unsupportedProviderApply.details.status).toBe("blocked");
      expect(unsupportedProviderApply.content[0].text).toContain("Remote Ambient Surface reply alias does not support provider matrix-bridge.");
      expect(sentRequests).toHaveLength(3);

      const failedEvent = recordRuntimeEvent("Failure project");
      const failedResult = await replyApply.execute("apply-failed-runtime-event", {
        runtimeEventId: failedEvent.id,
      });
      expect(failedResult.details).toMatchObject({
        status: "failed",
        delivery: {
          status: "failed",
          runtimeEventId: failedEvent.id,
        },
      });
      expect(failedResult.details.delivery.error).toContain("HTTP 503 Service Unavailable");
      expect(sentRequests).toHaveLength(4);

      const deniedEvent = recordRuntimeEvent("Denied project");
      deniedRuntimeEventId = deniedEvent.id;
      const deniedResult = await replyApply.execute("apply-denied-runtime-event", {
        runtimeEventId: deniedEvent.id,
      });
      expect(deniedResult.details).toMatchObject({
        status: "denied",
        delivery: {
          status: "denied",
          runtimeEventId: deniedEvent.id,
        },
      });
      expect(sentRequests).toHaveLength(4);

      const finalStatus = await status.execute("final-status", {});
      expect(finalStatus.details.remoteSurfaceRuntimeEvents.find((event: any) => event.id === failedEvent.id)).toMatchObject({
        relayStatus: "failed",
        relayError: expect.stringContaining("HTTP 503 Service Unavailable"),
        relaySuggested: true,
      });
      expect(finalStatus.details.remoteSurfaceRuntimeEvents.find((event: any) => event.id === deniedEvent.id)).toMatchObject({
        relayStatus: "denied",
        relaySuggested: true,
      });
    } finally {
      globalThis.fetch = originalFetch;
      if (originalEnv.apiId === undefined) delete process.env.AMBIENT_AGENT_TELEGRAM_API_ID;
      else process.env.AMBIENT_AGENT_TELEGRAM_API_ID = originalEnv.apiId;
      if (originalEnv.apiHash === undefined) delete process.env.AMBIENT_AGENT_TELEGRAM_API_HASH;
      else process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = originalEnv.apiHash;
      if (originalEnv.bridgeUrl === undefined) delete process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL;
      else process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = originalEnv.bridgeUrl;
      if (originalEnv.stateRoot === undefined) delete process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT;
      else process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT = originalEnv.stateRoot;
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("records Signal runtime event relay outcomes through the reviewed bridge reply contract", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-signal-relay-"));
    const store = new ProjectStore();
    const originalFetch = globalThis.fetch;
    const originalEnv = {
      bridgeUrl: process.env.AMBIENT_SIGNAL_BRIDGE_URL,
      fakeUnreadApply: process.env.AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY,
      signalCliPath: process.env.AMBIENT_SIGNAL_CLI_PATH,
      signalCliConfigDir: process.env.AMBIENT_SIGNAL_CLI_CONFIG_DIR,
    };
    const sentRequests: Array<{ path: string; body: Record<string, unknown> }> = [];
    const jsonResponse = (ok: boolean, status: number, statusText: string, body: Record<string, unknown>) => ({
      ok,
      status,
      statusText,
      json: async () => body,
    });
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const inputUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(inputUrl);
      if ((init?.method ?? "GET") === "GET" && url.pathname === "/") {
        return jsonResponse(true, 200, "OK", {
          ok: true,
          providerId: "signal-cli",
          contract: { kind: "ambient-signal-local-bridge", version: "v0" },
          stateRoot: workspacePath,
          profileCount: 1,
          capabilities: {
            profileStatus: true,
            metadataOnlyConversationDirectory: true,
            boundedUnreadWindow: true,
            approvedReplySend: true,
          },
        }) as any;
      }
      if ((init?.method ?? "GET") === "GET" && url.pathname === "/profiles/owner-profile/status") {
        return jsonResponse(true, 200, "OK", {
          ok: true,
          providerId: "signal-cli",
          profileId: "owner-profile",
          ready: true,
          accountIdentifierPresent: true,
          linkedDevicePresent: true,
          registrationMetadataPresent: true,
          bridgeSessionReadable: true,
        }) as any;
      }
      if ((init?.method ?? "GET") === "GET" && url.pathname === "/profiles/owner-profile/conversations/owner-chat/unread") {
        return jsonResponse(true, 200, "OK", {
          ok: true,
          providerId: "signal-cli",
          profileId: "owner-profile",
          conversationId: "owner-chat",
          messages: [{
            messageId: "signal-message-100",
            senderId: "owner-1",
            senderLabel: "Owner",
            text: "switch project Signal relay project",
            receivedAt: "2026-05-10T00:00:08.000Z",
            outgoing: false,
          }],
        }) as any;
      }
      if (init?.method === "POST" && url.pathname === "/profiles/owner-profile/conversations/owner-chat/send") {
        const body = typeof init.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : {};
        sentRequests.push({ path: url.pathname, body });
        return jsonResponse(true, 200, "OK", {
          ok: true,
          messageId: `signal-provider-message-${sentRequests.length}`,
          sentAt: "2026-05-10T00:00:10.000Z",
        }) as any;
      }
      return jsonResponse(false, 404, "Not Found", { ok: false }) as any;
    }) as any;

    try {
      store.openWorkspace(workspacePath);
      const stateRoot = join(workspacePath, ".ambient-agent-state", "signal");
      const profileRoot = join(stateRoot, "owner-profile");
      await mkdir(profileRoot, { recursive: true });
      await writeFile(join(profileRoot, "bridge-session.json"), JSON.stringify({
        profileId: "owner-profile",
        signalCliConfigDir: profileRoot,
        accountIdentifierPresent: true,
        linkedDevicePresent: true,
        registrationMetadataPresent: true,
        bridgeSessionReadable: true,
      }), "utf8");
      process.env.AMBIENT_SIGNAL_BRIDGE_URL = "http://127.0.0.1:8092";
      process.env.AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY = "1";
      process.env.AMBIENT_SIGNAL_CLI_PATH = join(workspacePath, "missing-signal-cli");
      process.env.AMBIENT_SIGNAL_CLI_CONFIG_DIR = profileRoot;

      const thread = store.updateThreadSettings(store.createThread("Signal runtime relay").id, { permissionMode: "workspace" });
      const binding = createMessagingBindingStore({
        stateRoot: store.getWorkspace().statePath,
        providers: createDefaultMessagingProviderRegistry(),
      }).create({
        providerId: "signal-cli",
        authProfileId: "owner-profile",
        conversationId: "owner-chat",
        purpose: "remote_ambient_surface",
        ownerUserId: "owner-1",
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
        metadata: {
          setupTool: "ambient_messaging_signal_remote_surface_apply",
          setupShape: "signal-owner-remote-ambient-surface",
          ownerHandoffSourceMessageId: "signal-message-setup",
          initialSeenMessageIds: ["signal-message-setup"],
        },
      }).binding;
      const permissionRequester = vi.fn(async (request: any) => {
        if (
          request.toolName === "ambient_messaging_signal_unread_window_apply" ||
          request.toolName === "ambient_messaging_signal_bridge_reply_apply"
        ) {
          return { allowed: true, mode: "allow_once" as const };
        }
        throw new Error(`Unexpected Signal relay permission request: ${request.title}`);
      });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: permissionRequester,
        denyThread: () => undefined,
      });
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      (runtime as any).createMessagingGatewayToolExtension(thread.id, store.getWorkspace())({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const tool = (name: string) => {
        const found = registeredTools.find((candidate) => candidate.name === name);
        if (!found) throw new Error(`Missing tool ${name}`);
        return found;
      };
      const unreadApply = tool("ambient_messaging_signal_unread_window_apply");
      const relayDiagnostics = tool("ambient_messaging_signal_relay_diagnostics");
      const replyPreview = tool("ambient_messaging_signal_bridge_reply_preview");
      const replyApply = tool("ambient_messaging_signal_bridge_reply_apply");
      const remoteReplyPreview = tool("ambient_messaging_remote_surface_reply_preview");
      const remoteReplyApply = tool("ambient_messaging_remote_surface_reply_apply");
      const status = tool("ambient_messaging_gateway_status");

      const unread = await unreadApply.execute("signal-unread-apply", {
        providerId: "signal-cli",
        bindingId: binding.id,
        profileId: "owner-profile",
        conversationId: "owner-chat",
        limit: 5,
      });
      expect(unread.details).toMatchObject({
        status: "applied",
        acceptedDispatchCount: 1,
        dispatches: [{ messageId: "signal-message-100", accepted: true }],
      });
      const queuedProjectionId = unread.details.dispatches[0].queuedProjectionId;
      if (!queuedProjectionId) {
        throw new Error("Owner command did not produce a queued projection.");
      }
      expect(queuedProjectionId).toBeTruthy();

      const runtimeEvent = (runtime as any).recordRemoteSurfaceRuntimeEvent({
        kind: "active_project_switch",
        status: "completed",
        title: "Switch to Signal relay project",
        summary: "Active Ambient project switched to Signal relay project.",
        threadId: thread.id,
        queuedProjectionId,
        bindingId: binding.id,
        projectName: "Signal relay project",
        completedAt: "2026-05-10T00:00:09.000Z",
        relaySuggested: true,
      });

      const diagnostics = await relayDiagnostics.execute("signal-relay-diagnostics", {
        profileId: "owner-profile",
        conversationId: "owner-chat",
      });
      expect(diagnostics.content[0].text).toContain("Provider: Signal (signal-cli)");
      expect(diagnostics.content[0].text).toContain("Bridge mode: real Signal bridge ready for approved replies");
      expect(diagnostics.content[0].text).toContain(`Event ${runtimeEvent.id}`);
      expect(diagnostics.details).toMatchObject({
        status: "ready",
        canSendOwnerRelayNow: true,
        providerLabel: "Signal",
        selectedOwnerBindings: [{ bindingId: binding.id }],
        relayableRuntimeEvents: [{ runtimeEventId: runtimeEvent.id }],
      });

      const preview = await remoteReplyPreview.execute("signal-runtime-reply-preview", {
        runtimeEventId: runtimeEvent.id,
      });
      expect(preview.content[0].text).toContain("Delegated tool: ambient_messaging_signal_bridge_reply_preview");
      expect(preview.details).toMatchObject({
        status: "ready",
        delegatedToolName: "ambient_messaging_signal_bridge_reply_preview",
        delegatedProviderId: "signal-cli",
        runtimeEvent: { id: runtimeEvent.id, status: "completed" },
        replyToMessageId: "signal-message-100",
        text: "Ambient switched the active project to Signal relay project.",
      });

      const sent = await remoteReplyApply.execute("signal-runtime-reply-apply", {
        runtimeEventId: runtimeEvent.id,
      });
      expect(sent.content[0].text).toContain("Delegated tool: ambient_messaging_signal_bridge_reply_apply");
      expect(sent.details).toMatchObject({
        status: "sent",
        delegatedToolName: "ambient_messaging_signal_bridge_reply_apply",
        delegatedProviderId: "signal-cli",
        delivery: {
          status: "sent",
          runtimeEventId: runtimeEvent.id,
          sourceProjectionId: queuedProjectionId,
          replyToMessageId: "signal-message-100",
          providerMessageId: "signal-provider-message-1",
        },
      });
      expect(sentRequests).toEqual([{
        path: "/profiles/owner-profile/conversations/owner-chat/send",
        body: {
          text: "Ambient switched the active project to Signal relay project.",
          replyToMessageId: "signal-message-100",
        },
      }]);
      const replyPermission = permissionRequester.mock.calls
        .map((call) => call[0])
        .find((request) => request.toolName === "ambient_messaging_signal_bridge_reply_apply");
      expect(replyPermission?.detail).toContain(`Runtime event: ${runtimeEvent.id}`);
      expect(replyPermission?.detail).toContain("Exact text: Ambient switched the active project to Signal relay project.");

      const statusAfterSent = await status.execute("signal-status-after-sent", {});
      expect(statusAfterSent.content[0].text).toContain(`Runtime event: ${runtimeEvent.id}`);
      expect(statusAfterSent.content[0].text).toContain("Relay status: sent");
      expect(statusAfterSent.content[0].text).toContain("Relay action status: already-relayed");
      expect(statusAfterSent.content[0].text).toContain("Duplicate blocked: yes");
      expect(statusAfterSent.details.remoteSurfaceRuntimeEvents.find((event: any) => event.id === runtimeEvent.id)).toMatchObject({
        relayStatus: "sent",
        relayProviderId: "signal-cli",
        relaySuggested: false,
      });
      expect(statusAfterSent.details.remoteSurfaceRelaySummaries).toEqual(expect.arrayContaining([
        expect.objectContaining({
          runtimeEventId: runtimeEvent.id,
          relayActionStatus: "already-relayed",
          duplicateBlocked: true,
          targetProviderId: "signal-cli",
        }),
      ]));

      const duplicate = await replyApply.execute("signal-runtime-reply-duplicate", {
        runtimeEventId: runtimeEvent.id,
      });
      expect(duplicate.details.status).toBe("blocked");
      expect(duplicate.content[0].text).toContain("Remote Ambient Surface runtime event has already been relayed.");
      expect(sentRequests).toHaveLength(1);

      const expiredProjectionEvent = (runtime as any).recordRemoteSurfaceRuntimeEvent({
        kind: "active_project_switch",
        status: "completed",
        title: "Switch to Signal expired projection project",
        summary: "Active Ambient project switched to Signal expired projection project.",
        threadId: thread.id,
        queuedProjectionId: "projection-signal-expired",
        sourceEventId: "signal-owner-profile-owner-chat-signal-message-101",
        bindingId: binding.id,
        projectName: "Signal expired projection project",
        completedAt: "2026-05-10T00:00:11.000Z",
        relaySuggested: true,
      });
      const expiredProjectionPreview = await remoteReplyPreview.execute("signal-expired-projection-reply-preview", {
        runtimeEventId: expiredProjectionEvent.id,
      });
      expect(expiredProjectionPreview.content[0].text).toContain("Remote Ambient Surface reply preview");
      expect(expiredProjectionPreview.content[0].text).toContain("Delegated tool: ambient_messaging_signal_bridge_reply_preview");
      expect(expiredProjectionPreview.details).toMatchObject({
        status: "ready",
        delegatedToolName: "ambient_messaging_signal_bridge_reply_preview",
        delegatedProviderId: "signal-cli",
        queuedProjectionId: "projection-signal-expired",
        replyToMessageId: "signal-message-101",
        runtimeEvent: { id: expiredProjectionEvent.id, status: "completed" },
      });

      const expiredProjectionSent = await remoteReplyApply.execute("signal-expired-projection-reply-apply", {
        runtimeEventId: expiredProjectionEvent.id,
      });
      expect(expiredProjectionSent.content[0].text).toContain("Remote Ambient Surface reply apply");
      expect(expiredProjectionSent.content[0].text).toContain("Delegated tool: ambient_messaging_signal_bridge_reply_apply");
      expect(expiredProjectionSent.details).toMatchObject({
        status: "sent",
        delegatedToolName: "ambient_messaging_signal_bridge_reply_apply",
        delegatedProviderId: "signal-cli",
        delivery: {
          status: "sent",
          runtimeEventId: expiredProjectionEvent.id,
          sourceProjectionId: "projection-signal-expired",
          replyToMessageId: "signal-message-101",
          providerMessageId: "signal-provider-message-2",
        },
      });
      expect(sentRequests).toEqual([{
        path: "/profiles/owner-profile/conversations/owner-chat/send",
        body: {
          text: "Ambient switched the active project to Signal relay project.",
          replyToMessageId: "signal-message-100",
        },
      }, {
        path: "/profiles/owner-profile/conversations/owner-chat/send",
        body: {
          text: "Ambient switched the active project to Signal expired projection project.",
          replyToMessageId: "signal-message-101",
        },
      }]);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalEnv.bridgeUrl === undefined) delete process.env.AMBIENT_SIGNAL_BRIDGE_URL;
      else process.env.AMBIENT_SIGNAL_BRIDGE_URL = originalEnv.bridgeUrl;
      if (originalEnv.fakeUnreadApply === undefined) delete process.env.AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY;
      else process.env.AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY = originalEnv.fakeUnreadApply;
      if (originalEnv.signalCliPath === undefined) delete process.env.AMBIENT_SIGNAL_CLI_PATH;
      else process.env.AMBIENT_SIGNAL_CLI_PATH = originalEnv.signalCliPath;
      if (originalEnv.signalCliConfigDir === undefined) delete process.env.AMBIENT_SIGNAL_CLI_CONFIG_DIR;
      else process.env.AMBIENT_SIGNAL_CLI_CONFIG_DIR = originalEnv.signalCliConfigDir;
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  itManualTelegramRelaySmoke("manual real Telegram runtime relay smoke", async () => {
    const profileId = process.env.AMBIENT_MANUAL_TELEGRAM_PROFILE_ID?.trim();
    const conversationId = process.env.AMBIENT_MANUAL_TELEGRAM_CONVERSATION_ID?.trim();
    const ownerUserId = process.env.AMBIENT_MANUAL_TELEGRAM_OWNER_USER_ID?.trim();
    const messageId = process.env.AMBIENT_MANUAL_TELEGRAM_MESSAGE_ID?.trim();
    if (!profileId || !conversationId || !ownerUserId || !messageId) {
      throw new Error([
        "Manual Telegram relay smoke requires:",
        "AMBIENT_MANUAL_TELEGRAM_PROFILE_ID",
        "AMBIENT_MANUAL_TELEGRAM_CONVERSATION_ID",
        "AMBIENT_MANUAL_TELEGRAM_OWNER_USER_ID",
        "AMBIENT_MANUAL_TELEGRAM_MESSAGE_ID",
      ].join(" "));
    }

    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-manual-telegram-relay-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const thread = store.updateThreadSettings(store.createThread("manual Telegram relay smoke").id, { permissionMode: "workspace" });
      const providers = createDefaultMessagingProviderRegistry();
      const binding = createMessagingBindingStore({
        stateRoot: store.getWorkspace().statePath,
        providers,
      }).create({
        providerId: "telegram-tdlib",
        authProfileId: profileId,
        conversationId,
        purpose: "remote_ambient_surface",
        ownerUserId,
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
      }).binding;
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: async (request) => {
          if (
            request.toolName === "ambient_messaging_gateway_lifecycle_apply" ||
            request.toolName === "ambient_messaging_telegram_bridge_reply_apply" ||
            request.toolName === "ambient_messaging_telegram_remote_surface_apply"
          ) {
            return { allowed: true, mode: "allow_once" };
          }
          throw new Error(`Unexpected manual Telegram smoke permission request: ${request.title}`);
        },
        denyThread: () => undefined,
      });
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      (runtime as any).createMessagingGatewayToolExtension(thread.id, store.getWorkspace())({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const tool = (name: string) => {
        const found = registeredTools.find((candidate) => candidate.name === name);
        if (!found) throw new Error(`Missing tool ${name}`);
        return found;
      };
      const lifecycleApply = tool("ambient_messaging_gateway_lifecycle_apply");
      const route = tool("ambient_messaging_telegram_bridge_event_route");
      const diagnostics = tool("ambient_messaging_telegram_relay_diagnostics");
      const preview = tool("ambient_messaging_telegram_bridge_reply_preview");
      const apply = tool("ambient_messaging_telegram_bridge_reply_apply");
      const status = tool("ambient_messaging_gateway_status");
      const remoteSurfaceApply = tool("ambient_messaging_telegram_remote_surface_apply");

      const lifecycle = await lifecycleApply.execute("manual-start-real", {
        action: "start",
        providerId: "telegram-tdlib",
        mode: "real",
      });
      expect(lifecycle.details.status).toBe("applied");
      const routed = await route.execute("manual-route-owner-message", {
        profileId,
        conversationId,
        messageId,
        senderId: ownerUserId,
        senderLabel: "Owner",
        text: "status",
      });
      const runtimeEvent = (runtime as any).recordRemoteSurfaceRuntimeEvent({
        kind: "active_project_switch",
        status: "completed",
        title: "Manual Telegram relay smoke",
        summary: "Manual Telegram relay smoke completed.",
        threadId: thread.id,
        queuedProjectionId: routed.details.queuedProjection.id,
        bindingId: binding.id,
        projectName: "Manual Telegram relay smoke",
        completedAt: new Date().toISOString(),
        relaySuggested: true,
      });

      expect((await diagnostics.execute("manual-diagnostics", {
        profileId,
        conversationId,
      })).details.status).toBe("ready");
      expect((await preview.execute("manual-preview", { runtimeEventId: runtimeEvent.id })).details.status).toBe("ready");
      const sent = await apply.execute("manual-apply", { runtimeEventId: runtimeEvent.id });
      expect(sent.details.status).toBe("sent");
      expect((await status.execute("manual-status-after-send", {})).content[0].text).toContain("Relay status: sent");
      const duplicate = await apply.execute("manual-duplicate-apply", { runtimeEventId: runtimeEvent.id });
      expect(duplicate.details.status).toBe("blocked");
      const revoked = await remoteSurfaceApply.execute("manual-revoke", {
        action: "revoke",
        bindingId: binding.id,
        reason: "manual Telegram relay smoke cleanup",
      });
      expect(revoked.details.status).toBe("applied");
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  }, 120_000);

  itManualTelegramDirectorySmoke("manual real Telegram conversation directory smoke", async () => {
    const profileId = process.env.AMBIENT_MANUAL_TELEGRAM_PROFILE_ID?.trim();
    const stateRoot = process.env.AMBIENT_MANUAL_TELEGRAM_STATE_ROOT?.trim()
      || process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT?.trim();
    const query = process.env.AMBIENT_MANUAL_TELEGRAM_DIRECTORY_QUERY?.trim();
    const limit = Number(process.env.AMBIENT_MANUAL_TELEGRAM_DIRECTORY_LIMIT ?? "5");
    const ownerUserId = process.env.AMBIENT_MANUAL_TELEGRAM_OWNER_USER_ID?.trim()
      || process.env.AMBIENT_MANUAL_TELEGRAM_DIRECTORY_OWNER_USER_ID?.trim();
    const routeMessageId = process.env.AMBIENT_MANUAL_TELEGRAM_MESSAGE_ID?.trim()
      || `manual-directory-${Date.now()}`;
    if (!profileId || !stateRoot || !ownerUserId || !process.env.AMBIENT_AGENT_TELEGRAM_API_ID?.trim() || !process.env.AMBIENT_AGENT_TELEGRAM_API_HASH?.trim()) {
      throw new Error(manualTelegramDirectorySmokeChecklist({
        profileId,
        stateRoot,
        ownerUserId,
        apiCredentialsPresent: Boolean(process.env.AMBIENT_AGENT_TELEGRAM_API_ID?.trim() && process.env.AMBIENT_AGENT_TELEGRAM_API_HASH?.trim()),
      }));
    }

    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-manual-telegram-directory-"));
    const store = new ProjectStore();
    const originalEnv = {
      stateRoot: process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT,
    };
    let tool: ((name: string) => { name: string; execute: (...args: any[]) => Promise<any> }) | undefined;
    try {
      process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT = stateRoot;
      store.openWorkspace(workspacePath);
      const thread = store.updateThreadSettings(store.createThread("manual Telegram directory smoke").id, { permissionMode: "workspace" });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: async (request) => {
          if (
            request.toolName === "ambient_messaging_gateway_lifecycle_apply" ||
            request.toolName === "ambient_messaging_telegram_conversation_directory_apply" ||
            request.toolName === "ambient_messaging_telegram_remote_surface_apply"
          ) {
            return { allowed: true, mode: "allow_once" };
          }
          throw new Error(`Unexpected manual Telegram directory permission request: ${request.title}`);
        },
        denyThread: () => undefined,
      });
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      (runtime as any).createMessagingGatewayToolExtension(thread.id, store.getWorkspace())({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      tool = (name: string) => {
        const found = registeredTools.find((candidate) => candidate.name === name);
        if (!found) throw new Error(`Missing tool ${name}`);
        return found;
      };

      const lifecycle = await tool("ambient_messaging_gateway_lifecycle_apply").execute("manual-start-real", {
        action: "start",
        providerId: "telegram-tdlib",
        mode: "real",
      });
      expect(lifecycle.details.status).toBe("applied");

      const directoryInput = {
        profileId,
        limit: Number.isFinite(limit) ? limit : 5,
        ...(query ? { query } : {}),
      };
      const preview = await tool("ambient_messaging_telegram_conversation_directory_preview").execute("manual-directory-preview", directoryInput);
      expect(preview.details.status).toBe("ready");
      expect(preview.content[0].text).toContain("metadataOnly=true");

      const result = await tool("ambient_messaging_telegram_conversation_directory_apply").execute("manual-directory-apply", directoryInput);
      expect(result.details.status).toBe("applied");
      expect(result.details.failureMode).toBe("none");
      expect(result.details.returnedConversationCount).toBeGreaterThan(0);
      expect(JSON.stringify(result.details.conversations)).not.toContain("lastMessage");
      const conversationId = result.details.conversations[0].conversationId;

      const binding = await tool("ambient_messaging_telegram_remote_surface_apply").execute("manual-binding-apply", {
        action: "create",
        purpose: "remote_ambient_surface",
        profileId,
        conversationId,
        ownerUserId,
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
      });
      expect(binding.details.status).toBe("applied");
      const bindingId = binding.details.lifecycle.binding.id;

      const routed = await tool("ambient_messaging_telegram_bridge_event_route").execute("manual-route-owner-event", {
        profileId,
        conversationId,
        messageId: routeMessageId,
        senderId: ownerUserId,
        senderLabel: "Owner",
        text: "status",
      });
      expect(routed.details.status).toBe("accepted");
      const queuedProjectionId = routed.details.queuedProjection.id;

      const diagnostics = await tool("ambient_messaging_telegram_relay_diagnostics").execute("manual-relay-diagnostics", {
        profileId,
        conversationId,
        bindingId,
      });
      expect(diagnostics.details.status).toBe("ready");

      const replyPreview = await tool("ambient_messaging_telegram_bridge_reply_preview").execute("manual-reply-preview", {
        queuedProjectionId,
        text: "Ambient received your status request.",
      });
      expect(replyPreview.details.status).toBe("ready");

      const revoked = await tool("ambient_messaging_telegram_remote_surface_apply").execute("manual-binding-revoke", {
        action: "revoke",
        bindingId,
        reason: "manual directory-to-binding smoke cleanup",
      });
      expect(revoked.details.status).toBe("applied");

      await tool("ambient_messaging_gateway_lifecycle_apply").execute("manual-stop-real", {
        action: "stop",
        providerId: "telegram-tdlib",
        mode: "real",
      });
    } finally {
      if (originalEnv.stateRoot === undefined) delete process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT;
      else process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT = originalEnv.stateRoot;
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  }, 180_000);

  itManualTelegramDirectoryListSmoke("manual real Telegram metadata-only directory list smoke", async () => {
    const profileId = process.env.AMBIENT_MANUAL_TELEGRAM_PROFILE_ID?.trim();
    const stateRoot = process.env.AMBIENT_MANUAL_TELEGRAM_STATE_ROOT?.trim()
      || process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT?.trim();
    const query = process.env.AMBIENT_MANUAL_TELEGRAM_DIRECTORY_QUERY?.trim();
    const limit = Number(process.env.AMBIENT_MANUAL_TELEGRAM_DIRECTORY_LIMIT ?? "10");
    if (!profileId || !stateRoot || !process.env.AMBIENT_AGENT_TELEGRAM_API_ID?.trim() || !process.env.AMBIENT_AGENT_TELEGRAM_API_HASH?.trim()) {
      throw new Error(manualTelegramDirectoryListSmokeChecklist({
        profileId,
        stateRoot,
        apiCredentialsPresent: Boolean(process.env.AMBIENT_AGENT_TELEGRAM_API_ID?.trim() && process.env.AMBIENT_AGENT_TELEGRAM_API_HASH?.trim()),
      }));
    }

    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-manual-telegram-directory-list-"));
    const store = new ProjectStore();
    const originalEnv = {
      stateRoot: process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT,
    };
    let tool: ((name: string) => { name: string; execute: (...args: any[]) => Promise<any> }) | undefined;
    try {
      process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT = stateRoot;
      store.openWorkspace(workspacePath);
      const thread = store.updateThreadSettings(store.createThread("manual Telegram directory list smoke").id, { permissionMode: "workspace" });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: async (request) => {
          if (
            request.toolName === "ambient_messaging_gateway_lifecycle_apply" ||
            request.toolName === "ambient_messaging_telegram_conversation_directory_apply"
          ) {
            return { allowed: true, mode: "allow_once" };
          }
          throw new Error(`Unexpected manual Telegram directory-list permission request: ${request.title}`);
        },
        denyThread: () => undefined,
      });
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      (runtime as any).createMessagingGatewayToolExtension(thread.id, store.getWorkspace())({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      tool = (name: string) => {
        const found = registeredTools.find((candidate) => candidate.name === name);
        if (!found) throw new Error(`Missing tool ${name}`);
        return found;
      };

      const lifecycle = await tool("ambient_messaging_gateway_lifecycle_apply").execute("manual-directory-list-start-real", {
        action: "start",
        providerId: "telegram-tdlib",
        mode: "real",
      });
      expect(lifecycle.details.status).toBe("applied");

      const directoryInput = {
        profileId,
        limit: Number.isFinite(limit) ? limit : 10,
        ...(query ? { query } : {}),
      };
      const preview = await tool("ambient_messaging_telegram_conversation_directory_preview").execute("manual-directory-list-preview", directoryInput);
      expect(preview.details.status).toBe("ready");
      expect(preview.content[0].text).toContain("metadataOnly=true");

      const result = await tool("ambient_messaging_telegram_conversation_directory_apply").execute("manual-directory-list-apply", directoryInput);
      expect(result.details.status).toBe("applied");
      expect(result.details.failureMode).toBe("none");
      expect(result.details.returnedConversationCount).toBeGreaterThan(0);
      expect(JSON.stringify(result.details.conversations)).not.toContain("lastMessage");
      const conversations = (result.details.conversations as Array<{
        conversationId: string;
        title?: string;
        type?: string;
        unreadCount?: number;
        updatedAt?: string;
      }>).map((conversation) => ({
        conversationId: conversation.conversationId,
        title: conversation.title,
        type: conversation.type,
        unreadCount: conversation.unreadCount,
        updatedAt: conversation.updatedAt,
      }));
      const directoryOutputPath = process.env.AMBIENT_MANUAL_TELEGRAM_DIRECTORY_OUTPUT_PATH?.trim();
      if (directoryOutputPath) {
        await writeFile(directoryOutputPath, JSON.stringify({
          generatedAt: new Date().toISOString(),
          profileId,
          query: query ?? "",
          limit: Number.isFinite(limit) ? limit : 10,
          returnedConversationCount: result.details.returnedConversationCount,
          conversations,
          privacy: {
            metadataOnly: true,
            includesMessageBodies: false,
            includesLastMessage: false,
          },
        }, null, 2), "utf8");
      }
      console.info([
        "Manual Telegram metadata-only directory candidates:",
        JSON.stringify(conversations, null, 2),
      ].join("\n"));

      await tool("ambient_messaging_gateway_lifecycle_apply").execute("manual-directory-list-stop-real", {
        action: "stop",
        providerId: "telegram-tdlib",
        mode: "real",
      });
    } finally {
      if (tool) {
        try {
          await tool("ambient_messaging_gateway_lifecycle_apply").execute("manual-directory-list-stop-real-finally", {
            action: "stop",
            providerId: "telegram-tdlib",
            mode: "real",
          });
        } catch {
          // Best-effort cleanup for manual smoke failures; preserve the original test error.
        }
      }
      if (originalEnv.stateRoot === undefined) delete process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT;
      else process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT = originalEnv.stateRoot;
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  }, 180_000);

  itManualTelegramOwnerHandoffCheckSmoke("manual real Telegram owner handoff check smoke", async () => {
    const profileId = process.env.AMBIENT_MANUAL_TELEGRAM_PROFILE_ID?.trim();
    const stateRoot = process.env.AMBIENT_MANUAL_TELEGRAM_STATE_ROOT?.trim()
      || process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT?.trim();
    const conversationId = process.env.AMBIENT_MANUAL_TELEGRAM_CONVERSATION_ID?.trim();
    const setupCode = process.env.AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SETUP_CODE?.trim();
    const pollLimit = Number(process.env.AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_POLL_LIMIT ?? "10");
    if (
      !profileId ||
      !stateRoot ||
      !conversationId ||
      !setupCode ||
      !process.env.AMBIENT_AGENT_TELEGRAM_API_ID?.trim() ||
      !process.env.AMBIENT_AGENT_TELEGRAM_API_HASH?.trim()
    ) {
      throw new Error(manualTelegramOwnerHandoffCheckSmokeChecklist({
        profileId,
        stateRoot,
        conversationId,
        setupCode,
        apiCredentialsPresent: Boolean(process.env.AMBIENT_AGENT_TELEGRAM_API_ID?.trim() && process.env.AMBIENT_AGENT_TELEGRAM_API_HASH?.trim()),
      }));
    }

    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-manual-telegram-handoff-check-"));
    const store = new ProjectStore();
    const originalEnv = {
      stateRoot: process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT,
    };
    let tool: ((name: string) => { name: string; execute: (...args: any[]) => Promise<any> }) | undefined;
    try {
      process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT = stateRoot;
      store.openWorkspace(workspacePath);
      const thread = store.updateThreadSettings(store.createThread("manual Telegram owner handoff check").id, { permissionMode: "workspace" });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: async (request) => {
          if (
            request.toolName === "ambient_messaging_gateway_lifecycle_apply" ||
            request.toolName === "ambient_messaging_telegram_owner_handoff_apply"
          ) {
            return { allowed: true, mode: "allow_once" };
          }
          throw new Error(`Unexpected manual Telegram owner-handoff check permission request: ${request.title}`);
        },
        denyThread: () => undefined,
      });
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      (runtime as any).createMessagingGatewayToolExtension(thread.id, store.getWorkspace())({
        registerTool: (registeredTool: any) => registeredTools.push(registeredTool),
      });
      tool = (name: string) => {
        const found = registeredTools.find((candidate) => candidate.name === name);
        if (!found) throw new Error(`Missing tool ${name}`);
        return found;
      };

      const lifecycle = await tool("ambient_messaging_gateway_lifecycle_apply").execute("manual-handoff-check-start-real", {
        action: "start",
        providerId: "telegram-tdlib",
        mode: "real",
      });
      expect(lifecycle.details.status).toBe("applied");

      const handoffInput = {
        profileId,
        conversationId,
        setupCode,
        limit: Number.isFinite(pollLimit) ? pollLimit : 10,
      };
      const handoffPreview = await tool("ambient_messaging_telegram_owner_handoff_preview").execute("manual-handoff-check-preview", handoffInput);
      expect(handoffPreview.details.status).toBe("ready");
      expect(handoffPreview.content[0].text).toContain("Returns provider message content: no");
      const handoff = await tool("ambient_messaging_telegram_owner_handoff_apply").execute("manual-handoff-check-apply", handoffInput);
      expect(handoff.details.applyStatus).toBe("applied");
      expect(["matched", "no-match", "ambiguous"]).toContain(handoff.details.handoffStatus);
      if (setupCode.length > 16) {
        expect(JSON.stringify(handoff.details)).not.toContain(setupCode);
        expect(handoff.content[0].text).not.toContain(setupCode);
      }

      console.info([
        "Manual Telegram owner handoff check:",
        JSON.stringify({
          applyStatus: handoff.details.applyStatus,
          handoffStatus: handoff.details.handoffStatus,
          fetchedMessageCount: handoff.details.fetchedMessageCount,
          candidateMessageCount: handoff.details.candidateMessageCount,
          matchedMessageCount: handoff.details.matchedMessageCount,
          matchedSenderCount: handoff.details.matchedSenderCount,
          ownerUserIdPresent: Boolean(handoff.details.ownerUserId),
          sourceMessageIdPresent: Boolean(handoff.details.sourceMessageId),
          errorPresent: Boolean(handoff.details.error),
        }, null, 2),
      ].join("\n"));

      await tool("ambient_messaging_gateway_lifecycle_apply").execute("manual-handoff-check-stop-real", {
        action: "stop",
        providerId: "telegram-tdlib",
        mode: "real",
      });
    } finally {
      if (tool) {
        try {
          await tool("ambient_messaging_gateway_lifecycle_apply").execute("manual-handoff-check-stop-real-finally", {
            action: "stop",
            providerId: "telegram-tdlib",
            mode: "real",
          });
        } catch {
          // Best-effort cleanup for manual smoke failures; preserve the original test error.
        }
      }
      if (originalEnv.stateRoot === undefined) delete process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT;
      else process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT = originalEnv.stateRoot;
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  }, 180_000);

  itManualTelegramGuidedOwnerLoopSmoke("manual guided Telegram owner loop smoke", async () => {
    const profileId = process.env.AMBIENT_MANUAL_TELEGRAM_PROFILE_ID?.trim();
    const stateRoot = process.env.AMBIENT_MANUAL_TELEGRAM_STATE_ROOT?.trim()
      || process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT?.trim();
    const conversationId = process.env.AMBIENT_MANUAL_TELEGRAM_CONVERSATION_ID?.trim();
    const setupCode = process.env.AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SETUP_CODE?.trim();
    const directoryQuery = process.env.AMBIENT_MANUAL_TELEGRAM_DIRECTORY_QUERY?.trim();
    const directoryLimit = Number(process.env.AMBIENT_MANUAL_TELEGRAM_DIRECTORY_LIMIT ?? "10");
    const pollLimit = Number(process.env.AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_POLL_LIMIT ?? "10");
    const waitSeconds = Number(process.env.AMBIENT_MANUAL_TELEGRAM_GUIDED_OWNER_LOOP_WAIT_SECONDS ?? "180");
    const pollIntervalMs = Number(process.env.AMBIENT_MANUAL_TELEGRAM_GUIDED_OWNER_LOOP_POLL_INTERVAL_MS ?? "5000");
    const waitMs = Math.max(1_000, Number.isFinite(waitSeconds) ? waitSeconds * 1_000 : 180_000);
    const intervalMs = Math.max(500, Number.isFinite(pollIntervalMs) ? pollIntervalMs : 5_000);
    const usePollingRunner = process.env.AMBIENT_MANUAL_TELEGRAM_GUIDED_OWNER_LOOP_POLLING_RUNNER === "1";
    const commandText = process.env.AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_COMMAND_TEXT?.trim()
      || "switch project Manual Relay Smoke";
    const commandNotBefore = normalizedIsoFromEnv(
      process.env.AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_COMMAND_NOT_BEFORE,
      "AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_COMMAND_NOT_BEFORE",
    );
    const sendReply = process.env.AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SEND_REPLY === "1";
    const ownerLoopOutputPath = process.env.AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_OUTPUT_PATH?.trim();
    if (
      !profileId ||
      !stateRoot ||
      !conversationId ||
      !setupCode ||
      !process.env.AMBIENT_AGENT_TELEGRAM_API_ID?.trim() ||
      !process.env.AMBIENT_AGENT_TELEGRAM_API_HASH?.trim()
    ) {
      throw new Error(manualTelegramGuidedOwnerLoopSmokeChecklist({
        profileId,
        stateRoot,
        conversationId,
        setupCode,
        apiCredentialsPresent: Boolean(process.env.AMBIENT_AGENT_TELEGRAM_API_ID?.trim() && process.env.AMBIENT_AGENT_TELEGRAM_API_HASH?.trim()),
      }));
    }

    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-manual-telegram-guided-loop-"));
    const store = new ProjectStore();
    const originalEnv = {
      stateRoot: process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT,
    };
    let tool: ((name: string) => { name: string; execute: (...args: any[]) => Promise<any> }) | undefined;
    let bindingId: string | undefined;
    let pollingRunnerStarted = false;
    let currentStep = "configured";
    const setupCodePreview = setupCode.length <= 16 ? setupCode : `${setupCode.slice(0, 8)}...${setupCode.slice(-4)}`;
    const compactPollingStatus = (status: any) => ({
      state: status?.state,
      running: status?.running,
      totalPollCount: status?.totalPollCount,
      successfulPollCount: status?.successfulPollCount,
      failedPollCount: status?.failedPollCount,
      fetchedMessageCount: status?.fetchedMessageCount,
      candidateMessageCount: status?.candidateMessageCount,
      duplicateMessageCount: status?.duplicateMessageCount,
      staleMessageCount: status?.staleMessageCount,
      acceptedDispatchCount: status?.acceptedDispatchCount,
      droppedDispatchCount: status?.droppedDispatchCount,
      lastSuccessfulPollAt: status?.lastSuccessfulPollAt,
      nextPollDueAt: status?.nextPollDueAt,
      lastError: status?.lastError,
    });
    const compactActivationPlan = (details: any) => ({
      status: details?.status,
      recommendedNextTool: details?.recommendedNextTool,
      selectedProfileId: details?.selectedProfileId,
      selectedConversationId: details?.selectedConversationId,
      selectedBindingId: details?.selectedBinding?.bindingId,
      pollingState: details?.polling?.state,
      pollingRunning: details?.polling?.running,
      phaseStatuses: Array.isArray(details?.phases)
        ? details.phases.map((phase: any) => ({
          id: phase.id,
          status: phase.status,
          toolSequence: phase.toolSequence,
        }))
        : [],
    });
    let activationPlanInitialSummary: ReturnType<typeof compactActivationPlan> | undefined;
    let activationPlanAfterBindingSummary: ReturnType<typeof compactActivationPlan> | undefined;
    const writeGuidedOutput = async (patch: Record<string, unknown>) => {
      if (!ownerLoopOutputPath) return;
      let existing: Record<string, unknown> = {};
      try {
        existing = JSON.parse(await readFile(ownerLoopOutputPath, "utf8"));
      } catch {
        existing = {};
      }
      await writeFile(ownerLoopOutputPath, JSON.stringify({
        generatedAt: existing.generatedAt ?? new Date().toISOString(),
        profileId,
        conversationId,
        setupCodePreview,
        commandText,
        sendReply,
        privacy: {
          providerMessageBodiesReturned: false,
          providerHistoryRead: false,
        },
        ...existing,
        ...patch,
        updatedAt: new Date().toISOString(),
      }, null, 2), "utf8");
    };
    try {
      process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT = stateRoot;
      store.openWorkspace(workspacePath);
      const thread = store.updateThreadSettings(store.createThread("manual guided Telegram owner loop smoke").id, { permissionMode: "workspace" });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: async (request) => {
          if (
            request.toolName === "ambient_messaging_gateway_lifecycle_apply" ||
            request.toolName === "ambient_messaging_telegram_conversation_directory_apply" ||
            request.toolName === "ambient_messaging_telegram_owner_handoff_apply" ||
            request.toolName === "ambient_messaging_telegram_remote_surface_apply" ||
            request.toolName === "ambient_messaging_telegram_bridge_poll_apply" ||
            request.toolName === "ambient_messaging_telegram_bridge_polling_apply" ||
            request.toolName === "ambient_messaging_remote_surface_command_apply" ||
            (sendReply && request.toolName === "ambient_messaging_telegram_bridge_reply_apply")
          ) {
            return { allowed: true, mode: "allow_once" };
          }
          throw new Error(`Unexpected manual guided Telegram owner-loop permission request: ${request.title}`);
        },
        denyThread: () => undefined,
      }, manualTelegramOwnerLoopProjectFeatures(workspacePath));
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      (runtime as any).createMessagingGatewayToolExtension(thread.id, store.getWorkspace())({
        registerTool: (registeredTool: any) => registeredTools.push(registeredTool),
      });
      tool = (name: string) => {
        const found = registeredTools.find((candidate) => candidate.name === name);
        if (!found) throw new Error(`Missing tool ${name}`);
        return found;
      };

      currentStep = "activation_plan_initial";
      await writeGuidedOutput({
        status: "running",
        currentStep,
        waitMs,
        intervalMs,
        usePollingRunner,
      });
      const activationPlanInitial = await tool("ambient_messaging_telegram_owner_loop_activation_plan").execute("manual-guided-owner-loop-activation-plan-initial", {
        profileId,
        conversationId,
        setupCode,
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
        limit: Number.isFinite(pollLimit) ? pollLimit : 10,
        intervalMs: Math.max(5_000, intervalMs),
        ...(commandNotBefore ? { minReceivedAt: commandNotBefore } : {}),
      });
      expect(activationPlanInitial.details.toolName).toBe("ambient_messaging_telegram_owner_loop_activation_plan");
      expect(Array.isArray(activationPlanInitial.details.phases)).toBe(true);
      activationPlanInitialSummary = compactActivationPlan(activationPlanInitial.details);
      await writeGuidedOutput({
        currentStep,
        activationPlan: {
          planFirst: true,
          initial: activationPlanInitialSummary,
        },
      });

      currentStep = "starting_gateway";
      const lifecycle = await tool("ambient_messaging_gateway_lifecycle_apply").execute("manual-guided-owner-loop-start-real", {
        action: "start",
        providerId: "telegram-tdlib",
        mode: "real",
      });
      expect(lifecycle.details.status).toBe("applied");
      await writeGuidedOutput({
        currentStep: "gateway_started",
        gateway: {
          providerId: "telegram-tdlib",
          mode: "real",
          status: lifecycle.details.status,
        },
      });

      currentStep = "metadata_directory";
      const directoryInput = {
        profileId,
        limit: Number.isFinite(directoryLimit) ? directoryLimit : 10,
        ...(directoryQuery ? { query: directoryQuery } : {}),
      };
      const directoryPreview = await tool("ambient_messaging_telegram_conversation_directory_preview").execute("manual-guided-owner-loop-directory-preview", directoryInput);
      expect(directoryPreview.details.status).toBe("ready");
      const directoryResult = await tool("ambient_messaging_telegram_conversation_directory_apply").execute("manual-guided-owner-loop-directory-apply", directoryInput);
      expect(directoryResult.details.status).toBe("applied");
      expect(directoryResult.details.failureMode).toBe("none");
      expect(JSON.stringify(directoryResult.details.conversations)).not.toContain("lastMessage");
      const directoryConversationIds = (directoryResult.details.conversations as Array<{ conversationId: string; title?: string }>)
        .map((conversation) => conversation.conversationId);
      await writeGuidedOutput({
        currentStep,
        directory: {
          status: directoryResult.details.status,
          failureMode: directoryResult.details.failureMode,
          returnedConversationCount: directoryResult.details.returnedConversationCount,
          selectedConversationPresent: directoryConversationIds.includes(conversationId),
          metadataOnly: true,
        },
      });
      expect(directoryConversationIds).toContain(conversationId);

      currentStep = "owner_handoff";
      const handoffInput = {
        profileId,
        conversationId,
        setupCode,
        limit: Number.isFinite(pollLimit) ? pollLimit : 10,
      };
      const handoffPreview = await tool("ambient_messaging_telegram_owner_handoff_preview").execute("manual-guided-owner-loop-handoff-preview", handoffInput);
      expect(handoffPreview.details.status).toBe("ready");
      console.info([
        "Manual guided Telegram owner-loop waiting for inbound setup code.",
        JSON.stringify({
          conversationId,
          setupCodePreview,
          waitMs,
          intervalMs,
        }, null, 2),
      ].join("\n"));
      await writeGuidedOutput({
        currentStep,
        handoff: {
          status: "waiting",
          attempts: 0,
        },
      });

      let handoff: any | undefined;
      const handoffDeadline = Date.now() + waitMs;
      let handoffAttempt = 0;
      while (Date.now() <= handoffDeadline) {
        handoffAttempt += 1;
        handoff = await tool("ambient_messaging_telegram_owner_handoff_apply").execute(`manual-guided-owner-loop-handoff-apply-${handoffAttempt}`, handoffInput);
        if (handoff.details.applyStatus !== "applied") {
          throw new Error(`Owner handoff apply returned ${handoff.details.applyStatus}: ${handoff.details.error ?? "no error"}`);
        }
        if (handoff.details.handoffStatus === "matched") {
          await writeGuidedOutput({
            currentStep,
            handoff: {
              status: "matched",
              attempts: handoffAttempt,
              fetchedMessageCount: handoff.details.fetchedMessageCount,
              candidateMessageCount: handoff.details.candidateMessageCount,
              matchedMessageCount: handoff.details.matchedMessageCount,
              ownerUserId: handoff.details.ownerUserId,
              sourceMessageId: handoff.details.sourceMessageId,
            },
          });
          break;
        }
        if (handoff.details.handoffStatus === "ambiguous") {
          await writeGuidedOutput({
            currentStep,
            handoff: {
              status: "ambiguous",
              attempts: handoffAttempt,
              fetchedMessageCount: handoff.details.fetchedMessageCount,
              candidateMessageCount: handoff.details.candidateMessageCount,
              matchedMessageCount: handoff.details.matchedMessageCount,
            },
          });
          throw new Error("Owner handoff became ambiguous; repeat guided smoke with a new setup code.");
        }
        console.info([
          "Manual guided Telegram owner-loop handoff still waiting.",
          JSON.stringify({
            attempt: handoffAttempt,
            fetchedMessageCount: handoff.details.fetchedMessageCount,
            candidateMessageCount: handoff.details.candidateMessageCount,
            matchedMessageCount: handoff.details.matchedMessageCount,
          }, null, 2),
        ].join("\n"));
        await writeGuidedOutput({
          currentStep,
          handoff: {
            status: handoff.details.handoffStatus,
            attempts: handoffAttempt,
            fetchedMessageCount: handoff.details.fetchedMessageCount,
            candidateMessageCount: handoff.details.candidateMessageCount,
            matchedMessageCount: handoff.details.matchedMessageCount,
          },
        });
        await delay(intervalMs);
      }
      if (!handoff) {
        throw new Error("Owner handoff did not run before the guided wait expired.");
      }
      if (handoff.details.handoffStatus !== "matched") {
        throw new Error(`Owner handoff did not match before the guided wait expired: status=${handoff.details.handoffStatus} attempts=${handoffAttempt}. Send the setup code from a separate inbound owner/delegate Telegram account, not from the bridge account.`);
      }
      expect(handoff.details).toMatchObject({
        applyStatus: "applied",
        handoffStatus: "matched",
      });
      const ownerUserId = handoff.details.ownerUserId;
      const ownerHandoffSourceMessageId = handoff.details.sourceMessageId;
      expect(ownerUserId).toBeTruthy();
      expect(ownerHandoffSourceMessageId).toBeTruthy();

      const binding = await tool("ambient_messaging_telegram_remote_surface_apply").execute("manual-guided-owner-loop-binding-apply", {
        action: "create",
        purpose: "remote_ambient_surface",
        profileId,
        conversationId,
        ownerUserId,
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
        ownerHandoffSourceMessageId,
      });
      expect(binding.details.status).toBe("applied");
      bindingId = binding.details.lifecycle.binding.id;
      await writeGuidedOutput({
        currentStep: "binding_created",
        binding: {
          status: binding.details.status,
          bindingId,
          purpose: "remote_ambient_surface",
          ambientSurface: "projects",
        },
      });

      currentStep = "activation_plan_after_binding";
      const activationPlanAfterBinding = await tool("ambient_messaging_telegram_owner_loop_activation_plan").execute("manual-guided-owner-loop-activation-plan-after-binding", {
        profileId,
        conversationId,
        setupCode,
        ownerUserId,
        ownerHandoffSourceMessageId,
        bindingId,
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
        limit: Number.isFinite(pollLimit) ? pollLimit : 10,
        intervalMs: Math.max(5_000, intervalMs),
        ...(commandNotBefore ? { minReceivedAt: commandNotBefore } : {}),
      });
      expect(activationPlanAfterBinding.details.toolName).toBe("ambient_messaging_telegram_owner_loop_activation_plan");
      expect(Array.isArray(activationPlanAfterBinding.details.phases)).toBe(true);
      activationPlanAfterBindingSummary = compactActivationPlan(activationPlanAfterBinding.details);
      await writeGuidedOutput({
        currentStep,
        activationPlan: {
          planFirst: true,
          initial: activationPlanInitialSummary,
          afterBinding: activationPlanAfterBindingSummary,
        },
      });

      let queuedProjectionId: string | undefined;
      if (usePollingRunner) {
        currentStep = "owner_command_polling_runner";
        const pollingIntervalMs = Math.max(5_000, intervalMs);
        console.info([
          "Manual guided Telegram owner-loop starting periodic command polling.",
          JSON.stringify({ conversationId, commandText, waitMs, pollingIntervalMs }, null, 2),
        ].join("\n"));
        const pollingInput = {
          action: "start",
          profileId,
          bindingId,
          limit: Number.isFinite(pollLimit) ? pollLimit : 10,
          intervalMs: pollingIntervalMs,
          ...(commandNotBefore ? { minReceivedAt: commandNotBefore } : {}),
        };
        const pollingPreview = await tool("ambient_messaging_telegram_bridge_polling_preview").execute("manual-guided-owner-loop-polling-preview", pollingInput);
        expect(pollingPreview.details.status).toBe("ready");
        const pollingStart = await tool("ambient_messaging_telegram_bridge_polling_apply").execute("manual-guided-owner-loop-polling-start", pollingInput);
        expect(pollingStart.details.status).toBe("applied");
        pollingRunnerStarted = true;
        const immediatePoll = pollingStart.details.immediatePollResult;
        const acceptedDispatch = immediatePoll?.bindingResults
          ?.flatMap((bindingResult: any) => bindingResult.dispatches)
          .find((dispatch: any) => dispatch.accepted && dispatch.queuedProjection?.id && dispatch.event?.text === commandText);
        if (!acceptedDispatch) {
          await writeGuidedOutput({
            currentStep,
            commandPoll: {
              status: "no-match-via-polling-runner",
              attempts: 1,
              fetchedMessageCount: immediatePoll?.fetchedMessageCount,
              candidateMessageCount: immediatePoll?.candidateMessageCount,
              duplicateMessageCount: immediatePoll?.duplicateMessageCount,
              staleMessageCount: immediatePoll?.staleMessageCount,
              acceptedDispatchCount: immediatePoll?.acceptedDispatchCount,
              droppedDispatchCount: immediatePoll?.droppedDispatchCount,
              minReceivedAt: commandNotBefore,
            },
            pollingRunner: {
              startStatus: pollingStart.details.status,
              runtimeStatus: compactPollingStatus(pollingStart.details.runtimeStatus),
            },
          });
          throw new Error("Periodic Telegram polling runner started but the immediate poll did not accept the expected owner command.");
        }
        queuedProjectionId = acceptedDispatch.queuedProjection.id;
        await writeGuidedOutput({
          currentStep,
          commandPoll: {
            status: "matched-via-polling-runner",
            attempts: 1,
            fetchedMessageCount: immediatePoll.fetchedMessageCount,
            candidateMessageCount: immediatePoll.candidateMessageCount,
            duplicateMessageCount: immediatePoll.duplicateMessageCount,
            staleMessageCount: immediatePoll.staleMessageCount,
            acceptedDispatchCount: immediatePoll.acceptedDispatchCount,
            droppedDispatchCount: immediatePoll.droppedDispatchCount,
            minReceivedAt: commandNotBefore,
            queuedProjectionId,
            sourceEventId: acceptedDispatch.event?.id,
            sourceReceivedAt: acceptedDispatch.event?.receivedAt,
          },
          pollingRunner: {
            startStatus: pollingStart.details.status,
            intervalMs: pollingIntervalMs,
            runtimeStatus: compactPollingStatus(pollingStart.details.runtimeStatus),
          },
        });

        const scheduledDeadline = Date.now() + Math.min(waitMs, pollingIntervalMs * 3 + 2_000);
        let pollingStatus: any | undefined;
        while (Date.now() <= scheduledDeadline) {
          pollingStatus = await tool("ambient_messaging_telegram_bridge_polling_status").execute("manual-guided-owner-loop-polling-status-scheduled", {});
          if ((pollingStatus.details.telegramBridgePolling?.totalPollCount ?? 0) >= 2) {
            break;
          }
          await delay(500);
        }
        const scheduledRuntimeStatus = pollingStatus?.details.telegramBridgePolling;
        if ((scheduledRuntimeStatus?.totalPollCount ?? 0) < 2) {
          throw new Error(`Periodic Telegram polling runner did not complete a scheduled tick before timeout; totalPollCount=${scheduledRuntimeStatus?.totalPollCount ?? 0}.`);
        }
        await writeGuidedOutput({
          currentStep,
          pollingRunner: {
            startStatus: pollingStart.details.status,
            intervalMs: pollingIntervalMs,
            runtimeStatus: compactPollingStatus(pollingStart.details.runtimeStatus),
            scheduledStatus: compactPollingStatus(scheduledRuntimeStatus),
          },
        });
        const pollingStop = await tool("ambient_messaging_telegram_bridge_polling_apply").execute("manual-guided-owner-loop-polling-stop", {
          action: "stop",
          profileId,
          bindingId,
          limit: Number.isFinite(pollLimit) ? pollLimit : 10,
          intervalMs: pollingIntervalMs,
          ...(commandNotBefore ? { minReceivedAt: commandNotBefore } : {}),
        });
        expect(pollingStop.details.status).toBe("applied");
        pollingRunnerStarted = false;
        await writeGuidedOutput({
          currentStep,
          pollingRunner: {
            startStatus: pollingStart.details.status,
            intervalMs: pollingIntervalMs,
            runtimeStatus: compactPollingStatus(pollingStart.details.runtimeStatus),
            scheduledStatus: compactPollingStatus(scheduledRuntimeStatus),
            stopStatus: pollingStop.details.status,
            stoppedStatus: compactPollingStatus(pollingStop.details.runtimeStatus),
          },
        });
      } else {
        currentStep = "owner_command_poll";
        console.info([
          "Manual guided Telegram owner-loop waiting for inbound command.",
          JSON.stringify({ conversationId, commandText, waitMs, intervalMs }, null, 2),
        ].join("\n"));
        await writeGuidedOutput({
          currentStep,
          commandPoll: {
            status: "waiting",
            attempts: 0,
          },
        });

        const pollInput = {
          profileId,
          bindingId,
          limit: Number.isFinite(pollLimit) ? pollLimit : 10,
          ...(commandNotBefore ? { minReceivedAt: commandNotBefore } : {}),
        };
        const pollPreview = await tool("ambient_messaging_telegram_bridge_poll_preview").execute("manual-guided-owner-loop-poll-preview", pollInput);
        expect(pollPreview.details.status).toBe("ready");
        let poll: any | undefined;
        let acceptedDispatch: any | undefined;
        const commandDeadline = Date.now() + waitMs;
        let pollAttempt = 0;
        while (Date.now() <= commandDeadline) {
          pollAttempt += 1;
          poll = await tool("ambient_messaging_telegram_bridge_poll_apply").execute(`manual-guided-owner-loop-poll-apply-${pollAttempt}`, pollInput);
          if (poll.details.applyStatus !== "applied") {
            throw new Error(`Telegram bridge poll returned ${poll.details.applyStatus}.`);
          }
          acceptedDispatch = poll.details.bindingResults
            .flatMap((bindingResult: any) => bindingResult.dispatches)
            .find((dispatch: any) => dispatch.accepted && dispatch.queuedProjection?.id && dispatch.event?.text === commandText);
          if (acceptedDispatch) {
            await writeGuidedOutput({
              currentStep,
              commandPoll: {
                status: "matched",
                attempts: pollAttempt,
                fetchedMessageCount: poll.details.fetchedMessageCount,
                candidateMessageCount: poll.details.candidateMessageCount,
                duplicateMessageCount: poll.details.duplicateMessageCount,
                staleMessageCount: poll.details.staleMessageCount,
                acceptedDispatchCount: poll.details.acceptedDispatchCount,
                droppedDispatchCount: poll.details.droppedDispatchCount,
                minReceivedAt: commandNotBefore,
                queuedProjectionId: acceptedDispatch.queuedProjection.id,
                sourceEventId: acceptedDispatch.event?.id,
                sourceReceivedAt: acceptedDispatch.event?.receivedAt,
              },
            });
            break;
          }
          console.info([
            "Manual guided Telegram owner-loop command still waiting.",
            JSON.stringify({
              attempt: pollAttempt,
              fetchedMessageCount: poll.details.fetchedMessageCount,
              candidateMessageCount: poll.details.candidateMessageCount,
              duplicateMessageCount: poll.details.duplicateMessageCount,
              staleMessageCount: poll.details.staleMessageCount,
              acceptedDispatchCount: poll.details.acceptedDispatchCount,
              droppedDispatchCount: poll.details.droppedDispatchCount,
              minReceivedAt: commandNotBefore,
            }, null, 2),
          ].join("\n"));
          await writeGuidedOutput({
            currentStep,
            commandPoll: {
              status: "waiting",
              attempts: pollAttempt,
              fetchedMessageCount: poll.details.fetchedMessageCount,
              candidateMessageCount: poll.details.candidateMessageCount,
              duplicateMessageCount: poll.details.duplicateMessageCount,
              staleMessageCount: poll.details.staleMessageCount,
              acceptedDispatchCount: poll.details.acceptedDispatchCount,
              droppedDispatchCount: poll.details.droppedDispatchCount,
              minReceivedAt: commandNotBefore,
            },
          });
          await delay(intervalMs);
        }
        queuedProjectionId = acceptedDispatch?.queuedProjection?.id;
        if (!queuedProjectionId) {
          throw new Error(`Owner command was not accepted before the guided wait expired: attempts=${pollAttempt}. Send the exact command text after the owner handoff is matched.`);
        }
      }
      if (!queuedProjectionId) {
        throw new Error("Owner command did not produce a queued projection.");
      }
      const matchedQueuedProjectionId = queuedProjectionId;
      expect(matchedQueuedProjectionId).toBeTruthy();

      const commandPreview = await tool("ambient_messaging_remote_surface_command_preview").execute("manual-guided-owner-loop-command-preview", {
        queuedProjectionId: matchedQueuedProjectionId,
      });
      expect(commandPreview.details.status).toBe("ready");
      const commandApplyError = await applyManualOwnerLoopCommand({
        tool,
        toolCallId: "manual-guided-owner-loop-command-apply",
        queuedProjectionId: matchedQueuedProjectionId,
      });
      if (commandApplyError) {
        expect(errorMessage(commandApplyError)).toContain("Ambient active project switching is not available");
      }
      await writeGuidedOutput({
        currentStep: "command_applied",
        queuedProjectionId: matchedQueuedProjectionId,
        commandApply: {
          status: commandApplyError ? "nonfatal-error" : "applied",
          error: commandApplyError ? errorMessage(commandApplyError) : undefined,
        },
      });

      currentStep = "relay_preview";
      await previewManualOwnerLoopRelay({
        tool,
        toolCallIdPrefix: "manual-guided-owner-loop",
        queuedProjectionId: matchedQueuedProjectionId,
        sendReply,
      });

      const revoked = await tool("ambient_messaging_telegram_remote_surface_apply").execute("manual-guided-owner-loop-binding-revoke", {
        action: "revoke",
        bindingId,
        reason: "manual guided Telegram owner-loop smoke cleanup",
      });
      expect(revoked.details.status).toBe("applied");
      bindingId = undefined;

      await tool("ambient_messaging_gateway_lifecycle_apply").execute("manual-guided-owner-loop-stop-real", {
        action: "stop",
        providerId: "telegram-tdlib",
        mode: "real",
      });
      await writeGuidedOutput({
        status: "completed",
        currentStep: "completed",
        activationPlan: {
          planFirst: true,
          initial: activationPlanInitialSummary,
          afterBinding: activationPlanAfterBindingSummary,
        },
        cleanup: {
          bindingRevoked: true,
          pollingStopped: usePollingRunner ? true : undefined,
          gatewayStopped: true,
        },
      });
    } catch (error) {
      await writeGuidedOutput({
        status: "failed",
        currentStep,
        failure: {
          message: errorMessage(error),
        },
        activationPlan: {
          planFirst: true,
          initial: activationPlanInitialSummary,
          afterBinding: activationPlanAfterBindingSummary,
        },
        cleanup: {
          bindingRevoked: bindingId ? "pending-finally" : true,
          pollingStopped: pollingRunnerStarted ? "pending-finally" : (usePollingRunner ? true : undefined),
          gatewayStopped: "pending-finally",
        },
      });
      throw error;
    } finally {
      if (tool && pollingRunnerStarted) {
        try {
          await tool("ambient_messaging_telegram_bridge_polling_apply").execute("manual-guided-owner-loop-polling-stop-finally", {
            action: "stop",
            profileId,
            bindingId,
            limit: Number.isFinite(pollLimit) ? pollLimit : 10,
            intervalMs: Math.max(5_000, intervalMs),
            ...(commandNotBefore ? { minReceivedAt: commandNotBefore } : {}),
          });
        } catch {
          // Best-effort cleanup for manual smoke failures; preserve the original test error.
        }
      }
      if (tool && bindingId) {
        try {
          await tool("ambient_messaging_telegram_remote_surface_apply").execute("manual-guided-owner-loop-binding-revoke-finally", {
            action: "revoke",
            bindingId,
            reason: "manual guided Telegram owner-loop smoke finally cleanup",
          });
        } catch {
          // Best-effort cleanup for manual smoke failures; preserve the original test error.
        }
      }
      if (tool) {
        try {
          await tool("ambient_messaging_gateway_lifecycle_apply").execute("manual-guided-owner-loop-stop-real-finally", {
            action: "stop",
            providerId: "telegram-tdlib",
            mode: "real",
          });
        } catch {
          // Best-effort cleanup for manual smoke failures; preserve the original test error.
        }
      }
      if (originalEnv.stateRoot === undefined) delete process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT;
      else process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT = originalEnv.stateRoot;
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  }, 420_000);

  itManualTelegramOwnerLoopSmoke("manual real Telegram owner loop smoke", async () => {
    const profileId = process.env.AMBIENT_MANUAL_TELEGRAM_PROFILE_ID?.trim();
    const stateRoot = process.env.AMBIENT_MANUAL_TELEGRAM_STATE_ROOT?.trim()
      || process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT?.trim();
    const conversationId = process.env.AMBIENT_MANUAL_TELEGRAM_CONVERSATION_ID?.trim();
    const setupCode = process.env.AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SETUP_CODE?.trim();
    const directoryQuery = process.env.AMBIENT_MANUAL_TELEGRAM_DIRECTORY_QUERY?.trim();
    const directoryLimit = Number(process.env.AMBIENT_MANUAL_TELEGRAM_DIRECTORY_LIMIT ?? "10");
    const pollLimit = Number(process.env.AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_POLL_LIMIT ?? "10");
    const commandText = process.env.AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_COMMAND_TEXT?.trim()
      || "switch project Manual Relay Smoke";
    const commandNotBefore = normalizedIsoFromEnv(
      process.env.AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_COMMAND_NOT_BEFORE,
      "AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_COMMAND_NOT_BEFORE",
    );
    const sendReply = process.env.AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SEND_REPLY === "1";
    if (
      !profileId ||
      !stateRoot ||
      !conversationId ||
      !setupCode ||
      !process.env.AMBIENT_AGENT_TELEGRAM_API_ID?.trim() ||
      !process.env.AMBIENT_AGENT_TELEGRAM_API_HASH?.trim()
    ) {
      throw new Error(manualTelegramOwnerLoopSmokeChecklist({
        profileId,
        stateRoot,
        conversationId,
        setupCode,
        apiCredentialsPresent: Boolean(process.env.AMBIENT_AGENT_TELEGRAM_API_ID?.trim() && process.env.AMBIENT_AGENT_TELEGRAM_API_HASH?.trim()),
      }));
    }

    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-manual-telegram-owner-loop-"));
    const store = new ProjectStore();
    const originalEnv = {
      stateRoot: process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT,
    };
    let tool: ((name: string) => { name: string; execute: (...args: any[]) => Promise<any> }) | undefined;
    let bindingId: string | undefined;
    try {
      process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT = stateRoot;
      store.openWorkspace(workspacePath);
      const thread = store.updateThreadSettings(store.createThread("manual Telegram owner loop smoke").id, { permissionMode: "workspace" });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: async (request) => {
          if (
            request.toolName === "ambient_messaging_gateway_lifecycle_apply" ||
            request.toolName === "ambient_messaging_telegram_conversation_directory_apply" ||
            request.toolName === "ambient_messaging_telegram_owner_handoff_apply" ||
            request.toolName === "ambient_messaging_telegram_remote_surface_apply" ||
            request.toolName === "ambient_messaging_telegram_bridge_poll_apply" ||
            request.toolName === "ambient_messaging_telegram_bridge_polling_apply" ||
            request.toolName === "ambient_messaging_remote_surface_command_apply" ||
            (sendReply && request.toolName === "ambient_messaging_telegram_bridge_reply_apply")
          ) {
            return { allowed: true, mode: "allow_once" };
          }
          throw new Error(`Unexpected manual Telegram owner-loop permission request: ${request.title}`);
        },
        denyThread: () => undefined,
      }, manualTelegramOwnerLoopProjectFeatures(workspacePath));
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      (runtime as any).createMessagingGatewayToolExtension(thread.id, store.getWorkspace())({
        registerTool: (registeredTool: any) => registeredTools.push(registeredTool),
      });
      tool = (name: string) => {
        const found = registeredTools.find((candidate) => candidate.name === name);
        if (!found) throw new Error(`Missing tool ${name}`);
        return found;
      };

      const lifecycle = await tool("ambient_messaging_gateway_lifecycle_apply").execute("manual-owner-loop-start-real", {
        action: "start",
        providerId: "telegram-tdlib",
        mode: "real",
      });
      expect(lifecycle.details.status).toBe("applied");

      const directoryInput = {
        profileId,
        limit: Number.isFinite(directoryLimit) ? directoryLimit : 10,
        ...(directoryQuery ? { query: directoryQuery } : {}),
      };
      const directoryPreview = await tool("ambient_messaging_telegram_conversation_directory_preview").execute("manual-owner-loop-directory-preview", directoryInput);
      expect(directoryPreview.details.status).toBe("ready");
      expect(directoryPreview.content[0].text).toContain("metadataOnly=true");
      const directoryResult = await tool("ambient_messaging_telegram_conversation_directory_apply").execute("manual-owner-loop-directory-apply", directoryInput);
      expect(directoryResult.details.status).toBe("applied");
      expect(directoryResult.details.failureMode).toBe("none");
      expect(JSON.stringify(directoryResult.details.conversations)).not.toContain("lastMessage");
      const directoryConversationIds = (directoryResult.details.conversations as Array<{ conversationId: string; title?: string }>)
        .map((conversation) => conversation.conversationId);
      expect(directoryConversationIds).toContain(conversationId);

      const handoffInput = {
        profileId,
        conversationId,
        setupCode,
        limit: Number.isFinite(pollLimit) ? pollLimit : 10,
      };
      const handoffPreview = await tool("ambient_messaging_telegram_owner_handoff_preview").execute("manual-owner-loop-handoff-preview", handoffInput);
      expect(handoffPreview.details.status).toBe("ready");
      const handoff = await tool("ambient_messaging_telegram_owner_handoff_apply").execute("manual-owner-loop-handoff-apply", handoffInput);
      expect(handoff.details).toMatchObject({
        applyStatus: "applied",
        handoffStatus: "matched",
      });
      const ownerUserId = handoff.details.ownerUserId;
      const ownerHandoffSourceMessageId = handoff.details.sourceMessageId;
      expect(ownerUserId).toBeTruthy();
      expect(ownerHandoffSourceMessageId).toBeTruthy();

      const binding = await tool("ambient_messaging_telegram_remote_surface_apply").execute("manual-owner-loop-binding-apply", {
        action: "create",
        purpose: "remote_ambient_surface",
        profileId,
        conversationId,
        ownerUserId,
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
        ownerHandoffSourceMessageId,
      });
      expect(binding.details.status).toBe("applied");
      expect(binding.details.lifecycle.binding.metadata.ownerHandoffSourceMessageId).toBe(ownerHandoffSourceMessageId);
      bindingId = binding.details.lifecycle.binding.id;

      const pollInput = {
        profileId,
        bindingId,
        limit: Number.isFinite(pollLimit) ? pollLimit : 10,
        ...(commandNotBefore ? { minReceivedAt: commandNotBefore } : {}),
      };
      const pollPreview = await tool("ambient_messaging_telegram_bridge_poll_preview").execute("manual-owner-loop-poll-preview", pollInput);
      expect(pollPreview.details.status).toBe("ready");
      const poll = await tool("ambient_messaging_telegram_bridge_poll_apply").execute("manual-owner-loop-poll-apply", pollInput);
      expect(poll.details.applyStatus).toBe("applied");
      expect(poll.details.duplicateMessageCount).toBeGreaterThanOrEqual(1);
      expect(poll.details.acceptedDispatchCount).toBeGreaterThanOrEqual(1);
      const acceptedDispatch = poll.details.bindingResults
        .flatMap((bindingResult: any) => bindingResult.dispatches)
        .find((dispatch: any) => dispatch.accepted && dispatch.queuedProjection?.id && dispatch.event?.text === commandText);
      const queuedProjectionId = acceptedDispatch?.queuedProjection?.id;
      expect(queuedProjectionId).toBeTruthy();

      const commandPreview = await tool("ambient_messaging_remote_surface_command_preview").execute("manual-owner-loop-command-preview", {
        queuedProjectionId,
      });
      expect(commandPreview.details.status).toBe("ready");
      const commandApplyError = await applyManualOwnerLoopCommand({
        tool,
        toolCallId: "manual-owner-loop-command-apply",
        queuedProjectionId,
      });
      if (commandApplyError) {
        expect(errorMessage(commandApplyError)).toContain("Ambient active project switching is not available");
      }

      await previewManualOwnerLoopRelay({
        tool,
        toolCallIdPrefix: "manual-owner-loop",
        queuedProjectionId,
        sendReply,
      });

      const revoked = await tool("ambient_messaging_telegram_remote_surface_apply").execute("manual-owner-loop-binding-revoke", {
        action: "revoke",
        bindingId,
        reason: "manual Telegram owner-loop smoke cleanup",
      });
      expect(revoked.details.status).toBe("applied");
      bindingId = undefined;

      await tool("ambient_messaging_gateway_lifecycle_apply").execute("manual-owner-loop-stop-real", {
        action: "stop",
        providerId: "telegram-tdlib",
        mode: "real",
      });
    } finally {
      if (tool && bindingId) {
        try {
          await tool("ambient_messaging_telegram_remote_surface_apply").execute("manual-owner-loop-binding-revoke-finally", {
            action: "revoke",
            bindingId,
            reason: "manual Telegram owner-loop smoke finally cleanup",
          });
        } catch {
          // Best-effort cleanup for manual smoke failures; preserve the original test error.
        }
      }
      if (tool) {
        try {
          await tool("ambient_messaging_gateway_lifecycle_apply").execute("manual-owner-loop-stop-real-finally", {
            action: "stop",
            providerId: "telegram-tdlib",
            mode: "real",
          });
        } catch {
          // Best-effort cleanup for manual smoke failures; preserve the original test error.
        }
      }
      if (originalEnv.stateRoot === undefined) delete process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT;
      else process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT = originalEnv.stateRoot;
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  }, 240_000);
});

describe("post-tool privileged continuation steering", () => {
  it("extracts privileged continuation blocks for idle post-tool recovery", () => {
    const content = [
      "Ambient privileged action handoff",
      "Status: succeeded",
      "",
      "Continuation:",
      "- state: ready-to-resume-validation",
      "- packageName: ambient-kokoro-tts",
      "- resumeAction: ambient_capability_builder_validate {\"packageName\":\"ambient-kokoro-tts\",\"includeSmokeTests\":true}",
      "- resumeRequiresApproval: true",
      "",
      "Reviewed command templates:",
    ].join("\n");

    const continuationLines = privilegedContinuationLinesFromToolContent(content);

    expect(continuationLines).toEqual([
      "- state: ready-to-resume-validation",
      "- packageName: ambient-kokoro-tts",
      "- resumeAction: ambient_capability_builder_validate {\"packageName\":\"ambient-kokoro-tts\",\"includeSmokeTests\":true}",
      "- resumeRequiresApproval: true",
    ]);
    expect(postToolIdleContinuationPrompt({
      runId: "run-1",
      toolCallId: "tool-privileged-1",
      messageId: "message-tool-1",
      eventSeqAtEnd: 7,
      label: "ambient_privileged_action_request",
      status: "done",
      continuationLines,
    })).toContain("resumeAction: ambient_capability_builder_validate");
  });
});

describe("manual Telegram directory smoke checklist", () => {
  it("explains required real-profile inputs without suggesting UI scraping", () => {
    const checklist = manualTelegramDirectorySmokeChecklist({
      profileId: undefined,
      stateRoot: undefined,
      ownerUserId: undefined,
      apiCredentialsPresent: false,
    });

    expect(checklist).toContain("AMBIENT_MANUAL_TELEGRAM_PROFILE_ID");
    expect(checklist).toContain("AMBIENT_MANUAL_TELEGRAM_OWNER_USER_ID");
    expect(checklist).toContain("AMBIENT_AGENT_TELEGRAM_API_ID");
    expect(checklist).toContain("Do not ask Pi to scrape Telegram Desktop");
    expect(checklist).toContain("existing Ambient owner binding");
    expect(checklist).toContain("previous approved bridge event or polling result");
  });
});

describe("manual Telegram directory-list smoke checklist", () => {
  it("explains the metadata-only conversation picker without requiring owner ids", () => {
    const checklist = manualTelegramDirectoryListSmokeChecklist({
      profileId: undefined,
      stateRoot: undefined,
      apiCredentialsPresent: false,
    });

    expect(checklist).toContain("AMBIENT_MANUAL_TELEGRAM_DIRECTORY_LIST_SMOKE");
    expect(checklist).toContain("metadata-only conversation directory");
    expect(checklist).toContain("AMBIENT_AGENT_TELEGRAM_API_ID");
    expect(checklist).toContain("Does not read message bodies");
    expect(checklist).toContain("Do not ask Pi to scrape Telegram Desktop");
  });
});

describe("manual Telegram owner-handoff check smoke checklist", () => {
  it("explains no-match preflight and same-account outgoing limitations", () => {
    const checklist = manualTelegramOwnerHandoffCheckSmokeChecklist({
      profileId: undefined,
      stateRoot: undefined,
      conversationId: undefined,
      setupCode: undefined,
      apiCredentialsPresent: false,
    });

    expect(checklist).toContain("AMBIENT_MANUAL_TELEGRAM_OWNER_HANDOFF_CHECK_SMOKE");
    expect(checklist).toContain("Accepts no-match as a valid preflight");
    expect(checklist).toContain("intentionally ignores outgoing messages");
    expect(checklist).toContain("separate inbound owner/delegate account");
    expect(checklist).toContain("Does not create bindings");
    expect(checklist).toContain("Do not ask Pi to scrape Telegram Desktop");
  });
});

describe("manual guided Telegram owner loop smoke checklist", () => {
  it("explains the live inbound waiting sequence", () => {
    const checklist = manualTelegramGuidedOwnerLoopSmokeChecklist({
      profileId: undefined,
      stateRoot: undefined,
      conversationId: undefined,
      setupCode: undefined,
      apiCredentialsPresent: false,
    });

    expect(checklist).toContain("AMBIENT_MANUAL_TELEGRAM_GUIDED_OWNER_LOOP_SMOKE");
    expect(checklist).toContain("ambient_messaging_telegram_owner_loop_activation_plan before low-level tools");
    expect(checklist).toContain("Start the guided script first");
    expect(checklist).toContain("Send the setup code from an inbound owner/delegate account");
    expect(checklist).toContain("calls the activation plan again after binding creation");
    expect(checklist).toContain("AMBIENT_MANUAL_TELEGRAM_GUIDED_OWNER_LOOP_POLLING_RUNNER");
    expect(checklist).toContain("will not satisfy owner handoff");
    expect(checklist).toContain("Does not ask Pi to scrape Telegram Desktop");
  });
});

describe("manual Telegram owner loop smoke checklist", () => {
  it("explains the pre-sent setup code and command requirements", () => {
    const checklist = manualTelegramOwnerLoopSmokeChecklist({
      profileId: undefined,
      stateRoot: undefined,
      conversationId: undefined,
      setupCode: undefined,
      apiCredentialsPresent: false,
    });

    expect(checklist).toContain("AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SETUP_CODE");
    expect(checklist).toContain("Send the setup code");
    expect(checklist).toContain("Then send the relay command");
    expect(checklist).toContain("switch project Manual Relay Smoke");
    expect(checklist).toContain("provider-neutral reply alias");
    expect(checklist).toContain("AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SEND_REPLY");
    expect(checklist).toContain("bridge intentionally skips outgoing unread items");
    expect(checklist).toContain("ownerHandoffSourceMessageId");
    expect(checklist).toContain("Do not ask Pi to scrape Telegram Desktop");
  });
});

describe("post-tool browser challenge continuation steering", () => {
  it("extracts browser user-action blocks for idle post-tool recovery", () => {
    const content = [
      "Browser needs user action.",
      "Action: captcha",
      "Provider: recaptcha",
      "Title: Reddit - verify",
      "URL: https://www.reddit.com/r/books/",
      "Complete the CAPTCHA in the browser.",
      "Do not retry the same browser action until the user has completed the browser challenge or gives a new instruction.",
    ].join("\n");

    const continuationLines = browserUserActionContinuationLinesFromToolContent(content);

    expect(continuationLines).toEqual([
      "- browserState: waiting-for-browser-user-action",
      "- Action: captcha",
      "- Provider: recaptcha",
      "- Title: Reddit - verify",
      "- URL: https://www.reddit.com/r/books/",
      "- next: tell the user the browser challenge is blocking progress; after they complete it, retry the same browser operation against the preserved browser session instead of navigating away or switching providers.",
    ]);
    expect(postToolIdleContinuationPrompt({
      runId: "run-1",
      toolCallId: "tool-browser-1",
      messageId: "message-tool-1",
      eventSeqAtEnd: 7,
      label: "browser_content",
      status: "done",
      continuationLines,
    })).toContain("waiting-for-browser-user-action");
  });
});

describe("post-tool continuation freshness", () => {
  it("uses generic validated-tool wording instead of stale most-recent-tool claims", () => {
    const prompt = postToolIdleContinuationPrompt({
      runId: "run-1",
      toolCallId: "tool-bash-1",
      messageId: "message-bash-1",
      eventSeqAtEnd: 12,
      label: "bash",
      status: "done",
    });

    expect(prompt).toContain("Continue after the latest completed tool result identified below if it is still current.");
    expect(prompt).toContain("Tool call id: tool-bash-1");
    expect(prompt).toContain("Validated completed tool: bash (done).");
    expect(prompt).not.toContain("Most recent tool: bash");
  });

  it("cancels a post-tool continuation when later run activity makes the snapshot stale", () => {
    expect(shouldDeliverPostToolContinuation({
      snapshot: {
        runId: "run-1",
        toolCallId: "tool-bash-1",
        messageId: "message-bash-1",
        eventSeqAtEnd: 41,
        label: "bash",
        status: "done",
      },
      latestTranscriptTool: {
        toolCallId: "tool-bash-1",
        messageId: "message-bash-1",
        label: "bash",
        status: "done",
      },
      currentRunId: "run-1",
      currentEventSeq: 42,
    })).toBe(false);
  });

  it("records an internal continuation request with a stale-skip diagnostic", () => {
    const request = createPostToolContinuationRequest({
      runId: "run-1",
      attempt: 2,
      idleMs: 15_000,
      eventSeqAtSchedule: 41,
      scheduledAt: "2026-05-25T22:00:00.000Z",
      snapshot: {
        runId: "run-1",
        toolCallId: "tool-bash-1",
        messageId: "message-bash-1",
        eventSeqAtEnd: 41,
        label: "bash",
        status: "done",
      },
    });

    expect(request).toMatchObject({
      id: "post-tool-continuation:run-1:2:41",
      kind: "post-tool-idle",
      runId: "run-1",
      attempt: 2,
      idleMs: 15_000,
      eventSeqAtSchedule: 41,
    });

    expect(validatePostToolContinuationRequest({
      request,
      latestTranscriptTool: {
        toolCallId: "tool-bash-1",
        messageId: "message-bash-1",
        label: "bash",
        status: "done",
      },
      currentRunId: "run-1",
      currentEventSeq: 42,
    })).toMatchObject({
      deliver: false,
      diagnostic: {
        requestId: "post-tool-continuation:run-1:2:41",
        reason: "event-seq-advanced",
        currentRunId: "run-1",
        currentEventSeq: 42,
        snapshotToolCallId: "tool-bash-1",
      },
    });
  });

  it("allows a post-tool continuation only when run, event sequence, and transcript latest tool still match", () => {
    expect(shouldDeliverPostToolContinuation({
      snapshot: {
        runId: "run-1",
        toolCallId: "tool-bash-1",
        messageId: "message-bash-1",
        eventSeqAtEnd: 41,
        label: "bash",
        status: "done",
      },
      latestTranscriptTool: {
        toolCallId: "tool-bash-1",
        messageId: "message-bash-1",
        label: "bash",
        status: "done",
      },
      currentRunId: "run-1",
      currentEventSeq: 41,
    })).toBe(true);

    expect(shouldDeliverPostToolContinuation({
      snapshot: {
        runId: "run-1",
        toolCallId: "tool-bash-1",
        messageId: "message-bash-1",
        eventSeqAtEnd: 41,
        label: "bash",
        status: "done",
      },
      latestTranscriptTool: {
        toolCallId: "tool-browser-1",
        messageId: "message-browser-1",
        label: "browser_search",
        status: "done",
      },
      currentRunId: "run-1",
      currentEventSeq: 41,
    })).toBe(false);
  });
});

describe("AgentRuntime post-tool continuation integration", () => {
  it("cancels parent synthesis when resolve_barrier returns cancel_parent", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-parent-control-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const created = store.createThread("cancel parent barrier control");
      const threadSessionDir = join(workspace.sessionPath, created.id);
      await mkdir(threadSessionDir, { recursive: true });
      const sessionFile = join(threadSessionDir, "session.jsonl");
      await writeFile(sessionFile, "", "utf8");
      const thread = store.updateThreadSettings(created.id, { piSessionFile: sessionFile });
      const desktopEvents: any[] = [];
      const subscribers: Array<(event: any) => void> = [];
      let rejectPrompt: ((error: Error) => void) | undefined;
      let childRunId = "";
      let waitBarrierId = "";
      const emit = (event: any) => {
        for (const subscriber of [...subscribers]) subscriber(event);
      };
      const session = {
        ...fakePiSession(sessionFile),
        isStreaming: true,
        subscribe: vi.fn((subscriber: (event: any) => void) => {
          subscribers.push(subscriber);
          return () => {
            const index = subscribers.indexOf(subscriber);
            if (index >= 0) subscribers.splice(index, 1);
          };
        }),
        prompt: vi.fn(
          () =>
            new Promise<never>((_resolve, reject) => {
              rejectPrompt = reject;
              const parentRun = store.listActiveRuns().find((candidate) => candidate.threadId === thread.id);
              if (!parentRun) throw new Error("Expected active parent run before Pi tool execution.");
              const featureFlags = resolveAmbientFeatureFlags({
                settings: store.getFeatureFlagSettings(),
                generatedAt: "2026-06-05T00:00:00.000Z",
              });
              const child = store.createSubagentRun({
                parentThreadId: thread.id,
                parentRunId: parentRun.id,
                parentMessageId: parentRun.assistantMessageId,
                title: "Required child",
                roleId: "explorer",
                canonicalTaskPath: "root/0:explorer",
                featureFlagSnapshot: featureFlags,
                modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(thread.model, "2026-06-05T00:00:00.000Z"),
                dependencyMode: "required",
              });
              store.markSubagentRunStatus(child.id, "running");
              const barrier = store.createSubagentWaitBarrier({
                parentThreadId: thread.id,
                parentRunId: parentRun.id,
                childRunIds: [child.id],
                dependencyMode: "required_all",
                failurePolicy: "ask_user",
              });
              childRunId = child.id;
              waitBarrierId = barrier.id;
              const details = {
                runtime: "ambient-subagents",
                phase: "phase-2-pi-tool-surface",
                toolName: "ambient_subagent",
                action: "resolve_barrier",
                status: "cancelled",
                parentThreadId: thread.id,
                parentRunId: parentRun.id,
                waitBarrier: { id: barrier.id, status: "cancelled" },
                parentResolution: {
                  status: "blocked",
                  action: "cancel_parent",
                  canSynthesize: false,
                  requiresUserInput: false,
                  requiresExplicitPartial: false,
                  reason: "User chose to cancel the parent path while resolving this required child barrier.",
                  instruction: "Do not synthesize child work. Stop or cancel the parent run.",
                },
                resolutionArtifact: {
                  schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
                  childRunIds: [child.id],
                  childStatuses: [{ childRunId: child.id, status: "cancelled" }],
                  synthesisAllowed: false,
                  explicitPartial: false,
                  resultArtifact: null,
                  parentCancellationRequested: true,
                  userDecision: {
                    schemaVersion: "ambient-subagent-user-decision-v1",
                    decision: "cancel_parent",
                    userDecision: "Stop this parent task.",
                    decidedAt: "2026-06-05T00:00:00.000Z",
                    toolCallId: "call-resolve-barrier",
                    idempotencyKey: "barrier:cancel-parent",
                  },
                },
                idempotencyKey: "barrier:cancel-parent",
              };
              emit({
                type: "tool_execution_start",
                toolCallId: "call-resolve-barrier",
                toolName: "ambient_subagent",
                args: {
                  action: "resolve_barrier",
                  waitBarrierId: barrier.id,
                  decision: "cancel_parent",
                  userDecision: "Stop this parent task.",
                },
              });
              emit({
                type: "tool_execution_end",
                toolCallId: "call-resolve-barrier",
                toolName: "ambient_subagent",
                result: [{ type: "text", text: "Recorded wait-barrier decision: cancel_parent." }],
                details,
              });
            }),
        ),
        steer: vi.fn(async () => undefined),
        compact: vi.fn(async () => undefined),
        agent: {
          abort: vi.fn(() => {
            rejectPrompt?.(new Error("Request was aborted."));
          }),
          waitForIdle: vi.fn(async () => undefined),
        },
      };
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        () =>
          ({
            isDestroyed: () => false,
            webContents: {
              isDestroyed: () => false,
              isCrashed: () => false,
              send: (_channel: string, event: any) => desktopEvents.push(event),
            },
          }) as any,
        {
          request: vi.fn(),
          denyThread: vi.fn(),
        },
      );
      vi.spyOn(runtime as any, "getSession").mockResolvedValue(session);

      await runtime.send({
        threadId: thread.id,
        content: "Use a required sub-agent, then respect the cancel-parent barrier decision.",
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: "ambient-preview",
        thinkingLevel: "medium",
        delivery: "prompt",
        context: [],
      });

      const finalAssistant = store.listMessages(thread.id).filter((message) => message.role === "assistant").at(-1);
      expect(session.steer).not.toHaveBeenCalled();
      expect(session.agent.abort).toHaveBeenCalledTimes(1);
      expect(finalAssistant).toMatchObject({
        content: expect.stringContaining(`sub-agent wait barrier ${waitBarrierId}`),
        metadata: expect.objectContaining({
          status: "aborted",
          subagentParentControlAbort: expect.objectContaining({
            toolCallId: "call-resolve-barrier",
            parentRunId: expect.any(String),
            waitBarrierId,
            idempotencyKey: "barrier:cancel-parent",
            decision: "cancel_parent",
          }),
        }),
      });
      expect(store.getSubagentRun(childRunId)).toMatchObject({
        status: "cancelled",
        resultArtifact: expect.objectContaining({
          status: "cancelled",
          summary: expect.stringContaining("User chose to cancel the parent path"),
        }),
      });
      expect(store.getSubagentWaitBarrier(waitBarrierId)).toMatchObject({
        status: "cancelled",
        resolutionArtifact: expect.objectContaining({
          parentCancellationRequested: true,
          parentControlReconciledSource: "runtime_parent_abort",
          parentControlReconciliation: expect.objectContaining({
            action: "cancel_parent",
            source: "runtime_parent_abort",
          }),
        }),
      });
      expect(store.listActiveRuns()).toEqual([]);
      expect(desktopEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "runtime-activity",
          activity: expect.objectContaining({
            diagnostic: expect.objectContaining({
              reason: "subagent_parent_control_cancel_parent",
              waitBarrierId,
            }),
          }),
          workspacePath,
        }),
        expect.objectContaining({
          type: "subagent-run-updated",
          run: expect.objectContaining({ id: childRunId, status: "cancelled" }),
          workspacePath,
        }),
        expect.objectContaining({
          type: "subagent-wait-barrier-updated",
          barrier: expect.objectContaining({ id: waitBarrierId, status: "cancelled" }),
          workspacePath,
        }),
      ]));
      expect(store.listMessages(thread.id).map((message) => message.content).join("\n")).not.toContain("Do not synthesize child work");
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("does not steer a stale bash continuation after a later browser_search starts", async () => {
    vi.useFakeTimers();
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-stale-post-tool-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const created = store.createThread("stale post-tool continuation");
      const threadSessionDir = join(workspace.sessionPath, created.id);
      await mkdir(threadSessionDir, { recursive: true });
      const sessionFile = join(threadSessionDir, "session.jsonl");
      await writeFile(sessionFile, "", "utf8");
      const thread = store.updateThreadSettings(created.id, { piSessionFile: sessionFile });

      const subscribers: Array<(event: any) => void> = [];
      let rejectPrompt: ((error: Error) => void) | undefined;
      const emit = (event: any) => {
        for (const subscriber of [...subscribers]) subscriber(event);
      };
      const session = {
        ...fakePiSession(sessionFile),
        isStreaming: true,
        subscribe: vi.fn((subscriber: (event: any) => void) => {
          subscribers.push(subscriber);
          return () => {
            const index = subscribers.indexOf(subscriber);
            if (index >= 0) subscribers.splice(index, 1);
          };
        }),
        prompt: vi.fn(() => new Promise<never>((_resolve, reject) => {
          rejectPrompt = reject;
          setTimeout(() => {
            emit({
              type: "tool_execution_start",
              toolCallId: "call-bash-1",
              toolName: "bash",
              args: { command: "echo ready" },
            });
            emit({
              type: "tool_execution_end",
              toolCallId: "call-bash-1",
              toolName: "bash",
              result: [{ type: "text", text: "ready" }],
            });
          }, 0);
          setTimeout(() => {
            emit({
              type: "tool_execution_start",
              toolCallId: "call-browser-search-1",
              toolName: "browser_search",
              args: { query: "OpenCut Classic install troubleshooting" },
            });
          }, 14_900);
          setTimeout(() => {
            emit({
              type: "tool_execution_end",
              toolCallId: "call-browser-search-1",
              toolName: "browser_search",
              result: [{ type: "text", text: "Search results returned." }],
            });
          }, 15_050);
          setTimeout(() => {
            emit({
              type: "message_end",
              message: {
                role: "assistant",
                stopReason: "stop",
                content: [{ type: "text", text: "I found search results and will use them next." }],
              },
            });
          }, 15_100);
        })),
        steer: vi.fn(async () => undefined),
        compact: vi.fn(async () => undefined),
        agent: {
          abort: vi.fn(() => {
            emit({
              type: "message_end",
              message: {
                role: "assistant",
                stopReason: "aborted",
                errorMessage: "Request was aborted.",
                content: [{ type: "text", text: "" }],
              },
            });
            rejectPrompt?.(new Error("Request was aborted."));
          }),
          waitForIdle: vi.fn(async () => undefined),
        },
      };
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });
      vi.spyOn(runtime as any, "getSession").mockResolvedValue(session);

      const sendPromise = runtime.send({
        threadId: thread.id,
        content: "Install and run OpenCut Classic.",
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: "ambient-preview",
        thinkingLevel: "medium",
        delivery: "prompt",
        context: [],
      });

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(14_900);
      expect(session.steer).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(200);
      await vi.advanceTimersByTimeAsync(15_000);
      await sendPromise;

      expect(session.steer).not.toHaveBeenCalled();
      const transcript = store.listMessages(thread.id).map((message) => message.content).join("\n");
      expect(transcript).toContain("bash completed");
      expect(transcript).toContain("browser_search completed");
      expect(transcript).toContain("I found search results and will use them next.");
      expect(transcript).not.toContain("Most recent tool: bash");
    } finally {
      vi.useRealTimers();
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});

describe("assistant finalization retry accounting", () => {
  it("counts retry attempts per failure reason instead of using one thread-wide counter", () => {
    const activeRetry = {
      sourceUserMessageId: "message-user-1",
      attempt: 3,
      maxRetries: 10,
      reason: "empty_assistant_response" as const,
    };

    expect(assistantFinalizationRetryAttemptsUsedForReason(activeRetry, "empty_assistant_response", 10)).toBe(3);
    expect(assistantFinalizationRetryAttemptsUsedForReason(activeRetry, "pre_output_stream_stall", 10)).toBe(0);
    expect(assistantFinalizationRetryAttemptsUsedForReason(activeRetry, "provider_error_before_tool_execution", 10)).toBe(0);
  });

  it("caps same-reason retry attempts at the configured max", () => {
    expect(assistantFinalizationRetryAttemptsUsedForReason({
      sourceUserMessageId: "message-user-1",
      attempt: 12,
      maxRetries: 12,
      reason: "provider_interruption_continuation",
    }, "provider_interruption_continuation", 10)).toBe(10);
  });

  it("keys provider continuation retry accounting by recovery state id", () => {
    const activeRetry = {
      sourceUserMessageId: "message-user-1",
      attempt: 2,
      maxRetries: 10,
      reason: "provider_interruption_continuation" as const,
      recoveryStateId: "provider-continuation-a",
    };

    expect(assistantFinalizationRetryAttemptsUsedForReason(
      activeRetry,
      "provider_interruption_continuation",
      10,
      "provider-continuation-a",
    )).toBe(2);
    expect(assistantFinalizationRetryAttemptsUsedForReason(
      activeRetry,
      "provider_interruption_continuation",
      10,
      "provider-continuation-b",
    )).toBe(0);
  });
});

describe("recovered MCP bridge tool activation", () => {
  it("rehydrates compact installed-MCP bridge tools when the visible transcript proves MCP activity", () => {
    const toolNames = ambientMcpBridgeActiveToolNamesForRecoveredTranscript([
      { role: "user", content: "Install this MCP capability: https://github.com/hoqqun/stooq-mcp" },
      { role: "tool", content: "MCP server stooq-mcp-source-mcp is ready. ToolHive workload ambient-stooq-mcp-source-mcp-2c6b3f67." },
      { role: "assistant", content: "The server is installed. I will smoke-test it with ambient_mcp_tool_call." },
    ]);

    expect(toolNames).toEqual([...AMBIENT_DIRECT_MCP_TOOL_BRIDGE_NAMES]);
  });

  it("keeps unrelated recovered transcripts lean", () => {
    expect(ambientMcpBridgeActiveToolNamesForRecoveredTranscript([
      { role: "user", content: "Build a small TODO app." },
      { role: "assistant", content: "I created the app and ran tests." },
    ])).toEqual([]);
  });
});

describe("runtime provider diagnostics", () => {
  it("classifies rejected Ambient credentials as API-key repair failures", () => {
    const provider = {
      providerId: "ambient",
      providerLabel: "Ambient API",
      debugOverride: false,
      baseUrl: "https://api.ambient.xyz/v1",
      model: "ambient-preview",
      hasApiKey: true,
      source: "saved",
      storage: "os-encrypted",
    } as const;

    expect(isAmbientProviderAuthFailure({ message: "401 Unauthorized" }, provider)).toBe(true);
    expect(isAmbientProviderAuthFailure({ message: "upstream unavailable", statusCode: 502 }, provider)).toBe(false);
    expect(isAmbientProviderAuthFailure({ message: "local setup failed" }, { ...provider, hasApiKey: false, source: "missing" })).toBe(true);
  });

  it("captures redacted provider body and normalized stream failure source", () => {
    const error = Object.assign(new Error("Upstream error"), {
      status: 502,
      code: "bad_gateway",
      requestId: "req_123",
      body: "model overloaded Bearer abcdefghijklmnop",
      headers: {
        "cf-ray": "cf-ray-123",
        "retry-after": "3",
        authorization: "Bearer should-not-leak",
      },
    });

    const providerError = runtimeProviderErrorDiagnostic(error);
    const failure = buildRuntimeProviderFailureDiagnostic({
      providerStatus: {
        providerId: "ambient",
        providerLabel: "Ambient API",
        debugOverride: false,
        baseUrl: "https://api.ambient.xyz/v1",
        model: "ambient-preview",
        hasApiKey: true,
        source: "saved",
        storage: "os-encrypted",
      },
      kind: "provider_error_event",
      message: "Upstream error",
      runStartedAt: new Date(Date.now() - 100).toISOString(),
      error: providerError,
      retryScheduled: true,
      replaySafe: false,
      continuationSafe: true,
      usesFreshSession: true,
      retryAttempt: 1,
      maxRetries: 10,
      retryReason: "provider_interruption_continuation",
      stream: {
        eventCount: 1,
        approximatePayloadBytes: 200,
        preStreamTimeoutMs: 15_000,
        streamIdleTimeoutMs: 30_000,
        firstEventAt: "2026-05-25T00:00:00.000Z",
        firstEventType: "message_update",
        lastEventAt: "2026-05-25T00:00:01.000Z",
        lastEventType: "message_update",
        idleSource: runtimeProviderFailureIdleSource("provider_error_event"),
        assistantOutputChars: 0,
        thinkingOutputChars: 0,
        currentAssistantFinalTextChars: 0,
        semanticOutputSeen: false,
        receivedAnyText: false,
      },
      transcript: {
        toolCallSeen: true,
        toolMessageCount: 1,
        openToolCallCount: 1,
        completedToolMessageCount: 0,
      },
    });

    expect(providerError).toMatchObject({
      status: 502,
      code: "bad_gateway",
      requestId: "req_123",
      traceId: "cf-ray-123",
      retryAfter: "3",
      bodyPreview: "model overloaded Bearer [REDACTED]",
      detailPreview: "model overloaded Bearer [REDACTED]",
      headers: expect.objectContaining({
        "cf-ray": "cf-ray-123",
        "retry-after": "3",
      }),
    });
    expect(JSON.stringify(providerError)).not.toContain("abcdefghijklmnop");
    expect(JSON.stringify(providerError)).not.toContain("should-not-leak");
    expect(failure).toMatchObject({
      providerErrorBodyPreview: "model overloaded Bearer [REDACTED]",
      stream: expect.objectContaining({
        firstEventType: "message_update",
        lastEventType: "message_update",
        idleSource: "provider_error_event",
      }),
    });
  });
});

function manualTelegramDirectorySmokeChecklist(input: {
  profileId?: string;
  stateRoot?: string;
  ownerUserId?: string;
  apiCredentialsPresent: boolean;
}): string {
  const missing = [
    input.profileId ? undefined : "AMBIENT_MANUAL_TELEGRAM_PROFILE_ID",
    input.stateRoot ? undefined : "AMBIENT_MANUAL_TELEGRAM_STATE_ROOT or AMBIENT_AGENT_TELEGRAM_STATE_ROOT",
    input.ownerUserId ? undefined : "AMBIENT_MANUAL_TELEGRAM_OWNER_USER_ID",
    input.apiCredentialsPresent ? undefined : "AMBIENT_AGENT_TELEGRAM_API_ID and AMBIENT_AGENT_TELEGRAM_API_HASH",
  ].filter((value): value is string => Boolean(value));
  return [
    "Manual Telegram directory-to-binding smoke is not configured.",
    "",
    "Missing required inputs:",
    ...missing.map((item) => `- ${item}`),
    "",
    "Required environment:",
    "- AMBIENT_MANUAL_TELEGRAM_PROFILE_ID: local Telegram auth profile id from Ambient Telegram session setup/readiness.",
    "- AMBIENT_MANUAL_TELEGRAM_STATE_ROOT or AMBIENT_AGENT_TELEGRAM_STATE_ROOT: directory containing the profile bridge-session.json and TDLib state.",
    "- AMBIENT_MANUAL_TELEGRAM_OWNER_USER_ID: Telegram sender/user id for the owner who is allowed to control Ambient through this conversation.",
    "- AMBIENT_AGENT_TELEGRAM_API_ID and AMBIENT_AGENT_TELEGRAM_API_HASH: Telegram API credentials bound through Ambient-managed env/secret flow.",
    "",
    "Safe owner id sources:",
    "- Reuse ownerUserId from an existing Ambient owner binding.",
    "- Reuse sender id from a previous approved bridge event or polling result for this owner conversation.",
    "- If the owner id is unknown, stop and add/approve a narrow owner-id handoff; do not infer it from chat text.",
    "",
    "Do not ask Pi to scrape Telegram Desktop, use browser automation, run provider CLIs, or read arbitrary Telegram history to discover the owner id.",
    "",
    "Optional filters:",
    "- AMBIENT_MANUAL_TELEGRAM_DIRECTORY_QUERY",
    "- AMBIENT_MANUAL_TELEGRAM_DIRECTORY_LIMIT",
    "- AMBIENT_MANUAL_TELEGRAM_MESSAGE_ID",
  ].join("\n");
}

function manualTelegramDirectoryListSmokeChecklist(input: {
  profileId?: string;
  stateRoot?: string;
  apiCredentialsPresent: boolean;
}): string {
  const missing = [
    input.profileId ? undefined : "AMBIENT_MANUAL_TELEGRAM_PROFILE_ID",
    input.stateRoot ? undefined : "AMBIENT_MANUAL_TELEGRAM_STATE_ROOT or AMBIENT_AGENT_TELEGRAM_STATE_ROOT",
    input.apiCredentialsPresent ? undefined : "AMBIENT_AGENT_TELEGRAM_API_ID and AMBIENT_AGENT_TELEGRAM_API_HASH",
  ].filter((value): value is string => Boolean(value));
  return [
    "Manual Telegram metadata-only conversation directory picker is not configured.",
    "",
    "Missing required inputs:",
    ...missing.map((item) => `- ${item}`),
    "",
    "Required environment:",
    "- AMBIENT_MANUAL_TELEGRAM_DIRECTORY_LIST_SMOKE=1: opt in to the real Telegram metadata-only directory smoke.",
    "- AMBIENT_MANUAL_TELEGRAM_PROFILE_ID: local Telegram auth profile id from Ambient Telegram session setup/readiness.",
    "- AMBIENT_MANUAL_TELEGRAM_STATE_ROOT or AMBIENT_AGENT_TELEGRAM_STATE_ROOT: directory containing the profile bridge-session.json and TDLib state.",
    "- AMBIENT_AGENT_TELEGRAM_API_ID and AMBIENT_AGENT_TELEGRAM_API_HASH: Telegram API credentials bound through Ambient-managed env/secret flow.",
    "",
    "What the smoke does:",
    "- Starts or attaches the real Telegram bridge through the approved lifecycle path.",
    "- Calls the typed Telegram metadata-only conversation directory preview/apply tools.",
    "- Prints sanitized conversation ids, titles, types, unread counts, and update times so the owner-loop smoke can select a conversation id.",
    "- Does not read message bodies, run owner handoff, create bindings, poll unread commands, or send Telegram replies.",
    "",
    "Do not ask Pi to scrape Telegram Desktop, use browser automation, run provider CLIs, or read arbitrary Telegram history to discover the conversation id.",
    "",
    "Optional filters:",
    "- AMBIENT_MANUAL_TELEGRAM_DIRECTORY_QUERY",
    "- AMBIENT_MANUAL_TELEGRAM_DIRECTORY_LIMIT",
  ].join("\n");
}

function manualTelegramOwnerHandoffCheckSmokeChecklist(input: {
  profileId?: string;
  stateRoot?: string;
  conversationId?: string;
  setupCode?: string;
  apiCredentialsPresent: boolean;
}): string {
  const missing = [
    input.profileId ? undefined : "AMBIENT_MANUAL_TELEGRAM_PROFILE_ID",
    input.stateRoot ? undefined : "AMBIENT_MANUAL_TELEGRAM_STATE_ROOT or AMBIENT_AGENT_TELEGRAM_STATE_ROOT",
    input.conversationId ? undefined : "AMBIENT_MANUAL_TELEGRAM_CONVERSATION_ID",
    input.setupCode ? undefined : "AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SETUP_CODE",
    input.apiCredentialsPresent ? undefined : "AMBIENT_AGENT_TELEGRAM_API_ID and AMBIENT_AGENT_TELEGRAM_API_HASH",
  ].filter((value): value is string => Boolean(value));
  return [
    "Manual Telegram owner-handoff preflight smoke is not configured.",
    "",
    "Missing required inputs:",
    ...missing.map((item) => `- ${item}`),
    "",
    "Required environment:",
    "- AMBIENT_MANUAL_TELEGRAM_OWNER_HANDOFF_CHECK_SMOKE=1: opt in to the real Telegram owner-handoff preflight.",
    "- AMBIENT_MANUAL_TELEGRAM_PROFILE_ID: local Telegram auth profile id from Ambient Telegram session setup/readiness.",
    "- AMBIENT_MANUAL_TELEGRAM_STATE_ROOT or AMBIENT_AGENT_TELEGRAM_STATE_ROOT: directory containing the profile bridge-session.json and TDLib state.",
    "- AMBIENT_MANUAL_TELEGRAM_CONVERSATION_ID: exact Telegram conversation/chat id chosen from the metadata-only directory.",
    "- AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SETUP_CODE: exact single-line setup code to check.",
    "- AMBIENT_AGENT_TELEGRAM_API_ID and AMBIENT_AGENT_TELEGRAM_API_HASH: Telegram API credentials bound through Ambient-managed env/secret flow.",
    "",
    "What the smoke verifies:",
    "- Starts or attaches the real Telegram bridge through the approved lifecycle path.",
    "- Runs owner-handoff preview/apply against the selected conversation.",
    "- Accepts no-match as a valid preflight when no inbound setup-code message is present.",
    "- Does not create bindings, poll owner commands, send Telegram replies, or return provider message bodies.",
    "",
    "Important limitation:",
    "- Telegram bridge unread polling intentionally ignores outgoing messages from the bridge account.",
    "- Same-account Telegram Desktop or Saved Messages sends can check bridge health, but they will not satisfy owner handoff.",
    "- For a matched handoff, send the setup code from a separate inbound owner/delegate account in the selected conversation.",
    "",
    "Do not ask Pi to scrape Telegram Desktop, use browser automation, run provider CLIs, or read arbitrary Telegram history to discover the owner id.",
    "",
    "Optional filters:",
    "- AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_POLL_LIMIT",
  ].join("\n");
}

function manualTelegramGuidedOwnerLoopSmokeChecklist(input: {
  profileId?: string;
  stateRoot?: string;
  conversationId?: string;
  setupCode?: string;
  apiCredentialsPresent: boolean;
}): string {
  const missing = [
    input.profileId ? undefined : "AMBIENT_MANUAL_TELEGRAM_PROFILE_ID",
    input.stateRoot ? undefined : "AMBIENT_MANUAL_TELEGRAM_STATE_ROOT or AMBIENT_AGENT_TELEGRAM_STATE_ROOT",
    input.conversationId ? undefined : "AMBIENT_MANUAL_TELEGRAM_CONVERSATION_ID",
    input.setupCode ? undefined : "AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SETUP_CODE",
    input.apiCredentialsPresent ? undefined : "AMBIENT_AGENT_TELEGRAM_API_ID and AMBIENT_AGENT_TELEGRAM_API_HASH",
  ].filter((value): value is string => Boolean(value));
  return [
    "Manual guided Telegram owner-loop smoke is not configured.",
    "",
    "Missing required inputs:",
    ...missing.map((item) => `- ${item}`),
    "",
    "Required environment:",
    "- AMBIENT_MANUAL_TELEGRAM_GUIDED_OWNER_LOOP_SMOKE=1: opt in to the real guided Telegram owner-loop smoke.",
    "- AMBIENT_MANUAL_TELEGRAM_PROFILE_ID: local Telegram auth profile id from Ambient Telegram session setup/readiness.",
    "- AMBIENT_MANUAL_TELEGRAM_STATE_ROOT or AMBIENT_AGENT_TELEGRAM_STATE_ROOT: directory containing the profile bridge-session.json and TDLib state.",
    "- AMBIENT_MANUAL_TELEGRAM_CONVERSATION_ID: exact Telegram conversation/chat id chosen from the metadata-only directory.",
    "- AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SETUP_CODE: exact single-line setup code the script will wait for.",
    "- AMBIENT_AGENT_TELEGRAM_API_ID and AMBIENT_AGENT_TELEGRAM_API_HASH: Telegram API credentials bound through Ambient-managed env/secret flow.",
    "",
    "Guided sequence:",
    "- The script calls ambient_messaging_telegram_owner_loop_activation_plan before low-level tools so the real-provider smoke validates the same reviewed plan-first sequence Pi should use.",
    "- Start the guided script first so the bridge is live before the owner sends messages.",
    "- Send the setup code from an inbound owner/delegate account in the selected Telegram conversation.",
    "- After the script reports a matched owner handoff, send the owner command in the same conversation.",
    "- The script creates the Remote Ambient Surface binding only after owner handoff, calls the activation plan again after binding creation, then waits for the owner command.",
    "- It applies the command, previews the provider-neutral Remote Ambient Surface reply alias, revokes the binding, and stops the bridge.",
    "- It does not send a Telegram reply unless AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SEND_REPLY=1 is set for explicit manual send approval.",
    "",
    "Important limitation:",
    "- Same-account Telegram Desktop or Saved Messages sends will not satisfy owner handoff because outgoing bridge-account messages are skipped.",
    "",
    "Does not ask Pi to scrape Telegram Desktop, use browser automation, run provider CLIs, or read arbitrary Telegram history to discover owner ids or commands.",
    "",
    "Optional filters:",
    "- AMBIENT_MANUAL_TELEGRAM_DIRECTORY_QUERY",
    "- AMBIENT_MANUAL_TELEGRAM_DIRECTORY_LIMIT",
    "- AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_POLL_LIMIT",
    "- AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_COMMAND_TEXT",
    "- AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_COMMAND_NOT_BEFORE: optional ISO freshness anchor; older unread backlog is marked stale and not projected.",
    "- AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SEND_REPLY",
    "- AMBIENT_MANUAL_TELEGRAM_GUIDED_OWNER_LOOP_WAIT_SECONDS",
    "- AMBIENT_MANUAL_TELEGRAM_GUIDED_OWNER_LOOP_POLL_INTERVAL_MS",
    "- AMBIENT_MANUAL_TELEGRAM_GUIDED_OWNER_LOOP_POLLING_RUNNER=1: use the periodic Telegram bridge polling runner for command ingestion and verify scheduled ticks before cleanup.",
  ].join("\n");
}

function manualTelegramOwnerLoopSmokeChecklist(input: {
  profileId?: string;
  stateRoot?: string;
  conversationId?: string;
  setupCode?: string;
  apiCredentialsPresent: boolean;
}): string {
  const missing = [
    input.profileId ? undefined : "AMBIENT_MANUAL_TELEGRAM_PROFILE_ID",
    input.stateRoot ? undefined : "AMBIENT_MANUAL_TELEGRAM_STATE_ROOT or AMBIENT_AGENT_TELEGRAM_STATE_ROOT",
    input.conversationId ? undefined : "AMBIENT_MANUAL_TELEGRAM_CONVERSATION_ID",
    input.setupCode ? undefined : "AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SETUP_CODE",
    input.apiCredentialsPresent ? undefined : "AMBIENT_AGENT_TELEGRAM_API_ID and AMBIENT_AGENT_TELEGRAM_API_HASH",
  ].filter((value): value is string => Boolean(value));
  return [
    "Manual Telegram owner-loop smoke is not configured.",
    "",
    "Missing required inputs:",
    ...missing.map((item) => `- ${item}`),
    "",
    "Required environment:",
    "- AMBIENT_MANUAL_TELEGRAM_PROFILE_ID: local Telegram auth profile id from Ambient Telegram session setup/readiness.",
    "- AMBIENT_MANUAL_TELEGRAM_STATE_ROOT or AMBIENT_AGENT_TELEGRAM_STATE_ROOT: directory containing the profile bridge-session.json and TDLib state.",
    "- AMBIENT_MANUAL_TELEGRAM_CONVERSATION_ID: exact Telegram conversation/chat id chosen from the metadata-only directory.",
    "- AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SETUP_CODE: exact single-line code already sent by the owner in that conversation.",
    "- AMBIENT_AGENT_TELEGRAM_API_ID and AMBIENT_AGENT_TELEGRAM_API_HASH: Telegram API credentials bound through Ambient-managed env/secret flow.",
    "",
    "Before running:",
    "- Send the setup code from an inbound owner/delegate account in the selected Telegram conversation.",
    "- Then send the relay command in the same conversation so the subsequent real poll has a command to dispatch.",
    "- The default relay command is: switch project Manual Relay Smoke.",
    "- Do not use same-account outgoing messages; the bridge intentionally skips outgoing unread items.",
    "",
    "What the smoke verifies:",
    "- Starts or attaches the real Telegram bridge through the approved lifecycle path.",
    "- Reads the metadata-only conversation directory and verifies the configured conversation is present.",
    "- Runs owner handoff and creates the Remote Ambient Surface binding with ownerHandoffSourceMessageId.",
    "- Runs real unread polling, proves the setup-code message is deduped, applies the relay command, previews the provider-neutral reply alias, and revokes the binding.",
    "- Does not send a Telegram reply by default; set AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SEND_REPLY=1 only when you explicitly want the reviewed reply sent.",
    "",
    "Do not ask Pi to scrape Telegram Desktop, use browser automation, run provider CLIs, or read arbitrary Telegram history to discover the owner id.",
    "",
    "Optional filters:",
    "- AMBIENT_MANUAL_TELEGRAM_DIRECTORY_QUERY",
    "- AMBIENT_MANUAL_TELEGRAM_DIRECTORY_LIMIT",
    "- AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_POLL_LIMIT",
    "- AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_COMMAND_TEXT",
    "- AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_COMMAND_NOT_BEFORE: optional ISO freshness anchor; older unread backlog is marked stale and not projected.",
    "- AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SEND_REPLY",
  ].join("\n");
}

function manualTelegramOwnerLoopProjectFeatures(workspacePath: string) {
  const manualRelayProjectPath = join(workspacePath, "manual-relay-smoke-project");
  const project = (path: string, name: string): ProjectSummary => ({
    id: path,
    path,
    name,
    statePath: join(path, ".ambient-codex"),
    sessionPath: join(path, ".ambient-codex", "sessions"),
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T00:00:01.000Z",
    threads: [],
  });
  return {
    projects: {
      listProjects: () => [
        project(workspacePath, "Active project"),
        project(manualRelayProjectPath, "Manual Relay Smoke"),
      ],
      switchProject: (input: { workspacePath: string; reason: string }) => {
        if (input.workspacePath !== manualRelayProjectPath) {
          throw new Error(`Unexpected manual Telegram owner-loop project switch target: ${input.workspacePath}`);
        }
      },
    },
  };
}

async function applyManualOwnerLoopCommand(input: {
  tool: (name: string) => { name: string; execute: (...args: any[]) => Promise<any> };
  toolCallId: string;
  queuedProjectionId: string;
}): Promise<unknown | undefined> {
  try {
    const result = await input.tool("ambient_messaging_remote_surface_command_apply").execute(input.toolCallId, {
      queuedProjectionId: input.queuedProjectionId,
    });
    expect(["applied", "noop"]).toContain(result.details.applyStatus);
    return undefined;
  } catch (error) {
    return error;
  }
}

async function previewManualOwnerLoopRelay(input: {
  tool: (name: string) => { name: string; execute: (...args: any[]) => Promise<any> };
  toolCallIdPrefix: string;
  queuedProjectionId: string;
  sendReply: boolean;
}): Promise<void> {
  const status = await input.tool("ambient_messaging_gateway_status").execute(`${input.toolCallIdPrefix}-relay-status`, {});
  const relaySummary = (status.details.remoteSurfaceRelaySummaries as Array<any> | undefined)
    ?.find((candidate) =>
      candidate.queuedProjectionId === input.queuedProjectionId &&
      candidate.relayActionStatus === "preview-ready");
  if (!relaySummary?.runtimeEventId) {
    throw new Error([
      "Manual Telegram owner-loop relay smoke did not produce a preview-ready runtime event.",
      "Use a command that produces a relayable runtime event, for example: switch project Manual Relay Smoke.",
      status.content?.[0]?.text ?? JSON.stringify(status.details, null, 2),
    ].join("\n"));
  }
  expect(relaySummary.previewToolName).toBe("ambient_messaging_remote_surface_reply_preview");
  expect(relaySummary.applyToolName).toBe("ambient_messaging_remote_surface_reply_apply");
  expect(relaySummary.targetProviderId).toBe("telegram-tdlib");

  const replyPreview = await input.tool("ambient_messaging_remote_surface_reply_preview").execute(`${input.toolCallIdPrefix}-reply-preview`, {
    runtimeEventId: relaySummary.runtimeEventId,
  });
  expect(replyPreview.content[0].text).toContain("Remote Ambient Surface reply preview");
  expect(replyPreview.content[0].text).toContain("Delegated tool: ambient_messaging_telegram_bridge_reply_preview");
  expect(replyPreview.details).toMatchObject({
    status: "ready",
    delegatedToolName: "ambient_messaging_telegram_bridge_reply_preview",
    delegatedProviderId: "telegram-tdlib",
  });

  const writeOwnerLoopOutput = async (extra: Record<string, unknown> = {}) => {
    const outputPath = process.env.AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_OUTPUT_PATH?.trim();
    if (!outputPath) return;
    let existing: Record<string, unknown> = {};
    try {
      existing = JSON.parse(await readFile(outputPath, "utf8"));
    } catch {
      existing = {};
    }
    await writeFile(outputPath, JSON.stringify({
      generatedAt: existing.generatedAt ?? new Date().toISOString(),
      ...existing,
      queuedProjectionId: input.queuedProjectionId,
      runtimeEventId: relaySummary.runtimeEventId,
      relayActionStatus: relaySummary.relayActionStatus,
      targetProviderId: relaySummary.targetProviderId,
      previewStatus: replyPreview.details.status,
      delegatedPreviewToolName: replyPreview.details.delegatedToolName,
      delegatedProviderId: replyPreview.details.delegatedProviderId,
      replySent: false,
      privacy: {
        providerMessageBodiesReturned: false,
        providerHistoryRead: false,
      },
      ...extra,
      updatedAt: new Date().toISOString(),
    }, null, 2), "utf8");
  };

  if (!input.sendReply) {
    await writeOwnerLoopOutput();
    console.info("Manual Telegram owner-loop relay preview completed without sending; set AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SEND_REPLY=1 to send the reviewed reply.");
    return;
  }

  const replyApply = await input.tool("ambient_messaging_remote_surface_reply_apply").execute(`${input.toolCallIdPrefix}-reply-apply`, {
    runtimeEventId: relaySummary.runtimeEventId,
  });
  expect(replyApply.content[0].text).toContain("Remote Ambient Surface reply apply");
  expect(replyApply.content[0].text).toContain("Delegated tool: ambient_messaging_telegram_bridge_reply_apply");
  expect(replyApply.details).toMatchObject({
    status: "sent",
    delegatedToolName: "ambient_messaging_telegram_bridge_reply_apply",
    delegatedProviderId: "telegram-tdlib",
  });
  const statusAfterSend = await input.tool("ambient_messaging_gateway_status").execute(`${input.toolCallIdPrefix}-status-after-reply`, {});
  const eventAfterSend = (statusAfterSend.details.remoteSurfaceRuntimeEvents as Array<any> | undefined)
    ?.find((candidate) => candidate.id === relaySummary.runtimeEventId);
  const relaySummaryAfterSend = (statusAfterSend.details.remoteSurfaceRelaySummaries as Array<any> | undefined)
    ?.find((candidate) => candidate.runtimeEventId === relaySummary.runtimeEventId);
  expect(eventAfterSend).toMatchObject({
    id: relaySummary.runtimeEventId,
    relayStatus: "sent",
    relaySuggested: false,
  });
  expect(relaySummaryAfterSend).toMatchObject({
    runtimeEventId: relaySummary.runtimeEventId,
    relayActionStatus: "already-relayed",
    duplicateBlocked: true,
  });
  const duplicatePreview = await input.tool("ambient_messaging_remote_surface_reply_preview").execute(`${input.toolCallIdPrefix}-duplicate-reply-preview`, {
    runtimeEventId: relaySummary.runtimeEventId,
  });
  expect(duplicatePreview.details.status).toBe("blocked");
  expect(duplicatePreview.content[0].text).toContain("Remote Ambient Surface runtime event has already been relayed.");
  const duplicateApply = await input.tool("ambient_messaging_remote_surface_reply_apply").execute(`${input.toolCallIdPrefix}-duplicate-reply-apply`, {
    runtimeEventId: relaySummary.runtimeEventId,
  });
  expect(duplicateApply.details.status).toBe("blocked");
  expect(duplicateApply.content[0].text).toContain("Remote Ambient Surface runtime event has already been relayed.");
  await writeOwnerLoopOutput({
    replySent: true,
    replyApplyStatus: replyApply.details.status,
    delegatedApplyToolName: replyApply.details.delegatedToolName,
    deliveryStatus: replyApply.details.delivery?.status,
    providerMessageId: replyApply.details.delivery?.providerMessageId,
    relayStatusAfterSend: eventAfterSend?.relayStatus,
    relayActionStatusAfterSend: relaySummaryAfterSend?.relayActionStatus,
    duplicateBlockedAfterSend: relaySummaryAfterSend?.duplicateBlocked === true,
    duplicatePreviewStatus: duplicatePreview.details.status,
    duplicateApplyStatus: duplicateApply.details.status,
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describeNative("AgentRuntime privileged adapter selection", () => {
  it("surfaces the selected macOS policy-boundary adapter through privileged tools", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-privileged-adapter-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const thread = store.updateThreadSettings(store.createThread("privileged adapter").id, { permissionMode: "workspace" });
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        () => undefined,
        {
          request: vi.fn(async () => ({ allowed: true, mode: "allow_once" as const })),
          denyThread: () => undefined,
        },
        {
          privilegedActionAdapter: new MacosAuthorizedHelperUnavailableAdapter({
            commandRunner: async () => ({ exitCode: 0, stdout: "ok\n", stderr: "" }),
          }),
          privilegedCredentials: {
            request: async () => ({ allowed: true, credential: "ambient-password" }),
          },
        },
      );
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      (runtime as any).createPrivilegedActionToolExtension(thread.id, store.getWorkspace())({
        registerTool: (tool: any) => registeredTools.push(tool),
      });

      const statusTool = registeredTools.find((tool) => tool.name === "ambient_privileged_action_status");
      const requestTool = registeredTools.find((tool) => tool.name === "ambient_privileged_action_request");
      if (!statusTool || !requestTool) throw new Error("Expected privileged tools to be registered.");

      const statusResult = await statusTool.execute("status-call", {});
      expect(statusResult.content[0].text).toContain("Selected adapter: macos-authorized-helper");
      expect(statusResult.details.adapterStatus.selectedAdapter).toBe("macos-authorized-helper");

      const requestResult = await requestTool.execute("request-call", {
        kind: "privileged_action_template",
        purpose: "create_system_symlink",
        platform: "darwin",
        packageName: "ambient-kokoro-tts",
        reason: "Repair a compiled-in runtime data path.",
        credential: "{{AMBIENT_PRIVILEGED_AUTH}}",
        commands: [{
          exe: "/bin/ln",
          args: ["-sfn", ".ambient/runtime/espeak-ng-data", "/Library/Application Support/Ambient/protected-runtime/espeak-ng-data"],
        }],
      });

      expect(requestResult.content[0].text).toContain("Status: succeeded");
      expect(requestResult.content[0].text).toContain("Adapter: macos-authorized-helper");
      expect(requestResult.content[0].text).toContain("state: ready-to-resume-validation");
      expect(requestResult.details).toMatchObject({
        status: "succeeded",
        adapter: "macos-authorized-helper",
        credentialCapture: "captured-and-discarded",
        nativeResult: {
          executionPlan: { allowedByPolicy: true },
          continuation: { state: "ready-to-resume-validation" },
        },
      });
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("auto-resumes Builder validation after a successful privileged adapter result", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-privileged-resume-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      await scaffoldCapabilityBuilderPackage(workspacePath, {
        name: "piper-tts",
        goal: "Generate WAV voice files from text using Piper",
      });
      const thread = store.updateThreadSettings(store.createThread("privileged resume").id, { permissionMode: "workspace" });
      const requester = vi.fn(async (_request: any) => ({ allowed: true, mode: "allow_once" as const }));
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        () => undefined,
        {
          request: requester,
          denyThread: () => undefined,
        },
        {
          privilegedActionAdapter: new SuccessfulPrivilegedActionAdapter(),
        },
      );
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      (runtime as any).createPrivilegedActionToolExtension(thread.id, store.getWorkspace())({
        registerTool: (tool: any) => registeredTools.push(tool),
      });

      const requestTool = registeredTools.find((tool) => tool.name === "ambient_privileged_action_request");
      if (!requestTool) throw new Error("Expected privileged request tool to be registered.");
      const updates: any[] = [];
      const requestResult = await requestTool.execute("request-call", {
        kind: "privileged_action_template",
        purpose: "create_system_symlink",
        platform: "darwin",
        packageName: "piper-tts",
        reason: "Repair a compiled-in runtime data path.",
        credential: "{{AMBIENT_PRIVILEGED_AUTH}}",
        commands: [{
          exe: "/bin/ln",
          args: ["-sfn", ".ambient/runtime/espeak-ng-data", "/Library/Application Support/Ambient/protected-runtime/espeak-ng-data"],
        }],
      }, undefined, (update: any) => updates.push(update));

      expect(requestResult.content[0].text).toContain("Status: succeeded");
      expect(requestResult.content[0].text).toContain("Auto-resumed Capability Builder validation");
      expect(requestResult.content[0].text).toContain("Ambient Capability Builder validation");
      expect(requestResult.content[0].text).toContain("Package: ambient-piper-tts");
      expect(requestResult.details).toMatchObject({
        status: "succeeded",
        credentialCapture: "captured-and-discarded",
        autoResumeValidation: {
          status: "succeeded",
          packageName: "ambient-piper-tts",
          commandCount: 2,
        },
      });
      expect(updates).toEqual(expect.arrayContaining([
        expect.objectContaining({
          details: expect.objectContaining({
            toolName: "ambient_capability_builder_validate",
            reason: "privileged-action-succeeded",
          }),
        }),
      ]));
      expect(requester).toHaveBeenCalledTimes(2);
      expect(store.listPermissionAudit(10)).toEqual(expect.arrayContaining([
        expect.objectContaining({ toolName: "ambient_privileged_action_request", decision: "allowed" }),
        expect.objectContaining({ toolName: "ambient_capability_builder_validate", decision: "allowed" }),
      ]));
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});

class SuccessfulPrivilegedActionAdapter implements PrivilegedActionAdapter {
  readonly name = "macos-authorized-helper";

  status() {
    return privilegedActionAdapterStatus({ selectedAdapter: this.name });
  }

  async execute(input: PrivilegedActionAdapterExecuteInput) {
    return successfulPrivilegedActionNativeRequest(input.request, {
      adapter: "macos-authorized-helper",
      credentialCapture: "captured-and-discarded",
      executionPlan: {
        adapter: "macos-authorized-helper",
        executionMode: "planned-not-executed",
        allowedByPolicy: true,
        policyReason: "Allowlisted test privileged action.",
        platform: "darwin",
        purpose: input.request.template.purpose,
        requiresCredential: true,
        executesPrivilegedCommands: false,
        warnings: [],
      },
      logPath: join(input.request.workspacePath, ".ambient/privileged-actions/success.json"),
    });
  }
}

describe("AgentRuntime terminal cleanup", () => {
  it("blocks parent finalization while required sub-agent wait barriers are unresolved", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-finalization-barrier-"));
    const store = new ProjectStore();
    const emitted: any[] = [];
    try {
      const workspace = store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const thread = store.createThread("subagent finalization barrier");
      const threadSessionDir = join(workspace.sessionPath, thread.id);
      await mkdir(threadSessionDir, { recursive: true });
      const sessionFile = join(threadSessionDir, "session.jsonl");
      await writeFile(sessionFile, "", "utf8");
      let parentRunId = "";
      let childRunId = "";
      let barrierId = "";
      const subscribers: Array<(event: any) => void> = [];
      const emit = (event: any) => {
        for (const subscriber of [...subscribers]) subscriber(event);
      };
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        () =>
          ({
            isDestroyed: () => false,
            webContents: {
              isDestroyed: () => false,
              isCrashed: () => false,
              send: (_channel: string, event: any) => emitted.push(event),
            },
          }) as any,
        {
          request: vi.fn(),
          denyThread: () => undefined,
        },
      );
      const session = {
        ...fakePiSession(sessionFile),
        isStreaming: true,
        subscribe: vi.fn((subscriber: (event: any) => void) => {
          subscribers.push(subscriber);
          return () => {
            const index = subscribers.indexOf(subscriber);
            if (index >= 0) subscribers.splice(index, 1);
          };
        }),
        prompt: vi.fn(async () => {
          parentRunId = (runtime as any).activeRunIds.get(thread.id);
          const parentAssistantMessageId = store
            .listMessages(thread.id)
            .find((message) => message.role === "assistant" && message.metadata?.status === "streaming")?.id;
          const featureFlags = resolveAmbientFeatureFlags({
            settings: store.getFeatureFlagSettings(),
            generatedAt: "2026-06-05T00:00:00.000Z",
          });
          const child = store.createSubagentRun({
            parentThreadId: thread.id,
            parentRunId,
            parentMessageId: parentAssistantMessageId,
            title: "Required unfinished child",
            roleId: "summarizer",
            canonicalTaskPath: "root/0:summarizer",
            featureFlagSnapshot: featureFlags,
            modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(thread.model, "2026-06-05T00:00:00.000Z"),
            dependencyMode: "required",
          });
          childRunId = child.id;
          store.markSubagentRunStatus(child.id, "running");
          const barrier = store.createSubagentWaitBarrier({
            parentThreadId: thread.id,
            parentRunId,
            childRunIds: [child.id],
            dependencyMode: "required_all",
            failurePolicy: "ask_user",
          });
          barrierId = barrier.id;
          emit({ type: "message_start", message: { role: "assistant" } });
          emit({
            type: "message_end",
            message: {
              role: "assistant",
              stopReason: "stop",
              content: [{ type: "text", text: "I am done even though the required child is still running." }],
            },
          });
        }),
        steer: vi.fn(async () => undefined),
        compact: vi.fn(async () => undefined),
        agent: {
          abort: vi.fn(),
          waitForIdle: vi.fn(async () => undefined),
        },
      };
      vi.spyOn(runtime as any, "getSession").mockResolvedValue(session);

      await runtime.send({
        threadId: thread.id,
        content: "Use a required child and then summarize.",
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: "ambient-preview",
        thinkingLevel: "minimal",
        delivery: "prompt",
        context: [],
      });

      const finalAssistant = store.listMessages(thread.id).filter((message) => message.role === "assistant").at(-1);
      const attentionEvents = store
        .listSubagentParentMailboxEventsForParentRun(parentRunId)
        .filter((event) => event.type === "subagent.wait_barrier_attention");
      expect(attentionEvents).toHaveLength(1);
      expect(attentionEvents[0]).toMatchObject({
        parentThreadId: thread.id,
        parentRunId,
        parentMessageId: expect.any(String),
        deliveryState: "queued",
        payload: expect.objectContaining({
          schemaVersion: "ambient-subagent-wait-barrier-attention-v1",
          parentThreadId: thread.id,
          parentRunId,
          childRunId,
          childRunIds: [childRunId],
          waitBarrierId: barrierId,
          dependencyMode: "required_all",
          barrierStatus: "waiting_on_children",
          failurePolicy: "ask_user",
          parentFinalizationBlocked: true,
          parentResolution: expect.objectContaining({
            action: "wait_for_child",
            canSynthesize: false,
          }),
          allowedUserChoices: expect.arrayContaining([
            expect.objectContaining({ id: "wait_again", toolAction: "wait_agent" }),
            expect.objectContaining({ id: "cancel_parent", decision: "cancel_parent" }),
          ]),
        }),
      });
      expect(finalAssistant).toMatchObject({
        content: expect.stringContaining("Parent final answer blocked because required sub-agent work is not safe for synthesis."),
        metadata: expect.objectContaining({
          status: "error",
          subagentFinalizationBlocked: expect.objectContaining({
            reason: "required_wait_barrier_not_satisfied",
            barrierIds: [barrierId],
            childRunIds: [childRunId],
            parentMailboxEventIds: [attentionEvents[0]!.id],
          }),
        }),
      });
      expect(store.getRunRecord(parentRunId)).toMatchObject({
        status: "error",
        errorMessage: expect.stringContaining("Parent final answer blocked because required sub-agent work is not safe for synthesis."),
      });
      expect(store.getSubagentWaitBarrier(barrierId)).toMatchObject({
        status: "waiting_on_children",
        childRunIds: [childRunId],
      });
      expect(emitted).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "runtime-activity",
          activity: expect.objectContaining({
            kind: "stream",
            status: "timeout",
            diagnostic: expect.objectContaining({
              reason: "required_wait_barrier_not_satisfied",
              barrierIds: [barrierId],
              childRunIds: [childRunId],
            }),
          }),
          workspacePath,
        }),
        expect.objectContaining({
          type: "error",
          message: expect.stringContaining("Parent final answer blocked because required sub-agent work is not safe for synthesis."),
          threadId: thread.id,
          workspacePath,
        }),
        expect.objectContaining({
          type: "subagent-parent-mailbox-event-updated",
          mailboxEvent: expect.objectContaining({
            id: attentionEvents[0]!.id,
            type: "subagent.wait_barrier_attention",
          }),
          workspacePath,
        }),
      ]));
      expect(store.listActiveRuns()).toEqual([]);
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("blocks parent finalization after required sub-agent wait barriers resolve unsafe", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-failed-barrier-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const thread = store.createThread("subagent failed barrier");
      const threadSessionDir = join(workspace.sessionPath, thread.id);
      await mkdir(threadSessionDir, { recursive: true });
      const sessionFile = join(threadSessionDir, "session.jsonl");
      await writeFile(sessionFile, "", "utf8");
      let parentRunId = "";
      let childRunId = "";
      let barrierId = "";
      const subscribers: Array<(event: any) => void> = [];
      const emit = (event: any) => {
        for (const subscriber of [...subscribers]) subscriber(event);
      };
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });
      const session = {
        ...fakePiSession(sessionFile),
        isStreaming: true,
        subscribe: vi.fn((subscriber: (event: any) => void) => {
          subscribers.push(subscriber);
          return () => {
            const index = subscribers.indexOf(subscriber);
            if (index >= 0) subscribers.splice(index, 1);
          };
        }),
        prompt: vi.fn(async () => {
          parentRunId = (runtime as any).activeRunIds.get(thread.id);
          const parentAssistantMessageId = store
            .listMessages(thread.id)
            .find((message) => message.role === "assistant" && message.metadata?.status === "streaming")?.id;
          const featureFlags = resolveAmbientFeatureFlags({
            settings: store.getFeatureFlagSettings(),
            generatedAt: "2026-06-05T00:00:00.000Z",
          });
          const child = store.createSubagentRun({
            parentThreadId: thread.id,
            parentRunId,
            parentMessageId: parentAssistantMessageId,
            title: "Required failed child",
            roleId: "reviewer",
            canonicalTaskPath: "root/0:reviewer",
            featureFlagSnapshot: featureFlags,
            modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(thread.model, "2026-06-05T00:00:00.000Z"),
            dependencyMode: "required",
          });
          childRunId = child.id;
          store.markSubagentRunStatus(child.id, "failed", {
            resultArtifact: {
              schemaVersion: "ambient-subagent-result-artifact-v1",
              runId: child.id,
              status: "failed",
              partial: false,
              summary: "child failed",
              childThreadId: child.childThreadId,
            },
          });
          const barrier = store.createSubagentWaitBarrier({
            parentThreadId: thread.id,
            parentRunId,
            childRunIds: [child.id],
            dependencyMode: "required_all",
            failurePolicy: "fail_parent",
          });
          barrierId = barrier.id;
          store.updateSubagentWaitBarrierStatus(barrier.id, "failed", {
            resolutionArtifact: {
              schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
              childRunIds: [child.id],
              childStatuses: [{ childRunId: child.id, status: "failed" }],
              synthesisAllowed: false,
              transitionEvidence: {
                schemaVersion: "ambient-subagent-wait-barrier-transition-evidence-v1",
                kind: "child_terminal",
                source: "wait_agent",
                childRunId: child.id,
                childRunIds: [child.id],
                reason: "child failed",
              },
            },
          });
          emit({ type: "message_start", message: { role: "assistant" } });
          emit({
            type: "message_end",
            message: {
              role: "assistant",
              stopReason: "stop",
              content: [{ type: "text", text: "I will pretend the failed child succeeded." }],
            },
          });
        }),
        steer: vi.fn(async () => undefined),
        compact: vi.fn(async () => undefined),
        agent: {
          abort: vi.fn(),
          waitForIdle: vi.fn(async () => undefined),
        },
      };
      vi.spyOn(runtime as any, "getSession").mockResolvedValue(session);

      await runtime.send({
        threadId: thread.id,
        content: "Use a required child and then summarize.",
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: "ambient-preview",
        thinkingLevel: "minimal",
        delivery: "prompt",
        context: [],
      });

      const finalAssistant = store.listMessages(thread.id).filter((message) => message.role === "assistant").at(-1);
      const attentionEvents = store
        .listSubagentParentMailboxEventsForParentRun(parentRunId)
        .filter((event) => event.type === "subagent.wait_barrier_attention");
      expect(attentionEvents).toHaveLength(1);
      expect(attentionEvents[0]).toMatchObject({
        parentThreadId: thread.id,
        parentRunId,
        payload: expect.objectContaining({
          schemaVersion: "ambient-subagent-wait-barrier-attention-v1",
          childRunId,
          childRunIds: [childRunId],
          waitBarrierId: barrierId,
          dependencyMode: "required_all",
          barrierStatus: "failed",
          failurePolicy: "fail_parent",
          parentFinalizationBlocked: true,
          parentResolution: expect.objectContaining({
            action: "fail_parent",
            canSynthesize: false,
          }),
          allowedUserChoices: expect.arrayContaining([
            expect.objectContaining({ id: "fail_parent", decision: "fail_parent" }),
            expect.objectContaining({ id: "cancel_parent", decision: "cancel_parent" }),
          ]),
        }),
      });
      expect(finalAssistant).toMatchObject({
        content: expect.stringContaining("Parent final answer blocked because required sub-agent work is not safe for synthesis."),
        metadata: expect.objectContaining({
          status: "error",
          subagentFinalizationBlocked: expect.objectContaining({
            reason: "required_wait_barrier_not_satisfied",
            barrierIds: [barrierId],
            childRunIds: [childRunId],
            parentMailboxEventIds: [attentionEvents[0]!.id],
            barriers: [expect.objectContaining({
              id: barrierId,
              status: "failed",
              failurePolicy: "fail_parent",
            })],
          }),
        }),
      });
      expect(store.getRunRecord(parentRunId)).toMatchObject({
        status: "error",
        errorMessage: expect.stringContaining("Parent final answer blocked because required sub-agent work is not safe for synthesis."),
      });
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("blocks parent finalization while blocking callable workflow tasks are unresolved", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-callable-workflow-block-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const thread = store.createThread("callable workflow parent block");
      const threadSessionDir = join(workspace.sessionPath, thread.id);
      await mkdir(threadSessionDir, { recursive: true });
      const sessionFile = join(threadSessionDir, "session.jsonl");
      await writeFile(sessionFile, "", "utf8");
      let parentRunId = "";
      let taskId = "";
      const subscribers: Array<(event: any) => void> = [];
      const emit = (event: any) => {
        for (const subscriber of [...subscribers]) subscriber(event);
      };
      const emitted: any[] = [];
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        () =>
          ({
            isDestroyed: () => false,
            webContents: {
              isDestroyed: () => false,
              isCrashed: () => false,
              send: (_channel: string, event: any) => emitted.push(event),
            },
          }) as any,
        {
          request: vi.fn(),
          denyThread: () => undefined,
        },
      );
      const session = {
        ...fakePiSession(sessionFile),
        isStreaming: true,
        subscribe: vi.fn((subscriber: (event: any) => void) => {
          subscribers.push(subscriber);
          return () => {
            const index = subscribers.indexOf(subscriber);
            if (index >= 0) subscribers.splice(index, 1);
          };
        }),
        prompt: vi.fn(async () => {
          parentRunId = (runtime as any).activeRunIds.get(thread.id);
          const parentAssistantMessageId = store
            .listMessages(thread.id)
            .find((message) => message.role === "assistant" && message.metadata?.status === "streaming")?.id;
          const featureFlags = resolveAmbientFeatureFlags({
            settings: store.getFeatureFlagSettings(),
            generatedAt: "2026-06-06T18:00:00.000Z",
          });
          const registry = buildCallableWorkflowRegistry({ featureFlagSnapshot: featureFlags });
          const descriptor = registry.tools.find((tool) => tool.name === callableWorkflowToolName(SYMPHONY_WORKFLOW_PATTERN_IDS[0]));
          if (!descriptor) throw new Error("Missing map-reduce callable workflow descriptor");
          const executionPlan = buildCallableWorkflowExecutionPlan({
            descriptor,
            runPlan: buildCallableWorkflowRunPlan(descriptor, {
              goal: "Summarize release notes",
              blocking: true,
              metricCriteria: [
                {
                  templateId: "map_reduce-metric",
                  value: "Every mapped item has reducer evidence.",
                },
              ],
            }),
            parent: {
              threadId: thread.id,
              runId: parentRunId,
              assistantMessageId: parentAssistantMessageId,
            },
            toolCallId: "callable-workflow-tool-call",
            createdAt: "2026-06-06T18:00:00.000Z",
          });
          const task = store.enqueueCallableWorkflowTask({
            executionPlan,
            featureFlagSnapshot: featureFlags,
          });
          taskId = task.id;
          emit({ type: "message_start", message: { role: "assistant" } });
          emit({
            type: "message_end",
            message: {
              role: "assistant",
              stopReason: "stop",
              content: [{ type: "text", text: "I am done even though the blocking workflow has not run yet." }],
            },
          });
        }),
        steer: vi.fn(async () => undefined),
        compact: vi.fn(async () => undefined),
        agent: {
          abort: vi.fn(),
          waitForIdle: vi.fn(async () => undefined),
        },
      };
      vi.spyOn(runtime as any, "getSession").mockResolvedValue(session);

      await runtime.send({
        threadId: thread.id,
        content: "Run a blocking callable workflow and then summarize.",
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: "ambient-preview",
        thinkingLevel: "minimal",
        delivery: "prompt",
        context: [],
      });

      const finalAssistant = store.listMessages(thread.id).filter((message) => message.role === "assistant").at(-1);
      const attentionEvents = store
        .listSubagentParentMailboxEventsForParentRun(parentRunId)
        .filter((event) => event.type === CALLABLE_WORKFLOW_PARENT_BLOCKED_MAILBOX_TYPE);
      expect(attentionEvents).toHaveLength(1);
      expect(attentionEvents[0]).toMatchObject({
        parentThreadId: thread.id,
        parentRunId,
        parentMessageId: expect.any(String),
        deliveryState: "queued",
        payload: expect.objectContaining({
          schemaVersion: "ambient-callable-workflow-parent-blocking-v1",
          parentThreadId: thread.id,
          parentRunId,
          parentFinalizationBlocked: true,
          synthesisAllowed: false,
          reason: "blocking_callable_workflow_not_synthesis_safe",
          taskIds: [taskId],
          waitingTaskIds: [taskId],
          attentionTaskIds: [],
          allowedUserChoices: expect.arrayContaining([
            expect.objectContaining({ id: "wait_again", action: "wait_for_workflow" }),
            expect.objectContaining({ id: "cancel_parent", action: "cancel_parent_run" }),
          ]),
          tasks: [expect.objectContaining({
            id: taskId,
            status: "queued",
            statusGroup: "waiting_on_workflow",
            toolName: "ambient_workflow_symphony_map_reduce",
          })],
        }),
      });
      expect(finalAssistant).toMatchObject({
        content: "",
        metadata: expect.objectContaining({
          status: "error",
          callableWorkflowFinalizationBlocked: expect.objectContaining({
            reason: "blocking_callable_workflow_not_synthesis_safe",
            taskIds: [taskId],
            waitingTaskIds: [taskId],
            parentMailboxEventId: attentionEvents[0]!.id,
          }),
        }),
      });
      const task = store.getCallableWorkflowTask(taskId);
      const parentAssistantMessagesAfterTask = store
        .listMessages(thread.id)
        .filter((message) =>
          message.role === "assistant" &&
          message.createdAt >= task.createdAt &&
          message.content.trim().length > 0
        );
      expect(parentAssistantMessagesAfterTask).toEqual([]);
      expect(store.getRunRecord(parentRunId)).toMatchObject({
        status: "error",
        errorMessage: expect.stringContaining("Parent final answer blocked because blocking callable workflow work is not safe for synthesis."),
      });
      expect(emitted).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "runtime-activity",
          activity: expect.objectContaining({
            kind: "stream",
            status: "timeout",
            diagnostic: expect.objectContaining({
              reason: "blocking_callable_workflow_not_synthesis_safe",
              taskIds: [taskId],
            }),
          }),
          workspacePath,
        }),
        expect.objectContaining({
          type: "error",
          message: expect.stringContaining("Parent final answer blocked because blocking callable workflow work is not safe for synthesis."),
          threadId: thread.id,
          workspacePath,
        }),
        expect.objectContaining({
          type: "subagent-parent-mailbox-event-updated",
          mailboxEvent: expect.objectContaining({
            id: attentionEvents[0]!.id,
            type: CALLABLE_WORKFLOW_PARENT_BLOCKED_MAILBOX_TYPE,
          }),
          workspacePath,
        }),
        expect.objectContaining({
          type: "thread-updated",
          thread: expect.objectContaining({ id: thread.id }),
          workspacePath,
        }),
      ]));
      expect(store.listActiveRuns()).toEqual([]);
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("suppresses callable workflow parent chatter by parent message id when the message predates the task", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-callable-workflow-owned-message-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const thread = store.createThread("callable workflow stale parent message");
      const ownedParentMessage = store.addMessage({
        threadId: thread.id,
        role: "assistant",
        content: "Launched the workflow and now I am narrating parent work.",
        metadata: { status: "done", runtime: "pi" },
      });
      const unrelatedEarlierMessage = store.addMessage({
        threadId: thread.id,
        role: "assistant",
        content: "Earlier assistant answer should remain visible.",
        metadata: { status: "done", runtime: "pi" },
      });
      const finalBlockedMessage = store.addMessage({
        threadId: thread.id,
        role: "assistant",
        content: "",
        metadata: { status: "error", runtime: "pi" },
      });
      const emitted: any[] = [];
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        () =>
          ({
            isDestroyed: () => false,
            webContents: {
              isDestroyed: () => false,
              isCrashed: () => false,
              send: (_channel: string, event: any) => emitted.push(event),
            },
          }) as any,
        {
          request: vi.fn(),
          denyThread: () => undefined,
        },
      );

      (runtime as any).suppressCallableWorkflowParentAssistantMessages({
        reason: "blocking_callable_workflow_not_synthesis_safe",
        parentThreadId: thread.id,
        parentMessageId: ownedParentMessage.id,
        taskIds: ["workflow-task-1"],
        tasks: [{
          id: "workflow-task-1",
          parentMessageId: ownedParentMessage.id,
          createdAt: "2999-06-06T18:00:00.000Z",
        }],
      }, { preserveMessageId: finalBlockedMessage.id });

      const messages = () => store.listMessages(thread.id);
      const messageById = (id: string) => messages().find((message) => message.id === id);
      expect(messageById(ownedParentMessage.id)).toMatchObject({
        content: "",
        metadata: expect.objectContaining({
          callableWorkflowParentOutputSuppressed: expect.objectContaining({
            taskIds: ["workflow-task-1"],
            parentMessageId: ownedParentMessage.id,
          }),
        }),
      });
      expect(messageById(unrelatedEarlierMessage.id)?.content).toBe("Earlier assistant answer should remain visible.");
      expect(messageById(finalBlockedMessage.id)?.content).toBe("");
      expect(emitted).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "message-updated",
          message: expect.objectContaining({ id: ownedParentMessage.id }),
        }),
        expect.objectContaining({
          type: "thread-updated",
          thread: expect.objectContaining({ id: thread.id }),
          workspacePath,
        }),
      ]));
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("reconciles stale waiting barriers during parent finalization when child results are now safe", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-readonly-finalization-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const parent = store.createThread("readonly finalization barrier");
      const assistant = store.addMessage({
        threadId: parent.id,
        role: "assistant",
        content: "",
        metadata: { status: "streaming", runtime: "pi" },
      });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const featureFlags = resolveAmbientFeatureFlags({
        settings: store.getFeatureFlagSettings(),
        generatedAt: "2026-06-05T00:00:00.000Z",
      });
      const child = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Late safe child",
        roleId: "summarizer",
        canonicalTaskPath: "root/0:summarizer",
        featureFlagSnapshot: featureFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });
      store.markSubagentRunStatus(child.id, "completed", {
        resultArtifact: {
          schemaVersion: "ambient-subagent-result-artifact-v1",
          runId: child.id,
          status: "completed",
          partial: false,
          summary: "Late child result is valid but the barrier has not been resolved.",
          childThreadId: child.childThreadId,
          structuredOutput: {
            schemaVersion: "ambient-subagent-structured-result-v1",
            roleId: "summarizer",
            status: "complete",
            summary: "Late child result is valid but the barrier has not been resolved.",
            evidence: ["child transcript"],
            artifacts: [],
            risks: [],
            nextActions: ["Resolve the barrier before parent synthesis."],
            roleOutput: {
              keyPoints: ["Late child result is valid."],
              sourceRefs: ["child transcript"],
            },
          },
        },
      });
      const barrier = store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        childRunIds: [child.id],
        dependencyMode: "required_all",
        failurePolicy: "ask_user",
      });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });

      const block = (runtime as any).subagentFinalizationBarrierBlock(parent.id, parentRun.id);

      expect(block).toBeUndefined();
      expect(store.getSubagentWaitBarrier(barrier.id)).toMatchObject({
        status: "satisfied",
        childRunIds: [child.id],
        resolutionArtifact: expect.objectContaining({
          schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
          synthesisAllowed: true,
          transitionEvidence: expect.objectContaining({
            kind: "child_terminal",
            source: "child_runtime",
            childRunId: child.id,
            reason: "finalization_reconciliation:completed",
          }),
          waitBarrierEvaluation: expect.objectContaining({
            synthesisAllowed: true,
            validSynthesisCount: 1,
          }),
        }),
      });
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("does not block parent finalization after an explicit partial barrier decision", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-partial-barrier-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const parent = store.createThread("partial barrier");
      const assistant = store.addMessage({
        threadId: parent.id,
        role: "assistant",
        content: "",
        metadata: { status: "streaming", runtime: "pi" },
      });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const featureFlags = resolveAmbientFeatureFlags({
        settings: store.getFeatureFlagSettings(),
        generatedAt: "2026-06-05T00:00:00.000Z",
      });
      const child = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Failed child with partial override",
        roleId: "reviewer",
        canonicalTaskPath: "root/0:reviewer",
        featureFlagSnapshot: featureFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });
      store.markSubagentRunStatus(child.id, "failed", {
        resultArtifact: {
          schemaVersion: "ambient-subagent-result-artifact-v1",
          runId: child.id,
          status: "failed",
          partial: false,
          summary: "child failed",
          childThreadId: child.childThreadId,
        },
      });
      const barrier = store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        childRunIds: [child.id],
        dependencyMode: "required_all",
        failurePolicy: "degrade_partial",
      });
      store.updateSubagentWaitBarrierStatus(barrier.id, "satisfied", {
        resolutionArtifact: {
          schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
          childRunIds: [child.id],
          childStatuses: [{ childRunId: child.id, status: "failed" }],
          synthesisAllowed: true,
          explicitPartial: true,
          transitionEvidence: {
            schemaVersion: "ambient-subagent-wait-barrier-transition-evidence-v1",
            kind: "explicit_partial",
            source: "barrier_controller",
            childRunIds: [child.id],
            reason: "User approved a partial parent answer.",
            idempotencyKey: "barrier:partial",
          },
          resultArtifact: null,
          userDecision: {
            schemaVersion: "ambient-subagent-user-decision-v1",
            decision: "continue_with_partial",
            userDecision: "User approved a partial parent answer.",
            partialSummary: "Reviewer failed; parent answer must be partial.",
            decidedAt: "2026-06-05T00:00:10.000Z",
            toolCallId: "resolve-partial",
            idempotencyKey: "barrier:partial",
          },
        },
      });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });

      expect((runtime as any).subagentFinalizationBarrierBlock(parent.id, parentRun.id)).toBeUndefined();
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("does not block parent finalization for optional background wait barriers", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-optional-barrier-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const parent = store.createThread("optional background barrier");
      const assistant = store.addMessage({
        threadId: parent.id,
        role: "assistant",
        content: "",
        metadata: { status: "streaming", runtime: "pi" },
      });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const featureFlags = resolveAmbientFeatureFlags({
        settings: store.getFeatureFlagSettings(),
        generatedAt: "2026-06-05T00:00:00.000Z",
      });
      const child = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Optional child",
        roleId: "explorer",
        canonicalTaskPath: "root/0:explorer",
        featureFlagSnapshot: featureFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "optional_background",
      });
      store.markSubagentRunStatus(child.id, "running");
      store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        childRunIds: [child.id],
        dependencyMode: "optional_background",
        failurePolicy: "degrade_partial",
      });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });

      expect((runtime as any).subagentFinalizationBarrierBlock(parent.id, parentRun.id)).toBeUndefined();
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("keeps a completed post-tool assistant answer when cleanup aborts the Pi session", async () => {
    vi.useFakeTimers();
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-terminal-cleanup-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const thread = store.createThread("terminal cleanup");
      const threadSessionDir = join(workspace.sessionPath, thread.id);
      await mkdir(threadSessionDir, { recursive: true });
      const sessionFile = join(threadSessionDir, "session.jsonl");
      await writeFile(sessionFile, "", "utf8");
      const desktopEvents: any[] = [];
      const windowSend = vi.fn((_channel: string, event: any) => {
        desktopEvents.push(event);
      });
      const getWindow = () => ({
        isDestroyed: () => false,
        webContents: {
          isDestroyed: () => false,
          isCrashed: () => false,
          send: windowSend,
        },
      }) as any;

      const subscribers: Array<(event: any) => void> = [];
      let rejectPrompt: ((error: Error) => void) | undefined;
      const emit = (event: any) => {
        for (const subscriber of [...subscribers]) subscriber(event);
      };
      const session = {
        ...fakePiSession(sessionFile),
        isStreaming: true,
        subscribe: vi.fn((subscriber: (event: any) => void) => {
          subscribers.push(subscriber);
          return () => {
            const index = subscribers.indexOf(subscriber);
            if (index >= 0) subscribers.splice(index, 1);
          };
        }),
        prompt: vi.fn(() => new Promise<never>((_resolve, reject) => {
          rejectPrompt = reject;
          setTimeout(() => {
            emit({
              type: "tool_execution_start",
              toolCallId: "call-provider-status",
              toolName: "ambient_search_preference_status",
              args: {},
            });
            emit({
              type: "tool_execution_end",
              toolCallId: "call-provider-status",
              toolName: "ambient_search_preference_status",
              result: [{ type: "text", text: "No installed Ambient CLI search providers found." }],
            });
            emit({
              type: "message_end",
              message: {
                role: "assistant",
                stopReason: "stop",
                content: [{ type: "text", text: "Brave Search is available. Enter BRAVE_API_KEY through the secure Desktop dialog to continue." }],
              },
            });
          }, 0);
        })),
        steer: vi.fn(async () => undefined),
        compact: vi.fn(async () => undefined),
        agent: {
          abort: vi.fn(() => {
            emit({
              type: "message_end",
              message: {
                role: "assistant",
                stopReason: "aborted",
                errorMessage: "Request was aborted.",
                content: [{ type: "text", text: "" }],
              },
            });
            rejectPrompt?.(new Error("Request was aborted."));
          }),
          waitForIdle: vi.fn(async () => undefined),
        },
      };
      const runtime = new AgentRuntime(store, {} as any, {} as any, getWindow, {
        request: vi.fn(),
        denyThread: () => undefined,
      });
      vi.spyOn(runtime as any, "getSession").mockResolvedValue(session);

      const sendPromise = runtime.send({
        threadId: thread.id,
        content: "Can we add Brave Search as a provider?",
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: "ambient-preview",
        thinkingLevel: "medium",
        delivery: "prompt",
        context: [],
      });

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(15_000);
      await sendPromise;

      const messages = store.listMessages(thread.id);
      const finalAssistant = messages.filter((message) => message.role === "assistant").at(-1);
      expect(finalAssistant).toMatchObject({
        content: "Brave Search is available. Enter BRAVE_API_KEY through the secure Desktop dialog to continue.",
        metadata: expect.objectContaining({
          status: "done",
          runtime: "pi",
          provider: "ambient",
          piTerminalCleanup: expect.objectContaining({
            reason: "assistant-terminal-before-prompt-resolved",
            cleanupAction: "abort-and-dispose-session",
            sessionFile,
            lastAssistantTerminalEvent: expect.objectContaining({
              eventType: "message_end",
              stopReason: "stop",
              contentBlockCount: 1,
              finalTextChars: "Brave Search is available. Enter BRAVE_API_KEY through the secure Desktop dialog to continue.".length,
            }),
          }),
        }),
      });
      const cleanupActivity = desktopEvents.find((event) =>
        event.type === "runtime-activity" &&
        event.activity?.kind === "stream" &&
        event.activity?.diagnostic?.reason === "assistant-terminal-before-prompt-resolved");
      expect(cleanupActivity?.activity.diagnostic).toMatchObject({
        cleanupAction: "abort-and-dispose-session",
        sessionFile,
        outputChars: "Brave Search is available. Enter BRAVE_API_KEY through the secure Desktop dialog to continue.".length,
        receivedAnyText: true,
        lastAssistantTerminalEvent: expect.objectContaining({
          eventType: "message_end",
          stopReason: "stop",
          contentBlockCount: 1,
        }),
      });
      expect(messages.map((message) => message.content).join("\n")).not.toContain("Request was aborted");
      expect(store.listActiveRuns()).toEqual([]);
      expect(session.agent.abort).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("resets terminal cleanup while Pi activity continues after assistant terminal output", async () => {
    vi.useFakeTimers();
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-terminal-cleanup-activity-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const thread = store.createThread("terminal cleanup activity");
      const threadSessionDir = join(workspace.sessionPath, thread.id);
      await mkdir(threadSessionDir, { recursive: true });
      const sessionFile = join(threadSessionDir, "session.jsonl");
      await writeFile(sessionFile, "", "utf8");

      const subscribers: Array<(event: any) => void> = [];
      let rejectPrompt: ((error: Error) => void) | undefined;
      const emit = (event: any) => {
        for (const subscriber of [...subscribers]) subscriber(event);
      };
      const session = {
        ...fakePiSession(sessionFile),
        isStreaming: true,
        subscribe: vi.fn((subscriber: (event: any) => void) => {
          subscribers.push(subscriber);
          return () => {
            const index = subscribers.indexOf(subscriber);
            if (index >= 0) subscribers.splice(index, 1);
          };
        }),
        prompt: vi.fn(() => new Promise<never>((_resolve, reject) => {
          rejectPrompt = reject;
          setTimeout(() => {
            emit({
              type: "message_end",
              message: {
                role: "assistant",
                stopReason: "stop",
                content: [{ type: "text", text: "I have a final answer, but Pi is still flushing terminal state." }],
              },
            });
          }, 0);
          setTimeout(() => {
            emit({ type: "auto_retry_start", attempt: 1, maxAttempts: 3, delayMs: 250, errorMessage: "provider retry heartbeat" });
          }, 14_000);
        })),
        steer: vi.fn(async () => undefined),
        compact: vi.fn(async () => undefined),
        agent: {
          abort: vi.fn(() => {
            emit({
              type: "message_end",
              message: {
                role: "assistant",
                stopReason: "aborted",
                errorMessage: "Request was aborted.",
                content: [],
              },
            });
            rejectPrompt?.(new Error("Request was aborted."));
          }),
          waitForIdle: vi.fn(async () => undefined),
        },
      };
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });
      vi.spyOn(runtime as any, "getSession").mockResolvedValue(session);

      const sendPromise = runtime.send({
        threadId: thread.id,
        content: "Can we add Brave Search as a provider?",
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: "ambient-preview",
        thinkingLevel: "medium",
        delivery: "prompt",
        context: [],
      });

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(14_000);
      expect(session.agent.abort).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(14_999);
      expect(session.agent.abort).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      await sendPromise;
      expect(session.agent.abort).toHaveBeenCalledTimes(1);

      const finalAssistant = store.listMessages(thread.id).filter((message) => message.role === "assistant").at(-1);
      expect(finalAssistant).toMatchObject({
        content: "I have a final answer, but Pi is still flushing terminal state.",
        metadata: expect.objectContaining({
          status: "done",
          piTerminalCleanup: expect.objectContaining({
            assistantTerminalGraceMs: 15_000,
            receivedAnyText: true,
          }),
        }),
      });
    } finally {
      vi.useRealTimers();
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("retries an empty post-tool assistant answer without dropping the restorable session file", async () => {
    vi.useFakeTimers();
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-empty-post-tool-retry-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const created = store.createThread("empty post-tool retry");
      const threadSessionDir = join(workspace.sessionPath, created.id);
      await mkdir(threadSessionDir, { recursive: true });
      const firstSessionFile = join(threadSessionDir, "first.jsonl");
      const retrySessionFile = join(threadSessionDir, "retry.jsonl");
      await writeFile(firstSessionFile, "", "utf8");
      const thread = store.updateThreadSettings(created.id, { piSessionFile: firstSessionFile });
      const initialText = "I'll check the provider catalog and current search setup.";
      const retryText = "Brave Search is available, but setup needs a BRAVE_API_KEY captured through Ambient-managed secrets.";

      const firstSubscribers: Array<(event: any) => void> = [];
      let rejectPrompt: ((error: Error) => void) | undefined;
      const emitFirst = (event: any) => {
        for (const subscriber of [...firstSubscribers]) subscriber(event);
      };
      const firstSession = {
        ...fakePiSession(firstSessionFile),
        isStreaming: true,
        subscribe: vi.fn((subscriber: (event: any) => void) => {
          firstSubscribers.push(subscriber);
          return () => {
            const index = firstSubscribers.indexOf(subscriber);
            if (index >= 0) firstSubscribers.splice(index, 1);
          };
        }),
        prompt: vi.fn(() => new Promise<never>((_resolve, reject) => {
          rejectPrompt = reject;
          setTimeout(() => {
            emitFirst({ type: "message_start", message: { role: "assistant" } });
            emitFirst({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: initialText } });
            emitFirst({
              type: "message_end",
              message: {
                role: "assistant",
                stopReason: "toolUse",
                content: [
                  { type: "text", text: initialText },
                  { type: "toolCall", id: "call-provider-catalog", name: "ambient_provider_catalog", arguments: {} },
                ],
              },
            });
            emitFirst({
              type: "tool_execution_start",
              toolCallId: "call-provider-catalog",
              toolName: "ambient_provider_catalog",
              args: {},
            });
            emitFirst({
              type: "tool_execution_end",
              toolCallId: "call-provider-catalog",
              toolName: "ambient_provider_catalog",
              result: [{ type: "text", text: "Brave Search API (search.brave)" }],
            });
            emitFirst({ type: "message_start", message: { role: "assistant" } });
            emitFirst({
              type: "message_end",
              message: {
                role: "assistant",
                stopReason: "stop",
                content: [],
              },
            });
          }, 0);
        })),
        steer: vi.fn(async () => undefined),
        compact: vi.fn(async () => undefined),
        agent: {
          abort: vi.fn(() => {
            emitFirst({
              type: "message_end",
              message: {
                role: "assistant",
                stopReason: "aborted",
                errorMessage: "Request was aborted.",
                content: [],
              },
            });
            rejectPrompt?.(new Error("Request was aborted."));
          }),
          waitForIdle: vi.fn(async () => undefined),
        },
      };

      const retrySubscribers: Array<(event: any) => void> = [];
      const emitRetry = (event: any) => {
        for (const subscriber of [...retrySubscribers]) subscriber(event);
      };
      const retrySession = {
        ...fakePiSession(retrySessionFile),
        isStreaming: true,
        subscribe: vi.fn((subscriber: (event: any) => void) => {
          retrySubscribers.push(subscriber);
          return () => {
            const index = retrySubscribers.indexOf(subscriber);
            if (index >= 0) retrySubscribers.splice(index, 1);
          };
        }),
        prompt: vi.fn(() => new Promise<void>((resolve) => {
          setTimeout(() => {
            emitRetry({ type: "message_start", message: { role: "assistant" } });
            emitRetry({
              type: "message_end",
              message: {
                role: "assistant",
                stopReason: "stop",
                content: [{ type: "text", text: retryText }],
              },
            });
            resolve();
          }, 0);
        })),
        steer: vi.fn(async () => undefined),
        compact: vi.fn(async () => undefined),
        agent: {
          abort: vi.fn(),
          waitForIdle: vi.fn(async () => undefined),
        },
      };

      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });
      const getSession = vi.spyOn(runtime as any, "getSession")
        .mockResolvedValueOnce(firstSession)
        .mockResolvedValueOnce(retrySession);

      const sendPromise = runtime.send({
        threadId: thread.id,
        content: "Can we add Brave Search as a provider?",
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: "ambient-preview",
        thinkingLevel: "medium",
        delivery: "prompt",
        context: [],
      });

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(15_000);
      await sendPromise;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await vi.advanceTimersByTimeAsync(1);
        if (store.listMessages(thread.id).some((message) => message.content.includes(retryText))) break;
      }

      const assistantMessages = store.listMessages(thread.id).filter((message) => message.role === "assistant");
      const retryNotice = assistantMessages.find((message) =>
        message.content.includes("Retrying assistant finalization attempt 1/10 after resetting the live session."),
      );
      expect(retryNotice).toMatchObject({
        metadata: expect.objectContaining({
          status: "done",
          retryingEmptyAssistantResponse: true,
          piTerminalCleanup: expect.objectContaining({
            reason: "assistant-terminal-before-prompt-resolved",
            cleanupAction: "abort-and-dispose-session",
            receivedAnyText: true,
            currentAssistantReceivedText: false,
            currentAssistantFinalTextChars: 0,
          }),
          piEmptyAssistantResponse: expect.objectContaining({
            retryScheduled: true,
            retryUsesFreshSession: false,
            retryAttempt: 1,
            maxRetries: 10,
            retryReason: "empty_assistant_response",
            retryDelayMs: 0,
            receivedAnyText: true,
            currentAssistantFinalTextChars: 0,
            sessionFile: firstSessionFile,
            lastAssistantTerminalEvent: expect.objectContaining({
              eventType: "message_end",
              stopReason: "stop",
              contentBlockCount: 0,
              finalTextChars: 0,
            }),
          }),
        }),
      });
      expect(assistantMessages.at(-1)).toMatchObject({
        content: retryText,
        metadata: expect.objectContaining({ status: "done" }),
      });
      expect(getSession).toHaveBeenCalledTimes(2);
      const retryThreadArg = getSession.mock.calls[1]?.[0] as { piSessionFile?: string | null };
      expect(retryThreadArg.piSessionFile).toBe(firstSessionFile);
      expect(firstSession.dispose).toHaveBeenCalled();
      expect(firstSession.agent.abort).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("asks Pi to continue when a prompt resolves after a tool result without post-tool text", async () => {
    vi.useFakeTimers();
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-resolved-post-tool-continuation-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const created = store.createThread("resolved post-tool continuation");
      const threadSessionDir = join(workspace.sessionPath, created.id);
      await mkdir(threadSessionDir, { recursive: true });
      const sessionFile = join(threadSessionDir, "session.jsonl");
      await writeFile(sessionFile, "", "utf8");
      const thread = store.updateThreadSettings(created.id, { piSessionFile: sessionFile });
      const preToolText = "The provider catalog should be checked first.";
      const finalText = "Brave Search is available after the provider catalog check.";
      const subscribers: Array<(event: any) => void> = [];
      const emit = (event: any) => {
        for (const subscriber of [...subscribers]) subscriber(event);
      };
      const session = {
        ...fakePiSession(sessionFile),
        isStreaming: true,
        subscribe: vi.fn((subscriber: (event: any) => void) => {
          subscribers.push(subscriber);
          return () => {
            const index = subscribers.indexOf(subscriber);
            if (index >= 0) subscribers.splice(index, 1);
          };
        }),
        prompt: vi.fn(() => new Promise<void>((resolve) => {
          setTimeout(() => {
            emit({ type: "message_start", message: { role: "assistant" } });
            emit({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: preToolText } });
            emit({
              type: "message_end",
              message: {
                role: "assistant",
                stopReason: "toolUse",
                content: [
                  { type: "text", text: preToolText },
                  { type: "toolCall", id: "call-provider-catalog", name: "ambient_provider_catalog", arguments: {} },
                ],
              },
            });
            emit({
              type: "tool_execution_start",
              toolCallId: "call-provider-catalog",
              toolName: "ambient_provider_catalog",
              args: {},
            });
            emit({
              type: "tool_execution_end",
              toolCallId: "call-provider-catalog",
              toolName: "ambient_provider_catalog",
              result: [{ type: "text", text: "Brave Search API (search.brave)" }],
            });
            resolve();
          }, 0);
        })),
        steer: vi.fn(() => new Promise<void>((resolve) => {
          setTimeout(() => {
            emit({ type: "message_start", message: { role: "assistant" } });
            emit({
              type: "message_end",
              message: {
                role: "assistant",
                stopReason: "stop",
                content: [{ type: "text", text: finalText }],
              },
            });
            resolve();
          }, 0);
        })),
        compact: vi.fn(async () => undefined),
        agent: {
          abort: vi.fn(),
          waitForIdle: vi.fn(async () => undefined),
        },
      };
      const runtimeEvents: any[] = [];
      const windowSend = vi.fn((_channel: string, event: any) => {
        runtimeEvents.push(event);
      });
      const getWindow = () => ({
        isDestroyed: () => false,
        webContents: {
          isDestroyed: () => false,
          isCrashed: () => false,
          send: windowSend,
        },
      }) as any;
      const runtime = new AgentRuntime(store, {} as any, {} as any, getWindow, {
        request: vi.fn(),
        denyThread: () => undefined,
      });
      const getSession = vi.spyOn(runtime as any, "getSession").mockResolvedValue(session);

      const sendPromise = runtime.send({
        threadId: thread.id,
        content: "Can we add Brave Search as a provider?",
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: "ambient-preview",
        thinkingLevel: "medium",
        delivery: "prompt",
        context: [],
      });

      await vi.advanceTimersByTimeAsync(0);
      for (let attempt = 0; attempt < 16; attempt += 1) {
        await vi.advanceTimersByTimeAsync(1);
        if (store.listMessages(thread.id).some((message) => message.content.includes(finalText))) break;
      }
      await sendPromise;

      expect(getSession).toHaveBeenCalledTimes(1);
      expect(session.steer).toHaveBeenCalledTimes(1);
      expect(session.agent.abort).not.toHaveBeenCalled();
      const finalAssistant = store.listMessages(thread.id).filter((message) => message.role === "assistant").at(-1);
      expect(finalAssistant).toMatchObject({
        content: finalText,
        metadata: expect.objectContaining({ status: "done" }),
      });
      expect(runtimeEvents).toContainEqual(expect.objectContaining({
        type: "runtime-activity",
        activity: expect.objectContaining({
          kind: "stream",
          status: "running",
          message: expect.stringContaining("after the prompt resolved without a final answer"),
        }),
      }));
    } finally {
      vi.useRealTimers();
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("clears a transient assistant runtime error once Pi auto-retry recovers", async () => {
    vi.useFakeTimers();
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-pi-auto-retry-recovery-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const created = store.createThread("auto retry recovery");
      const threadSessionDir = join(workspace.sessionPath, created.id);
      await mkdir(threadSessionDir, { recursive: true });
      const sessionFile = join(threadSessionDir, "session.jsonl");
      await writeFile(sessionFile, "", "utf8");
      const thread = store.updateThreadSettings(created.id, { piSessionFile: sessionFile });
      const finalText = "Brave Search install finished after the provider retry recovered.";
      const subscribers: Array<(event: any) => void> = [];
      const emit = (event: any) => {
        for (const subscriber of [...subscribers]) subscriber(event);
      };
      const session = {
        ...fakePiSession(sessionFile),
        isStreaming: true,
        subscribe: vi.fn((subscriber: (event: any) => void) => {
          subscribers.push(subscriber);
          return () => {
            const index = subscribers.indexOf(subscriber);
            if (index >= 0) subscribers.splice(index, 1);
          };
        }),
        prompt: vi.fn(() => new Promise<void>((resolve) => {
          setTimeout(() => {
            emit({ type: "message_start", message: { role: "assistant" } });
            emit({
              type: "message_end",
              message: {
                role: "assistant",
                stopReason: "error",
                errorMessage: "429 Upstream request failed",
                content: [],
              },
            });
            emit({
              type: "agent_end",
              messages: [
                {
                  role: "assistant",
                  stopReason: "error",
                  errorMessage: "429 Upstream request failed",
                  content: [],
                },
              ],
            });
            emit({ type: "auto_retry_start", attempt: 1, maxAttempts: 10, delayMs: 1000, errorMessage: "429 Upstream request failed" });
            emit({ type: "auto_retry_end", success: true, attempt: 1 });
            emit({ type: "message_start", message: { role: "assistant" } });
            emit({
              type: "message_end",
              message: {
                role: "assistant",
                stopReason: "stop",
                content: [{ type: "text", text: finalText }],
              },
            });
            resolve();
          }, 0);
        })),
        steer: vi.fn(async () => undefined),
        compact: vi.fn(async () => undefined),
        agent: {
          abort: vi.fn(),
          waitForIdle: vi.fn(async () => undefined),
        },
      };
      const runtimeEvents: any[] = [];
      const windowSend = vi.fn((_channel: string, event: any) => {
        runtimeEvents.push(event);
      });
      const getWindow = () => ({
        isDestroyed: () => false,
        webContents: {
          isDestroyed: () => false,
          isCrashed: () => false,
          send: windowSend,
        },
      }) as any;
      const runtime = new AgentRuntime(store, {} as any, {} as any, getWindow, {
        request: vi.fn(),
        denyThread: () => undefined,
      });
      vi.spyOn(runtime as any, "getSession").mockResolvedValue(session);

      const sendPromise = runtime.send({
        threadId: thread.id,
        content: "Install Brave Search",
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: "ambient-preview",
        thinkingLevel: "medium",
        delivery: "prompt",
        context: [],
      });

      await vi.advanceTimersByTimeAsync(0);
      await sendPromise;

      const finalAssistant = store.listMessages(thread.id).filter((message) => message.role === "assistant").at(-1);
      expect(finalAssistant).toMatchObject({
        content: finalText,
        metadata: expect.objectContaining({
          status: "done",
          piProviderRetry: expect.objectContaining({
            beforeVisibleOutput: true,
            recovered: true,
            attemptCount: 1,
            lastError: "429 Upstream request failed",
          }),
        }),
      });
      expect(runtimeEvents).toContainEqual(expect.objectContaining({
        type: "runtime-activity",
        activity: expect.objectContaining({ kind: "retry", status: "starting", message: "429 Upstream request failed" }),
      }));
      expect(runtimeEvents).not.toContainEqual(expect.objectContaining({
        type: "error",
        message: "429 Upstream request failed",
      }));
      expect(store.listActiveRuns()).toEqual([]);
    } finally {
      vi.useRealTimers();
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("retries empty assistant responses across the aggressive finalization budget with fresh Pi sessions", async () => {
    vi.useFakeTimers();
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-empty-retry-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const created = store.createThread("empty retry");
      const thread = store.updateThreadTitle(created.id, "Empty retry");
      const threadSessionDir = join(workspace.sessionPath, thread.id);
      await mkdir(threadSessionDir, { recursive: true });

      const makeSession = (name: string, finalText: string) => {
        const sessionFile = join(threadSessionDir, `${name}.jsonl`);
        const subscribers: Array<(event: any) => void> = [];
        const emit = (event: any) => {
          for (const subscriber of [...subscribers]) subscriber(event);
        };
        const session = {
          ...fakePiSession(sessionFile),
          isStreaming: true,
          subscribe: vi.fn((subscriber: (event: any) => void) => {
            subscribers.push(subscriber);
            return () => {
              const index = subscribers.indexOf(subscriber);
              if (index >= 0) subscribers.splice(index, 1);
            };
          }),
          prompt: vi.fn(() => new Promise<void>((resolve) => {
            setTimeout(() => {
              emit({
                type: "message_end",
                message: {
                  role: "assistant",
                  stopReason: "stop",
                  content: finalText ? [{ type: "text", text: finalText }] : [],
                },
              });
              resolve();
            }, 0);
          })),
          steer: vi.fn(async () => undefined),
          compact: vi.fn(async () => undefined),
          agent: {
            abort: vi.fn(),
            waitForIdle: vi.fn(async () => undefined),
          },
        };
        return session;
      };
      const firstSession = makeSession("empty", "");
      const secondEmptySession = makeSession("empty-2", "");
      const retrySession = makeSession("retry", "Get a Brave Search API key at https://brave.com/search/api/.");
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });
      const getSession = vi.spyOn(runtime as any, "getSession")
        .mockResolvedValueOnce(firstSession)
        .mockResolvedValueOnce(secondEmptySession)
        .mockResolvedValueOnce(retrySession);

      const sendPromise = runtime.send({
        threadId: thread.id,
        content: "Where can I get a Brave Search API key?",
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: "ambient-preview",
        thinkingLevel: "medium",
        delivery: "prompt",
        context: [],
      });

      await vi.advanceTimersByTimeAsync(0);
      await sendPromise;
      for (let attempt = 0; attempt < 16; attempt += 1) {
        await vi.advanceTimersByTimeAsync(1);
        if (store.listMessages(thread.id).some((message) => message.content.includes("Get a Brave Search API key"))) break;
      }

      const assistantMessages = store.listMessages(thread.id).filter((message) => message.role === "assistant");
      expect(assistantMessages[0]).toMatchObject({
        content: "Ambient/Pi returned no assistant text. Retrying assistant finalization attempt 1/10 with a fresh session.",
        metadata: expect.objectContaining({
          status: "done",
          retryingEmptyAssistantResponse: true,
          piEmptyAssistantResponse: expect.objectContaining({
            retryScheduled: true,
            retryUsesFreshSession: true,
            retryAttempt: 1,
            maxRetries: 10,
            retryReason: "empty_assistant_response",
            retryDelayMs: 0,
            receivedAnyText: false,
            currentAssistantFinalTextChars: 0,
            sessionFile: join(threadSessionDir, "empty.jsonl"),
            lastAssistantTerminalEvent: expect.objectContaining({
              eventType: "message_end",
              stopReason: "stop",
              contentBlockCount: 0,
              finalTextChars: 0,
            }),
          }),
        }),
      });
      expect(assistantMessages[1]).toMatchObject({
        content: "Ambient/Pi returned no assistant text. Retrying assistant finalization attempt 2/10 with a fresh session.",
        metadata: expect.objectContaining({
          status: "done",
          retryingEmptyAssistantResponse: true,
          piEmptyAssistantResponse: expect.objectContaining({
            retryScheduled: true,
            retryUsesFreshSession: true,
            retryAttempt: 2,
            maxRetries: 10,
            retryReason: "empty_assistant_response",
            retryDelayMs: 0,
            receivedAnyText: false,
            currentAssistantFinalTextChars: 0,
            sessionFile: join(threadSessionDir, "empty-2.jsonl"),
          }),
        }),
      });
      expect(assistantMessages.at(-1)).toMatchObject({
        content: "Get a Brave Search API key at https://brave.com/search/api/.",
        metadata: expect.objectContaining({ status: "done" }),
      });
      expect(getSession).toHaveBeenCalledTimes(3);
      expect(firstSession.dispose).toHaveBeenCalled();
      expect(secondEmptySession.dispose).toHaveBeenCalled();
      expect(retrySession.prompt).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("can await internal empty-assistant retries before resolving send", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-internal-empty-retry-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const created = store.createThread("internal empty retry");
      const threadSessionDir = join(workspace.sessionPath, created.id);
      await mkdir(threadSessionDir, { recursive: true });

      const makeSession = (name: string, finalText: string) => {
        const sessionFile = join(threadSessionDir, `${name}.jsonl`);
        const subscribers: Array<(event: any) => void> = [];
        const emit = (event: any) => {
          for (const subscriber of [...subscribers]) subscriber(event);
        };
        return {
          ...fakePiSession(sessionFile),
          isStreaming: true,
          subscribe: vi.fn((subscriber: (event: any) => void) => {
            subscribers.push(subscriber);
            return () => {
              const index = subscribers.indexOf(subscriber);
              if (index >= 0) subscribers.splice(index, 1);
            };
          }),
          prompt: vi.fn(() => new Promise<void>((resolve) => {
            setTimeout(() => {
              emit({
                type: "message_end",
                message: {
                  role: "assistant",
                  stopReason: "stop",
                  content: finalText ? [{ type: "text", text: finalText }] : [],
                },
              });
              resolve();
            }, 0);
          })),
          steer: vi.fn(async () => undefined),
          compact: vi.fn(async () => undefined),
          agent: {
            abort: vi.fn(),
            waitForIdle: vi.fn(async () => undefined),
          },
        };
      };
      const firstSession = makeSession("empty", "");
      const retrySession = makeSession("retry", "Recovered child result.");
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });
      const getSession = vi.spyOn(runtime as any, "getSession")
        .mockResolvedValueOnce(firstSession)
        .mockResolvedValueOnce(retrySession);

      const sendPromise = runtime.send({
        threadId: created.id,
        content: "Return the child result.",
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: "ambient-preview",
        thinkingLevel: "minimal",
        delivery: "prompt",
        context: [],
      }, { awaitInternalRetryCompletion: true });

      await sendPromise;

      const assistantMessages = store.listMessages(created.id).filter((message) => message.role === "assistant");
      expect(assistantMessages.map((message) => message.content)).toEqual([
        "Ambient/Pi returned no assistant text. Retrying assistant finalization attempt 1/10 with a fresh session.",
        "Recovered child result.",
      ]);
      expect(getSession).toHaveBeenCalledTimes(2);
      expect(firstSession.dispose).toHaveBeenCalled();
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("retries a pre-output assistant-start stream stall with a fresh Pi session", async () => {
    vi.useFakeTimers();
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-empty-start-stall-retry-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const created = store.createThread("empty assistant start retry");
      const threadSessionDir = join(workspace.sessionPath, created.id);
      await mkdir(threadSessionDir, { recursive: true });
      const firstSessionFile = join(threadSessionDir, "stalled.jsonl");
      const retrySessionFile = join(threadSessionDir, "retry.jsonl");
      await writeFile(firstSessionFile, "", "utf8");
      await writeFile(retrySessionFile, "", "utf8");
      const thread = store.updateThreadSettings(created.id, { piSessionFile: firstSessionFile });
      const retryText = "Brave Search is available; enter BRAVE_API_KEY through Ambient-managed secrets to continue.";

      const firstSubscribers: Array<(event: any) => void> = [];
      let rejectPrompt: ((error: Error) => void) | undefined;
      const emitFirst = (event: any) => {
        for (const subscriber of [...firstSubscribers]) subscriber(event);
      };
      const firstSession = {
        ...fakePiSession(firstSessionFile),
        isStreaming: true,
        subscribe: vi.fn((subscriber: (event: any) => void) => {
          firstSubscribers.push(subscriber);
          return () => {
            const index = firstSubscribers.indexOf(subscriber);
            if (index >= 0) firstSubscribers.splice(index, 1);
          };
        }),
        prompt: vi.fn(() => new Promise<never>((_resolve, reject) => {
          rejectPrompt = reject;
          setTimeout(() => {
            emitFirst({ type: "message_start", message: { role: "assistant" } });
          }, 0);
        })),
        steer: vi.fn(async () => undefined),
        compact: vi.fn(async () => undefined),
        agent: {
          abort: vi.fn(() => {
            emitFirst({
              type: "message_end",
              message: {
                role: "assistant",
                stopReason: "aborted",
                errorMessage: "Request was aborted.",
                content: [{ type: "text", text: "" }],
              },
            });
            rejectPrompt?.(new Error("Request was aborted."));
          }),
          waitForIdle: vi.fn(async () => undefined),
        },
      };

      const retrySubscribers: Array<(event: any) => void> = [];
      const emitRetry = (event: any) => {
        for (const subscriber of [...retrySubscribers]) subscriber(event);
      };
      const retrySession = {
        ...fakePiSession(retrySessionFile),
        isStreaming: true,
        subscribe: vi.fn((subscriber: (event: any) => void) => {
          retrySubscribers.push(subscriber);
          return () => {
            const index = retrySubscribers.indexOf(subscriber);
            if (index >= 0) retrySubscribers.splice(index, 1);
          };
        }),
        prompt: vi.fn(() => new Promise<void>((resolve) => {
          setTimeout(() => {
            emitRetry({ type: "message_start", message: { role: "assistant" } });
            emitRetry({
              type: "message_end",
              message: {
                role: "assistant",
                stopReason: "stop",
                content: [{ type: "text", text: retryText }],
              },
            });
            resolve();
          }, 0);
        })),
        steer: vi.fn(async () => undefined),
        compact: vi.fn(async () => undefined),
        agent: {
          abort: vi.fn(),
          waitForIdle: vi.fn(async () => undefined),
        },
      };

      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });
      const getSession = vi.spyOn(runtime as any, "getSession")
        .mockResolvedValueOnce(firstSession)
        .mockResolvedValueOnce(retrySession);

      const sendPromise = runtime.send({
        threadId: thread.id,
        content: "Can we add Brave Search as a provider?",
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: "ambient-preview",
        thinkingLevel: "medium",
        delivery: "prompt",
        context: [],
      });

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(30_000);
      await sendPromise;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await vi.advanceTimersByTimeAsync(1);
        if (store.listMessages(thread.id).some((message) => message.content.includes(retryText))) break;
      }

      const assistantMessages = store.listMessages(thread.id).filter((message) => message.role === "assistant");
      expect(assistantMessages[0]).toMatchObject({
        content: "Ambient/Pi stream stalled before assistant output. Retrying assistant finalization attempt 1/10 with a fresh session.",
        metadata: expect.objectContaining({
          status: "done",
          retryingStreamStall: true,
          piStreamTimeout: expect.objectContaining({
            retryScheduled: true,
            retryUsesFreshSession: true,
            retryAttempt: 1,
            maxRetries: 10,
            retryReason: "pre_output_stream_stall",
            retryDelayMs: 0,
            message: "Ambient/Pi stream stalled after 30000ms without stream activity.",
            receivedAnyText: false,
            toolMessageCount: 0,
            currentAssistantFinalTextChars: 0,
            sessionFile: firstSessionFile,
          }),
        }),
      });
      expect(assistantMessages.at(-1)).toMatchObject({
        content: retryText,
        metadata: expect.objectContaining({ status: "done" }),
      });
      expect(getSession).toHaveBeenCalledTimes(2);
      expect(firstSession.agent.abort).toHaveBeenCalledTimes(1);
      expect(firstSession.dispose).toHaveBeenCalled();
      expect(store.getThread(thread.id).piSessionFile).toBe(retrySessionFile);
    } finally {
      vi.useRealTimers();
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("surfaces post-output stream stalls without replaying or overwriting partial assistant text", async () => {
    vi.useFakeTimers();
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-post-output-stall-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const created = store.createThread("post-output stream stall");
      const threadSessionDir = join(workspace.sessionPath, created.id);
      await mkdir(threadSessionDir, { recursive: true });
      const sessionFile = join(threadSessionDir, "session.jsonl");
      await writeFile(sessionFile, "", "utf8");
      const thread = store.updateThreadSettings(created.id, { piSessionFile: sessionFile });
      const partialText = "I found the provider path and will update the settings";

      const subscribers: Array<(event: any) => void> = [];
      let rejectPrompt: ((error: Error) => void) | undefined;
      const emit = (event: any) => {
        for (const subscriber of [...subscribers]) subscriber(event);
      };
      const session = {
        ...fakePiSession(sessionFile),
        isStreaming: true,
        subscribe: vi.fn((subscriber: (event: any) => void) => {
          subscribers.push(subscriber);
          return () => {
            const index = subscribers.indexOf(subscriber);
            if (index >= 0) subscribers.splice(index, 1);
          };
        }),
        prompt: vi.fn(() => new Promise<never>((_resolve, reject) => {
          rejectPrompt = reject;
          setTimeout(() => {
            emit({ type: "message_start", message: { role: "assistant" } });
            emit({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: partialText } });
          }, 0);
        })),
        steer: vi.fn(async () => undefined),
        compact: vi.fn(async () => undefined),
        agent: {
          abort: vi.fn(() => {
            emit({
              type: "message_end",
              message: {
                role: "assistant",
                stopReason: "aborted",
                errorMessage: "Request was aborted.",
                content: [{ type: "text", text: "" }],
              },
            });
            rejectPrompt?.(new Error("Request was aborted."));
          }),
          waitForIdle: vi.fn(async () => undefined),
        },
      };

      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });
      const getSession = vi.spyOn(runtime as any, "getSession").mockResolvedValue(session);

      const sendPromise = runtime.send({
        threadId: thread.id,
        content: "Can we add Brave Search as a provider?",
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: "ambient-preview",
        thinkingLevel: "medium",
        delivery: "prompt",
        context: [],
      });

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(30_000);
      await sendPromise;

      const assistantMessages = store.listMessages(thread.id).filter((message) => message.role === "assistant");
      expect(assistantMessages).toHaveLength(1);
      expect(assistantMessages[0].content).toContain(partialText);
      expect(assistantMessages[0].content).toContain(
        "Ambient/Pi provider stream was interrupted. Ambient is starting a continuation turn from the durable recovery state instead of stopping the task.",
      );
      expect(assistantMessages[0].content).toContain("Ambient/Pi stream stalled after 30000ms without stream activity.");
      expect(assistantMessages[0].content).not.toContain("Retrying assistant finalization");
      expect(assistantMessages[0]).toMatchObject({
        metadata: expect.objectContaining({
          status: "done",
          runtime: "pi",
          provider: "ambient",
          providerInterruptionContinuation: true,
          piStreamInterruption: expect.objectContaining({
            kind: "stream_idle_timeout",
            message: "Ambient/Pi stream stalled after 30000ms without stream activity.",
            retryScheduled: true,
            replaySafe: false,
            continuationSafe: true,
            retryReason: "provider_interruption_continuation",
            semanticOutputSeen: true,
            toolCallSeen: false,
            assistantOutputChars: partialText.length,
            thinkingOutputChars: 0,
            toolMessageCount: 0,
            currentAssistantFinalTextChars: partialText.length,
            sessionFile,
          }),
        }),
      });
      expect(getSession).toHaveBeenCalledTimes(1);
      expect(session.prompt).toHaveBeenCalledTimes(1);
      expect(session.agent.abort).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("settles post-output stream stalls when provider continuation setup fails", async () => {
    vi.useFakeTimers();
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-continuation-setup-fails-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const thread = store.createThread("post-output continuation setup failure");
      const threadSessionDir = join(workspace.sessionPath, thread.id);
      await mkdir(threadSessionDir, { recursive: true });
      const sessionFile = join(threadSessionDir, "session.jsonl");
      await writeFile(sessionFile, "", "utf8");
      const partialText = "I started writing the implementation and will continue from the transcript";

      const subscribers: Array<(event: any) => void> = [];
      let rejectPrompt: ((error: Error) => void) | undefined;
      const emit = (event: any) => {
        for (const subscriber of [...subscribers]) subscriber(event);
      };
      const session = {
        ...fakePiSession(sessionFile),
        isStreaming: true,
        subscribe: vi.fn((subscriber: (event: any) => void) => {
          subscribers.push(subscriber);
          return () => {
            const index = subscribers.indexOf(subscriber);
            if (index >= 0) subscribers.splice(index, 1);
          };
        }),
        prompt: vi.fn(() => new Promise<never>((_resolve, reject) => {
          rejectPrompt = reject;
          setTimeout(() => {
            emit({ type: "message_start", message: { role: "assistant" } });
            emit({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: partialText } });
          }, 0);
        })),
        steer: vi.fn(async () => undefined),
        compact: vi.fn(async () => undefined),
        agent: {
          abort: vi.fn(() => {
            emit({
              type: "message_end",
              message: {
                role: "assistant",
                stopReason: "aborted",
                errorMessage: "Request was aborted.",
                content: [{ type: "text", text: "" }],
              },
            });
            rejectPrompt?.(new Error("Request was aborted."));
          }),
          waitForIdle: vi.fn(async () => undefined),
        },
      };

      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });
      vi.spyOn(runtime as any, "getSession").mockResolvedValue(session);
      vi.spyOn(runtime as any, "commitThreadPiSessionFile").mockRejectedValue(new Error("session pointer write failed"));

      const sendPromise = runtime.send({
        threadId: thread.id,
        content: "Implement the approved plan.",
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: "ambient-preview",
        thinkingLevel: "medium",
        delivery: "prompt",
        context: [],
      });

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(30_000);
      await sendPromise;

      const assistantMessages = store.listMessages(thread.id).filter((message) => message.role === "assistant");
      expect(assistantMessages).toHaveLength(1);
      expect(assistantMessages[0].content).toContain(partialText);
      expect(assistantMessages[0].content).toContain("Ambient/Pi stream stalled after 30000ms without stream activity.");
      expect(assistantMessages[0].content).toContain("Ambient could not schedule the provider continuation: session pointer write failed");
      expect(assistantMessages[0]).toMatchObject({
        metadata: expect.objectContaining({
          status: "error",
          providerInterruptionContinuation: true,
          piStreamInterruption: expect.objectContaining({
            kind: "stream_idle_timeout",
            retryScheduled: false,
            continuationSafe: false,
            continuationSetupError: "session pointer write failed",
          }),
        }),
      });
      expect(store.listActiveRuns()).toEqual([]);
      expect(session.agent.abort).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("keeps provider stream idle recovery paused during tool activity and surfaces local tool stalls", async () => {
    vi.useFakeTimers();
    const originalToolIdleTimeout = process.env.AMBIENT_LOCAL_TOOL_IDLE_TIMEOUT_MS;
    process.env.AMBIENT_LOCAL_TOOL_IDLE_TIMEOUT_MS = "30000";
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-post-tool-stall-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const created = store.createThread("post-tool stream stall");
      const threadSessionDir = join(workspace.sessionPath, created.id);
      await mkdir(threadSessionDir, { recursive: true });
      const sessionFile = join(threadSessionDir, "session.jsonl");
      await writeFile(sessionFile, "", "utf8");
      const thread = store.updateThreadSettings(created.id, { piSessionFile: sessionFile });

      const subscribers: Array<(event: any) => void> = [];
      const runtimeEvents: any[] = [];
      let rejectPrompt: ((error: Error) => void) | undefined;
      const emit = (event: any) => {
        for (const subscriber of [...subscribers]) subscriber(event);
      };
      const session = {
        ...fakePiSession(sessionFile),
        isStreaming: true,
        subscribe: vi.fn((subscriber: (event: any) => void) => {
          subscribers.push(subscriber);
          return () => {
            const index = subscribers.indexOf(subscriber);
            if (index >= 0) subscribers.splice(index, 1);
          };
        }),
        prompt: vi.fn(() => new Promise<never>((_resolve, reject) => {
          rejectPrompt = reject;
          setTimeout(() => {
            emit({
              type: "tool_execution_start",
              toolCallId: "call-provider-status",
              toolName: "ambient_search_preference_status",
              args: {},
            });
          }, 0);
        })),
        steer: vi.fn(async () => undefined),
        compact: vi.fn(async () => undefined),
        agent: {
          abort: vi.fn(() => {
            rejectPrompt?.(new Error("Request was aborted."));
          }),
          waitForIdle: vi.fn(async () => undefined),
        },
      };

      const getWindow = () =>
        ({
          isDestroyed: () => false,
          webContents: {
            isDestroyed: () => false,
            isCrashed: () => false,
            send: (_channel: string, event: any) => runtimeEvents.push(event),
          },
        }) as any;
      const runtime = new AgentRuntime(store, {} as any, {} as any, getWindow, {
        request: vi.fn(),
        denyThread: () => undefined,
      });
      const getSession = vi.spyOn(runtime as any, "getSession").mockResolvedValue(session);

      const sendPromise = runtime.send({
        threadId: thread.id,
        content: "Check the provider status.",
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: "ambient-preview",
        thinkingLevel: "medium",
        delivery: "prompt",
        context: [],
      });

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(30_000);
      await sendPromise;

      const messages = store.listMessages(thread.id);
      const finalAssistant = messages.filter((message) => message.role === "assistant").at(-1);
      const toolMessage = messages.find((message) => message.role === "tool");
      const toolTimeout = runtimeEvents.find((event) =>
        event.type === "runtime-activity" &&
        event.activity.kind === "tool" &&
        event.activity.status === "timeout"
      );
      expect(toolMessage?.content).toContain("ambient_search_preference_status");
      expect(toolTimeout?.activity.message).toContain("Local tool ambient_search_preference_status stalled after 30000ms without progress.");
      expect(runtimeEvents).not.toContainEqual(expect.objectContaining({
        type: "runtime-activity",
        activity: expect.objectContaining({
          kind: "stream",
          status: "timeout",
          message: "Ambient/Pi stream stalled after 30000ms without stream activity.",
        }),
      }));
      expect(finalAssistant).toMatchObject({
        metadata: expect.objectContaining({
          status: "error",
          runtime: "pi",
          provider: "ambient",
        }),
      });
      expect(getSession).toHaveBeenCalledTimes(1);
      expect(session.prompt).toHaveBeenCalledTimes(1);
      expect(session.agent.abort).toHaveBeenCalledTimes(1);
    } finally {
      if (originalToolIdleTimeout === undefined) delete process.env.AMBIENT_LOCAL_TOOL_IDLE_TIMEOUT_MS;
      else process.env.AMBIENT_LOCAL_TOOL_IDLE_TIMEOUT_MS = originalToolIdleTimeout;
      vi.useRealTimers();
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("pauses Pi stream idle recovery while a Desktop permission prompt is waiting", async () => {
    vi.useFakeTimers();
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-permission-wait-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const created = store.createThread("permission wait");
      const threadSessionDir = join(workspace.sessionPath, created.id);
      await mkdir(threadSessionDir, { recursive: true });
      const sessionFile = join(threadSessionDir, "session.jsonl");
      await writeFile(sessionFile, "", "utf8");
      const thread = store.updateThreadSettings(created.id, { piSessionFile: sessionFile, permissionMode: "workspace" });

      const runtimeEvents: any[] = [];
      const subscribers: Array<(event: any) => void> = [];
      let resolvePermission!: (resolution: { allowed: boolean; mode: "allow_once" }) => void;
      const permissionPrompt = new Promise<{ allowed: boolean; mode: "allow_once" }>((resolve) => {
        resolvePermission = resolve;
      });
      const permissionRequester = vi.fn(async () => permissionPrompt);
      const emit = (event: any) => {
        for (const subscriber of [...subscribers]) subscriber(event);
      };
      let runtime!: AgentRuntime;
      const session = {
        ...fakePiSession(sessionFile),
        isStreaming: true,
        subscribe: vi.fn((subscriber: (event: any) => void) => {
          subscribers.push(subscriber);
          return () => {
            const index = subscribers.indexOf(subscriber);
            if (index >= 0) subscribers.splice(index, 1);
          };
        }),
        prompt: vi.fn(
          () =>
            new Promise<void>((resolve) => {
              setTimeout(async () => {
                emit({
                  type: "tool_execution_start",
                  toolCallId: "call-scrapling-fetch",
                  toolName: "ambient_mcp_tool_call",
                  args: { toolName: "fetch", arguments: { url: "https://monsoonpcs.com/store/" } },
                });
                const allowed = await (runtime as any).resolveFirstPartyPluginPermission({
                  thread: store.getThread(thread.id),
                  workspace,
                  toolName: "ambient_mcp_tool_call",
                  title: "Read https://monsoonpcs.com/store/ with Scrapling?",
                  message: "Ambient wants to call the configured MCP-backed page-read provider.",
                  detail: "Call Ambient MCP tool io.github.d4vinci/scrapling/fetch for https://monsoonpcs.com/store/.",
                  grantTargetLabel: "Call MCP tool io.github.d4vinci/scrapling/fetch",
                  grantTargetIdentity: "io.github.d4vinci/scrapling/fetch\0https://monsoonpcs.com/store/",
                  allowedReason: "MCP tool call approved by Ambient permission grant policy.",
                  deniedReason: "MCP tool call prompt denied or timed out.",
                });
                emit({
                  type: "tool_execution_end",
                  toolCallId: "call-scrapling-fetch",
                  toolName: "ambient_mcp_tool_call",
                  isError: !allowed,
                  result: [{ type: "text", text: allowed ? "Scrapling returned current store inventory." : "Permission denied." }],
                });
                emit({
                  type: "message_end",
                  message: {
                    role: "assistant",
                    stopReason: "stop",
                    content: [{ type: "text", text: "I checked the current store page after approval." }],
                  },
                });
                resolve();
              }, 0);
            }),
        ),
        steer: vi.fn(async () => undefined),
        compact: vi.fn(async () => undefined),
        agent: {
          abort: vi.fn(),
          waitForIdle: vi.fn(async () => undefined),
        },
      };

      runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        () =>
          ({
            isDestroyed: () => false,
            webContents: {
              isDestroyed: () => false,
              isCrashed: () => false,
              send: (_channel: string, event: any) => runtimeEvents.push(event),
            },
          }) as any,
        {
          request: permissionRequester,
          denyThread: () => undefined,
        },
      );
      vi.spyOn(runtime as any, "getSession").mockResolvedValue(session);

      const sendPromise = runtime.send({
        threadId: thread.id,
        content: "Check whether Monsoon PCs has the latest workstation card in stock.",
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: "ambient-preview",
        thinkingLevel: "medium",
        delivery: "prompt",
        context: [],
      });

      await vi.advanceTimersByTimeAsync(0);
      expect(permissionRequester).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(30_000);
      expect(session.agent.abort).not.toHaveBeenCalled();
      expect(store.listMessages(thread.id).map((message) => message.content).join("\n")).not.toContain("Ambient/Pi stream stalled");

      resolvePermission({ allowed: true, mode: "allow_once" });
      await vi.advanceTimersByTimeAsync(0);
      await sendPromise;

      const messages = store.listMessages(thread.id);
      const finalAssistant = messages.filter((message) => message.role === "assistant").at(-1);
      expect(finalAssistant?.content).toBe("I checked the current store page after approval.");
      expect(finalAssistant?.metadata?.providerInterruptionContinuation).not.toBe(true);
      expect(session.agent.abort).not.toHaveBeenCalled();
      expect(runtimeEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "runtime-activity",
          activity: expect.objectContaining({
            kind: "permission",
            status: "waiting",
            toolName: "ambient_mcp_tool_call",
          }),
        }),
        expect.objectContaining({
          type: "runtime-activity",
          activity: expect.objectContaining({
            kind: "permission",
            status: "finished",
            toolName: "ambient_mcp_tool_call",
            allowed: true,
            mode: "allow_once",
          }),
        }),
      ]));
    } finally {
      vi.useRealTimers();
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("saves a long interrupted write tool argument and schedules a continuation turn before execution", async () => {
    vi.useFakeTimers();
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-interrupted-tool-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const created = store.createThread("interrupted long write");
      const threadSessionDir = join(workspace.sessionPath, created.id);
      await mkdir(threadSessionDir, { recursive: true });
      const sessionFile = join(threadSessionDir, "session.jsonl");
      await writeFile(sessionFile, "", "utf8");
      const thread = store.updateThreadSettings(created.id, { piSessionFile: sessionFile });

      const subscribers: Array<(event: any) => void> = [];
      let rejectPrompt: ((error: Error) => void) | undefined;
      const emit = (event: any) => {
        for (const subscriber of [...subscribers]) subscriber(event);
      };
      const longContent = "section\n".repeat(2_500);
      const toolArguments = { path: "long-report.md", content: longContent };
      const session = {
        ...fakePiSession(sessionFile),
        isStreaming: true,
        subscribe: vi.fn((subscriber: (event: any) => void) => {
          subscribers.push(subscriber);
          return () => {
            const index = subscribers.indexOf(subscriber);
            if (index >= 0) subscribers.splice(index, 1);
          };
        }),
        prompt: vi.fn(() => new Promise<never>((_resolve, reject) => {
          rejectPrompt = reject;
          setTimeout(() => {
            emit({
              type: "message_update",
              assistantMessageEvent: {
                type: "toolcall_delta",
                toolCall: {
                  id: "call-long-write",
                  name: "write",
                  arguments: JSON.stringify(toolArguments),
                },
              },
            });
          }, 0);
        })),
        steer: vi.fn(async () => undefined),
        compact: vi.fn(async () => undefined),
        agent: {
          abort: vi.fn(() => {
            rejectPrompt?.(new Error("Request was aborted."));
          }),
          waitForIdle: vi.fn(async () => undefined),
        },
      };

      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });
      const getSession = vi.spyOn(runtime as any, "getSession").mockResolvedValue(session);

      const sendPromise = runtime.send({
        threadId: thread.id,
        content: "Write a long report.",
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: "ambient-preview",
        thinkingLevel: "medium",
        delivery: "prompt",
        context: [],
      });

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(30_000);
      await sendPromise;

      const messages = store.listMessages(thread.id);
      const finalAssistant = messages.filter((message) => message.role === "assistant").at(-1);
      const toolMessage = messages.find((message) => message.role === "tool");
      const recovery = (toolMessage?.metadata?.toolArgumentProgress as any)?.interruptedToolCallRecovery;
      expect(toolMessage?.content).toContain("write interrupted");
      expect(toolMessage?.metadata?.status).toBe("error");
      expect(recovery).toMatchObject({
        status: "recoverable",
        toolCallId: "call-long-write",
        toolName: "write",
        source: "raw_tool_input",
        parseStatus: "valid_json",
      });
      const recoveredArguments = JSON.parse(await readFile(recovery.argumentPath, "utf8"));
      expect(recoveredArguments.content).toBe(longContent);
      expect(finalAssistant?.content).toContain("Ambient/Pi stream interrupted while preparing a large tool call.");
      expect(finalAssistant?.content).toContain("Ambient is starting a continuation turn");
      expect(finalAssistant).toMatchObject({
        metadata: expect.objectContaining({
          status: "done",
          recoveringInterruptedToolCall: true,
          piStreamInterruption: expect.objectContaining({
            retryScheduled: true,
            replaySafe: true,
            retryReason: "interrupted_tool_call_recovery",
          }),
        }),
      });
      expect(store.getThread(thread.id).piSessionFile).toBe(sessionFile);
      expect(getSession).toHaveBeenCalledTimes(1);
      expect(session.prompt).toHaveBeenCalledTimes(1);
      expect(session.agent.abort).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("recovers unchanged partial tool arguments when keep-alive deltas keep the stream active", async () => {
    vi.useFakeTimers();
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-stalled-tool-args-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const created = store.createThread("stalled long write arguments");
      const threadSessionDir = join(workspace.sessionPath, created.id);
      await mkdir(threadSessionDir, { recursive: true });
      const sessionFile = join(threadSessionDir, "session.jsonl");
      await writeFile(sessionFile, "", "utf8");
      const thread = store.updateThreadSettings(created.id, { piSessionFile: sessionFile });

      const subscribers: Array<(event: any) => void> = [];
      const runtimeEvents: any[] = [];
      let rejectPrompt: ((error: Error) => void) | undefined;
      let keepAliveTimer: ReturnType<typeof setInterval> | undefined;
      const emit = (event: any) => {
        for (const subscriber of [...subscribers]) subscriber(event);
      };
      const longContent = "section\n".repeat(500);
      const toolArguments = { path: "long-report.md", content: longContent };
      const toolCallEvent = () => ({
        type: "message_update",
        assistantMessageEvent: {
          type: "toolcall_delta",
          toolCall: {
            id: "call-stalled-long-write",
            name: "write",
            arguments: JSON.stringify(toolArguments),
          },
        },
      });
      const session = {
        ...fakePiSession(sessionFile),
        isStreaming: true,
        subscribe: vi.fn((subscriber: (event: any) => void) => {
          subscribers.push(subscriber);
          return () => {
            const index = subscribers.indexOf(subscriber);
            if (index >= 0) subscribers.splice(index, 1);
          };
        }),
        prompt: vi.fn(() => new Promise<never>((_resolve, reject) => {
          rejectPrompt = reject;
          setTimeout(() => {
            emit(toolCallEvent());
            keepAliveTimer = setInterval(() => emit(toolCallEvent()), 5_000);
          }, 0);
        })),
        steer: vi.fn(async () => undefined),
        compact: vi.fn(async () => undefined),
        agent: {
          abort: vi.fn(() => {
            if (keepAliveTimer) clearInterval(keepAliveTimer);
            rejectPrompt?.(new Error("Request was aborted."));
          }),
          waitForIdle: vi.fn(async () => undefined),
        },
      };

      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        () =>
          ({
            isDestroyed: () => false,
            webContents: {
              isDestroyed: () => false,
              isCrashed: () => false,
              send: (_channel: string, event: any) => runtimeEvents.push(event),
            },
          }) as any,
        {
          request: vi.fn(),
          denyThread: () => undefined,
        },
      );
      const getSession = vi.spyOn(runtime as any, "getSession").mockResolvedValue(session);

      const sendPromise = runtime.send({
        threadId: thread.id,
        content: "Write a long report.",
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: "ambient-preview",
        thinkingLevel: "medium",
        delivery: "prompt",
        context: [],
      });

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(35_000);
      await sendPromise;

      const messages = store.listMessages(thread.id);
      const recoveryAssistant = messages.filter((message) => message.role === "assistant").find((message) =>
        message.content.includes("Ambient/Pi tool argument stream for write stalled after 30000ms without meaningful argument growth.")
      );
      const toolMessage = messages.find((message) => message.role === "tool");
      const recovery = (toolMessage?.metadata?.toolArgumentProgress as any)?.interruptedToolCallRecovery;
      const argumentTimeout = runtimeEvents.find((event) =>
        event.type === "runtime-activity" &&
        event.activity.kind === "stream" &&
        event.activity.status === "timeout" &&
        event.activity.diagnostic?.timeoutMode === "tool_argument_no_growth"
      );

      expect(argumentTimeout?.activity.message).toBe(
        "Ambient/Pi tool argument stream for write stalled after 30000ms without meaningful argument growth.",
      );
      expect(argumentTimeout?.activity.diagnostic).toMatchObject({
        toolCallId: "call-stalled-long-write",
        toolName: "write",
        timeoutMode: "tool_argument_no_growth",
      });
      expect(toolMessage?.content).toContain("write interrupted");
      expect(toolMessage?.metadata?.status).toBe("error");
      expect(recovery).toMatchObject({
        status: "recoverable",
        toolCallId: "call-stalled-long-write",
        toolName: "write",
        source: "raw_tool_input",
        parseStatus: "valid_json",
      });
      const recoveredArguments = JSON.parse(await readFile(recovery.argumentPath, "utf8"));
      expect(recoveredArguments.content).toBe(longContent);
      expect(recoveryAssistant?.content).toContain(
        "Ambient/Pi tool argument stream for write stalled after 30000ms without meaningful argument growth.",
      );
      expect(recoveryAssistant?.content).toContain("Ambient/Pi stream interrupted while preparing a large tool call.");
      expect(recoveryAssistant?.content).toContain("Ambient is starting a continuation turn");
      expect(recoveryAssistant).toMatchObject({
        metadata: expect.objectContaining({
          status: "done",
          recoveringInterruptedToolCall: true,
          piStreamInterruption: expect.objectContaining({
            kind: "stream_idle_timeout",
            retryScheduled: true,
            replaySafe: true,
            retryReason: "interrupted_tool_call_recovery",
          }),
        }),
      });
      expect(getSession).toHaveBeenCalled();
      expect(session.prompt).toHaveBeenCalled();
      expect(session.agent.abort).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("allows a second interrupted tool-call recovery when a recovery follow-up stalls again", async () => {
    vi.useFakeTimers();
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-stalled-tool-retry-budget-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const created = store.createThread("stalled recovery follow-up");
      const threadSessionDir = join(workspace.sessionPath, created.id);
      await mkdir(threadSessionDir, { recursive: true });
      const sessionFile = join(threadSessionDir, "session.jsonl");
      await writeFile(sessionFile, "", "utf8");
      const thread = store.updateThreadSettings(created.id, { piSessionFile: sessionFile });

      const subscribers: Array<(event: any) => void> = [];
      let rejectPrompt: ((error: Error) => void) | undefined;
      let keepAliveTimer: ReturnType<typeof setInterval> | undefined;
      const emit = (event: any) => {
        for (const subscriber of [...subscribers]) subscriber(event);
      };
      const longContent = "section\n".repeat(600);
      const toolArguments = { path: "long-report.md", content: longContent };
      const toolCallEvent = () => ({
        type: "message_update",
        assistantMessageEvent: {
          type: "toolcall_delta",
          toolCall: {
            id: "call-second-stalled-write",
            name: "write",
            arguments: JSON.stringify(toolArguments),
          },
        },
      });
      const session = {
        ...fakePiSession(sessionFile),
        isStreaming: true,
        subscribe: vi.fn((subscriber: (event: any) => void) => {
          subscribers.push(subscriber);
          return () => {
            const index = subscribers.indexOf(subscriber);
            if (index >= 0) subscribers.splice(index, 1);
          };
        }),
        prompt: vi.fn(() => new Promise<never>((_resolve, reject) => {
          rejectPrompt = reject;
          setTimeout(() => {
            emit(toolCallEvent());
            keepAliveTimer = setInterval(() => emit(toolCallEvent()), 5_000);
          }, 0);
        })),
        steer: vi.fn(async () => undefined),
        compact: vi.fn(async () => undefined),
        agent: {
          abort: vi.fn(() => {
            if (keepAliveTimer) clearInterval(keepAliveTimer);
            rejectPrompt?.(new Error("Request was aborted."));
          }),
          waitForIdle: vi.fn(async () => undefined),
        },
      };

      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });
      const getSession = vi.spyOn(runtime as any, "getSession").mockResolvedValue(session);

      const sendPromise = runtime.send({
        threadId: thread.id,
        content: "Continue the interrupted tool call from the saved partial arguments.",
        visibleUserContent: "Continue the interrupted tool call from the saved partial arguments.",
        modelContentOverride: "Continue the interrupted tool call from the saved partial arguments.",
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: "ambient-preview",
        thinkingLevel: "medium",
        delivery: "follow-up",
        preserveActiveThread: true,
        internal: true,
        context: [],
        sessionRecovery: {
          kind: "interrupted_tool_call_recovery",
          reason: "Continuing after Ambient/Pi interrupted while preparing tool arguments.",
          previousSessionFile: sessionFile,
          previousSessionFileExists: true,
        },
        interruptedToolCallRecovery: {
          attempt: 1,
          maxRetries: 3,
          sourceToolCallIds: ["call-prior-stalled-write"],
        },
      } as any);

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(35_000);
      await sendPromise;

      const messages = store.listMessages(thread.id);
      const recoveryAssistant = messages.find((message) =>
        message.role === "assistant" &&
        message.metadata?.recoveringInterruptedToolCall === true
      );
      const toolMessage = messages.find((message) => message.role === "tool");
      const recovery = (toolMessage?.metadata?.toolArgumentProgress as any)?.interruptedToolCallRecovery;

      expect(toolMessage?.content).toContain("write interrupted");
      expect(recovery).toMatchObject({
        status: "recoverable",
        toolCallId: "call-second-stalled-write",
        toolName: "write",
        source: "raw_tool_input",
        parseStatus: "valid_json",
      });
      expect(recoveryAssistant?.content).toContain("Ambient is starting a continuation turn");
      expect(recoveryAssistant).toMatchObject({
        metadata: expect.objectContaining({
          status: "done",
          recoveringInterruptedToolCall: true,
          piStreamInterruption: expect.objectContaining({
            retryScheduled: true,
            retryReason: "interrupted_tool_call_recovery",
            retryAttempt: 2,
            maxRetries: 3,
          }),
        }),
      });
      expect(getSession).toHaveBeenCalled();
      expect(session.prompt).toHaveBeenCalled();
      expect(session.agent.abort).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("reads interrupted tool-call recovery artifacts by stable ids with sha verification", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-runtime-recovery-reader-"));
    const projectRoot = join(root, "project");
    const activeWorktree = join(projectRoot, ".ambient-codex", "worktrees", "thread-1");
    const store = new ProjectStore();
    try {
      await mkdir(join(activeWorktree, ".ambient-codex", "interrupted-tool-calls", "run-1"), { recursive: true });
      const artifactPath = join(activeWorktree, ".ambient-codex", "interrupted-tool-calls", "run-1", "call-write.partial-args.txt");
      const exactArgs = JSON.stringify({ path: "report.md", content: "x".repeat(200) });
      await writeFile(artifactPath, exactArgs, "utf8");
      const sha256 = createHash("sha256").update(exactArgs).digest("hex");

      store.openWorkspace(projectRoot);
      const thread = store.createThread("recovery reader", activeWorktree);
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });

      const result = (runtime as any).readInterruptedToolCallRecoveryArtifact(thread.id, {
        runId: "run-1",
        toolCallId: "call-write",
        sha256,
      });

      expect(result.content).toEqual([{ type: "text", text: exactArgs }]);
      expect(result.details).toMatchObject({
        status: "done",
        toolName: "recovery_read_interrupted_tool_call",
        runId: "run-1",
        toolCallId: "call-write",
        sha256,
        artifactPath,
      });
    } finally {
      store.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("includes approved path grants in thread file authority roots", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-runtime-grant-authority-"));
    const projectRoot = join(root, "project");
    const activeWorktree = join(projectRoot, ".ambient-codex", "worktrees", "thread-1");
    const outsideFile = join(root, "outside", "approved.txt");
    const store = new ProjectStore();
    try {
      await mkdir(activeWorktree, { recursive: true });
      await mkdir(join(root, "outside"), { recursive: true });
      store.openWorkspace(projectRoot);
      const thread = store.createThread("grant authority", activeWorktree);
      store.createPermissionGrant({
        permissionModeAtCreation: "workspace",
        scopeKind: "thread",
        threadId: thread.id,
        actionKind: "local_file_write",
        targetKind: "path",
        targetHash: "test",
        targetLabel: outsideFile,
        conditions: { path: outsideFile },
        reason: "test grant",
      });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });

      expect((runtime as any).fileAuthorityRootPathsForThread(thread.id, "read")).toContain(outsideFile);
      expect((runtime as any).fileAuthorityRootPathsForThread(thread.id, "write")).toContain(join(root, "outside"));
    } finally {
      store.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("adds transient file authority for one-shot outside workspace approvals", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-runtime-transient-authority-"));
    const projectRoot = join(root, "project");
    const activeWorktree = join(projectRoot, ".ambient-codex", "worktrees", "thread-1");
    const outsideDir = join(root, "outside");
    const outsideFile = join(outsideDir, "approved-once.txt");
    const store = new ProjectStore();
    try {
      await mkdir(activeWorktree, { recursive: true });
      await mkdir(outsideDir, { recursive: true });
      store.openWorkspace(projectRoot);
      const created = store.createThread("transient authority", activeWorktree);
      const thread = store.updateThreadSettings(created.id, { permissionMode: "workspace" });
      const requester = vi.fn(async (_request: any) => ({ allowed: true, mode: "allow_once" as const }));
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: requester,
        denyThread: () => undefined,
      });
      const workspace = { ...store.getWorkspace(), path: activeWorktree };

      await expect((runtime as any).resolveToolCallPermission(thread.id, workspace, "write", {
        path: outsideFile,
        content: "approved once\n",
      })).resolves.toBeUndefined();

      expect(requester).toHaveBeenCalledTimes(1);
      const requestedPermission = requester.mock.calls.at(0)?.[0];
      expect(requestedPermission).toMatchObject({
        title: "Allow outside-workspace file access?",
        grantActionKind: "local_file_write",
        grantTargetKind: "path",
      });
      expect(requestedPermission.detail).toContain(outsideFile);
      expect(requestedPermission.detail).toContain("Approved path:");
      expect(store.listPermissionGrants()).toEqual([]);
      expect((runtime as any).fileAuthorityRootPathsForThread(thread.id, "write")).toContain(outsideDir);
    } finally {
      store.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("adds transient file authority for one-shot outside workspace Bash approvals", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-runtime-bash-transient-authority-"));
    const projectRoot = join(root, "project");
    const activeWorktree = join(projectRoot, ".ambient-codex", "worktrees", "thread-1");
    const outsideDir = join(root, "outside");
    const outsideFile = join(outsideDir, "bash-approved-once.txt");
    const store = new ProjectStore();
    try {
      await mkdir(activeWorktree, { recursive: true });
      await mkdir(outsideDir, { recursive: true });
      store.openWorkspace(projectRoot);
      const created = store.createThread("bash transient authority", activeWorktree);
      const thread = store.updateThreadSettings(created.id, { permissionMode: "workspace" });
      const requester = vi.fn(async (_request: any) => ({ allowed: true, mode: "allow_once" as const }));
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: requester,
        denyThread: () => undefined,
      });
      const workspace = { ...store.getWorkspace(), path: activeWorktree };

      await expect((runtime as any).resolveToolCallPermission(thread.id, workspace, "bash", {
        command: `printf hi > ${outsideFile}`,
      })).resolves.toBeUndefined();

      expect(requester).toHaveBeenCalledTimes(1);
      const requestedPermission = requester.mock.calls.at(0)?.[0];
      expect(requestedPermission).toMatchObject({
        risk: "outside-workspace",
        grantActionKind: "local_file_write",
        grantTargetKind: "path",
        grantTargetLabel: outsideFile,
        grantConditions: expect.objectContaining({
          operation: "bash",
          path: outsideFile,
        }),
      });
      expect(requestedPermission.detail).toContain("Approved path:");
      expect(store.listPermissionGrants()).toEqual([]);
      expect((runtime as any).fileAuthorityRootPathsForThread(thread.id, "write")).toContain(outsideDir);
    } finally {
      store.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("adds audited full-access file authority for outside workspace writes", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-runtime-full-access-authority-"));
    const projectRoot = join(root, "project");
    const activeWorktree = join(projectRoot, ".ambient-codex", "worktrees", "thread-1");
    const outsideDir = join(root, "outside");
    const outsideFile = join(outsideDir, "power-user.txt");
    const store = new ProjectStore();
    try {
      await mkdir(activeWorktree, { recursive: true });
      await mkdir(outsideDir, { recursive: true });
      store.openWorkspace(projectRoot);
      const created = store.createThread("full access authority", activeWorktree);
      const thread = store.updateThreadSettings(created.id, { permissionMode: "full-access" });
      const requester = vi.fn(async () => {
        throw new Error("Unexpected permission prompt.");
      });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: requester,
        denyThread: () => undefined,
      });
      const workspace = { ...store.getWorkspace(), path: activeWorktree };

      await expect((runtime as any).resolveToolCallPermission(thread.id, workspace, "write", {
        path: outsideFile,
        content: "power user\n",
      })).resolves.toBeUndefined();

      expect(requester).not.toHaveBeenCalled();
      expect((runtime as any).fileAuthorityRootPathsForThread(thread.id, "write")).toContain(outsideDir);
      expect(store.listPermissionAudit(10)).toEqual([
        expect.objectContaining({
          threadId: thread.id,
          toolName: "write",
          risk: "outside-workspace",
          decision: "allowed",
          detail: outsideFile,
          decisionSource: "allowed_by_full_access",
        }),
      ]);
    } finally {
      store.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("schedules a continuation turn when the provider errors during a long tool argument stream", async () => {
    vi.useFakeTimers();
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-interrupted-tool-provider-error-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const created = store.createThread("interrupted long write provider error");
      const threadSessionDir = join(workspace.sessionPath, created.id);
      await mkdir(threadSessionDir, { recursive: true });
      const sessionFile = join(threadSessionDir, "session.jsonl");
      await writeFile(sessionFile, "", "utf8");
      const thread = store.updateThreadSettings(created.id, { piSessionFile: sessionFile });

      const subscribers: Array<(event: any) => void> = [];
      const emit = (event: any) => {
        for (const subscriber of [...subscribers]) subscriber(event);
      };
      const longContent = "section\n".repeat(2_500);
      const toolArguments = { path: "long-report.md", content: longContent };
      const session = {
        ...fakePiSession(sessionFile),
        isStreaming: true,
        subscribe: vi.fn((subscriber: (event: any) => void) => {
          subscribers.push(subscriber);
          return () => {
            const index = subscribers.indexOf(subscriber);
            if (index >= 0) subscribers.splice(index, 1);
          };
        }),
        prompt: vi.fn(
          () =>
            new Promise<never>((_resolve, reject) => {
              setTimeout(() => {
                emit({
                  type: "message_update",
                  assistantMessageEvent: {
                    type: "toolcall_delta",
                    toolCall: {
                      id: "call-long-write-provider-error",
                      name: "write",
                      arguments: JSON.stringify(toolArguments),
                    },
                  },
                });
                reject(new Error("Upstream error"));
              }, 0);
            }),
        ),
        steer: vi.fn(async () => undefined),
        compact: vi.fn(async () => undefined),
        agent: {
          abort: vi.fn(),
          waitForIdle: vi.fn(async () => undefined),
        },
      };

      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });
      const getSession = vi.spyOn(runtime as any, "getSession").mockResolvedValue(session);

      const sendPromise = runtime.send({
        threadId: thread.id,
        content: "Write a long report.",
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: "ambient-preview",
        thinkingLevel: "medium",
        delivery: "prompt",
        context: [],
      });

      await vi.advanceTimersByTimeAsync(0);
      await sendPromise;

      const messages = store.listMessages(thread.id);
      const finalAssistant = messages.filter((message) => message.role === "assistant").at(-1);
      const toolMessage = messages.find((message) => message.role === "tool");
      const recovery = (toolMessage?.metadata?.toolArgumentProgress as any)?.interruptedToolCallRecovery;
      expect(toolMessage?.content).toContain("write interrupted");
      expect(toolMessage?.metadata?.status).toBe("error");
      expect(recovery).toMatchObject({
        status: "recoverable",
        toolCallId: "call-long-write-provider-error",
        toolName: "write",
        source: "raw_tool_input",
        parseStatus: "valid_json",
      });
      const recoveredArguments = JSON.parse(await readFile(recovery.argumentPath, "utf8"));
      expect(recoveredArguments.content).toBe(longContent);
      expect(finalAssistant?.content).toContain("Upstream error");
      expect(finalAssistant?.content).toContain("Ambient/Pi stream interrupted while preparing a large tool call.");
      expect(finalAssistant?.content).toContain("Ambient is starting a continuation turn");
      expect(finalAssistant).toMatchObject({
        metadata: expect.objectContaining({
          status: "done",
          recoveringInterruptedToolCall: true,
          piStreamInterruption: expect.objectContaining({
            kind: "provider_error_event",
            message: "Upstream error",
            retryScheduled: true,
            replaySafe: true,
            retryReason: "interrupted_tool_call_recovery",
          }),
        }),
      });
      expect(store.getThread(thread.id).piSessionFile).toBe(sessionFile);
      expect(getSession).toHaveBeenCalledTimes(1);
      expect(session.prompt).toHaveBeenCalledTimes(1);
      expect(session.agent.abort).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("continues from durable state when a retryable provider error happens before a short tool call executes", async () => {
    vi.useFakeTimers();
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-short-tool-provider-error-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const created = store.createThread("short tool provider error");
      const threadSessionDir = join(workspace.sessionPath, created.id);
      await mkdir(threadSessionDir, { recursive: true });
      const sessionFile = join(threadSessionDir, "session.jsonl");
      await writeFile(sessionFile, "", "utf8");
      const thread = store.updateThreadSettings(created.id, { piSessionFile: sessionFile });

      const subscribers: Array<(event: any) => void> = [];
      const emit = (event: any) => {
        for (const subscriber of [...subscribers]) subscriber(event);
      };
      const toolArguments = { targetUrl: "https://github.com/firecrawl/firecrawl-mcp-server" };
      const fetchArguments = {
        url: "https://monsoonpcs.com/store/",
        purpose: "verify current Monsoon PCs inventory",
      };
      const session = {
        ...fakePiSession(sessionFile),
        isStreaming: true,
        subscribe: vi.fn((subscriber: (event: any) => void) => {
          subscribers.push(subscriber);
          return () => {
            const index = subscribers.indexOf(subscriber);
            if (index >= 0) subscribers.splice(index, 1);
          };
        }),
        prompt: vi.fn(
          () =>
            new Promise<never>((_resolve, reject) => {
              setTimeout(() => {
                emit({
                  type: "message_update",
                  assistantMessageEvent: {
                    type: "toolcall_end",
                    toolCall: {
                      id: "call-autowire-provider-error",
                      name: "ambient_mcp_autowire_plan",
                      arguments: JSON.stringify(toolArguments),
                    },
                  },
                });
                emit({
                  type: "message_update",
                  assistantMessageEvent: {
                    type: "toolcall_end",
                    toolCall: {
                      id: "call-fetch-provider-error",
                      name: "web_research_fetch",
                      arguments: JSON.stringify(fetchArguments),
                    },
                  },
                });
                reject(
                  Object.assign(new Error("Upstream error"), {
                    status: 502,
                    code: "bad_gateway",
                    requestId: "req_123",
                    body: "model overloaded Bearer abcdefghijklmnop",
                    headers: {
                      "cf-ray": "cf-ray-123",
                      "retry-after": "3",
                      authorization: "Bearer should-not-leak",
                    },
                  }),
                );
              }, 0);
            }),
        ),
        steer: vi.fn(async () => undefined),
        compact: vi.fn(async () => undefined),
        agent: {
          abort: vi.fn(),
          waitForIdle: vi.fn(async () => undefined),
        },
      };

      const runtimeEvents: any[] = [];
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        () =>
          ({
            isDestroyed: () => false,
            webContents: {
              isDestroyed: () => false,
              isCrashed: () => false,
              send: (_channel: string, event: any) => runtimeEvents.push(event),
            },
          }) as any,
        {
          request: vi.fn(),
          denyThread: () => undefined,
        },
      );
      const getSession = vi.spyOn(runtime as any, "getSession").mockResolvedValue(session);
      const updateRunDiagnostics = vi.spyOn(store, "updateRunDiagnostics");

      const sendPromise = runtime.send({
        threadId: thread.id,
        content: "Plan this MCP autowire.",
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: "ambient-preview",
        thinkingLevel: "medium",
        delivery: "prompt",
        context: [],
      });

      await vi.advanceTimersByTimeAsync(0);
      await sendPromise;

      const messages = store.listMessages(thread.id);
      const finalAssistant = messages.filter((message) => message.role === "assistant").at(-1);
      const toolMessage = messages.find((message) => message.role === "tool");
      expect(toolMessage?.content).toContain("ambient_mcp_autowire_plan interrupted");
      expect(toolMessage?.content).toContain("failed before this tool executed");
      expect(toolMessage?.metadata?.status).toBe("error");
      expect(finalAssistant?.content).toContain("Ambient/Pi provider stream was interrupted");
      expect(finalAssistant?.content).toContain("Status: 502");
      expect(finalAssistant?.content).toContain("Code: bad_gateway");
      expect(finalAssistant?.content).toContain("Request id: req_123");
      expect(finalAssistant?.content).toContain("Trace id: cf-ray-123");
      expect(finalAssistant?.content).toContain("Retry after: 3");
      expect(finalAssistant?.content).toContain("Detail: model overloaded Bearer [REDACTED]");
      expect(finalAssistant?.content).not.toContain("abcdefghijklmnop");
      expect(JSON.stringify(finalAssistant?.metadata)).not.toContain("should-not-leak");
      expect(finalAssistant?.metadata?.providerContinuationState).toMatchObject({
        version: 1,
        provider: "ambient",
        failure: { kind: "provider_error_event", message: "Upstream error" },
        retry: expect.objectContaining({
          scheduled: true,
          replaySafe: true,
          continuationSafe: true,
          usesFreshSession: false,
          reason: "provider_interruption_continuation",
        }),
        stream: expect.objectContaining({
          firstEventType: "message_update",
          idleSource: "provider_error_event",
        }),
        tools: expect.objectContaining({
          completedToolMessageCount: 0,
          open: expect.arrayContaining([
            expect.objectContaining({
              toolCallId: "call-autowire-provider-error",
              toolName: "ambient_mcp_autowire_plan",
              status: "interrupted",
              certainty: "prepared_only",
              executionStarted: false,
              mayHaveSideEffects: false,
              argumentComplete: true,
              inputPreview: expect.stringContaining("firecrawl"),
              intent: expect.objectContaining({
                version: 1,
                toolCallId: "call-autowire-provider-error",
                toolName: "ambient_mcp_autowire_plan",
                operationKind: "tool_execution",
                targetSummary: "https://github.com/firecrawl/firecrawl-mcp-server",
                materiality: "important",
                substituteAllowed: false,
              }),
              workspaceRelativeRecoveryArgumentPath: expect.stringMatching(
                /^\.ambient-codex\/interrupted-tool-calls\/.*\/call-autowire-provider-error\.prepared-args\.txt$/,
              ),
            }),
            expect.objectContaining({
              toolCallId: "call-fetch-provider-error",
              toolName: "web_research_fetch",
              status: "interrupted",
              certainty: "prepared_only",
              executionStarted: false,
              mayHaveSideEffects: false,
              argumentComplete: true,
              inputPreview: expect.stringContaining("monsoonpcs"),
              intent: expect.objectContaining({
                version: 1,
                toolCallId: "call-fetch-provider-error",
                toolName: "web_research_fetch",
                declaredPurpose: "verify current Monsoon PCs inventory",
                operationKind: "verify_specific_source",
                targetSummary: "https://monsoonpcs.com/store/",
                materiality: "required_before_final_answer",
                substituteAllowed: true,
              }),
              workspaceRelativeRecoveryArgumentPath: expect.stringMatching(
                /^\.ambient-codex\/interrupted-tool-calls\/.*\/call-fetch-provider-error\.prepared-args\.txt$/,
              ),
            }),
          ]),
          interrupted: expect.arrayContaining([
            expect.objectContaining({
              toolCallId: "call-autowire-provider-error",
              status: "interrupted",
            }),
            expect.objectContaining({
              toolCallId: "call-fetch-provider-error",
              status: "interrupted",
            }),
          ]),
        }),
      });
      expect(updateRunDiagnostics).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          providerContinuationState: expect.objectContaining({
            stateId: expect.stringMatching(/^provider-continuation-/),
            tools: expect.objectContaining({
              mayHaveSideEffects: [],
            }),
          }),
        }),
      );
      expect(finalAssistant).toMatchObject({
        metadata: expect.objectContaining({
          status: "done",
          retryingProviderError: true,
          providerInterruptionContinuation: true,
          piStreamInterruption: expect.objectContaining({
            kind: "provider_error_event",
            retryScheduled: true,
            replaySafe: true,
            continuationSafe: true,
            retryReason: "provider_interruption_continuation",
            runStartedAt: expect.any(String),
            firstStreamEventAt: expect.any(String),
            firstToolArgumentAt: expect.any(String),
            providerRetryAttemptCount: 1,
            providerRetryLastError: "Upstream error",
            providerErrorDiagnostic: expect.objectContaining({
              status: 502,
              code: "bad_gateway",
              requestId: "req_123",
              traceId: "cf-ray-123",
              retryAfter: "3",
              bodyPreview: "model overloaded Bearer [REDACTED]",
              detailPreview: "model overloaded Bearer [REDACTED]",
              headers: expect.objectContaining({
                "cf-ray": "cf-ray-123",
                "retry-after": "3",
              }),
            }),
            providerFailureDiagnostic: expect.objectContaining({
              diagnosticId: expect.stringMatching(/^provider-failure-/),
              providerId: "ambient",
              model: expect.any(String),
              kind: "provider_error_event",
              message: "Upstream error",
              httpStatus: 502,
              errorCode: "bad_gateway",
              requestId: "req_123",
              traceId: "cf-ray-123",
              retryAfter: "3",
              providerErrorBodyPreview: "model overloaded Bearer [REDACTED]",
              stream: expect.objectContaining({
                eventCount: expect.any(Number),
                approximatePayloadBytes: expect.any(Number),
                firstEventAt: expect.any(String),
                firstEventType: "message_update",
                lastEventAt: expect.any(String),
                lastEventType: "message_update",
                idleSource: "provider_error_event",
                firstToolArgumentAt: expect.any(String),
                assistantOutputChars: 0,
                thinkingOutputChars: 0,
                semanticOutputSeen: false,
                receivedAnyText: false,
              }),
              retry: expect.objectContaining({
                scheduled: true,
                replaySafe: true,
                continuationSafe: true,
                usesFreshSession: false,
                attempt: 1,
                maxRetries: expect.any(Number),
                reason: "provider_interruption_continuation",
                providerRetryAttemptCount: 1,
                providerRetryLastError: "Upstream error",
              }),
              transcript: expect.objectContaining({
                toolCallSeen: true,
                toolMessageCount: 2,
                openToolCallCount: 2,
                completedToolMessageCount: 0,
              }),
            }),
          }),
        }),
      });
      expect(runtimeEvents).toContainEqual(expect.objectContaining({
        type: "runtime-activity",
        activity: expect.objectContaining({
          kind: "retry",
          status: "starting",
          attempt: 1,
          message: "Provider interrupted the stream; continuing from transcript: Upstream error",
        }),
      }));
      const openTools = (finalAssistant?.metadata?.providerContinuationState as any)?.tools?.open ?? [];
      const openToolState = openTools.find((tool: any) => tool.toolCallId === "call-autowire-provider-error");
      const fetchToolState = openTools.find((tool: any) => tool.toolCallId === "call-fetch-provider-error");
      expect(finalAssistant?.content).toContain("certainty=prepared_only");
      expect(finalAssistant?.content).toContain("intent: tool_execution; important; target=https://github.com/firecrawl/firecrawl-mcp-server; no_substitute");
      expect(finalAssistant?.content).toContain("intent: verify_specific_source; required_before_final_answer; target=https://monsoonpcs.com/store/; purpose=verify current Monsoon PCs inventory; substitute_allowed");
      expect(openToolState?.recoveryArgumentPath).toEqual(expect.stringContaining("call-autowire-provider-error.prepared-args.txt"));
      expect(await readFile(openToolState.recoveryArgumentPath, "utf8")).toContain(toolArguments.targetUrl);
      expect(fetchToolState?.recoveryArgumentPath).toEqual(expect.stringContaining("call-fetch-provider-error.prepared-args.txt"));
      expect(await readFile(fetchToolState.recoveryArgumentPath, "utf8")).toContain(fetchArguments.purpose);
      expect(store.getThread(thread.id).piSessionFile).toBe(sessionFile);
      expect(getSession).toHaveBeenCalledTimes(1);
      expect(session.prompt).toHaveBeenCalledTimes(1);
      expect(session.dispose).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("drops a reused Pi session after a pre-output provider retry recovers", async () => {
    vi.useFakeTimers();
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-provider-retry-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const created = store.createThread("provider retry");
      const threadSessionDir = join(workspace.sessionPath, created.id);
      await mkdir(threadSessionDir, { recursive: true });
      const sessionFile = join(threadSessionDir, "session.jsonl");
      await writeFile(sessionFile, "", "utf8");
      const thread = store.updateThreadSettings(created.id, { piSessionFile: sessionFile });
      const subscribers: Array<(event: any) => void> = [];
      const emit = (event: any) => {
        for (const subscriber of [...subscribers]) subscriber(event);
      };
      const finalText = "Brave Search is available. I can start the plan once the API key is captured.";
      const session = {
        ...fakePiSession(sessionFile),
        isStreaming: true,
        subscribe: vi.fn((subscriber: (event: any) => void) => {
          subscribers.push(subscriber);
          return () => {
            const index = subscribers.indexOf(subscriber);
            if (index >= 0) subscribers.splice(index, 1);
          };
        }),
        prompt: vi.fn(() => new Promise<void>((resolve) => {
          setTimeout(() => {
            emit({
              type: "auto_retry_start",
              attempt: 1,
              maxAttempts: 3,
              delayMs: 250,
              errorMessage: "429 Upstream request failed",
            });
            emit({
              type: "auto_retry_end",
              success: true,
              attempt: 1,
            });
            emit({
              type: "message_end",
              message: {
                role: "assistant",
                stopReason: "stop",
                content: [{ type: "text", text: finalText }],
              },
            });
            resolve();
          }, 0);
        })),
        steer: vi.fn(async () => undefined),
        compact: vi.fn(async () => undefined),
        agent: {
          abort: vi.fn(),
          waitForIdle: vi.fn(async () => undefined),
        },
      };
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });
      vi.spyOn(runtime as any, "getSession").mockResolvedValue(session);

      const sendPromise = runtime.send({
        threadId: thread.id,
        content: "Can we add Brave Search as a provider?",
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: "ambient-preview",
        thinkingLevel: "medium",
        delivery: "prompt",
        context: [],
      });

      await vi.advanceTimersByTimeAsync(0);
      await sendPromise;

      const finalAssistant = store.listMessages(thread.id).filter((message) => message.role === "assistant").at(-1);
      expect(finalAssistant).toMatchObject({
        content: finalText,
        metadata: expect.objectContaining({
          status: "done",
          piProviderRetry: expect.objectContaining({
            beforeVisibleOutput: true,
            recovered: true,
            attemptCount: 1,
            sessionDiscarded: true,
            sessionFile,
            lastError: "429 Upstream request failed",
          }),
        }),
      });
      expect(store.getThread(thread.id).piSessionFile).toBeUndefined();
      expect(session.dispose).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});
