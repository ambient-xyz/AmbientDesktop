import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../../shared/types";
import {
  artifactMediaKindFromPath,
  artifactPreviewRoute,
  collectArtifactPathHints,
  mediaPreviewUnavailableMessage,
  parseToolMessage,
  resolveInlineArtifactPath,
  toolLargeOutputPreviewViewModel,
  toolLongformInputPreviewDisplaySummary,
  toolMessagingConversationDirectorySetupCardViewModel,
  toolMessagingRemoteSurfaceActivationCardViewModel,
} from "./toolMessageUiModel";

describe("tool message UI model", () => {
  it("parses write tool messages into artifact previews", () => {
    const parsed = parseToolMessage(
      [
        "write completed",
        "",
        "Input",
        JSON.stringify({ path: "src/generated.ts", content: "" }, null, 2),
        "",
        "Result",
        "Successfully wrote 0 bytes to src/generated.ts",
      ].join("\n"),
      "write",
      "/workspace",
    );

    expect(parsed.artifactPath).toBe("src/generated.ts");
    expect(parsed.writePreview).toEqual({
      path: "src/generated.ts",
      content: "",
      language: "typescript",
    });
    expect(parsed.longformInputPreview).toMatchObject({
      summary: "src/generated.ts",
      items: [{ path: "src/generated.ts", preview: "", chars: 0, truncated: false }],
    });
  });

  it("parses file_write messages into the shared longform preview", () => {
    const parsed = parseToolMessage(
      [
        "file_write completed",
        "",
        "Input",
        JSON.stringify({ path: "reports/out.md", content: "hello" }, null, 2),
        "",
        "Result",
        "Wrote reports/out.md",
      ].join("\n"),
      "file_write",
      "/workspace",
    );

    expect(parsed.artifactPath).toBe("reports/out.md");
    expect(parsed.preview).toBe("reports/out.md");
    expect(parsed.longformInputPreview).toMatchObject({
      title: "Input",
      runningTitle: "Writing file",
      summary: "reports/out.md",
      items: [{ path: "reports/out.md", language: "markdown", preview: "hello", chars: 5 }],
    });
  });

  it("parses capability apply-repair input into multi-file previews", () => {
    const parsed = parseToolMessage(
      [
        "ambient_capability_builder_apply_repair preparing",
        "",
        "Input",
        JSON.stringify(
          {
            packageName: "ambient-elevenlabs-tts",
            reason: "Convert the TTS artifact generator into a provider.",
            files: [
              {
                path: "ambient-cli.json",
                content: '{"name":"ambient-elevenlabs-tts"}\n... (1718 chars total)',
                rationale: "Add provider metadata.",
              },
              {
                path: "scripts/run.mjs",
                content: "console.log('ok');\n",
              },
            ],
          },
          null,
          2,
        ),
      ].join("\n"),
      "ambient_capability_builder_apply_repair",
      "/workspace",
    );

    expect(parsed.preview).toBe("ambient-elevenlabs-tts · 2 files · 1,737 chars");
    expect(parsed.resultPreview).toBe("");
    expect(parsed.applyRepairPreview).toMatchObject({
      packageName: "ambient-elevenlabs-tts",
      reason: "Convert the TTS artifact generator into a provider.",
      totalChars: 1737,
      files: [
        {
          path: "ambient-cli.json",
          charCount: 1718,
          language: "json",
          rationale: "Add provider metadata.",
        },
        {
          path: "scripts/run.mjs",
          charCount: 19,
          language: "javascript",
        },
      ],
    });
    expect(parsed.longformInputPreview).toMatchObject({
      title: "Repair files",
      runningTitle: "Applying repair",
      summary: "ambient-elevenlabs-tts · 2 files · 1,737 chars",
      items: [
        { label: "File 1", fieldPath: "files[0].content", path: "ambient-cli.json", chars: 1718, truncated: true },
        { label: "File 2", fieldPath: "files[1].content", path: "scripts/run.mjs", chars: 19, truncated: false },
      ],
    });
  });

  it("parses structured long-string fallback previews for apply-repair files", () => {
    const parsed = parseToolMessage(
      [
        "ambient_capability_builder_apply_repair preparing",
        "",
        "Input",
        JSON.stringify(
          {
            packageName: "ambient-elevenlabs-tts",
            files: [
              {
                path: "ambient-cli.json",
                content: {
                  preview: '{"name":"ambient-elevenlabs-tts"}\n... (1718 chars total)',
                  chars: 1718,
                  truncated: true,
                  omittedChars: 1691,
                },
              },
              {
                path: "scripts/run.mjs",
                content: {
                  preview: "console.log('ok');\n... (2200 chars total)",
                  chars: 2200,
                  truncated: true,
                  omittedChars: 2182,
                },
              },
            ],
          },
          null,
          2,
        ),
      ].join("\n"),
      "ambient_capability_builder_apply_repair",
      "/workspace",
    );

    expect(parsed.preview).toBe("ambient-elevenlabs-tts · 2 files · 3,918 chars");
    expect(parsed.longformInputPreview).toMatchObject({
      summary: "ambient-elevenlabs-tts · 2 files · 3,918 chars",
      items: [
        { path: "ambient-cli.json", chars: 1718, truncated: true },
        { path: "scripts/run.mjs", chars: 2200, truncated: true },
      ],
    });
  });

  it("uses metadata longform previews when visible input is structurally truncated", () => {
    const parsed = parseToolMessage(
      [
        "ambient_capability_builder_apply_repair preparing",
        "",
        "Input",
        '{ "packageName": "ambient-elevenlabs-tts", "files": [',
      ].join("\n"),
      "ambient_capability_builder_apply_repair",
      "/workspace",
      {
        toolLongformInputPreview: {
          kind: "longform-input",
          title: "Repair files",
          runningTitle: "Applying repair",
          summary: "ambient-elevenlabs-tts · 2 files · 2,400 chars",
          items: [
            {
              label: "File 1",
              fieldPath: "files[0].content",
              path: "ambient-cli.json",
              language: "json",
              preview: "{}",
              chars: 1200,
              truncated: true,
            },
            {
              label: "File 2",
              fieldPath: "files[1].content",
              path: "scripts/run.mjs",
              language: "javascript",
              preview: "console.log('ok');",
              chars: 1200,
              truncated: true,
            },
          ],
        },
      },
    );

    expect(parsed.preview).toBe("ambient-elevenlabs-tts · 2 files · 2,400 chars");
    expect(parsed.longformInputPreview?.items.map((item) => item.path)).toEqual(["ambient-cli.json", "scripts/run.mjs"]);
    expect(parsed.applyRepairPreview).toBeUndefined();
  });

  it("keeps single-file write char counts in the file row only", () => {
    const parsed = parseToolMessage(
      [
        "write preparing",
        "",
        "Input",
        '{ "path": "src/generated.ts", "content": "',
      ].join("\n"),
      "write",
      "/workspace",
      {
        toolLongformInputPreview: {
          kind: "longform-input",
          title: "Input",
          runningTitle: "Writing",
          summary: "src/generated.ts · 1,200 chars",
          items: [
            {
              label: "File",
              fieldPath: "content",
              path: "src/generated.ts",
              language: "typescript",
              preview: "a".repeat(20),
              chars: 1200,
              truncated: true,
            },
          ],
        },
      },
    );

    expect(parsed.preview).toBe("src/generated.ts");
    expect(parsed.preview).not.toContain("1,200 chars");
    expect(parsed.longformInputPreview).toBeTruthy();
    expect(toolLongformInputPreviewDisplaySummary(parsed.longformInputPreview!)).toBe("src/generated.ts");
    expect(parsed.longformInputPreview?.items[0]?.chars).toBe(1200);
  });

  it("uses workflow longform metadata for playbook update cards", () => {
    const parsed = parseToolMessage(
      [
        "ambient_workflows_update preparing",
        "",
        "Input",
        JSON.stringify({ type: "object", keys: ["baseVersion", "id", "draft"], totalKeys: 3, truncated: true }, null, 2),
      ].join("\n"),
      "ambient_workflows_update",
      "/workspace",
      {
        toolLongformInputPreview: {
          kind: "longform-input",
          title: "Workflow update",
          runningTitle: "Updating workflow playbook",
          summary: "Find date-night theatre events · base v3 · 2 examples · 1 do-not patterns",
          items: [
            {
              label: "Intent",
              fieldPath: "draft.intent",
              preview: "Find date-night theatre events.",
              chars: 31,
              truncated: false,
            },
          ],
        },
      },
    );

    expect(parsed.preview).toBe("Find date-night theatre events · base v3 · 2 examples · 1 do-not patterns");
    expect(parsed.longformInputPreview).toMatchObject({
      title: "Workflow update",
      runningTitle: "Updating workflow playbook",
      items: [{ label: "Intent", fieldPath: "draft.intent" }],
    });
  });

  it("renders compact workflow management input summaries", () => {
    const update = parseToolMessage(
      [
        "ambient_workflows_update preparing",
        "",
        "Input",
        JSON.stringify(
          {
            id: "workflow-date-night",
            baseVersion: 3,
            draft: { intent: "Find date-night theatre events." },
          },
          null,
          2,
        ),
      ].join("\n"),
      "ambient_workflows_update",
      "/workspace",
    );
    const archive = parseToolMessage(
      [
        "ambient_workflows_archive preparing",
        "",
        "Input",
        JSON.stringify({ id: "workflow-date-night", baseVersion: 4, reason: "superseded" }, null, 2),
      ].join("\n"),
      "ambient_workflows_archive",
      "/workspace",
    );

    expect(update.preview).toBe("Find date-night theatre events. · base v3 · draft update");
    expect(archive.preview).toBe("workflow-date-night · base v4 · superseded");
  });

  it("surfaces streamed argument status from tool metadata", () => {
    const parsed = parseToolMessage(
      ["write preparing", "", "Input", '{ "path": "plan.md", "content": "'].join("\n"),
      "write",
      "/workspace",
      {
        toolArgumentProgress: {
          version: 1,
          phase: "argument_stream",
          eventType: "toolcall_delta",
          toolCallId: "call-1",
          toolName: "write",
          uiStatus: "write is streaming a large argument (12,000 chars).",
          argumentStartedAt: "2026-05-21T10:00:00.000Z",
          argumentUpdatedAt: "2026-05-21T10:00:02.000Z",
          argumentElapsedMs: 2000,
          argumentComplete: false,
          inputChars: 12000,
          deltaChars: 12000,
          totalDeltaChars: 12000,
          maxDeltaChars: 12000,
          argumentEventCount: 2,
          toolcallDeltaCount: 1,
          meaningfulGrowthCount: 1,
          charsPerSecond: 6000,
        },
      },
    );

    expect(parsed.argumentStatus).toBe("write is streaming a large argument (12,000 chars).");
    expect(parsed.argumentProgress).toMatchObject({
      phase: "argument_stream",
      inputChars: 12000,
    });
  });

  it("renders generic running tool progress without counting heartbeat text as output", () => {
    const result = "Still planning MCP autowire for https://github.com/example/repo (2m 20s elapsed).";
    const parsed = parseToolMessage(
      [
        "ambient_mcp_autowire_plan running",
        "",
        "Input",
        JSON.stringify({ allowedDiscovery: { maxFetches: 8, search: true }, targetUrl: "https://github.com/example/repo" }, null, 2),
        "",
        "Result",
        result,
      ].join("\n"),
      "ambient_mcp_autowire_plan",
      "/workspace",
      {
        toolArgumentProgress: {
          version: 1,
          phase: "execution",
          eventType: "tool_execution_start",
          toolCallId: "call-autowire",
          toolName: "ambient_mcp_autowire_plan",
          uiStatus: "ambient_mcp_autowire_plan is executing (203 chars).",
          argumentStartedAt: "2026-06-07T19:20:00.000Z",
          argumentUpdatedAt: "2026-06-07T19:20:00.000Z",
          argumentElapsedMs: 1000,
          argumentComplete: true,
          inputChars: 203,
          deltaChars: 0,
          totalDeltaChars: 203,
          maxDeltaChars: 203,
          observedArgumentChars: 203,
          argumentEventCount: 2,
          toolcallDeltaCount: 1,
          meaningfulGrowthCount: 1,
          charsPerSecond: 203,
          executionElapsedMs: 140_000,
        },
        toolResultDetails: {
          runtime: "ambient-mcp",
          toolName: "ambient_mcp_autowire_plan",
          status: "planning",
          stage: "heartbeat",
          targetUrl: "https://github.com/example/repo",
          elapsedMs: 140_000,
          heartbeatCount: 28,
        },
      },
    );

    expect(parsed.progressPreview).toMatchObject({
      title: "Progress",
      summary: expect.stringContaining("Planning · Heartbeat · 2m 20s · 203 chars"),
      rows: expect.arrayContaining([
        { key: "state", label: "State", value: "Planning" },
        { key: "stage", label: "Stage", value: "Heartbeat" },
        { key: "input", label: "Input", value: "203 chars" },
        { key: "elapsed", label: "Elapsed", value: "2m 20s" },
        { key: "updates", label: "Updates", value: "28" },
        { key: "target", label: "Target", value: "https://github.com/example/repo" },
      ]),
    });
    expect(parsed.progressPreview?.summary).not.toContain(`${result.length.toLocaleString()} output chars`);
    expect(parsed.progressPreview?.rows).not.toContainEqual({ key: "output", label: "Output", value: `${result.length.toLocaleString()} chars` });
    expect(parsed.longformInputPreview).toBeUndefined();
  });

  it("renders Local Deep Research status snapshots as meaningful progress", () => {
    const parsed = parseToolMessage(
      [
        "ambient_local_deep_research_run running",
        "",
        "Input",
        JSON.stringify({ question: "Research authorial voice." }, null, 2),
        "",
        "Result",
        "Local Deep Research is still running.",
      ].join("\n"),
      "ambient_local_deep_research_run",
      "/workspace",
      {
        toolResultDetails: {
          runtime: "ambient-local-deep-research",
          toolName: "ambient_local_deep_research_run",
          status: "running",
          stage: "model-turn",
          activityMessage: "LiteResearcher model turn 2/6 is running.",
          elapsedMs: 75_000,
          heartbeatCount: 7,
          localDeepResearchStatus: {
            schemaVersion: "ambient-local-deep-research-status-v1",
            stage: "model-turn",
            state: "running",
            message: "LiteResearcher model turn 2/6 is running.",
            elapsedMs: 75_000,
            heartbeatCount: 7,
            turn: {
              turn: 2,
              maxTurns: 6,
              toolCalls: 3,
              maxToolCalls: 6,
            },
            retrieval: {
              role: "fetch",
              status: "succeeded",
              providerLabel: "Scrapling MCP",
              url: "https://example.com/voice",
              outputChars: 4321,
              durationMs: 1800,
              repeatedVisitCount: 2,
            },
            llamaServer: {
              pid: 1234,
              endpointUrl: "http://127.0.0.1:57188",
              profileId: "literesearcher-4b-q4-k-m",
              healthy: true,
              healthLatencyMs: 42,
              rssBytes: 9_900_000_000,
            },
            memory: {
              policyOutcome: "warn",
              policyReason: "Projected local-model launch over policy.",
              activeLocalModelCount: 2,
              activeEstimatedResidentMemoryBytes: 16_106_127_360,
              activeActualResidentMemoryBytes: 8_375_000_000,
              projectedSystemMemoryUtilization: 1,
              maxProjectedMemoryUtilization: 0.8,
              projectedFreeMemoryBytes: 0,
              hostFreeMemoryBytes: 2_147_483_648,
              swapUsedBytes: 3_758_096_384,
              compressedMemoryBytes: 1_412_050_944,
              warnings: ["Projected local-model launch over policy."],
            },
            artifacts: {
              markdownPath: ".ambient/local-deep-research/runs/latest.md",
            },
          },
        },
      },
    );

    expect(parsed.progressPreview).toMatchObject({
      title: "Progress",
      summary: expect.stringContaining("LiteResearcher model turn 2/6 is running."),
      rows: expect.arrayContaining([
        { key: "turn", label: "Turn", value: "2/6 · 3/6 tools" },
        { key: "retrieval", label: "Retrieval", value: "Fetch · Succeeded · repeat 2" },
        { key: "provider", label: "Provider", value: "Scrapling MCP" },
        { key: "server", label: "llama.cpp", value: expect.stringContaining("healthy") },
        { key: "rss", label: "Server RSS", value: expect.stringContaining("GiB") },
        { key: "memory-policy", label: "Memory policy", value: expect.stringContaining("Warn") },
        { key: "projected-use", label: "Projected use", value: expect.stringContaining("100% projected") },
        { key: "swap", label: "Swap used", value: expect.stringContaining("GiB") },
        { key: "artifacts", label: "Artifacts", value: ".ambient/local-deep-research/runs/latest.md" },
      ]),
    });
  });

  it("prefers explicit progress metrics over heartbeat result text length", () => {
    const parsed = parseToolMessage(
      [
        "ambient_mcp_standard_import_install running",
        "",
        "Input",
        JSON.stringify({ candidateRef: "ambient-mcp-candidate:example" }, null, 2),
        "",
        "Result",
        "Waiting for Ambient Desktop approval: Install MCP server?",
      ].join("\n"),
      "ambient_mcp_standard_import_install",
      "/workspace",
      {
        toolResultDetails: {
          runtime: "ambient-permission",
          toolName: "ambient_mcp_standard_import_install",
          status: "awaiting-approval",
          stage: "approval",
          waitingOn: "desktop-approval",
          elapsedMs: 15_000,
          outputChars: 4096,
          thinkingChars: 512,
          heartbeatCount: 4,
          approvalRequestId: "request-1",
          approvalTitle: "Install MCP server?",
        },
      },
    );

    expect(parsed.progressPreview).toMatchObject({
      summary: expect.stringContaining("4,096 output chars"),
      rows: expect.arrayContaining([
        { key: "output", label: "Output", value: "4,096 chars" },
        { key: "thinking", label: "Thinking", value: "512 chars" },
        { key: "waiting-on", label: "Waiting on", value: "Desktop Approval" },
        { key: "approval", label: "Approval", value: "Install MCP server?" },
      ]),
    });
  });

  it("parses install route summaries into a transcript preview model", () => {
    const parsed = parseToolMessage(
      [
        "ambient_install_route_plan completed",
        "",
        "Input",
        JSON.stringify({ userRequest: "Install this Codex plugin marketplace entry." }, null, 2),
        "",
        "Result",
        [
          "Ambient install route plan",
          "Lane: unsupported",
          "Confidence: high",
          "Reason: Plugin marketplace and local plugin installs are intentionally hidden until this product surface is supported.",
          "",
          "Next tools:",
          "- none",
          "",
          "Approval boundary: none-readonly",
          "",
          "Blockers:",
          "- Plugin marketplace and local plugin installs are not currently supported as active install routes.",
          "",
          "Warnings:",
          "- Do not call ambient_plugin_install_preview, ambient_plugin_install_commit, or ambient_plugin_activate for this request.",
        ].join("\n"),
      ].join("\n"),
      "ambient_install_route_plan",
      "/workspace",
      {
        toolResultDetails: {
          installRouteSummary: {
            kind: "ambient-install-route-summary",
            lane: "unsupported",
            confidence: "high",
            reason: "Plugin marketplace and local plugin installs are intentionally hidden until this product surface is supported.",
            approvalBoundary: "none-readonly",
            nextTools: [],
            blockers: ["Plugin marketplace and local plugin installs are not currently supported as active install routes."],
            warnings: ["Do not call ambient_plugin_install_preview, ambient_plugin_install_commit, or ambient_plugin_activate for this request."],
            validationTarget: {
              kind: "route-only",
              description: "Refuse the unsupported plugin install route; do not call plugin install tools.",
            },
          },
        },
      },
    );

    expect(parsed.installRoutePreview).toEqual({
      lane: "unsupported",
      confidence: "high",
      reason: "Plugin marketplace and local plugin installs are intentionally hidden until this product surface is supported.",
      approvalBoundary: "none-readonly",
      nextTools: [],
      blockers: ["Plugin marketplace and local plugin installs are not currently supported as active install routes."],
      warnings: ["Do not call ambient_plugin_install_preview, ambient_plugin_install_commit, or ambient_plugin_activate for this request."],
      validationKind: "route-only",
      validationDescription: "Refuse the unsupported plugin install route; do not call plugin install tools.",
    });
  });

  it("parses modern edit tool messages into edit previews with result diffs", () => {
    const parsed = parseToolMessage(
      [
        "edit completed",
        "",
        "Input",
        JSON.stringify({ path: "/workspace/src/app.ts", edits: [{ oldText: "const label = \"old\";", newText: "const label = \"new\";" }] }, null, 2),
        "",
        "Result",
        "Successfully replaced 1 block(s) in src/app.ts.",
      ].join("\n"),
      "edit",
      "/workspace",
      {
        toolResultDetails: {
          diff: '-2 const label = "old";\n+2 const label = "new";',
          firstChangedLine: 2,
        },
      },
    );

    expect(parsed.artifactPath).toBe("src/app.ts");
    expect(parsed.writePreview).toBeUndefined();
    expect(parsed.editPreview).toEqual({
      path: "/workspace/src/app.ts",
      edits: [{ oldText: 'const label = "old";', newText: 'const label = "new";' }],
      diff: '-2 const label = "old";\n+2 const label = "new";',
      firstChangedLine: 2,
      language: "typescript",
    });
  });

  it("supports legacy and stringified edit argument shapes", () => {
    const legacy = parseToolMessage(
      ["edit prepared", "", "Input", JSON.stringify({ path: "README.md", oldText: "  old\n", newText: "" }, null, 2)].join("\n"),
      "edit",
      "/workspace",
    );
    expect(legacy.editPreview?.edits).toEqual([{ oldText: "  old\n", newText: "" }]);

    const stringified = parseToolMessage(
      [
        "edit prepared",
        "",
        "Input",
        JSON.stringify({ path: "README.md", edits: JSON.stringify([{ oldText: "before", newText: "after" }]) }, null, 2),
      ].join("\n"),
      "edit",
      "/workspace",
    );
    expect(stringified.editPreview?.edits).toEqual([{ oldText: "before", newText: "after" }]);
  });

  it("prefers structured edit input metadata over bounded raw JSON", () => {
    const parsed = parseToolMessage(
      [
        "edit preparing",
        "",
        "Input",
        JSON.stringify(
          {
            path: "src/app.ts",
            edits: [
              {
                oldText: { preview: "raw bounded old", chars: 1300, truncated: true, omittedChars: 100 },
                newText: { preview: "raw bounded new", chars: 1400, truncated: true, omittedChars: 200 },
              },
            ],
          },
          null,
          2,
        ),
      ].join("\n"),
      "edit",
      "/workspace",
      {
        toolEditInputPreview: {
          kind: "edit-input",
          summary: "src/app.ts · 1 replacement · 2,700 chars",
          path: "src/app.ts",
          language: "typescript",
          edits: [
            {
              oldText: { preview: "metadata old preview", chars: 1300, truncated: true, omittedChars: 300 },
              newText: { preview: "metadata new preview", chars: 1400, truncated: false },
            },
          ],
        },
      },
    );

    expect(parsed.editPreview).toEqual({
      path: "src/app.ts",
      language: "typescript",
      edits: [
        {
          oldText: "metadata old preview",
          oldTextChars: 1300,
          oldTextTruncated: true,
          oldTextOmittedChars: 300,
          newText: "metadata new preview",
          newTextChars: 1400,
        },
      ],
    });
  });

  it("parses bounded edit input JSON as a fallback preview", () => {
    const parsed = parseToolMessage(
      [
        "edit preparing",
        "",
        "Input",
        JSON.stringify(
          {
            path: "ambient-cli.json",
            edits: [
              {
                oldText: {
                  preview: '"modelAssets": [\n  {\n    "name": "Piper en_US lessac medium ONNX voice"\n... (689 chars total)',
                  chars: 689,
                  truncated: true,
                  omittedChars: 449,
                },
                newText: {
                  preview: '"modelAssets": [\n  {\n    "name": "Piper en_US ryan high ONNX voice"\n... (1257 chars total)',
                  chars: 1257,
                  truncated: true,
                  omittedChars: 1017,
                },
              },
            ],
          },
          null,
          2,
        ),
      ].join("\n"),
      "edit",
      "/workspace",
    );

    expect(parsed.editPreview?.path).toBe("ambient-cli.json");
    expect(parsed.editPreview?.edits).toMatchObject([
      {
        oldTextChars: 689,
        oldTextTruncated: true,
        oldTextOmittedChars: 449,
        newTextChars: 1257,
        newTextTruncated: true,
        newTextOmittedChars: 1017,
      },
    ]);
    expect(parsed.editPreview?.edits[0]?.oldText).toContain("Piper en_US lessac medium");
    expect(parsed.editPreview?.edits[0]?.newText).toContain("Piper en_US ryan high");
  });

  it("collects artifact hints from write and edit tool messages", () => {
    const messages: ChatMessage[] = [
      toolMessage("write", ["write completed", "", "Input", JSON.stringify({ path: "src/generated.ts", content: "ok" })].join("\n")),
      toolMessage(
        "edit",
        ["edit completed", "", "Input", JSON.stringify({ path: "src/app.ts", edits: [{ oldText: "a", newText: "b" }] })].join("\n"),
      ),
    ];

    const hints = collectArtifactPathHints(messages, "/workspace");
    expect(resolveInlineArtifactPath("generated.ts", hints)).toBe("src/generated.ts");
    expect(resolveInlineArtifactPath("src/app.ts", hints)).toBe("src/app.ts");
  });

  it("surfaces managed MCP output files as previewable workspace artifacts", () => {
    const workspacePath = "/Users/travis/ambientCoder";
    const workspaceArtifactPath = ".ambient/mcp-outputs/2026-06-10/ambient-csvglow-standard-mcp-csvglow.html";
    const metadata = {
      toolName: "ambient_mcp_tool_call",
      status: "done",
      toolResultDetails: {
        runtime: "ambient-mcp",
        toolName: "ambient_mcp_tool_call",
        status: "complete",
        managedFileArtifacts: [{
          source: "output-path",
          filename: "csvglow.html",
          bytes: 1058312,
          containerPath: "/ambient/mcp-files/csvglow.html",
          hostPath: "/Users/travis/Library/Application Support/Ambient Desktop/mcp/toolhive/file-exchange/csvglow.html",
          workspacePath: `${workspacePath}/${workspaceArtifactPath}`,
        }],
      },
    };
    const content = [
      "ambient_mcp_tool_call completed",
      "",
      "Result",
      "MCP tool csvglow-standard-mcp/generate_dashboard completed.",
    ].join("\n");

    const parsed = parseToolMessage(content, "ambient_mcp_tool_call", workspacePath, metadata);

    expect(parsed.artifactPath).toBe(workspaceArtifactPath);
    expect(parsed.managedFileArtifacts).toEqual([{
      source: "output-path",
      filename: "csvglow.html",
      bytes: 1058312,
      containerPath: "/ambient/mcp-files/csvglow.html",
      hostPath: "/Users/travis/Library/Application Support/Ambient Desktop/mcp/toolhive/file-exchange/csvglow.html",
      workspacePath: workspaceArtifactPath,
    }]);

    const hints = collectArtifactPathHints([
      {
        id: "managed-mcp-artifact-message",
        threadId: "thread",
        role: "tool",
        content,
        createdAt: "2026-06-10T00:00:00.000Z",
        metadata,
      },
    ], workspacePath);
    expect(resolveInlineArtifactPath(workspaceArtifactPath, hints, workspacePath)).toBe(workspaceArtifactPath);
    expect(resolveInlineArtifactPath("ambient-csvglow-standard-mcp-csvglow.html", hints, workspacePath)).toBe(workspaceArtifactPath);
  });

  it("resolves absolute workspace paths in inline code as artifact links", () => {
    const workspacePath = "/Users/travis/Documents/AmbientDesktopArchive";

    expect(resolveInlineArtifactPath("/Users/travis/Documents/AmbientDesktopArchive/pdf-summaries.html", undefined, workspacePath)).toBe("pdf-summaries.html");
    expect(resolveInlineArtifactPath("file:///Users/travis/Documents/AmbientDesktopArchive/reports/summary.html", undefined, workspacePath)).toBe("reports/summary.html");
    expect(resolveInlineArtifactPath("/Users/travis/Downloads/outside-summary.html", undefined, workspacePath)).toBeUndefined();
  });

  it("resolves explicit workspace-relative inline code paths as artifact links", () => {
    const workspacePath = "/Users/travis/Documents/AmbientDesktopArchive";

    expect(resolveInlineArtifactPath(".ambient/local-deep-research/runs/2026-06-08T04-39-41-114Z-e85bd214d299.md", undefined, workspacePath)).toBe(
      ".ambient/local-deep-research/runs/2026-06-08T04-39-41-114Z-e85bd214d299.md",
    );
    expect(resolveInlineArtifactPath("reports/summary.html", undefined, workspacePath)).toBe("reports/summary.html");
    expect(resolveInlineArtifactPath("../outside.md", undefined, workspacePath)).toBeUndefined();
    expect(resolveInlineArtifactPath("https://example.com/report.md", undefined, workspacePath)).toBeUndefined();
  });

  it("recognizes explicit media artifacts emitted by shell tools", () => {
    const parsed = parseToolMessage(
      [
        "bash completed",
        "",
        "Command",
        "node generate-media.mjs",
        "",
        "Result",
        "Created notes.txt",
        "Generated media artifact: ./artifacts/live-tone.wav",
      ].join("\n"),
      "bash",
      "/workspace",
    );

    expect(parsed.artifactPath).toBe("./artifacts/live-tone.wav");
  });

  it("routes absolute generated artifact paths through local preview", () => {
    expect(artifactPreviewRoute("/tmp/ambient-test/workspace/calculator.html")).toEqual({ kind: "local-file" });
    expect(artifactPreviewRoute("C:\\Users\\tester\\workspace\\calculator.html")).toEqual({ kind: "local-file" });
    expect(artifactPreviewRoute("\\\\server\\share\\calculator.html")).toEqual({ kind: "local-file" });
    expect(artifactPreviewRoute("calculator.html")).toEqual({ kind: "workspace-file" });
    expect(artifactPreviewRoute(".ambient-codex/browser/screenshots/browser.png")).toEqual({
      kind: "workspace-media",
      mediaKind: "image",
    });
  });

  it("recognizes structured media artifact metadata for first-party media tools", () => {
    const parsed = parseToolMessage(
      [
        "media_download completed",
        "",
        "Input",
        JSON.stringify({ url: "https://example.test/bunny.jpg", outputPath: "bunny.jpg" }, null, 2),
        "",
        "Result",
        "Generated media artifact: bunny.jpg",
      ].join("\n"),
      "media_download",
      "/workspace",
      {
        toolResultDetails: {
          mediaArtifact: {
            artifactPath: "bunny.jpg",
            mediaKind: "image",
            mimeType: "image/jpeg",
            bytes: 2048,
            inlinePreviewEligible: true,
            displayInstruction: "Ambient Desktop will attempt to render this media inline in the visible chat.",
          },
        },
      },
    );

    expect(parsed.artifactPath).toBe("bunny.jpg");
  });

  it("normalizes workspace media artifact paths that lost the leading absolute slash", () => {
    const workspacePath = "/path/to/AmbientDesktop-main-icon-tour/.ambient-codex/worktrees/thread";
    const parsed = parseToolMessage(
      [
        "media_download completed",
        "",
        "Result",
        "Generated media artifact: google-2026-06-16T05-18-43-439Z.png",
      ].join("\n"),
      "media_download",
      workspacePath,
      {
        toolResultDetails: {
          mediaArtifact: {
            artifactPath: `Users/Neo/Documents/AmbientDesktop-main-icon-tour/.ambient-codex/worktrees/thread/.ambient/hosted-images/google-2026-06-16T05-18-43-439Z.png`,
            mediaKind: "image",
            mimeType: "image/jpeg",
            bytes: 2048,
            inlinePreviewEligible: true,
            displayInstruction: "Ambient Desktop will attempt to render this media inline in the visible chat.",
          },
        },
      },
    );

    expect(parsed.artifactPath).toBe(".ambient/hosted-images/google-2026-06-16T05-18-43-439Z.png");
  });

  it("recognizes structured browser screenshot media metadata", () => {
    const parsed = parseToolMessage(
      [
        "browser_screenshot completed",
        "",
        "Input",
        JSON.stringify({ profileMode: "isolated" }, null, 2),
        "",
        "Result",
        "Browser screenshot captured.",
      ].join("\n"),
      "browser_screenshot",
      "/workspace",
      {
        mediaArtifact: {
          artifactPath: ".ambient-codex/browser/screenshots/browser.png",
          mediaKind: "image",
          mimeType: "image/png",
          bytes: 4096,
          width: 1280,
          height: 720,
          inlinePreviewEligible: true,
          displayInstruction: "Ambient Desktop will attempt to render this browser screenshot inline in the visible chat.",
        },
      },
    );

    expect(parsed.artifactPath).toBe(".ambient-codex/browser/screenshots/browser.png");
  });

  it("does not treat generic shell paths as generated media artifacts", () => {
    const parsed = parseToolMessage(
      ["bash completed", "", "Command", "ls -1", "", "Result", "src/app.ts\nREADME.md"].join("\n"),
      "bash",
      "/workspace",
    );

    expect(parsed.artifactPath).toBeUndefined();
  });

  it("recognizes media artifacts reported by ambient cli results", () => {
    const parsed = parseToolMessage(
      [
        "ambient_cli completed",
        "",
        "Input",
        JSON.stringify({ packageName: "ambient-neutts", command: "tts", args: ["--text", "The rain in Spain is falling down the plain"] }, null, 2),
        "",
        "Result",
        "Live Test Results",
        "",
        "Detail\tValue",
        'Input text\t"The rain in Spain is falling down the plain"',
        "Output file\tneutts-rain-spain.wav",
        "Duration\t2.88 seconds",
        "The WAV file is at neutts-rain-spain.wav in the workspace.",
      ].join("\n"),
      "ambient_cli",
      "/workspace",
    );

    expect(parsed.artifactPath).toBe("neutts-rain-spain.wav");
    expect(artifactMediaKindFromPath(parsed.artifactPath!)).toBe("audio");
  });

  it("recognizes ambient cli JSON stdout media outputs relative to the command cwd", () => {
    const parsed = parseToolMessage(
      [
        "ambient_cli completed",
        "",
        "Result",
        "Ambient CLI completed",
        "Package: ambient-neutts",
        "Command: tts",
        "Cwd: /workspace/.ambient/cli-packages/imported/ambient-neutts-0.1.0",
        "Duration: 23862ms",
        "Stdout:",
        "Loading NeuTTS...",
        'Synthesizing: I cant believe this actually worked',
        '{"status":"ok","output":"neutts-cant-believe.wav","sample_rate":24000,"duration_sec":1.34}',
      ].join("\n"),
      "ambient_cli",
      "/workspace",
    );

    expect(parsed.artifactPath).toBe(".ambient/cli-packages/imported/ambient-neutts-0.1.0/neutts-cant-believe.wav");
    expect(artifactMediaKindFromPath(parsed.artifactPath!)).toBe("audio");
  });

  it("recognizes ambient cli audioPath JSON stdout without duplicating absolute workspace paths", () => {
    const workspacePath = "/Users/example/.ambient-hardening/bases/example-core-no-secrets-2026-05-13/workspace";
    const packageRoot = `${workspacePath}/.ambient/cli-packages/imported/ambient-cartesia-0.1.0`;
    const parsed = parseToolMessage(
      [
        "ambient_cli completed",
        "",
        "Result",
        "Ambient CLI completed",
        "Package: ambient-cartesia",
        "Command: tts",
        `Cwd: ${packageRoot}`,
        "Duration: 23862ms",
        "Stdout:",
        JSON.stringify({ audioPath: `${packageRoot}/wuthering-katie.wav`, mimeType: "audio/wav", providerId: "cartesia" }),
      ].join("\n"),
      "ambient_cli",
      workspacePath,
    );

    expect(parsed.artifactPath).toBe(".ambient/cli-packages/imported/ambient-cartesia-0.1.0/wuthering-katie.wav");
    expect(artifactMediaKindFromPath(parsed.artifactPath!)).toBe("audio");
  });

  it("normalizes absolute ambient cli media artifact paths", () => {
    const parsed = parseToolMessage(
      [
        "ambient_cli completed",
        "",
        "Input",
        JSON.stringify({ packageName: "ambient-video", command: "render" }),
        "",
        "Result",
        "Saved output file: /workspace/renders/demo.webm",
      ].join("\n"),
      "ambient_cli",
      "/workspace",
    );

    expect(parsed.artifactPath).toBe("renders/demo.webm");
  });

  it("does not treat generic ambient cli output as a generated media artifact", () => {
    const parsed = parseToolMessage(
      ["ambient_cli completed", "", "Input", JSON.stringify({ packageName: "ambient-json-cli", command: "json-pick" }), "", "Result", "message"].join(
        "\n",
      ),
      "ambient_cli",
      "/workspace",
    );

    expect(parsed.artifactPath).toBeUndefined();
  });

  it("uses large-output metadata for result preview summaries", () => {
    const parsed = parseToolMessage(
      ["ambient_cli completed", "", "Result", "Ambient CLI completed\nStdout:\npreview text"].join("\n"),
      "ambient_cli",
      "/workspace",
      {
        toolResultDetails: {
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
      },
    );

    expect(parsed.resultPreview).toBe("stdout · 17,000 chars · 16,000 preview · full output: .ambient/tool-outputs/stdout.txt");
    expect(parsed.largeOutputPreview).toMatchObject({
      kind: "large-output",
      items: [
        {
          label: "stdout",
          chars: 17000,
          previewChars: 16000,
          artifactPath: ".ambient/tool-outputs/stdout.txt",
        },
      ],
    });
  });

  it("builds display rows for the large-output summary block", () => {
    const model = toolLargeOutputPreviewViewModel({
      kind: "large-output",
      summary: "2 outputs · 24,500 chars · 1 full output artifact",
      items: [
        {
          label: "stdout",
          chars: 17000,
          previewChars: 12000,
          truncated: true,
          artifactPath: ".ambient/tool-outputs/stdout.txt",
          artifactBytes: 17123,
          suggestedTools: ["file_read", "long_context_process"],
        },
        {
          label: "stderr",
          chars: 7500,
          previewChars: 7500,
          truncated: false,
        },
      ],
    });

    expect(model).toEqual({
      title: "Output",
      summary: "2 outputs · 24,500 chars · 1 full output artifact",
      rows: [
        {
          key: "stdout-.ambient/tool-outputs/stdout.txt",
          label: "stdout",
          charsLabel: "17,000 chars total",
          previewCharsLabel: "12,000 preview",
          bytesLabel: "17,123 bytes",
          artifactPath: ".ambient/tool-outputs/stdout.txt",
          suggestedToolsLabel: "Use file_read or long_context_process for exact text or summarization.",
        },
        {
          key: "stderr-1",
          label: "stderr",
          charsLabel: "7,500 chars",
        },
      ],
    });
  });

  it("builds large-output previews from legacy materialized result notices", () => {
    const parsed = parseToolMessage(
      [
        "browser_content completed",
        "",
        "Result",
        "Title: Long page",
        "",
        "Text:",
        "page preview",
        "",
        "[truncated] page text preview is 12,000 of 24,500 chars, 25,000 bytes.",
        "Full output saved at: .ambient/tool-outputs/page.txt",
        "Use file_read for exact text, or long_context_process for summarization/querying when the output is too large for direct context.",
      ].join("\n"),
      "browser_content",
      "/workspace",
    );

    expect(parsed.resultPreview).toBe("page text · 24,500 chars · 12,000 preview · full output: .ambient/tool-outputs/page.txt");
    expect(parsed.result).toBe(["Title: Long page", "", "Text:", "page preview"].join("\n"));
    expect(parsed.result).not.toContain("[truncated]");
    expect(parsed.result).not.toContain("Full output saved");
    expect(parsed.largeOutputPreview).toMatchObject({
      items: [
        {
          label: "page text",
          chars: 24500,
          previewChars: 12000,
          artifactPath: ".ambient/tool-outputs/page.txt",
          artifactBytes: 25000,
          suggestedTools: ["file_read", "long_context_process"],
        },
      ],
    });
  });

  it("hides notice-only materialized output results after building shared rows", () => {
    const parsed = parseToolMessage(
      [
        "bash completed",
        "",
        "Command",
        "cat huge.log",
        "",
        "Result",
        "[truncated] stdout preview is 16,000 of 17,000 chars, 17,123 bytes.",
        "Full output saved at: .ambient/tool-outputs/stdout.txt",
        "Use file_read for exact text, or long_context_process for summarization/querying when the output is too large for direct context.",
      ].join("\n"),
      "bash",
      "/workspace",
    );

    expect(parsed.result).toBe("");
    expect(parsed.resultPreview).toBe("stdout · 17,000 chars · 16,000 preview · full output: .ambient/tool-outputs/stdout.txt");
    expect(parsed.largeOutputPreview?.items[0]).toMatchObject({
      label: "stdout",
      chars: 17000,
      previewChars: 16000,
      artifactPath: ".ambient/tool-outputs/stdout.txt",
    });
  });

  it("renders voice selection tool messages with concise provider and voice details", () => {
    const parsed = parseToolMessage(
      [
        "Ambient voice settings updated",
        "Provider: ElevenLabs (ambient-cli:elevenlabs:tool:elevenlabs_tts) -> Piper TTS (ambient-cli:piper:tool:piper_tts)",
        "Voice: Rachel -> Lessac",
        "Enabled: true -> true",
      ].join("\n"),
      "ambient_voice_select",
      "/workspace",
      {
        toolResultDetails: {
          previousProviderCapabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts",
          selectedProviderCapabilityId: "ambient-cli:piper:tool:piper_tts",
          selectedVoiceId: "en_US-lessac-medium",
        },
      },
    );

    expect(parsed.summary).toBe("Ambient voice settings updated");
    expect(parsed.result).toContain("Provider: ElevenLabs");
    expect(parsed.voicePreview).toMatchObject({
      action: "select",
      previousProvider: "ElevenLabs (ambient-cli:elevenlabs:tool:elevenlabs_tts)",
      provider: "Piper TTS (ambient-cli:piper:tool:piper_tts)",
      previousProviderCapabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts",
      providerCapabilityId: "ambient-cli:piper:tool:piper_tts",
      previousVoice: "Rachel",
      voice: "Lessac",
      voiceId: "en_US-lessac-medium",
    });
  });

  it("recognizes voice provider test audio artifacts from result metadata", () => {
    const parsed = parseToolMessage(
      [
        "Ambient voice provider test succeeded",
        "Provider: Piper TTS",
        "Audio: .ambient/voice/thread/test.wav",
        "MIME type: audio/wav",
        "Duration: 430 ms",
      ].join("\n"),
      "ambient_voice_test",
      "/workspace",
      {
        toolResultDetails: {
          testStatus: "succeeded",
          providerCapabilityId: "ambient-cli:piper:tool:piper_tts",
          voiceId: "en_US-lessac-medium",
          audioPath: ".ambient/voice/thread/test.wav",
          mimeType: "audio/wav",
          durationMs: 430,
        },
      },
    );

    expect(parsed.summary).toBe("Ambient voice provider test succeeded");
    expect(parsed.artifactPath).toBe(".ambient/voice/thread/test.wav");
    expect(artifactMediaKindFromPath(parsed.artifactPath!)).toBe("audio");
    expect(parsed.voicePreview).toMatchObject({
      action: "test",
      provider: "Piper TTS",
      providerCapabilityId: "ambient-cli:piper:tool:piper_tts",
      voiceId: "en_US-lessac-medium",
      audioPath: ".ambient/voice/thread/test.wav",
      mimeType: "audio/wav",
      durationMs: 430,
      testStatus: "succeeded",
    });
  });

  it("parses clone status reconcile warnings into structured voice preview fields", () => {
    const parsed = parseToolMessage(
      [
        "Ambient voice clone status",
        "Provider: Local Voice Provider (ambient-cli:local:tool:local_tts)",
        "Voice: Demo clone (clone-1)",
        "Provider status: ready",
        "Readiness: ready",
        "Ready for chat selection: false",
        "Retry status later: false",
        "Dynamic cache: missing",
        "Provider dashboard: https://example.test/voices/clone-1",
        "Provider verification: https://example.test/verify/clone-1",
        "Local artifacts: .ambient/voice-models/clone-1/model.onnx, .ambient/voice-models/clone-1/config.json",
        "Missing local artifacts: .ambient/voice-models/clone-1/config.json",
        "Cloned: true",
      ].join("\n"),
      "ambient_voice_clone_status",
      "/workspace",
      {
        toolResultDetails: {
          status: "complete",
          providerCapabilityId: "ambient-cli:local:tool:local_tts",
          voiceId: "clone-1",
          readiness: "ready",
          readyForSelection: false,
          shouldRetryStatus: false,
          cacheStatus: "missing",
          dashboardUrl: "https://example.test/voices/clone-1",
          verificationUrl: "https://example.test/verify/clone-1",
          localArtifactPaths: [".ambient/voice-models/clone-1/model.onnx", ".ambient/voice-models/clone-1/config.json"],
          missingLocalArtifactPaths: [".ambient/voice-models/clone-1/config.json"],
        },
      },
    );

    expect(parsed.summary).toBe("Ambient voice clone status");
    expect(parsed.voicePreview).toMatchObject({
      action: "clone-status",
      provider: "Local Voice Provider (ambient-cli:local:tool:local_tts)",
      voice: "Demo clone (clone-1)",
      providerCapabilityId: "ambient-cli:local:tool:local_tts",
      voiceId: "clone-1",
      readiness: "ready",
      readyForSelection: false,
      shouldRetryStatus: false,
      cacheStatus: "missing",
      dashboardUrl: "https://example.test/voices/clone-1",
      verificationUrl: "https://example.test/verify/clone-1",
      localArtifactPaths: [".ambient/voice-models/clone-1/model.onnx", ".ambient/voice-models/clone-1/config.json"],
      missingLocalArtifactPaths: [".ambient/voice-models/clone-1/config.json"],
    });
  });

  it("renders voice policy update tool messages with concise policy details", () => {
    const parsed = parseToolMessage(
      [
        "Ambient voice policy updated",
        "Enabled: true -> false",
        "Autoplay: true -> false",
        "Mode: assistant-final -> off",
        "Long reply: summarize -> skip",
        "Max chars: 1500 -> 600",
      ].join("\n"),
      "ambient_voice_policy_update",
      "/workspace",
    );

    expect(parsed.summary).toBe("Ambient voice policy updated");
    expect(parsed.voicePreview).toEqual({
      action: "policy",
      enabled: "true -> false",
      autoplay: "true -> false",
      mode: "assistant-final -> off",
      longReply: "summarize -> skip",
      maxChars: "1500 -> 600",
    });
  });

  it("renders no-op voice selection tool messages as already configured", () => {
    const parsed = parseToolMessage(
      [
        "Ambient voice settings already configured",
        "Provider: Piper TTS (ambient-cli:piper:tool:piper_tts)",
        "Voice: Amy (en_US-amy-medium)",
        "Format: wav",
        "No settings were changed and no approval was required.",
      ].join("\n"),
      "ambient_voice_select",
      "/workspace",
      {
        toolResultDetails: {
          runtime: "ambient-voice",
          toolName: "ambient_voice_select",
          status: "no-op",
          selectedProviderCapabilityId: "ambient-cli:piper:tool:piper_tts",
          selectedVoiceId: "en_US-amy-medium",
        },
      },
    );

    expect(parsed.summary).toBe("Ambient voice settings already configured");
    expect(parsed.voicePreview).toMatchObject({
      action: "select",
      status: "no-op",
      noOp: true,
      provider: "Piper TTS (ambient-cli:piper:tool:piper_tts)",
      providerCapabilityId: "ambient-cli:piper:tool:piper_tts",
      voice: "Amy (en_US-amy-medium)",
      voiceId: "en_US-amy-medium",
    });
  });

  it("renders no-op voice policy tool messages as already configured", () => {
    const parsed = parseToolMessage(
      [
        "Ambient voice policy already configured",
        "Enabled: false",
        "Autoplay: false",
        "Mode: assistant-final",
        "Long reply: summarize",
        "Max chars: 1500",
        "No settings were changed and no approval was required.",
      ].join("\n"),
      "ambient_voice_policy_update",
      "/workspace",
      {
        toolResultDetails: {
          runtime: "ambient-voice",
          toolName: "ambient_voice_policy_update",
          status: "no-op",
        },
      },
    );

    expect(parsed.summary).toBe("Ambient voice policy already configured");
    expect(parsed.voicePreview).toEqual({
      action: "policy",
      status: "no-op",
      noOp: true,
      enabled: "false",
      autoplay: "false",
      mode: "assistant-final",
      longReply: "summarize",
      maxChars: "1500",
    });
  });

  it("renders STT status tool messages with provider, language, and policy details", () => {
    const parsed = parseToolMessage(
      [
        "Ambient STT status",
        "Enabled: true",
        "Mode: push-to-talk",
        "Selected provider: Qwen3-ASR Local (ambient-cli:ambient-qwen3-asr:tool:qwen3_asr_transcribe)",
        "Spoken language: English",
        "Auto-send after transcription: true",
        "Silence before transcribe: 0.8s",
        "No-speech gate: true at -55 dBFS RMS",
        "Queue while agent runs: true",
        "Providers: 1/1 available",
      ].join("\n"),
      "ambient_stt_status",
      "/workspace",
      {
        toolResultDetails: {
          runtime: "ambient-stt",
          toolName: "ambient_stt_status",
          status: "complete",
          providerCount: 1,
          availableProviderCount: 1,
          selectedProviderCapabilityId: "ambient-cli:ambient-qwen3-asr:tool:qwen3_asr_transcribe",
        },
      },
    );

    expect(parsed.summary).toBe("Ambient STT status");
    expect(parsed.sttPreview).toMatchObject({
      action: "status",
      status: "complete",
      provider: "Qwen3-ASR Local (ambient-cli:ambient-qwen3-asr:tool:qwen3_asr_transcribe)",
      providerCapabilityId: "ambient-cli:ambient-qwen3-asr:tool:qwen3_asr_transcribe",
      language: "English",
      enabled: "true",
      autoSendAfterTranscription: "true",
      silenceFinalizeSeconds: "0.8s",
      noSpeechGate: "true at -55 dBFS RMS",
      queueWhileAgentRuns: "true",
      providerCount: 1,
      availableProviderCount: 1,
    });
  });

  it("renders STT selection and policy tool messages as concise speech input cards", () => {
    const selected = parseToolMessage(
      [
        "Ambient STT settings updated",
        "Provider: Other STT (ambient-cli:other:tool:other_stt) -> Qwen3-ASR Local (ambient-cli:ambient-qwen3-asr:tool:qwen3_asr_transcribe)",
        "Spoken language: French -> Spanish",
        "Enabled: false -> true",
      ].join("\n"),
      "ambient_stt_select",
      "/workspace",
      {
        toolResultDetails: {
          runtime: "ambient-stt",
          toolName: "ambient_stt_select",
          status: "complete",
          previousProviderCapabilityId: "ambient-cli:other:tool:other_stt",
          selectedProviderCapabilityId: "ambient-cli:ambient-qwen3-asr:tool:qwen3_asr_transcribe",
        },
      },
    );
    const policy = parseToolMessage(
      [
        "Ambient STT policy already configured",
        "Enabled: true",
        "Spoken language: Spanish",
        "Auto-send after transcription: true",
        "Silence before transcribe: 0.9s",
        "No-speech gate: true at -55 dBFS RMS",
        "No settings were changed and no approval was required.",
      ].join("\n"),
      "ambient_stt_policy_update",
      "/workspace",
      {
        toolResultDetails: {
          runtime: "ambient-stt",
          toolName: "ambient_stt_policy_update",
          status: "no-op",
        },
      },
    );

    expect(selected.sttPreview).toMatchObject({
      action: "select",
      previousProvider: "Other STT (ambient-cli:other:tool:other_stt)",
      provider: "Qwen3-ASR Local (ambient-cli:ambient-qwen3-asr:tool:qwen3_asr_transcribe)",
      previousProviderCapabilityId: "ambient-cli:other:tool:other_stt",
      providerCapabilityId: "ambient-cli:ambient-qwen3-asr:tool:qwen3_asr_transcribe",
      previousLanguage: "French",
      language: "Spanish",
      enabled: "false -> true",
    });
    expect(policy.sttPreview).toMatchObject({
      action: "policy",
      status: "no-op",
      noOp: true,
      enabled: "true",
      language: "Spanish",
      autoSendAfterTranscription: "true",
      silenceFinalizeSeconds: "0.9s",
      noSpeechGate: "true at -55 dBFS RMS",
    });
  });

  it("renders STT provider test transcript and managed artifacts without raw audio payloads", () => {
    const parsed = parseToolMessage(
      [
        "Ambient STT test succeeded",
        "Provider: Qwen3-ASR Local",
        "Status: ready",
        "Language: English",
        "Transcript: Ambient speech recognition spike.",
        "Provider elapsed: 1655 ms",
        "RMS: -31.3 dBFS",
        "No-speech threshold: -55 dBFS",
        "Normalized audio artifact: .ambient/stt/stt-tool-test/utt.wav",
        "Transcript artifact: .ambient/stt/stt-tool-test/utt.txt",
        "JSON artifact: .ambient/stt/stt-tool-test/utt.json",
        "Raw audio bytes were not returned to the agent.",
      ].join("\n"),
      "ambient_stt_test",
      "/workspace",
      {
        toolResultDetails: {
          runtime: "ambient-stt",
          toolName: "ambient_stt_test",
          status: "complete",
          testStatus: "ready",
          providerCapabilityId: "ambient-cli:ambient-qwen3-asr:tool:qwen3_asr_transcribe",
          language: "English",
          transcript: "Ambient speech recognition spike.",
          audioPath: ".ambient/stt/stt-tool-test/utt.raw.wav",
          normalizedAudioPath: ".ambient/stt/stt-tool-test/utt.wav",
          transcriptPath: ".ambient/stt/stt-tool-test/utt.txt",
          jsonPath: ".ambient/stt/stt-tool-test/utt.json",
          durationMs: 1655,
          noSpeechGate: { rmsDbfs: -31.25, thresholdDbfs: -55 },
        },
      },
    );

    expect(parsed.summary).toBe("Ambient STT test succeeded");
    expect(parsed.artifactPath).toBe(".ambient/stt/stt-tool-test/utt.raw.wav");
    expect(artifactMediaKindFromPath(parsed.artifactPath!)).toBe("audio");
    expect(parsed.sttPreview).toMatchObject({
      action: "test",
      status: "complete",
      provider: "Qwen3-ASR Local",
      providerCapabilityId: "ambient-cli:ambient-qwen3-asr:tool:qwen3_asr_transcribe",
      language: "English",
      testStatus: "ready",
      transcript: "Ambient speech recognition spike.",
      durationMs: 1655,
      rmsDbfs: -31.25,
      noSpeechThresholdDbfs: -55,
      audioPath: ".ambient/stt/stt-tool-test/utt.raw.wav",
      normalizedAudioPath: ".ambient/stt/stt-tool-test/utt.wav",
      transcriptPath: ".ambient/stt/stt-tool-test/utt.txt",
      jsonPath: ".ambient/stt/stt-tool-test/utt.json",
    });
    expect(parsed.sttPreview?.transcript).not.toContain("raw audio");
  });

  it("classifies previewable media artifact paths", () => {
    expect(artifactMediaKindFromPath("screenshots/result.PNG")).toBe("image");
    expect(artifactMediaKindFromPath("audio/out.mp3")).toBe("audio");
    expect(artifactMediaKindFromPath("video/demo.webm")).toBe("video");
    expect(artifactMediaKindFromPath("src/app.ts")).toBeUndefined();
  });

  it("describes media preview failures without rewriting generated artifacts", () => {
    expect(mediaPreviewUnavailableMessage("image")).toBe("File is not a valid image.");
    expect(mediaPreviewUnavailableMessage("audio")).toContain("Audio playback");
    expect(mediaPreviewUnavailableMessage("video")).toContain("Video playback");
  });

  it("parses Telegram session setup cards from tool metadata", () => {
    const parsed = parseToolMessage(
      [
        "Telegram session bootstrap apply",
        "Apply status: applied",
        "Needs code: yes",
      ].join("\n"),
      "ambient_messaging_telegram_session_apply",
      "/workspace",
      {
        toolResultDetails: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_telegram_session_apply",
          telegramSessionSetup: {
            kind: "telegram-session-setup",
            providerId: "telegram-tdlib",
            profileId: "owner",
            action: "start_auth",
            status: "needs_code",
            title: "Telegram login code needed",
            summary: "Profile owner is waiting for a Telegram login code.",
            detail: "Use the secure Desktop input dialog.",
            missingInputs: [],
            primaryAction: {
              id: "submit-code",
              label: "Enter code",
              title: "Continue Telegram setup",
              prompt: "Call ambient_messaging_telegram_session_apply with submit_code.",
              tone: "primary",
            },
            secondaryActions: [
              {
                id: "refresh-status",
                label: "Refresh status",
                title: "Refresh Telegram setup status",
                prompt: "Call ambient_messaging_telegram_session_apply with status.",
                tone: "secondary",
              },
            ],
            safety: {
              readsProviderMessages: false,
              sendsProviderMessages: false,
              createsBinding: false,
              enablesInboundIngestion: false,
            },
          },
        },
      },
    );

    expect(parsed.telegramSessionSetup).toMatchObject({
      providerId: "telegram-tdlib",
      profileId: "owner",
      status: "needs_code",
      primaryAction: {
        label: "Enter code",
        prompt: "Call ambient_messaging_telegram_session_apply with submit_code.",
      },
      secondaryActions: [{ label: "Refresh status" }],
      safety: {
        readsProviderMessages: false,
        sendsProviderMessages: false,
        createsBinding: false,
        enablesInboundIngestion: false,
      },
    });
  });

  it("parses messaging conversation-directory setup cards from tool metadata", () => {
    const parsed = parseToolMessage(
      [
        "Telegram conversation directory result: applied",
        "Fetched conversations: 1",
        "Returned conversations: 1",
        "Provider raw details can remain text-only.",
      ].join("\n"),
      "ambient_messaging_telegram_conversation_directory_apply",
      "/workspace",
      {
        toolResultDetails: {
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
    );

    expect(parsed.messagingConversationDirectorySetup).toMatchObject({
      providerId: "telegram-tdlib",
      providerLabel: "Telegram",
      status: "applied",
      adapterStatus: "available",
      adapterKind: "live-metadata-only-adapter",
      metadataOnlyContractKind: "metadata-only-routing",
      returnedConversationCount: 1,
      safety: {
        runsProviderCli: false,
        inspectsProviderDesktop: false,
        readsProviderMessages: false,
        readsProviderHistory: false,
      },
      conversations: [
        {
          conversationId: "telegram-chat-1",
          title: "Ops",
          unreadCount: 2,
        },
      ],
    });
  });

  it("parses Remote Ambient Surface activation cards from tool metadata", () => {
    const parsed = parseToolMessage(
      [
        "Remote Ambient Surface activation plan",
        "Status: route_ready",
        "Recommended next tool: ambient_messaging_telegram_owner_loop_activation_plan",
      ].join("\n"),
      "ambient_messaging_remote_surface_activation_plan",
      "/workspace",
      {
        toolResultDetails: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_remote_surface_activation_plan",
          messagingRemoteSurfaceActivation: {
            kind: "messaging-remote-surface-activation",
            intent: "remote_ambient_surface",
            providerId: "telegram-tdlib",
            providerLabel: "Telegram",
            status: "route_ready",
            title: "Remote Ambient Surface activation",
            summary: "Route ready for Telegram.",
            detail: "Product shortcut selected Telegram and delegated to the provider activation plan.",
            ambientSurface: "projects",
            currentPhase: {
              id: "product-provider-route",
              title: "Choose reviewed provider activation route",
              status: "complete",
              approvalRequired: false,
              nextTool: "ambient_messaging_telegram_owner_loop_activation_plan",
              blockerCount: 0,
            },
            phaseChips: [
              {
                id: "product-provider-route",
                title: "Choose reviewed provider activation route",
                status: "complete",
                approvalRequired: false,
                nextTool: "ambient_messaging_telegram_owner_loop_activation_plan",
                blockerCount: 0,
              },
              {
                id: "metadata-directory",
                title: "Read metadata-only conversation directory",
                status: "ready",
                approvalRequired: true,
                nextTool: "ambient_messaging_telegram_conversation_directory_preview",
                blockerCount: 0,
              },
            ],
            recommendedNextTool: "ambient_messaging_telegram_owner_loop_activation_plan",
            delegatedRecommendedNextTool: "ambient_messaging_telegram_conversation_directory_preview",
            activationPlanFirstTool: "ambient_messaging_telegram_owner_loop_activation_plan",
            repairPrompt: "Run the Telegram owner-loop activation plan next.",
            repairPrompts: ["Run the Telegram owner-loop activation plan next."],
            blockedUntilActivationPlan: ["ambient_messaging_gateway_lifecycle_preview"],
            previewSendSafety: {
              commandPreviewTool: "ambient_messaging_remote_surface_command_preview",
              replyPreviewTool: "ambient_messaging_remote_surface_reply_preview",
              providerSendApplyTool: "ambient_messaging_remote_surface_reply_apply",
              previewRequiredBeforeProviderSend: true,
              providerSendRequiresSeparateApproval: true,
              providerSendReady: false,
            },
            safety: {
              startsBridge: false,
              listsProviderChats: false,
              readsProviderMessages: false,
              readsProviderHistory: false,
              mutatesBindings: false,
              startsPolling: false,
              sendsProviderMessages: false,
            },
          },
        },
      },
    );

    expect(parsed.messagingRemoteSurfaceActivation).toMatchObject({
      providerId: "telegram-tdlib",
      providerLabel: "Telegram",
      status: "route_ready",
      recommendedNextTool: "ambient_messaging_telegram_owner_loop_activation_plan",
      delegatedRecommendedNextTool: "ambient_messaging_telegram_conversation_directory_preview",
      activationPlanFirstTool: "ambient_messaging_telegram_owner_loop_activation_plan",
      currentPhase: {
        id: "product-provider-route",
        status: "complete",
        nextTool: "ambient_messaging_telegram_owner_loop_activation_plan",
      },
      phaseChips: [
        { id: "product-provider-route", status: "complete" },
        { id: "metadata-directory", status: "ready" },
      ],
      previewSendSafety: {
        previewRequiredBeforeProviderSend: true,
        providerSendRequiresSeparateApproval: true,
        providerSendReady: false,
      },
      safety: {
        startsBridge: false,
        readsProviderMessages: false,
        sendsProviderMessages: false,
      },
    });
    const view = toolMessagingRemoteSurfaceActivationCardViewModel(parsed.messagingRemoteSurfaceActivation!);
    expect(view.actions).toHaveLength(2);
    expect(view.actions[0]).toMatchObject({
      id: "continue",
      label: "Continue",
      tone: "primary",
    });
    expect(view.actions[0].prompt).toContain("calling ambient_messaging_telegram_owner_loop_activation_plan");
    expect(view.actions[0].prompt).toContain("preview tools before apply tools");
    expect(view.actions[1]).toMatchObject({
      id: "repair",
      label: "Repair",
      tone: "secondary",
    });
    expect(view.actions[1].prompt).toContain("Run the Telegram owner-loop activation plan next.");
  });

  it("builds compact Remote Ambient Surface activation card view data", () => {
    const parsed = parseToolMessage(
      "Remote Ambient Surface activation plan",
      "ambient_messaging_remote_surface_activation_plan",
      "/workspace",
      {
        toolResultDetails: {
          messagingRemoteSurfaceActivation: {
            kind: "messaging-remote-surface-activation",
            intent: "remote_ambient_surface",
            requestedProvider: "Signal",
            status: "unsupported_provider",
            title: "Remote Ambient Surface activation",
            summary: "No reviewed Remote Ambient Surface route exists for Signal yet.",
            detail: "Choose Telegram or implement a reviewed provider activation route.",
            ambientSurface: "projects",
            currentPhase: {
              id: "product-provider-route",
              title: "Choose reviewed provider activation route",
              status: "blocked",
              approvalRequired: false,
              blockerCount: 1,
            },
            phaseChips: [
              {
                id: "product-provider-route",
                title: "Choose reviewed provider activation route",
                status: "blocked",
                approvalRequired: false,
                blockerCount: 1,
              },
            ],
            repairPrompts: [
              "Ask the user to choose Telegram for Remote Ambient Surface activation, or implement a reviewed Signal activation route before using Signal low-level tools.",
              "Do not fall back to generic Messaging Connector setup for Remote Ambient Surface.",
              "Keep provider sends behind preview/apply approval.",
              "This fourth prompt should stay out of the compact card.",
            ],
            blockedUntilActivationPlan: [
              "ambient_messaging_signal_conversation_directory_preview",
              "ambient_messaging_gateway_lifecycle_apply",
            ],
            previewSendSafety: {
              commandPreviewTool: "ambient_messaging_remote_surface_command_preview",
              replyPreviewTool: "ambient_messaging_remote_surface_reply_preview",
              providerSendApplyTool: "ambient_messaging_remote_surface_reply_apply",
              previewRequiredBeforeProviderSend: true,
              providerSendRequiresSeparateApproval: true,
              providerSendReady: false,
            },
            safety: {
              startsBridge: false,
              listsProviderChats: false,
              readsProviderMessages: false,
              readsProviderHistory: false,
              mutatesBindings: false,
              startsPolling: false,
              sendsProviderMessages: false,
            },
          },
        },
      },
    );

    const view = toolMessagingRemoteSurfaceActivationCardViewModel(parsed.messagingRemoteSurfaceActivation!);
    expect(view).toMatchObject({
      tone: "danger",
      icon: "attention",
      title: "Remote Ambient Surface activation",
      summary: "No reviewed Remote Ambient Surface route exists for Signal yet.",
      detail: "Choose Telegram or implement a reviewed provider activation route.",
    });
    expect(view.rows).toEqual(expect.arrayContaining([
      { label: "Surface", value: "projects" },
      { label: "State", value: "Unsupported provider" },
      { label: "Blocked tools", value: "2 until activation plan" },
      { label: "Provider send", value: "separate approval required" },
    ]));
    expect(view.phaseChips).toEqual([
      {
        label: "Route: Blocked",
        title: "Choose reviewed provider activation route",
        tone: "danger",
      },
    ]);
    expect(view.notes).toHaveLength(3);
    expect(view.notes.join("\n")).not.toContain("fourth prompt");
    expect(view.actions).toHaveLength(2);
    expect(view.actions[0]).toMatchObject({
      id: "repair",
      label: "Use repair",
      tone: "secondary",
    });
    expect(view.actions[0].prompt).toContain("Ask the user to choose Telegram");
    expect(view.actions[0].prompt).toContain("do not use provider desktop UI, shell, browser automation, or provider CLIs as fallback");
    expect(view.actions[1]).toMatchObject({
      id: "provider-onboarding",
      label: "Plan provider support",
      tone: "secondary",
    });
    expect(view.actions[1].prompt).toContain("Plan future reviewed Remote Ambient Surface provider support for Signal by calling ambient_messaging_remote_surface_provider_support_plan first");
    expect(view.actions[1].prompt).toContain("Pass provider exactly as Signal and ambientSurface exactly as projects");
    expect(view.actions[1].prompt).toContain("provider onboarding/planning, not active Remote Ambient Surface activation");
    expect(view.actions[1].prompt).toContain("ask for approval before implementing");
    expect(view.actions[1].prompt).toContain("Do not call provider-specific low-level tools");
    expect(view.actions[1].prompt).toContain("provider message reads");
    expect(view.actions[1].prompt).toContain("provider sends");
    expect(view.safetyChips).toEqual([
      "No bridge start",
      "No message reads",
      "No history",
      "No sends",
      "No polling start",
      "Preview before send",
    ]);
  });

  it("builds compact directory card view data for dense conversation results", () => {
    const parsed = parseToolMessage(
      "Telegram conversation directory result: applied",
      "ambient_messaging_telegram_conversation_directory_apply",
      "/workspace",
      {
        toolResultDetails: {
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
            fetchedConversationCount: 12,
            returnedConversationCount: 12,
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
            conversations: Array.from({ length: 12 }, (_, index) => ({
              conversationId: `telegram-chat-${index + 1}`,
              title: `Conversation ${index + 1}`,
              type: "group",
              unreadCount: index === 0 ? 4 : 0,
              folderIds: [0],
            })),
          },
        },
      },
    );

    const view = toolMessagingConversationDirectorySetupCardViewModel(parsed.messagingConversationDirectorySetup!);
    expect(view).toMatchObject({
      tone: "success",
      icon: "success",
      title: "Telegram conversation directory",
      summary: "12 metadata row(s) available.",
      noteKind: "next-step",
    });
    expect(view.rows).toEqual(expect.arrayContaining([
      { label: "Counts", value: "12/12 returned" },
      { label: "Approval", value: "recorded" },
    ]));
    expect(view.conversationChips).toHaveLength(9);
    expect(view.conversationChips[0]).toEqual({ label: "Conversation 1 (4)", title: "telegram-chat-1" });
    expect(view.conversationChips.at(-1)).toEqual({
      label: "4 more",
      title: "4 additional conversation metadata row(s) omitted from this compact card",
    });
    expect(view.safetyChips).toEqual([
      "No message reads",
      "No history",
      "No sends",
      "No provider CLI",
      "No desktop scrape",
      "No bindings",
    ]);
  });

  it("prioritizes blocked directory card notes and caps long guidance for narrow renderers", () => {
    const card = {
      kind: "messaging-conversation-directory-setup" as const,
      providerId: "signal-cli",
      providerLabel: "Signal",
      status: "blocked" as const,
      directoryStatus: "blocked",
      adapterStatus: "blocked" as const,
      adapterKind: "blocked-contract-skeleton" as const,
      previewToolName: "ambient_messaging_signal_conversation_directory_preview",
      applyToolName: "ambient_messaging_signal_conversation_directory_apply",
      requiresApprovalForApply: false,
      approvalRecorded: false,
      canApplyWithReadiness: false,
      canApplyNow: false,
      metadataOnlyContractKind: "metadata-only-routing" as const,
      fetchedConversationCount: 0,
      returnedConversationCount: 0,
      failureMode: "signal-directory-adapter-not-implemented",
      failureHint: "Implement and validate the reviewed Signal local-bridge adapter before reading a Signal conversation directory.",
      blockers: [
        "Signal provider directory adapter is a blocked skeleton; no reviewed Signal local bridge is installed or enabled.",
        "Signal directory apply must remain unavailable until safe readiness, session metadata, metadata-only directory, binding lifecycle, inbound normalization, and reply support are implemented.",
        "Signal Desktop availability is not a supported provider readiness signal.",
        "This fourth blocker should stay out of the compact card and remain in the full text output.",
      ],
      warnings: ["Do not inspect Signal Desktop storage."],
      nextSteps: ["Implement a reviewed bridge."],
      safety: {
        startsBridge: false,
        runsProviderCli: false,
        inspectsProviderDesktop: false,
        readsProviderMessages: false,
        readsProviderHistory: false,
        sendsProviderMessages: false,
        mutatesBindings: false,
      } as const,
      conversations: [],
    };

    const view = toolMessagingConversationDirectorySetupCardViewModel(card);
    expect(view.tone).toBe("danger");
    expect(view.icon).toBe("attention");
    expect(view.noteKind).toBe("blocker");
    expect(view.detail).toBe("Implement and validate the reviewed Signal local-bridge adapter before reading a Signal conversation directory.");
    expect(view.notes).toEqual(card.blockers.slice(0, 3));
    expect(view.notes.join("\n")).not.toContain("fourth blocker");
    expect(view.conversationChips).toEqual([]);
    expect(view.rows).toEqual(expect.arrayContaining([
      { label: "Adapter", value: "blocked / blocked-contract-skeleton" },
      { label: "Approval", value: "not required" },
      { label: "Failure", value: "signal-directory-adapter-not-implemented" },
    ]));
  });
});

function toolMessage(toolName: string, content: string): ChatMessage {
  return {
    id: `${toolName}-message`,
    threadId: "thread",
    role: "tool",
    content,
    createdAt: "2026-05-01T00:00:00.000Z",
    metadata: { toolName, status: "done" },
  };
}
