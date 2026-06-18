import { Background, BaseEdge, Controls, EdgeLabelRenderer, getBezierPath, Handle, Position, ReactFlow, ReactFlowProvider, useReactFlow, type EdgeProps } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { WorkflowAgentThreadSummary, WorkflowArtifactSummary, WorkflowRecoveryAction, WorkflowRunDetail, WorkflowRunEvent } from "../../shared/workflowTypes";
import { formatTaskState } from "./RightPanel";
import {
  workflowDiagramInitialViewportNodeIds,
  workflowGraphDraftOverlayModel,
  workflowGraphEventCards,
  workflowLatestDiscoveryGraphChange,
  workflowLatestRuntimeGraphNodeId,
  workflowGraphToReactFlow,
  workflowGraphWithRunEvents,
  type WorkflowAgentDiagramEdge,
  type WorkflowAgentDiagramNode,
  type WorkflowGraphChangeFocus,
  type WorkflowGraphDraftOverlay,
  type WorkflowGraphEventCard,
} from "./workflowAgentGraphUiModel";
import { workflowGraphNodeReviewModel, type WorkflowGraphNodeReviewAction } from "./workflowGraphNodeReviewUiModel";
import { workflowDiagramFollowToggle, workflowDiagramShouldAutoFit, workflowDiagramShouldFollowActiveNode } from "./workflowDiagramViewportUiModel";
import {
  workflowDecisionRecoveryAction,
  workflowGraphRecoveryDecisionCard,
  type WorkflowRuntimeDecisionAction,
} from "./workflowRuntimeDecisionUiModel";

export const workflowAgentNodeTypes = {
  workflowAgent: WorkflowAgentNode,
};


export const workflowAgentEdgeTypes = {
  workflowAgent: WorkflowAgentEdge,
};

const EMPTY_WORKFLOW_RUN_EVENTS: WorkflowRunEvent[] = [];


