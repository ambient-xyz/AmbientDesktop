import { describe, expect, it } from "vitest";
import type { ProjectBoardEvent } from "../../shared/projectBoardTypes";
import { defaultProjectBoardClaimAgentId } from "./projectStoreProjectBoardFacade";
import {
  normalizeProjectBoardCardExecutionSessionPolicy,
  normalizeProjectBoardUiMockRole,
  projectBoardCardBlockedByOpenUxMockGate,
  projectBoardCardIsUxMockGate,
  projectBoardCardMatchesRef,
  projectBoardCardMissingRequiredUxMockGate,
  projectBoardCardsWithClaimSummaries,
  projectBoardClaimBlockedTaskIdsForRows,
  projectBoardClaimSummaryFromEvents,
  projectBoardClosedParentForRunFollowUp,
  projectBoardOpenUxMockGateBlocker,
  projectBoardRequiresUiMockApprovalForSynthesisCard,
  projectBoardSynthesisCardRowProtectedFromDraftReplacement,
  projectBoardSynthesisStartFreshCardSnapshot,
  projectBoardUiMockRoleForSynthesisCard,
  projectBoardUxMockGateSatisfied,
} from "./projectBoardMappers";
import { projectBoardCard, projectBoardCardRow } from "./projectBoardMappersTestSupport";

