import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { PermissionRequest } from "../../shared/permissionTypes";
import { AppModalHost, type AppModalHostProps } from "./AppModalHost";

describe("AppModalHost", () => {
  it("keeps Local Deep Research queued behind active security prompts", () => {
    const html = renderToStaticMarkup(
      <AppModalHost
        {...baseProps({
          activePermissionRequest: permissionRequest(),
          localDeepResearchFollowupOpen: true,
        })}
      />,
    );

    expect(html).toContain("Repair Scrapling");
    expect(html).not.toContain("Add Local Deep Research");
  });

  it("shows the queued Local Deep Research follow-up when no security prompt is active", () => {
    const html = renderToStaticMarkup(
      <AppModalHost
        {...baseProps({
          localDeepResearchFollowupOpen: true,
        })}
      />,
    );

    expect(html).toContain("Add Local Deep Research");
    expect(html).toContain("Close Local Deep Research setup");
  });
});

function baseProps(overrides: Partial<AppModalHostProps> = {}): AppModalHostProps {
  return {
    mediaPreviewModal: undefined,
    generatedMediaAutoplay: true,
    provider: { providerLabel: "Ambient" } as AppModalHostProps["provider"],
    apiDialogOpen: false,
    apiKeyDraft: "",
    apiKeyBusy: false,
    clipboardCandidate: "",
    apiKeyInputRef: { current: null },
    ambientCliSecretDialog: undefined,
    ambientCliSecretInputRef: { current: null },
    localDeepResearchFollowupOpen: false,
    localDeepResearchSetup: { status: "idle" },
    localDeepResearchQ8Override: false,
    subagentUiEnabled: false,
    subagentBarrierDecisionDialog: undefined,
    subagentApprovalDecisionDialog: undefined,
    commandPaletteOpen: false,
    commandPaletteQuery: "",
    commandItems: () => [],
    projectActionDialog: undefined,
    projectBoardResetDialog: undefined,
    plannerRevisionDialog: undefined,
    threadActionDialog: undefined,
    activePermissionRequest: undefined,
    permissionMode: "workspace",
    activePrivilegedCredentialRequest: undefined,
    activeSecureInputRequest: undefined,
    gitConfirmation: undefined,
    onCloseMediaPreview: vi.fn(),
    onOpenMediaPreviewInFiles: vi.fn(),
    onApiKeyChange: vi.fn(),
    onCloseApiKey: vi.fn(),
    onOpenAmbientKeys: vi.fn(),
    onPasteApiKey: vi.fn(),
    onSaveApiKey: vi.fn(),
    onUseClipboardApiKey: vi.fn(),
    onTestApiKey: vi.fn(),
    onClearSavedApiKey: vi.fn(),
    onAmbientCliSecretChange: vi.fn(),
    onPasteAmbientCliSecret: vi.fn(),
    onSaveAmbientCliSecret: vi.fn(),
    onCloseAmbientCliSecret: vi.fn(),
    onGoalBudgetChange: vi.fn(),
    onCancelGoalBudget: vi.fn(),
    onConfirmGoalBudget: vi.fn(),
    onLocalDeepResearchQ8OverrideChange: vi.fn(),
    onSetupLocalDeepResearch: vi.fn(),
    onOpenSearchWebSettings: vi.fn(),
    onCloseLocalDeepResearchFollowup: vi.fn(),
    onChangeSubagentBarrierDecision: vi.fn(),
    onCancelSubagentBarrierDecision: vi.fn(),
    onConfirmSubagentBarrierDecision: vi.fn(),
    onChangeSubagentApprovalDecision: vi.fn(),
    onCancelSubagentApprovalDecision: vi.fn(),
    onConfirmSubagentApprovalDecision: vi.fn(),
    onCommandPaletteQueryChange: vi.fn(),
    onRunPaletteCommand: vi.fn(),
    onCloseCommandPalette: vi.fn(),
    onChangeProjectActionName: vi.fn(),
    onCancelProjectAction: vi.fn(),
    onConfirmProjectAction: vi.fn(),
    onCancelProjectBoardReset: vi.fn(),
    onConfirmProjectBoardReset: vi.fn(),
    onPlannerRevisionFeedbackChange: vi.fn(),
    onCancelPlannerRevision: vi.fn(),
    onConfirmPlannerRevision: vi.fn(),
    onChangeThreadActionName: vi.fn(),
    onCancelThreadAction: vi.fn(),
    onConfirmThreadAction: vi.fn(),
    onRequestFullAccess: vi.fn(),
    onRespondPermissionRequest: vi.fn(),
    onRespondPrivilegedCredentialRequest: vi.fn(),
    onRespondSecureInputRequest: vi.fn(),
    onCancelGitConfirmation: vi.fn(),
    onConfirmGitConfirmation: vi.fn(async () => undefined),
    ...overrides,
  };
}

function permissionRequest(): PermissionRequest {
  return {
    id: "permission-1",
    threadId: "thread-1",
    toolName: "ambient_mcp_default_capability_repair",
    title: "Repair Scrapling",
    message: "Ambient needs approval before repairing Scrapling.",
    detail: "Repair may remove or replace an unhealthy existing workload after approval.",
    risk: "plugin-tool",
    reusableScopes: [],
  } as PermissionRequest;
}
