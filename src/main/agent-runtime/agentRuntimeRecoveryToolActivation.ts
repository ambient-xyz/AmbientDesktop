import type { RuntimeSessionRecoveryContext } from "./agentRuntimeAssistantRetryInput";
import { INTERRUPTED_TOOL_CALL_RECOVERY_TOOL_NAMES } from "./agentRuntimeInterruptedRecoveryTools";

export function recoveryToolNamesForSessionRecovery(
  recovery?: Pick<RuntimeSessionRecoveryContext, "kind">,
): readonly string[] {
  if (!recovery) return [];
  if (
    recovery.kind === "interrupted_tool_call_recovery" ||
    recovery.kind === "provider_interruption_continuation"
  ) {
    return INTERRUPTED_TOOL_CALL_RECOVERY_TOOL_NAMES;
  }
  return [];
}

export function activeToolNamesForAgentRuntimeSession(input: {
  agentRuntimeActiveTools: readonly string[];
  recoveryToolNames: readonly string[];
  transcriptRehydratedToolNames: readonly string[];
}): string[] {
  return [...new Set([
    ...input.agentRuntimeActiveTools,
    ...input.recoveryToolNames,
    ...input.transcriptRehydratedToolNames,
  ])];
}
