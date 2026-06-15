import { describe, expect, it } from "vitest";
import {
  selectWorkflowCompilerRecipePlan,
  selectWorkflowCompilerRecipes,
  workflowCompilerRecipeDefinitions,
} from "./workflowCompilerRecipes";

describe("workflow compiler recipes", () => {
  it("defines typed reusable recipes with stable metadata", () => {
    const recipes = workflowCompilerRecipeDefinitions();
    const ids = recipes.map((recipe) => recipe.id);

    expect(ids).toEqual([
      "interactive_model_study_card",
      "large_collection_summarization",
      "current_web_research",
      "movie_night_current_showtimes",
      "metadata_first_personal_data_review",
      "google_meeting_transcript_action_items",
      "visual_batch_classification",
      "staged_document_export",
      "browser_item_recovery",
    ]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(recipes.every((recipe) => recipe.summary.length > 24)).toBe(true);
    expect(recipes.every((recipe) => recipe.applicabilityTags.length > 0)).toBe(true);
    expect(recipes.every((recipe) => recipe.validatorRefs.length > 0)).toBe(true);
    expect(recipes.every((recipe) => Object.keys(recipe.irExample).length > 0)).toBe(true);
  });

  it("uses explicit item references in collection.map recipe examples", () => {
    const recipes = workflowCompilerRecipeDefinitions();
    const collectionMapNodes = recipes.flatMap((recipe) =>
      Array.isArray(recipe.irExample.nodes)
        ? recipe.irExample.nodes
            .filter((node): node is { kind: "collection.map"; map: unknown } => Boolean(node && typeof node === "object" && (node as { kind?: unknown }).kind === "collection.map"))
            .map((node) => ({ recipeId: recipe.id, map: node.map }))
        : [],
    );

    const bareStringMaps = collectionMapNodes.flatMap(({ recipeId, map }) => collectionMapBareStringPaths(map, recipeId));

    expect(bareStringMaps).toEqual([]);
  });

  it("uses registry handles for recipe-owned prior-output edges", () => {
    const recipes = workflowCompilerRecipeDefinitions();
    const serializedExamples = recipes.map((recipe) => JSON.stringify(recipe.irExample)).join("\n");

    expect(serializedExamples).toContain('"fromHandle":"searchSources.items"');
    expect(serializedExamples).toContain('"fromHandle":"render.artifactPath"');
    expect(serializedExamples).toContain('"fromHandle":"stageWrite.path"');
    expect(serializedExamples).toContain('"fromHandle":"candidateTranscripts.items"');
    expect(serializedExamples).not.toContain('"fromNode":');
  });

  it("guides provided-URL browser recovery toward direct browser reads instead of search", () => {
    const recipe = workflowCompilerRecipeDefinitions().find((definition) => definition.id === "browser_item_recovery");
    const example = JSON.stringify(recipe?.irExample);

    expect(recipe?.promptGuidance).toContain("When URLs are already provided or browser_search is forbidden");
    expect(recipe?.promptGuidance).toContain("browser_nav or browser_content");
    expect(example).toContain('"tool":"browser_nav"');
    expect(example).not.toContain('"tool":"browser_search"');
  });

  it("selects interactive model study card for model-only vocabulary quiz workflows", () => {
    const plan = selectWorkflowCompilerRecipePlan({
      userRequest: [
        "Create a Workflow Agent that uses Ambient to pick one useful vocabulary word for an adult learner.",
        "Ask the user to guess the meaning with multiple-choice or freeform input.",
        "Return a concise HTML study card with visible labels Definition, Etymology, and Example sentences.",
        "Do not use browser or network access. Do not write files or create workspace mutations.",
      ].join(" "),
      selectedToolNames: [],
      selectedConnectorIds: [],
    });

    expect(plan.selected.map((recipe) => recipe.id)).toContain("interactive_model_study_card");
    const recipe = workflowCompilerRecipeDefinitions().find((definition) => definition.id === "interactive_model_study_card");
    expect(recipe?.promptGuidance).toContain("requiredOutput/output.schema");
    expect(JSON.stringify(recipe?.irExample)).toContain("Example sentences");
    expect(JSON.stringify(recipe?.irExample)).toContain('"fromHandle":"askLearner.text"');
  });

  it("does not keep the study-card recipe when broad capability discovery selects source or mutation tools", () => {
    const plan = selectWorkflowCompilerRecipePlan({
      userRequest: [
        "Create a Workflow Agent that uses Ambient to pick one useful vocabulary word for an adult learner.",
        "Ask the user to guess the meaning with multiple-choice or freeform input.",
        "Use the model as the source of vocabulary knowledge and return an HTML card.",
        "The final output must include Definition, Etymology, and Example sentences sections.",
        "Do not use browser or network access. Do not write files or create workspace mutations.",
      ].join(" "),
      selectedToolNames: ["browser_search", "local_directory_list", "file_write"],
      selectedConnectorIds: ["workspace.inventory"],
    });

    expect(plan.selected.map((recipe) => recipe.id)).not.toContain("interactive_model_study_card");
    expect(plan.rejected.find((recipe) => recipe.id === "interactive_model_study_card")?.missingSignals).toEqual(
      expect.arrayContaining(["no browser source", "no local directory source", "no file write"]),
    );
  });

  it("selects current web research, large collection, and staged export for sourced file reports", () => {
    const plan = selectWorkflowCompilerRecipePlan({
      userRequest:
        "Build a current public web research report from 100 source candidates and render a PDF in Documents.",
      selectedToolNames: ["browser_search", "file_write"],
    });
    const selected = plan.selected;

    expect(selected.map((recipe) => recipe.id)).toEqual(
      expect.arrayContaining(["current_web_research", "large_collection_summarization", "staged_document_export"]),
    );
    expect(selected.find((recipe) => recipe.id === "current_web_research")?.matchedSignals).toEqual(
      expect.arrayContaining(["browser_search", "current-data", "public-source", "report"]),
    );
    expect(selected.find((recipe) => recipe.id === "large_collection_summarization")?.confidence).toBeGreaterThan(0.7);
    expect(plan.policyImplications.map((implication) => implication.id)).toEqual(
      expect.arrayContaining(["recipe.current_web_research.source_evidence", "recipe.large_collection_summarization.budget", "recipe.staged_document_export.approval_gate"]),
    );
    expect(plan.rejected.map((recipe) => recipe.id)).toContain("metadata_first_personal_data_review");
    expect(plan.summary).toMatchObject({
      selectedRecipeIds: expect.arrayContaining(["current_web_research", "large_collection_summarization", "staged_document_export"]),
      confidence: expect.any(Number),
      matchedSignalCount: expect.any(Number),
    });
  });

  it("keeps Gmail metadata-only search on the collection recipe instead of the detail-gating recipe", () => {
    const plan = selectWorkflowCompilerRecipePlan({
      userRequest: [
        "Inspect the latest 20 Gmail messages using metadata only and summarize visible themes.",
        "Use connector.paginate with connectorId google.gmail and operation search, maxItems 20, maxPages 1, and dedupeKeyPath threadId.",
        "Do not use google.gmail.readThread, readAttachment, drafts, sends, labels mutation, browser tools, file tools, shell/bash, or Google Workspace raw tools.",
        "Use collection.map to keep only metadata fields such as message id, thread id, snippet, internalDate, label ids, and lightweight header metadata.",
      ].join(" "),
      selectedToolNames: [],
      selectedConnectorIds: ["google.gmail"],
    });

    expect(plan.selected.map((recipe) => recipe.id)).toContain("large_collection_summarization");
    expect(plan.selected.map((recipe) => recipe.id)).not.toContain("metadata_first_personal_data_review");
    expect(plan.rejected.find((recipe) => recipe.id === "metadata_first_personal_data_review")?.missingSignals).toContain(
      "not search-only Gmail metadata",
    );
  });

  it("selects a movie-night current showtimes recipe for current movie recommendations", () => {
    const plan = selectWorkflowCompilerRecipePlan({
      userRequest: [
        "Recommend whether a couple in Scottsdale should go out to see a movie tonight.",
        "Use current public web evidence for showtimes, currently playing movies, reviews, runtime, genre, and theater travel friction.",
        "Ask for the couple's preference profile before making the final go/no-go recommendation.",
      ].join(" "),
      selectedToolNames: ["browser_search"],
    });

    expect(plan.selected.map((recipe) => recipe.id)).toEqual(
      expect.arrayContaining(["current_web_research", "movie_night_current_showtimes", "large_collection_summarization"]),
    );
    expect(plan.selected.find((recipe) => recipe.id === "movie_night_current_showtimes")?.matchedSignals).toEqual(
      expect.arrayContaining(["browser_search", "movie-night-current-showtimes"]),
    );
    expect(plan.policyImplications.map((implication) => implication.id)).toEqual(
      expect.arrayContaining([
        "recipe.current_web_research.source_evidence",
        "recipe.movie_night_current_showtimes.preference_freshness_gate",
        "recipe.large_collection_summarization.budget",
      ]),
    );
    const recipe = workflowCompilerRecipeDefinitions().find((definition) => definition.id === "movie_night_current_showtimes");
    expect(recipe?.promptGuidance).toContain("Do not rely on model knowledge for current showtimes");
    expect(JSON.stringify(recipe?.irExample)).toContain('"tool":"browser_search"');
    expect(JSON.stringify(recipe?.irExample)).toContain('"kind":"review.input"');
    expect(JSON.stringify(recipe?.irExample)).toContain('"strategy":"tree"');
  });

  it("selects current web research for time-sensitive public facts even without report wording", () => {
    const plan = selectWorkflowCompilerRecipePlan({
      userRequest: "Use browser_search to answer the current weather and event availability in Scottsdale today.",
      selectedToolNames: ["browser_search"],
    });

    expect(plan.selected.map((recipe) => recipe.id)).toContain("current_web_research");
    expect(plan.selected.find((recipe) => recipe.id === "current_web_research")?.matchedSignals).toEqual(
      expect.arrayContaining(["browser_search", "current-data", "public-source"]),
    );
    const recipe = workflowCompilerRecipeDefinitions().find((definition) => definition.id === "current_web_research");
    expect(recipe?.promptGuidance).toContain("weather, sports");
    expect(recipe?.promptGuidance).toContain("location when location-specific");
    expect(recipe?.promptGuidance).toContain("Do not rely on model knowledge for current facts");
    expect(JSON.stringify(recipe?.irExample)).toContain('"pageQueries":["current public sources for <topic>","official current source for <topic>"]');
    expect(plan.policyImplications.map((implication) => implication.id)).toContain("recipe.current_web_research.source_evidence");
  });

  it("selects a metadata-first Gmail recipe with review-gated detail reads", () => {
    const plan = selectWorkflowCompilerRecipePlan({
      userRequest:
        "Categorize the latest 1,000 Gmail messages using metadata first, stay read-only, and ask before reading any full bodies or attachments.",
      selectedConnectorIds: ["google.gmail"],
    });

    expect(plan.selected.map((recipe) => recipe.id)).toEqual(
      expect.arrayContaining(["metadata_first_personal_data_review", "large_collection_summarization"]),
    );
    expect(plan.selected.find((recipe) => recipe.id === "metadata_first_personal_data_review")?.matchedSignals).toEqual(
      expect.arrayContaining(["personal-connector", "personal-data-review"]),
    );
    expect(plan.policyImplications.map((implication) => implication.id)).toEqual(
      expect.arrayContaining(["recipe.metadata_first_personal_data_review.privacy_gate", "recipe.large_collection_summarization.budget"]),
    );
    const recipe = workflowCompilerRecipeDefinitions().find((definition) => definition.id === "metadata_first_personal_data_review");
    expect(recipe?.promptGuidance).toContain("connector.paginate with google.gmail search");
    expect(recipe?.promptGuidance).toContain("google.gmail readThread or readAttachment");
    expect(recipe?.promptGuidance).toContain("never include Gmail draft/send/delete/update operations");
    expect(JSON.stringify(recipe?.irExample)).toContain('"connectorId":"google.gmail"');
    expect(JSON.stringify(recipe?.irExample)).toContain('"dedupeKeyPath":"threadId"');
    expect(JSON.stringify(recipe?.irExample)).toContain('"kind":"review.input"');
    expect(JSON.stringify(recipe?.irExample)).toContain('"strategy":"tree"');
  });

  it("does not force metadata-only Gmail when a bounded request explicitly needs thread detail", () => {
    const plan = selectWorkflowCompilerRecipePlan({
      userRequest:
        "Review the last 100 emails in Gmail, fetch enough message or thread detail to support categorization, and report action required, urgency, sender/domain, and recurring themes.",
      selectedConnectorIds: ["google.gmail"],
    });

    expect(plan.selected.map((recipe) => recipe.id)).toContain("large_collection_summarization");
    expect(plan.selected.map((recipe) => recipe.id)).not.toContain("metadata_first_personal_data_review");
    expect(plan.rejected.find((recipe) => recipe.id === "metadata_first_personal_data_review")?.missingSignals).toContain("explicit bounded Gmail detail-read intent");
  });

  it("selects staged document export from explicit stored-file intent even before file_write is selected", () => {
    const selected = selectWorkflowCompilerRecipes({
      userRequest:
        "Use current web evidence, render a Markdown report at Documents/example-report.md, then stage a file_write mutation for approval.",
      selectedToolNames: ["browser_search"],
    });

    expect(selected.map((recipe) => recipe.id)).toEqual(expect.arrayContaining(["current_web_research", "staged_document_export"]));
  });

  it("does not mistake staged approval wording for a blanket write ban", () => {
    const plan = selectWorkflowCompilerRecipePlan({
      userRequest: [
        "Collect current public source candidates, render a Markdown report, and stage a file_write mutation for the report.",
        "Do not write until the staged mutation is approved.",
        "Do not use external/cloud mutations. The only allowed write is the staged local file_write for the rendered Markdown report.",
      ].join(" "),
      selectedToolNames: ["browser_search", "file_write"],
    });

    expect(plan.selected.map((recipe) => recipe.id)).toEqual(expect.arrayContaining(["current_web_research", "staged_document_export"]));
    expect(plan.rejected.find((recipe) => recipe.id === "staged_document_export")).toBeUndefined();
    expect(plan.policyImplications.map((implication) => implication.id)).toContain("recipe.staged_document_export.approval_gate");
  });

  it("selects only the model-only recipe for local vocabulary quiz workflows", () => {
    const plan = selectWorkflowCompilerRecipePlan({
      userRequest: "Ask one vocabulary question and return a compact HTML answer card.",
      selectedToolNames: [],
    });

    expect(plan.selected.map((recipe) => recipe.id)).toEqual(["interactive_model_study_card"]);
    expect(plan.rejected.map((recipe) => recipe.id)).toEqual([
      "large_collection_summarization",
      "current_web_research",
      "movie_night_current_showtimes",
      "metadata_first_personal_data_review",
      "google_meeting_transcript_action_items",
      "visual_batch_classification",
      "staged_document_export",
      "browser_item_recovery",
    ]);
    expect(plan.rejected.find((recipe) => recipe.id === "large_collection_summarization")?.missingSignals).toEqual(
      expect.arrayContaining(["collection-capable source", "large or bounded multi-item signal"]),
    );
    expect(plan.policyImplications).toEqual([]);
  });

  it("does not treat returned HTML content as a stored file export when writes are forbidden", () => {
    const plan = selectWorkflowCompilerRecipePlan({
      userRequest: [
        "Use file_read to read dogfood-notes/admin.md and dogfood-notes/learning.md.",
        "Do not write files or create workspace mutations; return a labeled HTML document in the final output card.",
        "Ask the user for qualitative feedback before producing the final HTML.",
      ].join(" "),
      selectedToolNames: ["file_read"],
    });

    expect(plan.selected.map((recipe) => recipe.id)).not.toContain("staged_document_export");
    expect(plan.rejected.find((recipe) => recipe.id === "staged_document_export")?.reason).toContain(
      "explicitly disallowed local file writes or workspace mutations",
    );
    expect(plan.policyImplications.map((implication) => implication.id)).not.toContain("recipe.staged_document_export.approval_gate");
  });

  it("selects the Google transcript action-item recipe from Calendar, Drive, and long-context signals", () => {
    const plan = selectWorkflowCompilerRecipePlan({
      userRequest: [
        "Create a read-only workflow that pulls Google meeting recording transcripts from the last two weeks.",
        "Use Google Calendar events for provenance and Google Drive transcript files.",
        "Extract action items, owners, due dates, decisions, and unresolved questions.",
      ].join(" "),
      selectedToolNames: ["long_context_process"],
      selectedConnectorIds: ["google.calendar", "google.drive"],
    });

    expect(plan.selected.map((recipe) => recipe.id)).toEqual(
      expect.arrayContaining([
        "metadata_first_personal_data_review",
        "google_meeting_transcript_action_items",
      ]),
    );
    expect(plan.selected.find((recipe) => recipe.id === "google_meeting_transcript_action_items")?.matchedSignals).toEqual(
      expect.arrayContaining(["google.calendar", "google.drive", "long_context_process", "meeting-transcript-action-items"]),
    );
    expect(plan.policyImplications.map((implication) => implication.id)).toEqual(
      expect.arrayContaining(["recipe.google_meeting_transcript_action_items.read_only_long_context"]),
    );
    const recipe = workflowCompilerRecipeDefinitions().find((definition) => definition.id === "google_meeting_transcript_action_items");
    expect(recipe?.promptGuidance).toContain('exportMimeType:"text/plain"');
    expect(recipe?.promptGuidance).toContain("maxContentChars:4000");
    expect(JSON.stringify(recipe?.irExample)).toContain('"exportMimeType":"text/plain"');
    expect(JSON.stringify(recipe?.irExample)).toContain('"maxContentChars":4000');
  });

  it("keeps the selected recipe array wrapper for legacy callers", () => {
    const selected = selectWorkflowCompilerRecipes({
      userRequest: "Use browser_search to collect 40 public source candidates and summarize them.",
      selectedToolNames: ["browser_search"],
    });

    expect(selected.map((recipe) => recipe.id)).toEqual(expect.arrayContaining(["large_collection_summarization"]));
  });
});

function collectionMapBareStringPaths(value: unknown, path: string): string[] {
  if (typeof value === "string") return [path];
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((item, index) => collectionMapBareStringPaths(item, `${path}/${index}`));
  if ("fromItem" in value || "fromNode" in value || "fromHandle" in value || "literal" in value || typeof (value as { template?: unknown }).template === "string") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => collectionMapBareStringPaths(item, `${path}/${key}`));
}
