import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface McpAutowireCandidateRefStore {
  put(candidate: Record<string, unknown>, candidateHash?: string, reviewStatus?: McpAutowireCandidateRefReviewStatus): string;
  get(candidateRef: string): Record<string, unknown> | undefined;
  getReviewed(candidateRef: string): Record<string, unknown> | undefined;
  markReviewed(candidateRef: string, candidate?: Record<string, unknown>, candidateHash?: string): string;
}

export interface McpAutowireCandidateRefStoreOptions {
  storagePath?: string;
  maxEntries?: number;
  now?: () => string;
}

interface StoredCandidateRef {
  candidateRef: string;
  candidateHash: string;
  reviewStatus: McpAutowireCandidateRefReviewStatus;
  candidate: Record<string, unknown>;
  updatedAt: string;
}

export type McpAutowireCandidateRefReviewStatus = "planned" | "reviewed";

interface CandidateRefStoreFile {
  schemaVersion: 1;
  entries: StoredCandidateRef[];
}

export function createMcpAutowireCandidateRefStore(options: McpAutowireCandidateRefStoreOptions = {}): McpAutowireCandidateRefStore {
  const maxEntries = Math.max(1, Math.floor(options.maxEntries ?? 80));
  const now = options.now ?? (() => new Date().toISOString());
  const candidates = new Map<string, StoredCandidateRef>(
    readStoredCandidates(options.storagePath).map((entry) => [entry.candidateRef, entry]),
  );
  return {
    put(candidate, candidateHash, reviewStatus = "planned") {
      const hash = candidateHash || sha256Hex(stableJson(candidate));
      const id = typeof candidate.id === "string" && candidate.id.trim() ? candidate.id.trim() : "candidate";
      const ref = `ambient-mcp-candidate:${safeRefSegment(id)}:${hash.slice(0, 16)}`;
      candidates.set(ref, {
        candidateRef: ref,
        candidateHash: hash,
        reviewStatus,
        candidate,
        updatedAt: now(),
      });
      persistStoredCandidates(options.storagePath, [...candidates.values()].slice(-maxEntries));
      return ref;
    },
    get(candidateRef) {
      const stored = candidates.get(candidateRef);
      if (stored) return stored.candidate;
      const persisted = readStoredCandidates(options.storagePath).find((entry) => entry.candidateRef === candidateRef);
      if (!persisted) return undefined;
      candidates.set(candidateRef, persisted);
      return persisted.candidate;
    },
    getReviewed(candidateRef) {
      const stored = getStoredCandidate(candidateRef, candidates, options.storagePath);
      if (!stored) return undefined;
      candidates.set(candidateRef, stored);
      return stored.reviewStatus === "reviewed" ? stored.candidate : undefined;
    },
    markReviewed(candidateRef, candidate, candidateHash) {
      const existing = getStoredCandidate(candidateRef, candidates, options.storagePath);
      const reviewedCandidate = candidate ?? existing?.candidate;
      if (!reviewedCandidate) throw new Error(`No MCP autowire candidate is available for candidateRef ${candidateRef}.`);
      const hash = candidateHash || existing?.candidateHash || sha256Hex(stableJson(reviewedCandidate));
      const entry: StoredCandidateRef = {
        candidateRef,
        candidateHash: hash,
        reviewStatus: "reviewed",
        candidate: reviewedCandidate,
        updatedAt: now(),
      };
      candidates.set(candidateRef, entry);
      persistStoredCandidates(options.storagePath, [...candidates.values()].slice(-maxEntries));
      return candidateRef;
    },
  };
}

function getStoredCandidate(
  candidateRef: string,
  candidates: Map<string, StoredCandidateRef>,
  storagePath: string | undefined,
): StoredCandidateRef | undefined {
  const stored = candidates.get(candidateRef);
  if (stored) return stored;
  const persisted = readStoredCandidates(storagePath).find((entry) => entry.candidateRef === candidateRef);
  if (!persisted) return undefined;
  candidates.set(candidateRef, persisted);
  return persisted;
}

function readStoredCandidates(storagePath: string | undefined): StoredCandidateRef[] {
  if (!storagePath) return [];
  try {
    const parsed = JSON.parse(readFileSync(storagePath, "utf8")) as CandidateRefStoreFile;
    if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.entries)) return [];
    return parsed.entries.filter(isStoredCandidateRef).map((entry) => ({
      ...entry,
      reviewStatus: entry.reviewStatus === "reviewed" ? "reviewed" : "planned",
    }));
  } catch {
    return [];
  }
}

function persistStoredCandidates(storagePath: string | undefined, entries: StoredCandidateRef[]): void {
  if (!storagePath) return;
  const file: CandidateRefStoreFile = {
    schemaVersion: 1,
    entries,
  };
  mkdirSync(dirname(storagePath), { recursive: true, mode: 0o700 });
  const tempPath = `${storagePath}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  writeFileSync(tempPath, JSON.stringify(file, null, 2), { encoding: "utf8", mode: 0o600 });
  renameSync(tempPath, storagePath);
}

function isStoredCandidateRef(value: unknown): value is StoredCandidateRef {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as Partial<StoredCandidateRef>;
  return typeof entry.candidateRef === "string"
    && entry.candidateRef.startsWith("ambient-mcp-candidate:")
    && typeof entry.candidateHash === "string"
    && (entry.reviewStatus === undefined || entry.reviewStatus === "planned" || entry.reviewStatus === "reviewed")
    && !!entry.candidate
    && typeof entry.candidate === "object"
    && !Array.isArray(entry.candidate)
    && typeof entry.updatedAt === "string";
}

function safeRefSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "candidate";
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  if (!value || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
}
