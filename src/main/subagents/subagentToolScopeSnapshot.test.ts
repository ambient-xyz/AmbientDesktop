import { describe, expect, it } from "vitest";
import type { SubagentToolScopeSnapshotSummary } from "../../shared/subagentTypes";
import {
  childAuthorityDisplayMetadata,
  callableWorkflowBridgeDisplayMetadata,
  compactSubagentToolScopeSnapshot,
  deniedCategoryIdsFromSubagentToolScopeSnapshot,
  deniedCategoryLabelsFromSubagentToolScopeSnapshot,
  deniedToolIdsFromSubagentToolScopeSnapshot,
  deniedToolLabelsFromSubagentToolScopeSnapshot,
  subagentToolScopeApprovalUnavailable,
  subagentToolScopeSnapshotDisplayMetadata,
} from "./subagentToolScopeSnapshot";

describe("subagentToolScopeSnapshot", () => {
  it("compacts exact launch scope and adds display metadata without dropping deny reasons", () => {
    const compact = compactSubagentToolScopeSnapshot(snapshot());

    expect(compact).toMatchObject({
      runId: "child-run",
      sequence: 1,
      schemaVersion: "ambient-subagent-tool-scope-v1",
      loadedCategories: ["workspace.read"],
      piVisibleCategories: ["workspace.read"],
      deniedCategories: [
        { id: "connector.read", reason: "Capability requires interactive approval, but this launch is non-interactive." },
      ],
      deniedTools: [
        {
          source: "connector_app",
          id: "gmail.search",
          categoryId: "connector.read",
          reason: "Capability requires interactive approval, but this launch is non-interactive.",
        },
      ],
      displayMetadata: {
        schemaVersion: "ambient-subagent-tool-scope-display-metadata-v1",
        approvalMode: "non_interactive",
        approvalUnavailable: true,
        loadedCategoryCount: 1,
        piVisibleCategoryCount: 1,
        deniedCategoryCount: 1,
        loadedToolCount: 1,
        piVisibleToolCount: 1,
        deniedToolCount: 1,
        deniedCategoryIds: ["connector.read"],
        deniedToolIds: ["connector_app:gmail.search"],
        deniedCategoryLabels: ["Connector Read (connector.read)"],
        deniedToolLabels: ["Connector App gmail.search / Connector Read (connector.read)"],
      },
    });
  });

  it("detects approval-unavailable state from persisted and compact snapshot shapes", () => {
    const persisted = snapshot();
    const compact = compactSubagentToolScopeSnapshot(persisted);

    expect(subagentToolScopeApprovalUnavailable(persisted)).toBe(true);
    expect(subagentToolScopeApprovalUnavailable(compact)).toBe(true);
    expect(subagentToolScopeSnapshotDisplayMetadata(compact).approvalUnavailable).toBe(true);
  });

  it("adds callable workflow bridge display metadata from resolver inputs", () => {
    const persisted = snapshot({
      schemaVersion: "ambient-subagent-tool-scope-resolver-input-v1",
      workspacePolicy: {
        schemaVersion: "ambient-subagent-tool-scope-launch-policy-v1",
        callableWorkflowBridge: {
          allowCallableWorkflowTools: true,
          nestedFanoutLimit: 3,
          remainingFanout: 2,
          allowedToolNames: ["ambient_workflow_symphony_map_reduce"],
          reason: "Callable workflow child bridge allowed by role policy with 2 nested fanout slots remaining.",
        },
      },
    });
    const compact = compactSubagentToolScopeSnapshot(persisted);

    expect(callableWorkflowBridgeDisplayMetadata(persisted)).toEqual({
      status: "enabled",
      allowCallableWorkflowTools: true,
      nestedFanoutLimit: 3,
      remainingFanout: 2,
      allowedToolNames: ["ambient_workflow_symphony_map_reduce"],
      allowedToolCount: 1,
      reason: "Callable workflow child bridge allowed by role policy with 2 nested fanout slots remaining.",
    });
    expect(compact.displayMetadata.callableWorkflowBridge).toEqual({
      status: "enabled",
      allowCallableWorkflowTools: true,
      nestedFanoutLimit: 3,
      remainingFanout: 2,
      allowedToolNames: ["ambient_workflow_symphony_map_reduce"],
      allowedToolCount: 1,
      reason: "Callable workflow child bridge allowed by role policy with 2 nested fanout slots remaining.",
    });
    expect(callableWorkflowBridgeDisplayMetadata(compact)).toEqual(compact.displayMetadata.callableWorkflowBridge);
  });

  it("adds compact child authority display metadata from resolver inputs", () => {
    const persisted = snapshot({
      schemaVersion: "ambient-subagent-tool-scope-resolver-input-v1",
      childAuthorityProfile: {
        schemaVersion: "ambient-subagent-child-authority-profile-v1",
        childRunId: "child-run",
        childThreadId: "child-thread",
        canonicalTaskPath: "root/1:reader",
        roleId: "explorer",
        taskIntent: "file_read",
        rationale: "Read selected Downloads files only.",
        outerEnvelope: {
          parentThreadId: "parent-thread",
          parentPermissionMode: "full",
          parentWorkspacePath: "/Users/travis/Downloads",
          approvalMode: "interactive",
          worktreeIsolationStatus: "missing",
        },
        resourceScopes: {
          filesystem: {
            readRoots: ["/Users/travis/Downloads/a.pdf", "/Users/travis/Downloads/a.pdf"],
            writeRoots: [],
            deniedWriteRoots: ["/Users/travis/Downloads"],
            readDecision: "allow",
            writeDecision: "deny",
          },
          browser: {
            domains: ["example.com"],
            networkDecision: "ask_parent",
          },
          connectors: {
            methods: ["gmail.search"],
            decision: "ask_parent",
          },
          nestedFanout: {
            decision: "deny",
            remainingFanout: 0,
          },
        },
        approvalRouting: {
          route: "parent",
          mode: "interactive",
          childThreadId: "child-thread",
        },
      },
    });
    const compact = compactSubagentToolScopeSnapshot(persisted);

    expect(compact.displayMetadata.childAuthorityProfile).toEqual({
      schemaVersion: "ambient-subagent-child-authority-display-metadata-v1",
      status: "present",
      childRunId: "child-run",
      childThreadId: "child-thread",
      canonicalTaskPath: "root/1:reader",
      roleId: "explorer",
      taskIntent: "file_read",
      rationale: "Read selected Downloads files only.",
      filesystem: {
        readRoots: ["/Users/travis/Downloads/a.pdf"],
        writeRoots: [],
        deniedWriteRoots: ["/Users/travis/Downloads"],
        readRootCount: 1,
        writeRootCount: 0,
        deniedWriteRootCount: 1,
        readDecision: "allow",
        writeDecision: "deny",
      },
      browser: {
        domains: ["example.com"],
        domainCount: 1,
        networkDecision: "ask_parent",
      },
      connectors: {
        methods: ["gmail.search"],
        methodCount: 1,
        decision: "ask_parent",
      },
      nestedFanout: {
        decision: "deny",
        remainingFanout: 0,
      },
      approvalRouting: {
        route: "parent",
        mode: "interactive",
        childThreadId: "child-thread",
      },
      outerEnvelope: {
        parentThreadId: "parent-thread",
        parentPermissionMode: "full",
        parentWorkspacePath: "/Users/travis/Downloads",
        approvalMode: "interactive",
        worktreeIsolationStatus: "missing",
      },
    });
    expect(childAuthorityDisplayMetadata(compact)).toEqual(compact.displayMetadata.childAuthorityProfile);
  });

  it("extracts unique denied ids from compact, persisted, and legacy payloads", () => {
    const persisted = snapshot();
    const compact = compactSubagentToolScopeSnapshot(persisted);
    const legacyPayload = {
      deniedCategories: [
        { id: "connector.read", reason: "one" },
        { id: "connector.read", reason: "duplicate" },
      ],
      deniedTools: [
        { source: "connector_app", id: "gmail.search", reason: "one" },
        { source: "connector_app", id: "gmail.search", reason: "duplicate" },
        { id: "raw-tool", reason: "legacy" },
      ],
    };

    expect(deniedCategoryIdsFromSubagentToolScopeSnapshot(persisted)).toEqual(["connector.read"]);
    expect(deniedToolIdsFromSubagentToolScopeSnapshot(compact)).toEqual(["connector_app:gmail.search"]);
    expect(deniedCategoryIdsFromSubagentToolScopeSnapshot(legacyPayload)).toEqual(["connector.read"]);
    expect(deniedToolIdsFromSubagentToolScopeSnapshot(legacyPayload)).toEqual([
      "connector_app:gmail.search",
      "raw-tool",
    ]);
  });

  it("extracts readable denied labels from compact, persisted, and legacy payloads", () => {
    const persisted = snapshot();
    const compact = compactSubagentToolScopeSnapshot(persisted);
    const legacyPayload = {
      deniedCategories: [
        { id: "workflow.call", reason: "one" },
        { id: "workflow.call", reason: "duplicate" },
      ],
      deniedTools: [
        {
          source: "callable_workflow",
          id: "ambient_workflow_symphony_map_reduce",
          categoryId: "workflow.call",
          reason: "one",
        },
        { id: "raw-tool", reason: "legacy" },
      ],
    };

    expect(deniedCategoryLabelsFromSubagentToolScopeSnapshot(persisted)).toEqual(["Connector Read (connector.read)"]);
    expect(deniedToolLabelsFromSubagentToolScopeSnapshot(compact)).toEqual([
      "Connector App gmail.search / Connector Read (connector.read)",
    ]);
    expect(deniedCategoryLabelsFromSubagentToolScopeSnapshot(legacyPayload)).toEqual(["Workflow Call (workflow.call)"]);
    expect(deniedToolLabelsFromSubagentToolScopeSnapshot(legacyPayload)).toEqual([
      "Callable Workflow ambient_workflow_symphony_map_reduce / Workflow Call (workflow.call)",
      "raw-tool",
    ]);
  });
});

