import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join, relative, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import JSZip from "jszip";

import { AMBIENT_SUBAGENTS_FEATURE_FLAG } from "../../shared/featureFlags";
import type { SubagentDesktopDogfoodSeedResult } from "./subagentDesktopDogfoodScenario";
import type {
  DesktopMaturityAssertionEvidence,
  DesktopMaturityAssertionId,
  DesktopVisualAssertionEvidence,
  DesktopVisualAssertionId,
} from "./subagentDesktopDogfoodAssertions";

export const DOGFOOD_ENABLED = process.env.AMBIENT_SUBAGENT_DESKTOP_DOGFOOD === "1";
export const REPO_ROOT = resolve(__dirname, "../../..");
export const RESULTS_DIR = resolve(
  REPO_ROOT,
  process.env.AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_RESULTS_DIR ?? "test-results/subagent-desktop-dogfood",
);
const CDP_COMMAND_TIMEOUT_MS = positiveIntegerEnv("AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_CDP_COMMAND_TIMEOUT_MS", 5_000);
const CDP_ARTIFACT_COMMAND_TIMEOUT_MS = positiveIntegerEnv("AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_CDP_ARTIFACT_COMMAND_TIMEOUT_MS", 15_000);

interface CdpMessage {
  id?: number;
  result?: unknown;
  error?: { message?: string };
}

export interface CdpClient {
  send<T = unknown>(method: string, params?: Record<string, unknown>, options?: { timeoutMs?: number }): Promise<T>;
  close(): void;
}

export interface DogfoodReport {
  schemaVersion: "ambient-subagent-desktop-dogfood-v1";
  status: "passed" | "failed";
  classification: "passed" | "failed" | "blocked" | "skipped";
  generatedAt: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  gitCommit: string;
  gitBranch: string;
  provider: string;
  model?: string;
  featureFlag: string;
  headful: boolean;
  cdpPort: number;
  scenarios?: string[];
  parentThreadId?: string;
  parentMessageId?: string;
  childRunIds?: string[];
  childThreadIds?: string[];
  approvalRequestParentMailboxEventId?: string;
  approvalWaitBarrierId?: string;
  approvalId?: string;
  completedChildRunId?: string;
  completedChildThreadId?: string;
  cancelControlChildRunId?: string;
  closeControlChildRunIds?: string[];
  localRuntimeLeaseId?: string;
  localRuntimeId?: string;
  localRuntimePid?: number;
  untrackedRuntimeId?: string;
  untrackedRuntimePid?: number;
  untrackedRuntimeEndpoint?: string;
  untrackedRuntimeModel?: string;
  workflowTaskId?: string;
  workflowArtifactId?: string;
  workflowArtifactSourceRelativePath?: string;
  workflowArtifactStateRelativePath?: string;
  workflowArtifactSourceContent?: string;
  workflowRunId?: string;
  workflowThreadId?: string;
  workflowParentMailboxEventId?: string;
  mutatingWorkflowTaskId?: string;
  mutatingWorkflowArtifactId?: string;
  mutatingWorkflowRunId?: string;
  mutatingWorkflowThreadId?: string;
  mutatingWorkflowChildRunId?: string;
  mutatingWorkflowChildThreadId?: string;
  mutatingWorkflowStagedRelativePath?: string;
  mutatingWorkflowReportRelativePath?: string;
  mutatingWorkflowProgressMessage?: string;
  mutatingWorkflowParentWorkspaceUnchanged?: boolean;
  workflowHighLoadTaskIds?: string[];
  workflowHighLoadArtifactIds?: string[];
  workflowHighLoadRunIds?: string[];
  workflowHighLoadThreadIds?: string[];
  workflowHighLoadPatternLabels?: string[];
  deniedScopeParentMailboxEventId?: string;
  deniedScopeChildRunId?: string;
  deniedScopeChildThreadId?: string;
  lifecycleEdgeParentMessageId?: string;
  lifecycleEdgeChildRunIds?: string[];
  lifecycleEdgeChildThreadIds?: string[];
  lifecycleEdgeWaitBarrierIds?: string[];
  parentStopCascadeParentMessageId?: string;
  parentStopCascadeParentMailboxEventId?: string;
  parentStopCascadeChildRunIds?: string[];
  parentStopCascadeChildThreadIds?: string[];
  parentStopCascadeWaitBarrierIds?: string[];
  parentStopCascadeCancelledRunIds?: string[];
  parentStopCascadeDetachedRunIds?: string[];
  parentStopCascadeUnchangedRunIds?: string[];
  parentStopCascadeCancelledWaitBarrierIds?: string[];
  parentStopCascadeCancelledMailboxEventIds?: string[];
  stressParentMessageIds?: string[];
  stressChildRunIds?: string[];
  stressChildThreadIds?: string[];
  chatExportPath?: string;
  chatExportBytes?: number;
  artifacts: Record<string, string>;
  checks: Record<string, unknown>;
  visualAssertions: Record<DesktopVisualAssertionId, DesktopVisualAssertionEvidence>;
  maturityAssertions: Record<DesktopMaturityAssertionId, DesktopMaturityAssertionEvidence>;
  error?: string;
}

export function launchDesktop(input: { port: number; workspacePath: string; userDataPath: string; chatExportPath: string }): ChildProcess {
  return spawn(
    "pnpm",
    ["exec", "electron-vite", "dev", "--", `--remote-debugging-port=${input.port}`, `--enable-feature=${AMBIENT_SUBAGENTS_FEATURE_FLAG}`],
    {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
      env: {
        ...process.env,
        AMBIENT_PROVIDER: process.env.AMBIENT_PROVIDER || "ambient",
        AMBIENT_E2E: "1",
        AMBIENT_E2E_CHAT_EXPORT_PATH: input.chatExportPath,
        AMBIENT_DESKTOP_WORKSPACE: input.workspacePath,
        AMBIENT_E2E_USER_DATA: input.userDataPath,
      },
    },
  );
}

