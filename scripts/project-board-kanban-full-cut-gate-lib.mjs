import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const KANBAN_FULL_CUT_PHASES = [
  {
    number: 1,
    title: "Canonical Card Projection",
    evidenceFragments: ["test:project-board-kanban-canonical-projection:gmi", "Phase 1 Gates A and B"],
  },
  {
    number: 2,
    title: "Deliverable Integration Queue",
    evidenceFragments: ["test:project-board-kanban-pomodoro-root:gmi", "test:project-board-kanban-recipe-index:gmi"],
  },
  {
    number: 3,
    title: "Planning Snapshot Transactions",
    evidenceFragments: ["test:project-board-kanban-expense-streaming:gmi", "test:project-board-kanban-add-cards-after-ticketization:gmi"],
  },
  {
    number: 4,
    title: "Dependency Artifact Semantics",
    evidenceFragments: [
      "test:project-board-kanban-link-checker-dependency-import:gmi",
      "test:project-board-kanban-todo-deduper-implementation-bundle:gmi",
    ],
  },
  {
    number: 5,
    title: "Semantic Permission Intents",
    evidenceFragments: [
      "test:project-board-kanban-markdown-regex-proof-permission:gmi",
      "test:project-board-kanban-expense-null-scratch-permission:gmi",
    ],
  },
  {
    number: 6,
    title: "Source Authority And Promotion",
    evidenceFragments: [
      "test:project-board-kanban-unit-converter-source-authority:gmi",
      "test:project-board-kanban-health-report-artifact-promotion:gmi",
    ],
  },
  {
    number: 7,
    title: "Native Task Action Hardening",
    evidenceFragments: [
      "test:project-board-kanban-contrast-native-task-actions:gmi",
      "test:project-board-kanban-durable-completion-provider-error:gmi",
      "native project-board task tools as the primary path",
      "fenced <code>task_actions</code> JSON as a strict compatibility fallback",
    ],
  },
];

export const KANBAN_FULL_CUT_GMI_SCRIPTS = [
  ["test:project-board-kanban-canonical-projection:gmi", "node scripts/e2e-kanban-canonical-card-projection-gmi.mjs"],
  ["test:project-board-kanban-deliverable-integration:gmi", "node scripts/e2e-kanban-deliverable-integration-gmi.mjs"],
  ["test:project-board-kanban-pomodoro-root:gmi", "node scripts/e2e-kanban-pomodoro-root-integration-gmi.mjs"],
  ["test:project-board-kanban-recipe-index:gmi", "node scripts/e2e-kanban-recipe-index-multitask-gmi.mjs"],
  ["test:project-board-kanban-planning-snapshot:gmi", "node scripts/e2e-kanban-planning-snapshot-ticketization-gmi.mjs"],
  ["test:project-board-kanban-expense-streaming:gmi", "node scripts/e2e-kanban-expense-streaming-snapshot-gmi.mjs"],
  ["test:project-board-kanban-add-cards-after-ticketization:gmi", "node scripts/e2e-kanban-add-cards-after-ticketization-gmi.mjs"],
  ["test:project-board-kanban-link-checker-dependency-import:gmi", "node scripts/e2e-kanban-link-checker-dependency-import-gmi.mjs"],
  ["test:project-board-kanban-todo-deduper-implementation-bundle:gmi", "node scripts/e2e-kanban-todo-deduper-implementation-bundle-gmi.mjs"],
  ["test:project-board-kanban-markdown-regex-proof-permission:gmi", "node scripts/e2e-kanban-markdown-regex-proof-permission-gmi.mjs"],
  ["test:project-board-kanban-expense-null-scratch-permission:gmi", "node scripts/e2e-kanban-expense-null-scratch-permission-gmi.mjs"],
  ["test:project-board-kanban-unit-converter-source-authority:gmi", "node scripts/e2e-kanban-unit-converter-source-authority-gmi.mjs"],
  ["test:project-board-kanban-health-report-artifact-promotion:gmi", "node scripts/e2e-kanban-health-report-artifact-promotion-gmi.mjs"],
  ["test:project-board-kanban-contrast-native-task-actions:gmi", "node scripts/e2e-kanban-contrast-native-task-actions-gmi.mjs"],
  ["test:project-board-kanban-durable-completion-provider-error:gmi", "node scripts/e2e-kanban-durable-completion-provider-error-gmi.mjs"],
];

export async function evaluateKanbanFullCutGate({ repoRoot }) {
  const facts = await readKanbanFullCutGateFacts(repoRoot);
  return evaluateKanbanFullCutGateFacts(facts);
}

