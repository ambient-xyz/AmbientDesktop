#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import {
  assertWorkflowUiDogfoodEvidence,
  connectorEndMessages,
  desktopToolEndMessages,
  outputSignalCount,
  workflowUiDogfoodCredentialStatus,
  workflowUiDogfoodLaunchEnvironment,
  workflowUiDogfoodSelectedSnapshotRoot,
  workflowUiDogfoodSnapshotPreflight,
  workflowUiDogfoodSnapshotPreflightErrorMessage,
} from "./workflow-ui-dogfood-contract.mjs";
import { workflowDiscoveryProgress, workflowThreadFromFolders } from "./workflow-agent-thread-ui-dogfood-lib.mjs";

const args = new Set(process.argv.slice(2));
const keepArtifacts = args.has("--keep");
const scenarioName =
  valueForArg("--scenario") ||
  process.env.AMBIENT_WORKFLOW_UI_DOGFOOD_SCENARIO ||
  "vocabulary-quiz";
const planDslCompilerDogfood =
  envFlag(process.env.AMBIENT_WORKFLOW_PLAN_DSL_COMPILER) ||
  envFlag(process.env.AMBIENT_WORKFLOW_PLAN_DSL_ENABLED);
const harnessName =
  valueForArg("--harness") ||
  process.env.AMBIENT_WORKFLOW_UI_DOGFOOD_HARNESS_NAME ||
  `workflow-agent-thread-ui-dogfood/${scenarioName}`;
const startedAt = new Date().toISOString();
const harnessRunId = safeFilePart(
  process.env.AMBIENT_WORKFLOW_UI_DOGFOOD_HARNESS_ID ||
    `${scenarioName}-${startedAt.replace(/[:.]/g, "-")}-${process.pid}`,
);
const port = Number(valueForArg("--port") || process.env.AMBIENT_WORKFLOW_UI_DOGFOOD_CDP_PORT || 9647);
const dogfoodTimeoutMs = Number(process.env.AMBIENT_WORKFLOW_UI_DOGFOOD_TIMEOUT_MS || 1_800_000);
const liveStepTimeoutMs = Number(process.env.AMBIENT_WORKFLOW_UI_DOGFOOD_STEP_TIMEOUT_MS || 900_000);
const providerIdleRetryLimit = Number(process.env.AMBIENT_WORKFLOW_UI_DOGFOOD_PROVIDER_IDLE_RETRIES || 2);
const providerIdleRetryBaseDelayMs = Number(process.env.AMBIENT_WORKFLOW_UI_DOGFOOD_PROVIDER_IDLE_RETRY_BASE_MS || 5_000);
const forcedPermissionMode = permissionModeForValue(
  valueForArg("--permission-mode") || process.env.AMBIENT_WORKFLOW_UI_DOGFOOD_PERMISSION_MODE,
);
const stateDirs = await createDogfoodStateDirs();
const workspace = stateDirs.workspace;
const userData = stateDirs.userData;
const launchConfig = workflowUiDogfoodLaunchEnvironment({
  env: process.env,
  cwd: process.cwd(),
  workspace,
  userData,
  snapshotMode: stateDirs.snapshotMode,
});
const reportRoot = resolve("test-results", "workflow-agent-thread-ui-dogfood");
const scenarioReportRoot = join(reportRoot, scenarioName);
const harnessReportRoot = join(reportRoot, "runs", harnessRunId);
const screenshotsDir = join(harnessReportRoot, "screenshots");
const maxRetainedRunEvents = Number(process.env.AMBIENT_WORKFLOW_UI_DOGFOOD_MAX_RUN_EVENTS || 420);
const appOutput = [];
const children = new Set();
let app;
let report;

