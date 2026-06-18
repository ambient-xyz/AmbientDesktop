import type { ProjectBoardCard, ProjectBoardSummary } from "../../shared/projectBoardTypes";
import type { OrchestrationRun, OrchestrationTask } from "../../shared/workflowTypes";
import {
  projectBoardDeliverableIntegrationRecordFromEvent,
  projectBoardDeliverableManifestFromRun,
  type ProjectBoardDeliverableFile,
  type ProjectBoardDeliverableIntegrationAction,
  type ProjectBoardDeliverableIntegrationRecord,
  type ProjectBoardDeliverableIntegrationStatus,
  type ProjectBoardDeliverableManifest,
} from "../../shared/projectBoardDeliverables";
import { projectBoardRunSortTime } from "./projectBoardExecutionUiModel";

export type ProjectBoardIntegrationTone = "ready" | "warning" | "danger" | "neutral";

export interface ProjectBoardDeliverableIntegrationQueueItem {
  id: string;
  run: OrchestrationRun;
  task?: OrchestrationTask;
  card?: ProjectBoardCard;
  manifest: ProjectBoardDeliverableManifest;
  record?: ProjectBoardDeliverableIntegrationRecord;
  status: ProjectBoardDeliverableIntegrationStatus;
  statusLabel: string;
  tone: ProjectBoardIntegrationTone;
  actionLabel: string;
  detail: string;
  materialFiles: ProjectBoardDeliverableFile[];
  excludedFiles: ProjectBoardDeliverableFile[];
  actions: Array<{
    action: ProjectBoardDeliverableIntegrationAction;
    label: string;
    title: string;
    tone: "primary" | "secondary" | "danger";
    disabled: boolean;
  }>;
}

export interface ProjectBoardDeliverableIntegrationQueueModel {
  visible: boolean;
  headline: string;
  detail: string;
  pendingCount: number;
  integratedCount: number;
  exportedCount: number;
  deferredCount: number;
  materialFileCount: number;
  excludedFileCount: number;
  items: ProjectBoardDeliverableIntegrationQueueItem[];
}

