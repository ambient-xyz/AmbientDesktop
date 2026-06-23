import {
  Bot,
  Brain,
  ChevronDown,
  Kanban,
  RefreshCw,
} from "lucide-react";
import type {
  Dispatch,
  RefObject,
  SetStateAction,
} from "react";

import type { DesktopState, ThinkingDisplayMode } from "../../shared/desktopTypes";
import type { PermissionMode } from "../../shared/permissionTypes";
import type { PlannerPlanArtifact } from "../../shared/plannerTypes";
import type { CollaborationMode, ThinkingLevel } from "../../shared/threadTypes";
import { GoalModeComposerToggle } from "./AppGoalControls";
import type { ProjectBoardThreadPlanActionState } from "./projectBoardUiModel";
import {
  SegmentedCollaborationMode,
  SegmentedPermission,
} from "./AppComposerControls";
import { modelReasoningControlModel } from "./modelReasoningUiModel";
import { thinkingDisplayOptions } from "./RightPanel";
import { thinkingDisplayModeLabel } from "./thinkingDisplayUiModel";

export type ComposerModelOption = {
  id: string;
  label: string;
};

export type AppComposerSettingsControlsProps = {
  state: DesktopState;
  running: boolean;
  goalModeArmed: boolean;
  goalBusy: boolean;
  showRevisePlanControl: boolean;
  activeThreadSuppressesProjectBoard: boolean;
  projectBoardThreadPlanAction: ProjectBoardThreadPlanActionState;
  projectBoardPlanPickerOpen: boolean;
  readyPlannerPlanArtifacts: PlannerPlanArtifact[];
  modelPickerRef: RefObject<HTMLDivElement | null>;
  modelPickerButtonRef: RefObject<HTMLButtonElement | null>;
  modelPickerOpen: boolean;
  composerModelOptions: ComposerModelOption[];
  selectedComposerModelOption: ComposerModelOption;
  onCollaborationModeChange: (collaborationMode: CollaborationMode) => void;
  onToggleGoalMode: () => void;
  onPermissionModeChange: (permissionMode: PermissionMode) => void;
  onReviseLatestPlannerPlan: () => void;
  onRunProjectBoardThreadPlanAction: () => void;
  onAddPlannerPlanToBoard: (artifact: PlannerPlanArtifact) => void;
  onThinkingDisplayModeChange: (mode: ThinkingDisplayMode) => void;
  onThinkingLevelChange: (level: ThinkingLevel) => void;
  setModelPickerOpen: Dispatch<SetStateAction<boolean>>;
  onFocusModelPickerOption: (index?: number) => void;
  onSelectComposerModel: (modelId: string) => void;
};

