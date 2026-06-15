import { execFile } from "node:child_process";
import { arch, cpus, platform, release, totalmem } from "node:os";
import { promisify } from "node:util";
import type { VoiceOnboardingHostFacts, VoiceOnboardingRuntimeFact } from "../shared/types";

const execFileAsync = promisify(execFile);

export async function collectVoiceOnboardingHostFacts(input: { isPackaged: boolean }): Promise<VoiceOnboardingHostFacts> {
  const runtimeChecks = await Promise.all([
    runtimeFact("Node.js", process.execPath, ["--version"], { commandLabel: "node", fallbackVersion: process.version }),
    runtimeFact("npm", "npm", ["--version"]),
    runtimeFact("Python 3", "python3", ["--version"]),
    runtimeFact("Python", "python", ["--version"]),
    runtimeFact("Homebrew", "brew", ["--version"]),
    runtimeFact("uv", "uv", ["--version"]),
    runtimeFact("ffmpeg", "ffmpeg", ["-version"]),
  ]);
  const cpuList = cpus();
  return {
    os: {
      platform: platform(),
      release: release(),
      arch: arch(),
      appMode: input.isPackaged ? "packaged" : "development",
    },
    hardware: {
      cpuModel: cpuList[0]?.model,
      cpuCount: cpuList.length || undefined,
      memoryBytes: totalmem(),
      accelerator: acceleratorSummary(platform(), arch()),
    },
    runtimes: runtimeChecks,
  };
}

async function runtimeFact(
  name: string,
  command: string,
  args: string[],
  options: { commandLabel?: string; fallbackVersion?: string } = {},
): Promise<VoiceOnboardingRuntimeFact> {
  try {
    const result = await execFileAsync(command, args, {
      timeout: 2_500,
      maxBuffer: 32 * 1024,
      env: { PATH: process.env.PATH ?? "" },
    });
    return {
      name,
      command: options.commandLabel ?? command,
      available: true,
      version: firstLine(result.stdout || result.stderr || options.fallbackVersion),
    };
  } catch (error) {
    if (options.fallbackVersion) {
      return {
        name,
        command: options.commandLabel ?? command,
        available: true,
        version: options.fallbackVersion,
        detail: "Detected from current app process.",
      };
    }
    return {
      name,
      command: options.commandLabel ?? command,
      available: false,
      detail: runtimeErrorLabel(error),
    };
  }
}

function firstLine(value: string | undefined): string | undefined {
  const line = value?.split(/\r?\n/).map((item) => item.trim()).find(Boolean);
  return line?.slice(0, 160);
}

function runtimeErrorLabel(error: unknown): string {
  const candidate = error as { code?: string; signal?: string; killed?: boolean; message?: string };
  if (candidate.code === "ENOENT") return "not found on PATH";
  if (candidate.killed || candidate.signal === "SIGTERM") return "version check timed out";
  return firstLine(candidate.message) ?? "unavailable";
}

function acceleratorSummary(osPlatform: string, osArch: string): string {
  if (osPlatform === "darwin" && osArch === "arm64") return "Apple Silicon; Metal acceleration likely available for MLX-compatible local providers.";
  if (osPlatform === "darwin") return "macOS; GPU/Metal details not deterministically detected.";
  if (osPlatform === "linux") return "Linux; CUDA/ROCm availability not deterministically detected.";
  if (osPlatform === "win32") return "Windows; GPU acceleration availability not deterministically detected.";
  return "unknown";
}
