import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  LoaderCircle,
  Target,
} from "lucide-react";

import type { ThreadGoal } from "../../shared/threadTypes";
import {
  runtimeStatusIndicatorMessage,
  type RuntimeStatusIndicator,
} from "./runtimeStatusIndicatorUiModel";

export function RuntimeStatusStrips({
  activeGoal,
  indicators,
}: {
  activeGoal?: ThreadGoal;
  indicators: RuntimeStatusIndicator[];
}) {
  if (indicators.length === 0) return null;
  return (
    <div className="runtime-status-strip-stack" aria-live="polite">
      {indicators.map((indicator) => (
        <div
          className={`runtime-status-strip ${indicator.kind} ${indicator.tone}`}
          data-runtime-status-kind={indicator.kind}
          data-runtime-status-phase={indicator.phase}
          key={indicator.id}
        >
          <span className="runtime-status-strip-icon" aria-hidden="true">
            {runtimeStatusIndicatorIcon(indicator)}
          </span>
          <span className="runtime-status-strip-content">
            <strong>{indicator.title}</strong>
            <span>{runtimeStatusIndicatorMessage(indicator, activeGoal)}</span>
          </span>
          {indicator.phase !== "finished" && (
            <span className="runtime-status-progress" aria-hidden="true">
              <span />
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function runtimeStatusIndicatorIcon(indicator: RuntimeStatusIndicator) {
  if (indicator.phase !== "finished") return <LoaderCircle size={15} className="spin" />;
  if (indicator.tone === "warning") return <AlertTriangle size={15} />;
  if (indicator.kind === "compaction") return <Archive size={15} />;
  if (indicator.kind === "goal-continuation") return <Target size={15} />;
  return <CheckCircle2 size={15} />;
}
