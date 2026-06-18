import type { WorkflowDiscoveryQuestion, WorkflowExplorationTraceSummary, WorkflowGraphSnapshot } from "../../shared/workflowTypes";

export type WorkflowCompilerRecipeId =
  | "interactive_model_study_card"
  | "large_collection_summarization"
  | "current_web_research"
  | "movie_night_current_showtimes"
  | "metadata_first_personal_data_review"
  | "google_meeting_transcript_action_items"
  | "visual_batch_classification"
  | "staged_document_export"
  | "browser_item_recovery";

export interface WorkflowCompilerRecipeDefinition {
  id: WorkflowCompilerRecipeId;
  title: string;
  summary: string;
  applicabilityTags: string[];
  requiredNodeKinds: string[];
  preferredNodeKinds: string[];
  compatibleToolNames: string[];
  compatibleConnectorIds: string[];
  budgetEffects: string[];
  validatorRefs: string[];
  promptGuidance: string;
  irExample: Record<string, unknown>;
}

export interface WorkflowCompilerSelectedRecipe {
  id: WorkflowCompilerRecipeId;
  title: string;
  summary: string;
  reason: string;
  confidence: number;
  matchedSignals: string[];
  applicabilityTags: string[];
  requiredNodeKinds: string[];
  preferredNodeKinds: string[];
  compatibleToolNames: string[];
  compatibleConnectorIds: string[];
  budgetEffects: string[];
  validatorRefs: string[];
  policyImplications: WorkflowCompilerRecipePolicyImplication[];
}

export interface WorkflowCompilerRecipeSelectionInput {
  userRequest: string;
  workspaceSummary?: string;
  selectedToolNames?: Iterable<string>;
  selectedConnectorIds?: Iterable<string>;
  discoveryQuestions?: WorkflowDiscoveryQuestion[];
  explorationTraces?: WorkflowExplorationTraceSummary[];
  graphSnapshot?: WorkflowGraphSnapshot;
}

export interface WorkflowCompilerRejectedRecipe {
  id: WorkflowCompilerRecipeId;
  title: string;
  summary: string;
  reason: string;
  confidence: number;
  matchedSignals: string[];
  missingSignals: string[];
  applicabilityTags: string[];
  compatibleToolNames: string[];
  compatibleConnectorIds: string[];
}

export interface WorkflowCompilerRecipePolicyImplication {
  id: string;
  severity: "info" | "warning" | "gate";
  message: string;
  recipeIds: WorkflowCompilerRecipeId[];
  tags: string[];
  validatorRefs: string[];
}

export interface WorkflowCompilerRecipeSelectionResult {
  schemaVersion: 1;
  selected: WorkflowCompilerSelectedRecipe[];
  rejected: WorkflowCompilerRejectedRecipe[];
  policyImplications: WorkflowCompilerRecipePolicyImplication[];
  summary: {
    selectedRecipeIds: WorkflowCompilerRecipeId[];
    rejectedRecipeIds: WorkflowCompilerRecipeId[];
    confidence: number;
    matchedSignalCount: number;
  };
}

type RecipeCandidate = {
  id: WorkflowCompilerRecipeId;
  selected: boolean;
  reason: string;
  confidence: number;
  matchedSignals: string[];
  missingSignals: string[];
};

