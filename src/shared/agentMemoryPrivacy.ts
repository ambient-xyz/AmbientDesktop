export const AGENT_MEMORY_PRIVACY_DISCLOSURE_LINES = [
  "Experimental TencentDB Agent Memory stores memories in workspace-local storage under this workspace's Ambient state directory.",
  "Inspect, edit, and delete requests operate on Tencent-backed memory records; generic diagnostics and exports omit raw memory content.",
  "Clear memory removes the local TencentDB memory store for this workspace and resets active sessions; it does not edit existing chat transcripts or workspace files.",
] as const;

export const AGENT_MEMORY_PRIVACY_DISCLOSURE = AGENT_MEMORY_PRIVACY_DISCLOSURE_LINES.join(" ");

export const CLEAR_AGENT_MEMORY_CONFIRMATION =
  "Clear TencentDB Agent Memory for this workspace?\n\nThis removes locally stored experimental memory, resets active sessions, and leaves existing chat transcripts and workspace files unchanged.";

export function agentMemoryPrivacyLanguageReviewed(text = AGENT_MEMORY_PRIVACY_DISCLOSURE): boolean {
  const normalized = text.toLowerCase();
  return normalized.includes("workspace-local") &&
    normalized.includes("inspect") &&
    normalized.includes("edit") &&
    normalized.includes("delete") &&
    normalized.includes("tencent-backed memory records") &&
    normalized.includes("diagnostics and exports omit raw memory content") &&
    normalized.includes("clear memory removes") &&
    normalized.includes("existing chat transcripts") &&
    normalized.includes("workspace files");
}
