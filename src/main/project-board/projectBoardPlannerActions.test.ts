import { describe, expect, it } from "vitest";
import { validateProposalJsonlRecordArtifact } from "./projectBoardArtifacts";
import { projectBoardPlannerActionsFromProgressiveRecords } from "./projectBoardPlannerActions";

describe("projectBoardPlannerActionsFromProgressiveRecords", () => {
  it("projects progressive records into explicit planner actions", () => {
    const actions = projectBoardPlannerActionsFromProgressiveRecords({
      proposalRunId: "run-1",
      createdAt: "2026-05-04T12:00:00.000Z",
      records: [
        validateProposalJsonlRecordArtifact({
          type: "progress",
          stage: "section_failed",
          title: "Failed section 2/3",
          summary: "Combat section failed.",
          createdAt: "2026-05-04T12:00:00.000Z",
          metadata: {
            sectionStatus: "failed",
            sectionId: "section-combat",
            sectionHeading: "Combat",
            sourceId: "source-gdd",
          },
        }),
        validateProposalJsonlRecordArtifact({
          type: "candidate_card",
          sourceId: "synthesis:shell",
          title: "Create shell",
          description: "Create the shell.",
          candidateStatus: "ready_to_create",
          priority: 1,
          phase: "Foundation",
          labels: ["foundation"],
          blockedBy: [],
          sourceRefs: [{ sourceId: "source-gdd" }],
          acceptanceCriteria: ["Canvas mounts."],
          testPlan: { unit: [], integration: ["Run app."], visual: [], manual: [] },
        }),
        validateProposalJsonlRecordArtifact({
          type: "source_coverage",
          sourceId: "source-gdd",
          range: "lines:10-20",
          status: "covered",
          cardIds: ["synthesis:shell"],
          updatedAt: "2026-05-04T12:00:00.000Z",
        }),
        validateProposalJsonlRecordArtifact({
          type: "proposal_final",
          summary: "Planner produced a shell proposal.",
          goal: "Build the MVP.",
          currentState: "Sources are understood.",
          targetUser: "Browser players.",
          qualityBar: "Proof required.",
          assumptions: ["Use PixiJS."],
          questions: [],
          sourceNotes: ["GDD is primary."],
          createdAt: "2026-05-04T12:00:00.000Z",
        }),
      ],
    });

    expect(actions.map((action) => action.action)).toEqual([
      "section_status_updated",
      "candidate_card_created",
      "source_coverage_reported",
      "proposal_finalized",
    ]);
    expect(actions[0]).toMatchObject({
      proposalRunId: "run-1",
      sourceId: "source-gdd",
      sectionId: "section-combat",
      sectionHeading: "Combat",
      status: "failed",
    });
    expect(actions[1]).toMatchObject({
      cardId: "synthesis:shell",
      sourceId: "source-gdd",
      title: "Create shell",
    });
    expect(actions[3]).toMatchObject({
      title: "Finalized planning proposal",
      summary: "Planner produced a shell proposal.",
      status: "completed",
    });
  });
});
