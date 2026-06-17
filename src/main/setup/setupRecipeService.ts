import { execFile } from "node:child_process";
import { access, readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import { parse as parseYaml } from "yaml";
import {
  probeContainerRuntimeHosts,
  type ContainerRuntimeCommandInvocation,
  type ContainerRuntimeCommandResult,
  type ContainerRuntimeHostProbe,
} from "../container-runtime/containerRuntimeProbeService";

const execFileAsync = promisify(execFile);

export type SetupRecipeId = "containerized_app";

export interface SetupRecipeDescribeInput {
  workspacePath: string;
  recipe: SetupRecipeId;
  includeHostPreflight?: boolean;
  includePortProbe?: boolean;
}

export interface SetupRecipeCommandInput extends ContainerRuntimeCommandInvocation {
  cwd: string;
}

export type SetupRecipeCommandRunner = (input: SetupRecipeCommandInput) => Promise<ContainerRuntimeCommandResult>;

export interface SetupRecipeContainerFile {
  path: string;
  kind: "compose" | "dockerfile" | "containerfile" | "devcontainer";
  serviceCount?: number;
  services?: string[];
}

export interface SetupRecipePackageScript {
  name: string;
  command: string;
}

export interface SetupRecipePortBinding {
  sourcePath: string;
  service?: string;
  hostPort?: number;
  containerPort?: number;
  protocol?: string;
  raw: string;
}

export interface SetupRecipePortConflict {
  port: number;
  status: "free" | "in-use" | "unknown";
  processSummary?: string;
  suggestedHostPort?: number;
}

export interface SetupRecipeComposeCommandProbe {
  command: string;
  args: string[];
  available: boolean;
  version?: string;
  message: string;
}

export interface SetupRecipeExistingContainer {
  runtime: "docker" | "podman";
  name: string;
  status?: string;
  ports?: string;
}

export interface SetupRecipeDescribeResult {
  schemaVersion: "ambient-setup-recipe-describe-v1";
  recipe: SetupRecipeId;
  workspacePath: string;
  activation: {
    active: boolean;
    confidence: "none" | "low" | "medium" | "high";
    signals: string[];
  };
  projectName: string;
  containerFiles: SetupRecipeContainerFile[];
  packageScripts: SetupRecipePackageScript[];
  portBindings: SetupRecipePortBinding[];
  portConflicts: SetupRecipePortConflict[];
  composeCommands: SetupRecipeComposeCommandProbe[];
  hostPreflight: ContainerRuntimeHostProbe[];
  existingContainers: SetupRecipeExistingContainer[];
  warnings: string[];
  nextActions: string[];
}

interface ComposeDocument {
  services?: Record<string, unknown>;
}

interface PackageJsonShape {
  scripts?: Record<string, unknown>;
}

const commandTimeoutMs = 5_000;
const maxOutputBufferBytes = 1024 * 1024;
const rootContainerFiles = [
  { path: "docker-compose.yml", kind: "compose" as const },
  { path: "docker-compose.yaml", kind: "compose" as const },
  { path: "compose.yml", kind: "compose" as const },
  { path: "compose.yaml", kind: "compose" as const },
  { path: "Dockerfile", kind: "dockerfile" as const },
  { path: "Containerfile", kind: "containerfile" as const },
  { path: ".devcontainer/devcontainer.json", kind: "devcontainer" as const },
  { path: ".devcontainer/docker-compose.yml", kind: "compose" as const },
  { path: ".devcontainer/docker-compose.yaml", kind: "compose" as const },
];
const containerSubdirs = ["docker", "compose", "deploy", "infra", "ops"];

export async function describeSetupRecipe(
  input: SetupRecipeDescribeInput,
  options: { commandRunner?: SetupRecipeCommandRunner; platform?: NodeJS.Platform | string; env?: NodeJS.ProcessEnv } = {},
): Promise<SetupRecipeDescribeResult> {
  if (input.recipe !== "containerized_app") throw new Error(`Unsupported setup recipe: ${input.recipe}`);
  const runner = options.commandRunner ?? defaultSetupRecipeCommandRunner;
  const projectName = composeProjectName(input.workspacePath);
  const [containerFiles, packageScripts] = await Promise.all([
    detectContainerFiles(input.workspacePath),
    detectContainerPackageScripts(input.workspacePath),
  ]);
  const signals = containerSignals(containerFiles, packageScripts);
  const active = signals.length > 0;
  const includeHostPreflight = input.includeHostPreflight !== false && active;
  const includePortProbe = input.includePortProbe !== false && active;
  const warnings: string[] = [];
  const portBindings = await collectPortBindings(input.workspacePath, containerFiles, warnings);
  const [hostPreflight, composeCommands, portConflicts, existingContainers] = await Promise.all([
    includeHostPreflight
      ? probeContainerRuntimeHosts({
          platform: options.platform,
          env: options.env,
          timeoutMs: commandTimeoutMs,
          commandRunner: adaptHostProbeRunner(input.workspacePath, runner),
        })
      : Promise.resolve([]),
    includeHostPreflight ? probeComposeCommands(input.workspacePath, runner) : Promise.resolve([]),
    includePortProbe ? probePortConflicts(input.workspacePath, runner, portBindings) : Promise.resolve([]),
    includeHostPreflight ? probeExistingContainers(input.workspacePath, runner, projectName) : Promise.resolve([]),
  ]);

  return {
    schemaVersion: "ambient-setup-recipe-describe-v1",
    recipe: input.recipe,
    workspacePath: input.workspacePath,
    activation: {
      active,
      confidence: setupRecipeConfidence(containerFiles, packageScripts),
      signals,
    },
    projectName,
    containerFiles,
    packageScripts,
    portBindings,
    portConflicts,
    composeCommands,
    hostPreflight,
    existingContainers,
    warnings,
    nextActions: setupRecipeNextActions({
      active,
      hostPreflight,
      composeCommands,
      portConflicts,
      containerFiles,
      packageScripts,
    }),
  };
}

export function setupRecipeDescribeText(result: SetupRecipeDescribeResult): string {
  const lines = [
    `Ambient setup recipe: ${result.recipe}`,
    `Workspace: ${result.workspacePath}`,
    `Activation: ${result.activation.active ? "active" : "inactive"} (${result.activation.confidence} confidence)`,
    `Project name: ${result.projectName}`,
    "Signals:",
    ...(result.activation.signals.length ? result.activation.signals.map((signal) => `- ${signal}`) : ["- none detected"]),
    "Container files:",
    ...(result.containerFiles.length
      ? result.containerFiles.map((file) => {
          const services = file.services?.length ? ` services=${file.services.join(", ")}` : "";
          return `- ${file.path} (${file.kind})${services}`;
        })
      : ["- none detected"]),
    "Container package scripts:",
    ...(result.packageScripts.length
      ? result.packageScripts.map((script) => `- ${script.name}: ${script.command}`)
      : ["- none detected"]),
    "Compose commands:",
    ...(result.composeCommands.length
      ? result.composeCommands.map((probe) => `- ${probe.command} ${probe.args.join(" ")}: ${probe.available ? "available" : "not available"}${probe.version ? ` (${probe.version})` : ""}; ${probe.message}`)
      : ["- not probed"]),
    "Container host readiness:",
    ...(result.hostPreflight.length
      ? result.hostPreflight.map((host) => `- ${host.kind}: ${host.status}; ${host.message}`)
      : ["- not probed"]),
    "Published host ports:",
    ...(result.portBindings.length
      ? result.portBindings.map((binding) => {
          const host = binding.hostPort ? `${binding.hostPort}` : "dynamic/container-only";
          const target = binding.containerPort ? ` -> ${binding.containerPort}` : "";
          const service = binding.service ? ` service=${binding.service}` : "";
          return `- ${host}${target}${binding.protocol ? `/${binding.protocol}` : ""}${service} from ${binding.sourcePath} (${binding.raw})`;
        })
      : ["- none detected"]),
    "Port conflicts:",
    ...(result.portConflicts.length
      ? result.portConflicts.map((conflict) => {
          const suggestion = conflict.status === "in-use" && conflict.suggestedHostPort
            ? `; suggest host port ${conflict.suggestedHostPort}`
            : "";
          const process = conflict.processSummary ? `; ${conflict.processSummary}` : "";
          return `- ${conflict.port}: ${conflict.status}${suggestion}${process}`;
        })
      : ["- none detected"]),
    "Existing project containers:",
    ...(result.existingContainers.length
      ? result.existingContainers.map((container) => `- ${container.runtime}: ${container.name}${container.status ? ` ${container.status}` : ""}${container.ports ? ` ${container.ports}` : ""}`)
      : ["- none detected"]),
    "Warnings:",
    ...(result.warnings.length ? result.warnings.map((warning) => `- ${warning}`) : ["- none"]),
    "Next actions:",
    ...result.nextActions.map((action) => `- ${action}`),
  ];
  return `${lines.join("\n")}\n`;
}

async function detectContainerFiles(workspacePath: string): Promise<SetupRecipeContainerFile[]> {
  const rootFiles = await Promise.all(rootContainerFiles.map(async (candidate) => {
    if (!(await fileExists(join(workspacePath, candidate.path)))) return undefined;
    return describeContainerFile(workspacePath, candidate.path, candidate.kind);
  }));
  const nestedFiles = await Promise.all(containerSubdirs.map(async (dir) => {
    const dirPath = join(workspacePath, dir);
    if (!(await fileExists(dirPath))) return [];
    let entries: string[];
    try {
      entries = await readdir(dirPath);
    } catch {
      return [];
    }
    return (await Promise.all(entries
      .filter((entry) => /^(?:docker-compose|compose)\.ya?ml$/i.test(entry) || /^(?:Dockerfile|Containerfile)$/i.test(entry))
      .map((entry) => {
        const path = `${dir}/${entry}`;
        const kind = /compose\.ya?ml$/i.test(entry) ? "compose" : entry.toLowerCase() === "containerfile" ? "containerfile" : "dockerfile";
        return describeContainerFile(workspacePath, path, kind);
      })));
  }));
  return [...rootFiles.filter((file): file is SetupRecipeContainerFile => Boolean(file)), ...nestedFiles.flat()];
}

async function describeContainerFile(
  workspacePath: string,
  path: string,
  kind: SetupRecipeContainerFile["kind"],
): Promise<SetupRecipeContainerFile> {
  if (kind !== "compose") return { path, kind };
  try {
    const document = parseYaml(await readFile(join(workspacePath, path), "utf8")) as ComposeDocument | undefined;
    const services = document?.services && typeof document.services === "object" ? Object.keys(document.services) : [];
    return { path, kind, serviceCount: services.length, services };
  } catch {
    return { path, kind };
  }
}

async function detectContainerPackageScripts(workspacePath: string): Promise<SetupRecipePackageScript[]> {
  let parsed: PackageJsonShape;
  try {
    parsed = JSON.parse(await readFile(join(workspacePath, "package.json"), "utf8")) as PackageJsonShape;
  } catch {
    return [];
  }
  const scripts = parsed.scripts && typeof parsed.scripts === "object" ? parsed.scripts : {};
  return Object.entries(scripts)
    .filter(([, command]) => typeof command === "string" && /\b(?:docker|podman)(?:-compose|\s+compose)?\b|\bcompose\s+up\b/i.test(command))
    .map(([name, command]) => ({ name, command: String(command) }));
}

function containerSignals(containerFiles: SetupRecipeContainerFile[], packageScripts: SetupRecipePackageScript[]): string[] {
  const signals: string[] = [];
  for (const file of containerFiles) signals.push(`${file.kind} file ${file.path}`);
  for (const script of packageScripts) signals.push(`package script ${script.name} invokes container tooling`);
  return signals;
}

function setupRecipeConfidence(containerFiles: SetupRecipeContainerFile[], packageScripts: SetupRecipePackageScript[]): SetupRecipeDescribeResult["activation"]["confidence"] {
  if (containerFiles.some((file) => file.kind === "compose") && packageScripts.length > 0) return "high";
  if (containerFiles.some((file) => file.kind === "compose")) return "high";
  if (containerFiles.length > 0 || packageScripts.length > 0) return "medium";
  return "none";
}

async function collectPortBindings(
  workspacePath: string,
  containerFiles: SetupRecipeContainerFile[],
  warnings: string[],
): Promise<SetupRecipePortBinding[]> {
  const bindings: SetupRecipePortBinding[] = [];
  for (const file of containerFiles.filter((entry) => entry.kind === "compose")) {
    try {
      const parsed = parseYaml(await readFile(join(workspacePath, file.path), "utf8")) as ComposeDocument | undefined;
      const services = parsed?.services && typeof parsed.services === "object" ? parsed.services : {};
      for (const [service, serviceSpec] of Object.entries(services)) {
        const rawPorts = typeof serviceSpec === "object" && serviceSpec && "ports" in serviceSpec
          ? (serviceSpec as { ports?: unknown }).ports
          : undefined;
        if (!Array.isArray(rawPorts)) continue;
        for (const rawPort of rawPorts) {
          const binding = parseComposePortBinding(rawPort, file.path, service);
          if (binding) bindings.push(binding);
        }
      }
    } catch (error) {
      warnings.push(`${file.path}: unable to parse compose ports (${errorMessage(error)}).`);
    }
  }
  return bindings;
}

function parseComposePortBinding(rawPort: unknown, sourcePath: string, service: string): SetupRecipePortBinding | undefined {
  if (typeof rawPort === "number") {
    return { sourcePath, service, containerPort: rawPort, raw: String(rawPort) };
  }
  if (typeof rawPort === "string") {
    const raw = rawPort.trim();
    if (!raw || raw.includes("${")) return { sourcePath, service, raw };
    const [withoutProtocol, protocol] = raw.split("/", 2);
    const parts = withoutProtocol.split(":");
    if (parts.length === 1) {
      return { sourcePath, service, containerPort: parsePortNumber(parts[0]), ...(protocol ? { protocol } : {}), raw };
    }
    const hostPortText = parts.length >= 3 ? parts[parts.length - 2] : parts[0];
    const containerPortText = parts[parts.length - 1];
    return {
      sourcePath,
      service,
      hostPort: parsePortNumber(hostPortText),
      containerPort: parsePortNumber(containerPortText),
      ...(protocol ? { protocol } : {}),
      raw,
    };
  }
  if (typeof rawPort === "object" && rawPort) {
    const spec = rawPort as { published?: unknown; target?: unknown; protocol?: unknown };
    const raw = JSON.stringify(rawPort);
    return {
      sourcePath,
      service,
      hostPort: parsePortNumber(spec.published),
      containerPort: parsePortNumber(spec.target),
      ...(typeof spec.protocol === "string" ? { protocol: spec.protocol } : {}),
      raw,
    };
  }
  return undefined;
}

async function probeComposeCommands(workspacePath: string, runner: SetupRecipeCommandRunner): Promise<SetupRecipeComposeCommandProbe[]> {
  const probes = await Promise.all([
    runAvailabilityProbe(workspacePath, runner, "docker", ["compose", "version"]),
    runAvailabilityProbe(workspacePath, runner, "docker-compose", ["version"]),
    runAvailabilityProbe(workspacePath, runner, "podman", ["compose", "version"]),
  ]);
  return probes;
}

async function runAvailabilityProbe(
  workspacePath: string,
  runner: SetupRecipeCommandRunner,
  command: string,
  args: string[],
): Promise<SetupRecipeComposeCommandProbe> {
  const result = await runner({ cwd: workspacePath, command, args, env: process.env, timeoutMs: commandTimeoutMs });
  const text = [result.stdout, result.stderr].join("\n").trim();
  return {
    command,
    args,
    available: result.exitCode === 0,
    version: result.exitCode === 0 ? firstVersion(text) : undefined,
    message: result.exitCode === 0 ? cleanOutput(text) || "command is available" : cleanOutput(text) || result.errorCode || "command failed",
  };
}

async function probePortConflicts(
  workspacePath: string,
  runner: SetupRecipeCommandRunner,
  portBindings: SetupRecipePortBinding[],
): Promise<SetupRecipePortConflict[]> {
  const uniquePorts = [...new Set(portBindings.map((binding) => binding.hostPort).filter((port): port is number => Boolean(port)))].slice(0, 20);
  const results = await Promise.all(uniquePorts.map(async (port) => {
    const command = process.platform === "win32" ? "netstat" : "lsof";
    const args = process.platform === "win32" ? ["-ano", "-p", "tcp"] : ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"];
    const result = await runner({ cwd: workspacePath, command, args, env: process.env, timeoutMs: commandTimeoutMs });
    const output = [result.stdout, result.stderr].join("\n");
    const inUse = process.platform === "win32"
      ? new RegExp(`[:.]${port}\\s+.*LISTENING`, "i").test(output)
      : result.exitCode === 0 && output.split(/\r?\n/).filter(Boolean).length > 1;
    const status: SetupRecipePortConflict["status"] = inUse ? "in-use" : result.exitCode === 0 || result.exitCode === 1 ? "free" : "unknown";
    return {
      port,
      status,
      ...(inUse ? { processSummary: firstNonHeaderLine(output), suggestedHostPort: suggestHostPort(port, uniquePorts) } : {}),
    };
  }));
  return results.filter((result) => result.status !== "free");
}

async function probeExistingContainers(
  workspacePath: string,
  runner: SetupRecipeCommandRunner,
  projectName: string,
): Promise<SetupRecipeExistingContainer[]> {
  const [docker, podman] = await Promise.all([
    runContainerList(workspacePath, runner, "docker", ["ps", "--filter", `label=com.docker.compose.project=${projectName}`, "--format", "{{.Names}}\t{{.Status}}\t{{.Ports}}"]),
    runContainerList(workspacePath, runner, "podman", ["ps", "--filter", `label=io.podman.compose.project=${projectName}`, "--format", "{{.Names}}\t{{.Status}}\t{{.Ports}}"]),
  ]);
  return [...docker, ...podman];
}

async function runContainerList(
  workspacePath: string,
  runner: SetupRecipeCommandRunner,
  runtime: "docker" | "podman",
  args: string[],
): Promise<SetupRecipeExistingContainer[]> {
  const result = await runner({ cwd: workspacePath, command: runtime, args, env: process.env, timeoutMs: commandTimeoutMs });
  if (result.exitCode !== 0) return [];
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20)
    .map((line) => {
      const [name, status, ports] = line.split("\t");
      return { runtime, name, ...(status ? { status } : {}), ...(ports ? { ports } : {}) };
    });
}

