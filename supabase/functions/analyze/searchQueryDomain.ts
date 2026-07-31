export type SearchQueryDomainSystem = "IPC" | "CPC";

export interface SearchQueryDomainCandidate {
  system: SearchQueryDomainSystem;
  code: string;
  title_en?: string | null;
  title_ja?: string | null;
}

export interface SearchQueryDomainConcept {
  object_or_system: string;
  application_or_use: string;
  context_terms: string[];
  search_phrases: string[];
}

export function buildGooglePatentsCpcQuery(
  codes: Record<SearchQueryDomainSystem, string[]>,
): string {
  const compactCodes = Array.from(
    new Set(
      codes.CPC
        .map((code) =>
          code.normalize("NFKC").toUpperCase().replace(/[^A-Z0-9/]/g, ""),
        )
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));

  if (compactCodes.length === 0) return "";
  if (compactCodes.length === 1) return `CPC=${compactCodes[0]}`;

  return `(${compactCodes.map((code) => `CPC=${code}`).join(" OR ")})`;
}

interface DomainPrefixScore {
  prefix: string;
  codeKeys: Set<string>;
  systems: Set<SearchQueryDomainSystem>;
  anchorKeys: Set<string>;
  anchoredCodeKeys: Set<string>;
}

const DOMAIN_NEUTRAL_TOKENS = new Set([
  "apparatus",
  "component",
  "control",
  "controlled",
  "controller",
  "device",
  "drive",
  "driven",
  "effect",
  "element",
  "include",
  "including",
  "means",
  "method",
  "normal",
  "object",
  "operation",
  "presence",
  "procedure",
  "safety",
  "sensor",
  "signal",
  "speed",
  "system",
  "target",
  "technical",
  "unit",
  "use",
  "using",
  "value",
]);

function tokenFamilyKey(token: string): string {
  const normalized = token.normalize("NFKC").trim().toLowerCase();

  if (!/^[a-z][a-z0-9-]*$/u.test(normalized) || normalized.length <= 3) {
    return normalized;
  }

  if (normalized.endsWith("ies") && normalized.length > 4) {
    return `${normalized.slice(0, -3)}y`;
  }

  if (
    (normalized.endsWith("sses") ||
      normalized.endsWith("ches") ||
      normalized.endsWith("shes") ||
      normalized.endsWith("xes") ||
      normalized.endsWith("zes")) &&
    normalized.length > 4
  ) {
    return normalized.slice(0, -2);
  }

  if (normalized.endsWith("s") && !normalized.endsWith("ss")) {
    return normalized.slice(0, -1);
  }

  return normalized;
}

function domainTokens(text: string): string[] {
  const normalized = text.normalize("NFKC").toLowerCase();
  const latinTokens = normalized.match(/[a-z0-9][a-z0-9-]{2,}/g) ?? [];
  const japaneseRuns =
    normalized.match(/[\u3040-\u30ff\u3400-\u9fff]{2,}/g) ?? [];
  const japaneseBigrams = japaneseRuns.flatMap((run) =>
    Array.from({ length: Math.max(0, run.length - 1) }, (_, index) =>
      run.slice(index, index + 2),
    ),
  );

  return Array.from(new Set([...latinTokens, ...japaneseBigrams]));
}

function domainAnchorKeys(concept: SearchQueryDomainConcept): Set<string> {
  return new Set(
    [
      concept.object_or_system,
      concept.application_or_use,
      ...concept.context_terms,
      ...concept.search_phrases,
    ]
      .flatMap(domainTokens)
      .filter((token) => !DOMAIN_NEUTRAL_TOKENS.has(token))
      .map(tokenFamilyKey)
      .filter((token) => Boolean(token) && !/^\d+$/u.test(token)),
  );
}

function classificationSubclassPrefix(code: string): string {
  const match = code
    .normalize("NFKC")
    .toUpperCase()
    .match(/^\s*([A-H]\d{2}[A-Z])/u);

  return match?.[1] ?? "";
}

