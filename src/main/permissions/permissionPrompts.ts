import { randomUUID } from "node:crypto";
import type { BrowserWindow } from "electron";
import type { PermissionPromptResolution, PermissionPromptResponseMode, PermissionRequest } from "../../shared/types";

type PendingPermission = {
  threadId: string;
  request: PermissionRequest;
  finish: (response: PermissionPromptResponseMode) => void;
  timer: NodeJS.Timeout;
};

const PERMISSION_TIMEOUT_MS = 10 * 60 * 1000;

export interface PermissionPromptRequestOptions {
  onRequest?: (request: PermissionRequest) => void;
}

function permissionRequestWorkspacePath(request: PermissionRequest): string | undefined {
  return request.projectPath ?? request.workspacePath;
}

export class PermissionPromptService {
  private readonly pending = new Map<string, PendingPermission>();

  constructor(
    private readonly getWindow: () => BrowserWindow | undefined,
    private readonly timeoutMs = PERMISSION_TIMEOUT_MS,
  ) {}

  request(input: Omit<PermissionRequest, "id">, options: PermissionPromptRequestOptions = {}): Promise<PermissionPromptResolution> {
    const window = this.getWindow();
    if (!window || window.isDestroyed()) return Promise.resolve({ allowed: false, mode: "deny" });

    const id = randomUUID();
    const request: PermissionRequest = { id, ...input };

    return new Promise((resolve) => {
      const finish = (response: PermissionPromptResponseMode) => {
        const pending = this.pending.get(id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(id);
        const workspacePath = permissionRequestWorkspacePath(pending.request);
        if (!window.isDestroyed()) {
          window.webContents.send("desktop:event", { type: "permission-resolved", id, ...(workspacePath ? { workspacePath } : {}) });
        }
        resolve({ allowed: response !== "deny", mode: response });
      };
      const timer = setTimeout(() => finish("deny"), this.timeoutMs);
      this.pending.set(id, { threadId: input.threadId, request, finish, timer });
      const workspacePath = permissionRequestWorkspacePath(request);
      try {
        options.onRequest?.({ ...request });
      } catch (error) {
        console.warn("[permissions] Permission request observer failed.", error);
      }
      window.webContents.send("desktop:event", { type: "permission-request", request, ...(workspacePath ? { workspacePath } : {}) });
    });
  }

  respond(id: string, response: PermissionPromptResponseMode | boolean): void {
    this.pending.get(id)?.finish(typeof response === "boolean" ? (response ? "allow_once" : "deny") : response);
  }

  listPending(): PermissionRequest[] {
    return [...this.pending.values()].map((pending) => ({ ...pending.request }));
  }

  denyAll(): void {
    for (const id of [...this.pending.keys()]) {
      this.respond(id, false);
    }
  }

  denyThread(threadId: string): void {
    for (const [id, request] of [...this.pending.entries()]) {
      if (request.threadId === threadId) this.respond(id, false);
    }
  }
}
