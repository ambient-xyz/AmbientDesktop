#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const packageName = "ambient-blockchain";
const packageVersion = "0.1.16";
const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, "..");
const contractsPath = join(packageRoot, "contracts", "ambient-blockchain-contracts.json");
const defaultRpcUrl = "https://rpc.ambient.xyz";
const defaultWsUrl = "wss://rpc.ambient.xyz";
const base58Alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const readOnlyRpcMethods = new Set([
  "getAccountInfo",
  "getBalance",
  "getBlock",
  "getBlockHeight",
  "getBlockTime",
  "getEpochInfo",
  "getFeeForMessage",
  "getFirstAvailableBlock",
  "getGenesisHash",
  "getHealth",
  "getIdentity",
  "getLatestBlockhash",
  "getMultipleAccounts",
  "getProgramAccounts",
  "getSignaturesForAddress",
  "getSlot",
  "getSlotLeader",
  "getSupply",
  "getTransaction",
  "getVersion",
  "isBlockhashValid"
]);

const blockedRpcMethods = new Set([
  "requestAirdrop",
  "sendRawTransaction",
  "sendTransaction",
  "simulateTransaction"
]);

main().catch((error) => {
  const payload = {
    schemaVersion: "ambient-blockchain-error-v1",
    packageName,
    status: "failed",
    error: errorMessage(error)
  };
  process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exitCode = 1;
});

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.health) options.command = "doctor";
  switch (options.command) {
    case "doctor":
      return commandDoctor(options);
    case "rpc":
      return commandRpc(options);
    case "account":
      return commandAccount(options);
    case "transaction":
      return commandTransaction(options);
    case "program-observe":
      return commandProgramObserve(options);
    case "keypair-status":
      return commandKeypairStatus(options);
    case "approval-verify":
      return commandApprovalVerify(options);
    case "auction-inspect":
      return commandAuctionInspect(options);
    case "oracle-plan":
      return commandOraclePlan(options);
    case "oracle-submit":
      return commandOracleSubmit(options);
    case "oracle-wait":
      return commandOracleWait(options);
    case "oracle-decode":
      return commandOracleDecode(options);
    case "oracle-reclaim-plan":
      return commandOracleReclaimPlan(options);
    case "oracle-reclaim-execute":
      return commandOracleReclaimExecute(options);
    case "x402-quote":
      return commandX402Quote(options);
    case "x402-request-execute":
      return commandX402RequestExecute(options);
    case "program-doctor":
      return commandProgramDoctor(options);
    case "program-scaffold":
      return commandProgramScaffold(options);
    case "program-build":
      return commandProgramCargo(options, "build");
    case "program-test":
      return commandProgramCargo(options, "test");
    case "program-deploy-plan":
      return commandProgramDeployPlan(options);
    case "program-deploy-execute":
      return commandProgramDeployExecute(options);
    case "program-upgrade-plan":
      return commandProgramUpgradePlan(options);
    case "program-upgrade-execute":
      return commandProgramUpgradeExecute(options);
    case "program-authority-plan":
      return commandProgramAuthorityPlan(options);
    case "program-authority-execute":
      return commandProgramAuthorityExecute(options);
    case "validator-gate":
      return commandLocalValidatorGate(options);
    case "desktop-pi-dogfood":
      return commandDesktopPiDogfood(options);
    case "live-gate":
      return commandLiveGate(options);
    case "help":
    case undefined:
      return printHelp(options);
    default:
      throw new Error(`Unknown ambient-blockchain command "${options.command}".`);
  }
}

function parseArgs(argv) {
  const options = { command: argv[0] ?? "help", _: [] };
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      options._.push(token);
      continue;
    }
    const rawKey = token.slice(2);
    const key = toCamel(rawKey);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      if (Object.prototype.hasOwnProperty.call(options, key)) {
        const existing = options[key];
        options[key] = Array.isArray(existing) ? [...existing, next] : [existing, next];
      } else {
        options[key] = next;
      }
      index += 1;
    } else {
      options[key] = true;
    }
  }
  return options;
}

function toCamel(value) {
  return value.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
}

function commandDoctor(options) {
  const contracts = readContracts();
  const rpcUrl = resolveRpcUrl(options);
  const payload = {
    schemaVersion: "ambient-blockchain-doctor-v1",
    packageName,
    packageVersion,
    status: "ready",
    generatedAt: nowIso(),
    mode: options.fast ? "fast" : "full",
    network: {
      name: contracts.network.name,
      runtime: contracts.network.runtime,
      rpcUrl,
      websocketUrl: resolveWsUrl(options)
    },
    contracts: contractSummary(contracts),
    env: envStatus(),
    commands: commandSummary(),
    safety: contracts.safety,
    liveTestLanes: contracts.liveTestLanes
  };

  if (options.network || options.liveRead) {
    return probeDoctorNetwork(payload, options);
  }

  return writeJson(payload);
}

async function probeDoctorNetwork(payload, options) {
  const probes = [];
  for (const method of ["getHealth", "getVersion", "getSlot"]) {
    const probe = await safeRpcProbe(method, [], options);
    probes.push(probe);
  }
  const failed = probes.filter((probe) => probe.status !== "passed");
  return writeJson({
    ...payload,
    status: failed.length ? "degraded" : "ready",
    networkProbes: probes
  });
}

async function commandRpc(options) {
  const method = stringOption(options.method ?? options._[0], "RPC method");
  ensureRpcMethodAllowed(method);
  const params = parseJsonArrayOption(options.paramsJson, "params-json", []);
  const rpcUrl = resolveRpcUrl(options);
  const requestedAt = nowIso();
  const response = await callRpc({ rpcUrl, method, params, timeoutMs: numberOption(options.timeoutMs, 15_000) });
  const payload = {
    schemaVersion: "ambient-blockchain-rpc-evidence-v1",
    packageName,
    generatedAt: nowIso(),
    requestedAt,
    method,
    rpcUrl,
    params,
    durationMs: response.durationMs,
    httpStatus: response.httpStatus,
    response: response.body
  };
  const artifact = writeArtifact("rpc", payload, options);
  return writeJson({
    schemaVersion: "ambient-blockchain-rpc-result-v1",
    packageName,
    status: response.body?.error ? "rpc_error" : "completed",
    method,
    rpcUrl,
    durationMs: response.durationMs,
    artifact,
    responsePreview: boundedPreview(response.body?.result ?? response.body, 3_500)
  });
}

async function commandAccount(options) {
  const address = stringOption(options.address ?? options._[0], "address");
  const commitment = String(options.commitment ?? "confirmed");
  const rpcUrl = resolveRpcUrl(options);
  const balance = await callRpc({
    rpcUrl,
    method: "getBalance",
    params: [address, { commitment }],
    timeoutMs: numberOption(options.timeoutMs, 15_000)
  });
  const accountInfo = await callRpc({
    rpcUrl,
    method: "getAccountInfo",
    params: [address, { commitment, encoding: "base64" }],
    timeoutMs: numberOption(options.timeoutMs, 15_000)
  });
  const account = summarizeAccountInfo(accountInfo.body?.result?.value);
  const payload = {
    schemaVersion: "ambient-blockchain-account-evidence-v1",
    packageName,
    generatedAt: nowIso(),
    address,
    rpcUrl,
    commitment,
    balance: balance.body,
    accountInfo: accountInfo.body
  };
  const artifact = writeArtifact("account", payload, options);
  return writeJson({
    schemaVersion: "ambient-blockchain-account-result-v1",
    packageName,
    status: balance.body?.error || accountInfo.body?.error ? "rpc_error" : "completed",
    address,
    balanceLamports: balance.body?.result?.value,
    account,
    artifact
  });
}

async function commandTransaction(options) {
  const rpcUrl = resolveRpcUrl(options);
  const commitment = String(options.commitment ?? "confirmed");
  const timeoutMs = numberOption(options.timeoutMs, 15_000);
  if (options.signature) {
    const signature = stringOption(options.signature, "signature");
    const encoding = String(options.encoding ?? "jsonParsed");
    const maxSupportedTransactionVersion = cappedInteger(options.maxSupportedTransactionVersion, 0, 0, 255, "max-supported-transaction-version");
    const response = await callRpc({
      rpcUrl,
      method: "getTransaction",
      params: [signature, { commitment, encoding, maxSupportedTransactionVersion }],
      timeoutMs
    });
    const summary = summarizeTransaction(response.body?.result);
    const payload = {
      schemaVersion: "ambient-blockchain-transaction-evidence-v1",
      packageName,
      generatedAt: nowIso(),
      mode: "signature",
      signature,
      rpcUrl,
      commitment,
      encoding,
      maxSupportedTransactionVersion,
      durationMs: response.durationMs,
      httpStatus: response.httpStatus,
      summary,
      rawResponse: response.body
    };
    const artifact = writeArtifact("transaction", payload, options);
    return writeJson({
      schemaVersion: "ambient-blockchain-transaction-result-v1",
      packageName,
      status: response.body?.error ? "rpc_error" : "completed",
      mode: "signature",
      signature,
      summary,
      artifact
    });
  }

  const address = stringOption(options.address ?? options._[0], "signature or address");
  const limit = cappedInteger(options.limit, 25, 1, 100, "limit");
  const config = { commitment, limit };
  if (options.before) config.before = String(options.before);
  if (options.until) config.until = String(options.until);
  const response = await callRpc({
    rpcUrl,
    method: "getSignaturesForAddress",
    params: [address, config],
    timeoutMs
  });
  const signatures = Array.isArray(response.body?.result) ? response.body.result : [];
  const payload = {
    schemaVersion: "ambient-blockchain-signature-history-evidence-v1",
    packageName,
    generatedAt: nowIso(),
    mode: "address-history",
    address,
    rpcUrl,
    commitment,
    limit,
    durationMs: response.durationMs,
    httpStatus: response.httpStatus,
    signatureCount: signatures.length,
    rawResponse: response.body
  };
  const artifact = writeArtifact("transaction", payload, options);
  return writeJson({
    schemaVersion: "ambient-blockchain-signature-history-result-v1",
    packageName,
    status: response.body?.error ? "rpc_error" : "completed",
    mode: "address-history",
    address,
    signatureCount: signatures.length,
    signaturesPreview: signatures.slice(0, Math.min(signatures.length, limit)).map(summarizeSignatureInfo),
    artifact
  });
}

async function commandProgramObserve(options) {
  const programId = stringOption(options.programId ?? options._[0], "program-id");
  const filters = parseJsonArrayOption(options.filtersJson, "filters-json", undefined);
  if (!filters && !options.allowUnfiltered) {
    throw new Error("Program observation requires --filters-json for a bounded scan, or explicit --allow-unfiltered.");
  }
  const commitment = String(options.commitment ?? "confirmed");
  const dataSliceLength = cappedInteger(options.dataSliceLength, 0, 0, 1024, "data-slice-length");
  const previewLimit = cappedInteger(options.limit, 25, 1, 100, "limit");
  const config = {
    commitment,
    encoding: "base64",
    dataSlice: {
      offset: cappedInteger(options.dataSliceOffset, 0, 0, 1024 * 1024, "data-slice-offset"),
      length: dataSliceLength
    }
  };
  if (filters) config.filters = filters;
  const rpcUrl = resolveRpcUrl(options);
  const fake = process.env.AMBIENT_BLOCKCHAIN_FAKE_PROGRAM_OBSERVE === "1" || options.fake === true;
  const response = fake
    ? fakeProgramObserveResponse(programId)
    : await callRpc({
      rpcUrl,
      method: "getProgramAccounts",
      params: [programId, config],
      timeoutMs: numberOption(options.timeoutMs, 30_000)
    });
  const accounts = Array.isArray(response.body?.result) ? response.body.result : [];
  const summaries = accounts.map(summarizeProgramAccount);
  const payload = {
    schemaVersion: "ambient-blockchain-program-observe-evidence-v1",
    packageName,
    generatedAt: nowIso(),
    programId,
    rpcUrl,
    fake,
    commitment,
    filters: filters ?? [],
    allowUnfiltered: Boolean(options.allowUnfiltered),
    dataSlice: config.dataSlice,
    accountCount: accounts.length,
    previewLimit,
    durationMs: response.durationMs,
    httpStatus: response.httpStatus,
    accountSummaries: summaries,
    rawResponse: response.body
  };
  const artifact = writeArtifact("program-observe", payload, options);
  return writeJson({
    schemaVersion: "ambient-blockchain-program-observe-result-v1",
    packageName,
    status: response.body?.error ? "rpc_error" : "completed",
    fake,
    programId,
    accountCount: accounts.length,
    previewCount: Math.min(accounts.length, previewLimit),
    truncated: accounts.length > previewLimit,
    accountSummariesPreview: summaries.slice(0, previewLimit),
    artifact
  });
}

function commandKeypairStatus(options) {
  const kind = String(options.kind ?? "all");
  const entries = kind === "all"
    ? [inspectKeypairBinding("chain"), inspectKeypairBinding("x402")]
    : [inspectKeypairBinding(kind)];
  const needsAttention = entries.some((entry) => entry.configured && (!entry.valid || entry.warnings.length > 0));
  const payload = {
    schemaVersion: "ambient-blockchain-keypair-status-v1",
    packageName,
    generatedAt: nowIso(),
    status: needsAttention ? "needs_attention" : "checked",
    mutation: "none",
    keypairs: entries,
    secretPolicy: "No keypair paths, private key bytes, or secret values are included in stdout or artifacts."
  };
  const artifact = writeArtifact("keypair", payload, options);
  return writeJson({
    schemaVersion: "ambient-blockchain-keypair-status-result-v1",
    packageName,
    status: payload.status,
    mutation: "none",
    keypairs: entries.map((entry) => ({
      kind: entry.kind,
      envName: entry.envName,
      configured: entry.configured,
      valid: entry.valid,
      publicKey: entry.publicKey,
      pathSha256: entry.pathSha256,
      warnings: entry.warnings
    })),
    artifact
  });
}

function commandApprovalVerify(options) {
  const verification = buildApprovalVerification(options);
  const artifact = writeArtifact("approval", verification.payload, options);
  return writeJson({
    schemaVersion: "ambient-approval-verification-result-v1",
    packageName,
    status: verification.status,
    mutation: "none",
    approvalAction: verification.payload.approvalAction,
    approvalSha256: verification.payload.approvalSha256,
    expectedApprovalSha256: verification.payload.expectedApprovalSha256,
    approvalCopy: verification.payload.approvalCopy,
    requireSigner: verification.payload.requireSigner,
    checks: verification.payload.checks,
    artifact
  });
}

function buildApprovalVerification(options) {
  const planPath = requireWorkspacePath(stringOption(options.planArtifact ?? options.plan ?? options._[0], "plan artifact"), "plan artifact");
  if (!existsSync(planPath)) throw new Error(`Plan artifact does not exist: ${toWorkspaceRelative(planPath)}`);
  const planBytes = readFileSync(planPath);
  const plan = JSON.parse(planBytes.toString("utf8"));
  const approval = plan.approval;
  const computedApprovalSha256 = approval ? approvalDigest(approval) : undefined;
  const expectedApprovalSha256 = String(options.approvalSha256 ?? options.expectedApprovalSha256 ?? plan.approvalSha256 ?? "");
  const signerKind = String(options.signerKind ?? approval?.signer?.kind ?? "chain");
  const currentSigner = signerApprovalSummary(signerKind);
  const requireSigner = Boolean(options.requireSigner);
  const maxLamports = numberOption(options.maxLamports, undefined);
  const maxMicroUsdc = numberOption(options.maxMicroUsdc, undefined);
  const checks = [
    {
      id: "approval_present",
      passed: Boolean(approval && plan.approvalSha256),
      detail: approval ? "Plan includes approval contract." : "Plan artifact does not include an approval contract."
    },
    {
      id: "approval_digest_matches_plan",
      passed: Boolean(computedApprovalSha256 && computedApprovalSha256 === plan.approvalSha256),
      detail: `computed=${computedApprovalSha256 ?? "missing"} plan=${plan.approvalSha256 ?? "missing"}`
    },
    {
      id: "approval_digest_matches_expected",
      passed: Boolean(expectedApprovalSha256 && computedApprovalSha256 === expectedApprovalSha256),
      detail: `expected=${expectedApprovalSha256 || "missing"}`
    },
    {
      id: "max_lamports_cap",
      passed: maxLamports === undefined || numberOption(approval?.maxLamports, 0) <= maxLamports,
      detail: maxLamports === undefined ? "No verifier lamport cap supplied." : `plan=${approval?.maxLamports ?? 0} cap=${maxLamports}`
    },
    {
      id: "max_micro_usdc_cap",
      passed: maxMicroUsdc === undefined || numberOption(approval?.maxMicroUsdc, 0) <= maxMicroUsdc,
      detail: maxMicroUsdc === undefined ? "No verifier micro-USDC cap supplied." : `plan=${approval?.maxMicroUsdc ?? 0} cap=${maxMicroUsdc}`
    },
    {
      id: "signer_configured",
      passed: !requireSigner || currentSigner.configured,
      detail: requireSigner ? "Signer required by verifier." : "Signer not required by verifier."
    },
    {
      id: "signer_valid",
      passed: !requireSigner || currentSigner.valid,
      detail: requireSigner ? "Configured signer must be valid." : "Signer validity not required by verifier."
    },
    {
      id: "signer_public_key_matches_plan",
      passed: !requireSigner || !approval?.signer?.publicKey || approval.signer.publicKey === currentSigner.publicKey,
      detail: approval?.signer?.publicKey ? "Plan has signer public key." : "Plan did not bind a signer public key."
    },
    {
      id: "signer_path_hash_matches_plan",
      passed: !requireSigner || !approval?.signer?.pathSha256 || approval.signer.pathSha256 === currentSigner.pathSha256,
      detail: approval?.signer?.pathSha256 ? "Plan has signer path hash." : "Plan did not bind a signer path hash."
    }
  ];
  const status = checks.every((check) => check.passed) ? "verified" : "blocked";
  const payload = {
    schemaVersion: "ambient-approval-verification-v1",
    packageName,
    generatedAt: nowIso(),
    status,
    mutation: "none",
    planArtifact: {
      relativePath: toWorkspaceRelative(planPath),
      bytes: planBytes.length,
      sha256: sha256(planBytes)
    },
    planSchemaVersion: plan.schemaVersion,
    approvalAction: approval?.action,
    approvalSha256: computedApprovalSha256,
    expectedApprovalSha256,
    approvalCopy: plan.approvalCopy,
    caps: {
      planMaxLamports: approval?.maxLamports,
      verifierMaxLamports: maxLamports,
      planMaxMicroUsdc: approval?.maxMicroUsdc,
      verifierMaxMicroUsdc: maxMicroUsdc
    },
    requireSigner,
    planSigner: {
      kind: approval?.signer?.kind,
      envName: approval?.signer?.envName,
      configured: approval?.signer?.configured,
      valid: approval?.signer?.valid,
      publicKey: approval?.signer?.publicKey,
      pathSha256: approval?.signer?.pathSha256,
      warnings: approval?.signer?.warnings
    },
    currentSigner,
    checks,
    secretPolicy: "Verifier output never includes keypair paths, private key bytes, or full plan payloads."
  };
  return {
    planPath,
    planBytes,
    plan,
    approval,
    computedApprovalSha256,
    expectedApprovalSha256,
    status,
    checks,
    payload
  };
}

async function commandAuctionInspect(options) {
  const contracts = readContracts();
  const auction = contracts.programs.auction;
  const toolOracle = contracts.programs.toolOracle;
  const payload = {
    schemaVersion: "ambient-auction-inspect-v1",
    packageName,
    generatedAt: nowIso(),
    status: "inspected",
    programs: {
      auction,
      toolOracle
    }
  };

  if (options.account) {
    const rpcUrl = resolveRpcUrl(options);
    const accountInfo = await callRpc({
      rpcUrl,
      method: "getAccountInfo",
      params: [String(options.account), { commitment: String(options.commitment ?? "confirmed"), encoding: "base64" }],
      timeoutMs: numberOption(options.timeoutMs, 15_000)
    });
    payload.rpcUrl = rpcUrl;
    payload.account = String(options.account);
    payload.accountSummary = summarizeAccountInfo(accountInfo.body?.result?.value);
    payload.ownerMatchesPinnedProgram = [auction.programId, toolOracle.programId].includes(payload.accountSummary?.owner);
    payload.rawAccountInfo = accountInfo.body;
  }

  const artifact = writeArtifact("auction", payload, options);
  return writeJson({
    schemaVersion: "ambient-auction-inspect-result-v1",
    packageName,
    status: payload.status,
    auctionProgramId: auction.programId,
    toolOracleProgramId: toolOracle.programId,
    accountSummary: payload.accountSummary,
    ownerMatchesPinnedProgram: payload.ownerMatchesPinnedProgram,
    artifact
  });
}

