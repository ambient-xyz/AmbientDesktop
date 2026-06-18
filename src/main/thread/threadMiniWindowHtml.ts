import type { ResolvedTheme, ThinkingDisplayMode } from "../../shared/desktopTypes";
import type { ChatMessage, ThreadSummary } from "../../shared/threadTypes";

export interface ThreadMiniWindowRenderOptions {
  theme: ResolvedTheme;
  platform?: NodeJS.Platform;
  thinkingDisplayMode?: ThinkingDisplayMode;
}

export function miniWindowHeaderPaddingLeft(platform: NodeJS.Platform = process.platform): string {
  return platform === "darwin" ? "96px" : "20px";
}

export function renderThreadMiniWindowHtml(
  thread: ThreadSummary,
  messages: readonly ChatMessage[],
  workingDirectory: string,
  options: ThreadMiniWindowRenderOptions,
): string {
  const theme = options.theme;
  const thinkingDisplayMode = options.thinkingDisplayMode ?? "full";
  const visibleMessages = messages.filter((message) => thinkingDisplayMode === "full" || message.metadata?.kind !== "thinking");
  const body = visibleMessages.length
    ? visibleMessages.map(renderMiniMessageHtml).join("")
    : `<p class="empty">No messages yet.</p>`;
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(thread.title)}</title>
  <style>
    :root { color-scheme: light dark; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; --mini-header-left: ${miniWindowHeaderPaddingLeft(options.platform)}; }
    * { box-sizing: border-box; }
    body { margin: 0; min-width: 0; background: ${theme === "dark" ? "#101416" : "#fbfcfd"}; color: ${theme === "dark" ? "#eef4f6" : "#1d252c"}; }
    header { position: sticky; top: 0; z-index: 1; min-width: 0; padding: 18px 20px 14px var(--mini-header-left); border-bottom: 1px solid rgba(127, 142, 153, 0.28); background: inherit; }
    h1 { margin: 0 0 6px; max-width: 100%; min-width: 0; overflow-wrap: anywhere; font-size: 18px; line-height: 1.25; }
    code { display: block; max-width: 100%; min-width: 0; color: ${theme === "dark" ? "#b8c7cf" : "#5d6872"}; font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
    main { display: grid; gap: 14px; min-width: 0; padding: 16px 20px 24px; }
    article { display: grid; gap: 6px; min-width: 0; }
    .role { color: ${theme === "dark" ? "#91a2ad" : "#66727d"}; font-size: 12px; font-weight: 700; text-transform: capitalize; }
    pre { margin: 0; max-width: 100%; white-space: pre-wrap; overflow-wrap: anywhere; font: 14px/1.5 Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .empty { color: ${theme === "dark" ? "#91a2ad" : "#66727d"}; margin: 0; }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(thread.title)}</h1>
    <code>${escapeHtml(workingDirectory)}</code>
  </header>
  <main>${body}</main>
</body>
</html>`;
}

function renderMiniMessageHtml(message: ChatMessage): string {
  const role = message.metadata?.kind === "thinking" ? "thinking" : message.role;
  return `<article><div class="role">${escapeHtml(role)}</div><pre>${escapeHtml(message.content)}</pre></article>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
