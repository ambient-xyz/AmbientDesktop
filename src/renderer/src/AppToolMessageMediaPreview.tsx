import { AlertCircle, Film, FileImage, FileText, Music, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { WorkspaceFileContent } from "../../shared/workspaceTypes";
import {
  artifactMediaKindFromPath,
  artifactPreviewRoute,
  mediaPreviewUnavailableMessage,
  type ToolManagedFileArtifactPreviewData,
} from "./toolMessageUiModel";
import { InlineArtifactMedia } from "./RightPanel";

export type MediaPreviewModalRequest = { path: string; mediaKind: "image" | "video" };

export function ToolManagedFileArtifactsPreview({
  artifacts,
  onPreviewPath,
  onPreviewLocalPath,
}: {
  artifacts: ToolManagedFileArtifactPreviewData[];
  onPreviewPath: (path: string) => void;
  onPreviewLocalPath: (path: string) => void;
}) {
  return (
    <section className="tool-large-output-preview">
      <div className="tool-section-title">
        Managed files
        <code>
          {artifacts.length.toLocaleString()} {artifacts.length === 1 ? "artifact" : "artifacts"}
        </code>
      </div>
      <div className="tool-large-output-items">
        {artifacts.map((artifact, index) => {
          const previewPath = artifact.workspacePath ?? artifact.hostPath;
          const canPreviewWorkspace = Boolean(artifact.workspacePath);
          return (
            <div
              className="tool-large-output-item"
              key={`${artifact.filename}-${artifact.workspacePath ?? artifact.hostPath ?? artifact.containerPath ?? index}`}
            >
              <div className="tool-large-output-row">
                <span>{artifact.filename}</span>
                {artifact.bytes !== undefined && <code>{artifact.bytes.toLocaleString()} bytes</code>}
                {artifact.source && <code>{artifact.source}</code>}
              </div>
              {previewPath && (
                <button
                  type="button"
                  className="artifact-link"
                  onClick={() => (canPreviewWorkspace ? onPreviewPath(artifact.workspacePath!) : onPreviewLocalPath(artifact.hostPath!))}
                  title={canPreviewWorkspace ? `Preview ${artifact.workspacePath}` : `Preview ${artifact.hostPath}`}
                >
                  <FileText size={13} />
                  <span>{canPreviewWorkspace ? artifact.workspacePath : artifact.hostPath}</span>
                </button>
              )}
              {artifact.containerPath && <p className="tool-large-output-note">Container path: {artifact.containerPath}</p>}
              {artifact.copySkippedReason && <p className="tool-large-output-note">{artifact.copySkippedReason}</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function ArtifactPreviewStrip({
  artifactPath,
  generatedMediaAutoplay,
  onPreviewPath,
  onPreviewLocalPath,
  onOpenMediaModal,
}: {
  artifactPath: string;
  generatedMediaAutoplay: boolean;
  onPreviewPath: (path: string) => void;
  onPreviewLocalPath: (path: string) => void;
  onOpenMediaModal: (path: string, mediaKind: "image" | "video") => void;
}) {
  const mediaKind = artifactMediaKindFromPath(artifactPath);
  const route = artifactPreviewRoute(artifactPath);
  const previewArtifact = () => {
    if (route.kind === "local-file") onPreviewLocalPath(artifactPath);
    else if (route.kind === "workspace-media") onOpenMediaModal(artifactPath, route.mediaKind);
    else onPreviewPath(artifactPath);
  };
  return (
    <div className={`artifact-strip ${mediaKind ? "media-artifact-strip" : ""}`} aria-label="Artifact">
      <div className="artifact-strip-header">
        <button type="button" className="artifact-link" onClick={previewArtifact} title={`Preview ${artifactPath}`}>
          {mediaKind === "image" ? (
            <FileImage size={13} />
          ) : mediaKind === "audio" ? (
            <Music size={13} />
          ) : mediaKind === "video" ? (
            <Film size={13} />
          ) : (
            <FileText size={13} />
          )}
          <span>Preview {fileBaseName(artifactPath)}</span>
        </button>
        <span>{artifactPath}</span>
      </div>
      {mediaKind && route.kind !== "local-file" && (
        <InlineArtifactMedia
          artifactPath={artifactPath}
          mediaKind={mediaKind}
          generatedMediaAutoplay={generatedMediaAutoplay}
          onPreviewPath={onPreviewPath}
          onOpenMediaModal={onOpenMediaModal}
        />
      )}
    </div>
  );
}

export function MediaPreviewModal({
  request,
  generatedMediaAutoplay,
  onClose,
  onOpenInFiles,
}: {
  request: MediaPreviewModalRequest;
  generatedMediaAutoplay: boolean;
  onClose: () => void;
  onOpenInFiles: (path: string) => void;
}) {
  const [file, setFile] = useState<WorkspaceFileContent | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [playbackError, setPlaybackError] = useState<string | undefined>();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    return () => {
      previousFocusRef.current?.focus();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Preserve the moved modal reset behavior whenever the media request changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFile(undefined);
    setError(undefined);
    setPlaybackError(undefined);
    window.ambientDesktop
      .readWorkspaceFile(request.path)
      .then((nextFile) => {
        if (cancelled) return;
        setFile(nextFile);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : String(caught));
      });
    return () => {
      cancelled = true;
    };
  }, [request.path]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const title = file?.name ?? fileBaseName(request.path);
  const imageSrc = file?.kind === "image" ? (file.dataUrl ?? file.mediaUrl) : undefined;
  const canRenderImage = request.mediaKind === "image" && Boolean(imageSrc);
  const canRenderVideo = request.mediaKind === "video" && file?.kind === "video" && file.mediaUrl;

  return (
    <div className="modal-backdrop media-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="media-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="media-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="media-modal-header">
          <div>
            <h2 id="media-modal-title">{title}</h2>
            <span>{request.path}</span>
          </div>
          <div className="media-modal-actions">
            <button type="button" className="secondary-button" onClick={() => onOpenInFiles(request.path)}>
              Open in Files
            </button>
            <button ref={closeButtonRef} type="button" className="media-modal-close" onClick={onClose} aria-label="Close media preview">
              <X size={17} />
            </button>
          </div>
        </header>
        <div className="media-modal-stage">
          {error ? (
            <MediaModalError message={`Media preview failed. ${error}`} path={request.path} onOpenInFiles={onOpenInFiles} />
          ) : playbackError ? (
            <MediaModalError message={playbackError} path={request.path} onOpenInFiles={onOpenInFiles} />
          ) : !file ? (
            <div className="inline-media-loading">Loading media preview...</div>
          ) : canRenderImage && file?.kind === "image" && imageSrc ? (
            <img src={imageSrc} alt={file.name} onError={() => setPlaybackError(mediaPreviewUnavailableMessage("image"))} />
          ) : canRenderVideo ? (
            <video
              key={`${file.path}:${file.mtimeMs ?? file.size}`}
              controls
              preload="metadata"
              src={file.mediaUrl}
              autoPlay={generatedMediaAutoplay}
              muted={generatedMediaAutoplay}
              onError={() => setPlaybackError(mediaPreviewUnavailableMessage("video"))}
            >
              Video preview is not supported by this Electron build.
            </video>
          ) : (
            <MediaModalError
              message="Media preview is not available for this artifact."
              path={request.path}
              onOpenInFiles={onOpenInFiles}
            />
          )}
        </div>
      </section>
    </div>
  );
}

export function MediaModalError({
  message,
  path,
  onOpenInFiles,
}: {
  message: string;
  path: string;
  onOpenInFiles: (path: string) => void;
}) {
  return (
    <div className="media-modal-error">
      <AlertCircle size={20} />
      <strong>{message}</strong>
      <span>Ambient can still open the artifact in the Files panel or through the system default app.</span>
      <button type="button" className="secondary-button" onClick={() => onOpenInFiles(path)}>
        Open in Files
      </button>
    </div>
  );
}

export function fileBaseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}
