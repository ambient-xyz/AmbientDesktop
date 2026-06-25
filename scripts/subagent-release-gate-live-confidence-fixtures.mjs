export function liveConfidenceArtifact() {
  return {
    __artifactPath: "test-results/subagent-live-confidence/latest.json",
    schemaVersion: "ambient-subagent-live-confidence-evidence-v3",
    sliceId: "subagent-wait-approval-bridge",
    sliceKind: "pi_tool_prompt",
    status: "passed",
    hypothesis: "A GMI-backed parent can spawn and wait on a required child.",
    expectedObservation: "Parent blocks until the child produces a synthesizable result.",
    actualOutcome: "Parent stayed blocked and resumed after the child result.",
    confidenceDelta: "increased",
    followUp: "Keep the artifact with the slice evidence.",
    closeoutAnswer: {
      kind: "saw_live",
      summary: "I saw the parent block on a required child and resume after the child result.",
    },
    startedAt: "2026-06-05T00:45:00.000Z",
    completedAt: "2026-06-05T00:50:00.000Z",
    provider: {
      kind: "gmi-cloud",
      providerId: "gmi-cloud",
      modelRuntimeId: "zai-org/GLM-5.1-FP8",
      usingGmiOverride: true,
    },
    featureFlagSnapshot: {
      ambientSubagentsEnabled: true,
      source: "launch_arg",
    },
    capabilitiesObserved: ["streaming", "tool_calling"],
    probes: [
      {
        label: "GMI-backed parent spawned and waited on a required child.",
        command: "AMBIENT_PROVIDER=gmi-cloud AMBIENT_SUBAGENT_LIVE=1 pnpm run test:subagents:live",
      },
    ],
    artifacts: [
      {
        label: "live smoke report",
        path: "test-results/subagent-live-smoke/latest.json",
        kind: "json",
      },
    ],
    observations: [
      {
        label: "parent wait",
        result: "Parent stayed blocked until the child produced a synthesizable result.",
      },
    ],
    classifiedBlockers: [],
    productIssues: [],
  };
}

