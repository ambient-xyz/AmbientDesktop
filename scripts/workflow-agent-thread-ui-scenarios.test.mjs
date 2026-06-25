import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const workflowUiDogfoodSourcePaths = [
  "./workflow-agent-thread-ui-dogfood.mjs",
  "./workflow-agent-thread-ui-local-scenarios.mjs",
  "./workflow-agent-thread-ui-connector-scenarios.mjs",
  "./workflow-agent-thread-ui-public-scenarios.mjs",
];

describe("Workflow Agent V3 UI dogfood scenario catalog", () => {
  it("keeps bounded scenarios for model, local-file, and public-browser workflow shapes", async () => {
    const source = await readWorkflowUiDogfoodSourceSurface();

    expect(source).toContain('"vocabulary-quiz"');
    expect(source).toContain("Use only the selected Ambient model as the source of vocabulary knowledge.");
    expect(source).toContain("account connectors, external accounts, workspace files, or connector metadata");
    expect(source).toContain("AMBIENT_WORKFLOW_UI_DOGFOOD_SCENARIO");
    expect(source).toContain("normalizeDogfoodProjectRegistry");
    expect(source).toContain('"local-file-classifier"');
    expect(source).toContain("uses the file_read workflow tool");
    expect(source).toContain("Forbidden external sources: Google Drive, Google Workspace, google.drive, google_workspace_call");
    expect(source).toContain('allowDiscoveryAccessCapabilities: ["file_content"]');
    expect(source).toContain("resolveDiscoveryAccessRequests");
    expect(source).toContain("Use those relative paths exactly");
    expect(source).toContain("not a quiz, study-card, flashcard, tutoring, lesson, or interactive_model_study_card recipe workflow");
    expect(source).toContain("maxSelectedRecipeCount: 0");
    expect(source).toContain("requiredRejectedRecipeIds: [");
    expect(source).toContain('"interactive_model_study_card"');
    expect(source).toContain('"downloads-document-categorization"');
    expect(source).toContain("Project 1");
    expect(source).toContain("seeded Downloads fixture directory");
    expect(source).toContain("local_directory_list exactly once");
    expect(source).toContain("Use metadata only");
    expect(source).toContain("Carry local_directory_list.skipped into the inventory checkpoint");
    expect(source).toContain('requiredToolMessages: ["local_directory_list"]');
    expect(source).toContain("exactToolMessageCounts: { local_directory_list: 1 }");
    expect(source).toContain(
      'forbiddenToolMessages: ["local_file_read", "file_read", "file_write", "bash", "browser_search", "browser_nav", "browser_content", "google_workspace_call"]',
    );
    expect(source).toContain('requiredFinalOutputTerms: ["hidden", "secret"]');
    expect(source).toContain('"readPath(outputs["');
    expect(source).toContain("tax-receipts-2025.pdf");
    expect(source).toContain("credentials.txt");
    expect(source).toContain('"downloads-image-categorization"');
    expect(source).toContain("Project 2");
    expect(source).toContain("Downloads Image Categorization Workflow UI Dogfood");
    expect(source).toContain("ambient_visual_analyze exactly once per selected image");
    expect(source).toContain("Do not use filename-only or metadata-only categorization");
    expect(source).toContain("image-01-workflow-discovery.png");
    expect(source).toContain("zz-corrupt-photo.jpg");
    expect(source).toContain("exactToolMessageCounts: { local_directory_list: 1, ambient_visual_analyze: 10 }");
    expect(source).toContain('"tools.ambient_visual_analyze"');
    expect(source).toContain('"tools.ambient_visual_minicpm_setup"');
    expect(source).toContain('"gmail-300-readonly-categorization"');
    expect(source).toContain("Project 3");
    expect(source).toContain("latest 300 Gmail messages");
    expect(source).toContain("connector.paginate with connectorId google.gmail");
    expect(source).toContain("connector.map with connectorId google.gmail");
    expect(source).toContain("operation readThread");
    expect(source).toContain("collection.map to compact");
    expect(source).toContain("model.map over chunks");
    expect(source).toContain("model.reduce");
    expect(source).toContain('requiredConnectorMessages: ["google.gmail.search", "google.gmail.readThread"]');
    expect(source).toContain('maxConnectorMessageCounts: { "google.gmail.search": 3, "google.gmail.readThread": 300 }');
    expect(source).toContain('"gmail.readonly"');
    expect(source).toContain('"gmail.compose"');
    expect(source).toContain('operation: "createDraft"');
    expect(source).toContain("assertArtifactManifest");
    expect(source).toContain('"gmail-1000-metadata-first-gate"');
    expect(source).toContain("Project 4");
    expect(source).toContain("latest 1,000 Gmail messages");
    expect(source).toContain("metadata-first plan");
    expect(source).toContain("maxPages 10, maxItems 1000");
    expect(source).toContain("Do not use google.gmail.readThread");
    expect(source).toContain("model.reduce with strategy tree");
    expect(source).toContain("include a review.input gate");
    expect(source).toContain("workflow.askUser");
    expect(source).toContain("maxConnectorEnds: 10");
    expect(source).toContain('exactConnectorMessageCounts: { "google.gmail.readThread": 0 }');
    expect(source).toContain('requiredConnectorMessages: ["google.gmail.search"]');
    expect(source).toContain('"google-transcript-action-items"');
    expect(source).toContain("Project 5");
    expect(source).toContain("Google meeting transcripts");
    expect(source).toContain("2026-05-02T00:00:00-07:00");
    expect(source).toContain("2026-05-16T23:59:59-07:00");
    expect(source).toContain("connectorId google.calendar and operation listEvents");
    expect(source).toContain("connectorId google.drive and operation search");
    expect(source).toContain("operation readFile");
    expect(source).toContain("exportMimeType text/plain");
    expect(source).toContain("maxContentChars 1000");
    expect(source).toContain("long_context_process with taskType extraction");
    expect(source).toContain('requiredToolMessages: ["long_context_process"]');
    expect(source).toContain("exactToolMessageCounts: { long_context_process: 1 }");
    expect(source).toContain('requiredConnectorMessages: ["google.calendar.listEvents", "google.drive.search", "google.drive.readFile"]');
    expect(source).toContain('"calendar.readonly"');
    expect(source).toContain('"drive.readonly"');
    expect(source).toContain('"drive.file"');
    expect(source).toContain('"scottsdale-real-estate-100-source-pdf"');
    expect(source).toContain("Project 6");
    expect(source).toContain("maxRetainedRunEvents: 650");
    expect(source).toContain("100 public web source candidates");
    expect(source).toContain("2026-05-17");
    expect(source).toContain("America/Phoenix");
    expect(source).toContain("tool.paginate with exactly 10 pageQueries");
    expect(source).toContain("requiredAnyTerms: [");
    expect(source).toContain('["Scottsdale real estate market", "Scottsdale AZ real estate market"]');
    expect(source).toContain("strategy url_canonical");
    expect(source).toContain("model.reduce with strategy tree");
    expect(source).toContain("document.render format pdf");
    expect(source).toContain("stage a file_write mutation");
    expect(source).toContain("Documents/scottsdale-real-estate-research-report.pdf");
    expect(source).toContain("minDocumentRenderEnds: 1");
    expect(source).toContain('requiredDocumentRenderFormats: ["pdf"]');
    expect(source).toContain("exactToolMessageCounts: { browser_search: 10, file_write: 1 }");
    expect(source).toContain('allowedWriteToolMessages: ["file_write"]');
    expect(source).toContain('"current-web-recipe-report"');
    expect(source).toContain("example-domain-current-web-report.md");
    expect(source).toContain("requiredModuleIds: currentWebRecipePromptAssemblyModuleIds()");
    expect(source).toContain('["recipe-current_web_research", "recipe-large_collection_summarization", "recipe-staged_document_export"]');
    expect(source).toContain('requiredRecipeIds: ["current_web_research", "large_collection_summarization", "staged_document_export"]');
    expect(source).toContain('"recipe.current_web_research.source_evidence"');
    expect(source).toContain('"recipe.large_collection_summarization.budget"');
    expect(source).toContain('"recipe.staged_document_export.approval_gate"');
    expect(source).toContain("minSelectedRecipeCount: 3");
    expect(source).toContain("minRejectedRecipeCount: 2");
    expect(source).toContain('"maxItems": 6');
    expect(source).toContain('"maxPages": 2');
    expect(source).toContain('requiredDocumentRenderFormats: ["markdown"]');
    expect(source).toContain('"movie-tonight-recommendation"');
    expect(source).toContain("Project 7");
    expect(source).toContain("recommend whether a couple in Scottsdale, Arizona should go to a movie tonight");
    expect(source).toContain("Sunday, 2026-05-17");
    expect(source).toContain("tool.paginate with exactly 4 pageQueries");
    expect(source).toContain("tonight's Scottsdale showtimes/currently playing movies");
    expect(source).toContain("reviews and ratings signals");
    expect(source).toContain("theater/parking/dinner/travel friction");
    expect(source).toContain("Ask one review.input preference question");
    expect(source).toContain("model.reduce with strategy tree, maxFanIn 4, maxLevels 1");
    expect(source).toContain("The final output must include the location Scottsdale, Arizona");
    expect(source).toContain("exactToolMessageCounts: { browser_search: 4 }");
    expect(source).toContain("workflow.askUser");
    expect(source).toContain('"maxItems": 40');
    expect(source).toContain('"maxPages": 4');
    expect(source).toContain('mutationPolicy: "read_only"');
    expect(source).toContain('"public-source-browser"');
    expect(source).toContain("https://example.com");
    expect(source).toContain("https://www.iana.org/help/example-domains");
    expect(source).toMatch(/"public-source-browser":\s*\{[\s\S]*?permissionMode:\s*"full-access"/);
    expect(source).toContain('"flaky-browser-recovery"');
    expect(source).toContain("https://workflow-dogfood-invalid.invalid/recovery-check");
    expect(source).toContain("partial coverage");
    expect(source).toContain('permissionMode: "full-access"');
    expect(source).toContain("Do not add a later browser_content loop over the active page");
    expect(source).toContain("actual fetch-sources items/results");
    expect(source).toContain('actions: ["retry_step", "skip_item"]');
    expect(source).toContain('requiredRecoveryActions: ["retry_step", "skip_item"]');
    expect(source).toContain('requiredSkippedItemKeys: ["bad-source"]');
    expect(source).toContain('requiredToolFamilies: ["browser_"]');
    expect(source).toContain('requiredAnyToolMessages: [["browser_nav", "browser_content"]]');
    expect(source).toContain('requiredAnyTools: [["browser_nav", "browser_content"]]');
    expect(source).toContain("uniqueExpectationGroups");
    expect(source).toContain("merged.requiredAnyTools = uniqueExpectationGroups");
    expect(source).toContain('"fetchResults": readPath(outputs["fetch-sources"], "items")');
    expect(source).toContain("tools.browser_content({  })");
    expect(source).toContain('requiredToolMessages: ["file_read"]');
    expect(source).toContain('forbiddenToolMessages: ["browser_search", "browser_nav", "browser_content", "file_write"]');
    expect(source).toContain("promptAssembly: {");
    expect(source).toContain(
      'forbiddenModuleFragments: ["browser", "gmail", "google-workspace", "current-data", "movie-night", "visual-analysis"]',
    );
    expect(source).toContain('id: "capability-only-local-file-readonly"');
    expect(source).toContain('id: "connector-metadata-first-gmail-readonly"');
    expect(source).toContain('id: "capability-browser-source-readonly"');
    expect(source).toContain('id: "recipe-stack-current-web-staged-export"');
    expect(source).toContain("selected desktop file capability guidance is sufficient");
    expect(source).toContain("current public research uses the current_web_research recipe");
    expect(source).toContain("abstractionContract: sourceAssertions?.abstractionContract");
    expect(source).toContain("abstractionContract: abstractionContract");
  });
});

async function readWorkflowUiDogfoodSourceSurface() {
  const sources = await Promise.all(
    workflowUiDogfoodSourcePaths.map((sourcePath) => readFile(new URL(sourcePath, import.meta.url), "utf8")),
  );
  const source = sources.join("\n");
  const compactSource = source.replace(/\s+/g, " ").replace(/\[\s+/g, "[").replace(/\s+\]/g, "]").replace(/,\]/g, "]");
  return `${source}\n${compactSource}`;
}
