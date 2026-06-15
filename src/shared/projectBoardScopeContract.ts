import type {
  ProjectBoardPlanningDepthAssessment,
  ProjectBoardPlanningDepthLevel,
  ProjectBoardScopeContract,
  ProjectBoardScopeFeature,
} from "./types";

interface ScopeFeatureRule {
  feature: ProjectBoardScopeFeature;
  patterns: RegExp[];
}

const SCOPE_FEATURE_RULES: ScopeFeatureRule[] = [
  {
    feature: "auth",
    patterns: [/\bauth(?:entication)?\b/i, /\blog\s*in\b/i, /\blogin\b/i, /\bsign[-\s]?in\b/i],
  },
  {
    feature: "accounts",
    patterns: [/\baccounts?\b/i, /\buser\s+profiles?\b/i, /\bprofiles?\b/i],
  },
  {
    feature: "analytics",
    patterns: [/\banalytics?\b/i, /\btelemetry\b/i, /\bmetrics?\b/i, /\btracking\s+dashboard\b/i],
  },
  {
    feature: "sync",
    patterns: [/\bsync(?:hronization)?\b/i, /\bcloud\s+sync\b/i, /\breal[-\s]?time\s+state\b/i],
  },
  {
    feature: "collaboration",
    patterns: [/\bcollaboration\b/i, /\bcollaborative\b/i, /\breal[-\s]?time\s+collab/i, /\bmulti[-\s]?user\s+sharing\b/i, /\bshared\s+(?:workspace|project|board|document)\b/i],
  },
  {
    feature: "notifications",
    patterns: [/\bnotifications?\b/i, /\bpush\b/i, /\breminders?\b/i, /\bsound\s+effects?\b/i],
  },
  {
    feature: "backend",
    patterns: [/\bbackend\b/i, /\bapi\b/i, /\bserver\b/i, /\bdatabase\b/i, /\bdb\b/i],
  },
  {
    feature: "payments",
    patterns: [/\bpayments?\b/i, /\bbilling\b/i, /\bcheckout\b/i, /\bsubscription\b/i],
  },
  {
    feature: "deployment",
    patterns: [/\bdeployment\b/i, /\bdeploy\b/i, /\bhosting\b/i, /\bci\/?cd\b/i, /\bgithub\s+pages\b/i],
  },
  {
    feature: "admin_reporting",
    patterns: [/\badmin\b/i, /\breporting\b/i, /\badmin\s+dashboard\b/i],
  },
];

const EXPLICIT_EXCLUSION_PATTERN =
  /\b(no|without|omit|skip|exclude|excluded|out\s+of\s+scope|not\s+in\s+scope|not\s+included|not\s+required|not\s+requested|do\s+not\s+(?:add|include|build|create)|leave\b.*\bfor\s+later)\b/i;
const SIMPLE_SCOPE_PATTERN =
  /\b(simple|small|single[-\s]?page(?:\s+(?:web\s+)?app)?|single[-\s]?file|single\s+index\.html|one\s+index\.html|one\s+file|one\s+input|one\s+button|zero\s+dependencies|no\s+dependencies|no\s+build\s+step|client[-\s]?side|browser[-\s]?only|local[-\s]?only|local\s+form|static\s+(?:html|page|site|app)|vanilla\s+(?:javascript|js)|utility)\b/i;
const LOCAL_SCOPE_PATTERN =
  /\b(client[-\s]?side|browser[-\s]?only|local[-\s]?only|local\s+form|static\s+(?:html|page|site|app)|single[-\s]?page(?:\s+(?:web\s+)?app)?|single\s+index\.html|one\s+index\.html|inline\s+css|inline\s+(?:javascript|js)|vanilla\s+(?:javascript|js)|zero\s+dependencies|no\s+dependencies|no\s+(?:server|backend|external\s+services?))\b/i;
