import type { ProjectBoardEvent } from "./projectBoardTypes";
import type { OrchestrationRun } from "./workflowTypes";

export type ProjectBoardDeliverableFileCategory = "implementation" | "test" | "visual" | "config" | "docs" | "other" | "runtime" | "dependency";
export type ProjectBoardDeliverableFileSource = "changed_file" | "artifact_file";
export type ProjectBoardDeliverableFileExclusionReason = "runtime_folder" | "dependency_folder" | "unsafe_path";
export type ProjectBoardDeliverableIntegrationAction = "apply_to_root" | "export_bundle" | "defer";
export type ProjectBoardDeliverableIntegrationStatus = "pending" | "integrated" | "exported" | "deferred";

export interface ProjectBoardDeliverableFile {
  path: string;
  source: ProjectBoardDeliverableFileSource;
  category: ProjectBoardDeliverableFileCategory;
  material: boolean;
  excluded: boolean;
  exclusionReason?: ProjectBoardDeliverableFileExclusionReason;
}

export interface ProjectBoardDeliverableManifest {
  runId: string;
  taskId: string;
  cardId?: string;
  cardTitle?: string;
  workspacePath: string;
  runStatus: string;
  files: ProjectBoardDeliverableFile[];
  materialFiles: ProjectBoardDeliverableFile[];
  excludedFiles: ProjectBoardDeliverableFile[];
  commands: string[];
  commits: string[];
  dependencyImports: string[];
  summary: string;
}

export interface ProjectBoardDeliverableIntegrationRecord {
  runId: string;
  taskId?: string;
  cardId?: string;
  action: ProjectBoardDeliverableIntegrationAction;
  status: Exclude<ProjectBoardDeliverableIntegrationStatus, "pending">;
  materialFiles: string[];
  excludedFiles: string[];
  appliedFiles: string[];
  skippedFiles: string[];
  exportPath?: string;
  reason?: string;
  createdAt: string;
  eventId?: string;
}

export function projectBoardDeliverableManifestFromRun(
  run: OrchestrationRun,
  context: { cardId?: string; cardTitle?: string } = {},
): ProjectBoardDeliverableManifest {
  const proof = projectBoardDeliverableRecord(run.proofOfWork);
  const taskActions = projectBoardDeliverableTaskActions(proof);
  const changedFiles = projectBoardUniqueStrings([
    ...projectBoardDeliverableStrings(proof?.changedFiles),
    ...projectBoardDeliverableTaskActionStrings(taskActions, "changedFiles"),
  ]);
  const artifactFiles = projectBoardUniqueStrings([
    ...projectBoardDeliverableStrings(proof?.artifactFiles),
    ...projectBoardDeliverableStrings(proof?.outputFiles),
    ...projectBoardDeliverableStrings(proof?.deliverables),
    ...projectBoardDeliverableStrings(proof?.generatedFiles),
    ...projectBoardDeliverableStrings(proof?.artifacts),
  ]).filter((path) => !changedFiles.includes(path));
  const files = [
    ...changedFiles.map((path) => projectBoardDeliverableFile(path, "changed_file")),
    ...artifactFiles.map((path) => projectBoardDeliverableFile(path, "artifact_file")),
  ];
  const materialFiles = files.filter((file) => file.material);
  const excludedFiles = files.filter((file) => file.excluded);
  const commands = projectBoardUniqueStrings([
    ...projectBoardDeliverableStrings(proof?.commands),
    ...projectBoardDeliverableStrings(proof?.testOutput),
    ...projectBoardDeliverableTaskActionStrings(taskActions, "commands"),
  ]);
  const commits = projectBoardUniqueStrings([
    ...projectBoardDeliverableStrings(proof?.commits),
    ...projectBoardDeliverableStrings(proof?.gitCommits),
    ...projectBoardDeliverableStrings(proof?.commit),
  ]);
  const dependencyImports = projectBoardUniqueStrings([
    ...projectBoardDeliverableStrings(proof?.dependencyImports),
    ...projectBoardDeliverableStrings(proof?.importedArtifacts),
    ...projectBoardDeliverableStrings(proof?.imports),
  ]);
  const summary =
    materialFiles.length > 0
      ? `${materialFiles.length} material deliverable file${materialFiles.length === 1 ? "" : "s"} from ${run.status} run.`
      : excludedFiles.length > 0
        ? `${excludedFiles.length} changed file${excludedFiles.length === 1 ? "" : "s"} excluded from integration by policy.`
        : "No material deliverable files were recorded for this run.";
  return {
    runId: run.id,
    taskId: run.taskId,
    cardId: context.cardId,
    cardTitle: context.cardTitle,
    workspacePath: run.workspacePath,
    runStatus: run.status,
    files,
    materialFiles,
    excludedFiles,
    commands,
    commits,
    dependencyImports,
    summary,
  };
}