const scenarios = {
  "vocabulary-quiz": {
    title: "Vocabulary Workflow UI Dogfood",
    request: [
      "Create a Workflow Agent that uses Ambient to pick one useful vocabulary word for an adult learner.",
      "The workflow should ask the user to guess the meaning with multiple-choice or freeform input, then use the answer to produce a concise HTML study card with the definition, etymology if known, and two example sentences.",
      "The final output must include visible section labels exactly named Definition, Etymology, and Example sentences so the evidence gate can verify the study-card contract.",
      "Use only the selected Ambient model as the source of vocabulary knowledge.",
      "Do not use browser, network, Workspace Inventory, Gmail, Google Drive, Google Calendar, Google Workspace, Slack, email, account connectors, external accounts, workspace files, or connector metadata for this dogfood run.",
      "Do not write files or create workspace mutations; return the study card content in the final workflow output card.",
    ].join(" "),
    answerPreference: ["model only", "no connector", "no account", "no browser", "no network", "no file", "no write", "output card", "quiz", "html", "freeform", "multiple"],
    runtimeChoicePreference: ["first option", "closest", "continue", "proceed", "submit", "answer"],
    runtimeAnswer: "I think the first option is closest. Please continue and produce a concise study card with Definition, Etymology, and Example sentences sections.",
    expect: {
      minModelCalls: 1,
      minRuntimeInputs: 1,
      minRuntimeInputResponses: 1,
      minOutputSignals: 1,
      minFinalOutputChars: 120,
      requiredFinalOutputAnyTerms: [["definition", "meaning"], ["example", "sentence"]],
      forbiddenToolMessages: ["browser_search", "browser_nav", "browser_content", "file_read", "file_write", "google_workspace_call", "local_directory_list"],
      forbiddenToolFamilies: ["browser_", "google."],
    },
    sourceExpect: {
      requiredTerms: ["workflow.askUser", "workflow.output"],
      forbiddenTerms: ["tools.browser_", "tools.file_read", "tools.file_write", "google_workspace_call", "local_directory_list", "workspace.inventory"],
      manifest: {
        forbiddenTools: ["browser_search", "browser_nav", "browser_content", "file_read", "file_write", "google_workspace_call", "local_directory_list"],
      },
      validationReport: {
        status: "passed",
        maxConnectorWriteOperationCount: 0,
      },
    },
  },
  "local-file-classifier": {
    title: "Local File Classification Workflow UI Dogfood",
    request: [
      "Create a Workflow Agent that uses the file_read workflow tool directly to read these three known workspace-local files: dogfood-notes/admin.md, dogfood-notes/family-events.md, and dogfood-notes/learning.md.",
      "The only permitted read tool is Ambient Desktop's local/workspace file_read workflow tool. Forbidden external sources: Google Drive, Google Workspace, google.drive, google_workspace_call, connector content, connector account data, cloud accounts, and external accounts.",
      "Use those relative paths exactly; do not embed absolute temporary paths in the workflow source.",
      "Do not use workspace.inventory, browser, search, connector metadata, connector listing, or account-backed capabilities for this scenario.",
      "This is a plain local file classification report, not a quiz, study-card, flashcard, tutoring, lesson, or interactive_model_study_card recipe workflow.",
      "Do not write files or create workspace mutations; return the labeled HTML in the final workflow output card.",
      "Classify the notes into useful categories,",
      "asks the user for qualitative feedback on the classifications, then returns a labeled HTML document.",
      "Keep output compact, checkpoint the normalized file evidence before the Ambient call, and checkpoint the generated HTML.",
    ].join(" "),
    answerPreference: ["local desktop file_read", "classification report", "not study card", "not google drive", "no connector", "no recipe", "local", "file", "html", "feedback", "read only"],
    allowDiscoveryAccessCapabilities: ["file_content"],
    runtimeChoicePreference: ["looks good", "proceed", "approve", "approved", "continue", "as-is", "final"],
    runtimeAnswer: "The categories look reasonable. Please keep them concise and produce the final HTML report.",
    seedWorkspace: async (root) => {
      const notesDir = join(root, "dogfood-notes");
      await mkdir(notesDir, { recursive: true });
      await writeFile(join(notesDir, "family-events.md"), "# Family events\n\nPool day, library story time, and a weekend hike.\n", "utf8");
      await writeFile(join(notesDir, "admin.md"), "# Admin\n\nRenew parking permit, archive tax receipts, and confirm appointments.\n", "utf8");
      await writeFile(join(notesDir, "learning.md"), "# Learning\n\nVocabulary practice, flash cards, and short reading summaries.\n", "utf8");
    },
    expect: {
      minModelCalls: 1,
      minRuntimeInputs: 1,
      minRuntimeInputResponses: 1,
      minOutputSignals: 1,
      minCheckpoints: 1,
      minFinalOutputChars: 160,
      requiredFinalOutputAnyTerms: [["family", "events"], ["admin", "permit"], ["learning", "vocabulary"]],
      requiredToolMessages: ["file_read"],
      forbiddenToolMessages: ["browser_search", "browser_nav", "browser_content", "file_write"],
      forbiddenToolFamilies: ["browser_"],
    },
    sourceExpect: {
      requiredTerms: ["tools.file_read", "workflow.askUser", "workflow.output"],
      forbiddenTerms: ["tools.browser_", "tools.file_write", "google_workspace_call"],
      manifest: {
        requiredTools: ["file_read"],
        forbiddenTools: ["browser_search", "browser_nav", "browser_content", "file_write", "google_workspace_call"],
      },
      validationReport: {
        status: "passed",
        requiredValidatorIds: [
          "workflow.program.static",
          "workflow.program.static_budget",
          "workflow.output.schema",
          "workflow.program.dry_run",
        ],
        forbidFailedValidators: true,
        mutationPolicy: "read_only",
        maxConnectorWriteOperationCount: 0,
      },
      promptAssembly: {
        requiredModuleIds: localFilePromptAssemblyModuleIds(),
        forbiddenModuleFragments: ["browser", "gmail", "google-workspace", "current-data", "movie-night", "visual-analysis"],
      },
      compileContext: {
        maxSelectedRecipeCount: 0,
        requiredRejectedRecipeIds: [
          "large_collection_summarization",
          "interactive_model_study_card",
          "current_web_research",
          "metadata_first_personal_data_review",
          "visual_batch_classification",
          "staged_document_export",
          "browser_item_recovery",
        ],
        forbiddenRecipeIds: ["large_collection_summarization", "interactive_model_study_card", "current_web_research", "staged_document_export"],
      },
    },
    abstractionContract: {
      id: "capability-only-local-file-readonly",
      contractType: "capability-only-workflow",
      proves: [
        "selected desktop file capability guidance is sufficient for a simple local read workflow",
        "typed recipes stay rejected when the request does not need collection, browser, connector, visual, or export patterns",
        "read-only validators pass without connector grants or mutation tools",
      ],
      promptAssembly: {
        requiredModuleIds: localFilePromptAssemblyModuleIds(),
        forbiddenModuleFragments: ["browser", "gmail", "google-workspace", "current-data", "movie-night", "visual-analysis"],
      },
      compileContext: {
        maxSelectedRecipeCount: 0,
        requiredRejectedRecipeIds: [
          "large_collection_summarization",
          "interactive_model_study_card",
          "current_web_research",
          "metadata_first_personal_data_review",
          "visual_batch_classification",
          "staged_document_export",
          "browser_item_recovery",
        ],
      },
      validationReport: {
        requiredValidatorIds: [
          "workflow.program.static",
          "workflow.program.static_budget",
          "workflow.output.schema",
          "workflow.program.dry_run",
        ],
        mutationPolicy: "read_only",
      },
      forbiddenPromptAssemblyMetadataFragments: ["local-file-classifier", "dogfood-notes"],
    },
  },
  "downloads-document-categorization": {
    title: "Downloads Document Categorization Workflow UI Dogfood",
    request: [
      `Create a read-only Workflow Agent for Project 1 that categorizes the seeded Downloads fixture directory at ${join(workspace, "Downloads")}.`,
      "Use local_directory_list exactly once for the folder inventory with maxEntries no more than 40 and maxDepth no more than 2.",
      "Use metadata only: file names, extensions, folder names, sizes, modified times, and skipped-entry metadata are enough for this test.",
      "Do not call local_file_read, file_read, browser tools, Google Workspace connectors, shell/bash, or any write tool.",
      "Carry local_directory_list.skipped into the inventory checkpoint, model input, rendered report, and final output as skippedMetadata with counts and reasons only.",
      "Categorize the visible documents and top-level folders into up to 7 useful categories, include item examples under each category, and include an uncategorized or needs-review bucket if evidence is weak.",
      "Mention hidden and secret-like skipped entries only as skipped/ignored metadata without exposing contents.",
      "Return a compact final HTML or markdown report and checkpoint the normalized directory inventory before the Ambient model call.",
    ].join(" "),
    answerPreference: ["downloads", "metadata", "local_directory_list", "read only", "no writes", "categories"],
    runtimeChoicePreference: ["metadata", "continue", "proceed", "approve", "looks good", "read only"],
    runtimeAnswer: "Use metadata only, keep the categories concise, and produce the final report without reading file contents.",
    seedWorkspace: async (root) => {
      const downloadsDir = join(root, "Downloads");
      await mkdir(join(downloadsDir, "Recipes"), { recursive: true });
      await mkdir(join(downloadsDir, "Photos To Sort"), { recursive: true });
      await mkdir(join(downloadsDir, "Receipts"), { recursive: true });
      await writeFile(join(downloadsDir, "tax-receipts-2025.pdf"), "fixture pdf placeholder\n", "utf8");
      await writeFile(join(downloadsDir, "family-road-trip-itinerary.md"), "# Family Road Trip\n\nFlagstaff hotels and packing checklist.\n", "utf8");
      await writeFile(join(downloadsDir, "vocabulary-practice-notes.txt"), "Weekly vocabulary review and flash card prompts.\n", "utf8");
      await writeFile(join(downloadsDir, "home-insurance-policy.pdf"), "fixture policy placeholder\n", "utf8");
      await writeFile(join(downloadsDir, "budget-summary.xlsx"), "Owner,Amount\nHousehold,1200\n", "utf8");
      await writeFile(join(downloadsDir, "Receipts", "parking-permit-receipt.txt"), "Parking permit receipt fixture.\n", "utf8");
      await writeFile(join(downloadsDir, "Recipes", "soup-night.md"), "# Soup night\n\nGrocery notes.\n", "utf8");
      await writeFile(join(downloadsDir, ".hidden-download-cache"), "hidden fixture\n", "utf8");
      await writeFile(join(downloadsDir, "credentials.txt"), "secret-like fixture skipped by local_directory_list\n", "utf8");
    },
    expect: {
      minModelCalls: 1,
      minOutputSignals: 1,
      minCheckpoints: 1,
      minFinalOutputChars: 220,
      requiredToolMessages: ["local_directory_list"],
      exactToolMessageCounts: { local_directory_list: 1 },
      forbiddenToolMessages: ["local_file_read", "file_read", "file_write", "bash", "browser_search", "browser_nav", "browser_content", "google_workspace_call"],
      forbiddenToolFamilies: ["browser_"],
      requiredFinalOutputTerms: ["hidden", "secret"],
      requiredFinalOutputAnyTerms: [["finance", "tax", "receipt", "budget"], ["travel", "itinerary", "trip"], ["learning", "vocabulary"], ["household", "insurance", "home"], ["recipe", "food", "meal"], ["skipped", "ignored", "hidden", "secret"]],
    },
    sourceExpect: {
      requiredTerms: ["tools.local_directory_list", "maxDepth", "maxEntries", "readPath(outputs[", "skippedMetadata"],
      forbiddenTerms: ["tools.local_file_read", "tools.file_read", "tools.file_write", "tools.bash", "tools.browser_", "google_workspace_call"],
    },
  },
  "downloads-image-categorization": {
    title: "Downloads Image Categorization Workflow UI Dogfood",
    permissionMode: "full-access",
    request: [
      `Create a read-only Workflow Agent for Project 2 that categorizes exactly 10 visible PNG images from the seeded Downloads fixture directory at ${join(workspace, "Downloads")}.`,
      "Use local_directory_list exactly once for the folder inventory with maxEntries no more than 40 and maxDepth no more than 1.",
      "Select only the ten visible PNG files whose names start with image-; do not analyze hidden, secret-like, non-image, or non-PNG candidates.",
      "Use ambient_visual_analyze exactly once per selected image with task image_description, preferably in a bounded loop.map with maxItems 10 and maxConcurrency no more than 4.",
      "Do not use filename-only or metadata-only categorization as a substitute for MiniCPM-V visual observations.",
      "Do not call local_file_read, file_read, browser tools, Google Workspace connectors, shell/bash, ambient_visual_minicpm_setup, or any write tool.",
      "Carry the selected image list, local_directory_list.skipped metadata, and each ambient_visual_analyze result into checkpoints, the model input, and the final output.",
      "Return a compact final HTML or markdown table with practical categories, item assignments, visual-observation evidence, uncertainty notes, and an explicit coverage line that says whether all 10 images were analyzed.",
    ].join(" "),
    answerPreference: ["downloads", "images", "visual", "ambient_visual_analyze", "read only", "10", "png"],
    runtimeChoicePreference: ["visual", "continue", "proceed", "approve", "looks good", "read only"],
    runtimeAnswer: "Use the visual observations from ambient_visual_analyze, keep the categories concise, and clearly state coverage for all 10 selected images.",
    seedWorkspace: async (root) => {
      const downloadsDir = join(root, "Downloads");
      await mkdir(downloadsDir, { recursive: true });
      const fixtures = [
        ["test/visual-baselines/05a-workflow-discovery.png", "image-01-workflow-discovery.png"],
        ["test/visual-baselines/05b-workflow-agent-diagram.png", "image-02-workflow-diagram.png"],
        ["test/visual-baselines/05c-workflow-compile-progress.png", "image-03-compile-progress.png"],
        ["test/visual-baselines/05e-workflow-recovery-cards.png", "image-04-recovery-cards.png"],
        ["test/visual-baselines/05f-workflow-revision-diff.png", "image-05-revision-diff.png"],
        ["test/visual-baselines/05g-workflow-schedule-targeting.png", "image-06-schedule-targeting.png"],
        ["test/visual-baselines/04-git-summary.png", "image-07-git-summary.png"],
        ["test/visual-baselines/05-plugin-import-candidate.png", "image-08-plugin-import.png"],
        ["test/visual-baselines/01a-project-board.png", "image-09-project-board.png"],
        ["test/visual-baselines/08-browser-picker-active.png", "image-10-browser-picker.png"],
      ];
      for (const [source, target] of fixtures) {
        await cp(join(process.cwd(), source), join(downloadsDir, target), { force: true });
      }
      await writeFile(join(downloadsDir, "zz-not-an-image.txt"), "This fixture should not be visually analyzed.\n", "utf8");
      await writeFile(join(downloadsDir, "zz-corrupt-photo.jpg"), "not a valid image fixture\n", "utf8");
      await writeFile(join(downloadsDir, ".hidden-camera-roll.png"), tinyPng());
      await writeFile(join(downloadsDir, "credentials-photo.png"), tinyPng());
    },
    expect: {
      minModelCalls: 1,
      minOutputSignals: 1,
      minCheckpoints: 1,
      minFinalOutputChars: 320,
      requiredToolMessages: ["local_directory_list", "ambient_visual_analyze"],
      exactToolMessageCounts: { local_directory_list: 1, ambient_visual_analyze: 10 },
      forbiddenToolMessages: [
        "local_file_read",
        "file_read",
        "file_write",
        "bash",
        "browser_search",
        "browser_nav",
        "browser_content",
        "google_workspace_call",
        "ambient_visual_minicpm_setup",
      ],
      forbiddenToolFamilies: ["browser_"],
      requiredFinalOutputTerms: ["10", "visual"],
      requiredFinalOutputAnyTerms: [
        ["workflow", "diagram", "compile", "recovery", "schedule"],
        ["git", "branch", "review"],
        ["plugin", "import", "package"],
        ["project", "board", "planning"],
        ["browser", "picker", "profile"],
        ["coverage", "analyzed", "all 10"],
      ],
    },
    sourceExpect: {
      requiredTerms: ["tools.local_directory_list", "tools.ambient_visual_analyze", "image_description", "allowExternalMediaPaths", "readPath(outputs["],
      forbiddenTerms: ["tools.local_file_read", "tools.file_read", "tools.file_write", "tools.bash", "tools.browser_", "google_workspace_call", "tools.ambient_visual_minicpm_setup"],
    },
  },
  "gmail-300-readonly-categorization": {
    title: "Gmail 300 Read-only Categorization Workflow UI Dogfood",
    resumeTimeoutMs: 1_800_000,
    request: [
      "Create a read-only Workflow Agent for Project 3: read the latest 300 Gmail messages and categorize them into up to 7 useful read-only buckets.",
      "Use the connected default Gmail account if one is available. If the account has fewer than 300 readable messages, continue with honest partial coverage and state the observed count.",
      "Use connector.paginate with connectorId google.gmail and operation search, pageSize/maxResults 100, maxPages 3, maxItems 300, and dedupeKeyPath threadId.",
      "Use connector.map with connectorId google.gmail and operation readThread over the paginated search items, maxItems 300, maxConcurrency no more than 4, and format metadata unless full bodies are absolutely needed.",
      "Use collection.map to compact each thread to only message/thread ids, internal dates, labels, snippets, subjects/senders when present, and minimal evidence fields before model calls.",
      "Use collection.chunk with chunks of about 25 records, model.map over chunks, and model.reduce to merge results into no more than 7 final categories.",
      "Do not use Google Workspace raw tools, browser tools, file tools, shell/bash, Gmail draft/send/update/delete operations, attachment reads, or any write/mutation tool.",
      "Checkpoint the page/detail/compact coverage metadata and final report. The final output must include category names, counts, example message or thread metadata, evidence provenance by message/thread id or date, coverage/skipped/partial notes, and an explicit read-only/no-mutation statement.",
    ].join(" "),
    answerPreference: ["gmail", "default", "read only", "300", "7", "metadata", "categories"],
    runtimeChoicePreference: ["read only", "continue", "proceed", "approve", "metadata", "default"],
    runtimeAnswer: "Use the connected default Gmail account, keep the workflow read-only, and continue with honest partial coverage if fewer than 300 messages are available.",
    expect: {
      minModelCalls: 1,
      minOutputSignals: 1,
      minCheckpoints: 1,
      minFinalOutputChars: 320,
      minConnectorEnds: 2,
      requiredConnectorMessages: ["google.gmail.search", "google.gmail.readThread"],
      minConnectorMessageCounts: { "google.gmail.search": 1, "google.gmail.readThread": 1 },
      maxConnectorMessageCounts: { "google.gmail.search": 3, "google.gmail.readThread": 300 },
      forbiddenConnectorMessages: [
        "google.gmail.readAttachment",
        "google.gmail.createDraft",
        "google.gmail.updateDraft",
        "google.gmail.deleteDraft",
        "google.gmail.sendDraft",
      ],
      forbiddenConnectorFamilies: ["google.calendar.", "google.drive."],
      forbiddenToolMessages: [
        "local_directory_list",
        "local_file_read",
        "file_read",
        "file_write",
        "bash",
        "browser_search",
        "browser_nav",
        "browser_content",
        "google_workspace_call",
      ],
      forbiddenToolFamilies: ["browser_"],
      requiredFinalOutputTerms: ["read-only"],
      requiredFinalOutputAnyTerms: [
        ["category", "bucket"],
        ["count", "messages", "threads"],
        ["example", "evidence", "provenance"],
        ["partial", "coverage", "skipped", "observed"],
      ],
    },
    sourceExpect: {
      requiredTerms: [
        "workflow.paginateConnector",
        'connectorId: "google.gmail"',
        'operation: "search"',
        '"maxItems": 300',
        '"maxPages": 3',
        '"pageSize": 100',
        '"dedupeKeyPath": "threadId"',
        'operation: "readThread"',
        "workflow.mapCollection",
        "workflow.chunkCollection",
        "workflow.mapModel",
        "workflow.reduceModel",
      ],
      requiredAnyTerms: [
        ['"maxConcurrency": 1', '"maxConcurrency": 2', '"maxConcurrency": 3', '"maxConcurrency": 4', "maxConcurrency: 1", "maxConcurrency: 2", "maxConcurrency: 3", "maxConcurrency: 4"],
      ],
      forbiddenTerms: [
        "tools.local_directory_list",
        "tools.local_file_read",
        "tools.file_read",
        "tools.file_write",
        "tools.bash",
        "tools.browser_",
        "google_workspace_call",
        'operation: "readAttachment"',
        'operation: "createDraft"',
        'operation: "updateDraft"',
        'operation: "deleteDraft"',
        'operation: "sendDraft"',
        'connectorId: "google.calendar"',
        'connectorId: "google.drive"',
      ],
      manifest: {
        mutationPolicy: "read_only",
        forbiddenTools: ["google_workspace_call", "file_write", "bash", "browser_search", "browser_nav", "browser_content"],
        connectors: [
          {
            connectorId: "google.gmail",
            requiredScopes: ["gmail.readonly"],
            forbiddenScopes: ["gmail.compose", "gmail.send"],
            requiredOperations: ["search", "readThread"],
            forbiddenOperations: ["readAttachment", "createDraft", "updateDraft", "deleteDraft", "sendDraft"],
          },
        ],
      },
      validationReport: {
        status: "passed",
        requiredValidatorIds: [
          "workflow.program.static",
          "workflow.program.static_budget",
          "workflow.connector.operation_policy",
          "workflow.output.schema",
          "workflow.program.dry_run",
        ],
        forbidFailedValidators: true,
        mutationPolicy: "read_only",
        maxConnectorCalls: 1000,
        maxConnectorWriteOperationCount: 0,
        requiredConnectorOperations: ["google.gmail.search", "google.gmail.readThread"],
        forbiddenConnectorOperations: [
          "google.gmail.readAttachment",
          "google.gmail.createDraft",
          "google.gmail.updateDraft",
          "google.gmail.deleteDraft",
          "google.gmail.sendDraft",
        ],
      },
    },
  },
  "gmail-20-metadata-readonly-validation": {
    title: "Gmail 20 Metadata Read-only Validator Workflow UI Dogfood",
    request: [
      "Create a small read-only Workflow Agent for Project 3: inspect the latest 20 Gmail messages using metadata only and summarize the visible themes.",
      "Use the connected default Gmail account if one is available. If fewer than 20 readable messages are available, continue with honest partial coverage.",
      "Use connector.paginate with connectorId google.gmail and operation search, pageSize/maxResults 20, maxPages 1, maxItems 20, and dedupeKeyPath threadId.",
      "Do not use google.gmail.readThread, readAttachment, drafts, sends, labels mutation, browser tools, file tools, shell/bash, or Google Workspace raw tools in this workflow.",
      "Use collection.map to keep only metadata fields such as message id, thread id, snippet, internalDate, label ids, and lightweight header metadata if present, then use one model.call for a compact summary.",
      "Checkpoint the metadata coverage and final report. The final output must say metadata-only and read-only, include theme names, counts, example message/thread metadata, coverage/skipped/partial notes, and no write-operation claims.",
    ].join(" "),
    answerPreference: ["gmail", "default", "read only", "metadata", "20", "themes"],
    runtimeChoicePreference: ["metadata", "read only", "continue", "proceed", "default"],
    runtimeAnswer: "Use the connected default Gmail account, keep this metadata-only and read-only, and continue with partial coverage if fewer than 20 messages are available.",
    expect: {
      minModelCalls: 1,
      maxModelCalls: 3,
      minOutputSignals: 1,
      minCheckpoints: 1,
      minFinalOutputChars: 220,
      minConnectorEnds: 1,
      maxConnectorEnds: 1,
      requiredConnectorMessages: ["google.gmail.search"],
      exactConnectorMessageCounts: { "google.gmail.readThread": 0 },
      maxConnectorMessageCounts: { "google.gmail.search": 1, "google.gmail.readThread": 0 },
      requiredEvidenceContracts: ["gmail.metadata_search_only", "read_only.no_writes"],
      forbiddenConnectorMessages: [
        "google.gmail.readThread",
        "google.gmail.readAttachment",
        "google.gmail.createDraft",
        "google.gmail.updateDraft",
        "google.gmail.deleteDraft",
        "google.gmail.sendDraft",
      ],
      forbiddenConnectorFamilies: ["google.calendar.", "google.drive."],
      forbiddenToolMessages: [
        "local_directory_list",
        "local_file_read",
        "file_read",
        "file_write",
        "bash",
        "browser_search",
        "browser_nav",
        "browser_content",
        "google_workspace_call",
      ],
      forbiddenToolFamilies: ["browser_"],
      requiredFinalOutputAnyTerms: [
        ["theme", "category", "bucket"],
        ["count", "messages", "threads", "message ids", "thread ids", "message/thread"],
        ["metadata", "snippet", "thread"],
        ["partial", "coverage", "skipped", "observed"],
      ],
    },
    sourceExpect: {
      requiredTerms: [
        "workflow.paginateConnector",
        'connectorId: "google.gmail"',
        'operation: "search"',
        '"maxItems": 20',
        '"maxPages": 1',
        '"dedupeKeyPath": "threadId"',
        "workflow.mapCollection",
        "ambient.call",
      ],
      requiredAnyTerms: [['"pageSize": 20', '"maxResults": 20']],
      forbiddenTerms: [
        "tools.local_directory_list",
        "tools.local_file_read",
        "tools.file_read",
        "tools.file_write",
        "tools.bash",
        "tools.browser_",
        "google_workspace_call",
        'operation: "readThread"',
        'operation: "readThread"',
        'operation: "readAttachment"',
        'operation: "createDraft"',
        'operation: "updateDraft"',
        'operation: "deleteDraft"',
        'operation: "sendDraft"',
        'connectorId: "google.calendar"',
        'connectorId: "google.drive"',
      ],
      manifest: {
        mutationPolicy: "read_only",
        forbiddenTools: ["google_workspace_call", "file_write", "bash", "browser_search", "browser_nav", "browser_content"],
        connectors: [
          {
            connectorId: "google.gmail",
            requiredScopes: ["gmail.readonly"],
            forbiddenScopes: ["gmail.compose", "gmail.send"],
            requiredOperations: ["search"],
            forbiddenOperations: ["readThread", "readAttachment", "createDraft", "updateDraft", "deleteDraft", "sendDraft"],
          },
        ],
      },
      validationReport: {
        status: "passed",
        requiredValidatorIds: [
          "workflow.program.static",
          "workflow.program.static_budget",
          "workflow.connector.operation_policy",
          "workflow.output.schema",
          "workflow.program.dry_run",
        ],
        forbidFailedValidators: true,
        mutationPolicy: "read_only",
        maxConnectorCalls: 1,
        maxConnectorWriteOperationCount: 0,
        requiredConnectorOperations: ["google.gmail.search"],
        forbiddenConnectorOperations: [
          "google.gmail.readThread",
          "google.gmail.readAttachment",
          "google.gmail.createDraft",
          "google.gmail.updateDraft",
          "google.gmail.deleteDraft",
          "google.gmail.sendDraft",
        ],
      },
      promptAssembly: planDslCompilerDogfood
        ? {
            requiredModuleIds: ["core-workflow-plan-dsl-semantics", "workflow-plan-dsl-selected-capabilities"],
            forbiddenModuleFragments: ["browser", "current_web", "movie-night", "visual-analysis", "ambient-cli", "ambient_cli", "google-workspace"],
          }
        : {
            requiredModuleIds: ["recipe-large_collection_summarization"],
            forbiddenModuleIds: ["policy-recipe-gmail-metadata-first-detail-gate", "recipe-metadata_first_personal_data_review"],
            forbiddenModuleFragments: ["browser", "current_web", "movie-night", "visual-analysis", "ambient-cli", "ambient_cli", "google-workspace"],
          },
      compileContext: planDslCompilerDogfood
        ? {
            maxSelectedRecipeCount: 2,
          }
        : {
            requiredRecipeIds: ["large_collection_summarization"],
            requiredRejectedRecipeIds: [
              "metadata_first_personal_data_review",
              "current_web_research",
              "movie_night_current_showtimes",
              "visual_batch_classification",
              "staged_document_export",
            ],
            requiredPolicyImplicationIds: ["recipe.large_collection_summarization.budget"],
            maxSelectedRecipeCount: 1,
          },
    },
    abstractionContract: {
      id: "connector-metadata-first-gmail-readonly",
      contractType: "connector-metadata-first",
      proves: [
        "selected Gmail connector descriptors drive connector.paginate without raw Google Workspace fallbacks",
        "metadata-only Gmail summarization stays on the high-level Plan DSL or large-collection metadata path while broad readThread fan-out remains forbidden",
        "connector operation policy restricts the manifest to metadata-safe read-only search",
        "validation reports expose connector operation and write-operation budgets",
      ],
      promptAssembly: planDslCompilerDogfood
        ? {
            requiredModuleIds: ["core-workflow-plan-dsl-semantics", "workflow-plan-dsl-selected-capabilities"],
            forbiddenModuleFragments: ["browser", "current_web", "movie-night", "visual-analysis", "ambient-cli", "ambient_cli", "google-workspace"],
          }
        : {
            requiredModuleIds: ["recipe-large_collection_summarization"],
            forbiddenModuleIds: ["policy-recipe-gmail-metadata-first-detail-gate", "recipe-metadata_first_personal_data_review"],
            forbiddenModuleFragments: ["browser", "current_web", "movie-night", "visual-analysis", "ambient-cli", "ambient_cli", "google-workspace"],
          },
      compileContext: planDslCompilerDogfood
        ? {
            maxSelectedRecipeCount: 2,
          }
        : {
            requiredRecipeIds: ["large_collection_summarization"],
            requiredRejectedRecipeIds: [
              "metadata_first_personal_data_review",
              "current_web_research",
              "movie_night_current_showtimes",
              "visual_batch_classification",
              "staged_document_export",
            ],
            requiredPolicyImplicationIds: ["recipe.large_collection_summarization.budget"],
            maxSelectedRecipeCount: 1,
          },
      manifest: {
        mutationPolicy: "read_only",
        connectors: [
          {
            connectorId: "google.gmail",
            requiredScopes: ["gmail.readonly"],
            forbiddenScopes: ["gmail.compose", "gmail.send"],
            requiredOperations: ["search"],
            forbiddenOperations: ["readThread", "readAttachment", "createDraft", "updateDraft", "deleteDraft", "sendDraft"],
          },
        ],
      },
      validationReport: {
        requiredValidatorIds: [
          "workflow.program.static",
          "workflow.program.static_budget",
          "workflow.connector.operation_policy",
          "workflow.output.schema",
          "workflow.program.dry_run",
        ],
        mutationPolicy: "read_only",
        maxConnectorCalls: 1,
        maxConnectorWriteOperationCount: 0,
        requiredConnectorOperations: ["google.gmail.search"],
        forbiddenConnectorOperations: [
          "google.gmail.readThread",
          "google.gmail.readAttachment",
          "google.gmail.createDraft",
          "google.gmail.updateDraft",
          "google.gmail.deleteDraft",
          "google.gmail.sendDraft",
        ],
      },
      forbiddenPromptAssemblyMetadataFragments: ["gmail-20-metadata-readonly-validation"],
    },
  },
  "gmail-1000-metadata-first-gate": {
    title: "Gmail 1,000 Metadata-first Gate Workflow UI Dogfood",
    request: [
      "Create a read-only Workflow Agent for Project 4: categorize the latest 1,000 Gmail messages into up to 7 useful buckets using a metadata-first plan.",
      "Use the connected default Gmail account if one is available. If fewer than 1,000 readable messages are available, continue with honest partial coverage and state the observed count.",
      "Use connector.paginate with connectorId google.gmail and operation search, pageSize/maxResults 100, maxPages 10, maxItems 1000, and dedupeKeyPath threadId.",
      "Do not use google.gmail.readThread, readAttachment, drafts, sends, labels mutation, browser tools, file tools, shell/bash, or Google Workspace raw tools in this workflow.",
      "Use collection.map to keep only metadata fields such as message id, thread id, snippet, internalDate, label ids, and lightweight header metadata if present.",
      "Use collection.chunk with chunks of about 25 records, model.map over chunks, and model.reduce with strategy tree to merge the chunk results into no more than 7 final categories.",
      "After the metadata synthesis, include a review.input gate that asks whether a future bounded full-body follow-up should be planned for low-confidence examples. This workflow itself must remain metadata-only.",
      "Checkpoint page, metadata, chunk, review, and final coverage. The final output must say metadata-only and read-only, include category names, counts, example message/thread metadata, evidence provenance by message/thread id or date, coverage/skipped/partial notes, and a bounded follow-up detail-read candidate list if metadata was insufficient.",
    ].join(" "),
    answerPreference: ["gmail", "default", "read only", "metadata", "1000", "7", "review"],
    runtimeChoicePreference: ["metadata", "do not read", "follow-up", "no body", "continue", "proceed", "default"],
    runtimeAnswer: "Keep this workflow metadata-only and read-only. Do not read full Gmail bodies in this run; include only a bounded follow-up detail-read candidate list if metadata is insufficient.",
    expect: {
      minModelCalls: 1,
      maxModelCalls: 50,
      minRuntimeInputs: 1,
      minRuntimeInputResponses: 1,
      minOutputSignals: 1,
      minCheckpoints: 1,
      minFinalOutputChars: 360,
      minConnectorEnds: 1,
      maxConnectorEnds: 10,
      requiredConnectorMessages: ["google.gmail.search"],
      minConnectorMessageCounts: { "google.gmail.search": 1 },
      maxConnectorMessageCounts: { "google.gmail.search": 10, "google.gmail.readThread": 0 },
      exactConnectorMessageCounts: { "google.gmail.readThread": 0 },
      forbiddenConnectorMessages: [
        "google.gmail.readThread",
        "google.gmail.readAttachment",
        "google.gmail.createDraft",
        "google.gmail.updateDraft",
        "google.gmail.deleteDraft",
        "google.gmail.sendDraft",
      ],
      forbiddenConnectorFamilies: ["google.calendar.", "google.drive."],
      forbiddenToolMessages: [
        "local_directory_list",
        "local_file_read",
        "file_read",
        "file_write",
        "bash",
        "browser_search",
        "browser_nav",
        "browser_content",
        "google_workspace_call",
      ],
      forbiddenToolFamilies: ["browser_"],
      requiredFinalOutputTerms: ["metadata-only", "read-only"],
      requiredFinalOutputAnyTerms: [
        ["category", "bucket"],
        ["count", "messages", "threads"],
        ["example", "evidence", "provenance"],
        ["partial", "coverage", "skipped", "observed"],
        ["follow-up", "detail-read", "approval", "review"],
      ],
    },
    sourceExpect: {
      requiredTerms: [
        "workflow.paginateConnector",
        'connectorId: "google.gmail"',
        'operation: "search"',
        '"maxItems": 1000',
        '"maxPages": 10',
        '"pageSize": 100',
        '"dedupeKeyPath": "threadId"',
        "workflow.mapCollection",
        "workflow.chunkCollection",
        "workflow.mapModel",
        "workflow.reduceModel",
        '"strategy": "tree"',
        "workflow.askUser",
      ],
      forbiddenTerms: [
        "tools.local_directory_list",
        "tools.local_file_read",
        "tools.file_read",
        "tools.file_write",
        "tools.bash",
        "tools.browser_",
        "google_workspace_call",
        'operation: "readThread"',
        'operation: "readThread"',
        'operation: "readAttachment"',
        'operation: "createDraft"',
        'operation: "updateDraft"',
        'operation: "deleteDraft"',
        'operation: "sendDraft"',
        'connectorId: "google.calendar"',
        'connectorId: "google.drive"',
      ],
      manifest: {
        mutationPolicy: "read_only",
        forbiddenTools: ["google_workspace_call", "file_write", "bash", "browser_search", "browser_nav", "browser_content"],
        connectors: [
          {
            connectorId: "google.gmail",
            requiredScopes: ["gmail.readonly"],
            forbiddenScopes: ["gmail.compose", "gmail.send"],
            requiredOperations: ["search"],
            forbiddenOperations: ["readThread", "readAttachment", "createDraft", "updateDraft", "deleteDraft", "sendDraft"],
          },
        ],
      },
      validationReport: {
        status: "passed",
        requiredValidatorIds: [
          "workflow.program.static",
          "workflow.program.static_budget",
          "workflow.connector.operation_policy",
          "workflow.output.schema",
          "workflow.program.dry_run",
        ],
        forbidFailedValidators: true,
        mutationPolicy: "read_only",
        maxConnectorCalls: 1000,
        maxConnectorWriteOperationCount: 0,
        requiredConnectorOperations: ["google.gmail.search"],
        forbiddenConnectorOperations: [
          "google.gmail.readThread",
          "google.gmail.readAttachment",
          "google.gmail.createDraft",
          "google.gmail.updateDraft",
          "google.gmail.deleteDraft",
          "google.gmail.sendDraft",
        ],
      },
      promptAssembly: {
        requiredModuleIds: ["recipe-metadata_first_personal_data_review", "recipe-large_collection_summarization"],
        forbiddenModuleIds: ["policy-recipe-gmail-metadata-first-detail-gate"],
        forbiddenModuleFragments: ["browser", "current_web", "movie-night", "visual-analysis", "ambient-cli", "ambient_cli", "google-workspace"],
      },
      compileContext: {
        requiredRecipeIds: ["metadata_first_personal_data_review", "large_collection_summarization"],
        requiredRejectedRecipeIds: ["current_web_research", "movie_night_current_showtimes", "visual_batch_classification", "staged_document_export"],
        requiredPolicyImplicationIds: [
          "recipe.metadata_first_personal_data_review.privacy_gate",
          "recipe.large_collection_summarization.budget",
        ],
        minSelectedRecipeCount: 2,
      },
    },
    abstractionContract: {
      id: "typed-gmail-metadata-first-detail-gate",
      contractType: "typed-personal-data-recipe",
      proves: [
        "large Gmail categorization uses the metadata_first_personal_data_review recipe instead of a scenario-specific policy prompt",
        "Gmail search remains metadata-first and read-only with review-gated detail reads",
        "unrelated browser, current-web, movie-night, visual, Ambient CLI, Google Workspace, and file-output recipes stay rejected",
      ],
      promptAssembly: {
        requiredModuleIds: ["recipe-metadata_first_personal_data_review", "recipe-large_collection_summarization"],
        forbiddenModuleIds: ["policy-recipe-gmail-metadata-first-detail-gate"],
        forbiddenModuleFragments: ["browser", "current_web", "movie-night", "visual-analysis", "ambient-cli", "ambient_cli", "google-workspace"],
      },
      compileContext: {
        requiredRecipeIds: ["metadata_first_personal_data_review", "large_collection_summarization"],
        requiredRejectedRecipeIds: ["current_web_research", "movie_night_current_showtimes", "visual_batch_classification", "staged_document_export"],
        requiredPolicyImplicationIds: [
          "recipe.metadata_first_personal_data_review.privacy_gate",
          "recipe.large_collection_summarization.budget",
        ],
        minSelectedRecipeCount: 2,
      },
      manifest: {
        mutationPolicy: "read_only",
        forbiddenTools: ["google_workspace_call", "file_write", "bash", "browser_search", "browser_nav", "browser_content"],
        connectors: [
          {
            connectorId: "google.gmail",
            requiredScopes: ["gmail.readonly"],
            forbiddenScopes: ["gmail.compose", "gmail.send"],
            requiredOperations: ["search"],
            forbiddenOperations: ["readThread", "readAttachment", "createDraft", "updateDraft", "deleteDraft", "sendDraft"],
          },
        ],
      },
    },
  },
  "google-transcript-action-items": {
    title: "Google Meeting Transcript Action Items Workflow UI Dogfood",
    request: [
      "Create a read-only Workflow Agent for Project 5: pull Google meeting transcripts from the last two weeks and extract action items with owners and due dates.",
      "Use the connected default Google account if one is available. Use the explicit two-week window from 2026-05-02T00:00:00-07:00 through 2026-05-16T23:59:59-07:00 with timeZone America/Phoenix.",
      "For this tiny smoke test, use connector.paginate with connectorId google.calendar and operation listEvents, pageSize/maxResults 20, maxPages 1, maxItems 20, singleEvents true, orderBy startTime, and fields nextPageToken,items(id,summary,start,end,htmlLink) for compact event provenance.",
      "Use connector.paginate with connectorId google.drive and operation search, pageSize 50, maxPages 2, maxItems 100, looking for transcript-like Google Docs with query filtering mimeType = 'application/vnd.google-apps.document', and preserving file id/name/mimeType/modifiedTime/webViewLink metadata.",
      "This is a tiny live smoke test, so use collection.map to select at most 2 candidate transcript files, then connector.map with connectorId google.drive and operation readFile over those candidates with maxItems 2, maxConcurrency no more than 2, fileId from each mapped item id, exportMimeType text/plain, and maxContentChars 1000.",
      "Because transcript files may be long, call long_context_process with taskType extraction, maxModelCalls no more than 8, and maxOutputChars around 4000 over the Drive readFile results plus compact calendar events before the final model call.",
      "The final model call must consume the long_context_process response and source counts only, not raw transcript file arrays or full calendar event arrays.",
      "Do not use Google Workspace raw tools, browser tools, file tools, shell/bash, Drive write/share/copy/trash/update/create operations, Calendar create/update/delete operations, or any mutation tool.",
      "Checkpoint calendar coverage, Drive candidate coverage, transcript read coverage, long-context routing metadata, and the final report. The final output must include action items, owners, due dates or unknowns, decisions, unresolved questions, source event/file provenance, skipped/missing transcript coverage, and an explicit read-only/no-mutation statement.",
    ].join(" "),
    answerPreference: ["google", "calendar", "drive", "default", "read only", "last two weeks", "action items", "transcripts"],
    runtimeChoicePreference: ["read only", "continue", "proceed", "approve", "default", "unknown due dates"],
    runtimeAnswer: "Use the connected default Google account, keep all Google operations read-only, preserve source provenance, and continue with honest skipped/missing transcript coverage.",
    expect: {
      minModelCalls: 1,
      maxModelCalls: 3,
      minOutputSignals: 1,
      minCheckpoints: 1,
      minFinalOutputChars: 420,
      minConnectorEnds: 3,
      maxConnectorEnds: 7,
      requiredToolMessages: ["long_context_process"],
      exactToolMessageCounts: { long_context_process: 1 },
      requiredConnectorMessages: ["google.calendar.listEvents", "google.drive.search", "google.drive.readFile"],
      minConnectorMessageCounts: { "google.calendar.listEvents": 1, "google.drive.search": 1, "google.drive.readFile": 1 },
      maxConnectorMessageCounts: { "google.calendar.listEvents": 2, "google.drive.search": 3, "google.drive.readFile": 2 },
      forbiddenConnectorMessages: [
        "google.calendar.createEvent",
        "google.calendar.updateEvent",
        "google.calendar.deleteEvent",
        "google.drive.createFile",
        "google.drive.createFolder",
        "google.drive.updateFile",
        "google.drive.copyFile",
        "google.drive.trashFile",
        "google.drive.createPermission",
        "google.drive.updatePermission",
        "google.drive.deletePermission",
      ],
      forbiddenConnectorFamilies: ["google.gmail."],
      forbiddenToolMessages: [
        "local_directory_list",
        "local_file_read",
        "file_read",
        "file_write",
        "bash",
        "browser_search",
        "browser_nav",
        "browser_content",
        "google_workspace_call",
      ],
      forbiddenToolFamilies: ["browser_"],
      requiredFinalOutputTerms: [],
      requiredFinalOutputAnyTerms: [
        ["read-only", "read only", "read only statement"],
        ["action item", "action items"],
        ["decision", "decisions"],
        ["unresolved", "question"],
        ["source", "provenance", "event", "file"],
        ["skipped", "missing", "coverage", "partial"],
      ],
    },
    sourceExpect: {
      requiredTerms: [
        "workflow.paginateConnector",
        'connectorId: "google.calendar"',
        'connectorId: "google.drive"',
        'operation: "listEvents"',
        'operation: "search"',
        '"operation": "readFile"',
        '"timeMin": "2026-05-02T00:00:00-07:00"',
        '"timeMax": "2026-05-16T23:59:59-07:00"',
        '"timeZone": "America/Phoenix"',
        '"maxItems": 100',
        '"maxPages": 2',
        '"pageSize": 50',
        '"maxItems": 2',
        '"maxContentChars": 1000',
        '"maxModelCalls": 8',
        '"maxOutputChars": 4000',
        "workflow.mapCollection",
        "workflow.batch",
        "tools.long_context_process",
        "ambient.call",
      ],
      requiredAnyTerms: [
        ['"maxConcurrency": 2', "maxConcurrency: 2"],
        ['"exportMimeType": "text/plain"', "exportMimeType: \"text/plain\""],
      ],
      forbiddenTerms: [
        "tools.local_directory_list",
        "tools.local_file_read",
        "tools.file_read",
        "tools.file_write",
        "tools.bash",
        "tools.browser_",
        "google_workspace_call",
        'connectorId: "google.gmail"',
        '"operation": "createEvent"',
        '"operation": "updateEvent"',
        '"operation": "deleteEvent"',
        '"operation": "createFile"',
        '"operation": "createFolder"',
        '"operation": "updateFile"',
        '"operation": "copyFile"',
        '"operation": "trashFile"',
        '"operation": "createPermission"',
        '"operation": "updatePermission"',
        '"operation": "deletePermission"',
      ],
      manifest: {
        mutationPolicy: "read_only",
        requiredTools: ["long_context_process"],
        forbiddenTools: ["google_workspace_call", "file_write", "bash", "browser_search", "browser_nav", "browser_content"],
        connectors: [
          {
            connectorId: "google.calendar",
            requiredScopes: ["calendar.readonly"],
            forbiddenScopes: ["calendar.events"],
            requiredOperations: ["listEvents"],
            forbiddenOperations: ["createEvent", "updateEvent", "deleteEvent"],
          },
          {
            connectorId: "google.drive",
            requiredScopes: ["drive.readonly"],
            forbiddenScopes: ["drive.file"],
            requiredOperations: ["search", "readFile"],
            forbiddenOperations: [
              "createFile",
              "createFolder",
              "updateFile",
              "copyFile",
              "trashFile",
              "createPermission",
              "updatePermission",
              "deletePermission",
            ],
          },
        ],
      },
    },
  },
  "scottsdale-real-estate-100-source-pdf": {
    title: "Scottsdale Real Estate 100-source PDF Workflow UI Dogfood",
    permissionMode: "full-access",
    maxRetainedRunEvents: 650,
    request: [
      "Create a Workflow Agent for Project 6: build a Scottsdale, Arizona real estate report from 100 public web source candidates and render a PDF in my Documents folder.",
      "Use current web evidence; do not rely on model knowledge for current market facts. Include the run date 2026-05-17 and timeZone America/Phoenix in source extraction and synthesis inputs.",
      "Collect exactly 100 public source candidates using browser_search through tool.paginate with exactly 10 pageQueries, pageSize 10, maxItems 100, maxPages 10, itemsPath root array, queryInputPath query, pageSizeInputPath maxResults, and dedupeKeyPath url.",
      "Search angles must cover market trends, inventory, prices, neighborhoods, migration, mortgage rates, zoning/development, short-term rental rules, schools/taxes, and comparable nearby cities.",
      "After source collection, use collection.dedupe with keyPath url and strategy url_canonical, then collection.map to keep title, url, snippet, date or freshness, and rank.",
      "Use collection.chunk into 10 chunks of 10, model.map over chunks for claims, statistics, citations, source dates, and source-quality extraction, then model.reduce with strategy tree, maxFanIn 5, maxLevels 2 for final synthesis.",
      "Render a PDF report with document.render format pdf and path Documents/scottsdale-real-estate-research-report.pdf, then stage a file_write mutation for that rendered PDF. Do not write until the staged mutation is approved.",
      "Do not use Google Workspace tools/connectors, local file reads, shell/bash, browser_nav, browser_content, or any external/cloud mutation. The only allowed write is the staged local file_write for the rendered PDF.",
      "The final output must include the PDF artifact/path, source candidate count, unique source count, citation/source URLs or provenance, source freshness/date caveats, skipped/partial coverage if fewer than 100 candidates are usable, and an explicit staged-write approval/no-unintended-writes statement.",
    ].join(" "),
    answerPreference: ["scottsdale", "real estate", "100", "pdf", "documents", "current", "sources"],
    runtimeChoicePreference: ["approve", "approved", "continue", "proceed", "looks good", "pdf", "documents"],
    runtimeAnswer: "Approve the staged local PDF write and keep the final report source-backed, with freshness and coverage notes.",
    expect: {
      minModelCalls: 1,
      maxModelCalls: 20,
      minOutputSignals: 1,
      minCheckpoints: 1,
      minFinalOutputChars: 520,
      minApprovalRequests: 1,
      minApprovalResponses: 1,
      minDocumentRenderEnds: 1,
      requiredDocumentRenderFormats: ["pdf"],
      requiredToolMessages: ["browser_search", "file_write"],
      exactToolMessageCounts: { browser_search: 10, file_write: 1 },
      allowedWriteToolMessages: ["file_write"],
      forbiddenToolMessages: [
        "local_directory_list",
        "local_file_read",
        "file_read",
        "bash",
        "browser_nav",
        "browser_content",
        "google_workspace_call",
      ],
      forbiddenToolFamilies: ["google."],
      requiredFinalOutputTerms: ["Scottsdale", "PDF"],
      requiredFinalOutputAnyTerms: [
        ["real estate", "housing", "market"],
        ["source", "sources", "citation", "citations", "provenance"],
        ["current", "freshness", "date", "2026"],
        ["coverage", "candidate", "unique", "partial", "skipped"],
        ["approved", "staged", "write", "no unintended"],
        ["Documents/scottsdale-real-estate-research-report.pdf", "scottsdale-real-estate-research-report.pdf"],
      ],
    },
    sourceExpect: {
      requiredTerms: [
        "workflow.paginateTool",
        "tools.browser_search",
        '"itemsPath": ""',
        '"queryInputPath": "query"',
        '"pageSizeInputPath": "maxResults"',
        '"maxItems": 100',
        '"maxPages": 10',
        "short term rental",
        "workflow.dedupeCollection",
        '"strategy": "url_canonical"',
        "workflow.mapCollection",
        "workflow.chunkCollection",
        "workflow.mapModel",
        "workflow.reduceModel",
        '"strategy": "tree"',
        '"maxFanIn": 5',
        "workflow.renderDocument",
        '"format": "pdf"',
        "workflow.stageMutation",
        "tools.file_write",
        "Documents/scottsdale-real-estate-research-report.pdf",
        "2026-05-17",
        "America/Phoenix",
      ],
      requiredAnyTerms: [
        ["Scottsdale real estate market", "Scottsdale AZ real estate market"],
      ],
      forbiddenTerms: [
        "tools.local_directory_list",
        "tools.local_file_read",
        "tools.file_read",
        "tools.bash",
        "tools.browser_nav",
        "tools.browser_content",
        "google_workspace_call",
        'connectorId: "google.gmail"',
        'connectorId: "google.calendar"',
        'connectorId: "google.drive"',
      ],
      manifest: {
        mutationPolicy: "staged_until_approved",
        requiredTools: ["browser_search", "file_write"],
        forbiddenTools: ["google_workspace_call", "file_read", "bash", "browser_nav", "browser_content"],
      },
    },
  },
  "movie-tonight-recommendation": {
    title: "Movie Tonight Current-data Recommendation Workflow UI Dogfood",
    permissionMode: "full-access",
    request: [
      "Create a read-only Workflow Agent for Project 7: recommend whether a couple in Scottsdale, Arizona should go to a movie tonight.",
      "Use current public web evidence; do not rely on model knowledge for currently playing movies, showtimes, reviews, ratings, runtime, venue details, parking, or travel friction. Include the run date Sunday, 2026-05-17 and timeZone America/Phoenix in source extraction and synthesis inputs.",
      "Use browser_search through tool.paginate with exactly 4 pageQueries, pageSize 10, maxItems 40, maxPages 4, itemsPath root array, queryInputPath query, pageSizeInputPath maxResults, and dedupeKeyPath url.",
      "The four pageQueries must cover tonight's Scottsdale showtimes/currently playing movies, reviews and ratings signals, runtime/genre/content ratings, and theater/parking/dinner/travel friction.",
      "After source collection, use collection.dedupe with keyPath url and strategy url_canonical, then collection.map to keep title, url, snippet, date or freshness, and rank.",
      "Use collection.chunk into 4 chunks of 10, model.map over chunks for candidate movies, showtimes, reviews/ratings, runtime, genre, theater/travel friction, citation URLs, and evidence freshness. Ask one review.input preference question before the final recommendation.",
      "Use model.reduce with strategy tree, maxFanIn 4, maxLevels 1 to produce a go/no-go recommendation with top alternatives, confidence, tradeoffs, freshness caveats, and source URLs.",
      "Do not use Google Workspace tools/connectors, local file reads, shell/bash, browser_nav, browser_content, file_write, document.render, or any mutation. The workflow is read-only.",
      "The final output must include the location Scottsdale, Arizona, distinguish showtime facts from review opinions, include the date/timezone, cite or list source URLs/provenance, label freshness/uncertainty, explain skipped/partial coverage if current showtimes are unavailable, and make a clear recommendation.",
    ].join(" "),
    answerPreference: ["movie", "tonight", "Scottsdale", "current", "showtimes", "reviews", "balanced"],
    runtimeChoicePreference: ["balanced", "date night", "low friction", "reviews", "proceed", "continue", "looks good"],
    runtimeAnswer: "Use a balanced date-night preference: prioritize current showtimes, strong reviews, comfortable runtime, low travel friction, and a clear go/no-go answer.",
    expect: {
      minModelCalls: 1,
      maxModelCalls: 8,
      minOutputSignals: 1,
      minCheckpoints: 1,
      minRuntimeInputs: 1,
      minRuntimeInputResponses: 1,
      minFinalOutputChars: 420,
      requiredToolMessages: ["browser_search"],
      exactToolMessageCounts: { browser_search: 4 },
      forbiddenToolMessages: [
        "local_directory_list",
        "local_file_read",
        "file_read",
        "file_write",
        "bash",
        "browser_nav",
        "browser_content",
        "google_workspace_call",
      ],
      forbiddenToolFamilies: ["google."],
      requiredFinalOutputTerms: ["Scottsdale", "movie"],
      requiredFinalOutputAnyTerms: [
        ["recommend", "recommendation", "go", "no-go"],
        ["showtime", "showtimes", "currently playing"],
        ["review", "reviews", "rating", "ratings"],
        ["source", "sources", "citation", "citations", "provenance", "url", "https://"],
        ["freshness", "current", "date", "2026", "America/Phoenix"],
        ["theater", "parking", "travel", "runtime", "genre"],
        ["partial", "skipped", "unavailable", "uncertainty", "caveat", "coverage gap", "coverage gaps", "missing", "not available", "unconfirmed", "stale"],
      ],
    },
    sourceExpect: {
      requiredTerms: [
        "workflow.paginateTool",
        "tools.browser_search",
        '"itemsPath": ""',
        '"queryInputPath": "query"',
        '"pageSizeInputPath": "maxResults"',
        '"maxItems": 40',
        '"maxPages": 4',
        "workflow.dedupeCollection",
        '"strategy": "url_canonical"',
        "workflow.mapCollection",
        "workflow.chunkCollection",
        "workflow.mapModel",
        "workflow.askUser",
        "workflow.reduceModel",
        '"strategy": "tree"',
        '"maxFanIn": 4',
        "2026-05-17",
        "America/Phoenix",
        "Scottsdale",
      ],
      requiredAnyTerms: [
        ["movie showtimes", "currently playing movies", "showtimes"],
        ["reviews", "ratings"],
        ["parking", "travel friction", "dinner"],
      ],
      forbiddenTerms: [
        "tools.local_directory_list",
        "tools.local_file_read",
        "tools.file_read",
        "tools.file_write",
        "tools.bash",
        "tools.browser_nav",
        "tools.browser_content",
        "workflow.renderDocument",
        "workflow.stageMutation",
        "google_workspace_call",
        'connectorId: "google.gmail"',
        'connectorId: "google.calendar"',
        'connectorId: "google.drive"',
      ],
      manifest: {
        mutationPolicy: "read_only",
        requiredTools: ["browser_search"],
        forbiddenTools: ["google_workspace_call", "file_read", "file_write", "bash", "browser_nav", "browser_content"],
      },
      promptAssembly: {
        requiredModuleIds: ["recipe-current_web_research", "recipe-movie_night_current_showtimes", "recipe-large_collection_summarization"],
        forbiddenModuleIds: ["policy-recipe-movie-night-current-showtimes", "policy-policy-current-data-evidence"],
        forbiddenModuleFragments: ["gmail", "google-workspace", "visual-analysis", "ambient-cli", "ambient_cli"],
      },
      compileContext: {
        requiredRecipeIds: ["current_web_research", "movie_night_current_showtimes", "large_collection_summarization"],
        requiredRejectedRecipeIds: ["metadata_first_personal_data_review", "visual_batch_classification", "staged_document_export"],
        requiredPolicyImplicationIds: [
          "recipe.current_web_research.source_evidence",
          "recipe.movie_night_current_showtimes.preference_freshness_gate",
          "recipe.large_collection_summarization.budget",
        ],
        minSelectedRecipeCount: 3,
        minRejectedRecipeCount: 3,
      },
    },
    abstractionContract: {
      id: "typed-movie-night-current-showtimes",
      contractType: "typed-current-data-recipe",
      proves: [
        "current movie-night showtimes use the movie_night_current_showtimes recipe instead of a scenario-specific policy prompt",
        "the recipe stack preserves current web source evidence and large-collection budgeting",
        "unrelated Gmail, Google Workspace, visual, Ambient CLI, and file-output recipes stay rejected",
      ],
      promptAssembly: {
        requiredModuleIds: ["recipe-current_web_research", "recipe-movie_night_current_showtimes", "recipe-large_collection_summarization"],
        forbiddenModuleIds: ["policy-recipe-movie-night-current-showtimes", "policy-policy-current-data-evidence"],
        forbiddenModuleFragments: ["gmail", "google-workspace", "visual-analysis", "ambient-cli", "ambient_cli"],
      },
      compileContext: {
        requiredRecipeIds: ["current_web_research", "movie_night_current_showtimes", "large_collection_summarization"],
        requiredRejectedRecipeIds: ["metadata_first_personal_data_review", "visual_batch_classification", "staged_document_export"],
        requiredPolicyImplicationIds: [
          "recipe.current_web_research.source_evidence",
          "recipe.movie_night_current_showtimes.preference_freshness_gate",
          "recipe.large_collection_summarization.budget",
        ],
        minSelectedRecipeCount: 3,
        minRejectedRecipeCount: 3,
      },
      manifest: {
        mutationPolicy: "read_only",
        requiredTools: ["browser_search"],
        forbiddenTools: ["google_workspace_call", "file_read", "file_write", "bash", "browser_nav", "browser_content"],
      },
    },
  },
  "public-source-browser": {
    title: "Public Source Browser Workflow UI Dogfood",
    permissionMode: "full-access",
    request: [
      "Create a read-only Workflow Agent that uses the managed browser tools to read these two public source pages:",
      "https://example.com and https://www.iana.org/help/example-domains.",
      "Do not use browser_search; the URLs are provided. Call browser_nav and browser_content or equivalent browser read tools for the provided URLs.",
      "Do not write files, render documents, stage mutations, create workspace mutations, use Google Workspace, use Gmail, use visual analysis, or use Ambient CLI.",
      "Checkpoint bounded source evidence, ask the user which report tone to use, then return a compact HTML report only in the final workflow output card explaining what the pages say and why these domains exist.",
    ].join(" "),
    answerPreference: ["browser", "public", "source", "provided", "html", "read only", "no search", "no file", "no write", "no mutation", "output card"],
    runtimeChoicePreference: ["concise", "technical", "compact", "proceed", "continue", "approve"],
    runtimeAnswer: "Use a concise technical tone with one short bullet list. Keep the HTML compact and return it only in the final workflow output card; do not write or stage any file.",
    expect: {
      minModelCalls: 1,
      minRuntimeInputs: 1,
      minRuntimeInputResponses: 1,
      minOutputSignals: 1,
      minCheckpoints: 1,
      minFinalOutputChars: 160,
      requiredFinalOutputAnyTerms: [["example", "domain"], ["iana", "reserved"]],
      requiredToolFamilies: ["browser_"],
      requiredAnyToolMessages: [["browser_nav", "browser_content"]],
      forbiddenToolMessages: ["browser_search", "file_read", "file_write"],
    },
    sourceExpect: {
      forbiddenTerms: ["tools.file_read", "tools.file_write", "google_workspace_call", "tools.ambient_visual_analyze"],
      manifest: {
        mutationPolicy: "read_only",
        requiredAnyTools: [["browser_nav", "browser_content"]],
        forbiddenTools: ["browser_search", "file_read", "file_write", "google_workspace_call", "ambient_visual_analyze"],
      },
      promptAssembly: {
        requiredModuleIds: browserSourcePromptAssemblyModuleIds(),
        forbiddenModuleFragments: ["gmail", "google-workspace", "visual-analysis"],
      },
    },
    abstractionContract: {
      id: "capability-browser-source-readonly",
      contractType: "selected-capability-guidance",
      proves: [
        "browser source workflows are explained by browser capability guidance instead of fixture-specific prompt rules",
        "unrelated Gmail, Google Workspace, and visual guidance stays out of the prompt assembly",
        "read-only manifests avoid file and connector mutation surfaces",
      ],
      promptAssembly: {
        requiredModuleIds: browserSourcePromptAssemblyModuleIds(),
        forbiddenModuleFragments: ["gmail", "google-workspace", "visual-analysis"],
      },
      manifest: {
        mutationPolicy: "read_only",
        forbiddenTools: ["browser_search", "file_read", "file_write", "google_workspace_call", "ambient_visual_analyze"],
      },
      forbiddenPromptAssemblyMetadataFragments: ["public-source-browser", "example.com", "iana.org/help/example-domains"],
    },
  },
  "current-web-recipe-report": {
    title: "Current Web Recipe Report Workflow UI Dogfood",
    permissionMode: "full-access",
    request: [
      "Create a Workflow Agent that builds a small current public web research report about example domains and reserved test domains, then exports the report as a Markdown file in my Documents folder.",
      "Use current web evidence; do not rely on model knowledge for current source claims. Include the run date 2026-05-17 and timeZone America/Phoenix in source extraction and synthesis inputs.",
      "Collect exactly 6 public source candidates using browser_search through tool.paginate with exactly 2 pageQueries, pageSize 3, maxItems 6, maxPages 2, itemsPath root array, queryInputPath query, pageSizeInputPath maxResults, and dedupeKeyPath url.",
      "The two pageQueries must cover IANA example domains and reserved test domains documentation.",
      "After source collection, use collection.dedupe with keyPath url and strategy url_canonical, then collection.map to keep title, url, snippet, date or freshness, and rank.",
      "Use collection.chunk into 2 chunks of 3, model.map over chunks for claims, source dates, citation URLs, and source-quality notes, then model.reduce with strategy tree, maxFanIn 2, maxLevels 1 for final synthesis.",
      "Render a Markdown report with document.render format markdown and path Documents/example-domain-current-web-report.md, then stage a file_write mutation for that rendered Markdown file. Do not write until the staged mutation is approved.",
      "Do not use Google Workspace tools/connectors, local file reads, shell/bash, browser_nav, browser_content, or any external/cloud mutation. The only allowed write is the staged local file_write for the rendered Markdown report.",
      "The final output must include the Markdown artifact/path, source candidate count, unique source count, citation/source URLs or provenance, source freshness/date caveats, and an explicit staged-write approval/no-unintended-writes statement.",
    ].join(" "),
    answerPreference: ["current", "web", "source", "markdown", "documents", "staged", "example domains"],
    runtimeChoicePreference: ["approve", "approved", "continue", "proceed", "looks good", "markdown", "documents"],
    runtimeAnswer: "Approve the staged local Markdown write and keep the final report source-backed, concise, and explicit about freshness.",
    expect: {
      minModelCalls: 1,
      maxModelCalls: 6,
      minOutputSignals: 1,
      minCheckpoints: 1,
      minFinalOutputChars: 360,
      minApprovalRequests: 1,
      minApprovalResponses: 1,
      minDocumentRenderEnds: 1,
      requiredDocumentRenderFormats: ["markdown"],
      requiredToolMessages: ["browser_search", "file_write"],
      exactToolMessageCounts: { browser_search: 2, file_write: 1 },
      allowedWriteToolMessages: ["file_write"],
      forbiddenToolMessages: [
        "local_directory_list",
        "local_file_read",
        "file_read",
        "bash",
        "browser_nav",
        "browser_content",
        "ambient_cli",
        "ambient_cli_package_preview",
        "ambient_cli_package_install",
        "ambient_cli_package_install_pi_catalog",
        "ambient_cli_search",
        "ambient_cli_describe",
        "ambient_cli_env_bind",
        "ambient_cli_secret_request",
        "ambient_cli_package_uninstall",
        "google_workspace_call",
      ],
      forbiddenToolFamilies: ["google."],
      requiredFinalOutputTerms: ["example", "domain", "Markdown"],
      requiredFinalOutputAnyTerms: [
        ["source", "sources", "citation", "citations", "provenance", "url", "https://"],
        ["current", "freshness", "date", "2026"],
        ["approved", "staged", "write", "no unintended"],
        ["Documents/example-domain-current-web-report.md", "example-domain-current-web-report.md"],
      ],
    },
    sourceExpect: {
      requiredTerms: [
        "workflow.paginateTool",
        "tools.browser_search",
        '"itemsPath": ""',
        '"queryInputPath": "query"',
        '"pageSizeInputPath": "maxResults"',
        '"maxItems": 6',
        '"maxPages": 2',
        "workflow.dedupeCollection",
        '"strategy": "url_canonical"',
        "workflow.mapCollection",
        "workflow.chunkCollection",
        "workflow.mapModel",
        "workflow.reduceModel",
        "workflow.renderDocument",
        '"format": "markdown"',
        "workflow.stageMutation",
        "tools.file_write",
        "Documents/example-domain-current-web-report.md",
        "2026-05-17",
        "America/Phoenix",
      ],
      requiredAnyTerms: [["IANA example domains", "example domains"], ["reserved test domains", "reserved domains"]],
      forbiddenTerms: [
        "tools.local_directory_list",
        "tools.local_file_read",
        "tools.file_read",
        "tools.bash",
        "tools.browser_nav",
        "tools.browser_content",
        "tools.ambient_cli",
        "tools.ambient_cli_package_preview",
        "tools.ambient_cli_package_install",
        "tools.ambient_cli_package_install_pi_catalog",
        "tools.ambient_cli_search",
        "tools.ambient_cli_describe",
        "tools.ambient_cli_env_bind",
        "tools.ambient_cli_secret_request",
        "tools.ambient_cli_package_uninstall",
        "google_workspace_call",
        'connectorId: "google.gmail"',
        'connectorId: "google.calendar"',
        'connectorId: "google.drive"',
      ],
      manifest: {
        mutationPolicy: "staged_until_approved",
        requiredTools: ["browser_search", "file_write"],
        forbiddenTools: [
          "google_workspace_call",
          "file_read",
          "bash",
          "browser_nav",
          "browser_content",
          "ambient_cli",
          "ambient_cli_package_preview",
          "ambient_cli_package_install",
          "ambient_cli_package_install_pi_catalog",
          "ambient_cli_search",
          "ambient_cli_describe",
          "ambient_cli_env_bind",
          "ambient_cli_secret_request",
          "ambient_cli_package_uninstall",
        ],
      },
      promptAssembly: {
        requiredModuleIds: currentWebRecipePromptAssemblyModuleIds(),
        forbiddenModuleIds: [
          "policy-policy-current-data-evidence",
          "policy-capability-browser-user-action-intervention",
          "policy-capability-browser-login-intervention",
          "policy-runtime-browser-lower-level-handoff",
          "policy-capability-browser-default-wait-behavior",
          "policy-runtime-browser-user-action-resume",
          "policy-capability-browser-recovery-provenance",
        ],
        forbiddenModuleFragments: ["gmail", "google-workspace", "visual-analysis", "ambient-cli", "ambient_cli"],
      },
      compileContext: {
        requiredRecipeIds: ["current_web_research", "large_collection_summarization", "staged_document_export"],
        requiredRejectedRecipeIds: ["metadata_first_personal_data_review", "visual_batch_classification"],
        requiredPolicyImplicationIds: [
          "recipe.current_web_research.source_evidence",
          "recipe.large_collection_summarization.budget",
          "recipe.staged_document_export.approval_gate",
        ],
        minSelectedRecipeCount: 3,
        minRejectedRecipeCount: 2,
      },
    },
    abstractionContract: {
      id: "recipe-stack-current-web-staged-export",
      contractType: "typed-recipe-stack",
      proves: [
        "current public research uses the current_web_research recipe instead of scenario-specific browser instructions",
        "collection chunking and tree reduction come from the large_collection_summarization recipe",
        "local output is protected by the staged_document_export approval gate",
        "unrelated connector and visual recipes remain rejected",
      ],
      promptAssembly: {
        requiredModuleIds: currentWebRecipePromptAssemblyModuleIds(),
        forbiddenModuleIds: [
          "policy-policy-current-data-evidence",
          "policy-capability-browser-user-action-intervention",
          "policy-capability-browser-login-intervention",
          "policy-runtime-browser-lower-level-handoff",
          "policy-capability-browser-default-wait-behavior",
          "policy-runtime-browser-user-action-resume",
          "policy-capability-browser-recovery-provenance",
        ],
        forbiddenModuleFragments: ["gmail", "google-workspace", "visual-analysis", "ambient-cli", "ambient_cli"],
      },
      compileContext: {
        requiredRecipeIds: ["current_web_research", "large_collection_summarization", "staged_document_export"],
        requiredRejectedRecipeIds: ["metadata_first_personal_data_review", "visual_batch_classification"],
        requiredPolicyImplicationIds: [
          "recipe.current_web_research.source_evidence",
          "recipe.large_collection_summarization.budget",
          "recipe.staged_document_export.approval_gate",
        ],
        minSelectedRecipeCount: 3,
        minRejectedRecipeCount: 2,
      },
      manifest: {
        mutationPolicy: "staged_until_approved",
        requiredTools: ["browser_search", "file_write"],
        forbiddenTools: [
          "google_workspace_call",
          "file_read",
          "bash",
          "browser_nav",
          "browser_content",
          "ambient_cli",
          "ambient_cli_package_preview",
          "ambient_cli_package_install",
          "ambient_cli_package_install_pi_catalog",
          "ambient_cli_search",
          "ambient_cli_describe",
          "ambient_cli_env_bind",
          "ambient_cli_secret_request",
          "ambient_cli_package_uninstall",
        ],
      },
      forbiddenPromptAssemblyMetadataFragments: [
        "current-web-recipe-report",
        "example-domain-current-web-report",
        "IANA example domains",
        "reserved test domains",
      ],
    },
  },
  "flaky-browser-recovery": {
    title: "Flaky Browser Recovery Workflow UI Dogfood",
    permissionMode: "full-access",
    request: [
      "Create a read-only Workflow Agent that deliberately exercises retry and skip recovery for browser source fetching.",
      "Use exactly these source records, in this order, in a bounded workflow.mapCollection or equivalent item-scoped loop: { id: 'example-source', url: 'https://example.com' }, { id: 'iana-source', url: 'https://www.iana.org/help/example-domains' }, and { id: 'bad-source', url: 'https://workflow-dogfood-invalid.invalid/recovery-check' }.",
      "For each item, call browser_nav with the item URL as the item-scoped browser read. browser_nav returns compact page content and links, so it is acceptable for the final report evidence. Do not add a later browser_content loop over the active page after navigating multiple items. Do not use web search, file reads, connectors, shell, or writes.",
      "The fetch node must have graph metadata nodeId 'fetch-sources', itemKey equal to the source id, and a retry policy that explicitly allows retrying the failed item and skipping it to continue with partial coverage.",
      "On the first run, let the bad-source browser failure surface as a failed item instead of catching or repairing it. On recovery, respect workflow.recovery skip_item for bad-source, keep successful source evidence from fetch-sources, checkpoint partial coverage metadata, then return a compact HTML report.",
      "The final model.call input must reference the actual fetch-sources items/results and skipped-source metadata. Do not synthesize the report from instructions alone, and do not create an empty evidence checkpoint.",
      "The final report must clearly say partial coverage, identify bad-source as skipped or unreachable, and still explain the example.com and IANA source evidence.",
    ].join(" "),
    answerPreference: ["browser", "recovery", "retry", "skip", "partial", "read only", "bounded"],
    runtimeChoicePreference: ["continue", "skip", "partial", "proceed", "approve"],
    runtimeAnswer: "Continue with partial coverage and clearly label the skipped bad source.",
    recovery: {
      actions: ["retry_step", "skip_item"],
      requiredVisibleTerms: ["Retry", "Skip"],
    },
    expect: {
      minModelCalls: 1,
      minOutputSignals: 1,
      minCheckpoints: 1,
      minFinalOutputChars: 180,
      minRecoveryEvents: 4,
      minRecoverySkippedItems: 1,
      requiredRecoveryActions: ["retry_step", "skip_item"],
      requiredSkippedItemKeys: ["bad-source"],
      requiredToolFamilies: ["browser_"],
      requiredToolMessages: ["browser_nav"],
      forbiddenToolMessages: ["browser_search", "file_read", "file_write"],
      requiredFinalOutputAnyTerms: [["partial coverage", "partial"], ["bad-source", "unreachable", "skipped"], ["example", "domain"], ["iana", "reserved"]],
    },
    sourceExpect: {
      requiredTerms: ['"fetchResults": readPath(outputs["fetch-sources"], "items")'],
      forbiddenTerms: ['const checkpoint_evidence_value = {  };', '"fetchResults": readPath(outputs["checkpoint-evidence"], "fetchResults")', 'tools.browser_content({  })'],
    },
  },
};

