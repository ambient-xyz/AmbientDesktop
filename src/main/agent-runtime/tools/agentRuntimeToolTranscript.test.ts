import { describe, expect, it } from "vitest";

import type { ChatMessage, ToolArgumentProgressSnapshot } from "../../../shared/threadTypes";
import {
  chatToolEventDetails,
  formatToolTranscript,
  subagentMutationCategoryForChildTool,
  subagentToolInputPathFromMessage,
  toolEventLabel,
  toolInputSectionTitle,
  toolInputTranscriptSection,
} from "./agentRuntimeToolTranscript";

describe("agentRuntimeToolTranscript", () => {
  it("formats tool transcripts with input and result sections", () => {
    expect(formatToolTranscript("bash", "running", "  pnpm test  ", "  ok  ")).toBe([
      "bash running",
      "",
      "Command",
      "pnpm test",
      "",
      "Result",
      "ok",
    ].join("\n"));
    expect(formatToolTranscript("browser_content", "done", "{}", "")).toBe([
      "browser_content done",
      "",
      "Input",
      "{}",
    ].join("\n"));
    expect(toolInputSectionTitle("shell")).toBe("Command");
    expect(toolInputSectionTitle("read_file")).toBe("Input");
  });

  it("extracts tool input transcript sections and workspace paths", () => {
    const workspacePath = "/tmp/workspace";
    const content = formatToolTranscript(
      "write_file",
      "done",
      JSON.stringify({ filePath: `${workspacePath}/notes/todo.md` }, null, 2),
      "created",
    );
    const message = {
      role: "tool",
      content,
    } as ChatMessage;

    expect(toolInputTranscriptSection(content, "write_file")).toContain("notes/todo.md");
    expect(subagentToolInputPathFromMessage(message, "write_file", workspacePath)).toBe("notes/todo.md");
    expect(subagentToolInputPathFromMessage({ ...message, content: "no input" }, "write_file", workspacePath)).toBeUndefined();
  });

  it("classifies mutating subagent child tool categories", () => {
    expect(subagentMutationCategoryForChildTool("bash")).toBe("workspace.write");
    expect(subagentMutationCategoryForChildTool("ambient_mcp_tool_call")).toBe("mcp.direct");
    expect(subagentMutationCategoryForChildTool("mcp_search")).toBe("mcp.direct");
    expect(subagentMutationCategoryForChildTool("browser_nav")).toBe("browser.interactive");
    expect(subagentMutationCategoryForChildTool("browser_content")).toBeUndefined();
    expect(subagentMutationCategoryForChildTool("workspace_file_write")).toBe("workspace.write");
    expect(subagentMutationCategoryForChildTool("connector_write_record")).toBe("connector.write");
  });

  it("builds compact chat tool event details and labels plugin tools", () => {
    const progress = { phase: "streaming", currentKey: "query" } as unknown as ToolArgumentProgressSnapshot;
    const details = chatToolEventDetails({
      source: "plugin-mcp",
      pluginName: "Context7",
      toolName: "query-docs",
      registeredName: "context7_query_docs",
    }, "workspace", "running", "fallback", progress);

    expect(details).toMatchObject({
      source: "plugin-mcp",
      runtime: "chat",
      permissionMode: "workspace",
      pluginName: "Context7",
      toolName: "query-docs",
      registeredName: "context7_query_docs",
      result: "running",
      toolPhase: "streaming",
      toolArgumentProgress: progress,
    });
    expect(details).not.toHaveProperty("pluginId");
    expect(toolEventLabel("fallback", details)).toBe("Context7: query-docs");
    expect(toolEventLabel("fallback", undefined)).toBe("fallback");
  });
});
