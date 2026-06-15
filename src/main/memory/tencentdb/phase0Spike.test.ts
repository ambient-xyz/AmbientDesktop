import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  AmbientTencentMemoryHostAdapter,
  AmbientTencentMemoryLlmRunnerFactory,
  PHASE0_TENCENT_MEMORY_PACKAGE_AUDIT,
  ambientTencentMemoryDataDir,
  createTencentMemoryCoreForPhase0Spike,
  exerciseTencentMemoryCoreForPhase0,
  type AmbientTencentMemoryLlmRequest,
  type TencentMemoryCompletedTurn,
  type TencentMemoryCoreOptions,
  type TencentMemoryHostAdapter,
  type TencentMemoryRecallResult,
} from ".";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("TencentDB memory Phase 0 adapter spike", () => {
  it("chooses a minimal fork/subtree boundary while upstream package install patches OpenClaw", () => {
    expect(PHASE0_TENCENT_MEMORY_PACKAGE_AUDIT.packageName).toBe("@tencentdb-agent-memory/memory-tencentdb");
    expect(PHASE0_TENCENT_MEMORY_PACKAGE_AUDIT.upstreamCommit).toBe("a21ef3f66aebd549dcccc63084c572231b62d245");
    expect(PHASE0_TENCENT_MEMORY_PACKAGE_AUDIT.nodeEngine).toBe(">=22.16.0");
    expect(PHASE0_TENCENT_MEMORY_PACKAGE_AUDIT.nativeDependencies).toEqual([
      "@node-rs/jieba",
      "node-llama-cpp",
      "sqlite-vec",
    ]);
    expect(PHASE0_TENCENT_MEMORY_PACKAGE_AUDIT.unsafeInstallScripts).toEqual([
      expect.objectContaining({
        name: "postinstall",
        command: expect.stringContaining("openclaw-after-tool-call-messages.patch.sh"),
      }),
    ]);
    expect(PHASE0_TENCENT_MEMORY_PACKAGE_AUDIT.packageImportAllowedWithoutPatch).toBe(false);
    expect(PHASE0_TENCENT_MEMORY_PACKAGE_AUDIT.recommendedIntegration).toBe("minimal-fork-or-subtree");
  });

  it("constructs and exercises a Tencent-compatible core through Ambient's HostAdapter seam", async () => {
    const root = await tempDir();
    const workspacePath = join(root, "workspace");
    const statePath = join(root, "state");
    const dataDir = ambientTencentMemoryDataDir(statePath);
    const llmRequests: AmbientTencentMemoryLlmRequest[] = [];
    const loggerMessages: string[] = [];
    const llmRunnerFactory = new AmbientTencentMemoryLlmRunnerFactory({
      workspaceDir: workspacePath,
      defaultModelRef: "ambient/default-model",
      runWithAmbientPi: async (request) => {
        llmRequests.push(request);
        return `ambient-pi:${request.taskId}:${request.enableTools ? "tools" : "text"}`;
      },
    });
    const hostAdapter = new AmbientTencentMemoryHostAdapter({
      threadId: "thread-phase0",
      workspacePath,
      dataDir,
      logger: {
        debug: (message) => loggerMessages.push(`debug:${message}`),
        info: (message) => loggerMessages.push(`info:${message}`),
        warn: (message) => loggerMessages.push(`warn:${message}`),
        error: (message) => loggerMessages.push(`error:${message}`),
      },
      llmRunnerFactory,
    });

    const core = await createTencentMemoryCoreForPhase0Spike({
      Core: FakeTencentMemoryCore,
      hostAdapter,
      config: { extraction: { enabled: false }, storeBackend: "sqlite" },
      instanceId: "ambient-memory-phase0",
    });
    const turn: TencentMemoryCompletedTurn = {
      userText: "remember the workspace color is teal",
      assistantText: "I will remember that.",
      messages: [
        { role: "user", content: "remember the workspace color is teal" },
        { role: "assistant", content: "I will remember that." },
      ],
      sessionKey: hostAdapter.getRuntimeContext().sessionKey,
      sessionId: hostAdapter.getRuntimeContext().sessionId,
      startedAt: 1_765_584_000_000,
    };

    const smoke = await exerciseTencentMemoryCoreForPhase0(core, turn);

    expect(hostAdapter.hostType).toBe("standalone");
    expect(hostAdapter.getRuntimeContext()).toMatchObject({
      userId: "ambient-desktop-user",
      sessionId: "thread-phase0",
      sessionKey: "ambient-thread:thread-phase0",
      platform: "ambient-desktop",
      agentContext: "primary",
      workspaceDir: workspacePath,
      dataDir,
    });
    expect(smoke).toEqual({
      recallPrependContext: "ambient-pi:phase0-recall:text",
      captureRecordedCount: 2,
      memorySearchTotal: 1,
      conversationSearchTotal: 1,
    });
    expect(llmRequests).toEqual([
      expect.objectContaining({
        origin: "tencentdb-agent-memory",
        modelRef: "ambient/default-model",
        enableTools: false,
        workspaceDir: workspacePath,
        taskId: "phase0-recall",
      }),
    ]);
    expect(loggerMessages).toContain(`info:fake-core initialized at ${dataDir}`);
  });
});

class FakeTencentMemoryCore {
  private readonly hostAdapter: TencentMemoryHostAdapter;

  constructor(private readonly options: TencentMemoryCoreOptions) {
    this.hostAdapter = options.hostAdapter;
  }

  async initialize(): Promise<void> {
    this.hostAdapter.getLogger().info(`fake-core initialized at ${this.hostAdapter.getRuntimeContext().dataDir}`);
  }

  async handleBeforeRecall(userText: string, sessionKey: string): Promise<TencentMemoryRecallResult> {
    const context = this.hostAdapter.getRuntimeContext();
    expect(sessionKey).toBe(context.sessionKey);
    const runner = this.hostAdapter.getLLMRunnerFactory().createRunner({ enableTools: false });
    return {
      prependContext: await runner.run({
        taskId: "phase0-recall",
        prompt: userText,
        workspaceDir: context.workspaceDir,
      }),
      recallStrategy: "phase0-fake",
    };
  }

  async handleTurnCommitted(turn: TencentMemoryCompletedTurn) {
    return {
      l0RecordedCount: turn.messages.length,
      schedulerNotified: false,
      l0VectorsWritten: 0,
      filteredMessages: turn.messages.map((message, index) => ({
        role: typeof message === "object" && message && "role" in message ? String(message.role) : "unknown",
        content: typeof message === "object" && message && "content" in message ? String(message.content) : "",
        timestamp: (turn.startedAt ?? 0) + index,
      })),
    };
  }

  async searchMemories() {
    return { text: "phase0 memory search", total: 1, strategy: "fake" };
  }

  async searchConversations() {
    return { text: "phase0 conversation search", total: 1 };
  }
}

async function tempDir(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "ambient-tencent-memory-phase0-"));
  tempRoots.push(path);
  return path;
}
