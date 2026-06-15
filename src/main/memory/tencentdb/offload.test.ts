import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../../../shared/types";
import {
  ambientTencentMemoryOffloadEntriesFromMessages,
  buildAmbientTencentMemoryOffloadContext,
} from "./offload";

describe("TencentDB memory short-term offload adapter", () => {
  it("turns artifact-backed large output metadata into bounded MMD context", () => {
    const context = buildAmbientTencentMemoryOffloadContext({
      messages: [
        toolMessage({
          id: "tool-browser",
          toolName: "browser_content",
          label: "page text",
          artifactPath: ".ambient/tool-outputs/page.txt",
          content: "raw page secret must not appear",
          chars: 24_500,
          previewChars: 12_000,
        }),
      ],
      maxContextChars: 2_000,
    });

    expect(context?.entries).toEqual([
      expect.objectContaining({
        sourceMessageId: "tool-browser",
        toolName: "browser_content",
        label: "page text",
        artifactPath: ".ambient/tool-outputs/page.txt",
      }),
    ]);
    expect(context?.text).toContain("<ambient_memory_short_term_offload>");
    expect(context?.text).toContain("```mermaid");
    expect(context?.text).toContain(".ambient/tool-outputs/page.txt");
    expect(context?.text).toContain("long_context_process");
    expect(context?.text).not.toContain("raw page secret");
  });

  it("skips Pi-native bash/read results and metadata without artifact paths", () => {
    const entries = ambientTencentMemoryOffloadEntriesFromMessages([
      toolMessage({
        id: "tool-bash",
        toolName: "bash",
        label: "stdout",
        artifactPath: ".ambient/tool-outputs/bash.txt",
      }),
      toolMessage({
        id: "tool-read",
        toolName: "read",
        label: "file",
        artifactPath: ".ambient/tool-outputs/read.txt",
      }),
      toolMessage({
        id: "tool-plugin-no-artifact",
        toolName: "plugin_tool",
        label: "output",
        artifactPath: undefined,
      }),
    ]);

    expect(entries).toEqual([]);
  });

  it("uses newest eligible large-output artifacts first and respects max entries", () => {
    const entries = ambientTencentMemoryOffloadEntriesFromMessages([
      toolMessage({
        id: "old-tool",
        toolName: "browser_content",
        label: "old output",
        artifactPath: ".ambient/tool-outputs/old.txt",
      }),
      toolMessage({
        id: "new-tool",
        toolName: "workflow_shell",
        label: "new output",
        artifactPath: ".ambient/tool-outputs/new.txt",
      }),
    ], 1);

    expect(entries).toEqual([
      expect.objectContaining({
        sourceMessageId: "new-tool",
        toolName: "workflow_shell",
        artifactPath: ".ambient/tool-outputs/new.txt",
      }),
    ]);
  });

  it("truncates over-budget context while keeping the offload block closed", () => {
    const context = buildAmbientTencentMemoryOffloadContext({
      messages: [
        toolMessage({
          id: "tool-large",
          toolName: "browser_eval",
          label: "x".repeat(1_500),
          artifactPath: `.ambient/tool-outputs/${"a".repeat(1_500)}.txt`,
          content: "raw eval output secret must not appear",
          chars: 125_000,
          previewChars: 12_000,
        }),
      ],
      maxContextChars: 800,
    });

    expect(context?.truncated).toBe(true);
    expect(context?.text.length).toBeLessThanOrEqual(850);
    expect(context?.text).toContain("[truncated]");
    expect(context?.text).toContain("</ambient_memory_short_term_offload>");
    expect(context?.text).not.toContain("raw eval output secret");
  });
});

function toolMessage(input: {
  id: string;
  toolName: string;
  label: string;
  artifactPath?: string;
  content?: string;
  chars?: number;
  previewChars?: number;
}): ChatMessage {
  return {
    id: input.id,
    threadId: "thread-1",
    role: "tool",
    content: input.content ?? "visible preview",
    createdAt: "2026-06-13T00:00:00.000Z",
    metadata: {
      status: "done",
      toolName: input.toolName,
      toolResultDetails: {
        largeOutputPreview: {
          kind: "large-output",
          summary: `${input.label} summary`,
          items: [{
            label: input.label,
            chars: input.chars ?? 32_000,
            previewChars: input.previewChars ?? 12_000,
            truncated: true,
            ...(input.artifactPath ? { artifactPath: input.artifactPath } : {}),
            artifactBytes: 33_000,
            suggestedTools: ["file_read", "long_context_process"],
          }],
        },
      },
    },
  };
}
