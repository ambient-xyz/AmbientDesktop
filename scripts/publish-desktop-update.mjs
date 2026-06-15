#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageJson = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8"));
const args = parseArgs(process.argv.slice(2));
const dryRun = args["dry-run"] !== "false";
const host = optionalString(args.host || process.env.AMBIENT_UPDATE_HOST);
const user = optionalString(args.user || process.env.AMBIENT_UPDATE_USER);
const key = optionalString(args.key || process.env.AMBIENT_UPDATE_SSH_KEY);
const channel = normalizePublishChannel(args.channel || process.env.AMBIENT_UPDATE_CHANNEL || "stable");
const releaseDir = resolve(args["release-dir"] || process.env.AMBIENT_UPDATE_RELEASE_DIR || join(repoRoot, "release"));
const releasePolicyPath = args["policy-file"]
  ? resolve(args["policy-file"])
  : process.env.AMBIENT_UPDATE_POLICY_FILE
    ? resolve(process.env.AMBIENT_UPDATE_POLICY_FILE)
    : join(releaseDir, "release-policy.json");
const remoteRoot = args["remote-root"] || process.env.AMBIENT_UPDATE_REMOTE_ROOT || "/var/www/ambient-desktop-updates";
const version = args.version || packageJson.version;
const remote = host && user ? `${user}@${host}` : "<required-for-upload>";
const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
const stagingDir = `${remoteRoot}/.staging/${channel}-${version}-${timestamp}`;
const channelDir = `${remoteRoot}/desktop/${channel}`;

const artifacts = await collectArtifacts(releaseDir);
if (artifacts.length === 0) {
  throw new Error(`No update artifacts found in ${releaseDir}. Run pnpm run dist first.`);
}
const aliases = stableAliasesForArtifacts(artifacts);

const tempDir = await mkdtemp(join(tmpdir(), "ambient-desktop-update-"));
try {
  const releaseJsonPath = join(tempDir, "release.json");
  const releasePolicy = await readReleasePolicy(releasePolicyPath);
  const manifest = {
    product: "Ambient Desktop",
    version,
    channel,
    generatedAt: new Date().toISOString(),
    ...releasePolicy,
    artifacts: await Promise.all(
      artifacts.map(async (file) => ({
        file: basename(file),
        size: (await stat(file)).size,
        sha256: await sha256File(file),
      })),
    ),
  };
  await writeFile(releaseJsonPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const uploadFiles = [...artifacts, releaseJsonPath];

  printPlan(uploadFiles, releasePolicy);
  if (dryRun) {
    console.log("\nDry run only. Pass --dry-run=false to upload.");
  } else {
    requirePublishTarget({ host, user, key });
    await run("ssh", sshArgs(`mkdir -p ${sh(stagingDir)} ${sh(`${remoteRoot}/desktop`)}`));
    for (const file of uploadFiles) {
      await run("scp", ["-i", key, "-o", "IdentitiesOnly=yes", "-o", "StrictHostKeyChecking=accept-new", file, `${remote}:${stagingDir}/`]);
    }
    await run(
      "ssh",
      sshArgs(
        [
          `cd ${sh(stagingDir)}`,
          ...aliases.map(({ alias, target }) => `ln -sfn ${sh(target)} ${sh(alias)}`),
          "find . -maxdepth 1 \\( -type f -o -type l \\) ! -name SHA256SUMS -printf '%P\\0' | sort -z | xargs -0 sha256sum > SHA256SUMS",
          `ln -sfn ${sh(stagingDir)} ${sh(channelDir)}`,
          `find ${sh(remoteRoot)}/.staging -maxdepth 1 -type d -mtime +30 -print`,
        ].join(" && "),
      ),
    );
    console.log(`Published Ambient Desktop ${version} to https://updates.ambient.xyz/desktop/${channel}/`);
  }
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

function parseArgs(items) {
  const parsed = {};
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item === "--") continue;
    if (!item.startsWith("--")) continue;
    const [keyPart, inlineValue] = item.slice(2).split("=", 2);
    parsed[keyPart] = inlineValue ?? (items[index + 1]?.startsWith("--") ? "true" : items[++index] ?? "true");
  }
  return parsed;
}

