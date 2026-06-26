import { dogfoodNodeId } from "./workflowDogfoodLocalFixtures";
import type { workflowPluginCapabilityGrant } from "./workflowPluginCapabilities";

export function artifactReviewClassificationCompilerOutput(paths: string[]) {
  const readNodes = paths.map((path, index) => ({
    id: dogfoodNodeId("read-classification-file", path, index),
    kind: "tool.call" as const,
    label: `read ${path}`,
    tool: "file_read",
    args: { path },
  }));
  return {
    version: 1,
    title: "Artifact Review Classification Dogfood",
    goal: "Classify local files, pause for qualitative artifact feedback, then produce a final labeled HTML report.",
    summary:
      "Reads a small directory through file_read, uses Ambient to draft file classifications, pauses with a bounded HTML preview attached to workflow.askUser, then uses the feedback to produce the final report.",
    successCriteria: [
      "Local files are read through file_read without mutations",
      "Draft classifications are checkpointed before the runtime-input pause",
      "The runtime input card includes a review artifact path and bounded HTML preview",
      "Resuming with feedback produces readable final output cards instead of raw JSON-only output",
    ],
    inputs: { paths, previewArtifactPath: "reports/classification-preview.html", finalArtifactPath: "reports/classification-final.html" },
    nodes: [
      ...readNodes,
      {
        id: "classify-files",
        kind: "model.call" as const,
        dependsOn: readNodes.map((node) => node.id),
        task: "dogfood.file_classification_draft",
        input: {
          instruction:
            "Return JSON with summary:string, items:[{path,label,confidence,reason}], html:string, and markdown:string. Classify each file into practical user-facing categories. Include receipts as Finance when appropriate and notes/todos as Planning when appropriate. Keep reasons concise.",
          files: readNodes.map((node, index) => ({
            path: paths[index],
            kind: { fromNode: node.id, path: "kind" },
            truncated: { fromNode: node.id, path: "truncated" },
            content: { fromNode: node.id, path: "content" },
          })),
        },
        output: { schema: { summary: "string", items: "array", html: "string", markdown: "string" } },
      },
      {
        id: "classification-draft-checkpoint",
        kind: "checkpoint.write" as const,
        dependsOn: ["classify-files"],
        key: "classificationDraft",
        value: { files: paths, draft: { fromNode: "classify-files" } },
      },
      {
        id: "review-classifications",
        kind: "review.input" as const,
        dependsOn: ["classification-draft-checkpoint"],
        prompt: "Review the classification preview. What should change before creating the final report?",
        choices: [
          { id: "approve", label: "Looks right", description: "Use the draft classifications without further changes." },
          { id: "revise", label: "Use my feedback", description: "Apply the freeform feedback in the final report." },
        ],
        allowFreeform: true,
        data: {
          report: {
            title: "Classification preview",
            artifactPath: "reports/classification-preview.html",
            html: { fromNode: "classify-files", path: "html" },
            markdown: { fromNode: "classify-files", path: "markdown" },
          },
          summary: { fromNode: "classify-files", path: "summary" },
        },
      },
      {
        id: "final-report",
        kind: "model.call" as const,
        dependsOn: ["review-classifications"],
        task: "dogfood.file_classification_final",
        input: {
          instruction:
            "Return JSON with summary:string, items:[{path,label,confidence,reason}], html:string, markdown:string, and artifactPath:string. Apply the user's feedback when it is provided. The HTML should be a readable report, not raw JSON.",
          files: paths,
          draft: { fromNode: "classify-files" },
          userFeedback: {
            choiceId: { fromNode: "review-classifications", path: "choiceId" },
            text: { fromNode: "review-classifications", path: "text" },
          },
          artifactPath: "reports/classification-final.html",
        },
        output: { schema: { summary: "string", items: "array", html: "string", markdown: "string", artifactPath: "string" } },
      },
      {
        id: "final_output",
        kind: "output.final" as const,
        dependsOn: ["final-report"],
        label: "Classification report ready.",
        value: {
          artifactPath: "reports/classification-final.html",
          html: { fromNode: "final-report", path: "html" },
          markdown: { fromNode: "final-report", path: "markdown" },
          summary: { fromNode: "final-report", path: "summary" },
          items: { fromNode: "final-report", path: "items" },
        },
      },
    ],
    budgets: { maxToolCalls: paths.length, maxModelCalls: 2, maxRunMs: 300_000 },
    openQuestions: [],
  };
}

