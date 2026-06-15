import { randomUUID } from "node:crypto";

export interface TerminalStartToken {
  threadId: string;
  workspacePath: string;
  token: string;
  expiresAt: number;
}

export class TerminalStartTokenStore {
  private readonly tokens = new Map<string, TerminalStartToken>();

  constructor(
    private readonly ttlMs = 5_000,
    private readonly now = () => Date.now(),
  ) {}

  issue(input: { threadId: string; workspacePath: string }): TerminalStartToken {
    this.pruneExpired();
    const record = {
      threadId: input.threadId,
      workspacePath: input.workspacePath,
      token: randomUUID(),
      expiresAt: this.now() + this.ttlMs,
    };
    this.tokens.set(record.token, record);
    return record;
  }

  consume(input: { threadId: string; token: string }): TerminalStartToken {
    const record = this.tokens.get(input.token);
    this.tokens.delete(input.token);
    if (!record) throw new Error("Terminal start token is invalid or already used.");
    if (record.threadId !== input.threadId) throw new Error("Terminal start token is not bound to this thread.");
    if (record.expiresAt < this.now()) throw new Error("Terminal start token expired.");
    return record;
  }

  private pruneExpired(): void {
    const now = this.now();
    for (const [token, record] of this.tokens) {
      if (record.expiresAt < now) this.tokens.delete(token);
    }
  }
}
