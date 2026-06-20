import type {
  GeneratePlannerDurableArtifactInput,
  PlannerDurableArtifactValidationIssue,
  PlannerDurableArtifactValidationResult,
  PlannerPlanArtifact,
  PlannerPlanWorkflowState,
} from "../../shared/plannerTypes";
import {
  PlannerDurableHtmlValidationError,
  type PlannerDurableHtmlBrowserValidator,
  type PlannerDurableHtmlResult,
} from "./plannerDurableHtml";

export interface PlannerDurableArtifactThread {
  id: string;
  title: string;
}

export interface PlannerDurableArtifactStore {
  getPlannerPlanArtifact(artifactId: string): PlannerPlanArtifact;
  getThread(threadId: string): PlannerDurableArtifactThread;
  getProjectArtifactWorkspacePath(): string;
  updatePlannerPlanArtifact(
    artifactId: string,
    input: { workflowState?: PlannerPlanWorkflowState },
  ): PlannerPlanArtifact;
  setPlannerPlanDurableArtifact(
    artifactId: string,
    input: {
      path: string;
      generatedAt: string;
      validation?: PlannerDurableArtifactValidationResult;
      workflowState?: PlannerPlanWorkflowState;
    },
  ): PlannerPlanArtifact;
  setPlannerPlanDurableArtifactValidation(
    artifactId: string,
    validation: PlannerDurableArtifactValidationResult,
    workflowState?: PlannerPlanWorkflowState,
  ): PlannerPlanArtifact;
  promotePlannerDurableArtifactToBoardSource(artifactId: string): unknown;
}

export interface PlannerDurableArtifactHost<Store extends PlannerDurableArtifactStore> {
  store: Store;
}

export interface PlannerDurableArtifactWriteInput {
  artifact: PlannerPlanArtifact;
  threadTitle: string;
  workspacePath: string;
  browserValidator?: PlannerDurableHtmlBrowserValidator;
  diagramMode?: "provided" | "deterministic";
  validationWarnings?: PlannerDurableArtifactValidationIssue[];
}

export interface PlannerDurableArtifactDesktopServiceDependencies<
  Host extends PlannerDurableArtifactHost<Store>,
  Store extends PlannerDurableArtifactStore,
> {
  requireProjectRuntimeHostForPlannerPlanArtifact(artifactId: string): Host;
  emitPlannerPlanArtifactUpdated(artifact: PlannerPlanArtifact, targetStore: Store): void;
  emitProjectStateIfActive(host: Host): void;
  writePlannerDurableHtmlArtifact(input: PlannerDurableArtifactWriteInput): Promise<PlannerDurableHtmlResult>;
  plannerDurableFallbackWarnings(validation: PlannerDurableArtifactValidationResult): PlannerDurableArtifactValidationIssue[];
  validatePlannerDurableHtmlFileInBrowser: PlannerDurableHtmlBrowserValidator;
  commitGitPaths(
    workspacePath: string,
    input: {
      paths: string[];
      message: string;
      force: boolean;
    },
  ): Promise<unknown>;
  warn(message: string): void;
}

export function createPlannerDurableArtifactDesktopService<
  Host extends PlannerDurableArtifactHost<Store>,
  Store extends PlannerDurableArtifactStore,
