import { Archive, ChevronRight, ExternalLink, GitBranch, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import type {
  SubagentParentClusterApprovalActionModel,
  SubagentParentClusterChildBlockerModel,
  SubagentParentClusterChildModel,
  SubagentParentClusterMailboxActionModel,
  SubagentParentClusterModel,
  SubagentParentClusterParentBlockingModel,
  SubagentParentClusterWorkflowTaskModel,
} from "./subagentParentClusterUiModel";
import type {
  SubagentPatternGraphNodeModel,
  SubagentPatternGraphOverflowChildModel,
  SubagentPatternGraphRendererModel,
} from "./subagentPatternGraphUiModel";
import {
  SubagentParentClusterBarrierList,
  SubagentParentClusterMailboxActivityList,
  SubagentParentClusterWorkflowTaskList,
} from "./SubagentParentClusterStatusLists";

export interface SubagentParentClusterProps {
  model: SubagentParentClusterModel;
  autoOpen?: boolean;
  liveChildRunIds?: readonly string[];
  onOpenThread: (child: SubagentParentClusterChildModel) => void;
  onCancelChild: (child: SubagentParentClusterChildModel) => void;
  onCloseChild: (child: SubagentParentClusterChildModel) => void;
  onOpenWorkflowThread: (task: SubagentParentClusterWorkflowTaskModel) => void;
  onPauseWorkflowTask: (task: SubagentParentClusterWorkflowTaskModel) => void;
  onResumeWorkflowTask: (task: SubagentParentClusterWorkflowTaskModel) => void;
  onCancelWorkflowTask: (task: SubagentParentClusterWorkflowTaskModel) => void;
  onResolveBarrierAction: (action: SubagentParentClusterMailboxActionModel) => void;
  onResolveApprovalAction: (action: SubagentParentClusterApprovalActionModel) => void;
  renderChildTranscript?: (child: SubagentParentClusterChildModel) => ReactNode;
  cancelChildBusyId?: string;
  closeChildBusyId?: string;
  pauseWorkflowTaskBusyId?: string;
  resumeWorkflowTaskBusyId?: string;
  cancelWorkflowTaskBusyId?: string;
  barrierActionBusyId?: string;
  approvalActionBusyId?: string;
}

export function SubagentParentCluster({
  model,
  onOpenThread,
  onCancelChild,
  onCloseChild,
  onOpenWorkflowThread,
  onPauseWorkflowTask,
  onResumeWorkflowTask,
  onCancelWorkflowTask,
  onResolveBarrierAction,
  onResolveApprovalAction,
  renderChildTranscript,
  autoOpen = false,
  liveChildRunIds = [],
  cancelChildBusyId,
  closeChildBusyId,
  pauseWorkflowTaskBusyId,
  resumeWorkflowTaskBusyId,
  cancelWorkflowTaskBusyId,
  barrierActionBusyId,
  approvalActionBusyId,
}: SubagentParentClusterProps) {
  const clusterToggleIntent = useRef(false);
  const clusterUserCollapsed = useRef(false);
  const childDetailsByRunId = useRef(new Map<string, HTMLDetailsElement>());
  const childToggleIntentRunIds = useRef(new Set<string>());
  const userCollapsedChildRunIds = useRef(new Set<string>());
  const liveChildRunIdsKey = childRunIdListKey([...liveChildRunIds]);
  const liveChildRunIdSet = useMemo(() => new Set(runIdsFromListKey(liveChildRunIdsKey)), [liveChildRunIdsKey]);
  const [clusterOpen, setClusterOpen] = useState(autoOpen);
  const defaultExpandedChildRunIds = defaultExpandedChildRunIdsForModel(model, liveChildRunIdSet);
  const defaultExpandedChildRunIdsKey = childRunIdListKey(defaultExpandedChildRunIds);
  const defaultExpandedChildRunIdSet = useMemo(
    () => new Set(runIdsFromListKey(defaultExpandedChildRunIdsKey)),
    [defaultExpandedChildRunIdsKey],
  );
  const [expandedChildRunIds, setExpandedChildRunIds] = useState<Set<string>>(() => new Set(defaultExpandedChildRunIds));
  const scrollExpandedDetailsIntoView = useCallback((details: HTMLDetailsElement) => {
    details.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
    requestAnimationFrame(() => {
      details.scrollIntoView({ block: "end", inline: "nearest", behavior: "auto" });
    });
  }, []);
  const markClusterToggleIntent = useCallback(() => {
    clusterToggleIntent.current = true;
  }, []);
  const registerChildDetails = useCallback(
    (runId: string) => (element: HTMLDetailsElement | null) => {
      if (element) childDetailsByRunId.current.set(runId, element);
      else childDetailsByRunId.current.delete(runId);
    },
    [],
  );
  const markChildToggleIntent = useCallback((runId: string) => {
    childToggleIntentRunIds.current.add(runId);
  }, []);
  useEffect(() => {
    if (autoOpen && !clusterUserCollapsed.current) setClusterOpen(true);
    if (!autoOpen) clusterUserCollapsed.current = false;
  }, [autoOpen]);
  useEffect(() => {
    setExpandedChildRunIds((current) => {
      let changed = false;
      const next = new Set(current);
      for (const runId of defaultExpandedChildRunIdSet) {
        if (userCollapsedChildRunIds.current.has(runId) || next.has(runId)) continue;
        next.add(runId);
        changed = true;
      }
      return changed ? next : current;
    });
    for (const runId of userCollapsedChildRunIds.current) {
      if (!defaultExpandedChildRunIdSet.has(runId)) userCollapsedChildRunIds.current.delete(runId);
    }
  }, [defaultExpandedChildRunIdSet]);
  const setChildExpanded = useCallback((runId: string, open: boolean, source: "user" | "programmatic" = "user") => {
    if (source !== "programmatic") {
      if (open) userCollapsedChildRunIds.current.delete(runId);
      else userCollapsedChildRunIds.current.add(runId);
    } else if (open) {
      userCollapsedChildRunIds.current.delete(runId);
    }
    setExpandedChildRunIds((current) => {
      const alreadyOpen = current.has(runId);
      if (alreadyOpen === open) return current;
      const next = new Set(current);
      if (open) next.add(runId);
      else next.delete(runId);
      return next;
    });
  }, []);
  const renderedExpandedChildRunIds = useMemo(() => {
    const next = new Set(expandedChildRunIds);
    for (const runId of defaultExpandedChildRunIdSet) {
      if (!userCollapsedChildRunIds.current.has(runId)) next.add(runId);
    }
    return next;
  }, [defaultExpandedChildRunIdSet, expandedChildRunIds]);
  const approvalActionsByChildIdentity = useMemo(() => {
    const byRunId = new Map<string, SubagentParentClusterApprovalActionModel[]>();
    const byThreadId = new Map<string, SubagentParentClusterApprovalActionModel[]>();
    for (const action of model.mailboxActivities.flatMap((activity) => activity.approvalActions ?? [])) {
      const runActions = byRunId.get(action.childRunId) ?? [];
      runActions.push(action);
      byRunId.set(action.childRunId, runActions);
      if (action.childThreadId) {
        const threadActions = byThreadId.get(action.childThreadId) ?? [];
        threadActions.push(action);
        byThreadId.set(action.childThreadId, threadActions);
      }
    }
    return { byRunId, byThreadId };
  }, [model.mailboxActivities]);
  const approvalActionForGraphNode = useCallback(
    (node: SubagentPatternGraphNodeModel) => {
      const actions = [
        ...(node.childRunId ? (approvalActionsByChildIdentity.byRunId.get(node.childRunId) ?? []) : []),
        ...(node.childThreadId ? (approvalActionsByChildIdentity.byThreadId.get(node.childThreadId) ?? []) : []),
      ];
      return actions.find((action) => action.decision === "approved") ?? actions[0];
    },
    [approvalActionsByChildIdentity],
  );
  const expandChildTranscriptFromGraph = useCallback(
    (child: SubagentParentClusterChildModel) => {
      setChildExpanded(child.runId, true, "programmatic");
      const details = childDetailsByRunId.current.get(child.runId);
      if (!details) {
        if (child.canOpenThread) onOpenThread(child);
        return;
      }
      details.open = true;
      requestAnimationFrame(() => {
        scrollExpandedDetailsIntoView(details);
        details.querySelector<HTMLElement>("summary")?.focus({ preventScroll: true });
      });
    },
    [onOpenThread, scrollExpandedDetailsIntoView, setChildExpanded],
  );

  return (
    <details
      className="subagent-parent-cluster"
      open={clusterOpen}
      data-subagent-cluster-auto-open={String(autoOpen)}
      data-subagent-cluster-live-child-count={liveChildRunIdSet.size}
      onToggle={(event) => {
        const open = event.currentTarget.open;
        const userInitiated = clusterToggleIntent.current;
        clusterToggleIntent.current = false;
        if (!userInitiated && !open && autoOpen && !clusterUserCollapsed.current) {
          event.currentTarget.open = true;
          setClusterOpen(true);
          return;
        }
        if (userInitiated) clusterUserCollapsed.current = autoOpen && !open;
        setClusterOpen(open);
        if (event.currentTarget.open) scrollExpandedDetailsIntoView(event.currentTarget);
      }}
    >
      <summary
        onClick={markClusterToggleIntent}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") markClusterToggleIntent();
        }}
      >
        <span className="subagent-parent-cluster-title">
          <GitBranch size={13} aria-hidden="true" />
          <span>{model.title}</span>
          <small>{model.summary}</small>
        </span>
        <span className={`subagent-parent-cluster-status tone-${model.statusTone}`}>{model.status}</span>
      </summary>
      {model.parentBlocking && (
        <SubagentParentBlockingBanner
          blocking={model.parentBlocking}
          onOpenChild={(blockingChild) => {
            const child = model.children.find((candidate) => candidate.runId === blockingChild.runId);
            if (child) expandChildTranscriptFromGraph(child);
          }}
        />
      )}
      <div className="subagent-parent-cluster-list">
        {model.children.map((child) => {
          const childApprovalActions =
            child.parentBlocker?.kind === "approval"
              ? uniqueApprovalActions(
                  model.mailboxActivities
                    .flatMap((activity) => activity.approvalActions ?? [])
                    .filter((action) => action.childRunId === child.runId),
                )
              : [];
          const childBarrierActions =
            child.parentBlocker && child.parentBlocker.kind !== "approval"
              ? uniqueBarrierActions(
                  model.mailboxActivities
                    .flatMap((activity) => activity.actions ?? [])
                    .filter((action) => action.childRunIds?.includes(child.runId)),
                )
              : [];
          return (
            <details
              className={["subagent-parent-cluster-child-thread", child.canOpenThread ? undefined : "is-retained"]
                .filter(Boolean)
                .join(" ")}
              key={child.runId}
              data-child-run-id={child.runId}
              data-child-thread-id={child.childThreadId}
              data-child-default-expanded={String(defaultExpandedChildRunIdSet.has(child.runId))}
              data-child-live-transcript-auto-open={String(liveChildRunIdSet.has(child.runId))}
              ref={registerChildDetails(child.runId)}
              open={renderedExpandedChildRunIds.has(child.runId)}
              onToggle={(event) => {
                event.stopPropagation();
                const open = event.currentTarget.open;
                const userInitiated = childToggleIntentRunIds.current.delete(child.runId);
                if (!userInitiated && !open && defaultExpandedChildRunIdSet.has(child.runId)) {
                  event.currentTarget.open = true;
                  setChildExpanded(child.runId, true, "programmatic");
                  return;
                }
                setChildExpanded(child.runId, open);
                if (open) scrollExpandedDetailsIntoView(event.currentTarget);
              }}
            >
              <summary
                className="subagent-parent-cluster-child-row"
                title={child.retentionTitle ?? `Expand ${child.title} transcript`}
                tabIndex={0}
                onClick={() => markChildToggleIntent(child.runId)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") markChildToggleIntent(child.runId);
                }}
              >
                <span className="subagent-parent-cluster-child-open">
                  <SubagentParentClusterChildContent child={child} />
                  <ChevronRight className="subagent-parent-cluster-child-expander" size={13} aria-hidden="true" />
                </span>
                <SubagentParentClusterChildActions
                  child={child}
                  onOpenThread={onOpenThread}
                  onCancelChild={onCancelChild}
                  onCloseChild={onCloseChild}
                  cancelChildBusyId={cancelChildBusyId}
                  closeChildBusyId={closeChildBusyId}
                />
              </summary>
              <div className="subagent-parent-cluster-child-transcript">
                <div
                  className="subagent-parent-cluster-child-transcript-heading"
                  data-child-transcript-layout="transcript-first"
                  data-child-summary-follows={child.parentBlocker ? "true" : "false"}
                >
                  <strong>Child transcript</strong>
                  <span>{child.childThreadId}</span>
                </div>
                {renderChildTranscript?.(child) ?? (
                  <div className="subagent-parent-cluster-child-transcript-empty">
                    Child transcript unavailable. Open the child thread to inspect it.
                  </div>
                )}
                {child.parentBlocker && (
                  <SubagentParentClusterChildBlockerPanel
                    child={child}
                    blocker={child.parentBlocker}
                    approvalActions={childApprovalActions}
                    barrierActions={childBarrierActions}
                    approvalActionBusyId={approvalActionBusyId}
                    barrierActionBusyId={barrierActionBusyId}
                    onResolveApprovalAction={onResolveApprovalAction}
                    onResolveBarrierAction={onResolveBarrierAction}
                  />
                )}
              </div>
            </details>
          );
        })}
      </div>
      <SubagentParentClusterBarrierList barriers={model.barriers} />
      {model.patternGraphs.length > 0 && (
        <div className="subagent-parent-cluster-pattern-graphs" aria-label="Sub-agent pattern graphs">
          {model.patternGraphs.map((graph) => (
            <SubagentPatternGraphPanel
              key={graph.id}
              graph={graph}
              approvalActionForNode={approvalActionForGraphNode}
              approvalActionBusyId={approvalActionBusyId}
              onOpenNode={(node) => {
                const child = model.children.find(
                  (candidate) => candidate.runId === node.childRunId || candidate.childThreadId === node.childThreadId,
                );
                if (child) {
                  expandChildTranscriptFromGraph(child);
                  return;
                }
                const workflowTask = model.workflowTasks.find(
                  (candidate) =>
                    candidate.id === node.workflowTaskId ||
                    Boolean(node.workflowRunId && candidate.idLabels?.some((label) => label.includes(node.workflowRunId!))),
                );
                if (workflowTask) onOpenWorkflowThread(workflowTask);
              }}
              onOpenApprovalBadge={(_node, action) => onResolveApprovalAction(action)}
              canOpenOverflowChild={(overflowChild) =>
                model.children.some(
                  (candidate) => candidate.runId === overflowChild.childRunId || candidate.childThreadId === overflowChild.childThreadId,
                )
              }
              onOpenOverflowChild={(overflowChild) => {
                const child = model.children.find(
                  (candidate) => candidate.runId === overflowChild.childRunId || candidate.childThreadId === overflowChild.childThreadId,
                );
                if (child) expandChildTranscriptFromGraph(child);
              }}
            />
          ))}
        </div>
      )}
      <SubagentParentClusterWorkflowTaskList
        tasks={model.workflowTasks}
        pauseWorkflowTaskBusyId={pauseWorkflowTaskBusyId}
        resumeWorkflowTaskBusyId={resumeWorkflowTaskBusyId}
        cancelWorkflowTaskBusyId={cancelWorkflowTaskBusyId}
        onOpenWorkflowThread={onOpenWorkflowThread}
        onPauseWorkflowTask={onPauseWorkflowTask}
        onResumeWorkflowTask={onResumeWorkflowTask}
        onCancelWorkflowTask={onCancelWorkflowTask}
      />
      <SubagentParentClusterMailboxActivityList
        activities={model.mailboxActivities}
        approvalActionBusyId={approvalActionBusyId}
        barrierActionBusyId={barrierActionBusyId}
        onResolveApprovalAction={onResolveApprovalAction}
        onResolveBarrierAction={onResolveBarrierAction}
      />
    </details>
  );
}

