#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_COMMAND_TEXT = "switch project Manual Relay Smoke";
const DEFAULT_DIRECTORY_QUERY = "";
const DEFAULT_DIRECTORY_LIMIT = "1";
const DEFAULT_SEED_DIRECTORY_LIMIT = "50";
const DEFAULT_POLL_LIMIT = "24";
const DEFAULT_GUIDED_WAIT_SECONDS = "180";
const DEFAULT_GUIDED_POLL_INTERVAL_MS = "5000";
const DEFAULT_AMBIENT_AGENT_ROOT = "/path/to/user/ambientAgent";
const TEST_ARGS = [
  "exec",
  "vitest",
  "run",
  "src/main/agent-runtime/agentRuntime.test.ts",
  "-t",
  "manual real Telegram owner loop smoke",
];
const DIRECTORY_LIST_TEST_ARGS = [
  "exec",
  "vitest",
  "run",
  "src/main/agent-runtime/agentRuntime.test.ts",
  "-t",
  "manual real Telegram metadata-only directory list smoke",
];
const OWNER_HANDOFF_CHECK_TEST_ARGS = [
  "exec",
  "vitest",
  "run",
  "src/main/agent-runtime/agentRuntime.test.ts",
  "-t",
  "manual real Telegram owner handoff check smoke",
];
const GUIDED_OWNER_LOOP_TEST_ARGS = [
  "exec",
  "vitest",
  "run",
  "src/main/agent-runtime/agentRuntime.test.ts",
  "-t",
  "manual guided Telegram owner loop smoke",
];
const DEFAULT_REBUILD_PYTHON = "/opt/homebrew/bin/python3.12";

const USAGE = `Manual Telegram owner-loop smoke runner

Usage:
  node scripts/manual-telegram-owner-loop-smoke.mjs [options]
  node scripts/manual-telegram-owner-loop-smoke.mjs --run --profile <id> --state-root <path> --conversation <id> --setup-code <code>
  node scripts/manual-telegram-owner-loop-smoke.mjs --guided-run --profile <id> --state-root <path> --conversation <id>
  node scripts/manual-telegram-owner-loop-smoke.mjs --guided-polling-run --profile <id> --state-root <path> --conversation <id>
  node scripts/manual-telegram-owner-loop-smoke.mjs --prepare-guided --profile <id> --state-root <path> --conversation <id>

Options:
  --list-conversations        Run the real metadata-only Telegram directory picker and print safe conversation ids.
  --check-handoff             Run the real owner-handoff preflight against one conversation.
  --prepare-guided            Write the guided owner-loop operator packet without polling Telegram.
  --guided-run                Execute the live smoke while waiting for inbound setup-code and command messages.
  --guided-polling-run        Execute the guided live smoke using the periodic polling runner for command ingestion.
  --run                       Execute the live Vitest smoke. Without this, only prints the checklist.
  --seed-owner-messages       Dogfood helper: send setup+command from a separate owner/delegate profile before the run.
  --profile, --profile-id     Telegram profile id to use.
  --state-root                Telegram state root that contains <profile>/bridge-session.json.
  --conversation, --conversation-id
                              Real Telegram conversation id to poll.
  --seed-profile              Separate owner/delegate Telegram profile id used only by --seed-owner-messages.
  --seed-conversation         Conversation id as seen from --seed-profile.
  --expect-seed-phone-last4   Optional redacted owner/delegate account guard for --seed-profile.
  --seed-directory-query      Optional metadata-only directory query for validating --seed-conversation.
  --seed-directory-limit      Metadata-only seed directory limit. Default: 50.
  --setup-code                One-time setup code you already sent from the owner account.
  --command, --command-text   Owner command text to send after setup. Default: switch project Manual Relay Smoke.
  --command-not-before        Optional ISO timestamp freshness anchor for command polling.
  --send-reply                Send the reviewed provider-neutral relay reply after preview. Default: preview only.
  --directory-query           Gateway directory query. Default: no filter.
  --directory-limit           Gateway directory limit. Default: 1.
  --poll-limit                Poll attempts for owner-loop reply. Default: 24.
  --wait-seconds              Max guided-run wait for each inbound step. Default: 180.
  --poll-interval-ms          Guided-run interval between bounded unread checks. Default: 5000.
  --env-file                  Optional ignored local env file with AMBIENT_AGENT_TELEGRAM_* values.
  --ambient-agent-root        Ambient Agent repo root for telegram_api_id.txt, telegram_api_hash.txt, and auth state.
  --scan-root                 Extra root to scan for bridge-session.json. Repeatable.
  --expect-phone-last4        Optional redacted bridge-account guard. Blocks if the selected profile phone does not end with these 4 digits.
  --output-dir                Directory for redacted smoke JSON reports. Default: temp directory per run.
  --print-env                 Print the redacted env shape that would be passed to Vitest.
  --help                      Show this help.

Required process env for --run or --list-conversations:
  AMBIENT_AGENT_TELEGRAM_API_ID
  AMBIENT_AGENT_TELEGRAM_API_HASH

Before --run:
  1. Confirm the selected profile is logged in and points at the real Telegram account.
  2. Send the setup code from an inbound owner/delegate account in the target conversation.
  3. Send the command text in the same conversation after the setup code.

Note:
  Telegram bridge unread polling intentionally ignores messages outgoing from the bridge account.
  A same-account Telegram Desktop/Saved Messages send can validate bridge health, but it will not
  produce a matched owner handoff or command dispatch.

For --guided-run:
  Start the script first, then send the printed setup code from an inbound owner/delegate account.
  After the script reports a matched handoff, send the printed command text in the same conversation.
  Alternatively pass --seed-owner-messages with --seed-profile and --seed-conversation to send those
  two owner/delegate messages through the reviewed local Telegram bridge before the guided run starts.
`;

const ARG_ALIASES = {
  "profile-id": "profile",
  conversation: "conversationId",
  "conversation-id": "conversationId",
  command: "commandText",
  "command-text": "commandText",
  "command-not-before": "commandNotBefore",
  "setup-code": "setupCode",
  "state-root": "stateRoot",
  "send-reply": "sendReply",
  "seed-owner-messages": "seedOwnerMessages",
  "seed-profile": "seedProfile",
  "seed-profile-id": "seedProfile",
  "seed-conversation": "seedConversationId",
  "seed-conversation-id": "seedConversationId",
  "expect-seed-phone-last4": "expectSeedPhoneLast4",
  "seed-directory-query": "seedDirectoryQuery",
  "seed-directory-limit": "seedDirectoryLimit",
  "directory-query": "directoryQuery",
  "directory-limit": "directoryLimit",
  "poll-limit": "pollLimit",
  "wait-seconds": "waitSeconds",
  "poll-interval-ms": "pollIntervalMs",
  "env-file": "envFile",
  "ambient-agent-root": "ambientAgentRoot",
  "expect-phone-last4": "expectPhoneLast4",
  "scan-root": "scanRoots",
  "output-dir": "outputDir",
  "list-conversations": "listConversations",
  "check-handoff": "checkHandoff",
  "prepare-guided": "prepareGuided",
  "guided-run": "guidedRun",
  "guided-polling-run": "guidedPollingRun",
  run: "run",
  "print-env": "printEnv",
  help: "help",
};