export function mutationReviewCompilerOutput(outputPath: string) {
  return {
    version: 1,
    title: "Mutation Review Dogfood",
    goal: "Draft a report and stage writing it to a workspace file for approval.",
    summary:
      "Uses Ambient to draft report content, checkpoints the draft, stages a local file write, applies it only after approval, and checkpoints the write result.",
    successCriteria: [
      "Ambient draft is generated and checkpointed before the review pause",
      "The file write is staged and not applied before approval",
      "Resume after approval writes the file",
      "The final checkpoint records the output path and bytes",
    ],
    inputs: { outputPath },
    nodes: [
      {
        id: "draft-report",
        kind: "model.call" as const,
        task: "dogfood.mutation_review_draft",
        input: {
          instruction:
            "Return JSON with title:string, summary:string, and content:string. The content must be markdown for a short report explaining that this workflow staged a write, paused for approval, and then wrote the approved file.",
        },
        output: { schema: { title: "string", summary: "string", content: "string" } },
      },
      {
        id: "mutation-review-draft-checkpoint",
        kind: "checkpoint.write" as const,
        dependsOn: ["draft-report"],
        key: "mutationReviewDraft",
        value: { fromNode: "draft-report" },
      },
      {
        id: "write-report",
        kind: "mutation.stage" as const,
        dependsOn: ["mutation-review-draft-checkpoint"],
        tool: "file_write",
        args: { path: outputPath, content: { fromNode: "draft-report", path: "content" } },
        changeSet: {
          kind: "file_write",
          path: outputPath,
          title: { fromNode: "draft-report", path: "title" },
          summary: { fromNode: "draft-report", path: "summary" },
          preview: { fromNode: "draft-report", path: "content" },
        },
      },
      {
        id: "mutation-review-output-checkpoint",
        kind: "checkpoint.write" as const,
        dependsOn: ["write-report", "draft-report"],
        key: "mutationReviewOutput",
        value: {
          path: { fromNode: "write-report", path: "path" },
          bytes: { fromNode: "write-report", path: "bytes" },
          title: { fromNode: "draft-report", path: "title" },
        },
      },
      {
        id: "final_output",
        kind: "output.final" as const,
        dependsOn: ["mutation-review-output-checkpoint"],
        value: { mutationReviewOutput: { fromNode: "mutation-review-output-checkpoint" } },
      },
    ],
    budgets: { maxToolCalls: 1, maxModelCalls: 1, maxRunMs: 240_000 },
    openQuestions: [],
  };
}