export function AppComposerSettingsControls({
  state,
  running,
  goalModeArmed,
  goalBusy,
  showRevisePlanControl,
  activeThreadSuppressesProjectBoard,
  projectBoardThreadPlanAction,
  projectBoardPlanPickerOpen,
  readyPlannerPlanArtifacts,
  modelPickerRef,
  modelPickerButtonRef,
  modelPickerOpen,
  composerModelOptions,
  selectedComposerModelOption,
  onCollaborationModeChange,
  onToggleGoalMode,
  onPermissionModeChange,
  onReviseLatestPlannerPlan,
  onRunProjectBoardThreadPlanAction,
  onAddPlannerPlanToBoard,
  onThinkingDisplayModeChange,
  onThinkingLevelChange,
  setModelPickerOpen,
  onFocusModelPickerOption,
  onSelectComposerModel,
}: AppComposerSettingsControlsProps) {
  const modelReasoning = modelReasoningControlModel(state.settings.model, state.settings.thinkingLevel);

  return (
    <div className="composer-settings-controls" aria-label="Composer settings">
      <SegmentedCollaborationMode
        value={state.settings.collaborationMode}
        onChange={onCollaborationModeChange}
      />
      <GoalModeComposerToggle
        goal={state.activeThreadGoal}
        armed={goalModeArmed}
        disabled={state.settings.collaborationMode === "planner"}
        busy={goalBusy}
        onToggle={onToggleGoalMode}
      />
      <SegmentedPermission
        value={state.settings.permissionMode}
        onChange={onPermissionModeChange}
      />
      {state.settings.collaborationMode === "planner" && showRevisePlanControl && (
        <div className="project-board-plan-control">
          <button
            type="button"
            data-tooltip="Revise the latest plan with composer feedback."
            aria-label="Revise Plan with feedback"
            disabled={running}
            onClick={onReviseLatestPlannerPlan}
          >
            <RefreshCw size={14} />
            <span>Revise Plan</span>
          </button>
        </div>
      )}
      {!activeThreadSuppressesProjectBoard && (
        <div className="project-board-plan-control">
          <button
            type="button"
            data-tooltip={projectBoardThreadPlanAction.title}
            aria-label="Add Plan to Board"
            disabled={projectBoardThreadPlanAction.disabled}
            onClick={onRunProjectBoardThreadPlanAction}
          >
            <Kanban size={14} />
            <span>{projectBoardThreadPlanAction.label}</span>
            {projectBoardThreadPlanAction.kind === "multiple_ready_plans" && <ChevronDown size={13} />}
          </button>
          {projectBoardPlanPickerOpen && readyPlannerPlanArtifacts.length > 1 && (
            <div className="project-board-plan-picker" role="menu" aria-label="Ready plans">
              {readyPlannerPlanArtifacts.map((artifact) => (
                <button type="button" role="menuitem" key={artifact.id} onClick={() => onAddPlannerPlanToBoard(artifact)}>
                  <span>{artifact.title}</span>
                  <small>{artifact.summary || `${artifact.steps.length} step${artifact.steps.length === 1 ? "" : "s"}`}</small>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <label
        className="thinking-display-control"
        data-tooltip="Choose whether assistant thinking is hidden, temporary, or retained."
        aria-label={`Thinking display: ${thinkingDisplayModeLabel(state.settings.thinkingDisplay.mode)}`}
      >
        <Brain size={14} />
        <select
          aria-label="Thinking display"
          value={state.settings.thinkingDisplay.mode}
          onChange={(event) => onThinkingDisplayModeChange(event.target.value as ThinkingDisplayMode)}
        >
          {thinkingDisplayOptions.map((option) => (
            <option key={option} value={option}>
              Thinking: {thinkingDisplayModeLabel(option)}
            </option>
          ))}
        </select>
      </label>
      {modelReasoning.kind === "selectable" && (
        <label
          className="model-reasoning-control"
          data-tooltip={modelReasoning.tooltip}
          aria-label={`Reasoning mode: ${modelReasoning.label}`}
        >
          <Brain size={14} />
          <select
            aria-label="Reasoning mode"
            value={modelReasoning.value}
            onChange={(event) => onThinkingLevelChange(event.target.value as ThinkingLevel)}
          >
            {modelReasoning.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {modelReasoning.kind === "fixed" && (
        <div
          className="model-reasoning-fixed-control"
          data-tooltip={modelReasoning.tooltip}
          aria-label={`Reasoning mode: ${modelReasoning.label}`}
        >
          <Brain size={14} />
          <span>{modelReasoning.label}</span>
        </div>
      )}
      <div className="model-picker" ref={modelPickerRef}>
        <button
          ref={modelPickerButtonRef}
          type="button"
          className="model-picker-button"
          aria-haspopup="listbox"
          aria-expanded={modelPickerOpen}
          aria-controls="composer-model-picker-listbox"
          aria-label={`Model: ${selectedComposerModelOption.label}`}
          data-tooltip={`Model: ${selectedComposerModelOption.label}`}
          onClick={() => setModelPickerOpen((open) => !open)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setModelPickerOpen(true);
              onFocusModelPickerOption(Math.max(composerModelOptions.findIndex((option) => option.id === selectedComposerModelOption.id), 0));
            }
          }}
        >
          <Bot size={14} />
          <span>{selectedComposerModelOption.label}</span>
          <ChevronDown size={13} />
        </button>
        {modelPickerOpen && (
          <div className="model-picker-menu" id="composer-model-picker-listbox" role="listbox" aria-label="Model">
            {composerModelOptions.map((option, index) => {
              const selected = option.id === selectedComposerModelOption.id;
              return (
                <button
                  type="button"
                  role="option"
                  id={`composer-model-picker-option-${index}`}
                  aria-selected={selected}
                  className={`model-picker-option ${selected ? "active" : ""}`}
                  key={option.id}
                  onKeyDown={(event) => {
                    const nextIndex = (offset: number) => {
                      event.preventDefault();
                      const options = [...document.querySelectorAll<HTMLButtonElement>(".model-picker-option")];
                      options[Math.max(0, Math.min(options.length - 1, index + offset))]?.focus();
                    };
                    if (event.key === "ArrowDown") nextIndex(1);
                    if (event.key === "ArrowUp") nextIndex(-1);
                    if (event.key === "Home") {
                      event.preventDefault();
                      onFocusModelPickerOption(0);
                    }
                    if (event.key === "End") {
                      event.preventDefault();
                      onFocusModelPickerOption(composerModelOptions.length - 1);
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setModelPickerOpen(false);
                      modelPickerButtonRef.current?.focus();
                    }
                  }}
                  onClick={() => {
                    setModelPickerOpen(false);
                    if (!selected) onSelectComposerModel(option.id);
                  }}
                >
                  <span>{option.label}</span>
                  <small>{option.id}</small>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