function commandOraclePlan(options) {
  const plan = buildOraclePlan(options);
  const artifact = writeArtifact("oracle", plan, options);
  return writeJson({
    schemaVersion: "ambient-oracle-request-plan-result-v1",
    packageName,
    status: "planned",
    mutation: "none",
    toolOracleProgramId: plan.toolOracleProgramId,
    promptSha256: plan.promptSha256,
    promptBytes: plan.promptBytes,
    escrowLamports: plan.escrowLamports,
    maxLamports: plan.maxLamports,
    signerConfigured: plan.signerConfigured,
    signerPublicKey: plan.signer.publicKey,
    approvalSha256: plan.approvalSha256,
    approvalCopy: plan.approvalCopy,
    approvalRequired: plan.approvalRequired,
    artifact
  });
}

function commandOracleSubmit(options) {
  const maxLamports = numberOption(options.maxLamports ?? process.env.AMBIENT_BLOCKCHAIN_MAX_LAMPORTS, undefined);
  const verification = buildApprovalVerification({
    ...options,
    requireSigner: true,
    maxLamports
  });
  const startedAt = Date.now();
  const plan = verification.plan;
  const approval = verification.approval ?? {};
  const signerEnvName = verification.payload.currentSigner?.envName ?? "AMBIENT_BLOCKCHAIN_KEYPAIR_FILE";
  const keypairPath = process.env[signerEnvName];
  const fake = process.env.AMBIENT_ORACLE_FAKE_CLIENT === "1" || options.fake === true;
  const promptFile = materializeOraclePromptFile(plan, options);
  const clientTemplate = fake ? [] : parseCommandTemplateOption(options.clientCommandJson, "client-command-json");
  const replacements = oracleCommandReplacements({ plan, approval, keypairPath, promptFile });
  const command = clientTemplate.length > 0 ? expandCommandTemplate(clientTemplate, replacements) : { real: [], sanitized: [] };
  const redactions = [
    { value: keypairPath, replacement: `<${signerEnvName}>` },
    { value: promptFile.path, replacement: "<ORACLE_PROMPT_FILE>" },
    { value: plan.prompt, replacement: "<ORACLE_PROMPT>" }
  ];

  const executionChecks = [
    ...verification.checks,
    {
      id: "plan_is_tool_oracle_request",
      passed: plan.schemaVersion === "ambient-oracle-request-plan-v1" && approval.action === "tool_oracle_request",
      detail: `planSchemaVersion=${plan.schemaVersion ?? "missing"} approvalAction=${approval.action ?? "missing"}`
    },
    {
      id: "verifier_lamport_cap_supplied",
      passed: maxLamports !== undefined,
      detail: maxLamports === undefined ? "Oracle submit requires --max-lamports or AMBIENT_BLOCKCHAIN_MAX_LAMPORTS." : `cap=${maxLamports}`
    },
    {
      id: "prompt_hash_matches_plan",
      passed: Boolean(plan.promptSha256 && approval.promptSha256 && plan.promptSha256 === approval.promptSha256),
      detail: `plan=${plan.promptSha256 ?? "missing"} approval=${approval.promptSha256 ?? "missing"}`
    },
    {
      id: "escrow_within_cap",
      passed: maxLamports === undefined || numberOption(approval.escrowLamports, 0) <= maxLamports,
      detail: `escrow=${approval.escrowLamports ?? 0} cap=${maxLamports ?? "missing"}`
    },
    {
      id: "keypair_env_available",
      passed: typeof keypairPath === "string" && keypairPath.length > 0,
      detail: `Signer env ${signerEnvName} must be configured for oracle submit.`
    },
    {
      id: "oracle_client_command_configured",
      passed: fake || command.real.length > 0,
      detail: fake ? "Fake oracle client enabled for deterministic testing." : "Submit requires --client-command-json."
    }
  ];
  const blocked = verification.status !== "verified" || executionChecks.some((check) => !check.passed);
  let result = { status: undefined, signal: undefined, stdout: "", stderr: "", error: undefined };
  if (!blocked) {
    if (fake) {
      result = {
        status: 0,
        signal: null,
        stdout: "fake oracle submit passed\nsignature=FAKE_ORACLE_SIGNATURE\nrequestAccount=FAKE_ORACLE_REQUEST_ACCOUNT\n",
        stderr: "",
        error: undefined
      };
    } else {
      result = spawnSync(command.real[0], command.real.slice(1), {
        cwd: workspaceRoot(),
        env: {
          ...process.env,
          AMBIENT_ORACLE_PROMPT_FILE: promptFile.path,
          AMBIENT_ORACLE_PROMPT_SHA256: plan.promptSha256 ?? "",
          AMBIENT_ORACLE_ESCROW_LAMPORTS: String(approval.escrowLamports ?? 0),
          AMBIENT_ORACLE_MAX_LAMPORTS: String(maxLamports ?? ""),
          AMBIENT_ORACLE_RPC_URL: approval.rpcUrl ?? plan.network?.rpcUrl ?? resolveRpcUrl(options),
          AMBIENT_ORACLE_WS_URL: plan.network?.websocketUrl ?? resolveWsUrl(options)
        },
        encoding: "utf8",
        timeout: numberOption(options.timeoutMs, 180_000),
        maxBuffer: 20 * 1024 * 1024
      });
    }
  }

  const stdout = redactSensitiveText(result.stdout ?? "", redactions);
  const stderr = redactSensitiveText(result.stderr ?? "", redactions);
  const status = blocked ? "blocked" : result.status === 0 ? "submitted" : "failed";
  const signature = extractNamedValue(stdout, ["signature", "transactionSignature", "tx"]);
  const requestAccount = String(options.requestAccount ?? extractNamedValue(stdout, ["requestAccount", "request", "requestPda"]) ?? "");
  const payload = {
    schemaVersion: "ambient-oracle-request-submission-v1",
    packageName,
    generatedAt: nowIso(),
    status,
    mutation: blocked ? "none" : "chain-transaction",
    fake: !blocked && fake,
    planArtifact: verification.payload.planArtifact,
    approvalSha256: verification.payload.approvalSha256,
    expectedApprovalSha256: verification.payload.expectedApprovalSha256,
    approvalCopy: verification.payload.approvalCopy,
    verification: {
      status: verification.status,
      approvalAction: verification.payload.approvalAction,
      requireSigner: verification.payload.requireSigner,
      checks: verification.payload.checks,
      currentSigner: verification.payload.currentSigner
    },
    executionChecks,
    oracle: {
      toolOracleProgramId: plan.toolOracleProgramId,
      auctionProgramId: plan.auctionProgramId,
      promptSha256: plan.promptSha256,
      promptBytes: plan.promptBytes,
      escrowLamports: approval.escrowLamports,
      maxLamports,
      maxResponses: approval.maxResponses,
      responseFilter: approval.responseFilter,
      requestAccount: requestAccount || undefined,
      signature
    },
    network: {
      rpcUrl: approval.rpcUrl ?? plan.network?.rpcUrl ?? resolveRpcUrl(options),
      websocketUrl: plan.network?.websocketUrl ?? resolveWsUrl(options)
    },
    signer: {
      envName: signerEnvName,
      publicKey: verification.payload.currentSigner?.publicKey,
      pathSha256: verification.payload.currentSigner?.pathSha256
    },
    promptFile: {
      relativePath: promptFile.relativePath,
      bytes: promptFile.bytes,
      sha256: promptFile.sha256
    },
    sanitizedCommand: command.sanitized,
    exitCode: blocked ? undefined : result.status,
    signal: blocked ? undefined : result.signal,
    durationMs: Date.now() - startedAt,
    stdout,
    stderr,
    error: result.error ? redactSensitiveText(errorMessage(result.error), redactions) : undefined,
    secretPolicy: "Oracle submit redacts signer keypair paths, prompt text, and prompt file paths from stdout and artifacts."
  };
  const artifact = writeArtifact("oracle", payload, options);
  return writeJson({
    schemaVersion: "ambient-oracle-request-submission-result-v1",
    packageName,
    status,
    mutation: payload.mutation,
    fake: payload.fake,
    requestAccount: payload.oracle.requestAccount,
    signature,
    oracle: payload.oracle,
    signer: payload.signer,
    sanitizedCommand: payload.sanitizedCommand,
    exitCode: payload.exitCode,
    durationMs: payload.durationMs,
    stdoutPreview: boundedTextPreview(stdout, 4_000),
    stderrPreview: boundedTextPreview(stderr, 4_000),
    checks: executionChecks,
    artifact
  });
}

async function commandOracleWait(options) {
  const startedAt = Date.now();
  const submitArtifact = options.submitArtifact ? readWorkspaceJson(options.submitArtifact, "submit artifact") : undefined;
  const requestAccount = String(options.requestAccount ?? submitArtifact?.oracle?.requestAccount ?? submitArtifact?.requestAccount ?? "");
  if (!requestAccount) throw new Error("Oracle wait requires --request-account or --submit-artifact with a request account.");
  const rpcUrl = String(options.rpcUrl ?? submitArtifact?.network?.rpcUrl ?? resolveRpcUrl(options));
  const fake = process.env.AMBIENT_ORACLE_FAKE_WAIT === "1" || options.fake === true;
  const maxAttempts = cappedInteger(options.maxAttempts, 1, 1, 500, "max-attempts");
  const intervalMs = cappedInteger(options.intervalMs, 1_000, 0, 60_000, "interval-ms");
  const observations = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = fake
      ? fakeOracleWaitResponse()
      : await callRpc({
        rpcUrl,
        method: "getAccountInfo",
        params: [requestAccount, { commitment: String(options.commitment ?? "confirmed"), encoding: "base64" }],
        timeoutMs: numberOption(options.timeoutMs, 15_000)
      });
    const accountInfo = response.body?.result?.value;
    const decoded = decodeOracleAccountInfo(accountInfo);
    observations.push({
      attempt,
      durationMs: response.durationMs,
      httpStatus: response.httpStatus,
      exists: Boolean(accountInfo),
      accountSummary: summarizeAccountInfo(accountInfo),
      decoded,
      rawResponse: response.body
    });
    if (isTerminalOracleDecode(decoded) || attempt === maxAttempts) break;
    if (intervalMs > 0) await delay(intervalMs);
  }
  const latest = observations[observations.length - 1];
  const payload = {
    schemaVersion: "ambient-oracle-request-wait-v1",
    packageName,
    generatedAt: nowIso(),
    status: latest?.decoded?.terminal ? "terminal" : latest?.exists ? "observed" : "not_found",
    mutation: "none",
    fake,
    requestAccount,
    rpcUrl,
    maxAttempts,
    intervalMs,
    durationMs: Date.now() - startedAt,
    observations,
    submitArtifact: submitArtifact ? {
      relativePath: toWorkspaceRelative(requireWorkspacePath(options.submitArtifact, "submit artifact")),
      sha256: sha256(readFileSync(requireWorkspacePath(options.submitArtifact, "submit artifact")))
    } : undefined
  };
  const artifact = writeArtifact("oracle", payload, options);
  return writeJson({
    schemaVersion: "ambient-oracle-request-wait-result-v1",
    packageName,
    status: payload.status,
    mutation: "none",
    fake,
    requestAccount,
    attempts: observations.length,
    latest: latest ? {
      exists: latest.exists,
      accountSummary: latest.accountSummary,
      decoded: latest.decoded
    } : undefined,
    durationMs: payload.durationMs,
    artifact
  });
}

function commandOracleDecode(options) {
  const source = readOracleDecodeSource(options);
  const decoded = decodeOracleAccountInfo(source.accountInfo);
  const payload = {
    schemaVersion: "ambient-oracle-response-decode-v1",
    packageName,
    generatedAt: nowIso(),
    status: decoded.state ? "decoded" : "raw",
    mutation: "none",
    source: source.source,
    requestAccount: source.requestAccount,
    accountSummary: summarizeAccountInfo(source.accountInfo),
    decoded,
    rawAccountInfo: source.accountInfo
  };
  const artifact = writeArtifact("oracle", payload, options);
  return writeJson({
    schemaVersion: "ambient-oracle-response-decode-result-v1",
    packageName,
    status: payload.status,
    mutation: "none",
    requestAccount: payload.requestAccount,
    decoded,
    artifact
  });
}

function fakeOracleWaitResponse() {
  const data = Buffer.from(JSON.stringify({ state: "Completed", output: "42.00" }), "utf8").toString("base64");
  return {
    durationMs: 0,
    httpStatus: 200,
    body: {
      jsonrpc: "2.0",
      id: 1,
      result: {
        context: { slot: 99 },
        value: {
          lamports: 1234,
          owner: readContracts().programs.toolOracle.programId,
          executable: false,
          rentEpoch: 1,
          data: [data, "base64"],
          space: Buffer.byteLength(data, "base64")
        }
      }
    }
  };
}

function fakeProgramObserveResponse(programId) {
  return {
    durationMs: 0,
    httpStatus: 200,
    body: {
      jsonrpc: "2.0",
      id: 1,
      result: [
        {
          pubkey: "FAKE_PROGRAM_ACCOUNT",
          account: {
            lamports: 100,
            owner: programId,
            executable: false,
            rentEpoch: 1,
            data: [Buffer.from("live-gate", "utf8").toString("base64"), "base64"],
            space: 9
          }
        }
      ]
    }
  };
}

function commandOracleReclaimPlan(options) {
  const submitArtifact = options.submitArtifact ? readWorkspaceJson(options.submitArtifact, "submit artifact") : undefined;
  const requestAccount = String(options.requestAccount ?? submitArtifact?.oracle?.requestAccount ?? submitArtifact?.requestAccount ?? "");
  if (!requestAccount) throw new Error("Oracle reclaim planning requires --request-account or --submit-artifact with a request account.");
  const maxLamports = numberOption(options.maxLamports ?? process.env.AMBIENT_BLOCKCHAIN_MAX_LAMPORTS, 0);
  const signer = signerApprovalSummary("chain");
  const approval = {
    action: "tool_oracle_reclaim",
    rpcUrl: String(options.rpcUrl ?? submitArtifact?.network?.rpcUrl ?? resolveRpcUrl(options)),
    requestAccount,
    originalRequestApprovalSha256: submitArtifact?.approvalSha256,
    maxLamports,
    signer
  };
  const approvalSha256 = approvalDigest(approval);
  const payload = {
    schemaVersion: "ambient-oracle-reclaim-plan-v1",
    packageName,
    generatedAt: nowIso(),
    status: "planned",
    mutation: "none",
    network: {
      rpcUrl: approval.rpcUrl,
      websocketUrl: resolveWsUrl(options)
    },
    requestAccount,
    signerConfigured: signer.configured,
    signer,
    maxLamports,
    approval,
    approvalSha256,
    approvalCopy: `Approve Tool Oracle reclaim: requestAccount=${requestAccount} maxLamports=${maxLamports} signer=${signer.publicKey ?? "unconfigured"}`,
    approvalRequired: [
      "Explicit user approval before signer use.",
      "Explicit lamport cap before cleanup transaction.",
      "Transaction signature and cleanup evidence artifact after reclaim execution."
    ],
    submitArtifact: submitArtifact ? {
      approvalSha256: submitArtifact.approvalSha256,
      requestAccount: submitArtifact.oracle?.requestAccount
    } : undefined,
    nextCommand: "ambient_oracle_reclaim_execute --plan-artifact <path> --approval-sha256 <sha> --max-lamports <n> --require-signer --json"
  };
  const artifact = writeArtifact("oracle", payload, options);
  return writeJson({
    schemaVersion: "ambient-oracle-reclaim-plan-result-v1",
    packageName,
    status: "planned",
    mutation: "none",
    requestAccount,
    signerConfigured: payload.signerConfigured,
    maxLamports,
    approvalSha256,
    approvalCopy: payload.approvalCopy,
    approvalRequired: payload.approvalRequired,
    artifact
  });
}

function commandOracleReclaimExecute(options) {
  const maxLamports = numberOption(options.maxLamports ?? process.env.AMBIENT_BLOCKCHAIN_MAX_LAMPORTS, undefined);
  const verification = buildApprovalVerification({
    ...options,
    requireSigner: true,
    maxLamports
  });
  const startedAt = Date.now();
  const plan = verification.plan;
  const approval = verification.approval ?? {};
  const signerEnvName = verification.payload.currentSigner?.envName ?? "AMBIENT_BLOCKCHAIN_KEYPAIR_FILE";
  const keypairPath = process.env[signerEnvName];
  const fake = process.env.AMBIENT_ORACLE_FAKE_CLIENT === "1" || options.fake === true;
  const requestedRequestAccount = options.requestAccount ? String(options.requestAccount) : undefined;
  const requestAccount = requestedRequestAccount ?? approval.requestAccount ?? plan.requestAccount;
  const clientTemplate = fake ? [] : parseCommandTemplateOption(options.clientCommandJson, "client-command-json");
  const replacements = oracleCommandReplacements({ plan, approval, keypairPath, requestAccount });
  const command = clientTemplate.length > 0 ? expandCommandTemplate(clientTemplate, replacements) : { real: [], sanitized: [] };
  const redactions = [{ value: keypairPath, replacement: `<${signerEnvName}>` }];
  const executionChecks = [
    ...verification.checks,
    {
      id: "plan_is_oracle_reclaim",
      passed: plan.schemaVersion === "ambient-oracle-reclaim-plan-v1" && approval.action === "tool_oracle_reclaim",
      detail: `planSchemaVersion=${plan.schemaVersion ?? "missing"} approvalAction=${approval.action ?? "missing"}`
    },
    {
      id: "verifier_lamport_cap_supplied",
      passed: maxLamports !== undefined,
      detail: maxLamports === undefined ? "Oracle reclaim requires --max-lamports or AMBIENT_BLOCKCHAIN_MAX_LAMPORTS." : `cap=${maxLamports}`
    },
    {
      id: "request_account_present",
      passed: Boolean(requestAccount),
      detail: requestAccount ? "Request account is replayed from the approved plan." : "Plan did not include a request account."
    },
    {
      id: "request_account_override_matches_plan",
      passed: !requestedRequestAccount || requestedRequestAccount === approval.requestAccount,
      detail: requestedRequestAccount ? "Request account override must match the approved plan." : "No request account override supplied."
    },
    {
      id: "keypair_env_available",
      passed: typeof keypairPath === "string" && keypairPath.length > 0,
      detail: `Signer env ${signerEnvName} must be configured for oracle reclaim.`
    },
    {
      id: "oracle_client_command_configured",
      passed: fake || command.real.length > 0,
      detail: fake ? "Fake oracle client enabled for deterministic testing." : "Reclaim requires --client-command-json."
    }
  ];
  const blocked = verification.status !== "verified" || executionChecks.some((check) => !check.passed);
  let result = { status: undefined, signal: undefined, stdout: "", stderr: "", error: undefined };
  if (!blocked) {
    if (fake) {
      result = {
        status: 0,
        signal: null,
        stdout: `fake oracle reclaim passed\nsignature=FAKE_ORACLE_RECLAIM_SIGNATURE\nrequestAccount=${requestAccount}\n`,
        stderr: "",
        error: undefined
      };
    } else {
      result = spawnSync(command.real[0], command.real.slice(1), {
        cwd: workspaceRoot(),
        env: {
          ...process.env,
          AMBIENT_ORACLE_REQUEST_ACCOUNT: requestAccount ?? "",
          AMBIENT_ORACLE_RPC_URL: approval.rpcUrl ?? plan.network?.rpcUrl ?? resolveRpcUrl(options)
        },
        encoding: "utf8",
        timeout: numberOption(options.timeoutMs, 120_000),
        maxBuffer: 20 * 1024 * 1024
      });
    }
  }
  const stdout = redactSensitiveText(result.stdout ?? "", redactions);
  const stderr = redactSensitiveText(result.stderr ?? "", redactions);
  const status = blocked ? "blocked" : result.status === 0 ? "reclaimed" : "failed";
  const signature = extractNamedValue(stdout, ["signature", "transactionSignature", "tx"]);
  const payload = {
    schemaVersion: "ambient-oracle-reclaim-execution-v1",
    packageName,
    generatedAt: nowIso(),
    status,
    mutation: blocked ? "none" : "chain-transaction",
    fake: !blocked && fake,
    planArtifact: verification.payload.planArtifact,
    approvalSha256: verification.payload.approvalSha256,
    expectedApprovalSha256: verification.payload.expectedApprovalSha256,
    approvalCopy: verification.payload.approvalCopy,
    verification: {
      status: verification.status,
      approvalAction: verification.payload.approvalAction,
      requireSigner: verification.payload.requireSigner,
      checks: verification.payload.checks,
      currentSigner: verification.payload.currentSigner
    },
    executionChecks,
    requestAccount,
    network: {
      rpcUrl: approval.rpcUrl ?? plan.network?.rpcUrl ?? resolveRpcUrl(options)
    },
    signer: {
      envName: signerEnvName,
      publicKey: verification.payload.currentSigner?.publicKey,
      pathSha256: verification.payload.currentSigner?.pathSha256
    },
    sanitizedCommand: command.sanitized,
    exitCode: blocked ? undefined : result.status,
    signal: blocked ? undefined : result.signal,
    durationMs: Date.now() - startedAt,
    stdout,
    stderr,
    error: result.error ? redactSensitiveText(errorMessage(result.error), redactions) : undefined,
    signature,
    secretPolicy: "Oracle reclaim redacts signer keypair paths and never includes private key bytes."
  };
  const artifact = writeArtifact("oracle", payload, options);
  return writeJson({
    schemaVersion: "ambient-oracle-reclaim-execution-result-v1",
    packageName,
    status,
    mutation: payload.mutation,
    fake: payload.fake,
    requestAccount,
    signature,
    signer: payload.signer,
    sanitizedCommand: payload.sanitizedCommand,
    exitCode: payload.exitCode,
    durationMs: payload.durationMs,
    stdoutPreview: boundedTextPreview(stdout, 4_000),
    stderrPreview: boundedTextPreview(stderr, 4_000),
    checks: executionChecks,
    artifact
  });
}

