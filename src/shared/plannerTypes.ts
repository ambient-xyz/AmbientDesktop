export type PlannerPlanArtifactStatus = "ready" | "implemented" | "superseded";

export type PlannerPlanFinalizationAttemptStatus = "running" | "failed" | "completed";

export type PlannerPlanWorkflowState =
  | "draft"
  | "questions_pending"
  | "answers_complete"
  | "finalizing"
  | "durable_generating"
  | "validating"
  | "repairing"
  | "durable_ready"
  | "durable_ready_with_fallbacks"
  | "failed";

export interface PlannerPlanFinalizationAttempt {
  id: string;
  status: PlannerPlanFinalizationAttemptStatus;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export interface PlannerDurableArtifactValidationIssue {
  code: string;
  section?: string;
  message: string;
}

export interface PlannerDurableArtifactValidationResult {
  ok: boolean;
  checkedAt: string;
  errors: PlannerDurableArtifactValidationIssue[];
  warnings: PlannerDurableArtifactValidationIssue[];
}

export interface PlannerPlanStep {
  id: string;
  title: string;
  detail?: string;
}

export type PlannerDiagramKind = "architecture" | "dependencies" | "program_flow" | "functional_nonfunctional" | "custom";

export interface PlannerDiagramNode {
  id: string;
  label: string;
  role?: string;
}

export interface PlannerDiagramEdge {
  from: string;
  to: string;
  label?: string;
}

export interface PlannerDiagramSpec {
  id: string;
  title: string;
  kind: PlannerDiagramKind;
  purpose?: string;
  nodes: PlannerDiagramNode[];
  edges: PlannerDiagramEdge[];
  layoutHint?: string;
  fallbackSummary?: string;
}

export interface PlannerDecisionOption {
  id: string;
  label: string;
  description: string;
}

export type PlannerDecisionAnswer =
  | {
      kind: "option";
      optionId: string;
      answeredAt: string;
    }
  | {
      kind: "custom";
      customText: string;
      answeredAt: string;
    };

export interface PlannerDecisionQuestion {
  id: string;
  question: string;
  recommendedOptionId: string;
  required: boolean;
  options: PlannerDecisionOption[];
  answer?: PlannerDecisionAnswer;
}

export interface PlannerPlanArtifact {
  id: string;
  threadId: string;
  sourceMessageId: string;
  status: PlannerPlanArtifactStatus;
  workflowState: PlannerPlanWorkflowState;
  finalizationAttempt?: PlannerPlanFinalizationAttempt;
  durableArtifactPath?: string;
  durableArtifactGeneratedAt?: string;
  durableArtifactValidation?: PlannerDurableArtifactValidationResult;
  title: string;
  summary: string;
  content: string;
  steps: PlannerPlanStep[];
  openQuestions: string[];
  risks: string[];
  verification: string[];
  warnings?: string[];
  diagrams?: PlannerDiagramSpec[];
  decisionQuestions: PlannerDecisionQuestion[];
  createdAt: string;
  updatedAt: string;
}

export interface PlannerSettings {
  autoFinalize: boolean;
}

export interface GeneratePlannerDurableArtifactInput {
  artifactId: string;
}

export interface AnswerPlannerDecisionQuestionInput {
  artifactId: string;
  questionId: string;
  answer:
    | {
        kind: "option";
        optionId: string;
      }
    | {
        kind: "custom";
        customText: string;
      };
}
