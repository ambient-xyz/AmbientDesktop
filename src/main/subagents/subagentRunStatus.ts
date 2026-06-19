import type { SubagentRunSummary } from "../../shared/subagentTypes";

export function isSubagentTerminalStatus(status: SubagentRunSummary["status"]): boolean {
  return [
    "completed",
    "failed",
    "stopped",
    "cancelled",
    "timed_out",
    "detached",
    "aborted_partial",
  ].includes(status);
}