export function projectBoardDeliverableIntegrationQueue(
  board: ProjectBoardSummary,
  orchestrationBoard?: { tasks: OrchestrationTask[]; runs: OrchestrationRun[] },
): ProjectBoardDeliverableIntegrationQueueModel {
  const records = (board.events ?? [])
    .map(projectBoardDeliverableIntegrationRecordFromEvent)
    .filter((record): record is ProjectBoardDeliverableIntegrationRecord => Boolean(record));
  const recordByRunId = new Map<string, ProjectBoardDeliverableIntegrationRecord>();
  for (const record of records) {
    const current = recordByRunId.get(record.runId);
    if (!current || record.createdAt.localeCompare(current.createdAt) >= 0) {
      recordByRunId.set(record.runId, record);
    }
  }
  const taskById = new Map((orchestrationBoard?.tasks ?? []).map((task) => [task.id, task]));
  const cardByTaskId = new Map(board.cards.filter((card) => card.orchestrationTaskId).map((card) => [card.orchestrationTaskId!, card]));
  const finishedStatuses = new Set(["completed", "failed", "stalled", "canceled"]);
  const items = (orchestrationBoard?.runs ?? [])
    .filter((run) => finishedStatuses.has(run.status))
    .map((run): ProjectBoardDeliverableIntegrationQueueItem | undefined => {
      const task = taskById.get(run.taskId);
      const card = cardByTaskId.get(run.taskId);
      // Tasks and runs are workspace-scoped, but this queue is rendered per board:
      // a board-card task that matches no card on THIS board belongs to a sibling
      // board in the same folder, and showing it here invited integrating another
      // board's deliverables from the wrong place. Manual tasks with no board card
      // at all still show, as before.
      if (!card && task?.sourceKind === "project_board_card") return undefined;
      const manifest = projectBoardDeliverableManifestFromRun(run, { cardId: card?.id, cardTitle: card?.title });
      if (manifest.files.length === 0) return undefined;
      const record = recordByRunId.get(run.id);
      const status = record?.status ?? "pending";
      const title = card?.title ?? task?.title ?? `Run ${run.id}`;
      const pending = status === "pending";
      return {
        id: `deliverable:${run.id}`,
        run,
        task,
        card,
        manifest,
        record,
        status,
        statusLabel: projectBoardDeliverableStatusLabel(status),
        tone: projectBoardDeliverableStatusTone(status),
        actionLabel: pending ? "Integrate deliverables" : projectBoardDeliverableStatusLabel(status),
        detail: pending
          ? `${manifest.materialFiles.length} material file${manifest.materialFiles.length === 1 ? "" : "s"} from ${title} are still in ${run.workspacePath}.`
          : projectBoardDeliverableRecordDetail(record),
        materialFiles: manifest.materialFiles,
        excludedFiles: manifest.excludedFiles,
        // Once an outcome is recorded, the chosen action flips to an explicit
        // done-label so the row cannot read as "still clickable, did my click work?".
        actions: [
          {
            action: "apply_to_root",
            label: status === "integrated" ? "Applied To Root" : "Apply To Root",
            title:
              status === "integrated"
                ? "Material files were already applied to the project root."
                : manifest.materialFiles.length > 0
                  ? "Copy material deliverable files from the task workspace into the project root."
                  : "No material files are available to apply.",
            tone: "primary",
            disabled: !pending || manifest.materialFiles.length === 0,
          },
          {
            action: "export_bundle",
            label: status === "exported" ? "Exported" : "Export Bundle",
            title:
              status === "exported"
                ? "Material files were already exported as a bundle."
                : manifest.materialFiles.length > 0
                  ? "Copy material deliverable files into a board-owned artifact bundle for later handoff."
                  : "No material files are available to export.",
            tone: "secondary",
            disabled: !pending || manifest.materialFiles.length === 0,
          },
          {
            action: "defer",
            label: status === "deferred" ? "Deferred" : "Defer",
            title: pending ? "Record an explicit PM decision to leave these deliverables in the task workspace for now." : "This deliverable decision is already recorded.",
            tone: "danger",
            disabled: !pending,
          },
        ],
      };
    })
    .filter((item): item is ProjectBoardDeliverableIntegrationQueueItem => Boolean(item))
    .sort(compareProjectBoardDeliverableIntegrationItems);
  const pendingCount = items.filter((item) => item.status === "pending").length;
  const integratedCount = items.filter((item) => item.status === "integrated").length;
  const exportedCount = items.filter((item) => item.status === "exported").length;
  const deferredCount = items.filter((item) => item.status === "deferred").length;
  const materialFileCount = items.reduce((total, item) => total + item.materialFiles.length, 0);
  const excludedFileCount = items.reduce((total, item) => total + item.excludedFiles.length, 0);
  return {
    visible: items.length > 0,
    headline:
      pendingCount > 0
        ? `${pendingCount} deliverable integration item${pendingCount === 1 ? "" : "s"} pending`
        : items.length > 0
          ? "Deliverables have explicit integration outcomes"
          : "No deliverables recorded yet",
    detail:
      pendingCount > 0
        ? "Completed Local Task runs have material outputs outside the project root. Apply, export, or defer them before treating the executable board as fully closed."
        : items.length > 0
          ? `${integratedCount} integrated, ${exportedCount} exported, and ${deferredCount} deferred deliverable item${items.length === 1 ? "" : "s"} are recorded.`
          : "Completed runs with changed files will appear here with runtime folders excluded by policy.",
    pendingCount,
    integratedCount,
    exportedCount,
    deferredCount,
    materialFileCount,
    excludedFileCount,
    items,
  };
}

function projectBoardDeliverableStatusLabel(status: ProjectBoardDeliverableIntegrationStatus): string {
  if (status === "integrated") return "Integrated";
  if (status === "exported") return "Exported";
  if (status === "deferred") return "Deferred";
  return "Integration pending";
}

function projectBoardDeliverableStatusTone(status: ProjectBoardDeliverableIntegrationStatus): ProjectBoardIntegrationTone {
  if (status === "integrated" || status === "exported") return "ready";
  if (status === "deferred") return "neutral";
  return "warning";
}

function projectBoardDeliverableRecordDetail(record: ProjectBoardDeliverableIntegrationRecord | undefined): string {
  if (!record) return "No integration decision has been recorded.";
  if (record.status === "integrated") return `${record.appliedFiles.length} material file${record.appliedFiles.length === 1 ? "" : "s"} applied to the project root.`;
  if (record.status === "exported") return `${record.appliedFiles.length} material file${record.appliedFiles.length === 1 ? "" : "s"} exported to ${record.exportPath ?? "an artifact bundle"}.`;
  return record.reason ? `Deferred by PM decision: ${record.reason}` : "Deferred by PM decision.";
}

function compareProjectBoardDeliverableIntegrationItems(
  left: ProjectBoardDeliverableIntegrationQueueItem,
  right: ProjectBoardDeliverableIntegrationQueueItem,
): number {
  const statusRank: Record<ProjectBoardDeliverableIntegrationStatus, number> = { pending: 0, deferred: 1, exported: 2, integrated: 3 };
  const status = statusRank[left.status] - statusRank[right.status];
  if (status !== 0) return status;
  const time = projectBoardRunSortTime(right.run).localeCompare(projectBoardRunSortTime(left.run));
  if (time !== 0) return time;
  return (left.card?.title ?? left.task?.title ?? left.run.id).localeCompare(right.card?.title ?? right.task?.title ?? right.run.id);
}
