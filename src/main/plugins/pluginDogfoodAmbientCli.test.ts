import { execFile } from "node:child_process";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { safeStorage } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import type { DesktopEvent } from "../../shared/desktopTypes";
import type { PermissionPromptResolution } from "../../shared/permissionTypes";
import { BrowserCredentialStore, BrowserService } from "../browser/browserAgentRuntimeContract";
import { installAmbientCliPackageSource, saveAmbientCliPackageEnvSecret } from "./pluginsAmbientCliFacade";
import { AgentRuntime } from "./pluginsAgentRuntimeDogfoodFacade";
import { ProjectStore } from "./pluginsProjectStoreFacade";
import {
  braveSearchDogfoodDescriptor,
  isolatePluginDiscoveryEnv,
  readDogfoodSecret,
  seedAmbientCliFixture,
  seedFixtureMarketplace,
} from "./pluginDogfoodTestSupport";

const execFileAsync = promisify(execFile);

const electronMock = vi.hoisted(() => ({
  userDataPath: `${process.env.TMPDIR || "/tmp"}/ambient-plugin-dogfood-ambient-cli-electron`,
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
const itLive = process.env.AMBIENT_PLUGIN_CHAT_LIVE === "1" ? it : it.skip;

describeNative("Plugin Ambient CLI dogfood", () => {
  let workspacePath = "";
  let store: ProjectStore;
  let runtime: AgentRuntime | undefined;
  let restoreEnv: (() => void) | undefined;

  beforeEach(async () => {
    workspacePath = await realpath(await mkdtemp(join(tmpdir(), "ambient-plugin-ambient-cli-dogfood-")));
    restoreEnv = isolatePluginDiscoveryEnv(workspacePath);
    await seedFixtureMarketplace(workspacePath);
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
  });

  afterEach(async () => {
    await runtime?.shutdownPluginMcpServers();
    runtime = undefined;
    store.close();
    restoreEnv?.();
    await rm(workspacePath, { recursive: true, force: true });
  });

  itLive(
    "installs and uses an Ambient CLI skill package during live Ambient/Pi chat turns",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live CLI package dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const repo = join(workspacePath, "cli-repo");
      await seedAmbientCliFixture(repo);
      await execFileAsync("git", ["init"], { cwd: repo });
      await execFileAsync("git", ["add", "."], { cwd: repo });
      await execFileAsync(
        "git",
        ["-c", "user.name=Ambient Test", "-c", "user.email=ambient@example.test", "commit", "-m", "seed cli package"],
        {
          cwd: repo,
        },
      );
      const { stdout: cliShaStdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repo });
      const cliSha = String(cliShaStdout).trim();
      await writeFile(join(workspacePath, "payload.json"), `${JSON.stringify({ message: "CLI_DOGFOOD_VALUE" })}\n`, "utf8");
      const thread = store.createThread("CLI package dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async () => ({ allowed: true, mode: "allow_once" }),
          denyThread: () => undefined,
        },
      );

      await runtime.send({
        threadId: thread.id,
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "This is an Ambient Desktop CLI package dogfood test.",
          `Use ambient_cli_package_preview with source ${repo}, path ./cli-fixture, and sha ${cliSha}.`,
          `Then use ambient_cli_package_install with source ${repo}, path ./cli-fixture, and sha ${cliSha}.`,
          "Preview is not installation. You must wait for ambient_cli_package_install to complete successfully before answering.",
          "Do not run ambient_cli in this turn.",
          "After installation, answer with exactly CLI_PACKAGE_INSTALLED.",
        ].join("\n"),
      });
      const installTranscript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      expect(installTranscript).toContain("ambient_cli_package_install completed");
      expect(installTranscript).toContain("CLI_PACKAGE_INSTALLED");

      await runtime.send({
        threadId: thread.id,
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "Find the installed Ambient CLI capability for extracting a JSON field by calling ambient_cli_search with query exactly json field extraction.",
          "Then call ambient_cli_describe with packageName ambient-json-cli and command json-pick.",
          "Do not run ambient_cli in this turn.",
          "After ambient_cli_describe completes, answer with exactly CLI_PACKAGE_DESCRIBED.",
          "Do not use browser or shell tools.",
        ].join("\n"),
      });
      const describeTranscript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      expect(describeTranscript).toContain("Ambient CLI capability search");
      expect(describeTranscript).toContain("Ambient CLI capability description");
      expect(describeTranscript).toContain("CLI_PACKAGE_DESCRIBED");

      await runtime.send({
        threadId: thread.id,
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "Now call ambient_cli with packageName ambient-json-cli, command json-pick, and args payload.json and message.",
          "After the tool result is available, answer with one short sentence containing CLI_PACKAGE_DOGFOOD_OK and the exact extracted value.",
          "Do not use browser or shell tools.",
        ].join("\n"),
      });

      const transcript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      expect(transcript).toContain("Ambient CLI capability search");
      expect(transcript).toContain("Ambient CLI capability description");
      expect(transcript).toContain("CLI_PACKAGE_DOGFOOD_OK");
      expect(transcript).toContain("CLI_DOGFOOD_VALUE");
    },
    360_000,
  );

  itLive(
    "returns an Ambient CLI preflight description when Pi tries to execute before describe",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Ambient CLI preflight dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;
      await seedAmbientCliFixture(workspacePath);
      await installAmbientCliPackageSource(workspacePath, { source: "./cli-fixture" });
      await writeFile(join(workspacePath, "payload.json"), `${JSON.stringify({ message: "CLI_PREFLIGHT_VALUE" })}\n`, "utf8");
      const thread = store.createThread("CLI package preflight dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async () => ({ allowed: true, mode: "allow_once" }),
          denyThread: () => undefined,
        },
      );

      await runtime.send({
        threadId: thread.id,
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "This is an Ambient Desktop CLI preflight dogfood test.",
          "Call ambient_cli first with packageName ambient-json-cli, command json-pick, and args payload.json and message.",
          "Do not call ambient_cli_search or ambient_cli_describe before that first ambient_cli call.",
          "If the first ambient_cli result says preflight-description or Ambient CLI preflight description, call ambient_cli one more time with the same packageName, command, and args.",
          "After the second ambient_cli completes, answer with exactly CLI_PREFLIGHT_DOGFOOD_OK and the exact extracted value.",
          "Do not use browser or shell tools.",
        ].join("\n"),
      });

      const transcript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      expect(transcript).toContain("Ambient CLI preflight description");
      expect(transcript).toContain("Execution not run");
      expect(transcript).toContain("CLI_PREFLIGHT_DOGFOOD_OK");
      expect(transcript).toContain("CLI_PREFLIGHT_VALUE");
    },
    240_000,
  );

  itLive(
    "preserves long Ambient CLI arg input metadata from a live Ambient run",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Ambient CLI long arg dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;
      await seedAmbientCliFixture(workspacePath);
      await installAmbientCliPackageSource(workspacePath, { source: "./cli-fixture" });
      const thread = store.createThread("CLI long arg display dogfood");
      const longText = "Ambient CLI long argument metadata dogfood. ".repeat(24);
      expect(longText.length).toBeGreaterThan(500);
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async () => ({ allowed: true, mode: "allow_once" }),
          denyThread: () => undefined,
        },
      );

      await runtime.send({
        threadId: thread.id,
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "This is an Ambient Desktop Ambient CLI long arg display dogfood test.",
          "First call ambient_cli_describe with packageName ambient-json-cli and command echo-arg.",
          `Then call ambient_cli with packageName ambient-json-cli, command echo-arg, and args exactly ["--text", ${JSON.stringify(longText)}].`,
          "Do not use browser, shell, read, write, or edit tools.",
          "After ambient_cli completes, answer with one short sentence containing CLI_LONG_ARG_DOGFOOD_OK and the ECHO_ARG_LENGTH value.",
        ].join("\n"),
      });

      const messages = store.listMessages(thread.id);
      const transcript = messages.map((message) => message.content).join("\n");
      const ambientCliMessage = messages.find(
        (message) => message.metadata?.toolName === "ambient_cli" && message.metadata?.toolLongformInputPreview,
      );
      const longformPreview = ambientCliMessage?.metadata?.toolLongformInputPreview as
        | { kind?: string; title?: string; items?: Array<{ fieldPath?: string; chars?: number; language?: string }> }
        | undefined;

      expect(transcript).toContain("CLI_LONG_ARG_DOGFOOD_OK");
      expect(transcript).toContain("ECHO_ARG_LENGTH=");
      expect(longformPreview).toMatchObject({
        kind: "longform-input",
        title: "Arguments",
        items: [
          {
            fieldPath: "args[1]",
            language: "text",
          },
        ],
      });
      expect(longformPreview?.items?.[0]?.chars).toBeGreaterThan(500);
    },
    240_000,
  );

  itLive(
    "installs Brave Search, binds secrets, and runs real searches during live Ambient/Pi chat turns",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Brave Search dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;
      const braveApiKey = await readDogfoodSecret("BRAVE_API_KEY", "brave_api_key.txt");
      await writeFile(join(workspacePath, "brave_api_key.txt"), `${braveApiKey}\n`, "utf8");

      const emittedEvents: DesktopEvent[] = [];
      const permissionResolutions: Array<Omit<PermissionPromptResolution, "mode"> & { mode: PermissionPromptResolution["mode"] }> = [];
      const thread = store.createThread("Brave Search CLI dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () =>
          ({
            webContents: {
              send: (_channel: string, event: DesktopEvent) => emittedEvents.push(event),
            },
          }) as any,
        {
          request: async (request) => {
            const mode = request.toolName === "ambient_cli" ? "always_workspace" : "allow_once";
            permissionResolutions.push({ allowed: true, mode });
            return { allowed: true, mode };
          },
          denyThread: () => undefined,
        },
      );

      const source = "https://github.com/badlogic/pi-skills.git";
      const sha = "75d32a382b0c8aafce356d68e17d2dc94c0c953b";
      const descriptor = braveSearchDogfoodDescriptor();

      await runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "This is an Ambient Desktop Brave Search CLI dogfood test.",
          `Use ambient_cli_package_preview with source ${source}, path ./brave-search, sha ${sha}, descriptor ${JSON.stringify(descriptor)}, and installDependencies=true.`,
          `Then use ambient_cli_package_install with source ${source}, path ./brave-search, sha ${sha}, the same descriptor, and installDependencies=true.`,
          "Then call ambient_cli_env_bind with packageName brave-search, envName BRAVE_API_KEY, and filePath ./brave_api_key.txt.",
          "Do not run ambient_cli in this turn.",
          "After the env binding succeeds, answer with exactly BRAVE_SEARCH_FILE_BOUND.",
        ].join("\n"),
      });

      let transcript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      expect(transcript).toContain("BRAVE_SEARCH_FILE_BOUND");

      await runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "Use the installed Brave Search Ambient CLI package to search the web.",
          "Call ambient_cli with packageName brave-search, command search, and args Ambient Desktop MCP plugin installation -n 2.",
          "After the tool result is available, answer with one short sentence containing BRAVE_SEARCH_FILE_OK and mention that search results were returned.",
          "Do not use browser or shell tools.",
        ].join("\n"),
      });

      transcript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      expect(transcript).toContain("BRAVE_SEARCH_FILE_OK");
      expect(transcript).toMatch(/Result 1|Title:|Link:/);

      await runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "Now request the Desktop-owned secret dialog for the same installed Brave Search package.",
          "Call ambient_cli_secret_request with packageName brave-search and envName BRAVE_API_KEY.",
          "Do not ask me to paste the key into chat. Do not run ambient_cli in this turn.",
          "After the secret dialog request tool result is available, answer with exactly BRAVE_SECRET_DIALOG_REQUESTED.",
        ].join("\n"),
      });

      transcript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      expect(transcript).toContain("BRAVE_SECRET_DIALOG_REQUESTED");
      expect(emittedEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "ambient-cli-secret-requested",
            packageName: "brave-search",
            envName: "BRAVE_API_KEY",
          }),
        ]),
      );

      await saveAmbientCliPackageEnvSecret(workspacePath, {
        packageName: "brave-search",
        envName: "BRAVE_API_KEY",
        value: braveApiKey,
      });

      await runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "The Desktop secret dialog has been completed. Retry Brave Search now.",
          "Call ambient_cli with packageName brave-search, command search, and args Ambient Desktop secret dialog -n 2.",
          "After the tool result is available, answer with one short sentence containing BRAVE_SEARCH_SECRET_DIALOG_OK and mention that search results were returned.",
          "Do not use browser or shell tools.",
        ].join("\n"),
      });

      transcript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      const audit = store.listPermissionAudit(200);
      expect(transcript).toContain("BRAVE_SEARCH_SECRET_DIALOG_OK");
      expect(transcript).toMatch(/Result 1|Title:|Link:/);
      expect(transcript).not.toContain(braveApiKey);
      expect(JSON.stringify(audit)).not.toContain(braveApiKey);
      expect(permissionResolutions.length).toBeGreaterThanOrEqual(3);
      expect(audit).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_cli_package_install", decision: "allowed" }),
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_cli_env_bind", decision: "allowed" }),
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_cli", decision: "allowed" }),
        ]),
      );
      expect(store.listPermissionGrants()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            scopeKind: "workspace",
            actionKind: "plugin_tool_execute",
            targetKind: "tool",
            targetLabel: "Run Ambient CLI brave-search:search",
          }),
        ]),
      );
    },
    600_000,
  );
});
