import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AgentRuntime } from "./agentRuntime";
import { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import { manualTelegramGuidedOwnerLoopSmokeChecklist } from "./agentRuntimeManualTelegramSmokeChecklists";
import {
  applyManualOwnerLoopCommand,
  delay,
  errorMessage,
  manualTelegramOwnerLoopProjectFeatures,
  normalizedIsoFromEnv,
  previewManualOwnerLoopRelay,
} from "./agentRuntimeManualTelegramOwnerLoopTestSupport";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describeNative("AgentRuntime manual guided Telegram owner loop smoke", () => {
  const itManualTelegramGuidedOwnerLoopSmoke = process.env.AMBIENT_MANUAL_TELEGRAM_GUIDED_OWNER_LOOP_SMOKE === "1" ? it : it.skip;

  itManualTelegramGuidedOwnerLoopSmoke("manual guided Telegram owner loop smoke", async () => {
    const profileId = process.env.AMBIENT_MANUAL_TELEGRAM_PROFILE_ID?.trim();
    const stateRoot = process.env.AMBIENT_MANUAL_TELEGRAM_STATE_ROOT?.trim()
      || process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT?.trim();
    const conversationId = process.env.AMBIENT_MANUAL_TELEGRAM_CONVERSATION_ID?.trim();
    const setupCode = process.env.AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SETUP_CODE?.trim();
    const directoryQuery = process.env.AMBIENT_MANUAL_TELEGRAM_DIRECTORY_QUERY?.trim();
    const directoryLimit = Number(process.env.AMBIENT_MANUAL_TELEGRAM_DIRECTORY_LIMIT ?? "10");
    const pollLimit = Number(process.env.AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_POLL_LIMIT ?? "10");
    const waitSeconds = Number(process.env.AMBIENT_MANUAL_TELEGRAM_GUIDED_OWNER_LOOP_WAIT_SECONDS ?? "180");
    const pollIntervalMs = Number(process.env.AMBIENT_MANUAL_TELEGRAM_GUIDED_OWNER_LOOP_POLL_INTERVAL_MS ?? "5000");
    const waitMs = Math.max(1_000, Number.isFinite(waitSeconds) ? waitSeconds * 1_000 : 180_000);
    const intervalMs = Math.max(500, Number.isFinite(pollIntervalMs) ? pollIntervalMs : 5_000);
    const usePollingRunner = process.env.AMBIENT_MANUAL_TELEGRAM_GUIDED_OWNER_LOOP_POLLING_RUNNER === "1";
    const commandText = process.env.AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_COMMAND_TEXT?.trim()
      || "switch project Manual Relay Smoke";
    const commandNotBefore = normalizedIsoFromEnv(
      process.env.AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_COMMAND_NOT_BEFORE,
      "AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_COMMAND_NOT_BEFORE",
    );
    const sendReply = process.env.AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SEND_REPLY === "1";
    const ownerLoopOutputPath = process.env.AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_OUTPUT_PATH?.trim();
    if (
      !profileId ||
      !stateRoot ||
      !conversationId ||
      !setupCode ||
      !process.env.AMBIENT_AGENT_TELEGRAM_API_ID?.trim() ||
      !process.env.AMBIENT_AGENT_TELEGRAM_API_HASH?.trim()
    ) {
      throw new Error(manualTelegramGuidedOwnerLoopSmokeChecklist({
        profileId,
        stateRoot,
        conversationId,
        setupCode,
        apiCredentialsPresent: Boolean(process.env.AMBIENT_AGENT_TELEGRAM_API_ID?.trim() && process.env.AMBIENT_AGENT_TELEGRAM_API_HASH?.trim()),
      }));
    }

    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-manual-telegram-guided-loop-"));
    const store = new ProjectStore();
    const originalEnv = {
      stateRoot: process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT,
    };
    let tool: ((name: string) => { name: string; execute: (...args: any[]) => Promise<any> }) | undefined;
    let bindingId: string | undefined;
    let pollingRunnerStarted = false;
    let currentStep = "configured";
    const setupCodePreview = setupCode.length <= 16 ? setupCode : `${setupCode.slice(0, 8)}...${setupCode.slice(-4)}`;
    const compactPollingStatus = (status: any) => ({
      state: status?.state,
      running: status?.running,
      totalPollCount: status?.totalPollCount,
      successfulPollCount: status?.successfulPollCount,
      failedPollCount: status?.failedPollCount,
      fetchedMessageCount: status?.fetchedMessageCount,
      candidateMessageCount: status?.candidateMessageCount,
      duplicateMessageCount: status?.duplicateMessageCount,
      staleMessageCount: status?.staleMessageCount,
      acceptedDispatchCount: status?.acceptedDispatchCount,
      droppedDispatchCount: status?.droppedDispatchCount,
      lastSuccessfulPollAt: status?.lastSuccessfulPollAt,
      nextPollDueAt: status?.nextPollDueAt,
      lastError: status?.lastError,
    });
    const compactActivationPlan = (details: any) => ({
      status: details?.status,
      recommendedNextTool: details?.recommendedNextTool,
      selectedProfileId: details?.selectedProfileId,
      selectedConversationId: details?.selectedConversationId,
      selectedBindingId: details?.selectedBinding?.bindingId,
      pollingState: details?.polling?.state,
      pollingRunning: details?.polling?.running,
      phaseStatuses: Array.isArray(details?.phases)
        ? details.phases.map((phase: any) => ({
          id: phase.id,
          status: phase.status,
          toolSequence: phase.toolSequence,
        }))
        : [],
    });
    let activationPlanInitialSummary: ReturnType<typeof compactActivationPlan> | undefined;
    let activationPlanAfterBindingSummary: ReturnType<typeof compactActivationPlan> | undefined;
    const writeGuidedOutput = async (patch: Record<string, unknown>) => {
      if (!ownerLoopOutputPath) return;
      let existing: Record<string, unknown>;
      try {
        existing = JSON.parse(await readFile(ownerLoopOutputPath, "utf8"));
      } catch {
        existing = {};
      }
      await writeFile(ownerLoopOutputPath, JSON.stringify({
        generatedAt: existing.generatedAt ?? new Date().toISOString(),
        profileId,
        conversationId,
        setupCodePreview,
        commandText,
        sendReply,
        privacy: {
          providerMessageBodiesReturned: false,
          providerHistoryRead: false,
        },
        ...existing,
        ...patch,
        updatedAt: new Date().toISOString(),
      }, null, 2), "utf8");
    };
    try {
      process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT = stateRoot;
      store.openWorkspace(workspacePath);
      const thread = store.updateThreadSettings(store.createThread("manual guided Telegram owner loop smoke").id, { permissionMode: "workspace" });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: async (request) => {
          if (
            request.toolName === "ambient_messaging_gateway_lifecycle_apply" ||
            request.toolName === "ambient_messaging_telegram_conversation_directory_apply" ||
            request.toolName === "ambient_messaging_telegram_owner_handoff_apply" ||
            request.toolName === "ambient_messaging_telegram_remote_surface_apply" ||
            request.toolName === "ambient_messaging_telegram_bridge_poll_apply" ||
            request.toolName === "ambient_messaging_telegram_bridge_polling_apply" ||
            request.toolName === "ambient_messaging_remote_surface_command_apply" ||
            (sendReply && request.toolName === "ambient_messaging_telegram_bridge_reply_apply")
          ) {
            return { allowed: true, mode: "allow_once" };
          }
          throw new Error(`Unexpected manual guided Telegram owner-loop permission request: ${request.title}`);
        },
        denyThread: () => undefined,
      }, manualTelegramOwnerLoopProjectFeatures(workspacePath));
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      (runtime as any).createMessagingGatewayToolExtension(thread.id, store.getWorkspace())({
        registerTool: (registeredTool: any) => registeredTools.push(registeredTool),
      });
      tool = (name: string) => {
        const found = registeredTools.find((candidate) => candidate.name === name);
        if (!found) throw new Error(`Missing tool ${name}`);
        return found;
      };

      currentStep = "activation_plan_initial";
      await writeGuidedOutput({
        status: "running",
        currentStep,
        waitMs,
        intervalMs,
        usePollingRunner,
      });
      const activationPlanInitial = await tool("ambient_messaging_telegram_owner_loop_activation_plan").execute("manual-guided-owner-loop-activation-plan-initial", {
        profileId,
        conversationId,
        setupCode,
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
        limit: Number.isFinite(pollLimit) ? pollLimit : 10,
        intervalMs: Math.max(5_000, intervalMs),
        ...(commandNotBefore ? { minReceivedAt: commandNotBefore } : {}),
      });
      expect(activationPlanInitial.details.toolName).toBe("ambient_messaging_telegram_owner_loop_activation_plan");
      expect(Array.isArray(activationPlanInitial.details.phases)).toBe(true);
      activationPlanInitialSummary = compactActivationPlan(activationPlanInitial.details);
      await writeGuidedOutput({
        currentStep,
        activationPlan: {
          planFirst: true,
          initial: activationPlanInitialSummary,
        },
      });

      currentStep = "starting_gateway";
      const lifecycle = await tool("ambient_messaging_gateway_lifecycle_apply").execute("manual-guided-owner-loop-start-real", {
        action: "start",
        providerId: "telegram-tdlib",
        mode: "real",
      });
      expect(lifecycle.details.status).toBe("applied");
      await writeGuidedOutput({
        currentStep: "gateway_started",
        gateway: {
          providerId: "telegram-tdlib",
          mode: "real",
          status: lifecycle.details.status,
        },
      });

      currentStep = "metadata_directory";
      const directoryInput = {
        profileId,
        limit: Number.isFinite(directoryLimit) ? directoryLimit : 10,
        ...(directoryQuery ? { query: directoryQuery } : {}),
      };
      const directoryPreview = await tool("ambient_messaging_telegram_conversation_directory_preview").execute("manual-guided-owner-loop-directory-preview", directoryInput);
      expect(directoryPreview.details.status).toBe("ready");
      const directoryResult = await tool("ambient_messaging_telegram_conversation_directory_apply").execute("manual-guided-owner-loop-directory-apply", directoryInput);
      expect(directoryResult.details.status).toBe("applied");
      expect(directoryResult.details.failureMode).toBe("none");
      expect(JSON.stringify(directoryResult.details.conversations)).not.toContain("lastMessage");
      const directoryConversationIds = (directoryResult.details.conversations as Array<{ conversationId: string; title?: string }>)
        .map((conversation) => conversation.conversationId);
      await writeGuidedOutput({
        currentStep,
        directory: {
          status: directoryResult.details.status,
          failureMode: directoryResult.details.failureMode,
          returnedConversationCount: directoryResult.details.returnedConversationCount,
          selectedConversationPresent: directoryConversationIds.includes(conversationId),
          metadataOnly: true,
        },
      });
      expect(directoryConversationIds).toContain(conversationId);

      currentStep = "owner_handoff";
      const handoffInput = {
        profileId,
        conversationId,
        setupCode,
        limit: Number.isFinite(pollLimit) ? pollLimit : 10,
      };
      const handoffPreview = await tool("ambient_messaging_telegram_owner_handoff_preview").execute("manual-guided-owner-loop-handoff-preview", handoffInput);
      expect(handoffPreview.details.status).toBe("ready");
      console.info([
        "Manual guided Telegram owner-loop waiting for inbound setup code.",
        JSON.stringify({
          conversationId,
          setupCodePreview,
          waitMs,
          intervalMs,
        }, null, 2),
      ].join("\n"));
      await writeGuidedOutput({
        currentStep,
        handoff: {
          status: "waiting",
          attempts: 0,
        },
      });

      let handoff: any | undefined;
      const handoffDeadline = Date.now() + waitMs;
      let handoffAttempt = 0;
      while (Date.now() <= handoffDeadline) {
        handoffAttempt += 1;
        handoff = await tool("ambient_messaging_telegram_owner_handoff_apply").execute(`manual-guided-owner-loop-handoff-apply-${handoffAttempt}`, handoffInput);
        if (handoff.details.applyStatus !== "applied") {
          throw new Error(`Owner handoff apply returned ${handoff.details.applyStatus}: ${handoff.details.error ?? "no error"}`);
        }
        if (handoff.details.handoffStatus === "matched") {
          await writeGuidedOutput({
            currentStep,
            handoff: {
              status: "matched",
              attempts: handoffAttempt,
              fetchedMessageCount: handoff.details.fetchedMessageCount,
              candidateMessageCount: handoff.details.candidateMessageCount,
              matchedMessageCount: handoff.details.matchedMessageCount,
              ownerUserId: handoff.details.ownerUserId,
              sourceMessageId: handoff.details.sourceMessageId,
            },
          });
          break;
        }
        if (handoff.details.handoffStatus === "ambiguous") {
          await writeGuidedOutput({
            currentStep,
            handoff: {
              status: "ambiguous",
              attempts: handoffAttempt,
              fetchedMessageCount: handoff.details.fetchedMessageCount,
              candidateMessageCount: handoff.details.candidateMessageCount,
              matchedMessageCount: handoff.details.matchedMessageCount,
            },
          });
          throw new Error("Owner handoff became ambiguous; repeat guided smoke with a new setup code.");
        }
        console.info([
          "Manual guided Telegram owner-loop handoff still waiting.",
          JSON.stringify({
            attempt: handoffAttempt,
            fetchedMessageCount: handoff.details.fetchedMessageCount,
            candidateMessageCount: handoff.details.candidateMessageCount,
            matchedMessageCount: handoff.details.matchedMessageCount,
          }, null, 2),
        ].join("\n"));
        await writeGuidedOutput({
          currentStep,
          handoff: {
            status: handoff.details.handoffStatus,
            attempts: handoffAttempt,
            fetchedMessageCount: handoff.details.fetchedMessageCount,
            candidateMessageCount: handoff.details.candidateMessageCount,
            matchedMessageCount: handoff.details.matchedMessageCount,
          },
        });
        await delay(intervalMs);
      }
      if (!handoff) {
        throw new Error("Owner handoff did not run before the guided wait expired.");
      }
      if (handoff.details.handoffStatus !== "matched") {
        throw new Error(`Owner handoff did not match before the guided wait expired: status=${handoff.details.handoffStatus} attempts=${handoffAttempt}. Send the setup code from a separate inbound owner/delegate Telegram account, not from the bridge account.`);
      }
      expect(handoff.details).toMatchObject({
        applyStatus: "applied",
        handoffStatus: "matched",
      });
      const ownerUserId = handoff.details.ownerUserId;
      const ownerHandoffSourceMessageId = handoff.details.sourceMessageId;
      expect(ownerUserId).toBeTruthy();
      expect(ownerHandoffSourceMessageId).toBeTruthy();

      const binding = await tool("ambient_messaging_telegram_remote_surface_apply").execute("manual-guided-owner-loop-binding-apply", {
        action: "create",
        purpose: "remote_ambient_surface",
        profileId,
        conversationId,
        ownerUserId,
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
        ownerHandoffSourceMessageId,
      });
      expect(binding.details.status).toBe("applied");
      bindingId = binding.details.lifecycle.binding.id;
      await writeGuidedOutput({
        currentStep: "binding_created",
        binding: {
          status: binding.details.status,
          bindingId,
          purpose: "remote_ambient_surface",
          ambientSurface: "projects",
        },
      });

      currentStep = "activation_plan_after_binding";
      const activationPlanAfterBinding = await tool("ambient_messaging_telegram_owner_loop_activation_plan").execute("manual-guided-owner-loop-activation-plan-after-binding", {
        profileId,
        conversationId,
        setupCode,
        ownerUserId,
        ownerHandoffSourceMessageId,
        bindingId,
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
        limit: Number.isFinite(pollLimit) ? pollLimit : 10,
        intervalMs: Math.max(5_000, intervalMs),
        ...(commandNotBefore ? { minReceivedAt: commandNotBefore } : {}),
      });
      expect(activationPlanAfterBinding.details.toolName).toBe("ambient_messaging_telegram_owner_loop_activation_plan");
      expect(Array.isArray(activationPlanAfterBinding.details.phases)).toBe(true);
      activationPlanAfterBindingSummary = compactActivationPlan(activationPlanAfterBinding.details);
      await writeGuidedOutput({
        currentStep,
        activationPlan: {
          planFirst: true,
          initial: activationPlanInitialSummary,
          afterBinding: activationPlanAfterBindingSummary,
        },
      });

      let queuedProjectionId: string | undefined;
      if (usePollingRunner) {
        currentStep = "owner_command_polling_runner";
        const pollingIntervalMs = Math.max(5_000, intervalMs);
        console.info([
          "Manual guided Telegram owner-loop starting periodic command polling.",
          JSON.stringify({ conversationId, commandText, waitMs, pollingIntervalMs }, null, 2),
        ].join("\n"));
        const pollingInput = {
          action: "start",
          profileId,
          bindingId,
          limit: Number.isFinite(pollLimit) ? pollLimit : 10,
          intervalMs: pollingIntervalMs,
          ...(commandNotBefore ? { minReceivedAt: commandNotBefore } : {}),
        };
        const pollingPreview = await tool("ambient_messaging_telegram_bridge_polling_preview").execute("manual-guided-owner-loop-polling-preview", pollingInput);
        expect(pollingPreview.details.status).toBe("ready");
        const pollingStart = await tool("ambient_messaging_telegram_bridge_polling_apply").execute("manual-guided-owner-loop-polling-start", pollingInput);
        expect(pollingStart.details.status).toBe("applied");
        pollingRunnerStarted = true;
        const immediatePoll = pollingStart.details.immediatePollResult;
        const acceptedDispatch = immediatePoll?.bindingResults
          ?.flatMap((bindingResult: any) => bindingResult.dispatches)
          .find((dispatch: any) => dispatch.accepted && dispatch.queuedProjection?.id && dispatch.event?.text === commandText);
        if (!acceptedDispatch) {
          await writeGuidedOutput({
            currentStep,
            commandPoll: {
              status: "no-match-via-polling-runner",
              attempts: 1,
              fetchedMessageCount: immediatePoll?.fetchedMessageCount,
              candidateMessageCount: immediatePoll?.candidateMessageCount,
              duplicateMessageCount: immediatePoll?.duplicateMessageCount,
              staleMessageCount: immediatePoll?.staleMessageCount,
              acceptedDispatchCount: immediatePoll?.acceptedDispatchCount,
              droppedDispatchCount: immediatePoll?.droppedDispatchCount,
              minReceivedAt: commandNotBefore,
            },
            pollingRunner: {
              startStatus: pollingStart.details.status,
              runtimeStatus: compactPollingStatus(pollingStart.details.runtimeStatus),
            },
          });
          throw new Error("Periodic Telegram polling runner started but the immediate poll did not accept the expected owner command.");
        }
        queuedProjectionId = acceptedDispatch.queuedProjection.id;
        await writeGuidedOutput({
          currentStep,
          commandPoll: {
            status: "matched-via-polling-runner",
            attempts: 1,
            fetchedMessageCount: immediatePoll.fetchedMessageCount,
            candidateMessageCount: immediatePoll.candidateMessageCount,
            duplicateMessageCount: immediatePoll.duplicateMessageCount,
            staleMessageCount: immediatePoll.staleMessageCount,
            acceptedDispatchCount: immediatePoll.acceptedDispatchCount,
            droppedDispatchCount: immediatePoll.droppedDispatchCount,
            minReceivedAt: commandNotBefore,
            queuedProjectionId,
            sourceEventId: acceptedDispatch.event?.id,
            sourceReceivedAt: acceptedDispatch.event?.receivedAt,
          },
          pollingRunner: {
            startStatus: pollingStart.details.status,
            intervalMs: pollingIntervalMs,
            runtimeStatus: compactPollingStatus(pollingStart.details.runtimeStatus),
          },
        });

        const scheduledDeadline = Date.now() + Math.min(waitMs, pollingIntervalMs * 3 + 2_000);
        let pollingStatus: any | undefined;
        while (Date.now() <= scheduledDeadline) {
          pollingStatus = await tool("ambient_messaging_telegram_bridge_polling_status").execute("manual-guided-owner-loop-polling-status-scheduled", {});
          if ((pollingStatus.details.telegramBridgePolling?.totalPollCount ?? 0) >= 2) {
            break;
          }
          await delay(500);
        }
        const scheduledRuntimeStatus = pollingStatus?.details.telegramBridgePolling;
        if ((scheduledRuntimeStatus?.totalPollCount ?? 0) < 2) {
          throw new Error(`Periodic Telegram polling runner did not complete a scheduled tick before timeout; totalPollCount=${scheduledRuntimeStatus?.totalPollCount ?? 0}.`);
        }
        await writeGuidedOutput({
          currentStep,
          pollingRunner: {
            startStatus: pollingStart.details.status,
            intervalMs: pollingIntervalMs,
            runtimeStatus: compactPollingStatus(pollingStart.details.runtimeStatus),
            scheduledStatus: compactPollingStatus(scheduledRuntimeStatus),
          },
        });
        const pollingStop = await tool("ambient_messaging_telegram_bridge_polling_apply").execute("manual-guided-owner-loop-polling-stop", {
          action: "stop",
          profileId,
          bindingId,
          limit: Number.isFinite(pollLimit) ? pollLimit : 10,
          intervalMs: pollingIntervalMs,
          ...(commandNotBefore ? { minReceivedAt: commandNotBefore } : {}),
        });
        expect(pollingStop.details.status).toBe("applied");
        pollingRunnerStarted = false;
        await writeGuidedOutput({
          currentStep,
          pollingRunner: {
            startStatus: pollingStart.details.status,
            intervalMs: pollingIntervalMs,
            runtimeStatus: compactPollingStatus(pollingStart.details.runtimeStatus),
            scheduledStatus: compactPollingStatus(scheduledRuntimeStatus),
            stopStatus: pollingStop.details.status,
            stoppedStatus: compactPollingStatus(pollingStop.details.runtimeStatus),
          },
        });
      } else {
        currentStep = "owner_command_poll";
        console.info([
          "Manual guided Telegram owner-loop waiting for inbound command.",
          JSON.stringify({ conversationId, commandText, waitMs, intervalMs }, null, 2),
        ].join("\n"));
        await writeGuidedOutput({
          currentStep,
          commandPoll: {
            status: "waiting",
            attempts: 0,
          },
        });

        const pollInput = {
          profileId,
          bindingId,
          limit: Number.isFinite(pollLimit) ? pollLimit : 10,
          ...(commandNotBefore ? { minReceivedAt: commandNotBefore } : {}),
        };
        const pollPreview = await tool("ambient_messaging_telegram_bridge_poll_preview").execute("manual-guided-owner-loop-poll-preview", pollInput);
        expect(pollPreview.details.status).toBe("ready");
        let poll: any | undefined;
        let acceptedDispatch: any | undefined;
        const commandDeadline = Date.now() + waitMs;
        let pollAttempt = 0;
        while (Date.now() <= commandDeadline) {
          pollAttempt += 1;
          poll = await tool("ambient_messaging_telegram_bridge_poll_apply").execute(`manual-guided-owner-loop-poll-apply-${pollAttempt}`, pollInput);
          if (poll.details.applyStatus !== "applied") {
            throw new Error(`Telegram bridge poll returned ${poll.details.applyStatus}.`);
          }
          acceptedDispatch = poll.details.bindingResults
            .flatMap((bindingResult: any) => bindingResult.dispatches)
            .find((dispatch: any) => dispatch.accepted && dispatch.queuedProjection?.id && dispatch.event?.text === commandText);
          if (acceptedDispatch) {
            await writeGuidedOutput({
              currentStep,
              commandPoll: {
                status: "matched",
                attempts: pollAttempt,
                fetchedMessageCount: poll.details.fetchedMessageCount,
                candidateMessageCount: poll.details.candidateMessageCount,
                duplicateMessageCount: poll.details.duplicateMessageCount,
                staleMessageCount: poll.details.staleMessageCount,
                acceptedDispatchCount: poll.details.acceptedDispatchCount,
                droppedDispatchCount: poll.details.droppedDispatchCount,
                minReceivedAt: commandNotBefore,
                queuedProjectionId: acceptedDispatch.queuedProjection.id,
                sourceEventId: acceptedDispatch.event?.id,
                sourceReceivedAt: acceptedDispatch.event?.receivedAt,
              },
            });
            break;
          }
          console.info([
            "Manual guided Telegram owner-loop command still waiting.",
            JSON.stringify({
              attempt: pollAttempt,
              fetchedMessageCount: poll.details.fetchedMessageCount,
              candidateMessageCount: poll.details.candidateMessageCount,
              duplicateMessageCount: poll.details.duplicateMessageCount,
              staleMessageCount: poll.details.staleMessageCount,
              acceptedDispatchCount: poll.details.acceptedDispatchCount,
              droppedDispatchCount: poll.details.droppedDispatchCount,
              minReceivedAt: commandNotBefore,
            }, null, 2),
          ].join("\n"));
          await writeGuidedOutput({
            currentStep,
            commandPoll: {
              status: "waiting",
              attempts: pollAttempt,
              fetchedMessageCount: poll.details.fetchedMessageCount,
              candidateMessageCount: poll.details.candidateMessageCount,
              duplicateMessageCount: poll.details.duplicateMessageCount,
              staleMessageCount: poll.details.staleMessageCount,
              acceptedDispatchCount: poll.details.acceptedDispatchCount,
              droppedDispatchCount: poll.details.droppedDispatchCount,
              minReceivedAt: commandNotBefore,
            },
          });
          await delay(intervalMs);
        }
        queuedProjectionId = acceptedDispatch?.queuedProjection?.id;
        if (!queuedProjectionId) {
          throw new Error(`Owner command was not accepted before the guided wait expired: attempts=${pollAttempt}. Send the exact command text after the owner handoff is matched.`);
        }
      }
      if (!queuedProjectionId) {
        throw new Error("Owner command did not produce a queued projection.");
      }
      const matchedQueuedProjectionId = queuedProjectionId;
      expect(matchedQueuedProjectionId).toBeTruthy();

      const commandPreview = await tool("ambient_messaging_remote_surface_command_preview").execute("manual-guided-owner-loop-command-preview", {
        queuedProjectionId: matchedQueuedProjectionId,
      });
      expect(commandPreview.details.status).toBe("ready");
      const commandApplyError = await applyManualOwnerLoopCommand({
        tool,
        toolCallId: "manual-guided-owner-loop-command-apply",
        queuedProjectionId: matchedQueuedProjectionId,
      });
      if (commandApplyError) {
        expect(errorMessage(commandApplyError)).toContain("Ambient active project switching is not available");
      }
      await writeGuidedOutput({
        currentStep: "command_applied",
        queuedProjectionId: matchedQueuedProjectionId,
        commandApply: {
          status: commandApplyError ? "nonfatal-error" : "applied",
          error: commandApplyError ? errorMessage(commandApplyError) : undefined,
        },
      });

      currentStep = "relay_preview";
      await previewManualOwnerLoopRelay({
        tool,
        toolCallIdPrefix: "manual-guided-owner-loop",
        queuedProjectionId: matchedQueuedProjectionId,
        sendReply,
      });

      const revoked = await tool("ambient_messaging_telegram_remote_surface_apply").execute("manual-guided-owner-loop-binding-revoke", {
        action: "revoke",
        bindingId,
        reason: "manual guided Telegram owner-loop smoke cleanup",
      });
      expect(revoked.details.status).toBe("applied");
      bindingId = undefined;

      await tool("ambient_messaging_gateway_lifecycle_apply").execute("manual-guided-owner-loop-stop-real", {
        action: "stop",
        providerId: "telegram-tdlib",
        mode: "real",
      });
      await writeGuidedOutput({
        status: "completed",
        currentStep: "completed",
        activationPlan: {
          planFirst: true,
          initial: activationPlanInitialSummary,
          afterBinding: activationPlanAfterBindingSummary,
        },
        cleanup: {
          bindingRevoked: true,
          pollingStopped: usePollingRunner ? true : undefined,
          gatewayStopped: true,
        },
      });
    } catch (error) {
      await writeGuidedOutput({
        status: "failed",
        currentStep,
        failure: {
          message: errorMessage(error),
        },
        activationPlan: {
          planFirst: true,
          initial: activationPlanInitialSummary,
          afterBinding: activationPlanAfterBindingSummary,
        },
        cleanup: {
          bindingRevoked: bindingId ? "pending-finally" : true,
          pollingStopped: pollingRunnerStarted ? "pending-finally" : (usePollingRunner ? true : undefined),
          gatewayStopped: "pending-finally",
        },
      });
      throw error;
    } finally {
      if (tool && pollingRunnerStarted) {
        try {
          await tool("ambient_messaging_telegram_bridge_polling_apply").execute("manual-guided-owner-loop-polling-stop-finally", {
            action: "stop",
            profileId,
            bindingId,
            limit: Number.isFinite(pollLimit) ? pollLimit : 10,
            intervalMs: Math.max(5_000, intervalMs),
            ...(commandNotBefore ? { minReceivedAt: commandNotBefore } : {}),
          });
        } catch {
          // Best-effort cleanup for manual smoke failures; preserve the original test error.
        }
      }
      if (tool && bindingId) {
        try {
          await tool("ambient_messaging_telegram_remote_surface_apply").execute("manual-guided-owner-loop-binding-revoke-finally", {
            action: "revoke",
            bindingId,
            reason: "manual guided Telegram owner-loop smoke finally cleanup",
          });
        } catch {
          // Best-effort cleanup for manual smoke failures; preserve the original test error.
        }
      }
      if (tool) {
        try {
          await tool("ambient_messaging_gateway_lifecycle_apply").execute("manual-guided-owner-loop-stop-real-finally", {
            action: "stop",
            providerId: "telegram-tdlib",
            mode: "real",
          });
        } catch {
          // Best-effort cleanup for manual smoke failures; preserve the original test error.
        }
      }
      if (originalEnv.stateRoot === undefined) delete process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT;
      else process.env.AMBIENT_AGENT_TELEGRAM_STATE_ROOT = originalEnv.stateRoot;
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  }, 420_000);
});
