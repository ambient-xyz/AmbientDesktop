import { describe, expect, it } from "vitest";
import type { SubagentRunSummary } from "../../shared/subagentTypes";
import {
  formatToolArgs,
  formatToolResult,
  mapPiChildRuntimeEvent,
  normalizePiEvent,
  PI_CHILD_EVENT_MAPPER_SCHEMA_VERSION,
  piChildRuntimeEventUpdateDetails,
  piChildRuntimeEventUpdateText,
  validatePiChildRuntimeEventLargeOutputArtifact,
} from "./piEventMapper";

describe("normalizePiEvent", () => {
  it("maps compaction lifecycle events", () => {
    expect(normalizePiEvent({ type: "compaction_start", reason: "threshold" })).toEqual({
      kind: "compaction-start",
      reason: "threshold",
    });

    expect(
      normalizePiEvent({
        type: "compaction_end",
        reason: "overflow",
        aborted: false,
        willRetry: true,
        errorMessage: "context overflow",
      }),
    ).toEqual({
      kind: "compaction-end",
      reason: "overflow",
      aborted: false,
      willRetry: true,
      error: "context overflow",
    });
  });

  it("maps auto-retry lifecycle events", () => {
    expect(
      normalizePiEvent({
        type: "auto_retry_start",
        attempt: 2,
        maxAttempts: 3,
        delayMs: 500,
        errorMessage: "rate limited",
      }),
    ).toEqual({
      kind: "auto-retry-start",
      attempt: 2,
      maxAttempts: 3,
      delayMs: 500,
      error: "rate limited",
    });

    expect(
      normalizePiEvent({
        type: "auto_retry_end",
        success: false,
        attempt: 2,
        finalError: "still rate limited",
      }),
    ).toEqual({ kind: "auto-retry-end", success: false, attempt: 2, error: "still rate limited" });
  });

  it("maps queue updates", () => {
    expect(
      normalizePiEvent({
        type: "queue_update",
        steering: ["redirect"],
        followUp: ["later"],
      }),
    ).toEqual({ kind: "queue-update", steering: ["redirect"], followUp: ["later"] });
  });

  it("maps assistant text deltas", () => {
    expect(
      normalizePiEvent({
        type: "message_update",
        assistantMessageEvent: { type: "text_delta", delta: "hello" },
      }),
    ).toEqual({ kind: "assistant-update", delta: "hello" });
  });

  it("maps assistant thinking lifecycle events", () => {
    expect(
      normalizePiEvent({
        type: "message_update",
        assistantMessageEvent: { type: "thinking_start", contentIndex: 0 },
      }),
    ).toEqual({ kind: "thinking-start" });

    expect(
      normalizePiEvent({
        type: "message_update",
        assistantMessageEvent: { type: "thinking_delta", delta: "Inspecting files." },
      }),
    ).toEqual({ kind: "thinking-update", delta: "Inspecting files." });

    expect(
      normalizePiEvent({
        type: "message_update",
        assistantMessageEvent: { type: "thinking_end", content: "Inspecting files." },
      }),
    ).toEqual({ kind: "thinking-end", finalText: "Inspecting files." });
  });

  it("maps assistant terminal errors", () => {
    expect(
      normalizePiEvent({
        type: "message_end",
        message: {
          role: "assistant",
          stopReason: "aborted",
          errorMessage: "Request was aborted",
          content: [{ type: "text", text: "" }],
        },
      }),
    ).toEqual({ kind: "assistant-end", error: "Request was aborted" });
  });

  it("maps agent_end summaries across assistant messages", () => {
    expect(
      normalizePiEvent({
        type: "agent_end",
        messages: [
          { role: "assistant", content: [{ type: "text", text: "done" }], stopReason: "stop" },
          {
            role: "assistant",
            content: [{ type: "text", text: "" }],
            stopReason: "error",
            errorMessage: "provider failed",
          },
        ],
      }),
    ).toEqual({ kind: "agent-end", finalTexts: ["done"], errors: ["provider failed"] });
  });

  it("maps tool execution lifecycle events", () => {
    expect(
      normalizePiEvent({
        type: "tool_execution_start",
        toolCallId: "call-1",
        toolName: "write",
        args: { path: "file.txt", content: "ok" },
      }),
    ).toEqual({
      kind: "tool-start",
      toolCallId: "call-1",
      label: "write",
      content: '{\n  "path": "file.txt",\n  "content": "ok"\n}',
      input: { path: "file.txt", content: "ok" },
      longformInputPreview: {
        kind: "longform-input",
        title: "Input",
        runningTitle: "Writing",
        summary: "file.txt",
        items: [
          {
            label: "File",
            fieldPath: "content",
            path: "file.txt",
            language: "text",
            preview: "ok",
            chars: 2,
            truncated: false,
          },
        ],
      },
    });

    expect(
      normalizePiEvent({
        type: "tool_execution_end",
        toolCallId: "call-1",
        toolName: "write",
        result: [{ type: "text", text: "wrote file" }],
      }),
    ).toEqual({
      kind: "tool-end",
      toolCallId: "call-1",
      label: "write",
      content: "wrote file",
      status: "done",
    });
  });

  it("maps long browser eval code into tool input metadata", () => {
    const code = "x".repeat(1200);
    expect(
      normalizePiEvent({
        type: "tool_execution_start",
        toolCallId: "call-browser",
        toolName: "browser_eval",
        args: { code },
      }),
    ).toEqual({
      kind: "tool-start",
      toolCallId: "call-browser",
      label: "browser_eval",
      content: JSON.stringify(
        {
          code: {
            preview: `${"x".repeat(1000)}\n... (1200 chars total)`,
            chars: 1200,
            truncated: true,
            omittedChars: 200,
          },
        },
        null,
        2,
      ),
      longformInputPreview: {
        kind: "longform-input",
        title: "Code",
        runningTitle: "Evaluating code",
        summary: "JavaScript · 1,200 chars",
        items: [
          {
            label: "Code",
            fieldPath: "code",
            language: "javascript",
            preview: `${"x".repeat(1000)}\n...`,
            chars: 1200,
            truncated: true,
          },
        ],
      },
    });
  });

  it("maps stringified tool-call arguments into longform metadata", () => {
    const code = "x".repeat(700);
    expect(
      normalizePiEvent({
        type: "message_update",
        assistantMessageEvent: {
          type: "toolcall_end",
          toolCall: { type: "toolCall", id: "call-browser", name: "browser_eval", arguments: JSON.stringify({ code }) },
        },
      }),
    ).toEqual({
      kind: "tool-input-end",
      toolCallId: "call-browser",
      label: "browser_eval",
      content: JSON.stringify({ code }, null, 2),
      longformInputPreview: {
        kind: "longform-input",
        title: "Code",
        runningTitle: "Evaluating code",
        summary: "JavaScript · 700 chars",
        items: [
          {
            label: "Code",
            fieldPath: "code",
            language: "javascript",
            preview: code,
            chars: 700,
            truncated: false,
          },
        ],
      },
    });
  });

  it("maps long Ambient CLI args into tool input metadata", () => {
    const text = "a".repeat(700);
    expect(
      normalizePiEvent({
        type: "tool_execution_start",
        toolCallId: "call-cli",
        toolName: "ambient_cli",
        args: { packageName: "ambient-tts", command: "tts", args: ["--text", text] },
      }),
    ).toEqual({
      kind: "tool-start",
      toolCallId: "call-cli",
      label: "ambient_cli",
      content: "tts",
      longformInputPreview: {
        kind: "longform-input",
        title: "Arguments",
        runningTitle: "Running Ambient CLI",
        summary: "ambient-tts · tts · 1 arg · 700 chars",
        items: [
          {
            label: "args[1]",
            fieldPath: "args[1]",
            language: "text",
            preview: text,
            note: "Flag: --text",
            chars: 700,
            truncated: false,
          },
        ],
      },
    });
  });

  it("maps generic plugin long markdown inputs into metadata", () => {
    const markdown = "# Plugin note\n\n".concat("details ".repeat(90));
    expect(
      normalizePiEvent({
        type: "tool_execution_start",
        toolCallId: "call-plugin-markdown",
        toolName: "ambient_fixture_markdown_echo",
        args: { markdown },
      }),
    ).toMatchObject({
      kind: "tool-start",
      toolCallId: "call-plugin-markdown",
      label: "ambient_fixture_markdown_echo",
      longformInputPreview: {
        kind: "longform-input",
        title: "Long input",
        summary: `ambient_fixture_markdown_echo · 1 field · ${markdown.length.toLocaleString()} chars`,
        items: [
          {
            label: "Markdown",
            fieldPath: "markdown",
            language: "markdown",
            chars: markdown.length,
            truncated: false,
          },
        ],
      },
    });
  });

  it("preserves longform metadata from tool update details", () => {
    expect(
      normalizePiEvent({
        type: "tool_execution_update",
        toolCallId: "call-browser",
        toolName: "browser_eval",
        partialResult: {
          content: [{ type: "text", text: "Evaluating JavaScript in the active browser page." }],
          details: {
            runtime: "ambient-browser",
            toolName: "browser_eval",
            status: "running",
            toolLongformInputPreview: {
              kind: "longform-input",
              title: "Code",
              summary: "JavaScript · 700 chars",
              items: [
                {
                  label: "Code",
                  fieldPath: "code",
                  language: "javascript",
                  preview: "x".repeat(700),
                  chars: 700,
                  truncated: false,
                },
              ],
            },
          },
        },
      }),
    ).toMatchObject({
      kind: "tool-update",
      toolCallId: "call-browser",
      label: "browser_eval",
      longformInputPreview: {
        kind: "longform-input",
        title: "Code",
        summary: "JavaScript · 700 chars",
      },
    });
  });

  it("preserves generic running progress details from tool updates", () => {
    expect(
      normalizePiEvent({
        type: "tool_execution_update",
        toolCallId: "call-autowire",
        toolName: "ambient_mcp_autowire_plan",
        partialResult: {
          content: [{ type: "text", text: "Still planning MCP autowire for https://github.com/example/repo (2m 20s elapsed)." }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_autowire_plan",
            status: "planning",
            stage: "heartbeat",
            targetUrl: "https://github.com/example/repo",
            elapsedMs: 140_000,
            outputChars: 4096,
            thinkingChars: 512,
            idleElapsedMs: 1200,
            idleTimeoutMs: 30_000,
            timeoutMode: "idle_watchdog",
            waitingOn: "desktop-approval",
            approvalRequestId: "request-1",
            approvalTitle: "Install MCP server?",
            heartbeatCount: 28,
          },
        },
      }),
    ).toMatchObject({
      kind: "tool-update",
      toolCallId: "call-autowire",
      label: "ambient_mcp_autowire_plan",
      resultDetails: {
        runtime: "ambient-mcp",
        toolName: "ambient_mcp_autowire_plan",
        status: "planning",
        stage: "heartbeat",
        targetUrl: "https://github.com/example/repo",
        elapsedMs: 140_000,
        outputChars: 4096,
        thinkingChars: 512,
        idleElapsedMs: 1200,
        idleTimeoutMs: 30_000,
        timeoutMode: "idle_watchdog",
        waitingOn: "desktop-approval",
        approvalRequestId: "request-1",
        approvalTitle: "Install MCP server?",
        heartbeatCount: 28,
      },
    });
  });

  it("preserves edit result diff details", () => {
    expect(
      normalizePiEvent({
        type: "tool_execution_end",
        toolCallId: "call-edit",
        toolName: "edit",
        result: {
          content: [{ type: "text", text: "Successfully replaced 1 block(s) in src/app.ts." }],
          details: {
            diff: '-4 const value = "old";\n+4 const value = "new";',
            firstChangedLine: 4,
          },
        },
      }),
    ).toEqual({
      kind: "tool-end",
      toolCallId: "call-edit",
      label: "edit",
      content: "Successfully replaced 1 block(s) in src/app.ts.",
      status: "done",
      resultDetails: {
        diff: '-4 const value = "old";\n+4 const value = "new";',
        firstChangedLine: 4,
      },
    });
  });

  it("maps edit arguments into structured input metadata before bounding raw input", () => {
    const oldText = "old line\n".repeat(150);
    const newText = "new line\n".repeat(150);

    const normalized = normalizePiEvent({
      type: "tool_execution_start",
      toolCallId: "call-edit",
      toolName: "edit",
      args: {
        path: "src/app.ts",
        edits: [{ oldText, newText }],
      },
    });

    expect(normalized).toMatchObject({
      kind: "tool-start",
      toolCallId: "call-edit",
      label: "edit",
      editInputPreview: {
        kind: "edit-input",
        path: "src/app.ts",
        language: "typescript",
        summary: `src/app.ts · 1 replacement · ${(oldText.length + newText.length).toLocaleString()} chars`,
        edits: [
          {
            oldText: {
              preview: oldText.slice(0, 1000),
              chars: oldText.length,
              truncated: true,
              omittedChars: oldText.length - 1000,
            },
            newText: {
              preview: newText.slice(0, 1000),
              chars: newText.length,
              truncated: true,
              omittedChars: newText.length - 1000,
            },
          },
        ],
      },
    });
    expect("content" in normalized ? normalized.content : "").toContain('"oldText": {');
  });

  it("preserves structured media artifact result details", () => {
    expect(
      normalizePiEvent({
        type: "tool_execution_end",
        toolCallId: "call-media",
        toolName: "media_download",
        result: {
          content: [{ type: "text", text: "Generated media artifact: bunny.jpg" }],
          details: {
            runtime: "ambient-media",
            toolName: "media_download",
            mediaArtifact: {
              artifactPath: "bunny.jpg",
              mediaKind: "image",
              mimeType: "image/jpeg",
              bytes: 2048,
              width: 500,
              height: 730,
              inlinePreviewEligible: true,
              displayInstruction: "Ambient Desktop will attempt to render this media inline in the visible chat.",
            },
          },
        },
      }),
    ).toEqual({
      kind: "tool-end",
      toolCallId: "call-media",
      label: "media_download",
      content: "Generated media artifact: bunny.jpg",
      status: "done",
      details: {
        runtime: "ambient-media",
        toolName: "media_download",
      },
      resultDetails: {
        mediaArtifact: {
          artifactPath: "bunny.jpg",
          mediaKind: "image",
          mimeType: "image/jpeg",
          bytes: 2048,
          width: 500,
          height: 730,
          inlinePreviewEligible: true,
          displayInstruction: "Ambient Desktop will attempt to render this media inline in the visible chat.",
        },
      },
    });
  });

  it("preserves Ambient voice provider result metadata", () => {
    expect(
      normalizePiEvent({
        type: "tool_execution_end",
        toolCallId: "call-voice",
        toolName: "ambient_voice_test",
        result: {
          content: [{ type: "text", text: "Ambient voice provider test succeeded\nProvider: Piper TTS\nAudio: .ambient/voice/test.wav" }],
          details: {
            runtime: "ambient-voice",
            toolName: "ambient_voice_test",
            status: "complete",
            testStatus: "succeeded",
            providerCapabilityId: "ambient-cli:piper:tool:piper_tts",
            voiceId: "en_US-lessac-medium",
            audioPath: ".ambient/voice/test.wav",
            mimeType: "audio/wav",
            durationMs: 430,
          },
        },
      }),
    ).toEqual({
      kind: "tool-end",
      toolCallId: "call-voice",
      label: "ambient_voice_test",
      content: "Ambient voice provider test succeeded\nProvider: Piper TTS\nAudio: .ambient/voice/test.wav",
      status: "done",
      details: {
        runtime: "ambient-voice",
        toolName: "ambient_voice_test",
        result: "complete",
      },
      resultDetails: {
        testStatus: "succeeded",
        providerCapabilityId: "ambient-cli:piper:tool:piper_tts",
        voiceId: "en_US-lessac-medium",
        audioPath: ".ambient/voice/test.wav",
        mimeType: "audio/wav",
        durationMs: 430,
      },
    });
  });

  it("preserves injected workflow playbook result metadata", () => {
    expect(
      normalizePiEvent({
        type: "tool_execution_end",
        toolCallId: "call-workflow-inject",
        toolName: "ambient_workflows_inject",
        result: {
          content: [{ type: "text", text: "Injected workflow playbook guidance\nID: scottsdale-date-night" }],
          details: {
            runtime: "ambient-workflows",
            toolName: "ambient_workflows_inject",
            workflowId: "scottsdale-date-night",
            title: "Scottsdale date-night event discovery",
            version: 4,
            status: "injected",
            injected: true,
            toolNames: ["browser_search", "browser_open"],
            outputShape: ["Ranked shortlist", "Booking links"],
            markdownTruncated: false,
          },
        },
      }),
    ).toEqual({
      kind: "tool-end",
      toolCallId: "call-workflow-inject",
      label: "ambient_workflows_inject",
      content: "Injected workflow playbook guidance\nID: scottsdale-date-night",
      status: "done",
      details: {
        runtime: "ambient-workflows",
        toolName: "ambient_workflows_inject",
        result: "injected",
      },
      resultDetails: {
        workflowPlaybook: {
          id: "scottsdale-date-night",
          title: "Scottsdale date-night event discovery",
          version: 4,
          status: "injected",
          injected: true,
          toolNames: ["browser_search", "browser_open"],
          outputShape: ["Ranked shortlist", "Booking links"],
          markdownTruncated: false,
        },
      },
    });
  });

  it("uses tool result display text for transcript content while preserving result metadata", () => {
    expect(
      normalizePiEvent({
        type: "tool_execution_end",
        toolCallId: "call-google",
        toolName: "google_workspace_call",
        result: {
          content: [{ type: "text", text: '{"items":[{"summary":"Full private payload"}]}' }],
          details: {
            runtime: "google-workspace-setup",
            toolName: "google_workspace_call",
            displayText: "Google Workspace method call\nResult: Calendar events (1)",
          },
        },
      }),
    ).toEqual({
      kind: "tool-end",
      toolCallId: "call-google",
      label: "google_workspace_call",
      content: "Google Workspace method call\nResult: Calendar events (1)",
      status: "done",
      details: {
        runtime: "google-workspace-setup",
        toolName: "google_workspace_call",
      },
    });
  });

  it("preserves install route summary and telemetry metadata", () => {
    expect(
      normalizePiEvent({
        type: "tool_execution_end",
        toolCallId: "call-route",
        toolName: "ambient_install_route_plan",
        result: {
          content: [{ type: "text", text: "Ambient install route plan\nLane: unsupported" }],
          details: {
            runtime: "ambient-install-route",
            toolName: "ambient_install_route_plan",
            installRouteSummary: {
              kind: "ambient-install-route-summary",
              lane: "unsupported",
              confidence: "high",
              reason: "Plugin marketplace installs are hidden.",
              approvalBoundary: "none-readonly",
              nextTools: [],
              blockers: ["Plugin marketplace installs are not currently supported."],
              warnings: ["Do not call plugin install tools."],
            },
            installRouteTelemetry: {
              kind: "ambient-install-route-telemetry",
              lane: "unsupported",
              confidence: "high",
              approvalBoundary: "none-readonly",
              nextToolCount: 0,
              blockerCount: 1,
              warningCount: 1,
              requiresSecret: false,
              validationKind: "route-only",
              status: "planned",
            },
          },
        },
      }),
    ).toMatchObject({
      kind: "tool-end",
      toolCallId: "call-route",
      label: "ambient_install_route_plan",
      resultDetails: {
        installRouteSummary: {
          lane: "unsupported",
          nextTools: [],
        },
        installRouteTelemetry: {
          lane: "unsupported",
          nextToolCount: 0,
          blockerCount: 1,
        },
      },
    });
  });

  it("uses message-level display text for tool result messages", () => {
    expect(
      normalizePiEvent({
        type: "message_end",
        message: {
          role: "toolResult",
          toolCallId: "call-google",
          toolName: "google_workspace_call",
          content: [{ type: "text", text: '{"items":[{"summary":"Full private payload"}]}' }],
          details: {
            displayText: "Visible preview only",
          },
        },
      }),
    ).toEqual({
      kind: "tool-end",
      toolCallId: "call-google",
      label: "google_workspace_call",
      content: "Visible preview only",
      status: "done",
    });
  });

  it("summarizes materialized large output result details", () => {
    const result = normalizePiEvent({
      type: "tool_execution_end",
      toolCallId: "call-cli",
      toolName: "ambient_cli",
      result: {
        content: [{ type: "text", text: "Ambient CLI completed\nStdout:\npreview text" }],
        details: {
          runtime: "ambient-cli",
          toolName: "ambient_cli",
          stdoutOutput: {
            text: "preview text",
            truncated: true,
            totalChars: 17000,
            previewChars: 16000,
            artifactPath: ".ambient/tool-outputs/stdout.txt",
            artifactBytes: 17123,
          },
        },
      },
    });

    expect(result).toMatchObject({
      kind: "tool-end",
      toolCallId: "call-cli",
      label: "ambient_cli",
      content: "Ambient CLI completed\nStdout:\npreview text",
      resultDetails: {
        largeOutputPreview: {
          kind: "large-output",
          summary: "stdout · 17,000 chars · 16,000 preview · full output: .ambient/tool-outputs/stdout.txt",
          items: [
            {
              label: "stdout",
              chars: 17000,
              previewChars: 16000,
              truncated: true,
              artifactPath: ".ambient/tool-outputs/stdout.txt",
              artifactBytes: 17123,
              suggestedTools: ["file_read", "long_context_process"],
            },
          ],
        },
      },
    });
  });

  it("marks external model responses as verbatim tool artifacts with usage separated", () => {
    const exactResponse = "A delegated model answered exactly like this.";

    expect(
      normalizePiEvent({
        type: "tool_execution_end",
        toolCallId: "call-local-model",
        toolName: "ambient_cli",
        result: {
          content: [{ type: "text", text: "Ambient CLI completed\nResult: delegated model response" }],
          details: {
            runtime: "ambient-cli",
            toolName: "ambient_cli",
            externalModelResponse: {
              label: "delegated local model",
              text: exactResponse,
              model: "local-test-model",
              provider: "llama.cpp",
              usage: { inputTokens: 12, outputTokens: 8 },
            },
          },
        },
      }),
    ).toMatchObject({
      kind: "tool-end",
      toolCallId: "call-local-model",
      label: "ambient_cli",
      resultDetails: {
        externalModelResponse: {
          kind: "external-model-response",
          label: "delegated local model",
          verbatim: true,
          text: exactResponse,
          chars: exactResponse.length,
          previewChars: exactResponse.length,
          truncated: false,
          model: "local-test-model",
          provider: "llama.cpp",
          usage: { inputTokens: 12, outputTokens: 8 },
        },
      },
    });
  });

  it("preserves Telegram setup cards in tool result metadata", () => {
    expect(
      normalizePiEvent({
        type: "tool_execution_end",
        toolCallId: "call-telegram",
        toolName: "ambient_messaging_telegram_session_apply",
        result: {
          content: [{ type: "text", text: "Telegram session bootstrap apply\nApply status: applied" }],
          details: {
            runtime: "ambient-messaging-gateway",
            toolName: "ambient_messaging_telegram_session_apply",
            telegramSessionSetup: {
              kind: "telegram-session-setup",
              providerId: "telegram-tdlib",
              profileId: "owner",
              action: "submit_code",
              status: "needs_code",
              title: "Telegram login code needed",
              summary: "Profile owner is waiting for a Telegram login code.",
              detail: "Use secure input.",
              missingInputs: ["secure code input"],
              primaryAction: {
                id: "submit-code",
                label: "Enter code",
                title: "Continue Telegram setup",
                prompt: "Call ambient_messaging_telegram_session_apply with submit_code.",
                tone: "primary",
              },
              secondaryActions: [],
              safety: {
                readsProviderMessages: false,
                sendsProviderMessages: false,
                createsBinding: false,
                enablesInboundIngestion: false,
              },
            },
          },
        },
      }),
    ).toMatchObject({
      kind: "tool-end",
      resultDetails: {
        telegramSessionSetup: {
          kind: "telegram-session-setup",
          providerId: "telegram-tdlib",
          profileId: "owner",
          status: "needs_code",
          primaryAction: {
            id: "submit-code",
            prompt: "Call ambient_messaging_telegram_session_apply with submit_code.",
          },
          safety: {
            readsProviderMessages: false,
            sendsProviderMessages: false,
          },
        },
      },
    });
  });

  it("preserves messaging conversation-directory setup cards in tool result metadata", () => {
    expect(
      normalizePiEvent({
        type: "tool_execution_end",
        toolCallId: "call-directory",
        toolName: "ambient_messaging_telegram_conversation_directory_apply",
        result: {
          content: [{ type: "text", text: "Telegram conversation directory result: applied\nlastMessage should stay irrelevant to card rendering" }],
          details: {
            runtime: "ambient-messaging-gateway",
            toolName: "ambient_messaging_telegram_conversation_directory_apply",
            messagingConversationDirectorySetup: {
              kind: "messaging-conversation-directory-setup",
              providerId: "telegram-tdlib",
              providerLabel: "Telegram",
              status: "applied",
              directoryStatus: "ready",
              adapterStatus: "available",
              adapterKind: "live-metadata-only-adapter",
              previewToolName: "ambient_messaging_telegram_conversation_directory_preview",
              applyToolName: "ambient_messaging_telegram_conversation_directory_apply",
              requiresApprovalForApply: true,
              approvalRecorded: true,
              canApplyWithReadiness: true,
              canApplyNow: true,
              metadataOnlyContractKind: "metadata-only-routing",
              fetchedConversationCount: 1,
              returnedConversationCount: 1,
              blockers: [],
              warnings: [],
              nextSteps: ["Use the selected conversation id with a binding preview."],
              safety: {
                startsBridge: false,
                runsProviderCli: false,
                inspectsProviderDesktop: false,
                readsProviderMessages: false,
                readsProviderHistory: false,
                sendsProviderMessages: false,
                mutatesBindings: false,
              },
              conversations: [
                {
                  conversationId: "telegram-chat-1",
                  title: "Ops",
                  type: "group",
                  unreadCount: 2,
                  folderIds: [0],
                  updatedAt: "2026-05-11T12:00:00.000Z",
                  lastMessage: "must not be consumed",
                },
              ],
            },
          },
        },
      }),
    ).toMatchObject({
      kind: "tool-end",
      resultDetails: {
        messagingConversationDirectorySetup: {
          kind: "messaging-conversation-directory-setup",
          providerId: "telegram-tdlib",
          status: "applied",
          adapterStatus: "available",
          adapterKind: "live-metadata-only-adapter",
          metadataOnlyContractKind: "metadata-only-routing",
          returnedConversationCount: 1,
          safety: {
            readsProviderMessages: false,
            readsProviderHistory: false,
            sendsProviderMessages: false,
          },
          conversations: [
            {
              conversationId: "telegram-chat-1",
              title: "Ops",
              unreadCount: 2,
            },
          ],
        },
      },
    });
  });

  it("summarizes direct browser page text output metadata", () => {
    expect(
      normalizePiEvent({
        type: "tool_execution_end",
        toolCallId: "call-browser",
        toolName: "browser_content",
        result: {
          content: [{ type: "text", text: "Title: Long page\n\nText:\npage preview" }],
          details: {
            runtime: "ambient-browser",
            toolName: "browser_content",
            textOutput: {
              text: "page preview",
              truncated: true,
              totalChars: 24500,
              previewChars: 12000,
              artifactPath: ".ambient/tool-outputs/page.txt",
              artifactBytes: 25000,
            },
          },
        },
      }),
    ).toMatchObject({
      kind: "tool-end",
      resultDetails: {
        largeOutputPreview: {
          summary: "text · 24,500 chars · 12,000 preview · full output: .ambient/tool-outputs/page.txt",
          items: [{ label: "text", chars: 24500, previewChars: 12000, artifactPath: ".ambient/tool-outputs/page.txt" }],
        },
      },
    });
  });

  it("summarizes direct shell output artifact metadata", () => {
    expect(
      normalizePiEvent({
        type: "tool_execution_end",
        toolCallId: "call-shell",
        toolName: "bash",
        result: {
          content: [{ type: "text", text: "shell preview" }],
          details: {
            outputArtifactPath: ".ambient/tool-outputs/bash.txt",
            outputArtifactBytes: 17010,
            outputChars: 17000,
            outputPreviewChars: 16000,
          },
        },
      }),
    ).toMatchObject({
      kind: "tool-end",
      resultDetails: {
        largeOutputPreview: {
          summary: "output · 17,000 chars · 16,000 preview · full output: .ambient/tool-outputs/bash.txt",
          items: [{ label: "output", chars: 17000, previewChars: 16000, artifactPath: ".ambient/tool-outputs/bash.txt" }],
        },
      },
    });
  });

  it("summarizes materialized generic output metadata", () => {
    expect(
      normalizePiEvent({
        type: "tool_execution_end",
        toolCallId: "call-plugin-large",
        toolName: "ambient_fixture_markdown_echo",
        result: {
          content: [{ type: "text", text: "plugin preview" }],
          details: {
            source: "plugin-mcp",
            outputOutput: {
              text: "plugin preview",
              truncated: true,
              totalChars: 32000,
              previewChars: 12000,
              artifactPath: ".ambient/tool-outputs/plugin.txt",
              artifactBytes: 33000,
            },
          },
        },
      }),
    ).toMatchObject({
      kind: "tool-end",
      resultDetails: {
        largeOutputPreview: {
          summary: "output · 32,000 chars · 12,000 preview · full output: .ambient/tool-outputs/plugin.txt",
          items: [{ label: "output", chars: 32000, previewChars: 12000, artifactPath: ".ambient/tool-outputs/plugin.txt" }],
        },
      },
    });
  });

  it("summarizes materialized output notices in result text", () => {
    const text = [
      "Title: Long page",
      "",
      "Text:",
      "page preview",
      "",
      "[truncated] page text preview is 12,000 of 24,500 chars, 25,000 bytes.",
      "Full output saved at: .ambient/tool-outputs/page.txt",
      "Use file_read for exact text, or long_context_process for summarization/querying when the output is too large for direct context.",
    ].join("\n");

    expect(
      normalizePiEvent({
        type: "tool_execution_end",
        toolCallId: "call-browser",
        toolName: "browser_content",
        result: {
          content: [{ type: "text", text }],
          details: { runtime: "ambient-browser", toolName: "browser_content" },
        },
      }),
    ).toMatchObject({
      kind: "tool-end",
      resultDetails: {
        largeOutputPreview: {
          summary: "page text · 24,500 chars · 12,000 preview · full output: .ambient/tool-outputs/page.txt",
          items: [{ label: "page text", chars: 24500, previewChars: 12000, artifactPath: ".ambient/tool-outputs/page.txt" }],
        },
      },
    });
  });

  it("preserves plugin MCP tool details from streamed updates and final results", () => {
    expect(
      normalizePiEvent({
        type: "tool_execution_update",
        toolCallId: "call-plugin",
        toolName: "remote_helper",
        partialResult: {
          content: [{ type: "text", text: "calling plugin" }],
          details: {
            source: "plugin-mcp",
            runtime: "chat",
            permissionMode: "workspace",
            pluginId: "marketplace:remote-helper",
            pluginName: "remote-helper",
            serverName: "remote-helper",
            toolName: "search",
            registeredName: "remote_helper_search",
            status: "running",
          },
        },
      }),
    ).toEqual({
      kind: "tool-update",
      toolCallId: "call-plugin",
      label: "remote_helper",
      content: "calling plugin",
      details: {
        source: "plugin-mcp",
        runtime: "chat",
        permissionMode: "workspace",
        pluginId: "marketplace:remote-helper",
        pluginName: "remote-helper",
        serverName: "remote-helper",
        toolName: "search",
        registeredName: "remote_helper_search",
        result: "running",
      },
    });

    expect(
      normalizePiEvent({
        type: "tool_execution_end",
        toolCallId: "call-plugin",
        toolName: "remote_helper",
        result: {
          content: [{ type: "text", text: "done" }],
          details: {
            pluginId: "marketplace:remote-helper",
            pluginName: "remote-helper",
            serverName: "remote-helper",
            toolName: "search",
            registeredName: "remote_helper_search",
            source: "plugin-mcp",
            result: "completed",
          },
        },
      }),
    ).toEqual({
      kind: "tool-end",
      toolCallId: "call-plugin",
      label: "remote_helper",
      content: "done",
      status: "done",
      details: {
        source: "plugin-mcp",
        pluginId: "marketplace:remote-helper",
        pluginName: "remote-helper",
        serverName: "remote-helper",
        toolName: "search",
        registeredName: "remote_helper_search",
        result: "completed",
      },
    });
  });

  it("maps streamed tool-call argument lifecycle events", () => {
    expect(
      normalizePiEvent({
        type: "message_update",
        assistantMessageEvent: {
          type: "toolcall_start",
          contentIndex: 0,
          partial: { content: [{ type: "toolCall", id: "call-1", name: "write", arguments: {} }] },
        },
      }),
    ).toEqual({
      kind: "tool-input-start",
      toolCallId: "call-1",
      label: "write",
      content: "{}",
    });

    expect(
      normalizePiEvent({
        type: "message_update",
        assistantMessageEvent: {
          type: "toolcall_delta",
          contentIndex: 0,
          delta: "\"<h1\"",
          partial: {
            content: [{ type: "toolCall", id: "call-1", name: "write", arguments: { path: "index.html", content: "<h1" } }],
          },
        },
      }),
    ).toEqual({
      kind: "tool-input-update",
      toolCallId: "call-1",
      label: "write",
      content: '{\n  "path": "index.html",\n  "content": "<h1"\n}',
      input: { path: "index.html", content: "<h1" },
      longformInputPreview: {
        kind: "longform-input",
        title: "Input",
        runningTitle: "Writing",
        summary: "index.html",
        items: [
          {
            label: "File",
            fieldPath: "content",
            path: "index.html",
            language: "html",
            preview: "<h1",
            chars: 3,
            truncated: false,
          },
        ],
      },
    });

    expect(
      normalizePiEvent({
        type: "message_update",
        assistantMessageEvent: {
          type: "toolcall_end",
          toolCall: { type: "toolCall", id: "call-1", name: "write", arguments: { path: "index.html", content: "<h1>ok</h1>" } },
        },
      }),
    ).toEqual({
      kind: "tool-input-end",
      toolCallId: "call-1",
      label: "write",
      content: '{\n  "path": "index.html",\n  "content": "<h1>ok</h1>"\n}',
      input: { path: "index.html", content: "<h1>ok</h1>" },
      longformInputPreview: {
        kind: "longform-input",
        title: "Input",
        runningTitle: "Writing",
        summary: "index.html",
        items: [
          {
            label: "File",
            fieldPath: "content",
            path: "index.html",
            language: "html",
            preview: "<h1>ok</h1>",
            chars: 11,
            truncated: false,
          },
        ],
      },
    });
  });

  it("marks raw tool-call delta text as an appendable content delta", () => {
    expect(
      normalizePiEvent({
        type: "message_update",
        assistantMessageEvent: {
          type: "toolcall_delta",
          contentIndex: 0,
          delta: "\"content",
          partial: {
            content: [{ type: "toolCall", id: "call-delta", name: "write", arguments: "{\"path\":\"index.html\"," }],
          },
        },
      }),
    ).toEqual({
      kind: "tool-input-update",
      toolCallId: "call-delta",
      label: "write",
      content: "\"content",
      contentDelta: true,
    });
  });

  it("labels routed ambient tool calls with the wrapped tool name", () => {
    const content = "x".repeat(700);
    const streamed = normalizePiEvent({
      type: "message_update",
      assistantMessageEvent: {
        type: "toolcall_delta",
        toolCall: {
          type: "toolCall",
          id: "call-routed",
          name: "ambient_tool_call",
          arguments: {
            toolName: "file_write",
            toolInput: { path: "notes/example.md", content },
          },
        },
      },
    });

    expect(streamed).toMatchObject({
      kind: "tool-input-update",
      toolCallId: "call-routed",
      label: "file_write",
    });

    const completed = normalizePiEvent({
      type: "tool_execution_end",
      toolCallId: "call-routed",
      toolName: "ambient_tool_call",
      result: {
        content: [{ type: "text", text: "Successfully wrote 700 characters to notes/example.md." }],
        details: {
          runtime: "ambient-tool-router",
          toolName: "file_write",
          status: "complete",
          resultDetails: { runtime: "workspace-file", toolName: "file_write" },
        },
      },
    });

    expect(completed).toMatchObject({
      kind: "tool-end",
      toolCallId: "call-routed",
      label: "file_write",
      content: "Successfully wrote 700 characters to notes/example.md.",
      status: "done",
      details: expect.objectContaining({
        runtime: "ambient-tool-router",
        toolName: "file_write",
      }),
    });
  });

  it("marks malformed routed ambient tool calls as rejected failures", () => {
    const completed = normalizePiEvent({
      type: "tool_execution_end",
      toolCallId: "call-routed",
      toolName: "ambient_tool_call",
      result: {
        content: [
          {
            type: "text",
            text: [
              "No execution performed. Malformed Ambient tool router call.",
              "Use direct active tools when available, for example browser_nav({ url }) or browser_eval({ code }).",
            ].join("\n"),
          },
        ],
        details: {
          runtime: "ambient-tool-router",
          toolName: "ambient_tool_call",
          status: "invalid-input",
          executionSkipped: true,
        },
      },
    });

    expect(completed).toMatchObject({
      kind: "tool-end",
      toolCallId: "call-routed",
      label: "malformed_tool_call",
      content: expect.stringContaining("Malformed Ambient tool router call"),
      status: "error",
      details: expect.objectContaining({
        runtime: "ambient-tool-router",
        toolName: "ambient_tool_call",
        result: "invalid-input",
      }),
    });
  });

  it("labels rejected routed ambient tool contracts with the intended wrapped tool", () => {
    const completed = normalizePiEvent({
      type: "tool_execution_end",
      toolCallId: "call-routed",
      toolName: "ambient_tool_call",
      result: {
        content: [{ type: "text", text: "No execution performed. Invalid input for file_write: $.path is required" }],
        details: {
          runtime: "ambient-tool-router",
          toolName: "ambient_tool_describe",
          status: "invalid-input",
          executionSkipped: true,
          describedTool: { name: "file_write" },
        },
      },
    });

    expect(completed).toMatchObject({
      kind: "tool-end",
      toolCallId: "call-routed",
      label: "file_write",
      status: "error",
    });
  });

  it("shows shell commands directly in tool-start events", () => {
    expect(
      normalizePiEvent({
        type: "tool_execution_start",
        toolCallId: "call-2",
        toolName: "bash",
        args: { command: "npm test", cwd: "/tmp/project", description: "Run unit tests" },
      }),
    ).toEqual({
      kind: "tool-start",
      toolCallId: "call-2",
      label: "bash",
      content: "npm test\ncwd: /tmp/project\ndescription: Run unit tests",
    });
  });

  it("maps tool result messages to the same tool-end shape", () => {
    expect(
      normalizePiEvent({
        type: "message_end",
        message: {
          role: "toolResult",
          toolCallId: "call-1",
          toolName: "write",
          content: [{ type: "text", text: "wrote file" }],
        },
      }),
    ).toEqual({
      kind: "tool-end",
      toolCallId: "call-1",
      label: "write",
      content: "wrote file",
      status: "done",
    });
  });
});

