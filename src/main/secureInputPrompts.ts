import { randomUUID } from "node:crypto";
import type { BrowserWindow } from "electron";
import type {
  SecureInputKind,
  SecureInputPromptResolution,
  SecureInputPromptResponseInput,
  SecureInputRequest,
} from "../shared/types";

export interface SecureInputPromptRequestInput {
  threadId?: string;
  workspacePath?: string;
  requestId?: string;
  title: string;
  message: string;
  detail: string;
  inputLabel: string;
  inputKind: SecureInputKind;
  inputMode: "text" | "password";
  providerId?: string;
  profileId?: string;
}

type PendingSecureInput = {
  request: SecureInputRequest;
  finish: (response: SecureInputPromptResolution) => void;
  timer: NodeJS.Timeout;
};

const SECURE_INPUT_TIMEOUT_MS = 10 * 60 * 1000;

export class SecureInputPromptService {
  private readonly pending = new Map<string, PendingSecureInput>();

  constructor(
    private readonly getWindow: () => BrowserWindow | undefined,
    private readonly timeoutMs = SECURE_INPUT_TIMEOUT_MS,
  ) {}

  request(input: SecureInputPromptRequestInput): Promise<SecureInputPromptResolution> {
    const window = this.getWindow();
    if (!window || window.isDestroyed()) return Promise.resolve({ allowed: false });

    const id = randomUUID();
    const now = new Date();
    const request: SecureInputRequest = {
      id,
      requestId: input.requestId ?? id,
      ...(input.threadId ? { threadId: input.threadId } : {}),
      ...(input.workspacePath ? { workspacePath: input.workspacePath } : {}),
      title: input.title,
      message: input.message,
      detail: input.detail,
      inputLabel: input.inputLabel,
      inputKind: input.inputKind,
      inputMode: input.inputMode,
      ...(input.providerId ? { providerId: input.providerId } : {}),
      ...(input.profileId ? { profileId: input.profileId } : {}),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.timeoutMs).toISOString(),
    };

    return new Promise((resolve) => {
      const finish = (response: SecureInputPromptResolution) => {
        const pending = this.pending.get(id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(id);
        if (!window.isDestroyed()) {
          window.webContents.send("desktop:event", {
            type: "secure-input-resolved",
            id,
            ...(pending.request.workspacePath ? { workspacePath: pending.request.workspacePath } : {}),
          });
        }
        resolve(response.allowed && response.value ? { allowed: true, value: response.value } : { allowed: false });
      };
      const timer = setTimeout(() => finish({ allowed: false }), this.timeoutMs);
      this.pending.set(id, { request, finish, timer });
      window.webContents.send("desktop:event", {
        type: "secure-input-request",
        request,
        ...(request.workspacePath ? { workspacePath: request.workspacePath } : {}),
      });
    });
  }

  respond(input: SecureInputPromptResponseInput): void {
    const value = typeof input.value === "string" ? input.value : "";
    this.pending.get(input.id)?.finish(input.canceled || !value ? { allowed: false } : { allowed: true, value });
  }

  denyAll(): void {
    for (const id of [...this.pending.keys()]) {
      this.respond({ id, canceled: true });
    }
  }
}
