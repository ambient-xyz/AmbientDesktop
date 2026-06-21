export type CapabilityBuilderInstallerShape =
  | "tts-provider"
  | "artifact-generator"
  | "file-converter"
  | "search-provider"
  | "browser-tooling"
  | "connector"
  | "custom-cli";

export interface CapabilityBuilderScaffoldInput {
  name?: string;
  goal: string;
  installerShape?: CapabilityBuilderInstallerShape;
  kind?: string;
  provider?: string;
  outputArtifactTypes?: string[];
  responseFormats?: string[];
  locality?: "local" | "network" | "either";
  envNames?: string[];
  networkHosts?: string[];
  modelAssets?: string[];
}

export function scaffoldFiles(name: string, input: CapabilityBuilderScaffoldInput): Array<{ path: string; content: string }> {
  const commandName = commandNameFromPackage(name);
  const description = input.goal.trim();
  if (isPiperVoiceProviderScaffold(input)) return piperVoiceProviderScaffoldFiles(name, commandName, description, input);
  if (isKokoroOnnxVoiceProviderScaffold(input)) return kokoroOnnxVoiceProviderScaffoldFiles(name, commandName, description, input);
  if (isElevenLabsVoiceProviderScaffold(input)) return elevenLabsVoiceProviderScaffoldFiles(name, commandName, description);
  if (isCartesiaVoiceProviderScaffold(input)) return cartesiaVoiceProviderScaffoldFiles(name, commandName, description);
  if (normalizedInstallerShape(input) === "tts-provider") return genericTtsProviderScaffoldFiles(name, commandName, description, input);
  const outputTypes = input.outputArtifactTypes ?? [];
  const isSearchProvider = normalizedInstallerShape(input) === "search-provider";
  const responseFormats = input.responseFormats?.length ? input.responseFormats : isSearchProvider ? defaultSearchProviderResponseFormats(input) : [];
  return [
    {
      path: "ambient-cli.json",
      content: `${JSON.stringify(
        {
          name,
          version: "0.1.0",
          description,
          skills: "./SKILL.md",
          commands: {
            [commandName]: {
              description: `Draft command for ${description}`,
              command: "node",
              args: ["./scripts/run.mjs"],
              cwd: "package",
              healthCheck: ["node", "./scripts/run.mjs", "--health"],
            },
          },
          env: [],
          ...(responseFormats.length ? { responseFormats } : {}),
          artifacts: {
            outputTypes,
            policy: isSearchProvider && !outputTypes.length
              ? "return concise JSON/text in stdout; only write files for explicit export or large-output requests"
              : "write large or binary outputs to files and return artifact paths",
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
        `name: ${name}`,
        `description: ${description}`,
        "---",
        "",
        `Use this capability when the user asks to ${description.toLowerCase()}.`,
        "",
        `Run the \`${commandName}\` command through \`ambient_cli\` after describing this package.`,
        isSearchProvider && !outputTypes.length
          ? `Return concise search results on stdout by default${responseFormats.length ? ` (${responseFormats.join(", ")})` : ""}. Do not declare file artifacts unless the command intentionally writes output files.`
          : "Keep stdout concise. For generated media or large outputs, write files and return artifact paths.",
        "",
      ].join("\n"),
    },
    {
      path: "scripts/run.mjs",
      content: [
        "#!/usr/bin/env node",
        "if (process.argv.includes('--health')) {",
        "  process.stdout.write('ok\\n');",
        "  process.exit(0);",
        "}",
        "process.stdout.write('Draft capability scaffold. Implement command behavior before registration.\\n');",
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
  ];
}

function defaultSearchProviderResponseFormats(input: Pick<CapabilityBuilderScaffoldInput, "goal">): string[] {
  return /\bjson\b/i.test(input.goal) ? ["JSON"] : ["text"];
}

export function normalizedInstallerShape(input: Pick<CapabilityBuilderScaffoldInput, "installerShape" | "kind" | "goal">): CapabilityBuilderInstallerShape | undefined {
  if (input.installerShape) return input.installerShape;
  const kindText = (input.kind ?? "").toLowerCase();
  const goalText = input.goal.toLowerCase();
  if (kindText.includes("tts-provider") || kindText.includes("voice provider") || goalText.includes("tts-provider") || goalText.includes("voice provider")) {
    return "tts-provider";
  }
  if (kindText.includes("search-provider") || kindText.includes("search provider")) return "search-provider";
  if (kindText.includes("connector")) return "connector";
  if (kindText.includes("artifact")) return "artifact-generator";
  return undefined;
}

function isPiperVoiceProviderScaffold(input: CapabilityBuilderScaffoldInput): boolean {
  const providerText = (input.provider ?? "").toLowerCase();
  const kindText = (input.kind ?? "").toLowerCase();
  const goalText = input.goal.toLowerCase();
  return (
    (providerText.includes("piper") || goalText.includes("piper")) &&
    (normalizedInstallerShape(input) === "tts-provider" || kindText.includes("voice provider") || kindText.includes("tts-provider") || goalText.includes("voice provider") || goalText.includes("tts-provider"))
  );
}

function isKokoroOnnxVoiceProviderScaffold(input: CapabilityBuilderScaffoldInput): boolean {
  const providerText = (input.provider ?? "").toLowerCase();
  const kindText = (input.kind ?? "").toLowerCase();
  const goalText = input.goal.toLowerCase();
  return (
    (providerText.includes("kokoro") || providerText.includes("onnx") || goalText.includes("kokoro onnx") || goalText.includes("kokoro-onnx")) &&
    (normalizedInstallerShape(input) === "tts-provider" || kindText.includes("voice provider") || kindText.includes("tts-provider") || goalText.includes("voice provider") || goalText.includes("tts-provider"))
  );
}

function isElevenLabsVoiceProviderScaffold(input: CapabilityBuilderScaffoldInput): boolean {
  const providerText = (input.provider ?? "").toLowerCase();
  const goalText = input.goal.toLowerCase();
  return normalizedInstallerShape(input) === "tts-provider" && (providerText.includes("eleven") || goalText.includes("elevenlabs") || goalText.includes("eleven labs"));
}

function isCartesiaVoiceProviderScaffold(input: CapabilityBuilderScaffoldInput): boolean {
  const providerText = (input.provider ?? "").toLowerCase();
  const goalText = input.goal.toLowerCase();
  return normalizedInstallerShape(input) === "tts-provider" && (providerText.includes("cartesia") || goalText.includes("cartesia"));
}

function genericTtsProviderScaffoldFiles(
  name: string,
  commandName: string,
  description: string,
  input: CapabilityBuilderScaffoldInput,
): Array<{ path: string; content: string }> {
  const providerLabel = input.provider?.trim() || name.replace(/^ambient-/, "").split("-").map(capitalize).join(" ");
  const format = defaultVoiceFormat(input.outputArtifactTypes);
  const env = (input.envNames ?? []).map((envName) => ({ name: envName, required: true, description: `${providerLabel} credential or runtime setting.` }));
  const local = input.locality === "local" ? true : input.locality === "network" ? false : undefined;
  return [
    {
      path: "ambient-cli.json",
      content: `${JSON.stringify(
        {
          name,
          version: "0.1.0",
          description,
          skills: "./SKILL.md",
          commands: {
            [commandName]: {
              description: `Synthesize assistant voice audio with ${providerLabel}.`,
              command: "node",
              args: ["./scripts/run.mjs"],
              cwd: "package",
              healthCheck: ["node", "./scripts/run.mjs", "--health"],
              voiceProvider: {
                label: `${providerLabel} Voice Provider`,
                defaultFormat: format,
                formats: [format],
                voices: [{ id: "default", label: "Default voice" }],
                ...(local !== undefined ? { local } : {}),
              },
            },
          },
          ...(env.length ? { env } : {}),
          artifacts: {
            outputTypes: [format.toUpperCase()],
            policy: "write audio to the requested output path and return concise JSON metadata",
          },
          ...(input.networkHosts?.length ? { networkHosts: input.networkHosts } : {}),
          ...(input.modelAssets?.length ? { modelAssets: input.modelAssets } : {}),
        },
        null,
        2,
      )}\n`,
    },
    {
      path: "SKILL.md",
      content: [
        "---",
        `name: ${name}`,
        `description: ${description}`,
        "---",
        "",
        `Use this Ambient voice provider when the user wants Ambient to speak assistant replies through ${providerLabel}.`,
        "",
        "## Contract",
        "",
        `The \`${commandName}\` command must implement Ambient's tts-provider contract:`,
        "",
        "- accept `--text <text>` or `--text-file <path>`, `--output <path>`, `--format <wav|mp3|ogg>`, and optional `--voice <id>`",
        "- write audio to the exact requested output path",
        "- print concise JSON metadata with `audioPath`, `mimeType`, optional `durationMs`, `providerId`, and `voiceId`",
        "- never print API keys, base64 audio, long provider responses, or transcript-sized content",
        "",
        "This generated package is a provider scaffold. Keep the descriptor `voiceProvider` metadata aligned with the wrapper behavior before validation and registration.",
        "",
      ].join("\n"),
    },
    {
      path: "scripts/run.mjs",
      content: genericTtsProviderRunScript(providerLabel, format, input.envNames ?? []),
    },
    {
      path: "tests/smoke.test.mjs",
      content: [
        "import { strict as assert } from 'node:assert';",
        "import { execFileSync } from 'node:child_process';",
        "",
        "const output = execFileSync(process.execPath, ['./scripts/run.mjs', '--health'], { encoding: 'utf8' });",
        "assert.match(output, /ok/);",
        "",
      ].join("\n"),
    },
  ];
}

function elevenLabsVoiceProviderScaffoldFiles(
  name: string,
  commandName: string,
  description: string,
): Array<{ path: string; content: string }> {
  return cloudVoiceProviderScaffoldFiles({
    name,
    commandName,
    description,
    providerId: "elevenlabs",
    providerLabel: "ElevenLabs",
    envName: "ELEVENLABS_API_KEY",
    host: "api.elevenlabs.io",
    defaultFormat: "mp3",
    outputType: "MP3",
    defaultVoiceId: "21m00Tcm4TlvDq8ikWAM",
    defaultVoiceLabel: "Rachel",
    script: elevenLabsVoiceProviderRunScript(),
    notes: [
      "Uses `POST /v1/text-to-speech/{voice_id}` with the smallest practical validation text.",
      "Default output is MP3 (`mp3_44100_128`) because ElevenLabs returns MP3 bytes directly for this endpoint.",
    ],
  });
}

function cartesiaVoiceProviderScaffoldFiles(
  name: string,
  commandName: string,
  description: string,
): Array<{ path: string; content: string }> {
  return cloudVoiceProviderScaffoldFiles({
    name,
    commandName,
    description,
    providerId: "cartesia",
    providerLabel: "Cartesia",
    envName: "CARTESIA_API_KEY",
    host: "api.cartesia.ai",
    defaultFormat: "wav",
    outputType: "WAV",
    defaultVoiceId: "a0e99841-438c-4a64-b679-ae501e7d6091",
    defaultVoiceLabel: "Default Cartesia voice",
    script: cartesiaVoiceProviderRunScript(),
    notes: [
      "Uses `POST /tts/bytes` with `Cartesia-Version: 2025-04-16` and a tiny transcript.",
      "Default output is WAV/PCM so Ambient can validate a simple non-empty audio artifact.",
    ],
  });
}

function cloudVoiceProviderScaffoldFiles(input: {
  name: string;
  commandName: string;
  description: string;
  providerId: string;
  providerLabel: string;
  envName: string;
  host: string;
  defaultFormat: "mp3" | "wav" | "ogg";
  outputType: string;
  defaultVoiceId: string;
  defaultVoiceLabel: string;
  script: string;
  notes: string[];
}): Array<{ path: string; content: string }> {
  return [
    {
      path: "ambient-cli.json",
      content: `${JSON.stringify(
        {
          name: input.name,
          version: "0.1.0",
          description: input.description,
          skills: "./SKILL.md",
          commands: {
            [input.commandName]: {
              description: `Synthesize assistant voice audio with ${input.providerLabel}.`,
              command: "node",
              args: ["./scripts/run.mjs"],
              cwd: "package",
              healthCheck: ["node", "./scripts/run.mjs", "--health"],
              voiceProvider: {
                label: `${input.providerLabel} Voice Provider`,
                defaultFormat: input.defaultFormat,
                formats: [input.defaultFormat],
                voices: [{ id: input.defaultVoiceId, label: input.defaultVoiceLabel }],
                local: false,
                voiceDiscovery: {
                  command: input.commandName,
                  cacheTtlSeconds: 86400,
                  requiresNetwork: true,
                  requiresSecret: [input.envName],
                  source: "cloud-api",
                },
                voiceCloning: {
                  supported: true,
                  createCommand: input.commandName,
                  statusCommand: input.commandName,
                  deleteCommand: input.commandName,
                  mode: "cloud",
                  inputs: {
                    audioFormats: ["mp3", "wav", "m4a", "webm"],
                    minDurationSeconds: 30,
                    maxDurationSeconds: 1800,
                    minSamples: 1,
                    transcript: "optional",
                  },
                  requiresConsent: true,
                  requiresSecret: [input.envName],
                  networkHosts: [input.host],
                  costNote: "Voice cloning may consume provider credits depending on account plan and provider policy.",
                  privacyNote: "Source audio is uploaded to the cloud provider only during a separately approved clone workflow.",
                  output: {
                    creates: ["provider-voice-id", "dynamic-cache-voice"],
                    appearsInDynamicCatalog: true,
                  },
                },
              },
            },
          },
          env: [{ name: input.envName, required: true, description: `${input.providerLabel} API key.` }],
          networkHosts: [input.host],
          artifacts: {
            outputTypes: [input.outputType],
            policy: "write audio to the requested output path and return concise JSON metadata",
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
        `name: ${input.name}`,
        `description: ${input.description}`,
        "---",
        "",
        `Use this Ambient voice provider when the user wants Ambient to speak assistant replies through ${input.providerLabel}.`,
        "",
        "## Contract",
        "",
        `Run \`${input.commandName}\` through Ambient's voice runtime or \`ambient_cli\` with \`--text <text>\` or \`--text-file <path>\`, \`--output <path>\`, \`--format ${input.defaultFormat}\`, and optional \`--voice <id>\`.`,
        `Requires Ambient-managed secret binding for \`${input.envName}\`; never ask the user to paste API keys into chat.`,
        ...input.notes,
        "Keep stdout to concise JSON metadata: `audioPath`, `mimeType`, `providerId`, and `voiceId`. Put binary audio in the requested output path.",
        "",
      ].join("\n"),
    },
    {
      path: "scripts/run.mjs",
      content: input.script,
    },
    {
      path: "tests/smoke.test.mjs",
      content: [
        "import { strict as assert } from 'node:assert';",
        "import { execFileSync, spawnSync } from 'node:child_process';",
        "",
        "if (process.env.AMBIENT_LIVE_TTS_SMOKE === '1') {",
        `  const format = process.env.AMBIENT_LIVE_TTS_FORMAT || ${JSON.stringify(input.defaultFormat)};`,
        "  const result = spawnSync(process.execPath, ['./scripts/run.mjs', '--text', 'Ambient smoke.', '--output', `ambient-live-smoke.${format}`, '--format', format], { encoding: 'utf8' });",
        "  assert.equal(result.status, 0, result.stderr);",
        "  assert.match(result.stdout, /audioPath/);",
        "} else {",
        "  const output = execFileSync(process.execPath, ['./scripts/run.mjs', '--health'], { encoding: 'utf8' });",
        "  assert.match(output, /ok/);",
        "}",
        "",
      ].join("\n"),
    },
  ];
}

