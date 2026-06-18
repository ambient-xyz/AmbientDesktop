import { describe, expect, it } from "vitest";

import type { WorkspaceState } from "../../../shared/workspaceTypes";
import {
  ambientCliEnvBindApprovalDetail,
  ambientCliEnvBindGrantIdentity,
  ambientCliEnvBindInput,
  ambientCliEnvBindingSavedText,
  ambientCliSecretRequestInput,
  ambientCliSecretRequestText,
} from "./agentRuntimeAmbientCliPackageEnvModel";

describe("agentRuntimeAmbientCliPackageEnvModel", () => {
  it("parses env bind and secret request inputs", () => {
    expect(ambientCliEnvBindInput({
      packageName: "ambient-demo",
      envName: "DEMO_KEY",
      filePath: "/workspace/.secrets/demo-key.txt",
    })).toEqual({
      packageName: "ambient-demo",
      envName: "DEMO_KEY",
      filePath: "/workspace/.secrets/demo-key.txt",
    });

    expect(ambientCliEnvBindInput({
      packageId: "pkg-123",
      packageName: "",
      envName: "DEMO_KEY",
      filePath: "/workspace/.secrets/demo-key.txt",
    })).toEqual({
      packageId: "pkg-123",
      envName: "DEMO_KEY",
      filePath: "/workspace/.secrets/demo-key.txt",
    });

    expect(ambientCliSecretRequestInput({
      packageName: "ambient-demo",
      envName: "DEMO_KEY",
    })).toEqual({
      packageName: "ambient-demo",
      envName: "DEMO_KEY",
    });

    expect(() => ambientCliEnvBindInput({ packageName: "ambient-demo", envName: "DEMO_KEY", filePath: " " })).toThrow(
      "filePath is required.",
    );
    expect(() => ambientCliSecretRequestInput({ packageName: "ambient-demo", envName: " " })).toThrow("envName is required.");
  });

  it("builds env binding approval detail and grant identity", () => {
    const pkg = packageFixture();

    expect(ambientCliEnvBindApprovalDetail({
      workspace: workspaceFixture(),
      pkg,
      envName: "DEMO_KEY",
      filePath: "/workspace/.secrets/demo-key.txt",
    })).toBe([
      "Workspace: /workspace",
      "Package: ambient-demo",
      "Package id: pkg-123",
      "Env name: DEMO_KEY",
      "Secret file: /workspace/.secrets/demo-key.txt",
      "Secret value: not read into the transcript.",
    ].join("\n"));

    expect(ambientCliEnvBindGrantIdentity({
      pkg,
      envName: "DEMO_KEY",
      filePath: "/workspace/.secrets/demo-key.txt",
    })).toBe("ambient_cli_env_bind\0pkg-123\0DEMO_KEY\0/workspace/.secrets/demo-key.txt");
  });

  it("formats env binding saved and secret request text without secret values", () => {
    const pkg = packageFixture();
    expect(ambientCliEnvBindingSavedText({
      pkg,
      status: {
        name: "DEMO_KEY",
        required: true,
        configured: true,
        source: "file",
        filePath: "/workspace/.secrets/demo-key.txt",
      },
    })).toBe([
      "Ambient CLI env binding saved",
      "Package: ambient-demo",
      "Env name: DEMO_KEY",
      "Source: file",
      "File: /workspace/.secrets/demo-key.txt",
      "Secret value: not printed",
    ].join("\n"));

    expect(ambientCliSecretRequestText({
      pkg,
      envName: "DEMO_KEY",
    })).toBe([
      "Ambient CLI secret dialog requested",
      "Package: ambient-demo",
      "Env name: DEMO_KEY",
      "Secret value: never exposed to Pi",
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
    commands: [],
    envRequirements: [
      {
        name: "DEMO_KEY",
        required: true,
      },
    ],
    errors: [],
  };
}
