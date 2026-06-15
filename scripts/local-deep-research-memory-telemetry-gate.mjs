#!/usr/bin/env node
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { arch as hostArch, freemem, platform as hostPlatform, totalmem } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const gib = 1024 ** 3;
const telemetryRoot = ".ambient/local-deep-research/memory-telemetry";
const localDeepResearchServerRoot = ".ambient/local-deep-research/server";
const miniCpmServerStatePath = ".ambient/vision/minicpm-v/state/server-state.json";
const targetPhysicalMemoryClasses = ["16gb", "32gb", "64gb", "128gb-plus"];
const telemetrySchemaVersion = "ambient-local-deep-research-memory-telemetry-v1";
const coverageSchemaVersion = "ambient-local-deep-research-memory-telemetry-coverage-v1";
const localModelProfiles = {
  q4: {
    id: "literesearcher-4b-q4-k-m",
    displayName: "LiteResearcher-4B Q4_K_M",
    safeContextTokens: 8192,
    estimatedResidentMemoryBytes: {
      safe8k: 5 * gib,
      target16k: 7 * gib,
    },
  },
  q8: {
    id: "literesearcher-4b-q8-0",
    displayName: "LiteResearcher-4B Q8_0",
    safeContextTokens: 8192,
    estimatedResidentMemoryBytes: {
      safe8k: 7 * gib,
      target16k: 10 * gib,
    },
  },
};

export function parseLocalDeepResearchMemoryTelemetryGateArgs(argv) {
  const options = {
    workspacePath: process.cwd(),
    collectCurrent: false,
    coverage: false,
    requireComplete: false,
    allowEstimates: false,
    importArtifactPaths: [],
    exportBundlePath: undefined,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--collect-current") {
      options.collectCurrent = true;
    } else if (arg === "--coverage") {
      options.coverage = true;
    } else if (arg === "--allow-estimates") {
      options.allowEstimates = true;
      options.coverage = true;
    } else if (arg === "--import-artifacts") {
      const value = argv[index + 1];
      if (!value) throw new Error("--import-artifacts requires a file or directory path.");
      options.importArtifactPaths.push(value);
      index += 1;
    } else if (arg.startsWith("--import-artifacts=")) {
      const value = arg.slice("--import-artifacts=".length);
      if (!value) throw new Error("--import-artifacts requires a file or directory path.");
      options.importArtifactPaths.push(value);
    } else if (arg === "--export-bundle") {
      const value = argv[index + 1];
      if (!value) throw new Error("--export-bundle requires an output directory path.");
      options.exportBundlePath = value;
      index += 1;
    } else if (arg.startsWith("--export-bundle=")) {
      const value = arg.slice("--export-bundle=".length);
      if (!value) throw new Error("--export-bundle requires an output directory path.");
      options.exportBundlePath = value;
    } else if (arg === "--require-complete") {
      options.requireComplete = true;
      options.coverage = true;
    } else if (arg === "--workspace") {
      const value = argv[index + 1];
      if (!value) throw new Error("--workspace requires a path.");
      options.workspacePath = value;
      index += 1;
    } else if (arg.startsWith("--workspace=")) {
      options.workspacePath = arg.slice("--workspace=".length);
    } else {
      throw new Error(`Unknown Local Deep Research memory telemetry gate argument: ${arg}`);
    }
  }
  if (!options.collectCurrent && !options.coverage && !options.help && options.importArtifactPaths.length === 0 && !options.exportBundlePath) options.coverage = true;
  return options;
}

export async function runLocalDeepResearchMemoryTelemetryGate(input = {}) {
  const workspacePath = resolve(input.workspacePath ?? process.cwd());
  const now = input.now ?? (() => new Date());
  const imported = input.importArtifactPaths?.length
    ? await importMemoryTelemetryArtifacts({
        workspacePath,
        artifactPaths: input.importArtifactPaths,
      })
    : undefined;
  let collection;
  if (input.collectCurrent) {
    collection = await collectCurrentHostTelemetry({
      workspacePath,
      capturedAt: now().toISOString(),
      hostFacts: input.hostFacts,
      residentProcesses: input.residentProcesses,
    });
  }
  const coverage = input.coverage || input.requireComplete
    ? await writeMemoryTelemetryCoverageReport({
        workspacePath,
        checkedAt: now().toISOString(),
        allowEstimates: Boolean(input.allowEstimates),
      })
    : undefined;
  const exported = input.exportBundlePath
    ? await exportMemoryTelemetryBundle({
        workspacePath,
        outputPath: input.exportBundlePath,
        createdAt: now().toISOString(),
      })
    : undefined;
  const exitCode = input.requireComplete && coverage?.status !== "complete" ? 1 : 0;
  return {
    status: exitCode === 0 ? "passed" : "failed",
    exitCode,
    workspacePath,
    ...(imported ? { imported } : {}),
    ...(collection ? { collection } : {}),
    ...(coverage ? { coverage } : {}),
    ...(exported ? { exported } : {}),
  };
}

