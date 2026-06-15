import { stableBoardArtifactId } from "./projectBoardArtifacts";
import type { ProjectBoardSynthesisSource } from "./projectBoardSynthesis";

export interface ProjectBoardPlanningSection {
  id: string;
  sourceId: string;
  sourceKind: ProjectBoardSynthesisSource["kind"];
  sourceTitle: string;
  sourceSummary: string;
  sourcePath?: string;
  heading: string;
  range: string;
  content: string;
  charCount: number;
  sourceIndex: number;
  sectionIndex: number;
  sourceSectionIndex: number;
  sourceSectionCount: number;
}

export interface ProjectBoardPlanningSectionOptions {
  maxSectionChars?: number;
  minSectionChars?: number;
  maxSections?: number;
}

interface SectionDraft {
  heading: string;
  range: string;
  content: string;
}

const DEFAULT_MAX_SECTION_CHARS = 8_000;
const DEFAULT_MIN_SECTION_CHARS = 1_000;

export interface ProjectBoardPlanningSectionPlan {
  sections: ProjectBoardPlanningSection[];
  /** Sources with no section in the plan because the maxSections cap was reached. */
  truncatedSources: Array<{ sourceId: string; title: string; path?: string }>;
}

export function projectBoardPlanningSectionsFromSources(
  sources: ProjectBoardSynthesisSource[],
  options: ProjectBoardPlanningSectionOptions = {},
): ProjectBoardPlanningSection[] {
  return projectBoardPlanningSectionPlanFromSources(sources, options).sections;
}

export function projectBoardPlanningSectionPlanFromSources(
  sources: ProjectBoardSynthesisSource[],
  options: ProjectBoardPlanningSectionOptions = {},
): ProjectBoardPlanningSectionPlan {
  const maxSectionChars = Math.max(500, Math.round(options.maxSectionChars ?? DEFAULT_MAX_SECTION_CHARS));
  const minSectionChars = Math.max(200, Math.min(maxSectionChars, Math.round(options.minSectionChars ?? DEFAULT_MIN_SECTION_CHARS)));
  const maxSections = Math.max(1, Math.round(options.maxSections ?? 80));
  const includedSources = sources
    .filter((source) => source.kind !== "ignored" && source.includeInSynthesis !== false && sourceText(source).trim())
    .sort((left, right) => right.relevance - left.relevance || left.title.localeCompare(right.title));
  const sections: ProjectBoardPlanningSection[] = [];

  for (const [sourceIndex, source] of includedSources.entries()) {
    const sourceId = stableSourceId(source, sourceIndex);
    const drafts = splitSourceIntoSectionDrafts(source, { maxSectionChars, minSectionChars });
    for (const [sourceSectionIndex, draft] of drafts.entries()) {
      sections.push({
        id: stableBoardArtifactId("section", [sourceId, sourceSectionIndex, draft.heading, draft.range]),
        sourceId,
        sourceKind: source.kind,
        sourceTitle: source.title,
        sourceSummary: source.summary,
        ...(source.path ? { sourcePath: source.path } : {}),
        heading: draft.heading,
        range: draft.range,
        content: draft.content,
        charCount: draft.content.length,
        sourceIndex,
        sectionIndex: sections.length,
        sourceSectionIndex,
        sourceSectionCount: drafts.length,
      });
    }
    if (sections.length >= maxSections) break;
  }

  const cappedSections = sections.slice(0, maxSections).map((section, sectionIndex) => ({ ...section, sectionIndex }));
  const coveredSourceIds = new Set(cappedSections.map((section) => section.sourceId));
  const truncatedSources = includedSources
    .map((source, sourceIndex) => ({ source, sourceId: stableSourceId(source, sourceIndex) }))
    .filter(({ sourceId }) => !coveredSourceIds.has(sourceId))
    .map(({ source, sourceId }) => ({ sourceId, title: source.title, ...(source.path ? { path: source.path } : {}) }));
  return { sections: cappedSections, truncatedSources };
}

export function projectBoardShouldUseSectionedPlanning(sources: ProjectBoardSynthesisSource[]): boolean {
  const included = sources.filter((source) => source.kind !== "ignored" && source.includeInSynthesis !== false);
  const totalChars = included.reduce((sum, source) => sum + sourceText(source).length, 0);
  return included.some((source) => sourceText(source).length > DEFAULT_MAX_SECTION_CHARS) || totalChars > 20_000 || included.length > 6;
}

