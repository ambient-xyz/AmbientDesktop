export function normalizeTerminalData(data: string): string {
  return new TerminalTextBuffer().write(data).text();
}

export function stripAnsi(data: string): string {
  return data
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "")
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
}

export class TerminalTextBuffer {
  private value = "";
  private cursor = 0;

  write(data: string): this {
    const text = stripAnsi(data).replace(/\r\n/g, "\n");
    for (const char of text) {
      if (char === "\r") {
        this.cursor = this.currentLineStart();
        continue;
      }
      if (char === "\n") {
        this.insertAtCursor("\n");
        continue;
      }
      if (char === "\b") {
        this.cursor = Math.max(0, this.cursor - 1);
        continue;
      }
      this.writePrintable(char);
    }
    return this;
  }

  text(): string {
    return this.value;
  }

  private currentLineStart(): number {
    const previousNewline = this.value.lastIndexOf("\n", Math.max(0, this.cursor - 1));
    return previousNewline === -1 ? 0 : previousNewline + 1;
  }

  private writePrintable(char: string): void {
    if (this.cursor < this.value.length && this.value[this.cursor] !== "\n") {
      this.value = `${this.value.slice(0, this.cursor)}${char}${this.value.slice(this.cursor + 1)}`;
      this.cursor += char.length;
    } else {
      this.insertAtCursor(char);
    }
  }

  private insertAtCursor(text: string): void {
    this.value = `${this.value.slice(0, this.cursor)}${text}${this.value.slice(this.cursor)}`;
    this.cursor += text.length;
  }
}