export async function exportMemoryTelemetryBundle(input) {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const outputPath = resolve(input.outputPath);
  const observations = await readMemoryTelemetryObservations(input.workspacePath);
  const latestByClass = new Map();
  for (const observation of observations) {
    if (observation.status !== "recorded" || observation.provenance !== "physical-host") continue;
    const previous = latestByClass.get(observation.physicalMemoryClass);
    if (!previous || observation.capturedAt > previous.capturedAt) {
      latestByClass.set(observation.physicalMemoryClass, observation);
    }
  }
  await mkdir(outputPath, { recursive: true });
  const exported = [];
  for (const physicalMemoryClass of targetPhysicalMemoryClasses) {
    const observation = latestByClass.get(physicalMemoryClass);
    if (!observation) continue;
    const sourcePath = join(input.workspacePath, observation.artifactPath);
    const raw = await readFile(sourcePath, "utf8").catch((error) => {
      if (error?.code === "ENOENT") return undefined;
      throw error;
    });
    const artifact = raw
      ? sanitizedMemoryTelemetryArtifactFromJson(raw, observation.artifactPath, `Exported from validated physical-host telemetry artifact ${basename(observation.artifactPath)}.`)
      : undefined;
    if (!artifact || artifact.status !== "recorded") continue;
    const baseName = `${artifact.capturedAt.replace(/[:.]/g, "-")}-${artifact.currentHost.physicalMemoryClass}-recorded`;
    const jsonFile = `${baseName}.json`;
    const markdownFile = `${baseName}.md`;
    await writeFile(join(outputPath, jsonFile), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    await writeFile(join(outputPath, markdownFile), renderMemoryTelemetryMarkdown(artifact), "utf8");
    exported.push({
      physicalMemoryClass: artifact.currentHost.physicalMemoryClass,
      capturedAt: artifact.capturedAt,
      status: artifact.status,
      selectedProfileId: artifact.selectedProfileId,
      contextTokens: artifact.contextTokens,
      sourceArtifactPath: observation.artifactPath,
      jsonFile,
      markdownFile,
    });
  }
  const exportedPhysicalMemoryClasses = exported.map((artifact) => artifact.physicalMemoryClass);
  const manifest = {
    schemaVersion: "ambient-local-deep-research-memory-telemetry-bundle-v1",
    createdAt,
    targetPhysicalMemoryClasses,
    exportedPhysicalMemoryClasses,
    missingPhysicalMemoryClasses: targetPhysicalMemoryClasses.filter((memoryClass) => !exportedPhysicalMemoryClasses.includes(memoryClass)),
    observations: exported,
    importCommand: "node scripts/local-deep-research-memory-telemetry-gate.mjs --import-artifacts /path/to/telemetry-bundle --coverage --require-complete",
  };
  await writeFile(join(outputPath, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(join(outputPath, "README.md"), renderMemoryTelemetryBundleReadme(manifest), "utf8");
  return {
    status: exported.length ? "exported" : "empty",
    outputPath,
    exportedCount: exported.length,
    exportedPhysicalMemoryClasses,
    missingPhysicalMemoryClasses: manifest.missingPhysicalMemoryClasses,
    manifestPath: join(outputPath, "manifest.json"),
    readmePath: join(outputPath, "README.md"),
    exported,
  };
}

export async function importMemoryTelemetryArtifacts(input) {
  const files = await memoryTelemetryImportFiles(input.artifactPaths);
  const imported = [];
  const skipped = [];
  for (const file of files) {
    const raw = await readFile(file, "utf8").catch((error) => {
      if (error?.code === "ENOENT") return undefined;
      throw error;
    });
    const artifact = raw ? sanitizedMemoryTelemetryArtifactFromJson(raw, file, `Imported from validated physical-host telemetry artifact ${basename(file)}.`) : undefined;
    if (!artifact) {
      skipped.push({ source: basename(file), reason: "not-valid-memory-telemetry" });
      continue;
    }
    const basePath = `${telemetryRoot}/${artifact.capturedAt.replace(/[:.]/g, "-")}-${artifact.currentHost.physicalMemoryClass}-imported-${artifact.status}`;
    const jsonPath = `${basePath}.json`;
    const markdownPath = `${basePath}.md`;
    await writeWorkspaceText(input.workspacePath, jsonPath, `${JSON.stringify(artifact, null, 2)}\n`);
    await writeWorkspaceText(input.workspacePath, markdownPath, renderMemoryTelemetryMarkdown(artifact));
    imported.push({
      source: basename(file),
      physicalMemoryClass: artifact.currentHost.physicalMemoryClass,
      capturedAt: artifact.capturedAt,
      status: artifact.status,
      artifactPath: jsonPath,
      markdownPath,
    });
  }
  return {
    status: imported.length ? "imported" : "empty",
    importedCount: imported.length,
    skippedCount: skipped.length,
    imported,
    skipped,
  };
}

async function memoryTelemetryImportFiles(artifactPaths) {
  const files = [];
  const visit = async (rawPath) => {
    const absolutePath = resolve(rawPath);
    const info = await stat(absolutePath).catch((error) => {
      if (error?.code === "ENOENT") return undefined;
      throw error;
    });
    if (!info) return;
    if (info.isFile()) {
      if (absolutePath.endsWith(".json")) files.push(absolutePath);
      return;
    }
    if (!info.isDirectory()) return;
    const entries = await readdir(absolutePath, { withFileTypes: true });
    for (const entry of entries) {
      await visit(join(absolutePath, entry.name));
    }
  };
  for (const artifactPath of artifactPaths ?? []) await visit(artifactPath);
  return [...new Set(files)].sort();
}

export async function collectCurrentHostTelemetry(input) {
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  const residentProcesses = input.residentProcesses ?? await detectResidentProcesses(input.workspacePath).catch(() => []);
  const runningResidents = residentProcesses.filter((resident) => resident.running);
  const activeLocalModelEstimatedResidentMemoryBytes = runningResidents.reduce((sum, resident) => sum + Math.max(0, resident.estimatedResidentMemoryBytes ?? 0), 0);
  const machineFacts = detectMachineFacts({
    ...input.hostFacts,
    activeLocalModelCount: input.hostFacts?.activeLocalModelCount ?? runningResidents.length,
    activeLocalModelEstimatedResidentMemoryBytes: input.hostFacts?.activeLocalModelEstimatedResidentMemoryBytes ?? activeLocalModelEstimatedResidentMemoryBytes,
  });
  const selection = selectModelProfile(machineFacts);
  const physicalMemoryClass = physicalMemoryClassForMemory(machineFacts.memoryBytes);
  const observedPhysicalMemoryClasses = physicalMemoryClass === "unknown" ? [] : [physicalMemoryClass];
  const reservation = memoryReservation({
    memoryBytes: machineFacts.memoryBytes,
    availableMemoryBytes: machineFacts.availableMemoryBytes,
    activeLocalModelEstimatedResidentMemoryBytes: machineFacts.activeLocalModelEstimatedResidentMemoryBytes,
    memoryTier: selection.memoryTier,
    profile: selection.profile,
    contextMode: selection.contextMode,
  });
  const telemetry = {
    schemaVersion: telemetrySchemaVersion,
    capturedAt,
    status: selection.blockers.length ? "blocked" : "recorded",
    currentHost: {
      platform: machineFacts.platform,
      arch: machineFacts.arch,
      memoryBytes: machineFacts.memoryBytes,
      availableMemoryBytes: machineFacts.availableMemoryBytes,
      memoryPressure: machineFacts.memoryPressure,
      memoryTier: selection.memoryTier,
      physicalMemoryClass,
      activeLocalModelCount: machineFacts.activeLocalModelCount,
      activeLocalModelEstimatedResidentMemoryBytes: machineFacts.activeLocalModelEstimatedResidentMemoryBytes,
    },
    selectedProfileId: selection.profile.id,
    ...(selection.fallbackProfile ? { fallbackProfileId: selection.fallbackProfile.id } : {}),
    contextTokens: selection.contextTokens,
    q8OverrideDecision: "not-requested",
    warnings: selection.warnings,
    blockers: selection.blockers,
    rationale: selection.rationale,
    reservation,
    activeResidents: residentProcesses.map(telemetryResident),
    coverage: {
      targetPhysicalMemoryClasses,
      observedPhysicalMemoryClasses,
      missingPhysicalMemoryClasses: targetPhysicalMemoryClasses.filter((target) => !observedPhysicalMemoryClasses.includes(target)),
    },
  };
  const basePath = `${telemetryRoot}/${capturedAt.replace(/[:.]/g, "-")}-${physicalMemoryClass}-${telemetry.status}`;
  const jsonPath = `${basePath}.json`;
  const markdownPath = `${basePath}.md`;
  await writeWorkspaceText(input.workspacePath, jsonPath, `${JSON.stringify(telemetry, null, 2)}\n`);
  await writeWorkspaceText(input.workspacePath, markdownPath, renderMemoryTelemetryMarkdown(telemetry));
  return {
    ...telemetry,
    artifactPath: jsonPath,
    markdownPath,
    exitCode: 0,
  };
}

export async function writeMemoryTelemetryCoverageReport(input) {
  const observations = await readMemoryTelemetryObservations(input.workspacePath);
  const latestByClass = new Map();
  const ignoredArtifactPaths = [];
  for (const observation of observations) {
    if (observation.status !== "recorded") {
      ignoredArtifactPaths.push(observation.artifactPath);
      continue;
    }
    const previous = latestByClass.get(observation.physicalMemoryClass);
    if (!previous || observation.capturedAt > previous.capturedAt) {
      latestByClass.set(observation.physicalMemoryClass, observation);
    }
  }
  const missingBeforeEstimates = targetPhysicalMemoryClasses.filter((memoryClass) => !latestByClass.has(memoryClass));
  if (input.allowEstimates) {
    for (const memoryClass of missingBeforeEstimates) {
      latestByClass.set(memoryClass, estimatedMemoryTelemetryObservation(memoryClass, input.checkedAt));
    }
  }
  const selectedObservations = targetPhysicalMemoryClasses
    .map((memoryClass) => latestByClass.get(memoryClass))
    .filter(Boolean);
  const observedPhysicalMemoryClasses = selectedObservations.map((observation) => observation.physicalMemoryClass);
  const missingPhysicalMemoryClasses = targetPhysicalMemoryClasses.filter((memoryClass) => !latestByClass.has(memoryClass));
  const realPhysicalMemoryClasses = selectedObservations
    .filter((observation) => observation.provenance === "physical-host")
    .map((observation) => observation.physicalMemoryClass);
  const estimatedPhysicalMemoryClasses = selectedObservations
    .filter((observation) => observation.provenance === "estimated-host-class")
    .map((observation) => observation.physicalMemoryClass);
  const coverage = {
    schemaVersion: coverageSchemaVersion,
    checkedAt: input.checkedAt,
    status: missingPhysicalMemoryClasses.length ? "missing" : "complete",
    estimateMode: input.allowEstimates ? "allowed" : "disabled",
    targetPhysicalMemoryClasses,
    observedPhysicalMemoryClasses,
    missingPhysicalMemoryClasses,
    realPhysicalMemoryClasses,
    estimatedPhysicalMemoryClasses,
    observations: selectedObservations,
    ignoredArtifactPaths: [...new Set(ignoredArtifactPaths)].sort(),
  };
  const basePath = `${telemetryRoot}/coverage/${input.checkedAt.replace(/[:.]/g, "-")}-${coverage.status}`;
  const jsonPath = `${basePath}.json`;
  const markdownPath = `${basePath}.md`;
  await writeWorkspaceText(input.workspacePath, jsonPath, `${JSON.stringify(coverage, null, 2)}\n`);
  await writeWorkspaceText(input.workspacePath, markdownPath, renderMemoryTelemetryCoverageMarkdown(coverage));
  return {
    ...coverage,
    artifactPath: jsonPath,
    markdownPath,
  };
}

export async function readMemoryTelemetryObservations(workspacePath) {
  const root = join(workspacePath, telemetryRoot);
  const entries = await readdir(root, { withFileTypes: true }).catch((error) => {
    if (error?.code === "ENOENT") return [];
    throw error;
  });
  const observations = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const artifactPath = `${telemetryRoot}/${entry.name}`;
    const raw = await readFile(join(root, entry.name), "utf8").catch((error) => {
      if (error?.code === "ENOENT") return undefined;
      throw error;
    });
    const observation = raw ? memoryTelemetryObservationFromJson(raw, artifactPath) : undefined;
    if (observation) observations.push(observation);
  }
  return observations;
}

export function memoryTelemetryObservationFromJson(raw, artifactPath) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
  if (parsed.schemaVersion !== telemetrySchemaVersion) return undefined;
  const currentHost = objectRecord(parsed.currentHost);
  const reservation = objectRecord(parsed.reservation);
  const physicalMemoryClass = targetPhysicalMemoryClasses.includes(currentHost?.physicalMemoryClass)
    ? currentHost.physicalMemoryClass
    : undefined;
  const status = parsed.status === "recorded" || parsed.status === "blocked" ? parsed.status : undefined;
  const contextTokens = parsed.contextTokens === 8192 || parsed.contextTokens === 16384 ? parsed.contextTokens : undefined;
  const reservationStatus = reservation?.status === "passed" || reservation?.status === "failed" ? reservation.status : undefined;
  if (!physicalMemoryClass || !stringValue(parsed.capturedAt) || !status || !stringValue(currentHost?.platform) || !stringValue(currentHost?.arch) || !stringValue(parsed.selectedProfileId) || !contextTokens || !stringValue(parsed.q8OverrideDecision) || !reservationStatus) {
    return undefined;
  }
  return {
    physicalMemoryClass,
    capturedAt: parsed.capturedAt,
    status,
    provenance: "physical-host",
    platform: currentHost.platform,
    arch: currentHost.arch,
    ...(numberValue(currentHost.memoryBytes) !== undefined ? { memoryBytes: numberValue(currentHost.memoryBytes) } : {}),
    ...(numberValue(currentHost.availableMemoryBytes) !== undefined ? { availableMemoryBytes: numberValue(currentHost.availableMemoryBytes) } : {}),
    memoryTier: stringValue(currentHost.memoryTier) ?? "unknown",
    selectedProfileId: parsed.selectedProfileId,
    contextTokens,
    q8OverrideDecision: parsed.q8OverrideDecision,
    reservationStatus,
    artifactPath,
  };
}

function sanitizedMemoryTelemetryArtifactFromJson(raw, artifactPath, provenanceNote) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  const observation = memoryTelemetryObservationFromJson(raw, artifactPath);
  if (!observation) return undefined;
  const currentHost = objectRecord(parsed.currentHost) ?? {};
  const reservation = objectRecord(parsed.reservation) ?? {};
  return {
    schemaVersion: telemetrySchemaVersion,
    capturedAt: observation.capturedAt,
    status: observation.status,
    currentHost: {
      platform: observation.platform,
      arch: observation.arch,
      ...(observation.memoryBytes !== undefined ? { memoryBytes: observation.memoryBytes } : {}),
      ...(observation.availableMemoryBytes !== undefined ? { availableMemoryBytes: observation.availableMemoryBytes } : {}),
      memoryPressure: stringValue(currentHost.memoryPressure) ?? "unknown",
      memoryTier: observation.memoryTier,
      physicalMemoryClass: observation.physicalMemoryClass,
      activeLocalModelCount: Math.max(0, Math.floor(numberValue(currentHost.activeLocalModelCount) ?? 0)),
      activeLocalModelEstimatedResidentMemoryBytes: Math.max(0, numberValue(currentHost.activeLocalModelEstimatedResidentMemoryBytes) ?? 0),
    },
    selectedProfileId: observation.selectedProfileId,
    ...(stringValue(parsed.fallbackProfileId) ? { fallbackProfileId: stringValue(parsed.fallbackProfileId) } : {}),
    contextTokens: observation.contextTokens,
    q8OverrideDecision: observation.q8OverrideDecision,
    warnings: stringArray(parsed.warnings),
    blockers: stringArray(parsed.blockers),
    rationale: [
      ...stringArray(parsed.rationale),
      ...(provenanceNote ? [provenanceNote] : []),
    ],
    reservation: {
      status: observation.reservationStatus,
      profileId: stringValue(reservation.profileId) ?? observation.selectedProfileId,
      ...(numberValue(reservation.profileEstimatedResidentMemoryBytes) !== undefined ? { profileEstimatedResidentMemoryBytes: numberValue(reservation.profileEstimatedResidentMemoryBytes) } : {}),
      ...(numberValue(reservation.activeLocalModelEstimatedResidentMemoryBytes) !== undefined ? { activeLocalModelEstimatedResidentMemoryBytes: numberValue(reservation.activeLocalModelEstimatedResidentMemoryBytes) } : {}),
      ...(numberValue(reservation.availableMemoryBytes) !== undefined ? { availableMemoryBytes: numberValue(reservation.availableMemoryBytes) } : {}),
      ...(numberValue(reservation.estimatedAvailableAfterLaunchBytes) !== undefined ? { estimatedAvailableAfterLaunchBytes: numberValue(reservation.estimatedAvailableAfterLaunchBytes) } : {}),
      ...(numberValue(reservation.minimumHeadroomBytes) !== undefined ? { minimumHeadroomBytes: numberValue(reservation.minimumHeadroomBytes) } : {}),
      ...(numberValue(reservation.remainingHeadroomBytes) !== undefined ? { remainingHeadroomBytes: numberValue(reservation.remainingHeadroomBytes) } : {}),
      reason: stringValue(reservation.reason) ?? "Imported validated physical-host telemetry artifact.",
    },
    activeResidents: sanitizedTelemetryResidents(parsed.activeResidents),
    coverage: {
      targetPhysicalMemoryClasses,
      observedPhysicalMemoryClasses: [observation.physicalMemoryClass],
      missingPhysicalMemoryClasses: targetPhysicalMemoryClasses.filter((target) => target !== observation.physicalMemoryClass),
    },
  };
}