function defaultExpandedChildRunIdsForModel(model: SubagentParentClusterModel, liveChildRunIds: ReadonlySet<string> = new Set()): string[] {
  const parentBlockingRunIds = new Set(model.parentBlocking?.blockingChildren.map((child) => child.runId) ?? []);
  return model.children
    .filter((child) => liveChildRunIds.has(child.runId) || shouldDefaultExpandChild(child, parentBlockingRunIds))
    .map((child) => child.runId);
}

function childRunIdListKey(runIds: string[]): string {
  return runIds.join("\u001f");
}

function runIdsFromListKey(key: string): string[] {
  return key ? key.split("\u001f") : [];
}

function shouldDefaultExpandChild(child: SubagentParentClusterChildModel, parentBlockingRunIds: ReadonlySet<string>): boolean {
  if (!child.isSynthesisSafe && !child.retentionLabel) return true;
  if (child.parentBlocker && child.parentBlocker.statusTone !== "success") return true;
  if (!child.isTerminal && (child.statusTone === "warning" || child.statusTone === "danger")) return true;
  if (
    !child.isSynthesisSafe &&
    /\b(needs attention|approval|blocking|waiting)\b/i.test(
      [child.status, child.preview, child.parentBlocker?.label, child.parentBlocker?.detail].filter(Boolean).join(" "),
    )
  ) {
    return true;
  }
  return parentBlockingRunIds.has(child.runId) && !child.isTerminal;
}

