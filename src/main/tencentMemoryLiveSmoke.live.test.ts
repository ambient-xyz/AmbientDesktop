import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AMBIENT_DEFAULT_MODEL } from "../shared/ambientModels";
import { resolveAmbientFeatureFlags } from "../shared/featureFlags";
import { AgentRuntime } from "./agent-runtime/agentRuntime";
import {
  applyLiveAmbientProviderApiKeyEnv,
  liveAmbientProviderLabel,
  liveAmbientProviderModel,
  readLiveAmbientProviderApiKey,
} from "./liveAmbientProviderConfig";
import {
  createTencentDbMemoryRuntimeForThread,
  TENCENT_MEMORY_DELETE_TOOL_NAME,
  TENCENT_MEMORY_INSPECT_TOOL_NAME,
  TENCENT_MEMORY_UPDATE_TOOL_NAME,
} from "./memory/tencentdb/runtime";
import {
  AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID,
  discoverAmbientMemoryEmbeddingProviders,
  startAmbientMemoryEmbeddingRuntime,
} from "./memory/tencentdb/managedEmbeddingProvider";
import { installAmbientMemoryEmbeddingAssets } from "./memory/tencentdb/managedEmbeddingInstaller";
import { buildAmbientTencentMemoryOffloadContext } from "./memory/tencentdb/offload";
import { ProjectStore } from "./projectStore/projectStore";
import { agentMemoryStarterEnableMemoryPatch } from "./memory/tencentdb/starter";

const itLive = process.env.AMBIENT_TENCENT_MEMORY_LIVE === "1" ? it : it.skip;
const itEmbeddingLive = process.env.AMBIENT_TENCENT_MEMORY_LIVE === "1" && process.env.AMBIENT_TENCENT_MEMORY_EMBEDDING_LIVE === "1" ? it : it.skip;

