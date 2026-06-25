import { createProgramAuthorityCommands } from "./programAuthorityCommands.mjs";
import { createProgramDeploymentCommands } from "./programDeploymentCommands.mjs";

export function createProgramLifecycleCommands(dependencies) {
  return {
    ...createProgramDeploymentCommands(dependencies),
    ...createProgramAuthorityCommands(dependencies),
  };
}
