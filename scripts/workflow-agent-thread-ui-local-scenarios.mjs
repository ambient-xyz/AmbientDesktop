import { cp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export function createWorkflowAgentThreadUiLocalScenarios({ workspace, planDslCompilerDogfood }) {
  function localFilePromptAssemblyModuleIds() {
    return planDslCompilerDogfood
      ? ["core-workflow-plan-dsl-semantics", "workflow-plan-dsl-selected-capabilities"]
      : ["capability-selected-desktop-tools", "dynamic-user-request"];
  }

  function tinyPng() {
    return Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64");
  }

  return {
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
      answerPreference: [
        "model only",
        "no connector",
        "no account",
        "no browser",
        "no network",
        "no file",
        "no write",
        "output card",
        "quiz",
        "html",
        "freeform",
        "multiple",
      ],
      runtimeChoicePreference: ["first option", "closest", "continue", "proceed", "submit", "answer"],
      runtimeAnswer:
        "I think the first option is closest. Please continue and produce a concise study card with Definition, Etymology, and Example sentences sections.",
      expect: {
        minModelCalls: 1,
        minRuntimeInputs: 1,
        minRuntimeInputResponses: 1,
        minOutputSignals: 1,
        minFinalOutputChars: 120,
        requiredFinalOutputAnyTerms: [
          ["definition", "meaning"],
          ["example", "sentence"],
        ],
        forbiddenToolMessages: [
          "browser_search",
          "browser_nav",
          "browser_content",
          "file_read",
          "file_write",
          "google_workspace_call",
          "local_directory_list",
        ],
        forbiddenToolFamilies: ["browser_", "google."],
      },
      sourceExpect: {
        requiredTerms: ["workflow.askUser", "workflow.output"],
        forbiddenTerms: [
          "tools.browser_",
          "tools.file_read",
          "tools.file_write",
          "google_workspace_call",
          "local_directory_list",
          "workspace.inventory",
        ],
        manifest: {
          forbiddenTools: [
            "browser_search",
            "browser_nav",
            "browser_content",
            "file_read",
            "file_write",
            "google_workspace_call",
            "local_directory_list",
          ],
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
      answerPreference: [
        "local desktop file_read",
        "classification report",
        "not study card",
        "not google drive",
        "no connector",
        "no recipe",
        "local",
        "file",
        "html",
        "feedback",
        "read only",
      ],
      allowDiscoveryAccessCapabilities: ["file_content"],
      runtimeChoicePreference: ["looks good", "proceed", "approve", "approved", "continue", "as-is", "final"],
      runtimeAnswer: "The categories look reasonable. Please keep them concise and produce the final HTML report.",
      seedWorkspace: async (root) => {
        const notesDir = join(root, "dogfood-notes");
        await mkdir(notesDir, { recursive: true });
        await writeFile(
          join(notesDir, "family-events.md"),
          "# Family events\n\nPool day, library story time, and a weekend hike.\n",
          "utf8",
        );
        await writeFile(
          join(notesDir, "admin.md"),
          "# Admin\n\nRenew parking permit, archive tax receipts, and confirm appointments.\n",
          "utf8",
        );
        await writeFile(
          join(notesDir, "learning.md"),
          "# Learning\n\nVocabulary practice, flash cards, and short reading summaries.\n",
          "utf8",
        );
      },
      expect: {
        minModelCalls: 1,
        minRuntimeInputs: 1,
        minRuntimeInputResponses: 1,
        minOutputSignals: 1,
        minCheckpoints: 1,
        minFinalOutputChars: 160,
        requiredFinalOutputAnyTerms: [
          ["family", "events"],
          ["admin", "permit"],
          ["learning", "vocabulary"],
        ],
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
          forbiddenRecipeIds: [
            "large_collection_summarization",
            "interactive_model_study_card",
            "current_web_research",
            "staged_document_export",
          ],
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
        await writeFile(
          join(downloadsDir, "family-road-trip-itinerary.md"),
          "# Family Road Trip\n\nFlagstaff hotels and packing checklist.\n",
          "utf8",
        );
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
        forbiddenToolMessages: [
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
        requiredFinalOutputTerms: ["hidden", "secret"],
        requiredFinalOutputAnyTerms: [
          ["finance", "tax", "receipt", "budget"],
          ["travel", "itinerary", "trip"],
          ["learning", "vocabulary"],
          ["household", "insurance", "home"],
          ["recipe", "food", "meal"],
          ["skipped", "ignored", "hidden", "secret"],
        ],
      },
      sourceExpect: {
        requiredTerms: ["tools.local_directory_list", "maxDepth", "maxEntries", "readPath(outputs[", "skippedMetadata"],
        forbiddenTerms: [
          "tools.local_file_read",
          "tools.file_read",
          "tools.file_write",
          "tools.bash",
          "tools.browser_",
          "google_workspace_call",
        ],
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
      runtimeAnswer:
        "Use the visual observations from ambient_visual_analyze, keep the categories concise, and clearly state coverage for all 10 selected images.",
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
        requiredTerms: [
          "tools.local_directory_list",
          "tools.ambient_visual_analyze",
          "image_description",
          "allowExternalMediaPaths",
          "readPath(outputs[",
        ],
        forbiddenTerms: [
          "tools.local_file_read",
          "tools.file_read",
          "tools.file_write",
          "tools.bash",
          "tools.browser_",
          "google_workspace_call",
          "tools.ambient_visual_minicpm_setup",
        ],
      },
    },
  };
}