function defaultVoiceFormat(outputArtifactTypes: string[] | undefined): "mp3" | "wav" | "ogg" {
  for (const type of outputArtifactTypes ?? []) {
    const normalized = normalizeVoiceOutputFormat(type);
    if (normalized) return normalized;
  }
  return "wav";
}

function capitalize(value: string): string {
  return value ? `${value.slice(0, 1).toUpperCase()}${value.slice(1)}` : value;
}

function genericTtsProviderRunScript(providerLabel: string, defaultFormat: "mp3" | "wav" | "ogg", envNames: string[]): string {
  return [
    "#!/usr/bin/env node",
    "import { existsSync, readFileSync } from 'node:fs';",
    "import { isAbsolute, resolve } from 'node:path';",
    "",
    `const PROVIDER_LABEL = ${JSON.stringify(providerLabel)};`,
    `const DEFAULT_FORMAT = ${JSON.stringify(defaultFormat)};`,
    `const REQUIRED_ENV = ${JSON.stringify(envNames)};`,
    "",
    "function parseArgs(argv) {",
    "  const options = { text: '', textFile: '', output: '', format: DEFAULT_FORMAT, voice: 'default', health: false, help: false };",
    "  for (let i = 2; i < argv.length; i += 1) {",
    "    const arg = argv[i];",
    "    if (arg === '--health') options.health = true;",
    "    else if (arg === '--help' || arg === '-h') options.help = true;",
    "    else if (arg === '--text') options.text = argv[++i] ?? '';",
    "    else if (arg === '--text-file') options.textFile = argv[++i] ?? '';",
    "    else if (arg === '--output') options.output = argv[++i] ?? '';",
    "    else if (arg === '--format') options.format = argv[++i] ?? DEFAULT_FORMAT;",
    "    else if (arg === '--voice') options.voice = argv[++i] ?? 'default';",
    "  }",
    "  return options;",
    "}",
    "",
    "function resolveInputPath(path) {",
    "  const roots = [process.cwd(), process.env.AMBIENT_WORKSPACE_PATH, process.env.AMBIENT_DESKTOP_WORKSPACE].filter(Boolean);",
    "  const candidates = isAbsolute(path) ? [path] : [path, ...roots.map((root) => resolve(root, path))];",
    "  for (const candidate of [...new Set(candidates)]) {",
    "    if (existsSync(candidate)) return candidate;",
    "  }",
    "  return resolve(path);",
    "}",
    "",
    "function loadTextInput(options) {",
    "  if (options.text) return options.text;",
    "  if (!options.textFile) return '';",
    "  try {",
    "    return readFileSync(resolveInputPath(options.textFile), 'utf8');",
    "  } catch (error) {",
    "    process.stderr.write(`Unable to read --text-file ${options.textFile}: ${error instanceof Error ? error.message : String(error)}\\n`);",
    "    process.exit(2);",
    "  }",
    "}",
    "",
    "function missingEnv() {",
    "  return REQUIRED_ENV.filter((name) => !process.env[name]);",
    "}",
    "",
    "function mimeType(format) {",
    "  if (format === 'mp3') return 'audio/mpeg';",
    "  if (format === 'ogg') return 'audio/ogg';",
    "  return 'audio/wav';",
    "}",
    "",
    "const options = parseArgs(process.argv);",
    "if (options.help) {",
    "  process.stdout.write('Usage: provider (--text <text> | --text-file <path>) --output <path> --format <wav|mp3|ogg> [--voice <id>]\\n');",
    "  process.exit(0);",
    "}",
    "",
    "const missing = missingEnv();",
    "if (options.health) {",
    "  if (missing.length) {",
    "    process.stderr.write(`Missing required env ${missing.join(', ')}; use Ambient-managed secret binding before validation.\\n`);",
    "    process.exit(7);",
    "  }",
    "  process.stdout.write('ok\\n');",
    "  process.exit(0);",
    "}",
    "",
    "const synthesisText = loadTextInput(options);",
    "if (!synthesisText) {",
    "  process.stderr.write('Missing --text or --text-file for Ambient tts-provider synthesis.\\n');",
    "  process.exit(2);",
    "}",
    "if (!options.output) {",
    "  process.stderr.write('Missing --output for Ambient tts-provider synthesis.\\n');",
    "  process.exit(2);",
    "}",
    "if (!['wav', 'mp3', 'ogg'].includes(options.format)) {",
    "  process.stderr.write(`Unsupported --format: ${options.format}\\n`);",
    "  process.exit(2);",
    "}",
    "if (missing.length) {",
    "  process.stderr.write(`Missing required env ${missing.join(', ')}; use Ambient-managed secret binding before validation.\\n`);",
    "  process.exit(7);",
    "}",
    "",
    "const audioPath = resolve(options.output);",
    "process.stderr.write(`${PROVIDER_LABEL} scaffold has not implemented provider synthesis yet. Fill in scripts/run.mjs with the provider API/binary call, write audio to ${audioPath}, then return JSON metadata.\\n`);",
    "process.stdout.write(JSON.stringify({ audioPath, mimeType: mimeType(options.format), providerId: PROVIDER_LABEL.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), voiceId: options.voice, implemented: false }) + '\\n');",
    "process.exit(3);",
    "",
  ].join("\n");
}