async function commandX402Quote(options) {
  const quote = await buildX402Quote(options);
  const artifact = writeArtifact("x402", quote, options);
  return writeJson({
    schemaVersion: "ambient-x402-quote-result-v1",
    packageName,
    status: quote.status,
    mutation: "none",
    endpoint: quote.endpoint,
    liveProbe: quote.liveProbe,
    signerConfigured: quote.signerConfigured,
    maxLamports: quote.maxLamports,
    maxMicroUsdc: quote.maxMicroUsdc,
    approvalSha256: quote.approvalSha256,
    approvalCopy: quote.approvalCopy,
    approvalRequired: quote.approvalRequired,
    artifact
  });
}

async function commandX402RequestExecute(options) {
  const maxLamports = numberOption(options.maxLamports ?? process.env.AMBIENT_BLOCKCHAIN_MAX_LAMPORTS, undefined);
  const maxMicroUsdc = numberOption(options.maxMicroUsdc ?? process.env.AMBIENT_X402_MAX_MICRO_USDC, undefined);
  const verification = buildApprovalVerification({
    ...options,
    planArtifact: options.quoteArtifact ?? options.planArtifact ?? options.plan ?? options._[0],
    requireSigner: true,
    maxLamports,
    maxMicroUsdc
  });
  const startedAt = Date.now();
  const plan = verification.plan;
  const approval = verification.approval ?? {};
  const endpoint = String(options.endpoint ?? approval.endpoint ?? plan.endpoint ?? "");
  const method = String(options.method ?? approval.method ?? plan.method ?? "GET").toUpperCase();
  const paymentHeaderName = String(options.paymentHeaderName ?? "X-PAYMENT");
  const paymentHeader = readX402PaymentHeaderBinding(options, paymentHeaderName);
  const body = requestBodyFromOptions(options);
  const contentType = String(options.contentType ?? "application/json");
  const extraHeaders = parseHttpHeaderMapOption(options.headersJson, paymentHeaderName);
  const expectedEndpoint = approval.endpoint ?? plan.endpoint;
  const expectedMethod = approval.method ?? plan.method;

  const executionChecks = [
    ...verification.checks,
    {
      id: "plan_is_x402_paid_request",
      passed: plan.schemaVersion === "ambient-x402-quote-v1" && approval.action === "x402_paid_request",
      detail: `planSchemaVersion=${plan.schemaVersion ?? "missing"} approvalAction=${approval.action ?? "missing"}`
    },
    {
      id: "verifier_lamport_cap_supplied",
      passed: maxLamports !== undefined,
      detail: maxLamports === undefined ? "Paid x402 execution requires --max-lamports or AMBIENT_BLOCKCHAIN_MAX_LAMPORTS." : `cap=${maxLamports}`
    },
    {
      id: "verifier_micro_usdc_cap_supplied",
      passed: maxMicroUsdc !== undefined,
      detail: maxMicroUsdc === undefined ? "Paid x402 execution requires --max-micro-usdc or AMBIENT_X402_MAX_MICRO_USDC." : `cap=${maxMicroUsdc}`
    },
    {
      id: "endpoint_matches_plan",
      passed: Boolean(endpoint && expectedEndpoint && endpoint === expectedEndpoint),
      detail: expectedEndpoint ? "Endpoint is replayed from the approved quote." : "Approved quote did not include an endpoint."
    },
    {
      id: "method_matches_plan",
      passed: Boolean(method && expectedMethod && method === expectedMethod),
      detail: expectedMethod ? "HTTP method is replayed from the approved quote." : "Approved quote did not include an HTTP method."
    },
    {
      id: "payment_header_configured",
      passed: paymentHeader.valid,
      detail: paymentHeader.valid ? "One-use payment header is configured." : "Missing --payment-header-file or AMBIENT_X402_PAYMENT_HEADER_FILE."
    }
  ];
  const blocked = verification.status !== "verified" || executionChecks.some((check) => !check.passed);
  const redactions = [
    { value: paymentHeader.value, replacement: `<${paymentHeader.envName}>` },
    { value: paymentHeader.sourcePath, replacement: `<${paymentHeader.envName}_PATH>` }
  ];
  const requestHeaders = {
    accept: String(options.accept ?? "application/json"),
    ...extraHeaders,
    [paymentHeaderName]: paymentHeader.value
  };
  if (body !== undefined && !hasHeader(requestHeaders, "content-type")) requestHeaders["content-type"] = contentType;
  let response = {
    durationMs: 0,
    httpStatus: undefined,
    headers: {},
    bodyText: "",
    error: undefined
  };

  if (!blocked) {
    response = await callX402PaidRequest({
      endpoint,
      method,
      headers: requestHeaders,
      body,
      timeoutMs: numberOption(options.timeoutMs, 60_000),
      fake: process.env.AMBIENT_X402_FAKE_PAID_REQUEST === "1" || options.fake === true
    });
  }

  const redactedBodyText = redactSensitiveText(response.bodyText, redactions);
  const status = blocked
    ? "blocked"
    : response.error
      ? "failed"
      : response.httpStatus >= 200 && response.httpStatus < 300
        ? "paid"
        : "http_error";
  const payload = {
    schemaVersion: "ambient-x402-paid-request-execution-v1",
    packageName,
    generatedAt: nowIso(),
    status,
    mutation: blocked ? "none" : "paid-http-request",
    fake: !blocked && (process.env.AMBIENT_X402_FAKE_PAID_REQUEST === "1" || options.fake === true),
    planArtifact: verification.payload.planArtifact,
    approvalSha256: verification.payload.approvalSha256,
    expectedApprovalSha256: verification.payload.expectedApprovalSha256,
    approvalCopy: verification.payload.approvalCopy,
    verification: {
      status: verification.status,
      approvalAction: verification.payload.approvalAction,
      requireSigner: verification.payload.requireSigner,
      checks: verification.payload.checks,
      currentSigner: verification.payload.currentSigner
    },
    executionChecks,
    request: {
      endpoint,
      method,
      headers: sanitizeHttpHeadersForArtifact(requestHeaders, [paymentHeaderName]),
      bodyBytes: body === undefined ? 0 : Buffer.byteLength(body, "utf8"),
      bodySha256: body === undefined ? undefined : sha256(body),
      body
    },
    payment: {
      headerName: paymentHeaderName,
      configured: paymentHeader.configured,
      valid: paymentHeader.valid,
      envName: paymentHeader.envName,
      sourceKind: paymentHeader.sourceKind,
      sourcePathSha256: paymentHeader.sourcePathSha256,
      headerSha256: paymentHeader.headerSha256,
      warnings: paymentHeader.warnings
    },
    signer: {
      envName: verification.payload.currentSigner?.envName,
      publicKey: verification.payload.currentSigner?.publicKey,
      pathSha256: verification.payload.currentSigner?.pathSha256
    },
    response: {
      durationMs: response.durationMs,
      httpStatus: response.httpStatus,
      headers: response.headers,
      bodyBytes: Buffer.byteLength(redactedBodyText, "utf8"),
      bodySha256: redactedBodyText ? sha256(redactedBodyText) : undefined,
      bodyText: redactedBodyText,
      error: response.error ? redactSensitiveText(response.error, redactions) : undefined
    },
    durationMs: Date.now() - startedAt,
    secretPolicy: "x402 execution never prints or artifacts the one-use payment header, keypair paths, private key bytes, or payment secret values."
  };
  const artifact = writeArtifact("x402", payload, options);
  return writeJson({
    schemaVersion: "ambient-x402-paid-request-execution-result-v1",
    packageName,
    status,
    mutation: payload.mutation,
    fake: payload.fake,
    endpoint,
    method,
    signer: payload.signer,
    payment: {
      headerName: paymentHeaderName,
      configured: paymentHeader.configured,
      valid: paymentHeader.valid,
      envName: paymentHeader.envName,
      sourceKind: paymentHeader.sourceKind,
      sourcePathSha256: paymentHeader.sourcePathSha256,
      headerSha256: paymentHeader.headerSha256,
      warnings: paymentHeader.warnings
    },
    httpStatus: payload.response.httpStatus,
    responseHeaders: payload.response.headers,
    responsePreview: boundedTextPreview(redactedBodyText, 4_000),
    checks: executionChecks,
    artifact
  });
}

function commandProgramDoctor(options) {
  const payload = buildProgramDoctor(options);
  return writeJson(payload);
}

function commandProgramScaffold(options) {
  const projectDir = requireWorkspacePath(String(options.projectDir ?? options._[0] ?? "ambient-program"), "project directory");
  const template = String(options.template ?? "native-rust");
  const name = safeRustIdentifier(String(options.name ?? basename(projectDir) ?? "ambient_program"));
  const force = Boolean(options.force);
  const files = programTemplateFiles(template, name);
  const createdFiles = [];
  for (const file of files) {
    const outputPath = resolve(projectDir, file.path);
    if (!isPathInside(projectDir, outputPath)) throw new Error(`Template path escapes project directory: ${file.path}`);
    if (existsSync(outputPath) && !force) throw new Error(`Refusing to overwrite existing file: ${toWorkspaceRelative(outputPath)}. Pass --force to replace scaffold files.`);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, file.content, "utf8");
    createdFiles.push({
      path: outputPath,
      relativePath: toWorkspaceRelative(outputPath),
      bytes: Buffer.byteLength(file.content, "utf8"),
      sha256: sha256(file.content)
    });
  }
  const payload = {
    schemaVersion: "ambient-program-scaffold-v1",
    packageName,
    generatedAt: nowIso(),
    status: "scaffolded",
    mutation: "workspace-files",
    template,
    projectDir,
    projectRelativePath: toWorkspaceRelative(projectDir),
    crateName: name,
    createdFiles,
    nextCommands: [
      `ambient_program_build --project-dir ${toWorkspaceRelative(projectDir)} --json`,
      `ambient_program_test --project-dir ${toWorkspaceRelative(projectDir)} --json`,
      `ambient_program_deploy_plan --binary <built-program.so> --json`
    ]
  };
  const artifact = writeArtifact("program", payload, options);
  return writeJson({
    schemaVersion: "ambient-program-scaffold-result-v1",
    packageName,
    status: "scaffolded",
    template,
    projectRelativePath: payload.projectRelativePath,
    crateName: name,
    createdFiles: createdFiles.map((file) => ({ relativePath: file.relativePath, bytes: file.bytes, sha256: file.sha256 })),
    artifact
  });
}

function commandProgramCargo(options, mode) {
  const projectDir = requireWorkspacePath(String(options.projectDir ?? options._[0] ?? "."), "project directory");
  const cargoToml = resolve(projectDir, "Cargo.toml");
  if (!existsSync(cargoToml)) throw new Error(`Cargo.toml not found in ${toWorkspaceRelative(projectDir)}.`);
  const cargoArgs = [mode === "test" ? "test" : "build"];
  if (options.release && mode === "build") cargoArgs.push("--release");
  const extraArgs = parseJsonArrayOption(options.extraArgsJson, "extra-args-json", []);
  for (const arg of extraArgs) {
    if (typeof arg !== "string") throw new Error("--extra-args-json must contain strings.");
    cargoArgs.push(arg);
  }
  const startedAt = Date.now();
  const command = ["cargo", ...cargoArgs];
  const fake = process.env.AMBIENT_BLOCKCHAIN_FAKE_CARGO === "1";
  const result = fake
    ? {
      status: 0,
      signal: null,
      stdout: `fake cargo ${cargoArgs.join(" ")} passed\n`,
      stderr: "",
      error: undefined
    }
    : spawnSync("cargo", cargoArgs, {
      cwd: projectDir,
      encoding: "utf8",
      timeout: numberOption(options.timeoutMs, mode === "test" ? 120_000 : 180_000),
      maxBuffer: 10 * 1024 * 1024
    });
  const durationMs = Date.now() - startedAt;
  const payload = {
    schemaVersion: "ambient-program-cargo-run-v1",
    packageName,
    generatedAt: nowIso(),
    status: result.status === 0 ? "passed" : "failed",
    mutation: "workspace-build-artifacts",
    mode,
    fake,
    projectDir,
    projectRelativePath: toWorkspaceRelative(projectDir),
    command,
    exitCode: result.status,
    signal: result.signal,
    durationMs,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error ? errorMessage(result.error) : undefined
  };
  const artifact = writeArtifact("program", payload, options);
  return writeJson({
    schemaVersion: "ambient-program-cargo-run-result-v1",
    packageName,
    status: payload.status,
    mode,
    fake,
    projectRelativePath: payload.projectRelativePath,
    command,
    exitCode: payload.exitCode,
    durationMs,
    stdoutPreview: boundedTextPreview(payload.stdout, 4_000),
    stderrPreview: boundedTextPreview(payload.stderr, 4_000),
    artifact
  });
}

function commandProgramDeployPlan(options) {
  const binary = stringOption(options.binary ?? options._[0], "binary");
  const binaryPath = requireWorkspacePath(binary, "program binary");
  if (!existsSync(binaryPath)) throw new Error(`Program binary does not exist: ${binary}`);
  const stats = statSync(binaryPath);
  if (!stats.isFile()) throw new Error(`Program binary is not a file: ${binary}`);
  const bytes = readFileSync(binaryPath);
  const maxLamports = numberOption(options.maxLamports ?? process.env.AMBIENT_BLOCKCHAIN_MAX_LAMPORTS, 0);
  const signer = signerApprovalSummary("chain");
  const approval = {
    action: "ambient_program_deploy",
    rpcUrl: resolveRpcUrl(options),
    binarySha256: sha256(bytes),
    binaryBytes: stats.size,
    programId: options.programId ? String(options.programId) : undefined,
    maxLamports,
    signer
  };
  const approvalSha256 = approvalDigest(approval);
  const payload = {
    schemaVersion: "ambient-program-deploy-plan-v1",
    packageName,
    generatedAt: nowIso(),
    status: "planned",
    mutation: "none",
    network: {
      rpcUrl: resolveRpcUrl(options),
      websocketUrl: resolveWsUrl(options)
    },
    program: {
      binaryPath,
      binaryRelativePath: toWorkspaceRelative(binaryPath),
      bytes: stats.size,
      sha256: sha256(bytes),
      programId: options.programId ? String(options.programId) : undefined
    },
    signerConfigured: signer.configured,
    signer,
    maxLamports,
    approval,
    approvalSha256,
    approvalCopy: `Approve Ambient program deploy: binarySha256=${approval.binarySha256} maxLamports=${maxLamports} signer=${signer.publicKey ?? "unconfigured"}`,
    approvalRequired: [
      "Explicit user approval before signer use.",
      "Explicit lamport cap before deployment.",
      "Transaction signature, program id, and observe evidence artifact after future deploy command."
    ],
    nextCommand: "Future signer-backed deploy command; this bundled command does not sign or submit transactions."
  };
  const artifact = writeArtifact("program", payload, options);
  return writeJson({
    schemaVersion: "ambient-program-deploy-plan-result-v1",
    packageName,
    status: "planned",
    mutation: "none",
    program: payload.program,
    signerConfigured: payload.signerConfigured,
    maxLamports,
    approvalSha256: payload.approvalSha256,
    approvalCopy: payload.approvalCopy,
    approvalRequired: payload.approvalRequired,
    artifact
  });
}

function commandProgramDeployExecute(options) {
  const maxLamports = numberOption(options.maxLamports ?? process.env.AMBIENT_BLOCKCHAIN_MAX_LAMPORTS, undefined);
  const verification = buildApprovalVerification({
    ...options,
    requireSigner: true,
    maxLamports
  });
  const startedAt = Date.now();
  const plan = verification.plan;
  const approval = verification.approval ?? {};
  const binaryReference = plan.program?.binaryRelativePath ?? plan.program?.binaryPath ?? approval.binaryRelativePath ?? approval.binaryPath;
  const binaryPath = typeof binaryReference === "string" && binaryReference.length > 0
    ? requireWorkspacePath(binaryReference, "program binary")
    : undefined;
  const binaryBytes = binaryPath && existsSync(binaryPath) ? readFileSync(binaryPath) : undefined;
  const binarySha256 = binaryBytes ? sha256(binaryBytes) : undefined;
  const signerEnvName = verification.payload.currentSigner?.envName ?? "AMBIENT_BLOCKCHAIN_KEYPAIR_FILE";
  const keypairPath = process.env[signerEnvName];
  const extraArgs = parseJsonArrayOption(options.extraArgsJson, "extra-args-json", [])
    .map((entry) => String(entry));
  const planProgramId = approval.programId ?? plan.program?.programId;
  const requestedProgramId = options.programId ? String(options.programId) : undefined;
  const programId = requestedProgramId ?? planProgramId;
  const solanaExecutable = String(options.solana ?? "solana");
  const fake = process.env.AMBIENT_BLOCKCHAIN_FAKE_SOLANA_DEPLOY === "1" || options.fake === true;

  const executionChecks = [
    ...verification.checks,
    {
      id: "plan_is_program_deploy",
      passed: plan.schemaVersion === "ambient-program-deploy-plan-v1" && approval.action === "ambient_program_deploy",
      detail: `planSchemaVersion=${plan.schemaVersion ?? "missing"} approvalAction=${approval.action ?? "missing"}`
    },
    {
      id: "verifier_lamport_cap_supplied",
      passed: maxLamports !== undefined,
      detail: maxLamports === undefined ? "Deploy execution requires --max-lamports or AMBIENT_BLOCKCHAIN_MAX_LAMPORTS." : `cap=${maxLamports}`
    },
    {
      id: "binary_reference_present",
      passed: Boolean(binaryReference),
      detail: binaryReference ? "Plan includes a program binary reference." : "Plan does not include a program binary reference."
    },
    {
      id: "binary_exists",
      passed: Boolean(binaryPath && existsSync(binaryPath)),
      detail: binaryPath ? toWorkspaceRelative(binaryPath) : "missing"
    },
    {
      id: "binary_hash_matches_plan",
      passed: Boolean(binarySha256 && approval.binarySha256 && binarySha256 === approval.binarySha256),
      detail: `current=${binarySha256 ?? "missing"} plan=${approval.binarySha256 ?? "missing"}`
    },
    {
      id: "program_id_override_matches_plan",
      passed: !requestedProgramId || requestedProgramId === planProgramId,
      detail: requestedProgramId ? "A program id override must already be part of the approved plan." : "No program id override supplied."
    },
    {
      id: "keypair_env_available",
      passed: typeof keypairPath === "string" && keypairPath.length > 0,
      detail: `Signer env ${signerEnvName} must be configured for deploy execution.`
    }
  ];
  const blocked = verification.status !== "verified" || executionChecks.some((check) => !check.passed);
  const realArgs = binaryPath
    ? ["program", "deploy", binaryPath, "--url", approval.rpcUrl ?? plan.network?.rpcUrl ?? resolveRpcUrl(options), "--keypair", keypairPath ?? ""]
    : [];
  if (programId) realArgs.push("--program-id", programId);
  realArgs.push(...extraArgs);
  const sanitizedCommand = [
    solanaExecutable,
    ...realArgs.map((entry) => redactKeypairPathText(entry, keypairPath, signerEnvName))
  ];

  let result = {
    status: undefined,
    signal: undefined,
    stdout: "",
    stderr: "",
    error: undefined
  };
  if (!blocked) {
    if (fake) {
      result = {
        status: 0,
        signal: null,
        stdout: `fake solana program deploy passed\nsignature=FAKE_DEPLOY_SIGNATURE\nprogramId=${programId ?? "unassigned"}\n`,
        stderr: "",
        error: undefined
      };
    } else {
      result = spawnSync(solanaExecutable, realArgs, {
        cwd: workspaceRoot(),
        encoding: "utf8",
        timeout: numberOption(options.timeoutMs, 120_000),
        maxBuffer: 20 * 1024 * 1024
      });
    }
  }

  const stdout = redactKeypairPathText(result.stdout ?? "", keypairPath, signerEnvName);
  const stderr = redactKeypairPathText(result.stderr ?? "", keypairPath, signerEnvName);
  const status = blocked ? "blocked" : result.status === 0 ? "deployed" : "failed";
  const payload = {
    schemaVersion: "ambient-program-deploy-execution-v1",
    packageName,
    generatedAt: nowIso(),
    status,
    mutation: blocked ? "none" : "chain-transaction",
    fake: !blocked && fake,
    planArtifact: verification.payload.planArtifact,
    approvalSha256: verification.payload.approvalSha256,
    expectedApprovalSha256: verification.payload.expectedApprovalSha256,
    approvalCopy: verification.payload.approvalCopy,
    verification: {
      status: verification.status,
      approvalAction: verification.payload.approvalAction,
      requireSigner: verification.payload.requireSigner,
      checks: verification.payload.checks,
      currentSigner: verification.payload.currentSigner
    },
    executionChecks,
    program: {
      binaryRelativePath: binaryPath ? toWorkspaceRelative(binaryPath) : undefined,
      binarySha256,
      approvedBinarySha256: approval.binarySha256,
      programId
    },
    network: {
      rpcUrl: approval.rpcUrl ?? plan.network?.rpcUrl ?? resolveRpcUrl(options)
    },
    signer: {
      envName: signerEnvName,
      publicKey: verification.payload.currentSigner?.publicKey,
      pathSha256: verification.payload.currentSigner?.pathSha256
    },
    sanitizedCommand,
    exitCode: blocked ? undefined : result.status,
    signal: blocked ? undefined : result.signal,
    durationMs: Date.now() - startedAt,
    stdout,
    stderr,
    error: result.error ? redactKeypairPathText(errorMessage(result.error), keypairPath, signerEnvName) : undefined,
    signature: extractDeploySignature(stdout),
    secretPolicy: "Deploy execution redacts the signer keypair path and never includes private key bytes."
  };
  const artifact = writeArtifact("program", payload, options);
  return writeJson({
    schemaVersion: "ambient-program-deploy-execution-result-v1",
    packageName,
    status,
    mutation: payload.mutation,
    fake: payload.fake,
    program: payload.program,
    signer: payload.signer,
    sanitizedCommand,
    exitCode: payload.exitCode,
    durationMs: payload.durationMs,
    signature: payload.signature,
    stdoutPreview: boundedTextPreview(stdout, 4_000),
    stderrPreview: boundedTextPreview(stderr, 4_000),
    checks: executionChecks,
    artifact
  });
}

