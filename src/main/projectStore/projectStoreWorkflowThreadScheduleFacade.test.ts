import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { diffWorkflowGraphs } from "../../shared/workflowGraphDiff";
import { ProjectStore } from "./projectStore";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describeNative("ProjectStore workflow thread and schedule facade (requires Node ABI better-sqlite3 build)", () => {
  let workspacePath = "";
  let store: ProjectStore;

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-store-"));
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
  });

  afterEach(async () => {
    store.close();
    await rm(workspacePath, { recursive: true, force: true });
  });

  it("organizes workflow agent threads separately from automation folders", () => {
    const artifact = store.createWorkflowArtifact({
      title: "Inbox workflow",
      status: "ready_for_preview",
      manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only" },
      spec: { goal: "Classify messages", summary: "Read messages and produce a report." },
      sourcePath: join(workspacePath, ".ambient-codex", "workflows", "inbox", "main.ts"),
      statePath: join(workspacePath, ".ambient-codex", "workflows", "inbox", "state.json"),
    });
    expect(artifact.workflowThreadId).toBeTruthy();

    let folders = store.listWorkflowAgentFolders();
    const home = folders.find((folder) => folder.kind === "home");
    const workflowThread = home?.threads.find((thread) => thread.activeArtifactId === artifact.id);

    expect(home?.name).toBe("Home");
    expect(workflowThread).toMatchObject({
      title: "Inbox workflow",
      phase: "ready_for_review",
      preview: "Read messages and produce a report.",
      badges: expect.arrayContaining(["Ready For Review", "Production traces", "read only"]),
    });
    expect(workflowThread?.chatThreadId).toBeTruthy();
    expect(store.listWorkflowAgentThreadChatIds()).toContain(workflowThread!.chatThreadId);
    expect(store.getThread(workflowThread!.chatThreadId!)).toMatchObject({
      title: "Workflow: Inbox workflow",
      workspacePath,
    });

    const graph = store.createWorkflowGraphSnapshot({
      workflowThreadId: artifact.workflowThreadId!,
      source: "compile",
      summary: "Compiled graph",
      nodes: [{ id: "request", type: "request", label: "Request" }],
      edges: [],
      artifactPath: join(workspacePath, ".ambient-codex", "workflows", "inbox", "graph.json"),
    });
    expect(store.listWorkflowGraphSnapshots(artifact.workflowThreadId!)[0]).toMatchObject({
      id: graph.id,
      version: 1,
      source: "compile",
      nodes: [{ id: "request", type: "request", label: "Request" }],
    });
    const version = store.createWorkflowVersion({
      workflowThreadId: artifact.workflowThreadId!,
      artifactId: artifact.id,
      graphSnapshotId: graph.id,
      sourcePath: artifact.sourcePath,
      repoPath: dirname(artifact.sourcePath),
      gitCommitHash: "abc123",
      status: "ready_for_review",
      createdBy: "compiler",
    });
    expect(store.listWorkflowVersions(artifact.workflowThreadId!)[0]).toMatchObject({
      id: version.id,
      version: 1,
      graphSnapshotId: graph.id,
      gitCommitHash: "abc123",
      createdBy: "compiler",
    });

    folders = store.createWorkflowAgentFolder({ name: "Mail" });
    const customFolder = folders.find((folder) => folder.name === "Mail");
    folders = store.moveWorkflowAgentThread({ threadId: artifact.workflowThreadId!, folderId: customFolder!.id });

    expect(folders.find((folder) => folder.kind === "home")?.threads.map((thread) => thread.id)).not.toContain(artifact.workflowThreadId);
    expect(folders.find((folder) => folder.id === customFolder!.id)?.threads[0]).toMatchObject({
      id: artifact.workflowThreadId,
      activeGraphSnapshotId: graph.id,
      latestVersion: expect.objectContaining({ id: version.id, version: 1 }),
      graph: expect.objectContaining({ summary: "Compiled graph" }),
    });
    expect(store.listAutomationFolders().flatMap((folder) => folder.threads).some((thread) => thread.sourceId === artifact.id)).toBe(true);
  });

  it("classifies stale workflow runs as attention instead of active sidebar work", () => {
    const artifact = store.createWorkflowArtifact({
      title: "Stale workflow",
      status: "approved",
      manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only" },
      spec: { goal: "Recover from a stale run.", summary: "Run liveness should survive refresh." },
      sourcePath: join(workspacePath, ".ambient-codex", "workflows", "stale", "main.ts"),
      statePath: join(workspacePath, ".ambient-codex", "workflows", "stale", "state.json"),
    });
    const run = store.startWorkflowRun({ artifactId: artifact.id, status: "running" });
    store.appendWorkflowRunEvent({
      runId: run.id,
      type: "ambient.call.error",
      message: "stream stalled",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const workflowThread = store
      .listWorkflowAgentFolders()
      .flatMap((folder) => folder.threads)
      .find((thread) => thread.activeArtifactId === artifact.id);
    const automationThread = store
      .listAutomationFolders()
      .flatMap((folder) => folder.threads)
      .find((thread) => thread.sourceId === artifact.id);

    expect(workflowThread).toMatchObject({
      phase: "failed",
      status: "stale",
      latestRun: expect.objectContaining({ id: run.id, status: "stale" }),
      badges: expect.arrayContaining(["Failed", "Run stale"]),
    });
    expect(automationThread).toMatchObject({
      status: "stale",
      latestRun: expect.objectContaining({ id: run.id, status: "stale" }),
      badges: expect.arrayContaining(["Run stale"]),
    });
  });

  it("recovers workflow thread graphs from latest versions when the active graph pointer is missing", () => {
    const artifact = store.createWorkflowArtifact({
      title: "Pool research workflow",
      status: "ready_for_preview",
      manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only" },
      spec: { goal: "Research public pools", summary: "Find family-friendly pools and produce a report." },
      sourcePath: join(workspacePath, ".ambient-codex", "workflows", "pools", "main.ts"),
      statePath: join(workspacePath, ".ambient-codex", "workflows", "pools", "state.json"),
    });
    const workflowThreadId = artifact.workflowThreadId!;
    const graph = store.createWorkflowGraphSnapshot({
      workflowThreadId,
      source: "compile",
      summary: "Research then format pool results.",
      nodes: [
        { id: "request", type: "request", label: "Request" },
        { id: "format", type: "deterministic_step", label: "Format report" },
      ],
      edges: [{ id: "request-format", source: "request", target: "format", type: "data_flow" }],
    });
    store.createWorkflowVersion({
      workflowThreadId,
      artifactId: artifact.id,
      graphSnapshotId: graph.id,
      sourcePath: artifact.sourcePath,
      repoPath: dirname(artifact.sourcePath),
      status: "ready_for_review",
      createdBy: "compiler",
    });
    (store as unknown as { requireDb: () => { prepare: (sql: string) => { run: (...args: unknown[]) => unknown } } })
      .requireDb()
      .prepare("UPDATE workflow_agent_threads SET active_graph_snapshot_id = NULL WHERE id = ?")
      .run(workflowThreadId);

    const recovered = store.getWorkflowAgentThreadSummary(workflowThreadId);

    expect(recovered.activeGraphSnapshotId).toBe(graph.id);
    expect(recovered.graph).toMatchObject({
      id: graph.id,
      summary: "Research then format pool results.",
      nodes: expect.arrayContaining([expect.objectContaining({ id: "format", label: "Format report" })]),
    });
  });

  it("derives a review graph for unversioned workflow artifacts without stored graph snapshots", () => {
    const artifact = store.createWorkflowArtifact({
      title: "Direct compile workflow",
      status: "ready_for_preview",
      manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only" },
      spec: { goal: "Summarize local notes", summary: "Read notes and produce a concise summary." },
      sourcePath: join(workspacePath, ".ambient-codex", "workflows", "direct", "main.ts"),
      statePath: join(workspacePath, ".ambient-codex", "workflows", "direct", "state.json"),
    });

    const thread = store.getWorkflowAgentThreadSummary(artifact.workflowThreadId!);

    expect(thread.latestVersion).toBeUndefined();
    expect(thread.activeGraphSnapshotId).toBe(`artifact-derived:${artifact.id}`);
    expect(thread.graph).toMatchObject({
      id: `artifact-derived:${artifact.id}`,
      version: 0,
      summary: "Read notes and produce a concise summary.",
      nodes: expect.arrayContaining([
        expect.objectContaining({ id: "request", type: "request" }),
        expect.objectContaining({ id: "ambient-model", type: "model_call" }),
      ]),
    });
  });

  it("persists workflow discovery questions and answers on workflow threads", () => {
    const thread = store.createWorkflowAgentThreadSummary({
      initialRequest: "Build a weekly markdown summary workflow.",
      phase: "discovery",
    });
    const question = store.createWorkflowDiscoveryQuestion({
      workflowThreadId: thread.id,
      category: "scope",
      context: "Request: Build a weekly markdown summary workflow.",
      question: "What should trigger this workflow?",
      choices: [{ id: "manual", label: "Manual", description: "Run on demand.", recommended: true }],
      allowFreeform: true,
      graphImpact: "Defines the trigger node.",
      capabilitySearch: {
        query: "Build a weekly markdown summary workflow.",
        policy: "Safe metadata only.",
        totalCandidateCount: 1,
        omittedCandidateCount: 0,
        results: [
          {
            id: "base-directory",
            kind: "base_directory",
            label: "Base directory files",
            description: "Safe file metadata can be considered.",
            status: "requires_grant",
            recommendation: "available",
            reason: "The request mentions local files.",
            matchedTerms: ["file"],
            permissionCapability: "file_content",
            targetLabel: "workflow base directory file contents",
          },
        ],
      },
      capabilityDescriptions: [
        {
          id: "base-directory",
          kind: "base_directory",
          label: "Base directory files",
          description: "Safe file metadata can be considered.",
          status: "requires_grant",
          recommendation: "available",
          policy: "Base-directory search exposes safe file metadata only.",
          permissionCapability: "file_content",
          targetLabel: "workflow base directory file contents",
          mutationClass: "read_only",
          inputShapeSummary: "1 safe metadata candidate; content is not included by search.",
          outputShapeSummary: "Runtime file reads return bounded previews and persisted full artifacts.",
          availabilitySummary: "1 file metadata candidate scanned.",
          examples: ["Use when the workflow should inspect files already present in the workflow base directory."],
          warnings: ["Search/describe does not read file contents."],
        },
      ],
      accessRequests: [
        {
          id: "access-notes",
          capability: "file_content",
          actionKind: "file_content_read",
          targetKind: "path",
          targetLabel: "notes.md",
          targetHash: "hash-notes",
          reason: "File contents would improve discovery.",
          auditDetail: "file_content: notes.md",
          risk: "outside-workspace",
          reusableScopes: ["workflow_thread", "project", "workspace"],
          recommendedResponse: "always_workflow",
          status: "pending",
        },
      ],
      cacheCheckpoint: {
        id: "workflow-cache-discovery-test",
        stage: "discovery",
        workflowThreadId: thread.id,
        stablePrefixHash: "stable-hash",
        stablePrefixChars: 24,
        stablePrefixEstimatedTokens: 6,
        mutableSuffixHash: "mutable-hash",
        mutableSuffixChars: 32,
        mutableSuffixEstimatedTokens: 8,
        requestHash: "request-hash",
        requestEstimatedTokens: 14,
        boundaryLabel: "Discovery boundary",
        createdAt: "2026-04-30T00:00:00.000Z",
      },
      graphPatch: {
        summary: "Manual trigger to markdown output.",
        upsertNodes: [{ id: "markdown-output", type: "output", label: "Markdown output" }],
        upsertEdges: [{ id: "scope-to-markdown-output", source: "scope", target: "markdown-output", type: "data_flow" }],
      },
    });

    expect(store.getWorkflowAgentThreadSummary(thread.id).discoveryQuestions).toEqual([
      expect.objectContaining({
        id: question.id,
        category: "scope",
        choices: [expect.objectContaining({ id: "manual", recommended: true })],
        capabilitySearch: expect.objectContaining({
          query: "Build a weekly markdown summary workflow.",
          results: [expect.objectContaining({ id: "base-directory", kind: "base_directory" })],
        }),
        capabilityDescriptions: [
          expect.objectContaining({
            id: "base-directory",
            kind: "base_directory",
            mutationClass: "read_only",
            permissionCapability: "file_content",
          }),
        ],
        cacheCheckpoint: expect.objectContaining({
          id: "workflow-cache-discovery-test",
          stage: "discovery",
          workflowThreadId: thread.id,
        }),
        graphPatch: expect.objectContaining({
          summary: "Manual trigger to markdown output.",
          upsertNodes: [expect.objectContaining({ id: "markdown-output" })],
        }),
        accessRequests: [
          expect.objectContaining({
            id: "access-notes",
            capability: "file_content",
            status: "pending",
          }),
        ],
      }),
    ]);

    const accessUpdated = store.updateWorkflowDiscoveryAccessRequests({
      questionId: question.id,
      accessRequests: [{ ...question.accessRequests![0], status: "allowed", response: "always_workflow", grantId: "grant-notes" }],
    });
    expect(accessUpdated.accessRequests?.[0]).toMatchObject({
      status: "allowed",
      response: "always_workflow",
      grantId: "grant-notes",
    });

    const answered = store.answerWorkflowDiscoveryQuestion({ questionId: question.id, choiceId: "manual", freeform: "Weekly on Mondays later." });
    expect(answered.answer).toMatchObject({ choiceId: "manual", freeform: "Weekly on Mondays later." });
    expect(store.listWorkflowDiscoveryQuestions(thread.id)[0].answeredAt).toEqual(expect.any(String));
  });

  it("persists workflow revision proposals linked to versions and graph diffs", () => {
    const thread = store.createWorkflowAgentThreadSummary({
      title: "Inbox workflow",
      initialRequest: "Classify incoming messages.",
    });
    const artifact = store.createWorkflowArtifact({
      workflowThreadId: thread.id,
      title: "Inbox workflow",
      status: "approved",
      manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only", maxModelCalls: 2 },
      spec: { goal: "Classify incoming messages." },
      sourcePath: join(workspacePath, ".ambient-codex", "workflows", "inbox", "main.ts"),
      statePath: join(workspacePath, ".ambient-codex", "workflows", "inbox", "state.json"),
    });
    const currentGraph = store.createWorkflowGraphSnapshot({
      workflowThreadId: thread.id,
      source: "compile",
      summary: "Classify messages.",
      nodes: [
        { id: "request", type: "request", label: "Request" },
        { id: "model", type: "model_call", label: "Classify", modelRole: "Categorize", retryPolicy: "same input" },
      ],
      edges: [{ id: "request-model", source: "request", target: "model", type: "control_flow" }],
    });
    const version = store.createWorkflowVersion({
      workflowThreadId: thread.id,
      artifactId: artifact.id,
      graphSnapshotId: currentGraph.id,
      sourcePath: artifact.sourcePath,
      repoPath: dirname(artifact.sourcePath),
      status: "approved",
      createdBy: "compiler",
    });
    const proposedGraph = store.createWorkflowGraphSnapshot({
      workflowThreadId: thread.id,
      source: "revision",
      summary: "Classify messages and review low confidence results.",
      nodes: [
        ...currentGraph.nodes,
        { id: "review", type: "review_gate", label: "Review low confidence", reviewPolicy: "requiresReviewBelowConfidence=0.7" },
      ],
      edges: [
        currentGraph.edges[0],
        { id: "model-review", source: "model", target: "review", type: "condition", label: "low confidence" },
      ],
    });
    const graphDiff = diffWorkflowGraphs({
      current: currentGraph,
      proposed: proposedGraph,
      currentManifest: artifact.manifest,
      proposedManifest: { ...artifact.manifest, mutationPolicy: "staged_until_approved", requiresReviewBelowConfidence: 0.7 },
    });

    const revision = store.createWorkflowRevision({
      workflowThreadId: thread.id,
      baseVersionId: version.id,
      baseArtifactId: artifact.id,
      requestedChange: " Add review for low-confidence classifications. ",
      proposedGraphSnapshotId: proposedGraph.id,
      graphDiff,
      sourceDiff: "diff --git a/main.ts b/main.ts\n+review gate\n",
      status: "proposed",
    });

    expect(revision).toMatchObject({
      workflowThreadId: thread.id,
      baseVersionId: version.id,
      baseArtifactId: artifact.id,
      requestedChange: "Add review for low-confidence classifications.",
      proposedGraphSnapshotId: proposedGraph.id,
      sourceDiff: expect.stringContaining("+review gate"),
      status: "proposed",
    });
    expect(revision.graphDiff).toMatchObject({
      addedNodes: [expect.objectContaining({ id: "review" })],
      manifest: expect.objectContaining({
        fieldChanges: expect.arrayContaining([expect.objectContaining({ field: "mutationPolicy" })]),
      }),
    });
    expect(store.getWorkflowAgentThreadSummary(thread.id).phase).toBe("revision");
    expect(store.listWorkflowRevisions(thread.id)).toEqual([expect.objectContaining({ id: revision.id })]);

    const updated = store.updateWorkflowRevision({
      id: revision.id,
      status: "applied",
      sourceDiff: null,
    });
    expect(updated).toMatchObject({ id: revision.id, status: "applied", sourceDiff: undefined });

    const otherThread = store.createWorkflowAgentThreadSummary({ initialRequest: "Other workflow." });
    const otherGraph = store.createWorkflowGraphSnapshot({
      workflowThreadId: otherThread.id,
      source: "revision",
      summary: "Other graph",
      nodes: [{ id: "request", type: "request", label: "Request" }],
      edges: [],
    });
    expect(() =>
      store.createWorkflowRevision({
        workflowThreadId: thread.id,
        requestedChange: "Use the wrong graph.",
        proposedGraphSnapshotId: otherGraph.id,
      }),
    ).toThrow(/does not belong to workflow thread/i);
  });

  it("resolves workflow revision proposals by activating proposed versions or restoring the base", () => {
    const thread = store.createWorkflowAgentThreadSummary({
      title: "Revision workflow",
      initialRequest: "Summarize local notes.",
    });
    const baseArtifact = store.createWorkflowArtifact({
      workflowThreadId: thread.id,
      title: "Revision workflow",
      status: "approved",
      manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only" },
      spec: { goal: "Summarize local notes." },
      sourcePath: join(workspacePath, ".ambient-codex", "workflows", "revision", "base.ts"),
      statePath: join(workspacePath, ".ambient-codex", "workflows", "revision", "base-state.json"),
    });
    const baseGraph = store.createWorkflowGraphSnapshot({
      workflowThreadId: thread.id,
      source: "compile",
      summary: "Summarize notes.",
      nodes: [{ id: "summarize", type: "model_call", label: "Summarize" }],
      edges: [],
    });
    const baseVersion = store.createWorkflowVersion({
      workflowThreadId: thread.id,
      artifactId: baseArtifact.id,
      graphSnapshotId: baseGraph.id,
      sourcePath: baseArtifact.sourcePath,
      repoPath: dirname(baseArtifact.sourcePath),
      status: "approved",
      createdBy: "compiler",
    });

    const proposedArtifact = store.createWorkflowArtifact({
      workflowThreadId: thread.id,
      title: "Revision workflow with review",
      status: "ready_for_preview",
      manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only", requiresReviewBelowConfidence: 0.7 },
      spec: { goal: "Summarize local notes.", summary: "Adds review for uncertain summaries." },
      sourcePath: join(workspacePath, ".ambient-codex", "workflows", "revision", "proposed.ts"),
      statePath: join(workspacePath, ".ambient-codex", "workflows", "revision", "proposed-state.json"),
    });
    const proposedGraph = store.createWorkflowGraphSnapshot({
      workflowThreadId: thread.id,
      source: "revision",
      summary: "Summarize notes with review.",
      nodes: [
        ...baseGraph.nodes,
        { id: "review", type: "review_gate", label: "Review uncertain summaries" },
      ],
      edges: [{ id: "summarize-review", source: "summarize", target: "review", type: "condition", label: "low confidence" }],
    });
    const proposedVersion = store.createWorkflowVersion({
      workflowThreadId: thread.id,
      artifactId: proposedArtifact.id,
      graphSnapshotId: proposedGraph.id,
      sourcePath: proposedArtifact.sourcePath,
      repoPath: dirname(proposedArtifact.sourcePath),
      status: "ready_for_review",
      createdBy: "ambient_debug_rewrite",
    });
    const revision = store.createWorkflowRevision({
      workflowThreadId: thread.id,
      baseVersionId: baseVersion.id,
      baseArtifactId: baseArtifact.id,
      requestedChange: "Add review for uncertain summaries.",
      proposedGraphSnapshotId: proposedGraph.id,
      status: "proposed",
    });

    expect(revision).toMatchObject({
      proposedVersionId: proposedVersion.id,
      proposedArtifactId: proposedArtifact.id,
    });
    const applied = store.resolveWorkflowRevision({ id: revision.id, decision: "applied" });
    expect(applied.status).toBe("applied");
    expect(store.getWorkflowAgentThreadSummary(thread.id)).toMatchObject({
      activeArtifactId: proposedArtifact.id,
      activeGraphSnapshotId: proposedGraph.id,
      phase: "ready_for_review",
    });

    const rejectedArtifact = store.createWorkflowArtifact({
      workflowThreadId: thread.id,
      title: "Rejected revision workflow",
      status: "ready_for_preview",
      manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only" },
      spec: { goal: "Summarize local notes.", summary: "Experimental rejected change." },
      sourcePath: join(workspacePath, ".ambient-codex", "workflows", "revision", "rejected.ts"),
      statePath: join(workspacePath, ".ambient-codex", "workflows", "revision", "rejected-state.json"),
    });
    const rejectedGraph = store.createWorkflowGraphSnapshot({
      workflowThreadId: thread.id,
      source: "revision",
      summary: "Experimental rejected graph.",
      nodes: [...proposedGraph.nodes, { id: "archive", type: "output", label: "Archive" }],
      edges: proposedGraph.edges,
    });
    store.createWorkflowVersion({
      workflowThreadId: thread.id,
      artifactId: rejectedArtifact.id,
      graphSnapshotId: rejectedGraph.id,
      sourcePath: rejectedArtifact.sourcePath,
      repoPath: dirname(rejectedArtifact.sourcePath),
      status: "ready_for_review",
      createdBy: "ambient_debug_rewrite",
    });
    const rejectedRevision = store.createWorkflowRevision({
      workflowThreadId: thread.id,
      baseVersionId: proposedVersion.id,
      baseArtifactId: proposedArtifact.id,
      requestedChange: "Try an archive step.",
      proposedGraphSnapshotId: rejectedGraph.id,
      status: "proposed",
    });

    const rejected = store.resolveWorkflowRevision({ id: rejectedRevision.id, decision: "rejected" });
    expect(rejected.status).toBe("rejected");
    expect(store.getWorkflowAgentThreadSummary(thread.id)).toMatchObject({
      activeArtifactId: proposedArtifact.id,
      activeGraphSnapshotId: proposedGraph.id,
      phase: "ready_for_review",
    });
  });

  it("persists automation schedule records with target labels and next-run timestamps", () => {
    const task = store.createOrchestrationTask({ title: "Scheduled task", priority: 1 });

    let schedules = store.createAutomationSchedule({
      targetKind: "local_task",
      targetId: task.id,
      preset: "advanced",
      cronExpression: "15 8 * * 1",
      timezone: "America/Phoenix",
      enabled: true,
    });

    expect(schedules).toHaveLength(1);
    expect(schedules[0]).toMatchObject({
      targetKind: "local_task",
      targetId: task.id,
      targetLabel: "LOCAL-1: Scheduled task",
      preset: "advanced",
      cronExpression: "15 8 * * 1",
      timezone: "America/Phoenix",
      enabled: true,
      skipIfActive: true,
      concurrencyPolicy: "skip_if_active",
    });
    expect(schedules[0].nextRunAt).toBeTruthy();

    store.close();
    store.openWorkspace(workspacePath);
    schedules = store.listAutomationSchedules();

    expect(schedules[0]).toMatchObject({
      targetKind: "local_task",
      targetLabel: "LOCAL-1: Scheduled task",
      preset: "advanced",
      cronExpression: "15 8 * * 1",
    });

    const thread = store.createWorkflowAgentThreadSummary({
      title: "Weekly briefing",
      initialRequest: "Build a weekly briefing workflow.",
    });
    expect(() =>
      store.createAutomationSchedule({
        targetKind: "workflow_thread",
        targetId: thread.id,
        preset: "daily",
        timezone: "America/Phoenix",
      }),
    ).toThrow("Workflow Agent has no approved version to schedule.");

    const artifact = store.createWorkflowArtifact({
      workflowThreadId: thread.id,
      title: "Weekly briefing",
      status: "approved",
      manifest: { tools: [], mutationPolicy: "read_only" },
      spec: { goal: "Build a weekly briefing workflow." },
      sourcePath: join(workspacePath, ".ambient-codex", "workflows", "weekly", "main.ts"),
      statePath: join(workspacePath, ".ambient-codex", "workflows", "weekly", "state.json"),
    });
    const version = store.createWorkflowVersion({
      workflowThreadId: thread.id,
      artifactId: artifact.id,
      sourcePath: artifact.sourcePath,
      repoPath: dirname(artifact.sourcePath),
      status: "approved",
      createdBy: "compiler",
    });
    schedules = store.createAutomationSchedule({
      targetKind: "workflow_thread",
      targetId: thread.id,
      preset: "daily",
      timezone: "America/Phoenix",
    });
    expect(schedules[0]).toMatchObject({
      targetKind: "workflow_thread",
      targetId: thread.id,
      targetLabel: "Weekly briefing (latest approved)",
      preset: "daily",
    });
    schedules = store.createAutomationSchedule({
      targetKind: "workflow_version",
      targetId: version.id,
      preset: "weekly",
      timezone: "America/Phoenix",
    });
    expect(schedules[0]).toMatchObject({
      targetKind: "workflow_version",
      targetId: version.id,
      targetLabel: "Weekly briefing v1 (pinned)",
      preset: "weekly",
    });

    const recordingThread = store.createWorkflowRecordingThread({
      goal: "Summarize weekly customer emails.",
      workspacePath,
    });
    store.addMessage({ threadId: recordingThread.id, role: "user", content: "Summarize this week's customer emails." });
    store.addMessage({
      threadId: recordingThread.id,
      role: "tool",
      content: "gmail.search completed\nFound customer email threads.",
      metadata: { toolName: "gmail.search", toolCallId: "gmail-1", status: "done" },
    });
    store.stopWorkflowRecording(recordingThread.id);
    store.updateWorkflowRecordingReviewDraft(recordingThread.id, {
      intent: "Summarize weekly customer emails.",
      inputs: ["Week window", "Customer mailbox scope"],
      successfulExamples: [{ toolName: "gmail.search", inputPreview: '{"query":"newer_than:7d"}', resultPreview: "Customer email threads." }],
      doNot: [],
      validation: ["Final answer groups customer themes with source notes."],
      outputShape: ["Theme summary with representative customer threads."],
    });
    const savedPlaybook = store.confirmWorkflowRecordingReview(recordingThread.id).review!.savedPlaybook!;
    schedules = store.createAutomationSchedule({
      targetKind: "workflow_playbook",
      targetId: savedPlaybook.id,
      preset: "daily",
      timezone: "America/Phoenix",
    });
    expect(schedules[0]).toMatchObject({
      targetKind: "workflow_playbook",
      targetId: savedPlaybook.id,
      targetLabel: "Summarize weekly customer emails. (current v1)",
      createdTargetVersionId: "1",
      dedicatedThreadId: expect.any(String),
      preset: "daily",
    });
    expect(store.getThread(schedules[0].dedicatedThreadId!)).toMatchObject({
      title: "Scheduled: Summarize weekly customer emails. (current)",
    });
    expect(store.listThreads().find((thread) => thread.id === schedules[0].dedicatedThreadId)).toMatchObject({
      scheduledCheckIn: {
        scheduleId: schedules[0].id,
        nextRunAt: schedules[0].nextRunAt,
        targetKind: "workflow_playbook",
        targetLabel: "Summarize weekly customer emails. (current v1)",
      },
    });

    schedules = store.updateAutomationSchedule({ id: schedules[0].id, enabled: false });
    expect(schedules[0].nextRunAt).toBeUndefined();
    expect(store.listThreads().find((thread) => thread.id === schedules[0].dedicatedThreadId)?.scheduledCheckIn).toBeUndefined();

    const previewArtifact = store.createWorkflowArtifact({
      title: "Preview schedule target",
      status: "ready_for_preview",
      manifest: { tools: [], mutationPolicy: "read_only" },
      spec: { goal: "Preview schedule target." },
      sourcePath: join(workspacePath, ".ambient-codex", "workflows", "preview", "main.ts"),
      statePath: join(workspacePath, ".ambient-codex", "workflows", "preview", "state.json"),
    });
    expect(() =>
      store.createAutomationSchedule({
        targetKind: "workflow_artifact",
        targetId: previewArtifact.id,
        preset: "daily",
      }),
    ).toThrow("Workflow artifact is ready_for_preview and cannot be scheduled until approved.");
  });

  it("lists and advances due automation schedules", () => {
    const task = store.createOrchestrationTask({ title: "Due task", state: "ready" });
    const createdAt = new Date(2026, 0, 1, 8, 0, 0, 0);
    const dueAt = new Date(2026, 0, 1, 10, 0, 0, 0);
    const schedules = store.createAutomationSchedule(
      {
        targetKind: "local_task",
        targetId: task.id,
        preset: "daily",
        timezone: "America/Phoenix",
        enabled: true,
      },
      createdAt,
    );

    expect(store.listDueAutomationSchedules(dueAt).map((schedule) => schedule.id)).toEqual([schedules[0].id]);
    const advanced = store.advanceAutomationSchedule(schedules[0].id, dueAt);

    expect(advanced.lastRunAt).toBe(dueAt.toISOString());
    expect(advanced.nextRunAt).toBe(new Date(2026, 0, 2, 9, 0, 0, 0).toISOString());
    expect(store.listDueAutomationSchedules(dueAt)).toEqual([]);
  });

  it("surfaces workflow plugin requirements in automation thread badges", () => {
    const artifact = store.createWorkflowArtifact({
      title: "Plugin workflow",
      status: "ready_for_preview",
      manifest: {
        tools: ["fixture_tool"],
        mutationPolicy: "read_only",
        pluginCapabilities: [
          {
            capabilityId: "plugin-1:mcp-tool:server:fixture_original",
            pluginId: "plugin-1",
            pluginName: "Fixture",
            serverName: "server",
            toolName: "fixture_original",
            registeredName: "fixture_tool",
          },
        ],
      },
      spec: { goal: "Run the fixture plugin.", summary: "Uses a plugin MCP tool." },
      sourcePath: join(workspacePath, "workflow.ts"),
      statePath: join(workspacePath, "workflow-state.json"),
    });

    const home = store.listAutomationFolders().find((folder) => folder.kind === "home");
    const thread = home?.threads.find((item) => item.sourceId === artifact.id);

    expect(thread).toMatchObject({
      kind: "workflow_artifact",
      title: "Plugin workflow",
      badges: expect.arrayContaining(["1 plugin requirement", "fixture_tool"]),
    });
  });
});
