import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

export const allowedGitProtocols = ["file", "https", "ssh"] as const;

export interface SafeGitSource {
  input: string;
  cloneSource: string;
  kind: "local" | "remote";
}

const scpLikeGitSourcePattern = /^([A-Za-z0-9._-]+)@([A-Za-z0-9.-]+):([^\s\0]+)$/;

export function normalizeGitRepositoryUrl(value: string): string {
  const normalized = normalizeGitSourceString(value);
  const githubSsh = normalized.match(/^ssh:\/\/git@github\.com\/(.+)$/i);
  if (githubSsh) return stripGitSuffix(`https://github.com/${githubSsh[1]}`);
  const githubScp = normalized.match(/^git@github\.com:(.+)$/i);
  if (githubScp) return stripGitSuffix(`https://github.com/${githubScp[1]}`);
  return stripGitSuffix(normalized);
}

export function safeGitCloneSource(source: string): string {
  return validateGitSource(source).cloneSource;
}

export function redactGitSourceCredentials(source: string): string {
  const trimmed = source.trim();
  const hasGitPrefix = trimmed.startsWith("git+");
  const candidate = hasGitPrefix ? trimmed.slice("git+".length) : trimmed;
  try {
    const url = new URL(normalizeGitProtocol(candidate));
    const protocol = url.protocol.slice(0, -1).toLowerCase();
    let changed = false;
    if (url.protocol === "ssh:" && url.password) {
      url.password = "";
      changed = true;
    } else if (url.username || url.password) {
      url.username = "";
      url.password = "";
      changed = true;
    }
    if (url.search || url.hash) {
      url.search = "";
      url.hash = "";
      changed = true;
    }
    const displaySource = `${hasGitPrefix ? "git+" : ""}${url.toString()}`;
    if (!allowedGitProtocols.includes(protocol as (typeof allowedGitProtocols)[number])) {
      return redactCredentialUrlSubstrings(displaySource);
    }
    if (changed) return displaySource;
    return source;
  } catch {
    return redactCredentialUrlSubstrings(source);
  }
}

export function validateGitSource(source: string): SafeGitSource {
  const normalized = normalizeGitSourceString(source);
  if (!normalized) throw new Error("Git source is required.");
  if (/[\0\r\n]/.test(normalized)) throw new Error("Git source must not contain control characters.");
  if (normalized.startsWith("-")) throw new Error("Git source must not start with '-'.");
  if (/^(?:ext|git-remote-ext)::/i.test(normalized) || /^git\+?(?:ext|git-remote-ext)::/i.test(source.trim())) {
    throw unsupportedGitSourceError();
  }

  if (isRelativeLocalGitPath(normalized)) {
    throw new Error("Git local path sources must be absolute paths or file:// URLs.");
  }

  if (isAbsolute(normalized)) {
    return { input: source, cloneSource: normalized, kind: "local" };
  }

  const scpLike = normalized.match(scpLikeGitSourcePattern);
  if (scpLike) {
    const [, sshUser = "", sshHost = "", remotePath = ""] = scpLike;
    if (sshUser.startsWith("-") || sshHost.startsWith("-")) throw new Error("Git SSH source user and host must not start with '-'.");
    if (!remotePath || remotePath.startsWith("-")) throw new Error("Git SSH source path is invalid.");
    if (/[?#]/.test(remotePath)) throw new Error("Git SSH source path must not include query strings or fragments.");
    return { input: source, cloneSource: normalized, kind: "remote" };
  }

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw unsupportedGitSourceError();
  }
  const protocol = url.protocol.slice(0, -1).toLowerCase();
  if (!allowedGitProtocols.includes(protocol as (typeof allowedGitProtocols)[number])) {
    throw unsupportedGitSourceError();
  }
  if (protocol !== "file" && !url.hostname) throw new Error("Git URL source must include a host.");
  if (protocol === "https" && (url.username || url.password)) {
    throw new Error("Git HTTPS sources must not embed credentials.");
  }
  if (protocol === "ssh" && url.password) {
    throw new Error("Git SSH sources must not embed passwords or tokens.");
  }
  if (protocol === "ssh" && (url.username.startsWith("-") || url.hostname.startsWith("-"))) {
    throw new Error("Git SSH source user and host must not start with '-'.");
  }
  if (url.search || url.hash) {
    throw new Error("Git URL sources must not include query strings or fragments.");
  }
  if (protocol === "file") {
    return { input: source, cloneSource: fileURLToPath(url), kind: "local" };
  }
  return { input: source, cloneSource: normalized, kind: "remote" };
}

export function hardenedGitEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const next = { ...env };
  for (const key of Object.keys(next)) {
    if (key.startsWith("GIT_") || key === "SSH_ASKPASS") delete next[key];
  }
  const nullConfigPath = process.platform === "win32" ? "NUL" : "/dev/null";
  return {
    ...next,
    GIT_ALLOW_PROTOCOL: allowedGitProtocols.join(":"),
    GIT_CONFIG_GLOBAL: nullConfigPath,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_SYSTEM: nullConfigPath,
    GIT_PROTOCOL_FROM_USER: "0",
    GIT_SSH_COMMAND: "ssh -oBatchMode=yes",
    GIT_TERMINAL_PROMPT: "0",
  };
}

function normalizeGitSourceString(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("git+")) return normalizeGitProtocol(trimmed.slice("git+".length));
  return normalizeGitProtocol(trimmed);
}

function normalizeGitProtocol(source: string): string {
  if (/^git:\/\//i.test(source)) return `https://${source.slice("git://".length)}`;
  return source;
}

function isRelativeLocalGitPath(source: string): boolean {
  return source.startsWith("./") || source.startsWith("../");
}

function stripGitSuffix(value: string): string {
  return value.replace(/\.git$/i, "");
}

function redactCredentialUrlSubstrings(value: string): string {
  return value
    .replace(/([A-Za-z][A-Za-z0-9+.-]*:\/\/)([^/\s@]+)@/g, "$1")
    .replace(/([A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s?#]+)[?#][^\s]*/g, "$1")
    .replace(/(^|[\s("'`<])([A-Za-z0-9._-]+@[A-Za-z0-9.-]+:[^\s?#]+)[?#][^\s)"'`>]*/g, "$1$2")
    .replace(/([?&#][^=\s&#]*(?:token|secret|password|passwd|credential|api[_-]?key|key)[^=\s&#]*=)[^&#\s]+/gi, "$1[redacted]");
}

function unsupportedGitSourceError(): Error {
  return new Error(
    `Unsupported Git source. Use HTTPS, SSH, file://, or an explicit local path; external Git helper protocols are not allowed.`,
  );
}