function commandProgramUpgradePlan(options) {
  const binary = stringOption(options.binary ?? options._[0], "binary");
  const programId = stringOption(options.programId, "program id");
  const binaryPath = requireWorkspacePath(binary, "program binary");
  if (!existsSync(binaryPath)) throw new Error(`Program binary does not exist: ${binary}`);
  const stats = statSync(binaryPath);
  if (!stats.isFile()) throw new Error(`Program binary is not a file: ${binary}`);
  const bytes = readFileSync(binaryPath);
  const maxLamports = numberOption(options.maxLamports ?? process.env.AMBIENT_BLOCKCHAIN_MAX_LAMPORTS, 0);
  const signer = signerApprovalSummary("chain");
  const approval = {
    action: "ambient_program_upgrade",
    rpcUrl: resolveRpcUrl(options),
    binarySha256: sha256(bytes),
    binaryBytes: stats.size,
    programId,
    maxLamports,
    signer
  };
  const approvalSha256 = approvalDigest(approval);
  const payload = {
    schemaVersion: "ambient-program-upgrade-plan-v1",
    packageName,
    generatedAt: nowIso(),
    status: "planned",
    mutation: "none",
    network: {
      rpcUrl: resolveRpcUrl(options),
      websocketUrl: resolveWsUrl(options)
    },
    program: {
      binaryPath,
      binaryRelativePath: toWorkspaceRelative(binaryPath),
      bytes: stats.size,
      sha256: sha256(bytes),
      programId
    },
    signerConfigured: signer.configured,
    signer,
    maxLamports,
    approval,
    approvalSha256,
    approvalCopy: `Approve Ambient program upgrade: programId=${programId} binarySha256=${approval.binarySha256} maxLamports=${maxLamports} signer=${signer.publicKey ?? "unconfigured"}`,
    approvalRequired: [
      "Explicit user approval before signer use.",
      "Explicit lamport cap before upgrade.",
      "Transaction signature, program id, and observe evidence artifact after upgrade execution."
    ],
    nextCommand: "ambient_program_upgrade_execute --plan-artifact <path> --approval-sha256 <sha> --max-lamports <n> --require-signer --json"
  };
  const artifact = writeArtifact("program", payload, options);
  return writeJson({
    schemaVersion: "ambient-program-upgrade-plan-result-v1",
    packageName,
    status: "planned",
    mutation: "none",
    program: payload.program,
    signerConfigured: payload.signerConfigured,
    maxLamports,
    approvalSha256: payload.approvalSha256,
    approvalCopy: payload.approvalCopy,
    approvalRequired: payload.approvalRequired,
    artifact
  });
}

function commandProgramUpgradeExecute(options) {
  const maxLamports = numberOption(options.maxLamports ?? process.env.AMBIENT_BLOCKCHAIN_MAX_LAMPORTS, undefined);
  const verification = buildApprovalVerification({
    ...options,
    requireSigner: true,
    maxLamports
  });
  const startedAt = Date.now();
  const plan = verification.plan;
  const approval = verification.approval ?? {};
  const binaryReference = plan.program?.binaryRelativePath ?? plan.program?.binaryPath ?? approval.binaryRelativePath ?? approval.binaryPath;
  const binaryPath = typeof binaryReference === "string" && binaryReference.length > 0
    ? requireWorkspacePath(binaryReference, "program binary")
    : undefined;
  const binaryBytes = binaryPath && existsSync(binaryPath) ? readFileSync(binaryPath) : undefined;
  const binarySha256 = binaryBytes ? sha256(binaryBytes) : undefined;
  const signerEnvName = verification.payload.currentSigner?.envName ?? "AMBIENT_BLOCKCHAIN_KEYPAIR_FILE";
  const keypairPath = process.env[signerEnvName];
  const extraArgs = parseJsonArrayOption(options.extraArgsJson, "extra-args-json", [])
    .map((entry) => String(entry));
  const planProgramId = approval.programId ?? plan.program?.programId;
  const requestedProgramId = options.programId ? String(options.programId) : undefined;
  const programId = requestedProgramId ?? planProgramId;
  const solanaExecutable = String(options.solana ?? "solana");
  const fake = process.env.AMBIENT_BLOCKCHAIN_FAKE_SOLANA_UPGRADE === "1" || process.env.AMBIENT_BLOCKCHAIN_FAKE_SOLANA === "1" || options.fake === true;

  const executionChecks = [
    ...verification.checks,
    {
      id: "plan_is_program_upgrade",
      passed: plan.schemaVersion === "ambient-program-upgrade-plan-v1" && approval.action === "ambient_program_upgrade",
      detail: `planSchemaVersion=${plan.schemaVersion ?? "missing"} approvalAction=${approval.action ?? "missing"}`
    },
    {
      id: "verifier_lamport_cap_supplied",
      passed: maxLamports !== undefined,
      detail: maxLamports === undefined ? "Upgrade execution requires --max-lamports or AMBIENT_BLOCKCHAIN_MAX_LAMPORTS." : `cap=${maxLamports}`
    },
    {
      id: "program_id_present",
      passed: Boolean(programId),
      detail: programId ? "Program id is replayed from the approved plan." : "Plan did not include a program id."
    },
    {
      id: "program_id_override_matches_plan",
      passed: !requestedProgramId || requestedProgramId === planProgramId,
      detail: requestedProgramId ? "A program id override must already be part of the approved plan." : "No program id override supplied."
    },
    {
      id: "binary_reference_present",
      passed: Boolean(binaryReference),
      detail: binaryReference ? "Plan includes a program binary reference." : "Plan does not include a program binary reference."
    },
    {
      id: "binary_exists",
      passed: Boolean(binaryPath && existsSync(binaryPath)),
      detail: binaryPath ? toWorkspaceRelative(binaryPath) : "missing"
    },
    {
      id: "binary_hash_matches_plan",
      passed: Boolean(binarySha256 && approval.binarySha256 && binarySha256 === approval.binarySha256),
      detail: `current=${binarySha256 ?? "missing"} plan=${approval.binarySha256 ?? "missing"}`
    },
    {
      id: "keypair_env_available",
      passed: typeof keypairPath === "string" && keypairPath.length > 0,
      detail: `Signer env ${signerEnvName} must be configured for upgrade execution.`
    }
  ];
  const blocked = verification.status !== "verified" || executionChecks.some((check) => !check.passed);
  const realArgs = binaryPath
    ? ["program", "deploy", binaryPath, "--program-id", programId ?? "", "--url", approval.rpcUrl ?? plan.network?.rpcUrl ?? resolveRpcUrl(options), "--keypair", keypairPath ?? ""]
    : [];
  realArgs.push(...extraArgs);
  const sanitizedCommand = [
    solanaExecutable,
    ...realArgs.map((entry) => redactKeypairPathText(entry, keypairPath, signerEnvName))
  ];

  let result = { status: undefined, signal: undefined, stdout: "", stderr: "", error: undefined };
  if (!blocked) {
    if (fake) {
      result = {
        status: 0,
        signal: null,
        stdout: `fake solana program upgrade passed\nsignature=FAKE_UPGRADE_SIGNATURE\nprogramId=${programId}\n`,
        stderr: "",
        error: undefined
      };
    } else {
      result = spawnSync(solanaExecutable, realArgs, {
        cwd: workspaceRoot(),
        encoding: "utf8",
        timeout: numberOption(options.timeoutMs, 120_000),
        maxBuffer: 20 * 1024 * 1024
      });
    }
  }

  const stdout = redactKeypairPathText(result.stdout ?? "", keypairPath, signerEnvName);
  const stderr = redactKeypairPathText(result.stderr ?? "", keypairPath, signerEnvName);
  const status = blocked ? "blocked" : result.status === 0 ? "upgraded" : "failed";
  const payload = {
    schemaVersion: "ambient-program-upgrade-execution-v1",
    packageName,
    generatedAt: nowIso(),
    status,
    mutation: blocked ? "none" : "chain-transaction",
    fake: !blocked && fake,
    planArtifact: verification.payload.planArtifact,
    approvalSha256: verification.payload.approvalSha256,
    expectedApprovalSha256: verification.payload.expectedApprovalSha256,
    approvalCopy: verification.payload.approvalCopy,
    verification: {
      status: verification.status,
      approvalAction: verification.payload.approvalAction,
      requireSigner: verification.payload.requireSigner,
      checks: verification.payload.checks,
      currentSigner: verification.payload.currentSigner
    },
    executionChecks,
    program: {
      binaryRelativePath: binaryPath ? toWorkspaceRelative(binaryPath) : undefined,
      binarySha256,
      approvedBinarySha256: approval.binarySha256,
      programId
    },
    network: {
      rpcUrl: approval.rpcUrl ?? plan.network?.rpcUrl ?? resolveRpcUrl(options)
    },
    signer: {
      envName: signerEnvName,
      publicKey: verification.payload.currentSigner?.publicKey,
      pathSha256: verification.payload.currentSigner?.pathSha256
    },
    sanitizedCommand,
    exitCode: blocked ? undefined : result.status,
    signal: blocked ? undefined : result.signal,
    durationMs: Date.now() - startedAt,
    stdout,
    stderr,
    error: result.error ? redactKeypairPathText(errorMessage(result.error), keypairPath, signerEnvName) : undefined,
    signature: extractDeploySignature(stdout),
    secretPolicy: "Upgrade execution redacts the signer keypair path and never includes private key bytes."
  };
  const artifact = writeArtifact("program", payload, options);
  return writeJson({
    schemaVersion: "ambient-program-upgrade-execution-result-v1",
    packageName,
    status,
    mutation: payload.mutation,
    fake: payload.fake,
    program: payload.program,
    signer: payload.signer,
    sanitizedCommand,
    exitCode: payload.exitCode,
    durationMs: payload.durationMs,
    signature: payload.signature,
    stdoutPreview: boundedTextPreview(stdout, 4_000),
    stderrPreview: boundedTextPreview(stderr, 4_000),
    checks: executionChecks,
    artifact
  });
}

function commandProgramAuthorityPlan(options) {
  const programId = stringOption(options.programId ?? options._[0], "program id");
  const final = Boolean(options.final);
  const newAuthority = final ? undefined : stringOption(options.newAuthority, "new authority");
  const maxLamports = numberOption(options.maxLamports ?? process.env.AMBIENT_BLOCKCHAIN_MAX_LAMPORTS, 0);
  const signer = signerApprovalSummary("chain");
  const approval = {
    action: "ambient_program_authority_change",
    rpcUrl: resolveRpcUrl(options),
    programId,
    newAuthority,
    final,
    maxLamports,
    signer
  };
  const approvalSha256 = approvalDigest(approval);
  const payload = {
    schemaVersion: "ambient-program-authority-plan-v1",
    packageName,
    generatedAt: nowIso(),
    status: "planned",
    mutation: "none",
    network: {
      rpcUrl: resolveRpcUrl(options),
      websocketUrl: resolveWsUrl(options)
    },
    authority: {
      programId,
      newAuthority,
      final
    },
    signerConfigured: signer.configured,
    signer,
    maxLamports,
    approval,
    approvalSha256,
    approvalCopy: `Approve Ambient program authority change: programId=${programId} newAuthority=${newAuthority ?? "final"} final=${final} maxLamports=${maxLamports} signer=${signer.publicKey ?? "unconfigured"}`,
    approvalRequired: [
      "Explicit user approval before signer use.",
      "Explicit lamport cap before authority change.",
      "Transaction signature and post-change observation evidence after authority execution."
    ],
    nextCommand: "ambient_program_authority_execute --plan-artifact <path> --approval-sha256 <sha> --max-lamports <n> --require-signer --json"
  };
  const artifact = writeArtifact("program", payload, options);
  return writeJson({
    schemaVersion: "ambient-program-authority-plan-result-v1",
    packageName,
    status: "planned",
    mutation: "none",
    authority: payload.authority,
    signerConfigured: payload.signerConfigured,
    maxLamports,
    approvalSha256: payload.approvalSha256,
    approvalCopy: payload.approvalCopy,
    approvalRequired: payload.approvalRequired,
    artifact
  });
}

function commandProgramAuthorityExecute(options) {
  const maxLamports = numberOption(options.maxLamports ?? process.env.AMBIENT_BLOCKCHAIN_MAX_LAMPORTS, undefined);
  const verification = buildApprovalVerification({
    ...options,
    requireSigner: true,
    maxLamports
  });
  const startedAt = Date.now();
  const plan = verification.plan;
  const approval = verification.approval ?? {};
  const signerEnvName = verification.payload.currentSigner?.envName ?? "AMBIENT_BLOCKCHAIN_KEYPAIR_FILE";
  const keypairPath = process.env[signerEnvName];
  const extraArgs = parseJsonArrayOption(options.extraArgsJson, "extra-args-json", [])
    .map((entry) => String(entry));
  const planProgramId = approval.programId ?? plan.authority?.programId;
  const requestedProgramId = options.programId ? String(options.programId) : undefined;
  const programId = requestedProgramId ?? planProgramId;
  const requestedNewAuthority = options.newAuthority ? String(options.newAuthority) : undefined;
  const newAuthority = requestedNewAuthority ?? approval.newAuthority ?? plan.authority?.newAuthority;
  const requestedFinal = options.final === true;
  const final = approval.final === true || plan.authority?.final === true;
  const solanaExecutable = String(options.solana ?? "solana");
  const fake = process.env.AMBIENT_BLOCKCHAIN_FAKE_SOLANA_AUTHORITY === "1" || process.env.AMBIENT_BLOCKCHAIN_FAKE_SOLANA === "1" || options.fake === true;

  const executionChecks = [
    ...verification.checks,
    {
      id: "plan_is_program_authority_change",
      passed: plan.schemaVersion === "ambient-program-authority-plan-v1" && approval.action === "ambient_program_authority_change",
      detail: `planSchemaVersion=${plan.schemaVersion ?? "missing"} approvalAction=${approval.action ?? "missing"}`
    },
    {
      id: "verifier_lamport_cap_supplied",
      passed: maxLamports !== undefined,
      detail: maxLamports === undefined ? "Authority execution requires --max-lamports or AMBIENT_BLOCKCHAIN_MAX_LAMPORTS." : `cap=${maxLamports}`
    },
    {
      id: "program_id_present",
      passed: Boolean(programId),
      detail: programId ? "Program id is replayed from the approved plan." : "Plan did not include a program id."
    },
    {
      id: "program_id_override_matches_plan",
      passed: !requestedProgramId || requestedProgramId === planProgramId,
      detail: requestedProgramId ? "A program id override must already be part of the approved plan." : "No program id override supplied."
    },
    {
      id: "new_authority_matches_plan",
      passed: final || !requestedNewAuthority || requestedNewAuthority === approval.newAuthority,
      detail: final ? "Plan finalizes upgrade authority." : requestedNewAuthority ? "New authority override must match the approved plan." : "No new authority override supplied."
    },
    {
      id: "final_flag_matches_plan",
      passed: !requestedFinal || final,
      detail: requestedFinal ? "Execution --final must be part of the approved plan." : "No final override supplied."
    },
    {
      id: "authority_target_present",
      passed: final || Boolean(newAuthority),
      detail: final ? "Final authority removal requested." : "New authority must be present unless --final was approved."
    },
    {
      id: "keypair_env_available",
      passed: typeof keypairPath === "string" && keypairPath.length > 0,
      detail: `Signer env ${signerEnvName} must be configured for authority execution.`
    }
  ];
  const blocked = verification.status !== "verified" || executionChecks.some((check) => !check.passed);
  const realArgs = programId
    ? ["program", "set-upgrade-authority", programId, "--url", approval.rpcUrl ?? plan.network?.rpcUrl ?? resolveRpcUrl(options), "--keypair", keypairPath ?? ""]
    : [];
  if (final) {
    realArgs.push("--final");
  } else if (newAuthority) {
    realArgs.push("--new-upgrade-authority", newAuthority);
  }
  realArgs.push(...extraArgs);
  const sanitizedCommand = [
    solanaExecutable,
    ...realArgs.map((entry) => redactKeypairPathText(entry, keypairPath, signerEnvName))
  ];

  let result = { status: undefined, signal: undefined, stdout: "", stderr: "", error: undefined };
  if (!blocked) {
    if (fake) {
      result = {
        status: 0,
        signal: null,
        stdout: `fake solana program authority change passed\nsignature=FAKE_AUTHORITY_SIGNATURE\nprogramId=${programId}\n`,
        stderr: "",
        error: undefined
      };
    } else {
      result = spawnSync(solanaExecutable, realArgs, {
        cwd: workspaceRoot(),
        encoding: "utf8",
        timeout: numberOption(options.timeoutMs, 120_000),
        maxBuffer: 20 * 1024 * 1024
      });
    }
  }

  const stdout = redactKeypairPathText(result.stdout ?? "", keypairPath, signerEnvName);
  const stderr = redactKeypairPathText(result.stderr ?? "", keypairPath, signerEnvName);
  const status = blocked ? "blocked" : result.status === 0 ? "authority_changed" : "failed";
  const payload = {
    schemaVersion: "ambient-program-authority-execution-v1",
    packageName,
    generatedAt: nowIso(),
    status,
    mutation: blocked ? "none" : "chain-transaction",
    fake: !blocked && fake,
    planArtifact: verification.payload.planArtifact,
    approvalSha256: verification.payload.approvalSha256,
    expectedApprovalSha256: verification.payload.expectedApprovalSha256,
    approvalCopy: verification.payload.approvalCopy,
    verification: {
      status: verification.status,
      approvalAction: verification.payload.approvalAction,
      requireSigner: verification.payload.requireSigner,
      checks: verification.payload.checks,
      currentSigner: verification.payload.currentSigner
    },
    executionChecks,
    authority: {
      programId,
      newAuthority,
      final
    },
    network: {
      rpcUrl: approval.rpcUrl ?? plan.network?.rpcUrl ?? resolveRpcUrl(options)
    },
    signer: {
      envName: signerEnvName,
      publicKey: verification.payload.currentSigner?.publicKey,
      pathSha256: verification.payload.currentSigner?.pathSha256
    },
    sanitizedCommand,
    exitCode: blocked ? undefined : result.status,
    signal: blocked ? undefined : result.signal,
    durationMs: Date.now() - startedAt,
    stdout,
    stderr,
    error: result.error ? redactKeypairPathText(errorMessage(result.error), keypairPath, signerEnvName) : undefined,
    signature: extractDeploySignature(stdout),
    secretPolicy: "Authority execution redacts the signer keypair path and never includes private key bytes."
  };
  const artifact = writeArtifact("program", payload, options);
  return writeJson({
    schemaVersion: "ambient-program-authority-execution-result-v1",
    packageName,
    status,
    mutation: payload.mutation,
    fake: payload.fake,
    authority: payload.authority,
    signer: payload.signer,
    sanitizedCommand,
    exitCode: payload.exitCode,
    durationMs: payload.durationMs,
    signature: payload.signature,
    stdoutPreview: boundedTextPreview(stdout, 4_000),
    stderrPreview: boundedTextPreview(stderr, 4_000),
    checks: executionChecks,
    artifact
  });
}

