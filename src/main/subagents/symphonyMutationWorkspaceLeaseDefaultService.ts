import { isGitRepository } from "../git/gitWorktrees";
import { createSymphonyMutationWorkspaceLeaseService } from "./symphonyMutationWorkspaceLeaseService";

export {
  buildSymphonyMutationPromotionBundle,
  createSymphonyMutationWorkspaceLeaseService,
  heartbeatSymphonyMutationWorkspaceLease,
  listSymphonyMutationWorkspaceFiles,
  releaseSymphonyMutationWorkspaceLease,
  SYMPHONY_MUTATION_PROMOTION_BUNDLE_SCHEMA_VERSION,
  SYMPHONY_MUTATION_WORKSPACE_LEASE_SERVICE_SCHEMA_VERSION,
  type AcquireSymphonyMutationWorkspaceLeaseInput,
  type AcquireSymphonyMutationWorkspaceLeaseResult,
  type SymphonyMutationPromotionBundle,
  type SymphonyMutationWorkspaceLeaseService,
  type SymphonyMutationWorkspaceLeaseServiceDependencies,
  type SymphonyMutationWorkspaceLeaseStore,
} from "./symphonyMutationWorkspaceLeaseService";

const service = createSymphonyMutationWorkspaceLeaseService({
  isGitWorkspace: isGitRepository,
});

export const acquireSymphonyMutationWorkspaceLease = service.acquireSymphonyMutationWorkspaceLease;
