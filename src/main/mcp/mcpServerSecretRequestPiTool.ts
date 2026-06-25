import { parseMcpAutowireCandidate, validateMcpAutowireCandidate } from "./mcpAutowireFacade";
import { piToolFieldsFromDescriptor, pluginInstallToolDescriptor } from "./mcpDesktopToolsFacade";
import {
  candidateOrRefInput,
  objectInput,
  optionalString,
  requiredString,
  toolResult,
  type McpServerPiToolDefinition,
} from "./mcpServerPiToolSupport";
import type { McpServerPiToolOptions } from "./mcpServerPiToolTypes";

export function createMcpServerSecretRequestPiToolDefinition(options: McpServerPiToolOptions): McpServerPiToolDefinition {
  const mcpSecretRequest = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_secret_request"));
  return {
    ...mcpSecretRequest,
    parameters: mcpSecretRequest.parameters as McpServerPiToolDefinition["parameters"],
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const input = objectInput(params);
      const serverId = optionalString(input.serverId);
      const candidateRef = optionalString(input.candidateRef);
      const envName = requiredString(input, "envName");
      const expectedCandidateHash = optionalString(input.expectedCandidateHash);
      const candidate = serverId
        ? (await options.catalog.previewRegistryInstall({ serverId, secretBindings: [] })).candidate
        : parseMcpAutowireCandidate((await candidateOrRefInput(options, input)).candidate);
      const validation = validateMcpAutowireCandidate(candidate);
      if (expectedCandidateHash && validation.candidateHash && expectedCandidateHash !== validation.candidateHash) {
        throw new Error(
          `Candidate hash mismatch: expected ${expectedCandidateHash}, got ${validation.candidateHash}. Re-run autowire plan or review before requesting the secret.`,
        );
      }
      const requirement = candidate.secrets.find((secret) => secret.name === envName);
      if (!requirement) {
        const target = serverId ?? candidate.id;
        throw new Error(`MCP server "${target}" does not declare env requirement "${envName}".`);
      }
      if (!options.requestMcpSecret) throw new Error("MCP secret request is unavailable in this runtime.");
      options.requestMcpSecret({
        ...(serverId ? { serverId } : {}),
        candidateId: candidate.id,
        ...(candidateRef ? { candidateRef } : {}),
        displayName: candidate.displayName,
        envName: requirement.name,
      });
      return toolResult(
        [
          "MCP secret dialog requested",
          serverId ? `Server: ${serverId}` : `Candidate: ${candidate.displayName}`,
          `Candidate id: ${candidate.id}`,
          candidateRef ? `Candidate ref: ${candidateRef}` : undefined,
          `Env name: ${requirement.name}`,
          "Secret value: never exposed to Pi",
          "Next: after the user saves the secret, retry the MCP describe or install tool. Ambient will attach the saved secret ref automatically.",
        ]
          .filter(Boolean)
          .join("\n"),
        {
          runtime: "ambient-mcp",
          toolName: "ambient_mcp_secret_request",
          status: "requested",
          ...(serverId ? { serverId } : {}),
          candidateId: candidate.id,
          ...(candidateRef ? { candidateRef } : {}),
          envName: requirement.name,
        },
      );
    },
  };
}
