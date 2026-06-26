/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFile } from "node:fs/promises";
import { expect, it, vi } from "vitest";

import { googleWorkspaceConnectorGrantTarget, googleWorkspaceGrantConditions } from "../../shared/googleWorkspaceGrantTargets";
import type { PermissionAuditEntry } from "../../shared/permissionTypes";
import { readWorkflowRunDetail, reviewWorkflowArtifact } from "./workflowDashboard";
import { firstPartyDesktopToolDescriptors } from "./workflowDesktopToolFacade";
import {
  calendarBriefCompilerOutput,
  driveFileReportCompilerOutput,
  eventCountsByType,
  latestRunForArtifact,
  liveAmbientApiKey,
  liveAmbientBaseUrl,
  liveCalendarConnectorOptions,
  liveDriveConnectorOptions,
  liveGmailConnectorOptions,
  liveWorkflowModel,
  runWorkflowApprovingReviews,
  writeCalendarRunDogfoodArtifact,
  writeDriveRunDogfoodArtifact,
  writeLiveGmailRunDogfoodArtifact,
  writeScheduledCalendarRunDogfoodArtifact,
} from "./workflowDogfoodFixtures";
import { googleWorkspaceConnectorDescriptors, resolveGoogleWorkspaceLiveDogfoodRuntime } from "./workflowGoogleWorkspaceFacade";
import { permissionGrantTargetHash } from "./workflowPermissionsFacade";
import { ProjectStore } from "./workflowProjectStoreFacade";
import { runDueWorkflowArtifactSchedules, workflowScheduleRunStartedEventData } from "./workflowScheduleDispatch";
import { AmbientWorkflowCompilerProvider, compileWorkflowArtifact } from "./workflowWorkflowCompilerServiceFacade";

interface WorkflowLiveGoogleWorkspaceRunDogfoodDeps {
  getStore: () => ProjectStore;
  getWorkspacePath: () => string;
  workflowScheduleRunHistoryItems: (...args: any[]) => any[];
}

const LIVE_WORKFLOW_COMPILE_TIMEOUT_MS = Math.max(240_000, Number(process.env.AMBIENT_WORKFLOW_LIVE_TIMEOUT_MS ?? "480000"));
const LIVE_GMAIL_RUN_TIMEOUT_MS = Math.max(
  600_000,
  Number(process.env.AMBIENT_WORKFLOW_GMAIL_RUN_TIMEOUT_MS ?? process.env.AMBIENT_WORKFLOW_LIVE_TIMEOUT_MS ?? "900000"),
);
const LIVE_GOOGLE_PROVIDER_REQUEST_TIMEOUT_MS = boundedLiveGoogleProviderRequestTimeoutMs(LIVE_GMAIL_RUN_TIMEOUT_MS);

function boundedLiveGoogleProviderRequestTimeoutMs(testTimeoutMs: number): number {
  const configured = Number(
    process.env.AMBIENT_WORKFLOW_GWS_PROVIDER_REQUEST_TIMEOUT_MS ??
      process.env.AMBIENT_WORKFLOW_GMAIL_PROVIDER_REQUEST_TIMEOUT_MS ??
      process.env.AMBIENT_WORKFLOW_LIVE_PROVIDER_REQUEST_TIMEOUT_MS ??
      "",
  );
  const requested = Number.isFinite(configured) && configured > 0 ? configured : 120_000;
  const maxAllowed = Math.max(30_000, testTimeoutMs - 60_000);
  return Math.max(15_000, Math.min(Math.floor(requested), maxAllowed));
}