const scenario = scenarios[scenarioName];
if (!scenario) {
  throw new Error(`Unknown scenario "${scenarioName}". Available scenarios: ${Object.keys(scenarios).join(", ")}`);
}

function runLimitsForScenario() {
  return scenario.runLimits ?? { idleTimeoutMs: 120_000 };
}

async function createDogfoodStateDirs() {
  const workspacePath = await mkdtemp(join(tmpdir(), `ambient-workflow-ui-dogfood-${scenarioName}-`));
  const userDataPath = await mkdtemp(join(tmpdir(), "ambient-workflow-ui-user-data-"));
  const snapshotPreflight = workflowUiDogfoodSnapshotPreflight({ env: process.env });
  if (!snapshotPreflight.requested) return { workspace: workspacePath, userData: userDataPath, snapshotMode: "fresh-temp" };
  if (!snapshotPreflight.ok) throw new Error(workflowUiDogfoodSnapshotPreflightErrorMessage(snapshotPreflight));

  const snapshotRoot = workflowUiDogfoodSelectedSnapshotRoot({ env: process.env });
  if (!snapshotRoot) throw new Error(workflowUiDogfoodSnapshotPreflightErrorMessage(snapshotPreflight));
  const snapshotWorkspace = join(snapshotRoot, "workspace");
  const snapshotUserData = join(snapshotRoot, "userData");
  if (snapshotPreflight.snapshotMode === "shared-snapshot-temp-copy") {
    await replaceDirectoryFromSnapshot(snapshotWorkspace, workspacePath);
    await replaceDirectoryFromSnapshot(snapshotUserData, userDataPath);
    return snapshotStateDirs({ workspacePath, userDataPath, snapshotRoot, snapshotMode: "shared-snapshot-temp-copy" });
  }

  if (snapshotPreflight.snapshotMode === "workspace-archive-temp-copy") {
    await replaceDirectoryFromSnapshot(snapshotRoot, workspacePath);
    return snapshotStateDirs({ workspacePath, userDataPath, snapshotRoot, snapshotMode: "workspace-archive-temp-copy" });
  }

  throw new Error(workflowUiDogfoodSnapshotPreflightErrorMessage(snapshotPreflight));
}

