import { join } from "node:path";
import type { OrchestrationBoard, OrchestrationWorkflowReadiness } from "../../shared/workflowTypes";
import { previewProjectBoardWorkflowRepair } from "./orchestrationProjectBoardFacade";
import { loadWorkflowFile, WorkflowError } from "./orchestrationWorkflowFacade";

const WORKFLOW_READINESS_RAW_CONTENT_LIMIT = 80_000;

export async function readOrchestrationWorkflowReadiness(projectRoot: string): Promise<OrchestrationWorkflowReadiness> {
  const workflowPath = join(projectRoot, "WORKFLOW.md");
  const checkedAt = new Date().toISOString();
  try {
    const workflow = await loadWorkflowFile(workflowPath);
    return {
      status: "ready",
      path: workflow.path,
      checkedAt,
      workflowHash: workflow.contentHash,
      rawContent: limitWorkflowReadinessRawContent(workflow.rawContent),
      rawContentTruncated: workflow.rawContent.length > WORKFLOW_READINESS_RAW_CONTENT_LIMIT,
      warnings: workflow.warnings,
      autoDispatch: workflow.config.orchestration.autoDispatch,
      maxConcurrentAgents: workflow.config.orchestration.maxConcurrentAgents,
      maxTurns: workflow.config.orchestration.maxTurns,
      workspaceStrategy: workflow.config.workspace.strategy,
      proofOfWork: {
        requireTests: workflow.config.proofOfWork.requireTests,
        requireDiffSummary: workflow.config.proofOfWork.requireDiffSummary,
        requireScreenshots: workflow.config.proofOfWork.requireScreenshots,
      },
    };
  } catch (error) {
    if (error instanceof WorkflowError) {
      const missing = error.code === "missing_workflow_file";
      return {
        status: missing ? "missing" : "invalid",
        path: workflowPath,
        checkedAt,
        code: error.code,
        message: error.message,
        warnings: [],
        repairPreview: missing ? undefined : await safePreviewProjectBoardWorkflowRepair(projectRoot),
      };
    }
    return {
      status: "invalid",
      path: workflowPath,
      checkedAt,
      code: "workflow_read_error",
      message: error instanceof Error ? error.message : String(error),
      warnings: [],
      repairPreview: await safePreviewProjectBoardWorkflowRepair(projectRoot),
    };
  }
}

export async function readOrchestrationBoardWithWorkflowReadiness(projectRoot: string, board: OrchestrationBoard): Promise<OrchestrationBoard> {
  return {
    ...board,
    workflowReadiness: await readOrchestrationWorkflowReadiness(projectRoot),
  };
}

async function safePreviewProjectBoardWorkflowRepair(projectRoot: string) {
  try {
    return await previewProjectBoardWorkflowRepair(projectRoot);
  } catch {
    return undefined;
  }
}

function limitWorkflowReadinessRawContent(content: string): string {
  if (content.length <= WORKFLOW_READINESS_RAW_CONTENT_LIMIT) return content;
  return `${content.slice(0, WORKFLOW_READINESS_RAW_CONTENT_LIMIT)}\n... truncated ${content.length - WORKFLOW_READINESS_RAW_CONTENT_LIMIT} character${content.length - WORKFLOW_READINESS_RAW_CONTENT_LIMIT === 1 ? "" : "s"} ...`;
}
