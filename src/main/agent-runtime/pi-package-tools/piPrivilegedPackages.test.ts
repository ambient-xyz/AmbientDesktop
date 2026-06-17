import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  clearPiPrivilegedPackageHistory,
  disablePiPrivilegedPackage,
  discoverPiPrivilegedPackages,
  installPiPrivilegedPackage,
  scanPiPrivilegedPackage,
  uninstallPiPrivilegedPackage,
} from "./piPrivilegedPackages";

const itLivePrivileged = process.env.AMBIENT_PI_PRIVILEGED_LIVE === "1" ? it : it.skip;

describe("Pi privileged package management", () => {
  it("scans, installs disabled, disables, and uninstalls a privileged local package from a manifest", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-privileged-workspace-"));
    const source = await mkdtemp(join(tmpdir(), "ambient-pi-privileged-source-"));
    try {
      await seedPrivilegedFixture(source);

      const scan = await scanPiPrivilegedPackage({ source });
      expect(scan).toMatchObject({
        packageName: "context-mode-like",
        recommendation: "privileged-review-required",
        riskSummary: expect.objectContaining({
          lifecycleHooks: true,
          commands: true,
          mcpServers: true,
          hostConfigMutation: true,
          filesystemWrites: true,
          homeDirectoryAccess: true,
          processExecution: true,
          nativeDependencies: true,
        }),
      });
      expect(scan.findings.map((finding) => finding.category)).toEqual(expect.arrayContaining(["lifecycle-hooks", "commands", "mcp", "host-config"]));

      const installed = await installPiPrivilegedPackage(workspace, { source });
      expect(installed).toMatchObject({
        packageName: "context-mode-like",
        status: "disabled",
      });
      await expect(readFile(join(workspace, ".ambient", "pi-privileged-installs", "packages.json"), "utf8")).resolves.toContain("context-mode-like");

      const catalog = await discoverPiPrivilegedPackages(workspace);
      expect(catalog.packages).toHaveLength(1);
      expect(catalog.packages[0]).toMatchObject({ id: installed.id, status: "disabled" });

      const disabled = await disablePiPrivilegedPackage(workspace, { packageName: "context-mode-like" });
      expect(disabled).toMatchObject({ id: installed.id, status: "disabled" });

      const uninstalled = await uninstallPiPrivilegedPackage(workspace, { packageName: "context-mode-like", deleteData: true });
      expect(uninstalled.removed.id).toBe(installed.id);
      expect(uninstalled.catalog.packages).toEqual([]);
      expect(uninstalled.catalog.history[0]).toMatchObject({
        id: installed.id,
        packageName: "context-mode-like",
        scan: expect.objectContaining({ packageName: "context-mode-like" }),
      });
      expect(uninstalled.manualCleanup.join("\n")).toContain("No privileged runtime activation");
      const cleared = await clearPiPrivilegedPackageHistory(workspace);
      expect(cleared).toMatchObject({ packages: [], history: [], errors: [] });
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(source, { recursive: true, force: true });
    }
  });

  it("persists sandbox fallback provenance through scan and disabled install", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-privileged-origin-workspace-"));
    const source = await mkdtemp(join(tmpdir(), "ambient-pi-privileged-origin-source-"));
    try {
      await seedPrivilegedFixture(source);
      const scan = await scanPiPrivilegedPackage({ source, scanOrigin: "sandbox-fallback" });
      expect(scan.scanOrigin).toBe("sandbox-fallback");
      const installed = await installPiPrivilegedPackage(workspace, { source, scanOrigin: "sandbox-fallback" });
      expect(installed.scan.scanOrigin).toBe("sandbox-fallback");
      const catalog = await discoverPiPrivilegedPackages(workspace);
      expect(catalog.packages[0]?.scan.scanOrigin).toBe("sandbox-fallback");
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(source, { recursive: true, force: true });
    }
  });

  itLivePrivileged("scans, installs disabled, and uninstalls context-mode from the Pi catalog", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-privileged-live-workspace-"));
    try {
    const scan = await scanPiPrivilegedPackage({ source: "https://pi.dev/packages/context-mode" });
    expect(scan.packageName).toBe("context-mode");
    expect(scan.recommendation).toBe("privileged-review-required");
    expect(scan.riskSummary).toMatchObject({
      lifecycleHooks: true,
      commands: true,
      mcpServers: true,
      hostConfigMutation: true,
      nativeDependencies: true,
    });

      const installed = await installPiPrivilegedPackage(workspace, { source: "https://pi.dev/packages/context-mode" });
      expect(installed).toMatchObject({ packageName: "context-mode", status: "disabled" });
      await expect(discoverPiPrivilegedPackages(workspace)).resolves.toMatchObject({
        packages: [expect.objectContaining({ id: installed.id, packageName: "context-mode", status: "disabled" })],
        errors: [],
      });
      const removed = await uninstallPiPrivilegedPackage(workspace, { packageName: "context-mode" });
      expect(removed.removed.id).toBe(installed.id);
      expect(removed.catalog).toMatchObject({
        packages: [],
        history: [expect.objectContaining({ packageName: "context-mode" })],
        errors: [],
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }, 120_000);

  itLivePrivileged("scans pi-ffmpeg from the Pi catalog as privileged review required", async () => {
    const scan = await scanPiPrivilegedPackage({ source: "https://pi.dev/packages/pi-ffmpeg?name=bet" });
    expect(scan.packageName).toBe("pi-ffmpeg");
    expect(scan.recommendation).toBe("privileged-review-required");
    expect(scan.resources.piExtensions).toEqual(["./extensions"]);
    expect(scan.resources.bins).toEqual([]);
    expect(scan.riskSummary).toMatchObject({
      commands: true,
      filesystemWrites: true,
      processExecution: true,
      nativeDependencies: false,
    });
    expect(scan.findings.map((finding) => finding.category)).toEqual(expect.arrayContaining(["process", "filesystem"]));
  }, 120_000);
});

