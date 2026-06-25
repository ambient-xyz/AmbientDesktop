#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { programTemplateFiles, safeRustIdentifier } from "./programTemplates.mjs";
import { createOracleCommands } from "./oracleCommands.mjs";
import { createProgramLifecycleCommands } from "./programLifecycleCommands.mjs";
import { createDesktopPiDogfoodCommand } from "./desktopPiDogfoodCommand.mjs";
import { createLiveGateCommands } from "./liveGateCommands.mjs";
import {
  approvalDigest,
  boundedPreview,
  boundedTextPreview,
  buildLiveGateEvidenceIndex,
  buildLiveGateMarkdown,
  compactTimestamp,
  errorMessage,
  isFailingLaneStatus,
  isPathInside,
  nowIso,
  requireWorkspacePath,
  selectedHeaders,
  sha256,
  toWorkspaceRelative,
  truncateText,
  workspaceRoot,
  writeArtifact,
  writeJson,
  writeMarkdownArtifact
} from "./runSupport.mjs";

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

const {
  buildOraclePlan,
  commandOracleDecode,
  commandOraclePlan,
  commandOracleReclaimExecute,
  commandOracleReclaimPlan,
  commandOracleSubmit,
  commandOracleWait
} = createOracleCommands({
  approvalDigest,
  boundedTextPreview,
  buildApprovalVerification,
  callRpc,
  cappedInteger,
  defaultRpcUrl,
  defaultWsUrl,
  delay,
  errorMessage,
  extractNamedValue,
  numberOption,
  nowIso,
  packageName,
  parseJsonArrayOption,
  readContracts,
  redactSensitiveText,
  requireWorkspacePath,
  resolveRpcUrl,
  resolveWsUrl,
  sha256,
  signerApprovalSummary,
  stringOption,
  summarizeAccountInfo,
  toWorkspaceRelative,
  truncateText,
  workspaceRoot,
  writeArtifact,
  writeJson
});

const {
  commandProgramDeployExecute,
  commandProgramDeployPlan,
  commandProgramUpgradeExecute,
  commandProgramUpgradePlan,
  commandProgramAuthorityExecute,
  commandProgramAuthorityPlan
} = createProgramLifecycleCommands({
  approvalDigest,
  boundedTextPreview,
  buildApprovalVerification,
  errorMessage,
  nowIso,
  numberOption,
  packageName,
  parseJsonArrayOption,
  redactSensitiveText,
  requireWorkspacePath,
  resolveRpcUrl,
  resolveWsUrl,
  sha256,
  signerApprovalSummary,
  stringOption,
  toWorkspaceRelative,
  workspaceRoot,
  writeArtifact,
  writeJson
});

const {
  buildDesktopPiDogfood,
  commandDesktopPiDogfood
} = createDesktopPiDogfoodCommand({
  boundedTextPreview,
  contractsPath,
  entrypointPath: fileURLToPath(import.meta.url),
  errorMessage,
  nowIso,
  packageName,
  packageRoot,
  packageVersion,
  sha256,
  toWorkspaceRelative,
  writeArtifact,
  writeJson
});

const {
  commandLiveGate,
  commandLocalValidatorGate
} = createLiveGateCommands({
  boundedTextPreview,
  buildDesktopPiDogfood,
  buildLiveGateEvidenceIndex,
  buildLiveGateMarkdown,
  buildLocalValidatorGate,
  buildOraclePlan,
  buildProgramDoctor,
  buildX402Quote,
  cappedInteger,
  commandSummary,
  compactTimestamp,
  contractSummary,
  entrypointPath: fileURLToPath(import.meta.url),
  envStatus,
  errorMessage,
  inspectKeypairBinding,
  isFailingLaneStatus,
  nowIso,
  numberOption,
  packageName,
  packageVersion,
  readContracts,
  redactSensitiveText,
  requireWorkspacePath,
  resolveRpcUrl,
  resolveWsUrl,
  safeRpcProbe,
  sha256,
  toWorkspaceRelative,
  workspaceRoot,
  writeArtifact,
  writeJson,
  writeMarkdownArtifact
});

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

function requestBodyFromOptions(options) {
  if (typeof options.body === "string") return options.body;
  if (typeof options.bodyFile === "string") {
    const bodyFile = requireWorkspacePath(options.bodyFile, "request body file");
    return readFileSync(bodyFile, "utf8");
  }
  return undefined;
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
