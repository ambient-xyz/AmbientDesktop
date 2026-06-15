import type { IpcMain } from "electron";
import { z } from "zod";

import type {
  AnswerPlannerDecisionQuestionInput,
  GeneratePlannerDurableArtifactInput,
  PlannerPlanArtifact,
  UpdatePlannerPlanArtifactInput,
} from "../../shared/types";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;

export type PlannerPlanUpdateArtifact = Pick<PlannerPlanArtifact, "id" | "threadId">;
export type PlannerPlanUpdatePatch = Pick<UpdatePlannerPlanArtifactInput, "status" | "workflowState">;
export type PlannerPlanAnswerQuestionAnswer = AnswerPlannerDecisionQuestionInput["answer"];

export interface PlannerPlanUpdateStore<Artifact extends PlannerPlanUpdateArtifact = PlannerPlanUpdateArtifact> {
  updatePlannerPlanArtifact(artifactId: string, input: PlannerPlanUpdatePatch): Artifact;
}

export interface PlannerPlanUpdateHost<Store extends PlannerPlanUpdateStore = PlannerPlanUpdateStore> {
  store: Store;
}

export interface RegisterPlannerPlanUpdateIpcDependencies<
  Artifact extends PlannerPlanUpdateArtifact = PlannerPlanUpdateArtifact,
  Store extends PlannerPlanUpdateStore<Artifact> = PlannerPlanUpdateStore<Artifact>,
  Host extends PlannerPlanUpdateHost<Store> = PlannerPlanUpdateHost<Store>,
> {
  handleIpc: HandleIpc;
  requireProjectRuntimeHostForPlannerPlanArtifact(artifactId: string): Host;
  emitPlannerPlanArtifactUpdated(artifact: Artifact, store: Store): void;
}

export interface RegisterPlannerPlanGenerateDurableArtifactIpcDependencies<
  Artifact extends PlannerPlanUpdateArtifact = PlannerPlanUpdateArtifact,
> {
  handleIpc: HandleIpc;
  generatePlannerDurableArtifact(input: GeneratePlannerDurableArtifactInput): Promise<Artifact>;
}

export interface PlannerPlanAnswerQuestionStore<Artifact extends PlannerPlanUpdateArtifact = PlannerPlanUpdateArtifact> {
  answerPlannerDecisionQuestion(
    artifactId: string,
    questionId: string,
    answer: PlannerPlanAnswerQuestionAnswer,
  ): Artifact;
}

export interface PlannerPlanAnswerQuestionHost<Store extends PlannerPlanAnswerQuestionStore = PlannerPlanAnswerQuestionStore> {
  store: Store;
}

export interface RegisterPlannerPlanAnswerQuestionIpcDependencies<
  Artifact extends PlannerPlanUpdateArtifact = PlannerPlanUpdateArtifact,
  Store extends PlannerPlanAnswerQuestionStore<Artifact> = PlannerPlanAnswerQuestionStore<Artifact>,
  Host extends PlannerPlanAnswerQuestionHost<Store> = PlannerPlanAnswerQuestionHost<Store>,
> {
  handleIpc: HandleIpc;
  requireProjectRuntimeHostForPlannerPlanArtifact(artifactId: string): Host;
  emitPlannerPlanArtifactUpdated(artifact: Artifact, store: Store): void;
}

export const plannerPlanUpdateIpcChannels = ["planner-plan:update"] as const;
export const plannerPlanGenerateDurableArtifactIpcChannels = ["planner-plan:generate-durable-artifact"] as const;
export const plannerPlanAnswerQuestionIpcChannels = ["planner-plan:answer-question"] as const;

const plannerPlanArtifactUpdateSchema = z.object({
  artifactId: z.string().min(1),
  status: z.enum(["ready", "implemented", "superseded"]).optional(),
  workflowState: z
    .enum([
      "draft",
      "questions_pending",
      "answers_complete",
      "finalizing",
      "durable_generating",
      "validating",
      "repairing",
      "durable_ready",
      "durable_ready_with_fallbacks",
      "failed",
    ])
    .optional(),
}).refine((input) => Boolean(input.status || input.workflowState), {
  message: "Specify a planner artifact status or workflowState update.",
});
const generatePlannerDurableArtifactSchema = z.object({
  artifactId: z.string().min(1),
});
const plannerDecisionQuestionAnswerSchema = z.object({
  artifactId: z.string().min(1),
  questionId: z.string().min(1),
  answer: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("option"), optionId: z.string().min(1) }),
    z.object({ kind: z.literal("custom"), customText: z.string().trim().min(1).max(4000) }),
  ]),
});

export function registerPlannerPlanUpdateIpc<
  Artifact extends PlannerPlanUpdateArtifact = PlannerPlanUpdateArtifact,
  Store extends PlannerPlanUpdateStore<Artifact> = PlannerPlanUpdateStore<Artifact>,
  Host extends PlannerPlanUpdateHost<Store> = PlannerPlanUpdateHost<Store>,
>({
  handleIpc,
  requireProjectRuntimeHostForPlannerPlanArtifact,
  emitPlannerPlanArtifactUpdated,
}: RegisterPlannerPlanUpdateIpcDependencies<Artifact, Store, Host>): void {
  handleIpc("planner-plan:update", (_event, raw: UpdatePlannerPlanArtifactInput) => {
    const input = plannerPlanArtifactUpdateSchema.parse(raw);
    const host = requireProjectRuntimeHostForPlannerPlanArtifact(input.artifactId);
    const artifact = host.store.updatePlannerPlanArtifact(input.artifactId, {
      status: input.status,
      workflowState: input.workflowState,
    });
    emitPlannerPlanArtifactUpdated(artifact, host.store);
    return artifact;
  });
}

export function registerPlannerPlanGenerateDurableArtifactIpc<
  Artifact extends PlannerPlanUpdateArtifact = PlannerPlanUpdateArtifact,
>({
  handleIpc,
  generatePlannerDurableArtifact,
}: RegisterPlannerPlanGenerateDurableArtifactIpcDependencies<Artifact>): void {
  handleIpc("planner-plan:generate-durable-artifact", async (_event, raw: GeneratePlannerDurableArtifactInput) => {
    const input = generatePlannerDurableArtifactSchema.parse(raw);
    return generatePlannerDurableArtifact(input);
  });
}

export function registerPlannerPlanAnswerQuestionIpc<
  Artifact extends PlannerPlanUpdateArtifact = PlannerPlanUpdateArtifact,
  Store extends PlannerPlanAnswerQuestionStore<Artifact> = PlannerPlanAnswerQuestionStore<Artifact>,
  Host extends PlannerPlanAnswerQuestionHost<Store> = PlannerPlanAnswerQuestionHost<Store>,
>({
  handleIpc,
  requireProjectRuntimeHostForPlannerPlanArtifact,
  emitPlannerPlanArtifactUpdated,
}: RegisterPlannerPlanAnswerQuestionIpcDependencies<Artifact, Store, Host>): void {
  handleIpc("planner-plan:answer-question", (_event, raw: AnswerPlannerDecisionQuestionInput) => {
    const input = plannerDecisionQuestionAnswerSchema.parse(raw);
    const host = requireProjectRuntimeHostForPlannerPlanArtifact(input.artifactId);
    const artifact = host.store.answerPlannerDecisionQuestion(input.artifactId, input.questionId, input.answer);
    emitPlannerPlanArtifactUpdated(artifact, host.store);
    return artifact;
  });
}
