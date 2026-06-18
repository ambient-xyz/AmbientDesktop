import type { ChatMessage } from "../../shared/threadTypes";
import type { WorkspaceSearchResult, WorkspaceSearchScope } from "../../shared/workspaceTypes";
import { parseMetadata } from "./projectStoreJson";
import { formatThreadPreview } from "../../shared/threadPreview";

export interface MessageRow {
  id: string;
  thread_id: string;
  role: ChatMessage["role"];
  content: string;
  created_at: string;
  metadata_json: string | null;
}

export interface SearchMessageRow {
  id: string;
  thread_id: string;
  role: ChatMessage["role"];
  content: string;
  created_at: string;
  thread_title: string;
}

export function mapMessageRow(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
    metadata: row.metadata_json ? parseMetadata(row.metadata_json) : undefined,
  };
}

export function mapWorkspaceSearchMessageRow(
  row: SearchMessageRow,
  input: { workspacePath: string; projectName: string; scope: Exclude<WorkspaceSearchScope, "all-projects"> },
): WorkspaceSearchResult {
  return {
    id: `message:${row.id}`,
    kind: "message",
    threadId: row.thread_id,
    workspacePath: input.workspacePath,
    projectName: input.projectName,
    title: row.thread_title,
    excerpt: formatThreadPreview(row.content),
    createdAt: row.created_at,
    role: row.role,
    scope: input.scope,
  };
}