export function parseArgs(argv) {
  const options = { scanRoots: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected positional argument: ${token}`);
    }
    const raw = token.slice(2);
    const [rawKey, inlineValue] = raw.split(/=(.*)/s, 2);
    const key = ARG_ALIASES[rawKey] ?? rawKey;
    if (key === "run" || key === "listConversations" || key === "checkHandoff" || key === "prepareGuided" || key === "guidedRun" || key === "guidedPollingRun" || key === "printEnv" || key === "sendReply" || key === "seedOwnerMessages" || key === "help") {
      options[key] = true;
      continue;
    }
    const next = inlineValue ?? argv[index + 1];
    if (!next || next.startsWith("--")) {
      throw new Error(`Missing value for --${rawKey}`);
    }
    if (inlineValue === undefined) {
      index += 1;
    }
    if (key === "scanRoots") {
      options.scanRoots.push(next);
    } else {
      options[key] = next;
    }
  }
  return options;
}

export function generateSetupCode(now = Date.now()) {
  return `AMBIENT-OWNER-LOOP-${now}-${randomBytes(3).toString("hex")}`;
}

export function loadTelegramEnvFile(envFile, env = process.env) {
  if (!envFile) {
    return { env: { ...env }, loaded: false, path: undefined, keys: [] };
  }
  const path = resolve(envFile);
  if (!existsSync(path)) {
    throw new Error(`Telegram env file not found: ${path}`);
  }
  const raw = readFileSync(path, "utf8");
  const loadedEnv = { ...env };
  const keys = [];
  for (const [lineNumber, rawLine] of raw.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) {
      throw new Error(`Invalid env-file line ${lineNumber + 1}: expected KEY=value.`);
    }
    const key = match[1];
    if (!isAllowedTelegramEnvFileKey(key)) {
      throw new Error(`Invalid env-file line ${lineNumber + 1}: ${key} is not an allowed Telegram smoke key.`);
    }
    loadedEnv[key] = unquoteEnvValue(match[2].trim());
    keys.push(key);
  }
  return {
    env: loadedEnv,
    loaded: true,
    path,
    keys: [...new Set(keys)].sort(),
  };
}

export function redactedEnvFileSummary(envFileResult) {
  if (!envFileResult.loaded) {
    return "Env file: not supplied";
  }
  return [
    `Env file: ${envFileResult.path}`,
    `Loaded keys: ${envFileResult.keys.length ? envFileResult.keys.join(", ") : "none"}`,
  ].join("\n");
}

export function loadAmbientAgentTelegramSecretFiles({
  ambientAgentRoot,
  env = process.env,
} = {}) {
  const root = resolve(ambientAgentRoot ?? env.AMBIENT_AGENT_ROOT ?? DEFAULT_AMBIENT_AGENT_ROOT);
  const loadedEnv = { ...env, AMBIENT_AGENT_ROOT: env.AMBIENT_AGENT_ROOT ?? root };
  const files = [
    {
      key: "AMBIENT_AGENT_TELEGRAM_API_ID",
      path: join(root, "telegram_api_id.txt"),
    },
    {
      key: "AMBIENT_AGENT_TELEGRAM_API_HASH",
      path: join(root, "telegram_api_hash.txt"),
    },
  ];
  const loadedKeys = [];
  const missingFiles = [];
  for (const file of files) {
    if (loadedEnv[file.key]?.trim()) {
      continue;
    }
    if (!existsSync(file.path)) {
      missingFiles.push(file.path);
      continue;
    }
    const value = readFileSync(file.path, "utf8").trim();
    if (!value) {
      missingFiles.push(file.path);
      continue;
    }
    loadedEnv[file.key] = value;
    loadedKeys.push(file.key);
  }
  return {
    env: loadedEnv,
    root,
    loaded: loadedKeys.length > 0,
    loadedKeys,
    missingFiles,
  };
}

export function redactedAmbientAgentSecretSummary(secretResult) {
  const lines = [`Ambient Agent root: ${secretResult.root}`];
  if (secretResult.loadedKeys.length) {
    lines.push(`Loaded Ambient Agent secret keys: ${secretResult.loadedKeys.join(", ")}`);
  } else {
    lines.push("Loaded Ambient Agent secret keys: none");
  }
  if (secretResult.missingFiles.length) {
    lines.push(`Missing Ambient Agent secret files: ${secretResult.missingFiles.join(", ")}`);
  }
  return lines.join("\n");
}

export function candidateStateRoots({
  cwd = process.cwd(),
  env = process.env,
  scanRoots = [],
} = {}) {
  const roots = [
    env.AMBIENT_MANUAL_TELEGRAM_STATE_ROOT,
    env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT,
    join(env.AMBIENT_AGENT_ROOT ?? DEFAULT_AMBIENT_AGENT_ROOT, ".ambient-agent-state", "telegram"),
    join(cwd, ".ambient-agent-state", "telegram"),
    join(cwd, ".ambient-codex", "telegram"),
    join(
      homedir(),
      "Library",
      "Application Support",
      "Ambient Desktop",
      "workspace",
      ".ambient-agent-state",
      "telegram",
    ),
    join(
      homedir(),
      "Library",
      "Application Support",
      "ambient-codex-desktop",
      "workspace",
      ".ambient-agent-state",
      "telegram",
    ),
    ...scanRoots,
  ].filter(Boolean);

  return [...new Set(roots.map((root) => resolve(root)))];
}

export function redactSessionMetadata(metadataPath) {
  const raw = readFileSync(metadataPath, "utf8");
  const parsed = JSON.parse(raw);
  const stateRoot = dirname(dirname(metadataPath));
  const phoneNumber = typeof parsed.phoneNumber === "string" ? parsed.phoneNumber.trim() : "";
  return {
    profileId: parsed.profileId ?? dirname(metadataPath).split("/").at(-1),
    metadataPath,
    stateRoot,
    hasPhoneNumber: phoneNumber.length > 0,
    phoneLast4: phoneNumber.length >= 4 ? phoneNumber.slice(-4) : undefined,
    hasDatabaseEncryptionKey:
      typeof parsed.databaseEncryptionKey === "string" &&
      parsed.databaseEncryptionKey.length > 0,
    authState: parsed.authState ?? null,
    createdAt: parsed.createdAt ?? null,
    updatedAt: parsed.updatedAt ?? null,
  };
}

export function findBridgeSessionCandidates({
  cwd = process.cwd(),
  env = process.env,
  stateRoot,
  scanRoots = [],
  maxDepth = 5,
} = {}) {
  const roots = stateRoot
    ? [resolve(stateRoot), ...scanRoots.map((root) => resolve(root))]
    : candidateStateRoots({ cwd, env, scanRoots });
  const candidates = [];
  const seen = new Set();

  function walk(directory, depth) {
    if (depth < 0 || !existsSync(directory)) {
      return;
    }
    let entries;
    try {
      entries = readdirSync(directory);
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(directory, entry);
      let stats;
      try {
        stats = statSync(path);
      } catch {
        continue;
      }
      if (stats.isDirectory()) {
        walk(path, depth - 1);
        continue;
      }
      if (!stats.isFile() || entry !== "bridge-session.json" || seen.has(path)) {
        continue;
      }
      seen.add(path);
      try {
        candidates.push(redactSessionMetadata(path));
      } catch (error) {
        candidates.push({
          metadataPath: path,
          stateRoot: dirname(dirname(path)),
          parseError: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  for (const root of roots) {
    walk(root, maxDepth);
  }
  return candidates;
}

export function resolveDirectoryListConfig({
  options,
  candidates,
  env = process.env,
} = {}) {
  const selectedCandidate =
    options.profile || options.stateRoot || candidates.length !== 1
      ? candidates.find((candidate) => {
          const profileMatches =
            !options.profile || candidate.profileId === options.profile;
          const stateRootMatches =
            !options.stateRoot || resolve(candidate.stateRoot) === resolve(options.stateRoot);
          return profileMatches && stateRootMatches;
        })
      : candidates[0];

  const config = {
    profile: options.profile ?? selectedCandidate?.profileId,
    stateRoot: options.stateRoot ?? selectedCandidate?.stateRoot,
    profilePhoneLast4: selectedCandidate?.phoneLast4,
    expectPhoneLast4: normalizePhoneLast4(options.expectPhoneLast4),
    conversationId: options.conversationId,
    directoryQuery: options.directoryQuery ?? DEFAULT_DIRECTORY_QUERY,
    directoryLimit: options.directoryLimit ?? "10",
    outputDir: options.outputDir,
  };

  const missing = [];
  if (!config.profile) {
    missing.push("Telegram profile id");
  }
  if (!config.stateRoot) {
    missing.push("Telegram state root");
  }
  if (!env.AMBIENT_AGENT_TELEGRAM_API_ID) {
    missing.push("AMBIENT_AGENT_TELEGRAM_API_ID");
  }
  if (!env.AMBIENT_AGENT_TELEGRAM_API_HASH) {
    missing.push("AMBIENT_AGENT_TELEGRAM_API_HASH");
  }
  addProfileMarkerMismatch(missing, selectedCandidate, config.expectPhoneLast4);

  return { config, missing };
}

export function resolveSmokeConfig({
  options,
  candidates,
  env = process.env,
  now = Date.now(),
} = {}) {
  const setupCode = options.setupCode ?? generateSetupCode(now);
  const selectedCandidate =
    options.profile || options.stateRoot || candidates.length !== 1
      ? candidates.find((candidate) => {
          const profileMatches =
            !options.profile || candidate.profileId === options.profile;
          const stateRootMatches =
            !options.stateRoot || resolve(candidate.stateRoot) === resolve(options.stateRoot);
          return profileMatches && stateRootMatches;
        })
      : candidates[0];

  const config = {
    profile: options.profile ?? selectedCandidate?.profileId,
    stateRoot: options.stateRoot ?? selectedCandidate?.stateRoot,
    profilePhoneLast4: selectedCandidate?.phoneLast4,
    expectPhoneLast4: normalizePhoneLast4(options.expectPhoneLast4),
    seedOwnerMessages: options.seedOwnerMessages === true,
    seedProfile: options.seedProfile,
    seedConversationId: options.seedConversationId,
    seedProfilePhoneLast4: candidates.find((candidate) => candidate.profileId === options.seedProfile)?.phoneLast4,
    expectSeedPhoneLast4: normalizePhoneLast4(options.expectSeedPhoneLast4),
    seedDirectoryQuery: options.seedDirectoryQuery ?? "",
    seedDirectoryLimit: options.seedDirectoryLimit ?? DEFAULT_SEED_DIRECTORY_LIMIT,
    conversationId: options.conversationId,
    setupCode,
    commandText: options.commandText ?? DEFAULT_COMMAND_TEXT,
    commandNotBefore: normalizeOptionalIsoTimestamp(options.commandNotBefore, "--command-not-before must be an ISO timestamp."),
    sendReply: options.sendReply === true,
    outputDir: options.outputDir,
    directoryQuery: options.directoryQuery ?? DEFAULT_DIRECTORY_QUERY,
    directoryLimit: options.directoryLimit ?? DEFAULT_DIRECTORY_LIMIT,
    pollLimit: options.pollLimit ?? DEFAULT_POLL_LIMIT,
    setupCodeWasGenerated: !options.setupCode,
  };

  const missing = [];
  if (!config.profile) {
    missing.push("Telegram profile id");
  }
  if (!config.stateRoot) {
    missing.push("Telegram state root");
  }
  if (!config.conversationId) {
    missing.push("Telegram conversation id");
  }
  if (!options.setupCode) {
    missing.push("sent setup code confirmation");
  }
  if (!env.AMBIENT_AGENT_TELEGRAM_API_ID) {
    missing.push("AMBIENT_AGENT_TELEGRAM_API_ID");
  }
  if (!env.AMBIENT_AGENT_TELEGRAM_API_HASH) {
    missing.push("AMBIENT_AGENT_TELEGRAM_API_HASH");
  }
  addProfileMarkerMismatch(missing, selectedCandidate, config.expectPhoneLast4);
  addSeedOwnerMessagesMissing(missing, config, candidates);

  return { config, missing };
}

export function resolveOwnerMessageSeedConfig({
  options,
  candidates,
  env = process.env,
  now = Date.now(),
} = {}) {
  const setupCode = options.setupCode ?? generateSetupCode(now);
  const seedCandidate = candidates.find((candidate) => candidate.profileId === options.seedProfile);
  const bridgeCandidate = options.profile
    ? candidates.find((candidate) => candidate.profileId === options.profile)
    : undefined;
  const config = {
    profile: options.profile ?? bridgeCandidate?.profileId,
    profilePhoneLast4: bridgeCandidate?.phoneLast4,
    expectPhoneLast4: normalizePhoneLast4(options.expectPhoneLast4),
    seedOwnerMessages: true,
    seedProfile: options.seedProfile,
    seedConversationId: options.seedConversationId,
    seedProfilePhoneLast4: seedCandidate?.phoneLast4,
    expectSeedPhoneLast4: normalizePhoneLast4(options.expectSeedPhoneLast4),
    seedDirectoryQuery: options.seedDirectoryQuery ?? "",
    seedDirectoryLimit: options.seedDirectoryLimit ?? DEFAULT_SEED_DIRECTORY_LIMIT,
    setupCode,
    commandText: options.commandText ?? DEFAULT_COMMAND_TEXT,
    commandNotBefore: normalizeOptionalIsoTimestamp(options.commandNotBefore, "--command-not-before must be an ISO timestamp."),
    outputDir: options.outputDir,
    setupCodeWasGenerated: !options.setupCode,
  };

  const missing = [];
  if (!env.AMBIENT_AGENT_TELEGRAM_API_ID) {
    missing.push("AMBIENT_AGENT_TELEGRAM_API_ID");
  }
  if (!env.AMBIENT_AGENT_TELEGRAM_API_HASH) {
    missing.push("AMBIENT_AGENT_TELEGRAM_API_HASH");
  }
  addProfileMarkerMismatch(missing, bridgeCandidate, config.expectPhoneLast4);
  addSeedOwnerMessagesMissing(missing, config, candidates);

  return { config, missing };
}

export function resolveOwnerHandoffCheckConfig({
  options,
  candidates,
  env = process.env,
  now = Date.now(),
} = {}) {
  const setupCode = options.setupCode ?? generateSetupCode(now);
  const selectedCandidate =
    options.profile || options.stateRoot || candidates.length !== 1
      ? candidates.find((candidate) => {
          const profileMatches =
            !options.profile || candidate.profileId === options.profile;
          const stateRootMatches =
            !options.stateRoot || resolve(candidate.stateRoot) === resolve(options.stateRoot);
          return profileMatches && stateRootMatches;
        })
      : candidates[0];

  const config = {
    profile: options.profile ?? selectedCandidate?.profileId,
    stateRoot: options.stateRoot ?? selectedCandidate?.stateRoot,
    profilePhoneLast4: selectedCandidate?.phoneLast4,
    expectPhoneLast4: normalizePhoneLast4(options.expectPhoneLast4),
    conversationId: options.conversationId,
    setupCode,
    pollLimit: options.pollLimit ?? DEFAULT_POLL_LIMIT,
    setupCodeWasGenerated: !options.setupCode,
  };

  const missing = [];
  if (!config.profile) {
    missing.push("Telegram profile id");
  }
  if (!config.stateRoot) {
    missing.push("Telegram state root");
  }
  if (!config.conversationId) {
    missing.push("Telegram conversation id");
  }
  if (!env.AMBIENT_AGENT_TELEGRAM_API_ID) {
    missing.push("AMBIENT_AGENT_TELEGRAM_API_ID");
  }
  if (!env.AMBIENT_AGENT_TELEGRAM_API_HASH) {
    missing.push("AMBIENT_AGENT_TELEGRAM_API_HASH");
  }
  addProfileMarkerMismatch(missing, selectedCandidate, config.expectPhoneLast4);

  return { config, missing };
}

export function resolveGuidedSmokeConfig({
  options,
  candidates,
  env = process.env,
  now = Date.now(),
} = {}) {
  const setupCode = options.setupCode ?? generateSetupCode(now);
  const selectedCandidate =
    options.profile || options.stateRoot || candidates.length !== 1
      ? candidates.find((candidate) => {
          const profileMatches =
            !options.profile || candidate.profileId === options.profile;
          const stateRootMatches =
            !options.stateRoot || resolve(candidate.stateRoot) === resolve(options.stateRoot);
          return profileMatches && stateRootMatches;
        })
      : candidates[0];

  const config = {
    profile: options.profile ?? selectedCandidate?.profileId,
    stateRoot: options.stateRoot ?? selectedCandidate?.stateRoot,
    profilePhoneLast4: selectedCandidate?.phoneLast4,
    expectPhoneLast4: normalizePhoneLast4(options.expectPhoneLast4),
    seedOwnerMessages: options.seedOwnerMessages === true,
    seedProfile: options.seedProfile,
    seedConversationId: options.seedConversationId,
    seedProfilePhoneLast4: candidates.find((candidate) => candidate.profileId === options.seedProfile)?.phoneLast4,
    expectSeedPhoneLast4: normalizePhoneLast4(options.expectSeedPhoneLast4),
    seedDirectoryQuery: options.seedDirectoryQuery ?? "",
    seedDirectoryLimit: options.seedDirectoryLimit ?? DEFAULT_SEED_DIRECTORY_LIMIT,
    conversationId: options.conversationId,
    setupCode,
    commandText: options.commandText ?? DEFAULT_COMMAND_TEXT,
    commandNotBefore: normalizeOptionalIsoTimestamp(options.commandNotBefore, "--command-not-before must be an ISO timestamp."),
    sendReply: options.sendReply === true,
    usePollingRunner: options.guidedPollingRun === true,
    outputDir: options.outputDir,
    directoryQuery: options.directoryQuery ?? DEFAULT_DIRECTORY_QUERY,
    directoryLimit: options.directoryLimit ?? DEFAULT_DIRECTORY_LIMIT,
    pollLimit: options.pollLimit ?? DEFAULT_POLL_LIMIT,
    waitSeconds: options.waitSeconds ?? DEFAULT_GUIDED_WAIT_SECONDS,
    pollIntervalMs: options.pollIntervalMs ?? DEFAULT_GUIDED_POLL_INTERVAL_MS,
    setupCodeWasGenerated: !options.setupCode,
  };

  const missing = [];
  if (!config.profile) {
    missing.push("Telegram profile id");
  }
  if (!config.stateRoot) {
    missing.push("Telegram state root");
  }
  if (!config.conversationId) {
    missing.push("Telegram conversation id");
  }
  if (!env.AMBIENT_AGENT_TELEGRAM_API_ID) {
    missing.push("AMBIENT_AGENT_TELEGRAM_API_ID");
  }
  if (!env.AMBIENT_AGENT_TELEGRAM_API_HASH) {
    missing.push("AMBIENT_AGENT_TELEGRAM_API_HASH");
  }
  addProfileMarkerMismatch(missing, selectedCandidate, config.expectPhoneLast4);
  addSeedOwnerMessagesMissing(missing, config, candidates);

  return { config, missing };
}

function normalizePhoneLast4(value) {
  if (typeof value !== "string") return undefined;
  const digits = value.replace(/\D/g, "");
  return digits ? digits.slice(-4) : undefined;
}

function normalizeOptionalIsoTimestamp(value, message) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = new Date(value.trim());
  if (Number.isNaN(parsed.getTime())) throw new Error(message);
  return parsed.toISOString();
}

function addProfileMarkerMismatch(missing, selectedCandidate, expectPhoneLast4) {
  if (!expectPhoneLast4) return;
  if (!selectedCandidate) return;
  if (!selectedCandidate.phoneLast4) {
    missing.push(`selected Telegram profile phone marker is unavailable; expected ending ${expectPhoneLast4}`);
    return;
  }
  if (selectedCandidate.phoneLast4 !== expectPhoneLast4) {
    missing.push(`selected Telegram profile phone marker ends ${selectedCandidate.phoneLast4}, expected ${expectPhoneLast4}`);
  }
}

function addSeedOwnerMessagesMissing(missing, config, candidates) {
  if (!config.seedOwnerMessages) return;
  const seedCandidate = candidates.find((candidate) => candidate.profileId === config.seedProfile);
  if (!config.seedProfile) {
    missing.push("seed Telegram profile id");
  }
  if (!config.seedConversationId) {
    missing.push("seed Telegram conversation id");
  }
  if (config.profile && config.seedProfile && config.profile === config.seedProfile) {
    missing.push("seed profile must be a separate inbound owner/delegate account, not the bridge profile");
  }
  if (config.expectSeedPhoneLast4) {
    if (!seedCandidate) {
      missing.push(`seed Telegram profile was not discovered; expected phone marker ending ${config.expectSeedPhoneLast4}`);
    } else if (!seedCandidate.phoneLast4) {
      missing.push(`seed Telegram profile phone marker is unavailable; expected ending ${config.expectSeedPhoneLast4}`);
    } else if (seedCandidate.phoneLast4 !== config.expectSeedPhoneLast4) {
      missing.push(`seed Telegram profile phone marker ends ${seedCandidate.phoneLast4}, expected ${config.expectSeedPhoneLast4}`);
    }
  }
}

export function buildDirectoryListEnv(config, env = process.env) {
  return {
    ...env,
    AMBIENT_TEST_NATIVE: "1",
    AMBIENT_MANUAL_TELEGRAM_DIRECTORY_LIST_SMOKE: "1",
    AMBIENT_MANUAL_TELEGRAM_PROFILE_ID: config.profile,
    AMBIENT_MANUAL_TELEGRAM_STATE_ROOT: config.stateRoot,
    AMBIENT_MANUAL_TELEGRAM_DIRECTORY_QUERY: config.directoryQuery,
    AMBIENT_MANUAL_TELEGRAM_DIRECTORY_LIMIT: config.directoryLimit,
    ...(config.directoryOutputPath
      ? { AMBIENT_MANUAL_TELEGRAM_DIRECTORY_OUTPUT_PATH: config.directoryOutputPath }
      : {}),
  };
}

export function buildOwnerHandoffCheckEnv(config, env = process.env) {
  return {
    ...env,
    AMBIENT_TEST_NATIVE: "1",
    AMBIENT_MANUAL_TELEGRAM_OWNER_HANDOFF_CHECK_SMOKE: "1",
    AMBIENT_MANUAL_TELEGRAM_PROFILE_ID: config.profile,
    AMBIENT_MANUAL_TELEGRAM_STATE_ROOT: config.stateRoot,
    AMBIENT_MANUAL_TELEGRAM_CONVERSATION_ID: config.conversationId,
    AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SETUP_CODE: config.setupCode,
    AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_POLL_LIMIT: config.pollLimit,
  };
}

export function buildSmokeEnv(config, env = process.env) {
  return {
    ...env,
    AMBIENT_TEST_NATIVE: "1",
    AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SMOKE: "1",
    AMBIENT_MANUAL_TELEGRAM_PROFILE_ID: config.profile,
    AMBIENT_MANUAL_TELEGRAM_STATE_ROOT: config.stateRoot,
    AMBIENT_MANUAL_TELEGRAM_CONVERSATION_ID: config.conversationId,
    AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SETUP_CODE: config.setupCode,
    AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_COMMAND_TEXT: config.commandText,
    ...(config.commandNotBefore
      ? { AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_COMMAND_NOT_BEFORE: config.commandNotBefore }
      : {}),
    AMBIENT_MANUAL_TELEGRAM_DIRECTORY_QUERY: config.directoryQuery,
    AMBIENT_MANUAL_TELEGRAM_DIRECTORY_LIMIT: config.directoryLimit,
    AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_POLL_LIMIT: config.pollLimit,
    ...(config.ownerLoopOutputPath
      ? { AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_OUTPUT_PATH: config.ownerLoopOutputPath }
      : {}),
    ...(config.sendReply
      ? { AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SEND_REPLY: "1" }
      : {}),
  };
}

export function buildGuidedSmokeEnv(config, env = process.env) {
  const smokeEnv = buildSmokeEnv(config, env);
  delete smokeEnv.AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SMOKE;
  return {
    ...smokeEnv,
    AMBIENT_MANUAL_TELEGRAM_GUIDED_OWNER_LOOP_SMOKE: "1",
    AMBIENT_MANUAL_TELEGRAM_GUIDED_OWNER_LOOP_WAIT_SECONDS: config.waitSeconds,
    AMBIENT_MANUAL_TELEGRAM_GUIDED_OWNER_LOOP_POLL_INTERVAL_MS: config.pollIntervalMs,
    ...(config.usePollingRunner
      ? { AMBIENT_MANUAL_TELEGRAM_GUIDED_OWNER_LOOP_POLLING_RUNNER: "1" }
      : {}),
  };
}

export function redactedDirectoryListEnv(config, env = process.env) {
  return {
    AMBIENT_TEST_NATIVE: "1",
    AMBIENT_MANUAL_TELEGRAM_DIRECTORY_LIST_SMOKE: "1",
    AMBIENT_AGENT_TELEGRAM_API_ID: env.AMBIENT_AGENT_TELEGRAM_API_ID
      ? "<present>"
      : "<missing>",
    AMBIENT_AGENT_TELEGRAM_API_HASH: env.AMBIENT_AGENT_TELEGRAM_API_HASH
      ? "<present>"
      : "<missing>",
    AMBIENT_MANUAL_TELEGRAM_PROFILE_ID: config.profile ?? "<missing>",
    AMBIENT_MANUAL_TELEGRAM_STATE_ROOT: config.stateRoot ?? "<missing>",
    AMBIENT_MANUAL_TELEGRAM_DIRECTORY_QUERY: config.directoryQuery,
    AMBIENT_MANUAL_TELEGRAM_DIRECTORY_LIMIT: config.directoryLimit,
    ...(config.directoryOutputPath
      ? { AMBIENT_MANUAL_TELEGRAM_DIRECTORY_OUTPUT_PATH: config.directoryOutputPath }
      : {}),
  };
}

export function redactedOwnerHandoffCheckEnv(config, env = process.env) {
  return {
    AMBIENT_TEST_NATIVE: "1",
    AMBIENT_MANUAL_TELEGRAM_OWNER_HANDOFF_CHECK_SMOKE: "1",
    AMBIENT_AGENT_TELEGRAM_API_ID: env.AMBIENT_AGENT_TELEGRAM_API_ID
      ? "<present>"
      : "<missing>",
    AMBIENT_AGENT_TELEGRAM_API_HASH: env.AMBIENT_AGENT_TELEGRAM_API_HASH
      ? "<present>"
      : "<missing>",
    AMBIENT_MANUAL_TELEGRAM_PROFILE_ID: config.profile ?? "<missing>",
    AMBIENT_MANUAL_TELEGRAM_STATE_ROOT: config.stateRoot ?? "<missing>",
    AMBIENT_MANUAL_TELEGRAM_CONVERSATION_ID: config.conversationId ?? "<missing>",
    AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SETUP_CODE: config.setupCode,
    AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_POLL_LIMIT: config.pollLimit,
  };
}

export function redactedSmokeEnv(config, env = process.env) {
  return {
    AMBIENT_TEST_NATIVE: "1",
    AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SMOKE: "1",
    AMBIENT_AGENT_TELEGRAM_API_ID: env.AMBIENT_AGENT_TELEGRAM_API_ID
      ? "<present>"
      : "<missing>",
    AMBIENT_AGENT_TELEGRAM_API_HASH: env.AMBIENT_AGENT_TELEGRAM_API_HASH
      ? "<present>"
      : "<missing>",
    AMBIENT_MANUAL_TELEGRAM_PROFILE_ID: config.profile ?? "<missing>",
    AMBIENT_MANUAL_TELEGRAM_STATE_ROOT: config.stateRoot ?? "<missing>",
    AMBIENT_MANUAL_TELEGRAM_CONVERSATION_ID: config.conversationId ?? "<missing>",
    AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SETUP_CODE: config.setupCode,
    AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_COMMAND_TEXT: config.commandText,
    ...(config.commandNotBefore
      ? { AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_COMMAND_NOT_BEFORE: config.commandNotBefore }
      : {}),
    AMBIENT_MANUAL_TELEGRAM_DIRECTORY_QUERY: config.directoryQuery,
    AMBIENT_MANUAL_TELEGRAM_DIRECTORY_LIMIT: config.directoryLimit,
    AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_POLL_LIMIT: config.pollLimit,
    ...(config.ownerLoopOutputPath
      ? { AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_OUTPUT_PATH: config.ownerLoopOutputPath }
      : {}),
    ...(config.sendReply
      ? { AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SEND_REPLY: "1" }
      : {}),
  };
}

export function redactedGuidedSmokeEnv(config, env = process.env) {
  const smokeEnv = redactedSmokeEnv(config, env);
  delete smokeEnv.AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SMOKE;
  return {
    ...smokeEnv,
    AMBIENT_MANUAL_TELEGRAM_GUIDED_OWNER_LOOP_SMOKE: "1",
    AMBIENT_MANUAL_TELEGRAM_GUIDED_OWNER_LOOP_WAIT_SECONDS: config.waitSeconds,
    AMBIENT_MANUAL_TELEGRAM_GUIDED_OWNER_LOOP_POLL_INTERVAL_MS: config.pollIntervalMs,
    ...(config.usePollingRunner
      ? { AMBIENT_MANUAL_TELEGRAM_GUIDED_OWNER_LOOP_POLLING_RUNNER: "1" }
      : {}),
  };
}

export function ownerHandoffCheckChecklist({
  candidates,
  config,
  missing,
  env = process.env,
  envFile,
  ambientAgentSecrets,
  printEnv = false,
} = {}) {
  const lines = [];
  lines.push("Manual Telegram owner-handoff preflight");
  lines.push("");
  if (envFile) {
    lines.push(redactedEnvFileSummary(envFile));
    lines.push("");
  }
  if (ambientAgentSecrets) {
    lines.push(redactedAmbientAgentSecretSummary(ambientAgentSecrets));
    lines.push("");
  }
  lines.push("Discovered Telegram sessions:");
  if (candidates.length === 0) {
    lines.push("  - none found in default roots");
  } else {
    for (const candidate of candidates) {
      lines.push(sessionCandidateLine(candidate));
    }
  }
  lines.push("");
  lines.push("Resolved handoff check config:");
  lines.push(`  profile: ${config.profile ?? "<missing>"}`);
  lines.push(...profileMarkerConfigLines(config));
  lines.push(`  stateRoot: ${config.stateRoot ?? "<missing>"}`);
  lines.push(`  conversationId: ${config.conversationId ?? "<missing>"}`);
  lines.push(`  setupCode: ${config.setupCode}`);
  lines.push(`  pollLimit: ${config.pollLimit}`);
  lines.push(
    `  Telegram API credentials: id=${env.AMBIENT_AGENT_TELEGRAM_API_ID ? "present" : "missing"} hash=${env.AMBIENT_AGENT_TELEGRAM_API_HASH ? "present" : "missing"}`,
  );
  lines.push("");
  lines.push("What this does:");
  lines.push("  - starts or attaches the real Telegram bridge through the approved lifecycle path");
  lines.push("  - calls the typed Telegram owner-handoff preview/apply tools for one selected conversation");
  lines.push("  - reads only the bounded unread endpoint, filters the exact setup code internally, and resolves sender profiles only for exact matches");
  lines.push("  - treats no-match as a valid preflight result when no inbound setup-code message is present");
  lines.push("  - does not create bindings, poll owner commands, send replies, read history, or return provider message bodies");
  lines.push("");
  lines.push("Important limitation:");
  lines.push("  - Telegram bridge unread polling intentionally ignores messages outgoing from the bridge account.");
  lines.push("  - For a matched handoff, send the setup code from a separate inbound owner/delegate account in the selected conversation.");
  lines.push("  - Same-account Telegram Desktop or Saved Messages sends can check bridge health, but they will not satisfy owner handoff.");
  lines.push("");
  if (missing.length > 0) {
    lines.push("Missing for --check-handoff:");
    for (const item of missing) {
      lines.push(`  - ${item}`);
    }
    lines.push("");
  }
  lines.push("Preflight command:");
  lines.push(
    [
      "node scripts/manual-telegram-owner-loop-smoke.mjs --check-handoff",
      envFile?.loaded ? `--env-file ${shellQuote(envFile.path)}` : undefined,
      ambientAgentSecrets && ambientAgentSecrets.root !== DEFAULT_AMBIENT_AGENT_ROOT ? `--ambient-agent-root ${shellQuote(ambientAgentSecrets.root)}` : undefined,
      config.expectPhoneLast4 ? `--expect-phone-last4 ${shellQuote(config.expectPhoneLast4)}` : undefined,
      config.profile ? `--profile ${shellQuote(config.profile)}` : "--profile <id>",
      config.stateRoot ? `--state-root ${shellQuote(config.stateRoot)}` : "--state-root <path>",
      config.conversationId
        ? `--conversation ${shellQuote(config.conversationId)}`
        : "--conversation <id>",
      `--setup-code ${shellQuote(config.setupCode)}`,
      `--poll-limit ${shellQuote(config.pollLimit)}`,
    ].filter(Boolean).join(" "),
  );
  if (printEnv) {
    lines.push("");
    lines.push("Redacted env:");
    lines.push(JSON.stringify(redactedOwnerHandoffCheckEnv(config, env), null, 2));
  }
  return `${lines.join("\n")}\n`;
}

export function directoryListChecklist({
  candidates,
  config,
  missing,
  env = process.env,
  envFile,
  ambientAgentSecrets,
  printEnv = false,
} = {}) {
  const lines = [];
  lines.push("Manual Telegram metadata-only directory picker");
  lines.push("");
  if (envFile) {
    lines.push(redactedEnvFileSummary(envFile));
    lines.push("");
  }
  if (ambientAgentSecrets) {
    lines.push(redactedAmbientAgentSecretSummary(ambientAgentSecrets));
    lines.push("");
  }
  lines.push("Discovered Telegram sessions:");
  if (candidates.length === 0) {
    lines.push("  - none found in default roots");
  } else {
    for (const candidate of candidates) {
      lines.push(sessionCandidateLine(candidate));
    }
  }
  lines.push("");
  lines.push("Resolved directory config:");
  lines.push(`  profile: ${config.profile ?? "<missing>"}`);
  lines.push(...profileMarkerConfigLines(config));
  lines.push(`  stateRoot: ${config.stateRoot ?? "<missing>"}`);
  lines.push(`  selectedConversationId: ${config.conversationId ?? "<none>"}`);
  lines.push(`  directoryQuery: ${config.directoryQuery || "<none>"}`);
  lines.push(`  directoryLimit: ${config.directoryLimit}`);
  lines.push(`  outputDir: ${config.outputDir ? resolve(config.outputDir) : "<temp>"}`);
  lines.push(
    `  Telegram API credentials: id=${env.AMBIENT_AGENT_TELEGRAM_API_ID ? "present" : "missing"} hash=${env.AMBIENT_AGENT_TELEGRAM_API_HASH ? "present" : "missing"}`,
  );
  lines.push("");
  lines.push("What this does:");
  lines.push("  - starts or attaches the real Telegram bridge through the approved lifecycle path");
  lines.push("  - calls the typed Telegram metadata-only directory preview/apply tools");
  lines.push("  - prints safe conversation ids/titles/types/unread counts/update times");
  lines.push("  - does not read message bodies, create bindings, poll owner commands, or send Telegram replies");
  lines.push("");
  if (missing.length > 0) {
    lines.push("Missing for --list-conversations:");
    for (const item of missing) {
      lines.push(`  - ${item}`);
    }
    lines.push("");
  }
  lines.push("Directory command:");
  lines.push(
    [
      "node scripts/manual-telegram-owner-loop-smoke.mjs --list-conversations",
      envFile?.loaded ? `--env-file ${shellQuote(envFile.path)}` : undefined,
      ambientAgentSecrets && ambientAgentSecrets.root !== DEFAULT_AMBIENT_AGENT_ROOT ? `--ambient-agent-root ${shellQuote(ambientAgentSecrets.root)}` : undefined,
      config.expectPhoneLast4 ? `--expect-phone-last4 ${shellQuote(config.expectPhoneLast4)}` : undefined,
      config.profile ? `--profile ${shellQuote(config.profile)}` : "--profile <id>",
      config.stateRoot ? `--state-root ${shellQuote(config.stateRoot)}` : "--state-root <path>",
      config.conversationId ? `--conversation ${shellQuote(config.conversationId)}` : undefined,
      config.directoryQuery ? `--directory-query ${shellQuote(config.directoryQuery)}` : undefined,
      `--directory-limit ${shellQuote(config.directoryLimit)}`,
      config.outputDir ? `--output-dir ${shellQuote(config.outputDir)}` : undefined,
    ].filter(Boolean).join(" "),
  );
  if (printEnv) {
    lines.push("");
    lines.push("Redacted env:");
    lines.push(JSON.stringify(redactedDirectoryListEnv(config, env), null, 2));
  }
  return `${lines.join("\n")}\n`;
}

export function ownerLoopChecklist({
  candidates,
  config,
  missing,
  env = process.env,
  envFile,
  ambientAgentSecrets,
  printEnv = false,
} = {}) {
  const lines = [];
  lines.push("Manual Telegram owner-loop smoke");
  lines.push("");
  if (envFile) {
    lines.push(redactedEnvFileSummary(envFile));
    lines.push("");
  }
  if (ambientAgentSecrets) {
    lines.push(redactedAmbientAgentSecretSummary(ambientAgentSecrets));
    lines.push("");
  }
  lines.push("Discovered Telegram sessions:");
  if (candidates.length === 0) {
    lines.push("  - none found in default roots");
  } else {
    for (const candidate of candidates) {
      lines.push(sessionCandidateLine(candidate));
    }
  }
  lines.push("");
  lines.push("Resolved smoke config:");
  lines.push(`  profile: ${config.profile ?? "<missing>"}`);
  lines.push(...profileMarkerConfigLines(config));
  lines.push(`  stateRoot: ${config.stateRoot ?? "<missing>"}`);
  lines.push(`  conversationId: ${config.conversationId ?? "<missing>"}`);
  lines.push(`  setupCode: ${config.setupCode}`);
  lines.push(`  commandText: ${config.commandText}`);
  lines.push(`  commandNotBefore: ${config.commandNotBefore ?? "<none>"}`);
  lines.push(`  sendReply: ${config.sendReply ? "yes (will send after preview)" : "no (preview-only default)"}`);
  if (config.seedOwnerMessages) {
    lines.push("  ownerMessageSeed: enabled");
    lines.push(`  seedProfile: ${config.seedProfile ?? "<missing>"}`);
    if (config.seedProfilePhoneLast4) {
      lines.push(`  seedProfilePhoneLast4: ${config.seedProfilePhoneLast4}`);
    }
    if (config.expectSeedPhoneLast4) {
      lines.push(`  expectedSeedPhoneLast4: ${config.expectSeedPhoneLast4}`);
    }
    lines.push(`  seedConversationId: ${config.seedConversationId ?? "<missing>"}`);
    lines.push(`  seedDirectoryQuery: ${config.seedDirectoryQuery || "<none>"}`);
    lines.push(`  seedDirectoryLimit: ${config.seedDirectoryLimit}`);
  }
  lines.push(`  outputDir: ${config.outputDir ? resolve(config.outputDir) : "<temp>"}`);
  lines.push(
    `  Telegram API credentials: id=${env.AMBIENT_AGENT_TELEGRAM_API_ID ? "present" : "missing"} hash=${env.AMBIENT_AGENT_TELEGRAM_API_HASH ? "present" : "missing"}`,
  );
  lines.push("");
  lines.push("Before running:");
  lines.push(`  1. Send this setup code from an inbound owner/delegate account: ${config.setupCode}`);
  lines.push(`  2. Send this command text in the same conversation: ${config.commandText}`);
  lines.push("  3. Re-run this script with --run and the same --setup-code.");
  lines.push("  4. The default command creates a relayable runtime event, previews the provider-neutral reply alias, and stops before sending.");
  lines.push("  5. Add --send-reply only when you explicitly want the reviewed Telegram reply sent.");
  lines.push("  6. Do not use same-account outgoing messages; the bridge intentionally skips outgoing unread items.");
  lines.push("  7. Use a private/sandbox conversation you control; avoid production, customer, investor, or group channels unless explicitly approved.");
  lines.push("");
  if (missing.length > 0) {
    lines.push("Missing for --run:");
    for (const item of missing) {
      lines.push(`  - ${item}`);
    }
    lines.push("");
  }
  lines.push("Live command:");
  lines.push(
    [
      "node scripts/manual-telegram-owner-loop-smoke.mjs --run",
      envFile?.loaded ? `--env-file ${shellQuote(envFile.path)}` : undefined,
      ambientAgentSecrets && ambientAgentSecrets.root !== DEFAULT_AMBIENT_AGENT_ROOT ? `--ambient-agent-root ${shellQuote(ambientAgentSecrets.root)}` : undefined,
      config.expectPhoneLast4 ? `--expect-phone-last4 ${shellQuote(config.expectPhoneLast4)}` : undefined,
      config.profile ? `--profile ${shellQuote(config.profile)}` : "--profile <id>",
      config.stateRoot ? `--state-root ${shellQuote(config.stateRoot)}` : "--state-root <path>",
      config.conversationId
        ? `--conversation ${shellQuote(config.conversationId)}`
        : "--conversation <id>",
      `--setup-code ${shellQuote(config.setupCode)}`,
      `--command ${shellQuote(config.commandText)}`,
      config.sendReply ? "--send-reply" : undefined,
      config.directoryQuery ? `--directory-query ${shellQuote(config.directoryQuery)}` : undefined,
      config.directoryLimit ? `--directory-limit ${shellQuote(config.directoryLimit)}` : undefined,
      config.pollLimit ? `--poll-limit ${shellQuote(config.pollLimit)}` : undefined,
      config.outputDir ? `--output-dir ${shellQuote(config.outputDir)}` : undefined,
    ].filter(Boolean).join(" "),
  );
  if (printEnv) {
    lines.push("");
    lines.push("Redacted env:");
    lines.push(JSON.stringify(redactedSmokeEnv(config, env), null, 2));
  }
  return `${lines.join("\n")}\n`;
}

export function guidedOwnerLoopChecklist({
  candidates,
  config,
  missing,
  env = process.env,
  envFile,
  ambientAgentSecrets,
  printEnv = false,
} = {}) {
  const lines = [];
  lines.push("Manual guided Telegram owner-loop smoke");
  lines.push("");
  if (envFile) {
    lines.push(redactedEnvFileSummary(envFile));
    lines.push("");
  }
  if (ambientAgentSecrets) {
    lines.push(redactedAmbientAgentSecretSummary(ambientAgentSecrets));
    lines.push("");
  }
  lines.push("Discovered Telegram sessions:");
  if (candidates.length === 0) {
    lines.push("  - none found in default roots");
  } else {
    for (const candidate of candidates) {
      lines.push(sessionCandidateLine(candidate));
    }
  }
  lines.push("");
  lines.push("Resolved guided smoke config:");
  lines.push(`  profile: ${config.profile ?? "<missing>"}`);
  lines.push(...profileMarkerConfigLines(config));
  lines.push(`  stateRoot: ${config.stateRoot ?? "<missing>"}`);
  lines.push(`  conversationId: ${config.conversationId ?? "<missing>"}`);
  lines.push(`  setupCode: ${config.setupCode}`);
  lines.push(`  commandText: ${config.commandText}`);
  lines.push(`  commandNotBefore: ${config.commandNotBefore ?? (config.seedOwnerMessages ? "<seed helper will set after sending>" : "<none>")}`);
  lines.push(`  sendReply: ${config.sendReply ? "yes (will send after preview)" : "no (preview-only default)"}`);
  lines.push(`  outputDir: ${config.outputDir ? resolve(config.outputDir) : "<temp>"}`);
  lines.push(`  waitSeconds: ${config.waitSeconds}`);
  lines.push(`  pollIntervalMs: ${config.pollIntervalMs}`);
  lines.push(`  usePollingRunner: ${config.usePollingRunner ? "yes" : "no"}`);
  lines.push("  activationPlanFirst: yes");
  lines.push(
    `  Telegram API credentials: id=${env.AMBIENT_AGENT_TELEGRAM_API_ID ? "present" : "missing"} hash=${env.AMBIENT_AGENT_TELEGRAM_API_HASH ? "present" : "missing"}`,
  );
  lines.push("");
  lines.push("Guided steps:");
  lines.push("  1. The harness calls ambient_messaging_telegram_owner_loop_activation_plan before lifecycle/directory work.");
  lines.push(`  2. Start this script with --${config.usePollingRunner ? "guided-polling-run" : "guided-run"} before sending Telegram messages.`);
  lines.push(`  3. When it is waiting for owner handoff, send this setup code from an inbound owner/delegate account: ${config.setupCode}`);
  lines.push(`  4. After it reports a matched handoff, send this command text in the same conversation: ${config.commandText}`);
  lines.push(config.usePollingRunner
    ? "  5. The script will create the Remote Ambient Surface binding, call the activation plan again, start the periodic polling runner, verify immediate and scheduled poll counters, apply the command, preview the provider-neutral reply alias, then stop/revoke."
    : "  5. The script will create the Remote Ambient Surface binding, call the activation plan again, poll for the command, apply it, preview the provider-neutral reply alias, then revoke the binding.");
  lines.push("  6. Add --send-reply only when you explicitly want the reviewed Telegram reply sent after preview.");
  lines.push("  7. Use a private/sandbox conversation you control; avoid production, customer, investor, or group channels unless explicitly approved.");
  lines.push("");
  lines.push("Important limitation:");
  lines.push("  - Same-account Telegram Desktop or Saved Messages sends will not work because the bridge intentionally skips outgoing unread items.");
  lines.push("  - This path is for live inbound owner/delegate messages; use --check-handoff for bridge-only preflight.");
  if (config.seedOwnerMessages) {
    lines.push("  - The seed helper is dogfood-only. It sends only the setup and command messages from --seed-profile to --seed-conversation.");
    lines.push("  - The seed helper validates the seed conversation through metadata-only directory data before sending.");
    lines.push("  - If the bridge is not reachable for the seed profile, run a metadata-only directory check first or start the guided run without seeding.");
  }
  lines.push("");
  if (missing.length > 0) {
    lines.push(`Missing for --${config.usePollingRunner ? "guided-polling-run" : "guided-run"}:`);
    for (const item of missing) {
      lines.push(`  - ${item}`);
    }
    lines.push("");
  }
  lines.push("Guided live command:");
  lines.push(
    [
      `node scripts/manual-telegram-owner-loop-smoke.mjs --${config.usePollingRunner ? "guided-polling-run" : "guided-run"}`,
      envFile?.loaded ? `--env-file ${shellQuote(envFile.path)}` : undefined,
      ambientAgentSecrets && ambientAgentSecrets.root !== DEFAULT_AMBIENT_AGENT_ROOT ? `--ambient-agent-root ${shellQuote(ambientAgentSecrets.root)}` : undefined,
      config.expectPhoneLast4 ? `--expect-phone-last4 ${shellQuote(config.expectPhoneLast4)}` : undefined,
      config.profile ? `--profile ${shellQuote(config.profile)}` : "--profile <id>",
      config.stateRoot ? `--state-root ${shellQuote(config.stateRoot)}` : "--state-root <path>",
      config.conversationId
        ? `--conversation ${shellQuote(config.conversationId)}`
        : "--conversation <id>",
      config.seedOwnerMessages ? "--seed-owner-messages" : undefined,
      config.seedProfile ? `--seed-profile ${shellQuote(config.seedProfile)}` : undefined,
      config.seedConversationId ? `--seed-conversation ${shellQuote(config.seedConversationId)}` : undefined,
      config.expectSeedPhoneLast4 ? `--expect-seed-phone-last4 ${shellQuote(config.expectSeedPhoneLast4)}` : undefined,
      config.seedDirectoryQuery ? `--seed-directory-query ${shellQuote(config.seedDirectoryQuery)}` : undefined,
      config.seedDirectoryLimit ? `--seed-directory-limit ${shellQuote(config.seedDirectoryLimit)}` : undefined,
      `--setup-code ${shellQuote(config.setupCode)}`,
      `--command ${shellQuote(config.commandText)}`,
      config.sendReply ? "--send-reply" : undefined,
      config.directoryQuery ? `--directory-query ${shellQuote(config.directoryQuery)}` : undefined,
      config.directoryLimit ? `--directory-limit ${shellQuote(config.directoryLimit)}` : undefined,
      config.pollLimit ? `--poll-limit ${shellQuote(config.pollLimit)}` : undefined,
      config.outputDir ? `--output-dir ${shellQuote(config.outputDir)}` : undefined,
      `--wait-seconds ${shellQuote(config.waitSeconds)}`,
      `--poll-interval-ms ${shellQuote(config.pollIntervalMs)}`,
    ].filter(Boolean).join(" "),
  );
  if (printEnv) {
    lines.push("");
    lines.push("Redacted env:");
    lines.push(JSON.stringify(redactedGuidedSmokeEnv(config, env), null, 2));
  }
  return `${lines.join("\n")}\n`;
}

function sessionCandidateLine(candidate) {
  const label = candidate.profileId ?? "<unknown profile>";
  const auth = candidate.authState ? ` auth=${candidate.authState}` : "";
  const parseError = candidate.parseError ? ` parseError=${candidate.parseError}` : "";
  const phoneMarker = candidate.phoneLast4 ? ` phoneLast4=${candidate.phoneLast4}` : "";
  return `  - ${label} stateRoot=${candidate.stateRoot} phone=${yesNo(candidate.hasPhoneNumber)}${phoneMarker} key=${yesNo(candidate.hasDatabaseEncryptionKey)}${auth}${parseError}`;
}

function profileMarkerConfigLines(config) {
  const lines = [];
  if (config.profilePhoneLast4) {
    lines.push(`  selectedProfilePhoneLast4: ${config.profilePhoneLast4}`);
  }
  if (config.expectPhoneLast4) {
    lines.push(`  expectedProfilePhoneLast4: ${config.expectPhoneLast4}`);
  }
  return lines;
}

function yesNo(value) {
  if (value === undefined) {
    return "unknown";
  }
  return value ? "yes" : "no";
}

function shellQuote(value) {
  if (/^[A-Za-z0-9_./:@+-]+$/.test(value)) {
    return value;
  }
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function isAllowedTelegramEnvFileKey(key) {
  return key === "AMBIENT_AGENT_ROOT" ||
    key.startsWith("AMBIENT_AGENT_TELEGRAM_") ||
    key.startsWith("AMBIENT_MANUAL_TELEGRAM_");
}

function unquoteEnvValue(value) {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  const commentIndex = value.search(/\s#/);
  return commentIndex === -1 ? value : value.slice(0, commentIndex).trim();
}

function withSmokeOutputPath(config, kind) {
  const outputDir = resolve(
    config.outputDir ?? mkdtempSync(join(tmpdir(), `ambient-telegram-${kind}-`)),
  );
  mkdirSync(outputDir, { recursive: true });
  if (kind === "directory") {
    return {
      ...config,
      outputDir,
      directoryOutputPath: join(outputDir, "telegram-directory-candidates.json"),
    };
  }
  return {
    ...config,
    outputDir,
    ownerLoopOutputPath: join(outputDir, "telegram-owner-loop-result.json"),
  };
}

function withOwnerLoopOperatorPacketPath(config) {
  const configWithOutput = withSmokeOutputPath(config, "owner-loop");
  return {
    ...configWithOutput,
    operatorPacketPath: join(configWithOutput.outputDir, "telegram-owner-loop-operator-packet.json"),
    operatorInstructionsPath: join(configWithOutput.outputDir, "telegram-owner-loop-operator-instructions.md"),
    seedOutputPath: join(configWithOutput.outputDir, "telegram-owner-loop-seed.json"),
  };
}

export function ownerLoopCommandText({ config, mode = "guided-run", sendReply = config.sendReply } = {}) {
  return [
    `node scripts/manual-telegram-owner-loop-smoke.mjs --${mode}`,
    config.expectPhoneLast4 ? `--expect-phone-last4 ${shellQuote(config.expectPhoneLast4)}` : undefined,
    config.profile ? `--profile ${shellQuote(config.profile)}` : undefined,
    config.stateRoot ? `--state-root ${shellQuote(config.stateRoot)}` : undefined,
    config.conversationId ? `--conversation ${shellQuote(config.conversationId)}` : undefined,
    config.seedOwnerMessages ? "--seed-owner-messages" : undefined,
    config.seedProfile ? `--seed-profile ${shellQuote(config.seedProfile)}` : undefined,
    config.seedConversationId ? `--seed-conversation ${shellQuote(config.seedConversationId)}` : undefined,
    config.expectSeedPhoneLast4 ? `--expect-seed-phone-last4 ${shellQuote(config.expectSeedPhoneLast4)}` : undefined,
    config.seedDirectoryQuery ? `--seed-directory-query ${shellQuote(config.seedDirectoryQuery)}` : undefined,
    config.seedDirectoryLimit ? `--seed-directory-limit ${shellQuote(config.seedDirectoryLimit)}` : undefined,
    `--setup-code ${shellQuote(config.setupCode)}`,
    `--command ${shellQuote(config.commandText)}`,
    config.commandNotBefore ? `--command-not-before ${shellQuote(config.commandNotBefore)}` : undefined,
    sendReply ? "--send-reply" : undefined,
    config.directoryQuery ? `--directory-query ${shellQuote(config.directoryQuery)}` : undefined,
    config.directoryLimit ? `--directory-limit ${shellQuote(config.directoryLimit)}` : undefined,
    config.pollLimit ? `--poll-limit ${shellQuote(config.pollLimit)}` : undefined,
    config.outputDir ? `--output-dir ${shellQuote(config.outputDir)}` : undefined,
    mode.startsWith("guided") && config.waitSeconds ? `--wait-seconds ${shellQuote(config.waitSeconds)}` : undefined,
    mode.startsWith("guided") && config.pollIntervalMs ? `--poll-interval-ms ${shellQuote(config.pollIntervalMs)}` : undefined,
  ].filter(Boolean).join(" ");
}

export function buildOwnerLoopOperatorPacket({
  config,
  mode = "guided-run",
} = {}) {
  const previewCommand = ownerLoopCommandText({
    config,
    mode,
    sendReply: false,
  });
  const sendReplyCommand = ownerLoopCommandText({
    config,
    mode,
    sendReply: true,
  });
  return {
    generatedAt: new Date().toISOString(),
    mode,
    profileId: config.profile,
    stateRoot: config.stateRoot,
    conversationId: config.conversationId,
    outputDir: config.outputDir,
    ownerLoopOutputPath: config.ownerLoopOutputPath,
    operatorInstructionsPath: config.operatorInstructionsPath,
    seedOutputPath: config.seedOutputPath,
    setupCode: config.setupCode,
    commandText: config.commandText,
    commandNotBefore: config.commandNotBefore,
    ownerMessageSeed: config.seedOwnerMessages
      ? {
        enabled: true,
        seedProfile: config.seedProfile,
        seedConversationId: config.seedConversationId,
        seedDirectoryQuery: config.seedDirectoryQuery,
        seedDirectoryLimit: config.seedDirectoryLimit,
        seedOutputPath: config.seedOutputPath,
      }
      : { enabled: false },
    waitSeconds: config.waitSeconds,
    pollIntervalMs: config.pollIntervalMs,
    usePollingRunner: config.usePollingRunner === true,
    replySendRequested: config.sendReply === true,
    replySendRequiresExplicitApproval: true,
    activationPlan: {
      planFirst: true,
      tool: "ambient_messaging_telegram_owner_loop_activation_plan",
      initialBeforeLifecycle: true,
      afterBindingBeforePolling: true,
      expectedNextAfterBinding: "ambient_messaging_telegram_bridge_polling_preview",
    },
    messagesToSend: [
      {
        order: 1,
        purpose: "owner_handoff",
        exactText: config.setupCode,
      },
      {
        order: 2,
        purpose: "owner_command",
        exactText: config.commandText,
      },
    ],
    commands: {
      previewOnly: previewCommand,
      sendReplyAfterApproval: sendReplyCommand,
    },
    guardrails: [
      "Send both messages from a separate inbound owner/delegate Telegram account in the selected conversation.",
      "Use a private/sandbox conversation you control; avoid production, customer, investor, or group channels unless explicitly approved for this smoke.",
      "Do not use same-account Telegram Desktop or Saved Messages; outgoing bridge-account messages are intentionally ignored.",
      "The default run is preview-only and must not send a Telegram reply.",
      "Use the sendReplyAfterApproval command only after explicit approval for a real Telegram reply.",
      "If ownerMessageSeed is enabled, it sends only the two listed operator messages through the separate owner/delegate profile and does not read message bodies/history.",
      "The real-provider harness must call ambient_messaging_telegram_owner_loop_activation_plan before lifecycle/directory work and again after binding creation.",
      "The smoke must use provider-neutral relay preview/apply aliases; do not use provider UI, shell, browser, provider CLI, or Messaging Connector workarounds.",
    ],
    privacy: {
      includesTelegramApiCredentials: false,
      includesProviderMessageBodies: false,
      includesProviderHistory: false,
    },
  };
}

export function buildOwnerLoopOperatorInstructions(packet) {
  const lines = [
    "# Telegram Owner-Loop Smoke Instructions",
    "",
    "Use these instructions for the live user-assisted Remote Ambient Surface smoke. The run is preview-only unless the explicit send-reply command is run after approval.",
    "",
    "## Target",
    "",
    `- Profile: ${packet.profileId ?? "<missing>"}`,
    `- Conversation: ${packet.conversationId ?? "<missing>"}`,
    `- Result report: ${packet.ownerLoopOutputPath ?? "<missing>"}`,
    packet.ownerMessageSeed?.enabled ? `- Seed report: ${packet.seedOutputPath ?? "<missing>"}` : undefined,
    "",
    "## Activation Plan Contract",
    "",
    `- Plan-first: ${packet.activationPlan?.planFirst ? "yes" : "no"}`,
    `- Tool: ${packet.activationPlan?.tool ?? "ambient_messaging_telegram_owner_loop_activation_plan"}`,
    `- Initial before lifecycle: ${packet.activationPlan?.initialBeforeLifecycle ? "yes" : "no"}`,
    `- After binding before polling: ${packet.activationPlan?.afterBindingBeforePolling ? "yes" : "no"}`,
    `- Expected next after binding: ${packet.activationPlan?.expectedNextAfterBinding ?? "<unknown>"}`,
    "",
    "## Messages To Send",
    "",
    packet.ownerMessageSeed?.enabled
      ? "The configured seed helper will send these as two separate Telegram messages from the owner/delegate profile before the guided run starts."
      : "Send these as two separate Telegram messages from a separate inbound owner/delegate account in the selected conversation.",
    "",
    "1. Owner handoff setup code:",
    "",
    "```text",
    packet.setupCode ?? "<missing>",
    "```",
    "",
    "2. Owner command:",
    "",
    "```text",
    packet.commandText ?? "<missing>",
    "```",
    "",
    "## Run Commands",
    "",
    "Preview-only run:",
    "",
    "```bash",
    packet.commands?.previewOnly ?? "<missing>",
    "```",
    "",
    "Send-reply run after explicit approval:",
    "",
    "```bash",
    packet.commands?.sendReplyAfterApproval ?? "<missing>",
    "```",
    "",
    "## Guardrails",
    "",
    ...(Array.isArray(packet.guardrails)
      ? packet.guardrails.map((guardrail) => `- ${guardrail}`)
      : ["- Guardrails unavailable."]),
    "",
    "## Privacy",
    "",
    `- Includes Telegram API credentials: ${packet.privacy?.includesTelegramApiCredentials ? "yes" : "no"}`,
    `- Includes provider message bodies: ${packet.privacy?.includesProviderMessageBodies ? "yes" : "no"}`,
    `- Includes provider history: ${packet.privacy?.includesProviderHistory ? "yes" : "no"}`,
    "",
  ];
  return lines.join("\n");
}