export function pluginMcpSummaryCompilerOutput(pluginCapability: ReturnType<typeof workflowPluginCapabilityGrant>) {
  void pluginCapability;
  return {
    version: 1,
    title: "Plugin MCP Summary Dogfood",
    goal: "Call a trusted workflow-safe plugin MCP tool and summarize its evidence.",
    summary: "Invokes the ambient fixture MCP plugin, asks Ambient to summarize the tool result, and checkpoints the summary.",
    successCriteria: [
      "The plugin MCP tool is declared in the manifest",
      "The plugin tool call is routed through workflow plugin supervision",
      "Ambient summarizes the plugin result",
      "The checkpoint records plugin evidence and model output",
    ],
    inputs: { pluginTool: "ambient_fixture_workspace_summary" },
    nodes: [
      {
        id: "plugin-evidence",
        kind: "tool.call" as const,
        label: "Call fixture MCP plugin",
        tool: "ambient_fixture_workspace_summary",
        args: { includeFiles: true },
      },
      {
        id: "plugin-summary",
        kind: "model.call" as const,
        dependsOn: ["plugin-evidence"],
        task: "dogfood.plugin_mcp_summary",
        input: {
          instruction:
            "Return JSON with summary:string, pluginTool:string, and evidence:string[]. Summarize this workflow-safe plugin MCP result and mention whether workspace files were included.",
          pluginTool: "ambient_fixture_workspace_summary",
          pluginResult: { fromNode: "plugin-evidence" },
        },
        output: { schema: { summary: "string", pluginTool: "string", evidence: "array" } },
      },
      {
        id: "plugin-summary-checkpoint",
        kind: "checkpoint.write" as const,
        dependsOn: ["plugin-evidence", "plugin-summary"],
        key: "pluginMcpSummary",
        value: {
          pluginTool: "ambient_fixture_workspace_summary",
          pluginText: { fromNode: "plugin-evidence" },
          summary: { fromNode: "plugin-summary" },
        },
      },
      {
        id: "final_output",
        kind: "output.final" as const,
        dependsOn: ["plugin-summary-checkpoint"],
        value: { pluginMcpSummary: { fromNode: "plugin-summary-checkpoint" } },
      },
    ],
    budgets: { maxToolCalls: 1, maxModelCalls: 1, maxRunMs: 240_000 },
    openQuestions: [],
  };
}

export function explorationDrivenCompilerOutput(path: string) {
  return {
    version: 1,
    title: "Exploration Driven Strategy Dogfood",
    goal: "Compile a deterministic workflow from an exploration trace that observed local file reads.",
    summary: "Reads the explored local seed file, asks Ambient to summarize the deterministic source strategy, and checkpoints the result.",
    successCriteria: [
      "Compile prompt includes the persisted exploration trace",
      "The generated workflow repeats the observed file_read pattern deterministically",
      "Ambient summarizes the strategy from the file evidence",
      "The checkpoint preserves source provenance",
    ],
    inputs: { path },
    nodes: [
      { id: "read-seed-file", kind: "tool.call" as const, label: "Read explored seed file", tool: "file_read", args: { path } },
      {
        id: "summarize-strategy",
        kind: "model.call" as const,
        dependsOn: ["read-seed-file"],
        task: "dogfood.exploration_driven_strategy",
        input: {
          instruction:
            "Return JSON with summary:string and provenance:string[]. Summarize how this deterministic workflow should use the explored local file as seed evidence, and mention that current dates still require verification.",
          file: {
            path,
            content: { fromNode: "read-seed-file", path: "content" },
            truncated: { fromNode: "read-seed-file", path: "truncated" },
          },
        },
        output: { schema: { summary: "string", provenance: "array" } },
      },
      {
        id: "exploration-strategy-checkpoint",
        kind: "checkpoint.write" as const,
        dependsOn: ["summarize-strategy"],
        key: "explorationDrivenStrategy",
        value: { path, strategy: { fromNode: "summarize-strategy" } },
      },
      {
        id: "final_output",
        kind: "output.final" as const,
        dependsOn: ["exploration-strategy-checkpoint"],
        value: { explorationDrivenStrategy: { fromNode: "exploration-strategy-checkpoint" } },
      },
    ],
    budgets: { maxToolCalls: 1, maxModelCalls: 1, maxRunMs: 240_000 },
    openQuestions: [],
  };
}

export function debugRewriteCompilerOutput() {
  return {
    version: 1,
    title: "Debug Rewrite Dogfood Repaired",
    goal: "Repair a workflow after a graph-mapped failure.",
    summary: "Replaces the unsafe classifier with a deterministic repaired classifier while preserving the classify graph node.",
    successCriteria: ["The classify node runs without throwing", "The repaired workflow checkpoints classification output"],
    nodes: [
      {
        id: "classify",
        kind: "branch.if",
        label: "classify safely",
        condition: true,
        then: { literal: { label: "fixed", recovered: true } },
        else: { literal: { label: "unreachable", recovered: false } },
      },
      {
        id: "classification-checkpoint",
        kind: "checkpoint.write",
        dependsOn: ["classify"],
        key: "classification",
        value: { fromNode: "classify", path: "value" },
      },
      {
        id: "output",
        kind: "output.final",
        dependsOn: ["classification-checkpoint"],
        value: { classification: { fromNode: "classification-checkpoint" } },
      },
    ],
    budgets: { maxRunMs: 120_000 },
    openQuestions: [],
  };
}

