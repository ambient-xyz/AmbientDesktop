import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GoogleWorkspaceCliInstallState } from "../../shared/pluginTypes";

type FetchLike = (url: string) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

export interface GoogleWorkspaceCliInstallerOptions {
  toolsRoot: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  arch?: NodeJS.Architecture;
  fetchImpl?: FetchLike;
  spawnProcess?: typeof spawn;
  fileExists?: (path: string) => boolean;
  extractArchive?: (input: { archivePath: string; targetDir: string }) => Promise<void>;
  now?: () => Date;
}

interface GoogleWorkspaceCliReleaseAsset {
  platform: NodeJS.Platform;
  arch: NodeJS.Architecture;
  archiveName: string;
  checksum: string;
}

const GWS_VERSION = "0.22.3";
const GWS_RELEASE_TAG = `v${GWS_VERSION}`;
const GWS_RELEASE_BASE = `https://github.com/googleworkspace/cli/releases/download/${GWS_RELEASE_TAG}`;

const GWS_RELEASE_ASSETS: Record<string, GoogleWorkspaceCliReleaseAsset> = {
  "darwin-arm64": {
    platform: "darwin",
    arch: "arm64",
    archiveName: "google-workspace-cli-aarch64-apple-darwin.tar.gz",
    checksum: "3e56ae8005bf33ec14ba3ef1541792b267ef0b6de6c344573eac19457e396d99",
  },
  "darwin-x64": {
    platform: "darwin",
    arch: "x64",
    archiveName: "google-workspace-cli-x86_64-apple-darwin.tar.gz",
    checksum: "ccb477ceeb75ad301d780692224a61678cbba85251b7dc074fc67e94527f94cd",
  },
  "linux-arm64": {
    platform: "linux",
    arch: "arm64",
    archiveName: "google-workspace-cli-aarch64-unknown-linux-gnu.tar.gz",
    checksum: "4cddeb0dff1e0b45023c63915a2d46affe3689b7332a862f913b395e604d4ce1",
  },
  "linux-x64": {
    platform: "linux",
    arch: "x64",
    archiveName: "google-workspace-cli-x86_64-unknown-linux-gnu.tar.gz",
    checksum: "b951ef847b38dd41a23d31a3aeaf3cb650421aac607bbfe63727bf4f4213ce44",
  },
};

export class GoogleWorkspaceCliInstaller {
  private readonly platform: NodeJS.Platform;
  private readonly arch: NodeJS.Architecture;
  private readonly fetchImpl: FetchLike;
  private readonly spawnProcess: typeof spawn;
  private readonly fileExists: (path: string) => boolean;
  private readonly extractArchive: (input: { archivePath: string; targetDir: string }) => Promise<void>;
  private readonly now: () => Date;
  private installState: GoogleWorkspaceCliInstallState;

  constructor(private readonly options: GoogleWorkspaceCliInstallerOptions) {
    this.platform = options.platform ?? process.platform;
    this.arch = options.arch ?? process.arch;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.spawnProcess = options.spawnProcess ?? spawn;
    this.fileExists = options.fileExists ?? existsSync;
    this.extractArchive = options.extractArchive ?? ((input) => extractTarGz(this.spawnProcess, input.archivePath, input.targetDir));
    this.now = options.now ?? (() => new Date());
    this.installState = this.initialState();
  }

  state(): GoogleWorkspaceCliInstallState {
    if (this.installState.status === "idle" && this.fileExists(this.binaryPath())) {
      return {
        ...this.initialState(),
        status: "completed",
        binaryPath: this.binaryPath(),
        finishedAt: this.now().toISOString(),
      };
    }
    return structuredClone(this.installState);
  }

  binaryPath(): string {
    return join(this.installDir(), "gws");
  }

  async install(): Promise<GoogleWorkspaceCliInstallState> {
    if (this.installState.status === "running") throw new Error("Google Workspace CLI install is already running.");
    const asset = this.asset();
    if (!asset) {
      this.installState = {
        ...this.initialState(),
        status: "unsupported",
        error: `No managed Google Workspace CLI binary is pinned for ${this.platform}/${this.arch}.`,
      };
      return this.state();
    }
    if (this.fileExists(this.binaryPath())) {
      this.installState = {
        ...this.initialState(asset),
        status: "completed",
        binaryPath: this.binaryPath(),
        finishedAt: this.now().toISOString(),
      };
      return this.state();
    }

    const startedAt = this.now().toISOString();
    this.installState = {
      ...this.initialState(asset),
      status: "running",
      binaryPath: this.binaryPath(),
      startedAt,
    };
    const tempDir = await mkdtemp(join(tmpdir(), "ambient-gws-"));
    const archivePath = join(tempDir, asset.archiveName);
    try {
      const archive = await this.download(asset);
      await writeFile(archivePath, archive);
      await rm(this.installDir(), { recursive: true, force: true });
      await mkdir(this.installDir(), { recursive: true });
      await this.extractArchive({ archivePath, targetDir: this.installDir() });
      await chmod(this.binaryPath(), 0o755);
      this.installState = {
        ...this.installState,
        status: "completed",
        finishedAt: this.now().toISOString(),
      };
      return this.state();
    } catch (error) {
      this.installState = {
        ...this.installState,
        status: "error",
        finishedAt: this.now().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      };
      return this.state();
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  private async download(asset: GoogleWorkspaceCliReleaseAsset): Promise<Buffer> {
    const response = await this.fetchImpl(downloadUrl(asset));
    if (!response.ok) throw new Error(`Failed to download gws ${GWS_VERSION}: HTTP ${response.status} ${response.statusText}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    const actual = createHash("sha256").update(buffer).digest("hex");
    if (actual !== asset.checksum) {
      throw new Error(`Downloaded gws checksum mismatch: expected ${asset.checksum}, got ${actual}.`);
    }
    return buffer;
  }

  private initialState(asset = this.asset()): GoogleWorkspaceCliInstallState {
    return {
      status: asset ? "idle" : "unsupported",
      version: GWS_VERSION,
      platform: this.platform,
      arch: this.arch,
      binaryPath: asset ? this.binaryPath() : undefined,
      downloadUrl: asset ? downloadUrl(asset) : undefined,
      checksum: asset?.checksum,
      error: asset ? undefined : `No managed Google Workspace CLI binary is pinned for ${this.platform}/${this.arch}.`,
    };
  }

  private installDir(): string {
    return join(this.options.toolsRoot, "google-workspace-cli", GWS_RELEASE_TAG, `${this.platform}-${this.arch}`);
  }

  private asset(): GoogleWorkspaceCliReleaseAsset | undefined {
    return GWS_RELEASE_ASSETS[`${this.platform}-${this.arch}`];
  }
}

function downloadUrl(asset: GoogleWorkspaceCliReleaseAsset): string {
  return `${GWS_RELEASE_BASE}/${asset.archiveName}`;
}

async function extractTarGz(spawnProcess: typeof spawn, archivePath: string, targetDir: string): Promise<void> {
  await runProcess(spawnProcess, "tar", ["-xzf", archivePath, "-C", targetDir, "--strip-components", "1"]);
}

async function runProcess(spawnProcess: typeof spawn, command: string, args: string[]): Promise<void> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawnProcess(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-4000);
    });
    child.on("error", rejectRun);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolveRun();
        return;
      }
      rejectRun(new Error(`${command} exited with ${code ?? signal ?? "unknown"}${stderr ? `: ${stderr}` : ""}`));
    });
  });
}
