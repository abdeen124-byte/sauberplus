"use strict";

const MAX_TEXT = 500;
const ALLOWED_METHODS = new Set(["bank_transfer", "cash", "card", "direct_debit", "other", "unknown"]);
const ALLOWED_RATES = new Set([0, 700, 1900]);

function cleanText(value, maximum = MAX_TEXT) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maximum);
}

function integer(value, minimum, maximum) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

function normalizeExtraction(raw) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const totalCents = integer(source.total_cents, 1, 999999999999);
  const subtotalCents = integer(source.subtotal_cents, 0, 999999999999);
  const taxCents = integer(source.tax_cents, 0, 999999999999);
  const rate = integer(source.tax_rate_bps, 0, 1900);
  const validTotals = totalCents !== null && subtotalCents !== null && taxCents !== null && totalCents === subtotalCents + taxCents;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(source.expense_date || "")) ? source.expense_date : null;
  const warnings = Array.isArray(source.warnings) ? source.warnings.map((item) => cleanText(item, 160)).filter(Boolean).slice(0, 8) : [];
  if (!validTotals && totalCents !== null) warnings.push("tax_totals_need_review");
  if (!date) warnings.push("date_needs_review");
  return {
    supplier_name: cleanText(source.supplier_name, 180),
    supplier_document_number: cleanText(source.supplier_document_number, 120),
    expense_date: date,
    description: cleanText(source.description, 500),
    category_code: /^[a-z0-9_]{2,50}$/.test(String(source.category_code || "")) ? source.category_code : "other",
    total_cents: totalCents,
    subtotal_cents: validTotals ? subtotalCents : null,
    tax_cents: validTotals ? taxCents : null,
    tax_rate_bps: ALLOWED_RATES.has(rate) ? rate : null,
    payment_method: ALLOWED_METHODS.has(source.payment_method) ? source.payment_method : "unknown",
    confidence: integer(source.confidence, 0, 100) ?? 0,
    warnings: [...new Set(warnings)]
  };
}

class DisabledReceiptExtractionProvider {
  async extract() {
    return { available: false, reason: "EXTERNAL_PROCESSING_NOT_APPROVED" };
  }
}

function moneyToCents(value) {
  const normalized = String(value || "").replace(/\s/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  if (!/^\d{1,9}(?:\.\d{2})$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

function totalsFromGross(totalCents, rateBps) {
  if (!Number.isSafeInteger(totalCents) || !ALLOWED_RATES.has(rateBps)) return { subtotal_cents: null, tax_cents: null };
  const denominator = 10000 + rateBps;
  const subtotal = Math.floor((totalCents * 10000 + Math.floor(denominator / 2)) / denominator);
  return { subtotal_cents: subtotal, tax_cents: totalCents - subtotal };
}

function extractAmount(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const priority = lines.filter((line) => /\b(gesamt|summe|total|endbetrag|brutto)\b/i.test(line));
  const values = (priority.length ? priority : lines).flatMap((line) => (line.match(/\d{1,6}(?:[.\s]\d{3})*[,.]\d{2}/g) || []).map(moneyToCents)).filter(Number.isSafeInteger);
  return values.length ? Math.max(...values) : null;
}

function parseOcrText(text, ocrConfidence) {
  const normalizedText = cleanText(String(text || "").replace(/\r?\n/g, "\n"), 12000);
  const lines = String(text || "").split(/\r?\n/).map((line) => cleanText(line, 180)).filter((line) => line.length > 2);
  const supplier = lines.find((line) => !/^(rechnung|kassenbon|beleg|quittung|datum|steuer)/i.test(line) && !/^\d/.test(line)) || "";
  const europeanDate = String(text || "").match(/\b(\d{2})[./-](\d{2})[./-](20\d{2})\b/);
  const isoDate = String(text || "").match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  const expenseDate = isoDate ? `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}` : europeanDate ? `${europeanDate[3]}-${europeanDate[2]}-${europeanDate[1]}` : null;
  const total = extractAmount(String(text || ""));
  const has19 = /\b19\s*%/.test(text); const has7 = /\b7\s*%/.test(text); const rate = has19 && has7 ? null : has19 ? 1900 : has7 ? 700 : /\b0\s*%/.test(text) ? 0 : null;
  const totals = totalsFromGross(total, rate);
  const documentMatch = String(text || "").match(/(?:rechnung|beleg|bon|quittung)(?:s)?(?:nummer|nr\.?|\s*#)?\s*[:#]?\s*([A-Z0-9][A-Z0-9\-/]{2,})/i);
  const lower = normalizedText.toLowerCase();
  const category = /diesel|benzin|tank|kraftstoff/.test(lower) ? "vehicles_fuel" : /reiniger|reinigung|desinfektion|waschmittel/.test(lower) ? "cleaning_supplies" : /werkzeug|bohrer|maschine/.test(lower) ? "tools" : /software|abo|subscription/.test(lower) ? "software_subscriptions" : /telefon|internet|mobilfunk/.test(lower) ? "phone_internet" : "other";
  const payment = /bar|cash/.test(lower) ? "cash" : /visa|mastercard|ec.?karte|girocard|karte/.test(lower) ? "card" : /lastschrift/.test(lower) ? "direct_debit" : /überweisung|ueberweisung/.test(lower) ? "bank_transfer" : "unknown";
  const warnings = [];
  if (!supplier) warnings.push("supplier_needs_review"); if (!expenseDate) warnings.push("date_needs_review"); if (!total) warnings.push("total_needs_review"); if (rate === null) warnings.push("vat_needs_review");
  const confidence = Math.max(0, Math.min(100, Math.round((Number(ocrConfidence) || 0) * 0.65 + ([supplier, expenseDate, total].filter(Boolean).length / 3) * 35)));
  return normalizeExtraction({ supplier_name: supplier, supplier_document_number: documentMatch ? documentMatch[1] : "", expense_date: expenseDate, description: supplier ? `Beleg ${supplier}` : "", category_code: category, total_cents: total, subtotal_cents: totals.subtotal_cents, tax_cents: totals.tax_cents, tax_rate_bps: rate, payment_method: payment, confidence, warnings });
}

class LocalTesseractReceiptExtractionProvider {
  async extract(receiptBuffer, mimeType) {
    if (!Buffer.isBuffer(receiptBuffer) || !receiptBuffer.length) throw new Error("INVALID_RECEIPT_BUFFER");
    if (mimeType === "application/pdf") return { available: false, reason: "PDF_OCR_REQUIRES_MANUAL_REVIEW" };
    const path = require("node:path");
    const { createWorker } = require("tesseract.js");
    const worker = await createWorker("deu+eng", undefined, { langPath: path.resolve(process.cwd()), gzip: false });
    try {
      const result = await worker.recognize(receiptBuffer, { rotateAuto: true });
      return { available: true, data: parseOcrText(result.data.text, result.data.confidence) };
    } finally {
      await worker.terminate();
    }
  }
}

module.exports = { cleanText, normalizeExtraction, moneyToCents, totalsFromGross, parseOcrText, DisabledReceiptExtractionProvider, LocalTesseractReceiptExtractionProvider };