function normalizePublishChannel(value) {
  const channel = String(value || "stable").trim().toLowerCase();
  if (channel !== "stable" && channel !== "beta") {
    throw new Error(`Desktop update channel must be stable or beta, got ${JSON.stringify(value)}.`);
  }
  return channel;
}

function requirePublishTarget(target) {
  const missing = [];
  if (!target.host) missing.push("--host or AMBIENT_UPDATE_HOST");
  if (!target.user) missing.push("--user or AMBIENT_UPDATE_USER");
  if (!target.key) missing.push("--key or AMBIENT_UPDATE_SSH_KEY");
  if (missing.length > 0) {
    throw new Error(`Publishing requires an explicit upload target: ${missing.join(", ")}.`);
  }
}

function optionalString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

async function collectArtifacts(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const allowed = /^(latest.*\.ya?ml|.*\.(dmg|zip|exe|AppImage|appimage|deb|blockmap)|release-notes\.md)$/;
  return entries
    .filter((entry) => entry.isFile() && allowed.test(entry.name))
    .map((entry) => join(directory, entry.name))
    .sort();
}

async function sha256File(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

function printPlan(files, releasePolicy) {
  console.log("Ambient Desktop update publish plan");
  console.log(`- host: ${remote}`);
  console.log(`- channel: ${channel}`);
  console.log(`- release dir: ${releaseDir}`);
  console.log(`- staging dir: ${stagingDir}`);
  console.log(`- public symlink: ${channelDir}`);
  console.log("- services touched: none");
  console.log("- files:");
  for (const file of files) console.log(`  - ${file}`);
  if (aliases.length > 0) {
    console.log("- stable aliases:");
    for (const { alias, target } of aliases) console.log(`  - ${alias} -> ${target}`);
  }
  if (Object.keys(releasePolicy).length > 0) console.log(`- recovery policy: ${releasePolicyPath}`);
}

function sshArgs(command) {
  requirePublishTarget({ host, user, key });
  return ["-i", key, "-o", "IdentitiesOnly=yes", "-o", "StrictHostKeyChecking=accept-new", remote, command];
}

function run(command, commandArgs) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, commandArgs, { stdio: "inherit" });
    child.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} exited with ${code}`));
    });
    child.on("error", reject);
  });
}

function sh(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function stableAliasesForArtifacts(files) {
  const names = files.map((file) => basename(file));
  const specs = [
    { alias: "ambient-desktop-latest-mac-arm64.dmg", match: /-mac-arm64\.dmg$/ },
    { alias: "ambient-desktop-latest-mac-arm64.zip", match: /-mac-arm64\.zip$/ },
    { alias: "ambient-desktop-latest-linux-x86_64.AppImage", match: /-linux-x86_64\.AppImage$/ },
    { alias: "ambient-desktop-latest-linux-amd64.deb", match: /-linux-amd64\.deb$/ },
    { alias: "ambient-desktop-latest-win-x64.exe", match: /-win-x64\.exe$/ },
    { alias: "ambient-desktop-latest-win-x64.zip", match: /-win-x64\.zip$/ },
  ];
  return specs
    .map(({ alias, match }) => ({ alias, target: names.find((name) => match.test(name)) }))
    .filter((entry) => entry.target);
}

async function readReleasePolicy(file) {
  if (!(await existsAsFile(file))) return {};
  const raw = JSON.parse(await readFile(file, "utf8"));
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`Release policy must be a JSON object: ${file}`);
  }

  const policy = {};
  if (raw.blockedVersions !== undefined) {
    if (!Array.isArray(raw.blockedVersions) || raw.blockedVersions.some((item) => typeof item !== "string")) {
      throw new Error("release-policy.json blockedVersions must be an array of strings.");
    }
    policy.blockedVersions = raw.blockedVersions;
  }
  for (const key of ["forceUpdateBelow", "minimumHealthyVersion", "recoveryMessage"]) {
    if (raw[key] !== undefined) {
      if (typeof raw[key] !== "string") throw new Error(`release-policy.json ${key} must be a string.`);
      policy[key] = raw[key];
    }
  }
  return policy;
}

async function existsAsFile(file) {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}
