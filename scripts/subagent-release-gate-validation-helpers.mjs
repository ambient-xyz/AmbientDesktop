export function secretLikeStringPaths(value) {
  const paths = [];
  const seen = new Set();
  visit(value, "$");
  return paths;

  function visit(current, path) {
    if (!current || paths.length >= 10) return;
    if (typeof current === "string") {
      if (looksSecretLike(current)) paths.push(path);
      return;
    }
    if (typeof current !== "object" || seen.has(current)) return;
    seen.add(current);
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    for (const [key, child] of Object.entries(current)) {
      visit(child, `${path}.${key}`);
    }
  }
}

function looksSecretLike(value) {
  return (
    /\b(?:GMI_CLOUD_API_KEY|GMI_API_KEY|AMBIENT_API_KEY)\b\s*[:=]\s*["']?[^"'\s$]{8,}/i.test(value) ||
    /\bapi[_-]?key\b\s*[:=]\s*["']?[A-Za-z0-9_-]{16,}/i.test(value) ||
    /\bsk-[A-Za-z0-9_-]{16,}\b/.test(value)
  );
}

export function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function nonEmptyStringArray(value) {
  return Array.isArray(value) && value.some(nonEmptyString);
}

export function allNonEmptyStrings(value) {
  return Array.isArray(value) && value.length > 0 && value.every(nonEmptyString);
}

export function arrayIncludesAll(value, expected) {
  return Array.isArray(value) && expected.every((item) => value.includes(item));
}

export function isWorkflowMutationPolicy(value) {
  return value === "read_only" || value === "staged_until_approved" || value === "apply_after_approval";
}

export function positiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

export function nonNegativeCount(value) {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export function sha256Hex(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

export function safeRelativePath(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !value.startsWith("/") &&
    !value.split("/").some((part) => part === "" || part === "..")
  );
}

export function artifactFreshness(timestamp, options) {
  if (!timestamp) return { evidence: ["ageHours: unknown"], issues: ["Artifact timestamp is missing."] };
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return { evidence: [`timestamp: ${timestamp}`], issues: [`Artifact timestamp is invalid: ${timestamp}.`] };
  }
  const ageHours = Math.round(((options.now.getTime() - parsed.getTime()) / 3_600_000) * 100) / 100;
  const issues = [];
  if (ageHours > options.maxArtifactAgeHours) {
    issues.push(`Artifact is stale: ${ageHours} hours old; max is ${options.maxArtifactAgeHours}.`);
  }
  if (ageHours < -0.1) {
    issues.push(`Artifact timestamp is from the future by ${Math.abs(ageHours)} hours.`);
  }
  return { evidence: [`ageHours: ${ageHours}`], issues };
}

export function check(input) {
  return {
    id: input.id,
    area: input.area,
    status: input.status,
    label: input.label,
    evidence: input.evidence ?? [],
    issues: input.issues ?? [],
    warnIssues: input.warnIssues ?? [],
  };
}

export function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function positiveNumber(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

export function escapeMarkdownCell(value) {
  return String(value ?? "")
    .replaceAll("|", "\\|")
    .replaceAll("\n", "<br>");
}
