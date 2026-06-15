export type MarkdownBlock =
  | { kind: "heading"; text: string }
  | { kind: "hr" }
  | { kind: "table"; headers: string[]; rows: string[][] }
  | { kind: "unordered-list"; items: string[] }
  | { kind: "ordered-list"; items: string[]; start: number }
  | { kind: "paragraph"; text: string };

const unorderedListItemPattern = /^\s*[-*]\s+/;
const orderedListItemPattern = /^\s*(\d+)\.\s+/;

export function parseMarkdownBlocks(text: string): MarkdownBlock[] {
  const lines = text.split(/\r?\n/);
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (/^#{1,4}\s+/.test(line)) {
      blocks.push({ kind: "heading", text: line.replace(/^#{1,4}\s+/, "") });
      index += 1;
      continue;
    }

    if (/^\s*---+\s*$/.test(line)) {
      blocks.push({ kind: "hr" });
      index += 1;
      continue;
    }

    if (isMarkdownTableStart(lines, index)) {
      const table = parseMarkdownTable(lines, index);
      blocks.push({ kind: "table", headers: table.headers, rows: table.rows });
      index = table.nextIndex;
      continue;
    }

    if (unorderedListItemPattern.test(line)) {
      const list = parseListBlock(lines, index, "unordered-list");
      blocks.push(list.block);
      index = list.nextIndex;
      continue;
    }

    if (orderedListItemPattern.test(line)) {
      const list = parseListBlock(lines, index, "ordered-list");
      blocks.push(list.block);
      index = list.nextIndex;
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines, index)) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
  }

  return blocks;
}

function parseListBlock(
  lines: string[],
  startIndex: number,
  kind: "unordered-list",
): { block: Extract<MarkdownBlock, { kind: "unordered-list" }>; nextIndex: number };
function parseListBlock(
  lines: string[],
  startIndex: number,
  kind: "ordered-list",
): { block: Extract<MarkdownBlock, { kind: "ordered-list" }>; nextIndex: number };
function parseListBlock(
  lines: string[],
  startIndex: number,
  kind: "unordered-list" | "ordered-list",
): {
  block: Extract<MarkdownBlock, { kind: "unordered-list" }> | Extract<MarkdownBlock, { kind: "ordered-list" }>;
  nextIndex: number;
} {
  const pattern = kind === "ordered-list" ? orderedListItemPattern : unorderedListItemPattern;
  const items: string[] = [];
  let currentItem: string[] | undefined;
  let firstOrderedNumber: number | undefined;
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];
    const match = line.match(pattern);
    if (match) {
      if (currentItem) items.push(currentItem.join("\n"));
      currentItem = [line.replace(pattern, "")];
      if (kind === "ordered-list" && firstOrderedNumber === undefined) {
        firstOrderedNumber = Number(match[1]) || 1;
      }
      index += 1;
      continue;
    }

    if (!line.trim()) {
      const nextIndex = nextNonBlankIndex(lines, index + 1);
      if (nextIndex < lines.length && pattern.test(lines[nextIndex])) {
        index = nextIndex;
        continue;
      }
      break;
    }

    if (currentItem && isIndentedContinuationLine(line) && !isBlockStart(lines, index)) {
      currentItem.push(line.trim());
      index += 1;
      continue;
    }

    break;
  }

  if (currentItem) items.push(currentItem.join("\n"));

  if (kind === "ordered-list") {
    return { block: { kind, items, start: firstOrderedNumber ?? 1 }, nextIndex: index };
  }
  return { block: { kind, items }, nextIndex: index };
}

function isBlockStart(lines: string[], index: number): boolean {
  const line = lines[index];
  return (
    /^#{1,4}\s+/.test(line) ||
    /^\s*---+\s*$/.test(line) ||
    isMarkdownTableStart(lines, index) ||
    unorderedListItemPattern.test(line) ||
    orderedListItemPattern.test(line)
  );
}

function isIndentedContinuationLine(line: string): boolean {
  return /^\s{2,}\S/.test(line);
}

function nextNonBlankIndex(lines: string[], startIndex: number): number {
  let index = startIndex;
  while (index < lines.length && !lines[index].trim()) index += 1;
  return index;
}

function isMarkdownTableStart(lines: string[], index: number): boolean {
  return Boolean(lines[index]?.includes("|") && lines[index + 1] && isMarkdownTableSeparator(lines[index + 1]));
}

function isMarkdownTableSeparator(line: string): boolean {
  const cells = markdownTableCells(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")));
}

function parseMarkdownTable(lines: string[], startIndex: number): { headers: string[]; rows: string[][]; nextIndex: number } {
  const headers = markdownTableCells(lines[startIndex]);
  const rows: string[][] = [];
  let index = startIndex + 2;
  while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
    rows.push(markdownTableCells(lines[index]));
    index += 1;
  }
  return { headers, rows, nextIndex: index };
}

function markdownTableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}
