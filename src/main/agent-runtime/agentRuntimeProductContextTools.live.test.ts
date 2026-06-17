import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import { AgentRuntime } from "./agentRuntime";
import {
  applyLiveAmbientProviderApiKeyEnv,
  liveAmbientProviderLabel,
  liveAmbientProviderModel,
  readLiveAmbientProviderApiKey,
} from "../liveAmbientProviderConfig";
import { ProjectStore } from "../projectStore/projectStore";

const itLive = process.env.AMBIENT_PRODUCT_CONTEXT_LIVE === "1" ? it : it.skip;

describe("AgentRuntime product context live smoke", () => {
  let workspacePath = "";
  let store: ProjectStore;
  let runtime: AgentRuntime | undefined;

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-product-context-live-"));
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
  });

  afterEach(async () => {
    if (runtime) {
      await runtime.shutdownPluginMcpServers();
      runtime = undefined;
    }
    store.close();
    await rm(workspacePath, { recursive: true, force: true });
  });

  itLive("lets live Pi use canonical Ambient product context for identity", async () => {
    applyLiveAmbientProviderApiKeyEnv(readLiveAmbientProviderApiKey({ purpose: "product context live smoke" }));
    const thread = store.createThread("Product context live smoke");
    runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
      request: async (request) => {
        throw new Error(`Unexpected permission request during product context live smoke: ${request.toolName}`);
      },
      denyThread: () => undefined,
    });

    const prompt = [
      "This is a live Ambient Desktop product identity smoke test.",
      "Do exactly this:",
      "1. Call ambient_tool_search with query: Ambient product identity Ambient Network official websites.",
      "2. Call ambient_tool_describe with name: ambient_product_context.",
      "3. Call ambient_product_context directly with topic network if Desktop activated it; otherwise call ambient_tool_call for ambient_product_context with toolInput { \"topic\": \"network\" }.",
      "4. Reply with a concise answer that includes PRODUCT_CONTEXT_LIVE_DONE, Ambient Desktop, Ambient Network, and desktop.ambient.xyz.",
      "Do not use filesystem, shell, browser, network, plugin, MCP, connector, or mutation tools.",
    ].join("\n");

    await sendWithTimeout({
      runtime,
      store,
      threadId: thread.id,
      timeoutMs: Number(process.env.AMBIENT_PRODUCT_CONTEXT_LIVE_TIMEOUT_MS ?? 180_000),
      send: runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: liveAmbientProviderModel({ fallbackModel: AMBIENT_DEFAULT_MODEL }),
        thinkingLevel: "minimal",
        content: prompt,
      }),
    });

    const toolNames = threadToolNames(store, thread.id);
    const transcript = threadTranscript(store, thread.id);
    const assistantText = store
      .listMessages(thread.id)
      .filter((message) => message.role === "assistant")
      .map((message) => message.content)
      .join("\n");
    const report = {
      createdAt: new Date().toISOString(),
      provider: liveAmbientProviderLabel(),
      workspacePath,
      threadId: thread.id,
      toolNames,
      assistantText,
      transcript,
    };
    const reportRoot = join(process.cwd(), "test-results", "product-context-live-smoke");
    await mkdir(reportRoot, { recursive: true });
    await writeFile(join(reportRoot, "latest.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(join(reportRoot, `run-${new Date().toISOString().replace(/[:.]/g, "-")}.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");

    expect(toolNames).toContain("ambient_tool_search");
    expect(toolNames).toContain("ambient_tool_describe");
    expect(toolNames.some((name) => name === "ambient_product_context" || name === "ambient_tool_call")).toBe(true);
    expect(transcript).toContain("ambient_product_context");
    expect(transcript).toContain("Ambient Desktop is growing into the workstation/client for Ambient Network operations.");
    expect(assistantText).toContain("PRODUCT_CONTEXT_LIVE_DONE");
    expect(assistantText).toContain("Ambient Desktop");
    expect(assistantText).toContain("Ambient Network");
  }, Number(process.env.AMBIENT_PRODUCT_CONTEXT_LIVE_TEST_TIMEOUT_MS ?? 240_000));
});

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
      reject(new Error(`Product context live smoke timed out after ${input.timeoutMs}ms.\n${summarizeThread(input.store, input.threadId)}`));
    }, input.timeoutMs);
  });
  try {
    await Promise.race([input.send, timedOut]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function threadTranscript(store: ProjectStore, threadId: string): string {
  return store
    .listMessages(threadId)
    .map((message) => message.content)
    .join("\n\n--- MESSAGE ---\n\n");
}

function threadToolNames(store: ProjectStore, threadId: string): string[] {
  return store
    .listMessages(threadId)
    .map((message) => (typeof message.metadata?.toolName === "string" ? message.metadata.toolName : undefined))
    .filter((toolName): toolName is string => Boolean(toolName));
}

function summarizeThread(store: ProjectStore, threadId: string): string {
  const messages = store.listMessages(threadId);
  return messages
    .slice(-8)
    .map((message) => `${message.role}: ${message.content.slice(0, 1_000)}`)
    .join("\n---\n");
}
