import { appendFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ArtifactDraftEvent, ArtifactDraftManifest, ArtifactDraftSummary } from "../../shared/artifactDrafts";

export const ARTIFACT_DRAFTS_WORKSPACE_DIR = ".ambient/artifact-drafts";

export interface ArtifactDraftLayout {
  rootPath: string;
  manifestPath: string;
  contentPath?: string;
  sectionsPath: string;
  recordsPath: string;
  validationPath: string;
  eventsPath: string;
}

export function artifactDraftRootPath(workspacePath: string): string {
  return join(workspacePath, ARTIFACT_DRAFTS_WORKSPACE_DIR);
}

export function assertArtifactDraftId(id: string): string {
  if (!/^draft_[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error("Artifact draft id must start with draft_ and contain only letters, numbers, underscores, or hyphens.");
  }
  return id;
}

export function artifactDraftLayout(workspacePath: string, draftId: string, contentFileName?: string): ArtifactDraftLayout {
  const safeId = assertArtifactDraftId(draftId);
  const rootPath = join(artifactDraftRootPath(workspacePath), safeId);
  return {
    rootPath,
    manifestPath: join(rootPath, "manifest.json"),
    ...(contentFileName ? { contentPath: join(rootPath, contentFileName) } : {}),
    sectionsPath: join(rootPath, "sections"),
    recordsPath: join(rootPath, "records"),
    validationPath: join(rootPath, "validation"),
    eventsPath: join(rootPath, "events.jsonl"),
  };
}

export async function ensureArtifactDraftLayout(layout: ArtifactDraftLayout): Promise<void> {
  await Promise.all([
    mkdir(layout.rootPath, { recursive: true }),
    mkdir(layout.sectionsPath, { recursive: true }),
    mkdir(layout.recordsPath, { recursive: true }),
    mkdir(layout.validationPath, { recursive: true }),
  ]);
}

export async function writeArtifactDraftManifestAtomic(manifest: ArtifactDraftManifest): Promise<void> {
  await mkdir(dirname(manifest.paths.manifestPath), { recursive: true });
  await writeJsonAtomic(manifest.paths.manifestPath, manifest);
}

export async function readArtifactDraftManifest(manifestPath: string): Promise<ArtifactDraftManifest> {
  const raw = await readFile(manifestPath, "utf8");
  return JSON.parse(raw) as ArtifactDraftManifest;
}

export async function appendArtifactDraftEventLog(eventsPath: string, event: ArtifactDraftEvent): Promise<void> {
  await mkdir(dirname(eventsPath), { recursive: true });
  await appendFile(eventsPath, `${JSON.stringify(event)}\n`, "utf8");
}

export async function removeArtifactDraftLayout(layout: ArtifactDraftLayout): Promise<void> {
  await rm(layout.rootPath, { recursive: true, force: true });
}

export function artifactDraftContentFileName(kind: ArtifactDraftSummary["kind"], assembly: ArtifactDraftSummary["assembly"]): string | undefined {
  if (assembly === "sectioned" || assembly === "record_batch" || assembly === "patch") return undefined;
  if (kind === "json" || kind === "record_set") return "content.json";
  if (kind === "markdown" || kind === "document") return "content.md";
  if (kind === "code") return "content.txt";
  return "content.partial";
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  const temporaryPath = `${path}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}
