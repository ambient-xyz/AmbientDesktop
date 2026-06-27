export {
  hardenedGitEnv,
  normalizeGitRepositoryUrl,
  readAmbientApiKey,
  secretReferenceFor,
  clearRegisteredSecretRedactionsForTests,
  redactGitSourceCredentials,
  redactSensitiveText,
  registerSecretRedaction,
  safeGitCloneSource,
} from "../security/securityAgentRuntimeContract";
