import { describe, expect, it } from "vitest";

import type { WorkflowArtifactSummary } from "../../shared/types";
import {
  workflowRunArtifactBusyKey,
  workflowRunLimitOverridesForArtifact,
  workflowTotalRuntimeResumeOverrides,
} from "./AutomationsWorkflowArtifactController";

describe("Automations workflow artifact controller helpers", () => {
  it("derives foreground run limits from artifact manifests and user settings", () => {
    const artifact = workflowArtifact({ maxRunMs: 900_000 });

    expect(
      workflowRunLimitOverridesForArtifact(
        { idleTimeoutMs: 120_000, totalLimitMode: "manifest" },
        artifact,
      ),
    ).toEqual({ idleTimeoutMs: 120_000 });

    expect(
      workflowRunLimitOverridesForArtifact(
        { idleTimeoutMs: 120_000, totalLimitMode: "disabled" },
        artifact,
      ),
    ).toEqual({ idleTimeoutMs: 120_000, maxRunMs: null });
  });

  it("builds resume overrides for total-runtime pause actions", () => {
    expect(
      workflowTotalRuntimeResumeOverrides(
        { idleTimeoutMs: 300_000, totalLimitMode: "manifest" },
        "extend_total_runtime",
      ),
    ).toEqual({ idleTimeoutMs: 300_000, maxRunMs: 600_000 });

    expect(
      workflowTotalRuntimeResumeOverrides(
        { idleTimeoutMs: 300_000, totalLimitMode: "manifest" },
        "remove_total_runtime_cap",
      ),
    ).toEqual({ idleTimeoutMs: 300_000, maxRunMs: null });
  });

  it("keeps workflow run busy keys stable for artifact and resume actions", () => {
    expect(workflowRunArtifactBusyKey({ artifactId: "artifact-1", mode: "dry_run" })).toBe("dry_run:artifact-1");
    expect(workflowRunArtifactBusyKey({ artifactId: "artifact-1", mode: "execute" })).toBe("execute:artifact-1");
    expect(workflowRunArtifactBusyKey({ artifactId: "artifact-1", mode: "execute", resumeFromRunId: "run-1" })).toBe("resume:run-1");
  });
});

function workflowArtifact(manifest: Partial<WorkflowArtifactSummary["manifest"]> = {}): Pick<WorkflowArtifactSummary, "manifest"> {
  return {
    manifest,
  } as Pick<WorkflowArtifactSummary, "manifest">;
}