function writeOwnerLoopOperatorPacket(config, mode) {
  if (!config.operatorPacketPath) {
    return undefined;
  }
  const packet = buildOwnerLoopOperatorPacket({ config, mode });
  writeFileSync(config.operatorPacketPath, JSON.stringify(packet, null, 2), "utf8");
  if (config.operatorInstructionsPath) {
    writeFileSync(config.operatorInstructionsPath, buildOwnerLoopOperatorInstructions(packet), "utf8");
  }
  return config.operatorPacketPath;
}

export function ownerLoopOperatorPacketText({ outputPath }) {
  const report = JSON.parse(readFileSync(outputPath, "utf8"));
  const lines = [
    "",
    "Telegram owner-loop operator packet",
    `Report: ${outputPath}`,
    report.operatorInstructionsPath ? `Instructions: ${report.operatorInstructionsPath}` : undefined,
    `Conversation: ${report.conversationId ?? "<missing>"}`,
    `Activation plan first: ${report.activationPlan?.planFirst ? "yes" : "no"}`,
    `Setup message: ${report.setupCode ?? "<missing>"}`,
    `Command message: ${report.commandText ?? "<missing>"}`,
    `Preview-only command: ${report.commands?.previewOnly ?? "<missing>"}`,
    "Send both messages from a separate inbound owner/delegate Telegram account.",
    "Use a private/sandbox conversation you control; avoid production, customer, investor, or group channels unless explicitly approved for this smoke.",
    "No Telegram reply will be sent unless the send-reply command is run after explicit approval.",
  ].filter(Boolean);
  return `${lines.join("\n")}\n`;
}

