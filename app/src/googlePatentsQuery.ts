function compactClassificationCode(value: string): string {
  return value
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[^A-Z0-9/]/g, "");
}

function uniqueCompactCpcCodes(codes: string[]): string[] {
  return Array.from(
    new Set(
      codes
        .map(compactClassificationCode)
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));
}

export function buildGooglePatentsCpcQuery(codes: string[]): string {
  const compactCodes = uniqueCompactCpcCodes(codes);

  if (compactCodes.length === 0) {
    return "";
  }

  if (compactCodes.length === 1) {
    return `CPC=${compactCodes[0]}`;
  }

  return `(${compactCodes.map((code) => `CPC=${code}`).join(" OR ")})`;
}

export function normalizeGooglePatentsClassificationQuery(
  query: string,
): string {
  const cpcCodes: string[] = [];

  for (const block of query.matchAll(/CPC\s*=\s*\(([^()]*)\)/gi)) {
    cpcCodes.push(
      ...block[1]
        .split(/\s+OR\s+/i)
        .map((code) => code.trim())
        .filter(Boolean),
    );
  }

  const queryWithoutBlocks = query.replace(/CPC\s*=\s*\([^()]*\)/gi, "");

  for (const match of queryWithoutBlocks.matchAll(
    /CPC\s*=\s*([A-HY]\d{2}[A-Z]\s*\d+(?:\s*\/\s*\d+)?)/gi,
  )) {
    cpcCodes.push(match[1]);
  }

  return buildGooglePatentsCpcQuery(cpcCodes);
}
