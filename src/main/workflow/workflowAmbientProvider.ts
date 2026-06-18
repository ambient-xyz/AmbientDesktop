import { normalizeAmbientModelId } from "../../shared/ambientModels";
import { readAmbientApiKey } from "./workflowSecurityFacade";
import { normalizeAmbientBaseUrl } from "../provider/providerStatus";
import type { AmbientRetryPolicy } from "./workflowAmbientFacade";
import { callWorkflowPiText, type WorkflowPiProgress } from "./workflowPiTransport";
import { workflowAmbientCallPromptParts, type WorkflowAmbientProvider } from "./workflowAmbientClient";
import { parseCompilerJson } from "./workflowWorkflowCompilerServiceFacade";

interface AmbientChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
    text?: string;
  }>;
}

export class AmbientWorkflowRunProvider implements WorkflowAmbientProvider {
  constructor(
    private readonly input: {
      model: string;
      apiKey?: string;
      baseUrl?: string;
      fetchImpl?: typeof fetch;
      textCall?: typeof callWorkflowPiText;
      workflowThreadId?: string;
      timeoutMs?: number;
      idleTimeoutMs?: number;
      absoluteTimeoutMs?: number;
      enforceAbsoluteTimeout?: boolean;
      retryPolicy?: AmbientRetryPolicy;
      onProgress?: (progress: WorkflowPiProgress) => void;
    },
  ) {}

  async call(input: Parameters<WorkflowAmbientProvider["call"]>[0]): Promise<unknown> {
    const apiKey = (this.input.apiKey ?? readAmbientApiKey() ?? "").trim();
    if (!apiKey) throw new Error("Ambient API key is not configured.");
    const promptParts = workflowAmbientCallPromptParts(input);
    if (!this.input.fetchImpl) {
      const textCall = this.input.textCall ?? callWorkflowPiText;
      const onProgress = (progress: WorkflowPiProgress) => {
        this.input.onProgress?.(progress);
        input.onProgress?.(progress);
      };
      const content = await textCall({
        apiKey,
        baseUrl: this.input.baseUrl,
        model: this.input.model,
        systemPrompt:
          "You are Ambient running inside a deterministic workflow program. Return only one JSON object. If the structured input includes outputContract or expectedOutput, return exactly that shape with the named top-level fields. Top-level property names must match exactly, with no extra spaces, aliases, or tokenizer artifacts. Treat the structured input as the source of truth; preserve concrete names, paths, counts, skipped metadata, and partial-coverage facts when relevant. Do not invent generic examples or facts when concrete evidence is present. No markdown, prose, or tool calls.",
        prompt: promptParts.prompt,
        sessionId: input.cacheCheckpoint?.workflowThreadId ?? this.input.workflowThreadId,
        temperature: 0.1,
        maxTokens: 8_000,
        reasoning: "low",
        responseFormat: { type: "json_object" },
        timeoutMs: this.input.timeoutMs,
        idleTimeoutMs: this.input.idleTimeoutMs,
        absoluteTimeoutMs: this.input.absoluteTimeoutMs,
        enforceAbsoluteTimeout: this.input.enforceAbsoluteTimeout,
        retryPolicy: this.input.retryPolicy,
        signal: input.abortSignal,
        onProgress,
      });
      return parseCompilerJson(content);
    }

    const response = await this.input.fetchImpl(`${normalizeAmbientBaseUrl(this.input.baseUrl)}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model: normalizeAmbientModelId(this.input.model),
        messages: [
          {
            role: "system",
            content:
              "You are Ambient running inside a deterministic workflow program. Return only one JSON object. If the structured input includes outputContract or expectedOutput, return exactly that shape with the named top-level fields. Top-level property names must match exactly, with no extra spaces, aliases, or tokenizer artifacts. No markdown, prose, or tool calls.",
          },
          {
            role: "user",
            content: promptParts.prompt,
          },
        ],
        temperature: 0.1,
        max_tokens: 8_000,
        response_format: { type: "json_object" },
        stream: false,
      }),
      signal: input.abortSignal,
    });
    if (!response.ok) {
      const detail = (await response.text()).replace(/\s+/g, " ").trim();
      throw new Error(
        detail
          ? `Ambient workflow call failed (${response.status}): ${detail.slice(0, 240)}`
          : `Ambient workflow call failed (${response.status}).`,
      );
    }
    const payload = (await response.json()) as AmbientChatCompletionResponse;
    return parseCompilerJson(payload.choices?.[0]?.message?.content ?? payload.choices?.[0]?.text ?? "");
  }
}
