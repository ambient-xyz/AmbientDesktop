import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  detectLocalDeepResearchMachineFacts,
  localDeepResearchMemoryReservation,
  localDeepResearchMemoryTier,
  selectLocalDeepResearchModelProfile,
  type LocalDeepResearchMachineFacts,
  type LocalDeepResearchMemoryReservation,
  type LocalDeepResearchMemoryTier,
  type LocalDeepResearchModelProfileId,
  type LocalDeepResearchModelSelection,
} from "./localDeepResearchModelProfiles";
import {
  detectLocalLlamaResidentProcesses,
  type LocalLlamaResidentProcess,
} from "../localLlamaResidencyPolicy";
import { writeWorkspaceTextFile } from "../workspaceFiles";

const gib = 1024 ** 3;
const telemetryRoot = ".ambient/local-deep-research/memory-telemetry";

export type LocalDeepResearchPhysicalMemoryClass = "16gb" | "32gb" | "64gb" | "128gb-plus" | "unknown";
export type LocalDeepResearchTargetPhysicalMemoryClass = Exclude<LocalDeepResearchPhysicalMemoryClass, "unknown">;
export type LocalDeepResearchMemoryTelemetryStatus = "recorded" | "blocked";
export type LocalDeepResearchMemoryTelemetryCoverageStatus = "complete" | "missing";

export interface LocalDeepResearchMemoryTelemetryResident {
  capability: LocalLlamaResidentProcess["capability"];
  id: string;
  pid: number;
  running: boolean;
  profileId?: string;
  contextTokens?: number;
  estimatedResidentMemoryBytes?: number;
  actualResidentMemoryBytes?: number;
  startedAt?: string;
  lastUsedAt?: string;
}

export interface LocalDeepResearchMemoryTelemetryResult {
  schemaVersion: "ambient-local-deep-research-memory-telemetry-v1";
  capturedAt: string;
  status: LocalDeepResearchMemoryTelemetryStatus;
  currentHost: {
    platform: string;
    arch: string;
    memoryBytes?: number;
    availableMemoryBytes?: number;
    memoryPressure: LocalDeepResearchMachineFacts["memoryPressure"];
    memoryTier: LocalDeepResearchMemoryTier;
    physicalMemoryClass: LocalDeepResearchPhysicalMemoryClass;
    activeLocalModelCount: number;
    activeLocalModelEstimatedResidentMemoryBytes: number;
    activeLocalModelActualResidentMemoryBytes?: number;
  };
  selectedProfileId: LocalDeepResearchModelProfileId;
  fallbackProfileId?: LocalDeepResearchModelProfileId;
  contextTokens: number;
  q8OverrideDecision: LocalDeepResearchModelSelection["q8OverrideDecision"];
  warnings: string[];
  blockers: string[];
  rationale: string[];
  reservation: LocalDeepResearchMemoryReservation;
  activeResidents: LocalDeepResearchMemoryTelemetryResident[];
  coverage: {
    targetPhysicalMemoryClasses: LocalDeepResearchTargetPhysicalMemoryClass[];
    observedPhysicalMemoryClasses: LocalDeepResearchTargetPhysicalMemoryClass[];
    missingPhysicalMemoryClasses: LocalDeepResearchTargetPhysicalMemoryClass[];
  };
  artifactPath: string;
  markdownPath: string;
}

export interface LocalDeepResearchMemoryTelemetryCoverageObservation {
  physicalMemoryClass: LocalDeepResearchTargetPhysicalMemoryClass;
  capturedAt: string;
  status: LocalDeepResearchMemoryTelemetryStatus;
  platform: string;
  arch: string;
  memoryBytes?: number;
  availableMemoryBytes?: number;
  memoryTier: LocalDeepResearchMemoryTier;
  selectedProfileId: LocalDeepResearchModelProfileId;
  contextTokens: number;
  q8OverrideDecision: LocalDeepResearchModelSelection["q8OverrideDecision"];
  reservationStatus: LocalDeepResearchMemoryReservation["status"];
  artifactPath: string;
}

export interface LocalDeepResearchMemoryTelemetryCoverageResult {
  schemaVersion: "ambient-local-deep-research-memory-telemetry-coverage-v1";
  checkedAt: string;
  status: LocalDeepResearchMemoryTelemetryCoverageStatus;
  targetPhysicalMemoryClasses: LocalDeepResearchTargetPhysicalMemoryClass[];
  observedPhysicalMemoryClasses: LocalDeepResearchTargetPhysicalMemoryClass[];
  missingPhysicalMemoryClasses: LocalDeepResearchTargetPhysicalMemoryClass[];
  observations: LocalDeepResearchMemoryTelemetryCoverageObservation[];
  ignoredArtifactPaths: string[];
  artifactPath: string;
  markdownPath: string;
}

