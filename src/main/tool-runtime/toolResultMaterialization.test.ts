import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  materializeToolDefinitions,
  materializeToolResultFinalizerExtensionFactory,
  materializeToolResultExtensionFactory,
  materializeToolResultTextContent,
} from "./toolResultMaterialization";

describe("tool result materialization", () => {
  it("caps text tool results and writes the full output artifact", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-tool-result-materialized-"));
    try {
      const result = await materializeToolResultTextContent({
        content: [{ type: "text" as const, text: "x".repeat(200) }],
        details: { runtime: "fixture" },
      }, {
        workspacePath: workspace,
        artifactLabelPrefix: "fixture_tool",
        maxPreviewChars: 40,
      });

      const text = result.content[0]?.text ?? "";
      expect(text.startsWith("x".repeat(40))).toBe(true);
      expect(text).not.toContain("x".repeat(80));
      expect(text).toContain("[truncated] fixture_tool-text preview is 40 of 200 chars");
      expect(result.details).toMatchObject({
        runtime: "fixture",
        textOutput: expect.objectContaining({
          totalChars: 200,
          previewChars: 40,
          truncated: true,
          artifactPath: expect.stringMatching(/^\.ambient\/tool-outputs\//),
        }),
        largeOutputPreview: expect.objectContaining({
          kind: "large-output",
          items: [expect.objectContaining({
            chars: 200,
            previewChars: 40,
            truncated: true,
            artifactPath: expect.stringMatching(/^\.ambient\/tool-outputs\//),
            suggestedTools: ["file_read", "long_context_process"],
          })],
        }),
      });
      const artifactPath = (result.details as any).textOutput.artifactPath;
      await expect(readFile(join(workspace, artifactPath), "utf8")).resolves.toBe("x".repeat(200));
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("spends one preview budget across multiple text content items", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-tool-result-aggregate-"));
    try {
      const result = await materializeToolResultTextContent({
        content: [
          { type: "text" as const, text: "a".repeat(30) },
          { type: "text" as const, text: "b".repeat(30) },
          { type: "text" as const, text: "c".repeat(30) },
        ],
        details: {},
      }, {
        workspacePath: workspace,
        artifactLabelPrefix: "aggregate_tool",
        maxPreviewChars: 50,
      });

      const firstText = (result.content[0] as any).text;
      const secondText = (result.content[1] as any).text;
      const thirdText = (result.content[2] as any).text;
      expect(firstText).toBe("a".repeat(30));
      expect(secondText).toContain(`${"b".repeat(20)}\n\n[truncated] aggregate_tool-text-2 preview is 20 of 30 chars`);
      expect(secondText).not.toContain("b".repeat(30));
      expect(thirdText).toContain("[truncated] aggregate_tool-text-3 preview is 0 of 30 chars");
      expect(thirdText).not.toContain("c".repeat(10));
      expect((result.details as any).largeOutputPreview.items).toHaveLength(2);
      const artifactPaths = (result.details as any).largeOutputPreview.items.map((item: any) => item.artifactPath);
      await expect(readFile(join(workspace, artifactPaths[0]), "utf8")).resolves.toBe("b".repeat(30));
      await expect(readFile(join(workspace, artifactPaths[1]), "utf8")).resolves.toBe("c".repeat(30));
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("bounds visible truncation notices across many text content items", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-tool-result-many-items-"));
    try {
      const result = await materializeToolResultTextContent({
        content: Array.from({ length: 14 }, (_value, index) => ({
          type: "text" as const,
          text: String(index % 10).repeat(20),
        })),
        details: {},
      }, {
        workspacePath: workspace,
        artifactLabelPrefix: "many_item_tool",
        maxPreviewChars: 10,
      });

      const visibleText = result.content.map((item: any) => item.text ?? "").join("\n");
      expect((visibleText.match(/\[truncated\]/g) ?? [])).toHaveLength(9);
      expect(visibleText).toContain("additional tool text outputs were materialized after the preview notice limit");
      expect((result.details as any).largeOutputPreview.items).toHaveLength(14);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("materializes final tool_result events for tools loaded outside inline factories", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-tool-result-finalizer-"));
    try {
      const toolResultHandlers: Array<(event: any) => unknown> = [];
      materializeToolResultFinalizerExtensionFactory({
        workspacePath: workspace,
        maxPreviewChars: 30,
      })({
        on: (eventName: string, handler: (event: any) => unknown) => {
          expect(eventName).toBe("tool_result");
          toolResultHandlers.push(handler);
        },
      } as any);

      expect(toolResultHandlers).toHaveLength(1);
      const patch = await toolResultHandlers[0]({
        toolName: "loaded_extension_tool",
        content: [{ type: "text", text: "l".repeat(120) }],
        details: { runtime: "loaded-extension" },
        isError: false,
      }) as any;

      expect(patch.content[0].text).toContain("[truncated] loaded_extension_tool-text preview is 30 of 120 chars");
      expect(patch.details).toMatchObject({
        runtime: "loaded-extension",
        textOutput: expect.objectContaining({
          artifactPath: expect.stringMatching(/^\.ambient\/tool-outputs\//),
        }),
      });
      await expect(readFile(join(workspace, patch.details.textOutput.artifactPath), "utf8")).resolves.toBe("l".repeat(120));
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("does not rematerialize routed results with nested materialized output metadata", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-tool-result-routed-finalizer-"));
    try {
      const toolResultHandlers: Array<(event: any) => unknown> = [];
      materializeToolResultFinalizerExtensionFactory({
        workspacePath: workspace,
        maxPreviewChars: 10,
      })({
        on: (_eventName: string, handler: (event: any) => unknown) => {
          toolResultHandlers.push(handler);
        },
      } as any);

      await expect(Promise.resolve(toolResultHandlers[0]({
        toolName: "ambient_tool_call",
        content: [{ type: "text", text: "preview plus original truncation notice" }],
        details: {
          runtime: "ambient-tool-router",
          wrappedTool: "loaded_extension_tool",
          resultDetails: {
            toolResultTextOutputs: [{
              label: "loaded_extension_tool-text",
              artifactPath: ".ambient/tool-outputs/full-output.txt",
              totalChars: 120,
              previewChars: 10,
              truncated: true,
            }],
          },
        },
        isError: false,
      }))).resolves.toBeUndefined();
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("does not rematerialize wrapped router results with nested materialized output metadata", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-tool-result-routed-wrapper-"));
    try {
      const result = {
        content: [{ type: "text" as const, text: "preview plus original truncation notice" }],
        details: {
          runtime: "ambient-tool-router",
          wrappedTool: "loaded_extension_tool",
          resultDetails: {
            toolResultTextOutputs: [{
              label: "loaded_extension_tool-text",
              artifactPath: ".ambient/tool-outputs/full-output.txt",
              totalChars: 120,
              previewChars: 10,
              truncated: true,
            }],
          },
        },
      };

      await expect(materializeToolResultTextContent(result, {
        workspacePath: workspace,
        maxPreviewChars: 10,
      })).resolves.toBe(result);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("wraps extension-registered tool results", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-tool-result-extension-"));
    try {
      const registeredTools: any[] = [];
      const extension = materializeToolResultExtensionFactory((pi) => {
        pi.registerTool({
          name: "huge_tool",
          description: "Huge output.",
          parameters: { type: "object", properties: {} },
          execute: async () => ({
            content: [{ type: "text" as const, text: "y".repeat(150) }],
            details: { runtime: "extension-fixture" },
          }),
        } as any);
      }, {
        workspacePath: workspace,
        maxPreviewChars: 30,
      });

      extension({ registerTool: (tool: any) => registeredTools.push(tool) } as any);
      const result = await registeredTools[0].execute("call", {});

      expect(result.content[0].text).toContain("[truncated] huge_tool-text preview is 30 of 150 chars");
      const artifactPath = result.details.textOutput.artifactPath;
      await expect(readFile(join(workspace, artifactPath), "utf8")).resolves.toBe("y".repeat(150));
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("wraps custom tool definitions", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-tool-result-custom-"));
    try {
      const [tool] = materializeToolDefinitions([
        {
          name: "custom_huge",
          description: "Custom huge output.",
          parameters: { type: "object", properties: {} },
          execute: async () => ({ content: [{ type: "text" as const, text: "z".repeat(90) }] }),
        } as any,
      ], {
        workspacePath: workspace,
        maxPreviewChars: 25,
      });

      const result = await tool.execute("call", {});
      expect(result.content[0].text).toContain("[truncated] custom_huge-text preview is 25 of 90 chars");
      const artifactPath = result.details.textOutput.artifactPath;
      await expect(readFile(join(workspace, artifactPath), "utf8")).resolves.toBe("z".repeat(90));
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("caps oversized invalid arguments before Pi validation echoes them", async () => {
    const [tool] = materializeToolDefinitions([
      {
        name: "custom_write",
        description: "Custom write.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string" },
            content: { type: "string" },
          },
          required: ["path", "content"],
          additionalProperties: false,
        },
        execute: async () => ({ content: [{ type: "text" as const, text: "ok" }] }),
      } as any,
    ], {
      workspacePath: "/tmp",
      maxPreviewChars: 1_000,
    });

    const invalidArgs = { content: "w".repeat(10_000) };
    const invalidMessage = captureSyncErrorMessage(() => tool.prepareArguments!(invalidArgs));
    expect(invalidMessage).toContain("Validation failed for tool \"custom_write\"");
    expect(invalidMessage).toContain("Received arguments exceeded the validation preview budget");
    expect(invalidMessage.length).toBeLessThan(2_000);
    expect(invalidMessage).not.toContain("w".repeat(2_000));

    const validArgs = { path: "notes.txt", content: "w".repeat(10_000) };
    expect(tool.prepareArguments!(validArgs)).toBe(validArgs);
  });

  it("awaits materialized updates before returning the final result", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-tool-result-update-"));
    try {
      const [tool] = materializeToolDefinitions([
        {
          name: "custom_update",
          description: "Custom update output.",
          parameters: { type: "object", properties: {} },
          execute: async (_toolCallId: string, _params: unknown, _signal: AbortSignal | undefined, onUpdate: any) => {
            onUpdate({ content: [{ type: "text" as const, text: "u".repeat(90) }], details: {} });
            return { content: [{ type: "text" as const, text: "done" }], details: {} };
          },
        } as any,
      ], {
        workspacePath: workspace,
        maxPreviewChars: 25,
      });

      const updates: any[] = [];
      const result = await tool.execute("call", {}, undefined, (update: any) => updates.push(update), undefined as any);
      expect(updates).toHaveLength(1);
      expect(updates[0].content[0].text).toContain("[truncated] custom_update-text preview is 25 of 90 chars");
      expect(result.content[0].text).toBe("done");
      const artifactPath = updates[0].details.textOutput.artifactPath;
      await expect(readFile(join(workspace, artifactPath), "utf8")).resolves.toBe("u".repeat(90));
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("throws tool exceptions as capped errors with artifacts", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-tool-result-error-"));
    try {
      const [tool] = materializeToolDefinitions([
        {
          name: "custom_error",
          description: "Custom error output.",
          parameters: { type: "object", properties: {} },
          execute: async () => {
            throw new Error("e".repeat(120));
          },
        } as any,
      ], {
        workspacePath: workspace,
        maxPreviewChars: 35,
      });

      const result = await tool.execute("call", {}, undefined, undefined, undefined as any);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("[truncated] custom_error-text preview is 35");
      expect(result.content[0].text).not.toContain("e".repeat(80));
      expect(result.details).toMatchObject({
        status: "error",
        toolName: "custom_error",
        toolResultMaterializer: {
          isError: true,
          toolName: "custom_error",
        },
      });
      const artifactPath = result.details.textOutput.artifactPath;
      const artifact = await readFile(join(workspace, artifactPath), "utf8");
      expect(artifact).toBe("e".repeat(120));
      expect(artifact.length).toBeGreaterThan(35);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("materializes returned error results and marks them for the Pi error hook", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-tool-result-returned-error-"));
    try {
      const registeredTools: any[] = [];
      const toolResultHandlers: Array<(event: any) => unknown> = [];
      const extension = materializeToolResultExtensionFactory((pi) => {
        pi.registerTool({
          name: "custom_returned_error",
          description: "Custom returned error output.",
          parameters: { type: "object", properties: {} },
          execute: async () => ({
            content: [{ type: "text" as const, text: "r".repeat(90) }],
            details: { status: "error" },
            isError: true,
          }),
        } as any);
      }, {
        workspacePath: workspace,
        maxPreviewChars: 25,
      });
      extension({
        registerTool: (tool: any) => registeredTools.push(tool),
        on: (eventName: string, handler: (event: any) => unknown) => {
          expect(eventName).toBe("tool_result");
          toolResultHandlers.push(handler);
        },
      } as any);

      const result = await registeredTools[0].execute("call", {}, undefined, undefined, undefined as any);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("[truncated] custom_returned_error-text preview is 25 of 90 chars");
      expect(result.content[0].text).not.toContain("r".repeat(60));
      expect(result.details).toMatchObject({
        status: "error",
        toolResultMaterializer: {
          isError: true,
          toolName: "custom_returned_error",
        },
      });
      expect(toolResultHandlers).toHaveLength(1);
      await expect(Promise.resolve(toolResultHandlers[0]({
        toolName: "custom_returned_error",
        details: result.details,
        isError: false,
      }))).resolves.toEqual({ isError: true });
      const artifactPath = result.details.textOutput.artifactPath;
      await expect(readFile(join(workspace, artifactPath), "utf8")).resolves.toBe("r".repeat(90));
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});

function captureSyncErrorMessage(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("Expected function to throw.");
}
