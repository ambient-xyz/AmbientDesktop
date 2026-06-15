import { createHash } from "node:crypto";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import type {
  PlannerDecisionQuestion,
  PlannerDiagramKind,
  PlannerDiagramSpec,
  PlannerDurableArtifactValidationIssue,
  PlannerDurableArtifactValidationResult,
  PlannerPlanArtifact,
  PlannerPlanStep,
} from "../shared/types";

export interface PlannerDurableHtmlInput {
  artifact: PlannerPlanArtifact;
  threadTitle: string;
  workspacePath: string;
  generatedAt?: Date;
  browserValidator?: PlannerDurableHtmlBrowserValidator;
  diagramMode?: PlannerDurableDiagramMode;
  validationWarnings?: PlannerDurableArtifactValidationIssue[];
  relativePath?: string;
}

export interface PlannerDurableHtmlResult {
  relativePath: string;
  absolutePath: string;
  manifestRelativePath: string;
  contentSha256: string;
  generatedAt: string;
  byteSize: number;
  validation: PlannerDurableArtifactValidationResult;
}

export interface PlannerDurableHtmlManifest {
  schemaVersion: 1;
  artifactId: string;
  threadId: string;
  sourceMessageId: string;
  title: string;
  htmlPath: string;
  contentSha256: string;
  byteSize: number;
  generatedAt: string;
  validation: PlannerDurableArtifactValidationResult;
}

export type PlannerDurableHtmlBrowserValidator = (input: {
  html: string;
  absolutePath: string;
  relativePath: string;
  staticValidation: PlannerDurableArtifactValidationResult;
}) => Promise<PlannerDurableArtifactValidationResult>;

export type PlannerDurableDiagramMode = "provided" | "deterministic";

export class PlannerDurableHtmlValidationError extends Error {
  constructor(readonly validation: PlannerDurableArtifactValidationResult) {
    super(
      `Durable planner HTML failed validation: ${validation.errors
        .map((issue) => issue.code)
        .join(", ")}`,
    );
    this.name = "PlannerDurableHtmlValidationError";
  }
}

const plannerDurableContentSecurityPolicy = [
  "default-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
  "script-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src 'self'",
  "font-src 'none'",
  "connect-src 'none'",
  "media-src 'none'",
].join("; ");

