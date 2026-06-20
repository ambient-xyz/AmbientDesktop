import {
  registerWorkflowAutomationDomainIpc,
  type RegisterWorkflowAutomationDomainIpcDependencies,
} from "./registerWorkflowAutomationDomainIpc";

export function registerMainWorkflowAutomationIpc(
  deps: Record<string, unknown>,
): void {
  registerWorkflowAutomationDomainIpc({
    ...deps,
    getFeatureFlagSnapshot: deps.currentFeatureFlagSnapshot,
  } as unknown as RegisterWorkflowAutomationDomainIpcDependencies);
}
