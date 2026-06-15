import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import type { PlannerPlanArtifact } from "../shared/types";
import {
  mergePlannerDurableValidationResults,
  PlannerDurableHtmlValidationError,
  renderPlannerDurableHtml,
  validatePlannerDurableHtml,
  writePlannerDurableHtmlArtifact,
} from "./plannerDurableHtml";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

describe("planner durable HTML artifacts", () => {
  const artifact: PlannerPlanArtifact = {
    id: "plan-1",
    threadId: "thread-1",
    sourceMessageId: "message-1",
    status: "ready",
    workflowState: "draft",
    title: "Planner Mode Enhancements",
    summary: "Build durable planning artifacts.",
    content: "# Plan\n\nShip durable HTML with diagrams.",
    steps: [
      { id: "step-1", title: "Generate HTML." },
      { id: "step-2", title: "Preview the artifact." },
    ],
    openQuestions: [],
    risks: ["Generated SVG could be malformed."],
    verification: ["Open the HTML preview."],
    diagrams: [
      {
        id: "architecture",
        title: "Architecture",
        kind: "architecture",
        purpose: "Show renderer and main process boundaries.",
        nodes: [
          { id: "renderer", label: "Renderer UI", role: "Planner card." },
          { id: "main", label: "Main Process", role: "Durable artifact writer." },
        ],
        edges: [{ from: "renderer", to: "main", label: "IPC" }],
        fallbackSummary: "Renderer and main cooperate to create durable plans.",
      },
    ],
    decisionQuestions: [
      {
        id: "storage",
        question: "Where should the plan live?",
        recommendedOptionId: "ambient-board-plans",
        required: true,
        options: [
          { id: "ambient-board-plans", label: ".ambient/board/plans", description: "Keeps board-visible plan artifacts together." },
          { id: "root", label: "Project root", description: "Easier to spot but noisier." },
        ],
        answer: { kind: "option", optionId: "ambient-board-plans", answeredAt: "2026-05-11T00:00:00.000Z" },
      },
    ],
    createdAt: "2026-05-11T00:00:00.000Z",
    updatedAt: "2026-05-11T00:00:00.000Z",
  };

  it("renders required sections and deterministic inline SVG diagrams", () => {
    const html = renderPlannerDurableHtml({
      artifact,
      threadTitle: "Planner thread",
      generatedAt: "2026-05-11T00:00:00.000Z",
    });

    expect(html).toContain("<!doctype html>");
    expect(html).toContain('id="executive-summary"');
    expect(html).toContain('id="diagram-gallery"');
    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(html).toContain("script-src 'none'");
    expect(html).not.toContain("frame-ancestors");
    expect(html).not.toContain("unsafe-eval");
    expect(html).toContain("<svg");
    expect(html).not.toContain("<script");
    expect(html).toContain("Where should the plan live?");
    expect(html).toContain("Show renderer and main process boundaries.");
    expect(html).toContain("Functional And Non-Functional Concerns");
    expect(validatePlannerDurableHtml(html, new Date("2026-05-11T00:00:00.000Z"))).toMatchObject({
      ok: true,
      errors: [],
    });
  });

  it("can render deterministic fallback diagrams instead of Pi-authored diagrams", () => {
    const html = renderPlannerDurableHtml({
      artifact,
      threadTitle: "Planner thread",
      generatedAt: "2026-05-11T00:00:00.000Z",
      diagramMode: "deterministic",
    });

    expect(html).toContain("Show app-level product boundaries inferred from the plan.");
    expect(html).not.toContain("Show renderer and main process boundaries.");
    expect(validatePlannerDurableHtml(html, new Date("2026-05-11T00:00:00.000Z"))).toMatchObject({
      ok: true,
      errors: [],
    });
  });

  it("rejects unsafe or structurally incomplete durable HTML", () => {
    const validation = validatePlannerDurableHtml("<!doctype html><html><body><script>alert(1)</script><svg></svg></body></html>", new Date("2026-05-11T00:00:00.000Z"));

    expect(validation.ok).toBe(false);
    expect(validation.errors.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["script-tag", "csp-missing", "missing-section", "svg-missing-img-role", "svg-missing-viewbox", "svg-missing-accessible-label"]),
    );
  });

  it("rejects durable HTML that allows script execution through CSP", () => {
    const html = renderPlannerDurableHtml({
      artifact,
      threadTitle: "Planner thread",
      generatedAt: "2026-05-11T00:00:00.000Z",
    });
    const unsafeEvalHtml = html.replace("script-src 'none'", "script-src 'self' 'unsafe-eval'");

    const validation = validatePlannerDurableHtml(unsafeEvalHtml, new Date("2026-05-11T00:00:00.000Z"));

    expect(validation.ok).toBe(false);
    expect(validation.errors.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["csp-script-src-not-none", "csp-unsafe-eval"]),
    );
  });

  it("rejects CSP meta directives that browsers log as validation errors", () => {
    const html = renderPlannerDurableHtml({
      artifact,
      threadTitle: "Planner thread",
      generatedAt: "2026-05-11T00:00:00.000Z",
    });
    const frameAncestorsHtml = html.replace("form-action 'none'; object-src", "form-action 'none'; frame-ancestors 'none'; object-src");

    const validation = validatePlannerDurableHtml(frameAncestorsHtml, new Date("2026-05-11T00:00:00.000Z"));

    expect(validation.ok).toBe(false);
    expect(validation.errors.map((issue) => issue.code)).toContain("csp-frame-ancestors-meta");
  });

  it("rejects durable HTML that still contains raw native planner question markers", () => {
    const html = renderPlannerDurableHtml({
      artifact: {
        ...artifact,
        content: [
          "# Plan",
          "",
          "Build the app.",
          "",
          "```ambient-planner-questions",
          '{ "questions": [',
        ].join("\n"),
      },
      threadTitle: "Planner thread",
      generatedAt: "2026-05-11T00:00:00.000Z",
    });

    const validation = validatePlannerDurableHtml(html, new Date("2026-05-11T00:00:00.000Z"));

    expect(validation.ok).toBe(false);
    expect(validation.errors.map((issue) => issue.code)).toContain("native-question-block-leaked");
  });

  it("merges static and browser validation diagnostics", () => {
    const merged = mergePlannerDurableValidationResults(
      {
        ok: true,
        checkedAt: "2026-05-11T00:00:00.000Z",
        errors: [],
        warnings: [{ code: "static-warning", message: "Static warning." }],
      },
      {
        ok: false,
        checkedAt: "2026-05-11T00:00:01.000Z",
        errors: [{ code: "browser-svg-zero-size", section: "svg-1", message: "Zero size." }],
        warnings: [{ code: "static-warning", message: "Static warning." }],
      },
    );

    expect(merged).toEqual({
      ok: false,
      checkedAt: "2026-05-11T00:00:01.000Z",
      errors: [{ code: "browser-svg-zero-size", section: "svg-1", message: "Zero size." }],
      warnings: [{ code: "static-warning", message: "Static warning." }],
    });
  });

  it("writes a sanitized durable plan filename and manifest under .ambient/board/plans", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-durable-plan-"));
    tempDirs.push(workspacePath);

    const result = await writePlannerDurableHtmlArtifact({
      artifact,
      threadTitle: "Planner Thread: Durable HTML!",
      workspacePath,
      generatedAt: new Date(2026, 4, 11, 1, 2, 3),
    });

    expect(result.relativePath).toBe(".ambient/board/plans/Planner-Thread-Durable-HTML-2026-05-11-01-02-03-DurablePlan.html");
    expect(result.manifestRelativePath).toBe(".ambient/board/plans/Planner-Thread-Durable-HTML-2026-05-11-01-02-03-DurablePlan.manifest.json");
    expect(result.contentSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.byteSize).toBeGreaterThan(1000);
    expect(result.validation.ok).toBe(true);
    await expect(readFile(join(workspacePath, result.relativePath), "utf8")).resolves.toContain("Planner Mode Enhancements");
    await expect(readFile(join(workspacePath, result.manifestRelativePath), "utf8")).resolves.toContain(result.relativePath);
  });

  it("can overwrite an existing managed durable plan path", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-durable-plan-overwrite-"));
    tempDirs.push(workspacePath);
    const relativePath = ".ambient/board/plans/current-DurablePlan.html";

    const first = await writePlannerDurableHtmlArtifact({
      artifact,
      threadTitle: "Planner Thread",
      workspacePath,
      generatedAt: new Date(2026, 4, 11, 1, 2, 3),
      relativePath,
    });
    const second = await writePlannerDurableHtmlArtifact({
      artifact: {
        ...artifact,
        sourceMessageId: "message-2",
        title: "Planner Mode Enhancements Revised",
        content: "# Plan\n\nShip durable HTML with revised feedback.",
      },
      threadTitle: "Planner Thread",
      workspacePath,
      generatedAt: new Date(2026, 4, 11, 1, 3, 3),
      relativePath,
    });

    expect(first.relativePath).toBe(relativePath);
    expect(second.relativePath).toBe(relativePath);
    expect(second.manifestRelativePath).toBe(".ambient/board/plans/current-DurablePlan.manifest.json");
    const html = await readFile(join(workspacePath, relativePath), "utf8");
    expect(html).toContain("Planner Mode Enhancements Revised");
    expect(html).not.toContain("<title>Planner Mode Enhancements</title>");
    await expect(readFile(join(workspacePath, second.manifestRelativePath), "utf8")).resolves.toContain("message-2");
  });

  it("leaves an existing durable plan intact when replacement validation fails", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-durable-plan-overwrite-invalid-"));
    tempDirs.push(workspacePath);
    const relativePath = ".ambient/board/plans/current-DurablePlan.html";
    await writePlannerDurableHtmlArtifact({
      artifact,
      threadTitle: "Planner Thread",
      workspacePath,
      generatedAt: new Date(2026, 4, 11, 1, 2, 3),
      relativePath,
    });
    const before = await readFile(join(workspacePath, relativePath), "utf8");

    await expect(
      writePlannerDurableHtmlArtifact({
        artifact: { ...artifact, title: "Invalid Revision" },
        threadTitle: "Planner Thread",
        workspacePath,
        generatedAt: new Date(2026, 4, 11, 1, 3, 3),
        relativePath,
        browserValidator: async () => ({
          ok: false,
          checkedAt: "2026-05-11T00:00:01.000Z",
          errors: [{ code: "browser-console-error", message: "Console error." }],
          warnings: [],
        }),
      }),
    ).rejects.toMatchObject({ validation: { ok: false } });

    await expect(readFile(join(workspacePath, relativePath), "utf8")).resolves.toBe(before);
  });

  it("rejects unmanaged durable plan overwrite paths", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-durable-plan-path-"));
    tempDirs.push(workspacePath);

    await expect(
      writePlannerDurableHtmlArtifact({
        artifact,
        threadTitle: "Planner Thread",
        workspacePath,
        relativePath: "../outside.html",
      }),
    ).rejects.toThrow("managed .ambient/board/plans/*.html");
  });

  it("records deterministic fallback warnings in successful validation metadata", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-durable-plan-fallback-warning-"));
    tempDirs.push(workspacePath);

    const result = await writePlannerDurableHtmlArtifact({
      artifact,
      threadTitle: "Planner Thread",
      workspacePath,
      generatedAt: new Date(2026, 4, 11, 1, 2, 3),
      diagramMode: "deterministic",
      validationWarnings: [{ code: "pi-diagram-fallback-used", section: "diagram-gallery", message: "Fallback used." }],
    });

    expect(result.validation.ok).toBe(true);
    expect(result.validation.warnings).toEqual(
      expect.arrayContaining([{ code: "pi-diagram-fallback-used", section: "diagram-gallery", message: "Fallback used." }]),
    );
  });

  it("escapes unsafe plan text before validation", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-durable-plan-invalid-"));
    tempDirs.push(workspacePath);
    const invalidArtifact: PlannerPlanArtifact = {
      ...artifact,
      title: "<script>alert(1)</script>",
      summary: "Unsafe title should be escaped by the renderer.",
    };

    await expect(
      writePlannerDurableHtmlArtifact({
        artifact: invalidArtifact,
        threadTitle: "<script>alert(1)</script>",
        workspacePath,
        generatedAt: new Date(2026, 4, 11, 1, 2, 3),
      }),
    ).resolves.toMatchObject({ validation: { ok: true } });

    const validationError = new PlannerDurableHtmlValidationError({
      ok: false,
      checkedAt: "2026-05-11T00:00:00.000Z",
      errors: [{ code: "script-tag", message: "No scripts." }],
      warnings: [],
    });
    expect(validationError.message).toContain("script-tag");
  });

  it("removes the candidate file when browser validation fails", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-durable-plan-browser-invalid-"));
    tempDirs.push(workspacePath);

    await expect(
      writePlannerDurableHtmlArtifact({
        artifact,
        threadTitle: "Planner Thread",
        workspacePath,
        generatedAt: new Date(2026, 4, 11, 1, 2, 3),
        browserValidator: async () => ({
          ok: false,
          checkedAt: "2026-05-11T00:00:01.000Z",
          errors: [{ code: "browser-svg-zero-size", section: "svg-1", message: "Zero size." }],
          warnings: [],
        }),
      }),
    ).rejects.toMatchObject({ validation: { ok: false } });

    await expect(access(join(workspacePath, ".ambient/board/plans/Planner-Thread-2026-05-11-01-02-03-DurablePlan.html"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
