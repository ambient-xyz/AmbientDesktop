import type { Dispatch, RefObject, SetStateAction } from "react";
import { describe, expect, it, vi } from "vitest";

import type { DesktopState } from "../../shared/desktopTypes";
import type { PermissionRequest, PrivilegedCredentialRequest, SecureInputRequest } from "../../shared/permissionTypes";
import type { PlannerRevisionDialogState, ProjectActionDialogState, ThreadActionDialogState } from "./AppActionDialogs";
import type { AppModalHostProps } from "./AppModalHost";
import { subagentApprovalInitialScope, subagentApprovalScopeOptions } from "./AppModalHost";
import {
  createAppModalHostProps,
  createAppModalHostPropsForApp,
  type AppModalHostPropsForAppInput,
  type AppModalHostPropsInput,
} from "./AppModalHostProps";
import type { MediaPreviewModalRequest } from "./AppToolMessages";
import type { GitConfirmation } from "./RightPanel";

describe("App modal host props", () => {
  it("defaults subagent approvals to an explicit child-scoped grant option", () => {
    const action = {
      approvalId: "approval-1",
      childRunId: "child-run-1",
      childThreadId: "child-thread-1",
      decision: "approved",
      requestedScope: "always",
      effectiveScope: "this_child_thread",
    } as NonNullable<AppModalHostProps["subagentApprovalDecisionDialog"]>["action"];

    expect(subagentApprovalInitialScope(action)).toBe("this_child_thread");
    expect(subagentApprovalScopeOptions()).toEqual([
      {
        value: "this_child_thread",
        label: "For this child",
        description: "Recommended. Apply to future matching actions in this child thread only.",
      },
      {
        value: "this_action",
        label: "This action only",
        description: "Approve only this single request.",
      },
      expect.objectContaining({
        value: "parent_thread_tree",
        description: expect.stringContaining("Escalates beyond this child"),
      }),
      expect.objectContaining({
        value: "project",
        description: expect.stringContaining("Escalates beyond this child"),
      }),
      expect.objectContaining({
        value: "global",
        description: expect.stringContaining("Escalates beyond this child"),
      }),
    ]);
  });

  it("keeps one-off child approval requests one-off by default", () => {
    const action = {
      approvalId: "approval-one-shot",
      childRunId: "child-run-1",
      childThreadId: "child-thread-1",
      decision: "approved",
      requestedScope: "this_action",
      effectiveScope: "this_action",
    } as NonNullable<AppModalHostProps["subagentApprovalDecisionDialog"]>["action"];

    expect(subagentApprovalInitialScope(action)).toBe("this_action");
    expect(
      subagentApprovalInitialScope({
        ...action,
        requestedScope: undefined,
        effectiveScope: undefined,
      }),
    ).toBe("this_action");
  });

  it("derives modal state props from desktop state and keeps core handoffs stable", () => {
    const media = statefulSetter<MediaPreviewModalRequest | undefined>({ path: "/tmp/image.png", mediaKind: "image" });
    const followupOpen = statefulSetter(true);
    const previewArtifact = vi.fn();
    const saveApiKey = vi.fn();
    const openSearchWebSettings = vi.fn();
    const props = createAppModalHostProps(
      baseInput({
        clipboardCandidate: "clip-key",
        previewArtifact,
        saveApiKey,
        setLocalDeepResearchFollowupOpen: followupOpen.set,
        setMediaPreviewModal: media.set,
        openSearchWebSettings,
        state: desktopState({
          provider: { providerLabel: "Ambient" },
          settings: {
            media: { generatedMediaAutoplay: true },
            permissionMode: "full-access",
          },
        }),
      }),
    );

    expect(props.generatedMediaAutoplay).toBe(true);
    expect(props.provider.providerLabel).toBe("Ambient");
    expect(props.permissionMode).toBe("full-access");

    props.onCloseMediaPreview();
    props.onOpenMediaPreviewInFiles("/tmp/image.png");
    props.onUseClipboardApiKey();
    props.onOpenSearchWebSettings();

    expect(media.value).toBeUndefined();
    expect(previewArtifact).toHaveBeenCalledWith("/tmp/image.png");
    expect(saveApiKey).toHaveBeenCalledWith("clip-key");
    expect(followupOpen.value).toBe(false);
    expect(openSearchWebSettings).toHaveBeenCalledOnce();
  });

  it("adapts grouped App state and action owners into modal host props", () => {
    const media = statefulSetter<MediaPreviewModalRequest | undefined>({ path: "/tmp/image.png", mediaKind: "image" });
    const followupOpen = statefulSetter(true);
    const previewArtifact = vi.fn();
    const saveApiKey = vi.fn();
    const openSearchWebSettings = vi.fn();
    const props = createAppModalHostPropsForApp(
      appInputFromBase(
        baseInput({
          clipboardCandidate: "clip-key",
          previewArtifact,
          saveApiKey,
          setLocalDeepResearchFollowupOpen: followupOpen.set,
          setMediaPreviewModal: media.set,
          openSearchWebSettings,
          state: desktopState({
            provider: { providerLabel: "Ambient" },
            settings: {
              media: { generatedMediaAutoplay: true },
              permissionMode: "full-access",
            },
          }),
        }),
      ),
    );

    expect(props.generatedMediaAutoplay).toBe(true);
    expect(props.provider.providerLabel).toBe("Ambient");
    expect(props.permissionMode).toBe("full-access");

    props.onCloseMediaPreview();
    props.onOpenMediaPreviewInFiles("/tmp/image.png");
    props.onUseClipboardApiKey();
    props.onOpenSearchWebSettings();

    expect(media.value).toBeUndefined();
    expect(previewArtifact).toHaveBeenCalledWith("/tmp/image.png");
    expect(saveApiKey).toHaveBeenCalledWith("clip-key");
    expect(followupOpen.value).toBe(false);
    expect(openSearchWebSettings).toHaveBeenCalledOnce();
  });

  it("keeps subagent decision dialog updates and busy cancel guards stable", () => {
    const barrier = statefulSetter<AppModalHostProps["subagentBarrierDecisionDialog"]>({
      action: {},
      busy: false,
      error: "old error",
      partialSummary: "summary",
      userDecision: "wait",
    } as AppModalHostProps["subagentBarrierDecisionDialog"]);
    const approval = statefulSetter<AppModalHostProps["subagentApprovalDecisionDialog"]>({
      action: {},
      busy: false,
      decision: "approved",
      error: "old error",
      requestedScope: "this_action",
      userDecision: "approve",
    } as AppModalHostProps["subagentApprovalDecisionDialog"]);
    const props = createAppModalHostProps(
      baseInput({
        setSubagentApprovalDecisionDialog: approval.set,
        setSubagentBarrierDecisionDialog: barrier.set,
        subagentApprovalDecisionDialog: approval.value,
        subagentBarrierDecisionDialog: barrier.value,
      }),
    );

    props.onChangeSubagentBarrierDecision({ userDecision: "continue" });
    props.onChangeSubagentApprovalDecision({ requestedScope: "project" });

    expect(barrier.value).toMatchObject({ userDecision: "continue", error: undefined });
    expect(approval.value).toMatchObject({ requestedScope: "project", error: undefined });

    props.onCancelSubagentBarrierDecision();
    props.onCancelSubagentApprovalDecision();

    expect(barrier.value).toBeUndefined();
    expect(approval.value).toBeUndefined();

    const busyBarrier = statefulSetter<AppModalHostProps["subagentBarrierDecisionDialog"]>({
      action: {},
      busy: true,
      partialSummary: "summary",
      userDecision: "wait",
    } as AppModalHostProps["subagentBarrierDecisionDialog"]);
    const busyApproval = statefulSetter<AppModalHostProps["subagentApprovalDecisionDialog"]>({
      action: {},
      busy: true,
      decision: "approved",
      requestedScope: "this_action",
      userDecision: "approve",
    } as AppModalHostProps["subagentApprovalDecisionDialog"]);
    const busyProps = createAppModalHostProps(
      baseInput({
        setSubagentApprovalDecisionDialog: busyApproval.set,
        setSubagentBarrierDecisionDialog: busyBarrier.set,
        subagentApprovalDecisionDialog: busyApproval.value,
        subagentBarrierDecisionDialog: busyBarrier.value,
      }),
    );

    busyProps.onCancelSubagentBarrierDecision();
    busyProps.onCancelSubagentApprovalDecision();

    expect(busyBarrier.value?.busy).toBe(true);
    expect(busyApproval.value?.busy).toBe(true);
  });

  it("keeps modal dialog edit and confirmation adapters stable", () => {
    const projectDialog = statefulSetter<ProjectActionDialogState | undefined>({
      kind: "rename",
      name: "Old project",
      project: projectSummary(),
    });
    const plannerDialog = statefulSetter<PlannerRevisionDialogState | undefined>({
      artifact: { id: "artifact-1" },
      error: "old error",
      initialFeedback: "feedback",
    } as PlannerRevisionDialogState);
    const threadDialog = statefulSetter<ThreadActionDialogState | undefined>({
      kind: "rename",
      name: "Old thread",
      thread: { id: "thread-1" },
      workspacePath: "/repo",
    } as ThreadActionDialogState);
    const props = createAppModalHostProps(
      baseInput({
        setPlannerRevisionDialog: plannerDialog.set,
        setProjectActionDialog: projectDialog.set,
        setThreadActionDialog: threadDialog.set,
      }),
    );

    props.onChangeProjectActionName("New project");
    props.onPlannerRevisionFeedbackChange();
    props.onChangeThreadActionName("New thread");

    expect(projectDialog.value).toMatchObject({ kind: "rename", name: "New project" });
    expect(plannerDialog.value).toMatchObject({ error: undefined, initialFeedback: "feedback" });
    expect(threadDialog.value).toMatchObject({ kind: "rename", name: "New thread" });

    const archiveProjectDialog = statefulSetter<ProjectActionDialogState | undefined>({
      kind: "archive",
      project: projectSummary(),
    });
    const archiveThreadDialog = statefulSetter<ThreadActionDialogState | undefined>({
      kind: "archive",
      thread: { id: "thread-1" },
      workspacePath: "/repo",
    } as ThreadActionDialogState);
    const archiveProps = createAppModalHostProps(
      baseInput({
        setProjectActionDialog: archiveProjectDialog.set,
        setThreadActionDialog: archiveThreadDialog.set,
      }),
    );

    archiveProps.onChangeProjectActionName("Ignored");
    archiveProps.onChangeThreadActionName("Ignored");

    expect(archiveProjectDialog.value).toMatchObject({ kind: "archive" });
    expect(archiveThreadDialog.value).toMatchObject({ kind: "archive" });
  });

  it("keeps permission responses and Git confirmation ordering stable", async () => {
    const order: string[] = [];
    const setGitConfirmation: Dispatch<SetStateAction<GitConfirmation | undefined>> = vi.fn(() => {
      order.push("clear");
    });
    const respondPermissionRequest = vi.fn();
    const respondPrivilegedCredentialRequest = vi.fn();
    const respondSecureInputRequest = vi.fn();
    const requestThreadPermissionModeChange = vi.fn();
    const props = createAppModalHostProps(
      baseInput({
        requestThreadPermissionModeChange,
        respondPermissionRequest,
        respondPrivilegedCredentialRequest,
        respondSecureInputRequest,
        setGitConfirmation,
      }),
    );
    const confirmation: GitConfirmation = {
      confirmLabel: "Confirm",
      message: "Message",
      onConfirm: vi.fn(async () => {
        order.push("action");
      }),
      title: "Title",
    };

    props.onRequestFullAccess();
    props.onRespondPermissionRequest({ id: "permission-1" } as PermissionRequest, "allow_once");
    props.onRespondPrivilegedCredentialRequest({ id: "credential-1" } as PrivilegedCredentialRequest, "secret");
    props.onRespondSecureInputRequest({ id: "secure-1" } as SecureInputRequest, "value");
    await props.onConfirmGitConfirmation(confirmation);

    expect(requestThreadPermissionModeChange).toHaveBeenCalledWith("full-access");
    expect(respondPermissionRequest).toHaveBeenCalledWith("permission-1", "allow_once");
    expect(respondPrivilegedCredentialRequest).toHaveBeenCalledWith("credential-1", "secret");
    expect(respondSecureInputRequest).toHaveBeenCalledWith("secure-1", "value");
    expect(order).toEqual(["clear", "action"]);
  });
});