export function directoryListResultText({ outputPath, config }) {
  const report = JSON.parse(readFileSync(outputPath, "utf8"));
  const conversations = Array.isArray(report.conversations) ? report.conversations : [];
  const selectedConversation = selectedDirectoryConversation(conversations, config);
  const lines = [
    "",
    "Telegram metadata-only directory result",
    `Report: ${outputPath}`,
    `Conversation count: ${conversations.length}`,
  ];
  for (const [index, conversation] of conversations.entries()) {
    lines.push(
      [
        `${index + 1}. conversationId=${conversation.conversationId ?? "<missing>"}`,
        conversation.title ? `title=${conversation.title}` : undefined,
        conversation.type ? `type=${conversation.type}` : undefined,
        typeof conversation.unreadCount === "number" ? `unread=${conversation.unreadCount}` : undefined,
        conversation.updatedAt ? `updated=${conversation.updatedAt}` : undefined,
      ].filter(Boolean).join(" "),
    );
  }
  if (selectedConversation?.conversationId) {
    lines.push("");
    if (selectedConversation.type && selectedConversation.type !== "private") {
      lines.push(`Selected conversation type is ${selectedConversation.type}; use only if this is an approved sandbox/test channel.`);
    }
    lines.push("Next preview-only guided smoke command:");
    lines.push([
      "node scripts/manual-telegram-owner-loop-smoke.mjs --guided-run",
      config.expectPhoneLast4 ? `--expect-phone-last4 ${shellQuote(config.expectPhoneLast4)}` : undefined,
      config.profile ? `--profile ${shellQuote(config.profile)}` : undefined,
      config.stateRoot ? `--state-root ${shellQuote(config.stateRoot)}` : undefined,
      `--conversation ${shellQuote(selectedConversation.conversationId)}`,
      config.directoryQuery ? `--directory-query ${shellQuote(config.directoryQuery)}` : undefined,
      config.directoryLimit ? `--directory-limit ${shellQuote(config.directoryLimit)}` : undefined,
      config.outputDir ? `--output-dir ${shellQuote(config.outputDir)}` : undefined,
    ].filter(Boolean).join(" "));
  } else if (conversations.length > 1) {
    lines.push("");
    lines.push("No guided command was emitted automatically because multiple conversations were returned.");
    lines.push("Choose a safe private/sandbox conversation, then rerun the directory or guided command with --conversation <id>.");
  } else if (conversations.length === 0) {
    lines.push("");
    lines.push("No guided command was emitted because the directory returned no conversations.");
  }
  return `${lines.join("\n")}\n`;
}