export async function readKanbanFullCutGateFacts(repoRoot) {
  const packageJson = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8"));
  const planHtml = await readFile(join(repoRoot, "kanbanAbstractionImprovement.html"), "utf8");
  const taskToolsSource = await readFile(join(repoRoot, "src", "main", "projectBoardTaskTools.ts"), "utf8");
  const scriptSources = {};
  for (const [, command] of KANBAN_FULL_CUT_GMI_SCRIPTS) {
    const scriptPath = packageScriptPath(command);
    if (!scriptPath || scriptSources[scriptPath]) continue;
    scriptSources[scriptPath] = await readFile(join(repoRoot, scriptPath), "utf8").catch(() => undefined);
  }
  return { packageJson, planHtml, taskToolsSource, scriptSources };
}

export function evaluateKanbanFullCutGateFacts(facts) {
  const phaseSections = extractKanbanPhaseSections(facts.planHtml);
  const checks = [
    phaseMapCheck(facts.planHtml, phaseSections),
    ...KANBAN_FULL_CUT_PHASES.flatMap((phase) => [phaseStructureCheck(phase, phaseSections.get(phase.number)), phaseEvidenceCheck(phase, phaseSections.get(phase.number))]),
    packageScriptsCheck(facts.packageJson),
    harnessSourceCheck(facts.packageJson, facts.scriptSources),
    nativeTaskPromptContractCheck(facts.taskToolsSource),
    releaseGuidanceCheck(facts.planHtml, facts.packageJson),
    planClosureStateCheck(facts.planHtml),
  ];
  const issues = checks.filter((item) => item.status === "fail").map((item) => item.issue);
  return {
    version: 1,
    status: issues.length === 0 ? "passed" : "failed",
    generatedAt: new Date().toISOString(),
    summary:
      issues.length === 0
        ? "Kanban abstraction full-cut gate passed."
        : `Kanban abstraction full-cut gate failed with ${issues.length} issue${issues.length === 1 ? "" : "s"}.`,
    issues,
    checks,
  };
}

export function extractKanbanPhaseSections(planHtml) {
  const sections = new Map();
  const pattern =
    /<h2>Phase\s+(\d+):\s*([^<]+)<\/h2>([\s\S]*?)(?=\n\s*<h2>Phase\s+\d+:|\n\s*<h2>Cross-Phase|\n\s*<h2>Implementation Order Summary|\n\s*<h2>Release Cut Guidance|\n\s*<footer>)/g;
  for (const match of planHtml.matchAll(pattern)) {
    sections.set(Number(match[1]), { number: Number(match[1]), title: match[2].trim(), html: match[3] });
  }
  return sections;
}

function phaseMapCheck(planHtml, phaseSections) {
  const numbers = [...phaseSections.keys()].sort((left, right) => left - right);
  const expectedNumbers = KANBAN_FULL_CUT_PHASES.map((phase) => phase.number);
  const titlesMatch = KANBAN_FULL_CUT_PHASES.every((phase) => phaseSections.get(phase.number)?.title === phase.title);
  const ok =
    planHtml.includes("Seven-phase roadmap") &&
    planHtml.includes("All seven phases") &&
    JSON.stringify(numbers) === JSON.stringify(expectedNumbers) &&
    titlesMatch;
  return check(
    "kanban seven-phase map",
    ok,
    "kanbanAbstractionImprovement.html must retain exactly the reviewed seven phases and Full Cut guidance.",
    `numbers=${JSON.stringify(numbers)}; titlesMatch=${titlesMatch}`,
  );
}

function phaseStructureCheck(phase, section) {
  const html = section?.html ?? "";
  const missing = [];
  if (!section) missing.push("phase section");
  if (!html.includes("<h3>Implementation Slice</h3>")) missing.push("Implementation Slice");
  if (!html.includes("<h3>Progress</h3>")) missing.push("Progress");
  if (!html.includes("<h3>Gate Scenarios</h3>")) missing.push("Gate Scenarios");
  if (!/<h4>A\./.test(html)) missing.push("Gate A");
  if (!/<h4>B\./.test(html)) missing.push("Gate B");
  return check(
    `phase ${phase.number} structure`,
    missing.length === 0,
    `Phase ${phase.number} must keep separate Implementation Slice, Progress, and Gate Scenario sections with Gate A and B.`,
    `missing=${JSON.stringify(missing)}`,
  );
}

function phaseEvidenceCheck(phase, section) {
  const html = section?.html ?? "";
  const missing = phase.evidenceFragments.filter((fragment) => !html.includes(fragment));
  return check(
    `phase ${phase.number} closure evidence`,
    missing.length === 0,
    `Phase ${phase.number} must cite its completed gate evidence in kanbanAbstractionImprovement.html.`,
    `missing=${JSON.stringify(missing)}`,
  );
}

