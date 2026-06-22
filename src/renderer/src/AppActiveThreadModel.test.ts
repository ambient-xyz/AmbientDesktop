import { describe, expect, it } from "vitest";

import { resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import type { PermissionRequest, PrivilegedCredentialRequest, SecureInputRequest } from "../../shared/permissionTypes";
import type { ChatMessage, RuntimeActivity, ThreadGoal, ThreadSummary } from "../../shared/threadTypes";
import { createAppActiveThreadModel, selectAppActiveThread, selectAppLocalDeepResearchRunBudget } from "./AppActiveThreadModel";
import type { AppActiveThreadModelInput } from "./AppActiveThreadModel";

describe("App active thread model", () => {
  it("selects active thread runtime values for App shell props", () => {
    const activeThread = thread({ id: "thread-active", memoryEnabled: true });
    const localDeepResearchToolMessage = {
      id: "message-tool",
      threadId: "thread-active",
      role: "tool",
      content: "",
      createdAt: "2026-06-22T00:00:00.000Z",
      metadata: {
        toolName: "ambient_local_deep_research_run",
        status: "running",
      },
    } as ChatMessage;
    const state = desktopState({
      activeThreadId: "thread-active",
      activeThreadGoal: goal({ goalId: "goal-1", status: "active" }),
      messages: [localDeepResearchToolMessage],
      threads: [thread({ id: "thread-other" }), activeThread],
    });
    const activity = {
      threadId: "thread-active",
      kind: "goal",
      status: "continuing",
      goalId: "goal-1",
    } as RuntimeActivity;
    const browserAction = {
      id: "browser-action-1",
      active: true,
      sourceThreadId: "thread-active",
    } as AppActiveThreadModelInput["chatBrowserUserAction"];
    const permissionRequests = [
      permissionRequest({ id: "outside", threadId: "thread-active", workspacePath: "/other" }),
      permissionRequest({ id: "active", threadId: "thread-active", workspacePath: "/workspace" }),
      permissionRequest({ id: "running-other", threadId: "thread-other", workspacePath: "/workspace" }),
    ];
    const privilegedCredentialRequests = [
      privilegedCredentialRequest({ id: "filtered-credential", workspacePath: "/other" }),
      privilegedCredentialRequest({ id: "credential", workspacePath: "/workspace" }),
    ];
    const secureInputRequests = [
      secureInputRequest({ id: "filtered-secure", workspacePath: "/other" }),
      secureInputRequest({ id: "secure", workspacePath: "/workspace" }),
    ];

    const model = createAppActiveThreadModel(
      baseInput({
        activity,
        chatBrowserUserAction: browserAction,
        localDeepResearchBudgetOverride: { effort: "custom", maxToolCalls: 42, onExhausted: "summarize" },
        localDeepResearchReady: true,
        permissionRequests,
        platform: "MacIntel",
        privilegedCredentialRequests,
        promptRequestMatchesActiveProject: (request) => request.workspacePath !== "/other",
        secureInputRequests,
        state,
        threadRunStatuses: { "thread-other": "streaming" },
      }),
    );

    expect(model.activeThread).toBe(activeThread);
    expect(model.activeActivity).toBe(activity);
    expect(model.activeChatBrowserUserAction).toBe(browserAction);
    expect(model.activePermissionRequest?.id).toBe("active");
    expect(model.activePrivilegedCredentialRequest?.id).toBe("credential");
    expect(model.activeSecureInputRequest?.id).toBe("secure");
    expect(model.isMac).toBe(true);
    expect(model.localDeepResearchReady).toBe(true);
    expect(model.localDeepResearchRunActive).toBe(true);
    expect(model.localDeepResearchRunBudget).toMatchObject({
      effort: "custom",
      maxToolCalls: 42,
      onExhausted: "summarize",
      source: "run_override",
    });
    expect(model.showTopbarThreadMemoryToggle).toBe(true);
  });

  it("keeps inactive or mismatched transient state hidden", () => {
    const state = desktopState({
      activeThreadGoal: goal({ goalId: "goal-1", status: "active" }),
      threads: [thread({ id: "thread-active", kind: "subagent_child" })],
    });

    const model = createAppActiveThreadModel(
      baseInput({
        activity: {
          threadId: "thread-active",
          kind: "goal",
          status: "continuing",
          goalId: "other-goal",
        } as RuntimeActivity,
        chatBrowserUserAction: {
          id: "browser-action-1",
          active: false,
          sourceThreadId: "thread-active",
        } as AppActiveThreadModelInput["chatBrowserUserAction"],
        platform: "Win32",
        state,
      }),
    );

    expect(model.activeActivity).toBeUndefined();
    expect(model.activeChatBrowserUserAction).toBeUndefined();
    expect(model.activePermissionRequest).toBeUndefined();
    expect(model.isMac).toBe(false);
    expect(model.showTopbarThreadMemoryToggle).toBe(false);
  });

  it("provides boot-safe defaults before desktop state arrives", () => {
    const model = createAppActiveThreadModel(
      baseInput({
        localDeepResearchReady: false,
        platform: "MacIntel",
        state: undefined,
      }),
    );

    expect(model.activeThread).toBeUndefined();
    expect(model.activePermissionRequest).toBeUndefined();
    expect(model.localDeepResearchReady).toBe(false);
    expect(model.localDeepResearchRunActive).toBe(false);
    expect(model.localDeepResearchRunBudget.source).toBe("user_default");
    expect(model.showTopbarThreadMemoryToggle).toBe(false);
  });

  it("exposes pure selectors for focused owner tests", () => {
    const activeThread = thread({ id: "thread-active" });
    const state = desktopState({
      activeThreadId: "thread-active",
      threads: [thread({ id: "thread-other" }), activeThread],
    });

    expect(selectAppActiveThread(state)).toBe(activeThread);
    expect(selectAppLocalDeepResearchRunBudget(state, undefined)).toMatchObject({
      effort: "quick",
      maxToolCalls: 10,
      source: "user_default",
    });
  });
});

function baseInput(input: Partial<AppActiveThreadModelInput> = {}): AppActiveThreadModelInput {
  return {
    activity: undefined,
    chatBrowserUserAction: undefined,
    localDeepResearchBudgetOverride: undefined,
    localDeepResearchReady: false,
    permissionRequests: [],
    platform: "",
    privilegedCredentialRequests: [],
    promptRequestMatchesActiveProject: () => true,
    secureInputRequests: [],
    sidebarArea: "projects",
    state: desktopState(),
    threadRunStatuses: {},
    ...input,
  };
}

function desktopState(
  input: {
    activeThreadGoal?: ThreadGoal;
    activeThreadId?: string;
    messages?: ChatMessage[];
    threads?: ThreadSummary[];
  } = {},
): AppActiveThreadModelInput["state"] {
  return {
    activeThreadGoal: input.activeThreadGoal,
    activeThreadId: input.activeThreadId ?? "thread-active",
    featureFlagSnapshot: resolveAmbientFeatureFlags({ settings: { tencentDbMemory: true } }),
    messages: input.messages ?? [],
    settings: {
      localDeepResearch: {
        runBudget: {
          defaultEffort: "quick",
          customMaxToolCalls: 9,
          onExhausted: "ask_to_continue",
        },
      },
    },
    threads: input.threads ?? [thread({ id: input.activeThreadId ?? "thread-active" })],
  } as AppActiveThreadModelInput["state"];
}

function thread(input: Partial<ThreadSummary> & Pick<ThreadSummary, "id">): ThreadSummary {
  return {
    archivedAt: undefined,
    collaborationMode: "agent",
    createdAt: "2026-06-22T00:00:00.000Z",
    lastMessagePreview: "",
    memoryEnabled: false,
    model: "ambient",
    permissionMode: "workspace",
    thinkingLevel: "medium",
    title: input.id,
    updatedAt: "2026-06-22T00:00:00.000Z",
    workspacePath: "/workspace",
    ...input,
  };
}

function goal(input: Partial<ThreadGoal> & Pick<ThreadGoal, "goalId" | "status">): ThreadGoal {
  return {
    createdAt: "2026-06-22T00:00:00.000Z",
    objective: "Finish the task",
    timeUsedSeconds: 0,
    tokensUsed: 0,
    updatedAt: "2026-06-22T00:00:00.000Z",
    ...input,
  } as ThreadGoal;
}

function permissionRequest(input: Partial<PermissionRequest> & Pick<PermissionRequest, "id" | "threadId">): PermissionRequest {
  return {
    message: "",
    risk: "workspace-command",
    title: input.id,
    toolName: "tool",
    ...input,
  };
}

function privilegedCredentialRequest(
  input: Partial<PrivilegedCredentialRequest> & Pick<PrivilegedCredentialRequest, "id">,
): PrivilegedCredentialRequest {
  return {
    createdAt: "2026-06-22T00:00:00.000Z",
    credentialLabel: "Credential",
    detail: "",
    expiresAt: "2026-06-22T00:05:00.000Z",
    message: "",
    purpose: "package_install",
    requestId: input.id,
    title: input.id,
    ...input,
  } as PrivilegedCredentialRequest;
}

function secureInputRequest(input: Partial<SecureInputRequest> & Pick<SecureInputRequest, "id">): SecureInputRequest {
  return {
    createdAt: "2026-06-22T00:00:00.000Z",
    detail: "",
    expiresAt: "2026-06-22T00:05:00.000Z",
    inputKind: "generic_secret",
    inputLabel: "Secret",
    inputMode: "password",
    message: "",
    requestId: input.id,
    title: input.id,
    ...input,
  };
}