async function replaceDirectoryFromSnapshot(source, destination) {
  await rm(destination, { recursive: true, force: true });
  await cp(source, destination, { recursive: true, force: true, errorOnExist: false });
}

function snapshotStateDirs({ workspacePath, userDataPath, snapshotRoot, snapshotMode }) {
  return {
    workspace: workspacePath,
    userData: userDataPath,
    snapshotMode,
    snapshotRootLabel: basename(snapshotRoot),
    snapshotRootPathDigest: createHash("sha256").update(resolve(snapshotRoot)).digest("hex").slice(0, 12),
  };
}

async function normalizeDogfoodProjectRegistry(userDataRoot, workspacePath) {
  const registryPath = join(userDataRoot, "projects.json");
  if (!existsSync(registryPath)) return;
  let registry;
  try {
    registry = JSON.parse(await readFile(registryPath, "utf8"));
  } catch {
    registry = { version: 1 };
  }
  await writeFile(registryPath, `${JSON.stringify({ ...registry, version: 1, paths: [workspacePath] }, null, 2)}\n`, "utf8");
}

try {
  await mkdir(screenshotsDir, { recursive: true });
  await writeFile(
    join(workspace, "README.md"),
    [
      "# Workflow Agent Thread UI Dogfood",
      "",
      `Scenario: ${scenarioName}`,
      "",
      "This workspace is created by scripts/workflow-agent-thread-ui-dogfood.mjs.",
    ].join("\n"),
    "utf8",
  );
  await normalizeDogfoodProjectRegistry(userData, workspace);
  await scenario.seedWorkspace?.(workspace);

  app = await launchApp();
  report = await runDogfood(app.cdp);
  await writeReport(report);
  console.log(JSON.stringify(compactReport(report), null, 2));
  console.log(`Workflow Agent thread UI dogfood passed. Report: ${join(scenarioReportRoot, "latest.json")}`);
} catch (error) {
  const failureEvidence = app?.cdp ? await collectFailureEvidence(app.cdp).catch((evidenceError) => ({ error: String(evidenceError?.message ?? evidenceError) })) : undefined;
  const errorMessageText = error instanceof Error ? error.message : String(error);
  const failureReport = {
    scenario: scenarioName,
    startedAt,
    finishedAt: new Date().toISOString(),
    ok: false,
    harness: harnessReportMetadata(),
    classification: classifyDogfoodFailure(errorMessageText, failureEvidence),
    error: errorMessageText,
    workspace,
    userData,
    failureEvidence,
    appOutputTail: outputTail(),
    partialReport: report,
  };
  await writeReport(failureReport);
  console.error(outputTail());
  throw error;
} finally {
  if (app) {
    app.cdp.close();
    await terminateProcessTree(app.child);
  }
  for (const child of children) await terminateProcessTree(child);
  if (!keepArtifacts) {
    await rm(workspace, { recursive: true, force: true });
    await rm(userData, { recursive: true, force: true });
  }
}

