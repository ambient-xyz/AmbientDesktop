import { createHash } from "node:crypto";

export function createVisualWorkflowFixtures(actions) {
  const { evaluate, delay, clickButton, waitFor } = actions;

  async function emitE2eEvent(cdp, event) {
    if (event?.type === "state") {
      await evaluate(
        cdp,
        `
        (() => {
          window.__ambientVisualDesktopState = ${JSON.stringify(event.state)};
          if (!window.__ambientVisualOriginalBootstrap) {
            window.__ambientVisualOriginalBootstrap = window.ambientDesktop.bootstrap;
            window.ambientDesktop.bootstrap = async () => window.__ambientVisualDesktopState ?? window.__ambientVisualOriginalBootstrap();
          }
        })()
      `,
      );
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await evaluate(cdp, `window.ambientDesktop.emitE2eEvent(${JSON.stringify(event)})`);
        await delay(75);
      }
      return;
    }
    await evaluate(cdp, `window.ambientDesktop.emitE2eEvent(${JSON.stringify(event)})`);
  }

  async function emitWorkflowCompileProgressFixture(cdp, state) {
    const compileId = "visual-workflow-compile";
    const createdAt = new Date().toISOString();
    const runningEvents = [
      {
        compileId,
        phase: "context",
        status: "completed",
        message: "Read the workflow request, discovery context, and project context.",
        current: 1,
        total: 5,
        createdAt,
        detail: "tools: 7 · connectors: 2 · graphNodeCount: 4",
        metrics: { discoveryAnswerCount: 1, graphNodeCount: 4 },
      },
      {
        compileId,
        phase: "prompt",
        status: "completed",
        message: "Built the compiler prompt.",
        current: 2,
        total: 5,
        createdAt,
        detail: "prompt: 12,840 chars · stablePrefixTokens: 2,440 · mutableSuffixTokens: 1,280",
        metrics: { promptChars: 12840, stablePrefixTokens: 2440, mutableSuffixTokens: 1280 },
      },
      {
        compileId,
        phase: "model",
        status: "running",
        message: "Receiving Ambient compiler stream.",
        current: 3,
        total: 5,
        createdAt,
        detail: "zai-org/GLM-5.1-FP8",
        metrics: {
          rawResponseChars: 4096,
          thinkingChars: 2048,
          providerElapsedMs: 27000,
          idleTimeoutMs: 120000,
          timeoutMode: "idle_watchdog",
        },
      },
    ];
    const failedEvent = {
      compileId,
      phase: "failed",
      status: "failed",
      message: "Workflow preview compilation failed.",
      current: 5,
      total: 5,
      createdAt,
      detail: "response: 10,039 chars",
      error: "Compiler output source maps to unknown graph node id: format",
      metrics: { rawResponseChars: 10039, idleElapsedMs: 0 },
    };
    const events =
      state === "failed" ? [...runningEvents.slice(0, 2), { ...runningEvents[2], status: "completed" }, failedEvent] : runningEvents;
    for (const progress of events) await emitE2eEvent(cdp, { type: "workflow-compile-progress", progress });
  }

  async function seedWorkflowDiscoveryThread(cdp) {
    const state = await evaluate(cdp, "window.ambientDesktop.bootstrap()");
    const folder = state.workflowAgentFolders.find((item) => item.kind === "home") ?? state.workflowAgentFolders[0];
    if (!folder) throw new Error("Expected a workflow agent folder before seeding discovery visual state.");
    const now = new Date().toISOString();
    const createdFolders = await evaluate(
      cdp,
      `window.ambientDesktop.createWorkflowAgentThread(${JSON.stringify({
        folderId: folder.id,
        initialRequest: "Summarize local markdown notes every Monday morning.",
        title: "Visual Discovery Workflow",
        traceMode: "production",
        phase: "discovery",
      })})`,
    );
    const createdThread = createdFolders.flatMap((item) => item.threads || []).find((item) => item.title === "Visual Discovery Workflow");
    if (!createdThread) throw new Error("Expected visual workflow thread creation to return the created thread.");
    const threadId = createdThread.id;
    const thread = {
      ...createdThread,
      id: threadId,
      folderId: folder.id,
      projectName: state.workspace.name,
      projectPath: state.workspace.path,
      title: "Visual Discovery Workflow",
      phase: "discovery",
      initialRequest: "Summarize local markdown notes every Monday morning.",
      preview: "Planner-style discovery is collecting trigger, data-source, and model-role details.",
      status: "needs_discovery",
      traceMode: "production",
      activeGraphSnapshotId: "visual-workflow-discovery-graph",
      graph: {
        id: "visual-workflow-discovery-graph",
        workflowThreadId: threadId,
        version: 1,
        source: "discovery",
        summary: "Request flows through local markdown files into an Ambient summary and weekly output.",
        createdAt: now,
        nodes: [
          {
            id: "request",
            type: "request",
            label: "Weekly summary request",
            description: "Summarize local markdown notes every Monday morning.",
          },
          {
            id: "notes",
            type: "data_source",
            label: "Local markdown notes",
            description: "Read workspace markdown files as source evidence.",
            toolNames: ["file_read"],
          },
          {
            id: "summarize",
            type: "model_call",
            label: "Summarize notes",
            modelRole: "Extract themes, risks, and next actions from markdown evidence.",
            inputSummary: "Markdown file excerpts and file metadata.",
            outputSummary: "Concise weekly report with source references.",
            retryPolicy: "Retry with the same retained file excerpts if schema validation fails.",
            toolNames: ["ambient.responses"],
          },
          { id: "output", type: "output", label: "Weekly report", description: "Checkpoint the summary and audit source paths." },
        ],
        edges: [
          { id: "request-notes", source: "request", target: "notes", type: "control_flow", label: "scan" },
          { id: "notes-summarize", source: "notes", target: "summarize", type: "data_flow", label: "evidence" },
          { id: "summarize-output", source: "summarize", target: "output", type: "data_flow", label: "report" },
        ],
      },
      discoveryQuestions: [
        {
          id: "visual-workflow-question-trigger",
          workflowThreadId: threadId,
          category: "scope",
          context: "The workflow needs a schedule trigger before source generation.",
          question: "What should trigger the local markdown summary workflow?",
          choices: [
            { id: "weekly", label: "Every Monday", description: "Run automatically every Monday morning." },
            { id: "manual", label: "Manual only", description: "Run only when explicitly started from the workflow thread." },
            { id: "folder-change", label: "Folder changes", description: "Run when markdown files are added or modified." },
          ],
          allowFreeform: true,
          graphImpact: "The answer sets the trigger node and schedule policy before compilation.",
          provider: "ambient",
          providerModel: "visual-fixture",
          activityEvents: [
            {
              id: "visual-scan",
              title: "Scanned base directory",
              summary: "3 candidate markdown files, 1 skipped path.",
              kind: "scan",
              status: "completed",
              createdAt: now,
            },
            {
              id: "visual-provider",
              title: "Ambient/Pi generated discovery questions",
              summary: "1 question returned by visual fixture.",
              kind: "provider_wait",
              status: "completed",
              durationMs: 1240,
              createdAt: now,
            },
          ],
          createdAt: now,
        },
      ],
      badges: ["Discovery", "Production traces"],
      createdAt: now,
      updatedAt: now,
    };
    const nextState = {
      ...state,
      workflowAgentFolders: state.workflowAgentFolders.map((item) =>
        item.id === folder.id
          ? {
              ...item,
              threads: [thread, ...item.threads.filter((candidate) => candidate.id !== threadId)],
            }
          : item,
      ),
    };
    await emitE2eEvent(cdp, { type: "state", state: nextState });
    return nextState;
  }

  async function seedWorkflowRecoveryVisual(cdp, threadTitle) {
    const state = await evaluate(cdp, "window.ambientDesktop.bootstrap()");
    const dashboard = await evaluate(cdp, "window.ambientDesktop.listWorkflowDashboard()");
    const thread = findWorkflowAgentThread(state, threadTitle);
    if (!thread) throw new Error(`Expected workflow thread ${threadTitle} before seeding recovery visual state.`);
    const now = new Date().toISOString();
    const artifactId =
      thread.activeArtifactId ||
      dashboard.artifacts.find((artifact) => artifact.workflowThreadId === thread.id)?.id ||
      "visual-recovery-artifact";
    const graph = workflowRecoveryGraph(thread, now);
    const processingNode = recoveryProcessingNode(graph);
    const artifact =
      dashboard.artifacts.find((candidate) => candidate.id === artifactId) ||
      dashboard.artifacts.find((candidate) => candidate.workflowThreadId === thread.id) ||
      syntheticWorkflowArtifact({ artifactId, thread, now });
    const run = {
      id: "visual-recovery-run",
      artifactId: artifact.id,
      status: "failed",
      startedAt: now,
      updatedAt: now,
      completedAt: now,
      error: "Schema validation failed while summarizing retained item beta.",
    };
    const detail = {
      artifact,
      run,
      events: workflowRecoveryEvents({ runId: run.id, artifactId: artifact.id, nodeId: processingNode.id, now }),
      modelCalls: [workflowRecoveryModelCall({ runId: run.id, artifactId: artifact.id, nodeId: processingNode.id, now })],
      checkpoints: [{ key: "records", valuePreview: '[{"id":"alpha"},{"id":"beta"},{"id":"gamma"}]', runId: run.id, updatedAt: now }],
      approvals: [],
      auditReport: "Visual recovery fixture: failed item beta retains input, checkpoint, model-call payload, and cache metadata.",
      sourceContent: "export async function run() {\n  // Visual fixture source for graph recovery review.\n}\n",
    };
    const updatedThread = {
      ...thread,
      phase: "planned",
      status: "failed",
      activeArtifactId: artifact.id,
      activeGraphSnapshotId: graph.id,
      graph,
      latestRun: { id: run.id, status: "failed", startedAt: run.startedAt, updatedAt: run.updatedAt, error: run.error },
      badges: unique([...(thread.badges || []), "Failed run", "Graph recovery"]),
      updatedAt: now,
    };
    const nextState = withWorkflowAgentThread(state, updatedThread);
    await emitE2eEvent(cdp, { type: "state", state: nextState });
    await emitE2eEvent(cdp, {
      type: "e2e-workflow-dashboard-fixture",
      dashboard: {
        artifacts: upsertById(dashboard.artifacts, artifact),
        runs: upsertById(dashboard.runs, run),
      },
      detail,
    });
    return {
      threadId: thread.id,
      artifactId: artifact.id,
      graph,
      processingNode,
      failedRunId: run.id,
      failedEventId: "visual-recovery-invalid",
    };
  }

  async function assertWorkflowDebugRewriteClickUsesGraphEvent(cdp, fixture) {
    await evaluate(
      cdp,
      `
      (() => {
        window.__workflowDebugRewriteInputs = [];
        window.ambientDesktop.onEvent((event) => {
          if (event.type === "e2e-workflow-debug-rewrite-input") window.__workflowDebugRewriteInputs.push(event.input);
        });
        return true;
      })()
    `,
    );
    await waitFor(
      cdp,
      () => document.querySelector(".workflow-agent-data-cards")?.textContent?.includes("Ask Ambient to debug"),
      "visual workflow debug rewrite action before click",
    );
    await clickButton(cdp, "Ask Ambient to debug");
    await waitFor(cdp, () => window.__workflowDebugRewriteInputs?.length === 1, "visual workflow debug rewrite click input");
    const input = await evaluate(cdp, "window.__workflowDebugRewriteInputs[0]");
    if (input.runId !== fixture.failedRunId) {
      throw new Error(`Debug rewrite UI sent run ${input.runId}, expected ${fixture.failedRunId}.`);
    }
    if (input.eventId !== fixture.failedEventId) {
      throw new Error(`Debug rewrite UI sent event ${input.eventId}, expected ${fixture.failedEventId}.`);
    }
    if (!input.userNotes?.includes(fixture.processingNode.id)) {
      throw new Error(`Debug rewrite UI notes did not include selected graph node ${fixture.processingNode.id}.`);
    }
  }

  async function seedWorkflowRevisionVisual(cdp, fixture) {
    const afterNode = {
      ...fixture.processingNode,
      label: `${fixture.processingNode.label} with guarded recovery`,
      retryPolicy: "Retry with the same retained input, skip failed items when allowed, then continue from checkpoint.",
    };
    await evaluate(
      cdp,
      `window.ambientDesktop.createWorkflowRevision(${JSON.stringify({
        workflowThreadId: fixture.threadId,
        requestedChange:
          "Handle failed connector/model items by preserving retained inputs, showing retry/skip recovery, and adding a review note for skipped records.",
        baseArtifactId: fixture.artifactId,
        graphDiff: {
          currentGraphId: fixture.graph.id,
          proposedGraphId: `${fixture.graph.id}-recovery-proposal`,
          addedNodes: [
            {
              id: "review-skipped-items",
              after: {
                id: "review-skipped-items",
                type: "review_gate",
                label: "Review skipped items",
                description: "Surface skipped item evidence before approving the run output.",
              },
              fieldChanges: [],
            },
          ],
          removedNodes: [],
          changedNodes: [
            {
              id: fixture.processingNode.id,
              before: fixture.processingNode,
              after: afterNode,
              fieldChanges: [
                { field: "label", before: fixture.processingNode.label, after: afterNode.label },
                { field: "retryPolicy", before: fixture.processingNode.retryPolicy, after: afterNode.retryPolicy },
              ],
            },
          ],
          addedEdges: [
            {
              id: "edge-review-skipped-items",
              after: {
                id: "edge-review-skipped-items",
                source: fixture.processingNode.id,
                target: "review-skipped-items",
                type: "control_flow",
                label: "skipped item evidence",
              },
              fieldChanges: [],
            },
          ],
          removedEdges: [],
          changedEdges: [],
          manifest: {
            fieldChanges: [{ field: "maxToolCalls", before: 10, after: 12 }],
            addedConnectors: [],
            removedConnectors: [],
            changedConnectors: [],
            addedPluginCapabilities: [],
            removedPluginCapabilities: [],
            changedPluginCapabilities: [],
          },
        },
        sourceDiff:
          "diff --git a/main.ts b/main.ts\n--- a/main.ts\n+++ b/main.ts\n@@ -18,6 +18,10 @@\n+  await ambient.checkpoint('failedItemInput', currentItem);\n+  if (recovery.action === 'skip_item') {\n+    skipped.push(currentItem.id);\n+  }\n",
        status: "proposed",
      })})`,
    );
    await emitE2eEvent(cdp, { type: "workflow-updated" });
  }

  async function seedWorkflowPlanEditChatVisual(cdp, fixture) {
    const ensuredThread = await evaluate(
      cdp,
      `window.ambientDesktop.ensureWorkflowAgentChatThread({ workflowThreadId: ${JSON.stringify(fixture.threadId)} })`,
    );
    const chatThreadId = ensuredThread?.chatThreadId || "visual-workflow-plan-edit-chat";
    const now = new Date();
    const iso = (offsetMs) => new Date(now.getTime() + offsetMs).toISOString();
    const messages = [
      {
        id: "visual-workflow-plan-edit-user",
        threadId: chatThreadId,
        role: "user",
        content: "Can you explain what changed in this recovery revision before I apply it?",
        createdAt: iso(0),
        metadata: { workflowThreadId: fixture.threadId, workflowMode: "plan-edit" },
      },
      {
        id: "visual-workflow-plan-edit-thinking",
        threadId: chatThreadId,
        role: "assistant",
        content: "Hidden reasoning should not render as a workflow transcript card.",
        createdAt: iso(1_000),
        metadata: { kind: "thinking", status: "done" },
      },
      {
        id: "visual-workflow-plan-edit-answer",
        threadId: chatThreadId,
        role: "assistant",
        content:
          "The proposal keeps the failed input attached to the graph node, adds guarded retry behavior, and leaves apply control with Ambient validation.",
        createdAt: iso(2_000),
        metadata: { status: "done" },
      },
      {
        id: "visual-workflow-plan-edit-tool-context",
        threadId: chatThreadId,
        role: "tool",
        content: [
          "workflow_current_context completed",
          "",
          "Input",
          "{}",
          "",
          "Result",
          "workflow_current_context completed.",
          "",
          JSON.stringify(
            {
              counts: {
                versions: 1,
                runs: 1,
                graphNodes: 6,
                unansweredDiscoveryQuestions: 0,
              },
            },
            null,
            2,
          ),
        ].join("\n"),
        createdAt: iso(2_500),
        metadata: { status: "done", toolName: "workflow_current_context" },
      },
      {
        id: "visual-workflow-plan-edit-streaming",
        threadId: chatThreadId,
        role: "assistant",
        content: "",
        createdAt: iso(3_000),
        metadata: { status: "streaming" },
      },
    ];
    await emitE2eEvent(cdp, {
      type: "e2e-workflow-chat-fixture",
      workflowThreadId: fixture.threadId,
      messages,
    });
    await waitFor(
      cdp,
      () => document.querySelector(".workflow-thread-transcript")?.textContent?.includes("Pi is responding in Workflow Chat."),
      "visual workflow plan edit fixture chat",
    );
    await emitE2eEvent(cdp, {
      type: "e2e-workflow-chat-fixture",
      workflowThreadId: fixture.threadId,
      messages,
    });
    await waitFor(
      cdp,
      () => document.querySelector(".workflow-thread-transcript")?.textContent?.includes("Pi is responding in Workflow Chat."),
      "visual workflow plan edit fixture chat after state refresh",
    );
    await emitE2eEvent(cdp, {
      type: "runtime-activity",
      activity: {
        threadId: chatThreadId,
        kind: "stream",
        status: "running",
        outputChars: 2048,
        thinkingChars: 512,
        idleElapsedMs: 3000,
        idleTimeoutMs: 120000,
      },
    });
  }

  async function seedWorkflowSourceMappingVisual(cdp, fixture) {
    const state = await evaluate(cdp, "window.ambientDesktop.bootstrap()");
    const thread = state.workflowAgentFolders
      .flatMap((folder) => folder.threads || [])
      .find((candidate) => candidate.id === fixture.threadId);
    if (!thread) throw new Error("Expected workflow thread before seeding source mapping visual state.");
    const nextThread = {
      ...thread,
      activeGraphSnapshotId: fixture.graph.id,
      graph: fixture.graph,
      updatedAt: new Date().toISOString(),
    };
    await emitE2eEvent(cdp, { type: "state", state: withWorkflowAgentThread(state, nextThread) });
  }

  async function seedWorkflowRuntimeInputOutputVisual(cdp, fixture) {
    const state = await evaluate(cdp, "window.ambientDesktop.bootstrap()");
    const dashboard = await evaluate(cdp, "window.ambientDesktop.listWorkflowDashboard()");
    const thread = state.workflowAgentFolders
      .flatMap((folder) => folder.threads || [])
      .find((candidate) => candidate.id === fixture.threadId);
    if (!thread) throw new Error("Expected workflow thread before seeding runtime input/output visual state.");
    const now = new Date().toISOString();
    const artifact =
      dashboard.artifacts.find((candidate) => candidate.id === fixture.artifactId) ||
      dashboard.artifacts.find((candidate) => candidate.workflowThreadId === thread.id) ||
      syntheticWorkflowArtifact({ artifactId: fixture.artifactId, thread, now });
    const outputPath = "/visual/workflows/recovery/output/classification-preview.html";
    const run = {
      id: "visual-runtime-input-run",
      artifactId: artifact.id,
      status: "needs_input",
      startedAt: now,
      updatedAt: now,
      reportPath: "/visual/workflows/recovery/reports/runtime-input.md",
    };
    const outputItems = [
      { file: "notes.md", label: "Project notes", confidence: 0.94, summary: "Planning notes and candidate workflow requirements." },
      { file: "receipts.csv", label: "Finance", confidence: 0.88, summary: "Structured spending records with clear column headers." },
      { file: "photos/index.html", label: "Media index", confidence: 0.81, summary: "Generated gallery index with image references." },
    ];
    const markdownOutput = [
      "# File classifications",
      "",
      "- notes.md: Project notes - Planning notes and candidate workflow requirements.",
      "- receipts.csv: Finance - Structured spending records with clear column headers.",
      "- photos/index.html: Media index - Generated gallery index with image references.",
    ].join("\n");
    const detail = {
      artifact,
      run,
      events: [
        {
          id: "visual-runtime-input-start",
          runId: run.id,
          artifactId: artifact.id,
          seq: 1,
          type: "workflow.start",
          graphNodeId: "request",
          createdAt: now,
          message: "Started visual runtime input run.",
        },
        {
          id: "visual-runtime-output-ready",
          runId: run.id,
          artifactId: artifact.id,
          seq: 2,
          type: "workflow.output.ready",
          graphNodeId: "output",
          createdAt: now,
          message: "Prepared classification preview for user review.",
          data: {
            artifactPath: outputPath,
            markdown: markdownOutput,
            items: outputItems,
          },
        },
        {
          id: "visual-runtime-input-required",
          runId: run.id,
          artifactId: artifact.id,
          seq: 3,
          type: "workflow.input.required",
          graphNodeId: "output",
          createdAt: now,
          message: "Review classifications before applying labels?",
          data: {
            id: "visual-classification-review",
            prompt: "Review classifications before applying labels?",
            choices: [
              {
                id: "approve",
                label: "Looks right",
                description: "Resume and apply these labels to the generated report.",
              },
              {
                id: "revise",
                label: "Needs changes",
                description: "Leave feedback in Workflow Chat before resuming.",
              },
            ],
            allowFreeform: true,
            data: {
              report: {
                title: "Classification preview",
                artifactPath: outputPath,
                preview:
                  "<section><h1>File classifications</h1><p>Three representative files were labeled with confidence scores.</p></section>",
              },
              summary: "Three files are ready for qualitative review before applying labels to the full directory.",
            },
          },
        },
      ],
      modelCalls: [
        {
          id: "visual-runtime-output-model-call",
          runId: run.id,
          artifactId: artifact.id,
          task: "classify.files.output",
          status: "succeeded",
          input: { fileCount: 12, requestedFormat: "html" },
          output: {
            artifactPath: outputPath,
            markdown: markdownOutput,
            items: outputItems,
          },
          model: "zai-org/GLM-5.1-FP8",
          graphNodeId: "output",
          startedAt: now,
          completedAt: now,
          latencyMs: 4200,
        },
      ],
      checkpoints: [
        {
          key: "final_output",
          valuePreview: JSON.stringify({ artifactPath: outputPath, markdown: markdownOutput, items: outputItems }, null, 2),
          runId: run.id,
          updatedAt: now,
        },
      ],
      approvals: [],
      auditReport:
        "Visual runtime input/output fixture: output cards and attached artifact context stay visible while the run waits for qualitative user feedback.",
      sourceContent:
        "export async function run(ambient) {\n  const labels = await ambient.call('classify.files.output', { fileCount: 12 });\n  await ambient.output({ artifactPath: '/visual/workflows/recovery/output/classification-preview.html', markdown: labels.markdown });\n  await ambient.input({ prompt: 'Review classifications before applying labels?' });\n}\n",
    };
    const updatedThread = {
      ...thread,
      phase: "planned",
      status: "needs_input",
      activeArtifactId: artifact.id,
      activeGraphSnapshotId: fixture.graph.id,
      graph: fixture.graph,
      latestRun: { id: run.id, status: "needs_input", startedAt: run.startedAt, updatedAt: run.updatedAt },
      badges: unique([...(thread.badges || []), "Needs input", "Rendered outputs"]),
      updatedAt: now,
    };
    await emitE2eEvent(cdp, { type: "state", state: withWorkflowAgentThread(state, updatedThread) });
    await emitE2eEvent(cdp, {
      type: "e2e-workflow-dashboard-fixture",
      dashboard: {
        artifacts: upsertById(dashboard.artifacts, artifact),
        runs: upsertById(dashboard.runs, run),
      },
      detail,
    });
  }

  async function seedWorkflowScheduleVisual(cdp, fixture) {
    const state = await evaluate(cdp, "window.ambientDesktop.bootstrap()");
    const dashboard = await evaluate(cdp, "window.ambientDesktop.listWorkflowDashboard()");
    const thread = state.workflowAgentFolders
      .flatMap((folder) => folder.threads || [])
      .find((candidate) => candidate.id === fixture.threadId);
    if (!thread) throw new Error("Expected workflow thread before seeding schedule visual state.");
    const now = new Date().toISOString();
    const artifact =
      dashboard.artifacts.find((candidate) => candidate.id === fixture.artifactId) ||
      dashboard.artifacts.find((candidate) => candidate.workflowThreadId === thread.id) ||
      syntheticWorkflowArtifact({ artifactId: fixture.artifactId, thread, now });
    const approvedArtifact = {
      ...artifact,
      id: fixture.artifactId,
      workflowThreadId: thread.id,
      status: "approved",
      manifest: {
        ...artifact.manifest,
        tools: unique([...(artifact.manifest?.tools || []), "ambient.responses", "google.gmail.listMessages"]),
        mutationPolicy: "read_only",
        connectors: [
          {
            connectorId: "gmail.mail",
            accountId: "visual-gmail-account",
            scopes: ["gmail.readonly"],
            operations: ["listMessages", "getMessage"],
            dataRetention: "redacted_audit",
          },
        ],
        maxToolCalls: 20,
        maxModelCalls: 4,
        maxConnectorCalls: 120,
        maxRunMs: 300000,
      },
      spec: {
        ...artifact.spec,
        summary: "Approved visual workflow with latest-approved and pinned schedule targets.",
      },
      updatedAt: now,
    };
    const version3 = {
      id: "visual-workflow-version-3",
      workflowThreadId: thread.id,
      artifactId: "visual-workflow-artifact-v3",
      version: 3,
      graphSnapshotId: fixture.graph.id,
      sourcePath: approvedArtifact.sourcePath,
      repoPath: "/visual/workflows/recovery/.git",
      gitCommitHash: "visualv3",
      status: "approved",
      createdBy: "compiler",
      createdAt: "2026-05-02T00:00:00.000Z",
    };
    const version4 = {
      ...version3,
      id: "visual-workflow-version-4",
      artifactId: approvedArtifact.id,
      version: 4,
      gitCommitHash: "visualv4",
      createdAt: "2026-05-03T00:00:00.000Z",
    };
    const run = {
      id: "visual-schedule-ready-run",
      artifactId: approvedArtifact.id,
      status: "succeeded",
      startedAt: "2026-05-05T16:00:00.000Z",
      updatedAt: "2026-05-05T16:00:12.000Z",
      completedAt: "2026-05-05T16:00:12.000Z",
      reportPath: "/visual/workflows/recovery/reports/latest.md",
      scheduledBy: {
        scheduleId: "visual-schedule-latest-approved",
        outcome: "started",
        targetKind: "workflow_thread",
        targetId: thread.id,
        targetLabel: `${thread.title} (latest approved)`,
        targetVersionId: version4.id,
        createdTargetVersionId: version3.id,
        grantDecisionSource: "persistent_grant",
      },
    };
    const skippedRun = {
      id: "visual-schedule-skipped-run",
      artifactId: approvedArtifact.id,
      status: "skipped",
      startedAt: "2026-05-04T16:00:00.000Z",
      updatedAt: "2026-05-04T16:00:01.000Z",
      completedAt: "2026-05-04T16:00:01.000Z",
      error: "Workflow schedule requires persistent connector grant for gmail.mail.",
      scheduledBy: {
        scheduleId: "visual-schedule-latest-approved",
        outcome: "skipped",
        targetVersionId: version4.id,
      },
    };
    const pausedRun = {
      id: "visual-schedule-paused-run",
      artifactId: approvedArtifact.id,
      status: "paused",
      startedAt: "2026-05-06T16:00:00.000Z",
      updatedAt: "2026-05-06T16:01:05.000Z",
      completedAt: "2026-05-06T16:01:05.000Z",
      error: "Workflow reached the total runtime limit (650ms).",
      reportPath: "/visual/workflows/recovery/reports/paused.md",
      scheduledBy: {
        scheduleId: "visual-schedule-latest-approved",
        outcome: "started",
        targetKind: "workflow_thread",
        targetId: thread.id,
        targetLabel: `${thread.title} (latest approved)`,
        targetVersionId: version4.id,
        createdTargetVersionId: version3.id,
        grantDecisionSource: "persistent_grant",
      },
    };
    const scheduledThread = {
      ...thread,
      phase: "planned",
      status: "approved",
      activeArtifactId: approvedArtifact.id,
      activeGraphSnapshotId: fixture.graph.id,
      graph: fixture.graph,
      latestVersion: version4,
      latestRun: { id: run.id, status: "succeeded", startedAt: run.startedAt, updatedAt: run.updatedAt },
      badges: unique([...(thread.badges || []), "Approved", "Scheduled"]),
      updatedAt: now,
    };
    const connectorGrant = workflowConnectorPermissionGrant({
      thread,
      workspacePath: state.workspace.path,
      targetLabel: "gmail.mail:listMessages",
      now,
    });
    await emitE2eEvent(cdp, {
      type: "state",
      state: withWorkflowAgentThread({ ...state, settings: { ...state.settings, permissionMode: "workspace" } }, scheduledThread),
    });
    await emitE2eEvent(cdp, {
      type: "e2e-permission-fixture",
      grants: [connectorGrant],
      audit: [
        {
          id: "visual-schedule-grant-audit",
          threadId: state.activeThreadId,
          createdAt: now,
          permissionMode: "workspace",
          toolName: "google.gmail.listMessages",
          risk: "plugin-tool",
          decision: "allowed",
          detail: "gmail.mail:listMessages",
          reason: "Visual schedule fixture reused a workflow connector grant.",
          decisionSource: "persistent_grant",
          grantId: connectorGrant.id,
        },
        {
          id: "visual-schedule-full-access-receipt",
          threadId: state.activeThreadId,
          createdAt: now,
          permissionMode: "full-access",
          toolName: "browser_search",
          risk: "browser-network",
          decision: "allowed",
          detail: "browser_search was allowed automatically by Full Access mode during visual schedule dogfood.",
          reason: "Allowed automatically by Full Access mode.",
          decisionSource: "allowed_by_full_access",
        },
      ],
    });
    await emitE2eEvent(cdp, {
      type: "e2e-workflow-dashboard-fixture",
      dashboard: {
        artifacts: upsertById(dashboard.artifacts, approvedArtifact),
        runs: upsertById(upsertById(upsertById(dashboard.runs, run), skippedRun), pausedRun),
      },
      versions: [version4, version3],
      revisions: [],
      schedules: [
        {
          id: "visual-schedule-latest-approved",
          targetKind: "workflow_thread",
          targetId: thread.id,
          targetLabel: `${thread.title} (latest approved)`,
          createdTargetVersionId: version3.id,
          preset: "daily",
          timezone: "America/Phoenix",
          enabled: true,
          skipIfActive: true,
          concurrencyPolicy: "skip_if_active",
          nextRunAt: "2026-05-06T16:00:00.000Z",
          runLimits: { idleTimeoutMs: 120000, maxRunMs: null },
          createdAt: "2026-05-02T00:00:00.000Z",
          updatedAt: now,
        },
        {
          id: "visual-schedule-pinned-v3",
          targetKind: "workflow_version",
          targetId: version3.id,
          targetLabel: `${thread.title} v3 (pinned)`,
          preset: "weekly",
          timezone: "America/Phoenix",
          enabled: false,
          skipIfActive: true,
          concurrencyPolicy: "skip_if_active",
          createdAt: "2026-05-02T00:00:00.000Z",
          updatedAt: now,
        },
      ],
      scheduleExceptions: [
        {
          id: "visual-schedule-run-limit-exception",
          scheduleId: "visual-schedule-latest-approved",
          occurrenceAt: "2026-05-06T16:00:00.000Z",
          exceptionKind: "run_limits",
          status: "pending",
          runLimits: { idleTimeoutMs: 120000, maxRunMs: 600000 },
          reason: "Give the next occurrence a one-off ten-minute cap after a recoverable timeout.",
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
  }

  async function emitWorkflowPermissionPromptVisual(cdp, fixture) {
    const state = await evaluate(cdp, "window.ambientDesktop.bootstrap()");
    const thread = state.workflowAgentFolders
      .flatMap((folder) => folder.threads || [])
      .find((candidate) => candidate.id === fixture.threadId);
    const threadTitle = thread?.title || "Workflow Agent tool bridge preview";
    await emitE2eEvent(cdp, {
      type: "permission-request",
      request: {
        id: "visual-workflow-permission-grant",
        threadId: state.activeThreadId,
        workflowThreadId: fixture.threadId,
        workspacePath: state.workspace.path,
        projectPath: state.workspace.path,
        toolName: "google.gmail.listMessages",
        title: "Allow Workflow Agent Gmail read?",
        message: "This workflow wants to inspect Gmail message metadata before running its scheduled report.",
        detail: [
          `Workflow: ${threadTitle}`,
          "Requested action: read the last 100 Gmail messages for categorization.",
          "Persistent scopes available: this workflow, this project, or this workspace.",
          "No mutations will run from this prompt.",
        ].join("\n"),
        risk: "browser-network",
        reusableScopes: ["workflow_thread", "project", "workspace"],
        grantActionKind: "connector_content_read",
        grantTargetKind: "connector",
        grantTargetLabel: "gmail.mail:listMessages",
        grantTargetHash: "visual:gmail.mail:listMessages",
        grantConditions: { maxMessages: 100, mutationPolicy: "read_only" },
      },
    });
  }

  function findWorkflowAgentThread(state, title) {
    return state.workflowAgentFolders.flatMap((folder) => folder.threads || []).find((thread) => thread.title === title);
  }

  function withWorkflowAgentThread(state, thread) {
    return {
      ...state,
      workflowAgentFolders: state.workflowAgentFolders.map((folder) =>
        folder.id === thread.folderId
          ? {
              ...folder,
              threads: [thread, ...(folder.threads || []).filter((candidate) => candidate.id !== thread.id)],
            }
          : folder,
      ),
    };
  }

  function syntheticWorkflowArtifact({ artifactId, thread, now }) {
    return {
      id: artifactId,
      workflowThreadId: thread.id,
      title: thread.title,
      status: "ready_for_preview",
      manifest: {
        tools: ["ambient.responses", "file_read"],
        mutationPolicy: "read_only",
        maxToolCalls: 10,
        maxModelCalls: 2,
        maxConnectorCalls: 0,
        maxRunMs: 120000,
      },
      spec: {
        goal: thread.initialRequest,
        summary: "Visual fixture workflow artifact for recovery-card review.",
        successCriteria: ["Retain inputs for failed graph nodes.", "Expose retry, resume, skip, and debug actions."],
      },
      sourcePath: "/visual/workflows/recovery/main.ts",
      statePath: "/visual/workflows/recovery/state.json",
      createdAt: now,
      updatedAt: now,
    };
  }

  function workflowRecoveryGraph(thread, now) {
    const base =
      thread.graph && thread.graph.nodes?.length
        ? thread.graph
        : {
            id: "visual-recovery-graph",
            workflowThreadId: thread.id,
            version: 1,
            source: "compile",
            summary: "Request flows through a retained item batch into an Ambient model call and reviewed output.",
            createdAt: now,
            nodes: [
              { id: "request", type: "request", label: "Workflow request", description: thread.initialRequest },
              { id: "records", type: "data_source", label: "Retained records", description: "Load item batch and checkpoint it." },
              {
                id: "summarize",
                type: "model_call",
                label: "Summarize records",
                description: "Summarize each record with retained inputs.",
              },
              { id: "output", type: "output", label: "Reviewed output", description: "Write the final report and skipped item summary." },
            ],
            edges: [
              { id: "request-records", source: "request", target: "records", type: "control_flow", label: "load" },
              { id: "records-summarize", source: "records", target: "summarize", type: "data_flow", label: "items" },
              { id: "summarize-output", source: "summarize", target: "output", type: "data_flow", label: "report" },
            ],
          };
    const processingNodeId = recoveryProcessingNode(base).id;
    return {
      ...base,
      id: base.id || "visual-recovery-graph",
      workflowThreadId: thread.id,
      summary: "Failed graph run with retained inputs, checkpoint resume, item skip, and debug rewrite actions.",
      nodes: base.nodes.map((node) =>
        node.id === processingNodeId
          ? {
              ...node,
              type: node.type === "request" || node.type === "output" ? "model_call" : node.type,
              retryPolicy: "Retry with the same retained input. Skip failed items and continue when an item cannot be repaired.",
              description: node.description || "Retryable processing node with retained item inputs.",
              inputSummary: node.inputSummary || "Retained item payloads from checkpoint records.",
              outputSummary: node.outputSummary || "Validated item summaries or skipped-item evidence.",
              sourceRanges: node.sourceRanges || [
                {
                  kind: "workflow_step",
                  start: 0,
                  end: 27,
                  startLine: 1,
                  startColumn: 1,
                  endLine: 1,
                  endColumn: 28,
                  snippet: "export async function run()",
                },
              ],
            }
          : node,
      ),
    };
  }

  function recoveryProcessingNode(graph) {
    return (
      graph.nodes.find((node) => ["model_call", "connector_call", "deterministic_step", "data_source"].includes(node.type)) ||
      graph.nodes.find((node) => node.type !== "request" && node.type !== "output") ||
      graph.nodes[0]
    );
  }

  function workflowRecoveryEvents({ runId, artifactId, nodeId, now }) {
    return [
      {
        id: "visual-recovery-start",
        runId,
        artifactId,
        seq: 1,
        type: "workflow.start",
        graphNodeId: "request",
        createdAt: now,
        message: "Started visual recovery run.",
      },
      {
        id: "visual-recovery-checkpoint",
        runId,
        artifactId,
        seq: 2,
        type: "checkpoint.write",
        graphNodeId: nodeId,
        createdAt: now,
        message: "records",
      },
      {
        id: "visual-recovery-invalid",
        runId,
        artifactId,
        seq: 3,
        type: "ambient.call.invalid",
        graphNodeId: nodeId,
        itemKey: "beta",
        createdAt: now,
        message: "summarize.records",
        data: { error: "schema validation failed", outputCharacters: 1840, token: "visual-secret" },
      },
      {
        id: "visual-recovery-terminal",
        runId,
        artifactId,
        seq: 4,
        type: "workflow.failed",
        graphNodeId: nodeId,
        createdAt: now,
        message: "Schema validation failed after retaining item beta.",
      },
    ];
  }

  function workflowRecoveryModelCall({ runId, artifactId, nodeId, now }) {
    return {
      id: "visual-recovery-model-call",
      runId,
      artifactId,
      task: "summarize.records",
      status: "invalid",
      input: { item: { id: "beta", title: "Unparseable connector payload" }, credential_token: "visual-secret" },
      output: { raw: "partial summary without required citations" },
      cacheKey: "visual:workflow:recovery:beta",
      cacheCheckpoint: {
        id: "visual-runtime-cache",
        stage: "runtime_call",
        workflowThreadId: "visual",
        graphSnapshotId: "visual-recovery-graph",
        stablePrefixHash: "stable-visual",
        stablePrefixChars: 4096,
        stablePrefixEstimatedTokens: 1024,
        mutableSuffixHash: "mutable-visual",
        mutableSuffixChars: 820,
        mutableSuffixEstimatedTokens: 205,
        requestHash: "request-visual",
        requestEstimatedTokens: 1229,
        boundaryLabel: "Runtime Ambient call",
        createdAt: now,
      },
      model: "zai-org/GLM-5.1-FP8",
      graphNodeId: nodeId,
      itemKey: "beta",
      validationError: "Missing citations array.",
      startedAt: now,
      completedAt: now,
      latencyMs: 2380,
    };
  }

  function workflowConnectorPermissionGrant({ thread, workspacePath, targetLabel, now }) {
    return {
      id: "visual-workflow-connector-grant",
      createdAt: now,
      updatedAt: now,
      createdBy: "user",
      permissionModeAtCreation: "workspace",
      scopeKind: "workflow_thread",
      workflowThreadId: thread.id,
      actionKind: "connector_content_read",
      targetKind: "connector",
      targetHash: permissionGrantHash("connector_content_read", "connector", targetLabel),
      targetLabel,
      conditions: { scheduledWorkflow: true, maxMessages: 100 },
      source: "permission_prompt",
      reason: "Always allow this workflow to read scheduled Gmail message metadata.",
      workspacePath,
    };
  }

  function permissionGrantHash(actionKind, targetKind, targetLabel) {
    return createHash("sha256").update(`${actionKind}\0${targetKind}\0${targetLabel}`).digest("hex");
  }

  function upsertById(items, item) {
    return [item, ...items.filter((candidate) => candidate.id !== item.id)];
  }

  function unique(values) {
    return [...new Set(values.filter(Boolean))];
  }

  return {
    emitE2eEvent,
    emitWorkflowCompileProgressFixture,
    seedWorkflowDiscoveryThread,
    seedWorkflowRecoveryVisual,
    assertWorkflowDebugRewriteClickUsesGraphEvent,
    seedWorkflowRevisionVisual,
    seedWorkflowPlanEditChatVisual,
    seedWorkflowSourceMappingVisual,
    seedWorkflowRuntimeInputOutputVisual,
    seedWorkflowScheduleVisual,
    emitWorkflowPermissionPromptVisual,
  };
}