async function commandLiveGate(options) {
  const generatedAt = nowIso();
  const lanes = [];
  const doctor = doctorForGate(options);
  lanes.push({
    id: "doctor",
    status: "passed",
    summary: "Deterministic package and contract metadata loaded.",
    details: {
      packageVersion: doctor.packageVersion,
      rpcUrl: doctor.network.rpcUrl,
      signerConfigured: doctor.env.find((entry) => entry.name === "AMBIENT_BLOCKCHAIN_KEYPAIR_FILE")?.configured ?? false
    }
  });
  const keypairs = [inspectKeypairBinding("chain"), inspectKeypairBinding("x402")];
  lanes.push({
    id: "keypair-safety",
    status: keypairs.some((entry) => entry.configured && (!entry.valid || entry.warnings.length > 0)) ? "needs_attention" : "checked",
    summary: "Signer bindings inspected without exposing keypair paths or private key bytes.",
    keypairs: keypairs.map((entry) => ({
      kind: entry.kind,
      envName: entry.envName,
      configured: entry.configured,
      valid: entry.valid,
      publicKey: entry.publicKey,
      pathSha256: entry.pathSha256,
      warnings: entry.warnings
    }))
  });

  if (options.desktopPi) {
    const dogfood = buildDesktopPiDogfood(options);
    lanes.push({
      id: "desktop-pi",
      status: dogfood.status,
      summary: dogfood.summary,
      details: dogfood
    });
  } else {
    lanes.push({
      id: "desktop-pi",
      status: "skipped",
      summary: "Pass --desktop-pi to run deterministic Desktop/Pi package discovery dogfood."
    });
  }

  if (options.liveRead) {
    const probes = [];
    for (const method of ["getHealth", "getVersion", "getSlot"]) {
      probes.push(await safeRpcProbe(method, [], options));
    }
    lanes.push({
      id: "safe-read",
      status: probes.every((probe) => probe.status === "passed") ? "passed" : "failed",
      summary: "Read-only Ambient RPC probes.",
      probes
    });
  } else {
    lanes.push({
      id: "safe-read",
      status: "skipped",
      summary: "Pass --live-read to run read-only Ambient RPC probes."
    });
  }

  if (options.oracle || options.oracleFunded) {
    lanes.push(await buildOracleLiveGateLane(options));
  } else {
    lanes.push({
      id: "oracle-funded",
      status: "skipped",
      summary: "Pass --oracle to produce a non-mutating Tool Oracle plan; add --oracle-funded for approved submit/wait/decode/reclaim evidence."
    });
  }

  if (options.x402 || options.x402Paid) {
    lanes.push(await buildX402LiveGateLane(options));
  } else {
    lanes.push({
      id: "x402-funded",
      status: "skipped",
      summary: "Pass --x402 to plan an x402 quote lane; add --x402-paid for approved paid request evidence."
    });
  }

  if (options.program) {
    lanes.push(await buildProgramLiveGateLane(options));
  } else {
    lanes.push({
      id: "program-workbench",
      status: "skipped",
      summary: "Pass --program to check Rust/Solana/Anchor readiness."
    });
  }

  if (options.localValidator) {
    const validatorGate = await buildLocalValidatorGate(options);
    const validatorArtifact = writeArtifact("validator", validatorGate, options);
    lanes.push({
      id: "local-validator",
      status: validatorGate.status,
      summary: validatorGate.summary,
      details: validatorGate,
      artifact: validatorArtifact
    });
  } else {
    lanes.push({
      id: "local-validator",
      status: "skipped",
      summary: "Pass --local-validator to check local validator readiness; add --start-validator for an opt-in lifecycle run."
    });
  }

  const payload = {
    schemaVersion: "ambient-blockchain-live-gate-v1",
    packageName,
    generatedAt,
    status: lanes.some((lane) => isFailingLaneStatus(lane.status)) ? "failed" : "completed",
    lanes,
    evidenceIndex: buildLiveGateEvidenceIndex(lanes),
    contracts: contractSummary(readContracts()),
    redactionFacts: {
      keypairPathsIncluded: false,
      privateKeyBytesIncluded: false,
      secretValuesIncluded: false
    }
  };
  const artifact = writeArtifact("live-gate", payload, options);
  const markdownArtifact = writeMarkdownArtifact("live-gate", payload, buildLiveGateMarkdown(payload, artifact), options);
  return writeJson({
    schemaVersion: "ambient-blockchain-live-gate-result-v1",
    packageName,
    status: payload.status,
    lanes: lanes.map((lane) => ({ id: lane.id, status: lane.status, summary: lane.summary })),
    artifact,
    markdownArtifact
  });
}

async function commandLocalValidatorGate(options) {
  const payload = await buildLocalValidatorGate(options);
  const artifact = writeArtifact("validator", payload, options);
  return writeJson({
    schemaVersion: "ambient-local-validator-gate-result-v1",
    packageName,
    status: payload.status,
    mutation: payload.mutation,
    fake: payload.fake,
    summary: payload.summary,
    command: payload.command,
    exitCode: payload.exitCode,
    durationMs: payload.durationMs,
    stdoutPreview: boundedTextPreview(payload.stdout, 4_000),
    stderrPreview: boundedTextPreview(payload.stderr, 4_000),
    checks: payload.checks,
    artifact
  });
}

function commandDesktopPiDogfood(options) {
  const payload = buildDesktopPiDogfood(options);
  const artifact = writeArtifact("dogfood", payload, options);
  return writeJson({
    schemaVersion: "ambient-desktop-pi-dogfood-result-v1",
    packageName,
    status: payload.status,
    mutation: payload.mutation,
    summary: payload.summary,
    checks: payload.checks,
    discovery: payload.discovery,
    healthCheck: payload.healthCheck,
    redactionFacts: payload.redactionFacts,
    artifact
  });
}

function doctorForGate(options) {
  const contracts = readContracts();
  return {
    schemaVersion: "ambient-blockchain-doctor-v1",
    packageName,
    packageVersion,
    status: "ready",
    generatedAt: nowIso(),
    network: {
      name: contracts.network.name,
      runtime: contracts.network.runtime,
      rpcUrl: resolveRpcUrl(options),
      websocketUrl: resolveWsUrl(options)
    },
    contracts: contractSummary(contracts),
    env: envStatus(),
    commands: commandSummary(),
    safety: contracts.safety,
    liveTestLanes: contracts.liveTestLanes
  };
}

function buildDesktopPiDogfood(_options) {
  const generatedAt = nowIso();
  const manifestPath = join(packageRoot, "ambient-cli.json");
  const skillPath = join(packageRoot, "SKILL.md");
  const contractsBytes = readFileSync(contractsPath);
  const manifestBytes = readFileSync(manifestPath);
  const skillBytes = readFileSync(skillPath);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const contracts = JSON.parse(contractsBytes.toString("utf8"));
  const skillText = skillBytes.toString("utf8");
  const skillLower = skillText.toLowerCase();
  const manifestCommands = Object.keys(manifest.commands ?? {});
  const requiredCommands = [
    "ambient_chain_doctor",
    "ambient_chain_rpc",
    "ambient_approval_verify",
    "ambient_oracle_request_plan",
    "ambient_oracle_request_submit",
    "ambient_x402_quote",
    "ambient_x402_request_execute",
    "ambient_program_scaffold",
    "ambient_program_deploy_plan",
    "ambient_program_deploy_execute",
    "ambient_local_validator_gate",
    "ambient_desktop_pi_dogfood",
    "ambient_blockchain_live_gate"
  ];
  const missingCommands = requiredCommands.filter((command) => !manifestCommands.includes(command));
  const forbiddenSkillPhrases = [
    "paste api key",
    "paste private key",
    "print private key",
    "print keypair path",
    "log private key",
    "log keypair path",
    "pass payment header in chat"
  ];
  const unsafeSkillPhrases = forbiddenSkillPhrases.filter((phrase) => skillLower.includes(phrase));
  const doctorRun = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "doctor", "--fast", "--json"], {
    cwd: packageRoot,
    encoding: "utf8",
    timeout: 10_000,
    maxBuffer: 2 * 1024 * 1024
  });
  let parsedDoctor;
  let doctorParseError;
  try {
    parsedDoctor = JSON.parse(doctorRun.stdout || "{}");
  } catch (error) {
    doctorParseError = errorMessage(error);
  }
  const doctorCommands = parsedDoctor?.commands ?? {};
  const doctorHasPlanner = Array.isArray(doctorCommands.planners) && doctorCommands.planners.includes("ambient_oracle_request_plan");
  const doctorHasFunded = Array.isArray(doctorCommands.funded) && doctorCommands.funded.includes("ambient_x402_request_execute");
  const doctorHasGate = Array.isArray(doctorCommands.gates) && doctorCommands.gates.includes("ambient_blockchain_live_gate");
  const skillFacts = {
    mentionsSearch: skillText.includes("ambient_cli_search"),
    mentionsDescribe: skillText.includes("ambient_cli_describe"),
    startsWithDoctor: skillText.includes("ambient_chain_doctor --json"),
    mentionsSafeLiveRead: skillText.includes("Safe live-read is the default live lane"),
    mentionsKeypairStatus: skillText.includes("ambient_keypair_status"),
    mentionsApprovalVerify: skillText.includes("ambient_approval_verify"),
    mentionsNoSecretExposure: skillLower.includes("never paste key material") && skillLower.includes("never prints keypair paths")
  };
  const checks = [
    {
      id: "manifest_name_matches_package",
      passed: manifest.name === packageName,
      detail: `manifest=${manifest.name ?? "missing"} package=${packageName}`
    },
    {
      id: "manifest_version_matches_script",
      passed: manifest.version === packageVersion,
      detail: `manifest=${manifest.version ?? "missing"} script=${packageVersion}`
    },
    {
      id: "manifest_exposes_required_commands",
      passed: missingCommands.length === 0,
      detail: missingCommands.length ? `missing=${missingCommands.join(",")}` : `${requiredCommands.length} required commands present`
    },
    {
      id: "contracts_include_desktop_pi_lane",
      passed: Array.isArray(contracts.liveTestLanes) && contracts.liveTestLanes.some((lane) => lane.id === "desktop-pi"),
      detail: "contracts.liveTestLanes must advertise the Desktop/Pi discovery lane"
    },
    {
      id: "skill_progressive_discovery_present",
      passed: skillFacts.mentionsSearch && skillFacts.mentionsDescribe && skillFacts.startsWithDoctor,
      detail: "Skill must tell Pi to search, describe, and run doctor before use."
    },
    {
      id: "skill_safety_gates_present",
      passed: skillFacts.mentionsSafeLiveRead && skillFacts.mentionsKeypairStatus && skillFacts.mentionsApprovalVerify,
      detail: "Skill must expose safe live-read, signer status, and approval verification flow."
    },
    {
      id: "skill_secret_handling_is_safe",
      passed: skillFacts.mentionsNoSecretExposure && unsafeSkillPhrases.length === 0,
      detail: unsafeSkillPhrases.length ? `unsafe phrases=${unsafeSkillPhrases.join(",")}` : "No unsafe secret-handling phrases detected."
    },
    {
      id: "doctor_health_check_passed",
      passed: doctorRun.status === 0 && parsedDoctor?.status === "ready",
      detail: `exit=${doctorRun.status ?? "missing"} status=${parsedDoctor?.status ?? "missing"}`
    },
    {
      id: "doctor_exposes_planners_funded_and_gates",
      passed: doctorHasPlanner && doctorHasFunded && doctorHasGate,
      detail: `planner=${doctorHasPlanner} funded=${doctorHasFunded} gate=${doctorHasGate}`
    }
  ];
  const passed = checks.every((check) => check.passed);
  return {
    schemaVersion: "ambient-desktop-pi-dogfood-v1",
    packageName,
    packageVersion,
    generatedAt,
    status: passed ? "passed" : "failed",
    mutation: "none",
    summary: passed
      ? "Desktop/Pi discovery dogfood passed without network, secrets, signing, or spend."
      : "Desktop/Pi discovery dogfood found package discovery or health-check gaps.",
    checks,
    discovery: {
      searchTerms: ["Ambient Blockchain", "Solana RPC", "Tool Oracle", "x402", "program deploy", "live gate"],
      describeFlow: [
        "ambient_cli_search query='Ambient Blockchain Tool Oracle x402'",
        "ambient_cli_describe packageName='ambient-blockchain' includeSkill=true",
        "ambient_chain_doctor --json"
      ],
      requiredCommandsPresent: missingCommands.length === 0,
      missingCommands,
      skillFacts,
      artifacts: {
        manifest: {
          relativePath: toWorkspaceRelative(manifestPath),
          bytes: manifestBytes.length,
          sha256: sha256(manifestBytes)
        },
        skill: {
          relativePath: toWorkspaceRelative(skillPath),
          bytes: skillBytes.length,
          sha256: sha256(skillBytes)
        },
        contracts: {
          relativePath: toWorkspaceRelative(contractsPath),
          bytes: contractsBytes.length,
          sha256: sha256(contractsBytes)
        }
      }
    },
    healthCheck: {
      command: ["node", "scripts/run.mjs", "doctor", "--fast", "--json"],
      exitCode: doctorRun.status,
      signal: doctorRun.signal,
      stdoutPreview: boundedTextPreview(doctorRun.stdout ?? "", 4_000),
      stderrPreview: boundedTextPreview(doctorRun.stderr ?? "", 4_000),
      parseError: doctorParseError,
      parsedStatus: parsedDoctor?.status,
      parsedPackageVersion: parsedDoctor?.packageVersion
    },
    redactionFacts: {
      keypairPathsIncluded: false,
      privateKeyBytesIncluded: false,
      secretValuesIncluded: false
    }
  };
}

async function buildOracleLiveGateLane(options) {
  const fundedRequested = Boolean(options.oracleFunded || options.oracleSubmit);
  const oraclePlan = buildOraclePlan({
    ...options,
    prompt: options.prompt ?? "Ambient Blockchain live gate Tool Oracle planning probe"
  });
  const planArtifact = writeArtifact("oracle", oraclePlan, options);
  const lane = {
    id: "oracle-funded",
    status: "planned",
    summary: "Funded Tool Oracle lane is plan-first; submit/reclaim are approval-gated adapter-backed commands.",
    promptSha256: oraclePlan.promptSha256,
    promptBytes: oraclePlan.promptBytes,
    escrowLamports: oraclePlan.escrowLamports,
    maxLamports: oraclePlan.maxLamports,
    maxResponses: oraclePlan.maxResponses,
    signerConfigured: oraclePlan.signerConfigured,
    approvalSha256: oraclePlan.approvalSha256,
    approvalCopy: oraclePlan.approvalCopy,
    approvalRequired: oraclePlan.approvalRequired,
    planArtifact
  };
  if (!fundedRequested) return lane;

  const submitArgs = [
    "oracle-submit",
    "--plan-artifact",
    planArtifact.relativePath,
    "--approval-sha256",
    oraclePlan.approvalSha256,
    "--max-lamports",
    String(oraclePlan.maxLamports),
    "--require-signer",
    "--json"
  ];
  addOptionalCommandArg(submitArgs, "--client-command-json", options.clientCommandJson);
  addFlagCommandArg(submitArgs, "--fake", options.fake);
  addOptionalCommandArg(submitArgs, "--timeout-ms", options.oracleTimeoutMs ?? options.timeoutMs);
  const submit = runPackageJsonCommand(submitArgs, {
    timeoutMs: numberOption(options.oracleTimeoutMs ?? options.timeoutMs, 180_000),
    redactions: [oraclePlan.prompt]
  });
  const submitStatus = submit.parsed?.status ?? (submit.exitCode === 0 ? "unknown" : "failed");
  if (submit.exitCode !== 0 || submitStatus !== "submitted") {
    return {
      ...lane,
      status: submitStatus === "blocked" ? "blocked" : "failed",
      summary: `Tool Oracle submit ended with status ${submitStatus}.`,
      fundedRequested: true,
      submit
    };
  }

  const submitArtifact = submit.parsed?.artifact?.relativePath;
  const waitArgs = [
    "oracle-wait",
    "--submit-artifact",
    submitArtifact,
    "--max-attempts",
    String(cappedInteger(options.oracleMaxAttempts ?? options.maxAttempts, 1, 1, 500, "oracle-max-attempts")),
    "--interval-ms",
    String(cappedInteger(options.oracleIntervalMs ?? options.intervalMs, 0, 0, 60_000, "oracle-interval-ms")),
    "--json"
  ];
  addOptionalCommandArg(waitArgs, "--rpc-url", options.oracleObserveRpcUrl ?? options.rpcUrl);
  addOptionalCommandArg(waitArgs, "--timeout-ms", options.oracleTimeoutMs ?? options.timeoutMs);
  addFlagCommandArg(waitArgs, "--fake", options.oracleFakeWait);
  const wait = runPackageJsonCommand(waitArgs, {
    timeoutMs: numberOption(options.oracleTimeoutMs ?? options.timeoutMs, 180_000),
    redactions: [oraclePlan.prompt]
  });
  const waitStatus = wait.parsed?.status ?? (wait.exitCode === 0 ? "unknown" : "failed");
  if (wait.exitCode !== 0 || !["terminal", "observed", "not_found"].includes(waitStatus)) {
    return {
      ...lane,
      status: waitStatus === "blocked" ? "blocked" : "failed",
      summary: `Tool Oracle wait ended with status ${waitStatus}.`,
      fundedRequested: true,
      submit,
      wait
    };
  }

  let decode;
  if (wait.parsed?.artifact?.relativePath) {
    decode = runPackageJsonCommand([
      "oracle-decode",
      "--wait-artifact",
      wait.parsed.artifact.relativePath,
      "--json"
    ], {
      timeoutMs: numberOption(options.oracleTimeoutMs ?? options.timeoutMs, 60_000),
      redactions: [oraclePlan.prompt]
    });
  }

  const reclaimMaxLamports = numberOption(options.oracleReclaimMaxLamports ?? options.reclaimMaxLamports ?? oraclePlan.maxLamports, oraclePlan.maxLamports);
  const reclaimPlan = runPackageJsonCommand([
    "oracle-reclaim-plan",
    "--submit-artifact",
    submitArtifact,
    "--max-lamports",
    String(reclaimMaxLamports),
    "--json"
  ], {
    timeoutMs: numberOption(options.oracleTimeoutMs ?? options.timeoutMs, 60_000),
    redactions: [oraclePlan.prompt]
  });
  const reclaimPlanStatus = reclaimPlan.parsed?.status ?? (reclaimPlan.exitCode === 0 ? "unknown" : "failed");
  if (reclaimPlan.exitCode !== 0 || reclaimPlanStatus !== "planned") {
    return {
      ...lane,
      status: reclaimPlanStatus === "blocked" ? "blocked" : "failed",
      summary: `Tool Oracle reclaim plan ended with status ${reclaimPlanStatus}.`,
      fundedRequested: true,
      submit,
      wait,
      decode,
      reclaimPlan
    };
  }

  const reclaim = runPackageJsonCommand([
    "oracle-reclaim-execute",
    "--plan-artifact",
    reclaimPlan.parsed.artifact.relativePath,
    "--approval-sha256",
    reclaimPlan.parsed.approvalSha256,
    "--max-lamports",
    String(reclaimMaxLamports),
    "--require-signer",
    "--json",
    ...(options.fake ? ["--fake"] : []),
    ...(options.clientCommandJson ? ["--client-command-json", String(options.clientCommandJson)] : [])
  ], {
    timeoutMs: numberOption(options.oracleTimeoutMs ?? options.timeoutMs, 120_000),
    redactions: [oraclePlan.prompt]
  });
  const reclaimStatus = reclaim.parsed?.status ?? (reclaim.exitCode === 0 ? "unknown" : "failed");
  const laneStatus = reclaim.exitCode !== 0
    ? "failed"
    : reclaimStatus === "reclaimed"
      ? "reclaimed"
      : reclaimStatus === "blocked"
        ? "blocked"
        : "failed";
  return {
    ...lane,
    status: laneStatus,
    summary: laneStatus === "reclaimed"
      ? "Approved Tool Oracle request completed submit, wait, decode, and reclaim evidence."
      : `Tool Oracle reclaim execution ended with status ${reclaimStatus}.`,
    fundedRequested: true,
    submit,
    wait,
    decode,
    reclaimPlan,
    reclaim
  };
}

