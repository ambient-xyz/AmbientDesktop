import type { AmbientCliCapabilitySearchInput, AmbientCliCapabilitySearchResponse } from "../agentRuntimeAmbientCliFacade";

export function ambientCliSearchInput(input: Record<string, unknown>): AmbientCliCapabilitySearchInput {
  const kind = optionalString(input.kind);
  if (kind && !["any", "package", "skill", "command"].includes(kind)) throw new Error(`Unsupported Ambient CLI search kind: ${kind}`);
  return {
    ...(optionalString(input.query) ? { query: optionalString(input.query) } : {}),
    ...(optionalNumber(input.limit) ? { limit: optionalNumber(input.limit) } : {}),
    ...(optionalBoolean(input.includeUnavailable) ? { includeUnavailable: optionalBoolean(input.includeUnavailable) } : {}),
    ...(kind ? { kind: kind as AmbientCliCapabilitySearchInput["kind"] } : {}),
    ...(optionalString(input.packageName) ? { packageName: optionalString(input.packageName) } : {}),
    ...(optionalString(input.command) ? { command: optionalString(input.command) } : {}),
  };
}

export function ambientCliSearchDetails(input: {
  searchInput: AmbientCliCapabilitySearchInput;
  result: AmbientCliCapabilitySearchResponse;
}): Record<string, unknown> {
  return {
    runtime: "ambient-cli",
    toolName: "ambient_cli_search",
    query: input.searchInput.query,
    resultCount: input.result.results.length,
    truncated: input.result.truncated,
    packageIds: input.result.results.map((item) => item.packageId),
    catalogVersion: input.result.catalogVersion,
  };
}

export function ambientCliSearchText(result: AmbientCliCapabilitySearchResponse): string {
  const lines: Array<string | undefined> = [
    "Ambient CLI capability search",
    `Catalog: ${result.catalogVersion}`,
    `Results: ${result.results.length}${result.truncated ? " (truncated)" : ""}`,
  ];
  for (const item of result.results) {
    lines.push(
      "",
      `Package: ${item.packageName}`,
      `Package id: ${item.packageId}`,
      `Registry plugin id: ${item.registryPluginId}`,
      item.description ? `Description: ${item.description}` : undefined,
      `Availability: ${item.availability} - ${item.availabilityReason}`,
      item.commands.length
        ? `Commands: ${item.commands.map((command) => `${command.name} [${command.capabilityId}] (${[ambientCliSearchHealthText(command.health), command.description].filter(Boolean).join("; ")})`).join("; ")}`
        : "Commands: none in this result",
      item.skills.length
        ? `Skills: ${item.skills.map((skill) => `${skill.name} [${skill.capabilityId}]${skill.description ? ` (${skill.description})` : ""}`).join("; ")}`
        : "Skills: none in this result",
      item.missingEnv.length ? `Missing env: ${item.missingEnv.join(", ")}` : "Missing env: none",
      item.whyMatched.length ? `Why matched: ${item.whyMatched.join(", ")}` : undefined,
      "Next: call ambient_cli_describe with the exact packageName and command before execution. If you call ambient_cli first, Ambient Desktop will return a no-execute preflight description; read it and retry ambient_cli only if execution is still appropriate.",
    );
  }
  if (result.results.length === 0) lines.push("No installed Ambient CLI packages matched. This search does not inspect uninstalled marketplaces.");
  return lines.filter(Boolean).join("\n");
}

function ambientCliSearchHealthText(health: "passed" | "failed" | "unknown" | undefined): string {
  if (health === "passed") return "health passed";
  if (health === "failed") return "health failed";
  return "health not run";
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
