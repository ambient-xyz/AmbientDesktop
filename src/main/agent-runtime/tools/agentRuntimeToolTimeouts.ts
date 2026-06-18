import { firstPartyDesktopToolDescriptors } from "../agentRuntimeDesktopToolFacade";

const descriptorTimeoutsByToolName = new Map(
  firstPartyDesktopToolDescriptors().map((descriptor) => [descriptor.name, descriptor.defaultTimeoutMs] as const),
);

export function agentRuntimeToolExecutionIdleTimeoutMsForTool(
  configuredIdleTimeoutMs: number,
  toolName: string,
): number {
  const descriptorTimeoutMs = descriptorTimeoutsByToolName.get(toolName);
  return Math.max(configuredIdleTimeoutMs, descriptorTimeoutMs ?? 0);
}
