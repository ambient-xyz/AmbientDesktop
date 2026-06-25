import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vi } from "vitest";
import type {
  MiniCpmVisionAnalysisResult,
  MiniCpmVisionAnalyzeInput,
  MiniCpmVisionSetupInput,
  MiniCpmVisionSetupResult,
} from "../../shared/localRuntimeTypes";

export function dogfoodNodeId(prefix: string, value: string, index: number): string {
  const normalized = value
    .replace(/^[^A-Za-z0-9]+/, "")
    .replace(/[^A-Za-z0-9_.:-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 96)
    .replace(/[-_.:]+$/, "");
  return `${prefix}-${index + 1}${normalized ? `-${normalized}` : ""}`;
}

export async function createLocalDownloadsFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "ambient-downloads-fixture-"));
  await mkdir(join(root, "Invoices"), { recursive: true });
  await mkdir(join(root, "Irish music sets"), { recursive: true });
  await mkdir(join(root, "Project exports"), { recursive: true });
  await writeFile(join(root, "Resume draft.pdf"), "fixture pdf placeholder\n", "utf8");
  await writeFile(join(root, "Invoices", "2026-05 vendor receipt.txt"), "Vendor receipt for office supplies.\n", "utf8");
  await writeFile(join(root, "Irish music sets", "scottsdale-celtic-lineup.md"), "# Upcoming folk and Celtic shows\n", "utf8");
  await writeFile(join(root, "Project exports", "workflow-compiler-notes.txt"), "Workflow compiler investigation notes.\n", "utf8");
  await writeFile(join(root, ".hidden-local-token.txt"), "hidden fixture file should not be listed by default.\n", "utf8");
  await writeFile(join(root, "secret-api-key.txt"), "secret-like fixture should be skipped by local directory policy.\n", "utf8");
  return root;
}

export async function createLocalDownloadsImageFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "ambient-downloads-image-fixture-"));
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64");
  const names = [
    "01-ui-screenshot.png",
    "02-receipt-photo.png",
    "03-travel-snapshot.png",
    "04-whiteboard-diagram.png",
    "05-product-label.png",
    "06-map-crop.png",
    "07-event-poster.png",
    "08-form-scan.png",
    "09-chart-export.png",
    "10-reference-design.png",
  ];
  for (const name of names) await writeFile(join(root, name), png);
  return root;
}

export function fakeMiniCpmVision() {
  return {
    setupMiniCpm: vi.fn(
      async (_workspacePath: string, input: MiniCpmVisionSetupInput): Promise<MiniCpmVisionSetupResult> => ({
        provider: "minicpm-v",
        action: input.action ?? "validate",
        status: "ready",
        packageName: "ambient-minicpm-v-vision",
        installStatuses: [],
        runtimeCandidates: [],
        validation: {
          schemaVersion: "ambient-minicpm-v-provider-validation-v1",
          provider: "minicpm-v",
          packageName: "ambient-minicpm-v-vision",
          status: "passed",
          updatedAt: new Date("2026-05-16T00:00:00.000Z").toISOString(),
          platform: "fixture",
          arch: "fixture",
          lane: "fixture",
          missingHints: [],
        },
        diagnostics: [],
        nextSteps: [],
      }),
    ),
    analyzeMiniCpm: vi.fn(async (_workspacePath: string, input: MiniCpmVisionAnalyzeInput): Promise<MiniCpmVisionAnalysisResult> => {
      const imagePath = input.image?.path ?? input.imagePath ?? "unknown-image.png";
      const basename = imagePath.split(/[\\/]/).pop() ?? imagePath;
      return {
        provider: "minicpm-v",
        status: "passed",
        packageName: "ambient-minicpm-v-vision",
        task: input.task ?? "image_description",
        prompt: input.prompt ?? "fixture prompt",
        model: "fixture-minicpm",
        durationMs: 1,
        summary: `MiniCPM fixture analysis for ${basename}`,
        observations: [
          {
            kind: "uncertainty",
            description: `Fixture visual observation for ${basename}`,
            confidence: "low",
            evidence: imagePath,
          },
        ],
        limitations: ["Fixture MiniCPM runner did not inspect pixels."],
        image: {
          path: imagePath,
          basename,
          bytes: 67,
          sha256: "b".repeat(64),
          source: input.image?.source ?? "external_file",
          label: input.image?.label,
          copiedFromExternalPath: Boolean(input.allowExternalMediaPaths || input.allowExternalImagePaths),
        },
        artifacts: { jsonPath: input.outputJsonPath ?? `workflow-vision/${basename}.json` },
        installStatuses: [],
        commands: [],
        validation: { valid: true, errors: [] },
        redaction: {
          returnedImagePathIsWorkspaceRelative: false,
          stdoutDoesNotContainAbsoluteImagePath: true,
          artifactPathIsWorkspaceRelative: true,
        },
      };
    }),
  };
}