function splitSourceIntoSectionDrafts(
  source: ProjectBoardSynthesisSource,
  options: { maxSectionChars: number; minSectionChars: number },
): SectionDraft[] {
  const text = sourceText(source).trim();
  if (!text) return [];
  const headingSections = splitMarkdownByHeadings(text);
  if (headingSections.length > 1) {
    return headingSections.flatMap((section) =>
      section.content.length > options.maxSectionChars
        ? chunkLongText(section.content, options.maxSectionChars).map((chunk, index) => ({
            heading: `${section.heading} ${index + 1}`,
            range: `${section.range}.${index + 1}`,
            content: chunk,
          }))
        : [section],
    );
  }
  if (headingSections.length <= 1 && text.length <= options.maxSectionChars) {
    return [{ heading: source.title || source.path || "Source", range: "full", content: text }];
  }
  const parts = splitByParagraphChunks(text, options.maxSectionChars);
  return packSectionDrafts(parts, options.maxSectionChars, options.minSectionChars);
}

function splitMarkdownByHeadings(text: string): SectionDraft[] {
  const lines = text.split(/\r?\n/);
  const sections: SectionDraft[] = [];
  let startLine = 1;
  let heading = "Introduction";
  let current: string[] = [];

  const flush = (endLine: number) => {
    const content = current.join("\n").trim();
    if (!content) return;
    sections.push({ heading, range: `lines:${startLine}-${endLine}`, content });
  };

  lines.forEach((line, index) => {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (match && current.length > 0) {
      flush(index);
      heading = match[2].trim();
      startLine = index + 1;
      current = [line];
      return;
    }
    if (match && current.length === 0) {
      heading = match[2].trim();
      startLine = index + 1;
    }
    current.push(line);
  });
  flush(lines.length);
  return sections;
}

function splitByParagraphChunks(text: string, maxSectionChars: number): SectionDraft[] {
  const paragraphs = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const chunks: SectionDraft[] = [];
  let current: string[] = [];
  let currentChars = 0;
  let startParagraph = 1;

  const flush = (endParagraph: number) => {
    const content = current.join("\n\n").trim();
    if (!content) return;
    chunks.push({ heading: `Paragraphs ${startParagraph}-${endParagraph}`, range: `paragraphs:${startParagraph}-${endParagraph}`, content });
  };

  paragraphs.forEach((paragraph, index) => {
    const projected = currentChars + paragraph.length + (current.length ? 2 : 0);
    if (current.length > 0 && projected > maxSectionChars) {
      flush(index);
      current = [];
      currentChars = 0;
      startParagraph = index + 1;
    }
    if (paragraph.length > maxSectionChars) {
      if (current.length > 0) {
        flush(index);
        current = [];
        currentChars = 0;
      }
      const subchunks = chunkLongText(paragraph, maxSectionChars);
      subchunks.forEach((chunk, chunkIndex) => {
        chunks.push({
          heading: `Paragraph ${index + 1}.${chunkIndex + 1}`,
          range: `paragraph:${index + 1}.${chunkIndex + 1}`,
          content: chunk,
        });
      });
      startParagraph = index + 2;
      return;
    }
    current.push(paragraph);
    currentChars = projected;
  });
  flush(paragraphs.length);
  return chunks;
}

function packSectionDrafts(parts: SectionDraft[], maxSectionChars: number, minSectionChars: number): SectionDraft[] {
  const packed: SectionDraft[] = [];
  let pending: SectionDraft | undefined;

  const pushPending = () => {
    if (!pending) return;
    if (pending.content.length > maxSectionChars) {
      for (const [index, chunk] of chunkLongText(pending.content, maxSectionChars).entries()) {
        packed.push({
          heading: `${pending.heading} ${index + 1}`,
          range: `${pending.range}.${index + 1}`,
          content: chunk,
        });
      }
    } else {
      packed.push(pending);
    }
    pending = undefined;
  };

  for (const part of parts) {
    if (!pending) {
      pending = part;
      continue;
    }
    const combinedContent = `${pending.content}\n\n${part.content}`.trim();
    if (pending.content.length < minSectionChars && combinedContent.length <= maxSectionChars) {
      pending = {
        heading: pending.heading === part.heading ? pending.heading : `${pending.heading} / ${part.heading}`,
        range: `${pending.range},${part.range}`,
        content: combinedContent,
      };
    } else {
      pushPending();
      pending = part;
    }
  }
  pushPending();
  return packed;
}

function chunkLongText(text: string, maxSectionChars: number): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += maxSectionChars) {
    chunks.push(text.slice(index, index + maxSectionChars).trim());
  }
  return chunks.filter(Boolean);
}

function stableSourceId(source: ProjectBoardSynthesisSource, index: number): string {
  if (source.id) return source.id;
  return stableBoardArtifactId("source", [source.path, source.title, source.kind, index]);
}

function sourceText(source: ProjectBoardSynthesisSource): string {
  return (source.excerpt?.trim() || source.summary.trim() || source.title.trim()).trim();
}
