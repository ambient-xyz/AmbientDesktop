import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  exportMemoryTelemetryBundle,
  importMemoryTelemetryArtifacts,
  parseLocalDeepResearchMemoryTelemetryGateArgs,
  runLocalDeepResearchMemoryTelemetryGate,
  writeMemoryTelemetryCoverageReport,
} from "./local-deep-research-memory-telemetry-gate.mjs";

const gib = 1024 ** 3;

describe("Local Deep Research memory telemetry gate", () => {
  it("parses collection and release-gate flags", () => {
    expect(parseLocalDeepResearchMemoryTelemetryGateArgs(["--workspace", "/tmp/work", "--collect-current", "--require-complete", "--allow-estimates", "--import-artifacts", "/tmp/bundle", "--export-bundle", "/tmp/export"])).toMatchObject({
      workspacePath: "/tmp/work",
      collectCurrent: true,
      coverage: true,
      requireComplete: true,
      allowEstimates: true,
      importArtifactPaths: ["/tmp/bundle"],
      exportBundlePath: "/tmp/export",
    });
    expect(parseLocalDeepResearchMemoryTelemetryGateArgs([])).toMatchObject({
      coverage: true,
    });
  });

  it("exports a sanitized portable telemetry bundle that strict coverage can import", async () => {
    const sourceWorkspace = await mkdtemp(join(tmpdir(), "ambient-ldr-memory-gate-export-source-"));
    const targetWorkspace = await mkdtemp(join(tmpdir(), "ambient-ldr-memory-gate-export-target-"));
    const bundle = await mkdtemp(join(tmpdir(), "ambient-ldr-memory-gate-export-bundle-"));
    try {
      await writeTelemetry(sourceWorkspace, "2026-05-28T17:10:00.000Z", "16gb", 16, { unexpectedSecret: "do-not-export" });
      await writeTelemetry(sourceWorkspace, "2026-05-28T17:11:00.000Z", "32gb", 32);
      await writeTelemetry(sourceWorkspace, "2026-05-28T17:12:00.000Z", "64gb", 64);
      await writeTelemetry(sourceWorkspace, "2026-05-28T17:13:00.000Z", "128gb-plus", 128);

      const exported = await exportMemoryTelemetryBundle({
        workspacePath: sourceWorkspace,
        outputPath: bundle,
        createdAt: "2026-05-28T17:25:00.000Z",
      });

      expect(exported).toMatchObject({
        status: "exported",
        exportedCount: 4,
        exportedPhysicalMemoryClasses: ["16gb", "32gb", "64gb", "128gb-plus"],
        missingPhysicalMemoryClasses: [],
      });
      const exported16gb = exported.exported.find((artifact) => artifact.physicalMemoryClass === "16gb");
      const exportedText = await readFile(join(bundle, exported16gb.jsonFile), "utf8");
      expect(exportedText).toContain("\"physicalMemoryClass\": \"16gb\"");
      expect(exportedText).not.toContain("do-not-export");
      await expect(readFile(join(bundle, "README.md"), "utf8")).resolves.toContain("--import-artifacts /path/to/telemetry-bundle");

      const result = await runLocalDeepResearchMemoryTelemetryGate({
        workspacePath: targetWorkspace,
        importArtifactPaths: [bundle],
        coverage: true,
        requireComplete: true,
        now: () => new Date("2026-05-28T17:26:00.000Z"),
      });

      expect(result).toMatchObject({
        status: "passed",
        exitCode: 0,
        imported: {
          importedCount: 4,
          skippedCount: 1,
        },
        coverage: {
          status: "complete",
          estimateMode: "disabled",
          realPhysicalMemoryClasses: ["16gb", "32gb", "64gb", "128gb-plus"],
          estimatedPhysicalMemoryClasses: [],
        },
      });
    } finally {
      await rm(sourceWorkspace, { recursive: true, force: true });
      await rm(targetWorkspace, { recursive: true, force: true });
      await rm(bundle, { recursive: true, force: true });
    }
  });

  it("collects the current host before exporting a telemetry bundle", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-ldr-memory-gate-collect-export-workspace-"));
    const bundle = await mkdtemp(join(tmpdir(), "ambient-ldr-memory-gate-collect-export-bundle-"));
    try {
      const result = await runLocalDeepResearchMemoryTelemetryGate({
        workspacePath: workspace,
        collectCurrent: true,
        exportBundlePath: bundle,
        now: () => new Date("2026-05-28T17:27:00.000Z"),
        hostFacts: {
          platform: "darwin",
          arch: "arm64",
          memoryBytes: 32 * gib,
          availableMemoryBytes: 24 * gib,
          memoryPressure: "normal",
        },
      });

      expect(result).toMatchObject({
        status: "passed",
        exitCode: 0,
        collection: {
          currentHost: {
            physicalMemoryClass: "32gb",
          },
        },
        exported: {
          status: "exported",
          exportedPhysicalMemoryClasses: ["32gb"],
          missingPhysicalMemoryClasses: ["16gb", "64gb", "128gb-plus"],
        },
      });
      await expect(readFile(join(bundle, "manifest.json"), "utf8")).resolves.toContain("\"exportedPhysicalMemoryClasses\"");
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(bundle, { recursive: true, force: true });
    }
  });

  it("imports sanitized physical-host telemetry artifacts before strict coverage", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-ldr-memory-gate-import-workspace-"));
    const bundle = await mkdtemp(join(tmpdir(), "ambient-ldr-memory-gate-import-bundle-"));
    try {
      await writeTelemetry(bundle, "2026-05-28T17:10:00.000Z", "16gb", 16, { unexpectedSecret: "do-not-import" });
      await writeTelemetry(bundle, "2026-05-28T17:11:00.000Z", "32gb", 32);
      await writeTelemetry(bundle, "2026-05-28T17:12:00.000Z", "64gb", 64);
      await writeTelemetry(bundle, "2026-05-28T17:13:00.000Z", "128gb-plus", 128);
      await writeFile(join(bundle, "not-telemetry.json"), "{\"schemaVersion\":\"other\"}\n", "utf8");

      const result = await runLocalDeepResearchMemoryTelemetryGate({
        workspacePath: workspace,
        importArtifactPaths: [bundle],
        coverage: true,
        requireComplete: true,
        now: () => new Date("2026-05-28T17:24:00.000Z"),
      });

      expect(result).toMatchObject({
        status: "passed",
        exitCode: 0,
        imported: {
          status: "imported",
          importedCount: 4,
          skippedCount: 1,
        },
        coverage: {
          status: "complete",
          estimateMode: "disabled",
          realPhysicalMemoryClasses: ["16gb", "32gb", "64gb", "128gb-plus"],
          estimatedPhysicalMemoryClasses: [],
        },
      });
      const imported16gb = result.imported.imported.find((artifact) => artifact.physicalMemoryClass === "16gb");
      const importedText = await readFile(join(workspace, imported16gb.artifactPath), "utf8");
      expect(importedText).toContain("\"physicalMemoryClass\": \"16gb\"");
      expect(importedText).not.toContain("do-not-import");
      expect(imported16gb.artifactPath).toContain("-16gb-imported-recorded.json");
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(bundle, { recursive: true, force: true });
    }
  });

  it("imports telemetry artifacts without writing coverage when only import is requested", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-ldr-memory-gate-import-only-workspace-"));
    const bundle = await mkdtemp(join(tmpdir(), "ambient-ldr-memory-gate-import-only-bundle-"));
    try {
      await writeTelemetry(bundle, "2026-05-28T17:10:00.000Z", "16gb", 16);

      const imported = await importMemoryTelemetryArtifacts({
        workspacePath: workspace,
        artifactPaths: [bundle],
      });

      expect(imported).toMatchObject({
        status: "imported",
        importedCount: 1,
        skippedCount: 0,
      });
      await expect(readFile(join(workspace, imported.imported[0].markdownPath), "utf8")).resolves.toContain("Local Deep Research Memory Telemetry");
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(bundle, { recursive: true, force: true });
    }
  });

  it("writes complete coverage when all host classes are present", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-ldr-memory-gate-complete-"));
    try {
      await writeTelemetry(workspace, "2026-05-28T17:10:00.000Z", "16gb", 16);
      await writeTelemetry(workspace, "2026-05-28T17:11:00.000Z", "32gb", 32);
      await writeTelemetry(workspace, "2026-05-28T17:12:00.000Z", "64gb", 64);
      await writeTelemetry(workspace, "2026-05-28T17:13:00.000Z", "128gb-plus", 128);

      const report = await writeMemoryTelemetryCoverageReport({
        workspacePath: workspace,
        checkedAt: "2026-05-28T17:20:00.000Z",
      });

      expect(report).toMatchObject({
        status: "complete",
        estimateMode: "disabled",
        observedPhysicalMemoryClasses: ["16gb", "32gb", "64gb", "128gb-plus"],
        missingPhysicalMemoryClasses: [],
        realPhysicalMemoryClasses: ["16gb", "32gb", "64gb", "128gb-plus"],
        estimatedPhysicalMemoryClasses: [],
        artifactPath: ".ambient/local-deep-research/memory-telemetry/coverage/2026-05-28T17-20-00-000Z-complete.json",
      });
      await expect(readFile(join(workspace, report.artifactPath), "utf8")).resolves.toContain("\"status\": \"complete\"");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("fails the release gate when host classes are missing", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-ldr-memory-gate-missing-"));
    try {
      await writeTelemetry(workspace, "2026-05-28T17:13:00.000Z", "128gb-plus", 128);

      const result = await runLocalDeepResearchMemoryTelemetryGate({
        workspacePath: workspace,
        coverage: true,
        requireComplete: true,
        now: () => new Date("2026-05-28T17:21:00.000Z"),
      });

      expect(result).toMatchObject({
        status: "failed",
        exitCode: 1,
        coverage: {
          status: "missing",
          observedPhysicalMemoryClasses: ["128gb-plus"],
          missingPhysicalMemoryClasses: ["16gb", "32gb", "64gb"],
        },
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("passes the release gate with explicit estimates for missing host classes", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-ldr-memory-gate-estimated-"));
    try {
      await writeTelemetry(workspace, "2026-05-28T17:13:00.000Z", "128gb-plus", 128);

      const result = await runLocalDeepResearchMemoryTelemetryGate({
        workspacePath: workspace,
        coverage: true,
        requireComplete: true,
        allowEstimates: true,
        now: () => new Date("2026-05-28T17:23:00.000Z"),
      });

      expect(result).toMatchObject({
        status: "passed",
        exitCode: 0,
        coverage: {
          status: "complete",
          estimateMode: "allowed",
          observedPhysicalMemoryClasses: ["16gb", "32gb", "64gb", "128gb-plus"],
          missingPhysicalMemoryClasses: [],
          realPhysicalMemoryClasses: ["128gb-plus"],
          estimatedPhysicalMemoryClasses: ["16gb", "32gb", "64gb"],
        },
      });
      expect(result.coverage.observations.map((observation) => `${observation.physicalMemoryClass}:${observation.provenance}`)).toEqual([
        "16gb:estimated-host-class",
        "32gb:estimated-host-class",
        "64gb:estimated-host-class",
        "128gb-plus:physical-host",
      ]);
      await expect(readFile(join(workspace, result.coverage.artifactPath), "utf8")).resolves.toContain("\"estimatedPhysicalMemoryClasses\"");
      await expect(readFile(join(workspace, result.coverage.markdownPath), "utf8")).resolves.toContain("Estimate mode: allowed");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("runs current-host collection before writing coverage", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-ldr-memory-gate-collect-"));
    try {
      const result = await runLocalDeepResearchMemoryTelemetryGate({
        workspacePath: workspace,
        collectCurrent: true,
        coverage: true,
        now: () => new Date("2026-05-28T17:22:00.000Z"),
        hostFacts: {
          platform: "darwin",
          arch: "arm64",
          memoryBytes: 128 * gib,
          availableMemoryBytes: 96 * gib,
          memoryPressure: "normal",
        },
      });

      expect(result.collection).toMatchObject({
        schemaVersion: "ambient-local-deep-research-memory-telemetry-v1",
        status: "recorded",
        currentHost: {
          physicalMemoryClass: "128gb-plus",
          memoryTier: "workstation",
        },
        selectedProfileId: "literesearcher-4b-q8-0",
        contextTokens: 16384,
      });
      await expect(readFile(join(workspace, result.collection.artifactPath), "utf8")).resolves.toContain("\"physicalMemoryClass\": \"128gb-plus\"");
      expect(result.coverage.observedPhysicalMemoryClasses).toEqual(["128gb-plus"]);
      expect(result.coverage.estimatedPhysicalMemoryClasses).toEqual([]);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});

async function writeTelemetry(workspace, capturedAt, physicalMemoryClass, memoryGiB, extras = {}) {
  const path = join(
    workspace,
    ".ambient/local-deep-research/memory-telemetry",
    `${capturedAt.replace(/[:.]/g, "-")}-${physicalMemoryClass}-recorded.json`,
  );
  await mkdir(join(workspace, ".ambient/local-deep-research/memory-telemetry"), { recursive: true });
  await writeFile(path, `${JSON.stringify({ ...telemetry(capturedAt, physicalMemoryClass, memoryGiB), ...extras }, null, 2)}\n`, "utf8");
}

function telemetry(capturedAt, physicalMemoryClass, memoryGiB) {
  return {
    schemaVersion: "ambient-local-deep-research-memory-telemetry-v1",
    capturedAt,
    status: "recorded",
    currentHost: {
      platform: "darwin",
      arch: "arm64",
      memoryBytes: memoryGiB * gib,
      availableMemoryBytes: Math.floor(memoryGiB * 0.75) * gib,
      memoryPressure: "normal",
      memoryTier: physicalMemoryClass === "128gb-plus" ? "workstation" : physicalMemoryClass === "64gb" ? "high" : physicalMemoryClass === "32gb" ? "standard" : "constrained",
      physicalMemoryClass,
      activeLocalModelCount: 0,
      activeLocalModelEstimatedResidentMemoryBytes: 0,
    },
    selectedProfileId: physicalMemoryClass === "16gb" || physicalMemoryClass === "32gb" ? "literesearcher-4b-q4-k-m" : "literesearcher-4b-q8-0",
    contextTokens: physicalMemoryClass === "16gb" ? 8192 : 16384,
    q8OverrideDecision: "not-requested",
    warnings: [],
    blockers: [],
    rationale: [],
    reservation: {
      status: "passed",
      profileId: physicalMemoryClass === "16gb" || physicalMemoryClass === "32gb" ? "literesearcher-4b-q4-k-m" : "literesearcher-4b-q8-0",
      profileEstimatedResidentMemoryBytes: 7 * gib,
      activeLocalModelEstimatedResidentMemoryBytes: 0,
      availableMemoryBytes: Math.floor(memoryGiB * 0.75) * gib,
      estimatedAvailableAfterLaunchBytes: Math.floor(memoryGiB * 0.65) * gib,
      minimumHeadroomBytes: 6 * gib,
      remainingHeadroomBytes: 10 * gib,
      reason: "Synthetic telemetry fixture.",
    },
    activeResidents: [],
    coverage: {
      targetPhysicalMemoryClasses: ["16gb", "32gb", "64gb", "128gb-plus"],
      observedPhysicalMemoryClasses: [physicalMemoryClass],
      missingPhysicalMemoryClasses: ["16gb", "32gb", "64gb", "128gb-plus"].filter((candidate) => candidate !== physicalMemoryClass),
    },
  };
}
