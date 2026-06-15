import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { safeStorage } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AMBIENT_DEFAULT_MODEL } from "../shared/ambientModels";
import { AgentRuntime } from "./agentRuntime";
import { BrowserCredentialStore } from "./browserCredentialStore";
import { BrowserService } from "./browserService";
import { ProjectStore } from "./projectStore";
import { readWorkspaceFile } from "./workspaceFiles";

const electronMock = vi.hoisted(() => ({
  userDataPath: `${process.env.TMPDIR || "/tmp"}/ambient-media-dogfood-electron`,
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
const itLive = process.env.AMBIENT_MEDIA_ACQUISITION_LIVE === "1" ? it : it.skip;
const itPublicLive = process.env.AMBIENT_MEDIA_ACQUISITION_PUBLIC_LIVE === "1" ? it : it.skip;
const itLicenseLive = process.env.AMBIENT_MEDIA_ACQUISITION_LICENSE_LIVE === "1" ? it : it.skip;
const itCandidateLive = process.env.AMBIENT_MEDIA_ACQUISITION_CANDIDATES_LIVE === "1" ? it : it.skip;
const itWikimediaLive = process.env.AMBIENT_MEDIA_ACQUISITION_WIKIMEDIA_LIVE === "1" ? it : it.skip;
const activeDogfoodBrowserServices = new Set<BrowserService>();

describeNative("Media acquisition live dogfood", () => {
  let workspacePath = "";
  let store: ProjectStore;
  let runtime: AgentRuntime | undefined;
  let server: Server | undefined;

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-media-dogfood-"));
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
  });

  afterEach(async () => {
    await closeServer(server);
    server = undefined;
    await runtime?.shutdownPluginMcpServers();
    runtime = undefined;
    for (const browser of activeDogfoodBrowserServices) {
      await browser.shutdown();
    }
    activeDogfoodBrowserServices.clear();
    store.close();
    await rm(workspacePath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  });

  itLive("downloads a valid image through media_download and acknowledges inline rendering", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live media acquisition dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;

    const fixture = await startMediaFixtureServer();
    server = fixture.server;
    const thread = store.createThread("Media acquisition dogfood");
    runtime = createDogfoodRuntime(store);

    await runtime.send({
      threadId: thread.id,
      permissionMode: "full-access",
      collaborationMode: "agent",
      model: process.env.AMBIENT_MEDIA_ACQUISITION_MODEL ?? AMBIENT_DEFAULT_MODEL,
      thinkingLevel: "minimal",
      content: [
        "This is an Ambient Desktop media acquisition dogfood test.",
        `Download this image URL and display it inline: ${fixture.imageUrl}`,
        "Use a workspace-visible artifact path. After the media is displayed inline, answer with one short sentence containing the exact token MEDIA_DOGFOOD_OK and the artifact path.",
      ].join("\n"),
    });

    const messages = store.listMessages(thread.id);
    const transcript = messages.map((message) => message.content).join("\n");
    const toolNames = messages.map((message) => message.metadata?.toolName).filter(Boolean);
    const artifactPath = messages
      .map((message) => message.metadata?.artifactPath)
      .find((value): value is string => typeof value === "string" && value.endsWith(".png"));
    const finalAssistant = [...messages].reverse().find((message) => message.role === "assistant")?.content ?? "";

    expect(toolNames).toContain("media_download");
    expect(artifactPath).toBeTruthy();
    await expect(readWorkspaceFile(workspacePath, artifactPath!)).resolves.toMatchObject({
      kind: "image",
      mimeType: "image/png",
      binary: true,
    });
    expect(finalAssistant).toContain("MEDIA_DOGFOOD_OK");
    expect(finalAssistant).not.toMatch(/can't render|cannot render|can't display|cannot display|doesn't support inline|unsupported inline/i);
  }, 180_000);

  itLive("rejects HTML masquerading as an image without unsupported inline-rendering claims", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live media acquisition dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;

    const fixture = await startMediaFixtureServer();
    server = fixture.server;
    const thread = store.createThread("Invalid media acquisition dogfood");
    runtime = createDogfoodRuntime(store);

    await runtime.send({
      threadId: thread.id,
      permissionMode: "full-access",
      collaborationMode: "agent",
      model: process.env.AMBIENT_MEDIA_ACQUISITION_MODEL ?? AMBIENT_DEFAULT_MODEL,
      thinkingLevel: "minimal",
      content: [
        "This is an Ambient Desktop invalid media acquisition dogfood test.",
        `Download this image URL and display it inline: ${fixture.htmlAsImageUrl}`,
        "If the URL is not valid image media, do not keep retrying and do not use shell/curl. Answer with one short sentence containing the exact token MEDIA_DOGFOOD_INVALID_OK and explain that the URL did not contain a valid image.",
      ].join("\n"),
    });

    const messages = store.listMessages(thread.id);
    const transcript = messages.map((message) => message.content).join("\n");
    const toolNames = messages.map((message) => message.metadata?.toolName).filter(Boolean);
    const artifactPaths = messages
      .map((message) => message.metadata?.artifactPath)
      .filter((value): value is string => typeof value === "string");
    const finalAssistant = [...messages].reverse().find((message) => message.role === "assistant")?.content ?? "";

    expect(toolNames).toContain("media_download");
    expect(transcript).toMatch(/expected image\/\* but received text\/html|not valid image media|not a supported image/i);
    expect(artifactPaths).toEqual([]);
    expect(finalAssistant).toContain("MEDIA_DOGFOOD_INVALID_OK");
    expect(finalAssistant).not.toMatch(/can't render|cannot render|can't display|cannot display|doesn't support inline|unsupported inline/i);
  }, 180_000);

  itLive("preserves long browser_eval input metadata from a live Ambient run", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live browser eval dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;

    const fixture = await startMediaFixtureServer();
    server = fixture.server;
    const thread = store.createThread("Browser eval longform dogfood");
    runtime = createDogfoodRuntime(store);
    const longEvalCode = [
      "const values = Array.from(document.querySelectorAll('[data-row]')).map((node) => node.textContent?.trim()).filter(Boolean);",
      `const diagnostic = ${JSON.stringify("ambient-longform-browser-eval-".repeat(24))};`,
      "return { joined: values.join('|'), diagnosticLength: diagnostic.length };",
    ].join("\n");
    expect(longEvalCode.length).toBeGreaterThan(500);

    await sendWithDogfoodTimeout({
      runtime,
      store,
      threadId: thread.id,
      timeoutMs: 240_000,
      send: runtime.send({
        threadId: thread.id,
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: process.env.AMBIENT_MEDIA_ACQUISITION_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "This is an Ambient Desktop browser_eval longform display dogfood test.",
          `First use browser_navigate to open ${fixture.pageUrl}.`,
          "Then call browser_eval exactly once with the following exact JavaScript code argument:",
          "```javascript",
          longEvalCode,
          "```",
          "Do not use shell, bash, read, write, edit, or media_download.",
          "After browser_eval returns, answer with one short sentence containing BROWSER_EVAL_LONGFORM_OK and the joined value.",
        ].join("\n"),
      }),
    });

    const messages = store.listMessages(thread.id);
    const toolNames = messages.map((message) => message.metadata?.toolName).filter(Boolean);
    const browserEvalMessage = messages.find(
      (message) => message.metadata?.toolName === "browser_eval" && message.metadata?.toolLongformInputPreview,
    );
    const longformPreview = browserEvalMessage?.metadata?.toolLongformInputPreview;
    const finalAssistant = [...messages].reverse().find((message) => message.role === "assistant")?.content ?? "";

    expect(toolNames.some((name) => name === "browser_navigate" || name === "browser_nav")).toBe(true);
    expect(toolNames).toContain("browser_eval");
    expect(longformPreview).toMatchObject({
      kind: "longform-input",
      title: "Code",
      summary: expect.stringMatching(/^JavaScript · [\d,]+ chars$/),
      items: [
        {
          fieldPath: "code",
          language: "javascript",
          chars: expect.any(Number),
        },
      ],
    });
    expect((longformPreview as { items?: Array<{ chars?: number }> } | undefined)?.items?.[0]?.chars).toBeGreaterThan(500);
    expect(finalAssistant).toContain("BROWSER_EVAL_LONGFORM_OK");
  }, 300_000);

  itLive("preserves large browser_eval output metadata from a live Ambient run", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live browser eval output dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;

    const fixture = await startMediaFixtureServer();
    server = fixture.server;
    const thread = store.createThread("Browser eval large output dogfood");
    runtime = createDogfoodRuntime(store);
    const evalCode = [
      "return Array.from({ length: 1600 }, (_, index) => `Browser eval output row ${index + 1}.`).join('\\n');",
    ].join("\n");

    await sendWithDogfoodTimeout({
      runtime,
      store,
      threadId: thread.id,
      timeoutMs: 300_000,
      send: runtime.send({
        threadId: thread.id,
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: process.env.AMBIENT_MEDIA_ACQUISITION_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "This is an Ambient Desktop browser_eval large output display dogfood test.",
          `First call browser_nav with url set to ${fixture.pageUrl}.`,
          "Then call browser_eval exactly once with this exact JavaScript code:",
          "```javascript",
          evalCode,
          "```",
          "Do not use shell, bash, read, write, edit, browser_content, or media_download.",
          "After browser_eval returns, answer with one short sentence containing BROWSER_EVAL_LARGE_OUTPUT_OK and say the output was generated.",
        ].join("\n"),
      }),
    });

    const messages = store.listMessages(thread.id);
    const toolNames = messages.map((message) => message.metadata?.toolName).filter(Boolean);
    const browserEvalMessage = messages.find(
      (message) => message.metadata?.toolName === "browser_eval" && message.metadata?.toolResultDetails,
    );
    const largeOutputPreview = (browserEvalMessage?.metadata?.toolResultDetails as
      | { largeOutputPreview?: { items?: Array<{ chars?: number; previewChars?: number; artifactPath?: string }> } }
      | undefined)?.largeOutputPreview;
    const artifactPath = largeOutputPreview?.items?.[0]?.artifactPath;
    const finalAssistant = [...messages].reverse().find((message) => message.role === "assistant")?.content ?? "";

    expect(toolNames.some((name) => name === "browser_navigate" || name === "browser_nav")).toBe(true);
    expect(toolNames).toContain("browser_eval");
    expect(largeOutputPreview?.items?.[0]?.chars).toBeGreaterThan(12_000);
    expect(largeOutputPreview?.items?.[0]?.previewChars).toBe(12_000);
    expect(artifactPath).toMatch(/^\.ambient\/tool-outputs\/.+\.txt$/);
    const artifact = await readWorkspaceFile(workspacePath, artifactPath!);
    expect(artifact.content).toContain("Browser eval output row 1600.");
    expect(finalAssistant).toContain("BROWSER_EVAL_LARGE_OUTPUT_OK");
  }, 360_000);

  itLive("preserves large browser_content output metadata from a live Ambient run", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live browser content output dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;

    const fixture = await startMediaFixtureServer();
    server = fixture.server;
    const thread = store.createThread("Browser content large output dogfood");
    runtime = createDogfoodRuntime(store);

    await sendWithDogfoodTimeout({
      runtime,
      store,
      threadId: thread.id,
      timeoutMs: 300_000,
      send: runtime.send({
        threadId: thread.id,
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: process.env.AMBIENT_MEDIA_ACQUISITION_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "This is an Ambient Desktop browser_content large output display dogfood test.",
          `Call browser_content exactly once with url set to ${fixture.longPageUrl}.`,
          "Do not call browser_nav or browser_navigate first.",
          "Do not use shell, bash, read, write, edit, browser_eval, or media_download.",
          "After browser_content returns, answer with one short sentence containing BROWSER_CONTENT_LARGE_OUTPUT_OK and the page title.",
        ].join("\n"),
      }),
    });

    const messages = store.listMessages(thread.id);
    const toolNames = messages.map((message) => message.metadata?.toolName).filter(Boolean);
    const browserContentMessage = messages.find(
      (message) => message.metadata?.toolName === "browser_content" && message.metadata?.toolResultDetails,
    );
    const largeOutputPreview = (browserContentMessage?.metadata?.toolResultDetails as
      | { largeOutputPreview?: { items?: Array<{ chars?: number; previewChars?: number; artifactPath?: string }> } }
      | undefined)?.largeOutputPreview;
    const artifactPath = largeOutputPreview?.items?.[0]?.artifactPath;
    const finalAssistant = [...messages].reverse().find((message) => message.role === "assistant")?.content ?? "";

    expect(toolNames).toContain("browser_content");
    expect(largeOutputPreview?.items?.[0]?.chars).toBeGreaterThan(12_000);
    expect(largeOutputPreview?.items?.[0]?.previewChars).toBe(12_000);
    expect(artifactPath).toMatch(/^\.ambient\/tool-outputs\/.+\.txt$/);
    const artifact = await readWorkspaceFile(workspacePath, artifactPath!);
    expect(artifact.content).toContain("Ambient long output row 1800.");
    expect(finalAssistant).toContain("BROWSER_CONTENT_LARGE_OUTPUT_OK");
  }, 360_000);

  itPublicLive("finds a public web bunny image and displays it inline", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live media acquisition dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;

    const thread = store.createThread("Public bunny image dogfood");
    runtime = createDogfoodRuntime(store);

    await sendWithDogfoodTimeout({
      runtime,
      store,
      threadId: thread.id,
      timeoutMs: 240_000,
      send: runtime.send({
        threadId: thread.id,
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: process.env.AMBIENT_MEDIA_ACQUISITION_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "This is an Ambient Desktop public web media acquisition dogfood test.",
          "Please find an image of a bunny and display it inline here.",
          "After the media is displayed inline, answer with one short sentence containing the exact token MEDIA_DOGFOOD_PUBLIC_BUNNY_OK and the artifact path.",
        ].join("\n"),
      }),
    });

    const messages = store.listMessages(thread.id);
    const transcript = messages.map((message) => message.content).join("\n");
    const toolNames = messages.map((message) => message.metadata?.toolName).filter(Boolean);
    const artifactPath = messages
      .map((message) => message.metadata?.artifactPath)
      .find((value): value is string => typeof value === "string" && /\.(avif|gif|jpe?g|png|webp)$/i.test(value));
    const finalAssistant = [...messages].reverse().find((message) => message.role === "assistant")?.content ?? "";

    expect(toolNames).toContain("media_download");
    expect(transcript).not.toMatch(/SyntaxError: Unexpected token '(const|let|var)'/);
    expect(artifactPath).toBeTruthy();
    await expect(readWorkspaceFile(workspacePath, artifactPath!)).resolves.toMatchObject({
      kind: "image",
      binary: true,
    });
    expect(finalAssistant).toContain("MEDIA_DOGFOOD_PUBLIC_BUNNY_OK");
    expect(finalAssistant).not.toMatch(/can't render|cannot render|can't display|cannot display|doesn't support inline|unsupported inline/i);
  }, 300_000);

  itLicenseLive("finds a public domain or CC0 bunny image with source and license metadata", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live media acquisition dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;

    const thread = store.createThread("Public domain bunny image dogfood");
    runtime = createDogfoodRuntime(store);

    await sendWithDogfoodTimeout({
      runtime,
      store,
      threadId: thread.id,
      timeoutMs: 300_000,
      send: runtime.send({
        threadId: thread.id,
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: process.env.AMBIENT_MEDIA_ACQUISITION_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "This is an Ambient Desktop source/license media acquisition dogfood test.",
          "Please find a public domain or CC0 image of a bunny and display it inline here with source/license.",
          "Use visible source/license context before downloading. Do not claim public domain or CC0 unless the source page says so.",
          "After the media is displayed inline, answer with one short sentence containing the exact token MEDIA_DOGFOOD_CC0_BUNNY_OK, the artifact path, the source URL, and the license.",
        ].join("\n"),
      }),
    });

    const messages = store.listMessages(thread.id);
    const transcript = messages.map((message) => message.content).join("\n");
    const toolNames = messages.map((message) => message.metadata?.toolName).filter(Boolean);
    const artifactPath = messages
      .map((message) => message.metadata?.artifactPath)
      .find((value): value is string => typeof value === "string" && /\.(avif|gif|jpe?g|png|webp)$/i.test(value));
    const finalAssistant = [...messages].reverse().find((message) => message.role === "assistant")?.content ?? "";

    expect(toolNames).toContain("media_download");
    expect(transcript).not.toMatch(/SyntaxError: Unexpected token '(const|let|var)'/);
    expect(artifactPath).toBeTruthy();
    await expect(readWorkspaceFile(workspacePath, artifactPath!)).resolves.toMatchObject({
      kind: "image",
      binary: true,
    });
    const sidecar = JSON.parse(await readFile(join(workspacePath, `${artifactPath}.ambient-media.json`), "utf8")) as {
      sourceUrl?: string;
      licenseNote?: string;
    };
    expect(sidecar.sourceUrl).toMatch(/^https?:\/\//);
    expect(sidecar.licenseNote).toMatch(/\b(CC0|public domain|Creative Commons Zero)\b/i);
    expect(finalAssistant).toContain("MEDIA_DOGFOOD_CC0_BUNNY_OK");
    expect(finalAssistant).toMatch(/https?:\/\//);
    expect(finalAssistant).toMatch(/\b(CC0|public domain|Creative Commons Zero)\b/i);
    expect(finalAssistant).not.toMatch(/can't render|cannot render|can't display|cannot display|doesn't support inline|unsupported inline/i);
  }, 360_000);

  itCandidateLive("finds three candidate bunny images and displays the best one inline", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live media acquisition dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;

    const thread = store.createThread("Candidate bunny image dogfood");
    runtime = createDogfoodRuntime(store);

    await sendWithDogfoodTimeout({
      runtime,
      store,
      threadId: thread.id,
      timeoutMs: 360_000,
      send: runtime.send({
        threadId: thread.id,
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: process.env.AMBIENT_MEDIA_ACQUISITION_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "This is an Ambient Desktop candidate-selection media acquisition dogfood test.",
          "Please find three candidate bunny images and display the best one inline.",
          "Use source pages or visible image context to compare candidates before downloading the best candidate.",
          "After the best media is displayed inline, answer with one short sentence containing the exact token MEDIA_DOGFOOD_CANDIDATES_OK, the artifact path, and the exact phrase best of three candidates.",
        ].join("\n"),
      }),
    });

    const messages = store.listMessages(thread.id);
    const transcript = messages.map((message) => message.content).join("\n");
    const toolNames = messages.map((message) => message.metadata?.toolName).filter(Boolean);
    const artifactPath = messages
      .map((message) => message.metadata?.artifactPath)
      .find((value): value is string => typeof value === "string" && /\.(avif|gif|jpe?g|png|webp)$/i.test(value));
    const finalAssistant = [...messages].reverse().find((message) => message.role === "assistant")?.content ?? "";

    expect(toolNames).toContain("media_download");
    expect(transcript).not.toMatch(/SyntaxError: Unexpected token '(const|let|var)'/);
    expect(artifactPath).toBeTruthy();
    await expect(readWorkspaceFile(workspacePath, artifactPath!)).resolves.toMatchObject({
      kind: "image",
      binary: true,
    });
    expect(finalAssistant).toContain("MEDIA_DOGFOOD_CANDIDATES_OK");
    expect(finalAssistant).toMatch(/best of three candidates/i);
    expect(finalAssistant).not.toMatch(/can't render|cannot render|can't display|cannot display|doesn't support inline|unsupported inline/i);
  }, 420_000);

  itWikimediaLive("uses Wikimedia Commons to find a rabbit image and display it inline", async () => {
    const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
    if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live media acquisition dogfood.");
    process.env.AMBIENT_API_KEY = apiKey;

    const thread = store.createThread("Wikimedia rabbit image dogfood");
    runtime = createDogfoodRuntime(store);

    await sendWithDogfoodTimeout({
      runtime,
      store,
      threadId: thread.id,
      timeoutMs: 360_000,
      send: runtime.send({
        threadId: thread.id,
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: process.env.AMBIENT_MEDIA_ACQUISITION_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "This is an Ambient Desktop Wikimedia media acquisition dogfood test.",
          "Please use Wikimedia Commons to find a rabbit image and display it inline.",
          "Use the Wikimedia Commons file/source page before downloading. Pass the Wikimedia Commons page as sourceUrl to media_download.",
          "After the media is displayed inline, answer with one short sentence containing the exact token MEDIA_DOGFOOD_WIKIMEDIA_OK, the artifact path, and the Wikimedia Commons source URL.",
        ].join("\n"),
      }),
    });

    const messages = store.listMessages(thread.id);
    const transcript = messages.map((message) => message.content).join("\n");
    const toolNames = messages.map((message) => message.metadata?.toolName).filter(Boolean);
    const artifactPath = messages
      .map((message) => message.metadata?.artifactPath)
      .find((value): value is string => typeof value === "string" && /\.(avif|gif|jpe?g|png|webp)$/i.test(value));
    const finalAssistant = [...messages].reverse().find((message) => message.role === "assistant")?.content ?? "";

    expect(toolNames).toContain("media_download");
    expect(transcript).not.toMatch(/SyntaxError: Unexpected token '(const|let|var)'/);
    expect(artifactPath).toBeTruthy();
    await expect(readWorkspaceFile(workspacePath, artifactPath!)).resolves.toMatchObject({
      kind: "image",
      binary: true,
    });
    const sidecar = JSON.parse(await readFile(join(workspacePath, `${artifactPath}.ambient-media.json`), "utf8")) as {
      sourceUrl?: string;
    };
    expect(sidecar.sourceUrl).toMatch(/^https?:\/\/(commons\.)?wikimedia\.org\//i);
    expect(finalAssistant).toContain("MEDIA_DOGFOOD_WIKIMEDIA_OK");
    expect(finalAssistant).toMatch(/wikimedia/i);
    expect(finalAssistant).toMatch(/https?:\/\/(commons\.)?wikimedia\.org\//i);
    expect(finalAssistant).not.toMatch(/can't render|cannot render|can't display|cannot display|doesn't support inline|unsupported inline/i);
  }, 420_000);
});

