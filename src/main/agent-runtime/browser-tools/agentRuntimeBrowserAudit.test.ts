import { describe, expect, it, vi } from "vitest";

import type { PermissionAuditEntry } from "../../../shared/permissionTypes";
import { recordAgentRuntimeBrowserAudit } from "./agentRuntimeBrowserAudit";

describe("agentRuntimeBrowserAudit", () => {
  it("records and emits browser permission audits in Full Access mode", () => {
    const storedAudit = auditEntry();
    const addPermissionAudit = vi.fn(() => storedAudit);
    const emitPermissionAuditCreated = vi.fn();

    expect(recordAgentRuntimeBrowserAudit({
      threadId: "thread-1",
      toolName: "browser_nav",
      risk: "browser-network",
      detail: "https://example.com",
    }, {
      getThread: () => ({ permissionMode: "full-access" }),
      activeRunIdForThread: () => "run-1",
      addPermissionAudit,
      emitPermissionAuditCreated,
    })).toBe(storedAudit);

    expect(addPermissionAudit).toHaveBeenCalledWith({
      runId: "run-1",
      threadId: "thread-1",
      permissionMode: "full-access",
      toolName: "browser_nav",
      risk: "browser-network",
      decision: "allowed",
      detail: "https://example.com",
      reason: "Allowed Ambient browser tool invocation.",
    });
    expect(emitPermissionAuditCreated).toHaveBeenCalledWith(storedAudit);
  });

  it("does not record browser audits outside Full Access mode", () => {
    const addPermissionAudit = vi.fn();
    const emitPermissionAuditCreated = vi.fn();

    expect(recordAgentRuntimeBrowserAudit({
      threadId: "thread-1",
      toolName: "browser_nav",
      risk: "browser-network",
      detail: "https://example.com",
    }, {
      getThread: () => ({ permissionMode: "workspace" }),
      activeRunIdForThread: () => "run-1",
      addPermissionAudit,
      emitPermissionAuditCreated,
    })).toBeUndefined();

    expect(addPermissionAudit).not.toHaveBeenCalled();
    expect(emitPermissionAuditCreated).not.toHaveBeenCalled();
  });
});

function auditEntry(): PermissionAuditEntry {
  return {
    id: "audit-1",
    createdAt: "2026-06-12T00:00:00.000Z",
    runId: "run-1",
    threadId: "thread-1",
    permissionMode: "full-access",
    toolName: "browser_nav",
    risk: "browser-network",
    decision: "allowed",
    detail: "https://example.com",
    reason: "Allowed Ambient browser tool invocation.",
  };
}
