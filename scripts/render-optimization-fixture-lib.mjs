export const RENDER_OPTIMIZATION_SCHEMA_VERSION = "ambient-render-optimization-v1";

export const HEAVY_RENDER_FIXTURE = Object.freeze({
  threadTitle: "Render optimization heavy transcript",
  messagePairs: 90,
  assistantLinksPerMessage: 16,
  toolResultLinesPerTool: 52,
  expectedMessageCount: 270,
});

export const RENDER_OPTIMIZATION_BUDGETS = Object.freeze({
  maxMountedDomNodes: 2_000,
  maxInlineLinkButtons: 250,
  maxIdleCdpP95Ms: 250,
});

export const RENDER_OPTIMIZATION_BASELINE_EXPECTATIONS = Object.freeze({
  minMountedDomNodes: 4_000,
  minInlineLinkButtons: 900,
  minRenderedMessageRows: 250,
});

export function buildRenderOptimizationFixtureMessages(input = {}) {
  const threadId = input.threadId ?? "render-optimization-thread";
  const nowMs = Date.parse(input.startedAt ?? "2026-06-22T00:00:00.000Z");
  const messages = [];
  for (let index = 0; index < HEAVY_RENDER_FIXTURE.messagePairs; index += 1) {
    messages.push({
      id: `render-heavy-user-${index}`,
      threadId,
      role: "user",
      content: `Audit render hotspot batch ${index}. Check the links and artifacts without opening anything.`,
      createdAt: new Date(nowMs + messages.length * 1_000).toISOString(),
    });
    messages.push({
      id: `render-heavy-assistant-${index}`,
      threadId,
      role: "assistant",
      content: assistantFixtureContent(index),
      createdAt: new Date(nowMs + messages.length * 1_000).toISOString(),
    });
    messages.push({
      id: `render-heavy-tool-${index}`,
      threadId,
      role: "tool",
      content: toolFixtureContent(index),
      createdAt: new Date(nowMs + messages.length * 1_000).toISOString(),
      metadata: {
        toolName: index % 2 === 0 ? "bash" : "web_research",
        status: "done",
        largeOutputPreview: {
          kind: "large-output",
          summary: `render batch ${index} stdout · 92,000 chars · 12,000 preview · full output: .ambient/tool-output/render-heavy-${index}.txt`,
          items: [
            {
              label: `render batch ${index} stdout`,
              chars: 92_000,
              previewChars: 12_000,
              truncated: true,
              artifactKind: "stdout",
              artifactPath: `.ambient/tool-output/render-heavy-${index}.txt`,
              artifactBytes: 98_304,
              suggestedTools: ["file_read", "long_context_process"],
            },
          ],
        },
      },
    });
  }
  return messages;
}

export function fixtureStaticHotspotEstimate(messages) {
  const text = messages.map((message) => message.content).join("\n");
  return {
    messageCount: messages.length,
    assistantMessageCount: messages.filter((message) => message.role === "assistant").length,
    toolMessageCount: messages.filter((message) => message.role === "tool").length,
    urlLikeTokenCount: countMatches(text, /\bhttps?:\/\/[^\s<>"')]+/g),
    artifactLikeTokenCount: countMatches(text, /(?:^|[\s`(])(?:\.ambient|reports|artifacts|logs)\/[^\s<>"')]+/g),
    totalContentChars: text.length,
  };
}

export function evaluateRenderOptimizationGate(metrics, options = {}) {
  const requireBudget = options.requireBudget === true;
  const failures = [];
  if (!metrics || typeof metrics !== "object") {
    return { status: "failed", failures: ["Missing render metrics."] };
  }
  if (metrics.messageCount !== HEAVY_RENDER_FIXTURE.expectedMessageCount) {
    failures.push(`Expected ${HEAVY_RENDER_FIXTURE.expectedMessageCount} fixture messages, got ${metrics.messageCount}.`);
  }
  if (metrics.visibleMessageRows < 1) failures.push("No visible message rows were detected.");
  if (metrics.cdpLatencyP95Ms > 2_000) failures.push(`CDP responsiveness is unusable: p95 ${metrics.cdpLatencyP95Ms}ms.`);

  if (requireBudget) {
    if (metrics.mountedDomNodes > RENDER_OPTIMIZATION_BUDGETS.maxMountedDomNodes) {
      failures.push(`Mounted DOM nodes ${metrics.mountedDomNodes} exceeds budget ${RENDER_OPTIMIZATION_BUDGETS.maxMountedDomNodes}.`);
    }
    if (metrics.inlineLinkButtons > RENDER_OPTIMIZATION_BUDGETS.maxInlineLinkButtons) {
      failures.push(`Inline link buttons ${metrics.inlineLinkButtons} exceeds budget ${RENDER_OPTIMIZATION_BUDGETS.maxInlineLinkButtons}.`);
    }
    if (metrics.cdpLatencyP95Ms > RENDER_OPTIMIZATION_BUDGETS.maxIdleCdpP95Ms) {
      failures.push(`Idle CDP p95 ${metrics.cdpLatencyP95Ms}ms exceeds budget ${RENDER_OPTIMIZATION_BUDGETS.maxIdleCdpP95Ms}ms.`);
    }
  }

  return {
    status: failures.length ? "failed" : "passed",
    failures,
    budgets: RENDER_OPTIMIZATION_BUDGETS,
    baselineExpectations: RENDER_OPTIMIZATION_BASELINE_EXPECTATIONS,
  };
}

function assistantFixtureContent(index) {
  const links = [];
  for (let linkIndex = 0; linkIndex < HEAVY_RENDER_FIXTURE.assistantLinksPerMessage; linkIndex += 1) {
    links.push(`[source ${index}.${linkIndex}](https://example.test/render/${index}/${linkIndex}?trace=heavy-${index}-${linkIndex})`);
    links.push("`reports/render-" + index + "-" + linkIndex + ".html`");
  }
  return [
    `### Render batch ${index}`,
    "",
    "The transcript intentionally contains dense links, local artifacts, and repeated text so renderer hot paths are visible.",
    "",
    links.join(" · "),
    "",
    "| Metric | Value | Artifact |",
    "| --- | ---: | --- |",
    `| URLs | ${HEAVY_RENDER_FIXTURE.assistantLinksPerMessage} | \`artifacts/url-report-${index}.md\` |`,
    `| Local paths | ${HEAVY_RENDER_FIXTURE.assistantLinksPerMessage} | \`logs/render-${index}.txt\` |`,
  ].join("\n");
}

function toolFixtureContent(index) {
  const resultLines = [];
  for (let line = 0; line < HEAVY_RENDER_FIXTURE.toolResultLinesPerTool; line += 1) {
    resultLines.push(
      [
        `row=${index}.${line}`,
        `url=https://example.test/tool/${index}/${line}`,
        `artifact=.ambient/tool-output/render-heavy-${index}-${line}.txt`,
        `local=/tmp/ambient-render-heavy/${index}/${line}/trace.log`,
      ].join(" | "),
    );
  }
  return [
    "Input",
    JSON.stringify({ command: `render-heavy-${index}`, cwd: "/tmp/ambient-render-heavy" }),
    "",
    "Result",
    `[truncated] render batch ${index} stdout preview is 12,000 of 92,000 chars, 98,304 bytes.`,
    `Full output saved at: .ambient/tool-output/render-heavy-${index}.txt`,
    "Use file_read for exact text, or long_context_process for summarization/querying when the output is too large for direct context.",
    "",
    ...resultLines,
  ].join("\n");
}

function countMatches(value, pattern) {
  return [...value.matchAll(pattern)].length;
}
