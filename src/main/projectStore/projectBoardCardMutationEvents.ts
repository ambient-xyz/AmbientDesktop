import type { ProjectBoardEvent } from "../../shared/projectBoardTypes";

export type ProjectBoardCardMutationEventInput = Omit<ProjectBoardEvent, "id" | "createdAt"> & {
  createdAt?: string;
};