function sanitizedTelemetryResidents(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const resident = objectRecord(entry);
    if (!resident) return [];
    const capability = stringValue(resident.capability);
    const id = stringValue(resident.id);
    const pid = numberValue(resident.pid);
    if (!capability || !id || !pid) return [];
    return [{
      capability,
      id,
      pid,
      running: resident.running === true,
      ...(stringValue(resident.profileId) ? { profileId: stringValue(resident.profileId) } : {}),
      ...(numberValue(resident.contextTokens) !== undefined ? { contextTokens: numberValue(resident.contextTokens) } : {}),
      ...(numberValue(resident.estimatedResidentMemoryBytes) !== undefined ? { estimatedResidentMemoryBytes: numberValue(resident.estimatedResidentMemoryBytes) } : {}),
      ...(stringValue(resident.startedAt) ? { startedAt: stringValue(resident.startedAt) } : {}),
      ...(stringValue(resident.lastUsedAt) ? { lastUsedAt: stringValue(resident.lastUsedAt) } : {}),
    }];
  });
}

function estimatedMemoryTelemetryObservation(physicalMemoryClass, checkedAt) {
  const facts = estimatedHostFactsForMemoryClass(physicalMemoryClass);
  const selection = selectModelProfile(facts);
  const reservation = memoryReservation({
    memoryBytes: facts.memoryBytes,
    availableMemoryBytes: facts.availableMemoryBytes,
    activeLocalModelEstimatedResidentMemoryBytes: 0,
    memoryTier: selection.memoryTier,
    profile: selection.profile,
    contextMode: selection.contextMode,
  });
  return {
    physicalMemoryClass,
    capturedAt: checkedAt,
    status: "recorded",
    provenance: "estimated-host-class",
    platform: "estimated",
    arch: "host-class",
    memoryBytes: facts.memoryBytes,
    availableMemoryBytes: facts.availableMemoryBytes,
    memoryTier: selection.memoryTier,
    selectedProfileId: selection.profile.id,
    contextTokens: selection.contextTokens,
    q8OverrideDecision: "not-requested",
    reservationStatus: reservation.status,
    artifactPath: `estimated://local-deep-research-memory-telemetry/${physicalMemoryClass}`,
    estimateRationale: "Temporary host-class estimate used to unblock first-party Local Deep Research implementation until matching physical telemetry is collected.",
  };
}

