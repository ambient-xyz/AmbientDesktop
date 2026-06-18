import type { OrchestrationRun, OrchestrationTask } from "../../shared/workflowTypes";

export const RESTART_INTERRUPTED_LOCAL_TASK_ERROR = "Ambient Desktop restarted before this Local Task run finished.";
export const RESTART_INTERRUPTED_AUTO_CONTINUE_LIMIT = 1;

export function isRestartInterruptedOrchestrationRun(
  run: Pick<OrchestrationRun, "status" | "error" | "proofOfWork">,
): boolean {
  if (run.status !== "stalled") return false;
  return restartInterruptedEvidence(run.error, run.proofOfWork);
}

export function restartInterruptedAutoContinueAttempts(
  run: Pick<OrchestrationRun, "proofOfWork"> | Record<string, unknown> | undefined,
): number {
  const proofOfWork =
    run && typeof run === "object" && "proofOfWork" in run
      ? (run as Pick<OrchestrationRun, "proofOfWork">).proofOfWork
      : (run as Record<string, unknown> | undefined);
  const recovery = readRecoveryRecord(proofOfWork);
  const attempts = recovery?.autoContinueAttempts;
  return typeof attempts === "number" && Number.isInteger(attempts) && attempts > 0 ? attempts : 0;
}

export function restartInterruptedNeedsManualReview(run: Pick<OrchestrationRun, "error" | "proofOfWork">): string | undefined {
  const evidence = restartInterruptedEvidenceText(run);
  if (/\b(api\s*key|credentials?|login|log in|authenticate|authorization|permission denied|user permission)\b/i.test(evidence)) {
    return "Previous run evidence mentions credentials, login, authorization, or permission.";
  }
  if (/\b(token budget|budget exhausted|quota exceeded|rate limit|billing)\b/i.test(evidence)) {
    return "Previous run evidence mentions budget, quota, billing, or rate limiting.";
  }
  return undefined;
}

export function restartInterruptedRunProofOfWork(
  previous: Record<string, unknown> | undefined,
  interruptedAt: string,
): Record<string, unknown> {
  const recovery = readRecoveryRecord(previous) ?? {};
  return {
    ...previous,
    kind: typeof previous?.kind === "string" ? previous.kind : "restart-interrupted",
    resumeAvailable: true,
    recovery: {
      ...recovery,
      type: "desktop-restart",
      resumeAvailable: true,
      reason: RESTART_INTERRUPTED_LOCAL_TASK_ERROR,
      interruptedAt,
    },
  };
}

export function restartInterruptedAutoContinueProofOfWork(
  previous: Record<string, unknown> | undefined,
  continuedAt: string,
): Record<string, unknown> {
  const recovery = readRecoveryRecord(previous) ?? {};
  const nextAttempt = restartInterruptedAutoContinueAttempts(previous) + 1;
  const history = Array.isArray(recovery.autoContinueHistory) ? recovery.autoContinueHistory : [];
  return {
    ...previous,
    kind: typeof previous?.kind === "string" ? previous.kind : "restart-interrupted",
    resumeAvailable: true,
    recovery: {
      ...recovery,
      type: "desktop-restart",
      resumeAvailable: true,
      reason: typeof recovery.reason === "string" ? recovery.reason : RESTART_INTERRUPTED_LOCAL_TASK_ERROR,
      autoContinueAttempts: nextAttempt,
      lastAutoContinueAt: continuedAt,
      autoContinueHistory: [...history, { attempt: nextAttempt, continuedAt }],
    },
  };
}

export function restartInterruptedContinuationPrompt(input: {
  task: Pick<OrchestrationTask, "identifier" | "title" | "description">;
  workspacePath: string;
}): string {
  const lines = [
    "Continue the interrupted Local Task from the current workspace.",
    "",
    `Task: ${input.task.identifier} - ${input.task.title}`,
    `Workspace: ${input.workspacePath}`,
    "",
    "Do not restart from scratch. Inspect existing files first, continue from the current state, and finish with proof.",
    "If the work is already complete, verify it and provide concise proof. If blocked, state the blocker clearly.",
  ];
  const description = input.task.description?.trim();
  if (description) lines.push("", "Task description:", description);
  if (interactiveBrowserTaskText(input.task)) {
    lines.push(
      "",
      "If browser interaction or visual verification matters, use real browser tools and capture proof after interaction.",
      "Do not claim gameplay works unless captured evidence shows the app moved past its start screen or otherwise changed state.",
    );
  }
  return lines.join("\n");
}

function restartInterruptedEvidence(error: string | null | undefined, proofOfWork: Record<string, unknown> | undefined): boolean {
  if (typeof error === "string" && restartInterruptedPattern().test(error)) return true;
  if (proofOfWork?.resumeAvailable === true) {
    const recovery = readRecoveryRecord(proofOfWork);
    return recovery?.type === "desktop-restart" || restartInterruptedPattern().test(String(recovery?.reason ?? ""));
  }
  return false;
}

function restartInterruptedEvidenceText(run: Pick<OrchestrationRun, "error" | "proofOfWork">): string {
  return [
    run.error,
    run.proofOfWork?.error,
    run.proofOfWork?.lastAssistantText,
    run.proofOfWork?.lastToolText,
    run.proofOfWork?.lastToolOutput,
  ]
    .filter((item): item is string => typeof item === "string")
    .join("\n");
}

function readRecoveryRecord(proofOfWork: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  return proofOfWork?.recovery && typeof proofOfWork.recovery === "object" && !Array.isArray(proofOfWork.recovery)
    ? (proofOfWork.recovery as Record<string, unknown>)
    : undefined;
}

function restartInterruptedPattern(): RegExp {
  return /ambient desktop restarted before this local task run finished/i;
}

function interactiveBrowserTaskText(task: Pick<OrchestrationTask, "title" | "description">): boolean {
  return /\b(game|arcade|canvas|browser|interactive|keyboard|keypress|controls?|gameplay|animation)\b/i.test(
    [task.title, task.description].filter(Boolean).join("\n"),
  );
}
