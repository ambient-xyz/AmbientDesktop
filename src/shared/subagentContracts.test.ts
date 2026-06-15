import { describe, expect, it } from "vitest";
import { resolveAmbientModelRuntimeProfile } from "./ambientModels";
import { DEFAULT_SUBAGENT_ROLE_PROFILES, getDefaultSubagentRoleProfile } from "./subagentRoles";
import {
  buildSubagentCanonicalPath,
  createSubagentRuntimeEvent,
  subagentResultCanBeSynthesized,
  validateSubagentResultArtifactForSynthesis,
} from "./subagentProtocol";
import { resolveSubagentToolScope } from "./subagentToolScope";

describe("sub-agent shared contracts", () => {
  it("builds stable canonical child paths", () => {
    expect(buildSubagentCanonicalPath({ parentPath: "root/0:explorer", roleId: "code reviewer", spawnIndex: 3 })).toBe("root/0:explorer/3:code-reviewer");
  });

  it("allows parent synthesis only from completed or explicit partial child results", () => {
    expect(subagentResultCanBeSynthesized({ status: "completed" })).toBe(true);
    expect(subagentResultCanBeSynthesized({ status: "failed" })).toBe(false);
    expect(subagentResultCanBeSynthesized({ status: "aborted_partial", partial: true })).toBe(true);
  });

  it("validates child result artifacts before parent synthesis", () => {
    expect(validateSubagentResultArtifactForSynthesis({
      schemaVersion: "ambient-subagent-result-artifact-v1",
      runId: "child-run",
      status: "completed",
      partial: false,
      summary: "Done",
      childThreadId: "child-thread",
    })).toMatchObject({
      valid: true,
      synthesisAllowed: true,
      partial: false,
      status: "completed",
    });
    expect(validateSubagentResultArtifactForSynthesis({
      schemaVersion: "ambient-subagent-result-artifact-v1",
      runId: "child-run",
      status: "failed",
      partial: false,
      summary: "Failed",
      childThreadId: "child-thread",
    })).toMatchObject({
      valid: true,
      synthesisAllowed: false,
      status: "failed",
    });
    expect(validateSubagentResultArtifactForSynthesis({
      schemaVersion: "ambient-subagent-result-artifact-v1",
      runId: "child-run",
      status: "aborted_partial",
      partial: true,
      summary: "Partial but useful",
      childThreadId: "child-thread",
    })).toMatchObject({
      valid: true,
      synthesisAllowed: true,
      partial: true,
      status: "aborted_partial",
    });
    expect(validateSubagentResultArtifactForSynthesis({
      schemaVersion: "ambient-subagent-result-artifact-v1",
      runId: "child-run",
      status: "completed",
      partial: false,
      summary: "",
      childThreadId: "child-thread",
    })).toMatchObject({
      valid: false,
      synthesisAllowed: false,
      reason: "Result artifact summary is empty.",
    });
  });

  it("builds runtime events with child-run attribution", () => {
    expect(createSubagentRuntimeEvent({
      run: {
        id: "child-run",
        parentThreadId: "parent-thread",
        parentRunId: "parent-run",
        childThreadId: "child-thread",
        canonicalTaskPath: "root/0:explorer",
      },
      source: "wait_agent",
      event: {
        type: "assistant_delta",
        textPreview: "Child streamed a useful update.",
        tokenCount: 12,
        createdAt: "2026-06-05T00:00:00.000Z",
      },
    })).toEqual({
      schemaVersion: "ambient-subagent-runtime-event-v1",
      type: "assistant_delta",
      source: "wait_agent",
      runId: "child-run",
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      childThreadId: "child-thread",
      canonicalTaskPath: "root/0:explorer",
      createdAt: "2026-06-05T00:00:00.000Z",
      textPreview: "Child streamed a useful update.",
      tokenCount: 12,
    });
  });

  it("resolves role, model, task, and workspace policy into visible tool scope", () => {
    const role = getDefaultSubagentRoleProfile("explorer");
    const model = resolveAmbientModelRuntimeProfile();
    const resolution = resolveSubagentToolScope({
      role,
      model,
      task: { requestedCategories: ["workspace.read", "browser.read", "workspace.write", "subagent.spawn"] },
      workspacePolicy: {
        hardDeniedCategories: ["browser.read"],
        approvalMode: "interactive",
        worktreeIsolated: false,
        allowNestedFanout: false,
      },
    });

    expect(resolution.loadedCategories).toEqual(["workspace.read"]);
    expect(resolution.piVisibleCategories).toEqual(["workspace.read"]);
    expect(resolution.deniedCategories).toEqual(expect.arrayContaining([
      { id: "browser.read", reason: "Denied by workspace or parent hard policy." },
      { id: "workspace.write", reason: "Denied by the selected sub-agent role." },
      { id: "subagent.spawn", reason: "Denied by the selected sub-agent role." },
    ]));
  });

  it("keeps default role tool categories aligned with the stable tool registry", () => {
    const model = resolveAmbientModelRuntimeProfile();

    for (const role of DEFAULT_SUBAGENT_ROLE_PROFILES) {
      expect(() => resolveSubagentToolScope({
        role,
        model,
        workspacePolicy: {
          hardDeniedCategories: [],
          approvalMode: "interactive",
          worktreeIsolated: true,
          allowNestedFanout: true,
        },
      })).not.toThrow();
    }
  });

  it("narrows default child tool scope by explicit file-read task intent", () => {
    const role = getDefaultSubagentRoleProfile("explorer");
    const model = resolveAmbientModelRuntimeProfile();
    const resolution = resolveSubagentToolScope({
      role,
      model,
      task: {
        childAuthority: {
          taskIntent: "file_read",
          readRoots: ["/Users/travis/Downloads/report.pdf"],
          mutation: "deny",
          network: "deny",
        },
      },
      workspacePolicy: {
        hardDeniedCategories: [],
        approvalMode: "interactive",
        worktreeIsolated: false,
        allowNestedFanout: false,
      },
    });

    expect(resolution.piVisibleCategories).toEqual(["workspace.read", "artifact.read", "long-context.read"]);
    expect(resolution.deniedCategories).toEqual(expect.arrayContaining([
      {
        id: "browser.read",
        reason: "Denied by child task intent file_read; allowed categories: workspace.read, artifact.read, long-context.read.",
      },
    ]));
  });

  it("denies toolful scopes for models without tool support", () => {
    const role = getDefaultSubagentRoleProfile("explorer");
    const model = resolveAmbientModelRuntimeProfile("custom/model");
    const resolution = resolveSubagentToolScope({
      role,
      model,
      workspacePolicy: {
        hardDeniedCategories: [],
        approvalMode: "interactive",
        worktreeIsolated: false,
        allowNestedFanout: false,
      },
    });

    expect(resolution.loadedCategories).toEqual(["artifact.read"]);
    expect(resolution.deniedCategories.map((item) => item.reason)).toContain("Selected model profile does not support tool use.");
  });

  it("keeps loaded capabilities separate from Pi-visible callables", () => {
    const explorer = getDefaultSubagentRoleProfile("explorer");
    const model = resolveAmbientModelRuntimeProfile();
    const resolution = resolveSubagentToolScope({
      role: {
        ...explorer,
        allowedToolCategories: [...explorer.allowedToolCategories, "mcp.direct"],
        deniedToolCategories: [],
        mutationPolicy: "requires_isolated_worktree",
      },
      model,
      task: { requestedCategories: ["mcp.direct"] },
      workspacePolicy: {
        hardDeniedCategories: [],
        approvalMode: "interactive",
        worktreeIsolated: true,
        allowNestedFanout: false,
      },
    });

    expect(resolution.loadedCategories).toEqual(["mcp.direct"]);
    expect(resolution.piVisibleCategories).toEqual([]);
  });

  it("snapshots exact tool grants by source as separate launch-time dimensions", () => {
    const explorer = getDefaultSubagentRoleProfile("explorer");
    const model = resolveAmbientModelRuntimeProfile();
    const resolution = resolveSubagentToolScope({
      role: {
        ...explorer,
        allowedToolCategories: [
          ...explorer.allowedToolCategories,
          "connector.read",
          "subagent.spawn",
        ],
        deniedToolCategories: [],
        nestedFanout: "role_gated",
      },
      model,
      task: {
        requestedSources: [
          { source: "extension_load", id: "npm:pi-subagents", categoryId: "workspace.read" },
          { source: "extension_tool", id: "pi-subagents.search", categoryId: "workspace.read" },
          { source: "connector_app", id: "gmail.search", categoryId: "connector.read", piVisible: false },
          { source: "skill", id: "openai-docs" },
        ],
        requestedFanout: true,
      },
      workspacePolicy: {
        hardDeniedCategories: [],
        approvalMode: "interactive",
        worktreeIsolated: false,
        allowNestedFanout: true,
      },
    });

    expect(resolution.loadedCategories).toEqual(["workspace.read", "connector.read", "subagent.spawn"]);
    expect(resolution.piVisibleCategories).toEqual(["workspace.read"]);
    expect(resolution.loadedTools.map((tool) => `${tool.source}:${tool.id}`)).toEqual([
      "extension_load:npm:pi-subagents",
      "extension_tool:pi-subagents.search",
      "connector_app:gmail.search",
      "skill:openai-docs",
      "fanout:subagent.spawn",
    ]);
    expect(resolution.piVisibleTools.map((tool) => `${tool.source}:${tool.id}`)).toEqual([
      "extension_tool:pi-subagents.search",
    ]);
    expect(resolution.fanoutAvailable).toBe(true);
  });

  it("denies Pi-visible requests for non-callable loaded sources", () => {
    const explorer = getDefaultSubagentRoleProfile("explorer");
    const model = resolveAmbientModelRuntimeProfile();
    const resolution = resolveSubagentToolScope({
      role: explorer,
      model,
      task: {
        requestedSources: [
          { source: "extension_load", id: "npm:pi-subagents", categoryId: "workspace.read", piVisible: true },
          { source: "skill", id: "openai-docs", piVisible: true },
        ],
      },
      workspacePolicy: {
        hardDeniedCategories: [],
        approvalMode: "interactive",
        worktreeIsolated: false,
        allowNestedFanout: false,
      },
    });

    expect(resolution.loadedTools).toEqual([]);
    expect(resolution.piVisibleTools).toEqual([]);
    expect(resolution.deniedTools).toEqual([
      {
        source: "extension_load",
        id: "npm:pi-subagents",
        categoryId: "workspace.read",
        reason: "Tool source loads context or capability metadata but is not a Pi-callable tool; surface exact callable tools separately.",
      },
      {
        source: "skill",
        id: "openai-docs",
        reason: "Tool source loads context or capability metadata but is not a Pi-callable tool; surface exact callable tools separately.",
      },
    ]);
  });

  it("denies Pi-visible direct MCP and connector sources until child-safe bridges exist", () => {
    const explorer = getDefaultSubagentRoleProfile("explorer");
    const model = resolveAmbientModelRuntimeProfile();
    const role = {
      ...explorer,
      allowedToolCategories: [...explorer.allowedToolCategories, "connector.read", "mcp.direct"],
      deniedToolCategories: [],
      mutationPolicy: "requires_isolated_worktree" as const,
    };
    const workspacePolicy = {
      hardDeniedCategories: [],
      approvalMode: "interactive" as const,
      worktreeIsolated: true,
      allowNestedFanout: false,
    };

    const denied = resolveSubagentToolScope({
      role,
      model,
      task: {
        requestedSources: [
          { source: "connector_app", id: "gmail.search", categoryId: "connector.read" },
          { source: "direct_mcp", id: "filesystem/read_file", categoryId: "mcp.direct", piVisible: true },
        ],
      },
      workspacePolicy,
    });

    expect(denied.loadedTools).toEqual([]);
    expect(denied.piVisibleTools).toEqual([]);
    expect(denied.deniedTools).toEqual([
      expect.objectContaining({
        source: "connector_app",
        id: "gmail.search",
        categoryId: "connector.read",
        reason: expect.stringContaining("child-safe bridge"),
      }),
      expect.objectContaining({
        source: "direct_mcp",
        id: "filesystem/read_file",
        categoryId: "mcp.direct",
        reason: expect.stringContaining("child-safe bridge"),
      }),
    ]);

    const nonVisible = resolveSubagentToolScope({
      role,
      model,
      task: {
        requestedSources: [
          { source: "connector_app", id: "gmail.search", categoryId: "connector.read", piVisible: false },
          { source: "direct_mcp", id: "filesystem/read_file", categoryId: "mcp.direct" },
        ],
      },
      workspacePolicy,
    });

    expect(nonVisible.loadedTools.map((tool) => `${tool.source}:${tool.id}:${tool.piVisible}`)).toEqual([
      "connector_app:gmail.search:false",
      "direct_mcp:filesystem/read_file:false",
    ]);
    expect(nonVisible.piVisibleTools).toEqual([]);
    expect(nonVisible.deniedTools).toEqual([]);
  });

  it("models callable workflow child scope separately and fails closed without bridge policy", () => {
    const explorer = getDefaultSubagentRoleProfile("explorer");
    const model = resolveAmbientModelRuntimeProfile();
    const role = {
      ...explorer,
      allowedToolCategories: [...explorer.allowedToolCategories, "workflow.call"],
      deniedToolCategories: [],
      nestedFanout: "role_gated" as const,
    };
    const workspacePolicy = {
      hardDeniedCategories: [],
      approvalMode: "interactive" as const,
      worktreeIsolated: false,
      allowNestedFanout: true,
    };

    const deniedVisible = resolveSubagentToolScope({
      role,
      model,
      task: {
        requestedSources: [
          {
            source: "callable_workflow",
            id: "ambient_workflow_symphony_map_reduce",
            categoryId: "workflow.call",
            piVisible: true,
          },
        ],
      },
      workspacePolicy,
    });

    expect(deniedVisible.loadedTools).toEqual([]);
    expect(deniedVisible.piVisibleTools).toEqual([]);
    expect(deniedVisible.deniedCategories).toEqual([
      {
        id: "workflow.call",
        reason: expect.stringContaining("child-safe workflow bridge"),
      },
    ]);
    expect(deniedVisible.deniedTools).toEqual([
      {
        source: "callable_workflow",
        id: "ambient_workflow_symphony_map_reduce",
        categoryId: "workflow.call",
        reason: expect.stringContaining("child-safe workflow bridge"),
      },
    ]);

    const nonVisibleWithoutBridge = resolveSubagentToolScope({
      role,
      model,
      task: {
        requestedSources: [
          {
            source: "callable_workflow",
            id: "ambient_workflow_recorded_date_night_v2",
            categoryId: "workflow.call",
            piVisible: false,
          },
        ],
      },
      workspacePolicy,
    });

    expect(nonVisibleWithoutBridge.loadedTools).toEqual([]);
    expect(nonVisibleWithoutBridge.deniedTools).toEqual([
      {
        source: "callable_workflow",
        id: "ambient_workflow_recorded_date_night_v2",
        categoryId: "workflow.call",
        reason: expect.stringContaining("child-safe workflow bridge"),
      },
    ]);
  });

  it("allows exact callable workflow child tools only through explicit bridge policy and remaining fanout", () => {
    const explorer = getDefaultSubagentRoleProfile("explorer");
    const model = resolveAmbientModelRuntimeProfile();
    const role = {
      ...explorer,
      allowedToolCategories: [...explorer.allowedToolCategories, "workflow.call"],
      deniedToolCategories: [],
      nestedFanout: "role_gated" as const,
    };
    const workspacePolicy = {
      hardDeniedCategories: [],
      approvalMode: "interactive" as const,
      worktreeIsolated: true,
      allowNestedFanout: true,
      callableWorkflowBridge: {
        allowCallableWorkflowTools: true,
        nestedFanoutLimit: 2,
        remainingFanout: 1,
        allowedToolNames: ["ambient_workflow_symphony_map_reduce"],
      },
    };

    const allowed = resolveSubagentToolScope({
      role,
      model,
      task: {
        requestedSources: [
          {
            source: "callable_workflow",
            id: "ambient_workflow_symphony_map_reduce",
            categoryId: "workflow.call",
            piVisible: true,
          },
        ],
      },
      workspacePolicy,
    });

    expect(allowed.loadedCategories).toEqual(["workflow.call"]);
    expect(allowed.piVisibleCategories).toEqual(["workflow.call"]);
    expect(allowed.piVisibleTools).toEqual([
      expect.objectContaining({
        source: "callable_workflow",
        id: "ambient_workflow_symphony_map_reduce",
        categoryId: "workflow.call",
        piVisible: true,
      }),
    ]);
    expect(allowed.deniedTools).toEqual([]);

    const outsideAllowlist = resolveSubagentToolScope({
      role,
      model,
      task: {
        requestedSources: [
          {
            source: "callable_workflow",
            id: "ambient_workflow_recorded_date_night_v2",
            categoryId: "workflow.call",
            piVisible: true,
          },
        ],
      },
      workspacePolicy,
    });

    expect(outsideAllowlist.loadedTools).toEqual([]);
    expect(outsideAllowlist.deniedTools).toEqual([
      {
        source: "callable_workflow",
        id: "ambient_workflow_recorded_date_night_v2",
        categoryId: "workflow.call",
        reason: "Callable workflow tool is outside the child role policy allowlist.",
      },
    ]);
  });

  it("requires nested fanout policy before a child can load callable workflow scope", () => {
    const explorer = getDefaultSubagentRoleProfile("explorer");
    const model = resolveAmbientModelRuntimeProfile();
    const resolution = resolveSubagentToolScope({
      role: {
        ...explorer,
        allowedToolCategories: [...explorer.allowedToolCategories, "workflow.call"],
        deniedToolCategories: [],
        nestedFanout: "disabled",
      },
      model,
      task: { requestedCategories: ["workflow.call"] },
      workspacePolicy: {
        hardDeniedCategories: [],
        approvalMode: "interactive",
        worktreeIsolated: false,
        allowNestedFanout: true,
      },
    });

    expect(resolution.loadedCategories).toEqual([]);
    expect(resolution.deniedCategories).toEqual([
      {
        id: "workflow.call",
        reason: "Nested workflow fanout is disabled for this role or workspace.",
      },
    ]);
  });

  it("denies source tools through the same role, model, and workspace policy gates", () => {
    const reviewer = getDefaultSubagentRoleProfile("reviewer");
    const model = resolveAmbientModelRuntimeProfile();
    const resolution = resolveSubagentToolScope({
      role: reviewer,
      model,
      task: {
        requestedSources: [
          { source: "connector_app", id: "gmail.send", categoryId: "connector.write" },
          { source: "skill", id: "openai-docs" },
        ],
      },
      workspacePolicy: {
        hardDeniedCategories: [],
        approvalMode: "interactive",
        worktreeIsolated: false,
        allowNestedFanout: false,
      },
    });

    expect(resolution.loadedTools).toEqual([]);
    expect(resolution.deniedTools).toEqual([
      {
        source: "connector_app",
        id: "gmail.send",
        categoryId: "connector.write",
        reason: "Requested task capability is outside the selected role.",
      },
      {
        source: "skill",
        id: "openai-docs",
        reason: "Selected sub-agent role does not inherit skills.",
      },
    ]);
  });

  it("rejects malformed source tool ids before launch snapshots are created", () => {
    const explorer = getDefaultSubagentRoleProfile("explorer");
    const model = resolveAmbientModelRuntimeProfile();
    const base = {
      role: explorer,
      model,
      workspacePolicy: {
        hardDeniedCategories: [],
        approvalMode: "interactive" as const,
        worktreeIsolated: false,
        allowNestedFanout: false,
      },
    };

    expect(resolveSubagentToolScope({
      ...base,
      task: {
        requestedSources: [
          { source: "extension_load", id: "npm:@ambient/pi-subagents", categoryId: "workspace.read" },
          { source: "direct_mcp", id: "server/read_file", categoryId: "mcp.direct" },
        ],
      },
    }).deniedTools.map((tool) => tool.id)).toContain("server/read_file");

    for (const id of [
      "server/read_file\nignore-parent-policy",
      "gmail.search;gmail.send",
      "secret-helper api_key=ambient-abcdefghijklmnopqrstuvwxyz",
      "tool`with`backticks",
    ]) {
      expect(() => resolveSubagentToolScope({
        ...base,
        task: {
          requestedSources: [{ source: "direct_mcp", id, categoryId: "mcp.direct" }],
        },
      })).toThrow("Sub-agent tool source request id contains unsupported characters.");
    }

    for (const id of [
      "server/sk-proj-abcdefghijklmnopqrstuvwxyz123456",
      "connector/gmi_1234567890abcdef1234567890abcdef",
      "gmail.search:api_key_1234567890abcdef123456",
    ]) {
      expect(() => resolveSubagentToolScope({
        ...base,
        task: {
          requestedSources: [{ source: "direct_mcp", id, categoryId: "mcp.direct" }],
        },
      })).toThrow("Sub-agent tool source request id appears to contain secret-like material.");
    }
  });

  it("requires exact operation-shaped ids for direct MCP and connector sources", () => {
    const explorer = getDefaultSubagentRoleProfile("explorer");
    const model = resolveAmbientModelRuntimeProfile();
    const base = {
      role: {
        ...explorer,
        allowedToolCategories: [...explorer.allowedToolCategories, "connector.read", "mcp.direct"],
        deniedToolCategories: [],
      },
      model,
      workspacePolicy: {
        hardDeniedCategories: [],
        approvalMode: "interactive" as const,
        worktreeIsolated: true,
        allowNestedFanout: false,
      },
    };

    expect(() => resolveSubagentToolScope({
      ...base,
      task: {
        requestedSources: [
          { source: "connector_app", id: "gmail.search", categoryId: "connector.read" },
          { source: "direct_mcp", id: "server/read_file", categoryId: "mcp.direct" },
        ],
      },
    })).not.toThrow();

    for (const id of ["gmail", "gmail/search", ".search", "gmail."]) {
      expect(() => resolveSubagentToolScope({
        ...base,
        task: {
          requestedSources: [{ source: "connector_app", id, categoryId: "connector.read" }],
        },
      })).toThrow("Connector tool source ids must use exact connector.operation ids.");
    }

    for (const id of ["server", "server.read_file", "/read_file", "server/"]) {
      expect(() => resolveSubagentToolScope({
        ...base,
        task: {
          requestedSources: [{ source: "direct_mcp", id, categoryId: "mcp.direct" }],
        },
      })).toThrow("Direct MCP tool source ids must use exact server/tool operation ids.");
    }

    for (const request of [
      { source: "connector_app" as const, id: "gmail.*", categoryId: "connector.read" as const },
      { source: "direct_mcp" as const, id: "server/*", categoryId: "mcp.direct" as const },
    ]) {
      expect(() => resolveSubagentToolScope({
        ...base,
        task: { requestedSources: [request] },
      })).toThrow("Sub-agent tool source request ids must not use wildcard grants.");
    }
  });

  it("applies hard policy to categorized skill context requests", () => {
    const explorer = getDefaultSubagentRoleProfile("explorer");
    const model = resolveAmbientModelRuntimeProfile();
    const resolution = resolveSubagentToolScope({
      role: explorer,
      model,
      task: {
        requestedSources: [
          { source: "skill", id: "secret-helper", categoryId: "secrets.read" },
        ],
      },
      workspacePolicy: {
        hardDeniedCategories: ["secrets.read"],
        approvalMode: "interactive",
        worktreeIsolated: false,
        allowNestedFanout: false,
      },
    });

    expect(resolution.loadedTools).toEqual([]);
    expect(resolution.deniedTools).toEqual([
      {
        source: "skill",
        id: "secret-helper",
        categoryId: "secrets.read",
        reason: "Denied by workspace or parent hard policy.",
      },
    ]);
  });

  it("denies approval-requiring child tools during non-interactive launches", () => {
    const explorer = getDefaultSubagentRoleProfile("explorer");
    const model = resolveAmbientModelRuntimeProfile();
    const resolution = resolveSubagentToolScope({
      role: {
        ...explorer,
        allowedToolCategories: [...explorer.allowedToolCategories, "connector.read"],
        deniedToolCategories: [],
      },
      model,
      task: { requestedCategories: ["connector.read"] },
      workspacePolicy: {
        hardDeniedCategories: [],
        approvalMode: "non_interactive",
        worktreeIsolated: false,
        allowNestedFanout: false,
      },
    });

    expect(resolution.loadedCategories).toEqual([]);
    expect(resolution.deniedCategories).toEqual([
      {
        id: "connector.read",
        reason: "Capability requires interactive approval, but this launch is non-interactive.",
      },
    ]);
  });

  it("allows non-interactive workspace writes only for explicit isolated-worktree child authority", () => {
    const worker = getDefaultSubagentRoleProfile("worker");
    const model = resolveAmbientModelRuntimeProfile();
    const allowed = resolveSubagentToolScope({
      role: worker,
      model,
      task: {
        requestedCategories: ["workspace.write"],
        childAuthority: {
          taskIntent: "mutation",
          mutation: "allow_isolated_worktree",
          writeRoots: ["."],
        },
      },
      workspacePolicy: {
        hardDeniedCategories: [],
        approvalMode: "non_interactive",
        worktreeIsolated: true,
        allowNestedFanout: false,
      },
    });

    expect(allowed.loadedCategories).toEqual(["workspace.write"]);
    expect(allowed.piVisibleCategories).toEqual(["workspace.write"]);
    expect(allowed.deniedCategories).toEqual([]);

    const denied = resolveSubagentToolScope({
      role: worker,
      model,
      task: { requestedCategories: ["workspace.write"] },
      workspacePolicy: {
        hardDeniedCategories: [],
        approvalMode: "non_interactive",
        worktreeIsolated: true,
        allowNestedFanout: false,
      },
    });

    expect(denied.loadedCategories).toEqual([]);
    expect(denied.deniedCategories).toEqual([
      {
        id: "workspace.write",
        reason: "Capability requires interactive approval, but this launch is non-interactive.",
      },
    ]);
  });

  it("denies nested fanout unless both role and workspace allow it", () => {
    const explorer = getDefaultSubagentRoleProfile("explorer");
    const model = resolveAmbientModelRuntimeProfile();
    const resolution = resolveSubagentToolScope({
      role: {
        ...explorer,
        allowedToolCategories: [...explorer.allowedToolCategories, "subagent.spawn"],
        deniedToolCategories: [],
        nestedFanout: "role_gated",
      },
      model,
      task: { requestedCategories: ["subagent.spawn"] },
      workspacePolicy: {
        hardDeniedCategories: [],
        approvalMode: "interactive",
        worktreeIsolated: false,
        allowNestedFanout: false,
      },
    });

    expect(resolution.loadedCategories).toEqual([]);
    expect(resolution.deniedCategories).toEqual([
      {
        id: "subagent.spawn",
        reason: "Nested sub-agent fanout is disabled for this role or workspace.",
      },
    ]);
  });
});
