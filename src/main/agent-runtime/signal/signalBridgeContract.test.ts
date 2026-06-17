import { describe, expect, it } from "vitest";
import {
  signalBridgeApprovedReplySendContract,
  signalBridgeContractDescription,
  signalBridgeEndpointPaths,
  signalBridgeRealUnreadWindowContract,
  validateSignalBridgeConversationDirectoryEnvelope,
  validateSignalBridgeOwnerHandoffEnvelope,
  validateSignalBridgeProfileStatusEnvelope,
  validateSignalBridgeRootEnvelope,
  validateSignalBridgeUnreadWindowEnvelope,
} from "./signalBridgeContract";

describe("Signal bridge contract", () => {
  it("defines the minimal local bridge endpoints without provider payload fields", () => {
    const endpoints = signalBridgeEndpointPaths("owner profile", "chat/1");

    expect(endpoints).toEqual({
      root: "/",
      profileStatus: "/profiles/owner%20profile/status",
      conversationDirectory: "/profiles/owner%20profile/conversations?metadataOnly=true&limit=:limit&query=:query",
      unreadWindow: "/profiles/owner%20profile/conversations/chat%2F1/unread?limit=:limit",
      approvedReplySend: "/profiles/owner%20profile/conversations/chat%2F1/send",
    });
    expect(signalBridgeContractDescription("owner").join("\n")).toContain("Conversation directory: GET /profiles/owner/conversations?metadataOnly=true");
  });

  it("defines real unread reads as exact bounded single-read contracts", () => {
    const contract = signalBridgeRealUnreadWindowContract({
      profileId: "owner",
      conversationId: "chat/1",
      limit: 5,
    });

    expect(contract).toMatchObject({
      kind: "signal-real-bounded-unread-window-v0",
      providerId: "signal-cli",
      method: "GET",
      endpointPath: "/profiles/owner/conversations/chat%2F1/unread?limit=5",
      bridgeCapabilitiesRequired: ["profileStatus", "boundedUnreadWindow"],
    });
    expect(contract.requiredScopeFields).toEqual(["bindingId", "profileId", "conversationId", "ownerUserId", "limit"]);
    expect(contract.requiredBindingFields).toContain("metadata.setupShape=signal-owner-remote-ambient-surface");
    expect(contract.guarantees.join("\n")).toContain("one exact active owner Remote Ambient Surface binding");
    expect(contract.guarantees.join("\n")).toContain("must not list arbitrary Signal conversations or read broad history");
    expect(contract.forbiddenAlternatives).toEqual(expect.arrayContaining([
      "Signal Desktop UI scraping",
      "signal-cli command execution",
      "broad conversation history reads",
      "unbounded polling",
    ]));
    expect(contract.internalOnlyFields).toContain("text");
    expect(contract.piVisibleFields).not.toContain("text");
  });

  it("defines approved replies as exact outbound-only bridge contracts", () => {
    const contract = signalBridgeApprovedReplySendContract({
      profileId: "owner profile",
      conversationId: "chat/1",
    });

    expect(contract).toMatchObject({
      kind: "signal-approved-reply-send-v0",
      providerId: "signal-cli",
      method: "POST",
      endpointPath: "/profiles/owner%20profile/conversations/chat%2F1/send",
      bridgeCapabilitiesRequired: ["profileStatus", "approvedReplySend"],
    });
    expect(contract.requiredScopeFields).toEqual(["bindingId", "profileId", "conversationId", "ownerUserId", "replyToMessageId", "text"]);
    expect(contract.requestFields).toEqual(["text", "replyToMessageId"]);
    expect(contract.requiredBindingFields).toContain("metadata.setupShape=signal-owner-remote-ambient-surface");
    expect(contract.guarantees.join("\n")).toContain("Every future send must require explicit approval");
    expect(contract.guarantees.join("\n")).toContain("Messaging Connector external sends must remain firewalled");
    expect(contract.forbiddenAlternatives).toEqual(expect.arrayContaining([
      "Signal Desktop UI automation",
      "signal-cli command execution",
      "Messaging Connector external send tools",
    ]));
  });

  it("accepts root and profile status responses that expose only safe readiness metadata", () => {
    const root = validateSignalBridgeRootEnvelope({
      ok: true,
      providerId: "signal-cli",
      contract: { kind: "ambient-signal-local-bridge", version: "v0" },
      stateRoot: "/tmp/signal-state",
      profileCount: 1,
      capabilities: {
        profileStatus: true,
        metadataOnlyConversationDirectory: true,
        boundedUnreadWindow: true,
        approvedReplySend: false,
      },
    });
    const status = validateSignalBridgeProfileStatusEnvelope({
      ok: true,
      providerId: "signal-cli",
      profileId: "owner",
      ready: true,
      accountIdentifierPresent: true,
      linkedDevicePresent: true,
      registrationMetadataPresent: true,
      bridgeSessionReadable: true,
    }, "owner");

    expect(root).toMatchObject({
      providerId: "signal-cli",
      contractKind: "ambient-signal-local-bridge",
      contractVersion: "v0",
      stateRoot: "/tmp/signal-state",
      profileCount: 1,
      capabilities: {
        profileStatus: true,
        metadataOnlyConversationDirectory: true,
        boundedUnreadWindow: true,
        approvedReplySend: false,
      },
    });
    expect(status).toMatchObject({
      providerId: "signal-cli",
      profileId: "owner",
      ready: true,
      bridgeSessionReadable: true,
    });
  });

  it("rejects sensitive Signal fields and message payloads in readiness envelopes", () => {
    expect(() => validateSignalBridgeRootEnvelope({
      ok: true,
      providerId: "signal-cli",
      contract: { kind: "ambient-signal-local-bridge", version: "v0" },
      profile: { phoneNumber: "+15551234567" },
    })).toThrow("forbidden field profile.phoneNumber");

    expect(() => validateSignalBridgeProfileStatusEnvelope({
      ok: true,
      providerId: "signal-cli",
      profileId: "owner",
      lastMessage: { text: "secret message body" },
    }, "owner")).toThrow("forbidden field lastMessage");
  });

  it("accepts metadata-only conversation directory rows and rejects message payload fields", () => {
    const directory = validateSignalBridgeConversationDirectoryEnvelope({
      ok: true,
      providerId: "signal-cli",
      profileId: "owner",
      conversations: [
        {
          conversationId: "signal-chat-1",
          title: "Ops",
          type: "direct",
          unreadCount: 2,
          folderIds: [],
          updatedAt: "2026-05-10T00:00:00.000Z",
        },
      ],
    }, "owner");

    expect(directory).toMatchObject({
      providerId: "signal-cli",
      profileId: "owner",
      fetchedConversationCount: 1,
      returnedConversationCount: 1,
      conversations: [{
        conversationId: "signal-chat-1",
        title: "Ops",
        unreadCount: 2,
      }],
    });

    expect(() => validateSignalBridgeConversationDirectoryEnvelope({
      ok: true,
      providerId: "signal-cli",
      profileId: "owner",
      conversations: [{ conversationId: "signal-chat-1", title: "Ops", text: "private body" }],
    }, "owner")).toThrow("forbidden field conversations.0.text");
  });

  it("accepts unread-window messages only as internal routing summaries", () => {
    const summary = validateSignalBridgeUnreadWindowEnvelope({
      ok: true,
      providerId: "signal-cli",
      profileId: "owner",
      conversationId: "signal-chat-1",
      messages: [{
        messageId: "message-1",
        senderId: "owner-1",
        senderLabel: "Owner",
        text: "private command body",
        receivedAt: "2026-05-10T00:00:00.000Z",
        outgoing: false,
      }],
    }, "owner", "signal-chat-1");

    expect(summary).toMatchObject({
      providerId: "signal-cli",
      profileId: "owner",
      conversationId: "signal-chat-1",
      fetchedMessageCount: 1,
      routeableMessageCount: 1,
      messages: [{
        messageId: "message-1",
        senderId: "owner-1",
        senderLabel: "Owner",
        textCharCount: 20,
      }],
    });
    expect(JSON.stringify(summary)).not.toContain("private command body");

    expect(() => validateSignalBridgeUnreadWindowEnvelope({
      ok: true,
      providerId: "signal-cli",
      profileId: "owner",
      conversationId: "signal-chat-1",
      messages: [{ messageId: "message-1", senderId: "owner-1", body: "private body" }],
    }, "owner", "signal-chat-1")).toThrow("forbidden field messages.0.body");
  });

  it("accepts owner-handoff setup-code matches without returning message bodies", () => {
    const setupCode = "ambient-signal-setup-code-12345";
    const summary = validateSignalBridgeOwnerHandoffEnvelope({
      ok: true,
      providerId: "signal-cli",
      profileId: "owner",
      conversationId: "signal-chat-1",
      messages: [
        {
          messageId: "seen-1",
          senderId: "owner-1",
          senderLabel: "Owner",
          text: setupCode,
          receivedAt: "2026-05-10T00:00:00.000Z",
          outgoing: false,
        },
        {
          messageId: "seen-2",
          senderId: "other",
          text: "unrelated private text",
          outgoing: false,
        },
      ],
    }, "owner", "signal-chat-1", setupCode);

    expect(summary).toMatchObject({
      providerId: "signal-cli",
      profileId: "owner",
      conversationId: "signal-chat-1",
      setupCodeLength: setupCode.length,
      setupCodePreview: `${setupCode.length} chars`,
      handoffStatus: "matched",
      fetchedMessageCount: 2,
      candidateMessageCount: 2,
      matchedMessageCount: 1,
      matchedSenderCount: 1,
      ownerUserId: "owner-1",
      ownerLabel: "Owner",
      sourceMessageId: "seen-1",
      initialSeenMessageIds: ["seen-1", "seen-2"],
    });
    expect(JSON.stringify(summary)).not.toContain(setupCode);
    expect(JSON.stringify(summary)).not.toContain("unrelated private text");

    expect(() => validateSignalBridgeOwnerHandoffEnvelope({
      ok: true,
      providerId: "signal-cli",
      profileId: "owner",
      conversationId: "signal-chat-1",
      messages: [{ messageId: "seen-1", senderId: "owner-1", messageBody: setupCode }],
    }, "owner", "signal-chat-1", setupCode)).toThrow("forbidden field messages.0.messageBody");
  });
});
