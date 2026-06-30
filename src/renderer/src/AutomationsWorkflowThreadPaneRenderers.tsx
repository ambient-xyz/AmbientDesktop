import { createWorkflowThreadPaneRendererOwners } from "./AutomationsWorkflowThreadPaneRendererOwners";
import type { AutomationsWorkflowThreadPaneRenderersInput } from "./AutomationsWorkflowThreadPaneRenderersTypes";

export type { AutomationsWorkflowThreadPaneRenderersInput } from "./AutomationsWorkflowThreadPaneRenderersTypes";

export function createAutomationsWorkflowThreadPaneRenderers(input: AutomationsWorkflowThreadPaneRenderersInput) {
  return createWorkflowThreadPaneRendererOwners(input);
}
