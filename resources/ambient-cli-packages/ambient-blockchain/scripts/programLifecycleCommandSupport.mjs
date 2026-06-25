export function createKeypairPathRedactor(redactSensitiveText) {
  return function redactKeypairPathText(value, keypairPath, envName) {
    return redactSensitiveText(value, [{ value: keypairPath, replacement: `<${envName}>` }]);
  };
}

export function extractDeploySignature(stdout) {
  const match = String(stdout ?? "").match(/signature\s*[:=]\s*(\S+)/i);
  return match?.[1];
}
