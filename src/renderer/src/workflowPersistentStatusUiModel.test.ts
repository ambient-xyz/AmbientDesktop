import { describe, expect, it } from "vitest";
import type { WorkflowAgentThreadSummary, WorkflowArtifactSummary, WorkflowCompileProgress, WorkflowRunSummary } from "../../shared/workflowTypes";
import { workflowPersistentStatusModel } from "./workflowPersistentStatusUiModel";

const baseThread: Pick<WorkflowAgentThreadSummary, "phase" | "discoveryQuestions" | "latestVersion" | "activeArtifactId"> = {
  phase: "planned",
  discoveryQuestions: [],
  latestVersion: {
    id: "version-1",
    workflowThreadId: "thread-1",
    artifactId: "artifact-1",
    version: 1,
    sourcePath: "/tmp/workflow.js",
    repoPath: "/tmp",
    status: "approved",
    createdBy: "compiler",
    createdAt: "2026-05-19T00:00:00.000Z",
  },
  activeArtifactId: "artifact-1",
};

const approvedArtifact: Pick<WorkflowArtifactSummary, "status" | "manifest"> = {
  status: "approved",
  manifest: {
    tools: ["browser_navigate"],
    mutationPolicy: "read_only",
  },
};

describe("workflowPersistentStatusModel", () => {
  it("prioritizes deterministic compile failures", () => {
    const compileProgress: WorkflowCompileProgress[] = [
      {
        compileId: "compile-1",
        phase: "failed",
        status: "failed",
        message: "Workflow preview compilation failed.",
        error: "WorkflowProgramIR repair path does not exist: /nodes/3/0/path",
        current: 1,
        total: 1,
        createdAt: "2026-05-19T00:00:00.000Z",
      },
    ];

    expect(workflowPersistentStatusModel({ thread: baseThread, artifact: approvedArtifact, compileProgress })).toMatchObject({
      tone: "blocked",
      title: "Compile is blocked",
      action: { target: "compile" },
    });
  });

  it("routes unanswered discovery questions before compile when no artifact exists", () => {
    const thread: typeof baseThread = {
      ...baseThread,
      activeArtifactId: undefined,
      latestVersion: undefined,
      discoveryQuestions: [
        {
          id: "question-1",
          workflowThreadId: "thread-1",
          category: "scope",
          context: "Need scope",
          question: "Which source should be trusted?",
          choices: [],
          allowFreeform: true,
          createdAt: "2026-05-19T00:00:00.000Z",
        },
      ],
    };

    expect(workflowPersistentStatusModel({ thread })).toMatchObject({
      tone: "blocked",
      title: "Discovery questions block compile",
      action: { target: "discovery" },
    });
  });

  it("surfaces pending discovery access decisions ahead of normal questions", () => {
    const thread: typeof baseThread = {
      ...baseThread,
      activeArtifactId: undefined,
      latestVersion: undefined,
      discoveryQuestions: [
        {
          id: "question-1",
          workflowThreadId: "thread-1",
          category: "data_sources",
          context: "Need email access",
          question: "May I inspect Gmail labels?",
          choices: [],
          allowFreeform: true,
          accessRequests: [
            {
              id: "access-1",
              capability: "connector_metadata",
              actionKind: "connector_metadata_read",
              targetKind: "connector",
              targetLabel: "Gmail",
              targetHash: "hash",
              reason: "Find the inbox labels.",
              auditDetail: "Gmail metadata read",
              risk: "plugin-tool",
              reusableScopes: ["workflow_thread"],
              recommendedResponse: "allow_once",
              status: "pending",
            },
          ],
          createdAt: "2026-05-19T00:00:00.000Z",
        },
      ],
    };

    expect(workflowPersistentStatusModel({ thread })).toMatchObject({
      tone: "blocked",
      title: "Discovery needs an access decision",
      action: { target: "discovery" },
    });
  });

  it("explains why unapproved previews are not ready for unattended use", () => {
    expect(
      workflowPersistentStatusModel({
        thread: baseThread,
        artifact: {
          ...approvedArtifact,
          status: "ready_for_preview",
        },
      }),
    ).toMatchObject({
      tone: "warning",
      title: "Workflow preview needs approval",
      action: { target: "overview" },
    });
  });

  it("does not let stale compile progress hide a newer completed run", () => {
    const latestRun: Pick<WorkflowRunSummary, "status" | "updatedAt" | "providerHealth" | "error"> = {
      status: "succeeded",
      updatedAt: "2026-05-19T00:02:00.000Z",
    };
    const compileProgress: WorkflowCompileProgress[] = [
      {
        compileId: "compile-1",
        phase: "model",
        status: "running",
        message: "Receiving workflow program IR repair operations.",
        current: 3,
        total: 7,
        createdAt: "2026-05-19T00:01:00.000Z",
      },
    ];

    expect(
      workflowPersistentStatusModel({
        thread: baseThread,
        artifact: approvedArtifact,
        latestRun,
        compileActive: true,
        compileProgress,
      }),
    ).toMatchObject({
      tone: "ready",
      title: "Workflow is ready",
    });
  });

  it("keeps a genuinely newer compile visible after an older run", () => {
    const latestRun: Pick<WorkflowRunSummary, "status" | "updatedAt" | "providerHealth" | "error"> = {
      status: "succeeded",
      updatedAt: "2026-05-19T00:01:00.000Z",
    };
    const compileProgress: WorkflowCompileProgress[] = [
      {
        compileId: "compile-2",
        phase: "model",
        status: "running",
        message: "Compiling a revised workflow.",
        current: 3,
        total: 7,
        createdAt: "2026-05-19T00:02:00.000Z",
      },
    ];

    expect(
      workflowPersistentStatusModel({
        thread: baseThread,
        artifact: approvedArtifact,
        latestRun,
        compileActive: true,
        compileProgress,
      }),
    ).toMatchObject({
      tone: "running",
      title: "Compile is running",
      detail: "Compiling a revised workflow.",
    });
  });

  it("routes pending runtime input to the run input panel", () => {
    const latestRun: Pick<WorkflowRunSummary, "status" | "updatedAt" | "providerHealth" | "error"> = {
      status: "needs_input",
      updatedAt: new Date().toISOString(),
      providerHealth: {
        status: "ok",
        providerEventCount: 2,
        providerProgressEventCount: 1,
        providerErrorEventCount: 0,
      },
    };

    expect(workflowPersistentStatusModel({ thread: baseThread, artifact: approvedArtifact, latestRun })).toMatchObject({
      tone: "blocked",
      title: "Latest run needs input",
      action: { target: "runs-input" },
    });
  });

  it("keeps ready approved workflows actionable when grants are declared", () => {
    expect(
      workflowPersistentStatusModel({
        thread: baseThread,
        artifact: {
          ...approvedArtifact,
          manifest: {
            ...approvedArtifact.manifest,
            connectors: [
              {
                connectorId: "gmail",
                scopes: ["gmail.readonly"],
                operations: ["search"],
                dataRetention: "redacted_audit",
              },
            ],
          },
        },
      }),
    ).toMatchObject({
      tone: "ready",
      title: "Workflow is ready",
      action: { target: "permissions" },
    });
  });
});