function baseInput(input: Partial<AppModalHostPropsInput> = {}): AppModalHostPropsInput {
  const noop = vi.fn();
  return {
    activePermissionRequest: undefined,
    activePrivilegedCredentialRequest: undefined,
    activeSecureInputRequest: undefined,
    ambientCliSecretDialog: undefined,
    ambientCliSecretInputRef: ref(),
    apiDialogOpen: false,
    apiKeyBusy: false,
    apiKeyDraft: "",
    apiKeyInputRef: ref(),
    apiKeyStatus: undefined,
    clearSavedApiKey: noop,
    clipboardCandidate: "",
    commandItems: () => [],
    commandPaletteOpen: false,
    commandPaletteQuery: "",
    confirmProjectActionDialog: noop,
    confirmProjectBoardReset: noop,
    confirmThreadActionDialog: noop,
    gitConfirmation: undefined,
    localDeepResearchFollowupOpen: false,
    localDeepResearchQ8Override: false,
    localDeepResearchSetup: { status: "idle" } as AppModalHostProps["localDeepResearchSetup"],
    mediaPreviewModal: undefined,
    onApiKeyChange: noop,
    onCommandPaletteQueryChange: noop,
    onLocalDeepResearchQ8OverrideChange: noop,
    openAmbientKeys: noop,
    openSearchWebSettings: noop,
    pasteAmbientCliSecret: noop,
    pasteApiKey: noop,
    plannerRevisionDialog: undefined,
    previewArtifact: noop,
    projectActionDialog: undefined,
    projectBoardResetDialog: undefined,
    requestThreadPermissionModeChange: noop,
    respondPermissionRequest: noop,
    respondPrivilegedCredentialRequest: noop,
    respondSecureInputRequest: noop,
    runPaletteCommand: noop,
    saveAmbientCliSecret: noop,
    saveApiKey: noop,
    setAmbientCliSecretDialog: statefulSetter<AppModalHostProps["ambientCliSecretDialog"]>(undefined).set,
    setApiDialogOpen: statefulSetter(false).set,
    setCommandPaletteOpen: statefulSetter(false).set,
    setGitConfirmation: statefulSetter<AppModalHostProps["gitConfirmation"]>(undefined).set,
    setLocalDeepResearchFollowupOpen: statefulSetter(false).set,
    setMediaPreviewModal: statefulSetter<AppModalHostProps["mediaPreviewModal"]>(undefined).set,
    setPlannerRevisionDialog: statefulSetter<AppModalHostProps["plannerRevisionDialog"]>(undefined).set,
    setProjectActionDialog: statefulSetter<AppModalHostProps["projectActionDialog"]>(undefined).set,
    setProjectBoardResetDialog: statefulSetter<AppModalHostProps["projectBoardResetDialog"]>(undefined).set,
    setSubagentApprovalDecisionDialog: statefulSetter<AppModalHostProps["subagentApprovalDecisionDialog"]>(undefined).set,
    setSubagentBarrierDecisionDialog: statefulSetter<AppModalHostProps["subagentBarrierDecisionDialog"]>(undefined).set,
    setThreadActionDialog: statefulSetter<AppModalHostProps["threadActionDialog"]>(undefined).set,
    setupLocalDeepResearchFromSettings: noop,
    state: desktopState(),
    subagentApprovalDecisionDialog: undefined,
    subagentBarrierDecisionDialog: undefined,
    subagentUiEnabled: true,
    submitPlannerRevisionDialog: noop,
    submitSubagentApprovalDecisionDialog: noop,
    submitSubagentBarrierDecisionDialog: noop,
    testApiKey: noop,
    threadActionDialog: undefined,
    updateAmbientCliSecretDialog: noop,
    ...input,
  } as AppModalHostPropsInput;
}

