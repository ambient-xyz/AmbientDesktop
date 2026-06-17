import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  betterSqliteRebuildEnv,
  buildDirectoryListEnv,
  buildGuidedSmokeEnv,
  buildOwnerHandoffCheckEnv,
  buildOwnerLoopOperatorInstructions,
  buildOwnerLoopOperatorPacket,
  buildSmokeEnv,
  directoryListChecklist,
  directoryListResultText,
  findBridgeSessionCandidates,
  guidedOwnerLoopChecklist,
  loadAmbientAgentTelegramSecretFiles,
  loadTelegramEnvFile,
  ownerHandoffCheckChecklist,
  ownerMessageSeedChecklist,
  ownerMessageSeedResultText,
  ownerSeedCommandText,
  ownerLoopChecklist,
  ownerLoopCommandText,
  ownerLoopOperatorPacketText,
  ownerLoopResultText,
  parseArgs,
  redactSessionMetadata,
  redactedAmbientAgentSecretSummary,
  resolveDirectoryListConfig,
  resolveGuidedSmokeConfig,
  resolveOwnerMessageSeedConfig,
  resolveOwnerHandoffCheckConfig,
  resolveSmokeConfig,
} from "./manual-telegram-owner-loop-smoke.mjs";

describe("manual Telegram owner-loop smoke runner", () => {
  it("parses repeatable scan roots and aliases", () => {
    expect(
      parseArgs([
        "--run",
        "--list-conversations",
        "--check-handoff",
        "--prepare-guided",
        "--guided-run",
        "--guided-polling-run",
        "--send-reply",
        "--seed-owner-messages",
        "--profile-id",
        "telegram-default",
        "--conversation",
        "chat-123",
        "--seed-profile",
        "owner-profile",
        "--seed-conversation",
        "owner-chat",
        "--expect-seed-phone-last4",
        "9655",
        "--seed-directory-query=Travis",
        "--seed-directory-limit",
        "40",
        "--env-file",
        "/tmp/telegram.env",
        "--scan-root",
        "/tmp/a",
        "--scan-root=/tmp/b",
        "--expect-phone-last4",
        "8227",
        "--wait-seconds",
        "30",
        "--poll-interval-ms=1000",
        "--command-not-before",
        "2026-05-13T00:00:01.000Z",
        "--output-dir",
        "/tmp/telegram-reports",
      ]),
    ).toEqual({
      run: true,
      listConversations: true,
      checkHandoff: true,
      prepareGuided: true,
      guidedRun: true,
      guidedPollingRun: true,
      sendReply: true,
      seedOwnerMessages: true,
      profile: "telegram-default",
      conversationId: "chat-123",
      seedProfile: "owner-profile",
      seedConversationId: "owner-chat",
      expectSeedPhoneLast4: "9655",
      seedDirectoryQuery: "Travis",
      seedDirectoryLimit: "40",
      envFile: "/tmp/telegram.env",
      scanRoots: ["/tmp/a", "/tmp/b"],
      expectPhoneLast4: "8227",
      waitSeconds: "30",
      pollIntervalMs: "1000",
      commandNotBefore: "2026-05-13T00:00:01.000Z",
      outputDir: "/tmp/telegram-reports",
    });
  });

  it("builds a guided operator packet without provider credentials or message history", () => {
    const packet = buildOwnerLoopOperatorPacket({
      mode: "guided-run",
      config: {
        profile: "profile-one",
        stateRoot: "/tmp/ambient-telegram",
        conversationId: "chat-123",
        outputDir: "/tmp/telegram-reports",
        directoryQuery: "Ambient",
        directoryLimit: "10",
        pollLimit: "12",
        ownerLoopOutputPath: "/tmp/telegram-reports/telegram-owner-loop-result.json",
        operatorInstructionsPath: "/tmp/telegram-reports/telegram-owner-loop-operator-instructions.md",
        setupCode: "AMBIENT-GUIDED-OWNER-LOOP",
        commandText: "switch project Manual Relay Smoke",
        waitSeconds: "30",
        pollIntervalMs: "1000",
        sendReply: false,
      },
    });

    expect(packet).toMatchObject({
      mode: "guided-run",
      profileId: "profile-one",
      conversationId: "chat-123",
      setupCode: "AMBIENT-GUIDED-OWNER-LOOP",
      commandText: "switch project Manual Relay Smoke",
      replySendRequiresExplicitApproval: true,
      activationPlan: {
        planFirst: true,
        tool: "ambient_messaging_telegram_owner_loop_activation_plan",
        initialBeforeLifecycle: true,
        afterBindingBeforePolling: true,
        expectedNextAfterBinding: "ambient_messaging_telegram_bridge_polling_preview",
      },
      privacy: {
        includesTelegramApiCredentials: false,
        includesProviderMessageBodies: false,
        includesProviderHistory: false,
      },
    });
    expect(packet.messagesToSend).toEqual([
      {
        order: 1,
        purpose: "owner_handoff",
        exactText: "AMBIENT-GUIDED-OWNER-LOOP",
      },
      {
        order: 2,
        purpose: "owner_command",
        exactText: "switch project Manual Relay Smoke",
      },
    ]);
    expect(packet.commands.previewOnly).toContain("--guided-run");
    expect(packet.commands.previewOnly).not.toContain("--send-reply");
    expect(packet.commands.previewOnly).toContain("--directory-query Ambient");
    expect(packet.commands.previewOnly).toContain("--directory-limit 10");
    expect(packet.commands.previewOnly).toContain("--poll-limit 12");
    expect(packet.commands.sendReplyAfterApproval).toContain("--send-reply");
    expect(JSON.stringify(packet)).not.toContain("hash-secret");
    expect(JSON.stringify(packet)).not.toContain("lastMessage");

    const instructions = buildOwnerLoopOperatorInstructions(packet);
    expect(instructions).toContain("# Telegram Owner-Loop Smoke Instructions");
    expect(instructions).toContain("## Activation Plan Contract");
    expect(instructions).toContain("Plan-first: yes");
    expect(instructions).toContain("Tool: ambient_messaging_telegram_owner_loop_activation_plan");
    expect(instructions).toContain("Expected next after binding: ambient_messaging_telegram_bridge_polling_preview");
    expect(instructions).toContain("Owner handoff setup code");
    expect(instructions).toContain("```text\nAMBIENT-GUIDED-OWNER-LOOP\n```");
    expect(instructions).toContain("```text\nswitch project Manual Relay Smoke\n```");
    expect(instructions).toContain("Preview-only run:");
    expect(instructions).toContain("Send-reply run after explicit approval:");
    expect(instructions).toContain("Use a private/sandbox conversation you control");
    expect(instructions).toContain("/tmp/telegram-reports/telegram-owner-loop-result.json");
    expect(instructions).not.toContain("hash-secret");
    expect(instructions).not.toContain("lastMessage");

    const command = ownerLoopCommandText({
      mode: "guided-run",
      config: {
        profile: "profile-one",
        stateRoot: "/tmp/ambient-telegram",
        conversationId: "chat-123",
        outputDir: "/tmp/telegram-reports",
        directoryLimit: "10",
        pollLimit: "12",
        setupCode: "AMBIENT-GUIDED-OWNER-LOOP",
        commandText: "switch project Manual Relay Smoke",
        waitSeconds: "30",
        pollIntervalMs: "1000",
      },
    });
    expect(command).toContain("--guided-run");
    expect(command).toContain("--setup-code AMBIENT-GUIDED-OWNER-LOOP");
    expect(command).toContain("--command 'switch project Manual Relay Smoke'");
    expect(command).toContain("--directory-limit 10");
    expect(command).toContain("--poll-limit 12");
    expect(command).not.toContain("--send-reply");

    const pollingPacket = buildOwnerLoopOperatorPacket({
      mode: "guided-polling-run",
      config: {
        profile: "profile-one",
        stateRoot: "/tmp/ambient-telegram",
        conversationId: "chat-123",
        outputDir: "/tmp/telegram-reports",
        directoryLimit: "10",
        pollLimit: "12",
        setupCode: "AMBIENT-GUIDED-OWNER-LOOP",
        commandText: "switch project Manual Relay Smoke",
        waitSeconds: "30",
        pollIntervalMs: "5000",
        usePollingRunner: true,
      },
    });
    expect(pollingPacket.mode).toBe("guided-polling-run");
    expect(pollingPacket.usePollingRunner).toBe(true);
    expect(pollingPacket.commands.previewOnly).toContain("--guided-polling-run");
    expect(pollingPacket.commands.previewOnly).toContain("--poll-interval-ms 5000");
  });

  it("uses a source rebuild env for better-sqlite3 manual smoke runs", () => {
    const root = mkdtempSync(join(tmpdir(), "ambient-rebuild-python-"));
    try {
      const pythonPath = join(root, "python3.12");
      writeFileSync(pythonPath, "");
      expect(betterSqliteRebuildEnv({}, pythonPath)).toMatchObject({
        npm_config_runtime: "node",
        npm_config_target: process.versions.node,
        npm_config_disturl: "https://nodejs.org/download/release",
        npm_config_target_arch: process.arch,
        npm_config_target_platform: process.platform,
        npm_config_build_from_source: "true",
        npm_config_python: pythonPath,
      });
      expect(betterSqliteRebuildEnv({
        npm_config_runtime: "electron",
        npm_config_target: "41.0.0",
        npm_config_build_from_source: "false",
        npm_config_python: "/custom/python",
      }, pythonPath)).toMatchObject({
        npm_config_runtime: "node",
        npm_config_target: process.versions.node,
        npm_config_build_from_source: "false",
        npm_config_python: "/custom/python",
      });
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("discovers bridge sessions without exposing session secrets", () => {
    const root = mkdtempSync(join(tmpdir(), "ambient-telegram-smoke-"));
    try {
      const stateRoot = join(root, "telegram");
      const profileDir = join(stateRoot, "profile-one");
      mkdirSync(profileDir, { recursive: true });
      const metadataPath = join(profileDir, "bridge-session.json");
      writeFileSync(
        metadataPath,
        JSON.stringify({
          profileId: "profile-one",
          phoneNumber: "+15551234567",
          databaseEncryptionKey: "super-secret-key",
          authState: "ready",
        }),
      );

      const redacted = redactSessionMetadata(metadataPath);
      expect(redacted).toMatchObject({
        profileId: "profile-one",
        metadataPath,
        stateRoot,
        hasPhoneNumber: true,
        phoneLast4: "4567",
        hasDatabaseEncryptionKey: true,
        authState: "ready",
      });
      expect(JSON.stringify(redacted)).not.toContain("+15551234567");
      expect(JSON.stringify(redacted)).not.toContain("555123");
      expect(JSON.stringify(redacted)).not.toContain("super-secret-key");

      const candidates = findBridgeSessionCandidates({
        stateRoot,
        env: {},
      });
      expect(candidates).toHaveLength(1);
      expect(candidates[0].profileId).toBe("profile-one");
      expect(candidates[0].phoneLast4).toBe("4567");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("blocks live smoke commands when the selected bridge account phone marker is wrong", () => {
    const candidates = [
      {
        profileId: "primary-profile",
        stateRoot: "/tmp/ambient-telegram",
        hasPhoneNumber: true,
        phoneLast4: "9655",
        hasDatabaseEncryptionKey: true,
        authState: "ready",
      },
    ];
    const env = {
      AMBIENT_AGENT_TELEGRAM_API_ID: "123",
      AMBIENT_AGENT_TELEGRAM_API_HASH: "hash-secret",
    };
    const { config, missing } = resolveGuidedSmokeConfig({
      options: {
        conversationId: "chat-123",
        setupCode: "AMBIENT-GUIDED-OWNER-LOOP",
        expectPhoneLast4: "8227",
      },
      candidates,
      env,
    });

    expect(config).toMatchObject({
      profile: "primary-profile",
      profilePhoneLast4: "9655",
      expectPhoneLast4: "8227",
    });
    expect(missing).toContain("selected Telegram profile phone marker ends 9655, expected 8227");

    const checklist = guidedOwnerLoopChecklist({
      candidates,
      config,
      missing,
      env,
    });
    expect(checklist).toContain("phoneLast4=9655");
    expect(checklist).toContain("selectedProfilePhoneLast4: 9655");
    expect(checklist).toContain("expectedProfilePhoneLast4: 8227");
    expect(checklist).toContain("--expect-phone-last4 8227");
    expect(checklist).not.toContain("hash-secret");
  });

  it("builds guarded owner-message seed config and redacted output", () => {
    const candidates = [
      {
        profileId: "bridge-profile",
        stateRoot: "/tmp/ambient-telegram",
        hasPhoneNumber: true,
        phoneLast4: "8227",
        hasDatabaseEncryptionKey: true,
        authState: "ready",
      },
      {
        profileId: "owner-profile",
        stateRoot: "/tmp/ambient-telegram",
        hasPhoneNumber: true,
        phoneLast4: "9655",
        hasDatabaseEncryptionKey: true,
        authState: "ready",
      },
    ];
    const env = {
      AMBIENT_AGENT_TELEGRAM_API_ID: "123",
      AMBIENT_AGENT_TELEGRAM_API_HASH: "hash-secret",
    };
    const { config, missing } = resolveOwnerMessageSeedConfig({
      options: {
        profile: "bridge-profile",
        expectPhoneLast4: "8227",
        seedProfile: "owner-profile",
        seedConversationId: "owner-chat",
        expectSeedPhoneLast4: "9655",
        seedDirectoryQuery: "Travis",
        seedDirectoryLimit: "40",
        setupCode: "AMBIENT-OWNER-SEED",
        commandText: "switch project Manual Relay Smoke",
        outputDir: "/tmp/telegram-reports",
      },
      candidates,
      env,
    });

    expect(missing).toEqual([]);
    expect(config).toMatchObject({
      profile: "bridge-profile",
      profilePhoneLast4: "8227",
      seedOwnerMessages: true,
      seedProfile: "owner-profile",
      seedConversationId: "owner-chat",
      seedProfilePhoneLast4: "9655",
      expectSeedPhoneLast4: "9655",
      seedDirectoryQuery: "Travis",
      seedDirectoryLimit: "40",
    });

    const checklist = ownerMessageSeedChecklist({
      candidates,
      config,
      missing,
      env,
      printEnv: true,
    });
    expect(checklist).toContain("Manual Telegram owner-message seed helper");
    expect(checklist).toContain("seedProfile: owner-profile");
    expect(checklist).toContain("seedProfilePhoneLast4: 9655");
    expect(checklist).toContain("--seed-owner-messages");
    expect(checklist).toContain("--seed-directory-query Travis");
    expect(checklist).toContain("does not read provider message bodies/history");
    expect(checklist).toContain('"AMBIENT_AGENT_TELEGRAM_API_HASH": "<present>"');
    expect(checklist).not.toContain("hash-secret");

    const command = ownerSeedCommandText({ config });
    expect(command).toContain("--seed-profile owner-profile");
    expect(command).toContain("--seed-conversation owner-chat");
    expect(command).toContain("--expect-seed-phone-last4 9655");
    expect(command).toContain("--setup-code AMBIENT-OWNER-SEED");

    const blocked = resolveOwnerMessageSeedConfig({
      options: {
        profile: "bridge-profile",
        seedProfile: "bridge-profile",
        seedConversationId: "owner-chat",
      },
      candidates,
      env,
    });
    expect(blocked.missing).toContain("seed profile must be a separate inbound owner/delegate account, not the bridge profile");

    const root = mkdtempSync(join(tmpdir(), "ambient-telegram-seed-report-"));
    try {
      const reportPath = join(root, "telegram-owner-loop-seed.json");
      writeFileSync(reportPath, JSON.stringify({
        status: "sent",
        seedProfile: "owner-profile",
        seedConversationId: "owner-chat",
        validation: {
          status: "present",
        },
        freshnessAnchor: {
          commandNotBefore: "2026-05-13T00:00:01.000Z",
        },
        sentMessages: [
          {
            purpose: "owner_handoff",
            providerMessageId: "provider-1",
            chatId: "owner-chat",
            date: "2026-05-13T00:00:00.000Z",
          },
          {
            purpose: "owner_command",
            providerMessageId: "provider-2",
            chatId: "owner-chat",
            date: "2026-05-13T00:00:01.000Z",
          },
        ],
        privacy: {
          includesTelegramApiCredentials: false,
          includesProviderMessageBodies: false,
          includesProviderHistory: false,
          sentAmbientRelayReply: false,
        },
      }));
      const summary = ownerMessageSeedResultText({ outputPath: reportPath });
      expect(summary).toContain("Telegram owner-message seed result");
      expect(summary).toContain("Status: sent");
      expect(summary).toContain("Metadata validation: present");
      expect(summary).toContain("Command freshness anchor: 2026-05-13T00:00:01.000Z");
      expect(summary).toContain("Sent owner_handoff providerMessage=provider-1");
      expect(summary).toContain("Sent owner_command providerMessage=provider-2");
      expect(summary).toContain("No Telegram relay reply was sent by the seed helper.");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("loads only allowed Telegram smoke env keys from an ignored local file", () => {
    const root = mkdtempSync(join(tmpdir(), "ambient-telegram-env-"));
    try {
      const envFile = join(root, "telegram_api_credentials.env");
      writeFileSync(
        envFile,
        [
          "# Local smoke credentials",
          "AMBIENT_AGENT_TELEGRAM_API_ID=123",
          "export AMBIENT_AGENT_TELEGRAM_API_HASH='hash-secret'",
          "AMBIENT_MANUAL_TELEGRAM_PROFILE_ID=owner",
          "AMBIENT_AGENT_ROOT=/path/to/user/ambientAgent",
        ].join("\n"),
      );

      const loaded = loadTelegramEnvFile(envFile, { AMBIENT_AGENT_TELEGRAM_API_ID: "old" });

      expect(loaded).toMatchObject({
        loaded: true,
        path: envFile,
        keys: [
          "AMBIENT_AGENT_ROOT",
          "AMBIENT_AGENT_TELEGRAM_API_HASH",
          "AMBIENT_AGENT_TELEGRAM_API_ID",
          "AMBIENT_MANUAL_TELEGRAM_PROFILE_ID",
        ],
      });
      expect(loaded.env).toMatchObject({
        AMBIENT_AGENT_TELEGRAM_API_ID: "123",
        AMBIENT_AGENT_TELEGRAM_API_HASH: "hash-secret",
        AMBIENT_MANUAL_TELEGRAM_PROFILE_ID: "owner",
        AMBIENT_AGENT_ROOT: "/path/to/user/ambientAgent",
      });
      expect(JSON.stringify(loaded)).toContain("hash-secret");

      const checklist = directoryListChecklist({
        candidates: [],
        config: {
          profile: "owner",
          stateRoot: "/tmp/telegram",
          directoryQuery: "Telegram",
          directoryLimit: "10",
        },
        missing: [],
        env: loaded.env,
        envFile: loaded,
      });
      expect(checklist).toContain("--env-file");
      expect(checklist).toContain("Loaded keys:");
      expect(checklist).not.toContain("hash-secret");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("rejects unrelated env-file keys before running a smoke", () => {
    const root = mkdtempSync(join(tmpdir(), "ambient-telegram-env-"));
    try {
      const envFile = join(root, "telegram_api_credentials.env");
      writeFileSync(envFile, "OPENAI_API_KEY=secret\n");
      expect(() => loadTelegramEnvFile(envFile, {})).toThrow(/not an allowed Telegram smoke key/);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("loads Ambient Agent Telegram credential files without exposing values in summaries", () => {
    const root = mkdtempSync(join(tmpdir(), "ambient-agent-telegram-"));
    try {
      writeFileSync(join(root, "telegram_api_id.txt"), "12345\n");
      writeFileSync(join(root, "telegram_api_hash.txt"), "hash-secret\n");

      const loaded = loadAmbientAgentTelegramSecretFiles({
        ambientAgentRoot: root,
        env: {},
      });

      expect(loaded).toMatchObject({
        root,
        loaded: true,
        loadedKeys: [
          "AMBIENT_AGENT_TELEGRAM_API_ID",
          "AMBIENT_AGENT_TELEGRAM_API_HASH",
        ],
        missingFiles: [],
      });
      expect(loaded.env).toMatchObject({
        AMBIENT_AGENT_ROOT: root,
        AMBIENT_AGENT_TELEGRAM_API_ID: "12345",
        AMBIENT_AGENT_TELEGRAM_API_HASH: "hash-secret",
      });
      const summary = redactedAmbientAgentSecretSummary(loaded);
      expect(summary).toContain("Loaded Ambient Agent secret keys:");
      expect(summary).not.toContain("12345");
      expect(summary).not.toContain("hash-secret");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("builds a run checklist and smoke environment from discovered state", () => {
    const candidates = [
      {
        profileId: "profile-one",
        stateRoot: "/tmp/ambient-telegram",
        hasPhoneNumber: true,
        hasDatabaseEncryptionKey: true,
        authState: "ready",
      },
    ];
    const env = {
      AMBIENT_AGENT_TELEGRAM_API_ID: "123",
      AMBIENT_AGENT_TELEGRAM_API_HASH: "hash-secret",
    };
    const { config, missing } = resolveSmokeConfig({
      options: {
        conversationId: "chat-123",
        setupCode: "AMBIENT-OWNER-LOOP-TEST",
        commandText: "status",
      },
      candidates,
      env,
      now: 1_234,
    });

    expect(missing).toEqual([]);
    expect(config).toMatchObject({
      profile: "profile-one",
      stateRoot: "/tmp/ambient-telegram",
      conversationId: "chat-123",
      setupCode: "AMBIENT-OWNER-LOOP-TEST",
      commandText: "status",
      sendReply: false,
    });

    const smokeEnv = buildSmokeEnv(config, env);
    expect(smokeEnv).toMatchObject({
      AMBIENT_TEST_NATIVE: "1",
      AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SMOKE: "1",
      AMBIENT_MANUAL_TELEGRAM_PROFILE_ID: "profile-one",
      AMBIENT_MANUAL_TELEGRAM_STATE_ROOT: "/tmp/ambient-telegram",
      AMBIENT_MANUAL_TELEGRAM_CONVERSATION_ID: "chat-123",
      AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SETUP_CODE: "AMBIENT-OWNER-LOOP-TEST",
      AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_COMMAND_TEXT: "status",
    });
    expect(buildSmokeEnv({
      ...config,
      ownerLoopOutputPath: "/tmp/telegram-reports/owner-loop.json",
    }, env)).toMatchObject({
      AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_OUTPUT_PATH: "/tmp/telegram-reports/owner-loop.json",
    });

    const checklist = ownerLoopChecklist({
      candidates,
      config,
      missing,
      env,
      printEnv: true,
    });
    expect(checklist).toContain("profile-one");
    expect(checklist).toContain("AMBIENT-OWNER-LOOP-TEST");
    expect(checklist).toContain("preview-only default");
    expect(checklist).toContain("--directory-limit 1");
    expect(checklist).toContain("--poll-limit 24");
    expect(checklist).toContain("hash=present");
    expect(checklist).toContain('"AMBIENT_AGENT_TELEGRAM_API_HASH": "<present>"');
    expect(checklist).not.toContain("hash-secret");
  });

  it("builds a metadata-only directory picker checklist and env without exposing API secrets", () => {
    const candidates = [
      {
        profileId: "profile-one",
        stateRoot: "/tmp/ambient-telegram",
        hasPhoneNumber: true,
        hasDatabaseEncryptionKey: true,
        authState: "ready",
      },
    ];
    const env = {
      AMBIENT_AGENT_TELEGRAM_API_ID: "123",
      AMBIENT_AGENT_TELEGRAM_API_HASH: "hash-secret",
    };
    const { config, missing } = resolveDirectoryListConfig({
      options: {
        directoryQuery: "family",
        directoryLimit: "25",
        outputDir: "/tmp/telegram-reports",
      },
      candidates,
      env,
    });

    expect(missing).toEqual([]);
    expect(config).toEqual({
      profile: "profile-one",
      stateRoot: "/tmp/ambient-telegram",
      conversationId: undefined,
      directoryQuery: "family",
      directoryLimit: "25",
      outputDir: "/tmp/telegram-reports",
    });

    expect(buildDirectoryListEnv({
      ...config,
      directoryOutputPath: "/tmp/telegram-reports/directory.json",
    }, env)).toMatchObject({
      AMBIENT_TEST_NATIVE: "1",
      AMBIENT_MANUAL_TELEGRAM_DIRECTORY_LIST_SMOKE: "1",
      AMBIENT_MANUAL_TELEGRAM_PROFILE_ID: "profile-one",
      AMBIENT_MANUAL_TELEGRAM_STATE_ROOT: "/tmp/ambient-telegram",
      AMBIENT_MANUAL_TELEGRAM_DIRECTORY_QUERY: "family",
      AMBIENT_MANUAL_TELEGRAM_DIRECTORY_LIMIT: "25",
      AMBIENT_MANUAL_TELEGRAM_DIRECTORY_OUTPUT_PATH: "/tmp/telegram-reports/directory.json",
    });

    const checklist = directoryListChecklist({
      candidates,
      config,
      missing,
      env,
      printEnv: true,
    });
    expect(checklist).toContain("metadata-only directory picker");
    expect(checklist).toContain("--list-conversations");
    expect(checklist).toContain("selectedConversationId: <none>");
    expect(checklist).toContain("--output-dir /tmp/telegram-reports");
    expect(checklist).toContain('"AMBIENT_AGENT_TELEGRAM_API_HASH": "<present>"');
    expect(checklist).not.toContain("hash-secret");
  });

  it("builds an owner-handoff preflight checklist that calls out same-account outgoing limits", () => {
    const candidates = [
      {
        profileId: "profile-one",
        stateRoot: "/tmp/ambient-telegram",
        hasPhoneNumber: true,
        hasDatabaseEncryptionKey: true,
        authState: "ready",
      },
    ];
    const env = {
      AMBIENT_AGENT_TELEGRAM_API_ID: "123",
      AMBIENT_AGENT_TELEGRAM_API_HASH: "hash-secret",
    };
    const { config, missing } = resolveOwnerHandoffCheckConfig({
      options: {
        conversationId: "chat-123",
        setupCode: "AMBIENT-OWNER-HANDOFF-CHECK",
        pollLimit: "7",
      },
      candidates,
      env,
    });

    expect(missing).toEqual([]);
    expect(config).toMatchObject({
      profile: "profile-one",
      stateRoot: "/tmp/ambient-telegram",
      conversationId: "chat-123",
      setupCode: "AMBIENT-OWNER-HANDOFF-CHECK",
      pollLimit: "7",
    });

    expect(buildOwnerHandoffCheckEnv(config, env)).toMatchObject({
      AMBIENT_TEST_NATIVE: "1",
      AMBIENT_MANUAL_TELEGRAM_OWNER_HANDOFF_CHECK_SMOKE: "1",
      AMBIENT_MANUAL_TELEGRAM_PROFILE_ID: "profile-one",
      AMBIENT_MANUAL_TELEGRAM_STATE_ROOT: "/tmp/ambient-telegram",
      AMBIENT_MANUAL_TELEGRAM_CONVERSATION_ID: "chat-123",
      AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SETUP_CODE: "AMBIENT-OWNER-HANDOFF-CHECK",
      AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_POLL_LIMIT: "7",
    });

    const checklist = ownerHandoffCheckChecklist({
      candidates,
      config,
      missing,
      env,
      printEnv: true,
    });
    expect(checklist).toContain("--check-handoff");
    expect(checklist).toContain("no-match as a valid preflight result");
    expect(checklist).toContain("intentionally ignores messages outgoing from the bridge account");
    expect(checklist).toContain("separate inbound owner/delegate account");
    expect(checklist).toContain('"AMBIENT_AGENT_TELEGRAM_API_HASH": "<present>"');
    expect(checklist).not.toContain("hash-secret");
  });

  it("builds a guided owner-loop checklist and env for live inbound testing", () => {
    const candidates = [
      {
        profileId: "profile-one",
        stateRoot: "/tmp/ambient-telegram",
        hasPhoneNumber: true,
        hasDatabaseEncryptionKey: true,
        authState: "ready",
      },
    ];
    const env = {
      AMBIENT_AGENT_TELEGRAM_API_ID: "123",
      AMBIENT_AGENT_TELEGRAM_API_HASH: "hash-secret",
    };
    const { config, missing } = resolveGuidedSmokeConfig({
      options: {
        conversationId: "chat-123",
        setupCode: "AMBIENT-GUIDED-OWNER-LOOP",
        commandText: "status",
        commandNotBefore: "2026-05-13T00:00:02.000Z",
        sendReply: true,
        waitSeconds: "30",
        pollIntervalMs: "1000",
      },
      candidates,
      env,
    });

    expect(missing).toEqual([]);
    expect(config).toMatchObject({
      profile: "profile-one",
      stateRoot: "/tmp/ambient-telegram",
      conversationId: "chat-123",
      setupCode: "AMBIENT-GUIDED-OWNER-LOOP",
      commandText: "status",
      commandNotBefore: "2026-05-13T00:00:02.000Z",
      sendReply: true,
      waitSeconds: "30",
      pollIntervalMs: "1000",
    });

    const guidedEnv = buildGuidedSmokeEnv(config, env);
    expect(guidedEnv).toMatchObject({
      AMBIENT_TEST_NATIVE: "1",
      AMBIENT_MANUAL_TELEGRAM_GUIDED_OWNER_LOOP_SMOKE: "1",
      AMBIENT_MANUAL_TELEGRAM_PROFILE_ID: "profile-one",
      AMBIENT_MANUAL_TELEGRAM_STATE_ROOT: "/tmp/ambient-telegram",
      AMBIENT_MANUAL_TELEGRAM_CONVERSATION_ID: "chat-123",
      AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SETUP_CODE: "AMBIENT-GUIDED-OWNER-LOOP",
      AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_COMMAND_TEXT: "status",
      AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_COMMAND_NOT_BEFORE: "2026-05-13T00:00:02.000Z",
      AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SEND_REPLY: "1",
      AMBIENT_MANUAL_TELEGRAM_GUIDED_OWNER_LOOP_WAIT_SECONDS: "30",
      AMBIENT_MANUAL_TELEGRAM_GUIDED_OWNER_LOOP_POLL_INTERVAL_MS: "1000",
    });
    expect(guidedEnv).not.toHaveProperty("AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SMOKE");

    const checklist = guidedOwnerLoopChecklist({
      candidates,
      config,
      missing,
      env,
      printEnv: true,
    });
    expect(checklist).toContain("--guided-run");
    expect(checklist).toContain("activationPlanFirst: yes");
    expect(checklist).toContain("ambient_messaging_telegram_owner_loop_activation_plan before lifecycle/directory work");
    expect(checklist).toContain("Start this script with --guided-run before sending Telegram messages");
    expect(checklist).toContain("After it reports a matched handoff");
    expect(checklist).toContain("call the activation plan again");
    expect(checklist).toContain("commandNotBefore: 2026-05-13T00:00:02.000Z");
    expect(checklist).toContain("--send-reply");
    expect(checklist).toContain("Use a private/sandbox conversation you control");
    expect(checklist).toContain("--directory-limit 1");
    expect(checklist).toContain("--poll-limit 24");
    expect(checklist).toContain("Same-account Telegram Desktop or Saved Messages sends will not work");
    expect(checklist).toContain('"AMBIENT_AGENT_TELEGRAM_API_HASH": "<present>"');
    expect(checklist).not.toContain("hash-secret");

    const { config: pollingConfig, missing: pollingMissing } = resolveGuidedSmokeConfig({
      options: {
        guidedPollingRun: true,
        conversationId: "chat-123",
        setupCode: "AMBIENT-GUIDED-OWNER-LOOP",
        commandText: "status",
        waitSeconds: "30",
        pollIntervalMs: "5000",
      },
      candidates,
      env,
    });
    expect(pollingMissing).toEqual([]);
    expect(pollingConfig.usePollingRunner).toBe(true);
    const pollingGuidedEnv = buildGuidedSmokeEnv(pollingConfig, env);
    expect(pollingGuidedEnv).toMatchObject({
      AMBIENT_MANUAL_TELEGRAM_GUIDED_OWNER_LOOP_POLLING_RUNNER: "1",
    });
    const pollingChecklist = guidedOwnerLoopChecklist({
      candidates,
      config: pollingConfig,
      missing: pollingMissing,
      env,
    });
    expect(pollingChecklist).toContain("--guided-polling-run");
    expect(pollingChecklist).toContain("periodic polling runner");
    expect(pollingChecklist).toContain("activationPlanFirst: yes");
  });

  it("renders redacted directory and owner-loop JSON report summaries", () => {
    const root = mkdtempSync(join(tmpdir(), "ambient-telegram-report-"));
    try {
      const directoryPath = join(root, "telegram-directory-candidates.json");
      writeFileSync(directoryPath, JSON.stringify({
        conversations: [
          {
            conversationId: "chat-123",
            title: "Test Chat",
            type: "private",
            unreadCount: 2,
            updatedAt: "2026-05-12T00:00:00.000Z",
          },
        ],
        privacy: {
          metadataOnly: true,
          includesMessageBodies: false,
          includesLastMessage: false,
        },
      }));
      const directorySummary = directoryListResultText({
        outputPath: directoryPath,
        config: {
          profile: "profile-one",
          stateRoot: "/tmp/ambient-telegram",
          outputDir: root,
          directoryLimit: "25",
        },
      });
      expect(directorySummary).toContain("Telegram metadata-only directory result");
      expect(directorySummary).toContain("conversationId=chat-123");
      expect(directorySummary).toContain("title=Test Chat");
      expect(directorySummary).toContain("--guided-run");
      expect(directorySummary).toContain("--directory-limit 25");
      expect(directorySummary).toContain(`--output-dir ${root}`);
      expect(directorySummary).not.toContain("lastMessage");

      writeFileSync(directoryPath, JSON.stringify({
        conversations: [
          {
            conversationId: "chat-123",
            title: "Test Chat",
            type: "private",
          },
          {
            conversationId: "group-456",
            title: "Production Group",
            type: "group",
          },
        ],
        privacy: {
          metadataOnly: true,
          includesMessageBodies: false,
          includesLastMessage: false,
        },
      }));
      const multiDirectorySummary = directoryListResultText({
        outputPath: directoryPath,
        config: {
          profile: "profile-one",
          stateRoot: "/tmp/ambient-telegram",
          outputDir: root,
          directoryLimit: "25",
        },
      });
      expect(multiDirectorySummary).toContain("No guided command was emitted automatically because multiple conversations were returned.");
      expect(multiDirectorySummary).toContain("Choose a safe private/sandbox conversation");
      expect(multiDirectorySummary).not.toContain("Next preview-only guided smoke command:");

      const selectedGroupDirectorySummary = directoryListResultText({
        outputPath: directoryPath,
        config: {
          profile: "profile-one",
          stateRoot: "/tmp/ambient-telegram",
          conversationId: "group-456",
          outputDir: root,
          directoryLimit: "25",
        },
      });
      expect(selectedGroupDirectorySummary).toContain("Selected conversation type is group; use only if this is an approved sandbox/test channel.");
      expect(selectedGroupDirectorySummary).toContain("--conversation group-456");

      const ownerLoopPath = join(root, "telegram-owner-loop-result.json");
      writeFileSync(ownerLoopPath, JSON.stringify({
        status: "failed",
        currentStep: "owner_handoff",
        failure: {
          message: "Owner handoff did not match before timeout.",
        },
        activationPlan: {
          planFirst: true,
          initial: {
            status: "ready",
            recommendedNextTool: "ambient_messaging_gateway_status",
          },
          afterBinding: {
            status: "ready",
            recommendedNextTool: "ambient_messaging_telegram_bridge_polling_preview",
          },
        },
        handoff: {
          status: "waiting",
          attempts: 2,
        },
        commandPoll: {
          status: "waiting",
          attempts: 1,
          minReceivedAt: "2026-05-13T00:00:01.000Z",
          staleMessageCount: 3,
        },
        pollingRunner: {
          startStatus: "applied",
          scheduledStatus: {
            totalPollCount: 2,
          },
          stopStatus: "applied",
        },
        queuedProjectionId: "projection-1",
        runtimeEventId: "event-1",
        relayActionStatus: "preview-ready",
        previewStatus: "ready",
        delegatedPreviewToolName: "ambient_messaging_telegram_bridge_reply_preview",
        replySent: false,
      }));
      const ownerSummary = ownerLoopResultText({ outputPath: ownerLoopPath });
      expect(ownerSummary).toContain("Telegram owner-loop result");
      expect(ownerSummary).toContain("Status: failed");
      expect(ownerSummary).toContain("Current step: owner_handoff");
      expect(ownerSummary).toContain("Failure: Owner handoff did not match before timeout.");
      expect(ownerSummary).toContain("Activation plan first: yes");
      expect(ownerSummary).toContain("Initial activation status: ready");
      expect(ownerSummary).toContain("Initial activation next tool: ambient_messaging_gateway_status");
      expect(ownerSummary).toContain("After-binding activation status: ready");
      expect(ownerSummary).toContain("After-binding recommended next tool: ambient_messaging_telegram_bridge_polling_preview");
      expect(ownerSummary).toContain("Handoff: waiting after 2 attempt(s)");
      expect(ownerSummary).toContain("Command freshness anchor: 2026-05-13T00:00:01.000Z");
      expect(ownerSummary).toContain("Stale command-poll messages: 3");
      expect(ownerSummary).toContain("Polling runner start: applied");
      expect(ownerSummary).toContain("Polling runner scheduled polls: 2");
      expect(ownerSummary).toContain("Polling runner stop: applied");
      expect(ownerSummary).toContain("Runtime event: event-1");
      expect(ownerSummary).toContain("Reply sent: no");
      expect(ownerSummary).toContain("--send-reply");

      writeFileSync(ownerLoopPath, JSON.stringify({
        status: "completed",
        currentStep: "completed",
        queuedProjectionId: "projection-2",
        runtimeEventId: "event-2",
        relayActionStatus: "preview-ready",
        previewStatus: "ready",
        delegatedPreviewToolName: "ambient_messaging_telegram_bridge_reply_preview",
        replySent: true,
        replyApplyStatus: "sent",
        delegatedApplyToolName: "ambient_messaging_telegram_bridge_reply_apply",
        providerMessageId: "provider-message-2",
        deliveryStatus: "sent",
        relayStatusAfterSend: "sent",
        relayActionStatusAfterSend: "already-relayed",
        duplicateBlockedAfterSend: true,
        duplicatePreviewStatus: "blocked",
        duplicateApplyStatus: "blocked",
      }));
      const sentOwnerSummary = ownerLoopResultText({ outputPath: ownerLoopPath });
      expect(sentOwnerSummary).toContain("Reply sent: yes");
      expect(sentOwnerSummary).toContain("Apply status: sent");
      expect(sentOwnerSummary).toContain("Provider message: provider-message-2");
      expect(sentOwnerSummary).toContain("Delivery status: sent");
      expect(sentOwnerSummary).toContain("Relay status after send: sent");
      expect(sentOwnerSummary).toContain("Relay action status after send: already-relayed");
      expect(sentOwnerSummary).toContain("Duplicate blocked after send: yes");
      expect(sentOwnerSummary).toContain("Duplicate preview status: blocked");
      expect(sentOwnerSummary).toContain("Duplicate apply status: blocked");
      expect(sentOwnerSummary).not.toContain("--send-reply only after explicit approval");

      const operatorPacketPath = join(root, "telegram-owner-loop-operator-packet.json");
      writeFileSync(operatorPacketPath, JSON.stringify({
        conversationId: "chat-123",
        operatorInstructionsPath: join(root, "telegram-owner-loop-operator-instructions.md"),
        activationPlan: {
          planFirst: true,
          tool: "ambient_messaging_telegram_owner_loop_activation_plan",
        },
        setupCode: "AMBIENT-GUIDED-OWNER-LOOP",
        commandText: "switch project Manual Relay Smoke",
        commands: {
          previewOnly: "node scripts/manual-telegram-owner-loop-smoke.mjs --guided-run --conversation chat-123",
        },
      }));
      const operatorSummary = ownerLoopOperatorPacketText({ outputPath: operatorPacketPath });
      expect(operatorSummary).toContain("Telegram owner-loop operator packet");
      expect(operatorSummary).toContain("Instructions:");
      expect(operatorSummary).toContain("Activation plan first: yes");
      expect(operatorSummary).toContain("Setup message: AMBIENT-GUIDED-OWNER-LOOP");
      expect(operatorSummary).toContain("Command message: switch project Manual Relay Smoke");
      expect(operatorSummary).toContain("Preview-only command:");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
