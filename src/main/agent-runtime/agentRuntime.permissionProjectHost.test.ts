import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createAmbientModelRuntimeSnapshot } from "../../shared/ambientModels";
import { resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import type { PermissionMode } from "../../shared/permissionTypes";
import { sttMessageMetadataFromTranscription } from "../../shared/sttMessageMetadata";
import { AgentRuntime } from "./agentRuntime";
import { ProjectStore } from "./agentRuntimeProjectStoreFacade";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("AgentRuntime permission gate", () => {
  it("evaluates tool-call permissions against the current thread mode", async () => {
    let thread = {
      id: "thread-current-permission-gate",
      title: "current permission gate",
      permissionMode: "workspace" as PermissionMode,
      collaborationMode: "agent" as const,
      model: "ambient-preview",
      thinkingLevel: "medium" as const,
    };
    const workspace = { path: "/tmp/ambient-current-permission-workspace", statePath: "/tmp/ambient-current-permission-state" };
    const auditEntries: any[] = [];
    const store = {
      getThread: vi.fn(() => thread),
      getWorkspace: vi.fn(() => workspace),
      getProjectArtifactWorkspacePath: vi.fn(() => workspace.path),
      getProjectBoardDependencyWorkspacePathsForExecutionThread: vi.fn(() => []),
      listMessages: vi.fn(() => []),
      listPermissionGrants: vi.fn(() => []),
      createPermissionGrant: vi.fn(),
      addPermissionAudit: vi.fn((entry: any) => {
        const auditEntry = { id: `audit-${auditEntries.length + 1}`, createdAt: "2026-05-25T00:00:00.000Z", ...entry };
        auditEntries.push(auditEntry);
        return auditEntry;
      }),
      addMessage: vi.fn((message: any) => ({ id: `message-${auditEntries.length + 1}`, createdAt: "2026-05-25T00:00:00.000Z", ...message })),
    };
    const requester = vi.fn(async () => ({ allowed: false, mode: "deny" as const }));
    const runtime = new AgentRuntime(store as any, {} as any, {} as any, () => undefined, {
      request: requester,
      denyThread: () => undefined,
    });
    let toolCallHandler: ((event: any) => Promise<{ block: true; reason: string } | undefined>) | undefined;
    const pi = {
      on: vi.fn((eventName: string, handler: typeof toolCallHandler) => {
        if (eventName === "tool_call") toolCallHandler = handler;
      }),
    };
    (runtime as any).createPermissionGateExtension(thread.id, workspace)(pi);
    expect(toolCallHandler).toBeDefined();
    const handleToolCall = toolCallHandler!;

    thread = { ...thread, permissionMode: "full-access" };
    await expect(
      handleToolCall({
        toolName: "file_read",
        input: { path: "/tmp/outside-current-permission.txt" },
      }),
    ).resolves.toBeUndefined();
    expect(requester).not.toHaveBeenCalled();

    thread = { ...thread, permissionMode: "workspace" };
    await expect(
      handleToolCall({
        toolName: "file_read",
        input: { path: "/tmp/outside-current-permission.txt" },
      }),
    ).resolves.toEqual({ block: true, reason: "Blocked by Ambient Desktop permission policy." });
    await expect(
      handleToolCall({
        toolName: "ambient_visual_minicpm_setup",
        input: { provider: "minicpm-v", action: "stop" },
      }),
    ).resolves.toEqual({
      block: true,
      reason: "User denied MiniCPM-V Stop. The provider remains installed and the local MiniCPM-V runtime was not stopped.",
    });
    await expect(
      handleToolCall({
        toolName: "ambient_visual_minicpm_setup",
        input: { provider: "minicpm-v", action: "uninstall" },
      }),
    ).resolves.toEqual({
      block: true,
      reason: "User denied MiniCPM-V uninstall. No MiniCPM-V package, runtime, or cache files were removed.",
    });
    await expect(
      handleToolCall({
        toolName: "ambient_local_model_runtime_start",
        input: { runtimeId: "local-text-runtime" },
      }),
    ).resolves.toEqual({
      block: true,
      reason: "User denied local model runtime Start for local-text-runtime. The runtime was not started.",
    });
    await expect(
      handleToolCall({
        toolName: "ambient_local_model_runtime_stop",
        input: { runtimeId: "local-text-runtime", force: true },
      }),
    ).resolves.toEqual({
      block: true,
      reason: "User denied local model runtime forced Stop for local-text-runtime. The runtime was not stopped.",
    });
    await expect(
      handleToolCall({
        toolName: "ambient_local_model_runtime_restart",
        input: { runtimeId: "local-text-runtime", force: true },
      }),
    ).resolves.toEqual({
      block: true,
      reason: "User denied local model runtime forced Restart for local-text-runtime. The runtime was not restarted.",
    });
    expect(requester).toHaveBeenCalledTimes(6);
    expect(auditEntries).toEqual([
      expect.objectContaining({
        threadId: thread.id,
        permissionMode: "workspace",
        toolName: "file_read",
        risk: "outside-workspace",
        decision: "denied",
      }),
      expect.objectContaining({
        threadId: thread.id,
        permissionMode: "workspace",
        toolName: "ambient_visual_minicpm_setup",
        risk: "workspace-command",
        decision: "denied",
      }),
      expect.objectContaining({
        threadId: thread.id,
        permissionMode: "workspace",
        toolName: "ambient_visual_minicpm_setup",
        risk: "workspace-command",
        decision: "denied",
      }),
      expect.objectContaining({
        threadId: thread.id,
        permissionMode: "workspace",
        toolName: "ambient_local_model_runtime_start",
        risk: "workspace-command",
        decision: "denied",
      }),
      expect.objectContaining({
        threadId: thread.id,
        permissionMode: "workspace",
        toolName: "ambient_local_model_runtime_stop",
        risk: "workspace-command",
        decision: "denied",
      }),
      expect.objectContaining({
        threadId: thread.id,
        permissionMode: "workspace",
        toolName: "ambient_local_model_runtime_restart",
        risk: "workspace-command",
        decision: "denied",
      }),
    ]);
  });

});

describe("AgentRuntime project host concurrency", () => {
  it("stamps browser updates with the runtime project workspace", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-browser-scope-"));
    const store = new ProjectStore();
    const emitted: any[] = [];
    try {
      store.openWorkspace(workspacePath);
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

      (runtime as any).emit({
        type: "browser-updated",
        state: {
          running: false,
          profileMode: "isolated",
          runtime: "internal",
          internalAvailable: true,
          copiedProfileAvailable: false,
          chromeAvailable: false,
          browserLoginBrokerAvailable: false,
        },
      });

      expect(emitted).toContainEqual(expect.objectContaining({ type: "browser-updated", workspacePath }));
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("stamps workflow lifecycle updates with the runtime project workspace", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-workflow-scope-"));
    const store = new ProjectStore();
    const emitted: any[] = [];
    try {
      store.openWorkspace(workspacePath);
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

      (runtime as any).emit({ type: "workflow-updated" });
      (runtime as any).emit({
        type: "workflow-run-started",
        runId: "run-1",
        artifactId: "artifact-1",
      });

      expect(emitted).toEqual([
        expect.objectContaining({ type: "workflow-updated", workspacePath }),
        expect.objectContaining({ type: "workflow-run-started", workspacePath }),
      ]);
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("stamps permission audit and grant updates with the runtime project workspace", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-permission-event-scope-"));
    const store = new ProjectStore();
    const emitted: any[] = [];
    try {
      store.openWorkspace(workspacePath);
      const thread = store.createThread("permission event scope");
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
      const entry = store.addPermissionAudit({
        threadId: thread.id,
        permissionMode: thread.permissionMode,
        toolName: "ambient_cli",
        risk: "plugin-tool",
        decision: "allowed",
        detail: "Permission event scope test.",
        reason: "Allowed by test.",
      });
      const grant = store.createPermissionGrant({
        permissionModeAtCreation: thread.permissionMode,
        scopeKind: "workspace",
        threadId: thread.id,
        workspacePath,
        actionKind: "plugin_tool_execute",
        targetKind: "tool",
        targetLabel: "Run Ambient CLI test:scope",
        targetHash: "permission-event-scope",
        source: "permission_prompt",
        reason: "Allowed by test.",
      });

      (runtime as any).emit({ type: "permission-audit-created", entry });
      (runtime as any).emit({ type: "permission-grant-created", grant });

      expect(emitted).toEqual([
        expect.objectContaining({ type: "permission-audit-created", workspacePath }),
        expect.objectContaining({ type: "permission-grant-created", workspacePath }),
      ]);
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("stamps planner artifact updates with the runtime project workspace", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-planner-event-scope-"));
    const store = new ProjectStore();
    const emitted: any[] = [];
    try {
      store.openWorkspace(workspacePath);
      const thread = store.createThread("planner event scope");
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
      const artifact = { id: "planner-artifact-1", threadId: thread.id } as any;

      (runtime as any).emit({ type: "planner-plan-artifact-created", artifact });
      (runtime as any).emit({ type: "planner-plan-artifact-updated", artifact });

      expect(emitted).toEqual([
        expect.objectContaining({ type: "planner-plan-artifact-created", workspacePath }),
        expect.objectContaining({ type: "planner-plan-artifact-updated", workspacePath }),
      ]);
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("lets an in-flight chat run finish in its original project host after another project opens", async () => {
    const projectAPath = await mkdtemp(join(tmpdir(), "ambient-runtime-project-a-"));
    const projectBPath = await mkdtemp(join(tmpdir(), "ambient-runtime-project-b-"));
    const storeA = new ProjectStore();
    const storeB = new ProjectStore();
    try {
      const workspaceA = storeA.openWorkspace(projectAPath);
      storeB.openWorkspace(projectBPath);
      const threadA = storeA.createThread("project A run");
      const sessionFile = join(workspaceA.sessionPath, threadA.id, "session.jsonl");
      await mkdir(join(workspaceA.sessionPath, threadA.id), { recursive: true });
      await writeFile(sessionFile, "", "utf8");

      const subscribers: Array<(event: any) => void> = [];
      const emit = (event: any) => {
        for (const subscriber of [...subscribers]) subscriber(event);
      };
      const finalText = "Project A finished while Project B was active.";
      let releasePrompt: (() => void) | undefined;
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
          releasePrompt = () => {
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
          };
        })),
        steer: vi.fn(async () => undefined),
        compact: vi.fn(async () => undefined),
        agent: {
          abort: vi.fn(),
          waitForIdle: vi.fn(async () => undefined),
        },
      };
      const runtimeA = new AgentRuntime(storeA, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });
      vi.spyOn(runtimeA as any, "getSession").mockResolvedValue(session);

      const sendPromise = runtimeA.send({
        threadId: threadA.id,
        content: "Keep working while I switch projects.",
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: "ambient-preview",
        thinkingLevel: "medium",
        delivery: "prompt",
        context: [],
      });
      for (let attempt = 0; attempt < 20 && !releasePrompt; attempt += 1) await delay(0);
      expect(releasePrompt).toBeDefined();
      expect(storeA.listActiveRuns()).toHaveLength(1);

      storeB.openWorkspace(projectBPath);
      expect(storeB.listActiveRuns()).toEqual([]);

      releasePrompt?.();
      await sendPromise;

      expect(storeA.listActiveRuns()).toEqual([]);
      expect(storeA.listMessages(threadA.id)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          role: "assistant",
          content: finalText,
          metadata: expect.objectContaining({ status: "done" }),
        }),
      ]));
      const projectBThread = storeB.listThreads()[0];
      expect(storeB.listMessages(projectBThread.id).map((message) => message.content)).not.toContain(finalText);
    } finally {
      storeA.close();
      storeB.close();
      await rm(projectAPath, { recursive: true, force: true });
      await rm(projectBPath, { recursive: true, force: true });
    }
  });

  it("keeps queued active-run messages in the original project after another project opens", async () => {
    const projectAPath = await mkdtemp(join(tmpdir(), "ambient-runtime-queued-project-a-"));
    const projectBPath = await mkdtemp(join(tmpdir(), "ambient-runtime-queued-project-b-"));
    const storeA = new ProjectStore();
    const storeB = new ProjectStore();
    try {
      const workspaceA = storeA.openWorkspace(projectAPath);
      storeB.openWorkspace(projectBPath);
      const threadA = storeA.createThread("project A queued run");
      const sessionFile = join(workspaceA.sessionPath, threadA.id, "session.jsonl");
      await mkdir(join(workspaceA.sessionPath, threadA.id), { recursive: true });
      await writeFile(sessionFile, "", "utf8");

      const emitted: any[] = [];
      const subscribers: Array<(event: any) => void> = [];
      const emit = (event: any) => {
        for (const subscriber of [...subscribers]) subscriber(event);
      };
      const queuedText = "Queue this while Project B is active.";
      const finalText = "Project A completed after the queued message.";
      let releasePrompt: (() => void) | undefined;
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
          releasePrompt = () => {
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
          };
        })),
        steer: vi.fn(async () => {
          emit({ type: "queue_update", steering: [], followUp: [] });
        }),
        compact: vi.fn(async () => undefined),
        agent: {
          abort: vi.fn(),
          waitForIdle: vi.fn(async () => undefined),
        },
      };
      const runtimeA = new AgentRuntime(
        storeA,
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
      vi.spyOn(runtimeA as any, "getSession").mockResolvedValue(session);

      const sendPromise = runtimeA.send({
        threadId: threadA.id,
        content: "Keep working while I switch projects.",
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: "ambient-preview",
        thinkingLevel: "medium",
        delivery: "prompt",
        context: [],
      });
      for (let attempt = 0; attempt < 20 && !releasePrompt; attempt += 1) await delay(0);
      expect(releasePrompt).toBeDefined();

      storeB.openWorkspace(projectBPath);
      await runtimeA.send({
        threadId: threadA.id,
        content: queuedText,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: "ambient-preview",
        thinkingLevel: "medium",
        delivery: "prompt",
        context: [],
      });
      for (let attempt = 0; attempt < 20 && session.steer.mock.calls.length === 0; attempt += 1) await delay(0);
      expect(session.steer).toHaveBeenCalledWith(queuedText, undefined);

      releasePrompt?.();
      await sendPromise;

      expect(storeA.listMessages(threadA.id)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          role: "user",
          content: queuedText,
          metadata: expect.objectContaining({ status: "sent", delivery: "steer" }),
        }),
        expect.objectContaining({
          role: "assistant",
          content: finalText,
          metadata: expect.objectContaining({ status: "done" }),
        }),
      ]));
      const projectBThread = storeB.listThreads()[0];
      expect(storeB.listMessages(projectBThread.id).map((message) => message.content)).not.toEqual(
        expect.arrayContaining([queuedText, finalText]),
      );
      expect(emitted).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "message-created",
          workspacePath: projectAPath,
          message: expect.objectContaining({ content: queuedText }),
        }),
        expect.objectContaining({
          type: "queue-updated",
          workspacePath: projectAPath,
          queue: expect.objectContaining({ threadId: threadA.id }),
        }),
      ]));
    } finally {
      storeA.close();
      storeB.close();
      await rm(projectAPath, { recursive: true, force: true });
      await rm(projectBPath, { recursive: true, force: true });
    }
  });
});

