#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { deflateSync, inflateSync } from "node:zlib";
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

const port = Number(process.env.AMBIENT_E2E_PLUGIN_CDP_PORT ?? 9488);
const workspace = await mkdtemp(join(tmpdir(), "ambient-plugin-ui-"));
const userData = await mkdtemp(join(tmpdir(), "ambient-plugin-ui-data-"));
const sandboxedPiFixture = await mkdtemp(join(tmpdir(), "ambient-plugin-sandboxed-pi-"));
const privilegedPiFixture = await mkdtemp(join(tmpdir(), "ambient-plugin-privileged-pi-"));
const resultsDir = join(process.cwd(), "test-results", "plugins");
const baselineDir = join(process.cwd(), "test", "plugin-visual-baselines");
const diffDir = join(resultsDir, "diffs");
const scenarioNames = [
  "00-generated-source-history",
  "01-sandboxed-installed",
  "02-sandboxed-uninstalled-empty",
  "03-sandbox-fallback-privileged-scan",
  "04-privileged-installed-disabled",
  "05-privileged-uninstalled-empty",
  "06-open-panel-fallback-event-refresh",
];
const updateBaselines = process.argv.includes("--update-baseline") || process.env.AMBIENT_PLUGIN_UPDATE_VISUAL_BASELINES === "1";
const compareBaselines = process.argv.includes("--compare-baseline") || process.argv.includes("--full") || process.env.AMBIENT_PLUGIN_COMPARE_VISUAL_BASELINES === "1";
const output = [];
const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
let appInstance;

try {
  await rm(resultsDir, { recursive: true, force: true });
  await mkdir(resultsDir, { recursive: true });
  await seedWorkspace(workspace);
  await seedSandboxedPiFixture(sandboxedPiFixture);
  await seedPrivilegedPiFixture(privilegedPiFixture);
  appInstance = await launchApp();
  await runPluginUiSmoke(appInstance.cdp);
  await writeVisualManifest();
  if (updateBaselines) await updateVisualBaselines();
  if (compareBaselines) await compareVisualBaselines();
  console.log("Plugin UI smoke passed.");
} catch (error) {
  console.error(outputTail());
  throw error;
} finally {
  appInstance?.cdp.close();
  if (appInstance?.child) await terminateProcessTree(appInstance.child);
  await terminateDebugPortProcesses();
  await rm(workspace, { recursive: true, force: true });
  await rm(userData, { recursive: true, force: true });
  await rm(sandboxedPiFixture, { recursive: true, force: true });
  await rm(privilegedPiFixture, { recursive: true, force: true });
}

