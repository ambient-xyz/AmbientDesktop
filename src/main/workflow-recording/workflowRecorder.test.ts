import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ChatMessage } from "../../shared/threadTypes";
import {
  applyWorkflowRecordingSummaryState,
  confirmWorkflowRecordingReviewState,
  validateWorkflowRecordingReviewDraftForReuse,
  stopWorkflowRecordingState,
  updateWorkflowRecordingReviewDraftState,
  workflowRecordingApplyReviewValidationIssues,
  workflowRecordingCaptureFromMessages,
  workflowRecordingReviewFromCapture,
  workflowRecordingReviewPromptFromState,
} from "../../shared/workflowRecorder";
import { ProjectStore } from "./workflowRecordingProjectStoreFacade";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describe("workflow recorder capture", () => {
  it("records a chat transcript with one successful tool, one failed tool, and one assistant answer", () => {
    const messages: ChatMessage[] = [
      {
        id: "user-1",
        threadId: "thread-1",
        role: "user",
        content: "Find Scottsdale theater events.",
        createdAt: "2026-05-19T16:00:00.000Z",
      },
      {
        id: "tool-1",
        threadId: "thread-1",
        role: "tool",
        content: "browser_search completed\nFound 3 event listing pages.",
        createdAt: "2026-05-19T16:00:01.000Z",
        metadata: { toolName: "browser_search", toolCallId: "call-1", status: "done", artifactPath: ".ambient/tool-outputs/search.txt" },
      },
      {
        id: "tool-2",
        threadId: "thread-1",
        role: "tool",
        content: "browser_open failed\nVenue page returned 403.",
        createdAt: "2026-05-19T16:00:02.000Z",
        metadata: { toolName: "browser_open", toolCallId: "call-2", status: "error" },
      },
      {
        id: "assistant-1",
        threadId: "thread-1",
        role: "assistant",
        content: "Here are two viable events and the failed page to avoid.",
        createdAt: "2026-05-19T16:00:03.000Z",
        metadata: { status: "done" },
      },
    ];

    const capture = workflowRecordingCaptureFromMessages(messages, "2026-05-19T16:00:04.000Z");

    expect(capture).toMatchObject({
      messageCount: 4,
      userMessageCount: 1,
      assistantMessageCount: 1,
      toolResultCount: 2,
      successfulToolResultCount: 1,
      failedToolResultCount: 1,
    });
    expect(capture.events.map((event) => [event.kind, event.status, event.toolName])).toEqual([
      ["user_message", "succeeded", undefined],
      ["tool_result", "succeeded", "browser_search"],
      ["tool_result", "failed", "browser_open"],
      ["assistant_message", "succeeded", undefined],
    ]);
  });

  it("normalizes tool input and result previews while redacting secrets and credential paths", () => {
    const messages: ChatMessage[] = [
      {
        id: "tool-secret",
        threadId: "thread-1",
        role: "tool",
        content: [
          "ambient_cli completed",
          "",
          "Command",
          "GMI_CLOUD_API_KEY=glm-live-secret-value123 ambient-workflows search --query \"Scottsdale romantic date night\" --token=oauth-secret-value",
          "",
          "Result",
          "Authorization: Bearer ya29.liveOAuthTokenValue12345",
          "Opened 3 Scottsdale venue pages and kept event titles, dates, prices, and booking URLs.",
          "Credential file was /Users/Neo/.ambient-hardening/snapshots/shared-secrets/example/userData/credentials.json",
        ].join("\n"),
        createdAt: "2026-05-19T16:00:01.000Z",
        metadata: {
          toolName: "ambient_cli",
          toolCallId: "call-secret",
          status: "done",
          artifactPath: "/Users/Neo/.ambient-hardening/snapshots/shared-secrets/example/tool-output.txt",
        },
      },
    ];

    const capture = workflowRecordingCaptureFromMessages(messages, "2026-05-19T16:00:04.000Z");
    const event = capture.events[0];
    const serialized = JSON.stringify(capture);

    expect(capture).toMatchObject({
      messageCount: 1,
      toolResultCount: 1,
      successfulToolResultCount: 1,
      redactedEventCount: 1,
    });
    expect(capture.redactionCount).toBeGreaterThanOrEqual(4);
    expect(event).toMatchObject({
      kind: "tool_result",
      status: "succeeded",
      toolName: "ambient_cli",
      toolCallId: "call-secret",
      artifactPath: "[REDACTED_CREDENTIAL_PATH]",
      redacted: true,
    });
    expect(event.inputPreview).toContain("ambient-workflows search");
    expect(event.inputPreview).toContain("Scottsdale romantic date night");
    expect(event.resultPreview).toContain("Opened 3 Scottsdale venue pages");
    expect(serialized).not.toContain("glm-live-secret-value123");
    expect(serialized).not.toContain("oauth-secret-value");
    expect(serialized).not.toContain("ya29.liveOAuthTokenValue12345");
    expect(serialized).not.toContain("shared-secrets");
  });

  it("classifies skipped, permission-blocked, and user-corrected events deterministically", () => {
    const messages: ChatMessage[] = [
      {
        id: "tool-skipped",
        threadId: "thread-1",
        role: "tool",
        content: "browser_open skipped\nUser chose to skip the page.",
        createdAt: "2026-05-19T16:00:01.000Z",
        metadata: { toolName: "browser_open", status: "skipped" },
      },
      {
        id: "tool-permission",
        threadId: "thread-1",
        role: "tool",
        content: "Blocked by Ambient Desktop permission policy.",
        createdAt: "2026-05-19T16:00:02.000Z",
        metadata: { toolName: "chrome", status: "permission-blocked" },
      },
      {
        id: "assistant-corrected",
        threadId: "thread-1",
        role: "assistant",
        content: "User corrected the summary intent.",
        createdAt: "2026-05-19T16:00:03.000Z",
        metadata: { status: "user_corrected" },
      },
    ];

    const capture = workflowRecordingCaptureFromMessages(messages, "2026-05-19T16:00:04.000Z");

    expect(capture.events.map((event) => event.status)).toEqual(["skipped", "permission_blocked", "user_corrected"]);
    expect(capture).toMatchObject({
      skippedToolResultCount: 1,
      permissionBlockedToolResultCount: 1,
      userCorrectedEventCount: 1,
    });
  });

  it("keeps browser-source caveats out of successful workflow examples", () => {
    const messages: ChatMessage[] = [
      {
        id: "tool-caveat",
        threadId: "thread-1",
        role: "tool",
        content: [
          "browser_open completed",
          "",
          "Result",
          "The page appeared to show a CAPTCHA or anti-bot warning, and no usable event details were verified.",
        ].join("\n"),
        createdAt: "2026-05-19T16:00:01.000Z",
        metadata: { toolName: "browser_open", status: "done" },
      },
    ];

    const capture = workflowRecordingCaptureFromMessages(messages, "2026-05-19T16:00:04.000Z");
    const review = workflowRecordingReviewFromCapture({ goal: "Find Scottsdale date night events", capture });

    expect(capture.events[0]).toMatchObject({ kind: "tool_result", status: "skipped", toolName: "browser_open" });
    expect(capture).toMatchObject({ successfulToolResultCount: 0, skippedToolResultCount: 1 });
    expect(review.draft.successfulExamples).toEqual([]);
    expect(review.draft.doNot[0]).toMatchObject({
      toolName: "browser_open",
      status: "skipped",
    });
    expect(review.draft.doNot[0].reason).toContain("CAPTCHA");
  });

  it("does not treat negated CAPTCHA text as a browser-source caveat", () => {
    const capture = workflowRecordingCaptureFromMessages(
      [
        {
          id: "tool-no-caveat",
          threadId: "thread-1",
          role: "tool",
          content: "browser_open completed\nResult\nNo CAPTCHA was present. Extracted dates, venue names, and booking links.",
          createdAt: "2026-05-19T16:00:01.000Z",
          metadata: { toolName: "browser_open", status: "done" },
        },
      ],
      "2026-05-19T16:00:04.000Z",
    );

    expect(capture.events[0]).toMatchObject({ status: "succeeded", toolName: "browser_open" });
    expect(capture).toMatchObject({ successfulToolResultCount: 1, skippedToolResultCount: 0 });
  });

  it("creates a draft playbook review from stopped recording evidence", () => {
    const messages: ChatMessage[] = [
      {
        id: "user-1",
        threadId: "thread-1",
        role: "user",
        content: "Find Scottsdale theater events for a romantic date night.",
        createdAt: "2026-05-19T16:00:00.000Z",
      },
      {
        id: "tool-1",
        threadId: "thread-1",
        role: "tool",
        content: [
          "browser_search completed",
          "",
          "Input",
          "{\"query\":\"Scottsdale romantic theatrical events\"}",
          "",
          "Result",
          "Returned venue pages with dates, booking links, and event titles.",
        ].join("\n"),
        createdAt: "2026-05-19T16:00:01.000Z",
        metadata: { toolName: "browser_search", status: "done" },
      },
      {
        id: "tool-2",
        threadId: "thread-1",
        role: "tool",
        content: "ambient_cli failed\nRaw stdout was not a typed collection.",
        createdAt: "2026-05-19T16:00:02.000Z",
        metadata: { toolName: "ambient_cli", status: "error" },
      },
      {
        id: "assistant-1",
        threadId: "thread-1",
        role: "assistant",
        content: "Recommend two live events with venue, date, booking link, and date-night rationale.",
        createdAt: "2026-05-19T16:00:03.000Z",
      },
    ];

    const stopped = stopWorkflowRecordingState({
      current: { status: "recording", goal: "Scottsdale date night event discovery", startedAt: "2026-05-19T15:59:00.000Z" },
      messages,
      now: "2026-05-19T16:00:04.000Z",
    });

    expect(stopped.review).toMatchObject({
      status: "draft",
      draft: {
        status: "draft",
        source: "deterministic_capture",
        intent: "Scottsdale date night event discovery",
        successfulExamples: [
          {
            toolName: "browser_search",
            inputPreview: "{\"query\":\"Scottsdale romantic theatrical events\"}",
            resultPreview: "Returned venue pages with dates, booking links, and event titles.",
          },
        ],
        doNot: [
          {
            toolName: "ambient_cli",
            status: "failed",
          },
        ],
      },
    });
    expect(stopped.review?.draft.validation.join("\n")).toContain("booking links");
    expect(stopped.review?.draft.outputShape).toContain("Successful tool-call examples");
  });

  it("keeps review drafts redacted when building playbook summaries", () => {
    const capture = workflowRecordingCaptureFromMessages([
      {
        id: "tool-secret",
        threadId: "thread-1",
        role: "tool",
        content: [
          "browser_search completed",
          "",
          "Input",
          "GMI_CLOUD_API_KEY=glm-live-secret-value123 browser_search Scottsdale",
          "",
          "Result",
          "Authorization: Bearer ya29.liveOAuthTokenValue12345",
          "Returned safe search results.",
        ].join("\n"),
        createdAt: "2026-05-19T16:00:01.000Z",
        metadata: { toolName: "browser_search", status: "done" },
      },
    ]);

    const review = workflowRecordingReviewFromCapture({ goal: "Secret-safe review", capture });
    const serialized = JSON.stringify(review);

    expect(review.draft.successfulExamples[0].inputPreview).toContain("browser_search Scottsdale");
    expect(serialized).not.toContain("glm-live-secret-value123");
    expect(serialized).not.toContain("ya29.liveOAuthTokenValue12345");
  });

  it("builds a strict Pi review prompt from the redacted draft playbook", () => {
    const stopped = stopWorkflowRecordingState({
      current: { status: "recording", goal: "Build a repeatable Scottsdale event search.", startedAt: "2026-05-19T15:59:00.000Z" },
      messages: [
        {
          id: "user-1",
          threadId: "thread-1",
          role: "user",
          content: "Find romantic live theater options near Scottsdale.",
          createdAt: "2026-05-19T16:00:00.000Z",
        },
        {
          id: "tool-1",
          threadId: "thread-1",
          role: "tool",
          content: [
            "browser_search completed",
            "",
            "Input",
            "GMI_CLOUD_API_KEY=glm-live-secret-value123 browser_search Scottsdale romantic theater",
            "",
            "Result",
            "Returned Scottsdale venue pages with event dates and booking URLs.",
          ].join("\n"),
          createdAt: "2026-05-19T16:00:01.000Z",
          metadata: { toolName: "browser_search", status: "done" },
        },
        {
          id: "tool-2",
          threadId: "thread-1",
          role: "tool",
          content: "ambient_cli failed\nRaw stdout was not a typed collection.",
          createdAt: "2026-05-19T16:00:02.000Z",
          metadata: { toolName: "ambient_cli", status: "error" },
        },
      ],
      now: "2026-05-19T16:00:04.000Z",
    });

    const prompt = workflowRecordingReviewPromptFromState(stopped, { feedback: "Make the validation reusable instead of naming exact files." });

    expect(prompt).toContain("workflow_recording_review_update_draft");
    expect(prompt).toContain("Durable fields must describe the reusable procedure");
    expect(prompt).toContain("Do not put run-specific filenames");
    expect(prompt).toContain("User review feedback to apply:");
    expect(prompt).toContain("Make the validation reusable");
    expect(prompt).toContain("browser_search");
    expect(prompt).toContain("ambient_cli");
    expect(prompt).toContain("Is this workflow summary correct? Reply with corrections or say Confirm.");
    expect(prompt).not.toContain("glm-live-secret-value123");
  });

  it("rejects run-discovered filenames and local paths in reusable review fields", () => {
    const stopped = stopWorkflowRecordingState({
      current: { status: "recording", goal: "Summarize the two largest PDFs in the download directory.", startedAt: "2026-05-19T15:59:00.000Z" },
      messages: [
        {
          id: "user-1",
          threadId: "thread-1",
          role: "user",
          content: "Please summarize the two largest PDFs in my download directory and write the summary to an HTML file.",
          createdAt: "2026-05-19T16:00:00.000Z",
        },
        {
          id: "tool-1",
          threadId: "thread-1",
          role: "tool",
          content: [
            "bash completed",
            "",
            "Result",
            "/Users/travis/Downloads/Ambient UAE.pdf",
            "/Users/travis/Downloads/Complete_with_Docusign_OVH_US_LLC_Mechanus_L.pdf",
            "Successfully wrote /Users/travis/Documents/ambientCoderArchive/pdf-summaries.html",
          ].join("\n"),
          createdAt: "2026-05-19T16:00:01.000Z",
          metadata: { toolName: "bash", status: "done" },
        },
      ],
      now: "2026-05-19T16:00:04.000Z",
    });

    const issues = validateWorkflowRecordingReviewDraftForReuse({
      current: stopped,
      draft: {
        intent: "Summarize the two largest PDFs in the download directory.",
        inputs: ["Target directory: the user's download directory"],
        successfulExamples: [{ toolName: "bash", resultPreview: "Confirmed Ambient UAE.pdf and Complete_with_Docusign_OVH_US_LLC_Mechanus_L.pdf were selected." }],
        doNot: [],
        validation: ["Ambient UAE.pdf and Complete_with_Docusign_OVH_US_LLC_Mechanus_L.pdf are the two largest PDFs."],
        outputShape: ["HTML summary at /Users/travis/Documents/ambientCoderArchive/pdf-summaries.html"],
      },
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "successfulExamples[0].resultPreview", term: "Complete_with_Docusign_OVH_US_LLC_Mechanus_L.pdf", reason: "run_specific_file" }),
        expect.objectContaining({ field: "validation[0]", term: "Complete_with_Docusign_OVH_US_LLC_Mechanus_L.pdf", reason: "run_specific_file" }),
        expect.objectContaining({ field: "outputShape[0]", reason: "local_path" }),
      ]),
    );
  });

  it("allows filenames that were explicit user inputs instead of discovered evidence", () => {
    const stopped = stopWorkflowRecordingState({
      current: { status: "recording", goal: "Summarize briefing.pdf.", startedAt: "2026-05-19T15:59:00.000Z" },
      messages: [
        {
          id: "user-1",
          threadId: "thread-1",
          role: "user",
          content: "Summarize briefing.pdf and write notes.",
          createdAt: "2026-05-19T16:00:00.000Z",
        },
        {
          id: "tool-1",
          threadId: "thread-1",
          role: "tool",
          content: "read completed\nResult\nbriefing.pdf has ten pages.",
          createdAt: "2026-05-19T16:00:01.000Z",
          metadata: { toolName: "read", status: "done" },
        },
      ],
      now: "2026-05-19T16:00:04.000Z",
    });

    expect(validateWorkflowRecordingReviewDraftForReuse({
      current: stopped,
      draft: {
        intent: "Summarize briefing.pdf and write notes.",
        inputs: ["Target file: briefing.pdf"],
        successfulExamples: [{ toolName: "read", inputPreview: "Read briefing.pdf." }],
        doNot: [],
        validation: ["The requested file was summarized."],
        outputShape: ["Notes document."],
      },
    })).toEqual([]);
  });

  it("confirms a stopped recording review while preserving the draft separately", () => {
    const stopped = stopWorkflowRecordingState({
      current: { status: "recording", goal: "Confirmable workflow", startedAt: "2026-05-19T15:59:00.000Z" },
      messages: [
        {
          id: "user-1",
          threadId: "thread-1",
          role: "user",
          content: "Find a repeatable workflow.",
          createdAt: "2026-05-19T16:00:00.000Z",
        },
        {
          id: "tool-1",
          threadId: "thread-1",
          role: "tool",
          content: "browser_search completed\nReturned usable results.",
          createdAt: "2026-05-19T16:00:01.000Z",
          metadata: { toolName: "browser_search", status: "done" },
        },
      ],
      now: "2026-05-19T16:00:04.000Z",
    });

    const confirmed = confirmWorkflowRecordingReviewState({
      current: stopped,
      now: "2026-05-19T16:01:00.000Z",
    });

    expect(confirmed.review).toMatchObject({
      status: "confirmed",
      draft: { status: "draft", intent: "Confirmable workflow" },
      confirmed: {
        status: "confirmed",
        intent: "Confirmable workflow",
        confirmedAt: "2026-05-19T16:01:00.000Z",
      },
    });
    expect(confirmed.capture?.messageCount).toBe(stopped.capture?.messageCount);
  });

  it("applies a structured Pi summary as a revised draft before confirmation", () => {
    const stopped = stopWorkflowRecordingState({
      current: { status: "recording", goal: "Initial Scottsdale workflow", startedAt: "2026-05-19T15:59:00.000Z" },
      messages: [
        {
          id: "user-1",
          threadId: "thread-1",
          role: "user",
          content: "Find date night events.",
          createdAt: "2026-05-19T16:00:00.000Z",
        },
        {
          id: "tool-1",
          threadId: "thread-1",
          role: "tool",
          content: "browser_search completed\nReturned venue pages.",
          createdAt: "2026-05-19T16:00:01.000Z",
          metadata: { toolName: "browser_search", status: "done" },
        },
      ],
      now: "2026-05-19T16:00:04.000Z",
    });

    const revised = applyWorkflowRecordingSummaryState({
      current: stopped,
      now: "2026-05-19T16:01:00.000Z",
      markdown: [
        "## Intent",
        "Find live Scottsdale theater events suitable for a romantic date night.",
        "",
        "## Inputs",
        "- Location: Scottsdale",
        "- Occasion: romantic date night",
        "",
        "## Successful tool examples",
        "- `browser_search`: search live venue/event pages and keep titles, dates, and booking URLs.",
        "",
        "## Do Not",
        "- `ambient_cli`: failed when raw stdout was treated as a typed collection.",
        "",
        "## Validation",
        "- Each recommendation includes venue, date, booking URL, and date-night rationale.",
        "",
        "## Output shape",
        "- Ranked recommendations with booking links.",
        "",
        "## Confirmation question",
        "Is this workflow summary correct? Reply with corrections or say Confirm.",
      ].join("\n"),
    });

    expect(revised.review).toMatchObject({
      status: "draft",
      draft: {
        source: "pi_summary",
        generatedAt: "2026-05-19T16:01:00.000Z",
        intent: "Find live Scottsdale theater events suitable for a romantic date night.",
        inputs: ["Location: Scottsdale", "Occasion: romantic date night"],
        successfulExamples: [{ toolName: "browser_search" }],
        doNot: [{ toolName: "ambient_cli", status: "failed" }],
      },
    });
    expect(revised.review?.draft.validation.join("\n")).toContain("booking URL");
  });

  it("applies user review edits as a new draft while preserving confirmed history", () => {
    const stopped = stopWorkflowRecordingState({
      current: { status: "recording", goal: "Initial review workflow", startedAt: "2026-05-19T15:59:00.000Z" },
      messages: [
        {
          id: "user-1",
          threadId: "thread-1",
          role: "user",
          content: "Find date night events with secret key sk-live-review-edit-123.",
          createdAt: "2026-05-19T16:00:00.000Z",
        },
        {
          id: "tool-1",
          threadId: "thread-1",
          role: "tool",
          content: "browser_search completed\nReturned venue pages.",
          createdAt: "2026-05-19T16:00:01.000Z",
          metadata: { toolName: "browser_search", status: "done" },
        },
      ],
      now: "2026-05-19T16:00:04.000Z",
    });
    const confirmed = confirmWorkflowRecordingReviewState({
      current: stopped,
      now: "2026-05-19T16:01:00.000Z",
    });

    const edited = updateWorkflowRecordingReviewDraftState({
      current: confirmed,
      now: "2026-05-19T16:02:00.000Z",
      draft: {
        intent: "Find romantic Scottsdale theater events without exposing sk-live-review-edit-123.",
        inputs: ["City: Scottsdale", "Occasion: date night"],
        successfulExamples: [{ toolName: "browser_search", inputPreview: "Scottsdale theater", resultPreview: "Returned venue pages." }],
        doNot: [{ toolName: "browser_open", status: "failed", reason: "Avoid pages that returned 403." }],
        validation: ["Each option has a date, venue, booking URL, and fit rationale."],
        outputShape: ["Ranked shortlist with caveats."],
      },
    });

    expect(edited.review).toMatchObject({
      status: "draft",
      draft: {
        source: "user_edit",
        generatedAt: "2026-05-19T16:02:00.000Z",
        intent: "Find romantic Scottsdale theater events without exposing [REDACTED].",
        inputs: ["City: Scottsdale", "Occasion: date night"],
        successfulExamples: [{ toolName: "browser_search", inputPreview: "Scottsdale theater" }],
        doNot: [{ toolName: "browser_open", status: "failed" }],
      },
      confirmed: {
        status: "confirmed",
        intent: "Initial review workflow",
      },
    });
    expect(edited.review?.draft.confirmedAt).toBeUndefined();
  });

  it("records workflow review validation issues without changing draft content", () => {
    const stopped = stopWorkflowRecordingState({
      current: { status: "recording", goal: "Reusable workflow", startedAt: "2026-05-19T15:59:00.000Z" },
      messages: [
        {
          id: "user-1",
          threadId: "thread-1",
          role: "user",
          content: "Summarize a PDF.",
          createdAt: "2026-05-19T16:00:00.000Z",
        },
      ],
      now: "2026-05-19T16:00:04.000Z",
    });

    const rejected = workflowRecordingApplyReviewValidationIssues({
      current: stopped,
      now: "2026-05-19T16:02:00.000Z",
      issues: [
        {
          field: "intent",
          term: "/Users/travis/Downloads/file.pdf",
          reason: "local_path",
          message: "The draft contains a local path.",
          suggestion: "Describe the input generically.",
        },
      ],
    });

    expect(rejected?.review).toMatchObject({
      validationRejectedAt: "2026-05-19T16:02:00.000Z",
      validationIssues: [
        {
          field: "intent",
          reason: "local_path",
        },
      ],
      draft: stopped.review?.draft,
    });
    expect(workflowRecordingApplyReviewValidationIssues({ current: { status: "recording", startedAt: "now" }, issues: [] })).toBeUndefined();
  });
});

