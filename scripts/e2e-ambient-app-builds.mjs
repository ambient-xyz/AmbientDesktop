#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { snapshotHarnessWorkspace, writeHarnessTraceArtifacts } from "./harness-trace-artifacts.mjs";

const require = createRequire(import.meta.url);
const basePort = Number(process.env.AMBIENT_APP_BUILDS_CDP_PORT ?? 9481);
const timeoutMs = Number(process.env.AMBIENT_APP_BUILDS_TIMEOUT_MS ?? 600_000);
const modelOverride = process.env.AMBIENT_APP_BUILDS_MODEL || process.env.AMBIENT_LIVE_MODEL;
const selectedScenarioIds = new Set(
  (process.env.AMBIENT_APP_BUILDS_SCENARIOS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
);
const keepWorkspaces = process.env.AMBIENT_APP_BUILDS_KEEP_WORKSPACES === "1";
const electronBinary = resolve("node_modules", ".bin", process.platform === "win32" ? "electron.cmd" : "electron");
const electronPackageRoot = dirname(require.resolve("electron/package.json"));
const electronExecutable =
  process.platform === "darwin"
    ? join(electronPackageRoot, "dist", "Electron.app", "Contents", "MacOS", "Electron")
    : process.platform === "win32"
      ? join(electronPackageRoot, "dist", "electron.exe")
      : join(electronPackageRoot, "dist", "electron");
const output = [];
const children = new Set();

class DesktopHarnessError extends Error {}
class GeneratedAppError extends Error {}

const scenarios = [
  {
    id: "html-calculator",
    title: "HTML Calculator",
    finalToken: "APP_BUILD_DONE:html-calculator",
    spec: calculatorSpec(),
    validate: validateCalculator,
  },
  {
    id: "electron-rich-text-editor",
    title: "Electron Rich Text Editor",
    finalToken: "APP_BUILD_DONE:electron-rich-text-editor",
    spec: richTextEditorSpec(),
    validate: validateRichTextEditor,
  },
  {
    id: "persistent-todo-tool",
    title: "Persistent Todo Tool",
    finalToken: "APP_BUILD_DONE:persistent-todo-tool",
    spec: todoToolSpec(),
    validate: validateTodoTool,
  },
];

const results = [];
const scenariosToRun =
  selectedScenarioIds.size > 0 ? scenarios.filter((scenario) => selectedScenarioIds.has(scenario.id)) : scenarios;

if (scenariosToRun.length === 0) {
  throw new Error(
    `No Ambient app-build scenarios matched AMBIENT_APP_BUILDS_SCENARIOS=${JSON.stringify([
      ...selectedScenarioIds,
    ].join(","))}. Available scenarios: ${scenarios.map((scenario) => scenario.id).join(", ")}`,
  );
}

for (const [index, scenario] of scenariosToRun.entries()) {
  const workspace = await mkdtemp(join(tmpdir(), `ambient-app-build-${scenario.id}-`));
  let appInstance;
  let scenarioFailed = false;
  let beforeWorkspace;
  try {
    console.log(`[ambient-app-builds] Starting ${scenario.id} in ${workspace}`);
    await seedScenarioWorkspace(workspace, scenario);
    beforeWorkspace = await snapshotHarnessWorkspace(workspace);
    appInstance = await launchApp(workspace, basePort + index);
    const result = await runScenario(appInstance.cdp, scenario, workspace, beforeWorkspace);
    results.push(result);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    scenarioFailed = true;
    const failure = {
      id: scenario.id,
      title: scenario.title,
      status: "failed",
      classification: classifyError(error),
      workspace,
      error: error instanceof Error ? error.message : String(error),
      outputTail: outputTail(),
    };
    results.push(failure);
    console.error(JSON.stringify(failure, null, 2));
  } finally {
    if (appInstance) {
      appInstance.cdp.close();
      await terminateProcessTree(appInstance.child);
    }
    await terminateDebugPortProcesses(basePort + index);
    if (scenarioFailed || keepWorkspaces) {
      console.error(`[ambient-app-builds] Kept ${scenario.id} workspace for inspection: ${workspace}`);
    } else {
      await rm(workspace, { recursive: true, force: true });
    }
  }
}

const summary = {
  total: results.length,
  passed: results.filter((result) => result.status === "passed").length,
  failed: results.filter((result) => result.status !== "passed").length,
  results,
};
console.log(JSON.stringify(summary, null, 2));

if (summary.failed > 0) {
  throw new Error(`${summary.failed} Ambient app-build scenario(s) failed.`);
}

console.log("Live Ambient app-build benchmark passed.");

async function seedScenarioWorkspace(root, scenario) {
  if (scenario.id === "electron-rich-text-editor") {
    await mkdir(join(root, "node_modules", ".bin"), { recursive: true });
    const launcherPath = join(root, "node_modules", ".bin", process.platform === "win32" ? "electron.cmd" : "electron");
    if (process.platform === "win32") {
      await writeFile(launcherPath, `@"${electronExecutable}" %*\r\n`, "utf8");
    } else {
      await writeFile(launcherPath, `#!/bin/sh\nexec ${shellQuote(electronExecutable)} "$@"\n`, "utf8");
      await chmod(launcherPath, 0o755);
    }
  }
  await writeFile(join(root, "SPEC.md"), scenario.spec, "utf8");
  await writeFile(
    join(root, "README.md"),
    [
      `# ${scenario.title} Build Workspace`,
      "",
      "Ambient Desktop should build the application described in SPEC.md.",
      "The full spec is also included in the user prompt for this benchmark.",
      scenario.id === "electron-rich-text-editor"
        ? "A local Electron launcher is already available at node_modules/.bin/electron for smoke checks."
        : "",
      "",
    ].join("\n"),
    "utf8",
  );
}

async function launchApp(workspace, port) {
  const child = spawn("pnpm", ["exec", "electron-vite", "dev", "--", `--remote-debugging-port=${port}`], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AMBIENT_DESKTOP_WORKSPACE: workspace,
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  children.add(child);
  child.once("exit", () => children.delete(child));
  child.stdout.on("data", (chunk) => output.push(chunk.toString("utf8")));
  child.stderr.on("data", (chunk) => output.push(chunk.toString("utf8")));

  const target = await waitForTarget(port);
  await delay(750);
  const cdp = await connectCdp(target.webSocketDebuggerUrl);
  await waitFor(cdp, () => document.body?.innerText.includes("Ambient"), "main shell", 30_000);
  return { child, cdp };
}

async function runScenario(cdp, scenario, workspace, beforeWorkspace) {
  const initialState = await desktopState(cdp);
  if (!initialState.provider.hasApiKey) {
    throw new Error(
      [
        "Ambient API key is missing.",
        "Save a key in the app, or launch this script with AMBIENT_API_KEY/AMBIENT_AGENT_AMBIENT_API_KEY.",
        "Keys can be created at https://app.ambient.xyz/keys.",
      ].join(" "),
    );
  }

  const keyCheck = await evaluate(cdp, "window.ambientDesktop.testAmbientApiKey()");
  if (!keyCheck?.ok) throw new Error(`Ambient API key check failed: ${keyCheck?.message ?? "unknown error"}`);

  const state = await evaluate(cdp, "window.ambientDesktop.createThread()");
  let runModel = modelOverride || state.settings.model;
  let live;
  let nextState;
  let toolTranscript = "";
  let validation;
  let traceWritten = false;
  const writeScenarioTrace = async (summary) => {
    if (traceWritten) return;
    await writeHarnessTraceArtifacts({ workspace, beforeWorkspace, messages: nextState?.messages, summary });
    traceWritten = true;
  };

  await installCollector(cdp);
  try {
    await sendPrompt(cdp, {
      threadId: state.activeThreadId,
      content: buildPrompt(scenario),
      permissionMode: "workspace",
      collaborationMode: "agent",
      model: runModel,
      thinkingLevel: "low",
    });

    await waitFor(cdp, () => Boolean(window.__ambientAppBuild?.sawRunStart), `${scenario.id} run start`, 45_000);
    await waitForCompletion(cdp, timeoutMs);

    live = await getCollectorState(cdp);
    nextState = await desktopState(cdp);
    const assistantText = nextState.messages
      .filter((message) => message.role === "assistant")
      .map((message) => message.content)
      .join("\n");
    toolTranscript = nextState.messages
      .filter((message) => message.role === "tool")
      .map((message) => `${message.metadata?.toolName ?? ""}\n${message.content}`)
      .join("\n");

    if (live.error) throw new Error(`Ambient Desktop run failed: ${live.error}`);
    if (live.toolMessageCount < 1 && live.toolEventCount < 1) {
      throw new Error(`${scenario.id} did not emit any tool activity.`);
    }

    try {
      validation = await scenario.validate(workspace);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new GeneratedAppError(`${scenario.title} validation failed: ${message}`);
    }

    if (!assistantText.includes(scenario.finalToken)) {
      throw new GeneratedAppError(
        `${scenario.title} app validated, but assistant did not finish with ${scenario.finalToken}. Assistant tail: ${assistantText.slice(-1000)}`,
      );
    }

    const summary = {
      id: scenario.id,
      title: scenario.title,
      status: "passed",
      classification: "passed",
      model: runModel,
      messageDeltaCount: live.messageDeltaCount,
      toolEventCount: live.toolEventCount,
      toolMessageCount: live.toolMessageCount,
      toolNames: [...new Set(live.toolNames)].sort(),
      validation,
      transcriptSample: toolTranscript.slice(-1200),
    };
    await writeScenarioTrace(summary);
    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      await writeScenarioTrace({
        id: scenario.id,
        title: scenario.title,
        status: "failed",
        classification: classifyError(error),
        model: runModel,
        messageDeltaCount: live?.messageDeltaCount,
        toolEventCount: live?.toolEventCount,
        toolMessageCount: live?.toolMessageCount,
        toolNames: [...new Set(live?.toolNames ?? [])].sort(),
        validation,
        error: message,
        transcriptSample: toolTranscript.slice(-1200),
      });
    } catch (traceError) {
      console.error(
        `[ambient-app-builds] Failed to write trace artifacts for ${scenario.id}: ${
          traceError instanceof Error ? traceError.message : String(traceError)
        }`,
      );
    }
    throw error;
  }
}

function buildPrompt(scenario) {
  return [
    "This is a live Ambient Desktop end-to-end application-build benchmark.",
    "Build the application described in the complete specification below.",
    "The same specification is also available in SPEC.md in this workspace.",
    "Use only local files and local test commands. Do not use the network. Do not install dependencies.",
    "After implementing the app, run the specified local tests/smokes and fix the app until they pass.",
    "",
    "VALIDATION CONTRACT:",
    "- Treat `npm test` from the workspace root as the authoritative validation command for this benchmark.",
    "- Ensure package.json contains a `scripts.test` entry that runs the required tests; do not rely only on direct `node --test` commands.",
    "- If `npm test` reports a missing test script, fix package.json and rerun `npm test`.",
    "- Also run any scenario-specific smoke command named in the specification.",
    "- Do not reply with the final token until the required files exist and the authoritative validation command passes.",
    "",
    `When finished, reply with exactly: ${scenario.finalToken}`,
    "",
    "COMPLETE APPLICATION SPECIFICATION:",
    "```markdown",
    scenario.spec,
    "```",
  ].join("\n");
}

async function validateCalculator(workspace) {
  requireFiles(workspace, ["package.json", "index.html", "src/calculator.js", "test/calculator.test.js"]);
  const testResult = await runCommand("npm", ["test"], workspace, 60_000);
  if (testResult.exitCode !== 0) {
    throw new Error(`npm test failed.\nSTDOUT:\n${testResult.stdout}\nSTDERR:\n${testResult.stderr}`);
  }

  const module = await importFresh(join(workspace, "src", "calculator.js"));
  if (typeof module.createCalculator !== "function") throw new Error("src/calculator.js must export createCalculator().");
  const calculator = module.createCalculator();
  for (const key of ["1", "2", "+", "7", "="]) calculator.press(key);
  if (calculator.display() !== "19") throw new Error(`Expected 12 + 7 to display 19, got ${calculator.display()}.`);
  for (const key of ["C", "8", "/", "0", "="]) calculator.press(key);
  if (!/error/i.test(calculator.display())) throw new Error("Division by zero must display an error state.");

  const html = await readFile(join(workspace, "index.html"), "utf8");
  for (const label of ["7", "8", "9", "+", "-", "*", "/", "=", "C"]) {
    if (!html.includes(label)) throw new Error(`Calculator UI is missing ${label} control.`);
  }

  return { npmTest: "passed", files: ["index.html", "src/calculator.js", "test/calculator.test.js"] };
}

async function validateRichTextEditor(workspace) {
  requireFiles(workspace, [
    "package.json",
    "main.js",
    "preload.js",
    "index.html",
    "renderer.js",
    "src/editorState.js",
    "test/editorState.test.js",
  ]);
  const testResult = await runCommand("npm", ["test"], workspace, 60_000);
  if (testResult.exitCode !== 0) {
    throw new Error(`npm test failed.\nSTDOUT:\n${testResult.stdout}\nSTDERR:\n${testResult.stderr}`);
  }
  for (const file of ["main.js", "preload.js", "renderer.js", "src/editorState.js"]) {
    const check = await runCommand("node", ["--check", file], workspace, 30_000);
    if (check.exitCode !== 0) throw new Error(`node --check ${file} failed.\n${check.stderr}${check.stdout}`);
  }
  const packageJson = JSON.parse(await readFile(join(workspace, "package.json"), "utf8"));
  if (packageJson.main !== "main.js") throw new Error('package.json must set "main": "main.js".');
  if (!packageJson.scripts?.test) throw new Error("package.json must include a test script.");
  if (packageJson.scripts?.start !== "electron .") throw new Error('package.json must include script "start": "electron .".');

  const editor = await importFresh(join(workspace, "src", "editorState.js"));
  for (const fn of [
    "createEditorState",
    "applyFormat",
    "insertText",
    "toggleBlock",
    "undo",
    "redo",
    "serializeDocument",
    "loadDocument",
  ]) {
    if (typeof editor[fn] !== "function") throw new Error(`src/editorState.js must export ${fn}().`);
  }
  let state = editor.createEditorState();
  state = editor.insertText(state, "Hello");
  state = editor.applyFormat(state, "bold");
  const serialized = editor.serializeDocument(state);
  const loaded = editor.loadDocument(serialized);
  if (!JSON.stringify(loaded).includes("Hello")) throw new Error("Editor state did not preserve inserted text after serialize/load.");
  const html = await readFile(join(workspace, "index.html"), "utf8");
  if (!/contenteditable/i.test(html)) throw new Error("Electron editor UI must include a contenteditable editor.");
  for (const label of ["bold", "italic", "underline", "heading", "save", "load"]) {
    if (!html.toLowerCase().includes(label)) throw new Error(`Electron editor UI is missing ${label} control text or label.`);
  }

  const smoke = await runCommand(electronBinary, [".", "--ambient-smoke"], workspace, 30_000, {
    AMBIENT_ELECTRON_EDITOR_SMOKE: "1",
  });
  if (smoke.exitCode !== 0) {
    throw new Error(`Electron smoke failed.\nSTDOUT:\n${smoke.stdout}\nSTDERR:\n${smoke.stderr}`);
  }

  return { npmTest: "passed", electronSmoke: "passed", files: ["main.js", "preload.js", "renderer.js", "src/editorState.js"] };
}

async function validateTodoTool(workspace) {
  requireFiles(workspace, ["package.json", "src/todoStore.js", "src/cli.js", "test/todoStore.test.js"]);
  const testResult = await runCommand("npm", ["test"], workspace, 60_000);
  if (testResult.exitCode !== 0) {
    throw new Error(`npm test failed.\nSTDOUT:\n${testResult.stdout}\nSTDERR:\n${testResult.stderr}`);
  }

  const storeModule = await importFresh(join(workspace, "src", "todoStore.js"));
  if (typeof storeModule.createTodoStore !== "function") throw new Error("src/todoStore.js must export createTodoStore().");
  const todoFile = join(workspace, "todos.validation.json");
  const store = storeModule.createTodoStore(todoFile);
  await store.load();
  const created = await store.add("ship app-build harness");
  await store.toggle(created.id, true);
  const loadedStore = storeModule.createTodoStore(todoFile);
  await loadedStore.load();
  const loaded = await loadedStore.list();
  if (loaded.length !== 1 || !loaded[0].completed) throw new Error("Todo store did not persist completed todo.");
  await loadedStore.delete(created.id);
  if ((await loadedStore.list()).length !== 0) throw new Error("Todo delete did not persist.");

  const cliFile = join(workspace, "todos.cli.json");
  const env = { TODO_FILE: cliFile };
  const add = await runCommand("node", ["src/cli.js", "add", "write tests"], workspace, 30_000, env);
  if (add.exitCode !== 0) throw new Error(`CLI add failed.\n${add.stdout}${add.stderr}`);
  const list = await runCommand("node", ["src/cli.js", "list"], workspace, 30_000, env);
  if (list.exitCode !== 0 || !list.stdout.includes("write tests")) throw new Error(`CLI list failed.\n${list.stdout}${list.stderr}`);
  const cliId = list.stdout.match(/\b(\d+)\b/)?.[1] ?? "1";
  const del = await runCommand("node", ["src/cli.js", "delete", cliId], workspace, 30_000, env);
  if (del.exitCode !== 0) throw new Error(`CLI delete failed.\n${del.stdout}${del.stderr}`);

  return { npmTest: "passed", cliSmoke: "passed", files: ["src/todoStore.js", "src/cli.js", "test/todoStore.test.js"] };
}

function calculatorSpec() {
  return [
    "# HTML Calculator Specification",
    "",
    "Build a static, dependency-free HTML calculator app.",
    "",
    "Required files:",
    "- package.json with `{ \"type\": \"module\" }` and script `test` that runs `node --test`.",
    "- index.html as the user-facing calculator.",
    "- src/calculator.js for calculator logic.",
    "- test/calculator.test.js using `node:test` and `node:assert/strict`.",
    "",
    "Functional requirements:",
    "- The calculator must support digits 0-9, decimal point, addition, subtraction, multiplication, division, equals, clear, backspace, sign toggle, and keyboard input.",
    "- Display must start at `0`, avoid invalid repeated decimals, and show a clear `Error` state for division by zero.",
    "- Chained operations should evaluate predictably left-to-right unless equals is pressed.",
    "- The HTML UI must include accessible buttons for all required controls and a visible display.",
    "- Styling should make the calculator usable at desktop and mobile widths.",
    "",
    "Logic API requirements:",
    "- `src/calculator.js` must export `createCalculator()`.",
    "- `createCalculator()` must return an object with `press(key)` and `display()` methods.",
    "- `press(key)` must accept string keys: `0`-`9`, `.`, `+`, `-`, `*`, `/`, `=`, `C`, `Backspace`, and `+/-`.",
    "",
    "Testing requirements:",
    "- Tests must cover basic arithmetic, decimal input, chained operations, clear, backspace, sign toggle, keyboard-equivalent keys, and division by zero.",
  ].join("\n");
}

function richTextEditorSpec() {
  return [
    "# Electron Rich Text Editor Specification",
    "",
    "Build a dependency-free Electron rich text editor app that can be launched with Electron.",
    "The benchmark workspace already provides a local Electron launcher at `node_modules/.bin/electron`; do not install dependencies and do not search system directories for Electron.",
    "",
    "Required files:",
    "- package.json with `{ \"type\": \"module\", \"main\": \"main.js\" }`, script `test` that runs `node --test`, and script `start` that runs `electron .`.",
    "- main.js, preload.js, index.html, renderer.js.",
    "- src/editorState.js for testable editor state logic.",
    "- test/editorState.test.js using `node:test` and `node:assert/strict`.",
    "",
    "Functional requirements:",
    "- Main window loads index.html through Electron with context isolation enabled and node integration disabled.",
    "- UI must include a contenteditable editor, toolbar buttons for bold, italic, underline, heading, unordered list, ordered list, undo, redo, save, load, and new document.",
    "- Documents must serialize to JSON with text content and formatting metadata.",
    "- Save/load should use Electron IPC from renderer/preload to main; file dialogs are acceptable for normal use.",
    "- The app must support an automated smoke mode: when launched with `--ambient-smoke` or `AMBIENT_ELECTRON_EDITOR_SMOKE=1`, it should open a hidden BrowserWindow, load the UI, verify the toolbar/editor exist, then exit with code 0. If smoke verification fails, exit nonzero.",
    "- If you run a smoke check yourself, use `npm start -- --ambient-smoke` after package.json exists, or `./node_modules/.bin/electron . --ambient-smoke`.",
    "",
    "State API requirements:",
    "- `src/editorState.js` must export `createEditorState`, `insertText`, `applyFormat`, `toggleBlock`, `undo`, `redo`, `serializeDocument`, and `loadDocument`.",
    "- State functions must be immutable: return a new state instead of mutating the input.",
    "",
    "Testing requirements:",
    "- Tests must cover inserting text, bold/italic/underline formatting, heading/list block toggles, undo/redo, serialize/load round trip, and loading invalid JSON safely.",
  ].join("\n");
}

function todoToolSpec() {
  return [
    "# Persistent Todo Tool Specification",
    "",
    "Build a dependency-free Node todo-list tool that persists todos to disk and can be tested end to end.",
    "",
    "Required files:",
    "- package.json with `{ \"type\": \"module\" }`, a `bin` entry or script for the CLI, and script `test` that runs `node --test`.",
    "- src/todoStore.js for persistence and operations.",
    "- src/cli.js for the command-line interface.",
    "- test/todoStore.test.js using `node:test` and `node:assert/strict`.",
    "",
    "Functional requirements:",
    "- Todos must have stable numeric ids, text, completed boolean, createdAt ISO timestamp, and updatedAt ISO timestamp.",
    "- Persist todos as JSON. Use `process.env.TODO_FILE` if set; otherwise use `todos.json` in the current working directory.",
    "- CLI commands: `add <text>`, `list`, `done <id>`, `undone <id>`, `delete <id>`, and `clear`.",
    "- `list` must show ids, completion state, and text in a human-readable format.",
    "- Deleting a todo must persist across later process invocations.",
    "- Invalid ids and empty todo text must fail with nonzero exit code and a useful error.",
    "",
    "Store API requirements:",
    "- `src/todoStore.js` must export `createTodoStore(filePath)`.",
    "- The returned store must provide async methods `add(text)`, `list()`, `toggle(id, completed)`, `delete(id)`, `clear()`, `load()`, and `save(todos)`.",
    "",
    "Testing requirements:",
    "- Tests must cover add/list persistence, toggle done/undone, delete persistence, clear persistence, invalid ids, and empty text validation.",
  ].join("\n");
}

function requireFiles(workspace, paths) {
  const missing = paths.filter((path) => !existsSync(join(workspace, path)));
  if (missing.length > 0) throw new Error(`Missing required files: ${missing.join(", ")}`);
}

async function importFresh(path) {
  return import(`${pathToFileURL(path).href}?cacheBust=${Date.now()}-${Math.random()}`);
}

async function installCollector(cdp) {
  await evaluate(
    cdp,
    `
    (() => {
      window.__ambientAppBuild?.unsubscribe?.();
      window.__ambientAppBuild = {
        statuses: [],
        messageDeltaCount: 0,
        toolEventCount: 0,
        toolMessageCount: 0,
        toolNames: [],
        assistantTail: "",
        toolTail: "",
        sawRunStart: false,
        sawRunIdle: false,
        sendResolved: false,
        error: undefined,
      };
      window.__ambientAppBuild.unsubscribe = window.ambientDesktop.onEvent((event) => {
        if (event.type === "run-status") {
          window.__ambientAppBuild.statuses.push(event.status);
          if (event.status !== "idle") window.__ambientAppBuild.sawRunStart = true;
          if (window.__ambientAppBuild.sawRunStart && event.status === "idle") window.__ambientAppBuild.sawRunIdle = true;
        }
        if (event.type === "message-delta") {
          window.__ambientAppBuild.messageDeltaCount += 1;
          window.__ambientAppBuild.assistantTail = (window.__ambientAppBuild.assistantTail + String(event.delta ?? "")).slice(-4000);
        }
        if (event.type === "tool-event") window.__ambientAppBuild.toolEventCount += 1;
        if ((event.type === "message-created" || event.type === "message-updated") && event.message?.role === "tool") {
          if (event.type === "message-created") window.__ambientAppBuild.toolMessageCount += 1;
          const toolName = String(event.message.metadata?.toolName ?? "");
          if (toolName) window.__ambientAppBuild.toolNames.push(toolName);
          window.__ambientAppBuild.toolTail = (window.__ambientAppBuild.toolTail + "\\n---\\n" + String(event.message.content ?? "")).slice(-4000);
        }
        if (event.type === "error") window.__ambientAppBuild.error = event.message;
      });
      return true;
    })()
  `,
  );
}

async function sendPrompt(cdp, input) {
  await evaluate(
    cdp,
    `
    (() => {
      const input = ${JSON.stringify(input)};
      window.ambientDesktop.sendMessage(input)
        .then(() => {
          window.__ambientAppBuild.sendResolved = true;
        })
        .catch((error) => {
          window.__ambientAppBuild.error = error instanceof Error ? error.message : String(error);
        });
      return true;
    })()
  `,
  );
}

async function waitForCompletion(cdp, maxMs) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const live = await getCollectorState(cdp);
    if (live.error) throw new Error(live.error);
    if (live.sawRunIdle && live.sendResolved) return;
    await delay(1_000);
  }
  const live = await getCollectorState(cdp);
  const lastToolEntry = String(live?.toolTail ?? "")
    .split("\n---\n")
    .filter(Boolean)
    .at(-1);
  const toolStillRunning = Boolean(lastToolEntry && /\brunning\b/i.test(lastToolEntry) && !/\b(completed|failed)\b/i.test(lastToolEntry));
  const TimeoutError = toolStillRunning ? DesktopHarnessError : GeneratedAppError;
  throw new TimeoutError(
    [
      `Timed out after ${maxMs}ms waiting for app-build completion.`,
      `statusesTail=${JSON.stringify((live?.statuses ?? []).slice(-40))}`,
      `sendResolved=${Boolean(live?.sendResolved)} sawRunIdle=${Boolean(live?.sawRunIdle)}`,
      `assistantTail=${JSON.stringify(live?.assistantTail ?? "")}`,
      `toolTail=${JSON.stringify(live?.toolTail ?? "")}`,
    ].join("\n"),
  );
}

