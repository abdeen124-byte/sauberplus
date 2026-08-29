const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const editorHtml = read("admin/invoice.html");
const listHtml = read("admin/invoices.html");
const editorJs = read("admin/js/admin-invoice.js");
const listJs = read("admin/js/admin-invoices.js");
const settingsHtml = read("admin/settings.html");
const translations = read("admin/js/admin-i18n.js");
const ui = read("admin/js/admin-ui.js");

for (const field of ["customerName", "customerAddress", "servicePreset", "serviceDate", "grossAmount", "paymentMethod", "invoiceNote"]) {
  assert.match(editorHtml, new RegExp(`id="${field}"`));
}
assert.match(editorHtml, /<details class="invoice-advanced" id="advancedOptions">[\s\S]*Mehr Optionen/i);
assert.match(editorHtml, /id="multipleItems"/);
assert.match(editorHtml, /id="advancedItems"/);
assert.match(editorHtml, /id="invoicePreview"/);
assert.match(editorHtml, /id="issueBtn"/);
assert.match(editorHtml, /id="saveDraftBtn"/);
assert.match(editorHtml, /Unterhaltsreinigung|servicePreset/);

for (const script of [editorJs, listJs]) {
  assert.match(script, /AdminAuth\.requireSession\(\)/);
  assert.match(script, /AdminAuth\.requireRole\(profile, "super_admin"\)/);
}
assert.match(listJs, /rpc\("mark_invoice_paid"/);
assert.match(listJs, /rpc\("cancel_invoice"/);
assert.match(listJs, /rpc\("duplicate_invoice"/);
assert.match(editorJs, /rpc\("save_invoice_draft"/);
assert.match(editorJs, /rpc\("issue_invoice"/);
assert.match(editorJs, /loadBrowserAssets/);
assert.match(editorJs, /archivePdf/);
assert.match(read("admin/js/admin-invoice-pdf.js"), /upsert:\s*false/);

assert.match(listJs, /invoices\.column\.number/);
assert.match(listJs, /invoices\.column\.net/);
assert.match(listJs, /invoices\.column\.gross/);
assert.match(settingsHtml, /id="invoiceSettingsForm"/);
assert.match(settingsHtml, /id="invoiceSettingsCard"[^>]*hidden/);
assert.match(ui, /href=\"invoices\.html\"/);
assert.match(ui, /from\("invoices"\)\.select\("id"\)\.limit\(1\)/);

for (const phrase of ["Rechnungen", "Neue Rechnung", "Mehr Optionen", "الفواتير", "فاتورة جديدة", "خيارات إضافية"]) {
  assert.ok(translations.includes(phrase), `Missing DE/AR phrase: ${phrase}`);
}
assert.match(editorHtml, /name="viewport"/);
assert.match(listHtml, /name="viewport"/);

const quickFormBeforeAdvanced = editorHtml.slice(editorHtml.indexOf("invoice-quick-form"), editorHtml.indexOf("invoice-advanced"));
const visibleBusinessFields = ["customerName", "customerAddress", "servicePreset", "serviceDate", "grossAmount", "paymentMethod", "invoiceNote"];
for (const field of visibleBusinessFields) {
  assert.ok(quickFormBeforeAdvanced.includes(`id="${field}"`));
}

console.log("Invoice quick-flow, authorization, preview, settings, DE/AR, and responsive UI contracts passed.");