const HEAVY_POSITIVE_SCOPE_PATTERN =
  /\b(game|hangman|canvas|webgl|three\.js|rich\s+ui|multiplayer|chat|payments?|auth|backend|database|geolocation|(?:user|device|current|live|driver|rider|customer|store|pickup|drop[-\s]?off|delivery)\s+locations?|locations?\s+(?:update|tracking|sharing|permission|permissions|service|services|api|apis|route|routes|routing|map|maps)|map(?:s|ping)?\s+(?:ui|view|screen|route|routes|routing|geolocation|location|locations)|(?:map|maps|trip|ride|driver|delivery|dispatch)\s+routing|routing\s+(?:api|apis|engine|service|services|for\s+(?:maps|trips|rides|drivers|deliveries)))\b/i;

export function projectBoardScopeContractFromTexts(texts: string[]): ProjectBoardScopeContract {
  const sourceText = texts.filter((text) => text.trim()).join("\n");
  const positiveText = scopePositiveText(sourceText);
  const excludedEvidence = scopeExcludedEvidence(sourceText);
  const excluded = featuresFromEvidence(excludedEvidence);
  // This word-based pass deliberately never claims a feature is INCLUDED; keyword
  // matches like "Build tool and dev server" misread tech-stack phrasing as product
  // scope. Only the LLM scope contract may include features (the merge step already
  // takes included exclusively from the LLM side); this pass is limited to explicit
  // exclusions and small/local hints, where keywords are reliable.
  const included: ProjectBoardScopeFeature[] = [];
  const explicitSmallLocalScope =
    SIMPLE_SCOPE_PATTERN.test(sourceText) &&
    (LOCAL_SCOPE_PATTERN.test(sourceText) || excluded.includes("backend") || excluded.includes("auth")) &&
    !HEAVY_POSITIVE_SCOPE_PATTERN.test(positiveText);
  const planningDepth = explicitSmallLocalScope
    ? shallowPlanningDepth({
        excludedCount: excluded.length,
        signals: [
          "Source text describes a small local/client-side scope.",
          ...(excluded.length ? [`${excluded.length} explicit platform exclusion${excluded.length === 1 ? "" : "s"}.`] : []),
        ],
      })
    : undefined;
  const planningDepthHints = explicitSmallLocalScope ? ["Small local/client-side scope; keep board workflow compact."] : [];
  const evidence = dedupeStrings([
    ...simpleScopeEvidence(sourceText),
    ...excludedEvidence.slice(0, 8),
  ]).slice(0, 12);
  return {
    included,
    excluded,
    planningDepth,
    planningDepthHints,
    openQuestions: [],
    evidence,
  };
}

export function projectBoardPlanningDepthFromScopeContract(contract: ProjectBoardScopeContract): ProjectBoardPlanningDepthAssessment {
  if (contract.planningDepth) return contract.planningDepth;
  let score = 35;
  const signals: string[] = [];
  if (contract.openQuestions.length > 0) {
    score += Math.min(20, contract.openQuestions.length * 8);
    signals.push(`${contract.openQuestions.length} open scope question${contract.openQuestions.length === 1 ? "" : "s"}`);
  }
  if (contract.included.length > 0) {
    score += Math.min(24, contract.included.length * 6);
    signals.push(`${contract.included.length} explicitly included platform surface${contract.included.length === 1 ? "" : "s"}`);
  }
  if (contract.excluded.length > 0) {
    score -= Math.min(18, contract.excluded.length * 3);
    signals.push(`${contract.excluded.length} explicit scope exclusion${contract.excluded.length === 1 ? "" : "s"}`);
  }
  score = Math.max(10, Math.min(100, Math.round(score)));
  const level: ProjectBoardPlanningDepthLevel =
    score >= 80 ? "phased" : score >= 60 ? "deep" : score >= 35 ? "standard" : "shallow";
  const guidance =
    level === "phased"
      ? "Use phased planning, clarify assumptions before risky cards, and keep product scope bounded by the contract."
      : level === "deep"
        ? "Use careful dependency ordering and clarification, but do not add product surfaces outside the contract."
        : level === "standard"
          ? "Use normal project-board planning with small proofable cards inside the contract."
          : "Keep planning lightweight and produce the smallest useful local cards inside the contract.";
  return { score, level, signals, guidance };
}

