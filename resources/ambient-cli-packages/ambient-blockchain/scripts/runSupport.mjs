import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

export function writeArtifact(kind, payload, options = {}) {
  const workspace = workspaceRoot();
  const artifactRoot = options.artifactDir
    ? requireWorkspacePath(String(options.artifactDir), "artifact directory")
    : resolve(workspace, ".ambient", "blockchain", kind);
  mkdirSync(artifactRoot, { recursive: true });
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  const artifactPath = join(artifactRoot, `${compactTimestamp(payload.generatedAt ?? nowIso())}-${sha256(body).slice(0, 10)}.json`);
  writeFileSync(artifactPath, body, "utf8");
  return {
    path: artifactPath,
    relativePath: toWorkspaceRelative(artifactPath),
    bytes: Buffer.byteLength(body, "utf8"),
    sha256: sha256(body),
  };
}

export function writeMarkdownArtifact(kind, payload, markdown, options = {}) {
  const workspace = workspaceRoot();
  const artifactRoot = options.artifactDir
    ? requireWorkspacePath(String(options.artifactDir), "artifact directory")
    : resolve(workspace, ".ambient", "blockchain", kind);
  mkdirSync(artifactRoot, { recursive: true });
  const body = `${markdown.trimEnd()}\n`;
  const artifactPath = join(artifactRoot, `${compactTimestamp(payload.generatedAt ?? nowIso())}-${sha256(body).slice(0, 10)}.md`);
  writeFileSync(artifactPath, body, "utf8");
  return {
    path: artifactPath,
    relativePath: toWorkspaceRelative(artifactPath),
    bytes: Buffer.byteLength(body, "utf8"),
    sha256: sha256(body),
  };
}

export function buildLiveGateEvidenceIndex(lanes) {
  const laneEvidence = lanes.map((lane) => {
    const artifacts = collectArtifactReferences(lane);
    const signatures = collectNamedStringValues(lane, new Set(["signature"]));
    const receipts = collectNamedStringValues(lane, new Set(["x-payment-receipt", "xPaymentReceipt", "receipt"]));
    const costs = laneCostSummary(lane);
    return {
      id: lane.id,
      status: lane.status,
      artifactCount: artifacts.length,
      artifacts,
      signatures,
      receipts,
      costs,
    };
  });
  return {
    schemaVersion: "ambient-blockchain-live-gate-evidence-index-v1",
    lanes: laneEvidence,
    totals: {
      lanes: laneEvidence.length,
      artifacts: laneEvidence.reduce((sum, lane) => sum + lane.artifactCount, 0),
      signatures: laneEvidence.reduce((sum, lane) => sum + lane.signatures.length, 0),
      receipts: laneEvidence.reduce((sum, lane) => sum + lane.receipts.length, 0),
    },
  };
}

function collectArtifactReferences(value) {
  const artifacts = [];
  const seen = new Set();
  walkJson(value, (entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;
    if (typeof entry.relativePath !== "string" || typeof entry.sha256 !== "string") return;
    const key = `${entry.relativePath}:${entry.sha256}`;
    if (seen.has(key)) return;
    seen.add(key);
    artifacts.push({
      relativePath: entry.relativePath,
      bytes: typeof entry.bytes === "number" ? entry.bytes : undefined,
      sha256: entry.sha256,
    });
  });
  return artifacts;
}

function collectNamedStringValues(value, names) {
  const values = [];
  const seen = new Set();
  walkJson(value, (entry, key) => {
    if (!names.has(String(key))) return;
    if (typeof entry !== "string" || entry.length === 0) return;
    if (seen.has(entry)) return;
    seen.add(entry);
    values.push(entry);
  });
  return values;
}

function walkJson(value, visit, key = "") {
  visit(value, key);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) walkJson(value[index], visit, String(index));
    return;
  }
  if (value && typeof value === "object") {
    for (const [entryKey, entryValue] of Object.entries(value)) walkJson(entryValue, visit, entryKey);
  }
}

