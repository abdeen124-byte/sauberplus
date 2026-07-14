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

  var PAGE_SIZE = 50;

  var ACTION_LABELS = {
    create: "erstellt",
    update: "aktualisiert",
    delete: "gelöscht",
    login: "angemeldet"
  };

  var ENTITY_LABELS = {
    announcements: "Ankündigung",
    gallery_images: "Galeriebild",
    user_profiles: "Konto"
  };

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
        changedFields.push(key);
      }
    });
    return changedFields;
  }

  function renderRow(row) {
    var entityLabel = ENTITY_LABELS[row.entity_type] || row.entity_type;
    var actionLabel = ACTION_LABELS[row.action] || row.action;
    var changedFields = summarizeChange(row);

    var summaryLine =
      '<span class="log-action-badge" data-action="' +
      row.action +
      '">' +
      (row.actor_email || "System") +
      "</span> hat " +
      entityLabel +
      " " +
      actionLabel +
      (changedFields && changedFields.length ? " (" + changedFields.join(", ") + ")" : "");

    var hasDetails = row.previous_value || row.new_value;

    return (
      '<div class="log-row" data-id="' +
      row.id +
      '">' +
      '<div class="log-row-head"' +
      (hasDetails ? ' data-toggle="details"' : "") +
      ">" +
      '<span class="log-row-main">' +
      summaryLine +
      "</span>" +
      '<span class="log-row-time">' +
      formatWhen(row.created_at) +
      "</span>" +
      "</div>" +
      (hasDetails
        ? '<div class="log-row-details">' +
          (row.previous_value ? "<div><strong style=\"font-size:11.5px;color:var(--gray)\">Vorher</strong><pre>" + escapeHtml(JSON.stringify(row.previous_value, null, 2)) + "</pre></div>" : "<div></div>") +
          (row.new_value ? "<div><strong style=\"font-size:11.5px;color:var(--gray)\">Nachher</strong><pre>" + escapeHtml(JSON.stringify(row.new_value, null, 2)) + "</pre></div>" : "<div></div>") +
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
      container.innerHTML = '<div class="admin-empty-state">Keine Einträge.</div>';
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
    getElement("listContainer").innerHTML = '<div class="admin-empty-state">Protokoll konnte nicht geladen werden.</div>';
  }

  window.AdminAuth.requireSession().then(function (profile) {
    if (!profile) {
      return;
    }

    window.AdminUI.applyRoleGatedNav(profile.role);
    getElement("topbarUser").textContent = profile.email;
    getElement("adminShell").hidden = false;

    if (profile.role !== "super_admin") {
      getElement("listContainer").innerHTML = '<div class="admin-empty-state">Kein Zugriff.</div>';
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