function packageScriptsCheck(packageJson) {
  const missing = KANBAN_FULL_CUT_GMI_SCRIPTS.filter(([name, command]) => packageJson.scripts?.[name] !== command).map(
    ([name, command]) => `${name} expected ${command}, got ${packageJson.scripts?.[name] ?? "<missing>"}`,
  );
  return check(
    "package kanban GMI gate scripts",
    missing.length === 0,
    "package.json must expose every reviewed kanban GMI gate script with its deterministic command.",
    `missing=${JSON.stringify(missing)}`,
  );
}

function harnessSourceCheck(packageJson, scriptSources) {
  const missing = [];
  for (const [name, command] of KANBAN_FULL_CUT_GMI_SCRIPTS) {
    const scriptPath = packageScriptPath(packageJson.scripts?.[name] ?? command);
    const source = combinedHarnessSource(scriptPath, scriptSources);
    if (!source) {
      missing.push(`${name}: missing ${scriptPath}`);
      continue;
    }
    if (!/gmi-cloud|GMI_CLOUD|GMI_API_KEY/.test(source)) missing.push(`${name}: missing GMI Cloud launch/key guard`);
    if (!source.includes("ambientCoderArchive")) missing.push(`${name}: missing Documents/ambientCoderArchive snapshot default`);
  }
  return check(
    "kanban GMI harness source contracts",
    missing.length === 0,
    "Kanban GMI harnesses must keep the temporary GMI Cloud override and local snapshot default visible in source.",
    `missing=${JSON.stringify(missing)}`,
  );
}

function combinedHarnessSource(scriptPath, scriptSources) {
  const source = scriptSources[scriptPath];
  if (!source) return "";
  const imported = [...source.matchAll(/import\("\.\/([^"]+\.mjs)"\)/g)]
    .map((match) => `scripts/${match[1]}`)
    .map((path) => scriptSources[path])
    .filter(Boolean)
    .join("\n");
  return `${source}\n${imported}`;
}

function nativeTaskPromptContractCheck(taskToolsSource) {
  const required = [
    "Primary path: call native project-board task tools directly",
    "Ambient fills actionId, createdAt, cardId, taskId, and runId for native tool calls when you omit them.",
    "Fallback path: use a fenced ```task_actions JSON array only when native task tools are unavailable",
    "Fallback JSON requirements (only when native task tools are unavailable):",
  ];
  const forbidden = ["If Ambient exposes native tools named task_show", "Every action must include actionId and createdAt"];
  const missing = required.filter((fragment) => !taskToolsSource.includes(fragment));
  const presentForbidden = forbidden.filter((fragment) => taskToolsSource.includes(fragment));
  return check(
    "native task action prompt contract",
    missing.length === 0 && presentForbidden.length === 0,
    "Phase 7 must keep native task tools as the primary contract and fenced task_actions JSON as fallback-only.",
    `missing=${JSON.stringify(missing)}; presentForbidden=${JSON.stringify(presentForbidden)}`,
  );
}

function releaseGuidanceCheck(planHtml, packageJson) {
  const script = packageJson.scripts?.["test:project-board-kanban-full-cut-gate"];
  const ok =
    script === "node scripts/project-board-kanban-full-cut-gate.mjs" &&
    planHtml.includes("test:project-board-kanban-full-cut-gate") &&
    planHtml.includes("Kanban full-cut gate");
  return check(
    "kanban full-cut release guidance",
    ok,
    "Release Cut Guidance must name the local kanban full-cut gate and package.json must expose it.",
    `script=${script ?? "<missing>"}`,
  );
}

function planClosureStateCheck(planHtml) {
  const required = [
    "Plan Closure State",
    "All seven ordered phase gates are complete.",
    "There is no remaining implementation slice in this",
    "future work should start from a new plan or an explicitly reopened gate.",
    "deterministic stop condition is",
  ];
  const missing = required.filter((fragment) => !planHtml.includes(fragment));
  return check(
    "kanban plan closure state",
    missing.length === 0,
    "Release Cut Guidance must explicitly mark the seven-phase kanban plan closed with no remaining implementation slice.",
    `missing=${JSON.stringify(missing)}`,
  );
}

function packageScriptPath(command) {
  const match = typeof command === "string" ? command.match(/^node\s+([^\s]+\.mjs)(?:\s|$)/) : undefined;
  return match?.[1];
}

function check(name, passed, issue, evidence) {
  return { name, status: passed ? "pass" : "fail", passed, issue: passed ? undefined : issue, evidence };
}
