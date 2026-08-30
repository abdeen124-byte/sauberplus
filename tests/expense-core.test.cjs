"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../admin/js/admin-expense-core.js");

test("German gross 51,20 at 19% produces exact cents", () => {
  assert.equal(core.parseMoney("51,20"), 5120);
  assert.deepEqual(core.totalsFromGross(5120, 1900), { subtotalCents: 4303, taxCents: 817, totalCents: 5120, rateBps: 1900 });
});

test("supports 7%, 0%, and mixed VAT without floating point money", () => {
  assert.deepEqual(core.totalsFromGross(1070, 700), { subtotalCents: 1000, taxCents: 70, totalCents: 1070, rateBps: 700 });
  assert.deepEqual(core.totalsFromGross(1000, 0), { subtotalCents: 1000, taxCents: 0, totalCents: 1000, rateBps: 0 });
  const mixed = core.normalizeMixedRows([{ rateBps: 1900, gross: "11,90" }, { rateBps: 700, gross: "10,70" }]);
  assert.deepEqual({ net: mixed.subtotalCents, tax: mixed.taxCents, gross: mixed.totalCents }, { net: 2000, tax: 260, gross: 2260 });
});

test("rejects malformed and excessive monetary input", () => {
  ["", "-1", "1,234", "1.2.3", "EUR 5", "9999999999999"].forEach((value) => assert.throws(() => core.parseMoney(value), /INVALID_MONEY/));
});

test("partner contribution status is independent from expense advances", () => {
  assert.equal(core.contributionState(30000, 21000), "partial");
  assert.equal(core.contributionState(21000, 21000), "complete");
  assert.equal(core.contributionState(null, 6000), "no_target");
});
