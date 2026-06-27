import { AlertCircle, CheckCircle2, FileText, ListFilter, LoaderCircle, Shield } from "lucide-react";
import { useEffect, useRef } from "react";

import type { ToolLargeOutputPreview, ToolLongformInputPreview } from "../../shared/threadTypes";
import { DiffOutput } from "./RightPanelGitPane";
import { RichText } from "./RightPanelRichText";
import { toolLargeOutputPreviewViewModel, toolLongformInputPreviewDisplaySummary } from "./toolMessageContentPreviewUiModel";
import type { ToolEditPreviewData, ToolInstallRoutePreviewData } from "./toolMessageEditPreviewUiModel";
import type { ToolProgressPreviewData } from "./toolMessageProgressUiModel";

const COMPLETED_LARGE_OUTPUT_RESULT_INLINE_LIMIT = 2_000;

export function shouldRenderToolResultSection({
  result,
  hasLargeOutputPreview,
  status,
}: {
  result?: string;
  hasLargeOutputPreview: boolean;
  status?: string;
}): boolean {
  if (!result) return false;
  if (!hasLargeOutputPreview) return true;
  if (status === "running" || status === "error") return true;
  return result.trim().length > 0 && result.length <= COMPLETED_LARGE_OUTPUT_RESULT_INLINE_LIMIT;
}

export function ToolSection({
  title,
  content,
  workspacePath,
  onPreviewPath,
  onPreviewLocalPath,
  onOpenUrl,
  onOpenBrowserUrl,
}: {
  title: string;
  content: string;
  workspacePath: string;
  onPreviewPath: (path: string) => void;
  onPreviewLocalPath: (path: string) => void;
  onOpenUrl: (url: string) => void;
  onOpenBrowserUrl: (url: string) => void;
}) {
  return (
    <section className="tool-section">
      <div className="tool-section-title">{title}</div>
      <RichText
        content={content}
        compact
        workspacePath={workspacePath}
        onPreviewPath={onPreviewPath}
        onPreviewLocalPath={onPreviewLocalPath}
        onOpenUrl={onOpenUrl}
        onOpenBrowserUrl={onOpenBrowserUrl}
      />
    </section>
  );
}