function uniqueApprovalActions(actions: SubagentParentClusterApprovalActionModel[]): SubagentParentClusterApprovalActionModel[] {
  const seen = new Set<string>();
  return actions.filter((action) => {
    const key = `${action.childRunId}:${action.approvalId}:${action.decision}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueBarrierActions(actions: SubagentParentClusterMailboxActionModel[]): SubagentParentClusterMailboxActionModel[] {
  const seen = new Set<string>();
  return actions.filter((action) => {
    const key = `${action.waitBarrierId}:${action.decision}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function SubagentParentBlockingBanner({
  blocking,
  onOpenChild,
}: {
  blocking: SubagentParentClusterParentBlockingModel;
  onOpenChild: (child: SubagentParentClusterParentBlockingModel["blockingChildren"][number]) => void;
}) {
  return (
    <section className={`subagent-parent-cluster-parent-blocking tone-${blocking.statusTone}`} aria-label="Parent blocking child threads">
      <div className="subagent-parent-cluster-parent-blocking-copy">
        <strong>{blocking.label}</strong>
        <span>{blocking.detail}</span>
      </div>
      <div className="subagent-parent-cluster-parent-blocking-children">
        {blocking.blockingChildren.map((child) => (
          <button
            key={child.runId}
            type="button"
            className={`subagent-parent-cluster-parent-blocking-child tone-${child.statusTone}`}
            data-child-run-id={child.runId}
            data-child-thread-id={child.childThreadId}
            title={child.detail}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onOpenChild(child);
            }}
          >
            {child.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function SubagentParentClusterChildBlockerPanel({
  child,
  blocker,
  approvalActions,
  barrierActions,
  approvalActionBusyId,
  barrierActionBusyId,
  onResolveApprovalAction,
  onResolveBarrierAction,
}: {
  child: SubagentParentClusterChildModel;
  blocker: SubagentParentClusterChildBlockerModel;
  approvalActions: SubagentParentClusterApprovalActionModel[];
  barrierActions: SubagentParentClusterMailboxActionModel[];
  approvalActionBusyId?: string;
  barrierActionBusyId?: string;
  onResolveApprovalAction: (action: SubagentParentClusterApprovalActionModel) => void;
  onResolveBarrierAction: (action: SubagentParentClusterMailboxActionModel) => void;
}) {
  return (
    <section
      className={`subagent-parent-cluster-child-blocker-panel tone-${blocker.statusTone}`}
      aria-label={`Parent blocker for ${child.title}`}
      data-child-blocker-panel="after-transcript"
      data-child-run-id={child.runId}
    >
      <div className="subagent-parent-cluster-child-blocker-panel-copy">
        <strong>{blocker.label}</strong>
        <span>{blocker.detail}</span>
      </div>
      <div className="subagent-parent-cluster-child-blocker-panel-meta">
        {blocker.metaLabels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      {approvalActions.length > 0 && (
        <div className="subagent-parent-cluster-child-blocker-panel-actions">
          {approvalActions.map((action) => {
            const busyKey = `${action.childRunId}:${action.approvalId}`;
            const isApprovalBusy = approvalActionBusyId === busyKey;
            return (
              <button
                key={`${busyKey}:${action.decision}`}
                type="button"
                className={`subagent-parent-cluster-mailbox-action is-button ${action.decision === "denied" ? "is-danger" : "is-approve"}`}
                disabled={isApprovalBusy}
                title={isApprovalBusy ? "Resolving child approval" : action.title}
                aria-label={isApprovalBusy ? "Resolving child approval" : action.title}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onResolveApprovalAction(action);
                }}
              >
                {action.label}
              </button>
            );
          })}
        </div>
      )}
      {barrierActions.length > 0 && (
        <div className="subagent-parent-cluster-child-blocker-panel-actions">
          {barrierActions.map((action) => {
            const busyKey = `${action.waitBarrierId}:${action.decision}`;
            const isBarrierBusy = barrierActionBusyId?.startsWith(`${action.waitBarrierId}:`) === true;
            return (
              <button
                key={busyKey}
                type="button"
                className="subagent-parent-cluster-mailbox-action is-button"
                disabled={isBarrierBusy}
                title={isBarrierBusy ? "Resolving wait barrier" : action.title}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onResolveBarrierAction(action);
                }}
              >
                {action.label}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function SubagentPatternGraphPanel({
  graph,
  approvalActionForNode,
  approvalActionBusyId,
  onOpenNode,
  onOpenApprovalBadge,
  canOpenOverflowChild,
  onOpenOverflowChild,
}: {
  graph: SubagentPatternGraphRendererModel;
  approvalActionForNode?: (node: SubagentPatternGraphNodeModel) => SubagentParentClusterApprovalActionModel | undefined;
  approvalActionBusyId?: string;
  onOpenNode: (node: SubagentPatternGraphNodeModel) => void;
  onOpenApprovalBadge?: (node: SubagentPatternGraphNodeModel, action: SubagentParentClusterApprovalActionModel) => void;
  canOpenOverflowChild?: (child: SubagentPatternGraphOverflowChildModel) => boolean;
  onOpenOverflowChild?: (child: SubagentPatternGraphOverflowChildModel) => void;
}) {
  const graphDomId = patternGraphDomId(graph.id);
  const markerId = `subagent-pattern-graph-arrow-${graphDomId}`;
  const [expandedOverflowNodeIds, setExpandedOverflowNodeIds] = useState<Set<string>>(() => new Set());
  const expandableOverflowNodeIds = useMemo(
    () => new Set(graph.nodes.filter((node) => node.canExpandOverflow).map((node) => node.id)),
    [graph.nodes],
  );
  useEffect(() => {
    setExpandedOverflowNodeIds((current) => {
      let changed = false;
      const next = new Set<string>();
      for (const nodeId of current) {
        if (expandableOverflowNodeIds.has(nodeId)) next.add(nodeId);
        else changed = true;
      }
      return changed ? next : current;
    });
  }, [expandableOverflowNodeIds]);
  const toggleOverflowNode = useCallback((nodeId: string) => {
    setExpandedOverflowNodeIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);
  const expandedOverflowNodes = graph.nodes.filter((node) => node.canExpandOverflow && expandedOverflowNodeIds.has(node.id));
  return (
    <section className={`subagent-pattern-graph layout-${graph.layout}`} aria-label={graph.ariaLabel}>
      <header>
        <strong>{graph.label}</strong>
        <span>{graph.summary}</span>
      </header>
      <svg viewBox={graph.viewBox} role="img" aria-label={`${graph.label} live child graph`}>
        <defs>
          <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" />
          </marker>
        </defs>
        {graph.edges.map((edge) => (
          <g
            key={edge.id}
            className={`subagent-pattern-graph-edge tone-${edge.tone} ${edge.required ? "required" : "optional"} ${edge.blockingParent ? "blocking-parent" : ""}`}
            data-edge-status={edge.statusLabel}
            data-blocking-parent={edge.blockingParent ? "true" : "false"}
          >
            <title>{`${edge.label} / ${edge.statusLabel}${edge.blockingParent ? " / blocks parent" : ""}`}</title>
            <line x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2} markerEnd={`url(#${markerId})`} />
            <text x={(edge.x1 + edge.x2) / 2} y={(edge.y1 + edge.y2) / 2 - 6}>
              {svgLabel(edge.blockingParent ? `${edge.label} / ${edge.statusLabel}` : edge.label, 24)}
            </text>
          </g>
        ))}
        {graph.nodes.map((node) => {
          const nodeCanInteract = node.canOpen || node.canExpandOverflow;
          const overflowExpanded = node.canExpandOverflow && expandedOverflowNodeIds.has(node.id);
          const overflowPanelId = node.canExpandOverflow ? patternGraphOverflowPanelId(graphDomId, node.id) : undefined;
          const ariaLabel = node.canExpandOverflow
            ? `${overflowExpanded ? "Collapse" : "Expand"} ${node.overflowLabel ?? node.label} from ${graph.label}`
            : node.canOpen
              ? `Open ${node.label} thread from ${graph.label}`
              : node.title;
          const activateNode = () => {
            if (node.canExpandOverflow) {
              toggleOverflowNode(node.id);
              return;
            }
            if (node.canOpen) onOpenNode(node);
          };
          return (
            <g
              key={node.id}
              className={[
                "subagent-pattern-graph-node",
                `tone-${node.tone}`,
                node.blockingParent ? "blocking-parent" : undefined,
                nodeCanInteract ? "can-open" : undefined,
                node.canExpandOverflow ? "can-expand-overflow" : undefined,
                overflowExpanded ? "is-expanded" : undefined,
              ]
                .filter(Boolean)
                .join(" ")}
              role={nodeCanInteract ? "button" : "img"}
              tabIndex={nodeCanInteract ? 0 : undefined}
              focusable={nodeCanInteract ? "true" : undefined}
              aria-keyshortcuts={nodeCanInteract ? "Enter Space" : undefined}
              aria-expanded={node.canExpandOverflow ? overflowExpanded : undefined}
              aria-controls={overflowPanelId}
              data-graph-node-id={node.id}
              data-child-run-id={node.childRunId}
              data-child-thread-id={node.childThreadId}
              data-workflow-task-id={node.workflowTaskId}
              data-workflow-run-id={node.workflowRunId}
              data-node-badges={node.badges.map((badge) => badge.key).join(",")}
              data-keyboard-openable={nodeCanInteract ? "true" : "false"}
              data-overflow-expandable={node.canExpandOverflow ? "true" : "false"}
              data-overflow-expanded={node.canExpandOverflow ? String(overflowExpanded) : undefined}
              data-overflow-count={node.overflowChildren?.length ? String(node.overflowChildren.length) : undefined}
              aria-label={ariaLabel}
              onClick={activateNode}
              onKeyDown={(event) => {
                if (!nodeCanInteract) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  activateNode();
                }
              }}
            >
              <rect x={node.x} y={node.y} width={node.width} height={node.height} rx="8">
                <title>{node.title}</title>
              </rect>
              <text x={node.centerX} y={node.y + 20} textAnchor="middle" className="node-label">
                {svgLabel(node.label, 18)}
              </text>
              <text x={node.centerX} y={node.y + 36} textAnchor="middle" className="node-status">
                {svgLabel(node.statusLabel, 18)}
              </text>
              {node.blockingParent && <circle cx={node.x + node.width - 10} cy={node.y + 10} r="5" className="node-blocker-dot" />}
              {node.badges.slice(0, 2).map((badge, index) => {
                const approvalAction = badge.key === "approval" ? approvalActionForNode?.(node) : undefined;
                const approvalBusy = Boolean(
                  approvalAction && approvalActionBusyId === `${approvalAction.childRunId}:${approvalAction.approvalId}`,
                );
                const canOpenApproval = Boolean(approvalAction && onOpenApprovalBadge && !approvalBusy);
                const approvalLabel = approvalAction
                  ? `Open approval request ${approvalAction.approvalId} for ${node.label} from ${graph.label}`
                  : undefined;
                const openApproval = (event: { preventDefault: () => void; stopPropagation: () => void }) => {
                  if (!approvalAction || !onOpenApprovalBadge || approvalBusy) return;
                  event.preventDefault();
                  event.stopPropagation();
                  onOpenApprovalBadge(node, approvalAction);
                };
                return (
                  <g
                    key={`${node.id}:${badge.key}`}
                    className={`node-badge tone-${badge.tone} ${canOpenApproval ? "can-open-approval" : ""}`}
                    role={canOpenApproval ? "button" : undefined}
                    tabIndex={canOpenApproval ? 0 : undefined}
                    focusable={canOpenApproval ? "true" : undefined}
                    aria-label={approvalLabel}
                    aria-keyshortcuts={canOpenApproval ? "Enter Space" : undefined}
                    aria-disabled={approvalBusy ? "true" : undefined}
                    data-badge-key={badge.key}
                    data-approval-id={approvalAction?.approvalId}
                    data-approval-child-run-id={approvalAction?.childRunId}
                    data-approval-child-thread-id={approvalAction?.childThreadId}
                    data-approval-busy={approvalAction ? String(approvalBusy) : undefined}
                    data-approval-openable={approvalAction ? String(canOpenApproval) : undefined}
                    transform={`translate(${node.x + 6 + index * 52}, ${node.y + node.height - 17})`}
                    onClick={openApproval}
                    onKeyDown={(event) => {
                      if (!canOpenApproval) return;
                      if (event.key === "Enter" || event.key === " ") openApproval(event);
                    }}
                  >
                    <rect width="48" height="12" rx="6">
                      <title>{approvalLabel ?? badge.label}</title>
                    </rect>
                    <text x="24" y="8.5" textAnchor="middle">
                      {svgLabel(shortBadgeLabel(badge.label), 9)}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      {expandedOverflowNodes.length > 0 && (
        <div className="subagent-pattern-graph-overflow-panels" aria-label={`${graph.label} grouped child lists`}>
          {expandedOverflowNodes.map((node) => (
            <div
              key={`${graph.id}:${node.id}:overflow-panel`}
              id={patternGraphOverflowPanelId(graphDomId, node.id)}
              className={`subagent-pattern-graph-overflow-panel tone-${node.tone}`}
              data-overflow-panel-node-id={node.id}
              data-overflow-panel-count={node.overflowChildren?.length ?? 0}
            >
              <div className="subagent-pattern-graph-overflow-panel-heading">
                <strong>{node.label}</strong>
                <span>{node.overflowLabel}</span>
              </div>
              <div className="subagent-pattern-graph-overflow-list">
                {(node.overflowChildren ?? []).map((child) => {
                  const childCanOpen = child.canOpen && (canOpenOverflowChild?.(child) ?? true);
                  return (
                    <button
                      key={`${node.id}:${child.childRunId}`}
                      type="button"
                      className={`subagent-pattern-graph-overflow-child tone-${child.tone}`}
                      disabled={!childCanOpen}
                      title={child.title}
                      aria-label={
                        childCanOpen
                          ? `Open grouped child ${child.label} from ${graph.label}`
                          : `Grouped child ${child.label} from ${graph.label}`
                      }
                      data-overflow-child-run-id={child.childRunId}
                      data-overflow-child-thread-id={child.childThreadId}
                      data-overflow-child-status={child.statusLabel}
                      data-overflow-child-blocking={child.blockingParent ? "true" : "false"}
                      data-overflow-child-approval={child.approvalLabel}
                      data-overflow-child-openable={childCanOpen ? "true" : "false"}
                      onClick={() => {
                        if (childCanOpen) onOpenOverflowChild?.(child);
                      }}
                    >
                      <span className={`subagent-pattern-graph-overflow-child-status tone-${child.tone}`}>{child.statusLabel}</span>
                      <span className="subagent-pattern-graph-overflow-child-label">{child.label}</span>
                      <small>{child.childThreadId}</small>
                      {child.blockingParent && <span className="subagent-pattern-graph-overflow-child-chip">Blocks</span>}
                      {child.approvalLabel && <span className="subagent-pattern-graph-overflow-child-chip">{child.approvalLabel}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="subagent-pattern-graph-legend">
        {graph.nodes
          .filter((node) => node.blockingParent || node.approvalLabel || node.overflowLabel)
          .slice(0, 4)
          .map((node) => (
            <span key={`${graph.id}:${node.id}`} className={`tone-${node.tone}`}>
              {node.label}:{" "}
              {[node.blockingParent ? "blocks parent" : undefined, node.approvalLabel, node.overflowLabel].filter(Boolean).join(" / ")}
            </span>
          ))}
      </div>
    </section>
  );
}

function shortBadgeLabel(label: string): string {
  if (label === "Approval needed") return "Approval";
  if (label === "Approval granted") return "Approved";
  if (label === "Approval denied") return "Denied";
  if (label === "Blocking") return "Blocks";
  return label;
}

function patternGraphDomId(value: string): string {
  return value.replaceAll(/[^a-zA-Z0-9_-]+/g, "-");
}

function patternGraphOverflowPanelId(graphDomId: string, nodeId: string): string {
  return `subagent-pattern-graph-overflow-${graphDomId}-${patternGraphDomId(nodeId)}`;
}

function SubagentParentClusterChildActions({
  child,
  onOpenThread,
  onCancelChild,
  onCloseChild,
  cancelChildBusyId,
  closeChildBusyId,
}: {
  child: SubagentParentClusterChildModel;
  onOpenThread: (child: SubagentParentClusterChildModel) => void;
  onCancelChild: (child: SubagentParentClusterChildModel) => void;
  onCloseChild: (child: SubagentParentClusterChildModel) => void;
  cancelChildBusyId?: string;
  closeChildBusyId?: string;
}) {
  const actionBusy = cancelChildBusyId === child.runId || closeChildBusyId === child.runId;
  return (
    <span className="subagent-parent-cluster-child-actions">
      {child.canOpenThread && (
        <button
          type="button"
          className="subagent-parent-cluster-child-action is-open"
          title={child.openThreadTitle}
          aria-label={`Open child thread ${child.title}`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onOpenThread(child);
          }}
        >
          <ExternalLink size={12} aria-hidden="true" />
        </button>
      )}
      {child.canCancel && (
        <button
          type="button"
          className="subagent-parent-cluster-child-action"
          disabled={actionBusy}
          title={cancelChildBusyId === child.runId ? "Canceling sub-agent" : child.cancelTitle}
          aria-label={`Cancel sub-agent ${child.title}`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onCancelChild(child);
          }}
        >
          <X size={12} aria-hidden="true" />
        </button>
      )}
      {child.canClose && (
        <button
          type="button"
          className="subagent-parent-cluster-child-action is-close"
          disabled={actionBusy}
          title={closeChildBusyId === child.runId ? "Closing sub-agent" : child.closeTitle}
          aria-label={`Close sub-agent ${child.title}`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onCloseChild(child);
          }}
        >
          <Archive size={12} aria-hidden="true" />
        </button>
      )}
    </span>
  );
}

function SubagentParentClusterChildContent({ child }: { child: SubagentParentClusterChildModel }) {
  return (
    <>
      <span className="subagent-parent-cluster-child-main">
        <strong title={child.title}>{child.title}</strong>
        <span title={child.preview}>{child.preview}</span>
      </span>
      <span className="subagent-parent-cluster-child-meta">
        <span>{child.dependencyLabel}</span>
        <span>{child.runtimeLabel}</span>
        {child.parentBlocker && (
          <span
            className="subagent-parent-cluster-child-blocker-context"
            title={[child.parentBlocker.detail, ...child.parentBlocker.metaLabels].filter(Boolean).join(" / ")}
          >
            <span className={`subagent-parent-cluster-child-blocker tone-${child.parentBlocker.statusTone}`}>
              {child.parentBlocker.label}
            </span>
            <span className="subagent-parent-cluster-child-blocker-meta">{child.parentBlocker.metaLabels.join(" · ")}</span>
          </span>
        )}
        {child.closedLabel && <span>{child.closedLabel}</span>}
        {child.retentionLabel && <span title={child.retentionTitle}>{child.retentionLabel}</span>}
        <span className={`subagent-parent-cluster-child-status tone-${child.statusTone}`}>{child.status}</span>
      </span>
    </>
  );
}

function svgLabel(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, Math.max(1, max - 1))}...` : value;
}