export function calendarBriefCompilerOutput(accountHint: string) {
  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const timeZone = "America/Phoenix";
  return {
    version: 1,
    title: "Calendar Brief Dogfood",
    goal: "Summarize upcoming Google Calendar events into a concise schedule brief.",
    summary:
      "Lists upcoming primary-calendar events through the Google Calendar connector, asks Ambient to summarize the schedule, and checkpoints the brief.",
    successCriteria: [
      "Calendar events are listed through google.calendar.listEvents",
      "Ambient produces a brief from the returned event metadata",
      "The checkpoint records the event count and brief",
    ],
    inputs: { accountHint, windowDays: 14, timeZone },
    nodes: [
      {
        id: "list-calendar-events",
        kind: "connector.call" as const,
        connectorId: "google.calendar",
        operation: "listEvents",
        accountId: accountHint,
        input: { calendarId: "primary", timeMin, timeMax, timeZone, maxResults: 10, singleEvents: true, orderBy: "startTime" },
        output: { schema: { items: "array", events: "array" } },
      },
      {
        id: "calendar-brief",
        kind: "model.call" as const,
        dependsOn: ["list-calendar-events"],
        task: "dogfood.calendar_brief",
        input: {
          instruction:
            "Return JSON with summary:string, eventCount:number, and highlights:string[]. Use only the provided calendar metadata. If there are no events, say there are no upcoming events in the checked range.",
          timeRange: { timeMin, timeMax, timeZone },
          events: { fromNode: "list-calendar-events" },
        },
        output: { schema: { summary: "string", eventCount: "number", highlights: "array" } },
      },
      {
        id: "calendar-brief-checkpoint",
        kind: "checkpoint.write" as const,
        dependsOn: ["list-calendar-events", "calendar-brief"],
        key: "calendarBrief",
        value: {
          accountId: accountHint,
          timeMin,
          timeMax,
          timeZone,
          events: { fromNode: "list-calendar-events" },
          brief: { fromNode: "calendar-brief" },
        },
      },
      {
        id: "final_output",
        kind: "output.final" as const,
        dependsOn: ["calendar-brief-checkpoint"],
        value: { calendarBrief: { fromNode: "calendar-brief-checkpoint" } },
      },
    ],
    budgets: { maxConnectorCalls: 1, maxModelCalls: 1, maxRunMs: 600_000 },
    openQuestions: [],
  };
}

