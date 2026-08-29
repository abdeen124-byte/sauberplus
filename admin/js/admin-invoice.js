(function () {
  "use strict";

  var core = window.AdminInvoiceCore;
  var t = window.AdminI18N.t;
  var state = {
    client: null,
    profile: null,
    customers: [],
    settings: null,
    invoice: null,
    invoiceId: new URLSearchParams(window.location.search).get("id"),
    selectedCustomerId: null,
    itemCount: 0,
    assets: null,
    busy: false
  };

  function getElement(id) { return document.getElementById(id); }
  function language() { return window.AdminI18N.getLang(); }

  function showError(message) {
    var element = getElement("invoiceError");
    element.textContent = message;
    element.setAttribute("data-visible", "true");
    element.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function hideError() {
    var element = getElement("invoiceError");
    element.textContent = "";
    element.setAttribute("data-visible", "false");
  }

  function errorMessage(error) {
    if (!error) { return t("common.actionFailed"); }
    var code = error.message || String(error);
    var mapping = {
      INVALID_MONEY: t("invoiceEditor.error.invalidMoney"),
      INVALID_VAT: t("invoiceEditor.error.invalidVat"),
      INVALID_QUANTITY: t("invoiceEditor.error.invalidQuantity"),
      INVALID_ITEMS: t("invoiceEditor.error.invalidItems"),
      INVALID_ITEM_DESCRIPTION: t("invoiceEditor.error.invalidItems")
    };
    return mapping[code] || window.AdminI18N.translateServerError(code) || code;
  }

  function setBusy(busy) {
    state.busy = busy;
    ["issueBtn", "saveDraftBtn", "previewBtn"].forEach(function (id) {
      var element = getElement(id);
      if (element) { element.disabled = busy; }
    });
    getElement("issueBtn").classList.toggle("loading", busy);
  }

  function customerByName(name) {
    var normalized = String(name || "").trim().toLowerCase();
    return state.customers.find(function (customer) {
      return customer.display_name.trim().toLowerCase() === normalized;
    });
  }

  function populateCustomers() {
    var list = getElement("customerOptions");
    list.textContent = "";
    state.customers.forEach(function (customer) {
      var option = document.createElement("option");
      option.value = customer.display_name;
      option.label = [customer.street_address, customer.postal_code, customer.city].filter(Boolean).join(", ");
      list.appendChild(option);
    });
  }

  function customerAddress(customer) {
    return [customer.street_address, [customer.postal_code, customer.city].filter(Boolean).join(" ")].filter(Boolean).join("\n");
  }

  function applyCustomer(customer) {
    if (!customer) {
      state.selectedCustomerId = null;
      return;
    }
    state.selectedCustomerId = customer.id || null;
    getElement("customerName").value = customer.display_name || "";
    getElement("customerAddress").value = customerAddress(customer);
    getElement("salutation").value = customer.salutation || "";
    getElement("companyName").value = customer.company_name || "";
    getElement("firstName").value = customer.first_name || "";
    getElement("lastName").value = customer.last_name || "";
    getElement("streetAddress").value = customer.street_address || "";
    getElement("postalCode").value = customer.postal_code || "";
    getElement("city").value = customer.city || "";
    getElement("customerEmail").value = customer.email || "";
    getElement("customerPhone").value = customer.phone || "";
    renderPreview();
  }

  function syncAdvancedAddress() {
    var lines = getElement("customerAddress").value.split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean);
    if (!getElement("streetAddress").value || document.activeElement === getElement("customerAddress")) {
      getElement("streetAddress").value = lines[0] || "";
      var cityLine = lines.slice(1).join(" ");
      var match = cityLine.match(/^(\S+)\s+(.+)$/);
      getElement("postalCode").value = match ? match[1] : "";
      getElement("city").value = match ? match[2] : cityLine;
    }
  }

  function syncQuickAddress() {
    getElement("customerAddress").value = [
      getElement("streetAddress").value.trim(),
      [getElement("postalCode").value.trim(), getElement("city").value.trim()].filter(Boolean).join(" ")
    ].filter(Boolean).join("\n");
  }

  function createServiceOptions() {
    var labels = language() === "ar" ? [
      "التنظيف الدوري", "التنظيف العميق", "تنظيف النوافذ", "تنظيف المكاتب",
      "تنظيف السلالم", "التنظيف النهائي", "أخرى"
    ] : core.SERVICE_PRESETS;
    var select = getElement("servicePreset");
    select.textContent = "";
    core.SERVICE_PRESETS.forEach(function (preset, index) {
      var option = document.createElement("option");
      option.value = preset;
      option.textContent = labels[index];
      select.appendChild(option);
    });
  }

  function readVatBps() {
    var text = getElement("vatRate").value.trim();
    var bps = core.parseMoneyToCents(text, 10000);
    if (bps > 10000) { throw new Error("INVALID_VAT"); }
    return bps;
  }

  function readCustomer() {
    syncAdvancedAddress();
    var displayName = getElement("customerName").value.trim();
    var street = getElement("streetAddress").value.trim();
    if (!displayName || !street) {
      throw new Error(t("invoiceEditor.error.customerRequired"));
    }
    return {
      display_name: displayName,
      salutation: getElement("salutation").value.trim() || null,
      company_name: getElement("companyName").value.trim() || null,
      first_name: getElement("firstName").value.trim() || null,
      last_name: getElement("lastName").value.trim() || null,
      street_address: street,
      postal_code: getElement("postalCode").value.trim(),
      city: getElement("city").value.trim(),
      email: getElement("customerEmail").value.trim() || null,
      phone: getElement("customerPhone").value.trim() || null
    };
  }

  function serviceDescription() {
    return getElement("servicePreset").value === "Sonstige" ? getElement("customService").value.trim() : getElement("servicePreset").value;
  }

  function readAdvancedItems() {
    return Array.from(getElement("advancedItems").querySelectorAll(".invoice-item-editor")).map(function (row) {
      return {
        description: row.querySelector("[data-item-description]").value,
        details: row.querySelector("[data-item-details]").value,
        quantity: row.querySelector("[data-item-quantity]").value,
        unit: row.querySelector("[data-item-unit]").value,
        customUnit: row.querySelector("[data-item-custom-unit]").value,
        unitPriceNet: row.querySelector("[data-item-price]").value
      };
    });
  }

  function buildDraftPayload() {
    var vatBps = readVatBps();
    var multiple = getElement("multipleItems").checked;
    var pricingMode = multiple ? "net" : "gross";
    var items;
    if (multiple) {
      var advanced = core.calculateNetItems(readAdvancedItems(), vatBps);
      items = advanced.items.map(function (item) {
        return {
          description: item.description,
          details: item.details,
          quantity_milli: item.quantity_milli,
          unit: item.unit,
          custom_unit: item.custom_unit,
          unit_price_net_cents: item.unit_price_net_cents
        };
      });
    } else {
      var description = serviceDescription();
      if (!description) { throw new Error(t("invoiceEditor.error.serviceRequired")); }
      items = [core.quickItem(description, "", core.parseMoneyToCents(getElement("grossAmount").value))];
    }
    return {
      p_invoice_id: state.invoiceId || null,
      p_customer_id: state.selectedCustomerId || null,
      p_customer: readCustomer(),
      p_invoice_date: getElement("invoiceDate").value,
      p_service_date: getElement("serviceDate").value,
      p_payment_method: getElement("paymentMethod").value,
      p_payment_terms: getElement("paymentTerms").value.trim(),
      p_vat_bps: vatBps,
      p_pricing_mode: pricingMode,
      p_notes: getElement("invoiceNote").value.trim(),
      p_items: items
    };
  }

  function previewValues() {
    var vatBps;
    try { vatBps = readVatBps(); } catch (error) { vatBps = 1900; }
    if (state.invoice && state.invoice.status !== "draft") {
      return { subtotal: state.invoice.subtotal_cents, vat: state.invoice.vat_cents, total: state.invoice.total_cents, vatBps: state.invoice.vat_bps };
    }
    try {
      if (getElement("multipleItems").checked) {
        var result = core.calculateNetItems(readAdvancedItems(), vatBps);
        return { subtotal: result.totals.subtotalCents, vat: result.totals.vatCents, total: result.totals.totalCents, vatBps: vatBps };
      }
      var gross = core.parseMoneyToCents(getElement("grossAmount").value || "0");
      var totals = core.calculateFromGross(gross, vatBps);
      return { subtotal: totals.subtotalCents, vat: totals.vatCents, total: totals.totalCents, vatBps: vatBps };
    } catch (error) {
      return { subtotal: 0, vat: 0, total: 0, vatBps: vatBps };
    }
  }

  function previewItemRows(values) {
    var container = getElement("previewItems");
    container.textContent = "";
    if (getElement("multipleItems").checked) {
      readAdvancedItems().forEach(function (item) {
        var row = document.createElement("div");
        row.className = "invoice-preview-table-row";
        var amount = "-";
        try {
          var quantity = core.parseQuantityToMilli(item.quantity);
          var price = core.parseMoneyToCents(item.unitPriceNet, core.MAX_UNIT_PRICE_CENTS);
          amount = core.formatMoney(Math.floor((quantity * price + 500) / 1000), language());
        } catch (error) { /* incomplete preview row */ }
        [item.description || t("invoiceEditor.description"), item.quantity || "1", amount].forEach(function (value) {
          var span = document.createElement("span"); span.textContent = value; row.appendChild(span);
        });
        container.appendChild(row);
      });
    } else {
      var row = document.createElement("div"); row.className = "invoice-preview-table-row";
      [serviceDescription() || t("invoiceEditor.serviceType"), "Pauschal", core.formatMoney(values.subtotal, language())].forEach(function (value) {
        var span = document.createElement("span"); span.textContent = value; row.appendChild(span);
      });
      container.appendChild(row);
    }
  }

  function renderPreview() {
    var values = previewValues();
    getElement("netAmount").textContent = core.formatMoney(values.subtotal, language());
    getElement("vatAmount").textContent = core.formatMoney(values.vat, language());
    getElement("totalAmount").textContent = core.formatMoney(values.total, language());
    getElement("vatLabel").textContent = t("invoiceEditor.vatShort", { rate: (values.vatBps / 100).toFixed(0) });
    getElement("previewCustomer").textContent = getElement("customerName").value.trim() || t("invoiceEditor.customer");
    getElement("previewAddress").textContent = getElement("customerAddress").value.trim() || t("invoiceEditor.address");
    getElement("previewService").textContent = serviceDescription() || t("invoiceEditor.serviceType");
    getElement("previewDate").textContent = core.formatDate(getElement("invoiceDate").value, language());
    getElement("previewServiceDate").textContent = core.formatDate(getElement("serviceDate").value, language());
    getElement("previewTerms").textContent = getElement("paymentTerms").value || "zahlbar nach Erhalt";
    getElement("previewNumber").textContent = state.invoice && state.invoice.invoice_number || t("invoiceEditor.numberAutomatic");
    getElement("previewVatRate").textContent = (values.vatBps / 100).toFixed(0) + " %";
    getElement("previewVat").textContent = core.formatMoney(values.vat, language());
    getElement("previewTotal").textContent = core.formatMoney(values.total, language());
    getElement("previewNote").textContent = getElement("invoiceNote").value.trim();
    getElement("previewPayment").textContent = getElement("paymentMethod").value === "cash" ? t("invoiceEditor.cash") : t("invoiceEditor.bankTransfer");
    previewItemRows(values);
  }

  function addAdvancedItem(item) {
    var fragment = getElement("advancedItemTemplate").content.cloneNode(true);
    var row = fragment.querySelector(".invoice-item-editor");
    state.itemCount += 1;
    row.dataset.itemIndex = String(state.itemCount);
    row.querySelector("[data-item-number]").textContent = t("invoiceEditor.position", { number: state.itemCount });
    row.querySelector("[data-item-description]").value = item && item.description || serviceDescription() || "Unterhaltsreinigung";
    row.querySelector("[data-item-details]").value = item && item.details || "";
    row.querySelector("[data-item-quantity]").value = item ? core.formatQuantity(item.quantity_milli) : "1";
    row.querySelector("[data-item-unit]").value = item && item.unit || "flat_rate";
    row.querySelector("[data-item-price]").value = item ? (item.unit_price_net_cents / 100).toFixed(2).replace(".", ",") : (previewValues().subtotal / 100).toFixed(2).replace(".", ",");
    row.querySelector("[data-item-custom-unit]").value = item && item.custom_unit || "";
    row.querySelector("[data-custom-unit-wrap]").hidden = row.querySelector("[data-item-unit]").value !== "custom";
    getElement("advancedItems").appendChild(fragment);
    window.AdminI18N.applyStaticTranslations();
  }

  function toggleMultipleItems() {
    var enabled = getElement("multipleItems").checked;
    getElement("advancedItemsWrap").hidden = !enabled;
    if (enabled && !getElement("advancedItems").children.length) {
      addAdvancedItem();
    }
    renderPreview();
  }

  async function loadReferenceData() {
    var results = await Promise.all([
      state.client.from("invoice_customers").select("*").is("archived_at", null).order("display_name"),
      state.client.from("invoice_settings").select("*").eq("singleton", true).maybeSingle()
    ]);
    if (results[0].error) { throw results[0].error; }
    if (results[1].error) { throw results[1].error; }
    state.customers = results[0].data || [];
    state.settings = results[1].data || null;
    populateCustomers();
    getElement("paymentTerms").value = state.settings && state.settings.default_payment_terms || "zahlbar nach Erhalt";
    var vat = state.settings ? state.settings.default_vat_bps : 1900;
    getElement("vatRate").value = (vat / 100).toFixed(2).replace(".", ",");
  }

  async function loadInvoice() {
    if (!state.invoiceId) { return; }
    var results = await Promise.all([
      state.client.from("invoices").select("*").eq("id", state.invoiceId).single(),
      state.client.from("invoice_items").select("*").eq("invoice_id", state.invoiceId).order("position")
    ]);
    if (results[0].error || results[1].error) { throw results[0].error || results[1].error; }
    state.invoice = results[0].data;
    var invoice = state.invoice;
    getElement("advancedItems").textContent = "";
    state.itemCount = 0;
    applyCustomer(Object.assign({ id: invoice.customer_id }, invoice.customer_snapshot));
    getElement("invoiceDate").value = invoice.invoice_date;
    getElement("serviceDate").value = invoice.service_date;
    getElement("paymentTerms").value = invoice.payment_terms;
    getElement("paymentMethod").value = invoice.payment_method;
    getElement("vatRate").value = (invoice.vat_bps / 100).toFixed(2).replace(".", ",");
    getElement("invoiceNote").value = invoice.notes || "";
    var items = results[1].data || [];
    if (invoice.pricing_mode === "net" || items.length > 1) {
      getElement("advancedOptions").open = true;
      getElement("multipleItems").checked = true;
      getElement("advancedItemsWrap").hidden = false;
      items.forEach(addAdvancedItem);
    } else if (items[0]) {
      var preset = core.SERVICE_PRESETS.includes(items[0].description) ? items[0].description : "Sonstige";
      getElement("servicePreset").value = preset;
      getElement("customServiceWrap").hidden = preset !== "Sonstige";
      getElement("customService").value = preset === "Sonstige" ? items[0].description : "";
      getElement("grossAmount").value = (invoice.total_cents / 100).toFixed(2).replace(".", ",");
    }
    if (invoice.status !== "draft") { lockIssuedInvoice(); }
    renderPreview();
  }

  function lockIssuedInvoice() {
    getElement("invoiceForm").querySelectorAll("input, select, textarea, details, button").forEach(function (element) {
      if (element.id !== "issueBtn" && element.id !== "previewBtn") { element.disabled = true; }
    });
    getElement("saveDraftBtn").hidden = true;
    getElement("issueBtnLabel").textContent = state.invoice.pdf_storage_path ? t("invoiceEditor.downloadPdf") : t("invoiceEditor.generatePdf");
    getElement("invoicePageTitle").textContent = state.invoice.invoice_number;
    var badge = getElement("invoiceStatusBadge");
    badge.hidden = false;
    badge.className = "invoice-status-badge";
    badge.dataset.status = state.invoice.status;
    badge.textContent = core.statusLabel(state.invoice.status, language());
  }

  async function saveDraft() {
    var payload = buildDraftPayload();
    var result = await state.client.rpc("save_invoice_draft", payload);
    if (result.error) { throw result.error; }
    state.invoiceId = result.data;
    window.history.replaceState({}, "", "invoice.html?id=" + encodeURIComponent(state.invoiceId));
    await loadInvoice();
    return state.invoiceId;
  }

  async function loadDocumentData(invoiceId) {
    var items = await state.client.from("invoice_items").select("*").eq("invoice_id", invoiceId).order("position");
    if (items.error) { throw items.error; }
    return items.data || [];
  }

  async function downloadExistingPdf(invoice) {
    var result = await state.client.storage.from("invoice-pdfs").download(invoice.pdf_storage_path);
    if (result.error) { throw result.error; }
    window.AdminInvoicePdf.downloadBytes(new Uint8Array(await result.data.arrayBuffer()), invoice.invoice_number + ".pdf");
  }

  async function generatePdf(invoice) {
    var items = await loadDocumentData(invoice.id);
    state.assets = state.assets || await window.AdminInvoicePdf.loadBrowserAssets();
    var pdf = await window.AdminInvoicePdf.buildInvoicePdf(invoice, items, state.assets);
    state.invoice = await window.AdminInvoicePdf.archivePdf(state.client, invoice, pdf);
    window.AdminInvoicePdf.downloadBytes(pdf.bytes, pdf.fileName);
    return state.invoice;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (state.busy) { return; }
    hideError();
    setBusy(true);
    try {
      if (state.invoice && state.invoice.status !== "draft") {
        if (state.invoice.pdf_storage_path) { await downloadExistingPdf(state.invoice); }
        else { await generatePdf(state.invoice); }
        return;
      }
      var invoiceId = await saveDraft();
      var issued = await state.client.rpc("issue_invoice", { p_invoice_id: invoiceId });
      if (issued.error) { throw issued.error; }
      state.invoice = issued.data;
      try {
        await generatePdf(state.invoice);
        window.AdminUI.toast(t("invoiceEditor.issuePdfSuccess"), "success");
      } catch (pdfError) {
        window.AdminUI.toast(t("invoiceEditor.issuePdfPending"), "error");
      }
      lockIssuedInvoice();
      renderPreview();
    } catch (error) {
      showError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function wireEvents() {
    getElement("invoiceForm").addEventListener("submit", handleSubmit);
    getElement("invoiceForm").addEventListener("input", renderPreview);
    getElement("invoiceForm").addEventListener("change", renderPreview);
    getElement("customerName").addEventListener("change", function () {
      var customer = customerByName(getElement("customerName").value);
      if (customer) { applyCustomer(customer); }
      else { state.selectedCustomerId = null; }
    });
    getElement("customerAddress").addEventListener("input", syncAdvancedAddress);
    ["streetAddress", "postalCode", "city"].forEach(function (id) { getElement(id).addEventListener("input", syncQuickAddress); });
    getElement("servicePreset").addEventListener("change", function () {
      getElement("customServiceWrap").hidden = getElement("servicePreset").value !== "Sonstige";
      renderPreview();
    });
    getElement("multipleItems").addEventListener("change", toggleMultipleItems);
    getElement("addItemBtn").addEventListener("click", function () { addAdvancedItem(); renderPreview(); });
    getElement("advancedItems").addEventListener("click", function (event) {
      var remove = event.target.closest("[data-remove-item]");
      if (remove && getElement("advancedItems").children.length > 1) { remove.closest(".invoice-item-editor").remove(); renderPreview(); }
    });
    getElement("advancedItems").addEventListener("change", function (event) {
      if (event.target.matches("[data-item-unit]")) {
        event.target.closest(".invoice-item-editor").querySelector("[data-custom-unit-wrap]").hidden = event.target.value !== "custom";
      }
    });
    getElement("saveDraftBtn").addEventListener("click", async function () {
      hideError(); setBusy(true);
      try { await saveDraft(); window.AdminUI.toast(t("invoiceEditor.draftSaved"), "success"); }
      catch (error) { showError(errorMessage(error)); }
      finally { setBusy(false); }
    });
    getElement("previewBtn").addEventListener("click", function () { renderPreview(); getElement("previewPanel").scrollIntoView({ behavior: "smooth", block: "start" }); });
  }

  function initializeDefaults() {
    var today = core.todayIso();
    getElement("invoiceDate").value = today;
    getElement("serviceDate").value = today;
    getElement("grossAmount").value = "0,00";
    createServiceOptions();
    wireEvents();
  }

  initializeDefaults();
  window.AdminAuth.requireSession().then(async function (profile) {
    if (!profile) { return; }
    window.AdminUI.applyRoleGatedNav(profile.role);
    window.AdminAuth.requireRole(profile, "super_admin");
    if (profile.role !== "super_admin") { return; }
    state.profile = profile;
    state.client = window.AdminSupabase.getClient();
    getElement("topbarUser").textContent = profile.email;
    getElement("adminShell").hidden = false;
    try {
      await loadReferenceData();
      await loadInvoice();
      renderPreview();
    } catch (error) {
      showError(errorMessage(error));
    }
  });

  getElement("logoutBtn").addEventListener("click", function () {
    window.AdminAuth.signOut().then(function () { window.location.href = "index.html"; });
  });
})();
