import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const SECRETISH_PATTERN = /(^|[/_.-])(?:api[_-]?key|secret|token|credential|password|passwd|auth|\.env)(?:[/_.-]|$)/i;
const GENERATED_OR_NOISY_ENTRIES = new Set([".git", ".ambient-codex", "node_modules", "out", "build", "release", "test-results"]);
const MAX_SCAN_FILES = 500;
const MAX_HASH_BYTES = 2 * 1024 * 1024;
const MAX_PREVIEW_CHARS = 4000;

export async function snapshotHarnessWorkspace(root, options = {}) {
  if (!root) return { root, files: {}, omitted: { secretLike: 0, noisy: 0, limit: 0, errors: 0 } };
  const omitted = { secretLike: 0, noisy: 0, limit: 0, errors: 0 };
  const files = {};
  await scanDirectory(root, "", files, omitted, options.maxFiles ?? MAX_SCAN_FILES);
  return { root, files, omitted };
}

export async function diffHarnessWorkspaceSnapshot(before, root) {
  const after = await snapshotHarnessWorkspace(root);
  const changes = [];
  const beforeFiles = before?.files ?? {};
  const paths = [...new Set([...Object.keys(beforeFiles), ...Object.keys(after.files)])].sort();
  for (const path of paths) {
    const previous = beforeFiles[path];
    const current = after.files[path];
    if (!previous && current) changes.push({ path, status: "added", ...summaryFields(current) });
    else if (previous && !current) changes.push({ path, status: "deleted", ...summaryFields(previous) });
    else if (previous && current && !sameFileSnapshot(previous, current)) {
      changes.push({ path, status: "modified", before: summaryFields(previous), after: summaryFields(current) });
    }
  }
  return { root, changes, beforeOmitted: before?.omitted, afterOmitted: after.omitted };
}

export async function writeHarnessTraceArtifacts(input) {
  const traceDir = input.traceDir || process.env.AMBIENT_HARNESS_TRACE_DIR;
  if (!traceDir) return undefined;
  await mkdir(traceDir, { recursive: true });

  const redactor = createTraceRedactor(process.env);
  const written = [];
  const messages = Array.isArray(input.messages) ? input.messages.map((message) => sanitizeMessage(message, redactor)) : [];
  if (messages.length) {
    await writeFile(join(traceDir, "messages.jsonl"), `${messages.map((message) => JSON.stringify(message)).join("\n")}\n`, "utf8");
    written.push("messages.jsonl");
  }

  const toolTranscript = buildToolTranscript(messages);
  if (toolTranscript) {
    await writeFile(join(traceDir, "tool-transcript.txt"), toolTranscript, "utf8");
    written.push("tool-transcript.txt");
  }

  if (Array.isArray(input.events) && input.events.length) {
    const events = input.events.map((event) => sanitizeEvent(event, redactor));
    await writeFile(join(traceDir, "events.jsonl"), `${events.map((event) => JSON.stringify(event)).join("\n")}\n`, "utf8");
    written.push("events.jsonl");
  }

  let workspaceDiff = input.workspaceDiff;
  if (input.workspace || workspaceDiff) {
    workspaceDiff = workspaceDiff ?? (input.beforeWorkspace ? await diffHarnessWorkspaceSnapshot(input.beforeWorkspace, input.workspace) : undefined);
    if (workspaceDiff) {
      await writeJson(join(traceDir, "changed-files.json"), workspaceDiff);
      written.push("changed-files.json");
    }
  }

  const preview = {
    version: 1,
    summary: input.summary ? sanitizeJson(input.summary, redactor) : undefined,
    messageCount: messages.length,
    toolMessageCount: messages.filter((message) => message.role === "tool").length,
    toolNames: [...new Set(messages.map((message) => message.metadata?.toolName).filter((value) => typeof value === "string" && value))],
    assistantTail: tail(
      messages
        .filter((message) => message.role === "assistant")
        .map((message) => message.content)
        .join("\n"),
      MAX_PREVIEW_CHARS,
    ),
    changedFiles: workspaceDiff?.changes ?? undefined,
    artifacts: written,
  };
  await writeJson(join(traceDir, "trace-preview.json"), preview);
  written.push("trace-preview.json");
  return { traceDir, artifacts: written, preview };
}