async function seedPrivilegedFixture(root: string): Promise<void> {
  await mkdir(join(root, "build"), { recursive: true });
  await mkdir(join(root, "configs", "codex"), { recursive: true });
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify(
      {
        name: "context-mode-like",
        version: "1.0.0",
        description: "Fixture privileged Pi package.",
        bin: { "context-mode-like": "start.mjs" },
        pi: { extensions: ["./build/pi-extension.js"], skills: ["./skills"] },
        optionalDependencies: { "better-sqlite3": "^12.6.2" },
        scripts: { postinstall: "node scripts/postinstall.mjs" },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    join(root, "build", "pi-extension.js"),
    `
import { homedir } from "node:os";
import { writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

export default function(pi) {
  pi.on("session_start", () => {
    const dir = homedir() + "/.pi/context-mode-like";
    mkdirSync(dir, { recursive: true });
    writeFileSync(dir + "/context.db", "sqlite fts5");
  });
  pi.on("tool_result", () => undefined);
  pi.registerCommand("ctx-stats", { description: "stats", handler: () => "ok" });
  execFileSync("node", ["--version"]);
}
`,
    "utf8",
  );
  await writeFile(join(root, ".mcp.json"), `${JSON.stringify({ mcpServers: { "context-mode-like": { command: "node", args: ["./start.mjs"] } } }, null, 2)}\n`, "utf8");
  await writeFile(
    join(root, "configs", "codex", "hooks.json"),
    `${JSON.stringify({ hooks: { PostToolUse: [{ hooks: [{ type: "command", command: "context-mode-like hook codex posttooluse" }] }] } }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    join(root, "start.mjs"),
    `
import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
writeFileSync(homedir() + "/.codex/config.toml", "mcp_servers.context-mode-like");
`,
    "utf8",
  );
}
