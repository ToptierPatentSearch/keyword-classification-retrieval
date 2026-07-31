import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildDomainFilteredClassificationQuery,
  filterClassificationCodesByDomain,
} from "./searchQueryDomain.ts";

test("keeps the elevator domain and removes remote generic matches", () => {
  const result = filterClassificationCodesByDomain(
    [
      {
        system: "IPC",
        code: "B66B 1/00",
        title_en: "Control systems of elevators in general",
      },
      {
        system: "IPC",
        code: "B66B 5/00",
        title_en: "Applications of safety devices in elevators",
      },
      {
        system: "IPC",
        code: "E02F 3/84",
        title_en: "Drives or control devices therefor",
      },
      {
        system: "IPC",
        code: "B23D 41/08",
        title_en: "of drives; of control devices",
      },
      {
        system: "CPC",
        code: "B66B1/00",
        title_en: "Control systems of elevators in general",
      },
      {
        system: "CPC",
        code: "B66B5/00",
        title_en: "Applications of safety devices in elevators",
      },
      {
        system: "CPC",
        code: "D05B35/102",
        title_en: "Edge guide control systems with edge sensors",
      },
    ],
    {
      object_or_system: "elevator system with safety control device",
      application_or_use: "elevator car operation in an elevator shaft",
      context_terms: ["elevator control", "object detection"],
      search_phrases: ["sensor detecting an object in an elevator shaft"],
    },
  );

  assert.deepEqual(result.dominantPrefixes, ["B66B"]);
  assert.deepEqual(result.codes.IPC, ["B66B 1/00", "B66B 5/00"]);
  assert.deepEqual(result.codes.CPC, ["B66B1/00", "B66B5/00"]);
  assert.equal(
    buildDomainFilteredClassificationQuery(result.codes),
    "IPC=(B66B 1/00 OR B66B 5/00) OR CPC=(B66B1/00 OR B66B5/00)",
  );
});

test("retains a second strongly anchored domain for a cross-domain invention", () => {
  const result = filterClassificationCodesByDomain(
    [
      {
        system: "IPC",
        code: "B60L 53/12",
        title_en: "Inductive charging of electric vehicles",
      },
      {
        system: "CPC",
        code: "B60L53/126",
        title_en: "Inductive charging of electric vehicles",
      },
      {
        system: "IPC",
        code: "H02J 50/10",
        title_en: "Circuit arrangements for inductive wireless power transfer",
      },
      {
        system: "CPC",
        code: "H02J50/10",
        title_en: "Inductive wireless power transfer",
      },
      {
        system: "IPC",
        code: "E02F 3/84",
        title_en: "Drives or control devices therefor",
      },
    ],
    {
      object_or_system:
        "wireless inductive charging system for an electric vehicle",
      application_or_use: "wireless power transfer to an electric vehicle",
      context_terms: ["inductive charging", "vehicle charging"],
      search_phrases: ["wireless power transfer for electric vehicles"],
    },
  );

  assert.deepEqual(result.dominantPrefixes, ["H02J", "B60L"]);
  assert.deepEqual(result.codes.IPC, ["B60L 53/12", "H02J 50/10"]);
  assert.deepEqual(result.codes.CPC, ["B60L53/126", "H02J50/10"]);
  assert.equal(
    buildDomainFilteredClassificationQuery(result.codes),
    "IPC=(B60L 53/12 OR H02J 50/10) OR CPC=(B60L53/126 OR H02J50/10)",
  );
});
