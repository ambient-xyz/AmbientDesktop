import type { DesktopEvent } from "../../shared/desktopTypes";
import type { ModelRuntimeSettings, ThreadSummary } from "../../shared/threadTypes";
import { ambientRetryPolicyFromSettings } from "./agentRuntimeAmbientFacade";
import { generateThreadTitle } from "./agentRuntimeThreadFacade";

type ThreadTitleUpdatedEvent = Extract<DesktopEvent, { type: "thread-updated" }>;

export interface AgentRuntimeThreadTitleGenerationOptions {
  thread: ThreadSummary;
  prompt: string;
  workspaceName: string;
  modelRuntimeSettings: ModelRuntimeSettings;
  getThread: (threadId: string) => ThreadSummary;
  updateThreadTitle: (threadId: string, title: string) => ThreadSummary;
  emit: (event: ThreadTitleUpdatedEvent) => void;
  generateTitle?: typeof generateThreadTitle;
  warn?: (message: string) => void;
}

export function generateAgentRuntimeThreadTitleIfNeeded({
  thread,
  prompt,
  workspaceName,
  modelRuntimeSettings,
  getThread,
  updateThreadTitle,
  emit,
  generateTitle = generateThreadTitle,
  warn = console.warn,
}: AgentRuntimeThreadTitleGenerationOptions): void {
  if (thread.title !== "New chat") return;
  void generateTitle({
    prompt,
    workspaceName,
    model: thread.model,
    retryPolicy: modelRuntimeSettings.aggressiveRetries
      ? ambientRetryPolicyFromSettings({ modelRuntime: modelRuntimeSettings })
      : undefined,
  })
    .then((title) => {
      if (!title) {
        warn("Ambient thread title generation returned no title.");
        return;
      }
      const current = getThread(thread.id);
      if (current.title !== "New chat") return;
      const updated = updateThreadTitle(thread.id, title);
      emit({ type: "thread-updated", thread: updated });
    })
    .catch((error) => {
      warn(`Ambient thread title generation failed: ${error instanceof Error ? error.message : String(error)}`);
    });
}
