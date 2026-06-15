import { describe, expect, it, vi } from "vitest";

import type { ThreadSummary, WorkspaceState } from "../shared/types";
import { registerCapabilityBuilderValidateTool } from "./agentRuntimeCapabilityBuilderValidateTools";
import type { CapabilityBuilderValidateInput } from "./capabilityBuilder";

describe("agentRuntimeCapabilityBuilderValidateTools", () => {
  it("runs validation through the permission helper and returns validation metadata", async () => {
    const workspace = { path: "/workspace" } as WorkspaceState;
    const thread = { id: "thread-1", collaborationMode: "default" } as unknown as ThreadSummary;
    const input = inputFixture();
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const parseValidateInput = vi.fn(() => input);
    const runCapabilityBuilderValidationWithPermission = vi.fn(async () => validateResultFixture());
    const capabilityBuilderValidateText = vi.fn(() => "Ambient Capability Builder validation.");
    const onUpdate = vi.fn();

    registerCapabilityBuilderValidateTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace,
      getThread: () => thread,
      parseValidateInput,
      runCapabilityBuilderValidationWithPermission,
      capabilityBuilderValidateText,
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual(["ambient_capability_builder_validate"]);

    const result = await registeredTools[0].execute("validate", input, undefined, onUpdate);

    expect(parseValidateInput).toHaveBeenCalledWith(input);
    expect(runCapabilityBuilderValidationWithPermission).toHaveBeenCalledWith({
      thread,
      workspace,
      input,
      onUpdate,
    });
    expect(capabilityBuilderValidateText).toHaveBeenCalledWith(validateResultFixture());
    expect(result.content).toEqual([{ type: "text", text: "Ambient Capability Builder validation." }]);
    expect(result.details).toMatchObject({
      runtime: "ambient-capability-builder",
      toolName: "ambient_capability_builder_validate",
      status: "succeeded",
      packageName: "ambient-demo",
      rootPath: "/workspace/.ambient/capability-builder/packages/ambient-demo",
      relativeRootPath: ".ambient/capability-builder/packages/ambient-demo",
      gitSha: "abc123",
      validatedAt: "2026-06-10T14:00:00.000Z",
      logPath: "/workspace/.ambient/capability-builder/packages/ambient-demo/capability-validation-log.jsonl",
      relativeLogPath: ".ambient/capability-builder/packages/ambient-demo/capability-validation-log.jsonl",
      commandCount: 2,
      artifactCount: 1,
      durationMs: 450,
      commandDurationsMs: [150, 300],
      startedAt: "2026-06-10T13:59:59.550Z",
      completedAt: "2026-06-10T14:00:00.000Z",
    });
  });

  it("reports failed validation status without hiding command metadata", async () => {
    const workspace = { path: "/workspace" } as WorkspaceState;
    const input = inputFixture();
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];

    registerCapabilityBuilderValidateTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace,
      getThread: () => ({ id: "thread-1", collaborationMode: "default" } as unknown as ThreadSummary),
      parseValidateInput: vi.fn(() => input),
      runCapabilityBuilderValidationWithPermission: vi.fn(async () => ({
        ...validateResultFixture(),
        succeeded: false,
        validatedAt: undefined,
      })),
      capabilityBuilderValidateText: vi.fn(() => "Validation failed."),
    });

    const result = await registeredTools[0].execute("validate", input);

    expect(result.details).toMatchObject({
      status: "failed",
      commandCount: 2,
      artifactCount: 1,
      durationMs: 450,
    });
  });

  it("blocks validation in Planner Mode before parsing or side effects", async () => {
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const parseValidateInput = vi.fn();
    const runCapabilityBuilderValidationWithPermission = vi.fn();

    registerCapabilityBuilderValidateTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" } as WorkspaceState,
      getThread: () => ({ id: "thread-1", collaborationMode: "planner" } as unknown as ThreadSummary),
      parseValidateInput,
      runCapabilityBuilderValidationWithPermission,
    });

    await expect(registeredTools[0].execute("validate", inputFixture())).rejects.toThrow(
      "Capability Builder validation is blocked in Planner Mode.",
    );
    expect(parseValidateInput).not.toHaveBeenCalled();
    expect(runCapabilityBuilderValidationWithPermission).not.toHaveBeenCalled();
  });
});

function inputFixture(): CapabilityBuilderValidateInput {
  return {
    sourcePath: ".ambient/capability-builder/packages/ambient-demo",
    includeSmokeTests: true,
  };
}

function validateResultFixture(): any {
  return {
    packageName: "ambient-demo",
    rootPath: "/workspace/.ambient/capability-builder/packages/ambient-demo",
    relativeRootPath: ".ambient/capability-builder/packages/ambient-demo",
    gitSha: "abc123",
    succeeded: true,
    validatedAt: "2026-06-10T14:00:00.000Z",
    startedAt: "2026-06-10T13:59:59.550Z",
    completedAt: "2026-06-10T14:00:00.000Z",
    durationMs: 450,
    logPath: "/workspace/.ambient/capability-builder/packages/ambient-demo/capability-validation-log.jsonl",
    relativeLogPath: ".ambient/capability-builder/packages/ambient-demo/capability-validation-log.jsonl",
    envRequirements: [],
    networkHosts: [],
    commands: [
      {
        command: "node",
        args: ["scripts/health.js"],
        cwd: ".",
        rationale: "Run descriptor health check.",
        source: "healthCheck",
        status: "succeeded",
        durationMs: 150,
        exitCode: 0,
        stdoutPreview: "ok",
        stderrPreview: "",
        stdoutLength: 2,
        stderrLength: 0,
        stdoutTruncated: false,
        stderrTruncated: false,
      },
      {
        command: "node",
        args: ["scripts/smoke.js"],
        cwd: ".",
        rationale: "Run smoke test.",
        source: "smokeTest",
        commandName: "demo",
        status: "succeeded",
        durationMs: 300,
        exitCode: 0,
        stdoutPreview: "ok",
        stderrPreview: "",
        stdoutLength: 2,
        stderrLength: 0,
        stdoutTruncated: false,
        stderrTruncated: false,
      },
    ],
    artifacts: [
      {
        path: "artifacts/demo.txt",
        sizeBytes: 12,
      },
    ],
  };
}