function cloudProviderSharedRunScript(): string[] {
  return [
    "#!/usr/bin/env node",
    "import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';",
    "import { basename, dirname, isAbsolute, resolve } from 'node:path';",
    "",
    "function parseArgs(argv) {",
    "  const options = { text: '', textFile: '', output: '', format: '', voice: '', health: false, listVoices: false, cloneCreate: false, cloneStatus: false, cloneDelete: false, cloneName: '', voiceId: '', sourceAudio: [], notes: '', help: false };",
    "  for (let i = 2; i < argv.length; i += 1) {",
    "    const arg = argv[i];",
    "    if (arg === '--health') options.health = true;",
    "    else if (arg === '--list-voices') options.listVoices = true;",
    "    else if (arg === '--clone-create') options.cloneCreate = true;",
    "    else if (arg === '--clone-status') options.cloneStatus = true;",
    "    else if (arg === '--clone-delete') options.cloneDelete = true;",
    "    else if (arg === '--help' || arg === '-h') options.help = true;",
    "    else if (arg === '--text') options.text = argv[++i] ?? '';",
    "    else if (arg === '--text-file') options.textFile = argv[++i] ?? '';",
    "    else if (arg === '--output') options.output = argv[++i] ?? '';",
    "    else if (arg === '--format') options.format = argv[++i] ?? '';",
    "    else if (arg === '--voice') options.voice = argv[++i] ?? '';",
    "    else if (arg === '--voice-id') options.voiceId = argv[++i] ?? '';",
    "    else if (arg === '--clone-name') options.cloneName = argv[++i] ?? '';",
    "    else if (arg === '--source-audio') options.sourceAudio.push(argv[++i] ?? '');",
    "    else if (arg === '--notes') options.notes = argv[++i] ?? '';",
    "  }",
    "  return options;",
    "}",
    "",
    "function resolveInputPath(path) {",
    "  const roots = [process.cwd(), process.env.AMBIENT_WORKSPACE_PATH, process.env.AMBIENT_DESKTOP_WORKSPACE].filter(Boolean);",
    "  const candidates = isAbsolute(path) ? [path] : [path, ...roots.map((root) => resolve(root, path))];",
    "  for (const candidate of [...new Set(candidates)]) {",
    "    if (existsSync(candidate)) return candidate;",
    "  }",
    "  return resolve(path);",
    "}",
    "",
    "function loadTextInput(options) {",
    "  if (options.text) return options.text;",
    "  if (!options.textFile) return '';",
    "  try {",
    "    return readFileSync(resolveInputPath(options.textFile), 'utf8');",
    "  } catch (error) {",
    "    process.stderr.write(`Unable to read --text-file ${options.textFile}: ${error instanceof Error ? error.message : String(error)}\\n`);",
    "    process.exit(2);",
    "  }",
    "}",
    "",
    "function requireEnv(name) {",
    "  const value = process.env[name]?.trim();",
    "  if (!value) {",
    "    process.stderr.write(`Missing required env ${name}; use Ambient-managed secret binding before validation.\\n`);",
    "    process.exit(7);",
    "  }",
    "  return value;",
    "}",
    "",
    "function requireSynthesisArgs(options, expectedFormat) {",
    "  const text = loadTextInput(options);",
    "  if (!text) { process.stderr.write('Missing --text or --text-file for Ambient tts-provider synthesis.\\n'); process.exit(2); }",
    "  if (!options.output) { process.stderr.write('Missing --output for Ambient tts-provider synthesis.\\n'); process.exit(2); }",
    "  if ((options.format || expectedFormat) !== expectedFormat) { process.stderr.write(`Unsupported --format: ${options.format}; expected ${expectedFormat}.\\n`); process.exit(2); }",
    "  return text;",
    "}",
    "",
    "async function postBytes(url, init) {",
    "  const response = await fetch(url, init);",
    "  const bytes = Buffer.from(await response.arrayBuffer());",
    "  if (!response.ok) {",
    "    const body = bytes.toString('utf8').slice(0, 800);",
    "    throw new Error(`Provider request failed (${response.status}): ${body}`);",
    "  }",
    "  return bytes;",
    "}",
    "",
    "async function getJson(url, init) {",
    "  const response = await fetch(url, init);",
    "  const text = await response.text();",
    "  if (!response.ok) {",
    "    throw new Error(`Provider request failed (${response.status}): ${text.slice(0, 800)}`);",
    "  }",
    "  return text ? JSON.parse(text) : {};",
    "}",
    "",
    "function writeAudio(output, bytes) {",
    "  const audioPath = resolve(output);",
    "  mkdirSync(dirname(audioPath), { recursive: true });",
    "  writeFileSync(audioPath, bytes);",
    "  return audioPath;",
    "}",
    "",
    "function requireCloneArgs(options) {",
    "  if (!options.cloneName) { process.stderr.write('Missing --clone-name for Ambient voice clone creation.\\n'); process.exit(2); }",
    "  if (!options.sourceAudio.length) { process.stderr.write('Missing --source-audio for Ambient voice clone creation.\\n'); process.exit(2); }",
    "}",
    "",
    "function requireVoiceId(options) {",
    "  if (!options.voiceId) { process.stderr.write('Missing --voice-id for Ambient voice clone management.\\n'); process.exit(2); }",
    "}",
    "",
    "function appendAudioFiles(form, fieldName, paths) {",
    "  for (const path of paths) {",
    "    const absolutePath = resolve(path);",
    "    const bytes = readFileSync(absolutePath);",
    "    form.append(fieldName, new Blob([bytes]), basename(absolutePath));",
    "  }",
    "}",
  ];
}

