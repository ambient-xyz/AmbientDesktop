import { stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { countBy, slugForId } from "./collect-ui-model-shared.mjs";

export async function writeUiModelReports(models, options) {
  const { resultsDir, workspace, failOnViolations, failOnAnyViolation, selfTestDefects, activeProfiles, themePreference } = options;
  const violationCount = models.reduce((sum, model) => sum + model.violations.length, 0);
  const gateFailureCount = models.reduce((sum, model) => sum + model.violations.filter((violation) => violation.gate === "fail").length, 0);
  const violationGroups = buildViolationGroups(models);
  const annotationGroups = buildAnnotationGroups(models);
  const summary = {
    version: 1,
    generatedAt: new Date().toISOString(),
    workspace,
    reportOnly: !failOnViolations && !failOnAnyViolation,
    zeroBaseline: failOnAnyViolation,
    selfTestDefects,
    activeProfiles,
    themePreference,
    violationCount,
    gateFailureCount,
    violationsByGate: countBy(
      models.flatMap((model) => model.violations),
      (violation) => violation.gate,
    ),
    violationsByImpact: countBy(
      models.flatMap((model) => model.violations),
      (violation) => violation.impact,
    ),
    violationGroups,
    annotationGroups,
    scenarios: await Promise.all(
      models.map(async (model) => {
        const file = join(resultsDir, `${model.scenario}.json`);
        const fileStat = await stat(file);
        return {
          scenario: model.scenario,
          surface: model.scenarioMeta.surface,
          exposure: model.scenarioMeta.exposure,
          profiles: model.scenarioMeta.profiles,
          viewportName: model.scenarioMeta.viewportName,
          description: model.scenarioMeta.description,
          file: basename(file),
          bytes: fileStat.size,
          viewport: model.viewport,
          visibleNodeCount: model.summary.visibleNodeCount,
          accessibilityNodeCount: model.accessibility.exportedNodeCount,
          tooltipSampleCount: model.tooltipSamples.length,
          violationCount: model.violations.length,
          gateFailureCount: model.violations.filter((violation) => violation.gate === "fail").length,
          violationsByType: countBy(model.violations, (violation) => violation.type),
          violationsByGate: countBy(model.violations, (violation) => violation.gate),
          violationsByImpact: countBy(model.violations, (violation) => violation.impact),
        };
      }),
    ),
  };
  await writeFile(join(resultsDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await writeFile(join(resultsDir, "report.md"), markdownReport(summary, models), "utf8");
  await writeFile(join(resultsDir, "report.html"), htmlReport(summary, models), "utf8");
}

function markdownReport(summary, models) {
  const lines = [];
  lines.push("# UI Model Report");
  lines.push("");
  lines.push(`Generated: ${summary.generatedAt}`);
  lines.push(`Workspace: \`${summary.workspace}\``);
  lines.push(
    `Mode: ${summary.selfTestDefects ? "self-test" : summary.zeroBaseline ? "zero-baseline" : summary.reportOnly ? "report-only" : "strict"}`,
  );
  lines.push(`Theme: \`${summary.themePreference}\``);
  lines.push(`Profiles: ${summary.activeProfiles.map((profile) => `\`${profile}\``).join(", ")}`);
  lines.push(`Violations: ${summary.violationCount}`);
  lines.push(`Gate failures: ${summary.gateFailureCount}`);
  lines.push(`By gate: ${JSON.stringify(summary.violationsByGate)}`);
  lines.push(`By impact: ${JSON.stringify(summary.violationsByImpact)}`);
  lines.push("");
  lines.push("## Scenario Summary");
  lines.push("");
  lines.push("| Scenario | Surface | Exposure | Viewport | Nodes | AX Nodes | Tooltip Samples | Violations | Gate Failures |");
  lines.push("| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const scenario of summary.scenarios) {
    lines.push(
      `| ${scenario.scenario} | ${scenario.surface} | ${scenario.exposure} | ${scenario.viewport.width}x${scenario.viewport.height} | ${scenario.visibleNodeCount} | ${scenario.accessibilityNodeCount} | ${scenario.tooltipSampleCount} | ${scenario.violationCount} | ${scenario.gateFailureCount} |`,
    );
  }
  lines.push("");
  if (summary.violationGroups.length > 0) {
    lines.push("## Finding Groups");
    lines.push("");
    lines.push("| Count | Gate Failures | Gate | Impact | Surface | Component | Type | Scenarios | Sample Selector |");
    lines.push("| ---: | ---: | --- | --- | --- | --- | --- | --- | --- |");
    for (const group of summary.violationGroups.slice(0, 30)) {
      lines.push(
        `| ${group.violationCount} | ${group.gateFailureCount} | ${escapeMd(group.gate)} | ${escapeMd(group.impact)} | ${escapeMd(group.surface)} | ${escapeMd(group.component)} | ${escapeMd(group.type)} | ${escapeMd(group.scenarios.join(", "))} | \`${escapeMd(group.sampleSelector)}\` |`,
      );
    }
    if (summary.violationGroups.length > 30)
      lines.push(`| ${summary.violationGroups.length - 30} more groups | | | | | | | See summary.json | |`);
    lines.push("");
  }
  if (summary.annotationGroups.length > 0) {
    lines.push("## Annotation Inventory");
    lines.push("");
    lines.push("| Nodes | Surface | Component | Annotation | Scenarios | Rationale | Sample Selector |");
    lines.push("| ---: | --- | --- | --- | --- | --- | --- |");
    for (const group of summary.annotationGroups.slice(0, 30)) {
      lines.push(
        `| ${group.nodeCount} | ${escapeMd(group.surface)} | ${escapeMd(group.component)} | ${escapeMd(group.annotation)} | ${escapeMd(group.scenarios.join(", "))} | ${escapeMd(group.rationale)} | \`${escapeMd(group.sampleSelector)}\` |`,
      );
    }
    if (summary.annotationGroups.length > 30)
      lines.push(`| ${summary.annotationGroups.length - 30} more annotation groups | | | | | See summary.json | |`);
    lines.push("");
  }
  for (const model of models) {
    lines.push(`## ${model.scenario}`);
    lines.push("");
    lines.push(`Surface: \`${model.scenarioMeta.surface}\``);
    lines.push(`Exposure: \`${model.scenarioMeta.exposure}\``);
    lines.push(`Description: ${escapeMd(model.scenarioMeta.description)}`);
    lines.push(`File: \`${model.scenario}.json\``);
    lines.push(`Gate failures: ${model.summary.gateFailureCount ?? 0}`);
    lines.push("");
    if (model.violations.length === 0) {
      lines.push("No violations reported.");
      lines.push("");
      continue;
    }
    lines.push("| Gate | Impact | Severity | Type | Selector | Text | Details |");
    lines.push("| --- | --- | --- | --- | --- | --- | --- |");
    for (const violation of model.violations.slice(0, 40)) {
      lines.push(
        `| ${escapeMd(violation.gate)} | ${escapeMd(violation.impact)} | ${escapeMd(violation.severity)} | ${escapeMd(violation.type)} | \`${escapeMd(violation.selector ?? "")}\` | ${escapeMd(violation.text ?? violation.message ?? "")} | ${escapeMd(JSON.stringify(violation.details ?? {}).slice(0, 240))} |`,
      );
    }
    if (model.violations.length > 40)
      lines.push(`| report | info | info | truncated | | ${model.violations.length - 40} more violations in JSON | |`);
    lines.push("");
  }
  lines.push("## Notes");
  lines.push("");
  lines.push(
    "- Screenshots are intentionally not part of this report; use this model as the fast UI oracle and capture screenshots only on failures that need visual triage.",
  );
  lines.push('- Intentional truncation should be marked with `data-ui-allow-truncation="true"` or paired with a disclosure affordance.');
  lines.push("- Alignment groups can opt in with `data-ui-align-group` and optional `data-ui-align-axis`.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function buildViolationGroups(models) {
  const groups = new Map();
  for (const model of models) {
    for (const violation of model.violations) {
      const component = componentForSelector(violation.selector);
      const key = [model.scenarioMeta.surface, component, violation.type, violation.gate, violation.impact].join("|");
      const group = groups.get(key) ?? {
        id: slugForId(key),
        surface: model.scenarioMeta.surface,
        component,
        type: violation.type,
        gate: violation.gate,
        impact: violation.impact,
        violationCount: 0,
        gateFailureCount: 0,
        scenarios: [],
        selectors: [],
        sampleSelector: violation.selector ?? "",
        sampleText: violation.text ?? violation.message ?? "",
        disclosureCount: 0,
      };
      group.violationCount += 1;
      if (violation.gate === "fail") group.gateFailureCount += 1;
      if (!group.scenarios.includes(model.scenario)) group.scenarios.push(model.scenario);
      if (violation.selector && !group.selectors.includes(violation.selector)) group.selectors.push(violation.selector);
      if (violation.details?.hasDisclosure) group.disclosureCount += 1;
      groups.set(key, group);
    }
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      selectorCount: group.selectors.length,
      selectors: group.selectors.slice(0, 10),
      scenarios: group.scenarios.sort(),
    }))
    .sort(
      (left, right) =>
        right.gateFailureCount - left.gateFailureCount ||
        right.violationCount - left.violationCount ||
        left.component.localeCompare(right.component),
    );
}

