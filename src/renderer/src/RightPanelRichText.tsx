import {
  AlertCircle,
  Bell,
  Bot,
  Brain,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Code2,
  Copy,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  GitBranch,
  Kanban,
  MessageCircle,
  Mic,
  Monitor,
  Package,
  PanelLeft,
  Paperclip,
  Pencil,
  Pin,
  Play,
  Plug,
  Plus,
  RefreshCw,
  Search,
  Send,
  Shield,
  Square,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import { MouseEvent as ReactMouseEvent, ReactNode, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BrowserRuntimeKind } from "../../shared/browserTypes"; import type { WorkspaceFileContent, WorkspaceOpenTarget } from "../../shared/workspaceTypes";
import { parseMarkdownBlocks } from "./markdownBlockParser";
import { richMarkdownTableIconLabel, type RichMarkdownIconLabel } from "./richMarkdownIcons";
import { OpenTargetIcon, formatPanelFileSize } from "./RightPanelFilePreview";
import {
  artifactMediaKindFromPath,
  mediaPreviewUnavailableMessage,
  resolveInlineArtifactPath,
  type ArtifactMediaKind,
  type ArtifactPathHints,
} from "./toolMessageUiModel";

export type LinkContextMenuState = {
  url: string;
  x: number;
  y: number;
  artifactPath?: string;
  localPath?: string;
};

const INLINE_MARKDOWN_TOKEN_PATTERN = /(!\[[^\]]*]\((?:[^()]|\([^)]*\))+\)|\[[^\]]+\]\((?:[^()]|\([^)]*\))+\)|`[^`]+`|\*\*[^*]+\*\*)/g;
const LINKED_TEXT_PATTERN = /(file:\/\/\/[^\s<>"']+|https?:\/\/[^\s<>"']+|(?:~\/|\/(?:Users|Volumes|tmp|private\/tmp|var\/folders)\/)(?:(?:(?![\n\r<>"'`]).)*?\.(?:docx?|xlsx?|pptx?|rtf|odt|pdf|png|jpe?g|gif|webp|svg|mp3|wav|m4a|mp4|mov|txt|md|markdown|html?)(?::\d+(?::\d+)?)?|[^\s<>"'`]+))/gi;
const FENCED_CODE_PATTERN = /```([^\n`]*)\n([\s\S]*?)```/g;
const STRONG_INLINE_CODE_PATTERN = /^`([^`]+)`$/;



export function InlineArtifactMedia({
  artifactPath,
  mediaKind,
  generatedMediaAutoplay,
  onPreviewPath,
  onOpenMediaModal,
}: {
  artifactPath: string;
  mediaKind: ArtifactMediaKind;
  generatedMediaAutoplay: boolean;
  onPreviewPath: (path: string) => void;
  onOpenMediaModal: (path: string, mediaKind: "image" | "video") => void;
}) {
  const [file, setFile] = useState<WorkspaceFileContent | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [playbackError, setPlaybackError] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    setFile(undefined);
    setError(undefined);
    setPlaybackError(undefined);
    window.ambientDesktop
      .readWorkspaceFile(artifactPath)
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
  }, [artifactPath]);

  if (error) return <InlineMediaError message={`Media preview failed. ${error}`} artifactPath={artifactPath} onPreviewPath={onPreviewPath} />;
  if (playbackError) return <InlineMediaError message={playbackError} artifactPath={artifactPath} onPreviewPath={onPreviewPath} />;
  if (!file) return <div className="inline-media-loading">Loading media preview...</div>;

  const imageSrc = file.kind === "image" ? file.dataUrl ?? file.mediaUrl : undefined;
  if (mediaKind === "image" && file.kind === "image" && imageSrc) {
    return (
      <>
        <button type="button" className="inline-media-preview image" onClick={() => onOpenMediaModal(artifactPath, "image")} title={`Preview ${artifactPath}`}>
          <img src={imageSrc} alt={file.name} onError={() => setPlaybackError(mediaPreviewUnavailableMessage("image"))} />
        </button>
        <InlineMediaMetadata file={file} />
      </>
    );
  }

  if (mediaKind === "audio" && file.kind === "audio" && file.mediaUrl) {
    return (
      <>
        <div className="inline-media-preview audio">
          <audio
            key={`${file.path}:${file.mtimeMs ?? file.size}`}
            controls
            preload="metadata"
            src={file.mediaUrl}
            onError={() => setPlaybackError(mediaPreviewUnavailableMessage("audio"))}
          >
            Audio preview is not supported by this Electron build.
          </audio>
        </div>
        <InlineMediaMetadata file={file} />
      </>
    );
  }

  if (mediaKind === "video" && file.kind === "video" && file.mediaUrl) {
    return (
      <>
        <button type="button" className="inline-media-preview video" onClick={() => onOpenMediaModal(artifactPath, "video")} title={`Preview ${artifactPath}`}>
          <video
            key={`${file.path}:${file.mtimeMs ?? file.size}`}
            preload="metadata"
            src={file.mediaUrl}
            muted
            autoPlay={generatedMediaAutoplay}
            loop={generatedMediaAutoplay}
            onError={() => setPlaybackError(mediaPreviewUnavailableMessage("video"))}
          >
            Video preview is not supported by this Electron build.
          </video>
        </button>
        <InlineMediaMetadata file={file} />
      </>
    );
  }

  return <InlineMediaError message={inlineMediaUnavailableMessage(mediaKind, file)} artifactPath={artifactPath} onPreviewPath={onPreviewPath} />;
}



