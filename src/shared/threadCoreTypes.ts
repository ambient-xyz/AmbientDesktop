export type MessageRole = "user" | "assistant" | "system" | "tool";

export interface ThreadActionInput {
  threadId: string;
  projectId?: string;
}
