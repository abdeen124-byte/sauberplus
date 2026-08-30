(function () {
  "use strict";
  var core = window.AdminExpenseCore;
  var t = window.AdminI18N.t;
  var state = { client: null, expenses: [], search: "", status: "", from: "", to: "" };
  var byId = function (id) { return document.getElementById(id); };
  function lang() { return window.AdminI18N.getLang ? window.AdminI18N.getLang() : "de"; }
  function esc(value) { return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]; }); }
  function date(value) { return value ? new Intl.DateTimeFormat(lang() === "ar" ? "ar-DE" : "de-DE").format(new Date(value + "T12:00:00Z")) : "—"; }
  function statusLabel(status) { var labels = { de: { draft: "Entwurf", reviewed: "Geprüft", paid: "Bezahlt", cancelled: "Storniert" }, ar: { draft: "مسودة", reviewed: "تمت المراجعة", paid: "مدفوعة", cancelled: "ملغاة" } }; return (labels[lang()] || labels.de)[status] || status; }
  function filtered() {
    var needle = state.search.toLowerCase().trim();
    return state.expenses.filter(function (item) {
      return (!state.status || item.status === state.status) && (!state.from || item.expense_date >= state.from) && (!state.to || item.expense_date <= state.to) &&
        (!needle || String(item.expense_number + " " + item.supplier_name + " " + item.description).toLowerCase().includes(needle));
    });
  }
  function renderSummary(overview) {
    var net = Number(overview.income_cents || 0) - Number(overview.expense_cents || 0);
    var rows = [
      [t("expenses.income"), overview.income_cents || 0, "income"], [t("expenses.outgoing"), overview.expense_cents || 0, "expense"],
      [t("expenses.result"), net, net < 0 ? "negative" : "result"], [t("expenses.openAdvances"), overview.open_advance_cents || 0, "advance"],
      [t("expenses.contributions"), overview.contribution_cents || 0, "contribution"], [t("expenses.reimbursements"), overview.reimbursement_cents || 0, "reimbursement"]
    ];
    byId("financeSummary").innerHTML = rows.map(function (row) { return '<article data-tone="' + row[2] + '"><span>' + esc(row[0]) + '</span><strong>' + esc(core.formatMoney(Number(row[1]), lang())) + "</strong></article>"; }).join("");
  }
  async function refreshOverview() {
    var result = await state.client.rpc("financial_overview", { p_from: state.from, p_to: state.to });
    if (result.error) throw result.error;
    renderSummary(result.data || {});
  }
  function renderList() {
    var rows = filtered(); byId("expenseCount").textContent = rows.length + " " + t("expenses.entries");
    if (!rows.length) { byId("expenseList").innerHTML = '<div class="admin-empty-state"><strong>' + esc(t("expenses.empty")) + "</strong></div>"; return; }
    byId("expenseList").innerHTML = '<div class="expense-table-wrap"><table class="expense-table"><thead><tr><th>' + esc(t("expenses.number")) + '</th><th>' + esc(t("expenseEditor.supplier")) + '</th><th>' + esc(t("expenseEditor.date")) + '</th><th>' + esc(t("expenseEditor.category")) + '</th><th>' + esc(t("expenseEditor.total")) + '</th><th>Status</th><th></th></tr></thead><tbody>' + rows.map(function (item) {
      var category = item.expense_categories || {};
      var receipt = item.expense_receipts && item.expense_receipts[0];
      var actions = receipt ? '<button class="invoice-action-link" data-receipt-path="' + esc(receipt.storage_path) + '" data-receipt-name="' + esc(receipt.original_filename) + '">' + esc(t("expenses.receipt")) + "</button>" : "";
      if (item.status === "draft") actions += '<button class="invoice-action-link" data-finalize="' + item.id + '">' + esc(t("expenses.finalize")) + "</button>";
      if (item.status !== "cancelled") actions += '<button class="invoice-action-link invoice-action-danger" data-cancel="' + item.id + '">' + esc(t("expenses.cancel")) + "</button>";
      return '<tr><td data-label="' + esc(t("expenses.number")) + '"><strong>' + esc(item.expense_number) + '</strong></td><td data-label="' + esc(t("expenseEditor.supplier")) + '"><strong>' + esc(item.supplier_name) + '</strong><small>' + esc(item.description) + '</small></td><td data-label="' + esc(t("expenseEditor.date")) + '">' + date(item.expense_date) + '</td><td data-label="' + esc(t("expenseEditor.category")) + '">' + esc(item.custom_category || (lang() === "ar" ? category.label_ar : category.label_de) || "—") + '</td><td data-label="' + esc(t("expenseEditor.total")) + '"><strong>' + esc(core.formatMoney(Number(item.total_cents), lang())) + '</strong><small>' + esc(core.formatMoney(Number(item.tax_cents), lang())) + ' ' + esc(t("expenseEditor.vat")) + '</small></td><td data-label="' + esc(t("expenses.status")) + '"><span class="expense-status" data-status="' + item.status + '">' + esc(statusLabel(item.status)) + '</span></td><td><div class="invoice-row-actions">' + actions + "</div></td></tr>";
    }).join("") + "</tbody></table></div>";
  }
  async function load() {
    var now = new Date(); var from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10); var to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    state.from = state.from || from; state.to = state.to || to; byId("dateFrom").value = state.from; byId("dateTo").value = state.to;
    var results = await Promise.all([
      state.client.from("expenses").select("id,expense_number,supplier_name,description,expense_date,total_cents,tax_cents,status,custom_category,expense_categories(label_de,label_ar),expense_receipts(storage_path,original_filename,mime_type)").order("expense_date", { ascending: false }),
      state.client.rpc("financial_overview", { p_from: state.from, p_to: state.to })
    ]);
    if (results[0].error || results[1].error) throw results[0].error || results[1].error;
    state.expenses = results[0].data || []; renderSummary(results[1].data || {}); renderList();
  }
  ["expenseSearch", "dateFrom", "dateTo", "statusFilter"].forEach(function (id) { byId(id).addEventListener("input", function () { var previousFrom = state.from; var previousTo = state.to; state.search = byId("expenseSearch").value; state.from = byId("dateFrom").value; state.to = byId("dateTo").value; state.status = byId("statusFilter").value; renderList(); if (state.from && state.to && (state.from !== previousFrom || state.to !== previousTo)) refreshOverview().catch(function (error) { window.AdminUI.toast(error.message, "error"); }); }); });
  byId("expenseList").addEventListener("click", async function (event) {
    var receiptButton = event.target.closest("[data-receipt-path]");
    if (receiptButton) { var downloaded = await state.client.storage.from("expense-receipts").download(receiptButton.dataset.receiptPath); if (downloaded.error) return window.AdminUI.toast(downloaded.error.message, "error"); var url = URL.createObjectURL(downloaded.data); var link = document.createElement("a"); link.href = url; link.download = receiptButton.dataset.receiptName || "Beleg"; link.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 2000); return; }
    var finalizeButton = event.target.closest("[data-finalize]");
    if (finalizeButton) { var finalResult = await state.client.rpc("finalize_expense_draft", { p_expense_id: finalizeButton.dataset.finalize, p_status: "paid" }); if (finalResult.error) return window.AdminUI.toast(finalResult.error.message, "error"); window.AdminUI.toast(t("expenses.finalized"), "success"); return load(); }
    var button = event.target.closest("[data-cancel]"); if (!button) return; var ok = await window.AdminUI.confirmDialog({ title: t("expenses.cancelTitle"), message: t("expenses.cancelMessage"), danger: true }); if (!ok) return; var result = await state.client.rpc("cancel_expense", { p_expense_id: button.dataset.cancel, p_reason: null }); if (result.error) return window.AdminUI.toast(result.error.message, "error"); window.AdminUI.toast(t("expenses.cancelled"), "success"); load().catch(function (e) { window.AdminUI.toast(e.message, "error"); });
  });
  byId("logoutBtn").addEventListener("click", function () { window.AdminAuth.signOut().then(function () { window.location.href = "index.html"; }); });
  window.AdminAuth.requireSession().then(function (profile) { if (!profile) return; window.AdminUI.applyRoleGatedNav(profile.role); window.AdminAuth.requireRole(profile, "super_admin"); if (profile.role !== "super_admin") return; state.client = window.AdminSupabase.getClient(); byId("topbarUser").textContent = profile.email; byId("adminShell").hidden = false; load().catch(function (e) { window.AdminUI.toast(e.message, "error"); }); });
})();