function elevenLabsVoiceProviderRunScript(): string {
  return [
    ...cloudProviderSharedRunScript(),
    "",
    "const ENV_NAME = 'ELEVENLABS_API_KEY';",
    "const DEFAULT_VOICE = '21m00Tcm4TlvDq8ikWAM';",
    "const FORMAT = 'mp3';",
    "const options = parseArgs(process.argv);",
    "if (options.help) { process.stdout.write('Usage: elevenlabs (--text <text> | --text-file <path>) --output <path.mp3> --format mp3 [--voice <id>] [--list-voices] [--clone-create --clone-name <name> --source-audio <path>] [--clone-status --voice-id <id>] [--clone-delete --voice-id <id>]\\n'); process.exit(0); }",
    "const apiKey = requireEnv(ENV_NAME);",
    "if (options.health) { process.stdout.write(JSON.stringify({ ok: true, provider: 'elevenlabs', format: FORMAT }) + '\\n'); process.exit(0); }",
    "if (options.listVoices) {",
    "  try {",
    "    const data = await getJson('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': apiKey, 'accept': 'application/json' } });",
    "    const voices = Array.isArray(data.voices) ? data.voices.map((voice) => ({",
    "      id: String(voice.voice_id || voice.voiceId || voice.id || ''),",
    "      label: String(voice.name || voice.label || voice.voice_id || 'Unnamed voice'),",
    "      description: typeof voice.description === 'string' ? voice.description : undefined,",
    "      gender: typeof voice.labels?.gender === 'string' ? voice.labels.gender : undefined,",
    "      locale: Array.isArray(voice.verified_languages) && voice.verified_languages[0]?.locale ? String(voice.verified_languages[0].locale) : undefined,",
    "      language: Array.isArray(voice.verified_languages) && voice.verified_languages[0]?.language ? String(voice.verified_languages[0].language) : undefined,",
    "      style: typeof voice.labels?.accent === 'string' ? [voice.labels.accent] : undefined,",
    "      providerMetadata: { category: voice.category, isOwner: voice.is_owner, isLegacy: voice.is_legacy },",
    "    })).filter((voice) => voice.id) : [];",
    "    process.stdout.write(JSON.stringify({ voices }) + '\\n');",
    "  } catch (error) {",
    "    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\\n`);",
    "    process.exit(1);",
    "  }",
    "  process.exit(0);",
    "}",
    "if (options.cloneCreate) {",
    "  requireCloneArgs(options);",
    "  try {",
    "    const form = new FormData();",
    "    form.append('name', options.cloneName);",
    "    if (options.notes) form.append('description', options.notes);",
    "    appendAudioFiles(form, 'files', options.sourceAudio);",
    "    const data = await getJson('https://api.elevenlabs.io/v1/voices/add', {",
    "      method: 'POST',",
    "      headers: { 'xi-api-key': apiKey, 'accept': 'application/json' },",
    "      body: form,",
    "    });",
    "    const voiceId = String(data.voice_id || data.voiceId || data.id || '');",
    "    if (!voiceId) throw new Error('ElevenLabs clone response did not include voice_id.');",
    "    process.stdout.write(JSON.stringify({ voiceId, label: options.cloneName, providerId: 'elevenlabs', cloned: true, status: data.requires_verification ? 'requires-verification' : 'ready' }) + '\\n');",
    "  } catch (error) {",
    "    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\\n`);",
    "    process.exit(1);",
    "  }",
    "  process.exit(0);",
    "}",
    "if (options.cloneStatus) {",
    "  requireVoiceId(options);",
    "  try {",
    "    const data = await getJson(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(options.voiceId)}`, { headers: { 'xi-api-key': apiKey, 'accept': 'application/json' } });",
    "    process.stdout.write(JSON.stringify({ voiceId: String(data.voice_id || data.voiceId || options.voiceId), label: data.name ? String(data.name) : undefined, status: data.requires_verification ? 'requires-verification' : 'ready', cloned: true, providerId: 'elevenlabs' }) + '\\n');",
    "  } catch (error) {",
    "    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\\n`);",
    "    process.exit(1);",
    "  }",
    "  process.exit(0);",
    "}",
    "if (options.cloneDelete) {",
    "  requireVoiceId(options);",
    "  try {",
    "    const response = await fetch(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(options.voiceId)}`, { method: 'DELETE', headers: { 'xi-api-key': apiKey, 'accept': 'application/json' } });",
    "    const text = await response.text();",
    "    if (!response.ok) throw new Error(`Provider request failed (${response.status}): ${text.slice(0, 800)}`);",
    "    process.stdout.write(JSON.stringify({ voiceId: options.voiceId, deleted: true, providerId: 'elevenlabs' }) + '\\n');",
    "  } catch (error) {",
    "    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\\n`);",
    "    process.exit(1);",
    "  }",
    "  process.exit(0);",
    "}",
    "const synthesisText = requireSynthesisArgs(options, FORMAT);",
    "const voiceId = options.voice || DEFAULT_VOICE;",
    "try {",
    "  const bytes = await postBytes(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {",
    "    method: 'POST',",
    "    headers: { 'xi-api-key': apiKey, 'content-type': 'application/json', 'accept': 'audio/mpeg' },",
    "    body: JSON.stringify({ text: synthesisText, model_id: 'eleven_multilingual_v2' }),",
    "  });",
    "  const audioPath = writeAudio(options.output, bytes);",
    "  process.stdout.write(JSON.stringify({ audioPath, mimeType: 'audio/mpeg', providerId: 'elevenlabs', voiceId }) + '\\n');",
    "} catch (error) {",
    "  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\\n`);",
    "  process.exit(1);",
    "}",
    "",
  ].join("\n");
}