function buildAnnotationGroups(models) {
  const groups = new Map();
  for (const model of models) {
    for (const node of model.nodes ?? []) {
      const annotations = annotationKindsForNode(node);
      for (const annotation of annotations) {
        const component = componentForSelector(node.selector);
        const key = [model.scenarioMeta.surface, component, annotation].join("|");
        const group = groups.get(key) ?? {
          id: slugForId(key),
          surface: model.scenarioMeta.surface,
          component,
          annotation,
          rationale: annotationRationale(annotation),
          nodeCount: 0,
          scenarios: [],
          sampleSelector: node.selector ?? "",
          sampleText: node.text ?? node.title ?? node.ariaLabel ?? "",
        };
        group.nodeCount += 1;
        if (!group.scenarios.includes(model.scenario)) group.scenarios.push(model.scenario);
        groups.set(key, group);
      }
    }
  }
  return [...groups.values()]
    .map((group) => ({ ...group, scenarios: group.scenarios.sort() }))
    .sort(
      (left, right) =>
        right.nodeCount - left.nodeCount ||
        left.component.localeCompare(right.component) ||
        left.annotation.localeCompare(right.annotation),
    );
}

function annotationKindsForNode(node) {
  const data = node.data ?? {};
  const annotations = [];
  if (data.ownAllowTruncation) annotations.push("allow-truncation");
  if (data.ownAllowCompressedControl) annotations.push("allow-compressed-control");
  if (data.ownAllowLonelyRow) annotations.push("allow-lonely-row");
  if (data.ownAllowFragmentedControls) annotations.push("allow-fragmented-controls");
  if (data.ownAllowSmallTarget) annotations.push("allow-small-target");
  if (data.ownAllowUnlabeledControl) annotations.push("allow-unlabeled-control");
  if (data.ownAllowStickyOverlap) annotations.push("allow-sticky-overlap");
  if (data.ownAllowUnreachableScroll) annotations.push("allow-unreachable-scroll");
  if (data.overflowIntent) annotations.push(`overflow:${data.overflowIntent}`);
  if (data.scrollContainer) annotations.push(`scroll-container:${data.scrollContainer}`);
  if (data.alignGroup) annotations.push(`align-group:${data.alignGroup}${data.alignAxis ? `:${data.alignAxis}` : ""}`);
  if (data.stickyGuard) annotations.push(`sticky-guard:${data.stickyGuard}`);
  return annotations;
}

