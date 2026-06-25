import { createHash } from "node:crypto";

export function getStringField(input: unknown, key: string): string | undefined {
  if (!input || typeof input !== "object" || !(key in input)) return undefined;
  const value = (input as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

export function getBooleanField(input: unknown, key: string): boolean | undefined {
  if (!input || typeof input !== "object" || !(key in input)) return undefined;
  const value = (input as Record<string, unknown>)[key];
  return typeof value === "boolean" ? value : undefined;
}

export function permissionGrantHash(actionKind: string, targetKind: string, identity: string): string {
  return createHash("sha256").update(`${actionKind}\0${targetKind}\0${identity}`).digest("hex");
}