export function childAuthorityLiveConfidenceArtifact() {
  return {
    __artifactPath: "test-results/subagent-live-confidence/child-authority-latest.json",
    schemaVersion: "ambient-subagent-live-confidence-evidence-v3",
    sliceId: "subagent-child-authority-live-dogfood",
    sliceKind: "child_authority",
    status: "passed",
    hypothesis:
      "A live child session can inherit parent authority roots, narrow them by launch policy, and route delegated reads plus approval requests through child-scoped runtime ownership.",
    expectedObservation:
      "The authority confidence report includes long_context_process authority-root proof, file approval forwarding, and browser approval forwarding with no denied-content leakage.",
    actualOutcome:
      "Passed: proved long_context_process authority for long-context-run, child file approval approval-run, and child browser approval browser-run.",
    confidenceDelta: "increased",
    followUp: "Keep child authority confidence in the required-live release gate.",
    closeoutAnswer: {
      kind: "saw_live",
      summary: "I saw child authority dogfood prove delegated reads and parent-forwarded approvals.",
    },
    startedAt: "2026-06-05T00:45:00.000Z",
    completedAt: "2026-06-05T00:50:00.000Z",
    provider: {
      kind: "gmi-cloud",
      providerId: "gmi-cloud",
      usingGmiOverride: true,
    },
    featureFlagSnapshot: {
      ambientSubagentsEnabled: true,
      source: "test_override",
    },
    capabilitiesObserved: [
      "delegated_tool_authority",
      "long_context_authority_roots",
      "document_root_inheritance",
      "native_pdf_office_read",
      "parent_approval_forwarding",
      "child_approval_pause",
      "parent_blocking_resume",
      "child_scoped_approval",
      "browser_authority",
      "browser_approval_resume",
      "secret_non_leakage",
      "least_privilege_child_policy",
    ],
    maturityAssertions: [
      {
        id: "child_long_context_authority",
        label: "Child delegated long-context authority",
        status: "passed",
        artifactPath: "test-results/subagent-live-smoke/long-context-authority-latest.json",
        capabilities: ["delegated_tool_authority", "long_context_authority_roots", "document_root_inheritance", "secret_non_leakage"],
        evidence: [
          "childThreadId: long-context-child",
          "readRoots: text, pdf, office",
          "writeDecision: deny",
          "deniedContentLeaked: false",
        ],
      },
      {
        id: "child_file_approval_authority",
        label: "Child file approval authority",
        status: "passed",
        artifactPath: "test-results/subagent-live-smoke/approval-authority-latest.json",
        capabilities: [
          "parent_approval_forwarding",
          "child_approval_pause",
          "parent_blocking_resume",
          "child_scoped_approval",
          "secret_non_leakage",
        ],
        evidence: [
          "childThreadId: approval-child",
          "requestedToolId: read",
          "approvalForwardedToParent: true",
          "parentRemainedBlocked: true",
        ],
      },
      {
        id: "child_browser_approval_authority",
        label: "Child browser approval authority",
        status: "passed",
        artifactPath: "test-results/subagent-live-smoke/browser-approval-latest.json",
        capabilities: [
          "browser_authority",
          "parent_approval_forwarding",
          "child_approval_pause",
          "parent_blocking_resume",
          "child_scoped_approval",
          "browser_approval_resume",
        ],
        evidence: [
          "childThreadId: browser-child",
          "requestedToolId: browser_content",
          "approvalScope: always_thread",
          "resumeSynthesisAllowed: false",
        ],
      },
    ],
    probes: [
      {
        label: "GMI-backed child authority live dogfood",
        command: "pnpm run test:subagents:live:authority",
      },
    ],
    artifacts: [
      {
        label: "child long-context authority proof",
        path: "test-results/subagent-live-smoke/long-context-authority-latest.json",
        kind: "json",
      },
      {
        label: "child file approval authority proof",
        path: "test-results/subagent-live-smoke/approval-authority-latest.json",
        kind: "json",
      },
      {
        label: "child browser approval authority proof",
        path: "test-results/subagent-live-smoke/browser-approval-latest.json",
        kind: "json",
      },
    ],
    observations: [
      {
        label: "long_context_process authority",
        result: "Child read all granted document roots and denied sibling content without leakage.",
      },
      {
        label: "child file approval",
        result: "Child file read approval paused child work and surfaced in the parent mailbox.",
      },
      {
        label: "child browser approval",
        result: "Child browser approval used a child-thread scoped approval and kept parent synthesis blocked.",
      },
    ],
    classifiedBlockers: [],
    productIssues: [],
  };
}

