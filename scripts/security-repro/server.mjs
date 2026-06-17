#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const frontendPath = join(repoRoot, "docs", "security-repro-runner.html");
const port = Number(optionValue("--port") ?? process.env.AMBIENT_SECURITY_REPRO_PORT ?? 17391);
const host = requestedHost();

const lastResults = new Map();
let activeRun;

const repros = [
  {
    id: "F-001",
    title: "Workspace-stored provider secrets are agent-readable",
    severity: "critical",
    verdict: "Launch blocker",
    category: "Straightforward",
    docs: ["OWASP LLM02", "OWASP LLM06", "OWASP Secrets Management", "CWE-312"],
    fix: "Move secret values out of the workspace into OS/app-managed storage, store only references in the workspace, and deny/redact legacy secret paths.",
    run: runF001,
  },
  {
    id: "F-002",
    title: "Ambient API key and process environment leak to agent/tool processes",
    severity: "critical",
    verdict: "Launch blocker",
    category: "Straightforward",
    docs: ["CWE-526", "OWASP Logging", "OWASP Secrets Management", "OWASP LLM02"],
    fix: "Stop putting provider keys in global process.env; build minimal child-process env maps and redact all Pi-visible output.",
    run: runF002,
  },
  {
    id: "F-003",
    title: "Workspace-writable authority state enables permission, trust, and audit tampering",
    severity: "critical",
    verdict: "Launch blocker",
    category: "Straightforward",
    docs: ["OWASP A01", "OWASP Authorization", "OWASP LLM06"],
    fix: "Move authority-bearing state to app-managed userData and deny legacy workspace state paths to tools/search/previews.",
    run: runF003,
  },
  {
    id: "F-004",
    title: "Browser credential metadata can be tampered from the workspace",
    severity: "high",
    verdict: "High priority",
    category: "App harness",
    docs: ["OWASP A01", "OWASP Authorization", "CWE-312", "OWASP Secrets Management"],
    fix: "Store credential records outside workspace authority and cryptographically bind origin/account metadata to the encrypted secret.",
    run: runF004,
  },
  {
    id: "F-005",
    title: "Workspace file preview and media serving follow symlinks outside the workspace",
    severity: "critical",
    verdict: "Launch blocker",
    category: "Straightforward",
    docs: ["CWE-59", "CWE-22", "OWASP A01"],
    fix: "Use lstat and realpath before read/write/media operations; reject or prompt on symlinks whose real targets escape the workspace.",
    run: runF005,
  },
  {
    id: "F-006",
    title: "Main renderer is unsandboxed despite a very broad privileged IPC bridge",
    severity: "high",
    verdict: "High priority",
    category: "App harness",
    docs: ["Electron Security Tutorial", "OWASP A05", "OWASP A01"],
    fix: "Enable renderer sandbox where compatible, shrink preload authority, tag IPC by risk, validate senders, and enforce policy in main process.",
    run: runF006,
  },
  {
    id: "F-007",
    title: "Default permission mode is full access",
    severity: "high",
    verdict: "High priority",
    category: "Straightforward",
    docs: ["OWASP LLM06", "OWASP Authorization", "OWASP A01"],
    fix: "Default new workspaces and threads to workspace/review-gated mode; make full access explicit and visible.",
    run: runF007,
  },
  {
    id: "F-008",
    title: "External URL and window open handling allows file and unvalidated targets",
    severity: "high",
    verdict: "High priority",
    category: "Straightforward",
    docs: ["Electron Security Tutorial", "OWASP A01"],
    fix: "Allowlist external URL schemes/origins and move local file open/reveal into explicit local-file APIs.",
    run: runF008,
  },
  {
    id: "F-009",
    title: "Workflow VM runtime limits do not stop synchronous CPU loops",
    severity: "medium",
    verdict: "Risk gate",
    category: "Isolated harness",
    docs: ["Node.js vm docs", "CWE-400", "OWASP LLM10"],
    fix: "Execute generated workflow code in a worker thread or child process with a hard kill boundary and least-authority capabilities.",
    run: runF009,
  },
  {
    id: "F-010",
    title: "Renderer CSP and HTML preview remain loose",
    severity: "high",
    verdict: "High priority",
    category: "App harness",
    docs: ["Electron Security Tutorial", "MDN iframe sandbox", "OWASP LLM05"],
    fix: "Remove unsafe-inline where practical and isolate hostile HTML previews in a no-preload partition/window or remove allow-scripts.",
    run: runF010,
  },
  {
    id: "F-011",
    title: "Production dependency audit has open advisories",
    severity: "medium",
    verdict: "Risk gate",
    category: "Gate test",
    docs: ["OWASP A06", "OWASP A08", "Electron Security Tutorial"],
    fix: "Upgrade affected dependencies or document accepted advisories with reachability, owner, and deadline.",
    run: runF011,
  },
  {
    id: "F-012",
    title: "Release/update hardening needs an explicit production gate",
    severity: "high",
    verdict: "High priority",
    category: "Gate test",
    docs: ["OWASP A08", "OWASP A06", "Electron Security Tutorial"],
    fix: "Require signed/notarized artifacts, update tamper/downgrade checks, production feed restrictions, and entitlement signoff.",
    run: runF012,
  },
  {
    id: "F-013",
    title: "Terminal IPC allows renderer compromise to spawn and drive a shell",
    severity: "critical",
    verdict: "Launch blocker",
    category: "Straightforward",
    docs: ["Electron Security Tutorial", "OWASP Command Injection Defense", "OWASP LLM06"],
    fix: "Gate terminal creation on trusted user intent, derive permission in main process, and require a short-lived visible-session token for writes.",
    run: runF013,
  },
  {
    id: "F-014",
    title: "Generic thread settings IPC can escalate permission mode",
    severity: "critical",
    verdict: "Launch blocker",
    category: "Straightforward",
    docs: ["OWASP A01", "OWASP Authorization", "OWASP LLM06"],
    fix: "Remove permission escalation from generic settings updates and use a dedicated audited main-process confirmation flow.",
    run: runF014,
  },
  {
    id: "F-015",
    title: "Renderer-supplied project paths can rebase workspace authority",
    severity: "critical",
    verdict: "Launch blocker",
    category: "Straightforward",
    docs: ["OWASP A01", "OWASP Authorization", "Electron Security Tutorial"],
    fix: "Use opaque project IDs and resolve paths only from trusted picker results or app-managed registry entries.",
    run: runF015,
  },
];

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${host}:${port}`}`);
    if (!isAllowedRequestOrigin(request)) return forbidden(request, response, "Cross-origin security repro requests are limited to loopback origins.");
    if (request.method === "OPTIONS") return options(request, response);
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/security-repro-runner.html")) {
      return serveFile(request, response, frontendPath, "text/html; charset=utf-8");
    }
    if (request.method === "GET" && url.pathname === "/api/repros") return json(request, response, reproList());
    if (request.method === "GET" && url.pathname === "/api/results") return json(request, response, { results: [...lastResults.values()] });
    if (request.method === "GET" && url.pathname === "/api/health") return json(request, response, { ok: true, repoRoot });
    if (request.method === "POST" && url.pathname === "/api/run-all") return runAll(request, response);
    const singleRunMatch = url.pathname.match(/^\/api\/repros\/(F-\d{3})\/run$/);
    if (request.method === "POST" && singleRunMatch) return runOne(request, response, singleRunMatch[1]);
    response.writeHead(404, responseHeaders(request, { "content-type": "application/json; charset=utf-8" }));
    response.end(JSON.stringify({ error: "not found" }));
  } catch (error) {
    response.writeHead(500, responseHeaders(request, { "content-type": "application/json; charset=utf-8" }));
    response.end(JSON.stringify({ error: errorMessage(error) }));
  }
});