async function runDogfood(cdp) {
  const deadline = Date.now() + dogfoodTimeoutMs;
  await waitFor(cdp, () => document.body?.innerText.includes("Ambient"), "Ambient shell", 45_000);
  const state = await desktopState(cdp);
  const providerId = state?.provider?.providerId;
  if (providerId && providerId !== launchConfig.providerId) {
    throw new Error(`Expected ${launchConfig.providerLabel} provider (${launchConfig.providerId}), got ${providerId}.`);
  }
  const credentialStatus = workflowUiDogfoodCredentialStatus({
    env: process.env,
    cwd: process.cwd(),
    providerId: launchConfig.providerId,
  });
  if (!state?.provider?.hasApiKey && !credentialStatus.configured) {
    throw new Error(
      launchConfig.providerId === "gmi-cloud"
        ? "GMI Cloud API key is missing. Configure GMI_CLOUD_API_KEY, GMI_API_KEY, GMI_CLOUD_API_KEY_FILE, or the ignored gmicloud-api-key.txt file."
        : "Ambient API key is missing. Configure AMBIENT_API_KEY, AMBIENT_AGENT_AMBIENT_API_KEY, AMBIENT_API_KEY_FILE, or the ignored ambient_api_key.txt file.",
    );
  }
  if (!state?.provider?.hasApiKey) {
    throw new Error(`${launchConfig.providerLabel} API key was configured for launch but was not visible to the app.`);
  }
  if (state?.provider?.hasApiKey) {
    const keyCheck = await evaluate(cdp, "window.ambientDesktop.testAmbientApiKey()", { timeoutMs: 45_000 });
    if (keyCheck && keyCheck.ok === false) {
      throw new Error(`${launchConfig.providerLabel} API key check failed: ${keyCheck.message ?? "unknown provider error"}`);
    }
  }
  await ensureScenarioPermissionMode(cdp, state);

  await clickButtonText(cdp, "Workflow Agents");
  await waitFor(cdp, () => document.body?.innerText.includes("New Workflow"), "Workflow Agents shell", 45_000);

  const discovery = await liveStep(
    cdp,
    "start discovery",
    `window.ambientDesktop.startWorkflowDiscovery(${JSON.stringify({
      title: scenario.title,
      initialRequest: scenario.request,
      projectPath: workspace,
      traceMode: "production",
    })})`,
  );
  let thread = discovery.thread;
  thread = await ensureWorkflowThreadPermissionMode(cdp, thread);
  await syncWorkflowUi(cdp, discovery.folders);
  await selectThreadInUi(cdp, thread.title);

  thread = await answerDiscoveryQuestions(cdp, thread, deadline);
  thread = await requireDiscoveryReadyForCompile(cdp, thread);
  await selectThreadInUi(cdp, thread.title);

  const compileDashboard = await compileWorkflowPreviewStep(cdp, thread);
  const artifact = latestArtifactForThread(compileDashboard, thread.id);
  if (!artifact) throw new Error(`Compile completed but no artifact was created for workflow thread ${thread.id}.`);
  if (!["ready_for_preview", "approved"].includes(artifact.status)) {
    throw new Error(`Compiled artifact ${artifact.id} has unexpected status ${artifact.status}.`);
  }
  const sourceAssertions = await assertScenarioSource(artifact);

  await refreshWorkflowUi(cdp);
  await selectThreadInUi(cdp, thread.title);
  await captureMode(cdp, "Build", "build-after-compile");

  const approvedDashboard = artifact.status === "approved"
    ? compileDashboard
    : await liveStep(
        cdp,
        "approve workflow preview",
        `window.ambientDesktop.reviewWorkflowArtifact(${JSON.stringify({ artifactId: artifact.id, decision: "approved" })})`,
      );
  const approvedArtifact = latestArtifactForThread(approvedDashboard, thread.id) ?? artifact;

  const firstRunDashboard = await liveStep(
    cdp,
    "run approved workflow",
    `window.ambientDesktop.runWorkflowArtifact(${JSON.stringify({
      artifactId: approvedArtifact.id,
      mode: "execute",
      runtime: "workflow",
      runLimits: runLimitsForScenario(),
    })})`,
  );
  let latestRun = latestRunForArtifact(firstRunDashboard, approvedArtifact.id);
  if (!latestRun) throw new Error(`Run completed without a run record for artifact ${approvedArtifact.id}.`);
  let detail = await getRunDetail(cdp, latestRun.id);
  let recoveryTrace;
  if (scenario.recovery) {
    ({ latestRun, detail, recoveryTrace } = await exerciseGraphRecovery(cdp, approvedArtifact, latestRun, detail));
  } else {
    ({ latestRun, detail } = await resumeRuntimePauses(cdp, approvedArtifact, latestRun, detail));
  }
  if (latestRun.status !== "succeeded") {
    throw new Error(`Expected workflow run to succeed after ${scenario.recovery ? "graph recovery" : "runtime input resume"}, got ${latestRun.status}: ${latestRun.error ?? "no error"}`);
  }
  const scenarioAssertions = assertScenarioEvidence(detail);

  await liveStep(
    cdp,
    "create disabled workflow schedule",
    `window.ambientDesktop.createAutomationSchedule(${JSON.stringify({
      targetKind: "workflow_thread",
      targetId: thread.id,
      preset: "daily",
      timezone: "America/Phoenix",
      enabled: false,
      skipIfActive: true,
      runLimits: runLimitsForScenario(),
    })})`,
    { timeoutMs: 60_000 },
  );

  await refreshWorkflowUi(cdp);
  await selectThreadInUi(cdp, thread.title);
  const buildMetrics = await captureMode(cdp, "Build", "build-narrow");
  const runsMetrics = await captureMode(cdp, "Runs", "runs-narrow");
  const schedulesMetrics = await captureMode(cdp, "Schedules", "schedules-narrow");
  const uiAssertions = assertCompactMetrics({ buildMetrics, runsMetrics, schedulesMetrics });

  const finalState = await desktopState(cdp);
  const schedules = await evaluate(cdp, "window.ambientDesktop.listAutomationSchedules()", { timeoutMs: 60_000 });
  const graphSnapshots = await evaluate(
    cdp,
    `window.ambientDesktop.listWorkflowGraphSnapshots(${JSON.stringify({ workflowThreadId: thread.id })})`,
    { timeoutMs: 60_000 },
  );

  return {
    ok: true,
    scenario: scenarioName,
    harness: harnessReportMetadata(),
    startedAt,
    finishedAt: new Date().toISOString(),
    workspace,
    thread: pick(thread, ["id", "title", "phase", "status", "traceMode"]),
    permissionMode: scenarioPermissionMode() ?? finalState.threads?.find((candidate) => candidate.id === finalState.activeThreadId)?.permissionMode,
    artifact: pick(approvedArtifact, ["id", "title", "status", "sourcePath"]),
    manifest: manifestEvidence(approvedArtifact.manifest),
    run: pick(latestRun, ["id", "status", "error", "reportPath", "startedAt", "updatedAt", "completedAt"]),
    launch: launchConfig.launchSummary,
    sourceAssertions,
    abstractionContract: sourceAssertions?.abstractionContract,
    runEvidence: {
      events: detail.events.length,
      modelCalls: detail.modelCalls.length,
      checkpoints: detail.checkpoints.length,
      approvals: detail.approvals.length,
      outputSignals: outputSignalCount(detail),
      runtimeInputRequests: detail.events.filter((event) => event.type === "workflow.input.required").length,
      runtimeInputResponses: detail.events.filter((event) => event.type === "workflow.input.received").length,
      approvalRequests: detail.events.filter((event) => event.type === "approval.required").length,
      approvalResponses: detail.events.filter((event) => event.type === "approval.approved").length,
      desktopToolEnds: desktopToolEndMessages(detail),
      connectorEnds: connectorEndMessages(detail),
      recoveryEvents: detail.events.filter((event) => event.type.startsWith("workflow.recovery.")).length,
    },
    recoveryTrace,
    scenarioAssertions,
    discovery: {
      questions: thread.discoveryQuestions.length,
      answered: thread.discoveryQuestions.filter((question) => question.answer).length,
      ambientQuestions: thread.discoveryQuestions.filter((question) => question.provider === "ambient").length,
      graphNodes: thread.graph?.nodes?.length ?? 0,
    },
    schedule: {
      total: Array.isArray(schedules) ? schedules.length : 0,
      forThread: Array.isArray(schedules) ? schedules.filter((schedule) => schedule.targetKind === "workflow_thread" && schedule.targetId === thread.id).length : 0,
    },
    graphSnapshots: Array.isArray(graphSnapshots) ? graphSnapshots.length : 0,
    uiAssertions,
    screenshots: [buildMetrics.screenshot, runsMetrics.screenshot, schedulesMetrics.screenshot],
    appOutputTail: outputTail(),
    finalWorkflowThreadCount: finalState.workflowAgentFolders?.flatMap((folder) => folder.threads ?? []).length ?? 0,
  };
}

async function answerDiscoveryQuestions(cdp, initialThread, deadline) {
  let thread = initialThread;
  for (let round = 0; round < 8; round += 1) {
    if (Date.now() > deadline) throw new Error("Timed out while answering discovery questions.");
    thread = await latestWorkflowThreadFromUi(cdp, thread);
    thread = await resolveDiscoveryAccessRequests(cdp, thread, deadline);
    thread = await latestWorkflowThreadFromUi(cdp, thread);
    const pending = (thread.discoveryQuestions ?? []).filter((question) => !question.answer);
    if (pending.length === 0) return thread;
    const progress = workflowDiscoveryProgress(thread);
    const progressLine = `[dogfood] discovery answer round ${round + 1}: ${progress.answered}/${progress.questions} answered, ${progress.pendingAccessRequests} pending access requests`;
    appOutput.push(`${progressLine}\n`);
    console.log(progressLine);
    for (const question of pending) {
      thread = await latestWorkflowThreadFromUi(cdp, thread);
      const latestQuestion = (thread.discoveryQuestions ?? []).find((candidate) => candidate.id === question.id) ?? question;
      if (latestQuestion.answer) continue;
      const choice = chooseDiscoveryChoice(latestQuestion);
      const payload = choice
        ? { questionId: latestQuestion.id, choiceId: choice.id }
        : { questionId: latestQuestion.id, freeform: "Use the simplest read-only, model-first workflow shape and keep outputs concise." };
      const result = await liveStep(
        cdp,
        `answer discovery question ${latestQuestion.id}`,
        `window.ambientDesktop.answerWorkflowDiscoveryQuestion(${JSON.stringify(payload)})`,
      );
      thread = result.thread;
      await syncWorkflowUi(cdp, result.folders);
      thread = await latestWorkflowThreadFromUi(cdp, thread);
      thread = await resolveDiscoveryAccessRequests(cdp, thread, deadline);
    }
  }
  thread = await latestWorkflowThreadFromUi(cdp, thread);
  const progress = workflowDiscoveryProgress(thread);
  throw new Error(`Discovery still has ${progress.unanswered} unanswered question(s) and ${progress.pendingAccessRequests} pending access request(s) after 8 rounds for thread ${thread.id}.`);
}

async function resolveDiscoveryAccessRequests(cdp, initialThread, deadline) {
  let thread = initialThread;
  for (let round = 0; round < 24; round += 1) {
    if (Date.now() > deadline) throw new Error("Timed out while resolving discovery access requests.");
    const pending = pendingDiscoveryAccessRequests(thread);
    if (pending.length === 0) return thread;
    const { question, request } = pending[0];
    const response = discoveryAccessResponseForScenario(request);
    const result = await liveStep(
      cdp,
      `resolve discovery access ${request.id}`,
      `window.ambientDesktop.resolveWorkflowDiscoveryAccessRequest(${JSON.stringify({
        questionId: question.id,
        accessRequestId: request.id,
        response,
      })})`,
    );
    thread = result.thread;
    await syncWorkflowUi(cdp, result.folders);
    thread = await latestWorkflowThreadFromUi(cdp, thread);
  }
  throw new Error(`Discovery still has pending access requests after 24 resolutions for thread ${thread.id}.`);
}

async function latestWorkflowThreadFromUi(cdp, thread) {
  const folders = await evaluate(cdp, "window.ambientDesktop.listWorkflowAgentFolders()", { timeoutMs: 60_000 });
  return workflowThreadFromFolders(folders, thread.id) ?? thread;
}

async function requireDiscoveryReadyForCompile(cdp, thread) {
  const latest = await latestWorkflowThreadFromUi(cdp, thread);
  const progress = workflowDiscoveryProgress(latest);
  if (progress.unanswered > 0 || progress.pendingAccessRequests > 0) {
    throw new Error(
      `Workflow discovery is not ready to compile for thread ${latest.id}: ${progress.answered}/${progress.questions} answered, ${progress.pendingAccessRequests} pending access request(s).`,
    );
  }
  return latest;
}

function pendingDiscoveryAccessRequests(thread) {
  const pending = [];
  for (const question of thread.discoveryQuestions ?? []) {
    for (const request of question.accessRequests ?? []) {
      if (request.status === "pending") pending.push({ question, request });
    }
  }
  return pending;
}

function discoveryAccessResponseForScenario(request) {
  const allowedCapabilities = new Set(scenario.allowDiscoveryAccessCapabilities ?? []);
  if (allowedCapabilities.has(request.capability)) {
    return Array.isArray(request.reusableScopes) && request.reusableScopes.includes("workflow_thread")
      ? "always_workflow"
      : "allow_once";
  }
  return "deny";
}

async function compileWorkflowPreviewStep(cdp, thread) {
  const beforeArtifactIds = await evaluate(
    cdp,
    `(async () => {
      const dashboard = await window.ambientDesktop.listWorkflowDashboard();
      return dashboard.artifacts.filter((artifact) => artifact.workflowThreadId === ${JSON.stringify(thread.id)}).map((artifact) => artifact.id);
    })()`,
    { timeoutMs: 60_000 },
  );
  const knownArtifactIds = Array.isArray(beforeArtifactIds) ? beforeArtifactIds : [];
  return liveStep(
    cdp,
    "compile workflow preview",
    `window.ambientDesktop.compileWorkflowPreview(${JSON.stringify({
      userRequest: scenario.request,
      workflowThreadId: thread.id,
    })})`,
    {
      recoverExpression: `(async () => {
        const dashboard = await window.ambientDesktop.listWorkflowDashboard();
        const known = new Set(${JSON.stringify(knownArtifactIds)});
        const artifact = dashboard.artifacts.find((candidate) =>
          candidate.workflowThreadId === ${JSON.stringify(thread.id)} &&
          !known.has(candidate.id) &&
          ["ready_for_preview", "approved"].includes(candidate.status)
        );
        if (!artifact) return null;
        const run = dashboard.runs.find((candidate) => candidate.artifactId === artifact.id && ["previewed", "succeeded", "running"].includes(candidate.status));
        return run ? dashboard : null;
      })()`,
      recoveryLabel: "persisted workflow preview artifact",
    },
  );
}