function estimatedHostFactsForMemoryClass(physicalMemoryClass) {
  const estimates = {
    "16gb": { memoryBytes: 16 * gib, availableMemoryBytes: 12 * gib },
    "32gb": { memoryBytes: 32 * gib, availableMemoryBytes: 24 * gib },
    "64gb": { memoryBytes: 64 * gib, availableMemoryBytes: 48 * gib },
    "128gb-plus": { memoryBytes: 128 * gib, availableMemoryBytes: 96 * gib },
  };
  const estimate = estimates[physicalMemoryClass];
  if (!estimate) throw new Error(`Cannot estimate unknown Local Deep Research memory class: ${physicalMemoryClass}`);
  return {
    platform: "estimated",
    arch: "host-class",
    memoryPressure: "normal",
    activeLocalModelCount: 0,
    activeLocalModelEstimatedResidentMemoryBytes: 0,
    ...estimate,
  };
}

export function renderMemoryTelemetryCoverageMarkdown(coverage) {
  return [
    "# Local Deep Research Memory Telemetry Coverage",
    "",
    `Checked: ${coverage.checkedAt}`,
    `Status: ${coverage.status}`,
    `Estimate mode: ${coverage.estimateMode}`,
    `Observed classes: ${coverage.observedPhysicalMemoryClasses.join(", ") || "none"}`,
    `Missing classes: ${coverage.missingPhysicalMemoryClasses.join(", ") || "none"}`,
    `Real classes: ${coverage.realPhysicalMemoryClasses.join(", ") || "none"}`,
    `Estimated classes: ${coverage.estimatedPhysicalMemoryClasses.join(", ") || "none"}`,
    "",
    "| Class | Provenance | Captured | Host | Selected | Reservation | Artifact |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...coverage.observations.map((observation) => `| ${observation.physicalMemoryClass} | ${observation.provenance} | ${observation.capturedAt} | ${observation.platform}/${observation.arch} ${formatGiB(observation.memoryBytes)} GiB | ${observation.selectedProfileId} / ${observation.contextTokens} | ${observation.reservationStatus} | ${observation.artifactPath} |`),
    "",
  ].join("\n");
}

