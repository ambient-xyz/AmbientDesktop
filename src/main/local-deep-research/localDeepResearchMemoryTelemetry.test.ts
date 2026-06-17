import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  localDeepResearchPhysicalMemoryClass,
  runLocalDeepResearchMemoryTelemetryCoverage,
  runLocalDeepResearchMemoryTelemetry,
  targetPhysicalMemoryClasses,
} from "./localDeepResearchMemoryTelemetry";
import type { LocalLlamaResidentProcess } from "../local-llama/localLlamaResidencyPolicy";

const gib = 1024 ** 3;

describe("Local Deep Research memory telemetry", () => {
  it("classifies physical host memory into policy telemetry buckets", () => {
    expect(localDeepResearchPhysicalMemoryClass(undefined)).toBe("unknown");
    expect(localDeepResearchPhysicalMemoryClass(16 * gib)).toBe("16gb");
    expect(localDeepResearchPhysicalMemoryClass(32 * gib)).toBe("32gb");
    expect(localDeepResearchPhysicalMemoryClass(64 * gib)).toBe("64gb");
    expect(localDeepResearchPhysicalMemoryClass(128 * gib)).toBe("128gb-plus");
    expect(targetPhysicalMemoryClasses()).toEqual(["16gb", "32gb", "64gb", "128gb-plus"]);
  });

  it("writes current-host memory telemetry with selected profile, residents, and coverage gaps", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-ldr-memory-telemetry-"));
    try {
      const result = await runLocalDeepResearchMemoryTelemetry({
        workspacePath: workspace,
        machineFacts: {
          platform: "darwin",
          arch: "arm64",
          memoryBytes: 64 * gib,
          availableMemoryBytes: 40 * gib,
          memoryPressure: "normal",
        },
        residentProcesses: [residentFixture()],
        now: () => new Date("2026-05-28T17:00:00.000Z"),
      });

      expect(result).toMatchObject({
        schemaVersion: "ambient-local-deep-research-memory-telemetry-v1",
        capturedAt: "2026-05-28T17:00:00.000Z",
        status: "recorded",
        currentHost: {
          platform: "darwin",
          arch: "arm64",
          memoryTier: "high",
          physicalMemoryClass: "64gb",
	          activeLocalModelCount: 1,
	          activeLocalModelEstimatedResidentMemoryBytes: 7 * gib,
	          activeLocalModelActualResidentMemoryBytes: 5 * gib,
        },
        selectedProfileId: "literesearcher-4b-q8-0",
        contextTokens: 65536,
        reservation: {
          status: "passed",
          profileId: "literesearcher-4b-q8-0",
        },
        coverage: {
          observedPhysicalMemoryClasses: ["64gb"],
          missingPhysicalMemoryClasses: ["16gb", "32gb", "128gb-plus"],
        },
        artifactPath: ".ambient/local-deep-research/memory-telemetry/2026-05-28T17-00-00-000Z-64gb-recorded.json",
        markdownPath: ".ambient/local-deep-research/memory-telemetry/2026-05-28T17-00-00-000Z-64gb-recorded.md",
      });
      await expect(readFile(join(workspace, result.artifactPath), "utf8")).resolves.toContain("\"physicalMemoryClass\": \"64gb\"");
      await expect(readFile(join(workspace, result.markdownPath), "utf8")).resolves.toContain("Local Deep Research Memory Telemetry");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("writes a coverage report from the latest real telemetry artifact per target class", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-ldr-memory-telemetry-coverage-"));
    try {
      await runLocalDeepResearchMemoryTelemetry({
        workspacePath: workspace,
        machineFacts: hostFacts(16, 10),
        now: () => new Date("2026-05-28T17:10:00.000Z"),
      });
      await runLocalDeepResearchMemoryTelemetry({
        workspacePath: workspace,
        machineFacts: hostFacts(32, 24),
        now: () => new Date("2026-05-28T17:11:00.000Z"),
      });
      await runLocalDeepResearchMemoryTelemetry({
        workspacePath: workspace,
        machineFacts: hostFacts(64, 50),
        now: () => new Date("2026-05-28T17:12:00.000Z"),
      });
      await runLocalDeepResearchMemoryTelemetry({
        workspacePath: workspace,
        machineFacts: hostFacts(128, 96),
        now: () => new Date("2026-05-28T17:13:00.000Z"),
      });

      const result = await runLocalDeepResearchMemoryTelemetryCoverage({
        workspacePath: workspace,
        now: () => new Date("2026-05-28T17:20:00.000Z"),
      });

      expect(result).toMatchObject({
        schemaVersion: "ambient-local-deep-research-memory-telemetry-coverage-v1",
        checkedAt: "2026-05-28T17:20:00.000Z",
        status: "complete",
        observedPhysicalMemoryClasses: ["16gb", "32gb", "64gb", "128gb-plus"],
        missingPhysicalMemoryClasses: [],
        artifactPath: ".ambient/local-deep-research/memory-telemetry/coverage/2026-05-28T17-20-00-000Z-complete.json",
        markdownPath: ".ambient/local-deep-research/memory-telemetry/coverage/2026-05-28T17-20-00-000Z-complete.md",
      });
      expect(result.observations.map((observation) => observation.physicalMemoryClass)).toEqual(["16gb", "32gb", "64gb", "128gb-plus"]);
      await expect(readFile(join(workspace, result.artifactPath), "utf8")).resolves.toContain("\"status\": \"complete\"");
      await expect(readFile(join(workspace, result.markdownPath), "utf8")).resolves.toContain("Local Deep Research Memory Telemetry Coverage");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("reports missing host classes when only a subset has real telemetry", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-ldr-memory-telemetry-missing-"));
    try {
      await runLocalDeepResearchMemoryTelemetry({
        workspacePath: workspace,
        machineFacts: hostFacts(128, 80),
        now: () => new Date("2026-05-28T17:25:00.000Z"),
      });

      const result = await runLocalDeepResearchMemoryTelemetryCoverage({
        workspacePath: workspace,
        now: () => new Date("2026-05-28T17:26:00.000Z"),
      });

      expect(result).toMatchObject({
        status: "missing",
        observedPhysicalMemoryClasses: ["128gb-plus"],
        missingPhysicalMemoryClasses: ["16gb", "32gb", "64gb"],
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("can write a real current-host observation into the configured workspace", async () => {
    const configuredWorkspace = process.env.AMBIENT_LOCAL_DEEP_RESEARCH_MEMORY_TELEMETRY_WORKSPACE?.trim();
    if (!configuredWorkspace) return;

    const result = await runLocalDeepResearchMemoryTelemetry({
      workspacePath: resolve(configuredWorkspace),
      now: () => new Date("2026-05-28T17:30:00.000Z"),
    });

    expect(result.schemaVersion).toBe("ambient-local-deep-research-memory-telemetry-v1");
    expect(result.artifactPath).toContain(".ambient/local-deep-research/memory-telemetry/");
    expect(result.coverage.targetPhysicalMemoryClasses).toEqual(targetPhysicalMemoryClasses());

    const coverage = await runLocalDeepResearchMemoryTelemetryCoverage({
      workspacePath: resolve(configuredWorkspace),
      now: () => new Date("2026-05-28T17:31:00.000Z"),
    });
    expect(coverage.artifactPath).toContain(".ambient/local-deep-research/memory-telemetry/coverage/");
    if (result.currentHost.physicalMemoryClass !== "unknown") {
      expect(coverage.observedPhysicalMemoryClasses).toContain(result.currentHost.physicalMemoryClass);
    }
  });
});

function hostFacts(memoryGiB: number, availableGiB: number) {
  return {
    platform: "darwin",
    arch: "arm64",
    memoryBytes: memoryGiB * gib,
    availableMemoryBytes: availableGiB * gib,
    memoryPressure: "normal" as const,
  };
}

function residentFixture(): LocalLlamaResidentProcess {
  return {
    capability: "minicpm-v",
    id: "minicpm-v:1234",
    pid: 1234,
    running: true,
    statePath: "/workspace/.ambient/vision/minicpm-v/state/server-state.json",
    contextTokens: 8192,
	    estimatedResidentMemoryBytes: 7 * gib,
	    actualResidentMemoryBytes: 5 * gib,
	    startedAt: "2026-05-28T16:55:00.000Z",
	  };
}
