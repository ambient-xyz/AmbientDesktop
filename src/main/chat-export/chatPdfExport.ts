import type { BrowserWindowConstructorOptions } from "electron";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type {
  ChatExportDataSource,
  ChatExportOptions,
  VisibleChatExportSnapshot,
} from "./chatExport";
import { createVisibleChatExportSnapshot } from "./chatExport";
import { redactSensitiveText } from "./chatExportSecurityFacade";
import type { ChatMessage, ChatPdfExportSource, ThreadSummary } from "../../shared/threadTypes";

export interface ChatPdfExportPayload {
  fileName: string;
  pdf: Buffer;
  createdAt: string;
  source: ChatPdfExportSource;
  fallbackReason?: string;
}

export interface ChatPdfExportOptions extends ChatExportOptions {
  renderHtmlToPdf(html: string): Promise<Buffer>;
}

export interface ElectronPrintToPdfWindow {
  loadURL(url: string): Promise<unknown>;
  close(): void;
  isDestroyed(): boolean;
  webContents: {
    printToPDF(options: Record<string, unknown>): Promise<Buffer>;
  };
}

export type ElectronPrintToPdfWindowConstructor = new (options: BrowserWindowConstructorOptions) => ElectronPrintToPdfWindow;

export async function createChatPdfExport(
  store: ChatExportDataSource,
  threadId: string,
  options: ChatPdfExportOptions,
): Promise<ChatPdfExportPayload> {
  const now = options.now ?? new Date();
  const snapshot = await createVisibleChatExportSnapshot(store, threadId, {
    ...options,
    includePiSessionContent: false,
    now,
  });
  const html = renderChatPdfExportHtml(snapshot, options);
  const pdf = await options.renderHtmlToPdf(html);
  return {
    fileName: chatPdfExportFileName(snapshot.thread, now),
    pdf,
    createdAt: snapshot.createdAt,
    source: "visible-chat-pdf",
  };
}

export function createElectronPrintToPdfRenderer(
  BrowserWindow: ElectronPrintToPdfWindowConstructor,
): (html: string) => Promise<Buffer> {
  return async (html: string) => {
    const tempDir = await mkdtemp(join(tmpdir(), "ambient-chat-pdf-"));
    const htmlPath = join(tempDir, "export.html");
    const window = new BrowserWindow({
      show: false,
      width: 900,
      height: 1200,
      webPreferences: {
        contextIsolation: true,
        javascript: false,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      },
    });
    try {
      await writeFile(htmlPath, html, "utf8");
      await window.loadURL(pathToFileURL(htmlPath).toString());
      return await window.webContents.printToPDF({
        printBackground: true,
        pageSize: "A4",
        margins: {
          marginType: "custom",
          top: 0.45,
          bottom: 0.45,
          left: 0.45,
          right: 0.45,
        },
      });
    } finally {
      if (!window.isDestroyed()) window.close();
      await rm(tempDir, { recursive: true, force: true });
    }
  };
}

