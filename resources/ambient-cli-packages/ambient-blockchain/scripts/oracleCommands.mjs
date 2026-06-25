import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export function createOracleCommands(dependencies) {
  const {
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
    writeJson,
  } = dependencies;

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
      artifact,
    });
  }

  function commandOracleSubmit(options) {
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
    const fake = process.env.AMBIENT_ORACLE_FAKE_CLIENT === "1" || options.fake === true;
    const promptFile = materializeOraclePromptFile(plan, options);
    const clientTemplate = fake ? [] : parseCommandTemplateOption(options.clientCommandJson, "client-command-json");
    const replacements = oracleCommandReplacements({ plan, approval, keypairPath, promptFile });
    const command = clientTemplate.length > 0 ? expandCommandTemplate(clientTemplate, replacements) : { real: [], sanitized: [] };
    const redactions = [
      { value: keypairPath, replacement: `<${signerEnvName}>` },
      { value: promptFile.path, replacement: "<ORACLE_PROMPT_FILE>" },
      { value: plan.prompt, replacement: "<ORACLE_PROMPT>" },
    ];

    const executionChecks = [
      ...verification.checks,
      {
        id: "plan_is_tool_oracle_request",
        passed: plan.schemaVersion === "ambient-oracle-request-plan-v1" && approval.action === "tool_oracle_request",
        detail: `planSchemaVersion=${plan.schemaVersion ?? "missing"} approvalAction=${approval.action ?? "missing"}`,
      },
      {
        id: "verifier_lamport_cap_supplied",
        passed: maxLamports !== undefined,
        detail:
          maxLamports === undefined ? "Oracle submit requires --max-lamports or AMBIENT_BLOCKCHAIN_MAX_LAMPORTS." : `cap=${maxLamports}`,
      },
      {
        id: "prompt_hash_matches_plan",
        passed: Boolean(plan.promptSha256 && approval.promptSha256 && plan.promptSha256 === approval.promptSha256),
        detail: `plan=${plan.promptSha256 ?? "missing"} approval=${approval.promptSha256 ?? "missing"}`,
      },
      {
        id: "escrow_within_cap",
        passed: maxLamports === undefined || numberOption(approval.escrowLamports, 0) <= maxLamports,
        detail: `escrow=${approval.escrowLamports ?? 0} cap=${maxLamports ?? "missing"}`,
      },
      {
        id: "keypair_env_available",
        passed: typeof keypairPath === "string" && keypairPath.length > 0,
        detail: `Signer env ${signerEnvName} must be configured for oracle submit.`,
      },
      {
        id: "oracle_client_command_configured",
        passed: fake || command.real.length > 0,
        detail: fake ? "Fake oracle client enabled for deterministic testing." : "Submit requires --client-command-json.",
      },
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
          error: undefined,
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
            AMBIENT_ORACLE_WS_URL: plan.network?.websocketUrl ?? resolveWsUrl(options),
          },
          encoding: "utf8",
          timeout: numberOption(options.timeoutMs, 180_000),
          maxBuffer: 20 * 1024 * 1024,
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
        currentSigner: verification.payload.currentSigner,
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
        signature,
      },
      network: {
        rpcUrl: approval.rpcUrl ?? plan.network?.rpcUrl ?? resolveRpcUrl(options),
        websocketUrl: plan.network?.websocketUrl ?? resolveWsUrl(options),
      },
      signer: {
        envName: signerEnvName,
        publicKey: verification.payload.currentSigner?.publicKey,
        pathSha256: verification.payload.currentSigner?.pathSha256,
      },
      promptFile: {
        relativePath: promptFile.relativePath,
        bytes: promptFile.bytes,
        sha256: promptFile.sha256,
      },
      sanitizedCommand: command.sanitized,
      exitCode: blocked ? undefined : result.status,
      signal: blocked ? undefined : result.signal,
      durationMs: Date.now() - startedAt,
      stdout,
      stderr,
      error: result.error ? redactSensitiveText(errorMessage(result.error), redactions) : undefined,
      secretPolicy: "Oracle submit redacts signer keypair paths, prompt text, and prompt file paths from stdout and artifacts.",
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
      artifact,
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
            timeoutMs: numberOption(options.timeoutMs, 15_000),
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
        rawResponse: response.body,
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
      submitArtifact: submitArtifact
        ? {
            relativePath: toWorkspaceRelative(requireWorkspacePath(options.submitArtifact, "submit artifact")),
            sha256: sha256(readFileSync(requireWorkspacePath(options.submitArtifact, "submit artifact"))),
          }
        : undefined,
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
      latest: latest
        ? {
            exists: latest.exists,
            accountSummary: latest.accountSummary,
            decoded: latest.decoded,
          }
        : undefined,
      durationMs: payload.durationMs,
      artifact,
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
      rawAccountInfo: source.accountInfo,
    };
    const artifact = writeArtifact("oracle", payload, options);
    return writeJson({
      schemaVersion: "ambient-oracle-response-decode-result-v1",
      packageName,
      status: payload.status,
      mutation: "none",
      requestAccount: payload.requestAccount,
      decoded,
      artifact,
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
            space: Buffer.byteLength(data, "base64"),
          },
        },
      },
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
      signer,
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
        websocketUrl: resolveWsUrl(options),
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
        "Transaction signature and cleanup evidence artifact after reclaim execution.",
      ],
      submitArtifact: submitArtifact
        ? {
            approvalSha256: submitArtifact.approvalSha256,
            requestAccount: submitArtifact.oracle?.requestAccount,
          }
        : undefined,
      nextCommand:
        "ambient_oracle_reclaim_execute --plan-artifact <path> --approval-sha256 <sha> --max-lamports <n> --require-signer --json",
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
      artifact,
    });
  }

  function commandOracleReclaimExecute(options) {
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
        detail: `planSchemaVersion=${plan.schemaVersion ?? "missing"} approvalAction=${approval.action ?? "missing"}`,
      },
      {
        id: "verifier_lamport_cap_supplied",
        passed: maxLamports !== undefined,
        detail:
          maxLamports === undefined ? "Oracle reclaim requires --max-lamports or AMBIENT_BLOCKCHAIN_MAX_LAMPORTS." : `cap=${maxLamports}`,
      },
      {
        id: "request_account_present",
        passed: Boolean(requestAccount),
        detail: requestAccount ? "Request account is replayed from the approved plan." : "Plan did not include a request account.",
      },
      {
        id: "request_account_override_matches_plan",
        passed: !requestedRequestAccount || requestedRequestAccount === approval.requestAccount,
        detail: requestedRequestAccount
          ? "Request account override must match the approved plan."
          : "No request account override supplied.",
      },
      {
        id: "keypair_env_available",
        passed: typeof keypairPath === "string" && keypairPath.length > 0,
        detail: `Signer env ${signerEnvName} must be configured for oracle reclaim.`,
      },
      {
        id: "oracle_client_command_configured",
        passed: fake || command.real.length > 0,
        detail: fake ? "Fake oracle client enabled for deterministic testing." : "Reclaim requires --client-command-json.",
      },
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
          error: undefined,
        };
      } else {
        result = spawnSync(command.real[0], command.real.slice(1), {
          cwd: workspaceRoot(),
          env: {
            ...process.env,
            AMBIENT_ORACLE_REQUEST_ACCOUNT: requestAccount ?? "",
            AMBIENT_ORACLE_RPC_URL: approval.rpcUrl ?? plan.network?.rpcUrl ?? resolveRpcUrl(options),
          },
          encoding: "utf8",
          timeout: numberOption(options.timeoutMs, 120_000),
          maxBuffer: 20 * 1024 * 1024,
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
        currentSigner: verification.payload.currentSigner,
      },
      executionChecks,
      requestAccount,
      network: {
        rpcUrl: approval.rpcUrl ?? plan.network?.rpcUrl ?? resolveRpcUrl(options),
      },
      signer: {
        envName: signerEnvName,
        publicKey: verification.payload.currentSigner?.publicKey,
        pathSha256: verification.payload.currentSigner?.pathSha256,
      },
      sanitizedCommand: command.sanitized,
      exitCode: blocked ? undefined : result.status,
      signal: blocked ? undefined : result.signal,
      durationMs: Date.now() - startedAt,
      stdout,
      stderr,
      error: result.error ? redactSensitiveText(errorMessage(result.error), redactions) : undefined,
      signature,
      secretPolicy: "Oracle reclaim redacts signer keypair paths and never includes private key bytes.",
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
      artifact,
    });
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
      signer,
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
        websocketUrl: resolveWsUrl(options),
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
        "Transaction signature, request account, and observation artifact after future submit command.",
      ],
      nextCommand: "Future signer-backed Tool Oracle submit command; this bundled command does not sign or submit transactions.",
    };
  }

  function promptFromOptions(options) {
    if (typeof options.prompt === "string") return options.prompt;
    if (typeof options.promptFile === "string") {
      const promptFile = requireWorkspacePath(options.promptFile, "prompt file");
      return readFileSync(promptFile, "utf8");
    }
    throw new Error("Oracle request planning requires --prompt <text> or --prompt-file <workspace path>.");
  }

  function parseCommandTemplateOption(value, label) {
    const parsed = parseJsonArrayOption(value, label, undefined);
    if (!parsed || parsed.length === 0) throw new Error(`--${label} must be a non-empty JSON array.`);
    return parsed.map((entry) => String(entry));
  }

  function expandCommandTemplate(template, replacements) {
    return {
      real: template.map((entry) => replaceCommandPlaceholders(entry, replacements, false)),
      sanitized: template.map((entry) => replaceCommandPlaceholders(entry, replacements, true)),
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
      RPC_URL: {
        real: approval.rpcUrl ?? plan.network?.rpcUrl ?? defaultRpcUrl,
        sanitized: approval.rpcUrl ?? plan.network?.rpcUrl ?? defaultRpcUrl,
      },
      WS_URL: { real: plan.network?.websocketUrl ?? defaultWsUrl, sanitized: plan.network?.websocketUrl ?? defaultWsUrl },
      PROMPT_FILE: { real: promptFile?.path ?? "", sanitized: "<ORACLE_PROMPT_FILE>" },
      ESCROW_LAMPORTS: {
        real: String(approval.escrowLamports ?? plan.escrowLamports ?? 0),
        sanitized: String(approval.escrowLamports ?? plan.escrowLamports ?? 0),
      },
      MAX_LAMPORTS: {
        real: String(approval.maxLamports ?? plan.maxLamports ?? 0),
        sanitized: String(approval.maxLamports ?? plan.maxLamports ?? 0),
      },
      MAX_RESPONSES: {
        real: String(approval.maxResponses ?? plan.maxResponses ?? 1),
        sanitized: String(approval.maxResponses ?? plan.maxResponses ?? 1),
      },
      FILTER: {
        real: approval.responseFilter ?? plan.responseFilter ?? "",
        sanitized: approval.responseFilter ?? plan.responseFilter ?? "",
      },
      REQUEST_ACCOUNT: {
        real: requestAccount ?? approval.requestAccount ?? plan.requestAccount ?? "",
        sanitized: requestAccount ?? approval.requestAccount ?? plan.requestAccount ?? "",
      },
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
      sha256: sha256(prompt),
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
          sha256: sha256(readFileSync(waitArtifactPath)),
        },
        requestAccount: waitArtifact.requestAccount,
        accountInfo: latest?.rawResponse?.result?.value,
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
          sha256: sha256(readFileSync(artifactPath)),
        },
        requestAccount: artifact.address ?? artifact.requestAccount,
        accountInfo,
      };
    }
    if (options.dataBase64) {
      return {
        source: { kind: "data-base64" },
        requestAccount: options.requestAccount ? String(options.requestAccount) : undefined,
        accountInfo: {
          data: [String(options.dataBase64), "base64"],
        },
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
      terminal: false,
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

  return {
    buildOraclePlan,
    commandOracleDecode,
    commandOraclePlan,
    commandOracleReclaimExecute,
    commandOracleReclaimPlan,
    commandOracleSubmit,
    commandOracleWait,
  };
}
