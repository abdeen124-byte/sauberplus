/**
 * DOM wiring for admin/index.html only: particle background, password
 * visibility toggle, the login <-> forgot-password view swap, and both
 * forms' submit handlers. The actual auth calls live in admin-auth.js.
 */
(function () {
  "use strict";

  function getElement(id) {
    return document.getElementById(id);
  }

  function initParticles() {
    var container = getElement("bubs");
    if (!container) {
      return;
    }

    ["rgba(46,107,230,.25)", "rgba(45,179,74,.2)", "rgba(255,255,255,.07)"].forEach(function (color) {
      for (var index = 0; index < 6; index += 1) {
        var bubble = document.createElement("div");
        var size = Math.random() * 14 + 5;

        bubble.className = "bub";
        bubble.style.width = size + "px";
        bubble.style.height = size + "px";
        bubble.style.left = Math.random() * 100 + "%";
        bubble.style.background = color;
        bubble.style.animationDuration = Math.random() * 10 + 8 + "s";
        bubble.style.animationDelay = Math.random() * 8 + "s";

        container.appendChild(bubble);
      }
    });
  }

  function initPasswordToggle() {
    var toggle = getElement("togglePassword");
    var input = getElement("loginPassword");
    if (!toggle || !input) {
      return;
    }

    toggle.addEventListener("click", function () {
      var showing = input.type === "text";
      input.type = showing ? "password" : "text";
      toggle.setAttribute("aria-pressed", String(!showing));
      toggle.setAttribute("aria-label", window.AdminI18N.t(showing ? "login.passwordShow" : "login.passwordHide"));
    });
  }

  function showError(element, message) {
    if (!element) {
      return;
    }
    element.textContent = message;
    element.setAttribute("data-visible", "true");
  }

  function hideError(element) {
    if (!element) {
      return;
    }
    element.setAttribute("data-visible", "false");
    element.textContent = "";
  }

  function setLoading(button, loading) {
    if (!button) {
      return;
    }
    button.disabled = loading;
    button.setAttribute("data-loading", String(loading));
  }

  function initViewSwap() {
    var loginView = getElement("loginView");
    var forgotView = getElement("forgotView");
    var showForgot = getElement("showForgotPassword");
    var showLogin = getElement("showLoginView");

    if (!loginView || !forgotView || !showForgot || !showLogin) {
      return;
    }

    showForgot.addEventListener("click", function (event) {
      event.preventDefault();
      loginView.hidden = true;
      forgotView.hidden = false;
      var emailValue = getElement("loginEmail").value;
      if (emailValue) {
        getElement("forgotEmail").value = emailValue;
      }
    });

    showLogin.addEventListener("click", function (event) {
      event.preventDefault();
      forgotView.hidden = true;
      loginView.hidden = false;
    });
  }

  function initLoginForm() {
    var form = getElement("loginForm");
    if (!form) {
      return;
    }

    var errorEl = getElement("loginError");
    var submitBtn = getElement("loginSubmit");

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      hideError(errorEl);
      setLoading(submitBtn, true);

      var email = getElement("loginEmail").value;
      var password = getElement("loginPassword").value;
      var remember = getElement("rememberMe").checked;

      window.AdminAuth.signIn(email, password, remember)
        .then(function (result) {
          if (result.ok) {
            window.location.href = "dashboard.html";
            return;
          }
          setLoading(submitBtn, false);
          showError(errorEl, result.message);
        })
        .catch(function () {
          setLoading(submitBtn, false);
          showError(errorEl, window.AdminI18N.t("common.connectionError"));
        });
    });
  }

  function initForgotForm() {
    var form = getElement("forgotForm");
    if (!form) {
      return;
    }

    var errorEl = getElement("forgotError");
    var successEl = getElement("forgotSuccess");
    var submitBtn = getElement("forgotSubmit");

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      hideError(errorEl);
      hideError(successEl);
      setLoading(submitBtn, true);

      var email = getElement("forgotEmail").value.trim().toLowerCase();
      var redirectTo = window.location.origin + window.location.pathname.replace(/index\.html$/, "") + "reset-password.html";

      window.AdminSupabase.getClient()
        .auth.resetPasswordForEmail(email, { redirectTo: redirectTo })
        .then(function () {
          setLoading(submitBtn, false);
          // Always shows the same success message whether or not the email
          // exists — same enumeration-safety principle as the sign-in error.
          showError(successEl, window.AdminI18N.t("login.forgotSuccess"));
          form.reset();
        })
        .catch(function () {
          setLoading(submitBtn, false);
          showError(errorEl, window.AdminI18N.t("common.connectionError"));
        });
    });
  }

  function redirectIfAlreadySignedIn() {
    window.AdminSupabase.getClient()
      .auth.getSession()
      .then(function (result) {
        if (result.data.session) {
          window.location.href = "dashboard.html";
        }
      });
  }

  function showReasonMessage() {
    var params = new URLSearchParams(window.location.search);
    var reason = params.get("reason");
    if (!reason) {
      return;
    }

    var messageKeys = {
      idle: "login.errors.idleLogout",
      disabled: "login.errors.accountDisabled"
    };

    if (messageKeys[reason]) {
      showError(getElement("loginError"), window.AdminI18N.t(messageKeys[reason]));
    }
  }

  initParticles();
  initPasswordToggle();
  initViewSwap();
  initLoginForm();
  initForgotForm();
  showReasonMessage();

  if (window.AdminSupabase.isConfigured()) {
    redirectIfAlreadySignedIn();
  }
})();
