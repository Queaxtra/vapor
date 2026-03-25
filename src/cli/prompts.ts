// Terminal input adapters - reads user input from stdin and handles interactive prompts
import readline from "node:readline/promises";
import { clearLine, cursorTo, moveCursor } from "node:readline";
import { fitTerminalLine, sanitizeTerminalText } from "./sanitize.ts";
import type { PromptAdapter, SelectOption } from "../types/cli.ts";

function getOptionRenderWidth(stdout: NodeJS.WriteStream): number {
  const terminalWidth = stdout.columns ?? 80;

  if (terminalWidth > 6) {
    return terminalWidth - 4;
  }

  return 2;
}

function renderOptionLine(option: SelectOption, isSelected: boolean, stdout: NodeJS.WriteStream): string {
  const marker = isSelected ? ">" : " ";
  const label = fitTerminalLine(option.label, getOptionRenderWidth(stdout));

  return ` ${marker} ${label}`;
}

/**
 * Bridges the PromptAdapter interface to Node's readline module for terminal I/O.
 * Supports plain text input, secret/hidden input (for API tokens), and yes/no confirmations.
 */
export class TerminalPrompts implements PromptAdapter {
  /**
   * Reads a single line of text from stdin, trimming whitespace.
   * Uses readline's question() which handles line buffering automatically.
   */
  public async ask(question: string): Promise<string> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      return (await rl.question(question)).trim();
    } finally {
      rl.close(); // Ensure cleanup even if question() rejects
    }
  }

  /**
   * Reads a single line while allowing a default value on empty submit.
   * The prompt displays the default in brackets when provided.
   */
  public async askOptional(question: string, defaultValue?: string): Promise<string> {
    const promptText = defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `;
    const answer = await this.ask(promptText);

    if (answer) {
      return answer;
    }

    if (defaultValue) {
      return defaultValue;
    }

    return "";
  }

  /**
   * Reads a secret (password-style) input with character-by-character echo control.
   * Falls back to regular ask() when stdin/stdout are not TTY (e.g., piped input).
   * Raw mode is used to capture keystrokes without buffering.
   */
  public async askSecret(question: string): Promise<string> {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      return this.ask(question);
    }

    return new Promise<string>((resolve, reject) => {
      let value = "";
      const stdin = process.stdin;
      const stdout = process.stdout;

      // Restores terminal to normal state on exit (either completion or cancellation)
      const cleanup = (): void => {
        stdin.off("data", onData);
        stdin.pause();

        if (stdin.isTTY) {
          stdin.setRawMode(false);
        }
      };

      const onData = (chunk: string | Buffer): void => {
        const input = chunk.toString("utf8");

        // Ctrl+C cancels the prompt
        if (input === "\u0003") {
          cleanup();
          reject(new Error("prompt cancelled"));
          return;
        }

        // Enter/Return finalizes input
        if (input === "\r" || input === "\n") {
          cleanup();
          stdout.write("\n");
          resolve(value.trim());
          return;
        }

        // Backspace removes last character
        if (input === "\u007f") {
          value = value.slice(0, -1);
          return;
        }

        // ANSI escape sequences (arrow keys, function keys) are ignored
        if (input.startsWith("\u001b")) {
          return;
        }

        // Accumulate printable characters
        value += input;
      };

      stdout.write(question);
      stdin.resume();
      stdin.setEncoding("utf8");
      stdin.setRawMode(true);
      stdin.on("data", onData);
    });
  }

  /**
   * Prompts for a yes/no confirmation with [y/N] suffix.
   * Returns true only on explicit "y" or "yes" (case-insensitive).
   */
  public async confirm(question: string): Promise<boolean> {
    const answer = (await this.ask(`${question} [y/N]: `)).trim().toLowerCase();

    if (answer === "y" || answer === "yes") {
      return true;
    }

    return false;
  }

  /**
   * Displays a simple interactive selection list.
   * TTY mode supports arrow keys, enter, and 1-9 shortcuts.
   * Non-TTY mode falls back to a numbered prompt.
   */
  public async select(question: string, options: SelectOption[]): Promise<string> {
    if (!options.length) {
      throw new Error("selection options are required");
    }

    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      return this.selectWithoutTty(question, options);
    }

    return new Promise<string>((resolve, reject) => {
      const stdin = process.stdin;
      const stdout = process.stdout;
      let selectedIndex = 0;

      const cleanup = (): void => {
        stdin.off("data", onData);
        stdin.pause();

        if (stdin.isTTY) {
          stdin.setRawMode(false);
        }

        stdout.write("\u001b[?25h");
      };

      const renderOptions = (isInitialRender: boolean): void => {
        if (!isInitialRender) {
          moveCursor(stdout, 0, -options.length);
        }

        options.forEach((option, index) => {
          cursorTo(stdout, 0);
          clearLine(stdout, 0);
          stdout.write(renderOptionLine(option, index === selectedIndex, stdout));
          stdout.write("\n");
        });
      };

      const onData = (chunk: string | Buffer): void => {
        const input = chunk.toString("utf8");

        if (input === "\u0003") {
          cleanup();
          reject(new Error("prompt cancelled"));
          return;
        }

        if (input === "\u001b[A") {
          selectedIndex = (selectedIndex - 1 + options.length) % options.length;
          renderOptions(false);
          return;
        }

        if (input === "\u001b[B") {
          selectedIndex = (selectedIndex + 1) % options.length;
          renderOptions(false);
          return;
        }

        if (input === "\r" || input === "\n") {
          const selectedValue = options[selectedIndex]?.value;

          cleanup();
          stdout.write("\n");

          if (selectedValue) {
            resolve(selectedValue);
            return;
          }

          reject(new Error("selected option is invalid"));
          return;
        }

        const numericIndex = Number.parseInt(input, 10) - 1;

        if (!Number.isNaN(numericIndex) && numericIndex >= 0 && numericIndex < options.length) {
          const selectedValue = options[numericIndex]?.value;

          cleanup();
          stdout.write("\n");

          if (selectedValue) {
            resolve(selectedValue);
            return;
          }

          reject(new Error("selected option is invalid"));
        }
      };

      stdout.write("\u001b[?25l");
      stdout.write(`${sanitizeTerminalText(question)}\n\n`);
      stdin.resume();
      stdin.setEncoding("utf8");
      stdin.setRawMode(true);
      stdin.on("data", onData);
      renderOptions(true);
    });
  }

  private async selectWithoutTty(question: string, options: SelectOption[]): Promise<string> {
    process.stdout.write(`${question}\n`);

    options.forEach((option, index) => {
      process.stdout.write(`  ${index + 1}. ${sanitizeTerminalText(option.label)}\n`);
    });

    while (true) {
      const answer = await this.ask("Choose an option: ");
      const selectedIndex = Number.parseInt(answer, 10) - 1;

      if (!Number.isNaN(selectedIndex) && selectedIndex >= 0 && selectedIndex < options.length) {
        const selectedValue = options[selectedIndex]?.value;

        if (selectedValue) {
          return selectedValue;
        }
      }
    }
  }
}