async function buildX402LiveGateLane(options) {
  const paidRequested = Boolean(options.x402Paid || options.x402Execute);
  const quote = await buildX402Quote(options);
  const quoteArtifact = writeArtifact("x402", quote, options);
  const lane = {
    id: "x402-funded",
    status: quote.status,
    summary: quote.liveProbe ? "x402 endpoint probed without payment." : "x402 payment lane planned without live probe.",
    endpoint: quote.endpoint,
    method: quote.method,
    liveProbe: quote.liveProbe,
    maxLamports: quote.maxLamports,
    maxMicroUsdc: quote.maxMicroUsdc,
    signerConfigured: quote.signerConfigured,
    approvalSha256: quote.approvalSha256,
    approvalCopy: quote.approvalCopy,
    approvalRequired: quote.approvalRequired,
    quoteArtifact
  };
  if (!paidRequested) return lane;
  if (quote.status === "failed") {
    return {
      ...lane,
      status: "failed",
      summary: "x402 paid lane was requested but quote/probe failed before payment execution.",
      paidRequested: true
    };
  }

  const commandArgs = [
    fileURLToPath(import.meta.url),
    "x402-request-execute",
    "--quote-artifact",
    quoteArtifact.relativePath,
    "--approval-sha256",
    quote.approvalSha256,
    "--max-lamports",
    String(quote.maxLamports),
    "--max-micro-usdc",
    String(quote.maxMicroUsdc),
    "--json"
  ];
  const sanitizedCommand = [
    "node",
    "scripts/run.mjs",
    "x402-request-execute",
    "--quote-artifact",
    quoteArtifact.relativePath,
    "--approval-sha256",
    quote.approvalSha256,
    "--max-lamports",
    String(quote.maxLamports),
    "--max-micro-usdc",
    String(quote.maxMicroUsdc),
    "--json"
  ];
  const addOption = (flag, value, sanitizedValue = value) => {
    if (value === undefined || value === true) return;
    commandArgs.push(flag, String(value));
    sanitizedCommand.push(flag, String(sanitizedValue));
  };
  addOption("--payment-header-file", options.paymentHeaderFile, "<X402_PAYMENT_HEADER_FILE>");
  addOption("--body", options.body);
  addOption("--body-file", options.bodyFile, "<X402_BODY_FILE>");
  addOption("--content-type", options.contentType);
  addOption("--accept", options.accept);
  addOption("--headers-json", options.headersJson);
  if (options.fake) {
    commandArgs.push("--fake");
    sanitizedCommand.push("--fake");
  }
  if (options.timeoutMs !== undefined && options.timeoutMs !== true) {
    commandArgs.push("--timeout-ms", String(options.timeoutMs));
    sanitizedCommand.push("--timeout-ms", String(options.timeoutMs));
  }

  const startedAt = Date.now();
  const execution = spawnSync(process.execPath, commandArgs, {
    cwd: workspaceRoot(),
    env: process.env,
    encoding: "utf8",
    timeout: numberOption(options.x402TimeoutMs ?? options.timeoutMs, 90_000),
    maxBuffer: 10 * 1024 * 1024
  });
  let parsedResult;
  let parseError;
  try {
    parsedResult = JSON.parse(execution.stdout || "{}");
  } catch (error) {
    parseError = errorMessage(error);
  }
  const executionStatus = parsedResult?.status ?? (execution.status === 0 ? "unknown" : "failed");
  const laneStatus = execution.status !== 0
    ? "failed"
    : executionStatus === "paid"
      ? "paid"
      : executionStatus === "blocked"
        ? "blocked"
        : executionStatus === "http_error" || executionStatus === "failed"
          ? "failed"
          : executionStatus;
  return {
    ...lane,
    status: laneStatus,
    summary: laneStatus === "paid"
      ? "Approved x402 paid request executed with receipt and redacted response evidence."
      : `x402 paid request execution ended with status ${laneStatus}.`,
    paidRequested: true,
    execution: {
      command: sanitizedCommand,
      exitCode: execution.status,
      signal: execution.signal,
      durationMs: Date.now() - startedAt,
      stdoutPreview: boundedTextPreview(execution.stdout ?? "", 4_000),
      stderrPreview: boundedTextPreview(execution.stderr ?? "", 4_000),
      parseError,
      result: parsedResult
    }
  };
}

async function buildProgramLiveGateLane(options) {
  const lifecycleRequested = Boolean(options.programLifecycle || options.programDeploy);
  const doctor = buildProgramDoctor(options);
  const lane = {
    id: "program-workbench",
    status: "checked",
    summary: "Local program toolchain readiness checked without deployment.",
    doctor
  };
  if (!lifecycleRequested) return lane;

  const generatedAt = nowIso();
  const projectDir = options.programProjectDir
    ? requireWorkspacePath(String(options.programProjectDir), "program project directory")
    : resolve(workspaceRoot(), ".ambient", "blockchain", "program-live-gate", `${compactTimestamp(generatedAt)}-workbench`);
  const projectRelativePath = toWorkspaceRelative(projectDir);
  const template = String(options.programTemplate ?? "native-rust");
  const name = String(options.programName ?? "ambient-live-gate");
  const fakeCargo = Boolean(options.programFakeCargo || options.fake);
  const commandEnv = fakeCargo ? { AMBIENT_BLOCKCHAIN_FAKE_CARGO: "1" } : {};

  const scaffold = runPackageJsonCommand([
    "program-scaffold",
    "--project-dir",
    projectRelativePath,
    "--template",
    template,
    "--name",
    name,
    "--force",
    "--json"
  ], {
    timeoutMs: numberOption(options.programTimeoutMs ?? options.timeoutMs, 60_000)
  });
  if (scaffold.exitCode !== 0 || scaffold.parsed?.status !== "scaffolded") {
    return {
      ...lane,
      status: "failed",
      summary: "Program live-gate scaffold failed.",
      lifecycleRequested: true,
      projectRelativePath,
      scaffold
    };
  }

  const build = runPackageJsonCommand([
    "program-build",
    "--project-dir",
    projectRelativePath,
    "--json"
  ], {
    timeoutMs: numberOption(options.programTimeoutMs ?? options.timeoutMs, 180_000),
    env: commandEnv
  });
  if (build.exitCode !== 0 || build.parsed?.status !== "passed") {
    return {
      ...lane,
      status: "failed",
      summary: "Program live-gate build failed.",
      lifecycleRequested: true,
      projectRelativePath,
      scaffold,
      build
    };
  }

  const test = runPackageJsonCommand([
    "program-test",
    "--project-dir",
    projectRelativePath,
    "--json"
  ], {
    timeoutMs: numberOption(options.programTimeoutMs ?? options.timeoutMs, 180_000),
    env: commandEnv
  });
  if (test.exitCode !== 0 || test.parsed?.status !== "passed") {
    return {
      ...lane,
      status: "failed",
      summary: "Program live-gate tests failed.",
      lifecycleRequested: true,
      projectRelativePath,
      scaffold,
      build,
      test
    };
  }

  const base = {
    ...lane,
    status: "tested",
    summary: "Program live-gate scaffold, build, and test evidence completed.",
    lifecycleRequested: true,
    projectRelativePath,
    template,
    fakeCargo,
    scaffold,
    build,
    test
  };
  if (!options.programDeploy) return base;

  const binaryPath = options.programBinary
    ? requireWorkspacePath(String(options.programBinary), "program binary")
    : resolve(projectDir, "target", "deploy", "live_gate_program.so");
  if (!existsSync(binaryPath)) {
    mkdirSync(dirname(binaryPath), { recursive: true });
    writeFileSync(binaryPath, `ambient live gate program bytes ${generatedAt}\n`, "utf8");
  }
  const binaryRelativePath = toWorkspaceRelative(binaryPath);
  const maxLamports = numberOption(options.programMaxLamports ?? options.maxLamports ?? process.env.AMBIENT_BLOCKCHAIN_MAX_LAMPORTS, 5_000);
  const deployPlan = runPackageJsonCommand([
    "program-deploy-plan",
    "--binary",
    binaryRelativePath,
    "--max-lamports",
    String(maxLamports),
    ...(options.programId ? ["--program-id", String(options.programId)] : []),
    "--json"
  ], {
    timeoutMs: numberOption(options.programTimeoutMs ?? options.timeoutMs, 60_000)
  });
  if (deployPlan.exitCode !== 0 || deployPlan.parsed?.status !== "planned") {
    return {
      ...base,
      status: "failed",
      summary: "Program live-gate deploy plan failed.",
      binary: binarySummary(binaryPath),
      deployPlan
    };
  }

  const deployEnv = options.fake || options.programFakeDeploy
    ? { AMBIENT_BLOCKCHAIN_FAKE_SOLANA_DEPLOY: "1" }
    : {};
  const deploy = runPackageJsonCommand([
    "program-deploy-execute",
    "--plan-artifact",
    deployPlan.parsed.artifact.relativePath,
    "--approval-sha256",
    deployPlan.parsed.approvalSha256,
    "--max-lamports",
    String(maxLamports),
    "--require-signer",
    "--json",
    ...(options.fake || options.programFakeDeploy ? ["--fake"] : [])
  ], {
    timeoutMs: numberOption(options.programTimeoutMs ?? options.timeoutMs, 120_000),
    env: deployEnv
  });
  const deployStatus = deploy.parsed?.status ?? (deploy.exitCode === 0 ? "unknown" : "failed");
  const status = deploy.exitCode !== 0
    ? "failed"
    : deployStatus === "deployed"
      ? "deployed"
      : deployStatus === "blocked"
        ? "blocked"
        : "failed";
  const deployedLane = {
    ...base,
    status,
    summary: status === "deployed"
      ? "Program live-gate scaffold, build, test, deploy plan, and approved deploy evidence completed."
      : `Program live-gate deploy execution ended with status ${deployStatus}.`,
    binary: binarySummary(binaryPath),
    deployPlan,
    deploy
  };
  if (!options.programObserve || status !== "deployed") return deployedLane;

  const observedProgramId = String(
    options.programObserveProgramId ??
    options.programId ??
    deploy.parsed?.program?.programId ??
    ""
  );
  if (!observedProgramId) {
    return {
      ...deployedLane,
      status: "failed",
      summary: "Program observation was requested but no program id was available."
    };
  }
  const observe = runPackageJsonCommand([
    "program-observe",
    "--program-id",
    observedProgramId,
    "--filters-json",
    String(options.programObserveFiltersJson ?? options.filtersJson ?? "[{\"dataSize\":8}]"),
    "--data-slice-length",
    String(numberOption(options.programObserveDataSliceLength ?? options.dataSliceLength, 8)),
    "--limit",
    String(cappedInteger(options.programObserveLimit ?? options.limit, 5, 1, 100, "program-observe-limit")),
    "--json",
    ...(options.programObserveFake || options.fake ? ["--fake"] : []),
    ...(options.rpcUrl ? ["--rpc-url", String(options.rpcUrl)] : [])
  ], {
    timeoutMs: numberOption(options.programTimeoutMs ?? options.timeoutMs, 120_000),
    env: options.programObserveFake || options.fake ? { AMBIENT_BLOCKCHAIN_FAKE_PROGRAM_OBSERVE: "1" } : {}
  });
  const observeStatus = observe.parsed?.status ?? (observe.exitCode === 0 ? "unknown" : "failed");
  if (observe.exitCode !== 0 || observeStatus !== "completed") {
    return {
      ...deployedLane,
      status: "failed",
      summary: `Program observation ended with status ${observeStatus}.`,
      observe
    };
  }
  return {
    ...deployedLane,
    status: "observed",
    summary: "Program live-gate scaffold, build, test, approved deploy, and post-deploy observation evidence completed.",
    observe
  };
}

function binarySummary(binaryPath) {
  const bytes = readFileSync(binaryPath);
  return {
    relativePath: toWorkspaceRelative(binaryPath),
    bytes: bytes.length,
    sha256: sha256(bytes)
  };
}

function runPackageJsonCommand(args, { timeoutMs, redactions = [], env = {} } = {}) {
  const commandRedactions = normalizeRedactions([
    ...redactions,
    process.env.AMBIENT_BLOCKCHAIN_KEYPAIR_FILE,
    process.env.AMBIENT_X402_KEYPAIR_FILE,
    process.env.AMBIENT_X402_PAYMENT_HEADER_FILE
  ]);
  const command = [process.execPath, fileURLToPath(import.meta.url), ...args.map((arg) => String(arg))];
  const result = spawnSync(command[0], command.slice(1), {
    cwd: workspaceRoot(),
    env: { ...process.env, ...env },
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 10 * 1024 * 1024
  });
  const stdout = redactSensitiveText(result.stdout ?? "", commandRedactions);
  const stderr = redactSensitiveText(result.stderr ?? "", commandRedactions);
  let parsed;
  let parseError;
  try {
    parsed = JSON.parse(stdout || "{}");
  } catch (error) {
    parseError = errorMessage(error);
  }
  return {
    command: ["node", "scripts/run.mjs", ...args.map((arg) => redactSensitiveText(String(arg), commandRedactions))],
    exitCode: result.status,
    signal: result.signal,
    stdoutPreview: boundedTextPreview(stdout, 4_000),
    stderrPreview: boundedTextPreview(stderr, 4_000),
    parseError,
    parsed: redactJsonValue(parsed, commandRedactions)
  };
}

function addOptionalCommandArg(args, flag, value) {
  if (value === undefined || value === true) return;
  args.push(flag, String(value));
}

function addFlagCommandArg(args, flag, value) {
  if (value === true) args.push(flag);
}

function normalizeRedactions(values) {
  return values
    .filter((value) => typeof value === "string" && value.length > 0)
    .map((value, index) => ({ value, replacement: `<REDACTED_${index + 1}>` }));
}

function redactJsonValue(value, redactions) {
  if (value === undefined) return undefined;
  const text = redactSensitiveText(JSON.stringify(value), redactions);
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function buildOraclePlan(options) {
  const contracts = readContracts();
  const prompt = promptFromOptions(options);
  const promptHash = sha256(Buffer.from(prompt, "utf8"));
  const escrowLamports = numberOption(options.escrowLamports, 0);
  const maxLamports = numberOption(options.maxLamports ?? process.env.AMBIENT_BLOCKCHAIN_MAX_LAMPORTS, escrowLamports || 0);
  if (maxLamports > 0 && escrowLamports > maxLamports) {
    throw new Error(`escrow-lamports ${escrowLamports} exceeds max-lamports ${maxLamports}.`);
  }
  const signer = signerApprovalSummary("chain");
  const approval = {
    action: "tool_oracle_request",
    rpcUrl: resolveRpcUrl(options),
    toolOracleProgramId: contracts.programs.toolOracle.programId,
    auctionProgramId: contracts.programs.auction.programId,
    promptSha256: promptHash,
    promptBytes: Buffer.byteLength(prompt, "utf8"),
    escrowLamports,
    maxLamports,
    maxResponses: numberOption(options.maxResponses, 1),
    responseFilter: options.filter ? String(options.filter) : undefined,
    signer
  };
  const approvalSha256 = approvalDigest(approval);
  return {
    schemaVersion: "ambient-oracle-request-plan-v1",
    packageName,
    generatedAt: nowIso(),
    status: "planned",
    mutation: "none",
    network: {
      rpcUrl: resolveRpcUrl(options),
      websocketUrl: resolveWsUrl(options)
    },
    toolOracleProgramId: contracts.programs.toolOracle.programId,
    auctionProgramId: contracts.programs.auction.programId,
    prompt,
    promptSha256: promptHash,
    promptBytes: Buffer.byteLength(prompt, "utf8"),
    escrowLamports,
    maxLamports,
    maxResponses: approval.maxResponses,
    responseFilter: options.filter ? String(options.filter) : undefined,
    signerConfigured: signer.configured,
    signer,
    approval,
    approvalSha256,
    approvalCopy: `Approve Tool Oracle request: promptSha256=${promptHash} escrowLamports=${escrowLamports} maxLamports=${maxLamports} signer=${signer.publicKey ?? "unconfigured"}`,
    approvalRequired: [
      "Explicit user approval before signer use.",
      "Explicit lamport cap before any funded oracle transaction.",
      "Transaction signature, request account, and observation artifact after future submit command."
    ],
    nextCommand: "Future signer-backed Tool Oracle submit command; this bundled command does not sign or submit transactions."
  };
}

async function buildX402Quote(options) {
  const contracts = readContracts();
  const endpoint = String(options.endpoint ?? options.url ?? contracts.x402.defaultEndpoint);
  const maxLamports = numberOption(options.maxLamports ?? process.env.AMBIENT_BLOCKCHAIN_MAX_LAMPORTS, 0);
  const maxMicroUsdc = numberOption(options.maxMicroUsdc ?? process.env.AMBIENT_X402_MAX_MICRO_USDC, 0);
  const x402Signer = signerApprovalSummary("x402");
  const chainSigner = signerApprovalSummary("chain");
  const signer = x402Signer.configured ? x402Signer : chainSigner;
  const method = String(options.method ?? "GET").toUpperCase();
  const approval = {
    action: "x402_paid_request",
    endpoint,
    method,
    maxLamports,
    maxMicroUsdc,
    signer
  };
  const approvalSha256 = approvalDigest(approval);
  const payload = {
    schemaVersion: "ambient-x402-quote-v1",
    packageName,
    generatedAt: nowIso(),
    status: "planned",
    mutation: "none",
    endpoint,
    method,
    maxLamports,
    maxMicroUsdc,
    signerConfigured: signer.configured,
    signer,
    approval,
    approvalSha256,
    approvalCopy: `Approve x402 paid request: endpoint=${endpoint} method=${method} maxMicroUsdc=${maxMicroUsdc} maxLamports=${maxLamports} signer=${signer.publicKey ?? "unconfigured"}`,
    approvalRequired: [
      "Explicit user approval before payment authorization.",
      "Explicit lamport and micro-USDC caps before x402 settlement.",
      "Payment proof, HTTP status, and response artifact after future paid request command."
    ]
  };

  if (options.live) {
    const probe = await safeHttpProbe(endpoint, payload.method, numberOption(options.timeoutMs, 15_000));
    payload.liveProbe = probe;
    payload.status = probe.status === "passed" || probe.status === "http_error" ? "quoted" : "failed";
  }

  return payload;
}

function programTemplateFiles(template, name) {
  if (template === "native-rust") return nativeRustTemplateFiles(name);
  if (template === "anchor") return anchorTemplateFiles(name);
  if (template === "oracle-client") return oracleClientTemplateFiles(name);
  if (template === "auction-cpi") return auctionCpiTemplateFiles(name);
  throw new Error(`Unsupported program template "${template}". Use native-rust, anchor, oracle-client, or auction-cpi.`);
}

function nativeRustTemplateFiles(name) {
  return [
    {
      path: "Cargo.toml",
      content: `[package]
name = "${name}"
version = "0.1.0"
edition = "2021"

[lib]
path = "src/lib.rs"

[features]
default = []
solana = []
`
    },
    {
      path: "src/lib.rs",
      content: `//! Ambient program workbench scaffold.
//!
//! This default template is dependency-free so Ambient Desktop can build and test it
//! offline before the user opts into Solana/Anchor dependencies or deployment.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CounterState {
    pub value: u64,
}

impl CounterState {
    pub const fn new(value: u64) -> Self {
        Self { value }
    }

    pub fn apply_increment(self, amount: u64) -> Result<Self, &'static str> {
        let value = self.value.checked_add(amount).ok_or("counter overflow")?;
        Ok(Self { value })
    }
}

pub fn ambient_entrypoint_preview(input: &[u8]) -> Result<CounterState, &'static str> {
    let amount = input.first().copied().unwrap_or(1) as u64;
    CounterState::new(0).apply_increment(amount)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn increments_counter() {
        assert_eq!(
            CounterState::new(2).apply_increment(3).unwrap(),
            CounterState::new(5),
        );
    }

    #[test]
    fn entrypoint_preview_defaults_to_one() {
        assert_eq!(ambient_entrypoint_preview(&[]).unwrap(), CounterState::new(1));
    }
}
`
    },
    {
      path: "README.md",
      content: `# ${name}

Ambient Blockchain program workbench scaffold.

Local validation:

\`\`\`sh
cargo build
cargo test
\`\`\`

This template is intentionally dependency-free. Add Solana or Anchor crates only
after the local scaffold is understood and the target deployment path is planned.
Use \`ambient_program_deploy_plan\` before any signer-backed deployment.
`
    }
  ];
}

function anchorTemplateFiles(name) {
  return [
    {
      path: "Anchor.toml",
      content: `[features]
seeds = false
skip-lint = false

[programs.localnet]
${name} = "11111111111111111111111111111111"

[provider]
cluster = "Localnet"
wallet = "~/.config/solana/id.json"
`
    },
    {
      path: "programs/ambient-anchor/Cargo.toml",
      content: `[package]
name = "${name}"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]
name = "${name}"

[dependencies]
anchor-lang = "0.30"
`
    },
    {
      path: "programs/ambient-anchor/src/lib.rs",
      content: `use anchor_lang::prelude::*;

declare_id!("11111111111111111111111111111111");

#[program]
pub mod ${name} {
    use super::*;

    pub fn initialize(_ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
`
    },
    {
      path: "README.md",
      content: `# ${name}

Anchor scaffold for Ambient-compatible Solana programs.

Run \`ambient_program_doctor --json\` before building. Anchor builds may require
network dependency resolution and local Solana/Anchor toolchains.
`
    }
  ];
}

function oracleClientTemplateFiles(name) {
  return [
    ...nativeRustTemplateFiles(name),
    {
      path: "src/oracle_client.rs",
      content: `//! Tool Oracle client planning helpers.

pub const TOOL_ORACLE_PROGRAM_ID: &str = "721QWDeUzVL77UCzCFHsVGCMBVup8GsAMPaD2YvWvw97";
pub const AUCTION_PROGRAM_ID: &str = "Auction111111111111111111111111111111111111";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OracleRequestPlan {
    pub prompt_sha256: String,
    pub escrow_lamports: u64,
    pub max_responses: u16,
}
`
    }
  ];
}

function auctionCpiTemplateFiles(name) {
  return [
    ...nativeRustTemplateFiles(name),
    {
      path: "src/auction_cpi.rs",
      content: `//! Auction CPI scaffold placeholders.

pub const AUCTION_PROGRAM_ID: &str = "Auction111111111111111111111111111111111111";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuctionAccountPlan {
    pub auction_program_id: &'static str,
    pub request_account: String,
}
`
    }
  ];
}

function safeRustIdentifier(value) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9_ -]+/g, "")
    .replace(/[-\s]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const candidate = normalized || "ambient_program";
  return /^[a-z_]/.test(candidate) ? candidate : `ambient_${candidate}`;
}

