const ANSI_ESCAPE_PATTERN =
  /[\u001b\u009b][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;
const CONTROL_PATTERN = /[\u0000-\u001f\u007f-\u009f]/g;

export function sanitizeTerminalText(input: string): string {
  const sanitizedValue = input.replace(ANSI_ESCAPE_PATTERN, "").replace(CONTROL_PATTERN, "").trim();

  if (sanitizedValue) {
    return sanitizedValue;
  }

  return "<invalid>";
}

export function fitTerminalLine(input: string, width: number): string {
  const sanitizedValue = sanitizeTerminalText(input);

  if (width <= 0) {
    return "";
  }

  if (sanitizedValue.length <= width) {
    return sanitizedValue;
  }

  if (width <= 3) {
    return ".".repeat(width);
  }

  return `${sanitizedValue.slice(0, width - 3)}...`;
}