export function mergeProjectBoardScopeContracts(
  deterministic: ProjectBoardScopeContract,
  llm: ProjectBoardScopeContract,
): ProjectBoardScopeContract {
  const excluded = dedupeScopeFeatures([...deterministic.excluded, ...llm.excluded]);
  const included = dedupeScopeFeatures(llm.included).filter((feature) => !excluded.includes(feature));
  const openQuestions = dedupeStrings([...deterministic.openQuestions, ...llm.openQuestions]);
  return {
    included,
    excluded,
    requiredCapabilities: mergeOptionalStrings(deterministic.requiredCapabilities, llm.requiredCapabilities, 20),
    supportingCapabilities: mergeOptionalStrings(deterministic.supportingCapabilities, llm.supportingCapabilities, 20),
    optionalCapabilities: mergeOptionalStrings(deterministic.optionalCapabilities, llm.optionalCapabilities, 20),
    excludedCapabilities: mergeOptionalStrings(deterministic.excludedCapabilities, llm.excludedCapabilities, 20),
    planningDepth: mergedPlanningDepth(deterministic, llm, included, openQuestions),
    planningDepthHints: dedupeStrings([...deterministic.planningDepthHints, ...llm.planningDepthHints]).slice(0, 12),
    openQuestions,
    evidence: dedupeStrings([...deterministic.evidence, ...llm.evidence]).slice(0, 20),
  };
}

function scopeExcludedEvidence(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const evidence: string[] = [];
  let inExcludedSection = false;
  for (const rawLine of lines) {
    const line = normalizeEvidenceLine(rawLine);
    if (!line) continue;
    const isHeading = /^#+\s/.test(rawLine.trim());
    const isBullet = /^[-*]\s/.test(rawLine.trim());
    if (isExcludedSectionStart(line)) {
      const inlineContent = exclusionSectionInlineContent(line);
      // A one-line exclusion with inline content ("- Not included: payments") is a
      // single clause, not a section start — treating it as a section would swallow
      // every following bullet ("- Add user login") into the exclusions.
      if (isHeading || !inlineContent) {
        inExcludedSection = true;
        if (inlineContent) evidence.push(...scopeExclusionEvidenceFragments(line));
        continue;
      }
      evidence.push(...scopeExclusionEvidenceFragments(line));
      continue;
    }
    // Any heading ends an exclusion section; bullets never do (they are its content).
    if (inExcludedSection && (isHeading || (!isBullet && isSectionBoundary(line)))) {
      inExcludedSection = false;
    }
    if (inExcludedSection) {
      evidence.push(line);
      continue;
    }
    if (EXPLICIT_EXCLUSION_PATTERN.test(line)) {
      evidence.push(...scopeExclusionEvidenceFragments(line));
    }
  }
  for (const sentence of text.split(/[.;\n]/).map(normalizeEvidenceLine)) {
    if (sentence && EXPLICIT_EXCLUSION_PATTERN.test(sentence)) evidence.push(...scopeExclusionEvidenceFragments(sentence));
  }
  return dedupeStrings(evidence).filter((line) => SCOPE_FEATURE_RULES.some((rule) => rule.patterns.some((pattern) => pattern.test(line))));
}

function exclusionSectionInlineContent(line: string): string {
  const match = line.match(/^(?:excluded|out[-\s]?of[-\s]?scope|non[-\s]?goals?|not\s+requested|not\s+included)\b\s*:?\s*(.*)$/i);
  return match?.[1]?.trim() ?? "";
}

function scopeExclusionEvidenceFragments(line: string): string[] {
  return line
    .split(/[.;]/)
    .map(normalizeEvidenceLine)
    .filter((clause) => clause && EXPLICIT_EXCLUSION_PATTERN.test(clause))
    .map(scopeExclusionFeatureFragment)
    .filter(Boolean);
}

