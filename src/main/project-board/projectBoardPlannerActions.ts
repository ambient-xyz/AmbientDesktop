import {
  stableBoardArtifactId,
  validatePlannerActionArtifact,
  type PlannerActionArtifact,
  type ProposalJsonlRecordArtifact,
} from "./projectBoardArtifacts";

export interface ProjectBoardPlannerActionsInput {
  records: ProposalJsonlRecordArtifact[];
  proposalRunId?: string;
  createdAt?: string;
}

export function projectBoardPlannerActionsFromProgressiveRecords(
  input: ProjectBoardPlannerActionsInput,
): PlannerActionArtifact[] {
  const createdAt = input.createdAt ?? new Date().toISOString();
  return input.records.flatMap((record, index) => {
    if (record.type === "progress") {
      const metadata = looseMetadata(record.metadata);
      const sectionStatus = typeof metadata.sectionStatus === "string" ? metadata.sectionStatus : undefined;
      if (!sectionStatus) return [];
      return [
        plannerAction({
          proposalRunId: input.proposalRunId,
          action: "section_status_updated",
          sourceRecordType: record.type,
          sourceRecordKey: progressRecordKey(record, index),
          title: record.title,
          summary: record.summary,
          sourceId: stringValue(metadata.sourceId),
          sectionId: stringValue(metadata.sectionId),
          sectionHeading: stringValue(metadata.sectionHeading),
          status: sectionStatus,
          createdAt: record.createdAt,
          payload: { stage: record.stage, metadata },
        }),
      ];
    }
    if (record.type === "candidate_card") {
      return [
        plannerAction({
          proposalRunId: input.proposalRunId,
          action: "candidate_card_created",
          sourceRecordType: record.type,
          sourceRecordKey: record.sourceId,
          title: record.title,
          summary: record.description,
          sourceId: record.sourceRefs.find((ref) => ref.sourceId)?.sourceId,
          cardId: record.sourceId,
          createdAt,
          payload: {
            candidateStatus: record.candidateStatus,
            priority: record.priority,
            phase: record.phase,
            labels: record.labels,
            blockedBy: record.blockedBy,
            sourceRefs: record.sourceRefs,
          },
        }),
      ];
    }
    if (record.type === "question") {
      return [
        plannerAction({
          proposalRunId: input.proposalRunId,
          action: "question_created",
          sourceRecordType: record.type,
          sourceRecordKey: record.questionId,
          title: "Created planning question",
          summary: record.question,
          cardId: record.cardId,
          createdAt: record.createdAt,
          payload: { required: record.required, charterSection: record.charterSection },
        }),
      ];
    }
    if (record.type === "proposal_final") {
      return [
        plannerAction({
          proposalRunId: input.proposalRunId,
          action: "proposal_finalized",
          sourceRecordType: record.type,
          sourceRecordKey: stableBoardArtifactId("proposal-final-record", [record.summary, record.goal, record.createdAt]),
          title: "Finalized planning proposal",
          summary: record.summary,
          status: "completed",
          createdAt: record.createdAt,
          payload: {
            goal: record.goal,
            currentState: record.currentState,
            targetUser: record.targetUser,
            qualityBar: record.qualityBar,
            assumptions: record.assumptions,
            questions: record.questions,
            sourceNotes: record.sourceNotes,
            metadata: record.metadata,
          },
        }),
      ];
    }
    if (record.type === "source_coverage") {
      return [
        plannerAction({
          proposalRunId: input.proposalRunId,
          action: "source_coverage_reported",
          sourceRecordType: record.type,
          sourceRecordKey: stableBoardArtifactId("coverage-record", [record.sourceId, record.range, record.updatedAt]),
          title: "Reported source coverage",
          summary: record.note ?? `${record.sourceId} coverage is ${record.status}.`,
          sourceId: record.sourceId,
          status: record.status,
          createdAt: record.updatedAt,
          payload: { range: record.range, cardIds: record.cardIds },
        }),
      ];
    }
    if (record.type === "dependency_edge") {
      return [
        plannerAction({
          proposalRunId: input.proposalRunId,
          action: "dependency_linked",
          sourceRecordType: record.type,
          sourceRecordKey: stableBoardArtifactId("dependency-record", [record.fromCardId, record.toCardId, record.createdAt]),
          title: "Linked card dependency",
          summary: record.reason ?? `${record.toCardId} depends on ${record.fromCardId}.`,
          cardId: record.toCardId,
          createdAt: record.createdAt,
          payload: { fromCardId: record.fromCardId, toCardId: record.toCardId },
        }),
      ];
    }
    if (record.type === "warning") {
      return [
        plannerAction({
          proposalRunId: input.proposalRunId,
          action: "warning_reported",
          sourceRecordType: record.type,
          sourceRecordKey: stableBoardArtifactId("warning-record", [record.code, record.message, record.createdAt]),
          title: `Warning: ${record.code}`,
          summary: record.message,
          status: "warning",
          createdAt: record.createdAt,
          payload: { metadata: record.metadata },
        }),
      ];
    }
    if (record.type === "error") {
      return [
        plannerAction({
          proposalRunId: input.proposalRunId,
          action: "error_reported",
          sourceRecordType: record.type,
          sourceRecordKey: stableBoardArtifactId("error-record", [record.code, record.message, record.createdAt]),
          title: `Recoverable error: ${record.code}`,
          summary: record.message,
          sourceId: stringValue(record.metadata.sourceId),
          sectionId: stringValue(record.metadata.sectionId),
          status: record.recoverable ? "recoverable" : "terminal",
          createdAt: record.createdAt,
          payload: { recoverable: record.recoverable, metadata: record.metadata },
        }),
      ];
    }
    return [];
  });
}

export function plannerActionJsonlContent(actions: PlannerActionArtifact[]): string {
  return actions.map((action) => JSON.stringify(action)).join("\n").concat(actions.length > 0 ? "\n" : "");
}

function plannerAction(value: Omit<PlannerActionArtifact, "type" | "actionId">): PlannerActionArtifact {
  return validatePlannerActionArtifact({
    type: "planner_action",
    actionId: stableBoardArtifactId("planner-action", [
      value.proposalRunId,
      value.action,
      value.sourceRecordType,
      value.sourceRecordKey,
      value.createdAt,
    ]),
    ...value,
  });
}

function progressRecordKey(record: Extract<ProposalJsonlRecordArtifact, { type: "progress" }>, index: number): string {
  const metadata = looseMetadata(record.metadata);
  return stableBoardArtifactId("progress-record", [
    stringValue(metadata.sectionId),
    stringValue(metadata.sectionStatus),
    record.stage,
    record.createdAt,
    index,
  ]);
}

function looseMetadata(value: Record<string, unknown> | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