const recipeDefinitions: WorkflowCompilerRecipeDefinition[] = [
  {
    id: "interactive_model_study_card",
    title: "Interactive Model Study Card",
    summary: "Model-only teaching workflows ask one bounded runtime question, then synthesize a labeled study card from the answer.",
    applicabilityTags: ["model-only", "runtime-input", "study-card", "interactive-output", "structured-html"],
    requiredNodeKinds: ["review.input", "model.call", "output.final"],
    preferredNodeKinds: ["checkpoint.write"],
    compatibleToolNames: [],
    compatibleConnectorIds: [],
    budgetEffects: ["Use one runtime input and one or two Ambient calls.", "Keep the final output contract explicit and small."],
    validatorRefs: ["validateWorkflowProgramStatic", "dryRunWorkflowProgramOutput", "workflow UI dogfood vocabulary-quiz"],
    promptGuidance:
      "For model-only interactive teaching, quiz, vocabulary, or study-card workflows, use review.input for the learner response, then one model.call that includes the review outputs and an explicit requiredOutput/output.schema with html, definition, etymology, and exampleSentences when those sections are requested. The final output should expose the html and structured fields. If the user asks for visible labels such as Definition, Etymology, and Example sentences, include those exact labels in the model task and output contract; if etymology is unknown, output an Etymology section that says Unknown rather than omitting it. Do not introduce browser, connector, CLI, local file, or workspace inventory sources for model-only teaching runs.",
    irExample: {
      nodes: [
        {
          id: "ask-learner",
          kind: "review.input",
          prompt: "Guess the meaning before Ambient creates the final study card.",
          choices: [
            { id: "choice-a", label: "First option" },
            { id: "freeform", label: "Freeform answer" },
          ],
          allowFreeform: true,
        },
        {
          id: "synthesize-card",
          kind: "model.call",
          dependsOn: ["ask-learner"],
          task: "Create a concise HTML study card with exact visible labels: Definition, Etymology, and Example sentences. Include two example sentences.",
          input: {
            userChoice: { fromHandle: "askLearner.choiceId" },
            userText: { fromHandle: "askLearner.text" },
            requiredOutput: {
              format: "html",
              fields: ["html", "definition", "etymology", "exampleSentences"],
            },
          },
          output: { schema: { html: "string", definition: "string", etymology: "string", exampleSentences: "array" } },
        },
        {
          id: "final-output",
          kind: "output.final",
          dependsOn: ["synthesize-card"],
          value: {
            html: { fromHandle: "synthesizeCard.html" },
            definition: { fromHandle: "synthesizeCard.definition" },
            etymology: { fromHandle: "synthesizeCard.etymology" },
            exampleSentences: { fromHandle: "synthesizeCard.exampleSentences" },
          },
        },
      ],
    },
  },
  {
    id: "large_collection_summarization",
    title: "Large Collection Summarization",
    summary: "Bounded collection workflows paginate or collect, dedupe, trim records, chunk, map with the model, and reduce.",
    applicabilityTags: ["large-collection", "pagination", "chunking", "map-reduce", "source-quality"],
    requiredNodeKinds: ["collection.chunk", "model.map", "model.reduce"],
    preferredNodeKinds: ["tool.paginate", "connector.paginate", "collection.dedupe", "collection.map"],
    compatibleToolNames: ["browser_search", "local_directory_list", "long_context_process"],
    compatibleConnectorIds: ["google.gmail", "google.drive", "google.calendar"],
    budgetEffects: ["Set explicit maxItems/maxPages/maxChunks.", "Use tree reduce when chunk count can exceed one bounded model fan-in."],
    validatorRefs: ["validateWorkflowProgramStatic", "dryRunWorkflowProgramOutput"],
    promptGuidance:
      "For large or multi-source collections, use connector.paginate for connector pages or tool.paginate for paginated/read-only tool collection, dedupe when identities or URLs may repeat, map records down to necessary fields with explicit {fromItem,path} references, chunk before model reasoning, use model.map for extraction, and model.reduce for final synthesis. When chunk count is large, use model.reduce strategy:\"tree\" instead of one oversized final reduction.",
    irExample: {
      nodes: [
        { id: "collect-records", kind: "tool.paginate", maxItems: 100, maxPages: 10 },
        { id: "dedupe-records", kind: "collection.dedupe", items: { fromHandle: "collectRecords.items" }, strategy: "url_canonical", keyPath: "url", maxItems: 100 },
        { id: "chunk-records", kind: "collection.chunk", items: { fromHandle: "dedupeRecords.items" }, chunkSize: 10, maxChunks: 10 },
        { id: "extract-chunks", kind: "model.map", items: { fromHandle: "chunkRecords.chunks" }, maxConcurrency: 4 },
        { id: "reduce-findings", kind: "model.reduce", items: { fromHandle: "extractChunks.results" }, strategy: "tree", maxFanIn: 5 },
      ],
    },
  },
  {
    id: "current_web_research",
    title: "Current Web Research",
    summary: "Current public-source reports use bounded browser search, canonical source dedupe, freshness metadata, and source-backed synthesis.",
    applicabilityTags: ["current-data", "web-research", "public-sources", "freshness", "citations"],
    requiredNodeKinds: ["tool.paginate", "collection.dedupe", "collection.map", "model.map", "model.reduce"],
    preferredNodeKinds: ["collection.chunk", "checkpoint.write", "output.final"],
    compatibleToolNames: ["browser_search"],
    compatibleConnectorIds: [],
    budgetEffects: ["Cap pageQueries, pageSize, maxItems, maxPages, maxChunks, and model fan-in.", "Include run date and time zone in model inputs."],
    validatorRefs: ["validateWorkflowProgramStatic", "workflow compiler live/dogfood gates"],
    promptGuidance:
      "For current web research and other time-sensitive public facts such as today, latest, current schedules, prices, availability, weather, sports, or venue/event information, use selected read-only current evidence tools before Ambient synthesis. Use browser_search through tool.paginate with explicit pageQueries and page bounds, then collection.dedupe strategy:\"url_canonical\", collection.map to retain title/url/snippet/date/rank using explicit {fromItem,path} references, chunk, model.map source extraction, and model.reduce synthesis with citation URLs, explicit run date, local time zone, location when location-specific, evidence freshness, and coverage caveats. Do not rely on model knowledge for current facts. When browser_search is explicitly selected or named, do not substitute Ambient CLI search packages; Ambient CLI results expose stdout/stderr and cannot be treated as browser_search items/count.",
    irExample: {
      nodes: [
        {
          id: "search-sources",
          kind: "tool.paginate",
          tool: "browser_search",
          pageQueries: ["current public sources for <topic>", "official current source for <topic>"],
          itemsPath: "",
          queryInputPath: "query",
          pageSizeInputPath: "maxResults",
          pageSize: 10,
          maxItems: 20,
          maxPages: 2,
          dedupeKeyPath: "url",
        },
        { id: "dedupe-sources", kind: "collection.dedupe", items: { fromHandle: "searchSources.items" }, keyPath: "url", strategy: "url_canonical" },
        {
          id: "trim-sources",
          kind: "collection.map",
          items: { fromHandle: "dedupeSources.items" },
          itemName: "item",
          map: {
            title: { fromItem: "item", path: "title" },
            url: { fromItem: "item", path: "url" },
            snippet: { fromItem: "item", path: "snippet" },
            freshness: { fromItem: "item", path: "date" },
          },
        },
        { id: "chunk-sources", kind: "collection.chunk", items: { fromHandle: "trimSources.items" }, chunkSize: 10, maxChunks: 6 },
        { id: "extract-source-findings", kind: "model.map", items: { fromHandle: "chunkSources.chunks" }, maxItems: 6, maxConcurrency: 4 },
        { id: "synthesize-report", kind: "model.reduce", items: { fromHandle: "extractSourceFindings.results" }, input: { includeRunDate: true, includeTimeZone: true, requireCitationUrls: true } },
      ],
    },
  },
  {
    id: "movie_night_current_showtimes",
    title: "Movie Night Current Showtimes",
    summary:
      "Movie-night recommendations collect current showtimes, reviews, runtime, genre, and venue friction before asking for preference fit and making a go/no-go call.",
    applicabilityTags: ["current-data", "movie-night", "showtimes", "recommendation", "preference-review"],
    requiredNodeKinds: ["tool.paginate", "collection.dedupe", "collection.map", "collection.chunk", "model.map", "review.input", "model.reduce"],
    preferredNodeKinds: ["checkpoint.write", "output.final"],
    compatibleToolNames: ["browser_search"],
    compatibleConnectorIds: [],
    budgetEffects: [
      "Use a small fixed pageQuery set for showtimes, reviews, runtime/genre, and venue/travel friction.",
      "Bound source candidates before model extraction and include run date, timezone, location, and freshness caveats in synthesis.",
    ],
    validatorRefs: ["validateWorkflowProgramStatic", "workflow movie-night current-data dogfood gate"],
    promptGuidance:
      "For current movie-night recommendations, use browser_search through tool.paginate with bounded pageQueries covering local showtimes/currently playing movies, reviews/ratings, runtime/genre/content rating, and theater/parking/dinner/travel friction. Then use collection.dedupe strategy:\"url_canonical\", collection.map with explicit title/url/snippet/date/rank references, collection.chunk, model.map to extract candidate movies, showtimes, review signals, runtime, genre, venue/travel friction, source URLs, and evidence freshness, review.input for the user's preference profile, and model.reduce strategy:\"tree\" for a clear go/no-go recommendation with alternatives, confidence, tradeoffs, freshness caveats, and coverage gaps. Do not rely on model knowledge for current showtimes or currently playing facts.",
    irExample: {
      nodes: [
        {
          id: "search-showtimes",
          kind: "tool.paginate",
          tool: "browser_search",
          pageQueries: [
            "local movie showtimes tonight",
            "currently playing movies reviews ratings",
            "movie runtime genre content rating",
            "movie theater parking dinner travel friction",
          ],
          itemsPath: "",
          queryInputPath: "query",
          pageSizeInputPath: "maxResults",
          pageSize: 10,
          maxItems: 40,
          maxPages: 4,
          dedupeKeyPath: "url",
        },
        { id: "dedupe-showtime-sources", kind: "collection.dedupe", items: { fromHandle: "searchShowtimes.items" }, strategy: "url_canonical", keyPath: "url", maxItems: 40 },
        {
          id: "trim-showtime-sources",
          kind: "collection.map",
          items: { fromHandle: "dedupeShowtimeSources.items" },
          itemName: "source",
          map: {
            title: { fromItem: "source", path: "title" },
            url: { fromItem: "source", path: "url" },
            snippet: { fromItem: "source", path: "snippet" },
            freshness: { fromItem: "source", path: "date" },
            rank: { fromItem: "source", path: "rank" },
          },
          maxItems: 40,
        },
        { id: "chunk-showtime-sources", kind: "collection.chunk", items: { fromHandle: "trimShowtimeSources.items" }, chunkSize: 10, maxChunks: 4 },
        { id: "extract-movie-options", kind: "model.map", items: { fromHandle: "chunkShowtimeSources.chunks" }, task: "extract.movie.night.current.options", maxItems: 4, maxConcurrency: 4 },
        { id: "collect-preferences", kind: "review.input", prompt: "Choose the movie-night preference profile before final recommendation." },
        { id: "recommend-movie-night", kind: "model.reduce", items: { fromHandle: "extractMovieOptions.results" }, task: "recommend.movie.night.current", input: { preferenceChoice: { fromHandle: "collectPreferences.choiceId" } }, strategy: "tree", maxFanIn: 4, maxLevels: 1 },
      ],
    },
  },
  {
    id: "metadata_first_personal_data_review",
    title: "Metadata-First Personal Data Review",
    summary: "Personal-data connectors collect bounded metadata first, gate broad detail fetches, and avoid writes unless explicitly requested.",
    applicabilityTags: ["personal-data", "metadata-first", "gmail", "drive", "calendar", "privacy"],
    requiredNodeKinds: ["connector.paginate", "collection.map", "collection.chunk", "model.map", "model.reduce"],
    preferredNodeKinds: ["review.input", "connector.map"],
    compatibleToolNames: ["google_workspace_call", "long_context_process"],
    compatibleConnectorIds: ["google.gmail", "google.drive", "google.calendar"],
    budgetEffects: [
      "Bound metadata pages before detail reads.",
      "Chunk metadata before model synthesis.",
      "Use review.input before fetching broad sensitive details.",
    ],
    validatorRefs: ["validateWorkflowConnectorManifest", "validateWorkflowProgramStatic"],
    promptGuidance:
      "For Gmail, Drive, Calendar, and similar personal-data review, first use bounded search/list pagination and keep the run metadata-first. For large Gmail categorization, use connector.paginate with google.gmail search, maxResults/pageSize, maxPages, maxItems, and dedupeKeyPath:\"threadId\"; do not use google.gmail readThread or readAttachment before an explicit review.input gate, and never include Gmail draft/send/delete/update operations for read-only categorization. Strip records with collection.map to safe fields such as id, threadId, snippet, internalDate, labelIds, and lightweight headers using explicit {fromItem,path} references, chunk the metadata, use model.map plus tree model.reduce for categories, and ask whether a bounded future detail-read follow-up should be planned when metadata confidence is low. Fetch details only for selected or bounded items after review.",
    irExample: {
      nodes: [
        {
          id: "search-metadata",
          kind: "connector.paginate",
          connectorId: "google.gmail",
          operation: "search",
          input: { query: "" },
          pageSize: 100,
          maxItems: 1000,
          maxPages: 10,
          dedupeKeyPath: "threadId",
        },
        {
          id: "trim-metadata",
          kind: "collection.map",
          items: { fromHandle: "searchMetadata.items" },
          itemName: "item",
          maxItems: 1000,
          map: {
            id: { fromItem: "item", path: "id" },
            threadId: { fromItem: "item", path: "threadId" },
            snippet: { fromItem: "item", path: "snippet" },
            internalDate: { fromItem: "item", path: "internalDate" },
            labelIds: { fromItem: "item", path: "labelIds" },
          },
        },
        { id: "chunk-metadata", kind: "collection.chunk", items: { fromHandle: "trimMetadata.items" }, chunkSize: 25, maxChunks: 40 },
        { id: "categorize-metadata", kind: "model.map", items: { fromHandle: "chunkMetadata.chunks" }, task: "categorize.gmail.metadata.chunk", maxItems: 40, maxConcurrency: 4 },
        { id: "review-detail-followup", kind: "review.input", prompt: "Choose whether any bounded full-body follow-up should be planned." },
        { id: "merge-categories", kind: "model.reduce", items: { fromHandle: "categorizeMetadata.results" }, task: "merge.gmail.metadata.categories", input: { followupChoice: { fromHandle: "reviewDetailFollowup.choiceId" } }, strategy: "tree", maxFanIn: 8, maxLevels: 2 },
      ],
    },
  },
  {
    id: "google_meeting_transcript_action_items",
    title: "Google Meeting Transcript Action Items",
    summary:
      "Google Calendar plus Drive transcript workflows collect bounded event/file provenance, read candidate transcripts, route long evidence through long_context_process, and shape read-only action-item reports.",
    applicabilityTags: ["google", "calendar", "drive", "meeting-transcripts", "action-items", "long-context", "read-only"],
    requiredNodeKinds: ["connector.paginate", "collection.map", "connector.map", "tool.call", "model.call"],
    preferredNodeKinds: ["checkpoint.write", "output.final"],
    compatibleToolNames: ["long_context_process"],
    compatibleConnectorIds: ["google.calendar", "google.drive"],
    budgetEffects: [
      "Use explicit timeMin/timeMax/timeZone windows and bounded pageSize/maxPages/maxItems for Calendar and Drive discovery.",
      "Limit transcript candidate reads with collection.map maxItems 6, connector.map maxConcurrency 3, and maxContentChars 4000 per file; preserve skipped/truncated coverage for the rest.",
      "Feed long_context_process output plus counts/coverage into the final model.call instead of raw transcript collections.",
    ],
    validatorRefs: ["validateWorkflowConnectorManifest", "validateWorkflowProgramStatic", "dryRunWorkflowProgramOutput"],
    promptGuidance:
      "For Google meeting transcript action-item workflows, use connector.paginate for google.calendar listEvents with explicit timeMin, timeMax, timeZone, pageSize, maxItems, and maxPages; use connector.paginate for google.drive search over transcript-like Google Docs with query filtering mimeType = 'application/vnd.google-apps.document', pageSize, maxItems, and maxPages; use collection.map to select at most 6 candidate transcript files while preserving id/name/mimeType/modifiedTime/webViewLink provenance with explicit map references such as {\"id\":{\"fromItem\":\"file\",\"path\":\"id\"}} rather than literal strings; use connector.map for google.drive readFile with maxItems 6, maxConcurrency 3, fileId from the mapped item id, exportMimeType:\"text/plain\", and maxContentChars:4000 rather than requesting synthetic text/contentText fields from Drive metadata; call long_context_process with taskType:\"extraction\", maxModelCalls no more than 8, and maxOutputChars around 8000 over the bounded Drive readFile results plus Calendar event provenance; then use one final model.call over the long_context_process response, source counts, truncation metadata, and skipped/missing coverage only. Keep the workflow read-only, avoid Gmail unless explicitly requested, and final output should include action items, owners, due dates, decisions, unresolved questions, provenance, coverage, and a read-only statement.",
    irExample: {
      nodes: [
        {
          id: "calendar-event-pages",
          kind: "connector.paginate",
          connectorId: "google.calendar",
          operation: "listEvents",
          input: {
            calendarId: "primary",
            timeMin: "2026-05-02T00:00:00-07:00",
            timeMax: "2026-05-16T23:59:59-07:00",
            timeZone: "America/Phoenix",
            maxResults: 50,
            singleEvents: true,
            orderBy: "startTime",
          },
          pageSize: 50,
          maxItems: 100,
          maxPages: 2,
        },
        {
          id: "drive-transcript-pages",
          kind: "connector.paginate",
          connectorId: "google.drive",
          operation: "search",
          input: {
            query:
              "mimeType = 'application/vnd.google-apps.document' and trashed = false and (name contains 'transcript' or name contains 'meeting notes')",
            pageSize: 50,
            fields: "nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink,description)",
          },
          pageSize: 50,
          maxItems: 100,
          maxPages: 2,
        },
        {
          id: "candidate-transcripts",
          kind: "collection.map",
          items: { fromHandle: "driveTranscriptPages.items" },
          itemName: "file",
          maxItems: 6,
          map: {
            id: { fromItem: "file", path: "id" },
            name: { fromItem: "file", path: "name" },
            mimeType: { fromItem: "file", path: "mimeType" },
            modifiedTime: { fromItem: "file", path: "modifiedTime" },
            webViewLink: { fromItem: "file", path: "webViewLink" },
          },
        },
        {
          id: "read-transcript-files",
          kind: "connector.map",
          connectorId: "google.drive",
          operation: "readFile",
          items: { fromHandle: "candidateTranscripts.items" },
          itemName: "file",
          input: {
            fileId: { fromItem: "file", path: "id" },
            exportMimeType: "text/plain",
            maxContentChars: 4000,
          },
          maxItems: 6,
          maxConcurrency: 3,
        },
        {
          id: "extract-action-evidence",
          kind: "tool.call",
          tool: "long_context_process",
          args: {
            taskType: "extraction",
            instruction: "Extract action items, owners, due dates, decisions, unresolved questions, and source provenance.",
            text: {
              calendarEvents: { fromHandle: "calendarEventPages.items" },
              transcripts: { fromHandle: "readTranscriptFiles.items" },
            },
            maxModelCalls: 8,
            maxOutputChars: 8_000,
          },
        },
        {
          id: "shape-action-report",
          kind: "model.call",
          task: "shape.google.meeting.transcript.action.report",
          input: {
            extractedEvidence: { fromHandle: "extractActionEvidence.response" },
            sourceCounts: {
              calendarEvents: { fromHandle: "calendarEventPages.count" },
              transcriptFiles: { fromHandle: "readTranscriptFiles.count" },
            },
          },
        },
      ],
    },
  },
  {
    id: "visual_batch_classification",
    title: "Visual Batch Classification",
    summary: "Image and screenshot batches use bounded local inventory, skipped metadata preservation, visual tool fan-out, and model synthesis.",
    applicabilityTags: ["visual", "image-batch", "screenshots", "classification", "skipped-metadata"],
    requiredNodeKinds: ["tool.call", "loop.map", "model.call"],
    preferredNodeKinds: ["collection.map", "checkpoint.write", "output.final"],
    compatibleToolNames: ["local_directory_list", "ambient_visual_analyze"],
    compatibleConnectorIds: [],
    budgetEffects: ["Bound maxItems and maxConcurrency for visual fan-out.", "Preserve skipped hidden/secret/unreadable file metadata."],
    validatorRefs: ["validateWorkflowProgramStatic", "workflow visual dogfood gates"],
    promptGuidance:
      "For batches of images or screenshots, list the local folder, retain skipped metadata, select bounded image entries, use loop.map with ambient_visual_analyze for actual visual evidence, and synthesize from the visual observations rather than filenames.",
    irExample: {
      nodes: [
        { id: "list-images", kind: "tool.call", tool: "local_directory_list" },
        {
          id: "visual-map",
          kind: "loop.map",
          items: { fromHandle: "listImages.entries" },
          itemName: "image",
          map: { kind: "tool.call", tool: "ambient_visual_analyze" },
          maxItems: 20,
          maxConcurrency: 4,
        },
        { id: "synthesize-visuals", kind: "model.call", input: { visualEvidence: { fromHandle: "visualMap.items" }, skippedMetadata: { fromHandle: "listImages.skipped" } } },
      ],
    },
  },
  {
    id: "staged_document_export",
    title: "Staged Document Export",
    summary: "Requested report files render deterministically, then stage local writes for approval instead of writing directly.",
    applicabilityTags: ["document-render", "file-output", "staged-mutation", "approval", "report-export"],
    requiredNodeKinds: ["document.render", "mutation.stage"],
    preferredNodeKinds: ["output.final"],
    compatibleToolNames: ["file_write"],
    compatibleConnectorIds: [],
    budgetEffects: ["Separate render cost from write approval.", "Keep mutation policy staged_until_approved for local output files."],
    validatorRefs: ["validateWorkflowProgramStatic", "dryRunWorkflowProgramOutput"],
    promptGuidance:
      "When the user asks to save, write, export, or place a report/document/PDF/HTML/Markdown file, first use document.render with an explicit format and path, then use exactly one mutation.stage with file_write and a clear changeSet. mutation.stage already pauses until explicit approval, so do not add approval.required after it, do not reference the staged mutation changeSet/status as a second approval, and do not use raw tool.call file_write for report exports. Final output should reference the rendered artifact path/content and the staged mutation path/bytes only after approval resumes.",
    irExample: {
      nodes: [
        { id: "render", kind: "document.render", format: "pdf", path: "Documents/report.pdf" },
        {
          id: "stage-write",
          kind: "mutation.stage",
          tool: "file_write",
          args: { path: { fromHandle: "render.artifactPath" }, content: { fromHandle: "render.content" } },
          changeSet: { path: { fromHandle: "render.artifactPath" }, summary: "Write rendered report after approval." },
        },
        { id: "final", kind: "output.final", value: { artifactPath: { fromHandle: "render.artifactPath" }, writtenPath: { fromHandle: "stageWrite.path" } } },
      ],
    },
  },
  {
    id: "browser_item_recovery",
    title: "Browser Item Recovery",
    summary: "Browser item fan-out keeps item-stable provenance and lets Desktop expose retry or skip recovery per source.",
    applicabilityTags: ["browser", "item-fanout", "recovery", "source-provenance", "partial-coverage"],
    requiredNodeKinds: ["loop.map", "tool.call", "checkpoint.write"],
    preferredNodeKinds: ["collection.map", "model.reduce", "output.final"],
    compatibleToolNames: ["browser_search", "browser_nav", "browser_content", "browser_login"],
    compatibleConnectorIds: [],
    budgetEffects: ["Bound maxItems and maxConcurrency for browser fan-out.", "Keep source id/url/title with each browser result."],
    validatorRefs: ["validateWorkflowProgramStatic", "dryRunWorkflowProgramOutput"],
    promptGuidance:
      "For browser source fan-out or recovery-sensitive browser workflows, keep stable source item ids, pass item URL/title through each read, checkpoint per-source evidence, and surface item failures for Desktop retry/skip instead of hiding them with generic fallbacks. When URLs are already provided or browser_search is forbidden, do not create a search node: use the selected browser_nav or browser_content capability directly. For a fixed URL/source list, create a loop.map node named for the fetch step, set itemName to source, set map to a nested tool.call using browser_nav or browser_content, and pass args.url as {fromItem:\"source\",path:\"url\"}. Then feed that exact fetch node's items into checkpoint.write and the final model.call input, e.g. fetchResults:{fromHandle:\"fetchSources.items\"}. Do not satisfy a browser source workflow with model.call alone, and do not wrap the fan-out tool call in error.handle or a fallback node unless the user explicitly wants silent best-effort handling. Use browser.intervention instead of raw tool.call only when the workflow must handle CAPTCHA/login/MFA/consent user-action states.",
    irExample: {
      nodes: [
        {
          id: "fetch-sources",
          kind: "loop.map",
          items: [
            { id: "source-1", title: "Provided source 1", url: "<provided-url-1>" },
            { id: "source-2", title: "Provided source 2", url: "<provided-url-2>" },
          ],
          itemName: "source",
          map: { kind: "tool.call", tool: "browser_nav", args: { url: { fromItem: "source", path: "url" } } },
          maxItems: 2,
          maxConcurrency: 1,
        },
        {
          id: "checkpoint-evidence",
          kind: "checkpoint.write",
          key: "browser-source-evidence",
          value: { fetchResults: { fromHandle: "fetchSources.items" }, skippedSources: { fromHandle: "fetchSources.skippedItems" } },
        },
        {
          id: "synthesize-report",
          kind: "model.call",
          task: "Summarize browser source evidence, preserving partial coverage and skipped source metadata.",
          input: { fetchResults: { fromHandle: "fetchSources.items" }, skippedSources: { fromHandle: "fetchSources.skippedItems" } },
          output: { schema: { type: "object", properties: { reportHtml: { type: "string" } }, required: ["reportHtml"] } },
        },
        {
          id: "final-output",
          kind: "output.final",
          value: { reportHtml: { fromHandle: "synthesizeReport.reportHtml" }, fetchResults: { fromHandle: "fetchSources.items" } },
        },
      ],
    },
  },
];

