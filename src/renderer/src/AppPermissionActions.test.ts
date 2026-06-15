import type { Dispatch, SetStateAction } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  DesktopState,
  AmbientPermissionGrant,
  PermissionAuditEntry,
  PermissionRequest,
  PrivilegedCredentialRequest,
  SecureInputRequest,
  ThreadSummary,
} from "../../shared/types";
import {
  createAppPermissionActions,
  desktopStateWithUpdatedThreadSettings,
  isDefaultCapabilityPermissionRequest,
  mergePendingPermissionRequests,
  permissionRequestDisplayScore,
  selectActivePermissionRequest,
} from "./AppPermissionActions";

describe("App permission actions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("scores and selects the permission prompt closest to the active run", () => {
    const defaultCapability = permissionRequest({
      id: "default-capability",
      threadId: "thread-1",
      toolName: "ambient_mcp_default_capability_install",
    });
    const activeThread = permissionRequest({ id: "active", threadId: "thread-1" });
    const runningThread = permissionRequest({ id: "running", threadId: "thread-2" });

    expect(isDefaultCapabilityPermissionRequest(defaultCapability)).toBe(true);
    expect(permissionRequestDisplayScore(activeThread, "thread-1", {})).toBe(1_000);
    expect(permissionRequestDisplayScore(runningThread, "thread-1", { "thread-2": "streaming" })).toBe(500);
    expect(permissionRequestDisplayScore(defaultCapability, "thread-1", { "thread-1": "tool" })).toBe(500);
    expect(selectActivePermissionRequest([runningThread, activeThread], "thread-1", { "thread-2": "streaming" })).toBe(activeThread);
  });

  it("merges pending permission requests and drops prompts no longer pending", () => {
    const stale = permissionRequest({ id: "stale", threadId: "thread-1", toolName: "old-tool" });
    const currentPending = permissionRequest({ id: "pending", threadId: "thread-1", toolName: "old-label" });
    const refreshedPending = permissionRequest({ id: "pending", threadId: "thread-1", toolName: "new-label" });
    const nextPending = permissionRequest({ id: "new", threadId: "thread-2" });

    expect(mergePendingPermissionRequests([stale, currentPending], [refreshedPending, nextPending])).toEqual([
      refreshedPending,
      nextPending,
    ]);
  });

  it("replaces the updated thread and mirrors thread settings into desktop settings", () => {
    const state = desktopState();
    const updatedThread = threadSummary({
      id: "thread-1",
      permissionMode: "full-access",
      collaborationMode: "agent",
      model: "gmi-cloud-model",
      thinkingLevel: "high",
    });

    expect(desktopStateWithUpdatedThreadSettings(state, updatedThread)).toMatchObject({
      threads: [updatedThread, state.threads[1]],
      settings: {
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: "gmi-cloud-model",
        thinkingLevel: "high",
      },
    });
  });

  it("responds to prompts and requests thread permission mode changes through Ambient Desktop", async () => {
    const updatedThread = threadSummary({
      id: "thread-1",
      permissionMode: "full-access",
    });
    const ambientDesktop = {
      requestThreadPermissionModeChange: vi.fn(async () => updatedThread),
      respondPermissionRequest: vi.fn(async () => undefined),
      respondPrivilegedCredentialRequest: vi.fn(async () => undefined),
      respondSecureInputRequest: vi.fn(async () => undefined),
    };
    vi.stubGlobal("window", { ambientDesktop });
    const state = desktopState();
    const permissionRequests = statefulSetter<PermissionRequest[]>([
      permissionRequest({ id: "permission-1", threadId: "thread-1" }),
    ]);
    const privilegedRequests = statefulSetter<PrivilegedCredentialRequest[]>([
      { id: "credential-1", requestId: "credential-1" } as PrivilegedCredentialRequest,
    ]);
    const secureRequests = statefulSetter<SecureInputRequest[]>([
      { id: "secure-1", requestId: "secure-1" } as SecureInputRequest,
    ]);
    const desktopStateSetter = statefulSetter<DesktopState | undefined>(state);
    const actions = createController({
      permissionRequests,
      privilegedRequests,
      secureRequests,
      setState: desktopStateSetter.set,
      state,
    });

    await actions.respondPermissionRequest("permission-1", "allow_once");
    await actions.respondPrivilegedCredentialRequest("credential-1", "placeholder-value");
    await actions.respondSecureInputRequest("secure-1");
    await actions.requestThreadPermissionModeChange("full-access");

    expect(permissionRequests.value).toEqual([]);
    expect(privilegedRequests.value).toEqual([]);
    expect(secureRequests.value).toEqual([]);
    expect(ambientDesktop.respondPermissionRequest).toHaveBeenCalledWith("permission-1", "allow_once");
    expect(ambientDesktop.respondPrivilegedCredentialRequest).toHaveBeenCalledWith({
      id: "credential-1",
      credential: "placeholder-value",
      canceled: false,
    });
    expect(ambientDesktop.respondSecureInputRequest).toHaveBeenCalledWith({
      id: "secure-1",
      value: undefined,
      canceled: true,
    });
    expect(ambientDesktop.requestThreadPermissionModeChange).toHaveBeenCalledWith({
      threadId: "thread-1",
      permissionMode: "full-access",
      reason: "Changed from the thread settings control.",
    });
    expect(desktopStateSetter.value?.settings.permissionMode).toBe("full-access");
  });
});

