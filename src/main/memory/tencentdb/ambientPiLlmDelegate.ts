import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Model } from "@mariozechner/pi-ai";
import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
} from "@mariozechner/pi-coding-agent";

import type { AmbientTencentMemoryLlmDelegate, AmbientTencentMemoryLlmRequest } from "./ambientLlmRunner";
import { createAmbientProviderExtension } from "./memoryAmbientFacade";
import { enableAtomicPiSessionPersistence, normalizePiEvent } from "./memoryPiFacade";

export interface CreateAmbientTencentMemoryPiLlmDelegateInput {
  workspacePath: string;
  statePath: string;
  threadId: string;
  model: Model<"openai-completions">;
  apiKey?: string;
  timeoutMs?: number;
}

const DEFAULT_MEMORY_LLM_TIMEOUT_MS = 120_000;

export function createAmbientTencentMemoryPiLlmDelegate(
  input: CreateAmbientTencentMemoryPiLlmDelegateInput,
): AmbientTencentMemoryLlmDelegate {
  return async (request) => runTencentMemoryPiLlmRequest(input, request);
}

async function runTencentMemoryPiLlmRequest(
  input: CreateAmbientTencentMemoryPiLlmDelegateInput,
  request: AmbientTencentMemoryLlmRequest,
): Promise<string> {
  const root = join(input.statePath, "pi-memory", input.threadId);
  const agentDir = join(root, "agent");
  const sessionDir = join(root, "sessions", safePathPart(request.taskId || "memory"));
  mkdirSync(agentDir, { recursive: true });
  mkdirSync(sessionDir, { recursive: true });

  const settingsManager = SettingsManager.create(input.workspacePath, agentDir);
  const authStorage = AuthStorage.create(join(agentDir, "auth.json"));
  if (input.apiKey) authStorage.setRuntimeApiKey("ambient", input.apiKey);

  const resourceLoader = new DefaultResourceLoader({
    cwd: request.workspaceDir || input.workspacePath,
    agentDir,
    settingsManager,
    extensionFactories: [createAmbientProviderExtension(input.model)],
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  await resourceLoader.reload();

  const { session } = await createAgentSession({
    cwd: request.workspaceDir || input.workspacePath,
    agentDir,
    authStorage,
    model: input.model,
    resourceLoader,
    sessionManager: enableAtomicPiSessionPersistence(SessionManager.create(request.workspaceDir || input.workspacePath, sessionDir)),
    settingsManager,
    thinkingLevel: "minimal",
    customTools: [],
    activeTools: [],
    includeAllExtensionTools: false,
  });
  session.agent.toolExecution = "sequential";
  await session.bindExtensions({});

  let assistantText = "";
  const unsubscribe = session.subscribe((event: unknown) => {
    const normalized = normalizePiEvent(event);
    if (normalized.kind === "assistant-update") {
      if (normalized.delta) assistantText += normalized.delta;
      if (!assistantText && normalized.finalText) assistantText = normalized.finalText;
      return;
    }
    if (normalized.kind === "assistant-end" && !assistantText && normalized.finalText) {
      assistantText = normalized.finalText;
      return;
    }
    if (normalized.kind === "agent-end" && !assistantText && normalized.finalTexts.length) {
      assistantText = normalized.finalTexts.join("\n\n");
    }
  });

  const timeoutMs = request.timeoutMs ?? input.timeoutMs ?? DEFAULT_MEMORY_LLM_TIMEOUT_MS;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      session.prompt(formatMemoryLlmPrompt(request), {
        streamingBehavior: session.isStreaming ? "steer" : undefined,
        source: { type: "user" },
      } as never),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          try {
            session.agent.abort();
          } catch {
            // Ignore abort cleanup errors; the timeout error is the user-facing failure.
          }
          reject(new Error(`TencentDB memory Pi LLM request timed out after ${timeoutMs}ms.`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
    unsubscribe();
    session.dispose();
  }

  const trimmed = assistantText.trim();
  if (!trimmed) throw new Error("TencentDB memory Pi LLM request returned no assistant text.");
  return trimmed;
}

function formatMemoryLlmPrompt(request: AmbientTencentMemoryLlmRequest): string {
  return [
    "You are running a narrow helper request for TencentDB Agent Memory inside Ambient Desktop.",
    "Return only the requested answer. Do not call tools.",
    request.systemPrompt
      ? `<system_instructions>\n${request.systemPrompt.trim()}\n</system_instructions>`
      : undefined,
    `<task_prompt>\n${request.prompt.trim()}\n</task_prompt>`,
  ].filter(Boolean).join("\n\n");
}

function safePathPart(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120) || "memory";
}