export function workflowCompilerRecipeDefinitions(): WorkflowCompilerRecipeDefinition[] {
  return recipeDefinitions.map((recipe) => ({ ...recipe }));
}

export function selectWorkflowCompilerRecipes(input: WorkflowCompilerRecipeSelectionInput): WorkflowCompilerSelectedRecipe[] {
  return selectWorkflowCompilerRecipePlan(input).selected;
}

export function selectWorkflowCompilerRecipePlan(input: WorkflowCompilerRecipeSelectionInput): WorkflowCompilerRecipeSelectionResult {
  const selectedToolNames = new Set(input.selectedToolNames ?? []);
  const selectedConnectorIds = new Set(input.selectedConnectorIds ?? []);
  const corpus = workflowRecipeCorpus(input);
  const candidates = workflowRecipeCandidates({ corpus, selectedToolNames, selectedConnectorIds });
  const definitionsById = new Map(recipeDefinitions.map((recipe) => [recipe.id, recipe]));
  let selected: WorkflowCompilerSelectedRecipe[] = candidates
    .filter((candidate) => candidate.selected)
    .map((signal) => {
      const definition = definitionsById.get(signal.id);
      if (!definition) return undefined;
      return {
        id: definition.id,
        title: definition.title,
        summary: definition.summary,
        reason: signal.reason,
        confidence: signal.confidence,
        matchedSignals: signal.matchedSignals,
        applicabilityTags: definition.applicabilityTags,
        requiredNodeKinds: definition.requiredNodeKinds,
        preferredNodeKinds: definition.preferredNodeKinds,
        compatibleToolNames: definition.compatibleToolNames,
        compatibleConnectorIds: definition.compatibleConnectorIds,
        budgetEffects: definition.budgetEffects,
        validatorRefs: definition.validatorRefs,
        policyImplications: [] as WorkflowCompilerRecipePolicyImplication[],
      };
    })
    .filter((recipe): recipe is WorkflowCompilerSelectedRecipe => Boolean(recipe));
  const policyImplications = workflowRecipePolicyImplications(selected);
  selected = selected.map((recipe) => ({
    ...recipe,
    policyImplications: policyImplications.filter((implication) => implication.recipeIds.includes(recipe.id)),
  }));
  const rejected = candidates
    .filter((candidate) => !candidate.selected)
    .map((candidate) => {
      const definition = definitionsById.get(candidate.id);
      if (!definition) return undefined;
      return {
        id: definition.id,
        title: definition.title,
        summary: definition.summary,
        reason: candidate.reason,
        confidence: candidate.confidence,
        matchedSignals: candidate.matchedSignals,
        missingSignals: candidate.missingSignals,
        applicabilityTags: definition.applicabilityTags,
        compatibleToolNames: definition.compatibleToolNames,
        compatibleConnectorIds: definition.compatibleConnectorIds,
      };
    })
    .filter((recipe): recipe is WorkflowCompilerRejectedRecipe => Boolean(recipe));
  return {
    schemaVersion: 1,
    selected,
    rejected,
    policyImplications,
    summary: {
      selectedRecipeIds: selected.map((recipe) => recipe.id),
      rejectedRecipeIds: rejected.map((recipe) => recipe.id),
      confidence: selected.length ? roundConfidence(selected.reduce((sum, recipe) => sum + recipe.confidence, 0) / selected.length) : 1,
      matchedSignalCount: selected.reduce((sum, recipe) => sum + recipe.matchedSignals.length, 0),
    },
  };
}