function annotationRationale(annotation) {
  if (annotation === "allow-truncation")
    return "Intentional compact text; the full value should be disclosed through title text, accessible text, or a detail path.";
  if (annotation === "allow-compressed-control")
    return "Visible control text is intentionally abbreviated; the full value should remain available through title text or adjacent context.";
  if (annotation === "allow-lonely-row") return "A single wrapped control row is a deliberate responsive layout choice.";
  if (annotation === "allow-fragmented-controls") return "A multi-row control group is intentional for this responsive state.";
  if (annotation === "allow-small-target") return "A smaller target is intentional for a non-primary or densely repeated control.";
  if (annotation === "allow-unlabeled-control") return "The control is intentionally unnamed because it is not user-facing.";
  if (annotation === "allow-sticky-overlap") return "Sticky or fixed overlap is intentional for this component contract.";
  if (annotation === "allow-unreachable-scroll") return "The scroll reachability rule is intentionally suppressed for this container.";
  if (annotation.startsWith("overflow:")) return "Overflow or clipping is an explicit component contract.";
  if (annotation.startsWith("scroll-container:"))
    return "The component is expected to keep overflowing content reachable through native scrolling.";
  if (annotation.startsWith("align-group:")) return "The component participates in an explicit alignment contract.";
  if (annotation.startsWith("sticky-guard:")) return "The component participates in sticky overlap checks.";
  return "Intentional UI-model annotation.";
}