export function localDirectoryClassificationCompilerOutput(directoryPath: string) {
  return {
    version: 1,
    title: "Local Downloads Classification Dogfood",
    goal: "Review a user-approved local Downloads-style directory and classify visible entries into a concise set of categories.",
    summary:
      "Lists bounded local directory metadata, asks Ambient to classify the entries, and checkpoints the classification with directory provenance.",
    successCriteria: [
      "The workflow uses local_directory_list instead of Google Drive or shell",
      "Hidden and secret-like paths are not required for classification",
      "Ambient returns up to seven categories with evidence from visible directory metadata",
    ],
    inputs: { directoryPath },
    nodes: [
      {
        id: "list-local-downloads",
        kind: "tool.call" as const,
        label: "List local Downloads fixture",
        tool: "local_directory_list",
        args: { path: directoryPath, maxEntries: 200, maxDepth: 2, includeHidden: false },
        output: { type: "localDirectoryListResult" },
      },
      {
        id: "classify-local-downloads",
        kind: "model.call" as const,
        dependsOn: ["list-local-downloads"],
        task: "dogfood.local_downloads_classification",
        input: {
          instruction:
            "Return JSON with summary:string and categories:array. Use at most seven categories. Base the categories only on visible directory metadata, and mention skipped hidden or secret-like paths only as safety exclusions.",
          directory: { fromNode: "list-local-downloads", path: "rootPath" },
          entries: { fromNode: "list-local-downloads", path: "entries" },
          skipped: { fromNode: "list-local-downloads", path: "skipped" },
          truncated: { fromNode: "list-local-downloads", path: "truncated" },
          totalKnownEntries: { fromNode: "list-local-downloads", path: "totalKnownEntries" },
        },
        output: { schema: { summary: "string", categories: "array" } },
      },
      {
        id: "local-directory-classification-checkpoint",
        kind: "checkpoint.write" as const,
        dependsOn: ["classify-local-downloads"],
        key: "localDirectoryClassification",
        value: {
          directory: { fromNode: "list-local-downloads", path: "rootPath" },
          entries: { fromNode: "list-local-downloads", path: "entries" },
          skipped: { fromNode: "list-local-downloads", path: "skipped" },
          truncated: { fromNode: "list-local-downloads", path: "truncated" },
          totalKnownEntries: { fromNode: "list-local-downloads", path: "totalKnownEntries" },
          classification: { fromNode: "classify-local-downloads" },
        },
      },
      {
        id: "final_output",
        kind: "output.final" as const,
        dependsOn: ["local-directory-classification-checkpoint"],
        value: { localDirectoryClassification: { fromNode: "local-directory-classification-checkpoint" } },
      },
    ],
    budgets: { maxToolCalls: 1, maxModelCalls: 1, maxRunMs: 180_000 },
    openQuestions: [],
  };
}

