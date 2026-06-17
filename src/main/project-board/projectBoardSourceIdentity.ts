import { createHash } from "node:crypto";
import type {
  ProjectBoardSource,
  ProjectBoardSourceAuthorityRole,
  ProjectBoardSourceChangeState,
  ProjectBoardSourceClassifiedBy,
  ProjectBoardSourceKind,
} from "../../shared/types";

export interface ProjectBoardSourceIdentityInput {
  kind?: ProjectBoardSourceKind;
  sourceKey?: string;
  contentHash?: string;
  title?: string;
  summary?: string;
  excerpt?: string;
  path?: string;
  threadId?: string;
  artifactId?: string;
  messageId?: string;
}

export interface ProjectBoardSourceClassificationDefaults {
  classifiedBy: ProjectBoardSourceClassifiedBy;
  classificationConfidence: number;
  classificationReason: string;
  authorityRole: ProjectBoardSourceAuthorityRole;
  includeInSynthesis: boolean;
}

export const DURABLE_PLAN_SOURCE_AUTHORITY_REASON = "Durable plan selected as source of truth";
export const GENERATED_WORKFLOW_SOURCE_AUTHORITY_REASON =
  "Generated workflow scaffolding is excluded from board synthesis until explicitly promoted by the user";
export const GENERATED_REPORT_SOURCE_AUTHORITY_REASON =
  "Generated report artifacts are excluded from board synthesis until explicitly promoted by the user";

export function projectBoardSourceKey(source: ProjectBoardSourceIdentityInput): string {
  const explicit = source.sourceKey?.trim();
  if (explicit) return explicit;
  if (source.path?.trim()) return `file:${normalizeSourcePath(source.path)}`;
  if (source.artifactId?.trim()) return `artifact:${source.artifactId.trim()}`;
  if (source.threadId?.trim()) return `thread:${source.threadId.trim()}`;
  if (source.messageId?.trim()) return `message:${source.messageId.trim()}`;
  const title = source.title?.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9._:-]+/g, "").slice(0, 120);
  return `source:${title || "untitled"}:${projectBoardSourceContentHash(source).slice(0, 12)}`;
}

export function projectBoardSourceContentHash(source: ProjectBoardSourceIdentityInput): string {
  const explicit = source.contentHash?.trim();
  if (explicit) return explicit;
  return hashProjectBoardSourceContent(
    [source.kind ?? "", source.title ?? "", source.summary ?? "", source.excerpt ?? "", source.path ?? "", source.threadId ?? "", source.artifactId ?? "", source.messageId ?? ""].join(
      "\0",
    ),
  );
}

export function hashProjectBoardSourceContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function projectBoardSourceChangeState(
  previous: Pick<ProjectBoardSource, "contentHash" | "sourceKey"> | undefined,
  next: Pick<ProjectBoardSource, "contentHash" | "sourceKey">,
): ProjectBoardSourceChangeState {
  if (!previous) return "new";
  if (previous.contentHash && next.contentHash && previous.contentHash !== next.contentHash) return "changed";
  return "unchanged";
}

export function projectBoardSourceClassificationDefaults(input: {
  kind: ProjectBoardSourceKind;
  relevance: number;
  summary?: string;
  reason?: string;
  classifiedBy?: ProjectBoardSourceClassifiedBy;
}): ProjectBoardSourceClassificationDefaults {
  const classifiedBy = input.classifiedBy ?? "fallback_heuristic";
  return {
    classifiedBy,
    classificationConfidence: Math.max(0.1, Math.min(0.95, input.relevance / 100)),
    classificationReason: input.reason ?? defaultClassificationReason(input.kind, classifiedBy, input.summary),
    authorityRole: projectBoardSourceAuthorityRole(input.kind, input.relevance),
    includeInSynthesis: input.kind !== "ignored",
  };
}

export function projectBoardSourceAuthorityRole(kind: ProjectBoardSourceKind, relevance: number): ProjectBoardSourceAuthorityRole {
  if (kind === "ignored") return "ignored";
  if (kind === "test_artifact") return "proof";
  if (kind === "report_artifact") return "supporting";
  if (kind === "thread" || kind === "git_state" || kind === "implementation_file" || kind === "markdown") return "context";
  if (relevance >= 84) return "primary";
  return "supporting";
}

export function projectBoardSourceIsDurablePlanPrimary(source: {
  kind?: ProjectBoardSourceKind;
  path?: string;
  authorityRole?: ProjectBoardSourceAuthorityRole;
  includeInSynthesis?: boolean;
}): boolean {
  return (
    source.kind === "plan_artifact" &&
    source.path?.replace(/\\/g, "/").startsWith(".ambient/board/plans/") === true &&
    source.authorityRole === "primary" &&
    source.includeInSynthesis !== false
  );
}

export function projectBoardSourceIgnoredByDurablePlanPolicy(source: {
  kind?: ProjectBoardSourceKind;
  authorityRole?: ProjectBoardSourceAuthorityRole;
  includeInSynthesis?: boolean;
  classificationReason?: string;
}): boolean {
  return (
    source.authorityRole === "ignored" &&
    source.includeInSynthesis === false &&
    source.classificationReason?.includes(DURABLE_PLAN_SOURCE_AUTHORITY_REASON) === true
  );
}

export function projectBoardSourceIncludedInSynthesis(source: {
  kind?: ProjectBoardSourceKind;
  authorityRole?: ProjectBoardSourceAuthorityRole;
  includeInSynthesis?: boolean;
}): boolean {
  return source.kind !== "ignored" && source.includeInSynthesis !== false && source.authorityRole !== "ignored";
}

export function projectBoardSourceDeterministicAuthorityLocked(source: {
  kind?: ProjectBoardSourceKind;
  authorityRole?: ProjectBoardSourceAuthorityRole;
  includeInSynthesis?: boolean;
  classificationReason?: string;
}): boolean {
  return (
    projectBoardSourceIgnoredByDurablePlanPolicy(source) ||
    (source.authorityRole === "ignored" &&
      source.includeInSynthesis === false &&
      source.classificationReason?.includes(GENERATED_REPORT_SOURCE_AUTHORITY_REASON) === true) ||
    (source.authorityRole === "ignored" &&
      source.includeInSynthesis === false &&
      source.classificationReason?.includes(GENERATED_WORKFLOW_SOURCE_AUTHORITY_REASON) === true)
  );
}

function defaultClassificationReason(kind: ProjectBoardSourceKind, classifiedBy: ProjectBoardSourceClassifiedBy, summary?: string): string {
  if (classifiedBy === "user") return `User selected ${kind} for this project source.`;
  if (classifiedBy === "ambient_pi") return `Ambient/Pi selected ${kind} for this project source.`;
  return summary ? `Fallback path/content classifier selected ${kind}: ${summary}` : `Fallback path/content classifier selected ${kind}.`;
}

function normalizeSourcePath(path: string): string {
  return path.trim().replace(/\\/g, "/").replace(/^\.\/+/, "");
}
