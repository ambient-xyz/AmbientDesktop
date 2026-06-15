import { describe, expect, it } from "vitest";
import {
  appendLocalTaskBlocker,
  decodeWorkflowSourceDrafts,
  encodeWorkflowSourceDrafts,
  compactLocalTaskBlockerLabel,
  latestRunForTask,
  localTaskBlockerLabels,
  localTaskBlockerOptions,
  localTaskCreateActionState,
  localTaskEditActionState,
  normalizeWorkflowSourceDrafts,
  parseLocalTaskLabels,
  parseLocalTaskPriority,
  removeLocalTaskBlocker,
  sanitizeLocalTaskPriorityInput,
  scheduleNextRunLabel,
  schedulePresetLabel,
  taskTriggerLabels,
  triggerPreviewLabel,
  workflowArtifactRevisionRequest,
  workflowCompileActionState,
  workflowConnectorAccountOptions,
  workflowConnectorConsentSummary,
  workflowConnectorRetentionDowngradeOptions,
  workflowModelCallReviewSummary,
  workflowSourceEditDiffSummary,
  workflowSourceDraftStorageKey,
  stepLocalTaskPriority,
} from "./automationUiModel";

describe("automation UI model", () => {
  it("sanitizes Local Task priority input for the supported backend range", () => {
    expect(sanitizeLocalTaskPriorityInput("p1-2x3y4")).toBe("123");
    expect(sanitizeLocalTaskPriorityInput("009")).toBe("009");
  });

  it("parses Local Task priority values", () => {
    expect(parseLocalTaskPriority("")).toEqual({});
    expect(parseLocalTaskPriority("009")).toEqual({ priority: 9 });
    expect(parseLocalTaskPriority("999")).toEqual({ priority: 999 });
    expect(parseLocalTaskPriority("1000")).toEqual({ error: "Priority must be a number from 0 to 999." });
    expect(parseLocalTaskPriority("high")).toEqual({ error: "Priority must be a number from 0 to 999." });
  });

  it("parses comma-separated Local Task labels", () => {
    expect(parseLocalTaskLabels("client, QA, client, release notes")).toEqual(["client", "QA", "release notes"]);
    expect(parseLocalTaskLabels("  ,  a   b  , c ")).toEqual(["a b", "c"]);
    expect(parseLocalTaskLabels(Array.from({ length: 25 }, (_value, index) => `label-${index}`).join(","))).toHaveLength(20);
  });

  it("steps Local Task priority within the backend-supported range", () => {
    expect(stepLocalTaskPriority(5, "higher")).toBe(4);
    expect(stepLocalTaskPriority(0, "higher")).toBe(0);
    expect(stepLocalTaskPriority(5, "lower")).toBe(6);
    expect(stepLocalTaskPriority(999, "lower")).toBe(999);
  });

  it("selects the first retained run for a Local Task", () => {
    const runs = [
      { id: "run-a", taskId: "task-a" },
      { id: "run-b", taskId: "task-b" },
      { id: "run-c", taskId: "task-a" },
    ];
    expect(latestRunForTask(runs as Parameters<typeof latestRunForTask>[0], "task-a")).toMatchObject({ id: "run-a" });
    expect(latestRunForTask(runs as Parameters<typeof latestRunForTask>[0], "missing")).toBeUndefined();
  });

  it("models Local Task blocker options and labels", () => {
    const tasks = [
      { id: "a", identifier: "LOCAL-1", title: "Foundation" },
      { id: "b", identifier: "LOCAL-2", title: "Dependent" },
      { id: "c", identifier: "LOCAL-3", title: "QA" },
    ];
    expect(localTaskBlockerOptions("b", ["LOCAL-1"], tasks)).toEqual([{ value: "LOCAL-3", label: "LOCAL-3: QA", fullLabel: "LOCAL-3: QA" }]);
    expect(localTaskBlockerLabels(["LOCAL-1", "missing"], tasks)).toEqual([
      { value: "LOCAL-1", label: "LOCAL-1: Foundation" },
      { value: "missing", label: "missing" },
    ]);
    expect(compactLocalTaskBlockerLabel({ id: "long", identifier: "LOCAL-10", title: "Validate Kanban density and repeated task controls" })).toBe(
      "LOCAL-10: Validate Kanban...",
    );
    expect(localTaskBlockerOptions("b", [], tasks)).toEqual([
      { value: "LOCAL-1", label: "LOCAL-1: Foundation", fullLabel: "LOCAL-1: Foundation" },
      { value: "LOCAL-3", label: "LOCAL-3: QA", fullLabel: "LOCAL-3: QA" },
    ]);
  });

  it("adds and removes Local Task blockers without duplicating refs", () => {
    expect(appendLocalTaskBlocker([], " LOCAL-1 ")).toEqual(["LOCAL-1"]);
    expect(appendLocalTaskBlocker(["LOCAL-1"], "LOCAL-1")).toEqual(["LOCAL-1"]);
    expect(appendLocalTaskBlocker(["LOCAL-1"], "")).toEqual(["LOCAL-1"]);
    expect(removeLocalTaskBlocker(["LOCAL-1", "LOCAL-2"], "LOCAL-1")).toEqual(["LOCAL-2"]);
  });

  it("models Local Task create button validation", () => {
    expect(localTaskCreateActionState({ title: "", priorityInput: "", busy: false })).toMatchObject({
      disabled: true,
      title: "Enter a task title.",
    });
    expect(localTaskCreateActionState({ title: "Ship it", priorityInput: "1000", busy: false })).toMatchObject({
      disabled: true,
      title: "Priority must be a number from 0 to 999.",
    });
    expect(localTaskCreateActionState({ title: "Ship it", priorityInput: "2", busy: false })).toMatchObject({
      label: "Add task",
      disabled: false,
    });
    expect(localTaskCreateActionState({ title: "Ship it", priorityInput: "2", busy: true })).toMatchObject({
      label: "Adding",
      disabled: true,
    });
  });

  it("models Local Task card edit validation", () => {
    expect(localTaskEditActionState({ title: "", dirty: true, busy: false })).toMatchObject({
      disabled: true,
      title: "Enter a task title.",
    });
    expect(localTaskEditActionState({ title: "Ship it", dirty: false, busy: false })).toMatchObject({
      disabled: true,
      title: "No task changes to save.",
    });
    expect(localTaskEditActionState({ title: "Ship it", dirty: true, busy: false })).toMatchObject({
      label: "Save card",
      disabled: false,
    });
    expect(localTaskEditActionState({ title: "Ship it", dirty: true, busy: true })).toMatchObject({
      label: "Saving",
      disabled: true,
    });
  });

  it("models Workflow Agent compile button validation", () => {
    expect(workflowCompileActionState({ request: "", compiling: false, blocked: false })).toMatchObject({
      label: "Skip discovery and compile",
      disabled: true,
      title: "Describe the workflow request first.",
    });
    expect(workflowCompileActionState({ request: "Find events", compiling: false, blocked: false })).toMatchObject({
      label: "Skip discovery and compile",
      disabled: false,
    });
    expect(workflowCompileActionState({ request: "Find events", compiling: true, blocked: false })).toMatchObject({
      label: "Compiling",
      disabled: true,
    });
    expect(workflowCompileActionState({ request: "Find events", compiling: false, blocked: true })).toMatchObject({
      label: "Skip discovery and compile",
      disabled: true,
      title: "Another workflow action is in progress.",
    });
  });

  it("builds a workflow artifact revision request draft", () => {
    expect(
      workflowArtifactRevisionRequest({
        title: "Weekend finder",
        status: "rejected",
        goal: "Find Scottsdale events.",
        summary: "Collect weekend activity options.",
        successCriteria: ["Return sources", "Avoid duplicates"],
      }),
    ).toBe(
      [
        "Revise this workflow preview.",
        "",
        "Artifact: Weekend finder",
        "Current status: rejected",
        "",
        "Original goal:",
        "Find Scottsdale events.",
        "",
        "Current summary:",
        "Collect weekend activity options.",
        "",
        "Success criteria:",
        "- Return sources",
        "- Avoid duplicates",
        "",
        "Requested changes:",
        "- ",
      ].join("\n"),
    );
  });

  it("builds connector account options from available OAuth accounts", () => {
    expect(
      workflowConnectorAccountOptions([
        { accountId: "primary", label: "Primary", email: "primary@example.test", status: "available" },
        { accountId: "primary", label: "Primary duplicate", status: "available" },
        { accountId: "expired", label: "Expired", status: "expired" },
        { accountId: "secondary", label: "Secondary", status: "available" },
      ]),
    ).toEqual([
      { value: "primary", label: "Primary <primary@example.test>" },
      { value: "secondary", label: "Secondary (secondary)" },
    ]);
  });

  it("summarizes workflow source edit diffs", () => {
    expect(workflowSourceEditDiffSummary("one\ntwo", "one\ntwo")).toEqual({
      added: 0,
      removed: 0,
      unchanged: 2,
      changed: false,
      label: "No source changes (2 lines)",
      previewLines: [],
    });
    expect(workflowSourceEditDiffSummary("one\ntwo", "one\ntwo\nthree")).toEqual({
      added: 1,
      removed: 0,
      unchanged: 2,
      changed: true,
      label: "Source diff +1 -0 (2 unchanged)",
      previewLines: [{ kind: "added", text: "three" }],
    });
    expect(workflowSourceEditDiffSummary("one\ntwo\nthree", "one\nchanged\nthree")).toEqual({
      added: 1,
      removed: 1,
      unchanged: 2,
      changed: true,
      label: "Source diff +1 -1 (2 unchanged)",
      previewLines: [
        { kind: "removed", text: "two" },
        { kind: "added", text: "changed" },
      ],
    });
  });

  it("encodes Workflow Agent source drafts for durable browser storage", () => {
    expect(workflowSourceDraftStorageKey).toBe("ambient.workflowSourceDrafts.v1");
    expect(
      normalizeWorkflowSourceDrafts({
        "artifact-b": "two",
        "artifact-a": "one",
        "artifact-empty": "",
        "artifact-invalid": 4,
        constructor: "pollution",
      }),
    ).toEqual({
      "artifact-a": "one",
      "artifact-b": "two",
      "artifact-empty": "",
    });
    expect(encodeWorkflowSourceDrafts({ "artifact-b": "two", "artifact-a": "one" })).toBe('{"artifact-a":"one","artifact-b":"two"}');
    expect(decodeWorkflowSourceDrafts('{"artifact-a":"one","artifact-b":"two"}')).toEqual({
      "artifact-a": "one",
      "artifact-b": "two",
    });
    expect(decodeWorkflowSourceDrafts("{not-json")).toEqual({});
    expect(decodeWorkflowSourceDrafts(null)).toEqual({});
  });

  it("summarizes Workflow Agent model calls for run review", () => {
    expect(
      workflowModelCallReviewSummary({
        task: "compiler.plan",
        status: "succeeded",
        input: { request: "Find events" },
        output: { ok: true },
        cacheKey: "workflow-sample-preview",
        model: "ambient-preview",
        latencyMs: 239.7,
      }),
    ).toEqual({
      taskLabel: "compiler.plan",
      statusLabel: "Status succeeded",
      metadataLabels: ["Model ambient-preview", "Replay workflow-sample-preview", "Latency 240ms"],
      inputPreview: 'Input {"request":"Find events"}',
      outputPreview: 'Output {"ok":true}',
    });
    expect(
      workflowModelCallReviewSummary({
        task: "",
        status: "",
        input: undefined,
        validationError: "schema failed",
        latencyMs: -10,
      }),
    ).toMatchObject({
      taskLabel: "Untitled model call",
      statusLabel: "Status unknown",
      metadataLabels: ["Latency 0ms", "Validation schema failed"],
      inputPreview: "Input undefined",
    });
  });

  it("models schedule intent labels and previews", () => {
    expect(taskTriggerLabels("manual", "daily", "")).toEqual(["trigger:manual"]);
    expect(taskTriggerLabels("auto_dispatch", "daily", "")).toEqual(["trigger:auto-dispatch"]);
    expect(taskTriggerLabels("scheduled", "advanced", "30 10 * * 6")).toEqual(["trigger:scheduled", "schedule:30 10 * * 6"]);
    expect(taskTriggerLabels("scheduled", "advanced", "")).toEqual(["trigger:scheduled", "schedule:custom"]);
    expect(schedulePresetLabel("advanced", "15 8 * * 1")).toBe("Cron 15 8 * * 1");
    expect(scheduleNextRunLabel("weekly", "", true)).toBe("Next Monday 9:00 AM window");
    expect(scheduleNextRunLabel("advanced", "", true)).toBe("Enter a cron expression");
    expect(scheduleNextRunLabel("daily", "", false)).toBe("Paused");
    expect(triggerPreviewLabel("manual", "daily", "")).toBe("Runs only when started manually.");
    expect(triggerPreviewLabel("auto_dispatch", "daily", "")).toBe("Eligible when Auto-dispatch is on.");
    expect(triggerPreviewLabel("scheduled", "advanced", "15 8 * * 1")).toBe("Next run follows 15 8 * * 1");
  });

  it("summarizes connector grants as consent review rows", () => {
    expect(
      workflowConnectorConsentSummary({
        connectorId: "workspace.inventory",
        accountId: "workspace",
        scopes: ["workspace.files.read"],
        operations: ["listFiles"],
        dataRetention: "redacted_audit",
      }),
    ).toMatchObject({
      connectorId: "workspace.inventory",
      connectorLabel: "Workspace Inventory (workspace.inventory)",
      accountLabel: "Account Local workspace (workspace)",
      accountStatusLabel: "Account status available",
      authStatusLabel: "Auth No OAuth required for the local workspace.",
      scopeLabel: "Scopes Read workspace file inventory (workspace.files.read)",
      operationLabel: "Operations List files (listFiles)",
      sideEffectLabel: "Side effects Read-only workspace metadata",
      retentionLabel: "Retention Redacted audit",
      rateLimitLabel: "Rate limit 300/min burst 30",
      syncPolicyLabel: "Sync One bounded page; no sync cursor",
      samplePreviewLabel: "Sample preview entries include path, type, size, and truncation flags; file contents are not read.",
      dataHandlingLabel: "Only redacted summaries are kept in the audit trail.",
      reviewPolicyLabel: "Review policy: personal-data or mutation calls pause for approval.",
      retentionDowngradeOptions: [{ value: "none", label: "Use no retention" }],
      scopeRemovalOptions: [{ value: "workspace.files.read", label: "Remove scope workspace.files.read" }],
      rejectActionLabel: "Reject connector",
    });
    expect(
      workflowConnectorConsentSummary({
        connectorId: "gmail.mail",
        scopes: [],
        operations: [],
        dataRetention: "run_artifact",
      }),
    ).toMatchObject({
      connectorLabel: "gmail.mail",
      accountLabel: "Account selected at run time",
      accountStatusLabel: "Account status selected at run time.",
      authStatusLabel: "Auth status not declared in preview.",
      scopeLabel: "Scopes none",
      operationLabel: "Operations none",
      sideEffectLabel: "Side effects not declared",
      retentionLabel: "Retention Run artifact",
      rateLimitLabel: "Rate limit not declared in preview.",
      syncPolicyLabel: "Sync policy not declared in preview.",
      samplePreviewLabel: "Sample preview not available for this connector.",
      dataHandlingLabel: "Raw connector values may be stored with the run artifact.",
      reviewPolicyLabel: "Review policy: raw connector values require approval.",
      retentionDowngradeOptions: [
        { value: "redacted_audit", label: "Use redacted audit" },
        { value: "none", label: "Use no retention" },
      ],
    });
    expect(workflowConnectorRetentionDowngradeOptions("none")).toEqual([]);
  });
});