function scopeExclusionFeatureFragment(clause: string): string {
  const prefixList = clause.match(/\b(?:out\s+of\s+scope|not\s+in\s+scope|excluded|not\s+requested|not\s+included)\s*:?\s*(.+)$/i);
  if (prefixList?.[1]?.trim()) return prefixList[1].trim();

  const forwardExclusion = clause.match(
    /\b(?:no|without|omit|skip|exclude|excluded|not\s+required|do\s+not\s+(?:add|include|build|create))\b\s*:?\s*(.+)$/i,
  );
  if (forwardExclusion?.[1]?.trim()) return forwardExclusion[1].trim();

  const backwardExclusion = clause.match(/^(.+?)\b(?:out\s+of\s+scope|not\s+in\s+scope|excluded|not\s+requested|not\s+included)\b/i);
  if (backwardExclusion?.[1]?.trim()) {
    return backwardExclusion[1].replace(/^(?:keep|leave|mark|treat)\s+/i, "").trim();
  }

  return clause;
}


function scopePositiveText(text: string): string {
  const excludedSet = new Set(scopeExcludedEvidence(text).map((line) => line.toLowerCase()));
  return text
    .split(/\r?\n/)
    .map(normalizeEvidenceLine)
    .filter((line) => line && !excludedSet.has(line.toLowerCase()) && !EXPLICIT_EXCLUSION_PATTERN.test(line))
    .join("\n");
}

function featuresFromEvidence(evidence: string[]): ProjectBoardScopeFeature[] {
  const features: ProjectBoardScopeFeature[] = [];
  for (const line of evidence) {
    for (const rule of SCOPE_FEATURE_RULES) {
      if (rule.patterns.some((pattern) => pattern.test(line)) && !features.includes(rule.feature)) {
        features.push(rule.feature);
      }
    }
  }
  return features;
}

function simpleScopeEvidence(text: string): string[] {
  return dedupeStrings(
    text
      .split(/\r?\n/)
      .map(normalizeEvidenceLine)
      .filter((line) => SIMPLE_SCOPE_PATTERN.test(line) || LOCAL_SCOPE_PATTERN.test(line))
      .slice(0, 4),
  );
}

function shallowPlanningDepth(input: { excludedCount: number; signals: string[] }): ProjectBoardPlanningDepthAssessment {
  const score = Math.max(12, Math.min(28, 26 - Math.min(8, input.excludedCount)));
  return {
    score,
    level: "shallow",
    signals: input.signals,
    guidance: "Use one compact planning pass and create only the smallest useful board cards for the requested local scope.",
  };
}

function mergedPlanningDepth(
  deterministic: ProjectBoardScopeContract,
  llm: ProjectBoardScopeContract,
  included: ProjectBoardScopeFeature[],
  openQuestions: string[],
): ProjectBoardPlanningDepthAssessment | undefined {
  if (llm.planningDepth) return llm.planningDepth;
  if (deterministic.planningDepth?.level === "shallow" && included.length === 0 && openQuestions.length === 0) {
    return deterministic.planningDepth;
  }
  return deterministic.planningDepth;
}

function mergeOptionalStrings(left: string[] | undefined, right: string[] | undefined, limit: number): string[] | undefined {
  const values = dedupeStrings([...(left ?? []), ...(right ?? [])]).slice(0, limit);
  return values.length ? values : undefined;
}

function dedupeScopeFeatures(features: ProjectBoardScopeFeature[]): ProjectBoardScopeFeature[] {
  const seen = new Set<ProjectBoardScopeFeature>();
  for (const feature of features) seen.add(feature);
  return [...seen];
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const value of values) {
    const normalized = value.trim().replace(/\s+/g, " ");
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(normalized);
  }
  return deduped;
}

function normalizeEvidenceLine(line: string): string {
  return line
    .trim()
    .replace(/^#+\s+/, "")
    .replace(/^[-*]\s+/, "")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isExcludedSectionStart(line: string): boolean {
  return /^(excluded|out[-\s]?of[-\s]?scope|non[-\s]?goals?|not\s+requested|not\s+included)\b/i.test(line);
}

function isSectionBoundary(line: string): boolean {
  // Bullets are filtered by the caller (which still sees the raw line); this
  // allowlist only catches plain-text section labels in non-markdown sources.
  return /^(included|implementation\s+plan|technology|stages?|stage\s+\d+|files|risks?|open\s+questions?|optional\s+next\s+steps?|durable\s+plan|planner\s+decisions?|scope\s+contract|user\s+request)\b/i.test(
    line,
  );
}
