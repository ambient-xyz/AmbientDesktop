import { findSecretReference, saveSecretReference } from "../security/secretReferenceStore";
import type { McpAutowireCandidate } from "./mcpAutowireFacade";

export interface McpSecretBindingRef {
  envName: string;
  secretRef: string;
}

export interface SaveMcpServerEnvSecretInput {
  serverId?: string;
  candidateId?: string;
  candidateRef?: string;
  envName: string;
  value: string;
}

export interface SaveMcpServerEnvSecretResult {
  ownerId: string;
  serverId?: string;
  candidateId?: string;
  candidateRef?: string;
  envName: string;
  secretRef: string;
  configured: true;
}

export async function saveMcpServerEnvSecret(
  workspacePath: string,
  input: SaveMcpServerEnvSecretInput,
): Promise<SaveMcpServerEnvSecretResult> {
  const ownerId = mcpSecretOwnerId(input);
  const envName = normalizeMcpEnvName(input.envName);
  const secretRef = await saveSecretReference({
    scope: "mcp-server",
    workspacePath,
    ownerId,
    envName,
    value: input.value,
  });
  return {
    ownerId,
    ...(input.serverId ? { serverId: input.serverId } : {}),
    ...(input.candidateId ? { candidateId: input.candidateId } : {}),
    ...(input.candidateRef ? { candidateRef: input.candidateRef } : {}),
    envName,
    secretRef,
    configured: true,
  };
}

export async function storedMcpSecretBindingsForCandidate(
  workspacePath: string,
  candidate: McpAutowireCandidate,
  explicitBindings: McpSecretBindingRef[] = [],
): Promise<McpSecretBindingRef[]> {
  const bindings = dedupeBindings(explicitBindings);
  const boundNames = new Set(bindings.map((binding) => binding.envName));
  const ownerIds = mcpSecretOwnerIdsForCandidate(candidate);
  for (const secret of candidate.secrets) {
    if (boundNames.has(secret.name)) continue;
    const secretRef = await firstStoredMcpSecretReference(workspacePath, ownerIds, secret.name);
    if (!secretRef) continue;
    bindings.push({ envName: secret.name, secretRef });
    boundNames.add(secret.name);
  }
  return bindings;
}

export async function storedMcpSecretBindingsForServer(
  workspacePath: string,
  serverId: string,
  candidate: McpAutowireCandidate,
  explicitBindings: McpSecretBindingRef[] = [],
): Promise<McpSecretBindingRef[]> {
  const bindings = dedupeBindings(explicitBindings);
  const boundNames = new Set(bindings.map((binding) => binding.envName));
  const ownerIds = uniqueStrings([serverId, ...mcpSecretOwnerIdsForCandidate(candidate)]);
  for (const secret of candidate.secrets) {
    if (boundNames.has(secret.name)) continue;
    const secretRef = await firstStoredMcpSecretReference(workspacePath, ownerIds, secret.name);
    if (!secretRef) continue;
    bindings.push({ envName: secret.name, secretRef });
    boundNames.add(secret.name);
  }
  return bindings;
}

export function mcpSecretOwnerIdsForCandidate(candidate: McpAutowireCandidate): string[] {
  return uniqueStrings([
    candidate.id,
    candidate.source.registryId,
    candidate.source.packageName,
    candidate.runtime.package?.identifier,
  ]);
}

function mcpSecretOwnerId(input: Pick<SaveMcpServerEnvSecretInput, "serverId" | "candidateId" | "candidateRef">): string {
  const ownerId = input.serverId?.trim() || input.candidateId?.trim() || input.candidateRef?.trim();
  if (!ownerId) throw new Error("MCP secret request requires serverId, candidateId, or candidateRef.");
  return ownerId;
}

async function firstStoredMcpSecretReference(
  workspacePath: string,
  ownerIds: string[],
  envName: string,
): Promise<string | undefined> {
  for (const ownerId of ownerIds) {
    const secretRef = await findSecretReference({
      scope: "mcp-server",
      workspacePath,
      ownerId,
      envName,
    });
    if (secretRef) return secretRef;
  }
  return undefined;
}

function dedupeBindings(bindings: McpSecretBindingRef[]): McpSecretBindingRef[] {
  const seen = new Set<string>();
  const result: McpSecretBindingRef[] = [];
  for (const binding of bindings) {
    const envName = normalizeMcpEnvName(binding.envName);
    const key = `${envName}\0${binding.secretRef}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ envName, secretRef: binding.secretRef });
  }
  return result;
}

function normalizeMcpEnvName(value: string): string {
  const envName = value.trim();
  if (!/^[A-Z_][A-Z0-9_]*$/.test(envName)) throw new Error(`Invalid MCP env name: ${value}`);
  return envName;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}
