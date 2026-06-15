export const richMarkdownIconLabels = [
  "PanelLeft",
  "Plus",
  "FolderOpen",
  "Search",
  "Monitor",
  "Plug",
  "Bell",
  "Pin",
  "ChevronDown",
  "Paperclip",
  "RefreshCw",
  "Download",
  "Brain",
  "Bot",
  "Mic",
  "Shield",
  "Square",
  "Send",
  "Clipboard with arrow",
  "Kanban",
  "GitBranch",
  "FileText",
  "Terminal",
  "Code2",
  "MessageCircle",
  "Pencil",
  "CheckCircle2",
  "ChevronRight",
  "ChevronLeft",
  "ClipboardPaste",
  "AlertCircle",
  "Play",
  "Package",
] as const;

export type RichMarkdownIconLabel = (typeof richMarkdownIconLabels)[number];

const richMarkdownIconLabelSet = new Set<string>(richMarkdownIconLabels);

export function richMarkdownIconLabel(value: string): RichMarkdownIconLabel | undefined {
  const normalized = value.trim();
  return richMarkdownIconLabelSet.has(normalized) ? (normalized as RichMarkdownIconLabel) : undefined;
}

export function richMarkdownTableIconLabel(headers: readonly string[], cellIndex: number, value: string): RichMarkdownIconLabel | undefined {
  if ((headers[cellIndex] ?? "").trim().toLowerCase() !== "icon") return undefined;
  return richMarkdownIconLabel(value);
}
