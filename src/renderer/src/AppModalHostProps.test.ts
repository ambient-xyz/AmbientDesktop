import type { Dispatch, RefObject, SetStateAction } from "react";
import { describe, expect, it, vi } from "vitest";

import type {
  DesktopState,
  PermissionRequest,
  PrivilegedCredentialRequest,
  SecureInputRequest,
} from "../../shared/types";
import type {
  PlannerRevisionDialogState,
  ProjectActionDialogState,
  ThreadActionDialogState,
} from "./AppActionDialogs";
import type { AppModalHostProps } from "./AppModalHost";
import {
  createAppModalHostProps,
  type AppModalHostPropsInput,
} from "./AppModalHostProps";
import type { MediaPreviewModalRequest } from "./AppToolMessages";
import type { GitConfirmation } from "./RightPanel";

describe("App modal host props", () => {
  it("derives modal state props from desktop state and keeps core handoffs stable", () => {
    const media = statefulSetter<MediaPreviewModalRequest | undefined>({ path: "/tmp/image.png", mediaKind: "image" });
    const followupOpen = statefulSetter(true);
    const previewArtifact = vi.fn();
    const saveApiKey = vi.fn();
    const openSearchWebSettings = vi.fn();
    const props = createAppModalHostProps(baseInput({
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
    }));

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
    const props = createAppModalHostProps(baseInput({
      setSubagentApprovalDecisionDialog: approval.set,
      setSubagentBarrierDecisionDialog: barrier.set,
      subagentApprovalDecisionDialog: approval.value,
      subagentBarrierDecisionDialog: barrier.value,
    }));

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
    const busyProps = createAppModalHostProps(baseInput({
      setSubagentApprovalDecisionDialog: busyApproval.set,
      setSubagentBarrierDecisionDialog: busyBarrier.set,
      subagentApprovalDecisionDialog: busyApproval.value,
      subagentBarrierDecisionDialog: busyBarrier.value,
    }));

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
    const props = createAppModalHostProps(baseInput({
      setPlannerRevisionDialog: plannerDialog.set,
      setProjectActionDialog: projectDialog.set,
      setThreadActionDialog: threadDialog.set,
    }));

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
    const archiveProps = createAppModalHostProps(baseInput({
      setProjectActionDialog: archiveProjectDialog.set,
      setThreadActionDialog: archiveThreadDialog.set,
    }));

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
    const props = createAppModalHostProps(baseInput({
      requestThreadPermissionModeChange,
      respondPermissionRequest,
      respondPrivilegedCredentialRequest,
      respondSecureInputRequest,
      setGitConfirmation,
    }));
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