export function workflowLiveConfidenceArtifact() {
  return {
    __artifactPath: "test-results/subagent-live-confidence/workflow-symphony-latest.json",
    schemaVersion: "ambient-subagent-live-confidence-evidence-v3",
    sliceId: "workflow-symphony-live-dogfood",
    sliceKind: "workflow_symphony",
    status: "passed",
    hypothesis:
      "A real GMI-backed workflow run plus broader Workflow Agent UI dogfood and callable workflow proof artifacts can execute safe workflow paths, preserve workflow thread/artifact/run links, prove child-originated mutating workers stay scoped, and rehydrate task/artifact telemetry after restart.",
    expectedObservation:
      "The workflow confidence report includes a succeeded live workflow run, a passed multi-scenario Workflow Agent UI dogfood matrix, child-originated mutating callable workflow dogfood with parent blocking and denied-scope proof, and callable workflow task/artifact/run/progress/usage rehydration evidence.",
    actualOutcome:
      "Passed: succeeded workflow run workflow-run for workflow thread workflow-thread; Workflow Agent UI dogfood covered 2 broader scenario(s); callable workflow task workflow-task-1 proved mutating child dogfood and rehydrated task/artifact/run telemetry.",
    confidenceDelta: "increased",
    followUp: "Keep the workflow live artifact with the slice evidence.",
    closeoutAnswer: {
      kind: "saw_live",
      summary: "I saw workflow/Symphony dogfood produce a workflow/Symphony confidence proof set.",
    },
    startedAt: "2026-06-05T00:45:00.000Z",
    completedAt: "2026-06-05T00:50:00.000Z",
    provider: {
      kind: "gmi-cloud",
      providerId: "gmi-cloud",
      usingGmiOverride: true,
    },
    featureFlagSnapshot: {
      ambientSubagentsEnabled: true,
      source: "test_override",
    },
    capabilitiesObserved: [
      "workflow_launch",
      "ambient_runtime_call",
      "artifact_link",
      "checkpoint_output",
      "mutating_child_workflow",
      "child_scoped_approval",
      "isolated_child_worktree",
      "parent_blocking_workflow",
      "denied_workflow_scope",
      "workflow_task_rehydration",
      "broader_live_workflow_runs",
      "workflow_agent_ui_dogfood",
      "workflow_output_evidence",
      "electron_workflow_dogfood",
    ],
    maturityAssertions: [
      {
        id: "live_workflow_run",
        label: "Live workflow run",
        status: "passed",
        artifactPath: "test-results/workflow-local-file-run-dogfood/latest.json",
        capabilities: ["workflow_launch", "ambient_runtime_call", "artifact_link", "checkpoint_output"],
        evidence: ["workflowRunId: workflow-run", "workflowThreadId: workflow-thread", "checkpoint: present", "succeededModelCalls: 1"],
      },
      {
        id: "broader_workflow_ui_dogfood",
        label: "Broader Workflow Agent UI dogfood",
        status: "passed",
        artifactPath: "test-results/workflow-agent-thread-ui-dogfood/matrix-latest.json",
        capabilities: ["broader_live_workflow_runs", "workflow_agent_ui_dogfood", "workflow_output_evidence", "electron_workflow_dogfood"],
        evidence: [
          "suite: phase0-live",
          "scenarios: vocabulary-quiz, local-file-classifier",
          "passedScenarios: 2",
          "totalModelCalls: 3",
          "totalOutputSignals: 5",
        ],
      },
      {
        id: "child_mutating_workflow",
        label: "Child-originated mutating workflow",
        status: "passed",
        artifactPath: "test-results/callable-workflow-dogfood/latest.json",
        capabilities: [
          "mutating_child_workflow",
          "child_scoped_approval",
          "isolated_child_worktree",
          "parent_blocking_workflow",
          "denied_workflow_scope",
        ],
        evidence: [
          "taskId: workflow-task-1",
          "subagentRunId: subagent-run-1",
          "approvalScope: this_child_thread",
          "worktreeStatus: active",
          "stagedRelativePath: src/feature.txt",
          "deniedScope: workflow.call",
        ],
      },
      {
        id: "workflow_task_artifact_rehydration",
        label: "Workflow task and artifact rehydration",
        status: "passed",
        artifactPath: "test-results/callable-workflow-rehydration/latest.json",
        capabilities: ["workflow_task_rehydration", "artifact_link", "checkpoint_output"],
        evidence: [
          "taskId: workflow-task-1",
          "workflowArtifactId: workflow-artifact-1",
          "workflowRunId: workflow-run-1",
          "workflowThreadId: workflow-thread-1",
          "progressEvents: 4",
          "tokenCount: 21",
        ],
      },
    ],
    probes: [
      {
        label: "GMI-backed workflow/Symphony live dogfood",
        command: "pnpm run test:subagents:live-confidence:workflow-prereqs",
      },
    ],
    artifacts: [
      {
        label: "workflow/Symphony confidence proof set",
        path: "test-results/workflow-local-file-run-dogfood/latest.json",
        kind: "json",
      },
      {
        label: "Workflow Agent UI dogfood matrix proof",
        path: "test-results/workflow-agent-thread-ui-dogfood/matrix-latest.json",
        kind: "json",
      },
      {
        label: "callable workflow mutating child dogfood proof",
        path: "test-results/callable-workflow-dogfood/latest.json",
        kind: "json",
      },
      {
        label: "callable workflow task rehydration proof",
        path: "test-results/callable-workflow-rehydration/latest.json",
        kind: "json",
      },
    ],
    observations: [
      {
        label: "live workflow dogfood artifact",
        result: "Succeeded workflow run workflow-run for workflow thread workflow-thread.",
      },
      {
        label: "Workflow Agent UI dogfood matrix artifact",
        result: "Passed 2 broader Workflow Agent UI scenario(s): vocabulary-quiz, local-file-classifier.",
      },
      {
        label: "callable workflow mutating child dogfood artifact",
        result: "Child subagent-run-1 ran blocking task workflow-task-1 and proved denied workflow scope.",
      },
      {
        label: "callable workflow task rehydration artifact",
        result: "Rehydrated task workflow-task-1 with artifact workflow-artifact-1, run workflow-run-1, 4 progress events, and 21 tokens.",
      },
    ],
    classifiedBlockers: [],
    productIssues: [],
  };
}

