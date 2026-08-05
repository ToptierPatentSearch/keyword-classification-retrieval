export type DisplayClassificationSystem =
  | "IPC"
  | "CPC"
  | "FI"
  | "F-term"
  | string;

export function formatClassificationCodeForDisplay(
  code: string,
  system?: DisplayClassificationSystem,
): string {
  const trimmed = code.trim();

  if (system !== "IPC" && system !== "CPC") {
    return trimmed;
  }

  const compact = trimmed.replace(/\s+/g, "");
  const match = compact.match(/^([A-HY]\d{2}[A-Z])(\d+\/[0-9A-Z]+)$/i);

  return match ? `${match[1].toUpperCase()} ${match[2]}` : trimmed;
}

export function removeWhitespaceAfterDoubleQuotes(value: string): string {
  return value
    .replace(/“\s+/g, "“")
    .replace(/”\s+/g, "”")
    .replace(/"\s+/g, '"');
}