export function WorkflowAgentNode({ data }: { data: WorkflowAgentDiagramNode["data"] }) {
  if (data.isSectionLabel) {
    return (
      <div className={`workflow-agent-section-label ${data.section ?? "discovery"}`}>
        <strong title={data.label}>{data.label}</strong>
        {data.description && <span title={data.description}>{data.description}</span>}
      </div>
    );
  }
  const nodeTitle = [data.label, data.description].filter(Boolean).join("\n");
  const draftClass = data.draftState ? ` ${data.draftState}` : "";
  const pulseClass = data.pulse ? " pulse" : "";
  return (
    <div className={`workflow-agent-node ${data.nodeType} ${data.runState ?? "pending"}${draftClass}${pulseClass}`} title={nodeTitle}>
      <Handle type="target" position={Position.Left} />
      <strong title={data.label}>{data.label}</strong>
      {data.description && <span title={data.description}>{data.description}</span>}
      {data.draftLabel && <small className="workflow-agent-node-draft-label">{data.draftLabel}</small>}
      <small title={formatTaskState(data.nodeType)}>{formatTaskState(data.nodeType)}</small>
      {data.sourceRangeCount ? <small>{data.sourceRangeCount} program map{data.sourceRangeCount === 1 ? "" : "s"}</small> : null}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}


export function WorkflowAgentEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  data,
}: EdgeProps) {
  const edgeData = data as WorkflowAgentDiagramEdge["data"] | undefined;
  const [edgePath, edgeLabelX, edgeLabelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const placement = edgeData?.labelPlacement;
  const label = edgeData?.label;
  const labelX = placement?.x ?? edgeLabelX;
  const labelY = placement?.y ?? edgeLabelY;
  const needsLeader = Boolean(placement && Math.abs(labelY - edgeLabelY) > 12);
  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      {needsLeader && (
        <path
          className="workflow-agent-edge-label-leader"
          d={`M ${edgeLabelX} ${edgeLabelY} L ${labelX} ${labelY}`}
          aria-hidden="true"
        />
      )}
      {label && (
        <EdgeLabelRenderer>
          <div
            className={`workflow-agent-edge-label ${placement?.callout ? "callout" : ""}`}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              maxWidth: placement?.maxWidth,
            }}
            title={label}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}


export function WorkflowAgentDiagramPane({
  thread,
  artifact,
  events = EMPTY_WORKFLOW_RUN_EVENTS,
  detail,
  selectedNodeId,
  activeNodeIdOverride,
  debugRewriteBusyEventId,
  recoveryBusyKey,
  onSelectNode,
  onNodeReviewAction,
  onRecover,
  onDebugRewrite,
}: {
  thread?: WorkflowAgentThreadSummary;
  artifact?: WorkflowArtifactSummary;
  events?: WorkflowRunEvent[];
  detail?: WorkflowRunDetail;
  selectedNodeId?: string;
  activeNodeIdOverride?: string;
  debugRewriteBusyEventId?: string;
  recoveryBusyKey?: string;
  onSelectNode?: (nodeId: string | undefined) => void;
  onNodeReviewAction?: (action: WorkflowGraphNodeReviewAction) => void;
  onRecover?: (card: WorkflowGraphEventCard, action: WorkflowRecoveryAction) => void;
  onDebugRewrite?: (card: WorkflowGraphEventCard) => void;
}) {
  const baseSnapshot = useMemo(
    () => (thread?.graph ? workflowGraphWithRunEvents(thread.graph, events) : undefined),
    [thread?.graph, events],
  );
  const activeNodeId = useMemo(
    () => activeNodeIdOverride ?? workflowLatestRuntimeGraphNodeId(events, baseSnapshot),
    [activeNodeIdOverride, events, baseSnapshot],
  );
  const snapshot = useMemo(
    () => (baseSnapshot && activeNodeIdOverride ? workflowGraphSnapshotWithActiveNode(baseSnapshot, activeNodeIdOverride) : baseSnapshot),
    [baseSnapshot, activeNodeIdOverride],
  );
  const unansweredQuestionCount = thread?.discoveryQuestions.filter((question) => !question.answer).length ?? 0;
  const pendingAccessRequestCount =
    thread?.discoveryQuestions.reduce(
      (count, question) => count + (question.accessRequests?.filter((request) => request.status === "pending").length ?? 0),
      0,
    ) ?? 0;
  const artifactStatus = detail?.artifact.status ?? artifact?.status;
  const draftOverlay = useMemo(
    () =>
      workflowGraphDraftOverlayModel({
        snapshot,
        unansweredQuestionCount,
        pendingAccessRequestCount,
        artifactStatus,
      }),
    [snapshot, unansweredQuestionCount, pendingAccessRequestCount, artifactStatus],
  );
  const changeFocus = useMemo(
    () => (thread ? workflowLatestDiscoveryGraphChange(thread.discoveryQuestions) : undefined),
    [thread?.discoveryQuestions],
  );
  const eventCards = useMemo(
    () => workflowGraphEventCards(events, snapshot, { modelCalls: detail?.modelCalls, checkpoints: detail?.checkpoints }),
    [events, snapshot, detail?.modelCalls, detail?.checkpoints],
  );
  const selectedNode = useMemo(() => snapshot?.nodes.find((node) => node.id === selectedNodeId), [snapshot?.nodes, selectedNodeId]);
  if (!thread) return null;
  const selectedNodeReview = selectedNode
    ? workflowGraphNodeReviewModel({
        node: selectedNode,
        manifest: detail?.artifact.manifest,
        traceMode: thread.traceMode,
        events,
        modelCalls: detail?.modelCalls,
        checkpoints: detail?.checkpoints,
      })
    : undefined;
  return (
    <section className="workflow-agent-diagram-pane">
      <div className="workflow-agent-diagram-header">
        <div>
          <strong>Workflow Diagram</strong>
          <span id="diagram-subtitle" title={snapshot?.summary || thread.preview}>{snapshot?.summary || thread.preview}</span>
        </div>
        <span id="diagram-chip" title={thread.traceMode === "debug" ? "Debug traces" : "Production traces"}>
          {thread.traceMode === "debug" ? "Debug traces" : "Production traces"}
        </span>
      </div>
      {draftOverlay && (
        <div className="workflow-agent-diagram-draft-overlay" aria-live="polite">
          <div>
            <strong>{draftOverlay.title}</strong>
            <span>{draftOverlay.detail}</span>
          </div>
          <div className="plugin-badges">
            {draftOverlay.badges.map((badge) => (
              <span key={badge}>{badge}</span>
            ))}
          </div>
        </div>
      )}
      {snapshot ? (
        <ReactFlowProvider>
          <WorkflowAgentDiagramCanvas
            snapshot={snapshot}
            selectedNodeId={selectedNodeId}
            activeNodeId={activeNodeId}
            draftOverlay={draftOverlay}
            changeFocus={changeFocus}
            onSelectNode={onSelectNode}
          />
        </ReactFlowProvider>
      ) : (
        <div className="workflow-agent-diagram-empty">
          <strong>Discovery graph pending</strong>
          <span>{thread.initialRequest || "Start discovery to build the first workflow graph."}</span>
        </div>
      )}
      {selectedNodeReview && (
        <div className="workflow-agent-selected-node" aria-label="Selected workflow diagram item">
          <div>
            <strong title={selectedNodeReview.title}>Selected: {selectedNodeReview.title}</strong>
            <span>{selectedNodeReview.typeLabel}</span>
          </div>
          {selectedNodeReview.description && <p title={selectedNodeReview.description}>{selectedNodeReview.description}</p>}
          <div className="plugin-badges workflow-agent-node-review-badges">
            {selectedNodeReview.badges.map((badge) => (
              <span key={badge}>{badge}</span>
            ))}
          </div>
          <div className="workflow-agent-node-review-grid">
            {selectedNodeReview.facts.map((fact) => (
              <div className={`workflow-agent-node-review-fact ${fact.tone}`} key={fact.label}>
                <small>{fact.label}</small>
                <strong>{fact.value}</strong>
                <span>{fact.detail}</span>
              </div>
            ))}
          </div>
          {selectedNodeReview.sourceMappings.length > 0 && (
            <details className="workflow-agent-node-source-maps">
              <summary>Program mappings</summary>
              <div>
                {selectedNodeReview.sourceMappings.map((mapping) => (
                  <article key={`${mapping.label}:${mapping.snippet}`}>
                    <strong>{mapping.label}</strong>
                    <span>{mapping.detail}</span>
                    <code>{mapping.snippet}</code>
                  </article>
                ))}
              </div>
            </details>
          )}
          {selectedNodeReview.actions.length > 0 && (
            <div className="workflow-agent-node-review-actions">
              {selectedNodeReview.actions.map((action) => (
                <button
                  type="button"
                  className={`panel-button mini ${action.tone === "blocked" ? "danger" : ""}`}
                  key={action.id}
                  title={action.detail}
                  disabled={!onNodeReviewAction}
                  onClick={() => onNodeReviewAction?.(action)}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {eventCards.length > 0 && (
        <div className="workflow-agent-data-cards">
          {eventCards.map((card) => {
            const recoveryDecision = workflowGraphRecoveryDecisionCard(card);
            return (
              <div className={`workflow-agent-data-card ${card.state}`} key={card.id}>
                <div className="workflow-agent-data-card-header">
                  <strong>{formatTaskState(card.label)}</strong>
                  <div className="workflow-agent-data-card-badges">
                    {card.nodeLabel && <small>{card.nodeLabel}</small>}
                    {!card.nodeLabel && <small>Unmapped</small>}
                    {card.itemLabel && <small>{card.itemLabel}</small>}
                    {card.timingLabel && <small>{card.timingLabel}</small>}
                  </div>
                </div>
                <span className="workflow-agent-data-card-detail" title={card.detail}>{card.detail}</span>
                {card.summaries.length > 0 && (
                  <div className="workflow-agent-trace-summaries">
                    {card.summaries.map((summary, index) => (
                      <div className={`workflow-agent-trace-summary ${summary.tone ?? "neutral"}`} key={`${summary.label}:${index}`}>
                        <small>{summary.label}</small>
                        <span>{summary.value}</span>
                      </div>
                    ))}
                  </div>
                )}
                {recoveryDecision && (
                  <div className={`workflow-runtime-decision-card compact ${recoveryDecision.tone}`}>
                    <div className="workflow-runtime-decision-header">
                      <div>
                        <strong>{recoveryDecision.title}</strong>
                        {recoveryDecision.description && <span>{recoveryDecision.description}</span>}
                      </div>
                      <span className="workflow-runtime-decision-status">{recoveryDecision.statusLabel}</span>
                    </div>
                    {recoveryDecision.badges.length > 0 && (
                      <div className="plugin-badges">
                        {recoveryDecision.badges.map((badge) => (
                          <span key={`${recoveryDecision.id}:${badge}`}>{badge}</span>
                        ))}
                      </div>
                    )}
                    {recoveryDecision.actions.length > 0 ? (
                      <div className="workflow-runtime-decision-actions">
                        {recoveryDecision.actions.map((action) => {
                          const recoveryAction = workflowDecisionRecoveryAction(action.id);
                          const busyKey = recoveryAction ? `${recoveryAction}:${card.id}` : `debug-rewrite:${card.id}`;
                          const isBusy = recoveryAction ? recoveryBusyKey === busyKey : debugRewriteBusyEventId === card.id;
                          const disabled = Boolean(isBusy) || (recoveryAction ? !onRecover : !onDebugRewrite);
                          return (
                            <button
                              type="button"
                              className={`workflow-runtime-decision-action ${action.tone}`}
                              title={action.description}
                              disabled={disabled}
                              key={action.id}
                              onClick={() => {
                                if (recoveryAction) onRecover?.(card, recoveryAction);
                                else if (action.id === "debug_rewrite") onDebugRewrite?.(card);
                              }}
                            >
                              <span>
                                <strong>{isBusy ? workflowRecoveryBusyLabel(action) : action.label}</strong>
                                {action.description && <small>{action.description}</small>}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : recoveryDecision.emptyState ? (
                      <p className="panel-note">{recoveryDecision.emptyState}</p>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}


export function workflowRecoveryBusyLabel(action: WorkflowRuntimeDecisionAction): string {
  if (action.id === "resume_checkpoint") return "Resuming";
  if (action.id === "skip_item") return "Skipping";
  if (action.id === "debug_rewrite") return "Debugging";
  return "Recovering";
}


export function workflowGraphSnapshotWithActiveNode(
  snapshot: NonNullable<WorkflowAgentThreadSummary["graph"]>,
  activeNodeId: string,
): NonNullable<WorkflowAgentThreadSummary["graph"]> {
  return {
    ...snapshot,
    nodes: snapshot.nodes.map((node) => (node.id === activeNodeId ? { ...node, runState: "active" } : node)),
  };
}


export function WorkflowAgentDiagramCanvas({
  snapshot,
  selectedNodeId,
  activeNodeId,
  draftOverlay,
  changeFocus,
  onSelectNode,
}: {
  snapshot: NonNullable<WorkflowAgentThreadSummary["graph"]>;
  selectedNodeId?: string;
  activeNodeId?: string;
  draftOverlay?: WorkflowGraphDraftOverlay;
  changeFocus?: WorkflowGraphChangeFocus;
  onSelectNode?: (nodeId: string | undefined) => void;
}) {
  const { nodes, edges } = useMemo(
    () => workflowGraphToReactFlow(snapshot, { selectedNodeId, draftOverlay, changeFocus }),
    [snapshot, selectedNodeId, draftOverlay, changeFocus],
  );
  const initialViewportNodeIds = useMemo(() => workflowDiagramInitialViewportNodeIds(nodes), [nodes]);
  const flow = useReactFlow();
  const [zoomPercent, setZoomPercentState] = useState("100");
  const zoomPercentRef = useRef("100");
  const [followExecution, setFollowExecution] = useState(false);
  const changeFocusKey = `${changeFocus?.questionId ?? "none"}:${changeFocus?.nodeIds.join(",") ?? ""}`;
  const lastAutoFitSnapshotIdRef = useRef<string | undefined>(undefined);
  const lastChangeFocusKeyRef = useRef<string | undefined>(undefined);
  const userAdjustedViewportRef = useRef(false);
  const programmaticViewportChangeRef = useRef(false);

  const setZoomPercent = useCallback((nextZoomPercent: string) => {
    if (zoomPercentRef.current === nextZoomPercent) return;
    zoomPercentRef.current = nextZoomPercent;
    setZoomPercentState(nextZoomPercent);
  }, []);

  function runViewportCommand(command: () => void) {
    programmaticViewportChangeRef.current = true;
    command();
    window.setTimeout(() => {
      programmaticViewportChangeRef.current = false;
    }, 220);
  }

  useEffect(() => {
    const shouldAutoFit = workflowDiagramShouldAutoFit({
      snapshotId: snapshot.id,
      lastAutoFitSnapshotId: lastAutoFitSnapshotIdRef.current,
      userAdjustedViewport: userAdjustedViewportRef.current,
    });
    lastAutoFitSnapshotIdRef.current = snapshot.id;
    if (!shouldAutoFit) return;
    window.setTimeout(() => {
      runViewportCommand(() => {
        fitInitialViewport(180);
      });
    }, 0);
  }, [flow, initialViewportNodeIds, nodes, snapshot.id]);

  function fitInitialViewport(duration = 180) {
    const targetNodes = nodes.filter((node) => initialViewportNodeIds.includes(node.id));
    const graphNodes = nodes.filter((node) => !node.data.isSectionLabel);
    if (targetNodes.length === 0 || targetNodes.length === graphNodes.length) {
      void flow.fitView({ padding: 0.2, duration });
      return;
    }
    const bounds = workflowDiagramNodeBounds(targetNodes);
    if (!bounds) {
      void flow.fitView({ padding: 0.2, duration });
      return;
    }
    void flow.fitBounds(bounds, { padding: 0.28, duration });
  }

  function centerNode(nodeId: string | undefined, duration = 180) {
    if (!nodeId) return;
    const node = nodes.find((candidate) => candidate.id === nodeId);
    if (!node) return;
    const width = typeof node.width === "number" ? node.width : 190;
    const height = typeof node.height === "number" ? node.height : 74;
    const currentZoom = flow.getZoom();
    const targetZoom = Math.max(0.8, Math.min(1.35, currentZoom < 0.75 ? 1 : currentZoom));
    setZoomPercent(String(Math.round(targetZoom * 100)));
    runViewportCommand(() => {
      void flow.setCenter(node.position.x + width / 2, node.position.y + height / 2, {
        zoom: targetZoom,
        duration,
      });
    });
  }

  useEffect(() => {
    if (!selectedNodeId) return;
    window.setTimeout(() => centerNode(selectedNodeId), 0);
  }, [selectedNodeId]);

  useEffect(() => {
    if (!workflowDiagramShouldFollowActiveNode({ followExecution, activeNodeId })) return;
    window.setTimeout(() => centerNode(activeNodeId, 140), 0);
  }, [activeNodeId, followExecution]);

  useEffect(() => {
    if (!changeFocus?.nodeIds.length || lastChangeFocusKeyRef.current === changeFocusKey) return;
    const targetNodes = nodes.filter((node) => !node.data.isSectionLabel && changeFocus.nodeIds.includes(node.id));
    if (!targetNodes.length) return;
    lastChangeFocusKeyRef.current = changeFocusKey;
    window.setTimeout(() => {
      if (targetNodes.length === 1) {
        centerNode(targetNodes[0].id, 220);
        return;
      }
      const bounds = workflowDiagramNodeBounds(targetNodes);
      if (!bounds) return;
      runViewportCommand(() => {
        void flow.fitBounds(bounds, { padding: 0.34, duration: 220 });
      });
    }, 40);
  }, [changeFocus?.nodeIds, changeFocusKey, flow, nodes]);

  function applyZoom(value: string) {
    const parsed = Number(value.replace(/%/g, ""));
    if (!Number.isFinite(parsed)) return;
    const bounded = Math.max(10, Math.min(400, Math.round(parsed)));
    setZoomPercent(String(bounded));
    userAdjustedViewportRef.current = true;
    runViewportCommand(() => {
      void flow.zoomTo(bounded / 100, { duration: 120 });
    });
  }

  return (
    <>
      <div className="workflow-agent-diagram-toolbar">
        <button type="button" className="panel-button mini" title="Zoom out" aria-label="Zoom out workflow diagram" onClick={() => applyZoom(String(Number(zoomPercent) - 10))}>
          -
        </button>
        <input
          aria-label="Workflow diagram zoom"
          value={zoomPercent}
          onChange={(event) => setZoomPercent(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") applyZoom(zoomPercent);
          }}
        />
        <span>%</span>
        <button type="button" className="panel-button mini" title="Zoom in" aria-label="Zoom in workflow diagram" onClick={() => applyZoom(String(Number(zoomPercent) + 10))}>
          +
        </button>
        <button
          type="button"
          className="panel-button mini"
          disabled={!activeNodeId}
          onClick={() => {
            userAdjustedViewportRef.current = true;
            centerNode(activeNodeId);
          }}
        >
          Active
        </button>
        <button
          type="button"
          className={`panel-button mini ${followExecution ? "active" : ""}`}
          disabled={!activeNodeId}
          onClick={() => {
            const next = workflowDiagramFollowToggle({ followExecution, activeNodeId });
            setFollowExecution(next.nextFollowExecution);
            if (next.shouldCenterActiveNode) centerNode(activeNodeId, 120);
          }}
        >
          Follow
        </button>
        <button
          type="button"
          className="panel-button mini"
          onClick={() => {
            userAdjustedViewportRef.current = true;
            setZoomPercent("100");
            runViewportCommand(() => {
              void flow.fitView({ padding: 0.2, duration: 160 });
            });
          }}
        >
          Fit
        </button>
      </div>
      <div className="workflow-agent-diagram-canvas">
        <ReactFlow
          className="workflow-agent-react-flow"
          nodes={nodes}
          edges={edges}
          nodeTypes={workflowAgentNodeTypes}
          edgeTypes={workflowAgentEdgeTypes}
          onNodeClick={(_, node) => {
            if (node.data.isSectionLabel) return;
            onSelectNode?.(node.id);
          }}
          onPaneClick={() => onSelectNode?.(undefined)}
          onMoveStart={() => {
            if (programmaticViewportChangeRef.current) return;
            userAdjustedViewportRef.current = true;
            setFollowExecution(false);
          }}
          onMoveEnd={() => setZoomPercent(String(Math.round(flow.getZoom() * 100)))}
          minZoom={0.1}
          maxZoom={4}
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </>
  );
}


export function workflowDiagramNodeBounds(nodes: WorkflowAgentDiagramNode[]): { x: number; y: number; width: number; height: number } | undefined {
  if (nodes.length === 0) return undefined;
  const minX = Math.min(...nodes.map((node) => node.position.x));
  const minY = Math.min(...nodes.map((node) => node.position.y));
  const maxX = Math.max(...nodes.map((node) => node.position.x + (typeof node.width === "number" ? node.width : 190)));
  const maxY = Math.max(...nodes.map((node) => node.position.y + (typeof node.height === "number" ? node.height : 74)));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
