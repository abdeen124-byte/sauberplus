const assert = require("node:assert/strict");
const core = require("../admin/js/admin-invoice-core.js");

assert.equal(core.parseMoneyToCents("51,20"), 5120);
assert.equal(core.parseMoneyToCents("51.20"), 5120);
assert.equal(core.parseMoneyToCents("51"), 5100);
assert.throws(() => core.parseMoneyToCents("51,201"), /INVALID_MONEY/);
assert.throws(() => core.parseMoneyToCents("1,234.56"), /INVALID_MONEY/);
assert.throws(() => core.parseMoneyToCents("5.12e1"), /INVALID_MONEY/);
assert.throws(() => core.parseMoneyToCents("-1,00"), /INVALID_MONEY/);
assert.throws(() => core.parseMoneyToCents("Infinity"), /INVALID_MONEY/);

assert.deepEqual(core.calculateFromGross(5120, 1900), {
  subtotalCents: 4303,
  vatCents: 817,
  totalCents: 5120
});

assert.deepEqual(core.calculateFromNet(4303, 1900), {
  subtotalCents: 4303,
  vatCents: 818,
  totalCents: 5121
});

assert.equal(core.parseQuantityToMilli("1,5"), 1500);
assert.equal(core.parseQuantityToMilli("2.125"), 2125);
assert.throws(() => core.parseQuantityToMilli("1,2345"), /INVALID_QUANTITY/);

const multiple = core.calculateNetItems([
  { description: "Büroreinigung", details: "", quantity: "2", unit: "hour", unitPriceNet: "10,00" },
  { description: "Fensterreinigung", details: "2 Etagen", quantity: "1,5", unit: "hour", unitPriceNet: "20,00" }
], 1900);
assert.equal(multiple.items.length, 2);
assert.equal(multiple.items[0].line_total_net_cents, 2000);
assert.equal(multiple.items[1].line_total_net_cents, 3000);
assert.deepEqual(multiple.totals, { subtotalCents: 5000, vatCents: 950, totalCents: 5950 });

const fractionalVat = core.calculateNetItems([
  { description: "Position 1", details: "", quantity: "1", unit: "piece", unitPriceNet: "0,03" },
  { description: "Position 2", details: "", quantity: "1", unit: "piece", unitPriceNet: "0,03" }
], 1900);
assert.deepEqual(fractionalVat.totals, { subtotalCents: 6, vatCents: 1, totalCents: 7 });

assert.deepEqual(core.SERVICE_PRESETS, [
  "Unterhaltsreinigung",
  "Grundreinigung",
  "Fensterreinigung",
  "Büroreinigung",
  "Treppenhausreinigung",
  "Endreinigung",
  "Sonstige"
]);

const start = process.hrtime.bigint();
for (let index = 0; index < 10000; index += 1) {
  core.calculateFromGross(5120, 1900);
}
const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
assert.ok(elapsedMs < 30000, `Quick invoice calculations exceeded 30 seconds: ${elapsedMs}ms`);

console.log("Invoice money, VAT, multiple-item, and quick-flow calculations passed.");