function buildProgramDoctor(_options) {
  const checks = [
    versionCheck("rustc", ["--version"]),
    versionCheck("cargo", ["--version"]),
    versionCheck("solana", ["--version"]),
    versionCheck("anchor", ["--version"])
  ];
  return {
    schemaVersion: "ambient-program-doctor-v1",
    packageName,
    generatedAt: nowIso(),
    status: checks.every((check) => check.status === "present") ? "ready" : "needs_setup",
    mutation: "none",
    checks,
    setupPolicy: "This command does not install Rust, Solana CLI, Anchor, or dependencies. Present missing tools and ask for approval before setup."
  };
}

async function buildLocalValidatorGate(options) {
  const generatedAt = nowIso();
  const fake = process.env.AMBIENT_BLOCKCHAIN_FAKE_VALIDATOR === "1" || options.fake === true;
  const startValidator = Boolean(options.startValidator || options.start);
  const executable = String(options.validator ?? "solana-test-validator");
  const durationMs = cappedInteger(options.validatorDurationMs, 2_000, 250, 30_000, "validator-duration-ms");
  const rpcPort = cappedInteger(options.validatorRpcPort, 8899, 1024, 65535, "validator-rpc-port");
  const ledgerDir = options.ledgerDir
    ? requireWorkspacePath(String(options.ledgerDir), "validator ledger directory")
    : resolve(workspaceRoot(), ".ambient", "blockchain", "validator", "ledger");
  const version = fake
    ? { command: executable, status: "present", stdout: "fake solana-test-validator 0.0.0" }
    : versionCheck(executable, ["--version"]);
  const checks = [
    {
      id: "validator_binary_present",
      passed: fake || version.status === "present",
      detail: fake ? "Fake local validator enabled for deterministic testing." : version.status === "present" ? version.stdout : version.error ?? "validator missing"
    },
    {
      id: "start_explicitly_requested",
      passed: startValidator || !options.requireStart,
      detail: startValidator ? "Validator lifecycle start was explicitly requested." : "Readiness check only; pass --start-validator to run lifecycle."
    }
  ];
  if (!startValidator) {
    return {
      schemaVersion: "ambient-local-validator-gate-v1",
      packageName,
      generatedAt,
      status: checks[0].passed ? "checked" : "needs_setup",
      mutation: "none",
      fake,
      summary: checks[0].passed ? "Local validator binary is available; lifecycle start was not requested." : "Local validator binary is missing.",
      command: [executable, "--version"],
      checks,
      version,
      ledgerRelativePath: toWorkspaceRelative(ledgerDir),
      startRequested: false,
      setupPolicy: "This command does not install Solana CLI. Ask for approval before installing or starting a long-running validator."
    };
  }

  const command = [
    executable,
    "--reset",
    "--ledger",
    ledgerDir,
    "--rpc-port",
    String(rpcPort)
  ];
  const sanitizedCommand = command.map((entry) => entry === ledgerDir ? "<VALIDATOR_LEDGER_DIR>" : entry);
  if (!checks[0].passed) {
    return {
      schemaVersion: "ambient-local-validator-gate-v1",
      packageName,
      generatedAt,
      status: "needs_setup",
      mutation: "none",
      fake,
      summary: "Local validator lifecycle was requested but solana-test-validator is unavailable.",
      command: sanitizedCommand,
      checks,
      version,
      ledgerRelativePath: toWorkspaceRelative(ledgerDir),
      startRequested: true,
      durationMs: 0,
      stdout: "",
      stderr: version.error ?? "",
      setupPolicy: "This command does not install Solana CLI. Ask for approval before installing or starting a validator."
    };
  }

  mkdirSync(ledgerDir, { recursive: true });
  const result = fake
    ? {
        status: 0,
        signal: null,
        durationMs,
        stdout: `fake solana-test-validator started\nrpc=http://127.0.0.1:${rpcPort}\nfake solana-test-validator stopped\n`,
        stderr: "",
        error: undefined
      }
    : await runValidatorForDuration(executable, command.slice(1), durationMs);
  const stdout = redactSensitiveText(result.stdout ?? "", [{ value: ledgerDir, replacement: "<VALIDATOR_LEDGER_DIR>" }]);
  const stderr = redactSensitiveText(result.stderr ?? "", [{ value: ledgerDir, replacement: "<VALIDATOR_LEDGER_DIR>" }]);
  const passed = result.status === 0 || result.signal === "SIGTERM";
  return {
    schemaVersion: "ambient-local-validator-gate-v1",
    packageName,
    generatedAt,
    status: passed ? "passed" : "failed",
    mutation: "local-validator-process",
    fake,
    summary: passed ? "Local validator lifecycle started and stopped with preserved logs." : "Local validator lifecycle failed.",
    command: sanitizedCommand,
    checks,
    version,
    ledgerRelativePath: toWorkspaceRelative(ledgerDir),
    rpcUrl: `http://127.0.0.1:${rpcPort}`,
    startRequested: true,
    exitCode: result.status,
    signal: result.signal,
    durationMs: result.durationMs,
    stdout,
    stderr,
    error: result.error ? errorMessage(result.error) : undefined,
    redactionFacts: {
      ledgerPathIncluded: false,
      secretValuesIncluded: false
    }
  };
}

function versionCheck(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 5_000 });
  if (result.error) {
    return {
      command,
      status: "missing",
      error: result.error.code === "ENOENT" ? "not found on PATH" : errorMessage(result.error)
    };
  }
  return {
    command,
    status: result.status === 0 ? "present" : "error",
    exitCode: result.status,
    stdout: truncateText((result.stdout ?? "").trim(), 500),
    stderr: truncateText((result.stderr ?? "").trim(), 500)
  };
}

function runValidatorForDuration(command, args, durationMs) {
  const startedAt = Date.now();
  return new Promise((resolveRun) => {
    let stdout = "";
    let stderr = "";
    const child = spawn(command, args, {
      cwd: workspaceRoot(),
      stdio: ["ignore", "pipe", "pipe"]
    });
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolveRun({
        ...result,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr
      });
    };
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      finish({ status: undefined, signal: undefined, error });
    });
    child.on("close", (status, signal) => {
      finish({ status, signal, error: undefined });
    });
    setTimeout(() => {
      if (!settled) child.kill("SIGTERM");
    }, durationMs);
  });
}

async function safeRpcProbe(method, params, options) {
  try {
    const response = await callRpc({
      rpcUrl: resolveRpcUrl(options),
      method,
      params,
      timeoutMs: numberOption(options.timeoutMs, 15_000)
    });
    return {
      method,
      status: response.body?.error ? "rpc_error" : "passed",
      durationMs: response.durationMs,
      httpStatus: response.httpStatus,
      preview: boundedPreview(response.body?.result ?? response.body, 1_500)
    };
  } catch (error) {
    return {
      method,
      status: "failed",
      error: errorMessage(error)
    };
  }
}

