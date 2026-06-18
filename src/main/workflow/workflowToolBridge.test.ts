import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkflowManifest } from "../../shared/workflowTypes";
import type { DesktopToolDescriptor } from "./workflowDesktopToolFacade";
import type { WorkflowRuntimeEvent } from "./workflowAgentRuntime";
import { createWorkflowToolBridge } from "./workflowToolBridge";

const echoDescriptor: DesktopToolDescriptor = {
  name: "echo",
  label: "Echo",
  description: "Echo test input.",
  promptSnippet: "echo: Echo test input.",
  promptGuidelines: [],
  inputSchema: {
    type: "object",
    properties: {
      text: { type: "string" },
      count: { type: "number" },
    },
    required: ["text"],
    additionalProperties: false,
  },
  source: "first-party",
  sideEffects: "none",
  permissionScope: "test",
  supportsDryRun: true,
  supportsUndo: false,
  idempotency: "not-supported",
  defaultTimeoutMs: 1_000,
};

const ambientCliDescriptor: DesktopToolDescriptor = {
  name: "ambient_cli",
  label: "Ambient CLI",
  description: "Run Ambient CLI package commands.",
  promptSnippet: "ambient_cli",
  promptGuidelines: [],
  inputSchema: {
    type: "object",
    properties: {
      packageName: { type: "string" },
      command: { type: "string" },
      args: { type: "array" },
    },
    required: ["command"],
    additionalProperties: false,
  },
  source: "first-party",
  sideEffects: "run-process",
  permissionScope: "ambient-cli",
  supportsDryRun: false,
  supportsUndo: false,
  idempotency: "not-supported",
  defaultTimeoutMs: 1_000,
};

afterEach(() => {
  vi.useRealTimers();
});

function manifest(tools: string[]): WorkflowManifest {
  return { tools, mutationPolicy: "read_only" };
}

