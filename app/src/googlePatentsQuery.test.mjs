import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildGooglePatentsCpcQuery,
  normalizeGooglePatentsClassificationQuery,
} from "./googlePatentsQuery.ts";

test("builds documented Google Patents CPC field syntax", () => {
  assert.equal(
    buildGooglePatentsCpcQuery(["B66B1/2466", "B66B1/2433"]),
    "(CPC=B66B1/2433 OR CPC=B66B1/2466)",
  );
});

test("normalizes a legacy mixed IPC/CPC query to CPC-only syntax", () => {
  assert.equal(
    normalizeGooglePatentsClassificationQuery(
      "IPC=(B66B 1/05 OR B66B 5/16) OR CPC=(B66B1/2433 OR B66B1/2466)",
    ),
    "(CPC=B66B1/2433 OR CPC=B66B1/2466)",
  );
});

test("uses a simple field expression for one CPC symbol", () => {
  assert.equal(
    normalizeGooglePatentsClassificationQuery("CPC=(B66B1/2433)"),
    "CPC=B66B1/2433",
  );
});
