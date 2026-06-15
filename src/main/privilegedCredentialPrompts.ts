import { randomUUID } from "node:crypto";
import type { BrowserWindow } from "electron";
import type {
  PrivilegedActionNativeRequest,
  PrivilegedCredentialPromptResolution,
  PrivilegedCredentialPromptResponseInput,
  PrivilegedCredentialRequest,
} from "../shared/types";

type PendingPrivilegedCredential = {
  request: PrivilegedCredentialRequest;
  finish: (response: PrivilegedCredentialPromptResolution) => void;
  timer: NodeJS.Timeout;
};

const PRIVILEGED_CREDENTIAL_TIMEOUT_MS = 10 * 60 * 1000;

export class PrivilegedCredentialPromptService {
  private readonly pending = new Map<string, PendingPrivilegedCredential>();

  constructor(
    private readonly getWindow: () => BrowserWindow | undefined,
    private readonly timeoutMs = PRIVILEGED_CREDENTIAL_TIMEOUT_MS,
  ) {}

  request(input: PrivilegedActionNativeRequest): Promise<PrivilegedCredentialPromptResolution> {
    const window = this.getWindow();
    if (!window || window.isDestroyed()) return Promise.resolve({ allowed: false });

    const id = randomUUID();
    const now = new Date();
    const request: PrivilegedCredentialRequest = {
      id,
      requestId: input.requestId,
      ...(input.threadId ? { threadId: input.threadId } : {}),
      ...(input.workspacePath ? { workspacePath: input.workspacePath } : {}),
      title: input.uiPrompt.title,
      message: "Enter your admin password in Ambient. The value is ephemeral and is never sent to Pi, saved, logged, or included in tool results.",
      detail: input.uiPrompt.detail,
      purpose: input.template.purpose,
      ...(input.template.packageName ? { packageName: input.template.packageName } : {}),
      credentialLabel: "Admin password",
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.timeoutMs).toISOString(),
    };

    return new Promise((resolve) => {
      const finish = (response: PrivilegedCredentialPromptResolution) => {
        const pending = this.pending.get(id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(id);
        if (!window.isDestroyed()) {
          window.webContents.send("desktop:event", {
            type: "privileged-credential-resolved",
            id,
            ...(pending.request.workspacePath ? { workspacePath: pending.request.workspacePath } : {}),
          });
        }
        resolve(response.allowed && response.credential ? { allowed: true, credential: response.credential } : { allowed: false });
      };
      const timer = setTimeout(() => finish({ allowed: false }), this.timeoutMs);
      this.pending.set(id, { request, finish, timer });
      window.webContents.send("desktop:event", {
        type: "privileged-credential-request",
        request,
        ...(request.workspacePath ? { workspacePath: request.workspacePath } : {}),
      });
    });
  }

  respond(input: PrivilegedCredentialPromptResponseInput): void {
    const credential = typeof input.credential === "string" ? input.credential : "";
    this.pending.get(input.id)?.finish(input.canceled || !credential ? { allowed: false } : { allowed: true, credential });
  }

  denyAll(): void {
    for (const id of [...this.pending.keys()]) {
      this.respond({ id, canceled: true });
    }
  }
}
