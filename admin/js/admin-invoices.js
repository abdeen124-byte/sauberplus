(function () {
  "use strict";

  var core = window.AdminInvoiceCore;
  var t = window.AdminI18N.t;
  var state = { client: null, profile: null, invoices: [], status: "", search: "", assets: null };

  function getElement(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function language() {
    return window.AdminI18N.getLang ? window.AdminI18N.getLang() : document.documentElement.lang;
  }

  function badge(status) {
    return '<span class="invoice-status-badge" data-status="' + escapeHtml(status) + '">' + escapeHtml(core.statusLabel(status, language())) + "</span>";
  }

  function filteredInvoices() {
    var needle = state.search.trim().toLowerCase();
    return state.invoices.filter(function (invoice) {
      if (state.status && invoice.status !== state.status) {
        return false;
      }
      if (!needle) {
        return true;
      }
      var customer = invoice.customer_snapshot && invoice.customer_snapshot.display_name || "";
      return String(invoice.invoice_number || "").toLowerCase().includes(needle) || customer.toLowerCase().includes(needle);
    });
  }

  function actionButtons(invoice) {
    var buttons = [
      '<a class="invoice-action-link" href="invoice.html?id=' + encodeURIComponent(invoice.id) + '">' + escapeHtml(t("invoices.action.open")) + "</a>"
    ];
    if (invoice.status === "open") {
      buttons.push('<button type="button" class="invoice-action-link" data-action="paid" data-id="' + invoice.id + '">' + escapeHtml(t("invoices.action.paid")) + "</button>");
    }
    if (invoice.status === "open" || invoice.status === "paid") {
      buttons.push('<button type="button" class="invoice-action-link invoice-action-danger" data-action="cancel" data-id="' + invoice.id + '">' + escapeHtml(t("invoices.action.cancel")) + "</button>");
    }
    if (invoice.status !== "draft") {
      buttons.push('<button type="button" class="invoice-action-link" data-action="pdf" data-id="' + invoice.id + '">' + escapeHtml(invoice.pdf_storage_path ? t("invoices.action.download") : t("invoices.action.generatePdf")) + "</button>");
    }
    buttons.push('<button type="button" class="invoice-action-link" data-action="duplicate" data-id="' + invoice.id + '">' + escapeHtml(t("invoices.action.duplicate")) + "</button>");
    return buttons.join("");
  }

  function render() {
    var rows = filteredInvoices();
    if (!rows.length) {
      getElement("invoiceList").innerHTML = '<div class="admin-empty-state"><strong>' + escapeHtml(t("invoices.emptyTitle")) + '</strong><p>' + escapeHtml(t("invoices.emptyDesc")) + "</p></div>";
      return;
    }
    var html = '<div class="invoice-table-wrap"><table class="invoice-table"><thead><tr>' +
      '<th>' + escapeHtml(t("invoices.column.number")) + '</th><th>' + escapeHtml(t("invoices.column.customer")) + '</th>' +
      '<th>' + escapeHtml(t("invoices.column.invoiceDate")) + '</th><th>' + escapeHtml(t("invoices.column.serviceDate")) + '</th>' +
      '<th>' + escapeHtml(t("invoices.column.net")) + '</th><th>' + escapeHtml(t("invoices.column.vat")) + '</th>' +
      '<th>' + escapeHtml(t("invoices.column.gross")) + '</th><th>' + escapeHtml(t("invoices.column.status")) + '</th>' +
      '<th><span class="admin-visually-hidden">' + escapeHtml(t("invoices.column.actions")) + '</span></th></tr></thead><tbody>';
    rows.forEach(function (invoice) {
      var customer = invoice.customer_snapshot || {};
      html += '<tr><td data-label="' + escapeHtml(t("invoices.column.number")) + '"><strong class="invoice-number">' + escapeHtml(invoice.invoice_number || t("invoiceStatus.draft")) + '</strong><small>' + escapeHtml(invoice.pdf_storage_path ? t("invoices.pdfArchived") : invoice.status === "draft" ? "" : t("invoices.pdfPending")) + '</small></td>' +
        '<td data-label="' + escapeHtml(t("invoices.column.customer")) + '"><strong>' + escapeHtml(customer.display_name || "-") + '</strong><small>' + escapeHtml([customer.postal_code, customer.city].filter(Boolean).join(" ")) + '</small></td>' +
        '<td data-label="' + escapeHtml(t("invoices.column.invoiceDate")) + '">' + escapeHtml(core.formatDate(invoice.invoice_date, language())) + '</td>' +
        '<td data-label="' + escapeHtml(t("invoices.column.serviceDate")) + '">' + escapeHtml(core.formatDate(invoice.service_date, language())) + '</td>' +
        '<td data-label="' + escapeHtml(t("invoices.column.net")) + '">' + escapeHtml(core.formatMoney(invoice.subtotal_cents, language())) + '</td>' +
        '<td data-label="' + escapeHtml(t("invoices.column.vat")) + '">' + escapeHtml(core.formatMoney(invoice.vat_cents, language())) + '</td>' +
        '<td data-label="' + escapeHtml(t("invoices.column.gross")) + '"><strong>' + escapeHtml(core.formatMoney(invoice.total_cents, language())) + '</strong></td>' +
        '<td data-label="' + escapeHtml(t("invoices.column.status")) + '">' + badge(invoice.status) + '</td>' +
        '<td class="invoice-actions-cell"><div class="invoice-row-actions">' + actionButtons(invoice) + "</div></td></tr>";
    });
    getElement("invoiceList").innerHTML = html + "</tbody></table></div>";
  }

  async function loadInvoices() {
    getElement("invoiceList").innerHTML = '<div class="admin-loading-block">' + escapeHtml(t("common.loading")) + "</div>";
    var result = await state.client.from("invoices").select("id,invoice_number,status,customer_snapshot,invoice_date,service_date,subtotal_cents,vat_cents,total_cents,pdf_storage_path,created_at").order("created_at", { ascending: false });
    if (result.error) {
      getElement("invoiceList").innerHTML = '<div class="admin-empty-state">' + escapeHtml(t("invoices.loadError")) + "</div>";
      return;
    }
    state.invoices = result.data || [];
    render();
  }

  async function loadInvoiceDocument(invoiceId) {
    var invoiceResult = await state.client.from("invoices").select("*").eq("id", invoiceId).single();
    if (invoiceResult.error) {
      throw invoiceResult.error;
    }
    var itemsResult = await state.client.from("invoice_items").select("*").eq("invoice_id", invoiceId).order("position");
    if (itemsResult.error) {
      throw itemsResult.error;
    }
    return { invoice: invoiceResult.data, items: itemsResult.data || [] };
  }

  async function downloadArchived(invoice) {
    var result = await state.client.storage.from("invoice-pdfs").download(invoice.pdf_storage_path);
    if (result.error) {
      throw result.error;
    }
    var bytes = new Uint8Array(await result.data.arrayBuffer());
    window.AdminInvoicePdf.downloadBytes(bytes, invoice.invoice_number + ".pdf");
  }

  async function generateAndArchive(invoice) {
    var documentData = await loadInvoiceDocument(invoice.id);
    state.assets = state.assets || await window.AdminInvoicePdf.loadBrowserAssets();
    var pdf = await window.AdminInvoicePdf.buildInvoicePdf(documentData.invoice, documentData.items, state.assets);
    await window.AdminInvoicePdf.archivePdf(state.client, documentData.invoice, pdf);
    window.AdminInvoicePdf.downloadBytes(pdf.bytes, pdf.fileName);
  }

  async function handleAction(button) {
    var invoice = state.invoices.find(function (candidate) { return candidate.id === button.dataset.id; });
    if (!invoice) {
      return;
    }
    button.disabled = true;
    try {
      if (button.dataset.action === "paid") {
        var paidConfirmed = await window.AdminUI.confirmDialog({ title: t("invoices.confirmPaidTitle"), message: t("invoices.confirmPaidMessage") });
        if (!paidConfirmed) { return; }
        var paid = await state.client.rpc("mark_invoice_paid", { p_invoice_id: invoice.id });
        if (paid.error) { throw paid.error; }
        window.AdminUI.toast(t("invoices.paidSuccess"), "success");
      } else if (button.dataset.action === "cancel") {
        var cancelConfirmed = await window.AdminUI.confirmDialog({ title: t("invoices.confirmCancelTitle"), message: t("invoices.confirmCancelMessage"), confirmLabel: t("invoices.action.cancel"), danger: true });
        if (!cancelConfirmed) { return; }
        var cancelled = await state.client.rpc("cancel_invoice", { p_invoice_id: invoice.id, p_reason: null });
        if (cancelled.error) { throw cancelled.error; }
        window.AdminUI.toast(t("invoices.cancelSuccess"), "success");
      } else if (button.dataset.action === "duplicate") {
        var duplicate = await state.client.rpc("duplicate_invoice", { p_invoice_id: invoice.id });
        if (duplicate.error) { throw duplicate.error; }
        window.location.href = "invoice.html?id=" + encodeURIComponent(duplicate.data);
        return;
      } else if (button.dataset.action === "pdf") {
        if (invoice.pdf_storage_path) {
          await downloadArchived(invoice);
        } else {
          await generateAndArchive(invoice);
        }
        window.AdminUI.toast(t("invoices.pdfSuccess"), "success");
      }
      await loadInvoices();
    } catch (error) {
      window.AdminUI.toast(error && error.message ? error.message : t("common.actionFailed"), "error");
    } finally {
      button.disabled = false;
    }
  }

  getElement("invoiceSearch").addEventListener("input", function (event) {
    state.search = event.target.value;
    render();
  });
  getElement("invoiceStatusTabs").addEventListener("click", function (event) {
    var button = event.target.closest("button[data-status]");
    if (!button) { return; }
    state.status = button.dataset.status;
    getElement("invoiceStatusTabs").querySelectorAll("button").forEach(function (candidate) { candidate.classList.toggle("active", candidate === button); });
    render();
  });
  getElement("invoiceList").addEventListener("click", function (event) {
    var button = event.target.closest("button[data-action]");
    if (button) { handleAction(button); }
  });

  window.AdminAuth.requireSession().then(function (profile) {
    if (!profile) { return; }
    window.AdminUI.applyRoleGatedNav(profile.role);
    window.AdminAuth.requireRole(profile, "super_admin");
    if (profile.role !== "super_admin") { return; }
    state.profile = profile;
    state.client = window.AdminSupabase.getClient();
    getElement("topbarUser").textContent = profile.email;
    getElement("adminShell").hidden = false;
    loadInvoices();
  });

  getElement("logoutBtn").addEventListener("click", function () {
    window.AdminAuth.signOut().then(function () { window.location.href = "index.html"; });
  });
})();