export function renderChatPdfExportHtml(
  snapshot: VisibleChatExportSnapshot,
  options: Pick<ChatExportOptions, "appName" | "appVersion">,
): string {
  const displayTitle = redactText(snapshot.thread.title || "Chat Export");
  const hiddenMessageCount = snapshot.rawMessages.length - snapshot.messages.length;
  const childVisibleMessageCount = snapshot.childThreadBundles.reduce((sum, child) => sum + child.messages.length, 0);
  const childHiddenMessageCount = snapshot.childThreadBundles.reduce((sum, child) => sum + child.rawMessages.length - child.messages.length, 0);
  const childArtifactCount = snapshot.childThreadBundles.reduce((sum, child) => sum + child.artifacts.length, 0);
  const sourceLabel = "Visible transcript PDF";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(displayTitle)}</title>
  <style>
    :root {
      --black: #000000;
      --white: #ffffff;
      --cyan: #4a93b2;
      --signal: #00264f;
      --core: #1893eb;
      --substrate: #d2e4ec;
      --muted: #5f6b72;
      --line: #dfe7eb;
      --panel: #f7fbfc;
    }
    @page { size: A4; margin: 0.45in; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--black);
      background: var(--white);
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 12px;
      line-height: 1.5;
    }
    .page { max-width: 7.2in; margin: 0 auto; }
    .masthead {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 24px;
      padding-bottom: 30px;
      border-bottom: 4px solid var(--cyan);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--muted);
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0;
    }
    .brand-mark { width: 24px; height: 24px; color: var(--cyan); }
    h1, h2, h3 {
      margin: 0;
      font-family: Oswald, "Arial Narrow", Impact, sans-serif;
      font-weight: 900;
      line-height: 1;
      text-transform: uppercase;
      letter-spacing: 0;
    }
    h1 {
      max-width: 5.8in;
      margin-top: 28px;
      color: var(--cyan);
      font-size: 56px;
    }
    h2 {
      margin: 34px 0 12px;
      color: var(--cyan);
      font-size: 30px;
      break-after: avoid;
    }
    h3 {
      color: var(--black);
      font-size: 18px;
    }
    .meta {
      margin-top: 18px;
      color: var(--muted);
      font-size: 11px;
      font-weight: 700;
    }
    .stamp {
      align-self: start;
      min-width: 1.55in;
      padding: 12px;
      color: var(--signal);
      border: 1px solid var(--substrate);
      text-align: right;
    }
    .stamp strong {
      display: block;
      color: var(--cyan);
      font-family: Oswald, "Arial Narrow", Impact, sans-serif;
      font-size: 25px;
      line-height: 1;
      text-transform: uppercase;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 9px;
      margin-top: 22px;
    }
    .stat {
      min-height: 72px;
      padding: 11px;
      border: 1px solid var(--line);
      background: var(--white);
      break-inside: avoid;
    }
    .stat strong {
      display: block;
      color: var(--black);
      font-family: Oswald, "Arial Narrow", Impact, sans-serif;
      font-size: 24px;
      line-height: 1;
      text-transform: uppercase;
    }
    .stat span {
      display: block;
      margin-top: 6px;
      color: var(--muted);
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
    }
    .notice {
      margin-top: 20px;
      padding: 12px 14px;
      border-left: 5px solid var(--cyan);
      background: var(--panel);
      color: var(--signal);
      font-weight: 700;
    }
    .message {
      display: grid;
      grid-template-columns: 0.72in 1fr;
      gap: 14px;
      padding: 16px 0;
      border-top: 1px solid var(--line);
      break-inside: avoid;
    }
    .role {
      color: var(--cyan);
      font-family: Oswald, "Arial Narrow", Impact, sans-serif;
      font-size: 17px;
      font-weight: 900;
      text-transform: uppercase;
    }
    .time {
      margin-top: 6px;
      color: var(--muted);
      font-size: 9px;
      font-weight: 700;
      overflow-wrap: anywhere;
    }
    .content {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .artifact-list, .child-list {
      display: grid;
      gap: 10px;
    }
    .artifact, .child {
      padding: 12px;
      border: 1px solid var(--line);
      background: var(--white);
      break-inside: avoid;
    }
    .artifact-meta, .child-meta {
      margin-top: 6px;
      color: var(--muted);
      font-size: 10px;
      font-weight: 700;
    }
    .empty {
      color: var(--muted);
      font-weight: 700;
    }
    footer {
      margin-top: 42px;
      padding-top: 12px;
      border-top: 1px solid var(--line);
      color: var(--muted);
      font-size: 10px;
    }
  </style>
</head>
<body>
  <main class="page">
    <section class="masthead">
      <div>
        <div class="brand">${ambientMarkSvg()}<span>${escapeHtml(options.appName)} PDF Export</span></div>
        <h1>${escapeHtml(displayTitle)}</h1>
        <div class="meta">
          Thread ${escapeHtml(snapshot.thread.id)}<br />
          Workspace ${escapeHtml(redactText(snapshot.thread.workspacePath))}<br />
          Exported ${escapeHtml(snapshot.createdAt)} with ${escapeHtml(options.appName)} ${escapeHtml(options.appVersion)}
        </div>
      </div>
      <aside class="stamp">
        <strong>PDF</strong>
        ${escapeHtml(sourceLabel)}
      </aside>
    </section>

    <section class="stats" aria-label="Export statistics">
      ${statBlock(snapshot.messages.length, "visible parent messages")}
      ${statBlock(hiddenMessageCount, "hidden parent messages")}
      ${statBlock(snapshot.childThreadBundles.length, "child summaries")}
      ${statBlock(snapshot.artifacts.length + childArtifactCount, "linked artifacts")}
    </section>

    <p class="notice">This PDF uses the same visible-export boundary as the chat archive. Thinking messages and empty assistant placeholders are excluded; child threads are summarized without embedding full child transcripts or raw Pi sessions.</p>

    <h2>Transcript</h2>
    ${snapshot.messages.length ? snapshot.messages.map(renderMessage).join("\n") : '<p class="empty">No visible messages were available for this chat.</p>'}

    <h2>Child Thread Summaries</h2>
    ${snapshot.childThreadBundles.length ? `<div class="child-list">${snapshot.childThreadBundles.map((child) => {
      const hidden = child.rawMessages.length - child.messages.length;
      const resultSummary = childResultSummary(child.run.resultArtifact);
      return `<article class="child">
        <h3>${escapeHtml(redactText(child.thread.title || child.run.canonicalTaskPath || child.thread.id))}</h3>
        <div class="child-meta">
          ${escapeHtml(child.run.status)} / ${escapeHtml(child.run.dependencyMode)} / ${child.messages.length} visible messages / ${hidden} hidden / ${child.artifacts.length} artifacts
          ${resultSummary ? `<br />Result: ${escapeHtml(resultSummary)}` : ""}
        </div>
      </article>`;
    }).join("")}</div>` : '<p class="empty">No child threads were linked to this export.</p>'}

    <h2>Artifact Index</h2>
    ${snapshot.artifacts.length ? `<div class="artifact-list">${snapshot.artifacts.map((artifact) => `<article class="artifact">
      <h3>${escapeHtml(redactText(artifact.label))}</h3>
      <div class="artifact-meta">
        ${escapeHtml(artifact.kind)}
        ${artifact.toolName ? ` / tool ${escapeHtml(redactText(artifact.toolName))}` : ""}
        ${artifact.artifactPath ? `<br />${escapeHtml(redactText(artifact.artifactPath))}` : ""}
      </div>
    </article>`).join("")}</div>` : '<p class="empty">No linked parent transcript artifacts were detected.</p>'}

    <footer>
      Redaction applied before PDF rendering. Source: ${escapeHtml(sourceLabel)}.
      ${snapshot.piSession.fallbackReason ? `Fallback reason: ${escapeHtml(redactText(snapshot.piSession.fallbackReason))}.` : ""}
      Child visible message total: ${childVisibleMessageCount}. Child hidden message total: ${childHiddenMessageCount}.
    </footer>
  </main>
</body>
</html>`;
}

function renderMessage(message: ChatMessage): string {
  return `<article class="message">
    <div>
      <div class="role">${escapeHtml(message.role)}</div>
      <div class="time">${escapeHtml(message.createdAt)}</div>
    </div>
    <div class="content">${escapeHtml(redactText(message.content || "(empty)"))}</div>
  </article>`;
}

function statBlock(value: number, label: string): string {
  return `<div class="stat"><strong>${value.toLocaleString()}</strong><span>${escapeHtml(label)}</span></div>`;
}

function childResultSummary(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const summary = typeof record.summary === "string" ? redactText(record.summary) : undefined;
  const status = typeof record.status === "string" ? record.status : undefined;
  if (summary && status) return `${status}: ${truncateText(summary, 220)}`;
  if (summary) return truncateText(summary, 220);
  return status;
}

function chatPdfExportFileName(thread: ThreadSummary, now: Date): string {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const title = thread.title || thread.id;
  const redactedTitle = redactText(title);
  const slugSource = redactedTitle === title ? title : thread.id;
  const slug = slugify(slugSource) || "chat";
  return `ambient-chat-export-${slug}-${stamp}.pdf`;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function redactText(value: string): string {
  return redactSensitiveText(value);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function truncateText(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}

function ambientMarkSvg(): string {
  return `<svg class="brand-mark" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="currentColor" d="M24 3 44 15v18L24 45 4 33V15L24 3Zm0 8.7L12 18.8v10.4l12 7.1 12-7.1V18.8L24 11.7Z"/>
    <path fill="#00264F" d="M24 17.2 33 22.4v3.2L24 30.8l-9-5.2v-3.2l9-5.2Z"/>
  </svg>`;
}