function normalizedCodeKey(
  system: SearchQueryDomainSystem,
  code: string,
): string {
  return `${system}:${code.toUpperCase().replace(/[^A-Z0-9]/g, "")}`;
}

function candidateTitleKeys(candidate: SearchQueryDomainCandidate): Set<string> {
  return new Set(
    domainTokens(`${candidate.title_en ?? ""} ${candidate.title_ja ?? ""}`)
      .map(tokenFamilyKey)
      .filter(Boolean),
  );
}

function scoreDomainPrefix(score: DomainPrefixScore): number {
  return (
    score.codeKeys.size +
    score.systems.size +
    score.anchorKeys.size * 4 +
    score.anchoredCodeKeys.size * 3
  );
}

/**
 * Limits query-review options to the document's dominant classification
 * neighborhood. Catalog membership alone is insufficient: at least one
 * classification title must agree with a document-level domain anchor when
 * such an anchor is available.
 */
export function filterClassificationCodesByDomain(
  candidates: SearchQueryDomainCandidate[],
  concept: SearchQueryDomainConcept,
): {
  codes: Record<SearchQueryDomainSystem, string[]>;
  dominantPrefixes: string[];
} {
  const uniqueCandidates = new Map<string, SearchQueryDomainCandidate>();

  for (const candidate of candidates) {
    const prefix = classificationSubclassPrefix(candidate.code);
    const key = normalizedCodeKey(candidate.system, candidate.code);

    if (prefix && candidate.code.trim() && !uniqueCandidates.has(key)) {
      uniqueCandidates.set(key, {
        ...candidate,
        code: candidate.code.trim(),
      });
    }
  }

  const anchorKeys = domainAnchorKeys(concept);
  const scores = new Map<string, DomainPrefixScore>();

  for (const [codeKey, candidate] of uniqueCandidates) {
    const prefix = classificationSubclassPrefix(candidate.code);
    const titleKeys = candidateTitleKeys(candidate);
    const matchingAnchorKeys = Array.from(anchorKeys).filter((anchor) =>
      titleKeys.has(anchor),
    );
    const score = scores.get(prefix) ?? {
      prefix,
      codeKeys: new Set<string>(),
      systems: new Set<SearchQueryDomainSystem>(),
      anchorKeys: new Set<string>(),
      anchoredCodeKeys: new Set<string>(),
    };

    score.codeKeys.add(codeKey);
    score.systems.add(candidate.system);
    matchingAnchorKeys.forEach((anchor) => score.anchorKeys.add(anchor));

    if (matchingAnchorKeys.length > 0) {
      score.anchoredCodeKeys.add(codeKey);
    }

    scores.set(prefix, score);
  }

  const ranked = Array.from(scores.values()).sort((a, b) => {
    const scoreDifference = scoreDomainPrefix(b) - scoreDomainPrefix(a);
    return scoreDifference || a.prefix.localeCompare(b.prefix);
  });
  const anchored = ranked.filter((score) => score.anchorKeys.size > 0);
  const dominantPool = anchored.length > 0 ? anchored : ranked;
  const topScore =
    dominantPool.length > 0 ? scoreDomainPrefix(dominantPool[0]) : 0;
  const dominantPrefixes = dominantPool
    .filter(
      (score, index) =>
        index < 2 &&
        (index === 0 || scoreDomainPrefix(score) >= topScore * 0.5),
    )
    .map((score) => score.prefix);
  const allowedPrefixes = new Set(dominantPrefixes);
  const codes: Record<SearchQueryDomainSystem, string[]> = {
    IPC: [],
    CPC: [],
  };

  for (const candidate of uniqueCandidates.values()) {
    if (allowedPrefixes.has(classificationSubclassPrefix(candidate.code))) {
      codes[candidate.system].push(candidate.code);
    }
  }

  codes.IPC.sort((a, b) => a.localeCompare(b));
  codes.CPC.sort((a, b) => a.localeCompare(b));

  return { codes, dominantPrefixes };
}