function cartesiaVoiceProviderRunScript(): string {
  return [
    ...cloudProviderSharedRunScript(),
    "",
    "const ENV_NAME = 'CARTESIA_API_KEY';",
    "const DEFAULT_VOICE = 'a0e99841-438c-4a64-b679-ae501e7d6091';",
    "const FORMAT = 'wav';",
    "const options = parseArgs(process.argv);",
    "if (options.help) { process.stdout.write('Usage: cartesia (--text <text> | --text-file <path>) --output <path.wav> --format wav [--voice <id>] [--list-voices] [--clone-create --clone-name <name> --source-audio <path>] [--clone-status --voice-id <id>] [--clone-delete --voice-id <id>]\\n'); process.exit(0); }",
    "const apiKey = requireEnv(ENV_NAME);",
    "if (options.health) { process.stdout.write(JSON.stringify({ ok: true, provider: 'cartesia', format: FORMAT }) + '\\n'); process.exit(0); }",
    "if (options.listVoices) {",
    "  try {",
    "    const data = await getJson('https://api.cartesia.ai/voices', { headers: { 'X-API-Key': apiKey, 'Cartesia-Version': '2025-04-16', 'accept': 'application/json' } });",
    "    const rawVoices = Array.isArray(data) ? data : Array.isArray(data.voices) ? data.voices : Array.isArray(data.data) ? data.data : [];",
    "    const voices = rawVoices.map((voice) => ({",
    "      id: String(voice.id || voice.voice_id || voice.voiceId || ''),",
    "      label: String(voice.name || voice.label || voice.id || 'Unnamed voice'),",
    "      description: typeof voice.description === 'string' ? voice.description : undefined,",
    "      language: typeof voice.language === 'string' ? voice.language : undefined,",
    "      locale: typeof voice.locale === 'string' ? voice.locale : undefined,",
    "      gender: typeof voice.gender === 'string' ? voice.gender : undefined,",
    "      style: Array.isArray(voice.tags) ? voice.tags.map(String) : undefined,",
    "      providerMetadata: { isOwner: voice.is_owner, isPublic: voice.is_public },",
    "    })).filter((voice) => voice.id);",
    "    process.stdout.write(JSON.stringify({ voices }) + '\\n');",
    "  } catch (error) {",
    "    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\\n`);",
    "    process.exit(1);",
    "  }",
    "  process.exit(0);",
    "}",
    "if (options.cloneCreate) {",
    "  requireCloneArgs(options);",
    "  if (options.sourceAudio.length !== 1) { process.stderr.write('Cartesia clone creation expects exactly one --source-audio file.\\n'); process.exit(2); }",
    "  try {",
    "    const form = new FormData();",
    "    appendAudioFiles(form, 'clip', options.sourceAudio);",
    "    form.append('name', options.cloneName);",
    "    if (options.notes) form.append('description', options.notes);",
    "    form.append('language', 'en');",
    "    form.append('mode', 'similarity');",
    "    form.append('enhance', 'true');",
    "    const data = await getJson('https://api.cartesia.ai/voices/clone', {",
    "      method: 'POST',",
    "      headers: { 'X-API-Key': apiKey, 'Cartesia-Version': '2025-04-16', 'accept': 'application/json' },",
    "      body: form,",
    "    });",
    "    const voiceId = String(data.id || data.voice_id || data.voiceId || '');",
    "    if (!voiceId) throw new Error('Cartesia clone response did not include id.');",
    "    process.stdout.write(JSON.stringify({ voiceId, label: data.name || options.cloneName, providerId: 'cartesia', cloned: true, status: 'ready' }) + '\\n');",
    "  } catch (error) {",
    "    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\\n`);",
    "    process.exit(1);",
    "  }",
    "  process.exit(0);",
    "}",
    "if (options.cloneStatus) {",
    "  requireVoiceId(options);",
    "  try {",
    "    const data = await getJson(`https://api.cartesia.ai/voices/${encodeURIComponent(options.voiceId)}`, { headers: { 'X-API-Key': apiKey, 'Cartesia-Version': '2025-04-16', 'accept': 'application/json' } });",
    "    process.stdout.write(JSON.stringify({ voiceId: String(data.id || data.voice_id || data.voiceId || options.voiceId), label: data.name ? String(data.name) : undefined, status: 'ready', cloned: true, providerId: 'cartesia' }) + '\\n');",
    "  } catch (error) {",
    "    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\\n`);",
    "    process.exit(1);",
    "  }",
    "  process.exit(0);",
    "}",
    "if (options.cloneDelete) {",
    "  requireVoiceId(options);",
    "  try {",
    "    const response = await fetch(`https://api.cartesia.ai/voices/${encodeURIComponent(options.voiceId)}`, { method: 'DELETE', headers: { 'X-API-Key': apiKey, 'Cartesia-Version': '2025-04-16', 'accept': 'application/json' } });",
    "    const text = await response.text();",
    "    if (!response.ok) throw new Error(`Provider request failed (${response.status}): ${text.slice(0, 800)}`);",
    "    process.stdout.write(JSON.stringify({ voiceId: options.voiceId, deleted: true, providerId: 'cartesia' }) + '\\n');",
    "  } catch (error) {",
    "    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\\n`);",
    "    process.exit(1);",
    "  }",
    "  process.exit(0);",
    "}",
    "const synthesisText = requireSynthesisArgs(options, FORMAT);",
    "const voiceId = options.voice || DEFAULT_VOICE;",
    "try {",
    "  const bytes = await postBytes('https://api.cartesia.ai/tts/bytes', {",
    "    method: 'POST',",
    "    headers: { 'X-API-Key': apiKey, 'Cartesia-Version': '2025-04-16', 'content-type': 'application/json' },",
    "    body: JSON.stringify({",
    "      model_id: 'sonic-2',",
    "      transcript: synthesisText,",
    "      voice: { mode: 'id', id: voiceId },",
    "      output_format: { container: 'wav', encoding: 'pcm_s16le', sample_rate: 44100 },",
    "    }),",
    "  });",
    "  const audioPath = writeAudio(options.output, bytes);",
    "  process.stdout.write(JSON.stringify({ audioPath, mimeType: 'audio/wav', providerId: 'cartesia', voiceId }) + '\\n');",
    "} catch (error) {",
    "  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\\n`);",
    "  process.exit(1);",
    "}",
    "",
  ].join("\n");
}

