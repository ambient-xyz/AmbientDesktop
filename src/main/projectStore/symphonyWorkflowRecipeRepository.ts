import type { AmbientFeatureFlagSnapshot } from "../../shared/featureFlags";
import { isAmbientSubagentsEnabled } from "../../shared/featureFlags";
import {
  getSymphonyWorkflowRecipePreset,
  missingRequiredSymphonyMetricTemplateLabels,
  requiredSymphonyMetricTemplateErrorMessage,
} from "../../shared/symphonyWorkflowRecipes";
import type { ThreadSummary } from "../../shared/threadTypes";
import type { SaveSymphonyWorkflowRecipeInput, WorkflowRecordingLibraryDescription } from "../../shared/workflowTypes";
import {
  workflowRecordingFindLibraryRecord,
  workflowRecordingLibraryVersions,
  workflowRecordingNextSavedPlaybook,
  workflowRecordingPlaybookId,
  workflowRecordingSavedPlaybookForWorkspace,
  workflowRecordingWritePlaybookPackageWithIndex,
  type WorkflowRecordingLibraryIndex,
} from "./projectStoreWorkflowRecordingFacade";
import { symphonyWorkflowRecipePlaybook, symphonyWorkflowRecipeTitle, symphonyWorkflowRecipeTranscript } from "./projectStoreFacadeHelpers";

export interface SaveProjectStoreSymphonyWorkflowRecipeOptions {
  featureFlagSnapshot: AmbientFeatureFlagSnapshot;
}

export interface ProjectStoreSymphonyWorkflowRecipeRepositoryDeps {
  describeWorkflowRecording(id: string, input?: { includeArchived?: boolean }): WorkflowRecordingLibraryDescription;
  getThread(threadId: string): ThreadSummary;
  workflowRecordingLibraryIndexes(): WorkflowRecordingLibraryIndex[];
}

export class ProjectStoreSymphonyWorkflowRecipeRepository {
  constructor(private readonly deps: ProjectStoreSymphonyWorkflowRecipeRepositoryDeps) {}

  saveSymphonyWorkflowRecipe(
    input: SaveSymphonyWorkflowRecipeInput,
    options: SaveProjectStoreSymphonyWorkflowRecipeOptions,
  ): WorkflowRecordingLibraryDescription {
    if (!isAmbientSubagentsEnabled(options.featureFlagSnapshot)) {
      throw new Error("Symphony workflow recipes are disabled while ambient.subagents is off.");
    }
    const thread = this.deps.getThread(input.threadId);
    const goal = input.goal.trim();
    if (!goal) throw new Error("Enter a Symphony workflow goal before saving the recipe.");
    const recipe = getSymphonyWorkflowRecipePreset(input.patternId);
    const missingMetricLabels = missingRequiredSymphonyMetricTemplateLabels({
      patternId: input.patternId,
      metricCustomizations: input.metricCustomizations,
    });
    const metricError = requiredSymphonyMetricTemplateErrorMessage({
      missingLabels: missingMetricLabels,
      actionLabel: "saving the Symphony recipe",
    });
    if (metricError) throw new Error(metricError);
    const now = new Date().toISOString();
    const title = symphonyWorkflowRecipeTitle(recipe, goal);
    const confirmed = symphonyWorkflowRecipePlaybook({
      recipe,
      goal,
      ...(input.blocking !== undefined ? { blocking: input.blocking } : {}),
      ...(input.stepAnswers ? { stepAnswers: input.stepAnswers } : {}),
      ...(input.metricCustomizations ? { metricCustomizations: input.metricCustomizations } : {}),
      now,
    });
    const id = workflowRecordingPlaybookId(thread.id, confirmed.intent);
    const existing = workflowRecordingFindLibraryRecord(this.deps.workflowRecordingLibraryIndexes(), id, {
      includeDisabled: true,
      includeArchived: true,
    });
    const savedPlaybook = existing
      ? workflowRecordingNextSavedPlaybook({
          id,
          title,
          savedAt: now,
          indexPath: existing.indexPath,
          record: existing.record,
          versions: workflowRecordingLibraryVersions(existing.indexPath, existing.record),
        })
      : workflowRecordingSavedPlaybookForWorkspace({
          workspacePath: thread.workspacePath,
          id,
          title,
          version: 1,
          enabled: true,
          savedAt: now,
          updatedAt: now,
        });

    workflowRecordingWritePlaybookPackageWithIndex({
      savedPlaybook,
      confirmed,
      capture: undefined,
      thread,
      transcriptOverride: symphonyWorkflowRecipeTranscript({
        threadId: thread.id,
        recipe,
        goal,
        ...(input.blocking !== undefined ? { blocking: input.blocking } : {}),
        ...(input.stepAnswers ? { stepAnswers: input.stepAnswers } : {}),
        ...(input.metricCustomizations ? { metricCustomizations: input.metricCustomizations } : {}),
        savedAt: now,
      }),
    });
    return this.deps.describeWorkflowRecording(id, { includeArchived: true });
  }
}
