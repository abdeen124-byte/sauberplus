(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.AdminInvoiceCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var MAX_MONEY_CENTS = 999999999999;
  var MAX_UNIT_PRICE_CENTS = 999999999;
  var SERVICE_PRESETS = [
    "Unterhaltsreinigung",
    "Grundreinigung",
    "Fensterreinigung",
    "Büroreinigung",
    "Treppenhausreinigung",
    "Endreinigung",
    "Sonstige"
  ];

  function parseMoneyToCents(value, maximum) {
    var text = String(value === null || value === undefined ? "" : value).trim();
    var limit = maximum === undefined ? MAX_MONEY_CENTS : maximum;
    if (!/^\d+(?:[,.]\d{1,2})?$/.test(text)) {
      throw new Error("INVALID_MONEY");
    }
    var parts = text.replace(",", ".").split(".");
    var euros = Number(parts[0]);
    var decimals = (parts[1] || "").padEnd(2, "0");
    var cents = euros * 100 + Number(decimals || "0");
    if (!Number.isSafeInteger(cents) || cents < 0 || cents > limit) {
      throw new Error("INVALID_MONEY");
    }
    return cents;
  }

  function formatMoney(cents, language) {
    if (!Number.isSafeInteger(cents)) {
      return "—";
    }
    return new Intl.NumberFormat(language === "ar" ? "ar-DE" : "de-DE", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(cents / 100);
  }

  function calculateFromGross(grossCents, vatBps) {
    if (!Number.isSafeInteger(grossCents) || grossCents < 0 || grossCents > MAX_MONEY_CENTS) {
      throw new Error("INVALID_MONEY");
    }
    if (!Number.isInteger(vatBps) || vatBps < 0 || vatBps > 10000) {
      throw new Error("INVALID_VAT");
    }
    var denominator = 10000 + vatBps;
    var netCents = Math.floor((grossCents * 10000 + Math.floor(denominator / 2)) / denominator);
    return {
      subtotalCents: netCents,
      vatCents: grossCents - netCents,
      totalCents: grossCents
    };
  }

  function calculateFromNet(netCents, vatBps) {
    if (!Number.isSafeInteger(netCents) || netCents < 0 || netCents > MAX_MONEY_CENTS) {
      throw new Error("INVALID_MONEY");
    }
    if (!Number.isInteger(vatBps) || vatBps < 0 || vatBps > 10000) {
      throw new Error("INVALID_VAT");
    }
    var vatCents = Math.floor((netCents * vatBps + 5000) / 10000);
    return {
      subtotalCents: netCents,
      vatCents: vatCents,
      totalCents: netCents + vatCents
    };
  }

  function parseQuantityToMilli(value) {
    var text = String(value === null || value === undefined ? "" : value).trim();
    if (!/^\d+(?:[,.]\d{1,3})?$/.test(text)) {
      throw new Error("INVALID_QUANTITY");
    }
    var parts = text.replace(",", ".").split(".");
    var units = Number(parts[0]);
    var decimals = (parts[1] || "").padEnd(3, "0");
    var milli = units * 1000 + Number(decimals || "0");
    if (!Number.isSafeInteger(milli) || milli < 1 || milli > 100000000) {
      throw new Error("INVALID_QUANTITY");
    }
    return milli;
  }

  function formatQuantity(milli) {
    if (!Number.isInteger(milli) || milli < 1) {
      return "—";
    }
    var value = (milli / 1000).toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
    return value.replace(".", ",");
  }

  function calculateNetItems(items, vatBps) {
    if (!Array.isArray(items) || !items.length || items.length > 100) {
      throw new Error("INVALID_ITEMS");
    }
    var normalized = items.map(function (item, index) {
      var quantityMilli = parseQuantityToMilli(item.quantity);
      var unitPriceNetCents = parseMoneyToCents(item.unitPriceNet, MAX_UNIT_PRICE_CENTS);
      var lineTotalNetCents = Math.floor((unitPriceNetCents * quantityMilli + 500) / 1000);
      if (!String(item.description || "").trim() || String(item.description).trim().length > 300) {
        throw new Error("INVALID_ITEM_DESCRIPTION");
      }
      return {
        description: String(item.description).trim(),
        details: String(item.details || "").trim(),
        quantity_milli: quantityMilli,
        unit: item.unit || "flat_rate",
        custom_unit: item.unit === "custom" ? String(item.customUnit || "").trim() : null,
        unit_price_net_cents: unitPriceNetCents,
        line_total_net_cents: lineTotalNetCents,
        position: index + 1
      };
    });
    var subtotal = normalized.reduce(function (sum, item) {
      return sum + item.line_total_net_cents;
    }, 0);
    var totals = calculateFromNet(subtotal, vatBps);
    return { items: normalized, totals: totals };
  }

  function quickItem(description, details, grossCents) {
    if (!String(description || "").trim()) {
      throw new Error("INVALID_ITEM_DESCRIPTION");
    }
    if (!Number.isSafeInteger(grossCents) || grossCents < 1 || grossCents > MAX_MONEY_CENTS) {
      throw new Error("INVALID_MONEY");
    }
    return {
      description: String(description).trim(),
      details: String(details || "").trim(),
      quantity_milli: 1000,
      unit: "flat_rate",
      custom_unit: null,
      gross_cents: grossCents
    };
  }

  function statusLabel(status, language) {
    var labels = {
      de: { draft: "Entwurf", open: "Offen", paid: "Bezahlt", cancelled: "Storniert" },
      ar: { draft: "مسودة", open: "مفتوحة", paid: "مدفوعة", cancelled: "ملغاة" }
    };
    return (labels[language] || labels.de)[status] || status;
  }

  function unitLabel(unit, customUnit, language) {
    var labels = {
      de: { flat_rate: "Pauschal", hour: "Stunde", piece: "Stück", sqm: "m²", custom: customUnit || "Einheit" },
      ar: { flat_rate: "مقطوعية", hour: "ساعة", piece: "قطعة", sqm: "م²", custom: customUnit || "وحدة" }
    };
    return (labels[language] || labels.de)[unit] || unit;
  }

  function formatDate(value, language) {
    if (!value) {
      return "—";
    }
    var date = new Date(String(value).slice(0, 10) + "T12:00:00Z");
    if (Number.isNaN(date.getTime())) {
      return "—";
    }
    return new Intl.DateTimeFormat(language === "ar" ? "ar-DE" : "de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "UTC"
    }).format(date);
  }

  function todayIso() {
    var now = new Date();
    var local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  return {
    MAX_MONEY_CENTS: MAX_MONEY_CENTS,
    MAX_UNIT_PRICE_CENTS: MAX_UNIT_PRICE_CENTS,
    SERVICE_PRESETS: SERVICE_PRESETS,
    parseMoneyToCents: parseMoneyToCents,
    formatMoney: formatMoney,
    calculateFromGross: calculateFromGross,
    calculateFromNet: calculateFromNet,
    parseQuantityToMilli: parseQuantityToMilli,
    formatQuantity: formatQuantity,
    calculateNetItems: calculateNetItems,
    quickItem: quickItem,
    statusLabel: statusLabel,
    unitLabel: unitLabel,
    formatDate: formatDate,
    todayIso: todayIso
  };
});
