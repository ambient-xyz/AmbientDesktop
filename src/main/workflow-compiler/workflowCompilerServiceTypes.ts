import type { PermissionMode } from "../../shared/permissionTypes";
import type { SearchRoutingSettings } from "../../shared/webResearchTypes";
import type {
  WorkflowCompileProgress,
  WorkflowExplorationTraceSummary,
  WorkflowPromptCacheCheckpoint,
} from "../../shared/workflowTypes";
import type { DesktopToolDescriptor } from "./workflowCompilerDesktopToolFacade";
import type { PluginMcpToolRegistration } from "./workflowCompilerPluginsFacade";
import type { ProjectStore } from "./workflowCompilerProjectStoreFacade";
import type { AmbientRetryPolicy } from "./workflowCompilerAmbientFacade";
import type { WorkflowConnectorDescriptor, WorkflowPiProgress } from "./workflowCompilerWorkflowFacade";
import type { WorkflowCompilerCallableInvocationContext } from "./workflowCompilerCallableInvocationPrompt";

export interface CompileWorkflowArtifactInput {
  store: ProjectStore;
  userRequest: string;
  workflowThreadId?: string;
  revisionId?: string;
  workspaceSummary?: string;
  toolDescriptors: DesktopToolDescriptor[];
  pluginRegistrations?: PluginMcpToolRegistration[];
  connectorDescriptors?: WorkflowConnectorDescriptor[];
  explorationTraces?: WorkflowExplorationTraceSummary[];
  stateRoot: string;
  model: string;
  permissionMode?: PermissionMode;
  searchRoutingSettings?: SearchRoutingSettings;
  baseUrl?: string;
  retryPolicy?: AmbientRetryPolicy;
  debugRewriteContext?: string;
  callableWorkflowInvocation?: WorkflowCompilerCallableInvocationContext;
  provider?: WorkflowCompilerProvider;
  onProgress?: (progress: WorkflowCompileProgress) => void;
}

export interface WorkflowCompilerProvider {
  discoverCapabilities?(input: { prompt: string; model: string; onProgress?: (progress: WorkflowPiProgress) => void }): Promise<unknown>;
  compileProgramIr?(input: {
    prompt: string;
    model: string;
    cacheCheckpoint?: WorkflowPromptCacheCheckpoint;
    onProgress?: (progress: WorkflowPiProgress) => void;
  }): Promise<unknown>;
  compilePlanDsl?(input: {
    prompt: string;
    model: string;
    cacheCheckpoint?: WorkflowPromptCacheCheckpoint;
    onProgress?: (progress: WorkflowPiProgress) => void;
  }): Promise<unknown>;
  repairProgramIr?(input: {
    prompt: string;
    model: string;
    cacheCheckpoint?: WorkflowPromptCacheCheckpoint;
    attempt: number;
    onProgress?: (progress: WorkflowPiProgress) => void;
  }): Promise<unknown>;
}
