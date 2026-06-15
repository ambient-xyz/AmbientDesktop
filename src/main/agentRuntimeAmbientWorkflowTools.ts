import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import {
  registerAmbientWorkflowArchiveTools,
  type AmbientWorkflowArchiveToolRegistrationOptions,
} from "./agentRuntimeAmbientWorkflowArchiveTools";
import {
  registerAmbientWorkflowInjectTool,
  type AmbientWorkflowInjectToolRegistrationOptions,
} from "./agentRuntimeAmbientWorkflowInjectTools";
import {
  registerAmbientWorkflowReadOnlyTools,
  type AmbientWorkflowReadOnlyToolRegistrationOptions,
} from "./agentRuntimeAmbientWorkflowReadOnlyTools";
import {
  registerAmbientWorkflowRestoreTool,
  type AmbientWorkflowRestoreToolRegistrationOptions,
} from "./agentRuntimeAmbientWorkflowRestoreTools";
import {
  registerAmbientWorkflowUpdateTool,
  type AmbientWorkflowUpdateToolRegistrationOptions,
} from "./agentRuntimeAmbientWorkflowUpdateTools";

export type AgentRuntimeAmbientWorkflowToolOptions =
  & AmbientWorkflowReadOnlyToolRegistrationOptions
  & AmbientWorkflowInjectToolRegistrationOptions
  & AmbientWorkflowUpdateToolRegistrationOptions
  & AmbientWorkflowArchiveToolRegistrationOptions
  & AmbientWorkflowRestoreToolRegistrationOptions;

export function registerAgentRuntimeAmbientWorkflowTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: AgentRuntimeAmbientWorkflowToolOptions,
): void {
  registerAmbientWorkflowReadOnlyTools(pi, options);
  registerAmbientWorkflowInjectTool(pi, options);
  registerAmbientWorkflowUpdateTool(pi, options);
  registerAmbientWorkflowArchiveTools(pi, options);
  registerAmbientWorkflowRestoreTool(pi, options);
}
