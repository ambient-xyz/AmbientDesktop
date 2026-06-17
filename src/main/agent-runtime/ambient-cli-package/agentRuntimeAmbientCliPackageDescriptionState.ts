export class AmbientCliPackageDescriptionState {
  private readonly describedByThread = new Map<string, Set<string>>();

  clear(): void {
    this.describedByThread.clear();
  }

  markDescribed(threadId: string, packageId: string, packageName: string): void {
    const keys = this.describedByThread.get(threadId) ?? new Set<string>();
    keys.add(ambientCliPackageDescriptionKey(packageId));
    keys.add(ambientCliPackageDescriptionKey(packageName));
    this.describedByThread.set(threadId, keys);
  }

  isDescribed(threadId: string, packageId: string, packageName: string): boolean {
    const keys = this.describedByThread.get(threadId);
    return Boolean(
      keys?.has(ambientCliPackageDescriptionKey(packageId)) ||
        keys?.has(ambientCliPackageDescriptionKey(packageName)),
    );
  }
}

export function ambientCliPackageDescriptionKey(value: string): string {
  return value.trim().toLowerCase();
}