async function getCollectorState(cdp) {
  return evaluate(
    cdp,
    `
    (() => {
      const live = window.__ambientAppBuild;
      return live ? {
        statuses: live.statuses,
        messageDeltaCount: live.messageDeltaCount,
        toolEventCount: live.toolEventCount,
        toolMessageCount: live.toolMessageCount,
        toolNames: live.toolNames,
        assistantTail: live.assistantTail,
        toolTail: live.toolTail,
        sawRunStart: live.sawRunStart,
        sawRunIdle: live.sawRunIdle,
        sendResolved: live.sendResolved,
        error: live.error,
      } : undefined;
    })()
  `,
  );
}

async function desktopState(cdp) {
  return evaluate(cdp, "window.ambientDesktop.bootstrap()");
}

async function waitForTarget(cdpPort) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
      const targets = await response.json();
      const target = targets.find((item) => item.webSocketDebuggerUrl && item.type === "page") ?? targets[0];
      if (target?.webSocketDebuggerUrl) return target;
    } catch {
      // App not listening yet.
    }
    await delay(250);
  }
  throw new DesktopHarnessError("Timed out waiting for Electron CDP target.");
}

function connectCdp(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    let nextId = 1;
    const pending = new Map();
    socket.addEventListener("open", () => {
      resolve({
        send(method, params = {}) {
          const id = nextId++;
          socket.send(JSON.stringify({ id, method, params }));
          return new Promise((innerResolve, innerReject) => {
            pending.set(id, { resolve: innerResolve, reject: innerReject });
            setTimeout(() => {
              if (!pending.has(id)) return;
              pending.delete(id);
              innerReject(new DesktopHarnessError(`Timed out waiting for CDP ${method}.`));
            }, 15_000);
          });
        },
        close() {
          socket.close();
        },
      });
    });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !pending.has(message.id)) return;
      const entry = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) entry.reject(new DesktopHarnessError(message.error.message ?? "CDP error"));
      else entry.resolve(message.result);
    });
    socket.addEventListener("error", () => reject(new DesktopHarnessError("CDP websocket failed.")));
  });
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new DesktopHarnessError(result.exceptionDetails.text ?? "Runtime.evaluate failed.");
  }
  return result.result?.value;
}