function selectedDirectoryConversation(conversations, config) {
  if (!Array.isArray(conversations) || conversations.length === 0) {
    return undefined;
  }
  if (config.conversationId) {
    return conversations.find((conversation) => String(conversation.conversationId) === String(config.conversationId));
  }
  return conversations.length === 1 ? conversations[0] : undefined;
}

export function ownerLoopResultText({ outputPath }) {
  const report = JSON.parse(readFileSync(outputPath, "utf8"));
  const pollingRunner = report.pollingRunner;
  const lines = [
    "",
    "Telegram owner-loop result",
    `Report: ${outputPath}`,
    report.status ? `Status: ${report.status}` : undefined,
    report.currentStep ? `Current step: ${report.currentStep}` : undefined,
    report.failure?.message ? `Failure: ${report.failure.message}` : undefined,
    report.activationPlan?.planFirst !== undefined ? `Activation plan first: ${report.activationPlan.planFirst ? "yes" : "no"}` : undefined,
    report.activationPlan?.initial?.status ? `Initial activation status: ${report.activationPlan.initial.status}` : undefined,
    report.activationPlan?.initial?.recommendedNextTool ? `Initial activation next tool: ${report.activationPlan.initial.recommendedNextTool}` : undefined,
    report.activationPlan?.afterBinding?.status ? `After-binding activation status: ${report.activationPlan.afterBinding.status}` : undefined,
    report.activationPlan?.afterBinding?.recommendedNextTool ? `After-binding recommended next tool: ${report.activationPlan.afterBinding.recommendedNextTool}` : undefined,
    report.handoff?.status ? `Handoff: ${report.handoff.status} after ${report.handoff.attempts ?? 0} attempt(s)` : undefined,
    report.commandPoll?.status ? `Command poll: ${report.commandPoll.status} after ${report.commandPoll.attempts ?? 0} attempt(s)` : undefined,
    report.commandPoll?.minReceivedAt ? `Command freshness anchor: ${report.commandPoll.minReceivedAt}` : undefined,
    typeof report.commandPoll?.staleMessageCount === "number" ? `Stale command-poll messages: ${report.commandPoll.staleMessageCount}` : undefined,
    pollingRunner?.startStatus ? `Polling runner start: ${pollingRunner.startStatus}` : undefined,
    pollingRunner?.scheduledStatus?.totalPollCount !== undefined ? `Polling runner scheduled polls: ${pollingRunner.scheduledStatus.totalPollCount}` : undefined,
    pollingRunner?.stopStatus ? `Polling runner stop: ${pollingRunner.stopStatus}` : undefined,
    `Queued projection: ${report.queuedProjectionId ?? "<missing>"}`,
    `Runtime event: ${report.runtimeEventId ?? "<missing>"}`,
    `Relay action status: ${report.relayActionStatus ?? "<missing>"}`,
    `Preview status: ${report.previewStatus ?? "<missing>"}`,
    `Delegated preview tool: ${report.delegatedPreviewToolName ?? "<missing>"}`,
    `Reply sent: ${report.replySent ? "yes" : "no"}`,
    report.providerMessageId ? `Provider message: ${report.providerMessageId}` : undefined,
    report.deliveryStatus ? `Delivery status: ${report.deliveryStatus}` : undefined,
    report.relayStatusAfterSend ? `Relay status after send: ${report.relayStatusAfterSend}` : undefined,
    report.relayActionStatusAfterSend ? `Relay action status after send: ${report.relayActionStatusAfterSend}` : undefined,
    typeof report.duplicateBlockedAfterSend === "boolean" ? `Duplicate blocked after send: ${report.duplicateBlockedAfterSend ? "yes" : "no"}` : undefined,
    report.duplicatePreviewStatus ? `Duplicate preview status: ${report.duplicatePreviewStatus}` : undefined,
    report.duplicateApplyStatus ? `Duplicate apply status: ${report.duplicateApplyStatus}` : undefined,
  ].filter(Boolean);
  if (report.replyApplyStatus) {
    lines.push(`Apply status: ${report.replyApplyStatus}`);
  }
  if (!report.replySent) {
    lines.push("No Telegram reply was sent. Rerun with --send-reply only after explicit approval.");
  }
  return `${lines.join("\n")}\n`;
}