function InlineMediaMetadata({ file }: { file: WorkspaceFileContent }) {
  const values = [formatPanelFileSize(file.size), file.mimeType].filter(Boolean);
  if (!values.length) return null;
  return <div className="inline-media-meta">{values.join(" · ")}</div>;
}



function inlineMediaUnavailableMessage(expectedKind: ArtifactMediaKind, file: WorkspaceFileContent): string {
  if (expectedKind === "image") {
    if (file.kind !== "image") return `File is not a valid image. Detected ${workspaceFileKindDescription(file)}.`;
    if (file.truncated) return "Image preview is too large to render inline.";
    return "File is not a valid image.";
  }
  return `Media preview is not available for this artifact. Detected ${workspaceFileKindDescription(file)}.`;
}



function workspaceFileKindDescription(file: WorkspaceFileContent): string {
  const mime = file.mimeType ? ` (${file.mimeType})` : "";
  if (file.kind === "html") return `HTML${mime}`;
  if (file.kind === "text" || file.kind === "markdown" || file.kind === "code") return `text${mime}`;
  if (file.kind === "binary") return `binary data${mime}`;
  return `${file.kind}${mime}`;
}



function InlineMediaError({
  message,
  artifactPath,
  onPreviewPath,
}: {
  message: string;
  artifactPath: string;
  onPreviewPath: (path: string) => void;
}) {
  return (
    <div className="inline-media-error">
      <span>{message}</span>
      <button type="button" className="artifact-link" onClick={() => onPreviewPath(artifactPath)}>
        Open in Files
      </button>
    </div>
  );
}



