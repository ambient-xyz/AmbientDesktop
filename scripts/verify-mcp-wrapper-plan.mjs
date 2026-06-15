#!/usr/bin/env node
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const expectedPhaseCount = 10;

export function verifyMcpWrapperPlan(input = {}) {
  const planPath = input.planPath ?? join(process.cwd(), "mcpWrapperPlan.html");
  if (!existsAsFile(planPath)) throw new Error(`MCP wrapper plan is missing: ${planPath}`);

  const html = readFileSync(planPath, "utf8");
  const phases = extractPhases(html);
  const phaseNumbers = phases.map((phase) => phase.number);

  if (phases.length !== expectedPhaseCount) {
    throw new Error(`Expected ${expectedPhaseCount} MCP wrapper phases, found ${phases.length}: ${phaseNumbers.join(", ")}`);
  }

  for (let number = 0; number < expectedPhaseCount; number += 1) {
    if (!phaseNumbers.includes(number)) throw new Error(`MCP wrapper plan is missing Phase ${number}.`);
  }

  const missingStatus = phases.filter((phase) => !/\bStatus:\s*<\/strong>/i.test(phase.body));
  if (missingStatus.length) {
    throw new Error(`MCP wrapper phases missing status text: ${missingStatus.map((phase) => `Phase ${phase.number}`).join(", ")}`);
  }

  const nonImplementedStatuses = phases
    .filter((phase) => !/\bimplemented\b/i.test(firstStatusText(phase.body)))
    .map((phase) => `Phase ${phase.number}`);
  if (nonImplementedStatuses.length) {
    throw new Error(`MCP wrapper phases are not marked implemented: ${nonImplementedStatuses.join(", ")}`);
  }

  if (/\bNext slice\s*:/i.test(html)) {
    throw new Error("MCP wrapper plan still contains stale 'Next slice:' language.");
  }

  if (!/No product-blocking open questions remain/i.test(html)) {
    throw new Error("MCP wrapper plan must state that no product-blocking open questions remain.");
  }

  const requiredTools = [
    "ambient_mcp_autowire_plan",
    "ambient_mcp_autowire_review",
    "ambient_mcp_server_search",
    "ambient_mcp_server_describe",
    "ambient_mcp_server_install",
    "ambient_mcp_standard_import_describe",
    "ambient_mcp_standard_import_install",
    "ambient_mcp_remote_proxy_describe",
    "ambient_mcp_remote_proxy_install",
    "ambient_mcp_guided_bridge_describe",
    "ambient_mcp_guided_bridge_preflight",
    "ambient_mcp_guided_bridge_register",
    "ambient_mcp_tool_search",
    "ambient_mcp_tool_describe",
    "ambient_mcp_tool_call",
    "ambient_mcp_tool_policy_update",
    "ambient_mcp_aggregation_status",
  ];
  const missingTools = requiredTools.filter((tool) => !html.includes(tool));
  if (missingTools.length) {
    throw new Error(`MCP wrapper plan is missing required tool references: ${missingTools.join(", ")}`);
  }

  return {
    planPath,
    phaseCount: phases.length,
    phases: phases.map(({ number, title }) => ({ number, title })),
    requiredTools,
  };
}

function extractPhases(html) {
  const phases = [];
  const regex = /<div class="phase">\s*<div class="phase-title">Phase\s+(\d+)\s+-\s+([^<]+)<\/div>\s*<div class="phase-body">([\s\S]*?)<\/div>\s*<\/div>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    phases.push({
      number: Number(match[1]),
      title: decodeHtml(match[2] ?? "").trim(),
      body: match[3] ?? "",
    });
  }
  return phases;
}

function firstStatusText(body) {
  const match = body.match(/<p><strong>Status:\s*<\/strong>([\s\S]*?)<\/p>/i);
  return stripTags(match?.[1] ?? "");
}

function stripTags(value) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function valueArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function existsAsFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const planPath = valueArg("--plan") ?? join(process.cwd(), "mcpWrapperPlan.html");
  const result = verifyMcpWrapperPlan({ planPath });
  console.log(`Verified MCP wrapper plan closure: ${result.phaseCount} implemented phase(s), ${result.requiredTools.length} required tool reference(s).`);
}