describeNative("AgentRuntime first-party plugin permissions", () => {
  it("uses persistent permission grants for first-party plugin tools", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-permissions-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const thread = store.updateThreadSettings(store.createThread("permissions").id, { permissionMode: "workspace" });
      const requester = vi.fn(async () => ({ allowed: true, mode: "always_workspace" as const }));
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: requester,
        denyThread: () => undefined,
      });
      const input = {
        thread,
        workspace: store.getWorkspace(),
        toolName: "ambient_cli",
        title: "Run Ambient CLI?",
        message: "Run command.",
        detail: "Package: brave-search\nCommand: search",
        grantTargetLabel: "Run Ambient CLI brave-search:search",
        grantTargetIdentity: "ambient_cli\0brave-search\0search",
        allowedReason: "Allowed.",
        deniedReason: "Denied.",
      };

      await expect((runtime as any).resolveFirstPartyPluginPermission(input)).resolves.toBe(true);
      await expect((runtime as any).resolveFirstPartyPluginPermission(input)).resolves.toBe(true);

      expect(requester).toHaveBeenCalledTimes(1);
      expect(store.listPermissionGrants()).toEqual([
        expect.objectContaining({
          scopeKind: "workspace",
          actionKind: "plugin_tool_execute",
          targetKind: "tool",
          targetLabel: "Run Ambient CLI brave-search:search",
        }),
      ]);
      expect(store.listPermissionAudit(10)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ toolName: "ambient_cli", decision: "allowed", decisionSource: "prompt_always_workspace" }),
          expect.objectContaining({ toolName: "ambient_cli", decision: "allowed", decisionSource: "persistent_grant" }),
        ]),
      );
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("auto-allows first-party plugin prompts in full access without opening a prompt", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-full-access-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const created = store.createThread("full access");
      const thread = store.updateThreadSettings(created.id, { permissionMode: "full-access" });
      const requester = vi.fn(async () => {
        throw new Error("Unexpected permission prompt.");
      });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: requester,
        denyThread: () => undefined,
      });

      await expect(
        (runtime as any).resolveFirstPartyPluginPermission({
          thread,
          workspace: store.getWorkspace(),
          toolName: "ambient_cli_package_install",
          title: "Install CLI package?",
          message: "Install package.",
          detail: "Package: brave-search",
          grantTargetLabel: "Install Ambient CLI package brave-search",
          allowedReason: "Allowed.",
          deniedReason: "Denied.",
        }),
      ).resolves.toBe(true);

      expect(requester).not.toHaveBeenCalled();
      expect(store.listPermissionAudit(10)).toEqual([
        expect.objectContaining({
          toolName: "ambient_cli_package_install",
          decision: "allowed",
          decisionSource: "allowed_by_full_access",
        }),
      ]);
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("requires a fresh prompt for non-bypassable MCP actions even in full access", async () => {
    const auditEntries: any[] = [];
    const workspace = { path: "/tmp/ambient-runtime-mcp-full-access" };
    const store = {
      getWorkspace: () => workspace,
      listPermissionGrants: vi.fn(() => []),
      createPermissionGrant: vi.fn(),
      addPermissionAudit: vi.fn((entry) => {
        const auditEntry = { id: `audit-${auditEntries.length + 1}`, createdAt: "2026-05-23T00:00:00.000Z", ...entry };
        auditEntries.push(auditEntry);
        return auditEntry;
      }),
    };
    const thread = {
      id: "thread-full-access-mcp",
      permissionMode: "full-access",
      workspacePath: workspace.path,
    };
    const requester = vi.fn(async () => ({ allowed: true, mode: "always_workspace" as const }));
    const runtime = new AgentRuntime(store as any, {} as any, {} as any, () => undefined, {
      request: requester,
      denyThread: () => undefined,
    });

    await expect(
      (runtime as any).resolveFirstPartyPluginPermission({
        thread,
        workspace,
        toolName: "ambient_mcp_server_install",
        title: "Install MCP server?",
        message: "Install server.",
        detail: "Server: Context7\nCommand shape: thv run ...",
        grantTargetLabel: "Install MCP server Context7",
        grantTargetIdentity: "ambient_mcp_server_install\0io.github.stacklok/context7\0ambient-context7",
        requireFreshPrompt: true,
        allowedReason: "Allowed.",
        deniedReason: "Denied.",
      }),
    ).resolves.toBe(true);

    expect(requester).toHaveBeenCalledTimes(1);
    expect(requester).toHaveBeenCalledWith(expect.objectContaining({
      toolName: "ambient_mcp_server_install",
      reusableScopes: [],
    }));
    expect(store.createPermissionGrant).not.toHaveBeenCalled();
    expect(auditEntries).toEqual([
      expect.objectContaining({
        toolName: "ambient_mcp_server_install",
        decision: "allowed",
        decisionSource: "prompt_allow_once",
      }),
    ]);
  });

  it("records privileged action prompts with a dedicated non-reusable risk", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-privileged-permissions-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const thread = store.updateThreadSettings(store.createThread("privileged").id, { permissionMode: "workspace" });
      const requester = vi.fn(async () => ({ allowed: true, mode: "always_workspace" as const }));
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: requester,
        denyThread: () => undefined,
      });

      await expect(
        (runtime as any).resolveFirstPartyPluginPermission({
          thread,
          workspace: store.getWorkspace(),
          toolName: "ambient_privileged_action_request",
          title: "Review privileged action?",
          message: "Review request.",
          detail: "Purpose: create_system_symlink",
          risk: "privileged-action",
          reusableScopes: [],
          grantTargetLabel: "Privileged action create_system_symlink",
          grantTargetIdentity: "ambient_privileged_action_request\0create_system_symlink",
          allowedReason: "Allowed.",
          deniedReason: "Denied.",
        }),
      ).resolves.toBe(true);

      expect(requester).toHaveBeenCalledWith(expect.objectContaining({
        risk: "privileged-action",
        reusableScopes: [],
        grantActionKind: "plugin_tool_execute",
        grantTargetKind: "tool",
      }));
      expect(store.listPermissionGrants()).toEqual([]);
      expect(store.listPermissionAudit(10)).toEqual([
        expect.objectContaining({
          toolName: "ambient_privileged_action_request",
          risk: "privileged-action",
          decision: "allowed",
          decisionSource: "prompt_allow_once",
        }),
      ]);
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("revokes first-party plugin grants by target label prefix during uninstall", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-grant-revoke-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });
      const baseGrant = {
        permissionModeAtCreation: "workspace" as const,
        scopeKind: "workspace" as const,
        workspacePath,
        actionKind: "plugin_tool_execute" as const,
        targetKind: "tool" as const,
        targetHash: "hash",
        source: "permission_prompt" as const,
        reason: "Allowed by test.",
      };
      const runGrant = store.createPermissionGrant({
        ...baseGrant,
        targetLabel: "Run Pi extension pi-arxiv:arxiv_paper",
      });
      const otherGrant = store.createPermissionGrant({
        ...baseGrant,
        targetHash: "other-hash",
        targetLabel: "Run Ambient CLI brave-search:search",
      });

      expect((runtime as any).revokePluginGrantsForLabels(["Run Pi extension pi-arxiv"])).toBe(1);

      expect(store.listPermissionGrants()).toEqual([expect.objectContaining({ id: otherGrant.id })]);
      expect(store.listPermissionGrants({ includeRevoked: true })).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: runGrant.id, revokedAt: expect.any(String) }),
          expect.objectContaining({ id: otherGrant.id, revokedAt: undefined }),
        ]),
      );
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("marks in-flight runs interrupted before runtime detaches from a workspace", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-interrupt-"));
    const store = new ProjectStore();
    const emitted: any[] = [];
    try {
      store.openWorkspace(workspacePath);
      const thread = store.createThread("interrupt");
      const assistant = store.addMessage({
        threadId: thread.id,
        role: "assistant",
        content: "",
        metadata: { status: "streaming", runtime: "pi" },
      });
      store.startRun({ threadId: thread.id, assistantMessageId: assistant.id });
      const detach = vi.fn();
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
      (runtime as any).activeRuns.set(thread.id, {
        abort: vi.fn(),
        detach,
        queue: vi.fn(),
      });

      expect(runtime.interruptActiveRuns("Run interrupted because the active project changed.")).toBe(1);

      expect(detach).toHaveBeenCalledTimes(1);
      expect(store.listActiveRuns()).toEqual([]);
      expect(store.listMessages(thread.id)).toEqual([
        expect.objectContaining({
          id: assistant.id,
          content: "Run interrupted because the active project changed.",
          metadata: expect.objectContaining({ status: "interrupted" }),
        }),
      ]);
      expect(emitted).toContainEqual(expect.objectContaining({ type: "run-status", threadId: thread.id, status: "idle", workspacePath }));
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("cascades stopped parent runs to active sub-agent children on abort", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-abort-"));
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
      const background = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Background child",
        roleId: "summarizer",
        canonicalTaskPath: "root/1:summarizer",
        featureFlagSnapshot: featureFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "optional_background",
      });
      store.markSubagentRunStatus(child.id, "running");
      store.markSubagentRunStatus(background.id, "running");
      const barrier = store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        childRunIds: [child.id],
        dependencyMode: "required_all",
        failurePolicy: "ask_user",
      });
      const abort = vi.fn(async () => undefined);
      const childAbort = vi.fn(async () => undefined);
      const backgroundAbort = vi.fn(async () => undefined);
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
      (runtime as any).activeRuns.set(parent.id, {
        abort,
        detach: vi.fn(),
        queue: vi.fn(),
      });
      (runtime as any).activeRuns.set(child.childThreadId, {
        abort: childAbort,
        detach: vi.fn(),
        queue: vi.fn(),
      });
      (runtime as any).activeRuns.set(background.childThreadId, {
        abort: backgroundAbort,
        detach: vi.fn(),
        queue: vi.fn(),
      });
      (runtime as any).activeRunIds.set(parent.id, parentRun.id);

      await runtime.abort(parent.id);

      expect(abort).toHaveBeenCalledTimes(1);
      expect(childAbort).toHaveBeenCalledTimes(1);
      expect(backgroundAbort).not.toHaveBeenCalled();
      expect((runtime as any).activeRuns.has(child.childThreadId)).toBe(false);
      expect((runtime as any).activeRuns.has(background.childThreadId)).toBe(true);
      expect(store.getSubagentRun(child.id)).toMatchObject({
        status: "cancelled",
        resultArtifact: expect.objectContaining({
          status: "cancelled",
          summary: expect.stringContaining("Parent run stopped"),
        }),
      });
      expect(store.getSubagentRun(background.id)).toMatchObject({
        status: "detached",
        resultArtifact: expect.objectContaining({
          status: "detached",
          summary: expect.stringContaining("optional background child was detached"),
        }),
      });
      expect(store.getSubagentWaitBarrier(barrier.id).status).toBe("cancelled");
      expect(emitted).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "subagent-run-updated",
          run: expect.objectContaining({
            id: child.id,
            status: "cancelled",
          }),
          workspacePath,
        }),
        expect.objectContaining({
          type: "subagent-run-event-created",
          run: expect.objectContaining({ id: child.id }),
          event: expect.objectContaining({
            runId: child.id,
            type: "subagent.parent_stopped",
          }),
          workspacePath,
        }),
        expect.objectContaining({
          type: "subagent-run-event-created",
          run: expect.objectContaining({ id: child.id }),
          event: expect.objectContaining({
            runId: child.id,
            type: "subagent.child_runtime_aborted",
          }),
          workspacePath,
        }),
        expect.objectContaining({
          type: "thread-updated",
          thread: expect.objectContaining({
            id: child.childThreadId,
            childStatus: "cancelled",
          }),
          workspacePath,
        }),
        expect.objectContaining({
          type: "subagent-wait-barrier-updated",
          barrier: expect.objectContaining({
            id: barrier.id,
            status: "cancelled",
          }),
          workspacePath,
        }),
        expect.objectContaining({
          type: "subagent-run-updated",
          run: expect.objectContaining({
            id: background.id,
            status: "detached",
          }),
          workspacePath,
        }),
        expect.objectContaining({
          type: "runtime-activity",
          activity: expect.objectContaining({
            threadId: parent.id,
            message: expect.stringContaining("cascaded"),
          }),
          workspacePath,
        }),
        expect.objectContaining({ type: "run-status", threadId: parent.id, status: "idle", workspacePath }),
      ]));
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("records results from detached optional children that finish after parent abort", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-detached-result-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const parent = store.createThread("parent with detached background child");
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
          request: vi.fn(),
          denyThread: () => undefined,
        },
      );
      let releaseChildSend!: () => void;
      let childSendStarted!: () => void;
      const childSendStartedPromise = new Promise<void>((resolve) => {
        childSendStarted = resolve;
      });
      const childSendReleasedPromise = new Promise<void>((resolve) => {
        releaseChildSend = resolve;
      });
      vi.spyOn(runtime as any, "send").mockImplementation(async (input: any) => {
        store.addMessage({
          threadId: input.threadId,
          role: "user",
          content: input.visibleUserContent ?? input.content,
          metadata: { delivery: input.delivery, internal: input.internal },
        });
        childSendStarted();
        await childSendReleasedPromise;
        const structuredOutput = {
          schemaVersion: "ambient-subagent-structured-result-v1",
          roleId: "summarizer",
          status: "complete",
          summary: "Detached background result is preserved.",
          evidence: ["The child finished after the parent was stopped."],
          artifacts: [],
          risks: [],
          nextActions: [],
          roleOutput: {
            keyPoints: ["Detached background result is preserved."],
            sourceRefs: [],
          },
        };
        store.addMessage({
          threadId: input.threadId,
          role: "assistant",
          content: [
            structuredOutput.summary,
            "SUBAGENT_RESULT_STATUS: complete",
            `SUBAGENT_RESULT_JSON: ${JSON.stringify(structuredOutput)}`,
          ].join("\n"),
          metadata: { status: "done" },
        });
      });
      (runtime as any).activeRunIds.set(parent.id, parentRun.id);
      (runtime as any).activeRuns.set(parent.id, {
        abort: vi.fn(async () => undefined),
        detach: vi.fn(),
        queue: vi.fn(),
      });
      const registeredTools: any[] = [];
      (runtime as any).createSubagentToolExtension(parent.id)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const subagentTool = registeredTools.find((tool) => tool.name === "ambient_subagent");
      if (!subagentTool) throw new Error("ambient_subagent tool was not registered.");

      const spawned = await subagentTool.execute("spawn-detached-background", {
        action: "spawn_agent",
        roleId: "summarizer",
        task: "Summarize this background branch after the parent stops.",
        dependencyMode: "optional_background",
        idempotencyKey: "spawn:detached-background-result",
      });
      const runId = spawned.details.run.id as string;
      await childSendStartedPromise;
      const execution = (runtime as any).subagentChildExecutions.get(runId)?.promise as Promise<void> | undefined;
      expect(execution).toBeTruthy();

      await runtime.abort(parent.id);
      expect(store.getSubagentRun(runId)).toMatchObject({
        status: "detached",
        resultArtifact: expect.objectContaining({
          status: "detached",
        }),
      });

      releaseChildSend();
      await execution;

      expect(store.getSubagentRun(runId)).toMatchObject({
        status: "completed",
        resultArtifact: expect.objectContaining({
          status: "completed",
          summary: "Detached background result is preserved.",
          structuredOutput: expect.objectContaining({
            roleId: "summarizer",
            status: "complete",
          }),
        }),
      });
      expect(store.listSubagentRunEvents(runId).map((event) => event.type)).toEqual(expect.arrayContaining([
        "subagent.parent_stopped",
        "subagent.result_ready",
      ]));
      expect(store.listMessages(store.getSubagentRun(runId).childThreadId).map((message) => message.role)).toEqual([
        "system",
        "user",
        "assistant",
      ]);
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("can wait for a queued active-run delivery before resolving", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-queued-delivery-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const thread = store.createThread("queued delivery");
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
      let settleActiveRun!: () => void;
      const settled = new Promise<void>((resolve) => {
        settleActiveRun = resolve;
      });
      const queue = vi.fn(async () => undefined);
      let activeRunActivityListener: (() => void) | undefined;
      const removeActivityListener = vi.fn();
      const addActivityListener = vi.fn((listener: () => void) => {
        activeRunActivityListener = listener;
        return removeActivityListener;
      });
      (runtime as any).activeRuns.set(thread.id, {
        abort: vi.fn(),
        detach: vi.fn(),
        queue,
        settled,
        addActivityListener,
      });

      let resolved = false;
      const onActivity = vi.fn();
      const sendPromise = runtime
        .send(
          {
            threadId: thread.id,
            content: "continue this card",
            permissionMode: "workspace",
            collaborationMode: "agent",
            model: "ambient-preview",
            thinkingLevel: "medium",
            delivery: "prompt",
            context: [],
          },
          { awaitQueuedDeliveryCompletion: true, onActivity },
        )
        .then(() => {
          resolved = true;
        });

      await Promise.resolve();
      expect(queue).toHaveBeenCalledTimes(1);
      expect(addActivityListener).toHaveBeenCalledTimes(1);
      expect(onActivity).toHaveBeenCalledTimes(1);
      activeRunActivityListener?.();
      expect(onActivity).toHaveBeenCalledTimes(2);
      expect(resolved).toBe(false);

      settleActiveRun();
      await sendPromise;
      expect(removeActivityListener).toHaveBeenCalledTimes(1);

      expect(resolved).toBe(true);
      expect(store.listMessages(thread.id)).toEqual([
        expect.objectContaining({
          role: "user",
          content: "continue this card",
          metadata: expect.objectContaining({
            status: "queued",
            delivery: "steer",
          }),
        }),
      ]);
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("preserves STT metadata on queued speech follow-ups", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-stt-metadata-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const thread = store.createThread("stt metadata");
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
      const queue = vi.fn(async () => undefined);
      (runtime as any).activeRuns.set(thread.id, {
        abort: vi.fn(),
        detach: vi.fn(),
        queue,
      });

      const stt = sttMessageMetadataFromTranscription({
        utteranceId: "utt-1",
        threadId: thread.id,
        status: "ready",
        audioPath: ".ambient/stt/thread/utt-1.raw.wav",
        normalizedAudioPath: ".ambient/stt/thread/utt-1.wav",
        providerCapabilityId: "ambient-qwen3-asr:tool:qwen3_asr_transcribe",
        providerId: "qwen3-asr-0.6b",
        language: "English",
        text: "open the project settings",
        durationMs: 1200,
        noSpeechGate: { enabled: true, skipped: false, rmsDbfs: -25, thresholdDbfs: -55 },
        transcriptPath: ".ambient/stt/thread/utt-1.txt",
        jsonPath: ".ambient/stt/thread/utt-1.json",
        createdAt: "2026-05-10T00:00:00.000Z",
        updatedAt: "2026-05-10T00:00:01.000Z",
      });

      await runtime.send({
        threadId: thread.id,
        content: "open the project settings",
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: "ambient-preview",
        thinkingLevel: "medium",
        delivery: "follow-up",
        context: [],
        stt,
      });

      expect(store.listMessages(thread.id)).toEqual([
        expect.objectContaining({
          role: "user",
          content: "open the project settings",
          metadata: expect.objectContaining({
            status: "queued",
            delivery: "follow-up",
            stt: expect.objectContaining({
              source: "stt",
              utteranceId: "utt-1",
              providerId: "qwen3-asr-0.6b",
              artifacts: expect.objectContaining({
                audioPath: ".ambient/stt/thread/utt-1.raw.wav",
                transcriptPath: ".ambient/stt/thread/utt-1.txt",
              }),
            }),
          }),
        }),
      ]);
      expect(queue).toHaveBeenCalledWith(expect.objectContaining({ stt }));
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});
