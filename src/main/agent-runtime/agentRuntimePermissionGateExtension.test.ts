import { describe, expect, it, vi } from "vitest";

import type { WorkspaceState } from "../../shared/types";
import { createPermissionGateExtension } from "./agentRuntimePermissionGateExtension";

type ToolCallHandler = (event: any) => Promise<{ block: true; reason: string } | undefined>;

describe("createPermissionGateExtension", () => {
  it("allows tool calls when the permission resolver does not block", async () => {
    const resolver = vi.fn(async () => undefined);
    const pi = fakePi();
    const workspace = testWorkspace();

    createPermissionGateExtension({
      threadId: "thread-1",
      workspace,
      resolveToolCallPermission: resolver,
    })(pi.instance as any);

    await expect(pi.toolCallHandler()({
      toolName: "file_read",
      input: { path: "/workspace/README.md" },
    })).resolves.toBeUndefined();
    expect(resolver).toHaveBeenCalledWith(
      "thread-1",
      workspace,
      "file_read",
      { path: "/workspace/README.md" },
    );
  });

  it("converts blocked permission decisions into Pi tool-call blocks", async () => {
    const resolver = vi.fn(async () => ({ reason: "Blocked by Ambient Desktop permission policy." }));
    const pi = fakePi();

    createPermissionGateExtension({
      threadId: "thread-1",
      workspace: testWorkspace(),
      resolveToolCallPermission: resolver,
    })(pi.instance as any);

    await expect(pi.toolCallHandler()({
      toolName: "bash",
      input: { command: "touch output.txt" },
    })).resolves.toEqual({
      block: true,
      reason: "Blocked by Ambient Desktop permission policy.",
    });
  });
});

function fakePi() {
  let toolCallHandler: ToolCallHandler | undefined;
  return {
    instance: {
      on: (eventName: string, handler: ToolCallHandler) => {
        if (eventName === "tool_call") toolCallHandler = handler;
      },
    },
    toolCallHandler: () => {
      expect(toolCallHandler).toBeDefined();
      return toolCallHandler!;
    },
  };
}

function testWorkspace(): WorkspaceState {
  return {
    path: "/workspace",
    name: "workspace",
    statePath: "/workspace/.ambient",
    sessionPath: "/workspace/.ambient/session",
  };
}