export function RichText({
  content,
  compact = false,
  highlightQuery,
  artifactPathHints,
  onPreviewPath,
  onPreviewLocalPath,
  onOpenMediaModal,
  onOpenUrl,
  onOpenBrowserUrl,
  workspacePath,
}: {
  content: string;
  compact?: boolean;
  highlightQuery?: string;
  artifactPathHints?: ArtifactPathHints;
  onPreviewPath?: (path: string) => void;
  onPreviewLocalPath?: (path: string) => void;
  onOpenMediaModal?: (path: string, mediaKind: "image" | "video") => void;
  onOpenUrl?: (url: string) => void;
  onOpenBrowserUrl?: (url: string) => void;
  workspacePath?: string;
}) {
  const parts = useMemo(() => splitFencedCode(content), [content]);
  const [linkMenu, setLinkMenu] = useState<LinkContextMenuState | undefined>();
  const [linkOpenTargets, setLinkOpenTargets] = useState<WorkspaceOpenTarget[]>([]);

  useEffect(() => {
    if (!linkMenu) return;
    const close = () => setLinkMenu(undefined);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [linkMenu]);

  useEffect(() => {
    if (!linkMenu?.artifactPath && !linkMenu?.localPath) {
      setLinkOpenTargets([]);
      return;
    }
    let disposed = false;
    window.ambientDesktop
      .listWorkspaceOpenTargets()
      .then((targets) => {
        if (!disposed) setLinkOpenTargets(targets);
      })
      .catch(() => {
        if (!disposed) setLinkOpenTargets([]);
      });
    return () => {
      disposed = true;
    };
  }, [linkMenu?.artifactPath, linkMenu?.localPath]);

  const openLinkContextMenu = useCallback((event: ReactMouseEvent<HTMLElement>, url: string, artifactPath?: string, localPath?: string) => {
    event.preventDefault();
    event.stopPropagation();
    setLinkMenu({
      url,
      ...(artifactPath ? { artifactPath } : {}),
      ...(localPath ? { localPath } : {}),
      x: clampNumber(event.clientX, 8, Math.max(8, window.innerWidth - 236)),
      y: clampNumber(event.clientY, 8, Math.max(8, window.innerHeight - 320)),
    });
  }, []);

  const inlineOptions = useMemo(
    () => ({
      highlightQuery,
      artifactPathHints,
      onPreviewPath,
      onPreviewLocalPath,
      onOpenMediaModal,
      onOpenUrl,
      onOpenBrowserUrl,
      workspacePath,
      onLinkContextMenu: openLinkContextMenu,
    }),
    [
      highlightQuery,
      artifactPathHints,
      onPreviewPath,
      onPreviewLocalPath,
      onOpenMediaModal,
      onOpenUrl,
      onOpenBrowserUrl,
      workspacePath,
      openLinkContextMenu,
    ],
  );
  const menuFilePath = linkMenu?.artifactPath ? workspaceAbsoluteArtifactPath(linkMenu.artifactPath, workspacePath) : linkMenu?.localPath;
  const hasFilePath = Boolean(linkMenu?.artifactPath || linkMenu?.localPath);
  const primaryOpenTarget = hasFilePath ? preferredWorkspaceOpenTarget(linkOpenTargets) : undefined;
  const chromeOpenTarget = menuFilePath && isHtmlArtifactPath(menuFilePath)
    ? linkOpenTargets.find((target) => target.id === "chrome")
    : undefined;
  const linkArtifactAbsolutePath = linkMenu?.artifactPath ? menuFilePath : undefined;
  const secondaryOpenTargets =
    hasFilePath && primaryOpenTarget
      ? linkOpenTargets.filter((target) => target.id !== primaryOpenTarget.id && target.id !== chromeOpenTarget?.id && target.kind !== "finder")
      : [];
  const openMenuFileWith = (targetId?: string) => {
    if (!linkMenu) return;
    if (linkMenu.artifactPath) {
      const path = targetId === "chrome" && linkArtifactAbsolutePath ? linkArtifactAbsolutePath : linkMenu.artifactPath;
      void window.ambientDesktop.openWorkspacePathWith({ path, targetId }).catch(() => undefined);
      return;
    }
    if (linkMenu.localPath) {
      void window.ambientDesktop.openLocalPathWith({ path: linkMenu.localPath, targetId }).catch(() => undefined);
    }
  };
  const revealMenuFile = () => {
    if (!linkMenu) return;
    if (linkMenu.artifactPath) {
      void window.ambientDesktop.revealWorkspacePath(linkArtifactAbsolutePath ?? linkMenu.artifactPath).catch(() => undefined);
      return;
    }
    if (linkMenu.localPath) void window.ambientDesktop.revealLocalPath(linkMenu.localPath).catch(() => undefined);
  };
  return (
    <div className={`rich-text ${compact ? "compact" : ""}`}>
      {parts.map((part, index) =>
        part.kind === "code" ? (
          renderFencedCodeBlock(part, inlineOptions, index)
        ) : (
          <MarkdownText key={index} text={part.value} inlineOptions={inlineOptions} />
        ),
      )}
      {linkMenu && (
        <div
          className="link-context-menu"
          role="menu"
          aria-label="Link options"
          style={{ left: linkMenu.x, top: linkMenu.y }}
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {linkMenu.artifactPath && onPreviewPath && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const path = linkMenu.artifactPath!;
                setLinkMenu(undefined);
                onPreviewPath(path);
              }}
            >
              <FileText size={13} />
              <span>{isHtmlArtifactPath(linkMenu.artifactPath) ? "Preview HTML in Ambient" : "Preview in Ambient"}</span>
            </button>
          )}
          {linkMenu.localPath && onPreviewLocalPath && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const path = linkMenu.localPath!;
                setLinkMenu(undefined);
                onPreviewLocalPath(path);
              }}
            >
              <FileText size={13} />
              <span>Preview in Ambient</span>
            </button>
          )}
          {hasFilePath && chromeOpenTarget && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setLinkMenu(undefined);
                openMenuFileWith(chromeOpenTarget.id);
              }}
            >
              <OpenTargetIcon target={chromeOpenTarget} />
              <span>Open in Google Chrome</span>
            </button>
          )}
          {hasFilePath && primaryOpenTarget && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setLinkMenu(undefined);
                openMenuFileWith(primaryOpenTarget.id);
              }}
            >
              <OpenTargetIcon target={primaryOpenTarget} />
              <span>{primaryOpenTarget.kind === "default" ? "Open in default app" : `Open in ${primaryOpenTarget.label}`}</span>
            </button>
          )}
          {hasFilePath &&
            secondaryOpenTargets.map((target) => (
              <button
                type="button"
                role="menuitem"
                key={target.id}
                onClick={() => {
                  setLinkMenu(undefined);
                  openMenuFileWith(target.id);
                }}
              >
                <OpenTargetIcon target={target} />
                <span>Open with {target.label}</span>
              </button>
            ))}
          {hasFilePath && (
            <>
              <div className="link-context-menu-divider" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const path = linkMenu.localPath ?? linkArtifactAbsolutePath ?? linkMenu.artifactPath!;
                  setLinkMenu(undefined);
                  void window.ambientDesktop.writeClipboardText(path).catch(() => undefined);
                }}
              >
                <Copy size={13} />
                <span>{linkMenu.localPath ? "Copy path" : "Copy full path"}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setLinkMenu(undefined);
                  revealMenuFile();
                }}
              >
                <FolderOpen size={13} />
                <span>Open in Finder</span>
              </button>
            </>
          )}
          {!linkMenu.artifactPath && onOpenUrl && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setLinkMenu(undefined);
                onOpenUrl(linkMenu.url);
              }}
            >
              <ExternalLink size={13} />
              <span>{externalLinkMenuLabel(linkMenu.url)}</span>
            </button>
          )}
          {!linkMenu.artifactPath && onOpenBrowserUrl && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setLinkMenu(undefined);
                onOpenBrowserUrl(linkMenu.url);
              }}
            >
              <Monitor size={13} />
              <span>Open in Ambient browser</span>
            </button>
          )}
          {!linkMenu.artifactPath && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const url = linkMenu.url;
                setLinkMenu(undefined);
                void window.ambientDesktop.writeClipboardText(url).catch(() => undefined);
              }}
            >
              <Copy size={13} />
              <span>Copy link</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}