export async function runLocalDeepResearchMemoryTelemetry(input: {
  workspacePath: string;
  machineFacts?: Partial<LocalDeepResearchMachineFacts>;
  q8Override?: boolean;
  residentProcesses?: LocalLlamaResidentProcess[];
  now?: () => Date;
}): Promise<LocalDeepResearchMemoryTelemetryResult> {
  const capturedAt = (input.now ?? (() => new Date()))().toISOString();
  const residents = input.residentProcesses ?? await detectLocalLlamaResidentProcesses(input.workspacePath).catch(() => []);
  const residentCount = residents.filter((resident) => resident.running).length;
  const residentBytes = residents.reduce((sum, resident) => sum + Math.max(0, resident.estimatedResidentMemoryBytes ?? 0), 0);
  const residentActualBytes = sumDefined(residents.map((resident) => resident.actualResidentMemoryBytes));
  const machineFacts = detectLocalDeepResearchMachineFacts({
    ...input.machineFacts,
    activeLocalModelCount: input.machineFacts?.activeLocalModelCount ?? residentCount,
    activeLocalModelEstimatedResidentMemoryBytes: input.machineFacts?.activeLocalModelEstimatedResidentMemoryBytes ?? residentBytes,
  });
  const selection = selectLocalDeepResearchModelProfile({
    q8Override: input.q8Override,
    machineFacts,
  });
  const physicalMemoryClass = localDeepResearchPhysicalMemoryClass(machineFacts.memoryBytes);
  const observedPhysicalMemoryClasses: LocalDeepResearchTargetPhysicalMemoryClass[] = physicalMemoryClass === "unknown" ? [] : [physicalMemoryClass];
  const reservation = localDeepResearchMemoryReservation({
    memoryBytes: machineFacts.memoryBytes,
    availableMemoryBytes: machineFacts.availableMemoryBytes,
    activeLocalModelEstimatedResidentMemoryBytes: machineFacts.activeLocalModelEstimatedResidentMemoryBytes,
    memoryTier: selection.memoryTier,
    profile: selection.profile,
    contextMode: selection.contextMode,
  });
  const pending = {
    schemaVersion: "ambient-local-deep-research-memory-telemetry-v1" as const,
    capturedAt,
    status: selection.blockers.length ? "blocked" as const : "recorded" as const,
    currentHost: {
      platform: machineFacts.platform,
      arch: machineFacts.arch,
      ...(machineFacts.memoryBytes !== undefined ? { memoryBytes: machineFacts.memoryBytes } : {}),
      ...(machineFacts.availableMemoryBytes !== undefined ? { availableMemoryBytes: machineFacts.availableMemoryBytes } : {}),
      memoryPressure: machineFacts.memoryPressure,
      memoryTier: localDeepResearchMemoryTier(machineFacts.memoryBytes),
      physicalMemoryClass,
      activeLocalModelCount: machineFacts.activeLocalModelCount,
      activeLocalModelEstimatedResidentMemoryBytes: machineFacts.activeLocalModelEstimatedResidentMemoryBytes,
      ...(residentActualBytes !== undefined ? { activeLocalModelActualResidentMemoryBytes: residentActualBytes } : {}),
    },
    selectedProfileId: selection.profile.id,
    ...(selection.fallbackProfile ? { fallbackProfileId: selection.fallbackProfile.id } : {}),
    contextTokens: selection.contextTokens,
    q8OverrideDecision: selection.q8OverrideDecision,
    warnings: selection.warnings,
    blockers: selection.blockers,
    rationale: selection.rationale,
    reservation,
    activeResidents: residents.map(memoryTelemetryResident),
    coverage: {
      targetPhysicalMemoryClasses: targetPhysicalMemoryClasses(),
      observedPhysicalMemoryClasses,
      missingPhysicalMemoryClasses: targetPhysicalMemoryClasses().filter((target) => !observedPhysicalMemoryClasses.includes(target)),
    },
  };
  const basePath = `${telemetryRoot}/${capturedAt.replace(/[:.]/g, "-")}-${pending.currentHost.physicalMemoryClass}-${pending.status}`;
  const json = await writeWorkspaceTextFile(input.workspacePath, `${basePath}.json`, `${JSON.stringify(pending, null, 2)}\n`);
  const markdown = await writeWorkspaceTextFile(input.workspacePath, `${basePath}.md`, localDeepResearchMemoryTelemetryMarkdown(pending));
  return {
    ...pending,
    artifactPath: json.path,
    markdownPath: markdown.path,
  };
}