describe("TencentDB Agent Memory live smoke", () => {
  let workspacePath = "";
  let store: ProjectStore;
  let runtime: AgentRuntime | undefined;

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-tencent-memory-live-"));
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
    store.setFeatureFlagSettings({ tencentDbMemory: true });
    store.setMemorySettings({ enabled: true, defaultThreadEnabled: true });
    store.setModelRuntimeSettings({
      providerPreStreamTimeoutMs: 60_000,
      providerStreamIdleTimeoutMs: 120_000,
    });
  });

  afterEach(async () => {
    if (runtime) {
      await runtime.shutdownPluginMcpServers();
      runtime = undefined;
    }
    store.close();
    await rm(workspacePath, { recursive: true, force: true });
  });

  itLive("captures a durable fact and recalls it from a fresh thread", async () => {
    applyLiveAmbientProviderApiKeyEnv(readLiveAmbientProviderApiKey({ purpose: "TencentDB Agent Memory live smoke" }));
    const model = liveAmbientProviderModel({
      preferredModelEnvNames: ["AMBIENT_TENCENT_MEMORY_LIVE_MODEL", "AMBIENT_LIVE_MODEL"],
      fallbackModel: AMBIENT_DEFAULT_MODEL,
    });
    const code = `TENCENT_MEMORY_LIVE_${Date.now()}`;
    const captureThread = store.createThread("Tencent memory capture live smoke");
    runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
      request: async (request) => {
        if (request.toolName === TENCENT_MEMORY_DELETE_TOOL_NAME) {
          return { allowed: true, mode: "allow_once" as const };
        }
        throw new Error(`Unexpected permission request during Tencent memory live smoke: ${request.toolName}`);
      },
      denyThread: () => undefined,
    });

    await sendWithTimeout({
      runtime,
      store,
      threadId: captureThread.id,
      timeoutMs: Number(process.env.AMBIENT_TENCENT_MEMORY_LIVE_TIMEOUT_MS ?? 240_000),
      send: runtime.send({
        threadId: captureThread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model,
        thinkingLevel: "minimal",
        content: [
          "This is a live TencentDB Agent Memory smoke test.",
          "Do not use tools for this turn.",
          `Please remember this durable fact: the Ambient Tencent memory smoke code is ${code}.`,
          "Reply exactly: MEMORY_CAPTURE_DONE",
        ].join("\n"),
      }),
    });
    expect(threadAssistantText(store, captureThread.id)).toContain("MEMORY_CAPTURE_DONE");

    // Dispose the active session so Tencent's scheduler flushes pending L1 work
    // before we inspect with a fresh runtime facade.
    runtime.applyThreadMemorySettings(captureThread.id);
    await delay(Number(process.env.AMBIENT_TENCENT_MEMORY_LIVE_FLUSH_DELAY_MS ?? 5_000));

    const l1Rows = await waitForL1Memory({ threadId: captureThread.id, query: code, timeoutMs: 180_000 });
    expect(l1Rows.some((row) => row.preview.includes(code) || row.content.includes(code))).toBe(true);

    const recallThread = store.createThread("Tencent memory recall live smoke");
    await sendWithTimeout({
      runtime,
      store,
      threadId: recallThread.id,
      timeoutMs: Number(process.env.AMBIENT_TENCENT_MEMORY_RECALL_LIVE_TIMEOUT_MS ?? 180_000),
      send: runtime.send({
        threadId: recallThread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model,
        thinkingLevel: "minimal",
        content: [
          "This is the recall half of the live TencentDB Agent Memory smoke test.",
          "Do not inspect files. Answer from associated memory only.",
          "What is the Ambient Tencent memory smoke code?",
          `Reply exactly: MEMORY_RECALL_CODE: ${code}`,
        ].join("\n"),
      }),
    });
    const recallText = threadAssistantText(store, recallThread.id);
    expect(recallText).toContain(code);
    expect(runtime.listAgentMemoryRuntimeSnapshots()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        threadId: recallThread.id,
        lastRecall: expect.objectContaining({ status: "ok" }),
        lastContextInjection: expect.objectContaining({
          recallContextChars: expect.any(Number),
        }),
      }),
    ]));

    const memoryOffThread = store.createThread("Tencent memory off control live smoke");
    store.updateThreadSettings(memoryOffThread.id, { memoryEnabled: false });
    await sendWithTimeout({
      runtime,
      store,
      threadId: memoryOffThread.id,
      timeoutMs: Number(process.env.AMBIENT_TENCENT_MEMORY_OFF_LIVE_TIMEOUT_MS ?? 180_000),
      send: runtime.send({
        threadId: memoryOffThread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model,
        thinkingLevel: "minimal",
        content: [
          "This is the memory-off control half of the live TencentDB Agent Memory smoke test.",
          "This thread has memory disabled. Do not inspect files or use tools.",
          "If the Ambient Tencent memory smoke code is not explicitly present in this prompt, reply exactly: MEMORY_OFF_NO_MEMORY",
        ].join("\n"),
      }),
    });
    const memoryOffText = threadAssistantText(store, memoryOffThread.id);
    const memoryOffToolNames = threadToolNames(store, memoryOffThread.id);
    const memoryOffRuntimeSnapshotPresent = runtime.listAgentMemoryRuntimeSnapshots().some((snapshot) => snapshot.threadId === memoryOffThread.id);
    expect(memoryOffText).toContain("MEMORY_OFF_NO_MEMORY");
    expect(memoryOffText).not.toContain(code);
    expect(memoryOffToolNames.filter((toolName) => toolName.includes("memory"))).toEqual([]);
    expect(memoryOffRuntimeSnapshotPresent).toBe(false);

    const targetMemoryId = l1Rows.find((row) => row.preview.includes(code) || row.content.includes(code))?.id ?? l1Rows[0]?.id;
    expect(targetMemoryId).toBeTruthy();

    const inspectThread = store.createThread("Tencent memory inspect live smoke");
    await sendWithTimeout({
      runtime,
      store,
      threadId: inspectThread.id,
      timeoutMs: Number(process.env.AMBIENT_TENCENT_MEMORY_INSPECT_LIVE_TIMEOUT_MS ?? 180_000),
      send: runtime.send({
        threadId: inspectThread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model,
        thinkingLevel: "minimal",
        content: [
          "This is the inspect half of the live TencentDB Agent Memory smoke test.",
          `Use ambient_memory_inspect with scope=workspace, layer=l1, and query "${code}".`,
          "Return the compact table from the tool and include exactly: MEMORY_INSPECT_DONE",
        ].join("\n"),
      }),
    });
    const inspectText = threadAssistantText(store, inspectThread.id);
    const inspectToolText = threadToolOutputText(store, inspectThread.id, TENCENT_MEMORY_INSPECT_TOOL_NAME);
    expect(inspectText).toContain("MEMORY_INSPECT_DONE");
    expect(threadToolNames(store, inspectThread.id)).toContain(TENCENT_MEMORY_INSPECT_TOOL_NAME);
    expect(inspectToolText).toContain("| ID | Layer | Kind | Updated | Preview |");
    expect(inspectToolText).toContain(targetMemoryId);

    const deleteThread = store.createThread("Tencent memory delete live smoke");
    await sendWithTimeout({
      runtime,
      store,
      threadId: deleteThread.id,
      timeoutMs: Number(process.env.AMBIENT_TENCENT_MEMORY_DELETE_LIVE_TIMEOUT_MS ?? 180_000),
      send: runtime.send({
        threadId: deleteThread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model,
        thinkingLevel: "minimal",
        content: [
          "This is the delete half of the live TencentDB Agent Memory smoke test.",
          `I explicitly confirm deleting TencentDB Agent Memory L1 memory id ${targetMemoryId}.`,
          "Use ambient_memory_delete with layer=l1, that exact id, and confirmed=true. Do not ask for another confirmation.",
          "Reply exactly: MEMORY_DELETE_DONE",
        ].join("\n"),
      }),
    });
    const deleteText = threadAssistantText(store, deleteThread.id);
    const deleteToolText = threadToolOutputText(store, deleteThread.id, TENCENT_MEMORY_DELETE_TOOL_NAME);
    expect(deleteText).toContain("MEMORY_DELETE_DONE");
    expect(threadToolNames(store, deleteThread.id)).toContain(TENCENT_MEMORY_DELETE_TOOL_NAME);
    expect(deleteToolText).toContain("Deleted 1 TencentDB l1 memory.");

    const rowsAfterDelete = await inspectL1MemoryRows({ threadId: captureThread.id, query: code, limit: 10 });
    expect(rowsAfterDelete.some((row) => row.id === targetMemoryId)).toBe(false);

    const report = {
      schemaVersion: "ambient-tencent-memory-live-smoke-v1",
      createdAt: new Date().toISOString(),
      provider: liveAmbientProviderLabel(),
      workspacePath,
      captureThreadId: captureThread.id,
      recallThreadId: recallThread.id,
      memoryOffThreadId: memoryOffThread.id,
      inspectThreadId: inspectThread.id,
      deleteThreadId: deleteThread.id,
      code,
      targetMemoryId,
      l1Rows: l1Rows.map((row) => ({
        id: row.id,
        layer: row.layer,
        type: row.type,
        preview: row.preview,
        updatedAt: row.updatedAt,
      })),
      rowsAfterDelete: rowsAfterDelete.map((row) => ({
        id: row.id,
        layer: row.layer,
        type: row.type,
        preview: row.preview,
        updatedAt: row.updatedAt,
      })),
      recallText,
      memoryOffText,
      memoryOffToolNames,
      memoryOffRuntimeSnapshotPresent,
      inspectText,
      inspectToolText,
      deleteText,
      deleteToolText,
      runtimeSnapshots: runtime.listAgentMemoryRuntimeSnapshots(),
      captureToolNames: threadToolNames(store, captureThread.id),
      recallToolNames: threadToolNames(store, recallThread.id),
      inspectToolNames: threadToolNames(store, inspectThread.id),
      deleteToolNames: threadToolNames(store, deleteThread.id),
    };
    const reportRoot = join(process.cwd(), "test-results", "tencent-memory-live-smoke");
    const latestReportPath = join(reportRoot, "latest.json");
    const runReportPath = join(reportRoot, `run-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    await mkdir(reportRoot, { recursive: true });
    await writeFile(latestReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(runReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }, Number(process.env.AMBIENT_TENCENT_MEMORY_LIVE_TEST_TIMEOUT_MS ?? 420_000));

  itEmbeddingLive("enables Tencent memory from off and proves thread plus global recall", async () => {
    applyLiveAmbientProviderApiKeyEnv(readLiveAmbientProviderApiKey({ purpose: "TencentDB Agent Memory feature enablement live smoke" }));
    const restoreManagedRoot = useManagedEmbeddingAssetRoot();
    let releaseEmbeddingRuntime: (() => Promise<void>) | undefined;
    store.setFeatureFlagSettings({ tencentDbMemory: false });
    store.setMemorySettings({
      enabled: false,
      defaultThreadEnabled: false,
      shortTermOffloadEnabled: false,
      embeddings: { enabled: false, autoStartProvider: false },
    });
    const disabledSettings = store.getDefaultSettings();
    const preEnableThread = store.createThread("Tencent memory starter pre-enable live smoke");
    expect(disabledSettings.featureFlags.tencentDbMemory).toBe(false);
    expect(disabledSettings.memory).toMatchObject({
      enabled: false,
      defaultThreadEnabled: false,
    });
    expect(preEnableThread.memoryEnabled).toBe(false);
    expect(createTencentDbMemoryRuntimeForThread({
      thread: preEnableThread,
      workspace: store.getWorkspace(),
      featureFlagSnapshot: resolveAmbientFeatureFlags({
        generatedAt: "2026-06-13T00:00:00.000Z",
        settings: { tencentDbMemory: false },
      }),
      memorySettings: store.getMemorySettings(),
    })).toBeUndefined();

    try {
      const enabledFeatureFlags = store.setFeatureFlagSettings({ tencentDbMemory: true });
      const enabledMemorySettings = store.setMemorySettings(agentMemoryStarterEnableMemoryPatch({ enableNewThreads: true }));
      const captureThread = store.updateThreadSettings(preEnableThread.id, { memoryEnabled: true });
      const globalRecallThread = store.createThread("Tencent memory starter global recall live smoke");
      expect(enabledFeatureFlags.tencentDbMemory).toBe(true);
      expect(enabledMemorySettings).toMatchObject({
        enabled: true,
        defaultThreadEnabled: true,
        embeddings: {
          enabled: true,
          providerMode: "ambient-managed",
          autoStartProvider: true,
          preflightEnabled: true,
        },
      });
      expect(captureThread.memoryEnabled).toBe(true);
      expect(globalRecallThread.memoryEnabled).toBe(true);

      const starterInstall = await installAmbientMemoryEmbeddingAssets({
        workspacePath,
        action: "install",
      });
      expect(starterInstall.managedAssets.model.status).toBe("present");
      expect(starterInstall.managedAssets.runtime.status).toBe("present");
      const embeddingProvider = (await discoverAmbientMemoryEmbeddingProviders(workspacePath)).find((provider) => provider.providerId === AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID);
      expect(embeddingProvider).toEqual(expect.objectContaining({
        providerId: AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID,
        available: true,
      }));
      const embeddingRuntimeStart = await startAmbientMemoryEmbeddingRuntime({
        workspacePath,
        ownerThreadId: captureThread.id,
        startupTimeoutMs: Number(process.env.AMBIENT_TENCENT_MEMORY_ENABLE_EMBEDDING_START_TIMEOUT_MS ?? 240_000),
        idleTimeoutMs: 0,
      });
      releaseEmbeddingRuntime = embeddingRuntimeStart.release;
      expect(["started", "ready"]).toContain(embeddingRuntimeStart.status);

      const model = liveAmbientProviderModel({
        preferredModelEnvNames: ["AMBIENT_TENCENT_MEMORY_LIVE_MODEL", "AMBIENT_LIVE_MODEL"],
        fallbackModel: AMBIENT_DEFAULT_MODEL,
      });
      const code = `TENCENT_MEMORY_STARTER_${Date.now()}`;
      runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: async (request) => {
          throw new Error(`Unexpected permission request during Tencent memory enablement live smoke: ${request.toolName}`);
        },
        denyThread: () => undefined,
      });

      await sendWithTimeout({
        runtime,
        store,
        threadId: captureThread.id,
        timeoutMs: Number(process.env.AMBIENT_TENCENT_MEMORY_ENABLE_CAPTURE_LIVE_TIMEOUT_MS ?? 240_000),
        send: runtime.send({
          threadId: captureThread.id,
          permissionMode: "workspace",
          collaborationMode: "agent",
          model,
          thinkingLevel: "minimal",
          content: [
            "This is a live TencentDB Agent Memory enablement smoke test.",
            "Do not use tools for this turn.",
            `Please remember this durable fact: the Agent Memory starter enablement code is ${code}.`,
            "Reply exactly: MEMORY_ENABLE_CAPTURE_DONE",
          ].join("\n"),
        }),
      });
      expect(threadAssistantText(store, captureThread.id)).toContain("MEMORY_ENABLE_CAPTURE_DONE");

      runtime.applyThreadMemorySettings(captureThread.id);
      await delay(Number(process.env.AMBIENT_TENCENT_MEMORY_LIVE_FLUSH_DELAY_MS ?? 5_000));

      const threadRows = await waitForScopedL1Memory({
        threadId: captureThread.id,
        scope: "thread",
        query: code,
        timeoutMs: 180_000,
      });
      const workspaceRows = await waitForScopedL1Memory({
        threadId: captureThread.id,
        scope: "workspace",
        query: code,
        timeoutMs: 180_000,
      });
      expect(threadRows.some((row) => row.preview.includes(code) || row.content.includes(code))).toBe(true);
      expect(workspaceRows.some((row) => row.preview.includes(code) || row.content.includes(code))).toBe(true);

      const semanticRuntime = createInspectionRuntime(captureThread.id, { embeddings: true });
      if (!semanticRuntime) throw new Error("TencentDB starter semantic inspection runtime was unavailable.");
      let semanticSnapshot = semanticRuntime.snapshot();
      try {
        const semanticSearch = await semanticRuntime.searchMemories({
          query: "Which starter enablement code was mentioned earlier?",
          limit: 5,
        });
        expect(semanticSearch?.text ?? "").toContain(code);
        semanticSnapshot = semanticRuntime.snapshot();
      } finally {
        await semanticRuntime.dispose();
      }
      expect(semanticSnapshot.embedding).toMatchObject({
        status: "ready",
        providerId: AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID,
        dimensions: 768,
      });

      await sendWithTimeout({
        runtime,
        store,
        threadId: captureThread.id,
        timeoutMs: Number(process.env.AMBIENT_TENCENT_MEMORY_ENABLE_THREAD_RECALL_LIVE_TIMEOUT_MS ?? 180_000),
        send: runtime.send({
          threadId: captureThread.id,
          permissionMode: "workspace",
          collaborationMode: "agent",
          model,
          thinkingLevel: "minimal",
          content: [
            "This is the thread recall half of the live TencentDB Agent Memory enablement smoke test.",
            "Do not inspect files. Answer from associated memory only.",
            "What is the Agent Memory starter enablement code?",
            `Reply exactly: MEMORY_ENABLE_THREAD_RECALL_CODE: ${code}`,
          ].join("\n"),
        }),
      });
      const threadRecallText = threadAssistantText(store, captureThread.id);
      expect(threadRecallText).toContain(code);
      const threadRecallSnapshot = runtime.listAgentMemoryRuntimeSnapshots().find((snapshot) => snapshot.threadId === captureThread.id);
      expect(threadRecallSnapshot?.lastRecall).toEqual(expect.objectContaining({ status: "ok" }));
      expect(threadRecallSnapshot?.lastContextInjection?.recallContextChars ?? 0).toBeGreaterThan(0);

      await sendWithTimeout({
        runtime,
        store,
        threadId: globalRecallThread.id,
        timeoutMs: Number(process.env.AMBIENT_TENCENT_MEMORY_ENABLE_GLOBAL_RECALL_LIVE_TIMEOUT_MS ?? 180_000),
        send: runtime.send({
          threadId: globalRecallThread.id,
          permissionMode: "workspace",
          collaborationMode: "agent",
          model,
          thinkingLevel: "minimal",
          content: [
            "This is the global recall half of the live TencentDB Agent Memory enablement smoke test.",
            "Do not inspect files. Answer from associated workspace memory only.",
            "What is the Agent Memory starter enablement code?",
            `Reply exactly: MEMORY_ENABLE_GLOBAL_RECALL_CODE: ${code}`,
          ].join("\n"),
        }),
      });
      const globalRecallText = threadAssistantText(store, globalRecallThread.id);
      expect(globalRecallText).toContain(code);
      const globalRecallSnapshot = runtime.listAgentMemoryRuntimeSnapshots().find((snapshot) => snapshot.threadId === globalRecallThread.id);
      expect(globalRecallSnapshot?.lastRecall).toEqual(expect.objectContaining({ status: "ok" }));
      expect(globalRecallSnapshot?.lastContextInjection?.recallContextChars ?? 0).toBeGreaterThan(0);

      const report = {
        schemaVersion: "ambient-tencent-memory-enable-live-smoke-v1",
        createdAt: new Date().toISOString(),
        provider: liveAmbientProviderLabel(),
        workspacePath,
        code,
        disabledSettings: {
          featureFlags: disabledSettings.featureFlags,
          memory: disabledSettings.memory,
        },
        enabledFeatureFlags,
        enabledMemorySettings,
        starterInstall: {
          status: starterInstall.status,
          modelStatus: starterInstall.managedAssets.model.status,
          runtimeStatus: starterInstall.managedAssets.runtime.status,
          nextActions: starterInstall.nextActions,
        },
        embeddingProvider: embeddingProvider ? {
          providerId: embeddingProvider.providerId,
          available: embeddingProvider.available,
          availabilityReason: embeddingProvider.availabilityReason,
        } : undefined,
        embeddingRuntimeStart: {
          status: embeddingRuntimeStart.status,
          reason: embeddingRuntimeStart.reason,
          leaseId: embeddingRuntimeStart.leaseId,
        },
        semanticSnapshot,
        captureThread: {
          id: captureThread.id,
          memoryEnabled: captureThread.memoryEnabled,
        },
        globalRecallThread: {
          id: globalRecallThread.id,
          memoryEnabled: globalRecallThread.memoryEnabled,
        },
        threadRows: threadRows.map((row) => ({
          id: row.id,
          layer: row.layer,
          type: row.type,
          preview: row.preview,
          updatedAt: row.updatedAt,
        })),
        workspaceRows: workspaceRows.map((row) => ({
          id: row.id,
          layer: row.layer,
          type: row.type,
          preview: row.preview,
          updatedAt: row.updatedAt,
        })),
        threadRecallText,
        globalRecallText,
        threadRecallSnapshot,
        globalRecallSnapshot,
        runtimeSnapshots: runtime.listAgentMemoryRuntimeSnapshots(),
      };
      const reportRoot = join(process.cwd(), "test-results", "tencent-memory-enable-live-smoke");
      const latestReportPath = join(reportRoot, "latest.json");
      const runReportPath = join(reportRoot, `run-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
      await mkdir(reportRoot, { recursive: true });
      await writeFile(latestReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
      await writeFile(runReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    } finally {
      await releaseEmbeddingRuntime?.();
      restoreManagedRoot();
    }
  }, Number(process.env.AMBIENT_TENCENT_MEMORY_ENABLE_LIVE_TEST_TIMEOUT_MS ?? 600_000));

  itLive("injects short-term offload context from artifact-backed tool output", async () => {
    applyLiveAmbientProviderApiKeyEnv(readLiveAmbientProviderApiKey({ purpose: "TencentDB Agent Memory short-term offload live smoke" }));
    store.setMemorySettings({ enabled: true, defaultThreadEnabled: true, shortTermOffloadEnabled: true });
    const model = liveAmbientProviderModel({
      preferredModelEnvNames: ["AMBIENT_TENCENT_MEMORY_LIVE_MODEL", "AMBIENT_LIVE_MODEL"],
      fallbackModel: AMBIENT_DEFAULT_MODEL,
    });
    const sentinel = `TENCENT_OFFLOAD_${Date.now()}`;
    const artifactPath = join(workspacePath, ".ambient", "tool-outputs", `offload-${sentinel}.txt`);
    const artifactSecret = `RAW_OFFLOAD_SECRET_${Date.now()}`;
    await mkdir(dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, `${artifactSecret}\n${"artifact detail\n".repeat(2_000)}`, "utf8");

    const offloadThread = store.createThread("Tencent memory short-term offload live smoke");
    store.addMessage({
      threadId: offloadThread.id,
      role: "assistant",
      content: "I captured a large browser result preview. The exact output is materialized separately.",
    });
    store.addMessage({
      threadId: offloadThread.id,
      role: "tool",
      content: "Large browser result visible preview. This preview intentionally omits the artifact path and raw secret.",
      metadata: {
        status: "done",
        toolName: "browser_content",
        toolResultDetails: {
          largeOutputPreview: {
            kind: "large-output",
            summary: "large browser output",
            items: [{
              label: `short-term offload sentinel ${sentinel}`,
              chars: 64_000,
              previewChars: 12_000,
              truncated: true,
              artifactPath,
              artifactKind: "tool-output",
              artifactBytes: 65_000,
              suggestedTools: ["file_read", "long_context_process"],
            }],
          },
        },
      },
    });

    const directOffloadContext = buildAmbientTencentMemoryOffloadContext({
      messages: store.listMessages(offloadThread.id),
      maxContextChars: 4_000,
    });
    expect(directOffloadContext?.entries).toEqual([
      expect.objectContaining({
        toolName: "browser_content",
        label: `short-term offload sentinel ${sentinel}`,
        artifactPath,
      }),
    ]);
    expect(directOffloadContext?.text).toContain("<ambient_memory_short_term_offload>");
    expect(directOffloadContext?.text).toContain(artifactPath);
    expect(directOffloadContext?.text).not.toContain(artifactSecret);

    runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
      request: async (request) => {
        throw new Error(`Unexpected permission request during Tencent memory offload live smoke: ${request.toolName}`);
      },
      denyThread: () => undefined,
    });

    await sendWithTimeout({
      runtime,
      store,
      threadId: offloadThread.id,
      timeoutMs: Number(process.env.AMBIENT_TENCENT_MEMORY_OFFLOAD_LIVE_TIMEOUT_MS ?? 180_000),
      send: runtime.send({
        threadId: offloadThread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model,
        thinkingLevel: "minimal",
        content: [
          "This is a live TencentDB Agent Memory short-term offload smoke test.",
          "Do not call tools. Use only the supplied short-term offload context for recent large outputs.",
          `What local artifact path is listed for offload sentinel ${sentinel}?`,
          "Reply exactly: OFFLOAD_ARTIFACT: <the listed artifact path>",
        ].join("\n"),
      }),
    });

    const assistantText = threadAssistantText(store, offloadThread.id);
    expect(assistantText).toContain("OFFLOAD_ARTIFACT:");
    expect(assistantText).toContain(artifactPath);
    expect(assistantText).not.toContain(artifactSecret);
    expect(threadToolNames(store, offloadThread.id).filter((toolName) => toolName.includes("memory"))).toEqual([]);

    const snapshot = runtime.listAgentMemoryRuntimeSnapshots().find((item) => item.threadId === offloadThread.id);
    expect(snapshot?.lastContextInjection).toEqual(expect.objectContaining({
      offloadContextChars: expect.any(Number),
      totalInjectedChars: expect.any(Number),
    }));
    expect(snapshot?.lastContextInjection?.offloadContextChars ?? 0).toBeGreaterThan(0);
    expect(snapshot?.lastContextInjection?.recallContextChars ?? 0).toBe(0);

    const report = {
      schemaVersion: "ambient-tencent-memory-offload-live-smoke-v1",
      createdAt: new Date().toISOString(),
      provider: liveAmbientProviderLabel(),
      workspacePath,
      threadId: offloadThread.id,
      sentinel,
      artifactPath,
      directOffloadEntries: directOffloadContext?.entries ?? [],
      directOffloadContextChars: directOffloadContext?.text.length ?? 0,
      directOffloadContextTruncated: directOffloadContext?.truncated ?? false,
      assistantText,
      toolNames: threadToolNames(store, offloadThread.id),
      runtimeSnapshot: snapshot,
    };
    const reportRoot = join(process.cwd(), "test-results", "tencent-memory-offload-live-smoke");
    const latestReportPath = join(reportRoot, "latest.json");
    const runReportPath = join(reportRoot, `run-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    await mkdir(reportRoot, { recursive: true });
    await writeFile(latestReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(runReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }, Number(process.env.AMBIENT_TENCENT_MEMORY_OFFLOAD_LIVE_TEST_TIMEOUT_MS ?? 240_000));

  itLive("updates a TencentDB L1 memory through chat and recalls the edit", async () => {
    applyLiveAmbientProviderApiKeyEnv(readLiveAmbientProviderApiKey({ purpose: "TencentDB Agent Memory update live smoke" }));
    const model = liveAmbientProviderModel({
      preferredModelEnvNames: ["AMBIENT_TENCENT_MEMORY_LIVE_MODEL", "AMBIENT_LIVE_MODEL"],
      fallbackModel: AMBIENT_DEFAULT_MODEL,
    });
    const originalCode = `TENCENT_MEMORY_EDIT_ORIGINAL_${Date.now()}`;
    const updatedCode = `TENCENT_MEMORY_EDIT_UPDATED_${Date.now()}`;
    const replacementContent = `The Ambient Tencent editable memory code is ${updatedCode}.`;
    const captureThread = store.createThread("Tencent memory update capture live smoke");
    runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
      request: async (request) => {
        if (request.toolName === TENCENT_MEMORY_UPDATE_TOOL_NAME) {
          return { allowed: true, mode: "allow_once" as const };
        }
        throw new Error(`Unexpected permission request during Tencent memory update live smoke: ${request.toolName}`);
      },
      denyThread: () => undefined,
    });

    await sendWithTimeout({
      runtime,
      store,
      threadId: captureThread.id,
      timeoutMs: Number(process.env.AMBIENT_TENCENT_MEMORY_UPDATE_CAPTURE_LIVE_TIMEOUT_MS ?? 240_000),
      send: runtime.send({
        threadId: captureThread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model,
        thinkingLevel: "minimal",
        content: [
          "This is a live TencentDB Agent Memory update smoke test.",
          "Do not use tools for this turn.",
          `Please remember this durable fact: the Ambient Tencent editable memory code is ${originalCode}.`,
          "Reply exactly: MEMORY_UPDATE_CAPTURE_DONE",
        ].join("\n"),
      }),
    });
    expect(threadAssistantText(store, captureThread.id)).toContain("MEMORY_UPDATE_CAPTURE_DONE");

    runtime.applyThreadMemorySettings(captureThread.id);
    await delay(Number(process.env.AMBIENT_TENCENT_MEMORY_LIVE_FLUSH_DELAY_MS ?? 5_000));

    const originalRows = await waitForL1Memory({ threadId: captureThread.id, query: originalCode, timeoutMs: 180_000 });
    const targetMemory = originalRows.find((row) => row.preview.includes(originalCode) || row.content.includes(originalCode)) ?? originalRows[0];
    expect(targetMemory?.id).toBeTruthy();

    const updateThread = store.createThread("Tencent memory update live smoke");
    await sendWithTimeout({
      runtime,
      store,
      threadId: updateThread.id,
      timeoutMs: Number(process.env.AMBIENT_TENCENT_MEMORY_UPDATE_LIVE_TIMEOUT_MS ?? 180_000),
      send: runtime.send({
        threadId: updateThread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model,
        thinkingLevel: "minimal",
        content: [
          "This is the edit half of the live TencentDB Agent Memory update smoke test.",
          `I explicitly confirm updating TencentDB Agent Memory L1 memory id ${targetMemory.id}.`,
          `Use ambient_memory_update with layer=l1, id=${targetMemory.id}, content="${replacementContent}", type=episodic, and confirmed=true.`,
          "Do not ask for another confirmation.",
          "Reply exactly: MEMORY_UPDATE_DONE",
        ].join("\n"),
      }),
    });
    const updateText = threadAssistantText(store, updateThread.id);
    const updateToolText = threadToolOutputText(store, updateThread.id, TENCENT_MEMORY_UPDATE_TOOL_NAME);
    expect(updateText).toContain("MEMORY_UPDATE_DONE");
    expect(threadToolNames(store, updateThread.id)).toContain(TENCENT_MEMORY_UPDATE_TOOL_NAME);
    expect(updateToolText).toContain(`Updated TencentDB memory ${targetMemory.id} (l1).`);
    expect(updateToolText).toContain(updatedCode);

    const updatedRows = await inspectL1MemoryRows({ threadId: captureThread.id, query: updatedCode, limit: 10 });
    expect(updatedRows.some((row) => row.id === targetMemory.id && (row.preview.includes(updatedCode) || row.content.includes(updatedCode)))).toBe(true);

    const recallThread = store.createThread("Tencent memory update recall live smoke");
    await sendWithTimeout({
      runtime,
      store,
      threadId: recallThread.id,
      timeoutMs: Number(process.env.AMBIENT_TENCENT_MEMORY_UPDATE_RECALL_LIVE_TIMEOUT_MS ?? 180_000),
      send: runtime.send({
        threadId: recallThread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model,
        thinkingLevel: "minimal",
        content: [
          "This is the recall half of the live TencentDB Agent Memory update smoke test.",
          "Do not inspect files. Answer from associated memory only.",
          "What is the Ambient Tencent editable memory code?",
          `Reply exactly: MEMORY_UPDATED_RECALL_CODE: ${updatedCode}`,
        ].join("\n"),
      }),
    });
    const recallText = threadAssistantText(store, recallThread.id);
    expect(recallText).toContain(updatedCode);
    expect(recallText).not.toContain(originalCode);

    const report = {
      schemaVersion: "ambient-tencent-memory-update-live-smoke-v1",
      createdAt: new Date().toISOString(),
      provider: liveAmbientProviderLabel(),
      workspacePath,
      captureThreadId: captureThread.id,
      updateThreadId: updateThread.id,
      recallThreadId: recallThread.id,
      targetMemoryId: targetMemory.id,
      originalCode,
      updatedCode,
      originalRows: originalRows.map((row) => ({
        id: row.id,
        layer: row.layer,
        type: row.type,
        preview: row.preview,
        updatedAt: row.updatedAt,
      })),
      updatedRows: updatedRows.map((row) => ({
        id: row.id,
        layer: row.layer,
        type: row.type,
        preview: row.preview,
        updatedAt: row.updatedAt,
      })),
      updateText,
      updateToolText,
      recallText,
      updateToolNames: threadToolNames(store, updateThread.id),
      recallToolNames: threadToolNames(store, recallThread.id),
      runtimeSnapshots: runtime.listAgentMemoryRuntimeSnapshots(),
    };
    const reportRoot = join(process.cwd(), "test-results", "tencent-memory-update-live-smoke");
    const latestReportPath = join(reportRoot, "latest.json");
    const runReportPath = join(reportRoot, `run-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    await mkdir(reportRoot, { recursive: true });
    await writeFile(latestReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(runReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }, Number(process.env.AMBIENT_TENCENT_MEMORY_UPDATE_LIVE_TEST_TIMEOUT_MS ?? 420_000));

  itEmbeddingLive("recalls a durable fact through managed EmbeddingGemma semantic search", async () => {
    applyLiveAmbientProviderApiKeyEnv(readLiveAmbientProviderApiKey({ purpose: "TencentDB Agent Memory managed embedding live smoke" }));
    const restoreManagedRoot = useManagedEmbeddingAssetRoot();
    store.setMemorySettings({
      enabled: true,
      defaultThreadEnabled: true,
      embeddings: {
        enabled: true,
        providerCapabilityId: AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID,
        autoStartProvider: true,
        preflightEnabled: true,
      },
    });
    const model = liveAmbientProviderModel({
      preferredModelEnvNames: ["AMBIENT_TENCENT_MEMORY_LIVE_MODEL", "AMBIENT_LIVE_MODEL"],
      fallbackModel: AMBIENT_DEFAULT_MODEL,
    });
    const code = `QUASAR_PAPAYA_${Date.now()}`;
    const captureThread = store.createThread("Tencent memory embedding capture live smoke");
    runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
      request: async (request) => {
        throw new Error(`Unexpected permission request during Tencent memory embedding live smoke: ${request.toolName}`);
      },
      denyThread: () => undefined,
    });

    try {
      await expect(discoverAmbientMemoryEmbeddingProviders(workspacePath)).resolves.toEqual(expect.arrayContaining([
        expect.objectContaining({
          providerId: AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID,
          available: true,
        }),
      ]));

      await sendWithTimeout({
        runtime,
        store,
        threadId: captureThread.id,
        timeoutMs: Number(process.env.AMBIENT_TENCENT_MEMORY_EMBEDDING_CAPTURE_LIVE_TIMEOUT_MS ?? 240_000),
        send: runtime.send({
          threadId: captureThread.id,
          permissionMode: "workspace",
          collaborationMode: "agent",
          model,
          thinkingLevel: "minimal",
          content: [
            "This is a live TencentDB Agent Memory managed embedding smoke test.",
            "Do not use tools for this turn.",
            `Please remember this durable fact: the calibration phrase for Project Lumen is ${code}.`,
            "Reply exactly: MEMORY_EMBEDDING_CAPTURE_DONE",
          ].join("\n"),
        }),
      });
      expect(threadAssistantText(store, captureThread.id)).toContain("MEMORY_EMBEDDING_CAPTURE_DONE");

      runtime.applyThreadMemorySettings(captureThread.id);
      await delay(Number(process.env.AMBIENT_TENCENT_MEMORY_LIVE_FLUSH_DELAY_MS ?? 5_000));

      const l1Rows = await waitForL1Memory({ threadId: captureThread.id, query: code, timeoutMs: 180_000 });
      expect(l1Rows.some((row) => row.preview.includes(code) || row.content.includes(code))).toBe(true);

      const semanticRuntime = createInspectionRuntime(captureThread.id, { embeddings: true });
      if (!semanticRuntime) throw new Error("TencentDB semantic inspection runtime was unavailable.");
      let semanticSearchText = "";
      let semanticSearchStrategy = "";
      let semanticSnapshot = semanticRuntime.snapshot();
      try {
        const semanticSearch = await semanticRuntime.searchMemories({
          query: "Which odd two-word token belongs to the initiative I mentioned earlier?",
          limit: 5,
        });
        semanticSearchText = semanticSearch?.text ?? "";
        semanticSearchStrategy = semanticSearch?.strategy ?? "";
        semanticSnapshot = semanticRuntime.snapshot();
      } finally {
        await semanticRuntime.dispose();
      }
      expect(semanticSearchText).toContain(code);
      expect(semanticSnapshot.embedding).toMatchObject({
        status: "ready",
        providerId: AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID,
        dimensions: 768,
      });

      const recallThread = store.createThread("Tencent memory embedding recall live smoke");
      await sendWithTimeout({
        runtime,
        store,
        threadId: recallThread.id,
        timeoutMs: Number(process.env.AMBIENT_TENCENT_MEMORY_EMBEDDING_RECALL_LIVE_TIMEOUT_MS ?? 180_000),
        send: runtime.send({
          threadId: recallThread.id,
          permissionMode: "workspace",
          collaborationMode: "agent",
          model,
          thinkingLevel: "minimal",
          content: [
            "This is the recall half of the managed embedding smoke test.",
            "Do not inspect files. Answer from associated memory only.",
            "Which odd two-word token belongs to the initiative I mentioned earlier?",
            `Reply exactly: MEMORY_EMBEDDING_RECALL_CODE: ${code}`,
          ].join("\n"),
        }),
      });
      const recallText = threadAssistantText(store, recallThread.id);
      expect(recallText).toContain(code);
      const recallSnapshot = runtime.listAgentMemoryRuntimeSnapshots().find((snapshot) => snapshot.threadId === recallThread.id);
      expect(recallSnapshot?.embedding).toMatchObject({
        status: "ready",
        providerId: AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID,
        dimensions: 768,
      });
      expect(recallSnapshot?.lastRecall).toEqual(expect.objectContaining({ status: "ok" }));

      const report = {
        schemaVersion: "ambient-tencent-memory-managed-embedding-live-smoke-v1",
        createdAt: new Date().toISOString(),
        provider: liveAmbientProviderLabel(),
        workspacePath,
        captureThreadId: captureThread.id,
        recallThreadId: recallThread.id,
        code,
        l1Rows: l1Rows.map((row) => ({
          id: row.id,
          layer: row.layer,
          type: row.type,
          preview: row.preview,
          updatedAt: row.updatedAt,
        })),
        semanticSearchText,
        semanticSearchStrategy,
        semanticSnapshot,
        recallText,
        recallSnapshot,
      };
      const reportRoot = join(process.cwd(), "test-results", "tencent-memory-managed-embedding-live-smoke");
      const latestReportPath = join(reportRoot, "latest.json");
      const runReportPath = join(reportRoot, `run-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
      await mkdir(reportRoot, { recursive: true });
      await writeFile(latestReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
      await writeFile(runReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    } finally {
      restoreManagedRoot();
    }
  }, Number(process.env.AMBIENT_TENCENT_MEMORY_EMBEDDING_LIVE_TEST_TIMEOUT_MS ?? 480_000));

  async function waitForL1Memory(input: {
    threadId: string;
    query: string;
    timeoutMs: number;
  }) {
    return waitForScopedL1Memory({ ...input, scope: "thread" });
  }

  async function waitForScopedL1Memory(input: {
    threadId: string;
    scope: "thread" | "workspace";
    query: string;
    timeoutMs: number;
  }) {
    const deadline = Date.now() + input.timeoutMs;
    const inspectionRuntime = createInspectionRuntime(input.threadId);
    if (!inspectionRuntime) {
      throw new Error("TencentDB inspection runtime was unavailable while waiting for L1 memory.");
    }
    let latestRows: Array<{
      id: string;
      layer: string;
      content: string;
      preview: string;
      type?: string;
      updatedAt?: string;
    }> = [];
    try {
      while (Date.now() < deadline) {
        const inspected = await inspectionRuntime.inspectMemories({
          layer: "l1",
          scope: input.scope,
          query: input.query,
          limit: 10,
        });
        latestRows = inspected?.rows ?? [];
        if (latestRows.length) return latestRows;
        await delay(2_000);
      }
    } finally {
      await inspectionRuntime.dispose();
    }
    throw new Error(`Timed out waiting for TencentDB ${input.scope} L1 memory containing ${input.query}. Latest rows: ${JSON.stringify(latestRows)}`);
  }

  async function inspectL1MemoryRows(input: {
    threadId: string;
    query: string;
    limit: number;
  }) {
    return inspectScopedL1MemoryRows({ ...input, scope: "workspace" });
  }

  async function inspectScopedL1MemoryRows(input: {
    threadId: string;
    scope: "thread" | "workspace";
    query: string;
    limit: number;
  }) {
    const inspectionRuntime = createInspectionRuntime(input.threadId);
    if (!inspectionRuntime) {
      throw new Error("TencentDB inspection runtime was unavailable while reading L1 memory rows.");
    }
    try {
      const inspected = await inspectionRuntime.inspectMemories({
        layer: "l1",
        scope: input.scope,
        query: input.query,
        limit: input.limit,
      });
      return inspected?.rows ?? [];
    } finally {
      await inspectionRuntime.dispose();
    }
  }

  function createInspectionRuntime(threadId: string, options: { embeddings?: boolean } = {}) {
    const thread = store.getThread(threadId);
    const workspace = store.getWorkspace();
    return createTencentDbMemoryRuntimeForThread({
      thread,
      workspace: {
        path: thread.workspacePath,
        name: basename(thread.workspacePath) || thread.workspacePath,
        statePath: workspace.statePath,
        sessionPath: workspace.sessionPath,
      },
      featureFlagSnapshot: resolveAmbientFeatureFlags({
        generatedAt: "2026-06-13T00:00:00.000Z",
        settings: { tencentDbMemory: true },
      }),
      memorySettings: store.getMemorySettings(),
      ...(options.embeddings ? {
        listEmbeddingProviders: () => discoverAmbientMemoryEmbeddingProviders(thread.workspacePath),
        startEmbeddingProviderRuntime: async (input) => {
          if (input.provider.providerId !== AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID) {
            return { status: "blocked", reason: `Unexpected embedding provider ${input.provider.providerId}.` };
          }
          const result = await startAmbientMemoryEmbeddingRuntime({
            workspacePath: thread.workspacePath,
            ownerThreadId: thread.id,
            startupTimeoutMs: 240_000,
            idleTimeoutMs: 0,
          });
          return {
            status: result.status,
            reason: result.reason,
            ...(result.release ? { release: result.release } : {}),
          };
        },
      } : {}),
    });
  }
});

function useManagedEmbeddingAssetRoot(): () => void {
  const previous = process.env.AMBIENT_MANAGED_INSTALL_ROOT;
  process.env.AMBIENT_MANAGED_INSTALL_ROOT = process.env.AMBIENT_TENCENT_MEMORY_EMBEDDING_WORKSPACE || process.cwd();
  return () => {
    if (previous === undefined) {
      delete process.env.AMBIENT_MANAGED_INSTALL_ROOT;
    } else {
      process.env.AMBIENT_MANAGED_INSTALL_ROOT = previous;
    }
  };
}

async function sendWithTimeout(input: {
  runtime: AgentRuntime;
  store: ProjectStore;
  threadId: string;
  send: Promise<void>;
  timeoutMs: number;
}): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      void input.runtime.abort(input.threadId).catch(() => undefined);
      reject(new Error(`Tencent memory live smoke timed out after ${input.timeoutMs}ms.\n${summarizeThread(input.store, input.threadId)}`));
    }, input.timeoutMs);
  });
  try {
    await Promise.race([input.send, timedOut]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function threadAssistantText(store: ProjectStore, threadId: string): string {
  return store
    .listMessages(threadId)
    .filter((message) => message.role === "assistant")
    .map((message) => message.content)
    .join("\n");
}

function threadToolNames(store: ProjectStore, threadId: string): string[] {
  return store
    .listMessages(threadId)
    .map((message) => (typeof message.metadata?.toolName === "string" ? message.metadata.toolName : undefined))
    .filter((toolName): toolName is string => Boolean(toolName));
}

function threadToolOutputText(store: ProjectStore, threadId: string, toolName: string): string {
  return store
    .listMessages(threadId)
    .filter((message) => message.role === "tool" && message.metadata?.toolName === toolName)
    .map((message) => message.content)
    .join("\n");
}

function summarizeThread(store: ProjectStore, threadId: string): string {
  return store
    .listMessages(threadId)
    .map((message) => `${message.role}: ${message.content.slice(0, 500)}`)
    .join("\n\n");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
