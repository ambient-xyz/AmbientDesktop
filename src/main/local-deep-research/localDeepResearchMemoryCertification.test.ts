import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  localDeepResearchMemoryCertificationChecks,
  runLocalDeepResearchMemoryCertification,
} from "./localDeepResearchMemoryCertification";

describe("Local Deep Research memory certification", () => {
  it("covers representative 16/32/64/128 GB selection and overlap fixtures", () => {
    const checks = localDeepResearchMemoryCertificationChecks();

    expect(checks.every((check) => check.status === "passed")).toBe(true);
    expect(checks.map((check) => check.id)).toEqual([
      "constrained-16gb",
      "standard-32gb",
      "high-64gb",
      "workstation-128gb",
      "standard-32gb-resident-warning",
      "high-64gb-resident-q8-reserved",
      "high-64gb-resident-q4-fallback",
      "workstation-128gb-resident-q8-reserved",
      "standard-32gb-q8-override-warned",
      "constrained-16gb-q8-override-rejected",
    ]);
    expect(checks.find((check) => check.id === "high-64gb-resident-q8-reserved")).toMatchObject({
      selectedProfileId: "literesearcher-4b-q8-0",
      contextTokens: 65536,
      reservation: {
        status: "passed",
        profileId: "literesearcher-4b-q8-0",
      },
    });
    expect(checks.find((check) => check.id === "high-64gb-resident-q4-fallback")).toMatchObject({
      selectedProfileId: "literesearcher-4b-q4-k-m",
      contextTokens: 16384,
      reservation: {
        status: "failed",
        profileId: "literesearcher-4b-q8-0",
      },
    });
  });

  it("writes JSON and Markdown certification artifacts", async () => {
    const configuredWorkspace = process.env.AMBIENT_LOCAL_DEEP_RESEARCH_MEMORY_CERTIFICATION_WORKSPACE?.trim();
    const workspace = configuredWorkspace ? resolve(configuredWorkspace) : await mkdtemp(join(tmpdir(), "ambient-ldr-memory-cert-"));
    try {
      const result = await runLocalDeepResearchMemoryCertification({
        workspacePath: workspace,
        now: () => new Date("2026-05-28T15:30:00.000Z"),
      });

      expect(result).toMatchObject({
        schemaVersion: "ambient-local-deep-research-memory-certification-v1",
        status: "passed",
        artifactPath: ".ambient/local-deep-research/memory-certification/2026-05-28T15-30-00-000Z-passed.json",
        markdownPath: ".ambient/local-deep-research/memory-certification/2026-05-28T15-30-00-000Z-passed.md",
      });
      await expect(readFile(join(workspace, result.artifactPath), "utf8")).resolves.toContain("high-64gb-resident-q8-reserved");
      await expect(readFile(join(workspace, result.markdownPath), "utf8")).resolves.toContain("Local Deep Research Memory Certification");
    } finally {
      if (!configuredWorkspace) await rm(workspace, { recursive: true, force: true });
    }
  });
});
