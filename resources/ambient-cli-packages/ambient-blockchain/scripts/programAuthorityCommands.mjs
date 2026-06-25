import { spawnSync } from "node:child_process";

import { createKeypairPathRedactor, extractDeploySignature } from "./programLifecycleCommandSupport.mjs";

export function createProgramAuthorityCommands(dependencies) {
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
    resolveRpcUrl,
    resolveWsUrl,
    signerApprovalSummary,
    stringOption,
    workspaceRoot,
    writeArtifact,
    writeJson,
  } = dependencies;
  const redactKeypairPathText = createKeypairPathRedactor(redactSensitiveText);

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
      signer,
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
        websocketUrl: resolveWsUrl(options),
      },
      authority: {
        programId,
        newAuthority,
        final,
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
        "Transaction signature and post-change observation evidence after authority execution.",
      ],
      nextCommand:
        "ambient_program_authority_execute --plan-artifact <path> --approval-sha256 <sha> --max-lamports <n> --require-signer --json",
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
      artifact,
    });
  }

  function commandProgramAuthorityExecute(options) {
    const maxLamports = numberOption(options.maxLamports ?? process.env.AMBIENT_BLOCKCHAIN_MAX_LAMPORTS, undefined);
    const verification = buildApprovalVerification({
      ...options,
      requireSigner: true,
      maxLamports,
    });
    const startedAt = Date.now();
    const plan = verification.plan;
    const approval = verification.approval ?? {};
    const signerEnvName = verification.payload.currentSigner?.envName ?? "AMBIENT_BLOCKCHAIN_KEYPAIR_FILE";
    const keypairPath = process.env[signerEnvName];
    const extraArgs = parseJsonArrayOption(options.extraArgsJson, "extra-args-json", []).map((entry) => String(entry));
    const planProgramId = approval.programId ?? plan.authority?.programId;
    const requestedProgramId = options.programId ? String(options.programId) : undefined;
    const programId = requestedProgramId ?? planProgramId;
    const requestedNewAuthority = options.newAuthority ? String(options.newAuthority) : undefined;
    const newAuthority = requestedNewAuthority ?? approval.newAuthority ?? plan.authority?.newAuthority;
    const requestedFinal = options.final === true;
    const final = approval.final === true || plan.authority?.final === true;
    const solanaExecutable = String(options.solana ?? "solana");
    const fake =
      process.env.AMBIENT_BLOCKCHAIN_FAKE_SOLANA_AUTHORITY === "1" ||
      process.env.AMBIENT_BLOCKCHAIN_FAKE_SOLANA === "1" ||
      options.fake === true;

    const executionChecks = [
      ...verification.checks,
      {
        id: "plan_is_program_authority_change",
        passed: plan.schemaVersion === "ambient-program-authority-plan-v1" && approval.action === "ambient_program_authority_change",
        detail: `planSchemaVersion=${plan.schemaVersion ?? "missing"} approvalAction=${approval.action ?? "missing"}`,
      },
      {
        id: "verifier_lamport_cap_supplied",
        passed: maxLamports !== undefined,
        detail:
          maxLamports === undefined
            ? "Authority execution requires --max-lamports or AMBIENT_BLOCKCHAIN_MAX_LAMPORTS."
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
        id: "new_authority_matches_plan",
        passed: final || !requestedNewAuthority || requestedNewAuthority === approval.newAuthority,
        detail: final
          ? "Plan finalizes upgrade authority."
          : requestedNewAuthority
            ? "New authority override must match the approved plan."
            : "No new authority override supplied.",
      },
      {
        id: "final_flag_matches_plan",
        passed: !requestedFinal || final,
        detail: requestedFinal ? "Execution --final must be part of the approved plan." : "No final override supplied.",
      },
      {
        id: "authority_target_present",
        passed: final || Boolean(newAuthority),
        detail: final ? "Final authority removal requested." : "New authority must be present unless --final was approved.",
      },
      {
        id: "keypair_env_available",
        passed: typeof keypairPath === "string" && keypairPath.length > 0,
        detail: `Signer env ${signerEnvName} must be configured for authority execution.`,
      },
    ];
    const blocked = verification.status !== "verified" || executionChecks.some((check) => !check.passed);
    const realArgs = programId
      ? [
          "program",
          "set-upgrade-authority",
          programId,
          "--url",
          approval.rpcUrl ?? plan.network?.rpcUrl ?? resolveRpcUrl(options),
          "--keypair",
          keypairPath ?? "",
        ]
      : [];
    if (final) {
      realArgs.push("--final");
    } else if (newAuthority) {
      realArgs.push("--new-upgrade-authority", newAuthority);
    }
    realArgs.push(...extraArgs);
    const sanitizedCommand = [solanaExecutable, ...realArgs.map((entry) => redactKeypairPathText(entry, keypairPath, signerEnvName))];

    let result = { status: undefined, signal: undefined, stdout: "", stderr: "", error: undefined };
    if (!blocked) {
      if (fake) {
        result = {
          status: 0,
          signal: null,
          stdout: `fake solana program authority change passed\nsignature=FAKE_AUTHORITY_SIGNATURE\nprogramId=${programId}\n`,
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
        currentSigner: verification.payload.currentSigner,
      },
      executionChecks,
      authority: {
        programId,
        newAuthority,
        final,
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
      secretPolicy: "Authority execution redacts the signer keypair path and never includes private key bytes.",
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
      artifact,
    });
  }

  return {
    commandProgramAuthorityExecute,
    commandProgramAuthorityPlan,
  };
}