>(
  dependencies: PlannerDurableArtifactDesktopServiceDependencies<Host, Store>,
) {
  async function generatePlannerDurableArtifact(input: GeneratePlannerDurableArtifactInput): Promise<PlannerPlanArtifact> {
    const host = dependencies.requireProjectRuntimeHostForPlannerPlanArtifact(input.artifactId);
    const targetStore = host.store;
    const current = targetStore.getPlannerPlanArtifact(input.artifactId);
    if (current.status !== "ready") throw new Error("Only ready planner plans can generate durable artifacts.");
    if (current.decisionQuestions.some((question) => question.required && !question.answer)) {
      throw new Error("Answer required planner decisions before generating a durable plan.");
    }
    const thread = targetStore.getThread(current.threadId);
    const projectArtifactWorkspacePath = targetStore.getProjectArtifactWorkspacePath();
    let artifact = targetStore.updatePlannerPlanArtifact(input.artifactId, { workflowState: "durable_generating" });
    dependencies.emitPlannerPlanArtifactUpdated(artifact, targetStore);
    try {
      const durable = await dependencies.writePlannerDurableHtmlArtifact({
        artifact,
        threadTitle: thread.title,
        workspacePath: projectArtifactWorkspacePath,
        browserValidator: dependencies.validatePlannerDurableHtmlFileInBrowser,
      });
      artifact = targetStore.setPlannerPlanDurableArtifact(artifact.id, {
        path: durable.relativePath,
        generatedAt: durable.generatedAt,
        validation: durable.validation,
      });
      targetStore.promotePlannerDurableArtifactToBoardSource(artifact.id);
      await commitPlannerDurableArtifact(projectArtifactWorkspacePath, artifact, durable.manifestRelativePath, "Add durable plan");
      dependencies.emitPlannerPlanArtifactUpdated(artifact, targetStore);
      dependencies.emitProjectStateIfActive(host);
      return artifact;
    } catch (error) {
      if (error instanceof PlannerDurableHtmlValidationError) {
        try {
          const fallback = await dependencies.writePlannerDurableHtmlArtifact({
            artifact,
            threadTitle: thread.title,
            workspacePath: projectArtifactWorkspacePath,
            browserValidator: dependencies.validatePlannerDurableHtmlFileInBrowser,
            diagramMode: "deterministic",
            validationWarnings: dependencies.plannerDurableFallbackWarnings(error.validation),
          });
          artifact = targetStore.setPlannerPlanDurableArtifact(artifact.id, {
            path: fallback.relativePath,
            generatedAt: fallback.generatedAt,
            validation: fallback.validation,
            workflowState: "durable_ready_with_fallbacks",
          });
          targetStore.promotePlannerDurableArtifactToBoardSource(artifact.id);
          await commitPlannerDurableArtifact(projectArtifactWorkspacePath, artifact, fallback.manifestRelativePath, "Add durable plan");
          dependencies.emitPlannerPlanArtifactUpdated(artifact, targetStore);
          dependencies.emitProjectStateIfActive(host);
          return artifact;
        } catch (fallbackError) {
          const failed =
            fallbackError instanceof PlannerDurableHtmlValidationError
              ? targetStore.setPlannerPlanDurableArtifactValidation(artifact.id, fallbackError.validation, "failed")
              : targetStore.updatePlannerPlanArtifact(artifact.id, { workflowState: "failed" });
          dependencies.emitPlannerPlanArtifactUpdated(failed, targetStore);
          dependencies.emitProjectStateIfActive(host);
          throw fallbackError;
        }
      }
      const failed = targetStore.updatePlannerPlanArtifact(artifact.id, { workflowState: "failed" });
      dependencies.emitPlannerPlanArtifactUpdated(failed, targetStore);
      dependencies.emitProjectStateIfActive(host);
      throw error;
    }
  }

  async function commitPlannerDurableArtifact(
    workspacePath: string,
    artifact: PlannerPlanArtifact,
    manifestRelativePath: string,
    action: "Add durable plan" | "Revise durable plan",
  ): Promise<void> {
    if (!artifact.durableArtifactPath) return;
    const title = artifact.title.trim() || "Planner durable artifact";
    try {
      await dependencies.commitGitPaths(workspacePath, {
        paths: [artifact.durableArtifactPath, manifestRelativePath],
        message: `${action}: ${title}`.slice(0, 180),
        force: true,
      });
    } catch (error) {
      dependencies.warn(`[planner] Failed to commit durable plan artifact: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    generatePlannerDurableArtifact,
    commitPlannerDurableArtifact,
  };
}