async function waitFor(cdp, predicate, label, maxMs = 10_000) {
  const expression = `(${predicate.toString()})()`;
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (await evaluate(cdp, expression)) return;
    await delay(150);
  }
  throw new DesktopHarnessError(`Timed out waiting for ${label}.`);
}

function runCommand(command, args, cwd, timeout = 60_000, extraEnv = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, timeout);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ exitCode: 1, stdout, stderr: String(error) });
    });
    child.on("close", (exitCode, signal) => {
      clearTimeout(timer);
      resolve({ exitCode: exitCode ?? (signal ? 124 : 1), stdout, stderr });
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function terminateProcessTree(proc) {
  children.delete(proc);
  if (proc.exitCode !== null || proc.signalCode !== null) return;
  const exited = new Promise((resolve) => proc.once("exit", resolve));
  try {
    if (process.platform === "win32") proc.kill("SIGTERM");
    else process.kill(-proc.pid, "SIGTERM");
  } catch {
    proc.kill("SIGTERM");
  }
  await Promise.race([exited, delay(1_500)]);
  if (proc.exitCode !== null || proc.signalCode !== null) return;
  try {
    if (process.platform === "win32") proc.kill("SIGKILL");
    else process.kill(-proc.pid, "SIGKILL");
  } catch {
    proc.kill("SIGKILL");
  }
  await Promise.race([exited, delay(500)]);
}

async function terminateDebugPortProcesses(port) {
  if (process.platform === "win32") return;
  const cwdPattern = process.cwd().replace(/[.[\]{}()*+?^$|\\]/g, "\\$&");
  await runIgnoringFailure("pkill", ["-f", `${cwdPattern}.*remote-debugging-port=${port}`]);
  await runIgnoringFailure("pkill", ["-f", `electron-vite dev -- --remote-debugging-port=${port}`]);
}

function runIgnoringFailure(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "ignore" });
    child.on("error", resolve);
    child.on("close", resolve);
  });
}

function classifyError(error) {
  if (error instanceof DesktopHarnessError) return "ambient-desktop-or-harness-failure";
  if (error instanceof GeneratedAppError) return "generated-app-or-model-limitation";
  const message = error instanceof Error ? error.message : String(error);
  if (/CDP|Ambient Desktop|run failed|tool activity|Timed out waiting for Electron/i.test(message)) {
    return "ambient-desktop-or-harness-failure";
  }
  return "generated-app-or-model-limitation";
}

function outputTail() {
  return `Electron output tail:\n${output.join("").split("\n").slice(-160).join("\n")}\n`;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}