function createDogfoodRuntime(store: ProjectStore): AgentRuntime {
  const browser = new BrowserService(() => store.getWorkspace());
  activeDogfoodBrowserServices.add(browser);
  return new AgentRuntime(
    store,
    browser,
    new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
    () => undefined,
    {
      request: async (request) => {
        throw new Error(`Unexpected permission prompt during media acquisition dogfood: ${request.title}`);
      },
      denyThread: () => undefined,
    },
  );
}

async function startMediaFixtureServer(): Promise<{ server: Server; imageUrl: string; htmlAsImageUrl: string; pageUrl: string; longPageUrl: string }> {
  const png = minimalPng({ width: 64, height: 48 });
  const longPageText = Array.from({ length: 1800 }, (_, index) => `Ambient long output row ${index + 1}.`).join("\n");
  const server = createServer((request, response) => {
    if (request.url === "/page.html") {
      const html = [
        "<!doctype html>",
        "<title>Ambient Browser Eval Fixture</title>",
        "<ul>",
        '<li data-row="1">alpha</li>',
        '<li data-row="2">beta</li>',
        '<li data-row="3">gamma</li>',
        "</ul>",
      ].join("");
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "content-length": String(Buffer.byteLength(html)),
      });
      response.end(html);
      return;
    }
    if (request.url === "/long-page.html") {
      const html = [
        "<!doctype html>",
        "<title>Ambient Long Output Fixture</title>",
        "<main>",
        "<h1>Ambient Long Output Fixture</h1>",
        `<pre>${longPageText}</pre>`,
        "</main>",
      ].join("");
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "content-length": String(Buffer.byteLength(html)),
      });
      response.end(html);
      return;
    }
    if (request.url === "/bunny.png") {
      response.writeHead(200, {
        "content-type": "image/png",
        "content-length": String(png.byteLength),
      });
      response.end(png);
      return;
    }
    if (request.url === "/blocked.jpg") {
      const html = "<!doctype html><title>Blocked</title><p>This is HTML, not an image.</p>";
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "content-length": String(Buffer.byteLength(html)),
      });
      response.end(html);
      return;
    }
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found");
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  return {
    server,
    imageUrl: `http://127.0.0.1:${address.port}/bunny.png`,
    htmlAsImageUrl: `http://127.0.0.1:${address.port}/blocked.jpg`,
    pageUrl: `http://127.0.0.1:${address.port}/page.html`,
    longPageUrl: `http://127.0.0.1:${address.port}/long-page.html`,
  };
}

