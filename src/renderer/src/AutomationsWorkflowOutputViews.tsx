import { FileText, Maximize2 } from "lucide-react";

import type { WorkflowArtifactSummary, WorkflowRunDetail, WorkflowRunSummary } from "../../shared/types";
import { AutomationHeadingLabel } from "./AutomationsHeading";
import { WorkflowRuntimeBrowserScreenshotPreview } from "./AutomationsWorkflowUtilityViews";
import { artifactMediaKindFromPath } from "./toolMessageUiModel";
import {
  formatHtmlPreviewAutoPauseLabel,
  HTML_PREVIEW_AUTO_PAUSE_MS,
  LazyHtmlPreview,
  RichText,
} from "./RightPanel";
import { workflowRunOutputCards, type WorkflowRunOutputCard } from "./workflowRunOutputUiModel";

export function WorkflowOutputsPanel({
  artifact,
  latestRun,
  detail,
  workflowBusy,
  onOpenRunDetail,
  onPreviewPath,
  onPreviewLocalPath,
  onOpenMediaModal,
}: {
  artifact?: WorkflowArtifactSummary;
  latestRun?: WorkflowRunSummary;
  detail?: WorkflowRunDetail;
  workflowBusy?: string;
  onOpenRunDetail: (runId: string) => void | Promise<unknown>;
  onPreviewPath: (path: string) => void;
  onPreviewLocalPath: (path: string) => void;
  onOpenMediaModal: (path: string, mediaKind: "image" | "video") => void;
}) {
  const cards = workflowRunOutputCards(detail);
  return (
    <div className="workflow-outputs-panel">
      <section className="workflow-manifest-section">
        <div className="panel-section-heading">
          <AutomationHeadingLabel tooltip="Retained run outputs include report paths, checkpoint previews, and output-shaped runtime event metadata.">
            Outputs
          </AutomationHeadingLabel>
          <span className="panel-note inline">
            {cards.length} item{cards.length === 1 ? "" : "s"}
          </span>
        </div>
        {!detail ? (
          <div className="workflow-artifact-empty-panel">
            <strong>Open a run to inspect outputs</strong>
            <p>{latestRun ? "Open the latest run to inspect retained outputs, reports, checkpoints, and output-shaped runtime events." : "No workflow runs are recorded for this artifact yet."}</p>
            {artifact && latestRun && (
              <button type="button" className="panel-button mini" disabled={workflowBusy === latestRun.id} onClick={() => void onOpenRunDetail(latestRun.id)}>
                {workflowBusy === latestRun.id ? "Opening" : "Open latest run"}
              </button>
            )}
          </div>
        ) : cards.length ? (
          <div className="workflow-output-list">
            {cards.map((card) => (
              <WorkflowOutputCard
                key={card.id}
                card={card}
                onPreviewPath={onPreviewPath}
                onPreviewLocalPath={onPreviewLocalPath}
                onOpenMediaModal={onOpenMediaModal}
              />
            ))}
          </div>
        ) : (
          <p className="panel-note">No retained outputs were detected for this run. The Run Console still contains the full event stream and audit report.</p>
        )}
      </section>
    </div>
  );
}

