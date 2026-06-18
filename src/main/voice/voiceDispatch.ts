import { normalizeAmbientModelId } from "../../shared/ambientModels";
import type { MessageVoiceState, VoiceSettings } from "../../shared/localRuntimeTypes";
import type { ChatMessage } from "../../shared/threadTypes";
import { normalizeAmbientBaseUrl } from "../provider/providerStatus";
import { prepareVoiceTextForMessage, type VoiceTextDecision } from "./voiceText";

interface AmbientChatCompletionResponse {
  choices?: Array<{
    delta?: {
      content?: string;
    };
    message?: {
      content?: string;
    };
    text?: string;
  }>;
}

export interface VoiceDispatchStore {
  setMessageVoiceState(input: Omit<MessageVoiceState, "createdAt" | "updatedAt">): MessageVoiceState;
}

export interface VoiceSummaryRequestInput {
  sourceText: string;
  maxChars: number;
  model: string;
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export function recordVoiceDispatchForMessage(input: {
  message: ChatMessage;
  settings: VoiceSettings;
  store: VoiceDispatchStore;
}): { decision: VoiceTextDecision; state: MessageVoiceState } {
  const decision = prepareVoiceTextForMessage(input.message, input.settings);
  const stateInput = voiceStateInputFromDecision(input.message, input.settings, decision);
  return {
    decision,
    state: input.store.setMessageVoiceState(stateInput),
  };
}

export async function requestVoiceSummary(input: VoiceSummaryRequestInput): Promise<string> {
  const response = await (input.fetchImpl ?? fetch)(`${normalizeAmbientBaseUrl(input.baseUrl)}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream, application/json",
    },
    body: JSON.stringify(voiceSummaryRequestBody(input)),
    signal: input.signal,
  });
  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, " ").trim();
    throw new Error(
      detail
        ? `Ambient voice summary failed (${response.status}): ${detail.slice(0, 240)}`
        : `Ambient voice summary failed (${response.status}).`,
    );
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream")) {
    return clampVoiceSummary(sanitizeVoiceSummary(voiceSummaryTextFromEventStream(await response.text())), input.maxChars);
  }
  const payload = (await response.json()) as AmbientChatCompletionResponse;
  return clampVoiceSummary(sanitizeVoiceSummary(payload.choices?.[0]?.message?.content ?? payload.choices?.[0]?.text ?? ""), input.maxChars);
}

export function voiceSummaryRequestBody(
  input: Pick<VoiceSummaryRequestInput, "sourceText" | "maxChars" | "model">,
): Record<string, unknown> {
  return {
    model: normalizeAmbientModelId(input.model),
    messages: [
      {
        role: "system",
        content: [
          "Create a concise spoken summary of the assistant reply.",
          "Do not include markdown, code, URLs, bullets, or commentary about summarizing.",
          "Return only the exact text that should be spoken aloud.",
        ].join(" "),
      },
      {
        role: "user",
        content: [`Maximum spoken characters: ${input.maxChars}`, "Assistant reply:", input.sourceText].join("\n\n"),
      },
    ],
    temperature: 0.1,
    max_tokens: Math.min(1200, Math.max(120, Math.ceil(input.maxChars / 2))),
    stream: true,
    reasoning: { effort: "none", enabled: false, exclude: true },
  };
}

function voiceStateInputFromDecision(
  message: ChatMessage,
  settings: VoiceSettings,
  decision: VoiceTextDecision,
): Omit<MessageVoiceState, "createdAt" | "updatedAt"> {
  if (decision.kind === "speak") {
    return {
      messageId: message.id,
      threadId: message.threadId,
      status: "queued",
      source: "assistant-text",
      sourceMessageId: decision.sourceMessageId,
      providerCapabilityId: settings.providerCapabilityId,
      voiceId: settings.voiceId,
      spokenText: decision.spokenText,
      spokenTextChars: decision.spokenTextChars,
      sourceTextChars: decision.sourceTextChars,
    };
  }
  if (decision.kind === "summarize") {
    return {
      messageId: message.id,
      threadId: message.threadId,
      status: "queued",
      source: "summary",
      sourceMessageId: decision.sourceMessageId,
      providerCapabilityId: settings.providerCapabilityId,
      voiceId: settings.voiceId,
      spokenTextChars: 0,
      sourceTextChars: decision.sourceTextChars,
    };
  }
  return {
    messageId: message.id,
    threadId: message.threadId,
    status: "skipped",
    source: "assistant-text",
    sourceMessageId: decision.sourceMessageId,
    providerCapabilityId: settings.providerCapabilityId,
    voiceId: settings.voiceId,
    spokenTextChars: decision.spokenTextChars,
    sourceTextChars: decision.sourceTextChars,
    error: decision.reason,
  };
}

function sanitizeVoiceSummary(value: string): string {
  return value.replace(/```[\s\S]*?```/g, " ").replace(/\s+/g, " ").trim();
}

function clampVoiceSummary(value: string, maxChars: number): string {
  const chars = [...value];
  if (chars.length <= maxChars) return value;
  const clipped = chars.slice(0, Math.max(0, maxChars)).join("").replace(/\s+\S*$/, "").trim();
  return clipped || chars.slice(0, Math.max(0, maxChars)).join("").trim();
}

function voiceSummaryTextFromEventStream(streamText: string): string {
  let text = "";
  for (const line of streamText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const data = trimmed.slice("data:".length).trim();
    if (!data || data === "[DONE]") continue;
    try {
      const payload = JSON.parse(data) as AmbientChatCompletionResponse;
      text += payload.choices?.[0]?.delta?.content ?? payload.choices?.[0]?.message?.content ?? payload.choices?.[0]?.text ?? "";
    } catch {
      text += data;
    }
  }
  return text;
}