export function createTraceRedactor(env = process.env) {
  const secretValues = [env.AMBIENT_API_KEY, env.AMBIENT_AGENT_AMBIENT_API_KEY, env.GMI_CLOUD_API_KEY, env.GMI_API_KEY]
    .filter((value) => typeof value === "string" && value.length >= 8)
    .sort((left, right) => right.length - left.length);
  return (value) => redactTraceText(value, secretValues);
}

export function redactTraceText(value, secretValues = []) {
  let next = String(value ?? "");
  for (const secret of secretValues) next = next.split(secret).join("[redacted secret]");
  next = next.replace(/([A-Z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)[A-Z0-9_]*=)([^\s"';&]+)/gi, "$1[redacted]");
  next = next.replace(/(Authorization:\s*Bearer\s+)([A-Za-z0-9._~+/-]+)/gi, "$1[redacted]");
  return next;
}

async function scanDirectory(root, subdir, files, omitted, maxFiles) {
  let entries;
  try {
    entries = await readdir(join(root, subdir), { withFileTypes: true });
  } catch {
    omitted.errors += 1;
    return;
  }
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (Object.keys(files).length >= maxFiles) {
      omitted.limit += 1;
      return;
    }
    const path = subdir ? `${subdir}/${entry.name}` : entry.name;
    if (isSecretLikePath(path)) {
      omitted.secretLike += 1;
      continue;
    }
    if (GENERATED_OR_NOISY_ENTRIES.has(entry.name)) {
      omitted.noisy += 1;
      continue;
    }
    if (entry.isDirectory()) await scanDirectory(root, path, files, omitted, maxFiles);
    else if (entry.isFile()) files[path] = await fileSnapshot(root, path, omitted);
  }
}

async function fileSnapshot(root, path, omitted) {
  try {
    const absolutePath = join(root, path);
    const info = await stat(absolutePath);
    if (info.size > MAX_HASH_BYTES) return { bytes: info.size, sha256: undefined, hashTruncated: true };
    const content = await readFile(absolutePath);
    return { bytes: info.size, sha256: createHash("sha256").update(content).digest("hex"), hashTruncated: false };
  } catch {
    omitted.errors += 1;
    return { bytes: undefined, sha256: undefined, hashTruncated: true };
  }
}

function isSecretLikePath(path) {
  return SECRETISH_PATTERN.test(path.replace(/\\/g, "/"));
}

function sameFileSnapshot(left, right) {
  return left.bytes === right.bytes && left.sha256 === right.sha256 && left.hashTruncated === right.hashTruncated;
}

function summaryFields(file) {
  return {
    bytes: file.bytes,
    sha256: file.sha256,
    hashTruncated: file.hashTruncated,
  };
}

function sanitizeMessage(message, redactor) {
  return {
    id: stringOrUndefined(message?.id),
    role: stringOrUndefined(message?.role),
    status: stringOrUndefined(message?.status),
    content: redactor(message?.content ?? ""),
    metadata: sanitizeJson(message?.metadata ?? {}, redactor),
  };
}

function sanitizeEvent(event, redactor) {
  return sanitizeJson(event, redactor);
}

function sanitizeJson(value, redactor) {
  if (typeof value === "string") return redactor(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeJson(item, redactor));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [redactor(key), sanitizeJson(item, redactor)]));
}

function buildToolTranscript(messages) {
  const toolMessages = messages.filter((message) => message.role === "tool");
  if (!toolMessages.length) return "";
  return `${toolMessages
    .map((message) => [`# ${message.metadata?.toolName ?? "tool"} ${message.id ? `(${message.id})` : ""}`.trim(), message.content ?? ""].join("\n"))
    .join("\n\n---\n\n")}\n`;
}

function tail(value, maxChars) {
  const text = String(value ?? "");
  return text.length <= maxChars ? text : text.slice(-maxChars);
}

function stringOrUndefined(value) {
  if (value === undefined || value === null) return undefined;
  return String(value);
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