export function ToolLongformInputPreviewView({ preview, running }: { preview: ToolLongformInputPreview; running: boolean }) {
  const codeRef = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (!running) return;
    codeRef.current?.scrollTo({ top: codeRef.current.scrollHeight });
  }, [preview.items, running]);

  return (
    <section className={`tool-longform-input-preview ${running ? "running" : ""}`}>
      <div className="tool-section-title">
        {running ? (preview.runningTitle ?? preview.title ?? "Input") : (preview.title ?? "Input")}
        <code>{toolLongformInputPreviewDisplaySummary(preview)}</code>
      </div>
      <div className="tool-longform-items">
        {preview.items.map((item, index) => (
          <div className="tool-longform-item" key={`${item.fieldPath}-${item.path ?? index}`}>
            <div className="tool-section-title">
              <span>{item.label}</span>
              {item.path && <code>{item.path}</code>}
              <code>
                {item.chars.toLocaleString()} chars
                {item.truncated ? " total" : ""}
              </code>
            </div>
            {item.note && <p className="tool-longform-note">{item.note}</p>}
            <pre className="tool-write-code" ref={index === preview.items.length - 1 ? codeRef : undefined}>
              {item.language && <span>{item.language}</span>}
              <code>{item.preview || "(empty)"}</code>
            </pre>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ToolProgressPreviewView({ preview }: { preview: ToolProgressPreviewData }) {
  return (
    <section className="tool-progress-preview">
      <div className="tool-section-title">
        {preview.title}
        <code>{preview.summary}</code>
      </div>
      <div className="tool-progress-rows">
        {preview.rows.map((row) => (
          <div className="tool-progress-row" key={row.key}>
            <span>{row.label}</span>
            <code>{row.value}</code>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ToolLargeOutputPreviewView({
  preview,
  onPreviewPath,
}: {
  preview: ToolLargeOutputPreview;
  onPreviewPath: (path: string) => void;
}) {
  const model = toolLargeOutputPreviewViewModel(preview);
  return (
    <section className="tool-large-output-preview">
      <div className="tool-section-title">
        {model.title}
        <code>{model.summary}</code>
      </div>
      <div className="tool-large-output-items">
        {model.rows.map((item) => (
          <div className="tool-large-output-item" key={item.key}>
            <div className="tool-large-output-row">
              <span>{item.label}</span>
              <code>{item.charsLabel}</code>
              {item.previewCharsLabel && <code>{item.previewCharsLabel}</code>}
              {item.bytesLabel && <code>{item.bytesLabel}</code>}
            </div>
            {item.artifactPath && (
              <button
                type="button"
                className="artifact-link"
                onClick={() => onPreviewPath(item.artifactPath!)}
                title={`Preview ${item.artifactPath}`}
              >
                <FileText size={13} />
                <span>{item.artifactPath}</span>
              </button>
            )}
            {item.suggestedToolsLabel ? <p className="tool-large-output-note">{item.suggestedToolsLabel}</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

export function ToolInstallRoutePreview({ preview }: { preview: ToolInstallRoutePreviewData }) {
  const tone =
    preview.blockers.length > 0 || preview.lane === "unsupported"
      ? "blocked"
      : preview.approvalBoundary === "privileged-approval-required"
        ? "privileged"
        : "ready";
  const chips = [
    preview.confidence,
    preview.approvalBoundary,
    preview.validationKind,
    preview.requiresSecret ? (preview.secretMechanism ?? "secret required") : undefined,
  ].filter((item): item is string => Boolean(item));
  const notes = preview.blockers.length ? preview.blockers : preview.warnings;
  return (
    <section className={`tool-install-route-preview ${tone}`}>
      <div className="tool-section-title">
        {tone === "ready" ? <ListFilter size={12} /> : <Shield size={12} />}
        Install route
        <code>{preview.lane}</code>
      </div>
      <p className="tool-install-route-reason">{preview.reason}</p>
      <div className="tool-install-route-chips">
        {chips.map((chip) => (
          <code key={chip}>{chip}</code>
        ))}
      </div>
      {preview.nextTools.length > 0 ? (
        <div className="tool-install-route-next">
          <span>Next</span>
          {preview.nextTools.map((tool) => (
            <code key={tool}>{tool}</code>
          ))}
        </div>
      ) : (
        <p className="tool-install-route-empty">No install tool should be called for this route.</p>
      )}
      {notes.length > 0 && (
        <ul className="tool-install-route-notes">
          {notes.slice(0, 3).map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
      {preview.validationDescription && <p className="tool-install-route-validation">{preview.validationDescription}</p>}
    </section>
  );
}

export function ToolEditPreview({ preview, running }: { preview: ToolEditPreviewData; running: boolean }) {
  const lineLabel = preview.firstChangedLine !== undefined ? `Line ${preview.firstChangedLine}` : undefined;
  return (
    <section className={`tool-edit-preview ${running ? "running" : ""}`}>
      <div className="tool-section-title">
        {preview.diff ? "Edit diff" : running ? "Editing" : "Edit input"}
        {preview.path && <code>{preview.path}</code>}
        {lineLabel && <code>{lineLabel}</code>}
      </div>
      {preview.diff ? (
        <DiffOutput diff={preview.diff} />
      ) : preview.edits.length > 0 ? (
        <div className="tool-edit-blocks">
          {preview.edits.map((edit, index) => {
            const oldCountLabel = editTextCountLabel(edit.oldTextChars, edit.oldText.length, edit.oldTextTruncated);
            const newCountLabel = editTextCountLabel(edit.newTextChars, edit.newText.length, edit.newTextTruncated);
            return (
              <div className="tool-edit-block" key={`${index}-${edit.oldText.slice(0, 18)}-${edit.newText.slice(0, 18)}`}>
                <div className="tool-edit-block-title">{preview.edits.length === 1 ? "Replacement" : `Replacement ${index + 1}`}</div>
                <div className="tool-edit-sides">
                  <div className="tool-edit-pane removed">
                    <span>
                      <span>Before</span>
                      {oldCountLabel && <code>{oldCountLabel}</code>}
                    </span>
                    <pre>{edit.oldText || "(empty text)"}</pre>
                  </div>
                  <div className="tool-edit-pane added">
                    <span>
                      <span>After</span>
                      {newCountLabel && <code>{newCountLabel}</code>}
                    </span>
                    <pre>{edit.newText || "(empty text)"}</pre>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="panel-note">No edit preview available.</p>
      )}
    </section>
  );
}

export function editTextCountLabel(chars: number | undefined, previewChars: number, truncated: boolean | undefined): string | undefined {
  if (chars === undefined) return undefined;
  if (truncated && previewChars < chars) {
    return `${chars.toLocaleString()} chars total · ${previewChars.toLocaleString()} preview`;
  }
  return `${chars.toLocaleString()} chars`;
}

export function isBrowserToolName(toolName: string): boolean {
  return toolName.toLowerCase().startsWith("browser_");
}

export function ToolStatusIcon({ status }: { status?: string }) {
  if (status === "running") return <LoaderCircle size={14} className="spin" />;
  if (status === "error") return <AlertCircle size={14} />;
  return <CheckCircle2 size={14} />;
}