export function registerWorkflowLiveGoogleWorkspaceRunDogfoodTests(deps: WorkflowLiveGoogleWorkspaceRunDogfoodDeps): void {
  const itLiveGmailRun = process.env.AMBIENT_WORKFLOW_GMAIL_RUN_LIVE === "1" ? it : it.skip;
  const itLiveGoogleWorkspaceRun = process.env.AMBIENT_WORKFLOW_GWS_RUN_LIVE === "1" ? it : it.skip;
  const store = new Proxy({} as ProjectStore, {
    get(_target, property) {
      const current = deps.getStore() as any;
      const value = current[property];
      return typeof value === "function" ? value.bind(current) : value;
    },
  });

  itLiveGoogleWorkspaceRun(
    "runs a Calendar upcoming-events brief workflow through the real Google wrapper",
    async () => {
      const apiKey = liveAmbientApiKey();
      const workspacePath = deps.getWorkspacePath();
      const { accountHint, adapter } = await resolveGoogleWorkspaceLiveDogfoodRuntime("calendar");
      const connectorOptions = liveCalendarConnectorOptions(accountHint);
      const connectorDescriptors = googleWorkspaceConnectorDescriptors(connectorOptions).filter(
        (descriptor) => descriptor.id === "google.calendar",
      );
      const thread = store.createWorkflowAgentThreadSummary({
        initialRequest: "Summarize upcoming Google Calendar events into a concise brief.",
        traceMode: "debug",
      });
      const dashboard = await compileWorkflowArtifact({
        store,
        workflowThreadId: thread.id,
        userRequest:
          "Create a read-only Google Calendar workflow that lists upcoming events, asks Ambient to summarize schedule themes, and checkpoints the brief.",
        workspaceSummary: `Live Google Workspace Calendar runtime dogfood. GWS Calendar connector account ${accountHint} is available and should be used exactly.`,
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        connectorDescriptors,
        stateRoot: store.getWorkspace().statePath,
        model: liveWorkflowModel(),
        provider: { compileProgramIr: vi.fn(async () => calendarBriefCompilerOutput(accountHint)) },
      });
      const artifact = dashboard.artifacts[0];
      const calendarGrant = artifact.manifest.connectors?.find((connector) => connector.connectorId === "google.calendar");

      expect(artifact).toMatchObject({ status: "ready_for_preview" });
      expect(artifact.manifest.mutationPolicy).toBe("read_only");
      expect(calendarGrant).toMatchObject({
        connectorId: "google.calendar",
        accountId: accountHint,
        scopes: expect.arrayContaining(["calendar.readonly"]),
        operations: expect.arrayContaining(["listEvents"]),
        dataRetention: "redacted_audit",
      });

      const runDashboard = await runWorkflowApprovingReviews({
        store,
        artifactId: artifact.id,
        workspacePath,
        adapter,
        connectorOptions,
        apiKey,
        model: liveWorkflowModel(),
        baseUrl: liveAmbientBaseUrl(),
        providerRequestTimeoutMs: LIVE_GOOGLE_PROVIDER_REQUEST_TIMEOUT_MS,
        maxApprovalRounds: 3,
      });
      const run = latestRunForArtifact(runDashboard, artifact.id);
      const detail = readWorkflowRunDetail(store, run.id);
      const state = JSON.parse(await readFile(artifact.statePath, "utf8")) as {
        checkpoints?: Record<string, { value?: { brief?: { summary?: string; highlights?: string[]; eventCount?: number } } }>;
      };

      const calendarRunArtifact = {
        accountHint,
        providerRequestTimeoutMs: LIVE_GOOGLE_PROVIDER_REQUEST_TIMEOUT_MS,
        run: { id: run.id, status: run.status, error: run.error },
        eventCounts: eventCountsByType(detail.events),
        connectorMessages: detail.events.filter((event) => event.type === "connector.end").map((event) => event.message),
        modelCalls: detail.modelCalls.map((call) => ({
          task: call.task,
          status: call.status,
          latencyMs: call.latencyMs,
          model: call.model,
        })),
        checkpoint: state.checkpoints?.calendarBrief?.value,
      };
      await writeCalendarRunDogfoodArtifact(calendarRunArtifact);

      if (run.status !== "succeeded") {
        throw new Error(`Expected Calendar read-only dogfood run to succeed. run=${JSON.stringify(calendarRunArtifact)}`);
      }
      expect(detail.events).toEqual(
        expect.arrayContaining([expect.objectContaining({ type: "connector.end", message: "google.calendar.listEvents" })]),
      );
      expect(detail.modelCalls).toEqual(
        expect.arrayContaining([expect.objectContaining({ task: "dogfood.calendar_brief", status: "succeeded" })]),
      );
      expect(state.checkpoints?.calendarBrief?.value?.brief?.summary).toMatch(/calendar|event|schedule|upcoming|no upcoming/i);
    },
    LIVE_GMAIL_RUN_TIMEOUT_MS,
  );

  itLiveGoogleWorkspaceRun(
    "runs a scheduled Calendar workflow through persistent grant preflight and the real Google wrapper",
    async () => {
      const apiKey = liveAmbientApiKey();
      const workspacePath = deps.getWorkspacePath();
      const { accountHint, adapter } = await resolveGoogleWorkspaceLiveDogfoodRuntime("calendar");
      const connectorOptions = liveCalendarConnectorOptions(accountHint);
      const connectorDescriptors = googleWorkspaceConnectorDescriptors(connectorOptions).filter(
        (descriptor) => descriptor.id === "google.calendar",
      );
      const createdAt = new Date(2026, 0, 1, 8, 0, 0, 0);
      const firstDueAt = new Date(2026, 0, 1, 10, 0, 0, 0);
      const secondDueAt = new Date(2026, 0, 2, 10, 0, 0, 0);
      const thread = store.createWorkflowAgentThreadSummary({
        initialRequest: "Run a scheduled Google Calendar brief each morning.",
        projectPath: workspacePath,
        traceMode: "debug",
      });
      const dashboard = await compileWorkflowArtifact({
        store,
        workflowThreadId: thread.id,
        userRequest:
          "Create a read-only scheduled Google Calendar workflow that lists upcoming events, asks Ambient to summarize schedule themes, and checkpoints the brief.",
        workspaceSummary: `Live scheduled Google Workspace Calendar dogfood. GWS Calendar connector account ${accountHint} is available and should be used exactly.`,
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        connectorDescriptors,
        stateRoot: store.getWorkspace().statePath,
        model: liveWorkflowModel(),
        provider: { compileProgramIr: vi.fn(async () => calendarBriefCompilerOutput(accountHint)) },
      });
      const artifact = dashboard.artifacts[0];
      reviewWorkflowArtifact(store, { artifactId: artifact.id, decision: "approved" });
      const approvedVersion = store.getLatestApprovedWorkflowVersion(thread.id);
      const schedule = store.createAutomationSchedule(
        {
          targetKind: "workflow_thread",
          targetId: thread.id,
          preset: "daily",
          timezone: "America/Phoenix",
        },
        createdAt,
      )[0];

      const blocked = await runDueWorkflowArtifactSchedules(store, firstDueAt, async () => {
        throw new Error("Scheduled Calendar workflow should not run before a persistent connector grant exists.");
      });
      const calendarReadTarget = googleWorkspaceConnectorGrantTarget({
        connectorId: "google.calendar",
        operation: "listEvents",
        accountId: accountHint,
      })!;
      const grant = store.createPermissionGrant({
        permissionModeAtCreation: "workspace",
        scopeKind: "workflow_thread",
        workflowThreadId: thread.id,
        actionKind: "connector_content_read",
        targetKind: "connector",
        targetHash: permissionGrantTargetHash("connector_content_read", "connector", calendarReadTarget.identity),
        targetLabel: calendarReadTarget.label,
        conditions: googleWorkspaceGrantConditions(calendarReadTarget, { scheduledWorkflow: true, accountId: accountHint }),
        source: "permission_prompt",
        reason: "Allow this scheduled workflow to read Google Calendar events.",
      });
      const auditThread = store.createThread("Scheduled Calendar audit receipts");
      const auditEntries: PermissionAuditEntry[] = [];
      let scheduledRunId = "";
      const started = await runDueWorkflowArtifactSchedules(
        store,
        secondDueAt,
        async (scheduleInput) => {
          const { schedule: runnerSchedule, artifact: runnerArtifact } = scheduleInput;
          expect(runnerSchedule.id).toBe(schedule.id);
          expect(runnerArtifact.id).toBe(artifact.id);
          const runDashboard = await runWorkflowApprovingReviews({
            store,
            artifactId: runnerArtifact.id,
            workspacePath,
            adapter,
            connectorOptions,
            apiKey,
            model: liveWorkflowModel(),
            baseUrl: liveAmbientBaseUrl(),
            providerRequestTimeoutMs: LIVE_GOOGLE_PROVIDER_REQUEST_TIMEOUT_MS,
            maxApprovalRounds: 3,
          });
          const run = latestRunForArtifact(runDashboard, runnerArtifact.id);
          scheduledRunId = run.id;
          store.appendWorkflowRunEvent({
            runId: run.id,
            type: "workflow.schedule.started",
            message: runnerSchedule.id,
            data: workflowScheduleRunStartedEventData(scheduleInput),
          });
          return { runId: run.id };
        },
        { threadId: auditThread.id, onPermissionAuditCreated: (entry) => auditEntries.push(entry) },
      );
      const run = store.getWorkflowRun(scheduledRunId);
      const detail = readWorkflowRunDetail(store, scheduledRunId);
      const state = JSON.parse(await readFile(artifact.statePath, "utf8")) as {
        checkpoints?: Record<string, { value?: { brief?: { summary?: string; highlights?: string[]; eventCount?: number } } }>;
      };
      const scheduleRunHistory = deps.workflowScheduleRunHistoryItems(schedule.id, store.listWorkflowRuns());

      await writeScheduledCalendarRunDogfoodArtifact({
        accountHint,
        schedule: {
          id: schedule.id,
          targetKind: schedule.targetKind,
          targetId: schedule.targetId,
          firstOutcome: blocked[0],
          secondOutcome: started[0],
          latestStored: store.listAutomationSchedules().find((candidate) => candidate.id === schedule.id),
        },
        grant: { id: grant.id, scopeKind: grant.scopeKind, targetLabel: grant.targetLabel },
        grantReuseAudit: auditEntries.map((entry) => ({
          id: entry.id,
          toolName: entry.toolName,
          decisionSource: entry.decisionSource,
          grantId: entry.grantId,
          detail: entry.detail,
        })),
        version: approvedVersion ? { id: approvedVersion.id, version: approvedVersion.version, status: approvedVersion.status } : undefined,
        run: { id: run.id, status: run.status, error: run.error, scheduledBy: run.scheduledBy },
        eventCounts: eventCountsByType(detail.events),
        scheduleStartEvents: detail.events
          .filter((event) => event.type === "workflow.schedule.started")
          .map((event) => ({ message: event.message, data: event.data })),
        scheduleRunHistory,
        connectorMessages: detail.events.filter((event) => event.type === "connector.end").map((event) => event.message),
        modelCalls: detail.modelCalls.map((call) => ({
          task: call.task,
          status: call.status,
          latencyMs: call.latencyMs,
          model: call.model,
        })),
        checkpoint: state.checkpoints?.calendarBrief?.value,
      });

      expect(approvedVersion).toMatchObject({ workflowThreadId: thread.id, artifactId: artifact.id, status: "approved" });
      expect(blocked).toEqual([
        expect.objectContaining({
          scheduleId: schedule.id,
          artifactId: artifact.id,
          workflowThreadId: thread.id,
          outcome: "skipped",
          reason: "Workflow schedule requires persistent connector grant for google.calendar.",
        }),
      ]);
      expect(started).toEqual([
        expect.objectContaining({
          scheduleId: schedule.id,
          artifactId: artifact.id,
          workflowThreadId: thread.id,
          versionId: approvedVersion?.id,
          outcome: "started",
          runId: scheduledRunId,
        }),
      ]);
      expect(run).toMatchObject({ status: "succeeded" });
      expect(run.scheduledBy).toMatchObject({
        scheduleId: schedule.id,
        targetKind: "workflow_thread",
        targetVersionId: approvedVersion?.id,
        grantDecisionSource: "persistent_grant",
      });
      expect(scheduleRunHistory).toEqual([
        expect.objectContaining({
          id: scheduledRunId,
          statusLabel: "Run Succeeded",
          tone: "ready",
        }),
        expect.objectContaining({
          statusLabel: "Schedule skipped",
          tone: "neutral",
        }),
      ]);
      expect(auditEntries).toEqual([
        expect.objectContaining({
          toolName: "google.calendar.listEvents",
          decision: "allowed",
          decisionSource: "persistent_grant",
          grantId: grant.id,
          reason: "Scheduled workflow preflight reused a persistent connector grant.",
        }),
      ]);
      expect(detail.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "workflow.schedule.started",
            data: expect.objectContaining({
              scheduleId: schedule.id,
              targetKind: "workflow_thread",
              workflowThreadId: thread.id,
              targetVersionId: approvedVersion?.id,
              grantDecisionSource: "persistent_grant",
              grantIds: [grant.id],
              grantTargets: [calendarReadTarget.label],
            }),
          }),
        ]),
      );
      expect(detail.events).toEqual(
        expect.arrayContaining([expect.objectContaining({ type: "connector.end", message: "google.calendar.listEvents" })]),
      );
      expect(detail.modelCalls).toEqual(
        expect.arrayContaining([expect.objectContaining({ task: "dogfood.calendar_brief", status: "succeeded" })]),
      );
      expect(state.checkpoints?.calendarBrief?.value?.brief?.summary).toMatch(/calendar|event|schedule|upcoming|no upcoming/i);
      expect(store.listAutomationSchedules().find((candidate) => candidate.id === schedule.id)).toMatchObject({
        id: schedule.id,
        lastRunAt: secondDueAt.toISOString(),
      });
    },
    LIVE_GMAIL_RUN_TIMEOUT_MS,
  );

  itLiveGoogleWorkspaceRun(
    "runs a Drive file-evidence report workflow through the real Google wrapper",
    async () => {
      const apiKey = liveAmbientApiKey();
      const workspacePath = deps.getWorkspacePath();
      const { accountHint, adapter } = await resolveGoogleWorkspaceLiveDogfoodRuntime("drive");
      const connectorOptions = liveDriveConnectorOptions(accountHint);
      const connectorDescriptors = googleWorkspaceConnectorDescriptors(connectorOptions).filter(
        (descriptor) => descriptor.id === "google.drive",
      );
      const thread = store.createWorkflowAgentThreadSummary({
        initialRequest: "Search Google Drive files and summarize file evidence.",
        traceMode: "debug",
      });
      const dashboard = await compileWorkflowArtifact({
        store,
        workflowThreadId: thread.id,
        userRequest:
          "Create a read-only Google Drive workflow that searches recent files, reads metadata for top matches, asks Ambient to summarize the file evidence, and checkpoints the report.",
        workspaceSummary: `Live Google Workspace Drive runtime dogfood. GWS Drive connector account ${accountHint} is available and should be used exactly.`,
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        connectorDescriptors,
        stateRoot: store.getWorkspace().statePath,
        model: liveWorkflowModel(),
        provider: { compileProgramIr: vi.fn(async () => driveFileReportCompilerOutput(accountHint)) },
      });
      const artifact = dashboard.artifacts[0];
      const driveGrant = artifact.manifest.connectors?.find((connector) => connector.connectorId === "google.drive");

      expect(artifact).toMatchObject({ status: "ready_for_preview" });
      expect(artifact.manifest.mutationPolicy).toBe("read_only");
      expect(driveGrant).toMatchObject({
        connectorId: "google.drive",
        accountId: accountHint,
        scopes: expect.arrayContaining(["drive.readonly"]),
        operations: expect.arrayContaining(["search", "readFile"]),
        dataRetention: "redacted_audit",
      });

      const runDashboard = await runWorkflowApprovingReviews({
        store,
        artifactId: artifact.id,
        workspacePath,
        adapter,
        connectorOptions,
        apiKey,
        model: liveWorkflowModel(),
        baseUrl: liveAmbientBaseUrl(),
        providerRequestTimeoutMs: LIVE_GOOGLE_PROVIDER_REQUEST_TIMEOUT_MS,
        maxApprovalRounds: 5,
      });
      const run = latestRunForArtifact(runDashboard, artifact.id);
      const detail = readWorkflowRunDetail(store, run.id);
      const state = JSON.parse(await readFile(artifact.statePath, "utf8")) as {
        checkpoints?: Record<
          string,
          { value?: { fileCount?: number; report?: { summary?: string; fileCount?: number; highlights?: string[] } } }
        >;
      };
      const connectorMessages = detail.events.filter((event) => event.type === "connector.end").map((event) => event.message);

      const driveRunArtifact = {
        accountHint,
        providerRequestTimeoutMs: LIVE_GOOGLE_PROVIDER_REQUEST_TIMEOUT_MS,
        run: { id: run.id, status: run.status, error: run.error },
        eventCounts: eventCountsByType(detail.events),
        connectorMessages,
        modelCalls: detail.modelCalls.map((call) => ({
          task: call.task,
          status: call.status,
          latencyMs: call.latencyMs,
          model: call.model,
        })),
        checkpoint: state.checkpoints?.driveFileReport?.value,
      };
      await writeDriveRunDogfoodArtifact(driveRunArtifact);

      if (run.status !== "succeeded") {
        throw new Error(`Expected Drive read-only dogfood run to succeed. run=${JSON.stringify(driveRunArtifact)}`);
      }
      expect(detail.events).toEqual(
        expect.arrayContaining([expect.objectContaining({ type: "connector.end", message: "google.drive.search" })]),
      );
      if ((state.checkpoints?.driveFileReport?.value?.fileCount ?? 0) > 0) {
        expect(connectorMessages.filter((message) => message === "google.drive.readFile").length).toBeGreaterThan(0);
      }
      expect(detail.modelCalls).toEqual(
        expect.arrayContaining([expect.objectContaining({ task: "dogfood.drive_file_report", status: "succeeded" })]),
      );
      expect(state.checkpoints?.driveFileReport?.value?.report?.summary).toMatch(/drive|file|metadata|evidence|no files/i);
    },
    LIVE_GMAIL_RUN_TIMEOUT_MS,
  );

  itLiveGmailRun(
    "runs a Gmail last-100-emails categorization workflow through the real Google wrapper",
    async () => {
      const apiKey = liveAmbientApiKey();
      const workspacePath = deps.getWorkspacePath();
      const { accountHint, adapter } = await resolveGoogleWorkspaceLiveDogfoodRuntime("gmail");
      const connectorOptions = liveGmailConnectorOptions(accountHint);
      const connectorDescriptors = googleWorkspaceConnectorDescriptors(connectorOptions).filter(
        (descriptor) => descriptor.id === "google.gmail",
      );
      const userRequest = [
        "Review the last 100 emails in Gmail and write a concise report categorizing them by action required, urgency, sender/domain, and recurring themes.",
        "The workflow must be read-only, use the available Google Gmail connector account exactly, search the last 100 messages, read enough thread detail to support the categorization, ask Ambient to synthesize a structured JSON report, preserve only redacted audit data, and allow enough connector-call and runtime budget for the loop.",
      ].join(" ");

      const dashboard = await compileWorkflowArtifact({
        store,
        userRequest,
        workspaceSummary: `Live Google Workspace runtime dogfood. GWS Gmail connector account ${accountHint} is available and should be used exactly.`,
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        connectorDescriptors,
        stateRoot: store.getWorkspace().statePath,
        model: liveWorkflowModel(),
        baseUrl: liveAmbientBaseUrl(),
        provider: new AmbientWorkflowCompilerProvider({
          apiKey,
          baseUrl: liveAmbientBaseUrl(),
          timeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
        }),
      });
      const artifact = dashboard.artifacts[0];
      const source = await readFile(artifact.sourcePath, "utf8");
      const gmailGrant = artifact.manifest.connectors?.find((connector) => connector.connectorId === "google.gmail");

      expect(artifact).toMatchObject({ status: "ready_for_preview" });
      expect(["read_only", "staged_until_approved"]).toContain(artifact.manifest.mutationPolicy);
      if (artifact.manifest.mutationPolicy === "staged_until_approved") {
        expect(artifact.manifest.tools).toContain("file_write");
      }
      expect(gmailGrant).toMatchObject({
        connectorId: "google.gmail",
        accountId: accountHint,
        scopes: expect.arrayContaining(["gmail.readonly"]),
        operations: expect.arrayContaining(["search", "readThread"]),
        dataRetention: "redacted_audit",
      });
      expect(gmailGrant?.operations).not.toEqual(expect.arrayContaining(["createDraft", "updateDraft", "deleteDraft", "sendDraft"]));
      expect(artifact.manifest.maxConnectorCalls ?? 0).toBeGreaterThanOrEqual(2);
      expect(artifact.manifest.maxRunMs ?? 0).toBeGreaterThanOrEqual(300_000);
      expect(source).toMatch(/["']?operation["']?\s*:\s*['"]search['"]/);
      expect(source).toMatch(/["']?operation["']?\s*:\s*['"]readThread['"]/);
      expect(source).toMatch(/["']?maxResults["']?\s*:\s*100/);
      expect(source).toMatch(/["']?accountId["']?\s*:\s*['"][^'"]+['"]/);
      expect(source).toMatch(/workflow\.(checkpoint|resumePoint)/);

      const runDashboard = await runWorkflowApprovingReviews({
        store,
        artifactId: artifact.id,
        workspacePath,
        adapter,
        connectorOptions,
        apiKey,
        model: liveWorkflowModel(),
        baseUrl: liveAmbientBaseUrl(),
        providerRequestTimeoutMs: LIVE_GOOGLE_PROVIDER_REQUEST_TIMEOUT_MS,
        maxApprovalRounds: 5,
      });
      const run = latestRunForArtifact(runDashboard, artifact.id);
      const events = store.listWorkflowRunEvents(run.id);
      const modelCalls = store.listWorkflowModelCalls({ runId: run.id });
      const report = run.reportPath ? await readFile(run.reportPath, "utf8") : "";

      await writeLiveGmailRunDogfoodArtifact({
        accountHint,
        providerRequestTimeoutMs: LIVE_GOOGLE_PROVIDER_REQUEST_TIMEOUT_MS,
        run: { id: run.id, status: run.status, error: run.error },
        eventCounts: eventCountsByType(events),
        connectorMessages: events.filter((event) => event.type === "connector.end").map((event) => event.message),
        ambientErrors: events
          .filter((event) => event.type === "ambient.call.error")
          .map((event) => ({ message: event.message, graphNodeId: event.graphNodeId, data: event.data })),
        modelCalls: modelCalls.map((call) => ({
          task: call.task,
          status: call.status,
          model: call.model,
          validationError: call.validationError,
          requestEstimatedTokens: call.cacheCheckpoint?.requestEstimatedTokens,
          mutableSuffixTokens: call.cacheCheckpoint?.mutableSuffixEstimatedTokens,
        })),
      });

      expect(run).toMatchObject({ status: "succeeded" });
      expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ type: "connector.end", message: "google.gmail.search" })]));
      expect(
        events.filter((event) => event.type === "connector.end" && event.message === "google.gmail.readThread").length,
      ).toBeGreaterThan(0);
      expect(modelCalls).toEqual(expect.arrayContaining([expect.objectContaining({ status: "succeeded" })]));
      expect(report).toContain("google.gmail.search");
      expect(report).toContain("ambient.call");
    },
    LIVE_GMAIL_RUN_TIMEOUT_MS,
  );
}