export function renderMemoryTelemetryBundleReadme(manifest) {
  return [
    "# Local Deep Research Memory Telemetry Bundle",
    "",
    `Created: ${manifest.createdAt}`,
    `Exported classes: ${manifest.exportedPhysicalMemoryClasses.join(", ") || "none"}`,
    `Missing classes: ${manifest.missingPhysicalMemoryClasses.join(", ") || "none"}`,
    "",
    "Import this bundle from the Local Deep Research implementation worktree:",
    "",
    "```bash",
    manifest.importCommand,
    "```",
    "",
    "The bundle contains sanitized physical-host telemetry JSON plus Markdown summaries. It intentionally excludes raw workspace state and any non-telemetry JSON is ignored by the importer.",
    "",
  ].join("\n");
}

export function localDeepResearchMemoryTelemetryGateSummary(result) {
  if (result.error) return result.error;
  const lines = [];
  if (result.imported) {
    lines.push(`Local Deep Research memory telemetry import ${result.imported.status}.`);
    lines.push(`Imported: ${result.imported.importedCount}; skipped: ${result.imported.skippedCount}.`);
  }
  if (result.exported) {
    lines.push(`Local Deep Research memory telemetry bundle export ${result.exported.status}.`);
    lines.push(`Exported: ${result.exported.exportedPhysicalMemoryClasses.join(", ") || "none"}.`);
    lines.push(`Bundle: ${result.exported.outputPath}.`);
  }
  if (!result.coverage) return lines.length ? lines.join("\n") : "Local Deep Research memory telemetry collection completed.";
  lines.push(
    `Local Deep Research memory telemetry coverage ${result.coverage.status}.`,
    `Observed: ${result.coverage.observedPhysicalMemoryClasses.join(", ") || "none"}.`,
    `Missing: ${result.coverage.missingPhysicalMemoryClasses.join(", ") || "none"}.`,
    `Estimates: ${result.coverage.estimatedPhysicalMemoryClasses.join(", ") || "none"}.`,
    `Artifact: ${result.coverage.artifactPath}.`,
  );
  return lines.join("\n");
}

