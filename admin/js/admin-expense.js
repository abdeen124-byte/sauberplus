(function () {
  "use strict";
  var core = window.AdminExpenseCore;
  var t = window.AdminI18N.t;
  var state = { client: null, profile: null, categories: [], partners: [], receipt: null, file: null, totals: null, duplicateConfirmed: false, extractionStatus: "manual", extractionConfidence: null };
  var byId = function (id) { return document.getElementById(id); };

  function lang() { return window.AdminI18N.getLang ? window.AdminI18N.getLang() : "de"; }
  function escapeHtml(value) { return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]; }); }
  function setStep(step) {
    var order = ["scan", "extract", "review", "save"];
    var current = order.indexOf(step);
    byId("receiptSteps").querySelectorAll("li").forEach(function (item, index) { item.classList.toggle("active", index <= current); });
  }
  function showError(error) { window.AdminUI.toast(error && error.message ? error.message : t("common.actionFailed"), "error"); }

  async function hashFile(file) {
    var buffer = await file.arrayBuffer();
    var digest = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest)).map(function (value) { return value.toString(16).padStart(2, "0"); }).join("");
  }

  function renderPreview(file) {
    var url = URL.createObjectURL(file);
    var preview = byId("receiptPreview");
    preview.hidden = false;
    preview.innerHTML = file.type === "application/pdf"
      ? '<a class="receipt-pdf-link" href="' + url + '" target="_blank" rel="noopener">' + escapeHtml(t("expenseEditor.openPdf")) + '</a><span>' + escapeHtml(file.name) + "</span>"
      : '<img src="' + url + '" alt="' + escapeHtml(file.name) + '"><span>' + escapeHtml(file.name) + "</span>";
  }

  async function uploadReceipt(file) {
    if (!file || file.size < 1 || file.size > 10485760 || ["image/jpeg", "image/png", "image/webp", "application/pdf"].indexOf(file.type) < 0) {
      throw new Error(t("expenseEditor.invalidFile"));
    }
    setStep("extract");
    var sha = await hashFile(file);
    var begun = await state.client.rpc("begin_expense_receipt", { p_original_filename: file.name, p_mime_type: file.type, p_size_bytes: file.size, p_sha256: sha });
    if (begun.error) throw begun.error;
    var receipt = begun.data;
    var uploaded = await state.client.storage.from("expense-receipts").upload(receipt.storage_path, file, { contentType: file.type, upsert: false });
    if (uploaded.error) throw uploaded.error;
    state.receipt = receipt;
    state.file = file;
    renderPreview(file);
    try {
      var session = await state.client.auth.getSession();
      var response = await fetch("https://api.sauberplus.plus/api/expense-extract", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.data.session.access_token },
        body: JSON.stringify({ receiptId: receipt.id })
      });
      if (response.ok) applyExtraction((await response.json()).extraction);
    } catch (_) { /* Manual review remains available and visible. */ }
    setStep("review");
  }

  function applyExtraction(data) {
    if (!data) return;
    state.extractionStatus = "reviewed_ai"; state.extractionConfidence = Number.isInteger(data.confidence) ? data.confidence : null;
    byId("supplierName").value = data.supplier_name || "";
    byId("documentNumber").value = data.supplier_document_number || "";
    byId("expenseDate").value = data.expense_date || core.isoToday();
    byId("description").value = data.description || "";
    if (data.total_cents) byId("totalAmount").value = (data.total_cents / 100).toFixed(2).replace(".", ",");
    if (data.tax_rate_bps !== null) byId("taxRate").value = String(data.tax_rate_bps);
    byId("paymentMethod").value = data.payment_method || "unknown";
    var category = state.categories.find(function (item) { return item.code === data.category_code; });
    if (category) byId("categoryId").value = category.id;
    byId("extractionNotice").dataset.kind = data.confidence >= 80 ? "success" : "warning";
    byId("extractionNotice").textContent = t("expenseEditor.extracted") + " " + data.confidence + "%";
    calculateTotals();
  }

  function renderSelects() {
    byId("categoryId").innerHTML = state.categories.map(function (category) {
      return '<option value="' + category.id + '" data-code="' + category.code + '">' + escapeHtml(lang() === "ar" ? category.label_ar : category.label_de) + "</option>";
    }).join("");
    var partners = state.partners.map(function (partner) { return '<option value="' + partner.id + '">' + escapeHtml(partner.display_name) + "</option>"; }).join("");
    byId("paidByPartner").innerHTML = partners;
  }

  function calculateTotals() {
    try {
      if (byId("taxRate").value === "mixed") {
        var rows = Array.from(document.querySelectorAll("[data-mixed-rate]")).map(function (input) {
          return input.value.trim() ? { rateBps: Number(input.dataset.mixedRate), gross: input.value } : null;
        }).filter(Boolean);
        state.totals = core.normalizeMixedRows(rows);
        byId("totalAmount").value = (state.totals.totalCents / 100).toFixed(2).replace(".", ",");
      } else {
        state.totals = core.totalsFromGross(core.parseMoney(byId("totalAmount").value), Number(byId("taxRate").value));
      }
      var values = [state.totals.subtotalCents, state.totals.taxCents, state.totals.totalCents];
      byId("receiptTotals").querySelectorAll("b").forEach(function (node, index) { node.textContent = core.formatMoney(values[index], lang()); });
    } catch (_) {
      state.totals = null;
      byId("receiptTotals").querySelectorAll("b").forEach(function (node) { node.textContent = "—"; });
    }
  }

  function payload() {
    calculateTotals();
    if (!state.totals) throw new Error(t("expenseEditor.invalidMoney"));
    var selectedCategory = byId("categoryId").selectedOptions[0];
    var isMixed = byId("taxRate").value === "mixed";
    return {
      supplier_name: byId("supplierName").value.trim(), supplier_document_number: byId("documentNumber").value.trim(), expense_date: byId("expenseDate").value,
      category_id: byId("categoryId").value, custom_category: selectedCategory && selectedCategory.dataset.code === "other" ? byId("customCategory").value.trim() || null : null,
      description: byId("description").value.trim(), subtotal_cents: state.totals.subtotalCents, tax_cents: state.totals.taxCents, total_cents: state.totals.totalCents,
      tax_rate_bps: isMixed ? null : Number(byId("taxRate").value), tax_breakdown: isMixed ? state.totals.rows : [], payment_method: byId("paymentMethod").value,
      paid_by_type: byId("paidByType").value, paid_by_partner_id: byId("paidByType").value === "partner" ? byId("paidByPartner").value : null,
      status: byId("expenseStatus").value, extraction_status: state.extractionStatus, extraction_confidence: state.extractionConfidence, duplicate_confirmed: state.duplicateConfirmed, notes: byId("notes").value.trim()
    };
  }

  async function checkDuplicates(data) {
    var result = await state.client.rpc("find_expense_duplicates", {
      p_supplier: data.supplier_name, p_document_number: data.supplier_document_number || null, p_expense_date: data.expense_date,
      p_total_cents: data.total_cents, p_sha256: state.receipt ? await hashFile(state.file) : null
    });
    if (result.error) throw result.error;
    if (!result.data || !result.data.length) return true;
    var warning = byId("duplicateWarning");
    warning.hidden = false;
    warning.textContent = t("expenseEditor.duplicate") + " " + result.data.map(function (row) { return row.expense_number; }).join(", ");
    var confirmed = await window.AdminUI.confirmDialog({ title: t("expenseEditor.duplicateTitle"), message: warning.textContent, confirmLabel: t("expenseEditor.saveAnyway") });
    state.duplicateConfirmed = confirmed;
    return confirmed;
  }

  async function save(event) {
    event.preventDefault();
    var button = byId("saveExpense");
    button.disabled = true;
    try {
      var data = payload();
      if (!data.supplier_name || !data.expense_date || !data.category_id || !data.description || (data.paid_by_type === "partner" && !data.paid_by_partner_id)) throw new Error(t("expenseEditor.required"));
      if (!state.duplicateConfirmed && !await checkDuplicates(data)) return;
      data.duplicate_confirmed = state.duplicateConfirmed;
      var saved = await state.client.rpc("save_expense", { p_expense: data, p_receipt_id: state.receipt && state.receipt.id || null });
      if (saved.error) throw saved.error;
      setStep("save");
      window.AdminUI.toast(t("expenseEditor.saved") + " " + saved.data.expense_number, "success");
      window.location.href = "expenses.html";
    } catch (error) { showError(error); } finally { button.disabled = false; }
  }

  byId("receiptFile").addEventListener("change", function (event) { uploadReceipt(event.target.files[0]).catch(showError); });
  byId("expenseForm").addEventListener("submit", save);
  byId("totalAmount").addEventListener("input", calculateTotals);
  byId("taxRate").addEventListener("change", function () { byId("mixedTax").hidden = this.value !== "mixed"; byId("totalAmount").readOnly = this.value === "mixed"; calculateTotals(); });
  document.querySelectorAll("[data-mixed-rate]").forEach(function (input) { input.addEventListener("input", calculateTotals); });
  byId("paidByType").addEventListener("change", function () { byId("partnerWrap").hidden = this.value !== "partner"; });
  byId("categoryId").addEventListener("change", function () { var option = this.selectedOptions[0]; byId("customCategoryWrap").hidden = !option || option.dataset.code !== "other"; });
  byId("logoutBtn").addEventListener("click", function () { window.AdminAuth.signOut().then(function () { window.location.href = "index.html"; }); });

  window.AdminAuth.requireSession().then(async function (profile) {
    if (!profile) return;
    window.AdminUI.applyRoleGatedNav(profile.role); window.AdminAuth.requireRole(profile, "super_admin"); if (profile.role !== "super_admin") return;
    state.client = window.AdminSupabase.getClient(); state.profile = profile; byId("topbarUser").textContent = profile.email; byId("adminShell").hidden = false; byId("expenseDate").value = core.isoToday();
    var results = await Promise.all([
      state.client.from("expense_categories").select("id,code,label_de,label_ar").eq("active", true).order("position"),
      state.client.from("partner_financial_profiles").select("id,display_name").eq("active", true).order("display_name")
    ]);
    if (results[0].error || results[1].error) return showError(results[0].error || results[1].error);
    state.categories = results[0].data || []; state.partners = results[1].data || []; renderSelects();
  });
})();
