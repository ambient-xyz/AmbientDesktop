export const WORKSPACE_MEDIA_SCHEME = "ambient-media";

export interface WorkspaceMediaUrlInput {
  workspacePath: string;
  absolutePath: string;
  relativePath: string;
  realPath?: string;
  mimeType?: string;
  size: number;
  mtimeMs?: number;
  allowExternal?: boolean;
}
