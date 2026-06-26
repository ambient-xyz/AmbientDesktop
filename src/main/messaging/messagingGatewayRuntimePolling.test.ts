import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEmptyMessagingBindingRegistry } from "./messagingBindings";
import { buildRuntimeSurfaceSnapshot } from "../../shared/runtimeSurfaceSnapshot";
import { MessagingGatewayRunner } from "./messagingGatewayRunner";
import { createDefaultMessagingProviderRegistry } from "./messagingGatewayRegistry";
import {
  applyTelegramBridgePoll,
  buildTelegramBridgePollPlan,
  TelegramBridgePollingRunner,
  telegramBridgePollingControlInput,
  telegramBridgePollingControlPreviewText,
  telegramBridgePollingControlResultText,
  telegramBridgePollingStatusText,
  telegramBridgePollPlanText,
  telegramBridgePollResultText,
  telegramBridgePollToolInput,
} from "./messagingTelegramFacade";
import { withTelegramBridgeServer, writeJson } from "./messagingGatewayTestHttpHelpers";

describe("messaging gateway runtime lifecycle", () => {
  it("polls Telegram bridge unread messages through active owner bindings with sender checks and dedupe", async () => {
    const providers = createDefaultMessagingProviderRegistry();
    const bindings = createEmptyMessagingBindingRegistry(providers);
    bindings.add({
      id: "remote-binding",
      providerId: "telegram-tdlib",
      authProfileId: "owner-profile",
      conversationId: "owner-chat",
      purpose: "remote_ambient_surface",
      status: "active",
      ownerUserId: "owner-1",
      ambientSurface: "projects",
      maxDisclosureLabel: "owner-private-runtime-summary",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    });
    bindings.add({
      id: "revoked-binding",
      providerId: "telegram-tdlib",
      authProfileId: "owner-profile",
      conversationId: "revoked-chat",
      purpose: "remote_ambient_surface",
      status: "revoked",
      ownerUserId: "owner-1",
      ambientSurface: "projects",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    });
    const stateRoot = mkdtempSync(join(tmpdir(), "ambient-telegram-poll-"));
    const runner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-10T00:00:03.000Z"),
      readinessProbes: {
        "telegram-tdlib": async () => ({
          providerId: "telegram-tdlib",
          status: "available",
          configured: true,
          bridgeReachable: true,
          authNeeded: false,
          apiCredentialsPresent: true,
          persistedSessionCount: 1,
          checkedAt: "2026-05-10T00:00:01.000Z",
          message: "Ready for deterministic bridge poll test.",
          diagnostics: [],
          sessions: [],
          bridgeSessionCount: 1,
        }),
      },
    });
    const surface = buildRuntimeSurfaceSnapshot({
      workspace: {
        name: "ambientCoder",
        path: "/workspace",
        statePath: stateRoot,
        sessionPath: join(stateRoot, "sessions"),
      },
      threads: [],
      workflowFolders: [],
    });
    const requests: Array<{ path: string; apiId?: string; apiHash?: string }> = [];

    try {
      await runner.refreshProviderReadiness("telegram-tdlib");
      const started = await runner.applyLifecycle({
        action: "start",
        providerId: "telegram-tdlib",
        mode: "real",
        approvalRecorded: true,
      });
      expect(started.applied).toBe(true);

      await withTelegramBridgeServer(
        (req, res) => {
          const url = new URL(req.url ?? "/", "http://127.0.0.1");
          requests.push({
            path: `${url.pathname}${url.search}`,
            apiId: req.headers["x-telegram-api-id"] as string | undefined,
            apiHash: req.headers["x-telegram-api-hash"] as string | undefined,
          });
          if (url.pathname === "/sessions/owner-profile/inbox/unread") {
            expect(url.searchParams.get("chatId")).toBe("owner-chat");
            expect(url.searchParams.get("limit")).toBe("5");
            writeJson(res, {
              messages: [
                {
                  id: "099",
                  chatId: "owner-chat",
                  outgoing: false,
                  text: "stale projects",
                  date: "2026-05-10T00:00:01.000Z",
                },
                {
                  id: "100",
                  chatId: "owner-chat",
                  outgoing: false,
                  text: "projects",
                  date: "2026-05-10T00:00:02.000Z",
                },
                {
                  id: "101",
                  chatId: "owner-chat",
                  outgoing: false,
                  text: "intruder",
                  date: "2026-05-10T00:00:02.500Z",
                },
                {
                  id: "102",
                  chatId: "owner-chat",
                  outgoing: true,
                  text: "outbound echo",
                  date: "2026-05-10T00:00:02.750Z",
                },
              ],
            });
            return;
          }
          if (url.pathname === "/sessions/owner-profile/chats/owner-chat/messages/100/sender-profile") {
            writeJson(res, {
              sender: {
                kind: "user",
                user: {
                  userId: "owner-1",
                  displayName: "Owner",
                },
              },
            });
            return;
          }
          if (url.pathname === "/sessions/owner-profile/chats/owner-chat/messages/101/sender-profile") {
            writeJson(res, {
              sender: {
                kind: "user",
                user: {
                  userId: "intruder-1",
                  displayName: "Intruder",
                },
              },
            });
            return;
          }
          res.statusCode = 404;
          writeJson(res, { error: "not found" });
        },
        async (baseUrl) => {
          const toolInput = telegramBridgePollToolInput({
            profileId: "owner-profile",
            limit: 5,
            minReceivedAt: "2026-05-10T00:00:02.000Z",
          });
          const plan = buildTelegramBridgePollPlan({
            toolInput,
            bindings: bindings.list({ includeInactive: true }),
            runtimeStatus: runner.runtimeStatus(),
            stateRoot,
          });
          expect(plan).toMatchObject({
            status: "ready",
            canApplyNow: true,
            selectedBindings: [
              {
                bindingId: "remote-binding",
                authProfileId: "owner-profile",
                conversationId: "owner-chat",
                ownerUserId: "owner-1",
              },
            ],
          });
          expect(plan.warnings).toContain("Inactive/revoked Telegram bindings are ignored by polling.");
          expect(telegramBridgePollPlanText(plan)).toContain("Sends provider messages: no");

          const first = await applyTelegramBridgePoll({
            plan,
            bindings: bindings.list({ includeInactive: false }),
            stateRoot,
            env: {
              AMBIENT_AGENT_TELEGRAM_BRIDGE_URL: baseUrl,
              AMBIENT_AGENT_TELEGRAM_API_ID: "12345",
              AMBIENT_AGENT_TELEGRAM_API_HASH: "test-hash",
            },
            fetchFn: fetch,
            dispatch: (event) =>
              runner.dispatchInbound({
                source: "telegram-bridge",
                event,
                bindings: bindings.list({ includeInactive: false }),
                surface,
              }),
          });
          expect(first).toMatchObject({
            applyStatus: "applied",
            polled: true,
            fetchedMessageCount: 4,
            candidateMessageCount: 2,
            duplicateMessageCount: 0,
            staleMessageCount: 1,
            skippedMessageCount: 1,
            acceptedDispatchCount: 1,
            droppedDispatchCount: 1,
          });
          expect(first.bindingResults[0]?.dispatches.map((dispatch) => dispatch.accepted)).toEqual([true, false]);
          expect(telegramBridgePollResultText(first)).toContain("Accepted dispatches: 1");
          expect(telegramBridgePollResultText(first)).toContain("Stale messages before minReceivedAt: 1");
          expect(telegramBridgePollResultText(first)).toContain(
            "Queued projection: projection-telegram-tdlib-telegram-owner-profile-owner-chat-100",
          );
          expect(runner.runtimeStatus()).toMatchObject({
            queuedProjectionCount: 1,
            recentEventCount: 1,
            providers: expect.arrayContaining([
              expect.objectContaining({
                providerId: "telegram-tdlib",
                state: "running",
                mode: "real",
                realEventCount: 1,
                queuedProjectionCount: 1,
              }),
            ]),
          });

          const state = JSON.parse(readFileSync(join(stateRoot, "messaging-gateway", "telegram-poll-state.json"), "utf8"));
          expect(state.bindings["remote-binding"].seenMessageIds).toEqual(["099", "100", "101", "102"]);

          const second = await applyTelegramBridgePoll({
            plan,
            bindings: bindings.list({ includeInactive: false }),
            stateRoot,
            env: {
              AMBIENT_AGENT_TELEGRAM_BRIDGE_URL: baseUrl,
              AMBIENT_AGENT_TELEGRAM_API_ID: "12345",
              AMBIENT_AGENT_TELEGRAM_API_HASH: "test-hash",
            },
            fetchFn: fetch,
            dispatch: (event) =>
              runner.dispatchInbound({
                source: "telegram-bridge",
                event,
                bindings: bindings.list({ includeInactive: false }),
                surface,
              }),
          });
          expect(second).toMatchObject({
            fetchedMessageCount: 4,
            candidateMessageCount: 0,
            duplicateMessageCount: 4,
            staleMessageCount: 0,
            skippedMessageCount: 0,
            acceptedDispatchCount: 0,
            droppedDispatchCount: 0,
          });
        },
      );
    } finally {
      rmSync(stateRoot, { recursive: true, force: true });
    }

    expect(requests.map((request) => request.path)).toEqual([
      "/sessions/owner-profile/inbox/unread?chatId=owner-chat&limit=5",
      "/sessions/owner-profile/chats/owner-chat/messages/100/sender-profile",
      "/sessions/owner-profile/chats/owner-chat/messages/101/sender-profile",
      "/sessions/owner-profile/inbox/unread?chatId=owner-chat&limit=5",
    ]);
    expect(requests.every((request) => request.apiId === "12345" && request.apiHash === "test-hash")).toBe(true);
  });

  it("blocks Telegram bridge polling until the provider is running in real mode", () => {
    const providers = createDefaultMessagingProviderRegistry();
    const bindings = createEmptyMessagingBindingRegistry(providers);
    bindings.add({
      id: "remote-binding",
      providerId: "telegram-tdlib",
      authProfileId: "owner-profile",
      conversationId: "owner-chat",
      purpose: "remote_ambient_surface",
      status: "active",
      ownerUserId: "owner-1",
      ambientSurface: "projects",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    });
    const runner = new MessagingGatewayRunner({
      providers,
      now: () => new Date("2026-05-10T00:00:03.000Z"),
    });

    const plan = buildTelegramBridgePollPlan({
      toolInput: telegramBridgePollToolInput({ profileId: "owner-profile" }),
      bindings: bindings.list(),
      runtimeStatus: runner.runtimeStatus(),
      stateRoot: "/workspace/.ambient",
    });
    expect(plan).toMatchObject({
      status: "blocked",
      canApplyNow: false,
      safety: {
        readsProviderUnreadMessages: false,
        sendsProviderMessages: false,
      },
    });
    expect(plan.blockers).toContain("Telegram provider is not running in real mode.");
    expect(telegramBridgePollPlanText(plan)).toContain("Can apply now: no");
  });

  it("runs approval-gated periodic Telegram polling with status counters and stop controls", async () => {
    const providers = createDefaultMessagingProviderRegistry();
    const bindings = createEmptyMessagingBindingRegistry(providers);
    bindings.add({
      id: "remote-binding",
      providerId: "telegram-tdlib",
      authProfileId: "owner-profile",
      conversationId: "owner-chat",
      purpose: "remote_ambient_surface",
      status: "active",
      ownerUserId: "owner-1",
      ambientSurface: "projects",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    });
    const stateRoot = mkdtempSync(join(tmpdir(), "ambient-telegram-polling-runner-"));
    let nowMs = Date.parse("2026-05-10T00:00:03.000Z");
    let scheduledIntervalMs = 0;
    let clearedTimerCount = 0;
    const pollingRunner = new TelegramBridgePollingRunner({
      now: () => new Date(nowMs),
      schedulePoll: (_callback, intervalMs) => {
        scheduledIntervalMs = intervalMs;
        return { unref: () => undefined } as unknown as ReturnType<typeof setInterval>;
      },
      clearPoll: () => {
        clearedTimerCount += 1;
      },
    });
    const gatewayRunner = new MessagingGatewayRunner({
      providers,
      now: () => new Date(nowMs),
      readinessProbes: {
        "telegram-tdlib": async () => ({
          providerId: "telegram-tdlib",
          status: "available",
          configured: true,
          bridgeReachable: true,
          authNeeded: false,
          apiCredentialsPresent: true,
          persistedSessionCount: 1,
          checkedAt: new Date(nowMs).toISOString(),
          message: "Ready for deterministic periodic polling test.",
          diagnostics: [],
          sessions: [],
          bridgeSessionCount: 1,
        }),
      },
    });
    const surface = buildRuntimeSurfaceSnapshot({
      workspace: {
        name: "ambientCoder",
        path: "/workspace",
        statePath: stateRoot,
        sessionPath: join(stateRoot, "sessions"),
      },
      threads: [],
      workflowFolders: [],
    });
    let unreadCallCount = 0;

    try {
      await gatewayRunner.refreshProviderReadiness("telegram-tdlib");
      await gatewayRunner.applyLifecycle({
        action: "start",
        providerId: "telegram-tdlib",
        mode: "real",
        approvalRecorded: true,
      });

      await withTelegramBridgeServer(
        (req, res) => {
          const url = new URL(req.url ?? "/", "http://127.0.0.1");
          if (url.pathname === "/sessions/owner-profile/inbox/unread") {
            unreadCallCount += 1;
            writeJson(res, {
              messages: [
                {
                  id: `stale-${unreadCallCount}`,
                  chatId: "owner-chat",
                  outgoing: false,
                  text: "old backlog",
                  date: "2026-05-10T00:00:01.000Z",
                },
                {
                  id: String(199 + unreadCallCount),
                  chatId: "owner-chat",
                  outgoing: false,
                  text: unreadCallCount === 1 ? "projects" : "status",
                  date: new Date(nowMs).toISOString(),
                },
              ],
            });
            return;
          }
          if (url.pathname.startsWith("/sessions/owner-profile/chats/owner-chat/messages/") && url.pathname.endsWith("/sender-profile")) {
            writeJson(res, {
              sender: {
                kind: "user",
                user: {
                  userId: "owner-1",
                  displayName: "Owner",
                },
              },
            });
            return;
          }
          res.statusCode = 404;
          writeJson(res, { error: "not found" });
        },
        async (baseUrl) => {
          const input = telegramBridgePollingControlInput({
            action: "start",
            profileId: "owner-profile",
            limit: 5,
            minReceivedAt: "2026-05-10T00:00:02.000Z",
            intervalMs: 5000,
          });
          const buildPlan = () =>
            buildTelegramBridgePollPlan({
              toolInput: input,
              bindings: bindings.list({ includeInactive: true }),
              runtimeStatus: gatewayRunner.runtimeStatus(),
              stateRoot,
            });
          const pollOnce = () =>
            applyTelegramBridgePoll({
              plan: buildPlan(),
              bindings: bindings.list({ includeInactive: false }),
              stateRoot,
              env: {
                AMBIENT_AGENT_TELEGRAM_BRIDGE_URL: baseUrl,
              },
              fetchFn: fetch,
              dispatch: (event) =>
                gatewayRunner.dispatchInbound({
                  source: "telegram-bridge",
                  event,
                  bindings: bindings.list({ includeInactive: false }),
                  surface,
                }),
            });

          const startPreview = pollingRunner.preview(input, buildPlan());
          expect(startPreview).toMatchObject({
            action: "start",
            status: "ready",
            canApplyNow: true,
            approvalRequired: true,
            minReceivedAt: "2026-05-10T00:00:02.000Z",
            safety: {
              startsTimer: true,
              sendsProviderMessages: false,
            },
          });
          expect(telegramBridgePollingControlPreviewText(startPreview)).toContain("Starts timer: yes");
          expect(telegramBridgePollingControlPreviewText(startPreview)).toContain("Freshness minReceivedAt: 2026-05-10T00:00:02.000Z");

          const startResult = await pollingRunner.apply({
            preview: startPreview,
            approvalRecorded: true,
            pollOnce,
          });
          expect(startResult).toMatchObject({
            applyStatus: "applied",
            approvalRecorded: true,
            immediatePollResult: {
              acceptedDispatchCount: 1,
              staleMessageCount: 1,
            },
            runtimeStatus: {
              state: "running",
              running: true,
              minReceivedAt: "2026-05-10T00:00:02.000Z",
              totalPollCount: 1,
              successfulPollCount: 1,
              acceptedDispatchCount: 1,
              staleMessageCount: 1,
              lastSuccessfulPollAt: "2026-05-10T00:00:03.000Z",
            },
          });
          expect(scheduledIntervalMs).toBe(5000);
          expect(telegramBridgePollingControlResultText(startResult)).toContain("Immediate poll:");

          nowMs = Date.parse("2026-05-10T00:00:08.000Z");
          const scheduled = await pollingRunner.runScheduledPoll();
          expect(scheduled).toMatchObject({
            applyStatus: "applied",
            acceptedDispatchCount: 1,
            staleMessageCount: 1,
          });
          expect(pollingRunner.status()).toMatchObject({
            state: "running",
            totalPollCount: 2,
            successfulPollCount: 2,
            acceptedDispatchCount: 2,
            staleMessageCount: 2,
            lastSuccessfulPollAt: "2026-05-10T00:00:08.000Z",
            nextPollDueAt: "2026-05-10T00:00:13.000Z",
          });
          expect(telegramBridgePollingStatusText(pollingRunner.status())).toContain("Last successful poll: 2026-05-10T00:00:08.000Z");
          expect(telegramBridgePollingStatusText(pollingRunner.status())).toContain("Stale messages before minReceivedAt: 2");

          const stopInput = telegramBridgePollingControlInput({ action: "stop" });
          const stopPreview = pollingRunner.preview(stopInput, buildPlan());
          expect(stopPreview).toMatchObject({
            action: "stop",
            status: "ready",
            approvalRequired: false,
            safety: {
              stopsTimer: true,
              readsProviderUnreadMessages: false,
            },
          });
          const stopResult = await pollingRunner.apply({
            preview: stopPreview,
            approvalRecorded: false,
            pollOnce,
          });
          expect(stopResult).toMatchObject({
            applyStatus: "applied",
            runtimeStatus: {
              state: "stopped",
              running: false,
              stoppedAt: "2026-05-10T00:00:08.000Z",
            },
          });
          expect(clearedTimerCount).toBe(1);
        },
      );
    } finally {
      rmSync(stateRoot, { recursive: true, force: true });
    }
  });
});
