#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = "~/.ambient-hardening";
const SCHEMA_VERSION = "ambient-local-hardening-snapshot-v1";

const SECRET_RELATIVE_PATH_PATTERNS = [
  /^userData\/ambient-api-key\.enc$/,
  /^userData\/google-workspace-cli(?:\/|$)/,
  /^workspace\/\.ambient\/cli-packages\/secrets(?:\/|$)/,
  /^workspace\/\.ambient\/capability-builder\/secrets(?:\/|$)/,
];

const BROWSER_PROFILE_RELATIVE_PATH_PATTERNS = [
  /^userData\/Cache(?:\/|$)/,
  /^userData\/Code Cache(?:\/|$)/,
  /^userData\/Cookies(?:$|-journal$)/,
  /^userData\/DIPS(?:$|-wal$)/,
  /^userData\/Local Storage(?:\/|$)/,
  /^userData\/Session Storage(?:\/|$)/,
  /^userData\/SharedStorage(?:$|-wal$)/,
  /^userData\/Trust Tokens(?:$|-journal$)/,
];

export async function createHardeningCapabilitySnapshot(options) {
  const root = expandHome(options.root ?? DEFAULT_ROOT);
  const sourceBase = resolve(expandHome(requiredString(options.sourceBase, "sourceBase")));
  const sourceWorkspace = resolve(expandHome(options.sourceWorkspace ?? join(sourceBase, "workspace")));
  const sourceUserData = resolve(expandHome(options.sourceUserData ?? join(sourceBase, "userData")));
  const group = safeSegment(options.group ?? "shared-secrets");
  const name = safeSegment(options.name ?? `${machineId()}-${group}`);
  const snapshotId = safeSegment(options.snapshotId ?? `${name}-${timestampForPath(new Date())}`);
  const destination = resolve(expandHome(options.destination ?? join(root, "snapshots", group, snapshotId)));

  if (!existsSync(sourceWorkspace)) throw new Error(`Source workspace does not exist: ${sourceWorkspace}`);
  if (!existsSync(sourceUserData)) throw new Error(`Source userData does not exist: ${sourceUserData}`);
  if (existsSync(destination)) throw new Error(`Snapshot destination already exists: ${destination}`);

  const containsSecrets = options.containsSecrets === true;
  const requestedRoots = snapshotRoots({ containsSecrets, includeAmbientCodexState: options.includeAmbientCodexState !== false });
  const copiedRoots = [];
  const missingOptionalRoots = [];

  await mkdir(destination, { recursive: true, mode: 0o700 });
  await writeFile(join(destination, ".gitignore"), "*\n", { encoding: "utf8", mode: 0o600 });
  await writeFile(join(dirname(dirname(destination)), ".gitignore"), "*\n", { encoding: "utf8", mode: 0o600 }).catch(() => undefined);

  for (const rootSpec of requestedRoots) {
    const sourceRoot = rootSpec.source === "workspace" ? sourceWorkspace : sourceUserData;
    const sourcePath = join(sourceRoot, rootSpec.relativePath);
    const targetPath = join(destination, rootSpec.source, rootSpec.relativePath);
    if (!existsSync(sourcePath)) {
      if (rootSpec.required) throw new Error(`Required snapshot root is missing: ${sourcePath}`);
      missingOptionalRoots.push(`${rootSpec.source}/${rootSpec.relativePath}`);
      continue;
    }
    await mkdir(dirname(targetPath), { recursive: true });
    await cp(sourcePath, targetPath, {
      recursive: true,
      preserveTimestamps: true,
      errorOnExist: false,
      force: false,
      dereference: false,
      filter: (candidate) => shouldCopySnapshotPath({ sourceRoot, sourceKind: rootSpec.source, candidate, containsSecrets }),
    });
    copiedRoots.push(`${rootSpec.source}/${rootSpec.relativePath}`);
  }

  const sourceReport = await validateHardeningCapabilitySnapshotSource({
    sourceWorkspace,
    sourceUserData,
    containsSecrets,
    expectedSecretEnv: options.expectedSecretEnv ?? [],
    expectAmbientApiKey: options.expectAmbientApiKey === true,
    expectGoogleWorkspace: options.expectGoogleWorkspace === true,
  });
  const snapshotReport = await validateHardeningCapabilitySnapshotSource({
    sourceWorkspace: join(destination, "workspace"),
    sourceUserData: join(destination, "userData"),
    containsSecrets,
    expectedSecretEnv: options.expectedSecretEnv ?? [],
    expectAmbientApiKey: options.expectAmbientApiKey === true,
    expectGoogleWorkspace: options.expectGoogleWorkspace === true,
  });
  const files = await inventoryFiles(destination);
  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    snapshotId,
    name,
    group,
    createdAt: new Date().toISOString(),
    localOnly: true,
    portable: false,
    containsSecrets,
    doNotCommit: true,
    sourceBase,
    sourceWorkspace,
    sourceUserData,
    destination,
    copiedRoots,
    missingOptionalRoots,
    expectations: {
      ambientApiKey: options.expectAmbientApiKey === true,
      googleWorkspace: options.expectGoogleWorkspace === true,
      secretEnv: [...(options.expectedSecretEnv ?? [])].sort(),
    },
    verification: {
      source: sourceReport,
      snapshot: snapshotReport,
    },
    inventory: {
      fileCount: files.length,
      totalBytes: files.reduce((sum, file) => sum + file.sizeBytes, 0),
      files,
    },
    notes: [
      "Local hardening snapshot. Do not commit, sync, or share.",
      "Secret values are copied only when --contains-secrets is set and are never printed in this manifest.",
      "Portable capability-base exports should still omit Ambient API keys, provider API keys, browser cookies, and Google OAuth state.",
    ],
  };
  await mkdir(join(destination, "meta"), { recursive: true });
  await writeFile(join(destination, "meta", "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await writeFile(join(destination, "meta", "files.txt"), `${files.map((file) => file.relativePath).join("\n")}\n`, { encoding: "utf8", mode: 0o600 });

  const errors = [...sourceReport.errors, ...snapshotReport.errors];
  if (options.strict && errors.length) {
    throw new Error(`Snapshot verification failed:\n${errors.map((error) => `- ${error}`).join("\n")}`);
  }

  return { destination, manifest };
}

export async function validateHardeningCapabilitySnapshotSource(options) {
  const sourceWorkspace = resolve(expandHome(requiredString(options.sourceWorkspace, "sourceWorkspace")));
  const sourceUserData = resolve(expandHome(requiredString(options.sourceUserData, "sourceUserData")));
  const errors = [];
  const warnings = [];

  const ambientApiKeyPath = join(sourceUserData, "ambient-api-key.enc");
  if (options.expectAmbientApiKey && !nonEmptyFileExists(ambientApiKeyPath)) {
    errors.push(`Ambient API key file is missing or empty: ${ambientApiKeyPath}`);
  }

  const envBindings = await readEnvBindings(sourceWorkspace);
  const builderEnvBindings = await readBuilderEnvBindings(sourceWorkspace);
  const allBindings = [...envBindings, ...builderEnvBindings];
  for (const envName of options.expectedSecretEnv ?? []) {
    const matches = allBindings.filter((binding) => binding.envName === envName);
    if (matches.length === 0) {
      errors.push(`Expected secret env binding is missing: ${envName}`);
      continue;
    }
    for (const binding of matches) {
      const absolutePath = resolve(sourceWorkspace, binding.filePath);
      if (!isPathInside(sourceWorkspace, absolutePath)) {
        errors.push(`Env binding for ${envName} resolves outside the workspace: ${binding.filePath}`);
      } else if (!nonEmptyFileExists(absolutePath)) {
        errors.push(`Env binding for ${envName} points to a missing or empty file: ${binding.filePath}`);
      }
    }
  }

  if (options.expectGoogleWorkspace) {
    const googleRoot = join(sourceUserData, "google-workspace-cli");
    const toolRoot = join(sourceUserData, "tools", "google-workspace-cli");
    if (!existsSync(googleRoot)) {
      errors.push(`Google Workspace config root is missing: ${googleRoot}`);
    } else {
      const readiness = await googleWorkspaceReadiness(googleRoot);
      errors.push(...readiness.errors);
      warnings.push(...readiness.warnings);
    }
    const gwsBinary = await findFileNamed(toolRoot, "gws");
    if (!gwsBinary) {
      errors.push(`Managed Google Workspace CLI binary is missing under: ${toolRoot}`);
    }
  }

  const browserProfilePaths = await findMatchingRelativePaths({ root: dirname(sourceUserData), start: sourceUserData, patterns: BROWSER_PROFILE_RELATIVE_PATH_PATTERNS });
  if (browserProfilePaths.length) {
    warnings.push(`Browser profile/cache state is present in the inspected userData root (${browserProfilePaths.slice(0, 4).join(", ")}${browserProfilePaths.length > 4 ? ", ..." : ""}).`);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    ambientApiKey: {
      configured: nonEmptyFileExists(ambientApiKeyPath),
      relativePath: "userData/ambient-api-key.enc",
    },
    ambientCli: summarizeBindings(envBindings, sourceWorkspace),
    capabilityBuilder: summarizeBindings(builderEnvBindings, sourceWorkspace),
    googleWorkspace: options.expectGoogleWorkspace ? await googleWorkspaceSummary(sourceUserData) : undefined,
  };
}

function snapshotRoots(options) {
  const roots = [
    { source: "userData", relativePath: "preferences.json", required: false },
    { source: "userData", relativePath: "projects.json", required: false },
    { source: "userData", relativePath: "window-state.json", required: false },
    { source: "workspace", relativePath: ".ambient/cli-packages", required: false },
    { source: "workspace", relativePath: ".ambient/capability-builder", required: false },
  ];
  if (options.includeAmbientCodexState) roots.push({ source: "workspace", relativePath: ".ambient-codex", required: false });
  if (options.containsSecrets) {
    roots.push(
      { source: "userData", relativePath: "ambient-api-key.enc", required: false },
      { source: "userData", relativePath: "google-workspace-cli", required: false },
      { source: "userData", relativePath: "tools/google-workspace-cli", required: false },
    );
  }
  return roots;
}

function shouldCopySnapshotPath({ sourceRoot, sourceKind, candidate, containsSecrets }) {
  if (containsSecrets) return true;
  const rel = `${sourceKind}/${relative(sourceRoot, candidate).split(sep).join("/")}`;
  return classifyRelativePath(rel) !== "secret";
}

async function readEnvBindings(workspace) {
  return readBindingFile(join(workspace, ".ambient", "cli-packages", "env-bindings.json"), "ambient-cli");
}

async function readBuilderEnvBindings(workspace) {
  return readBindingFile(join(workspace, ".ambient", "capability-builder", "env-bindings.json"), "capability-builder");
}

async function readBindingFile(path, bindingKind) {
  if (!existsSync(path)) return [];
  const parsed = await readJson(path).catch(() => undefined);
  if (!parsed || !Array.isArray(parsed.bindings)) return [];
  return parsed.bindings.flatMap((binding) => {
    if (!binding || typeof binding !== "object") return [];
    const packageName = stringField(binding.packageName);
    const envName = stringField(binding.envName);
    const filePath = stringField(binding.filePath);
    if (!packageName || !envName || !filePath) return [];
    return [{
      bindingKind,
      packageName,
      sourcePath: stringField(binding.sourcePath),
      envName,
      filePath,
    }];
  });
}

function summarizeBindings(bindings, workspace) {
  return {
    bindingCount: bindings.length,
    bindings: bindings.map((binding) => {
      const absolutePath = resolve(workspace, binding.filePath);
      return {
        bindingKind: binding.bindingKind,
        packageName: binding.packageName,
        ...(binding.sourcePath ? { sourcePath: binding.sourcePath } : {}),
        envName: binding.envName,
        filePath: binding.filePath,
        configured: isPathInside(workspace, absolutePath) && nonEmptyFileExists(absolutePath),
      };
    }),
  };
}

async function googleWorkspaceReadiness(googleRoot) {
  const errors = [];
  const warnings = [];
  const accountsJsonPath = join(googleRoot, "accounts.json");
  if (!nonEmptyFileExists(accountsJsonPath)) errors.push(`Google Workspace accounts file is missing or empty: ${accountsJsonPath}`);
  const accountDirs = await googleWorkspaceAccountDirs(googleRoot);
  if (accountDirs.length === 0) {
    errors.push(`No Google Workspace account config directories found under: ${googleRoot}`);
  }
  for (const account of accountDirs) {
    const accountRoot = join(googleRoot, account);
    for (const fileName of ["client_secret.json", "credentials.enc", "token_cache.json"]) {
      if (!nonEmptyFileExists(join(accountRoot, fileName))) errors.push(`Google Workspace ${account} is missing ${fileName}.`);
    }
    const cacheDir = join(accountRoot, "cache");
    if (!existsSync(cacheDir)) warnings.push(`Google Workspace ${account} has no schema cache directory.`);
  }
  return { errors, warnings };
}

async function googleWorkspaceSummary(userData) {
  const googleRoot = join(userData, "google-workspace-cli");
  const toolRoot = join(userData, "tools", "google-workspace-cli");
  const accounts = existsSync(googleRoot) ? (await googleWorkspaceAccountDirs(googleRoot)).sort() : [];
  return {
    configRootPresent: existsSync(googleRoot),
    accounts,
    managedBinaryPresent: Boolean(await findFileNamed(toolRoot, "gws")),
  };
}

async function googleWorkspaceAccountDirs(googleRoot) {
  const configured = await googleWorkspaceConfiguredAccountDirs(googleRoot);
  if (configured.length) return configured;
  return (await readdir(googleRoot, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name !== "cache")
    .filter((name) => {
      const accountRoot = join(googleRoot, name);
      return ["client_secret.json", "credentials.enc", "token_cache.json"].some((fileName) => existsSync(join(accountRoot, fileName)));
    });
}

async function googleWorkspaceConfiguredAccountDirs(googleRoot) {
  const parsed = await readJson(join(googleRoot, "accounts.json")).catch(() => undefined);
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.accounts)) return [];
  const dirs = [];
  for (const account of parsed.accounts) {
    if (!account || typeof account !== "object") continue;
    const configDir = stringField(account.configDir);
    if (configDir && isPathInside(googleRoot, configDir)) {
      dirs.push(basename(configDir));
      continue;
    }
    const accountId = stringField(account.accountId);
    if (accountId) dirs.push(accountId);
  }
  return [...new Set(dirs)];
}

