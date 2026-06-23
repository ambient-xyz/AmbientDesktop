import type Database from "better-sqlite3";
import type { PlannerPlanArtifact } from "../../shared/plannerTypes";
import { projectBoardPlanDisplayTitle } from "../../shared/projectBoardPlanIdentity";
import type { ProjectBoardSource, ProjectBoardSummary } from "../../shared/projectBoardTypes";
import {
  projectBoardSourceInputFromExisting,
  projectBoardSourceImpactDurablePlanPrimary,
  projectBoardSourceImpactIncluded,
} from "./projectBoardMappers";
import {
  durablePlanSourceExcerptForBoardSource,
  plannerPlanArtifactSourceContent,
  projectBoardCanAdoptPlannerBoardTitle,
  projectBoardSourceInputExcludedByDurablePlan,
  readManagedBoardPlanContent,
  type ProjectBoardEventInput,
  type ProjectBoardSourceInput,
} from "./projectStoreFacadeHelpers";
import { DURABLE_PLAN_SOURCE_AUTHORITY_REASON, hashProjectBoardSourceContent } from "./projectStoreProjectBoardFacade";

export interface ProjectStoreProjectBoardDurablePlanSourceRepositoryDeps {
  appendProjectBoardEvent(input: ProjectBoardEventInput): void;
  createProjectBoard(input: { title?: string; summary?: string; replaceActive?: boolean; sourceThreadId?: string }): ProjectBoardSummary;
  getPlannerPlanArtifact(artifactId: string): PlannerPlanArtifact;
  getProjectArtifactWorkspacePath(): string;
  getProjectBoard(boardId: string): ProjectBoardSummary | undefined;
  getProjectBoardForPath(projectPath: string, sourceThreadId?: string): ProjectBoardSummary | undefined;
  getThreadTitle(threadId: string): string;
  replaceProjectBoardSources(boardId: string, sources: ProjectBoardSourceInput[]): ProjectBoardSource[];
}

export class ProjectStoreProjectBoardDurablePlanSourceRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreProjectBoardDurablePlanSourceRepositoryDeps,
  ) {}

  private projectBoardHasProtectedWorkFromDifferentThread(board: ProjectBoardSummary, threadId: string): boolean {
    const hasIncludedSourceFromDifferentThread = board.sources
      .filter(projectBoardSourceImpactIncluded)
      .some((source) => Boolean(source.threadId && source.threadId !== threadId));
    if (hasIncludedSourceFromDifferentThread) return true;
    return board.cards.some((card) => {
      if (card.status === "archived") return false;
      return Boolean(card.sourceThreadId && card.sourceThreadId !== threadId);
    });
  }

  promotePlannerDurableArtifactToBoardSource(artifactId: string): ProjectBoardSource | undefined {
    const artifact = this.deps.getPlannerPlanArtifact(artifactId);
    if (!artifact.durableArtifactPath) return undefined;
    const projectPath = this.deps.getProjectArtifactWorkspacePath();
    const durablePlanContent =
      readManagedBoardPlanContent(projectPath, artifact.durableArtifactPath) ?? plannerPlanArtifactSourceContent(artifact);
    const planDisplayTitle = projectBoardPlanDisplayTitle({
      artifactTitle: artifact.title,
      threadTitle: this.deps.getThreadTitle(artifact.threadId),
      summary: artifact.summary,
      content: durablePlanContent,
      fallback: "Planner plan",
    });
    const boardTitle = `${planDisplayTitle} board`.slice(0, 180);
    let board =
      this.deps.getProjectBoardForPath(projectPath, artifact.threadId) ??
      this.deps.createProjectBoard({
        title: boardTitle,
        summary: artifact.summary.trim() || "Project board created from a durable planner plan.",
        sourceThreadId: artifact.threadId,
      });
    const durablePlanSources = board.sources.filter(projectBoardSourceImpactDurablePlanPrimary);
    const alreadyLinked = durablePlanSources.some(
      (source) => source.artifactId === artifact.id && source.path === artifact.durableArtifactPath,
    );
    const replacingDifferentPrimaryDurablePlan = durablePlanSources.some(
      (source) => source.artifactId !== artifact.id || source.path !== artifact.durableArtifactPath,
    );
    if (
      (!alreadyLinked && this.projectBoardHasProtectedWorkFromDifferentThread(board, artifact.threadId)) ||
      replacingDifferentPrimaryDurablePlan
    ) {
      board = this.deps.createProjectBoard({
        title: boardTitle,
        summary: artifact.summary.trim() || "Project board created from a durable planner plan.",
        replaceActive: true,
        sourceThreadId: artifact.threadId,
      });
    } else if (board.title !== boardTitle && projectBoardCanAdoptPlannerBoardTitle(board.title)) {
      const now = new Date().toISOString();
      this.db.prepare("UPDATE project_boards SET title = ?, updated_at = ? WHERE id = ?").run(boardTitle, now, board.id);
      board = this.deps.getProjectBoard(board.id) ?? board;
    }
    const existingSources = board.sources
      .filter((source) => {
        if (source.artifactId === artifact.id && source.path === artifact.durableArtifactPath) return false;
        if (projectBoardSourceImpactDurablePlanPrimary(source)) return false;
        return true;
      })
      .map((source) =>
        source.classifiedBy === "user" || !projectBoardSourceImpactIncluded(source)
          ? projectBoardSourceInputFromExisting(source)
          : projectBoardSourceInputExcludedByDurablePlan(source),
      );
    const contentHash = hashProjectBoardSourceContent(durablePlanContent);
    const source: ProjectBoardSourceInput = {
      kind: "plan_artifact",
      title: `${planDisplayTitle} Durable Plan`.slice(0, 180),
      summary: artifact.summary || "Durable planner artifact generated by Ambient.",
      excerpt: durablePlanSourceExcerptForBoardSource(durablePlanContent, artifact.content),
      path: artifact.durableArtifactPath,
      threadId: artifact.threadId,
      artifactId: artifact.id,
      messageId: artifact.sourceMessageId,
      contentHash,
      byteSize: Buffer.byteLength(durablePlanContent, "utf8"),
      classificationReason: `${DURABLE_PLAN_SOURCE_AUTHORITY_REASON}; Ambient generated this durable planner artifact from Planning Mode.`,
      classifiedBy: "fallback_heuristic",
      classificationConfidence: 1,
      authorityRole: "primary",
      includeInSynthesis: true,
      relevance: 100,
    };
    const sources = this.deps.replaceProjectBoardSources(board.id, [...existingSources, source]);
    const linked = sources.find((candidate) => candidate.artifactId === artifact.id && candidate.path === artifact.durableArtifactPath);
    if (linked) {
      this.deps.appendProjectBoardEvent({
        boardId: board.id,
        kind: "source_updated",
        title: "Durable plan linked to board",
        summary: `${linked.title} is available as an explicit board plan artifact.`,
        entityKind: "project_board_source",
        entityId: linked.id,
        metadata: {
          sourceId: linked.id,
          artifactId: artifact.id,
          threadId: artifact.threadId,
          sourceMessageId: artifact.sourceMessageId,
          durablePlanPath: artifact.durableArtifactPath,
          durablePlanContentHash: contentHash,
          durablePlanGeneratedAt: artifact.durableArtifactGeneratedAt,
          durablePlanValidationOk: artifact.durableArtifactValidation?.ok,
        },
      });
    }
    return linked;
  }
}
