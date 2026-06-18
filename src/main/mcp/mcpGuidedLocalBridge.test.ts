import { describe, expect, it } from "vitest";
import { mcpAutowirePhase0Fixtures } from "./mcpAutowireFacade";
import {
  mcpGuidedLocalBridgePreflightText,
  mcpGuidedLocalBridgePreviewText,
  previewGuidedLocalBridge,
  runGuidedLocalBridgePreflight,
} from "./mcpGuidedLocalBridge";

describe("MCP guided local bridge", () => {
  it("builds a setup-only GhidraMCP bridge review with exact loopback targets", () => {
    const preview = previewGuidedLocalBridge({ candidate: mcpAutowirePhase0Fixtures.ghidraMcp });

    expect(preview).toMatchObject({
      serverId: "ghidramcp-guided-local-bridge",
      catalogSource: "guided-local-bridge",
      hardBlockers: [],
      bridge: {
        host: "127.0.0.1",
        port: 8081,
        transport: "sse",
        bridgeBaseUrl: "http://127.0.0.1:8081",
        bridgeProbeUrl: "http://127.0.0.1:8081/sse",
        upstreamAppUrl: "http://127.0.0.1:8080/",
        allowedPorts: [8080, 8081],
        localApps: ["Ghidra"],
      },
    });
    const checkpoints = preview.setupCheckpoints.join("\n");
    expect(checkpoints).toContain("Install Ghidra");
    expect(checkpoints).toContain("extension");
    expect(checkpoints).toContain("project");
    expect(mcpGuidedLocalBridgePreviewText(preview)).toContain("Ambient will not install Ghidra");
    expect(mcpGuidedLocalBridgePreviewText(preview)).toContain("Probe URL: http://127.0.0.1:8081/sse");
  });

  it("runs only bounded approved loopback preflight checks", async () => {
    const fetched: string[] = [];
    const result = await runGuidedLocalBridgePreflight({
      candidate: mcpAutowirePhase0Fixtures.ghidraMcp,
      fetchImpl: async (input) => {
        fetched.push(String(input));
        return new Response("", { status: 200 });
      },
    });

    expect(result.status).toBe("ready");
    expect(fetched).toEqual([
      "http://127.0.0.1:8081/sse",
      "http://127.0.0.1:8080/",
    ]);
    expect(result.checks.map((check) => [check.id, check.status])).toEqual([
      ["candidate-review", "pass"],
      ["mcp-bridge", "pass"],
      ["upstream-local-app", "pass"],
    ]);
    expect(mcpGuidedLocalBridgePreflightText(result)).toContain("No local software was installed or started");
  });

  it("fails closed on non-loopback bridge candidates", () => {
    const candidate = structuredClone(mcpAutowirePhase0Fixtures.ghidraMcp);
    candidate.runtime.localBridge!.host = "192.168.1.50";
    candidate.permissions.network.allowHosts = ["192.168.1.50"];

    const preview = previewGuidedLocalBridge({ candidate });

    expect(preview.hardBlockers.join("\n")).toContain("loopback-only");
    expect(mcpGuidedLocalBridgePreviewText(preview)).toContain("Hard blockers:");
  });
});
