import { describe, expect, it } from "vitest";

import type { WorkspaceState } from "../../../shared/types";
import {
  ambientCliPreflightDescribeText,
  ambientCliRunApprovalDetail,
  ambientCliRunGrantIdentity,
  ambientCliRunInput,
  ambientCliRunText,
} from "./agentRuntimeAmbientCliPackageRunModel";

describe("agentRuntimeAmbientCliPackageRunModel", () => {
  it("parses Ambient CLI run input", () => {
    expect(ambientCliRunInput({
      packageId: "pkg-123",
      packageName: "",
      command: "demo",
      args: [],
      cwd: "subdir",
    })).toEqual({
      packageId: "pkg-123",
      command: "demo",
      args: [],
      cwd: "subdir",
    });

    expect(ambientCliRunInput({
      packageName: "ambient-demo",
      command: "demo",
      args: ["input"],
      cwd: "",
    })).toEqual({
      packageName: "ambient-demo",
      command: "demo",
      args: ["input"],
    });

    expect(() => ambientCliRunInput({ packageName: "ambient-demo", command: " " })).toThrow("command is required.");
    expect(() => ambientCliRunInput({ packageName: "ambient-demo", command: "demo", args: "input" })).toThrow(
      "Expected an array of strings.",
    );
    expect(() => ambientCliRunInput({ packageName: "ambient-demo", command: "demo", args: [1] })).toThrow(
      "Expected an array of strings.",
    );
  });

  it("builds approval detail and grant identity for an Ambient CLI command", () => {
    const pkg = packageFixture();
    const command = pkg.commands[0];

    expect(ambientCliRunApprovalDetail({
      workspace: workspaceFixture(),
      pkg,
      commandName: "demo",
      args: ["input"],
      cwd: "subdir",
    })).toBe([
      "Workspace: /workspace",
      "Package: ambient-demo",
      "Package id: pkg-123",
      "Package root: /workspace/.ambient/cli-packages/ambient-demo",
      "Command name: demo",
      "Executable: node",
      "Descriptor args: demo.js",
      "Call args: input",
      "Cwd policy: workspace",
      "Requested cwd: subdir",
      "Env requirements: DEMO_KEY",
    ].join("\n"));

    expect(ambientCliRunGrantIdentity({
      pkg,
      commandName: "demo",
      registeredCommand: command,
      cwd: "subdir",
    })).toBe("ambient_cli\0pkg-123\0demo\0node\0demo.js\0workspace\0subdir");
  });

  it("formats Ambient CLI run output with empty stdout fallback", () => {
    expect(ambientCliRunText({
      packageId: "pkg-123",
      packageName: "ambient-demo",
      commandName: "demo",
      command: ["node", "demo.js"],
      cwd: "/workspace",
      durationMs: 42,
      stdout: "",
      stderr: "warn",
    } as any)).toBe([
      "Ambient CLI completed",
      "Package: ambient-demo",
      "Command: demo",
      "Cwd: /workspace",
      "Duration: 42ms",
      "Stdout: <empty>",
      "Stderr:\nwarn",
    ].join("\n"));
  });

  it("wraps package descriptions as execution preflight text", () => {
    expect(ambientCliPreflightDescribeText(descriptionFixture())).toBe([
      "Ambient CLI preflight description",
      "Execution not run: this package had not been described yet in this thread.",
      "Ambient CLI capability description",
      "Package: ambient-demo",
      "Package id: pkg-123",
      "Description: Generated demo package.",
      "Availability: available - ready",
      "Env: DEMO_KEY=missing",
      "Commands: demo",
      "Command: demo",
      "Capability id: pkg-123:command:demo",
      "Description: Run demo.",
      "Descriptor command: node demo.js",
      "Cwd policy: workspace",
      "Health: passed",
      "Risk: ",
      "Invocation: ambient_cli packageName=\"ambient-demo\" command=\"demo\" args=[...]",
      "Guidance:",
      "- Describe before running.",
      "",
      "Next: if this command is still appropriate, retry ambient_cli with the same packageName, command, and args to execute it.",
    ].join("\n"));
  });
});

function workspaceFixture(): WorkspaceState {
  return {
    path: "/workspace",
    name: "Workspace",
    statePath: "/workspace/.ambient",
    sessionPath: "/workspace/.ambient/sessions",
  };
}

function packageFixture(): any {
  return {
    id: "pkg-123",
    name: "ambient-demo",
    rootPath: "/workspace/.ambient/cli-packages/ambient-demo",
    source: "local",
    installed: true,
    skills: [],
    commands: [
      {
        name: "demo",
        description: "Run demo.",
        command: "node",
        args: ["demo.js"],
        cwd: "workspace",
      },
    ],
    envRequirements: [
      {
        name: "DEMO_KEY",
        required: true,
      },
    ],
    errors: [],
  };
}

function descriptionFixture(): any {
  return {
    package: {
      id: "pkg-123",
      name: "ambient-demo",
      version: "0.0.0",
      description: "Generated demo package.",
      source: "local",
      installed: true,
      availability: "available",
      availabilityReason: "ready",
    },
    commands: [
      {
        capabilityId: "pkg-123:command:demo",
        sourceKind: "ambient-cli",
        name: "demo",
        description: "Run demo.",
        command: "node",
        descriptorArgs: ["demo.js"],
        cwd: "workspace",
        health: "passed",
        risk: [],
        invocation: {
          tool: "ambient_cli",
          packageName: "ambient-demo",
          command: "demo",
          args: [],
        },
      },
    ],
    skills: [],
    env: [
      {
        name: "DEMO_KEY",
        required: true,
        configured: false,
      },
    ],
    guidance: ["Describe before running."],
    diagnostics: [],
  };
}
