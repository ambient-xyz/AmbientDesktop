import {
  BookOpenText,
  ChevronDown,
  Gauge,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  LOCAL_DEEP_RESEARCH_EFFORT_ORDER,
  LOCAL_DEEP_RESEARCH_EFFORT_PRESETS,
  localDeepResearchEffortLabel,
} from "../../shared/localDeepResearchBudget";
import type { LocalDeepResearchEffort, LocalDeepResearchRunBudget } from "../../shared/localRuntimeTypes";
import type { CollaborationMode } from "../../shared/threadTypes";

export type AppComposerLocalDeepResearchControlProps = {
  ready: boolean;
  runActive: boolean;
  modeArmed: boolean;
  collaborationMode: CollaborationMode;
  runBudget: LocalDeepResearchRunBudget;
  onToggleMode: () => void;
  onSelectEffort: (effort: LocalDeepResearchEffort) => void;
  onCustomMaxToolCallsChange: (maxToolCalls: number) => void;
};

export function AppComposerLocalDeepResearchControl({
  ready,
  runActive,
  modeArmed,
  collaborationMode,
  runBudget,
  onToggleMode,
  onSelectEffort,
  onCustomMaxToolCallsChange,
}: AppComposerLocalDeepResearchControlProps) {
  const [effortOpen, setEffortOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState(() => String(runBudget.maxToolCalls));
  const effortRef = useRef<HTMLDivElement | null>(null);
  const effortLabelText = `Effort: ${localDeepResearchEffortLabel(runBudget.effort)}`;

  useEffect(() => {
    if (!modeArmed) setEffortOpen(false);
  }, [modeArmed]);

  useEffect(() => {
    if (runActive) setEffortOpen(false);
  }, [runActive]);

  useEffect(() => {
    if (!effortOpen) setCustomDraft(String(runBudget.maxToolCalls));
  }, [effortOpen, runBudget.maxToolCalls]);

  useEffect(() => {
    if (!effortOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!effortRef.current?.contains(event.target as Node)) setEffortOpen(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setEffortOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [effortOpen]);

  function selectEffort(effort: LocalDeepResearchEffort) {
    onSelectEffort(effort);
    setCustomDraft(String(effort === "custom" ? runBudget.maxToolCalls : LOCAL_DEEP_RESEARCH_EFFORT_PRESETS[effort].maxToolCalls));
    setEffortOpen(false);
  }

  function changeCustomMaxToolCalls(value: string) {
    setCustomDraft(value);
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) onCustomMaxToolCallsChange(parsed);
  }

  if (!ready) return null;

  return (
    <>
      <button
        type="button"
        className={`icon-button subtle local-deep-research-composer-button ${modeArmed ? "active" : ""}`}
        data-tooltip={
          collaborationMode === "planner"
            ? "Switch to Agent mode before running Local Deep Research."
            : modeArmed
              ? "Local Deep Research on"
              : "Local Deep Research"
        }
        aria-label={modeArmed ? "Disable Local Deep Research" : "Enable Local Deep Research"}
        aria-pressed={modeArmed}
        disabled={runActive || collaborationMode === "planner"}
        onClick={onToggleMode}
      >
        <BookOpenText size={17} />
      </button>
      {modeArmed && (
        <div className="local-deep-research-effort-picker" ref={effortRef}>
          <button
            type="button"
            className="local-deep-research-effort-chip"
            data-tooltip={`Local Deep Research effort: ${runBudget.maxToolCalls.toLocaleString()} tool calls.`}
            aria-label={`Local Deep Research ${effortLabelText}`}
            aria-haspopup="menu"
            aria-expanded={effortOpen}
            disabled={runActive}
            onClick={() => setEffortOpen((open) => !open)}
          >
            <Gauge size={14} />
            <span>{effortLabelText}</span>
            <ChevronDown size={13} />
          </button>
          {effortOpen && (
            <div className="local-deep-research-effort-menu" role="menu" aria-label="Research effort">
              <div className="local-deep-research-effort-menu-heading">Research effort</div>
              {LOCAL_DEEP_RESEARCH_EFFORT_ORDER.map((effort) => {
                const selected = runBudget.effort === effort;
                return (
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    className={`local-deep-research-effort-option ${selected ? "active" : ""}`}
                    key={effort}
                    onClick={() => selectEffort(effort)}
                  >
                    <span>{localDeepResearchEffortLabel(effort)}</span>
                    <small>{LOCAL_DEEP_RESEARCH_EFFORT_PRESETS[effort].maxToolCalls.toLocaleString()} tool calls</small>
                  </button>
                );
              })}
              <label className="local-deep-research-custom-budget">
                <span>Custom max tool calls</span>
                <input
                  type="number"
                  min={1}
                  max={500}
                  step={1}
                  value={customDraft}
                  onChange={(event) => changeCustomMaxToolCalls(event.target.value)}
                  onBlur={() => setCustomDraft(String(runBudget.maxToolCalls))}
                />
              </label>
            </div>
          )}
        </div>
      )}
    </>
  );
}