function snapshot(resolverInputs: unknown = {
  schemaVersion: "ambient-subagent-tool-scope-resolver-input-v1",
}): SubagentToolScopeSnapshotSummary {
  return {
    runId: "child-run",
    sequence: 1,
    createdAt: "2026-06-05T12:00:00.000Z",
    resolverInputs,
    scope: {
      schemaVersion: "ambient-subagent-tool-scope-v1",
      loadedCategories: ["workspace.read"],
      piVisibleCategories: ["workspace.read"],
      deniedCategories: [
        { id: "connector.read", reason: "Capability requires interactive approval, but this launch is non-interactive." },
      ],
      loadedTools: [
        {
          source: "extension_tool",
          id: "workspace.read_file",
          categoryId: "workspace.read",
          piVisible: true,
          mutatesState: false,
          requiresApproval: false,
        },
      ],
      piVisibleTools: [
        {
          source: "extension_tool",
          id: "workspace.read_file",
          categoryId: "workspace.read",
          piVisible: true,
          mutatesState: false,
          requiresApproval: false,
        },
      ],
      deniedTools: [
        {
          source: "connector_app",
          id: "gmail.search",
          categoryId: "connector.read",
          reason: "Capability requires interactive approval, but this launch is non-interactive.",
        },
      ],
      approvalMode: "non_interactive",
      worktreeIsolated: false,
      fanoutAvailable: false,
    },
  };
}
