import type {
  AddProjectBoardCardRunFeedbackInput,
  ProjectBoardCard,
  ProjectBoardEvent,
  ProjectBoardSource,
  ProjectBoardSummary,
} from "../../shared/projectBoardTypes";

export type ProjectBoardSourceInput = Omit<ProjectBoardSource, "id" | "boardId" | "createdAt" | "updatedAt">;

export type ProjectBoardSourceEventInput = Omit<ProjectBoardEvent, "id" | "createdAt"> & {
  createdAt?: string;
};

export interface ProjectStoreProjectBoardSourceRepositoryDeps {
  getProjectBoard(boardId: string): ProjectBoardSummary | undefined;
  getProjectBoardCard(cardId: string): ProjectBoardCard;
  listProjectBoardEvents(boardId: string, limit?: number): ProjectBoardEvent[];
  listProjectBoardSources(boardId: string): ProjectBoardSource[];
  listProjectBoardCards(boardId: string): ProjectBoardCard[];
  addProjectBoardCardRunFeedback(input: AddProjectBoardCardRunFeedbackInput): ProjectBoardCard;
  appendProjectBoardEvent(input: ProjectBoardSourceEventInput): void;
}