function componentForSelector(selector) {
  const normalized = String(selector ?? "");
  const knownComponents = [
    [/tooltip-trigger|info-tooltip/i, "Info tooltip"],
    [/thread-preview|thread-row|project-list|sidebar/i, "Sidebar threads"],
    [/statusbar|workspace-chip|branch-chip|git-work-mode/i, "Statusbar"],
    [/composer|model-selector/i, "Composer"],
    [/project-board-candidate-detail|draft-detail/i, "Project Board detail"],
    [/project-board-card|project-board-draft|project-board-charter|project-board/i, "Project Board"],
    [/task-kanban|task-card|local-task|automation-field/i, "Local Tasks"],
    [/permission-dialog|permission-prompt/i, "Permission dialog"],
    [/browser-picker|element-picker/i, "Browser picker"],
    [/plugin-import|plugin-card|plugin-marketplace/i, "Plugins"],
    [/workflow-run|workflow-artifact|workflow-build|workflow-runs|workflow-review/i, "Workflow Agent"],
    [/api-key|secret/i, "API key dialog"],
  ];
  for (const [pattern, component] of knownComponents) {
    if (pattern.test(normalized)) return component;
  }
  const classMatch = normalized.match(/\.([a-zA-Z][a-zA-Z0-9_-]*)/);
  if (classMatch) return humanizeSelectorToken(classMatch[1]);
  const tagMatch = normalized.match(/^[a-zA-Z][a-zA-Z0-9-]*/);
  return tagMatch ? humanizeSelectorToken(tagMatch[0]) : "Unclassified";
}

function humanizeSelectorToken(token) {
  return String(token)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function escapeMd(value) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ")
    .slice(0, 500);
}