type InlineRenderOptions = {
  highlightQuery?: string;
  artifactPathHints?: ArtifactPathHints;
  onPreviewPath?: (path: string) => void;
  onPreviewLocalPath?: (path: string) => void;
  onOpenMediaModal?: (path: string, mediaKind: "image" | "video") => void;
  onOpenUrl?: (url: string) => void;
  onOpenBrowserUrl?: (url: string) => void;
  workspacePath?: string;
  onLinkContextMenu?: (event: ReactMouseEvent<HTMLElement>, url: string, artifactPath?: string, localPath?: string) => void;
};


function renderFencedCodeBlock(part: Extract<RichPart, { kind: "code" }>, options: InlineRenderOptions, key: number): ReactNode {
  return <FencedCodeBlock key={key} part={part} options={options} />;
}

function FencedCodeBlock({ part, options }: { part: Extract<RichPart, { kind: "code" }>; options: InlineRenderOptions }) {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<number | undefined>(undefined);
  const trimmed = part.value.trim();
  const singleLine = trimmed && !/[\r\n]/.test(trimmed) ? trimmed : undefined;
  const artifactPath = singleLine ? resolveInlineArtifactPath(singleLine, options.artifactPathHints, options.workspacePath) : undefined;
  const localPath = artifactPath ? undefined : singleLine ? resolveLinkLocalPath(singleLine, options) : undefined;

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    };
  }, []);

  async function copyCode() {
    await window.ambientDesktop.writeClipboardText(part.value);
    setCopied(true);
    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = window.setTimeout(() => setCopied(false), 1400);
  }

  const copyLabel = copied
    ? part.language
      ? `Copied ${part.language} code`
      : "Copied code"
    : part.language
      ? `Copy ${part.language} code`
      : "Copy code";
  const hasOpenAction = Boolean((artifactPath && options.onPreviewPath) || localPath);
  const openLabel = !hasOpenAction
    ? undefined
    : artifactPath
      ? `Preview ${artifactPath}`
      : localPath
        ? `${options.onPreviewLocalPath ? "Preview" : "Open"} ${localPath}`
        : undefined;

  return (
    <pre className={`rich-code ${hasOpenAction ? "rich-code-artifact" : ""}`}>
      <div className="rich-code-header">
        <span className="rich-code-language">{part.language || "code"}</span>
        <div className="rich-code-actions">
          {openLabel && (
            <button
              type="button"
              className="rich-code-open-button"
              title={openLabel}
              aria-label={openLabel}
              onContextMenu={(event) => options.onLinkContextMenu?.(event, singleLine!, artifactPath, localPath)}
              onClick={() => {
                if (artifactPath && options.onPreviewPath) options.onPreviewPath(artifactPath);
                else if (localPath && options.onPreviewLocalPath) options.onPreviewLocalPath(localPath);
                else if (localPath) void window.ambientDesktop.revealLocalPath(localPath).catch(() => undefined);
              }}
            >
              <FileText size={13} />
            </button>
          )}
          <button
            type="button"
            className="rich-code-copy-button"
            title={copyLabel}
            aria-label={copyLabel}
            onClick={() => void copyCode()}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
        </div>
      </div>
      <code>{part.value}</code>
    </pre>
  );
}



const richMarkdownIconComponents: Record<RichMarkdownIconLabel, LucideIcon> = {
  PanelLeft,
  Plus,
  FolderOpen,
  Search,
  Monitor,
  Plug,
  Bell,
  Pin,
  ChevronDown,
  Paperclip,
  RefreshCw,
  Download,
  Brain,
  Bot,
  Mic,
  Shield,
  Square,
  Send,
  "Clipboard with arrow": ClipboardPaste,
  Kanban,
  GitBranch,
  FileText,
  Terminal,
  Code2,
  MessageCircle,
  Pencil,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  ClipboardPaste,
  AlertCircle,
  Play,
  Package,
};



