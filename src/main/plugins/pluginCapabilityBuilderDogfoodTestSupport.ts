import { expect } from "vitest";

import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import type { AgentRuntime } from "./pluginsAgentRuntimeDogfoodFacade";
import type { ProjectStore } from "./pluginsProjectStoreFacade";

export async function sendDogfoodTurn(
  runtime: AgentRuntime,
  store: ProjectStore,
  threadId: string,
  input: {
    content: string | string[];
    expected: string;
    mode?: "agent" | "planner";
  },
): Promise<string> {
  await runtime.send({
    threadId,
    permissionMode: "workspace",
    collaborationMode: input.mode ?? "agent",
    model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
    thinkingLevel: "minimal",
    content: Array.isArray(input.content) ? input.content.join("\n") : input.content,
  });
  const transcript = store
    .listMessages(threadId)
    .map((message) => message.content)
    .join("\n");
  expect(transcript).toContain(input.expected);
  return transcript;
}