export function ownerMessageSeedChecklist({
  candidates,
  config,
  missing,
  env = process.env,
  envFile,
  ambientAgentSecrets,
  printEnv = false,
} = {}) {
  const lines = [];
  lines.push("Manual Telegram owner-message seed helper");
  lines.push("");
  if (envFile) {
    lines.push(redactedEnvFileSummary(envFile));
    lines.push("");
  }
  if (ambientAgentSecrets) {
    lines.push(redactedAmbientAgentSecretSummary(ambientAgentSecrets));
    lines.push("");
  }
  lines.push("Discovered Telegram sessions:");
  if (candidates.length === 0) {
    lines.push("  - none found in default roots");
  } else {
    for (const candidate of candidates) {
      lines.push(sessionCandidateLine(candidate));
    }
  }
  lines.push("");
  lines.push("Resolved seed config:");
  lines.push(`  bridgeProfile: ${config.profile ?? "<not checked>"}`);
  lines.push(...profileMarkerConfigLines(config));
  lines.push(`  seedProfile: ${config.seedProfile ?? "<missing>"}`);
  if (config.seedProfilePhoneLast4) {
    lines.push(`  seedProfilePhoneLast4: ${config.seedProfilePhoneLast4}`);
  }
  if (config.expectSeedPhoneLast4) {
    lines.push(`  expectedSeedPhoneLast4: ${config.expectSeedPhoneLast4}`);
  }
  lines.push(`  seedConversationId: ${config.seedConversationId ?? "<missing>"}`);
  lines.push(`  setupCode: ${config.setupCode}`);
  lines.push(`  commandText: ${config.commandText}`);
  lines.push(`  seedDirectoryQuery: ${config.seedDirectoryQuery || "<none>"}`);
  lines.push(`  seedDirectoryLimit: ${config.seedDirectoryLimit}`);
  lines.push(`  outputDir: ${config.outputDir ? resolve(config.outputDir) : "<temp>"}`);
  lines.push(
    `  Telegram API credentials: id=${env.AMBIENT_AGENT_TELEGRAM_API_ID ? "present" : "missing"} hash=${env.AMBIENT_AGENT_TELEGRAM_API_HASH ? "present" : "missing"}`,
  );
  lines.push("");
  lines.push("What this does:");
  lines.push("  - validates the seed conversation through the Telegram bridge metadata-only directory for --seed-profile");
  lines.push("  - sends exactly two text messages, the setup code and command, from --seed-profile to --seed-conversation");
  lines.push("  - writes a redacted seed report with provider message ids and timestamps");
  lines.push("  - does not read provider message bodies/history, create bindings, poll commands, or send any Ambient relay reply");
  lines.push("");
  lines.push("Guardrails:");
  lines.push("  - --seed-profile must be a separate owner/delegate account, not the bridge profile that will poll inbound messages.");
  lines.push("  - Use only a private/sandbox conversation you control.");
  lines.push("  - If metadata validation cannot find --seed-conversation, rerun directory listing for the seed profile and use that profile-local conversation id.");
  lines.push("");
  if (missing.length > 0) {
    lines.push("Missing for --seed-owner-messages:");
    for (const item of missing) {
      lines.push(`  - ${item}`);
    }
    lines.push("");
  }
  lines.push("Seed command:");
  lines.push(ownerSeedCommandText({ config }));
  if (printEnv) {
    lines.push("");
    lines.push("Redacted env:");
    lines.push(JSON.stringify({
      AMBIENT_AGENT_TELEGRAM_API_ID: env.AMBIENT_AGENT_TELEGRAM_API_ID ? "<present>" : "<missing>",
      AMBIENT_AGENT_TELEGRAM_API_HASH: env.AMBIENT_AGENT_TELEGRAM_API_HASH ? "<present>" : "<missing>",
    }, null, 2));
  }
  return `${lines.join("\n")}\n`;
}