export function projectBoardDeliverableIntegrationRecordFromEvent(
  event: ProjectBoardEvent,
): ProjectBoardDeliverableIntegrationRecord | undefined {
  if (event.kind !== "deliverable_integration_resolved") return undefined;
  const metadata = event.metadata;
  const runId = projectBoardDeliverableText(metadata.runId);
  const action = projectBoardDeliverableIntegrationAction(metadata.action);
  const status = projectBoardDeliverableIntegrationResolvedStatus(metadata.status);
  if (!runId || !action || !status) return undefined;
  return {
    runId,
    taskId: projectBoardDeliverableText(metadata.taskId),
    cardId: projectBoardDeliverableText(metadata.cardId),
    action,
    status,
    materialFiles: projectBoardDeliverableStrings(metadata.materialFiles),
    excludedFiles: projectBoardDeliverableStrings(metadata.excludedFiles),
    appliedFiles: projectBoardDeliverableStrings(metadata.appliedFiles),
    skippedFiles: projectBoardDeliverableStrings(metadata.skippedFiles),
    exportPath: projectBoardDeliverableText(metadata.exportPath),
    reason: projectBoardDeliverableText(metadata.reason),
    createdAt: event.createdAt,
    eventId: event.id,
  };
}

function projectBoardDeliverableFile(path: string, source: ProjectBoardDeliverableFileSource): ProjectBoardDeliverableFile {
  const normalized = projectBoardDeliverablePath(path);
  const category = projectBoardDeliverableFileCategory(normalized);
  const unsafe = !normalized || normalized.startsWith("/") || normalized.split("/").includes("..") || /^[a-zA-Z]:\//.test(normalized);
  const exclusionReason: ProjectBoardDeliverableFileExclusionReason | undefined = unsafe
    ? "unsafe_path"
    : category === "runtime"
      ? "runtime_folder"
      : category === "dependency"
        ? "dependency_folder"
        : undefined;
  return {
    path: normalized || path.trim(),
    source,
    category,
    material: !exclusionReason,
    excluded: Boolean(exclusionReason),
    exclusionReason,
  };
}

function projectBoardDeliverablePath(path: string): string {
  return path.trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/");
}

function projectBoardDeliverableFileCategory(path: string): ProjectBoardDeliverableFileCategory {
  const normalized = path.toLowerCase();
  if (normalized.startsWith(".ambient/") || normalized.startsWith(".ambient-codex/") || normalized.startsWith(".git/")) return "runtime";
  if (normalized.startsWith("node_modules/") || normalized.includes("/node_modules/")) return "dependency";
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(normalized) || normalized.startsWith("test/") || normalized.startsWith("tests/")) return "test";
  if (/\.(png|jpe?g|gif|webp|svg)$/.test(normalized) || normalized.includes("screenshot") || normalized.includes("visual")) return "visual";
  if (/\.(md|mdx|txt|rst)$/.test(normalized) || normalized.startsWith("docs/")) return "docs";
  if (/package(-lock)?\.json$|pnpm-lock\.yaml$|tsconfig[^/]*\.json$|vite\.config\.[cm]?[jt]s$|eslint\.config\.[cm]?[jt]s$/.test(normalized)) {
    return "config";
  }
  if (/\.[cm]?[jt]sx?$/.test(normalized) || /\.(css|scss|html)$/.test(normalized) || normalized.startsWith("src/") || normalized.startsWith("app/")) {
    return "implementation";
  }
  return "other";
}

function projectBoardDeliverableTaskActions(proof: Record<string, unknown> | undefined): Record<string, unknown>[] {
  const actions = proof?.taskToolActions;
  return Array.isArray(actions) ? actions.filter((item): item is Record<string, unknown> => Boolean(projectBoardDeliverableRecord(item))) : [];
}

function projectBoardDeliverableTaskActionStrings(actions: Record<string, unknown>[], field: string): string[] {
  return actions.flatMap((action) => projectBoardDeliverableStrings(action[field]));
}

function projectBoardDeliverableStrings(value: unknown): string[] {
  const items = Array.isArray(value) ? value : typeof value === "string" || typeof value === "number" ? [value] : projectBoardDeliverableRecord(value) ? [value] : [];
  return items
    .map((item) => {
      const record = projectBoardDeliverableRecord(item);
      if (record) {
        return (
          projectBoardDeliverableText(record.path) ??
          projectBoardDeliverableText(record.file) ??
          projectBoardDeliverableText(record.name) ??
          projectBoardDeliverableText(record.command) ??
          projectBoardDeliverableText(record.hash)
        );
      }
      return projectBoardDeliverableText(item);
    })
    .filter((item): item is string => Boolean(item));
}

function projectBoardUniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values.map((item) => item.trim()).filter(Boolean)) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function projectBoardDeliverableRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function projectBoardDeliverableText(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number") return String(value);
  return undefined;
}

function projectBoardDeliverableIntegrationAction(value: unknown): ProjectBoardDeliverableIntegrationAction | undefined {
  return value === "apply_to_root" || value === "export_bundle" || value === "defer" ? value : undefined;
}

function projectBoardDeliverableIntegrationResolvedStatus(value: unknown): Exclude<ProjectBoardDeliverableIntegrationStatus, "pending"> | undefined {
  return value === "integrated" || value === "exported" || value === "deferred" ? value : undefined;
}
