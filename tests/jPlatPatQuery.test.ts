import { databaseSafeQuery } from "../app/src/queryOutputSafety.ts";
import { buildSearchQueryStarter } from "../app/src/searchQuery.ts";
import type {
  AnalysisResult,
  ClassificationCodeEvidence,
  KeywordClassification,
} from "../app/src/types.ts";

function assertEquals(actual: string, expected: string): void {
  if (actual !== expected) {
    throw new Error(`Expected:\n${expected}\n\nActual:\n${actual}`);
  }
}

function assertIncludes(actual: string, expectedPart: string): void {
  if (!actual.includes(expectedPart)) {
    throw new Error(`Expected query to include ${expectedPart}:\n${actual}`);
  }
}

function makeKeyword(
  rank: number,
  term: string,
  synonyms: string[],
  evidence: {
    ipc?: ClassificationCodeEvidence[];
    fi?: ClassificationCodeEvidence[];
    fTerm?: ClassificationCodeEvidence[];
  } = {},
): KeywordClassification {
  return {
    term,
    normalized_term: term,
    synonyms,
    concept_facets: ["object_or_system"],
    concept_basis: [term],
    source_evidence: [term],
    count: 1,
    rank,
    ipc: [],
    cpc: [],
    fi: [],
    f_term: [],
    ipc_evidence: evidence.ipc,
    fi_evidence: evidence.fi,
    f_term_evidence: evidence.fTerm,
    classification_route: {
      ipc_cpc_area: [],
      fi_subdivisions: [],
    },
    classification_confidence: "high",
    reason: `Regression-test keyword ${term}`,
    classification_reason: `Regression-test classification for ${term}`,
  };
}

function makeAnalysis(keywords: KeywordClassification[]): AnalysisResult {
  return {
    language: "en",
    technical_concept: {
      object_or_system: "data protection system",
      purpose_or_problem: "protect private data",
      application_or_use: "information security",
      components: ["server"],
      component_relationships: ["server protects data"],
      material_or_composition: [],
      manufacturing_or_processing_steps: [],
      operation: "controls access",
      control_means: ["access control"],
      controlled_variables: ["data access"],
      operating_conditions: [],
      technical_effect: "reduced unauthorized access",
      context_terms: ["private data"],
      search_phrases: ["private data server"],
    },
    keywords,
  };
}

function jPlatPatStrategies(result: AnalysisResult) {
  const database = buildSearchQueryStarter(result).databases?.find(
    (candidate) => candidate.id === "j_platpat",
  );

  if (!database) {
    throw new Error("J-PlatPat strategies were not generated.");
  }

  return database.strategies;
}

Deno.test("J-PlatPat broad query uses +, *, /TX, and safe literal hyphens", () => {
  const strategies = jPlatPatStrategies(
    makeAnalysis([
      makeKeyword(1, "private data", ["confidential data", "protected data"]),
      makeKeyword(2, "private data server", [
        "private data servers",
        "local private-data server",
      ]),
    ]),
  );

  const broad = databaseSafeQuery("j_platpat", strategies[0].query);

  assertEquals(
    broad,
    "[('private data'+'confidential data'+'protected data')/TX]*[('private data server'+'private data servers'+'local private－data server')/TX]",
  );
});

Deno.test("J-PlatPat balanced query appends verified FI with /FI", () => {
  const verified: ClassificationCodeEvidence = {
    code: "G06F 21/62",
    status: "database_verified",
  };
  const strategies = jPlatPatStrategies(
    makeAnalysis([
      makeKeyword(1, "private data", ["confidential data"], { fi: [verified] }),
      makeKeyword(2, "access control", ["authorization"]),
    ]),
  );

  const balanced = databaseSafeQuery("j_platpat", strategies[1].query);
  assertIncludes(balanced, "*[(G06F21/62)/FI]");
});

Deno.test("J-PlatPat balanced query falls back to verified IPC with /IP", () => {
  const verified: ClassificationCodeEvidence = {
    code: "G06F 21/62",
    status: "database_verified",
  };
  const strategies = jPlatPatStrategies(
    makeAnalysis([
      makeKeyword(1, "private data", ["confidential data"], { ipc: [verified] }),
      makeKeyword(2, "access control", ["authorization"]),
    ]),
  );

  const balanced = databaseSafeQuery("j_platpat", strategies[1].query);
  assertIncludes(balanced, "*[(G06F21/62)/IP]");
});

Deno.test("J-PlatPat precision query appends verified F-term with /FT", () => {
  const fi: ClassificationCodeEvidence = {
    code: "G06F 21/62",
    status: "database_verified",
  };
  const fTerm: ClassificationCodeEvidence = {
    code: "5B285 AA01",
    status: "database_verified",
  };
  const strategies = jPlatPatStrategies(
    makeAnalysis([
      makeKeyword(1, "private data", ["confidential data"], {
        fi: [fi],
        fTerm: [fTerm],
      }),
      makeKeyword(2, "access control", ["authorization"]),
    ]),
  );

  const precision = databaseSafeQuery("j_platpat", strategies[2].query);
  assertIncludes(precision, "*[(G06F21/62)/FI]");
  assertIncludes(precision, "*[(5B285AA01)/FT]");
});

Deno.test("J-PlatPat safety conversion does not alter other databases", () => {
  assertEquals(
    databaseSafeQuery("google_patents", "local private-data server"),
    "local private-data server",
  );
  assertEquals(
    databaseSafeQuery("j_platpat", "local private-data server"),
    "local private－data server",
  );
});
