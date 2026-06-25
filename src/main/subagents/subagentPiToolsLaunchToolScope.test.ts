import { afterEach, describe, expect, it, vi } from "vitest";
import { getDefaultSubagentRoleProfile } from "../../shared/subagentRoles";
import { createAgentRoleRegistry } from "./subagentAgentFacade";
import { ProjectStore } from "./subagentProjectStoreFacade";
import { createSubagentPiToolDefinitions } from "./subagentPiTools";
import { cleanupTempWorkspaces, enabledFlags, executeTool, tempWorkspace } from "./subagentPiToolsTestSupport";

afterEach(cleanupTempWorkspaces);

describe("ambient_subagent Pi tool launch tool-scope boundaries", () => {
  it("records non-interactive approval mode in launch tool-scope snapshots", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
      });

      const spawned = await executeTool(tool, "spawn-noninteractive", {
        action: "spawn_agent",
        task: "Read a single file without asking for approval.",
        roleId: "explorer",
        toolScope: {
          requestedCategories: ["workspace.read"],
          approvalMode: "non_interactive",
        },
        idempotencyKey: "spawn:noninteractive",
      });
      const runId = (spawned.details as any).run.id as string;
      const [snapshot] = store.listSubagentToolScopeSnapshots(runId);

      expect(snapshot.scope).toMatchObject({
        approvalMode: "non_interactive",
        loadedCategories: ["workspace.read"],
        piVisibleCategories: ["workspace.read"],
      });
      expect(snapshot.resolverInputs).toMatchObject({
        requestedApprovalMode: "non_interactive",
        workspacePolicy: {
          approvalMode: "non_interactive",
        },
      });
      expect((spawned.details as any).toolScopeSnapshot).toMatchObject({
        approvalMode: "non_interactive",
      });
    } finally {
      store.close();
    }
  });

  it("reports non-interactive approval-unavailable launch denials to the parent mailbox", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const runtime = { startChildRun: vi.fn() };
    const explorer = getDefaultSubagentRoleProfile("explorer");
    const roleRegistry = createAgentRoleRegistry([
      {
        ...explorer,
        allowedToolCategories: [...explorer.allowedToolCategories, "connector.read"],
      },
    ]);
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
        roleRegistry,
        runtime,
      });

      const spawned = await executeTool(tool, "spawn-noninteractive-approval", {
        action: "spawn_agent",
        task: "Search Gmail without asking the user for approval.",
        roleId: "explorer",
        toolScope: {
          connectorTools: [{ id: "gmail.search", categoryId: "connector.read", piVisible: true }],
          approvalMode: "non_interactive",
        },
        idempotencyKey: "spawn:noninteractive-approval-unavailable",
      });
      const run = store.getSubagentRun((spawned.details as any).run.id);
      const [snapshot] = store.listSubagentToolScopeSnapshots(run.id);

      expect(runtime.startChildRun).not.toHaveBeenCalled();
      expect(run).toMatchObject({
        status: "failed",
        resultArtifact: expect.objectContaining({
          status: "failed",
          partial: false,
          summary: expect.stringContaining("Capability requires interactive approval"),
        }),
      });
      expect(snapshot.scope).toMatchObject({
        approvalMode: "non_interactive",
        loadedTools: [],
        piVisibleTools: [],
        deniedTools: [
          {
            source: "connector_app",
            id: "gmail.search",
            categoryId: "connector.read",
            reason: "Capability requires interactive approval, but this launch is non-interactive.",
          },
        ],
      });
      expect(store.listSubagentRunEvents(run.id)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "subagent.spawn_rejected",
            preview: expect.objectContaining({
              failureStage: "tool_scope",
              approvalUnavailable: true,
            }),
          }),
        ]),
      );
      const [failure] = store.listSubagentParentMailboxEventsForParentRun(parentRun.id);
      expect(failure).toMatchObject({
        type: "subagent.spawn_failed",
        deliveryState: "queued",
        idempotencyKey: "spawn:noninteractive-approval-unavailable",
        parentMessageId: assistant.id,
        payload: expect.objectContaining({
          schemaVersion: "ambient-subagent-spawn-failure-v1",
          failureStage: "tool_scope",
          approvalMode: "non_interactive",
          approvalUnavailable: true,
          parentThreadId: parent.id,
          parentRunId: parentRun.id,
          parentMessageId: assistant.id,
          childRunId: run.id,
          childThreadId: run.childThreadId,
          canonicalTaskPath: run.canonicalTaskPath,
          toolCallId: "spawn-noninteractive-approval",
          requestedRoleId: "explorer",
          roleId: "explorer",
          reason: expect.stringContaining("Capability requires interactive approval"),
          toolScopeSnapshot: expect.objectContaining({
            approvalMode: "non_interactive",
            deniedTools: [
              expect.objectContaining({
                source: "connector_app",
                id: "gmail.search",
                categoryId: "connector.read",
              }),
            ],
          }),
          resultArtifact: expect.objectContaining({
            status: "failed",
            partial: false,
          }),
        }),
      });
      expect((spawned.details as any).spawnFailureParentMailbox).toMatchObject({
        id: failure.id,
        type: "subagent.spawn_failed",
        parentMessageId: assistant.id,
      });

      const replay = await executeTool(tool, "spawn-noninteractive-approval-retry", {
        action: "spawn_agent",
        task: "Search Gmail without asking the user for approval.",
        roleId: "explorer",
        toolScope: {
          connectorTools: [{ id: "gmail.search", categoryId: "connector.read", piVisible: true }],
          approvalMode: "non_interactive",
        },
        idempotencyKey: "spawn:noninteractive-approval-unavailable",
      });
      expect((replay.details as any).status).toBe("idempotent_replay");
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)).toHaveLength(1);
    } finally {
      store.close();
    }
  });

  it("records visible failed children for Pi-visible connector tools without child-safe bridges", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const runtime = { startChildRun: vi.fn() };
    const explorer = getDefaultSubagentRoleProfile("explorer");
    const roleRegistry = createAgentRoleRegistry([
      {
        ...explorer,
        allowedToolCategories: [...explorer.allowedToolCategories, "connector.read"],
      },
    ]);
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
        roleRegistry,
        runtime,
      });

      const spawned = await executeTool(tool, "spawn-connector-no-child-bridge", {
        action: "spawn_agent",
        task: "Search Gmail from a child session.",
        roleId: "explorer",
        toolScope: {
          connectorTools: [{ id: "gmail.search", categoryId: "connector.read" }],
        },
        idempotencyKey: "spawn:connector-no-child-bridge",
      });
      const run = store.getSubagentRun((spawned.details as any).run.id);
      const [snapshot] = store.listSubagentToolScopeSnapshots(run.id);

      expect(runtime.startChildRun).not.toHaveBeenCalled();
      expect(run).toMatchObject({
        status: "failed",
        resultArtifact: expect.objectContaining({
          status: "failed",
          partial: false,
          summary: expect.stringContaining("child-safe bridge"),
        }),
      });
      expect(snapshot.scope).toMatchObject({
        approvalMode: "interactive",
        loadedTools: [],
        piVisibleTools: [],
        deniedTools: [
          {
            source: "connector_app",
            id: "gmail.search",
            categoryId: "connector.read",
            reason: expect.stringContaining("child-safe bridge"),
          },
        ],
      });
      const [failure] = store.listSubagentParentMailboxEventsForParentRun(parentRun.id);
      expect(failure).toMatchObject({
        type: "subagent.spawn_failed",
        deliveryState: "queued",
        idempotencyKey: "spawn:connector-no-child-bridge",
        parentMessageId: assistant.id,
        payload: expect.objectContaining({
          schemaVersion: "ambient-subagent-spawn-failure-v1",
          failureStage: "tool_scope",
          approvalUnavailable: false,
          reason: expect.stringContaining("child-safe bridge"),
          toolScopeSnapshot: expect.objectContaining({
            deniedTools: [
              expect.objectContaining({
                source: "connector_app",
                id: "gmail.search",
                categoryId: "connector.read",
              }),
            ],
          }),
        }),
      });

      const replay = await executeTool(tool, "spawn-connector-no-child-bridge-retry", {
        action: "spawn_agent",
        task: "Search Gmail from a child session.",
        roleId: "explorer",
        toolScope: {
          connectorTools: [{ id: "gmail.search", categoryId: "connector.read" }],
        },
        idempotencyKey: "spawn:connector-no-child-bridge",
      });
      expect((replay.details as any).status).toBe("idempotent_replay");
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)).toHaveLength(1);
    } finally {
      store.close();
    }
  });

  it("records exact source-level tool scope requests in launch snapshots", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
      });

      const spawned = await executeTool(tool, "spawn-source-tools", {
        action: "spawn_agent",
        task: "Inspect one file using a surfaced extension tool and a skill.",
        roleId: "explorer",
        toolScope: {
          surfacedExtensionTools: [{ id: "pi-subagents.search", categoryId: "workspace.read" }],
          skills: [{ id: "openai-docs" }],
        },
        idempotencyKey: "spawn:source-tools",
      });
      const runId = (spawned.details as any).run.id as string;
      const [snapshot] = store.listSubagentToolScopeSnapshots(runId);

      expect(snapshot.scope.loadedCategories).toEqual(["workspace.read"]);
      expect(snapshot.scope.loadedTools.map((item) => `${item.source}:${item.id}`)).toEqual([
        "extension_tool:pi-subagents.search",
        "skill:openai-docs",
      ]);
      expect(snapshot.scope.piVisibleTools.map((item) => `${item.source}:${item.id}`)).toEqual(["extension_tool:pi-subagents.search"]);
      expect(snapshot.resolverInputs).toMatchObject({
        requestedSources: [
          { source: "extension_tool", id: "pi-subagents.search", categoryId: "workspace.read" },
          { source: "skill", id: "openai-docs" },
        ],
      });
      expect((spawned.details as any).toolScopeSnapshot).toMatchObject({
        loadedTools: expect.arrayContaining([
          expect.objectContaining({ source: "extension_tool", id: "pi-subagents.search" }),
          expect.objectContaining({ source: "skill", id: "openai-docs" }),
        ]),
      });
    } finally {
      store.close();
    }
  });

  it("accepts surfaced extension tools registered in the launch catalog", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
        availableExtensionToolNames: ["pi-subagents.search"],
      });

      const spawned = await executeTool(tool, "spawn-available-extension-tool", {
        action: "spawn_agent",
        task: "Inspect one file using the exact registered plugin MCP tool.",
        roleId: "explorer",
        toolScope: {
          surfacedExtensionTools: [{ id: "pi-subagents.search", categoryId: "workspace.read" }],
        },
        idempotencyKey: "spawn:available-extension-tool",
      });
      const runId = (spawned.details as any).run.id as string;
      const [snapshot] = store.listSubagentToolScopeSnapshots(runId);

      expect(snapshot.scope.piVisibleTools).toEqual([
        expect.objectContaining({
          source: "extension_tool",
          id: "pi-subagents.search",
          categoryId: "workspace.read",
          piVisible: true,
        }),
      ]);
      expect(snapshot.resolverInputs).toMatchObject({
        availableExtensionToolNames: ["pi-subagents.search"],
      });
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)).toEqual([]);
    } finally {
      store.close();
    }
  });

  it("rejects unavailable surfaced extension tools before reserving a child run", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
        availableExtensionToolNames: ["pi-subagents.search"],
      });

      await expect(
        executeTool(tool, "spawn-missing-extension-tool", {
          action: "spawn_agent",
          task: "Inspect one file using a misspelled plugin MCP tool.",
          roleId: "explorer",
          toolScope: {
            surfacedExtensionTools: [{ id: "pi-subagents.serach", categoryId: "workspace.read" }],
          },
          idempotencyKey: "spawn:missing-extension-tool",
        }),
      ).rejects.toThrow(/Requested sub-agent extension tools are unavailable/);
      await expect(
        executeTool(tool, "spawn-missing-extension-tool-retry", {
          action: "spawn_agent",
          task: "Inspect one file using a misspelled plugin MCP tool.",
          roleId: "explorer",
          toolScope: {
            surfacedExtensionTools: [{ id: "pi-subagents.serach", categoryId: "workspace.read" }],
          },
          idempotencyKey: "spawn:missing-extension-tool",
        }),
      ).rejects.toThrow(/Requested sub-agent extension tools are unavailable/);

      expect(store.listSubagentRunsForParentThread(parent.id)).toEqual([]);
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)).toEqual([
        expect.objectContaining({
          type: "subagent.spawn_failed",
          deliveryState: "queued",
          idempotencyKey: "spawn:missing-extension-tool",
          parentMessageId: assistant.id,
          payload: expect.objectContaining({
            schemaVersion: "ambient-subagent-spawn-failure-v1",
            failureStage: "tool_scope",
            parentThreadId: parent.id,
            parentRunId: parentRun.id,
            parentMessageId: assistant.id,
            toolCallId: "spawn-missing-extension-tool",
            requestedRoleId: "explorer",
            roleId: "explorer",
            reason: expect.stringContaining("pi-subagents.serach"),
            unavailableExtensionTools: [{ id: "pi-subagents.serach", categoryId: "workspace.read" }],
          }),
        }),
      ]);
      expect(store.getSubagentObservabilitySummary({ parentRunId: parentRun.id })).toMatchObject({
        spawnAttempts: 1,
        failedSpawns: 1,
      });
    } finally {
      store.close();
    }
  });

  it("rejects secret-shaped source-level tool ids before reserving a child run", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
      });

      await expect(
        executeTool(tool, "spawn-secret-source-id", {
          action: "spawn_agent",
          task: "Inspect one file using a direct MCP tool.",
          roleId: "explorer",
          toolScope: {
            directMcpTools: [{ id: "server/sk-proj-abcdefghijklmnopqrstuvwxyz123456", categoryId: "mcp.direct" }],
          },
          idempotencyKey: "spawn:secret-source-id",
        }),
      ).rejects.toThrow("Sub-agent tool source request id appears to contain secret-like material.");

      expect(store.listSubagentRunsForParentThread(parent.id)).toEqual([]);
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)).toEqual([]);
    } finally {
      store.close();
    }
  });

  it("rejects broad connector and direct MCP source ids before reserving a child run", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
      });

      await expect(
        executeTool(tool, "spawn-broad-connector-source-id", {
          action: "spawn_agent",
          task: "Inspect Gmail with a connector tool.",
          roleId: "explorer",
          toolScope: {
            connectorTools: [{ id: "gmail", categoryId: "connector.read" }],
          },
          idempotencyKey: "spawn:broad-connector-source-id",
        }),
      ).rejects.toThrow("Connector tool source ids must use exact connector.operation ids.");

      await expect(
        executeTool(tool, "spawn-broad-mcp-source-id", {
          action: "spawn_agent",
          task: "Inspect a file with direct MCP.",
          roleId: "explorer",
          toolScope: {
            directMcpTools: [{ id: "filesystem", categoryId: "mcp.direct" }],
          },
          idempotencyKey: "spawn:broad-mcp-source-id",
        }),
      ).rejects.toThrow("Direct MCP tool source ids must use exact server/tool operation ids.");

      expect(store.listSubagentRunsForParentThread(parent.id)).toEqual([]);
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)).toEqual([]);
    } finally {
      store.close();
    }
  });

  it("rejects unknown exact built-in child tools before reserving a child run", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
      });

      await expect(
        executeTool(tool, "spawn-unknown-built-in-child-tool", {
          action: "spawn_agent",
          task: "Inspect one file with a misspelled built-in tool.",
          roleId: "explorer",
          toolScope: {
            builtInTools: [{ id: "reed", categoryId: "workspace.read" }],
          },
          idempotencyKey: "spawn:unknown-built-in-child-tool",
        }),
      ).rejects.toThrow("Unknown or unsupported built-in child tool");

      await expect(
        executeTool(tool, "spawn-unactivatable-test-run-tool", {
          action: "spawn_agent",
          task: "Run a test with a shell-shaped built-in tool from the test category.",
          roleId: "reviewer",
          toolScope: {
            builtInTools: [{ id: "bash", categoryId: "test.run" }],
          },
          idempotencyKey: "spawn:unactivatable-test-run-tool",
        }),
      ).rejects.toThrow("No exact built-in child tools are currently activatable for test.run");

      expect(store.listSubagentRunsForParentThread(parent.id)).toEqual([]);
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)).toEqual([]);
    } finally {
      store.close();
    }
  });

  it("records a visible failed child when non-callable sources request Pi visibility", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
      });

      const spawned = await executeTool(tool, "spawn-noncallable-visible-source", {
        action: "spawn_agent",
        task: "Inspect one file using a prompt skill.",
        roleId: "explorer",
        toolScope: {
          skills: [{ id: "openai-docs", piVisible: true }],
        },
        idempotencyKey: "spawn:noncallable-visible-source",
      });

      const run = store.getSubagentRun((spawned.details as any).run.id);
      const [snapshot] = store.listSubagentToolScopeSnapshots(run.id);

      expect(run.status).toBe("failed");
      expect(store.listSubagentMailboxEvents(run.id)).toEqual([]);
      expect(snapshot.scope).toMatchObject({
        loadedTools: [],
        piVisibleTools: [],
        deniedTools: [
          {
            source: "skill",
            id: "openai-docs",
            reason:
              "Tool source loads context or capability metadata but is not a Pi-callable tool; surface exact callable tools separately.",
          },
        ],
      });
      expect(spawned.details as any).toMatchObject({
        status: "failed",
        orchestrationStarted: false,
        toolScopeSnapshot: {
          deniedTools: [
            expect.objectContaining({
              source: "skill",
              id: "openai-docs",
            }),
          ],
        },
      });
      expect(
        store
          .listMessages(run.childThreadId)
          .map((message) => message.content)
          .join("\n"),
      ).toContain("surface exact callable tools separately");
    } finally {
      store.close();
    }
  });

  it("rejects mistyped tool-scope categories instead of falling back to defaults", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
      });

      await expect(
        executeTool(tool, "spawn-typo", {
          action: "spawn_agent",
          task: "Inspect one file.",
          roleId: "explorer",
          toolScope: {
            requestedCategories: ["workspace.red"],
          },
        }),
      ).rejects.toThrow(/Unknown sub-agent tool category/);
    } finally {
      store.close();
    }
  });
});
