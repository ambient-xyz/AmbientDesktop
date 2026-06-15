import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const DEFAULT_AUDIT_COMMAND = ["pnpm", "audit", "--prod", "--json"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function evaluateDependencyAuditGate({ repoRoot, timeoutMs = 60_000, currentDate = new Date() }) {
  const baseFacts = await readDependencyAuditGateStaticFacts(repoRoot);
  const commandResult = await runCommand(DEFAULT_AUDIT_COMMAND[0], DEFAULT_AUDIT_COMMAND.slice(1), {
    cwd: repoRoot,
    timeoutMs,
  });
  const auditParse = parseJson(commandResult.stdout);

  return evaluateDependencyAuditGateFacts({
    ...baseFacts,
    audit: auditParse.value,
    auditParseError: auditParse.error,
    auditCommandResult: commandResult,
    currentDate,
  });
}

export async function readDependencyAuditGateStaticFacts(repoRoot) {
  const packageJson = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8"));
  const policy = JSON.parse(await readFile(join(repoRoot, "build", "dependency-advisory-policy.json"), "utf8"));
  const policyDocument = await readFile(join(repoRoot, "docs", "dependency-advisory-policy.md"), "utf8");
  return { packageJson, policy, policyDocument };
}

export function evaluateDependencyAuditGateFacts(facts) {
  const audit = facts.audit && typeof facts.audit === "object" ? facts.audit : {};
  const policy = facts.policy && typeof facts.policy === "object" ? facts.policy : {};
  const advisories = Object.values(audit.advisories ?? {});
  const acceptedAdvisories = policy.acceptedAdvisories ?? {};
  const currentDate = normalizeDate(facts.currentDate ?? new Date());

  const checks = [
    auditCommandCheck(facts),
    packageDependencyCheck(facts.packageJson, policy),
    packageOverrideCheck(facts.packageJson, policy),
    packageScriptCheck(facts.packageJson),
    policyDocumentCheck(facts.policyDocument, policy),
    ...advisories.map((advisory) => advisoryCheck(advisory, acceptedAdvisories, currentDate)),
    staleAcceptedAdvisoriesCheck(advisories, acceptedAdvisories),
  ];
  const issues = checks.filter((check) => check.status === "fail").map((check) => check.issue);
  const acceptedCount = checks.filter((check) => check.name.startsWith("accepted advisory ")).length;

  return {
    status: issues.length === 0 ? "passed" : "failed",
    generatedAt: new Date().toISOString(),
    summary:
      issues.length === 0
        ? `Dependency audit gate passed with ${advisories.length} current advisory record${advisories.length === 1 ? "" : "s"} and ${acceptedCount} accepted risk record${acceptedCount === 1 ? "" : "s"}.`
        : `Dependency audit gate failed with ${issues.length} issue${issues.length === 1 ? "" : "s"}.`,
    advisoryCount: advisories.length,
    acceptedAdvisoryCount: acceptedCount,
    auditExitCode: facts.auditCommandResult?.code ?? null,
    issues,
    checks,
  };
}

function auditCommandCheck(facts) {
  const result = facts.auditCommandResult;
  const allowedExit = result ? result.code === 0 || result.code === 1 : true;
  const ok =
    !facts.auditParseError &&
    (!result || (!result.timedOut && allowedExit && !result.error && facts.audit && typeof facts.audit === "object"));
  const evidence = result
    ? `exit=${result.code}; signal=${result.signal ?? "none"}; timedOut=${result.timedOut ? "yes" : "no"}; parseError=${facts.auditParseError ?? "none"}`
    : `static evaluation; parseError=${facts.auditParseError ?? "none"}`;
  return check(
    "production dependency audit command",
    ok,
    "Dependency audit gate must receive valid JSON from pnpm audit --prod --json with only normal audit exit codes.",
    evidence,
  );
}

function packageDependencyCheck(packageJson, policy) {
  const expected = policy.requiredPackageDependencies ?? {};
  const actual = packageJson?.dependencies ?? {};
  const missing = Object.entries(expected)
    .filter(([name, version]) => actual[name] !== version)
    .map(([name, version]) => `${name}@${version}`);
  return check(
    "patched advisory direct dependencies",
    missing.length === 0,
    "package.json dependencies must keep direct patched dependency upgrades listed in build/dependency-advisory-policy.json.",
    `missing=${JSON.stringify(missing)}`,
  );
}

function packageOverrideCheck(packageJson, policy) {
  const expected = policy.requiredPackageOverrides ?? {};
  const actual = packageJson?.pnpm?.overrides ?? {};
  const missing = Object.entries(expected)
    .filter(([name, version]) => actual[name] !== version)
    .map(([name, version]) => `${name}@${version}`);
  return check(
    "patched advisory package overrides",
    missing.length === 0,
    "package.json pnpm.overrides must pin patched transitive dependencies listed in build/dependency-advisory-policy.json.",
    `missing=${JSON.stringify(missing)}`,
  );
}

function packageScriptCheck(packageJson) {
  return check(
    "package dependency audit gate script",
    packageJson?.scripts?.["test:dependency-audit-gate"] === "node scripts/dependency-audit-gate.mjs",
    "package.json must expose the local production dependency audit gate.",
    `script=${packageJson?.scripts?.["test:dependency-audit-gate"]}`,
  );
}

function policyDocumentCheck(document, policy) {
  const acceptedIds = Object.keys(policy.acceptedAdvisories ?? {});
  const requiredFragments = [policy.auditCommand, "build/dependency-advisory-policy.json", ...acceptedIds].filter(Boolean);
  const missing = requiredFragments.filter((fragment) => !document?.includes(fragment));
  return check(
    "dependency advisory policy document",
    missing.length === 0,
    "docs/dependency-advisory-policy.md must document the audit command and every accepted advisory.",
    `missing=${JSON.stringify(missing)}`,
  );
}

function advisoryCheck(advisory, acceptedAdvisories, currentDate) {
  const id = advisory.github_advisory_id ?? String(advisory.id);
  const accepted = acceptedAdvisories[id];
  if (!accepted) {
    return check(
      `undocumented advisory ${id}`,
      false,
      `${id} (${advisory.module_name ?? "unknown module"}) is present in the production dependency audit without an accepted-risk record.`,
      `severity=${advisory.severity}; paths=${JSON.stringify(advisoryPaths(advisory))}`,
    );
  }

  const problems = acceptedAdvisoryProblems(advisory, accepted, currentDate);
  return check(
    `accepted advisory ${id}`,
    problems.length === 0,
    `${id} accepted-risk record is stale, incomplete, or no longer matches the production audit.`,
    `problems=${JSON.stringify(problems)}`,
  );
}

function staleAcceptedAdvisoriesCheck(advisories, acceptedAdvisories) {
  const currentIds = new Set(advisories.map((advisory) => advisory.github_advisory_id ?? String(advisory.id)));
  const stale = Object.keys(acceptedAdvisories).filter((id) => !currentIds.has(id));
  return check(
    "stale accepted advisory records",
    stale.length === 0,
    "Accepted-risk records must be removed once the advisory no longer appears in the production audit.",
    `stale=${JSON.stringify(stale)}`,
  );
}

function acceptedAdvisoryProblems(advisory, accepted, currentDate) {
  const problems = [];
  const paths = advisoryPaths(advisory);
  const acceptedPaths = Array.isArray(accepted.paths) ? accepted.paths : [];
  const cves = Array.isArray(advisory.cves) ? advisory.cves : [];
  const acceptedCves = Array.isArray(accepted.cves) ? accepted.cves : [];

  if (accepted.module !== advisory.module_name) problems.push(`module expected ${advisory.module_name}, found ${accepted.module}`);
  if (accepted.severity !== advisory.severity) problems.push(`severity expected ${advisory.severity}, found ${accepted.severity}`);
  if (accepted.patchedVersions !== advisory.patched_versions) {
    problems.push(`patchedVersions expected ${advisory.patched_versions}, found ${accepted.patchedVersions}`);
  }
  if (advisory.patched_versions && advisory.patched_versions !== "<0.0.0" && accepted.acceptPatchedAdvisory !== true) {
    problems.push("patched advisory cannot be accepted without acceptPatchedAdvisory=true");
  }
  for (const cve of cves) {
    if (!acceptedCves.includes(cve)) problems.push(`missing CVE ${cve}`);
  }
  for (const path of paths) {
    if (!acceptedPaths.includes(path)) problems.push(`undocumented path ${path}`);
  }
  if (paths.length === 0) problems.push("audit advisory had no finding paths");
  if (typeof accepted.owner !== "string" || accepted.owner.trim().length === 0) problems.push("missing owner");
  if (typeof accepted.rationale !== "string" || accepted.rationale.trim().length < 80) problems.push("rationale too short");
  if (typeof accepted.requiredAction !== "string" || accepted.requiredAction.trim().length < 30) {
    problems.push("requiredAction too short");
  }
  if (typeof accepted.reviewBy !== "string" || !DATE_RE.test(accepted.reviewBy)) {
    problems.push("reviewBy must use YYYY-MM-DD");
  } else if (accepted.reviewBy < currentDate) {
    problems.push(`reviewBy ${accepted.reviewBy} is before current date ${currentDate}`);
  }

  return problems;
}

function advisoryPaths(advisory) {
  const paths = new Set();
  for (const finding of advisory.findings ?? []) {
    for (const path of finding.paths ?? []) paths.add(path);
  }
  return [...paths].sort();
}

function check(name, ok, issue, evidence) {
  return {
    name,
    status: ok ? "pass" : "fail",
    evidence,
    ...(ok ? {} : { issue }),
  };
}

function normalizeDate(date) {
  if (typeof date === "string") return date.slice(0, 10);
  if (date instanceof Date) return date.toISOString().slice(0, 10);
  return new Date(date).toISOString().slice(0, 10);
}

function parseJson(text) {
  try {
    return { value: text ? JSON.parse(text) : {} };
  } catch (error) {
    return { value: null, error: error instanceof Error ? error.message : String(error) };
  }
}

function runCommand(command, args, { cwd, timeoutMs }) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let killTimer;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), 2_000);
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(killTimer);
      resolve({ code: -1, signal: null, timedOut, error: error.message, stdout, stderr });
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(killTimer);
      resolve({ code, signal, timedOut, stdout, stderr });
    });
  });
}