export function driveFileReportCompilerOutput(accountHint: string) {
  return {
    version: 1,
    title: "Drive File Evidence Dogfood",
    goal: "Search Google Drive files and summarize file evidence from safe metadata.",
    summary:
      "Searches Drive files, reads metadata for top matches with bounded connector fan-out, asks Ambient to summarize the file evidence, and checkpoints the report.",
    successCriteria: [
      "Drive search runs through google.drive.search",
      "Top file metadata is read through google.drive.readFile when matches exist",
      "Ambient produces a report from the returned file evidence",
      "The checkpoint records file count and report output",
    ],
    inputs: { accountHint, maxFiles: 5 },
    nodes: [
      {
        id: "search-drive-files",
        kind: "connector.call" as const,
        label: "Search Drive files",
        connectorId: "google.drive",
        operation: "search",
        accountId: accountHint,
        input: {
          query: "trashed = false",
          pageSize: 5,
          fields: "nextPageToken,files(id,name,mimeType,modifiedTime,size,webViewLink)",
        },
        output: { schema: { files: "array", items: "array", nextPageToken: "string|null" } },
      },
      {
        id: "drive-files",
        kind: "error.handle" as const,
        label: "Normalize Drive search files",
        dependsOn: ["search-drive-files"],
        try: { fromNode: "search-drive-files", path: "files" },
        fallback: { fromNode: "search-drive-files", path: "items" },
        errorMessage: "Drive search returned no files array; falling back to items.",
      },
      {
        id: "read-drive-file-details",
        kind: "connector.map" as const,
        label: "Read Drive file details",
        dependsOn: ["drive-files"],
        connectorId: "google.drive",
        operation: "readFile",
        accountId: accountHint,
        items: { fromNode: "drive-files", path: "value" },
        itemName: "file",
        input: {
          fileId: { fromItem: "file", path: "id" },
          fields: "id,name,mimeType,modifiedTime,size,webViewLink",
        },
        maxItems: 2,
        maxConcurrency: 4,
        output: { schema: { items: "array", count: "number", sourceCount: "number", truncated: "boolean" } },
      },
      {
        id: "drive-file-report",
        kind: "model.call" as const,
        label: "Summarize Drive file evidence",
        dependsOn: ["read-drive-file-details"],
        task: "dogfood.drive_file_report",
        input: {
          instruction:
            "Return JSON with summary:string, fileCount:number, and highlights:string[]. Use only the provided Drive file metadata. If no files are returned, say no files were found in the checked Drive search.",
          fileCount: { fromNode: "read-drive-file-details", path: "sourceCount" },
          files: { fromNode: "read-drive-file-details", path: "items" },
        },
        output: { schema: { summary: "string", fileCount: "number", highlights: "array" } },
      },
      {
        id: "drive-file-report-checkpoint",
        kind: "checkpoint.write" as const,
        dependsOn: ["drive-file-report", "read-drive-file-details"],
        key: "driveFileReport",
        value: {
          accountId: accountHint,
          fileCount: { fromNode: "read-drive-file-details", path: "sourceCount" },
          inspectedCount: { fromNode: "read-drive-file-details", path: "count" },
          report: { fromNode: "drive-file-report" },
        },
      },
      {
        id: "final_output",
        kind: "output.final" as const,
        dependsOn: ["drive-file-report-checkpoint"],
        value: { driveFileReport: { fromNode: "drive-file-report-checkpoint" } },
      },
    ],
    budgets: { maxConnectorCalls: 3, maxModelCalls: 1, maxRunMs: 600_000 },
    previewSummary: "Read-only Google Drive file evidence workflow.",
    dryRunStrategy: "Dry run records connector intent and report shape without writing Drive data.",
    openQuestions: [],
  };
}

export function retentionTraceCompilerOutput(mode: "production" | "debug") {
  return {
    version: 1,
    title: `${mode === "debug" ? "Debug" : "Production"} Retention Trace Dogfood`,
    goal: `Run a tiny ${mode} trace workflow and verify retention review labels from live Ambient evidence.`,
    summary: `Calls Ambient once and checkpoints the result for ${mode} trace review.`,
    successCriteria: [
      "Ambient call succeeds",
      "Model call is retained in run detail",
      "Retention review model reports the expected trace mode",
    ],
    inputs: { mode },
    nodes: [
      {
        id: "retention-trace",
        kind: "model.call" as const,
        task: `dogfood.retention_trace.${mode}`,
        input: {
          mode,
          instruction: "Return a JSON object with a single summary string confirming this live retention trace call completed.",
        },
        output: { schema: { summary: "string" } },
      },
      {
        id: "retention-trace-checkpoint",
        kind: "checkpoint.write" as const,
        dependsOn: ["retention-trace"],
        key: "retentionTrace",
        value: { mode, result: { fromNode: "retention-trace" } },
      },
      {
        id: "final_output",
        kind: "output.final" as const,
        dependsOn: ["retention-trace-checkpoint"],
        value: { retentionTrace: { fromNode: "retention-trace-checkpoint" } },
      },
    ],
    budgets: { maxToolCalls: 2, maxModelCalls: 1, maxRunMs: 180_000 },
    openQuestions: [],
  };
}

