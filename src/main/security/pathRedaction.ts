import { createHash } from "node:crypto";
import { basename } from "node:path";
import { isEnvTemplatePath } from "../../shared/pathSensitivity";

export interface SensitivePathRef {
  ref: string;
  kind: "sensitive-path";
  hint: string;
}

export interface SensitivePathRedactionResult {
  text: string;
  redacted: boolean;
  replacementCount: number;
  refs: SensitivePathRef[];
}

const sensitivePathPattern = /(^|[/_.-])(?:api[-_]?keys?|gmicloud-api-key|secrets?|credentials?|passwords?|passwd|auth|\.env|tokens?)([/_.-]|$)/i;
const sensitivePathHintPattern = /api[-_]?keys?|gmicloud-api-key|secrets?|credentials?|tokens?|passwords?|passwd|auth|\.env/i;

export function isSensitivePathAliasCandidate(path: string): boolean {
  if (isEnvTemplatePath(path)) return false;
  return sensitivePathPattern.test(normalizePathForAlias(path));
}

export function sensitivePathRef(path: string): SensitivePathRef {
  const normalized = normalizePathForAlias(path);
  const digest = createHash("sha256").update(normalized).digest("hex").slice(0, 16);
  return {
    ref: `sensitive-path-ref:v1:${digest}`,
    kind: "sensitive-path",
    hint: pathHint(path),
  };
}

export function sensitivePathAliasForDisplay(path: string): string {
  return `<${sensitivePathRef(path).ref}>`;
}

export function redactSensitivePathsInText(value: string): SensitivePathRedactionResult {
  const refs = new Map<string, SensitivePathRef>();
  let replacementCount = 0;
  const quoted = redactQuotedSensitivePathSpans(value, refs);
  replacementCount += quoted.replacementCount;
  const parts = quoted.text.split(/(\s+)/);
  const text = parts.map((token) => {
    if (!sensitivePathHintPattern.test(token)) return token;
    const redacted = redactSensitivePathToken(token, refs);
    replacementCount += redacted.replacementCount;
    return redacted.text;
  }).join("");
  return {
    text,
    redacted: replacementCount > 0,
    replacementCount,
    refs: [...refs.values()],
  };
}

function redactQuotedSensitivePathSpans(
  value: string,
  refs: Map<string, SensitivePathRef>,
): { text: string; replacementCount: number } {
  let replacementCount = 0;
  const text = value.replace(/(["'`])([^"'`\r\n]*?)(\1)/g, (match, openQuote: string, candidate: string, closeQuote: string) => {
    if (!sensitivePathHintPattern.test(candidate) || !looksLikeStandaloneQuotedPath(candidate) || !shouldAliasPathCandidate(candidate)) {
      return match;
    }
    const ref = sensitivePathRef(candidate);
    refs.set(ref.ref, ref);
    replacementCount += 1;
    return `${openQuote}<${ref.ref}>${closeQuote}`;
  });
  return { text, replacementCount };
}

function normalizePathForAlias(path: string): string {
  return path.trim().replace(/\\/g, "/").replace(/\/+/g, "/");
}

function pathHint(path: string): string {
  const base = basename(normalizePathForAlias(path));
  if (base.startsWith(".env")) return "env-file";
  if (/api[-_]?key/i.test(base)) return "api-key-file";
  if (/token/i.test(base)) return "token-file";
  if (/credential/i.test(base)) return "credential-path";
  if (/password|passwd/i.test(base)) return "password-path";
  if (/secret/i.test(base)) return "secret-path";
  return "sensitive-path";
}

function looksLikePathToken(token: string): boolean {
  return token.includes("/") ||
    token.includes("\\") ||
    token.startsWith(".") ||
    token.startsWith("~") ||
    /\.[A-Za-z0-9_-]+$/.test(token);
}

function stripTokenPunctuation(token: string): string {
  return token.replace(/^[([{'"`]+/g, "").replace(/[)\]},.;:'"`]+$/g, "");
}

function pathCandidateFromToken(token: string): string | undefined {
  const candidate = stripTokenPunctuation(token);
  const equalsIndex = candidate.lastIndexOf("=");
  const valueCandidate = equalsIndex >= 0 ? candidate.slice(equalsIndex + 1) : candidate;
  const pathCandidate = stripTokenPunctuation(valueCandidate);
  return pathCandidate || undefined;
}

function redactSensitivePathToken(
  token: string,
  refs: Map<string, SensitivePathRef>,
): { text: string; replacementCount: number } {
  let replacementCount = 0;
  const text = token.replace(/([:=]["']?)([^"',}\]\s;]+)/g, (match, prefix: string, valueCandidate: string, offset: number) => {
    if (isUriSchemeSeparator(token, offset) || isWindowsDriveSeparator(token, offset)) return match;
    const candidate = stripTokenPunctuation(valueCandidate);
    if (!shouldAliasPathCandidate(candidate)) return match;
    const ref = sensitivePathRef(candidate);
    refs.set(ref.ref, ref);
    replacementCount += 1;
    return `${prefix}${valueCandidate.replace(candidate, `<${ref.ref}>`)}`;
  });
  if (replacementCount > 0) return { text, replacementCount };

  const candidate = pathCandidateFromToken(token);
  if (!candidate || isUriLikeToken(candidate) || !shouldAliasPathCandidate(candidate)) {
    return { text: token, replacementCount: 0 };
  }
  const ref = sensitivePathRef(candidate);
  refs.set(ref.ref, ref);
  return {
    text: token.replace(candidate, `<${ref.ref}>`),
    replacementCount: 1,
  };
}

function shouldAliasPathCandidate(candidate: string): boolean {
  return looksLikePathToken(candidate) && isSensitivePathAliasCandidate(candidate);
}

function looksLikeStandaloneQuotedPath(candidate: string): boolean {
  const trimmed = candidate.trim();
  if (!trimmed || /[;&|<>]/.test(trimmed) || isUriLikeToken(trimmed)) return false;
  return trimmed.startsWith("/") ||
    trimmed.startsWith("\\") ||
    trimmed.startsWith(".") ||
    trimmed.startsWith("~") ||
    /^[A-Za-z]:[\\/]/.test(trimmed);
}

function isUriLikeToken(candidate: string): boolean {
  return /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(candidate);
}

function isUriSchemeSeparator(token: string, separatorOffset: number): boolean {
  return token.slice(separatorOffset, separatorOffset + 3) === "://" &&
    /^[A-Za-z][A-Za-z0-9+.-]*$/.test(token.slice(0, separatorOffset));
}

function isWindowsDriveSeparator(token: string, separatorOffset: number): boolean {
  return separatorOffset === 1 && /^[A-Za-z]:[\\/]/.test(token.slice(0, 3));
}