export function localImageCategorizationCompilerOutput(directoryPath: string) {
  const imageAnalysisNodes = Array.from({ length: 10 }, (_, index) => {
    const imageNumber = index + 1;
    return {
      id: `analyze-downloads-image-${imageNumber}`,
      kind: "tool.call" as const,
      label: `Analyze Downloads image ${imageNumber}`,
      tool: "ambient_visual_analyze",
      dependsOn: ["list-downloads-images"],
      args: {
        image: {
          path: { fromNode: "list-downloads-images", path: `entries.${index}.absolutePath` },
          label: { fromNode: "list-downloads-images", path: `entries.${index}.name` },
          source: "external_file",
        },
        task: "image_description",
        prompt: "Describe visible subject matter and safe categorization cues for this image. Do not infer hidden content.",
        outputJsonPath: `workflow-vision/downloads-image-${imageNumber}.json`,
        allowExternalMediaPaths: true,
      },
      output: { type: "minicpmVisualAnalysis" },
    };
  });
  return {
    version: 1,
    title: "Local Downloads Image Categorization Dogfood",
    goal: "Categorize exactly 10 images from a user-approved local Downloads-style directory using MiniCPM-V visual evidence.",
    summary:
      "Lists bounded local image metadata, analyzes 10 image files with MiniCPM-V, asks Ambient to categorize the visual evidence, and checkpoints the result.",
    successCriteria: [
      "The workflow uses local_directory_list for the local folder inventory",
      "The workflow uses ambient_visual_analyze for MiniCPM-V visual evidence",
      "The workflow does not route local images through Google Drive, shell, raw ambient_cli, or a generic external LLM provider",
    ],
    inputs: { directoryPath },
    nodes: [
      {
        id: "list-downloads-images",
        kind: "tool.call" as const,
        label: "List local Downloads image fixture",
        tool: "local_directory_list",
        args: { path: directoryPath, maxEntries: 300, maxDepth: 1, includeHidden: false },
        output: { type: "localDirectoryListResult" },
      },
      ...imageAnalysisNodes,
      {
        id: "categorize-downloads-images",
        kind: "model.call" as const,
        dependsOn: imageAnalysisNodes.map((node) => node.id),
        task: "dogfood.local_downloads_image_categorization",
        input: {
          instruction:
            "Categorize exactly 10 local Downloads images from MiniCPM-V visual observations. Return summary:string, categories:array, assignments:array, and uncertaintyNotes:array.",
          directory: { fromNode: "list-downloads-images", path: "rootPath" },
          entries: { fromNode: "list-downloads-images", path: "entries" },
          skipped: { fromNode: "list-downloads-images", path: "skipped" },
          truncated: { fromNode: "list-downloads-images", path: "truncated" },
          totalKnownEntries: { fromNode: "list-downloads-images", path: "totalKnownEntries" },
          visualEvidence: imageAnalysisNodes.map((node) => ({ fromNode: node.id })),
        },
        output: { schema: { summary: "string", categories: "array", assignments: "array", uncertaintyNotes: "array" } },
      },
      {
        id: "local-image-categorization-checkpoint",
        kind: "checkpoint.write" as const,
        dependsOn: ["categorize-downloads-images"],
        key: "localImageCategorization",
        value: {
          directory: { fromNode: "list-downloads-images", path: "rootPath" },
          images: { fromNode: "list-downloads-images", path: "entries" },
          skipped: { fromNode: "list-downloads-images", path: "skipped" },
          truncated: { fromNode: "list-downloads-images", path: "truncated" },
          totalKnownEntries: { fromNode: "list-downloads-images", path: "totalKnownEntries" },
          visualEvidence: imageAnalysisNodes.map((node) => ({ fromNode: node.id })),
          imageCategories: { fromNode: "categorize-downloads-images" },
        },
      },
      {
        id: "final_output",
        kind: "output.final" as const,
        dependsOn: ["local-image-categorization-checkpoint"],
        value: { localImageCategorization: { fromNode: "local-image-categorization-checkpoint" } },
      },
    ],
    budgets: { maxToolCalls: 11, maxModelCalls: 1, maxRunMs: 900_000 },
    openQuestions: [],
  };
}

export function localFileReportCompilerOutput(paths: string[]) {
  const readNodes = paths.map((path, index) => ({
    id: dogfoodNodeId("read-file", path, index),
    kind: "tool.call" as const,
    label: `read ${path}`,
    tool: "file_read",
    args: { path },
    output: { type: "fileReadResult" },
  }));
  return {
    version: 1,
    title: "Local File Report Dogfood",
    goal: "Read local workspace notes and synthesize a concise planning report.",
    summary: "Reads local text files, asks Ambient to summarize the evidence, and checkpoints the report.",
    successCriteria: [
      "All files are read through file_read",
      "Ambient produces a report",
      "The report is checkpointed with file provenance",
    ],
    inputs: { paths },
    nodes: [
      ...readNodes,
      {
        id: "local-file-report",
        kind: "model.call" as const,
        dependsOn: readNodes.map((node) => node.id),
        task: "dogfood.local_file_report",
        input: {
          instruction:
            "Return JSON with report:string and files:string[]. Summarize the planning implications, mention registration/travel constraints when present, and cite the file paths.",
          files: readNodes.map((node, index) => ({
            path: paths[index],
            content: { fromNode: node.id, path: "content" },
            truncated: { fromNode: node.id, path: "truncated" },
          })),
        },
        output: { schema: { report: "string", files: "array" } },
      },
      {
        id: "local-file-report-checkpoint",
        kind: "checkpoint.write" as const,
        dependsOn: ["local-file-report"],
        key: "localFileReport",
        value: { files: paths, report: { fromNode: "local-file-report" } },
      },
      {
        id: "final_output",
        kind: "output.final" as const,
        dependsOn: ["local-file-report-checkpoint"],
        value: { localFileReport: { fromNode: "local-file-report-checkpoint" } },
      },
    ],
    budgets: { maxToolCalls: paths.length, maxModelCalls: 1, maxRunMs: 180_000 },
    openQuestions: [],
  };
}