function setupRecipeNextActions(input: {
  active: boolean;
  hostPreflight: ContainerRuntimeHostProbe[];
  composeCommands: SetupRecipeComposeCommandProbe[];
  portConflicts: SetupRecipePortConflict[];
  containerFiles: SetupRecipeContainerFile[];
  packageScripts: SetupRecipePackageScript[];
}): string[] {
  if (!input.active) {
    return [
      "Do not load Docker/Podman setup guidance for this source unless new evidence shows container files or container package scripts.",
      "Continue ordinary setup with repository docs, package-manager preflight, and normal file/shell/browser tools.",
    ];
  }
  const actions = [
    "Use this containerized-app recipe only for normal app setup; keep ToolHive-managed MCP workloads separate.",
    "Prefer documented compose scripts or the detected compose command before inventing a custom Docker command.",
  ];
  const readyHost = input.hostPreflight.find((host) => host.status === "ready");
  if (!readyHost) {
    actions.push("No ready Docker/Podman host was confirmed; ask the user to start, install, or repair the selected container runtime before compose up.");
  }
  if (!input.composeCommands.some((probe) => probe.available)) {
    actions.push("No compose command was confirmed; resolve Docker Compose or Podman Compose availability before running container setup.");
  }
  for (const conflict of input.portConflicts.filter((entry) => entry.status === "in-use")) {
    actions.push(`Port ${conflict.port} is already in use; prefer a compose override or documented env port override${conflict.suggestedHostPort ? ` such as host port ${conflict.suggestedHostPort}` : ""} instead of abandoning the container path.`);
  }
  if (input.containerFiles.some((file) => file.kind === "compose")) {
    actions.push("Before starting containers, inspect compose services for required secrets and persistent volumes.");
  }
  if (input.packageScripts.length > 0) {
    actions.push("If package scripts wrap compose, run the repository script rather than direct compose commands when practical.");
  }
  return actions;
}