function createController({
  permissionRequests = statefulSetter<PermissionRequest[]>([]),
  privilegedRequests = statefulSetter<PrivilegedCredentialRequest[]>([]),
  secureRequests = statefulSetter<SecureInputRequest[]>([]),
  setState = statefulSetter<DesktopState | undefined>(desktopState()).set,
  state = desktopState(),
}: {
  permissionRequests?: ReturnType<typeof statefulSetter<PermissionRequest[]>>;
  privilegedRequests?: ReturnType<typeof statefulSetter<PrivilegedCredentialRequest[]>>;
  secureRequests?: ReturnType<typeof statefulSetter<SecureInputRequest[]>>;
  setState?: Dispatch<SetStateAction<DesktopState | undefined>>;
  state?: DesktopState;
}) {
  return createAppPermissionActions({
    permissionAudit: [],
    permissionGrants: [],
    setPermissionAudit: statefulSetter<PermissionAuditEntry[]>([]).set,
    setPermissionAuditError: statefulSetter<string | undefined>(undefined).set,
    setPermissionGrantError: statefulSetter<string | undefined>(undefined).set,
    setPermissionGrantRevoking: statefulSetter<string | undefined>(undefined).set,
    setPermissionGrants: statefulSetter<AmbientPermissionGrant[]>([]).set,
    setPermissionRequests: permissionRequests.set,
    setPrivilegedCredentialRequests: privilegedRequests.set,
    setSecureInputRequests: secureRequests.set,
    setState,
    state,
  });
}

function statefulSetter<T>(initial: T): {
  set: Dispatch<SetStateAction<T>>;
  value: T;
} {
  const state = { value: initial };
  return {
    get value() {
      return state.value;
    },
    set(next) {
      state.value = typeof next === "function" ? (next as (current: T) => T)(state.value) : next;
    },
  };
}

function permissionRequest(overrides: Partial<PermissionRequest>): PermissionRequest {
  return {
    id: "permission-1",
    requestId: "permission-1",
    threadId: "thread-1",
    toolName: "ambient_shell",
    title: "Allow tool?",
    message: "Allow tool?",
    detail: "Tool wants to run.",
    options: [],
    createdAt: "2026-06-13T00:00:00.000Z",
    ...overrides,
  } as PermissionRequest;
}

function threadSummary(overrides: Partial<ThreadSummary>): ThreadSummary {
  return {
    id: "thread-1",
    title: "Thread",
    workspacePath: "/repo",
    updatedAt: "2026-06-13T00:00:00.000Z",
    permissionMode: "read-only",
    collaborationMode: "chat",
    model: "ambient-model",
    thinkingLevel: "medium",
    memoryEnabled: true,
    ...overrides,
  } as ThreadSummary;
}

function desktopState(): DesktopState {
  return {
    activeThreadId: "thread-1",
    threads: [
      threadSummary({ id: "thread-1" }),
      threadSummary({ id: "thread-2" }),
    ],
    settings: {
      permissionMode: "read-only",
      collaborationMode: "chat",
      model: "ambient-model",
      thinkingLevel: "medium",
    },
  } as unknown as DesktopState;
}