async function findFileNamed(root, fileName) {
  if (!existsSync(root)) return undefined;
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const fullPath = join(root, entry.name);
    if (entry.isFile() && entry.name === fileName) return fullPath;
    if (entry.isDirectory()) {
      const found = await findFileNamed(fullPath, fileName);
      if (found) return found;
    }
  }
  return undefined;
}

async function inventoryFiles(root) {
  const files = [];
  await collectFiles(root, root, files);
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

async function collectFiles(root, current, files) {
  const entries = await readdir(current, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const fullPath = join(current, entry.name);
    const rel = relative(root, fullPath).split(sep).join("/");
    if (entry.isDirectory()) {
      await collectFiles(root, fullPath, files);
      continue;
    }
    if (!entry.isFile()) continue;
    const info = await stat(fullPath);
    files.push({
      relativePath: rel,
      sizeBytes: info.size,
      mode: modeString(info.mode),
      classification: classifyRelativePath(rel),
      sha256: classifyRelativePath(rel) === "secret" ? undefined : await sha256File(fullPath),
    });
  }
}

async function findMatchingRelativePaths({ root, start, patterns }) {
  const matches = [];
  if (!existsSync(start)) return matches;
  await collectMatchingRelativePaths(root, start, patterns, matches);
  return matches.sort();
}

async function collectMatchingRelativePaths(root, current, patterns, matches) {
  const entries = await readdir(current, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const fullPath = join(current, entry.name);
    const rel = relative(root, fullPath).split(sep).join("/");
    if (patterns.some((pattern) => pattern.test(rel))) matches.push(rel);
    if (entry.isDirectory()) await collectMatchingRelativePaths(root, fullPath, patterns, matches);
  }
}

function classifyRelativePath(relativePath) {
  if (SECRET_RELATIVE_PATH_PATTERNS.some((pattern) => pattern.test(relativePath))) return "secret";
  if (BROWSER_PROFILE_RELATIVE_PATH_PATTERNS.some((pattern) => pattern.test(relativePath))) return "browser-profile";
  return "state";
}

async function sha256File(path) {
  const hash = createHash("sha256");
  hash.update(await readFile(path));
  return `sha256:${hash.digest("hex")}`;
}

function modeString(mode) {
  return `0${(mode & 0o777).toString(8)}`;
}

function timestampForPath(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[:.]/g, "-");
}

