import { describe, expect, it } from "vitest";

import type { PrivilegedActionAdapterStatus } from "../../../shared/permissionTypes";
import { registerPrivilegedActionStatusTools } from "./agentRuntimePrivilegedActionStatusTools";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<any> };

describe("registerPrivilegedActionStatusTools", () => {
  it("registers and executes the privileged action status tool", async () => {
    const registeredTools: RegisteredTool[] = [];
    const adapterStatus = privilegedStatus();
    const statusCalls: string[] = [];

    registerPrivilegedActionStatusTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      adapterStatus: () => {
        statusCalls.push("called");
        return adapterStatus;
      },
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual(["ambient_privileged_action_status"]);
    const tool = registeredTools[0]!;
    expect(tool.executionMode).toBe("sequential");

    const result = await tool.execute("privileged-status", {});

    expect(statusCalls).toEqual(["called"]);
    expect(result.content[0].text).toContain("Ambient privileged action adapter status");
    expect(result.content[0].text).toContain("Selected adapter: dry-run");
    expect(result.details).toMatchObject({
      runtime: "privileged-action",
      toolName: "ambient_privileged_action_status",
      status: "complete",
      adapterStatus,
    });
  });
});

function privilegedStatus(): PrivilegedActionAdapterStatus {
  return {
    schemaVersion: "ambient-privileged-action-v1",
    execution: "dry-run-only",
    adapterStatus: "not-implemented",
    selectedAdapter: "dry-run",
    selectedAdapterExecutesPrivilegedCommands: false,
    policyPlanning: "available",
    credentialCapture: "rehearsal-available",
    supportedPurposes: ["install_system_package"],
    policyHints: [
      {
        adapter: "dry-run",
        platform: "darwin",
        purpose: "install_system_package",
        executionMode: "dry-run-only",
        allowedByPolicy: true,
        commandPattern: "brew install <package>",
        sourcePolicy: "package-manager",
        targetPolicy: "system",
        notes: "Dry-run only.",
      },
    ],
    adapters: [
      {
        name: "dry-run",
        available: true,
        executesPrivilegedCommands: false,
        notes: "Records redacted privileged action handoffs.",
      },
    ],
    guidance: ["Use ambient_privileged_action_request for typed handoffs."],
  };
}
