import { describe, expect, it } from "vitest";
import { AMBIENT_DIRECT_MCP_TOOL_BRIDGE_NAMES } from "../../ambient/ambientToolRouter";
import { ambientMcpBridgeActiveToolNamesForRecoveredTranscript } from "./agentRuntimeMcpRecoveredTranscript";

describe("agentRuntimeMcpRecoveredTranscript", () => {
  it("rehydrates compact installed-MCP bridge tools when the visible transcript proves MCP activity", () => {
    const toolNames = ambientMcpBridgeActiveToolNamesForRecoveredTranscript([
      { role: "user", content: "Install this MCP capability: https://github.com/hoqqun/stooq-mcp" },
      { role: "tool", content: "MCP server stooq-mcp-source-mcp is ready. ToolHive workload ambient-stooq-mcp-source-mcp-2c6b3f67." },
      { role: "assistant", content: "The server is installed. I will smoke-test it with ambient_mcp_tool_call." },
    ]);

    expect(toolNames).toEqual([...AMBIENT_DIRECT_MCP_TOOL_BRIDGE_NAMES]);
  });

  it("keeps unrelated recovered transcripts lean", () => {
    expect(ambientMcpBridgeActiveToolNamesForRecoveredTranscript([
      { role: "user", content: "Build a small TODO app." },
      { role: "assistant", content: "I created the app and ran tests." },
    ])).toEqual([]);
  });

  it("only scans the recent transcript window for MCP recovery signals", () => {
    expect(ambientMcpBridgeActiveToolNamesForRecoveredTranscript([
      { role: "tool", content: `MCP server old-server is ready.${"x".repeat(81_000)}` },
    ])).toEqual([]);
  });
});
