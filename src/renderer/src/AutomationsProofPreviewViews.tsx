import { AlertCircle, Copy, ExternalLink, FileImage, Film, FolderOpen, LoaderCircle, Monitor } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { ProjectBoardCard } from "../../shared/projectBoardTypes";
import type { OrchestrationRun } from "../../shared/workflowTypes";
import type { WorkspaceOpenTarget } from "../../shared/workspaceTypes";
import { projectBoardProofEvidenceModel, projectBoardProofInspectionNavigationModel } from "./projectBoardUiModel";
import {
  LinkContextMenuState,
  RichText,
  OpenTargetIcon,
  clampNumber,
  externalLinkMenuLabel,
  formatTimelineTime,
  isAbsoluteFilePath,
  isHtmlArtifactPath,
  preferredWorkspaceOpenTarget,
  stripLinkLineSuffix,
  workspaceAbsoluteArtifactPath,
} from "./RightPanel";

export type ProofEvidenceLinkTarget = {
  href: string;
  url: string;
  artifactPath?: string;
  localPath?: string;
  absolutePath?: string;
};


export function ProofRichText({ content, workspacePath: _workspacePath, className }: { content: string; workspacePath?: string; className?: string }) {
  return (
    <div className={className ? `proof-rich-text ${className}` : "proof-rich-text"}>
      <RichText
        compact
        content={content}
        onPreviewPath={(path) => void window.ambientDesktop.openWorkspacePath(path).catch(() => undefined)}
        onPreviewLocalPath={(path) => void window.ambientDesktop.openLocalPath(path).catch(() => undefined)}
        onOpenUrl={(url) => void window.ambientDesktop.openExternalUrl(url).catch(() => undefined)}
      />
    </div>
  );
}


