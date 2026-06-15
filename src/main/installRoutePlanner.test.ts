import { describe, expect, it } from "vitest";
import {
  ambientInstallRoutePlanText,
  ambientInstallRouteSummary,
  ambientInstallRouteTelemetry,
  planAmbientInstallRoute,
  type AmbientInstallRouteLane,
} from "./installRoutePlanner";

describe("Ambient install route planner", () => {
  it("routes obvious install requests into active lanes with exact next tools", () => {
    const cases: Array<{
      name: string;
      request: string;
      sourceUrl?: string;
      localPath?: string;
      packageName?: string;
      requestedKind?: "provider" | "mcp" | "pi-marketplace" | "ambient-cli-package" | "desktop-app" | "unknown";
      localSourceKind?: "ambient-cli-package" | "codex-plugin" | "unknown";
      expectedLane: AmbientInstallRouteLane;
      expectedNextTool?: string;
    }> = [
      {
        name: "installed Ambient CLI package",
        request: "Use pi-arxiv to search robotics papers.",
        expectedLane: "installed-capability",
        expectedNextTool: "ambient_cli_search",
      },
      {
        name: "installed Ambient CLI command",
        request: "Run arxiv_search for robotics papers.",
        expectedLane: "installed-capability",
        expectedNextTool: "ambient_cli_search",
      },
      {
        name: "installed transcript package",
        request: "Use youtube-transcript to pull captions for this video.",
        expectedLane: "installed-capability",
        expectedNextTool: "ambient_cli_search",
      },
      {
        name: "installed transcript command",
        request: "Run youtube_transcript for EBw7gsDPAYQ.",
        expectedLane: "installed-capability",
        expectedNextTool: "ambient_cli_search",
      },
      {
        name: "curated Pi package URL",
        request: "Install this Pi package for arXiv search.",
        sourceUrl: "https://pi.dev/packages/pi-arxiv?name=arxiv",
        expectedLane: "pi-marketplace-curated-wrapper",
        expectedNextTool: "ambient_cli_package_install_pi_catalog",
      },
      {
        name: "curated Pi package name",
        request: "Add pi-arxiv from the Pi catalog.",
        expectedLane: "pi-marketplace-curated-wrapper",
        expectedNextTool: "ambient_cli_package_install_pi_catalog",
      },
      {
        name: "curated Pi Git skill source",
        request: "Add the YouTube transcript Pi skill from Badlogic.",
        sourceUrl: "https://github.com/badlogic/pi-skills/blob/main/youtube-transcript/SKILL.md",
        expectedLane: "pi-marketplace-curated-wrapper",
        expectedNextTool: "ambient_cli_package_install_pi_catalog",
      },
      {
        name: "curated Pi transcript phrase",
        request: "Install the YouTube transcript Pi marketplace skill.",
        expectedLane: "pi-marketplace-curated-wrapper",
        expectedNextTool: "ambient_cli_package_install_pi_catalog",
      },
      {
        name: "curated Pi arxiv phrase",
        request: "Install the Pi marketplace arxiv skill.",
        expectedLane: "pi-marketplace-curated-wrapper",
        expectedNextTool: "ambient_cli_package_install_pi_catalog",
      },
      {
        name: "curated Pi Brave Search source",
        request: "Use the Brave Search Pi skill from Badlogic's repo.",
        sourceUrl: "https://github.com/badlogic/pi-skills/blob/main/brave-search/SKILL.md",
        expectedLane: "pi-marketplace-curated-wrapper",
        expectedNextTool: "ambient_cli_package_install_pi_catalog",
      },
      {
        name: "generated Pi wrapper",
        request: "Adapt this simple Pi skill that calls a public API and returns JSON.",
        requestedKind: "pi-marketplace",
        expectedLane: "pi-marketplace-generated-wrapper",
        expectedNextTool: "ambient_capability_builder_plan",
      },
      {
        name: "generated Pi wrapper for unknown package URL",
        request: "Install this Pi package as an Ambient wrapper.",
        sourceUrl: "https://pi.dev/packages/weather-lite",
        expectedLane: "pi-marketplace-generated-wrapper",
        expectedNextTool: "ambient_capability_builder_plan",
      },
      {
        name: "generated Pi narrow CLI wrapper",
        request: "Wrap this Pi skill that shells to a narrow CLI and returns JSON.",
        requestedKind: "pi-marketplace",
        expectedLane: "pi-marketplace-generated-wrapper",
        expectedNextTool: "ambient_capability_builder_plan",
      },
      {
        name: "generated Pi public API wrapper",
        request: "Build an Ambient wrapper for a Pi package that only calls a public API.",
        requestedKind: "pi-marketplace",
        expectedLane: "pi-marketplace-generated-wrapper",
        expectedNextTool: "ambient_capability_builder_plan",
      },
      {
        name: "privileged Pi package",
        request: "Install this Pi extension that registers lifecycle hooks and edits global shell config on startup.",
        requestedKind: "pi-marketplace",
        expectedLane: "pi-marketplace-privileged-review",
        expectedNextTool: "ambient_pi_privileged_scan",
      },
      {
        name: "privileged Pi unrestricted filesystem",
        request: "Use this Pi package that needs unrestricted filesystem and process access.",
        requestedKind: "pi-marketplace",
        expectedLane: "pi-marketplace-privileged-review",
        expectedNextTool: "ambient_pi_privileged_scan",
      },
      {
        name: "privileged Pi background service",
        request: "Install a Pi extension that starts a background service.",
        requestedKind: "pi-marketplace",
        expectedLane: "pi-marketplace-privileged-review",
        expectedNextTool: "ambient_pi_privileged_scan",
      },
      {
        name: "privileged Pi startup mutation",
        request: "Install a Pi extension that mutates Pi settings on startup.",
        requestedKind: "pi-marketplace",
        expectedLane: "pi-marketplace-privileged-review",
        expectedNextTool: "ambient_pi_privileged_scan",
      },
      {
        name: "MCP GitHub repo",
        request: "Install this MCP server from GitHub.",
        sourceUrl: "https://github.com/example/example-mcp",
        expectedLane: "mcp-autowire",
        expectedNextTool: "ambient_mcp_autowire_plan",
      },
      {
        name: "Context7 MCP",
        request: "Wire up the Context7 MCP server.",
        expectedLane: "mcp-autowire",
        expectedNextTool: "ambient_mcp_autowire_plan",
      },
      {
        name: "Model Context Protocol source",
        request: "Add this Model Context Protocol source to Ambient.",
        expectedLane: "mcp-autowire",
        expectedNextTool: "ambient_mcp_autowire_plan",
      },
      {
        name: "server json MCP source",
        request: "Install the server.json MCP configuration from this repo.",
        expectedLane: "mcp-autowire",
        expectedNextTool: "ambient_mcp_autowire_plan",
      },
      {
        name: "local bridge MCP",
        request: "Add a local bridge MCP server for Ghidra.",
        expectedLane: "mcp-autowire",
        expectedNextTool: "ambient_mcp_autowire_plan",
      },
      {
        name: "requested MCP kind",
        request: "Install this source.",
        requestedKind: "mcp",
        expectedLane: "mcp-autowire",
        expectedNextTool: "ambient_mcp_autowire_plan",
      },
      {
        name: "Brave provider",
        request: "Add Brave Search as a search provider.",
        expectedLane: "provider-capability-builder",
        expectedNextTool: "ambient_provider_catalog",
      },
      {
        name: "ElevenLabs provider",
        request: "Install ElevenLabs as my assistant voice provider.",
        expectedLane: "provider-capability-builder",
        expectedNextTool: "ambient_provider_catalog",
      },
      {
        name: "local provider",
        request: "Set up SearXNG as a local search provider.",
        expectedLane: "provider-capability-builder",
        expectedNextTool: "ambient_provider_catalog",
      },
      {
        name: "Cartesia provider",
        request: "Set up Cartesia TTS for chat voicing.",
        expectedLane: "provider-capability-builder",
        expectedNextTool: "ambient_provider_catalog",
      },
      {
        name: "Piper provider",
        request: "Add Piper as a local TTS provider.",
        expectedLane: "provider-capability-builder",
        expectedNextTool: "ambient_provider_catalog",
      },
      {
        name: "Kokoro provider",
        request: "Set up Kokoro ONNX as my voice provider.",
        expectedLane: "provider-capability-builder",
        expectedNextTool: "ambient_provider_catalog",
      },
      {
        name: "custom provider kind",
        request: "Install this source as a provider.",
        requestedKind: "provider",
        expectedLane: "provider-capability-builder",
        expectedNextTool: "ambient_provider_catalog",
      },
      {
        name: "typed search provider",
        request: "Add a custom search provider capability for this API.",
        expectedLane: "provider-capability-builder",
        expectedNextTool: "ambient_provider_catalog",
      },
      {
        name: "Ambient CLI descriptor",
        request: "Install this descriptor-backed Ambient CLI package.",
        localPath: "./fixtures/ambient-cli",
        requestedKind: "ambient-cli-package",
        expectedLane: "ambient-cli-package",
        expectedNextTool: "ambient_cli_package_preview",
      },
      {
        name: "Ambient CLI manifest",
        request: "Preview this package with ambient-cli.json before installing.",
        expectedLane: "ambient-cli-package",
        expectedNextTool: "ambient_cli_package_preview",
      },
      {
        name: "Ambient CLI local source kind",
        request: "Install this local package.",
        localPath: "./fixtures/generated-cli",
        localSourceKind: "ambient-cli-package",
        expectedLane: "ambient-cli-package",
        expectedNextTool: "ambient_cli_package_preview",
      },
      {
        name: "Ambient CLI typed request",
        request: "Install this source.",
        requestedKind: "ambient-cli-package",
        expectedLane: "ambient-cli-package",
        expectedNextTool: "ambient_cli_package_preview",
      },
      {
        name: "normal app",
        request: "Install ffmpeg for this project.",
        expectedLane: "normal-app-setup",
        expectedNextTool: "ambient_setup_runtime_preflight",
      },
      {
        name: "Ghidra app",
        request: "Install Ghidra so I can use it locally.",
        expectedLane: "normal-app-setup",
        expectedNextTool: "ambient_setup_runtime_preflight",
      },
      {
        name: "uv setup",
        request: "Set up uv in this workspace.",
        expectedLane: "normal-app-setup",
        expectedNextTool: "ambient_setup_runtime_preflight",
      },
      {
        name: "Docker setup",
        request: "Install Docker for local development.",
        expectedLane: "normal-app-setup",
        expectedNextTool: "ambient_setup_runtime_preflight",
      },
      {
        name: "Python runtime setup",
        request: "Configure the Python runtime for this project.",
        expectedLane: "normal-app-setup",
        expectedNextTool: "ambient_setup_runtime_preflight",
      },
      {
        name: "privileged daemon",
        request: "Install a launch daemon for this helper.",
        expectedLane: "privileged-action",
        expectedNextTool: "ambient_privileged_action_request",
      },
      {
        name: "protected symlink",
        request: "Create a symlink in /usr/bin for this tool.",
        expectedLane: "privileged-action",
        expectedNextTool: "ambient_privileged_action_request",
      },
      {
        name: "kernel driver",
        request: "Install a kernel driver for this device.",
        expectedLane: "privileged-action",
        expectedNextTool: "ambient_privileged_action_request",
      },
      {
        name: "protected etc write",
        request: "Write a config file into /etc for this package.",
        expectedLane: "privileged-action",
        expectedNextTool: "ambient_privileged_action_request",
      },
      {
        name: "hidden Codex plugin",
        request: "Install this Codex plugin marketplace entry.",
        expectedLane: "unsupported",
      },
      {
        name: "hidden local plugin",
        request: "Activate this unsupported local Ambient plugin directory.",
        localPath: "./plugin",
        localSourceKind: "codex-plugin",
        expectedLane: "unsupported",
      },
      {
        name: "hidden marketplace json",
        request: "Preview this marketplace.json plugin package.",
        expectedLane: "unsupported",
      },
      {
        name: "hidden ambient plugin direct tool",
        request: "Use ambient_plugin_install_preview for this marketplace.json.",
        expectedLane: "unsupported",
      },
      {
        name: "unknown source",
        request: "Install this thing.",
        expectedLane: "needs-clarification",
        expectedNextTool: "ambient_install_route_plan",
      },
    ];

    expect(cases.length).toBeGreaterThanOrEqual(40);

    for (const item of cases) {
      const plan = planAmbientInstallRoute(
        {
          userRequest: item.request,
          ...(item.sourceUrl ? { sourceUrl: item.sourceUrl } : {}),
          ...(item.localPath ? { localPath: item.localPath } : {}),
          ...(item.packageName ? { packageName: item.packageName } : {}),
          ...(item.requestedKind ? { requestedKind: item.requestedKind } : {}),
        },
        {
          installedAmbientCliPackages: [
            { name: "pi-arxiv", commands: ["arxiv_search", "arxiv_paper"] },
            { name: "youtube-transcript", commands: ["youtube_transcript"] },
          ],
          localSourceKinds: item.localPath && item.localSourceKind ? { [item.localPath]: item.localSourceKind } : undefined,
        },
      );
      expect(plan.lane, item.name).toBe(item.expectedLane);
      if (item.expectedNextTool) expect(plan.nextTools.map((tool) => tool.name), item.name).toContain(item.expectedNextTool);
    }
  });

  it("returns exact next-tool sequences for representative route lanes", () => {
    const cases: Array<{ name: string; input: Parameters<typeof planAmbientInstallRoute>[0]; expectedTools: string[] }> = [
      {
        name: "installed",
        input: { userRequest: "Use pi-arxiv to search papers." },
        expectedTools: ["ambient_cli_search", "ambient_cli_describe", "ambient_cli"],
      },
      {
        name: "curated Pi wrapper",
        input: { userRequest: "Install https://pi.dev/packages/pi-arxiv?name=arxiv" },
        expectedTools: ["ambient_cli_package_install_pi_catalog", "ambient_cli_search", "ambient_cli_describe"],
      },
      {
        name: "generated Pi wrapper",
        input: { userRequest: "Wrap this simple Pi skill.", requestedKind: "pi-marketplace" },
        expectedTools: ["ambient_capability_builder_plan"],
      },
      {
        name: "privileged Pi review",
        input: { userRequest: "Install this Pi extension with lifecycle hooks.", requestedKind: "pi-marketplace" },
        expectedTools: ["ambient_pi_privileged_scan"],
      },
      {
        name: "MCP",
        input: { userRequest: "Install the Context7 MCP server." },
        expectedTools: ["ambient_mcp_autowire_plan"],
      },
      {
        name: "provider",
        input: { userRequest: "Add Brave Search as a search provider." },
        expectedTools: ["ambient_provider_catalog", "ambient_capability_builder_plan"],
      },
      {
        name: "Ambient CLI package",
        input: { userRequest: "Install this ambient-cli.json package." },
        expectedTools: ["ambient_cli_package_preview", "ambient_cli_package_install", "ambient_cli_search", "ambient_cli_describe"],
      },
      {
        name: "normal setup",
        input: { userRequest: "Install ffmpeg for this project." },
        expectedTools: ["ambient_setup_runtime_preflight", "ambient_setup_recipe_describe"],
      },
      {
        name: "privileged action",
        input: { userRequest: "Install a launch daemon." },
        expectedTools: ["ambient_privileged_action_request"],
      },
      {
        name: "unsupported plugin",
        input: { userRequest: "Install this Codex plugin marketplace entry." },
        expectedTools: [],
      },
    ];

    for (const item of cases) {
      const plan = planAmbientInstallRoute(item.input, {
        installedAmbientCliPackages: [{ name: "pi-arxiv", commands: ["arxiv_search"] }],
      });
      expect(plan.nextTools.map((tool) => tool.name), item.name).toEqual(item.expectedTools);
    }
  });

  it("keeps Pi marketplace packages on Ambient wrapper or explicit privileged/refusal paths", () => {
    expect(planAmbientInstallRoute({ userRequest: "Install https://pi.dev/packages/pi-arxiv?name=arxiv" })).toMatchObject({
      lane: "pi-marketplace-curated-wrapper",
      nextTools: expect.arrayContaining([expect.objectContaining({ name: "ambient_cli_package_install_pi_catalog" })]),
      warnings: expect.arrayContaining([expect.stringContaining("sandboxed")]),
    });

    const generated = planAmbientInstallRoute({ userRequest: "Wrap this Pi package that only calls a public API.", requestedKind: "pi-marketplace" });
    expect(generated).toMatchObject({
      lane: "pi-marketplace-generated-wrapper",
      nextTools: [expect.objectContaining({ name: "ambient_capability_builder_plan" })],
    });
    expect(generated.warnings.join("\n")).toContain("Do not execute raw upstream Pi extension code");

    const privileged = planAmbientInstallRoute({
      userRequest: "Use this Pi package that needs unrestricted filesystem and process access.",
      requestedKind: "pi-marketplace",
    });
    expect(privileged).toMatchObject({
      lane: "pi-marketplace-privileged-review",
      nextTools: [expect.objectContaining({ name: "ambient_pi_privileged_scan" })],
    });
  });

  it("refuses hidden plugin routes without recommending plugin install tools", () => {
    for (const request of [
      "Install this Codex plugin marketplace entry.",
      "Install this local Ambient plugin directory.",
      "Activate this unsupported plugin marketplace package.",
      "Use ambient_plugin_install_preview for this marketplace.json.",
    ]) {
      const plan = planAmbientInstallRoute({ userRequest: request });
      expect(plan.lane).toBe("unsupported");
      expect(plan.blockers.join("\n")).toContain("Plugin marketplace");
      expect(plan.nextTools.map((tool) => tool.name)).not.toEqual(
        expect.arrayContaining(["ambient_plugin_install_preview", "ambient_plugin_install_commit", "ambient_plugin_activate"]),
      );
    }
  });

  it("uses Ambient-managed secret mechanisms for cloud provider routes", () => {
    const plan = planAmbientInstallRoute({ userRequest: "Set up Cartesia TTS for chat voicing." });
    expect(plan).toMatchObject({
      lane: "provider-capability-builder",
      secretHandling: {
        requiresSecret: true,
        allowedMechanism: "ambient_capability_builder_secret_request",
      },
    });
    expect(plan.secretHandling?.warning).toContain("Never ask for the value in chat");
  });

  it("formats a Pi-visible route summary without exposing hidden schemas", () => {
    const text = ambientInstallRoutePlanText(
      planAmbientInstallRoute({ userRequest: "Install this MCP server from GitHub.", sourceUrl: "https://github.com/example/example-mcp" }),
    );
    expect(text).toContain("Lane: mcp-autowire");
    expect(text).toContain("ambient_mcp_autowire_plan");
    expect(text).toContain("Approval boundary: none-readonly");
  });

  it("emits redacted route summary and telemetry metadata for transcript cards and gates", () => {
    const plan = planAmbientInstallRoute({
      userRequest: "Set up Cartesia TTS for chat voicing with my private key.",
    });

    expect(ambientInstallRouteSummary(plan)).toMatchObject({
      kind: "ambient-install-route-summary",
      lane: "provider-capability-builder",
      confidence: "high",
      approvalBoundary: "user-approval-before-write",
      nextTools: ["ambient_provider_catalog", "ambient_capability_builder_plan"],
      secretHandling: {
        requiresSecret: true,
        allowedMechanism: "ambient_capability_builder_secret_request",
      },
      validationTarget: {
        kind: "provider-smoke",
      },
    });

    const telemetry = ambientInstallRouteTelemetry(plan);
    expect(telemetry).toEqual({
      kind: "ambient-install-route-telemetry",
      lane: "provider-capability-builder",
      confidence: "high",
      approvalBoundary: "user-approval-before-write",
      selectedNextTool: "ambient_provider_catalog",
      nextToolCount: 2,
      blockerCount: 0,
      warningCount: 1,
      requiresSecret: true,
      secretMechanism: "ambient_capability_builder_secret_request",
      validationKind: "provider-smoke",
      status: "planned",
    });
    expect(JSON.stringify(telemetry)).not.toContain("private key");
    expect(JSON.stringify(telemetry)).not.toContain("Cartesia TTS");
  });
});