export function workflowBroaderLiveConfidenceArtifact() {
  const artifact = workflowLiveConfidenceArtifact();
  return {
    ...artifact,
    __artifactPath: "test-results/subagent-live-confidence/workflow-symphony-broader-latest.json",
    sliceId: "workflow-symphony-broader-live-dogfood",
    sliceKind: "workflow_symphony_broader",
    hypothesis:
      "A real GMI-backed workflow run plus broader phase-1 Workflow Agent UI dogfood and callable workflow proof artifacts can execute safe workflow paths, preserve workflow thread/artifact/run links, prove child-originated mutating workers stay scoped, and rehydrate task/artifact telemetry after restart.",
    expectedObservation:
      "The broader workflow confidence report includes a succeeded live workflow run, a passed phase-1 multi-scenario Workflow Agent UI dogfood matrix, child-originated mutating callable workflow dogfood with parent blocking and denied-scope proof, and callable workflow task/artifact/run/progress/usage rehydration evidence.",
    actualOutcome:
      "Passed: succeeded workflow run workflow-run for workflow thread workflow-thread; Workflow Agent UI dogfood covered 4 broader phase-1 scenario(s); callable workflow task workflow-task-1 proved mutating child dogfood and rehydrated task/artifact/run telemetry.",
    closeoutAnswer: {
      kind: "saw_live",
      summary: "I saw broader workflow/Symphony dogfood produce a phase-1 workflow/Symphony confidence proof set.",
    },
    capabilitiesObserved: [...artifact.capabilitiesObserved, "phase1_workflow_ui_dogfood"],
    maturityAssertions: artifact.maturityAssertions.map((assertion) =>
      assertion.id === "broader_workflow_ui_dogfood"
        ? {
            ...assertion,
            artifactPath: "test-results/workflow-agent-thread-ui-dogfood/phase1-live-matrix-latest.json",
            evidence: [
              "suite: phase1-live",
              "scenarios: gmail-20-metadata-readonly-validation, downloads-document-categorization, public-source-browser, current-web-recipe-report",
              "passedScenarios: 4",
              "totalModelCalls: 8",
              "totalOutputSignals: 12",
            ],
          }
        : assertion,
    ),
    probes: [
      {
        label: "GMI-backed broader workflow/Symphony live dogfood",
        command: "pnpm run test:subagents:live-confidence:workflow-broader-prereqs",
      },
    ],
    observations: artifact.observations.map((observation) =>
      observation.label === "Workflow Agent UI dogfood matrix artifact"
        ? {
            label: "Workflow Agent UI dogfood matrix artifact",
            result:
              "Passed 4 broader phase-1 Workflow Agent UI scenario(s): gmail-20-metadata-readonly-validation, downloads-document-categorization, public-source-browser, current-web-recipe-report.",
          }
        : observation,
    ),
  };
}
