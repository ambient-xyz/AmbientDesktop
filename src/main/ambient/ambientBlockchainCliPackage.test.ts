import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  describeAmbientCliPackage,
  ensureFirstPartyAmbientCliPackages,
  runAmbientCliPackageCommand,
  searchAmbientCliCapabilities,
} from "../ambient-cli/ambientCliPackages";

describe("Ambient Blockchain CLI package", () => {
  it("installs as a bundled package and exposes the live-test planning surface", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-blockchain-cli-"));
    try {
      const statuses = await ensureFirstPartyAmbientCliPackages(workspace, {
        packageNames: ["ambient-blockchain"],
        bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages"),
      });
      expect(statuses).toEqual([
        expect.objectContaining({
          packageName: "ambient-blockchain",
          source: "bundled:ambient-blockchain",
          status: "installed",
        }),
      ]);

      const search = await searchAmbientCliCapabilities(workspace, {
        query: "Ambient Blockchain Tool Oracle x402 live gate program deploy",
        limit: 5,
      });
      expect(search.results).toEqual(expect.arrayContaining([
        expect.objectContaining({
          packageName: "ambient-blockchain",
          availability: "available",
          commands: expect.arrayContaining([
            expect.objectContaining({ name: "ambient_chain_doctor", health: "passed" }),
            expect.objectContaining({ name: "ambient_blockchain_live_gate", health: "passed" }),
          ]),
          skills: [expect.objectContaining({ name: "ambient-blockchain" })],
        }),
      ]));

      const description = await describeAmbientCliPackage(workspace, {
        packageName: "ambient-blockchain",
        includeSkill: true,
      });
      expect(description.commands.map((command) => command.name)).toEqual([
        "ambient_chain_doctor",
        "ambient_chain_rpc",
        "ambient_chain_account",
        "ambient_chain_transaction",
        "ambient_chain_program_observe",
        "ambient_keypair_status",
        "ambient_approval_verify",
        "ambient_auction_inspect",
        "ambient_oracle_request_plan",
        "ambient_oracle_request_submit",
        "ambient_oracle_request_wait",
        "ambient_oracle_response_decode",
        "ambient_oracle_reclaim_plan",
        "ambient_oracle_reclaim_execute",
        "ambient_x402_quote",
        "ambient_x402_request_execute",
        "ambient_program_doctor",
        "ambient_program_scaffold",
        "ambient_program_build",
        "ambient_program_test",
        "ambient_program_deploy_plan",
        "ambient_program_deploy_execute",
        "ambient_program_upgrade_plan",
        "ambient_program_upgrade_execute",
        "ambient_program_authority_plan",
        "ambient_program_authority_execute",
        "ambient_local_validator_gate",
        "ambient_desktop_pi_dogfood",
        "ambient_blockchain_live_gate",
      ]);
      expect(description.skills[0]?.text).toContain("Safe live-read is the default live lane");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }, 15_000);

  it("dogfoods Desktop/Pi discovery without network, signing, or secret leakage", async () => {
    const workspace = await installBlockchainPackage();
    try {
      const keypairPath = join(workspace, "dogfood-keypair.json");
      const secretBytes = Array.from({ length: 64 }, (_value, index) => index < 32 ? index + 1 : 0);
      await writeFile(keypairPath, `${JSON.stringify(secretBytes)}\n`, "utf8");
      await chmod(keypairPath, 0o600);

      const dogfood = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-blockchain",
        command: "ambient_desktop_pi_dogfood",
        args: ["--json"],
        env: { AMBIENT_BLOCKCHAIN_KEYPAIR_FILE: keypairPath },
      });
      const dogfoodResult = JSON.parse(dogfood.stdout ?? "{}");
      expect(dogfoodResult).toMatchObject({
        status: "passed",
        mutation: "none",
        checks: expect.arrayContaining([
          expect.objectContaining({ id: "manifest_version_matches_script", passed: true }),
          expect.objectContaining({ id: "manifest_exposes_required_commands", passed: true }),
          expect.objectContaining({ id: "skill_progressive_discovery_present", passed: true }),
          expect.objectContaining({ id: "skill_safety_gates_present", passed: true }),
          expect.objectContaining({ id: "doctor_health_check_passed", passed: true }),
        ]),
        discovery: expect.objectContaining({
          requiredCommandsPresent: true,
          missingCommands: [],
          skillFacts: expect.objectContaining({
            mentionsSearch: true,
            mentionsDescribe: true,
            mentionsApprovalVerify: true,
          }),
        }),
        healthCheck: expect.objectContaining({
          parsedStatus: "ready",
          parsedPackageVersion: "0.1.16",
        }),
        redactionFacts: {
          keypairPathsIncluded: false,
          privateKeyBytesIncluded: false,
          secretValuesIncluded: false,
        },
      });
      expect(dogfood.stdout).not.toContain(keypairPath);
      expect(dogfood.stdout).not.toContain(JSON.stringify(secretBytes));
      const dogfoodArtifact = await readFile(join(workspace, dogfoodResult.artifact.relativePath), "utf8");
      expect(dogfoodArtifact).toContain("ambient-desktop-pi-dogfood-v1");
      expect(dogfoodArtifact).not.toContain(keypairPath);
      expect(dogfoodArtifact).not.toContain(JSON.stringify(secretBytes));
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }, 15_000);

  it("reports keypair configuration without leaking the keypair path", async () => {
    const workspace = await installBlockchainPackage();
    try {
      const keypairPath = join(workspace, "chain-keypair.json");
      const secretBytes = Array.from({ length: 64 }, (_value, index) => index < 32 ? index + 1 : 0);
      await writeFile(keypairPath, `${JSON.stringify(secretBytes)}\n`, "utf8");
      await chmod(keypairPath, 0o644);
      const doctorResult = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-blockchain",
        command: "ambient_chain_doctor",
        args: ["--fast", "--json"],
        env: { AMBIENT_BLOCKCHAIN_KEYPAIR_FILE: keypairPath },
      });
      const doctor = JSON.parse(doctorResult.stdout ?? "{}");
      expect(doctor.env).toEqual(expect.arrayContaining([
        expect.objectContaining({
          name: "AMBIENT_BLOCKCHAIN_KEYPAIR_FILE",
          configured: true,
        }),
      ]));
      expect(doctorResult.stdout).not.toContain(keypairPath);

      const status = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-blockchain",
        command: "ambient_keypair_status",
        args: ["--kind", "chain", "--json"],
        env: { AMBIENT_BLOCKCHAIN_KEYPAIR_FILE: keypairPath },
      });
      const keypairStatus = JSON.parse(status.stdout ?? "{}");
      expect(keypairStatus).toMatchObject({
        status: "needs_attention",
        mutation: "none",
        keypairs: [
          expect.objectContaining({
            kind: "chain",
            configured: true,
            valid: true,
            publicKey: "11111111111111111111111111111111",
            pathSha256: sha256(keypairPath),
          }),
        ],
      });
      expect(status.stdout).not.toContain(keypairPath);
      expect(status.stdout).not.toContain(JSON.stringify(secretBytes));
      const keypairArtifact = await readFile(join(workspace, keypairStatus.artifact.relativePath), "utf8");
      expect(keypairArtifact).not.toContain(keypairPath);
      expect(keypairArtifact).not.toContain(JSON.stringify(secretBytes));
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }, 15_000);

  it("blocks generic transaction submission through the RPC command", async () => {
    const workspace = await installBlockchainPackage();
    try {
      await expect(runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-blockchain",
        command: "ambient_chain_rpc",
        args: ["--method", "sendTransaction", "--params-json", "[]", "--json"],
      })).rejects.toThrow(/read-only allowlist/);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }, 15_000);

  it("summarizes transaction logs and program accounts through purpose-built read commands", async () => {
    const workspace = await installBlockchainPackage();
    const rpc = await startMockRpc();
    try {
      const transaction = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-blockchain",
        command: "ambient_chain_transaction",
        args: ["--signature", "demoSig", "--rpc-url", rpc.url, "--json"],
      });
      const transactionResult = JSON.parse(transaction.stdout ?? "{}");
      expect(transactionResult).toMatchObject({
        status: "completed",
        mode: "signature",
        signature: "demoSig",
        summary: {
          exists: true,
          slot: 42,
          logCount: 2,
          logsPreview: ["Program log: hello", "Program success"],
        },
      });
      const transactionArtifact = JSON.parse(await readFile(join(workspace, transactionResult.artifact.relativePath), "utf8"));
      expect(transactionArtifact.rawResponse.result.meta.logMessages).toEqual(["Program log: hello", "Program success"]);

      const history = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-blockchain",
        command: "ambient_chain_transaction",
        args: ["--address", "History111111111111111111111111111111111", "--limit", "2", "--rpc-url", rpc.url, "--json"],
      });
      const historyResult = JSON.parse(history.stdout ?? "{}");
      expect(historyResult).toMatchObject({
        status: "completed",
        mode: "address-history",
        signatureCount: 1,
        signaturesPreview: [expect.objectContaining({ signature: "historySig" })],
      });

      await expect(runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-blockchain",
        command: "ambient_chain_program_observe",
        args: ["--program-id", "Program111111111111111111111111111111111", "--rpc-url", rpc.url, "--json"],
      })).rejects.toThrow(/requires --filters-json/);

      const program = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-blockchain",
        command: "ambient_chain_program_observe",
        args: [
          "--program-id",
          "Program111111111111111111111111111111111",
          "--filters-json",
          "[{\"dataSize\":8}]",
          "--data-slice-length",
          "8",
          "--limit",
          "1",
          "--rpc-url",
          rpc.url,
          "--json",
        ],
      });
      const programResult = JSON.parse(program.stdout ?? "{}");
      expect(programResult).toMatchObject({
        status: "completed",
        accountCount: 2,
        previewCount: 1,
        truncated: true,
        accountSummariesPreview: [
          expect.objectContaining({
            pubkey: "ProgramAccount1",
            account: expect.objectContaining({ owner: "Program111111111111111111111111111111111" }),
          }),
        ],
      });
      const programArtifact = JSON.parse(await readFile(join(workspace, programResult.artifact.relativePath), "utf8"));
      expect(programArtifact.rawResponse.result).toHaveLength(2);
      expect(rpc.calls.map((call) => call.method)).toEqual([
        "getTransaction",
        "getSignaturesForAddress",
        "getProgramAccounts",
      ]);
    } finally {
      await rpc.close();
      await rm(workspace, { recursive: true, force: true });
    }
  }, 15_000);

  it("scaffolds and validates a local Ambient program workbench with full log artifacts", async () => {
    const workspace = await installBlockchainPackage();
    try {
      const scaffold = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-blockchain",
        command: "ambient_program_scaffold",
        args: ["--project-dir", "programs/counter", "--template", "native-rust", "--name", "ambient-counter", "--json"],
      });
      const scaffoldResult = JSON.parse(scaffold.stdout ?? "{}");
      expect(scaffoldResult).toMatchObject({
        status: "scaffolded",
        template: "native-rust",
        projectRelativePath: "programs/counter",
        crateName: "ambient_counter",
        createdFiles: expect.arrayContaining([
          expect.objectContaining({ relativePath: "programs/counter/Cargo.toml" }),
          expect.objectContaining({ relativePath: "programs/counter/src/lib.rs" }),
          expect.objectContaining({ relativePath: "programs/counter/README.md" }),
        ]),
      });
      await expect(readFile(join(workspace, "programs/counter/Cargo.toml"), "utf8")).resolves.toContain("name = \"ambient_counter\"");
      await expect(readFile(join(workspace, "programs/counter/src/lib.rs"), "utf8")).resolves.toContain("ambient_entrypoint_preview");

      const build = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-blockchain",
        command: "ambient_program_build",
        args: ["--project-dir", "programs/counter", "--json"],
        env: { AMBIENT_BLOCKCHAIN_FAKE_CARGO: "1" },
      });
      const buildResult = JSON.parse(build.stdout ?? "{}");
      expect(buildResult).toMatchObject({
        status: "passed",
        mode: "build",
        fake: true,
        projectRelativePath: "programs/counter",
        command: ["cargo", "build"],
      });
      const buildArtifact = JSON.parse(await readFile(join(workspace, buildResult.artifact.relativePath), "utf8"));
      expect(buildArtifact.stdout).toContain("fake cargo build passed");

      const test = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-blockchain",
        command: "ambient_program_test",
        args: ["--project-dir", "programs/counter", "--json"],
        env: { AMBIENT_BLOCKCHAIN_FAKE_CARGO: "1" },
      });
      const testResult = JSON.parse(test.stdout ?? "{}");
      expect(testResult).toMatchObject({
        status: "passed",
        mode: "test",
        fake: true,
        projectRelativePath: "programs/counter",
        command: ["cargo", "test"],
      });
      const testArtifact = JSON.parse(await readFile(join(workspace, testResult.artifact.relativePath), "utf8"));
      expect(testArtifact.stdout).toContain("fake cargo test passed");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }, 15_000);

  it("writes Markdown live-gate evidence and exercises the local validator lifecycle gate", async () => {
    const workspace = await installBlockchainPackage();
    try {
      const validator = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-blockchain",
        command: "ambient_local_validator_gate",
        args: ["--start-validator", "--validator-duration-ms", "250", "--fake", "--json"],
      });
      const validatorResult = JSON.parse(validator.stdout ?? "{}");
      expect(validatorResult).toMatchObject({
        status: "passed",
        mutation: "local-validator-process",
        fake: true,
        command: expect.arrayContaining(["solana-test-validator", "--reset", "--ledger", "<VALIDATOR_LEDGER_DIR>"]),
        checks: expect.arrayContaining([
          expect.objectContaining({ id: "validator_binary_present", passed: true }),
          expect.objectContaining({ id: "start_explicitly_requested", passed: true }),
        ]),
      });
      const validatorArtifact = await readFile(join(workspace, validatorResult.artifact.relativePath), "utf8");
      expect(validatorArtifact).toContain("fake solana-test-validator started");
      expect(validatorArtifact).toContain("<VALIDATOR_LEDGER_DIR>");
      expect(validatorArtifact).not.toContain(join(workspace, ".ambient", "blockchain", "validator", "ledger"));

      const liveGate = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-blockchain",
        command: "ambient_blockchain_live_gate",
        args: ["--desktop-pi", "--local-validator", "--start-validator", "--validator-duration-ms", "250", "--fake", "--json"],
      });
      const liveGateResult = JSON.parse(liveGate.stdout ?? "{}");
      expect(liveGateResult).toMatchObject({
        status: "completed",
        lanes: expect.arrayContaining([
          expect.objectContaining({
            id: "desktop-pi",
            status: "passed",
          }),
          expect.objectContaining({
            id: "local-validator",
            status: "passed",
          }),
        ]),
        markdownArtifact: expect.objectContaining({
          relativePath: expect.stringMatching(/\.md$/),
        }),
      });
      const liveGateJson = JSON.parse(await readFile(join(workspace, liveGateResult.artifact.relativePath), "utf8"));
      const validatorEvidence = liveGateJson.evidenceIndex.lanes.find((lane: { id: string }) => lane.id === "local-validator");
      expect(liveGateJson.lanes).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: "desktop-pi",
          status: "passed",
          details: expect.objectContaining({
            status: "passed",
            mutation: "none",
          }),
        }),
        expect.objectContaining({
          id: "local-validator",
          status: "passed",
          artifact: expect.objectContaining({
            relativePath: expect.stringContaining(".ambient/blockchain/validator/"),
          }),
          details: expect.objectContaining({
            fake: true,
            stdout: expect.stringContaining("fake solana-test-validator started"),
          }),
        }),
      ]));
      expect(validatorEvidence).toMatchObject({
        status: "passed",
        artifactCount: 1,
        artifacts: [
          expect.objectContaining({
            relativePath: expect.stringContaining(".ambient/blockchain/validator/"),
            sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          }),
        ],
      });
      const indexedValidatorArtifact = await readFile(join(workspace, validatorEvidence.artifacts[0].relativePath), "utf8");
      expect(indexedValidatorArtifact).toContain("fake solana-test-validator started");
      expect(indexedValidatorArtifact).toContain("<VALIDATOR_LEDGER_DIR>");
      expect(indexedValidatorArtifact).not.toContain(join(workspace, ".ambient", "blockchain", "validator", "ledger"));
      const liveGateMarkdown = await readFile(join(workspace, liveGateResult.markdownArtifact.relativePath), "utf8");
      expect(liveGateMarkdown).toContain("# Ambient Blockchain Live Gate Evidence");
      expect(liveGateMarkdown).toContain("| desktop-pi | passed |");
      expect(liveGateMarkdown).toContain("| local-validator | passed |");
      expect(liveGateMarkdown).toContain("JSON artifact:");
      expect(liveGateMarkdown).toContain("Keypair paths included: false");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }, 15_000);

  it("runs the program workbench live-gate lifecycle with approved fake deploy evidence", async () => {
    const workspace = await installBlockchainPackage();
    try {
      const keypairPath = join(workspace, "live-gate-program-keypair.json");
      const secretBytes = Array.from({ length: 64 }, (_value, index) => index < 32 ? index + 1 : 0);
      await writeFile(keypairPath, `${JSON.stringify(secretBytes)}\n`, "utf8");
      await chmod(keypairPath, 0o600);

      const liveGate = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-blockchain",
        command: "ambient_blockchain_live_gate",
        args: [
          "--program",
          "--program-lifecycle",
          "--program-deploy",
          "--program-template",
          "native-rust",
          "--program-name",
          "ambient-live-gate",
          "--program-max-lamports",
          "5000",
          "--program-id",
          "LiveGateProgram1111111111111111111111111111111",
          "--program-observe",
          "--fake",
          "--json",
        ],
        env: { AMBIENT_BLOCKCHAIN_KEYPAIR_FILE: keypairPath },
      });
      const liveGateResult = JSON.parse(liveGate.stdout ?? "{}");
      expect(liveGateResult).toMatchObject({
        status: "completed",
        lanes: expect.arrayContaining([
          expect.objectContaining({
            id: "program-workbench",
            status: "observed",
          }),
        ]),
      });
      expect(liveGate.stdout).not.toContain(keypairPath);
      expect(liveGate.stdout).not.toContain(JSON.stringify(secretBytes));

      const liveGateJsonText = await readFile(join(workspace, liveGateResult.artifact.relativePath), "utf8");
      const liveGateJson = JSON.parse(liveGateJsonText);
      const programLane = liveGateJson.lanes.find((lane: { id: string }) => lane.id === "program-workbench");
      const programEvidence = liveGateJson.evidenceIndex.lanes.find((lane: { id: string }) => lane.id === "program-workbench");
      expect(programLane).toMatchObject({
        status: "observed",
        lifecycleRequested: true,
        template: "native-rust",
        fakeCargo: true,
        scaffold: {
          parsed: expect.objectContaining({
            status: "scaffolded",
            template: "native-rust",
            crateName: "ambient_live_gate",
          }),
        },
        build: {
          parsed: expect.objectContaining({
            status: "passed",
            mode: "build",
            fake: true,
          }),
        },
        test: {
          parsed: expect.objectContaining({
            status: "passed",
            mode: "test",
            fake: true,
          }),
        },
        deployPlan: {
          parsed: expect.objectContaining({
            status: "planned",
            mutation: "none",
            maxLamports: 5000,
          }),
        },
        deploy: {
          parsed: expect.objectContaining({
            status: "deployed",
            mutation: "chain-transaction",
            fake: true,
            signature: "FAKE_DEPLOY_SIGNATURE",
            program: expect.objectContaining({
              programId: "LiveGateProgram1111111111111111111111111111111",
            }),
          }),
        },
        observe: {
          parsed: expect.objectContaining({
            status: "completed",
            fake: true,
            programId: "LiveGateProgram1111111111111111111111111111111",
            accountCount: 1,
          }),
        },
      });
      expect(programLane.binary).toEqual(expect.objectContaining({
        relativePath: expect.stringContaining("target/deploy/live_gate_program.so"),
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }));
      expect(programEvidence).toMatchObject({
        status: "observed",
        artifactCount: expect.any(Number),
        signatures: expect.arrayContaining(["FAKE_DEPLOY_SIGNATURE"]),
        costs: {
          maxLamports: 5000,
          binaryBytes: expect.any(Number),
        },
      });
      expect(programEvidence.artifactCount).toBeGreaterThanOrEqual(6);
      expect(liveGateJsonText).toContain("fake cargo build passed");
      expect(liveGateJsonText).toContain("fake cargo test passed");
      expect(liveGateJsonText).toContain("fake solana program deploy passed");
      expect(liveGateJsonText).toContain("FAKE_PROGRAM_ACCOUNT");
      expect(liveGateJsonText).not.toContain(keypairPath);
      expect(liveGateJsonText).not.toContain(JSON.stringify(secretBytes));
      const liveGateMarkdown = await readFile(join(workspace, liveGateResult.markdownArtifact.relativePath), "utf8");
      expect(liveGateMarkdown).toContain("| program-workbench | observed |");
      expect(liveGateMarkdown).toContain("## Evidence Index");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }, 20_000);

  it("creates bounded oracle and program planning artifacts without mutating chain state", async () => {
    const workspace = await installBlockchainPackage();
    try {
      const prompt = "ambient oracle plan prompt should only appear in the artifact";
      const keypairPath = join(workspace, "approved-keypair.json");
      const secretBytes = Array.from({ length: 64 }, (_value, index) => index < 32 ? index + 1 : 0);
      await writeFile(keypairPath, `${JSON.stringify(secretBytes)}\n`, "utf8");
      await chmod(keypairPath, 0o600);
      const oracle = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-blockchain",
        command: "ambient_oracle_request_plan",
        args: ["--prompt", prompt, "--escrow-lamports", "1000", "--max-lamports", "2000", "--json"],
        env: { AMBIENT_BLOCKCHAIN_KEYPAIR_FILE: keypairPath },
      });
      const oracleResult = JSON.parse(oracle.stdout ?? "{}");
      expect(oracleResult).toMatchObject({
        status: "planned",
        mutation: "none",
        promptSha256: sha256(prompt),
        escrowLamports: 1000,
        maxLamports: 2000,
        signerConfigured: true,
        signerPublicKey: "11111111111111111111111111111111",
        approvalSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        approvalCopy: expect.stringContaining("Approve Tool Oracle request"),
      });
      expect(oracle.stdout).not.toContain(prompt);
      const oracleArtifact = JSON.parse(await readFile(join(workspace, oracleResult.artifact.relativePath), "utf8"));
      expect(oracleArtifact.prompt).toBe(prompt);
      expect(oracleArtifact.approval.promptSha256).toBe(sha256(prompt));
      expect(oracleArtifact.approvalSha256).toBe(oracleResult.approvalSha256);
      expect(oracleArtifact.nextCommand).toContain("does not sign or submit");
      const verified = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-blockchain",
        command: "ambient_approval_verify",
        args: [
          "--plan-artifact",
          oracleResult.artifact.relativePath,
          "--approval-sha256",
          oracleResult.approvalSha256,
          "--max-lamports",
          "2000",
          "--require-signer",
          "--json",
        ],
        env: { AMBIENT_BLOCKCHAIN_KEYPAIR_FILE: keypairPath },
      });
      const verifiedResult = JSON.parse(verified.stdout ?? "{}");
      expect(verifiedResult).toMatchObject({
        status: "verified",
        mutation: "none",
        approvalAction: "tool_oracle_request",
        approvalSha256: oracleResult.approvalSha256,
        checks: expect.arrayContaining([
          expect.objectContaining({ id: "approval_digest_matches_expected", passed: true }),
          expect.objectContaining({ id: "signer_public_key_matches_plan", passed: true }),
          expect.objectContaining({ id: "signer_path_hash_matches_plan", passed: true }),
        ]),
      });
      expect(verified.stdout).not.toContain(prompt);
      expect(verified.stdout).not.toContain(keypairPath);
      const verifiedArtifact = await readFile(join(workspace, verifiedResult.artifact.relativePath), "utf8");
      expect(verifiedArtifact).not.toContain(prompt);
      expect(verifiedArtifact).not.toContain(keypairPath);
      expect(verifiedArtifact).not.toContain(JSON.stringify(secretBytes));

      const blocked = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-blockchain",
        command: "ambient_approval_verify",
        args: [
          "--plan-artifact",
          oracleResult.artifact.relativePath,
          "--approval-sha256",
          "0".repeat(64),
          "--max-lamports",
          "2000",
          "--require-signer",
          "--json",
        ],
        env: { AMBIENT_BLOCKCHAIN_KEYPAIR_FILE: keypairPath },
      });
      const blockedResult = JSON.parse(blocked.stdout ?? "{}");
      expect(blockedResult).toMatchObject({
        status: "blocked",
        checks: expect.arrayContaining([
          expect.objectContaining({ id: "approval_digest_matches_expected", passed: false }),
        ]),
      });

      const x402 = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-blockchain",
        command: "ambient_x402_quote",
        args: ["--endpoint", "https://jumpgate.ambient.xyz/paid/chat/v2", "--max-lamports", "10", "--max-micro-usdc", "2500", "--json"],
      });
      const x402Result = JSON.parse(x402.stdout ?? "{}");
      expect(x402Result).toMatchObject({
        status: "planned",
        mutation: "none",
        maxLamports: 10,
        maxMicroUsdc: 2500,
        approvalSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        approvalCopy: expect.stringContaining("Approve x402 paid request"),
      });
      const x402Artifact = JSON.parse(await readFile(join(workspace, x402Result.artifact.relativePath), "utf8"));
      expect(x402Artifact.approval.maxMicroUsdc).toBe(2500);
      expect(x402Artifact.approvalSha256).toBe(x402Result.approvalSha256);

      await mkdir(join(workspace, "target", "deploy"), { recursive: true });
      const binaryPath = join(workspace, "target", "deploy", "demo.so");
      await writeFile(binaryPath, "demo program bytes", "utf8");
      const program = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-blockchain",
        command: "ambient_program_deploy_plan",
        args: ["--binary", "target/deploy/demo.so", "--max-lamports", "5000", "--json"],
      });
      const programResult = JSON.parse(program.stdout ?? "{}");
      expect(programResult).toMatchObject({
        status: "planned",
        mutation: "none",
        maxLamports: 5000,
        signerConfigured: false,
        approvalSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        approvalCopy: expect.stringContaining("Approve Ambient program deploy"),
        program: {
          binaryRelativePath: "target/deploy/demo.so",
          sha256: sha256("demo program bytes"),
        },
      });
      const programArtifact = JSON.parse(await readFile(join(workspace, programResult.artifact.relativePath), "utf8"));
      expect(programArtifact.approval.binarySha256).toBe(sha256("demo program bytes"));
      expect(programArtifact.approvalSha256).toBe(programResult.approvalSha256);
      expect(programArtifact.nextCommand).toContain("does not sign or submit");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }, 15_000);

  it("runs approved Tool Oracle submit, wait, decode, and reclaim with redacted evidence", async () => {
    const workspace = await installBlockchainPackage();
    const rpc = await startMockRpc();
    try {
      const prompt = "tool oracle lifecycle prompt should stay out of stdout";
      const keypairPath = join(workspace, "oracle-keypair.json");
      const secretBytes = Array.from({ length: 64 }, (_value, index) => index < 32 ? index + 1 : 0);
      await writeFile(keypairPath, `${JSON.stringify(secretBytes)}\n`, "utf8");
      await chmod(keypairPath, 0o600);
      const plan = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-blockchain",
        command: "ambient_oracle_request_plan",
        args: ["--prompt", prompt, "--escrow-lamports", "1000", "--max-lamports", "2000", "--max-responses", "2", "--json"],
        env: { AMBIENT_BLOCKCHAIN_KEYPAIR_FILE: keypairPath },
      });
      const planResult = JSON.parse(plan.stdout ?? "{}");

      const submit = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-blockchain",
        command: "ambient_oracle_request_submit",
        args: [
          "--plan-artifact",
          planResult.artifact.relativePath,
          "--approval-sha256",
          planResult.approvalSha256,
          "--max-lamports",
          "2000",
          "--require-signer",
          "--json",
        ],
        env: {
          AMBIENT_BLOCKCHAIN_KEYPAIR_FILE: keypairPath,
          AMBIENT_ORACLE_FAKE_CLIENT: "1",
        },
      });
      const submitResult = JSON.parse(submit.stdout ?? "{}");
      expect(submitResult).toMatchObject({
        status: "submitted",
        mutation: "chain-transaction",
        fake: true,
        requestAccount: "FAKE_ORACLE_REQUEST_ACCOUNT",
        signature: "FAKE_ORACLE_SIGNATURE",
        oracle: {
          promptSha256: sha256(prompt),
          escrowLamports: 1000,
          maxLamports: 2000,
          maxResponses: 2,
        },
        checks: expect.arrayContaining([
          expect.objectContaining({ id: "plan_is_tool_oracle_request", passed: true }),
          expect.objectContaining({ id: "prompt_hash_matches_plan", passed: true }),
          expect.objectContaining({ id: "keypair_env_available", passed: true }),
        ]),
      });
      expect(submit.stdout).not.toContain(prompt);
      expect(submit.stdout).not.toContain(keypairPath);
      expect(submit.stdout).not.toContain(JSON.stringify(secretBytes));
      const submitArtifact = await readFile(join(workspace, submitResult.artifact.relativePath), "utf8");
      expect(submitArtifact).toContain("FAKE_ORACLE_SIGNATURE");
      expect(submitArtifact).not.toContain(prompt);
      expect(submitArtifact).not.toContain(keypairPath);
      expect(submitArtifact).not.toContain(JSON.stringify(secretBytes));

      const wait = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-blockchain",
        command: "ambient_oracle_request_wait",
        args: [
          "--submit-artifact",
          submitResult.artifact.relativePath,
          "--rpc-url",
          rpc.url,
          "--max-attempts",
          "1",
          "--json",
        ],
      });
      const waitResult = JSON.parse(wait.stdout ?? "{}");
      expect(waitResult).toMatchObject({
        status: "terminal",
        mutation: "none",
        requestAccount: "FAKE_ORACLE_REQUEST_ACCOUNT",
        attempts: 1,
        latest: {
          exists: true,
          decoded: expect.objectContaining({
            state: "Completed",
            output: "42.00",
            terminal: true,
          }),
        },
      });

      const decode = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-blockchain",
        command: "ambient_oracle_response_decode",
        args: ["--wait-artifact", waitResult.artifact.relativePath, "--json"],
      });
      const decodeResult = JSON.parse(decode.stdout ?? "{}");
      expect(decodeResult).toMatchObject({
        status: "decoded",
        mutation: "none",
        requestAccount: "FAKE_ORACLE_REQUEST_ACCOUNT",
        decoded: expect.objectContaining({
          state: "Completed",
          output: "42.00",
          terminal: true,
        }),
      });

      const reclaimPlan = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-blockchain",
        command: "ambient_oracle_reclaim_plan",
        args: [
          "--submit-artifact",
          submitResult.artifact.relativePath,
          "--max-lamports",
          "500",
          "--json",
        ],
        env: { AMBIENT_BLOCKCHAIN_KEYPAIR_FILE: keypairPath },
      });
      const reclaimPlanResult = JSON.parse(reclaimPlan.stdout ?? "{}");
      expect(reclaimPlanResult).toMatchObject({
        status: "planned",
        mutation: "none",
        requestAccount: "FAKE_ORACLE_REQUEST_ACCOUNT",
        signerConfigured: true,
        approvalCopy: expect.stringContaining("Approve Tool Oracle reclaim"),
      });

      const reclaim = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-blockchain",
        command: "ambient_oracle_reclaim_execute",
        args: [
          "--plan-artifact",
          reclaimPlanResult.artifact.relativePath,
          "--approval-sha256",
          reclaimPlanResult.approvalSha256,
          "--max-lamports",
          "500",
          "--require-signer",
          "--json",
        ],
        env: {
          AMBIENT_BLOCKCHAIN_KEYPAIR_FILE: keypairPath,
          AMBIENT_ORACLE_FAKE_CLIENT: "1",
        },
      });
      const reclaimResult = JSON.parse(reclaim.stdout ?? "{}");
      expect(reclaimResult).toMatchObject({
        status: "reclaimed",
        mutation: "chain-transaction",
        fake: true,
        requestAccount: "FAKE_ORACLE_REQUEST_ACCOUNT",
        signature: "FAKE_ORACLE_RECLAIM_SIGNATURE",
        checks: expect.arrayContaining([
          expect.objectContaining({ id: "plan_is_oracle_reclaim", passed: true }),
          expect.objectContaining({ id: "request_account_present", passed: true }),
        ]),
      });
      expect(reclaim.stdout).not.toContain(keypairPath);
      const reclaimArtifact = await readFile(join(workspace, reclaimResult.artifact.relativePath), "utf8");
      expect(reclaimArtifact).toContain("FAKE_ORACLE_RECLAIM_SIGNATURE");
      expect(reclaimArtifact).not.toContain(keypairPath);
      expect(reclaimArtifact).not.toContain(JSON.stringify(secretBytes));

      const blocked = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-blockchain",
        command: "ambient_oracle_reclaim_execute",
        args: [
          "--plan-artifact",
          reclaimPlanResult.artifact.relativePath,
          "--approval-sha256",
          "0".repeat(64),
          "--max-lamports",
          "500",
          "--require-signer",
          "--json",
        ],
        env: {
          AMBIENT_BLOCKCHAIN_KEYPAIR_FILE: keypairPath,
          AMBIENT_ORACLE_FAKE_CLIENT: "1",
        },
      });
      const blockedResult = JSON.parse(blocked.stdout ?? "{}");
      expect(blockedResult).toMatchObject({
        status: "blocked",
        mutation: "none",
        checks: expect.arrayContaining([
          expect.objectContaining({ id: "approval_digest_matches_expected", passed: false }),
        ]),
      });
      const blockedArtifact = await readFile(join(workspace, blockedResult.artifact.relativePath), "utf8");
      expect(blockedArtifact).not.toContain("fake oracle reclaim passed");
      expect(blockedArtifact).not.toContain(keypairPath);
      expect(rpc.calls.map((call) => call.method)).toContain("getAccountInfo");
    } finally {
      await rpc.close();
      await rm(workspace, { recursive: true, force: true });
    }
  }, 15_000);

  it("runs the Tool Oracle funded live-gate lane with lifecycle and cleanup evidence", async () => {
    const workspace = await installBlockchainPackage();
    try {
      const prompt = "live gate oracle prompt should stay out of gate output";
      const keypairPath = join(workspace, "live-gate-oracle-keypair.json");
      const secretBytes = Array.from({ length: 64 }, (_value, index) => index < 32 ? index + 1 : 0);
      await writeFile(keypairPath, `${JSON.stringify(secretBytes)}\n`, "utf8");
      await chmod(keypairPath, 0o600);

      const liveGate = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-blockchain",
        command: "ambient_blockchain_live_gate",
        args: [
          "--oracle",
          "--oracle-funded",
          "--prompt",
          prompt,
          "--escrow-lamports",
          "1000",
          "--max-lamports",
          "2000",
          "--max-responses",
          "2",
          "--oracle-max-attempts",
          "1",
          "--oracle-fake-wait",
          "--oracle-reclaim-max-lamports",
          "500",
          "--fake",
          "--json",
        ],
        env: { AMBIENT_BLOCKCHAIN_KEYPAIR_FILE: keypairPath },
      });
      const liveGateResult = JSON.parse(liveGate.stdout ?? "{}");
      expect(liveGateResult).toMatchObject({
        status: "completed",
        lanes: expect.arrayContaining([
          expect.objectContaining({
            id: "oracle-funded",
            status: "reclaimed",
          }),
        ]),
      });
      expect(liveGate.stdout).not.toContain(prompt);
      expect(liveGate.stdout).not.toContain(keypairPath);
      expect(liveGate.stdout).not.toContain(JSON.stringify(secretBytes));

      const liveGateJsonText = await readFile(join(workspace, liveGateResult.artifact.relativePath), "utf8");
      const liveGateJson = JSON.parse(liveGateJsonText);
      const oracleLane = liveGateJson.lanes.find((lane: { id: string }) => lane.id === "oracle-funded");
      const oracleEvidence = liveGateJson.evidenceIndex.lanes.find((lane: { id: string }) => lane.id === "oracle-funded");
      expect(oracleLane).toMatchObject({
        status: "reclaimed",
        fundedRequested: true,
        promptSha256: sha256(prompt),
        escrowLamports: 1000,
        maxLamports: 2000,
        maxResponses: 2,
        planArtifact: expect.objectContaining({
          relativePath: expect.stringContaining(".ambient/blockchain/oracle/"),
        }),
        submit: {
          parsed: expect.objectContaining({
            status: "submitted",
            mutation: "chain-transaction",
            fake: true,
            signature: "FAKE_ORACLE_SIGNATURE",
            requestAccount: "FAKE_ORACLE_REQUEST_ACCOUNT",
          }),
        },
        wait: {
          parsed: expect.objectContaining({
            status: "terminal",
            fake: true,
            requestAccount: "FAKE_ORACLE_REQUEST_ACCOUNT",
            latest: expect.objectContaining({
              decoded: expect.objectContaining({
                state: "Completed",
                output: "42.00",
                terminal: true,
              }),
            }),
          }),
        },
        decode: {
          parsed: expect.objectContaining({
            status: "decoded",
            decoded: expect.objectContaining({
              state: "Completed",
              output: "42.00",
            }),
          }),
        },
        reclaimPlan: {
          parsed: expect.objectContaining({
            status: "planned",
            requestAccount: "FAKE_ORACLE_REQUEST_ACCOUNT",
            maxLamports: 500,
          }),
        },
        reclaim: {
          parsed: expect.objectContaining({
            status: "reclaimed",
            mutation: "chain-transaction",
            fake: true,
            signature: "FAKE_ORACLE_RECLAIM_SIGNATURE",
          }),
        },
      });
      expect(oracleEvidence).toMatchObject({
        status: "reclaimed",
        artifactCount: expect.any(Number),
        signatures: expect.arrayContaining(["FAKE_ORACLE_SIGNATURE", "FAKE_ORACLE_RECLAIM_SIGNATURE"]),
        costs: {
          escrowLamports: 1000,
          maxLamports: 2000,
          reclaimMaxLamports: 500,
        },
      });
      expect(oracleEvidence.artifactCount).toBeGreaterThanOrEqual(5);
      expect(liveGateJsonText).not.toContain(prompt);
      expect(liveGateJsonText).not.toContain(keypairPath);
      expect(liveGateJsonText).not.toContain(JSON.stringify(secretBytes));
      const liveGateMarkdown = await readFile(join(workspace, liveGateResult.markdownArtifact.relativePath), "utf8");
      expect(liveGateMarkdown).toContain("| oracle-funded | reclaimed |");
      expect(liveGateMarkdown).toContain("## Evidence Index");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }, 20_000);

  it("executes an approved x402 request with receipt evidence and payment redaction", async () => {
    const workspace = await installBlockchainPackage();
    const paidEndpoint = await startMockPaidEndpoint();
    try {
      const keypairPath = join(workspace, "x402-keypair.json");
      const secretBytes = Array.from({ length: 64 }, (_value, index) => index < 32 ? index + 1 : 0);
      await writeFile(keypairPath, `${JSON.stringify(secretBytes)}\n`, "utf8");
      await chmod(keypairPath, 0o600);
      const paymentHeaderPath = join(workspace, "x402-payment-header.txt");
      const paymentHeader = "PAYMENT_SECRET_ONCE";
      await writeFile(paymentHeaderPath, `${paymentHeader}\n`, "utf8");
      await chmod(paymentHeaderPath, 0o600);

      const quote = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-blockchain",
        command: "ambient_x402_quote",
        args: [
          "--endpoint",
          paidEndpoint.url,
          "--method",
          "POST",
          "--max-lamports",
          "10",
          "--max-micro-usdc",
          "2500",
          "--json",
        ],
        env: { AMBIENT_X402_KEYPAIR_FILE: keypairPath },
      });
      const quoteResult = JSON.parse(quote.stdout ?? "{}");
      expect(quoteResult).toMatchObject({
        status: "planned",
        signerConfigured: true,
        maxLamports: 10,
        maxMicroUsdc: 2500,
        approvalSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      });

      const execute = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-blockchain",
        command: "ambient_x402_request_execute",
        args: [
          "--quote-artifact",
          quoteResult.artifact.relativePath,
          "--approval-sha256",
          quoteResult.approvalSha256,
          "--max-lamports",
          "10",
          "--max-micro-usdc",
          "2500",
          "--payment-header-file",
          "x402-payment-header.txt",
          "--body",
          "{\"message\":\"hello\"}",
          "--json",
        ],
        env: { AMBIENT_X402_KEYPAIR_FILE: keypairPath },
      });
      const executeResult = JSON.parse(execute.stdout ?? "{}");
      expect(executeResult).toMatchObject({
        status: "paid",
        mutation: "paid-http-request",
        endpoint: paidEndpoint.url,
        method: "POST",
        httpStatus: 200,
        payment: {
          valid: true,
          headerSha256: sha256(paymentHeader),
          sourcePathSha256: sha256(paymentHeaderPath),
        },
        checks: expect.arrayContaining([
          expect.objectContaining({ id: "approval_digest_matches_expected", passed: true }),
          expect.objectContaining({ id: "max_micro_usdc_cap", passed: true }),
          expect.objectContaining({ id: "payment_header_configured", passed: true }),
        ]),
      });
      expect(paidEndpoint.calls).toHaveLength(1);
      expect(paidEndpoint.calls[0]).toMatchObject({
        method: "POST",
        paymentHeader,
        body: "{\"message\":\"hello\"}",
      });
      expect(execute.stdout).not.toContain(paymentHeader);
      expect(execute.stdout).not.toContain(paymentHeaderPath);
      expect(execute.stdout).not.toContain(keypairPath);
      expect(execute.stdout).not.toContain(JSON.stringify(secretBytes));
      const executeArtifact = await readFile(join(workspace, executeResult.artifact.relativePath), "utf8");
      expect(executeArtifact).toContain("x402 response body");
      expect(executeArtifact).toContain("x-payment-receipt");
      expect(executeArtifact).toContain("<redacted:x-payment>");
      expect(executeArtifact).not.toContain(paymentHeader);
      expect(executeArtifact).not.toContain(paymentHeaderPath);
      expect(executeArtifact).not.toContain(keypairPath);
      expect(executeArtifact).not.toContain(JSON.stringify(secretBytes));

      const blocked = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-blockchain",
        command: "ambient_x402_request_execute",
        args: [
          "--quote-artifact",
          quoteResult.artifact.relativePath,
          "--approval-sha256",
          "0".repeat(64),
          "--max-lamports",
          "10",
          "--max-micro-usdc",
          "2500",
          "--payment-header-file",
          "x402-payment-header.txt",
          "--json",
        ],
        env: { AMBIENT_X402_KEYPAIR_FILE: keypairPath },
      });
      const blockedResult = JSON.parse(blocked.stdout ?? "{}");
      expect(blockedResult).toMatchObject({
        status: "blocked",
        mutation: "none",
        checks: expect.arrayContaining([
          expect.objectContaining({ id: "approval_digest_matches_expected", passed: false }),
        ]),
      });
      expect(paidEndpoint.calls).toHaveLength(1);
      const blockedArtifact = await readFile(join(workspace, blockedResult.artifact.relativePath), "utf8");
      expect(blockedArtifact).not.toContain(paymentHeader);
      expect(blockedArtifact).not.toContain(paymentHeaderPath);
    } finally {
      await paidEndpoint.close();
      await rm(workspace, { recursive: true, force: true });
    }
  }, 15_000);

  it("runs the x402 paid live-gate lane with receipt evidence and payment redaction", async () => {
    const workspace = await installBlockchainPackage();
    const paidEndpoint = await startMockPaidEndpoint();
    try {
      const keypairPath = join(workspace, "live-gate-x402-keypair.json");
      const secretBytes = Array.from({ length: 64 }, (_value, index) => index < 32 ? index + 1 : 0);
      await writeFile(keypairPath, `${JSON.stringify(secretBytes)}\n`, "utf8");
      await chmod(keypairPath, 0o600);
      const paymentHeaderPath = join(workspace, "live-gate-x402-payment-header.txt");
      const paymentHeader = "LIVE_GATE_PAYMENT_SECRET_ONCE";
      await writeFile(paymentHeaderPath, `${paymentHeader}\n`, "utf8");
      await chmod(paymentHeaderPath, 0o600);

      const liveGate = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-blockchain",
        command: "ambient_blockchain_live_gate",
        args: [
          "--x402",
          "--x402-paid",
          "--endpoint",
          paidEndpoint.url,
          "--method",
          "POST",
          "--max-lamports",
          "10",
          "--max-micro-usdc",
          "2500",
          "--payment-header-file",
          "live-gate-x402-payment-header.txt",
          "--body",
          "{\"message\":\"live gate paid request\"}",
          "--json",
        ],
        env: { AMBIENT_X402_KEYPAIR_FILE: keypairPath },
      });
      const liveGateResult = JSON.parse(liveGate.stdout ?? "{}");
      expect(liveGateResult).toMatchObject({
        status: "completed",
        lanes: expect.arrayContaining([
          expect.objectContaining({
            id: "x402-funded",
            status: "paid",
          }),
        ]),
      });
      expect(paidEndpoint.calls).toHaveLength(1);
      expect(paidEndpoint.calls[0]).toMatchObject({
        method: "POST",
        paymentHeader,
        body: "{\"message\":\"live gate paid request\"}",
      });
      expect(liveGate.stdout).not.toContain(paymentHeader);
      expect(liveGate.stdout).not.toContain(paymentHeaderPath);
      expect(liveGate.stdout).not.toContain(keypairPath);
      expect(liveGate.stdout).not.toContain(JSON.stringify(secretBytes));

      const liveGateJsonText = await readFile(join(workspace, liveGateResult.artifact.relativePath), "utf8");
      const liveGateJson = JSON.parse(liveGateJsonText);
      const x402Lane = liveGateJson.lanes.find((lane: { id: string }) => lane.id === "x402-funded");
      const x402Evidence = liveGateJson.evidenceIndex.lanes.find((lane: { id: string }) => lane.id === "x402-funded");
      expect(x402Lane).toMatchObject({
        status: "paid",
        paidRequested: true,
        quoteArtifact: expect.objectContaining({
          relativePath: expect.stringContaining(".ambient/blockchain/x402/"),
        }),
        execution: {
          command: expect.arrayContaining(["--payment-header-file", "<X402_PAYMENT_HEADER_FILE>"]),
          result: expect.objectContaining({
            status: "paid",
            mutation: "paid-http-request",
            payment: expect.objectContaining({
              valid: true,
              headerSha256: sha256(paymentHeader),
              sourcePathSha256: sha256(paymentHeaderPath),
            }),
            responsePreview: expect.objectContaining({
              text: expect.stringContaining("x402 response body"),
            }),
          }),
        },
      });
      expect(x402Evidence).toMatchObject({
        status: "paid",
        artifactCount: expect.any(Number),
        receipts: expect.arrayContaining(["receipt-123"]),
        costs: {
          maxLamports: 10,
          maxMicroUsdc: 2500,
          httpStatus: 200,
        },
      });
      expect(x402Evidence.artifactCount).toBeGreaterThanOrEqual(2);
      expect(liveGateJsonText).toContain("x-payment-receipt");
      expect(liveGateJsonText).not.toContain(paymentHeader);
      expect(liveGateJsonText).not.toContain(paymentHeaderPath);
      expect(liveGateJsonText).not.toContain(keypairPath);
      expect(liveGateJsonText).not.toContain(JSON.stringify(secretBytes));
      const liveGateMarkdown = await readFile(join(workspace, liveGateResult.markdownArtifact.relativePath), "utf8");
      expect(liveGateMarkdown).toContain("| x402-funded | paid |");
      expect(liveGateMarkdown).toContain("## Evidence Index");
    } finally {
      await paidEndpoint.close();
      await rm(workspace, { recursive: true, force: true });
    }
  }, 20_000);

  it("executes an approved deploy plan with redacted signer evidence", async () => {
    const workspace = await installBlockchainPackage();
    try {
      const keypairPath = join(workspace, "deploy-keypair.json");
      const secretBytes = Array.from({ length: 64 }, (_value, index) => index < 32 ? index + 1 : 0);
      await writeFile(keypairPath, `${JSON.stringify(secretBytes)}\n`, "utf8");
      await chmod(keypairPath, 0o600);
      await mkdir(join(workspace, "target", "deploy"), { recursive: true });
      await writeFile(join(workspace, "target", "deploy", "demo.so"), "deployable program bytes", "utf8");

      const plan = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-blockchain",
        command: "ambient_program_deploy_plan",
        args: ["--binary", "target/deploy/demo.so", "--max-lamports", "5000", "--json"],
        env: { AMBIENT_BLOCKCHAIN_KEYPAIR_FILE: keypairPath },
      });
      const planResult = JSON.parse(plan.stdout ?? "{}");
      expect(planResult).toMatchObject({
        status: "planned",
        signerConfigured: true,
        approvalSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      });

      const execute = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-blockchain",
        command: "ambient_program_deploy_execute",
        args: [
          "--plan-artifact",
          planResult.artifact.relativePath,
          "--approval-sha256",
          planResult.approvalSha256,
          "--max-lamports",
          "5000",
          "--require-signer",
          "--json",
        ],
        env: {
          AMBIENT_BLOCKCHAIN_KEYPAIR_FILE: keypairPath,
          AMBIENT_BLOCKCHAIN_FAKE_SOLANA_DEPLOY: "1",
        },
      });
      const executeResult = JSON.parse(execute.stdout ?? "{}");
      expect(executeResult).toMatchObject({
        status: "deployed",
        mutation: "chain-transaction",
        fake: true,
        signature: "FAKE_DEPLOY_SIGNATURE",
        program: {
          binaryRelativePath: "target/deploy/demo.so",
          binarySha256: sha256("deployable program bytes"),
        },
        checks: expect.arrayContaining([
          expect.objectContaining({ id: "approval_digest_matches_expected", passed: true }),
          expect.objectContaining({ id: "binary_hash_matches_plan", passed: true }),
          expect.objectContaining({ id: "keypair_env_available", passed: true }),
        ]),
      });
      expect(JSON.stringify(executeResult.sanitizedCommand)).toContain("<AMBIENT_BLOCKCHAIN_KEYPAIR_FILE>");
      expect(execute.stdout).not.toContain(keypairPath);
      expect(execute.stdout).not.toContain(JSON.stringify(secretBytes));
      const executeArtifact = await readFile(join(workspace, executeResult.artifact.relativePath), "utf8");
      expect(executeArtifact).toContain("fake solana program deploy passed");
      expect(executeArtifact).toContain("<AMBIENT_BLOCKCHAIN_KEYPAIR_FILE>");
      expect(executeArtifact).not.toContain(keypairPath);
      expect(executeArtifact).not.toContain(JSON.stringify(secretBytes));

      const blocked = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-blockchain",
        command: "ambient_program_deploy_execute",
        args: [
          "--plan-artifact",
          planResult.artifact.relativePath,
          "--approval-sha256",
          "0".repeat(64),
          "--max-lamports",
          "5000",
          "--require-signer",
          "--json",
        ],
        env: {
          AMBIENT_BLOCKCHAIN_KEYPAIR_FILE: keypairPath,
          AMBIENT_BLOCKCHAIN_FAKE_SOLANA_DEPLOY: "1",
        },
      });
      const blockedResult = JSON.parse(blocked.stdout ?? "{}");
      expect(blockedResult).toMatchObject({
        status: "blocked",
        mutation: "none",
        fake: false,
        checks: expect.arrayContaining([
          expect.objectContaining({ id: "approval_digest_matches_expected", passed: false }),
        ]),
      });
      const blockedArtifact = await readFile(join(workspace, blockedResult.artifact.relativePath), "utf8");
      expect(blockedArtifact).not.toContain("fake solana program deploy passed");
      expect(blockedArtifact).not.toContain(keypairPath);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }, 15_000);

  it("executes approved program upgrade and authority plans with redacted signer evidence", async () => {
    const workspace = await installBlockchainPackage();
    try {
      const keypairPath = join(workspace, "operations-keypair.json");
      const secretBytes = Array.from({ length: 64 }, (_value, index) => index < 32 ? index + 1 : 0);
      await writeFile(keypairPath, `${JSON.stringify(secretBytes)}\n`, "utf8");
      await chmod(keypairPath, 0o600);
      await mkdir(join(workspace, "target", "deploy"), { recursive: true });
      await writeFile(join(workspace, "target", "deploy", "upgrade.so"), "upgraded program bytes", "utf8");
      const programId = "UpgradeProgram1111111111111111111111111111111";
      const newAuthority = "NewAuthority11111111111111111111111111111111";

      const upgradePlan = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-blockchain",
        command: "ambient_program_upgrade_plan",
        args: [
          "--program-id",
          programId,
          "--binary",
          "target/deploy/upgrade.so",
          "--max-lamports",
          "7000",
          "--json",
        ],
        env: { AMBIENT_BLOCKCHAIN_KEYPAIR_FILE: keypairPath },
      });
      const upgradePlanResult = JSON.parse(upgradePlan.stdout ?? "{}");
      expect(upgradePlanResult).toMatchObject({
        status: "planned",
        mutation: "none",
        signerConfigured: true,
        maxLamports: 7000,
        approvalCopy: expect.stringContaining("Approve Ambient program upgrade"),
        program: {
          programId,
          binaryRelativePath: "target/deploy/upgrade.so",
          sha256: sha256("upgraded program bytes"),
        },
      });

      const upgradeExecute = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-blockchain",
        command: "ambient_program_upgrade_execute",
        args: [
          "--plan-artifact",
          upgradePlanResult.artifact.relativePath,
          "--approval-sha256",
          upgradePlanResult.approvalSha256,
          "--max-lamports",
          "7000",
          "--require-signer",
          "--json",
        ],
        env: {
          AMBIENT_BLOCKCHAIN_KEYPAIR_FILE: keypairPath,
          AMBIENT_BLOCKCHAIN_FAKE_SOLANA_UPGRADE: "1",
        },
      });
      const upgradeExecuteResult = JSON.parse(upgradeExecute.stdout ?? "{}");
      expect(upgradeExecuteResult).toMatchObject({
        status: "upgraded",
        mutation: "chain-transaction",
        fake: true,
        signature: "FAKE_UPGRADE_SIGNATURE",
        program: {
          programId,
          binaryRelativePath: "target/deploy/upgrade.so",
          binarySha256: sha256("upgraded program bytes"),
        },
        checks: expect.arrayContaining([
          expect.objectContaining({ id: "plan_is_program_upgrade", passed: true }),
          expect.objectContaining({ id: "binary_hash_matches_plan", passed: true }),
          expect.objectContaining({ id: "keypair_env_available", passed: true }),
        ]),
      });
      expect(JSON.stringify(upgradeExecuteResult.sanitizedCommand)).toContain("<AMBIENT_BLOCKCHAIN_KEYPAIR_FILE>");
      expect(upgradeExecute.stdout).not.toContain(keypairPath);
      expect(upgradeExecute.stdout).not.toContain(JSON.stringify(secretBytes));
      const upgradeExecuteArtifact = await readFile(join(workspace, upgradeExecuteResult.artifact.relativePath), "utf8");
      expect(upgradeExecuteArtifact).toContain("fake solana program upgrade passed");
      expect(upgradeExecuteArtifact).not.toContain(keypairPath);
      expect(upgradeExecuteArtifact).not.toContain(JSON.stringify(secretBytes));

      const authorityPlan = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-blockchain",
        command: "ambient_program_authority_plan",
        args: [
          "--program-id",
          programId,
          "--new-authority",
          newAuthority,
          "--max-lamports",
          "3000",
          "--json",
        ],
        env: { AMBIENT_BLOCKCHAIN_KEYPAIR_FILE: keypairPath },
      });
      const authorityPlanResult = JSON.parse(authorityPlan.stdout ?? "{}");
      expect(authorityPlanResult).toMatchObject({
        status: "planned",
        mutation: "none",
        signerConfigured: true,
        approvalCopy: expect.stringContaining("Approve Ambient program authority change"),
        authority: {
          programId,
          newAuthority,
          final: false,
        },
      });

      const authorityExecute = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-blockchain",
        command: "ambient_program_authority_execute",
        args: [
          "--plan-artifact",
          authorityPlanResult.artifact.relativePath,
          "--approval-sha256",
          authorityPlanResult.approvalSha256,
          "--max-lamports",
          "3000",
          "--require-signer",
          "--json",
        ],
        env: {
          AMBIENT_BLOCKCHAIN_KEYPAIR_FILE: keypairPath,
          AMBIENT_BLOCKCHAIN_FAKE_SOLANA_AUTHORITY: "1",
        },
      });
      const authorityExecuteResult = JSON.parse(authorityExecute.stdout ?? "{}");
      expect(authorityExecuteResult).toMatchObject({
        status: "authority_changed",
        mutation: "chain-transaction",
        fake: true,
        signature: "FAKE_AUTHORITY_SIGNATURE",
        authority: {
          programId,
          newAuthority,
          final: false,
        },
        checks: expect.arrayContaining([
          expect.objectContaining({ id: "plan_is_program_authority_change", passed: true }),
          expect.objectContaining({ id: "new_authority_matches_plan", passed: true }),
          expect.objectContaining({ id: "keypair_env_available", passed: true }),
        ]),
      });
      expect(JSON.stringify(authorityExecuteResult.sanitizedCommand)).toContain("<AMBIENT_BLOCKCHAIN_KEYPAIR_FILE>");
      expect(authorityExecute.stdout).not.toContain(keypairPath);
      expect(authorityExecute.stdout).not.toContain(JSON.stringify(secretBytes));
      const authorityExecuteArtifact = await readFile(join(workspace, authorityExecuteResult.artifact.relativePath), "utf8");
      expect(authorityExecuteArtifact).toContain("fake solana program authority change passed");
      expect(authorityExecuteArtifact).not.toContain(keypairPath);
      expect(authorityExecuteArtifact).not.toContain(JSON.stringify(secretBytes));

      const blockedFinal = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-blockchain",
        command: "ambient_program_authority_execute",
        args: [
          "--plan-artifact",
          authorityPlanResult.artifact.relativePath,
          "--approval-sha256",
          authorityPlanResult.approvalSha256,
          "--max-lamports",
          "3000",
          "--require-signer",
          "--final",
          "--json",
        ],
        env: {
          AMBIENT_BLOCKCHAIN_KEYPAIR_FILE: keypairPath,
          AMBIENT_BLOCKCHAIN_FAKE_SOLANA_AUTHORITY: "1",
        },
      });
      const blockedFinalResult = JSON.parse(blockedFinal.stdout ?? "{}");
      expect(blockedFinalResult).toMatchObject({
        status: "blocked",
        mutation: "none",
        checks: expect.arrayContaining([
          expect.objectContaining({ id: "final_flag_matches_plan", passed: false }),
        ]),
      });
      const blockedFinalArtifact = await readFile(join(workspace, blockedFinalResult.artifact.relativePath), "utf8");
      expect(blockedFinalArtifact).not.toContain("fake solana program authority change passed");
      expect(blockedFinalArtifact).not.toContain(keypairPath);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }, 15_000);
});

