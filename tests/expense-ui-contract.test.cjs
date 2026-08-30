"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

test("Super Admin finance pages expose quick receipt, ledger, and partner workflows", () => {
  const expense = read("admin/expense.html");
  assert.match(expense, /capture="environment"/);
  assert.match(expense, /id="receiptSteps"/);
  assert.match(expense, /id="paidByPartner"/);
  assert.match(expense, /id="mixedTax"/);
  assert.match(read("admin/expenses.html"), /id="financeSummary"/);
  assert.match(read("admin/partners.html"), /id="partnerSummary"/);
  assert.match(read("admin/js/admin-expenses.js"), /data-receipt-path/);
  assert.match(read("admin/js/admin-expenses.js"), /finalize_expense_draft/);
  assert.match(read("admin/js/admin-partners.js"), /reverse_partner_transaction/);
});

test("DE and AR translations plus RTL-aware finance CSS are present", () => {
  const i18n = read("admin/js/admin-i18n.js");
  assert.match(i18n, /expenses: "Ausgaben"/);
  assert.match(i18n, /expenses: "المصروفات"/);
  const css = read("admin/css/admin.css");
  assert.match(css, /html\[dir=rtl\] \.finance-page/);
  assert.match(css, /@media\(max-width:680px\)/);
});

test("receipt extraction API is authenticated and explicit about manual fallback", () => {
  const api = read("api/expense-extract.js");
  assert.match(api, /auth\/v1\/user/);
  assert.match(api, /role === "super_admin"/);
  assert.match(api, /manualFallback: true/);
  assert.match(api, /LocalTesseractReceiptExtractionProvider/);
  assert.match(api, /provider: "local_tesseract"/);
  assert.doesNotMatch(api, /SERVICE_ROLE/);
});
