import type { WorkspaceState } from "../../../shared/workspaceTypes";
import type {
  AmbientCliPackageCommand,
  AmbientCliPackageDescription,
  AmbientCliPackageSummary,
  AmbientCliRunResult,
  RunAmbientCliInput,
} from "../agentRuntimeAmbientCliFacade";
import { ambientCliDescribeText } from "./agentRuntimeAmbientCliPackageDescribeModel";
import { materializedTextNotice } from "../agentRuntimeToolRuntimeFacade";

export function ambientCliRunInput(input: Record<string, unknown>): RunAmbientCliInput {
  const packageId = optionalString(input.packageId);
  const packageName = optionalString(input.packageName);
  const command = requiredString(input, "command");
  const args = optionalStringArray(input.args);
  const cwd = optionalString(input.cwd);
  return {
    ...(packageId ? { packageId } : {}),
    ...(packageName ? { packageName } : {}),
    command,
    ...(args !== undefined ? { args } : {}),
    ...(cwd ? { cwd } : {}),
  };
}

export function ambientCliRunApprovalDetail(input: {
  workspace: WorkspaceState;
  pkg: AmbientCliPackageSummary;
  commandName: string;
  args: string[] | undefined;
  cwd: string | undefined;
}): string {
  const command = input.pkg.commands.find((item) => item.name === input.commandName);
  return [
    `Workspace: ${input.workspace.path}`,
    `Package: ${input.pkg.name}`,
    `Package id: ${input.pkg.id}`,
    `Package root: ${input.pkg.rootPath}`,
    `Command name: ${input.commandName}`,
    command ? `Executable: ${command.command}` : undefined,
    command?.args.length ? `Descriptor args: ${command.args.join(" ")}` : undefined,
    input.args?.length ? `Call args: ${input.args.join(" ")}` : undefined,
    `Cwd policy: ${command?.cwd ?? "unknown"}`,
    input.cwd ? `Requested cwd: ${input.cwd}` : undefined,
    input.pkg.envRequirements.length ? `Env requirements: ${input.pkg.envRequirements.map((env) => env.name).join(", ")}` : "Env requirements: none",
  ]
    .filter(Boolean)
    .join("\n");
}

export function ambientCliRunGrantIdentity(input: {
  pkg: AmbientCliPackageSummary;
  commandName: string;
  registeredCommand: AmbientCliPackageCommand;
  cwd: string | undefined;
}): string {
  return [
    "ambient_cli",
    input.pkg.id,
    input.commandName,
    input.registeredCommand.command,
    input.registeredCommand.args.join("\0"),
    input.registeredCommand.cwd,
    input.cwd ?? "",
  ].join("\0");
}

export function ambientCliRunText(result: AmbientCliRunResult): string {
  return [
    "Ambient CLI completed",
    `Package: ${result.packageName}`,
    `Command: ${result.commandName}`,
    `Cwd: ${result.cwd}`,
    `Duration: ${result.durationMs}ms`,
    result.stdout ? `Stdout:\n${result.stdout}` : "Stdout: <empty>",
    result.stdoutOutput ? materializedTextNotice("stdout", result.stdoutOutput) : undefined,
    result.stderr ? `Stderr:\n${result.stderr}` : undefined,
    result.stderrOutput ? materializedTextNotice("stderr", result.stderrOutput) : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

export function ambientCliPreflightDescribeText(result: AmbientCliPackageDescription): string {
  return [
    "Ambient CLI preflight description",
    "Execution not run: this package had not been described yet in this thread.",
    ambientCliDescribeText(result),
    "",
    "Next: if this command is still appropriate, retry ambient_cli with the same packageName, command, and args to execute it.",
  ].join("\n");
}

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required.`);
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error("Expected an array of strings.");
  return value.map((item) => {
    if (typeof item !== "string") throw new Error("Expected an array of strings.");
    return item;
  });
}
