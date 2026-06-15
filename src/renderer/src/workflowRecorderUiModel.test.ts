import { describe, expect, it } from "vitest";
import {
  workflowRecorderInjectedPlaybookChip,
  workflowRecorderEditWithAmbientModel,
  workflowRecorderLegacyCompilerEnabled,
  workflowRecorderLibrarySidebarRows,
  workflowRecorderReviewDraftUpdateFromEditorFields,
  workflowRecorderReviewEditorFieldsFromDraft,
  workflowRecorderReviewModel,
  workflowRecorderStartActionState,
  workflowRecorderSurfaceModel,
} from "./workflowRecorderUiModel";

describe("workflow recorder UI model", () => {
  it("keeps the legacy compiler disabled by default", () => {
    expect(workflowRecorderLegacyCompilerEnabled(undefined)).toBe(false);
    expect(workflowRecorderLegacyCompilerEnabled("")).toBe(false);
    expect(workflowRecorderLegacyCompilerEnabled("0")).toBe(false);
    expect(workflowRecorderLegacyCompilerEnabled("false")).toBe(false);
  });

  it("recognizes explicit legacy compiler flags", () => {
    expect(workflowRecorderLegacyCompilerEnabled("1")).toBe(true);
    expect(workflowRecorderLegacyCompilerEnabled("true")).toBe(true);
    expect(workflowRecorderLegacyCompilerEnabled("YES")).toBe(true);
    expect(workflowRecorderLegacyCompilerEnabled(true)).toBe(true);
  });

  it("models injected workflow playbook tool metadata as a visible chat chip", () => {
    const chip = workflowRecorderInjectedPlaybookChip({
      toolName: "ambient_workflows_inject",
      toolResultDetails: {
        workflowPlaybook: {
          id: "scottsdale-date-night",
          title: "Scottsdale date-night event discovery",
          version: 4,
          status: "injected",
          injected: true,
          toolNames: ["browser_search", "browser_open", "browser_extract"],
          outputShape: ["Ranked shortlist", "Booking links"],
          markdownTruncated: false,
        },
      },
    });

    expect(chip).toEqual({
      label: "Injected playbook · Scottsdale date-night event discovery v4",
      tooltip: "Scottsdale date-night event discovery · v4 · Tools: browser_search, browser_open, browser_extract · Output: Ranked shortlist; Booking links",
      workflowId: "scottsdale-date-night",
      version: 4,
    });
  });

  it("does not show an injected playbook chip for describe-only preflight metadata", () => {
    expect(
      workflowRecorderInjectedPlaybookChip({
        toolResultDetails: {
          workflowPlaybook: {
            id: "scottsdale-date-night",
            version: 4,
            status: "preflight-description",
            injected: false,
            toolNames: ["browser_search"],
            outputShape: ["Ranked shortlist"],
            markdownTruncated: false,
          },
        },
      }),
    ).toBeUndefined();
  });

  it("models the recorder surface as the default user-facing workflow area", () => {
    const model = workflowRecorderSurfaceModel();
    expect(model.legacyCompilerEnabled).toBe(false);
    expect(model.navLabel).toBe("Workflow Recordings");
    expect(model.primaryCreateLabel).toBe("New Workflow Recording");
    expect(model.newWorkflowDetail).toBe("Record");
    expect(model.helpText).toContain("searchable playbooks");
    expect(model.recordingChatEmptyState?.title).toBe("Workflow Recorder");
    expect(model.recordingChatEmptyState?.paragraphs.join(" ")).toContain("repeatable task");
    expect(model.recordingChatEmptyState?.paragraphs.join(" ")).toContain("Review with Ambient");
    expect(model.startPane.bannerTitle).toBe("Start a Workflow Recording");
    expect(model.startPane.disabledStartTitle).toContain("begin recording workflow evidence");
    expect(model.chatBanner.recordingTitle).toBe('Workflow Started. Press "Review with Ambient" to stop and review.');
    expect(model.chatBanner.stopAndReviewButtonLabel).toBe("Review with Ambient");
    expect(model.chatBanner.stopAndReviewButtonTitle).toContain("redacted draft playbook");
    expect(model.chatBanner.reviewButtonLabel).toBe("Review with Ambient");
    expect(model.chatBanner.retryReviewButtonLabel).toBe("Retry review");
    expect(model.chatBanner.confirmButtonLabel).toBe("Confirm playbook");
    expect(model.chatBanner.applySummaryButtonLabel).toBe("Apply latest Ambient summary");
    expect(model.legacyHidden.enableInstruction).toContain("AMBIENT_LEGACY_WORKFLOW_COMPILER=1");
  });

  it("requires a typed recording goal before starting", () => {
    expect(workflowRecorderStartActionState({ request: "   ", readyTitle: "Start recording" })).toMatchObject({
      disabled: true,
      needsRequest: true,
      title: "Type a recording goal before starting.",
    });
    expect(workflowRecorderStartActionState({ request: "Find date-night events", readyTitle: "Start recording" })).toMatchObject({
      disabled: false,
      needsRequest: false,
      title: "Start recording",
    });
    expect(workflowRecorderStartActionState({ request: "Find date-night events", busy: true, readyTitle: "Start recording" })).toMatchObject({
      disabled: true,
      needsRequest: false,
      title: "Starting workflow recording.",
    });
  });

  it("preserves legacy labels when the developer flag is enabled", () => {
    const model = workflowRecorderSurfaceModel({ legacyCompilerEnabled: true });
    expect(model.legacyCompilerEnabled).toBe(true);
    expect(model.navLabel).toBe("Workflow Agents");
    expect(model.primaryCreateLabel).toBe("New Workflow");
    expect(model.newWorkflowDetail).toBe("Discovery");
    expect(model.workflowTooltip).toContain("compiles an approved plan");
    expect(model.chatBanner.reviewButtonTitle).toContain("disabled");
    expect(model.chatBanner.stopAndReviewButtonTitle).toContain("disabled");
    expect(model.chatBanner.confirmButtonTitle).toContain("disabled");
    expect(model.chatBanner.applySummaryButtonTitle).toContain("disabled");
  });

  it("models saved playbooks as sidebar rows with enabled items first", () => {
    const rows = workflowRecorderLibrarySidebarRows([
      {
        id: "disabled",
        title: "Disabled workflow",
        version: 1,
        enabled: false,
        savedAt: "2026-05-19T18:00:00.000Z",
        manifestPath: "/tmp/disabled/ambient-workflow.json",
        markdownPath: "/tmp/disabled/workflow.md",
        sidecarPath: "/tmp/disabled/workflow.json",
        transcriptPath: "/tmp/disabled/transcript.jsonl",
        summary: "Disabled summary",
        toolNames: [],
        outputShape: ["Disabled output"],
        versions: [{ version: 1, title: "Disabled workflow", savedAt: "2026-05-19T18:00:00.000Z", manifestPath: "", markdownPath: "", sidecarPath: "", transcriptPath: "" }],
      },
      {
        id: "date-night",
        title: "Date-night live event discovery",
        version: 3,
        enabled: true,
        savedAt: "2026-05-19T17:00:00.000Z",
        manifestPath: "/tmp/date/ambient-workflow.json",
        markdownPath: "/tmp/date/workflow.md",
        sidecarPath: "/tmp/date/workflow.json",
        transcriptPath: "/tmp/date/transcript.jsonl",
        summary: "Find date-night theater events.",
        toolNames: ["browser_search", "browser_open"],
        outputShape: ["Ranked shortlist"],
        versions: [
          { version: 3, title: "Date-night live event discovery", savedAt: "2026-05-19T17:00:00.000Z", manifestPath: "", markdownPath: "", sidecarPath: "", transcriptPath: "" },
          { version: 2, title: "Date-night live event discovery", savedAt: "2026-05-19T16:00:00.000Z", manifestPath: "", markdownPath: "", sidecarPath: "", transcriptPath: "" },
        ],
      },
    ]);

    expect(rows).toEqual([
      expect.objectContaining({
        id: "date-night",
        statusLabel: "Enabled · v3",
        versionCount: 2,
        toolLabel: "browser_search, browser_open",
      }),
      expect.objectContaining({
        id: "disabled",
        statusLabel: "Disabled · v1",
        toolLabel: "No tool examples",
      }),
    ]);
  });

  it("models saved playbook editing as a visible Ambient draft plus exact context", () => {
    const model = workflowRecorderEditWithAmbientModel({
      id: "date-night",
      title: "Date-night live event discovery",
      version: 3,
      enabled: true,
      savedAt: "2026-05-19T17:00:00.000Z",
      manifestPath: "/workspace/.ambient/workflows/date-night/ambient-workflow.json",
      markdownPath: "/workspace/.ambient/workflows/date-night/workflow.md",
      sidecarPath: "/workspace/.ambient/workflows/date-night/workflow.json",
      transcriptPath: "/workspace/.ambient/workflows/date-night/transcript.jsonl",
      summary: "Find date-night theater events.",
      toolNames: ["browser_search"],
      outputShape: ["Ranked shortlist"],
      versions: [
        { version: 3, title: "Date-night live event discovery", savedAt: "2026-05-19T17:00:00.000Z", manifestPath: "", markdownPath: "", sidecarPath: "", transcriptPath: "" },
      ],
    });

    expect(model.buttonLabel).toBe("Edit with Ambient");
    expect(model.draftPrefix).toBe('I\'d like to edit this workflow "Date-night live event discovery" to ');
    expect(model.context).toMatchObject({ id: "date-night", version: 3 });
    expect(model.browserPreviewPath).toBe("/workspace/.ambient/workflows/date-night/workflow.md");
  });

  it("models stopped recording review drafts for the chat banner", () => {
    const model = workflowRecorderReviewModel({
      status: "stopped",
      goal: "Find Scottsdale theater events.",
      startedAt: "2026-05-19T16:00:00.000Z",
      stoppedAt: "2026-05-19T16:01:00.000Z",
      review: {
        status: "draft",
        draft: {
          status: "draft",
          source: "deterministic_capture",
          generatedAt: "2026-05-19T16:01:00.000Z",
          sourceCapturedAt: "2026-05-19T16:01:00.000Z",
          intent: "Find Scottsdale theater events.",
          inputs: ["Find live events."],
          successfulExamples: [{ toolName: "browser_search", inputPreview: "Scottsdale theater", resultPreview: "Returned venue pages." }],
          doNot: [{ toolName: "ambient_cli", status: "failed", reason: "Raw stdout was not a typed collection." }],
          validation: ["Venue pages include dates and booking links."],
          outputShape: ["Recommendations with booking links."],
          evidenceSummary: {
            messageCount: 4,
            toolResultCount: 2,
            successfulToolResultCount: 1,
            failedToolResultCount: 1,
            skippedToolResultCount: 0,
            permissionBlockedToolResultCount: 0,
            redactionCount: 2,
          },
        },
      },
    });

    expect(model.available).toBe(true);
    expect(model.title).toBe("Draft workflow playbook");
    expect(model.statusLabel).toBe("Needs review");
    expect(model.metrics).toEqual([
      { label: "Messages", value: "4" },
      { label: "Successful tools", value: "1" },
      { label: "Failed tools", value: "1" },
      { label: "Redactions", value: "2" },
    ]);
    expect(model.sections[0].items[0]).toContain("browser_search");
    expect(model.sections[1].items[0]).toContain("Raw stdout");
  });

  it("serializes editable review fields back into a draft update", () => {
    const fields = workflowRecorderReviewEditorFieldsFromDraft({
      status: "draft",
      source: "deterministic_capture",
      generatedAt: "2026-05-19T16:01:00.000Z",
      sourceCapturedAt: "2026-05-19T16:01:00.000Z",
      intent: "Find Scottsdale date night events.",
      inputs: ["Scottsdale", "Romantic date night"],
      successfulExamples: [{ toolName: "browser_search", inputPreview: "Scottsdale theater", resultPreview: "Returned venue pages.", artifactPath: ".ambient/search.txt" }],
      doNot: [{ toolName: "browser_open", status: "failed", reason: "Venue page returned 403." }],
      validation: ["Each result has venue, date, and booking URL."],
      outputShape: ["Ranked shortlist."],
      evidenceSummary: {
        messageCount: 4,
        toolResultCount: 2,
        successfulToolResultCount: 1,
        failedToolResultCount: 1,
        skippedToolResultCount: 0,
        permissionBlockedToolResultCount: 0,
        redactionCount: 0,
      },
    });

    expect(fields.successfulExamples).toContain("browser_search | Scottsdale theater | Returned venue pages.");

    const update = workflowRecorderReviewDraftUpdateFromEditorFields({
      ...fields,
      intent: "Find and rank Scottsdale date night theater events.",
      doNot: "permission_blocked | gmail_fetch | Connector was not approved for this workflow.",
    });

    expect(update).toMatchObject({
      intent: "Find and rank Scottsdale date night theater events.",
      inputs: ["Scottsdale", "Romantic date night"],
      successfulExamples: [{ toolName: "browser_search", inputPreview: "Scottsdale theater", resultPreview: "Returned venue pages." }],
      doNot: [{ toolName: "gmail_fetch", status: "permission_blocked", reason: "Connector was not approved for this workflow." }],
      validation: ["Each result has venue, date, and booking URL."],
      outputShape: ["Ranked shortlist."],
    });
  });

  it("models confirmed review copies as ready for indexing", () => {
    const model = workflowRecorderReviewModel({
      status: "stopped",
      startedAt: "2026-05-19T16:00:00.000Z",
      stoppedAt: "2026-05-19T16:01:00.000Z",
      review: {
        status: "confirmed",
        draft: {
          status: "draft",
          source: "deterministic_capture",
          generatedAt: "2026-05-19T16:01:00.000Z",
          sourceCapturedAt: "2026-05-19T16:01:00.000Z",
          intent: "Draft intent",
          inputs: [],
          successfulExamples: [],
          doNot: [],
          validation: [],
          outputShape: [],
          evidenceSummary: {
            messageCount: 1,
            toolResultCount: 0,
            successfulToolResultCount: 0,
            failedToolResultCount: 0,
            skippedToolResultCount: 0,
            permissionBlockedToolResultCount: 0,
            redactionCount: 0,
          },
        },
        confirmed: {
          status: "confirmed",
          source: "deterministic_capture",
          generatedAt: "2026-05-19T16:01:00.000Z",
          confirmedAt: "2026-05-19T16:02:00.000Z",
          sourceCapturedAt: "2026-05-19T16:01:00.000Z",
          intent: "Confirmed intent",
          inputs: [],
          successfulExamples: [],
          doNot: [],
          validation: ["Confirmed validation"],
          outputShape: [],
          evidenceSummary: {
            messageCount: 1,
            toolResultCount: 0,
            successfulToolResultCount: 0,
            failedToolResultCount: 0,
            skippedToolResultCount: 0,
            permissionBlockedToolResultCount: 0,
            redactionCount: 0,
          },
        },
      },
    });

    expect(model.title).toBe("Confirmed workflow playbook");
    expect(model.statusLabel).toBe("Confirmed");
    expect(model.intent).toBe("Confirmed intent");
  });
});
