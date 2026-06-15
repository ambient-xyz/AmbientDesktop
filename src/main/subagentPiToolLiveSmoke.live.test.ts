import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AMBIENT_DEFAULT_MODEL } from "../shared/ambientModels";
import { resolveAmbientFeatureFlags } from "../shared/featureFlags";
import type { PermissionPromptResponseMode, PermissionRequest } from "../shared/types";
import { AgentRuntime } from "./agentRuntime";
import {
  applyLiveAmbientProviderApiKeyEnv,
  liveAmbientProviderLabel,
  liveAmbientProviderModel,
  readLiveAmbientProviderApiKey,
} from "./liveAmbientProviderConfig";
import { createDocxFixture } from "./officeTestFixtures";
import { createPdfFixture } from "./pdfTestFixtures";
import { ProjectStore } from "./projectStore";
import { resolveSubagentApprovalDecision } from "./subagentApprovalDecision";
import { recordSubagentLiveApprovalAuthorityEvidence, recordSubagentLiveSmokeEvidence } from "./subagentLiveSmokeEvidence";
import { recordSubagentRestartRecoveryEvidence } from "./subagentReviewedMaturityEvidence";
import { reconcileSubagentsOnRuntimeStartup } from "./subagentStartupReconciliation";

const itLive = process.env.AMBIENT_SUBAGENT_LIVE === "1" ? it : it.skip;

