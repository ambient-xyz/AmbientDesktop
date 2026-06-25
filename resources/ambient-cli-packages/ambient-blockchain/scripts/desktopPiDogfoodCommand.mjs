import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function createDesktopPiDogfoodCommand(deps) {
  const {
    boundedTextPreview,
    contractsPath,
    entrypointPath,
    errorMessage,
    nowIso,
    packageName,
    packageRoot,
    packageVersion,
    sha256,
    toWorkspaceRelative,
    writeArtifact,
    writeJson,
  } = deps;

  function commandDesktopPiDogfood(options) {
    const payload = buildDesktopPiDogfood();
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
      artifact,
    });
  }

  function buildDesktopPiDogfood() {
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
      "ambient_blockchain_live_gate",
    ];
    const missingCommands = requiredCommands.filter((command) => !manifestCommands.includes(command));
    const forbiddenSkillPhrases = [
      "paste api key",
      "paste private key",
      "print private key",
      "print keypair path",
      "log private key",
      "log keypair path",
      "pass payment header in chat",
    ];
    const unsafeSkillPhrases = forbiddenSkillPhrases.filter((phrase) => skillLower.includes(phrase));
    const doctorRun = spawnSync(process.execPath, [entrypointPath, "doctor", "--fast", "--json"], {
      cwd: packageRoot,
      encoding: "utf8",
      timeout: 10_000,
      maxBuffer: 2 * 1024 * 1024,
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
      mentionsNoSecretExposure: skillLower.includes("never paste key material") && skillLower.includes("never prints keypair paths"),
    };
    const checks = [
      {
        id: "manifest_name_matches_package",
        passed: manifest.name === packageName,
        detail: `manifest=${manifest.name ?? "missing"} package=${packageName}`,
      },
      {
        id: "manifest_version_matches_script",
        passed: manifest.version === packageVersion,
        detail: `manifest=${manifest.version ?? "missing"} script=${packageVersion}`,
      },
      {
        id: "manifest_exposes_required_commands",
        passed: missingCommands.length === 0,
        detail: missingCommands.length ? `missing=${missingCommands.join(",")}` : `${requiredCommands.length} required commands present`,
      },
      {
        id: "contracts_include_desktop_pi_lane",
        passed: Array.isArray(contracts.liveTestLanes) && contracts.liveTestLanes.some((lane) => lane.id === "desktop-pi"),
        detail: "contracts.liveTestLanes must advertise the Desktop/Pi discovery lane",
      },
      {
        id: "skill_progressive_discovery_present",
        passed: skillFacts.mentionsSearch && skillFacts.mentionsDescribe && skillFacts.startsWithDoctor,
        detail: "Skill must tell Pi to search, describe, and run doctor before use.",
      },
      {
        id: "skill_safety_gates_present",
        passed: skillFacts.mentionsSafeLiveRead && skillFacts.mentionsKeypairStatus && skillFacts.mentionsApprovalVerify,
        detail: "Skill must expose safe live-read, signer status, and approval verification flow.",
      },
      {
        id: "skill_secret_handling_is_safe",
        passed: skillFacts.mentionsNoSecretExposure && unsafeSkillPhrases.length === 0,
        detail: unsafeSkillPhrases.length
          ? `unsafe phrases=${unsafeSkillPhrases.join(",")}`
          : "No unsafe secret-handling phrases detected.",
      },
      {
        id: "doctor_health_check_passed",
        passed: doctorRun.status === 0 && parsedDoctor?.status === "ready",
        detail: `exit=${doctorRun.status ?? "missing"} status=${parsedDoctor?.status ?? "missing"}`,
      },
      {
        id: "doctor_exposes_planners_funded_and_gates",
        passed: doctorHasPlanner && doctorHasFunded && doctorHasGate,
        detail: `planner=${doctorHasPlanner} funded=${doctorHasFunded} gate=${doctorHasGate}`,
      },
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
          "ambient_chain_doctor --json",
        ],
        requiredCommandsPresent: missingCommands.length === 0,
        missingCommands,
        skillFacts,
        artifacts: {
          manifest: {
            relativePath: toWorkspaceRelative(manifestPath),
            bytes: manifestBytes.length,
            sha256: sha256(manifestBytes),
          },
          skill: {
            relativePath: toWorkspaceRelative(skillPath),
            bytes: skillBytes.length,
            sha256: sha256(skillBytes),
          },
          contracts: {
            relativePath: toWorkspaceRelative(contractsPath),
            bytes: contractsBytes.length,
            sha256: sha256(contractsBytes),
          },
        },
      },
      healthCheck: {
        command: ["node", "scripts/run.mjs", "doctor", "--fast", "--json"],
        exitCode: doctorRun.status,
        signal: doctorRun.signal,
        stdoutPreview: boundedTextPreview(doctorRun.stdout ?? "", 4_000),
        stderrPreview: boundedTextPreview(doctorRun.stderr ?? "", 4_000),
        parseError: doctorParseError,
        parsedStatus: parsedDoctor?.status,
        parsedPackageVersion: parsedDoctor?.packageVersion,
      },
      redactionFacts: {
        keypairPathsIncluded: false,
        privateKeyBytesIncluded: false,
        secretValuesIncluded: false,
      },
    };
  }

  return {
    buildDesktopPiDogfood,
    commandDesktopPiDogfood,
  };
}
