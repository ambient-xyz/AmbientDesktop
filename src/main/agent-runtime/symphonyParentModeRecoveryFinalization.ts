import { piAssistantMessageMetadata } from "./agentRuntimeAssistantMessageMetadata";
import {
  SYMPHONY_PARENT_MODE_MISSING_WORKFLOW_TASK_ERROR,
  SYMPHONY_PARENT_MODE_RECOVERY_ACTIONS,
  type SymphonyParentModePolicy,
} from "./agentRuntimeSymphonyParentMode";

export interface SymphonyParentModeRecoveryFinalizationMessage {
  content: string;
  metadata: Record<string, unknown>;
}

export function symphonyParentModeRecoveryFinalizationMessage(input: {
  message?: string | undefined;
  policy?: SymphonyParentModePolicy | undefined;
}): SymphonyParentModeRecoveryFinalizationMessage {
  const message = input.message?.trim() || SYMPHONY_PARENT_MODE_MISSING_WORKFLOW_TASK_ERROR;
  const policy = input.policy;
  const details = [
    policy ? `Expected workflow tool: ${policy.expectedWorkflowToolName}` : undefined,
    policy ? `Expected source kind: ${policy.expectedWorkflowSourceKind}` : undefined,
    policy ? `Expected pattern: ${policy.expectedPatternId}` : undefined,
    policy ? `Launch requirement: ${policy.launchRequirement}` : undefined,
    `Reason: ${message}`,
  ].filter((line): line is string => Boolean(line));
  const actionLines = SYMPHONY_PARENT_MODE_RECOVERY_ACTIONS.map(
    (action) => `- ${action.label}: ${action.description}`,
  );

  return {
    content: [
      "Symphony launch needs a recovery choice.",
      "",
      "Ambient stopped the parent because conductor mode did not verify a callable workflow launch for this run. The parent cannot replace child work by reading files, searching, browsing, running shell commands, verifying, mutating, or answering directly.",
      "",
      "Available recovery choices:",
      ...actionLines,
    ].join("\n"),
    metadata: {
      ...piAssistantMessageMetadata("error"),
      symphonyParentModeRecovery: {
        schemaVersion: "ambient-symphony-parent-mode-recovery-v1",
        message,
        expectedWorkflowToolName: policy?.expectedWorkflowToolName,
        expectedWorkflowSourceKind: policy?.expectedWorkflowSourceKind,
        expectedPatternId: policy?.expectedPatternId,
        launchRequirement: policy?.launchRequirement,
        directExecutionPolicy: policy?.directExecutionPolicy,
        actionRequired: true,
        actions: SYMPHONY_PARENT_MODE_RECOVERY_ACTIONS.map((action) => ({ ...action })),
        details,
      },
    },
  };
}
