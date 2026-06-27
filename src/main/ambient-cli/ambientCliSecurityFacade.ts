export {
  buildSafeProcessEnv,
  hardenedGitEnv,
  isSecretEnvName,
  isSecretReference,
  normalizeGitRepositoryUrl,
  readSecretReference,
  redactGitSourceCredentials,
  safeGitCloneSource,
  saveSecretReference,
  secretReferenceFor,
} from "../security/securityAmbientCliContract";
