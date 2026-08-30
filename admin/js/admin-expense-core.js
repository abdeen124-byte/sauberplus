(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.AdminExpenseCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var MAX_CENTS = 999999999999;
  var TAX_RATES = [1900, 700, 0];

  function parseMoney(value) {
    var text = String(value === null || value === undefined ? "" : value).trim();
    if (!/^\d+(?:[,.]\d{1,2})?$/.test(text)) { throw new Error("INVALID_MONEY"); }
    var parts = text.replace(",", ".").split(".");
    var cents = Number(parts[0]) * 100 + Number((parts[1] || "").padEnd(2, "0"));
    if (!Number.isSafeInteger(cents) || cents < 0 || cents > MAX_CENTS) { throw new Error("INVALID_MONEY"); }
    return cents;
  }

  function formatMoney(cents, language) {
    if (!Number.isSafeInteger(cents)) { return "—"; }
    return new Intl.NumberFormat(language === "ar" ? "ar-DE" : "de-DE", {
      style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2
    }).format(cents / 100);
  }

  function totalsFromGross(grossCents, rateBps) {
    if (!Number.isSafeInteger(grossCents) || grossCents < 1 || grossCents > MAX_CENTS || TAX_RATES.indexOf(rateBps) < 0) {
      throw new Error("INVALID_TOTALS");
    }
    var denominator = 10000 + rateBps;
    var netCents = Math.floor((grossCents * 10000 + Math.floor(denominator / 2)) / denominator);
    return { subtotalCents: netCents, taxCents: grossCents - netCents, totalCents: grossCents, rateBps: rateBps };
  }

  function normalizeMixedRows(rows) {
    if (!Array.isArray(rows) || rows.length < 2 || rows.length > 8) { throw new Error("INVALID_TAX_ROWS"); }
    var seen = {};
    var normalized = rows.map(function (row) {
      var rate = Number(row.rateBps);
      var gross = typeof row.grossCents === "number" ? row.grossCents : parseMoney(row.gross);
      if (TAX_RATES.indexOf(rate) < 0 || seen[rate]) { throw new Error("INVALID_TAX_ROWS"); }
      seen[rate] = true;
      var totals = totalsFromGross(gross, rate);
      return { rate_bps: rate, net_cents: totals.subtotalCents, tax_cents: totals.taxCents, gross_cents: totals.totalCents };
    });
    var sum = function (key) { return normalized.reduce(function (total, row) { return total + row[key]; }, 0); };
    return { rows: normalized, subtotalCents: sum("net_cents"), taxCents: sum("tax_cents"), totalCents: sum("gross_cents") };
  }

  function contributionState(targetCents, paidCents) {
    if (targetCents === null || targetCents === undefined) { return "no_target"; }
    if (paidCents >= targetCents) { return paidCents === targetCents ? "complete" : "over"; }
    return paidCents === 0 ? "unpaid" : "partial";
  }

  function isoToday() {
    var now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  return {
    MAX_CENTS: MAX_CENTS,
    TAX_RATES: TAX_RATES,
    parseMoney: parseMoney,
    formatMoney: formatMoney,
    totalsFromGross: totalsFromGross,
    normalizeMixedRows: normalizeMixedRows,
    contributionState: contributionState,
    isoToday: isoToday
  };
});