export async function runLocalDeepResearchMemoryTelemetryCoverage(input: {
  workspacePath: string;
  now?: () => Date;
}): Promise<LocalDeepResearchMemoryTelemetryCoverageResult> {
  const checkedAt = (input.now ?? (() => new Date()))().toISOString();
  const { observations, ignoredArtifactPaths } = await readMemoryTelemetryObservations(input.workspacePath);
  const latestByClass = new Map<LocalDeepResearchTargetPhysicalMemoryClass, LocalDeepResearchMemoryTelemetryCoverageObservation>();
  for (const observation of observations) {
    if (observation.status !== "recorded") {
      ignoredArtifactPaths.push(observation.artifactPath);
      continue;
    }
    const previous = latestByClass.get(observation.physicalMemoryClass);
    if (!previous || observation.capturedAt > previous.capturedAt) latestByClass.set(observation.physicalMemoryClass, observation);
  }
  const targetClasses = targetPhysicalMemoryClasses();
  const selectedObservations = targetClasses
    .map((target) => latestByClass.get(target))
    .filter((observation): observation is LocalDeepResearchMemoryTelemetryCoverageObservation => Boolean(observation));
  const observedPhysicalMemoryClasses = selectedObservations.map((observation) => observation.physicalMemoryClass);
  const missingPhysicalMemoryClasses = targetClasses.filter((target) => !latestByClass.has(target));
  const pending = {
    schemaVersion: "ambient-local-deep-research-memory-telemetry-coverage-v1" as const,
    checkedAt,
    status: missingPhysicalMemoryClasses.length ? "missing" as const : "complete" as const,
    targetPhysicalMemoryClasses: targetClasses,
    observedPhysicalMemoryClasses,
    missingPhysicalMemoryClasses,
    observations: selectedObservations,
    ignoredArtifactPaths: [...new Set(ignoredArtifactPaths)].sort(),
  };
  const basePath = `${telemetryRoot}/coverage/${checkedAt.replace(/[:.]/g, "-")}-${pending.status}`;
  const json = await writeWorkspaceTextFile(input.workspacePath, `${basePath}.json`, `${JSON.stringify(pending, null, 2)}\n`);
  const markdown = await writeWorkspaceTextFile(input.workspacePath, `${basePath}.md`, localDeepResearchMemoryTelemetryCoverageMarkdown(pending));
  return {
    ...pending,
    artifactPath: json.path,
    markdownPath: markdown.path,
  };
}

export function localDeepResearchPhysicalMemoryClass(memoryBytes: number | undefined): LocalDeepResearchPhysicalMemoryClass {
  if (!memoryBytes || !Number.isFinite(memoryBytes) || memoryBytes <= 0) return "unknown";
  if (memoryBytes < 24 * gib) return "16gb";
  if (memoryBytes < 64 * gib) return "32gb";
  if (memoryBytes < 96 * gib) return "64gb";
  return "128gb-plus";
}

export function targetPhysicalMemoryClasses(): LocalDeepResearchTargetPhysicalMemoryClass[] {
  return ["16gb", "32gb", "64gb", "128gb-plus"];
}

function memoryTelemetryResident(resident: LocalLlamaResidentProcess): LocalDeepResearchMemoryTelemetryResident {
  return {
    capability: resident.capability,
    id: resident.id,
    pid: resident.pid,
    running: resident.running,
    ...(resident.profileId ? { profileId: resident.profileId } : {}),
    ...(resident.contextTokens ? { contextTokens: resident.contextTokens } : {}),
    ...(resident.estimatedResidentMemoryBytes !== undefined ? { estimatedResidentMemoryBytes: resident.estimatedResidentMemoryBytes } : {}),
    ...(resident.actualResidentMemoryBytes !== undefined ? { actualResidentMemoryBytes: resident.actualResidentMemoryBytes } : {}),
    ...(resident.startedAt ? { startedAt: resident.startedAt } : {}),
    ...(resident.lastUsedAt ? { lastUsedAt: resident.lastUsedAt } : {}),
  };
}

