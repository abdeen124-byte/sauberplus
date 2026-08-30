/**
 * Shared chrome/UI helpers for every inner admin page: toasts, the
 * modal/dialog pattern, a promise-based confirm dialog, the mobile sidebar
 * toggle, active-nav-link marking, and role-gated nav visibility. No page
 * (announcements/gallery/users/...) should reimplement any of this.
 */
(function () {
  "use strict";

  // ---------------------------------------------------------------
  // Toasts
  // ---------------------------------------------------------------

  function ensureToastStack() {
    var stack = document.querySelector(".admin-toast-stack");
    if (!stack) {
      stack = document.createElement("div");
      stack.className = "admin-toast-stack";
      document.body.appendChild(stack);
    }
    return stack;
  }

  function toast(message, kind) {
    var stack = ensureToastStack();
    var el = document.createElement("div");
    el.className = "admin-toast";
    el.setAttribute("data-kind", kind || "info");
    el.setAttribute("role", "status");
    el.textContent = message;
    stack.appendChild(el);

    window.setTimeout(function () {
      el.style.transition = "opacity .25s";
      el.style.opacity = "0";
      window.setTimeout(function () {
        el.remove();
      }, 250);
    }, 4000);
  }

  // ---------------------------------------------------------------
  // Modal
  // ---------------------------------------------------------------

  var activeModalScrim = null;

  function openModal(scrimEl) {
    scrimEl.setAttribute("data-open", "true");
    activeModalScrim = scrimEl;
    document.body.style.overflow = "hidden";
  }

  function closeModal(scrimEl) {
    scrimEl.setAttribute("data-open", "false");
    if (activeModalScrim === scrimEl) {
      activeModalScrim = null;
      document.body.style.overflow = "";
    }
  }

  document.addEventListener("click", function (event) {
    if (event.target.classList && event.target.classList.contains("admin-modal-scrim")) {
      closeModal(event.target);
    }
    var closeTrigger = event.target.closest ? event.target.closest("[data-modal-close]") : null;
    if (closeTrigger) {
      var scrim = closeTrigger.closest(".admin-modal-scrim");
      if (scrim) {
        closeModal(scrim);
      }
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && activeModalScrim) {
      closeModal(activeModalScrim);
    }
  });

  /**
   * Builds and shows a small confirm/cancel dialog. Resolves `true` if
   * confirmed, `false` if cancelled or dismissed. The dialog element is
   * created fresh each call and removed afterwards.
   */
  function confirmDialog(options) {
    var settings = options || {};

    return new Promise(function (resolve) {
      var scrim = document.createElement("div");
      scrim.className = "admin-modal-scrim";

      var modal = document.createElement("div");
      modal.className = "admin-modal admin-modal-sm";
      modal.setAttribute("role", "alertdialog");
      modal.setAttribute("aria-modal", "true");

      var title = document.createElement("h3");
      title.className = "admin-modal-title";
      title.textContent = settings.title || window.AdminI18N.t("common.pleaseConfirm");

      var header = document.createElement("div");
      header.className = "admin-modal-header";
      header.appendChild(title);

      var body = document.createElement("p");
      body.style.cssText = "color:rgba(255,255,255,.7);font-size:13.5px;line-height:1.6;margin:0";
      body.textContent = settings.message || "";

      var footer = document.createElement("div");
      footer.className = "admin-modal-footer";

      var cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "btn-secondary";
      cancelBtn.textContent = settings.cancelLabel || window.AdminI18N.t("common.cancel");

      var confirmBtn = document.createElement("button");
      confirmBtn.type = "button";
      confirmBtn.className = settings.danger ? "btn-danger" : "btn-secondary";
      confirmBtn.textContent = settings.confirmLabel || window.AdminI18N.t("common.confirm");
      if (!settings.danger) {
        confirmBtn.style.borderColor = "var(--green)";
        confirmBtn.style.color = "var(--green)";
      }

      footer.appendChild(cancelBtn);
      footer.appendChild(confirmBtn);
      modal.appendChild(header);
      modal.appendChild(body);
      modal.appendChild(footer);
      scrim.appendChild(modal);
      document.body.appendChild(scrim);

      window.requestAnimationFrame(function () {
        openModal(scrim);
      });

      function cleanup(result) {
        closeModal(scrim);
        window.setTimeout(function () {
          scrim.remove();
        }, 250);
        resolve(result);
      }

      cancelBtn.addEventListener("click", function () {
        cleanup(false);
      });
      confirmBtn.addEventListener("click", function () {
        cleanup(true);
      });
      scrim.addEventListener("click", function (event) {
        if (event.target === scrim) {
          cleanup(false);
        }
      });
    });
  }

  // ---------------------------------------------------------------
  // Sidebar (mobile toggle, active link, role-gated visibility)
  // ---------------------------------------------------------------

  function ensureInvoiceNavLink() {
    var list = document.querySelector(".admin-nav-list");
    if (!list || list.querySelector('a[href="invoices.html"]')) {
      return;
    }
    var managementLabel = list.querySelector(".admin-nav-section-label");
    var managementItem = managementLabel ? managementLabel.closest("li") : null;
    if (!managementItem) {
      return;
    }
    var item = document.createElement("li");
    item.setAttribute("data-role-gate", "super_admin");
    item.innerHTML = '<a class="admin-nav-link" href="invoices.html">' +
      '<span class="admin-nav-ico" aria-hidden="true"><svg viewBox="0 0 24 24">' +
      '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"></path><path d="M9 8h6M9 12h6"></path>' +
      '</svg></span><span data-i18n="nav.invoices">Rechnungen</span></a>';
    managementItem.insertAdjacentElement("afterend", item);
  }

  function enableInvoiceNavLink() {
    ensureInvoiceNavLink();
    if (window.AdminI18N && typeof window.AdminI18N.applyStaticTranslations === "function") {
      window.AdminI18N.applyStaticTranslations();
    }
    markActiveNavLink();
  }

  function ensureExpenseNavLink() {
    var list = document.querySelector(".admin-nav-list");
    if (!list || list.querySelector('a[href="expenses.html"]')) { return; }
    ensureInvoiceNavLink();
    var invoiceItem = list.querySelector('a[href="invoices.html"]');
    var anchor = invoiceItem ? invoiceItem.closest("li") : null;
    if (!anchor) {
      var label = list.querySelector(".admin-nav-section-label");
      anchor = label ? label.closest("li") : null;
    }
    if (!anchor) { return; }
    var item = document.createElement("li");
    item.setAttribute("data-role-gate", "super_admin");
    item.innerHTML = '<a class="admin-nav-link" href="expenses.html">' +
      '<span class="admin-nav-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 4h14v16H5z"></path><path d="M8 8h8M8 12h5M8 16h8"></path></svg></span>' +
      '<span data-i18n="nav.expenses">Ausgaben</span></a>';
    anchor.insertAdjacentElement("afterend", item);
  }

  function enableFinanceNavLinks() {
    ensureInvoiceNavLink();
    ensureExpenseNavLink();
    if (window.AdminI18N && typeof window.AdminI18N.applyStaticTranslations === "function") { window.AdminI18N.applyStaticTranslations(); }
    markActiveNavLink();
  }

  function initSidebarToggle() {
    var toggle = document.querySelector(".admin-sidebar-toggle");
    var sidebar = document.querySelector(".admin-sidebar");
    var scrim = document.querySelector(".admin-sidebar-scrim");
    if (!toggle || !sidebar || !scrim) {
      return;
    }

    function close() {
      sidebar.setAttribute("data-open", "false");
      scrim.setAttribute("data-open", "false");
    }

    toggle.addEventListener("click", function () {
      var isOpen = sidebar.getAttribute("data-open") === "true";
      sidebar.setAttribute("data-open", String(!isOpen));
      scrim.setAttribute("data-open", String(!isOpen));
    });

    scrim.addEventListener("click", close);
  }

  function markActiveNavLink() {
    var current = window.location.pathname.split("/").pop() || "dashboard.html";
    document.querySelectorAll(".admin-nav-link").forEach(function (link) {
      if (link.getAttribute("href") === current) {
        link.classList.add("active");
        link.setAttribute("aria-current", "page");
      }
    });
  }

  /** Hides any element marked data-role-gate="super_admin" unless role matches. */
  function applyRoleGatedNav(role) {
    document.querySelectorAll('[data-role-gate="super_admin"]').forEach(function (el) {
      if (role !== "super_admin") {
        el.style.display = "none";
      }
    });
    if (role !== "super_admin") {
      return;
    }

    var current = window.location.pathname.split("/").pop() || "dashboard.html";
    if (["invoices.html", "invoice.html", "expenses.html", "expense.html", "partners.html"].indexOf(current) >= 0) {
      enableFinanceNavLinks();
      return;
    }

    if (!window.AdminSupabase || !window.AdminSupabase.isConfigured()) {
      return;
    }
    window.AdminSupabase.getClient().from("invoices").select("id").limit(1).then(function (result) {
      if (!result.error) {
        enableInvoiceNavLink();
      }
    });
    window.AdminSupabase.getClient().from("expenses").select("id").limit(1).then(function (result) {
      if (!result.error) { ensureExpenseNavLink(); enableFinanceNavLinks(); }
    });
  }

  initSidebarToggle();
  markActiveNavLink();

  window.AdminUI = {
    toast: toast,
    openModal: openModal,
    closeModal: closeModal,
    confirmDialog: confirmDialog,
    applyRoleGatedNav: applyRoleGatedNav
  };
})();
