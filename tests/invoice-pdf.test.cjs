const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const PDFLib = require("../admin/js/vendor/pdf-lib.min.js");
require("../admin/js/vendor/bidi-shaper.js");
const invoicePdf = require("../admin/js/admin-invoice-pdf.js");

const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "test-results");
fs.mkdirSync(outputDir, { recursive: true });

const shapedArabic = globalThis.BidiShaper.render("مرحبا بالعالم");
assert.notEqual(shapedArabic, "مرحبا بالعالم");
assert.match(shapedArabic, /[\uFB50-\uFDFF\uFE70-\uFEFF]/);
assert.ok(globalThis.BidiShaper.render("السعر: 123.45").includes("123.45"));

const invoice = {
  id: "11111111-1111-4111-8111-111111111111",
  invoice_number: "SP-2026-0001",
  status: "open",
  invoice_date: "2026-08-28",
  service_date: "2026-08-28",
  payment_terms: "zahlbar nach Erhalt",
  payment_method: "bank_transfer",
  subtotal_cents: 4303,
  vat_bps: 1900,
  vat_cents: 817,
  total_cents: 5120,
  notes: "Vielen Dank für Ihren Auftrag.",
  customer_snapshot: {
    display_name: "Erika Muster",
    street_address: "Musterweg 12",
    postal_code: "42699",
    city: "Solingen"
  },
  issuer_snapshot: {
    legal_name: "SauberPlus Reinigungsservice GbR",
    street_address: "Herzogstraße 48",
    postal_code: "42699",
    city: "Solingen",
    phone: "+49 0000 000000",
    email: "rechnung@example.invalid",
    website: "www.sauberplus.plus",
    tax_number: "TEST-128-5940",
    account_holder: "SauberPlus Test",
    iban: "TEST-IBAN-NICHT-PRODUKTIV"
  }
};

const items = [{
  position: 1,
  description: "Einmalige Unterhaltsreinigung von Bad und Küche",
  details: "Ausgeführt von zwei Personen, Arbeitszeit vor Ort: 14:14-15:16 Uhr",
  quantity_milli: 1000,
  unit: "flat_rate",
  custom_unit: null,
  unit_price_net_cents: 4303,
  line_total_net_cents: 4303,
  line_total_gross_cents: 5120
}];

(async () => {
  const assets = {
    logoBytes: fs.readFileSync(path.join(root, "mitarbeiter/icons/sauberplus-192.png")),
    fontBytes: fs.readFileSync(path.join(root, "admin/fonts/NotoSansArabic-Regular.ttf"))
  };
  const result = await invoicePdf.buildInvoicePdf(invoice, items, assets);
  assert.ok(result.bytes.length > 20000, "PDF must contain vector/text content and embedded assets");
  assert.equal(Buffer.from(result.bytes.slice(0, 5)).toString("ascii"), "%PDF-");
  assert.equal(result.fileName, "SP-2026-0001.pdf");
  assert.equal(result.storagePath, "invoices/11111111-1111-4111-8111-111111111111/SP-2026-0001.pdf");
  const loaded = await PDFLib.PDFDocument.load(result.bytes);
  assert.equal(loaded.getPageCount(), result.pageCount);
  assert.equal(loaded.getTitle(), "Rechnung SP-2026-0001");
  assert.equal(loaded.getAuthor(), "SauberPlus Reinigungsservice GbR");
  const hash = await invoicePdf.sha256Hex(result.bytes);
  assert.match(hash, /^[0-9a-f]{64}$/);
  let recordedHash = null;
  const retryClient = {
    storage: {
      from(bucketName) {
        assert.equal(bucketName, "invoice-pdfs");
        return {
          async upload(_storagePath, _bytes, options) {
            assert.equal(options.upsert, false);
            return { error: { message: "Already exists" } };
          },
          async download() {
            return { data: new Blob([result.bytes], { type: "application/pdf" }), error: null };
          }
        };
      }
    },
    async rpc(name, params) {
      assert.equal(name, "record_invoice_pdf");
      recordedHash = params.p_sha256;
      return { data: { ...invoice, pdf_storage_path: params.p_storage_path, pdf_sha256: params.p_sha256 }, error: null };
    }
  };
  const archived = await invoicePdf.archivePdf(retryClient, invoice, result);
  assert.equal(recordedHash, hash);
  assert.equal(archived.pdf_storage_path, result.storagePath);

  const conflictingClient = {
    storage: {
      from() {
        return {
          async upload() { return { error: { message: "Already exists" } }; },
          async download() { return { data: new Blob([Uint8Array.from([1, 2, 3])]), error: null }; }
        };
      }
    }
  };
  await assert.rejects(() => invoicePdf.archivePdf(conflictingClient, invoice, result), /immutable PDF already exists/i);
  const output = path.join(outputDir, "sauberplus-invoice-reference-local.pdf");
  fs.writeFileSync(output, result.bytes);
  const arabicInvoice = {
    ...invoice,
    id: "22222222-2222-4222-8222-222222222222",
    invoice_number: "SP-2026-0002",
    notes: "شكرًا لتكليفكم لنا بأعمال التنظيف.",
    customer_snapshot: {
      display_name: "شركة النظافة الحديثة",
      street_address: "شارع المثال 12",
      postal_code: "42699",
      city: "زولينغن"
    }
  };
  const arabicItems = [{ ...items[0], description: "تنظيف وصيانة المكاتب", details: "خدمة تنظيف احترافية" }];
  const arabicResult = await invoicePdf.buildInvoicePdf(arabicInvoice, arabicItems, assets);
  assert.ok(arabicResult.bytes.length > 20000, "Arabic PDF must embed its Unicode font and remain searchable text");
  assert.equal((await PDFLib.PDFDocument.load(arabicResult.bytes)).getPageCount(), 1);
  fs.writeFileSync(path.join(outputDir, "sauberplus-invoice-arabic-local.pdf"), arabicResult.bytes);
  console.log(`Invoice PDF creation passed for German and Arabic: ${output}`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
