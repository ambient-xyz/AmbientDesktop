import type { ProjectBoardSummary } from "../../shared/projectBoardTypes";
import { initializeGitRepository } from "./projectBoardWorkspaceFacade";
import { PROJECT_BOARD_ARTIFACT_ROOT } from "./projectBoardArtifacts";
import { projectBoardSourceKey, type ProjectBoardSourceIdentityInput } from "./projectBoardSourceIdentity";
import {
  projectBoardArtifactProjectionFromFiles,
  readProjectBoardArtifactFiles,
  type ProjectBoardArtifactProjection,
} from "./projectBoardArtifactImport";

export type ProjectBoardBootstrapKind = "existing" | "existing_with_artifacts" | "adopted" | "created";
export type ProjectBoardArtifactFreshnessStatus = "fresh" | "stale" | "unknown";

export interface ProjectBoardArtifactFreshness {
  status: ProjectBoardArtifactFreshnessStatus;
  summary: string;
  artifactSourceCount: number;
  currentSourceCount: number;
  newSourceCount: number;
  changedSourceCount: number;
  removedSourceCount: number;
  uncheckableSourceCount: number;
  newSourceKeys: string[];
  changedSourceKeys: string[];
  removedSourceKeys: string[];
  checkedAt: string;
}

export interface ProjectBoardBootstrapResult {
  kind: ProjectBoardBootstrapKind;
  board: ProjectBoardSummary;
  projection?: ProjectBoardArtifactProjection;
  artifactFileCount?: number;
  freshness?: ProjectBoardArtifactFreshness;
}

export interface CreateOrAdoptProjectBoardInput {
  workspacePath: string;
  title?: string;
  summary?: string;
  getActiveBoard: () => ProjectBoardSummary | undefined;
  createBoard: (input: { title?: string; summary?: string }) => ProjectBoardSummary;
  applyArtifactProjection: (workspacePath: string, projection: ProjectBoardArtifactProjection) => ProjectBoardSummary;
  scanSources?: () => Promise<ProjectBoardSourceIdentityInput[]>;
}

export async function createOrAdoptProjectBoard(input: CreateOrAdoptProjectBoardInput): Promise<ProjectBoardBootstrapResult> {
  await initializeGitRepository(input.workspacePath);

  const existing = input.getActiveBoard();
  if (existing) {
    const files = await readProjectBoardArtifactFiles(input.workspacePath);
    return files.length > 0 ? { kind: "existing_with_artifacts", board: existing, artifactFileCount: files.length } : { kind: "existing", board: existing };
  }

  const projection = await readOptionalProjectBoardArtifactProjection(input.workspacePath);
  if (projection) {
    const freshness = await projectBoardArtifactFreshnessForProjection(projection, input);
    return {
      kind: "adopted",
      board: input.applyArtifactProjection(input.workspacePath, projection),
      projection,
      ...(freshness ? { freshness } : {}),
    };
  }

  const createInput: { title?: string; summary?: string } = {};
  if (typeof input.title === "string") createInput.title = input.title;
  if (typeof input.summary === "string") createInput.summary = input.summary;
  return { kind: "created", board: input.createBoard(createInput) };
}

export async function readOptionalProjectBoardArtifactProjection(workspacePath: string): Promise<ProjectBoardArtifactProjection | undefined> {
  const files = await readProjectBoardArtifactFiles(workspacePath);
  if (files.length === 0) return undefined;
  const hasBoardConfig = files.some((file) => file.path.replace(/\\/g, "/") === `${PROJECT_BOARD_ARTIFACT_ROOT}/board.config.json`);
  if (!hasBoardConfig) return undefined;
  return projectBoardArtifactProjectionFromFiles(files);
}

export function projectBoardArtifactFreshnessFromSources(
  projection: ProjectBoardArtifactProjection,
  currentSources: ProjectBoardSourceIdentityInput[],
  checkedAt = new Date().toISOString(),
): ProjectBoardArtifactFreshness {
  const latestSnapshot = projection.sourceSnapshots.at(-1);
  if (!latestSnapshot) {
    return {
      status: "unknown",
      summary: "The artifact projection does not include a source snapshot to compare against the current workspace.",
      artifactSourceCount: 0,
      currentSourceCount: currentSources.length,
      newSourceCount: 0,
      changedSourceCount: 0,
      removedSourceCount: 0,
      uncheckableSourceCount: 0,
      newSourceKeys: [],
      changedSourceKeys: [],
      removedSourceKeys: [],
      checkedAt,
    };
  }

  const artifactByKey = new Map(latestSnapshot.sources.map((source) => [source.sourceKey || projectBoardSourceKey(source), source]));
  const currentByKey = new Map(currentSources.map((source) => [source.sourceKey || projectBoardSourceKey(source), source]));
  const newSourceKeys: string[] = [];
  const changedSourceKeys: string[] = [];
  const removedSourceKeys: string[] = [];
  let uncheckableSourceCount = 0;

  for (const [sourceKey, current] of [...currentByKey.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const artifact = artifactByKey.get(sourceKey);
    if (!artifact) {
      newSourceKeys.push(sourceKey);
      continue;
    }
    if (!artifact.contentHash || !current.contentHash) {
      uncheckableSourceCount += 1;
      continue;
    }
    if (artifact.contentHash !== current.contentHash) changedSourceKeys.push(sourceKey);
  }

  for (const sourceKey of [...artifactByKey.keys()].sort()) {
    if (!currentByKey.has(sourceKey)) removedSourceKeys.push(sourceKey);
  }

  const staleCount = newSourceKeys.length + changedSourceKeys.length + removedSourceKeys.length;
  const status: ProjectBoardArtifactFreshnessStatus = staleCount > 0 ? "stale" : "fresh";
  return {
    status,
    summary:
      status === "fresh"
        ? `Artifact source snapshot matches the current source scan for ${latestSnapshot.sources.length} source${latestSnapshot.sources.length === 1 ? "" : "s"}.`
        : [
            "Artifact source snapshot is stale relative to the current source scan.",
            `${newSourceKeys.length} new, ${changedSourceKeys.length} changed, ${removedSourceKeys.length} removed.`,
          ].join(" "),
    artifactSourceCount: latestSnapshot.sources.length,
    currentSourceCount: currentSources.length,
    newSourceCount: newSourceKeys.length,
    changedSourceCount: changedSourceKeys.length,
    removedSourceCount: removedSourceKeys.length,
    uncheckableSourceCount,
    newSourceKeys: newSourceKeys.slice(0, 20),
    changedSourceKeys: changedSourceKeys.slice(0, 20),
    removedSourceKeys: removedSourceKeys.slice(0, 20),
    checkedAt,
  };
}

async function projectBoardArtifactFreshnessForProjection(
  projection: ProjectBoardArtifactProjection,
  input: CreateOrAdoptProjectBoardInput,
): Promise<ProjectBoardArtifactFreshness | undefined> {
  if (!input.scanSources) return undefined;
  try {
    return projectBoardArtifactFreshnessFromSources(projection, await input.scanSources());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "unknown",
      summary: `Could not compare artifact source freshness before adoption: ${message}`,
      artifactSourceCount: projection.sourceSnapshots.at(-1)?.sources.length ?? 0,
      currentSourceCount: 0,
      newSourceCount: 0,
      changedSourceCount: 0,
      removedSourceCount: 0,
      uncheckableSourceCount: 0,
      newSourceKeys: [],
      changedSourceKeys: [],
      removedSourceKeys: [],
      checkedAt: new Date().toISOString(),
    };
  }
}
