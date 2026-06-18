import { createHash } from "node:crypto";
import { resolve } from "node:path";

import { isPathInside } from "./piSessionFacade";

export interface PiContextFile {
  path: string;
  content: string;
}

export function workspaceBoundedAgentContextFiles(input: {
  contextFiles: readonly PiContextFile[];
  workspacePath: string;
  agentDir: string;
}): PiContextFile[] {
  const workspaceRoot = resolve(input.workspacePath);
  const agentRoot = resolve(input.agentDir);
  const seenContent = new Set<string>();
  const files: PiContextFile[] = [];

  for (const file of input.contextFiles) {
    const filePath = resolve(file.path);
    if (!isPathInside(workspaceRoot, filePath) && !isPathInside(agentRoot, filePath)) continue;

    const contentKey = normalizedContentHash(file.content);
    if (seenContent.has(contentKey)) continue;
    seenContent.add(contentKey);
    files.push(file);
  }

  return files;
}

function normalizedContentHash(content: string): string {
  return createHash("sha256").update(content.replace(/\r\n?/g, "\n").trim()).digest("hex");
}