export function browserQaCompilerOutput(targetUrl: string) {
  return {
    version: 1,
    title: "Browser QA Dogfood",
    goal: "Run deterministic browser QA against a local fixture and store evidence.",
    summary:
      "Navigates to a local HTML page, captures content and screenshot evidence, asks Ambient for diagnosis, and checkpoints the result.",
    successCriteria: ["Page content is collected", "Screenshot evidence is recorded", "Ambient diagnosis is checkpointed"],
    nodes: [
      { id: "open-local-fixture", kind: "tool.call", label: "open local fixture", tool: "browser_nav", args: { url: targetUrl } },
      {
        id: "collect-page-content",
        kind: "tool.call",
        label: "collect page content",
        tool: "browser_content",
        dependsOn: ["open-local-fixture"],
        args: {},
      },
      {
        id: "capture-visual-evidence",
        kind: "tool.call",
        label: "capture visual evidence",
        tool: "browser_screenshot",
        dependsOn: ["collect-page-content"],
        args: {},
      },
      {
        id: "diagnosis",
        kind: "model.call",
        dependsOn: ["open-local-fixture", "collect-page-content", "capture-visual-evidence"],
        task: "dogfood.browser_qa",
        input: {
          page: { fromNode: "open-local-fixture" },
          content: { fromNode: "collect-page-content" },
          screenshot: { fromNode: "capture-visual-evidence" },
        },
        output: { schema: { summary: "string", issues: "array", evidence: "object" } },
      },
      {
        id: "browser-qa-checkpoint",
        kind: "checkpoint.write",
        dependsOn: ["diagnosis", "capture-visual-evidence"],
        key: "browserQa",
        value: { targetUrl, diagnosis: { fromNode: "diagnosis" }, screenshot: { fromNode: "capture-visual-evidence" } },
      },
      {
        id: "output",
        kind: "output.final",
        dependsOn: ["browser-qa-checkpoint"],
        value: { browserQa: { fromNode: "browser-qa-checkpoint" } },
      },
    ],
    budgets: { maxToolCalls: 6, maxModelCalls: 1, maxRunMs: 10_000 },
    openQuestions: [],
  };
}

export function scottsdaleActivitiesCompilerOutput() {
  return {
    version: 1,
    title: "Scottsdale Weekend Activities",
    goal: "Find weekend activities in Scottsdale Arizona and produce an auditable shortlist.",
    summary: "Searches for Scottsdale weekend activities, ranks likely options with Ambient, and checkpoints the result.",
    successCriteria: ["Search results are collected", "Ambient ranking is recorded", "A weekend shortlist is checkpointed"],
    nodes: [
      {
        id: "search-scottsdale-weekend-activities",
        kind: "tool.call",
        label: "search Scottsdale weekend activities",
        tool: "browser_search",
        args: { query: "weekend activities Scottsdale Arizona", maxResults: 8 },
      },
      {
        id: "shortlist",
        kind: "model.call",
        dependsOn: ["search-scottsdale-weekend-activities"],
        task: "dogfood.scottsdale_weekend",
        input: { query: "weekend activities Scottsdale Arizona", results: { fromNode: "search-scottsdale-weekend-activities" } },
        output: { schema: { summary: "string", picks: "array", evidence: "object" } },
      },
      {
        id: "scottsdale-weekend-checkpoint",
        kind: "checkpoint.write",
        dependsOn: ["search-scottsdale-weekend-activities", "shortlist"],
        key: "scottsdaleWeekend",
        value: {
          query: "weekend activities Scottsdale Arizona",
          results: { fromNode: "search-scottsdale-weekend-activities" },
          shortlist: { fromNode: "shortlist" },
        },
      },
      {
        id: "output",
        kind: "output.final",
        dependsOn: ["scottsdale-weekend-checkpoint"],
        value: { scottsdaleWeekend: { fromNode: "scottsdale-weekend-checkpoint" } },
      },
    ],
    budgets: { maxToolCalls: 4, maxModelCalls: 1, maxRunMs: 10_000 },
    openQuestions: ["Should the workflow prefer family-friendly, nightlife, outdoors, or budget activities?"],
  };
}