async function writeWorkspaceText(workspacePath, relativePath, content) {
  const absolutePath = join(workspacePath, relativePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}

function detectMachineFacts(input = {}) {
  return {
    platform: input.platform ?? hostPlatform(),
    arch: input.arch ?? hostArch(),
    memoryBytes: input.memoryBytes ?? totalmem(),
    availableMemoryBytes: input.availableMemoryBytes ?? freemem(),
    memoryPressure: input.memoryPressure ?? "unknown",
    activeLocalModelCount: input.activeLocalModelCount ?? 0,
    activeLocalModelEstimatedResidentMemoryBytes: input.activeLocalModelEstimatedResidentMemoryBytes ?? 0,
  };
}

function selectModelProfile(machineFacts) {
  const memoryTier = memoryTierForMemory(machineFacts.memoryBytes);
  const warnings = [];
  const blockers = [];
  const rationale = [];
  let profile = localModelProfiles.q4;
  let fallbackProfile;
  let contextMode = "target-16k";

  if (memoryTier === "unknown") {
    warnings.push("Host memory is unknown; selecting Q4 with the 16k target and requiring launch preflight before long runs.");
    rationale.push("Q4 is the conservative profile when host memory facts are unavailable.");
  } else if (memoryTier === "constrained") {
    contextMode = "safe-8k";
    rationale.push("Hosts below 24 GiB use Q4 and 8k safe mode by default.");
  } else if (memoryTier === "standard") {
    rationale.push("24-64 GiB hosts use Q4 with the 16k target by default.");
  } else {
    profile = localModelProfiles.q8;
    fallbackProfile = localModelProfiles.q4;
    rationale.push("64 GiB+ hosts default to Q8 with Q4 fallback under pressure.");
  }

  if (machineFacts.memoryPressure === "critical") {
    profile = localModelProfiles.q4;
    fallbackProfile = undefined;
    contextMode = "safe-8k";
    warnings.push("Memory pressure is critical; forcing Q4 and 8k safe mode.");
    rationale.push("Critical pressure overrides quality preferences.");
  } else if (machineFacts.memoryPressure === "warning" && profile.id === localModelProfiles.q8.id) {
    profile = localModelProfiles.q4;
    fallbackProfile = localModelProfiles.q8;
    warnings.push("Memory pressure is elevated; using Q4 even though the host normally qualifies for Q8.");
    rationale.push("Elevated pressure triggers the Q8-to-Q4 fallback.");
  }

  if (machineFacts.activeLocalModelCount > 0 && (memoryTier === "constrained" || memoryTier === "standard")) {
    profile = localModelProfiles.q4;
    contextMode = memoryTier === "constrained" ? "safe-8k" : contextMode;
    blockers.push("Another managed local model is already resident; Local Deep Research will wait rather than overlap llama.cpp processes on hosts below 64 GiB.");
    rationale.push("Non-high-memory hosts default to one long-running local model resident at a time.");
  } else if (machineFacts.activeLocalModelCount > 0) {
    const reservation = memoryReservation({
      memoryBytes: machineFacts.memoryBytes,
      availableMemoryBytes: machineFacts.availableMemoryBytes,
      activeLocalModelEstimatedResidentMemoryBytes: machineFacts.activeLocalModelEstimatedResidentMemoryBytes,
      memoryTier,
      profile,
      contextMode,
    });
    if (reservation.status === "passed") {
      warnings.push(`Another local model is already resident; ${profile.displayName} overlap passed resident-memory reservation with ${formatGiB(reservation.remainingHeadroomBytes)} GiB estimated headroom.`);
      rationale.push("High-memory overlap is allowed only after resident-memory reservation succeeds.");
    } else if (profile.id === localModelProfiles.q8.id) {
      profile = localModelProfiles.q4;
      fallbackProfile = localModelProfiles.q8;
      warnings.push(`Another local model is already resident; falling back to Q4 because Q8 overlap reservation failed: ${reservation.reason}`);
      rationale.push("High-memory overlap fell back to Q4 when Q8 did not reserve enough headroom.");
    } else {
      blockers.push(`Another local model is already resident and Q4 overlap reservation failed: ${reservation.reason}`);
    }
  }

  return {
    profile,
    ...(fallbackProfile ? { fallbackProfile } : {}),
    memoryTier,
    contextMode,
    contextTokens: contextMode === "safe-8k" ? 8192 : 16384,
    warnings: [...new Set(warnings)],
    blockers: [...new Set(blockers)],
    rationale: [...new Set(rationale)],
  };
}

function memoryReservation(input) {
  const profileEstimatedResidentMemoryBytes = input.contextMode === "safe-8k"
    ? input.profile.estimatedResidentMemoryBytes.safe8k
    : input.profile.estimatedResidentMemoryBytes.target16k;
  const activeLocalModelEstimatedResidentMemoryBytes = Math.max(0, input.activeLocalModelEstimatedResidentMemoryBytes ?? 0);
  const availableMemoryBytes = validBytes(input.availableMemoryBytes);
  const estimatedAvailableAfterLaunchBytes = availableMemoryBytes !== undefined
    ? availableMemoryBytes - profileEstimatedResidentMemoryBytes
    : validBytes(input.memoryBytes) !== undefined
      ? input.memoryBytes - activeLocalModelEstimatedResidentMemoryBytes - profileEstimatedResidentMemoryBytes
      : undefined;
  const minimumHeadroomBytes = memoryReservationHeadroomBytes(input.memoryTier, input.memoryBytes);
  const remainingHeadroomBytes = estimatedAvailableAfterLaunchBytes !== undefined
    ? estimatedAvailableAfterLaunchBytes - minimumHeadroomBytes
    : Number.NEGATIVE_INFINITY;
  const passed = estimatedAvailableAfterLaunchBytes !== undefined && remainingHeadroomBytes >= 0;
  return {
    status: passed ? "passed" : "failed",
    profileId: input.profile.id,
    profileEstimatedResidentMemoryBytes,
    activeLocalModelEstimatedResidentMemoryBytes,
    ...(availableMemoryBytes !== undefined ? { availableMemoryBytes } : {}),
    ...(estimatedAvailableAfterLaunchBytes !== undefined ? { estimatedAvailableAfterLaunchBytes } : {}),
    minimumHeadroomBytes,
    remainingHeadroomBytes: Number.isFinite(remainingHeadroomBytes) ? remainingHeadroomBytes : 0,
    reason: passed
      ? `${input.profile.displayName} leaves at least ${formatGiB(minimumHeadroomBytes)} GiB reserved headroom.`
      : estimatedAvailableAfterLaunchBytes === undefined
        ? "Available memory is unknown, so resident overlap cannot be reserved."
        : `${input.profile.displayName} would leave ${formatGiB(Math.max(0, estimatedAvailableAfterLaunchBytes))} GiB available, below the ${formatGiB(minimumHeadroomBytes)} GiB headroom reserve.`,
  };
}

function memoryTierForMemory(memoryBytes) {
  if (!memoryBytes || !Number.isFinite(memoryBytes) || memoryBytes <= 0) return "unknown";
  if (memoryBytes < 24 * gib) return "constrained";
  if (memoryBytes < 64 * gib) return "standard";
  if (memoryBytes < 96 * gib) return "high";
  return "workstation";
}

function physicalMemoryClassForMemory(memoryBytes) {
  if (!memoryBytes || !Number.isFinite(memoryBytes) || memoryBytes <= 0) return "unknown";
  if (memoryBytes < 24 * gib) return "16gb";
  if (memoryBytes < 64 * gib) return "32gb";
  if (memoryBytes < 96 * gib) return "64gb";
  return "128gb-plus";
}

function memoryReservationHeadroomBytes(memoryTier, memoryBytes) {
  if (memoryTier === "workstation") return 16 * gib;
  if (memoryTier === "high") return 10 * gib;
  if (memoryTier === "standard") return 8 * gib;
  if (memoryTier === "constrained") return 6 * gib;
  const hostMemoryBytes = validBytes(memoryBytes);
  return hostMemoryBytes ? Math.max(4 * gib, Math.floor(hostMemoryBytes * 0.15)) : 8 * gib;
}

async function detectResidentProcesses(workspacePath) {
  return [
    ...await detectLocalDeepResearchResidents(workspacePath),
    ...await detectMiniCpmResidents(workspacePath),
  ].filter((resident) => resident.running);
}

async function detectLocalDeepResearchResidents(workspacePath) {
  const root = join(workspacePath, localDeepResearchServerRoot);
  const entries = await readdir(root, { withFileTypes: true }).catch((error) => {
    if (error?.code === "ENOENT") return [];
    throw error;
  });
  const residents = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const statePath = join(root, entry.name, "server-state.json");
    const state = await readJsonRecord(statePath);
    const pid = numberValue(state.pid);
    if (!pid) continue;
    const profileId = stringValue(state.profileId);
    const contextTokens = numberValue(state.contextTokens);
    residents.push({
      capability: "local-deep-research",
      id: `local-deep-research:${profileId ?? "unknown"}:${pid}`,
      pid,
      running: processAlive(pid),
      statePath,
      profileId,
      contextTokens,
      estimatedResidentMemoryBytes: localDeepResearchResidentEstimate(profileId, contextTokens),
      startedAt: stringValue(state.startedAt),
      lastUsedAt: stringValue(state.lastUsedAt),
    });
  }
  return residents;
}

