import { ChevronRight, ExternalLink } from "lucide-react";
import type { MouseEvent } from "react";

import type { SubagentThreadInspectorModel } from "./subagentThreadInspectorUiModel";

export function SubagentThreadInspector({
  model,
  defaultOpen = false,
  onOpenParentThread,
}: {
  model: SubagentThreadInspectorModel;
  defaultOpen?: boolean;
  onOpenParentThread?: (model: SubagentThreadInspectorModel) => void | Promise<void>;
}) {
  const parentThreadAvailable = Boolean(model.parentThreadId && onOpenParentThread);
  const openParentThread = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!onOpenParentThread || !model.parentThreadId) return;
    void onOpenParentThread(model);
  };

  return (
    <details
      className="subagent-thread-inspector"
      aria-label="Sub-agent run details"
      data-subagent-run-id={model.runId}
      data-subagent-parent-thread-id={model.parentThreadId ?? ""}
      data-subagent-parent-barrier-visible={String(Boolean(model.parentBarrier))}
      {...(defaultOpen ? { open: true } : {})}
    >
      <summary className="subagent-thread-inspector-main" title="Expand sub-agent run details">
        <div>
          <span className="subagent-thread-kicker">Sub-agent</span>
          <strong>{model.title}</strong>
          {model.parentBarrier && (
            <span className={`subagent-thread-parent-barrier tone-${model.parentBarrier.tone}`} title={model.parentBarrier.detail}>
              {model.parentBarrier.label}
            </span>
          )}
        </div>
        <span className="subagent-thread-status-wrap">
          {parentThreadAvailable && (
            <button
              type="button"
              className="subagent-thread-open-parent"
              aria-label={`Open parent thread ${model.parentThreadId}`}
              title="Open parent thread"
              onClick={openParentThread}
            >
              <ExternalLink size={12} aria-hidden="true" />
              <span>Parent</span>
            </button>
          )}
          <span className={`subagent-thread-status tone-${model.statusTone}`}>{model.status}</span>
          <ChevronRight className="subagent-thread-disclosure" size={14} aria-hidden="true" />
        </span>
      </summary>
      <div className="subagent-thread-inspector-body">
        <div className="subagent-thread-badges" aria-label="Sub-agent summary">
          {model.badges.map((badge) => (
            <span key={badge}>{badge}</span>
          ))}
        </div>
        <dl className="subagent-thread-details">
          {model.rows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd title={row.value}>{row.value}</dd>
            </div>
          ))}
        </dl>
        {model.waitBarrierRows.length > 0 && (
          <dl className="subagent-thread-wait-barriers" aria-label="Parent wait barrier involving this child">
            {model.waitBarrierRows.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd title={row.value}>{row.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {model.modelScopeRows.length > 0 && (
          <dl className="subagent-thread-model-scope" aria-label="Sub-agent model resolution">
            {model.modelScopeRows.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd title={row.value}>{row.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {model.toolScopeRows.length > 0 && (
          <dl className="subagent-thread-tool-scope" aria-label="Sub-agent tool scope">
            {model.toolScopeRows.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd title={row.value}>{row.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {model.repairRows.length > 0 && (
          <div className="subagent-thread-events" aria-label="Sub-agent repair diagnostics">
            {model.repairRows.map((row) => (
              <div key={row.key}>
                <span>{row.categoryLabel}: {row.title}</span>
                <small title={row.detail}>
                  {row.detail}
                  {row.actionLabel ? ` | ${row.actionLabel}` : ""}
                  {row.meta ? ` | ${row.meta}` : ""}
                </small>
              </div>
            ))}
          </div>
        )}
        {model.recentEvents.length > 0 && (
          <div className="subagent-thread-events" aria-label="Recent sub-agent events">
            {model.recentEvents.map((event) => (
              <div key={event.key}>
                <span>{event.label}</span>
                <small title={event.value}>{event.value}</small>
              </div>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}