async function sendWithDogfoodTimeout(input: {
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
            `Media acquisition dogfood timed out after ${input.timeoutMs}ms.`,
            summarizeDogfoodThread(input.store, input.threadId),
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

function summarizeDogfoodThread(store: ProjectStore, threadId: string): string {
  const messages = store.listMessages(threadId);
  const toolNames = messages.map((message) => message.metadata?.toolName).filter(Boolean);
  const artifactPaths = messages.map((message) => message.metadata?.artifactPath).filter(Boolean);
  const tail = messages
    .slice(-8)
    .map((message) => {
      const tool = message.metadata?.toolName ? ` tool=${message.metadata.toolName}` : "";
      const status = message.metadata?.status ? ` status=${message.metadata.status}` : "";
      const content = message.content.replace(/\s+/g, " ").slice(0, 600);
      return `${message.role}${tool}${status}: ${content}`;
    })
    .join("\n");
  return [
    `Tool calls: ${toolNames.length ? toolNames.join(", ") : "none"}`,
    `Artifact paths: ${artifactPaths.length ? artifactPaths.join(", ") : "none"}`,
    "Transcript tail:",
    tail || "(no messages)",
  ].join("\n");
}

async function closeServer(server: Server | undefined): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function minimalPng(dimensions: { width: number; height: number }): Buffer {
  const buffer = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(dimensions.width, 16);
  buffer.writeUInt32BE(dimensions.height, 20);
  buffer[24] = 8;
  buffer[25] = 2;
  buffer[26] = 0;
  buffer[27] = 0;
  buffer[28] = 0;
  return buffer;
}