describe("formatToolResult", () => {
  it("extracts text blocks and nested content", () => {
    expect(formatToolResult({ content: [{ text: "first" }, { text: "second" }] })).toBe("first\nsecond");
  });
});

describe("formatToolArgs", () => {
  it("formats command-shaped arguments as executable text", () => {
    expect(formatToolArgs({ command: "pnpm test", cwd: "/repo" })).toBe("pnpm test\ncwd: /repo");
  });

  it("keeps long string arguments as parseable preview JSON", () => {
    const formatted = formatToolArgs({ path: "index.html", content: "a".repeat(2000) });
    const parsed = JSON.parse(formatted) as {
      path: string;
      content: { preview: string; chars: number; truncated: boolean; omittedChars: number };
    };
    expect(parsed.path).toBe("index.html");
    expect(parsed.content).toEqual({
      preview: `${"a".repeat(1000)}\n... (2000 chars total)`,
      chars: 2000,
      truncated: true,
      omittedChars: 1000,
    });
    expect(formatted.length).toBeLessThanOrEqual(1600);
  });

  it("preserves multi-file apply-repair paths in bounded fallback JSON", () => {
    const formatted = formatToolArgs({
      packageName: "ambient-five-file-repair",
      reason: "Apply a repair that touches several files.",
      files: Array.from({ length: 5 }, (_, index) => ({
        path: `src/file-${index + 1}.ts`,
        content: `export const value${index + 1} = "${"x".repeat(1800)}";`,
        rationale: `Update file ${index + 1}.`,
      })),
    });
    const parsed = JSON.parse(formatted) as {
      files: Array<{ path: string; content: { preview: string; chars: number; truncated: boolean; omittedChars: number } }>;
    };

    expect(formatted.length).toBeLessThanOrEqual(1600);
    expect(parsed.files).toHaveLength(5);
    expect(parsed.files.map((file) => file.path)).toEqual(["src/file-1.ts", "src/file-2.ts", "src/file-3.ts", "src/file-4.ts", "src/file-5.ts"]);
    for (const file of parsed.files) {
      expect(file.content.preview).toContain("chars total)");
      expect(file.content.chars).toBeGreaterThan(1800);
      expect(file.content.truncated).toBe(true);
    }
  });
});

