import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
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
const execFileAsync = promisify(execFile);

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

      const installed = await installPiPrivilegedPackage(workspace, { source, reviewedScan: scan });
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

  it("rejects reviewed local installs when package contents change after scan", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-privileged-local-toctou-workspace-"));
    const source = await mkdtemp(join(tmpdir(), "ambient-pi-privileged-local-toctou-source-"));
    try {
      await seedPrivilegedFixture(source);
      const scan = await scanPiPrivilegedPackage({ source });
      await writeFile(
        join(source, "build", "pi-extension.js"),
        `
import { homedir } from "node:os";
import { writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

export default function(pi) {
  pi.on("session_start", () => {
    const dir = homedir() + "/.pi/context-mode-like";
    mkdirSync(dir, { recursive: true });
    writeFileSync(dir + "/context.db", "changed bytes with same descriptor");
  });
  pi.registerCommand("ctx-stats", { description: "stats", handler: () => "changed" });
  execFileSync("node", ["--version"]);
}
`,
        "utf8",
      );

      await expect(installPiPrivilegedPackage(workspace, { source, reviewedScan: scan })).rejects.toThrow(
        /Privileged Pi package identity changed after scan; rescan before installing/,
      );
      await expect(discoverPiPrivilegedPackages(workspace)).resolves.toMatchObject({ packages: [], history: [] });
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(source, { recursive: true, force: true });
    }
  });

  it("rejects reviewed local installs when copied dependency contents change after scan", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-privileged-dependency-toctou-workspace-"));
    const source = await mkdtemp(join(tmpdir(), "ambient-pi-privileged-dependency-toctou-source-"));
    try {
      await seedPrivilegedFixture(source);
      await mkdir(join(source, "node_modules", "safe-dep"), { recursive: true });
      await writeFile(join(source, "node_modules", "safe-dep", "index.js"), "export const reviewed = true;\n", "utf8");
      const scan = await scanPiPrivilegedPackage({ source });

      await writeFile(join(source, "node_modules", "safe-dep", "index.js"), "export const reviewed = false;\n", "utf8");

      await expect(installPiPrivilegedPackage(workspace, { source, reviewedScan: scan })).rejects.toThrow(
        /Privileged Pi package identity changed after scan; rescan before installing/,
      );
      await expect(discoverPiPrivilegedPackages(workspace)).resolves.toMatchObject({ packages: [], history: [] });
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(source, { recursive: true, force: true });
    }
  });

  it("rejects reviewed local installs when empty directories change after scan", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-privileged-empty-dir-toctou-workspace-"));
    const source = await mkdtemp(join(tmpdir(), "ambient-pi-privileged-empty-dir-toctou-source-"));
    try {
      await seedPrivilegedFixture(source);
      const scan = await scanPiPrivilegedPackage({ source });

      await mkdir(join(source, "runtime-empty-marker"), { recursive: true });

      await expect(installPiPrivilegedPackage(workspace, { source, reviewedScan: scan })).rejects.toThrow(
        /Privileged Pi package identity changed after scan; rescan before installing/,
      );
      await expect(discoverPiPrivilegedPackages(workspace)).resolves.toMatchObject({ packages: [], history: [] });
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(source, { recursive: true, force: true });
    }
  });

  it("rejects symlinked or out-of-package privileged resources", async () => {
    const symlinkSource = await mkdtemp(join(tmpdir(), "ambient-pi-privileged-symlink-source-"));
    const symlinkRootParent = await mkdtemp(join(tmpdir(), "ambient-pi-privileged-symlink-root-"));
    const outsideSource = await mkdtemp(join(tmpdir(), "ambient-pi-privileged-outside-source-"));
    try {
      await seedPrivilegedFixture(symlinkSource);
      const symlinkRoot = join(symlinkRootParent, "package-link");
      await symlink(symlinkSource, symlinkRoot, "dir");
      await expect(scanPiPrivilegedPackage({ source: symlinkRoot })).rejects.toThrow(/must be a real directory/);

      await symlink(join(symlinkSource, "start.mjs"), join(symlinkSource, "build", "linked-start.mjs"));
      await expect(scanPiPrivilegedPackage({ source: symlinkSource })).rejects.toThrow(/unsupported symlink/);

      await seedPrivilegedFixture(outsideSource);
      await writeFile(
        join(outsideSource, "package.json"),
        `${JSON.stringify({
          name: "context-mode-like",
          version: "1.0.0",
          pi: { extensions: ["../outside.js"] },
        }, null, 2)}\n`,
        "utf8",
      );
      await expect(scanPiPrivilegedPackage({ source: outsideSource })).rejects.toThrow(/declares a resource outside the package/);
    } finally {
      await rm(symlinkSource, { recursive: true, force: true });
      await rm(symlinkRootParent, { recursive: true, force: true });
      await rm(outsideSource, { recursive: true, force: true });
    }
  });

  it("rejects reviewed npm installs when registry latest changes after scan", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-privileged-toctou-workspace-"));
    const registry = await startMutableRegistryFixture();
    const previousRegistry = process.env.AMBIENT_NPM_REGISTRY_URL;
    process.env.AMBIENT_NPM_REGISTRY_URL = registry.url;
    try {
      const scan = await scanPiPrivilegedPackage({ source: "npm:context-mode-like" });
      expect(scan).toMatchObject({
        packageName: "context-mode-like",
        version: "1.0.0",
        npmTarball: `${registry.url}/context-mode-like/-/context-mode-like-1.0.0.tgz`,
        descriptorHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      });

      registry.setLatest("2.0.0");

      await expect(installPiPrivilegedPackage(workspace, {
        source: "npm:context-mode-like",
        reviewedScan: scan,
      })).rejects.toThrow(/Privileged Pi package identity changed after scan; rescan before installing/);
      await expect(discoverPiPrivilegedPackages(workspace)).resolves.toMatchObject({ packages: [], history: [] });
    } finally {
      if (previousRegistry === undefined) delete process.env.AMBIENT_NPM_REGISTRY_URL;
      else process.env.AMBIENT_NPM_REGISTRY_URL = previousRegistry;
      await registry.close();
      await rm(workspace, { recursive: true, force: true });
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

async function seedPrivilegedFixture(root: string, input: { version?: string } = {}): Promise<void> {
  await mkdir(join(root, "build"), { recursive: true });
  await mkdir(join(root, "configs", "codex"), { recursive: true });
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify(
      {
        name: "context-mode-like",
        version: input.version ?? "1.0.0",
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

async function startMutableRegistryFixture(): Promise<{
  url: string;
  setLatest(version: "1.0.0" | "2.0.0"): void;
  close(): Promise<void>;
}> {
  const root = await mkdtemp(join(tmpdir(), "ambient-pi-privileged-registry-"));
  const packages = {
    "1.0.0": await createPackedRegistryPackage(root, "1.0.0"),
    "2.0.0": await createPackedRegistryPackage(root, "2.0.0"),
  };
  let latest: "1.0.0" | "2.0.0" = "1.0.0";
  let registryUrl = "";
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/context-mode-like") {
      const metadata = {
        name: "context-mode-like",
        "dist-tags": { latest },
        versions: Object.fromEntries(
          Object.entries(packages).map(([version, info]) => [
            version,
            {
              name: "context-mode-like",
              version,
              dist: {
                tarball: `${registryUrl}/context-mode-like/-/context-mode-like-${version}.tgz?token=registry-secret-${version}#signature`,
                integrity: info.integrity,
                shasum: info.shasum,
              },
            },
          ]),
        ),
      };
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(metadata));
      return;
    }
    const tarballMatch = url.pathname.match(/^\/context-mode-like\/-\/context-mode-like-(1\.0\.0|2\.0\.0)\.tgz$/);
    if (tarballMatch) {
      const body = packages[tarballMatch[1] as "1.0.0" | "2.0.0"].bytes;
      response.writeHead(200, { "content-type": "application/octet-stream", "content-length": String(body.length) });
      response.end(body);
      return;
    }
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found");
  });
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("registry fixture did not bind");
  registryUrl = `http://127.0.0.1:${address.port}`;
  return {
    url: registryUrl,
    setLatest(version) {
      latest = version;
    },
    close: async () => {
      await closeServer(server);
      await rm(root, { recursive: true, force: true });
    },
  };
}

async function createPackedRegistryPackage(root: string, version: "1.0.0" | "2.0.0"): Promise<{ bytes: Buffer; integrity: string; shasum: string }> {
  const packageRoot = join(root, `context-mode-like-${version}`, "package");
  await mkdir(packageRoot, { recursive: true });
  await seedPrivilegedFixture(packageRoot, { version });
  const tarballPath = join(root, `context-mode-like-${version}.tgz`);
  await execFileAsync("tar", ["-czf", tarballPath, "-C", join(root, `context-mode-like-${version}`), "package"]);
  const bytes = await readFile(tarballPath);
  return {
    bytes,
    integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
    shasum: createHash("sha1").update(bytes).digest("hex"),
  };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error) rejectClose(error);
      else resolveClose();
    });
  });
}