export async function writePlannerDurableHtmlArtifact(input: PlannerDurableHtmlInput): Promise<PlannerDurableHtmlResult> {
  const generatedDate = input.generatedAt ?? new Date();
  const generatedAt = generatedDate.toISOString();
  const relativePath = input.relativePath
    ? assertManagedDurablePlanRelativePath(input.relativePath)
    : uniqueDurablePlanRelativePath(input.workspacePath, input.threadTitle, generatedDate);
  const absolutePath = join(input.workspacePath, relativePath);
  const html = renderPlannerDurableHtml({
    artifact: input.artifact,
    threadTitle: input.threadTitle,
    generatedAt,
    diagramMode: input.diagramMode,
  });
  const staticValidation = validatePlannerDurableHtml(html);
  if (!staticValidation.ok) {
    throw new PlannerDurableHtmlValidationError(staticValidation);
  }
  await mkdir(dirname(absolutePath), { recursive: true });
  const candidateAbsolutePath = `${absolutePath}.${process.pid}-${Date.now()}.candidate.html`;
  await writeFile(candidateAbsolutePath, html, "utf8");
  let validation: PlannerDurableArtifactValidationResult;
  try {
    const validated = input.browserValidator
      ? mergePlannerDurableValidationResults(
          staticValidation,
          await input.browserValidator({
            html,
            absolutePath: candidateAbsolutePath,
            relativePath,
            staticValidation,
          }),
        )
      : staticValidation;
    validation = input.validationWarnings?.length
      ? mergePlannerDurableValidationResults(validated, {
          ok: true,
          checkedAt: validated.checkedAt,
          errors: [],
          warnings: input.validationWarnings,
        })
      : validated;
  } catch (error) {
    await rm(candidateAbsolutePath, { force: true });
    throw error;
  }
  if (!validation.ok) {
    await rm(candidateAbsolutePath, { force: true });
    throw new PlannerDurableHtmlValidationError(validation);
  }
  await rename(candidateAbsolutePath, absolutePath);
  const fileStat = await stat(absolutePath);
  const contentSha256 = createHash("sha256").update(html).digest("hex");
  const manifestRelativePath = durablePlanManifestRelativePath(relativePath);
  const manifest: PlannerDurableHtmlManifest = {
    schemaVersion: 1,
    artifactId: input.artifact.id,
    threadId: input.artifact.threadId,
    sourceMessageId: input.artifact.sourceMessageId,
    title: input.artifact.title,
    htmlPath: relativePath,
    contentSha256,
    byteSize: fileStat.size,
    generatedAt,
    validation,
  };
  await writeFile(join(input.workspacePath, manifestRelativePath), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return {
    relativePath,
    absolutePath,
    manifestRelativePath,
    contentSha256,
    generatedAt,
    byteSize: fileStat.size,
    validation,
  };
}

export function renderPlannerDurableHtml(input: {
  artifact: PlannerPlanArtifact;
  threadTitle: string;
  generatedAt: string;
  diagramMode?: PlannerDurableDiagramMode;
}): string {
  const { artifact } = input;
  const decisions = artifact.decisionQuestions.filter((question) => question.answer);
  const unansweredRequired = artifact.decisionQuestions.filter((question) => question.required && !question.answer);
  const title = artifact.title.trim() || input.threadTitle.trim() || "Durable Plan";
  const diagrams = plannerDurableDiagramSpecs(artifact, input.diagramMode ?? "provided");
  const architectureDiagram = diagramForKind(diagrams, "architecture");
  const dependencyDiagram = diagramForKind(diagrams, "dependencies");
  const programFlowDiagram = diagramForKind(diagrams, "program_flow");
  const concernsDiagram = diagramForKind(diagrams, "functional_nonfunctional");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="${plannerDurableContentSecurityPolicy}">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} - Durable Plan</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: #f7f9fb;
      --panel: #ffffff;
      --text: #17202a;
      --muted: #5e6b76;
      --line: #dbe4ea;
      --accent: #2f80a8;
      --accent-soft: #e8f4f8;
      --warn: #946200;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #10161c;
        --panel: #161f27;
        --text: #edf4f8;
        --muted: #a7b4bf;
        --line: #2b3a45;
        --accent: #7dc7e6;
        --accent-soft: #18313c;
        --warn: #f2c15f;
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main {
      width: min(1080px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 32px 0 48px;
    }
    header, section {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 16px;
    }
    h1, h2, h3 { line-height: 1.2; margin: 0 0 10px; }
    h1 { font-size: 30px; }
    h2 { font-size: 19px; }
    h3 { font-size: 15px; }
    p { margin: 0 0 10px; }
    ul, ol { margin: 8px 0 0; padding-left: 22px; }
    li { margin: 5px 0; }
    code, pre {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
    }
    pre {
      white-space: pre-wrap;
      word-break: break-word;
      background: color-mix(in srgb, var(--accent-soft), transparent 30%);
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 12px;
      overflow: auto;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
      color: var(--muted);
      font-size: 12px;
    }
    .pill {
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 3px 8px;
      background: var(--accent-soft);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 12px;
    }
    .card {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      background: color-mix(in srgb, var(--panel), var(--accent-soft) 18%);
    }
    .muted { color: var(--muted); }
    .warning { color: var(--warn); }
    svg {
      display: block;
      width: 100%;
      height: auto;
      max-width: 100%;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
    }
    .svg-text { fill: var(--text); font: 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .svg-muted { fill: var(--muted); font: 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .svg-box { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.5; }
    .svg-line { stroke: var(--accent); stroke-width: 1.5; marker-end: url(#arrow); }
    .diagram-block { display: grid; gap: 8px; }
    .diagram-summary { color: var(--muted); font-size: 13px; }
    .diagram-meta { color: var(--muted); font-size: 12px; margin-top: 6px; }
    a { color: var(--accent); }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(artifact.summary || "Durable planning artifact generated by Ambient.")}</p>
      <div class="meta">
        <span class="pill">Thread: ${escapeHtml(input.threadTitle || artifact.threadId)}</span>
        <span class="pill">Generated: ${escapeHtml(input.generatedAt)}</span>
        <span class="pill">Source message: ${escapeHtml(artifact.sourceMessageId)}</span>
      </div>
    </header>

    <section id="executive-summary">
      <h2>Executive Summary</h2>
      <p>${escapeHtml(artifact.summary || firstNonEmptyLine(artifact.content) || "No summary was provided.")}</p>
    </section>

    <section id="key-decisions">
      <h2>Key Decisions</h2>
      ${decisions.length ? `<ul>${decisions.map((question) => `<li>${escapeHtml(question.question)}: <strong>${escapeHtml(plannerDecisionAnswerText(question) ?? "Answered")}</strong></li>`).join("")}</ul>` : `<p class="muted">No explicit planner decisions were answered for this artifact.</p>`}
      ${unansweredRequired.length ? `<p class="warning">Required unanswered decisions remain: ${escapeHtml(unansweredRequired.map((question) => question.question).join("; "))}</p>` : ""}
    </section>

    <section id="implementation-phases">
      <h2>Implementation Phases</h2>
      ${artifact.steps.length ? `<ol>${artifact.steps.map((step) => `<li><strong>${escapeHtml(step.title)}</strong>${step.detail ? `<br><span class="muted">${escapeHtml(step.detail)}</span>` : ""}</li>`).join("")}</ol>` : `<p class="muted">No structured implementation phases were extracted.</p>`}
    </section>

    <section id="architecture">
      <h2>Architecture</h2>
      ${renderPlannerDiagramBlock(architectureDiagram, "section-architecture")}
    </section>

    <section id="dependencies">
      <h2>Dependencies</h2>
      <p>${escapeHtml(dependencySummary(artifact))}</p>
      ${renderPlannerDiagramBlock(dependencyDiagram, "section-dependencies")}
    </section>

    <section id="program-flow">
      <h2>Program Flow</h2>
      ${renderPlannerDiagramBlock(programFlowDiagram, "section-program-flow")}
      ${phaseTimelineSvg(artifact.steps)}
    </section>

    <section id="functional-concerns">
      <h2>Functional Concerns</h2>
      ${artifact.openQuestions.length ? `<ul>${artifact.openQuestions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : `<p class="muted">No unresolved functional questions were extracted.</p>`}
      ${renderPlannerDiagramBlock(concernsDiagram, "section-concerns")}
    </section>

    <section id="non-functional-concerns">
      <h2>Non-Functional Concerns</h2>
      ${artifact.risks.length ? `<ul>${artifact.risks.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : `<p class="muted">No explicit risks were extracted.</p>`}
    </section>

    <section id="risks-and-mitigations">
      <h2>Risks And Mitigations</h2>
      ${riskVerificationSvg(artifact.risks, artifact.verification)}
    </section>

    <section id="verification-plan">
      <h2>Verification Plan</h2>
      ${artifact.verification.length ? `<ul>${artifact.verification.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : `<p class="muted">No verification plan was extracted.</p>`}
    </section>

    <section id="open-questions">
      <h2>Open Questions</h2>
      ${artifact.openQuestions.length ? `<ul>${artifact.openQuestions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : `<p class="muted">No open questions remain in the structured plan.</p>`}
    </section>

    <section id="diagram-gallery">
      <h2>Diagram Gallery</h2>
      <div class="grid">
        ${diagrams.map((diagram, index) => `<div class="card">${renderPlannerDiagramBlock(diagram, `gallery-${index + 1}`)}</div>`).join("")}
        <div class="card">
          <h3>Phase Timeline</h3>
          ${phaseTimelineSvg(artifact.steps)}
        </div>
        <div class="card">
          <h3>Decision Summary</h3>
          ${decisionSummarySvg(artifact.decisionQuestions)}
        </div>
        <div class="card">
          <h3>Risk And Verification Flow</h3>
          ${riskVerificationSvg(artifact.risks, artifact.verification)}
        </div>
      </div>
    </section>

    <section id="source-plan">
      <h2>Source Plan</h2>
      <pre>${escapeHtml(artifact.content)}</pre>
    </section>
  </main>
</body>
</html>
`;
}

const requiredPlannerDurableSections = [
  "executive-summary",
  "key-decisions",
  "implementation-phases",
  "architecture",
  "dependencies",
  "program-flow",
  "functional-concerns",
  "non-functional-concerns",
  "risks-and-mitigations",
  "verification-plan",
  "open-questions",
  "diagram-gallery",
  "source-plan",
] as const;

const requiredPlannerDurableDiagramLabels = ["Architecture", "Dependencies", "Program Flow", "Functional And Non-Functional Concerns"] as const;

export function validatePlannerDurableHtml(html: string, checkedAt = new Date()): PlannerDurableArtifactValidationResult {
  const errors: PlannerDurableArtifactValidationIssue[] = [];
  const warnings: PlannerDurableArtifactValidationIssue[] = [];
  if (!/^\s*<!doctype html>/i.test(html)) {
    errors.push({ code: "html-missing-doctype", message: "Durable plan HTML must start with a doctype." });
  }
  if (/<script\b/i.test(html)) {
    errors.push({ code: "script-tag", message: "Durable plan HTML must not include script tags." });
  }
  if (/<(?:iframe|object|embed|link)\b/i.test(html)) {
    errors.push({ code: "external-embed", message: "Durable plan HTML must not include embedded external document or stylesheet elements." });
  }
  const cspMeta = html.match(/<meta\b[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/i)?.[0];
  if (!cspMeta) {
    errors.push({ code: "csp-missing", message: "Durable plan HTML must include an explicit Content-Security-Policy meta tag." });
  } else {
    if (!/\bscript-src\s+'none'/i.test(cspMeta)) {
      errors.push({ code: "csp-script-src-not-none", message: "Durable plan CSP must disable script execution with script-src 'none'." });
    }
    if (/\bunsafe-eval\b/i.test(cspMeta)) {
      errors.push({ code: "csp-unsafe-eval", message: "Durable plan CSP must not allow unsafe-eval." });
    }
    if (/\bframe-ancestors\b/i.test(cspMeta)) {
      errors.push({ code: "csp-frame-ancestors-meta", message: "Durable plan CSP meta tags must not include frame-ancestors because browsers ignore it and log an error." });
    }
  }
  if (/@import\b/i.test(html)) {
    errors.push({ code: "css-import", message: "Durable plan CSS must not import external stylesheets." });
  }
  for (const tag of html.match(/<[^!][^>]*>/g) ?? []) {
    if (/\son[a-z]+\s*=/i.test(tag)) {
      errors.push({ code: "event-handler-attribute", message: "Durable plan HTML must not include event handler attributes." });
      break;
    }
  }
  if (/<[^>]+\s(?:src|href|xlink:href)\s*=\s*["']\s*(?:https?:|data:|javascript:)/i.test(html)) {
    errors.push({ code: "unsafe-url-attribute", message: "Durable plan HTML must not load remote, data, or JavaScript URLs." });
  }
  if (/url\(\s*['"]?\s*(?:https?:|data:|javascript:)/i.test(html)) {
    errors.push({ code: "unsafe-css-url", message: "Durable plan CSS must not reference remote, data, or JavaScript URLs." });
  }
  if (/\bambient-planner-questions\b/i.test(html)) {
    errors.push({
      code: "native-question-block-leaked",
      section: "source-plan",
      message: "Durable plan HTML must not contain raw ambient-planner-questions markers; native planner decisions must be extracted before durable generation.",
    });
  }

  for (const sectionId of requiredPlannerDurableSections) {
    if (!new RegExp(`<section\\b[^>]*\\bid=["']${escapeRegExp(sectionId)}["']`, "i").test(html)) {
      errors.push({ code: "missing-section", section: sectionId, message: `Durable plan is missing the ${sectionId} section.` });
    }
  }
  for (const label of requiredPlannerDurableDiagramLabels) {
    if (!html.includes(escapeHtml(label)) && !html.includes(label)) {
      warnings.push({ code: "missing-required-diagram-label", section: "diagram-gallery", message: `Durable plan did not include a ${label} diagram label.` });
    }
  }

  const svgMatches = [...html.matchAll(/<svg\b([^>]*)>([\s\S]*?)<\/svg>/gi)];
  if (!svgMatches.length) {
    errors.push({ code: "svg-missing", section: "diagram-gallery", message: "Durable plan must include at least one inline SVG diagram." });
  }
  svgMatches.forEach((match, index) => {
    const attributes = match[1] ?? "";
    const body = match[2] ?? "";
    const section = `svg-${index + 1}`;
    if (!/\brole=["']img["']/i.test(attributes)) {
      errors.push({ code: "svg-missing-img-role", section, message: "Inline SVG diagrams must use role=\"img\"." });
    }
    if (!/\bviewBox=["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*["']/i.test(attributes)) {
      errors.push({ code: "svg-missing-viewbox", section, message: "Inline SVG diagrams must include a non-empty viewBox." });
    } else {
      const viewBox = attributes.match(/\bviewBox=["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*["']/i);
      const width = Number(viewBox?.[1] ?? 0);
      const height = Number(viewBox?.[2] ?? 0);
      if (!(width > 0 && height > 0)) {
        errors.push({ code: "svg-zero-viewbox", section, message: "Inline SVG diagrams must have positive viewBox dimensions." });
      }
    }
    if (!/<title\b[^>]*>[\s\S]*?<\/title>/i.test(body) || !/<desc\b[^>]*>[\s\S]*?<\/desc>/i.test(body)) {
      errors.push({ code: "svg-missing-accessible-label", section, message: "Inline SVG diagrams must include title and desc elements." });
    }
    if (!/<(?:rect|circle|line|path|text|polyline|polygon|ellipse)\b/i.test(body)) {
      errors.push({ code: "svg-empty", section, message: "Inline SVG diagrams must include visible diagram elements." });
    }
    if (/<script\b|\son[a-z]+\s*=|(?:href|xlink:href)\s*=\s*["']\s*(?:https?:|data:|javascript:)/i.test(body)) {
      errors.push({ code: "svg-unsafe-content", section, message: "Inline SVG diagrams must not include scripts, event handlers, or unsafe links." });
    }
  });

  return {
    ok: errors.length === 0,
    checkedAt: checkedAt.toISOString(),
    errors,
    warnings,
  };
}

export function mergePlannerDurableValidationResults(
  first: PlannerDurableArtifactValidationResult,
  second: PlannerDurableArtifactValidationResult,
): PlannerDurableArtifactValidationResult {
  return {
    ok: first.ok && second.ok,
    checkedAt: second.checkedAt || first.checkedAt,
    errors: dedupePlannerDurableIssues([...first.errors, ...second.errors]),
    warnings: dedupePlannerDurableIssues([...first.warnings, ...second.warnings]),
  };
}

function dedupePlannerDurableIssues(issues: PlannerDurableArtifactValidationIssue[]): PlannerDurableArtifactValidationIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.code}:${issue.section ?? ""}:${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueDurablePlanRelativePath(workspacePath: string, threadTitle: string, date: Date): string {
  const base = `${slugify(threadTitle || "Ambient Plan")}-${formatDateForFilename(date)}-DurablePlan`;
  for (let index = 0; index < 100; index += 1) {
    const suffix = index === 0 ? "" : `-${index + 1}`;
    const relativePath = `.ambient/board/plans/${base}${suffix}.html`;
    if (!existsSync(join(workspacePath, relativePath))) return relativePath;
  }
  return `.ambient/board/plans/${base}-${Date.now()}.html`;
}

function assertManagedDurablePlanRelativePath(value: string): string {
  const normalized = value.trim().replace(/\\/g, "/");
  if (
    !normalized ||
    isAbsolute(normalized) ||
    normalized.split("/").includes("..") ||
    !normalized.startsWith(".ambient/board/plans/") ||
    !normalized.endsWith(".html")
  ) {
    throw new Error("Durable planner artifact path must be a managed .ambient/board/plans/*.html relative path.");
  }
  return normalized;
}

function durablePlanManifestRelativePath(htmlRelativePath: string): string {
  return htmlRelativePath.replace(/\.html$/i, ".manifest.json");
}

function formatDateForFilename(date: Date): string {
  const parts = [
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
  ].map((part) => String(part).padStart(2, "0"));
  return `${parts[0]}-${parts[1]}-${parts[2]}-${parts[3]}-${parts[4]}-${parts[5]}`;
}

function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 72);
  return slug || "Ambient-Plan";
}

const requiredDiagramKinds: PlannerDiagramKind[] = ["architecture", "dependencies", "program_flow", "functional_nonfunctional"];

function plannerDurableDiagramSpecs(artifact: PlannerPlanArtifact, diagramMode: PlannerDurableDiagramMode): PlannerDiagramSpec[] {
  if (diagramMode === "deterministic") {
    return requiredDiagramKinds.map((kind) => fallbackPlannerDiagramSpec(kind, artifact));
  }
  const provided = (artifact.diagrams ?? []).filter((diagram) => diagram.nodes.length > 0);
  const byKind = new Map<PlannerDiagramKind, PlannerDiagramSpec>();
  for (const diagram of provided) {
    if (diagram.kind !== "custom" && !byKind.has(diagram.kind)) byKind.set(diagram.kind, diagram);
  }
  const required = requiredDiagramKinds.map((kind) => byKind.get(kind) ?? fallbackPlannerDiagramSpec(kind, artifact));
  const custom = provided.filter((diagram) => diagram.kind === "custom" || !required.some((item) => item.id === diagram.id));
  return [...required, ...custom.filter((diagram) => !required.some((item) => item.id === diagram.id))].slice(0, 12);
}

function diagramForKind(diagrams: PlannerDiagramSpec[], kind: PlannerDiagramKind): PlannerDiagramSpec {
  return diagrams.find((diagram) => diagram.kind === kind) ?? fallbackPlannerDiagramSpec(kind, undefined);
}

function fallbackPlannerDiagramSpec(kind: PlannerDiagramKind, artifact: PlannerPlanArtifact | undefined): PlannerDiagramSpec {
  switch (kind) {
    case "architecture":
      return {
        id: "architecture-fallback",
        title: "Architecture",
        kind,
        purpose: "Show app-level product boundaries inferred from the plan.",
        fallbackSummary: "Fallback diagram derived from the requested app scope because no valid product diagram was provided.",
        nodes: productArchitectureNodes(artifact),
        edges: productArchitectureEdges(productArchitectureNodes(artifact)),
      };
    case "dependencies": {
      const signals = artifact ? dependencySignals(artifact) : [];
      const dependencyNodes = (signals.length ? signals : ["browser runtime", "user input", "app logic"]).slice(0, 5);
      return {
        id: "dependencies-fallback",
        title: "Dependencies",
        kind,
        purpose: "Summarize dependency areas mentioned by the plan.",
        fallbackSummary: dependencyNodes.join(", "),
        nodes: [
          { id: "plan", label: "Plan", role: "Source of truth." },
          ...dependencyNodes.map((signal) => ({ id: slugId(signal), label: titleCase(signal), role: "Referenced dependency area." })),
        ],
        edges: dependencyNodes.map((signal) => ({ from: "plan", to: slugId(signal), label: "references" })),
      };
    }
    case "program_flow": {
      const flowNodes = productProgramFlowNodes(artifact);
      return {
        id: "program-flow-fallback",
        title: "Program Flow",
        kind,
        purpose: "Show the user's app workflow inferred from the plan.",
        fallbackSummary: "Fallback program flow uses product actions instead of planner implementation mechanics.",
        nodes: flowNodes,
        edges: sequenceEdges(flowNodes, "then"),
      };
    }
    case "functional_nonfunctional":
    default:
      return {
        id: "concerns-fallback",
        title: "Functional And Non-Functional Concerns",
        kind: "functional_nonfunctional",
        purpose: "Connect scope concerns to risk and verification.",
        fallbackSummary: "Fallback concerns diagram keeps product scope, quality risks, and verification connected.",
        nodes: [
          { id: "functional", label: "Functional Scope", role: productFeatureSummary(artifact) },
          { id: "nonfunctional", label: "Non-Functional Quality", role: artifact?.risks[0] ?? "Reliability, safety, and UX concerns." },
          { id: "verification", label: "Verification", role: artifact?.verification[0] ?? "Targeted validation." },
        ],
        edges: [
          { from: "functional", to: "verification", label: "acceptance" },
          { from: "nonfunctional", to: "verification", label: "quality checks" },
        ],
      };
  }
}

function productArchitectureNodes(artifact: PlannerPlanArtifact | undefined): PlannerDiagramSpec["nodes"] {
  const dependencies = artifact ? dependencySignals(artifact) : [];
  const feature = productFeatureLabels(artifact)[0] ?? "App Logic";
  const nodes: PlannerDiagramSpec["nodes"] = [
    { id: "user", label: "User", role: "Uses the app." },
    { id: "app-ui", label: "App UI", role: "Primary interface." },
    { id: slugId(feature), label: feature, role: "Requested behavior." },
  ];
  for (const dependency of dependencies.slice(0, 3)) {
    const id = slugId(dependency);
    if (!nodes.some((node) => node.id === id)) {
      nodes.push({ id, label: titleCase(dependency), role: "Plan dependency." });
    }
  }
  if (nodes.length === 3) nodes.push({ id: "browser-runtime", label: "Browser Runtime", role: "Runs the app." });
  return nodes.slice(0, 6);
}

function productArchitectureEdges(nodes: PlannerDiagramSpec["nodes"]): PlannerDiagramSpec["edges"] {
  const ui = nodes.find((node) => node.id === "app-ui");
  if (!ui) return sequenceEdges(nodes, "uses");
  return nodes
    .filter((node) => node.id !== "user" && node.id !== ui.id)
    .map((node) => ({ from: ui.id, to: node.id, label: "uses" }))
    .concat(nodes.some((node) => node.id === "user") ? [{ from: "user", to: ui.id, label: "interacts" }] : [])
    .sort((left, right) => (left.from === "user" ? -1 : right.from === "user" ? 1 : 0));
}

function productProgramFlowNodes(artifact: PlannerPlanArtifact | undefined): PlannerDiagramSpec["nodes"] {
  const text = productPlanText(artifact);
  const flow = productSpecificFlowLabels(text);
  const labels = flow.length ? flow : productFeatureLabels(artifact).slice(0, 5);
  const fallback = labels.length ? labels : artifact?.steps.slice(0, 5).map((step) => step.title) ?? [];
  const visible = fallback.length ? fallback : ["Enter Input", "Process Request", "Show Result"];
  return visible.slice(0, 5).map((label, index) => ({ id: slugId(`${index + 1}-${label}`), label: truncate(label, 34) }));
}

function sequenceEdges(nodes: PlannerDiagramSpec["nodes"], label?: string): PlannerDiagramSpec["edges"] {
  return nodes.slice(0, -1).map((node, index) => ({ from: node.id, to: nodes[index + 1]!.id, ...(label ? { label } : {}) }));
}

function productSpecificFlowLabels(text: string): string[] {
  const normalized = text.toLowerCase();
  if (/\brecipes?\b/.test(normalized) && /\bgrocery\b/.test(normalized)) {
    return ["Save Recipes", "Pick Weekly Meals", "Merge Ingredients", "Generate Grocery List"];
  }
  if (/\brandom\b/.test(normalized) && /\boptions?\b/.test(normalized)) {
    return ["Paste Options", "Pick Randomly", "Show Choice"];
  }
  if (/\bhabits?\b/.test(normalized) && /\bstreaks?\b/.test(normalized)) {
    return ["Create Habits", "Check Off Today", "Update Streaks", "Show Stats"];
  }
  if (/\bbmi\b/.test(normalized)) {
    return ["Enter Height And Weight", "Calculate BMI", "Show Category"];
  }
  if (/\btime\s+zones?\b/.test(normalized) || /\bconverter\b/.test(normalized)) {
    return ["Enter Source Value", "Convert Value", "Show Result"];
  }
  return [];
}

function productFeatureLabels(artifact: PlannerPlanArtifact | undefined): string[] {
  const text = productPlanText(artifact);
  const normalized = text.toLowerCase();
  const signals = [
    { label: "Recipes", pattern: /\brecipes?\b/ },
    { label: "Ingredients", pattern: /\bingredients?\b/ },
    { label: "Meal Plans", pattern: /\bmeal\s+plans?\b|\bweekly\s+meals?\b/ },
    { label: "Grocery List", pattern: /\bgrocery\b/ },
    { label: "Image Uploads", pattern: /\bimages?\b|\buploads?\b|\bs3\b|\bbucket\b/ },
    { label: "Authentication", pattern: /\bauth(?:entication)?\b|\blog[-\s]?in\b|\boauth\b|\bsign[-\s]?in\b/ },
    { label: "Random Picker", pattern: /\brandom\b|\boptions?\b|\bpick\b/ },
    { label: "Habit Tracking", pattern: /\bhabits?\b|\bstreaks?\b/ },
    { label: "Calculation", pattern: /\bbmi\b|\bcalculator\b|\bcalculation\b/ },
    { label: "Conversion", pattern: /\bconverter\b|\bconvert\b|\btime\s+zones?\b/ },
  ];
  const labels = signals.filter((signal) => signal.pattern.test(normalized)).map((signal) => signal.label);
  if (labels.length) return [...new Set(labels)];
  return artifact?.steps.slice(0, 3).map((step) => step.title) ?? [];
}

function productFeatureSummary(artifact: PlannerPlanArtifact | undefined): string {
  const labels = productFeatureLabels(artifact).slice(0, 3);
  return labels.length ? labels.join(", ") : "Requested app capabilities.";
}

function renderPlannerDiagramBlock(diagram: PlannerDiagramSpec, instanceId: string): string {
  return `<div class="diagram-block">
    <h3>${escapeHtml(diagram.title)}</h3>
    ${diagram.purpose ? `<p class="diagram-summary">${escapeHtml(diagram.purpose)}</p>` : ""}
    ${plannerDiagramSpecSvg(diagram, instanceId)}
    ${diagram.fallbackSummary ? `<p class="diagram-meta">${escapeHtml(diagram.fallbackSummary)}</p>` : ""}
  </div>`;
}

function plannerDiagramSpecSvg(diagram: PlannerDiagramSpec, instanceId: string): string {
  const nodes = diagram.nodes.slice(0, 16);
  const columns = diagram.kind === "program_flow" ? Math.min(5, Math.max(1, nodes.length)) : Math.min(3, Math.max(1, nodes.length));
  const rows = Math.ceil(nodes.length / columns);
  const width = 760;
  const nodeWidth = columns >= 5 ? 120 : 190;
  const nodeHeight = 64;
  const horizontalGap = (width - columns * nodeWidth - 64) / Math.max(1, columns - 1);
  const height = 96 + rows * 104;
  const positions = new Map<string, { x: number; y: number; cx: number; cy: number }>();
  nodes.forEach((node, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const x = 32 + column * (nodeWidth + horizontalGap);
    const y = 58 + row * 104;
    positions.set(node.id, { x, y, cx: x + nodeWidth / 2, cy: y + nodeHeight / 2 });
  });
  const svgId = `${slugId(diagram.id)}-${slugId(instanceId)}`;
  const markerId = `arrow-${svgId}`;
  const edges = diagram.edges
    .slice(0, 24)
    .map((edge) => {
      const from = positions.get(edge.from);
      const to = positions.get(edge.to);
      if (!from || !to) return "";
      const midX = (from.cx + to.cx) / 2;
      const midY = (from.cy + to.cy) / 2 - 6;
      return `<line x1="${from.cx}" y1="${from.cy}" x2="${to.cx}" y2="${to.cy}" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#${escapeHtml(markerId)})"></line>
        ${edge.label ? `<text x="${midX}" y="${midY}" text-anchor="middle" class="svg-muted">${escapeSvg(truncate(edge.label, 28))}</text>` : ""}`;
    })
    .join("");
  const nodeElements = nodes
    .map((node) => {
      const position = positions.get(node.id);
      if (!position) return "";
      return `<rect x="${position.x}" y="${position.y}" width="${nodeWidth}" height="${nodeHeight}" rx="8" class="svg-box"></rect>
        <text x="${position.x + 12}" y="${position.y + 24}" class="svg-text">${escapeSvg(truncate(node.label, columns >= 5 ? 18 : 28))}</text>
        ${node.role ? `<text x="${position.x + 12}" y="${position.y + 44}" class="svg-muted">${escapeSvg(truncate(node.role, columns >= 5 ? 22 : 34))}</text>` : ""}`;
    })
    .join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${escapeHtml(svgId)}-title ${escapeHtml(svgId)}-desc">
    <title id="${escapeHtml(svgId)}-title">${escapeHtml(diagram.title)}</title>
    <desc id="${escapeHtml(svgId)}-desc">${escapeHtml(diagram.purpose || diagram.fallbackSummary || "Planner diagram rendered from a structured spec.")}</desc>
    <defs><marker id="${escapeHtml(markerId)}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)"></path></marker></defs>
    <text x="24" y="28" class="svg-muted">${escapeSvg(truncate(diagram.layoutHint || diagram.kind.replace(/_/g, " "), 88))}</text>
    ${edges}
    ${nodeElements}
  </svg>`;
}

function phaseTimelineSvg(steps: PlannerPlanStep[]): string {
  const visible = steps.length ? steps.slice(0, 6) : [{ id: "plan", title: "Plan ready" }];
  const width = 720;
  const height = 78 + visible.length * 54;
  const rows = visible
    .map((step, index) => {
      const y = 46 + index * 54;
      return `<circle cx="38" cy="${y + 13}" r="10" class="svg-box"></circle>
        ${index < visible.length - 1 ? `<line x1="38" y1="${y + 24}" x2="38" y2="${y + 52}" class="svg-line"></line>` : ""}
        <rect x="68" y="${y - 4}" width="600" height="36" rx="8" class="svg-box"></rect>
        <text x="84" y="${y + 18}" class="svg-text">${escapeSvg(truncate(step.title, 88))}</text>`;
    })
    .join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="phase-title phase-desc">
    <title id="phase-title">Phase timeline</title>
    <desc id="phase-desc">Ordered implementation phases extracted from the planner artifact.</desc>
    ${svgMarkers()}
    <text x="24" y="24" class="svg-muted">Implementation sequence</text>
    ${rows}
  </svg>`;
}

function decisionSummarySvg(questions: PlannerDecisionQuestion[]): string {
  const answered = questions.filter((question) => question.answer).slice(0, 5);
  const visible = answered.length ? answered : questions.slice(0, 5);
  const width = 720;
  const height = 84 + Math.max(1, visible.length) * 58;
  const rows = (visible.length ? visible : [{ id: "none", question: "No explicit decisions captured" } as PlannerDecisionQuestion])
    .map((question, index) => {
      const y = 48 + index * 58;
      const answer = plannerDecisionAnswerText(question) ?? (question.required ? "Required" : "Optional");
      return `<rect x="24" y="${y}" width="672" height="44" rx="8" class="svg-box"></rect>
        <text x="42" y="${y + 18}" class="svg-text">${escapeSvg(truncate(question.question, 78))}</text>
        <text x="42" y="${y + 34}" class="svg-muted">${escapeSvg(truncate(answer, 92))}</text>`;
    })
    .join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="decision-title decision-desc">
    <title id="decision-title">Decision summary</title>
    <desc id="decision-desc">Planner decision questions and captured answers.</desc>
    <text x="24" y="24" class="svg-muted">Captured decisions</text>
    ${rows}
  </svg>`;
}

function riskVerificationSvg(risks: string[], verification: string[]): string {
  const risk = risks[0] ?? "Implementation risk review";
  const check = verification[0] ?? "Run targeted verification";
  return `<svg viewBox="0 0 720 180" role="img" aria-labelledby="risk-title risk-desc">
    <title id="risk-title">Risk and verification flow</title>
    <desc id="risk-desc">Primary risk feeds into the verification plan.</desc>
    ${svgMarkers()}
    <rect x="32" y="58" width="260" height="62" rx="8" class="svg-box"></rect>
    <text x="48" y="84" class="svg-text">${escapeSvg(truncate(risk, 48))}</text>
    <text x="48" y="104" class="svg-muted">Risk</text>
    <line x1="302" y1="89" x2="414" y2="89" class="svg-line"></line>
    <rect x="424" y="58" width="264" height="62" rx="8" class="svg-box"></rect>
    <text x="440" y="84" class="svg-text">${escapeSvg(truncate(check, 48))}</text>
    <text x="440" y="104" class="svg-muted">Verification</text>
  </svg>`;
}

function svgMarkers(): string {
  return `<defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)"></path></marker></defs>`;
}

function plannerDecisionAnswerText(question: PlannerDecisionQuestion): string | undefined {
  const answer = question.answer;
  if (!answer) return undefined;
  if (answer.kind === "custom") return answer.customText;
  const option = question.options.find((candidate) => candidate.id === answer.optionId);
  return option ? `${option.label}${option.description ? ` - ${option.description}` : ""}` : answer.optionId;
}

function dependencySummary(artifact: PlannerPlanArtifact): string {
  const signals = dependencySignals(artifact);
  return signals.length
    ? `The plan references these dependency areas: ${signals.join(", ")}.`
    : "No explicit dependency list was extracted; review the source plan for implementation dependencies.";
}

function dependencySignals(artifact: PlannerPlanArtifact): string[] {
  const content = productPlanText(artifact).toLowerCase();
  const signals = [
    { label: "api layer", pattern: /\bapi\b|\broute handlers?\b|\brest\b|\bbackend\b/ },
    { label: "database", pattern: /\bdatabase\b|\bpostgres(?:ql)?\b|\bsqlite\b|\bprisma\b|\bdb\b/ },
    { label: "authentication", pattern: /\bauth(?:entication)?\b|\boauth\b|\blog[-\s]?in\b|\bsign[-\s]?in\b|\bnextauth\b/ },
    { label: "image storage", pattern: /\bimages?\b|\buploads?\b|\bs3\b|\br2\b|\bbucket\b|\bstorage\b/ },
    { label: "local storage", pattern: /\blocal\s*storage\b|\blocalStorage\b/ },
    { label: "browser runtime", pattern: /\bbrowser\b|\bsingle[-\s]?page\b|\bstatic\b|\bindex\.html\b|\bno backend\b/ },
    { label: "test coverage", pattern: /\btests?\b|\bverification\b|\bvalidation\b|\be2e\b/ },
  ];
  return [...new Set(signals.filter((signal) => signal.pattern.test(content)).map((signal) => signal.label))];
}

function productPlanText(artifact: PlannerPlanArtifact | undefined): string {
  if (!artifact) return "";
  return [
    artifact.title,
    artifact.summary,
    artifact.content,
    ...artifact.steps.flatMap((step) => [step.title, step.detail ?? ""]),
    ...artifact.risks,
    ...artifact.verification,
  ].join("\n");
}

function firstNonEmptyLine(value: string): string | undefined {
  return value.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
}

function truncate(value: string, maxLength: number): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length > maxLength ? `${trimmed.slice(0, Math.max(0, maxLength - 1))}...` : trimmed;
}

function slugId(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "item"
  );
}

function titleCase(value: string): string {
  return value.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeSvg(value: string): string {
  return escapeHtml(value);
}
