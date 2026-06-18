import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import type { AmbientPermissionGrant, PermissionAuditEntry } from "../../shared/permissionTypes";
import {
  buildFirstPartyPluginPermissionAudit,
  buildFirstPartyPluginPermissionRequest,
  emitFirstPartyPluginPermissionAudit,
  firstPartyPluginPermissionGrantHash,
  resolveFirstPartyPluginPermission,
  type FirstPartyPluginPermissionAuditInput,
  type FirstPartyPluginPermissionWaitFinish,
  type FirstPartyPluginPermissionWaitStart,
} from "./agentRuntimeFirstPartyPluginPermission";
import { ProjectStore } from "../projectStore/projectStore";

describe("agentRuntimeFirstPartyPluginPermission", () => {
  it("builds first-party plugin permission requests with existing grant hash shape", () => {
    expect(buildFirstPartyPluginPermissionRequest({
      thread: { id: "thread-1" },
      toolName: "ambient_cli",
      title: "Run Ambient CLI package?",
      message: "Run package.",
      detail: "Package: fixture",
      grantTargetLabel: "Run Ambient CLI fixture:echo",
      grantTargetIdentity: "ambient_cli\0fixture\0echo",
      grantConditions: { packageId: "fixture" },
    })).toEqual({
      threadId: "thread-1",
      toolName: "ambient_cli",
      title: "Run Ambient CLI package?",
      message: "Run package.",
      detail: "Package: fixture",
      risk: "plugin-tool",
      reusableScopes: undefined,
      grantActionKind: "plugin_tool_execute",
      grantTargetKind: "tool",
      grantTargetLabel: "Run Ambient CLI fixture:echo",
      grantTargetHash: sha256("plugin_tool_execute\0tool\0ambient_cli\0fixture\0echo"),
      grantConditions: { packageId: "fixture" },
    });
  });

  it("preserves explicit risk, reusable scopes, and label fallback identity", () => {
    expect(buildFirstPartyPluginPermissionRequest({
      thread: { id: "thread-2" },
      toolName: "ambient_local_deep_research_run",
      title: "Exceed local model memory ceiling?",
      message: "A Local Deep Research launch would exceed memory.",
      detail: "Projected estimate: 24GB.",
      risk: "privileged-action",
      reusableScopes: ["thread"],
      grantTargetLabel: "local-model-memory-ceiling",
    })).toMatchObject({
      risk: "privileged-action",
      reusableScopes: ["thread"],
      grantTargetHash: firstPartyPluginPermissionGrantHash("local-model-memory-ceiling"),
    });
  });

  it("builds first-party plugin permission audit entries with existing defaults", () => {
    expect(buildFirstPartyPluginPermissionAudit({
      runId: "run-1",
      threadId: "thread-1",
      permissionMode: "workspace",
      toolName: "ambient_cli",
      allowed: true,
      detail: "Package: fixture",
      reason: "Allowed by test.",
      decisionSource: "prompt_allow_once",
      grantId: "grant-1",
    })).toEqual({
      runId: "run-1",
      threadId: "thread-1",
      permissionMode: "workspace",
      toolName: "ambient_cli",
      risk: "plugin-tool",
      decision: "allowed",
      detail: "Package: fixture",
      reason: "Allowed by test.",
      decisionSource: "prompt_allow_once",
      grantId: "grant-1",
    });
  });

  it("preserves denied audits and explicit risk", () => {
    expect(buildFirstPartyPluginPermissionAudit({
      threadId: "thread-2",
      permissionMode: "full-access",
      toolName: "ambient_privileged_action_request",
      allowed: false,
      detail: "Purpose: create_system_symlink",
      risk: "privileged-action",
      reason: "Denied by test.",
      decisionSource: "denied_by_user",
    })).toMatchObject({
      risk: "privileged-action",
      decision: "denied",
      decisionSource: "denied_by_user",
    });
  });

  it("stores and emits first-party plugin permission audit entries with the active run id", () => {
    const storedAudit: PermissionAuditEntry = {
      id: "audit-1",
      createdAt: "2026-06-12T00:00:00.000Z",
      runId: "run-1",
      threadId: "thread-1",
      permissionMode: "workspace",
      toolName: "ambient_cli",
      risk: "plugin-tool",
      decision: "allowed",
      detail: "Package: fixture",
      reason: "Allowed by test.",
      decisionSource: "prompt_allow_once",
      grantId: "grant-1",
    };
    const addPermissionAudit = vi.fn(() => storedAudit);
    const emitPermissionAuditCreated = vi.fn();

    expect(emitFirstPartyPluginPermissionAudit({
      threadId: "thread-1",
      permissionMode: "workspace",
      toolName: "ambient_cli",
      allowed: true,
      detail: "Package: fixture",
      reason: "Allowed by test.",
      decisionSource: "prompt_allow_once",
      grantId: "grant-1",
    }, {
      activeRunIdForThread: () => "run-1",
      addPermissionAudit,
      emitPermissionAuditCreated,
    })).toBe(storedAudit);

    expect(addPermissionAudit).toHaveBeenCalledWith({
      runId: "run-1",
      threadId: "thread-1",
      permissionMode: "workspace",
      toolName: "ambient_cli",
      risk: "plugin-tool",
      decision: "allowed",
      detail: "Package: fixture",
      reason: "Allowed by test.",
      decisionSource: "prompt_allow_once",
      grantId: "grant-1",
    });
    expect(emitPermissionAuditCreated).toHaveBeenCalledWith(storedAudit);
  });

  it("allows full access without prompting and emits the existing audit shape", async () => {
    const { store, workspacePath, root } = await openTempStore();
    const audits: Array<Omit<FirstPartyPluginPermissionAuditInput, "runId">> = [];
    const grantEvents: AmbientPermissionGrant[] = [];

    try {
      const allowed = await resolveFirstPartyPluginPermission({
        thread: { id: "thread-full-access", permissionMode: "full-access" },
        workspace: { path: workspacePath },
        toolName: "ambient_cli",
        title: "Run Ambient CLI package?",
        message: "Run package.",
        detail: "Package: fixture",
        grantTargetLabel: "Run Ambient CLI fixture:echo",
        allowedReason: "Approved by test.",
        deniedReason: "Denied by test.",
      }, {
        store,
        requestPermission: async () => {
          throw new Error("Full Access should not prompt.");
        },
        emitPermissionAudit: (audit) => audits.push(audit),
        emitPermissionGrantCreated: (grant) => grantEvents.push(grant),
      });

      expect(allowed).toBe(true);
      expect(audits).toEqual([{
        threadId: "thread-full-access",
        permissionMode: "full-access",
        toolName: "ambient_cli",
        allowed: true,
        detail: "Package: fixture",
        risk: "plugin-tool",
        reason: "Allowed automatically by Full Access mode.",
        decisionSource: "allowed_by_full_access",
      }]);
      expect(grantEvents).toEqual([]);
      expect(store.listPermissionGrants()).toEqual([]);
    } finally {
      store.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("tracks prompt wait lifecycle and emits audits for newly-created grants", async () => {
    const { store, workspacePath, root } = await openTempStore();
    const thread = store.updateThreadSettings(store.createThread("permissions").id, { permissionMode: "workspace" });
    const audits: Array<Omit<FirstPartyPluginPermissionAuditInput, "runId">> = [];
    const grantEvents: AmbientPermissionGrant[] = [];
    const waits: Array<{ threadId: string; wait: FirstPartyPluginPermissionWaitStart }> = [];
    const finishes: Array<FirstPartyPluginPermissionWaitFinish | undefined> = [];

    try {
      const allowed = await resolveFirstPartyPluginPermission({
        thread,
        workspace: { path: workspacePath },
        toolName: "ambient_cli",
        title: "Run Ambient CLI package?",
        message: "Run package.",
        detail: "Package: fixture",
        reusableScopes: ["thread"],
        grantTargetLabel: "Run Ambient CLI fixture:echo",
        grantTargetIdentity: "ambient_cli\0fixture\0echo",
        grantConditions: { packageId: "fixture" },
        allowedReason: "Ambient CLI package approved.",
        deniedReason: "Ambient CLI package denied.",
      }, {
        store,
        requestPermission: async (request, options) => {
          options?.onRequest?.({ id: "permission-request-1", ...request });
          return { allowed: true, mode: "always_thread" };
        },
        beginPermissionWait: (threadId, wait) => {
          waits.push({ threadId, wait });
          return (finish) => finishes.push(finish);
        },
        emitPermissionAudit: (audit) => audits.push(audit),
        emitPermissionGrantCreated: (grant) => grantEvents.push(grant),
      });

      expect(allowed).toBe(true);
      expect(waits).toEqual([{
        threadId: thread.id,
        wait: {
          toolName: "ambient_cli",
          requestId: "permission-request-1",
          title: "Run Ambient CLI package?",
          detail: "Package: fixture",
          risk: "plugin-tool",
        },
      }]);
      expect(finishes).toEqual([{ allowed: true, mode: "always_thread" }]);
      expect(grantEvents).toHaveLength(1);
      expect(store.listPermissionGrants()).toEqual([
        expect.objectContaining({
          id: grantEvents[0]!.id,
          scopeKind: "thread",
          threadId: thread.id,
          targetLabel: "Run Ambient CLI fixture:echo",
        }),
      ]);
      expect(audits).toEqual([
        expect.objectContaining({
          threadId: thread.id,
          permissionMode: "workspace",
          toolName: "ambient_cli",
          allowed: true,
          reason: "Ambient CLI package approved.",
          decisionSource: "prompt_always_thread",
          grantId: grantEvents[0]!.id,
        }),
      ]);
    } finally {
      store.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function openTempStore(): Promise<{ store: ProjectStore; root: string; workspacePath: string }> {
  const root = await mkdtemp(join(tmpdir(), "ambient-first-party-plugin-permission-"));
  const workspacePath = join(root, "workspace");
  const store = new ProjectStore();
  store.openWorkspace(workspacePath);
  return { store, root, workspacePath };
}