export function ProofEvidencePathLink({
  path,
  label,
  workspacePath,
  className,
  children,
}: {
  path: string;
  label?: string;
  workspacePath?: string;
  className?: string;
  children?: ReactNode;
}) {
  const [menu, setMenu] = useState<LinkContextMenuState | undefined>();
  const [openTargets, setOpenTargets] = useState<WorkspaceOpenTarget[]>([]);
  const target = useMemo(() => proofEvidenceLinkTarget(path, workspacePath), [path, workspacePath]);
  const hasFilePath = Boolean(target?.artifactPath || target?.localPath);
  const menuFilePath = menu?.artifactPath ? workspaceAbsoluteArtifactPath(menu.artifactPath, workspacePath) : menu?.localPath;
  const primaryOpenTarget = hasFilePath ? preferredWorkspaceOpenTarget(openTargets) : undefined;
  const chromeOpenTarget = menuFilePath && isHtmlArtifactPath(menuFilePath) ? openTargets.find((item) => item.id === "chrome") : undefined;
  const secondaryOpenTargets =
    hasFilePath && primaryOpenTarget
      ? openTargets.filter((item) => item.id !== primaryOpenTarget.id && item.id !== chromeOpenTarget?.id && item.kind !== "finder")
      : [];

  useEffect(() => {
    if (!menu || !hasFilePath) {
      setOpenTargets([]);
      return;
    }
    let disposed = false;
    window.ambientDesktop
      .listWorkspaceOpenTargets()
      .then((targets) => {
        if (!disposed) setOpenTargets(targets);
      })
      .catch(() => {
        if (!disposed) setOpenTargets([]);
      });
    return () => {
      disposed = true;
    };
  }, [hasFilePath, menu]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(undefined);
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
  }, [menu]);

  if (!target) {
    return <code className={className}>{label ?? path}</code>;
  }

  const openTarget = (targetId?: string) => {
    if (target.artifactPath) {
      void window.ambientDesktop.openWorkspacePathWith({ path: target.artifactPath, targetId }).catch(() => undefined);
      return;
    }
    if (target.localPath) {
      void window.ambientDesktop.openLocalPathWith({ path: target.localPath, targetId }).catch(() => undefined);
      return;
    }
    void window.ambientDesktop.openExternalUrl(target.url).catch(() => undefined);
  };
  const revealTarget = () => {
    if (target.artifactPath) {
      void window.ambientDesktop.revealWorkspacePath(workspaceAbsoluteArtifactPath(target.artifactPath, workspacePath)).catch(() => undefined);
      return;
    }
    if (target.localPath) void window.ambientDesktop.revealLocalPath(target.localPath).catch(() => undefined);
  };
  const copyTarget = () => {
    const copyValue = target.localPath ?? target.absolutePath ?? target.artifactPath ?? target.url;
    void window.ambientDesktop.writeClipboardText(copyValue).catch(() => undefined);
  };

  return (
    <>
      <a
        className={className ? `proof-evidence-link ${className}` : "proof-evidence-link"}
        href={target.href}
        title={target.absolutePath ?? target.localPath ?? target.artifactPath ?? target.url}
        onClick={(event) => {
          event.preventDefault();
          openTarget();
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setMenu({
            url: target.url,
            ...(target.artifactPath ? { artifactPath: target.artifactPath } : {}),
            ...(target.localPath ? { localPath: target.localPath } : {}),
            x: clampNumber(event.clientX, 8, Math.max(8, window.innerWidth - 236)),
            y: clampNumber(event.clientY, 8, Math.max(8, window.innerHeight - 320)),
          });
        }}
      >
        {children ?? label ?? path}
      </a>
      {menu && (
        <div
          className="link-context-menu proof-link-menu"
          role="menu"
          aria-label="Evidence link options"
          style={{ left: menu.x, top: menu.y }}
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {hasFilePath && chromeOpenTarget && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(undefined);
                openTarget(chromeOpenTarget.id);
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
                setMenu(undefined);
                openTarget(primaryOpenTarget.id);
              }}
            >
              <OpenTargetIcon target={primaryOpenTarget} />
              <span>{primaryOpenTarget.kind === "default" ? "Open in default app" : `Open in ${primaryOpenTarget.label}`}</span>
            </button>
          )}
          {hasFilePath &&
            secondaryOpenTargets.map((item) => (
              <button
                type="button"
                role="menuitem"
                key={item.id}
                onClick={() => {
                  setMenu(undefined);
                  openTarget(item.id);
                }}
              >
                <OpenTargetIcon target={item} />
                <span>Open with {item.label}</span>
              </button>
            ))}
          {!hasFilePath && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(undefined);
                openTarget();
              }}
            >
              <ExternalLink size={13} />
              <span>{externalLinkMenuLabel(target.url)}</span>
            </button>
          )}
          <div className="link-context-menu-divider" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenu(undefined);
              copyTarget();
            }}
          >
            <Copy size={13} />
            <span>{hasFilePath ? "Copy path" : "Copy link"}</span>
          </button>
          {hasFilePath && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(undefined);
                revealTarget();
              }}
            >
              <FolderOpen size={13} />
              <span>Open in Finder</span>
            </button>
          )}
        </div>
      )}
    </>
  );
}


