#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import JSZip from "jszip";

const fixedCdpPort = process.env.AMBIENT_E2E_CDP_PORT ? Number(process.env.AMBIENT_E2E_CDP_PORT) : undefined;
let port = fixedCdpPort ?? 9475;
const workspace = await mkdtemp(join(tmpdir(), "ambient-e2e-workspace-"));
const registeredWorkspace = await mkdtemp(join(tmpdir(), "ambient-e2e-registered-"));
const legacyGitWorkspace = await mkdtemp(join(tmpdir(), "ambient-e2e-legacy-git-"));
const codexPluginCache = await mkdtemp(join(tmpdir(), "ambient-e2e-codex-cache-"));
const privilegedPiFixture = await mkdtemp(join(tmpdir(), "ambient-e2e-privileged-pi-"));
const userData = await mkdtemp(join(tmpdir(), "ambient-e2e-user-data-"));
const chromeProfile = await mkdtemp(join(tmpdir(), "ambient-e2e-chrome-profile-"));
const diagnosticsPath = join(workspace, "diagnostics.json");
const openTargetLogPath = join(workspace, "open-targets.jsonl");
const piPackageGalleryPath = join(workspace, "pi-package-gallery.html");
const remoteCodexMarketplacePath = join(workspace, "remote-codex-marketplace.json");
const output = [];
const e2eOnly = process.env.AMBIENT_E2E_ONLY;
const children = new Set();
const syntheticToolNames = ["read", "bash", "edit", "write", "grep", "find", "ls", "browser_pick", "ambient_fixture_workspace_summary"];
const syntheticToolStatuses = ["running", "done", "error"];
const pixelPngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/ax8pWQAAAAASUVORK5CYII=";
const browserScreenshotFixturePath = ".ambient-codex/browser/screenshots/browser-e2e.png";
const ambientApiKey = await readAmbientApiKey();
let appInstance;

try {
  await seedWorkspace(workspace);
  await seedRegisteredProject(registeredWorkspace);
  await seedLegacyGitProject(legacyGitWorkspace);
  await seedCodexPluginCache(codexPluginCache);
  await seedPrivilegedPiFixture(privilegedPiFixture);
  await seedChromeProfile(chromeProfile);
  await seedRemoteCodexMarketplace(remoteCodexMarketplacePath);
  await seedProjectRegistry(userData, [registeredWorkspace, legacyGitWorkspace, workspace]);

  appInstance = await launchApp();
  try {
    if (e2eOnly === "voice-settings") {
      await runVoiceOnlySmoke(appInstance.cdp);
    } else if (e2eOnly === "voice-tool-cards") {
      await runVoiceToolCardOnlySmoke(appInstance.cdp);
    } else if (e2eOnly === "media-artifacts") {
      await runMediaArtifactOnlySmoke(appInstance.cdp);
    } else if (e2eOnly === "office-preview") {
      await runOfficePreviewOnlySmoke(appInstance.cdp);
    } else {
      await runMainSmoke(appInstance.cdp);
    }
  } finally {
    await shutdownAppInstance(appInstance);
    appInstance = undefined;
  }

  if (e2eOnly === "voice-settings") {
    console.log("Electron E2E voice settings smoke passed.");
  } else if (e2eOnly === "voice-tool-cards") {
    console.log("Electron E2E voice tool card smoke passed.");
  } else if (e2eOnly === "media-artifacts") {
    console.log("Electron E2E media artifact smoke passed.");
  } else if (e2eOnly === "office-preview") {
    console.log("Electron E2E office preview smoke passed.");
  } else {
    await assertDiagnosticsExport();
    await assertOpenTargetLaunch();

    appInstance = await launchApp();
    try {
      await runRestartSmoke(appInstance.cdp);
    } finally {
      await shutdownAppInstance(appInstance);
      appInstance = undefined;
    }
  }
} catch (error) {
  console.error(outputTail());
  throw error;
} finally {
  if (appInstance) await shutdownAppInstance(appInstance);
  for (const child of children) await terminateProcessTree(child);
  await terminateDebugPortProcesses();
  await rm(workspace, { recursive: true, force: true });
  await rm(registeredWorkspace, { recursive: true, force: true });
  await rm(legacyGitWorkspace, { recursive: true, force: true });
  await rm(codexPluginCache, { recursive: true, force: true });
  await rm(privilegedPiFixture, { recursive: true, force: true });
  await rm(userData, { recursive: true, force: true });
  await rm(chromeProfile, { recursive: true, force: true });
}

if (!e2eOnly) console.log("Electron E2E smoke passed.");