function piperVoiceProviderScaffoldFiles(
  name: string,
  commandName: string,
  description: string,
  input: CapabilityBuilderScaffoldInput,
): Array<{ path: string; content: string }> {
  return [
    {
      path: "ambient-cli.json",
      content: `${JSON.stringify(
        {
          name,
          version: "0.1.0",
          description,
          skills: "./SKILL.md",
          commands: {
            [commandName]: {
              description: "Synthesize spoken assistant text to a WAV file with Piper TTS.",
              command: "node",
              args: ["./scripts/run.mjs"],
              cwd: "package",
              healthCheck: ["node", "./scripts/run.mjs", "--health"],
              voiceProvider: {
                defaultFormat: "wav",
                formats: ["wav"],
                voices: [{ id: "default", label: "Default Piper voice" }],
                local: true,
              },
            },
          },
          env: [],
          networkHosts: ["huggingface.co", "pypi.org", "files.pythonhosted.org"],
          modelAssets: [
            {
              name: "Piper en_US lessac medium ONNX voice",
              url: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx",
              expectedSizeBytes: 63100000,
              license: "Piper voice model repository terms",
              cachePath: "models/en_US-lessac-medium.onnx",
            },
            {
              name: "Piper en_US lessac medium config",
              url: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json",
              expectedSizeBytes: 6000,
              license: "Piper voice model repository terms",
              cachePath: "models/en_US-lessac-medium.onnx.json",
            },
          ],
          artifacts: {
            outputTypes: input.outputArtifactTypes ?? ["WAV"],
            policy: "write generated WAV files to the --output path and return JSON artifact metadata",
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
        `name: ${name}`,
        `description: ${description}`,
        "---",
        "",
        "Use this capability when Ambient core voice dispatch or the user needs local Piper text-to-speech.",
        "",
        `Command contract: run \`${commandName}\` through \`ambient_cli\` with \`--text <text>\`, \`--output <path.wav>\`, \`--format wav\`, and optional \`--voice default\`.`,
        "The wrapper uses `uvx --from piper-tts piper` and expects the declared model assets under `models/`.",
        "Before install or repair, read Piper upstream docs/model requirements and preview dependency/model downloads for user approval.",
        "Keep stdout to JSON metadata: `audioPath`, `mimeType`, and optional `durationMs`. Put audio in the requested output path.",
        "",
      ].join("\n"),
    },
    {
      path: "scripts/run.mjs",
      content: piperVoiceProviderRunScript(),
    },
    {
      path: "tests/smoke.test.mjs",
      content: piperVoiceProviderSmokeTest(),
    },
  ];
}

