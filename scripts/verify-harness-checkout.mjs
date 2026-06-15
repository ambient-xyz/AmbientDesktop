#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_IGNORED_DIRS = new Set([".ambient", ".ambient-codex", ".git", ".pnpm-store", "node_modules", "test-results"]);

export async function verifyHarnessCheckout(options = {}) {
  const root = await canonicalCheckoutRoot(options.cwd ?? process.cwd());
  const issues = [];
  const registeredWorktrees = listRegisteredWorktrees(root);
  for (const worktreePath of registeredWorktrees) {
    if (worktreePath === root) continue;
    if (!isInside(root, worktreePath)) continue;
    const rel = relative(root, worktreePath);
    if (isManagedAmbientStatePath(rel)) continue;
    const hasNodeModules = existsSync(join(worktreePath, "node_modules"));
    if (!hasNodeModules && !rel.startsWith(`.worktrees${sep}`) && rel !== ".worktrees") continue;
    issues.push({
      kind: hasNodeModules ? "nested_worktree_with_node_modules" : "nested_registered_worktree",
      path: rel,
      summary: hasNodeModules
        ? `registered nested worktree has its own node_modules: ${rel}`
        : `registered nested worktree is inside checkout: ${rel}`,
    });
  }
  if (existsSync(join(root, ".worktrees"))) {
    issues.push({
      kind: "nested_worktrees_dir",
      path: ".worktrees",
      summary: "checkout contains a .worktrees directory; live harness worktrees must be outside the app root.",
    });
  }
  for (const issue of await scanForNestedContamination(root)) issues.push(issue);

  const result = {
    schemaVersion: "ambient-harness-checkout-preflight-v1",
    status: issues.length ? "failed" : "passed",
    root,
    issues,
  };
  if (issues.length > 0 && options.throwOnFailure !== false) {
    const error = new Error(formatCheckoutFailure(result));
    error.preflight = result;
    throw error;
  }
  return result;
}

export function formatCheckoutFailure(result) {
  return [
    "Harness checkout preflight failed before live product execution.",
    `Checkout root: ${result.root}`,
    ...result.issues.map((issue) => `- ${issue.kind}: ${issue.path} (${issue.summary})`),
  ].join("\n");
}

async function canonicalCheckoutRoot(cwd) {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`Could not resolve git checkout root from ${cwd}: ${result.stderr.trim()}`);
  }
  return realpath(resolve(result.stdout.trim()));
}

function listRegisteredWorktrees(root) {
  const result = spawnSync("git", ["worktree", "list", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0) return [];
  return result.stdout
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => resolve(line.slice("worktree ".length).trim()));
}

async function scanForNestedContamination(root) {
  const issues = [];
  await visit(root, 0);
  return issues;

  async function visit(dir, depth) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isFile()) continue;
      const absolute = join(dir, entry.name);
      const rel = relative(root, absolute);
      if (depth === 0 && DEFAULT_IGNORED_DIRS.has(entry.name)) continue;
      if (entry.name === ".worktrees") {
        issues.push({
          kind: "nested_worktrees_dir",
          path: rel,
          summary: "live harness worktrees must not be nested under the app checkout.",
        });
        continue;
      }
      if (entry.name === "node_modules" && depth > 0) {
        issues.push({
          kind: "nested_node_modules",
          path: rel,
          summary: "nested node_modules can resolve stale native modules into live Node tests.",
        });
        continue;
      }
      if (entry.name === ".git" && depth > 0) {
        const parent = relative(root, dir);
        if (existsSync(join(dir, "node_modules")) || parent.startsWith(`.worktrees${sep}`)) {
          issues.push({
            kind: "nested_git_checkout",
            path: rel,
            summary: "nested git checkout is in a location that can contaminate harness resolution.",
          });
        }
        continue;
      }
      if (entry.isDirectory()) {
        if (entry.name === "test-results" || entry.name === ".ambient-codex") continue;
        const entryStat = await stat(absolute).catch(() => undefined);
        if (entryStat?.isSymbolicLink()) continue;
        await visit(absolute, depth + 1);
      }
    }
  }
}

function isInside(root, candidate) {
  const rel = relative(root, candidate);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

function isManagedAmbientStatePath(rel) {
  return rel.startsWith(`.ambient-codex${sep}`)
    || rel === ".ambient-codex"
    || rel.startsWith(`test-results${sep}`)
    || rel === "test-results";
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const json = process.argv.includes("--json");
  try {
    const result = await verifyHarnessCheckout();
    if (json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    else process.stdout.write(`Harness checkout preflight passed for ${result.root}.\n`);
  } catch (error) {
    if (json && error.preflight) {
      process.stdout.write(`${JSON.stringify(error.preflight, null, 2)}\n`);
    }
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
