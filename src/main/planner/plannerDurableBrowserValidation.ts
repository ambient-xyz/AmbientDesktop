import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import type { PlannerDurableArtifactValidationIssue, PlannerDurableArtifactValidationResult } from "../../shared/plannerTypes";

export interface PlannerDurableBrowserSvgSnapshot {
  index: number;
  width: number;
  height: number;
  viewBox: string | null;
  hasTitle: boolean;
  hasDesc: boolean;
  visibleElementCount: number;
  textLabels: string[];
}

export interface PlannerDurableBrowserDomSnapshot {
  bodyTextLength: number;
  missingSections: string[];
  scriptCount: number;
  remoteReferences: string[];
  svgSnapshots: PlannerDurableBrowserSvgSnapshot[];
}

export interface PlannerDurableBrowserValidationInput {
  absolutePath: string;
  timeoutMs?: number;
}

const requiredSections = [
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

export async function validatePlannerDurableHtmlFileInBrowser(
  input: PlannerDurableBrowserValidationInput,
): Promise<PlannerDurableArtifactValidationResult> {
  const checkedAt = new Date();
  let BrowserWindow: typeof import("electron").BrowserWindow;
  try {
    ({ BrowserWindow } = await import("electron"));
  } catch (error) {
    return {
      ok: false,
      checkedAt: checkedAt.toISOString(),
      errors: [
        {
          code: "browser-validation-unavailable",
          message: `Electron browser validation is unavailable: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      warnings: [],
    };
  }

  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    webPreferences: {
      contextIsolation: true,
      javascript: true,
      nodeIntegration: false,
      offscreen: true,
      partition: `planner-durable-validation-${randomUUID()}`,
      sandbox: true,
      webSecurity: true,
    },
  });
  const errors: PlannerDurableArtifactValidationIssue[] = [];
  const warnings: PlannerDurableArtifactValidationIssue[] = [];
  const blockedRequests = new Set<string>();

  try {
    win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
      const issue = {
        code: level >= 2 ? "browser-console-error" : "browser-console-warning",
        message: `${message}${line ? ` at ${sourceId}:${line}` : ""}`,
      };
      if (level >= 2) errors.push(issue);
      else warnings.push(issue);
    });
    win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      errors.push({
        code: isMainFrame ? "browser-main-load-failed" : "browser-resource-load-failed",
        message: `${validatedURL || "resource"} failed to load (${errorCode}): ${errorDescription}`,
      });
    });
    win.webContents.session.webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*", "data:*", "javascript:*"] }, (details, callback) => {
      blockedRequests.add(details.url);
      callback({ cancel: true });
    });

    await withTimeout(win.loadURL(pathToFileURL(input.absolutePath).toString()), input.timeoutMs ?? 8000, "Durable plan browser load timed out.");
    await withTimeout(
      win.webContents.executeJavaScript("document.fonts?.ready ? document.fonts.ready.then(() => true) : true", true),
      input.timeoutMs ?? 8000,
      "Durable plan font readiness timed out.",
    );
    const snapshot = (await withTimeout(
      win.webContents.executeJavaScript(browserSnapshotScript(), true),
      input.timeoutMs ?? 8000,
      "Durable plan DOM inspection timed out.",
    )) as PlannerDurableBrowserDomSnapshot;
    const domValidation = plannerDurableBrowserSnapshotValidation(snapshot, checkedAt);
    for (const url of blockedRequests) {
      errors.push({ code: "browser-blocked-external-request", message: `Durable plan tried to load a blocked external resource: ${url}` });
    }
    return mergeBrowserValidationResults(
      domValidation,
      {
        ok: errors.length === 0,
        checkedAt: checkedAt.toISOString(),
        errors,
        warnings,
      },
    );
  } catch (error) {
    errors.push({
      code: "browser-validation-error",
      message: error instanceof Error ? error.message : String(error),
    });
    return {
      ok: false,
      checkedAt: checkedAt.toISOString(),
      errors,
      warnings,
    };
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

export function plannerDurableBrowserSnapshotValidation(
  snapshot: PlannerDurableBrowserDomSnapshot,
  checkedAt = new Date(),
): PlannerDurableArtifactValidationResult {
  const errors: PlannerDurableArtifactValidationIssue[] = [];
  const warnings: PlannerDurableArtifactValidationIssue[] = [];
  if (snapshot.bodyTextLength <= 0) {
    errors.push({ code: "browser-empty-body", message: "Durable plan rendered with no visible body text." });
  }
  for (const sectionId of snapshot.missingSections) {
    errors.push({ code: "browser-missing-section", section: sectionId, message: `Browser validation could not find section ${sectionId}.` });
  }
  if (snapshot.scriptCount > 0) {
    errors.push({ code: "browser-script-present", message: "Browser validation found script elements in the durable plan." });
  }
  for (const reference of snapshot.remoteReferences) {
    errors.push({ code: "browser-remote-reference", message: `Browser validation found a remote or unsafe reference: ${reference}` });
  }
  if (!snapshot.svgSnapshots.length) {
    errors.push({ code: "browser-svg-missing", section: "diagram-gallery", message: "Browser validation found no rendered SVG diagrams." });
  }
  for (const svg of snapshot.svgSnapshots) {
    const section = `svg-${svg.index + 1}`;
    if (!(svg.width > 0 && svg.height > 0)) {
      errors.push({ code: "browser-svg-zero-size", section, message: "Browser validation found an SVG with zero rendered size." });
    }
    if (!svg.viewBox) {
      errors.push({ code: "browser-svg-missing-viewbox", section, message: "Browser validation found an SVG without a viewBox." });
    }
    if (!svg.hasTitle || !svg.hasDesc) {
      errors.push({ code: "browser-svg-missing-accessible-label", section, message: "Browser validation found an SVG without title and desc labels." });
    }
    if (svg.visibleElementCount <= 0) {
      errors.push({ code: "browser-svg-empty", section, message: "Browser validation found an SVG with no visible diagram elements." });
    }
    for (const label of svg.textLabels) {
      if (label.length > 96) {
        warnings.push({ code: "browser-svg-long-label", section, message: `SVG label may overflow: ${label.slice(0, 120)}` });
      }
    }
  }

  return {
    ok: errors.length === 0,
    checkedAt: checkedAt.toISOString(),
    errors,
    warnings,
  };
}

function browserSnapshotScript(): string {
  return `(() => {
    const requiredSections = ${JSON.stringify(requiredSections)};
    const unsafeReference = (value) => /^(https?:|data:|javascript:)/i.test(String(value || '').trim());
    return {
      bodyTextLength: (document.body?.innerText || '').trim().length,
      missingSections: requiredSections.filter((id) => !document.getElementById(id)),
      scriptCount: document.querySelectorAll('script').length,
      remoteReferences: Array.from(document.querySelectorAll('[src], [href], [xlink\\\\:href]'))
        .map((element) => element.getAttribute('src') || element.getAttribute('href') || element.getAttribute('xlink:href') || '')
        .filter(unsafeReference),
      svgSnapshots: Array.from(document.querySelectorAll('svg')).map((svg, index) => {
        const rect = svg.getBoundingClientRect();
        return {
          index,
          width: rect.width,
          height: rect.height,
          viewBox: svg.getAttribute('viewBox'),
          hasTitle: Boolean(svg.querySelector('title')?.textContent?.trim()),
          hasDesc: Boolean(svg.querySelector('desc')?.textContent?.trim()),
          visibleElementCount: svg.querySelectorAll('rect,circle,line,path,text,polyline,polygon,ellipse').length,
          textLabels: Array.from(svg.querySelectorAll('text')).map((text) => (text.textContent || '').trim()).filter(Boolean)
        };
      })
    };
  })()`;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function mergeBrowserValidationResults(
  first: PlannerDurableArtifactValidationResult,
  second: PlannerDurableArtifactValidationResult,
): PlannerDurableArtifactValidationResult {
  return {
    ok: first.ok && second.ok,
    checkedAt: second.checkedAt || first.checkedAt,
    errors: [...first.errors, ...second.errors],
    warnings: [...first.warnings, ...second.warnings],
  };
}
