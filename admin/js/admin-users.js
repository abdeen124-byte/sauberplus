/**
 * Team / user management (Super Admin only — this whole page is also
 * RLS-gated, so even reaching it via a direct URL as a Content Manager
 * returns no data). Create goes through the admin-create-user Edge
 * Function (the one place the service_role key is used, and only there);
 * disable/enable and role changes are plain RLS-guarded updates; password
 * reset reuses the same resetPasswordForEmail flow as the login screen.
 */
(function () {
  "use strict";

  function getElement(id) {
    return document.getElementById(id);
  }

  var t = window.AdminI18N.t;

  var state = {
    client: null,
    profile: null,
    accessToken: null,
    all: []
  };

  function initials(name) {
    return (name || "?")
      .split(" ")
      .map(function (part) {
        return part.charAt(0);
      })
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  function escapeHtml(value) {
    var div = document.createElement("div");
    div.textContent = value || "";
    return div.innerHTML;
  }

  function loadUsers() {
    return state.client
      .from("user_profiles")
      .select("*")
      .in("role", ["super_admin", "content_manager"])
      .is("archived_at", null)
      .order("created_at", { ascending: true })
      .then(function (result) {
        if (result.error) {
          throw result.error;
        }
        state.all = result.data;
        renderList();
      });
  }

  function renderRow(row) {
    var isSelf = row.id === state.profile.id;

    return (
      '<div class="user-row" data-id="' +
      row.id +
      '">' +
      '<div class="user-avatar">' +
      initials(row.display_name) +
      "</div>" +
      '<div class="user-info">' +
      '<div class="user-name">' +
      escapeHtml(row.display_name) +
      (isSelf ? ' <span style="color:var(--gray);font-weight:400">' + t("common.you") + "</span>" : "") +
      "</div>" +
      '<div class="user-email">' +
      escapeHtml(row.email) +
      "</div>" +
      "</div>" +
      '<span class="admin-badge" data-status="' +
      (row.disabled ? "hidden" : "active") +
      '">' +
      (row.disabled ? t("status.disabled") : t("status.active")) +
      "</span>" +
      '<div class="user-actions">' +
      '<select class="user-role-select" data-action="role" ' +
      (isSelf ? "disabled" : "") +
      ">" +
      '<option value="content_manager"' +
      (row.role === "content_manager" ? " selected" : "") +
      ">" +
      t("role.content_manager") +
      "</option>" +
      '<option value="super_admin"' +
      (row.role === "super_admin" ? " selected" : "") +
      ">" +
      t("role.super_admin") +
      "</option>" +
      "</select>" +
      '<button type="button" class="btn-secondary btn-sm" data-action="reset-password">' +
      t("users.resetPasswordButton") +
      "</button>" +
      (isSelf
        ? ""
        : '<button type="button" class="' +
          (row.disabled ? "btn-secondary" : "btn-danger") +
          ' btn-sm" data-action="toggle-disabled">' +
          (row.disabled ? t("users.enableButton") : t("users.disableButton")) +
          "</button>" +
          '<button type="button" class="btn-danger btn-sm" data-action="delete">' +
          t("common.delete") +
          "</button>") +
      "</div>" +
      "</div>"
    );
  }

  function renderList() {
    var container = getElement("listContainer");
    if (state.all.length === 0) {
      container.innerHTML = '<div class="admin-empty-state">' + escapeHtml(t("users.emptyState")) + "</div>";
      return;
    }

    container.innerHTML = state.all.map(renderRow).join("");

    container.querySelectorAll(".user-row").forEach(function (row) {
      var record = state.all.filter(function (item) {
        return item.id === row.getAttribute("data-id");
      })[0];

      var roleSelect = row.querySelector('[data-action="role"]');
      if (roleSelect && !roleSelect.disabled) {
        roleSelect.addEventListener("change", function () {
          handleRoleChange(record, roleSelect.value);
        });
      }

      var resetBtn = row.querySelector('[data-action="reset-password"]');
      if (resetBtn) {
        resetBtn.addEventListener("click", function () {
          handleResetPassword(record);
        });
      }

      var toggleBtn = row.querySelector('[data-action="toggle-disabled"]');
      if (toggleBtn) {
        toggleBtn.addEventListener("click", function () {
          handleToggleDisabled(record);
        });
      }

      var deleteBtn = row.querySelector('[data-action="delete"]');
      if (deleteBtn) {
        deleteBtn.addEventListener("click", function () {
          handleDelete(record);
        });
      }
    });
  }

  function manageAccount(record, action, role) {
    return state.client.rpc("manage_user_account", {
      p_user_id: record.id,
      p_action: action,
      p_role: role || null
    });
  }

  function lifecycleError(error, fallback) {
    var message = error && error.message ? error.message : fallback;
    return window.AdminI18N.translateServerError(message);
  }

  function handleRoleChange(record, newRole) {
    window.AdminUI.confirmDialog({
      title: t("users.roleChangeConfirmTitle"),
      message: t("users.roleChangeConfirmMessage", { name: record.display_name, role: t("role." + newRole) })
    }).then(function (confirmed) {
      if (!confirmed) {
        renderList();
        return;
      }
      manageAccount(record, "role", newRole)
        .then(function (result) {
          if (result.error) {
            window.AdminUI.toast(lifecycleError(result.error, t("users.roleChangeFailed")), "error");
            renderList();
            return;
          }
          window.AdminUI.toast(t("users.roleChangeSuccess"), "success");
          loadUsers();
        });
    });
  }

  function handleToggleDisabled(record) {
    var nextDisabled = !record.disabled;
    window.AdminUI.confirmDialog({
      title: nextDisabled ? t("users.disableConfirmTitle") : t("users.enableConfirmTitle"),
      message: t(nextDisabled ? "users.disableConfirmMessage" : "users.enableConfirmMessage", { name: record.display_name }),
      confirmLabel: nextDisabled ? t("users.disableButton") : t("users.enableButton"),
      danger: nextDisabled
    }).then(function (confirmed) {
      if (!confirmed) {
        return;
      }
      manageAccount(record, nextDisabled ? "disable" : "enable")
        .then(function (result) {
          if (result.error) {
            window.AdminUI.toast(lifecycleError(result.error, t("common.actionFailed")), "error");
            return;
          }
          window.AdminUI.toast(nextDisabled ? t("users.disableSuccess") : t("users.enableSuccess"), "success");
          loadUsers();
        });
    });
  }

  function handleDelete(record) {
    window.AdminUI.confirmDialog({
      title: t("users.deleteConfirmTitle"),
      message: t("users.deleteConfirmMessage", { name: record.display_name }),
      confirmLabel: t("common.delete"),
      danger: true
    }).then(function (confirmed) {
      if (!confirmed) {
        return;
      }
      manageAccount(record, "delete").then(function (result) {
        if (result.error) {
          window.AdminUI.toast(lifecycleError(result.error, t("common.deleteFailed")), "error");
          return;
        }
        window.AdminUI.toast(t("users.deleteSuccess"), "success");
        loadUsers();
      });
    });
  }

  function handleResetPassword(record) {
    window.AdminUI.confirmDialog({
      title: t("users.resetPasswordConfirmTitle"),
      message: t("users.resetPasswordConfirmMessage", { email: record.email })
    }).then(function (confirmed) {
      if (!confirmed) {
        return;
      }
      var redirectTo = window.location.origin + window.location.pathname.replace(/users\.html$/, "") + "reset-password.html";
      state.client.auth.resetPasswordForEmail(record.email, { redirectTo: redirectTo }).then(function (result) {
        if (result.error) {
          window.AdminUI.toast(t("users.resetPasswordEmailFailed"), "error");
          return;
        }
        window.AdminUI.toast(t("users.resetPasswordEmailSent"), "success");
      });
    });
  }

  // ---------------------------------------------------------------
  // Create user (Edge Function)
  // ---------------------------------------------------------------

  function showEditorError(message) {
    var el = getElement("editorError");
    el.textContent = message;
    el.setAttribute("data-visible", "true");
  }

  function hideEditorError() {
    var el = getElement("editorError");
    el.setAttribute("data-visible", "false");
    el.textContent = "";
  }

  function setSaving(isSaving) {
    var btn = getElement("saveBtn");
    btn.disabled = isSaving;
    btn.setAttribute("data-loading", String(isSaving));
  }

  function handleCreate(event) {
    event.preventDefault();
    hideEditorError();
    setSaving(true);

    var body = {
      displayName: getElement("fieldName").value.trim(),
      email: getElement("fieldEmail").value.trim().toLowerCase(),
      role: getElement("fieldRole").value
    };

    var config = window.SAUBERPLUS_ADMIN_CONFIG;

    fetch(config.supabaseUrl + "/functions/v1/admin-create-user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + state.accessToken
      },
      body: JSON.stringify(body)
    })
      .then(function (response) {
        return response.json().then(function (data) {
          return { ok: response.ok, data: data };
        });
      })
      .then(function (result) {
        setSaving(false);
        if (!result.ok) {
          var serverMessage = result.data.error || "Konto konnte nicht erstellt werden.";
          showEditorError(window.AdminI18N.translateServerError(serverMessage));
          return;
        }
        window.AdminUI.closeModal(getElement("editorScrim"));
        window.AdminUI.toast(t("users.inviteSent"), "success");
        getElement("editorForm").reset();
        loadUsers();
      })
      .catch(function () {
        setSaving(false);
        showEditorError(t("common.connectionError"));
      });
  }

  // ---------------------------------------------------------------
  // Bootstrap
  // ---------------------------------------------------------------

  window.AdminAuth.requireSession().then(function (profile) {
    if (!profile) {
      return;
    }

    state.profile = profile;
    state.client = window.AdminSupabase.getClient();

    window.AdminUI.applyRoleGatedNav(profile.role);
    getElement("topbarUser").textContent = profile.email;
    getElement("adminShell").hidden = false;

    state.client.auth.getSession().then(function (result) {
      state.accessToken = result.data.session ? result.data.session.access_token : null;
    });

    getElement("newUserBtn").addEventListener("click", function () {
      getElement("editorForm").reset();
      hideEditorError();
      window.AdminUI.openModal(getElement("editorScrim"));
    });
    getElement("editorForm").addEventListener("submit", handleCreate);

    loadUsers().catch(function () {
      getElement("listContainer").innerHTML = '<div class="admin-empty-state">' + escapeHtml(t("users.loadError")) + "</div>";
    });
  });

  getElement("logoutBtn").addEventListener("click", function () {
    window.AdminAuth.signOut().then(function () {
      window.location.href = "index.html";
    });
  });
})();
