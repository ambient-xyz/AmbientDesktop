import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveDefaultWorkspacePath, selectStartupWorkspacePath } from "./workspaceDefaults";

describe("default workspace path", () => {
  it("honors an explicit workspace even when the directory does not exist yet", () => {
    expect(
      resolveDefaultWorkspacePath({
        explicitWorkspace: "/tmp/new-ambient-workspace",
        cwd: "/",
        isPackaged: true,
        userDataPath: "/tmp/user-data",
      }),
    ).toBe("/tmp/new-ambient-workspace");
  });

  it("uses Electron user data for packaged first launch instead of cwd", () => {
    expect(
      resolveDefaultWorkspacePath({
        cwd: "/",
        isPackaged: true,
        userDataPath: "/Users/neo/Library/Application Support/Ambient Desktop",
      }),
    ).toBe(join("/Users/neo/Library/Application Support/Ambient Desktop", "workspace"));
  });

  it("keeps cwd as the development default", () => {
    expect(
      resolveDefaultWorkspacePath({
        cwd: "/Users/neo/ambient-desktop",
        isPackaged: false,
        userDataPath: "/tmp/user-data",
      }),
    ).toBe("/Users/neo/ambient-desktop");
  });

  it("starts packaged launches on the most recently registered workspace", () => {
    expect(
      selectStartupWorkspacePath({
        cwd: "/",
        isPackaged: true,
        userDataPath: "/Users/neo/Library/Application Support/Ambient Desktop",
        registeredWorkspacePaths: ["/Users/neo/project-a", "/Users/neo/project-b"],
      }),
    ).toBe("/Users/neo/project-a");
  });

  it("skips an empty packaged default workspace when a migrated workspace exists", () => {
    const userDataPath = "/Users/neo/Library/Application Support/Ambient Desktop";
    const packagedDefault = join(userDataPath, "workspace");
    expect(
      selectStartupWorkspacePath({
        cwd: "/",
        isPackaged: true,
        userDataPath,
        registeredWorkspacePaths: [packagedDefault, "/Users/neo/Library/Application Support/ambient-codex-desktop/workspace"],
        hasRestorableWorkspaceState: (workspacePath) => workspacePath !== packagedDefault,
      }),
    ).toBe("/Users/neo/Library/Application Support/ambient-codex-desktop/workspace");
  });

  it("keeps the packaged default workspace when it has restorable state", () => {
    const userDataPath = "/Users/neo/Library/Application Support/Ambient Desktop";
    const packagedDefault = join(userDataPath, "workspace");
    expect(
      selectStartupWorkspacePath({
        cwd: "/",
        isPackaged: true,
        userDataPath,
        registeredWorkspacePaths: [packagedDefault, "/Users/neo/project"],
        hasRestorableWorkspaceState: () => true,
      }),
    ).toBe(packagedDefault);
  });
});
