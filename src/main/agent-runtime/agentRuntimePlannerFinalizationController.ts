import type { DesktopEvent, SendMessageInput } from "../../shared/desktopTypes";
import type { PlannerPlanArtifact } from "../../shared/plannerTypes";
import type { ChatMessage, ThreadSummary } from "../../shared/threadTypes";
import { commitGitPaths as defaultCommitGitPaths } from "./agentRuntimeWorkspaceFacade";
import type { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import {
  applyPlannerDurableRevisionResponse,
  buildPlannerDurableRepairPrompt,
  extractPlannerDurableRevisionResponse,
  extractPlannerPlanArtifactFields,
  PLANNER_DURABLE_REPAIR_MAX_ATTEMPTS,
  PlannerDurableHtmlValidationError,
  plannerDurableFallbackWarnings,
  plannerDurableRepairAttemptCount,
  validatePlannerDurableHtmlFileInBrowser,
  writePlannerDurableHtmlArtifact,
  type PlannerDurableHtmlBrowserValidator,
} from "./agentRuntimePlannerFacade";
import {
  plannerDecisionQuestionsForFinalArtifact,
  plannerDurableRevisionArtifactIdForSourceMessage,
  plannerFinalizationSourceArtifactsFromPrompt,
  plannerPriorUserPromptForSourceMessage,
  type PlannerPlanArtifactContentUpdate,
} from "./agentRuntimePlannerFinalizationPrompt";

export interface AgentRuntimePlannerFinalizationResult {
  message: ChatMessage;
  artifact: PlannerPlanArtifact;
  relatedArtifacts?: PlannerPlanArtifact[];
  repairPrompt?: string;
  eventType: "created" | "updated";
}

export interface AgentRuntimePlannerFinalizationControllerOptions {
  store: Pick<
    ProjectStore,
    | "createPlannerPlanArtifact"
    | "finishPlannerPlanFinalizationAttempt"
    | "getPlannerPlanArtifact"
    | "getProjectArtifactWorkspacePath"
    | "getThread"
    | "listMessages"
    | "listPlannerPlanArtifacts"
    | "promotePlannerDurableArtifactToBoardSource"
    | "replaceMessage"
    | "setPlannerPlanDurableArtifact"
    | "setPlannerPlanDurableArtifactValidation"
    | "updatePlannerPlanArtifact"
    | "updatePlannerPlanArtifactContent"
  >;
  durableBrowserValidator?: PlannerDurableHtmlBrowserValidator | undefined;
  refreshBrowsersForArtifactChange: (threadId: string, workspacePath: string, artifactPath: string) => Promise<void>;
  send: (input: SendMessageInput) => Promise<void>;
  emit: (event: DesktopEvent) => void;
  commitGitPaths?: typeof defaultCommitGitPaths;
  setTimeout?: (callback: () => void, delayMs: number) => unknown;
}

export class AgentRuntimePlannerFinalizationController {
  constructor(private readonly options: AgentRuntimePlannerFinalizationControllerOptions) {}

  async createPlannerPlanArtifactFromMessage(message: ChatMessage): Promise<AgentRuntimePlannerFinalizationResult | undefined> {
    const thread = this.options.store.getThread(message.threadId);
    if (thread.collaborationMode !== "planner") return undefined;
    if (!message.content.trim()) return undefined;
    if (message.metadata?.kind === "planner-plan" || typeof message.metadata?.plannerPlanArtifactId === "string") return undefined;

    const durableRevisionArtifactId = plannerDurableRevisionArtifactIdForSourceMessage(
      this.options.store.listMessages(message.threadId),
      message.id,
    );
    if (durableRevisionArtifactId) {
      const existing = this.options.store.getPlannerPlanArtifact(durableRevisionArtifactId);
      if (existing.threadId !== message.threadId) throw new Error("Planner durable revision target does not belong to this thread.");
      const typedRevision = extractPlannerDurableRevisionResponse(message.content);
      if (!typedRevision) {
        this.options.store.updatePlannerPlanArtifact(existing.id, { workflowState: "failed" });
        throw new Error("Planner durable revision response must use the ambient-planner-revision JSON contract.");
      }
      let appliedRevision: ReturnType<typeof applyPlannerDurableRevisionResponse>;
      try {
        appliedRevision = applyPlannerDurableRevisionResponse(existing, message.id, typedRevision);
      } catch (error) {
        this.options.store.updatePlannerPlanArtifact(existing.id, { workflowState: "failed" });
        throw error;
      }
      const updatedFields = appliedRevision.fields;
      const generating = this.options.store.updatePlannerPlanArtifact(existing.id, { workflowState: "durable_generating" });
      const revisionCandidate: PlannerPlanArtifact = {
        ...generating,
        ...updatedFields,
        workflowState: "durable_generating",
        finalizationAttempt: undefined,
      };
      const durableResult = await this.rewriteDurablePlannerArtifact(
        revisionCandidate,
        thread,
        existing.durableArtifactPath,
        updatedFields,
      );
      const updatedMessage = this.options.store.replaceMessage(message.id, appliedRevision.messageContent, {
        ...message.metadata,
        status: "done",
        runtime: "pi",
        provider: "ambient",
        kind: "planner-plan",
        plannerPlanArtifactId: durableResult.artifact.id,
        plannerDurableRevisionOfArtifactId: existing.id,
      });
      return { message: updatedMessage, artifact: durableResult.artifact, repairPrompt: durableResult.repairPrompt, eventType: "updated" };
    }

    const fields = extractPlannerPlanArtifactFields(message.content);
    if (!fields.content.trim()) return undefined;
    const finalizationSources = this.plannerFinalizationSourceArtifactsForPrompt(
      message.threadId,
      plannerPriorUserPromptForSourceMessage(this.options.store.listMessages(message.threadId), message.id),
    );
    const decisionQuestions = plannerDecisionQuestionsForFinalArtifact({
      threadId: message.threadId,
      messages: this.options.store.listMessages(message.threadId),
      sourceMessageId: message.id,
      parsedQuestions: fields.decisionQuestions,
      listThreadArtifacts: (artifactThreadId) => this.options.store.listPlannerPlanArtifacts(artifactThreadId),
    });

    const artifact = this.options.store.createPlannerPlanArtifact({
      threadId: message.threadId,
      sourceMessageId: message.id,
      ...fields,
      decisionQuestions,
    });
    const durableResult = await this.generateDurablePlannerArtifactIfReady(artifact, thread);
    const relatedArtifacts = finalizationSources.map((source) =>
      this.options.store.finishPlannerPlanFinalizationAttempt(source.id, {
        status: durableResult.artifact.workflowState === "failed" ? "failed" : "completed",
        workflowState: durableResult.artifact.workflowState === "failed" ? "failed" : "answers_complete",
        ...(durableResult.artifact.workflowState === "failed" ? { error: "Planner durable artifact generation failed." } : {}),
      }),
    );
    const updatedMessage = this.options.store.replaceMessage(message.id, fields.content, {
      ...message.metadata,
      status: "done",
      runtime: "pi",
      provider: "ambient",
      kind: "planner-plan",
      plannerPlanArtifactId: durableResult.artifact.id,
    });
    return {
      message: updatedMessage,
      artifact: durableResult.artifact,
      relatedArtifacts,
      repairPrompt: durableResult.repairPrompt,
      eventType: "created",
    };
  }

  plannerFinalizationSourceArtifactsForPrompt(threadId: string, prompt: string): PlannerPlanArtifact[] {
    return plannerFinalizationSourceArtifactsFromPrompt({
      threadId,
      prompt,
      getArtifactById: (artifactId) => this.options.store.getPlannerPlanArtifact(artifactId),
      listThreadArtifacts: (artifactThreadId) => this.options.store.listPlannerPlanArtifacts(artifactThreadId),
    });
  }

  schedulePlannerDurableRepairFollowUp(input: SendMessageInput, workspacePath: string): void {
    const setTimeoutImpl = this.options.setTimeout ?? setTimeout;
    setTimeoutImpl(() => {
      void this.options.send(input).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        this.options.emit({
          type: "error",
          message: `Planner durable repair follow-up failed: ${message}`,
          threadId: input.threadId,
          workspacePath,
        });
      });
    }, 0);
  }

  private async generateDurablePlannerArtifactIfReady(
    artifact: PlannerPlanArtifact,
    thread: ThreadSummary,
  ): Promise<{ artifact: PlannerPlanArtifact; repairPrompt?: string }> {
    if (artifact.status !== "ready" || artifact.decisionQuestions.some((question) => question.required && !question.answer)) {
      return { artifact };
    }
    const generating = this.options.store.updatePlannerPlanArtifact(artifact.id, { workflowState: "durable_generating" });
    const projectArtifactWorkspacePath = this.options.store.getProjectArtifactWorkspacePath();
    try {
      const durable = await writePlannerDurableHtmlArtifact({
        artifact: generating,
        threadTitle: thread.title,
        workspacePath: projectArtifactWorkspacePath,
        browserValidator: this.options.durableBrowserValidator ?? validatePlannerDurableHtmlFileInBrowser,
      });
      const updated = this.options.store.setPlannerPlanDurableArtifact(generating.id, {
        path: durable.relativePath,
        generatedAt: durable.generatedAt,
        validation: durable.validation,
      });
      this.options.store.promotePlannerDurableArtifactToBoardSource(updated.id);
      await this.commitPlannerDurableArtifact(projectArtifactWorkspacePath, updated, durable.manifestRelativePath, "Add durable plan");
      await this.options.refreshBrowsersForArtifactChange(thread.id, projectArtifactWorkspacePath, durable.relativePath);
      return { artifact: updated };
    } catch (error) {
      console.warn(`[planner] Failed to generate durable plan artifact: ${error instanceof Error ? error.message : String(error)}`);
      if (error instanceof PlannerDurableHtmlValidationError) {
        const priorRepairAttempts = plannerDurableRepairAttemptCount(this.options.store.listMessages(thread.id));
        if (priorRepairAttempts < PLANNER_DURABLE_REPAIR_MAX_ATTEMPTS) {
          const repairing = this.options.store.setPlannerPlanDurableArtifactValidation(generating.id, error.validation, "repairing");
          return {
            artifact: repairing,
            repairPrompt: buildPlannerDurableRepairPrompt({
              artifact: repairing,
              validation: error.validation,
              attempt: priorRepairAttempts + 1,
              maxAttempts: PLANNER_DURABLE_REPAIR_MAX_ATTEMPTS,
            }),
          };
        }
        return { artifact: await this.writeDeterministicPlannerDurableFallback(generating, thread, error.validation, projectArtifactWorkspacePath) };
      }
      return { artifact: this.options.store.updatePlannerPlanArtifact(generating.id, { workflowState: "failed" }) };
    }
  }

  private async rewriteDurablePlannerArtifact(
    artifact: PlannerPlanArtifact,
    thread: ThreadSummary,
    existingRelativePath?: string,
    contentUpdate?: PlannerPlanArtifactContentUpdate,
  ): Promise<{ artifact: PlannerPlanArtifact; repairPrompt?: string }> {
    const projectArtifactWorkspacePath = this.options.store.getProjectArtifactWorkspacePath();
    try {
      const durable = await writePlannerDurableHtmlArtifact({
        artifact,
        threadTitle: thread.title,
        workspacePath: projectArtifactWorkspacePath,
        browserValidator: this.options.durableBrowserValidator ?? validatePlannerDurableHtmlFileInBrowser,
        ...(existingRelativePath ? { relativePath: existingRelativePath } : {}),
      });
      const persisted = contentUpdate
        ? this.options.store.updatePlannerPlanArtifactContent(artifact.id, {
            ...contentUpdate,
            workflowState: "durable_generating",
          })
        : artifact;
      const updated = this.options.store.setPlannerPlanDurableArtifact(persisted.id, {
        path: durable.relativePath,
        generatedAt: durable.generatedAt,
        validation: durable.validation,
      });
      this.options.store.promotePlannerDurableArtifactToBoardSource(updated.id);
      await this.commitPlannerDurableArtifact(projectArtifactWorkspacePath, updated, durable.manifestRelativePath, "Revise durable plan");
      await this.options.refreshBrowsersForArtifactChange(thread.id, projectArtifactWorkspacePath, durable.relativePath);
      return { artifact: updated };
    } catch (error) {
      console.warn(`[planner] Failed to revise durable plan artifact: ${error instanceof Error ? error.message : String(error)}`);
      if (error instanceof PlannerDurableHtmlValidationError) {
        return { artifact: this.options.store.setPlannerPlanDurableArtifactValidation(artifact.id, error.validation, "failed") };
      }
      return { artifact: this.options.store.updatePlannerPlanArtifact(artifact.id, { workflowState: "failed" }) };
    }
  }

  private async writeDeterministicPlannerDurableFallback(
    artifact: PlannerPlanArtifact,
    thread: ThreadSummary,
    validation: PlannerDurableHtmlValidationError["validation"],
    projectArtifactWorkspacePath = this.options.store.getProjectArtifactWorkspacePath(),
  ): Promise<PlannerPlanArtifact> {
    try {
      const durable = await writePlannerDurableHtmlArtifact({
        artifact,
        threadTitle: thread.title,
        workspacePath: projectArtifactWorkspacePath,
        browserValidator: this.options.durableBrowserValidator ?? validatePlannerDurableHtmlFileInBrowser,
        diagramMode: "deterministic",
        validationWarnings: plannerDurableFallbackWarnings(validation),
      });
      const updated = this.options.store.setPlannerPlanDurableArtifact(artifact.id, {
        path: durable.relativePath,
        generatedAt: durable.generatedAt,
        validation: durable.validation,
        workflowState: "durable_ready_with_fallbacks",
      });
      this.options.store.promotePlannerDurableArtifactToBoardSource(updated.id);
      await this.commitPlannerDurableArtifact(projectArtifactWorkspacePath, updated, durable.manifestRelativePath, "Add durable plan");
      await this.options.refreshBrowsersForArtifactChange(thread.id, projectArtifactWorkspacePath, durable.relativePath);
      return updated;
    } catch (fallbackError) {
      console.warn(`[planner] Failed deterministic durable plan fallback: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
      if (fallbackError instanceof PlannerDurableHtmlValidationError) {
        return this.options.store.setPlannerPlanDurableArtifactValidation(artifact.id, fallbackError.validation, "failed");
      }
      return this.options.store.updatePlannerPlanArtifact(artifact.id, { workflowState: "failed" });
    }
  }

  private async commitPlannerDurableArtifact(
    workspacePath: string,
    artifact: PlannerPlanArtifact,
    manifestRelativePath: string,
    action: "Add durable plan" | "Revise durable plan",
  ): Promise<void> {
    if (!artifact.durableArtifactPath) return;
    const title = artifact.title.trim() || "Planner durable artifact";
    try {
      const commitGitPaths = this.options.commitGitPaths ?? defaultCommitGitPaths;
      await commitGitPaths(workspacePath, {
        paths: [artifact.durableArtifactPath, manifestRelativePath],
        message: `${action}: ${title}`.slice(0, 180),
        force: true,
      });
    } catch (error) {
      console.warn(`[planner] Failed to commit durable plan artifact: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
