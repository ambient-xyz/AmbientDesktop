import { describe, expect, it } from "vitest";
import type {
  AmbientPermissionGrant,
  AutomationScheduleExceptionSummary,
  AutomationScheduleSummary,
  PermissionAuditEntry,
  WorkflowAgentThreadSummary,
  WorkflowArtifactSummary,
  WorkflowRunDetail,
  WorkflowRunSummary,
} from "../../shared/types";
import {
  workflowDiscoveryContextReviewModel,
  workflowReviewActionLabel,
  workflowReviewActionTitle,
  workflowReviewWorkspaceModel,
  workflowReviewWorkspaceViewModel,
  workflowScheduleCreationModel,
  workflowScheduleExceptionLedgerItems,
  workflowScheduleGrantReadinessModel,
  workflowScheduleRunHistoryItems,
  workflowThreadScheduleState,
} from "./workflowReviewUiModel";

const thread: WorkflowAgentThreadSummary = {
  id: "thread-1",
  folderId: "home",
  projectName: "Workspace",
  projectPath: "/tmp/workspace",
  title: "Inbox workflow",
  phase: "ready_for_review",
  initialRequest: "Classify inbox messages.",
  preview: "Classify inbox messages.",
  status: "ready_for_review",
  traceMode: "production",
  latestVersion: {
    id: "version-1",
    workflowThreadId: "thread-1",
    artifactId: "artifact-1",
    version: 3,
    sourcePath: "/tmp/workspace/.ambient-codex/workflows/inbox/main.ts",
    repoPath: "/tmp/workspace/.ambient-codex/workflows/inbox",
    status: "ready_for_review",
    createdBy: "compiler",
    createdAt: "2026-05-02T00:00:00.000Z",
  },
  graph: {
    id: "graph-1",
    workflowThreadId: "thread-1",
    version: 3,
    source: "compile",
    summary: "Classify inbox messages.",
    nodes: [
      { id: "request", type: "request", label: "Request" },
      { id: "model", type: "model_call", label: "Classify" },
      { id: "review", type: "review_gate", label: "Review" },
    ],
    edges: [
      { id: "request-model", source: "request", target: "model", type: "control_flow" },
      { id: "model-review", source: "model", target: "review", type: "condition" },
    ],
    createdAt: "2026-05-02T00:00:00.000Z",
  },
  discoveryQuestions: [
    {
      id: "question-1",
      workflowThreadId: "thread-1",
      category: "scope",
      context: "context",
      question: "Scope?",
      choices: [{ id: "manual", label: "Manual", description: "Run manually." }],
      allowFreeform: true,
      answer: { choiceId: "manual", answeredAt: "2026-05-02T00:00:00.000Z" },
      createdAt: "2026-05-02T00:00:00.000Z",
    },
  ],
  badges: [],
  createdAt: "2026-05-02T00:00:00.000Z",
  updatedAt: "2026-05-02T00:00:00.000Z",
};

const artifact: WorkflowArtifactSummary = {
  id: "artifact-1",
  workflowThreadId: "thread-1",
  title: "Inbox workflow",
  status: "ready_for_preview",
  manifest: {
    tools: ["ambient.responses", "gmail.search"],
    connectors: [
      {
        connectorId: "gmail.mail",
        accountId: "primary",
        scopes: ["mail.read"],
        operations: ["search"],
        dataRetention: "run_artifact",
      },
    ],
    pluginCapabilities: [
      {
        capabilityId: "gmail.search",
        pluginId: "gmail",
        pluginName: "Gmail",
        serverName: "gmail",
        toolName: "search",
        registeredName: "gmail_search",
      },
    ],
    mutationPolicy: "staged_until_approved",
    maxToolCalls: 4,
    maxModelCalls: 2,
    maxRunMs: 60_000,
  },
  spec: {
    goal: "Classify inbox messages.",
    summary: "Classify inbox messages and review low-confidence results.",
  },
  sourcePath: "/tmp/workspace/.ambient-codex/workflows/inbox/main.ts",
  statePath: "/tmp/workspace/.ambient-codex/workflows/inbox/state.json",
  createdAt: "2026-05-02T00:00:00.000Z",
  updatedAt: "2026-05-02T00:00:00.000Z",
};

const latestRun: WorkflowRunSummary = {
  id: "run-1",
  artifactId: "artifact-1",
  status: "previewed",
  startedAt: "2026-05-02T00:00:00.000Z",
  updatedAt: "2026-05-02T00:00:01.000Z",
};

const detail: WorkflowRunDetail = {
  artifact,
  run: latestRun,
  events: [
    {
      id: "event-1",
      runId: "run-1",
      artifactId: "artifact-1",
      seq: 1,
      type: "workflow.start",
      createdAt: "2026-05-02T00:00:00.000Z",
    },
  ],
  modelCalls: [],
  checkpoints: [],
  approvals: [],
  auditReport: "Audit report",
  sourceContent: "export async function run() {}",
};

