import { describe, expect, it } from "vitest";

import type { WorkspaceState } from "../../../shared/workspaceTypes";
import {
  ambientCliPackageUninstallApprovalDetail,
  ambientCliPackageUninstallGrantIdentity,
  ambientCliPackageUninstallParams,
  ambientCliPackageUninstallingUpdate,
  ambientCliPackageUninstallResult,
  ambientCliPackageUninstallText,
} from "./agentRuntimeAmbientCliPackageUninstallModel";

describe("agentRuntimeAmbientCliPackageUninstallModel", () => {
  it("parses package uninstall params", () => {
    expect(ambientCliPackageUninstallParams({
      packageId: "pkg-123",
      packageName: "ambient-demo",
    })).toEqual({
      packageId: "pkg-123",
      packageName: "ambient-demo",
    });

    expect(ambientCliPackageUninstallParams({
      packageId: " ",
      packageName: 42,
    })).toEqual({
      packageId: undefined,
      packageName: undefined,
    });
  });

  it("builds approval detail and grant identity for package uninstall", () => {
    const pkg = packageFixture();

    expect(ambientCliPackageUninstallApprovalDetail({
      workspace: workspaceFixture(),
      pkg,
    })).toBe([
      "Workspace: /workspace",
      "Package: ambient-demo",
      "Package id: pkg-123",
      "Package root: /workspace/.ambient/cli-packages/ambient-demo",
    ].join("\n"));

    expect(ambientCliPackageUninstallGrantIdentity(pkg)).toBe("ambient_cli_package_uninstall\0pkg-123");
  });

  it("formats package uninstall result text", () => {
    expect(ambientCliPackageUninstallText(packageFixture())).toBe([
      "Ambient CLI package uninstalled",
      "Package: ambient-demo",
      "Package id: pkg-123",
      "Declared commands and searchable package instructions are no longer available.",
    ].join("\n"));
  });

  it("builds package uninstall progress and result payloads", () => {
    expect(ambientCliPackageUninstallingUpdate(packageFixture())).toEqual({
      content: [{ type: "text", text: "Uninstalling Ambient CLI package \"ambient-demo\"." }],
      details: {
        runtime: "ambient-cli",
        toolName: "ambient_cli_package_uninstall",
        packageId: "pkg-123",
        packageName: "ambient-demo",
        status: "uninstalling",
      },
    });

    expect(ambientCliPackageUninstallResult(packageFixture())).toEqual({
      content: [{
        type: "text",
        text: [
          "Ambient CLI package uninstalled",
          "Package: ambient-demo",
          "Package id: pkg-123",
          "Declared commands and searchable package instructions are no longer available.",
        ].join("\n"),
      }],
      details: {
        runtime: "ambient-cli",
        toolName: "ambient_cli_package_uninstall",
        packageId: "pkg-123",
        packageName: "ambient-demo",
        availability: "next-session-refresh",
      },
    });
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
    commands: [],
    envRequirements: [],
    errors: [],
  };
}
