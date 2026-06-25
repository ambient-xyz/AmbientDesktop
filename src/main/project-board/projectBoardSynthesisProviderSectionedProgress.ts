import type { ProposalJsonlRecordArtifact } from "./projectBoardArtifacts";
import {
  appendProjectBoardPlannerWorkspaceRecords,
  createProjectBoardPlannerWorkspaceTailState,
  markProjectBoardPlannerWorkspaceTailRecords,
  pollProjectBoardPlannerWorkspaceRecords,
  type ProjectBoardPlannerWorkspace,
  type ProjectBoardPlannerWorkspaceTailState,
} from "./projectBoardPlannerWorkspace";
import type { ProjectBoardPlanningSection } from "./projectBoardSectionedPlanning";
import {
  guardedWorkspaceIoTask,
  lastValidPlannerRecord,
  plannerPauseProgressRecord,
  recordsNotAlreadySeen,
  type AmbientProjectBoardSynthesisProgress,
  type AmbientProjectBoardSynthesisProgressiveBatch,
  type ProjectBoardSynthesisPauseCheckInput,
} from "./projectBoardSynthesisProviderSupport";

export interface ProjectBoardSectionedProgressControllerInput {
  records: ProposalJsonlRecordArtifact[];
  sectionCount: number;
  plannerWorkspace: ProjectBoardPlannerWorkspace | undefined;
  shouldPause: ((input: ProjectBoardSynthesisPauseCheckInput) => boolean | Promise<boolean>) | undefined;
  onProgress: ((progress: AmbientProjectBoardSynthesisProgress) => void) | undefined;
  onProgressiveRecords: ((batch: AmbientProjectBoardSynthesisProgressiveBatch) => void) | undefined;
  getTotalPromptCharCount: () => number;
  getTotalResponseCharCount: () => number;
}

export interface ProjectBoardSectionedProgressController {
  workspaceTailState: ProjectBoardPlannerWorkspaceTailState;
  workspacePollErrorState: { warned: boolean };
  contentActivityToken: () => number;
  scheduleWorkspacePoll: (
    section: ProjectBoardPlanningSection,
    sectionNumber: number,
    currentSectionResponseChars?: number,
    includeIncompleteLastLine?: boolean,
  ) => void;
  flushWorkspacePollQueue: () => Promise<void>;
  recordPauseCheckpoint: (section: ProjectBoardPlanningSection, sectionNumber: number) => Promise<boolean>;
  emitSectionRecords: (
    section: ProjectBoardPlanningSection,
    sectionNumber: number,
    sectionRecords: ProposalJsonlRecordArtifact[],
    responseCharCount: number,
  ) => Promise<void>;
}

export function createProjectBoardSectionedProgressController(
  input: ProjectBoardSectionedProgressControllerInput,
): ProjectBoardSectionedProgressController {
  const workspaceTailState = createProjectBoardPlannerWorkspaceTailState(input.records);
  let workspacePollQueue = Promise.resolve();
  let workspaceActivityToken = 0;
  const workspacePollErrorState = { warned: false };

  const emitProgressiveRecords = (
    section: ProjectBoardPlanningSection,
    sectionNumber: number,
    records: ProposalJsonlRecordArtifact[],
    responseCharCount: number,
  ) => {
    input.onProgressiveRecords?.({
      records,
      section,
      sectionIndex: sectionNumber,
      sectionCount: input.sectionCount,
      promptCharCount: input.getTotalPromptCharCount(),
      responseCharCount,
      accumulatedRecordCount: input.records.length,
    });
  };

  const scheduleWorkspacePoll = (
    section: ProjectBoardPlanningSection,
    sectionNumber: number,
    currentSectionResponseChars = 0,
    includeIncompleteLastLine = false,
  ) => {
    if (!input.plannerWorkspace) return;
    workspacePollQueue = workspacePollQueue.then(
      guardedWorkspaceIoTask(
        async () => {
          const workspaceRecords = await pollProjectBoardPlannerWorkspaceRecords({
            workspace: input.plannerWorkspace,
            state: workspaceTailState,
            includeIncompleteLastLine,
          });
          const newRecords = recordsNotAlreadySeen(workspaceRecords, input.records);
          if (newRecords.length === 0) return;
          workspaceActivityToken += newRecords.length;
          input.records.push(...newRecords);
          emitProgressiveRecords(section, sectionNumber, newRecords, input.getTotalResponseCharCount() + currentSectionResponseChars);
        },
        workspacePollErrorState,
        input.onProgress,
      ),
    );
  };

  const recordPauseCheckpoint = async (section: ProjectBoardPlanningSection, sectionNumber: number): Promise<boolean> => {
    if (
      !(await input.shouldPause?.({
        phase: "section",
        sectionIndex: sectionNumber,
        sectionCount: input.sectionCount,
        recordCount: input.records.length,
        lastValidRecord: lastValidPlannerRecord(input.records),
      }))
    ) {
      return false;
    }
    const lastValidRecord = lastValidPlannerRecord(input.records);
    const pauseRecord = plannerPauseProgressRecord({
      phase: "section",
      sectionIndex: sectionNumber,
      sectionCount: input.sectionCount,
      recordCount: input.records.length,
      lastValidRecord,
      plannerSessionId: input.plannerWorkspace?.sessionId,
      summary: `Planning paused after section ${sectionNumber}/${input.sectionCount}; validated records through this checkpoint are reusable on resume.`,
    });
    markProjectBoardPlannerWorkspaceTailRecords(workspaceTailState, [pauseRecord]);
    await appendProjectBoardPlannerWorkspaceRecords(input.plannerWorkspace, [pauseRecord]);
    input.records.push(pauseRecord);
    emitProgressiveRecords(section, sectionNumber, [pauseRecord], input.getTotalResponseCharCount());
    input.onProgress?.({
      stage: "schema_validation",
      title: "Paused project-board planning",
      summary: `Paused after section ${sectionNumber}/${input.sectionCount}. Resume will reuse validated planner records and continue with remaining source coverage.`,
      metadata: {
        pauseRequested: true,
        sectionIndex: sectionNumber,
        sectionCount: input.sectionCount,
        plannerSessionId: input.plannerWorkspace?.sessionId,
        lastValidRecordId: lastValidRecord?.recordId,
        lastValidRecordType: lastValidRecord?.recordType,
        progressiveRecordCount: input.records.length,
      },
      promptCharCount: input.getTotalPromptCharCount(),
      responseCharCount: input.getTotalResponseCharCount(),
      cardCount: input.records.filter((record) => record.type === "candidate_card").length,
      questionCount: input.records.filter((record) => record.type === "question").length,
    });
    return true;
  };

  const emitSectionRecords = async (
    section: ProjectBoardPlanningSection,
    sectionNumber: number,
    sectionRecords: ProposalJsonlRecordArtifact[],
    responseCharCount: number,
  ) => {
    if (sectionRecords.length === 0) return;
    markProjectBoardPlannerWorkspaceTailRecords(workspaceTailState, sectionRecords);
    await appendProjectBoardPlannerWorkspaceRecords(input.plannerWorkspace, sectionRecords);
    input.records.push(...sectionRecords);
    emitProgressiveRecords(section, sectionNumber, sectionRecords, responseCharCount);
  };

  return {
    workspaceTailState,
    workspacePollErrorState,
    contentActivityToken: () => workspaceActivityToken,
    scheduleWorkspacePoll,
    flushWorkspacePollQueue: () => workspacePollQueue,
    recordPauseCheckpoint,
    emitSectionRecords,
  };
}