async function seedWorkspace(root) {
  await writeFile(join(root, "README.md"), "# Plugin UI smoke\n", "utf8");
  await writeFile(
    join(root, "package.json"),
    JSON.stringify(
      {
        name: "ambient-plugin-ui-workspace",
        version: "0.1.0",
        description: "Workspace Pi metadata fixture for the focused plugin UI smoke.",
        pi: {
          extensions: ["./extensions/index.ts"],
          skills: ["./skills"],
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  await seedGeneratedCapabilityHistoryFixture(root);
}

async function seedGeneratedCapabilityHistoryFixture(root) {
  const packageRoot = join(root, ".ambient", "capability-builder", "packages", "ambient-e2e-tts");
  const invalidPackageRoot = join(root, ".ambient", "capability-builder", "packages", "ambient-broken-tts");
  await mkdir(join(packageRoot, "scripts"), { recursive: true });
  await mkdir(join(packageRoot, "tests"), { recursive: true });
  await mkdir(invalidPackageRoot, { recursive: true });
  await writeFile(
    join(packageRoot, "ambient-cli.json"),
    JSON.stringify(
      {
        name: "ambient-e2e-tts",
        version: "0.1.0",
        description: "Deterministic generated TTS capability source fixture.",
        skills: "./SKILL.md",
        commands: {
          e2e_tts: {
            command: "node",
            args: ["./scripts/run.mjs"],
            cwd: "package",
            healthCheck: ["node", "./scripts/run.mjs", "--health"],
          },
        },
        artifacts: { outputTypes: ["WAV"] },
      },
      null,
      2,
    ),
    "utf8",
  );
  await writeFile(
    join(packageRoot, "SKILL.md"),
    [
      "# E2E TTS Capability",
      "",
      "Use this preserved generated capability source to verify the Capability Builder history UI.",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    join(packageRoot, "scripts", "run.mjs"),
    [
      "#!/usr/bin/env node",
      "if (process.argv.includes('--health')) {",
      "  console.log('ok');",
      "  process.exit(0);",
      "}",
      "console.log('fixture wav path: output.wav');",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(join(packageRoot, "tests", "smoke.test.mjs"), "console.log('smoke');\n", "utf8");
  await writeFile(join(packageRoot, "sample.wav"), "RIFF fixture", "utf8");
  await writeFile(
    join(packageRoot, "capability-validation-log.jsonl"),
    `${JSON.stringify({ source: "healthCheck", commandName: "e2e_tts", status: "success" })}\n`,
    "utf8",
  );
  await writeFile(
    join(packageRoot, "capability-build.json"),
    JSON.stringify(
      {
        schemaVersion: "ambient-capability-builder-v1",
        name: "ambient-e2e-tts",
        version: "0.1.0",
        status: "unregistered",
        goal: "Generate deterministic WAV voice files from text for e2e testing.",
        kind: "artifact generator",
        provider: "E2E fixture",
        outputArtifactTypes: ["WAV"],
        sourcePath: "./.ambient/capability-builder/packages/ambient-e2e-tts",
        lastValidatedAt: "2026-05-06T01:00:00.000Z",
        registeredAt: "2026-05-06T01:05:00.000Z",
        unregisteredAt: "2026-05-06T01:10:00.000Z",
        installedPackageId: null,
        installedSource: null,
        refs: {
          latest: "0000000000000000000000000000000000000000",
          installed: null,
          lastValidated: "0000000000000000000000000000000000000000",
          lastValidatedHash: "0000000000000000000000000000000000000000000000000000000000000000",
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  await writeFile(
    join(invalidPackageRoot, "ambient-cli.json"),
    JSON.stringify(
      {
        version: "0.1.0",
        commands: {},
      },
      null,
      2,
    ),
    "utf8",
  );
}

async function seedPrivilegedPiFixture(fixtureRoot) {
  await mkdir(join(fixtureRoot, "build"), { recursive: true });
  await mkdir(join(fixtureRoot, "configs", "codex"), { recursive: true });
  await mkdir(join(fixtureRoot, "scripts"), { recursive: true });
  await mkdir(join(fixtureRoot, "skills"), { recursive: true });
  await writeFile(
    join(fixtureRoot, "package.json"),
    JSON.stringify(
      {
        name: "ambient-e2e-privileged-pi",
        version: "0.1.0",
        description: "Deterministic privileged Pi package fixture.",
        bin: {
          "ambient-e2e-privileged-pi": "cli.mjs",
        },
        pi: {
          extensions: ["./build/pi-extension.js"],
          skills: ["./skills"],
        },
        scripts: {
          postinstall: "node scripts/postinstall.mjs",
        },
        optionalDependencies: {
          "better-sqlite3": "^12.8.1",
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  await writeFile(
    join(fixtureRoot, "build", "pi-extension.js"),
    [
      "import { execFile } from 'node:child_process';",
      "import { readFileSync, writeFileSync } from 'node:fs';",
      "import { homedir } from 'node:os';",
      "",
      "export default function activate(pi) {",
      "  pi.on('session_start', () => {",
      "    writeFileSync(`${homedir()}/ambient-e2e-privileged-hook.txt`, 'hook');",
      "  });",
      "  pi.registerCommand('ambient-e2e-privileged-command', async () => {",
      "    const key = process.env.AMBIENT_E2E_SECRET_KEY;",
      "    const packageJson = readFileSync('./package.json', 'utf8');",
      "    await fetch('https://example.invalid/ambient-e2e');",
      "    execFile('node', ['--version'], () => {});",
      "    return { key: Boolean(key), packageJsonLength: packageJson.length };",
      "  });",
      "}",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    join(fixtureRoot, ".mcp.json"),
    JSON.stringify(
      {
        mcpServers: {
          "ambient-e2e-privileged-server": {
            command: "node",
            args: ["server.mjs"],
            env: {
              AMBIENT_E2E_SECRET_KEY: "${AMBIENT_E2E_SECRET_KEY}",
            },
          },
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  await writeFile(
    join(fixtureRoot, "configs", "codex", "hooks.json"),
    JSON.stringify(
      {
        hooks: {
          SessionStart: [
            {
              command: "node scripts/postinstall.mjs",
            },
          ],
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  await writeFile(
    join(fixtureRoot, "cli.mjs"),
    [
      "#!/usr/bin/env node",
      "import { writeFileSync } from 'node:fs';",
      "writeFileSync('/tmp/ambient-e2e-privileged-cli.txt', 'cli');",
      "console.log('ambient-e2e-privileged-cli');",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    join(fixtureRoot, "scripts", "postinstall.mjs"),
    [
      "import { writeFileSync } from 'node:fs';",
      "writeFileSync('/tmp/ambient-e2e-privileged-postinstall.txt', 'postinstall');",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    join(fixtureRoot, "skills", "SKILL.md"),
    [
      "# Ambient E2E Privileged Skill",
      "",
      "Use this deterministic fixture to verify privileged Pi package scan, disabled install, and uninstall UX.",
      "",
    ].join("\n"),
    "utf8",
  );
}

async function seedSandboxedPiFixture(fixtureRoot) {
  await writeFile(
    join(fixtureRoot, "package.json"),
    JSON.stringify(
      {
        name: "ambient-e2e-sandbox-pi",
        version: "0.1.0",
        description: "Deterministic sandboxed Pi tool fixture.",
        pi: {
          extensions: ["index.ts"],
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  await writeFile(
    join(fixtureRoot, "index.ts"),
    [
      "export default function activate(pi) {",
      "  pi.registerTool({",
      "    name: 'ambient_e2e_echo',",
      "    description: 'Echo sandboxed input.',",
      "    parameters: {",
      "      type: 'object',",
      "      properties: { text: { type: 'string' } },",
      "      required: ['text'],",
      "    },",
      "    async execute(_callId, params) {",
      "      return { content: [{ type: 'text', text: `sandbox:${params.text}` }] };",
      "    },",
      "  });",
      "}",
      "",
    ].join("\n"),
    "utf8",
  );
}

async function launchApp() {
  const child = spawn("pnpm", ["exec", "electron-vite", "dev", "--", `--remote-debugging-port=${port}`], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AMBIENT_DESKTOP_WORKSPACE: workspace,
      AMBIENT_E2E: "1",
      AMBIENT_E2E_CAPTURE_MESSAGES: "1",
      AMBIENT_E2E_USER_DATA: userData,
      AMBIENT_CODEX_CURATED_MARKETPLACE_URL: "0",
      AMBIENT_PI_USER_SETTINGS_PATH: join(userData, "missing-pi-settings.json"),
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  child.stdout.on("data", (chunk) => output.push(chunk.toString("utf8")));
  child.stderr.on("data", (chunk) => output.push(chunk.toString("utf8")));

  const target = await waitForTarget();
  await delay(750);
  const cdp = await connectCdp(target.webSocketDebuggerUrl);
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await waitFor(cdp, () => document.body?.innerText.includes("Ambient"), "main shell", 30_000);
  return { child, cdp };
}

async function runPluginUiSmoke(cdp) {
  await clickButton(cdp, "Plugins");
  await waitFor(cdp, () => document.body.innerText.includes("Ambient Plugin Host"), "plugins panel");
  await clickButton(cdp, "Sources");
  await verifyGeneratedCapabilityHistoryUi(cdp);
  await clickButton(cdp, "Inspect Pi packages");
  await waitFor(cdp, () => document.body.innerText.includes("Pi Packages"), "Pi package section");
  await waitFor(cdp, () => document.body.innerText.includes("ambient-plugin-ui-workspace"), "workspace Pi metadata");
  await waitFor(cdp, () => document.body.innerText.includes("Extensions are executable"), "workspace Pi safety label");

  await verifyOpenPanelRefreshesFromPackageEvent(cdp);
  await waitFor(
    cdp,
    () => [...document.querySelectorAll(".pi-package-install-row button")].some((button) => button.textContent?.includes("Install sandboxed")),
    "Pi package install controls after open-panel refresh",
    30_000,
  );

  await fillInput(cdp, ".pi-package-install-row input", sandboxedPiFixture);
  await clickButton(cdp, "Install sandboxed");
  await waitFor(
    cdp,
    () => document.body.innerText.includes('Install sandboxed Pi extension "ambient-e2e-sandbox-pi"?'),
    "sandboxed install permission",
    30_000,
  );
  await clickButton(cdp, "Trust and allow once");
  await waitFor(cdp, () => document.body.innerText.includes("Sandboxed Pi Tools"), "sandboxed Pi section", 30_000);
  await waitFor(
    cdp,
    () =>
      document.body.innerText.includes("ambient-e2e-sandbox-pi") &&
      document.body.innerText.includes("ambient_e2e_echo") &&
      document.body.innerText.includes("No network"),
    "sandboxed package tool surface",
    30_000,
  );
  await waitFor(
    cdp,
    () =>
      window.ambientDesktop.inspectPiExtensionSandboxPackages().then((catalog) =>
        catalog.packages.some(
          (pkg) =>
            pkg.name === "ambient-e2e-sandbox-pi" &&
            pkg.tools.some((tool) => tool.name === "ambient_e2e_echo") &&
            pkg.allowedNetworkHosts.length === 0,
        ),
      ),
    "sandboxed catalog installed state",
    30_000,
  );
  await clickRowButton(cdp, "ambient-e2e-sandbox-pi", "Details");
  await waitFor(cdp, () => document.body.innerText.includes("Package Review") && document.body.innerText.includes("Audit Timeline"), "sandboxed package details");
  await waitFor(cdp, () => document.body.innerText.includes("ambient_pi_extension_install_sandboxed"), "sandboxed install audit detail");
  await scrollRowIntoView(cdp, "ambient-e2e-sandbox-pi");
  await captureScreenshot(cdp, "01-sandboxed-installed");

  const clickedSandboxUninstall = await evaluate(
    cdp,
    `
    (() => {
      const rows = [...document.querySelectorAll(".plugin-row")].filter((row) => row.innerText.includes("ambient-e2e-sandbox-pi"));
      const row = rows[rows.length - 1];
      const button = [...(row?.querySelectorAll("button") ?? [])].find((item) => item.textContent?.includes("Uninstall"));
      button?.click();
      return Boolean(button);
    })()
  `,
  );
  if (!clickedSandboxUninstall) throw new Error("Unable to click ambient-e2e-sandbox-pi sandbox uninstall button.");
  await waitFor(cdp, () => document.body.innerText.includes("No sandboxed Pi tool packages are installed."), "sandboxed uninstall empty state", 30_000);
  await waitFor(cdp, () => document.body.innerText.includes("Removed Sandboxed Pi Tools") && document.body.innerText.includes("ambient-e2e-sandbox-pi"), "sandboxed uninstall history", 30_000);
  await scrollRowIntoView(cdp, "ambient-e2e-sandbox-pi");
  await waitFor(
    cdp,
    () => window.ambientDesktop.inspectPiExtensionSandboxPackages().then((catalog) => catalog.packages.length === 0 && catalog.history.some((pkg) => pkg.name === "ambient-e2e-sandbox-pi")),
    "sandboxed catalog empty state",
    30_000,
  );
  await captureScreenshot(cdp, "02-sandboxed-uninstalled-empty");
  await clickButton(cdp, "Clear history");
  await waitFor(cdp, () => !document.body.innerText.includes("Removed Sandboxed Pi Tools"), "sandboxed history cleared", 30_000);
  await waitFor(
    cdp,
    () => window.ambientDesktop.inspectPiExtensionSandboxPackages().then((catalog) => catalog.history.length === 0),
    "sandboxed catalog history cleared",
    30_000,
  );

  await fillInput(cdp, ".pi-package-install-row input", privilegedPiFixture);
  await clickButton(cdp, "Install sandboxed");
  await waitFor(cdp, () => document.body.innerText.includes("Sandbox fallback: ambient-e2e-privileged-pi"), "sandbox fallback result", 30_000);
  await waitFor(cdp, () => document.body.innerText.includes("Sandbox blocked") && document.body.innerText.includes("Use privileged review"), "sandbox fallback affordance", 30_000);
  await waitFor(cdp, () => document.body.innerText.includes("Privileged Scan: ambient-e2e-privileged-pi"), "privileged scan result");
  await waitFor(cdp, () => document.body.innerText.includes("Privileged review required"), "privileged risk label");
  await waitFor(cdp, () => document.body.innerText.includes("MCP config detected") && document.body.innerText.includes("command surface"), "privileged resources");
  await captureScreenshot(cdp, "03-sandbox-fallback-privileged-scan");

  await waitFor(
    cdp,
    () => [...document.querySelectorAll(".pi-package-install-row button")].some((button) => button.textContent?.includes("Install disabled") && !button.disabled),
    "install disabled enabled",
  );
  await clickButton(cdp, "Install disabled");
  const promptAppeared = await waitForOptional(
    cdp,
    () => document.body.innerText.includes('Install privileged Pi package "ambient-e2e-privileged-pi" as disabled?'),
    8_000,
  );
  if (promptAppeared) await clickButton(cdp, "Trust and allow once");
  await waitFor(cdp, () => document.body.innerText.includes("Privileged Pi Installs"), "privileged installs section", 30_000);
  await waitFor(cdp, () => document.body.innerText.includes("ambient-e2e-privileged-pi") && document.body.innerText.includes("Disabled"), "disabled privileged install", 30_000);
  await waitFor(cdp, () => document.body.innerText.includes("Alpha install is inactive"), "inactive caveat");
  await waitFor(
    cdp,
    () =>
      window.ambientDesktop.inspectPiPrivilegedPackages().then((catalog) =>
        catalog.packages.some(
          (pkg) =>
            pkg.packageName === "ambient-e2e-privileged-pi" &&
            pkg.status === "disabled" &&
            pkg.scan.riskSummary.mcpServers &&
            pkg.scan.riskSummary.lifecycleHooks &&
            pkg.scan.riskSummary.processExecution &&
            pkg.scan.riskSummary.installScripts,
        ),
      ),
    "privileged catalog installed state",
    30_000,
  );
  await clickRowButton(cdp, "ambient-e2e-privileged-pi", "Details");
  await waitFor(cdp, () => document.body.innerText.includes("Package Review") && document.body.innerText.includes("Privileged Resources"), "privileged package details");
  await waitFor(cdp, () => document.body.innerText.includes("Audit Timeline") && document.body.innerText.includes("pi_privileged_install"), "privileged install audit detail");
  await scrollRowIntoView(cdp, "ambient-e2e-privileged-pi");
  await captureScreenshot(cdp, "04-privileged-installed-disabled");

  const clickedUninstall = await evaluate(
    cdp,
    `
    (() => {
      const rows = [...document.querySelectorAll(".plugin-row")].filter((row) => row.innerText.includes("ambient-e2e-privileged-pi"));
      const row = rows[rows.length - 1];
      const button = [...(row?.querySelectorAll("button") ?? [])].find((item) => item.textContent?.includes("Uninstall"));
      button?.click();
      return Boolean(button);
    })()
  `,
  );
  if (!clickedUninstall) throw new Error("Unable to click ambient-e2e-privileged-pi privileged uninstall button.");
  await waitFor(cdp, () => document.body.innerText.includes("No privileged Pi installs are registered."), "privileged uninstall empty state", 30_000);
  await waitFor(cdp, () => document.body.innerText.includes("Removed Privileged Pi Installs") && document.body.innerText.includes("ambient-e2e-privileged-pi"), "privileged uninstall history", 30_000);
  await scrollRowIntoView(cdp, "ambient-e2e-privileged-pi");
  await waitFor(
    cdp,
    () => window.ambientDesktop.inspectPiPrivilegedPackages().then((catalog) => catalog.packages.length === 0 && catalog.history.some((pkg) => pkg.packageName === "ambient-e2e-privileged-pi")),
    "privileged catalog empty state",
    30_000,
  );
  await captureScreenshot(cdp, "05-privileged-uninstalled-empty");
  await clickButton(cdp, "Clear history");
  await waitFor(cdp, () => !document.body.innerText.includes("Removed Privileged Pi Installs"), "privileged history cleared", 30_000);
  await waitFor(
    cdp,
    () => window.ambientDesktop.inspectPiPrivilegedPackages().then((catalog) => catalog.history.length === 0),
    "privileged catalog history cleared",
    30_000,
  );
  await verifyOpenPanelPrivilegedScanEvent(cdp);
}

async function verifyGeneratedCapabilityHistoryUi(cdp) {
  await waitFor(
    cdp,
    () =>
      window.ambientDesktop.getCapabilityBuilderHistory({ packageName: "ambient-e2e-tts" }).then(
        (history) =>
          history.entries.length === 1 &&
          history.entries[0].packageName === "ambient-e2e-tts" &&
          history.entries[0].status === "unregistered" &&
          history.entries[0].installedPresent === false &&
          history.entries[0].commandNames.includes("e2e_tts") &&
          history.entries[0].artifactOutputTypes.includes("WAV"),
      ),
    "generated capability history bridge",
    30_000,
  );
  await waitFor(
    cdp,
    () =>
      window.ambientDesktop.getCapabilityBuilderHistory({ packageName: "ambient-broken-tts" }).then(
        (history) =>
          history.entries.length === 1 &&
          history.entries[0].packageName === "ambient-broken-tts" &&
          history.entries[0].status === "invalid" &&
          history.entries[0].valid === false &&
          history.entries[0].errors.some((error) => error.includes("SKILL.md is missing")) &&
          history.entries[0].errors.some((error) => error.includes("Descriptor name is required")),
      ),
    "invalid generated capability history bridge",
    30_000,
  );
  await waitFor(
    cdp,
    () => {
      const section = [...document.querySelectorAll(".plugin-row")].find((row) => row.innerText.includes("Generated Capability Sources"));
      if (!section) return false;
      const text = section.innerText;
      const buttons = [...section.querySelectorAll("button")].map((button) => button.textContent ?? "");
      return (
        text.includes("ambient-e2e-tts") &&
        text.includes("Unregistered") &&
        text.includes("Not installed") &&
        text.includes("1 command") &&
        text.includes("WAV") &&
        buttons.some((label) => label.includes("Open source")) &&
        buttons.some((label) => label.includes("Preview")) &&
        buttons.some((label) => label.includes("Re-register")) &&
        buttons.some((label) => label.includes("Plan update")) &&
        buttons.some((label) => label.includes("Plan removal"))
      );
    },
    "generated capability source history UI",
    30_000,
  );
  await waitFor(
    cdp,
    () => {
      const section = [...document.querySelectorAll(".plugin-row")].find((row) => row.innerText.includes("Generated Capability Sources"));
      if (!section) return false;
      const brokenRows = [...section.querySelectorAll(".plugin-source-entry")].filter((row) => row.innerText.includes("ambient-broken-tts"));
      const brokenRow = brokenRows[brokenRows.length - 1];
      if (!brokenRow) return false;
      const text = brokenRow.innerText;
      const reregister = [...brokenRow.querySelectorAll("button")].find((button) => button.textContent?.includes("Re-register"));
      const repair = [...brokenRow.querySelectorAll("button")].find((button) => button.textContent?.includes("Plan repair"));
      const preview = [...brokenRow.querySelectorAll("button")].find((button) => button.textContent?.includes("Preview"));
      return (
        text.includes("Invalid") &&
        text.includes("Preview has errors") &&
        text.includes("SKILL.md is missing") &&
        text.includes("Descriptor name is required") &&
        Boolean(preview && !preview.disabled) &&
        Boolean(reregister?.disabled) &&
        Boolean(repair && !repair.disabled)
      );
    },
    "invalid generated capability source diagnostics UI",
    30_000,
  );
  await scrollRowIntoView(cdp, "Generated Capability Sources");
  await verifyGeneratedCapabilityHistoryPromptLaunch(cdp);
  await verifyGeneratedCapabilityRepairPromptLaunch(cdp);
  await captureScreenshot(cdp, "00-generated-source-history");
}

async function verifyGeneratedCapabilityHistoryPromptLaunch(cdp) {
  await captureCapabilityBuilderMessages(cdp);
  await clickPluginSourceEntryButton(cdp, "ambient-e2e-tts", "Re-register");
  await waitFor(
    cdp,
    () =>
      (window.__ambientCapturedCapabilityBuilderMessages ?? []).some((message) => {
        const content = message.content ?? "";
        return (
          content.includes("Re-register this preserved generated Ambient capability package after approval.") &&
          content.includes("Package: ambient-e2e-tts") &&
          content.includes("Builder source path: ./.ambient/capability-builder/packages/ambient-e2e-tts") &&
          content.includes("First call ambient_capability_builder_history") &&
          content.includes("then call ambient_capability_builder_preview") &&
          content.includes("ask me to approve re-registration") &&
          content.includes("ambient_capability_builder_register") &&
          content.includes("Do not install dependencies, edit files, delete files, or use generic Ambient CLI install/uninstall tools.") &&
          message.delivery === "prompt" &&
          Array.isArray(message.context) &&
          message.context.length === 0
        );
      }),
    "generated capability re-register prompt launch",
    30_000,
  );
  await stopCaptureCapabilityBuilderMessages(cdp);
}

async function verifyGeneratedCapabilityRepairPromptLaunch(cdp) {
  await captureCapabilityBuilderMessages(cdp);
  await clickPluginSourceEntryButton(cdp, "ambient-broken-tts", "Plan repair");
  await waitFor(
    cdp,
    () =>
      (window.__ambientCapturedCapabilityBuilderMessages ?? []).some((message) => {
        const content = message.content ?? "";
        return (
          content.includes("Plan a repair for this preserved generated Ambient capability source.") &&
          content.includes("Package: ambient-broken-tts") &&
          content.includes("Builder source path: ./.ambient/capability-builder/packages/ambient-broken-tts") &&
          content.includes("Current static preview validity: invalid") &&
          content.includes("Current preview errors: Descriptor name is required.") &&
          content.includes("First call ambient_capability_builder_history") &&
          content.includes("then call ambient_capability_builder_preview") &&
          content.includes("Propose a concise repair plan before changing anything.") &&
          content.includes("Do not edit files, install dependencies, validate, register, unregister, delete files, or use generic Ambient CLI install/uninstall tools") &&
          content.includes("Do not call ambient_capability_builder_register until a later approved validation succeeds") &&
          message.delivery === "prompt" &&
          Array.isArray(message.context) &&
          message.context.length === 0
        );
      }),
    "generated capability repair prompt launch",
    30_000,
  );
  await stopCaptureCapabilityBuilderMessages(cdp);
}

async function captureCapabilityBuilderMessages(cdp) {
  await evaluate(
    cdp,
    `
    (() => {
      window.__ambientCapturedCapabilityBuilderMessages = [];
      window.__ambientCapabilityBuilderCaptureDispose?.();
      window.__ambientCapabilityBuilderCaptureDispose = window.ambientDesktop.onEvent((event) => {
        if (event.type === "e2e-message-captured") window.__ambientCapturedCapabilityBuilderMessages.push(event.input);
      });
      return true;
    })()
  `,
  );
}

async function stopCaptureCapabilityBuilderMessages(cdp) {
  await evaluate(
    cdp,
    `
    (() => {
      const latest = window.__ambientCapturedCapabilityBuilderMessages?.[window.__ambientCapturedCapabilityBuilderMessages.length - 1];
      if (latest?.threadId) window.ambientDesktop.emitE2eEvent?.({ type: "run-status", threadId: latest.threadId, status: "idle" });
      window.__ambientCapabilityBuilderCaptureDispose?.();
      delete window.__ambientCapabilityBuilderCaptureDispose;
      return true;
    })()
  `,
  );
}

async function clickPluginSourceEntryButton(cdp, rowText, label) {
  const clicked = await evaluate(
    cdp,
    `
    (() => {
      const rowNeedle = ${JSON.stringify(rowText)};
      const buttonNeedle = ${JSON.stringify(label)};
      const rows = [...document.querySelectorAll(".plugin-source-entry")].filter((row) => row.innerText.includes(rowNeedle));
      const row = rows[rows.length - 1];
      const button = [...(row?.querySelectorAll("button") ?? [])].find((item) => item.textContent?.includes(buttonNeedle));
      if (!button || button.disabled) return false;
      button.scrollIntoView({ block: "center", inline: "nearest" });
      button.click();
      return true;
    })()
  `,
  );
  if (!clicked) throw new Error(`Button not found in generated source ${rowText}: ${label}`);
}

async function verifyOpenPanelRefreshesFromPackageEvent(cdp) {
  await evaluate(
    cdp,
    `
    (() => {
      window.__ambientPluginRefreshInstall = window.ambientDesktop
        .installPiExtensionSandboxPackage({ source: ${JSON.stringify(sandboxedPiFixture)} })
        .then(() => ({ ok: true }))
        .catch((error) => ({ ok: false, error: error instanceof Error ? error.message : String(error) }));
      return true;
    })()
  `,
  );
  await waitFor(
    cdp,
    () => document.body.innerText.includes('Install sandboxed Pi extension "ambient-e2e-sandbox-pi"?'),
    "event refresh sandbox install permission",
    30_000,
  );
  await clickButton(cdp, "Trust and allow once");
  await waitFor(
    cdp,
    () => window.__ambientPluginRefreshInstall?.then((result) => result.ok),
    "event refresh sandbox install bridge completion",
    30_000,
  );
  await waitFor(
    cdp,
    () =>
      document.body.innerText.includes("Sandboxed Pi Tools") &&
      document.body.innerText.includes("ambient-e2e-sandbox-pi") &&
      document.body.innerText.includes("ambient_e2e_echo"),
    "open panel refreshed after plugin catalog event",
    30_000,
  );
  await scrollRowIntoView(cdp, "ambient-e2e-sandbox-pi");
  await captureAdHocScreenshot(cdp, "06-open-panel-event-refresh");

  await evaluate(
    cdp,
    `
    (() => {
      window.__ambientPluginRefreshUninstall = window.ambientDesktop
        .uninstallPiExtensionSandboxPackage({ packageName: "ambient-e2e-sandbox-pi" })
        .then(() => ({ ok: true }))
        .catch((error) => ({ ok: false, error: error instanceof Error ? error.message : String(error) }));
      return true;
    })()
  `,
  );
  await waitFor(
    cdp,
    () => window.__ambientPluginRefreshUninstall?.then((result) => result.ok),
    "event refresh sandbox uninstall bridge completion",
    30_000,
  );
  await waitFor(cdp, () => document.body.innerText.includes("Removed Sandboxed Pi Tools") && document.body.innerText.includes("ambient-e2e-sandbox-pi"), "open panel refreshed after bridge uninstall", 30_000);
  await evaluate(
    cdp,
    `
    (() => {
      window.__ambientPluginRefreshClear = window.ambientDesktop
        .clearPiExtensionSandboxHistory()
        .then(() => ({ ok: true }))
        .catch((error) => ({ ok: false, error: error instanceof Error ? error.message : String(error) }));
      return true;
    })()
  `,
  );
  await waitFor(
    cdp,
    () => window.__ambientPluginRefreshClear?.then((result) => result.ok),
    "event refresh sandbox history clear bridge completion",
    30_000,
  );
  await waitFor(cdp, () => !document.body.innerText.includes("Removed Sandboxed Pi Tools"), "open panel refreshed after bridge history clear", 30_000);
}

async function verifyOpenPanelPrivilegedScanEvent(cdp) {
  await evaluate(
    cdp,
    `
    window.ambientDesktop.emitE2eEvent({
      type: "pi-privileged-scan-updated",
      source: "https://pi.dev/packages/pi-ffmpeg?name=bet",
      fallback: {
        source: "https://pi.dev/packages/pi-ffmpeg?name=bet",
        resolvedSource: "npm:pi-ffmpeg",
        packagePath: "/tmp/ambient-plugin-sandbox-fallback-pi-ffmpeg",
        sha: "00000000000000000000000000000000",
        packageName: "pi-ffmpeg",
        version: "0.1.0",
        entrypoint: "extensions/pi-ffmpeg.ts",
        allowedNetworkHosts: [],
        installable: false,
        errors: ["Unsupported import: node:child_process"],
      },
      scan: {
        source: "https://pi.dev/packages/pi-ffmpeg?name=bet",
        scanOrigin: "sandbox-fallback",
        packageName: "pi-ffmpeg",
        version: "0.1.0",
        description: "Video processing tools for Pi.",
        fingerprint: "00000000000000000000000000000000",
        resources: {
          piExtensions: ["extensions/pi-ffmpeg.ts"],
          piSkills: [],
          piPrompts: [],
          piThemes: [],
          bins: ["pi-ffmpeg"],
          mcpServers: [],
          hookConfigs: [],
        },
        riskSummary: {
          lifecycleHooks: false,
          commands: true,
          mcpServers: false,
          hostConfigMutation: false,
          filesystemWrites: true,
          homeDirectoryAccess: false,
          processExecution: true,
          network: false,
          envOrSecrets: false,
          nativeDependencies: false,
          installScripts: false,
          dynamicCode: false,
        },
        findings: [
          { severity: "high", category: "process", message: "Uses child_process to call ffmpeg.", files: ["extensions/pi-ffmpeg.ts"] },
          { severity: "warning", category: "commands", message: "Declares a command surface.", files: ["package.json"] },
        ],
        recommendation: "privileged-review-required",
        caveat: "Install disabled keeps this package inactive for review.",
      },
    })
  `,
  );
  await waitFor(
    cdp,
    () =>
      document.body.innerText.includes("Sandbox fallback: pi-ffmpeg") &&
      document.body.innerText.includes("Unsupported import: node:child_process") &&
      document.body.innerText.includes("Privileged Scan: pi-ffmpeg") &&
      document.body.innerText.includes("Privileged review required") &&
      document.body.innerText.includes("From sandbox fallback"),
    "open panel rendered injected privileged fallback scan",
    30_000,
  );
  await captureScreenshot(cdp, "06-open-panel-fallback-event-refresh");
}

async function captureScreenshot(cdp, name) {
  await stabilizePluginVisual(cdp);
  const result = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  if (!scenarioNames.includes(name)) throw new Error(`Unknown plugin visual scenario: ${name}`);
  if (!result.data || result.data.length < 10_000) throw new Error(`Screenshot ${name} returned an empty image.`);
  await writeFile(join(resultsDir, `${name}.png`), Buffer.from(result.data, "base64"));
}

async function captureAdHocScreenshot(cdp, name) {
  await stabilizePluginVisual(cdp);
  const result = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  if (!result.data || result.data.length < 10_000) throw new Error(`Screenshot ${name} returned an empty image.`);
  await writeFile(join(resultsDir, `${name}.png`), Buffer.from(result.data, "base64"));
}

async function stabilizePluginVisual(cdp) {
  await evaluate(
    cdp,
    `
    (() => {
      const replacements = [
        [${JSON.stringify(privilegedPiFixture)}, "/tmp/ambient-plugin-privileged-pi"],
        [${JSON.stringify(sandboxedPiFixture)}, "/tmp/ambient-plugin-sandboxed-pi"],
        [${JSON.stringify(workspace)}, "/tmp/ambient-plugin-ui-workspace"],
        [${JSON.stringify(userData)}, "/tmp/ambient-plugin-ui-data"],
        [${JSON.stringify(basename(privilegedPiFixture))}, "ambient-plugin-privileged-pi"],
        [${JSON.stringify(basename(sandboxedPiFixture))}, "ambient-plugin-sandboxed-pi"],
        [${JSON.stringify(basename(workspace))}, "ambient-plugin-ui-workspace"],
        [${JSON.stringify(basename(userData))}, "ambient-plugin-ui-data"],
      ];
      for (const input of document.querySelectorAll("input, textarea")) {
        if (typeof input.value !== "string") continue;
        let next = input.value;
        for (const [needle, replacement] of replacements) next = next.split(needle).join(replacement);
        input.value = next;
      }
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      for (const node of nodes) {
        let next = node.nodeValue ?? "";
        for (const [needle, replacement] of replacements) next = next.split(needle).join(replacement);
        next = next.replace(/\\b[0-9a-f]{12}\\b/g, "000000000000");
        next = next.replace(/\\b[0-9a-f]{32,128}\\b/g, "00000000000000000000000000000000");
        next = next.replace(/\\b(Installed|Disabled): \\d{1,2} [A-Z][a-z]{2}, \\d{1,2}:\\d{2}/g, "$1: fixed time");
        next = next.replace(/Removed \\d{1,2} [A-Z][a-z]{2}, \\d{1,2}:\\d{2}/g, "Removed fixed time");
        if (next !== node.nodeValue) node.nodeValue = next;
      }
      const styleId = "ambient-plugin-visual-stabilizer";
      if (!document.getElementById(styleId)) {
        const style = document.createElement("style");
        style.id = styleId;
        style.textContent = "*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; } .spin { animation: none !important; }";
        document.head.appendChild(style);
      }
      return true;
    })()
  `,
  );
}

async function writeVisualManifest() {
  const screenshots = [];
  for (const scenario of scenarioNames) screenshots.push(await screenshotMetadata(join(resultsDir, `${scenario}.png`), scenario));
  await writeFile(
    join(resultsDir, "manifest.json"),
    `${JSON.stringify(
      {
        version: 1,
        generatedAt: new Date().toISOString(),
        workspace: "temp-plugin-ui-workspace",
        compareBaselines,
        updateBaselines,
        screenshots,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

async function updateVisualBaselines() {
  await mkdir(baselineDir, { recursive: true });
  const screenshots = [];
  for (const scenario of scenarioNames) {
    const source = join(resultsDir, `${scenario}.png`);
    const destination = join(baselineDir, `${scenario}.png`);
    await copyFile(source, destination);
    screenshots.push(await screenshotMetadata(destination, scenario));
  }
  await writeFile(join(baselineDir, "manifest.json"), `${JSON.stringify({ version: 1, screenshots }, null, 2)}\n`, "utf8");
}

async function compareVisualBaselines() {
  await mkdir(diffDir, { recursive: true });
  const reports = [];
  for (const scenario of scenarioNames) {
    reports.push(
      await comparePngScreenshots({
        scenario,
        actualPath: join(resultsDir, `${scenario}.png`),
        baselinePath: join(baselineDir, `${scenario}.png`),
        diffPath: join(diffDir, `${scenario}.diff.png`),
      }),
    );
  }
  const failed = reports.filter((report) => !report.ok);
  await writeFile(join(resultsDir, "regression-report.json"), `${JSON.stringify({ version: 1, failed: failed.length, reports }, null, 2)}\n`, "utf8");
  if (failed.length > 0) throw new Error(`Plugin visual baseline comparison failed for ${failed.map((report) => report.scenario).join(", ")}.`);
}

async function screenshotMetadata(filePath, scenario) {
  const [buffer, fileStat] = await Promise.all([readFile(filePath), stat(filePath)]);
  const { width, height } = pngSize(buffer);
  return {
    scenario,
    file: `${scenario}.png`,
    bytes: fileStat.size,
    width,
    height,
    sha256: createHash("sha256").update(buffer).digest("hex"),
  };
}

async function comparePngScreenshots({ scenario, actualPath, baselinePath, diffPath }) {
  let actual;
  let baseline;
  try {
    actual = decodePng(await readFile(actualPath));
    baseline = decodePng(await readFile(baselinePath));
  } catch (error) {
    return {
      scenario,
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
      changedPixels: Number.POSITIVE_INFINITY,
      changedRatio: 1,
      maxChannelDelta: 255,
    };
  }

  if (actual.width !== baseline.width || actual.height !== baseline.height) {
    return {
      scenario,
      ok: false,
      reason: `Dimension mismatch: actual ${actual.width}x${actual.height}, baseline ${baseline.width}x${baseline.height}.`,
      changedPixels: Number.POSITIVE_INFINITY,
      changedRatio: 1,
      maxChannelDelta: 255,
    };
  }

  const channelThreshold = Number(process.env.AMBIENT_PLUGIN_VISUAL_CHANNEL_THRESHOLD ?? process.env.AMBIENT_VISUAL_CHANNEL_THRESHOLD ?? 16);
  const maxChangedPixels = Number(process.env.AMBIENT_PLUGIN_VISUAL_MAX_CHANGED_PIXELS ?? process.env.AMBIENT_VISUAL_MAX_CHANGED_PIXELS ?? 5_000);
  const diff = new Uint8Array(actual.width * actual.height * 4);
  let changedPixels = 0;
  let maxChannelDelta = 0;

  for (let pixel = 0; pixel < actual.width * actual.height; pixel += 1) {
    const offset = pixel * 4;
    let pixelChanged = false;
    for (let channel = 0; channel < 4; channel += 1) {
      const delta = Math.abs(actual.data[offset + channel] - baseline.data[offset + channel]);
      if (delta > maxChannelDelta) maxChannelDelta = delta;
      if (delta > channelThreshold) pixelChanged = true;
    }
    if (pixelChanged) {
      changedPixels += 1;
      diff[offset] = 224;
      diff[offset + 1] = 49;
      diff[offset + 2] = 49;
      diff[offset + 3] = 255;
    } else {
      const gray = Math.round((actual.data[offset] + actual.data[offset + 1] + actual.data[offset + 2]) / 3);
      diff[offset] = gray;
      diff[offset + 1] = gray;
      diff[offset + 2] = gray;
      diff[offset + 3] = 255;
    }
  }

  const ok = changedPixels <= maxChangedPixels;
  if (!ok) await writeFile(diffPath, encodePngRgba(actual.width, actual.height, diff));
  return {
    scenario,
    ok,
    changedPixels,
    changedRatio: changedPixels / (actual.width * actual.height),
    maxChannelDelta,
    ...(ok ? {} : { diff: diffPath }),
  };
}

function pngSize(buffer) {
  const decoded = decodePng(buffer, { metadataOnly: true });
  return { width: decoded.width, height: decoded.height };
}

function decodePng(buffer, options = {}) {
  const signature = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== signature) throw new Error("Not a PNG file.");
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (options.metadataOnly) return { width, height, data: new Uint8Array() };
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  if (bitDepth !== 8) throw new Error(`Unsupported PNG bit depth ${bitDepth}.`);
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (channels === 0) throw new Error(`Unsupported PNG color type ${colorType}.`);

  const inflated = inflateSync(Buffer.concat(idatChunks));
  const rowBytes = width * channels;
  const raw = new Uint8Array(height * rowBytes);
  let readOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[readOffset];
    readOffset += 1;
    const rowStart = y * rowBytes;
    for (let x = 0; x < rowBytes; x += 1) {
      const rawByte = inflated[readOffset + x];
      const left = x >= channels ? raw[rowStart + x - channels] : 0;
      const up = y > 0 ? raw[rowStart + x - rowBytes] : 0;
      const upLeft = y > 0 && x >= channels ? raw[rowStart + x - rowBytes - channels] : 0;
      raw[rowStart + x] = (rawByte + pngFilterDelta(filter, left, up, upLeft)) & 0xff;
    }
    readOffset += rowBytes;
  }

  if (channels === 4) return { width, height, data: raw };

  const rgba = new Uint8Array(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    rgba[pixel * 4] = raw[pixel * 3];
    rgba[pixel * 4 + 1] = raw[pixel * 3 + 1];
    rgba[pixel * 4 + 2] = raw[pixel * 3 + 2];
    rgba[pixel * 4 + 3] = 255;
  }
  return { width, height, data: rgba };
}

function pngFilterDelta(filter, left, up, upLeft) {
  if (filter === 0) return 0;
  if (filter === 1) return left;
  if (filter === 2) return up;
  if (filter === 3) return Math.floor((left + up) / 2);
  if (filter === 4) return paeth(left, up, upLeft);
  throw new Error(`Unsupported PNG filter ${filter}.`);
}

function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  if (upDistance <= upLeftDistance) return up;
  return upLeft;
}

function encodePngRgba(width, height, rgba) {
  const rowBytes = width * 4;
  const raw = Buffer.alloc((rowBytes + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (rowBytes + 1);
    raw[rowStart] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * rowBytes, rowBytes).copy(raw, rowStart + 1);
  }
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk(
      "IHDR",
      Buffer.from([
        (width >>> 24) & 0xff,
        (width >>> 16) & 0xff,
        (width >>> 8) & 0xff,
        width & 0xff,
        (height >>> 24) & 0xff,
        (height >>> 16) & 0xff,
        (height >>> 8) & 0xff,
        height & 0xff,
        8,
        6,
        0,
        0,
        0,
      ]),
    ),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

async function waitForTarget() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const target = targets.find((item) => item.webSocketDebuggerUrl && item.type === "page") ?? targets[0];
      if (target?.webSocketDebuggerUrl) return target;
    } catch {
      // App not listening yet.
    }
    await delay(250);
  }
  throw new Error("Timed out waiting for Electron CDP target.");
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
              innerReject(new Error(`Timed out waiting for CDP ${method}.`));
            }, 20_000);
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
      if (message.error) entry.reject(new Error(message.error.message ?? "CDP error"));
      else entry.resolve(message.result);
    });
    socket.addEventListener("error", () => reject(new Error("CDP websocket failed.")));
  });
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? "Runtime.evaluate failed.");
  return result.result?.value;
}

async function waitFor(cdp, predicate, label, timeoutMs = 10_000) {
  const expression = `(${predicate.toString()})()`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(cdp, expression)) return;
    await delay(150);
  }
  const bodyTail = await evaluate(cdp, "document.body.innerText.slice(-2000)").catch(() => "");
  throw new Error(`Timed out waiting for ${label}.\n\nBody tail:\n${bodyTail}`);
}

async function waitForOptional(cdp, predicate, timeoutMs) {
  const expression = `(${predicate.toString()})()`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(cdp, expression)) return true;
    await delay(150);
  }
  return false;
}

async function clickButton(cdp, label) {
  const clicked = await evaluate(
    cdp,
    `
    (() => {
      const needle = ${JSON.stringify(label)};
      const buttons = [...document.querySelectorAll("button, [role='button'], a")].filter(isVisibleElement);
      const button =
        buttons.find((item) => item.textContent?.includes(needle)) ??
        buttons.find((item) => item.title?.includes(needle) || item.getAttribute("aria-label")?.includes(needle));
      const target = button ?? textTarget(needle);
      if (!target) return false;
      target.scrollIntoView({ block: "center", inline: "nearest" });
      target.click();
      return true;
      function textTarget(text) {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
        while (walker.nextNode()) {
          const element = walker.currentNode;
          if (!isVisibleElement(element)) continue;
          if ((element.textContent ?? "").trim() !== text) continue;
          return element.closest("button, [role='button'], a") ?? element;
        }
        return undefined;
      }
      function isVisibleElement(element) {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      }
    })()
  `,
  );
  if (!clicked) {
    const bodyTail = await evaluate(cdp, "document.body.innerText.slice(0, 2000)").catch(() => "");
    throw new Error(`Button not found: ${label}\n\nBody head:\n${bodyTail}`);
  }
}

async function clickRowButton(cdp, rowText, label) {
  const clicked = await evaluate(
    cdp,
    `
    (() => {
      const rowNeedle = ${JSON.stringify(rowText)};
      const buttonNeedle = ${JSON.stringify(label)};
      const rows = [...document.querySelectorAll(".plugin-row")].filter((row) => row.innerText.includes(rowNeedle));
      const row = rows[rows.length - 1];
      const button = [...(row?.querySelectorAll("button") ?? [])].find((item) => item.textContent?.includes(buttonNeedle));
      if (!button) return false;
      button.scrollIntoView({ block: "center", inline: "nearest" });
      button.click();
      return true;
    })()
  `,
  );
  if (!clicked) throw new Error(`Button not found in ${rowText}: ${label}`);
}

async function scrollRowIntoView(cdp, rowText) {
  const scrolled = await evaluate(
    cdp,
    `
    (() => {
      const rowNeedle = ${JSON.stringify(rowText)};
      const rows = [...document.querySelectorAll(".plugin-row")].filter((row) => row.innerText.includes(rowNeedle));
      const row = rows[rows.length - 1];
      if (!row) return false;
      row.scrollIntoView({ block: "start", inline: "nearest" });
      return true;
    })()
  `,
  );
  if (!scrolled) throw new Error(`Row not found: ${rowText}`);
}

async function fillInput(cdp, selector, value) {
  const filled = await evaluate(
    cdp,
    `
    (() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      if (!input) return false;
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
      setter?.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()
  `,
  );
  if (!filled) throw new Error(`Input not found: ${selector}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function outputTail() {
  return `Electron output tail:\n${output.join("").slice(-8000)}`;
}

async function terminateDebugPortProcesses() {
  if (process.platform === "win32") return;
  await new Promise((resolve) => {
    const child = spawn("lsof", ["-ti", `tcp:${port}`], { stdio: ["ignore", "pipe", "ignore"] });
    let stdout = "";
    child.stdout.on("data", (chunk) => (stdout += chunk.toString("utf8")));
    child.on("close", () => {
      const pids = stdout
        .split(/\s+/)
        .map((value) => Number(value))
        .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid);
      for (const pid of pids) {
        try {
          process.kill(pid, "SIGTERM");
        } catch {
          // Already gone.
        }
      }
      resolve();
    });
  });
  await delay(300);
}

async function terminateProcessTree(child) {
  if (!child || child.killed) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      try {
        child.kill("SIGTERM");
      } catch {
        // Already gone.
      }
    }
  }
  await delay(500);
}