server.listen(port, host, () => {
  console.log(`Security repro runner: http://${host}:${port}/`);
  console.log(`Repo root: ${repoRoot}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1_000).unref();
  });
}

function reproList() {
  return {
    repoRoot,
    repros: repros.map(({ run, ...metadata }) => ({
      ...metadata,
      lastResult: lastResults.get(metadata.id) ?? null,
    })),
  };
}

async function runOne(request, response, id) {
  if (activeRun) return busy(request, response);
  const repro = repros.find((item) => item.id === id);
  if (!repro) {
    response.writeHead(404, responseHeaders(request, { "content-type": "application/json; charset=utf-8" }));
    response.end(JSON.stringify({ error: `Unknown repro ${id}` }));
    return;
  }
  activeRun = id;
  try {
    const result = await runRepro(repro);
    return json(request, response, { result });
  } finally {
    activeRun = undefined;
  }
}

async function runAll(request, response) {
  if (activeRun) return busy(request, response);
  activeRun = "all";
  const results = [];
  try {
    for (const repro of repros) results.push(await runRepro(repro));
    return json(request, response, { results });
  } finally {
    activeRun = undefined;
  }
}

async function runRepro(repro) {
  const startedAt = new Date().toISOString();
  const started = Date.now();
  try {
    const partial = await repro.run();
    const result = {
      id: repro.id,
      title: repro.title,
      severity: repro.severity,
      verdict: repro.verdict,
      category: repro.category,
      status: partial.status,
      summary: partial.summary,
      evidence: partial.evidence ?? [],
      notes: partial.notes ?? [],
      fix: repro.fix,
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
    };
    lastResults.set(repro.id, result);
    return result;
  } catch (error) {
    const result = {
      id: repro.id,
      title: repro.title,
      severity: repro.severity,
      verdict: repro.verdict,
      category: repro.category,
      status: "error",
      summary: errorMessage(error),
      evidence: [],
      notes: ["The repro runner failed before it could produce a meaningful result."],
      fix: repro.fix,
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
    };
    lastResults.set(repro.id, result);
    return result;
  }
}

async function runF001() {
  return withTempDir("ambient-f001-", async (workspace) => {
    const secretDir = join(workspace, ".ambient", "cli-packages", "secrets", "demo");
    await mkdir(secretDir, { recursive: true });
    const sentinel = `fake-secret-${randomUUID()}`;
    const secretPath = join(secretDir, "API_KEY.secret");
    await writeFile(secretPath, sentinel, "utf8");
    const readBack = await readFile(secretPath, "utf8");

    const ambientCli = await sourceHit("src/main/ambientCliPackages.ts", /saveAmbientCliPackageEnvSecret[\s\S]{0,900}writeFile|const secretsRoot = resolve\(workspacePath,\s*"\.ambient",\s*"cli-packages",\s*"secrets"\)/);
    const capability = await sourceHit("src/main/capability-builder/capabilityBuilder.ts", /saveCapabilityBuilderEnvSecret[\s\S]{0,900}writeFile|const secretsRoot = resolve\(workspace,\s*"\.ambient",\s*"capability-builder",\s*"secrets"\)/);
    const permission = await readRepoFile("src/main/permissions/permissionPolicy.ts");
    const explicitSecretDeny = /\.secret|\*\.secret|ambient\/.*secrets/.test(permission);
    const legacyWorkspaceSecretWriter = ambientCli.matched || capability.matched;

    return {
      status: legacyWorkspaceSecretWriter || !explicitSecretDeny ? "inconclusive" : "not-reproduced",
      summary:
        legacyWorkspaceSecretWriter
          ? "Source still appears to write managed secret material under workspace secret paths; inspect whether the legacy save path remains reachable."
          : "Managed secret save paths no longer write workspace-local .secret files, and permission policy denies legacy workspace secret paths.",
      evidence: [
        `Created and read fake secret file at ${basename(secretPath)} inside a temp workspace.`,
        `Secret value hash: ${hash(sentinel)}; raw sentinel was not persisted in this report.`,
        hitText(ambientCli),
        hitText(capability),
        explicitSecretDeny
          ? "Permission policy appears to contain an explicit .secret or .ambient secrets deny pattern; inspect whether the finding is partially remediated."
          : "Permission policy did not show an obvious .secret or .ambient secrets deny pattern.",
      ],
    };
  });
}

async function runF002() {
  const sentinel = `fake-env-${randomUUID()}`;
  const child = await runCommand(process.execPath, ["-e", "process.stdout.write(process.env.AMBIENT_SECURITY_REPRO_SECRET || '')"], {
    env: { ...process.env, AMBIENT_SECURITY_REPRO_SECRET: sentinel },
    timeoutMs: 5_000,
  });
  const credentialStore = await sourceHit("src/main/credentialStore.ts", /process\.env(?:\.|\[['"])(?:AMBIENT_API_KEY|AMBIENT_AGENT_AMBIENT_API_KEY)['"]?\]?\s*=/);
  const toolRunner = await sourceHit("src/main/tool-runtime/toolRunner.ts", /\.\.\.process\.env|env:\s*process\.env/);
  const runtimePath = await sourceHit("src/main/runtimePath.ts", /\.\.\.process\.env/);
  const inherited = child.stdout === sentinel;
  const broadSourceLeak = credentialStore.matched || toolRunner.matched || runtimePath.matched;

  return {
    status: inherited && broadSourceLeak ? "vulnerable" : "not-reproduced",
    summary: broadSourceLeak
      ? "A child process inherited and printed a fake env secret when launched with a broad process.env map; source still shows Ambient API key/process env propagation."
      : "The generic source probes no longer show saved Ambient API key writes or broad process.env inheritance in the runtime child-process helpers.",
    evidence: [
      `Child env sentinel leaked: ${inherited ? "yes" : "no"}. Sentinel hash: ${hash(sentinel)}.`,
      hitText(credentialStore),
      hitText(toolRunner),
      hitText(runtimePath),
      `Child exit code: ${child.code}; signal: ${child.signal ?? "none"}.`,
    ],
  };
}

async function runF003() {
  return withTempDir("ambient-f003-", async (workspace) => {
    const stateDir = join(workspace, ".ambient-codex");
    const statePath = join(stateDir, "state.sqlite");
    await mkdir(stateDir, { recursive: true });
    await writeFile(statePath, "thread=demo\npermission_mode=workspace\n", "utf8");
    await writeFile(statePath, "thread=demo\npermission_mode=full-access\n", "utf8");
    const changed = await readFile(statePath, "utf8");
    const authorityState = await sourceHit("src/main/workspace/workspaceAuthorityState.ts", /authority-state|workspaceAuthorityStatePaths|AUTHORITY_STATE_ROOT/);
    const projectStore = await sourceHit("src/main/projectStore/projectStore.ts", /prepareWorkspaceAuthorityState/);
    const permissionPolicy = await sourceHit("src/main/permissions/permissionPolicy.ts", /isManagedAuthorityPath|Blocked Ambient authority state path|state\.sqlite/);
    const remediated = changed.includes("full-access") && authorityState.matched && projectStore.matched && permissionPolicy.matched;

    return {
      status: remediated ? "not-reproduced" : "inconclusive",
      summary: remediated
        ? "Workspace .ambient-codex/state.sqlite remains just a writable project file; source now opens authority state through an app-managed path and denies legacy authority paths to tools."
        : "The probe could not prove the authority-state migration and legacy path deny boundary from static source checks.",
      evidence: [
        "Created temp workspace .ambient-codex/state.sqlite and changed permission_mode from workspace to full-access; this file should no longer be authoritative.",
        hitText(authorityState),
        hitText(projectStore),
        permissionPolicy.matched
          ? hitText(permissionPolicy)
          : "Permission policy did not show an obvious legacy authority state deny pattern.",
      ],
    };
  });
}

async function runF004() {
  return withTempDir("ambient-f004-", async (workspace) => {
    const credentialDir = join(workspace, ".ambient-codex", "browser");
    const credentialPath = join(credentialDir, "credentials.json");
    await mkdir(credentialDir, { recursive: true });
    const before = {
      credentials: [
        {
          id: "cred-demo",
          label: "Demo",
          username: "user@example.test",
          origin: "https://bank.example.test",
          encryptedPassword: "encrypted-placeholder",
        },
      ],
    };
    await writeFile(credentialPath, JSON.stringify(before, null, 2), "utf8");
    const after = structuredClone(before);
    after.credentials[0].origin = "https://attacker.example.test";
    await writeFile(credentialPath, JSON.stringify(after, null, 2), "utf8");
    const parsed = JSON.parse(await readFile(credentialPath, "utf8"));
    const encryptedUnchanged = parsed.credentials[0].encryptedPassword === before.credentials[0].encryptedPassword;
    const originChanged = parsed.credentials[0].origin !== before.credentials[0].origin;
    const store = await sourceHit("src/main/browser/browserCredentialStore.ts", /encryptedPayload|metadata failed integrity validation|integrity-bound/);
    const authorityState = await sourceHit("src/main/workspace/workspaceAuthorityState.ts", /authority-state|workspaceAuthorityStatePaths|AUTHORITY_STATE_ROOT/);
    const permissionPolicy = await sourceHit("src/main/permissions/permissionPolicy.ts", /browser\/credentials\.json|Blocked Ambient authority state path/);
    const remediated = encryptedUnchanged && originChanged && store.matched && authorityState.matched && permissionPolicy.matched;

    return {
      status: remediated ? "not-reproduced" : "inconclusive",
      summary: remediated
        ? "Workspace browser credential metadata is no longer the authority path, legacy credential paths are denied to tools, and stored credentials bind metadata inside the encrypted payload."
        : "The probe could not prove the credential storage relocation, legacy path deny, and encrypted metadata integrity boundary from static source checks.",
      evidence: [
        `Fake workspace origin changed: ${originChanged ? "yes" : "no"}. Fake encrypted password unchanged: ${encryptedUnchanged ? "yes" : "no"}.`,
        hitText(store),
        hitText(authorityState),
        hitText(permissionPolicy),
      ],
    };
  });
}

async function runF005() {
  return withTempDir("ambient-f005-", async (root) => {
    const workspace = join(root, "workspace");
    await mkdir(workspace, { recursive: true });
    const outside = join(root, "outside-secret.txt");
    const sentinel = `fake-outside-${randomUUID()}`;
    await writeFile(outside, sentinel, "utf8");
    const link = join(workspace, "linked-secret.txt");
    await symlink(outside, link);
    const resolved = resolve(workspace, "linked-secret.txt");
    const lexicalInside = isInside(workspace, resolved);
    const readBack = await readFile(resolved, "utf8");
    const resolver = await sourceHit(
      "src/main/workspace/workspacePathResolver.ts",
      /resolveWorkspacePathForRead|lstat\(|realpath\(|NOFOLLOW_OPEN_FLAG/,
    );
    const workspaceFiles = await sourceHit(
      "src/main/workspace/workspaceFiles.ts",
      /resolveWorkspacePathForRead|prepareWorkspacePathForWrite|NOFOLLOW_OPEN_FLAG/,
    );
    const workspaceMedia = await sourceHit(
      "src/main/workspace/workspaceMedia.ts",
      /resolveWorkspacePathForRead|NOFOLLOW_OPEN_FLAG|realPath/,
    );
    const unsafeWorkspaceFiles = await sourceHit(
      "src/main/workspace/workspaceFiles.ts",
      /stat\(absolutePath\)|open\(absolutePath,\s*["']r["']\)|writeFile\(absolutePath/,
    );
    const remediated =
      lexicalInside &&
      readBack === sentinel &&
      resolver.matched &&
      workspaceFiles.matched &&
      workspaceMedia.matched &&
      !unsafeWorkspaceFiles.matched;

    return {
      status: remediated ? "not-reproduced" : "vulnerable",
      summary:
        "A symlink inside a temp workspace still proves lexical checks are insufficient; the product file/media paths now use a shared lstat/realpath resolver and no-follow opens at the I/O boundary.",
      evidence: [
        `Control symlink: lexical path inside workspace ${lexicalInside ? "yes" : "no"}; raw fs.readFile can still read outside hash ${hash(readBack)}.`,
        hitText(resolver),
        hitText(workspaceFiles),
        hitText(workspaceMedia),
        `Unsafe direct workspace file pattern absent: ${unsafeWorkspaceFiles.matched ? "no" : "yes"}. ${hitText(unsafeWorkspaceFiles)}`,
      ],
    };
  });
}

async function runF006() {
  const main = await readRepoFile("src/main/index.ts");
  const preload = await readRepoFile("src/preload/index.ts");
  const sandboxFalse = /sandbox:\s*false/.test(main);
  const invokeCount = countMatches(preload, /ipcRenderer\.invoke\(/g);
  const handlers = countMatches(main, /ipcMain\.handle\(|registerIpc\(/g);
  const sandboxHit = await sourceHit("src/main/index.ts", /sandbox:\s*false/);

  return {
    status: sandboxFalse && invokeCount > 50 ? "vulnerable" : "not-reproduced",
    summary: `Renderer sandbox setting and preload IPC surface were inspected. Found sandbox:false=${sandboxFalse}, preload invokes=${invokeCount}, handler registrations=${handlers}.`,
    evidence: [
      hitText(sandboxHit),
      `ipcRenderer.invoke count in preload: ${invokeCount}.`,
      `Main handler registration count estimate: ${handlers}.`,
    ],
  };
}

async function runF007() {
  const projectStore = await readRepoFile("src/main/projectStore/projectStore.ts");
  const legacyDefaultPattern =
    /permissionMode:\s*this\.getSetting\(\s*["']permissionMode["']\s*,\s*["']full-access["']\s*\)/.test(projectStore) ||
    /permissionMode:\s*["']full-access["']\s*,/.test(projectStore) ||
    /permission_mode\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+["']full-access["']/.test(projectStore);
  const projectStoreDefault = await sourceHit(
    "src/main/projectStore/projectStore.ts",
    /permissionMode:\s*this\.getSetting\(\s*["']permissionMode["']\s*,\s*["']full-access["']\s*\)|permissionMode:\s*["']full-access["']\s*,|permission_mode\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+["']full-access["']/,
  );
  const privilegedInstall = await sourceHit("src/main/index.ts", /permissionMode\s*===\s*["']full-access["']|full-access[\s\S]{0,160}privileged/i);
  return {
    status: legacyDefaultPattern ? "vulnerable" : "not-reproduced",
    summary: legacyDefaultPattern
      ? "Source still indicates full-access is used as a default or schema default for permission mode."
      : "No full-access default was found by the static probe.",
    evidence: [hitText(projectStoreDefault), hitText(privilegedInstall)],
  };
}

async function runF008() {
  const index = await readRepoFile("src/main/index.ts");
  const policy = await readRepoFile("src/main/externalUrlPolicy.ts").catch(() => "");
  const legacyExternalSchema = /const\s+externalUrlSchema[\s\S]{0,500}file:/.test(index);
  const rawWindowOpenExternal = /setWindowOpenHandler\(\(\{\s*url\s*\}\)\s*=>\s*\{[\s\S]{0,160}shell\.openExternal\(url\)/.test(index);
  const policyRejectsFiles = /Only https links and loopback http links can be opened externally/.test(policy) && !/protocol\s*===\s*["']file:["']/.test(policy);
  const mainGuard = /installExternalNavigationGuards\(mainWindow/.test(index);
  const miniGuard = /installExternalNavigationGuards\(miniWindow/.test(index);
  const internalBrowser = await sourceHit("src/main/internalBrowserHost.ts", /assertAllowedInternalBrowserUrl|isAllowedInternalBrowserUrl/);
  const policyHit = await sourceHit("src/main/externalUrlPolicy.ts", /parseExternalOpenUrl|Only https links and loopback http links can be opened externally/);
  const rawOpenHit = await sourceHit("src/main/index.ts", /setWindowOpenHandler\(\(\{\s*url\s*\}\)\s*=>\s*\{[\s\S]{0,160}shell\.openExternal\(url\)/);

  return {
    status: legacyExternalSchema || rawWindowOpenExternal || !policyRejectsFiles || !mainGuard || !miniGuard ? "vulnerable" : "not-reproduced",
    summary: `External URL source inspection found legacy file allowlist=${legacyExternalSchema}, raw window openExternal=${rawWindowOpenExternal}, policy rejects file=${policyRejectsFiles}, main guard=${mainGuard}, mini guard=${miniGuard}.`,
    evidence: [hitText(policyHit), hitText(rawOpenHit), hitText(internalBrowser)],
  };
}

async function runF009() {
  const hardKillGate = await runCommand(process.execPath, ["scripts/workflow-hard-kill-gate.mjs", "--json"], {
    cwd: repoRoot,
    timeoutMs: 120_000,
  });
  const hardKillReport = parseJson(hardKillGate.stdout);
  const loader = await sourceHit("src/main/workflow-program/workflowProgramLoader.ts", /invokeWorkflowVmFunction[\s\S]{0,800}runInContext[\s\S]{0,160}timeout/);
  const callbackGuard = await sourceHit("src/main/workflow-program/workflowProgramLoader.ts", /sandboxWorkflowStep[\s\S]{0,1200}sandboxVmCallback/);
  const asyncMicrotaskMode = await sourceHit("src/main/workflow-program/workflowProgramLoader.ts", /microtaskMode:\s*["']afterEvaluate["']/);
  const asyncContinuationGuard = await sourceHit(
    "src/main/workflow-program/workflowProgramLoader.ts",
    /scheduleWorkflowVmMicrotaskPump[\s\S]{0,1600}resuming workflow after host call/,
  );
  const asyncRaceGuard = await sourceHit("src/main/workflow-program/workflowProgramLoader.ts", /raceWorkflowVmResult[\s\S]{0,500}timeoutPromise/);
  const validation = await sourceHit("src/main/workflow/workflowSourceValidation.ts", /unbounded while loop|unbounded for loop/);
  const hardKillGatePassed =
    hardKillGate.code === 0 &&
    !hardKillGate.timedOut &&
    hardKillReport?.status === "passed" &&
    Array.isArray(hardKillReport.checks) &&
    hardKillReport.checks.some((check) => check.id === "parent-process-hard-kill-escalation" && check.signal === "SIGKILL");
  const hasRuntimeGuard =
    loader.matched && callbackGuard.matched && asyncMicrotaskMode.matched && asyncContinuationGuard.matched && asyncRaceGuard.matched;

  return {
    status: !hardKillGatePassed || !hasRuntimeGuard ? "vulnerable" : "not-reproduced",
    summary:
      !hardKillGatePassed || !hasRuntimeGuard
        ? `Workflow CPU-loop guard is incomplete. hardKillGate=${hardKillReport?.status ?? "unavailable"}, gateExit=${hardKillGate.code ?? "none"}, gateTimedOut=${hardKillGate.timedOut ? "yes" : "no"}, runtimeGuard=${hasRuntimeGuard}.`
        : "Workflow CPU loops are bounded by VM timeout regressions and an OS-level child-process hard-kill release gate.",
    evidence: [
      `Workflow hard-kill gate status: ${hardKillReport?.status ?? "unavailable"}. Exit code: ${hardKillGate.code ?? "none"}; signal: ${hardKillGate.signal ?? "none"}; timed out: ${hardKillGate.timedOut ? "yes" : "no"}.`,
      ...(hardKillReport?.checks ?? []).map(
        (check) =>
          `${check.id}: ${check.status}; signal=${check.signal ?? "none"}; timedOut=${check.timedOut ? "yes" : "no"}; elapsedMs=${Math.round(check.elapsedMs ?? 0)}; ${check.summary ?? ""}`,
      ),
      hitText(loader),
      hitText(callbackGuard),
      hitText(asyncMicrotaskMode),
      hitText(asyncContinuationGuard),
      hitText(asyncRaceGuard),
      hitText(validation),
    ],
    notes: [
      "The hard-kill gate intentionally runs workflow timeout regressions in a child process so the repro server cannot be frozen by a malicious loop.",
      "Phase 6A covers synchronous generated-code CPU loops; Phase 6B adds VM microtask pumping and rejection races for async continuations after awaited host calls; Phase 6E adds the OS-level child-process hard-kill release gate.",
    ],
  };
}

async function runF010() {
  const html = await readRepoFile("src/renderer/index.html");
  const looseCsp =
    /script-src[^;]*'unsafe-inline'/.test(html) ||
    /frame-src[^;]*\bdata:/.test(html) ||
    /img-src[^;]*\bfile:/.test(html);
  const htmlHit = await sourceHit("src/renderer/index.html", /script-src[^;]*'unsafe-inline'|frame-src[^;]*\bdata:|img-src[^;]*\bfile:/);
  const appScripts = await sourceHit("src/renderer/src/App.tsx", /sandbox=["']allow-scripts["']|srcDoc=/);
  return {
    status: looseCsp || appScripts.matched ? "vulnerable" : "not-reproduced",
    summary:
      looseCsp || appScripts.matched
        ? "Static probe found loose renderer CSP or srcDoc preview script allowance."
        : "Static probe did not find inline-script CSP, data/file frame/image sinks, or allow-scripts/srcDoc preview patterns.",
    evidence: [hitText(htmlHit), hitText(appScripts)],
  };
}

async function runF011() {
  const gate = await runCommand(process.execPath, ["scripts/dependency-audit-gate.mjs", "--json"], {
    cwd: repoRoot,
    timeoutMs: 60_000,
  });
  const output = `${gate.stdout}\n${gate.stderr}`.trim();
  const parsed = parseJson(gate.stdout);
  const passed = gate.code === 0 && parsed?.status === "passed";
  const advisoryCount = typeof parsed?.advisoryCount === "number" ? parsed.advisoryCount : countAdvisories(parsed, output);
  return {
    status: passed ? "not-reproduced" : "vulnerable",
    summary:
      passed
        ? "Dependency audit gate passed with no undocumented production advisories."
        : `Dependency audit gate failed or found undocumented advisories. Advisory estimate: ${advisoryCount}.`,
    evidence: [
      `Command: node scripts/dependency-audit-gate.mjs --json`,
      `Exit code: ${gate.code}; signal: ${gate.signal ?? "none"}; timed out: ${gate.timedOut ? "yes" : "no"}.`,
      `Advisory estimate: ${advisoryCount}.`,
      `Output preview: ${preview(output, 1_200)}`,
    ],
  };
}

async function runF012() {
  const gate = await runCommand(process.execPath, ["scripts/desktop-release-gate.mjs", "--json"], { cwd: repoRoot, timeoutMs: 60_000 });
  const output = `${gate.stdout}\n${gate.stderr}`.trim();
  const parsed = parseJson(gate.stdout);
  const passed = gate.code === 0 && parsed?.status === "passed";

  return {
    status: passed ? "not-reproduced" : "vulnerable",
    summary:
      passed
        ? "Desktop release/update hardening gate passed with production feed restrictions, explicit publish target requirements, and documented entitlement signoff."
        : "Desktop release/update hardening gate failed or could not run.",
    evidence: [
      "Command: node scripts/desktop-release-gate.mjs --json",
      `Exit code: ${gate.code}; signal: ${gate.signal ?? "none"}; timed out: ${gate.timedOut ? "yes" : "no"}.`,
      `Output preview: ${preview(output, 1_200)}`,
    ],
  };
}

async function runF013() {
  const rawWritePreload = await sourceHit("src/preload/index.ts", /writeTerminal|terminal:write/);
  const schemaMode = await sourceHit("src/main/index.ts", /terminalStartSchema[\s\S]{0,300}permissionMode/);
  const startTokenSchema = await sourceHit("src/main/index.ts", /terminalStartSchema[\s\S]{0,300}startToken/);
  const startTokenIssue = await sourceHit("src/main/index.ts", /terminal:request-start[\s\S]{0,500}terminalStartTokens\.issue/);
  const startTokenConsume = await sourceHit("src/main/index.ts", /terminal:start[\s\S]{0,500}terminalStartTokens\.consume/);
  const submitCommandHandler = await sourceHit(
    "src/main/index.ts",
    /terminal:submit-command[\s\S]{0,900}reviewTerminalCommand[\s\S]{0,900}terminals\.write/,
  );
  const legacyWriteHandler = await sourceHit("src/main/index.ts", /terminal:write/);
  const sessionTokenGate = await sourceHit("src/main/terminal/terminalService.ts", /sessionToken[\s\S]{0,1500}Terminal session token is invalid/);
  const shellSpawn = await sourceHit("src/main/terminal/terminalService.ts", /spawn|process\.env|shell/);
  const remediated =
    !rawWritePreload.matched &&
    !legacyWriteHandler.matched &&
    !schemaMode.matched &&
    startTokenSchema.matched &&
    startTokenIssue.matched &&
    startTokenConsume.matched &&
    submitCommandHandler.matched &&
    sessionTokenGate.matched;

  return {
    status: remediated ? "not-reproduced" : "vulnerable",
    summary:
      remediated
        ? "Static IPC probe found token-bound terminal start and command submission paths, with no legacy renderer-exposed raw terminal write handler."
        : "Static IPC probe did not prove token-bound terminal start/write remediation or still found a raw terminal write path.",
    evidence: [
      hitText(rawWritePreload),
      hitText(schemaMode),
      hitText(startTokenSchema),
      hitText(startTokenIssue),
      hitText(startTokenConsume),
      hitText(submitCommandHandler),
      hitText(legacyWriteHandler),
      hitText(sessionTokenGate),
      hitText(shellSpawn),
    ],
  };
}

async function runF014() {
  const genericTypeHit = await sourceHit("src/shared/types.ts", /export interface UpdateThreadSettingsInput \{[^}]*permissionMode/);
  const dedicatedTypeHit = await sourceHit("src/shared/types.ts", /RequestThreadPermissionModeChangeInput[\s\S]{0,240}permissionMode/);
  const preloadHit = await sourceHit("src/preload/index.ts", /updateThreadSettings/);
  const dedicatedPreloadHit = await sourceHit("src/preload/index.ts", /requestThreadPermissionModeChange/);
  const handlerHit = await sourceHit("src/main/index.ts", /thread:update-settings[\s\S]{0,260}parseThreadSettingsUpdate/);
  const dedicatedHandlerHit = await sourceHit("src/main/index.ts", /thread:request-permission-mode-change[\s\S]{0,800}permission-mode-change/);
  const strictSchemaHit = await sourceHit("src/main/thread/threadSettingsAuthority.ts", /updateThreadSettingsSchema[\s\S]{0,360}\.strict\(\)/);
  const storeHit = await sourceHit("src/main/projectStore/projectStore.ts", /updateThreadSettings[\s\S]{0,500}permissionMode/);
  const remediated =
    !genericTypeHit.matched &&
    dedicatedTypeHit.matched &&
    preloadHit.matched &&
    dedicatedPreloadHit.matched &&
    handlerHit.matched &&
    dedicatedHandlerHit.matched &&
    strictSchemaHit.matched;

  return {
    status: remediated ? "not-reproduced" : "vulnerable",
    summary:
      remediated
        ? "Generic thread settings no longer carry permissionMode; permission changes use a dedicated audited IPC path."
        : "Static IPC/store probe still found permissionMode flowing through generic thread settings update or missing dedicated audit flow.",
    evidence: [
      `Generic settings type still includes permissionMode: ${genericTypeHit.matched ? "yes" : "no"}. ${hitText(genericTypeHit)}`,
      hitText(dedicatedTypeHit),
      hitText(preloadHit),
      hitText(dedicatedPreloadHit),
      hitText(handlerHit),
      hitText(dedicatedHandlerHit),
      hitText(strictSchemaHit),
      hitText(storeHit),
    ],
  };
}

async function runF015() {
  const selectTypeHit = await sourceHit("src/shared/types.ts", /interface SelectProjectInput[\s\S]{0,160}workspacePath/);
  const actionTypeHit = await sourceHit("src/shared/types.ts", /interface ProjectActionInput[\s\S]{0,120}workspacePath/);
  const boardTypeHit = await sourceHit("src/shared/types.ts", /interface CreateProjectBoardInput[\s\S]{0,180}workspacePath/);
  const projectIdTypeHit = await sourceHit("src/shared/types.ts", /interface SelectProjectInput[\s\S]{0,160}projectId/);
  const threadActionRawPathHit = await sourceHit("src/shared/types.ts", /interface ThreadActionInput[\s\S]{0,160}workspacePath/);
  const threadActionProjectIdHit = await sourceHit("src/shared/types.ts", /interface ThreadActionInput[\s\S]{0,160}projectId/);
  const resolverHit = await sourceHit("src/main/projectRegistry.ts", /resolveProjectId[\s\S]{0,500}projectIdFromWorkspacePath/);
  const selectRawHit = await sourceHit("src/main/index.ts", /project:select[\s\S]{0,500}switchWorkspace\(input\.workspacePath/);
  const boardRawHit = await sourceHit("src/main/index.ts", /project-board:create[\s\S]{0,500}switchWorkspace\(input\.workspacePath/);
  const handlerResolverHit = await sourceHit("src/main/index.ts", /project:select[\s\S]{0,500}resolveRegisteredProjectPath[\s\S]{0,500}switchWorkspace\(workspacePath/);
  const threadActionResolverHit = await sourceHit("src/main/index.ts", /threadActionWorkspacePath[\s\S]{0,260}resolveRegisteredProjectPath\(input\.projectId\)/);
  const remediated =
    !selectTypeHit.matched &&
    !actionTypeHit.matched &&
    !boardTypeHit.matched &&
    !threadActionRawPathHit.matched &&
    !selectRawHit.matched &&
    !boardRawHit.matched &&
    projectIdTypeHit.matched &&
    threadActionProjectIdHit.matched &&
    resolverHit.matched &&
    handlerResolverHit.matched &&
    threadActionResolverHit.matched;

  return {
    status: remediated ? "not-reproduced" : "vulnerable",
    summary:
      remediated
        ? "Static IPC probe found project and thread actions using registry-resolved projectId values instead of renderer-supplied workspace paths."
        : "Static IPC probe still found renderer workspacePath project/thread actions or did not prove registry-backed projectId resolution.",
    evidence: [
      hitText(selectTypeHit),
      hitText(actionTypeHit),
      hitText(boardTypeHit),
      hitText(projectIdTypeHit),
      hitText(threadActionRawPathHit),
      hitText(threadActionProjectIdHit),
      hitText(resolverHit),
      hitText(selectRawHit),
      hitText(boardRawHit),
      hitText(handlerResolverHit),
      hitText(threadActionResolverHit),
    ],
  };
}

async function withTempDir(prefix, fn) {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function sourceHit(relPath, pattern) {
  try {
    const text = await readRepoFile(relPath);
    const match =
      typeof pattern === "string"
        ? (() => {
            const index = text.indexOf(pattern);
            return index >= 0 ? { index, text: pattern } : undefined;
          })()
        : (() => {
            const found = text.match(pattern);
            return found ? { index: found.index ?? text.indexOf(found[0]), text: found[0] } : undefined;
          })();
    if (match) {
      const line = text.slice(0, match.index).split(/\r?\n/).length;
      const lineText = text.split(/\r?\n/)[line - 1]?.trim();
      return {
        file: relPath,
        line,
        snippet: lineText || match.text.split(/\r?\n/)[0]?.trim(),
        matched: true,
      };
    }
    return {
      file: relPath,
      matched: false,
    };
  } catch (error) {
    return {
      file: relPath,
      matched: false,
      error: errorMessage(error),
    };
  }
}

function hitText(hit) {
  if (hit.error) return `${hit.file}: unable to inspect (${hit.error})`;
  if (!hit.matched) return `${hit.file}: pattern not found`;
  return `${hit.file}${hit.line ? `:${hit.line}` : ""}: ${hit.snippet ? preview(hit.snippet, 240) : "pattern found"}`;
}

async function readRepoFile(relPath) {
  const abs = resolve(repoRoot, relPath);
  if (!isInside(repoRoot, abs)) throw new Error(`Refusing to read outside repo: ${relPath}`);
  return readFile(abs, "utf8");
}

function isInside(root, candidate) {
  const rel = relative(resolve(root), resolve(candidate));
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith("/") && rel !== "..");
}

function countMatches(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

function hash(value) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 16);
}

function preview(value, maxLength = 500) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function countAdvisories(parsed, output) {
  if (parsed?.advisories && typeof parsed.advisories === "object") return Object.keys(parsed.advisories).length;
  const vulnerabilities = parsed?.metadata?.vulnerabilities;
  if (vulnerabilities && typeof vulnerabilities === "object") {
    return Object.entries(vulnerabilities)
      .filter(([key]) => key !== "total")
      .reduce((sum, [, value]) => sum + Number(value || 0), 0);
  }
  const ghsaCount = new Set([...String(output).matchAll(/GHSA-[a-z0-9-]+/gi)].map((match) => match[0].toUpperCase())).size;
  if (ghsaCount > 0) return ghsaCount;
  return /vulnerab|advisory|severity/i.test(String(output)) ? 1 : 0;
}

async function commandExists(command) {
  const paths = String(process.env.PATH || "").split(":").filter(Boolean);
  for (const path of paths) {
    const candidate = join(path, command);
    try {
      await access(candidate, fsConstants.X_OK);
      return true;
    } catch {
      // Keep searching.
    }
  }
  return false;
}

function runCommand(command, args, options = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, options.timeoutMs ?? 10_000);
    const append = (target, chunk) => {
      const next = target + chunk.toString("utf8");
      return next.length > 200_000 ? next.slice(-200_000) : next;
    };
    child.stdout.on("data", (chunk) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = append(stderr, chunk);
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      resolveRun({ code: undefined, signal: undefined, stdout, stderr, timedOut, error: errorMessage(error) });
    });
    child.once("close", (code, signal) => {
      clearTimeout(timeout);
      resolveRun({ code, signal, stdout, stderr, timedOut });
    });
  });
}

function optionValue(name) {
  const arg = process.argv.find((item) => item === name || item.startsWith(`${name}=`));
  if (!arg) return undefined;
  if (arg === name) return process.argv[process.argv.indexOf(arg) + 1];
  return arg.slice(name.length + 1);
}

function requestedHost() {
  const value = optionValue("--host") ?? process.env.AMBIENT_SECURITY_REPRO_HOST ?? "127.0.0.1";
  if (value !== "127.0.0.1") {
    console.error(`Refusing to bind security repro server to non-loopback host: ${value}`);
    process.exit(1);
  }
  return value;
}

function json(request, response, value) {
  response.writeHead(200, responseHeaders(request, { "content-type": "application/json; charset=utf-8" }));
  response.end(JSON.stringify(value, null, 2));
}

function busy(request, response) {
  response.writeHead(409, responseHeaders(request, { "content-type": "application/json; charset=utf-8" }));
  response.end(JSON.stringify({ error: `A repro run is already active: ${activeRun}` }));
}

function options(request, response) {
  response.writeHead(204, responseHeaders(request));
  response.end();
}

function forbidden(request, response, message) {
  response.writeHead(403, responseHeaders(request, { "content-type": "application/json; charset=utf-8" }, { includeCors: false }));
  response.end(JSON.stringify({ error: message }));
}

async function serveFile(request, response, filePath, contentType) {
  const text = await readFile(filePath);
  response.writeHead(200, responseHeaders(request, { "content-type": contentType }));
  response.end(text);
}

function responseHeaders(request, extra = {}, options = {}) {
  const headers = {
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...extra,
  };
  const allowedOrigin = options.includeCors === false ? undefined : allowedCorsOrigin(request);
  if (allowedOrigin) {
    headers["access-control-allow-origin"] = allowedOrigin;
    headers["access-control-allow-methods"] = "GET,POST,OPTIONS";
    headers["access-control-allow-headers"] = "content-type";
    headers.vary = "Origin";
  }
  return headers;
}

function isAllowedRequestOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  return Boolean(allowedCorsOrigin(request));
}

function allowedCorsOrigin(request) {
  const origin = request.headers.origin;
  if (!origin || Array.isArray(origin)) return undefined;
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== "http:") return undefined;
    return isLoopbackHostname(parsed.hostname) ? parsed.origin : undefined;
  } catch {
    return undefined;
  }
}

function isLoopbackHostname(hostname) {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1" || hostname === "[::1]";
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
