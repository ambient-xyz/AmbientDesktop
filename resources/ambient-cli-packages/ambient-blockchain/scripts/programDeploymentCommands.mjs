import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

import { createKeypairPathRedactor, extractDeploySignature } from "./programLifecycleCommandSupport.mjs";

export function createProgramDeploymentCommands(dependencies) {
  const {
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
    writeJson,
  } = dependencies;
  const redactKeypairPathText = createKeypairPathRedactor(redactSensitiveText);

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
      signer,
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
        websocketUrl: resolveWsUrl(options),
      },
      program: {
        binaryPath,
        binaryRelativePath: toWorkspaceRelative(binaryPath),
        bytes: stats.size,
        sha256: sha256(bytes),
        programId: options.programId ? String(options.programId) : undefined,
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
        "Transaction signature, program id, and observe evidence artifact after future deploy command.",
      ],
      nextCommand: "Future signer-backed deploy command; this bundled command does not sign or submit transactions.",
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
      artifact,
    });
  }

  function commandProgramDeployExecute(options) {
    const maxLamports = numberOption(options.maxLamports ?? process.env.AMBIENT_BLOCKCHAIN_MAX_LAMPORTS, undefined);
    const verification = buildApprovalVerification({
      ...options,
      requireSigner: true,
      maxLamports,
    });
    const startedAt = Date.now();
    const plan = verification.plan;
    const approval = verification.approval ?? {};
    const binaryReference =
      plan.program?.binaryRelativePath ?? plan.program?.binaryPath ?? approval.binaryRelativePath ?? approval.binaryPath;
    const binaryPath =
      typeof binaryReference === "string" && binaryReference.length > 0
        ? requireWorkspacePath(binaryReference, "program binary")
        : undefined;
    const binaryBytes = binaryPath && existsSync(binaryPath) ? readFileSync(binaryPath) : undefined;
    const binarySha256 = binaryBytes ? sha256(binaryBytes) : undefined;
    const signerEnvName = verification.payload.currentSigner?.envName ?? "AMBIENT_BLOCKCHAIN_KEYPAIR_FILE";
    const keypairPath = process.env[signerEnvName];
    const extraArgs = parseJsonArrayOption(options.extraArgsJson, "extra-args-json", []).map((entry) => String(entry));
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
        detail: `planSchemaVersion=${plan.schemaVersion ?? "missing"} approvalAction=${approval.action ?? "missing"}`,
      },
      {
        id: "verifier_lamport_cap_supplied",
        passed: maxLamports !== undefined,
        detail:
          maxLamports === undefined ? "Deploy execution requires --max-lamports or AMBIENT_BLOCKCHAIN_MAX_LAMPORTS." : `cap=${maxLamports}`,
      },
      {
        id: "binary_reference_present",
        passed: Boolean(binaryReference),
        detail: binaryReference ? "Plan includes a program binary reference." : "Plan does not include a program binary reference.",
      },
      {
        id: "binary_exists",
        passed: Boolean(binaryPath && existsSync(binaryPath)),
        detail: binaryPath ? toWorkspaceRelative(binaryPath) : "missing",
      },
      {
        id: "binary_hash_matches_plan",
        passed: Boolean(binarySha256 && approval.binarySha256 && binarySha256 === approval.binarySha256),
        detail: `current=${binarySha256 ?? "missing"} plan=${approval.binarySha256 ?? "missing"}`,
      },
      {
        id: "program_id_override_matches_plan",
        passed: !requestedProgramId || requestedProgramId === planProgramId,
        detail: requestedProgramId
          ? "A program id override must already be part of the approved plan."
          : "No program id override supplied.",
      },
      {
        id: "keypair_env_available",
        passed: typeof keypairPath === "string" && keypairPath.length > 0,
        detail: `Signer env ${signerEnvName} must be configured for deploy execution.`,
      },
    ];
    const blocked = verification.status !== "verified" || executionChecks.some((check) => !check.passed);
    const realArgs = binaryPath
      ? [
          "program",
          "deploy",
          binaryPath,
          "--url",
          approval.rpcUrl ?? plan.network?.rpcUrl ?? resolveRpcUrl(options),
          "--keypair",
          keypairPath ?? "",
        ]
      : [];
    if (programId) realArgs.push("--program-id", programId);
    realArgs.push(...extraArgs);
    const sanitizedCommand = [solanaExecutable, ...realArgs.map((entry) => redactKeypairPathText(entry, keypairPath, signerEnvName))];

    let result = {
      status: undefined,
      signal: undefined,
      stdout: "",
      stderr: "",
      error: undefined,
    };
    if (!blocked) {
      if (fake) {
        result = {
          status: 0,
          signal: null,
          stdout: `fake solana program deploy passed\nsignature=FAKE_DEPLOY_SIGNATURE\nprogramId=${programId ?? "unassigned"}\n`,
          stderr: "",
          error: undefined,
        };
      } else {
        result = spawnSync(solanaExecutable, realArgs, {
          cwd: workspaceRoot(),
          encoding: "utf8",
          timeout: numberOption(options.timeoutMs, 120_000),
          maxBuffer: 20 * 1024 * 1024,
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
        currentSigner: verification.payload.currentSigner,
      },
      executionChecks,
      program: {
        binaryRelativePath: binaryPath ? toWorkspaceRelative(binaryPath) : undefined,
        binarySha256,
        approvedBinarySha256: approval.binarySha256,
        programId,
      },
      network: {
        rpcUrl: approval.rpcUrl ?? plan.network?.rpcUrl ?? resolveRpcUrl(options),
      },
      signer: {
        envName: signerEnvName,
        publicKey: verification.payload.currentSigner?.publicKey,
        pathSha256: verification.payload.currentSigner?.pathSha256,
      },
      sanitizedCommand,
      exitCode: blocked ? undefined : result.status,
      signal: blocked ? undefined : result.signal,
      durationMs: Date.now() - startedAt,
      stdout,
      stderr,
      error: result.error ? redactKeypairPathText(errorMessage(result.error), keypairPath, signerEnvName) : undefined,
      signature: extractDeploySignature(stdout),
      secretPolicy: "Deploy execution redacts the signer keypair path and never includes private key bytes.",
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
      artifact,
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
      signer,
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
        websocketUrl: resolveWsUrl(options),
      },
      program: {
        binaryPath,
        binaryRelativePath: toWorkspaceRelative(binaryPath),
        bytes: stats.size,
        sha256: sha256(bytes),
        programId,
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
        "Transaction signature, program id, and observe evidence artifact after upgrade execution.",
      ],
      nextCommand:
        "ambient_program_upgrade_execute --plan-artifact <path> --approval-sha256 <sha> --max-lamports <n> --require-signer --json",
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
      artifact,
    });
  }

  function commandProgramUpgradeExecute(options) {
    const maxLamports = numberOption(options.maxLamports ?? process.env.AMBIENT_BLOCKCHAIN_MAX_LAMPORTS, undefined);
    const verification = buildApprovalVerification({
      ...options,
      requireSigner: true,
      maxLamports,
    });
    const startedAt = Date.now();
    const plan = verification.plan;
    const approval = verification.approval ?? {};
    const binaryReference =
      plan.program?.binaryRelativePath ?? plan.program?.binaryPath ?? approval.binaryRelativePath ?? approval.binaryPath;
    const binaryPath =
      typeof binaryReference === "string" && binaryReference.length > 0
        ? requireWorkspacePath(binaryReference, "program binary")
        : undefined;
    const binaryBytes = binaryPath && existsSync(binaryPath) ? readFileSync(binaryPath) : undefined;
    const binarySha256 = binaryBytes ? sha256(binaryBytes) : undefined;
    const signerEnvName = verification.payload.currentSigner?.envName ?? "AMBIENT_BLOCKCHAIN_KEYPAIR_FILE";
    const keypairPath = process.env[signerEnvName];
    const extraArgs = parseJsonArrayOption(options.extraArgsJson, "extra-args-json", []).map((entry) => String(entry));
    const planProgramId = approval.programId ?? plan.program?.programId;
    const requestedProgramId = options.programId ? String(options.programId) : undefined;
    const programId = requestedProgramId ?? planProgramId;
    const solanaExecutable = String(options.solana ?? "solana");
    const fake =
      process.env.AMBIENT_BLOCKCHAIN_FAKE_SOLANA_UPGRADE === "1" ||
      process.env.AMBIENT_BLOCKCHAIN_FAKE_SOLANA === "1" ||
      options.fake === true;

    const executionChecks = [
      ...verification.checks,
      {
        id: "plan_is_program_upgrade",
        passed: plan.schemaVersion === "ambient-program-upgrade-plan-v1" && approval.action === "ambient_program_upgrade",
        detail: `planSchemaVersion=${plan.schemaVersion ?? "missing"} approvalAction=${approval.action ?? "missing"}`,
      },
      {
        id: "verifier_lamport_cap_supplied",
        passed: maxLamports !== undefined,
        detail:
          maxLamports === undefined
            ? "Upgrade execution requires --max-lamports or AMBIENT_BLOCKCHAIN_MAX_LAMPORTS."
            : `cap=${maxLamports}`,
      },
      {
        id: "program_id_present",
        passed: Boolean(programId),
        detail: programId ? "Program id is replayed from the approved plan." : "Plan did not include a program id.",
      },
      {
        id: "program_id_override_matches_plan",
        passed: !requestedProgramId || requestedProgramId === planProgramId,
        detail: requestedProgramId
          ? "A program id override must already be part of the approved plan."
          : "No program id override supplied.",
      },
      {
        id: "binary_reference_present",
        passed: Boolean(binaryReference),
        detail: binaryReference ? "Plan includes a program binary reference." : "Plan does not include a program binary reference.",
      },
      {
        id: "binary_exists",
        passed: Boolean(binaryPath && existsSync(binaryPath)),
        detail: binaryPath ? toWorkspaceRelative(binaryPath) : "missing",
      },
      {
        id: "binary_hash_matches_plan",
        passed: Boolean(binarySha256 && approval.binarySha256 && binarySha256 === approval.binarySha256),
        detail: `current=${binarySha256 ?? "missing"} plan=${approval.binarySha256 ?? "missing"}`,
      },
      {
        id: "keypair_env_available",
        passed: typeof keypairPath === "string" && keypairPath.length > 0,
        detail: `Signer env ${signerEnvName} must be configured for upgrade execution.`,
      },
    ];
    const blocked = verification.status !== "verified" || executionChecks.some((check) => !check.passed);
    const realArgs = binaryPath
      ? [
          "program",
          "deploy",
          binaryPath,
          "--program-id",
          programId ?? "",
          "--url",
          approval.rpcUrl ?? plan.network?.rpcUrl ?? resolveRpcUrl(options),
          "--keypair",
          keypairPath ?? "",
        ]
      : [];
    realArgs.push(...extraArgs);
    const sanitizedCommand = [solanaExecutable, ...realArgs.map((entry) => redactKeypairPathText(entry, keypairPath, signerEnvName))];

    let result = { status: undefined, signal: undefined, stdout: "", stderr: "", error: undefined };
    if (!blocked) {
      if (fake) {
        result = {
          status: 0,
          signal: null,
          stdout: `fake solana program upgrade passed\nsignature=FAKE_UPGRADE_SIGNATURE\nprogramId=${programId}\n`,
          stderr: "",
          error: undefined,
        };
      } else {
        result = spawnSync(solanaExecutable, realArgs, {
          cwd: workspaceRoot(),
          encoding: "utf8",
          timeout: numberOption(options.timeoutMs, 120_000),
          maxBuffer: 20 * 1024 * 1024,
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
        currentSigner: verification.payload.currentSigner,
      },
      executionChecks,
      program: {
        binaryRelativePath: binaryPath ? toWorkspaceRelative(binaryPath) : undefined,
        binarySha256,
        approvedBinarySha256: approval.binarySha256,
        programId,
      },
      network: {
        rpcUrl: approval.rpcUrl ?? plan.network?.rpcUrl ?? resolveRpcUrl(options),
      },
      signer: {
        envName: signerEnvName,
        publicKey: verification.payload.currentSigner?.publicKey,
        pathSha256: verification.payload.currentSigner?.pathSha256,
      },
      sanitizedCommand,
      exitCode: blocked ? undefined : result.status,
      signal: blocked ? undefined : result.signal,
      durationMs: Date.now() - startedAt,
      stdout,
      stderr,
      error: result.error ? redactKeypairPathText(errorMessage(result.error), keypairPath, signerEnvName) : undefined,
      signature: extractDeploySignature(stdout),
      secretPolicy: "Upgrade execution redacts the signer keypair path and never includes private key bytes.",
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
      artifact,
    });
  }

  return {
    commandProgramDeployExecute,
    commandProgramDeployPlan,
    commandProgramUpgradeExecute,
    commandProgramUpgradePlan,
  };
}