describe("Pi child runtime event mapper", () => {
  it("clips long child runtime messages while preserving child attribution and artifact paths", () => {
    const run = subagentRun();
    const event = mapPiChildRuntimeEvent({
      run,
      source: "wait_agent",
      event: {
        type: "tool_result",
        toolName: "shell_exec",
        message: `line one\n${"message ".repeat(120)}`,
        textPreview: "output ".repeat(300),
        artifactPath: "test-results/subagents/run-1/full-output.txt",
        tokenCount: 123,
        costMicros: 456,
        localMemoryBytes: 789,
        createdAt: "2026-06-05T00:00:01.000Z",
      },
    });

    expect(PI_CHILD_EVENT_MAPPER_SCHEMA_VERSION).toBe("ambient-pi-child-event-mapper-v1");
    expect(event).toMatchObject({
      schemaVersion: "ambient-subagent-runtime-event-v1",
      type: "tool_result",
      source: "wait_agent",
      runId: "child-run-1",
      parentRunId: "parent-run-1",
      childThreadId: "child-thread-1",
      toolName: "shell_exec",
      artifactPath: "test-results/subagents/run-1/full-output.txt",
      tokenCount: 123,
      costMicros: 456,
      localMemoryBytes: 789,
      createdAt: "2026-06-05T00:00:01.000Z",
    });
    expect(event.message).toContain("line one message");
    expect(event.message).toHaveLength(600);
    expect(event.message).toMatch(/\.\.\.$/);
    expect(event.textPreview).toHaveLength(1200);
    expect(event.textPreview).toMatch(/\.\.\.$/);
  });

  it("fails closed when a child runtime event would clip output without a full artifact path", () => {
    expect(validatePiChildRuntimeEventLargeOutputArtifact({
      event: {
        message: "short status",
        textPreview: "x".repeat(80),
      },
      messagePreviewChars: 60,
      textPreviewChars: 120,
    })).toMatchObject({
      schemaVersion: "ambient-pi-child-runtime-large-output-artifact-v1",
      valid: true,
      requiresArtifact: false,
      clippedFields: [],
    });

    expect(validatePiChildRuntimeEventLargeOutputArtifact({
      event: {
        message: "message ".repeat(20),
        textPreview: "output ".repeat(40),
        artifactPath: "ambient://threads/child-thread-1/transcript",
      },
      messagePreviewChars: 60,
      textPreviewChars: 120,
    })).toMatchObject({
      valid: true,
      requiresArtifact: true,
      artifactPath: "ambient://threads/child-thread-1/transcript",
      clippedFields: [
        { field: "message", maxInlineChars: 60 },
        { field: "textPreview", maxInlineChars: 120 },
      ],
    });

    expect(() => mapPiChildRuntimeEvent({
      run: subagentRun(),
      source: "child_runtime",
      event: {
        type: "assistant_delta",
        textPreview: "assistant output ".repeat(100),
      },
      textPreviewChars: 120,
    })).toThrow(/Large child runtime output would be clipped or truncated without a full artifact path/);

    expect(validatePiChildRuntimeEventLargeOutputArtifact({
      event: {
        details: {
          largeOutputPreview: {
            kind: "large-output",
            summary: "stdout · 17,000 chars · 16,000 preview",
            items: [{
              label: "stdout",
              chars: 17_000,
              previewChars: 16_000,
              truncated: true,
            }],
          },
        },
      },
    })).toMatchObject({
      valid: false,
      requiresArtifact: true,
      clippedFields: [],
      missingArtifactItems: [{ label: "stdout", chars: 17_000, previewChars: 16_000 }],
      reason: expect.stringContaining("large-output items: stdout 17000/16000"),
    });

    expect(validatePiChildRuntimeEventLargeOutputArtifact({
      event: {
        details: {
          largeOutputPreview: {
            kind: "large-output",
            summary: "stdout · full output: .ambient/tool-outputs/stdout.txt",
            items: [{
              label: "stdout",
              chars: 17_000,
              previewChars: 16_000,
              truncated: true,
              artifactPath: ".ambient/tool-outputs/stdout.txt",
            }],
          },
        },
      },
    })).toMatchObject({
      valid: true,
      requiresArtifact: true,
      artifactPath: ".ambient/tool-outputs/stdout.txt",
      missingArtifactItems: [],
    });
  });

  it("builds compact Pi updates that identify the child run for tool, approval, and error attribution", () => {
    const run = subagentRun({ status: "needs_attention" });
    const event = mapPiChildRuntimeEvent({
      run,
      source: "child_runtime",
      event: {
        type: "error",
        status: "needs_attention",
        message: "Approval required before the child can run a mutating connector tool.",
        toolName: "gmail.send_email",
        artifactPath: "test-results/subagents/run-1/approval.json",
        details: {
          approvalSource: "permission_grant",
          approvalGrantId: "approval-worker",
          worktreeIsolated: true,
          worktreePath: "/repo/.ambient-codex/worktrees/child-run-1",
          category: "connector.gmail.send",
          rawConnectorResponse: "do not copy raw details into parent update",
        },
      },
    });
    const details = piChildRuntimeEventUpdateDetails({
      runtime: "ambient-subagents",
      phase: "phase-2-pi-tool-surface",
      toolName: "ambient_subagent",
      action: "child_runtime",
    }, run, event);

    expect(piChildRuntimeEventUpdateText(event)).toBe(
      "Sub-agent child-run-1 error: Approval required before the child can run a mutating connector tool.",
    );
    expect(details).toMatchObject({
      runtime: "ambient-subagents",
      phase: "phase-2-pi-tool-surface",
      toolName: "ambient_subagent",
      action: "child_runtime",
      type: "subagent.runtime_event",
      childRunId: "child-run-1",
      parentThreadId: "parent-thread-1",
      parentRunId: "parent-run-1",
      childThreadId: "child-thread-1",
      canonicalTaskPath: "root/1:explorer",
      run: {
        id: "child-run-1",
        childRunId: "child-run-1",
        parentThreadId: "parent-thread-1",
        parentRunId: "parent-run-1",
        childThreadId: "child-thread-1",
        canonicalTaskPath: "root/1:explorer",
        status: "needs_attention",
      },
      event: {
        type: "error",
        source: "child_runtime",
        runId: "child-run-1",
        childRunId: "child-run-1",
        parentThreadId: "parent-thread-1",
        parentRunId: "parent-run-1",
        childThreadId: "child-thread-1",
        canonicalTaskPath: "root/1:explorer",
        status: "needs_attention",
        toolName: "gmail.send_email",
        artifactPath: "test-results/subagents/run-1/approval.json",
        approvalId: "approval-worker",
        approvalSource: "permission_grant",
        worktreeIsolated: true,
        worktreePath: "/repo/.ambient-codex/worktrees/child-run-1",
        toolCategory: "connector.gmail.send",
      },
    });
    expect((details.event as Record<string, unknown>).details).toBeUndefined();
    expect(JSON.stringify(details)).not.toContain("do not copy raw details");
  });
});

