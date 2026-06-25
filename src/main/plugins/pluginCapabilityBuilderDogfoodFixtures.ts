import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function readDogfoodSecret(envName: string, fileName: string): Promise<string> {
  const fromEnv = process.env[envName]?.trim();
  if (fromEnv) return fromEnv;
  const fileFromEnv = process.env[`${envName}_FILE`]?.trim();
  if (fileFromEnv) {
    const fromEnvFile = (await readFile(fileFromEnv, "utf8")).trim();
    if (!fromEnvFile) throw new Error(`${envName}_FILE points to an empty file.`);
    return fromEnvFile;
  }
  const fromFile = (await readFile(join(process.cwd(), fileName), "utf8")).trim();
  if (!fromFile) throw new Error(`${fileName} is empty.`);
  return fromFile;
}
export async function writeToneWavCapability(rootPath: string): Promise<void> {
  await writeFile(
    join(rootPath, "ambient-cli.json"),
    `${JSON.stringify(
      {
        name: "ambient-tone-wav",
        version: "0.1.0",
        description: "Generate a deterministic WAV tone artifact from text input.",
        skills: "./SKILL.md",
        commands: {
          tone_wav: {
            command: "node",
            args: ["./scripts/run.mjs"],
            cwd: "package",
            description: "Generate a small WAV tone file and print its path.",
            healthCheck: ["node", "./scripts/run.mjs", "--health"],
          },
        },
        env: [],
        artifacts: {
          outputTypes: ["WAV"],
          policy: "write WAV output to the requested file path and return the path in stdout",
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    join(rootPath, "SKILL.md"),
    [
      "---",
      "name: ambient-tone-wav",
      "description: Generate a deterministic WAV tone artifact from text input.",
      "---",
      "",
      "Use `ambient_cli` with packageName `ambient-tone-wav` and command `tone_wav` when the user needs a small local WAV tone artifact.",
      "Pass two args: the source text and the output `.wav` path.",
      "Return the output path rather than dumping binary data in chat.",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    join(rootPath, "scripts", "run.mjs"),
    [
      "import { mkdirSync, writeFileSync } from 'node:fs';",
      "import { dirname, resolve } from 'node:path';",
      "",
      "if (process.argv.includes('--health')) {",
      "  process.stdout.write('ok\\n');",
      "  process.exit(0);",
      "}",
      "",
      "const [text = 'tone', outputArg = 'tone-output.wav'] = process.argv.slice(2);",
      "const outputPath = resolve(outputArg);",
      "const sampleRate = 8000;",
      "const durationSeconds = Math.max(0.12, Math.min(0.5, text.length / 80));",
      "const samples = Math.floor(sampleRate * durationSeconds);",
      "const dataSize = samples * 2;",
      "const buffer = Buffer.alloc(44 + dataSize);",
      "buffer.write('RIFF', 0);",
      "buffer.writeUInt32LE(36 + dataSize, 4);",
      "buffer.write('WAVEfmt ', 8);",
      "buffer.writeUInt32LE(16, 16);",
      "buffer.writeUInt16LE(1, 20);",
      "buffer.writeUInt16LE(1, 22);",
      "buffer.writeUInt32LE(sampleRate, 24);",
      "buffer.writeUInt32LE(sampleRate * 2, 28);",
      "buffer.writeUInt16LE(2, 32);",
      "buffer.writeUInt16LE(16, 34);",
      "buffer.write('data', 36);",
      "buffer.writeUInt32LE(dataSize, 40);",
      "const frequency = 440 + (text.length % 12) * 15;",
      "for (let i = 0; i < samples; i += 1) {",
      "  const envelope = 1 - i / samples;",
      "  const sample = Math.round(Math.sin((2 * Math.PI * frequency * i) / sampleRate) * 12000 * envelope);",
      "  buffer.writeInt16LE(sample, 44 + i * 2);",
      "}",
      "mkdirSync(dirname(outputPath), { recursive: true });",
      "writeFileSync(outputPath, buffer);",
      "process.stdout.write(`WAV artifact: ${outputPath}\\nBytes: ${buffer.length}\\n`);",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    join(rootPath, "tests", "smoke.test.mjs"),
    [
      "import { strict as assert } from 'node:assert';",
      "import { execFileSync } from 'node:child_process';",
      "import { readFileSync } from 'node:fs';",
      "",
      "const output = 'smoke-tone.wav';",
      "const stdout = execFileSync(process.execPath, ['./scripts/run.mjs', 'smoke', output], { encoding: 'utf8' });",
      "assert.match(stdout, /WAV artifact:/);",
      "assert.equal(readFileSync(output).subarray(0, 4).toString('ascii'), 'RIFF');",
      "",
    ].join("\n"),
    "utf8",
  );
}

export async function writeGeneratedBraveSearchCapability(rootPath: string): Promise<void> {
  await mkdir(join(rootPath, "scripts"), { recursive: true });
  await mkdir(join(rootPath, "tests"), { recursive: true });
  for (const file of generatedBraveSearchRepairFiles()) {
    await writeFile(join(rootPath, file.path), file.content, "utf8");
  }
}

export async function writeZayaConfigCapability(rootPath: string): Promise<void> {
  await mkdir(join(rootPath, "scripts"), { recursive: true });
  await mkdir(join(rootPath, "tests"), { recursive: true });
  await mkdir(join(rootPath, "models"), { recursive: true });
  for (const file of zayaConfigRepairFiles()) {
    await writeFile(join(rootPath, file.path), file.content, "utf8");
  }
}

export async function writeCustomTtsArtifactCapability(rootPath: string): Promise<void> {
  await mkdir(join(rootPath, "scripts"), { recursive: true });
  await mkdir(join(rootPath, "tests"), { recursive: true });
  const files = [
    {
      path: "ambient-cli.json",
      content: `${JSON.stringify(
        {
          name: "ambient-custom-tts-artifact",
          version: "0.1.0",
          description: "Generate WAV text-to-speech audio files from text.",
          skills: "./SKILL.md",
          commands: {
            custom_tts_artifact: {
              command: "node",
              args: ["./scripts/run.mjs"],
              cwd: "package",
              description: "Generate a one-off WAV file from text.",
              healthCheck: ["node", "./scripts/run.mjs", "--health"],
            },
          },
          env: [],
          artifacts: {
            outputTypes: ["WAV"],
            policy: "write WAV output to the requested path and return the artifact path in stdout",
          },
        },
        null,
        2,
      )}\n`,
    },
    {
      path: "SKILL.md",
      content: [
        "---",
        "name: ambient-custom-tts-artifact",
        "description: Generate WAV text-to-speech audio files from text.",
        "---",
        "",
        "Use this draft one-off audio artifact command only after it is repaired into the requested Ambient chat voice provider shape.",
        "",
      ].join("\n"),
    },
    {
      path: "scripts/run.mjs",
      content: [
        "if (process.argv.includes('--health')) {",
        "  process.stdout.write('ok\\n');",
        "  process.exit(0);",
        "}",
        "process.stdout.write('Draft one-off TTS artifact generator. Repair before use as a chat voice provider.\\n');",
        "",
      ].join("\n"),
    },
    {
      path: "tests/smoke.test.mjs",
      content: [
        "import { strict as assert } from 'node:assert';",
        "import { execFileSync } from 'node:child_process';",
        "",
        "const output = execFileSync(process.execPath, ['./scripts/run.mjs', '--health'], { encoding: 'utf8' });",
        "assert.equal(output, 'ok\\n');",
        "",
      ].join("\n"),
    },
    {
      path: "capability-build.json",
      content: `${JSON.stringify(
        {
          schemaVersion: "ambient-capability-builder-v1",
          name: "ambient-custom-tts-artifact",
          version: "0.1.0",
          status: "draft",
          goal: "Generate WAV text-to-speech audio files from text.",
          kind: "artifact generator",
          provider: "Custom TTS",
          refs: {},
        },
        null,
        2,
      )}\n`,
    },
  ];
  for (const file of files) {
    await writeFile(join(rootPath, file.path), file.content, "utf8");
  }
}

export function repairedBrokenTtsFiles(): Array<{ path: string; content: string; rationale: string }> {
  return [
    {
      path: "ambient-cli.json",
      rationale:
        "Repair the descriptor so the package has a name, skill path, executable command, health check, and WAV artifact declaration.",
      content: `${JSON.stringify(
        {
          name: "ambient-broken-tts",
          version: "0.1.1",
          description: "Generate repaired WAV files from text.",
          skills: "./SKILL.md",
          commands: {
            broken_tts: {
              command: "node",
              args: ["./scripts/run.mjs"],
              cwd: "package",
              description: "Generate a tiny repaired WAV file and print its path.",
              healthCheck: ["node", "./scripts/run.mjs", "--health"],
            },
          },
          env: [],
          artifacts: {
            outputTypes: ["WAV"],
            policy: "write WAV output to the requested path and return the artifact path in stdout",
          },
        },
        null,
        2,
      )}\n`,
    },
    {
      path: "SKILL.md",
      rationale: "Restore Pi guidance so the repaired command is discoverable and used through Ambient CLI.",
      content: [
        "---",
        "name: ambient-broken-tts",
        "description: Generate repaired WAV files from text.",
        "---",
        "",
        "Use `ambient_cli` with packageName `ambient-broken-tts` and command `broken_tts` when the user asks for a small repaired WAV file from text.",
        "Pass two args: the source text and the output `.wav` path.",
        "Return the output path rather than dumping binary data in chat.",
        "",
      ].join("\n"),
    },
    {
      path: "scripts/run.mjs",
      rationale: "Add a deterministic health-checkable command wrapper that writes a tiny WAV artifact.",
      content: [
        "import { mkdirSync, writeFileSync } from 'node:fs';",
        "import { dirname, resolve } from 'node:path';",
        "",
        "if (process.argv.includes('--health')) {",
        "  process.stdout.write('ok\\n');",
        "  process.exit(0);",
        "}",
        "",
        "const [text = 'repair', outputArg = 'repaired-output.wav'] = process.argv.slice(2);",
        "const outputPath = resolve(outputArg);",
        "const sampleRate = 8000;",
        "const samples = Math.max(800, Math.min(2000, text.length * 120));",
        "const dataSize = samples * 2;",
        "const buffer = Buffer.alloc(44 + dataSize);",
        "buffer.write('RIFF', 0);",
        "buffer.writeUInt32LE(36 + dataSize, 4);",
        "buffer.write('WAVEfmt ', 8);",
        "buffer.writeUInt32LE(16, 16);",
        "buffer.writeUInt16LE(1, 20);",
        "buffer.writeUInt16LE(1, 22);",
        "buffer.writeUInt32LE(sampleRate, 24);",
        "buffer.writeUInt32LE(sampleRate * 2, 28);",
        "buffer.writeUInt16LE(2, 32);",
        "buffer.writeUInt16LE(16, 34);",
        "buffer.write('data', 36);",
        "buffer.writeUInt32LE(dataSize, 40);",
        "for (let i = 0; i < samples; i += 1) {",
        "  const sample = Math.round(Math.sin((2 * Math.PI * 330 * i) / sampleRate) * 8000);",
        "  buffer.writeInt16LE(sample, 44 + i * 2);",
        "}",
        "mkdirSync(dirname(outputPath), { recursive: true });",
        "writeFileSync(outputPath, buffer);",
        "process.stdout.write(`WAV artifact: ${outputPath}\\nBytes: ${buffer.length}\\n`);",
        "",
      ].join("\n"),
    },
    {
      path: "tests/smoke.test.mjs",
      rationale: "Exercise the primary command and verify it produces a declared WAV artifact.",
      content: [
        "import { strict as assert } from 'node:assert';",
        "import { execFileSync } from 'node:child_process';",
        "import { readFileSync } from 'node:fs';",
        "",
        "const output = 'smoke-repaired.wav';",
        "const stdout = execFileSync(process.execPath, ['./scripts/run.mjs', 'smoke repair', output], { encoding: 'utf8' });",
        "assert.match(stdout, /WAV artifact:/);",
        "assert.equal(readFileSync(output).subarray(0, 4).toString('ascii'), 'RIFF');",
        "",
      ].join("\n"),
    },
  ];
}

export function customTtsProviderRepairFiles(): Array<{ path: string; content: string; rationale: string }> {
  return [
    {
      path: "ambient-cli.json",
      rationale: "Convert the descriptor from one-off audio generation to Ambient tts-provider metadata for chat voicing.",
      content: `${JSON.stringify(
        {
          name: "ambient-custom-tts-artifact",
          version: "0.1.1",
          description: "Generate WAV text-to-speech audio files from text.",
          skills: "./SKILL.md",
          commands: {
            custom_tts_artifact: {
              command: "node",
              args: ["./scripts/run.mjs"],
              cwd: "package",
              description: "Synthesize assistant voice audio with a custom local TTS provider.",
              healthCheck: ["node", "./scripts/run.mjs", "--health"],
              voiceProvider: {
                label: "Custom TTS Voice Provider",
                defaultFormat: "wav",
                formats: ["wav"],
                voices: [{ id: "default", label: "Default custom voice" }],
                local: true,
              },
            },
          },
          env: [],
          artifacts: {
            outputTypes: ["WAV"],
            policy: "write audio to the exact requested output path and return concise JSON metadata",
          },
        },
        null,
        2,
      )}\n`,
    },
    {
      path: "SKILL.md",
      rationale: "Align Pi guidance with the Ambient voice provider contract instead of a one-off file generator.",
      content: [
        "---",
        "name: ambient-custom-tts-artifact",
        "description: Generate WAV text-to-speech audio files from text.",
        "---",
        "",
        "Use this Ambient voice provider when the user wants Ambient to speak assistant replies through the custom local TTS provider.",
        "The `custom_tts_artifact` command accepts `--text`, `--output`, `--format wav`, and optional `--voice`.",
        "It writes audio to the exact requested path and returns concise JSON metadata with `audioPath`, `mimeType`, `providerId`, and `voiceId`.",
        "",
      ].join("\n"),
    },
    {
      path: "scripts/run.mjs",
      rationale: "Implement the normalized tts-provider synthesis contract with deterministic WAV output.",
      content: [
        "import { mkdirSync, writeFileSync } from 'node:fs';",
        "import { dirname, resolve } from 'node:path';",
        "",
        "const args = process.argv.slice(2);",
        "function arg(name) {",
        "  const index = args.indexOf(name);",
        "  return index >= 0 ? args[index + 1] : undefined;",
        "}",
        "function wavBytes(text) {",
        "  const sampleRate = 8000;",
        "  const samples = Math.max(800, Math.min(2400, text.length * 80));",
        "  const dataSize = samples * 2;",
        "  const buffer = Buffer.alloc(44 + dataSize);",
        "  buffer.write('RIFF', 0);",
        "  buffer.writeUInt32LE(36 + dataSize, 4);",
        "  buffer.write('WAVEfmt ', 8);",
        "  buffer.writeUInt32LE(16, 16);",
        "  buffer.writeUInt16LE(1, 20);",
        "  buffer.writeUInt16LE(1, 22);",
        "  buffer.writeUInt32LE(sampleRate, 24);",
        "  buffer.writeUInt32LE(sampleRate * 2, 28);",
        "  buffer.writeUInt16LE(2, 32);",
        "  buffer.writeUInt16LE(16, 34);",
        "  buffer.write('data', 36);",
        "  buffer.writeUInt32LE(dataSize, 40);",
        "  for (let i = 0; i < samples; i += 1) {",
        "    const sample = Math.round(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 7000);",
        "    buffer.writeInt16LE(sample, 44 + i * 2);",
        "  }",
        "  return buffer;",
        "}",
        "if (args.includes('--health')) {",
        "  process.stdout.write('ok\\n');",
        "  process.exit(0);",
        "}",
        "const text = arg('--text');",
        "const output = arg('--output');",
        "const format = arg('--format') || 'wav';",
        "const voice = arg('--voice') || 'default';",
        "if (!text) { process.stderr.write('Missing --text for Ambient tts-provider synthesis.\\n'); process.exit(2); }",
        "if (!output) { process.stderr.write('Missing --output for Ambient tts-provider synthesis.\\n'); process.exit(2); }",
        "if (format !== 'wav') { process.stderr.write(`Unsupported --format: ${format}\\n`); process.exit(2); }",
        "const audioPath = resolve(output);",
        "const audio = wavBytes(text);",
        "mkdirSync(dirname(audioPath), { recursive: true });",
        "writeFileSync(audioPath, audio);",
        "process.stdout.write(JSON.stringify({ audioPath, mimeType: 'audio/wav', durationMs: Math.round((audio.length - 44) / 16), providerId: 'custom-tts', voiceId: voice }) + '\\n');",
        "",
      ].join("\n"),
    },
    {
      path: "tests/smoke.test.mjs",
      rationale: "Exercise the primary provider command and verify it writes a WAV artifact.",
      content: [
        "import { strict as assert } from 'node:assert';",
        "import { spawnSync } from 'node:child_process';",
        "import { readFileSync, statSync } from 'node:fs';",
        "",
        "const output = 'smoke-custom-provider.wav';",
        "const result = spawnSync(process.execPath, ['./scripts/run.mjs', '--text', 'smoke repair', '--output', output, '--format', 'wav'], { encoding: 'utf8' });",
        "assert.equal(result.status, 0, result.stderr);",
        "assert.match(result.stdout, /audioPath/);",
        "assert.equal(readFileSync(output).subarray(0, 4).toString('ascii'), 'RIFF');",
        "assert.ok(statSync(output).size > 44);",
        "",
      ].join("\n"),
    },
  ];
}

export function generatedBraveSearchRepairFiles(): Array<{ path: string; content: string; rationale: string }> {
  return [
    {
      path: "ambient-cli.json",
      rationale: "Define the generated Brave Search API command with explicit env secret and network host declarations.",
      content: `${JSON.stringify(
        {
          name: "ambient-brave-api-search",
          version: "0.1.1",
          description: "Search Brave Search with an approved API key and return concise results.",
          skills: "./SKILL.md",
          env: [{ name: "BRAVE_API_KEY", description: "Brave Search API key.", required: true }],
          networkHosts: ["api.search.brave.com"],
          commands: {
            brave_search: {
              command: "node",
              args: ["./scripts/search.mjs"],
              cwd: "package",
              description: "Run a tiny Brave Search web query and print concise results.",
              healthCheck: ["node", "--check", "./scripts/search.mjs"],
            },
          },
          artifacts: { outputTypes: [], policy: "return concise text/JSON in stdout; do not expose API keys" },
        },
        null,
        2,
      )}\n`,
    },
    {
      path: "SKILL.md",
      rationale: "Guide Pi to use the generated Brave Search API command while keeping secrets out of chat.",
      content: [
        "---",
        "name: ambient-brave-api-search",
        "description: Search Brave Search with an approved API key and return concise results.",
        "---",
        "",
        "Use `ambient_cli` with packageName `ambient-brave-api-search` and command `brave_search` when the user asks for a web search through Brave Search.",
        "The package requires `BRAVE_API_KEY`; use Ambient env/secret binding flows and never ask the user to paste the secret into chat.",
        "The only declared outbound API host is `api.search.brave.com`.",
        "Pass the query text followed by optional `-n` and a result count.",
        "",
      ].join("\n"),
    },
    {
      path: "scripts/search.mjs",
      rationale: "Add a small Brave Search API wrapper that validates env binding, uses the declared API host, and prints concise results.",
      content: [
        "const args = process.argv.slice(2);",
        "let count = 2;",
        "const queryParts = [];",
        "for (let i = 0; i < args.length; i += 1) {",
        "  if (args[i] === '-n' || args[i] === '--count') {",
        "    count = Math.max(1, Math.min(5, Number(args[i + 1] || '2')));",
        "    i += 1;",
        "  } else {",
        "    queryParts.push(args[i]);",
        "  }",
        "}",
        "const query = queryParts.join(' ').trim() || 'Ambient Desktop';",
        "const key = process.env.BRAVE_API_KEY;",
        "if (!key) {",
        "  console.error('Missing BRAVE_API_KEY. Bind it through Ambient CLI env/secret flows.');",
        "  process.exit(2);",
        "}",
        "const url = new URL('https://api.search.brave.com/res/v1/web/search');",
        "url.searchParams.set('q', query);",
        "url.searchParams.set('count', String(count));",
        "const response = await fetch(url, {",
        "  headers: {",
        "    Accept: 'application/json',",
        "    'X-Subscription-Token': key,",
        "  },",
        "});",
        "const text = await response.text();",
        "if (!response.ok) {",
        "  console.error(`Brave Search failed: ${response.status} ${text.slice(0, 300)}`);",
        "  process.exit(1);",
        "}",
        "const data = JSON.parse(text);",
        "const results = (data.web?.results || []).slice(0, count);",
        "console.log(JSON.stringify({ provider: 'brave-search', host: 'api.search.brave.com', query, resultCount: results.length }));",
        "results.forEach((result, index) => {",
        "  console.log(`Result ${index + 1}: ${result.title || '(untitled)'}`);",
        "  if (result.url) console.log(`Link: ${result.url}`);",
        "});",
        "",
      ].join("\n"),
    },
    {
      path: "tests/smoke.test.mjs",
      rationale: "Exercise the real Brave Search API with a tiny query so validation proves the env-bound network path works.",
      content: [
        "import { strict as assert } from 'node:assert';",
        "import { execFileSync } from 'node:child_process';",
        "",
        "const stdout = execFileSync(process.execPath, ['./scripts/search.mjs', 'Ambient Desktop Capability Builder', '-n', '1'], { encoding: 'utf8', env: process.env });",
        "assert.match(stdout, /api.search.brave.com/);",
        "assert.match(stdout, /Result 1:/);",
        "",
      ].join("\n"),
    },
  ];
}

export function zayaConfigRepairFiles(): Array<{ path: string; content: string; rationale: string }> {
  const assetUrl = "https://huggingface.co/Zyphra/ZAYA1-8B/resolve/main/config.json";
  return [
    {
      path: "ambient-cli.json",
      rationale: "Define the generated model asset inspector with explicit Hugging Face host and cache metadata.",
      content: `${JSON.stringify(
        {
          name: "ambient-zaya-config-reader",
          version: "0.1.1",
          description: "Download and inspect a small Zyphra ZAYA1-8B model config asset.",
          skills: "./SKILL.md",
          networkHosts: ["huggingface.co"],
          modelAssets: [
            {
              name: "ZAYA1-8B config",
              url: assetUrl,
              expectedSizeBytes: 8192,
              license: "Zyphra Hugging Face model repository terms",
              cachePath: "models/zaya-config.json",
            },
          ],
          commands: {
            zaya_config: {
              command: "node",
              args: ["./scripts/zaya_config.mjs"],
              cwd: "package",
              description: "Download/cache the ZAYA1-8B config.json asset and print a selected field.",
              healthCheck: ["node", "--check", "./scripts/zaya_config.mjs"],
            },
          },
          artifacts: {
            outputTypes: ["JSON"],
            policy: "cache the declared config JSON under models/zaya-config.json and return concise selected fields",
          },
        },
        null,
        2,
      )}\n`,
    },
    {
      path: "SKILL.md",
      rationale: "Guide Pi to use the generated ZAYA model asset inspector without downloading large model weights.",
      content: [
        "---",
        "name: ambient-zaya-config-reader",
        "description: Download and inspect a small Zyphra ZAYA1-8B model config asset.",
        "---",
        "",
        "Use `ambient_cli` with packageName `ambient-zaya-config-reader` and command `zaya_config` when the user asks to inspect the declared small ZAYA1-8B config asset.",
        "This capability only downloads `config.json` from `huggingface.co`; it must not download large model weights.",
        "Pass `--field architectures.0` to return the first architecture value.",
        "The declared cache path is `models/zaya-config.json`.",
        "",
      ].join("\n"),
    },
    {
      path: "scripts/zaya_config.mjs",
      rationale: "Add a small downloader/reader for the declared Hugging Face config asset.",
      content: [
        "import { mkdir, readFile, writeFile } from 'node:fs/promises';",
        "import { dirname, resolve } from 'node:path';",
        "",
        `const ASSET_URL = ${JSON.stringify(assetUrl)};`,
        "const CACHE_PATH = resolve('models/zaya-config.json');",
        "",
        "function fieldValue(object, path) {",
        "  return path.split('.').reduce((value, key) => {",
        "    if (value == null) return undefined;",
        "    if (/^[0-9]+$/.test(key)) return value[Number(key)];",
        "    return value[key];",
        "  }, object);",
        "}",
        "",
        "async function ensureConfig() {",
        "  try {",
        "    return await readFile(CACHE_PATH, 'utf8');",
        "  } catch {",
        "    const response = await fetch(ASSET_URL);",
        "    if (!response.ok) throw new Error(`Failed to download ZAYA config: ${response.status}`);",
        "    const text = await response.text();",
        "    await mkdir(dirname(CACHE_PATH), { recursive: true });",
        "    await writeFile(CACHE_PATH, text, 'utf8');",
        "    return text;",
        "  }",
        "}",
        "",
        "const args = process.argv.slice(2);",
        "const fieldIndex = args.findIndex((arg) => arg === '--field');",
        "const field = fieldIndex >= 0 ? args[fieldIndex + 1] : 'architectures.0';",
        "const config = JSON.parse(await ensureConfig());",
        "const value = fieldValue(config, field);",
        "console.log(JSON.stringify({ asset: 'ZAYA1-8B config', host: 'huggingface.co', cachePath: 'models/zaya-config.json', field, value }));",
        "if (value !== undefined) console.log(String(value));",
        "",
      ].join("\n"),
    },
    {
      path: "tests/smoke.test.mjs",
      rationale: "Exercise the declared model asset download/cache path and verify a real field from the config.",
      content: [
        "import { strict as assert } from 'node:assert';",
        "import { execFileSync } from 'node:child_process';",
        "import { readFileSync } from 'node:fs';",
        "",
        "const stdout = execFileSync(process.execPath, ['./scripts/zaya_config.mjs', '--field', 'architectures.0'], { encoding: 'utf8' });",
        "assert.match(stdout, /ZayaForCausalLM/);",
        "const cached = JSON.parse(readFileSync('models/zaya-config.json', 'utf8'));",
        "assert.equal(cached.architectures[0], 'ZayaForCausalLM');",
        "",
      ].join("\n"),
    },
  ];
}

export async function findFirstFile(rootPath: string, fileName: string): Promise<string | undefined> {
  async function visit(directory: string): Promise<string | undefined> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isFile() && entry.name === fileName) return path;
      if (entry.isDirectory()) {
        const found = await visit(path);
        if (found) return found;
      }
    }
    return undefined;
  }

  try {
    return await visit(rootPath);
  } catch {
    return undefined;
  }
}

export async function readDogfoodFilePath(envName: string, description: string): Promise<string> {
  const filePath = process.env[envName]?.trim();
  if (!filePath) throw new Error(`Set ${envName} to ${description} for this live dogfood test.`);
  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) throw new Error(`${envName} does not point to a file.`);
  return filePath;
}