function safeSegment(value) {
  const text = String(value).trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!text) throw new Error(`Invalid path segment: ${value}`);
  return text;
}

function machineId() {
  if (process.platform === "darwin") return "primary-mac";
  return `${process.platform}-${process.arch}`;
}

function expandHome(path) {
  const text = String(path);
  return text === "~" ? homedir() : text.startsWith("~/") ? join(homedir(), text.slice(2)) : text;
}

function isPathInside(parent, child) {
  const rel = relative(resolve(parent), resolve(child));
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith(sep) && rel !== "..");
}

function nonEmptyFileExists(path) {
  try {
    const info = statSync(path);
    return info.isFile() && info.size > 0;
  } catch {
    return false;
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function stringField(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requiredString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  return value;
}

function usage() {
  return [
    "Usage:",
    "  node scripts/hardening-capability-snapshot.mjs create --source-base PATH --contains-secrets [options]",
    "  node scripts/hardening-capability-snapshot.mjs validate --workspace PATH --user-data PATH [options]",
    "",
    "Options:",
    "  --root PATH                    Hardening root. Default: ~/.ambient-hardening",
    "  --group NAME                   Snapshot group. Default: shared-secrets",
    "  --name NAME                    Snapshot name prefix.",
    "  --destination PATH             Exact destination path.",
    "  --source-base PATH             Base containing workspace/ and userData/.",
    "  --source-workspace PATH        Override source workspace.",
    "  --source-user-data PATH        Override source userData.",
    "  --contains-secrets             Copy local secret-bearing roots.",
    "  --expect-ambient-api-key       Fail if userData/ambient-api-key.enc is missing.",
    "  --expect-google-workspace      Fail if gws config or managed binary is missing.",
    "  --expect-secret-env NAME       Fail if NAME is not bound to a non-empty workspace secret file. Repeatable.",
    "  --strict                       Exit non-zero on verification errors.",
  ].join("\n");
}

function parseCliArgs(argv) {
  const commandIndex = argv[2] === "--" ? 3 : 2;
  const command = argv[commandIndex] ?? "help";
  const options = { expectedSecretEnv: [] };
  for (let index = commandIndex + 1; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = () => {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) throw new Error(`Missing value for ${arg}`);
      index += 1;
      return next;
    };
    switch (arg) {
      case "--root":
        options.root = value();
        break;
      case "--group":
        options.group = value();
        break;
      case "--name":
        options.name = value();
        break;
      case "--destination":
        options.destination = value();
        break;
      case "--source-base":
        options.sourceBase = value();
        break;
      case "--source-workspace":
        options.sourceWorkspace = value();
        break;
      case "--source-user-data":
        options.sourceUserData = value();
        break;
      case "--workspace":
        options.sourceWorkspace = value();
        break;
      case "--user-data":
        options.sourceUserData = value();
        break;
      case "--contains-secrets":
        options.containsSecrets = true;
        break;
      case "--expect-ambient-api-key":
        options.expectAmbientApiKey = true;
        break;
      case "--expect-google-workspace":
        options.expectGoogleWorkspace = true;
        break;
      case "--expect-secret-env":
        options.expectedSecretEnv.push(value());
        break;
      case "--strict":
        options.strict = true;
        break;
      case "--no-ambient-codex-state":
        options.includeAmbientCodexState = false;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }
  return { command, options };
}

async function main(argv) {
  const { command, options } = parseCliArgs(argv);
  if (command === "help" || options.help) {
    console.log(usage());
    return;
  }
  if (command === "create") {
    const result = await createHardeningCapabilitySnapshot(options);
    console.log(JSON.stringify({
      ok: result.manifest.verification.source.ok && result.manifest.verification.snapshot.ok,
      destination: result.destination,
      errors: [...result.manifest.verification.source.errors, ...result.manifest.verification.snapshot.errors],
      warnings: [...result.manifest.verification.source.warnings, ...result.manifest.verification.snapshot.warnings],
      copiedRoots: result.manifest.copiedRoots,
    }, null, 2));
    return;
  }
  if (command === "validate") {
    const report = await validateHardeningCapabilitySnapshotSource(options);
    if (options.strict && report.errors.length) throw new Error(`Snapshot source validation failed:\n${report.errors.map((error) => `- ${error}`).join("\n")}`);
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main(process.argv).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
