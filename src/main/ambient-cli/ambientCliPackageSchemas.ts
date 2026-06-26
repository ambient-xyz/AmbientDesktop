import { z } from "zod";
import { commandTimeoutProfileNames } from "../tool-runtime/commandExecutionProfiles";

export const cliPackageConfigPath = ".ambient/cli-packages/packages.json";
export const cliPackageImportRoot = ".ambient/cli-packages/imported";
export const cliPackageDescriptorName = "ambient-cli.json";
export const packageJsonName = "package.json";

export const cliRuntimeLifecycleActionSchema = z
  .object({
    command: z.string().min(1),
    label: z.string().optional(),
    description: z.string().optional(),
    timeoutMs: z.number().int().positive().optional(),
  })
  .passthrough();

export const cliRuntimeLifecycleSchema = z
  .object({
    start: cliRuntimeLifecycleActionSchema.optional(),
    stop: cliRuntimeLifecycleActionSchema.optional(),
    restart: cliRuntimeLifecycleActionSchema.optional(),
  })
  .passthrough();

export const cliCommandDevicePolicySchema = z
  .object({
    prefer: z.array(z.string().min(1)).optional(),
    requireReasonWhenCpuForced: z.boolean().optional(),
    cpuReason: z.string().optional(),
    forceCpuReason: z.string().optional(),
    argName: z.string().optional(),
  })
  .passthrough();

export const cliCommandSchema = z
  .object({
    command: z.string().min(1),
    args: z.array(z.string()).default([]),
    description: z.string().optional(),
    cwd: z.enum(["workspace", "package"]).default("workspace"),
    healthCheck: z.array(z.string()).optional(),
    timeoutProfile: z.enum(commandTimeoutProfileNames).optional(),
    progressPatterns: z.array(z.string().min(1)).optional(),
    devicePolicy: cliCommandDevicePolicySchema.optional(),
    voiceProvider: z
      .object({
        label: z.string().optional(),
        defaultFormat: z.enum(["mp3", "wav", "ogg"]).default("wav"),
        formats: z.array(z.enum(["mp3", "wav", "ogg"])).default(["wav"]),
        voices: z.array(z.object({ id: z.string().min(1), label: z.string().optional() }).passthrough()).default([{ id: "default" }]),
        local: z.boolean().optional(),
        voiceDiscovery: z
          .object({
            command: z.string().min(1),
            cacheTtlSeconds: z.number().int().positive().optional(),
            requiresNetwork: z.boolean().optional(),
            requiresSecret: z.array(z.string().min(1)).optional(),
            source: z.enum(["cloud-api", "local-model-directory", "local-runtime", "custom"]).optional(),
          })
          .passthrough()
          .optional(),
        voiceCloning: z
          .object({
            supported: z.boolean(),
            createCommand: z.string().min(1).optional(),
            statusCommand: z.string().min(1).optional(),
            deleteCommand: z.string().min(1).optional(),
            mode: z.enum(["cloud", "local"]).optional(),
            inputs: z
              .object({
                audioFormats: z.array(z.string().min(1)).default([]),
                minDurationSeconds: z.number().positive().optional(),
                maxDurationSeconds: z.number().positive().optional(),
                minSamples: z.number().int().positive().optional(),
                maxSamples: z.number().int().positive().optional(),
                transcript: z.enum(["required", "optional", "unsupported"]).optional(),
              })
              .passthrough()
              .optional(),
            requiresConsent: z.boolean().optional(),
            requiresSecret: z.array(z.string().min(1)).optional(),
            networkHosts: z.array(z.string().min(1)).optional(),
            costNote: z.string().optional(),
            privacyNote: z.string().optional(),
            output: z
              .object({
                creates: z.array(z.enum(["provider-voice-id", "local-model-asset", "dynamic-cache-voice"])).default([]),
                appearsInDynamicCatalog: z.boolean().optional(),
              })
              .passthrough()
              .optional(),
          })
          .passthrough()
          .optional(),
        runtimeLifecycle: cliRuntimeLifecycleSchema.optional(),
      })
      .passthrough()
      .optional(),
    sttProvider: z
      .object({
        label: z.string().optional(),
        languages: z.array(z.string().min(1)).default([]),
        defaultLanguage: z.string().optional(),
        local: z.boolean().optional(),
      })
      .passthrough()
      .optional(),
    embeddingProvider: z
      .object({
        label: z.string().optional(),
        modelId: z.string().optional(),
        dimensions: z.number().int().positive().optional(),
        local: z.boolean().optional(),
        runtimeLifecycle: cliRuntimeLifecycleSchema.optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const cliEnvRequirementSchema = z.union([
  z.string().min(1),
  z
    .object({
      name: z.string().min(1),
      description: z.string().optional(),
      required: z.boolean().default(true),
    })
    .passthrough(),
]);

export const cliDescriptorSchema = z
  .object({
    name: z.string().min(1).optional(),
    version: z.string().optional(),
    description: z.string().optional(),
    skills: z.string().default("./skills"),
    env: z.array(cliEnvRequirementSchema).default([]),
    commands: z.record(z.string().min(1), cliCommandSchema).default({}),
  })
  .passthrough();

export const packageJsonSchema = z
  .object({
    name: z.string().optional(),
    version: z.string().optional(),
    description: z.string().optional(),
    dependencies: z.record(z.string(), z.string()).optional(),
    devDependencies: z.record(z.string(), z.string()).optional(),
    optionalDependencies: z.record(z.string(), z.string()).optional(),
    peerDependencies: z.record(z.string(), z.string()).optional(),
    ambient: z
      .object({
        cli: cliDescriptorSchema.optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const cliPackageConfigSchema = z
  .object({
    packages: z.array(z.object({ source: z.string().min(1) })).default([]),
  })
  .passthrough();

export type CliDescriptor = z.infer<typeof cliDescriptorSchema>;
export type CliCommandDescriptor = z.infer<typeof cliCommandSchema>;
export type CliRuntimeLifecycleDescriptor = z.infer<typeof cliRuntimeLifecycleSchema>;
export type CliRuntimeLifecycleActionDescriptor = z.infer<typeof cliRuntimeLifecycleActionSchema>;
export type CliEnvRequirementDescriptor = z.infer<typeof cliEnvRequirementSchema>;
export type CliPackageConfig = z.infer<typeof cliPackageConfigSchema>;
