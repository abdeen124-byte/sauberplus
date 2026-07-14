/**
 * DOM wiring for admin/reset-password.html — the landing page the
 * password-reset email links to. Supabase's client (configured with
 * detectSessionInUrl: true in admin-supabase-client.js) parses the recovery
 * token out of the URL fragment automatically before this script runs and
 * establishes a temporary recovery session; this page just has to detect
 * whether that succeeded and either show the "set new password" form or an
 * "invalid/expired link" state.
 */
(function () {
  "use strict";

  function getElement(id) {
    return document.getElementById(id);
  }

  function showError(element, message) {
    element.textContent = message;
    element.setAttribute("data-visible", "true");
  }

  function hideError(element) {
    element.setAttribute("data-visible", "false");
    element.textContent = "";
  }

  function setLoading(button, loading) {
    button.disabled = loading;
    button.setAttribute("data-loading", String(loading));
  }

  function initPasswordToggle() {
    var toggle = getElement("toggleNewPassword");
    var input = getElement("newPassword");
    toggle.addEventListener("click", function () {
      var showing = input.type === "text";
      input.type = showing ? "password" : "text";
      toggle.setAttribute("aria-pressed", String(!showing));
    });
  }

  function showInvalidState() {
    getElement("formState").hidden = true;
    getElement("invalidState").hidden = false;
  }

  function showSuccessState() {
    getElement("formState").hidden = true;
    getElement("successState").hidden = false;
    window.setTimeout(function () {
      window.location.href = "index.html";
    }, 2500);
  }

  function initForm() {
    var form = getElement("resetForm");
    var errorEl = getElement("resetError");
    var submitBtn = getElement("resetSubmit");

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      hideError(errorEl);

      var password = getElement("newPassword").value;
      var confirmPassword = getElement("confirmPassword").value;

      if (password.length < 8) {
        showError(errorEl, window.AdminI18N.t("resetPw.errors.tooShort"));
        return;
      }
      if (password !== confirmPassword) {
        showError(errorEl, window.AdminI18N.t("resetPw.errors.mismatch"));
        return;
      }

      setLoading(submitBtn, true);

      window.AdminSupabase.getClient()
        .auth.updateUser({ password: password })
        .then(function (result) {
          setLoading(submitBtn, false);
          if (result.error) {
            showError(errorEl, window.AdminI18N.t("resetPw.errors.saveFailed"));
            return;
          }
          showSuccessState();
        })
        .catch(function () {
          setLoading(submitBtn, false);
          showError(errorEl, window.AdminI18N.t("common.connectionError"));
        });
    });
  }

  initPasswordToggle();
  initForm();

  window.AdminSupabase.getClient()
    .auth.getSession()
    .then(function (result) {
      if (!result.data.session) {
        showInvalidState();
      }
    });
})();
