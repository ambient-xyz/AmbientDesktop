export const MAX_WORKFLOW_SOURCE_CHARS = 120_000;

const commonJsCallToken = String.fromCharCode(114, 101, 113, 117, 105, 114, 101);
const importToken = "im" + "port";
const sourceQuotePattern = "[\"'`]";
const forbiddenNodeModulePattern =
  "(?:node:)?(?:fs|child_process|net|tls|http|https|os|worker_threads|module|vm|inspector|cluster|dgram|dns|readline|repl|v8)(?:[/\\\\][^\"'`]+)?";

const forbiddenSourcePatterns = [
  {
    pattern: new RegExp(`\\bfrom\\s+${sourceQuotePattern}${forbiddenNodeModulePattern}${sourceQuotePattern}`),
    label: "forbidden Node module load",
    scan: "source",
  },
  {
    pattern: new RegExp(`\\b${commonJsCallToken}\\s*\\(\\s*${sourceQuotePattern}${forbiddenNodeModulePattern}${sourceQuotePattern}\\s*\\)`),
    label: "forbidden CommonJS module load",
    scan: "source",
  },
  { pattern: new RegExp(`\\b${importToken}\\s*\\(`), label: "dynamic module loading", scan: "code" },
  { pattern: new RegExp(`\\b${importToken}\\s+`), label: "module loading", scan: "code" },
  { pattern: new RegExp(`(^|[^\\w$"'\\\`])${commonJsCallToken}\\s*(?:\\(|\\.|\\[)`), label: "CommonJS require access", scan: "code" },
  { pattern: /(^|[^\w$"'`])module\s*(?:\.|\[|=)/, label: "CommonJS module access", scan: "code" },
  { pattern: /(^|[^\w$"'`])exports\s*(?:\.|\[|=)/, label: "CommonJS exports access", scan: "code" },
  { pattern: /\b(?:globalThis|window|document|self)\b/, label: "global object access", scan: "code" },
  { pattern: /(^|[^\w$"'`])process\b/, label: "raw process access", scan: "code" },
  { pattern: /\bBuffer\b/, label: "raw Buffer access", scan: "code" },
  { pattern: /(^|[^\w$"'`])(?:eval|Function)\s*\(/, label: "runtime code generation", scan: "code" },
  { pattern: /\bnew\s+Function\b/, label: "runtime code generation", scan: "code" },
  { pattern: /\bconstructor\b/, label: "constructor reflection", scan: "code" },
  { pattern: /\b(?:__proto__|prototype)\b/, label: "prototype reflection", scan: "code" },
  { pattern: /\b(?:Reflect|Proxy)\b/, label: "reflection API access", scan: "code" },
  { pattern: /\bObject\.(?:getPrototypeOf|setPrototypeOf|defineProperty|defineProperties|create)\b/, label: "object reflection API access", scan: "code" },
  { pattern: /\b(?:fetch|WebSocket|XMLHttpRequest|EventSource)\s*\(/, label: "raw network API access", scan: "code" },
  { pattern: /\b(?:setTimeout|setInterval|setImmediate|queueMicrotask)\s*\(/, label: "raw timer API access", scan: "code" },
  { pattern: /\b(?:Deno|Bun)\b/, label: "alternate runtime API access", scan: "code" },
  { pattern: /\bwhile\s*\(\s*(?:true|1)\s*\)/, label: "unbounded while loop", scan: "code" },
  { pattern: /\bfor\s*\(\s*;\s*;\s*\)/, label: "unbounded for loop", scan: "code" },
] as const;

export function validateWorkflowSourceIsolation(source: string): void {
  if (source.length > MAX_WORKFLOW_SOURCE_CHARS) {
    throw new Error(`Workflow source exceeds max source size (${MAX_WORKFLOW_SOURCE_CHARS} characters).`);
  }
  const codeOnlySource = stripWorkflowSourceLiteralsAndComments(source);
  for (const { pattern, label, scan } of forbiddenSourcePatterns) {
    if (pattern.test(scan === "source" ? source : codeOnlySource)) {
      throw new Error(`Compiler output source contains ${label}.`);
    }
  }
}

export function stripWorkflowSourceLiteralsAndComments(source: string): string {
  const chars = [...source];
  const stack: Array<{ kind: "template" } | { kind: "templateExpression"; braceDepth: number }> = [];
  const blank = (index: number) => {
    if (chars[index] !== "\n") chars[index] = " ";
  };
  const skipQuoted = (start: number, quote: "'" | '"'): number => {
    let index = start;
    blank(index);
    index += 1;
    while (index < chars.length) {
      const char = chars[index];
      blank(index);
      if (char === "\\") {
        index += 1;
        if (index < chars.length) blank(index);
      } else if (char === quote) {
        return index + 1;
      }
      index += 1;
    }
    return index;
  };
  const skipLineComment = (start: number): number => {
    let index = start;
    while (index < chars.length && chars[index] !== "\n") {
      blank(index);
      index += 1;
    }
    return index;
  };
  const skipBlockComment = (start: number): number => {
    let index = start;
    while (index < chars.length) {
      const char = chars[index];
      blank(index);
      if (char === "*" && chars[index + 1] === "/") {
        blank(index + 1);
        return index + 2;
      }
      index += 1;
    }
    return index;
  };

  let index = 0;
  while (index < chars.length) {
    const state = stack[stack.length - 1];
    const char = chars[index];
    const next = chars[index + 1];
    if (state?.kind === "template") {
      if (char === "\\" && index + 1 < chars.length) {
        blank(index);
        blank(index + 1);
        index += 2;
      } else if (char === "`") {
        blank(index);
        stack.pop();
        index += 1;
      } else if (char === "$" && next === "{") {
        blank(index);
        blank(index + 1);
        stack.push({ kind: "templateExpression", braceDepth: 1 });
        index += 2;
      } else {
        blank(index);
        index += 1;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      index = skipQuoted(index, char);
    } else if (char === "/" && next === "/") {
      index = skipLineComment(index);
    } else if (char === "/" && next === "*") {
      index = skipBlockComment(index);
    } else if (char === "`") {
      blank(index);
      stack.push({ kind: "template" });
      index += 1;
    } else if (state?.kind === "templateExpression" && char === "{") {
      state.braceDepth += 1;
      index += 1;
    } else if (state?.kind === "templateExpression" && char === "}") {
      state.braceDepth -= 1;
      if (state.braceDepth <= 0) {
        blank(index);
        stack.pop();
      }
      index += 1;
    } else {
      index += 1;
    }
  }
  return chars.join("");
}
