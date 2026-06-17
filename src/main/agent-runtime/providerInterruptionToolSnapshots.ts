import type {
  InterruptedToolCallRecoverySnapshot,
  ToolArgumentProgressSnapshot,
  ToolIntentSnapshot,
} from "../../shared/types";
import type { ProviderInterruptionToolSnapshot } from "./provider-continuation/agentRuntimeProviderContinuationHelpers";
import { compactToolInputPreview } from "./provider-continuation/agentRuntimeProviderDiagnostics";

export type PersistPreparedProviderInterruptionArguments = (input: {
  workspacePath: string;
  runId: string;
  toolCallId: string;
  inputText: string;
}) => Pick<
  ProviderInterruptionToolSnapshot,
  "recoveryArgumentPath" | "workspaceRelativeRecoveryArgumentPath" | "recoveryArgumentSha256" | "recoveryArgumentParseStatus"
>;

export type RuntimeOpenProviderInterruptionToolSnapshotsInput = {
  toolCallIds: Iterable<string>;
  workspacePath: string;
  runId: string;
  progressForToolCall: (toolCallId: string) => ToolArgumentProgressSnapshot | undefined;
  toolInputs: ReadonlyMap<string, string>;
  toolRecoveryInputs: ReadonlyMap<string, string>;
  toolLabels: ReadonlyMap<string, string>;
  startedToolCallIds: ReadonlySet<string>;
  toolIntents: ReadonlyMap<string, ToolIntentSnapshot>;
  persistPreparedArguments: PersistPreparedProviderInterruptionArguments;
};

export function runtimeOpenProviderInterruptionToolSnapshots({
  toolCallIds,
  workspacePath,
  runId,
  progressForToolCall,
  toolInputs,
  toolRecoveryInputs,
  toolLabels,
  startedToolCallIds,
  toolIntents,
  persistPreparedArguments,
}: RuntimeOpenProviderInterruptionToolSnapshotsInput): ProviderInterruptionToolSnapshot[] {
  const snapshots: ProviderInterruptionToolSnapshot[] = [];
  for (const toolCallId of [...toolCallIds]) {
    const progress = progressForToolCall(toolCallId);
    const inputContent = toolInputs.get(toolCallId);
    const recoveryInputContent = toolRecoveryInputs.get(toolCallId) ?? inputContent;
    if (!progress && inputContent === undefined) continue;
    const toolName = progress?.toolName ?? toolLabels.get(toolCallId) ?? "tool";
    const executionStarted = startedToolCallIds.has(toolCallId) || Boolean(progress?.executionStartedAt);
    const argumentComplete = progress?.argumentComplete ?? false;
    const preparedRecovery =
      !executionStarted && argumentComplete && recoveryInputContent?.trim()
        ? persistPreparedArguments({
            workspacePath,
            runId,
            toolCallId,
            inputText: recoveryInputContent,
          })
        : undefined;
    const inputPreview = compactToolInputPreview(inputContent);
    snapshots.push({
      toolCallId,
      toolName,
      phase: executionStarted
        ? "execution_started_unknown"
        : argumentComplete
          ? "arguments_prepared_not_executed"
          : "argument_stream_not_executed",
      certainty: executionStarted ? "started_unknown" : argumentComplete ? "prepared_only" : "preparing",
      executionStarted,
      argumentComplete,
      inputChars: Math.max(inputContent?.length ?? 0, progress?.observedArgumentChars ?? 0),
      ...(inputPreview ? { inputPreview } : {}),
      ...(preparedRecovery ? preparedRecovery : {}),
      ...(progress?.executionStartedAt ? { executionStartedAt: progress.executionStartedAt } : {}),
      ...(toolIntents.get(toolCallId) ? { intent: toolIntents.get(toolCallId) } : {}),
    });
  }
  return snapshots;
}
