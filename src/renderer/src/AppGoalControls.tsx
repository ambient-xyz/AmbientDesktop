import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Clock,
  LoaderCircle,
  Pause,
  Pencil,
  Play,
  Target,
  Trash2,
} from "lucide-react";
import type { CSSProperties } from "react";

import type { RuntimeActivity, ThreadGoal } from "../../shared/types";

export const GOAL_COMPLETION_CELEBRATION_MS = 2200;

const GOAL_COMPLETION_CONFETTI_COLORS = ["#31976a", "#2f80ed", "#f2b84b", "#d65f5f", "#24a6a8", "#7a6ff0"];
const GOAL_COMPLETION_CONFETTI_PIECES = Array.from({ length: 30 }, (_, index) => ({
  x: 8 + ((index * 17) % 84),
  dx: (index % 2 === 0 ? 1 : -1) * (18 + ((index * 13) % 58)),
  y: 180 + ((index * 23) % 220),
  delay: (index % 10) * 36,
  duration: 1200 + ((index * 29) % 520),
  rotation: (index * 47) % 360,
  spin: 180 + ((index * 31) % 360),
  color: GOAL_COMPLETION_CONFETTI_COLORS[index % GOAL_COMPLETION_CONFETTI_COLORS.length],
  shape: index % 3 === 0 ? "square" : "strip",
}));

export function GoalCompletionConfetti() {
  return (
    <div className="goal-completion-confetti" aria-hidden="true">
      {GOAL_COMPLETION_CONFETTI_PIECES.map((piece, index) => (
        <span
          key={index}
          className={`goal-completion-confetti-piece ${piece.shape}`}
          style={{
            "--goal-confetti-x": `${piece.x}%`,
            "--goal-confetti-dx": `${piece.dx}px`,
            "--goal-confetti-y": `${piece.y}px`,
            "--goal-confetti-delay": `${piece.delay}ms`,
            "--goal-confetti-duration": `${piece.duration}ms`,
            "--goal-confetti-rotation": `${piece.rotation}deg`,
            "--goal-confetti-spin": `${piece.spin}deg`,
            "--goal-confetti-color": piece.color,
          } as CSSProperties}
        />
      ))}
    </div>
  );
}

export function threadGoalStatusLabel(goal: ThreadGoal): string {
  if (goal.status === "active") return "Pursuing goal";
  if (goal.status === "paused") return "Goal paused";
  if (goal.status === "blocked") return "Goal blocked";
  if (goal.status === "budget_limited") return "Goal budget hit";
  if (goal.status === "usage_limited") return "Goal limit hit";
  return "Goal complete";
}

export function threadGoalBudgetLabel(goal: ThreadGoal): string {
  if (goal.tokenBudget === undefined) return `${goal.tokensUsed.toLocaleString()} tokens`;
  const remaining = Math.max(0, goal.tokenBudget - goal.tokensUsed);
  return `${remaining.toLocaleString()} left`;
}

export function threadGoalTitle(goal: ThreadGoal): string {
  return [
    goal.objective,
    `Status: ${goal.status}`,
    `Usage: ${goal.tokensUsed.toLocaleString()} tokens, ${goal.timeUsedSeconds.toLocaleString()} seconds`,
    goal.tokenBudget !== undefined ? `Budget: ${goal.tokenBudget.toLocaleString()} tokens` : undefined,
    goal.statusReason,
  ].filter(Boolean).join("\n");
}

export function runtimeActivityVisibleForThreadGoal(activity: RuntimeActivity, goal?: ThreadGoal): boolean {
  if (activity.kind !== "goal") return true;
  if (activity.status === "continuing") return Boolean(goal && goal.status === "active" && goal.goalId === activity.goalId);
  return true;
}

export function ThreadGoalStatusIcon({ goal, size }: { goal: ThreadGoal; size: number }) {
  if (goal.status === "paused") return <Pause size={size} aria-hidden="true" />;
  if (goal.status === "blocked" || goal.status === "budget_limited" || goal.status === "usage_limited") {
    return <AlertCircle size={size} aria-hidden="true" />;
  }
  if (goal.status === "complete") return <CheckCircle2 size={size} aria-hidden="true" />;
  return <Target size={size} aria-hidden="true" />;
}

export function GoalModeComposerToggle({
  goal,
  armed,
  disabled,
  busy,
  onToggle,
}: {
  goal?: ThreadGoal;
  armed: boolean;
  disabled: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  const selected = armed || goal?.status === "active";
  const label = goal ? (goal.status === "complete" ? "Clear completed goal" : goal.status === "active" ? "Pursue goal" : "Resume goal") : "Pursue goal";
  const title = disabled
    ? "Goal mode is disabled while Planner mode is active."
    : goal
      ? `${threadGoalStatusLabel(goal)}. ${goal.objective}`
      : armed
        ? "The next prompt will become a durable goal."
        : "Use the next prompt as a durable goal Ambient can continue pursuing.";
  return (
    <button
      type="button"
      className={`goal-mode-toggle ${selected ? "selected" : ""}`}
      data-tooltip={title}
      aria-label={label}
      aria-pressed={selected}
      disabled={disabled || busy}
      onClick={onToggle}
    >
      {busy
        ? <LoaderCircle size={14} className="spin" />
        : goal
          ? <ThreadGoalStatusIcon goal={goal} size={14} />
          : <Target size={14} />}
      <span>{label}</span>
    </button>
  );
}

export function GoalStatusControl({
  goal,
  menuOpen,
  busy,
  onToggleMenu,
  onPauseResume,
  onEditObjective,
  onSetBudget,
  onClear,
}: {
  goal: ThreadGoal;
  menuOpen: boolean;
  busy: boolean;
  onToggleMenu: () => void;
  onPauseResume: () => void;
  onEditObjective: () => void;
  onSetBudget: () => void;
  onClear: () => void;
}) {
  const canResume = goal.status !== "active" && goal.status !== "complete";
  return (
    <div className="goal-status-control">
      <button
        type="button"
        className={`statusbar-chip goal-status-chip ${goal.status}`}
        title={threadGoalTitle(goal)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={onToggleMenu}
      >
        <ThreadGoalStatusIcon goal={goal} size={13} />
        <span>{threadGoalStatusLabel(goal)}</span>
        <small>{threadGoalBudgetLabel(goal)}</small>
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {menuOpen && (
        <div className="goal-status-menu" role="menu">
          <div className="goal-status-menu-summary">
            <strong>{threadGoalStatusLabel(goal)}</strong>
            <p>{goal.objective}</p>
            {goal.statusReason && <small>{goal.statusReason}</small>}
          </div>
          {goal.status !== "complete" && (
            <button type="button" role="menuitem" disabled={busy} onClick={onPauseResume}>
              {goal.status === "active" ? <Pause size={13} /> : <Play size={13} />}
              {goal.status === "active" ? "Pause" : canResume ? "Resume" : "Resume"}
            </button>
          )}
          <button type="button" role="menuitem" disabled={busy} onClick={onEditObjective}>
            <Pencil size={13} />
            Edit objective
          </button>
          <button type="button" role="menuitem" disabled={busy} onClick={onSetBudget}>
            <Clock size={13} />
            Set budget
          </button>
          <button type="button" role="menuitem" className="danger" disabled={busy} onClick={onClear}>
            <Trash2 size={13} />
            Clear goal
          </button>
        </div>
      )}
    </div>
  );
}