function appInputFromBase(base: AppModalHostPropsInput): AppModalHostPropsForAppInput {
  return {
    activePermissionRequest: base.activePermissionRequest,
    activePrivilegedCredentialRequest: base.activePrivilegedCredentialRequest,
    activeSecureInputRequest: base.activeSecureInputRequest,
    actions: {
      credentialDialogActions: {
        clearSavedApiKey: base.clearSavedApiKey,
        openAmbientKeys: base.openAmbientKeys,
        pasteAmbientCliSecret: base.pasteAmbientCliSecret,
        pasteApiKey: base.pasteApiKey,
        saveAmbientCliSecret: base.saveAmbientCliSecret,
        saveApiKey: base.saveApiKey,
        testApiKey: base.testApiKey,
        updateAmbientCliSecretDialog: base.updateAmbientCliSecretDialog,
      },
      localRuntimeActions: {
        setupLocalDeepResearchFromSettings: base.setupLocalDeepResearchFromSettings,
      },
      openSearchWebSettings: base.openSearchWebSettings,
      permissionActions: {
        requestThreadPermissionModeChange: base.requestThreadPermissionModeChange,
        respondPermissionRequest: base.respondPermissionRequest,
        respondPrivilegedCredentialRequest: base.respondPrivilegedCredentialRequest,
        respondSecureInputRequest: base.respondSecureInputRequest,
      },
      previewArtifact: base.previewArtifact,
      projectBoardActions: {
        confirmProjectBoardReset: base.confirmProjectBoardReset,
      },
      projectThreadActions: {
        confirmProjectActionDialog: base.confirmProjectActionDialog,
        confirmThreadActionDialog: base.confirmThreadActionDialog,
      },
      shellCommandActions: {
        commandItems: base.commandItems,
        runPaletteCommand: base.runPaletteCommand,
      },
      submitPlannerRevisionDialog: base.submitPlannerRevisionDialog,
      submitSubagentApprovalDecisionDialog: base.submitSubagentApprovalDecisionDialog,
      submitSubagentBarrierDecisionDialog: base.submitSubagentBarrierDecisionDialog,
    },
    providerRuntimeState: {
      localDeepResearchFollowupOpen: base.localDeepResearchFollowupOpen,
      localDeepResearchQ8Override: base.localDeepResearchQ8Override,
      localDeepResearchSetup: base.localDeepResearchSetup,
      setLocalDeepResearchFollowupOpen: base.setLocalDeepResearchFollowupOpen,
      setLocalDeepResearchQ8Override: statefulSetter(base.localDeepResearchQ8Override).set,
    },
    projectShellState: {
      plannerRevisionDialog: base.plannerRevisionDialog,
      projectActionDialog: base.projectActionDialog,
      projectBoardResetDialog: base.projectBoardResetDialog,
      setPlannerRevisionDialog: base.setPlannerRevisionDialog,
      setProjectActionDialog: base.setProjectActionDialog,
      setProjectBoardResetDialog: base.setProjectBoardResetDialog,
      setThreadActionDialog: base.setThreadActionDialog,
      threadActionDialog: base.threadActionDialog,
    },
    securityPromptState: {
      ambientCliSecretDialog: base.ambientCliSecretDialog,
      ambientCliSecretInputRef: base.ambientCliSecretInputRef,
      apiDialogOpen: base.apiDialogOpen,
      apiKeyBusy: base.apiKeyBusy,
      apiKeyDraft: base.apiKeyDraft,
      apiKeyInputRef: base.apiKeyInputRef,
      apiKeyStatus: base.apiKeyStatus,
      clipboardCandidate: base.clipboardCandidate,
      setAmbientCliSecretDialog: base.setAmbientCliSecretDialog,
      setApiDialogOpen: base.setApiDialogOpen,
      setApiKeyDraft: statefulSetter(base.apiKeyDraft).set,
    },
    shellUiState: {
      commandPaletteOpen: base.commandPaletteOpen,
      commandPaletteQuery: base.commandPaletteQuery,
      mediaPreviewModal: base.mediaPreviewModal,
      setCommandPaletteOpen: base.setCommandPaletteOpen,
      setCommandPaletteQuery: statefulSetter(base.commandPaletteQuery).set,
      setMediaPreviewModal: base.setMediaPreviewModal,
    },
    state: base.state,
    subagentUiEnabled: base.subagentUiEnabled,
    workflowRuntimeState: {
      setSubagentApprovalDecisionDialog: base.setSubagentApprovalDecisionDialog,
      setSubagentBarrierDecisionDialog: base.setSubagentBarrierDecisionDialog,
      subagentApprovalDecisionDialog: base.subagentApprovalDecisionDialog,
      subagentBarrierDecisionDialog: base.subagentBarrierDecisionDialog,
    },
    workspaceShellState: {
      gitConfirmation: base.gitConfirmation,
      setGitConfirmation: base.setGitConfirmation,
    },
  };
}

function desktopState(input: Record<string, unknown> = {}): DesktopState {
  return {
    provider: { providerLabel: "Provider" },
    settings: {
      media: { generatedMediaAutoplay: false },
      permissionMode: "workspace",
    },
    ...input,
  } as unknown as DesktopState;
}

function projectSummary(): ProjectActionDialogState["project"] {
  return {
    id: "project-1",
    name: "Project",
    path: "/repo",
  } as ProjectActionDialogState["project"];
}

function ref<T = HTMLInputElement>(): RefObject<T | null> {
  return { current: null };
}

function statefulSetter<T>(initial: T): {
  readonly value: T;
  set: Dispatch<SetStateAction<T>>;
} {
  let value = initial;
  const set: Dispatch<SetStateAction<T>> = vi.fn((next) => {
    value = typeof next === "function" ? (next as (current: T) => T)(value) : next;
  }) as Dispatch<SetStateAction<T>>;
  return {
    get value() {
      return value;
    },
    set,
  };
}