export async function connectToElectron(port: number, app: ChildProcess): Promise<CdpClient> {
  const started = Date.now();
  let lastOutput = "";
  app.stdout?.on("data", (chunk) => {
    lastOutput = `${lastOutput}${chunk.toString()}`.slice(-4000);
  });
  app.stderr?.on("data", (chunk) => {
    lastOutput = `${lastOutput}${chunk.toString()}`.slice(-4000);
  });

  while (Date.now() - started < 45_000) {
    if (app.exitCode !== null) {
      throw new Error(`Electron exited before CDP was available.\n${lastOutput}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) {
        const targets = (await response.json()) as Array<{ type?: string; webSocketDebuggerUrl?: string; url?: string }>;
        const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
        if (page?.webSocketDebuggerUrl) return createCdpClient(page.webSocketDebuggerUrl);
      }
    } catch {
      // Keep polling until Electron exposes the debugger endpoint.
    }
    await delay(250);
  }

  throw new Error(`Timed out waiting for Electron CDP on port ${port}.\n${lastOutput}`);
}

function createCdpClient(url: string): CdpClient {
  const WebSocketCtor = globalThis.WebSocket as unknown as {
    new (url: string): WebSocket;
  };
  const socket = new WebSocketCtor(url);
  let nextId = 1;
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data)) as CdpMessage;
    if (typeof message.id !== "number") return;
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message || "CDP command failed"));
    else waiter.resolve(message.result);
  });
  socket.addEventListener("close", () => {
    for (const waiter of pending.values()) waiter.reject(new Error("CDP socket closed"));
    pending.clear();
  });

  return {
    send<T = unknown>(method: string, params: Record<string, unknown> = {}, options: { timeoutMs?: number } = {}) {
      const id = nextId++;
      const timeoutMs = options.timeoutMs ?? CDP_COMMAND_TIMEOUT_MS;
      const ready =
        socket.readyState === WebSocket.OPEN
          ? Promise.resolve()
          : new Promise<void>((resolveReady, rejectReady) => {
              const timeout = setTimeout(() => {
                rejectReady(new Error(`Timed out waiting for CDP socket open after ${timeoutMs}ms.`));
              }, timeoutMs);
              socket.addEventListener(
                "open",
                () => {
                  clearTimeout(timeout);
                  resolveReady();
                },
                { once: true },
              );
              socket.addEventListener(
                "error",
                () => {
                  clearTimeout(timeout);
                  rejectReady(new Error("CDP socket failed to open"));
                },
                { once: true },
              );
            });
      return ready.then(
        () =>
          new Promise<T>((resolveCommand, rejectCommand) => {
            const timeout = setTimeout(() => {
              pending.delete(id);
              rejectCommand(new Error(cdpCommandTimeoutMessage(method, timeoutMs)));
            }, timeoutMs);
            pending.set(id, {
              resolve: (value) => {
                clearTimeout(timeout);
                resolveCommand(value as T);
              },
              reject: (error) => {
                clearTimeout(timeout);
                rejectCommand(error);
              },
            });
            socket.send(JSON.stringify({ id, method, params }));
          }),
      );
    },
    close() {
      socket.close();
    },
  };
}

export async function waitForText(cdp: CdpClient, text: string) {
  await waitFor(cdp, (expected) => document.body.innerText.includes(expected), text);
}

export async function waitFor<T extends unknown[]>(cdp: CdpClient, predicate: (...args: T) => boolean, ...args: T) {
  const started = Date.now();
  let lastCdpTimeout: Error | undefined;
  while (Date.now() - started < 20_000) {
    try {
      const matched = await evaluate<boolean, T>(cdp, predicate, ...args);
      if (matched) return;
    } catch (error) {
      if (!isCdpCommandTimeout(error)) throw error;
      lastCdpTimeout = error;
    }
    await delay(100);
    if (lastCdpTimeout && Date.now() - started >= 20_000) {
      throw new Error(`Timed out waiting for Electron UI condition. Last CDP timeout: ${lastCdpTimeout.message}`);
    }
  }
  if (lastCdpTimeout) {
    throw new Error(`Timed out waiting for Electron UI condition. Last CDP timeout: ${lastCdpTimeout.message}`);
  }
  throw new Error("Timed out waiting for Electron UI condition.");
}

export async function evaluate<T, TArgs extends unknown[]>(
  cdp: CdpClient,
  fn: (...args: TArgs) => T | Promise<T>,
  ...args: TArgs
): Promise<T> {
  const expression = `(${fn.toString()})(...${JSON.stringify(args)})`;
  const result = await cdp.send<{ result?: { value?: T }; exceptionDetails?: unknown }>("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) throw new Error(`Runtime.evaluate failed: ${JSON.stringify(result.exceptionDetails)}`);
  return result.result?.value as T;
}

function cdpCommandTimeoutMessage(method: string, timeoutMs: number): string {
  return `Timed out waiting for CDP ${method} after ${timeoutMs}ms.`;
}

function isCdpCommandTimeout(error: unknown): error is Error {
  return error instanceof Error && error.message.startsWith("Timed out waiting for CDP ");
}

export async function setViewport(cdp: CdpClient, width: number, height: number) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 700,
  });
}

export async function clickClusterSummary(cdp: CdpClient) {
  await evaluate(cdp, () => {
    const summary = document.querySelector(".subagent-parent-cluster summary") as HTMLElement | null;
    summary?.click();
  });
}

export async function openPrimaryClusterIfClosed(cdp: CdpClient) {
  await evaluate(cdp, () => {
    const details = document.querySelector<HTMLDetailsElement>(".subagent-parent-cluster");
    if (!details) throw new Error("Missing sub-agent parent cluster.");
    if (!details.open) details.querySelector<HTMLElement>("summary")?.click();
  });
}

export async function scrollOperatorBarrierConsequenceIntoView(cdp: CdpClient) {
  await evaluate(cdp, () => {
    const consequenceRow = [...document.querySelectorAll<HTMLElement>(".subagent-parent-cluster-mailbox > div")].find((row) =>
      row.innerText.includes("1 wait barrier cancelled"),
    );
    if (consequenceRow) {
      consequenceRow.scrollIntoView({ block: "center", inline: "nearest" });
      return;
    }
    const cluster = document.querySelector<HTMLElement>(".subagent-parent-cluster");
    if (!cluster) throw new Error("Missing sub-agent parent cluster.");
    cluster.scrollIntoView({ block: "start", inline: "nearest" });
  });
  await delay(80);
}

export async function clickChildTranscriptSummary(cdp: CdpClient, childTitle: string) {
  await evaluate(
    cdp,
    (expectedChildTitle) => {
      const summary = [...document.querySelectorAll<HTMLElement>(".subagent-parent-cluster-child-thread > summary")].find((candidate) =>
        candidate.innerText.includes(expectedChildTitle),
      );
      if (!summary) throw new Error(`Missing child transcript summary for ${expectedChildTitle}`);
      summary.click();
    },
    childTitle,
  );
}

export async function ensureChildTranscriptOpen(cdp: CdpClient, input: { childRunId: string; childThreadId: string }) {
  await evaluate(
    cdp,
    (expected) => {
      const details = [...document.querySelectorAll<HTMLDetailsElement>(".subagent-parent-cluster-child-thread")].find(
        (candidate) => candidate.dataset.childRunId === expected.childRunId && candidate.dataset.childThreadId === expected.childThreadId,
      );
      if (!details) throw new Error(`Missing child transcript details for ${expected.childRunId}.`);
      if (details.open) return;
      const summary = details.querySelector<HTMLElement>("summary");
      if (!summary) throw new Error(`Missing child transcript summary for ${expected.childRunId}.`);
      summary.click();
    },
    input,
  );
  await waitFor(
    cdp,
    (expected) => {
      const details = [...document.querySelectorAll<HTMLDetailsElement>(".subagent-parent-cluster-child-thread")].find(
        (candidate) => candidate.dataset.childRunId === expected.childRunId && candidate.dataset.childThreadId === expected.childThreadId,
      );
      return Boolean(details?.open && details.querySelector(".subagent-parent-cluster-child-transcript"));
    },
    input,
  );
}

export async function collapseChildTranscriptIfOpen(cdp: CdpClient, input: { childRunId: string; childThreadId: string }) {
  await evaluate(
    cdp,
    (expected) => {
      const details = [...document.querySelectorAll<HTMLDetailsElement>(".subagent-parent-cluster-child-thread")].find(
        (candidate) => candidate.dataset.childRunId === expected.childRunId && candidate.dataset.childThreadId === expected.childThreadId,
      );
      if (!details) throw new Error(`Missing child transcript details for ${expected.childRunId}.`);
      if (!details.open) return;
      const summary = details.querySelector<HTMLElement>("summary");
      if (!summary) throw new Error(`Missing child transcript summary for ${expected.childRunId}.`);
      summary.click();
    },
    input,
  );
  await delay(80);
}

export async function scrollOpenChildTranscriptIntoView(cdp: CdpClient, input: { childRunId: string; childThreadId: string }) {
  await evaluate(
    cdp,
    (expected) => {
      const details = [...document.querySelectorAll<HTMLDetailsElement>(".subagent-parent-cluster-child-thread[open]")].find(
        (candidate) => candidate.dataset.childRunId === expected.childRunId && candidate.dataset.childThreadId === expected.childThreadId,
      );
      const transcript = details?.querySelector<HTMLElement>(".subagent-parent-cluster-child-transcript");
      if (!details || !transcript) throw new Error(`Missing open child transcript for ${expected.childRunId}.`);
      transcript.scrollIntoView({ block: "center", inline: "nearest" });
    },
    input,
  );
  await delay(80);
}

export async function emitChildLiveActivity(cdp: CdpClient, input: { childThreadId: string; workspacePath: string }) {
  await evaluate(
    cdp,
    async (eventInput) => {
      if (!window.ambientDesktop.emitE2eEvent) throw new Error("Missing E2E desktop event bridge.");
      await window.ambientDesktop.emitE2eEvent({
        type: "run-status",
        workspacePath: eventInput.workspacePath,
        threadId: eventInput.childThreadId,
        status: "tool",
      });
      await window.ambientDesktop.emitE2eEvent({
        type: "runtime-activity",
        workspacePath: eventInput.workspacePath,
        activity: {
          threadId: eventInput.childThreadId,
          kind: "tool",
          status: "running",
          toolName: "Workspace Read",
          message: "Running local tool Workspace Read for visible child transcript.",
          idleElapsedMs: 0,
          idleTimeoutMs: 30_000,
        },
      });
    },
    input,
  );
  await delay(80);
}

export async function clickPatternGraphChildNode(cdp: CdpClient, input: { childRunId: string; childThreadId: string }) {
  await evaluate(
    cdp,
    (expected) => {
      const node = [...document.querySelectorAll<SVGGElement>(".subagent-pattern-graph-node")].find(
        (candidate) =>
          candidate.dataset.childRunId === expected.childRunId &&
          candidate.dataset.childThreadId === expected.childThreadId &&
          (candidate.getAttribute("aria-label") ?? "").includes("from Map-Reduce"),
      );
      if (!node) throw new Error(`Missing Map-Reduce graph child node for ${expected.childRunId}.`);
      node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    },
    input,
  );
}

export async function keyboardActivatePatternGraphChildNode(
  cdp: CdpClient,
  input: { childRunId: string; childThreadId: string; key?: "Enter" | " " },
) {
  return evaluate(
    cdp,
    (expected) => {
      const node = [...document.querySelectorAll<SVGGElement>(".subagent-pattern-graph-node")].find(
        (candidate) =>
          candidate.dataset.childRunId === expected.childRunId &&
          candidate.dataset.childThreadId === expected.childThreadId &&
          (candidate.getAttribute("aria-label") ?? "").includes("from Map-Reduce"),
      );
      if (!node) throw new Error(`Missing Map-Reduce graph child node for ${expected.childRunId}.`);
      node.scrollIntoView({ block: "center", inline: "nearest" });
      node.focus();
      const key = expected.key ?? "Enter";
      const event = new KeyboardEvent("keydown", {
        key,
        code: key === " " ? "Space" : "Enter",
        bubbles: true,
        cancelable: true,
      });
      const dispatchReturned = node.dispatchEvent(event);
      return {
        activeElementIsNode: document.activeElement === node,
        activeElementAriaLabel: document.activeElement?.getAttribute("aria-label") ?? "",
        key,
        role: node.getAttribute("role") ?? "",
        tabIndex: (node as unknown as HTMLElement).tabIndex,
        focusable: node.getAttribute("focusable") ?? "",
        ariaKeyshortcuts: node.getAttribute("aria-keyshortcuts") ?? "",
        keyboardOpenable: node.dataset.keyboardOpenable ?? "",
        keyboardEventDefaultPrevented: event.defaultPrevented,
        keyboardEventDispatchReturned: dispatchReturned,
      };
    },
    input,
  );
}

export async function clickPatternGraphOverflowNode(cdp: CdpClient, input: { overflowChildRunId: string; overflowChildThreadId: string }) {
  return evaluate(
    cdp,
    async (expected) => {
      const node = [...document.querySelectorAll<SVGGElement>(".subagent-pattern-graph-node")].find(
        (candidate) =>
          candidate.dataset.graphNodeId === "mapper:overflow" &&
          candidate.dataset.overflowExpandable === "true" &&
          (candidate.getAttribute("aria-label") ?? "").includes("from Map-Reduce"),
      );
      if (!node) throw new Error(`Missing Map-Reduce overflow node for ${expected.overflowChildRunId}.`);
      node.scrollIntoView({ block: "center", inline: "nearest" });
      node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const refreshed = document.querySelector<SVGGElement>(".subagent-pattern-graph-node[data-graph-node-id='mapper:overflow']");
      return {
        role: node.getAttribute("role") ?? "",
        tabIndex: (node as unknown as HTMLElement).tabIndex,
        focusable: node.getAttribute("focusable") ?? "",
        ariaLabel: node.getAttribute("aria-label") ?? "",
        ariaKeyshortcuts: node.getAttribute("aria-keyshortcuts") ?? "",
        keyboardOpenable: node.dataset.keyboardOpenable ?? "",
        overflowExpandable: node.dataset.overflowExpandable ?? "",
        expandedAfterClick: refreshed?.dataset.overflowExpanded ?? refreshed?.getAttribute("aria-expanded") ?? "",
        overflowCount: node.dataset.overflowCount ?? "",
        overflowChildRunId: expected.overflowChildRunId,
        overflowChildThreadId: expected.overflowChildThreadId,
      };
    },
    input,
  );
}

export async function clickPatternGraphApprovalBadge(
  cdp: CdpClient,
  input: { childRunId: string; childThreadId: string; approvalId: string },
) {
  return evaluate(
    cdp,
    (expected) => {
      const badge = [...document.querySelectorAll<SVGGElement>(".subagent-pattern-graph-node .node-badge[data-badge-key='approval']")].find(
        (candidate) =>
          candidate.dataset.approvalChildRunId === expected.childRunId &&
          candidate.dataset.approvalChildThreadId === expected.childThreadId &&
          candidate.dataset.approvalId === expected.approvalId &&
          candidate.dataset.approvalOpenable === "true",
      );
      if (!badge) throw new Error(`Missing openable graph approval badge for ${expected.approvalId}.`);
      badge.scrollIntoView({ block: "center", inline: "nearest" });
      badge.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      return {
        role: badge.getAttribute("role") ?? "",
        tabIndex: (badge as unknown as HTMLElement).tabIndex,
        focusable: badge.getAttribute("focusable") ?? "",
        ariaLabel: badge.getAttribute("aria-label") ?? "",
        ariaKeyshortcuts: badge.getAttribute("aria-keyshortcuts") ?? "",
        approvalId: badge.dataset.approvalId ?? "",
        childRunId: badge.dataset.approvalChildRunId ?? "",
        childThreadId: badge.dataset.approvalChildThreadId ?? "",
        openable: badge.dataset.approvalOpenable ?? "",
        busy: badge.dataset.approvalBusy ?? "",
      };
    },
    input,
  );
}

export async function inspectPatternGraphOverflowPanel(
  cdp: CdpClient,
  input: { overflowChildRunId: string; overflowChildThreadId: string; overflowChildLabel: string },
) {
  return evaluate(
    cdp,
    (expected) => {
      const panel = document.querySelector<HTMLElement>(
        ".subagent-pattern-graph-overflow-panel[data-overflow-panel-node-id='mapper:overflow']",
      );
      const child = [...(panel?.querySelectorAll<HTMLButtonElement>(".subagent-pattern-graph-overflow-child") ?? [])].find(
        (candidate) =>
          candidate.dataset.overflowChildRunId === expected.overflowChildRunId &&
          candidate.dataset.overflowChildThreadId === expected.overflowChildThreadId,
      );
      const text = panel?.textContent ?? "";
      const childText = child?.textContent ?? "";
      const criticalElements = [panel, child].filter((element): element is HTMLElement => Boolean(element));
      const criticalRects = criticalElements.map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };
      });
      let criticalOverlapCount = 0;
      for (let index = 0; index < criticalRects.length; index += 1) {
        for (let compare = index + 1; compare < criticalRects.length; compare += 1) {
          const aElement = criticalElements[index];
          const bElement = criticalElements[compare];
          if (aElement.contains(bElement) || bElement.contains(aElement)) continue;
          const a = criticalRects[index];
          const b = criticalRects[compare];
          const overlapX = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
          const overlapY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
          const overlapArea = overlapX * overlapY;
          const smaller = Math.min(a.width * a.height, b.width * b.height);
          if (smaller > 0 && overlapArea / smaller > 0.15) criticalOverlapCount += 1;
        }
      }
      return {
        panelVisible: Boolean(panel && panel.offsetParent !== null),
        panelNamesOverflowNode: text.includes("+1 Mapper") && text.includes("1 grouped"),
        groupedChildVisible: Boolean(child && child.offsetParent !== null) && childText.includes(expected.overflowChildLabel),
        groupedChildIdentityVisible: Boolean(
          child?.dataset.overflowChildRunId === expected.overflowChildRunId &&
          child.dataset.overflowChildThreadId === expected.overflowChildThreadId,
        ),
        groupedChildStatusVisible: Boolean(child?.dataset.overflowChildStatus && childText.includes(child.dataset.overflowChildStatus)),
        groupedChildOpenable: child?.dataset.overflowChildOpenable ?? "",
        groupedChildAriaLabel: child?.getAttribute("aria-label") ?? "",
        horizontalOverflowFree: document.documentElement.scrollWidth <= window.innerWidth + 2,
        criticalOverlapCount,
        panelText: text,
        childText,
      };
    },
    input,
  );
}

export async function clickChildAction(cdp: CdpClient, ariaLabel: string) {
  await evaluate(
    cdp,
    (expectedAriaLabel) => {
      const button = [...document.querySelectorAll<HTMLButtonElement>(".subagent-parent-cluster-child-action")].find(
        (candidate) => candidate.getAttribute("aria-label") === expectedAriaLabel,
      );
      if (!button) throw new Error(`Missing child action ${expectedAriaLabel}`);
      button.click();
    },
    ariaLabel,
  );
}

export async function clickSidebarThread(cdp: CdpClient, title: string) {
  await evaluate(
    cdp,
    (expectedTitle) => {
      const button = [...document.querySelectorAll<HTMLButtonElement>(".thread-row")].find(
        (candidate) => candidate.getAttribute("title") === expectedTitle,
      );
      if (!button) throw new Error(`Missing sidebar thread ${expectedTitle}`);
      button.click();
    },
    title,
  );
}

export async function inspectStandaloneChildThread(
  cdp: CdpClient,
  input: {
    parentThreadId: string;
    childThreadId: string;
    childRunId: string;
    expectedParentBarrierLabel: string;
    expectedParentBarrierDetail: string;
    expectedAssistantText: string;
    forbiddenText?: string;
  },
) {
  return evaluate(
    cdp,
    (expected) => {
      const inspector = document.querySelector<HTMLElement>(".subagent-thread-inspector");
      const summary = inspector?.querySelector<HTMLElement>(".subagent-thread-inspector-main");
      const parentBarrier = inspector?.querySelector<HTMLElement>(".subagent-thread-parent-barrier");
      const parentAction = inspector?.querySelector<HTMLButtonElement>(".subagent-thread-open-parent");
      const messageScroll = document.querySelector<HTMLElement>(".messages");
      const inspectorDock = inspector?.closest<HTMLElement>(".subagent-thread-inspector-dock") ?? inspector;
      const conversationChildren = [...(messageScroll?.parentElement?.children ?? [])] as HTMLElement[];
      const transcriptText = messageScroll?.innerText ?? document.body.innerText;
      const messageScrollChildren = [...(messageScroll?.children ?? [])] as HTMLElement[];
      const messageScrollChildIndex = conversationChildren.findIndex((element) => element === messageScroll);
      const inspectorChildIndex = conversationChildren.findIndex((element) => element === inspectorDock);
      const transcriptChildIndex = messageScrollChildren.findIndex(
        (element) => element.classList.contains("message") && element.innerText.includes(expected.expectedAssistantText),
      );
      const transcriptElement = transcriptChildIndex >= 0 ? messageScrollChildren[transcriptChildIndex] : undefined;
      const transcriptRect = transcriptElement?.getBoundingClientRect();
      const inspectorRect = inspector?.getBoundingClientRect();
      const transcriptInspectorOverlap =
        transcriptRect && inspectorRect
          ? Math.max(0, Math.min(transcriptRect.right, inspectorRect.right) - Math.max(transcriptRect.left, inspectorRect.left)) *
            Math.max(0, Math.min(transcriptRect.bottom, inspectorRect.bottom) - Math.max(transcriptRect.top, inspectorRect.top))
          : 0;
      const criticalElements = [
        ...(inspector ? [inspector] : []),
        ...(summary ? [summary] : []),
        ...(parentBarrier ? [parentBarrier] : []),
        ...(parentAction ? [parentAction] : []),
        ...[...document.querySelectorAll<HTMLElement>(".messages > .message")],
      ].filter((element) => element.offsetParent !== null);
      const criticalRects = criticalElements.map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };
      });
      let criticalOverlapCount = 0;
      for (let index = 0; index < criticalRects.length; index += 1) {
        for (let compare = index + 1; compare < criticalRects.length; compare += 1) {
          const aElement = criticalElements[index];
          const bElement = criticalElements[compare];
          if (aElement.contains(bElement) || bElement.contains(aElement)) continue;
          const a = criticalRects[index];
          const b = criticalRects[compare];
          const overlapX = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
          const overlapY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
          const overlapArea = overlapX * overlapY;
          const smaller = Math.min(a.width * a.height, b.width * b.height);
          if (smaller > 0 && overlapArea / smaller > 0.15) criticalOverlapCount += 1;
        }
      }
      return {
        inspectorVisible: Boolean(inspector && inspector.offsetParent !== null),
        inspectorCollapsedByDefault: inspector instanceof HTMLDetailsElement && !inspector.open,
        childRunIdVisible:
          inspector?.dataset.subagentRunId === expected.childRunId || (inspector?.innerText ?? "").includes(expected.childRunId),
        childThreadTranscriptVisible:
          transcriptText.includes(expected.childThreadId) || transcriptText.includes(expected.expectedAssistantText),
        parentThreadIdVisible:
          inspector?.dataset.subagentParentThreadId === expected.parentThreadId ||
          (inspector?.innerText ?? "").includes(expected.parentThreadId),
        parentBarrierVisible:
          inspector?.dataset.subagentParentBarrierVisible === "true" && Boolean(parentBarrier && parentBarrier.offsetParent !== null),
        parentBarrierLabelVisible: (parentBarrier?.innerText ?? "").includes(expected.expectedParentBarrierLabel),
        parentBarrierDetailVisible: (parentBarrier?.getAttribute("title") ?? "").includes(expected.expectedParentBarrierDetail),
        parentOpenActionVisible:
          Boolean(parentAction && parentAction.offsetParent !== null) &&
          (parentAction?.getAttribute("aria-label") ?? "").includes(expected.parentThreadId),
        transcriptVisible: transcriptText.includes(expected.expectedAssistantText),
        childAssistantVisible: transcriptText.includes(expected.expectedAssistantText),
        transcriptPrecedesInspector:
          transcriptChildIndex >= 0 &&
          messageScrollChildIndex >= 0 &&
          inspectorChildIndex >= 0 &&
          messageScrollChildIndex < inspectorChildIndex,
        transcriptVerticallyPrecedesInspector: Boolean(transcriptRect && inspectorRect && transcriptRect.top < inspectorRect.top),
        transcriptInspectorOverlapFree: transcriptInspectorOverlap === 0,
        transcriptChildIndex,
        messageScrollChildIndex,
        inspectorChildIndex,
        siblingSummaryNotLeaked: expected.forbiddenText ? !transcriptText.includes(expected.forbiddenText) : true,
        horizontalOverflowFree: document.documentElement.scrollWidth <= window.innerWidth + 2,
        criticalOverlapCount,
        inspectorText: inspector?.innerText ?? "",
      };
    },
    input,
  );
}

export async function clickStandaloneChildParentAction(cdp: CdpClient, parentThreadId: string) {
  await evaluate(
    cdp,
    (expectedParentThreadId) => {
      const button = [...document.querySelectorAll<HTMLButtonElement>(".subagent-thread-open-parent")].find((candidate) =>
        (candidate.getAttribute("aria-label") ?? "").includes(expectedParentThreadId),
      );
      if (!button) throw new Error(`Missing standalone child parent action for ${expectedParentThreadId}`);
      button.click();
    },
    parentThreadId,
  );
}

export async function openSubagentThreadInspector(cdp: CdpClient) {
  await evaluate(cdp, () => {
    const details = document.querySelector<HTMLDetailsElement>(".subagent-thread-inspector");
    if (!details) throw new Error("Missing sub-agent thread inspector.");
    if (!details.open) details.querySelector<HTMLElement>("summary")?.click();
  });
}

export async function clickMailboxAction(cdp: CdpClient, label: string, titleFragment: string) {
  await evaluate(
    cdp,
    (input) => {
      const button = [...document.querySelectorAll<HTMLButtonElement>(".subagent-parent-cluster-mailbox-action.is-button")].find(
        (candidate) => candidate.innerText.trim() === input.label && (candidate.getAttribute("title") ?? "").includes(input.titleFragment),
      );
      if (!button) throw new Error(`Missing mailbox action ${input.label} with ${input.titleFragment}`);
      button.click();
    },
    { label, titleFragment },
  );
}

export async function clickWorkflowTaskAction(cdp: CdpClient, ariaLabel: string) {
  await evaluate(
    cdp,
    (expectedAriaLabel) => {
      const button = [...document.querySelectorAll<HTMLButtonElement>(".subagent-parent-cluster-workflow-action")].find(
        (candidate) => candidate.getAttribute("aria-label") === expectedAriaLabel,
      );
      if (!button) throw new Error(`Missing workflow task action ${expectedAriaLabel}`);
      button.click();
    },
    ariaLabel,
  );
}

export async function clickWorkflowOpenAudit(cdp: CdpClient) {
  await evaluate(cdp, () => {
    const button = [
      ...document.querySelectorAll<HTMLButtonElement>(".workflow-review-workspace button, .workflow-review-audit-section button"),
    ].find(
      (candidate) =>
        candidate.innerText.includes("Open audit") && (candidate.getAttribute("title") ?? "").includes("Open the latest audit trail"),
    );
    if (!button) throw new Error("Missing workflow Open audit button.");
    button.click();
  });
}

export async function clickWorkflowBuildPanel(cdp: CdpClient, panelTarget: string) {
  await evaluate(
    cdp,
    (expectedPanelTarget) => {
      const button = [...document.querySelectorAll<HTMLButtonElement>(".workflow-build-rail button")].find(
        (candidate) => candidate.dataset.panelTarget === expectedPanelTarget,
      );
      if (!button) throw new Error(`Missing workflow build panel ${expectedPanelTarget}.`);
      button.click();
    },
    panelTarget,
  );
}

export async function openSettingsPanel(cdp: CdpClient) {
  await evaluate(cdp, () => {
    const button = [...document.querySelectorAll<HTMLButtonElement>(".sidebar-footer button")].find((candidate) =>
      candidate.innerText.includes("Settings"),
    );
    if (!button) throw new Error("Missing Settings button.");
    button.click();
  });
  await waitFor(cdp, () => Boolean(document.querySelector(".right-panel.settings-panel-host")));
}

export async function clickSettingsSection(cdp: CdpClient, label: string) {
  await evaluate(
    cdp,
    (expectedLabel) => {
      const button = [...document.querySelectorAll<HTMLButtonElement>(".settings-nav button")].find((candidate) =>
        candidate.innerText.includes(expectedLabel),
      );
      if (!button) throw new Error(`Missing Settings section ${expectedLabel}.`);
      button.click();
    },
    label,
  );
}

export async function closeSettingsPanel(cdp: CdpClient) {
  await evaluate(cdp, () => {
    const button = document.querySelector<HTMLButtonElement>("button[aria-label='Close Settings panel']");
    if (!button) throw new Error("Missing close Settings panel button.");
    button.click();
  });
}

export async function scrollLocalRuntimeOwnershipIntoView(cdp: CdpClient) {
  await evaluate(cdp, () => {
    const settingsPanel = document.querySelector<HTMLElement>(".right-panel.settings-panel-host");
    const runtimeCard = settingsPanel
      ? [...settingsPanel.querySelectorAll<HTMLElement>(".model-runtime-catalog-profile")].find(
          (card) =>
            card.innerText.includes("In use by sub-agent Review worker") ||
            [...card.querySelectorAll<HTMLElement>("[title]")].some((element) =>
              (element.getAttribute("title") ?? "").includes("In use by sub-agent Review worker"),
            ),
        )
      : undefined;
    if (!runtimeCard) throw new Error("Missing owned local runtime card.");
    runtimeCard.scrollIntoView({ block: "start", inline: "nearest" });
  });
}

export async function selectApprovalScope(cdp: CdpClient, value: string) {
  await evaluate(
    cdp,
    (scopeValue) => {
      const input = document.querySelector<HTMLInputElement>(
        `.subagent-approval-dialog input[name="subagent-approval-scope"][value="${scopeValue}"]`,
      );
      if (!input) throw new Error(`Missing approval scope ${scopeValue}`);
      input.click();
    },
    value,
  );
}

export async function submitApprovalDialog(cdp: CdpClient) {
  await submitApprovalDecisionDialog(cdp, "Approve child request");
}

export async function submitApprovalDecisionDialog(cdp: CdpClient, label: string) {
  await evaluate(
    cdp,
    (expectedLabel) => {
      const button = [...document.querySelectorAll<HTMLButtonElement>(".subagent-approval-dialog button[type='submit']")].find(
        (candidate) => candidate.innerText.includes(expectedLabel),
      );
      if (!button) throw new Error(`Missing approval dialog submit button ${expectedLabel}`);
      button.click();
    },
    label,
  );
}

export async function dismissApprovalDialog(cdp: CdpClient) {
  await evaluate(cdp, () => {
    const dialog = document.querySelector<HTMLElement>(".subagent-approval-dialog");
    if (!dialog) throw new Error("Missing approval dialog to dismiss");
    dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  });
  await waitFor(cdp, () => !document.querySelector(".subagent-approval-dialog"));
}

export async function captureFailureArtifacts(cdp: CdpClient, artifacts: Record<string, string>) {
  try {
    artifacts.failureScreenshot = await writeScreenshot(cdp, "failure.png");
  } catch {
    // Best-effort diagnostics only.
  }
  try {
    artifacts.failureDomSnapshot = await writeDomSnapshot(cdp, "failure-dom.json");
  } catch {
    // Best-effort diagnostics only.
  }
}

export async function writeScreenshot(cdp: CdpClient, name: string): Promise<string> {
  const outputPath = join(RESULTS_DIR, name);
  const result = await cdp.send<{ data: string }>(
    "Page.captureScreenshot",
    {
      format: "png",
      captureBeyondViewport: true,
    },
    { timeoutMs: CDP_ARTIFACT_COMMAND_TIMEOUT_MS },
  );
  await writeFile(outputPath, Buffer.from(result.data, "base64"));
  return relative(REPO_ROOT, outputPath);
}

export async function writeAccessibilitySnapshot(cdp: CdpClient, name: string): Promise<string> {
  const outputPath = join(RESULTS_DIR, name);
  const snapshot = await cdp.send("Accessibility.getFullAXTree", {}, { timeoutMs: CDP_ARTIFACT_COMMAND_TIMEOUT_MS });
  await writeFile(outputPath, JSON.stringify(snapshot, null, 2), "utf8");
  return relative(REPO_ROOT, outputPath);
}

export async function writeDomSnapshot(cdp: CdpClient, name: string): Promise<string> {
  const outputPath = join(RESULTS_DIR, name);
  const snapshot = await evaluate(cdp, () => ({
    title: document.title,
    url: location.href,
    text: document.body.innerText.slice(0, 8000),
    clusterCount: document.querySelectorAll(".subagent-parent-cluster").length,
    childDetails: [...document.querySelectorAll<HTMLDetailsElement>(".subagent-parent-cluster-child-thread")].map((details) => ({
      childRunId: details.dataset.childRunId,
      childThreadId: details.dataset.childThreadId,
      defaultExpanded: details.dataset.childDefaultExpanded,
      open: details.open,
      hasTranscript: Boolean(details.querySelector(".subagent-parent-cluster-child-transcript")),
      hasLiveTranscript: Boolean(details.querySelector(".subagent-parent-cluster-child-transcript-live")),
      text: details.innerText.slice(0, 1000),
    })),
    activeThreadText: document.body.innerText.match(/Sub-agent Desktop dogfood|New Chat|Instructions/g) ?? [],
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  await writeFile(outputPath, JSON.stringify(snapshot, null, 2), "utf8");
  return relative(REPO_ROOT, outputPath);
}

export async function exportChatAndInspectChildBundle(
  cdp: CdpClient,
  input: {
    parentThreadId: string;
    exportPath: string;
    expectedChildRuns: Array<{
      runId: string;
      threadId: string;
      expectedText: string;
      expectedUserText?: string;
      exportCategory?: "primary" | "lifecycle_edge" | "parent_stop";
      patternGraphLinked?: boolean;
    }>;
    workflowTaskId: string;
    approvalId: string;
    approvalParentMailboxEventId: string;
    approvalChildRunId: string;
    approvalChildThreadId: string;
    approvalCanonicalTaskPath: string;
    approvalWaitBarrierId: string;
    approvalRequestedToolId: string;
    approvalRequestedAction: string;
  },
) {
  const result = await evaluate<
    Promise<
      | {
          path?: string;
          bytes?: number;
          createdAt?: string;
          source?: string;
          fallbackReason?: string;
        }
      | undefined
    >,
    [string]
  >(
    cdp,
    async (threadId) => {
      const desktop = (
        window as Window & {
          ambientDesktop?: {
            exportChat(input: { threadId: string }): Promise<
              | {
                  path?: string;
                  bytes?: number;
                  createdAt?: string;
                  source?: string;
                  fallbackReason?: string;
                }
              | undefined
            >;
          };
        }
      ).ambientDesktop;
      if (!desktop?.exportChat) throw new Error("Ambient Desktop exportChat API is unavailable.");
      return desktop.exportChat({ threadId });
    },
    input.parentThreadId,
  );
  const archive = await readFile(input.exportPath);
  const zip = await JSZip.loadAsync(archive);
  const manifest = await readZipJson<Record<string, any>>(zip, "manifest.json");
  const index = await readZipJson<Record<string, any>>(zip, "child-threads/index.json");
  const children = Array.isArray(index.children) ? (index.children as Array<Record<string, any>>) : [];
  const childByRunId = new Map(children.map((child) => [child.run?.id, child]));
  const expectedChildren = input.expectedChildRuns.map((expected) => {
    const child = childByRunId.get(expected.runId);
    const dir = typeof child?.dir === "string" ? child.dir : "";
    return {
      expected,
      child,
      dir,
      transcript: dir ? zip.file(`${dir}/visible-transcript.md`) : undefined,
      fullTranscript: dir ? zip.file(`${dir}/full-transcript.md`) : undefined,
      fullTranscriptJson: dir ? zip.file(`${dir}/full-transcript.json`) : undefined,
      runEvents: dir ? zip.file(`${dir}/run-events.json`) : undefined,
      toolScopeSnapshots: dir ? zip.file(`${dir}/tool-scope-snapshots.json`) : undefined,
      waitBarriers: dir ? zip.file(`${dir}/wait-barriers.json`) : undefined,
    };
  });
  const childTranscriptTexts = await Promise.all(
    expectedChildren.map(async (child) => (child.transcript ? child.transcript.async("string") : "")),
  );
  const expectedChildrenWithTranscripts = expectedChildren.map((child, index) => ({
    ...child,
    transcriptText: childTranscriptTexts[index] ?? "",
  }));
  const graphLinkedExpectedChildren = input.expectedChildRuns.filter((expected) => expected.patternGraphLinked === true);
  const expectedRunExported = (child: (typeof expectedChildrenWithTranscripts)[number]) =>
    child.child?.run?.id === child.expected.runId && child.child?.thread?.id === child.expected.threadId;
  const expectedTranscriptHasMessages = (child: (typeof expectedChildrenWithTranscripts)[number]) =>
    child.transcriptText.includes(child.expected.expectedText) &&
    (!child.expected.expectedUserText || child.transcriptText.includes(child.expected.expectedUserText));
  const expectedChildHasBundleFiles = (child: (typeof expectedChildrenWithTranscripts)[number]) =>
    Boolean(child.fullTranscript) &&
    Boolean(child.fullTranscriptJson) &&
    Boolean(child.runEvents) &&
    Boolean(child.toolScopeSnapshots) &&
    Boolean(child.waitBarriers);
  const expectedCategoryExported = (category: "lifecycle_edge" | "parent_stop") => {
    const childrenForCategory = expectedChildrenWithTranscripts.filter((child) => child.expected.exportCategory === category);
    return (
      childrenForCategory.length > 0 &&
      childrenForCategory.every(
        (child) => expectedRunExported(child) && expectedTranscriptHasMessages(child) && expectedChildHasBundleFiles(child),
      )
    );
  };
  const parentMailboxBundle = await readZipJson<Record<string, any>>(zip, "child-threads/parent-mailbox-events.json");
  const parentMailboxEvents = Array.isArray(parentMailboxBundle.events) ? (parentMailboxBundle.events as Array<Record<string, any>>) : [];
  const approvalParentMailboxEvent =
    parentMailboxEvents.find((event) => event.id === input.approvalParentMailboxEventId) ??
    parentMailboxEvents.find((event) => {
      const payload = objectRecord(event.payload);
      return event.type === "subagent.child_approval_requested" && payload.approvalId === input.approvalId;
    });
  const approvalForwardedParentMailboxEvent = parentMailboxEvents.find((event) => {
    const payload = objectRecord(event.payload);
    return event.type === "subagent.child_approval_forwarded" && payload.approvalId === input.approvalId;
  });
  const approvalPayload = objectRecord(approvalParentMailboxEvent?.payload);
  const approvalForwardedPayload = objectRecord(approvalForwardedParentMailboxEvent?.payload);
  const approvalParentBlockingState = objectRecord(approvalPayload.parentBlockingState);
  const approvalForwardedParentBlockingState = objectRecord(approvalForwardedPayload.parentBlockingState);
  const approvalWaitBarrier = objectRecord(approvalPayload.waitBarrier);
  const approvalAuthorityContract = {
    requestExported: Boolean(approvalParentMailboxEvent),
    forwardedExported: Boolean(approvalForwardedParentMailboxEvent),
    eventIdMatches: approvalParentMailboxEvent?.id === input.approvalParentMailboxEventId,
    schemaMatches: approvalPayload.schemaVersion === "ambient-subagent-approval-bridge-v1",
    childIdentityMatches:
      approvalPayload.childRunId === input.approvalChildRunId &&
      approvalPayload.childThreadId === input.approvalChildThreadId &&
      approvalPayload.canonicalTaskPath === input.approvalCanonicalTaskPath &&
      approvalForwardedPayload.childRunId === input.approvalChildRunId &&
      approvalForwardedPayload.childThreadId === input.approvalChildThreadId &&
      approvalForwardedPayload.canonicalTaskPath === input.approvalCanonicalTaskPath,
    requestedToolMatches:
      approvalPayload.requestedToolId === input.approvalRequestedToolId &&
      approvalPayload.requestedAction === input.approvalRequestedAction &&
      approvalPayload.requestedToolCategory === "workspace.write",
    requestedScopeThisAction: approvalPayload.requestedScope === "this_action",
    requestEffectiveScopeNarrow: approvalPayload.effectiveScope === "this_action",
    forwardedEffectiveScopeChildThread:
      approvalForwardedPayload.decision === "approved" && approvalForwardedPayload.effectiveScope === "this_child_thread",
    parentBlockingResumeMatches:
      approvalParentBlockingState.action === "forward_child_approval_then_wait" &&
      approvalParentBlockingState.resumeAction === "wait_agent" &&
      approvalParentBlockingState.resumeParentBlocking === true &&
      approvalParentBlockingState.childRunId === input.approvalChildRunId &&
      approvalParentBlockingState.childThreadId === input.approvalChildThreadId &&
      approvalParentBlockingState.waitBarrierId === input.approvalWaitBarrierId,
    forwardedParentBlockingResumeMatches:
      approvalForwardedParentBlockingState.action === "forward_child_approval_then_wait" &&
      approvalForwardedParentBlockingState.resumeAction === "wait_agent" &&
      approvalForwardedParentBlockingState.resumeParentBlocking === true &&
      approvalForwardedParentBlockingState.childRunId === input.approvalChildRunId &&
      approvalForwardedParentBlockingState.childThreadId === input.approvalChildThreadId &&
      approvalForwardedParentBlockingState.waitBarrierId === input.approvalWaitBarrierId,
    waitBarrierMatches:
      approvalPayload.waitBarrierId === input.approvalWaitBarrierId && approvalWaitBarrier.id === input.approvalWaitBarrierId,
    instructionPreservesBlocking:
      typeof approvalPayload.instruction === "string" && approvalPayload.instruction.includes("return the parent to waiting on this child"),
  };
  const callableWorkflowTasks = await readZipText(zip, "child-threads/callable-workflow-tasks.json");
  const patternGraphs = await readZipText(zip, "child-threads/pattern-graphs.json");
  const evidenceSummary = await readZipJson<Record<string, any>>(zip, "child-threads/evidence-summary.json");
  const evidenceChildren = Array.isArray(evidenceSummary.children) ? (evidenceSummary.children as Array<Record<string, any>>) : [];
  const evidenceChildByRunId = new Map(evidenceChildren.map((child) => [child.runId, child]));
  const approvalEvidenceChild = objectRecord(evidenceChildByRunId.get(input.approvalChildRunId));
  const approvalEvidenceApprovals = objectRecord(approvalEvidenceChild.approvals);
  const approvalEvidenceAuthority = objectRecord(approvalEvidenceChild.authority);
  const approvalEvidenceLatestToolScope = objectRecord(approvalEvidenceAuthority.latestToolScopeSnapshot);
  const approvalEvidenceDisplay = objectRecord(approvalEvidenceLatestToolScope.displayMetadata);
  const manifestExport = manifest.export && typeof manifest.export === "object" ? (manifest.export as Record<string, any>) : {};
  const includedFiles = Array.isArray(manifestExport.includedFiles) ? (manifestExport.includedFiles as string[]) : [];

  return {
    apiReturnedPath: result?.path === input.exportPath,
    apiSource: result?.source,
    apiFallbackReason: result?.fallbackReason,
    zipWritten: archive.byteLength > 0,
    zipBytes: archive.byteLength,
    resultBytesMatchZip: result?.bytes === archive.byteLength,
    manifestIncludesChildThreads:
      Number(manifestExport.childThreadCount) >= input.expectedChildRuns.length && includedFiles.includes("child-threads/index.json"),
    childEvidenceSummaryIncluded:
      Number(evidenceSummary.childThreadCount) >= input.expectedChildRuns.length &&
      includedFiles.includes("child-threads/evidence-summary.json"),
    childEvidenceSummaryCoversExpectedRuns: input.expectedChildRuns.every(
      (expected) => evidenceChildByRunId.get(expected.runId)?.childThreadId === expected.threadId,
    ),
    childEvidenceSummaryLinksTranscripts: input.expectedChildRuns.every((expected) => {
      const child = objectRecord(evidenceChildByRunId.get(expected.runId));
      const files = objectRecord(child.files);
      return (
        typeof files.visibleTranscriptMarkdown === "string" &&
        typeof files.visibleTranscriptJson === "string" &&
        typeof files.fullTranscriptMarkdown === "string" &&
        typeof files.fullTranscriptJson === "string" &&
        typeof files.toolScopeSnapshots === "string"
      );
    }),
    childEvidenceSummaryAuthorityIncluded:
      Number(approvalEvidenceAuthority.toolScopeSnapshotCount) > 0 &&
      Array.isArray(approvalEvidenceLatestToolScope.piVisibleCategories) &&
      Array.isArray(approvalEvidenceDisplay.deniedToolIds),
    childEvidenceSummaryApprovalBridgeIncluded:
      Number(approvalEvidenceApprovals.parentApprovalBridgeEventCount) > 0 &&
      Array.isArray(approvalEvidenceApprovals.parentApprovalBridgeEventIds) &&
      approvalEvidenceApprovals.parentApprovalBridgeEventIds.includes(approvalParentMailboxEvent?.id),
    childEvidenceSummaryPatternLinksIncluded:
      graphLinkedExpectedChildren.length > 0 &&
      graphLinkedExpectedChildren.every((expected) => {
        const child = objectRecord(evidenceChildByRunId.get(expected.runId));
        const links = Array.isArray(child.patternGraphLinks) ? (child.patternGraphLinks as Array<Record<string, any>>) : [];
        return links.some((link) => link.childRunId === expected.runId && link.transcriptPath?.includes("visible-transcript.md"));
      }),
    childEvidenceSummaryResultArtifactsIncluded: evidenceChildren.some((child) => objectRecord(child.resultArtifact).present === true),
    childEvidenceSummaryGapsBounded: evidenceChildren.every((child) => Array.isArray(child.evidenceGaps)),
    indexContainsExpectedChildren: expectedChildrenWithTranscripts.every((child) => expectedRunExported(child)),
    childTranscriptsContainExpectedMessages: expectedChildrenWithTranscripts.every((child) => expectedTranscriptHasMessages(child)),
    lifecycleEdgeChildrenExported: expectedCategoryExported("lifecycle_edge"),
    parentStopCascadeChildrenExported: expectedCategoryExported("parent_stop"),
    childFullTranscriptsIncluded: expectedChildrenWithTranscripts.every(
      ({ fullTranscript, fullTranscriptJson }) => Boolean(fullTranscript) && Boolean(fullTranscriptJson),
    ),
    childRunEventsIncluded: expectedChildrenWithTranscripts.every(({ runEvents }) => Boolean(runEvents)),
    childToolScopeSnapshotsIncluded: expectedChildrenWithTranscripts.every(({ toolScopeSnapshots }) => Boolean(toolScopeSnapshots)),
    childWaitBarriersIncluded: expectedChildrenWithTranscripts.every(({ waitBarriers }) => Boolean(waitBarriers)),
    parentMailboxIncluded: approvalAuthorityContract.requestExported && approvalAuthorityContract.schemaMatches,
    approvalAuthorityContract,
    callableWorkflowTasksIncluded: callableWorkflowTasks.includes(input.workflowTaskId),
    patternGraphLinksIncluded:
      graphLinkedExpectedChildren.length > 0 &&
      graphLinkedExpectedChildren.every(
        (expected) =>
          patternGraphs.includes(expected.runId) &&
          patternGraphs.includes(expected.threadId) &&
          patternGraphs.includes("visible-transcript.md"),
      ),
    childPiSessionStatusRecorded: expectedChildrenWithTranscripts.every(
      ({ child }) =>
        child?.piSession && typeof child.piSession === "object" && typeof child.piSession.originalPiSessionFileExists === "boolean",
    ),
    exportedChildRunIds: expectedChildren.map(({ expected }) => expected.runId),
  };
}

async function readZipText(zip: JSZip, path: string): Promise<string> {
  const file = zip.file(path);
  if (!file) return "";
  return file.async("string");
}

async function readZipJson<T>(zip: JSZip, path: string): Promise<T> {
  const text = await readZipText(zip, path);
  if (!text) throw new Error(`Missing ${path} in Desktop chat export.`);
  return JSON.parse(text) as T;
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function writeReport(report: DogfoodReport) {
  await mkdir(RESULTS_DIR, { recursive: true });
  await writeFile(join(RESULTS_DIR, "latest.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

export function dogfoodGitCommit(): string {
  return process.env.AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_GIT_COMMIT || gitOutput(["rev-parse", "HEAD"]) || "unknown";
}

export function dogfoodGitBranch(): string {
  return process.env.AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_GIT_BRANCH || gitOutput(["rev-parse", "--abbrev-ref", "HEAD"]) || "unknown";
}

function gitOutput(args: string[]): string | undefined {
  try {
    return execFileSync("git", args, {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

export async function readSeed(path: string): Promise<SubagentDesktopDogfoodSeedResult> {
  return JSON.parse(await readFile(path, "utf8")) as SubagentDesktopDogfoodSeedResult;
}

export function requireDogfoodEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for sub-agent Desktop dogfood.`);
  return value;
}

export function requireUntrackedRuntimeDogfoodEnv() {
  const pid = Number(requireDogfoodEnv("AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_UNTRACKED_RUNTIME_PID"));
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error("AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_UNTRACKED_RUNTIME_PID must be a positive integer.");
  }
  return {
    id: requireDogfoodEnv("AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_UNTRACKED_RUNTIME_ID"),
    pid,
    endpoint: requireDogfoodEnv("AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_UNTRACKED_RUNTIME_ENDPOINT"),
    model: requireDogfoodEnv("AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_UNTRACKED_RUNTIME_MODEL"),
  };
}

export async function getAvailablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => resolveListen());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not allocate a local port.");
  const port = address.port;
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => (error ? rejectClose(error) : resolveClose()));
  });
  return port;
}

