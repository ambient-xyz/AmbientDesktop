import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { inflateSync } from "node:zlib";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { SubagentParentCluster } from "./SubagentParentCluster";
import { subagentParentClusterFixtureModel } from "./SubagentParentCluster.fixture";

const resultsDir = join(process.cwd(), "test-results", "subagent-parent-cluster-visual");
const requiredLabels = [
  "Caller: sub-agent child",
  "Approval: Child Bridge Policy",
  "Worktree: isolated",
  "Nested fanout: Child Bridge Policy",
  "Blocking: approval",
  "Blocking: workflow work",
  "Parent blocked on 1 child: approval needed",
  "Reviewer: approval",
  "Imitate and Verify",
  "Approval needed",
  "Summary retained",
  "Cancelled 1 child",
  "Parent cancellation requested",
];

describe("SubagentParentCluster visual proof", () => {
  it("captures browser-rendered collapsed, expanded, provenance, blocker, and narrow states", async () => {
    await mkdir(resultsDir, { recursive: true });
    const fixturePath = join(resultsDir, "fixture.html");
    const runnerPath = join(resultsDir, "capture-runner.cjs");
    const reportPath = join(resultsDir, "latest.json");

    await writeFile(fixturePath, await renderFixtureHtml(), "utf8");
    await writeFile(runnerPath, electronCaptureRunnerSource(), "utf8");
    await runElectronCapture(runnerPath, fixturePath, reportPath, resultsDir);

    const report = JSON.parse(await readFile(reportPath, "utf8")) as VisualProofReport;
    expect(report.checks.collapsedInitially.detailsOpen).toBe(false);
    expect(report.checks.collapsedInitially.clusterHeight).toBeLessThan(80);
    expect(report.checks.expandedDesktop.detailsOpen).toBe(true);
    expect(report.checks.expandedDesktop.missingLabels).toEqual([]);
    expect(report.checks.expandedDesktop.childRows).toBeGreaterThanOrEqual(2);
    expect(report.checks.expandedDesktop.childThreads).toBe(2);
    expect(report.checks.expandedDesktop.expandedChildThreads).toBe(1);
    expect(report.checks.expandedDesktop.retainedChildThreads).toBe(1);
    expect(report.checks.expandedDesktop.childTranscriptLiveShells).toBeGreaterThanOrEqual(1);
    expect(report.checks.expandedDesktop.childTranscriptStreams).toBeGreaterThanOrEqual(1);
    expect(report.checks.expandedDesktop.inlineChildTranscriptVisible).toBe(true);
    expect(report.checks.expandedDesktop.transcriptBeforeBlocker).toBe(true);
    expect(report.checks.expandedDesktop.transcriptBeforePatternGraph).toBe(true);
    expect(report.checks.expandedDesktop.retainedChildTranscriptPanels).toBe(1);
    expect(report.checks.expandedDesktop.parentBlockingPanels).toBe(1);
    expect(report.checks.expandedDesktop.parentBlockingChildren).toBe(1);
    expect(report.checks.expandedDesktop.provenanceChips).toBeGreaterThanOrEqual(4);
    expect(report.checks.expandedDesktop.blockerChips).toBeGreaterThanOrEqual(2);
    expect(report.checks.expandedDesktop.lifecycleEffectChips).toBeGreaterThanOrEqual(4);
    expect(report.checks.expandedDesktop.actionButtons).toBeGreaterThanOrEqual(6);
    expect(report.checks.expandedDesktop.clusterHeight).toBeGreaterThan(report.checks.collapsedInitially.clusterHeight);
    expect(report.checks.childExpandedDesktop.expandedChildThreads).toBe(1);
    expect(report.checks.childExpandedDesktop.childTranscriptPanels).toBeGreaterThanOrEqual(1);
    expect(report.checks.childExpandedDesktop.childTranscriptLiveShells).toBeGreaterThanOrEqual(1);
    expect(report.checks.childExpandedDesktop.childTranscriptStreams).toBeGreaterThanOrEqual(1);
    expect(report.checks.childExpandedDesktop.childRuntimeEventRails).toBeGreaterThanOrEqual(1);
    expect(report.checks.childExpandedDesktop.childThreadHeaders).toBeGreaterThanOrEqual(1);
    expect(report.checks.childExpandedDesktop.childOpenFullThreadActions).toBeGreaterThanOrEqual(1);
    expect(report.checks.childExpandedDesktop.childThreadVisible).toBe(true);
    expect(report.checks.childExpandedDesktop.runtimeTimelineVisible).toBe(true);
    expect(report.checks.childExpandedDesktop.openFullThreadVisible).toBe(true);
    expect(report.checks.childExpandedDesktop.childBlockerPanels).toBe(1);
    expect(report.checks.childExpandedDesktop.childTranscriptHeadings).toBe(2);
    expect(report.checks.childExpandedDesktop.retainedChildTranscriptPanels).toBe(1);
    expect(report.checks.childExpandedDesktop.inlineChildTranscriptVisible).toBe(true);
    expect(report.checks.childExpandedDesktop.childTranscriptHeadingVisible).toBe(true);
    expect(report.checks.childExpandedDesktop.transcriptBeforeBlocker).toBe(true);
    expect(report.checks.childExpandedDesktop.transcriptBeforePatternGraph).toBe(true);
    expect(report.checks.childExpandedDesktop.missingLabels).toEqual([]);
    expect(report.checks.expandedNarrow.detailsOpen).toBe(true);
    expect(report.checks.expandedNarrow.expandedChildThreads).toBe(1);
    expect(report.checks.expandedNarrow.childTranscriptLiveShells).toBeGreaterThanOrEqual(1);
    expect(report.checks.expandedNarrow.childRuntimeEventRails).toBeGreaterThanOrEqual(1);
    expect(report.checks.expandedNarrow.childThreadHeaders).toBeGreaterThanOrEqual(1);
    expect(report.checks.expandedNarrow.childOpenFullThreadActions).toBeGreaterThanOrEqual(1);
    expect(report.checks.expandedNarrow.childThreadVisible).toBe(true);
    expect(report.checks.expandedNarrow.runtimeTimelineVisible).toBe(true);
    expect(report.checks.expandedNarrow.openFullThreadVisible).toBe(true);
    expect(report.checks.expandedNarrow.transcriptBeforeBlocker).toBe(true);
    expect(report.checks.expandedNarrow.transcriptBeforePatternGraph).toBe(true);
    expect(report.checks.expandedNarrow.horizontalOverflowFree).toBe(true);
    expect(report.checks.expandedNarrow.scrollWidth).toBeLessThanOrEqual(report.checks.expandedNarrow.innerWidth + 2);

    const captures = report.screenshots;
    expect(captures.map((capture) => capture.name)).toEqual([
      "collapsed-desktop",
      "expanded-desktop",
      "child-expanded-desktop",
      "expanded-narrow",
    ]);
    for (const capture of captures) {
      const image = await readFile(capture.path);
      const analysis = analyzePng(image);
      expect(capture.bytes).toBeGreaterThan(1_000);
      expect(analysis.width).toBeGreaterThanOrEqual(capture.name === "expanded-narrow" ? 420 : 900);
      expect(analysis.height).toBeGreaterThanOrEqual(capture.name === "expanded-narrow" ? 700 : 620);
      expect(analysis.nonBlackRatio).toBeGreaterThan(0.5);
      expect(analysis.nonWhiteRatio).toBeGreaterThan(0.02);
      expect(analysis.distinctColorCount).toBeGreaterThan(24);
    }
  }, 60_000);
});