function chooseDiscoveryChoice(question) {
  const choices = question.choices ?? [];
  if (!choices.length) return undefined;
  const preferred = scenario.answerPreference ?? [];
  const scored = choices.map((choice, index) => {
    const text = `${choice.label ?? ""} ${choice.description ?? ""}`.toLowerCase();
    const score =
      (choice.recommended ? 100 : 0) +
      preferred.reduce((sum, term) => sum + (text.includes(term.toLowerCase()) ? 20 : 0), 0) -
      (scenarioName === "vocabulary-quiz" && /browser|web|network|search|connector/i.test(text) ? 25 : 0) -
      index;
    return { choice, score };
  });
  scored.sort((left, right) => right.score - left.score);
  return scored[0]?.choice;
}

async function liveStep(cdp, label, expression, options = {}) {
  const timeoutMs = options.timeoutMs ?? liveStepTimeoutMs;
  const retryLimit = Math.max(0, Math.floor(options.providerIdleRetries ?? providerIdleRetryLimit));
  let lastError;
  for (let attempt = 0; attempt <= retryLimit; attempt += 1) {
    const started = Date.now();
    const attemptSuffix = attempt > 0 ? ` retry ${attempt}/${retryLimit}` : "";
    const startLine = `[dogfood] ${label}${attemptSuffix} started; timeout ${Math.round(timeoutMs / 1000)}s`;
    appOutput.push(`${startLine}\n`);
    console.log(startLine);
    try {
      const operationId = await startRendererOperation(cdp, expression);
      const result = await waitForRendererOperation(cdp, operationId, {
        label,
        timeoutMs,
        recoverExpression: options.recoverExpression,
        recoveryLabel: options.recoveryLabel,
      });
      const completeLine = `[dogfood] ${label}${attemptSuffix} completed in ${Date.now() - started}ms`;
      appOutput.push(`${completeLine}\n`);
      console.log(completeLine);
      return result;
    } catch (error) {
      lastError = error;
      const failureLine = `[dogfood] ${label}${attemptSuffix} failed in ${Date.now() - started}ms`;
      appOutput.push(`${failureLine}\n`);
      console.error(failureLine);
      if (attempt < retryLimit && isProviderIdleStartError(error)) {
        const retryDelayMs = Math.min(60_000, providerIdleRetryBaseDelayMs * 2 ** attempt);
        const retryLine = `[dogfood] ${label} retrying after provider idle/no-stream failure in ${Math.round(retryDelayMs / 1000)}s`;
        appOutput.push(`${retryLine}\n`);
        console.warn(retryLine);
        await delay(retryDelayMs);
        continue;
      }
      throw new Error(`${label} failed after ${Date.now() - started}ms: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`${label} failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function startRendererOperation(cdp, expression, options = {}) {
  const operationId = `workflow-dogfood-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return evaluate(
    cdp,
    `(() => {
      const id = ${JSON.stringify(operationId)};
      const operations = (window.__ambientWorkflowDogfoodOps ||= {});
      operations[id] = { status: "pending", startedAt: Date.now() };
      Promise.resolve()
        .then(() => (${expression}))
        .then(
          (result) => {
            operations[id] = { ...operations[id], status: "fulfilled", result, finishedAt: Date.now() };
          },
          (error) => {
            operations[id] = {
              ...operations[id],
              status: "rejected",
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
              finishedAt: Date.now(),
            };
          },
        );
      return id;
    })()`,
    { timeoutMs: options.timeoutMs ?? 120_000 },
  );
}

async function waitForRendererOperation(cdp, operationId, options) {
  const started = Date.now();
  let pollFailures = 0;
  let lastRecovered;
  let lastRecoveryPollAt = 0;
  while (Date.now() - started < options.timeoutMs) {
    let operation;
    try {
      operation = await evaluate(
        cdp,
        `(() => {
          const item = window.__ambientWorkflowDogfoodOps?.[${JSON.stringify(operationId)}];
          if (!item) return { status: "missing", error: "Renderer operation was not found." };
          if (item.status === "fulfilled") {
            delete window.__ambientWorkflowDogfoodOps[${JSON.stringify(operationId)}];
            return { status: "fulfilled", result: item.result };
          }
          if (item.status === "rejected") {
            delete window.__ambientWorkflowDogfoodOps[${JSON.stringify(operationId)}];
            return { status: "rejected", error: item.error, stack: item.stack };
          }
          return { status: "pending", startedAt: item.startedAt };
        })()`,
        { timeoutMs: 60_000 },
      );
    } catch (error) {
      pollFailures += 1;
      if (pollFailures <= 3) {
        const warning = `[dogfood] ${options.label} renderer poll did not respond (${error instanceof Error ? error.message : String(error)}); continuing until overall timeout`;
        appOutput.push(`${warning}\n`);
        console.warn(warning);
      }
      if (options.recoverExpression) {
        try {
          const recovered = await evaluate(cdp, options.recoverExpression, { timeoutMs: 60_000 });
          if (recovered) {
            const recoveryLine = `[dogfood] ${options.label} recovered from ${options.recoveryLabel ?? "observable app state"}`;
            appOutput.push(`${recoveryLine}\n`);
            console.warn(recoveryLine);
            return recovered;
          }
        } catch {
          // A busy renderer can miss a recovery poll too; the outer live-step timeout is the authority.
        }
      }
      await delay(1_000);
      continue;
    }
    if (operation?.status === "fulfilled") return operation.result;
    if (operation?.status === "rejected" || operation?.status === "missing") {
      throw new Error(operation.error ?? `${options.label} renderer operation failed.`);
    }
    if (options.recoverExpression && Date.now() - started > 30_000 && Date.now() - lastRecoveryPollAt > 10_000) {
      lastRecoveryPollAt = Date.now();
      try {
        const recovered = await evaluate(cdp, options.recoverExpression, { timeoutMs: 60_000 });
        if (recovered) {
          lastRecovered = recovered;
          if (Date.now() - started < Math.max(60_000, options.timeoutMs - 60_000)) {
            const recoveryLine = `[dogfood] ${options.label} recovered from ${options.recoveryLabel ?? "observable app state"}`;
            appOutput.push(`${recoveryLine}\n`);
            console.warn(recoveryLine);
            return recovered;
          }
        }
      } catch {
        // A busy renderer can miss a recovery poll too; the outer live-step timeout is the authority.
      }
    }
    await delay(1_000);
  }
  if (lastRecovered) {
    const recoveryLine = `[dogfood] ${options.label} recovered from ${options.recoveryLabel ?? "observable app state"} after operation timeout`;
    appOutput.push(`${recoveryLine}\n`);
    console.warn(recoveryLine);
    return lastRecovered;
  }
  throw new Error(`${options.label} did not finish within ${options.timeoutMs}ms`);
}

function isProviderIdleStartError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /without stream activity|did not start streaming|Discovery is paused until Ambient access|\b429\b|rate limit|Upstream request failed/i.test(message);
}

async function captureMode(cdp, mode, name) {
  const modeName = mode.toLowerCase();
  const alreadyInMode = await evaluate(cdp, `Boolean(document.querySelector('[data-mode="${modeName}"]'))`, { timeoutMs: 10_000 });
  if (!alreadyInMode) await clickText(cdp, mode);
  await waitFor(
    cdp,
    (modeName, modeLabel) => Boolean(document.querySelector(`[data-mode="${modeName}"]`) || document.body?.innerText.includes(modeLabel)),
    `${mode} mode`,
    45_000,
    [mode.toLowerCase(), mode],
  );
  if (modeName === "build") {
    await waitFor(
      cdp,
      () => {
        const text = document.body?.innerText.toLowerCase() ?? "";
        return text.includes("compile audit") && text.includes("prompt modules") && text.includes("validator");
      },
      "Build compile audit summary",
      45_000,
    );
  }
  await setNarrowWorkflowSplit(cdp);
  await delay(500);
  const metrics = await evaluate(
    cdp,
    `(() => {
      const mode = ${JSON.stringify(mode.toLowerCase())};
      const root = document.querySelector('[data-mode="' + mode + '"]');
      const rail = root?.querySelector('.workflow-build-rail, .workflow-runs-rail, .workflow-schedules-rail');
      const shell = root?.querySelector('.workflow-build-shell, .workflow-runs-shell, .workflow-schedules-shell');
      const panelBody = root?.querySelector('.workflow-build-panel-body, .workflow-runs-panel-body, .workflow-schedules-panel-body');
      const diagram = document.querySelector('.workflow-persistent-diagram-pane');
      const overflowX = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth;
      const rootText = root?.innerText ?? document.body.innerText ?? '';
      const activePanel =
        panelBody?.getAttribute('data-workflow-build-panel') ||
        panelBody?.getAttribute('data-workflow-runs-panel') ||
        root?.querySelector('[id^="schedules-"]')?.id ||
        '';
      return {
        mode,
        rootWidth: root ? Math.round(root.getBoundingClientRect().width) : 0,
        railDisplay: rail ? getComputedStyle(rail).display : '',
        railOverflowX: rail ? getComputedStyle(rail).overflowX : '',
        railButtonCount: rail ? rail.querySelectorAll('button').length : 0,
        shellColumns: shell ? getComputedStyle(shell).gridTemplateColumns : '',
        activePanel,
        diagramVisible: Boolean(diagram && diagram.getBoundingClientRect().width > 120 && diagram.getBoundingClientRect().height > 120),
        overflowX,
        visibleChars: rootText.length,
        compileAuditVisible:
          mode === "build"
            ? (() => {
                const text = rootText.toLowerCase();
                return text.includes("compile audit") && text.includes("prompt modules") && text.includes("validator");
              })()
            : undefined,
      };
    })()`,
  );
  const screenshot = await captureScreenshot(cdp, name);
  return { ...metrics, screenshot };
}

function assertCompactMetrics({ buildMetrics, runsMetrics, schedulesMetrics }) {
  const modes = [buildMetrics, runsMetrics, schedulesMetrics];
  const failures = [];
  for (const metric of modes) {
    if (metric.rootWidth <= 0) failures.push(`${metric.mode}: root missing`);
    if (metric.rootWidth > 760) failures.push(`${metric.mode}: expected compact root width <= 760, got ${metric.rootWidth}`);
    if (metric.railDisplay !== "flex") failures.push(`${metric.mode}: expected compact rail display flex, got ${metric.railDisplay}`);
    if (!metric.diagramVisible) failures.push(`${metric.mode}: persistent diagram is not visible`);
    if (metric.overflowX > 24) failures.push(`${metric.mode}: page has ${metric.overflowX}px horizontal overflow`);
    if (metric.visibleChars > 120_000) failures.push(`${metric.mode}: page text is too large (${metric.visibleChars} chars), likely flooding UI`);
  }
  if (!buildMetrics.compileAuditVisible) failures.push("build: compile audit summary is not visible");
  if (failures.length) throw new Error(`Compact V3 UI assertions failed:\n- ${failures.join("\n- ")}`);
  return {
    passed: true,
    modes: modes.map((metric) => pick(metric, ["mode", "rootWidth", "railDisplay", "railOverflowX", "railButtonCount", "activePanel", "overflowX", "visibleChars", "compileAuditVisible"])),
  };
}

async function selectThreadInUi(cdp, title) {
  await ensureWorkflowAgentsShell(cdp);
  await clickText(cdp, title);
  await waitFor(
    cdp,
    (needle) => Boolean(document.body?.innerText.includes(needle) && document.querySelector(".workflow-discovery-layout")),
    "workflow thread selected",
    45_000,
    [title],
  );
}

async function ensureWorkflowAgentsShell(cdp) {
  const alreadyThere = await evaluate(
    cdp,
    `Boolean(document.body?.innerText?.includes("Workflow Agents") && document.body?.innerText?.includes("New Workflow"))`,
    { timeoutMs: 10_000 },
  );
  if (!alreadyThere) {
    await clickButtonText(cdp, "Workflow Agents");
  }
  await waitFor(
    cdp,
    () => Boolean(document.body?.innerText?.includes("Workflow Agents") && document.body?.innerText?.includes("New Workflow")),
    "Workflow Agents shell",
    45_000,
  );
}

async function setNarrowWorkflowSplit(cdp) {
  await evaluate(
    cdp,
    `(() => {
      document.querySelectorAll('.workflow-discovery-layout').forEach((layout) => {
        layout.style.setProperty('--workflow-split-primary', '520px');
      });
    })()`,
  );
}

async function syncWorkflowUi(cdp, folders) {
  await evaluate(
    cdp,
    `window.ambientDesktop.emitE2eEvent?.(${JSON.stringify({ type: "workflow-updated" })})`,
    { timeoutMs: 30_000 },
  );
  if (folders) {
    const state = await desktopState(cdp);
    await evaluate(cdp, `window.ambientDesktop.emitE2eEvent?.(${JSON.stringify({ type: "state", state })})`, { timeoutMs: 30_000 });
  }
}

async function refreshWorkflowUi(cdp) {
  await evaluate(cdp, `window.ambientDesktop.emitE2eEvent?.(${JSON.stringify({ type: "workflow-updated" })})`, { timeoutMs: 30_000 });
  await delay(300);
}

async function getRunDetail(cdp, runId) {
  return evaluate(cdp, `window.ambientDesktop.getWorkflowRunDetail(${JSON.stringify({ runId })})`, { timeoutMs: 60_000 });
}

async function resumeRuntimePauses(cdp, artifact, initialRun, initialDetail) {
  let latestRun = initialRun;
  let detail = initialDetail;
  const resumeTimeoutMs = scenario.resumeTimeoutMs ?? liveStepTimeoutMs;
  for (let attempt = 0; attempt < 6 && (latestRun.status === "needs_input" || latestRun.status === "paused"); attempt += 1) {
    const input = latestUnansweredInput(detail);
    if (input) {
      const resumedDashboard = await liveStep(
        cdp,
        `resume workflow from runtime input ${attempt + 1}`,
        `window.ambientDesktop.runWorkflowArtifact(${JSON.stringify({
          artifactId: artifact.id,
          mode: "execute",
          runtime: "workflow",
          resumeFromRunId: latestRun.id,
          runLimits: runLimitsForScenario(),
          userInputs: [
            {
              requestId: input.requestId,
              ...(input.choiceId ? { choiceId: input.choiceId } : {}),
              text: input.answerText ?? scenario.runtimeAnswer,
            },
          ],
        })})`,
        {
          timeoutMs: resumeTimeoutMs,
          recoverExpression: completedRunDashboardRecoverExpression(artifact.id, latestRun.id),
          recoveryLabel: "persisted resumed workflow run",
        },
      );
      latestRun = latestRunForArtifact(resumedDashboard, artifact.id) ?? latestRun;
      detail = await getRunDetail(cdp, latestRun.id);
      continue;
    }

    const approval = latestPendingApproval(detail);
    if (approval) {
      detail = await liveStep(
        cdp,
        `approve workflow review item ${attempt + 1}`,
        `window.ambientDesktop.resolveWorkflowApproval(${JSON.stringify({ runId: latestRun.id, approvalId: approval.id, decision: "approved" })})`,
      );
      const resumedDashboard = await liveStep(
        cdp,
        `resume workflow from review item ${attempt + 1}`,
        `window.ambientDesktop.runWorkflowArtifact(${JSON.stringify({
          artifactId: artifact.id,
          mode: "execute",
          runtime: "workflow",
          resumeFromRunId: latestRun.id,
          runLimits: runLimitsForScenario(),
        })})`,
        {
          timeoutMs: resumeTimeoutMs,
          recoverExpression: completedRunDashboardRecoverExpression(artifact.id, latestRun.id),
          recoveryLabel: "persisted resumed workflow run",
        },
      );
      latestRun = latestRunForArtifact(resumedDashboard, artifact.id) ?? latestRun;
      detail = await getRunDetail(cdp, latestRun.id);
      continue;
    }

    throw new Error(`Run ${latestRun.id} paused with status ${latestRun.status} but no unanswered workflow.input.required event or pending review item was retained.`);
  }
  return { latestRun, detail };
}

function completedRunDashboardRecoverExpression(artifactId, resumeFromRunId) {
  return `(async () => {
    const dashboard = await window.ambientDesktop.listWorkflowDashboard();
    const runs = dashboard.runs
      .filter((candidate) => candidate.artifactId === ${JSON.stringify(artifactId)})
      .sort((left, right) => String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? "")));
    const latest = runs[0];
    if (!latest) return null;
    if (latest.status === "running" || latest.status === "queued") return null;
    if (latest.id === ${JSON.stringify(resumeFromRunId)} && (latest.status === "needs_input" || latest.status === "paused")) return null;
    return dashboard;
  })()`;
}

async function exerciseGraphRecovery(cdp, artifact, initialRun, initialDetail) {
  let latestRun = initialRun;
  let detail = initialDetail;
  if (latestRun.status === "needs_input" || latestRun.status === "paused") {
    ({ latestRun, detail } = await resumeRuntimePauses(cdp, artifact, latestRun, detail));
  }
  if (latestRun.status !== "failed") {
    throw new Error(`Recovery scenario expected the first workflow run to fail with an actionable graph event, got ${latestRun.status}.`);
  }

  const screenshots = [];
  const actions = [];
  const visible = await assertGraphRecoveryUiVisible(cdp, scenario.recovery);
  screenshots.push(visible.screenshot);

  for (const [index, action] of scenario.recovery.actions.entries()) {
    const event = selectRecoveryEvent(detail, action);
    if (!event) {
      throw new Error(`Could not find an actionable failed event for recovery action ${action}. Event tail: ${eventTail(detail).join(" | ")}`);
    }
    const dashboard = await liveStep(
      cdp,
      `recover workflow with ${action}`,
      `window.ambientDesktop.recoverWorkflowRun(${JSON.stringify({
        runId: latestRun.id,
        eventId: event.id,
        action,
        graphNodeId: event.graphNodeId ?? event.data?.graphNodeId,
        itemKey: event.itemKey ?? event.data?.itemKey,
        allowUnapproved: artifact.status !== "approved",
      })})`,
    );
    latestRun = latestRunForArtifact(dashboard, artifact.id) ?? latestRun;
    detail = await getRunDetail(cdp, latestRun.id);
    if (latestRun.status === "needs_input" || latestRun.status === "paused") {
      ({ latestRun, detail } = await resumeRuntimePauses(cdp, artifact, latestRun, detail));
    }
    const capture = await captureMode(cdp, "Runs", `recovery-${action}-${index + 1}`);
    screenshots.push(capture.screenshot);
    actions.push({
      action,
      sourceRunId: event.runId,
      sourceEventId: event.id,
      sourceEventType: event.type,
      graphNodeId: event.graphNodeId ?? event.data?.graphNodeId,
      itemKey: event.itemKey ?? event.data?.itemKey,
      resultRunId: latestRun.id,
      resultStatus: latestRun.status,
      resultError: latestRun.error,
    });
    if (latestRun.status === "succeeded" && index < scenario.recovery.actions.length - 1) {
      throw new Error(`Recovery action ${action} succeeded before all required recovery actions ran; expected ${scenario.recovery.actions.slice(index + 1).join(", ")} to remain actionable.`);
    }
  }

  return {
    latestRun,
    detail,
    recoveryTrace: {
      actions,
      screenshots,
      eventCounts: eventCountsByType(detail.events),
    },
  };
}

async function assertGraphRecoveryUiVisible(cdp, recovery) {
  const metrics = await captureMode(cdp, "Runs", "recovery-before");
  const bodyText = await evaluate(cdp, "document.body?.innerText ?? ''", { timeoutMs: 30_000 });
  const requiredTerms = recovery.requiredVisibleTerms ?? recovery.actions ?? [];
  const missing = requiredTerms.filter((term) => !bodyText.toLowerCase().includes(String(term).toLowerCase()));
  if (missing.length) {
    throw new Error(`Recovery UI did not expose expected action term(s): ${missing.join(", ")}. Screenshot: ${metrics.screenshot.path}`);
  }
  return metrics;
}

function selectRecoveryEvent(detail, action) {
  const candidates = [...(detail.events ?? [])]
    .reverse()
    .filter((event) => isRecoverableFailureEvent(event))
    .filter((event) => !String(event.type ?? "").startsWith("workflow.recovery."))
    .filter((event) => event.type !== "workflow.failed");
  if (action === "skip_item") {
    return candidates.find((event) => recoveryItemKey(event)) ?? candidates[0];
  }
  return candidates.find((event) => event.graphNodeId ?? event.data?.graphNodeId) ?? candidates[0];
}

function isRecoverableFailureEvent(event) {
  return event?.type === "workflow.failed" || /\.error$|\.failed$|\.invalid$/.test(String(event?.type ?? ""));
}

function recoveryItemKey(event) {
  const value = event?.itemKey ?? event?.data?.itemKey;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function eventTail(detail) {
  return (detail.events ?? [])
    .slice(-12)
    .map((event) => `${event.seq}:${event.type}:${event.graphNodeId ?? event.data?.graphNodeId ?? ""}:${event.itemKey ?? event.data?.itemKey ?? ""}:${event.message ?? ""}`);
}

function eventCountsByType(events) {
  return (events ?? []).reduce((counts, event) => {
    counts[event.type] = (counts[event.type] ?? 0) + 1;
    return counts;
  }, {});
}

function latestPendingApproval(detail) {
  return (detail.approvals ?? []).filter((approval) => approval.status === "pending").slice(-1)[0];
}

function latestUnansweredInput(detail) {
  const answered = new Set(
    (detail.events ?? [])
      .filter((event) => event.type === "workflow.input.received")
      .map((event) => String(event.data?.requestId ?? event.message ?? "")),
  );
  const event = (detail.events ?? [])
    .filter((candidate) => candidate.type === "workflow.input.required")
    .filter((candidate) => !answered.has(String(candidate.data?.id ?? candidate.message ?? "")))
    .sort((left, right) => right.seq - left.seq)[0];
  if (!event) return undefined;
  const choices = Array.isArray(event.data?.choices) ? event.data.choices : [];
  const selectedChoice = chooseRuntimeInputChoice(choices, event.message ?? event.data?.prompt);
  return {
    requestId: String(event.data?.id),
    choiceId: selectedChoice?.id ? String(selectedChoice.id) : undefined,
    answerText: selectedChoice?.value ? String(selectedChoice.value) : selectedChoice?.label ? String(selectedChoice.label) : undefined,
    prompt: event.message ?? event.data?.prompt,
  };
}

function chooseRuntimeInputChoice(choices, prompt) {
  if (!choices.length) return undefined;
  const preferred = [
    ...(scenario.runtimeChoicePreference ?? []),
    "looks good",
    "proceed",
    "continue",
    "approve",
    "approved",
    "yes",
    "done",
  ];
  const negative = ["adjust", "revise", "change", "cancel", "reject", "skip", "stop", "abort"];
  const promptText = String(prompt ?? "").toLowerCase();
  const scored = choices.map((choice, index) => {
    const text = `${choice.id ?? ""} ${choice.label ?? ""} ${choice.value ?? ""} ${choice.description ?? ""}`.toLowerCase();
    const positiveScore = preferred.reduce((sum, term) => sum + (text.includes(term.toLowerCase()) ? 20 : 0), 0);
    const negativeScore = negative.reduce((sum, term) => sum + (text.includes(term.toLowerCase()) ? 25 : 0), 0);
    const promptMatchScore = promptText.includes("adjust") && /looks good|proceed|approve|continue/.test(text) ? 20 : 0;
    return { choice, score: positiveScore + promptMatchScore - negativeScore - index };
  });
  scored.sort((left, right) => right.score - left.score);
  return scored[0]?.choice ?? choices[0];
}

function latestArtifactForThread(dashboard, threadId) {
  return (dashboard?.artifacts ?? [])
    .filter((artifact) => artifact.workflowThreadId === threadId)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0];
}

function latestRunForArtifact(dashboard, artifactId) {
  return (dashboard?.runs ?? [])
    .filter((run) => run.artifactId === artifactId)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0];
}

function assertScenarioEvidence(detail) {
  return assertWorkflowUiDogfoodEvidence(detail, {
    scenarioName,
    expectConfig: scenario.expect ?? {},
    maxRetainedRunEvents: scenario.maxRetainedRunEvents ?? maxRetainedRunEvents,
  });
}

async function assertScenarioSource(artifact) {
  const expectConfig = scenario.sourceExpect ?? {};
  const abstractionContract = scenario.abstractionContract;
  if (!scenario.sourceExpect && !abstractionContract) return undefined;
  if (!artifact.sourcePath) throw new Error(`Scenario ${scenarioName} requires generated source inspection, but artifact ${artifact.id} has no sourcePath.`);
  const source = await readFile(artifact.sourcePath, "utf8");
  const failures = [];
  for (const term of expectConfig.requiredTerms ?? []) {
    if (!source.includes(term)) failures.push(`expected generated source to include ${JSON.stringify(term)}`);
  }
  for (const terms of expectConfig.requiredAnyTerms ?? []) {
    if (!terms.some((term) => source.includes(term))) {
      failures.push(`expected generated source to include one of ${terms.map((term) => JSON.stringify(term)).join(", ")}`);
    }
  }
  for (const term of expectConfig.forbiddenTerms ?? []) {
    if (source.includes(term)) failures.push(`generated source must not include ${JSON.stringify(term)}`);
  }
  const manifestAssertions = assertArtifactManifest(
    artifact.manifest,
    mergeArtifactExpectation(expectConfig.manifest, abstractionContract?.manifest),
    failures,
  );
  const promptAssemblyAssertions = await assertArtifactPromptAssembly(
    artifact,
    mergeArtifactExpectation(expectConfig.promptAssembly, abstractionContract?.promptAssembly),
    failures,
  );
  const compileContextAssertions = await assertArtifactCompileContext(
    artifact,
    mergeArtifactExpectation(expectConfig.compileContext, abstractionContract?.compileContext),
    failures,
  );
  const validationReportAssertions = await assertArtifactValidationReport(
    artifact,
    mergeArtifactExpectation(expectConfig.validationReport, abstractionContract?.validationReport),
    failures,
  );
  const sourceAssertions = {
    passed: true,
    sourcePath: artifact.sourcePath,
    requiredTerms: expectConfig.requiredTerms ?? [],
    requiredAnyTerms: expectConfig.requiredAnyTerms ?? [],
    forbiddenTerms: expectConfig.forbiddenTerms ?? [],
    manifest: manifestAssertions,
    promptAssembly: promptAssemblyAssertions,
    compileContext: compileContextAssertions,
    validationReport: validationReportAssertions,
  };
  const abstractionContractAssertions = assertScenarioAbstractionContract(abstractionContract, sourceAssertions, failures);
  if (failures.length) {
    throw new Error(`Scenario ${scenarioName} generated source failed provenance gates: ${failures.join("; ")}`);
  }
  return {
    ...sourceAssertions,
    abstractionContract: abstractionContractAssertions,
  };
}

function mergeArtifactExpectation(primary, secondary) {
  if (!primary && !secondary) return undefined;
  const merged = { ...(secondary ?? {}), ...(primary ?? {}) };
  for (const key of [
    "requiredTools",
    "forbiddenTools",
    "requiredModuleIds",
    "forbiddenModuleIds",
    "forbiddenModuleFragments",
    "requiredRecipeIds",
    "forbiddenRecipeIds",
    "requiredRejectedRecipeIds",
    "requiredPolicyImplicationIds",
    "requiredValidatorIds",
    "requiredConnectorOperations",
    "forbiddenConnectorOperations",
  ]) {
    merged[key] = uniqueExpectationStrings(secondary?.[key], primary?.[key]);
    if (merged[key].length === 0) delete merged[key];
  }
  merged.requiredAnyTools = uniqueExpectationGroups(secondary?.requiredAnyTools, primary?.requiredAnyTools);
  if (merged.requiredAnyTools.length === 0) delete merged.requiredAnyTools;
  return merged;
}

function uniqueExpectationStrings(...values) {
  return [...new Set(values.flatMap((value) => (Array.isArray(value) ? value.map((item) => String(item)) : [])))];
}

function uniqueExpectationGroups(...values) {
  const groups = [];
  const seen = new Set();
  for (const value of values) {
    if (!Array.isArray(value)) continue;
    for (const group of value) {
      const normalized = (Array.isArray(group) ? group : [group]).map((item) => String(item));
      if (normalized.length === 0) continue;
      const key = JSON.stringify(normalized);
      if (seen.has(key)) continue;
      seen.add(key);
      groups.push(normalized);
    }
  }
  return groups;
}

function assertScenarioAbstractionContract(contract, sourceAssertions, failures) {
  if (!contract) return undefined;
  const promptAssembly = sourceAssertions.promptAssembly;
  const compileContext = sourceAssertions.compileContext;
  const validationReport = sourceAssertions.validationReport;
  const manifest = sourceAssertions.manifest;

  if (contract.promptAssembly && !promptAssembly) failures.push(`abstraction contract ${contract.id} expected prompt assembly metadata`);
  if (contract.compileContext && !compileContext) failures.push(`abstraction contract ${contract.id} expected compile context metadata`);
  if (contract.validationReport && !validationReport) failures.push(`abstraction contract ${contract.id} expected validation report metadata`);
  if (contract.manifest && !manifest) failures.push(`abstraction contract ${contract.id} expected manifest metadata`);

  const promptMetadata = promptAssemblyMetadataText(promptAssembly);
  for (const fragment of contract.forbiddenPromptAssemblyMetadataFragments ?? []) {
    if (promptMetadata.includes(String(fragment).toLowerCase())) {
      failures.push(`abstraction contract ${contract.id} prompt assembly metadata must not include fixture fragment ${JSON.stringify(fragment)}`);
    }
  }

  return {
    passed: true,
    id: contract.id,
    contractType: contract.contractType,
    proves: contract.proves ?? [],
    promptAssembly: promptAssembly
      ? {
          moduleCount: promptAssembly.moduleCount,
          moduleIds: promptAssembly.moduleIds,
          requiredModuleIds: contract.promptAssembly?.requiredModuleIds ?? [],
          forbiddenModuleFragments: contract.promptAssembly?.forbiddenModuleFragments ?? [],
          forbiddenMetadataFragments: contract.forbiddenPromptAssemblyMetadataFragments ?? [],
        }
      : undefined,
    compileContext: compileContext
      ? {
          selectedRecipeIds: compileContext.selectedRecipeIds,
          rejectedRecipeIds: compileContext.rejectedRecipeIds,
          policyImplicationIds: compileContext.policyImplicationIds,
          requiredRecipeIds: contract.compileContext?.requiredRecipeIds ?? [],
          requiredRejectedRecipeIds: contract.compileContext?.requiredRejectedRecipeIds ?? [],
        }
      : undefined,
    validationReport: validationReport
      ? {
          status: validationReport.status,
          validatorIds: validationReport.validatorIds,
          mutationPolicy: validationReport.evidence?.mutationPolicy,
          connectorOperations: validationReport.evidence?.connectorOperations ?? [],
          connectorWriteOperationCount: validationReport.evidence?.connectorWriteOperationCount,
        }
      : undefined,
    manifest: manifest
      ? {
          mutationPolicy: manifest.mutationPolicy,
          tools: manifest.tools,
          connectors: manifest.connectors?.map((connector) => ({
            connectorId: connector.connectorId,
            scopes: connector.scopes,
            operations: connector.operations,
          })) ?? [],
        }
      : undefined,
  };
}

function promptAssemblyMetadataText(promptAssembly) {
  const modules = promptAssembly?.moduleSummaries ?? [];
  return modules
    .flatMap((module) => [
      module.id,
      module.layer,
      module.scope,
      module.reason,
      ...(module.ruleIds ?? []),
      ...(module.selectedRecipeIds ?? []),
      ...(module.selectedToolNames ?? []),
      ...(module.selectedConnectorIds ?? []),
    ])
    .join("\n")
    .toLowerCase();
}

async function assertArtifactValidationReport(artifact, expectConfig, failures) {
  if (!expectConfig) return undefined;
  const validationReportPath = join(dirname(artifact.sourcePath), "validation-report.json");
  let validationReport;
  try {
    validationReport = JSON.parse(await readFile(validationReportPath, "utf8"));
  } catch (error) {
    failures.push(`expected validation report metadata at ${validationReportPath}: ${error.message}`);
    return undefined;
  }
  if (expectConfig.status && validationReport.status !== expectConfig.status) {
    failures.push(`expected validation report status ${expectConfig.status}, saw ${validationReport.status ?? "none"}`);
  }
  const validatorIds = Array.isArray(validationReport.validators)
    ? validationReport.validators.map((validator) => String(validator.id ?? ""))
    : [];
  for (const required of expectConfig.requiredValidatorIds ?? []) {
    if (!validatorIds.includes(required)) failures.push(`expected validation report validator ${required}`);
  }
  const failedValidatorIds = Array.isArray(validationReport.validators)
    ? validationReport.validators.filter((validator) => validator.status === "failed").map((validator) => String(validator.id ?? ""))
    : [];
  if (expectConfig.forbidFailedValidators && failedValidatorIds.length > 0) {
    failures.push(`expected no failed validators, saw ${failedValidatorIds.join(", ")}`);
  }
  const evidence = validationReport.evidence && typeof validationReport.evidence === "object" ? validationReport.evidence : {};
  if (expectConfig.mutationPolicy && evidence.mutationPolicy !== expectConfig.mutationPolicy) {
    failures.push(`expected validation report mutationPolicy ${expectConfig.mutationPolicy}, saw ${evidence.mutationPolicy ?? "none"}`);
  }
  if (typeof expectConfig.maxConnectorWriteOperationCount === "number") {
    const writeCount = Array.isArray(evidence.connectorWriteOperations) ? evidence.connectorWriteOperations.length : 0;
    if (writeCount > expectConfig.maxConnectorWriteOperationCount) {
      failures.push(`expected at most ${expectConfig.maxConnectorWriteOperationCount} connector write operations, saw ${writeCount}`);
    }
  }
  if (typeof expectConfig.maxConnectorCalls === "number") {
    const maxConnectorCalls = typeof evidence.maxConnectorCalls === "number" ? evidence.maxConnectorCalls : Number.POSITIVE_INFINITY;
    if (maxConnectorCalls > expectConfig.maxConnectorCalls) {
      failures.push(`expected validation report maxConnectorCalls <= ${expectConfig.maxConnectorCalls}, saw ${maxConnectorCalls}`);
    }
  }
  const connectorOperationNames = Array.isArray(evidence.connectorOperations)
    ? evidence.connectorOperations.map((operation) => `${operation.connectorId}.${operation.operation}`)
    : [];
  for (const required of expectConfig.requiredConnectorOperations ?? []) {
    if (!connectorOperationNames.includes(required)) failures.push(`expected validation report connector operation ${required}`);
  }
  for (const forbidden of expectConfig.forbiddenConnectorOperations ?? []) {
    if (connectorOperationNames.includes(forbidden)) failures.push(`validation report must not include connector operation ${forbidden}`);
  }
  return {
    path: validationReportPath,
    status: validationReport.status,
    validatorIds,
    failedValidatorIds,
    evidence: {
      mutationPolicy: evidence.mutationPolicy,
      maxConnectorCalls: evidence.maxConnectorCalls,
      connectorWriteOperationCount: Array.isArray(evidence.connectorWriteOperations) ? evidence.connectorWriteOperations.length : 0,
      connectorOperations: connectorOperationNames,
    },
  };
}

async function assertArtifactPromptAssembly(artifact, expectConfig, failures) {
  if (!expectConfig) return undefined;
  const promptAssemblyPath = join(dirname(artifact.sourcePath), "prompt-assembly.json");
  let promptAssembly;
  try {
    promptAssembly = JSON.parse(await readFile(promptAssemblyPath, "utf8"));
  } catch (error) {
    failures.push(`expected prompt assembly metadata at ${promptAssemblyPath}: ${error.message}`);
    return undefined;
  }
  const moduleIds = Array.isArray(promptAssembly.modules)
    ? promptAssembly.modules.map((module) => String(module.id ?? ""))
    : [];
  const moduleSummaries = Array.isArray(promptAssembly.modules)
    ? promptAssembly.modules.map((module) => ({
        id: String(module.id ?? ""),
        layer: String(module.layer ?? ""),
        scope: String(module.scope ?? ""),
        reason: String(module.reason ?? ""),
        ruleIds: Array.isArray(module.ruleIds) ? module.ruleIds.map((id) => String(id)) : [],
        selectedRecipeIds: Array.isArray(module.selectedRecipeIds) ? module.selectedRecipeIds.map((id) => String(id)) : [],
        selectedToolNames: Array.isArray(module.selectedToolNames) ? module.selectedToolNames.map((name) => String(name)) : [],
        selectedConnectorIds: Array.isArray(module.selectedConnectorIds) ? module.selectedConnectorIds.map((id) => String(id)) : [],
      }))
    : [];
  if (!moduleIds.length) failures.push("expected prompt assembly modules to be recorded");
  for (const required of expectConfig.requiredModuleIds ?? []) {
    if (!moduleIds.includes(required)) failures.push(`expected prompt assembly module ${required}`);
  }
  for (const forbidden of expectConfig.forbiddenModuleIds ?? []) {
    if (moduleIds.includes(forbidden)) failures.push(`prompt assembly must not include module ${forbidden}`);
  }
  for (const fragment of expectConfig.forbiddenModuleFragments ?? []) {
    const match = moduleIds.find((moduleId) => moduleId.includes(fragment));
    if (match) failures.push(`prompt assembly module ${match} must not include forbidden fragment ${fragment}`);
  }
  return {
    path: promptAssemblyPath,
    moduleCount: moduleIds.length,
    moduleIds,
    moduleSummaries,
    requiredModuleIds: expectConfig.requiredModuleIds ?? [],
    forbiddenModuleFragments: expectConfig.forbiddenModuleFragments ?? [],
  };
}

async function assertArtifactCompileContext(artifact, expectConfig, failures) {
  if (!expectConfig) return undefined;
  const compileContextPath = join(dirname(artifact.sourcePath), "compile-context.json");
  let compileContext;
  try {
    compileContext = JSON.parse(await readFile(compileContextPath, "utf8"));
  } catch (error) {
    failures.push(`expected compile context metadata at ${compileContextPath}: ${error.message}`);
    return undefined;
  }
  const selectedRecipeIds = Array.isArray(compileContext.selectedRecipes)
    ? compileContext.selectedRecipes.map((recipe) => String(recipe.id ?? ""))
    : [];
  const recipeSelection = compileContext.recipeSelection && typeof compileContext.recipeSelection === "object" ? compileContext.recipeSelection : undefined;
  const rejectedRecipeIds = Array.isArray(recipeSelection?.rejected)
    ? recipeSelection.rejected.map((recipe) => String(recipe.id ?? ""))
    : [];
  const policyImplicationIds = Array.isArray(recipeSelection?.policyImplications)
    ? recipeSelection.policyImplications.map((implication) => String(implication.id ?? ""))
    : [];
  for (const required of expectConfig.requiredRecipeIds ?? []) {
    if (!selectedRecipeIds.includes(required)) failures.push(`expected compile context selected recipe ${required}`);
  }
  for (const forbidden of expectConfig.forbiddenRecipeIds ?? []) {
    if (selectedRecipeIds.includes(forbidden)) failures.push(`compile context must not include selected recipe ${forbidden}`);
  }
  for (const required of expectConfig.requiredRejectedRecipeIds ?? []) {
    if (!rejectedRecipeIds.includes(required)) failures.push(`expected compile context rejected recipe ${required}`);
  }
  for (const required of expectConfig.requiredPolicyImplicationIds ?? []) {
    if (!policyImplicationIds.includes(required)) failures.push(`expected compile context recipe policy implication ${required}`);
  }
  if (typeof expectConfig.minSelectedRecipeCount === "number" && selectedRecipeIds.length < expectConfig.minSelectedRecipeCount) {
    failures.push(`expected at least ${expectConfig.minSelectedRecipeCount} selected recipes, saw ${selectedRecipeIds.length}`);
  }
  if (typeof expectConfig.maxSelectedRecipeCount === "number" && selectedRecipeIds.length > expectConfig.maxSelectedRecipeCount) {
    failures.push(`expected at most ${expectConfig.maxSelectedRecipeCount} selected recipes, saw ${selectedRecipeIds.length}`);
  }
  if (typeof expectConfig.minRejectedRecipeCount === "number" && rejectedRecipeIds.length < expectConfig.minRejectedRecipeCount) {
    failures.push(`expected at least ${expectConfig.minRejectedRecipeCount} rejected recipes, saw ${rejectedRecipeIds.length}`);
  }
  return {
    path: compileContextPath,
    selectedRecipeIds,
    rejectedRecipeIds,
    policyImplicationIds,
    requiredRecipeIds: expectConfig.requiredRecipeIds ?? [],
    requiredRejectedRecipeIds: expectConfig.requiredRejectedRecipeIds ?? [],
  };
}

function assertArtifactManifest(manifest, expectConfig, failures) {
  if (!expectConfig) return undefined;
  if (!manifest || typeof manifest !== "object") {
    failures.push("expected artifact manifest to be inspectable");
    return undefined;
  }
  if (expectConfig.mutationPolicy && manifest.mutationPolicy !== expectConfig.mutationPolicy) {
    failures.push(`expected manifest mutationPolicy ${expectConfig.mutationPolicy}, saw ${manifest.mutationPolicy ?? "none"}`);
  }
  const tools = Array.isArray(manifest.tools) ? manifest.tools : [];
  for (const required of expectConfig.requiredTools ?? []) {
    if (!tools.includes(required)) failures.push(`expected manifest tool ${required}`);
  }
  for (const requiredGroup of expectConfig.requiredAnyTools ?? []) {
    const values = Array.isArray(requiredGroup) ? requiredGroup.map(String) : [String(requiredGroup)];
    if (!values.some((tool) => tools.includes(tool))) failures.push(`expected one of manifest tools ${values.join(", ")}`);
  }
  for (const forbidden of expectConfig.forbiddenTools ?? []) {
    if (tools.includes(forbidden)) failures.push(`manifest must not grant tool ${forbidden}`);
  }
  const connectors = Array.isArray(manifest.connectors) ? manifest.connectors : [];
  for (const expected of expectConfig.connectors ?? []) {
    const grant = connectors.find((candidate) => candidate.connectorId === expected.connectorId);
    if (!grant) {
      failures.push(`expected manifest connector grant ${expected.connectorId}`);
      continue;
    }
    for (const operation of expected.requiredOperations ?? []) {
      if (!Array.isArray(grant.operations) || !grant.operations.includes(operation)) {
        failures.push(`expected manifest connector ${expected.connectorId} operation ${operation}`);
      }
    }
    for (const operation of expected.forbiddenOperations ?? []) {
      if (Array.isArray(grant.operations) && grant.operations.includes(operation)) {
        failures.push(`manifest connector ${expected.connectorId} must not grant operation ${operation}`);
      }
    }
    for (const scope of expected.requiredScopes ?? []) {
      if (!Array.isArray(grant.scopes) || !grant.scopes.includes(scope)) {
        failures.push(`expected manifest connector ${expected.connectorId} scope ${scope}`);
      }
    }
    for (const scope of expected.forbiddenScopes ?? []) {
      if (Array.isArray(grant.scopes) && grant.scopes.includes(scope)) {
        failures.push(`manifest connector ${expected.connectorId} must not grant scope ${scope}`);
      }
    }
  }
  return manifestEvidence(manifest);
}

function manifestEvidence(manifest) {
  if (!manifest || typeof manifest !== "object") return undefined;
  return {
    mutationPolicy: manifest.mutationPolicy,
    tools: Array.isArray(manifest.tools) ? manifest.tools : [],
    connectors: Array.isArray(manifest.connectors)
      ? manifest.connectors.map((connector) => ({
          connectorId: connector.connectorId,
          accountId: connector.accountId,
          scopes: connector.scopes,
          operations: connector.operations,
          dataRetention: connector.dataRetention,
        }))
      : [],
    maxToolCalls: manifest.maxToolCalls,
    maxConnectorCalls: manifest.maxConnectorCalls,
    maxModelCalls: manifest.maxModelCalls,
  };
}

async function launchApp() {
  const child = spawn("pnpm", ["exec", "electron-vite", "dev", "--remoteDebuggingPort", String(port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...launchConfig.env,
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  children.add(child);
  child.once("exit", () => children.delete(child));
  child.stdout.on("data", (chunk) => appOutput.push(chunk.toString("utf8")));
  child.stderr.on("data", (chunk) => appOutput.push(chunk.toString("utf8")));
  const target = await waitForPageEndpoint(port);
  const cdp = await connectCdp(target.webSocketDebuggerUrl);
  await command(cdp, "Page.enable");
  await command(cdp, "Runtime.enable");
  await command(cdp, "Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 920,
    deviceScaleFactor: 1,
    mobile: false,
  });
  return { child, cdp };
}

async function desktopState(cdp) {
  return evaluate(cdp, "window.ambientDesktop.bootstrap()", { timeoutMs: 60_000 });
}

async function ensureScenarioPermissionMode(cdp, state) {
  const permissionMode = scenarioPermissionMode();
  if (!permissionMode) return;
  const activeThreadId = state?.activeThreadId;
  if (!activeThreadId) throw new Error(`Scenario ${scenarioName} requires ${permissionMode} permission mode but the active thread id is unavailable.`);
  const activeThread = state.threads?.find((thread) => thread.id === activeThreadId);
  if (activeThread?.permissionMode === permissionMode) return;
  await liveStep(
    cdp,
    `set scenario permission mode ${permissionMode}`,
    `window.ambientDesktop.requestThreadPermissionModeChange(${JSON.stringify({
      threadId: activeThreadId,
      permissionMode,
      reason: `Workflow UI dogfood scenario ${scenarioName} requires deterministic ${permissionMode} validation in temp snapshot state.`,
    })})`,
    { timeoutMs: 60_000 },
  );
}

async function ensureWorkflowThreadPermissionMode(cdp, thread) {
  const permissionMode = scenarioPermissionMode();
  if (!permissionMode) return thread;
  const ensuredThread = await liveStep(
    cdp,
    `ensure workflow chat thread for ${permissionMode}`,
    `window.ambientDesktop.ensureWorkflowAgentChatThread(${JSON.stringify({ workflowThreadId: thread.id })})`,
    { timeoutMs: 60_000 },
  );
  const chatThreadId = ensuredThread?.chatThreadId;
  if (!chatThreadId) throw new Error(`Workflow thread ${thread.id} did not expose an associated chat thread for ${permissionMode} mode.`);
  await liveStep(
    cdp,
    `set workflow chat permission mode ${permissionMode}`,
    `window.ambientDesktop.requestThreadPermissionModeChange(${JSON.stringify({
      threadId: chatThreadId,
      permissionMode,
      reason: `Workflow UI dogfood scenario ${scenarioName} runs the workflow chat thread in deterministic ${permissionMode} mode.`,
    })})`,
    { timeoutMs: 60_000 },
  );
  return ensuredThread;
}

async function clickButtonText(cdp, text) {
  await clickText(cdp, text, { buttonOnly: true });
}

async function clickText(cdp, text, options = {}) {
  const result = await evaluate(
    cdp,
    `(() => {
      const text = ${JSON.stringify(text)};
      const buttonOnly = ${JSON.stringify(Boolean(options.buttonOnly))};
      const candidates = Array.from(document.querySelectorAll(buttonOnly ? 'button, [role="button"]' : 'button, [role="button"], a, [data-panel-target], .thread-list-item, .task-row, article'));
      const exact = candidates.find((el) => (el.textContent || '').trim() === text);
      const partial = candidates.find((el) => (el.textContent || '').includes(text));
      const target = exact || partial;
      if (!target) return { clicked: false, candidates: candidates.slice(0, 25).map((el) => (el.textContent || '').trim()).filter(Boolean) };
      target.scrollIntoView({ block: 'center', inline: 'center' });
      target.click();
      return { clicked: true, text: (target.textContent || '').trim().slice(0, 120) };
    })()`,
    { timeoutMs: 30_000 },
  );
  if (!result?.clicked) {
    throw new Error(`Could not click text "${text}". Visible candidates: ${(result?.candidates ?? []).join(" | ")}`);
  }
}

async function captureScreenshot(cdp, name) {
  const response = await command(cdp, "Page.captureScreenshot", { format: "png", fromSurface: true });
  const bytes = Buffer.from(response.data, "base64");
  const fileName = `${new Date().toISOString().replace(/[:.]/g, "-")}-${name}.png`;
  const path = join(screenshotsDir, fileName);
  await writeFile(path, bytes);
  return {
    name,
    path,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

async function collectFailureEvidence(cdp) {
  const ui = await evaluate(
    cdp,
    `(() => ({
      title: document.title,
      url: location.href,
      bodyTextPreview: document.body?.innerText?.slice(0, 8000) ?? "",
      activeMode: document.querySelector('[data-mode]')?.getAttribute('data-mode') ?? "",
      activeBuildPanel: document.querySelector('[data-workflow-build-panel]')?.getAttribute('data-workflow-build-panel') ?? "",
      activeRunsPanel: document.querySelector('[data-workflow-runs-panel]')?.getAttribute('data-workflow-runs-panel') ?? "",
      hasDiagram: Boolean(document.querySelector('.workflow-persistent-diagram-pane')),
      visibleChars: document.body?.innerText?.length ?? 0,
      textHotspots: Array.from(document.querySelectorAll('[data-mode], section, article, main, aside'))
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          id: element.id || "",
          className: typeof element.className === "string" ? element.className.slice(0, 160) : "",
          dataMode: element.getAttribute("data-mode") || "",
          dataPanel:
            element.getAttribute("data-workflow-build-panel") ||
            element.getAttribute("data-workflow-runs-panel") ||
            element.getAttribute("data-workflow-schedules-panel") ||
            "",
          chars: (element.innerText || "").length,
        }))
        .filter((entry) => entry.chars > 0)
        .sort((a, b) => b.chars - a.chars)
        .slice(0, 12),
    }))()`,
    { timeoutMs: 30_000 },
  );
  const screenshot = await captureScreenshot(cdp, "failure");
  return { ui, screenshot };
}

async function evaluate(cdp, expression, options = {}) {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const response = await command(
    cdp,
    "Runtime.evaluate",
    {
      expression,
      awaitPromise: true,
      returnByValue: true,
      timeout: timeoutMs,
    },
    timeoutMs,
  );
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.text || response.exceptionDetails.exception?.description || "Runtime.evaluate failed");
  }
  return response.result?.value;
}

async function waitFor(cdp, predicate, description, timeoutMs = 30_000, args = []) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      const result = await evaluate(
        cdp,
        `(${predicate.toString()})(...${JSON.stringify(args)})`,
        { timeoutMs: Math.min(10_000, timeoutMs) },
      );
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ""}`);
}