function piperVoiceProviderRunScript(): string {
  return [
    "#!/usr/bin/env node",
    "import { existsSync } from 'node:fs';",
    "import { mkdirSync } from 'node:fs';",
    "import { dirname, resolve } from 'node:path';",
    "import { spawnSync } from 'node:child_process';",
    "",
    "const args = process.argv.slice(2);",
    "const model = resolve('models/en_US-lessac-medium.onnx');",
    "const config = resolve('models/en_US-lessac-medium.onnx.json');",
    "",
    "function checkAssets() {",
    "  if (!existsSync(model) || !existsSync(config)) {",
    "    console.error('Missing Piper model assets. Download the descriptor modelAssets into ./models before running synthesis.');",
    "    process.exit(3);",
    "  }",
    "}",
    "",
    "if (args.includes('--health')) {",
    "  checkAssets();",
    "  const uvx = spawnSync('uvx', ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });",
    "  if (uvx.error || uvx.status !== 0) {",
    "    process.stderr.write(uvx.stderr || uvx.stdout || uvx.error?.message || 'uvx unavailable for Piper TTS. Install uv or provide a packaged Piper binary.\\n');",
    "    process.exit(4);",
    "  }",
    "  process.stdout.write(JSON.stringify({ ok: true, provider: 'piper', contract: '--text --output --format wav' }) + '\\n');",
    "  process.exit(0);",
    "}",
    "",
    "function arg(name) {",
    "  const index = args.indexOf(name);",
    "  return index >= 0 ? args[index + 1] : undefined;",
    "}",
    "",
    "const text = arg('--text');",
    "const output = arg('--output');",
    "const format = arg('--format') || 'wav';",
    "if (!text || !output) {",
    "  console.error('Usage: --text <text> --output <path.wav> --format wav [--voice default]');",
    "  process.exit(2);",
    "}",
    "if (format !== 'wav') {",
    "  console.error('Piper wrapper currently supports only wav output.');",
    "  process.exit(2);",
    "}",
    "",
    "checkAssets();",
    "",
    "const absoluteOutput = resolve(output);",
    "mkdirSync(dirname(absoluteOutput), { recursive: true });",
    "const result = spawnSync('uvx', ['--from', 'piper-tts', 'piper', '-m', model, '-c', config, '-f', absoluteOutput], {",
    "  input: text,",
    "  encoding: 'utf8',",
    "  stdio: ['pipe', 'pipe', 'pipe'],",
    "});",
    "if (result.status !== 0) {",
    "  process.stderr.write(result.stderr || result.stdout || `piper exited with ${result.status}\\n`);",
    "  process.exit(result.status || 1);",
    "}",
    "process.stdout.write(JSON.stringify({ audioPath: absoluteOutput, mimeType: 'audio/wav' }) + '\\n');",
    "",
  ].join("\n");
}

function piperVoiceProviderSmokeTest(): string {
  return [
    "import { strict as assert } from 'node:assert';",
    "import { spawnSync } from 'node:child_process';",
    "import { existsSync } from 'node:fs';",
    "",
    "const health = spawnSync(process.execPath, ['./scripts/run.mjs', '--health'], { encoding: 'utf8' });",
    "if (health.status === 3) {",
    "  assert.match(health.stderr, /Missing Piper model assets/);",
    "  process.exit(0);",
    "}",
    "assert.equal(health.status, 0, health.stderr);",
    "",
    "const output = 'ambient-piper-smoke.wav';",
    "const result = spawnSync(process.execPath, ['./scripts/run.mjs', '--text', 'Ambient Piper smoke.', '--output', output, '--format', 'wav'], { encoding: 'utf8' });",
    "assert.equal(result.status, 0, result.stderr);",
    "assert.match(result.stdout, /audio\\/wav/);",
    "assert.equal(existsSync(output), true);",
    "",
  ].join("\n");
}

function kokoroOnnxVoiceProviderScaffoldFiles(
  name: string,
  commandName: string,
  description: string,
  input: CapabilityBuilderScaffoldInput,
): Array<{ path: string; content: string }> {
  return [
    {
      path: "ambient-cli.json",
      content: `${JSON.stringify(
        {
          name,
          version: "0.1.0",
          description,
          skills: "./SKILL.md",
          commands: {
            [commandName]: {
              description: "Synthesize spoken assistant text to a WAV file with Kokoro ONNX.",
              command: "node",
              args: ["./scripts/run.mjs"],
              cwd: "package",
              healthCheck: ["node", "./scripts/run.mjs", "--health"],
              voiceProvider: {
                label: "Kokoro ONNX Voice Provider",
                defaultFormat: "wav",
                formats: ["wav"],
                voices: [{ id: "af_sarah", label: "af_sarah" }],
                local: true,
              },
            },
          },
          env: [],
          networkHosts: ["github.com", "objects.githubusercontent.com", "pypi.org", "files.pythonhosted.org"],
          modelAssets: [
            {
              name: "Kokoro ONNX v1.0 int8 model",
              url: "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.int8.onnx",
              expectedSizeBytes: 92361271,
              license: "Kokoro ONNX model release terms",
              cachePath: "models/kokoro-v1.0.int8.onnx",
            },
            {
              name: "Kokoro ONNX v1.0 voices",
              url: "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin",
              expectedSizeBytes: 28214398,
              license: "Kokoro ONNX voice asset release terms",
              cachePath: "models/voices-v1.0.bin",
            },
          ],
          artifacts: {
            outputTypes: input.outputArtifactTypes ?? ["WAV"],
            policy: "write generated WAV files to the --output path and return JSON artifact metadata",
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
        `name: ${name}`,
        `description: ${description}`,
        "---",
        "",
        "Use this capability when Ambient core voice dispatch or the user needs local Kokoro ONNX text-to-speech.",
        "",
        `Command contract: run \`${commandName}\` through \`ambient_cli\` with \`--text <text>\`, \`--output <path.wav>\`, \`--format wav\`, and optional \`--voice af_sarah\`.`,
        "The wrapper uses `uv run --with kokoro-onnx --with soundfile python ./scripts/synthesize.py` and expects the declared model assets under `models/`.",
        "Before install or repair, preview dependency/model downloads for user approval. Do not fall back to the heavier MLX/Kokoro path unless explicitly approved.",
        "Keep stdout to JSON metadata: `audioPath`, `mimeType`, and optional `voiceId`. Put audio in the requested output path.",
        "",
      ].join("\n"),
    },
    {
      path: "scripts/run.mjs",
      content: kokoroOnnxVoiceProviderRunScript(),
    },
    {
      path: "scripts/synthesize.py",
      content: kokoroOnnxVoiceProviderPythonScript(),
    },
    {
      path: "tests/smoke.test.mjs",
      content: kokoroOnnxVoiceProviderSmokeTest(),
    },
  ];
}

