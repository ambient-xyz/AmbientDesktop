import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMessagingBindingStore } from "./messagingBindings";
import { buildRuntimeSurfaceSnapshot, runtimeSurfaceSnapshotText } from "../../shared/runtimeSurfaceSnapshot";
import { messagingProjectionText, routeSyntheticMessagingEvent } from "./messagingGatewayProjection";
import {
  buildMessagingRemoteSurfaceCommandPreview,
  messagingRemoteSurfaceCommandAppliedResult,
  messagingRemoteSurfaceCommandBindingUpdate,
  messagingRemoteSurfaceCommandPreviewText,
  messagingRemoteSurfaceCommandResultProjection,
  messagingRemoteSurfaceCommandResultText,
  messagingRemoteSurfaceCommandWorkflowActionRequest,
  messagingRemoteSurfaceCommandWorkflowCreateRequest,
} from "./messagingRemoteSurfaceCommands";
import { MessagingGatewayRunner } from "./messagingGatewayRunner";
import { createDefaultMessagingProviderRegistry } from "./messagingGatewayRegistry";

describe("messaging gateway remote surface workflow creation commands", () => {
  it("previews and projects approval-gated workflow creation commands", () => {
    const providers = createDefaultMessagingProviderRegistry();
    const stateRoot = mkdtempSync(join(tmpdir(), "ambient-messaging-workflow-create-"));
    const bindings = createMessagingBindingStore({
      stateRoot,
      providers,
      now: () => new Date("2026-05-10T00:00:00.000Z"),
    });
    const runner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-10T00:00:03.000Z"),
    });
    const surface = buildRuntimeSurfaceSnapshot({
      workspace: {
        name: "ambientCoder",
        path: "/workspace",
        statePath: stateRoot,
        sessionPath: join(stateRoot, "sessions"),
      },
      activeThreadId: "thread-remote",
      threads: [
        {
          id: "thread-remote",
          title: "Remote thread settings target",
          workspacePath: "/workspace",
          createdAt: "2026-05-10T00:00:00.000Z",
          updatedAt: "2026-05-10T00:00:01.000Z",
          lastReadAt: "2026-05-10T00:00:01.000Z",
          lastMessagePreview: "Ready.",
          permissionMode: "workspace",
          collaborationMode: "agent",
          model: "zai-org/GLM-5.1-FP8",
          thinkingLevel: "medium",
        },
      ],
      workflowFolders: [],
    });

    try {
      bindings.create({
        providerId: "telegram-tdlib",
        authProfileId: "owner-profile",
        conversationId: "owner-chat",
        purpose: "remote_ambient_surface",
        ownerUserId: "owner-1",
        ambientSurface: "projects",
      });
      const dispatch = runner.dispatchSynthetic({
        bindings: bindings.list(),
        surface,
        event: {
          id: "event-create-workflow",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-chat",
          sender: { id: "owner-1" },
          text: "create workflow Remote status workflow :: Track the Remote Ambient Surface gateway status and summarize blockers.",
          receivedAt: "2026-05-10T00:00:02.000Z",
        },
      });
      const preview = buildMessagingRemoteSurfaceCommandPreview({
        toolInput: { queuedProjectionId: dispatch.queuedProjection.id },
        bindings: bindings.list(),
        runtimeStatus: runner.runtimeStatus(),
        surface,
      });

      expect(preview).toMatchObject({
        status: "ready",
        commandKind: "create_workflow",
        approvalRequired: true,
        wouldPersistBinding: true,
        targetSurface: "workflow_agents",
        targetWorkflowCreate: {
          title: "Remote status workflow",
          initialRequest: "Track the Remote Ambient Surface gateway status and summarize blockers.",
        },
      });
      expect(messagingRemoteSurfaceCommandBindingUpdate(preview)).toBeUndefined();
      expect(messagingRemoteSurfaceCommandWorkflowCreateRequest(preview)).toMatchObject({
        title: "Remote status workflow",
        initialRequest: "Track the Remote Ambient Surface gateway status and summarize blockers.",
      });
      expect(messagingRemoteSurfaceCommandPreviewText(preview)).toContain("New workflow: Remote status workflow");

      const updatedBinding = bindings.updateRemoteSurfaceScope({
        bindingId: preview.binding!.id,
        ambientSurface: "workflow_agents",
        workflowId: "workflow-created",
        reason: "remote-surface-command:create_workflow",
      });
      const createdSurface = buildRuntimeSurfaceSnapshot({
        workspace: {
          name: "ambientCoder",
          path: "/workspace",
          statePath: stateRoot,
          sessionPath: join(stateRoot, "sessions"),
        },
        threads: [],
        workflowFolders: [
          {
            id: "folder-1",
            name: "Workflows",
            kind: "custom",
            createdAt: "2026-05-10T00:00:00.000Z",
            updatedAt: "2026-05-10T00:00:01.000Z",
            threads: [
              {
                id: "workflow-created",
                folderId: "folder-1",
                projectName: "ambientCoder",
                projectPath: "/workspace",
                title: "Remote status workflow",
                phase: "discovery",
                initialRequest: "Track the Remote Ambient Surface gateway status and summarize blockers.",
                preview: "Track the Remote Ambient Surface gateway status and summarize blockers.",
                status: "Discovery",
                traceMode: "production",
                discoveryQuestions: [],
                badges: [],
                createdAt: "2026-05-10T00:00:00.000Z",
                updatedAt: "2026-05-10T00:00:01.000Z",
              },
            ],
          },
        ],
      });
      const createdWorkflow = createdSurface.workflowAgents[0];
      const projection = messagingRemoteSurfaceCommandResultProjection({
        preview,
        bindings: bindings.list(),
        surface: createdSurface,
      });
      const result = messagingRemoteSurfaceCommandAppliedResult({
        preview,
        approvalRecorded: true,
        updatedBinding,
        ...(createdWorkflow ? { createdWorkflow } : {}),
        projection,
      });

      expect(result).toMatchObject({
        applyStatus: "applied",
        applied: true,
        createdWorkflow: { id: "workflow-created", title: "Remote status workflow" },
        updatedBinding: {
          ambientSurface: "workflow_agents",
          workflowId: "workflow-created",
        },
        projection: {
          kind: "workflow_status",
          title: "Remote status workflow",
        },
      });
      expect(messagingRemoteSurfaceCommandResultText(result)).toContain("Created workflow: Remote status workflow");

      const explorationDispatch = runner.dispatchSynthetic({
        bindings: bindings.list(),
        surface: createdSurface,
        event: {
          id: "event-run-exploration",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-chat",
          sender: { id: "owner-1" },
          text: "run exploration",
          receivedAt: "2026-05-10T00:00:03.000Z",
        },
      });
      const explorationPreview = buildMessagingRemoteSurfaceCommandPreview({
        toolInput: { queuedProjectionId: explorationDispatch.queuedProjection.id },
        bindings: bindings.list(),
        runtimeStatus: runner.runtimeStatus(),
        surface: createdSurface,
      });
      expect(explorationPreview).toMatchObject({
        status: "ready",
        commandKind: "workflow_action",
        approvalRequired: true,
        wouldPersistBinding: true,
        targetSurface: "workflow_agents",
        targetWorkflow: { id: "workflow-created", title: "Remote status workflow" },
        targetWorkflowAction: {
          action: "run_exploration",
          workflowThreadId: "workflow-created",
          workflowTitle: "Remote status workflow",
        },
      });
      expect(messagingRemoteSurfaceCommandWorkflowActionRequest(explorationPreview)).toMatchObject({
        action: "run_exploration",
        workflowThreadId: "workflow-created",
      });
      expect(messagingRemoteSurfaceCommandPreviewText(explorationPreview)).toContain("Workflow action: run exploration");
      const explorationResult = messagingRemoteSurfaceCommandAppliedResult({
        preview: explorationPreview,
        approvalRecorded: true,
        updatedBinding,
        workflowActionResult: {
          action: "run_exploration",
          workflowThreadId: "workflow-created",
          workflowTitle: "Remote status workflow",
          changed: true,
          traceId: "trace-1",
          graphSnapshotId: "graph-1",
          text: "Workflow Agent exploration completed\nTrace: trace-1\nGraph snapshot: graph-1",
        },
        projection: messagingRemoteSurfaceCommandResultProjection({
          preview: explorationPreview,
          bindings: bindings.list(),
          surface: createdSurface,
        }),
      });
      expect(explorationResult).toMatchObject({
        applyStatus: "applied",
        workflowActionResult: {
          action: "run_exploration",
          traceId: "trace-1",
        },
      });
      expect(messagingRemoteSurfaceCommandResultText(explorationResult)).toContain(
        "Workflow action result: exploration; changed=yes; trace=trace-1; graph=graph-1",
      );

      const compileDispatch = runner.dispatchSynthetic({
        bindings: bindings.list(),
        surface: createdSurface,
        event: {
          id: "event-compile-workflow",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-chat",
          sender: { id: "owner-1" },
          text: "compile from exploration",
          receivedAt: "2026-05-10T00:00:04.000Z",
        },
      });
      const compilePreview = buildMessagingRemoteSurfaceCommandPreview({
        toolInput: { queuedProjectionId: compileDispatch.queuedProjection.id },
        bindings: bindings.list(),
        runtimeStatus: runner.runtimeStatus(),
        surface: createdSurface,
      });
      expect(compilePreview).toMatchObject({
        status: "ready",
        commandKind: "workflow_action",
        approvalRequired: true,
        targetWorkflowAction: {
          action: "compile_preview",
          workflowThreadId: "workflow-created",
        },
      });
      expect(messagingRemoteSurfaceCommandPreviewText(compilePreview)).toContain("Workflow action: compile preview");

      const reviewSurface = buildRuntimeSurfaceSnapshot({
        workspace: {
          name: "ambientCoder",
          path: "/workspace",
          statePath: stateRoot,
          sessionPath: join(stateRoot, "sessions"),
        },
        threads: [],
        workflowFolders: [
          {
            id: "folder-1",
            name: "Workflows",
            kind: "custom",
            createdAt: "2026-05-10T00:00:00.000Z",
            updatedAt: "2026-05-10T00:00:01.000Z",
            threads: [
              {
                id: "workflow-created",
                folderId: "folder-1",
                projectName: "ambientCoder",
                projectPath: "/workspace",
                title: "Remote status workflow",
                phase: "ready_for_review",
                initialRequest: "Track the Remote Ambient Surface gateway status and summarize blockers.",
                preview: "Track the Remote Ambient Surface gateway status and summarize blockers.",
                status: "ready_for_preview",
                traceMode: "production",
                activeArtifactId: "artifact-ready",
                latestVersion: {
                  id: "version-ready",
                  workflowThreadId: "workflow-created",
                  artifactId: "artifact-ready",
                  version: 1,
                  sourcePath: "/workspace/workflows/remote-status.js",
                  repoPath: "/workspace",
                  status: "ready_for_review",
                  createdBy: "compiler",
                  createdAt: "2026-05-10T00:00:02.000Z",
                },
                latestRun: {
                  id: "run-preview",
                  status: "previewed",
                  startedAt: "2026-05-10T00:00:02.000Z",
                  updatedAt: "2026-05-10T00:00:03.000Z",
                },
                discoveryQuestions: [],
                badges: [],
                createdAt: "2026-05-10T00:00:00.000Z",
                updatedAt: "2026-05-10T00:00:03.000Z",
              },
            ],
          },
        ],
      });
      expect(reviewSurface.workflowAgents[0]?.nextCommands).toEqual(
        expect.arrayContaining(["approve workflow preview", "reject workflow preview"]),
      );
      const approveDispatch = runner.dispatchSynthetic({
        bindings: bindings.list(),
        surface: reviewSurface,
        event: {
          id: "event-approve-workflow",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-chat",
          sender: { id: "owner-1" },
          text: "approve workflow preview",
          receivedAt: "2026-05-10T00:00:05.000Z",
        },
      });
      const approvePreview = buildMessagingRemoteSurfaceCommandPreview({
        toolInput: { queuedProjectionId: approveDispatch.queuedProjection.id },
        bindings: bindings.list(),
        runtimeStatus: runner.runtimeStatus(),
        surface: reviewSurface,
      });
      expect(approvePreview).toMatchObject({
        status: "ready",
        commandKind: "workflow_action",
        approvalRequired: true,
        targetWorkflowAction: {
          action: "approve_artifact",
          workflowThreadId: "workflow-created",
          artifactId: "artifact-ready",
        },
      });
      expect(messagingRemoteSurfaceCommandPreviewText(approvePreview)).toContain("Workflow action: approve workflow preview");
      const approveResult = messagingRemoteSurfaceCommandAppliedResult({
        preview: approvePreview,
        approvalRecorded: true,
        workflowActionResult: {
          action: "approve_artifact",
          workflowThreadId: "workflow-created",
          workflowTitle: "Remote status workflow",
          changed: true,
          artifactId: "artifact-ready",
          artifactStatus: "approved",
          text: "Workflow preview approved",
        },
      });
      expect(messagingRemoteSurfaceCommandResultText(approveResult)).toContain(
        "Workflow action result: artifact approved; changed=yes; artifact=artifact-ready; artifactStatus=approved",
      );

      const runningSurface = buildRuntimeSurfaceSnapshot({
        workspace: {
          name: "ambientCoder",
          path: "/workspace",
          statePath: stateRoot,
          sessionPath: join(stateRoot, "sessions"),
        },
        threads: [],
        workflowFolders: [
          {
            id: "folder-1",
            name: "Workflows",
            kind: "custom",
            createdAt: "2026-05-10T00:00:00.000Z",
            updatedAt: "2026-05-10T00:00:01.000Z",
            threads: [
              {
                id: "workflow-created",
                folderId: "folder-1",
                projectName: "ambientCoder",
                projectPath: "/workspace",
                title: "Remote status workflow",
                phase: "running",
                initialRequest: "Track the Remote Ambient Surface gateway status and summarize blockers.",
                preview: "Track the Remote Ambient Surface gateway status and summarize blockers.",
                status: "running",
                traceMode: "production",
                activeArtifactId: "artifact-ready",
                latestRun: {
                  id: "run-running",
                  status: "running",
                  startedAt: "2026-05-10T00:00:06.000Z",
                  updatedAt: "2026-05-10T00:00:07.000Z",
                },
                discoveryQuestions: [],
                badges: [],
                createdAt: "2026-05-10T00:00:00.000Z",
                updatedAt: "2026-05-10T00:00:07.000Z",
              },
            ],
          },
        ],
      });
      expect(runningSurface.workflowAgents[0]?.nextCommands).toEqual(expect.arrayContaining(["cancel workflow"]));
      const cancelDispatch = runner.dispatchSynthetic({
        bindings: bindings.list(),
        surface: runningSurface,
        event: {
          id: "event-cancel-workflow",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-chat",
          sender: { id: "owner-1" },
          text: "cancel workflow",
          receivedAt: "2026-05-10T00:00:08.000Z",
        },
      });
      const cancelPreview = buildMessagingRemoteSurfaceCommandPreview({
        toolInput: { queuedProjectionId: cancelDispatch.queuedProjection.id },
        bindings: bindings.list(),
        runtimeStatus: runner.runtimeStatus(),
        surface: runningSurface,
      });
      expect(cancelPreview).toMatchObject({
        status: "ready",
        commandKind: "workflow_action",
        approvalRequired: true,
        targetWorkflowAction: {
          action: "cancel_run",
          workflowThreadId: "workflow-created",
          runId: "run-running",
        },
      });
      expect(messagingRemoteSurfaceCommandPreviewText(cancelPreview)).toContain("Workflow action: cancel workflow");

      const recoverySurface = buildRuntimeSurfaceSnapshot({
        workspace: {
          name: "ambientCoder",
          path: "/workspace",
          statePath: stateRoot,
          sessionPath: join(stateRoot, "sessions"),
        },
        threads: [],
        workflowFolders: [
          {
            id: "folder-1",
            name: "Workflows",
            kind: "custom",
            createdAt: "2026-05-10T00:00:00.000Z",
            updatedAt: "2026-05-10T00:00:01.000Z",
            threads: [
              {
                id: "workflow-created",
                folderId: "folder-1",
                projectName: "ambientCoder",
                projectPath: "/workspace",
                title: "Remote status workflow",
                phase: "failed",
                initialRequest: "Track the Remote Ambient Surface gateway status and summarize blockers.",
                preview: "Track the Remote Ambient Surface gateway status and summarize blockers.",
                status: "failed",
                traceMode: "production",
                activeArtifactId: "artifact-ready",
                latestRun: {
                  id: "run-failed",
                  status: "failed",
                  startedAt: "2026-05-10T00:00:09.000Z",
                  updatedAt: "2026-05-10T00:00:10.000Z",
                  completedAt: "2026-05-10T00:00:10.000Z",
                },
                graph: {
                  id: "graph-1",
                  workflowThreadId: "workflow-created",
                  version: 1,
                  source: "compile",
                  summary: "Classify records.",
                  nodes: [{ id: "classify", type: "model_call", label: "Classify", retryPolicy: "Retry with same retained input." }],
                  edges: [],
                  createdAt: "2026-05-10T00:00:02.000Z",
                },
                discoveryQuestions: [],
                badges: [],
                createdAt: "2026-05-10T00:00:00.000Z",
                updatedAt: "2026-05-10T00:00:10.000Z",
              },
            ],
          },
        ],
        workflowRecoveryEvents: [
          {
            id: "event-failed",
            runId: "run-failed",
            type: "ambient.call.error",
            message: "schema mismatch",
            graphNodeId: "classify",
            graphNodeLabel: "Classify",
            graphNodeType: "model_call",
            createdAt: "2026-05-10T00:00:10.000Z",
            retryEligible: true,
            retryLabel: "Retry step",
            retryReasons: ["Retry is eligible when the same input is retained or can be reconstructed from checkpoints."],
            resumeEligible: false,
            resumeReasons: ["Resume from checkpoint requires at least one retained workflow checkpoint."],
            skipEligible: false,
            skipReasons: ["Skip item requires a failed event with a retained item key."],
            commandExamples: ["retry failed step"],
          },
        ],
      });
      expect(recoverySurface.workflowAgents[0]?.nextCommands).toEqual(expect.arrayContaining(["retry failed step"]));
      expect(runtimeSurfaceSnapshotText(recoverySurface)).toContain("Recovery events:");
      const recoveryProjection = routeSyntheticMessagingEvent({
        bindings: bindings.list(),
        surface: recoverySurface,
        event: {
          id: "event-workflow-status",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-chat",
          sender: { id: "owner-1" },
          text: "status",
          receivedAt: "2026-05-10T00:00:11.000Z",
        },
      });
      expect(messagingProjectionText(recoveryProjection.projection)).toContain("retry failed step");
      const recoveryDispatch = runner.dispatchSynthetic({
        bindings: bindings.list(),
        surface: recoverySurface,
        event: {
          id: "event-retry-workflow",
          providerId: "telegram-tdlib",
          authProfileId: "owner-profile",
          conversationId: "owner-chat",
          sender: { id: "owner-1" },
          text: "retry failed step",
          receivedAt: "2026-05-10T00:00:12.000Z",
        },
      });
      const recoveryPreview = buildMessagingRemoteSurfaceCommandPreview({
        toolInput: { queuedProjectionId: recoveryDispatch.queuedProjection.id },
        bindings: bindings.list(),
        runtimeStatus: runner.runtimeStatus(),
        surface: recoverySurface,
      });
      expect(recoveryPreview).toMatchObject({
        status: "ready",
        commandKind: "workflow_action",
        approvalRequired: true,
        targetWorkflowAction: {
          action: "retry_failed_step",
          workflowThreadId: "workflow-created",
          runId: "run-failed",
          eventId: "event-failed",
          graphNodeId: "classify",
          recoveryAction: "retry_step",
        },
      });
      expect(messagingRemoteSurfaceCommandPreviewText(recoveryPreview)).toContain("Workflow action: retry failed step");
      const recoveryResult = messagingRemoteSurfaceCommandAppliedResult({
        preview: recoveryPreview,
        approvalRecorded: true,
        workflowActionResult: {
          action: "retry_failed_step",
          workflowThreadId: "workflow-created",
          workflowTitle: "Remote status workflow",
          changed: true,
          runId: "run-recovered",
          runStatus: "succeeded",
          text: "Workflow recovery run completed\nRecovery action: retry_step",
        },
      });
      expect(messagingRemoteSurfaceCommandResultText(recoveryResult)).toContain(
        "Workflow action result: recovery retry; changed=yes; run=run-recovered; runStatus=succeeded",
      );
    } finally {
      rmSync(stateRoot, { recursive: true, force: true });
    }
  });
});