describe("project board mapper coordination", () => {
  it("maps project board claim summaries from persisted events", () => {
    const localAgentId = defaultProjectBoardClaimAgentId();
    const claimEvent = (input: {
      id: string;
      kind: ProjectBoardEvent["kind"];
      cardId: string;
      runId: string;
      agentId: string;
      createdAt: string;
      leaseUntil?: string;
      displayName?: string;
      workspaceBranch?: string;
      baseCommit?: string;
    }): ProjectBoardEvent => ({
      id: input.id,
      boardId: "board-claims",
      kind: input.kind,
      title: "Claim event",
      summary: "Claim event summary",
      entityKind: "project_board_card",
      entityId: input.cardId,
      metadata: {
        cardId: input.cardId,
        runId: input.runId,
        agentId: input.agentId,
        ...(input.leaseUntil ? { leaseUntil: input.leaseUntil } : {}),
        ...(input.displayName ? { displayName: input.displayName } : {}),
        ...(input.workspaceBranch ? { workspaceBranch: input.workspaceBranch } : {}),
        ...(input.baseCommit ? { baseCommit: input.baseCommit } : {}),
      },
      createdAt: input.createdAt,
    });

    const summary = projectBoardClaimSummaryFromEvents([
      claimEvent({
        id: "event-active",
        kind: "card_claimed",
        cardId: "card-active",
        runId: "run-active",
        agentId: localAgentId,
        createdAt: "2026-01-01T00:00:00.000Z",
        leaseUntil: "2099-01-01T00:15:00.000Z",
        displayName: "Local Ambient",
        workspaceBranch: "codex/card-active",
        baseCommit: "abc1234",
      }),
      claimEvent({
        id: "event-expired-claim",
        kind: "card_claimed",
        cardId: "card-expired",
        runId: "run-expired",
        agentId: "remote-agent",
        createdAt: "2026-01-01T00:01:00.000Z",
        leaseUntil: "2099-01-01T00:16:00.000Z",
      }),
      claimEvent({
        id: "event-expired-recorded",
        kind: "card_claim_expired",
        cardId: "card-expired",
        runId: "run-expired",
        agentId: "remote-agent",
        createdAt: "2026-01-01T00:02:00.000Z",
      }),
      claimEvent({
        id: "event-conflict-owner",
        kind: "card_claimed",
        cardId: "card-conflict",
        runId: "run-owner",
        agentId: localAgentId,
        createdAt: "2026-01-01T00:03:00.000Z",
        leaseUntil: "2099-01-01T00:18:00.000Z",
      }),
      claimEvent({
        id: "event-conflict",
        kind: "card_claimed",
        cardId: "card-conflict",
        runId: "run-conflict",
        agentId: "remote-agent",
        createdAt: "2026-01-01T00:04:00.000Z",
        leaseUntil: "2099-01-01T00:19:00.000Z",
      }),
    ]);

    expect(summary.active.find((claim) => claim.cardId === "card-active")).toMatchObject({
      status: "active",
      cardId: "card-active",
      runId: "run-active",
      agentId: localAgentId,
      eventId: "event-active",
      claimedAt: "2026-01-01T00:00:00.000Z",
      leaseUntil: "2099-01-01T00:15:00.000Z",
      displayName: "Local Ambient",
      workspaceBranch: "codex/card-active",
      baseCommit: "abc1234",
      ownedByLocal: true,
    });
    expect(summary.expired).toEqual([
      expect.objectContaining({
        status: "expired",
        cardId: "card-expired",
        runId: "run-expired",
        eventId: "event-expired-recorded",
        expiredAt: "2026-01-01T00:02:00.000Z",
        expirationRecorded: true,
        ownedByLocal: false,
      }),
    ]);
    expect(summary.conflicts).toEqual([
      expect.objectContaining({
        status: "conflict",
        cardId: "card-conflict",
        runId: "run-conflict",
        agentId: "remote-agent",
        blockedByRunId: "run-owner",
        claimedAt: "2026-01-01T00:04:00.000Z",
        ownedByLocal: false,
      }),
    ]);
  });

  it("overlays project board card claim summaries", () => {
    const activeClaim = {
      status: "active" as const,
      cardId: "card-active",
      runId: "run-active",
      agentId: "agent-active",
      eventId: "event-active",
      claimedAt: "2026-01-01T00:00:00.000Z",
      ownedByLocal: true,
    };
    const expiredClaim = {
      status: "expired" as const,
      cardId: "card-expired",
      runId: "run-expired",
      agentId: "agent-expired",
      eventId: "event-expired",
      claimedAt: "2026-01-01T00:01:00.000Z",
      expiredAt: "2026-01-01T00:02:00.000Z",
      ownedByLocal: false,
    };
    const conflict = {
      status: "conflict" as const,
      cardId: "card-active",
      runId: "run-conflict",
      agentId: "agent-conflict",
      eventId: "event-conflict",
      claimedAt: "2026-01-01T00:03:00.000Z",
      blockedByRunId: "run-active",
      ownedByLocal: false,
    };

    const cards = projectBoardCardsWithClaimSummaries(
      [projectBoardCard({ id: "card-active" }), projectBoardCard({ id: "card-expired" }), projectBoardCard({ id: "card-empty" })],
      {
        active: [activeClaim],
        expired: [expiredClaim],
        conflicts: [conflict],
      },
    );

    expect(cards[0]).toMatchObject({ id: "card-active", claim: activeClaim, claimConflicts: [conflict] });
    expect(cards[1]).toMatchObject({ id: "card-expired", claim: expiredClaim });
    expect(cards[1].claimConflicts).toBeUndefined();
    expect(cards[2].claim).toBeUndefined();
    expect(cards[2].claimConflicts).toBeUndefined();
  });

  it("maps project board claim-blocked task ids from card rows", () => {
    const remoteActive = {
      status: "active" as const,
      cardId: "card-remote",
      runId: "run-remote",
      agentId: "remote-agent",
      eventId: "event-remote",
      claimedAt: "2026-01-01T00:00:00.000Z",
      ownedByLocal: false,
    };
    const localActive = {
      status: "active" as const,
      cardId: "card-local",
      runId: "run-local",
      agentId: "local-agent",
      eventId: "event-local",
      claimedAt: "2026-01-01T00:01:00.000Z",
      ownedByLocal: true,
    };
    const conflict = {
      status: "conflict" as const,
      cardId: "card-conflict",
      runId: "run-conflict",
      agentId: "other-agent",
      eventId: "event-conflict",
      claimedAt: "2026-01-01T00:02:00.000Z",
      blockedByRunId: "run-owner",
      ownedByLocal: false,
    };

    expect(
      projectBoardClaimBlockedTaskIdsForRows(
        [
          projectBoardCardRow({ id: "card-remote", orchestration_task_id: "task-remote" }),
          projectBoardCardRow({ id: "card-local", orchestration_task_id: "task-local" }),
          projectBoardCardRow({ id: "card-conflict", orchestration_task_id: "task-conflict" }),
          projectBoardCardRow({ id: "card-no-task", orchestration_task_id: null }),
          projectBoardCardRow({ id: "card-expired", orchestration_task_id: "task-expired" }),
        ],
        {
          active: [remoteActive, localActive],
          expired: [
            {
              status: "expired",
              cardId: "card-expired",
              runId: "run-expired",
              agentId: "remote-agent",
              eventId: "event-expired",
              claimedAt: "2026-01-01T00:03:00.000Z",
              expiredAt: "2026-01-01T00:04:00.000Z",
              ownedByLocal: false,
            },
          ],
          conflicts: [conflict],
        },
      ),
    ).toEqual(["task-remote", "task-conflict"]);
  });

  it("identifies synthesis card rows protected from draft replacement", () => {
    const protectedClaimCardIds = new Set(["claimed-card"]);

    expect(projectBoardSynthesisCardRowProtectedFromDraftReplacement(projectBoardCardRow(), protectedClaimCardIds)).toBe(false);
    expect(projectBoardSynthesisCardRowProtectedFromDraftReplacement(projectBoardCardRow({ status: "ready" }), protectedClaimCardIds)).toBe(
      true,
    );
    expect(
      projectBoardSynthesisCardRowProtectedFromDraftReplacement(
        projectBoardCardRow({ orchestration_task_id: "task-1" }),
        protectedClaimCardIds,
      ),
    ).toBe(true);
    expect(
      projectBoardSynthesisCardRowProtectedFromDraftReplacement(projectBoardCardRow({ id: "claimed-card" }), protectedClaimCardIds),
    ).toBe(true);
    expect(
      projectBoardSynthesisCardRowProtectedFromDraftReplacement(
        projectBoardCardRow({ user_touched_fields_json: JSON.stringify(["title", "unsupported"]) }),
        protectedClaimCardIds,
      ),
    ).toBe(true);
    expect(
      projectBoardSynthesisCardRowProtectedFromDraftReplacement(
        projectBoardCardRow({ user_touched_fields_json: JSON.stringify(["unsupported"]) }),
        protectedClaimCardIds,
      ),
    ).toBe(false);
    for (const candidate_status of ["evidence", "duplicate", "rejected"] as const) {
      expect(
        projectBoardSynthesisCardRowProtectedFromDraftReplacement(projectBoardCardRow({ candidate_status }), protectedClaimCardIds),
      ).toBe(true);
    }
    expect(
      projectBoardSynthesisCardRowProtectedFromDraftReplacement(
        projectBoardCardRow({ pending_pi_update_json: JSON.stringify({ title: "Updated" }) }),
        protectedClaimCardIds,
      ),
    ).toBe(true);
  });

  it("maps start-fresh synthesis card row snapshots", () => {
    expect(
      projectBoardSynthesisStartFreshCardSnapshot(
        projectBoardCardRow({
          id: "card-start-fresh",
          title: "Build the visible shell",
          source_id: "synthesis:shell",
          status: "in_progress",
          candidate_status: "ready_to_create",
          user_touched_fields_json: JSON.stringify(["title", "bogus", "labels"]),
          orchestration_task_id: "task-1",
          execution_thread_id: "thread-1",
          clarification_questions_json: JSON.stringify(["Which shell?", 42, "Which route?"]),
        }),
      ),
    ).toEqual({
      cardId: "card-start-fresh",
      title: "Build the visible shell",
      sourceId: "synthesis:shell",
      status: "in_progress",
      candidateStatus: "ready_to_create",
      userTouchedFields: ["title", "labels"],
      orchestrationTaskId: "task-1",
      executionThreadId: "thread-1",
      clarificationQuestionCount: 2,
    });

    expect(
      projectBoardSynthesisStartFreshCardSnapshot(
        projectBoardCardRow({
          orchestration_task_id: null,
          execution_thread_id: null,
          user_touched_fields_json: "not json",
          clarification_questions_json: null,
        }),
      ),
    ).toMatchObject({
      userTouchedFields: [],
      clarificationQuestionCount: 0,
    });
  });

  it("normalizes project board card metadata values conservatively", () => {
    expect(normalizeProjectBoardUiMockRole("mock_gate")).toBe("mock_gate");
    expect(normalizeProjectBoardUiMockRole("gated_implementation")).toBe("gated_implementation");
    expect(normalizeProjectBoardUiMockRole("unsupported")).toBeUndefined();
    expect(normalizeProjectBoardCardExecutionSessionPolicy("fresh_context")).toBe("fresh_context");
    expect(normalizeProjectBoardCardExecutionSessionPolicy("reuse_card_session")).toBe("reuse_card_session");
    expect(normalizeProjectBoardCardExecutionSessionPolicy(null)).toBe("reuse_card_session");
    expect(normalizeProjectBoardCardExecutionSessionPolicy("unsupported")).toBe("reuse_card_session");
  });

  it("classifies project board UX mock gates and synthesis approval defaults", () => {
    const baseCard = {
      sourceId: "synthesis:shell",
      title: "Create shell",
      description: "Build the shell.",
      candidateStatus: "ready_to_create" as const,
      labels: [],
      blockedBy: [],
      acceptanceCriteria: [],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
      sourceRefs: [],
    };

    expect(projectBoardCardIsUxMockGate({ ...baseCard, sourceId: "synthesis:ux-mock-approval" })).toBe(true);
    expect(projectBoardCardIsUxMockGate({ ...baseCard, labels: ["ux-mock-approval"] })).toBe(true);
    expect(projectBoardCardIsUxMockGate({ ...baseCard, title: "Review UI mock before implementation" })).toBe(true);
    expect(projectBoardCardIsUxMockGate({ ...baseCard, uiMockRole: "mock_gate" })).toBe(true);
    expect(projectBoardCardIsUxMockGate(baseCard)).toBe(false);

    expect(projectBoardUxMockGateSatisfied({ status: "done", candidateStatus: "ready_to_create" })).toBe(true);
    expect(projectBoardUxMockGateSatisfied({ status: "draft", candidateStatus: "evidence" })).toBe(true);
    expect(projectBoardUxMockGateSatisfied({ status: "draft", candidateStatus: "ready_to_create" })).toBe(false);

    expect(projectBoardUiMockRoleForSynthesisCard({ ...baseCard, title: "Review UI mock before implementation" })).toBe("mock_gate");
    expect(projectBoardUiMockRoleForSynthesisCard({ ...baseCard, uiMockRole: "gated_implementation" })).toBe("gated_implementation");
    expect(projectBoardUiMockRoleForSynthesisCard(baseCard)).toBeUndefined();

    expect(projectBoardRequiresUiMockApprovalForSynthesisCard({ ...baseCard, requiresUiMockApproval: false })).toBe(false);
    expect(projectBoardRequiresUiMockApprovalForSynthesisCard({ ...baseCard, uiMockRole: "gated_implementation" })).toBe(true);
    expect(projectBoardRequiresUiMockApprovalForSynthesisCard({ ...baseCard, blockedBy: ["synthesis:ux-mock-approval"] })).toBe(true);
  });

  it("matches project board card references by stable ids and aliases", () => {
    const card = projectBoardCard({
      id: "card-123",
      sourceId: "synthesis:source-123",
      orchestrationTaskId: "task-123",
    });

    expect(projectBoardCardMatchesRef(card, " card-123 ")).toBe(true);
    expect(projectBoardCardMatchesRef(card, "synthesis:source-123")).toBe(true);
    expect(projectBoardCardMatchesRef(card, "task-123")).toBe(true);
    expect(projectBoardCardMatchesRef(card, "card:card-123")).toBe(true);
    expect(projectBoardCardMatchesRef(card, "project-board-card:card-123")).toBe(true);
    expect(projectBoardCardMatchesRef(card, " ")).toBe(false);
    expect(projectBoardCardMatchesRef(card, "other-card")).toBe(false);
  });

  it("finds closed parent cards for run follow-ups", () => {
    const doneParent = projectBoardCard({ id: "card-done-parent", title: "Done parent", status: "done" });
    const reviewDoneParent = projectBoardCard({
      id: "card-review-parent",
      title: "Review parent",
      proofReview: {
        status: "done",
        summary: "Proof accepted.",
        satisfied: [],
        missing: [],
        followUpCardIds: [],
        runId: "run-1",
        reviewedAt: "2026-01-01T00:00:00.000Z",
      },
    });
    const evidenceParent = projectBoardCard({ id: "card-evidence-parent", title: "Evidence parent", candidateStatus: "evidence" });
    const openParent = projectBoardCard({ id: "card-open-parent", title: "Open parent", status: "review" });
    const followUp = projectBoardCard({
      id: "card-follow-up",
      sourceKind: "run_follow_up",
      blockedBy: ["card-open-parent", "card-done-parent"],
    });

    expect(projectBoardClosedParentForRunFollowUp(followUp, [followUp, openParent, doneParent])).toBe(doneParent);
    expect(
      projectBoardClosedParentForRunFollowUp(
        projectBoardCard({ id: "card-proof-follow-up", sourceKind: "run_follow_up", blockedBy: ["card-review-parent"] }),
        [reviewDoneParent],
      ),
    ).toBe(reviewDoneParent);
    expect(
      projectBoardClosedParentForRunFollowUp(
        projectBoardCard({ id: "card-evidence-follow-up", sourceKind: "run_follow_up", blockedBy: ["card-evidence-parent"] }),
        [evidenceParent],
      ),
    ).toBe(evidenceParent);
    const selfFollowUp = projectBoardCard({ id: "self", sourceKind: "run_follow_up", status: "done", blockedBy: ["self"] });
    expect(
      projectBoardClosedParentForRunFollowUp(projectBoardCard({ sourceKind: "board_synthesis", blockedBy: [doneParent.id] }), [doneParent]),
    ).toBeUndefined();
    expect(projectBoardClosedParentForRunFollowUp(selfFollowUp, [selfFollowUp])).toBeUndefined();
    expect(
      projectBoardClosedParentForRunFollowUp(projectBoardCard({ sourceKind: "run_follow_up", blockedBy: [openParent.id] }), [openParent]),
    ).toBeUndefined();
  });

  it("detects project board cards blocked by open or missing UX mock gates", () => {
    const gate = projectBoardCard({
      id: "gate-1",
      sourceId: "synthesis:ux-mock-approval",
      title: "Review UI mock",
      status: "draft",
      candidateStatus: "ready_to_create",
    });
    const implementation = projectBoardCard({
      id: "implementation-1",
      blockedBy: ["card:gate-1"],
      uiMockRole: "gated_implementation",
    });

    expect(projectBoardOpenUxMockGateBlocker(implementation, [gate, implementation])).toBe(gate);
    expect(projectBoardCardBlockedByOpenUxMockGate(implementation, [gate, implementation])).toBe(true);

    const satisfiedGate = projectBoardCard({ ...gate, status: "done" });
    expect(projectBoardOpenUxMockGateBlocker(implementation, [satisfiedGate, implementation])).toBeUndefined();
    expect(projectBoardCardMissingRequiredUxMockGate(implementation, [satisfiedGate, implementation])).toBe(false);
    expect(projectBoardCardBlockedByOpenUxMockGate(implementation, [satisfiedGate, implementation])).toBe(false);

    const missingGate = projectBoardCard({
      id: "implementation-2",
      requiresUiMockApproval: true,
      blockedBy: ["unrelated"],
    });
    expect(projectBoardCardMissingRequiredUxMockGate(missingGate, [missingGate])).toBe(true);
    expect(projectBoardCardBlockedByOpenUxMockGate(missingGate, [missingGate])).toBe(true);
    expect(projectBoardCardMissingRequiredUxMockGate(gate, [gate, missingGate])).toBe(false);
  });
});