async function waitForPageEndpoint(debugPort) {
  const started = Date.now();
  while (Date.now() - started < 60_000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1_500);
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`, { signal: controller.signal });
      const targets = await response.json();
      const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
      if (page) return page;
    } catch {
      // Electron is still starting.
    } finally {
      clearTimeout(timer);
    }
    await delay(300);
  }
  throw new Error(`Timed out waiting for Electron CDP endpoint on port ${debugPort}.`);
}

async function connectCdp(url) {
  const ws = new WebSocket(url);
  await new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => rejectPromise(new Error(`Timed out connecting to ${url}`)), 15_000);
    ws.addEventListener("open", () => {
      clearTimeout(timer);
      resolvePromise();
    }, { once: true });
    ws.addEventListener("error", (event) => {
      clearTimeout(timer);
      rejectPromise(new Error(`CDP websocket error: ${event.message ?? "unknown"}`));
    }, { once: true });
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data);
    if (!payload.id) return;
    const entry = pending.get(payload.id);
    if (!entry) return;
    pending.delete(payload.id);
    clearTimeout(entry.timer);
    if (payload.error) entry.reject(new Error(payload.error.message));
    else entry.resolve(payload.result ?? {});
  });
  return {
    close: () => ws.close(),
    send(method, params = {}, timeoutMs = 30_000) {
      const messageId = ++id;
      ws.send(JSON.stringify({ id: messageId, method, params }));
      return new Promise((resolvePromise, rejectPromise) => {
        const timer = setTimeout(() => {
          pending.delete(messageId);
          rejectPromise(new Error(`${method} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        pending.set(messageId, { resolve: resolvePromise, reject: rejectPromise, timer });
      });
    },
  };
}

