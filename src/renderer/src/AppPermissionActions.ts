import type { Dispatch, SetStateAction } from "react";

import type { DesktopState } from "../../shared/desktopTypes";
import type { AmbientPermissionGrant, PermissionAuditEntry, PermissionMode, PermissionPromptResponseMode, PermissionRequest, PrivilegedCredentialRequest, SecureInputRequest } from "../../shared/permissionTypes";
import type { RunStatus, ThreadSummary } from "../../shared/threadTypes";
import { isRunStatusRunning } from "../../shared/runStatus";
import { permissionGrantRevocationImpact } from "./permissionGrantRegistryUiModel";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isDefaultCapabilityPermissionRequest(request: PermissionRequest): boolean {
  return request.toolName === "ambient_mcp_default_capability_install";
}

export function permissionRequestDisplayScore(
  request: PermissionRequest,
  activeThreadId: string,
  threadRunStatuses: Record<string, RunStatus>,
): number {
  let score = 0;
  if (request.threadId === activeThreadId) score += 1_000;
  if (isRunStatusRunning(threadRunStatuses[request.threadId] ?? "idle")) score += 500;
  if (isDefaultCapabilityPermissionRequest(request)) score -= 1_000;
  return score;
}

export function selectActivePermissionRequest(
  requests: PermissionRequest[],
  activeThreadId: string,
  threadRunStatuses: Record<string, RunStatus>,
): PermissionRequest | undefined {
  return requests
    .map((request, index) => ({ request, index, score: permissionRequestDisplayScore(request, activeThreadId, threadRunStatuses) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)[0]?.request;
}

export function mergePendingPermissionRequests(
  current: PermissionRequest[],
  pending: PermissionRequest[],
): PermissionRequest[] {
  const byId = new Map<string, PermissionRequest>();
  for (const request of current) byId.set(request.id, request);
  for (const request of pending) byId.set(request.id, request);
  const pendingIds = new Set(pending.map((request) => request.id));
  return [...byId.values()].filter((request) => pendingIds.has(request.id));
}

export function desktopStateWithUpdatedThreadSettings(
  state: DesktopState,
  thread: ThreadSummary,
): DesktopState {
  return {
    ...state,
    threads: state.threads.map((item) => (item.id === thread.id ? thread : item)),
    settings: {
      ...state.settings,
      permissionMode: thread.permissionMode,
      collaborationMode: thread.collaborationMode,
      model: thread.model,
      thinkingLevel: thread.thinkingLevel,
    },
  };
}

export function createAppPermissionActions({
  confirm = (message) => window.confirm(message),
  permissionAudit,
  permissionGrants,
  setPermissionAudit,
  setPermissionAuditError,
  setPermissionGrantError,
  setPermissionGrantRevoking,
  setPermissionGrants,
  setPermissionRequests,
  setPrivilegedCredentialRequests,
  setSecureInputRequests,
  setState,
  state,
}: {
  confirm?: (message: string) => boolean;
  permissionAudit: PermissionAuditEntry[];
  permissionGrants: AmbientPermissionGrant[];
  setPermissionAudit: Dispatch<SetStateAction<PermissionAuditEntry[]>>;
  setPermissionAuditError: Dispatch<SetStateAction<string | undefined>>;
  setPermissionGrantError: Dispatch<SetStateAction<string | undefined>>;
  setPermissionGrantRevoking: Dispatch<SetStateAction<string | undefined>>;
  setPermissionGrants: Dispatch<SetStateAction<AmbientPermissionGrant[]>>;
  setPermissionRequests: Dispatch<SetStateAction<PermissionRequest[]>>;
  setPrivilegedCredentialRequests: Dispatch<SetStateAction<PrivilegedCredentialRequest[]>>;
  setSecureInputRequests: Dispatch<SetStateAction<SecureInputRequest[]>>;
  setState: Dispatch<SetStateAction<DesktopState | undefined>>;
  state: DesktopState | undefined;
}): {
  loadPendingPermissionRequests: () => Promise<void>;
  loadPermissionAudit: () => Promise<void>;
  loadPermissionGrants: () => Promise<void>;
  requestThreadPermissionModeChange: (permissionMode: PermissionMode) => Promise<ThreadSummary | undefined>;
  respondPermissionRequest: (id: string, response: PermissionPromptResponseMode) => Promise<void>;
  respondPrivilegedCredentialRequest: (id: string, credential?: string) => Promise<void>;
  respondSecureInputRequest: (id: string, value?: string) => Promise<void>;
  revokePermissionGrant: (id: string) => Promise<void>;
  revokePermissionGrantIds: (ids: string[], busyId: string) => Promise<void>;
} {
  async function loadPermissionAudit() {
    setPermissionAuditError(undefined);
    try {
      setPermissionAudit(await window.ambientDesktop.listPermissionAudit());
    } catch (error) {
      setPermissionAuditError(errorMessage(error));
    }
  }

  async function loadPermissionGrants() {
    setPermissionGrantError(undefined);
    try {
      setPermissionGrants(await window.ambientDesktop.listPermissionGrants());
    } catch (error) {
      setPermissionGrantError(errorMessage(error));
    }
  }

  async function loadPendingPermissionRequests() {
    try {
      const pending = await window.ambientDesktop.listPendingPermissionRequests();
      setPermissionRequests((current) => mergePendingPermissionRequests(current, pending));
    } catch {
      // Pending prompts are also delivered by events; startup recovery should not block the app.
    }
  }

  async function revokePermissionGrant(id: string) {
    await revokePermissionGrantIds([id], id);
  }

  async function revokePermissionGrantIds(ids: string[], busyId: string) {
    if (!ids.length) return;
    const impact = permissionGrantRevocationImpact({ grants: permissionGrants, auditEntries: permissionAudit, grantIds: ids });
    if (impact && !confirm(`${impact.title}\n\n${impact.detail}`)) return;
    setPermissionGrantRevoking(busyId);
    setPermissionGrantError(undefined);
    try {
      for (const id of ids) {
        await window.ambientDesktop.revokePermissionGrant({ id });
      }
      await loadPermissionGrants();
      await loadPermissionAudit();
    } catch (error) {
      setPermissionGrantError(errorMessage(error));
    } finally {
      setPermissionGrantRevoking(undefined);
    }
  }

  async function requestThreadPermissionModeChange(permissionMode: PermissionMode) {
    if (!state) return undefined;
    const thread = await window.ambientDesktop.requestThreadPermissionModeChange({
      threadId: state.activeThreadId,
      permissionMode,
      reason: "Changed from the thread settings control.",
    });
    setState(desktopStateWithUpdatedThreadSettings(state, thread));
    return thread;
  }

  async function respondPermissionRequest(id: string, response: PermissionPromptResponseMode) {
    setPermissionRequests((requests) => requests.filter((request) => request.id !== id));
    await window.ambientDesktop.respondPermissionRequest(id, response);
  }

  async function respondPrivilegedCredentialRequest(id: string, credential?: string) {
    setPrivilegedCredentialRequests((requests) => requests.filter((request) => request.id !== id));
    await window.ambientDesktop.respondPrivilegedCredentialRequest({ id, credential, canceled: !credential });
  }

  async function respondSecureInputRequest(id: string, value?: string) {
    setSecureInputRequests((requests) => requests.filter((request) => request.id !== id));
    await window.ambientDesktop.respondSecureInputRequest({ id, value, canceled: !value });
  }

  return {
    loadPendingPermissionRequests,
    loadPermissionAudit,
    loadPermissionGrants,
    requestThreadPermissionModeChange,
    respondPermissionRequest,
    respondPrivilegedCredentialRequest,
    respondSecureInputRequest,
    revokePermissionGrant,
    revokePermissionGrantIds,
  };
}