function htmlReport(summary, models) {
  const rows = summary.scenarios
    .map(
      (scenario) => `
        <tr>
          <td><a href="#${escapeAttr(scenario.scenario)}">${escapeHtml(scenario.scenario)}</a></td>
          <td>${escapeHtml(scenario.surface)}</td>
          <td>${escapeHtml(scenario.exposure)}</td>
          <td>${scenario.viewport.width}x${scenario.viewport.height}</td>
          <td>${scenario.visibleNodeCount}</td>
          <td>${scenario.accessibilityNodeCount}</td>
          <td>${scenario.tooltipSampleCount}</td>
          <td>${scenario.violationCount}</td>
          <td>${scenario.gateFailureCount}</td>
        </tr>`,
    )
    .join("");
  const findingGroupsSection = summary.violationGroups.length
    ? reportGroupsTable(
        "Finding Groups",
        ["Count", "Gate Failures", "Gate", "Impact", "Surface", "Component", "Type", "Scenarios", "Sample Selector"],
        summary.violationGroups
          .slice(0, 30)
          .map((group) => [
            group.violationCount,
            group.gateFailureCount,
            group.gate,
            group.impact,
            group.surface,
            group.component,
            group.type,
            group.scenarios.join(", "),
            group.sampleSelector,
          ]),
      )
    : "";
  const annotationGroupsSection = summary.annotationGroups.length
    ? reportGroupsTable(
        "Annotation Inventory",
        ["Nodes", "Surface", "Component", "Annotation", "Scenarios", "Rationale", "Sample Selector"],
        summary.annotationGroups
          .slice(0, 30)
          .map((group) => [
            group.nodeCount,
            group.surface,
            group.component,
            group.annotation,
            group.scenarios.join(", "),
            group.rationale,
            group.sampleSelector,
          ]),
      )
    : "";
  const sections = models
    .map((model) => {
      const violations = model.violations.length
        ? model.violations.map((violation) => violationCard(model, violation)).join("")
        : `<p class="empty">No violations reported.</p>`;
      return `
        <section class="scenario" id="${escapeAttr(model.scenario)}">
          <div class="scenario-heading">
            <div>
              <h2>${escapeHtml(model.scenario)}</h2>
              <p>${escapeHtml(model.scenarioMeta.description)}</p>
            </div>
            <div class="scenario-actions">
              <a href="./${encodeURIComponent(model.scenario)}.json">JSON</a>
            </div>
          </div>
          <div class="meta">
            <span>Surface: <strong>${escapeHtml(model.scenarioMeta.surface)}</strong></span>
            <span>Exposure: <strong>${escapeHtml(model.scenarioMeta.exposure)}</strong></span>
            <span>Viewport: <strong>${model.viewport.width}x${model.viewport.height}</strong></span>
            <span>Gate failures: <strong>${model.summary.gateFailureCount ?? 0}</strong></span>
          </div>
          <div class="violations">${violations}</div>
        </section>`;
    })
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>UI Model Report</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7f9;
      --panel: #ffffff;
      --text: #172033;
      --muted: #657085;
      --line: #d8dde8;
      --soft: #eef2f7;
      --fail: #b42318;
      --report: #175cd3;
      --minor: #667085;
      --major: #b54708;
      --blocker: #b42318;
      --accessibility: #6941c6;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    header {
      padding: 28px 32px 18px;
      border-bottom: 1px solid var(--line);
      background: var(--panel);
    }
    main { max-width: 1320px; margin: 0 auto; padding: 24px 28px 56px; }
    h1, h2, h3, p { margin: 0; }
    h1 { font-size: 24px; line-height: 1.2; }
    h2 { font-size: 19px; line-height: 1.25; }
    h3 { font-size: 14px; line-height: 1.3; }
    a { color: var(--report); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .subtle { color: var(--muted); margin-top: 6px; }
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      margin-top: 18px;
    }
    .stat, .notice, .scenario, .violation {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
    }
    .stat { padding: 14px; }
    .stat span { color: var(--muted); display: block; font-size: 12px; }
    .stat strong { display: block; font-size: 22px; margin-top: 4px; }
    .notice {
      padding: 12px 14px;
      margin: 0 0 18px;
      color: #344054;
      background: #fffdf5;
      border-color: #f2d680;
    }
    .table-wrap {
      overflow: auto;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      margin-bottom: 22px;
    }
    .grouped-table {
      margin: 0 0 22px;
    }
    .grouped-table h2 {
      margin: 0 0 10px;
    }
    .grouped-table td:last-child {
      white-space: normal;
      overflow-wrap: anywhere;
      min-width: 240px;
    }
    table { width: 100%; border-collapse: collapse; min-width: 880px; }
    th, td { padding: 9px 10px; text-align: left; border-bottom: 1px solid var(--line); white-space: nowrap; }
    th { font-size: 12px; color: var(--muted); background: var(--soft); }
    tr:last-child td { border-bottom: 0; }
    .scenario { margin-top: 18px; padding: 16px; }
    .scenario-heading {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 10px;
    }
    .scenario-heading p { color: var(--muted); margin-top: 4px; }
    .scenario-actions a, .repro-link {
      display: inline-flex;
      align-items: center;
      min-height: 30px;
      padding: 5px 10px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #fff;
      font-weight: 600;
      white-space: nowrap;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 10px 0 14px;
      color: var(--muted);
    }
    .meta span, .pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      min-height: 24px;
      padding: 2px 8px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: var(--soft);
      font-size: 12px;
    }
    .violations { display: grid; gap: 10px; }
    .violation { padding: 12px; }
    .violation-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 8px;
    }
    .violation-title { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .pill.fail { color: #fff; background: var(--fail); border-color: var(--fail); }
    .pill.report { color: #fff; background: var(--report); border-color: var(--report); }
    .pill.major { color: #fff; background: var(--major); border-color: var(--major); }
    .pill.blocker { color: #fff; background: var(--blocker); border-color: var(--blocker); }
    .pill.accessibility { color: #fff; background: var(--accessibility); border-color: var(--accessibility); }
    .pill.minor { color: #fff; background: var(--minor); border-color: var(--minor); }
    .selector, pre {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
    }
    .selector {
      margin-top: 8px;
      padding: 8px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #f9fafb;
      color: #344054;
    }
    .message { color: #344054; margin-top: 6px; }
    details { margin-top: 8px; }
    summary { cursor: pointer; color: var(--report); font-weight: 600; }
    pre { max-height: 220px; overflow: auto; padding: 10px; background: #111827; color: #f9fafb; border-radius: 6px; }
    .empty { color: var(--muted); padding: 8px 0; }
  </style>
</head>
<body>
  <header>
    <h1>UI Model Report</h1>
    <p class="subtle">Generated ${escapeHtml(summary.generatedAt)} from workspace <code>${escapeHtml(summary.workspace)}</code></p>
    <div class="cards">
      <div class="stat"><span>Scenarios</span><strong>${summary.scenarios.length}</strong></div>
      <div class="stat"><span>Violations</span><strong>${summary.violationCount}</strong></div>
      <div class="stat"><span>Gate failures</span><strong>${summary.gateFailureCount}</strong></div>
      <div class="stat"><span>Theme</span><strong>${escapeHtml(summary.themePreference)}</strong></div>
      <div class="stat"><span>Profiles</span><strong>${escapeHtml(summary.activeProfiles.join(", "))}</strong></div>
    </div>
  </header>
  <main>
    <p class="notice">Launch links require the local report server. Run <code>pnpm run test:ui-model:serve</code> and open this report through the printed localhost URL.</p>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Scenario</th>
            <th>Surface</th>
            <th>Exposure</th>
            <th>Viewport</th>
            <th>Nodes</th>
            <th>AX Nodes</th>
            <th>Tooltips</th>
            <th>Violations</th>
            <th>Gate Failures</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${findingGroupsSection}
    ${annotationGroupsSection}
    ${sections}
  </main>
</body>
</html>
`;
}

function reportGroupsTable(title, headers, rows) {
  return `
    <section class="grouped-table">
      <h2>${escapeHtml(title)}</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}
          </tbody>
        </table>
      </div>
    </section>`;
}

function violationCard(model, violation) {
  const details = JSON.stringify(violation.details ?? {}, null, 2);
  const launchUrl = `/repro?scenario=${encodeURIComponent(model.scenario)}&violation=${encodeURIComponent(violation.id)}`;
  return `
    <article class="violation" id="${escapeAttr(violation.id)}">
      <div class="violation-head">
        <div>
          <div class="violation-title">
            <span class="pill ${escapeAttr(violation.gate)}">${escapeHtml(violation.gate)}</span>
            <span class="pill ${escapeAttr(violation.impact)}">${escapeHtml(violation.impact)}</span>
            <h3>${escapeHtml(violation.type)}</h3>
            <span class="pill">${escapeHtml(violation.id)}</span>
          </div>
          <p class="message">${escapeHtml(violation.message ?? violation.text ?? "")}</p>
        </div>
        <a class="repro-link" href="${launchUrl}" target="_blank" rel="noreferrer">Launch repro</a>
      </div>
      ${violation.selector ? `<div class="selector">${escapeHtml(violation.selector)}</div>` : ""}
      ${violation.text ? `<p class="message">${escapeHtml(violation.text)}</p>` : ""}
      <details>
        <summary>Details</summary>
        <pre>${escapeHtml(details)}</pre>
      </details>
    </article>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(String(value ?? "").replace(/[^a-zA-Z0-9_-]/g, "-"));
}