export function dogfoodCdpPort(): number {
  return cdpPortFromEnv() ?? failMissingCdpPort();
}

export function cdpPortFromEnv(): number | undefined {
  const raw = process.env.AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_CDP_PORT;
  if (!raw) return undefined;
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_CDP_PORT must be a TCP port, got ${raw}.`);
  }
  return port;
}

function positiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, got ${raw}.`);
  }
  return value;
}

function failMissingCdpPort(): never {
  throw new Error("AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_CDP_PORT is required; run through scripts/run-electron-dogfood.mjs.");
}

export async function terminateApp(app: ChildProcess | undefined) {
  if (!app || app.exitCode !== null || app.signalCode !== null) return;
  signalAppProcess(app, "SIGTERM");
  const exited = await waitForAppExit(app, 5000);
  if (exited) return;
  signalAppProcess(app, "SIGKILL");
  await waitForAppExit(app, 2000);
}

function signalAppProcess(app: ChildProcess, signal: NodeJS.Signals) {
  if (!app.pid) return;
  if (process.platform !== "win32") {
    try {
      process.kill(-app.pid, signal);
      return;
    } catch {
      // Fall through to the direct child in case the process group is already gone.
    }
  }
  try {
    app.kill(signal);
  } catch {
    // Best effort test cleanup only.
  }
}

async function waitForAppExit(app: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (app.exitCode !== null || app.signalCode !== null) return true;
  return Promise.race([once(app, "exit").then(() => true), delay(timeoutMs).then(() => false)]);
}