describe("AgentRuntime sub-agent Pi tool live smoke", () => {
  let workspacePath = "";
  let store: ProjectStore;
  let runtime: AgentRuntime | undefined;

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-subagent-live-"));
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
    store.setFeatureFlagSettings({ subagents: true });
    store.setModelRuntimeSettings({
      providerPreStreamTimeoutMs: 60_000,
      providerStreamIdleTimeoutMs: 120_000,
    });
  });

  afterEach(async () => {
    if (runtime) {
      await runtime.shutdownPluginMcpServers();
      runtime = undefined;
    }
    store.close();
    await rm(workspacePath, { recursive: true, force: true });
  });

  itLive("lets live Pi spawn a visible child thread with runtime events", async () => {
    applyLiveAmbientProviderApiKeyEnv(readLiveAmbientProviderApiKey({ purpose: "sub-agent Pi tool live smoke" }));
    const thread = store.createThread("Sub-agent live smoke");
    runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
      request: async (request) => {
        throw new Error(`Unexpected permission request during sub-agent live smoke: ${request.toolName}`);
      },
      denyThread: () => undefined,
    });

    const prompt = [
      "This is a live Ambient Desktop sub-agent tool smoke test.",
      "Use only the ambient_subagent tool and your final reply.",
      "Do exactly this:",
      "1. Call ambient_subagent with action spawn_agent, roleId summarizer, dependencyMode required, idempotencyKey live-subagent-spawn, and task: This is a live child smoke. Complete the required structured result contract, include SUBAGENT_CHILD_DONE in the summary or evidence, and do not use tools.",
      "2. Read the returned childRunId, then call ambient_subagent with action wait_agent, that childRunId, and wait timeoutMs 120000.",
      "3. After wait_agent reports parentAction synthesize, canSynthesize true, or synthesisAllowed true, your next final reply must be exactly: SUBAGENT_LIVE_DONE",
      "Do not use filesystem, shell, browser, network, plugin, MCP, or connector tools.",
    ].join("\n");

    await sendWithTimeout({
      runtime,
      store,
      threadId: thread.id,
      timeoutMs: Number(process.env.AMBIENT_SUBAGENT_LIVE_TIMEOUT_MS ?? 180_000),
      send: runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: liveAmbientProviderModel({ fallbackModel: AMBIENT_DEFAULT_MODEL }),
        thinkingLevel: "minimal",
        content: prompt,
      }),
    });

    const run = await waitForFirstCompletedSubagentRun(store, thread.id, Number(process.env.AMBIENT_SUBAGENT_CHILD_LIVE_TIMEOUT_MS ?? 180_000));
    const runs = store.listSubagentRunsForParentThread(thread.id);
    const assistantText = store
      .listMessages(thread.id)
      .filter((message) => message.role === "assistant")
      .map((message) => message.content)
      .join("\n");
    const report = {
      createdAt: new Date().toISOString(),
      provider: liveAmbientProviderLabel(),
      workspacePath,
      threadId: thread.id,
      run: run ? {
        id: run.id,
        childThreadId: run.childThreadId,
        canonicalTaskPath: run.canonicalTaskPath,
        status: run.status,
        closedAt: run.closedAt,
        resultArtifact: compactSubagentResultArtifact(run.resultArtifact),
        mailboxEvents: store.listSubagentMailboxEvents(run.id).map((event) => ({
          id: event.id,
          type: event.type,
          direction: event.direction,
          deliveryState: event.deliveryState,
        })),
        promptSnapshots: store.listSubagentPromptSnapshots(run.id).map((snapshot) => ({
          sequence: snapshot.sequence,
          promptSha256: snapshot.promptSha256,
          inheritedCount: Array.isArray((snapshot.snapshot as any)?.inheritedRefs) ? (snapshot.snapshot as any).inheritedRefs.length : 0,
          strippedCount: Array.isArray((snapshot.snapshot as any)?.strippedRefs) ? (snapshot.snapshot as any).strippedRefs.length : 0,
        })),
        toolScopeSnapshots: store.listSubagentToolScopeSnapshots(run.id).map((snapshot) => ({
          sequence: snapshot.sequence,
          loadedCategories: snapshot.scope.loadedCategories,
          piVisibleCategories: snapshot.scope.piVisibleCategories,
          deniedCategories: snapshot.scope.deniedCategories,
          fanoutAvailable: snapshot.scope.fanoutAvailable,
        })),
        waitBarriers: store.listSubagentWaitBarriersForParentRun(run.parentRunId).map((barrier) => ({
          id: barrier.id,
          childRunIds: barrier.childRunIds,
          dependencyMode: barrier.dependencyMode,
          status: barrier.status,
          failurePolicy: barrier.failurePolicy,
          timeoutMs: barrier.timeoutMs,
          resolvedAt: barrier.resolvedAt,
        })),
        parentMailboxEvents: store.listSubagentParentMailboxEventsForParentRun(run.parentRunId).map((event) => ({
          id: event.id,
          type: event.type,
          deliveryState: event.deliveryState,
          payload: event.payload,
        })),
        runtimeEvents: store.listSubagentRunEvents(run.id)
          .filter((event) => event.type === "subagent.runtime_event")
          .map((event) => event.preview),
      } : undefined,
      toolNames: threadToolNames(store, thread.id),
      assistantText,
      childAssistantText: run ? threadAssistantText(store, run.childThreadId) : "",
      transcript: threadTranscript(store, thread.id),
    };
    const reportRoot = join(process.cwd(), "test-results", "subagent-live-smoke");
    const latestReportPath = join(reportRoot, "latest.json");
    const runReportPath = join(reportRoot, `run-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    await mkdir(reportRoot, { recursive: true });
    await writeFile(latestReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(runReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

    expect(runs).toHaveLength(1);
    expect(run).toMatchObject({
      parentThreadId: thread.id,
      status: "completed",
    });
    expect(store.getThread(run.childThreadId)).toMatchObject({
      kind: "subagent_child",
      parentThreadId: thread.id,
      collapsedByDefault: true,
    });
    expect(store.listSubagentMailboxEvents(run.id).length).toBeGreaterThanOrEqual(1);
    expect(store.listSubagentPromptSnapshots(run.id)).toHaveLength(1);
    expect(store.listSubagentToolScopeSnapshots(run.id)).toHaveLength(1);
    expect(store.listSubagentWaitBarriersForParentRun(run.parentRunId)).toEqual([
      expect.objectContaining({
        childRunIds: [run.id],
        dependencyMode: "required_all",
        status: "satisfied",
      }),
    ]);
    expect(run.resultArtifact).toMatchObject({
      schemaVersion: "ambient-subagent-result-artifact-v1",
      status: "completed",
      structuredOutput: {
        schemaVersion: "ambient-subagent-structured-result-v1",
        roleId: "summarizer",
        status: "complete",
      },
    });
    expect(store.listSubagentParentMailboxEventsForParentRun(run.parentRunId)).toEqual([]);
    expect((report.run?.runtimeEvents ?? [])).toEqual(expect.arrayContaining([
      expect.objectContaining({
        schemaVersion: "ambient-subagent-runtime-event-v1",
        type: "started",
        runId: run.id,
        childThreadId: run.childThreadId,
      }),
      expect.objectContaining({
        schemaVersion: "ambient-subagent-runtime-event-v1",
        type: "assistant_delta",
        runId: run.id,
        childThreadId: run.childThreadId,
      }),
      expect.objectContaining({
        schemaVersion: "ambient-subagent-runtime-event-v1",
        type: "completed",
        runId: run.id,
        status: "completed",
      }),
    ]));
    expect(report.toolNames.filter((name) => name === "ambient_subagent").length).toBeGreaterThanOrEqual(1);
    expect(report.childAssistantText).toContain("SUBAGENT_CHILD_DONE");
    expect(JSON.stringify(run.resultArtifact)).toContain("SUBAGENT_CHILD_DONE");
    expect(assistantText).toContain("SUBAGENT_LIVE_DONE");
    const evidence = recordSubagentLiveSmokeEvidence(store, {
      run,
      runtimeEvents: report.run?.runtimeEvents ?? [],
      provider: liveAmbientProviderLabel(),
      parentCompletionText: assistantText,
      childCompletionText: report.childAssistantText,
      reportPath: latestReportPath,
      evidenceKey: `subagent-live-smoke:${run.id}`,
      createdAt: report.createdAt,
    });
    expect(evidence).toMatchObject({
      schemaVersion: "ambient-subagent-live-smoke-evidence-v1",
      runId: run.id,
      dogfoodRunEvidence: expect.objectContaining({
        kind: "live_dogfood_run",
        status: "passed",
      }),
      livePiSmokeEvidence: expect.objectContaining({
        kind: "live_pi_smoke",
        status: "passed",
      }),
    });
    const evidenceKinds = store.listSubagentMaturityEvidence().map((item) => item.kind);
    expect(evidenceKinds).toHaveLength(2);
    expect(evidenceKinds).toEqual(expect.arrayContaining([
      "live_dogfood_run",
      "live_pi_smoke",
    ]));
  }, Number(process.env.AMBIENT_SUBAGENT_LIVE_TEST_TIMEOUT_MS ?? 240_000));

  itLive("lets a live child use long_context_process only on granted document roots", async () => {
    applyLiveAmbientProviderApiKeyEnv(readLiveAmbientProviderApiKey({ purpose: "sub-agent long-context authority live smoke" }));
    const allowedDir = join(workspacePath, "authority-allowed");
    await mkdir(allowedDir, { recursive: true });
    const allowedTextPath = join(allowedDir, "notes.txt");
    const allowedPdfPath = join(allowedDir, "brief.pdf");
    const allowedDocxPath = join(allowedDir, "brief.docx");
    const deniedPath = join(workspacePath, "forbidden-sibling.txt");
    await writeFile(allowedTextPath, "TEXT_AUTHORITY_OK: native text read is allowed.\n", "utf8");
    await writeFile(allowedPdfPath, createPdfFixture(["PDF_AUTHORITY_OK: native PDF extraction is allowed."]));
    await writeFile(allowedDocxPath, await createDocxFixture(["OFFICE_AUTHORITY_OK: native Office extraction is allowed."]));
    await writeFile(deniedPath, "DENIED_SIBLING_SECRET_TOKEN: this content must not be visible.\n", "utf8");

    const thread = store.createThread("Sub-agent long-context authority live smoke");
    runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
      request: async (request) => {
        throw new Error(`Unexpected permission request during sub-agent long-context authority smoke: ${request.toolName}`);
      },
      denyThread: () => undefined,
    });
    const parentAssistant = store.addMessage({ threadId: thread.id, role: "assistant", content: "" });
    const parentRun = store.startRun({ threadId: thread.id, assistantMessageId: parentAssistant.id });
    (runtime as any).activeRunIds.set(thread.id, parentRun.id);
    const registeredTools: any[] = [];
    (runtime as any).createSubagentToolExtension(thread.id)({
      registerTool: (tool: any) => registeredTools.push(tool),
    });
    const subagentTool = registeredTools.find((tool) => tool.name === "ambient_subagent");
    if (!subagentTool) throw new Error("ambient_subagent tool was not registered for long-context authority smoke.");

    const resultJson = JSON.stringify({
      schemaVersion: "ambient-subagent-structured-result-v1",
      roleId: "explorer",
      status: "complete",
      summary: "SUBAGENT_LONG_CONTEXT_AUTHORITY_DONE",
      evidence: [
        "Native read saw TEXT_AUTHORITY_OK, PDF_AUTHORITY_OK, and OFFICE_AUTHORITY_OK.",
        "long_context_process saw the same granted files.",
        "The forbidden sibling path was denied and its content was not revealed.",
      ],
      artifacts: [],
      risks: [],
      nextActions: [],
      roleOutput: {
        findings: [
          {
            summary: "Granted document roots were available to both native read and long_context_process.",
            provenance: [allowedTextPath, allowedPdfPath, allowedDocxPath],
          },
          {
            summary: "The ungranted sibling path was rejected by authority enforcement.",
            provenance: [deniedPath],
          },
        ],
        openQuestions: [],
      },
    }, null, 2);

    const spawned = await subagentTool.execute("live-long-context-authority-spawn", {
      action: "spawn_agent",
      roleId: "explorer",
      dependencyMode: "required",
      idempotencyKey: "live-subagent-long-context-authority",
      task: [
        "This is a live child authority validation. Follow these steps exactly.",
        "Use only the native read tool, long_context_process, and your final reply.",
        `1. Call read on this text file: ${allowedTextPath}`,
        `2. Call read on this PDF file: ${allowedPdfPath}`,
        `3. Call read on this Office document: ${allowedDocxPath}`,
        "4. Call long_context_process with taskType extraction, maxModelCalls 4, maxOutputChars 4000, and workspacePaths containing exactly the three granted paths above.",
        `5. Call long_context_process once on this ungranted sibling path and observe the authority denial without asking for approval: ${deniedPath}`,
        "6. Do not use shell, write/edit, browser, network, connector, MCP, workflow, or sub-agent tools.",
        "7. After the denied long_context_process attempt fails, complete the task with exactly this structured result contract:",
        "SUBAGENT_RESULT_STATUS: complete",
        `SUBAGENT_RESULT_JSON: ${resultJson}`,
      ].join("\n"),
      toolScope: {
        requestedCategories: ["workspace.read", "long-context.read"],
        approvalMode: "non_interactive",
        childAuthority: {
          taskIntent: "file_read",
          rationale: "Live validation that child document reads and long-context processing share the same narrow read roots.",
          readRoots: [allowedTextPath, allowedPdfPath, allowedDocxPath],
          mutation: "deny",
          network: "deny",
          nestedFanout: "deny",
        },
      },
    });
    const runId = spawned.details.run.id as string;

    const waited = await subagentTool.execute("live-long-context-authority-wait", {
      action: "wait_agent",
      childRunId: runId,
      wait: { timeoutMs: Number(process.env.AMBIENT_SUBAGENT_CHILD_LONG_CONTEXT_TIMEOUT_MS ?? 240_000) },
    });
    const run = store.getSubagentRun(runId);
    const childTranscript = threadTranscript(store, run.childThreadId);
    const childToolNames = threadToolNames(store, run.childThreadId);
    const toolScopeSnapshots = store.listSubagentToolScopeSnapshots(run.id);
    const report = {
      createdAt: new Date().toISOString(),
      provider: liveAmbientProviderLabel(),
      workspacePath,
      threadId: thread.id,
      run: {
        id: run.id,
        childThreadId: run.childThreadId,
        canonicalTaskPath: run.canonicalTaskPath,
        status: run.status,
        resultArtifact: compactSubagentResultArtifact(run.resultArtifact),
        toolScopeSnapshots: toolScopeSnapshots.map((snapshot) => ({
          sequence: snapshot.sequence,
          loadedCategories: snapshot.scope.loadedCategories,
          piVisibleCategories: snapshot.scope.piVisibleCategories,
          resolverInputs: snapshot.resolverInputs,
        })),
        runEvents: store.listSubagentRunEvents(run.id).map((event) => ({
          sequence: event.sequence,
          type: event.type,
          preview: event.preview,
        })),
      },
      childToolNames,
      childTranscript,
      deniedContentLeaked: childTranscript.includes("DENIED_SIBLING_SECRET_TOKEN"),
    };
    const reportRoot = join(process.cwd(), "test-results", "subagent-live-smoke");
    const latestReportPath = join(reportRoot, "long-context-authority-latest.json");
    const runReportPath = join(reportRoot, `long-context-authority-run-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    await mkdir(reportRoot, { recursive: true });
    await writeFile(latestReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(runReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

    expect(waited.details).toMatchObject({
      status: "completed",
      waitSatisfied: true,
      synthesisAllowed: true,
    });
    expect(run).toMatchObject({
      parentThreadId: thread.id,
      status: "completed",
    });
    expect(run.resultArtifact).toMatchObject({
      schemaVersion: "ambient-subagent-result-artifact-v1",
      status: "completed",
      structuredOutput: {
        schemaVersion: "ambient-subagent-structured-result-v1",
        roleId: "explorer",
        status: "complete",
      },
    });
    expect(JSON.stringify(run.resultArtifact)).toContain("SUBAGENT_LONG_CONTEXT_AUTHORITY_DONE");
    expect(childToolNames).toEqual(expect.arrayContaining(["read", "long_context_process"]));
    expect(childTranscript).toContain("TEXT_AUTHORITY_OK");
    expect(childTranscript).toContain("PDF_AUTHORITY_OK");
    expect(childTranscript).toContain("OFFICE_AUTHORITY_OK");
    expect(childTranscript).toContain("outside the current workspace authority");
    expect(childTranscript).not.toContain("DENIED_SIBLING_SECRET_TOKEN");
    expect(toolScopeSnapshots.at(-1)?.resolverInputs).toMatchObject({
      childAuthorityProfile: {
        resourceScopes: {
          filesystem: {
            readRoots: [allowedTextPath, allowedPdfPath, allowedDocxPath],
            writeRoots: [],
            readDecision: "allow",
            writeDecision: "deny",
          },
        },
      },
    });
  }, Number(process.env.AMBIENT_SUBAGENT_LIVE_TEST_TIMEOUT_MS ?? 360_000));

  itLive("surfaces live child file authority approval requests to the parent", async () => {
    applyLiveAmbientProviderApiKeyEnv(readLiveAmbientProviderApiKey({ purpose: "sub-agent child approval authority live smoke" }));
    const allowedDir = join(workspacePath, "approval-allowed");
    await mkdir(allowedDir, { recursive: true });
    const deniedPath = join(workspacePath, "approval-needed.txt");
    await writeFile(join(allowedDir, "allowed.txt"), "APPROVAL_ALLOWED_CONTEXT\n", "utf8");
    await writeFile(deniedPath, "APPROVAL_SECRET_TOKEN_SHOULD_NOT_LEAK\n", "utf8");

    const pendingPermissions: PermissionRequest[] = [];
    const pendingResolvers = new Map<string, (response: { allowed: boolean; mode: PermissionPromptResponseMode }) => void>();
    const respondPermission = (id: string, response: PermissionPromptResponseMode): void => {
      const index = pendingPermissions.findIndex((request) => request.id === id);
      if (index >= 0) pendingPermissions.splice(index, 1);
      const resolve = pendingResolvers.get(id);
      pendingResolvers.delete(id);
      resolve?.({ allowed: response !== "deny", mode: response });
    };
    const thread = store.createThread("Sub-agent child approval authority live smoke");
    runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
      request: async (request, options) => {
        const created: PermissionRequest = {
          ...request,
          id: `live-child-file-authority-${pendingPermissions.length + 1}`,
        };
        pendingPermissions.push(created);
        options?.onRequest?.(created);
        return new Promise((resolve) => {
          pendingResolvers.set(created.id, resolve);
        });
      },
      denyThread: () => undefined,
      listPending: () => pendingPermissions,
      respond: respondPermission,
    });
    const parentAssistant = store.addMessage({ threadId: thread.id, role: "assistant", content: "" });
    const parentRun = store.startRun({ threadId: thread.id, assistantMessageId: parentAssistant.id });
    (runtime as any).activeRunIds.set(thread.id, parentRun.id);
    const registeredTools: any[] = [];
    (runtime as any).createSubagentToolExtension(thread.id)({
      registerTool: (tool: any) => registeredTools.push(tool),
    });
    const subagentTool = registeredTools.find((tool) => tool.name === "ambient_subagent");
    if (!subagentTool) throw new Error("ambient_subagent tool was not registered for child approval authority smoke.");

    const spawned = await subagentTool.execute("live-child-approval-authority-spawn", {
      action: "spawn_agent",
      roleId: "explorer",
      dependencyMode: "required",
      idempotencyKey: "live-subagent-child-approval-authority",
      task: [
        "This is a live child authority approval validation.",
        "Use only the native read tool and your final reply.",
        `Call read on this file, then wait for Ambient to resolve any approval request: ${deniedPath}`,
        "Do not use shell, write/edit, browser, network, connector, MCP, workflow, or sub-agent tools.",
        "Do not complete unless the read tool returns content.",
      ].join("\n"),
      toolScope: {
        requestedCategories: ["workspace.read"],
        childAuthority: {
          taskIntent: "file_read",
          rationale: "Live validation that a child read outside its narrow roots pauses for parent approval.",
          readRoots: [join(allowedDir, "allowed.txt")],
          mutation: "deny",
          network: "deny",
          nestedFanout: "deny",
        },
      },
    });
    const runId = spawned.details.run.id as string;

    const waited = await subagentTool.execute("live-child-approval-authority-wait", {
      action: "wait_agent",
      childRunId: runId,
      wait: { timeoutMs: Number(process.env.AMBIENT_SUBAGENT_CHILD_APPROVAL_TIMEOUT_MS ?? 180_000) },
    });
    const run = store.getSubagentRun(runId);
    const parentMailboxEvents = store.listSubagentParentMailboxEventsForParentRun(parentRun.id);
    const approvalEvent = parentMailboxEvents.find((event) => event.type === "subagent.child_approval_requested");
    const childTranscript = threadTranscript(store, run.childThreadId);
    const report = {
      createdAt: new Date().toISOString(),
      provider: liveAmbientProviderLabel(),
      workspacePath,
      threadId: thread.id,
      run: {
        id: run.id,
        childThreadId: run.childThreadId,
        canonicalTaskPath: run.canonicalTaskPath,
        status: run.status,
        resultArtifact: compactSubagentResultArtifact(run.resultArtifact),
        toolScopeSnapshots: store.listSubagentToolScopeSnapshots(run.id).map((snapshot) => ({
          sequence: snapshot.sequence,
          loadedCategories: snapshot.scope.loadedCategories,
          piVisibleCategories: snapshot.scope.piVisibleCategories,
          approvalMode: snapshot.scope.approvalMode,
          resolverInputs: snapshot.resolverInputs,
        })),
        runEvents: store.listSubagentRunEvents(run.id).map((event) => ({
          sequence: event.sequence,
          type: event.type,
          preview: event.preview,
        })),
      },
      waitDetails: waited.details,
      pendingPermissions: pendingPermissions.map((permission) => ({
        id: permission.id,
        threadId: permission.threadId,
        toolName: permission.toolName,
        title: permission.title,
        risk: permission.risk,
        grantActionKind: permission.grantActionKind,
        grantTargetKind: permission.grantTargetKind,
        grantTargetLabel: permission.grantTargetLabel,
        reusableScopes: permission.reusableScopes,
      })),
      parentMailboxEvents: parentMailboxEvents.map((event) => ({
        id: event.id,
        type: event.type,
        deliveryState: event.deliveryState,
        payload: event.payload,
      })),
      childTranscript,
      deniedContentLeaked: childTranscript.includes("APPROVAL_SECRET_TOKEN_SHOULD_NOT_LEAK"),
    };
    const reportRoot = join(process.cwd(), "test-results", "subagent-live-smoke");
    const latestReportPath = join(reportRoot, "approval-authority-latest.json");
    const runReportPath = join(reportRoot, `approval-authority-run-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    const evidence = recordSubagentLiveApprovalAuthorityEvidence(store, {
      run,
      provider: liveAmbientProviderLabel(),
      waitDetails: waited.details,
      pendingPermissions,
      parentMailboxEvents,
      childTranscript,
      deniedContentSentinel: "APPROVAL_SECRET_TOKEN_SHOULD_NOT_LEAK",
      expectedToolName: "read",
      expectedAction: "file_content_read",
      reportPath: latestReportPath,
      evidenceKey: "live-smoke:approval-authority",
    });
    await mkdir(reportRoot, { recursive: true });
    await writeFile(latestReportPath, `${JSON.stringify({ ...report, evidence }, null, 2)}\n`, "utf8");
    await writeFile(runReportPath, `${JSON.stringify({ ...report, evidence }, null, 2)}\n`, "utf8");

    expect(waited.details).toMatchObject({
      status: "needs_attention",
      waitSatisfied: false,
      synthesisAllowed: false,
      waitNotice: "Child requested approval; parent approval was forwarded to the parent mailbox and the parent remains blocked on this child.",
    });
    expect(run).toMatchObject({
      parentThreadId: thread.id,
      status: "needs_attention",
    });
    expect(pendingPermissions).toEqual([
      expect.objectContaining({
        threadId: run.childThreadId,
        toolName: "read",
        grantActionKind: "file_content_read",
        grantTargetKind: "path",
        grantTargetLabel: deniedPath,
      }),
    ]);
    expect(approvalEvent).toMatchObject({
      parentMessageId: parentAssistant.id,
      type: "subagent.child_approval_requested",
      deliveryState: "queued",
      payload: expect.objectContaining({
        childRunId: run.id,
        childThreadId: run.childThreadId,
        approvalId: pendingPermissions[0].id,
        requestedToolId: "read",
        requestedAction: "file_content_read",
        requestedToolCategory: "outside-workspace",
        parentBlockingState: expect.objectContaining({
          action: "forward_child_approval_then_wait",
          childRunId: run.id,
        }),
      }),
    });
    expect(childTranscript).not.toContain("APPROVAL_SECRET_TOKEN_SHOULD_NOT_LEAK");
    expect(store.listSubagentMaturityEvidence()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "live_dogfood_run",
        evidenceKey: "dogfood:live-smoke:approval-authority",
        runId: run.id,
        artifactPath: latestReportPath,
        details: expect.objectContaining({
          schemaVersion: "ambient-subagent-live-approval-authority-evidence-v1",
          childPausedForApproval: true,
          parentRemainedBlocked: true,
          approvalForwardedToParent: true,
          deniedContentLeaked: false,
        }),
      }),
      expect.objectContaining({
        kind: "live_pi_smoke",
        evidenceKey: "pi-smoke:live-smoke:approval-authority",
        runId: run.id,
      }),
    ]));

    if (pendingPermissions[0]) respondPermission(pendingPermissions[0].id, "deny");
    await runtime.abort(run.childThreadId, { skipSubagentChildCancellation: true }).catch(() => undefined);
  }, Number(process.env.AMBIENT_SUBAGENT_LIVE_TEST_TIMEOUT_MS ?? 300_000));

  itLive("surfaces live child browser authority approval requests to the parent", async () => {
    applyLiveAmbientProviderApiKeyEnv(readLiveAmbientProviderApiKey({ purpose: "sub-agent child browser approval live smoke" }));
    const pendingPermissions: PermissionRequest[] = [];
    const permissionResponses: Array<{ id: string; response: PermissionPromptResponseMode }> = [];
    const pendingResolvers = new Map<string, (response: { allowed: boolean; mode: PermissionPromptResponseMode }) => void>();
    const respondPermission = (id: string, response: PermissionPromptResponseMode): void => {
      permissionResponses.push({ id, response });
      const index = pendingPermissions.findIndex((request) => request.id === id);
      if (index >= 0) pendingPermissions.splice(index, 1);
      const resolve = pendingResolvers.get(id);
      pendingResolvers.delete(id);
      resolve?.({ allowed: response !== "deny", mode: response });
    };
    const thread = store.updateThreadSettings(
      store.createThread("Sub-agent child browser approval live smoke").id,
      { permissionMode: "full-access" },
    );
    runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
      request: async (request, options) => {
        const created: PermissionRequest = {
          ...request,
          id: `live-child-browser-authority-${pendingPermissions.length + 1}`,
        };
        pendingPermissions.push(created);
        options?.onRequest?.(created);
        return new Promise((resolve) => {
          pendingResolvers.set(created.id, resolve);
        });
      },
      denyThread: () => undefined,
      listPending: () => pendingPermissions,
      respond: respondPermission,
    });
    const parentAssistant = store.addMessage({ threadId: thread.id, role: "assistant", content: "" });
    const parentRun = store.startRun({ threadId: thread.id, assistantMessageId: parentAssistant.id });
    (runtime as any).activeRunIds.set(thread.id, parentRun.id);
    const registeredTools: any[] = [];
    (runtime as any).createSubagentToolExtension(thread.id)({
      registerTool: (tool: any) => registeredTools.push(tool),
    });
    const subagentTool = registeredTools.find((tool) => tool.name === "ambient_subagent");
    if (!subagentTool) throw new Error("ambient_subagent tool was not registered for child browser approval smoke.");

    const spawned = await subagentTool.execute("live-child-browser-approval-spawn", {
      action: "spawn_agent",
      roleId: "explorer",
      dependencyMode: "required",
      idempotencyKey: "live-subagent-child-browser-approval",
      task: [
        "This is a live child browser approval validation.",
        "Use only browser_search and your final reply.",
        "Call browser_search exactly once with query: Ambient Desktop child browser approval live smoke.",
        "If Ambient pauses for approval, wait for the parent approval response before continuing.",
        "Do not use shell, filesystem, write/edit, connector, MCP, workflow, or sub-agent tools.",
        "Do not complete unless browser_search returns or Ambient explicitly reports the browser action was denied.",
      ].join("\n"),
      toolScope: {
        requestedCategories: ["browser.read"],
        childAuthority: {
          taskIntent: "analysis",
          rationale: "Live validation that a full-access parent can launch a narrower browser-read child that pauses for parent approval.",
          network: "ask_parent",
          mutation: "deny",
          nestedFanout: "deny",
        },
      },
    });
    const runId = spawned.details.run.id as string;

    const waited = await subagentTool.execute("live-child-browser-approval-wait", {
      action: "wait_agent",
      childRunId: runId,
      wait: { timeoutMs: Number(process.env.AMBIENT_SUBAGENT_CHILD_BROWSER_APPROVAL_TIMEOUT_MS ?? 180_000) },
    });
    const run = store.getSubagentRun(runId);
    const parentMailboxEvents = store.listSubagentParentMailboxEventsForParentRun(parentRun.id);
    const approvalEvent = parentMailboxEvents.find((event) => event.type === "subagent.child_approval_requested");
    const childTranscriptBeforeApproval = threadTranscript(store, run.childThreadId);
    const pendingBeforeApproval = pendingPermissions.map((permission) => ({
      id: permission.id,
      threadId: permission.threadId,
      toolName: permission.toolName,
      title: permission.title,
      risk: permission.risk,
      grantActionKind: permission.grantActionKind,
      grantTargetKind: permission.grantTargetKind,
      grantTargetLabel: permission.grantTargetLabel,
      reusableScopes: permission.reusableScopes,
      grantConditions: permission.grantConditions,
    }));

    expect(waited.details).toMatchObject({
      status: "needs_attention",
      waitSatisfied: false,
      synthesisAllowed: false,
      waitNotice: "Child requested approval; parent approval was forwarded to the parent mailbox and the parent remains blocked on this child.",
    });
    expect(run).toMatchObject({
      parentThreadId: thread.id,
      status: "needs_attention",
    });
    expect(thread.permissionMode).toBe("full-access");
    expect(pendingPermissions).toEqual([
      expect.objectContaining({
        threadId: run.childThreadId,
        toolName: "browser_search",
        title: "Allow child browser network access?",
        risk: "browser-network",
        grantActionKind: "browser_network",
        grantTargetKind: "tool",
        grantTargetLabel: "browser_search",
        grantConditions: expect.objectContaining({
          childRunId: run.id,
          childThreadId: run.childThreadId,
          source: "subagent-child-browser-authority",
        }),
      }),
    ]);
    expect(approvalEvent).toMatchObject({
      parentMessageId: parentAssistant.id,
      type: "subagent.child_approval_requested",
      deliveryState: "queued",
      payload: expect.objectContaining({
        childRunId: run.id,
        childThreadId: run.childThreadId,
        approvalId: pendingPermissions[0].id,
        requestedToolId: "browser_search",
        requestedAction: "browser_network",
        requestedToolCategory: "browser-network",
        parentBlockingState: expect.objectContaining({
          action: "forward_child_approval_then_wait",
          childRunId: run.id,
          childThreadId: run.childThreadId,
          resumeParentBlocking: true,
          resumeAction: "wait_agent",
        }),
      }),
    });

    const approvalId = pendingPermissions[0]?.id;
    if (!approvalId) throw new Error("Expected pending child browser permission before approving.");
    const decision = resolveSubagentApprovalDecision(store, {
      childRunId: run.id,
      approvalId,
      decision: "approved",
      requestedScope: "this_child_thread",
      userDecision: "Approve browser_search for this live child thread so it can resume.",
    });
    expect(decision).toMatchObject({
      approvalId,
      decision: "approved",
      effectiveScope: "this_child_thread",
      parentRemainsBlocked: true,
      approvalRequestParentMailboxEvent: {
        deliveryState: "consumed",
      },
      approvalResponseChildMailboxEvent: {
        type: "subagent.approval_response",
        deliveryState: "queued",
      },
    });

    const resumed = await subagentTool.execute("live-child-browser-approval-resume", {
      action: "wait_agent",
      childRunId: run.id,
      wait: { timeoutMs: 1 },
    });
    const runAfterResume = store.getSubagentRun(run.id);
    const report = {
      createdAt: new Date().toISOString(),
      provider: liveAmbientProviderLabel(),
      workspacePath,
      threadId: thread.id,
      parentPermissionMode: thread.permissionMode,
      run: {
        id: runAfterResume.id,
        childThreadId: runAfterResume.childThreadId,
        canonicalTaskPath: runAfterResume.canonicalTaskPath,
        status: runAfterResume.status,
        resultArtifact: compactSubagentResultArtifact(runAfterResume.resultArtifact),
        toolScopeSnapshots: store.listSubagentToolScopeSnapshots(run.id).map((snapshot) => ({
          sequence: snapshot.sequence,
          loadedCategories: snapshot.scope.loadedCategories,
          piVisibleCategories: snapshot.scope.piVisibleCategories,
          approvalMode: snapshot.scope.approvalMode,
          resolverInputs: snapshot.resolverInputs,
        })),
        runEvents: store.listSubagentRunEvents(run.id).map((event) => ({
          sequence: event.sequence,
          type: event.type,
          preview: event.preview,
        })),
      },
      waitDetails: waited.details,
      resumeDetails: resumed.details,
      pendingBeforeApproval,
      permissionResponses,
      parentMailboxEvents: store.listSubagentParentMailboxEventsForParentRun(parentRun.id).map((event) => ({
        id: event.id,
        type: event.type,
        deliveryState: event.deliveryState,
        payload: event.payload,
      })),
      childTranscriptBeforeApproval,
      childTranscriptAfterResume: threadTranscript(store, run.childThreadId),
      childToolNames: threadToolNames(store, run.childThreadId),
    };
    const reportRoot = join(process.cwd(), "test-results", "subagent-live-smoke");
    const latestReportPath = join(reportRoot, "browser-approval-latest.json");
    const runReportPath = join(reportRoot, `browser-approval-run-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    await mkdir(reportRoot, { recursive: true });
    await writeFile(latestReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(runReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

    expect(permissionResponses).toEqual([{ id: approvalId, response: "always_thread" }]);
    expect(pendingPermissions).toEqual([]);
    expect(resumed.details).toMatchObject({
      synthesisAllowed: false,
      parentResolution: expect.objectContaining({
        status: "blocked",
        canSynthesize: false,
      }),
    });
    expect(store.listSubagentRunEvents(run.id)).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "subagent.approval_requested" }),
      expect.objectContaining({ type: "subagent.child_approval_forwarded" }),
      expect.objectContaining({ type: "subagent.approval_response.consumed" }),
    ]));

    await runtime.abort(run.childThreadId, { skipSubagentChildCancellation: true }).catch(() => undefined);
  }, Number(process.env.AMBIENT_SUBAGENT_LIVE_TEST_TIMEOUT_MS ?? 300_000));

  itLive("lets an idle live Pi child consume a follow-up turn and complete", async () => {
    applyLiveAmbientProviderApiKeyEnv(readLiveAmbientProviderApiKey({ purpose: "sub-agent Pi follow-up live smoke" }));
    const thread = store.createThread("Sub-agent follow-up live smoke");
    runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
      request: async (request) => {
        throw new Error(`Unexpected permission request during sub-agent follow-up live smoke: ${request.toolName}`);
      },
      denyThread: () => undefined,
    });
    const parentAssistant = store.addMessage({ threadId: thread.id, role: "assistant", content: "" });
    const parentRun = store.startRun({ threadId: thread.id, assistantMessageId: parentAssistant.id });
    (runtime as any).activeRunIds.set(thread.id, parentRun.id);
    const registeredTools: any[] = [];
    (runtime as any).createSubagentToolExtension(thread.id)({
      registerTool: (tool: any) => registeredTools.push(tool),
    });
    const subagentTool = registeredTools.find((tool) => tool.name === "ambient_subagent");
    if (!subagentTool) throw new Error("ambient_subagent tool was not registered for live follow-up smoke.");

    const needsAttentionResult = JSON.stringify({
      schemaVersion: "ambient-subagent-structured-result-v1",
      roleId: "explorer",
      status: "needs_attention",
      summary: "Need the parent follow-up token before completing.",
      evidence: [],
      artifacts: [],
      risks: [],
      nextActions: ["Wait for the parent follow-up token."],
      roleOutput: {
        findings: [],
        openQuestions: ["What follow-up token should I use?"],
      },
    }, null, 2);
    const completeResult = JSON.stringify({
      schemaVersion: "ambient-subagent-structured-result-v1",
      roleId: "explorer",
      status: "complete",
      summary: "SUBAGENT_FOLLOWUP_LIVE_DONE",
      evidence: ["Parent follow-up supplied SUBAGENT_FOLLOWUP_LIVE_DONE."],
      artifacts: [],
      risks: [],
      nextActions: [],
      roleOutput: {
        findings: [
          {
            summary: "The follow-up token was received and applied.",
            provenance: ["parent follow-up"],
          },
        ],
        openQuestions: [],
      },
    }, null, 2);

    const spawned = await subagentTool.execute("live-followup-spawn", {
      action: "spawn_agent",
      roleId: "explorer",
      dependencyMode: "required",
      idempotencyKey: "live-subagent-followup-spawn",
      task: [
        "This is a live child follow-up smoke test. Do not use tools.",
        "On your first turn, do not complete the task. Reply with status needs_attention using exactly this structured result contract:",
        "SUBAGENT_RESULT_STATUS: needs_attention",
        `SUBAGENT_RESULT_JSON: ${needsAttentionResult}`,
        "After the parent sends a follow-up containing SUBAGENT_FOLLOWUP_LIVE_DONE, complete the same child assignment.",
        "On the follow-up turn, reply with status complete using exactly this structured result contract:",
        "SUBAGENT_RESULT_STATUS: complete",
        `SUBAGENT_RESULT_JSON: ${completeResult}`,
      ].join("\n"),
    });
    const runId = spawned.details.run.id as string;
    const firstWait = await subagentTool.execute("live-followup-wait-needs-attention", {
      action: "wait_agent",
      childRunId: runId,
      wait: { timeoutMs: Number(process.env.AMBIENT_SUBAGENT_CHILD_LIVE_TIMEOUT_MS ?? 180_000) },
    });
    expect(firstWait.details).toMatchObject({
      status: "needs_attention",
      synthesisAllowed: false,
      parentResolution: {
        action: "ask_user",
        requiresUserInput: true,
      },
    });

    const followed = await subagentTool.execute("live-followup-send", {
      action: "followup_agent",
      childRunId: runId,
      idempotencyKey: "live-subagent-followup-token",
      message: "The live follow-up token is SUBAGENT_FOLLOWUP_LIVE_DONE. Complete now.",
    });
    expect(followed.details).toMatchObject({
      runtimeFollowup: {
        accepted: true,
      },
    });

    const secondWait = await subagentTool.execute("live-followup-wait-complete", {
      action: "wait_agent",
      childRunId: runId,
      wait: { timeoutMs: Number(process.env.AMBIENT_SUBAGENT_CHILD_LIVE_TIMEOUT_MS ?? 180_000) },
    });
    const run = store.getSubagentRun(runId);
    const mailboxEvents = store.listSubagentMailboxEvents(runId);
    const runtimeEventTypes = store.listSubagentRunEvents(runId).map((event) => event.type);
    const report = {
      createdAt: new Date().toISOString(),
      provider: liveAmbientProviderLabel(),
      workspacePath,
      threadId: thread.id,
      run: {
        id: run.id,
        childThreadId: run.childThreadId,
        canonicalTaskPath: run.canonicalTaskPath,
        status: run.status,
        resultArtifact: compactSubagentResultArtifact(run.resultArtifact),
        mailboxEvents: mailboxEvents.map((event) => ({
          id: event.id,
          type: event.type,
          direction: event.direction,
          deliveryState: event.deliveryState,
        })),
        runEvents: runtimeEventTypes,
      },
      childTranscript: threadTranscript(store, run.childThreadId),
    };
    const reportRoot = join(process.cwd(), "test-results", "subagent-live-smoke");
    const latestReportPath = join(reportRoot, "followup-latest.json");
    const runReportPath = join(reportRoot, `followup-run-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    await mkdir(reportRoot, { recursive: true });
    await writeFile(latestReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(runReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

    expect(secondWait.details).toMatchObject({
      status: "completed",
      waitSatisfied: true,
      synthesisAllowed: true,
    });
    expect(run).toMatchObject({
      parentThreadId: thread.id,
      status: "completed",
      resultArtifact: {
        schemaVersion: "ambient-subagent-result-artifact-v1",
        status: "completed",
        structuredOutput: {
          schemaVersion: "ambient-subagent-structured-result-v1",
          roleId: "explorer",
          status: "complete",
        },
      },
    });
    expect(JSON.stringify(run.resultArtifact)).toContain("SUBAGENT_FOLLOWUP_LIVE_DONE");
    expect(mailboxEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "subagent.followup",
        direction: "parent_to_child",
        deliveryState: "consumed",
      }),
      expect.objectContaining({
        type: "subagent.needs_attention",
        direction: "child_to_parent",
      }),
      expect.objectContaining({
        type: "subagent.result",
        direction: "child_to_parent",
      }),
    ]));
    expect(runtimeEventTypes).toEqual(expect.arrayContaining([
      "subagent.followup_child_session_starting",
      "subagent.followup_child_session_started",
      "subagent.followup_consumed",
      "subagent.result_ready",
    ]));
    expect(threadAssistantText(store, run.childThreadId)).toContain("SUBAGENT_FOLLOWUP_LIVE_DONE");
  }, Number(process.env.AMBIENT_SUBAGENT_LIVE_TEST_TIMEOUT_MS ?? 300_000));

  itLive("records live optional background child completions as grouped parent mailbox notifications", async () => {
    applyLiveAmbientProviderApiKeyEnv(readLiveAmbientProviderApiKey({ purpose: "sub-agent optional background live smoke" }));
    const thread = store.createThread("Sub-agent optional background live smoke");
    runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
      request: async (request) => {
        throw new Error(`Unexpected permission request during sub-agent optional background live smoke: ${request.toolName}`);
      },
      denyThread: () => undefined,
    });
    const parentAssistant = store.addMessage({ threadId: thread.id, role: "assistant", content: "" });
    const parentRun = store.startRun({ threadId: thread.id, assistantMessageId: parentAssistant.id });
    (runtime as any).activeRunIds.set(thread.id, parentRun.id);
    const registeredTools: any[] = [];
    (runtime as any).createSubagentToolExtension(thread.id)({
      registerTool: (tool: any) => registeredTools.push(tool),
    });
    const subagentTool = registeredTools.find((tool) => tool.name === "ambient_subagent");
    if (!subagentTool) throw new Error("ambient_subagent tool was not registered for optional background live smoke.");

    const completeResult = JSON.stringify({
      schemaVersion: "ambient-subagent-structured-result-v1",
      roleId: "summarizer",
      status: "complete",
      summary: "SUBAGENT_OPTIONAL_BACKGROUND_DONE",
      evidence: ["Live optional background child completed without tools."],
      artifacts: [],
      risks: [],
      nextActions: [],
      roleOutput: {
        keyPoints: ["SUBAGENT_OPTIONAL_BACKGROUND_DONE"],
        sourceRefs: [],
      },
    }, null, 2);

    const spawned = await subagentTool.execute("live-optional-background-spawn", {
      action: "spawn_agent",
      roleId: "summarizer",
      dependencyMode: "optional_background",
      idempotencyKey: "live-subagent-optional-background-spawn",
      task: [
        "This is a live optional-background child smoke test. Do not use tools.",
        "Complete the summarizer assignment using exactly this structured result contract:",
        "SUBAGENT_RESULT_STATUS: complete",
        `SUBAGENT_RESULT_JSON: ${completeResult}`,
      ].join("\n"),
    });
    const runId = spawned.details.run.id as string;
    expect(spawned.details).toMatchObject({
      run: {
        id: runId,
        dependencyMode: "optional_background",
      },
    });

    const waited = await subagentTool.execute("live-optional-background-wait", {
      action: "wait_agent",
      childRunId: runId,
      wait: { timeoutMs: Number(process.env.AMBIENT_SUBAGENT_CHILD_LIVE_TIMEOUT_MS ?? 180_000) },
    });
    const run = store.getSubagentRun(runId);
    const parentMailboxEvents = store.listSubagentParentMailboxEventsForParentRun(parentRun.id);
    const groupedCompletion = parentMailboxEvents.find((event) => event.type === "subagent.grouped_completion");
    const report = {
      createdAt: new Date().toISOString(),
      provider: liveAmbientProviderLabel(),
      workspacePath,
      threadId: thread.id,
      run: {
        id: run.id,
        childThreadId: run.childThreadId,
        canonicalTaskPath: run.canonicalTaskPath,
        dependencyMode: run.dependencyMode,
        status: run.status,
        resultArtifact: compactSubagentResultArtifact(run.resultArtifact),
        mailboxEvents: store.listSubagentMailboxEvents(run.id).map((event) => ({
          id: event.id,
          type: event.type,
          direction: event.direction,
          deliveryState: event.deliveryState,
        })),
      },
      waitDetails: {
        status: waited.details.status,
        synthesisAllowed: waited.details.synthesisAllowed,
        waitSatisfied: waited.details.waitSatisfied,
        groupedCompletionNotification: waited.details.groupedCompletionNotification,
      },
      parentMailboxEvents: parentMailboxEvents.map((event) => ({
        id: event.id,
        type: event.type,
        deliveryState: event.deliveryState,
        payload: event.payload,
      })),
      childTranscript: threadTranscript(store, run.childThreadId),
    };
    const reportRoot = join(process.cwd(), "test-results", "subagent-live-smoke");
    const latestReportPath = join(reportRoot, "optional-background-latest.json");
    const runReportPath = join(reportRoot, `optional-background-run-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    await mkdir(reportRoot, { recursive: true });
    await writeFile(latestReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(runReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

    expect(waited.details).toMatchObject({
      status: "completed",
      waitSatisfied: true,
      synthesisAllowed: true,
      waitBarrier: {
        dependencyMode: "optional_background",
        status: "satisfied",
      },
      groupedCompletionNotification: {
        parentRunId: parentRun.id,
        parentMessageId: parentAssistant.id,
        type: "subagent.grouped_completion",
        deliveryState: "queued",
        notificationCount: 1,
        childRunIds: [runId],
      },
    });
    expect(run).toMatchObject({
      parentThreadId: thread.id,
      dependencyMode: "optional_background",
      status: "completed",
      resultArtifact: {
        schemaVersion: "ambient-subagent-result-artifact-v1",
        status: "completed",
        structuredOutput: {
          schemaVersion: "ambient-subagent-structured-result-v1",
          roleId: "summarizer",
          status: "complete",
          summary: "SUBAGENT_OPTIONAL_BACKGROUND_DONE",
        },
      },
    });
    expect(groupedCompletion).toMatchObject({
      parentMessageId: parentAssistant.id,
      type: "subagent.grouped_completion",
      deliveryState: "queued",
      payload: expect.objectContaining({
        parentMessageId: parentAssistant.id,
        notificationCount: 1,
        childRuns: [
          expect.objectContaining({
            runId,
            status: "completed",
            summary: expect.stringContaining("SUBAGENT_OPTIONAL_BACKGROUND_DONE"),
          }),
        ],
      }),
    });
    expect(store.listSubagentMailboxEvents(runId).map((event) => event.type)).toEqual([
      "subagent.task",
      "subagent.result",
      "subagent.wait_completed",
    ]);
    expect(threadAssistantText(store, run.childThreadId)).toContain("SUBAGENT_OPTIONAL_BACKGROUND_DONE");
  }, Number(process.env.AMBIENT_SUBAGENT_LIVE_TEST_TIMEOUT_MS ?? 300_000));

  itLive("lets live Pi observe an optional child tool-scope denial without starting the child", async () => {
    applyLiveAmbientProviderApiKeyEnv(readLiveAmbientProviderApiKey({ purpose: "sub-agent tool denial live smoke" }));
    const thread = store.createThread("Sub-agent tool denial live smoke");
    runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
      request: async (request) => {
        throw new Error(`Unexpected permission request during sub-agent tool denial live smoke: ${request.toolName}`);
      },
      denyThread: () => undefined,
    });

    const prompt = [
      "This is a live Ambient Desktop sub-agent tool-denial smoke test.",
      "Use only the ambient_subagent tool and your final reply.",
      "Do exactly this:",
      "1. Call ambient_subagent with action spawn_agent, roleId summarizer, dependencyMode optional_background, idempotencyKey live-subagent-tool-denial, toolScope requestedCategories containing workspace.write, and task: This child must not run because workspace.write is denied for summarizer. Do not use tools.",
      "2. After ambient_subagent reports the child launch was failed or denied before orchestration started, and the tool result mentions workspace.write, reply exactly: SUBAGENT_TOOL_DENIAL_LIVE_DONE",
      "Do not call wait_agent. Do not use filesystem, shell, browser, network, plugin, MCP, or connector tools.",
    ].join("\n");

    await sendWithTimeout({
      runtime,
      store,
      threadId: thread.id,
      timeoutMs: Number(process.env.AMBIENT_SUBAGENT_LIVE_TIMEOUT_MS ?? 180_000),
      send: runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: liveAmbientProviderModel({ fallbackModel: AMBIENT_DEFAULT_MODEL }),
        thinkingLevel: "minimal",
        content: prompt,
      }),
    });

    const runs = store.listSubagentRunsForParentThread(thread.id);
    const run = runs[0];
    const assistantText = threadAssistantText(store, thread.id);
    const toolScopeSnapshots = run ? store.listSubagentToolScopeSnapshots(run.id) : [];
    const runEvents = run ? store.listSubagentRunEvents(run.id) : [];
    const report = {
      createdAt: new Date().toISOString(),
      provider: liveAmbientProviderLabel(),
      workspacePath,
      threadId: thread.id,
      run: run ? {
        id: run.id,
        childThreadId: run.childThreadId,
        canonicalTaskPath: run.canonicalTaskPath,
        status: run.status,
        resultArtifact: compactSubagentResultArtifact(run.resultArtifact),
        runEvents: runEvents.map((event) => ({
          type: event.type,
          preview: event.preview,
        })),
        toolScopeSnapshots: toolScopeSnapshots.map((snapshot) => ({
          sequence: snapshot.sequence,
          loadedCategories: snapshot.scope.loadedCategories,
          piVisibleCategories: snapshot.scope.piVisibleCategories,
          deniedCategories: snapshot.scope.deniedCategories,
          worktreeIsolated: snapshot.scope.worktreeIsolated,
          fanoutAvailable: snapshot.scope.fanoutAvailable,
        })),
        mailboxEvents: store.listSubagentMailboxEvents(run.id).map((event) => ({
          id: event.id,
          type: event.type,
          direction: event.direction,
          deliveryState: event.deliveryState,
        })),
        waitBarriers: store.listSubagentWaitBarriersForParentRun(run.parentRunId).map((barrier) => ({
          id: barrier.id,
          childRunIds: barrier.childRunIds,
          dependencyMode: barrier.dependencyMode,
          status: barrier.status,
          failurePolicy: barrier.failurePolicy,
          timeoutMs: barrier.timeoutMs,
          resolvedAt: barrier.resolvedAt,
        })),
        parentMailboxEvents: store.listSubagentParentMailboxEventsForParentRun(run.parentRunId).map((event) => ({
          id: event.id,
          type: event.type,
          deliveryState: event.deliveryState,
          payload: event.payload,
        })),
      } : undefined,
      toolNames: threadToolNames(store, thread.id),
      assistantText,
      childTranscript: run ? threadTranscript(store, run.childThreadId) : "",
      transcript: threadTranscript(store, thread.id),
    };
    const reportRoot = join(process.cwd(), "test-results", "subagent-live-smoke");
    const latestReportPath = join(reportRoot, "tool-denial-latest.json");
    const runReportPath = join(reportRoot, `tool-denial-run-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    await mkdir(reportRoot, { recursive: true });
    await writeFile(latestReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(runReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

    expect(runs).toHaveLength(1);
    expect(run).toMatchObject({
      parentThreadId: thread.id,
      roleId: "summarizer",
      dependencyMode: "optional_background",
      status: "failed",
      resultArtifact: {
        schemaVersion: "ambient-subagent-result-artifact-v1",
        status: "failed",
        partial: false,
        summary: expect.stringContaining("workspace.write"),
      },
    });
    expect(store.getThread(run.childThreadId)).toMatchObject({
      kind: "subagent_child",
      parentThreadId: thread.id,
      childStatus: "failed",
      collapsedByDefault: true,
    });
    expect(toolScopeSnapshots).toHaveLength(1);
    expect(toolScopeSnapshots[0].scope).toMatchObject({
      deniedCategories: expect.arrayContaining([
        expect.objectContaining({
          id: "workspace.write",
          reason: "Denied by the selected sub-agent role.",
        }),
      ]),
    });
    expect(runEvents.map((event) => event.type)).toEqual(expect.arrayContaining([
      "subagent.spawn_requested",
      "subagent.spawn_rejected",
      "subagent.status_changed",
    ]));
    expect(runEvents.map((event) => event.type)).not.toContain("subagent.runtime_event");
    expect(store.listSubagentMailboxEvents(run.id)).toHaveLength(0);
    expect(store.listSubagentParentMailboxEventsForParentRun(run.parentRunId)).toEqual([
      expect.objectContaining({
        type: "subagent.spawn_failed",
        deliveryState: "queued",
        payload: expect.objectContaining({
          schemaVersion: "ambient-subagent-spawn-failure-v1",
          failureStage: "tool_scope",
          childRunId: run.id,
          childThreadId: run.childThreadId,
          canonicalTaskPath: run.canonicalTaskPath,
          reason: expect.stringContaining("workspace.write"),
          toolScopeSnapshot: expect.objectContaining({
            deniedCategories: expect.arrayContaining([
              expect.objectContaining({
                id: "workspace.write",
                reason: "Denied by the selected sub-agent role.",
              }),
            ]),
          }),
        }),
      }),
    ]);
    expect(store.listSubagentWaitBarriersForParentRun(run.parentRunId)).toEqual([]);
    expect(report.toolNames.filter((name) => name === "ambient_subagent").length).toBeGreaterThanOrEqual(1);
    expect(assistantText).toContain("SUBAGENT_TOOL_DENIAL_LIVE_DONE");
    expect(report.childTranscript).toContain("workspace.write");
  }, Number(process.env.AMBIENT_SUBAGENT_LIVE_TEST_TIMEOUT_MS ?? 240_000));

  itLive("reconciles an active live Pi child after simulated desktop restart", async () => {
    applyLiveAmbientProviderApiKeyEnv(readLiveAmbientProviderApiKey({ purpose: "sub-agent restart reconciliation live smoke" }));
    const thread = store.createThread("Sub-agent restart reconciliation live smoke");
    runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
      request: async (request) => {
        throw new Error(`Unexpected permission request during sub-agent restart reconciliation live smoke: ${request.toolName}`);
      },
      denyThread: () => undefined,
    });
    const parentAssistant = store.addMessage({ threadId: thread.id, role: "assistant", content: "" });
    const parentRun = store.startRun({ threadId: thread.id, assistantMessageId: parentAssistant.id });
    (runtime as any).activeRunIds.set(thread.id, parentRun.id);
    const registeredTools: any[] = [];
    (runtime as any).createSubagentToolExtension(thread.id)({
      registerTool: (tool: any) => registeredTools.push(tool),
    });
    const subagentTool = registeredTools.find((tool) => tool.name === "ambient_subagent");
    if (!subagentTool) throw new Error("ambient_subagent tool was not registered for restart reconciliation live smoke.");

    let childThreadId: string | undefined;
    let childExecution: Promise<void> | undefined;
    try {
      const spawned = await subagentTool.execute("live-restart-reconciliation-spawn", {
        action: "spawn_agent",
        roleId: "summarizer",
        dependencyMode: "required",
        idempotencyKey: "live-subagent-restart-reconciliation-spawn",
        task: [
          "This is a live restart reconciliation smoke test.",
          "Do not use tools.",
          "Take your time before completing: draft at least 120 numbered sentences about why Ambient restart reconciliation must preserve visible child thread state.",
          "If you are not interrupted, complete with SUBAGENT_RESTART_SHOULD_HAVE_INTERRUPTED using the required structured result contract.",
        ].join("\n"),
      });
      const runId = spawned.details.run.id as string;
      const run = store.getSubagentRun(runId);
      childThreadId = run.childThreadId;
      childExecution = (runtime as any).subagentChildExecutions.get(runId)?.promise as Promise<void> | undefined;

      await waitForCondition({
        timeoutMs: Number(process.env.AMBIENT_SUBAGENT_CHILD_LIVE_TIMEOUT_MS ?? 180_000),
        description: "active live child Pi run before restart reconciliation",
        predicate: () => store.getSubagentRun(runId).status === "running" && (runtime as any).activeRuns.has(run.childThreadId),
      });

      const emitted: Array<{ type: string; id?: string; sequence?: number }> = [];
      const restartNow = "2026-06-05T13:20:00.000Z";
      const summary = reconcileSubagentsOnRuntimeStartup({
        store,
        featureFlagSnapshot: resolveAmbientFeatureFlags({
          settings: store.getFeatureFlagSettings(),
          generatedAt: restartNow,
        }),
        now: restartNow,
        emit: {
          onRunUpdated: (item) => emitted.push({ type: "run", id: item.id }),
          onThreadUpdated: (item) => emitted.push({ type: "thread", id: item.id }),
          onRunEventCreated: (_item, event) => emitted.push({ type: "event", sequence: event.sequence }),
          onParentMailboxEventUpdated: (event) => emitted.push({ type: "parent-mailbox", id: event.id }),
          onWaitBarrierUpdated: (barrier) => emitted.push({ type: "barrier", id: barrier.id }),
        },
      });

      await runtime.abort(run.childThreadId, { skipSubagentChildCancellation: true });
      if (childExecution) await childExecution;

      const latest = store.getSubagentRun(runId);
      const waitBarriers = store.listSubagentWaitBarriersForParentRun(parentRun.id);
      const parentMailboxEvents = store.listSubagentParentMailboxEventsForParentRun(parentRun.id);
      const postSummary = store.reconcileSubagentRestartState({
        now: "2026-06-05T13:20:05.000Z",
      });
      const reportRoot = join(process.cwd(), "test-results", "subagent-live-smoke");
      const latestReportPath = join(reportRoot, "restart-reconciliation-latest.json");
      const runReportPath = join(reportRoot, `restart-reconciliation-run-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
      const restartEvidence = recordSubagentRestartRecoveryEvidence(store, {
        summary: postSummary,
        reviewer: "subagent-live-smoke",
        artifactPath: latestReportPath,
        evidenceKey: `restart-recovery-live:${runId}`,
        notes: "Live Ambient/Pi child was running at simulated desktop restart and reconciled to a visible stopped child with no remaining restart issues.",
        createdAt: postSummary.createdAt,
      });
      const report = {
        createdAt: new Date().toISOString(),
        provider: liveAmbientProviderLabel(),
        workspacePath,
        threadId: thread.id,
        summary,
        postSummary,
        emitted,
        restartEvidence,
        run: {
          id: latest.id,
          childThreadId: latest.childThreadId,
          canonicalTaskPath: latest.canonicalTaskPath,
          status: latest.status,
          resultArtifact: compactSubagentResultArtifact(latest.resultArtifact),
          runEvents: store.listSubagentRunEvents(runId).map((event) => ({
            type: event.type,
            preview: event.preview,
          })),
        },
        waitBarriers: waitBarriers.map((barrier) => ({
          id: barrier.id,
          childRunIds: barrier.childRunIds,
          dependencyMode: barrier.dependencyMode,
          status: barrier.status,
          resolutionArtifact: barrier.resolutionArtifact,
        })),
        parentMailboxEvents: parentMailboxEvents.map((event) => ({
          id: event.id,
          type: event.type,
          deliveryState: event.deliveryState,
          payload: event.payload,
        })),
        childStillActive: (runtime as any).activeRuns.has(latest.childThreadId),
        childTranscript: threadTranscript(store, latest.childThreadId),
      };
      await mkdir(reportRoot, { recursive: true });
      await writeFile(latestReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
      await writeFile(runReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

      expect(summary).toMatchObject({
        schemaVersion: "ambient-subagent-restart-reconciliation-v1",
        repairedRunIds: [runId],
      });
      expect(summary.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: "active_run_interrupted",
          runId,
        }),
      ]));
      expect(latest).toMatchObject({
        status: "stopped",
        resultArtifact: {
          schemaVersion: "ambient-subagent-result-artifact-v1",
          status: "stopped",
          partial: false,
          summary: expect.stringContaining("Ambient restarted"),
        },
      });
      expect(store.getThread(latest.childThreadId)).toMatchObject({
        kind: "subagent_child",
        parentThreadId: thread.id,
        childStatus: "stopped",
        collapsedByDefault: true,
      });
      expect(waitBarriers).toEqual([
        expect.objectContaining({
          childRunIds: [runId],
          dependencyMode: "required_all",
          status: "failed",
          resolutionArtifact: expect.objectContaining({
            restartReconciled: true,
            synthesisAllowed: false,
            stoppedChildRunIds: [runId],
          }),
        }),
      ]);
      expect(store.listSubagentRunEvents(runId).map((event) => event.type)).toEqual(expect.arrayContaining([
        "subagent.child_session_started",
        "subagent.restart_reconciled",
        "subagent.lifecycle_stopped",
      ]));
      expect(parentMailboxEvents).toEqual([
        expect.objectContaining({
          parentMessageId: parentAssistant.id,
          type: "subagent.lifecycle_interrupted",
          payload: expect.objectContaining({
            schemaVersion: "ambient-subagent-lifecycle-interruption-v1",
            childRunId: runId,
            childThreadId: latest.childThreadId,
            previousStatus: "running",
            status: "stopped",
            source: "desktop_restart",
          }),
        }),
      ]);
      expect(emitted).toEqual(expect.arrayContaining([
        { type: "run", id: runId },
        { type: "thread", id: latest.childThreadId },
        expect.objectContaining({ type: "parent-mailbox" }),
        expect.objectContaining({ type: "barrier" }),
      ]));
      expect(postSummary.issueCount).toBe(0);
      expect(restartEvidence).toMatchObject({
        kind: "restart_recovery",
        status: "passed",
      });
      expect(store.getSubagentObservabilitySummary({ parentRunId: parentRun.id })).toMatchObject({
        restartReconciliations: 1,
      });
      expect((runtime as any).activeRuns.has(latest.childThreadId)).toBe(false);
      expect(threadAssistantText(store, latest.childThreadId)).not.toContain("SUBAGENT_RESTART_SHOULD_HAVE_INTERRUPTED");
    } finally {
      if (childThreadId && runtime && (runtime as any).activeRuns.has(childThreadId)) {
        await runtime.abort(childThreadId, { skipSubagentChildCancellation: true }).catch(() => undefined);
      }
      if (childExecution) await childExecution.catch(() => undefined);
    }
  }, Number(process.env.AMBIENT_SUBAGENT_LIVE_TEST_TIMEOUT_MS ?? 300_000));

  itLive("aborts an active required child Pi session when the parent run stops", async () => {
    applyLiveAmbientProviderApiKeyEnv(readLiveAmbientProviderApiKey({ purpose: "sub-agent parent stop live smoke" }));
    const thread = store.createThread("Sub-agent parent stop live smoke");
    runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
      request: async (request) => {
        throw new Error(`Unexpected permission request during sub-agent parent stop live smoke: ${request.toolName}`);
      },
      denyThread: () => undefined,
    });
    const parentAssistant = store.addMessage({ threadId: thread.id, role: "assistant", content: "" });
    const parentRun = store.startRun({ threadId: thread.id, assistantMessageId: parentAssistant.id });
    (runtime as any).activeRunIds.set(thread.id, parentRun.id);
    (runtime as any).activeRuns.set(thread.id, {
      abort: async () => undefined,
      detach: () => undefined,
      queue: () => undefined,
    });
    const registeredTools: any[] = [];
    (runtime as any).createSubagentToolExtension(thread.id)({
      registerTool: (tool: any) => registeredTools.push(tool),
    });
    const subagentTool = registeredTools.find((tool) => tool.name === "ambient_subagent");
    if (!subagentTool) throw new Error("ambient_subagent tool was not registered for parent stop live smoke.");

    const spawned = await subagentTool.execute("live-parent-stop-spawn", {
      action: "spawn_agent",
      roleId: "summarizer",
      dependencyMode: "required",
      idempotencyKey: "live-subagent-parent-stop-spawn",
      task: [
        "This is a live parent-stop smoke test.",
        "Do not use tools.",
        "Prepare a careful multi-paragraph summary of why parent stop must cancel required child work.",
        "If you are not cancelled, finish with SUBAGENT_PARENT_STOP_SHOULD_HAVE_CANCELLED using the required structured result contract.",
      ].join("\n"),
    });
    const runId = spawned.details.run.id as string;
    const run = store.getSubagentRun(runId);
    await waitForCondition({
      timeoutMs: Number(process.env.AMBIENT_SUBAGENT_CHILD_LIVE_TIMEOUT_MS ?? 180_000),
      description: "active live child Pi run",
      predicate: () => (runtime as any).activeRuns.has(run.childThreadId),
    });
    const execution = (runtime as any).subagentChildExecutions.get(runId)?.promise as Promise<void> | undefined;

    await runtime.abort(thread.id);
    if (execution) await execution;

    const latest = store.getSubagentRun(runId);
    const report = {
      createdAt: new Date().toISOString(),
      provider: liveAmbientProviderLabel(),
      workspacePath,
      threadId: thread.id,
      run: {
        id: latest.id,
        childThreadId: latest.childThreadId,
        canonicalTaskPath: latest.canonicalTaskPath,
        status: latest.status,
        resultArtifact: compactSubagentResultArtifact(latest.resultArtifact),
        runEvents: store.listSubagentRunEvents(runId).map((event) => event.type),
      },
      childStillActive: (runtime as any).activeRuns.has(run.childThreadId),
      childTranscript: threadTranscript(store, run.childThreadId),
    };
    const reportRoot = join(process.cwd(), "test-results", "subagent-live-smoke");
    const latestReportPath = join(reportRoot, "parent-stop-latest.json");
    const runReportPath = join(reportRoot, `parent-stop-run-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    await mkdir(reportRoot, { recursive: true });
    await writeFile(latestReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(runReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

    expect(latest).toMatchObject({
      status: "cancelled",
      resultArtifact: {
        schemaVersion: "ambient-subagent-result-artifact-v1",
        status: "cancelled",
        summary: expect.stringContaining("Parent run stopped"),
      },
    });
    expect((runtime as any).activeRuns.has(run.childThreadId)).toBe(false);
    expect(store.listSubagentRunEvents(runId).map((event) => event.type)).toEqual(expect.arrayContaining([
      "subagent.parent_stopped",
      "subagent.child_runtime_aborted",
    ]));
  }, Number(process.env.AMBIENT_SUBAGENT_LIVE_TEST_TIMEOUT_MS ?? 300_000));
});

async function waitForFirstCompletedSubagentRun(store: ProjectStore, parentThreadId: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  let latest = store.listSubagentRunsForParentThread(parentThreadId)[0];
  while (Date.now() < deadline) {
    latest = store.listSubagentRunsForParentThread(parentThreadId)[0];
    if (latest && ["completed", "failed", "stopped", "cancelled", "timed_out", "detached", "aborted_partial"].includes(latest.status)) {
      return latest;
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for live sub-agent child completion. Latest status: ${latest?.status ?? "missing"}`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCondition(input: {
  timeoutMs: number;
  description: string;
  predicate: () => boolean;
}): Promise<void> {
  const deadline = Date.now() + input.timeoutMs;
  while (Date.now() < deadline) {
    if (input.predicate()) return;
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${input.description}.`);
}

async function sendWithTimeout(input: {
  runtime: AgentRuntime;
  store: ProjectStore;
  threadId: string;
  send: Promise<void>;
  timeoutMs: number;
}): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      void input.runtime.abort(input.threadId).catch(() => undefined);
      reject(new Error(`Sub-agent live smoke timed out after ${input.timeoutMs}ms.\n${summarizeThread(input.store, input.threadId)}`));
    }, input.timeoutMs);
  });
  try {
    await Promise.race([input.send, timedOut]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function threadTranscript(store: ProjectStore, threadId: string): string {
  return store
    .listMessages(threadId)
    .map((message) => message.content)
    .join("\n\n--- MESSAGE ---\n\n");
}

function threadToolNames(store: ProjectStore, threadId: string): string[] {
  return store
    .listMessages(threadId)
    .map((message) => (typeof message.metadata?.toolName === "string" ? message.metadata.toolName : undefined))
    .filter((toolName): toolName is string => Boolean(toolName));
}

function threadAssistantText(store: ProjectStore, threadId: string): string {
  return store
    .listMessages(threadId)
    .filter((message) => message.role === "assistant")
    .map((message) => message.content)
    .join("\n");
}

function compactSubagentResultArtifact(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const artifact = value as Record<string, unknown>;
  const structured = artifact.structuredOutput && typeof artifact.structuredOutput === "object" && !Array.isArray(artifact.structuredOutput)
    ? artifact.structuredOutput as Record<string, unknown>
    : undefined;
  return {
    schemaVersion: artifact.schemaVersion,
    runId: artifact.runId,
    status: artifact.status,
    partial: artifact.partial,
    summary: typeof artifact.summary === "string" ? artifact.summary.slice(0, 500) : artifact.summary,
    childThreadId: artifact.childThreadId,
    ...(artifact.artifactPath ? { artifactPath: artifact.artifactPath } : {}),
    ...(structured ? {
      structuredOutput: {
        schemaVersion: structured.schemaVersion,
        roleId: structured.roleId,
        status: structured.status,
        summary: typeof structured.summary === "string" ? structured.summary.slice(0, 500) : structured.summary,
      },
    } : {}),
  };
}

function summarizeThread(store: ProjectStore, threadId: string): string {
  const messages = store.listMessages(threadId);
  return messages
    .slice(-8)
    .map((message) => {
      const tool = message.metadata?.toolName ? ` tool=${message.metadata.toolName}` : "";
      return `${message.role}${tool}: ${message.content.replace(/\s+/g, " ").slice(0, 600)}`;
    })
    .join("\n");
}