async function renderFixtureHtml(): Promise<string> {
  const styles = await readFile(join(process.cwd(), "src", "renderer", "src", "styles.css"), "utf8");
  const noop = vi.fn();
  const markup = renderToStaticMarkup(
    <SubagentParentCluster
      model={subagentParentClusterFixtureModel()}
      onOpenThread={noop}
      onCancelChild={noop}
      onCloseChild={noop}
      onOpenWorkflowThread={noop}
      onPauseWorkflowTask={noop}
      onResumeWorkflowTask={noop}
      onCancelWorkflowTask={noop}
      onResolveBarrierAction={noop}
      onResolveApprovalAction={noop}
      renderChildTranscript={(child) => (
        <div
          className="subagent-parent-cluster-child-transcript-live"
          data-child-message-count="1"
          data-child-runtime-event-count="3"
          data-child-runtime-event-rendered-count="3"
          data-child-runtime-event-omitted-count="0"
          data-child-streaming="true"
        >
          <div className="subagent-parent-cluster-child-mini-thread-header">
            <div className="subagent-parent-cluster-child-mini-thread-title">
              <span className="subagent-parent-cluster-child-transcript-live-status tone-warning">Live</span>
              <strong>Child thread</strong>
              <span>{child.title}</span>
            </div>
            {child.canOpenThread && (
              <button type="button" className="subagent-parent-cluster-child-open-full-thread" aria-label={`Open full child thread ${child.title}`}>
                Open full thread
              </button>
            )}
          </div>
          <div className="subagent-parent-cluster-child-transcript-live-header">
            <span>1 message</span>
            <span>3 runtime events</span>
            <span>live child run</span>
            <span>1 streaming message</span>
          </div>
          <div className="subagent-parent-cluster-child-transcript-stream">
            <div className="subagent-parent-cluster-child-transcript-empty">
              Live child transcript for {child.title}: thinking, tool calls, and assistant output render inline here.
            </div>
          </div>
          <div className="subagent-parent-cluster-child-runtime-events">
            <div className="subagent-parent-cluster-child-runtime-events-title">
              <strong>Runtime timeline</strong>
              <span>3 events</span>
            </div>
            <div className="subagent-parent-cluster-child-runtime-event tone-active">
              <span>Session Started</span>
              <small>Child Pi session is running in the visible child thread.</small>
            </div>
            <div className="subagent-parent-cluster-child-runtime-event tone-warning">
              <span>Approval Blocked</span>
              <small>Parent approval is required before the child can continue.</small>
            </div>
          </div>
          <div className="subagent-parent-cluster-child-transcript-live-marker tone-warning">
            <strong>Child is paused for parent action</strong>
            <span>Resolve the child request in the parent context; the transcript stays visible while the parent remains blocked.</span>
          </div>
        </div>
      )}
      pauseWorkflowTaskBusyId="workflow-task-1"
      approvalActionBusyId="child-run-1:approval-1"
    />,
  );

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Subagent parent cluster visual proof</title>
  <style>${styles}</style>
  <style>
    html,
    body {
      width: 100%;
      min-height: 100%;
      overflow: auto;
    }

    body {
      padding: 32px;
      background: #f2f5f7;
    }

    .subagent-parent-cluster-visual-stage {
      width: min(100%, 960px);
      margin: 0 auto;
      padding: 44px 20px;
    }

    .subagent-parent-cluster {
      margin: 0 auto 24px;
    }

    @media (max-width: 720px) {
      body {
        padding: 12px;
      }

      .subagent-parent-cluster-visual-stage {
        padding: 18px 0;
      }
    }
  </style>
</head>
<body>
  <main class="subagent-parent-cluster-visual-stage">
    ${markup}
  </main>
</body>
</html>`;
}

function electronCaptureRunnerSource(): string {
  return `"use strict";

const { app, BrowserWindow } = require("electron");
const { writeFileSync } = require("fs");
const { join } = require("path");

const fixturePath = process.argv[2];
const reportPath = process.argv[3];
const outputDir = process.argv[4];
const requiredLabels = ${JSON.stringify(requiredLabels)};

app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");

async function main() {
  await app.whenReady();
  const win = new BrowserWindow({
    width: 980,
    height: 680,
    useContentSize: true,
    show: false,
    backgroundColor: "#ffffff",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  await win.loadFile(fixturePath);
  await waitForPaint();
  const collapsedInitially = await collectChecks(win);
  const screenshots = [await capture(win, "collapsed-desktop")];

  await win.webContents.executeJavaScript(
    'document.querySelector(".subagent-parent-cluster").open = true;',
    true,
  );
  await waitForPaint();
  const expandedDesktop = await collectChecks(win);
  screenshots.push(await capture(win, "expanded-desktop"));

  await win.webContents.executeJavaScript(
    'const child = document.querySelector(".subagent-parent-cluster-child-thread"); child.open = true; child.scrollIntoView({ block: "center" });',
    true,
  );
  await waitForPaint();
  const childExpandedDesktop = await collectChecks(win);
  screenshots.push(await capture(win, "child-expanded-desktop"));

  win.setContentSize(430, 760);
  await waitForPaint();
  const expandedNarrow = await collectChecks(win);
  screenshots.push(await capture(win, "expanded-narrow"));

  writeFileSync(reportPath, JSON.stringify({
    version: 1,
    fixturePath,
    checks: {
      collapsedInitially,
      expandedDesktop,
      childExpandedDesktop,
      expandedNarrow,
    },
    screenshots,
  }, null, 2) + "\\n");

  win.destroy();
  app.quit();
}

async function collectChecks(win) {
  return win.webContents.executeJavaScript(\`
(() => {
  const details = document.querySelector(".subagent-parent-cluster");
  const text = document.body.innerText;
  const rootScrollWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
  const clusterRect = details ? details.getBoundingClientRect() : { width: 0, height: 0 };
  const requiredLabels = \${JSON.stringify(requiredLabels)};
  const transcript = document.querySelector(".subagent-parent-cluster-child-transcript-live");
  const blocker = document.querySelector(".subagent-parent-cluster-child-blocker-panel");
  const patternGraph = document.querySelector(".subagent-parent-cluster-pattern-graphs");
  return {
    detailsOpen: Boolean(details && details.open),
    missingLabels: requiredLabels.filter((label) => !text.includes(label)),
    childRows: document.querySelectorAll(".subagent-parent-cluster-child-row").length,
    childThreads: document.querySelectorAll(".subagent-parent-cluster-child-thread").length,
    retainedChildThreads: document.querySelectorAll(".subagent-parent-cluster-child-thread.is-retained").length,
    expandedChildThreads: document.querySelectorAll(".subagent-parent-cluster-child-thread[open]").length,
    parentBlockingPanels: document.querySelectorAll(".subagent-parent-cluster-parent-blocking").length,
    parentBlockingChildren: document.querySelectorAll(".subagent-parent-cluster-parent-blocking-child").length,
    childTranscriptPanels: document.querySelectorAll(".subagent-parent-cluster-child-transcript").length,
    retainedChildTranscriptPanels: document.querySelectorAll(".subagent-parent-cluster-child-thread.is-retained .subagent-parent-cluster-child-transcript").length,
    childTranscriptLiveShells: document.querySelectorAll(".subagent-parent-cluster-child-transcript-live").length,
    childTranscriptStreams: document.querySelectorAll(".subagent-parent-cluster-child-transcript-stream").length,
    childRuntimeEventRails: document.querySelectorAll(".subagent-parent-cluster-child-runtime-events").length,
    childThreadHeaders: document.querySelectorAll(".subagent-parent-cluster-child-mini-thread-header").length,
    childOpenFullThreadActions: document.querySelectorAll(".subagent-parent-cluster-child-open-full-thread").length,
    childBlockerPanels: document.querySelectorAll(".subagent-parent-cluster-child-blocker-panel").length,
    childTranscriptHeadings: document.querySelectorAll(".subagent-parent-cluster-child-transcript-heading").length,
    inlineChildTranscriptVisible: text.includes("Live child transcript for Reviewer"),
    childThreadVisible: text.includes("Child thread"),
    runtimeTimelineVisible: text.includes("Runtime timeline"),
    openFullThreadVisible: text.includes("Open full thread"),
    childTranscriptHeadingVisible: text.includes("Child transcript"),
    provenanceChips: document.querySelectorAll(".subagent-parent-cluster-workflow-provenance").length,
    blockerChips: document.querySelectorAll(".subagent-parent-cluster-child-blocker, .subagent-parent-cluster-workflow-blocker").length,
    lifecycleEffectChips: document.querySelectorAll(".subagent-parent-cluster-lifecycle-effect").length,
    actionButtons: document.querySelectorAll("button").length,
    transcriptBeforeBlocker: Boolean(transcript && blocker && (transcript.compareDocumentPosition(blocker) & Node.DOCUMENT_POSITION_FOLLOWING)),
    transcriptBeforePatternGraph: Boolean(transcript && patternGraph && (transcript.compareDocumentPosition(patternGraph) & Node.DOCUMENT_POSITION_FOLLOWING)),
    horizontalOverflowFree: rootScrollWidth <= window.innerWidth + 2,
    scrollWidth: rootScrollWidth,
    innerWidth: window.innerWidth,
    clusterWidth: Math.round(clusterRect.width),
    clusterHeight: Math.round(clusterRect.height),
  };
})()
  \`, true);
}

async function capture(win, name) {
  const image = await win.capturePage();
  const png = image.toPNG();
  const path = join(outputDir, name + ".png");
  writeFileSync(path, png);
  const size = await win.webContents.executeJavaScript("({ width: window.innerWidth, height: window.innerHeight })", true);
  return {
    name,
    path,
    bytes: png.length,
    width: size.width,
    height: size.height,
  };
}

function waitForPaint() {
  return new Promise((resolve) => setTimeout(resolve, 140));
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  app.quit();
  process.exitCode = 1;
});
`;
}

async function runElectronCapture(
  runnerPath: string,
  fixturePath: string,
  reportPath: string,
  outputDir: string,
): Promise<void> {
  const electronPath = createRequire(import.meta.url)("electron") as string;
  await new Promise<void>((resolve, reject) => {
    const child = spawn(electronPath, [runnerPath, fixturePath, reportPath, outputDir], {
      env: { ...process.env, ELECTRON_ENABLE_LOGGING: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let settled = false;
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`Electron visual proof timed out. stdout:\\n${stdout}\\nstderr:\\n${stderr}`));
    }, 45_000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Electron visual proof exited ${code}. stdout:\\n${stdout}\\nstderr:\\n${stderr}`));
    });
  });
}

function analyzePng(buffer: Buffer): PngAnalysis {
  const decoded = decodePng(buffer);
  const colors = new Set<string>();
  let nonBlack = 0;
  let nonWhite = 0;
  let opaque = 0;
  for (let offset = 0; offset < decoded.data.length; offset += 4) {
    const r = decoded.data[offset];
    const g = decoded.data[offset + 1];
    const b = decoded.data[offset + 2];
    const a = decoded.data[offset + 3];
    if (a === 0) continue;
    opaque += 1;
    if (r > 8 || g > 8 || b > 8) nonBlack += 1;
    if (r < 245 || g < 245 || b < 245) nonWhite += 1;
    colors.add(`${r},${g},${b},${a}`);
  }
  const total = decoded.width * decoded.height;
  return {
    width: decoded.width,
    height: decoded.height,
    opaqueRatio: opaque / total,
    nonBlackRatio: nonBlack / total,
    nonWhiteRatio: nonWhite / total,
    distinctColorCount: colors.size,
  };
}

function decodePng(buffer: Buffer): DecodedPng {
  const signature = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== signature) throw new Error("Not a PNG file.");
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks: Buffer[] = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  if (bitDepth !== 8) throw new Error(`Unsupported PNG bit depth ${bitDepth}.`);
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (channels === 0) throw new Error(`Unsupported PNG color type ${colorType}.`);

  const inflated = inflateSync(Buffer.concat(idatChunks));
  const rowBytes = width * channels;
  const raw = new Uint8Array(height * rowBytes);
  let readOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[readOffset];
    readOffset += 1;
    const rowStart = y * rowBytes;
    for (let x = 0; x < rowBytes; x += 1) {
      const rawByte = inflated[readOffset + x];
      const left = x >= channels ? raw[rowStart + x - channels] : 0;
      const up = y > 0 ? raw[rowStart + x - rowBytes] : 0;
      const upLeft = y > 0 && x >= channels ? raw[rowStart + x - rowBytes - channels] : 0;
      raw[rowStart + x] = (rawByte + pngFilterDelta(filter, left, up, upLeft)) & 0xff;
    }
    readOffset += rowBytes;
  }

  if (channels === 4) return { width, height, data: raw };

  const rgba = new Uint8Array(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    rgba[pixel * 4] = raw[pixel * 3];
    rgba[pixel * 4 + 1] = raw[pixel * 3 + 1];
    rgba[pixel * 4 + 2] = raw[pixel * 3 + 2];
    rgba[pixel * 4 + 3] = 255;
  }
  return { width, height, data: rgba };
}

function pngFilterDelta(filter: number, left: number, up: number, upLeft: number): number {
  if (filter === 0) return 0;
  if (filter === 1) return left;
  if (filter === 2) return up;
  if (filter === 3) return Math.floor((left + up) / 2);
  if (filter === 4) return paeth(left, up, upLeft);
  throw new Error(`Unsupported PNG filter ${filter}.`);
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  if (upDistance <= upLeftDistance) return up;
  return upLeft;
}

interface VisualProofReport {
  version: 1;
  fixturePath: string;
  checks: {
    collapsedInitially: VisualProofDomChecks;
    expandedDesktop: VisualProofDomChecks;
    childExpandedDesktop: VisualProofDomChecks;
    expandedNarrow: VisualProofDomChecks;
  };
  screenshots: Array<{
    name: "collapsed-desktop" | "expanded-desktop" | "child-expanded-desktop" | "expanded-narrow";
    path: string;
    bytes: number;
    width: number;
    height: number;
  }>;
}

interface VisualProofDomChecks {
  detailsOpen: boolean;
  missingLabels: string[];
  childRows: number;
  childThreads: number;
  retainedChildThreads: number;
  expandedChildThreads: number;
  parentBlockingPanels: number;
  parentBlockingChildren: number;
  childTranscriptPanels: number;
  retainedChildTranscriptPanels: number;
  childTranscriptLiveShells: number;
  childTranscriptStreams: number;
  childRuntimeEventRails: number;
  childThreadHeaders: number;
  childOpenFullThreadActions: number;
  childBlockerPanels: number;
  childTranscriptHeadings: number;
  inlineChildTranscriptVisible: boolean;
  childThreadVisible: boolean;
  runtimeTimelineVisible: boolean;
  openFullThreadVisible: boolean;
  childTranscriptHeadingVisible: boolean;
  provenanceChips: number;
  blockerChips: number;
  lifecycleEffectChips: number;
  actionButtons: number;
  transcriptBeforeBlocker: boolean;
  transcriptBeforePatternGraph: boolean;
  horizontalOverflowFree: boolean;
  scrollWidth: number;
  innerWidth: number;
  clusterWidth: number;
  clusterHeight: number;
}

interface PngAnalysis {
  width: number;
  height: number;
  opaqueRatio: number;
  nonBlackRatio: number;
  nonWhiteRatio: number;
  distinctColorCount: number;
}

interface DecodedPng {
  width: number;
  height: number;
  data: Uint8Array;
}
