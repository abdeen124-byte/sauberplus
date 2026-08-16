/**
 * Activity log viewer (Super Admin only). Purely read-only — the data here
 * comes entirely from the SECURITY DEFINER triggers/functions in
 * supabase/schema.sql, never from this page writing anything.
 */
(function () {
  "use strict";

  function getElement(id) {
    return document.getElementById(id);
  }

  var t = window.AdminI18N.t;
  var PAGE_SIZE = 50;

  var state = {
    client: null,
    entityFilter: "",
    offset: 0,
    rows: []
  };

  function formatWhen(iso) {
    return new Date(iso).toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function summarizeChange(row) {
    if (!row.previous_value || !row.new_value) {
      return null;
    }
    var changedFields = [];
    Object.keys(row.new_value).forEach(function (key) {
      if (["updated_at", "created_at"].indexOf(key) !== -1) {
        return;
      }
      var before = JSON.stringify(row.previous_value[key]);
      var after = JSON.stringify(row.new_value[key]);
      if (before !== after) {
        changedFields.push(translatedOrFallback("fieldLabel." + key, key));
      }
    });
    return changedFields;
  }

  function translatedOrFallback(key, fallback) {
    var translated = t(key);
    return translated === key ? fallback : translated;
  }

  function buildSentence(row) {
    var actor = row.actor_email || t("common.system");
    if (row.action === "login") {
      return t("activityFeed.loggedIn", { actor: actor });
    }
    var changedFields = summarizeChange(row);
    var sentence = t("activityFeed.action", {
      actor: actor,
      entity: translatedOrFallback("entityLabel." + row.entity_type, row.entity_type),
      action: translatedOrFallback("action." + row.action, row.action)
    });
    if (changedFields && changedFields.length) {
      var separator = window.AdminI18N.getLang() === "ar" ? "، " : ", ";
      sentence += " (" + changedFields.join(separator) + ")";
    }
    return sentence;
  }

  function renderRow(row) {
    var hasDetails = row.previous_value || row.new_value;

    return (
      '<div class="log-row" data-id="' +
      row.id +
      '">' +
      '<div class="log-row-head"' +
      (hasDetails ? ' data-toggle="details"' : "") +
      ">" +
      '<span class="log-row-main log-action-badge" data-action="' +
      row.action +
      '">' +
      escapeHtml(buildSentence(row)) +
      "</span>" +
      '<span class="log-row-time">' +
      formatWhen(row.created_at) +
      "</span>" +
      "</div>" +
      (hasDetails
        ? '<div class="log-row-details">' +
          (row.previous_value
            ? '<div><strong style="font-size:11.5px;color:var(--gray)">' + t("activityLog.before") + "</strong><pre>" + escapeHtml(JSON.stringify(row.previous_value, null, 2)) + "</pre></div>"
            : "<div></div>") +
          (row.new_value
            ? '<div><strong style="font-size:11.5px;color:var(--gray)">' + t("activityLog.after") + "</strong><pre>" + escapeHtml(JSON.stringify(row.new_value, null, 2)) + "</pre></div>"
            : "<div></div>") +
          "</div>"
        : "") +
      "</div>"
    );
  }

  function escapeHtml(value) {
    var div = document.createElement("div");
    div.textContent = value || "";
    return div.innerHTML;
  }

  function renderList(append) {
    var container = getElement("listContainer");
    var html = state.rows.map(renderRow).join("");

    if (state.rows.length === 0) {
      container.innerHTML = '<div class="admin-empty-state">' + escapeHtml(t("activityLog.emptyState")) + "</div>";
    } else if (append) {
      container.insertAdjacentHTML("beforeend", html);
    } else {
      container.innerHTML = html;
    }

    container.querySelectorAll('[data-toggle="details"]').forEach(function (head) {
      head.addEventListener("click", function () {
        var details = head.nextElementSibling;
        var isOpen = details.getAttribute("data-open") === "true";
        details.setAttribute("data-open", String(!isOpen));
      });
    });
  }

  function loadPage(reset) {
    if (reset) {
      state.offset = 0;
      state.rows = [];
    }

    var query = state.client
      .from("activity_log")
      .select("*")
      .order("created_at", { ascending: false })
      .range(state.offset, state.offset + PAGE_SIZE - 1);

    if (state.entityFilter) {
      query = query.eq("entity_type", state.entityFilter);
    }

    return query.then(function (result) {
      if (result.error) {
        throw result.error;
      }
      state.rows = state.rows.concat(result.data);
      state.offset += result.data.length;
      renderList(!reset);
      getElement("loadMoreBtn").style.display = result.data.length === PAGE_SIZE ? "inline-block" : "none";
    });
  }

  function initTabs() {
    var container = getElement("entityTabs");
    container.querySelectorAll(".admin-tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        container.querySelectorAll(".admin-tab").forEach(function (other) {
          other.classList.remove("active");
        });
        tab.classList.add("active");
        state.entityFilter = tab.getAttribute("data-entity") || "";
        loadPage(true).catch(handleLoadError);
      });
    });
  }

  function handleLoadError() {
    getElement("listContainer").innerHTML = '<div class="admin-empty-state">' + escapeHtml(t("activityLog.loadError")) + "</div>";
  }

  window.AdminAuth.requireSession().then(function (profile) {
    if (!profile) {
      return;
    }

    window.AdminUI.applyRoleGatedNav(profile.role);
    getElement("topbarUser").textContent = profile.email;
    getElement("adminShell").hidden = false;

    if (profile.role !== "super_admin") {
      getElement("listContainer").innerHTML = '<div class="admin-empty-state">' + escapeHtml(t("common.noAccess")) + "</div>";
      return;
    }

    state.client = window.AdminSupabase.getClient();

    initTabs();
    getElement("loadMoreBtn").addEventListener("click", function () {
      loadPage(false).catch(handleLoadError);
    });

    loadPage(true).catch(handleLoadError);
  });

  getElement("logoutBtn").addEventListener("click", function () {
    window.AdminAuth.signOut().then(function () {
      window.location.href = "index.html";
    });
  });
})();
