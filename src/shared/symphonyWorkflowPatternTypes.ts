export const SYMPHONY_WORKFLOW_PATTERN_IDS = [
  "map_reduce",
  "adversarial_debate",
  "imitate_and_verify",
  "pipeline",
  "ensemble",
  "self_healing_loop",
] as const;

export type SymphonyWorkflowPatternId = typeof SYMPHONY_WORKFLOW_PATTERN_IDS[number];