function laneCostSummary(lane) {
  if (lane.id === "oracle-funded") {
    return compactObject({
      escrowLamports: lane.escrowLamports,
      maxLamports: lane.maxLamports,
      reclaimMaxLamports: lane.reclaimPlan?.parsed?.maxLamports,
    });
  }
  if (lane.id === "x402-funded") {
    return compactObject({
      maxLamports: lane.maxLamports,
      maxMicroUsdc: lane.maxMicroUsdc,
      httpStatus: lane.execution?.result?.httpStatus,
    });
  }
  if (lane.id === "program-workbench") {
    return compactObject({
      maxLamports: lane.deployPlan?.parsed?.maxLamports,
      binaryBytes: lane.binary?.bytes,
    });
  }
  return {};
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

export function buildLiveGateMarkdown(payload, jsonArtifact) {
  const rows = payload.lanes.map((lane) => `| ${markdownCell(lane.id)} | ${markdownCell(lane.status)} | ${markdownCell(lane.summary)} |`);
  const evidenceRows = payload.evidenceIndex.lanes.map(
    (lane) =>
      `| ${markdownCell(lane.id)} | ${lane.artifactCount} | ${lane.signatures.length} | ${lane.receipts.length} | ${markdownCell(JSON.stringify(lane.costs))} |`,
  );
  const skipReasons = payload.lanes.filter((lane) => lane.status === "skipped").map((lane) => `- ${lane.id}: ${lane.summary}`);
  const failures = payload.lanes.filter((lane) => isFailingLaneStatus(lane.status)).map((lane) => `- ${lane.id}: ${lane.summary}`);
  return [
    "# Ambient Blockchain Live Gate Evidence",
    "",
    `- Generated: ${payload.generatedAt}`,
    `- Status: ${payload.status}`,
    `- Package: ${payload.packageName}`,
    `- JSON artifact: ${jsonArtifact.relativePath}`,
    "",
    "## Lanes",
    "",
    "| Lane | Status | Summary |",
    "| --- | --- | --- |",
    ...rows,
    "",
    "## Evidence Index",
    "",
    "| Lane | Artifacts | Signatures | Receipts | Costs |",
    "| --- | ---: | ---: | ---: | --- |",
    ...evidenceRows,
    "",
    "## Failures",
    "",
    ...(failures.length ? failures : ["- None"]),
    "",
    "## Skip Reasons",
    "",
    ...(skipReasons.length ? skipReasons : ["- None"]),
    "",
    "## Redaction Facts",
    "",
    `- Keypair paths included: ${payload.redactionFacts.keypairPathsIncluded}`,
    `- Private key bytes included: ${payload.redactionFacts.privateKeyBytesIncluded}`,
    `- Secret values included: ${payload.redactionFacts.secretValuesIncluded}`,
    "",
    "## Contract Summary",
    "",
    `- Network: ${payload.contracts.network.name}`,
    `- Runtime: ${payload.contracts.network.runtime}`,
    `- Tool Oracle: ${payload.contracts.programs.toolOracle.programId}`,
    `- x402 endpoint: ${payload.contracts.x402.defaultEndpoint}`,
  ].join("\n");
}

function markdownCell(value) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ");
}

export function isFailingLaneStatus(status) {
  return ["failed", "blocked", "http_error", "rpc_error"].includes(String(status ?? ""));
}

export function workspaceRoot() {
  return resolve(process.env.AMBIENT_WORKSPACE_PATH ?? process.cwd());
}

export function requireWorkspacePath(value, label) {
  const absolute = resolve(workspaceRoot(), value);
  if (!isPathInside(workspaceRoot(), absolute)) {
    throw new Error(`${label} must stay inside the workspace.`);
  }
  return absolute;
}

export function isPathInside(parent, child) {
  const rel = relative(resolve(parent), resolve(child));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function toWorkspaceRelative(artifactPath) {
  return relative(workspaceRoot(), artifactPath).split(sep).join("/");
}

export function boundedPreview(value, maxChars) {
  const text = JSON.stringify(value ?? null, null, 2);
  return {
    truncated: text.length > maxChars,
    chars: text.length,
    text: text.length > maxChars ? text.slice(0, maxChars) : text,
  };
}

export function boundedTextPreview(value, maxChars) {
  const text = String(value ?? "");
  return {
    truncated: text.length > maxChars,
    chars: text.length,
    text: text.length > maxChars ? text.slice(0, maxChars) : text,
  };
}

export function selectedHeaders(headers) {
  const selected = {};
  for (const name of [
    "www-authenticate",
    "x-accept-payment",
    "x-payment-required",
    "x-payment-response",
    "x-payment-receipt",
    "x-request-id",
    "content-type",
  ]) {
    const value = headers.get(name);
    if (value) selected[name] = truncateText(value, 1_000);
  }
  return selected;
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function approvalDigest(value) {
  return sha256(stableJson(value));
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function compactTimestamp(iso) {
  return iso.replace(/\D/g, "").slice(0, 14);
}

export function nowIso() {
  return new Date().toISOString();
}

export function truncateText(text, maxChars) {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}...<truncated>`;
}

export function writeJson(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

export function errorMessage(error) {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause instanceof Error ? error.cause.message : undefined;
  return cause ? `${error.message}: ${cause}` : error.message;
}