async function detectMiniCpmResidents(workspacePath) {
  const statePath = join(workspacePath, miniCpmServerStatePath);
  const state = await readJsonRecord(statePath);
  const pid = numberValue(state.pid);
  if (!pid) return [];
  return [{
    capability: "minicpm-v",
    id: `minicpm-v:${pid}`,
    pid,
    running: processAlive(pid),
    statePath,
    contextTokens: miniCpmContextTokens(state.command),
    estimatedResidentMemoryBytes: 7 * gib,
    startedAt: stringValue(state.startedAt),
  }];
}

async function readJsonRecord(path) {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    return objectRecord(parsed) ?? {};
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
}

function localDeepResearchResidentEstimate(profileId, contextTokens) {
  const profile = profileId === localModelProfiles.q8.id ? localModelProfiles.q8 : profileId === localModelProfiles.q4.id ? localModelProfiles.q4 : undefined;
  if (!profile || !contextTokens) return undefined;
  return contextTokens <= profile.safeContextTokens
    ? profile.estimatedResidentMemoryBytes.safe8k
    : profile.estimatedResidentMemoryBytes.target16k;
}

function miniCpmContextTokens(command) {
  if (!Array.isArray(command)) return undefined;
  const contextIndex = command.findIndex((entry) => entry === "-c" || entry === "--ctx-size" || entry === "--context");
  const raw = contextIndex >= 0 ? command[contextIndex + 1] : undefined;
  const parsed = typeof raw === "string" ? Number.parseInt(raw, 10) : undefined;
  return parsed && Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function telemetryResident(resident) {
  return {
    capability: resident.capability,
    id: resident.id,
    pid: resident.pid,
    running: resident.running,
    ...(resident.profileId ? { profileId: resident.profileId } : {}),
    ...(resident.contextTokens ? { contextTokens: resident.contextTokens } : {}),
    ...(resident.estimatedResidentMemoryBytes !== undefined ? { estimatedResidentMemoryBytes: resident.estimatedResidentMemoryBytes } : {}),
    ...(resident.startedAt ? { startedAt: resident.startedAt } : {}),
    ...(resident.lastUsedAt ? { lastUsedAt: resident.lastUsedAt } : {}),
  };
}

function renderMemoryTelemetryMarkdown(telemetry) {
  return [
    "# Local Deep Research Memory Telemetry",
    "",
    `Captured: ${telemetry.capturedAt}`,
    `Status: ${telemetry.status}`,
    `Host: ${telemetry.currentHost.platform}/${telemetry.currentHost.arch}, ${formatGiB(telemetry.currentHost.memoryBytes)} GiB total, ${formatGiB(telemetry.currentHost.availableMemoryBytes)} GiB available`,
    `Class: ${telemetry.currentHost.physicalMemoryClass}; tier: ${telemetry.currentHost.memoryTier}; pressure: ${telemetry.currentHost.memoryPressure}`,
    `Active local models: ${telemetry.currentHost.activeLocalModelCount}; estimated resident memory: ${formatGiB(telemetry.currentHost.activeLocalModelEstimatedResidentMemoryBytes)} GiB`,
    `Selected: ${telemetry.selectedProfileId}, ${telemetry.contextTokens} context tokens, Q8 override ${telemetry.q8OverrideDecision}`,
    `Reservation: ${telemetry.reservation.status}; ${telemetry.reservation.reason}`,
    `Observed classes: ${telemetry.coverage.observedPhysicalMemoryClasses.join(", ") || "none"}`,
    `Missing classes: ${telemetry.coverage.missingPhysicalMemoryClasses.join(", ") || "none"}`,
    "",
  ].join("\n");
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function validBytes(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function objectRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}

function stringValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArray(value) {
  return Array.isArray(value) ? value.flatMap((entry) => stringValue(entry) ? [stringValue(entry)] : []) : [];
}

function numberValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function formatGiB(bytes) {
  if (bytes === undefined || !Number.isFinite(bytes)) return "unknown";
  return (bytes / (1024 ** 3)).toFixed(1);
}

function usage() {
  return [
    "Usage: node scripts/local-deep-research-memory-telemetry-gate.mjs [options]",
    "",
    "Options:",
    "  --workspace <path>       Workspace whose .ambient telemetry artifacts should be used. Defaults to cwd.",
    "  --import-artifacts <path> Import sanitized telemetry JSON artifacts from a file or directory. Repeatable.",
    "  --export-bundle <path>    Export latest sanitized physical-host telemetry artifacts to a portable bundle.",
    "  --collect-current        Record this host by running the product telemetry path.",
    "  --coverage               Write a coverage report from collected telemetry artifacts.",
    "  --allow-estimates        Fill missing target memory classes with labeled host-class estimates.",
    "  --require-complete       Exit non-zero unless 16gb, 32gb, 64gb, and 128gb-plus are all observed.",
    "  --help                   Show this help.",
    "",
  ].join("\n");
}

async function main() {
  const options = parseLocalDeepResearchMemoryTelemetryGateArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  const result = await runLocalDeepResearchMemoryTelemetryGate({
    workspacePath: options.workspacePath,
    importArtifactPaths: options.importArtifactPaths,
    exportBundlePath: options.exportBundlePath,
    collectCurrent: options.collectCurrent,
    coverage: options.coverage,
    requireComplete: options.requireComplete,
    allowEstimates: options.allowEstimates,
  });
  process.stdout.write(`${localDeepResearchMemoryTelemetryGateSummary(result)}\n`);
  process.exitCode = result.exitCode;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