function command(cdp, method, params = {}, timeoutMs = 30_000) {
  return cdp.send(method, params, timeoutMs);
}

async function terminateProcessTree(child) {
  if (!child || child.killed) return;
  try {
    if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGTERM");
    else child.kill("SIGTERM");
  } catch {
    // Process already exited.
  }
  await delay(1200);
  try {
    if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL");
    else child.kill("SIGKILL");
  } catch {
    // Process already exited.
  }
}

async function writeReport(data) {
  await mkdir(scenarioReportRoot, { recursive: true });
  await mkdir(harnessReportRoot, { recursive: true });
  await mkdir(reportRoot, { recursive: true });
  await writeFile(join(harnessReportRoot, "report.json"), `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await writeFile(join(scenarioReportRoot, "latest.json"), `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await writeFile(join(reportRoot, `${scenarioName}.json`), `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await writeFile(join(reportRoot, "latest.json"), `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function compactReport(data) {
  const abstractionContract = data.abstractionContract ?? data.sourceAssertions?.abstractionContract;
  return {
    ok: data.ok,
    scenario: data.scenario,
    harness: data.harness,
    launch: data.launch,
    thread: data.thread?.title,
    artifact: data.artifact?.title,
    runStatus: data.run?.status,
    runEvidence: data.runEvidence,
    scenarioAssertions: data.scenarioAssertions?.passed,
    abstractionContract: abstractionContract
      ? {
          id: abstractionContract.id,
          contractType: abstractionContract.contractType,
          promptModules: abstractionContract.promptAssembly?.moduleIds,
          selectedRecipes: abstractionContract.compileContext?.selectedRecipeIds,
          validators: abstractionContract.validationReport?.validatorIds,
          mutationPolicy: abstractionContract.manifest?.mutationPolicy ?? abstractionContract.validationReport?.mutationPolicy,
        }
      : undefined,
    uiAssertions: data.uiAssertions?.passed,
    screenshots: (data.screenshots ?? []).map((shot) => basename(shot.path)),
  };
}

function classifyDogfoodFailure(errorMessageText, failureEvidence) {
  const text = `${errorMessageText}\n${JSON.stringify(failureEvidence ?? {})}`;
  if (/llama-server was not found|AMBIENT_MINICPM_V_LLAMA_SERVER|MiniCPM-V runtime|needs-runtime/i.test(text)) {
    return "environment/snapshot issue";
  }
  if (/Workflow connector is not available|not_configured|connecting|expired|revoked|Google.*not configured|Gmail.*not configured|Gmail.*not available|OAuth|connector auth/i.test(text)) {
    return "environment/snapshot issue";
  }
  if (/\b429\b|rate limit|did not start streaming|stream stalled|provider idle|no-stream/i.test(text)) {
    return "provider-degraded";
  }
  if (/timed out waiting|CDP|Electron|Runtime\.evaluate|renderer poll|Could not find an actionable failed event|permission prompt/i.test(text)) {
    return "test harness failure";
  }
  if (/Scenario evidence assertions failed|generated source failed provenance gates|Expected workflow run to succeed|Compile failed|workflow run .* failed/i.test(text)) {
    return "product failure";
  }
  return "unclassified";
}

function harnessReportMetadata() {
  return {
    name: harnessName,
    runId: harnessRunId,
    reportPath: join(harnessReportRoot, "report.json"),
    scenarioLatestPath: join(scenarioReportRoot, "latest.json"),
    snapshotMode: stateDirs.snapshotMode,
    snapshotRootLabel: stateDirs.snapshotRootLabel,
    snapshotRootPathDigest: stateDirs.snapshotRootPathDigest,
    pathsAreMachineLocal: true,
  };
}

function safeFilePart(value) {
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140) || "workflow-ui-dogfood-run";
}

function outputTail() {
  return appOutput.join("").split("\n").slice(-160).join("\n");
}

function pick(value, keys) {
  if (!value) return undefined;
  return Object.fromEntries(keys.map((key) => [key, value[key]]).filter(([, item]) => item !== undefined));
}

function valueForArg(name) {
  const prefix = `${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

function envFlag(value) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

function permissionModeForValue(value) {
  if (value === undefined || value === null || String(value).trim() === "") return undefined;
  const normalized = String(value).trim();
  if (normalized === "full-access" || normalized === "workspace") return normalized;
  throw new Error(`Unsupported workflow UI dogfood permission mode ${JSON.stringify(value)}. Expected full-access or workspace.`);
}

function scenarioPermissionMode() {
  return forcedPermissionMode ?? scenario.permissionMode;
}

function browserSourcePromptAssemblyModuleIds() {
  return planDslCompilerDogfood
    ? ["core-workflow-plan-dsl-semantics", "workflow-plan-dsl-selected-capabilities"]
    : ["capability-guidance-browser-source-provenance", "capability-guidance-browser-user-action-intervention"];
}

function currentWebRecipePromptAssemblyModuleIds() {
  return planDslCompilerDogfood
    ? ["core-workflow-plan-dsl-semantics", "workflow-plan-dsl-selected-recipes", "workflow-plan-dsl-selected-capabilities"]
    : ["recipe-current_web_research", "recipe-large_collection_summarization", "recipe-staged_document_export"];
}

function localFilePromptAssemblyModuleIds() {
  return planDslCompilerDogfood
    ? ["core-workflow-plan-dsl-semantics", "workflow-plan-dsl-selected-capabilities"]
    : ["capability-selected-desktop-tools", "dynamic-user-request"];
}

function tinyPng() {
  return Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64");
}

function delay(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}
