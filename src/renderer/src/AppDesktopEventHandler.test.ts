import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { describe, expect, it } from "vitest";

import type { DesktopEvent } from "../../shared/desktopTypes";
import type { PermissionRequest } from "../../shared/permissionTypes";
import {
  createAppDesktopEventHandlerDependencies,
  handleAppDesktopEvent,
  toolEventActivityMessage,
  type AppDesktopEventHandlerDependencies,
} from "./AppDesktopEventHandler";
import type { RunActivityLine } from "./AppRunActivity";

describe("App desktop event handler", () => {
  it("extracts direct and nested tool activity messages", () => {
    expect(toolEventActivityMessage({ activityMessage: " Reading files " })).toBe("Reading files");
    expect(
      toolEventActivityMessage({
        localDeepResearchStatus: { message: "Indexing corpus" },
      }),
    ).toBe("Indexing corpus");
    expect(toolEventActivityMessage({ localDeepResearchStatus: { message: " " } })).toBeUndefined();
  });

  it("deduplicates permission prompts and fills the event workspace path", () => {
    const permissionRequests = stateCell<PermissionRequest[]>([]);
    const deps = appDesktopEventHandlerDependencies({
      setPermissionRequests: permissionRequests.set,
    });
    const request = permissionRequest({ id: "permission-1" });

    handleAppDesktopEvent({ type: "permission-request", request, workspacePath: "/repo" }, deps);
    handleAppDesktopEvent({ type: "permission-request", request, workspacePath: "/repo" }, deps);

    expect(permissionRequests.current).toEqual([{ ...request, workspacePath: "/repo" }]);

    handleAppDesktopEvent({ type: "permission-resolved", id: "permission-1", workspacePath: "/repo" }, deps);

    expect(permissionRequests.current).toEqual([]);
  });

  it("packs grouped App owner dependencies into the desktop event handler contract", () => {
    const deps = appDesktopEventHandlerDependencies();
    const packed = createAppDesktopEventHandlerDependencies({
      automationShellState: deps,
      appendRunActivityLine: deps.appendRunActivityLine,
      appendThinkingDeltaLine: deps.appendThinkingDeltaLine,
      desktopEventGuards: deps,
      handleMenuCommand: deps.handleMenuCommand,
      openAmbientCliSecretDialog: deps.openAmbientCliSecretDialog,
      openApiKeyDialog: deps.openApiKeyDialog,
      providerRuntimeState: deps,
      rememberClearedGoal: deps.rememberClearedGoal,
      rememberCommittedDesktopState: deps.rememberCommittedDesktopState,
      rightPanelState: deps,
      runActivityState: deps,
      scheduleSttProviderRefresh: deps.scheduleSttProviderRefresh,
      scheduleVoiceProviderRefresh: deps.scheduleVoiceProviderRefresh,
      securityPromptState: deps,
      setState: deps.setState,
      shellUiState: deps,
      triggerGoalCompletionCelebration: deps.triggerGoalCompletionCelebration,
      voiceThreadControls: deps,
      workflowRuntimeState: deps,
      workspaceShellState: deps,
    });

    expect(packed.activeProjectRootRef).toBe(deps.activeProjectRootRef);
    expect(packed.desktopEventMatchesActiveProject).toBe(deps.desktopEventMatchesActiveProject);
    expect(packed.openMcpRuntimeSettings).toBe(deps.openMcpRuntimeSettings);
    expect(packed.setSelectedWorkflowAgentThreadId).toBe(deps.setSelectedWorkflowAgentThreadId);
    expect(packed.setState).toBe(deps.setState);
  });

  it("routes tool activity lines and refreshes workspace/provider state after completion", () => {
    const workspaceRevision = stateCell(0);
    const lines: Array<{ text: string; kind: RunActivityLine["kind"] | undefined; threadId: string | undefined }> = [];
    const refreshes: Array<{ kind: "voice" | "stt"; delayMs: number; reason: string }> = [];
    const deps = appDesktopEventHandlerDependencies({
      appendRunActivityLine: (text, kind, _options, threadId) => {
        lines.push({ text, kind, threadId });
      },
      scheduleSttProviderRefresh: (delayMs, reason) => {
        refreshes.push({ kind: "stt", delayMs, reason });
      },
      scheduleVoiceProviderRefresh: (delayMs, reason) => {
        refreshes.push({ kind: "voice", delayMs, reason });
      },
      setWorkspaceRevision: workspaceRevision.set,
    });

    handleAppDesktopEvent(
      {
        type: "tool-event",
        threadId: "thread-1",
        label: "file read",
        status: "running",
        details: { pluginName: "Files", toolName: "read" },
        workspacePath: "/repo",
      },
      deps,
    );
    handleAppDesktopEvent(
      {
        type: "tool-event",
        threadId: "thread-1",
        label: "file read",
        status: "done",
        artifactPath: "/repo/output.txt",
        details: { pluginName: "Files", toolName: "read" },
        workspacePath: "/repo",
      },
      deps,
    );

    expect(lines).toEqual([
      { text: "Running Files: read.", kind: "tool", threadId: "thread-1" },
      { text: "Files: read for /repo/output.txt completed.", kind: "tool", threadId: "thread-1" },
    ]);
    expect(workspaceRevision.current).toBe(1);
    expect(refreshes).toEqual([
      { kind: "voice", delayMs: 500, reason: "tool done" },
      { kind: "stt", delayMs: 500, reason: "tool done" },
    ]);
  });
});

