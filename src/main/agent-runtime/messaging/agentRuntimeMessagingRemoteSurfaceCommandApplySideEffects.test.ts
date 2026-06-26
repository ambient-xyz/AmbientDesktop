import { describe, expect, it, vi } from "vitest";

import {
  messagingRemoteSurfaceCommandApplyRuntimeSideEffects,
  messagingRemoteSurfaceCommandApplySideEffectPlan,
} from "./agentRuntimeMessagingRemoteSurfaceCommandApplyTools";
import { commandPreview } from "./agentRuntimeMessagingRemoteSurfaceCommandApplyTools.testHelpers";

describe("Remote Ambient Surface command apply runtime side effects", () => {
  it("returns no side-effect requests when the command has no side-effect target", () => {
    expect(messagingRemoteSurfaceCommandApplySideEffectPlan(commandPreview())).toEqual({});
  });

  it("builds Remote Ambient Surface command apply side-effect requests", () => {
    const workflowActionRequest = {
      action: "run_exploration" as const,
      workflowThreadId: "workflow-1",
      workflowTitle: "Launch workflow",
      reason: "Owner asked to start exploration.",
    };
    const approvalResponse = {
      requestId: "approval-1",
      title: "Approve deploy?",
      response: "allow_once" as const,
      reason: "Owner approved from remote surface.",
    };
    const grantRevoke = {
      grantId: "grant-1",
      targetLabel: "ambient_messaging_remote_surface_command_apply",
      reason: "Owner revoked remote grant.",
    };
    const settingUpdateRequest = {
      settingKey: "search" as const,
      operation: "search_preference" as const,
      field: "enabled",
      value: true,
      reason: "Owner enabled search from remote surface.",
    };

    expect(
      messagingRemoteSurfaceCommandApplySideEffectPlan(
        commandPreview({
          commandKind: "answer_workflow_question",
          targetQuestionId: "question-1",
          answerChoiceId: "choice-1",
          answerFreeform: "Ship the simple version.",
        }),
      ),
    ).toEqual({
      workflowAnswerInput: {
        questionId: "question-1",
        choiceId: "choice-1",
        freeform: "Ship the simple version.",
      },
    });
    expect(
      messagingRemoteSurfaceCommandApplySideEffectPlan(
        commandPreview({
          commandKind: "workflow_action",
          targetWorkflowAction: workflowActionRequest,
        }),
      ),
    ).toEqual({ workflowActionRequest });
    expect(
      messagingRemoteSurfaceCommandApplySideEffectPlan(
        commandPreview({
          commandKind: "respond_approval",
          targetApprovalResponse: approvalResponse,
        }),
      ),
    ).toEqual({ approvalResponse });
    expect(
      messagingRemoteSurfaceCommandApplySideEffectPlan(
        commandPreview({
          commandKind: "revoke_permission_grant",
          targetGrantRevoke: grantRevoke,
        }),
      ),
    ).toEqual({ grantRevoke });
    expect(
      messagingRemoteSurfaceCommandApplySideEffectPlan(
        commandPreview({
          commandKind: "update_setting",
          targetSettingUpdate: settingUpdateRequest,
        }),
      ),
    ).toEqual({ settingUpdateRequest });
  });

  it("applies Remote Ambient Surface workflow-answer side effects through injected dependencies", async () => {
    const workflowAnswerInput = {
      questionId: "question-1",
      choiceId: "choice-1",
      freeform: "Ship the simple version.",
    };
    const workflowAnswerResult = { changed: true, text: "Answered workflow question." };
    const answeredQuestion = {
      id: "question-1",
      workflowThreadId: "workflow-1",
      category: "scope" as const,
      context: "Launch workflow",
      question: "What should we ship?",
      choices: [],
      allowFreeform: true,
      answer: {
        choiceId: "choice-1",
        freeform: "Ship the simple version.",
        answeredAt: "2026-06-11T00:00:00.000Z",
      },
      createdAt: "2026-06-11T00:00:00.000Z",
      answeredAt: "2026-06-11T00:00:00.000Z",
    };
    const answerWorkflowDiscoveryQuestion = vi.fn(async (input: { questionId: string; choiceId?: string; freeform?: string }) => {
      expect(input).toBe(workflowAnswerInput);
      return workflowAnswerResult;
    });
    const getWorkflowDiscoveryQuestion = vi.fn((questionId: string) => {
      expect(questionId).toBe("question-1");
      return answeredQuestion;
    });

    await expect(
      messagingRemoteSurfaceCommandApplyRuntimeSideEffects({
        sideEffectPlan: { workflowAnswerInput },
        answerWorkflowDiscoveryQuestion,
        getWorkflowDiscoveryQuestion,
        applyWorkflowAction: vi.fn(),
        applySettingUpdate: vi.fn(),
        revokePermissionGrant: vi.fn(),
        onPermissionGrantRevoked: vi.fn(),
      }),
    ).resolves.toEqual({
      answeredQuestion,
      workflowAnswerResult,
    });

    expect(answerWorkflowDiscoveryQuestion).toHaveBeenCalledWith(workflowAnswerInput);
    expect(getWorkflowDiscoveryQuestion).toHaveBeenCalledWith("question-1");
  });

  it("keeps Remote Ambient Surface runtime side effects in apply order", async () => {
    const calls: string[] = [];
    const workflowAnswerInput = {
      questionId: "question-1",
      choiceId: "choice-1",
      freeform: "Ship the simple version.",
    };
    const answeredQuestion = {
      id: "question-1",
      workflowThreadId: "workflow-1",
      category: "scope" as const,
      context: "Launch workflow",
      question: "What should we ship?",
      choices: [],
      allowFreeform: true,
      createdAt: "2026-06-11T00:00:00.000Z",
    };
    const workflowActionRequest = {
      action: "run_exploration" as const,
      workflowThreadId: "workflow-1",
      workflowTitle: "Launch workflow",
      reason: "Owner asked to start exploration.",
    };
    const workflowActionResult = {
      action: "run_exploration" as const,
      workflowThreadId: "workflow-1",
      workflowTitle: "Launch workflow",
      changed: true,
      text: "Started workflow exploration.",
    };
    const approvalResponse = {
      requestId: "approval-1",
      title: "Approve deploy?",
      response: "allow_once" as const,
      reason: "Owner approved from remote surface.",
    };
    const grantRevoke = {
      grantId: "grant-1",
      targetLabel: "ambient_messaging_remote_surface_command_apply",
      reason: "Owner revoked remote grant.",
    };
    const revokedGrant = {
      id: "grant-1",
      targetLabel: "ambient_messaging_remote_surface_command_apply",
      revokedAt: "2026-06-11T00:00:00.000Z",
    };
    const settingUpdateRequest = {
      settingKey: "thread" as const,
      operation: "thread_settings" as const,
      field: "thinkingLevel",
      value: "high",
      reason: "Owner requested deeper thinking.",
    };
    const updatedSetting = {
      settingKey: "thread" as const,
      operation: "thread_settings" as const,
      changed: true,
      text: "Thread settings updated.",
      previousSummary: "thinkingLevel=medium",
      nextSummary: "thinkingLevel=high",
    };

    await expect(
      messagingRemoteSurfaceCommandApplyRuntimeSideEffects({
        sideEffectPlan: {
          workflowAnswerInput,
          workflowActionRequest,
          approvalResponse,
          grantRevoke,
          settingUpdateRequest,
        },
        answerWorkflowDiscoveryQuestion: async () => {
          calls.push("answer");
          return { changed: true, text: "Answered workflow question." };
        },
        getWorkflowDiscoveryQuestion: () => {
          calls.push("get-question");
          return answeredQuestion;
        },
        applyWorkflowAction: async () => {
          calls.push("workflow-action");
          return workflowActionResult;
        },
        applySettingUpdate: async () => {
          calls.push("setting-update");
          return updatedSetting;
        },
        respondToPermissionPrompt: () => {
          calls.push("respond");
        },
        revokePermissionGrant: () => {
          calls.push("revoke");
          return revokedGrant;
        },
        onPermissionGrantRevoked: () => {
          calls.push("emit-revoked");
        },
      }),
    ).resolves.toMatchObject({
      answeredQuestion,
      workflowActionResult,
      approvalResponse,
      grantRevoke,
      updatedSetting,
    });

    expect(calls).toEqual(["answer", "get-question", "workflow-action", "respond", "revoke", "emit-revoked", "setting-update"]);
  });

  it("applies Remote Ambient Surface approval and grant side effects through injected dependencies", async () => {
    const approvalResponse = {
      requestId: "approval-1",
      title: "Approve deploy?",
      response: "allow_once" as const,
      reason: "Owner approved from remote surface.",
    };
    const grantRevoke = {
      grantId: "grant-1",
      targetLabel: "ambient_messaging_remote_surface_command_apply",
      reason: "Owner revoked remote grant.",
    };
    const revokedGrant = {
      id: "grant-1",
      targetLabel: "ambient_messaging_remote_surface_command_apply",
      revokedAt: "2026-06-11T00:00:00.000Z",
    };
    const respondToPermissionPrompt = vi.fn();
    const revokePermissionGrant = vi.fn((grantId: string) => {
      expect(grantId).toBe("grant-1");
      return revokedGrant;
    });
    const onPermissionGrantRevoked = vi.fn();

    await expect(
      messagingRemoteSurfaceCommandApplyRuntimeSideEffects({
        sideEffectPlan: { approvalResponse, grantRevoke },
        answerWorkflowDiscoveryQuestion: vi.fn(),
        getWorkflowDiscoveryQuestion: vi.fn(),
        applyWorkflowAction: vi.fn(),
        applySettingUpdate: vi.fn(),
        respondToPermissionPrompt,
        revokePermissionGrant,
        onPermissionGrantRevoked,
      }),
    ).resolves.toEqual({
      approvalResponse,
      grantRevoke,
    });

    expect(respondToPermissionPrompt).toHaveBeenCalledWith("approval-1", "allow_once");
    expect(revokePermissionGrant).toHaveBeenCalledWith("grant-1");
    expect(onPermissionGrantRevoked).toHaveBeenCalledWith(revokedGrant);
  });

  it("preserves Remote Ambient Surface approval response runtime availability errors", async () => {
    const approvalResponse = {
      requestId: "approval-1",
      title: "Approve deploy?",
      response: "allow_once" as const,
      reason: "Owner approved from remote surface.",
    };

    await expect(
      messagingRemoteSurfaceCommandApplyRuntimeSideEffects({
        sideEffectPlan: { approvalResponse },
        answerWorkflowDiscoveryQuestion: vi.fn(),
        getWorkflowDiscoveryQuestion: vi.fn(),
        applyWorkflowAction: vi.fn(),
        applySettingUpdate: vi.fn(),
        revokePermissionGrant: vi.fn(),
        onPermissionGrantRevoked: vi.fn(),
      }),
    ).rejects.toThrow("Ambient permission prompt responses are not available in this runtime.");
  });

  it("does not apply runtime side effects when the side-effect plan is empty", async () => {
    const answerWorkflowDiscoveryQuestion = vi.fn();
    const getWorkflowDiscoveryQuestion = vi.fn();
    const applyWorkflowAction = vi.fn();
    const applySettingUpdate = vi.fn();
    const revokePermissionGrant = vi.fn();
    const onPermissionGrantRevoked = vi.fn();

    await expect(
      messagingRemoteSurfaceCommandApplyRuntimeSideEffects({
        sideEffectPlan: {},
        answerWorkflowDiscoveryQuestion,
        getWorkflowDiscoveryQuestion,
        applyWorkflowAction,
        applySettingUpdate,
        revokePermissionGrant,
        onPermissionGrantRevoked,
      }),
    ).resolves.toEqual({});

    expect(answerWorkflowDiscoveryQuestion).not.toHaveBeenCalled();
    expect(getWorkflowDiscoveryQuestion).not.toHaveBeenCalled();
    expect(applyWorkflowAction).not.toHaveBeenCalled();
    expect(applySettingUpdate).not.toHaveBeenCalled();
    expect(revokePermissionGrant).not.toHaveBeenCalled();
    expect(onPermissionGrantRevoked).not.toHaveBeenCalled();
  });
});
