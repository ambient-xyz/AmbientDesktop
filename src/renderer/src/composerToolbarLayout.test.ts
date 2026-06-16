import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const appComposerSubmitActionsSource = readFileSync(new URL("./AppComposerSubmitActions.ts", import.meta.url), "utf8");
const appComposerShellSource = readFileSync(new URL("./AppComposerShell.tsx", import.meta.url), "utf8");
const appComposerControlsSource = readFileSync(new URL("./AppComposerControls.tsx", import.meta.url), "utf8");
const appConversationMessagesSource = readFileSync(new URL("./AppConversationMessages.tsx", import.meta.url), "utf8");
const appDialogsSource = readFileSync(new URL("./AppDialogs.tsx", import.meta.url), "utf8");
const appGitControlsSource = readFileSync(new URL("./AppGitControls.tsx", import.meta.url), "utf8");
const appMessagesSource = readFileSync(new URL("./AppMessages.tsx", import.meta.url), "utf8");
const appLocalRuntimeActionsSource = readFileSync(new URL("./AppLocalRuntimeActions.ts", import.meta.url), "utf8");
const goalControlsSource = readFileSync(new URL("./AppGoalControls.tsx", import.meta.url), "utf8");
const rightPanelSource = readFileSync(new URL("./RightPanel.tsx", import.meta.url), "utf8");
const rightPanelPluginHostSource = readFileSync(new URL("./RightPanelPluginHost.tsx", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const symphonySource = readFileSync(new URL("./SymphonyWorkflowBuilder.tsx", import.meta.url), "utf8");

describe("composer toolbar layout", () => {
  it("keeps primary tool actions in a stable group before settings controls", () => {
    const toolsStart = appComposerShellSource.indexOf('className="composer-tool-actions"');
    const settingsStart = appComposerShellSource.indexOf('className="composer-settings-controls"');
    const rightStart = appComposerShellSource.indexOf('className="right-controls"');

    expect(toolsStart).toBeGreaterThan(-1);
    expect(settingsStart).toBeGreaterThan(toolsStart);
    expect(rightStart).toBeGreaterThan(settingsStart);

    const toolActionsSource = appComposerShellSource.slice(toolsStart, settingsStart);
    expect(toolActionsSource).toContain('aria-label="Attach files"');
    expect(toolActionsSource).toContain('"Enable Local Deep Research"');
    expect(toolActionsSource).toContain("<ContextUsageIndicator");
    expect(toolActionsSource).toContain('aria-label="Compact context"');
    expect(toolActionsSource).toContain('aria-label="Export chat"');
    expect(appSource).not.toContain('className="left-controls"');
  });

  it("adds explicit composer tooltips and local deep research intent routing", () => {
    expect(appComposerShellSource).toContain("data-tooltip=\"Attach files to the next message.\"");
    expect(appComposerShellSource).toContain('"Enable Local Deep Research"');
    expect(appComposerShellSource).toContain(': "Local Deep Research"');
    expect(appComposerSubmitActionsSource).toContain("localDeepResearchSubmitOptions(running, localDeepResearchRunBudgetRef.current)");
    expect(appComposerSubmitActionsSource).toContain("localDeepResearch: budget");
    expect(appComposerShellSource).toContain("Choose whether assistant thinking is hidden, temporary, or retained.");
    expect(stylesSource).toContain(".composer [data-tooltip]::after");
    expect(stylesSource).toContain(".topbar [data-tooltip]::after");
  });

  it("does not pair instant tooltips with native title attributes", () => {
    const sources = [
      appSource,
      appComposerShellSource,
      appComposerControlsSource,
      appGitControlsSource,
      goalControlsSource,
      symphonySource,
    ];
    const taggedControls = sources.flatMap((source) => source.match(/<[^>]*data-tooltip[^>]*>/gs) ?? []);

    expect(taggedControls.length).toBeGreaterThan(0);
    expect(taggedControls.filter((tag) => /\btitle=/.test(tag))).toEqual([]);
  });

  it("keeps live composer text out of top-level App state", () => {
    expect(appSource).not.toContain("composerDraftValue");
    expect(appSource).not.toContain("setComposerDraftValue");
    expect(appSource).toContain("createComposerDraftStore()");
    expect(appSource).toContain("composerDraftStore.set(value)");
    expect(symphonySource).toContain("useComposerDraftValue");
  });

  it("arms Local Deep Research as a composer mode instead of submitting immediately", () => {
    expect(appSource).toContain("const [localDeepResearchModeArmed, setLocalDeepResearchModeArmedState] = useState(false);");
    expect(appSource).toContain("const localDeepResearchModeArmedRef = useRef(false);");
    expect(appSource).toContain("function toggleLocalDeepResearchMode()");
    expect(appComposerShellSource).toContain("onClick={onToggleLocalDeepResearchMode}");
    expect(appComposerShellSource).toContain("aria-pressed={localDeepResearchModeArmed}");
    expect(appComposerSubmitActionsSource).toContain("const localDeepResearchModeRequested = localDeepResearchModeArmedRef.current;");
    expect(appSource).toContain("void submitComposerDraft(\"prompt\"");
    expect(appSource).not.toContain("submitLocalDeepResearchDraft");
    expect(stylesSource).toContain(".composer-controls .icon-button.subtle.local-deep-research-composer-button.active");
  });

  it("shows the Local Deep Research effort chip only while the mode is armed", () => {
    expect(appComposerShellSource).toContain("localDeepResearchModeArmed &&");
    expect(appComposerShellSource).toContain('className="local-deep-research-effort-chip"');
    expect(appComposerShellSource).toContain("Effort:");
    expect(appComposerShellSource).toContain("localDeepResearchEffortOpen");
    expect(appComposerShellSource).toContain("LOCAL_DEEP_RESEARCH_EFFORT_ORDER.map");
    expect(appComposerShellSource).toContain("onSelectLocalDeepResearchEffort(effort)");
    expect(appComposerShellSource).toContain("onLocalDeepResearchCustomMaxToolCallsChange");
    expect(stylesSource).toContain(".local-deep-research-effort-chip");
    expect(stylesSource).toContain(".local-deep-research-effort-menu");
  });

  it("does not show Local Deep Research install follow-up when setup is already ready", () => {
    expect(appLocalRuntimeActionsSource).toContain("async function openLocalDeepResearchFollowupIfSetupNeeded()");
    expect(appLocalRuntimeActionsSource).toContain('if (!result || result.setupStatus !== "ready") setLocalDeepResearchFollowupOpen(true);');
    expect(appSource).toContain("void openLocalDeepResearchFollowupIfSetupNeeded();");
    expect(appDialogsSource).toContain('const setupReady = setup.result?.setupStatus === "ready";');
    expect(appDialogsSource).toContain('setupReady ? "Local Deep Research Is Ready" : "Add Local Deep Research"');
    expect(appDialogsSource).toContain('Local Deep Research is already installed and ready to use');
    expect(appDialogsSource).toContain('{setupReady ? "Close" : "Not now"}');
  });

  it("refreshes MCP runtime status before opening startup runtime setup", () => {
    const setupEventStart = rightPanelSource.indexOf('panel === "plugins"');
    const setupEventEnd = rightPanelSource.indexOf("}, [panel, state.workspace.path]);", setupEventStart);
    const setupEventSource = rightPanelSource.slice(setupEventStart, setupEventEnd);

    expect(setupEventStart).toBeGreaterThan(-1);
    expect(setupEventSource).not.toContain("setContainerRuntimeModalOpen(true);");
    expect(setupEventSource).toContain("mcpPane.refreshContainerRuntimeStatus(true, { continueDefaultCapabilitySetup: true })");
    expect(rightPanelPluginHostSource).toContain("onOpenRuntimeReview={() => setMcpContainerRuntimeModalOpen(true)}");
  });

  it("compacts settings without using the old whole-toolbar container query", () => {
    expect(stylesSource).toContain("container: composer-settings-controls / inline-size;");
    expect(stylesSource).toContain("@container composer-settings-controls");
    expect(stylesSource).not.toContain("composer-left-controls");
    expect(stylesSource).not.toContain(".left-controls");
    expect(stylesSource).toContain("min-width: min(100%, 360px);");
  });

  it("draws subtle composer icon buttons with visible chrome", () => {
    expect(stylesSource).toContain(".composer-controls .icon-button.subtle");
    expect(stylesSource).toContain("border: 1px solid var(--line-strong);");
  });

  it("keeps compact composer mode controls wide enough for icon-only states", () => {
    expect(stylesSource).toContain(".composer-settings-controls > .permission-toggle");
    expect(stylesSource).toContain("min-width: calc((var(--composer-compact-control-size) * 2) + 2px);");
    expect(stylesSource).toContain(".composer .permission-toggle button > svg");
    expect(stylesSource).toContain("min-width: 14px;");
  });

  it("keeps the model picker labeled through desktop compact breakpoints", () => {
    const mediumViewportBlock = stylesSource.slice(
      stylesSource.indexOf("@media (max-width: 1100px)"),
      stylesSource.indexOf("@container composer-settings-controls (max-width: 820px)"),
    );
    const desktopCompactBlock = stylesSource.slice(
      stylesSource.indexOf("@container composer-settings-controls (max-width: 820px)"),
      stylesSource.indexOf("@container composer-settings-controls (max-width: 480px)"),
    );

    expect(stylesSource).toContain(".model-picker-button {\n  min-width: 128px;");
    expect(stylesSource).toContain("@container composer-settings-controls (max-width: 480px)");
    expect(mediumViewportBlock).not.toContain("model-picker-button span");
    expect(desktopCompactBlock).not.toContain("model-picker-button span");
  });

  it("uses the goal-mode green selected styling for paired composer modes", () => {
    const segmentedSelectedRule = cssRule(".permission-toggle button.selected");
    const goalSelectedRule = cssRule(".goal-mode-toggle.selected");

    expect(appComposerControlsSource).not.toContain("permission-activation-selected");
    for (const declaration of [
      "color: #276b4c;",
      "background: #f2fbf6;",
      "box-shadow: inset 0 0 0 1px rgba(49, 126, 88, 0.14);",
    ]) {
      expect(segmentedSelectedRule).toContain(declaration);
      expect(goalSelectedRule).toContain(declaration);
    }
  });

  it("renders statusbar mode chips with semantic icons", () => {
    const statusbarStart = appComposerShellSource.indexOf('className="statusbar"');
    const statusbarEnd = appComposerShellSource.indexOf("</footer>", statusbarStart);
    const statusbarSource = appComposerShellSource.slice(statusbarStart, statusbarEnd);

    expect(statusbarStart).toBeGreaterThan(-1);
    expect(statusbarSource).toContain("<ClipboardPaste size={13}");
    expect(statusbarSource).toContain("<Bot size={13}");
    expect(statusbarSource).toContain("<Zap size={13}");
    expect(statusbarSource).toContain("<Shield size={13}");
  });

  it("wires goal mode into the composer and statusbar controls", () => {
    const settingsStart = appComposerShellSource.indexOf('className="composer-settings-controls"');
    const settingsEnd = appComposerShellSource.indexOf("</div>", settingsStart);
    const settingsSource = appComposerShellSource.slice(settingsStart, settingsEnd);
    const statusbarStart = appComposerShellSource.indexOf('className="statusbar"');
    const statusbarEnd = appComposerShellSource.indexOf("</footer>", statusbarStart);
    const statusbarSource = appComposerShellSource.slice(statusbarStart, statusbarEnd);

    expect(settingsSource).toContain("<GoalModeComposerToggle");
    expect(goalControlsSource).toContain("Target,");
    expect(goalControlsSource).toContain("function ThreadGoalStatusIcon");
    expect(goalControlsSource).toContain('goal.status === "paused"');
    expect(appSource).toContain("runtimeActivityVisibleForThreadGoal(activity, state.activeThreadGoal)");
    expect(appComposerSubmitActionsSource).toContain("goalMode: { enabled: true }");
    expect(appSource).toContain('"thread-goal-updated"');
    expect(appSource).toContain('event.type === "thread-goal-updated"');
    expect(statusbarSource).toContain("<GoalStatusControl");
    expect(stylesSource).toContain(".goal-mode-toggle");
    expect(stylesSource).toContain(".goal-status-menu");
    expect(stylesSource).toContain(".goal-status-chip.active:active");
    expect(stylesSource).toContain(".goal-status-chip.paused");
  });

  it("handles deterministic goal completion messages and celebration UI", () => {
    expect(appMessagesSource).toContain('const GOAL_COMPLETION_MESSAGE_KIND = "goal-completion";');
    expect(appMessagesSource).toContain("function isGoalCompletionMessage");
    expect(appSource).toContain("triggerGoalCompletionCelebration(event.message.id)");
    expect(appConversationMessagesSource).toContain("<GoalCompletionConfetti");
    expect(goalControlsSource).toContain("function GoalCompletionConfetti");
    expect(goalControlsSource).toContain('goal.status === "complete" ? "Clear completed goal"');
    expect(stylesSource).toContain(".message.goal-completion-message .message-content");
    expect(stylesSource).toContain(".goal-completion-confetti");
    expect(stylesSource).toContain("@keyframes goalConfettiFall");
    expect(stylesSource).toContain("@media (prefers-reduced-motion: reduce)");
  });
});

function cssRule(selector: string): string {
  const start = stylesSource.indexOf(`${selector} {`);
  expect(start).toBeGreaterThan(-1);
  const end = stylesSource.indexOf("}", start);
  expect(end).toBeGreaterThan(start);
  return stylesSource.slice(start, end + 1);
}