describe("workflowReviewUiModel", () => {
  it("builds graph-backed review sections for a ready preview", () => {
    const model = workflowReviewWorkspaceModel({ thread, artifact, latestRun, detail });

    expect(model).toMatchObject({
      title: "Inbox workflow",
      statusLabel: "Ready For Preview",
      phaseLabel: "Ready For Review",
      versionLabel: "Version 3",
      noticeTone: "review",
    });
    expect(model.badges).toEqual(
      expect.arrayContaining(["Version 3", "Staged Until Approved", "3 graph nodes", "Latest Previewed", "1 connector grants", "No CLI capabilities", "1 plugin requirements"]),
    );
    expect(model.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "diagram", value: "3 nodes", detail: "2 edges from Compile snapshot 3.", tone: "ready" }),
        expect.objectContaining({ id: "discovery_context", value: "Standard context", tone: "neutral" }),
        expect.objectContaining({ id: "trace_retention", value: "Essentials retained", tone: "ready" }),
        expect.objectContaining({ id: "connectors", value: "1 grant", tone: "review" }),
        expect.objectContaining({ id: "mutation_policy", value: "Staged", tone: "review" }),
        expect.objectContaining({ id: "dry_run", value: "Previewed", tone: "ready" }),
        expect.objectContaining({ id: "source", value: "30 chars", tone: "ready" }),
      ]),
    );
  });

  it("assembles the review workspace view model from workspace state", () => {
    const selectedNode = thread.graph?.nodes[1];
    const grant = permissionGrant({
      workflowThreadId: thread.id,
      targetLabel: "gmail.mail:search",
    });
    const schedule: AutomationScheduleSummary = {
      id: "schedule-1",
      targetKind: "workflow_thread",
      targetId: thread.id,
      targetLabel: "Inbox workflow (latest approved)",
      createdTargetVersionId: "version-1",
      preset: "daily",
      timezone: "America/Phoenix",
      enabled: true,
      skipIfActive: true,
      concurrencyPolicy: "skip_if_active",
      nextRunAt: "2026-05-03T16:00:00.000Z",
      createdAt: "2026-05-02T00:00:00.000Z",
      updatedAt: "2026-05-02T00:00:00.000Z",
    };

    const model = workflowReviewWorkspaceViewModel({
      thread,
      artifact,
      runs: [{ ...latestRun, id: "other-run", artifactId: "artifact-other" }, latestRun],
      detail,
      versions: [thread.latestVersion!],
      schedules: [schedule],
      permissionGrants: [grant],
      permissionAudit: [],
      permissionMode: "workspace",
      auditThreadId: "active-thread",
      workspacePath: "/tmp/workspace",
      selectedWorkflowAgentThreadId: thread.id,
      selectedWorkflowAgentSourceNode: selectedNode,
      runLimits: { idleTimeoutMs: 120_000, maxRunMs: null },
    });

    expect(model).toMatchObject({
      latestRun: expect.objectContaining({ id: "run-1" }),
      review: expect.objectContaining({ title: "Inbox workflow", statusLabel: "Ready For Preview" }),
      runBlocked: false,
      currentVersion: expect.objectContaining({ id: "version-1" }),
      selectedSourceNode: selectedNode,
      sourceNodes: thread.graph?.nodes,
      runLimits: { idleTimeoutMs: 120_000, maxRunMs: null },
      workflowGrantRegistry: expect.objectContaining({ activeCount: 1 }),
    });
    expect(model.scheduleState.schedules).toEqual([expect.objectContaining({ id: "schedule-1", mode: "latest_approved" })]);

    expect(
      workflowReviewWorkspaceViewModel({
        thread,
        artifact: { ...artifact, status: "draft" },
        runs: [],
        versions: [thread.latestVersion!],
        schedules: [],
        permissionGrants: [],
        permissionAudit: [],
        selectedWorkflowAgentThreadId: "other-thread",
        selectedWorkflowAgentSourceNode: selectedNode,
        runLimits: {},
      }),
    ).toMatchObject({
      latestRun: undefined,
      runBlocked: true,
      selectedSourceNode: undefined,
      workflowGrantRegistry: expect.objectContaining({ activeCount: 0 }),
    });
  });

  it("surfaces durable run provider health and recovery metadata", () => {
    const degradedRun: WorkflowRunSummary = {
      ...latestRun,
      status: "failed",
      graphSnapshotId: "graph-1",
      providerHealth: {
        status: "provider_degraded",
        providerEventCount: 2,
        providerProgressEventCount: 0,
        providerErrorEventCount: 1,
        latestProviderEventType: "ambient.call.error",
        latestProviderEventAt: "2026-05-02T00:00:01.000Z",
        error: "GMI Cloud stream stalled after 60000 ms without activity.",
      },
      retryMetadata: {
        retryEventCount: 2,
        providerRetryEventCount: 1,
        recoveryAttemptCount: 1,
        latestRetryEventType: "workflow.recovery.completed",
        latestRetryEventAt: "2026-05-02T00:00:02.000Z",
        latestRecoveryAction: "resume_checkpoint",
        sourceRunId: "run-previous",
        sourceEventId: "event-previous",
      },
    };
    const model = workflowReviewWorkspaceModel({
      thread,
      artifact,
      latestRun: degradedRun,
      detail: { ...detail, run: degradedRun },
    });

    expect(model.badges).toEqual(
      expect.arrayContaining(["Latest Failed", "Provider degraded", "1 recovery attempt", "1 provider retry event"]),
    );
    expect(model.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "dry_run",
          value: "Failed",
          detail: expect.stringContaining("Provider health is degraded: GMI Cloud stream stalled"),
          tone: "blocked",
        }),
      ]),
    );
  });

  it("flags a stale running run as blocked review evidence", () => {
    const staleRun: WorkflowRunSummary = {
      ...latestRun,
      status: "running",
      updatedAt: "2026-05-02T00:00:01.000Z",
    };
    const model = workflowReviewWorkspaceModel({
      thread,
      artifact,
      latestRun: staleRun,
      detail: {
        ...detail,
        run: staleRun,
        events: [
          {
            id: "event-stale",
            runId: staleRun.id,
            artifactId: staleRun.artifactId,
            seq: 1,
            type: "ambient.call.error",
            createdAt: "2026-05-02T00:00:01.000Z",
          },
        ],
      },
    });

    expect(model.badges).toContain("Run stale");
    expect(model.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "dry_run",
          value: "Running (stale)",
          detail: expect.stringContaining("No workflow run update has been recorded"),
          tone: "blocked",
        }),
      ]),
    );
  });

  it("labels WorkflowProgramIR source content as a generated program", () => {
    const model = workflowReviewWorkspaceModel({
      thread,
      artifact,
      latestRun,
      detail: {
        ...detail,
        sourceProvenance: {
          kind: "program_ir_generated",
          editable: false,
          validationMode: "program_ir_artifact",
          reason: "Generated from WorkflowProgramIR.",
          compilerMode: "program_ir",
        },
      },
    });

    expect(model.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "source",
          label: "Generated program",
          detail: expect.stringContaining("source edits are disabled"),
          tone: "ready",
        }),
      ]),
    );
  });

  it("surfaces compiler audit modules, recipes, policies, and validators", () => {
    const compileAudit = {
      compilerMode: "program_ir",
      compileContextPath: "/tmp/workspace/.ambient-codex/workflows/inbox/compile-context.json",
      promptAssemblyPath: "/tmp/workspace/.ambient-codex/workflows/inbox/prompt-assembly.json",
      validationReportPath: "/tmp/workspace/.ambient-codex/workflows/inbox/validation-report.json",
      promptModuleCount: 4,
      stablePrefixModuleCount: 2,
      mutableSuffixModuleCount: 2,
      promptModules: [
        {
          id: "policy-source-provenance",
          layer: "policy",
          scope: "stable_prefix",
          reason: "Source provenance must be explicit.",
          ruleIds: ["browser-source-provenance"],
          selectedRecipeIds: [],
          selectedToolNames: [],
          selectedConnectorIds: [],
        },
        {
          id: "recipe-current_web_research",
          layer: "recipe",
          scope: "mutable_suffix",
          reason: "Request needs current public web research.",
          ruleIds: [],
          selectedRecipeIds: ["current_web_research"],
          selectedToolNames: ["browser_search"],
          selectedConnectorIds: [],
        },
      ],
      selectedRecipeIds: ["current_web_research"],
      rejectedRecipeIds: ["staged_document_export"],
      policyImplicationIds: ["current-web-source-quality"],
      validatorIds: ["workflow.program.static", "workflow.program.dry_run"],
      failedValidatorIds: [],
      validationStatus: "passed",
      diagnosticCount: 0,
      mutationPolicy: "read_only",
      connectorOperationCount: 0,
      connectorWriteOperationCount: 0,
    };
    const model = workflowReviewWorkspaceModel({
      thread,
      artifact: { ...artifact, compileAudit },
      latestRun,
    });

    expect(model.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "compile_audit",
          value: "4 modules",
          detail: expect.stringContaining("1 recipe"),
          tone: "ready",
        }),
      ]),
    );
    expect(model.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "compile-audit",
          value: "4 modules",
          detail: expect.stringContaining("2 policy refs"),
          panel: "manifest",
          actionLabel: "Review compile",
          tone: "ready",
        }),
      ]),
    );
  });

  it("surfaces Ambient CLI workflow capability review state", () => {
    const model = workflowReviewWorkspaceModel({
      thread,
      artifact: {
        ...artifact,
        manifest: {
          ...artifact.manifest,
          tools: ["ambient_cli"],
          connectors: [],
          pluginCapabilities: [],
          ambientCliCapabilities: [
            {
              capabilityId: "pkg-youtube:tool:youtube_transcript",
              registryPluginId: "cli:pkg-youtube",
              packageId: "pkg-youtube",
              packageName: "youtube-transcript",
              command: "youtube_transcript",
            },
          ],
          mutationPolicy: "read_only",
        },
      },
    });

    expect(model.badges).toEqual(expect.arrayContaining(["1 CLI capabilities"]));
    expect(model.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "ambient_cli",
          value: "1 command",
          detail: expect.stringContaining("youtube-transcript:youtube_transcript"),
          tone: "review",
        }),
      ]),
    );
    expect(model.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "ambient-cli-capabilities",
          value: "1 command",
          panel: "permissions",
          tone: "review",
        }),
      ]),
    );
  });

  it("builds overview evidence for source mappings and retained Ambient CLI events", () => {
    const sourceMappedThread: WorkflowAgentThreadSummary = {
      ...thread,
      graph: {
        ...thread.graph!,
        nodes: [
          {
            ...thread.graph!.nodes[0],
            sourceRanges: [
              {
                kind: "workflow_step",
                start: 0,
                end: 45,
                startLine: 1,
                startColumn: 1,
                endLine: 1,
                endColumn: 46,
                snippet: "await workflow.step('request', async () => request)",
              },
            ],
          },
          {
            ...thread.graph!.nodes[1],
            sourceRanges: [
              {
                kind: "ambient_call",
                start: 46,
                end: 120,
                startLine: 2,
                startColumn: 1,
                endLine: 4,
                endColumn: 3,
                snippet: "await ambient.call({ nodeId: 'model' })",
              },
            ],
          },
          thread.graph!.nodes[2],
        ],
      },
    };
    const runDetail: WorkflowRunDetail = {
      ...detail,
      sourceContent: "await workflow.step('request', async () => request)\nawait ambient.call({ nodeId: 'model' })",
      events: [
        ...detail.events,
        {
          id: "event-ambient-cli",
          runId: "run-1",
          artifactId: "artifact-1",
          seq: 2,
          type: "desktop-tool.end",
          message: "ambient_cli",
          createdAt: "2026-05-02T00:00:02.000Z",
          data: {
            ambientCliInput: { packageName: "arxiv", command: "search" },
            ambientCliOutput: { packageName: "arxiv", commandName: "search" },
          },
        },
      ],
    };

    const model = workflowReviewWorkspaceModel({ thread: sourceMappedThread, artifact, latestRun, detail: runDetail });

    expect(model.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "source-mapping",
          value: "2/3 nodes mapped",
          panel: "source",
          tone: "review",
          label: "Program map",
          actionLabel: "Open program map",
        }),
        expect.objectContaining({
          id: "ambient-cli-run-evidence",
          value: "1 event",
          panel: "run_console",
          tone: "ready",
        }),
      ]),
    );
  });

  it("marks missing graph and rejected previews as blocked", () => {
    const model = workflowReviewWorkspaceModel({
      thread: { ...thread, graph: undefined },
      artifact: { ...artifact, status: "rejected" },
    });

    expect(model.noticeTone).toBe("blocked");
    expect(model.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "diagram", tone: "blocked" }),
        expect.objectContaining({ id: "connectors", tone: "blocked" }),
      ]),
    );
  });

  it("summarizes granted, withheld, denied, and policy-summary discovery context", () => {
    const discoveryThread: WorkflowAgentThreadSummary = {
      ...thread,
      discoveryQuestions: [
        {
          ...thread.discoveryQuestions[0],
          policyContextSummary: "Base directory: /tmp/workspace\nGranted content excerpts: docs/brief.md.",
          accessRequests: [
            {
              id: "access-brief",
              capability: "file_content",
              actionKind: "file_content_read",
              targetKind: "path",
              targetLabel: "docs/brief.md",
              targetHash: "hash-brief",
              reason: "File contents improve discovery.",
              auditDetail: "file_content: docs/brief.md",
              risk: "outside-workspace",
              reusableScopes: ["workflow_thread", "project"],
              recommendedResponse: "always_workflow",
              status: "allowed",
              response: "always_project",
              grantId: "grant-brief",
              resolvedAt: "2026-05-02T00:00:00.000Z",
            },
            {
              id: "access-events",
              capability: "file_content",
              actionKind: "file_content_read",
              targetKind: "path",
              targetLabel: "events.csv",
              targetHash: "hash-events",
              reason: "Events data could refine discovery.",
              auditDetail: "file_content: events.csv",
              risk: "outside-workspace",
              reusableScopes: ["workflow_thread"],
              recommendedResponse: "allow_once",
              status: "pending",
            },
            {
              id: "access-secret",
              capability: "secret_path_metadata",
              actionKind: "secret_path_read",
              targetKind: "path",
              targetLabel: ".env",
              targetHash: "hash-secret",
              reason: "Secret-like path metadata is restricted.",
              auditDetail: "secret_path_metadata: [REDACTED]",
              risk: "secret-path",
              reusableScopes: ["workflow_thread"],
              recommendedResponse: "allow_once",
              status: "denied",
              response: "deny",
              resolvedAt: "2026-05-02T00:00:00.000Z",
            },
            {
              id: "access-arxiv",
              capability: "browser_network",
              actionKind: "browser_network",
              targetKind: "browser_origin",
              targetLabel: "web research via https://arxiv.org",
              targetHash: "hash-arxiv",
              reason: "Current research could refine discovery.",
              auditDetail: "browser_network: web research via https://arxiv.org",
              risk: "browser-network",
              reusableScopes: ["workflow_thread"],
              recommendedResponse: "allow_once",
              status: "allowed",
              response: "allow_once",
              resolvedAt: "2026-05-03T00:00:00.000Z",
              evidence: {
                id: "evidence-arxiv",
                capability: "browser_network",
                targetLabel: "web research via https://arxiv.org",
                gatheredAt: "2026-05-03T00:00:00.000Z",
                provider: "arxiv",
                summary: "Gathered 2 arXiv results for discovery context.",
                items: [{ id: "paper-1", title: "KV cache reuse", snippet: "Prefix reuse.", sourceLabel: "arXiv" }],
                redacted: true,
              },
            },
          ],
        },
        {
          ...thread.discoveryQuestions[0],
          id: "question-2",
          question: "Data sources?",
          policyContextSummary: "Base directory: /tmp/workspace\nGranted content excerpts: notes.md.",
        },
      ],
    };

    const discoveryContext = workflowDiscoveryContextReviewModel(discoveryThread);

    expect(discoveryContext).toMatchObject({
      inspectedCount: 3,
      withheldCount: 1,
      deniedCount: 1,
      tileValue: "3 inspected",
      tileDetail: "3 inspected, 1 withheld, 1 denied",
      tone: "review",
    });
    expect(discoveryContext.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "access-brief",
          status: "inspected",
          categoryLabel: "Files",
          scopeLabel: "Always allowed for project",
          grantId: "grant-brief",
        }),
        expect.objectContaining({
          id: "policy-summary:question-2:notes.md",
          status: "inspected",
          targetLabel: "notes.md",
          scopeLabel: "Policy summary",
        }),
        expect.objectContaining({
          id: "access-events",
          status: "withheld",
          scopeLabel: "Pending",
        }),
        expect.objectContaining({
          id: "access-arxiv",
          status: "inspected",
          categoryLabel: "Browser",
          detail: expect.stringContaining("Evidence: Gathered 2 arXiv results"),
        }),
        expect.objectContaining({
          id: "access-secret",
          status: "denied",
          targetLabel: ".env",
        }),
      ]),
    );

    const review = workflowReviewWorkspaceModel({ thread: discoveryThread, artifact, latestRun, detail });
    expect(review.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "discovery_context",
          value: "3 inspected",
          detail: "3 inspected, 1 withheld, 1 denied",
          tone: "review",
        }),
      ]),
    );
  });

  it("models busy review action labels", () => {
    expect(workflowReviewActionLabel("approve", false)).toBe("Approve");
    expect(workflowReviewActionLabel("approve", true)).toBe("Approving");
    expect(workflowReviewActionLabel("run_unapproved", false)).toBe("Run unapproved");
    expect(workflowReviewActionLabel("revalidate", false)).toBe("Validate version");
    expect(workflowReviewActionLabel("revalidate", true)).toBe("Validating");
  });

  it("models review action tooltips", () => {
    expect(workflowReviewActionTitle("revalidate")).toContain("manifest");
    expect(workflowReviewActionTitle("dry_run")).toContain("safe stubs");
    expect(workflowReviewActionTitle("run_unapproved")).toContain("before approval");
    expect(workflowReviewActionTitle("approve")).toContain("scheduled");
    expect(workflowReviewActionTitle("reject")).toContain("keep it from being approved");
  });

  it("models thread-first workflow scheduling state", () => {
    const approvedThread = {
      ...thread,
      latestVersion: { ...thread.latestVersion!, status: "approved" as const },
    };
    const approvedArtifact = { ...artifact, status: "approved" as const };
    const schedules: AutomationScheduleSummary[] = [
      {
        id: "schedule-latest",
        targetKind: "workflow_thread",
        targetId: thread.id,
        targetLabel: "Inbox workflow (latest approved)",
        createdTargetVersionId: "version-1",
        preset: "daily",
        timezone: "America/Phoenix",
        enabled: true,
        skipIfActive: true,
        concurrencyPolicy: "skip_if_active",
        nextRunAt: "2026-05-03T16:00:00.000Z",
        createdAt: "2026-05-02T00:00:00.000Z",
        updatedAt: "2026-05-02T00:00:00.000Z",
      },
      {
        id: "schedule-pinned",
        targetKind: "workflow_version",
        targetId: "version-1",
        targetLabel: "Inbox workflow v3 (pinned)",
        preset: "weekly",
        timezone: "America/Phoenix",
        enabled: false,
        skipIfActive: true,
        concurrencyPolicy: "skip_if_active",
        createdAt: "2026-05-02T00:00:00.000Z",
        updatedAt: "2026-05-02T00:00:00.000Z",
      },
    ];

    const state = workflowThreadScheduleState({
      thread: approvedThread,
      artifact: approvedArtifact,
      versions: [approvedThread.latestVersion!],
      schedules,
      runs: [
        {
          id: "run-scheduled",
          artifactId: approvedArtifact.id,
          status: "succeeded",
          startedAt: "2026-05-03T16:00:00.000Z",
          updatedAt: "2026-05-03T16:00:10.000Z",
          completedAt: "2026-05-03T16:00:10.000Z",
          scheduledBy: {
            scheduleId: "schedule-latest",
            outcome: "started",
            targetKind: "workflow_thread",
            targetVersionId: "version-1",
            grantDecisionSource: "persistent_grant",
          },
        },
        {
          id: "run-skipped",
          artifactId: approvedArtifact.id,
          status: "skipped",
          startedAt: "2026-05-02T16:00:00.000Z",
          updatedAt: "2026-05-02T16:00:01.000Z",
          completedAt: "2026-05-02T16:00:01.000Z",
          error: "Workflow schedule requires persistent connector grant for gmail.mail:search.",
          scheduledBy: {
            scheduleId: "schedule-latest",
            outcome: "skipped",
            targetVersionId: "version-1",
          },
        },
      ],
    });

    expect(state).toMatchObject({
      canScheduleLatestApproved: true,
      latestApprovedVersionLabel: "v3",
      canPinCurrentVersion: true,
      currentVersionId: "version-1",
      schedules: [
        expect.objectContaining({
          id: "schedule-latest",
          mode: "latest_approved",
          statusLabel: "Active",
          cadenceLabel: "Daily",
          versionLabel: "Runs latest approved v3",
          driftLabel: "No drift from created v3",
          driftTone: "ready",
          dispatchLabel: "Dispatchable",
          dispatchTone: "ready",
          latestRunId: "run-scheduled",
          latestRunLabel: "Latest run Succeeded",
          latestRunDetail: "Completed 2026-05-03T16:00:10.000Z · version version-1",
          latestRunTone: "ready",
          recentRuns: [
            expect.objectContaining({ id: "run-scheduled", statusLabel: "Run Succeeded", tone: "ready" }),
            expect.objectContaining({
              id: "run-skipped",
              statusLabel: "Schedule skipped",
              detail: "Completed 2026-05-02T16:00:01.000Z · Workflow schedule requires persistent connector grant for gmail.mail:search. · version version-1",
              tone: "neutral",
            }),
          ],
        }),
        expect.objectContaining({
          id: "schedule-pinned",
          mode: "pinned_version",
          statusLabel: "Paused",
          cadenceLabel: "Weekly",
          versionLabel: "Pinned to v3",
          driftLabel: "No latest-approved drift",
          dispatchLabel: "Dispatchable",
        }),
      ],
    });
  });

  it("formats global workflow schedule run history", () => {
    const runs: WorkflowRunSummary[] = [
      {
        id: "run-new",
        artifactId: artifact.id,
        status: "succeeded",
        startedAt: "2026-05-03T16:00:00.000Z",
        updatedAt: "2026-05-03T16:00:10.000Z",
        completedAt: "2026-05-03T16:00:10.000Z",
        scheduledBy: { scheduleId: "schedule-1", outcome: "started", targetVersionId: "version-2" },
      },
      {
        id: "run-old",
        artifactId: artifact.id,
        status: "skipped",
        startedAt: "2026-05-02T16:00:00.000Z",
        updatedAt: "2026-05-02T16:00:01.000Z",
        completedAt: "2026-05-02T16:00:01.000Z",
        error: "Persistent grant missing.",
        scheduledBy: { scheduleId: "schedule-1", outcome: "skipped", targetVersionId: "version-1" },
      },
      {
        id: "other",
        artifactId: artifact.id,
        status: "succeeded",
        startedAt: "2026-05-04T16:00:00.000Z",
        updatedAt: "2026-05-04T16:00:00.000Z",
        scheduledBy: { scheduleId: "schedule-2", outcome: "started" },
      },
    ];

    expect(workflowScheduleRunHistoryItems("schedule-1", runs)).toEqual([
      {
        id: "run-new",
        statusLabel: "Run Succeeded",
        detail: "Completed 2026-05-03T16:00:10.000Z · version version-2",
        tone: "ready",
        actionLabel: "Open run",
        actionTitle: "Open the scheduled run audit trail.",
      },
      {
        id: "run-old",
        statusLabel: "Schedule skipped",
        detail: "Completed 2026-05-02T16:00:01.000Z · Persistent grant missing. · version version-1",
        tone: "neutral",
        actionLabel: "Open run",
        actionTitle: "Open the scheduled run audit trail.",
      },
    ]);
  });

  it("models schedule exception ledger entries for calendar-style occurrence edits", () => {
    const exceptions: AutomationScheduleExceptionSummary[] = [
      {
        id: "exception-reschedule",
        scheduleId: "schedule-1",
        occurrenceAt: "2026-05-03T16:00:00.000Z",
        exceptionKind: "reschedule",
        status: "pending",
        replacementRunAt: "2026-05-03T18:30:00.000Z",
        reason: "Run after the team sync.",
        createdAt: "2026-05-02T00:00:00.000Z",
        updatedAt: "2026-05-02T00:00:00.000Z",
      },
      {
        id: "exception-limits",
        scheduleId: "schedule-1",
        occurrenceAt: "2026-05-04T16:00:00.000Z",
        exceptionKind: "run_limits",
        status: "consumed",
        runLimits: { idleTimeoutMs: 120_000, maxRunMs: null },
        consumedAt: "2026-05-04T16:00:02.000Z",
        createdAt: "2026-05-03T00:00:00.000Z",
        updatedAt: "2026-05-03T00:00:00.000Z",
      },
    ];

    expect(workflowScheduleExceptionLedgerItems(exceptions)).toEqual([
      expect.objectContaining({
        id: "exception-limits",
        title: "Run-limit override",
        detail: "Stream-idle timeout 2 min; total runtime cap disabled for this schedule.",
        statusLabel: expect.stringContaining("Consumed"),
        tone: "neutral",
      }),
      expect.objectContaining({
        id: "exception-reschedule",
        title: "Rescheduled occurrence",
        detail: expect.stringContaining("Reason: Run after the team sync."),
        statusLabel: "Pending",
        tone: "review",
      }),
    ]);
  });

  it("keeps extended workflow schedule history available for expandable drawers", () => {
    const approvedThread = {
      ...thread,
      latestVersion: { ...thread.latestVersion!, id: "version-2", status: "approved" as const, version: 4 },
    };
    const runs = Array.from({ length: 5 }, (_, index): WorkflowRunSummary => ({
      id: `run-${index}`,
      artifactId: artifact.id,
      status: index === 3 ? "skipped" : "succeeded",
      startedAt: `2026-05-0${index + 1}T16:00:00.000Z`,
      updatedAt: `2026-05-0${index + 1}T16:00:01.000Z`,
      completedAt: `2026-05-0${index + 1}T16:00:01.000Z`,
      error: index === 3 ? "Grant missing." : undefined,
      scheduledBy: { scheduleId: "schedule-expanded", outcome: index === 3 ? "skipped" : "started", targetVersionId: "version-2" },
    }));

    const state = workflowThreadScheduleState({
      thread: approvedThread,
      artifact: { ...artifact, status: "approved" },
      versions: [approvedThread.latestVersion!],
      schedules: [
        {
          id: "schedule-expanded",
          targetKind: "workflow_thread",
          targetId: thread.id,
          targetLabel: "Inbox workflow (latest approved)",
          preset: "daily",
          timezone: "America/Phoenix",
          enabled: true,
          skipIfActive: true,
          concurrencyPolicy: "skip_if_active",
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      ],
      runs,
    });

    expect(state.schedules[0].recentRuns.map((run) => run.id)).toEqual(["run-4", "run-3", "run-2", "run-1", "run-0"]);
    expect(state.schedules[0].recentRuns[1]).toMatchObject({ statusLabel: "Schedule skipped", detail: expect.stringContaining("Grant missing.") });
  });

  it("models latest-approved schedule drift after a newer version is approved", () => {
    const approvedThread = {
      ...thread,
      latestVersion: { ...thread.latestVersion!, id: "version-2", status: "approved" as const, version: 4 },
    };
    const approvedArtifact = { ...artifact, status: "approved" as const };
    const versions = [
      approvedThread.latestVersion!,
      { ...thread.latestVersion!, id: "version-1", status: "approved" as const, version: 3 },
    ];
    const state = workflowThreadScheduleState({
      thread: approvedThread,
      artifact: approvedArtifact,
      versions,
      schedules: [
        {
          id: "schedule-latest",
          targetKind: "workflow_thread",
          targetId: thread.id,
          targetLabel: "Inbox workflow (latest approved)",
          createdTargetVersionId: "version-1",
          preset: "daily",
          timezone: "America/Phoenix",
          enabled: true,
          skipIfActive: true,
          concurrencyPolicy: "skip_if_active",
          createdAt: "2026-05-02T00:00:00.000Z",
          updatedAt: "2026-05-02T00:00:00.000Z",
        },
      ],
    });

    expect(state.schedules[0]).toMatchObject({
      versionLabel: "Runs latest approved v4",
      driftLabel: "Drifted from created v3 to latest approved v4",
      driftTone: "review",
      dispatchLabel: "Dispatchable",
    });
  });

  it("models schedule dispatch blockers for missing connector accounts", () => {
    const approvedThread = {
      ...thread,
      latestVersion: { ...thread.latestVersion!, status: "approved" as const },
    };
    const approvedArtifact = {
      ...artifact,
      status: "approved" as const,
      manifest: {
        ...artifact.manifest,
        connectors: artifact.manifest.connectors?.map((connector) => ({ ...connector, accountId: undefined })),
      },
    };
    const state = workflowThreadScheduleState({
      thread: approvedThread,
      artifact: approvedArtifact,
      versions: [approvedThread.latestVersion!],
      schedules: [
        {
          id: "schedule-latest",
          targetKind: "workflow_thread",
          targetId: thread.id,
          targetLabel: "Inbox workflow (latest approved)",
          createdTargetVersionId: "version-1",
          preset: "daily",
          timezone: "America/Phoenix",
          enabled: true,
          skipIfActive: true,
          concurrencyPolicy: "skip_if_active",
          createdAt: "2026-05-02T00:00:00.000Z",
          updatedAt: "2026-05-02T00:00:00.000Z",
        },
      ],
    });

    expect(state.schedules[0]).toMatchObject({
      dispatchLabel: "Blocked: connector account needed for gmail.mail",
      dispatchTone: "blocked",
    });
  });

  it("models schedule dispatch blockers for missing or revoked persistent connector grants", () => {
    const approvedThread = {
      ...thread,
      latestVersion: { ...thread.latestVersion!, status: "approved" as const },
    };
    const approvedArtifact = { ...artifact, status: "approved" as const };
    const schedules: AutomationScheduleSummary[] = [
      {
        id: "schedule-latest",
        targetKind: "workflow_thread",
        targetId: thread.id,
        targetLabel: "Inbox workflow (latest approved)",
        createdTargetVersionId: "version-1",
        preset: "daily",
        timezone: "America/Phoenix",
        enabled: true,
        skipIfActive: true,
        concurrencyPolicy: "skip_if_active",
        createdAt: "2026-05-02T00:00:00.000Z",
        updatedAt: "2026-05-02T00:00:00.000Z",
      },
    ];

    expect(
      workflowThreadScheduleState({
        thread: approvedThread,
        artifact: approvedArtifact,
        versions: [approvedThread.latestVersion!],
        schedules,
        permissionGrants: [],
        permissionMode: "full-access",
        auditThreadId: "thread-1",
        workspacePath: "/tmp/workspace",
      }).schedules[0],
    ).toMatchObject({
      dispatchLabel: "Blocked: persistent connector grant needed for gmail.mail:search",
      dispatchTone: "blocked",
      grantLabel: "Persistent grant needed",
      grantDetail: "Create a workflow-scoped scheduled-read grant for gmail.mail:search on primary.",
      grantAction: {
        label: "Allow scheduled reads",
        connectorId: "gmail.mail",
        operation: "search",
        accountId: "primary",
        targetLabel: "gmail.mail:search",
        scopeKind: "workflow_thread",
      },
    });

    expect(
      workflowThreadScheduleState({
        thread: approvedThread,
        artifact: approvedArtifact,
        versions: [approvedThread.latestVersion!],
        schedules,
        permissionGrants: [],
        permissionMode: "workspace",
        auditThreadId: "thread-1",
        workspacePath: "/tmp/workspace",
      }).schedules[0],
    ).toMatchObject({
      dispatchLabel: "Blocked: persistent connector grant needed for gmail.mail:search",
      dispatchTone: "blocked",
      grantLabel: "Persistent grant needed",
      grantDetail: "Create a workflow-scoped scheduled-read grant for gmail.mail:search on primary.",
      grantAction: {
        label: "Allow scheduled reads",
        connectorId: "gmail.mail",
        operation: "search",
        accountId: "primary",
        targetLabel: "gmail.mail:search",
        scopeKind: "workflow_thread",
      },
    });

    const matchingGrant = permissionGrant({ workflowThreadId: thread.id, targetLabel: "gmail.mail:search" });
    const audit: PermissionAuditEntry = {
      id: "audit-1",
      threadId: "thread-1",
      createdAt: "2026-05-03T12:00:00.000Z",
      permissionMode: "workspace",
      toolName: "google.gmail.search",
      risk: "plugin-tool",
      decision: "allowed",
      reason: "Reused persistent grant.",
      decisionSource: "persistent_grant",
      grantId: matchingGrant.id,
    };
    expect(
      workflowThreadScheduleState({
        thread: approvedThread,
        artifact: approvedArtifact,
        versions: [approvedThread.latestVersion!],
        schedules,
        permissionGrants: [matchingGrant],
        permissionAudit: [audit],
        auditThreadId: "thread-1",
        workspacePath: "/tmp/workspace",
      }).schedules[0],
    ).toMatchObject({
      dispatchLabel: "Dispatchable",
      dispatchTone: "ready",
      grantLabel: "Grant: Workflow gmail.mail:search",
      grantDetail: "Account primary · Last reuse 2026-05-03T12:00:00.000Z",
    });

    expect(
      workflowThreadScheduleState({
        thread: approvedThread,
        artifact: approvedArtifact,
        versions: [approvedThread.latestVersion!],
        schedules,
        permissionGrants: [{ ...matchingGrant, revokedAt: "2026-05-03T00:00:00.000Z" }],
        auditThreadId: "thread-1",
        workspacePath: "/tmp/workspace",
      }).schedules[0],
    ).toMatchObject({
      dispatchLabel: "Blocked: persistent connector grant needed for gmail.mail:search",
      dispatchTone: "blocked",
    });
  });

  it("blocks thread-first scheduling until a version is approved", () => {
    const state = workflowThreadScheduleState({
      thread,
      artifact,
      versions: [thread.latestVersion!],
      schedules: [],
    });

    expect(state).toMatchObject({
      canScheduleLatestApproved: false,
      latestApprovedBlockReason: "Approve a workflow version before scheduling latest approved.",
      canPinCurrentVersion: false,
      pinCurrentBlockReason: "Current version is Ready For Review.",
    });
  });

  it("models calendar-style workflow schedule creation and edit scope affordances", () => {
    const approvedThread = {
      ...thread,
      latestVersion: { ...thread.latestVersion!, status: "approved" as const, version: 4 },
    };
    const approvedArtifact = { ...artifact, status: "approved" as const };
    const schedules: AutomationScheduleSummary[] = [
      {
        id: "schedule-latest",
        targetKind: "workflow_thread",
        targetId: thread.id,
        targetLabel: "Inbox workflow (latest approved)",
        createdTargetVersionId: "version-1",
        preset: "daily",
        timezone: "America/Phoenix",
        enabled: true,
        skipIfActive: true,
        concurrencyPolicy: "skip_if_active",
        createdAt: "2026-05-02T00:00:00.000Z",
        updatedAt: "2026-05-02T00:00:00.000Z",
      },
    ];

    const model = workflowScheduleCreationModel({
      thread: approvedThread,
      artifact: approvedArtifact,
      versions: [approvedThread.latestVersion!],
      schedules,
      selectedTargetKind: "workflow_thread",
      selectedTargetId: approvedThread.id,
      preset: "weekly",
      enabled: true,
      timezone: "America/Phoenix",
      focusedScheduleId: "schedule-latest",
    });

    expect(model).toMatchObject({
      title: "Edit schedule",
      canSave: true,
      selectedTarget: {
        id: "latest-approved",
        label: "Latest approved",
        badge: "v4",
      },
      recurrenceLabel: "Weekly on Monday at 9:00",
      nextRunLabel: "Next eligible Monday at 9:00 AM.",
      previewRows: expect.arrayContaining([
        expect.objectContaining({ label: "Target", value: "Latest approved", tone: "ready" }),
        expect.objectContaining({ label: "Concurrency", value: "Skip if active" }),
      ]),
    });
    expect(model.editScopeChoices).toEqual([
      expect.objectContaining({ id: "this_occurrence", disabled: false }),
      expect.objectContaining({ id: "this_and_following", disabled: false }),
      expect.objectContaining({ id: "all_occurrences", selected: true, disabled: false }),
    ]);

    const oneOffModel = workflowScheduleCreationModel({
      thread: approvedThread,
      artifact: approvedArtifact,
      versions: [approvedThread.latestVersion!],
      schedules,
      selectedTargetKind: "workflow_thread",
      selectedTargetId: approvedThread.id,
      preset: "weekly",
      enabled: true,
      timezone: "America/Phoenix",
      focusedScheduleId: "schedule-latest",
      editScope: "this_occurrence",
    });
    expect(oneOffModel).toMatchObject({
      canSave: false,
      saveTitle: "Use Skip next or Defer next in Run History for single-occurrence changes.",
    });
  });

  it("models persistent grant readiness for unattended workflow schedules", () => {
    const approvedArtifact = { ...artifact, status: "approved" as const };
    const missing = workflowScheduleGrantReadinessModel({
      artifact: approvedArtifact,
      permissionGrants: [],
      permissionMode: "workspace",
      workflowThreadId: thread.id,
      threadId: "thread-1",
      projectPath: "/tmp/workspace",
      workspacePath: "/tmp/workspace",
    });

    expect(missing).toMatchObject({
      tone: "blocked",
      summary: "1 grant issue before unattended dispatch.",
      rows: [
        expect.objectContaining({
          connectorId: "gmail.mail",
          status: "missing",
          statusLabel: "Grant needed",
          action: expect.objectContaining({ label: "Allow scheduled reads", targetLabel: "gmail.mail:search" }),
        }),
      ],
      tiles: expect.arrayContaining([expect.objectContaining({ id: "blocked", value: "1", tone: "blocked" })]),
    });

    const grant = permissionGrant({ workflowThreadId: thread.id, targetLabel: "gmail.mail:search" });
    const ready = workflowScheduleGrantReadinessModel({
      artifact: approvedArtifact,
      permissionGrants: [grant],
      permissionAudit: [
        {
          id: "audit-1",
          threadId: "thread-1",
          createdAt: "2026-05-03T12:00:00.000Z",
          permissionMode: "workspace",
          toolName: "google.gmail.search",
          risk: "plugin-tool",
          decision: "allowed",
          reason: "Reused persistent grant.",
          decisionSource: "persistent_grant",
          grantId: grant.id,
        },
      ],
      permissionMode: "workspace",
      workflowThreadId: thread.id,
      threadId: "thread-1",
      projectPath: "/tmp/workspace",
      workspacePath: "/tmp/workspace",
    });

    expect(ready).toMatchObject({
      tone: "ready",
      summary: "1 reusable grant ready.",
      rows: [
        expect.objectContaining({
          status: "ready",
          statusLabel: "Reusable grant ready",
          recentUseLabel: "Last reused 2026-05-03T12:00:00.000Z",
        }),
      ],
    });
  });

  it("models Ambient CLI readiness before unattended workflow scheduling", () => {
    const approvedThread = {
      ...thread,
      latestVersion: { ...thread.latestVersion!, status: "approved" as const },
    };
    const cliArtifact: WorkflowArtifactSummary = {
      ...artifact,
      status: "approved",
      manifest: {
        tools: ["ambient_cli"],
        connectors: [],
        pluginCapabilities: [],
        ambientCliCapabilities: [
          {
            capabilityId: "pkg-youtube:tool:youtube_transcript",
            registryPluginId: "cli:pkg-youtube",
            packageId: "pkg-youtube",
            packageName: "youtube-transcript",
            command: "youtube_transcript",
          },
        ],
        mutationPolicy: "read_only",
      },
    };

    const blockedState = workflowThreadScheduleState({
      thread: approvedThread,
      artifact: cliArtifact,
      versions: [approvedThread.latestVersion!],
      schedules: [],
      permissionGrants: [],
      permissionMode: "workspace",
      workspacePath: "/tmp/workspace",
    });

    expect(blockedState).toMatchObject({
      canScheduleLatestApproved: false,
      latestApprovedBlockReason: "Workflow schedule requires reviewed Ambient CLI grant for youtube-transcript:youtube_transcript.",
      canPinCurrentVersion: false,
      pinCurrentBlockReason: "Workflow schedule requires reviewed Ambient CLI grant for youtube-transcript:youtube_transcript.",
    });

    const missing = workflowScheduleGrantReadinessModel({
      artifact: cliArtifact,
      permissionGrants: [],
      permissionMode: "workspace",
      workflowThreadId: thread.id,
      workspacePath: "/tmp/workspace",
      traceMode: "debug",
    });

    expect(missing).toMatchObject({
      tone: "blocked",
      summary: "1 grant issue before unattended dispatch.",
      rows: [
        expect.objectContaining({
          kind: "ambient_cli",
          status: "missing",
          statusLabel: "CLI grant needed",
          targetLabel: "Run Ambient CLI youtube-transcript:youtube_transcript",
          riskLabel: expect.stringContaining("debug trace cleanup"),
        }),
      ],
    });

    const grant = permissionGrant({
      actionKind: "plugin_tool_execute",
      targetKind: "tool",
      targetLabel: "Run Ambient CLI youtube-transcript:youtube_transcript",
      workflowThreadId: thread.id,
    });
    const readyState = workflowThreadScheduleState({
      thread: approvedThread,
      artifact: cliArtifact,
      versions: [approvedThread.latestVersion!],
      schedules: [],
      permissionGrants: [grant],
      permissionMode: "workspace",
      workspacePath: "/tmp/workspace",
    });
    expect(readyState).toMatchObject({
      canScheduleLatestApproved: true,
      canPinCurrentVersion: true,
    });

    expect(
      workflowScheduleGrantReadinessModel({
        artifact: cliArtifact,
        permissionGrants: [grant],
        permissionMode: "workspace",
        workflowThreadId: thread.id,
        workspacePath: "/tmp/workspace",
      }),
    ).toMatchObject({
      tone: "ready",
      summary: "1 reusable grant ready.",
      rows: [
        expect.objectContaining({
          kind: "ambient_cli",
          status: "ready",
          statusLabel: "CLI grant ready",
        }),
      ],
    });
  });
});

function permissionGrant(overrides: Partial<AmbientPermissionGrant>): AmbientPermissionGrant {
  return {
    id: "grant-1",
    createdAt: "2026-05-02T00:00:00.000Z",
    updatedAt: "2026-05-02T00:00:00.000Z",
    createdBy: "user",
    permissionModeAtCreation: "workspace",
    scopeKind: "workflow_thread",
    workflowThreadId: "thread-1",
    actionKind: "connector_content_read",
    targetKind: "connector",
    targetHash: "hash",
    targetLabel: "gmail.mail:search",
    source: "permission_prompt",
    reason: "Allowed from test.",
    ...overrides,
  };
}