function adaptHostProbeRunner(workspacePath: string, runner: SetupRecipeCommandRunner) {
  return (input: ContainerRuntimeCommandInvocation): Promise<ContainerRuntimeCommandResult> =>
    runner({ ...input, cwd: workspacePath });
}

function defaultSetupRecipeCommandRunner(input: SetupRecipeCommandInput): Promise<ContainerRuntimeCommandResult> {
  return execFileAsync(input.command, input.args, {
    cwd: input.cwd,
    env: input.env,
    encoding: "utf8",
    timeout: input.timeoutMs,
    maxBuffer: maxOutputBufferBytes,
  }).then(({ stdout, stderr }) => ({
    command: input.command,
    args: input.args,
    stdout: typeof stdout === "string" ? stdout : "",
    stderr: typeof stderr === "string" ? stderr : "",
    exitCode: 0,
    durationMs: 0,
  })).catch((error: Error & { code?: unknown; stdout?: unknown; stderr?: unknown }) => ({
    command: input.command,
    args: input.args,
    stdout: typeof error.stdout === "string" ? error.stdout : "",
    stderr: typeof error.stderr === "string" ? error.stderr : error.message,
    exitCode: typeof error.code === "number" ? error.code : 1,
    durationMs: 0,
    ...(error.code ? { errorCode: String(error.code) } : {}),
  }));
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function parsePortNumber(value: unknown): number | undefined {
  const text = String(value ?? "").trim();
  const first = text.match(/\d+/)?.[0];
  if (!first) return undefined;
  const parsed = Number(first);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : undefined;
}

function composeProjectName(workspacePath: string): string {
  return basename(workspacePath).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function suggestHostPort(port: number, occupied: number[]): number {
  const blocked = new Set(occupied);
  for (let candidate = port + 1; candidate <= Math.min(65535, port + 100); candidate += 1) {
    if (!blocked.has(candidate)) return candidate;
  }
  return port + 1000 <= 65535 ? port + 1000 : port - 1;
}

function firstVersion(text: string): string | undefined {
  return text.match(/\b\d+(?:\.\d+){1,3}\b/)?.[0];
}

function cleanOutput(text: string): string {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 2).join(" ");
}

function firstNonHeaderLine(text: string): string | undefined {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).find((line) => !/^command\b/i.test(line));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
