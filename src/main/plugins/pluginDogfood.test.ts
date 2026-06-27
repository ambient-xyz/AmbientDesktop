import { mkdtemp, readFile, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { safeStorage } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import { BrowserCredentialStore, BrowserService } from "./pluginsBrowserDogfoodFacade";
import { ProjectStore } from "./pluginsProjectStoreFacade";
import { AmbientPluginHost } from "./pluginHost";
import { ensureFirstPartyAmbientCliPackages } from "./pluginsAmbientCliFacade";
import { AgentRuntime, discoverPiExtensionSandboxPackages, discoverPiPrivilegedPackages } from "./pluginsAgentRuntimeDogfoodFacade";
import type { DesktopEvent } from "../../shared/desktopTypes";
import type { PermissionPromptResolution } from "../../shared/permissionTypes";
import {
  isolatePluginDiscoveryEnv,
  pluginStateReader,
  seedFixtureMarketplace,
  seedSelfInstallMarketplace,
  trustFixturePlugin,
} from "./pluginDogfoodTestSupport";

const electronMock = vi.hoisted(() => ({
  userDataPath: `${process.env.TMPDIR || "/tmp"}/ambient-plugin-dogfood-electron`,
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
const itHyperframesLive = process.env.AMBIENT_HYPERFRAMES_LIVE === "1" ? it : it.skip;

describeNative("Plugin chat dogfood", () => {
  let workspacePath = "";
  let store: ProjectStore;
  let runtime: AgentRuntime | undefined;
  let restoreEnv: (() => void) | undefined;

  beforeEach(async () => {
    workspacePath = await realpath(await mkdtemp(join(tmpdir(), "ambient-plugin-dogfood-")));
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

  it("loads, trusts, and invokes the fixture Codex MCP plugin from a workspace marketplace", async () => {
    const host = new AmbientPluginHost();
    try {
      const fixture = await trustFixturePlugin(store, workspacePath);
      const catalog = await host.readCodexPluginCatalog(workspacePath, pluginStateReader(store));
      const trustedFixture = catalog.plugins.find((plugin) => plugin.name === "ambient-fixture");
      const registrations = await host.buildCodexPluginMcpToolRegistrations([fixture], {
        permissionMode: "workspace",
        workspacePath,
      });
      const registration = registrations.find((tool) => tool.originalName === "ambient_fixture_workspace_summary");
      expect(trustedFixture).toMatchObject({ enabled: true, trusted: true });
      expect(registration).toMatchObject({
        registeredName: "ambient_fixture_workspace_summary",
        tool: expect.objectContaining({ pluginName: "ambient-fixture", serverName: "ambient-fixture" }),
      });

      const result = await host.callCodexPluginMcpTool(
        registration!.launchPlan,
        { toolName: registration!.originalName, arguments: { includeFiles: false } },
        { permissionMode: "workspace", workspacePath },
      );

      expect(result.content[0].text).toContain("Ambient fixture MCP summary");
      expect(result.content[0].text).toContain("cwd:");
      expect(result.content[0].text).toContain("/plugins/ambient-fixture");
    } finally {
      await host.shutdownPluginMcpServers();
    }
  });

  itLive(
    "invokes a trusted fixture Codex MCP plugin during a live Ambient/Pi chat turn",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live plugin chat dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      await trustFixturePlugin(store, workspacePath);
      const thread = store.createThread("Plugin dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            throw new Error(`Unexpected permission prompt during trusted plugin dogfood: ${request.title}`);
          },
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
          "This is an Ambient Desktop plugin dogfood test.",
          "Call the Codex plugin MCP tool named ambient_fixture_workspace_summary with includeFiles=false.",
          "After the tool result is available, answer with one short sentence containing the exact token PLUGIN_DOGFOOD_OK and the cwd from the tool result.",
          "Do not use browser or shell tools.",
        ].join("\n"),
      });

      const transcript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      const audit = store.listPermissionAudit(20);

      expect(transcript).toContain("PLUGIN_DOGFOOD_OK");
      expect(audit).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            threadId: thread.id,
            toolName: "ambient_fixture_workspace_summary",
            risk: "plugin-tool",
            decision: "allowed",
          }),
        ]),
      );
      expect(runtime.pluginMcpRuntimeSnapshots()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            pluginName: "ambient-fixture",
            serverName: "ambient-fixture",
            workspacePath,
          }),
        ]),
      );
    },
    360_000,
  );

  itHyperframesLive(
    "discovers, describes, and uses bundled HyperFrames through live Ambient/Pi",
    async () => {
      const previousFakeRender = process.env.AMBIENT_HYPERFRAMES_FAKE_RENDER;
      process.env.AMBIENT_HYPERFRAMES_FAKE_RENDER = "1";
      await ensureFirstPartyAmbientCliPackages(workspacePath, {
        packageNames: ["ambient-hyperframes"],
        bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages"),
      });

      const thread = store.createThread("HyperFrames Ambient CLI dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            if (request.toolName === "ambient_cli") return { allowed: true, mode: "allow_once" };
            throw new Error(`Unexpected permission prompt during HyperFrames dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );

      try {
        await runtime.send({
          threadId: thread.id,
          permissionMode: "workspace",
          collaborationMode: "agent",
          model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
          thinkingLevel: "minimal",
          content: [
            "This is a live Ambient/Pi dogfood test for the bundled HyperFrames Ambient CLI package.",
            "Use standard Ambient CLI mechanisms only; do not use shell, browser, Capability Builder, plugin install, or Scrapling/MCP tools.",
            "First call ambient_cli_search for HyperFrames authored motion title card video.",
            "Then call ambient_cli_describe for packageName ambient-hyperframes.",
            "Then call ambient_cli for packageName ambient-hyperframes command hyperframes_init with args --project-dir hf-live --title Live HyperFrames --subtitle Ambient CLI dogfood.",
            "Then call ambient_cli for command hyperframes_inspect with args --source hf-live/comp.html --json.",
            "Then call ambient_cli for command hyperframes_render with args --source hf-live/comp.html --output .ambient/hyperframes/renders/live-dogfood.mp4 --json.",
            "After the render tool result returns, answer with exactly HYPERFRAMES_LIVE_DOGFOOD_OK and include the rendered output path from the tool result.",
          ].join("\n"),
        });

        const transcript = store
          .listMessages(thread.id)
          .map((message) => message.content)
          .join("\n");
        expect(transcript).toContain("HYPERFRAMES_LIVE_DOGFOOD_OK");
        expect(transcript).toContain("ambient_cli_search completed");
        expect(transcript).toContain("ambient_cli_describe completed");
        expect(transcript).toContain("ambient_cli completed");
        expect(transcript).toContain(".ambient/hyperframes/renders/live-dogfood.mp4");
        const rendered = await stat(join(workspacePath, ".ambient", "hyperframes", "renders", "live-dogfood.mp4"));
        expect(rendered.size).toBeGreaterThan(0);
      } finally {
        if (previousFakeRender === undefined) {
          delete process.env.AMBIENT_HYPERFRAMES_FAKE_RENDER;
        } else {
          process.env.AMBIENT_HYPERFRAMES_FAKE_RENDER = previousFakeRender;
        }
      }
    },
    360_000,
  );

  itLive(
    "preserves generic plugin markdown input metadata from a live Ambient run",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live plugin markdown longform dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      await trustFixturePlugin(store, workspacePath);
      const markdown = [
        "# Long Plugin Markdown",
        "",
        "This payload exists to exercise generic plugin input preview metadata.",
        "details ".repeat(90),
      ].join("\n");
      expect(markdown.length).toBeGreaterThan(500);
      const thread = store.createThread("Plugin markdown longform dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            throw new Error(`Unexpected permission prompt during trusted plugin markdown dogfood: ${request.title}`);
          },
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
          "This is an Ambient Desktop generic plugin longform display dogfood test.",
          "Call the Codex plugin MCP tool named ambient_fixture_markdown_echo with markdown exactly:",
          "```markdown",
          markdown,
          "```",
          "After the tool result is available, answer with one short sentence containing PLUGIN_MARKDOWN_LONGFORM_OK and markdownLength.",
          "Do not use browser, shell, read, write, edit, or ambient_cli tools.",
        ].join("\n"),
      });

      const messages = store.listMessages(thread.id);
      const transcript = messages.map((message) => message.content).join("\n");
      const pluginMessage = messages.find(
        (message) => message.metadata?.toolName === "ambient_fixture_markdown_echo" && message.metadata?.toolLongformInputPreview,
      );
      const longformPreview = pluginMessage?.metadata?.toolLongformInputPreview as
        | { kind?: string; title?: string; items?: Array<{ fieldPath?: string; chars?: number; language?: string }> }
        | undefined;

      expect(transcript).toContain("PLUGIN_MARKDOWN_LONGFORM_OK");
      expect(transcript).toContain("markdownLength");
      expect(longformPreview).toMatchObject({
        kind: "longform-input",
        title: "Long input",
        items: [
          {
            fieldPath: "markdown",
            language: "markdown",
          },
        ],
      });
      expect(longformPreview?.items?.[0]?.chars).toBeGreaterThan(500);
    },
    240_000,
  );

  itLive(
    "preserves large plugin MCP output metadata from a live Ambient run",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live plugin output metadata dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      await trustFixturePlugin(store, workspacePath);
      const thread = store.createThread("Plugin output metadata dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            throw new Error(`Unexpected permission prompt during trusted plugin output metadata dogfood: ${request.title}`);
          },
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
          "This is an Ambient Desktop plugin MCP large output display dogfood test.",
          'Call the Codex plugin MCP tool named ambient_fixture_markdown_echo with markdown exactly "large plugin output metadata dogfood" and outputLines exactly 260.',
          "After the tool result is available, answer with one short sentence containing PLUGIN_OUTPUT_METADATA_OK and outputLines.",
          "Do not quote generated output lines in the final answer.",
          "Do not use browser, shell, read, write, edit, or ambient_cli tools.",
        ].join("\n"),
      });

      const messages = store.listMessages(thread.id);
      const transcript = messages.map((message) => message.content).join("\n");
      const pluginMessage = messages.find(
        (message) => message.metadata?.toolName === "ambient_fixture_markdown_echo" && message.metadata?.toolResultDetails,
      );
      const largeOutputPreview = (
        pluginMessage?.metadata?.toolResultDetails as
          | { largeOutputPreview?: { items?: Array<{ chars?: number; previewChars?: number; artifactPath?: string }> } }
          | undefined
      )?.largeOutputPreview;
      const artifactPath = largeOutputPreview?.items?.[0]?.artifactPath;

      expect(transcript).toContain("PLUGIN_OUTPUT_METADATA_OK");
      expect(transcript).toContain("outputLines");
      expect(largeOutputPreview?.items?.[0]?.chars).toBeGreaterThan(12_000);
      expect(largeOutputPreview?.items?.[0]?.previewChars).toBe(12_000);
      expect(artifactPath).toMatch(/^\.ambient\/tool-outputs\/.+\.txt$/);
      const artifact = await readFile(join(workspacePath, artifactPath!), "utf8");
      expect(artifact).toContain("pluginOutputLine 0260");
    },
    240_000,
  );

  itLive(
    "self-installs, activates, reloads, and invokes a Codex MCP plugin during live Ambient/Pi chat turns",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live plugin self-install dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      await rm(join(workspacePath, ".agents"), { recursive: true, force: true });
      await rm(join(workspacePath, "plugins"), { recursive: true, force: true });
      const source = await seedSelfInstallMarketplace(workspacePath);
      const thread = store.createThread("Plugin self-install dogfood");
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
          "This is an Ambient Desktop plugin self-install dogfood test.",
          `Use ambient_plugin_install_preview with source ${source.marketplacePath}.`,
          "Then use ambient_plugin_install_commit for pluginName ambient-fixture from that same source.",
          "Then use ambient_plugin_activate for pluginName ambient-fixture with installDependencies=false.",
          "Do not call the ambient_fixture_workspace_summary MCP tool in this turn.",
          "After activation, answer with exactly SELF_INSTALL_ACTIVATED.",
        ].join("\n"),
      });

      const installedCatalog = await new AmbientPluginHost().readCodexPluginCatalog(workspacePath, pluginStateReader(store));
      const installed = installedCatalog.plugins.find((plugin) => plugin.name === "ambient-fixture");
      expect(installed).toMatchObject({ enabled: true, trusted: false, sourceKind: "workspace" });
      expect(
        store
          .listMessages(thread.id)
          .map((message) => message.content)
          .join("\n"),
      ).toContain("SELF_INSTALL_ACTIVATED");

      await runtime.send({
        threadId: thread.id,
        permissionMode: "full-access",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "Now call the Codex plugin MCP tool named ambient_fixture_workspace_summary with includeFiles=false.",
          "After the tool result is available, answer with one short sentence containing the exact token SELF_INSTALL_TOOL_OK and the cwd from the tool result.",
          "Do not use browser or shell tools.",
        ].join("\n"),
      });

      const transcript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      expect(transcript).toContain("SELF_INSTALL_TOOL_OK");
      expect(transcript).toContain("Ambient fixture MCP summary");
      expect(runtime.pluginMcpRuntimeSnapshots()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            pluginName: "ambient-fixture",
            serverName: "ambient-fixture",
          }),
        ]),
      );
    },
    360_000,
  );

  itLive(
    "translates a Pi catalog arXiv package URL and runs a real lookup during live Ambient/Pi chat turns",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Pi catalog arXiv dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const permissionResolutions: Array<Omit<PermissionPromptResolution, "mode"> & { mode: PermissionPromptResolution["mode"] }> = [];
      const thread = store.createThread("Pi catalog arXiv dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            const mode = request.toolName === "ambient_cli" ? "always_workspace" : "allow_once";
            permissionResolutions.push({ allowed: true, mode });
            return { allowed: true, mode };
          },
          denyThread: () => undefined,
        },
      );

      await runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "This is an Ambient Desktop Pi catalog package dogfood test.",
          "Please install and use this package: https://pi.dev/packages/pi-arxiv?name=arxiv",
          "Resolve it as needed, then run a real arXiv search for diffusion policy robotics with at most 3 results.",
          "If the arXiv search endpoint reports rate limiting, use the same installed package to fetch arXiv paper 2303.04137 instead.",
          "After the tool result is available, answer with one short sentence containing PI_ARXIV_DOGFOOD_OK and one arXiv paper ID.",
          "Do not use browser or shell tools.",
        ].join("\n"),
      });

      const transcript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      const audit = store.listPermissionAudit(200);
      if (process.env.AMBIENT_CLI_RLM_SUMMARIES === "1") {
        expect(transcript).toContain("Ambient CLI summary hydration");
      }
      expect(transcript).toContain("PI_ARXIV_DOGFOOD_OK");
      expect(transcript).toMatch(/\b\d{4}\.\d{4,5}(v\d+)?\b/);
      expect(transcript).toMatch(/diffusion|robot|policy|arxiv/i);
      expect(audit).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_cli_package_install_pi_catalog", decision: "allowed" }),
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_cli", decision: "allowed" }),
        ]),
      );
      expect(permissionResolutions.length).toBeGreaterThanOrEqual(2);
    },
    600_000,
  );

  itLive(
    "installs and runs pi-arxiv through the sandboxed Pi extension host during live Ambient/Pi chat turns",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live sandboxed Pi extension dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const emittedEvents: DesktopEvent[] = [];
      const thread = store.createThread("Sandboxed Pi extension dogfood");
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
            const mode = request.toolName === "ambient_pi_extension" ? "always_workspace" : "allow_once";
            return { allowed: true, mode };
          },
          denyThread: () => undefined,
        },
      );

      await runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "This is an Ambient Desktop sandboxed Pi extension dogfood test.",
          "Install this package as a sandboxed Pi extension: https://pi.dev/packages/pi-arxiv?name=arxiv",
          "Then run its arxiv_paper tool for paper 2303.04137 using ambient_pi_extension.",
          "Then call ambient_pi_extension_uninstall_sandboxed with packageName pi-arxiv. Do not answer until uninstall is complete.",
          "Then call ambient_pi_extension_history and confirm pi-arxiv is in retained removed-package history.",
          "Then call ambient_pi_extension_clear_history and do not answer until the clear is complete.",
          "After history clear completes, answer with one short sentence containing PI_EXTENSION_SANDBOX_DOGFOOD_OK, Diffusion Policy, uninstalled, and history-cleared.",
          "Do not use browser, shell, or ambient_cli tools.",
        ].join("\n"),
      });

      const transcript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      const audit = store.listPermissionAudit(200);
      const catalog = await discoverPiExtensionSandboxPackages(workspacePath);
      expect(transcript).toContain("PI_EXTENSION_SANDBOX_DOGFOOD_OK");
      expect(transcript).toContain("Diffusion Policy");
      expect(transcript).toContain("uninstalled");
      expect(transcript).toContain("history-cleared");
      expect(catalog.errors).toEqual([]);
      expect(catalog.packages).toEqual([]);
      expect(catalog.history).toEqual([]);
      expect(audit).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_pi_extension_install_sandboxed", decision: "allowed" }),
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_pi_extension", decision: "allowed" }),
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_pi_extension_uninstall_sandboxed", decision: "allowed" }),
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_pi_extension_clear_history", decision: "allowed" }),
        ]),
      );
      expect(emittedEvents).toEqual(expect.arrayContaining([expect.objectContaining({ type: "plugin-catalog-updated" })]));
    },
    600_000,
  );

  itLive(
    "routes pi-ffmpeg sandbox install failure into privileged disabled install during live Ambient/Pi chat turns",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live pi-ffmpeg fallback dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const thread = store.createThread("Pi ffmpeg fallback dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            if (
              request.toolName === "ambient_pi_privileged_install" ||
              request.toolName === "ambient_pi_privileged_uninstall" ||
              request.toolName === "ambient_pi_privileged_clear_history"
            ) {
              return { allowed: true, mode: "allow_once" };
            }
            throw new Error(`Unexpected permission prompt during pi-ffmpeg fallback dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );

      await runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "This is an Ambient Desktop Pi extension fallback dogfood test.",
          "First call ambient_pi_extension_install_sandboxed with source https://pi.dev/packages/pi-ffmpeg?name=bet.",
          "If that tool reports privileged review required, call ambient_pi_privileged_install with source https://pi.dev/packages/pi-ffmpeg?name=bet and scanOrigin sandbox-fallback.",
          "Then call ambient_pi_privileged_uninstall with packageName pi-ffmpeg. Do not answer until uninstall is complete.",
          "Then call ambient_pi_privileged_history and confirm pi-ffmpeg is in retained removed-package history.",
          "Then call ambient_pi_privileged_clear_history and do not answer until the clear is complete.",
          "Do not run ffmpeg, activate the package, use browser tools, shell tools, or ambient_cli.",
          "After history clear completes, answer with one short sentence containing PI_FFMPEG_FALLBACK_DOGFOOD_OK, pi-ffmpeg, sandbox-fallback, uninstalled, and history-cleared.",
        ].join("\n"),
      });

      const transcript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      const audit = store.listPermissionAudit(200);
      const catalog = await discoverPiPrivilegedPackages(workspacePath);
      expect(transcript).toContain("PI_FFMPEG_FALLBACK_DOGFOOD_OK");
      expect(transcript).toContain("pi-ffmpeg");
      expect(transcript).toContain("sandbox-fallback");
      expect(transcript).toContain("uninstalled");
      expect(transcript).toContain("history-cleared");
      expect(catalog.errors).toEqual([]);
      expect(catalog.packages).toEqual([]);
      expect(catalog.history).toEqual([]);
      expect(audit).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_pi_privileged_install", decision: "allowed" }),
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_pi_privileged_uninstall", decision: "allowed" }),
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_pi_privileged_clear_history", decision: "allowed" }),
        ]),
      );
    },
    600_000,
  );

  itLive(
    "scans, privileged-installs disabled, and uninstalls context-mode during a live Ambient/Pi chat turn",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live privileged Pi extension dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const thread = store.createThread("Privileged Pi extension dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            if (request.toolName === "ambient_pi_privileged_install" || request.toolName === "ambient_pi_privileged_uninstall") {
              return { allowed: true, mode: "allow_once" };
            }
            throw new Error(`Unexpected permission prompt during privileged Pi dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );

      await runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "This is an Ambient Desktop privileged Pi extension dogfood test.",
          "Use ambient_pi_privileged_scan once for https://pi.dev/packages/context-mode.",
          "Then use ambient_pi_privileged_install once with source https://pi.dev/packages/context-mode.",
          "Then use ambient_pi_privileged_uninstall with packageName context-mode. Do not answer until the uninstall tool result is available.",
          "Do not try to activate it, run it, use browser tools, shell tools, or ambient_cli.",
          "After uninstall completes, answer with one short sentence containing PI_PRIVILEGED_DOGFOOD_OK, context-mode, and uninstalled.",
        ].join("\n"),
      });

      const transcript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      const audit = store.listPermissionAudit(200);
      const catalog = await discoverPiPrivilegedPackages(workspacePath);
      expect(transcript).toContain("PI_PRIVILEGED_DOGFOOD_OK");
      expect(transcript).toContain("context-mode");
      expect(transcript).toContain("uninstalled");
      expect(catalog.errors).toEqual([]);
      expect(catalog.packages).toEqual([]);
      expect(audit).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_pi_privileged_install", decision: "allowed" }),
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_pi_privileged_uninstall", decision: "allowed" }),
        ]),
      );
    },
    600_000,
  );
});
