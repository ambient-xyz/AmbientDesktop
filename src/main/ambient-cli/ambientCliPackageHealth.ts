import { statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import {
  executeProfiledCommand,
  type CommandDevicePolicy,
  type CommandDeviceSelection,
  type CommandTimeoutProfile,
} from "../tool-runtime/commandExecutionProfiles";
import { materializeTextOutput, type MaterializedTextOutput } from "../tool-runtime/toolRuntimeAmbientCliContract";
import { isPathInside } from "./ambientCliSessionFacade";

const ambientCliPackageHealthCacheTtlMs = 20_000;
const healthCacheIgnoredEnvNames = new Set(["AMBIENT_WORKSPACE_PATH", "AMBIENT_DESKTOP_WORKSPACE"]);

interface AmbientCliPackageHealthCommand {
  name: string;
  command: string;
  args: string[];
  cwd: "workspace" | "package";
  healthCheck?: string[];
  timeoutProfile?: CommandTimeoutProfile;
  progressPatterns?: string[];
  devicePolicy?: CommandDevicePolicy;
}

interface AmbientCliPackageHealthSkill {
  name: string;
  description?: string;
  path: string;
}

interface AmbientCliPackageHealthEnvRequirement {
  name: string;
  description?: string;
  required: boolean;
}

interface AmbientCliPackageHealthSummary {
  id: string;
  name: string;
  version?: string;
  description?: string;
  rootPath: string;
  source: string;
  installed: boolean;
  skills: AmbientCliPackageHealthSkill[];
  commands: AmbientCliPackageHealthCommand[];
  healthChecks?: AmbientCliPackageHealthCheckResult[];
  envRequirements: AmbientCliPackageHealthEnvRequirement[];
  errors: string[];
  generated?: unknown;
}

interface AmbientCliPackageHealthCheckResult {
  commandName: string;
  command: string[];
  cwd: string;
  passed: boolean;
  stdout?: string;
  stderr?: string;
  stdoutOutput?: MaterializedTextOutput;
  stderrOutput?: MaterializedTextOutput;
  error?: string;
  timeoutProfile?: CommandTimeoutProfile;
  timeoutMs?: number;
  idleTimeoutMs?: number;
  lastProgressAt?: string;
  deviceSelection?: CommandDeviceSelection;
  cached?: boolean;
  checkedAt?: string;
  cacheAgeMs?: number;
}

type AmbientCliPackageHealthCommandFilter<TPackage extends AmbientCliPackageHealthSummary = AmbientCliPackageHealthSummary> = (
  pkg: TPackage,
  command: AmbientCliPackageHealthCommand,
) => boolean;

interface AmbientCliPackageHealthServicesDependencies {
  cliPackageDescriptorName: string;
  ambientCliProcessEnv(workspacePath: string, pkg: AmbientCliPackageHealthSummary): Promise<NodeJS.ProcessEnv>;
  contentHash(value: string | Buffer): string;
  errorMessage(error: unknown): string;
  isErrno(error: unknown, code: string): boolean;
  resolveCliExecutable(packageRoot: string, command: string): string;
  resolveDescriptorArg(packageRoot: string, arg: string): string;
}

interface AmbientCliPackageHealthFileSignatureEntry {
  path: string;
  kind?: "directory" | "file" | "other";
  size?: number;
  mtimeMs?: number;
  missing?: boolean;
}

export function createAmbientCliPackageHealthServices(deps: AmbientCliPackageHealthServicesDependencies) {
  const { ambientCliProcessEnv, cliPackageDescriptorName, contentHash, errorMessage, isErrno, resolveCliExecutable, resolveDescriptorArg } =
    deps;
  const ambientCliPackageHealthLocks = new Map<string, Promise<AmbientCliPackageHealthCheckResult>>();
  const ambientCliPackageHealthCache = new Map<
    string,
    { checkedAt: string; checkedAtMs: number; result: AmbientCliPackageHealthCheckResult }
  >();

  async function withAmbientCliPackageHealth<TPackage extends AmbientCliPackageHealthSummary>(
    workspacePath: string,
    pkg: TPackage,
    commandFilter?: AmbientCliPackageHealthCommandFilter<TPackage>,
  ): Promise<TPackage> {
    if (pkg.errors.length > 0) return pkg;
    const healthChecks = await checkAmbientCliPackageHealth(pkg, { workspacePath, commandFilter });
    return healthChecks.length ? { ...pkg, healthChecks } : pkg;
  }

  async function checkAmbientCliPackageHealth<TPackage extends AmbientCliPackageHealthSummary>(
    pkg: TPackage,
    options: { workspacePath?: string; commandFilter?: AmbientCliPackageHealthCommandFilter<TPackage> } = {},
  ): Promise<AmbientCliPackageHealthCheckResult[]> {
    const checks = pkg.commands.filter(
      (command) => command.healthCheck?.length && (!options.commandFilter || options.commandFilter(pkg, command)),
    );
    const results: AmbientCliPackageHealthCheckResult[] = [];
    for (const command of checks) {
      const result = await checkAmbientCliPackageCommandHealth(pkg, command, options.workspacePath ?? pkg.rootPath);
      if (result) results.push(result);
    }
    return results;
  }

  async function checkAmbientCliPackageCommandHealth(
    pkg: AmbientCliPackageHealthSummary,
    command: AmbientCliPackageHealthCommand,
    workspacePath: string,
  ): Promise<AmbientCliPackageHealthCheckResult | undefined> {
    const healthCheck = command.healthCheck ?? [];
    const [rawExecutable, ...rawArgs] = healthCheck;
    if (!rawExecutable) return undefined;
    const executable = resolveCliExecutable(pkg.rootPath, rawExecutable);
    const args = rawArgs.map((arg) => resolveDescriptorArg(pkg.rootPath, arg));
    const cwd = pkg.rootPath;
    let env: NodeJS.ProcessEnv | undefined;
    try {
      env = await ambientCliProcessEnv(workspacePath, pkg);
      const cacheKey = ambientCliPackageHealthCacheKey(pkg, command, {
        executable,
        args,
        cwd,
        env,
        workspacePath,
      });
      return await withAmbientCliPackageHealthCache(cacheKey, () =>
        runAmbientCliPackageCommandHealth({
          pkg,
          command,
          rawExecutable,
          executable,
          args,
          cwd,
          env: env!,
          workspacePath,
        }),
      );
    } catch (error) {
      const checkedAt = new Date().toISOString();
      return {
        commandName: command.name,
        command: [rawExecutable, ...rawArgs],
        cwd,
        passed: false,
        error: errorMessage(error),
        cached: false,
        checkedAt,
        cacheAgeMs: 0,
      };
    }
  }

  async function withAmbientCliPackageHealthCache(
    cacheKey: string,
    run: () => Promise<AmbientCliPackageHealthCheckResult>,
  ): Promise<AmbientCliPackageHealthCheckResult> {
    const now = Date.now();
    const cached = ambientCliPackageHealthCache.get(cacheKey);
    if (cached && now - cached.checkedAtMs <= ambientCliPackageHealthCacheTtlMs) {
      return {
        ...cached.result,
        cached: true,
        checkedAt: cached.checkedAt,
        cacheAgeMs: now - cached.checkedAtMs,
      };
    }
    const existing = ambientCliPackageHealthLocks.get(cacheKey);
    if (existing) return existing;
    const pending = (async () => {
      const result = await run();
      const checkedAtMs = Date.now();
      const checkedAt = new Date(checkedAtMs).toISOString();
      const fresh = {
        ...result,
        cached: false,
        checkedAt,
        cacheAgeMs: 0,
      };
      ambientCliPackageHealthCache.set(cacheKey, { checkedAt, checkedAtMs, result: fresh });
      pruneAmbientCliPackageHealthCache(checkedAtMs);
      return fresh;
    })();
    ambientCliPackageHealthLocks.set(cacheKey, pending);
    try {
      return await pending;
    } finally {
      if (ambientCliPackageHealthLocks.get(cacheKey) === pending) ambientCliPackageHealthLocks.delete(cacheKey);
    }
  }

  async function runAmbientCliPackageCommandHealth(input: {
    pkg: AmbientCliPackageHealthSummary;
    command: AmbientCliPackageHealthCommand;
    rawExecutable: string;
    executable: string;
    args: string[];
    cwd: string;
    env: NodeJS.ProcessEnv;
    workspacePath: string;
  }): Promise<AmbientCliPackageHealthCheckResult> {
    try {
      const output = await executeProfiledCommand({
        command: input.executable,
        args: input.args,
        cwd: input.cwd,
        env: input.env,
        maxBuffer: 1024 * 1024,
        timeoutProfile: input.command.timeoutProfile ?? "healthCheck",
        progressPatterns: input.command.progressPatterns,
        devicePolicy: input.command.devicePolicy,
        phase: `ambient-cli healthCheck ${input.pkg.name}:${input.command.name}`,
      });
      const { stdout, stderr } = output;
      const stdoutOutput = stdout
        ? await materializeTextOutput(input.workspacePath, {
            label: `ambient-cli-health-${input.pkg.name}-${input.command.name}-stdout`,
            text: stdout,
            maxPreviewChars: 4_000,
          })
        : undefined;
      const stderrOutput = stderr
        ? await materializeTextOutput(input.workspacePath, {
            label: `ambient-cli-health-${input.pkg.name}-${input.command.name}-stderr`,
            text: stderr,
            maxPreviewChars: 4_000,
          })
        : undefined;
      return {
        commandName: input.command.name,
        command: [input.rawExecutable, ...output.args],
        cwd: input.cwd,
        passed: true,
        ...(stdoutOutput ? { stdout: stdoutOutput.text, stdoutOutput } : {}),
        ...(stderrOutput ? { stderr: stderrOutput.text, stderrOutput } : {}),
        timeoutProfile: output.timeoutProfile,
        timeoutMs: output.timeoutMs,
        idleTimeoutMs: output.idleTimeoutMs,
        ...(output.lastProgressAt ? { lastProgressAt: output.lastProgressAt } : {}),
        ...(output.deviceSelection ? { deviceSelection: output.deviceSelection } : {}),
      };
    } catch (error) {
      return {
        commandName: input.command.name,
        command: input.command.healthCheck ?? [input.rawExecutable],
        cwd: input.cwd,
        passed: false,
        error: errorMessage(error),
      };
    }
  }

  function ambientCliPackageHealthCacheKey(
    pkg: AmbientCliPackageHealthSummary,
    command: AmbientCliPackageHealthCommand,
    input: { executable: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv; workspacePath: string },
  ): string {
    return contentHash(
      JSON.stringify({
        packageId: pkg.id,
        packageName: pkg.name,
        packageVersion: pkg.version ?? "",
        rootPath: resolve(pkg.rootPath),
        source: pkg.source,
        commandName: command.name,
        healthCheck: command.healthCheck ?? [],
        executable: input.executable,
        args: input.args,
        cwd: resolve(input.cwd),
        workspacePath: resolve(input.workspacePath),
        files: ambientCliPackageHealthFileSignature(pkg, input),
        timeoutProfile: command.timeoutProfile ?? "healthCheck",
        progressPatterns: command.progressPatterns ?? [],
        devicePolicy: command.devicePolicy ?? {},
        env: ambientCliHealthEnvSignature(input.env),
      }),
    );
  }

  function ambientCliPackageHealthFileSignature(
    pkg: AmbientCliPackageHealthSummary,
    input: { executable: string; args: string[] },
  ): string {
    const packageRoot = resolve(pkg.rootPath);
    const candidates = new Set([resolve(packageRoot, cliPackageDescriptorName), input.executable, ...input.args]);
    const entries: AmbientCliPackageHealthFileSignatureEntry[] = Array.from(candidates)
      .flatMap((candidate): AmbientCliPackageHealthFileSignatureEntry[] => {
        const absolutePath = resolve(candidate);
        if (!isPathInside(packageRoot, absolutePath) && absolutePath !== packageRoot) return [];
        const relativePath = relative(packageRoot, absolutePath).split(sep).join("/") || ".";
        try {
          const stat = statSync(absolutePath);
          return [
            {
              path: relativePath,
              kind: stat.isDirectory() ? "directory" : stat.isFile() ? "file" : "other",
              size: stat.size,
              mtimeMs: stat.mtimeMs,
            },
          ];
        } catch (error) {
          if (isErrno(error, "ENOENT")) return [{ path: relativePath, missing: true }];
          throw error;
        }
      })
      .sort((left, right) => left.path.localeCompare(right.path));
    return contentHash(JSON.stringify(entries));
  }

  function ambientCliHealthEnvSignature(env: NodeJS.ProcessEnv): string {
    const entries = Object.entries(env)
      .filter(([name, value]) => typeof value === "string" && !healthCacheIgnoredEnvNames.has(name))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, value]) => [name, contentHash(value ?? "")]);
    return contentHash(JSON.stringify(entries));
  }

  function pruneAmbientCliPackageHealthCache(now: number): void {
    for (const [key, value] of ambientCliPackageHealthCache) {
      if (now - value.checkedAtMs > ambientCliPackageHealthCacheTtlMs * 3) ambientCliPackageHealthCache.delete(key);
    }
  }

  return {
    checkAmbientCliPackageHealth,
    withAmbientCliPackageHealth,
  };
}
