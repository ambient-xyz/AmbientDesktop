import type { AmbientCliCapabilitySearchResponse } from "./workflowCompilerAmbientCliFacade";

export {
  buildWorkflowCompilerCapabilityDiscoveryPrompt,
  selectWorkflowCompilerConnectorDescriptors,
  selectWorkflowCompilerToolDescriptors,
  validateWorkflowCompilerCapabilityDiscoveryOutput,
  workflowCompilerDeniedConnectorIds,
  workflowCompilerRequiredBuiltinToolIntents,
} from "./workflowCompilerCapabilitySelection";
export type {
  WorkflowCompilerCapabilityDiscoveryPlan,
  WorkflowCompilerConnectorSelection,
  WorkflowCompilerConnectorSelectionInput,
  WorkflowCompilerRequiredBuiltinToolIntent,
  WorkflowCompilerToolSelection,
  WorkflowCompilerToolSelectionInput,
} from "./workflowCompilerCapabilitySelection";

export {
  canonicalizeWorkflowGraphLayout,
  validateWorkflowCompilerOutput,
  validateWorkflowGraphOutput,
  validateWorkflowSourceConnectorReferences,
  validateWorkflowSourceGoogleWorkspaceReferences,
  validateWorkflowSourceGraphMappings,
  validateWorkflowSourceReferences,
  workflowGraphWithSourceMappings,
} from "./workflowCompilerOutputValidation";
export type { ValidatedWorkflowCompilerOutput, WorkflowCompilerOutput } from "./workflowCompilerOutputValidation";

export interface WorkflowCompilerAmbientCliCapability {
  capabilityId: string;
  registryPluginId: string;
  packageId: string;
  packageName: string;
  command: string;
  description?: string;
  availability: "available" | "unavailable";
  risk: string[];
  missingEnv: string[];
  whyMatched: string[];
}

export function workflowAmbientCliCapabilitiesFromSearch(
  response: AmbientCliCapabilitySearchResponse,
): WorkflowCompilerAmbientCliCapability[] {
  return response.results.flatMap((result) =>
    result.commands.map((command) => ({
      capabilityId: command.capabilityId,
      registryPluginId: result.registryPluginId,
      packageId: result.packageId,
      packageName: result.packageName,
      command: command.name,
      ...(command.description ? { description: command.description } : {}),
      availability: result.availability,
      risk: command.risk,
      missingEnv: result.missingEnv,
      whyMatched: result.whyMatched,
    })),
  );
}
