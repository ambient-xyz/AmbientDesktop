import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export function createLiveGateCommands(deps) {
  const {
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
    entrypointPath,
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
    writeMarkdownArtifact,
  } = deps;

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
        signerConfigured: doctor.env.find((entry) => entry.name === "AMBIENT_BLOCKCHAIN_KEYPAIR_FILE")?.configured ?? false,
      },
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
        warnings: entry.warnings,
      })),
    });

    if (options.desktopPi) {
      const dogfood = buildDesktopPiDogfood(options);
      lanes.push({
        id: "desktop-pi",
        status: dogfood.status,
        summary: dogfood.summary,
        details: dogfood,
      });
    } else {
      lanes.push({
        id: "desktop-pi",
        status: "skipped",
        summary: "Pass --desktop-pi to run deterministic Desktop/Pi package discovery dogfood.",
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
        probes,
      });
    } else {
      lanes.push({
        id: "safe-read",
        status: "skipped",
        summary: "Pass --live-read to run read-only Ambient RPC probes.",
      });
    }

    if (options.oracle || options.oracleFunded) {
      lanes.push(await buildOracleLiveGateLane(options));
    } else {
      lanes.push({
        id: "oracle-funded",
        status: "skipped",
        summary:
          "Pass --oracle to produce a non-mutating Tool Oracle plan; add --oracle-funded for approved submit/wait/decode/reclaim evidence.",
      });
    }

    if (options.x402 || options.x402Paid) {
      lanes.push(await buildX402LiveGateLane(options));
    } else {
      lanes.push({
        id: "x402-funded",
        status: "skipped",
        summary: "Pass --x402 to plan an x402 quote lane; add --x402-paid for approved paid request evidence.",
      });
    }

    if (options.program) {
      lanes.push(await buildProgramLiveGateLane(options));
    } else {
      lanes.push({
        id: "program-workbench",
        status: "skipped",
        summary: "Pass --program to check Rust/Solana/Anchor readiness.",
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
        artifact: validatorArtifact,
      });
    } else {
      lanes.push({
        id: "local-validator",
        status: "skipped",
        summary: "Pass --local-validator to check local validator readiness; add --start-validator for an opt-in lifecycle run.",
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
        secretValuesIncluded: false,
      },
    };
    const artifact = writeArtifact("live-gate", payload, options);
    const markdownArtifact = writeMarkdownArtifact("live-gate", payload, buildLiveGateMarkdown(payload, artifact), options);
    return writeJson({
      schemaVersion: "ambient-blockchain-live-gate-result-v1",
      packageName,
      status: payload.status,
      lanes: lanes.map((lane) => ({ id: lane.id, status: lane.status, summary: lane.summary })),
      artifact,
      markdownArtifact,
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
      artifact,
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
        websocketUrl: resolveWsUrl(options),
      },
      contracts: contractSummary(contracts),
      env: envStatus(),
      commands: commandSummary(),
      safety: contracts.safety,
      liveTestLanes: contracts.liveTestLanes,
    };
  }

  async function buildOracleLiveGateLane(options) {
    const fundedRequested = Boolean(options.oracleFunded || options.oracleSubmit);
    const oraclePlan = buildOraclePlan({
      ...options,
      prompt: options.prompt ?? "Ambient Blockchain live gate Tool Oracle planning probe",
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
      planArtifact,
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
      "--json",
    ];
    addOptionalCommandArg(submitArgs, "--client-command-json", options.clientCommandJson);
    addFlagCommandArg(submitArgs, "--fake", options.fake);
    addOptionalCommandArg(submitArgs, "--timeout-ms", options.oracleTimeoutMs ?? options.timeoutMs);
    const submit = runPackageJsonCommand(submitArgs, {
      timeoutMs: numberOption(options.oracleTimeoutMs ?? options.timeoutMs, 180_000),
      redactions: [oraclePlan.prompt],
    });
    const submitStatus = submit.parsed?.status ?? (submit.exitCode === 0 ? "unknown" : "failed");
    if (submit.exitCode !== 0 || submitStatus !== "submitted") {
      return {
        ...lane,
        status: submitStatus === "blocked" ? "blocked" : "failed",
        summary: `Tool Oracle submit ended with status ${submitStatus}.`,
        fundedRequested: true,
        submit,
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
      "--json",
    ];
    addOptionalCommandArg(waitArgs, "--rpc-url", options.oracleObserveRpcUrl ?? options.rpcUrl);
    addOptionalCommandArg(waitArgs, "--timeout-ms", options.oracleTimeoutMs ?? options.timeoutMs);
    addFlagCommandArg(waitArgs, "--fake", options.oracleFakeWait);
    const wait = runPackageJsonCommand(waitArgs, {
      timeoutMs: numberOption(options.oracleTimeoutMs ?? options.timeoutMs, 180_000),
      redactions: [oraclePlan.prompt],
    });
    const waitStatus = wait.parsed?.status ?? (wait.exitCode === 0 ? "unknown" : "failed");
    if (wait.exitCode !== 0 || !["terminal", "observed", "not_found"].includes(waitStatus)) {
      return {
        ...lane,
        status: waitStatus === "blocked" ? "blocked" : "failed",
        summary: `Tool Oracle wait ended with status ${waitStatus}.`,
        fundedRequested: true,
        submit,
        wait,
      };
    }

    let decode;
    if (wait.parsed?.artifact?.relativePath) {
      decode = runPackageJsonCommand(["oracle-decode", "--wait-artifact", wait.parsed.artifact.relativePath, "--json"], {
        timeoutMs: numberOption(options.oracleTimeoutMs ?? options.timeoutMs, 60_000),
        redactions: [oraclePlan.prompt],
      });
    }

    const reclaimMaxLamports = numberOption(
      options.oracleReclaimMaxLamports ?? options.reclaimMaxLamports ?? oraclePlan.maxLamports,
      oraclePlan.maxLamports,
    );
    const reclaimPlan = runPackageJsonCommand(
      ["oracle-reclaim-plan", "--submit-artifact", submitArtifact, "--max-lamports", String(reclaimMaxLamports), "--json"],
      {
        timeoutMs: numberOption(options.oracleTimeoutMs ?? options.timeoutMs, 60_000),
        redactions: [oraclePlan.prompt],
      },
    );
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
        reclaimPlan,
      };
    }

    const reclaim = runPackageJsonCommand(
      [
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
        ...(options.clientCommandJson ? ["--client-command-json", String(options.clientCommandJson)] : []),
      ],
      {
        timeoutMs: numberOption(options.oracleTimeoutMs ?? options.timeoutMs, 120_000),
        redactions: [oraclePlan.prompt],
      },
    );
    const reclaimStatus = reclaim.parsed?.status ?? (reclaim.exitCode === 0 ? "unknown" : "failed");
    const laneStatus =
      reclaim.exitCode !== 0 ? "failed" : reclaimStatus === "reclaimed" ? "reclaimed" : reclaimStatus === "blocked" ? "blocked" : "failed";
    return {
      ...lane,
      status: laneStatus,
      summary:
        laneStatus === "reclaimed"
          ? "Approved Tool Oracle request completed submit, wait, decode, and reclaim evidence."
          : `Tool Oracle reclaim execution ended with status ${reclaimStatus}.`,
      fundedRequested: true,
      submit,
      wait,
      decode,
      reclaimPlan,
      reclaim,
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
      quoteArtifact,
    };
    if (!paidRequested) return lane;
    if (quote.status === "failed") {
      return {
        ...lane,
        status: "failed",
        summary: "x402 paid lane was requested but quote/probe failed before payment execution.",
        paidRequested: true,
      };
    }

    const commandArgs = [
      entrypointPath,
      "x402-request-execute",
      "--quote-artifact",
      quoteArtifact.relativePath,
      "--approval-sha256",
      quote.approvalSha256,
      "--max-lamports",
      String(quote.maxLamports),
      "--max-micro-usdc",
      String(quote.maxMicroUsdc),
      "--json",
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
      "--json",
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
      maxBuffer: 10 * 1024 * 1024,
    });
    let parsedResult;
    let parseError;
    try {
      parsedResult = JSON.parse(execution.stdout || "{}");
    } catch (error) {
      parseError = errorMessage(error);
    }
    const executionStatus = parsedResult?.status ?? (execution.status === 0 ? "unknown" : "failed");
    const laneStatus =
      execution.status !== 0
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
      summary:
        laneStatus === "paid"
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
        result: parsedResult,
      },
    };
  }

  async function buildProgramLiveGateLane(options) {
    const lifecycleRequested = Boolean(options.programLifecycle || options.programDeploy);
    const doctor = buildProgramDoctor(options);
    const lane = {
      id: "program-workbench",
      status: "checked",
      summary: "Local program toolchain readiness checked without deployment.",
      doctor,
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

    const scaffold = runPackageJsonCommand(
      ["program-scaffold", "--project-dir", projectRelativePath, "--template", template, "--name", name, "--force", "--json"],
      {
        timeoutMs: numberOption(options.programTimeoutMs ?? options.timeoutMs, 60_000),
      },
    );
    if (scaffold.exitCode !== 0 || scaffold.parsed?.status !== "scaffolded") {
      return {
        ...lane,
        status: "failed",
        summary: "Program live-gate scaffold failed.",
        lifecycleRequested: true,
        projectRelativePath,
        scaffold,
      };
    }

    const build = runPackageJsonCommand(["program-build", "--project-dir", projectRelativePath, "--json"], {
      timeoutMs: numberOption(options.programTimeoutMs ?? options.timeoutMs, 180_000),
      env: commandEnv,
    });
    if (build.exitCode !== 0 || build.parsed?.status !== "passed") {
      return {
        ...lane,
        status: "failed",
        summary: "Program live-gate build failed.",
        lifecycleRequested: true,
        projectRelativePath,
        scaffold,
        build,
      };
    }

    const test = runPackageJsonCommand(["program-test", "--project-dir", projectRelativePath, "--json"], {
      timeoutMs: numberOption(options.programTimeoutMs ?? options.timeoutMs, 180_000),
      env: commandEnv,
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
        test,
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
      test,
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
    const maxLamports = numberOption(
      options.programMaxLamports ?? options.maxLamports ?? process.env.AMBIENT_BLOCKCHAIN_MAX_LAMPORTS,
      5_000,
    );
    const deployPlan = runPackageJsonCommand(
      [
        "program-deploy-plan",
        "--binary",
        binaryRelativePath,
        "--max-lamports",
        String(maxLamports),
        ...(options.programId ? ["--program-id", String(options.programId)] : []),
        "--json",
      ],
      {
        timeoutMs: numberOption(options.programTimeoutMs ?? options.timeoutMs, 60_000),
      },
    );
    if (deployPlan.exitCode !== 0 || deployPlan.parsed?.status !== "planned") {
      return {
        ...base,
        status: "failed",
        summary: "Program live-gate deploy plan failed.",
        binary: binarySummary(binaryPath),
        deployPlan,
      };
    }

    const deployEnv = options.fake || options.programFakeDeploy ? { AMBIENT_BLOCKCHAIN_FAKE_SOLANA_DEPLOY: "1" } : {};
    const deploy = runPackageJsonCommand(
      [
        "program-deploy-execute",
        "--plan-artifact",
        deployPlan.parsed.artifact.relativePath,
        "--approval-sha256",
        deployPlan.parsed.approvalSha256,
        "--max-lamports",
        String(maxLamports),
        "--require-signer",
        "--json",
        ...(options.fake || options.programFakeDeploy ? ["--fake"] : []),
      ],
      {
        timeoutMs: numberOption(options.programTimeoutMs ?? options.timeoutMs, 120_000),
        env: deployEnv,
      },
    );
    const deployStatus = deploy.parsed?.status ?? (deploy.exitCode === 0 ? "unknown" : "failed");
    const status =
      deploy.exitCode !== 0 ? "failed" : deployStatus === "deployed" ? "deployed" : deployStatus === "blocked" ? "blocked" : "failed";
    const deployedLane = {
      ...base,
      status,
      summary:
        status === "deployed"
          ? "Program live-gate scaffold, build, test, deploy plan, and approved deploy evidence completed."
          : `Program live-gate deploy execution ended with status ${deployStatus}.`,
      binary: binarySummary(binaryPath),
      deployPlan,
      deploy,
    };
    if (!options.programObserve || status !== "deployed") return deployedLane;

    const observedProgramId = String(options.programObserveProgramId ?? options.programId ?? deploy.parsed?.program?.programId ?? "");
    if (!observedProgramId) {
      return {
        ...deployedLane,
        status: "failed",
        summary: "Program observation was requested but no program id was available.",
      };
    }
    const observe = runPackageJsonCommand(
      [
        "program-observe",
        "--program-id",
        observedProgramId,
        "--filters-json",
        String(options.programObserveFiltersJson ?? options.filtersJson ?? '[{"dataSize":8}]'),
        "--data-slice-length",
        String(numberOption(options.programObserveDataSliceLength ?? options.dataSliceLength, 8)),
        "--limit",
        String(cappedInteger(options.programObserveLimit ?? options.limit, 5, 1, 100, "program-observe-limit")),
        "--json",
        ...(options.programObserveFake || options.fake ? ["--fake"] : []),
        ...(options.rpcUrl ? ["--rpc-url", String(options.rpcUrl)] : []),
      ],
      {
        timeoutMs: numberOption(options.programTimeoutMs ?? options.timeoutMs, 120_000),
        env: options.programObserveFake || options.fake ? { AMBIENT_BLOCKCHAIN_FAKE_PROGRAM_OBSERVE: "1" } : {},
      },
    );
    const observeStatus = observe.parsed?.status ?? (observe.exitCode === 0 ? "unknown" : "failed");
    if (observe.exitCode !== 0 || observeStatus !== "completed") {
      return {
        ...deployedLane,
        status: "failed",
        summary: `Program observation ended with status ${observeStatus}.`,
        observe,
      };
    }
    return {
      ...deployedLane,
      status: "observed",
      summary: "Program live-gate scaffold, build, test, approved deploy, and post-deploy observation evidence completed.",
      observe,
    };
  }

  function binarySummary(binaryPath) {
    const bytes = readFileSync(binaryPath);
    return {
      relativePath: toWorkspaceRelative(binaryPath),
      bytes: bytes.length,
      sha256: sha256(bytes),
    };
  }

  function runPackageJsonCommand(args, { timeoutMs, redactions = [], env = {} } = {}) {
    const commandRedactions = normalizeRedactions([
      ...redactions,
      process.env.AMBIENT_BLOCKCHAIN_KEYPAIR_FILE,
      process.env.AMBIENT_X402_KEYPAIR_FILE,
      process.env.AMBIENT_X402_PAYMENT_HEADER_FILE,
    ]);
    const command = [process.execPath, entrypointPath, ...args.map((arg) => String(arg))];
    const result = spawnSync(command[0], command.slice(1), {
      cwd: workspaceRoot(),
      env: { ...process.env, ...env },
      encoding: "utf8",
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
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
      parsed: redactJsonValue(parsed, commandRedactions),
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

  return {
    commandLiveGate,
    commandLocalValidatorGate,
  };
}