function appDesktopEventHandlerDependencies(
  overrides: Partial<AppDesktopEventHandlerDependencies> = {},
): AppDesktopEventHandlerDependencies {
  return {
    activeProjectRootRef: ref("/repo"),
    activeThreadIdRef: ref("thread-1"),
    appendRunActivityLine: () => undefined,
    appendThinkingDeltaLine: () => undefined,
    clearedGoalKeysRef: ref(new Set<string>()),
    desktopEventMatchesActiveProject: eventMatchesRepo,
    desktopEventMatchesWorkspace: (event, workspacePath) => eventMatchesWorkspace(event, workspacePath ?? "/repo"),
    handleMenuCommand: () => undefined,
    latestDesktopStateRevisionRef: ref(undefined),
    messageKindsRef: ref({}),
    openAmbientCliSecretDialog: () => undefined,
    openApiKeyDialog: () => undefined,
    openMcpRuntimeSettings: () => undefined,
    rememberClearedGoal: () => undefined,
    rememberCommittedDesktopState: () => undefined,
    runtimeActivityRenderStateRef: ref({}),
    scheduleSttProviderRefresh: () => undefined,
    scheduleVoiceProviderRefresh: () => undefined,
    setActiveVoiceMessageId: noopDispatch(),
    setActivity: noopDispatch(),
    setBrowserRevision: noopDispatch(),
    setChatBrowserUserAction: noopDispatch(),
    setLocalDeepResearchSetup: noopDispatch(),
    setMcpContainerRuntimeInstallProgress: noopDispatch(),
    setMcpDefaultCapabilityInstallProgress: noopDispatch(),
    setOrchestrationAutoRevision: noopDispatch(),
    setOrchestrationRevision: noopDispatch(),
    setPermissionAudit: noopDispatch(),
    setPermissionAuditRevision: noopDispatch(),
    setPermissionGrants: noopDispatch(),
    setPermissionRequests: noopDispatch(),
    setPluginCatalogRevision: noopDispatch(),
    setPrivilegedCredentialRequests: noopDispatch(),
    setRetryStatsByThread: noopDispatch(),
    setRunStatus: noopDispatch(),
    setScopedError: () => undefined,
    setSecureInputRequests: noopDispatch(),
    setSelectedWorkflowAgentThreadId: noopDispatch(),
    setState: noopDispatch(),
    setThreadRunStatuses: noopDispatch(),
    setWorkflowCompileProgress: noopDispatch(),
    setWorkflowDiscoveryProgress: noopDispatch(),
    setWorkflowExplorationProgressByThreadId: noopDispatch(),
    setWorkflowRevision: noopDispatch(),
    setWorkspaceRevision: noopDispatch(),
    triggerGoalCompletionCelebration: () => undefined,
    ...overrides,
  };
}

function eventMatchesRepo(event: DesktopEvent): boolean {
  return eventMatchesWorkspace(event, "/repo");
}

function eventMatchesWorkspace(event: DesktopEvent, workspacePath: string): boolean {
  return !("workspacePath" in event) || !event.workspacePath || event.workspacePath === workspacePath;
}

function permissionRequest(overrides: Partial<PermissionRequest> = {}): PermissionRequest {
  return {
    id: "permission-1",
    threadId: "thread-1",
    toolName: "shell",
    title: "Run command",
    message: "Run command?",
    risk: "workspace-command",
    ...overrides,
  };
}

function ref<T>(current: T): MutableRefObject<T> {
  return { current };
}

function noopDispatch<T>(): Dispatch<SetStateAction<T>> {
  return () => undefined;
}

function stateCell<T>(initial: T): { readonly current: T; set: Dispatch<SetStateAction<T>> } {
  let current = initial;
  return {
    get current() {
      return current;
    },
    set(next) {
      current = typeof next === "function" ? (next as (currentValue: T) => T)(current) : next;
    },
  };
}
