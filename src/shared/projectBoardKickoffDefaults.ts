import type { ProjectBoardSource } from "./types";

export type ProjectBoardKickoffDefaultConfidence = "high" | "medium" | "low";

export function projectBoardKickoffDefaultContextFingerprint(input: {
  question: string;
  sources: ProjectBoardSource[];
}): string {
  const sources = input.sources
    .map((source) => {
      const includeInSynthesis = source.kind !== "ignored" && source.includeInSynthesis !== false && source.authorityRole !== "ignored";
      return {
        id: source.id,
        sourceKey: source.sourceKey ?? "",
        kind: source.kind,
        title: compactFingerprintText(source.title, 240),
        summary: compactFingerprintText(source.summary, 700),
        excerpt: compactFingerprintText(source.excerpt ?? "", 900),
        path: source.path ?? "",
        threadId: source.threadId ?? "",
        artifactId: source.artifactId ?? "",
        messageId: source.messageId ?? "",
        contentHash: source.contentHash ?? "",
        changeState: source.changeState ?? "",
        authorityRole: source.authorityRole ?? "",
        includeInSynthesis,
        relevance: Math.round(source.relevance),
      };
    })
    .sort((left, right) => {
      const leftKey = [left.includeInSynthesis ? "0" : "1", left.authorityRole, left.kind, left.path, left.threadId, left.artifactId, left.messageId, left.id].join(":");
      const rightKey = [right.includeInSynthesis ? "0" : "1", right.authorityRole, right.kind, right.path, right.threadId, right.artifactId, right.messageId, right.id].join(":");
      return leftKey.localeCompare(rightKey);
    });
  return stableHash(
    JSON.stringify({
      schemaVersion: 1,
      question: compactFingerprintText(input.question, 500),
      sources,
    }),
  );
}

function compactFingerprintText(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > limit ? normalized.slice(0, limit) : normalized;
}

function stableHash(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
    hash >>>= 0;
  }
  return `kickoff-default-v1:${hash.toString(16).padStart(8, "0")}:${value.length}`;
}
