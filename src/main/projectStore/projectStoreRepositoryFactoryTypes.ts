import type Database from "better-sqlite3";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import type { ProjectStoreProjectBoardRepositoryFactory } from "./projectBoardRepositoryFactory";
import type { SubagentMailboxDeliveryStore, SubagentParentStopWaitBarrierStore } from "./projectStoreSubagentsFacade";

export interface ProjectStoreRepositoryFactoryHost extends SubagentMailboxDeliveryStore, SubagentParentStopWaitBarrierStore {
  readonly projectBoardRepos: ProjectStoreProjectBoardRepositoryFactory;
  requireDb(): Database.Database;
  getWorkspace(): WorkspaceState;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- existing ProjectStore callbacks will be typed down as their owners are extracted.
  [key: string]: any;
}
