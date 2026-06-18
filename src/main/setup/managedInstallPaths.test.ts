import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MANAGED_INSTALL_ROOT_ENV, migrateWorkspaceManagedInstallPath } from "./managedInstallPaths";

describe("managed install path migration", () => {
  it("merges legacy workspace managed state into an existing app-level directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-managed-install-migration-"));
    const workspace = join(root, "workspace");
    const appRoot = join(root, "app");
    const previousRoot = process.env[MANAGED_INSTALL_ROOT_ENV];
    process.env[MANAGED_INSTALL_ROOT_ENV] = appRoot;
    try {
      await mkdir(join(workspace, ".ambient", "cli-packages", "imported", "legacy"), { recursive: true });
      await writeFile(join(workspace, ".ambient", "cli-packages", "packages.json"), '{"packages":[{"source":"./.ambient/cli-packages/imported/legacy"}]}\n', "utf8");
      await writeFile(join(workspace, ".ambient", "cli-packages", "imported", "legacy", "ambient-cli.json"), '{"name":"legacy"}\n', "utf8");

      await mkdir(join(appRoot, ".ambient", "cli-packages", "imported", "existing"), { recursive: true });
      await writeFile(join(appRoot, ".ambient", "cli-packages", "imported", "existing", "ambient-cli.json"), '{"name":"existing"}\n', "utf8");

      await migrateWorkspaceManagedInstallPath(workspace, ".ambient/cli-packages");
      await migrateWorkspaceManagedInstallPath(workspace, ".ambient/cli-packages");

      await expect(readFile(join(appRoot, ".ambient", "cli-packages", "packages.json"), "utf8")).resolves.toContain("legacy");
      await expect(readFile(join(appRoot, ".ambient", "cli-packages", "imported", "legacy", "ambient-cli.json"), "utf8")).resolves.toContain("legacy");
      await expect(readFile(join(appRoot, ".ambient", "cli-packages", "imported", "existing", "ambient-cli.json"), "utf8")).resolves.toContain("existing");
    } finally {
      restoreManagedInstallRoot(previousRoot);
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps app-level files when legacy workspace files already exist at the same destination", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-managed-install-app-wins-"));
    const workspace = join(root, "workspace");
    const appRoot = join(root, "app");
    const previousRoot = process.env[MANAGED_INSTALL_ROOT_ENV];
    process.env[MANAGED_INSTALL_ROOT_ENV] = appRoot;
    try {
      await mkdir(join(workspace, ".ambient", "cli-packages"), { recursive: true });
      await writeFile(join(workspace, ".ambient", "cli-packages", "packages.json"), "legacy\n", "utf8");
      await mkdir(join(appRoot, ".ambient", "cli-packages"), { recursive: true });
      await writeFile(join(appRoot, ".ambient", "cli-packages", "packages.json"), "app\n", "utf8");

      await migrateWorkspaceManagedInstallPath(workspace, ".ambient/cli-packages");

      await expect(readFile(join(appRoot, ".ambient", "cli-packages", "packages.json"), "utf8")).resolves.toBe("app\n");
    } finally {
      restoreManagedInstallRoot(previousRoot);
      await rm(root, { recursive: true, force: true });
    }
  });

  it("skips VCS internals when migrating imported packages", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-managed-install-skip-vcs-"));
    const workspace = join(root, "workspace");
    const appRoot = join(root, "app");
    const previousRoot = process.env[MANAGED_INSTALL_ROOT_ENV];
    process.env[MANAGED_INSTALL_ROOT_ENV] = appRoot;
    try {
      await mkdir(join(workspace, ".ambient", "cli-packages", "imported", "pkg", ".git", "objects"), { recursive: true });
      await writeFile(join(workspace, ".ambient", "cli-packages", "imported", "pkg", "ambient-cli.json"), '{"name":"pkg"}\n', "utf8");
      await writeFile(join(workspace, ".ambient", "cli-packages", "imported", "pkg", ".git", "objects", "secret"), "object\n", "utf8");

      await migrateWorkspaceManagedInstallPath(workspace, ".ambient/cli-packages");

      await expect(readFile(join(appRoot, ".ambient", "cli-packages", "imported", "pkg", "ambient-cli.json"), "utf8")).resolves.toContain("pkg");
      await expect(readFile(join(appRoot, ".ambient", "cli-packages", "imported", "pkg", ".git", "objects", "secret"), "utf8")).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      restoreManagedInstallRoot(previousRoot);
      await rm(root, { recursive: true, force: true });
    }
  });
});

function restoreManagedInstallRoot(previousRoot: string | undefined): void {
  if (previousRoot === undefined) delete process.env[MANAGED_INSTALL_ROOT_ENV];
  else process.env[MANAGED_INSTALL_ROOT_ENV] = previousRoot;
}
