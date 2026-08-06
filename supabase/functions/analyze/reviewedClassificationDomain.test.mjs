import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyReviewedClassificationDomainGate,
  reviewedCpcMainGroups,
} from "./reviewedClassificationDomain.ts";

function keyword(overrides = {}) {
  return {
    ipc: [],
    cpc: [],
    fi: [],
    f_term: [],
    ipc_evidence: [],
    cpc_evidence: [],
    fi_evidence: [],
    f_term_evidence: [],
    ipc_candidates: [],
    cpc_candidates: [],
    fi_candidates: [],
    f_term_candidates: [],
    classification_route: {
      ipc_cpc_area: [],
      fi_subdivisions: [],
    },
    classification_confidence: "low",
    classification_reason: "",
    ...overrides,
  };
}

test("extracts reviewed CPC main groups from Google Patents syntax", () => {
  assert.deepEqual(reviewedCpcMainGroups("CPC=A61B1/267"), ["A61B1"]);
  assert.deepEqual(
    reviewedCpcMainGroups("(CPC=B60L53/126 OR CPC=H02J50/10)"),
    ["B60L53", "H02J50"],
  );
});

test("removes remote generic matches outside the reviewed laryngoscope group", () => {
  const result = {
    keywords: [
      keyword({
        ipc: ["A61B 1/267"],
        cpc: ["A61B 1/267"],
        ipc_evidence: [{ code: "A61B 1/267" }],
        cpc_evidence: [{ code: "A61B 1/267" }],
        classification_route: {
          ipc_cpc_area: [
            { system: "IPC", code: "A61B 1/267" },
            { system: "CPC", code: "A61B 1/267" },
          ],
          fi_subdivisions: [],
        },
        classification_confidence: "medium",
      }),
      keyword({
        cpc: ["B60G 2401/142", "G08B 13/19621"],
        cpc_evidence: [
          { code: "B60G 2401/142" },
          { code: "G08B 13/19621" },
        ],
        classification_route: {
          ipc_cpc_area: [
            { system: "CPC", code: "B60G 2401/142" },
            { system: "CPC", code: "G08B 13/19621" },
          ],
          fi_subdivisions: [],
        },
        classification_confidence: "medium",
      }),
      keyword({
        cpc: ["A61B 5/682", "A61B 17/244"],
        cpc_evidence: [
          { code: "A61B 5/682" },
          { code: "A61B 17/244" },
        ],
        classification_route: {
          ipc_cpc_area: [
            { system: "CPC", code: "A61B 5/682" },
            { system: "CPC", code: "A61B 17/244" },
          ],
          fi_subdivisions: [],
        },
        classification_confidence: "medium",
      }),
    ],
  };

  applyReviewedClassificationDomainGate(result, "CPC=A61B1/267");

  assert.deepEqual(result.keywords[0].ipc, ["A61B 1/267"]);
  assert.deepEqual(result.keywords[0].cpc, ["A61B 1/267"]);
  assert.equal(result.keywords[0].classification_confidence, "medium");

  assert.deepEqual(result.keywords[1].cpc, []);
  assert.deepEqual(result.keywords[1].classification_route.ipc_cpc_area, []);
  assert.equal(result.keywords[1].classification_confidence, "low");
  assert.match(result.keywords[1].classification_reason, /were withheld/);

  assert.deepEqual(result.keywords[2].cpc, []);
  assert.equal(result.keywords[2].classification_confidence, "low");
});

test("retains multiple reviewed main groups for a cross-domain invention", () => {
  const result = {
    keywords: [
      keyword({
        cpc: ["B60L 53/126", "H02J 50/10", "E02F 3/84"],
        cpc_evidence: [
          { code: "B60L 53/126" },
          { code: "H02J 50/10" },
          { code: "E02F 3/84" },
        ],
        classification_route: {
          ipc_cpc_area: [
            { system: "CPC", code: "B60L 53/126" },
            { system: "CPC", code: "H02J 50/10" },
            { system: "CPC", code: "E02F 3/84" },
          ],
          fi_subdivisions: [],
        },
        classification_confidence: "medium",
      }),
    ],
  };

  applyReviewedClassificationDomainGate(
    result,
    "(CPC=B60L53/126 OR CPC=H02J50/10)",
  );

  assert.deepEqual(result.keywords[0].cpc, ["B60L 53/126", "H02J 50/10"]);
  assert.deepEqual(
    result.keywords[0].classification_route.ipc_cpc_area.map((area) => area.code),
    ["B60L 53/126", "H02J 50/10"],
  );
});


test("withholds all classifications when no CPC domain is approved", () => {
  const result = {
    keywords: [
      keyword({
        ipc: ["A61B 1/267"],
        cpc: ["B60G 2401/142"],
        ipc_evidence: [{ code: "A61B 1/267" }],
        cpc_evidence: [{ code: "B60G 2401/142" }],
        classification_route: {
          ipc_cpc_area: [
            { system: "IPC", code: "A61B 1/267" },
            { system: "CPC", code: "B60G 2401/142" },
          ],
          fi_subdivisions: [],
        },
        classification_confidence: "medium",
      }),
    ],
  };

  applyReviewedClassificationDomainGate(result, "");

  assert.deepEqual(result.keywords[0].ipc, []);
  assert.deepEqual(result.keywords[0].cpc, []);
  assert.deepEqual(
    result.keywords[0].classification_route.ipc_cpc_area,
    [],
  );
  assert.equal(result.keywords[0].classification_confidence, "low");
  assert.match(result.keywords[0].classification_reason, /were withheld/);
});
