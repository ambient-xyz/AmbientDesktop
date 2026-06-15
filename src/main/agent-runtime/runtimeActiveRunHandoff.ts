import type { MessageDelivery, SendMessageInput } from "../../shared/types";

export interface RuntimeActiveRunHandoffActiveRun {
  settled: Promise<void>;
  dedicatedSessionKind?: "workflow-recording-review";
  addActivityListener?: (listener: () => void) => () => void;
}

export interface RuntimeActiveRunHandoffHooks {
  onActivity?: () => void;
  awaitQueuedDeliveryCompletion?: boolean;
}

export interface RuntimeActiveRunHandoffInput<ActiveRun extends RuntimeActiveRunHandoffActiveRun> {
  sendInput: SendMessageInput;
  incomingDedicatedSessionKind?: "workflow-recording-review";
  activeRun?: ActiveRun | undefined;
  hooks?: RuntimeActiveRunHandoffHooks | undefined;
  queueDuringRun: (
    input: SendMessageInput,
    activeRun: ActiveRun,
    delivery: Exclude<MessageDelivery, "prompt">,
  ) => Promise<void>;
}

export async function handleRuntimeActiveRunHandoff<ActiveRun extends RuntimeActiveRunHandoffActiveRun>(
  input: RuntimeActiveRunHandoffInput<ActiveRun>,
): Promise<boolean> {
  const activeRun = input.activeRun;
  if (!activeRun) return false;
  if (input.incomingDedicatedSessionKind === "workflow-recording-review" && activeRun.dedicatedSessionKind !== "workflow-recording-review") {
    throw new Error("Wait for the current Ambient run to finish before starting workflow recording review.");
  }
  const removeActivityListener = input.hooks?.onActivity && activeRun.addActivityListener
    ? activeRun.addActivityListener(input.hooks.onActivity)
    : undefined;
  input.hooks?.onActivity?.();
  try {
    await input.queueDuringRun(
      input.sendInput,
      activeRun,
      input.sendInput.delivery === "follow-up" ? "follow-up" : "steer",
    );
    if (input.hooks?.awaitQueuedDeliveryCompletion) await activeRun.settled;
    return true;
  } finally {
    removeActivityListener?.();
  }
}