export function WorkflowOutputCard({
  card,
  onPreviewPath,
  onPreviewLocalPath,
  onOpenMediaModal,
}: {
  card: WorkflowRunOutputCard;
  onPreviewPath: (path: string) => void;
  onPreviewLocalPath: (path: string) => void;
  onOpenMediaModal: (path: string, mediaKind: "image" | "video") => void;
}) {
  const artifactMediaKind = card.artifactPath ? artifactMediaKindFromPath(card.artifactPath) : undefined;
  const previewOutputArtifact = () => {
    if (!card.artifactPath) return;
    if (isAbsoluteLocalArtifactPath(card.artifactPath)) onPreviewLocalPath(card.artifactPath);
    else if (artifactMediaKind === "image" || artifactMediaKind === "video") onOpenMediaModal(card.artifactPath, artifactMediaKind);
    else onPreviewPath(card.artifactPath);
  };
  return (
    <article className={`workflow-output-card ${card.format}`}>
      <div className="workflow-output-card-header">
        <div>
          <strong>{card.label}</strong>
          <span>{card.detail}</span>
        </div>
        <span className="workflow-output-format">{workflowOutputFormatLabel(card.format)}</span>
      </div>
      {card.metadata.length > 0 && (
        <div className="plugin-badges">
          {card.metadata.map((item) => (
            <span key={`${card.id}:${item}`}>{item}</span>
          ))}
        </div>
      )}
      {card.artifactPath && (
        <div className="workflow-output-artifact-row">
          <code className="workflow-output-path" title={card.artifactPath}>
            {card.artifactPath}
          </code>
          <button type="button" className="artifact-link compact" onClick={previewOutputArtifact} title={`Preview ${card.artifactPath}`}>
            {artifactMediaKind === "image" ? <Maximize2 size={12} /> : <FileText size={12} />}
            Preview
          </button>
        </div>
      )}
      {card.artifactPath && card.format === "image" && (
        <WorkflowRuntimeBrowserScreenshotPreview
          artifactPath={card.artifactPath}
          onPreviewPath={onPreviewPath}
          onOpenMediaModal={onOpenMediaModal}
        />
      )}
      <WorkflowOutputPreview
        card={card}
        onPreviewPath={onPreviewPath}
        onOpenMediaModal={onOpenMediaModal}
      />
    </article>
  );
}

function WorkflowOutputPreview({
  card,
  onPreviewPath,
  onOpenMediaModal,
}: {
  card: WorkflowRunOutputCard;
  onPreviewPath: (path: string) => void;
  onOpenMediaModal: (path: string, mediaKind: "image" | "video") => void;
}) {
  if (!card.preview || card.preview === card.artifactPath || card.format === "image") return null;
  if (card.format === "markdown") {
    return (
      <div className="workflow-output-preview document markdown">
        <RichText
          content={card.preview}
          compact
          onPreviewPath={onPreviewPath}
          onOpenMediaModal={onOpenMediaModal}
        />
      </div>
    );
  }
  if (card.format === "html" && workflowOutputPreviewLooksLikeHtml(card.preview)) {
    return (
      <LazyHtmlPreview
        className="workflow-output-html-preview"
        title={`${card.label} HTML preview`}
        html={workflowOutputPreviewDocument(card.preview)}
        sandbox=""
        detail={`HTML output is paused until opened; live previews auto-pause after ${formatHtmlPreviewAutoPauseLabel(HTML_PREVIEW_AUTO_PAUSE_MS)}.`}
      />
    );
  }
  if (card.format === "json") return <pre className="workflow-output-preview json">{card.preview}</pre>;
  return <div className="workflow-output-preview text">{card.preview}</div>;
}

function workflowOutputPreviewLooksLikeHtml(value: string) {
  return /^\s*<!doctype html/i.test(value) || /^\s*<html[\s>]/i.test(value) || /<\/(?:div|section|article|p|h[1-6]|table)>/i.test(value);
}

function workflowOutputPreviewDocument(value: string) {
  if (/^\s*<!doctype html/i.test(value) || /^\s*<html[\s>]/i.test(value)) return value;
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;padding:12px;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#1f2933;background:#fff;line-height:1.5}table{border-collapse:collapse;width:100%}td,th{border:1px solid #d8e1e8;padding:6px 8px;text-align:left;vertical-align:top}h1,h2,h3{margin:0 0 8px}p{margin:0 0 8px}</style></head><body>${value}</body></html>`;
}

function workflowOutputFormatLabel(format: WorkflowRunOutputCard["format"]) {
  switch (format) {
    case "html":
      return "HTML";
    case "markdown":
      return "Markdown";
    case "json":
      return "Data";
    case "image":
      return "Image";
    case "path":
      return "Path";
    default:
      return "Text";
  }
}

function isAbsoluteLocalArtifactPath(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("\\\\");
}
