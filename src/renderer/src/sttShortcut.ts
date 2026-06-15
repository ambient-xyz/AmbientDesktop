export type SttShortcutKeyEventLike = {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
};

type ParsedSttShortcut = {
  key: string;
  cmdOrCtrl: boolean;
  alt: boolean;
  shift: boolean;
};

const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "OS", "Super", "Hyper"]);

const NAMED_KEY_BY_CODE: Record<string, string> = {
  Space: "Space",
  Enter: "Enter",
  NumpadEnter: "Enter",
  Escape: "Escape",
  Tab: "Tab",
  Backspace: "Backspace",
  Delete: "Delete",
  Insert: "Insert",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  ArrowUp: "ArrowUp",
  ArrowDown: "ArrowDown",
  ArrowLeft: "ArrowLeft",
  ArrowRight: "ArrowRight",
};

const NAMED_KEY_ALIASES: Record<string, string> = {
  " ": "Space",
  Esc: "Escape",
  Return: "Enter",
  Del: "Delete",
  Up: "ArrowUp",
  Down: "ArrowDown",
  Left: "ArrowLeft",
  Right: "ArrowRight",
  PgUp: "PageUp",
  PgDown: "PageDown",
};

const SYMBOL_KEY_NAMES: Record<string, string> = {
  "+": "Plus",
  "=": "Equal",
  "-": "Minus",
  "_": "Minus",
  ",": "Comma",
  ".": "Period",
  "/": "Slash",
  "\\": "Backslash",
  ";": "Semicolon",
  "'": "Quote",
  "`": "Backquote",
  "[": "BracketLeft",
  "]": "BracketRight",
};

export function shortcutFromKeyboardEvent(event: SttShortcutKeyEventLike): string | undefined {
  const key = shortcutKeyToken(event);
  if (!key || MODIFIER_KEYS.has(key)) return undefined;
  const modifiers = shortcutModifierTokens(event);
  if (!modifiers.length && !canUseBareShortcutKey(key)) return undefined;
  return [...modifiers, key].join("+");
}

export function sttShortcutMatchesEvent(shortcut: string | undefined, event: SttShortcutKeyEventLike): boolean {
  const parsed = parseSttShortcut(shortcut);
  if (!parsed) return false;
  const key = shortcutKeyToken(event);
  if (key !== parsed.key) return false;
  return modifiersMatch(parsed, event);
}

export function sttShortcutReleaseMatchesEvent(shortcut: string | undefined, event: SttShortcutKeyEventLike): boolean {
  const parsed = parseSttShortcut(shortcut);
  if (!parsed) return false;
  const key = shortcutKeyToken(event);
  if (key === parsed.key) return true;
  if (parsed.cmdOrCtrl && (event.key === "Control" || event.key === "Meta")) return true;
  if (parsed.alt && event.key === "Alt") return true;
  if (parsed.shift && event.key === "Shift") return true;
  return false;
}

export function sttShortcutLabel(shortcut: string | undefined): string {
  const parsed = parseSttShortcut(shortcut);
  if (!parsed) return shortcut?.trim() || "Not set";
  return [
    parsed.cmdOrCtrl ? "Cmd/Ctrl" : undefined,
    parsed.alt ? "Alt" : undefined,
    parsed.shift ? "Shift" : undefined,
    parsed.key,
  ].filter(Boolean).join(" + ");
}

export function shouldSuppressSttShortcutEventTarget(target: EventTarget | null, shortcut: string): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest("[data-stt-shortcut-capture='true']")) return true;
  if (shortcut.includes("+")) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable], [role='textbox']"));
}

export function shortcutKeyToken(event: SttShortcutKeyEventLike): string | undefined {
  const code = event.code;
  if (code) {
    if (NAMED_KEY_BY_CODE[code]) return NAMED_KEY_BY_CODE[code];
    const letter = /^Key([A-Z])$/.exec(code);
    if (letter) return letter[1];
    const digit = /^Digit([0-9])$/.exec(code);
    if (digit) return digit[1];
    const functionKey = /^F([1-9]|1[0-9]|2[0-4])$/.exec(code);
    if (functionKey) return `F${functionKey[1]}`;
  }

  const key = event.key;
  if (!key) return undefined;
  if (NAMED_KEY_ALIASES[key]) return NAMED_KEY_ALIASES[key];
  const trimmed = key.trim();
  if (!trimmed) return undefined;
  if (NAMED_KEY_ALIASES[trimmed]) return NAMED_KEY_ALIASES[trimmed];
  if (MODIFIER_KEYS.has(trimmed)) return trimmed;
  if (trimmed.length === 1) {
    if (SYMBOL_KEY_NAMES[trimmed]) return SYMBOL_KEY_NAMES[trimmed];
    return trimmed.toUpperCase();
  }
  return trimmed[0].toUpperCase() + trimmed.slice(1);
}

function shortcutModifierTokens(event: SttShortcutKeyEventLike): string[] {
  const modifiers: string[] = [];
  if (event.ctrlKey || event.metaKey) modifiers.push("CmdOrCtrl");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");
  return modifiers;
}

function parseSttShortcut(shortcut: string | undefined): ParsedSttShortcut | undefined {
  const parts = shortcut?.split("+").map((part) => part.trim()).filter(Boolean) ?? [];
  if (!parts.length) return undefined;

  const parsed: ParsedSttShortcut = { key: "", cmdOrCtrl: false, alt: false, shift: false };
  for (const part of parts) {
    const modifier = normalizeModifierToken(part);
    if (modifier) {
      parsed[modifier] = true;
      continue;
    }
    if (parsed.key) return undefined;
    parsed.key = normalizeShortcutKeyPart(part);
  }

  if (!parsed.key || MODIFIER_KEYS.has(parsed.key)) return undefined;
  if (!parsed.cmdOrCtrl && !parsed.alt && !parsed.shift && !canUseBareShortcutKey(parsed.key)) return undefined;
  return parsed;
}

function normalizeModifierToken(part: string): keyof Omit<ParsedSttShortcut, "key"> | undefined {
  const normalized = part.toLowerCase().replace(/[\s_-]/g, "");
  if (
    normalized === "cmdorctrl" ||
    normalized === "commandorcontrol" ||
    normalized === "ctrl" ||
    normalized === "control" ||
    normalized === "cmd" ||
    normalized === "command" ||
    normalized === "meta"
  ) return "cmdOrCtrl";
  if (normalized === "alt" || normalized === "option") return "alt";
  if (normalized === "shift") return "shift";
  return undefined;
}

function normalizeShortcutKeyPart(part: string): string {
  if (NAMED_KEY_ALIASES[part]) return NAMED_KEY_ALIASES[part];
  if (part.length === 1) return SYMBOL_KEY_NAMES[part] ?? part.toUpperCase();
  return part[0].toUpperCase() + part.slice(1);
}

function modifiersMatch(parsed: ParsedSttShortcut, event: SttShortcutKeyEventLike): boolean {
  if (parsed.cmdOrCtrl !== Boolean(event.ctrlKey || event.metaKey)) return false;
  if (parsed.alt !== Boolean(event.altKey)) return false;
  if (parsed.shift !== Boolean(event.shiftKey)) return false;
  return true;
}

function canUseBareShortcutKey(key: string): boolean {
  return key === "Space" || key === "Enter" || key === "Escape" || key === "Tab" || /^F([1-9]|1[0-9]|2[0-4])$/.test(key);
}