export function proofEvidenceLinkTarget(path: string | undefined, workspacePath?: string): ProofEvidenceLinkTarget | undefined {
  const value = path?.trim();
  if (!value) return undefined;
  if (/^https?:\/\//i.test(value)) return { href: value, url: value };
  if (/^file:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== "file:") return undefined;
      const absolutePath = stripLinkLineSuffix(decodeURIComponent(parsed.pathname));
      return { href: value, url: value, localPath: absolutePath, absolutePath };
    } catch {
      return undefined;
    }
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return undefined;
  if (isAbsoluteFilePath(value)) {
    const absolutePath = stripLinkLineSuffix(value);
    const href = proofEvidenceFileHref(absolutePath);
    return { href, url: href, localPath: absolutePath, absolutePath };
  }
  if (!workspacePath || value.startsWith("../")) return undefined;
  const artifactPath = stripLinkLineSuffix(value).replace(/^\.\//, "");
  if (!artifactPath || artifactPath.endsWith("/")) return undefined;
  const absolutePath = workspaceAbsoluteArtifactPath(artifactPath, workspacePath);
  const href = proofEvidenceFileHref(absolutePath);
  return { href, url: href, localPath: absolutePath, absolutePath };
}


export function proofEvidenceFileHref(absolutePath: string): string {
  return `file://${encodeURI(absolutePath).replace(/#/g, "%23")}`;
}


export type ProofPreviewImageState =
  | { status: "loading" }
  | { status: "ready"; src: string }
  | { status: "unavailable"; message: string };


export function ProofPreviewImage({
  src,
  path,
  workspacePath,
  alt,
  role = "generic",
  tone = "success",
}: {
  src?: string;
  path?: string;
  workspacePath?: string;
  alt: string;
  role?: ReturnType<typeof projectBoardProofEvidenceModel>["inspection"]["visualEvidence"][number]["role"];
  tone?: ReturnType<typeof projectBoardProofEvidenceModel>["inspection"]["visualEvidence"][number]["tone"];
}) {
  const safeSrc = useMemo(() => proofCspRenderableImageSrc(src), [src]);
  const previewPath = useMemo(() => proofPreviewImageLocalPath(path ?? src, workspacePath), [path, src, workspacePath]);
  const [state, setState] = useState<ProofPreviewImageState>(() =>
    safeSrc ? { status: "ready", src: safeSrc } : previewPath ? { status: "loading" } : { status: "unavailable", message: "Preview unavailable" },
  );

  useEffect(() => {
    if (safeSrc) {
      setState({ status: "ready", src: safeSrc });
      return;
    }
    if (!previewPath) {
      setState({ status: "unavailable", message: "Preview unavailable" });
      return;
    }
    let disposed = false;
    setState({ status: "loading" });
    window.ambientDesktop
      .previewLocalFile(previewPath)
      .then((file) => {
        if (disposed) return;
        if (file.kind !== "image") {
          setState({ status: "unavailable", message: "Not an image" });
          return;
        }
        const resolvedSrc = proofCspRenderableImageSrc(file.mediaUrl) ?? proofCspRenderableImageSrc(file.dataUrl);
        setState(resolvedSrc ? { status: "ready", src: resolvedSrc } : { status: "unavailable", message: "Preview unavailable" });
      })
      .catch(() => {
        if (!disposed) setState({ status: "unavailable", message: "Preview unavailable" });
      });
    return () => {
      disposed = true;
    };
  }, [previewPath, safeSrc]);

  if (state.status === "ready") {
    return (
      <img
        src={state.src}
        alt={alt}
        onError={() => setState({ status: "unavailable", message: "Preview unavailable" })}
      />
    );
  }

  return (
    <div className={`proof-visual-card-placeholder ${state.status === "loading" ? "loading" : "unavailable"} ${tone}`}>
      {state.status === "loading" ? <LoaderCircle size={18} className="spin" /> : tone === "danger" ? <AlertCircle size={18} /> : <ProofVisualEvidenceIcon role={role} />}
      <span>{state.status === "loading" ? "Loading preview" : state.message}</span>
    </div>
  );
}


export function proofCspRenderableImageSrc(src: string | undefined): string | undefined {
  const value = src?.trim();
  if (!value) return undefined;
  if (value.startsWith("data:image/") || value.startsWith("ambient-media://")) return value;
  return undefined;
}


export function proofPreviewImageLocalPath(path: string | undefined, workspacePath?: string): string | undefined {
  const target = proofEvidenceLinkTarget(path, workspacePath);
  return target?.localPath ?? target?.absolutePath;
}


export function ProofOfWorkPreview({ run, card, defaultOpen = false }: { run: OrchestrationRun; card?: ProjectBoardCard; defaultOpen?: boolean }) {
  const evidence = projectBoardProofEvidenceModel(run, card);
  if (!evidence.hasProof && !evidence.error) return null;
  const inspectionNavigation = projectBoardProofInspectionNavigationModel(evidence.inspection, run.id, card?.id);
  const verificationArtifacts = [evidence.hook, evidence.focus, ...evidence.artifacts].filter(
    (artifact): artifact is NonNullable<typeof evidence.hook> => Boolean(artifact),
  );
  const commandArtifacts = verificationArtifacts.filter((artifact) => artifact.kind === "command");
  const otherVerificationArtifacts = verificationArtifacts.filter((artifact) => artifact.kind !== "command");
  const hasReviewEvidence =
    evidence.metrics.length > 0 ||
    evidence.review ||
    evidence.taskActions.length > 0 ||
    evidence.fileGroups.length > 0 ||
    verificationArtifacts.length > 0 ||
    evidence.assistantSummary ||
    evidence.gitStatus.length > 0 ||
    evidence.diffPreview;
  const pmJudgeSection = evidence.review ? (
    <section className="proof-evidence-section proof-review-evidence" id={inspectionNavigation.pmJudgeId} tabIndex={-1}>
      <div className="proof-review-heading">
        <div>
          <strong>PM judge</strong>
          {(evidence.review.reviewer || evidence.review.model) && (
            <span>{[evidence.review.reviewer, evidence.review.model].filter(Boolean).join(" · ")}</span>
          )}
        </div>
        <span className="proof-review-status">
          {[evidence.review.status, evidence.review.recommendedAction, evidence.review.evidenceQuality, evidence.review.confidence].filter(Boolean).join(" · ")}
        </span>
      </div>
      <ProofRichText content={evidence.review.summary} workspacePath={run.workspacePath} />
      {evidence.review.missing.length > 0 && (
        <ul className="proof-list danger">
          {evidence.review.missing.slice(0, 5).map((item) => (
            <li key={`missing-${item}`}><ProofRichText content={item} workspacePath={run.workspacePath} /></li>
          ))}
        </ul>
      )}
      {evidence.review.satisfied.length > 0 && (
        <ul className="proof-list success">
          {evidence.review.satisfied.slice(0, 5).map((item) => (
            <li key={`satisfied-${item}`}><ProofRichText content={item} workspacePath={run.workspacePath} /></li>
          ))}
        </ul>
      )}
    </section>
  ) : null;

  return (
    <details className="proof-preview" open={defaultOpen}>
      <summary>
        <span>Proof of work</span>
        <small>{evidence.summary}</small>
      </summary>
      <div>
        {!hasReviewEvidence && (
          <section className="proof-evidence-section proof-empty-warning">
            <div>
              <strong>Evidence details missing</strong>
              <span>Summary only</span>
            </div>
            <p>This proof packet has a top-level status but no renderable screenshots, changed files, command output, or PM judge details.</p>
          </section>
        )}

        {pmJudgeSection}

        {evidence.metrics.length > 0 && (
          <div className="proof-metrics">
            {evidence.metrics.map((metric) => (
              <span className={metric.tone} key={`${metric.label}:${metric.value}`}>
                <strong>{metric.label}</strong>
                {metric.value}
              </span>
            ))}
          </div>
        )}

        <ProofPacketInspectionPanel inspection={evidence.inspection} workspacePath={run.workspacePath} navigation={inspectionNavigation} />

        {commandArtifacts.length > 0 && (
          <section className="proof-evidence-section proof-test-evidence" id={inspectionNavigation.commandEvidenceId} tabIndex={-1}>
            <div>
              <strong>Unit / integration test evidence</strong>
              <span>{commandArtifacts.length} command or hook record{commandArtifacts.length === 1 ? "" : "s"}</span>
            </div>
            <div className="proof-artifacts">
              {commandArtifacts.map((artifact) => (
                <article className={`proof-artifact ${artifact.tone}`} key={`command:${artifact.label}:${artifact.path ?? artifact.detail ?? ""}`}>
                  <div>
                    <strong>{artifact.label}</strong>
                    <span>{artifact.kind.replace(/_/g, " ")}</span>
                  </div>
                  {artifact.path && <ProofEvidencePathLink path={artifact.path} workspacePath={run.workspacePath} />}
                  {artifact.detail && <ProofRichText className="proof-artifact-detail" content={artifact.detail} workspacePath={run.workspacePath} />}
                </article>
              ))}
            </div>
          </section>
        )}

        {evidence.taskActions.length > 0 && (
          <section className="proof-evidence-section">
            <div>
              <strong>Task actions</strong>
              <span>
                {evidence.taskActions.length} captured action{evidence.taskActions.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="proof-artifacts">
              {evidence.taskActions.slice(-8).map((action) => (
                <article className={`proof-artifact ${action.tone}`} key={`${action.id}:${action.action}`}>
                  <div>
                    <strong>{action.label}</strong>
                    <span>{action.action.replace(/_/g, " ")}</span>
                  </div>
                  {action.createdAt && <code>{formatTimelineTime(action.createdAt)}</code>}
                  <ProofRichText className="proof-artifact-detail" content={action.summary} workspacePath={run.workspacePath} />
                </article>
              ))}
            </div>
          </section>
        )}

        {evidence.fileGroups.length > 0 && (
          <section className="proof-evidence-section">
            <div>
              <strong>Changed files</strong>
              <span>{evidence.files.filter((file) => file.meaningful).length}/{evidence.files.length} meaningful</span>
            </div>
            <div className="proof-file-groups">
              {evidence.fileGroups.map((group) => (
                <div className="proof-file-group" key={group.label}>
                  <span>{group.label}</span>
                  {group.files.slice(0, 8).map((file) => {
                    const label = `${file.status ? `${file.status} ` : ""}${file.path}`;
                    return (
                      <ProofEvidencePathLink
                        className={`proof-file-link ${file.meaningful ? "" : "muted"}`}
                        path={file.path}
                        label={label}
                        workspacePath={run.workspacePath}
                        key={`${group.label}:${file.path}:${file.status ?? ""}`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </section>
        )}

        {otherVerificationArtifacts.length > 0 && (
          <section className="proof-evidence-section">
            <div>
              <strong>Artifacts and verification</strong>
              <span>{otherVerificationArtifacts.length} item{otherVerificationArtifacts.length === 1 ? "" : "s"}</span>
            </div>
            <div className="proof-artifacts">
              {otherVerificationArtifacts.map((artifact) => (
                <article className={`proof-artifact ${artifact.tone}`} key={`${artifact.kind}:${artifact.label}:${artifact.path ?? artifact.detail ?? ""}`}>
                  <div>
                    <strong>{artifact.label}</strong>
                    <span>{artifact.kind.replace(/_/g, " ")}</span>
                  </div>
                  {artifact.path && <ProofEvidencePathLink path={artifact.path} workspacePath={run.workspacePath} />}
                  {artifact.detail && <ProofRichText className="proof-artifact-detail" content={artifact.detail} workspacePath={run.workspacePath} />}
                  {artifact.previewSrc && (
                    <ProofEvidencePathLink className="proof-artifact-image-link" path={artifact.path ?? artifact.previewSrc} workspacePath={run.workspacePath}>
                      <ProofPreviewImage
                        src={artifact.previewSrc}
                        path={artifact.path ?? artifact.previewSrc}
                        workspacePath={run.workspacePath}
                        alt={artifact.label}
                        role={artifact.visualRole ?? "generic"}
                        tone={artifact.tone}
                      />
                    </ProofEvidencePathLink>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}

        {evidence.assistantSummary && (
          <section className="proof-evidence-section">
            <div>
              <strong>Assistant summary</strong>
            </div>
            <ProofRichText content={evidence.assistantSummary} workspacePath={run.workspacePath} />
          </section>
        )}
        {evidence.gitStatus.length > 0 && <pre>{evidence.gitStatus.slice(0, 12).join("\n")}</pre>}
        {evidence.error && <p className="run-error">{evidence.error}</p>}
        {evidence.diffPreview && <pre>{evidence.diffPreview}</pre>}
      </div>
    </details>
  );
}


export function ProofPacketInspectionPanel({
  inspection,
  workspacePath,
  navigation,
}: {
  inspection: ReturnType<typeof projectBoardProofEvidenceModel>["inspection"];
  workspacePath?: string;
  navigation: ReturnType<typeof projectBoardProofInspectionNavigationModel>;
}) {
  const jumpToIssues = () => {
    jumpToProofAnchor(navigation.issueTargetId);
  };
  const jumpToProofAnchor = (id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const jumpToChecklistTarget = (targetId: string) => {
    jumpToProofAnchor(targetId);
  };
  return (
    <section className={`proof-packet-inspection ${inspection.qualityTone}`} id={navigation.inspectionId} tabIndex={-1}>
      <header>
        <div>
          {inspection.issueCount > 0 ? (
            <button
              type="button"
              className="proof-inspection-jump"
              onClick={jumpToIssues}
              title="Jump to the first concrete proof issue in this packet."
              aria-controls={navigation.issueTargetId}
              aria-label={navigation.issueJumpAriaLabel}
            >
              <strong>{inspection.headline}</strong>
            </button>
          ) : (
            <strong>{inspection.headline}</strong>
          )}
          <span>{inspection.detail}</span>
        </div>
        <span>{inspection.qualityLabel}</span>
      </header>
      <div className="proof-inspection-meta">
        {inspection.workspaceLabel && (
          <>
            <span>Workspace</span>
            <code>{inspection.workspaceLabel}</code>
          </>
        )}
        <span>Diff</span>
        <code>{inspection.diffLabel}</code>
      </div>
      <div className="proof-inspection-checklist" id={navigation.checklistId} tabIndex={-1}>
        {inspection.checklist.map((item, index) => {
          const navItem = navigation.checklist[index];
          const itemTarget = item.target;
          const itemTargetId = navItem.targetId;
          return (
            <article
              className={`${item.tone} ${itemTarget ? "clickable" : ""}`}
              id={navItem.checkId}
              role={itemTarget ? "button" : undefined}
              tabIndex={itemTarget ? 0 : -1}
              aria-controls={itemTargetId}
              aria-label={navItem.ariaLabel}
              title={itemTarget ? "Jump to the supporting proof evidence for this row." : undefined}
              onClick={itemTargetId ? () => jumpToChecklistTarget(itemTargetId) : undefined}
              onKeyDown={
                itemTargetId
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        jumpToChecklistTarget(itemTargetId);
                      }
                    }
                  : undefined
              }
              key={`${item.label}:${item.detail}`}
            >
              <strong>{item.label}</strong>
              <ProofRichText content={item.detail} workspacePath={workspacePath} />
            </article>
          );
        })}
      </div>
      {inspection.visualEvidence.length > 0 && <ProofVisualEvidenceGallery items={inspection.visualEvidence} workspacePath={workspacePath} anchorId={navigation.visualEvidenceId} />}
      {inspection.failedAssertions.length > 0 && (
        <ul className="proof-inspection-failures" id={navigation.proofIssuesId} tabIndex={-1}>
          {inspection.failedAssertions.map((item) => (
            <li key={item}>
              <ProofRichText content={item} workspacePath={workspacePath} />
            </li>
          ))}
        </ul>
      )}
      {inspection.transcriptExcerpt && (
        <details className="proof-transcript-excerpt">
          <summary>Transcript excerpt</summary>
          <ProofRichText content={inspection.transcriptExcerpt} workspacePath={workspacePath} />
        </details>
      )}
    </section>
  );
}


export function ProofVisualEvidenceGallery({
  items,
  workspacePath,
  anchorId,
}: {
  items: ReturnType<typeof projectBoardProofEvidenceModel>["inspection"]["visualEvidence"];
  workspacePath?: string;
  anchorId?: string;
}) {
  const attached = items.filter((item) => Boolean(item.artifact)).length;
  const missing = items.filter((item) => item.tone === "danger").length;
  return (
    <section className="proof-visual-gallery" aria-label="Visual proof evidence" id={anchorId} tabIndex={anchorId ? -1 : undefined}>
      <header>
        <div>
          <strong>Visual evidence</strong>
          <span>
            {attached} attached{missing > 0 ? `, ${missing} missing` : ""}
          </span>
        </div>
      </header>
      <div className="proof-visual-gallery-grid">
        {items.map((item, index) => (
          // Index in the key: several "additional" artifacts can share label and
          // status with no path, which produced duplicate keys (and console spam).
          <article className={`proof-visual-card ${item.tone}`} key={`${index}:${item.label}:${item.expectation ?? item.artifact?.path ?? item.statusLabel}`}>
            <div className="proof-visual-card-frame">
              {item.frames && item.frames.length > 1 ? (
                <div className="proof-visual-frame-strip" aria-label={`${item.label} frames`}>
                  {item.frames.map((frame, index) => (
                    <ProofEvidencePathLink
                      path={frame.path ?? frame.previewSrc ?? ""}
                      workspacePath={workspacePath}
                      className="proof-visual-image-link"
                      key={`${frame.path ?? frame.previewSrc ?? frame.label}:${index}`}
                    >
                      <ProofPreviewImage
                        src={frame.previewSrc}
                        path={frame.path ?? frame.previewSrc}
                        workspacePath={workspacePath}
                        alt={`${item.label} frame ${index + 1}`}
                        role={item.role}
                        tone={item.tone}
                      />
                    </ProofEvidencePathLink>
                  ))}
                </div>
              ) : item.thumbnailSrc ? (
                <ProofEvidencePathLink path={item.artifact?.path ?? item.thumbnailSrc} workspacePath={workspacePath} className="proof-visual-image-link">
                  <ProofPreviewImage
                    src={item.thumbnailSrc}
                    path={item.artifact?.path ?? item.thumbnailSrc}
                    workspacePath={workspacePath}
                    alt={item.label}
                    role={item.role}
                    tone={item.tone}
                  />
                </ProofEvidencePathLink>
              ) : (
                <div className="proof-visual-card-placeholder">
                  {item.tone === "danger" ? <AlertCircle size={18} /> : <ProofVisualEvidenceIcon role={item.role} />}
                </div>
              )}
            </div>
            <div className="proof-visual-card-body">
              <div className="proof-visual-card-heading">
                <strong>{item.label}</strong>
                <span>{item.statusLabel}</span>
              </div>
              <div className="proof-visual-card-meta">
                {item.viewportLabel && <span>{item.viewportLabel}</span>}
                {item.dimensionsLabel && <span>{item.dimensionsLabel}</span>}
              </div>
              {item.expectation && <ProofRichText content={item.expectation} workspacePath={workspacePath} />}
              {item.comparisonLabel && <ProofRichText content={item.comparisonLabel} workspacePath={workspacePath} />}
              {item.artifact?.path && <ProofEvidencePathLink path={item.artifact.path} workspacePath={workspacePath} />}
              {item.artifact?.detail && <ProofRichText content={item.artifact.detail} workspacePath={workspacePath} />}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}


export function ProofVisualEvidenceIcon({ role }: { role: ReturnType<typeof projectBoardProofEvidenceModel>["inspection"]["visualEvidence"][number]["role"] }) {
  if (role === "animation") return <Film size={18} />;
  if (role === "desktop" || role === "tablet" || role === "browser") return <Monitor size={18} />;
  return <FileImage size={18} />;
}
