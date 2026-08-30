"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeExtraction, parseOcrText, DisabledReceiptExtractionProvider, LocalTesseractReceiptExtractionProvider } = require("../server/expense-extraction-core.js");

test("normalizes untrusted extraction output", () => {
  const result = normalizeExtraction({ supplier_name: "  Händler\u0000 GmbH ", expense_date: "2026-08-30", total_cents: 5120, subtotal_cents: 4303, tax_cents: 817, tax_rate_bps: 1900, category_code: "office", payment_method: "card", confidence: 92, warnings: [] });
  assert.equal(result.supplier_name, "Händler GmbH");
  assert.equal(result.total_cents, 5120);
  assert.equal(result.confidence, 92);
});

test("does not silently trust inconsistent AI tax values", () => {
  const result = normalizeExtraction({ total_cents: 5120, subtotal_cents: 4000, tax_cents: 817, expense_date: "not-a-date" });
  assert.equal(result.subtotal_cents, null);
  assert.ok(result.warnings.includes("tax_totals_need_review"));
  assert.ok(result.warnings.includes("date_needs_review"));
});

test("external extraction remains privacy-safe until explicitly approved", async () => {
  assert.deepEqual(await new DisabledReceiptExtractionProvider().extract(), { available: false, reason: "EXTERNAL_PROCESSING_NOT_APPROVED" });
});

test("local OCR text is mapped to reviewable German accounting fields", () => {
  const result = parseOcrText("METRO Deutschland GmbH\nBeleg Nr. A-1234\nDatum 30.08.2026\nGesamt 51,20 EUR\nMwSt. 19 %\nGirocard", 88);
  assert.equal(result.supplier_name, "METRO Deutschland GmbH");
  assert.equal(result.expense_date, "2026-08-30");
  assert.equal(result.total_cents, 5120);
  assert.equal(result.subtotal_cents, 4303);
  assert.equal(result.tax_cents, 817);
  assert.equal(result.payment_method, "card");
  assert.equal(typeof LocalTesseractReceiptExtractionProvider, "function");
});
