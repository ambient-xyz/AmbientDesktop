import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { AMBIENT_KIMI_K2_7_CODE_MODEL } from "../../shared/ambientModels";
import { AgentRuntime } from "./agentRuntime";
import { ProjectStore } from "./agentRuntimeProjectStoreFacade";

describe("AgentRuntime visible thinking", () => {
  it("streams Kimi thinking events as visible thinking messages", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-kimi-thinking-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const created = store.createThread("kimi thinking streaming");
      const threadSessionDir = join(workspace.sessionPath, created.id);
      await mkdir(threadSessionDir, { recursive: true });
      const sessionFile = join(threadSessionDir, "session.jsonl");
      await writeFile(sessionFile, "", "utf8");
      const thread = store.updateThreadSettings(created.id, {
        model: AMBIENT_KIMI_K2_7_CODE_MODEL,
        piSessionFile: sessionFile,
      });

      const subscribers: Array<(event: any) => void> = [];
      const emit = (event: any) => {
        for (const subscriber of [...subscribers]) subscriber(event);
      };
      const thinkingText = "This reasoning should stream into the thinking panel.";
      const finalText = "thinking-ok";
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
        prompt: vi.fn(async () => {
          emit({ type: "message_update", assistantMessageEvent: { type: "thinking_start" } });
          emit({ type: "message_update", assistantMessageEvent: { type: "thinking_delta", delta: thinkingText } });
          emit({ type: "message_update", assistantMessageEvent: { type: "thinking_end", content: thinkingText } });
          emit({
            type: "message_end",
            message: {
              role: "assistant",
              stopReason: "stop",
              content: [{ type: "text", text: finalText }],
            },
          });
        }),
        steer: vi.fn(async () => undefined),
        compact: vi.fn(async () => undefined),
        agent: {
          abort: vi.fn(),
          waitForIdle: vi.fn(async () => undefined),
        },
      };

      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });
      vi.spyOn(runtime as any, "getSession").mockResolvedValue(session);

      await runtime.send({
        threadId: thread.id,
        content: "Answer after thinking.",
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: AMBIENT_KIMI_K2_7_CODE_MODEL,
        thinkingLevel: "medium",
        delivery: "prompt",
        context: [],
      });

      const assistantMessages = store.listMessages(thread.id).filter((message) => message.role === "assistant");
      const thinkingMessage = assistantMessages.find((message) => message.metadata?.kind === "thinking");
      expect(thinkingMessage).toMatchObject({
        content: thinkingText,
        metadata: expect.objectContaining({
          kind: "thinking",
          runtime: "pi",
          provider: "ambient",
          status: "done",
        }),
      });
      expect(assistantMessages.find((message) => message.content === finalText)).toMatchObject({
        content: finalText,
        metadata: expect.objectContaining({ status: "done" }),
      });
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});

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