describe("createWorkflowToolBridge", () => {
  it("binds allowed descriptor-backed tools and records audit events", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const bridge = createWorkflowToolBridge({
      manifest: manifest(["echo"]),
      descriptors: [echoDescriptor],
      handlers: {
        echo: (input) => ({ input, ok: true }),
      },
      eventSink: { append: (event) => void events.push(event) },
    });

    await expect(bridge.echo({ text: "hello", count: 1 })).resolves.toEqual({
      input: { text: "hello", count: 1 },
      ok: true,
    });
    expect(events.map((event) => event.type)).toEqual(["desktop-tool.start", "desktop-tool.end"]);
    expect(events[0]).toMatchObject({
      message: "echo",
      data: { source: "first-party", sideEffects: "none" },
    });
  });

  it("rejects tools outside the workflow manifest", () => {
    const bridge = createWorkflowToolBridge({
      manifest: manifest([]),
      descriptors: [echoDescriptor],
      handlers: { echo: () => undefined },
    });

    expect(() => bridge.echo).toThrow("does not allow tool");
  });

  it("validates required fields, additional properties, and primitive types", async () => {
    const bridge = createWorkflowToolBridge({
      manifest: manifest(["echo"]),
      descriptors: [echoDescriptor],
      handlers: { echo: () => undefined },
    });

    await expect(bridge.echo({})).rejects.toThrow("missing required field: text");
    await expect(bridge.echo({ text: "hello", extra: true })).rejects.toThrow("unexpected field: extra");
    await expect(bridge.echo({ text: "hello", count: "1" })).rejects.toThrow("count must be a number");
  });

  it("records tool failures before rethrowing", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const bridge = createWorkflowToolBridge({
      manifest: manifest(["echo"]),
      descriptors: [echoDescriptor],
      handlers: {
        echo: () => {
          throw new Error("boom");
        },
      },
      eventSink: { append: (event) => void events.push(event) },
    });

    await expect(bridge.echo({ text: "hello" })).rejects.toThrow("boom");
    expect(events.map((event) => event.type)).toEqual(["desktop-tool.start", "desktop-tool.error"]);
    expect(events[1].data?.error).toBe("boom");
  });

  it("records structured Ambient CLI input and output metadata without flooding event summaries", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const bridge = createWorkflowToolBridge({
      manifest: manifest(["ambient_cli"]),
      descriptors: [ambientCliDescriptor],
      handlers: {
        ambient_cli: () => ({
          packageId: "pkg-1",
          packageName: "pi-arxiv",
          commandName: "arxiv_search",
          command: ["node", "dist/index.js", "arxiv_search", "placebo effect"],
          cwd: "/tmp/pi-arxiv",
          durationMs: 42,
          stdout: "full stdout that should not be copied wholesale into the event summary",
          stdoutOutput: {
            text: "short stdout preview",
            truncated: true,
            totalChars: 5000,
            previewChars: 12000,
            artifactPath: ".ambient/tool-outputs/arxiv.txt",
            artifactBytes: 4096,
          },
        }),
      },
      eventSink: { append: (event) => void events.push(event) },
    });

    await bridge.ambient_cli({ packageName: "pi-arxiv", command: "arxiv_search", args: ["placebo effect", "--max-results", "5"] });

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: "desktop-tool.start",
      message: "ambient_cli",
      data: {
        ambientCliInput: {
          packageName: "pi-arxiv",
          command: "arxiv_search",
          args: ["placebo effect", "--max-results", "5"],
        },
      },
    });
    expect(events[1]).toMatchObject({
      type: "desktop-tool.end",
      message: "ambient_cli",
      data: {
        ambientCliInput: {
          packageName: "pi-arxiv",
          command: "arxiv_search",
          args: ["placebo effect", "--max-results", "5"],
        },
        ambientCliOutput: {
          packageId: "pkg-1",
          packageName: "pi-arxiv",
          commandName: "arxiv_search",
          command: ["node", "dist/index.js", "arxiv_search", "placebo effect"],
          cwd: "/tmp/pi-arxiv",
          durationMs: 42,
          stdout: {
            preview: "short stdout preview",
            truncated: true,
            totalChars: 5000,
            previewChars: 12000,
            artifactPath: ".ambient/tool-outputs/arxiv.txt",
            artifactBytes: 4096,
          },
        },
      },
    });
    expect(JSON.stringify(events[1].data)).not.toContain("full stdout that should not be copied wholesale");
  });

  it("enforces descriptor timeouts", async () => {
    vi.useFakeTimers();
    const bridge = createWorkflowToolBridge({
      manifest: manifest(["echo"]),
      descriptors: [{ ...echoDescriptor, defaultTimeoutMs: 5 }],
      handlers: {
        echo: () => new Promise(() => undefined),
      },
    });

    const pending = expect(bridge.echo({ text: "hello" })).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(5);
    await pending;
  });

  it("enforces manifest tool call budget", async () => {
    const bridge = createWorkflowToolBridge({
      manifest: { ...manifest(["echo"]), maxToolCalls: 1 },
      descriptors: [echoDescriptor],
      handlers: { echo: (input) => input },
    });

    await expect(bridge.echo({ text: "first" })).resolves.toEqual({ text: "first" });
    await expect(bridge.echo({ text: "second" })).rejects.toThrow("exceeded max tool calls");
  });

  it("enforces a zero tool call budget", async () => {
    const bridge = createWorkflowToolBridge({
      manifest: { ...manifest(["echo"]), maxToolCalls: 0 },
      descriptors: [echoDescriptor],
      handlers: { echo: (input) => input },
    });

    await expect(bridge.echo({ text: "blocked" })).rejects.toThrow("exceeded max tool calls");
  });

  it("skips non-dry-run-safe tools with deterministic audit output", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const handler = vi.fn();
    const bridge = createWorkflowToolBridge({
      manifest: manifest(["echo"]),
      descriptors: [{ ...echoDescriptor, supportsDryRun: false }],
      handlers: { echo: handler },
      dryRun: true,
      dryRunHandlers: { echo: (input) => ({ skipped: true, input }) },
      eventSink: { append: (event) => void events.push(event) },
    });

    await expect(bridge.echo({ text: "preview" })).resolves.toEqual({ skipped: true, input: { text: "preview" } });
    expect(handler).not.toHaveBeenCalled();
    expect(events).toEqual([
      expect.objectContaining({
        type: "desktop-tool.dry_run",
        message: "echo",
      }),
    ]);
  });
});