const MarkdownText = memo(function MarkdownText({ text, inlineOptions }: { text: string; inlineOptions: InlineRenderOptions }) {
  const blocks = useMemo(() => parseMarkdownBlocks(text), [text]);
  return (
    <>
      {blocks.map((block, index) => {
        if (block.kind === "heading") {
          return (
            <p className="rich-heading" key={`heading-${index}-${block.text.slice(0, 24)}`}>
              {renderInline(block.text, inlineOptions)}
            </p>
          );
        }
        if (block.kind === "hr") return <hr className="rich-hr" key={`hr-${index}`} />;
        if (block.kind === "table") {
          return (
            <div className="rich-table-wrap" key={`table-${index}-${block.headers.join("-").slice(0, 18)}`}>
              <table className="rich-table">
                <thead>
                  <tr>
                    {block.headers.map((header, headerIndex) => (
                      <th key={`th-${headerIndex}-${header.slice(0, 18)}`}>{renderInline(header, inlineOptions)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={`tr-${rowIndex}-${row.join("-").slice(0, 18)}`}>
                      {block.headers.map((_header, cellIndex) => (
                        <td key={`td-${rowIndex}-${cellIndex}`}>{renderMarkdownTableCell(block.headers, cellIndex, row[cellIndex] ?? "", inlineOptions)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (block.kind === "unordered-list") {
          return (
            <ul key={`ul-${index}`}>
              {block.items.map((item, itemIndex) => (
                <li key={`ul-item-${itemIndex}-${item.slice(0, 24)}`}>{renderInline(item, inlineOptions)}</li>
              ))}
            </ul>
          );
        }
        if (block.kind === "ordered-list") {
          return (
            <ol key={`ol-${index}`} start={block.start}>
              {block.items.map((item, itemIndex) => (
                <li key={`ol-item-${itemIndex}-${item.slice(0, 24)}`}>{renderInline(item, inlineOptions)}</li>
              ))}
            </ol>
          );
        }
        return <p key={`p-${index}-${block.text.slice(0, 24)}`}>{renderInline(block.text, inlineOptions)}</p>;
      })}
    </>
  );
});



function renderMarkdownTableCell(headers: readonly string[], cellIndex: number, value: string, inlineOptions: InlineRenderOptions): ReactNode {
  const iconLabel = richMarkdownTableIconLabel(headers, cellIndex, value);
  if (!iconLabel) return renderInline(value, inlineOptions);
  const Icon = richMarkdownIconComponents[iconLabel];
  return (
    <span className="rich-icon-cell">
      <Icon size={16} aria-hidden="true" />
      <span className="rich-icon-cell-label">{highlightTextNodes(iconLabel, inlineOptions.highlightQuery, `rich-icon-${iconLabel}`)}</span>
    </span>
  );
}



function renderInline(text: string, options: InlineRenderOptions): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  INLINE_MARKDOWN_TOKEN_PATTERN.lastIndex = 0;
  while ((match = INLINE_MARKDOWN_TOKEN_PATTERN.exec(text))) {
    if (match.index > lastIndex) {
      nodes.push(...renderLinkedText(text.slice(lastIndex, match.index), options, `text-${lastIndex}-${match.index}`));
    }
    const token = match[0];
    if (token.startsWith("![")) {
      nodes.push(renderMarkdownImage(token, options, `image-${match.index}-${nodes.length}`));
    } else if (token.startsWith("[")) {
      nodes.push(renderMarkdownLink(token, options, `link-${match.index}-${nodes.length}`));
    } else if (token.startsWith("`")) {
      nodes.push(renderInlineCode(token.slice(1, -1), options, `code-${match.index}-${nodes.length}`));
    } else {
      const strongText = token.slice(2, -2);
      const codeOnly = strongText.match(STRONG_INLINE_CODE_PATTERN);
      nodes.push(
        <strong key={`strong-${match.index}-${nodes.length}`}>
          {codeOnly
            ? renderInlineCode(codeOnly[1], options, `strong-code-${match.index}`)
            : renderLinkedText(strongText, options, `strong-${match.index}`)}
        </strong>,
      );
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) nodes.push(...renderLinkedText(text.slice(lastIndex), options, `text-${lastIndex}-${text.length}`));
  return nodes;
}



function renderMarkdownImage(token: string, options: InlineRenderOptions, key: string): ReactNode {
  const parsed = parseMarkdownImageToken(token);
  if (!parsed) return <span key={key}>{token}</span>;
  const artifactPath = resolveLinkArtifactPath(parsed.target, options);
  const mediaKind = artifactPath ? artifactMediaKindFromPath(artifactPath) : undefined;
  if (!artifactPath || mediaKind !== "image" || !options.onPreviewPath || !options.onOpenMediaModal) {
    return renderMarkdownLink(`[${parsed.label || parsed.target}](${parsed.target})`, options, key);
  }
  return (
    <InlineArtifactMedia
      key={key}
      artifactPath={artifactPath}
      mediaKind="image"
      generatedMediaAutoplay={false}
      onPreviewPath={options.onPreviewPath}
      onOpenMediaModal={options.onOpenMediaModal}
    />
  );
}



function renderInlineCode(value: string, options: InlineRenderOptions, key: string): ReactNode {
  const content = highlightTextNodes(value, options.highlightQuery, key);
  const artifactPath = resolveInlineArtifactPath(value, options.artifactPathHints, options.workspacePath);
  const localPath = artifactPath ? undefined : resolveLinkLocalPath(value, options);
  if ((artifactPath && options.onPreviewPath) || localPath) {
    return (
      <button
        type="button"
        className="inline-artifact-link"
        key={key}
        onContextMenu={(event) => options.onLinkContextMenu?.(event, value, artifactPath, localPath)}
        onClick={() => {
          if (artifactPath && options.onPreviewPath) options.onPreviewPath(artifactPath);
          else if (localPath && options.onPreviewLocalPath) options.onPreviewLocalPath(localPath);
          else if (localPath) void window.ambientDesktop.revealLocalPath(localPath).catch(() => undefined);
        }}
        title={artifactPath ? `Preview ${artifactPath}` : localPath ? `${options.onPreviewLocalPath ? "Preview" : "Open"} ${localPath}` : value}
      >
        {content}
      </button>
    );
  }
  return <code key={key}>{content}</code>;
}



function renderMarkdownLink(token: string, options: InlineRenderOptions, key: string): ReactNode {
  const parsed = parseMarkdownLinkToken(token);
  if (!parsed) return <span key={key}>{token}</span>;
  const artifactPath = resolveLinkArtifactPath(parsed.target, options);
  const localPath = artifactPath ? undefined : resolveLinkLocalPath(parsed.target, options);
  const label = highlightTextNodes(parsed.label, options.highlightQuery, `${key}-label`);
  return (
    <button
      type="button"
      className={artifactPath || localPath ? "inline-artifact-link" : "inline-url-link"}
      key={key}
      title={artifactPath ? `Preview ${artifactPath}` : localPath ? `${options.onPreviewLocalPath ? "Preview" : "Open"} ${localPath}` : `Open ${parsed.target}`}
      onContextMenu={(event) => options.onLinkContextMenu?.(event, parsed.target, artifactPath, localPath)}
      onClick={() => {
        if (artifactPath && options.onPreviewPath) options.onPreviewPath(artifactPath);
        else if (localPath && options.onPreviewLocalPath) options.onPreviewLocalPath(localPath);
        else if (localPath) void window.ambientDesktop.revealLocalPath(localPath).catch(() => undefined);
        else if (shouldOpenUrlInAmbientBrowser(parsed.target, options.workspacePath) && options.onOpenBrowserUrl) {
          options.onOpenBrowserUrl(parsed.target);
        }
        else options.onOpenUrl?.(parsed.target);
      }}
    >
      {label}
    </button>
  );
}



function renderLinkedText(text: string, options: InlineRenderOptions, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  LINKED_TEXT_PATTERN.lastIndex = 0;
  while ((match = LINKED_TEXT_PATTERN.exec(text))) {
    if (match.index > lastIndex) {
      nodes.push(...highlightTextNodes(text.slice(lastIndex, match.index), options.highlightQuery, `${keyPrefix}-text-${lastIndex}`));
    }
    const { url, trailing } = splitTrailingUrlPunctuation(match[0]);
    if (isLocalFilePathLike(url)) {
      nodes.push(renderInlineLocalPath(url, options, `${keyPrefix}-local-${match.index}`));
    } else {
      nodes.push(renderInlineUrl(url, options, `${keyPrefix}-url-${match.index}`));
    }
    if (trailing) nodes.push(...highlightTextNodes(trailing, options.highlightQuery, `${keyPrefix}-trail-${match.index}`));
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    nodes.push(...highlightTextNodes(text.slice(lastIndex), options.highlightQuery, `${keyPrefix}-text-${lastIndex}`));
  }
  return nodes.length > 0 ? nodes : [<span key={keyPrefix}>{text}</span>];
}



function renderInlineUrl(url: string, options: InlineRenderOptions, key: string): ReactNode {
  const workspacePath = options.workspacePath;
  const artifactPath = workspacePath ? fileUrlToWorkspacePath(url, workspacePath) : undefined;
  const localPath = artifactPath ? undefined : resolveLinkLocalPath(url, options);
  const title = artifactPath ? `Preview ${artifactPath}` : localPath ? `${options.onPreviewLocalPath ? "Preview" : "Open"} ${localPath}` : `Open ${url}`;
  return (
    <button
      type="button"
      className={artifactPath || localPath ? "inline-artifact-link" : "inline-url-link"}
      key={key}
      title={title}
      onContextMenu={(event) => options.onLinkContextMenu?.(event, url, artifactPath, localPath)}
      onClick={() => {
        if (artifactPath && options.onPreviewPath) options.onPreviewPath(artifactPath);
        else if (localPath && options.onPreviewLocalPath) options.onPreviewLocalPath(localPath);
        else if (localPath) void window.ambientDesktop.revealLocalPath(localPath).catch(() => undefined);
        else if (shouldOpenUrlInAmbientBrowser(url, options.workspacePath) && options.onOpenBrowserUrl) {
          options.onOpenBrowserUrl(url);
        }
        else options.onOpenUrl?.(url);
      }}
    >
      {highlightTextNodes(url, options.highlightQuery, `${key}-label`)}
    </button>
  );
}



function renderInlineLocalPath(path: string, options: InlineRenderOptions, key: string): ReactNode {
  const artifactPath = resolveLinkArtifactPath(path, options);
  const localPath = artifactPath ? undefined : resolveLinkLocalPath(path, options);
  const title = artifactPath ? `Preview ${artifactPath}` : localPath ? `${options.onPreviewLocalPath ? "Preview" : "Open"} ${localPath}` : path;
  return (
    <button
      type="button"
      className="inline-artifact-link"
      key={key}
      title={title}
      onContextMenu={(event) => options.onLinkContextMenu?.(event, path, artifactPath, localPath)}
      onClick={() => {
        if (artifactPath && options.onPreviewPath) options.onPreviewPath(artifactPath);
        else if (localPath && options.onPreviewLocalPath) options.onPreviewLocalPath(localPath);
        else if (localPath) void window.ambientDesktop.revealLocalPath(localPath).catch(() => undefined);
      }}
    >
      {highlightTextNodes(path, options.highlightQuery, `${key}-label`)}
    </button>
  );
}



function parseMarkdownLinkToken(token: string): { label: string; target: string } | undefined {
  const match = token.match(/^\[([^\]]+)\]\((.+)\)$/);
  if (!match) return undefined;
  const target = markdownLinkTarget(match[2]);
  if (!target) return undefined;
  return { label: match[1], target };
}



function parseMarkdownImageToken(token: string): { label: string; target: string } | undefined {
  const match = token.match(/^!\[([^\]]*)]\((.+)\)$/);
  if (!match) return undefined;
  const target = markdownLinkTarget(match[2]);
  if (!target) return undefined;
  return { label: match[1], target };
}



function markdownLinkTarget(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("<")) {
    const end = trimmed.indexOf(">");
    return end > 1 ? trimmed.slice(1, end) : undefined;
  }
  if (isLocalFilePathLike(trimmed)) return trimmed;
  const whitespace = trimmed.search(/\s/);
  return whitespace === -1 ? trimmed : trimmed.slice(0, whitespace);
}



function resolveLinkArtifactPath(target: string, options: InlineRenderOptions): string | undefined {
  const workspacePath = options.workspacePath;
  const decodedTarget = safeDecodeURIComponent(stripLinkLineSuffix(target));
  if (workspacePath && decodedTarget.startsWith("file:")) return fileUrlToWorkspacePath(decodedTarget, workspacePath);
  if (!decodedTarget || decodedTarget.startsWith("#") || /^https?:\/\//i.test(decodedTarget)) return undefined;

  const hinted = resolveInlineArtifactPath(decodedTarget, options.artifactPathHints);
  if (hinted) return hinted;

  if (!workspacePath) return undefined;
  const absolutePath = absolutePathToWorkspacePath(decodedTarget, workspacePath);
  if (absolutePath) return absolutePath;
  if (isLocalFilePathLike(decodedTarget)) return undefined;

  if (/^[a-z][a-z0-9+.-]*:/i.test(decodedTarget)) return undefined;
  const relativePath = decodedTarget.replace(/^\.\//, "");
  if (!relativePath || relativePath.startsWith("../") || relativePath.endsWith("/")) return undefined;
  return relativePath;
}



function resolveLinkLocalPath(target: string, options: InlineRenderOptions): string | undefined {
  const workspacePath = options.workspacePath;
  const decodedTarget = safeDecodeURIComponent(stripLinkLineSuffix(target));
  if (!decodedTarget || decodedTarget.startsWith("#") || /^https?:\/\//i.test(decodedTarget)) return undefined;
  if (decodedTarget.startsWith("file:")) {
    try {
      const parsed = new URL(decodedTarget);
      if (parsed.protocol !== "file:") return undefined;
      const filePath = stripLinkLineSuffix(decodeURIComponent(parsed.pathname));
      if (workspacePath && absolutePathToWorkspacePath(filePath, workspacePath)) return undefined;
      return filePath;
    } catch {
      return undefined;
    }
  }
  if (!isLocalFilePathLike(decodedTarget)) return undefined;
  if (workspacePath && isAbsoluteFilePath(decodedTarget) && absolutePathToWorkspacePath(decodedTarget, workspacePath)) return undefined;
  return decodedTarget;
}



export function externalLinkMenuLabel(url: string): string {
  try {
    return new URL(url).protocol === "file:" ? "Open in native app" : "Open in default browser";
  } catch {
    return "Open link";
  }
}



function splitTrailingUrlPunctuation(token: string): { url: string; trailing: string } {
  let url = token;
  let trailing = "";
  while (/[.,;:!?]$/.test(url)) {
    trailing = `${url.at(-1)}${trailing}`;
    url = url.slice(0, -1);
  }
  return { url, trailing };
}



function fileUrlToWorkspacePath(url: string, workspacePath: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "file:") return undefined;
    const filePath = stripLinkLineSuffix(decodeURIComponent(parsed.pathname));
    return absolutePathToWorkspacePath(filePath, workspacePath);
  } catch {
    return undefined;
  }
}



function absolutePathToWorkspacePath(filePath: string, workspacePath: string): string | undefined {
  const workspace = workspacePath.replace(/\/+$/, "");
  if (filePath === workspace) return ".";
  const prefix = `${workspace}/`;
  return filePath.startsWith(prefix) ? filePath.slice(prefix.length) : undefined;
}



export function workspaceAbsoluteArtifactPath(artifactPath: string, workspacePath: string | undefined): string {
  const cleaned = stripLinkLineSuffix(artifactPath).replace(/^\.\//, "");
  if (!workspacePath || isAbsoluteFilePath(cleaned)) return cleaned;
  const workspace = workspacePath.replace(/[\\/]+$/, "");
  if (!cleaned || cleaned === ".") return workspace;
  return `${workspace}/${cleaned}`;
}



export function isAbsoluteFilePath(path: string): boolean {
  return path.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(path);
}



function isLocalFilePathLike(path: string): boolean {
  return path === "~" || path.startsWith("~/") || isAbsoluteFilePath(path);
}



export function isHtmlArtifactPath(path: string): boolean {
  return /\.html?$/i.test(stripLinkLineSuffix(path));
}



export function stripLinkLineSuffix(path: string): string {
  return path.replace(/:(\d+)(?::\d+)?$/, "");
}



function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}



export function preferredWorkspaceOpenTarget(targets: WorkspaceOpenTarget[]): WorkspaceOpenTarget | undefined {
  return targets.find((target) => target.id === "vscode") ?? targets.find((target) => target.kind === "editor") ?? targets.find((target) => target.id === "default") ?? targets[0];
}



export function ambientBrowserRuntimeForUrl(url: string, workspacePath: string | undefined): BrowserRuntimeKind {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "file:") {
      return workspacePath && fileUrlToWorkspacePath(url, workspacePath) ? "internal" : "chrome";
    }
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      const hostname = parsed.hostname.toLowerCase();
      if (hostname === "localhost" || hostname.endsWith(".localhost")) return "internal";
      if (hostname === "127.0.0.1" || hostname === "0.0.0.0" || hostname === "::1" || hostname === "[::1]") return "internal";
    }
  } catch {
    // Keep malformed or relative links on the safer external-page path.
  }
  return "chrome";
}



function shouldOpenUrlInAmbientBrowser(url: string, workspacePath: string | undefined): boolean {
  return ambientBrowserRuntimeForUrl(url, workspacePath) === "internal";
}



function highlightTextNodes(text: string, query: string | undefined, keyPrefix: string): ReactNode[] {
  const needle = query?.trim();
  if (!needle) return [<span key={keyPrefix}>{text}</span>];
  const lowerText = text.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let matchIndex = lowerText.indexOf(lowerNeedle);
  while (matchIndex !== -1) {
    if (matchIndex > cursor) {
      nodes.push(<span key={`${keyPrefix}-text-${cursor}`}>{text.slice(cursor, matchIndex)}</span>);
    }
    const end = matchIndex + needle.length;
    nodes.push(
      <mark className="chat-find-highlight" key={`${keyPrefix}-mark-${matchIndex}`}>
        {text.slice(matchIndex, end)}
      </mark>,
    );
    cursor = end;
    matchIndex = lowerText.indexOf(lowerNeedle, cursor);
  }
  if (cursor < text.length) nodes.push(<span key={`${keyPrefix}-text-${cursor}`}>{text.slice(cursor)}</span>);
  return nodes.length > 0 ? nodes : [<span key={keyPrefix}>{text}</span>];
}



type RichPart = { kind: "text"; value: string } | { kind: "code"; value: string; language?: string };



function splitFencedCode(content: string): RichPart[] {
  const parts: RichPart[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  FENCED_CODE_PATTERN.lastIndex = 0;
  while ((match = FENCED_CODE_PATTERN.exec(content))) {
    if (match.index > lastIndex) parts.push({ kind: "text", value: content.slice(lastIndex, match.index) });
    parts.push({ kind: "code", language: match[1]?.trim() || undefined, value: match[2].replace(/\n$/, "") });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) parts.push({ kind: "text", value: content.slice(lastIndex) });
  return parts.length ? parts : [{ kind: "text", value: content }];
}



export function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
