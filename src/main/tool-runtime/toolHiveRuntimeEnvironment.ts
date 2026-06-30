import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { ambientRuntimeEnv } from "./toolRuntimeSetupFacade";
import { readSecretReference } from "./toolRuntimeSecurityFacade";
import { safeFileSegment, sha256Hex } from "./toolHiveRuntimeStateStore";
import { looksToolHiveSecretLike } from "./toolHiveRuntimeStringGuards";
import type {
  ToolHivePlainEnvVar,
  ToolHiveSecretBindingState,
  ToolHiveSecretDerivedBindingKind,
} from "./toolHiveRuntimeTypes";

export interface ToolHiveRuntimeEnvironmentOwnerOptions {
  env(): NodeJS.ProcessEnv;
  stateRoot(): string;
}

export class ToolHiveRuntimeEnvironmentOwner {
  constructor(private readonly options: ToolHiveRuntimeEnvironmentOwnerOptions) {}

  async containerRuntimeEnv(): Promise<NodeJS.ProcessEnv> {
    const dockerConfig = await this.ensureAmbientDockerConfig();
    return ambientRuntimeEnv(this.options.env(), {
      TOOLHIVE_NO_TELEMETRY: "1",
      DOCKER_CONFIG: dockerConfig,
    });
  }

  async prepareSecretRuntimeDelivery(
    workloadName: string,
    secretBindings: ToolHiveSecretBindingState[],
    allowedKinds: ToolHiveSecretDerivedBindingKind[],
    plainEnvVars: ToolHivePlainEnvVar[] = [],
  ): Promise<{ args: string[]; cleanupPaths: string[] }> {
    const derivedBindings = secretBindings.flatMap((binding) => (binding.derivedBindings ?? []).map((derived) => ({ binding, derived })));
    if (!derivedBindings.length && !plainEnvVars.length) return { args: [], cleanupPaths: [] };

    const envEntries: Array<{ name: string; value: string }> = [];
    const bearerTokenEntries: Array<{ name: string; value: string }> = [];
    for (const entry of plainEnvVars) {
      assertSafeEnvName(entry.name);
      assertSafePlainEnvDeliveryValue(entry.value);
      envEntries.push({ name: entry.name, value: entry.value });
    }
    for (const { binding, derived } of derivedBindings) {
      if (binding.envName !== derived.envName || binding.secretRef !== derived.secretRef) {
        throw new Error(`Secret binding ${binding.envName} has inconsistent derived runtime binding metadata.`);
      }
      if (!allowedKinds.includes(derived.kind)) {
        throw new Error(`Secret binding ${binding.envName} uses unsupported runtime delivery ${derived.kind} for this ToolHive run path.`);
      }
      const secretValue = await readSecretReference(derived.secretRef);
      if (secretValue === undefined) throw new Error(`Ambient secret reference for ${derived.envName} was not found.`);
      assertSafeSecretDeliveryValue(secretValue);
      if (derived.kind === "container-env-file") {
        assertSafeEnvName(derived.runtimeName);
        envEntries.push({ name: derived.runtimeName, value: secretValue });
      } else if (derived.kind === "remote-bearer-token-file") {
        if (derived.runtimeName.toLowerCase() !== "authorization") {
          throw new Error(`Remote bearer-token delivery only supports Authorization, got ${derived.runtimeName}.`);
        }
        const tokenValue = normalizedBearerToken(secretValue);
        if (!tokenValue) throw new Error(`Ambient secret reference for ${derived.envName} did not contain a bearer token value.`);
        bearerTokenEntries.push({ name: derived.envName, value: tokenValue });
      }
    }

    if (bearerTokenEntries.length > 1) {
      throw new Error("Remote MCP proxy can bind only one bearer token secret in this ToolHive run path.");
    }

    const args: string[] = [];
    const cleanupPaths: string[] = [];
    const root = join(this.options.stateRoot(), "runtime-secret-bindings");
    await mkdir(root, { recursive: true, mode: 0o700 });

    if (envEntries.length) {
      const body = `${envEntries.map((entry) => `${entry.name}=${entry.value}`).join("\n")}\n`;
      const path = join(root, `${safeFileSegment(workloadName)}-${sha256Hex(body).slice(0, 12)}.env`);
      await writeRuntimeSecretFile(path, body);
      args.push("--env-file", path);
      cleanupPaths.push(path);
    }

    if (bearerTokenEntries.length) {
      const entry = bearerTokenEntries[0];
      const body = `${entry.value}\n`;
      const path = join(root, `${safeFileSegment(workloadName)}-${sha256Hex(`${entry.name}\0${body}`).slice(0, 12)}.token`);
      await writeRuntimeSecretFile(path, body);
      args.push("--remote-auth", "--remote-auth-bearer-token-file", path);
      cleanupPaths.push(path);
    }

    return { args, cleanupPaths };
  }

  private async ensureAmbientDockerConfig(): Promise<string> {
    const root = join(this.options.stateRoot(), "docker-config");
    await mkdir(root, { recursive: true, mode: 0o700 });
    await chmod(root, 0o700).catch(() => undefined);
    const configPath = join(root, "config.json");
    await writeFile(configPath, `${JSON.stringify({})}\n`, { encoding: "utf8", mode: 0o600 });
    await chmod(configPath, 0o600).catch(() => undefined);
    return root;
  }
}

export async function cleanupRuntimeSecretFiles(paths: string[]): Promise<void> {
  await Promise.all(paths.map((path) => rm(path, { force: true }).catch(() => undefined)));
}

async function writeRuntimeSecretFile(path: string, body: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, body, { encoding: "utf8", mode: 0o600 });
  await chmod(path, 0o600).catch(() => undefined);
}

function assertSafeEnvName(value: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(value)) {
    throw new Error(`Invalid runtime environment variable name: ${value}`);
  }
}

function assertSafeSecretDeliveryValue(value: string): void {
  if (!value || value.includes("\0") || value.includes("\n") || value.includes("\r")) {
    throw new Error("Ambient secret value cannot be delivered to ToolHive because it is empty or multi-line.");
  }
}

function assertSafePlainEnvDeliveryValue(value: string): void {
  if (!value || value.length > 4_000 || value.includes("\0") || value.includes("\n") || value.includes("\r") || looksToolHiveSecretLike(value)) {
    throw new Error("Plain MCP runtime environment values must be bounded, non-empty, single-line, and non-secret.");
  }
}

function normalizedBearerToken(value: string): string {
  return value.replace(/^Bearer\s+/i, "").trim();
}
