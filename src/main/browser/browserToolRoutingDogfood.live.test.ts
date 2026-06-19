import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { safeStorage } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import { AgentRuntime } from "./browserAgentRuntimeDogfoodFacade";
import { BrowserCredentialStore } from "./browserCredentialStore";
import { BrowserService } from "./browserService";
import { ProjectStore } from "./browserProjectStoreFacade";

const electronMock = vi.hoisted(() => ({
  userDataPath: `${process.env.TMPDIR || "/tmp"}/ambient-browser-routing-dogfood-electron`,
}));

vi.mock("electron", () => ({
  app: {
    getPath: () => electronMock.userDataPath,
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value, "utf8"),
    decryptString: (value: Buffer) => value.toString("utf8"),
  },
}));

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;
const itLive = process.env.AMBIENT_BROWSER_ROUTING_LIVE === "1" ? it : it.skip;
const activeBrowsers = new Set<BrowserService>();

describeNative("Browser tool routing live dogfood", () => {
  let workspacePath = "";
  let store: ProjectStore;
  let runtime: AgentRuntime | undefined;
  let server: Server | undefined;

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-browser-routing-dogfood-"));
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
  });

  afterEach(async () => {
    await closeServer(server);
    server = undefined;
    await runtime?.shutdownPluginMcpServers();
    runtime = undefined;
    for (const browser of activeBrowsers) await browser.shutdown();
    activeBrowsers.clear();
    store.close();
    await rm(workspacePath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  });

  itLive("uses direct browser tools for local app verification without router schema failures", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live browser routing dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;

    const fixture = await startFixtureServer();
    server = fixture.server;
    const thread = store.createThread("Browser routing dogfood", workspacePath, { permissionMode: "full-access" });
    runtime = createDogfoodRuntime(store);

    await sendWithTimeout({
      runtime,
      store,
      threadId: thread.id,
      timeoutMs: 300_000,
      send: runtime.send({
        threadId: thread.id,
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: process.env.AMBIENT_BROWSER_ROUTING_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "This is an Ambient Desktop browser tool routing dogfood test against a local fixture.",
          `Open ${fixture.pageUrl} using browser_nav.`,
          "Then call browser_eval with exactly this JavaScript: return { title: document.title, before: document.querySelector('#status')?.textContent };",
          "Then call browser_keypress with the ArrowRight key.",
          "Then call browser_eval with exactly this JavaScript: return { after: document.querySelector('#status')?.textContent, moves: window.__ambientMoves };",
          "Then call browser_screenshot.",
          "Do not use ambient_tool_call for browser tools. Do not use shell, bash, read, write, or edit.",
          "After the screenshot succeeds, answer with one short sentence containing BROWSER_ROUTING_LIVE_OK and the move count.",
        ].join("\n"),
      }),
    });

    const messages = store.listMessages(thread.id);
    const transcript = messages.map((message) => message.content).join("\n");
    const toolNames = messages.map((message) => message.metadata?.toolName).filter(Boolean);
    const finalAssistant = [...messages].reverse().find((message) => message.role === "assistant")?.content ?? "";

    expect(toolNames).toContain("browser_nav");
    expect(toolNames).toContain("browser_eval");
    expect(toolNames).toContain("browser_keypress");
    expect(toolNames).toContain("browser_screenshot");
    expect(toolNames).not.toContain("ambient_tool_call");
    expect(transcript).not.toMatch(/Validation failed for tool "ambient_tool_call"|must have required properties input|<arg_key>|<arg_value>/i);
    expect(finalAssistant).toContain("BROWSER_ROUTING_LIVE_OK");
  }, 360_000);
});

function createDogfoodRuntime(store: ProjectStore): AgentRuntime {
  const browser = new BrowserService(() => store.getWorkspace());
  activeBrowsers.add(browser);
  return new AgentRuntime(
    store,
    browser,
    new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
    () => undefined,
    {
      request: async (request) => {
        throw new Error(`Unexpected permission prompt during browser routing dogfood: ${request.title}`);
      },
      denyThread: () => undefined,
    },
  );
}

async function startFixtureServer(): Promise<{ server: Server; pageUrl: string }> {
  const server = createServer((request, response) => {
    if (request.url !== "/") {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("not found");
      return;
    }
    const html = [
      "<!doctype html>",
      "<title>Ambient Browser Routing Fixture</title>",
      "<main>",
      "<h1>Browser routing fixture</h1>",
      '<p id="status">ready</p>',
      "<script>",
      "window.__ambientMoves = 0;",
      "document.addEventListener('keydown', (event) => {",
      "  if (event.key === 'ArrowRight') {",
      "    window.__ambientMoves += 1;",
      "    document.querySelector('#status').textContent = `moved ${window.__ambientMoves}`;",
      "  }",
      "});",
      "</script>",
      "</main>",
    ].join("");
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "content-length": String(Buffer.byteLength(html)),
    });
    response.end(html);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  return { server, pageUrl: `http://127.0.0.1:${address.port}/` };
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
      reject(
        new Error(
          [
            `Browser routing dogfood timed out after ${input.timeoutMs}ms.`,
            summarizeThread(input.store, input.threadId),
          ].join("\n"),
        ),
      );
    }, input.timeoutMs);
  });
  try {
    await Promise.race([input.send, timedOut]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function summarizeThread(store: ProjectStore, threadId: string): string {
  const messages = store.listMessages(threadId);
  const toolNames = messages.map((message) => message.metadata?.toolName).filter(Boolean);
  const tail = messages
    .slice(-10)
    .map((message) => {
      const tool = message.metadata?.toolName ? ` tool=${message.metadata.toolName}` : "";
      const status = message.metadata?.status ? ` status=${message.metadata.status}` : "";
      return `${message.role}${tool}${status}: ${message.content.replace(/\s+/g, " ").slice(0, 600)}`;
    })
    .join("\n");
  return [`Tool calls: ${toolNames.length ? toolNames.join(", ") : "none"}`, "Transcript tail:", tail || "(no messages)"].join("\n");
}

function closeServer(server?: Server): Promise<void> {
  if (!server) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