function subagentRun(overrides: Partial<SubagentRunSummary> = {}): SubagentRunSummary {
  return {
    id: "child-run-1",
    protocolVersion: "ambient-subagent-v1",
    parentThreadId: "parent-thread-1",
    parentRunId: "parent-run-1",
    childThreadId: "child-thread-1",
    canonicalTaskPath: "root/1:explorer",
    roleId: "explorer",
    roleProfileSnapshot: {
      id: "explorer",
      label: "Explorer",
      description: "Explore implementation details.",
      defaultPrompt: "Inspect the task and report findings.",
      allowedToolCategories: ["read_only"],
      modelRuntimePreference: "default",
    } as any,
    roleProfileSnapshotSource: "resolved",
    dependencyMode: "required",
    status: "running",
    featureFlagSnapshot: {
      subagents: true,
      source: "settings",
      resolvedAt: "2026-06-05T00:00:00.000Z",
      launchOverrides: {},
    } as any,
    modelRuntimeSnapshot: {
      providerId: "ambient",
      modelId: "glm-5.1",
      modelLabel: "GLM 5.1",
      source: "registry",
      capabilities: {},
      resolvedAt: "2026-06-05T00:00:00.000Z",
    } as any,
    capacityLeaseSnapshot: {
      leaseId: "lease-1",
      capacityKey: "subagents",
      acquired: true,
      limit: 4,
      inUse: 1,
      acquiredAt: "2026-06-05T00:00:00.000Z",
    } as any,
    createdAt: "2026-06-05T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:00.000Z",
    ...overrides,
  };
}