describeNative("workflow recorder store (requires Node ABI better-sqlite3 build)", () => {
  let workspacePath = "";
  let store: ProjectStore;

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-workflow-recorder-"));
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
  });

  afterEach(async () => {
    store.close();
    await rm(workspacePath, { recursive: true, force: true });
  });

  it("records a normal chat transcript with successful and failed tool evidence", async () => {
    const thread = store.createWorkflowRecordingThread({
      goal: "Find a simple date night event and explain the path.",
      workspacePath,
    });

    expect(thread.title).toContain("Workflow Recording:");
    expect(thread.workflowRecording).toMatchObject({
      status: "recording",
      goal: "Find a simple date night event and explain the path.",
    });

    store.addMessage({ threadId: thread.id, role: "user", content: "Find Scottsdale theater events." });
    store.addMessage({
      threadId: thread.id,
      role: "tool",
      content: "browser_search completed\nFound 3 event listing pages.",
      metadata: { toolName: "browser_search", toolCallId: "tool-1", status: "done", artifactPath: ".ambient/tool-outputs/search.txt" },
    });
    store.addMessage({
      threadId: thread.id,
      role: "tool",
      content: "browser_open failed\nVenue page returned 403.",
      metadata: { toolName: "browser_open", toolCallId: "tool-2", status: "error" },
    });
    store.addMessage({ threadId: thread.id, role: "assistant", content: "Here are two viable events and the failed page to avoid.", metadata: { status: "done" } });

    const stopped = store.stopWorkflowRecording(thread.id);

    expect(stopped).toMatchObject({
      status: "stopped",
      goal: "Find a simple date night event and explain the path.",
      capture: {
        messageCount: 4,
        userMessageCount: 1,
        assistantMessageCount: 1,
        toolResultCount: 2,
        successfulToolResultCount: 1,
        failedToolResultCount: 1,
      },
    });
    expect(stopped.capture?.events.map((event) => [event.kind, event.status, event.toolName])).toEqual([
      ["user_message", "succeeded", undefined],
      ["tool_result", "succeeded", "browser_search"],
      ["tool_result", "failed", "browser_open"],
      ["assistant_message", "succeeded", undefined],
    ]);
    expect(stopped.review?.draft).toMatchObject({
      status: "draft",
      source: "deterministic_capture",
      intent: "Find a simple date night event and explain the path.",
      evidenceSummary: {
        messageCount: 4,
        successfulToolResultCount: 1,
        failedToolResultCount: 1,
      },
    });
    const confirmed = store.confirmWorkflowRecordingReview(thread.id);
    expect(confirmed.review).toMatchObject({
      status: "confirmed",
      draft: { status: "draft" },
      confirmed: {
        status: "confirmed",
        intent: "Find a simple date night event and explain the path.",
      },
      savedPlaybook: {
        enabled: true,
        version: 1,
      },
    });
    expect(confirmed.review?.savedPlaybook?.rootPath).toContain(join(workspacePath, ".ambient", "workflows"));
    const saved = confirmed.review!.savedPlaybook!;
    const manifest = JSON.parse(await readFile(saved.manifestPath, "utf8"));
    const markdown = await readFile(saved.markdownPath, "utf8");
    const sidecar = JSON.parse(await readFile(saved.sidecarPath, "utf8"));
    const transcript = await readFile(saved.transcriptPath, "utf8");
    const index = JSON.parse(await readFile(saved.indexPath, "utf8"));
    expect(manifest).toMatchObject({
      kind: "ambient-workflow",
      id: saved.id,
      source: "./workflow.md",
      sidecar: "./workflow.json",
      transcript: "./transcript.jsonl",
    });
    expect(markdown).toContain("## Successful tool examples");
    expect(markdown).toContain("`browser_search`");
    expect(sidecar).toMatchObject({
      kind: "ambient-workflow-sidecar",
      id: saved.id,
      playbook: { intent: "Find a simple date night event and explain the path." },
    });
    expect(transcript).toContain("\"toolName\":\"browser_search\"");
    expect(index.workflows).toEqual([
      expect.objectContaining({
        id: saved.id,
        enabled: true,
        threadId: thread.id,
        markdownPath: `${saved.id}/workflow.md`,
      }),
    ]);

    store.addMessage({
      threadId: thread.id,
      role: "assistant",
      content: [
        "## Intent",
        "Find and explain a simple date night event workflow.",
        "",
        "## Inputs",
        "- City and event preference.",
        "",
        "## Successful tool examples",
        "- `browser_search`: use typed browser search results before opening venue pages.",
        "",
        "## Do Not",
        "- `browser_open`: failed on one blocked venue page.",
        "",
        "## Validation",
        "- Final answer includes viable events and failed pages to avoid.",
        "",
        "## Output shape",
        "- Recommendations with source notes.",
        "",
        "## Confirmation question",
        "Is this workflow summary correct? Reply with corrections or say Confirm.",
      ].join("\n"),
      metadata: { status: "done" },
    });
    const revised = store.applyWorkflowRecordingSummary(thread.id);
    expect(revised.review).toMatchObject({
      status: "draft",
      draft: {
        source: "pi_summary",
        intent: "Find and explain a simple date night event workflow.",
        successfulExamples: [{ toolName: "browser_search" }],
      },
      confirmed: {
        status: "confirmed",
        intent: "Find a simple date night event and explain the path.",
      },
    });

    const userEdited = store.updateWorkflowRecordingReviewDraft(thread.id, {
      intent: "Find and explain a simple Scottsdale date night workflow.",
      inputs: ["City and event preference.", "Date-night fit criteria."],
      successfulExamples: [{ toolName: "browser_search", inputPreview: "Scottsdale theater", resultPreview: "Typed browser results." }],
      doNot: [{ toolName: "browser_open", status: "failed", reason: "Avoid blocked venue pages." }],
      validation: ["Final answer includes viable events and source notes."],
      outputShape: ["Recommendations with source notes."],
    });
    expect(userEdited.review).toMatchObject({
      status: "draft",
      draft: {
        source: "user_edit",
        intent: "Find and explain a simple Scottsdale date night workflow.",
        inputs: ["City and event preference.", "Date-night fit criteria."],
      },
      confirmed: {
        status: "confirmed",
        intent: "Find a simple date night event and explain the path.",
      },
      savedPlaybook: {
        id: saved.id,
        version: 1,
      },
    });

    const reconfirmed = store.confirmWorkflowRecordingReview(thread.id);
    expect(reconfirmed.review).toMatchObject({
      status: "confirmed",
      confirmed: {
        status: "confirmed",
        source: "user_edit",
        intent: "Find and explain a simple Scottsdale date night workflow.",
      },
      savedPlaybook: {
        id: saved.id,
        version: 2,
      },
    });
    const updatedIndex = JSON.parse(await readFile(saved.indexPath, "utf8"));
    expect(updatedIndex.workflows).toEqual([
      expect.objectContaining({
        id: saved.id,
        version: 2,
      }),
    ]);
    const libraryMatches = store.listWorkflowRecordingLibrary({ query: "browser_search scottsdale date night" });
    expect(libraryMatches[0]).toMatchObject({
      id: saved.id,
      enabled: true,
      threadId: thread.id,
      version: 2,
      toolNames: ["browser_search"],
      outputShape: ["Recommendations with source notes."],
    });
    expect(libraryMatches[0]?.score).toBeGreaterThan(0);
    const libraryDescription = store.describeWorkflowRecording(saved.id);
    expect(libraryDescription).toMatchObject({
      id: saved.id,
      version: 2,
      versions: [
        expect.objectContaining({ version: 2 }),
        expect.objectContaining({ version: 1 }),
      ],
      playbook: {
        intent: "Find and explain a simple Scottsdale date night workflow.",
      },
      manifest: {
        kind: "ambient-workflow",
        version: 2,
      },
    });
    expect(libraryDescription.markdownPreview).toContain("Find and explain a simple Scottsdale date night workflow.");
    const restoredDescription = store.restoreWorkflowRecordingVersion(saved.id, 1);
    expect(restoredDescription).toMatchObject({
      id: saved.id,
      version: 3,
      versions: [
        expect.objectContaining({ version: 3, restoredFromVersion: 1 }),
        expect.objectContaining({ version: 2 }),
        expect.objectContaining({ version: 1 }),
      ],
      playbook: {
        intent: "Find a simple date night event and explain the path.",
      },
    });
    expect(restoredDescription.markdownPreview).toContain("Restored from version: 1");
    const restoredIndex = JSON.parse(await readFile(saved.indexPath, "utf8"));
    expect(restoredIndex.workflows[0]).toMatchObject({
      id: saved.id,
      version: 3,
      versions: [
        expect.objectContaining({ version: 3, restoredFromVersion: 1 }),
        expect.objectContaining({ version: 2 }),
        expect.objectContaining({ version: 1 }),
      ],
    });
    const disabledDescription = store.setWorkflowRecordingEnabled(saved.id, false);
    expect(disabledDescription.enabled).toBe(false);
    expect(store.listWorkflowRecordingLibrary({ query: "simple date night" })).toEqual([]);
    expect(store.listWorkflowRecordingLibrary({ query: "simple date night", includeDisabled: true })[0]).toMatchObject({
      id: saved.id,
      enabled: false,
      version: 3,
    });
    const disabledIndex = JSON.parse(await readFile(saved.indexPath, "utf8"));
    const disabledManifest = JSON.parse(await readFile(saved.manifestPath, "utf8"));
    const disabledSidecar = JSON.parse(await readFile(saved.sidecarPath, "utf8"));
    expect(disabledIndex.workflows[0]).toMatchObject({ id: saved.id, enabled: false });
    expect(disabledManifest).toMatchObject({ id: saved.id, enabled: false });
    expect(disabledSidecar).toMatchObject({ id: saved.id, enabled: false });
    store.setWorkflowRecordingEnabled(saved.id, true);

    const editedDescription = store.updateWorkflowRecordingPlaybook(saved.id, {
      baseVersion: 3,
      draft: {
        intent: "Find refined Scottsdale date night theatre options.",
        inputs: ["City", "Date window", "Date-night fit criteria"],
        successfulExamples: [{ toolName: "browser_search", inputPreview: "Scottsdale theatre date night", resultPreview: "Reusable venue result pages." }],
        doNot: [{ toolName: "browser_open", status: "failed", reason: "Avoid blocked or stale venue pages." }],
        validation: ["Final answer ranks source-backed theatre options."],
        outputShape: ["Ranked theatre shortlist with source notes."],
      },
    });
    expect(editedDescription).toMatchObject({
      id: saved.id,
      version: 4,
      playbook: {
        status: "confirmed",
        source: "user_edit",
        intent: "Find refined Scottsdale date night theatre options.",
      },
    });
    expect(() => store.updateWorkflowRecordingPlaybook(saved.id, {
      baseVersion: 3,
      draft: {
        intent: "Stale edit",
        inputs: [],
        successfulExamples: [],
        doNot: [],
        validation: [],
        outputShape: [],
      },
    })).toThrow(/expected v3, current v4/);

    const archivedDescription = store.archiveWorkflowRecording(saved.id, {
      baseVersion: 4,
      reason: "Superseded by a better date night workflow.",
    });
    expect(archivedDescription).toMatchObject({
      id: saved.id,
      version: 4,
      archivedReason: "Superseded by a better date night workflow.",
    });
    expect(archivedDescription.archivedAt).toBeTruthy();
    expect(store.listWorkflowRecordingLibrary({ query: "refined scottsdale" })).toEqual([]);
    expect(store.listWorkflowRecordingLibrary({ query: "refined scottsdale", includeArchived: true })[0]).toMatchObject({
      id: saved.id,
      archivedReason: "Superseded by a better date night workflow.",
    });
    expect(() => store.describeWorkflowRecording(saved.id)).toThrow(/Workflow recording not found/);
    expect(store.describeWorkflowRecording(saved.id, { includeArchived: true })).toMatchObject({
      id: saved.id,
      archivedReason: "Superseded by a better date night workflow.",
    });
    const unarchivedDescription = store.unarchiveWorkflowRecording(saved.id, { baseVersion: 4 });
    expect(unarchivedDescription.archivedAt).toBeUndefined();
    expect(store.listWorkflowRecordingLibrary({ query: "refined scottsdale" })[0]).toMatchObject({
      id: saved.id,
      version: 4,
    });

    store.close();
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
    expect(store.getThread(thread.id).workflowRecording?.capture?.failedToolResultCount).toBe(1);
    expect(store.getThread(thread.id).workflowRecording?.review?.draft.source).toBe("user_edit");
    expect(store.getThread(thread.id).workflowRecording?.review?.draft.intent).toBe("Find and explain a simple Scottsdale date night workflow.");
    expect(store.getThread(thread.id).workflowRecording?.review?.confirmed?.status).toBe("confirmed");
    expect(store.getThread(thread.id).workflowRecording?.review?.confirmed?.intent).toBe("Find refined Scottsdale date night theatre options.");
    expect(store.getThread(thread.id).workflowRecording?.review?.savedPlaybook?.version).toBe(4);
  });

  it("blocks saving a stopped recording when durable fields still contain run-specific paths", () => {
    const thread = store.createWorkflowRecordingThread({
      goal: "Summarize the two largest PDFs in the download directory.",
      workspacePath,
    });
    store.addMessage({
      threadId: thread.id,
      role: "user",
      content: "Please summarize the two largest PDFs in my download directory and write the summary to an HTML file.",
    });
    store.addMessage({
      threadId: thread.id,
      role: "tool",
      content: "bash completed\nResult\n/Users/travis/Downloads/Ambient UAE.pdf\nSuccessfully wrote /Users/travis/Documents/ambientCoderArchive/pdf-summaries.html",
      metadata: { toolName: "bash", status: "done" },
    });
    store.stopWorkflowRecording(thread.id);

    expect(() => store.confirmWorkflowRecordingReview(thread.id)).toThrow(/Rejected durable workflow draft/);
    expect(store.getThread(thread.id).workflowRecording?.review?.validationIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: "local_path" }),
      ]),
    );
  });

  it("discovers recorder playbooks saved under a thread workspace that differs from the active project", async () => {
    const threadWorkspacePath = await mkdtemp(join(tmpdir(), "ambient-workflow-recorder-thread-"));
    try {
      const thread = store.createWorkflowRecordingThread({
        goal: "Find a romantic dinner spot in Scottsdale.",
        workspacePath: threadWorkspacePath,
      });
      store.addMessage({ threadId: thread.id, role: "user", content: "Find a Scottsdale dinner spot for a romantic date night." });
      store.addMessage({
        threadId: thread.id,
        role: "tool",
        content: "browser_search completed\nFound restaurant roundups and reservation pages.",
        metadata: { toolName: "browser_search", toolCallId: "tool-1", status: "done" },
      });
      store.addMessage({
        threadId: thread.id,
        role: "assistant",
        content: "Use search first, then compare source-backed dinner recommendations.",
        metadata: { status: "done" },
      });

      store.stopWorkflowRecording(thread.id);
      const confirmed = store.confirmWorkflowRecordingReview(thread.id);
      const saved = confirmed.review!.savedPlaybook!;

      expect(saved.indexPath).toContain(join(threadWorkspacePath, ".ambient", "workflows", "index.json"));
      const matches = store.listWorkflowRecordingLibrary({ query: "romantic dinner browser_search" });
      expect(matches[0]).toMatchObject({
        id: saved.id,
        markdownPath: saved.markdownPath,
        toolNames: ["browser_search"],
      });
      expect(store.describeWorkflowRecording(saved.id)).toMatchObject({
        id: saved.id,
        markdownPath: saved.markdownPath,
        playbook: {
          intent: "Find a romantic dinner spot in Scottsdale.",
        },
      });
      expect(store.setWorkflowRecordingEnabled(saved.id, false)).toMatchObject({
        id: saved.id,
        enabled: false,
      });
      expect(store.listWorkflowRecordingLibrary({ query: "romantic dinner" })).toEqual([]);
      expect(store.listWorkflowRecordingLibrary({ query: "romantic dinner", includeDisabled: true })[0]).toMatchObject({
        id: saved.id,
        enabled: false,
      });
    } finally {
      await rm(threadWorkspacePath, { recursive: true, force: true });
    }
  });
});