export function ownerSeedCommandText({ config } = {}) {
  return [
    "node scripts/manual-telegram-owner-loop-smoke.mjs --seed-owner-messages",
    config.expectPhoneLast4 ? `--expect-phone-last4 ${shellQuote(config.expectPhoneLast4)}` : undefined,
    config.profile ? `--profile ${shellQuote(config.profile)}` : undefined,
    config.seedProfile ? `--seed-profile ${shellQuote(config.seedProfile)}` : "--seed-profile <owner-profile>",
    config.seedConversationId ? `--seed-conversation ${shellQuote(config.seedConversationId)}` : "--seed-conversation <owner-profile-chat-id>",
    config.expectSeedPhoneLast4 ? `--expect-seed-phone-last4 ${shellQuote(config.expectSeedPhoneLast4)}` : undefined,
    config.seedDirectoryQuery ? `--seed-directory-query ${shellQuote(config.seedDirectoryQuery)}` : undefined,
    config.seedDirectoryLimit ? `--seed-directory-limit ${shellQuote(config.seedDirectoryLimit)}` : undefined,
    `--setup-code ${shellQuote(config.setupCode)}`,
    `--command ${shellQuote(config.commandText)}`,
    config.outputDir ? `--output-dir ${shellQuote(config.outputDir)}` : undefined,
  ].filter(Boolean).join(" ");
}

export function ownerMessageSeedResultText({ outputPath }) {
  const report = JSON.parse(readFileSync(outputPath, "utf8"));
  const lines = [
    "",
    "Telegram owner-message seed result",
    `Report: ${outputPath}`,
    `Status: ${report.status ?? "<missing>"}`,
    `Seed profile: ${report.seedProfile ?? "<missing>"}`,
    `Seed conversation: ${report.seedConversationId ?? "<missing>"}`,
    report.validation?.status ? `Metadata validation: ${report.validation.status}` : undefined,
    report.freshnessAnchor?.commandNotBefore ? `Command freshness anchor: ${report.freshnessAnchor.commandNotBefore}` : undefined,
  ];
  for (const sent of Array.isArray(report.sentMessages) ? report.sentMessages : []) {
    lines.push([
      `Sent ${sent.purpose ?? "message"}`,
      sent.providerMessageId ? `providerMessage=${sent.providerMessageId}` : undefined,
      sent.chatId ? `chatId=${sent.chatId}` : undefined,
      sent.date ? `date=${sent.date}` : undefined,
    ].filter(Boolean).join(" "));
  }
  if (report.failure?.message) {
    lines.push(`Failure: ${report.failure.message}`);
  }
  lines.push("No Telegram relay reply was sent by the seed helper.");
  return `${lines.join("\n")}\n`;
}

function runOwnerMessageSeed(config, env = process.env) {
  const outputDir = resolve(
    config.outputDir ?? mkdtempSync(join(tmpdir(), "ambient-telegram-seed-")),
  );
  mkdirSync(outputDir, { recursive: true });
  const configWithOutput = {
    ...config,
    outputDir,
    seedOutputPath: join(outputDir, "telegram-owner-loop-seed.json"),
  };
  try {
    const validation = validateSeedConversation(configWithOutput, env);
    const setup = sendSeedTelegramMessage({
      env,
      profile: configWithOutput.seedProfile,
      conversationId: configWithOutput.seedConversationId,
      text: configWithOutput.setupCode,
      purpose: "owner_handoff",
    });
    sleepSync(1000);
    const command = sendSeedTelegramMessage({
      env,
      profile: configWithOutput.seedProfile,
      conversationId: configWithOutput.seedConversationId,
      text: configWithOutput.commandText,
      purpose: "owner_command",
    });
    const commandNotBefore = normalizeOptionalIsoTimestamp(
      command.date,
      "Seed owner command returned an invalid date; cannot build command freshness anchor.",
    );
    writeFileSync(configWithOutput.seedOutputPath, JSON.stringify({
      generatedAt: new Date().toISOString(),
      status: "sent",
      seedProfile: configWithOutput.seedProfile,
      seedConversationId: configWithOutput.seedConversationId,
      setupCodePreview: previewValue(configWithOutput.setupCode),
      commandTextLength: configWithOutput.commandText.length,
      freshnessAnchor: commandNotBefore
        ? {
          commandNotBefore,
          source: "owner_command.date",
          appliesTo: "ambient_messaging_telegram_bridge_poll_apply.minReceivedAt",
        }
        : undefined,
      validation,
      sentMessages: [setup, command],
      privacy: {
        includesTelegramApiCredentials: false,
        includesProviderMessageBodies: false,
        includesProviderHistory: false,
        sentAmbientRelayReply: false,
      },
    }, null, 2), "utf8");
    process.stdout.write(ownerMessageSeedResultText({ outputPath: configWithOutput.seedOutputPath }));
    return 0;
  } catch (error) {
    writeFileSync(configWithOutput.seedOutputPath, JSON.stringify({
      generatedAt: new Date().toISOString(),
      status: "failed",
      seedProfile: configWithOutput.seedProfile,
      seedConversationId: configWithOutput.seedConversationId,
      failure: {
        message: error instanceof Error ? error.message : String(error),
      },
      privacy: {
        includesTelegramApiCredentials: false,
        includesProviderMessageBodies: false,
        includesProviderHistory: false,
        sentAmbientRelayReply: false,
      },
    }, null, 2), "utf8");
    process.stdout.write(ownerMessageSeedResultText({ outputPath: configWithOutput.seedOutputPath }));
    return 1;
  }
}

function validateSeedConversation(config, env) {
  const params = new URLSearchParams({
    metadataOnly: "true",
    limit: String(config.seedDirectoryLimit ?? DEFAULT_SEED_DIRECTORY_LIMIT),
  });
  if (config.seedDirectoryQuery) {
    params.set("query", config.seedDirectoryQuery);
  }
  const response = telegramBridgeJsonSync({
    env,
    method: "GET",
    path: `/sessions/${encodeURIComponent(config.seedProfile)}/chats?${params.toString()}`,
  });
  const conversations = Array.isArray(response.chats) ? response.chats : [];
  if (JSON.stringify(conversations).includes("lastMessage")) {
    throw new Error("Seed metadata validation returned provider message bodies; refusing to continue.");
  }
  const selected = conversations.find((conversation) => String(conversationIdForDirectoryEntry(conversation)) === String(config.seedConversationId));
  if (!selected) {
    throw new Error(`Seed conversation ${config.seedConversationId} was not found in metadata-only directory for seed profile ${config.seedProfile}. Run --list-conversations with --profile ${config.seedProfile} and use that profile-local conversation id.`);
  }
  return {
    status: "present",
    returnedConversationCount: conversations.length,
    selectedConversation: {
      conversationId: conversationIdForDirectoryEntry(selected),
      title: selected.title,
      type: selected.type,
      unreadCount: selected.unreadCount,
      updatedAt: selected.updatedAt,
    },
    metadataOnly: true,
  };
}

