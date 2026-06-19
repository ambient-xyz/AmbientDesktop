import { mkdtemp, realpath, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { safeStorage } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import { AgentRuntime } from "./installRouteAgentRuntimeDogfoodFacade";
import { BrowserCredentialStore, BrowserService } from "../browser/browserAgentRuntimeContract";
import { ProjectStore } from "./installRouteProjectStoreFacade";
import { applyLiveAmbientProviderApiKeyEnv, liveAmbientProviderLabel, readLiveAmbientProviderApiKey } from "./installRouteAmbientLiveFacade";
import type { AmbientInstallRouteLane } from "./installRoutePlanner";

const electronMock = vi.hoisted(() => ({
  userDataPath: `${process.env.TMPDIR || "/tmp"}/ambient-install-route-live-electron`,
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

const itLive = process.env.AMBIENT_INSTALL_ROUTE_LIVE === "1" ? it : it.skip;

interface LiveRouteCase {
  id: string;
  prompt: string;
  expectedLane: AmbientInstallRouteLane;
  expectedNextTool?: string;
}

const liveRouteCases: LiveRouteCase[] = [
  {
    id: "pi-curated-arxiv-url",
    prompt: "Install https://pi.dev/packages/pi-arxiv?name=arxiv.",
    expectedLane: "pi-marketplace-curated-wrapper",
    expectedNextTool: "ambient_cli_package_install_pi_catalog",
  },
  {
    id: "pi-curated-youtube-git",
    prompt: "Add the YouTube transcript Pi skill from Badlogic's Pi skills repo.",
    expectedLane: "pi-marketplace-curated-wrapper",
    expectedNextTool: "ambient_cli_package_install_pi_catalog",
  },
  {
    id: "pi-curated-brave-git",
    prompt: "Use the Brave Search Pi skill from Badlogic's repo.",
    expectedLane: "pi-marketplace-curated-wrapper",
    expectedNextTool: "ambient_cli_package_install_pi_catalog",
  },
  {
    id: "pi-generated-adapt",
    prompt: "Adapt this simple Pi skill into Ambient rather than running the upstream extension.",
    expectedLane: "pi-marketplace-generated-wrapper",
    expectedNextTool: "ambient_capability_builder_plan",
  },
  {
    id: "pi-generated-narrow-cli",
    prompt: "Wrap this Pi skill that shells to a narrow CLI and returns JSON.",
    expectedLane: "pi-marketplace-generated-wrapper",
    expectedNextTool: "ambient_capability_builder_plan",
  },
  {
    id: "pi-generated-public-api",
    prompt: "Build an Ambient wrapper for a Pi package that only calls a public API.",
    expectedLane: "pi-marketplace-generated-wrapper",
    expectedNextTool: "ambient_capability_builder_plan",
  },
  {
    id: "pi-privileged-hooks",
    prompt: "Install this Pi extension that registers lifecycle hooks and edits global shell config on startup.",
    expectedLane: "pi-marketplace-privileged-review",
    expectedNextTool: "ambient_pi_privileged_scan",
  },
  {
    id: "pi-privileged-filesystem",
    prompt: "Use this Pi package that needs unrestricted filesystem and process access.",
    expectedLane: "pi-marketplace-privileged-review",
    expectedNextTool: "ambient_pi_privileged_scan",
  },
  {
    id: "pi-privileged-settings",
    prompt: "Install a Pi extension that mutates Pi settings on startup.",
    expectedLane: "pi-marketplace-privileged-review",
    expectedNextTool: "ambient_pi_privileged_scan",
  },
  {
    id: "mcp-context7",
    prompt: "Wire up the Context7 MCP server.",
    expectedLane: "mcp-autowire",
    expectedNextTool: "ambient_mcp_autowire_plan",
  },
  {
    id: "mcp-github",
    prompt: "Install this MCP server from GitHub.",
    expectedLane: "mcp-autowire",
    expectedNextTool: "ambient_mcp_autowire_plan",
  },
  {
    id: "mcp-local-bridge",
    prompt: "Add a local bridge MCP server for Ghidra.",
    expectedLane: "mcp-autowire",
    expectedNextTool: "ambient_mcp_autowire_plan",
  },
  {
    id: "provider-brave",
    prompt: "Add Brave Search as a search provider.",
    expectedLane: "provider-capability-builder",
    expectedNextTool: "ambient_provider_catalog",
  },
  {
    id: "provider-elevenlabs",
    prompt: "Install ElevenLabs as my assistant voice provider.",
    expectedLane: "provider-capability-builder",
    expectedNextTool: "ambient_provider_catalog",
  },
  {
    id: "provider-cartesia",
    prompt: "Set up Cartesia TTS for chat voicing.",
    expectedLane: "provider-capability-builder",
    expectedNextTool: "ambient_provider_catalog",
  },
  {
    id: "ambient-cli-descriptor",
    prompt: "Install this pinned Git repo that contains ambient-cli.json.",
    expectedLane: "ambient-cli-package",
    expectedNextTool: "ambient_cli_package_preview",
  },
  {
    id: "ambient-cli-local",
    prompt: "Install this local Ambient CLI package from a path.",
    expectedLane: "ambient-cli-package",
    expectedNextTool: "ambient_cli_package_preview",
  },
  {
    id: "ambient-cli-preview",
    prompt: "Preview this descriptor-backed capability package before installing it.",
    expectedLane: "ambient-cli-package",
    expectedNextTool: "ambient_cli_package_preview",
  },
  {
    id: "normal-app-ffmpeg",
    prompt: "Install ffmpeg for this project.",
    expectedLane: "normal-app-setup",
    expectedNextTool: "ambient_setup_runtime_preflight",
  },
  {
    id: "normal-app-uv",
    prompt: "Set up uv in this workspace.",
    expectedLane: "normal-app-setup",
    expectedNextTool: "ambient_setup_runtime_preflight",
  },
  {
    id: "normal-app-ghidra",
    prompt: "Install Ghidra so I can use it locally.",
    expectedLane: "normal-app-setup",
    expectedNextTool: "ambient_setup_runtime_preflight",
  },
  {
    id: "privileged-action-symlink",
    prompt: "Create a symlink in /usr/bin for this tool.",
    expectedLane: "privileged-action",
    expectedNextTool: "ambient_privileged_action_request",
  },
  {
    id: "privileged-action-daemon",
    prompt: "Install a launch daemon.",
    expectedLane: "privileged-action",
    expectedNextTool: "ambient_privileged_action_request",
  },
  {
    id: "privileged-action-driver",
    prompt: "Install a kernel/system driver.",
    expectedLane: "privileged-action",
    expectedNextTool: "ambient_privileged_action_request",
  },
  {
    id: "hidden-plugin-codex",
    prompt: "Install this Codex plugin marketplace entry.",
    expectedLane: "unsupported",
  },
  {
    id: "hidden-plugin-local",
    prompt: "Install this local Ambient plugin directory.",
    expectedLane: "unsupported",
  },
  {
    id: "hidden-plugin-activate",
    prompt: "Activate this unsupported plugin marketplace package.",
    expectedLane: "unsupported",
  },
];

describe("Ambient install route planner live Pi categorization", () => {
  let workspacePath = "";
  let store: ProjectStore;
  let runtime: AgentRuntime | undefined;
  let restoreEnv: (() => void) | undefined;

  beforeEach(async () => {
    workspacePath = await realpath(await mkdtemp(join(tmpdir(), "ambient-install-route-live-")));
    restoreEnv = configureLiveInstallRouteEnv(workspacePath);
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
    runtime = new AgentRuntime(
      store,
      new BrowserService(() => store.getWorkspace()),
      new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
      () => undefined,
      {
        request: async (request) => {
          throw new Error(`Unexpected permission prompt during install-route live categorization: ${request.title}`);
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
    await rm(workspacePath, { recursive: true, force: true });
  });

  for (const testCase of selectedLiveRouteCases()) {
    itLive(
      `routes ${testCase.id} through ambient_install_route_plan first`,
      async () => {
        expect(liveAmbientProviderLabel()).toBe("GMI Cloud");
        const thread = store.createThread(`Install route live ${testCase.id}`);

        await runtime!.send({
          threadId: thread.id,
          permissionMode: "workspace",
          collaborationMode: "agent",
          model: process.env.AMBIENT_INSTALL_ROUTE_LIVE_MODEL ?? process.env.GMI_CLOUD_MODEL ?? AMBIENT_DEFAULT_MODEL,
          thinkingLevel: "minimal",
          content: [
            "This is a live Ambient Desktop install-route categorization test.",
            "Do not install, execute, activate, or mutate anything. Do not call plugin install tools. Do not call raw sandboxed Pi extension tools.",
            "Call ambient_install_route_plan exactly once for this user request, then answer from that route plan only.",
            `User request: ${testCase.prompt}`,
            `Expected final token format: INSTALL_ROUTE_LIVE_OK ${testCase.id} ${testCase.expectedLane}`,
          ].join("\n"),
        });

        const messages = store.listMessages(thread.id);
        const transcript = messages.map((message) => message.content).join("\n");
        const toolMessages = messages.filter((message) => message.role === "tool");
        const routeToolMessage = toolMessages.find((message) => message.content.includes("Ambient install route plan"));

        expect(routeToolMessage?.content).toContain(`Lane: ${testCase.expectedLane}`);
        if (testCase.expectedNextTool) expect(routeToolMessage?.content).toContain(testCase.expectedNextTool);
        expect(toolMessages[0]?.content).toBe(routeToolMessage?.content);
        expect(transcript).toContain(`INSTALL_ROUTE_LIVE_OK ${testCase.id} ${testCase.expectedLane}`);
        expect(transcript).not.toMatch(/ambient_plugin_install_preview completed|ambient_plugin_install_commit completed|ambient_plugin_activate completed/i);
        expect(transcript).not.toMatch(/ambient_pi_extension_install_sandboxed completed|sandboxed Pi extension install approved/i);
        expect(transcript).not.toMatch(/\bsudo\s+(?:ln|install|mkdir|cp|rm|chown|chmod|launchctl)\b/i);
        expect(transcript).not.toMatch(/\b(?:paste|send|provide|enter)\s+your\s+(?:api key|secret|token)\b/i);
      },
      installRouteLiveTimeoutMs(),
    );
  }
});

function selectedLiveRouteCases(): LiveRouteCase[] {
  const raw = process.env.AMBIENT_INSTALL_ROUTE_LIVE_CASES?.trim();
  if (!raw) return liveRouteCases;
  const wanted = new Set(raw.split(",").map((item) => item.trim()).filter(Boolean));
  return liveRouteCases.filter((item) => wanted.has(item.id));
}

function configureLiveInstallRouteEnv(workspacePath: string): () => void {
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
  applyLiveAmbientProviderApiKeyEnv(readLiveAmbientProviderApiKey({ purpose: "live install route categorization" }));
  return () => {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}

function installRouteLiveTimeoutMs(): number {
  const parsed = Number(process.env.AMBIENT_INSTALL_ROUTE_LIVE_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 240_000;
}
