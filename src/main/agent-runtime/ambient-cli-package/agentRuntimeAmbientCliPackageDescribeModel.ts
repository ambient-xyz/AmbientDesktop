import type { AmbientCliPackageDescription, DescribeAmbientCliPackageInput } from "../agentRuntimeAmbientCliFacade";

export function ambientCliDescribeInput(input: Record<string, unknown>): DescribeAmbientCliPackageInput {
  return {
    ...(optionalString(input.packageId) ? { packageId: optionalString(input.packageId) } : {}),
    ...(optionalString(input.packageName) ? { packageName: optionalString(input.packageName) } : {}),
    ...(optionalString(input.command) ? { command: optionalString(input.command) } : {}),
    ...(optionalBoolean(input.includeSkill) ? { includeSkill: optionalBoolean(input.includeSkill) } : {}),
    ...(optionalBoolean(input.includeSummary) ? { includeSummary: optionalBoolean(input.includeSummary) } : {}),
    ...(optionalNumber(input.maxSkillChars) ? { maxSkillChars: optionalNumber(input.maxSkillChars) } : {}),
  };
}

export function ambientCliDescribeDetails(
  result: AmbientCliPackageDescription,
  generateMissingSummaries: boolean,
): Record<string, unknown> {
  return {
    runtime: "ambient-cli",
    toolName: "ambient_cli_describe",
    packageId: result.package.id,
    packageName: result.package.name,
    commandNames: result.commands.map((command) => command.name),
    skillCount: result.skills.length,
    includedSkillText: result.skills.some((skill) => Boolean(skill.text)),
    generatedSummary: generateMissingSummaries,
    summaryStatuses: result.skills.map((skill) => skill.summaryStatus),
    missingEnv: result.env.filter((env) => env.required && !env.configured).map((env) => env.name),
  };
}

export function ambientCliDescribeText(result: AmbientCliPackageDescription): string {
  const lines: Array<string | undefined> = [
    "Ambient CLI capability description",
    `Package: ${result.package.name}`,
    `Package id: ${result.package.id}`,
    result.package.description ? `Description: ${result.package.description}` : undefined,
    `Availability: ${result.package.availability} - ${result.package.availabilityReason}`,
    result.env.length
      ? `Env: ${result.env.map((env) => `${env.name}=${env.configured ? env.source ?? "configured" : "missing"}`).join(", ")}`
      : "Env: none",
    `Commands: ${result.commands.map((command) => command.name).join(", ") || "none"}`,
  ];
  for (const command of result.commands) {
    lines.push(
      "",
      `Command: ${command.name}`,
      `Capability id: ${command.capabilityId}`,
      command.description ? `Description: ${command.description}` : undefined,
      `Descriptor command: ${[command.command, ...command.descriptorArgs].join(" ")}`,
      `Cwd policy: ${command.cwd}`,
      `Health: ${command.health ?? "unknown"}`,
      `Risk: ${command.risk.join(", ")}`,
      `Invocation: ambient_cli packageName="${command.invocation.packageName}" command="${command.invocation.command}" args=[...]`,
    );
  }
  for (const skill of result.skills) {
    lines.push(
      "",
      `Skill: ${skill.name}`,
      `Capability id: ${skill.capabilityId}`,
      skill.description ? `Description: ${skill.description}` : undefined,
      `Summary: ${skill.summaryStatus}`,
      skill.summary ? `Summary brief: ${skill.summary.capabilityBrief}` : undefined,
      skill.summary?.whenToUse.length ? `When to use: ${skill.summary.whenToUse.join("; ")}` : undefined,
      skill.summary && Object.keys(skill.summary.commands).length
        ? `Summary commands: ${Object.entries(skill.summary.commands).map(([name, value]) => `${name}: ${value}`).join("; ")}`
        : undefined,
      skill.summary?.safety.length ? `Safety: ${skill.summary.safety.join("; ")}` : undefined,
      skill.summaryError ? `Summary diagnostic: ${skill.summaryError}` : undefined,
      skill.summaryRetryAfter ? `Summary retry after: ${skill.summaryRetryAfter}` : undefined,
      skill.text ? `Skill text${skill.truncated ? " (truncated)" : ""}:\n${skill.text}` : undefined,
    );
  }
  lines.push("", "Guidance:", ...result.guidance.map((item) => `- ${item}`));
  if (result.diagnostics.length) lines.push("", "Diagnostics:", ...result.diagnostics.slice(0, 8).map((item) => `- ${item}`));
  return lines.filter(Boolean).join("\n");
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}