function conversationIdForDirectoryEntry(conversation) {
  return conversation?.conversationId ?? conversation?.id;
}

function sendSeedTelegramMessage({ env, profile, conversationId, text, purpose }) {
  const response = telegramBridgeJsonSync({
    env,
    method: "POST",
    path: `/sessions/${encodeURIComponent(profile)}/messages/send`,
    body: {
      chatId: conversationId,
      text,
    },
  });
  const message = response.message ?? response;
  return {
    purpose,
    providerMessageId: optionalPrimitiveString(message.id) || optionalPrimitiveString(response.messageId),
    chatId: optionalPrimitiveString(message.chatId) || conversationId,
    outgoing: message.outgoing === true,
    contentType: optionalPrimitiveString(message.contentType),
    date: optionalPrimitiveString(message.date),
  };
}

function telegramBridgeJsonSync({ env, method, path, body }) {
  const baseUrl = (env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL?.trim()
    || `http://127.0.0.1:${env.AMBIENT_AGENT_TELEGRAM_BRIDGE_PORT?.trim() || "8091"}`)
    .replace(/\/+$/, "");
  const configLines = [
    "fail",
    "show-error",
    "silent",
    "max-time = 20",
    `request = "${escapeCurlConfigValue(method)}"`,
    `url = "${escapeCurlConfigValue(`${baseUrl}${path}`)}"`,
    "header = \"content-type: application/json\"",
    `header = "x-telegram-api-id: ${escapeCurlConfigValue(env.AMBIENT_AGENT_TELEGRAM_API_ID ?? "")}"`,
    `header = "x-telegram-api-hash: ${escapeCurlConfigValue(env.AMBIENT_AGENT_TELEGRAM_API_HASH ?? "")}"`,
  ];
  if (body !== undefined) {
    configLines.push(`data = "${escapeCurlConfigValue(JSON.stringify(body))}"`);
  }
  const result = spawnSync("curl", ["--config", "-"], {
    encoding: "utf8",
    input: `${configLines.join("\n")}\n`,
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    throw new Error(`Telegram bridge ${method} ${path} failed${stderr ? `: ${stderr}` : ""}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`Telegram bridge ${method} ${path} returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function escapeCurlConfigValue(value) {
  return String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("\"", "\\\"")
    .replaceAll("\r", "\\r")
    .replaceAll("\n", "\\n");
}

function optionalPrimitiveString(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return undefined;
}

function previewValue(value) {
  if (typeof value !== "string") return "<missing>";
  if (value.length <= 16) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function readSeedCommandNotBefore(seedOutputPath) {
  if (!seedOutputPath || !existsSync(seedOutputPath)) return undefined;
  try {
    const report = JSON.parse(readFileSync(seedOutputPath, "utf8"));
    return normalizeOptionalIsoTimestamp(
      report?.freshnessAnchor?.commandNotBefore,
      "Seed command freshness anchor is not a valid ISO timestamp.",
    );
  } catch {
    return undefined;
  }
}

export function betterSqliteRebuildEnv(env = process.env, pythonPath = DEFAULT_REBUILD_PYTHON) {
  return {
    ...env,
    npm_config_runtime: "node",
    npm_config_target: process.versions.node,
    npm_config_disturl: "https://nodejs.org/download/release",
    npm_config_target_arch: process.arch,
    npm_config_target_platform: process.platform,
    npm_config_build_from_source: env.npm_config_build_from_source ?? "true",
    ...(!env.npm_config_python && existsSync(pythonPath)
      ? { npm_config_python: pythonPath }
      : {}),
  };
}

function rebuildBetterSqlite3() {
  const rebuild = spawnSync("pnpm", ["rebuild", "better-sqlite3"], {
    stdio: "inherit",
    env: betterSqliteRebuildEnv(),
  });
  if (rebuild.status !== 0) {
    return rebuild;
  }
  return spawnSync(process.execPath, [
    "-e",
    "const Database=require('better-sqlite3'); const db=new Database(':memory:'); db.prepare('select 1').get(); db.close();",
  ], {
    stdio: "inherit",
  });
}

function runSmoke(config, env = process.env) {
  const configWithOutput = withOwnerLoopOperatorPacketPath(config);
  const operatorPacketPath = writeOwnerLoopOperatorPacket(configWithOutput, "run");
  if (operatorPacketPath) {
    process.stdout.write(ownerLoopOperatorPacketText({ outputPath: operatorPacketPath }));
  }
  const rebuild = rebuildBetterSqlite3();
  if (rebuild.status !== 0) {
    return rebuild.status ?? 1;
  }
  const result = spawnSync("pnpm", TEST_ARGS, {
    env: buildSmokeEnv(configWithOutput, env),
    stdio: "inherit",
  });
  if (existsSync(configWithOutput.ownerLoopOutputPath)) {
    process.stdout.write(ownerLoopResultText({ outputPath: configWithOutput.ownerLoopOutputPath }));
  }
  return result.status ?? 1;
}

function runDirectoryListSmoke(config, env = process.env) {
  const configWithOutput = withSmokeOutputPath(config, "directory");
  const rebuild = rebuildBetterSqlite3();
  if (rebuild.status !== 0) {
    return rebuild.status ?? 1;
  }
  const result = spawnSync("pnpm", DIRECTORY_LIST_TEST_ARGS, {
    env: buildDirectoryListEnv(configWithOutput, env),
    stdio: "inherit",
  });
  if (existsSync(configWithOutput.directoryOutputPath)) {
    process.stdout.write(directoryListResultText({
      outputPath: configWithOutput.directoryOutputPath,
      config: configWithOutput,
    }));
  }
  return result.status ?? 1;
}

function runOwnerHandoffCheckSmoke(config, env = process.env) {
  const rebuild = rebuildBetterSqlite3();
  if (rebuild.status !== 0) {
    return rebuild.status ?? 1;
  }
  const result = spawnSync("pnpm", OWNER_HANDOFF_CHECK_TEST_ARGS, {
    env: buildOwnerHandoffCheckEnv(config, env),
    stdio: "inherit",
  });
  return result.status ?? 1;
}

function runGuidedSmoke(config, env = process.env, { mode = "guided-run", usePollingRunner = false } = {}) {
  const configWithOutput = withOwnerLoopOperatorPacketPath({
    ...config,
    usePollingRunner,
  });
  const operatorPacketPath = writeOwnerLoopOperatorPacket(configWithOutput, mode);
  if (operatorPacketPath) {
    process.stdout.write(ownerLoopOperatorPacketText({ outputPath: operatorPacketPath }));
  }
  if (configWithOutput.seedOwnerMessages) {
    const seedStatus = runOwnerMessageSeed(configWithOutput, env);
    if (seedStatus !== 0) {
      return seedStatus;
    }
  }
  const configForRun = {
    ...configWithOutput,
    commandNotBefore: configWithOutput.commandNotBefore ?? readSeedCommandNotBefore(configWithOutput.seedOutputPath),
    usePollingRunner,
  };
  const rebuild = rebuildBetterSqlite3();
  if (rebuild.status !== 0) {
    return rebuild.status ?? 1;
  }
  const result = spawnSync("pnpm", GUIDED_OWNER_LOOP_TEST_ARGS, {
    env: buildGuidedSmokeEnv(configForRun, env),
    stdio: "inherit",
  });
  if (existsSync(configWithOutput.ownerLoopOutputPath)) {
    process.stdout.write(ownerLoopResultText({ outputPath: configWithOutput.ownerLoopOutputPath }));
  }
  return result.status ?? 1;
}

function prepareGuidedSmoke(config) {
  const configWithOutput = withOwnerLoopOperatorPacketPath(config);
  const operatorPacketPath = writeOwnerLoopOperatorPacket(configWithOutput, "guided-run");
  if (operatorPacketPath) {
    process.stdout.write(ownerLoopOperatorPacketText({ outputPath: operatorPacketPath }));
  }
  return 0;
}

export function main(argv = process.argv.slice(2), env = process.env) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  const envFile = loadTelegramEnvFile(options.envFile, env);
  const ambientAgentSecrets = loadAmbientAgentTelegramSecretFiles({
    ambientAgentRoot: options.ambientAgentRoot,
    env: envFile.env,
  });
  const runtimeEnv = ambientAgentSecrets.env;
  const candidates = findBridgeSessionCandidates({
    env: runtimeEnv,
    stateRoot: options.stateRoot,
    scanRoots: options.scanRoots,
  });
  if (options.seedOwnerMessages && !options.guidedRun && !options.guidedPollingRun) {
    const { config, missing } = resolveOwnerMessageSeedConfig({ options, candidates, env: runtimeEnv });
    process.stdout.write(
      ownerMessageSeedChecklist({
        candidates,
        config,
        missing,
        env: runtimeEnv,
        envFile,
        ambientAgentSecrets,
        printEnv: options.printEnv,
      }),
    );
    if (missing.length > 0) {
      process.stderr.write("Refusing to seed owner messages until the missing items above are provided.\n");
      return 1;
    }
    return runOwnerMessageSeed(config, runtimeEnv);
  }
  if (options.listConversations) {
    const { config, missing } = resolveDirectoryListConfig({ options, candidates, env: runtimeEnv });
    process.stdout.write(
      directoryListChecklist({
        candidates,
        config,
        missing,
        env: runtimeEnv,
        envFile,
        ambientAgentSecrets,
        printEnv: options.printEnv,
      }),
    );
    if (missing.length > 0) {
      process.stderr.write("Refusing to list conversations until the missing items above are provided.\n");
      return 1;
    }
    return runDirectoryListSmoke(config, runtimeEnv);
  }
  if (options.checkHandoff) {
    const { config, missing } = resolveOwnerHandoffCheckConfig({ options, candidates, env: runtimeEnv });
    process.stdout.write(
      ownerHandoffCheckChecklist({
        candidates,
        config,
        missing,
        env: runtimeEnv,
        envFile,
        ambientAgentSecrets,
        printEnv: options.printEnv,
      }),
    );
    if (missing.length > 0) {
      process.stderr.write("Refusing to run handoff preflight until the missing items above are provided.\n");
      return 1;
    }
    return runOwnerHandoffCheckSmoke(config, runtimeEnv);
  }
  if (options.prepareGuided) {
    const { config, missing } = resolveGuidedSmokeConfig({ options, candidates, env: runtimeEnv });
    process.stdout.write(
      guidedOwnerLoopChecklist({
        candidates,
        config,
        missing,
        env: runtimeEnv,
        envFile,
        ambientAgentSecrets,
        printEnv: options.printEnv,
      }),
    );
    if (missing.length > 0) {
      process.stderr.write("Refusing to prepare guided owner-loop smoke until the missing items above are provided.\n");
      return 1;
    }
    return prepareGuidedSmoke(config);
  }
  if (options.guidedRun || options.guidedPollingRun) {
    const { config, missing } = resolveGuidedSmokeConfig({ options, candidates, env: runtimeEnv });
    process.stdout.write(
      guidedOwnerLoopChecklist({
        candidates,
        config,
        missing,
        env: runtimeEnv,
        envFile,
        ambientAgentSecrets,
        printEnv: options.printEnv,
      }),
    );
    if (missing.length > 0) {
      process.stderr.write("Refusing to run guided owner-loop smoke until the missing items above are provided.\n");
      return 1;
    }
    return runGuidedSmoke(config, runtimeEnv, {
      mode: options.guidedPollingRun ? "guided-polling-run" : "guided-run",
      usePollingRunner: options.guidedPollingRun === true,
    });
  }
  const { config, missing } = resolveSmokeConfig({ options, candidates, env: runtimeEnv });
  process.stdout.write(
    ownerLoopChecklist({
      candidates,
      config,
      missing,
      env: runtimeEnv,
      envFile,
      ambientAgentSecrets,
      printEnv: options.printEnv,
    }),
  );
  if (!options.run) {
    return 0;
  }
  if (missing.length > 0) {
    process.stderr.write("Refusing to run until the missing items above are provided.\n");
    return 1;
  }
  return runSmoke(config, runtimeEnv);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
