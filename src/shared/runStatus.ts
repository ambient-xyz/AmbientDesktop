import type { RunStatus } from "./threadTypes";

export const RUN_ABORT_ARM_DELAY_MS = 1_000;

export function isRunStatusRunning(status: RunStatus): boolean {
  return status !== "idle" && status !== "error";
}
