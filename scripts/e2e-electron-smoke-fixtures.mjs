import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import JSZip from "jszip";

const pixelPngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/ax8pWQAAAAASUVORK5CYII=";

export async function seedWorkspace(root, { piPackageGalleryPath, browserScreenshotFixturePath }) {
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
  await runCommand("git", ["-c", "user.name=Ambient E2E", "-c", "user.email=e2e@example.test", "commit", "-m", "seed"], root);
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

export async function seedPrivilegedPiFixture(fixtureRoot) {
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
    ["import { writeFileSync } from 'node:fs';", "writeFileSync('/tmp/ambient-e2e-privileged-postinstall.txt', 'postinstall');", ""].join(
      "\n",
    ),
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

export async function seedRegisteredProject(root) {
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

export async function seedLegacyGitProject(root) {
  await writeFile(join(root, "legacy.txt"), "legacy base\n", "utf8");
  await runCommand("git", ["init"], root);
  await runCommand("git", ["add", "legacy.txt"], root);
  await runCommand("git", ["-c", "user.name=Ambient E2E", "-c", "user.email=e2e@example.test", "commit", "-m", "legacy seed"], root);
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

export async function seedCodexPluginCache(root) {
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

export async function seedChromeProfile(root) {
  await mkdir(join(root, "Default", "Cache"), { recursive: true });
  await writeFile(join(root, "Default", "Cookies"), "ambient e2e cookie fixture", "utf8");
  await writeFile(join(root, "Default", "Cache", "ignored-cache"), "cache fixture", "utf8");
  await writeFile(join(root, "SingletonLock"), "lock fixture", "utf8");
}

async function seedCachePlugin(root, publisher, name, version, manifest) {
  const pluginRoot = join(root, publisher, name, version);
  await mkdir(join(pluginRoot, ".codex-plugin"), { recursive: true });
  await writeFile(join(pluginRoot, ".codex-plugin", "plugin.json"), JSON.stringify(manifest, null, 2), "utf8");
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

export async function seedRemoteCodexMarketplace(path) {
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

export async function seedProjectRegistry(root, paths) {
  await writeFile(join(root, "projects.json"), JSON.stringify({ version: 1, paths }, null, 2), "utf8");
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
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
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