function localDeepResearchMemoryTelemetryMarkdown(
  result: Omit<LocalDeepResearchMemoryTelemetryResult, "artifactPath" | "markdownPath">,
): string {
  return [
    "# Local Deep Research Memory Telemetry",
    "",
    `Captured: ${result.capturedAt}`,
    `Status: ${result.status}`,
    `Host: ${result.currentHost.platform}/${result.currentHost.arch}, ${formatGiB(result.currentHost.memoryBytes)} GiB total, ${formatGiB(result.currentHost.availableMemoryBytes)} GiB available`,
    `Class: ${result.currentHost.physicalMemoryClass}; tier: ${result.currentHost.memoryTier}; pressure: ${result.currentHost.memoryPressure}`,
    `Active local models: ${result.currentHost.activeLocalModelCount}; estimated resident memory: ${formatGiB(result.currentHost.activeLocalModelEstimatedResidentMemoryBytes)} GiB${result.currentHost.activeLocalModelActualResidentMemoryBytes !== undefined ? `; actual sampled resident memory: ${formatGiB(result.currentHost.activeLocalModelActualResidentMemoryBytes)} GiB` : ""}`,
    `Selected: ${result.selectedProfileId}, ${result.contextTokens} context tokens, Q8 override ${result.q8OverrideDecision}`,
    `Reservation: ${result.reservation.status}; ${result.reservation.reason}`,
    `Observed classes: ${result.coverage.observedPhysicalMemoryClasses.join(", ") || "none"}`,
    `Missing classes: ${result.coverage.missingPhysicalMemoryClasses.join(", ") || "none"}`,
    "",
    "## Rationale",
    "",
    ...result.rationale.map((item) => `- ${item}`),
    "",
    "## Warnings",
    "",
    ...(result.warnings.length ? result.warnings.map((item) => `- ${item}`) : ["- none"]),
    "",
    "## Blockers",
    "",
    ...(result.blockers.length ? result.blockers.map((item) => `- ${item}`) : ["- none"]),
    "",
    "## Active Residents",
    "",
    result.activeResidents.length ? "| Capability | PID | Running | Profile | Context | Estimated GiB | Actual GiB |" : "None.",
    ...(result.activeResidents.length
      ? [
          "| --- | ---: | --- | --- | ---: | ---: | ---: |",
          ...result.activeResidents.map((resident) => `| ${resident.capability} | ${resident.pid} | ${resident.running ? "yes" : "no"} | ${resident.profileId ?? "n/a"} | ${resident.contextTokens ?? "n/a"} | ${formatGiB(resident.estimatedResidentMemoryBytes)} | ${formatGiB(resident.actualResidentMemoryBytes)} |`),
        ]
      : []),
    "",
  ].join("\n");
}

async function readMemoryTelemetryObservations(workspacePath: string): Promise<{
  observations: LocalDeepResearchMemoryTelemetryCoverageObservation[];
  ignoredArtifactPaths: string[];
}> {
  const root = join(workspacePath, telemetryRoot);
  const entries = await readdir(root, { withFileTypes: true }).catch((error: unknown) => {
    if (isErrno(error, "ENOENT")) return [];
    throw error;
  });
  const observations: LocalDeepResearchMemoryTelemetryCoverageObservation[] = [];
  const ignoredArtifactPaths: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const relativePath = `${telemetryRoot}/${entry.name}`;
    const raw = await readFile(join(root, entry.name), "utf8").catch((error: unknown) => {
      if (isErrno(error, "ENOENT")) return undefined;
      throw error;
    });
    if (!raw) {
      ignoredArtifactPaths.push(relativePath);
      continue;
    }
    const observation = memoryTelemetryCoverageObservationFromJson(raw, relativePath);
    if (observation) observations.push(observation);
    else ignoredArtifactPaths.push(relativePath);
  }
  return { observations, ignoredArtifactPaths };
}

