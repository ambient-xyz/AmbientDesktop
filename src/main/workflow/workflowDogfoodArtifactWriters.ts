import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

type HarnessTraceArtifactsModule = {
  snapshotHarnessWorkspace: (workspacePath: string) => Promise<unknown>;
  writeHarnessTraceArtifacts: (input: Record<string, unknown>) => Promise<unknown>;
};

export async function writeLiveGmailRunDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-gmail-run-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeGmailGrantReviewDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-gmail-grant-review-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeGraphFirstReviewDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-graph-review-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function snapshotHarnessWorkspaceIfEnabled(workspacePath: string): Promise<unknown | undefined> {
  if (!process.env.AMBIENT_HARNESS_TRACE_DIR) return undefined;
  const { snapshotHarnessWorkspace } = await importHarnessTraceArtifacts();
  return snapshotHarnessWorkspace(workspacePath);
}

export async function writeWorkflowGraphReviewHarnessTrace(
  workspacePath: string,
  beforeWorkspace: unknown | undefined,
  review: unknown,
): Promise<void> {
  if (!process.env.AMBIENT_HARNESS_TRACE_DIR || !beforeWorkspace) return;
  const { writeHarnessTraceArtifacts } = await importHarnessTraceArtifacts();
  await writeHarnessTraceArtifacts({
    workspace: workspacePath,
    beforeWorkspace,
    summary: {
      status: review ? "passed" : "failed",
      task: "workflow-graph-review",
      review,
    },
  });
}

export async function importHarnessTraceArtifacts(): Promise<HarnessTraceArtifactsModule> {
  return import(pathToFileURL(join(process.cwd(), "scripts", "harness-trace-artifacts.mjs")).href) as Promise<HarnessTraceArtifactsModule>;
}

export async function writeRetentionTraceDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-retention-trace-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeLocalFileRunDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-local-file-run-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeLocalDirectoryRunDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-local-directory-run-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeLocalImageRunDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-local-image-run-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeBrowserResearchRunDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-browser-research-run-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeBrowserExplorationReviewDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-browser-exploration-review-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeBrowserInterventionRecoveryDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-browser-intervention-recovery-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeManagedBrowserInterventionDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-managed-browser-intervention-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeExternalManagedBrowserDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-external-managed-browser-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeArtifactReviewRunDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-artifact-review-run-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeMutationReviewRunDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-mutation-review-run-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writePlanEditDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-plan-edit-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writePlanEditActionDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-plan-edit-action-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writePlanEditPreviewDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-plan-edit-preview-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writePlanEditRunVersionDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-plan-edit-run-version-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writePlanEditApplyRestoreDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-plan-edit-apply-restore-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writePluginMcpRunDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-plugin-mcp-run-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeExplorationToDeterministicDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-exploration-deterministic-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeCapabilityAwareDiscoveryDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-capability-aware-discovery-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeCapabilityAwareAmbientCliDiscoveryDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-capability-aware-ambient-cli-discovery-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeAmbientCliExplorationCompileRunDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-ambient-cli-exploration-compile-run-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeRecoveryActionsDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-recovery-actions-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeRuntimeComposerDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-runtime-composer-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeDebugRewriteDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-debug-rewrite-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeLiveDebugRewriteDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-live-debug-rewrite-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeCalendarRunDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-calendar-run-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeScheduledCalendarRunDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-scheduled-calendar-run-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeScheduledLocalTimeoutRecoveryDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-scheduled-local-timeout-recovery-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeDriveRunDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-drive-run-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