async function safeHttpProbe(endpoint, method, timeoutMs) {
  if (typeof fetch !== "function") {
    return { status: "failed", error: "Node fetch is unavailable in this runtime." };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(endpoint, {
      method,
      redirect: "manual",
      signal: controller.signal
    });
    return {
      status: response.ok ? "passed" : "http_error",
      durationMs: Date.now() - started,
      httpStatus: response.status,
      headers: selectedHeaders(response.headers)
    };
  } catch (error) {
    return {
      status: "failed",
      durationMs: Date.now() - started,
      error: errorMessage(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function callX402PaidRequest({ endpoint, method, headers, body, timeoutMs, fake }) {
  if (fake) {
    return {
      durationMs: 0,
      httpStatus: 200,
      headers: {
        "content-type": "application/json",
        "x-payment-receipt": "fake-x402-receipt"
      },
      bodyText: JSON.stringify({ status: "ok", response: "fake x402 paid request passed" }),
      error: undefined
    };
  }
  if (typeof fetch !== "function") throw new Error("Node fetch is unavailable in this runtime.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(endpoint, {
      method,
      headers,
      body: body === undefined ? undefined : body,
      redirect: "manual",
      signal: controller.signal
    });
    return {
      durationMs: Date.now() - started,
      httpStatus: response.status,
      headers: selectedHeaders(response.headers),
      bodyText: await response.text(),
      error: undefined
    };
  } catch (error) {
    return {
      durationMs: Date.now() - started,
      httpStatus: undefined,
      headers: {},
      bodyText: "",
      error: errorMessage(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function callRpc({ rpcUrl, method, params, timeoutMs }) {
  ensureRpcMethodAllowed(method);
  if (typeof fetch !== "function") throw new Error("Node fetch is unavailable in this runtime.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller.signal
    });
    const text = await response.text();
    let body;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { nonJsonBody: truncateText(text, 4_000) };
    }
    return {
      durationMs: Date.now() - started,
      httpStatus: response.status,
      body
    };
  } finally {
    clearTimeout(timeout);
  }
}

function ensureRpcMethodAllowed(method) {
  if (blockedRpcMethods.has(method) || !readOnlyRpcMethods.has(method)) {
    throw new Error(`RPC method "${method}" is not in the ambient-blockchain read-only allowlist.`);
  }
}

function promptFromOptions(options) {
  if (typeof options.prompt === "string") return options.prompt;
  if (typeof options.promptFile === "string") {
    const promptFile = requireWorkspacePath(options.promptFile, "prompt file");
    return readFileSync(promptFile, "utf8");
  }
  throw new Error("Oracle request planning requires --prompt <text> or --prompt-file <workspace path>.");
}

function requestBodyFromOptions(options) {
  if (typeof options.body === "string") return options.body;
  if (typeof options.bodyFile === "string") {
    const bodyFile = requireWorkspacePath(options.bodyFile, "request body file");
    return readFileSync(bodyFile, "utf8");
  }
  return undefined;
}

function parseCommandTemplateOption(value, label) {
  const parsed = parseJsonArrayOption(value, label, undefined);
  if (!parsed || parsed.length === 0) throw new Error(`--${label} must be a non-empty JSON array.`);
  return parsed.map((entry) => String(entry));
}

function expandCommandTemplate(template, replacements) {
  return {
    real: template.map((entry) => replaceCommandPlaceholders(entry, replacements, false)),
    sanitized: template.map((entry) => replaceCommandPlaceholders(entry, replacements, true))
  };
}

function replaceCommandPlaceholders(value, replacements, sanitized) {
  let text = String(value);
  for (const [name, replacement] of Object.entries(replacements)) {
    const token = `<${name}>`;
    const real = replacement?.real ?? "";
    const safe = replacement?.sanitized ?? token;
    text = text.split(token).join(sanitized ? safe : real);
  }
  return text;
}

function oracleCommandReplacements({ plan = {}, approval = {}, keypairPath, promptFile, requestAccount }) {
  return {
    KEYPAIR_FILE: { real: keypairPath ?? "", sanitized: "<AMBIENT_BLOCKCHAIN_KEYPAIR_FILE>" },
    RPC_URL: { real: approval.rpcUrl ?? plan.network?.rpcUrl ?? defaultRpcUrl, sanitized: approval.rpcUrl ?? plan.network?.rpcUrl ?? defaultRpcUrl },
    WS_URL: { real: plan.network?.websocketUrl ?? defaultWsUrl, sanitized: plan.network?.websocketUrl ?? defaultWsUrl },
    PROMPT_FILE: { real: promptFile?.path ?? "", sanitized: "<ORACLE_PROMPT_FILE>" },
    ESCROW_LAMPORTS: { real: String(approval.escrowLamports ?? plan.escrowLamports ?? 0), sanitized: String(approval.escrowLamports ?? plan.escrowLamports ?? 0) },
    MAX_LAMPORTS: { real: String(approval.maxLamports ?? plan.maxLamports ?? 0), sanitized: String(approval.maxLamports ?? plan.maxLamports ?? 0) },
    MAX_RESPONSES: { real: String(approval.maxResponses ?? plan.maxResponses ?? 1), sanitized: String(approval.maxResponses ?? plan.maxResponses ?? 1) },
    FILTER: { real: approval.responseFilter ?? plan.responseFilter ?? "", sanitized: approval.responseFilter ?? plan.responseFilter ?? "" },
    REQUEST_ACCOUNT: { real: requestAccount ?? approval.requestAccount ?? plan.requestAccount ?? "", sanitized: requestAccount ?? approval.requestAccount ?? plan.requestAccount ?? "" }
  };
}

function materializeOraclePromptFile(plan, options) {
  const prompt = String(plan.prompt ?? "");
  const promptHash = plan.promptSha256 ?? sha256(prompt);
  const oracleDir = options.artifactDir
    ? requireWorkspacePath(String(options.artifactDir), "artifact directory")
    : resolve(workspaceRoot(), ".ambient", "blockchain", "oracle");
  mkdirSync(oracleDir, { recursive: true });
  const promptPath = join(oracleDir, `prompt-${promptHash.slice(0, 16)}.txt`);
  writeFileSync(promptPath, prompt, "utf8");
  const bytes = Buffer.byteLength(prompt, "utf8");
  return {
    path: promptPath,
    relativePath: toWorkspaceRelative(promptPath),
    bytes,
    sha256: sha256(prompt)
  };
}

function readWorkspaceJson(value, label) {
  const artifactPath = requireWorkspacePath(stringOption(value, label), label);
  if (!existsSync(artifactPath)) throw new Error(`${label} does not exist: ${toWorkspaceRelative(artifactPath)}`);
  return JSON.parse(readFileSync(artifactPath, "utf8"));
}

function readOracleDecodeSource(options) {
  if (options.waitArtifact) {
    const waitArtifactPath = requireWorkspacePath(String(options.waitArtifact), "wait artifact");
    const waitArtifact = JSON.parse(readFileSync(waitArtifactPath, "utf8"));
    const latest = Array.isArray(waitArtifact.observations) ? waitArtifact.observations.at(-1) : undefined;
    return {
      source: {
        kind: "wait-artifact",
        relativePath: toWorkspaceRelative(waitArtifactPath),
        sha256: sha256(readFileSync(waitArtifactPath))
      },
      requestAccount: waitArtifact.requestAccount,
      accountInfo: latest?.rawResponse?.result?.value
    };
  }
  if (options.accountArtifact) {
    const artifactPath = requireWorkspacePath(String(options.accountArtifact), "account artifact");
    const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
    const accountInfo = artifact.rawResponse?.result?.value ?? artifact.accountInfo ?? artifact;
    return {
      source: {
        kind: "account-artifact",
        relativePath: toWorkspaceRelative(artifactPath),
        sha256: sha256(readFileSync(artifactPath))
      },
      requestAccount: artifact.address ?? artifact.requestAccount,
      accountInfo
    };
  }
  if (options.dataBase64) {
    return {
      source: { kind: "data-base64" },
      requestAccount: options.requestAccount ? String(options.requestAccount) : undefined,
      accountInfo: {
        data: [String(options.dataBase64), "base64"]
      }
    };
  }
  throw new Error("Oracle decode requires --wait-artifact, --account-artifact, or --data-base64.");
}

function decodeOracleAccountInfo(accountInfo) {
  if (!accountInfo) return { exists: false, terminal: false };
  const data = Array.isArray(accountInfo.data) ? accountInfo.data[0] : undefined;
  const encoding = Array.isArray(accountInfo.data) ? accountInfo.data[1] : undefined;
  const decoded = {
    exists: true,
    owner: accountInfo.owner,
    lamports: accountInfo.lamports,
    executable: accountInfo.executable,
    rentEpoch: accountInfo.rentEpoch,
    dataEncoding: encoding,
    dataBytes: typeof data === "string" ? Buffer.byteLength(data, encoding === "base64" ? "base64" : "utf8") : undefined,
    terminal: false
  };
  if (typeof data !== "string") return decoded;
  if (encoding === "base64") {
    const bytes = Buffer.from(data, "base64");
    decoded.dataSha256 = sha256(bytes);
    const utf8 = bytes.toString("utf8").replace(/\0+$/g, "");
    if (isMostlyPrintable(utf8)) {
      decoded.utf8Preview = truncateText(utf8, 1_000);
      try {
        const parsed = JSON.parse(utf8);
        decoded.parsedJson = parsed;
        decoded.state = String(parsed.state ?? parsed.status ?? "");
        decoded.output = parsed.output ?? parsed.result;
        decoded.reason = parsed.reason ?? parsed.error;
      } catch {
        decoded.state = detectOracleStateFromText(utf8);
      }
    }
  } else {
    decoded.utf8Preview = truncateText(data, 1_000);
    decoded.state = detectOracleStateFromText(data);
  }
  decoded.terminal = isTerminalOracleState(decoded.state);
  return decoded;
}

function detectOracleStateFromText(text) {
  const normalized = String(text ?? "").toLowerCase();
  if (normalized.includes("completed")) return "Completed";
  if (normalized.includes("failed")) return "Failed";
  if (normalized.includes("started")) return "Started";
  if (normalized.includes("requested")) return "Requested";
  return undefined;
}

function isMostlyPrintable(text) {
  if (!text) return false;
  const printable = [...text].filter((char) => char === "\n" || char === "\r" || char === "\t" || (char >= " " && char <= "~")).length;
  return printable / text.length > 0.8;
}

function isTerminalOracleState(state) {
  return ["completed", "failed"].includes(String(state ?? "").toLowerCase());
}

function isTerminalOracleDecode(decoded) {
  return Boolean(decoded?.terminal);
}

function readX402PaymentHeaderBinding(options, headerName) {
  const envName = "AMBIENT_X402_PAYMENT_HEADER_FILE";
  const configuredSource = options.paymentHeaderFile ?? process.env[envName];
  const base = {
    configured: typeof configuredSource === "string" && configuredSource.length > 0,
    valid: false,
    envName,
    sourceKind: "file",
    warnings: []
  };
  if (!base.configured) return base;
  try {
    const sourcePath = requireWorkspacePath(String(configuredSource), "x402 payment header file");
    const stats = statSync(sourcePath);
    if (!stats.isFile()) {
      base.warnings.push("Configured x402 payment header path is not a file.");
      return base;
    }
    const value = readFileSync(sourcePath, "utf8").trim();
    base.sourcePath = sourcePath;
    base.sourcePathSha256 = sha256(sourcePath);
    base.file = {
      exists: true,
      isFile: true,
      bytes: stats.size,
      modeOctal: (stats.mode & 0o777).toString(8)
    };
    base.headerName = headerName;
    base.headerSha256 = value ? sha256(value) : undefined;
    base.valid = value.length > 0;
    base.value = value;
    if (!base.valid) base.warnings.push("Configured x402 payment header file is empty.");
    if ((stats.mode & 0o077) !== 0) {
      base.warnings.push("x402 payment header file is readable by group or others; consider chmod 600.");
    }
    return base;
  } catch (error) {
    base.errorCode = typeof error?.code === "string" ? error.code : "payment_header_read_failed";
    base.warnings.push("Configured x402 payment header could not be read.");
    return base;
  }
}

function parseHttpHeaderMapOption(value, paymentHeaderName) {
  if (value === undefined || value === true) return {};
  let parsed;
  try {
    parsed = JSON.parse(String(value));
  } catch (error) {
    throw new Error(`--headers-json must be valid JSON: ${errorMessage(error)}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("--headers-json must be a JSON object.");
  const headers = {};
  const blocked = new Set(["authorization", "cookie", "set-cookie", "proxy-authorization", paymentHeaderName.toLowerCase()]);
  for (const [name, rawValue] of Object.entries(parsed)) {
    const normalizedName = String(name).toLowerCase();
    if (blocked.has(normalizedName)) {
      throw new Error(`--headers-json must not include secret-bearing header "${name}". Use --payment-header-file for x402 payment material.`);
    }
    headers[String(name)] = String(rawValue);
  }
  return headers;
}

function parseJsonArrayOption(value, label, fallback) {
  if (value === undefined || value === true) return fallback;
  let parsed;
  try {
    parsed = JSON.parse(String(value));
  } catch (error) {
    throw new Error(`--${label} must be valid JSON: ${errorMessage(error)}`);
  }
  if (!Array.isArray(parsed)) throw new Error(`--${label} must be a JSON array.`);
  return parsed;
}

function stringOption(value, label) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`Missing required ${label}.`);
  return value;
}

function numberOption(value, fallback) {
  if (value === undefined || value === true || value === "") return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) throw new Error(`Expected a non-negative number, got ${JSON.stringify(value)}.`);
  return numeric;
}

function cappedInteger(value, fallback, min, max, label) {
  const numeric = numberOption(value, fallback);
  if (!Number.isInteger(numeric)) throw new Error(`--${label} must be an integer.`);
  if (numeric < min || numeric > max) throw new Error(`--${label} must be between ${min} and ${max}.`);
  return numeric;
}

function resolveRpcUrl(options) {
  return String(options.rpcUrl ?? process.env.AMBIENT_BLOCKCHAIN_RPC_URL ?? readContracts().network.defaultRpcUrl ?? defaultRpcUrl);
}

function resolveWsUrl(options) {
  return String(options.wsUrl ?? process.env.AMBIENT_BLOCKCHAIN_WS_URL ?? readContracts().network.defaultWsUrl ?? defaultWsUrl);
}

function readContracts() {
  return JSON.parse(readFileSync(contractsPath, "utf8"));
}

function contractSummary(contracts) {
  return {
    network: contracts.network,
    programs: {
      toolOracle: {
        programId: contracts.programs.toolOracle.programId,
        pinnedSha: contracts.programs.toolOracle.pinnedSha
      },
      auction: {
        programId: contracts.programs.auction.programId,
        pinnedSha: contracts.programs.auction.pinnedSha,
        interfacePinnedSha: contracts.programs.auction.interfacePinnedSha
      },
      oracleCryptoTickerExample: {
        repo: contracts.programs.oracleCryptoTickerExample.repo,
        pinnedSha: contracts.programs.oracleCryptoTickerExample.pinnedSha
      }
    },
    x402: {
      defaultEndpoint: contracts.x402.defaultEndpoint
    }
  };
}

function envStatus() {
  return [
    envEntry("AMBIENT_BLOCKCHAIN_RPC_URL", "network-url"),
    envEntry("AMBIENT_BLOCKCHAIN_WS_URL", "network-url"),
    envEntry("AMBIENT_BLOCKCHAIN_KEYPAIR_FILE", "signer-keypair"),
    envEntry("AMBIENT_X402_KEYPAIR_FILE", "signer-keypair"),
    envEntry("AMBIENT_BLOCKCHAIN_MAX_LAMPORTS", "spend-cap"),
    envEntry("AMBIENT_X402_MAX_MICRO_USDC", "spend-cap"),
    envEntry("AMBIENT_X402_PAYMENT_HEADER_FILE", "payment-secret-file")
  ];
}

function envEntry(name, kind) {
  return {
    name,
    kind,
    configured: configured(name)
  };
}

function configured(name) {
  return typeof process.env[name] === "string" && process.env[name].length > 0;
}

function inspectKeypairBinding(kind) {
  const normalizedKind = kind === "x402" ? "x402" : "chain";
  const envName = normalizedKind === "x402" ? "AMBIENT_X402_KEYPAIR_FILE" : "AMBIENT_BLOCKCHAIN_KEYPAIR_FILE";
  const filePath = process.env[envName];
  const base = {
    kind: normalizedKind,
    envName,
    configured: typeof filePath === "string" && filePath.length > 0,
    valid: false,
    warnings: []
  };
  if (!base.configured) return base;

  base.pathSha256 = sha256(filePath);
  try {
    const stats = statSync(filePath);
    base.file = {
      exists: true,
      isFile: stats.isFile(),
      bytes: stats.size,
      modeOctal: (stats.mode & 0o777).toString(8)
    };
    if (!stats.isFile()) {
      base.warnings.push("Configured keypair path is not a file.");
      return base;
    }
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    const bytes = parseByteArray(parsed);
    base.keypair = {
      format: "solana-json-array",
      byteLength: bytes.length,
      publicKeyDerivable: bytes.length >= 64
    };
    if (bytes.length < 64) {
      base.warnings.push("Solana JSON keypair should contain at least 64 bytes.");
      return base;
    }
    base.publicKey = base58Encode(bytes.slice(bytes.length - 32));
    base.valid = true;
    if ((stats.mode & 0o077) !== 0) {
      base.warnings.push("Keypair file is readable by group or others; consider chmod 600.");
    }
    return base;
  } catch (error) {
    base.file = { exists: existsSync(filePath) };
    base.errorCode = typeof error?.code === "string" ? error.code : "keypair_read_failed";
    base.warnings.push("Configured keypair could not be read or parsed.");
    return base;
  }
}

function parseByteArray(value) {
  if (!Array.isArray(value)) throw new Error("Keypair JSON must be an array.");
  return value.map((entry) => {
    const numeric = Number(entry);
    if (!Number.isInteger(numeric) || numeric < 0 || numeric > 255) throw new Error("Keypair JSON entries must be bytes.");
    return numeric;
  });
}

function base58Encode(bytes) {
  if (!bytes.length) return "";
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let index = 0; index < digits.length; index += 1) {
      const value = (digits[index] * 256) + carry;
      digits[index] = value % 58;
      carry = Math.floor(value / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1;
  if (zeros === bytes.length) return "1".repeat(zeros);
  return `${"1".repeat(zeros)}${digits.reverse().map((digit) => base58Alphabet[digit]).join("")}`;
}

function signerApprovalSummary(kind) {
  const status = inspectKeypairBinding(kind);
  return {
    kind: status.kind,
    envName: status.envName,
    configured: status.configured,
    valid: status.valid,
    publicKey: status.publicKey,
    pathSha256: status.pathSha256,
    warnings: status.warnings
  };
}

function redactKeypairPathText(value, keypairPath, envName) {
  return redactSensitiveText(value, [{ value: keypairPath, replacement: `<${envName}>` }]);
}

function redactSensitiveText(value, redactions) {
  let text = String(value ?? "");
  for (const redaction of redactions) {
    if (typeof redaction?.value === "string" && redaction.value.length > 0) {
      text = text.split(redaction.value).join(redaction.replacement);
    }
  }
  return text;
}

function hasHeader(headers, name) {
  const normalizedName = name.toLowerCase();
  return Object.keys(headers).some((headerName) => headerName.toLowerCase() === normalizedName);
}

function sanitizeHttpHeadersForArtifact(headers, extraSecretNames = []) {
  const sanitized = {};
  const secretNames = new Set(["authorization", "cookie", "set-cookie", "proxy-authorization", "x-payment"]);
  for (const name of extraSecretNames) secretNames.add(String(name).toLowerCase());
  for (const [name, value] of Object.entries(headers)) {
    const normalizedName = name.toLowerCase();
    sanitized[name] = secretNames.has(normalizedName)
      ? `<redacted:${normalizedName}>`
      : String(value);
  }
  return sanitized;
}

function extractDeploySignature(stdout) {
  const match = String(stdout ?? "").match(/signature\s*[:=]\s*(\S+)/i);
  return match?.[1];
}

function extractNamedValue(text, names) {
  const source = String(text ?? "");
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = source.match(new RegExp(`${escaped}\\s*[:=]\\s*(\\S+)`, "i"));
    if (match?.[1]) return match[1];
  }
  return undefined;
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function commandSummary() {
  return {
    readOnly: [
      "ambient_chain_doctor",
      "ambient_chain_rpc",
      "ambient_chain_account",
      "ambient_chain_transaction",
      "ambient_chain_program_observe",
      "ambient_keypair_status",
      "ambient_approval_verify",
      "ambient_auction_inspect"
    ],
    planners: [
      "ambient_oracle_request_plan",
      "ambient_oracle_reclaim_plan",
      "ambient_x402_quote",
      "ambient_program_deploy_plan",
      "ambient_program_upgrade_plan",
      "ambient_program_authority_plan"
    ],
    guards: ["ambient_keypair_status", "ambient_approval_verify"],
    funded: [
      "ambient_oracle_request_submit",
      "ambient_oracle_reclaim_execute",
      "ambient_x402_request_execute",
      "ambient_program_deploy_execute",
      "ambient_program_upgrade_execute",
      "ambient_program_authority_execute"
    ],
    observation: ["ambient_oracle_request_wait", "ambient_oracle_response_decode"],
    workbench: [
      "ambient_program_scaffold",
      "ambient_program_build",
      "ambient_program_test",
      "ambient_program_deploy_execute",
      "ambient_program_upgrade_execute",
      "ambient_program_authority_execute"
    ],
    gates: ["ambient_program_doctor", "ambient_local_validator_gate", "ambient_desktop_pi_dogfood", "ambient_blockchain_live_gate"]
  };
}

function summarizeTransaction(value) {
  if (!value) return { exists: false };
  const logs = Array.isArray(value.meta?.logMessages) ? value.meta.logMessages : [];
  const signatures = Array.isArray(value.transaction?.signatures) ? value.transaction.signatures : [];
  const instructions = value.transaction?.message?.instructions;
  const accountKeys = value.transaction?.message?.accountKeys;
  return {
    exists: true,
    slot: value.slot,
    blockTime: value.blockTime,
    err: value.meta?.err ?? null,
    fee: value.meta?.fee,
    signatureCount: signatures.length,
    instructionCount: Array.isArray(instructions) ? instructions.length : undefined,
    accountKeyCount: Array.isArray(accountKeys) ? accountKeys.length : undefined,
    logCount: logs.length,
    logsPreview: logs.slice(0, 20).map((line) => truncateText(String(line), 300)),
    logsTruncated: logs.length > 20
  };
}

function summarizeSignatureInfo(value) {
  return {
    signature: value?.signature,
    slot: value?.slot,
    blockTime: value?.blockTime,
    err: value?.err ?? null,
    memo: value?.memo ?? null
  };
}

function summarizeProgramAccount(value) {
  return {
    pubkey: value?.pubkey,
    account: summarizeAccountInfo(value?.account)
  };
}

function summarizeAccountInfo(value) {
  if (!value) return { exists: false };
  return {
    exists: true,
    lamports: value.lamports,
    owner: value.owner,
    executable: value.executable,
    rentEpoch: value.rentEpoch,
    space: value.space,
    dataEncoding: Array.isArray(value.data) ? value.data[1] : undefined,
    dataBytes: Array.isArray(value.data) && typeof value.data[0] === "string"
      ? Buffer.byteLength(value.data[0], "base64")
      : undefined
  };
}

function writeArtifact(kind, payload, options = {}) {
  const workspace = workspaceRoot();
  const artifactRoot = options.artifactDir
    ? requireWorkspacePath(String(options.artifactDir), "artifact directory")
    : resolve(workspace, ".ambient", "blockchain", kind);
  mkdirSync(artifactRoot, { recursive: true });
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  const artifactPath = join(artifactRoot, `${compactTimestamp(payload.generatedAt ?? nowIso())}-${sha256(body).slice(0, 10)}.json`);
  writeFileSync(artifactPath, body, "utf8");
  return {
    path: artifactPath,
    relativePath: toWorkspaceRelative(artifactPath),
    bytes: Buffer.byteLength(body, "utf8"),
    sha256: sha256(body)
  };
}

function writeMarkdownArtifact(kind, payload, markdown, options = {}) {
  const workspace = workspaceRoot();
  const artifactRoot = options.artifactDir
    ? requireWorkspacePath(String(options.artifactDir), "artifact directory")
    : resolve(workspace, ".ambient", "blockchain", kind);
  mkdirSync(artifactRoot, { recursive: true });
  const body = `${markdown.trimEnd()}\n`;
  const artifactPath = join(artifactRoot, `${compactTimestamp(payload.generatedAt ?? nowIso())}-${sha256(body).slice(0, 10)}.md`);
  writeFileSync(artifactPath, body, "utf8");
  return {
    path: artifactPath,
    relativePath: toWorkspaceRelative(artifactPath),
    bytes: Buffer.byteLength(body, "utf8"),
    sha256: sha256(body)
  };
}

function buildLiveGateEvidenceIndex(lanes) {
  const laneEvidence = lanes.map((lane) => {
    const artifacts = collectArtifactReferences(lane);
    const signatures = collectNamedStringValues(lane, new Set(["signature"]));
    const receipts = collectNamedStringValues(lane, new Set(["x-payment-receipt", "xPaymentReceipt", "receipt"]));
    const costs = laneCostSummary(lane);
    return {
      id: lane.id,
      status: lane.status,
      artifactCount: artifacts.length,
      artifacts,
      signatures,
      receipts,
      costs
    };
  });
  return {
    schemaVersion: "ambient-blockchain-live-gate-evidence-index-v1",
    lanes: laneEvidence,
    totals: {
      lanes: laneEvidence.length,
      artifacts: laneEvidence.reduce((sum, lane) => sum + lane.artifactCount, 0),
      signatures: laneEvidence.reduce((sum, lane) => sum + lane.signatures.length, 0),
      receipts: laneEvidence.reduce((sum, lane) => sum + lane.receipts.length, 0)
    }
  };
}

function collectArtifactReferences(value) {
  const artifacts = [];
  const seen = new Set();
  walkJson(value, (entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;
    if (typeof entry.relativePath !== "string" || typeof entry.sha256 !== "string") return;
    const key = `${entry.relativePath}:${entry.sha256}`;
    if (seen.has(key)) return;
    seen.add(key);
    artifacts.push({
      relativePath: entry.relativePath,
      bytes: typeof entry.bytes === "number" ? entry.bytes : undefined,
      sha256: entry.sha256
    });
  });
  return artifacts;
}

function collectNamedStringValues(value, names) {
  const values = [];
  const seen = new Set();
  walkJson(value, (entry, key) => {
    if (!names.has(String(key))) return;
    if (typeof entry !== "string" || entry.length === 0) return;
    if (seen.has(entry)) return;
    seen.add(entry);
    values.push(entry);
  });
  return values;
}

function walkJson(value, visit, key = "") {
  visit(value, key);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) walkJson(value[index], visit, String(index));
    return;
  }
  if (value && typeof value === "object") {
    for (const [entryKey, entryValue] of Object.entries(value)) walkJson(entryValue, visit, entryKey);
  }
}

function laneCostSummary(lane) {
  if (lane.id === "oracle-funded") {
    return compactObject({
      escrowLamports: lane.escrowLamports,
      maxLamports: lane.maxLamports,
      reclaimMaxLamports: lane.reclaimPlan?.parsed?.maxLamports
    });
  }
  if (lane.id === "x402-funded") {
    return compactObject({
      maxLamports: lane.maxLamports,
      maxMicroUsdc: lane.maxMicroUsdc,
      httpStatus: lane.execution?.result?.httpStatus
    });
  }
  if (lane.id === "program-workbench") {
    return compactObject({
      maxLamports: lane.deployPlan?.parsed?.maxLamports,
      binaryBytes: lane.binary?.bytes
    });
  }
  return {};
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([_key, entry]) => entry !== undefined));
}

function buildLiveGateMarkdown(payload, jsonArtifact) {
  const rows = payload.lanes.map((lane) => (
    `| ${markdownCell(lane.id)} | ${markdownCell(lane.status)} | ${markdownCell(lane.summary)} |`
  ));
  const evidenceRows = payload.evidenceIndex.lanes.map((lane) => (
    `| ${markdownCell(lane.id)} | ${lane.artifactCount} | ${lane.signatures.length} | ${lane.receipts.length} | ${markdownCell(JSON.stringify(lane.costs))} |`
  ));
  const skipReasons = payload.lanes
    .filter((lane) => lane.status === "skipped")
    .map((lane) => `- ${lane.id}: ${lane.summary}`);
  const failures = payload.lanes
    .filter((lane) => isFailingLaneStatus(lane.status))
    .map((lane) => `- ${lane.id}: ${lane.summary}`);
  return [
    "# Ambient Blockchain Live Gate Evidence",
    "",
    `- Generated: ${payload.generatedAt}`,
    `- Status: ${payload.status}`,
    `- Package: ${payload.packageName}`,
    `- JSON artifact: ${jsonArtifact.relativePath}`,
    "",
    "## Lanes",
    "",
    "| Lane | Status | Summary |",
    "| --- | --- | --- |",
    ...rows,
    "",
    "## Evidence Index",
    "",
    "| Lane | Artifacts | Signatures | Receipts | Costs |",
    "| --- | ---: | ---: | ---: | --- |",
    ...evidenceRows,
    "",
    "## Failures",
    "",
    ...(failures.length ? failures : ["- None"]),
    "",
    "## Skip Reasons",
    "",
    ...(skipReasons.length ? skipReasons : ["- None"]),
    "",
    "## Redaction Facts",
    "",
    `- Keypair paths included: ${payload.redactionFacts.keypairPathsIncluded}`,
    `- Private key bytes included: ${payload.redactionFacts.privateKeyBytesIncluded}`,
    `- Secret values included: ${payload.redactionFacts.secretValuesIncluded}`,
    "",
    "## Contract Summary",
    "",
    `- Network: ${payload.contracts.network.name}`,
    `- Runtime: ${payload.contracts.network.runtime}`,
    `- Tool Oracle: ${payload.contracts.programs.toolOracle.programId}`,
    `- x402 endpoint: ${payload.contracts.x402.defaultEndpoint}`
  ].join("\n");
}

function markdownCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function isFailingLaneStatus(status) {
  return ["failed", "blocked", "http_error", "rpc_error"].includes(String(status ?? ""));
}

function workspaceRoot() {
  return resolve(process.env.AMBIENT_WORKSPACE_PATH ?? process.cwd());
}

function requireWorkspacePath(value, label) {
  const absolute = resolve(workspaceRoot(), value);
  if (!isPathInside(workspaceRoot(), absolute)) {
    throw new Error(`${label} must stay inside the workspace.`);
  }
  return absolute;
}

function isPathInside(parent, child) {
  const rel = relative(resolve(parent), resolve(child));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function toWorkspaceRelative(artifactPath) {
  return relative(workspaceRoot(), artifactPath).split(sep).join("/");
}

function boundedPreview(value, maxChars) {
  const text = JSON.stringify(value ?? null, null, 2);
  return {
    truncated: text.length > maxChars,
    chars: text.length,
    text: text.length > maxChars ? text.slice(0, maxChars) : text
  };
}

function boundedTextPreview(value, maxChars) {
  const text = String(value ?? "");
  return {
    truncated: text.length > maxChars,
    chars: text.length,
    text: text.length > maxChars ? text.slice(0, maxChars) : text
  };
}

function selectedHeaders(headers) {
  const selected = {};
  for (const name of [
    "www-authenticate",
    "x-accept-payment",
    "x-payment-required",
    "x-payment-response",
    "x-payment-receipt",
    "x-request-id",
    "content-type"
  ]) {
    const value = headers.get(name);
    if (value) selected[name] = truncateText(value, 1_000);
  }
  return selected;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function approvalDigest(value) {
  return sha256(stableJson(value));
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function compactTimestamp(iso) {
  return iso.replace(/\D/g, "").slice(0, 14);
}

function nowIso() {
  return new Date().toISOString();
}

function truncateText(text, maxChars) {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}...<truncated>`;
}

function writeJson(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function printHelp(_options) {
  return writeJson({
    packageName,
    commands: commandSummary(),
    examples: [
      "ambient_chain_doctor --json",
      "ambient_chain_rpc --method getVersion --params-json '[]' --json",
      "ambient_chain_transaction --signature <signature> --json",
      "ambient_chain_program_observe --program-id <program> --filters-json '[{\"dataSize\":8}]' --json",
      "ambient_program_scaffold --project-dir ambient-program --template native-rust --json",
      "ambient_program_test --project-dir ambient-program --json",
      "ambient_blockchain_live_gate --live-read --json"
    ]
  });
}

function errorMessage(error) {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause instanceof Error ? error.cause.message : undefined;
  return cause ? `${error.message}: ${cause}` : error.message;
}