function memoryTelemetryCoverageObservationFromJson(
  raw: string,
  artifactPath: string,
): LocalDeepResearchMemoryTelemetryCoverageObservation | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
  const record = parsed as Record<string, unknown>;
  if (record.schemaVersion !== "ambient-local-deep-research-memory-telemetry-v1") return undefined;
  const currentHost = objectRecord(record.currentHost);
  const reservation = objectRecord(record.reservation);
  const physicalMemoryClass = targetPhysicalMemoryClassValue(currentHost?.physicalMemoryClass);
  const capturedAt = stringValue(record.capturedAt);
  const status = memoryTelemetryStatusValue(record.status);
  const platform = stringValue(currentHost?.platform);
  const arch = stringValue(currentHost?.arch);
  const memoryTier = memoryTierValue(currentHost?.memoryTier);
  const selectedProfileId = modelProfileIdValue(record.selectedProfileId);
  const contextTokens = contextTokensValue(record.contextTokens);
  const q8OverrideDecision = q8OverrideDecisionValue(record.q8OverrideDecision);
  const reservationStatus = reservationStatusValue(reservation?.status);
  if (!physicalMemoryClass || !capturedAt || !status || !platform || !arch || !memoryTier || !selectedProfileId || !contextTokens || !q8OverrideDecision || !reservationStatus) {
    return undefined;
  }
  return {
    physicalMemoryClass,
    capturedAt,
    status,
    platform,
    arch,
    ...(numberValue(currentHost?.memoryBytes) !== undefined ? { memoryBytes: numberValue(currentHost?.memoryBytes) } : {}),
    ...(numberValue(currentHost?.availableMemoryBytes) !== undefined ? { availableMemoryBytes: numberValue(currentHost?.availableMemoryBytes) } : {}),
    memoryTier,
    selectedProfileId,
    contextTokens,
    q8OverrideDecision,
    reservationStatus,
    artifactPath,
  };
}

function localDeepResearchMemoryTelemetryCoverageMarkdown(
  result: Omit<LocalDeepResearchMemoryTelemetryCoverageResult, "artifactPath" | "markdownPath">,
): string {
  return [
    "# Local Deep Research Memory Telemetry Coverage",
    "",
    `Checked: ${result.checkedAt}`,
    `Status: ${result.status}`,
    `Observed classes: ${result.observedPhysicalMemoryClasses.join(", ") || "none"}`,
    `Missing classes: ${result.missingPhysicalMemoryClasses.join(", ") || "none"}`,
    "",
    "| Class | Captured | Host | Selected | Reservation | Artifact |",
    "| --- | --- | --- | --- | --- | --- |",
    ...result.observations.map((observation) => `| ${observation.physicalMemoryClass} | ${observation.capturedAt} | ${observation.platform}/${observation.arch} ${formatGiB(observation.memoryBytes)} GiB | ${observation.selectedProfileId} / ${observation.contextTokens} | ${observation.reservationStatus} | ${observation.artifactPath} |`),
    "",
    "## Ignored Artifacts",
    "",
    ...(result.ignoredArtifactPaths.length ? result.ignoredArtifactPaths.map((path) => `- ${path}`) : ["- none"]),
    "",
  ].join("\n");
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function targetPhysicalMemoryClassValue(value: unknown): LocalDeepResearchTargetPhysicalMemoryClass | undefined {
  return targetPhysicalMemoryClasses().includes(value as never) ? value as LocalDeepResearchTargetPhysicalMemoryClass : undefined;
}

function memoryTelemetryStatusValue(value: unknown): LocalDeepResearchMemoryTelemetryStatus | undefined {
  return value === "recorded" || value === "blocked" ? value : undefined;
}

function memoryTierValue(value: unknown): LocalDeepResearchMemoryTier | undefined {
  return value === "unknown" || value === "constrained" || value === "standard" || value === "high" || value === "workstation" ? value : undefined;
}

function modelProfileIdValue(value: unknown): LocalDeepResearchModelProfileId | undefined {
  return value === "literesearcher-4b-q4-k-m" || value === "literesearcher-4b-q8-0" ? value : undefined;
}

function contextTokensValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}

function q8OverrideDecisionValue(value: unknown): LocalDeepResearchModelSelection["q8OverrideDecision"] | undefined {
  return value === "not-requested" || value === "accepted" || value === "warned" || value === "rejected" ? value : undefined;
}

function reservationStatusValue(value: unknown): LocalDeepResearchMemoryReservation["status"] | undefined {
  return value === "passed" || value === "failed" ? value : undefined;
}

function formatGiB(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes)) return "unknown";
  return (bytes / gib).toFixed(1);
}

function sumDefined(values: Array<number | undefined>): number | undefined {
  let sum = 0;
  let seen = false;
  for (const value of values) {
    if (value === undefined || !Number.isFinite(value)) continue;
    seen = true;
    sum += Math.max(0, value);
  }
  return seen ? sum : undefined;
}

function isErrno(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as NodeJS.ErrnoException).code === code);
}
