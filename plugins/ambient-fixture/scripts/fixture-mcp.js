#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const tools = [
  {
    name: "ambient_fixture_workspace_summary",
    description: "Returns a compact summary of the current Ambient fixture workspace.",
    inputSchema: {
      type: "object",
      properties: {
        includeFiles: {
          type: "boolean",
          description: "Whether a caller wants file names included in the summary.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "ambient_fixture_markdown_echo",
    description: "Accepts a markdown payload and returns compact metadata about it.",
    inputSchema: {
      type: "object",
      properties: {
        markdown: {
          type: "string",
          description: "Markdown payload to inspect.",
        },
        outputLines: {
          type: "integer",
          description: "Optional number of deterministic text lines to include in the tool result for large-output display tests.",
          minimum: 0,
          maximum: 25000,
        },
      },
      required: ["markdown"],
      additionalProperties: false,
    },
  },
];

let buffer = "";

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  while (true) {
    const newline = buffer.indexOf("\n");
    if (newline === -1) return;
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (line) handleMessage(line);
  }
});

function handleMessage(line) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }

  if (!message || typeof message !== "object" || !message.method) return;
  if (message.method === "notifications/initialized") return;

  if (message.method === "initialize") {
    respond(message.id, {
      protocolVersion: message.params?.protocolVersion ?? "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "ambient-fixture", version: "0.1.0" },
    });
    return;
  }

  if (message.method === "tools/list") {
    respond(message.id, { tools });
    return;
  }

  if (message.method === "tools/call") {
    const toolName = message.params?.name;
    if (toolName === "ambient_fixture_markdown_echo") {
      const markdown = String(message.params?.arguments?.markdown ?? "");
      const outputLines = Math.max(0, Math.min(Number(message.params?.arguments?.outputLines ?? 0) || 0, 25000));
      const generatedOutput = Array.from({ length: outputLines }, (_, index) =>
        `pluginOutputLine ${String(index + 1).padStart(4, "0")}: ${"fixture plugin large output ".repeat(4)}`,
      ).join("\n");
      respond(message.id, {
        content: [
          {
            type: "text",
            text: [
              "Ambient fixture markdown echo",
              `markdownLength: ${markdown.length}`,
              `markdownPrefix: ${markdown.slice(0, 32)}`,
              `outputLines: ${outputLines}`,
              generatedOutput ? `Generated output:\n${generatedOutput}` : "",
            ].filter(Boolean).join("\n"),
          },
        ],
        structuredContent: { markdownLength: markdown.length, outputLines },
      });
      return;
    }

    if (toolName !== "ambient_fixture_workspace_summary") {
      respondError(message.id, -32602, `Unknown tool: ${toolName}`);
      return;
    }

    const includeFiles = Boolean(message.params?.arguments?.includeFiles);
    const cwd = process.cwd();
    const files = includeFiles
      ? fs
          .readdirSync(cwd, { withFileTypes: true })
          .slice(0, 12)
          .map((entry) => `${entry.isDirectory() ? "dir" : "file"}:${entry.name}`)
      : [];
    const lines = [
      "Ambient fixture MCP summary",
      `cwd: ${cwd}`,
      `pluginRootName: ${path.basename(cwd)}`,
      `includeFiles: ${includeFiles}`,
      ...(files.length > 0 ? [`files: ${files.join(", ")}`] : []),
    ];

    respond(message.id, {
      content: [{ type: "text", text: lines.join("\n") }],
      structuredContent: { cwd, includeFiles, files },
    });
    return;
  }

  respondError(message.id, -32601, `Unknown method: ${message.method}`);
}

function respond(id, result) {
  if (id === undefined) return;
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}

function respondError(id, code, message) {
  if (id === undefined) return;
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } })}\n`);
}
