(function () {
  "use strict";
  var core = window.AdminExpenseCore;
  var t = window.AdminI18N.t;
  var state = { client: null, summary: [], profiles: [], advances: [], transactions: [] };
  var byId = function (id) { return document.getElementById(id); };
  function lang() { return window.AdminI18N.getLang ? window.AdminI18N.getLang() : "de"; }
  function esc(value) { return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]; }); }
  function date(value) { return value ? new Intl.DateTimeFormat(lang() === "ar" ? "ar-DE" : "de-DE").format(new Date(value + "T12:00:00Z")) : t("partners.unknownDate"); }
  function stateText(value) { var labels = { de: { no_target: "Kein Ziel", complete: "Vollständig", over: "Über Ziel", unpaid: "Offen", partial: "Teilweise" }, ar: { no_target: "دون هدف", complete: "مكتمل", over: "فوق الهدف", unpaid: "مفتوح", partial: "جزئي" } }; return labels[lang()][value]; }
  function partnerName(item) {
    var profile = state.profiles.find(function (candidate) { return String(candidate.id) === String(item.partner_id); });
    return profile && profile.display_name || item.display_name || "Gesellschafter";
  }
  function renderSummary() {
    byId("partnerSummary").innerHTML = state.summary.map(function (item) {
      var financialState = core.contributionState(item.target_cents == null ? null : Number(item.target_cents), Number(item.contribution_cents));
      var percentage = item.target_cents > 0 ? Math.min(100, Math.round(Number(item.contribution_cents) * 100 / Number(item.target_cents))) : 0;
      return '<article class="partner-account" data-state="' + financialState + '"><header><div><span>' + esc(t("partners.partner")) + '</span><h2>' + esc(partnerName(item)) + '</h2></div><b>' + esc(stateText(financialState)) + '</b></header><div class="partner-money"><strong>' + esc(core.formatMoney(Number(item.contribution_cents), lang())) + '</strong><span>' + esc(t("partners.ofTarget")) + ' ' + esc(item.target_cents == null ? "—" : core.formatMoney(Number(item.target_cents), lang())) + '</span></div><div class="partner-progress"><i style="width:' + percentage + '%"></i></div><dl><div><dt>' + esc(t("partners.privateAdvances")) + '</dt><dd>' + esc(core.formatMoney(Number(item.advance_cents), lang())) + '</dd></div><div><dt>' + esc(t("partners.openReimbursement")) + '</dt><dd>' + esc(core.formatMoney(Number(item.open_reimbursement_cents), lang())) + '</dd></div></dl><form class="partner-target" data-target-form="' + item.partner_id + '"><label>' + esc(t("partners.target")) + '<input inputmode="decimal" value="' + (item.target_cents == null ? "" : (Number(item.target_cents) / 100).toFixed(2).replace(".", ",")) + '" placeholder="—"></label><button class="btn-secondary" type="submit">' + esc(t("common.save")) + "</button></form></article>";
    }).join("");
  }
  function openAmounts() {
    var paid = {};
    state.transactions.filter(function (tx) { return tx.transaction_type === "reimbursement"; }).forEach(function (tx) { paid[tx.related_expense_id] = (paid[tx.related_expense_id] || 0) + Number(tx.amount_cents); });
    state.transactions.filter(function (tx) { return tx.transaction_type === "reversal" && tx.reverses_transaction_id; }).forEach(function (tx) { var source = state.transactions.find(function (candidate) { return candidate.id === tx.reverses_transaction_id && candidate.transaction_type === "reimbursement"; }); if (source) paid[source.related_expense_id] = (paid[source.related_expense_id] || 0) - Number(tx.amount_cents); });
    return state.advances.map(function (expense) { var open = Number(expense.total_cents) - (paid[expense.id] || 0); return { expense: expense, open: Math.max(0, open) }; }).filter(function (row) { return row.open > 0; });
  }
  function renderAdvances() {
    var rows = openAmounts();
    if (!rows.length) { byId("advanceList").innerHTML = '<div class="admin-empty-state"><strong>' + esc(t("partners.noOpenAdvances")) + "</strong></div>"; return; }
    byId("advanceList").innerHTML = '<div class="partner-advance-list">' + rows.map(function (row) { var expense = row.expense; return '<article><div><span>' + esc(expense.expense_number) + ' · ' + esc(date(expense.expense_date)) + '</span><strong>' + esc(expense.supplier_name) + '</strong><small>' + esc(expense.partner_financial_profiles.display_name) + '</small></div><div><strong>' + esc(core.formatMoney(row.open, lang())) + '</strong><button class="btn-secondary" data-reimburse="' + expense.id + '" data-amount="' + row.open + '">' + esc(t("partners.reimburse")) + "</button></div></article>"; }).join("") + "</div>";
  }
  function renderHistory() {
    var labels = { opening_contribution: t("partners.opening"), contribution: t("partners.contribution"), expense_advance: t("partners.advance"), reimbursement: t("partners.reimbursement"), reversal: t("partners.reversal"), adjustment: t("partners.adjustment") };
    var reversed = new Set(state.transactions.map(function (tx) { return tx.reverses_transaction_id; }).filter(Boolean));
    byId("partnerHistory").innerHTML = '<div class="partner-history">' + state.transactions.map(function (tx) { var profile = state.profiles.find(function (item) { return item.id === tx.partner_id; }); var canReverse = ["opening_contribution", "contribution", "adjustment", "reimbursement"].indexOf(tx.transaction_type) >= 0 && !reversed.has(tx.id); return '<article><span class="transaction-mark" data-type="' + tx.transaction_type + '"></span><div><strong>' + esc(labels[tx.transaction_type] || tx.transaction_type) + '</strong><small>' + esc((profile && profile.display_name || "") + " · " + date(tx.transaction_date)) + '</small></div><b>' + esc(core.formatMoney(Number(tx.amount_cents), lang())) + '</b>' + (canReverse ? '<button class="invoice-action-link invoice-action-danger" data-reverse="' + tx.id + '">' + esc(t("partners.correct")) + "</button>" : "") + "</article>"; }).join("") + "</div>";
  }
  async function load() {
    var results = await Promise.all([
      state.client.rpc("partner_financial_summary"), state.client.from("partner_financial_profiles").select("id,display_name,target_cents").eq("active", true).order("display_name"),
      state.client.from("expenses").select("id,expense_number,supplier_name,expense_date,total_cents,paid_by_partner_id,partner_financial_profiles!expenses_paid_by_partner_id_fkey(display_name)").eq("paid_by_type", "partner").neq("status", "cancelled").order("expense_date", { ascending: false }),
      state.client.from("partner_transactions").select("id,partner_id,transaction_type,amount_cents,transaction_date,date_precision,payment_method,related_expense_id,reverses_transaction_id,note,created_at").order("created_at", { ascending: false }).limit(250)
    ]);
    var failed = results.find(function (result) { return result.error; }); if (failed) throw failed.error;
    state.summary = results[0].data || []; state.profiles = results[1].data || []; state.advances = results[2].data || []; state.transactions = results[3].data || [];
    var options = state.profiles.map(function (item) { return '<option value="' + item.id + '">' + esc(item.display_name) + "</option>"; }).join(""); byId("contributionPartner").innerHTML = options;
    renderSummary(); renderAdvances(); renderHistory();
  }
  byId("openContribution").addEventListener("click", function () { byId("contributionDate").value = core.isoToday(); window.AdminUI.openModal(byId("contributionModal")); });
  byId("contributionForm").addEventListener("submit", async function (event) { event.preventDefault(); try { var result = await state.client.rpc("add_partner_contribution", { p_partner_id: byId("contributionPartner").value, p_amount_cents: core.parseMoney(byId("contributionAmount").value), p_date: byId("contributionDate").value, p_payment_method: byId("contributionPayment").value, p_note: byId("contributionNote").value, p_proof_receipt_id: null }); if (result.error) throw result.error; window.AdminUI.closeModal(byId("contributionModal")); event.target.reset(); window.AdminUI.toast(t("partners.contributionSaved"), "success"); await load(); } catch (error) { window.AdminUI.toast(error.message, "error"); } });
  byId("partnerSummary").addEventListener("submit", async function (event) { var form = event.target.closest("[data-target-form]"); if (!form) return; event.preventDefault(); try { var input = form.querySelector("input"); var result = await state.client.rpc("set_partner_target", { p_partner_id: form.dataset.targetForm, p_target_cents: input.value.trim() ? core.parseMoney(input.value) : null }); if (result.error) throw result.error; window.AdminUI.toast(t("partners.targetSaved"), "success"); await load(); } catch (error) { window.AdminUI.toast(error.message, "error"); } });
  byId("advanceList").addEventListener("click", async function (event) { var button = event.target.closest("[data-reimburse]"); if (!button) return; var ok = await window.AdminUI.confirmDialog({ title: t("partners.reimburse"), message: t("partners.reimburseConfirm") + " " + core.formatMoney(Number(button.dataset.amount), lang()) }); if (!ok) return; var result = await state.client.rpc("reimburse_partner_expense", { p_expense_id: button.dataset.reimburse, p_amount_cents: Number(button.dataset.amount), p_date: core.isoToday(), p_payment_method: "bank_transfer", p_note: "", p_proof_receipt_id: null }); if (result.error) return window.AdminUI.toast(result.error.message, "error"); window.AdminUI.toast(t("partners.reimbursed"), "success"); load().catch(function (e) { window.AdminUI.toast(e.message, "error"); }); });
  byId("partnerHistory").addEventListener("click", async function (event) { var button = event.target.closest("[data-reverse]"); if (!button) return; var ok = await window.AdminUI.confirmDialog({ title: t("partners.correct"), message: t("partners.correctConfirm"), danger: true }); if (!ok) return; var result = await state.client.rpc("reverse_partner_transaction", { p_transaction_id: button.dataset.reverse, p_date: core.isoToday(), p_note: t("partners.correctionNote") }); if (result.error) return window.AdminUI.toast(result.error.message, "error"); window.AdminUI.toast(t("partners.corrected"), "success"); load().catch(function (e) { window.AdminUI.toast(e.message, "error"); }); });
  byId("logoutBtn").addEventListener("click", function () { window.AdminAuth.signOut().then(function () { window.location.href = "index.html"; }); });
  window.AdminAuth.requireSession().then(function (profile) { if (!profile) return; window.AdminUI.applyRoleGatedNav(profile.role); window.AdminAuth.requireRole(profile, "super_admin"); if (profile.role !== "super_admin") return; state.client = window.AdminSupabase.getClient(); byId("topbarUser").textContent = profile.email; byId("adminShell").hidden = false; load().catch(function (e) { window.AdminUI.toast(e.message, "error"); }); });
})();
