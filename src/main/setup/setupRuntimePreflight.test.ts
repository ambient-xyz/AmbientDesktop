import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  runSetupRuntimePreflight,
  setupRuntimePreflightText,
  type SetupRuntimeCommandInput,
  type SetupRuntimeCommandResult,
} from "./setupRuntimePreflight";

describe("setup runtime preflight", () => {
  it("selects the declared package manager and reports native dependency signals", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-runtime-preflight-"));
    await writeFile(join(workspace, "package.json"), JSON.stringify({
      packageManager: "pnpm@10.0.0",
      dependencies: {
        esbuild: "^0.25.0",
      },
      scripts: {
        postinstall: "electron-rebuild -f",
      },
    }));
    await writeFile(join(workspace, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    await writeFile(join(workspace, ".env"), "SECRET_VALUE=do-not-print\n");

    const result = await runSetupRuntimePreflight({
      workspacePath: workspace,
    }, {
      commandRunner: fakeRunner({
        machineArch: "arm64",
        nodeArch: "arm64",
        packageManagers: {
          pnpm: {
            path: "/opt/homebrew/bin/pnpm",
            version: "10.0.0",
            file: "POSIX shell script text executable",
          },
        },
      }),
    });

    expect(result.packageMetadata.packageManager).toBe("pnpm@10.0.0");
    expect(result.packageMetadata.lockfiles).toEqual(["pnpm-lock.yaml"]);
    expect(result.selectedPackageManager).toMatchObject({
      name: "pnpm",
      available: true,
      path: "/opt/homebrew/bin/pnpm",
      binaryKind: "script-or-shim",
    });
    expect(result.packageMetadata.nativeDependencySignals).toEqual(["esbuild"]);
    expect(result.packageMetadata.nativeScriptSignals).toEqual(["postinstall"]);

    const text = setupRuntimePreflightText(result);
    expect(text).toContain("Selected package manager: pnpm");
    expect(text).toContain("Native dependency signals: esbuild, script:postinstall");
    expect(text).not.toContain("SECRET_VALUE");
    expect(text).not.toContain("do-not-print");
  });

  it("warns before native installs when runtime architectures are mixed", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-runtime-preflight-"));
    await writeFile(join(workspace, "package.json"), JSON.stringify({
      packageManager: "npm@11.0.0",
      optionalDependencies: {
        sharp: "^0.34.0",
      },
    }));
    await writeFile(join(workspace, "package-lock.json"), "{}\n");

    const result = await runSetupRuntimePreflight({
      workspacePath: workspace,
      packageManager: "npm",
    }, {
      commandRunner: fakeRunner({
        machineArch: "arm64",
        nodeArch: "x64",
        packageManagers: {
          npm: {
            path: "/usr/local/bin/npm",
            version: "11.0.0",
            file: "Mach-O 64-bit executable x86_64",
          },
        },
      }),
    });

    expect(result.projectNode).toMatchObject({ available: true, arch: "x64" });
    expect(result.selectedPackageManager).toMatchObject({ name: "npm", architecture: "x64" });
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "mixed-architecture",
        severity: "blocker",
      }),
      expect.objectContaining({
        code: "native-dependencies",
      }),
    ]));
    expect(setupRuntimePreflightText(result)).toContain("do not install native dependencies");
  });

  it("flags conflicting package-manager lockfile families", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-runtime-preflight-"));
    await writeFile(join(workspace, "package.json"), JSON.stringify({
      dependencies: {},
    }));
    await writeFile(join(workspace, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    await writeFile(join(workspace, "yarn.lock"), "# yarn lock\n");

    const result = await runSetupRuntimePreflight({
      workspacePath: workspace,
    }, {
      commandRunner: fakeRunner({
        machineArch: "arm64",
        nodeArch: "arm64",
        packageManagers: {},
      }),
    });

    expect(result.packageMetadata.lockfiles.sort()).toEqual(["pnpm-lock.yaml", "yarn.lock"]);
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "multiple-lockfiles",
        severity: "warning",
      }),
    ]));
  });
});

function fakeRunner(input: {
  machineArch: string;
  nodeArch: string;
  packageManagers: Partial<Record<"npm" | "pnpm" | "yarn" | "bun", { path: string; version: string; file: string }>>;
}) {
  return async (command: SetupRuntimeCommandInput): Promise<SetupRuntimeCommandResult> => {
    if (command.command === "uname") return ok(input.machineArch);
    if (command.command === "node") {
      return ok(JSON.stringify({
        platform: "darwin",
        arch: input.nodeArch,
        execPath: `/opt/${input.nodeArch}/bin/node`,
        version: "v24.0.0",
        modules: "137",
      }));
    }
    const packageManager = packageManagerFromPathLookup(command) ?? packageManagerFromCommand(command.command);
    if (packageManager && command.args.includes("--version")) {
      const probe = input.packageManagers[packageManager];
      return probe ? ok(probe.version) : fail(`${packageManager} not found`);
    }
    if (packageManager) {
      const probe = input.packageManagers[packageManager];
      return probe ? ok(probe.path) : fail(`${packageManager} not found`);
    }
    if (command.command === "file") {
      const path = command.args[1];
      const probe = Object.values(input.packageManagers).find((entry) => entry?.path === path);
      return probe ? ok(probe.file) : fail("file target not found");
    }
    return fail(`unexpected command ${command.command} ${command.args.join(" ")}`);
  };
}

function packageManagerFromPathLookup(command: SetupRuntimeCommandInput): "npm" | "pnpm" | "yarn" | "bun" | undefined {
  const joined = command.args.join(" ");
  if (joined.includes("command -v pnpm") || joined.includes("where pnpm")) return "pnpm";
  if (joined.includes("command -v npm") || joined.includes("where npm")) return "npm";
  if (joined.includes("command -v yarn") || joined.includes("where yarn")) return "yarn";
  if (joined.includes("command -v bun") || joined.includes("where bun")) return "bun";
  return undefined;
}

function packageManagerFromCommand(command: string): "npm" | "pnpm" | "yarn" | "bun" | undefined {
  if (command === "npm" || command === "pnpm" || command === "yarn" || command === "bun") return command;
  return undefined;
}

function ok(stdout: string): SetupRuntimeCommandResult {
  return { ok: true, stdout, exitCode: 0 };
}

function fail(stderr: string): SetupRuntimeCommandResult {
  return { ok: false, stdout: "", stderr, exitCode: 127 };
}