async function seedWorkspace(root) {
  await writeFile(join(root, "notes.md"), "# E2E Notes\n\nThis file verifies the preview pane.\n", "utf8");
  await writeFile(join(root, "app.ts"), "export const e2e = true;\n", "utf8");
  await writeFile(join(root, "tracked.txt"), "tracked base\n", "utf8");
  await writeFile(
    join(root, "package.json"),
    JSON.stringify(
      {
        name: "ambient-e2e-pi-package",
        version: "0.1.0",
        description: "E2E Pi package metadata fixture.",
        keywords: ["pi-package"],
        pi: {
          extensions: ["./extensions/index.ts"],
          skills: ["./skills"],
          prompts: ["./prompts/review.md"],
          themes: ["./themes/ambient.json"],
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  await writeFile(
    piPackageGalleryPath,
    [
      '<article data-package-card="true" data-package-name="pi-mcp-adapter" data-package-search="pi-mcp-adapter mcp adapter"',
      'data-package-types="extension" data-package-downloads="13452" data-package-date="1777058467893" data-package-path="/packages/pi-mcp-adapter">',
      '<p class="packages-desc">MCP adapter extension for Pi.</p>',
      '<span class="meta-chip packages-badge" data-type="extension">extension</span>',
      "</article>",
    ].join("\n"),
    "utf8",
  );
  await writeFile(join(root, "sample.html"), "<strong>E2E HTML Preview</strong>", "utf8");
  await seedVoiceProviderFixture(root);
  await seedVoiceArtifactState(root);
  await writeFile(join(root, "sample.docx"), await createDocxFixture(["E2E Office Preview", "Extracted document text is visible."]));
  await writeFile(
    join(root, "WORKFLOW.md"),
    [
      "---",
      "tracker:",
      "  active_states: [todo, ready]",
      "workspace:",
      "  strategy: directory",
      "  root: .ambient-codex/e2e-workspaces",
      "agent:",
      "  permission_mode: workspace",
      "---",
      "Complete {{ task.identifier }}: {{ task.title }}",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(join(root, "pixel.png"), pngFixtureBuffer());
  await mkdir(join(root, ".ambient-codex", "browser", "screenshots"), { recursive: true });
  await writeFile(join(root, browserScreenshotFixturePath), pngFixtureBuffer());
  await writeFile(join(root, "sound.wav"), wavFixtureBuffer());
  await writeFile(
    join(root, "clip.webm"),
    Buffer.from(
      "GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAIUEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHWTbuMU6uEElTDZ1OsggEjTbuMU6uEHFO7a1OsggH+7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsCrXsYMPQkBNgIxMYXZmNjIuMy4xMDBXQYxMYXZmNjIuMy4xMDBEiYhAXgAAAAAAABZUrmvIrgEAAAAAAAA/14EBc8WIk0hgEAEFKDKcgQAitZyDdW5kiIEAhoVWX1ZQOIOBASPjg4QCYloA4JCwgRC6gRCagQJVsIRVuYEBElTDZ/tzc59jwIBnyJlFo4dFTkNPREVSRIeMTGF2ZjYyLjMuMTAwc3PWY8CLY8WIk0hgEAEFKDJnyKFFo4dFTkNPREVSRIeUTGF2YzYyLjExLjEwMCBsaWJ2cHhnyKFFo4hEVVJBVElPTkSHkzAwOjAwOjAwLjEyMDAwMDAwMAAfQ7Z11ueBAKOjgQAAgBACAJ0BKhAAEAAARwiFhYiFhIgCAgAMDWAA/v+rUICjlYEAKACxAQAHEOwAGAAYWC/0AAgAAKOVgQBQALEBAAcQ7AAYABhYL/QACAAAHFO7a5G7j7OBALeK94EB8YIBo/CBAw==",
      "base64",
    ),
  );
  await writeFile(
    join(root, "sample.pdf"),
    `%PDF-1.1
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 144 144] >> endobj
trailer << /Root 1 0 R >>
%%EOF
`,
    "utf8",
  );
  await seedPluginFixture(root);
  await runCommand("git", ["init"], root);
  await runCommand("git", ["add", "notes.md", "app.ts", "tracked.txt", "package.json"], root);
  await runCommand(
    "git",
    ["-c", "user.name=Ambient E2E", "-c", "user.email=e2e@example.test", "commit", "-m", "seed"],
    root,
  );
  await runCommand("git", ["branch", "e2e-alt"], root);
  await writeFile(join(root, "tracked.txt"), "tracked changed\n", "utf8");
  await writeFile(join(root, "untracked.txt"), "untracked\n", "utf8");
}

async function seedVoiceArtifactState(root) {
  const now = new Date().toISOString();
  const audioPath = ".ambient/voice/e2e-thread/e2e-assistant.wav";
  await mkdir(join(root, ".ambient", "voice", "e2e-thread"), { recursive: true });
  await mkdir(join(root, ".ambient-codex"), { recursive: true });
  await writeFile(join(root, audioPath), wavFixtureBuffer());
  await writeFile(join(root, ".ambient", "voice", "e2e-thread", "orphan.wav"), wavFixtureBuffer());
  const sql = `
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL
    );
    CREATE TABLE threads (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      workspace_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_read_at TEXT,
      last_message_preview TEXT NOT NULL DEFAULT '',
      permission_mode TEXT NOT NULL DEFAULT 'full-access',
      collaboration_mode TEXT NOT NULL DEFAULT 'agent',
      model TEXT NOT NULL DEFAULT 'moonshotai/kimi-k2.7-code',
      thinking_level TEXT NOT NULL DEFAULT 'xhigh',
      pi_session_file TEXT,
      archived_at TEXT,
      pinned INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      metadata_json TEXT
    );
    CREATE TABLE message_voice_states (
      message_id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      status TEXT NOT NULL,
      source TEXT NOT NULL,
      source_message_id TEXT NOT NULL,
      provider_capability_id TEXT,
      provider_id TEXT,
      voice_id TEXT,
      spoken_text TEXT,
      spoken_text_chars INTEGER NOT NULL,
      source_text_chars INTEGER NOT NULL,
      audio_path TEXT,
      media_url TEXT,
      mime_type TEXT,
      duration_ms INTEGER,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT INTO settings (key, value_json)
    VALUES ('lastActiveThreadId', '"e2e-thread"');
    INSERT INTO threads
      (id, title, workspace_path, created_at, updated_at, last_read_at, last_message_preview, permission_mode, collaboration_mode, model, thinking_level)
    VALUES
      ('e2e-thread', 'Voice artifact E2E', ${sqlString(root)}, ${sqlString(now)}, ${sqlString(now)}, ${sqlString(now)}, 'Voice artifact ready for cleanup.', 'full-access', 'agent', 'zai-org/GLM-5.1-FP8', 'xhigh');
    INSERT INTO messages
      (id, thread_id, role, content, created_at)
    VALUES
      ('e2e-assistant', 'e2e-thread', 'assistant', 'Voice artifact ready for cleanup.', ${sqlString(now)});
    INSERT INTO message_voice_states
      (message_id, thread_id, status, source, source_message_id, provider_capability_id, provider_id, voice_id, spoken_text, spoken_text_chars, source_text_chars, audio_path, media_url, mime_type, duration_ms, created_at, updated_at)
    VALUES
      ('e2e-assistant', 'e2e-thread', 'ready', 'assistant-text', 'e2e-assistant', 'ambient-cli:ambient-e2e-voice-provider:tool:e2e_voice_provider', 'ambient-cli:ambient-e2e-voice-provider:tool:e2e_voice_provider', 'default', 'Voice artifact ready for cleanup.', 33, 33, ${sqlString(audioPath)}, 'ambient-media://e2e/voice-artifact.wav', 'audio/wav', 100, ${sqlString(now)}, ${sqlString(now)});
  `;
  await runCommand("sqlite3", [join(root, ".ambient-codex", "state.sqlite"), sql], root);
}

async function seedVoiceProviderFixture(root) {
  const packageRoot = join(root, ".ambient", "cli-packages", "imported", "ambient-e2e-voice-provider");
  await mkdir(packageRoot, { recursive: true });
  await mkdir(join(root, ".ambient", "cli-packages"), { recursive: true });
  await writeFile(
    join(root, ".ambient", "cli-packages", "packages.json"),
    JSON.stringify({ packages: [{ source: "./.ambient/cli-packages/imported/ambient-e2e-voice-provider" }] }, null, 2),
    "utf8",
  );
  await writeFile(
    join(packageRoot, "ambient-cli.json"),
    JSON.stringify(
      {
        name: "ambient-e2e-voice-provider",
        version: "0.1.0",
        description: "E2E local TTS provider metadata fixture.",
        skills: "./SKILL.md",
        commands: {
          e2e_voice_provider: {
            description: "Synthesize spoken assistant text to a WAV file for E2E voice settings smoke.",
            command: "node",
            args: ["./run.mjs"],
            cwd: "package",
            healthCheck: ["node", "./health.mjs"],
            voiceProvider: {
              label: "E2E Voice Provider",
              defaultFormat: "wav",
              formats: ["wav"],
              voices: [{ id: "default", label: "Default E2E voice" }],
              voiceDiscovery: {
                command: "e2e_voice_provider",
                cacheTtlSeconds: 3600,
                requiresNetwork: false,
                source: "local-runtime",
              },
              voiceCloning: {
                supported: true,
                mode: "local",
                inputs: {
                  audioFormats: ["wav"],
                  minDurationSeconds: 30,
                  maxDurationSeconds: 300,
                  minSamples: 1,
                  transcript: "optional",
                },
                requiresConsent: true,
                output: {
                  creates: ["local-model-asset", "dynamic-cache-voice"],
                  appearsInDynamicCatalog: true,
                },
              },
              local: true,
            },
          },
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  await writeFile(join(packageRoot, "SKILL.md"), "---\nname: ambient-e2e-voice-provider\n---\n", "utf8");
  await writeFile(
    join(packageRoot, "health.mjs"),
    [
      "#!/usr/bin/env node",
      "import { existsSync } from 'node:fs';",
      "if (!existsSync('./voice-ready.marker')) {",
      "  throw new Error('model file missing');",
      "}",
      "console.log('voice provider health ok');",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    join(packageRoot, "run.mjs"),
    [
      "#!/usr/bin/env node",
      "import { writeFileSync, mkdirSync } from 'node:fs';",
      "import { dirname } from 'node:path';",
      "if (process.argv.includes('--list-voices')) {",
      "  console.log(JSON.stringify({ voices: [",
      "    { id: 'default', label: 'Default E2E voice', locale: 'en-US', style: ['default'] },",
      "    { id: 'warm-narrator', label: 'Warm E2E narrator', locale: 'en-US', language: 'English', style: ['warm', 'narration'] },",
      "    { id: 'british-calm', label: 'British calm E2E voice', locale: 'en-GB', language: 'English', style: ['calm'] },",
      "    { id: 'studio-host', label: 'Studio host', locale: 'en-US', language: 'English', style: ['bright', 'host'] },",
      "    { id: 'technical-reader', label: 'Technical reader', locale: 'en-US', language: 'English', style: ['precise'] },",
      "    { id: 'fast-briefing', label: 'Fast briefing', locale: 'en-US', language: 'English', style: ['fast'] },",
      "    { id: 'soft-assistant', label: 'Soft assistant', locale: 'en-US', language: 'English', style: ['soft'] },",
      "    { id: 'deep-reviewer', label: 'Deep reviewer', locale: 'en-US', language: 'English', style: ['review'] },",
      "    { id: 'clear-news', label: 'Clear news voice', locale: 'en-US', language: 'English', style: ['news'] },",
      "    { id: 'quiet-summary', label: 'Quiet summary voice', locale: 'en-US', language: 'English', style: ['summary'] }",
      "  ] }));",
      "  process.exit(0);",
      "}",
      "const output = process.argv[process.argv.indexOf('--output') + 1];",
      "if (!output) process.exit(2);",
      "mkdirSync(dirname(output), { recursive: true });",
      "writeFileSync(output, Buffer.from('RIFF....WAVEfmt '));",
      "console.log(JSON.stringify({ audioPath: output, mimeType: 'audio/wav' }));",
      "",
    ].join("\n"),
    "utf8",
  );
}

function wavFixtureBuffer() {
  const sampleRate = 8000;
  const dataSize = sampleRate / 10;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate, 28);
  buffer.writeUInt16LE(1, 32);
  buffer.writeUInt16LE(8, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  buffer.fill(128, 44);
  return buffer;
}

function pngFixtureBuffer() {
  return Buffer.from(pixelPngBase64, "base64");
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

async function seedPluginFixture(root) {
  await mkdir(join(root, ".agents", "plugins"), { recursive: true });
  await mkdir(join(root, "plugins", "ambient-fixture", ".codex-plugin"), { recursive: true });
  await mkdir(join(root, "plugins", "ambient-fixture", "skills", "workspace-inspector"), { recursive: true });
  await mkdir(join(root, "plugins", "ambient-fixture", "scripts"), { recursive: true });
  await writeFile(
    join(root, ".agents", "plugins", "marketplace.json"),
    JSON.stringify(
      {
        name: "ambient-desktop-fixtures",
        interface: { displayName: "Ambient Desktop Fixtures" },
        plugins: [
          {
            name: "ambient-fixture",
            source: { source: "local", path: "./plugins/ambient-fixture" },
            category: "Productivity",
          },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );
  await writeFile(
    join(root, "plugins", "ambient-fixture", ".codex-plugin", "plugin.json"),
    JSON.stringify(
      {
        name: "ambient-fixture",
        version: "0.1.0",
        description: "Fixture plugin for Ambient Desktop E2E tests.",
        skills: "./skills/",
        mcpServers: "./.mcp.json",
        interface: {
          displayName: "Ambient Fixture",
          shortDescription: "Exercises skill and MCP discovery.",
          category: "Productivity",
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  await writeFile(
    join(root, "plugins", "ambient-fixture", "skills", "workspace-inspector", "SKILL.md"),
    [
      "---",
      "name: workspace-inspector",
      "description: Inspect a workspace for fixture-plugin tests.",
      "---",
      "",
      "# Workspace Inspector",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    join(root, "plugins", "ambient-fixture", ".mcp.json"),
    JSON.stringify(
      {
        mcpServers: {
          "ambient-fixture": {
            command: "node",
            args: ["./scripts/fixture-mcp.js"],
          },
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  await writeFile(
    join(root, "plugins", "ambient-fixture", "scripts", "fixture-mcp.js"),
    `#!/usr/bin/env node
const tools = [{
  name: "ambient_fixture_workspace_summary",
  description: "Returns a compact summary of the current Ambient fixture workspace.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
}];
let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  while (true) {
    const newline = buffer.indexOf("\\n");
    if (newline === -1) return;
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    const message = JSON.parse(line);
    if (message.method === "notifications/initialized") continue;
    if (message.method === "initialize") {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "ambient-fixture", version: "0.1.0" } } }) + "\\n");
    } else if (message.method === "tools/list") {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { tools } }) + "\\n");
    } else {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Unknown method" } }) + "\\n");
    }
  }
});
`,
    "utf8",
  );
}

async function seedRegisteredProject(root) {
  await mkdir(join(root, ".ambient-codex"), { recursive: true });
  const now = new Date().toISOString();
  const sql = `
    CREATE TABLE threads (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      workspace_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_read_at TEXT,
      last_message_preview TEXT NOT NULL DEFAULT '',
      permission_mode TEXT NOT NULL DEFAULT 'full-access',
      model TEXT NOT NULL DEFAULT 'moonshotai/kimi-k2.7-code',
      thinking_level TEXT NOT NULL DEFAULT 'xhigh',
      pi_session_file TEXT
    );
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      metadata_json TEXT
    );
    INSERT INTO threads
      (id, title, workspace_path, created_at, updated_at, last_read_at, last_message_preview, permission_mode, model, thinking_level)
    VALUES
      ('registered-thread-1', 'Registered project chat', ${sqlString(root)}, ${sqlString(now)}, ${sqlString(now)}, ${sqlString(now)}, 'Existing registered project remains visible', 'full-access', 'zai-org/GLM-5.1-FP8', 'xhigh');
    INSERT INTO messages
      (id, thread_id, role, content, created_at)
    VALUES
      ('registered-message-1', 'registered-thread-1', 'user', 'Cross-project mango search result.', ${sqlString(now)});
  `;
  await runCommand("sqlite3", [join(root, ".ambient-codex", "state.sqlite"), sql], root);
}

async function seedLegacyGitProject(root) {
  await writeFile(join(root, "legacy.txt"), "legacy base\n", "utf8");
  await runCommand("git", ["init"], root);
  await runCommand("git", ["add", "legacy.txt"], root);
  await runCommand(
    "git",
    ["-c", "user.name=Ambient E2E", "-c", "user.email=e2e@example.test", "commit", "-m", "legacy seed"],
    root,
  );
  await writeFile(join(root, "legacy.txt"), "legacy base\nlegacy dirty\n", "utf8");
  await mkdir(join(root, ".ambient-codex"), { recursive: true });
  const now = new Date().toISOString();
  const sql = `
    CREATE TABLE threads (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      workspace_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_read_at TEXT,
      last_message_preview TEXT NOT NULL DEFAULT '',
      permission_mode TEXT NOT NULL DEFAULT 'full-access',
      model TEXT NOT NULL DEFAULT 'moonshotai/kimi-k2.7-code',
      thinking_level TEXT NOT NULL DEFAULT 'xhigh',
      pi_session_file TEXT
    );
    INSERT INTO threads
      (id, title, workspace_path, created_at, updated_at, last_read_at, last_message_preview, permission_mode, model, thinking_level)
    VALUES
      ('legacy-git-thread-1', 'Legacy shared Git chat', ${sqlString(root)}, ${sqlString(now)}, ${sqlString(now)}, ${sqlString(now)}, 'Legacy thread still uses shared root', 'full-access', 'zai-org/GLM-5.1-FP8', 'xhigh');
  `;
  await runCommand("sqlite3", [join(root, ".ambient-codex", "state.sqlite"), sql], root);
}

async function seedCodexPluginCache(root) {
  await seedCachePlugin(root, "openai-curated", "cache-fixture", "1.0.0", {
    name: "cache-fixture",
    version: "1.0.0",
    description: "Fixture imported from the local Codex plugin cache.",
    skills: "./skills/",
    interface: {
      displayName: "Cache Fixture",
      shortDescription: "Exercises local Codex cache import.",
      category: "Testing",
    },
  });
  await seedCachePlugin(root, "openai-bundled", "browser-use", "0.1.0-alpha1", {
    name: "browser-use",
    version: "0.1.0-alpha1",
    description: "Browser Use fixture.",
    skills: "./skills/",
    interface: {
      displayName: "Browser Use",
      shortDescription: "Maps browser workflows onto Ambient Browser.",
      category: "Engineering",
    },
  });
  await seedCachePlugin(root, "openai-bundled", "computer-use", "1.0.758", {
    name: "computer-use",
    version: "1.0.758",
    description: "Computer Use fixture.",
    mcpServers: "./.mcp.json",
    interface: {
      displayName: "Computer Use",
      shortDescription: "Exercises native MCP compatibility labels.",
      category: "Productivity",
    },
  });
}

async function seedChromeProfile(root) {
  await mkdir(join(root, "Default", "Cache"), { recursive: true });
  await writeFile(join(root, "Default", "Cookies"), "ambient e2e cookie fixture", "utf8");
  await writeFile(join(root, "Default", "Cache", "ignored-cache"), "cache fixture", "utf8");
  await writeFile(join(root, "SingletonLock"), "lock fixture", "utf8");
}

async function seedCachePlugin(root, publisher, name, version, manifest) {
  const pluginRoot = join(root, publisher, name, version);
  await mkdir(join(pluginRoot, ".codex-plugin"), { recursive: true });
  await writeFile(
    join(pluginRoot, ".codex-plugin", "plugin.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );
  if (manifest.skills) {
    await mkdir(join(pluginRoot, "skills", name), { recursive: true });
    await writeFile(
      join(pluginRoot, "skills", name, "SKILL.md"),
      ["---", `name: ${name}`, `description: Imported ${name} skill.`, "---", "", "Fixture skill.", ""].join("\n"),
      "utf8",
    );
  }
  if (manifest.mcpServers) {
    await writeFile(
      join(pluginRoot, ".mcp.json"),
      JSON.stringify({ mcpServers: { [name]: { command: "./native-helper", args: ["mcp"] } } }, null, 2),
      "utf8",
    );
  }
}

async function seedRemoteCodexMarketplace(path) {
  await writeFile(
    path,
    JSON.stringify(
      {
        name: "remote-codex-fixture",
        interface: { displayName: "Remote Codex Fixture" },
        plugins: [
          {
            name: "remote-helper",
            version: "0.1.0",
            description: "Remote Codex marketplace fixture.",
            source: {
              source: "git-subdir",
              url: "https://github.com/example/codex-plugins.git",
              path: "./plugins/remote-helper",
              ref: "main",
            },
            category: "Productivity",
            interface: {
              displayName: "Remote Helper",
              shortDescription: "Registers remote Codex metadata without running plugin code.",
              category: "Productivity",
            },
          },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );
}

async function readAmbientApiKey() {
  const existing = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
  if (existing?.trim()) return existing.trim();
  const candidates = [
    process.env.AMBIENT_API_KEY_FILE,
    join(process.cwd(), "ambient_api_key.txt"),
    join(dirname(process.cwd()), "ambient_api_key.txt"),
    join(dirname(dirname(process.cwd())), "ambient_api_key.txt"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const value = (await readFile(candidate, "utf8")).trim();
      if (value) return value;
    } catch {
      // Try the next conventional key location.
    }
  }
  return undefined;
}

async function seedProjectRegistry(root, paths) {
  await writeFile(join(root, "projects.json"), JSON.stringify({ version: 1, paths }, null, 2), "utf8");
}

async function launchApp() {
  if (!fixedCdpPort) port = await findOpenPort(9475);
  const child = spawn(
    "pnpm",
    ["exec", "electron-vite", "dev", "--", `--remote-debugging-port=${port}`],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        AMBIENT_DESKTOP_WORKSPACE: workspace,
        AMBIENT_E2E: "1",
        AMBIENT_E2E_USER_DATA: userData,
        ...(process.env.AMBIENT_E2E_ONLY === "voice-settings" || process.env.AMBIENT_E2E_CAPTURE_MESSAGES === "1"
          ? { AMBIENT_E2E_CAPTURE_MESSAGES: "1" }
          : {}),
        AMBIENT_E2E_DIAGNOSTICS_PATH: diagnosticsPath,
        AMBIENT_E2E_OPEN_TARGET_LOG: openTargetLogPath,
        AMBIENT_E2E_OPEN_TARGETS: "1",
        AMBIENT_CODEX_PLUGIN_CACHE: codexPluginCache,
        AMBIENT_CODEX_CURATED_MARKETPLACE_URL: "0",
        AMBIENT_CODEX_REMOTE_MARKETPLACE_PATH: remoteCodexMarketplacePath,
        AMBIENT_PI_PACKAGE_GALLERY_PATH: piPackageGalleryPath,
        AMBIENT_PI_USER_SETTINGS_PATH: join(userData, "missing-pi-settings.json"),
        AMBIENT_BROWSER_CHROME_PROFILE: chromeProfile,
        ...(ambientApiKey ? { AMBIENT_API_KEY: ambientApiKey, AMBIENT_AGENT_AMBIENT_API_KEY: ambientApiKey } : {}),
      },
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    },
  );
  children.add(child);
  child.once("exit", () => children.delete(child));

  child.stdout.on("data", (chunk) => output.push(chunk.toString("utf8")));
  child.stderr.on("data", (chunk) => output.push(chunk.toString("utf8")));

  const target = await waitForTarget(port);
  await delay(750);
  const cdp = await connectCdp(target.webSocketDebuggerUrl);
  await waitFor(cdp, () => document.body?.innerText.includes("Ambient"), "main shell");
  return { child, cdp };
}

async function runMainSmoke(cdp) {
  await expectText(cdp, "Ambient");
  await assertDesktopLayout(cdp);
  await assertSidebarResize(cdp);
  await assertCollapsedSidebarTopbarInset(cdp);
  await openApiKeyDialogSmoke(cdp);
  await runThreadListSmoke(cdp);
  await runProjectBoardSmoke(cdp);
  await evaluate(cdp, `window.ambientDesktop.setOrchestrationAutoDispatchEnabled({ enabled: false }).then(() => true)`);

  await clickButton(cdp, "Settings");
  await waitFor(cdp, () => document.body.innerText.includes("Diagnostics"), "settings panel");
  await runVoiceSettingsSmoke(cdp);
  await clickButton(cdp, "Settings");
  await waitFor(cdp, () => Boolean(document.querySelector(".diagnostic-export")), "settings diagnostics panel");
  await clickDiagnosticsExport(cdp);
  await waitFor(cdp, () => document.body.innerText.includes("Saved diagnostics.json"), "diagnostics export status");

  await clickButton(cdp, "Add context");
  await waitFor(cdp, () => document.body.innerText.includes("Choose files"), "context panel");
  await expectText(cdp, "Choose folders");

  await clickButtonByTitle(cdp, "File tree");
  await waitFor(cdp, () => [...document.querySelectorAll("button")].some((button) => button.textContent?.includes("notes.md")), "file tree");
  await clickFileRow(cdp, "notes.md");
  await waitFor(cdp, () => document.body.innerText.includes("E2E Notes"), "markdown preview");
  await clickNthButton(cdp, "Add context", 1);
  await waitFor(cdp, () => document.body.innerText.includes("notes.md") && document.body.innerText.includes("Clear"), "context chip");

  await clickFileRow(cdp, "pixel.png");
  await waitFor(cdp, () => {
    const image = document.querySelector('img[alt="pixel.png"]');
    return Boolean(image && image.naturalWidth > 0);
  }, "image preview");

  await clickFileRow(cdp, "sound.wav");
  await waitFor(cdp, () => Boolean(document.querySelector('.file-media-preview audio[src^="ambient-media://"]')), "audio preview");

  await clickFileRow(cdp, "clip.webm");
  await waitFor(cdp, () => Boolean(document.querySelector('.file-media-preview video[src^="ambient-media://"]')), "video preview");

  await clickFileRow(cdp, "sample.pdf");
  await waitFor(cdp, () => Boolean(document.querySelector('iframe.file-pdf-preview[title="sample.pdf"]')), "PDF preview");

  await clickFileRow(cdp, "sample.docx");
  await assertOfficePreviewSmoke(cdp, "Office preview");

  await clickFileRow(cdp, "app.ts");
  await waitFor(cdp, () => document.body.innerText.includes("export const e2e = true"), "code preview");
  await waitFor(cdp, () => [...document.querySelectorAll("button")].some((button) => button.textContent?.includes("VS Code")), "VS Code open target");
  await assertFilePaneResize(cdp);
  await clickButton(cdp, "VS Code");
  await delay(350);

  await clickButtonByTitle(cdp, "Terminal");
  await waitFor(cdp, () => document.body.innerText.includes("Ambient terminal"), "terminal panel");
  await waitFor(
    cdp,
    () => {
      const label = document.querySelector(".terminal-banner code")?.textContent?.trim();
      return label === "none" || label === "macos-sandbox-exec" || label === "policy-only";
    },
    "terminal sandbox label",
  );
  await typeTerminal(cdp, "printf 'E2E_TERMINAL_DIRECT\\n'");
  await pressTerminalKey(cdp, "Enter");
  await waitFor(cdp, () => document.querySelector(".terminal-output")?.textContent?.includes("E2E_TERMINAL_DIRECT"), "direct terminal typing");

  await runSearchSmoke(cdp);
  await runUpdateNoticeSmoke(cdp);
  await runBrowserSmoke(cdp);
  await runDiffSmoke(cdp);
  await runNoRepoGitSmoke(cdp);
  await runSharedWorkspaceMigrationSmoke(cdp);
  await runPluginSmoke(cdp);
  await runOrchestrationSmoke(cdp);
  await runProjectControlsSmoke(cdp);
  await runResponsiveSmoke(cdp);
  await runPromptHistorySmoke(cdp);
  await runSyntheticStreamSmoke(cdp);
}

async function runUpdateNoticeSmoke(cdp) {
  const state = await desktopState(cdp);
  await emitE2eEvent(cdp, {
    type: "state",
    state: {
      ...state,
      app: {
        ...state.app,
        update: {
          enabled: true,
          status: "available",
          currentVersion: state.app.version,
          channel: "stable",
          feedUrl: "https://updates.ambient.xyz/desktop/stable",
          availableVersion: "99.0.0-e2e",
          releaseName: "Synthetic E2E update",
          releaseNotes: "Synthetic update used to verify the notification surface.",
          canCheck: true,
          canDownload: true,
          canInstall: false,
        },
      },
    },
  });
  await waitFor(cdp, () => document.querySelector(".desktop-update-pill")?.textContent?.includes("Update"), "update notice pill");
  await openUpdateNoticePopover(cdp);
  await waitFor(cdp, () => document.querySelector(".desktop-update-popover")?.textContent?.includes("99.0.0-e2e"), "update popover");
  await waitFor(cdp, () => document.querySelector(".desktop-update-popover")?.textContent?.includes("Download"), "update download action");
  await clickSelector(cdp, '.desktop-update-popover button[title="Dismiss update notice"]');
  await waitFor(cdp, () => !document.querySelector(".desktop-update-pill"), "update notice dismissed");
}

async function runVoiceOnlySmoke(cdp) {
  await expectText(cdp, "Ambient");
  await runVoiceArtifactManagementSmoke(cdp);
  await clickButton(cdp, "Settings");
  await waitFor(cdp, () => document.body.innerText.includes("Diagnostics"), "settings panel");
  await runVoiceSettingsSmoke(cdp);
  await clickButton(cdp, "Settings");
  await waitFor(cdp, () => document.body.innerText.includes("Diagnostics"), "settings panel reopened for voice onboarding prompt");
  await runVoiceOnboardingPromptSmoke(cdp);
}

async function runMediaArtifactOnlySmoke(cdp) {
  await expectText(cdp, "Ambient");
  const state = await desktopState(cdp);
  if (!state.activeThreadId) throw new Error("Expected an active thread for media artifact smoke.");
  await runMediaArtifactSmoke(cdp, state.activeThreadId);
}

async function runOfficePreviewOnlySmoke(cdp) {
  await expectText(cdp, "Ambient");
  await clickButtonByTitle(cdp, "File tree");
  await waitFor(cdp, () => [...document.querySelectorAll("button")].some((button) => button.textContent?.includes("sample.docx")), "office sample in file tree");
  await clickFileRow(cdp, "sample.docx");
  await assertOfficePreviewSmoke(cdp, "Office preview smoke");
}

async function assertOfficePreviewSmoke(cdp, label) {
  await waitFor(
    cdp,
    () =>
      (document.body.innerText.includes("Extracted text") && document.body.innerText.includes("Extracted document text is visible.")) ||
      Boolean(document.querySelector('iframe.file-pdf-preview[title="sample.docx preview"]')),
    label,
  );
  await waitFor(
    cdp,
    () => {
      const text = document.body.innerText;
      if (document.querySelector('iframe.file-pdf-preview[title="sample.docx preview"]')) return true;
      return text.includes("Retry preview") && text.includes("LibreOffice not found");
    },
    `${label} retry affordance`,
  );
}

async function runVoiceToolCardOnlySmoke(cdp) {
  await expectText(cdp, "Ambient");
  const state = await desktopState(cdp);
  if (!state.activeThreadId) throw new Error("Expected an active thread for voice tool card smoke.");
  await runVoiceToolCardSmoke(cdp, state.activeThreadId);
  await runSttToolCardSmoke(cdp, state.activeThreadId);
}

async function openUpdateNoticePopover(cdp) {
  const opened = await evaluate(
    cdp,
    `
    (() => {
      if (document.querySelector(".desktop-update-popover")) return true;
      const pill = document.querySelector(".desktop-update-pill");
      if (!pill) return false;
      if (pill.getAttribute("aria-expanded") !== "true") pill.click();
      return true;
    })()
  `,
  );
  if (!opened) throw new Error("Unable to open update notice popover.");
}

async function runVoiceArtifactManagementSmoke(cdp) {
  await waitFor(cdp, () => document.body.innerText.includes("Voice artifact ready for cleanup."), "seeded voice assistant message");
  await waitFor(
    cdp,
    () => {
      const status = document.querySelector(".thread-voice-status");
      const text = status?.textContent ?? "";
      const button = status?.querySelector("button");
      return text.includes("Voice not set up") && text.includes("1 ready") && button?.textContent?.includes("Voice settings");
    },
    "thread voice lifecycle status",
  );
  await clickSelector(cdp, ".thread-voice-status button");
  await waitFor(
    cdp,
    () => {
      const section = document.querySelector("#settings-section-voice");
      const text = section?.textContent ?? "";
      return (
        Boolean(section) &&
        text.includes("Provider cache:") &&
        text.includes("Voice setup health") &&
        text.includes("None selected") &&
        text.includes("2 managed") &&
        text.includes("Provider refresh activity") &&
        text.includes("Voice artifacts")
      );
    },
    "thread voice status routes to focused voice settings",
  );
  await clickSelector(cdp, ".panel-close-button");
  await waitFor(
    cdp,
    () => {
      const strip = document.querySelector(".message-voice-state.voice-ready");
      if (!strip) return false;
      const titles = [...strip.querySelectorAll("button")].map((button) => button.getAttribute("title"));
      return (
        strip.textContent?.includes("Voice ready") &&
        strip.textContent?.includes("provider E2E Voice Provider") &&
        titles.includes("Play voice") &&
        titles.includes("Stop voice") &&
        titles.includes("Inspect voice details") &&
        titles.includes("Regenerate voice") &&
        titles.includes("Reveal voice file") &&
        titles.includes("Clear voice file")
      );
    },
    "ready voice artifact controls",
  );
  const activeWorkspacePath = await evaluate(cdp, "window.ambientDesktop.bootstrap().then((state) => state.activeWorkspace.path)");
  const artifactPath = join(activeWorkspacePath, ".ambient", "voice", "e2e-thread", "e2e-assistant.wav");
  const orphanPath = join(activeWorkspacePath, ".ambient", "voice", "e2e-thread", "orphan.wav");
  const initialRetention = await evaluate(
    cdp,
    "window.ambientDesktop.inspectVoiceArtifacts({ threadId: 'e2e-thread', providerCapabilityId: 'ambient-cli:ambient-e2e-voice-provider:tool:e2e_voice_provider' })",
  );
  if (initialRetention.managedFileCount !== 2 || initialRetention.referencedFileCount !== 1 || initialRetention.orphanedFileCount !== 1) {
    throw new Error(`Expected initial voice artifact retention inventory: ${JSON.stringify(initialRetention)}`);
  }
  await readFile(artifactPath);
  await clickVoiceStripButton(cdp, "Inspect voice details");
  await waitFor(
    cdp,
    () => {
      const details = document.querySelector(".message-voice-details");
      const text = details?.textContent ?? "";
      return text.includes("Artifact path") && text.includes(".ambient/voice/e2e-thread/e2e-assistant.wav") && text.includes("Voice artifact ready for cleanup.");
    },
    "ready voice artifact inspection details",
  );
  await clickVoiceStripButton(cdp, "Inspect voice details");
  const clicked = await evaluate(
    cdp,
    `
    (() => {
      const strip = document.querySelector(".message-voice-state.voice-ready");
      const button = [...(strip?.querySelectorAll("button") ?? [])].find((item) => item.getAttribute("title") === "Clear voice file");
      button?.click();
      return Boolean(button);
    })()
  `,
  );
  if (!clicked) throw new Error("Unable to click clear voice file.");
  await waitFor(
    cdp,
    () => {
      const strip = document.querySelector(".message-voice-state.voice-canceled");
      const text = strip?.textContent ?? "";
      const titles = [...(strip?.querySelectorAll("button") ?? [])].map((button) => button.getAttribute("title"));
      return (
        text.includes("Voice canceled") &&
        text.includes("Audio artifact cleared") &&
        titles.includes("Inspect voice details") &&
        titles.includes("Retry voice synthesis") &&
        !titles.includes("Play voice") &&
        !titles.includes("Stop voice") &&
        !titles.includes("Reveal voice file") &&
        !titles.includes("Clear voice file")
      );
    },
    "cleared voice artifact controls",
  );
  const state = await evaluate(cdp, "window.ambientDesktop.bootstrap()");
  const voiceState = state.messageVoiceStates["e2e-assistant"];
  if (voiceState?.status !== "canceled" || voiceState.audioPath || voiceState.mediaUrl || voiceState.mimeType || voiceState.durationMs) {
    throw new Error(`Expected cleared voice artifact metadata: ${JSON.stringify(voiceState)}`);
  }
  if (voiceState.lastAudioPath !== ".ambient/voice/e2e-thread/e2e-assistant.wav") {
    throw new Error(`Expected cleared voice artifact to preserve last path: ${JSON.stringify(voiceState)}`);
  }
  await clickVoiceStripButton(cdp, "Inspect voice details");
  await waitFor(
    cdp,
    () => {
      const details = document.querySelector(".message-voice-details");
      const text = details?.textContent ?? "";
      return text.includes("Last artifact path") && text.includes(".ambient/voice/e2e-thread/e2e-assistant.wav") && text.includes("Voice artifact ready for cleanup.");
    },
    "cleared voice artifact inspection details",
  );
  try {
    await readFile(artifactPath);
    throw new Error(`Expected voice artifact to be deleted: ${artifactPath}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const pruneResult = await evaluate(cdp, "window.ambientDesktop.pruneVoiceArtifacts({ threadId: 'e2e-thread' })");
  if (pruneResult.deletedFileCount !== 1 || pruneResult.orphanedFileCount !== 1) {
    throw new Error(`Expected voice artifact prune to delete one orphan: ${JSON.stringify(pruneResult)}`);
  }
  try {
    await readFile(orphanPath);
    throw new Error(`Expected orphan voice artifact to be deleted: ${orphanPath}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function clickVoiceStripButton(cdp, title) {
  const clicked = await evaluate(
    cdp,
    `
    (() => {
      const title = ${JSON.stringify(title)};
      const strip = document.querySelector(".message-voice-state");
      const button = [...(strip?.querySelectorAll("button") ?? [])].find((item) => item.getAttribute("title") === title);
      button?.click();
      return Boolean(button);
    })()
  `,
  );
  if (!clicked) throw new Error(`Unable to click voice strip button: ${title}`);
}

async function runThreadListSmoke(cdp) {
  const before = await desktopState(cdp);
  const created = await evaluate(cdp, "window.ambientDesktop.createThread()");
  const beforeHadEmptyStarter = before.threads.some((thread) => thread.title === "New chat" && !thread.lastMessagePreview);
  const expectedCreatedCount = beforeHadEmptyStarter ? before.threads.length : before.threads.length + 1;
  if (created.threads.length !== expectedCreatedCount) {
    throw new Error(`Creating a starter chat produced an unexpected thread count. Before=${before.threads.length}, after=${created.threads.length}`);
  }
  const starter = created.threads.find((thread) => thread.id === created.activeThreadId);
  if (starter?.title !== "New chat" || starter.lastMessagePreview) {
    throw new Error(`Expected createThread to activate an empty starter chat, got ${JSON.stringify(starter)}.`);
  }
  const reused = await evaluate(cdp, "window.ambientDesktop.createThread()");
  if (reused.threads.length !== created.threads.length) {
    throw new Error(`Creating a thread from an empty starter chat should reuse it. Before=${created.threads.length}, after=${reused.threads.length}`);
  }
  if (reused.activeThreadId !== created.activeThreadId) {
    throw new Error(`Expected empty starter chat to remain active, got ${reused.activeThreadId}.`);
  }
  await waitFor(cdp, () => document.querySelectorAll(".thread-row.active").length === 1, "single active starter thread row");
  await assertProjectThreadTitleTooltips(cdp);
  await evaluate(
    cdp,
    `window.ambientDesktop.openThreadMiniWindow({ threadId: ${JSON.stringify(reused.activeThreadId)}, workspacePath: ${JSON.stringify(reused.workspace.path)} }).then(() => true)`,
  );
  await waitForMiniWindowTarget(reused.threads.find((thread) => thread.id === reused.activeThreadId)?.title ?? "New chat");
}

async function runProjectBoardSmoke(cdp) {
  await evaluate(
    cdp,
    `window.ambientDesktop.createOrchestrationTask(${JSON.stringify({
      title: "E2E unattached task",
      description: "Existing Local Task that should be attachable from the project board.",
      state: "todo",
      priority: 6,
      labels: ["e2e", "orphan"],
    })})`,
  );
  await evaluate(
    cdp,
    `window.ambientDesktop.createOrchestrationTask(${JSON.stringify({
      title: "E2E evidence task",
      description: "Existing Local Task that should be importable as completed evidence.",
      state: "done",
      priority: 7,
      labels: ["e2e", "evidence"],
    })})`,
  );
  await waitFor(
    cdp,
    () => {
      const button = [...document.querySelectorAll("button")].find((item) => item.getAttribute("aria-label") === "Add Plan to Board");
      return Boolean(button?.disabled && button.title.includes("Build a project board"));
    },
    "project board toolbar add plan disabled before board",
  );
  await openProjectBoardSetup(cdp);
  await clickButton(cdp, "Build Board");
  await waitFor(cdp, () => document.querySelector(".project-board-workspace")?.textContent?.includes("Kickoff draft"), "project board created", 120_000);
  await waitFor(cdp, () => document.querySelector(".project-board-kickoff")?.textContent?.includes("Kickoff interview"), "project board kickoff");
  const kickoffAnswers = [
    "Prioritize a stable, test-covered implementation.",
    "Use notes.md as source context and ask if the thread conflicts with it.",
    "Make small reversible implementation choices unless scope changes.",
    "Require unit, integration, and visual proof before moving cards to review.",
  ];
  await answerProjectBoardKickoff(cdp, kickoffAnswers, "project board");
  await clickButton(cdp, "Activate Board");
  await waitFor(cdp, () => document.querySelector(".project-board-tabs")?.textContent?.includes("Draft Inbox"), "project board tabs");
  await clickProjectBoardTab(cdp, "Charter");
  await waitFor(cdp, () => document.querySelector(".project-board-charter-preview")?.textContent?.includes("Charter preview"), "project board charter preview");
  await waitFor(cdp, () => document.querySelector(".project-board-source-review")?.textContent?.includes("notes.md"), "project board source review");
  await waitFor(cdp, () => document.querySelector(".project-board-source-review")?.textContent?.includes("Package: ambient-e2e-pi-package"), "project board package config source");
  await waitFor(cdp, () => document.querySelector(".project-board-source-review")?.textContent?.includes("Git working tree"), "project board git state source");
  await selectProjectBoardSourceKind(cdp, "notes.md", "functional_spec");
  await waitFor(
    cdp,
    () =>
      [...document.querySelectorAll(".project-board-source-item")].some(
        (item) => item.textContent?.includes("notes.md") && item.querySelector("select")?.value === "functional_spec",
      ),
    "project board source reclassified",
  );
  await clickButton(cdp, "Refresh Sources");
  await waitFor(
    cdp,
    () =>
      [...document.querySelectorAll(".project-board-source-item")].some(
        (item) => item.textContent?.includes("notes.md") && item.querySelector("select")?.value === "functional_spec",
      ),
    "project board source reclassification preserved after refresh",
  );
  await waitFor(
    cdp,
    () => [...document.querySelectorAll("button")].some((button) => !button.disabled && button.textContent?.includes("Refresh Sources")),
    "project board source refresh settled",
    120_000,
  );
  await clickProjectBoardTab(cdp, "Draft Inbox");
  await waitFor(cdp, () => document.querySelector(".project-board-draft-board")?.textContent?.includes("Ready To Create"), "project board draft candidate columns");
  await clickButtonByTitle(cdp, "Close project board");
  await waitFor(cdp, () => !document.querySelector(".project-board-workspace"), "project board closed before toolbar plan promotion");
  await waitFor(
    cdp,
    () => {
      const button = [...document.querySelectorAll("button")].find((item) => item.getAttribute("aria-label") === "Add Plan to Board");
      return Boolean(button?.disabled && button.title.includes("Create a ready planner plan first"));
    },
    "project board toolbar add plan disabled without ready plan",
  );
  await injectReadyPlannerPlanArtifact(cdp, "E2E toolbar plan");
  await waitFor(
    cdp,
    () => {
      const button = [...document.querySelectorAll("button")].find((item) => item.getAttribute("aria-label") === "Add Plan to Board");
      return Boolean(button && !button.disabled && button.textContent?.includes("Add Plan to Board"));
    },
    "project board toolbar add plan enabled",
  );
  await clickButton(cdp, "Add Plan to Board");
  await waitFor(cdp, () => document.querySelector(".project-board-workspace")?.textContent?.includes("Active board"), "project board opened by toolbar plan promotion");
  await clickProjectBoardTab(cdp, "Draft Inbox");
  await waitFor(cdp, () => document.querySelector(".project-board-draft-board")?.textContent?.includes("E2E toolbar plan"), "project board toolbar plan promoted");
  await clickButton(cdp, "New Draft Card");
  await waitFor(cdp, () => document.querySelector(".project-board-draft-board")?.textContent?.includes("New draft card"), "project board manual draft card");
  await injectProjectBoardBatchTicketizationCandidates(cdp);
  await waitFor(cdp, () => document.querySelector(".project-board-draft-board")?.textContent?.includes("E2E batch dependent card"), "project board batch ready candidates");
  await clickButton(cdp, "Create 3 Ready Tasks");
  await waitFor(cdp, () => document.querySelector(".project-board-draft-board")?.textContent?.includes("Create Ready Tasks"), "project board batch ticketization complete");
  const created = await desktopState(cdp);
  const activeProject = created.projects.find((project) => project.path === created.workspace.path);
  if (!activeProject?.board) throw new Error("Expected active project to expose a project board after Build Board.");
  if (activeProject.board.status !== "active") throw new Error(`Expected active board, got ${activeProject.board.status}.`);
  if (activeProject.board.charter?.status !== "active") throw new Error("Expected active project board charter after kickoff finalization.");
  if (activeProject.board.charter?.goal !== kickoffAnswers[0]) throw new Error("Expected kickoff answer to become the active charter goal.");
  if (!activeProject.board.sources.some((source) => source.path === "notes.md" && source.kind === "functional_spec")) {
    throw new Error("Expected notes.md in project board sources as a user-reclassified spec.");
  }
  if (!activeProject.board.cards.some((card) => card.sourceKind === "planner_plan" && card.sourceId === "e2e-toolbar-plan-artifact")) {
    throw new Error("Expected toolbar plan promotion to create a planner-plan board candidate.");
  }
  if (!activeProject.board.cards.some((card) => card.sourceKind === "manual" && card.title === "New draft card")) {
    throw new Error("Expected New Draft Card to create a manual board candidate.");
  }
  const batchReady = activeProject.board.cards.find((card) => card.id === "e2e-batch-ready-card");
  const batchDependent = activeProject.board.cards.find((card) => card.id === "e2e-batch-dependent-card");
  if (!batchReady?.orchestrationTaskId || !batchDependent?.orchestrationTaskId) {
    throw new Error("Expected batch ready candidate cards to become Local Tasks.");
  }
  const batchOrchestration = await evaluate(cdp, "window.ambientDesktop.listOrchestrationBoard()");
  const batchReadyTask = batchOrchestration.tasks.find((task) => task.id === batchReady.orchestrationTaskId);
  const batchDependentTask = batchOrchestration.tasks.find((task) => task.id === batchDependent.orchestrationTaskId);
  if (!batchReadyTask || !batchDependentTask?.blockedBy.includes(batchReadyTask.identifier)) {
    throw new Error("Expected batch ticketization to preserve board dependency as a Local Task blocker.");
  }
  if (!activeProject.board.events?.some((event) => event.kind === "manual_card_created")) {
    throw new Error("Expected manual card creation to be captured in board history.");
  }
  if (!activeProject.board.events?.some((event) => event.kind === "ready_tasks_created")) {
    throw new Error("Expected batch ready task creation to be captured in board history.");
  }
  await injectProjectBoardCandidate(cdp, "E2E editable candidate");
  await clickProjectBoardTab(cdp, "Board");
  await waitFor(cdp, () => document.querySelector(".project-board-unattached-tasks")?.textContent?.includes("E2E unattached task"), "project board unattached local task");
  await waitFor(cdp, () => document.querySelector(".project-board-unattached-tasks")?.textContent?.includes("E2E evidence task"), "project board evidence local task");
  await clickEnabledButtonInRow(cdp, ".project-board-unattached-task", "E2E unattached task", "Attach");
  await waitFor(
    cdp,
    () =>
      [...document.querySelectorAll(".project-board-column")].some(
        (column) => column.textContent?.includes("E2E unattached task"),
      ),
    "project board attached local task lane",
  );
  await clickEnabledButtonInRow(cdp, ".project-board-unattached-task", "E2E evidence task", "Mark Covered");
  await clickProjectBoardTab(cdp, "Draft Inbox");
  await waitFor(cdp, () => document.querySelector(".project-board-draft-board")?.textContent?.includes("E2E evidence task"), "project board imported evidence card");
  await clickProjectBoardTab(cdp, "Board");
  await waitFor(
    cdp,
    () =>
      [...document.querySelectorAll(".project-board-column")].some(
        (column) => column.textContent?.includes("In Progress") && column.textContent?.includes("E2E running card"),
      ),
    "project board linked task in progress lane",
  );
  await clickProjectBoardTab(cdp, "Draft Inbox");
  await clickEnabledButtonInRow(cdp, ".project-board-card", "E2E editable candidate", "Details");
  await waitFor(cdp, () => document.querySelector(".project-board-candidate-detail")?.textContent?.includes("Candidate detail"), "project board candidate detail");
  await waitFor(cdp, () => document.querySelector(".project-board-candidate-detail")?.textContent?.includes("Split Criteria"), "project board split action");
  await waitFor(cdp, () => document.querySelector(".project-board-candidate-detail")?.textContent?.includes("Dependencies / blockers"), "project board blocker field");
  await waitFor(cdp, () => document.querySelector(".project-board-candidate-detail")?.textContent?.includes("Strict proof policy"), "project board proof gate");
  await waitFor(
    cdp,
    () => [...document.querySelectorAll(".project-board-candidate-detail button")].some((button) => button.textContent?.includes("Mark Ready") && button.disabled),
    "project board mark ready proof gated",
  );
  await fillInput(cdp, '.project-board-candidate-detail input[placeholder="Candidate title"]', "Updated E2E candidate");
  await fillInput(cdp, '.project-board-candidate-detail textarea[placeholder="One blocker id or card reference per line"]', "LOCAL-1\ncard:e2e-plan-artifact");
  await waitFor(cdp, () => [...document.querySelectorAll(".project-board-candidate-detail button")].some((button) => button.textContent?.includes("Save Details") && !button.disabled), "project board candidate save enabled");
  await clickProjectBoardTab(cdp, "Map");
  await waitFor(cdp, () => document.querySelector(".project-board-map-panel")?.textContent?.includes("dependency issue"), "project board map tab");
  await waitFor(cdp, () => document.querySelector(".project-board-map-panel")?.textContent?.includes("E2E editable candidate"), "project board map candidate");
  await waitFor(cdp, () => document.querySelector(".project-board-map-issues")?.textContent?.includes("Unresolved blocker"), "project board map unresolved blocker");
  await waitFor(cdp, () => document.querySelector(".project-board-execution-order")?.textContent?.includes("Execution order"), "project board execution order");
  await waitFor(cdp, () => document.querySelector(".project-board-execution-order")?.textContent?.includes("E2E dependent card"), "project board dependent execution item");
  await waitFor(cdp, () => document.querySelector(".project-board-execution-order")?.textContent?.includes("Waiting on dependencies"), "project board dependency readiness label");
  await waitFor(cdp, () => document.querySelector(".project-board-map-panel")?.textContent?.includes("Waiting on E2E running card"), "project board map readiness badge");
  await waitFor(cdp, () => document.querySelector(".project-board-map-panel")?.textContent?.includes("Edit dependencies"), "project board dependency edit controls");
  await clickEnabledButtonInRow(cdp, ".project-board-map-card", "E2E editable candidate", "Remove blocker LOCAL-1");
  await waitFor(cdp, () => ![...document.querySelectorAll(".project-board-map-card")].some((card) => card.textContent?.includes("E2E editable candidate") && card.textContent.includes("LOCAL-1")), "project board dependency blocker removed");
  await selectProjectBoardMapBlocker(cdp, "E2E editable candidate", "E2E running card");
  await clickEnabledButtonInRow(cdp, ".project-board-map-card", "E2E editable candidate", "Add blocker");
  await waitFor(
    cdp,
    () =>
      [...document.querySelectorAll(".project-board-map-card")].some(
        (card) => card.textContent?.includes("E2E editable candidate") && card.textContent.includes("Waiting on E2E running card"),
      ),
    "project board dependency blocker added",
  );
  await clickProjectBoardTab(cdp, "Tests");
  await waitFor(cdp, () => document.querySelector(".project-board-tests-panel")?.textContent?.includes("Strict proof gate"), "project board tests tab");
  await waitFor(cdp, () => document.querySelector(".project-board-tests-panel")?.textContent?.includes("Missing proof"), "project board missing proof lane");
  await waitFor(cdp, () => document.querySelector(".project-board-tests-panel")?.textContent?.includes("Integration / browser proof"), "project board integration browser proof lane");
  await waitFor(cdp, () => document.querySelector(".project-board-tests-panel")?.textContent?.includes("Manual review"), "project board manual proof lane");
  await waitFor(cdp, () => document.querySelector(".project-board-tests-panel")?.textContent?.includes("No proof expectation recorded"), "project board missing proof card copy");
  await clickProjectBoardTab(cdp, "Charter");
  await waitFor(cdp, () => document.querySelector(".project-board-charter-preview")?.textContent?.includes("Charter preview"), "project board charter tab");
  await clickProjectBoardTab(cdp, "History");
  await waitFor(cdp, () => document.querySelector(".project-board-history-panel")?.textContent?.includes("Charter finalized"), "project board history charter event");
  await waitFor(cdp, () => document.querySelector(".project-board-history-panel")?.textContent?.includes("Sources refreshed"), "project board history source event");
  await waitFor(cdp, () => document.querySelector(".project-board-history-panel")?.textContent?.includes("Source reclassified"), "project board history source reclassified event");
  await clickButtonByTitle(cdp, "Close project board");
  await waitFor(cdp, () => !document.querySelector(".project-board-workspace"), "project board closed");
  await clickButton(cdp, "Open Board");
  await waitFor(cdp, () => document.querySelector(".project-board-workspace")?.textContent?.includes("Active board"), "project board reopened");
  await clickButtonByTitle(cdp, "Close project board");
  await waitFor(cdp, () => !document.querySelector(".project-board-workspace"), "project board closed again");
  await deleteProjectBoardImportFixtureTasks(cdp);
}

async function answerProjectBoardKickoff(cdp, answers, label) {
  for (let index = 0; index < 10; index += 1) {
    const hasQuestion = await evaluate(cdp, `Boolean(document.querySelector(".project-board-question textarea"))`);
    if (!hasQuestion) return;
    await fillInput(cdp, ".project-board-question textarea", answers[index] ?? answers[answers.length - 1]);
    const clicked = await evaluate(
      cdp,
      `
      (() => {
        const root = document.querySelector(".project-board-question");
        const button = [...(root?.querySelectorAll("button") ?? [])].find(
          (item) => !item.disabled && (item.textContent?.includes("Next") || item.textContent?.includes("Finish Questions"))
        );
        button?.click();
        return Boolean(button);
      })()
    `,
    );
    if (!clicked) throw new Error(`Unable to advance ${label} question ${index + 1}.`);
    const progressLabel = `${index + 1} answered`;
    await waitFor(
      cdp,
      new Function(
        `return !document.querySelector(".project-board-question textarea") || document.querySelector(".project-board-kickoff")?.textContent?.includes(${JSON.stringify(
          progressLabel,
        )});`,
      ),
      `${label} answer ${index + 1} saved`,
    );
  }
  throw new Error(`Unable to finish ${label} kickoff questions within 10 answers.`);
}

async function runVoiceSettingsSmoke(cdp) {
  await waitFor(
    cdp,
    () => {
      const providerSelect = document.querySelector('#settings-section-voice select[aria-label="Voice provider"]');
      return [...(providerSelect?.options ?? [])].some((item) => item.textContent?.includes("E2E Voice Provider"));
    },
    "voice provider option",
  );
  await expectText(cdp, "Add provider");
  const selected = await evaluate(
    cdp,
    `
    (() => {
      const section = document.querySelector("#settings-section-voice");
      if (!section) return { ok: false, reason: "voice section not found" };
      const providerSelect = section.querySelector('select[aria-label="Voice provider"]');
      const option = [...(providerSelect?.options ?? [])].find((item) => item.textContent?.includes("E2E Voice Provider"));
      if (!providerSelect || !option) return { ok: false, reason: "provider select/option not found" };
      providerSelect.value = option.value;
      providerSelect.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true, value: providerSelect.value };
    })()
  `,
  );
  if (!selected?.ok) throw new Error(`Unable to select voice provider: ${selected?.reason ?? "unknown"}`);
  await waitFor(
    cdp,
    () => {
      const section = document.querySelector("#settings-section-voice");
      const text = section?.textContent ?? "";
      const toggles = [...(section?.querySelectorAll('label.setting-toggle input[type="checkbox"]') ?? [])];
      return (
        text.includes("E2E Voice Provider") &&
        text.includes("Provider cache:") &&
        text.includes("Voice setup health") &&
        text.includes("Provider unavailable") &&
        text.includes("Voice artifacts") &&
        text.includes("Provider refresh activity") &&
        text.includes("cached provider label") &&
        text.includes("Health check failed") &&
        text.includes("model file missing") &&
        text.includes("Verify model files are downloaded") &&
        toggles.length >= 2 &&
        toggles.every((input) => !input.checked && input.disabled)
      );
    },
    "voice provider failed diagnostics and blocked toggles",
  );
  const activeWorkspacePath = await evaluate(cdp, "window.ambientDesktop.bootstrap().then((state) => state.activeWorkspace.path)");
  await writeFile(join(activeWorkspacePath, ".ambient", "cli-packages", "imported", "ambient-e2e-voice-provider", "voice-ready.marker"), "ready\n", "utf8");
  await clickButton(cdp, "Retry health");
  await waitFor(
    cdp,
    () => {
      const section = document.querySelector("#settings-section-voice");
      const text = section?.textContent ?? "";
      const toggles = [...(section?.querySelectorAll('label.setting-toggle input[type="checkbox"]') ?? [])];
      return (
        text.includes("Provider cache:") &&
        text.includes("Voice setup health") &&
        text.includes("E2E Voice Provider") &&
        text.includes("Provider refresh activity") &&
        text.includes("Health check passed") &&
        toggles.length >= 2 &&
        toggles.every((input) => !input.disabled)
      );
    },
    "voice provider repaired diagnostics",
  );
  await openSettingsDisclosure(cdp, "#settings-section-voice", "Provider details");
  await clickButton(cdp, "Refresh voices");
  await waitFor(
    cdp,
    () => {
      const section = document.querySelector("#settings-section-voice");
      const text = section?.textContent ?? "";
      return (
        text.includes("Voice catalog: E2E Voice Provider") &&
        text.includes("10 voices") &&
        text.includes("Voice catalog cache: fresh") &&
        text.includes("10 cached / 10 shown") &&
        text.includes("Dynamic catalog: local-runtime") &&
        text.includes("Voice cloning: local provider") &&
        text.includes("audio wav") &&
        text.includes("consent required") &&
        text.includes("creates local-model-asset, dynamic-cache-voice") &&
        [...(section?.querySelectorAll("select") ?? [])].some((select) => [...select.options].some((option) => option.value === "warm-narrator"))
      );
    },
    "dynamic voice catalog refresh from Settings",
  );
  const dynamicSelected = await evaluate(
    cdp,
    `
    (() => {
      const section = document.querySelector("#settings-section-voice");
      if (!section) return { ok: false, reason: "voice section not found" };
      const search = section.querySelector('input[aria-label="Search voices"]');
      if (!search) return { ok: false, reason: "voice search input not found" };
      search.value = "warm";
      search.dispatchEvent(new Event("input", { bubbles: true }));
      const selects = [...section.querySelectorAll("select")];
      const voiceSelect = selects.find((select) => [...select.options].some((option) => option.value === "warm-narrator"));
      if (!voiceSelect) return { ok: false, reason: "dynamic voice select not found" };
      voiceSelect.value = "warm-narrator";
      voiceSelect.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true, value: voiceSelect.value };
    })()
  `,
  );
  if (!dynamicSelected?.ok) throw new Error(`Unable to select dynamic voice: ${dynamicSelected?.reason ?? "unknown"}`);
  await waitFor(
    cdp,
    () => {
      const section = document.querySelector("#settings-section-voice");
      const voiceSelect = [...(section?.querySelectorAll("select") ?? [])].find((select) => [...select.options].some((option) => option.value === "warm-narrator"));
      const text = section?.textContent ?? "";
      return (
        voiceSelect?.value === "warm-narrator" &&
        text.includes("Selected voice source: cached dynamic catalog") &&
        text.includes("Provider default voice: Warm E2E narrator") &&
        text.includes("current") &&
        text.includes("warm, narration")
      );
    },
    "dynamic voice selected in Settings",
  );
  const settingsAfterDynamicVoice = await evaluate(cdp, "window.ambientDesktop.bootstrap().then((state) => state.settings.voice)");
  if (settingsAfterDynamicVoice.voiceId !== "warm-narrator") {
    throw new Error(`Expected dynamic voice to persist in settings: ${JSON.stringify(settingsAfterDynamicVoice)}`);
  }
  if (settingsAfterDynamicVoice.preferredVoicesByProvider?.[settingsAfterDynamicVoice.providerCapabilityId] !== "warm-narrator") {
    throw new Error(`Expected dynamic voice to persist as provider default: ${JSON.stringify(settingsAfterDynamicVoice)}`);
  }
  await clickVoiceToggle(cdp, 0);
  await waitFor(
    cdp,
    () => {
      const section = document.querySelector("#settings-section-voice");
      const input = [...(section?.querySelectorAll('label.setting-toggle input[type="checkbox"]') ?? [])][0];
      return Boolean(input?.checked && !input.disabled);
    },
    "repaired voice enable toggle checked",
  );
  await clickVoiceToggle(cdp, 1);
  await waitFor(
    cdp,
    () => {
      const section = document.querySelector("#settings-section-voice");
      const text = section?.textContent ?? "";
      const toggles = [...(section?.querySelectorAll('label.setting-toggle input[type="checkbox"]') ?? [])];
      return text.includes("E2E Voice Provider") && text.includes("Health check passed") && toggles.length >= 2 && toggles.every((input) => input.checked && !input.disabled);
    },
    "voice provider repaired and manually enabled",
  );
  const regenerated = await evaluate(cdp, "window.ambientDesktop.regenerateMessageVoice({ messageId: 'e2e-assistant' })");
  if (regenerated?.status !== "ready" || regenerated.voiceId !== "warm-narrator" || regenerated.mimeType !== "audio/wav") {
    throw new Error(`Expected regenerated dynamic voice artifact: ${JSON.stringify(regenerated)}`);
  }
  await rm(join(activeWorkspacePath, ".ambient", "cli-packages", "imported", "ambient-e2e-voice-provider", "voice-ready.marker"), { force: true });
  await emitE2eEvent(cdp, {
    type: "tool-event",
    threadId: "e2e-thread",
    label: "ambient_cli provider repair",
    status: "done",
    details: { source: "first-party", runtime: "chat", toolName: "ambient_cli" },
  });
  await waitFor(
    cdp,
    () => {
      const section = document.querySelector("#settings-section-voice");
      const text = section?.textContent ?? "";
      return (
        text.includes("Voice setup health") &&
        text.includes("Provider unavailable") &&
        text.includes("Provider refresh activity") &&
        text.includes("tool done") &&
        text.includes("Health check failed") &&
        text.includes("model file missing")
      );
    },
    "voice provider regressed diagnostics",
  );
  await clickSelector(cdp, ".panel-close-button");
  await waitFor(
    cdp,
    () => {
      const status = document.querySelector(".thread-voice-status");
      const text = status?.textContent ?? "";
      return text.includes("Voice provider unavailable") && text.includes("E2E Voice Provider") && text.includes("model file missing");
    },
    "thread voice provider unavailable status",
  );
}

async function runVoiceOnboardingPromptSmoke(cdp) {
  await evaluate(
    cdp,
    `
    window.ambientDesktop.bootstrap().then((state) => {
      if (state.activeThreadId) window.ambientDesktop.emitE2eEvent?.({ type: "run-status", threadId: state.activeThreadId, status: "idle" });
      return true;
    })
  `,
  );
  await evaluate(
    cdp,
    `
    (() => {
      window.__ambientCapturedVoiceOnboardingMessages = [];
      window.__ambientVoiceOnboardingCaptureDispose?.();
      window.__ambientVoiceOnboardingCaptureDispose = window.ambientDesktop.onEvent((event) => {
        if (event.type === "e2e-message-captured") window.__ambientCapturedVoiceOnboardingMessages.push(event.input);
      });
      return true;
    })()
  `,
  );
  const clicked = await evaluate(
    cdp,
    `
    (() => {
      const section = document.querySelector("#settings-section-voice");
      const button = [...(section?.querySelectorAll("button") ?? [])].find((item) => item.textContent?.includes("Add provider"));
      if (!button) return { ok: false, reason: "Add provider button not found" };
      if (button.disabled) return { ok: false, reason: button.title || "Add provider button disabled" };
      button.click();
      return { ok: true };
    })()
  `,
  );
  if (!clicked?.ok) throw new Error(`Unable to click voice Add provider: ${clicked?.reason ?? "unknown"}`);
  await waitFor(
    cdp,
    () => Boolean(window.__ambientCapturedVoiceOnboardingMessages?.[0]),
    "voice onboarding captured prompt",
    30_000,
  );
  const captured = await evaluate(cdp, "window.__ambientCapturedVoiceOnboardingMessages?.[0]");
  const content = captured?.content ?? "";
  const expectedFragments = [
    "Installer shape: tts-provider",
    "Machine facts:",
    "OS/arch:",
    "Runtimes/package managers:",
    "Node.js (node): available",
    "Provider recommendation summary:",
    "First-turn behavior: briefly explain these recommendations",
    "Piper: recommended now",
    "ElevenLabs: good option",
    "Cartesia: good option",
    "Piper fast path requirements:",
    "en_US-lessac-medium.onnx",
    "Health check must fail clearly when model assets are missing",
    "Cloud provider fast path requirements:",
    "For ElevenLabs, plan envNames ELEVENLABS_API_KEY",
    "For Cartesia, plan envNames CARTESIA_API_KEY",
    "Do not search bundled app markdown",
    "Piper (local, recommended)",
    "ElevenLabs (cloud, recommended)",
    "Cartesia (cloud, recommended)",
    "ambient_cli_secret_request",
    "ambient_cli_env_bind",
    "never expose secret values",
    "Command contract: accept --text <text>, --output <path>, --format <wav|mp3|ogg>",
  ];
  const missing = expectedFragments.filter((fragment) => !content.includes(fragment));
  if (captured?.delivery !== "prompt" || missing.length) {
    throw new Error(`Unexpected voice onboarding prompt. Missing=${JSON.stringify(missing)} Preview=${JSON.stringify(content.slice(0, 1200))}`);
  }
  await evaluate(
    cdp,
    `
    (() => {
      const latest = window.__ambientCapturedVoiceOnboardingMessages?.[0];
      if (latest?.threadId) window.ambientDesktop.emitE2eEvent?.({ type: "run-status", threadId: latest.threadId, status: "idle" });
      window.__ambientVoiceOnboardingCaptureDispose?.();
      delete window.__ambientVoiceOnboardingCaptureDispose;
      return true;
    })()
  `,
  );
}

async function clickDiagnosticsExport(cdp) {
  const clicked = await evaluate(
    cdp,
    `
    (() => {
      const section = [...document.querySelectorAll(".diagnostic-export")].find((item) =>
        item.querySelector(".panel-section-heading strong")?.textContent?.trim() === "Diagnostics"
      );
      const button = [...(section?.querySelectorAll("button") ?? [])].find((item) => item.textContent?.includes("Export"));
      button?.click();
      return Boolean(button);
    })()
  `,
  );
  if (!clicked) throw new Error("Unable to click diagnostics export button.");
}

async function clickVoiceToggle(cdp, index) {
  const clicked = await evaluate(
    cdp,
    `
    (() => {
      const section = document.querySelector("#settings-section-voice");
      const input = [...(section?.querySelectorAll('label.setting-toggle input[type="checkbox"]') ?? [])][${index}];
      if (!input || input.disabled) return false;
      if (!input.checked) input.click();
      return true;
    })()
  `,
  );
  if (!clicked) throw new Error(`Unable to click voice toggle ${index}.`);
}

async function openSettingsDisclosure(cdp, sectionSelector, title) {
  const opened = await evaluate(
    cdp,
    `
    (() => {
      const section = document.querySelector(${JSON.stringify(sectionSelector)});
      const details = [...(section?.querySelectorAll(".settings-disclosure") ?? [])].find((item) => item.querySelector("summary")?.textContent?.includes(${JSON.stringify(title)}));
      if (!details) return false;
      if (!details.open) details.querySelector("summary")?.click();
      return true;
    })()
  `,
  );
  if (!opened) throw new Error(`Unable to open settings disclosure: ${title}`);
}

async function openApiKeyDialogSmoke(cdp) {
  await clickSelector(cdp, ".provider-pill");
  await waitFor(cdp, () => document.body.innerText.includes("Connect Ambient API"), "API key dialog");
  await expectText(cdp, "app.ambient.xyz/keys");
  await expectText(cdp, "Ambient API key");
  await expectText(cdp, "Get key");
  await expectText(cdp, "Paste");
  await expectText(cdp, "Test key");
  await clickButton(cdp, "Close");
  await waitFor(cdp, () => !document.body.innerText.includes("Connect Ambient API"), "API key dialog close");
}

async function runSearchSmoke(cdp) {
  await clickButton(cdp, "Search");
  await waitFor(cdp, () => Boolean(document.querySelector('input[placeholder="Search this project"]')), "search panel");
  await fillInput(cdp, 'input[placeholder="Search this project"]', "New chat");
  await waitFor(cdp, () => document.querySelectorAll(".search-result-row").length > 0, "search results");
  await clickButton(cdp, "This chat");
  await waitFor(cdp, () => Boolean(document.querySelector('input[placeholder="Search this chat"]')), "chat search scope");
  await fillInput(cdp, 'input[placeholder="Search this chat"]', "New chat");
  await waitFor(cdp, () => document.querySelector(".search-result-row")?.textContent?.includes("New chat"), "chat search result");
  await clickButton(cdp, "All projects");
  await waitFor(cdp, () => Boolean(document.querySelector('input[placeholder="Search all projects"]')), "all projects search scope");
  await fillInput(cdp, 'input[placeholder="Search all projects"]', "mango");
  await waitFor(
    cdp,
    () => document.querySelector(".search-result-row")?.textContent?.includes("Registered project chat"),
    "all projects registered result",
  );
}

async function runBrowserSmoke(cdp) {
  await clickButton(cdp, "Browser");
  await waitFor(cdp, () => document.body.innerText.includes("Agent browser"), "browser panel");
  const initialState = await evaluate(cdp, "window.ambientDesktop.getBrowserState()");
  if (!initialState.internalAvailable) throw new Error("Internal browser runtime should be available in Electron.");
  if (initialState.sourceProfilePath !== chromeProfile) {
    throw new Error(`Expected fixture Chrome profile source. State: ${JSON.stringify(initialState)}`);
  }
  await clickButton(cdp, "Copy profile");
  await waitFor(cdp, () => document.body.innerText.includes("Copy Chrome profile?"), "browser profile copy dialog");
  await expectText(cdp, "Cookies and login");
  await expectText(cdp, chromeProfile);
  await clickButton(cdp, "Copy Chrome profile");
  await waitFor(cdp, () => document.body.innerText.includes("Copied Chrome profile is ready."), "copied profile ready status");
  const copiedState = await evaluate(cdp, "window.ambientDesktop.getBrowserState()");
  if (!copiedState.copiedProfileAvailable || copiedState.copiedProfileSourcePath !== chromeProfile || !copiedState.copiedProfileCopiedAt) {
    throw new Error(`Expected copied profile metadata. State: ${JSON.stringify(copiedState)}`);
  }
  await expectText(cdp, "Clear it to revoke logged-in browser access");
  await clickButton(cdp, "Clear copied profile");
  await waitFor(cdp, () => document.body.innerText.includes("Copied Chrome profile cleared."), "copied profile clear status");
  const clearedState = await evaluate(cdp, "window.ambientDesktop.getBrowserState()");
  if (clearedState.copiedProfileAvailable || clearedState.copiedProfileCopiedAt) {
    throw new Error(`Expected copied profile cleanup. State: ${JSON.stringify(clearedState)}`);
  }
  const audit = await evaluate(cdp, "window.ambientDesktop.listPermissionAudit()");
  const profileAudit = audit.filter((entry) => entry.toolName === "browser_profile" && entry.risk === "browser-profile");
  if (profileAudit.length < 2 || !profileAudit.some((entry) => entry.reason.includes("copied")) || !profileAudit.some((entry) => entry.reason.includes("cleared"))) {
    throw new Error(`Expected browser profile copy/clear audit entries: ${JSON.stringify(audit)}`);
  }
  await evaluate(
    cdp,
    "window.ambientDesktop.setBrowserViewBounds({ x: 520, y: 90, width: 520, height: 320, visible: true })",
  );
  const started = await evaluate(cdp, "window.ambientDesktop.startBrowser({ profileMode: 'isolated' })");
  if (started.runtime !== "internal" || started.profileMode !== "isolated" || !started.running) {
    throw new Error(`Expected isolated browser to start internally. State: ${JSON.stringify(started)}`);
  }
  const content = await evaluate(
    cdp,
    `window.ambientDesktop.navigateBrowser({ url: ${JSON.stringify(`file://${join(workspace, "sample.html")}`)} })`,
  );
  if (!content.text.includes("E2E HTML Preview")) throw new Error(`Internal browser content was not extracted: ${content.text}`);
  const screenshot = await evaluate(cdp, "window.ambientDesktop.screenshotBrowser({ profileMode: 'isolated' })");
  if (!screenshot.path || screenshot.bytes < 100) throw new Error(`Internal browser screenshot was empty: ${JSON.stringify(screenshot)}`);
  await evaluate(cdp, "window.ambientDesktop.writeClipboardText('ambient-e2e-browser-reference')");
  const clipboardText = await evaluate(cdp, "window.ambientDesktop.readClipboardText()");
  if (clipboardText !== "ambient-e2e-browser-reference") throw new Error(`Clipboard bridge did not round-trip browser reference text: ${clipboardText}`);
  await clickButton(cdp, "Focus browser");
  await waitFor(cdp, () => Boolean(document.querySelector(".browser-focused-shell")) && document.body.innerText.includes("Restore"), "focused browser mode");
  await clickButton(cdp, "Restore");
  await waitFor(cdp, () => !document.querySelector(".browser-focused-shell"), "browser focus restore");
  await evaluate(
    cdp,
    `(() => {
      window.__ambientE2ePickResult = undefined;
      window.__ambientE2ePickError = undefined;
      window.ambientDesktop.pickBrowser({ prompt: "Select the E2E preview title", profileMode: "isolated" })
        .then((result) => { window.__ambientE2ePickResult = result; })
        .catch((error) => { window.__ambientE2ePickError = String(error?.message || error); });
      return true;
    })()`,
  );
  await waitFor(
    cdp,
    () =>
      document.body.innerText.includes("Ambient is waiting for your browser selection") &&
      document.body.innerText.includes("Select the E2E preview title"),
    "browser picker active state",
  );
  const activePickState = await evaluate(cdp, "window.ambientDesktop.getBrowserState()");
  if (!activePickState.pickerActive || activePickState.pickerPrompt !== "Select the E2E preview title") {
    throw new Error(`Expected active browser picker state. State: ${JSON.stringify(activePickState)}`);
  }
  await clickButton(cdp, "Cancel picker");
  await waitFor(cdp, () => window.__ambientE2ePickResult?.canceled === true || Boolean(window.__ambientE2ePickError), "browser picker cancellation");
  const pickResult = await evaluate(cdp, "window.__ambientE2ePickResult");
  if (!pickResult?.canceled || pickResult.prompt !== "Select the E2E preview title") {
    throw new Error(`Expected canceled picker result: ${JSON.stringify(pickResult)}`);
  }
  const pickerAudit = await evaluate(cdp, "window.ambientDesktop.listPermissionAudit()");
  if (!pickerAudit.some((entry) => entry.toolName === "browser_pick" && entry.risk === "browser-control")) {
    throw new Error(`Expected browser picker audit entry: ${JSON.stringify(pickerAudit)}`);
  }
  const stopped = await evaluate(cdp, "window.ambientDesktop.stopBrowser()");
  if (stopped.running) throw new Error(`Browser should stop cleanly. State: ${JSON.stringify(stopped)}`);
}

async function runDiffSmoke(cdp) {
  await clickButtonByTitle(cdp, "Diff");
  await assertRightPanelResize(cdp);
  await waitFor(
    cdp,
    () => {
      const badge = document.querySelector(".git-edit-badge");
      const text = badge?.textContent ?? "";
      return /\+\d+/.test(text) && /-\d+/.test(text);
    },
    "top git edit summary badge",
  );
  await waitFor(
    cdp,
    () => {
      const text = document.querySelector(".git-codex-summary-card")?.textContent ?? "";
      return text.includes("files changed") && text.includes("tracked.txt");
    },
    "Codex-style git summary card",
  );
  await waitFor(cdp, () => document.querySelector(".git-summary-file[open] .diff-output")?.textContent?.includes("tracked changed"), "expanded summary diff");
  await waitFor(
    cdp,
    () => {
      const restore = [...document.querySelectorAll("button")].find((button) => button.textContent?.includes("Restore"));
      return Boolean(restore?.disabled);
    },
    "Restore disabled without checkpoint",
  );
  await clickButton(cdp, "Review");
  await waitFor(cdp, () => document.body.innerText.includes("Modified") && document.body.innerText.includes("tracked.txt"), "modified diff");
  await waitFor(cdp, () => document.body.innerText.includes("Untracked") && document.body.innerText.includes("untracked.txt"), "untracked diff");
  await selectBranch(cdp, "e2e-alt");
  await waitFor(cdp, () => document.body.innerText.includes("Switch branches with local changes?"), "dirty branch switch confirmation");
  await clickButton(cdp, "Cancel");
  await waitFor(cdp, () => !document.body.innerText.includes("Switch branches with local changes?"), "dirty branch switch confirmation close");
  await clickButton(cdp, "Review");
  await clickButton(cdp, "Discard");
  await waitFor(
    cdp,
    () => document.body.innerText.includes("Discard file changes?") || document.body.innerText.includes("Delete untracked file?"),
    "git discard confirmation",
  );
  await clickButton(cdp, "Cancel");
  await waitFor(cdp, () => !document.body.innerText.includes("Discard file changes?") && !document.body.innerText.includes("Delete untracked file?"), "git discard confirmation close");
  await waitFor(cdp, () => document.body.innerText.includes("tracked.txt"), "discard cancel preserves file");
  await clickButton(cdp, "Discard");
  await waitFor(cdp, () => document.body.innerText.includes("Discard file changes?"), "git discard confirmation for checkpoint");
  await clickButton(cdp, "Discard changes");
  await waitFor(cdp, () => !document.querySelector(".git-review-file")?.textContent?.includes("tracked.txt"), "tracked file discarded");
  await clickButton(cdp, "Summary");
  await waitFor(
    cdp,
    () => {
      const restore = [...document.querySelectorAll("button")].find((button) => button.textContent?.includes("Restore"));
      return Boolean(restore && !restore.disabled);
    },
    "Restore enabled after checkpointed discard",
  );
  await clickEnabledButton(cdp, "Restore");
  await waitFor(cdp, () => document.body.innerText.includes("Restore latest checkpoint?"), "Restore confirmation");
  await clickGitConfirmButton(cdp, "Restore checkpoint");
  await waitFor(cdp, () => document.body.innerText.includes("tracked changed"), "Restore checkpoint restores tracked diff");
}

async function runNoRepoGitSmoke(cdp) {
  await clickButton(cdp, basename(registeredWorkspace));
  const registeredPath = JSON.stringify(registeredWorkspace);
  await waitFor(
    cdp,
    new Function(`return window.ambientDesktop.bootstrap().then((state) => state.workspace.path === ${registeredPath});`),
    "registered project selection",
  );
  await waitFor(
    cdp,
    new Function(
      `return window.ambientDesktop.getGitReview().then((review) => review.workspacePath === ${registeredPath} && review.projectRoot === ${registeredPath} && !review.isGitRepository);`,
    ),
    "registered no-repo git review",
  );
  await clickButton(cdp, "Summary");
  await clickButton(cdp, "Refresh");
  await waitFor(cdp, () => document.body.innerText.includes("Unversioned workspace"), "no-repo git summary");
  await clickButton(cdp, "Initialize repository");
  await waitFor(cdp, () => document.body.innerText.includes("Initialize Git repository?"), "initialize repository confirmation");
  await clickButton(cdp, "Cancel");
  await waitFor(cdp, () => !document.body.innerText.includes("Initialize Git repository?"), "initialize repository confirmation close");
  await clickButton(cdp, "Continue without Git");
  await waitFor(cdp, () => document.body.innerText.includes("Continuing without Git"), "continue without git state");
  await clickButton(cdp, basename(workspace));
  await expectText(cdp, basename(workspace));
}

async function runSharedWorkspaceMigrationSmoke(cdp) {
  await clickButton(cdp, basename(legacyGitWorkspace));
  const legacyPath = JSON.stringify(legacyGitWorkspace);
  await waitFor(
    cdp,
    new Function(`return window.ambientDesktop.bootstrap().then((state) => state.workspace.path === ${legacyPath});`),
    "legacy project selection",
  );
  await waitFor(
    cdp,
    new Function(
      `return window.ambientDesktop.getGitReview().then((review) => review.workspacePath === ${legacyPath} && review.projectRoot === ${legacyPath} && review.isGitRepository);`,
    ),
    "legacy git review",
  );
  await clickButton(cdp, "Summary");
  await clickButton(cdp, "Refresh");
  await waitFor(cdp, () => document.body.innerText.includes("Shared project workspace"), "shared workspace warning");
  await expectText(cdp, "Create thread worktree");
  await expectText(cdp, "Attach existing");
  await waitFor(cdp, () => document.body.innerText.includes("legacy.txt"), "legacy shared diff");
  await clickButton(cdp, "Keep shared");
  await waitFor(cdp, () => document.body.innerText.includes("This chat will keep using the shared project root for now."), "keep shared workspace state");
  await clickButton(cdp, "Create thread worktree");
  await waitFor(cdp, () => document.body.innerText.includes("Create thread worktree?"), "create thread worktree confirmation");
  await clickButton(cdp, "Create worktree");
  await waitFor(cdp, () => document.body.innerText.includes("Thread worktree:"), "thread worktree active");
  await clickButton(cdp, basename(workspace));
  await expectText(cdp, basename(workspace));
}

async function runPluginSmoke(cdp) {
  await clickButton(cdp, "Plugins");
  await waitFor(cdp, () => document.body.innerText.includes("Ambient Plugin Host"), "plugin host panel");
  await clickButton(cdp, "Installed");
  await waitFor(cdp, () => document.body.innerText.includes("Ambient Fixture"), "plugin catalog");
  await waitFor(cdp, () => document.body.innerText.includes("Trust required for code"), "plugin trust badge");
  await waitFor(cdp, () => document.body.innerText.includes("Codex workspace"), "plugin source badge");
  await clickButton(cdp, "Trust");
  await waitFor(cdp, () => document.body.innerText.includes("Trusted"), "plugin trust toggle");
  const openedFixtureDetails = await evaluate(
    cdp,
    `
    (() => {
      const row = [...document.querySelectorAll(".plugin-row")].find((item) => item.innerText.includes("Ambient Fixture"));
      const button = [...(row?.querySelectorAll("button") ?? [])].find((item) => item.textContent?.includes("Details"));
      button?.click();
      return Boolean(button);
    })()
  `,
  );
  if (!openedFixtureDetails) throw new Error("Unable to open Ambient Fixture plugin details.");
  await waitFor(cdp, () => document.body.innerText.includes("workspace-inspector"), "plugin skill discovery");
  await clickButton(cdp, "Marketplace");
  await waitFor(cdp, () => document.body.innerText.includes("Cache Fixture"), "Codex cache import candidate");
  await waitFor(cdp, () => document.body.innerText.includes("Supported"), "plugin compatibility tier");
  await waitFor(cdp, () => document.body.innerText.includes("Browser Use"), "Browser Use import candidate");
  await waitFor(cdp, () => document.body.innerText.includes("Maps browser workflows"), "Browser Use adapter label");
  await waitFor(cdp, () => document.body.innerText.includes("Computer Use"), "Computer Use import candidate");
  await waitFor(cdp, () => document.body.innerText.includes("Exercises native MCP compatibility labels"), "Computer Use support label");
  await waitFor(cdp, () => document.body.innerText.includes("Remote Helper"), "remote Codex marketplace candidate");
  await waitFor(cdp, () => document.body.innerText.includes("Remote marketplace"), "remote Codex marketplace label");
  await clickPluginCandidateAction(cdp, "Remote Helper", "Register");
  await waitFor(
    cdp,
    () =>
      window.ambientDesktop.discoverCodexPlugins().then(
        (catalog) =>
          catalog.plugins.some((plugin) => plugin.name === "remote-helper" && plugin.sourceKind === "remote-marketplace") &&
          catalog.importCandidates.some((plugin) => plugin.name === "remote-helper" && plugin.imported),
      ),
    "registered remote plugin catalog state",
  );
  await waitFor(cdp, () => document.body.innerText.includes("Registered"), "remote plugin marked registered");
  await clickButton(cdp, "Sources");
  await waitFor(cdp, () => document.body.innerText.includes("Configured remote marketplace"), "plugin sources before Pi package inspection");
  await clickButton(cdp, "Inspect Pi packages");
  await waitFor(cdp, () => document.body.innerText.includes("Pi Packages"), "Pi package section");
  await waitFor(cdp, () => document.body.innerText.includes("ambient-e2e-pi-package"), "workspace Pi package metadata");
  await waitFor(cdp, () => document.body.innerText.includes("Extensions are executable"), "Pi extension safety label");
  await waitFor(cdp, () => document.body.innerText.includes("pi-mcp-adapter"), "Pi gallery package metadata");
  await waitFor(cdp, () => document.body.innerText.includes("Pi packages are execution-disabled"), "Pi package install disabled label");
  await fillInput(cdp, ".pi-package-install-row input", privilegedPiFixture);
  await clickButton(cdp, "Scan privileged");
  await waitFor(cdp, () => document.body.innerText.includes("Privileged Scan: ambient-e2e-privileged-pi"), "privileged fixture scan result");
  await waitFor(cdp, () => document.body.innerText.includes("Privileged review required"), "privileged fixture risk label");
  await waitFor(cdp, () => document.body.innerText.includes("Install disabled keeps this package inactive"), "privileged fixture inactive caveat");
  await waitFor(
    cdp,
    () => document.body.innerText.includes("MCP config detected") && document.body.innerText.includes("command surface"),
    "privileged fixture resource labels",
  );
  await waitFor(
    cdp,
    () => [...document.querySelectorAll(".pi-package-install-row button")].some((button) => button.textContent?.includes("Install disabled") && !button.disabled),
    "privileged fixture install disabled button",
  );
  await clickButton(cdp, "Install disabled");
  await waitFor(
    cdp,
    () =>
      document.body.innerText.includes('Install privileged Pi package "ambient-e2e-privileged-pi" as disabled?') ||
      window.ambientDesktop.inspectPiPrivilegedPackages().then((catalog) =>
        catalog.packages.some((pkg) => pkg.packageName === "ambient-e2e-privileged-pi" && pkg.status === "disabled"),
      ),
    "privileged fixture install permission or installed state",
    30_000,
  );
  const privilegedInstallNeedsApproval = await evaluate(
    cdp,
    `document.body.innerText.includes('Install privileged Pi package "ambient-e2e-privileged-pi" as disabled?')`,
  );
  if (privilegedInstallNeedsApproval) await clickButton(cdp, "Trust and allow once");
  await waitFor(cdp, () => document.body.innerText.includes("Privileged Pi Installs"), "privileged fixture installs section", 30_000);
  await waitFor(
    cdp,
    () => document.body.innerText.includes("ambient-e2e-privileged-pi") && document.body.innerText.includes("Disabled"),
    "privileged fixture disabled install",
    30_000,
  );
  await waitFor(cdp, () => document.body.innerText.includes("Alpha install is inactive"), "privileged fixture disabled caveat");
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
            pkg.scan.riskSummary.processExecution,
        ),
      ),
    "privileged fixture catalog installed state",
    30_000,
  );
  const clickedPrivilegedUninstall = await evaluate(
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
  if (!clickedPrivilegedUninstall) throw new Error("Unable to click ambient-e2e-privileged-pi privileged uninstall button.");
  await waitFor(cdp, () => document.body.innerText.includes("No privileged Pi installs are registered."), "privileged fixture uninstall empty state", 30_000);
  await waitFor(
    cdp,
    () => window.ambientDesktop.inspectPiPrivilegedPackages().then((catalog) => catalog.packages.length === 0),
    "privileged fixture catalog empty state",
    30_000,
  );
  await clickButton(cdp, "Marketplace");
  await waitFor(cdp, () => document.body.innerText.includes("Cache Fixture"), "Codex cache import candidate before import");
  await clickPluginCandidateAction(cdp, "Cache Fixture", "Import");
  await waitFor(
    cdp,
    () =>
      window.ambientDesktop.discoverCodexPlugins().then(
        (catalog) =>
          catalog.plugins.some((plugin) => plugin.name === "cache-fixture" && plugin.sourceKind === "workspace") &&
          catalog.importCandidates.some((plugin) => plugin.name === "cache-fixture" && plugin.imported),
      ),
    "imported plugin catalog state",
  );
  await waitFor(cdp, () => document.body.innerText.includes("Imported"), "import candidate marked imported");
  await clickButton(cdp, "Inspect MCP");
  await clickButton(cdp, "Diagnostics");
  await waitFor(cdp, () => Boolean(document.querySelector(".plugin-mcp-result")), "plugin MCP inspection result");
  const resultText = await evaluate(cdp, `document.querySelector(".plugin-mcp-result")?.innerText ?? ""`);
  if (!resultText.includes("ambient-fixture") || !resultText.includes("1 tool")) {
    throw new Error(`Plugin MCP inspection did not list the fixture server tool count. Result: ${resultText}`);
  }
}

async function runOrchestrationSmoke(cdp) {
  await clickButton(cdp, "Workflow Agents");
  await waitFor(cdp, () => document.body.innerText.includes("Workflow Agents") && Boolean(document.querySelector(".workflow-agent-tabs")), "workflow agents home panel");
  await clickWorkflowAgentView(cdp, "Local Tasks");
  await waitFor(cdp, () => document.body.innerText.includes("Add task"), "local tasks pane");
  await evaluate(cdp, `window.ambientDesktop.setOrchestrationAutoDispatchEnabled({ enabled: false }).then(() => true)`);
  await waitFor(cdp, () => document.body.innerText.includes("Auto-dispatch off"), "auto-dispatch paused for manual orchestration smoke");
  await clickWorkflowAgentView(cdp, "New Workflow");
  await waitFor(cdp, () => document.body.innerText.includes("New Workflow"), "new workflow panel");
  await waitFor(cdp, () => document.body.innerText.includes("Skip discovery and compile"), "workflow compiler controls");
  const compileDisabledWithoutRequest = await evaluate(
    cdp,
    `
    (() => {
      const button = [...document.querySelectorAll("button")].find((item) => item.textContent?.trim() === "Skip discovery and compile");
      return Boolean(button?.disabled);
    })()
  `,
  );
  if (!compileDisabledWithoutRequest) throw new Error("Workflow Agent skip-discovery compile should be disabled until request is filled.");
  await fillInput(cdp, 'textarea[placeholder="Workflow request"]', "Find weekend activities in Scottsdale Arizona");
  await waitFor(
    cdp,
    () => [...document.querySelectorAll("button")].some((button) => button.textContent?.trim() === "Skip discovery and compile" && !button.disabled),
    "workflow request enables skip-discovery compile",
  );
  await clickButtonByTitle(cdp, "Reload workflow artifacts, runs, and audit details.");
  await waitFor(
    cdp,
    () => [...document.querySelectorAll("button")].some((button) => button.textContent?.trim() === "Skip discovery and compile" && !button.disabled),
    "workflow refresh preserves request field state",
  );
  await clickEnabledButton(cdp, "Create sample");
  await waitFor(cdp, () => document.body.innerText.includes("Workflow Agent tool bridge preview"), "workflow sample artifact");
  await clickWorkflowAgentSidebarThread(cdp, "Workflow Agent tool bridge preview");
  await waitFor(cdp, () => document.querySelector(".workflow-agent-diagram-pane")?.textContent?.includes("Workflow Diagram"), "workflow graph diagram pane");
  await waitFor(cdp, () => Boolean(document.querySelector(".workflow-agent-node")), "workflow graph diagram nodes");
  await waitFor(cdp, () => document.querySelector(".workflow-connector-list")?.textContent?.includes("workspace.inventory"), "workflow connector consent list");
  await waitFor(cdp, () => document.body.innerText.includes("workspace.inventory"), "workflow connector grant");
  await waitFor(cdp, () => document.body.innerText.includes("Account Local workspace (workspace)"), "workflow connector account label");
  await waitFor(cdp, () => document.body.innerText.includes("Account status available"), "workflow connector account status");
  await waitFor(cdp, () => document.body.innerText.includes("Auth No OAuth required for the local workspace."), "workflow connector auth status");
  await waitFor(cdp, () => document.body.innerText.includes("Read workspace file inventory (workspace.files.read)"), "workflow connector scope label");
  await waitFor(cdp, () => document.body.innerText.includes("Operations List files (listFiles)"), "workflow connector operation label");
  await waitFor(cdp, () => document.body.innerText.includes("Side effects Read-only workspace metadata"), "workflow connector side effects");
  await waitFor(cdp, () => document.body.innerText.includes("Rate limit 300/min burst 30"), "workflow connector rate limit");
  await waitFor(cdp, () => document.body.innerText.includes("Sync One bounded page; no sync cursor"), "workflow connector sync policy");
  await waitFor(cdp, () => document.body.innerText.includes("Sample preview entries include path, type, size, and truncation flags; file contents are not read."), "workflow connector sample preview");
  await waitFor(cdp, () => document.body.innerText.includes("Only redacted summaries are kept in the audit trail."), "workflow connector retention policy");
  await waitFor(cdp, () => document.body.innerText.includes("Review policy: personal-data or mutation calls pause for approval."), "workflow connector review policy");
  await clickEnabledButton(cdp, "Use no retention");
  await waitFor(cdp, () => document.body.innerText.includes("Retention None"), "workflow connector retention downgrade");
  await waitFor(cdp, () => document.body.innerText.includes("No connector values are retained after the call."), "workflow connector downgraded policy");
  await waitFor(cdp, () => document.body.innerText.includes("Audit Preview"), "workflow audit preview");
  await waitFor(cdp, () => document.querySelector(".workflow-program-inspector")?.innerText.includes("export default async function"), "workflow source preview");
  await waitFor(
    cdp,
    () => {
      const modelCalls = document.querySelector(".workflow-model-call-list")?.innerText ?? "";
      return (
        modelCalls.includes("compiler.plan") &&
        modelCalls.includes("Status succeeded") &&
        modelCalls.includes("Replay workflow-sample-preview") &&
        modelCalls.includes('Input {"request":"Build a local workflow preview artifact."}') &&
        modelCalls.includes('Output {"programShape":"deterministic steps plus structured Ambient calls","confidence":0.92}')
      );
    },
    "workflow model call review list",
  );
  await waitFor(
    cdp,
    () => {
      const events = document.querySelector(".workflow-event-list")?.innerText ?? "";
      return events.includes("Events") && events.includes("workflow.compile") && events.includes("workflow.manifest") && events.includes("workflow.audit");
    },
    "workflow event review list",
  );
  const workflowSource = await evaluate(
    cdp,
    `[...document.querySelectorAll(".workflow-program-inspector pre")].map((item) => item.innerText).find((text) => text.includes("export default async function")) ?? ""`,
  );
  if (!workflowSource.includes("export default async function")) throw new Error("Workflow source preview did not expose editable source.");
  await clickEnabledButtonIn(cdp, ".workflow-program-inspector", "Edit source");
  await waitFor(cdp, () => Boolean(document.querySelector('textarea[placeholder="Workflow source"]')), "workflow source editor");
  await waitFor(cdp, () => document.querySelector(".workflow-source-diff-preview")?.innerText.includes("No source changes"), "workflow source clean diff preview");
  const unchangedSourceSaveDisabled = await evaluate(
    cdp,
    `
    (() => {
      const root = document.querySelector(".workflow-program-inspector");
      const button = [...(root?.querySelectorAll("button") ?? [])].find((item) => item.textContent?.trim() === "Save source");
      return Boolean(button?.disabled);
    })()
  `,
  );
  if (!unchangedSourceSaveDisabled) throw new Error("Workflow source editor enabled Save source for an unchanged draft.");
  await fillInput(cdp, 'textarea[placeholder="Workflow source"]', `${workflowSource}\n// e2e unsaved source draft`);
  await waitFor(
    cdp,
    () => {
      const rawDrafts = window.localStorage.getItem("ambient.workflowSourceDrafts.v1");
      if (!rawDrafts) return false;
      try {
        return Object.values(JSON.parse(rawDrafts)).some((value) => String(value).includes("// e2e unsaved source draft"));
      } catch {
        return false;
      }
    },
    "workflow source draft stored locally",
  );
  await clickWorkflowAgentView(cdp, "Local Tasks");
  await waitFor(cdp, () => document.body.innerText.includes("Add task"), "local tasks pane after source draft");
  await clickWorkflowAgentSidebarThread(cdp, "Workflow Agent tool bridge preview");
  await waitFor(cdp, () => document.body.innerText.includes("Resume source edit"), "workflow source draft resume action");
  await clickEnabledButtonIn(cdp, ".workflow-program-inspector", "Resume source edit");
  await waitFor(cdp, () => document.querySelector('textarea[placeholder="Workflow source"]')?.value.includes("// e2e unsaved source draft"), "workflow source draft persisted");
  await clickEnabledButtonIn(cdp, ".workflow-program-inspector", "Cancel source edit");
  await waitFor(
    cdp,
    () => {
      const rawDrafts = window.localStorage.getItem("ambient.workflowSourceDrafts.v1");
      if (!rawDrafts) return true;
      try {
        return !Object.values(JSON.parse(rawDrafts)).some((value) => String(value).includes("// e2e unsaved source draft"));
      } catch {
        return false;
      }
    },
    "workflow source draft cleared from local storage",
  );
  await clickEnabledButtonIn(cdp, ".workflow-program-inspector", "Edit source");
  await waitFor(cdp, () => Boolean(document.querySelector('textarea[placeholder="Workflow source"]')), "workflow source editor after draft cancel");
  await fillInput(cdp, 'textarea[placeholder="Workflow source"]', "export default async function run() { return process.env.HOME; }");
  await waitFor(cdp, () => document.querySelector(".workflow-source-diff-preview")?.innerText.includes("Source diff +"), "workflow source dirty diff preview");
  await waitFor(cdp, () => document.querySelector(".workflow-source-diff-lines")?.innerText.includes("+ export default async function run()"), "workflow source diff line preview");
  await clickEnabledButtonIn(cdp, ".workflow-program-inspector", "Save source");
  await waitFor(
    cdp,
    () =>
      [...document.querySelectorAll(".workflow-artifact-row")].some((row) => row.innerText.includes("Rejected") && row.innerText.includes("Rejected previews cannot run")) &&
      document.querySelector(".workflow-program-inspector")?.innerText.includes("process.env.HOME"),
    "workflow invalid source edit rejected",
  );
  const invalidSourceRunEnabled = await evaluate(
    cdp,
    `
    (() => {
      const row = [...document.querySelectorAll(".workflow-artifact-row")].find((item) => item.innerText.includes("Rejected"));
      return [...(row?.querySelectorAll("button") ?? [])].some((button) => !button.disabled && ["Dry run", "Run unapproved", "Run"].includes(button.textContent?.trim() ?? ""));
    })()
  `,
  );
  if (invalidSourceRunEnabled) throw new Error("Workflow artifact exposed run controls after invalid source edit.");
  await clickEnabledButtonIn(cdp, ".workflow-program-inspector", "Edit source");
  await waitFor(cdp, () => Boolean(document.querySelector('textarea[placeholder="Workflow source"]')), "workflow source recovery editor");
  await fillInput(cdp, 'textarea[placeholder="Workflow source"]', `${workflowSource}\n// e2e source edit recovered`);
  await clickEnabledButtonIn(cdp, ".workflow-program-inspector", "Save source");
  await waitFor(
    cdp,
    () =>
      [...document.querySelectorAll(".workflow-artifact-row")].some((row) => row.innerText.includes("Ready For Preview") && row.innerText.includes("Review the generated source")) &&
      document.querySelector(".workflow-program-inspector")?.innerText.includes("// e2e source edit recovered"),
    "workflow source edit recovered",
  );
  await waitFor(
    cdp,
    () => {
      const row = document.querySelector(".workflow-artifact-row");
      return Boolean(
        row?.innerText.includes("Run unapproved") &&
          row.innerText.includes("Approve") &&
          row.innerText.includes("Reject") &&
          row.innerText.includes("Review the generated source"),
      );
    },
    "workflow artifact review gate",
  );
  const normalRunBeforeApproval = await evaluate(
    cdp,
    `
    (() => {
      const row = [...document.querySelectorAll(".workflow-artifact-row")].find((item) => item.innerText.includes("Ready For Preview"));
      return [...(row?.querySelectorAll("button") ?? [])].some((button) => button.textContent?.trim() === "Run" && !button.disabled);
    })()
  `,
  );
  if (normalRunBeforeApproval) throw new Error("Workflow artifact exposed normal Run before approval.");
  await clickEnabledButton(cdp, "Revalidate");
  await waitFor(
    cdp,
    () => [...document.querySelectorAll("button")].some((button) => button.textContent?.trim() === "Revalidate" && !button.disabled),
    "workflow artifact revalidation action settled",
  );
  await clickEnabledButton(cdp, "Remove scope workspace.files.read");
  await waitFor(
    cdp,
    () => {
      const row = [...document.querySelectorAll(".workflow-artifact-row")].find((item) => item.innerText.includes("Rejected"));
      return Boolean(row?.innerText.includes("Rejected previews cannot run unless they are edited and recompiled."));
    },
    "workflow connector scope removal rejected gate",
  );
  await clickWorkflowAgentView(cdp, "New Workflow");
  await waitFor(
    cdp,
    () => [...document.querySelectorAll("button")].some((button) => button.textContent?.trim() === "Create sample" && !button.disabled),
    "workflow connector scope removal action settled",
  );
  await clickEnabledButton(cdp, "Create sample");
  await waitFor(
    cdp,
    () => [...document.querySelectorAll(".workflow-artifact-row")].some((row) => row.innerText.includes("Ready For Preview") && row.innerText.includes("Approve") && row.innerText.includes("Reject")),
    "fresh workflow artifact review gate after scope removal",
  );
  await clickEnabledButton(cdp, "Reject connector");
  await waitFor(
    cdp,
    () => {
      const row = [...document.querySelectorAll(".workflow-artifact-row")].find((item) => item.innerText.includes("Rejected"));
      return Boolean(row?.innerText.includes("Rejected previews cannot run unless they are edited and recompiled."));
    },
    "workflow connector grant rejected gate",
  );
  await clickWorkflowAgentView(cdp, "New Workflow");
  await waitFor(
    cdp,
    () => [...document.querySelectorAll("button")].some((button) => button.textContent?.trim() === "Create sample" && !button.disabled),
    "workflow connector rejection action settled",
  );
  await clickEnabledButton(cdp, "Create sample");
  await waitFor(
    cdp,
    () => [...document.querySelectorAll(".workflow-artifact-row")].some((row) => row.innerText.includes("Ready For Preview") && row.innerText.includes("Approve") && row.innerText.includes("Reject")),
    "fresh workflow artifact review gate after connector rejection",
  );
  await clickEnabledButtonInRow(cdp, ".workflow-artifact-row", "Ready For Preview", "Reject");
  await waitFor(
    cdp,
    () => {
      const row = [...document.querySelectorAll(".workflow-artifact-row")].find((item) => item.innerText.includes("Rejected"));
      return Boolean(row?.innerText.includes("Rejected previews cannot run unless they are edited and recompiled."));
    },
    "workflow artifact rejected gate",
  );
  const rejectedRunEnabled = await evaluate(
    cdp,
    `
    (() => {
      const row = [...document.querySelectorAll(".workflow-artifact-row")].find((item) => item.innerText.includes("Rejected"));
      return [...(row?.querySelectorAll("button") ?? [])].some((button) => !button.disabled && ["Dry run", "Run unapproved", "Run"].includes(button.textContent?.trim() ?? ""));
    })()
  `,
  );
  if (rejectedRunEnabled) throw new Error("Workflow artifact exposed run controls after rejection.");
  await clickWorkflowAgentView(cdp, "New Workflow");
  await waitFor(
    cdp,
    () => [...document.querySelectorAll("button")].some((button) => button.textContent?.trim() === "Create sample" && !button.disabled),
    "workflow revision discovery action settled",
  );
  await clickEnabledButton(cdp, "Create sample");
  await waitFor(
    cdp,
    () => [...document.querySelectorAll(".workflow-artifact-row")].some((row) => row.innerText.includes("Ready For Preview") && row.innerText.includes("Approve") && row.innerText.includes("Reject")),
    "fresh workflow artifact review gate",
  );
  await clickEnabledButtonInRow(cdp, ".workflow-artifact-row", "Ready For Preview", "Run unapproved");
  await waitFor(cdp, () => document.querySelector(".workflow-audit-preview")?.innerText.includes("Run Console"), "workflow run unapproved console");
  await waitFor(cdp, () => document.querySelector(".workflow-review-list")?.innerText.includes("sample-review"), "workflow run unapproved review queue");
  await waitFor(
    cdp,
    () => {
      const row = [...document.querySelectorAll(".workflow-artifact-row")].find((item) => item.innerText.includes("Ready For Preview"));
      return Boolean(
        row?.innerText.includes("Run unapproved") &&
          row.innerText.includes("Approve") &&
          row.innerText.includes("Reject") &&
          ![...(row.querySelectorAll("button") ?? [])].some((button) => button.textContent?.trim() === "Run" && !button.disabled),
      );
    },
    "workflow run unapproved preserves review gate",
  );
  await clickEnabledButtonIn(cdp, ".workflow-review-list", "Reject");
  await waitFor(cdp, () => document.querySelector(".workflow-review-list")?.innerText.includes("Rejected"), "workflow run unapproved review reject");
  await clickEnabledButtonIn(cdp, ".workflow-audit-preview", "Close");
  await waitFor(cdp, () => !document.querySelector(".workflow-audit-preview"), "workflow run unapproved console close");
  await clickEnabledButtonInRow(cdp, ".workflow-artifact-row", "Ready For Preview", "Approve");
  await waitFor(
    cdp,
    () => {
      const row = [...document.querySelectorAll(".workflow-artifact-row")].find((item) => item.innerText.includes("Approved"));
      return Boolean(row?.innerText.includes("Approved") && [...row.querySelectorAll("button")].some((button) => button.textContent?.trim() === "Run" && !button.disabled));
    },
    "workflow artifact approved gate",
  );
  await clickEnabledButtonInRow(cdp, ".workflow-artifact-row", "Approved", "Dry run");
  await waitFor(cdp, () => document.body.innerText.includes("Run Console"), "workflow dry-run console");
  await waitFor(cdp, () => document.body.innerText.includes("dry_run"), "workflow dry-run mode event");
  await waitFor(cdp, () => document.body.innerText.includes("connector.end"), "workflow connector event");
  await waitFor(
    cdp,
    () => {
      const connectorCalls = document.querySelector(".workflow-connector-call-list")?.innerText ?? "";
      return (
        connectorCalls.includes("workspace.inventory.listFiles") &&
        connectorCalls.includes("Completed") &&
        connectorCalls.includes("Retention redacted_audit") &&
        connectorCalls.includes("Side effects none") &&
        connectorCalls.includes("Personal data no") &&
        connectorCalls.includes('Input {"maxEntries":25}') &&
        connectorCalls.includes("Output ")
      );
    },
    "workflow connector call review list",
  );
  await clickEnabledButtonInRow(cdp, ".workflow-artifact-row", "Approved", "Run");
  await waitFor(cdp, () => document.body.innerText.includes("Run Console"), "workflow run console");
  await waitFor(cdp, () => document.body.innerText.includes("Paused"), "workflow run paused for approval");
  await waitFor(cdp, () => document.querySelector(".workflow-review-list")?.innerText.includes("sample-review"), "workflow review queue");
  await waitFor(
    cdp,
    () => {
      const steps = document.querySelector(".workflow-step-list")?.innerText ?? "";
      return steps.includes("Step Timeline") && steps.includes("preview audit") && steps.includes("Paused") && steps.includes("Approval approval-");
    },
    "workflow step timeline paused state",
  );
  await clickEnabledButtonIn(cdp, ".workflow-review-list", "Approve");
  await waitFor(
    cdp,
    () => {
      const root = document.querySelector(".workflow-review-list");
      if (!root) return false;
      if (root.innerText.includes("Approved")) return true;
      const button = [...root.querySelectorAll("button")].find((item) => !item.disabled && item.textContent?.includes("Approve"));
      button?.click();
      return false;
    },
    "workflow review decision",
  );
  await clickEnabledButtonIn(cdp, ".workflow-audit-preview", "Resume");
  await waitFor(
    cdp,
    () => {
      const root = document.querySelector(".workflow-audit-preview");
      const text = root?.innerText ?? "";
      return (
        text.includes("Succeeded") &&
        [...(root?.querySelectorAll("button") ?? [])].some((button) => !button.disabled && button.textContent?.includes("Resume"))
      );
    },
    "workflow run resumed after approval",
    30_000,
  );
  await waitFor(cdp, () => document.querySelector(".workflow-checkpoint-list")?.innerText.includes("sample"), "workflow checkpoint console");
  await clickEnabledButtonIn(cdp, ".workflow-audit-preview", "Resume");
  await waitFor(cdp, () => document.querySelector(".workflow-audit-preview")?.innerText.includes("checkpoint.resume"), "workflow resume from checkpoint", 30_000);
  await clickEnabledButtonIn(cdp, ".workflow-audit-preview", "Close");
  await waitFor(cdp, () => !document.querySelector(".workflow-audit-preview"), "workflow run console close");
  await clickEnabledButtonInRow(cdp, ".workflow-artifact-row", "Approved", "Audit");
  await waitFor(cdp, () => document.querySelector(".workflow-audit-preview")?.innerText.includes("Run Console"), "workflow audit reopen after close");
  await clickWorkflowAgentView(cdp, "Local Tasks");
  const addDisabledWithoutTitle = await evaluate(
    cdp,
    `
    (() => {
      const button = [...document.querySelectorAll("button")].find((item) => item.textContent?.trim() === "Add task");
      return Boolean(button?.disabled);
    })()
  `,
  );
  if (!addDisabledWithoutTitle) throw new Error("Local Task Add task button should be disabled until Title is filled.");
  await fillInput(cdp, 'input[placeholder="Priority"]', "p12x34");
  await waitFor(cdp, () => document.querySelector('input[placeholder="Priority"]')?.value === "123", "local task priority sanitization");
  await selectAutomationField(cdp, "Trigger", "scheduled");
  await waitFor(cdp, () => document.body.innerText.includes("Next eligible 9:00 AM window"), "local task scheduled trigger preview");
  await selectAutomationField(cdp, "Schedule", "advanced");
  await waitFor(cdp, () => Boolean(document.querySelector('input[placeholder="0 9 * * *"]')), "local task advanced cron field");
  await fillInput(cdp, 'input[placeholder="0 9 * * *"]', "30 10 * * 6");
  await waitFor(cdp, () => document.body.innerText.includes("Next run follows 30 10 * * 6"), "local task custom cron preview");
  await fillInput(cdp, 'input[placeholder="Task title"]', "E2E orchestration task");
  await fillInput(cdp, 'textarea[placeholder="Description"]', "Prepare a deterministic task workspace.");
  await fillInput(cdp, 'input[placeholder="Labels"]', "client, qa, client");
  await clickButton(cdp, "Add task");
  await waitFor(cdp, () => document.body.innerText.includes("E2E orchestration task"), "created orchestration task");
  await waitFor(
    cdp,
    () => {
      const board = document.querySelector(".task-kanban-board");
      return Boolean(board?.textContent?.includes("Todo") && board.textContent.includes("Ready") && board.textContent.includes("E2E orchestration task"));
    },
    "local task kanban board",
  );
  await waitFor(
    cdp,
    () => [...document.querySelectorAll(".task-kanban-card")].some((card) => card.textContent?.includes("E2E orchestration task") && card.textContent.includes("Scheduled 30 10 * * 6")),
    "local task scheduled trigger badge",
  );
  await waitFor(
    cdp,
    () => [...document.querySelectorAll(".task-kanban-card")].some((card) => card.textContent?.includes("E2E orchestration task") && card.textContent.includes("client") && card.textContent.includes("qa")),
    "local task create labels",
  );
  await clickEnabledButtonInRow(cdp, ".task-kanban-card", "E2E orchestration task", "Remove label client");
  await waitFor(
    cdp,
    () =>
      [...document.querySelectorAll(".task-kanban-card")].some(
        (card) => card.textContent?.includes("E2E orchestration task") && !card.textContent.includes("client") && card.textContent.includes("qa"),
      ),
    "local task remove label control",
  );
  await clickEnabledButtonInRow(cdp, ".task-kanban-card", "E2E orchestration task", "Edit card");
  await waitFor(cdp, () => Boolean(document.querySelector('input[placeholder="Edit task title"]')), "local task card edit form");
  await fillInput(cdp, 'input[placeholder="Edit task title"]', "");
  const saveDisabledWithoutEditTitle = await evaluate(
    cdp,
    `
    (() => {
      const card = [...document.querySelectorAll(".task-kanban-card")].find((item) => item.querySelector('input[placeholder="Edit task title"]'));
      const button = [...(card?.querySelectorAll("button") ?? [])].find((item) => item.textContent?.trim() === "Save card");
      return Boolean(button?.disabled);
    })()
  `,
  );
  if (!saveDisabledWithoutEditTitle) throw new Error("Local Task Save card button should be disabled when the edited title is blank.");
  await fillInput(cdp, 'input[placeholder="Edit task title"]', "E2E orchestration task updated");
  await fillInput(cdp, 'textarea[placeholder="Edit task description"]', "Prepare an updated deterministic task workspace.");
  const savedEditedCard = await evaluate(
    cdp,
    `
    (() => {
      const card = [...document.querySelectorAll(".task-kanban-card")].find((item) => item.querySelector('input[placeholder="Edit task title"]'));
      const button = [...(card?.querySelectorAll("button") ?? [])].find((item) => !item.disabled && item.textContent?.trim() === "Save card");
      if (!button) return false;
      button.click();
      return true;
    })()
  `,
  );
  if (!savedEditedCard) throw new Error("Local Task Save card button should be enabled after editing title and description.");
  await waitFor(
    cdp,
    () =>
      [...document.querySelectorAll(".task-kanban-card")].some(
        (card) => card.textContent?.includes("E2E orchestration task updated") && card.textContent.includes("Prepare an updated deterministic task workspace."),
      ),
    "local task card edit save",
  );
  await fillInput(cdp, 'input[placeholder="Task title"]', "E2E blocker task");
  await fillInput(cdp, 'textarea[placeholder="Description"]', "Independent prerequisite task.");
  await clickButton(cdp, "Add task");
  await waitFor(cdp, () => document.body.innerText.includes("E2E blocker task"), "created orchestration blocker task");
  await clickEnabledButtonInRow(cdp, ".task-kanban-card", "E2E orchestration task updated", "Add blocker");
  await waitFor(
    cdp,
    () =>
      [...document.querySelectorAll(".task-kanban-card")].some(
        (card) => card.textContent?.includes("E2E orchestration task updated") && card.textContent.includes("Blocked by") && card.textContent.includes("E2E blocker task"),
      ),
    "local task blocker add control",
  );
  await clickEnabledButtonInRow(cdp, ".task-kanban-card", "E2E orchestration task updated", "Remove blocker");
  await waitFor(
    cdp,
    () =>
      [...document.querySelectorAll(".task-kanban-card")].some(
        (card) => card.textContent?.includes("E2E orchestration task updated") && !card.textContent.includes("Blocked by"),
      ),
    "local task blocker remove control",
  );
  await clickEnabledButtonInRow(cdp, ".task-kanban-card", "E2E orchestration task updated", "Priority higher");
  await waitFor(
    cdp,
    () => [...document.querySelectorAll(".task-kanban-card")].some((card) => card.textContent?.includes("E2E orchestration task updated") && card.textContent.includes("Priority 122")),
    "local task priority higher control",
  );
  await clickEnabledButtonInRow(cdp, ".task-kanban-card", "E2E orchestration task updated", "Priority lower");
  await waitFor(
    cdp,
    () => [...document.querySelectorAll(".task-kanban-card")].some((card) => card.textContent?.includes("E2E orchestration task updated") && card.textContent.includes("Priority 123")),
    "local task priority lower control",
  );
  await clickEnabledButtonInRow(cdp, ".task-kanban-card", "E2E orchestration task updated", "Move to Ready");
  await waitFor(
    cdp,
    () =>
      [...document.querySelectorAll(".task-kanban-column")].some(
        (column) => column.querySelector(".task-kanban-column-header")?.textContent?.includes("Ready") && column.textContent?.includes("E2E orchestration task updated"),
      ),
    "local task kanban move control",
  );
  await dragKanbanCardToColumn(cdp, "E2E orchestration task updated", "In Progress");
  await waitFor(
    cdp,
    () =>
      [...document.querySelectorAll(".task-kanban-column")].some(
        (column) => column.querySelector(".task-kanban-column-header")?.textContent?.includes("In Progress") && column.textContent?.includes("E2E orchestration task updated"),
      ),
    "local task kanban drag to in progress",
  );
  await dragKanbanCardToColumn(cdp, "E2E orchestration task updated", "Ready");
  await waitFor(
    cdp,
    () =>
      [...document.querySelectorAll(".task-kanban-column")].some(
        (column) => column.querySelector(".task-kanban-column-header")?.textContent?.includes("Ready") && column.textContent?.includes("E2E orchestration task updated"),
      ),
    "local task kanban drag back to ready",
  );
  await clickEnabledButton(cdp, "Prepare next");
  await waitFor(cdp, () => document.body.innerText.includes("Recent Runs"), "orchestration run dashboard");
  await waitFor(cdp, () => document.body.innerText.includes("Prepared workspace"), "orchestration timeline");
  await waitFor(cdp, () => document.body.innerText.includes("Proof of work"), "orchestration proof preview");
  await waitFor(cdp, () => document.body.innerText.includes("Reveal workspace"), "orchestration workspace navigation");
  await clickWorkflowAgentView(cdp, "Schedules");
  await waitFor(cdp, () => document.body.innerText.includes("Cron-like schedules are represented here"), "schedules pane");
  await selectAutomationField(cdp, "Target type", "workflow_artifact");
  await waitFor(cdp, () => document.body.innerText.includes("Workflow Agent tool bridge preview"), "schedule workflow target");
  await selectAutomationField(cdp, "Preset", "advanced");
  await waitFor(cdp, () => Boolean(document.querySelector('input[placeholder="0 9 * * *"]')), "schedule advanced cron field");
  await fillInput(cdp, 'input[placeholder="0 9 * * *"]', "15 8 * * 1");
  await waitFor(
    cdp,
    () => {
      const card = document.querySelector(".automation-schedule-card");
      return Boolean(card?.textContent?.includes("Cron 15 8 * * 1") && card.textContent.includes("Next run follows 15 8 * * 1"));
    },
    "schedule custom cron preview",
  );
  await clickEnabledButton(cdp, "Save schedule");
  await waitFor(
    cdp,
    () => document.body.innerText.includes("Saved Schedules") && document.body.innerText.includes("Workflow Agent tool bridge preview") && document.body.innerText.includes("Skip if active"),
    "saved durable schedule record",
  );
  await selectAutomationField(cdp, "Enabled", "paused");
  await waitFor(cdp, () => document.querySelector(".automation-schedule-card")?.textContent?.includes("Paused"), "schedule paused preview");

  await clickWorkflowAgentSidebarThread(cdp, "Workflow Agent tool bridge preview");
  await waitFor(cdp, () => document.body.innerText.includes("Workflow Agent tool bridge preview"), "workflow sample artifact before restart draft");
  await waitFor(cdp, () => document.querySelector(".workflow-program-inspector")?.innerText.includes("export default async function"), "workflow source preview before restart draft");
  await clickEnabledButtonIn(cdp, ".workflow-program-inspector", "Edit source");
  await waitFor(cdp, () => Boolean(document.querySelector('textarea[placeholder="Workflow source"]')), "workflow restart source draft editor");
  await fillInput(cdp, 'textarea[placeholder="Workflow source"]', `${workflowSource}\n// e2e restart source draft`);
  await waitFor(
    cdp,
    () => {
      const rawDrafts = window.localStorage.getItem("ambient.workflowSourceDrafts.v1");
      if (!rawDrafts) return false;
      try {
        return Object.values(JSON.parse(rawDrafts)).some((value) => String(value).includes("// e2e restart source draft"));
      } catch {
        return false;
      }
    },
    "workflow source draft stored for app restart",
  );
}

async function runResponsiveSmoke(cdp) {
  await setViewport(cdp, 880, 720);
  await delay(300);
  await assertNoHorizontalOverflow(cdp, "compact viewport");
  await waitFor(cdp, () => {
    const panel = document.querySelector(".right-panel");
    if (!panel) return true;
    return getComputedStyle(panel).display === "none";
  }, "compact panel hide");
  await setViewport(cdp, 1320, 900);
  await delay(300);
  await assertDesktopLayout(cdp);
}

async function runProjectControlsSmoke(cdp) {
  await clickButton(cdp, "Projects");
  await expectText(cdp, "Projects");
  await expectText(cdp, basename(registeredWorkspace));
  await expectText(cdp, "Registered project chat");
  await clickButton(cdp, "Add new project");
  await waitFor(cdp, () => document.body.innerText.includes("Start from scratch"), "add project popover");
  await expectText(cdp, "Use an existing folder");

  await clickButton(cdp, "Filter, sort, and organize chats");
  await waitFor(cdp, () => document.body.innerText.includes("Organize") && document.body.innerText.includes("By project"), "organize popover");
  await expectText(cdp, "Chronological list");
  await expectText(cdp, "Chats first");
  await expectText(cdp, "Sort by");
  await expectText(cdp, "Created");
  await expectText(cdp, "Updated");
  await expectText(cdp, "All chats");
  await expectText(cdp, "Relevant");

  await clickButton(cdp, "Chronological list");
  await waitFor(cdp, () => Boolean(document.querySelector(".thread-list.flat")), "flat chronological thread list");
  await assertProjectThreadTitleTooltips(cdp);
  await clickButton(cdp, "Workflow Agents");
  await waitFor(cdp, () => document.body.innerText.includes("Workflow Agents"), "workflow agents shell from project list");
  await clickWorkflowAgentView(cdp, "Home");
  await waitFor(cdp, () => document.body.innerText.includes("Workflow Agents"), "workflow agents home from project list");
  await clickButton(cdp, "Projects");
  await waitFor(
    cdp,
    () => Boolean(document.querySelector(".project-list .project-group .workspace-button") && document.querySelector(".thread-list.nested")),
    "projects nav restores grouped project folders",
  );
  await assertProjectThreadTitleTooltips(cdp);
  await clickButton(cdp, "Filter, sort, and organize chats");
  await clickButton(cdp, "Chronological list");
  await waitFor(cdp, () => Boolean(document.querySelector(".thread-list.flat")), "flat chronological thread list after return");
  await assertProjectThreadTitleTooltips(cdp);
  await clickButton(cdp, "Collapse all projects");
  await waitFor(cdp, () => !document.querySelector(".thread-list"), "collapsed projects");
  await clickButton(cdp, "Expand all projects");
  await waitFor(cdp, () => Boolean(document.querySelector(".thread-list.flat")), "expanded projects");
  await clickButton(cdp, "By project");
  await waitFor(cdp, () => Boolean(document.querySelector(".workspace-button") && document.querySelector(".thread-list.nested")), "project grouped thread list");
  await assertProjectThreadTitleTooltips(cdp);
}

async function assertDesktopLayout(cdp) {
  await assertNoHorizontalOverflow(cdp, "desktop viewport");
  const ok = await evaluate(
    cdp,
    `
    (() => {
      const mark = document.querySelector(".brand-button .ambient-mark");
      const composer = document.querySelector(".composer");
      const controls = document.querySelector(".composer-controls");
      const workspace = document.querySelector(".workspace-button");
      const thread = document.querySelector(".thread-row");
      if (!mark || !composer || !controls || !workspace || !thread) return false;
      const markRect = mark.getBoundingClientRect();
      const composerRect = composer.getBoundingClientRect();
      const controlsRect = controls.getBoundingClientRect();
      const workspaceRect = workspace.getBoundingClientRect();
      const threadRect = thread.getBoundingClientRect();
      return markRect.left >= 78
        && composerRect.left >= 0
        && composerRect.right <= window.innerWidth
        && controlsRect.width <= composerRect.width + 1
        && threadRect.left >= workspaceRect.left + 18;
    })()
  `,
  );
  if (!ok) throw new Error("Desktop layout check failed.");
  await captureScreenshot(cdp);
}

async function assertCollapsedSidebarTopbarInset(cdp) {
  const result = await evaluate(
    cdp,
    `
    (async () => {
      const shell = document.querySelector(".app-shell");
      const sidebarToggle = document.querySelector(".sidebar button[title='Toggle sidebar']");
      if (!sidebarToggle) return { ok: false, reason: "missing sidebar toggle" };
      sidebarToggle.click();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const topbar = document.querySelector(".topbar.sidebar-hidden");
      const topbarToggle = topbar?.querySelector("button[title='Toggle sidebar']");
      const heading = topbar?.querySelector(".thread-heading");
      const isMac = shell?.classList.contains("platform-macos") ?? false;
      const minLeft = isMac ? 74 : 0;
      const topbarToggleLeft = topbarToggle?.getBoundingClientRect().left ?? -1;
      const headingLeft = heading?.getBoundingClientRect().left ?? -1;
      const ok = Boolean(topbar && topbarToggle && heading) && (!isMac || (topbarToggleLeft >= minLeft && headingLeft >= minLeft));
      topbarToggle?.click();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return { ok, isMac, minLeft, topbarToggleLeft, headingLeft, sidebarRestored: Boolean(document.querySelector(".sidebar")) };
    })()
  `,
  );
  if (!result.ok || !result.sidebarRestored) throw new Error(`Collapsed sidebar topbar inset failed: ${JSON.stringify(result)}`);
}

async function assertProjectThreadTitleTooltips(cdp) {
  const result = await evaluate(
    cdp,
    `
    (() => {
      const rows = [...document.querySelectorAll(".thread-row:not(.automation-thread-row)")];
      if (rows.length === 0) return { ok: false, reason: "missing project thread rows" };
      for (const row of rows) {
        const title = row.querySelector(".thread-title")?.textContent?.trim();
        if (!title) return { ok: false, reason: "missing title text", row: row.textContent };
        if (row.getAttribute("title") !== title) {
          return { ok: false, reason: "row title mismatch", expected: title, actual: row.getAttribute("title") };
        }
        if (row.querySelector(".thread-title")?.getAttribute("title") !== title) {
          return {
            ok: false,
            reason: "thread title tooltip mismatch",
            expected: title,
            actual: row.querySelector(".thread-title")?.getAttribute("title"),
          };
        }
      }
      return { ok: true, count: rows.length };
    })()
  `,
  );
  if (!result.ok) throw new Error(`Project thread title tooltip check failed: ${JSON.stringify(result)}`);
}

async function runSyntheticStreamSmoke(cdp) {
  const state = await desktopState(cdp);
  const thread = state.threads.find((candidate) => candidate.id === state.activeThreadId);
  if (!thread) throw new Error("Active thread not found in E2E state.");

  const assistantMessage = {
    id: "e2e-assistant-stream",
    threadId: state.activeThreadId,
    role: "assistant",
    content: "",
    createdAt: new Date().toISOString(),
    metadata: { status: "streaming", runtime: "e2e" },
  };
  await emitE2eEvent(cdp, { type: "message-created", message: assistantMessage });
  await emitE2eEvent(cdp, { type: "run-status", threadId: state.activeThreadId, status: "streaming" });
  await waitFor(cdp, () => document.querySelectorAll(".cursor").length === 1, "streaming cursor");
  await waitFor(cdp, () => Boolean(document.querySelector(".thread-indicator.running")), "running thread indicator");
  await waitFor(cdp, () => document.querySelector(".run-activity-card")?.textContent?.includes("Waiting for model output."), "run activity feed");
  await waitFor(cdp, () => document.querySelector(".run-activity-metrics")?.textContent?.includes("Observed"), "run activity metrics");

  await emitE2eEvent(cdp, { type: "message-delta", messageId: assistantMessage.id, delta: "Streaming E2E response." });
  await waitFor(cdp, () => document.body.innerText.includes("Streaming E2E response."), "streaming text");
  await waitFor(cdp, () => document.querySelectorAll(".cursor").length === 0, "cursor hidden after first token");
  await emitE2eEvent(cdp, {
    type: "message-updated",
    message: {
      ...assistantMessage,
      content: "Streaming E2E response.\n\n| Section | Status |\n| --- | --- |\n| Browser | Ready |\n| Picker | Visible |",
      metadata: { ...assistantMessage.metadata, status: "done" },
    },
  });
  await waitFor(
    cdp,
    () => document.querySelector(".rich-table")?.textContent?.includes("Picker") && document.querySelector(".rich-table")?.textContent?.includes("Visible"),
    "assistant markdown table rendering",
  );
  await evaluate(
    cdp,
    `window.dispatchEvent(new KeyboardEvent("keydown", { key: "f", metaKey: true, bubbles: true }))`,
  );
  await waitFor(cdp, () => Boolean(document.querySelector('input[placeholder="Find in this chat"]')), "chat find bar");
  await fillInput(cdp, 'input[placeholder="Find in this chat"]', "Streaming");
  await waitFor(cdp, () => Boolean(document.querySelector(".chat-find-highlight.active")), "active chat find highlight");

  const thinkingMessage = {
    id: "e2e-thinking-stream",
    threadId: state.activeThreadId,
    role: "assistant",
    content: "",
    createdAt: new Date().toISOString(),
    metadata: { status: "thinking", runtime: "e2e", kind: "thinking" },
  };
  await emitE2eEvent(cdp, { type: "message-created", message: thinkingMessage });
  await waitFor(cdp, () => document.body.innerText.includes("Thinking"), "thinking role label");
  await waitFor(cdp, () => document.querySelectorAll(".message.thinking .cursor").length === 1, "thinking streaming cursor");
  await emitE2eEvent(cdp, { type: "message-delta", messageId: thinkingMessage.id, delta: "Inspecting the workspace." });
  await waitFor(cdp, () => document.body.innerText.includes("Inspecting the workspace."), "thinking stream text");
  await waitFor(cdp, () => document.querySelector(".run-activity-card")?.textContent?.includes("Inspecting the workspace."), "thinking activity line");
  await emitE2eEvent(cdp, {
    type: "message-updated",
    message: {
      ...thinkingMessage,
      content: "Inspecting the workspace.",
      metadata: { ...thinkingMessage.metadata, status: "done" },
    },
  });
  await waitFor(cdp, () => document.querySelectorAll(".message.thinking .cursor").length === 0, "thinking cursor hidden when done");

  await runSyntheticToolCardMatrix(cdp, state.activeThreadId);
  await runMediaArtifactSmoke(cdp, state.activeThreadId);
  await runVoiceToolCardSmoke(cdp, state.activeThreadId);
  await runSttToolCardSmoke(cdp, state.activeThreadId);

  await emitE2eEvent(cdp, { type: "run-status", threadId: state.activeThreadId, status: "idle" });
  const activeUpdatedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const activeLastReadAt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  await emitE2eEvent(cdp, {
    type: "thread-updated",
    thread: { ...thread, lastMessagePreview: "Awaiting user input", updatedAt: activeUpdatedAt, lastReadAt: activeLastReadAt },
  });
  await waitFor(cdp, () => !document.querySelector(".thread-row.active .thread-indicator.awaiting"), "active thread unread indicator hidden");
  await waitFor(
    cdp,
    () => /^\d+h$/.test(document.querySelector(".thread-row.active .thread-age")?.textContent ?? ""),
    "active thread age label",
  );

  const registeredThread = state.projects
    .flatMap((project) => project.threads)
    .find((candidate) => candidate.id === "registered-thread-1");
  if (!registeredThread) throw new Error("Registered E2E thread not found.");
  const inactiveUpdatedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const inactiveLastReadAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  await emitE2eEvent(cdp, {
    type: "thread-updated",
    thread: {
      ...registeredThread,
      title: "Unread E2E work",
      lastMessagePreview: "New work arrived",
      updatedAt: inactiveUpdatedAt,
      lastReadAt: inactiveLastReadAt,
    },
  });
  await waitFor(
    cdp,
    () =>
      [...document.querySelectorAll(".thread-row")].some(
        (row) =>
          row.textContent?.includes("Unread E2E work") &&
          row.querySelector(".thread-indicator.awaiting") &&
          /^\d+d$/.test(row.querySelector(".thread-age")?.textContent ?? ""),
      ),
    "inactive unread thread indicator and age",
  );
  await clickButton(cdp, "Unread E2E work");
  await waitFor(cdp, () => !document.querySelector(".thread-row.active .thread-indicator.awaiting"), "reviewed thread indicator clears");
}

async function runPromptHistorySmoke(cdp) {
  const state = await desktopState(cdp);
  const olderPrompt = "Create a compact calculator.";
  const newerPrompt = "Add keyboard shortcuts to the calculator.";
  await emitE2eEvent(cdp, {
    type: "message-created",
    message: {
      id: "e2e-user-history-older",
      threadId: state.activeThreadId,
      role: "user",
      content: olderPrompt,
      createdAt: new Date(Date.now() - 2_000).toISOString(),
    },
  });
  await emitE2eEvent(cdp, {
    type: "message-created",
    message: {
      id: "e2e-user-history-newer",
      threadId: state.activeThreadId,
      role: "user",
      content: newerPrompt,
      createdAt: new Date(Date.now() - 1_000).toISOString(),
    },
  });

  await fillInput(cdp, ".composer textarea", "");
  await pressComposerKey(cdp, "ArrowUp");
  await waitFor(cdp, () => document.querySelector(".composer textarea")?.value === "Add keyboard shortcuts to the calculator.", "latest prompt history entry");
  await pressComposerKey(cdp, "ArrowUp");
  await waitFor(cdp, () => document.querySelector(".composer textarea")?.value === "Create a compact calculator.", "older prompt history entry");
  await pressComposerKey(cdp, "ArrowDown");
  await waitFor(cdp, () => document.querySelector(".composer textarea")?.value === "Add keyboard shortcuts to the calculator.", "newer prompt history entry");
  await pressComposerKey(cdp, "ArrowDown");
  await waitFor(cdp, () => document.querySelector(".composer textarea")?.value === "", "prompt history draft restore");

  await fillInput(cdp, ".composer textarea", "manual draft");
  await pressComposerKey(cdp, "ArrowUp");
  await waitFor(cdp, () => document.querySelector(".composer textarea")?.value === "manual draft", "manual draft preserved on arrow up");
  await fillInput(cdp, ".composer textarea", "");
  await pasteComposerText(cdp, "pasted prompt text");
  await waitFor(cdp, () => document.querySelector(".composer textarea")?.value === "pasted prompt text", "composer paste");
  await fillInput(cdp, ".composer textarea", "");
}

async function runSyntheticToolCardMatrix(cdp, threadId) {
  const entries = [];
  for (const toolName of syntheticToolNames) {
    for (const status of syntheticToolStatuses) {
      const entry = syntheticToolCardEntry(threadId, toolName, status);
      entries.push(entry);
      await emitSyntheticToolCard(cdp, entry);
    }
  }

  await waitFor(cdp, () => document.querySelectorAll(".message.tool").length >= 24, "synthetic tool card matrix");
  await waitFor(cdp, () => Boolean(document.querySelector(".tool-status.running .spin")), "running tool matrix spinner");

  let cards = await toolCardSnapshots(cdp);
  for (const entry of entries) assertSyntheticToolCard(cards, entry);

  for (const entry of entries.filter((item) => item.status === "done")) {
    await expandSyntheticToolCard(cdp, entry.marker);
  }

  cards = await toolCardSnapshots(cdp);
  for (const entry of entries.filter((item) => item.status === "done")) {
    const card = findSyntheticToolCard(cards, entry);
    if (!card.open) throw new Error(`Expected completed ${entry.toolName} tool card to open after click.`);
    if (!card.text.includes("Result") || !card.text.includes(entry.marker)) {
      throw new Error(`Expanded ${entry.toolName} card did not show its result. Card: ${JSON.stringify(card)}`);
    }
  }

  await clickArtifactPreview(cdp, "notes.md");
  await waitFor(cdp, () => document.body.innerText.includes("E2E Notes"), "artifact preview content");
  await waitFor(
    cdp,
    () => getComputedStyle(document.querySelector(".tool-output")).userSelect !== "none",
    "selectable tool output",
  );

  const emptyCompletedCard = cards.find((card) => card.statusClass.includes("done") && card.text.includes("No output."));
  if (emptyCompletedCard) throw new Error(`Completed tool card rendered as empty: ${JSON.stringify(emptyCompletedCard)}`);
}

async function runMediaArtifactSmoke(cdp, threadId) {
  await emitMediaArtifactToolMessage(cdp, threadId, "pixel.png");
  await emitMediaArtifactToolMessage(cdp, threadId, "sound.wav");
  await emitMediaArtifactToolMessage(cdp, threadId, "clip.webm");
  await emitBrowserScreenshotToolMessage(cdp, threadId);

  await waitFor(cdp, () => document.querySelectorAll(".media-artifact-strip").length >= 4, "media artifact strips");
  await waitFor(cdp, () => {
    const image = document.querySelector('.inline-media-preview.image img[alt="pixel.png"]');
    return Boolean(image && image.naturalWidth > 0);
  }, "inline image artifact preview");
  await waitFor(cdp, () => {
    const image = document.querySelector('.inline-media-preview.image img[alt="browser-e2e.png"]');
    return Boolean(image && image.naturalWidth > 0);
  }, "inline browser screenshot artifact preview");
  await waitFor(cdp, () => Boolean(document.querySelector('.inline-media-preview.audio audio[src^="ambient-media://"]')), "inline audio artifact preview");
  await waitFor(cdp, () => Boolean(document.querySelector('.inline-media-preview.video video[src^="ambient-media://"]')), "inline video artifact preview");

  await clickInlineMediaPreview(cdp, "image", "pixel.png");
  await waitFor(cdp, () => {
    const image = document.querySelector('.media-modal img[alt="pixel.png"]');
    return Boolean(image && image.naturalWidth > 0);
  }, "image artifact modal preview");
  await closeMediaModal(cdp);

  await clickInlineMediaPreview(cdp, "image", "browser-e2e.png");
  await waitFor(cdp, () => {
    const image = document.querySelector('.media-modal img[alt="browser-e2e.png"]');
    return Boolean(image && image.naturalWidth > 0);
  }, "browser screenshot artifact modal preview");
  await closeMediaModal(cdp);

  await clickInlineMediaPreview(cdp, "video", "clip.webm");
  await waitFor(cdp, () => Boolean(document.querySelector('.media-modal video[src^="ambient-media://"]')), "video artifact modal preview");
  await closeMediaModal(cdp);
}

async function runVoiceToolCardSmoke(cdp, threadId) {
  await emitVoiceTestToolMessage(cdp, threadId);
  await emitVoiceCloneStatusToolMessage(cdp, threadId);

  await waitFor(
    cdp,
    () => [...document.querySelectorAll(".tool-voice-preview")].some((card) => card.textContent?.includes("Voice test")),
    "normal voice test tool card",
  );
  await waitFor(
    cdp,
    () => [...document.querySelectorAll(".tool-voice-preview.warning")].some((card) => card.textContent?.includes("Voice clone status")),
    "voice clone warning tool card",
  );

  const snapshot = await voiceToolCardSnapshots(cdp);
  const testCard = snapshot.find((card) => card.text.includes("Voice test"));
  if (!testCard) throw new Error(`Expected normal voice test card. Cards: ${JSON.stringify(snapshot)}`);
  if (testCard.warning || testCard.reconcile) {
    throw new Error(`Normal voice test card should not render reconcile warnings: ${JSON.stringify(testCard)}`);
  }
  for (const expected of ["Selected provider", "Selected voice", "Test status", "Audio", "voice-test.wav"]) {
    if (!testCard.details.includes(expected)) {
      throw new Error(`Normal voice test card missing ${expected}: ${JSON.stringify(testCard)}`);
    }
  }

  const cloneCard = snapshot.find((card) => card.text.includes("Voice clone status"));
  if (!cloneCard) throw new Error(`Expected voice clone status card. Cards: ${JSON.stringify(snapshot)}`);
  if (!cloneCard.warning || !cloneCard.reconcile) {
    throw new Error(`Voice clone status card should render reconcile warnings: ${JSON.stringify(cloneCard)}`);
  }
  for (const expected of [
    "Dynamic cache",
    "Missing cloned voice entry",
    "Missing local artifacts",
    ".ambient/voice-models/clone-1/config.json",
    "Selection blocked",
    "Do not select this voice until the warning is resolved",
  ]) {
    if (!cloneCard.reconcile.includes(expected)) {
      throw new Error(`Voice clone reconcile block missing ${expected}: ${JSON.stringify(cloneCard)}`);
    }
  }
  for (const expected of [
    "Provider id",
    "ambient-cli:local:tool:local_tts",
    "Voice id",
    "clone-1",
    "Readiness",
    "ready",
    "Ready for selection",
    "false",
    "Provider dashboard",
    "https://example.test/voices/clone-1",
    "Provider verification",
    "https://example.test/verify/clone-1",
    "Local artifacts",
    ".ambient/voice-models/clone-1/model.onnx",
  ]) {
    if (!cloneCard.details.includes(expected)) {
      throw new Error(`Voice clone details block missing ${expected}: ${JSON.stringify(cloneCard)}`);
    }
  }
  if (!cloneCard.actions.includes("Open verification") || !cloneCard.actions.includes("Open dashboard")) {
    throw new Error(`Voice clone provider action buttons missing: ${JSON.stringify(cloneCard)}`);
  }
}

async function emitVoiceTestToolMessage(cdp, threadId) {
  const audioPath = ".ambient/voice/e2e-thread/voice-test.wav";
  await emitE2eEvent(cdp, {
    type: "message-created",
    message: {
      id: "e2e-voice-test-card",
      threadId,
      role: "tool",
      content: [
        "Ambient voice test",
        "Provider: E2E Voice Provider (ambient-cli:ambient-e2e-voice-provider:tool:e2e_voice_provider)",
        "Voice: Default E2E voice (default)",
        "Test status: ready",
        `Audio: ${audioPath}`,
        "MIME type: audio/wav",
      ].join("\n"),
      createdAt: new Date().toISOString(),
      metadata: {
        toolName: "ambient_voice_test",
        status: "done",
        toolResultDetails: {
          status: "ready",
          providerCapabilityId: "ambient-cli:ambient-e2e-voice-provider:tool:e2e_voice_provider",
          voiceId: "default",
          audioPath,
          mimeType: "audio/wav",
          durationMs: 100,
          testStatus: "ready",
        },
      },
    },
  });
}

async function emitVoiceCloneStatusToolMessage(cdp, threadId) {
  await emitE2eEvent(cdp, {
    type: "message-created",
    message: {
      id: "e2e-voice-clone-status-card",
      threadId,
      role: "tool",
      content: [
        "Ambient voice clone status",
        "Provider: Local Voice Provider (ambient-cli:local:tool:local_tts)",
        "Voice: Demo clone (clone-1)",
        "Provider status: ready",
        "Readiness: ready",
        "Ready for chat selection: false",
        "Retry status later: false",
        "Dynamic cache: missing",
        "Provider dashboard: https://example.test/voices/clone-1?token=not-a-secret",
        "Provider verification: https://example.test/verify/clone-1?token=not-a-secret",
        "Local artifacts: .ambient/voice-models/clone-1/model.onnx, .ambient/voice-models/clone-1/config.json",
        "Missing local artifacts: .ambient/voice-models/clone-1/config.json",
        "Cloned: true",
      ].join("\n"),
      createdAt: new Date().toISOString(),
      metadata: {
        toolName: "ambient_voice_clone_status",
        status: "done",
        toolResultDetails: {
          status: "ready",
          providerCapabilityId: "ambient-cli:local:tool:local_tts",
          voiceId: "clone-1",
          readiness: "ready",
          readyForSelection: false,
          shouldRetryStatus: false,
          cacheStatus: "missing",
          dashboardUrl: "https://example.test/voices/clone-1",
          verificationUrl: "https://example.test/verify/clone-1",
          localArtifactPaths: [
            ".ambient/voice-models/clone-1/model.onnx",
            ".ambient/voice-models/clone-1/config.json",
          ],
          missingLocalArtifactPaths: [".ambient/voice-models/clone-1/config.json"],
        },
      },
    },
  });
}

async function voiceToolCardSnapshots(cdp) {
  return evaluate(
    cdp,
    `
    [...document.querySelectorAll(".tool-voice-preview")].map((card) => ({
      text: card.textContent ?? "",
      warning: card.classList.contains("warning"),
      reconcile: card.querySelector(".tool-voice-reconcile")?.textContent ?? "",
      details: card.querySelector(".tool-voice-details")?.textContent ?? "",
      actions: card.querySelector(".tool-voice-actions")?.textContent ?? "",
    }))
  `,
  );
}

async function runSttToolCardSmoke(cdp, threadId) {
  await emitSttTestToolMessage(cdp, threadId);

  await waitFor(
    cdp,
    () => [...document.querySelectorAll(".tool-stt-preview")].some((card) => card.textContent?.includes("Speech input test")),
    "STT test tool card",
  );

  const snapshot = await sttToolCardSnapshots(cdp);
  const testCard = snapshot.find((card) => card.text.includes("Speech input test"));
  if (!testCard) throw new Error(`Expected STT test card. Cards: ${JSON.stringify(snapshot)}`);
  for (const expected of [
    "Transcript",
    "Ambient speech recognition spike.",
    "Selected provider",
    "Qwen3-ASR Local",
    "Language",
    "English",
    "Test status",
    "ready",
    "Provider elapsed",
    "1655 ms",
    "RMS",
    "-31.3 dBFS",
  ]) {
    if (!testCard.text.includes(expected)) {
      throw new Error(`STT test card missing ${expected}: ${JSON.stringify(testCard)}`);
    }
  }
  for (const expected of [
    "Raw audio",
    ".ambient/stt/e2e-thread/stt-test.raw.wav",
    "Normalized audio",
    ".ambient/stt/e2e-thread/stt-test.wav",
    "Transcript",
    ".ambient/stt/e2e-thread/stt-test.txt",
    "JSON",
    ".ambient/stt/e2e-thread/stt-test.json",
  ]) {
    if (!testCard.artifacts.includes(expected)) {
      throw new Error(`STT test artifacts missing ${expected}: ${JSON.stringify(testCard)}`);
    }
  }
}

async function emitSttTestToolMessage(cdp, threadId) {
  const audioPath = ".ambient/stt/e2e-thread/stt-test.raw.wav";
  const normalizedAudioPath = ".ambient/stt/e2e-thread/stt-test.wav";
  const transcriptPath = ".ambient/stt/e2e-thread/stt-test.txt";
  const jsonPath = ".ambient/stt/e2e-thread/stt-test.json";
  await emitE2eEvent(cdp, {
    type: "message-created",
    message: {
      id: "e2e-stt-test-card",
      threadId,
      role: "tool",
      content: [
        "Ambient STT test succeeded",
        "Provider: Qwen3-ASR Local",
        "Status: ready",
        "Language: English",
        "Transcript: Ambient speech recognition spike.",
        "Provider elapsed: 1655 ms",
        "RMS: -31.3 dBFS",
        "No-speech threshold: -55 dBFS",
        `Normalized audio artifact: ${normalizedAudioPath}`,
        `Transcript artifact: ${transcriptPath}`,
        `JSON artifact: ${jsonPath}`,
        "Raw audio bytes were not returned to the agent.",
      ].join("\n"),
      createdAt: new Date().toISOString(),
      metadata: {
        toolName: "ambient_stt_test",
        status: "done",
        toolResultDetails: {
          status: "complete",
          testStatus: "ready",
          providerCapabilityId: "ambient-cli:ambient-qwen3-asr:tool:qwen3_asr_transcribe",
          language: "English",
          transcript: "Ambient speech recognition spike.",
          audioPath,
          normalizedAudioPath,
          transcriptPath,
          jsonPath,
          durationMs: 1655,
          noSpeechGate: { rmsDbfs: -31.25, thresholdDbfs: -55 },
        },
      },
    },
  });
}

async function sttToolCardSnapshots(cdp) {
  return evaluate(
    cdp,
    `
    [...document.querySelectorAll(".tool-stt-preview")].map((card) => ({
      text: card.textContent ?? "",
      details: card.querySelector(".tool-voice-details")?.textContent ?? "",
      artifacts: card.querySelector(".tool-stt-artifacts")?.textContent ?? "",
    }))
  `,
  );
}

async function emitMediaArtifactToolMessage(cdp, threadId, fileName) {
  await emitE2eEvent(cdp, {
    type: "message-created",
    message: {
      id: `e2e-media-artifact-${fileName.replace(/[^a-z0-9]+/gi, "-")}`,
      threadId,
      role: "tool",
      content: [
        "write completed",
        "",
        "Input",
        JSON.stringify({ path: fileName, content: "", fixture: `media-artifact-${fileName}` }, null, 2),
        "",
        "Result",
        `Successfully wrote fixture media to ${fileName}`,
      ].join("\n"),
      createdAt: new Date().toISOString(),
      metadata: { toolName: "write", status: "done" },
    },
  });
}

async function emitBrowserScreenshotToolMessage(cdp, threadId) {
  await emitE2eEvent(cdp, {
    type: "message-created",
    message: {
      id: "e2e-browser-screenshot-artifact",
      threadId,
      role: "tool",
      content: [
        "browser_screenshot completed",
        "",
        "Input",
        JSON.stringify({ profileMode: "isolated" }, null, 2),
        "",
        "Result",
        [
          "Browser screenshot captured.",
          "Title: E2E Browser Screenshot Fixture",
          "URL: file:///e2e/browser-screenshot",
          `Artifact: ${browserScreenshotFixturePath}`,
          `Path: ${join(workspace, browserScreenshotFixturePath)}`,
          "Dimensions: 1x1",
          `Bytes: ${pngFixtureBuffer().length}`,
        ].join("\n"),
      ].join("\n"),
      createdAt: new Date().toISOString(),
      metadata: {
        toolName: "browser_screenshot",
        status: "done",
        artifactPath: browserScreenshotFixturePath,
        inlinePreviewEligible: true,
        mediaArtifact: {
          artifactPath: browserScreenshotFixturePath,
          mediaKind: "image",
          mimeType: "image/png",
          bytes: pngFixtureBuffer().length,
          width: 1,
          height: 1,
          sourceUrl: "file:///e2e/browser-screenshot",
          inlinePreviewEligible: true,
          displayInstruction: "Ambient Desktop will attempt to render this browser screenshot inline in the visible chat.",
        },
      },
    },
  });
}

async function clickInlineMediaPreview(cdp, kind, fileName) {
  const clicked = await evaluate(
    cdp,
    `
    (() => {
      const selector = ${JSON.stringify(`.inline-media-preview.${kind}`)};
      const fileName = ${JSON.stringify(fileName)};
      const preview = [...document.querySelectorAll(selector)].find((candidate) => candidate.textContent?.includes(fileName) || candidate.querySelector?.(\`[alt="\${fileName}"]\`) || candidate.getAttribute("title")?.includes(fileName));
      if (!preview || typeof preview.click !== "function") return false;
      preview.click();
      return true;
    })()
  `,
  );
  if (!clicked) throw new Error(`Unable to click inline ${kind} preview for ${fileName}.`);
}

async function closeMediaModal(cdp) {
  await clickSelector(cdp, 'button[aria-label="Close media preview"]');
  await waitFor(cdp, () => !document.querySelector(".media-modal"), "media modal closed");
}

function syntheticToolCardEntry(threadId, toolName, status) {
  const marker = `${toolName.replaceAll("_", "-")}-${status}-output`;
  const statusLabel = status === "done" ? "completed" : status === "error" ? "failed" : "running";
  const inputTitle = toolName === "bash" ? "Command" : "Input";
  const input =
    toolName === "bash"
      ? `printf ${marker}`
      : toolName === "write"
        ? JSON.stringify(
            {
              path: join(workspace, "notes.md"),
              content: "# E2E Notes\n\nThis file verifies the preview pane.\n",
              fixture: marker,
            },
            null,
            2,
          )
        : JSON.stringify({ fixture: marker }, null, 2);
  const result = toolName === "write" ? `${marker}\nSuccessfully wrote 51 bytes to ${join(workspace, "notes.md")}` : marker;
  return {
    id: `e2e-tool-${toolName}-${status}`,
    threadId,
    toolName,
    status,
    statusLabel,
    marker,
    preview: toolName === "bash" ? `printf ${marker}` : "",
    content: `${toolName} ${statusLabel}\n\n${inputTitle}\n${input}\n\nResult\n${result}`,
  };
}

async function emitSyntheticToolCard(cdp, entry) {
  await emitE2eEvent(cdp, {
    type: "message-created",
    message: {
      id: entry.id,
      threadId: entry.threadId,
      role: "tool",
      content: entry.content,
      createdAt: new Date().toISOString(),
      metadata: { toolName: entry.toolName, status: entry.status },
    },
  });
}

async function toolCardSnapshots(cdp) {
  return evaluate(
    cdp,
    `
    [...document.querySelectorAll(".message.tool")].map((article) => {
      const details = article.querySelector(".tool-card");
      const status = article.querySelector(".tool-status");
      return {
        toolName: article.querySelector("summary strong")?.textContent?.trim() ?? "",
        summary: article.querySelector("summary small")?.textContent?.trim() ?? "",
        preview: article.querySelector(".tool-command-preview code")?.textContent?.trim() ?? "",
        resultPreview: article.querySelector(".tool-result-preview code")?.textContent?.trim() ?? "",
        artifactLink: article.querySelector(".artifact-link")?.textContent?.trim() ?? "",
        text: article.textContent ?? "",
        open: Boolean(details?.open),
        statusClass: status?.className ?? "",
        hasSpinner: Boolean(article.querySelector(".tool-status.running .spin")),
      };
    })
  `,
  );
}

function assertSyntheticToolCard(cards, entry) {
  const card = findSyntheticToolCard(cards, entry);
  if (!card) throw new Error(`Missing ${entry.status} ${entry.toolName} tool card.`);
  if (card.summary !== `${entry.toolName} ${entry.statusLabel}`) {
    throw new Error(`Unexpected ${entry.toolName} summary: ${JSON.stringify(card)}`);
  }
  if (!card.statusClass.includes(entry.status)) {
    throw new Error(`Unexpected ${entry.toolName} status class: ${JSON.stringify(card)}`);
  }
  if (entry.status === "running" && (!card.open || !card.hasSpinner)) {
    throw new Error(`Running ${entry.toolName} card did not render open with a spinner: ${JSON.stringify(card)}`);
  }
  if (entry.status === "error" && !card.open) {
    throw new Error(`Error ${entry.toolName} card did not render open: ${JSON.stringify(card)}`);
  }
  if (entry.status === "done" && card.open) {
    throw new Error(`Completed ${entry.toolName} card should start collapsed: ${JSON.stringify(card)}`);
  }
  if (entry.toolName === "bash" && (entry.status === "running" || entry.status === "done") && card.preview !== entry.preview) {
    throw new Error(`Bash ${entry.status} command preview was not rendered: ${JSON.stringify(card)}`);
  }
  if (entry.status !== "running" && !card.resultPreview.includes(entry.marker)) {
    throw new Error(`Collapsed ${entry.toolName} card did not render a result preview: ${JSON.stringify(card)}`);
  }
  if (entry.toolName === "write" && entry.status === "done" && !card.artifactLink.includes("Preview notes.md")) {
    throw new Error(`Completed write card did not render an artifact preview link: ${JSON.stringify(card)}`);
  }
  if (!card.text.includes("Result") || !card.text.includes(entry.marker)) {
    throw new Error(`Tool card did not preserve result output: ${JSON.stringify(card)}`);
  }
}

function findSyntheticToolCard(cards, entry) {
  return cards.find((card) => card.toolName === entry.toolName && card.text.includes(entry.marker));
}

async function expandSyntheticToolCard(cdp, marker) {
  const opened = await evaluate(
    cdp,
    `
    (() => {
      const marker = ${JSON.stringify(marker)};
      const article = [...document.querySelectorAll(".message.tool")].find((card) => card.textContent?.includes(marker));
      const details = article?.querySelector(".tool-card");
      if (!details) return false;
      if (!details.open) details.querySelector("summary")?.click();
      return details.open;
    })()
  `,
  );
  if (!opened) throw new Error(`Unable to expand tool card containing ${marker}.`);
}

async function clickArtifactPreview(cdp, fileName) {
  const clicked = await evaluate(
    cdp,
    `
    (() => {
      const fileName = ${JSON.stringify(fileName)};
      const button = [...document.querySelectorAll(".artifact-link")].find((candidate) => candidate.textContent?.includes(fileName));
      if (!button) return false;
      button.click();
      return true;
    })()
  `,
  );
  if (!clicked) throw new Error(`Unable to click artifact preview for ${fileName}.`);
}

async function runRestartSmoke(cdp) {
  await expectText(cdp, "Ambient");
  await waitFor(cdp, () => document.body.innerText.includes("Workspace scope"), "workspace mode persisted across restart");
  const state = await desktopState(cdp);
  if (state.settings.permissionMode !== "workspace") {
    throw new Error(`Expected workspace mode after restart, got ${state.settings.permissionMode}.`);
  }
  const automationShellOpen = await evaluate(cdp, `Boolean(document.querySelector(".workflow-agent-tabs"))`);
  if (!automationShellOpen) {
    await clickButton(cdp, "Workflow Agents");
    await waitFor(cdp, () => Boolean(document.querySelector(".workflow-agent-tabs")), "workflow agent tabs after app restart");
  }
  await clickWorkflowAgentSidebarThread(cdp, "Workflow Agent tool bridge preview");
  await waitFor(cdp, () => document.body.innerText.includes("Workflow Agent tool bridge preview"), "workflow sample artifact after app restart");
  await clickEnabledButtonIn(cdp, ".workflow-artifact-row", "Audit");
  await waitFor(cdp, () => document.querySelector(".workflow-program-inspector")?.innerText.includes("export default async function"), "workflow source preview after app restart");
  await waitFor(cdp, () => document.body.innerText.includes("Resume source edit"), "workflow source draft resume action after app restart");
  await clickEnabledButtonIn(cdp, ".workflow-program-inspector", "Resume source edit");
  await waitFor(cdp, () => document.querySelector('textarea[placeholder="Workflow source"]')?.value.includes("// e2e restart source draft"), "workflow source draft restored after app restart");
  await clickEnabledButtonIn(cdp, ".workflow-program-inspector", "Cancel source edit");
  await waitFor(
    cdp,
    () => {
      const rawDrafts = window.localStorage.getItem("ambient.workflowSourceDrafts.v1");
      if (!rawDrafts) return true;
      try {
        return !Object.values(JSON.parse(rawDrafts)).some((value) => String(value).includes("// e2e restart source draft"));
      } catch {
        return false;
      }
    },
    "workflow source draft restart cleanup",
  );
}

async function assertDiagnosticsExport() {
  const payload = JSON.parse(await readFile(diagnosticsPath, "utf8"));
  if (!payload.app || !payload.workspace || !payload.sqlite?.threads) {
    throw new Error("Diagnostic bundle did not include app, workspace, and thread sections.");
  }
}

async function assertOpenTargetLaunch() {
  const entries = (await readFile(openTargetLogPath, "utf8"))
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  if (!entries.some((entry) => entry.targetId === "vscode" && entry.path.endsWith("app.ts"))) {
    throw new Error("Open-with launch was not recorded for VS Code and app.ts.");
  }
}

async function desktopState(cdp) {
  return evaluate(cdp, "window.ambientDesktop.bootstrap()");
}

async function injectReadyPlannerPlanArtifact(cdp, title) {
  const state = await desktopState(cdp);
  const projectPath = state.workspace.path;
  const threadId = state.activeThreadId;
  const messageId = "e2e-toolbar-plan-message";
  const artifactId = "e2e-toolbar-plan-artifact";
  const now = new Date().toISOString();
  const sql = `
    PRAGMA busy_timeout = 5000;
    DELETE FROM planner_plan_artifacts WHERE id = ${sqlString(artifactId)};
    DELETE FROM messages WHERE id = ${sqlString(messageId)};
    INSERT INTO messages (id, thread_id, role, content, created_at, metadata_json)
    VALUES (
      ${sqlString(messageId)},
      ${sqlString(threadId)},
      'assistant',
      ${sqlString(`## ${title}\n\nPromote this ready plan from the thread toolbar.`)},
      ${sqlString(now)},
      ${sqlString(JSON.stringify({ kind: "planner-plan", plannerPlanArtifactId: artifactId }))}
    );
    INSERT INTO planner_plan_artifacts
      (id, thread_id, source_message_id, status, title, summary, content, steps_json, open_questions_json, risks_json, verification_json, created_at, updated_at)
    VALUES (
      ${sqlString(artifactId)},
      ${sqlString(threadId)},
      ${sqlString(messageId)},
      'ready',
      ${sqlString(title)},
      'Ready plan inserted by the Electron smoke test.',
      ${sqlString(`## ${title}\n\nToolbar promotion should create a draft board card.`)},
      ${sqlString(JSON.stringify([{ id: "step-1", title: "Promote a ready plan from the toolbar." }]))},
      '[]',
      '[]',
      ${sqlString(JSON.stringify(["Integration proof from toolbar promotion."]))},
      ${sqlString(now)},
      ${sqlString(now)}
    );
    UPDATE threads SET updated_at = ${sqlString(now)}, last_message_preview = ${sqlString(title)} WHERE id = ${sqlString(threadId)};
  `;
  await runCommand("sqlite3", [join(projectPath, ".ambient-codex", "state.sqlite"), sql], projectPath);
  const nextState = await desktopState(cdp);
  await emitE2eEvent(cdp, { type: "state", state: nextState });
}

async function injectProjectBoardCandidate(cdp, title) {
  const state = await desktopState(cdp);
  const activeProject = state.projects.find((project) => project.path === state.workspace.path);
  if (!activeProject?.board) throw new Error("Expected active project board before injecting candidate.");
  const now = new Date().toISOString();
  const runningTask = await createProjectBoardLinkedTask(cdp, "E2E running card", "Synthetic task backing the active project board detail panel.");
  await persistProjectBoardFixtureCards({
    boardId: activeProject.board.id,
    projectPath: activeProject.path,
    threadId: state.activeThreadId,
    title,
    runningTaskId: runningTask.id,
    now,
  });
  const nextState = await desktopState(cdp);
  await emitE2eEvent(cdp, { type: "state", state: nextState });
}

async function injectProjectBoardBatchTicketizationCandidates(cdp) {
  const state = await desktopState(cdp);
  const activeProject = state.projects.find((project) => project.path === state.workspace.path);
  if (!activeProject?.board) throw new Error("Expected active project board before injecting batch candidates.");
  const now = new Date().toISOString();
  const cards = [
    {
      id: "e2e-batch-ready-card",
      title: "E2E batch ready card",
      description: "Ready candidate used to exercise batch Local Task creation.",
      blockedBy: [],
      acceptanceCriteria: ["Create the first batch Local Task."],
      testPlan: { unit: ["Batch ticketization unit coverage exists."], integration: [], visual: [], manual: [] },
      sourceId: "manual:e2e-batch-ready-card",
    },
    {
      id: "e2e-batch-dependent-card",
      title: "E2E batch dependent card",
      description: "Ready candidate whose Local Task should wait on the first batch card.",
      blockedBy: ["e2e-batch-ready-card"],
      acceptanceCriteria: ["Create a dependent Local Task with a resolved blocker."],
      testPlan: { unit: [], integration: ["Electron smoke verifies the resolved blocker."], visual: [], manual: [] },
      sourceId: "manual:e2e-batch-dependent-card",
    },
  ];
  const values = cards
    .map(
      (card) => `(
        ${sqlString(card.id)},
        ${sqlString(activeProject.board.id)},
        ${sqlString(card.title)},
        ${sqlString(card.description)},
        'draft',
        'ready_to_create',
        2,
        'E2E',
        ${sqlString(JSON.stringify(["e2e", "batch"]))},
        ${sqlString(JSON.stringify(card.blockedBy))},
        ${sqlString(JSON.stringify(card.acceptanceCriteria))},
        ${sqlString(JSON.stringify(card.testPlan))},
        'manual',
        ${sqlString(card.sourceId)},
        NULL,
        NULL,
        NULL,
        ${sqlString(now)},
        ${sqlString(now)}
      )`,
    )
    .join(",\n");
  const sql = `
    PRAGMA busy_timeout = 5000;
    DELETE FROM project_board_cards
    WHERE id IN ('e2e-batch-ready-card', 'e2e-batch-dependent-card')
       OR (board_id = ${sqlString(activeProject.board.id)} AND source_id IN ('manual:e2e-batch-ready-card', 'manual:e2e-batch-dependent-card'));
    DELETE FROM orchestration_tasks
    WHERE source_kind = 'project_board_card' AND source_url IN ('project-board-card:e2e-batch-ready-card', 'project-board-card:e2e-batch-dependent-card');
    INSERT INTO project_board_cards
      (id, board_id, title, description, status, candidate_status, priority, phase, labels_json, blocked_by_json,
       acceptance_criteria_json, test_plan_json, source_kind, source_id, source_thread_id, source_message_id, orchestration_task_id,
       created_at, updated_at)
    VALUES ${values};
    UPDATE project_boards SET updated_at = ${sqlString(now)} WHERE id = ${sqlString(activeProject.board.id)};
  `;
  await runCommand("sqlite3", [join(activeProject.path, ".ambient-codex", "state.sqlite"), sql], activeProject.path);
  const nextState = await desktopState(cdp);
  await emitE2eEvent(cdp, { type: "state", state: nextState });
}

async function persistProjectBoardFixtureCards({ boardId, projectPath, threadId, title, runningTaskId, now }) {
  const cards = [
    {
      id: "e2e-project-board-card",
      title,
      description: "Synthetic candidate used to exercise the candidate detail editor.",
      status: "draft",
      candidateStatus: "needs_clarification",
      priority: 3,
      phase: "E2E",
      labels: ["e2e", "draft"],
      blockedBy: ["LOCAL-1"],
      acceptanceCriteria: ["Candidate detail opens.", "Edited title enables save."],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
      sourceId: "e2e-plan-artifact",
      sourceMessageId: "e2e-plan-message",
      orchestrationTaskId: null,
    },
    {
      id: "e2e-project-board-running-card",
      title: "E2E running card",
      description: "Synthetic approved card used to prove active board lanes render linked Local Task state.",
      status: "ready",
      candidateStatus: "ready_to_create",
      priority: 1,
      phase: "E2E",
      labels: ["e2e", "active"],
      blockedBy: [],
      acceptanceCriteria: ["Active card appears in the In Progress lane."],
      testPlan: {
        unit: ["Renderer columns show linked task state."],
        integration: ["Electron smoke sees the active board lane."],
        visual: ["Visual smoke captures the active board."],
        manual: [],
      },
      sourceId: "e2e-running-plan-artifact",
      sourceMessageId: "e2e-running-plan-message",
      orchestrationTaskId: runningTaskId,
    },
    {
      id: "e2e-project-board-dependent-card",
      title: "E2E dependent card",
      description: "Synthetic approved card used to prove dependency map readiness labels.",
      status: "ready",
      candidateStatus: "ready_to_create",
      priority: 2,
      phase: "E2E",
      labels: ["e2e", "dependent"],
      blockedBy: ["e2e-project-board-running-card"],
      acceptanceCriteria: ["Dependency order shows this card after the running card."],
      testPlan: {
        unit: ["Renderer dependency model explains waiting cards."],
        integration: ["Electron smoke sees execution order readiness."],
        visual: [],
        manual: [],
      },
      sourceId: "e2e-dependent-plan-artifact",
      sourceMessageId: "e2e-dependent-plan-message",
      orchestrationTaskId: null,
    },
  ];
  const values = cards
    .map(
      (card) => `(
        ${sqlString(card.id)},
        ${sqlString(boardId)},
        ${sqlString(card.title)},
        ${sqlString(card.description)},
        ${sqlString(card.status)},
        ${sqlString(card.candidateStatus)},
        ${card.priority},
        ${sqlString(card.phase)},
        ${sqlString(JSON.stringify(card.labels))},
        ${sqlString(JSON.stringify(card.blockedBy))},
        ${sqlString(JSON.stringify(card.acceptanceCriteria))},
        ${sqlString(JSON.stringify(card.testPlan))},
        'planner_plan',
        ${sqlString(card.sourceId)},
        ${sqlString(threadId)},
        ${sqlString(card.sourceMessageId)},
        ${card.orchestrationTaskId ? sqlString(card.orchestrationTaskId) : "NULL"},
        ${sqlString(now)},
        ${sqlString(now)}
      )`,
    )
    .join(",\n");
  const sql = `
    PRAGMA busy_timeout = 5000;
    DELETE FROM project_board_cards
    WHERE id IN ('e2e-project-board-card', 'e2e-project-board-running-card', 'e2e-project-board-dependent-card')
       OR (board_id = ${sqlString(boardId)} AND source_id IN ('e2e-plan-artifact', 'e2e-running-plan-artifact', 'e2e-dependent-plan-artifact'));
    INSERT INTO project_board_cards
      (id, board_id, title, description, status, candidate_status, priority, phase, labels_json, blocked_by_json,
       acceptance_criteria_json, test_plan_json, source_kind, source_id, source_thread_id, source_message_id, orchestration_task_id,
       created_at, updated_at)
    VALUES ${values};
    UPDATE project_boards SET updated_at = ${sqlString(now)} WHERE id = ${sqlString(boardId)};
  `;
  await runCommand("sqlite3", [join(projectPath, ".ambient-codex", "state.sqlite"), sql], projectPath);
}

async function deleteProjectBoardImportFixtureTasks(cdp) {
  const state = await desktopState(cdp);
  const projectPath = state.workspace.path;
  const sql = `
    PRAGMA busy_timeout = 5000;
    DELETE FROM orchestration_tasks
    WHERE title IN ('E2E unattached task', 'E2E evidence task');
  `;
  await runCommand("sqlite3", [join(projectPath, ".ambient-codex", "state.sqlite"), sql], projectPath);
}

async function createProjectBoardLinkedTask(cdp, title, description) {
  const board = await evaluate(
    cdp,
    `window.ambientDesktop.createOrchestrationTask(${JSON.stringify({
      title,
      description,
      state: "in_progress",
      priority: 1,
      labels: ["project-board", "e2e", "active"],
    })})`,
  );
  const task = board.tasks.find((candidate) => candidate.title === title);
  if (!task) throw new Error(`Expected linked task to be created for ${title}.`);
  return task;
}

async function emitE2eEvent(cdp, event) {
  await evaluate(cdp, `window.ambientDesktop.emitE2eEvent(${JSON.stringify(event)})`);
}

async function findOpenPort(startPort) {
  for (let candidate = startPort; candidate < startPort + 100; candidate += 1) {
    if (await canListenOnPort(candidate)) return candidate;
  }
  throw new Error(`Unable to find an open CDP port starting at ${startPort}.`);
}

function canListenOnPort(candidate) {
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen({ host: "127.0.0.1", port: candidate }, () => {
      server.close(() => resolve(true));
    });
  });
}

async function waitForTarget(cdpPort) {
  const deadline = Date.now() + 60_000;
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
  throw new Error("Timed out waiting for Electron CDP target.");
}

async function waitForMiniWindowTarget(title) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const targets = await listCdpTargets();
    const target = targets.find((item) => item.type === "page" && item.title === title && item.url.startsWith("data:text/html"));
    if (target) {
      await delay(500);
      const stableTargets = await listCdpTargets();
      const stable = stableTargets.find((item) => item.id === target.id && item.title === title);
      if (stable) return;
    }
    await delay(150);
  }
  throw new Error(`Timed out waiting for thread mini window target titled ${title}.`);
}

async function listCdpTargets() {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  return response.json();
}

async function waitForCdpPortClosed() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      await fetch(`http://127.0.0.1:${port}/json/list`);
    } catch {
      return;
    }
    await delay(150);
  }
  throw new Error(`Timed out waiting for CDP port ${port} to close.`);
}

async function shutdownAppInstance(instance) {
  try {
    await instance.cdp.send("Browser.close");
  } catch {
    // Fall back to process cleanup below.
  }
  try {
    instance.cdp.close();
  } catch {
    // WebSocket may already be closed after Browser.close.
  }
  await waitForProcessExit(instance.child, 5_000);
  await terminateProcessTree(instance.child);
  await terminateDebugPortProcesses();
  await waitForCdpPortClosed().catch(() => undefined);
}

function waitForProcessExit(proc, timeoutMs) {
  if (proc.exitCode !== null || proc.signalCode !== null) return Promise.resolve();
  return Promise.race([new Promise((resolve) => proc.once("exit", resolve)), delay(timeoutMs)]);
}

function connectCdp(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    let nextId = 1;
    const pending = new Map();
    const api = {
      debugContext: "",
      send(method, params = {}) {
        const id = nextId++;
        socket.send(JSON.stringify({ id, method, params }));
        return new Promise((innerResolve, innerReject) => {
          pending.set(id, { resolve: innerResolve, reject: innerReject });
          setTimeout(() => {
            if (!pending.has(id)) return;
            pending.delete(id);
            const context = api.debugContext ? ` (${api.debugContext})` : "";
            innerReject(new Error(`Timed out waiting for CDP ${method}${context}.`));
          }, 15_000);
        });
      },
      close() {
        socket.close();
      },
    };
    socket.addEventListener("open", () => {
      resolve(api);
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
  const previousContext = cdp.debugContext;
  cdp.debugContext = expression.replace(/\s+/g, " ").slice(0, 220);
  const result = await cdp
    .send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    .finally(() => {
      cdp.debugContext = previousContext;
    });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? "Runtime.evaluate failed.");
  }
  return result.result?.value;
}

async function waitFor(cdp, predicate, label, timeoutMs = 10_000) {
  const expression = `(${predicate.toString()})()`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await approveOutsideWorkspacePrompt(cdp);
    if (await evaluate(cdp, expression)) return;
    await delay(150);
  }
  const bodyTail = await evaluate(cdp, "document.body.innerText.slice(-2000)").catch(() => "");
  throw new Error(`Timed out waiting for ${label}.\n\nBody tail:\n${bodyTail}`);
}

async function approveOutsideWorkspacePrompt(cdp) {
  await evaluate(
    cdp,
    `
    (() => {
      if (!document.body.innerText.includes("Allow outside-workspace")) return false;
      const button = [...document.querySelectorAll("button")].find((item) => item.textContent?.trim() === "Allow once");
      button?.click();
      return Boolean(button);
    })()
  `,
  ).catch(() => false);
}

function selectorTextIncludesPredicate(selector, text) {
  return new Function(`return document.querySelector(${JSON.stringify(selector)})?.textContent?.includes(${JSON.stringify(text)}) === true;`);
}

async function expectText(cdp, text) {
  const found = await evaluate(cdp, `document.body.innerText.includes(${JSON.stringify(text)})`);
  if (!found) throw new Error(`Expected page text to contain: ${text}`);
}

async function assertNoHorizontalOverflow(cdp, label) {
  const result = await evaluate(
    cdp,
    `
    (() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }))()
  `,
  );
  const maxScrollWidth = Math.max(result.scrollWidth, result.bodyScrollWidth);
  if (maxScrollWidth > result.innerWidth + 1) {
    throw new Error(`${label} has horizontal overflow: ${maxScrollWidth}px > ${result.innerWidth}px.`);
  }
}

async function captureScreenshot(cdp) {
  const result = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  if (!result.data || result.data.length < 1000) throw new Error("Screenshot capture returned an empty image.");
}

async function setViewport(cdp, width, height) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
}

async function clickButton(cdp, label) {
  const clicked = await evaluate(
    cdp,
    `
    (() => {
      const needle = ${JSON.stringify(label)};
      const buttons = [...document.querySelectorAll("button")].filter(isVisibleElement);
      const button =
        buttons.find((item) => item.textContent?.includes(needle)) ??
        buttons.find((item) => item.title?.includes(needle) || item.getAttribute("aria-label")?.includes(needle));
      if (!button) return false;
      button.click();
      return true;
      function isVisibleElement(element) {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      }
    })()
  `,
  );
  if (!clicked) throw new Error(`Button not found: ${label}`);
}

async function openProjectBoardSetup(cdp) {
  const alreadyOpen = await evaluate(cdp, `Boolean(document.querySelector(".project-board-workspace"))`);
  if (alreadyOpen) return;
  await clickButton(cdp, "Project Board");
  await waitFor(cdp, () => Boolean(document.querySelector(".project-board-workspace")), "project board setup opened");
}

async function clickProjectBoardTab(cdp, label) {
  const clicked = await evaluate(
    cdp,
    `
    (() => {
      const needle = ${JSON.stringify(label)};
      const button = [...document.querySelectorAll(".project-board-tabs button")]
        .find((item) => item.textContent?.trim().startsWith(needle));
      if (!button) return false;
      button.click();
      return true;
    })()
  `,
  );
  if (!clicked) throw new Error(`Project board tab not found: ${label}`);
}

async function clickProjectBoardCard(cdp, title) {
  const clicked = await evaluate(
    cdp,
    `
    (() => {
      const title = ${JSON.stringify(title)};
      const card = [...document.querySelectorAll('.project-board-card[role="button"]')]
        .find((item) => item.textContent?.includes(title) && isVisibleElement(item));
      if (!card) return false;
      card.scrollIntoView({ block: "center", inline: "nearest" });
      card.click();
      return true;
      function isVisibleElement(element) {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      }
    })()
  `,
  );
  if (!clicked) throw new Error(`Project board card not found: ${title}`);
}

async function selectProjectBoardMapBlocker(cdp, cardTitle, optionText) {
  const selected = await evaluate(
    cdp,
    `
    (() => {
      const cardTitle = ${JSON.stringify(cardTitle)};
      const optionText = ${JSON.stringify(optionText)};
      const card = [...document.querySelectorAll(".project-board-map-card")]
        .find((item) => item.textContent?.includes(cardTitle));
      const select = card?.querySelector("select");
      if (!select) return false;
      const option = [...select.options].find((item) => item.textContent?.includes(optionText) && !item.disabled);
      if (!option) return false;
      select.value = option.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()
  `,
  );
  if (!selected) throw new Error(`Project board blocker option not found for ${cardTitle}: ${optionText}`);
}

async function selectProjectBoardSourceKind(cdp, sourceText, kind) {
  const selected = await evaluate(
    cdp,
    `
    (() => {
      const sourceText = ${JSON.stringify(sourceText)};
      const kind = ${JSON.stringify(kind)};
      const item = [...document.querySelectorAll(".project-board-source-item")]
        .find((node) => node.textContent?.includes(sourceText));
      const select = item?.querySelector("select");
      if (!select) return false;
      const option = [...select.options].find((entry) => entry.value === kind);
      if (!option) return false;
      select.value = kind;
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()
  `,
  );
  if (!selected) throw new Error(`Project board source kind selector not found for ${sourceText}: ${kind}`);
}

async function clickWorkflowAgentSidebarThread(cdp, title) {
  const clicked = await evaluate(
    cdp,
    `
    (() => {
      const needle = ${JSON.stringify(title)};
      const rows = [...document.querySelectorAll(".automation-folder-list .thread-row")].filter(isVisibleElement);
      const row = rows.find((item) => item.textContent?.includes(needle) || item.title?.includes(needle));
      if (!row) return false;
      row.click();
      return true;
      function isVisibleElement(element) {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      }
    })()
  `,
  );
  if (!clicked) throw new Error(`Workflow Agent sidebar thread not found: ${title}`);
}

async function clickWorkflowAgentView(cdp, label) {
  const clicked = await evaluate(
    cdp,
    `
    (() => {
      const needle = ${JSON.stringify(label)};
      const buttons = [...document.querySelectorAll(".workflow-agent-tabs button")].filter(isVisibleElement);
      const button = buttons.find((item) => item.textContent?.trim() === needle);
      if (!button) return false;
      button.click();
      return true;
      function isVisibleElement(element) {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      }
    })()
  `,
  );
  if (!clicked) throw new Error(`Workflow Agent view tab not found: ${label}`);
}

async function clickButtonByTitle(cdp, label) {
  const clicked = await evaluate(
    cdp,
    `
    (() => {
      const needle = ${JSON.stringify(label)};
      const button = [...document.querySelectorAll("button")]
        .find((item) => isVisibleElement(item) && (item.title?.includes(needle) || item.getAttribute("aria-label")?.includes(needle)));
      if (!button) return false;
      button.click();
      return true;
      function isVisibleElement(element) {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      }
    })()
  `,
  );
  if (!clicked) throw new Error(`Button not found by title: ${label}`);
}

async function clickFileRow(cdp, name) {
  const clicked = await evaluate(
    cdp,
    `
    (() => {
      const needle = ${JSON.stringify(name)};
      const row = [...document.querySelectorAll("button.file-row")]
        .find((item) => isVisibleElement(item) && item.textContent?.includes(needle));
      if (!row) return false;
      row.click();
      return true;
      function isVisibleElement(element) {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      }
    })()
  `,
  );
  if (!clicked) throw new Error(`File row not found: ${name}`);
}

async function clickEnabledButton(cdp, label) {
  const clicked = await evaluate(
    cdp,
    `
    (() => {
      const needle = ${JSON.stringify(label)};
      const buttons = [...document.querySelectorAll("button")].filter((item) => !item.disabled && isVisibleElement(item));
      const button =
        buttons.find((item) => item.textContent?.includes(needle)) ??
        buttons.find((item) => item.title?.includes(needle) || item.getAttribute("aria-label")?.includes(needle));
      if (!button) return false;
      button.click();
      return true;
      function isVisibleElement(element) {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      }
    })()
  `,
  );
  if (!clicked) throw new Error(`Enabled button not found: ${label}`);
}

async function clickEnabledButtonIn(cdp, selector, label) {
  const clicked = await evaluate(
    cdp,
    `
    (() => {
      const root = document.querySelector(${JSON.stringify(selector)});
      if (!root) return false;
      const needle = ${JSON.stringify(label)};
      const buttons = [...root.querySelectorAll("button")].filter((item) => !item.disabled && isVisibleElement(item));
      const button =
        buttons.find((item) => item.textContent?.includes(needle)) ??
        buttons.find((item) => item.title?.includes(needle) || item.getAttribute("aria-label")?.includes(needle));
      if (!button) return false;
      button.click();
      return true;
      function isVisibleElement(element) {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      }
    })()
  `,
  );
  if (!clicked) throw new Error(`Enabled button not found in ${selector}: ${label}`);
}

async function clickEnabledButtonInRow(cdp, selector, rowText, label) {
  const clicked = await evaluate(
    cdp,
    `
    (() => {
      const selector = ${JSON.stringify(selector)};
      const rowText = ${JSON.stringify(rowText)};
      const label = ${JSON.stringify(label)};
      const root = [...document.querySelectorAll(selector)]
        .find((item) => isVisibleElement(item) && item.innerText.includes(rowText));
      const buttons = [...(root?.querySelectorAll("button") ?? [])].filter((item) => !item.disabled && isVisibleElement(item));
      const button =
        buttons.find((item) => item.textContent?.trim() === label) ??
        buttons.find((item) => item.textContent?.includes(label) || item.title?.includes(label) || item.getAttribute("aria-label")?.includes(label));
      if (!button) return false;
      button.click();
      return true;
      function isVisibleElement(element) {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      }
    })()
  `,
  );
  if (!clicked) throw new Error(`Enabled button not found in ${selector} containing ${rowText}: ${label}`);
}

async function dragKanbanCardToColumn(cdp, cardText, columnTitle) {
  const dragged = await evaluate(
    cdp,
    `
    (() => {
      const cardText = ${JSON.stringify(cardText)};
      const columnTitle = ${JSON.stringify(columnTitle)};
      const source = [...document.querySelectorAll(".task-kanban-card")]
        .find((item) => isVisibleElement(item) && item.textContent?.includes(cardText));
      const column = [...document.querySelectorAll(".task-kanban-column")]
        .find((item) => item.querySelector(".task-kanban-column-header")?.textContent?.includes(columnTitle));
      const target = column?.querySelector(".task-kanban-column-body") ?? column;
      if (!source || !target) return false;
      const dataTransfer = new DataTransfer();
      const eventInit = { bubbles: true, cancelable: true, dataTransfer };
      source.dispatchEvent(new DragEvent("dragstart", eventInit));
      target.dispatchEvent(new DragEvent("dragenter", eventInit));
      target.dispatchEvent(new DragEvent("dragover", eventInit));
      target.dispatchEvent(new DragEvent("drop", eventInit));
      source.dispatchEvent(new DragEvent("dragend", eventInit));
      return true;
      function isVisibleElement(element) {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      }
    })()
  `,
  );
  if (!dragged) throw new Error(`Kanban drag failed: ${cardText} -> ${columnTitle}`);
}

async function clickPluginCandidateAction(cdp, pluginName, label) {
  const clicked = await evaluate(
    cdp,
    `
    (() => {
      const pluginName = ${JSON.stringify(pluginName)};
      const label = ${JSON.stringify(label)};
      const row = [...document.querySelectorAll(".plugin-import-row")]
        .find((item) => item.textContent?.includes(pluginName));
      if (!row) return false;
      const button = [...row.querySelectorAll("button")]
        .find((item) => !item.disabled && item.textContent?.trim() === label);
      if (!button) return false;
      button.click();
      return true;
    })()
  `,
  );
  if (!clicked) throw new Error(`Plugin candidate button not found: ${pluginName} / ${label}`);
}

async function clickGitConfirmButton(cdp, label) {
  const clicked = await evaluate(
    cdp,
    `
    (() => {
      const needle = ${JSON.stringify(label)};
      const button = [...document.querySelectorAll(".git-confirm-dialog button")]
        .find((item) => !item.disabled && item.textContent?.includes(needle));
      if (!button) return false;
      button.click();
      return true;
    })()
  `,
  );
  if (!clicked) throw new Error(`Git confirmation button not found: ${label}`);
}

async function clickSelector(cdp, selector) {
  const clicked = await evaluate(
    cdp,
    `
    (() => {
      const target = document.querySelector(${JSON.stringify(selector)});
      if (!target) return false;
      target.click();
      return true;
    })()
  `,
  );
  if (!clicked) throw new Error(`Selector not found: ${selector}`);
}

async function selectBranch(cdp, branch) {
  await clickButton(cdp, "Switch Git branch");
  await waitFor(cdp, () => Boolean(document.querySelector(".git-branch-menu")), "branch menu");
  const selected = await evaluate(
    cdp,
    `
    (() => {
      const branch = ${JSON.stringify(branch)};
      const button = [...document.querySelectorAll(".git-branch-menu button")]
        .find((item) => item.textContent?.trim() === branch);
      if (!button) return false;
      button.click();
      return true;
    })()
  `,
  );
  if (!selected) throw new Error(`Branch selector not found for ${branch}`);
}

async function clickNthButton(cdp, label, index) {
  const clicked = await evaluate(
    cdp,
    `
    (() => {
      const needle = ${JSON.stringify(label)};
      const buttons = [...document.querySelectorAll("button")]
        .filter((item) => item.textContent?.includes(needle) || item.title?.includes(needle) || item.getAttribute("aria-label")?.includes(needle));
      const button = buttons[${index}];
      if (!button) return false;
      button.click();
      return true;
    })()
  `,
  );
  if (!clicked) throw new Error(`Button not found: ${label} at index ${index}`);
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

async function selectAutomationField(cdp, label, value) {
  const selected = await evaluate(
    cdp,
    `
    (() => {
      const label = ${JSON.stringify(label)};
      const value = ${JSON.stringify(value)};
      const field = [...document.querySelectorAll(".automation-field")]
        .find((item) => item.querySelector("strong")?.textContent?.trim() === label);
      const select = field?.querySelector("select");
      if (!select) return false;
      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return select.value === value;
    })()
  `,
  );
  if (!selected) throw new Error(`Automation select not found: ${label}=${value}`);
}

async function pressComposerKey(cdp, key) {
  const dispatched = await evaluate(
    cdp,
    `
    (() => {
      const input = document.querySelector(".composer textarea");
      if (!input) return false;
      input.focus();
      input.selectionStart = input.value.length;
      input.selectionEnd = input.value.length;
      input.dispatchEvent(new KeyboardEvent("keydown", { key: ${JSON.stringify(key)}, bubbles: true, cancelable: true }));
      return true;
    })()
  `,
  );
  if (!dispatched) throw new Error(`Unable to dispatch composer key: ${key}`);
}

async function typeTerminal(cdp, text) {
  const focused = await evaluate(
    cdp,
    `
    (() => {
      const input = document.querySelector(".terminal-input-row input");
      if (!(input instanceof HTMLInputElement)) return false;
      input.focus();
      return true;
    })()
  `,
  );
  if (!focused) throw new Error("Unable to focus terminal input.");
  await cdp.send("Input.insertText", { text });
}

async function pressTerminalKey(cdp, key) {
  if (key === "Enter") {
    const clicked = await evaluate(
      cdp,
      `
      (() => {
        const runButton = [...document.querySelectorAll(".terminal-input-row button")]
          .find((button) => button.textContent?.trim() === "Run");
        if (!runButton) return false;
        runButton.click();
        return true;
      })()
    `,
    );
    if (!clicked) throw new Error("Unable to submit terminal input.");
    return;
  }
  const focused = await evaluate(
    cdp,
    `
    (() => {
      const output = document.querySelector(".terminal-output");
      if (!output) return false;
      output.focus();
      return true;
    })()
  `,
  );
  if (!focused) throw new Error(`Unable to focus terminal for key: ${key}`);
  if (key.length === 1) {
    await cdp.send("Input.dispatchKeyEvent", { type: "char", key, text: key, unmodifiedText: key });
    return;
  }
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key,
    code: key,
    windowsVirtualKeyCode: key === "Enter" ? 13 : key === "Backspace" ? 8 : key === "Tab" ? 9 : 0,
    nativeVirtualKeyCode: key === "Enter" ? 13 : key === "Backspace" ? 8 : key === "Tab" ? 9 : 0,
  });
}

async function pasteComposerText(cdp, text) {
  const pasted = await evaluate(
    cdp,
    `
    (() => {
      const input = document.querySelector(".composer textarea");
      if (!input) return false;
      input.focus();
      const data = new DataTransfer();
      data.setData("text/plain", ${JSON.stringify(text)});
      input.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
      return true;
    })()
  `,
  );
  if (!pasted) throw new Error("Unable to dispatch composer paste");
}

async function assertRightPanelResize(cdp) {
  const before = await evaluate(
    cdp,
    `
    (() => {
      const panel = document.querySelector(".right-panel");
      const handle = document.querySelector(".right-panel-resize-handle");
      if (!panel || !handle) return { ok: false, reason: "missing panel or handle" };
      const panelRect = panel.getBoundingClientRect();
      const handleRect = handle.getBoundingClientRect();
      return {
        ok: true,
        width: panelRect.width,
        x: handleRect.left + handleRect.width / 2,
        y: handleRect.top + Math.min(40, handleRect.height / 2),
      };
    })()
  `,
  );
  if (!before.ok) throw new Error(`Right panel resize failed: ${JSON.stringify(before)}`);
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: before.x, y: before.y });
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: before.x, y: before.y, button: "left", buttons: 1, clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: before.x - 90, y: before.y, button: "left", buttons: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: before.x - 90, y: before.y, button: "left", buttons: 0, clickCount: 1 });
  await delay(120);
  const after = await evaluate(cdp, `document.querySelector(".right-panel")?.getBoundingClientRect().width ?? 0`);
  if (after <= before.width + 40) throw new Error(`Right panel resize failed: ${JSON.stringify({ before: before.width, after })}`);
}

async function assertSidebarResize(cdp) {
  const result = await evaluate(
    cdp,
    `
    (async () => {
      const sidebar = document.querySelector(".sidebar");
      const handle = document.querySelector(".sidebar-resize-handle");
      if (!sidebar || !handle) return { ok: false, reason: "missing sidebar or handle" };
      const before = sidebar.getBoundingClientRect().width;
      const handleRect = handle.getBoundingClientRect();
      const targetX = Math.min(window.innerWidth - 260, before + 90);
      handle.dispatchEvent(new MouseEvent("mousedown", {
        clientX: handleRect.left + handleRect.width / 2,
        bubbles: true,
        cancelable: true,
      }));
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: targetX, bubbles: true, cancelable: true }));
      window.dispatchEvent(new MouseEvent("mouseup", { clientX: targetX, bubbles: true, cancelable: true }));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const after = sidebar.getBoundingClientRect().width;
      const stored = Number(window.localStorage.getItem("ambient:sidebar-width"));
      return { ok: after > before + 40 && Math.abs(after - stored) <= 1, before, after, stored };
    })()
  `,
  );
  if (!result.ok) throw new Error(`Sidebar resize failed: ${JSON.stringify(result)}`);
}

async function assertFilePaneResize(cdp) {
  const result = await evaluate(
    cdp,
    `
    (async () => {
      const tree = document.querySelector(".file-tree");
      const handle = document.querySelector(".file-pane-resize-handle");
      if (!tree || !handle) return { ok: false, reason: "missing file tree or handle" };
      const before = tree.getBoundingClientRect().width;
      const x = handle.getBoundingClientRect().left;
      handle.dispatchEvent(new MouseEvent("mousedown", { clientX: x, bubbles: true, cancelable: true }));
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: x + 80, bubbles: true, cancelable: true }));
      window.dispatchEvent(new MouseEvent("mouseup", { clientX: x + 80, bubbles: true, cancelable: true }));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const after = tree.getBoundingClientRect().width;
      return { ok: after > before + 40, before, after };
    })()
  `,
  );
  if (!result.ok) throw new Error(`File pane resize failed: ${JSON.stringify(result)}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createDocxFixture(paragraphs) {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphs.map((paragraph) => `<w:p><w:r><w:t>${escapeXml(paragraph)}</w:t></w:r></w:p>`).join("\n")}
  </w:body>
</w:document>`,
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      if (exitCode === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} failed with ${exitCode}: ${stderr}`));
    });
  });
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

async function terminateDebugPortProcesses() {
  if (process.platform === "win32") return;
  const cwdPattern = process.cwd().replace(/[.[\]{}()*+?^$|\\]/g, "\\$&");
  await runIgnoringFailure("pkill", ["-f", `remote-debugging-port=${port}`]);
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

function outputTail() {
  return `Electron output tail:\n${output.join("").split("\n").slice(-80).join("\n")}\n`;
}
