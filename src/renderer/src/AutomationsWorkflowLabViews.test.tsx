import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { WorkflowLabRun, WorkflowRecordingLibraryEntry } from "../../shared/types";
import { WorkflowLabPanel, workflowLabPanelModel } from "./AutomationsWorkflowLabViews";

describe("Automations workflow lab views", () => {
  it("derives lab panel state without owning run commands", () => {
    const model = workflowLabPanelModel(playbook(), labRun(), "run");

    expect(model.statusBadge).toBe("running · 2/5");
    expect(model.active).toBe(true);
    expect(model.canRun).toBe(false);
    expect(model.canAdopt).toBe(false);
    expect(model.bestVariant?.score).toBe(86);
    expect(model.progress).toMatchObject({
      title: "Running Workflow Lab variants",
      detail: "2/5 variants evaluated. Ambient/Pi judging continues until the plateau gate or attempt budget stops the run.",
      percent: 40,
    });
  });

  it("ignores runs from other playbooks", () => {
    const model = workflowLabPanelModel(playbook(), { ...labRun(), workflowId: "other-playbook" }, undefined);

    expect(model.run).toBeUndefined();
    expect(model.statusBadge).toBe("not started");
    expect(model.canRun).toBe(false);
  });

  it("renders run controls, score evidence, best variant, recent variants, and audit trail", () => {
    const markup = renderToStaticMarkup(
      <WorkflowLabPanel
        playbook={playbook()}
        run={labRun()}
        busy="run"
        goal="Improve recovery."
        status={{ kind: "info", message: "Running Workflow Lab variants." }}
        onGoalChange={() => undefined}
        onCreateRun={() => undefined}
        onStartRun={() => undefined}
        onStopRun={() => undefined}
        onAdoptBest={() => undefined}
      />,
    );

    expect(markup).toContain("Workflow Lab");
    expect(markup).toContain("running · 2/5");
    expect(markup).toContain("best 86/100");
    expect(markup).toContain("held-out gate");
    expect(markup).toContain("Running variants");
    expect(markup).toContain("Running Workflow Lab variants.");
    expect(markup).toContain("Current Best");
    expect(markup).toContain("Tightened retry recovery cues.");
    expect(markup).toContain("#2 · Accepted");
    expect(markup).toContain("Audit Trail");
    expect(markup).toContain("accepted variant 2");
  });
});

function playbook(): WorkflowRecordingLibraryEntry {
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
  };
}

function labRun(): WorkflowLabRun {
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
    status: "running",
    bestVariantId: "variant-2",
    createdAt: "2026-06-14T10:00:00.000Z",
    updatedAt: "2026-06-14T10:01:00.000Z",
    artifactPath: "/tmp/workspace/lab-run.json",
    evaluationCases: [],
    audit: ["created lab run", "accepted variant 2"],
    variants: [
      {
        id: "variant-1",
        runId: "lab-run-1",
        attempt: 1,
        hypothesis: "Add explicit error classification.",
        patch: {
          draft: reviewDraft(),
          summary: "Added error classification.",
          changedFields: ["validation"],
        },
        status: "rejected",
        score: 64,
        createdAt: "2026-06-14T10:00:10.000Z",
        updatedAt: "2026-06-14T10:00:20.000Z",
        evaluations: [],
      },
      {
        id: "variant-2",
        runId: "lab-run-1",
        attempt: 2,
        hypothesis: "Tighten recovery criteria.",
        patch: {
          draft: reviewDraft(),
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
  };
}

function reviewDraft() {
  return {
    intent: "Classify incoming messages.",
    inputs: ["Inbox"],
    successfulExamples: [],
    doNot: [],
    validation: ["Confirm recovery cue."],
    outputShape: ["summary"],
  };
}
