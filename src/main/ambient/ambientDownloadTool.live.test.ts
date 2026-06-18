import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { safeStorage } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import { AgentRuntime } from "../agent-runtime/agentRuntime";
import { BrowserCredentialStore } from "../browser/browserCredentialStore";
import { BrowserService } from "../browser/browserService";
import { applyLiveAmbientProviderApiKeyEnv, readLiveAmbientProviderApiKey } from "./liveAmbientProviderConfig";
import { ProjectStore } from "./ambientProjectStoreFacade";

const electronMock = vi.hoisted(() => ({
  userDataPath: `${process.env.TMPDIR || "/tmp"}/ambient-download-live-electron`,
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

const itLive = process.env.AMBIENT_DOWNLOAD_LIVE === "1" ? it : it.skip;

describe("Ambient managed download live Pi smoke", () => {
  let workspacePath = "";
  let store: ProjectStore;
  let runtime: AgentRuntime | undefined;
  let restoreEnv: (() => void) | undefined;
  let server: Server | undefined;
  let downloadUrl = "";
  const body = Buffer.from("Ambient managed download live fixture.\n");
  const sha256 = createHash("sha256").update(body).digest("hex");

  beforeEach(async () => {
    workspacePath = await realpath(await mkdtemp(join(tmpdir(), "ambient-download-live-")));
    restoreEnv = configureLiveDownloadEnv(workspacePath);
    ({ server, url: downloadUrl } = await startFixtureServer(body));
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          throw new Error(`Unexpected permission prompt during managed download live smoke: ${request.title}`);
        },
        denyThread: () => undefined,
      },
    );
  });

  afterEach(async () => {
    await runtime?.shutdownPluginMcpServers();
    runtime = undefined;
    store.close();
    restoreEnv?.();
    await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
    await rm(workspacePath, { recursive: true, force: true });
  });

  itLive("uses ambient_download_start and ambient_download_wait for a local fixture", async () => {
    const thread = store.createThread("Managed download live smoke");
    await runtime!.send({
      threadId: thread.id,
      permissionMode: "full-access",
      collaborationMode: "agent",
      model: process.env.AMBIENT_DOWNLOAD_LIVE_MODEL ?? process.env.GMI_CLOUD_MODEL ?? AMBIENT_DEFAULT_MODEL,
      thinkingLevel: "minimal",
      content: [
        "This is a live Ambient Desktop managed-download tool smoke.",
        "Do not use shell, bash, curl, wget, browser tools, file_write, or raw Node scripts.",
        "Call ambient_download_start exactly once for the URL and destination below.",
        "Then call ambient_download_wait exactly once using the returned jobId.",
        "After wait completes, answer exactly AMBIENT_DOWNLOAD_LIVE_OK followed by one short sentence.",
        `URL: ${downloadUrl}`,
        "destinationPath: downloads/live-fixture.txt",
        `expectedBytes: ${body.length}`,
        `sha256: ${sha256}`,
      ].join("\n"),
    });

    const downloaded = await readFile(join(workspacePath, "downloads/live-fixture.txt"), "utf8");
    const messages = store.listMessages(thread.id);
    const transcript = messages.map((message) => message.content).join("\n");
    const toolMessages = messages.filter((message) => message.role === "tool");

    expect(downloaded).toBe(body.toString("utf8"));
    expect(toolMessages.some((message) => message.content.includes("ambient_download_start"))).toBe(true);
    expect(toolMessages.some((message) => message.content.includes("ambient_download_wait"))).toBe(true);
    expect(transcript).toContain("AMBIENT_DOWNLOAD_LIVE_OK");
    expect(toolMessages.map((message) => message.content).join("\n")).not.toMatch(/\b(?:bash|file_write|browser_nav|browser_content) completed\b/i);
  }, 180_000);
});

function configureLiveDownloadEnv(workspacePath: string): () => void {
  const keys = [
    "AMBIENT_PROVIDER",
    "AMBIENT_PI_PACKAGE_GALLERY_DISABLED",
    "AMBIENT_PI_USER_SETTINGS_PATH",
    "AMBIENT_PI_GLOBAL_PACKAGES_PATH",
    "GMI_CLOUD_API_KEY",
    "GMI_API_KEY",
  ] as const;
  const previous = new Map<string, string | undefined>(keys.map((key) => [key, process.env[key]]));
  process.env.AMBIENT_PROVIDER = "gmi-cloud";
  process.env.AMBIENT_PI_PACKAGE_GALLERY_DISABLED = "1";
  process.env.AMBIENT_PI_USER_SETTINGS_PATH = join(workspacePath, ".ambient-test-missing-pi-settings.json");
  process.env.AMBIENT_PI_GLOBAL_PACKAGES_PATH = join(workspacePath, ".ambient-test-missing-pi-packages.json");
  applyLiveAmbientProviderApiKeyEnv(readLiveAmbientProviderApiKey({ purpose: "live managed download smoke" }));
  return () => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

async function startFixtureServer(body: Buffer): Promise<{ server: Server; url: string }> {
  const server = createServer((_request, response) => {
    response.writeHead(200, {
      "content-type": "application/octet-stream",
      "content-length": String(body.length),
    });
    response.end(body);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fixture server did not bind to a TCP port.");
  return { server, url: `http://127.0.0.1:${address.port}/fixture.bin` };
}