function workflowRecipeCandidates(input: {
  corpus: string;
  selectedToolNames: Set<string>;
  selectedConnectorIds: Set<string>;
}): RecipeCandidate[] {
  const candidates: RecipeCandidate[] = [];
  const hasBrowserSearch = input.selectedToolNames.has("browser_search");
  const hasFileRead = input.selectedToolNames.has("file_read");
  const hasFileWrite = input.selectedToolNames.has("file_write");
  const hasVisual = input.selectedToolNames.has("ambient_visual_analyze");
  const hasLocalDirectory = input.selectedToolNames.has("local_directory_list");
  const hasLongContext = input.selectedToolNames.has("long_context_process");
  const hasGoogleCalendar = input.selectedConnectorIds.has("google.calendar");
  const hasGoogleDrive = input.selectedConnectorIds.has("google.drive");
  const hasPersonalConnector = [...input.selectedConnectorIds].some((id) => /google\.(gmail|drive|calendar)/i.test(id));
  const wantsCurrent = /\b(current|currently|latest|today|tonight|this week|202[0-9]|run date|freshness|fresh)\b/i.test(input.corpus);
  const wantsPublicSources =
    /\b(web|browser|public source|public web|source candidates?|citations?|provenance|research|search)\b/i.test(input.corpus) ||
    /\b(schedules?|showtimes?|prices?|availability|weather|sports?|events?|venues?|restaurants?|currently playing)\b/i.test(input.corpus);
  const wantsReport = /\b(report|summary|brief|recommendation|analysis|digest)\b/i.test(input.corpus);
  const wantsMovieNightCurrentShowtimes =
    /\b(movies?|showtimes?|currently playing|theaters?|cinemas?)\b/i.test(input.corpus) &&
    /\b(current|currently|today|tonight|nearby|go out|date night|recommend(?:ation)?)\b/i.test(input.corpus);
  const wantsLargeCollection =
    /\b(large|many|hundreds?|100|300|batch|collection|candidates?|pages?|chunks?)\b/i.test(input.corpus) ||
    /\b\d{2,4}\s+(?:(?:gmail|email|calendar|drive|source|file|record|thread)\s+){0,3}(?:messages?|emails?|records?|items?|files?|sources?|candidates?|pages?|threads?)\b/i.test(input.corpus);
  const wantsExplicitGmailDetailRead =
    /\b(?:gmail|inbox|emails?)\b/i.test(input.corpus) &&
    (/\b(?:message|thread|email|body|bodies|content)\s+details?\b/i.test(input.corpus) ||
      /\b(?:fetch|read|get|inspect|include)\b[^\n.;]{0,120}\b(?:message|thread|email|body|bodies|content)\b/i.test(input.corpus) ||
      /\b(?:message|thread|email|body|bodies|content)\b[^\n.;]{0,120}\b(?:fetch|read|get|inspect|include)\b/i.test(input.corpus));
  const wantsExplicitMetadataFirst =
    /\bmetadata[-\s]?first\b/i.test(input.corpus) ||
    /\bask\b[^\n.;]{0,120}\bbefore\b[^\n.;]{0,120}\b(?:read|fetch|get|inspect)\b[^\n.;]{0,120}\b(?:bodies|body|message content|full content|attachments?)\b/i.test(input.corpus) ||
    /\b(?:do\s+not|don't|dont|avoid|skip|without)\b[^\n.;]{0,120}\b(?:read|fetch|get|inspect)\b[^\n.;]{0,120}\b(?:bodies|body|message content|full content|attachments?|readThread)\b/i.test(input.corpus);
  const wantsVeryLargeGmailReview =
    /\b(?:300|500|1000|1,000|thousand|hundreds?)\s+(?:gmail\s+)?(?:messages?|emails?|threads?)\b/i.test(input.corpus) ||
    /\b(?:gmail|emails?|threads?)\b[^\n.;]{0,80}\b(?:300|500|1000|1,000|thousand|hundreds?)\b/i.test(input.corpus);
  const wantsStoredFileOutput =
    /\b(save|store|export|render|pdf|markdown file|html file|document file|documents folder|artifact|file_write|staged local|staged write|mutation\.stage)\b/i.test(
      input.corpus,
    ) || /\b(?:write|create|place)\b[^\n.;]{0,100}\b(?:files?|pdf|markdown|html|documents?|documents folder|artifact|path)\b/i.test(input.corpus);
  const hasExplicitStagedFileOutput =
    /\b(?:mutation\.stage|staged? (?:local )?(?:file[_\s-]?write|write|mutation)|file[_\s-]?write mutation)\b/i.test(input.corpus) ||
    /\b(?:save|write|store|export|render|place)\b[^\n.;]{0,160}\b(?:after|until|once|when)\b[^\n.;]{0,80}\bapproved\b/i.test(input.corpus) ||
    /\bonly allowed write\b[^\n.;]{0,120}\b(?:file[_\s-]?write|local file|rendered|report)\b/i.test(input.corpus);
  const allowsStagedFileOutput = wantsStoredFileOutput && hasExplicitStagedFileOutput;
  const disallowsStoredFileOutput =
    !allowsStagedFileOutput &&
    (/\bread[-\s]?only\b/i.test(input.corpus) ||
      /\b(?:do\s+not|don't|dont|without|avoid|exclude|skip)\b[^;\n]{0,120}\b(?:file[_\s-]?write|file writes?|write files?|write operations?|saving files?|save files?|store files?|workspace mutations?|local mutations?|mutations?)\b/i.test(input.corpus));
  const wantsPersonalDataReview = /\b(gmail|inbox|email|calendar|drive|docs|sheets|slides|personal data|messages?|meetings?)\b/i.test(input.corpus);
  const forbidsGmailDetailRead =
    /\b(?:do\s+not|don't|dont|without|avoid|exclude|skip)\b[^;\n]{0,180}\b(?:google\.gmail\.readThread|readThread|readAttachment|message bod(?:y|ies)|full message|attachments?)\b/i.test(
      input.corpus,
    ) ||
    /\b(?:google\.gmail\.readThread|readThread|readAttachment)\b[^;\n]{0,100}\b(?:forbidden|disallowed|not allowed|off limits)\b/i.test(
      input.corpus,
    );
  const wantsGmailMetadataSearchOnly =
    /\b(?:gmail|inbox|emails?|messages?)\b/i.test(input.corpus) &&
    /\b(?:metadata[-\s]?only|metadata fields?|message ids?|thread ids?|snippet|internalDate|label ids?|lightweight header)\b/i.test(input.corpus) &&
    /\b(?:connector\.paginate|google\.gmail\b[^;\n]{0,120}\bsearch|operation\s+search|maxItems|latest\s+\d{1,3})\b/i.test(input.corpus) &&
    forbidsGmailDetailRead;
  const wantsGoogleMeetingTranscript =
    /\b(google\s+meet|google\s+meeting|meeting recording|meeting transcripts?|recording transcripts?|transcript-like|transcript files?|meeting notes|calendar events?|drive files?)\b/i.test(
      input.corpus,
    ) &&
    /\b(action[-\s]?items?|owners?|due dates?|decisions?|unresolved questions?|follow[-\s]?ups?|summar(?:y|ize)|extract|analy[sz]e|report)\b/i.test(input.corpus);
  const wantsVisualBatch = /\b(images?|photos?|pictures?|screenshots?|visual|ocr|video frames?|classif(?:y|ication)|categorize)\b/i.test(input.corpus);
  const wantsBrowserRecovery = /\b(browser|url|source|sources|captcha|mfa|login|retry|skip|partial|coverage|unavailable)\b/i.test(input.corpus);
  const wantsInteractiveModelStudyCard =
    /\b(?:quiz|guess|multiple[-\s]?choice|freeform|learner|study card|vocabulary|definition|etymology|example sentences?|output card)\b/i.test(input.corpus) &&
    /\b(?:ask|prompt|user|learner|guess|answer|response|multiple[-\s]?choice|freeform)\b/i.test(input.corpus) &&
    /\b(?:html|card|final output|output card|study card)\b/i.test(input.corpus);
  const explicitlyUsesModelAsTeachingSource =
    /\b(?:use|uses|using)\b[^\n.;]{0,120}\b(?:Ambient|model|LLM|Pi)\b[^\n.;]{0,120}\b(?:source|knowledge|pick|generate|choose)\b/i.test(input.corpus) ||
    /\b(?:Ambient|model|LLM|Pi)\b[^\n.;]{0,120}\b(?:as|is)\b[^\n.;]{0,60}\b(?:source|knowledge source)\b/i.test(input.corpus);
  const explicitlyDisallowsExternalTeachingSources =
    /\b(?:do\s+not|don't|dont|without|no)\b[^;\n]{0,160}\b(?:browser|web|network|connectors?|workspace inventory|local files?|file reads?|external data|external sources?)\b/i.test(
      input.corpus,
    );
  const hasNonModelSource = hasBrowserSearch || hasFileRead || hasLocalDirectory || hasPersonalConnector;
  const modelOnlyTeachingRun =
    wantsInteractiveModelStudyCard &&
    !hasNonModelSource &&
    !hasFileWrite &&
    (explicitlyUsesModelAsTeachingSource || explicitlyDisallowsExternalTeachingSources) &&
    /\b(?:do\s+not|don't|dont|without|no)\b[^;\n]{0,160}\b(?:browser|network|file writes?|workspace mutations?|external data|external sources?)\b/i.test(
      input.corpus,
    );

  candidates.push(
    recipeCandidate({
      id: "interactive_model_study_card",
      selected:
        wantsInteractiveModelStudyCard &&
        (modelOnlyTeachingRun || !(hasBrowserSearch || hasFileRead || hasLocalDirectory || hasPersonalConnector || hasFileWrite)),
      selectedReason: "Interactive model-only study-card workflows should use one runtime prompt and an explicit structured final output contract.",
      rejectedReason: "Interactive model study card was not selected because the request lacks a quiz/study-card runtime input and final card intent.",
      matchedSignals: compactSignals([
        wantsInteractiveModelStudyCard && "interactive-study-card",
        modelOnlyTeachingRun && "model-only-teaching-run",
      ]),
      missingSignals: compactSignals([
        !wantsInteractiveModelStudyCard && "interactive study-card intent",
        hasBrowserSearch && "no browser source",
        hasFileRead && "no local file source",
        hasLocalDirectory && "no local directory source",
        hasPersonalConnector && "no personal connector source",
        hasFileWrite && "no file write",
      ]),
    }),
    recipeCandidate({
      id: "current_web_research",
      selected: hasBrowserSearch && (wantsPublicSources || wantsCurrent) && (wantsCurrent || wantsReport),
      selectedReason: "Selected browser_search plus current/public-source report intent requires a bounded source-backed research recipe.",
      rejectedReason: "Current web research was not selected because the request lacks explicit browser_search, public-source, or current/report intent.",
      matchedSignals: compactSignals([hasBrowserSearch && "browser_search", wantsCurrent && "current-data", wantsPublicSources && "public-source", wantsReport && "report"]),
      missingSignals: compactSignals([
        !hasBrowserSearch && "browser_search",
        !wantsPublicSources && "public-source intent",
        !(wantsCurrent || wantsReport) && "current-data or report intent",
      ]),
    }),
    recipeCandidate({
      id: "movie_night_current_showtimes",
      selected: hasBrowserSearch && wantsMovieNightCurrentShowtimes,
      selectedReason: "Movie-night showtime recommendations need bounded current web evidence plus a preference review before synthesis.",
      rejectedReason: "Movie-night current showtimes were not selected because the request lacks browser_search or movie/showtime recommendation intent.",
      matchedSignals: compactSignals([hasBrowserSearch && "browser_search", wantsMovieNightCurrentShowtimes && "movie-night-current-showtimes"]),
      missingSignals: compactSignals([
        !hasBrowserSearch && "browser_search",
        !wantsMovieNightCurrentShowtimes && "movie/showtime recommendation intent",
      ]),
    }),
    recipeCandidate({
      id: "large_collection_summarization",
      selected: (hasBrowserSearch || hasPersonalConnector || hasLocalDirectory) && (wantsLargeCollection || (hasBrowserSearch && wantsPublicSources)),
      selectedReason: "The request can collect many records, so compile should use bounded pagination, dedupe, chunking, map, and reduce.",
      rejectedReason: "Large collection summarization was not selected because the request is not a bounded multi-item collection workflow.",
      matchedSignals: compactSignals([
        hasBrowserSearch && "browser_search",
        hasPersonalConnector && "personal-connector",
        hasLocalDirectory && "local-directory",
        wantsLargeCollection && "large-collection",
        hasBrowserSearch && wantsPublicSources && "public-source-collection",
      ]),
      missingSignals: compactSignals([
        !(hasBrowserSearch || hasPersonalConnector || hasLocalDirectory) && "collection-capable source",
        !(wantsLargeCollection || (hasBrowserSearch && wantsPublicSources)) && "large or bounded multi-item signal",
      ]),
    }),
    recipeCandidate({
      id: "staged_document_export",
      selected: (hasFileWrite || wantsStoredFileOutput) && wantsStoredFileOutput && !disallowsStoredFileOutput,
      selectedReason: "Requested report/file output should render first and stage the local write for approval.",
      rejectedReason: disallowsStoredFileOutput
        ? "Staged document export was not selected because the user explicitly disallowed local file writes or workspace mutations."
        : "Staged document export was not selected because no stored file output was requested.",
      matchedSignals: compactSignals([hasFileWrite && "file_write", wantsStoredFileOutput && "file-output"]),
      missingSignals: compactSignals([!wantsStoredFileOutput && "file-output intent", disallowsStoredFileOutput && "write permission"]),
    }),
    recipeCandidate({
      id: "metadata_first_personal_data_review",
      selected:
        (hasPersonalConnector || input.selectedToolNames.has("google_workspace_call")) &&
        wantsPersonalDataReview &&
        !wantsGmailMetadataSearchOnly &&
        (!wantsExplicitGmailDetailRead || wantsExplicitMetadataFirst || wantsVeryLargeGmailReview),
      selectedReason: wantsExplicitMetadataFirst || wantsVeryLargeGmailReview
        ? "Personal workspace data should start from metadata and gate broad detail fetches."
        : "Personal workspace data should start from metadata when the request does not explicitly require bounded Gmail detail reads.",
      rejectedReason: "Metadata-first personal data review was not selected because the request lacks personal-data connector review intent.",
      matchedSignals: compactSignals([hasPersonalConnector && "personal-connector", input.selectedToolNames.has("google_workspace_call") && "google_workspace_call", wantsPersonalDataReview && "personal-data-review"]),
      missingSignals: compactSignals([
        !(hasPersonalConnector || input.selectedToolNames.has("google_workspace_call")) && "personal-data connector capability",
        !wantsPersonalDataReview && "personal-data review intent",
        wantsGmailMetadataSearchOnly && "not search-only Gmail metadata",
        wantsExplicitGmailDetailRead && !wantsExplicitMetadataFirst && !wantsVeryLargeGmailReview && "explicit bounded Gmail detail-read intent",
      ]),
    }),
    recipeCandidate({
      id: "google_meeting_transcript_action_items",
      selected: hasGoogleCalendar && hasGoogleDrive && hasLongContext && wantsGoogleMeetingTranscript,
      selectedReason:
        "Google Calendar plus Drive transcript action-item workflows need a bounded read-only transcript recipe with long-context preprocessing.",
      rejectedReason:
        "Google meeting transcript action items were not selected because the request lacks Calendar, Drive, long_context_process, or meeting-transcript/action-item intent.",
      matchedSignals: compactSignals([
        hasGoogleCalendar && "google.calendar",
        hasGoogleDrive && "google.drive",
        hasLongContext && "long_context_process",
        wantsGoogleMeetingTranscript && "meeting-transcript-action-items",
      ]),
      missingSignals: compactSignals([
        !hasGoogleCalendar && "google.calendar connector",
        !hasGoogleDrive && "google.drive connector",
        !hasLongContext && "long_context_process",
        !wantsGoogleMeetingTranscript && "meeting transcript action-item intent",
      ]),
    }),
    recipeCandidate({
      id: "visual_batch_classification",
      selected: hasVisual && (wantsVisualBatch || hasLocalDirectory),
      selectedReason: "Visual evidence requests need bounded visual analysis fan-out and synthesis from observations.",
      rejectedReason: "Visual batch classification was not selected because no visual-analysis batch capability and intent were both present.",
      matchedSignals: compactSignals([hasVisual && "ambient_visual_analyze", hasLocalDirectory && "local-directory", wantsVisualBatch && "visual-batch"]),
      missingSignals: compactSignals([!hasVisual && "ambient_visual_analyze", !(wantsVisualBatch || hasLocalDirectory) && "visual batch intent"]),
    }),
    recipeCandidate({
      id: "browser_item_recovery",
      selected: (input.selectedToolNames.has("browser_nav") || input.selectedToolNames.has("browser_content") || hasBrowserSearch) && wantsBrowserRecovery,
      selectedReason: "Browser source workflows need item-stable evidence and recoverable retry/skip behavior.",
      rejectedReason: "Browser item recovery was not selected because the workflow is not a browser source or recovery-sensitive browser workflow.",
      matchedSignals: compactSignals([
        hasBrowserSearch && "browser_search",
        input.selectedToolNames.has("browser_nav") && "browser_nav",
        input.selectedToolNames.has("browser_content") && "browser_content",
        wantsBrowserRecovery && "browser-recovery",
      ]),
      missingSignals: compactSignals([
        !(input.selectedToolNames.has("browser_nav") || input.selectedToolNames.has("browser_content") || hasBrowserSearch) && "browser capability",
        !wantsBrowserRecovery && "browser recovery/source intent",
      ]),
    }),
  );
  return recipeDefinitions
    .map((definition) => candidates.find((candidate) => candidate.id === definition.id))
    .filter((candidate): candidate is RecipeCandidate => Boolean(candidate));
}

function workflowRecipeCorpus(input: WorkflowCompilerRecipeSelectionInput): string {
  const discovery = (input.discoveryQuestions ?? [])
    .map((question) =>
      [
        question.category,
        question.context,
        question.question,
        question.answer?.choiceId,
        question.answer?.freeform,
        question.graphImpact,
      ]
        .filter(Boolean)
        .join(" "),
    )
    .join(" ");
  const traces = (input.explorationTraces ?? [])
    .map((trace) => [trace.request, JSON.stringify(trace.capabilityManifest ?? {}), JSON.stringify(trace.distillation ?? {})].join(" "))
    .join(" ");
  const graph = input.graphSnapshot
    ? input.graphSnapshot.nodes
        .map((node) =>
          [
            node.id,
            node.type,
            node.label,
            node.description,
            node.modelRole,
            node.dataSummary,
            node.inputSummary,
            node.outputSummary,
            node.toolNames?.join(" "),
            node.connectorIds?.join(" "),
          ]
            .filter(Boolean)
            .join(" "),
        )
        .join(" ")
    : "";
  return [input.userRequest, input.workspaceSummary, discovery, traces, graph].filter(Boolean).join("\n").toLowerCase();
}

function compactSignals(values: Array<string | false | undefined>): string[] {
  return values.filter((value): value is string => Boolean(value));
}

function recipeCandidate(input: {
  id: WorkflowCompilerRecipeId;
  selected: boolean;
  selectedReason: string;
  rejectedReason: string;
  matchedSignals: string[];
  missingSignals: string[];
}): RecipeCandidate {
  const confidence = input.selected
    ? roundConfidence(0.62 + Math.min(0.33, input.matchedSignals.length * 0.08) - Math.min(0.2, input.missingSignals.length * 0.05))
    : roundConfidence(0.78 + Math.min(0.18, input.missingSignals.length * 0.05) - Math.min(0.2, input.matchedSignals.length * 0.04));
  return {
    id: input.id,
    selected: input.selected,
    reason: input.selected ? input.selectedReason : input.rejectedReason,
    confidence,
    matchedSignals: [...new Set(input.matchedSignals)],
    missingSignals: [...new Set(input.missingSignals)],
  };
}

function workflowRecipePolicyImplications(selectedRecipes: WorkflowCompilerSelectedRecipe[]): WorkflowCompilerRecipePolicyImplication[] {
  const implications: WorkflowCompilerRecipePolicyImplication[] = [];
  const selectedIds = new Set(selectedRecipes.map((recipe) => recipe.id));
  const validators = (id: WorkflowCompilerRecipeId) => selectedRecipes.find((recipe) => recipe.id === id)?.validatorRefs ?? [];
  if (selectedIds.has("large_collection_summarization")) {
    implications.push({
      id: "recipe.large_collection_summarization.budget",
      severity: "warning",
      message: "Bound maxItems, maxPages, chunk size, maxChunks, model.map concurrency, and model.reduce fan-in before synthesis.",
      recipeIds: ["large_collection_summarization"],
      tags: ["budget", "collection", "map-reduce"],
      validatorRefs: validators("large_collection_summarization"),
    });
  }
  if (selectedIds.has("current_web_research")) {
    implications.push({
      id: "recipe.current_web_research.source_evidence",
      severity: "warning",
      message:
        "Current public-source claims require selected read-only evidence, source URLs, run date, local time zone, location when relevant, freshness caveats, and coverage notes.",
      recipeIds: ["current_web_research"],
      tags: ["current-data", "citations", "freshness"],
      validatorRefs: validators("current_web_research"),
    });
  }
  if (selectedIds.has("movie_night_current_showtimes")) {
    implications.push({
      id: "recipe.movie_night_current_showtimes.preference_freshness_gate",
      severity: "warning",
      message:
        "Movie-night recommendations require current showtime evidence, location/date/timezone freshness, source URLs, coverage caveats, and a user preference review before the final go/no-go recommendation.",
      recipeIds: ["movie_night_current_showtimes"],
      tags: ["movie-night", "current-data", "review-input", "freshness"],
      validatorRefs: validators("movie_night_current_showtimes"),
    });
  }
  if (selectedIds.has("metadata_first_personal_data_review")) {
    implications.push({
      id: "recipe.metadata_first_personal_data_review.privacy_gate",
      severity: "gate",
      message:
        "Personal-data workflows should collect bounded metadata first, chunk and synthesize metadata, avoid write operations in read-only runs, and ask before broad detail/body reads.",
      recipeIds: ["metadata_first_personal_data_review"],
      tags: ["privacy", "review-input", "metadata-first"],
      validatorRefs: validators("metadata_first_personal_data_review"),
    });
  }
  if (selectedIds.has("google_meeting_transcript_action_items")) {
    implications.push({
      id: "recipe.google_meeting_transcript_action_items.read_only_long_context",
      severity: "gate",
      message:
        "Google transcript action-item workflows must stay read-only, bound Calendar/Drive pages and Drive readFile fan-out, and route transcript evidence through long_context_process before final model shaping.",
      recipeIds: ["google_meeting_transcript_action_items"],
      tags: ["google", "transcripts", "read-only", "long-context"],
      validatorRefs: validators("google_meeting_transcript_action_items"),
    });
  }
  if (selectedIds.has("visual_batch_classification")) {
    implications.push({
      id: "recipe.visual_batch_classification.visual_evidence",
      severity: "warning",
      message: "Visual batch conclusions must come from bounded visual observations, not filenames or metadata alone.",
      recipeIds: ["visual_batch_classification"],
      tags: ["visual-evidence", "batch", "coverage"],
      validatorRefs: validators("visual_batch_classification"),
    });
  }
  if (selectedIds.has("staged_document_export")) {
    implications.push({
      id: "recipe.staged_document_export.approval_gate",
      severity: "gate",
      message: "Rendered local file output must be staged and approved before file_write executes.",
      recipeIds: ["staged_document_export"],
      tags: ["mutation", "approval", "document-render"],
      validatorRefs: validators("staged_document_export"),
    });
  }
  if (selectedIds.has("browser_item_recovery")) {
    implications.push({
      id: "recipe.browser_item_recovery.partial_coverage",
      severity: "info",
      message: "Browser item fan-out should preserve item identity and expose retry/skip recovery for failed sources.",
      recipeIds: ["browser_item_recovery"],
      tags: ["browser", "recovery", "partial-coverage"],
      validatorRefs: validators("browser_item_recovery"),
    });
  }
  return implications;
}

function roundConfidence(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100));
}
