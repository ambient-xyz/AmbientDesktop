import {
  ExternalLink,
  FileCode2,
  FileImage,
  FileText,
  Film,
  FolderOpen,
  LoaderCircle,
  Monitor,
  Paperclip,
  RefreshCw,
  Terminal,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { WorkspaceFileContent, WorkspaceOpenTarget } from "../../shared/workspaceTypes";
import { miniCpmVisualMediaKindFromPath } from "./miniCpmVisualActionUiModel";
import { canRefreshOfficePreview } from "./workspaceUiModel";

export const HTML_PREVIEW_AUTO_PAUSE_MS = 5 * 60 * 1000;

export function formatHtmlPreviewAutoPauseLabel(milliseconds: number) {
  const minutes = Math.max(1, Math.round(milliseconds / 60_000));
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

export function formatPanelFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function FilePreview({
  file,
  openTargets,
  onOpen,
  onAddContext,
  onAnalyzeVisual,
  visualAnalysisBusy,
  onRefreshOfficePreview,
  officePreviewRefreshing = false,
  renderRichText,
}: {
  file: WorkspaceFileContent;
  openTargets: WorkspaceOpenTarget[];
  onOpen: (targetId: string) => void;
  onAddContext: (file: WorkspaceFileContent) => void;
  onAnalyzeVisual?: (file: WorkspaceFileContent) => void;
  visualAnalysisBusy?: string;
  onRefreshOfficePreview?: (file: WorkspaceFileContent) => void;
  officePreviewRefreshing?: boolean;
  renderRichText: (content: string) => ReactNode;
}) {
  const showOfficeRefresh = canRefreshOfficePreview(file);
  const visualKind = miniCpmVisualMediaKindFromPath(file.path);
  return (
    <div className="file-viewer">
      <div className="file-viewer-header">
        <div>
          <strong title={file.path}>{file.path}</strong>
          <span>
            {formatPanelFileSize(file.size)}
            {file.kind !== "binary" ? ` · ${file.kind}` : ""}
            {file.language ? ` · ${file.language}` : ""}
          </span>
        </div>
      </div>
      {file.source === "local" && (
        <div className="file-local-preview-status" role="status">
          <FileText size={15} />
          <div>
            <strong>Local preview opened</strong>
            <span title={file.absolutePath ?? file.path}>{file.absolutePath ?? file.path}</span>
          </div>
        </div>
      )}
      <div className="file-viewer-actions">
        <button type="button" className="panel-button icon-panel-button" onClick={() => onAddContext(file)}>
          <Paperclip size={14} />
          Add context
        </button>
        {visualKind && onAnalyzeVisual && (
          <button
            type="button"
            className="panel-button icon-panel-button"
            disabled={Boolean(visualAnalysisBusy)}
            title={`Analyze ${visualKind === "video" ? "a sampled video frame" : "this image"} with MiniCPM-V`}
            onClick={() => onAnalyzeVisual(file)}
          >
            {visualAnalysisBusy === `file:${file.path}` ? (
              <LoaderCircle size={14} className="spin" />
            ) : visualKind === "video" ? (
              <Film size={14} />
            ) : (
              <FileImage size={14} />
            )}
            Analyze visual
          </button>
        )}
        {showOfficeRefresh && (
          <button
            type="button"
            className="panel-button icon-panel-button"
            disabled={officePreviewRefreshing}
            title="Retry Office preview conversion after installing LibreOffice."
            onClick={() => onRefreshOfficePreview?.(file)}
          >
            {officePreviewRefreshing ? <LoaderCircle size={14} className="spin" /> : <RefreshCw size={14} />}
            {officePreviewRefreshing ? "Retrying" : "Retry preview"}
          </button>
        )}
        <div className="open-target-menu" aria-label="Open with">
          {openTargets.map((target) => (
            <button type="button" className="open-target-button" key={target.id} onClick={() => onOpen(target.id)}>
              <OpenTargetIcon target={target} />
              <span>{target.label}</span>
            </button>
          ))}
        </div>
      </div>
      <FilePreviewBody file={file} renderRichText={renderRichText} />
      {file.truncated && <p className="panel-note">Preview truncated.</p>}
    </div>
  );
}

export function LazyHtmlPreview({
  html,
  title,
  className,
  sandbox,
  detail,
  initiallyOpen = false,
  autoPauseMs = HTML_PREVIEW_AUTO_PAUSE_MS,
}: {
  html: string;
  title: string;
  className: string;
  sandbox?: string;
  detail: string;
  initiallyOpen?: boolean;
  autoPauseMs?: number;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const autoPauseLabel = formatHtmlPreviewAutoPauseLabel(autoPauseMs);

  useEffect(() => {
    if (initiallyOpen) setOpen(true);
  }, [html, initiallyOpen, title]);

  useEffect(() => {
    if (!open) return;
    const timeout = window.setTimeout(() => setOpen(false), autoPauseMs);
    return () => window.clearTimeout(timeout);
  }, [autoPauseMs, html, open]);

  if (!open) {
    return (
      <div className="lazy-html-preview">
        <div className="lazy-html-preview-main">
          <FileCode2 size={18} />
          <div>
            <strong>HTML preview paused</strong>
            <span>{detail}</span>
          </div>
        </div>
        <button type="button" className="panel-button mini" onClick={() => setOpen(true)}>
          Open preview
        </button>
      </div>
    );
  }

  return (
    <div className="lazy-html-preview active">
      <div className="lazy-html-preview-toolbar">
        <span>{title} · auto-pauses in {autoPauseLabel}</span>
        <button type="button" className="panel-button mini" onClick={() => setOpen(false)}>
          Close preview
        </button>
      </div>
      <BlobHtmlFrame className={className} html={html} title={title} sandbox={sandbox ?? ""} />
    </div>
  );
}

function BlobHtmlFrame({
  html,
  title,
  className,
  sandbox = "",
}: {
  html: string;
  title: string;
  className: string;
  sandbox?: string;
}) {
  const [src, setSrc] = useState("about:blank");
  useEffect(() => {
    const blobUrl = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    setSrc(blobUrl);
    return () => {
      URL.revokeObjectURL(blobUrl);
    };
  }, [html]);

  return <iframe className={className} src={src} title={title} sandbox={sandbox} referrerPolicy="no-referrer" />;
}

function FilePreviewBody({ file, renderRichText }: { file: WorkspaceFileContent; renderRichText: (content: string) => ReactNode }) {
  if (file.kind === "image" && file.dataUrl) {
    return (
      <div className="file-media-preview">
        <img src={file.dataUrl} alt={file.name} />
      </div>
    );
  }

  if (file.kind === "audio" && file.mediaUrl) {
    return (
      <div className="file-media-preview file-audio-preview">
        <audio key={`${file.path}:${file.mtimeMs ?? file.size}`} controls preload="metadata" src={file.mediaUrl}>
          Audio preview is not supported by this Electron build.
        </audio>
      </div>
    );
  }

  if (file.kind === "video" && file.mediaUrl) {
    return (
      <div className="file-media-preview">
        <video key={`${file.path}:${file.mtimeMs ?? file.size}`} controls preload="metadata" src={file.mediaUrl}>
          Video preview is not supported by this Electron build.
        </video>
      </div>
    );
  }

  if (file.kind === "pdf" && file.dataUrl) {
    return <BlobHtmlFrame className="file-pdf-preview" html={pdfPreviewDocument(file.name, file.size)} title={file.name} />;
  }

  if (file.kind === "markdown") {
    return <div className="file-markdown-preview">{renderRichText(file.content || "(empty file)")}</div>;
  }

  if (file.kind === "html") {
    return (
      <div className="html-preview-stack">
        <LazyHtmlPreview
          className="file-html-preview"
          html={file.content || "(empty file)"}
          title={file.name}
          sandbox=""
          initiallyOpen
          detail={`HTML files are opened in an inert sandbox. Scripts, forms, popups, downloads, and parent access remain disabled. Live previews auto-pause after ${formatHtmlPreviewAutoPauseLabel(HTML_PREVIEW_AUTO_PAUSE_MS)}.`}
        />
        <details>
          <summary>Source</summary>
          <pre className="file-content">{file.content || "(empty file)"}</pre>
        </details>
      </div>
    );
  }

  if (file.kind === "office") {
    if (file.officePreview?.status === "available" && file.officePreview.pdfUrl) {
      const format = file.officePreview.format?.toUpperCase() ?? file.officeText?.format?.toUpperCase() ?? "Office";
      const renderer = file.officePreview.renderer === "libreoffice" ? "LibreOffice" : "Rendered";
      return (
        <div className="file-office-rendered-preview">
          <div className="file-office-preview-header">
            <FileText size={18} />
            <div>
              <strong>Rendered preview</strong>
              <span>{[format, renderer].filter(Boolean).join(" · ")}</span>
            </div>
          </div>
          <iframe
            className="file-pdf-preview"
            key={`${file.officePreview.cacheKey ?? file.path}:${file.mtimeMs ?? file.size}`}
            src={file.officePreview.pdfUrl}
            title={`${file.name} preview`}
          />
          {file.officeText?.status === "available" && (
            <details className="file-office-extracted-details">
              <summary>Extracted text</summary>
              <pre className="file-content">{file.content || "(no extractable text)"}</pre>
            </details>
          )}
        </div>
      );
    }
    if (file.officeText?.status === "available") {
      const format = file.officeText.format?.toUpperCase() ?? "Office";
      const unitText =
        file.officeText.unitLabel && file.officeText.unitCount !== undefined
          ? `${file.officeText.unitCount} ${file.officeText.unitLabel}`
          : undefined;
      const charText = file.officeText.chars !== undefined ? `${file.officeText.chars.toLocaleString()} chars` : undefined;
      return (
        <div className="file-office-text-preview">
          <div className="file-office-preview-header">
            <FileText size={18} />
            <div>
              <strong>Extracted text</strong>
              <span>{[format, unitText, charText, officePreviewStatusText(file.officePreview)].filter(Boolean).join(" · ")}</span>
            </div>
          </div>
          <pre className="file-content">{file.content || "(no extractable text)"}</pre>
        </div>
      );
    }
    return (
      <div className="file-office-preview">
        <FileText size={24} />
        <strong>{file.officePreview ? "Office preview unavailable." : "Office text unavailable."}</strong>
        <span>
          {[file.officeText?.error, officePreviewStatusText(file.officePreview), file.officePreview?.error ?? undefined]
            .filter(Boolean)
            .join(" · ") || "This Office format is not supported yet."}
        </span>
      </div>
    );
  }

  if (file.kind === "code") {
    return (
      <pre className="file-content code-preview">
        {file.language && <span>{file.language}</span>}
        <code>{file.content || "(empty file)"}</code>
      </pre>
    );
  }

  if (!file.binary) {
    return <pre className="file-content">{file.content || "(empty file)"}</pre>;
  }

  return <p className="panel-note">Binary file preview is not available.</p>;
}

function officePreviewStatusText(preview: WorkspaceFileContent["officePreview"]): string | undefined {
  if (!preview) return undefined;
  if (preview.status === "missing-renderer") return "LibreOffice not found";
  if (preview.status === "failed") return "render failed";
  if (preview.status === "pending") return "render pending";
  if (preview.status === "unsupported") return "render unsupported";
  return undefined;
}

function pdfPreviewDocument(name: string, size: number): string {
  return `<!doctype html><html><body style="margin:0;font:13px system-ui,sans-serif;color:#24313a;background:#f8fafc;display:grid;place-items:center;min-height:100vh;"><main style="padding:18px;text-align:center;"><strong>${escapeHtml(name)}</strong><p style="margin:8px 0 0;color:#5b6872;">PDF preview is available from the file actions. ${formatPanelFileSize(size)}</p></main></body></html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    if (character === "&") return "&amp;";
    if (character === "<") return "&lt;";
    if (character === ">") return "&gt;";
    if (character === '"') return "&quot;";
    return "&#39;";
  });
}

export function OpenTargetIcon({ target }: { target: WorkspaceOpenTarget }) {
  if (target.kind === "finder") return <FolderOpen size={15} />;
  if (target.kind === "terminal") return <Terminal size={15} />;
  if (target.kind === "browser") return <Monitor size={15} />;
  if (target.kind === "default") return <Monitor size={15} />;
  if (target.id === "xcode") return <FileCode2 size={15} />;
  return <ExternalLink size={15} />;
}
