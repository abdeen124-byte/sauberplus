/**
 * Dashboard home: stat cards, quick actions, recent activity (Super Admin
 * only — Content Managers have no RLS access to activity_log at all, so
 * that panel is simply omitted for them rather than shown empty/erroring).
 */
(function () {
  "use strict";

  function getElement(id) {
    return document.getElementById(id);
  }

  var t = window.AdminI18N.t;

  var ICONS = {
    megaphone: '<svg viewBox="0 0 24 24"><path d="M4 10v4a2 2 0 0 0 2 2h1l9 5V3l-9 5H6a2 2 0 0 0-2 2z"></path><path d="M18 9a4 4 0 0 1 0 6"></path></svg>',
    draft: '<svg viewBox="0 0 24 24"><path d="M4 4h12l4 4v12H4z"></path><path d="M8 12h8M8 16h5"></path></svg>',
    gallery: '<svg viewBox="0 0 24 24"><path d="M4 8h4l2-3h4l2 3h4v11H4z"></path><circle cx="12" cy="13.5" r="3.2"></circle></svg>',
    compare: '<svg viewBox="0 0 24 24"><path d="M8 3v18M16 3v18"></path><path d="M3 8h5M16 8h5M3 16h5M16 16h5"></path></svg>',
    upload: '<svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5"></path><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"></path></svg>'
  };

  function dateWithinDays(isoDate, days) {
    var target = new Date(isoDate).getTime();
    return target >= Date.now() - days * 24 * 60 * 60 * 1000;
  }

  function statCard(label, value, icon) {
    return (
      '<div class="admin-item-card" style="align-items:flex-start">' +
      '<span class="admin-nav-ico" style="width:38px;height:38px;border-radius:12px;background:linear-gradient(135deg,var(--blue2),var(--green));color:#fff" aria-hidden="true">' +
      icon +
      "</span>" +
      '<div style="font-family:\'Montserrat\',sans-serif;font-weight:900;font-size:28px">' +
      value +
      "</div>" +
      '<div style="font-size:12.5px;color:var(--gray)">' +
      label +
      "</div>" +
      "</div>"
    );
  }

  function renderStats(counts) {
    var grid = getElement("statsGrid");
    grid.innerHTML =
      statCard(t("dashboard.stat.activeAnnouncements"), counts.activeAnnouncements, ICONS.megaphone) +
      statCard(t("dashboard.stat.drafts"), counts.draftAnnouncements, ICONS.draft) +
      statCard(t("dashboard.stat.galleryImages"), counts.galleryTotal, ICONS.gallery) +
      statCard(t("dashboard.stat.beforeAfterPairs"), counts.beforeAfter, ICONS.compare) +
      statCard(t("dashboard.stat.recentUploads"), counts.recentUploads, ICONS.upload);
  }

  function loadStats(client) {
    return Promise.all([
      client.from("announcements").select("*", { count: "exact", head: true }).eq("status", "active"),
      client.from("announcements").select("*", { count: "exact", head: true }).eq("status", "draft"),
      client.from("gallery_images").select("*", { count: "exact", head: true }),
      client.from("gallery_images").select("*", { count: "exact", head: true }).eq("kind", "before_after"),
      client.from("gallery_images").select("created_at"),
      client.from("announcements").select("created_at")
    ]).then(function (results) {
      var galleryRows = results[4].data || [];
      var announcementRows = results[5].data || [];
      var recentUploads =
        galleryRows.filter(function (row) {
          return dateWithinDays(row.created_at, 7);
        }).length +
        announcementRows.filter(function (row) {
          return dateWithinDays(row.created_at, 7);
        }).length;

      renderStats({
        activeAnnouncements: results[0].count || 0,
        draftAnnouncements: results[1].count || 0,
        galleryTotal: results[2].count || 0,
        beforeAfter: results[3].count || 0,
        recentUploads: recentUploads
      });
    });
  }

  function formatActivityRow(row) {
    var locale = window.AdminI18N.getLang();
    var when = new Date(row.created_at).toLocaleString(locale === "ar" ? "ar" : "de-DE", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
    var actor = row.actor_email || t("common.system");
    var sentence =
      row.action === "login"
        ? t("activityFeed.loggedIn", { actor: actor })
        : t("activityFeed.action", {
            actor: actor,
            entity: t("entityLabel." + row.entity_type) || row.entity_type,
            action: t("action." + row.action) || row.action
          });

    return (
      '<div style="display:flex;justify-content:space-between;gap:14px;padding:11px 0;border-bottom:1px solid var(--border);font-size:13px">' +
      '<span style="color:var(--gray)">' +
      escapeHtml(sentence) +
      "</span>" +
      '<span style="color:rgba(255,255,255,.35);white-space:nowrap">' +
      when +
      "</span>" +
      "</div>"
    );
  }

  function escapeHtml(value) {
    var div = document.createElement("div");
    div.textContent = value || "";
    return div.innerHTML;
  }

  function loadRecentActivity(client) {
    var container = getElement("recentActivity");

    return client
      .from("activity_log")
      .select("actor_email, action, entity_type, created_at")
      .order("created_at", { ascending: false })
      .limit(8)
      .then(function (result) {
        if (result.error || !result.data || result.data.length === 0) {
          container.innerHTML = '<p class="admin-page-sub">' + escapeHtml(t("dashboard.noActivity")) + "</p>";
          return;
        }
        container.innerHTML = result.data.map(formatActivityRow).join("");
      });
  }

  window.AdminAuth.requireSession().then(function (profile) {
    if (!profile) {
      return;
    }

    window.AdminUI.applyRoleGatedNav(profile.role);

    getElement("welcomeHeading").textContent = t("dashboard.welcome", { name: profile.display_name || profile.email });
    getElement("roleNote").textContent = t("dashboard.signedInAs", { role: t("role." + profile.role) || profile.role });
    getElement("topbarUser").textContent = profile.email;
    getElement("adminShell").hidden = false;

    var client = window.AdminSupabase.getClient();

    loadStats(client).catch(function () {
      getElement("statsGrid").innerHTML = '<p class="admin-page-sub">' + escapeHtml(t("dashboard.statsLoadError")) + "</p>";
    });

    if (profile.role === "super_admin") {
      loadRecentActivity(client).catch(function () {
        getElement("recentActivity").innerHTML = '<p class="admin-page-sub">' + escapeHtml(t("dashboard.activityLoadError")) + "</p>";
      });
    } else {
      getElement("recentActivity").parentElement.style.display = "none";
    }
  });

  getElement("logoutBtn").addEventListener("click", function () {
    window.AdminAuth.signOut().then(function () {
      window.location.href = "index.html";
    });
  });
})();
