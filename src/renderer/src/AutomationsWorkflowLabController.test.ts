import { describe, expect, it } from "vitest";

import type { WorkflowLabRun, WorkflowRecordingLibraryEntry } from "../../shared/types";
import {
  workflowLabCompletionStatus,
  workflowLabCreateRunInput,
  workflowLabInitialGoal,
  workflowLabProgressState,
  workflowLabRunningState,
} from "./AutomationsWorkflowLabController";

describe("Automations workflow lab controller", () => {
  it("builds the default run input beside the Lab owner", () => {
    const playbook = workflowPlaybook({ id: "playbook-1", title: "Inbox triage" });

    expect(workflowLabInitialGoal(playbook)).toBe("Improve reliability for Inbox triage.");
    expect(workflowLabCreateRunInput(playbook, "  ")).toEqual({
      workflowId: "playbook-1",
      goal: "Improve reliability for Inbox triage.",
      metricEmphasis: "balanced",
      attemptBudget: 5,
      plateauThreshold: 0.03,
      heldOutEnabled: true,
    });
    expect(workflowLabCreateRunInput(playbook, "  Reduce retry drift.  ").goal).toBe("Reduce retry drift.");
  });

  it("formats completion status from the accepted best variant", () => {
    expect(workflowLabCompletionStatus(labRun()).message).toBe("Best variant scored 86/100.");
    expect(workflowLabCompletionStatus({ ...labRun(), bestVariantId: undefined }).message)
      .toBe("Workflow Lab completed without an accepted candidate.");
  });

  it("keeps progress polling updates scoped to the active run", () => {
    const current = labRun({ id: "run-1", status: "draft" });
    const next = labRun({ id: "run-1", status: "running" });
    const other = labRun({ id: "run-2", status: "completed" });

    expect(workflowLabRunningState(current, "run-1")?.status).toBe("running");
    expect(workflowLabRunningState(current, "other")).toBe(current);
    expect(workflowLabProgressState(current, next)).toBe(next);
    expect(workflowLabProgressState(current, other)).toBe(current);
  });
});

function workflowPlaybook(overrides: Partial<WorkflowRecordingLibraryEntry> = {}): WorkflowRecordingLibraryEntry {
  return {
    id: "playbook-1",
    title: "Inbox triage",
    version: 3,
    enabled: true,
    savedAt: "2026-06-14T10:00:00.000Z",
    manifestPath: "/tmp/workspace/workflow.json",
    markdownPath: "/tmp/workspace/workflow.md",
    sidecarPath: "/tmp/workspace/workflow.sidecar.json",
    transcriptPath: "/tmp/workspace/transcript.json",
    summary: "Classify incoming messages.",
    toolNames: ["gmail.search"],
    outputShape: ["summary"],
    versions: [],
    ...overrides,
  };
}

function labRun(overrides: Partial<WorkflowLabRun> = {}): WorkflowLabRun {
  return {
    id: "lab-run-1",
    workflowId: "playbook-1",
    workflowTitle: "Inbox triage",
    baseVersion: 3,
    goal: "Improve recovery.",
    metricEmphasis: "balanced",
    attemptBudget: 5,
    plateauThreshold: 0.03,
    heldOutEnabled: true,
    status: "completed",
    bestVariantId: "variant-2",
    createdAt: "2026-06-14T10:00:00.000Z",
    updatedAt: "2026-06-14T10:01:00.000Z",
    artifactPath: "/tmp/workspace/lab-run.json",
    evaluationCases: [],
    audit: ["created lab run", "accepted variant 2"],
    variants: [
      {
        id: "variant-2",
        runId: "lab-run-1",
        attempt: 2,
        hypothesis: "Tighten recovery criteria.",
        patch: {
          draft: {
            intent: "Classify incoming messages.",
            inputs: ["Inbox"],
            successfulExamples: [],
            doNot: [],
            validation: ["Confirm recovery cue."],
            outputShape: ["summary"],
          },
          summary: "Tightened retry recovery cues.",
          changedFields: ["validation", "title"],
        },
        status: "accepted",
        score: 86,
        rationale: "More robust while preserving intent.",
        createdAt: "2026-06-14T10:00:30.000Z",
        updatedAt: "2026-06-14T10:00:40.000Z",
        evaluations: [],
      },
    ],
    ...overrides,
  };
}