async function installBlockchainPackage(): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), "ambient-blockchain-cli-"));
  try {
    await ensureFirstPartyAmbientCliPackages(workspace, {
      packageNames: ["ambient-blockchain"],
      bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages"),
    });
    return workspace;
  } catch (error) {
    await rm(workspace, { recursive: true, force: true });
    throw error;
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function startMockRpc(): Promise<{
  url: string;
  calls: Array<{ method: string; params: unknown[] }>;
  close: () => Promise<void>;
}> {
  const calls: Array<{ method: string; params: unknown[] }> = [];
  const server = createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      const payload = JSON.parse(body) as { id: number; method: string; params: unknown[] };
      calls.push({ method: payload.method, params: payload.params });
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ jsonrpc: "2.0", id: payload.id, result: mockRpcResult(payload.method) }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Mock RPC server did not bind a TCP port.");
  return {
    url: `http://127.0.0.1:${address.port}`,
    calls,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

async function startMockPaidEndpoint(): Promise<{
  url: string;
  calls: Array<{ method: string; paymentHeader: string | undefined; body: string }>;
  close: () => Promise<void>;
}> {
  const calls: Array<{ method: string; paymentHeader: string | undefined; body: string }> = [];
  const server = createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      calls.push({
        method: request.method ?? "GET",
        paymentHeader: request.headers["x-payment"] as string | undefined,
        body,
      });
      response.writeHead(200, {
        "content-type": "application/json",
        "x-payment-receipt": "receipt-123",
      });
      response.end(JSON.stringify({ message: "x402 response body" }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Mock paid endpoint did not bind a TCP port.");
  return {
    url: `http://127.0.0.1:${address.port}/paid`,
    calls,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

function mockRpcResult(method: string): unknown {
  if (method === "getTransaction") {
    return {
      slot: 42,
      blockTime: 1781335400,
      meta: {
        err: null,
        fee: 5000,
        logMessages: ["Program log: hello", "Program success"],
      },
      transaction: {
        signatures: ["demoSig"],
        message: {
          accountKeys: ["Payer1111111111111111111111111111111111", "Program111111111111111111111111111111111"],
          instructions: [{ programId: "Program111111111111111111111111111111111" }],
        },
      },
    };
  }
  if (method === "getSignaturesForAddress") {
    return [
      {
        signature: "historySig",
        slot: 41,
        blockTime: 1781335300,
        err: null,
        memo: null,
      },
    ];
  }
  if (method === "getProgramAccounts") {
    return [
      {
        pubkey: "ProgramAccount1",
        account: {
          lamports: 100,
          owner: "Program111111111111111111111111111111111",
          executable: false,
          rentEpoch: 1,
          data: ["AQIDBA==", "base64"],
          space: 8,
        },
      },
      {
        pubkey: "ProgramAccount2",
        account: {
          lamports: 200,
          owner: "Program111111111111111111111111111111111",
          executable: false,
          rentEpoch: 1,
          data: ["BQYHCA==", "base64"],
          space: 8,
        },
      },
    ];
  }
  if (method === "getAccountInfo") {
    const oracleAccount = Buffer.from(JSON.stringify({ state: "Completed", output: "42.00" }), "utf8").toString("base64");
    return {
      context: { slot: 99 },
      value: {
        lamports: 1234,
        owner: "721QWDeUzVL77UCzCFHsVGCMBVup8GsAMPaD2YvWvw97",
        executable: false,
        rentEpoch: 1,
        data: [oracleAccount, "base64"],
        space: Buffer.byteLength(oracleAccount, "base64"),
      },
    };
  }
  throw new Error(`Unhandled mock RPC method ${method}.`);
}