export function scheduledLocalFileTimeoutRecoveryCompilerOutput(paths: string[]) {
  const readNodes = paths.map((path, index) => ({
    id: dogfoodNodeId("read-scheduled-file", path, index),
    kind: "tool.call" as const,
    label: `read ${path}`,
    tool: "file_read",
    args: { path },
    output: { type: "fileReadResult" },
  }));
  return {
    version: 1,
    title: "Scheduled Local File Timeout Recovery Dogfood",
    goal: "Read a local directory on a schedule, recover from a one-off timeout, and produce a compact HTML classification report.",
    summary:
      "Checkpoints normalized local-file evidence before a bounded preparation step and live Ambient classification, so a scheduled timeout can resume without rereading the files.",
    successCriteria: [
      "Local evidence is checkpointed before the recoverable timeout",
      "A resumed run keeps the schedule linkage",
      "Ambient produces a compact HTML report",
    ],
    inputs: { paths },
    nodes: [
      ...readNodes,
      {
        id: "scheduled-local-evidence",
        kind: "checkpoint.write" as const,
        label: "Checkpoint local evidence",
        dependsOn: readNodes.map((node) => node.id),
        key: "scheduledLocalEvidence",
        resumeKey: "scheduledLocalEvidence",
        value: {
          files: readNodes.map((node, index) => ({
            path: paths[index],
            content: { fromNode: node.id, path: "content" },
            truncated: { fromNode: node.id, path: "truncated" },
            kind: { fromNode: node.id, path: "kind" },
          })),
        },
      },
      {
        id: "scheduled-timeout-probe",
        kind: "tool.call" as const,
        label: "wait for scheduled watchdog",
        dependsOn: ["scheduled-local-evidence"],
        tool: "bash",
        args: { command: "sleep 2" },
        resumeKey: "scheduledTimeoutProbe",
        output: { type: "bashResult" },
      },
      {
        id: "classify-files",
        kind: "model.call" as const,
        label: "Classify files",
        dependsOn: ["scheduled-timeout-probe", "scheduled-local-evidence"],
        task: "dogfood.scheduled_local_report",
        input: {
          instruction:
            "Return JSON with summary:string, html:string, files:string[]. Classify each file by likely workflow category, mention concrete evidence from the content, and keep html compact.",
          files: { fromNode: "scheduled-local-evidence", path: "files" },
        },
        output: { schema: { summary: "string", html: "string", files: "array" } },
      },
      {
        id: "scheduled-local-report",
        kind: "checkpoint.write" as const,
        label: "Checkpoint report",
        dependsOn: ["classify-files"],
        key: "scheduledLocalReport",
        value: { files: paths, report: { fromNode: "classify-files" } },
      },
      {
        id: "output",
        kind: "output.final" as const,
        label: "Scheduled local report ready.",
        dependsOn: ["scheduled-local-report"],
        value: {
          format: "html",
          summary: { fromNode: "classify-files", path: "summary" },
          html: { fromNode: "classify-files", path: "html" },
          artifactPath: "reports/scheduled-local-report.html",
        },
      },
    ],
    budgets: { maxToolCalls: paths.length + 1, maxModelCalls: 1, maxRunMs: 180_000 },
    previewSummary: "Schedule local-file classification, recover from timeout, and render an HTML report.",
    dryRunStrategy: "Dry run reads the same local files and records checkpoint/output structure without external mutations.",
    openQuestions: [],
  };
}