function kokoroOnnxVoiceProviderRunScript(): string {
  return [
    "#!/usr/bin/env node",
    "import { existsSync } from 'node:fs';",
    "import { mkdirSync } from 'node:fs';",
    "import { dirname, resolve } from 'node:path';",
    "import { spawnSync } from 'node:child_process';",
    "",
    "const args = process.argv.slice(2);",
    "const model = resolve('models/kokoro-v1.0.int8.onnx');",
    "const voices = resolve('models/voices-v1.0.bin');",
    "",
    "function checkAssets() {",
    "  if (!existsSync(model) || !existsSync(voices)) {",
    "    console.error('Missing Kokoro ONNX model assets. Download the descriptor modelAssets into ./models before running synthesis.');",
    "    process.exit(3);",
    "  }",
    "}",
    "",
    "if (args.includes('--health')) {",
    "  checkAssets();",
    "  const uv = spawnSync('uv', ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });",
    "  if (uv.error || uv.status !== 0) {",
    "    process.stderr.write(uv.stderr || uv.stdout || uv.error?.message || 'uv unavailable for Kokoro ONNX TTS. Install uv or provide a pinned Python environment.\\n');",
    "    process.exit(4);",
    "  }",
    "  process.stdout.write(JSON.stringify({ ok: true, provider: 'kokoro-onnx', contract: '--text --output --format wav' }) + '\\n');",
    "  process.exit(0);",
    "}",
    "",
    "function arg(name) {",
    "  const index = args.indexOf(name);",
    "  return index >= 0 ? args[index + 1] : undefined;",
    "}",
    "",
    "const text = arg('--text');",
    "const output = arg('--output');",
    "const format = arg('--format') || 'wav';",
    "const voice = arg('--voice') || 'af_sarah';",
    "if (!text || !output) {",
    "  console.error('Usage: --text <text> --output <path.wav> --format wav [--voice af_sarah]');",
    "  process.exit(2);",
    "}",
    "if (format !== 'wav') {",
    "  console.error('Kokoro ONNX wrapper currently supports only wav output.');",
    "  process.exit(2);",
    "}",
    "",
    "checkAssets();",
    "",
    "const absoluteOutput = resolve(output);",
    "mkdirSync(dirname(absoluteOutput), { recursive: true });",
    "const result = spawnSync('uv', ['run', '--with', 'kokoro-onnx', '--with', 'soundfile', 'python', './scripts/synthesize.py', model, voices, text, absoluteOutput, voice], {",
    "  encoding: 'utf8',",
    "  stdio: ['ignore', 'pipe', 'pipe'],",
    "});",
    "if (result.status !== 0) {",
    "  process.stderr.write(result.stderr || result.stdout || `kokoro-onnx exited with ${result.status}\\n`);",
    "  process.exit(result.status || 1);",
    "}",
    "process.stdout.write(JSON.stringify({ audioPath: absoluteOutput, mimeType: 'audio/wav', voiceId: voice }) + '\\n');",
    "",
  ].join("\n");
}

function kokoroOnnxVoiceProviderPythonScript(): string {
  return [
    "import sys",
    "import soundfile as sf",
    "from kokoro_onnx import Kokoro",
    "",
    "model_path, voices_path, text, output_path, voice = sys.argv[1:6]",
    "kokoro = Kokoro(model_path, voices_path)",
    "samples, sample_rate = kokoro.create(text, voice=voice, speed=1.0, lang='en-us')",
    "sf.write(output_path, samples, sample_rate)",
    "",
  ].join("\n");
}

function kokoroOnnxVoiceProviderSmokeTest(): string {
  return [
    "import { strict as assert } from 'node:assert';",
    "import { spawnSync } from 'node:child_process';",
    "import { existsSync } from 'node:fs';",
    "",
    "const healthMissing = spawnSync(process.execPath, ['./scripts/run.mjs', '--health'], { encoding: 'utf8' });",
    "if (healthMissing.status === 3) {",
    "  assert.match(healthMissing.stderr, /Missing Kokoro ONNX model assets/);",
    "  process.exit(0);",
    "}",
    "assert.equal(healthMissing.status, 0, healthMissing.stderr);",
    "",
    "const output = 'ambient-kokoro-onnx-smoke.wav';",
    "const result = spawnSync(process.execPath, ['./scripts/run.mjs', '--text', 'Ambient Kokoro ONNX smoke.', '--output', output, '--format', 'wav'], { encoding: 'utf8' });",
    "assert.equal(result.status, 0, result.stderr);",
    "assert.match(result.stdout, /audio\\/wav/);",
    "assert.equal(existsSync(output), true);",
    "",
  ].join("\n");
}


export function buildManifest(name: string, input: CapabilityBuilderScaffoldInput, gitSha: string | undefined): Record<string, unknown> {
  return {
    schemaVersion: "ambient-capability-builder-v1",
    name,
    version: "0.1.0",
    goal: input.goal,
    installerShape: normalizedInstallerShape(input),
    kind: input.kind,
    provider: input.provider,
    outputArtifactTypes: input.outputArtifactTypes ?? [],
    responseFormats: input.responseFormats ?? [],
    locality: input.locality ?? "either",
    createdAt: new Date().toISOString(),
    gitSha,
    status: "draft",
    refs: {
      latest: gitSha,
      installed: null,
      lastValidated: null,
    },
  };
}


function commandNameFromPackage(name: string): string {
  return name.replace(/^ambient-/, "").replace(/-+/g, "_") || "run";
}

function normalizeVoiceOutputFormat(format: string): "mp3" | "wav" | "ogg" | undefined {
  const normalized = format.trim().replace(/^\./, "").toLowerCase();
  if (normalized === "mp3" || normalized === "wav" || normalized === "ogg") return normalized;
  return undefined;
}
