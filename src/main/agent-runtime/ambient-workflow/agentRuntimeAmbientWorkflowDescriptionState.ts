export class AmbientWorkflowDescriptionState {
  private readonly describedByThread = new Map<string, Set<string>>();

  clear(): void {
    this.describedByThread.clear();
  }

  markDescribed(threadId: string, id: string, version: number): void {
    const keys = this.describedByThread.get(threadId) ?? new Set<string>();
    keys.add(ambientWorkflowDescriptionKey(id, version));
    this.describedByThread.set(threadId, keys);
  }

  isDescribed(threadId: string, id: string, version: number): boolean {
    return Boolean(this.describedByThread.get(threadId)?.has(ambientWorkflowDescriptionKey(id, version)));
  }
}

export function ambientWorkflowDescriptionKey(id: string, version: number): string {
  return `${id.trim().toLowerCase()}@${version}`;
}
