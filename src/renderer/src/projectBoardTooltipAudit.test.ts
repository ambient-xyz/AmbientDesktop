import fs from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

interface ButtonAuditEntry {
  file: string;
  component?: string;
  line: number;
  className: string;
  ariaLabel: string;
  title: string;
  tooltip: string;
}

interface SourceContext {
  label: string;
  filePath: string;
  sourceFile: ts.SourceFile;
}

function sourceContext(label: string, filePath: string): SourceContext {
  const sourceText = fs.readFileSync(filePath, "utf8");
  return {
    label,
    filePath,
    sourceFile: ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX),
  };
}

const sourceContexts = [
  sourceContext("App.tsx", fileURLToPath(new URL("./App.tsx", import.meta.url))),
  sourceContext("AppComposerSettingsControls.tsx", fileURLToPath(new URL("./AppComposerSettingsControls.tsx", import.meta.url))),
  sourceContext("AppComposerShell.tsx", fileURLToPath(new URL("./AppComposerShell.tsx", import.meta.url))),
  sourceContext("AppShellSidebar.tsx", fileURLToPath(new URL("./AppShellSidebar.tsx", import.meta.url))),
  sourceContext("AppTopbar.tsx", fileURLToPath(new URL("./AppTopbar.tsx", import.meta.url))),
  sourceContext("ProjectBoardActiveCardDetailViews.tsx", fileURLToPath(new URL("./ProjectBoardActiveCardDetailViews.tsx", import.meta.url))),
  sourceContext("ProjectBoardCandidateDetailViews.tsx", fileURLToPath(new URL("./ProjectBoardCandidateDetailViews.tsx", import.meta.url))),
  sourceContext("ProjectBoardDraftInboxViews.tsx", fileURLToPath(new URL("./ProjectBoardDraftInboxViews.tsx", import.meta.url))),
  sourceContext("ProjectBoardExecutionViews.tsx", fileURLToPath(new URL("./ProjectBoardExecutionViews.tsx", import.meta.url))),
  sourceContext("ProjectBoardHistoryViews.tsx", fileURLToPath(new URL("./ProjectBoardHistoryViews.tsx", import.meta.url))),
  sourceContext("ProjectBoardLaneViews.tsx", fileURLToPath(new URL("./ProjectBoardLaneViews.tsx", import.meta.url))),
  sourceContext("ProjectBoardMapViews.tsx", fileURLToPath(new URL("./ProjectBoardMapViews.tsx", import.meta.url))),
  sourceContext("ProjectBoardSourceViews.tsx", fileURLToPath(new URL("./ProjectBoardSourceViews.tsx", import.meta.url))),
  sourceContext("ProjectBoardSynthesisViews.tsx", fileURLToPath(new URL("./ProjectBoardSynthesisViews.tsx", import.meta.url))),
  sourceContext("ProjectBoardWorkspace.tsx", fileURLToPath(new URL("./ProjectBoardWorkspace.tsx", import.meta.url))),
];

function jsxAttributeText(context: SourceContext, node: ts.JsxOpeningLikeElement, name: string): string {
  const attribute = node.attributes.properties.find(
    (property): property is ts.JsxAttribute => ts.isJsxAttribute(property) && property.name.getText(context.sourceFile) === name,
  );
  return attribute?.initializer?.getText(context.sourceFile) ?? "";
}

function hasJsxAttribute(context: SourceContext, node: ts.JsxOpeningLikeElement, name: string): boolean {
  return node.attributes.properties.some((property) => ts.isJsxAttribute(property) && property.name.getText(context.sourceFile) === name);
}

function isButtonElement(context: SourceContext, node: ts.Node): node is ts.JsxOpeningLikeElement {
  return (
    (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
    node.tagName.getText(context.sourceFile) === "button"
  );
}

function buttonAuditEntries(): ButtonAuditEntry[] {
  const entries: ButtonAuditEntry[] = [];

  for (const context of sourceContexts) {
    entries.push(...buttonAuditEntriesForSource(context));
  }

  return entries;
}

function buttonAuditEntriesForSource(context: SourceContext): ButtonAuditEntry[] {
  const entries: ButtonAuditEntry[] = [];
  const componentStack: string[] = [];

  function visit(node: ts.Node): void {
    const componentName = ts.isFunctionDeclaration(node) ? node.name?.text : undefined;
    const isProjectBoardComponent = Boolean(componentName?.startsWith("ProjectBoard"));
    if (componentName && isProjectBoardComponent) componentStack.push(componentName);

    if (isButtonElement(context, node)) {
      entries.push({
        file: context.label,
        component: componentStack.at(-1),
        line: context.sourceFile.getLineAndCharacterOfPosition(node.getStart(context.sourceFile)).line + 1,
        className: jsxAttributeText(context, node, "className"),
        ariaLabel: hasJsxAttribute(context, node, "aria-label") ? jsxAttributeText(context, node, "aria-label") || "<expression>" : "",
        title: hasJsxAttribute(context, node, "title") ? jsxAttributeText(context, node, "title") || "<expression>" : "",
        tooltip: hasJsxAttribute(context, node, "data-tooltip") ? jsxAttributeText(context, node, "data-tooltip") || "<expression>" : "",
      });
    }

    ts.forEachChild(node, visit);
    if (componentName && isProjectBoardComponent) componentStack.pop();
  }

  visit(context.sourceFile);
  return entries;
}

function formatMissing(entries: ButtonAuditEntry[]): string {
  return entries
    .map((entry) => `${entry.file}:${entry.line}${entry.component ? ` ${entry.component}` : ""}${entry.className ? ` ${entry.className}` : ""}`)
    .join("\n");
}

describe("project board button tooltips", () => {
  const entries = buttonAuditEntries();

  it("keeps every in-board action button covered by title copy", () => {
    const boardButtons = entries.filter((entry) => entry.component?.startsWith("ProjectBoard"));
    expect(boardButtons.length).toBeGreaterThan(70);
    const missingTitle = boardButtons.filter((entry) => !entry.title && !entry.tooltip);
    expect(formatMissing(missingTitle)).toBe("");
  });

  it("keeps icon-only board buttons accessible as well as hover-explained", () => {
    const iconOnlyBoardButtons = entries.filter(
      (entry) =>
        (entry.component?.startsWith("ProjectBoard") || entry.className.includes("project-board")) &&
        (entry.className.includes("icon-button") || entry.className.includes("project-board-icon-button")),
    );
    expect(iconOnlyBoardButtons.length).toBeGreaterThan(3);
    const missingCopy = iconOnlyBoardButtons.filter((entry) => (!entry.title && !entry.tooltip) || !entry.ariaLabel);
    expect(formatMissing(missingCopy)).toBe("");
  });

  it("keeps board entry-point controls outside the board panel covered", () => {
    const entryPointButtons = entries.filter(
      (entry) =>
        entry.className.includes("project-board-icon-button") ||
        entry.className.includes("project-board-top-action") ||
        entry.ariaLabel.includes("Add Plan to Board"),
    );
    expect(entryPointButtons.some((entry) => entry.className.includes("project-board-icon-button"))).toBe(true);
    expect(entryPointButtons.some((entry) => entry.className.includes("project-board-top-action"))).toBe(true);
    expect(entryPointButtons.some((entry) => entry.ariaLabel.includes("Add Plan to Board"))).toBe(true);
    const missingTitle = entryPointButtons.filter((entry) => !entry.title && !entry.tooltip);
    expect(formatMissing(missingTitle)).toBe("");
  });
});
