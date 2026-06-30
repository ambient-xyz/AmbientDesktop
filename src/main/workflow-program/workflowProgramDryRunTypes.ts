export interface WorkflowProgramDryRunCall {
  kind: "tool" | "connector" | "model" | "checkpoint" | "step" | "document" | "mutation" | "review" | "approval" | "emit";
  name: string;
  nodeId?: string;
  input?: unknown;
}

export interface WorkflowProgramDryRunResult {
  calls: WorkflowProgramDryRunCall[];
  componentOutputs?: unknown;
}
