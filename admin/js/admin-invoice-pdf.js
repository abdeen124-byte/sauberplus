(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.AdminInvoicePdf = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var A4 = [595.28, 841.89];
  var NAVY = [14 / 255, 57 / 255, 91 / 255];
  var GREEN = [142 / 255, 218 / 255, 0];
  var TEXT = [20 / 255, 48 / 255, 70 / 255];
  var LIGHT = [236 / 255, 244 / 255, 248 / 255];
  var TOTAL = [232 / 255, 248 / 255, 205 / 255];
  var BORDER = [207 / 255, 222 / 255, 231 / 255];

  function getPdfLib() {
    if (root.PDFLib) {
      return root.PDFLib;
    }
    if (typeof require === "function") {
      return require("./vendor/pdf-lib.min.js");
    }
    throw new Error("PDF library is unavailable.");
  }

  function getFontkit() {
    if (root.fontkit) {
      return root.fontkit;
    }
    if (root.Fontkit) {
      return root.Fontkit;
    }
    if (typeof require === "function") {
      return require("./vendor/fontkit.umd.min.js");
    }
    return null;
  }

  function getBidiShaper() {
    if (root.BidiShaper) {
      return root.BidiShaper;
    }
    if (typeof require === "function") {
      require("./vendor/bidi-shaper.js");
      return root.BidiShaper || null;
    }
    return null;
  }

  function color(pdfLib, value) {
    return pdfLib.rgb(value[0], value[1], value[2]);
  }

  function cleanText(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/[\u2010-\u2015]/g, "-")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
      .trim();
  }

  function containsArabic(value) {
    return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(cleanText(value));
  }

  function money(cents) {
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Number(cents || 0) / 100);
  }

  function date(value) {
    if (!value) {
      return "-";
    }
    var parts = String(value).slice(0, 10).split("-");
    return parts.length === 3 ? parts[2] + "." + parts[1] + "." + parts[0] : String(value);
  }

  function wrap(font, text, size, maxWidth, measure) {
    var source = cleanText(text);
    if (!source) {
      return [""];
    }
    var lines = [];
    source.split(/\r?\n/).forEach(function (paragraph) {
      var words = paragraph.split(/\s+/).filter(Boolean);
      var line = "";
      words.forEach(function (word) {
        var candidate = line ? line + " " + word : word;
        if (line && (measure ? measure(candidate, size) : font.widthOfTextAtSize(candidate, size)) > maxWidth) {
          lines.push(line);
          line = word;
        } else {
          line = candidate;
        }
      });
      lines.push(line);
    });
    return lines.length ? lines : [""];
  }

  function roundedRect(page, pdfLib, x, y, width, height, radius, fill) {
    page.drawRectangle({ x: x + radius, y: y, width: width - radius * 2, height: height, color: fill });
    page.drawRectangle({ x: x, y: y + radius, width: width, height: height - radius * 2, color: fill });
    [
      [x + radius, y + radius],
      [x + width - radius, y + radius],
      [x + radius, y + height - radius],
      [x + width - radius, y + height - radius]
    ].forEach(function (point) {
      page.drawCircle({ x: point[0], y: point[1], size: radius, color: fill });
    });
  }

  function drawLines(page, lines, options) {
    var y = options.y;
    lines.forEach(function (line) {
      var drawOptions = {
        x: options.x,
        y: y,
        size: options.size,
        font: options.fontForText ? options.fontForText(line) : options.font,
        color: options.color,
        maxWidth: options.maxWidth
      };
      if (options.drawText) {
        options.drawText(page, line, drawOptions);
      } else {
        page.drawText(cleanText(line), drawOptions);
      }
      y -= options.leading;
    });
    return y;
  }

  function issuerLines(snapshot) {
    return [
      snapshot.legal_name,
      snapshot.street_address,
      [snapshot.postal_code, snapshot.city].filter(Boolean).join(" "),
      snapshot.phone ? "Tel.: " + snapshot.phone : "",
      snapshot.email ? "E-Mail: " + snapshot.email : ""
    ].filter(Boolean);
  }

  function customerLines(snapshot) {
    return [
      snapshot.salutation,
      snapshot.display_name,
      snapshot.street_address,
      [snapshot.postal_code, snapshot.city].filter(Boolean).join(" ")
    ].filter(Boolean);
  }

  function unitText(item) {
    var units = { flat_rate: "Pauschal", hour: "Stunde", piece: "Stück", sqm: "m²", custom: item.custom_unit || "Einheit" };
    if (item.unit === "flat_rate") {
      return units[item.unit];
    }
    var quantity = (Number(item.quantity_milli || 1000) / 1000).toFixed(3).replace(/0+$/, "").replace(/\.$/, "").replace(".", ",");
    return quantity + " " + (units[item.unit] || item.unit);
  }

  async function buildInvoicePdf(invoice, items, assets) {
    var pdfLib = getPdfLib();
    var pdfDocument = await pdfLib.PDFDocument.create();
    var fontkit = getFontkit();
    var bidiShaper = getBidiShaper();
    if (fontkit && assets && assets.fontBytes) {
      pdfDocument.registerFontkit(fontkit);
    }
    pdfDocument.setTitle("Rechnung " + cleanText(invoice.invoice_number || "Entwurf"));
    pdfDocument.setAuthor("SauberPlus Reinigungsservice GbR");
    pdfDocument.setSubject("SauberPlus Rechnung");
    pdfDocument.setCreator("SauberPlus Admin");
    pdfDocument.setProducer("SauberPlus Admin / pdf-lib");

    var regular = await pdfDocument.embedFont(pdfLib.StandardFonts.Helvetica);
    var bold = await pdfDocument.embedFont(pdfLib.StandardFonts.HelveticaBold);
    var arabicFont = null;
    if (fontkit && assets && assets.fontBytes) {
      arabicFont = await pdfDocument.embedFont(assets.fontBytes, { subset: true });
    }
    function bodyFont(value) {
      return arabicFont && containsArabic(value) ? arabicFont : regular;
    }
    function isArabicGlyph(character) {
      var codePoint = character.codePointAt(0);
      return (codePoint >= 0x0600 && codePoint <= 0x08ff)
        || (codePoint >= 0xfb50 && codePoint <= 0xfdff)
        || (codePoint >= 0xfe70 && codePoint <= 0xfeff);
    }
    function bodySegments(value) {
      var logicalText = cleanText(value);
      var preparedText = containsArabic(logicalText) && bidiShaper
        ? bidiShaper.render(logicalText, { direction: "auto", shape: true, ligatures: true, mirror: true, tashkeel: "keep" })
        : logicalText;
      var segments = [];
      Array.from(preparedText).forEach(function (character) {
        var font = arabicFont && isArabicGlyph(character) ? arabicFont : regular;
        var previous = segments[segments.length - 1];
        if (previous && previous.font === font) {
          previous.text += character;
        } else {
          segments.push({ text: character, font: font });
        }
      });
      return { logicalText: logicalText, segments: segments };
    }
    function drawBodyText(targetPage, value, options) {
      var prepared = bodySegments(value);
      var totalWidth = prepared.segments.reduce(function (sum, segment) {
        return sum + segment.font.widthOfTextAtSize(segment.text, options.size);
      }, 0);
      var x = options.x;
      if (containsArabic(prepared.logicalText) && options.maxWidth) {
        x += Math.max(0, options.maxWidth - totalWidth);
      }
      prepared.segments.forEach(function (segment) {
        targetPage.drawText(segment.text, {
          x: x,
          y: options.y,
          size: options.size,
          font: segment.font,
          color: options.color
        });
        x += segment.font.widthOfTextAtSize(segment.text, options.size);
      });
    }
    function bodyWidthAtSize(value, size) {
      return bodySegments(value).segments.reduce(function (sum, segment) {
        return sum + segment.font.widthOfTextAtSize(segment.text, size);
      }, 0);
    }
    var logo = assets && assets.logoBytes ? await pdfDocument.embedPng(assets.logoBytes) : null;
    var navy = color(pdfLib, NAVY);
    var green = color(pdfLib, GREEN);
    var textColor = color(pdfLib, TEXT);
    var light = color(pdfLib, LIGHT);
    var totalColor = color(pdfLib, TOTAL);
    var border = color(pdfLib, BORDER);
    var pages = [];
    var invoiceItems = Array.isArray(items) ? items.slice().sort(function (a, b) { return a.position - b.position; }) : [];
    var issuer = invoice.issuer_snapshot || {};
    var customer = invoice.customer_snapshot || {};

    function addPage(isFirst) {
      var page = pdfDocument.addPage(A4);
      pages.push(page);
      if (isFirst) {
        roundedRect(page, pdfLib, 42, 707, 511, 94, 12, navy);
        page.drawText("SAUBERPLUS", { x: 65, y: 770, size: 17, font: bold, color: green });
        page.drawText("Reinigungsservice GbR · Solingen", { x: 65, y: 753, size: 8.2, font: regular, color: pdfLib.rgb(1, 1, 1) });
        page.drawText("Saubere Räume.", { x: 315, y: 770, size: 11.5, font: bold, color: pdfLib.rgb(1, 1, 1) });
        page.drawText("Klare Absprachen.", { x: 302, y: 749, size: 12.5, font: bold, color: green });
        if (logo) {
          page.drawImage(logo, { x: 470, y: 722, width: 63, height: 63 });
        }
      } else {
        page.drawRectangle({ x: 42, y: 786, width: 511, height: 28, color: navy });
        page.drawText("SAUBERPLUS", { x: 55, y: 795, size: 11, font: bold, color: green });
        page.drawText("Rechnung " + cleanText(invoice.invoice_number), { x: 365, y: 795, size: 9, font: regular, color: pdfLib.rgb(1, 1, 1) });
      }
      return page;
    }

    function drawTableHeader(page, y) {
      page.drawRectangle({ x: 60, y: y - 28, width: 475, height: 28, color: navy });
      page.drawText("Beschreibung", { x: 65, y: y - 18, size: 8.5, font: bold, color: pdfLib.rgb(1, 1, 1) });
      page.drawText("Menge / Zeit", { x: 385, y: y - 18, size: 8.2, font: bold, color: pdfLib.rgb(1, 1, 1) });
      page.drawText("Betrag", { x: 468, y: y - 18, size: 8.5, font: bold, color: pdfLib.rgb(1, 1, 1) });
      page.drawLine({ start: { x: 380, y: y }, end: { x: 380, y: y - 28 }, thickness: 0.7, color: border });
      page.drawLine({ start: { x: 463, y: y }, end: { x: 463, y: y - 28 }, thickness: 0.7, color: border });
      return y - 28;
    }

    function drawFooter(page, index) {
      var taxFooter = "Steuernummer: " + cleanText(issuer.tax_number) + " · Umsatzsteuer: " + (invoice.vat_bps / 100).toFixed(0) + " % · Die Umsatzsteuer ist im Gesamtbetrag enthalten.";
      drawBodyText(page, taxFooter, {
        x: 68, y: 86, size: 7.2, font: bodyFont(taxFooter), color: textColor, maxWidth: 465
      });
      var issuerFooter = [issuer.legal_name, issuer.street_address, [issuer.postal_code, issuer.city].filter(Boolean).join(" "), issuer.website].filter(Boolean).join(" · ");
      drawBodyText(page, issuerFooter, {
        x: 68, y: 62, size: 7.1, font: bodyFont(issuerFooter), color: textColor, maxWidth: 465
      });
      roundedRect(page, pdfLib, 42, 24, 511, 27, 7, navy);
      page.drawText("Gründlich. Verlässlich. Persönlich erreichbar.", { x: 180, y: 38, size: 7.5, font: bold, color: pdfLib.rgb(1, 1, 1) });
      var availability = "Mo-Sa · 07:00-20:00 Uhr · " + cleanText(issuer.website || "sauberplus.plus");
      drawBodyText(page, availability, { x: 210, y: 28.5, size: 6.7, font: bodyFont(availability), color: green });
      if (pages.length > 1) {
        page.drawText(String(index + 1) + " / " + String(pages.length), { x: 515, y: 62, size: 6.8, font: regular, color: textColor });
      }
    }

    var page = addPage(true);
    page.drawText("RECHNUNG", { x: 68, y: 664, size: 22, font: bold, color: navy });
    var serviceHeading = cleanText(invoiceItems[0] ? invoiceItems[0].description : "Reinigungsleistung");
    drawBodyText(page, serviceHeading, { x: 68, y: 648, size: 8.5, font: bodyFont(serviceHeading), color: textColor, maxWidth: 460 });
    page.drawLine({ start: { x: 66, y: 632 }, end: { x: 530, y: 632 }, thickness: 1.2, color: green });

    page.drawRectangle({ x: 66, y: 568, width: 464, height: 52, color: light, borderColor: border, borderWidth: 0.6 });
    page.drawLine({ start: { x: 158, y: 568 }, end: { x: 158, y: 620 }, thickness: 0.6, color: border });
    page.drawLine({ start: { x: 305, y: 568 }, end: { x: 305, y: 620 }, thickness: 0.6, color: border });
    page.drawLine({ start: { x: 402, y: 568 }, end: { x: 402, y: 620 }, thickness: 0.6, color: border });
    page.drawLine({ start: { x: 66, y: 594 }, end: { x: 530, y: 594 }, thickness: 0.6, color: border });
    [
      ["Rechnungsnummer", cleanText(invoice.invoice_number || "Entwurf"), 72, 605, 164],
      ["Rechnungsdatum", date(invoice.invoice_date), 311, 605, 408],
      ["Leistungsdatum", date(invoice.service_date), 72, 579, 164],
      ["Zahlungsziel", cleanText(invoice.payment_terms), 311, 579, 408]
    ].forEach(function (entry) {
      page.drawText(entry[0], { x: entry[2], y: entry[3], size: 7.8, font: regular, color: textColor });
      drawBodyText(page, entry[1], { x: entry[4], y: entry[3], size: 7.8, font: bodyFont(entry[1]), color: textColor, maxWidth: entry[2] === 72 ? 136 : 116 });
    });

    page.drawRectangle({ x: 63, y: 468, width: 470, height: 82, color: light, borderColor: border, borderWidth: 0.6 });
    page.drawText("Rechnungsempfänger/in", { x: 68, y: 535, size: 8.2, font: regular, color: textColor });
    page.drawText("Rechnungsaussteller", { x: 305, y: 535, size: 8.2, font: regular, color: textColor });
    drawLines(page, customerLines(customer), { x: 68, y: 521, size: 8.6, leading: 12, fontForText: bodyFont, drawText: drawBodyText, color: textColor, maxWidth: 210 });
    drawLines(page, issuerLines(issuer), { x: 305, y: 521, size: 8.2, leading: 11, fontForText: bodyFont, drawText: drawBodyText, color: textColor, maxWidth: 222 });
    page.drawText("Abgerechnete Leistung", { x: 68, y: 450, size: 10.5, font: bold, color: navy });
    var y = drawTableHeader(page, 442);

    invoiceItems.forEach(function (item) {
      var descriptionLines = wrap(bodyFont(item.description), item.description, 8.2, 300, bodyWidthAtSize);
      var detailLines = item.details ? wrap(bodyFont(item.details), item.details, 6.8, 300, bodyWidthAtSize) : [];
      var rowHeight = Math.max(34, 12 + descriptionLines.length * 10 + detailLines.length * 8);
      if (y - rowHeight < 215) {
        page = addPage(false);
        page.drawText("Abgerechnete Leistung - Fortsetzung", { x: 60, y: 765, size: 11, font: bold, color: navy });
        y = drawTableHeader(page, 748);
      }
      page.drawRectangle({ x: 60, y: y - rowHeight, width: 475, height: rowHeight, color: pdfLib.rgb(1, 1, 1), borderColor: border, borderWidth: 0.6 });
      page.drawLine({ start: { x: 380, y: y }, end: { x: 380, y: y - rowHeight }, thickness: 0.6, color: border });
      page.drawLine({ start: { x: 463, y: y }, end: { x: 463, y: y - rowHeight }, thickness: 0.6, color: border });
      drawLines(page, descriptionLines, { x: 65, y: y - 13, size: 8.2, leading: 10, fontForText: bodyFont, drawText: drawBodyText, color: textColor, maxWidth: 305 });
      if (detailLines.length) {
        drawLines(page, detailLines, { x: 65, y: y - 13 - descriptionLines.length * 10, size: 6.8, leading: 8, fontForText: bodyFont, drawText: drawBodyText, color: textColor, maxWidth: 305 });
      }
      var itemUnit = unitText(item);
      var itemMoney = money(item.line_total_net_cents);
      drawBodyText(page, itemUnit, { x: 385, y: y - 18, size: 7.6, font: bodyFont(itemUnit), color: textColor, maxWidth: 72 });
      drawBodyText(page, itemMoney, { x: 468, y: y - 18, size: 7.6, font: bodyFont(itemMoney), color: textColor, maxWidth: 62 });
      y -= rowHeight;
    });

    if (y < 260) {
      page = addPage(false);
      y = 748;
    }
    page.drawRectangle({ x: 60, y: y - 26, width: 475, height: 26, color: pdfLib.rgb(1, 1, 1), borderColor: border, borderWidth: 0.6 });
    page.drawText("Umsatzsteuer", { x: 65, y: y - 17, size: 8.2, font: regular, color: textColor });
    page.drawText((invoice.vat_bps / 100).toFixed(0) + " %", { x: 385, y: y - 17, size: 8.2, font: regular, color: textColor });
    page.drawText(money(invoice.vat_cents), { x: 468, y: y - 17, size: 8.2, font: regular, color: textColor });
    y -= 26;
    page.drawRectangle({ x: 60, y: y - 27, width: 475, height: 27, color: totalColor, borderColor: border, borderWidth: 0.6 });
    page.drawText("Gesamtbetrag (inkl. " + (invoice.vat_bps / 100).toFixed(0) + " % USt.)", { x: 65, y: y - 18, size: 8.2, font: regular, color: textColor });
    page.drawText(money(invoice.total_cents), { x: 468, y: y - 18, size: 8.4, font: regular, color: textColor });
    y -= 43;

    if (invoice.notes) {
      y = drawLines(page, wrap(bodyFont(invoice.notes), invoice.notes, 8, 455, bodyWidthAtSize), { x: 68, y: y, size: 8, leading: 10, fontForText: bodyFont, drawText: drawBodyText, color: textColor, maxWidth: 455 }) - 8;
    }
    page.drawText("Zahlungsinformationen", { x: 68, y: y, size: 10.2, font: bold, color: navy });
    y -= 12;
    page.drawRectangle({ x: 63, y: y - 50, width: 470, height: 50, color: light, borderColor: border, borderWidth: 0.6 });
    page.drawLine({ start: { x: 168, y: y - 50 }, end: { x: 168, y: y }, thickness: 0.6, color: border });
    page.drawLine({ start: { x: 63, y: y - 25 }, end: { x: 533, y: y - 25 }, thickness: 0.6, color: border });
    page.drawText("Zahlungsart", { x: 68, y: y - 16, size: 8, font: regular, color: textColor });
    page.drawText(invoice.payment_method === "cash" ? "Barzahlung" : "Überweisung", { x: 172, y: y - 16, size: 8, font: regular, color: textColor });
    page.drawText("Bankverbindung", { x: 68, y: y - 41, size: 8, font: regular, color: textColor });
    var accountLine = "Kontoinhaber: " + cleanText(issuer.account_holder);
    var ibanLine = "IBAN: " + cleanText(issuer.iban);
    drawBodyText(page, accountLine, { x: 172, y: y - 34, size: 7.6, font: bodyFont(accountLine), color: textColor, maxWidth: 355 });
    drawBodyText(page, ibanLine, { x: 172, y: y - 45, size: 7.6, font: bodyFont(ibanLine), color: textColor, maxWidth: 355 });

    pages.forEach(drawFooter);
    var bytes = await pdfDocument.save({ useObjectStreams: false });
    return {
      bytes: bytes,
      fileName: cleanText(invoice.invoice_number || "Rechnung-Entwurf") + ".pdf",
      storagePath: invoice.invoice_number ? "invoices/" + invoice.id + "/" + invoice.invoice_number + ".pdf" : null,
      pageCount: pages.length
    };
  }

  async function loadBrowserAssets() {
    var responses = await Promise.all([
      fetch("../mitarbeiter/icons/sauberplus-192.png"),
      fetch("fonts/NotoSansArabic-Regular.ttf")
    ]);
    if (!responses[0].ok || !responses[1].ok) {
      throw new Error("Invoice PDF assets could not be loaded.");
    }
    return {
      logoBytes: new Uint8Array(await responses[0].arrayBuffer()),
      fontBytes: new Uint8Array(await responses[1].arrayBuffer())
    };
  }

  async function sha256Hex(bytes) {
    if (!root.crypto || !root.crypto.subtle) {
      if (typeof require === "function") {
        return require("node:crypto").createHash("sha256").update(Buffer.from(bytes)).digest("hex");
      }
      throw new Error("SHA-256 is unavailable.");
    }
    var digest = await root.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).map(function (value) {
      return value.toString(16).padStart(2, "0");
    }).join("");
  }

  async function archivePdf(client, invoice, pdfResult) {
    if (!invoice.invoice_number || !pdfResult.storagePath) {
      throw new Error("Only issued invoices can be archived.");
    }
    var hash = await sha256Hex(pdfResult.bytes);
    if (invoice.pdf_storage_path) {
      if (invoice.pdf_storage_path === pdfResult.storagePath && invoice.pdf_sha256 === hash) {
        return invoice;
      }
      throw new Error("Archived invoice PDFs are immutable.");
    }
    var bucket = client.storage.from("invoice-pdfs");
    var upload = await bucket.upload(pdfResult.storagePath, pdfResult.bytes, {
      contentType: "application/pdf",
      cacheControl: "3600",
      upsert: false
    });
    if (upload.error) {
      var existing = await bucket.download(pdfResult.storagePath);
      if (existing.error) {
        throw upload.error;
      }
      var existingHash = await sha256Hex(new Uint8Array(await existing.data.arrayBuffer()));
      if (existingHash !== hash) {
        throw new Error("An immutable PDF already exists for this invoice.");
      }
    }
    var recorded = await client.rpc("record_invoice_pdf", {
      p_invoice_id: invoice.id,
      p_storage_path: pdfResult.storagePath,
      p_sha256: hash
    });
    if (recorded.error) {
      throw recorded.error;
    }
    return recorded.data;
  }

  function downloadBytes(bytes, fileName) {
    var blob = new Blob([bytes], { type: "application/pdf" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  return {
    buildInvoicePdf: buildInvoicePdf,
    loadBrowserAssets: loadBrowserAssets,
    archivePdf: archivePdf,
    downloadBytes: downloadBytes,
    sha256Hex: sha256Hex
  };
});
