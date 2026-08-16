/**
 * Super-admin workforce console. The database remains the authorization
 * boundary; this page adds the matching UX guard and never uses a service key.
 */
(function () {
  "use strict";

  function byId(id) {
    return document.getElementById(id);
  }

  var state = {
    client: null,
    profile: null,
    accessToken: null,
    activePanel: "overview",
    employees: [],
    profiles: [],
    sites: [],
    assignments: [],
    shifts: [],
    absences: [],
    liveEntries: [],
    reportRows: []
  };

  var COPY = {
    de: {
      title: "Mitarbeiter & Zeiterfassung",
      subtitle: "Arbeitszeiten, Einsatzorte, Dienstplan und Abwesenheiten zentral verwalten.",
      refresh: "Aktualisieren",
      loading: "Wird geladen …",
      workforceAria: "Mitarbeiterverwaltung",
      dataLoadFailed: "Daten konnten nicht vollständig geladen werden.",
      tabOverview: "Übersicht",
      tabEmployees: "Mitarbeiter",
      tabSites: "Objekte & Zuordnung",
      tabSchedule: "Dienstplan",
      tabAbsences: "Urlaub / Krank",
      tabReports: "Berichte",
      currentlyClocked: "Aktuell eingestempelt",
      currentlyClockedHint: "Laufende und pausierte Arbeitszeiten aus der Datenbank.",
      searchEmployee: "Mitarbeiter suchen",
      status: "Status",
      sites: "Objekte / Einsatzorte",
      sitesHint: "Arbeitsorte mit eindeutiger Objekt-Nummer.",
      assignments: "Mitarbeiter-Zuordnungen",
      assignmentsHint: "Gültige Zuordnungen und Hauptobjekte.",
      activeEmployees: "Aktive Mitarbeiter",
      onDuty: "Im Dienst",
      inBreak: "{count} in Pause",
      shiftsToday: "Schichten heute",
      activeSites: "Aktive Objekte",
      nobodyClocked: "Aktuell ist niemand eingestempelt.",
      employee: "Mitarbeiter",
      site: "Objekt",
      start: "Beginn",
      workTime: "Arbeitszeit",
      employeeNumber: "Personalnr.",
      phone: "Telefon",
      employment: "Beschäftigung",
      actions: "Aktionen",
      edit: "Bearbeiten",
      activate: "Aktivieren",
      deactivate: "Deaktivieren",
      delete: "Löschen",
      emptyEmployees: "Keine Mitarbeiter in dieser Ansicht.",
      addEmployee: "+ Mitarbeiter",
      employeeModalAdd: "Mitarbeiter hinzufügen",
      employeeModalEdit: "Mitarbeiter bearbeiten",
      employeeCreated: "Mitarbeiter angelegt und Einladung versendet.",
      employeeUpdated: "Mitarbeiter aktualisiert.",
      disableTitle: "Mitarbeiter deaktivieren?",
      enableTitle: "Mitarbeiter aktivieren?",
      disableMessage: "Der Mitarbeiter kann sich danach nicht mehr anmelden oder Zeiten erfassen.",
      enableMessage: "Der Zugriff auf die Mitarbeiter-Oberfläche wird wieder freigegeben.",
      employeeDisabled: "Mitarbeiter deaktiviert.",
      employeeEnabled: "Mitarbeiter aktiviert.",
      deleteTitle: "Mitarbeiter löschen?",
      deleteMessage: "{name} wird endgültig aus den aktiven Listen entfernt. Arbeitszeiten, Unterschriften und historische Nachweise bleiben erhalten.",
      employeeDeleted: "Mitarbeiter gelöscht. Historische Nachweise bleiben archiviert.",
      searchPlaceholder: "Name, E-Mail oder Personalnummer",
      employeeNameLabel: "Name *",
      employeeEmailLabel: "E-Mail *",
      employeeNumberLabel: "Personalnummer *",
      employeePhoneLabel: "Telefon",
      employmentStartLabel: "Beschäftigt ab",
      employmentEndLabel: "Beschäftigt bis",
      primarySiteLabel: "Hauptobjekt (optional)",
      noPrimarySite: "Kein Hauptobjekt",
      employeeInviteNote: "Das Konto erhält eine Einladung zur Mitarbeiter-Oberfläche.",
      cancel: "Abbrechen",
      save: "Speichern",
      close: "Schließen",
      all: "Alle",
      statusActive: "Aktiv",
      statusDisabled: "Deaktiviert",
      statusWorking: "Arbeitet",
      statusPaused: "Pause",
      statusCompleted: "Beendet",
      statusScheduled: "Geplant",
      statusCancelled: "Abgesagt",
      statusApproved: "Genehmigt",
      statusPending: "Offen",
      statusRejected: "Abgelehnt",
      nameRequired: "Bitte einen Namen angeben.",
      emailRequired: "Bitte eine gültige E-Mail-Adresse angeben.",
      employeeNumberRequired: "Bitte eine Personalnummer angeben.",
      sessionLoading: "Die Sitzung wird noch geladen. Bitte in einem Moment erneut versuchen.",
      actionFailed: "Die Aktion konnte nicht ausgeführt werden.",
      duplicateValue: "Dieser Wert ist bereits vorhanden. Bitte Personal- oder Objekt-Nummer prüfen.",
      overlap: "Der Zeitraum überschneidet sich mit einem bestehenden Eintrag.",
      invalidData: "Die eingegebenen Daten oder Zeiträume sind ungültig.",
      invalidDateRange: "Das Enddatum darf nicht vor dem Startdatum liegen."
    },
    ar: {
      title: "الموظفون وتسجيل الوقت",
      subtitle: "إدارة ساعات العمل والمواقع والجدول والإجازات من مكان واحد.",
      refresh: "تحديث",
      loading: "جارٍ التحميل…",
      workforceAria: "إدارة الموظفين",
      dataLoadFailed: "تعذّر تحميل البيانات بالكامل.",
      tabOverview: "نظرة عامة",
      tabEmployees: "الموظفون",
      tabSites: "المواقع والربط",
      tabSchedule: "جدول العمل",
      tabAbsences: "إجازة / مرض",
      tabReports: "التقارير",
      currentlyClocked: "المسجلون حاليًا",
      currentlyClockedHint: "أوقات العمل والاستراحة الجارية من قاعدة البيانات.",
      searchEmployee: "البحث عن موظف",
      status: "الحالة",
      sites: "المواقع / أماكن العمل",
      sitesHint: "أماكن العمل مع رقم موقع فريد.",
      assignments: "ربط الموظفين",
      assignmentsHint: "الروابط السارية والموقع الأساسي.",
      activeEmployees: "الموظفون النشطون",
      onDuty: "في العمل",
      inBreak: "{count} في الاستراحة",
      shiftsToday: "ورديات اليوم",
      activeSites: "المواقع النشطة",
      nobodyClocked: "لا يوجد موظف مسجّل في العمل حاليًا.",
      employee: "الموظف",
      site: "الموقع",
      start: "البداية",
      workTime: "وقت العمل",
      employeeNumber: "رقم الموظف",
      phone: "الهاتف",
      employment: "فترة العمل",
      actions: "الإجراءات",
      edit: "تعديل",
      activate: "تفعيل",
      deactivate: "تعطيل",
      delete: "حذف",
      emptyEmployees: "لا يوجد موظفون في هذه القائمة.",
      addEmployee: "+ موظف",
      employeeModalAdd: "إضافة موظف",
      employeeModalEdit: "تعديل الموظف",
      employeeCreated: "تم إنشاء الموظف وإرسال الدعوة.",
      employeeUpdated: "تم تحديث الموظف.",
      disableTitle: "تعطيل الموظف؟",
      enableTitle: "تفعيل الموظف؟",
      disableMessage: "لن يتمكن الموظف بعد ذلك من تسجيل الدخول أو تسجيل الساعات.",
      enableMessage: "سيتم السماح مجددًا بالدخول إلى بوابة الموظف.",
      employeeDisabled: "تم تعطيل الموظف.",
      employeeEnabled: "تم تفعيل الموظف.",
      deleteTitle: "حذف الموظف؟",
      deleteMessage: "سيُحذف {name} نهائيًا من القوائم النشطة، مع الاحتفاظ بساعات العمل والتوقيعات والسجلات التاريخية.",
      employeeDeleted: "تم حذف الموظف مع الاحتفاظ بالسجلات التاريخية في الأرشيف.",
      searchPlaceholder: "الاسم أو البريد الإلكتروني أو رقم الموظف",
      employeeNameLabel: "الاسم *",
      employeeEmailLabel: "البريد الإلكتروني *",
      employeeNumberLabel: "رقم الموظف *",
      employeePhoneLabel: "الهاتف",
      employmentStartLabel: "بداية العمل",
      employmentEndLabel: "نهاية العمل",
      primarySiteLabel: "الموقع الأساسي (اختياري)",
      noPrimarySite: "بدون موقع أساسي",
      employeeInviteNote: "سيتلقى الحساب دعوة للدخول إلى بوابة الموظف.",
      cancel: "إلغاء",
      save: "حفظ",
      close: "إغلاق",
      all: "الكل",
      statusActive: "نشط",
      statusDisabled: "معطّل",
      statusWorking: "يعمل",
      statusPaused: "استراحة",
      statusCompleted: "مكتمل",
      statusScheduled: "مجدول",
      statusCancelled: "ملغى",
      statusApproved: "معتمد",
      statusPending: "قيد الانتظار",
      statusRejected: "مرفوض",
      nameRequired: "يرجى إدخال اسم الموظف.",
      emailRequired: "يرجى إدخال بريد إلكتروني صالح.",
      employeeNumberRequired: "يرجى إدخال رقم الموظف.",
      sessionLoading: "ما زال تحميل الجلسة جاريًا. يرجى المحاولة بعد لحظة.",
      actionFailed: "تعذّر تنفيذ الإجراء.",
      duplicateValue: "هذه القيمة مستخدمة بالفعل. يرجى التحقق من رقم الموظف أو الموقع.",
      overlap: "تتداخل الفترة مع سجل موجود.",
      invalidData: "البيانات أو الفترات الزمنية المدخلة غير صالحة.",
      invalidDateRange: "لا يجوز أن يسبق تاريخ النهاية تاريخ البداية."
    }
  };

  function workforceText(key, vars) {
    var lang = window.AdminI18N.getLang() === "ar" ? "ar" : "de";
    var value = COPY[lang][key] || COPY.de[key] || key;
    Object.keys(vars || {}).forEach(function (name) {
      value = value.replace(new RegExp("\\{" + name + "\\}", "g"), vars[name]);
    });
    return value;
  }

  function applyWorkforceCopy() {
    document.title = workforceText("title") + " – SauberPlus Admin";
    document.querySelectorAll("[data-workforce-key]").forEach(function (element) {
      var key = element.getAttribute("data-workforce-key");
      if (workforceText(key) !== key) {
        element.textContent = workforceText(key);
      }
    });
    byId("employeeSearch").placeholder = workforceText("searchPlaceholder");
    byId("workforceTabs").setAttribute("aria-label", workforceText("workforceAria"));
    var employeeLoading = byId("employeesContainer").querySelector(".admin-loading-block");
    if (employeeLoading) {
      employeeLoading.textContent = workforceText("loading");
    }
    var statusOptions = byId("employeeStatusFilter").options;
    statusOptions[0].textContent = workforceText("all");
    statusOptions[1].textContent = workforceText("statusActive");
    statusOptions[2].textContent = workforceText("statusDisabled");
    byId("contextActionBtn").textContent = workforceText("addEmployee");
    var employeeLabels = {
      employeeName: "employeeNameLabel",
      employeeEmail: "employeeEmailLabel",
      employeeNumber: "employeeNumberLabel",
      employeePhone: "employeePhoneLabel",
      employmentStart: "employmentStartLabel",
      employmentEnd: "employmentEndLabel",
      employeePrimarySite: "primarySiteLabel"
    };
    Object.keys(employeeLabels).forEach(function (inputId) {
      var label = document.querySelector('label[for="' + inputId + '"]');
      if (label) {
        label.textContent = workforceText(employeeLabels[inputId]);
      }
    });
    byId("employeeInviteNote").textContent = workforceText("employeeInviteNote");
    var employeeClose = byId("employeeScrim").querySelector(".admin-modal-close");
    if (employeeClose) {
      employeeClose.setAttribute("aria-label", workforceText("close"));
    }
    var employeeCancel = byId("employeeScrim").querySelector(".admin-modal-footer [data-modal-close]");
    if (employeeCancel) {
      employeeCancel.textContent = workforceText("cancel");
    }
    var employeeSave = byId("employeeSaveBtn").querySelector("span:last-child");
    if (employeeSave) {
      employeeSave.textContent = workforceText("save");
    }
  }

  function escapeHtml(value) {
    var element = document.createElement("div");
    element.textContent = value == null ? "" : String(value);
    return element.innerHTML;
  }

  function localDateValue(date) {
    var value = date || new Date();
    var year = value.getFullYear();
    var month = String(value.getMonth() + 1).padStart(2, "0");
    var day = String(value.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  function startOfMonth() {
    var today = new Date();
    return localDateValue(new Date(today.getFullYear(), today.getMonth(), 1));
  }

  function endOfMonth() {
    var today = new Date();
    return localDateValue(new Date(today.getFullYear(), today.getMonth() + 1, 0));
  }

  function addDays(dateText, days) {
    var date = new Date(dateText + "T12:00:00");
    date.setDate(date.getDate() + days);
    return localDateValue(date);
  }

  function toLocalDatetime(isoString) {
    if (!isoString) {
      return "";
    }
    var date = new Date(isoString);
    var local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  function toIsoDatetime(localValue) {
    return localValue ? new Date(localValue).toISOString() : null;
  }

  function formatDate(dateText) {
    if (!dateText) {
      return "—";
    }
    return new Date(dateText + (dateText.indexOf("T") === -1 ? "T12:00:00" : "")).toLocaleDateString(
      window.AdminI18N.getLang() === "ar" ? "ar-DE" : "de-DE",
      { day: "2-digit", month: "2-digit", year: "numeric" }
    );
  }

  function formatDateTime(value) {
    if (!value) {
      return "—";
    }
    return new Date(value).toLocaleString(window.AdminI18N.getLang() === "ar" ? "ar-DE" : "de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function formatDuration(seconds) {
    var totalMinutes = Math.max(0, Math.floor(Number(seconds || 0) / 60));
    var hours = Math.floor(totalMinutes / 60);
    var minutes = totalMinutes % 60;
    return hours + ":" + String(minutes).padStart(2, "0") + " Std.";
  }

  function profileById(id) {
    return state.profiles.find(function (profile) {
      return profile.id === id;
    });
  }

  function employeeById(id) {
    return state.employees.find(function (employee) {
      return employee.id === id;
    });
  }

  function siteById(id) {
    return state.sites.find(function (site) {
      return site.id === id;
    });
  }

  function employeeName(id) {
    var profile = profileById(id);
    return profile ? profile.display_name : "Unbekannt";
  }

  function siteName(id) {
    var site = siteById(id);
    return site ? site.name : "Unbekannt";
  }

  function setPageError(message) {
    var element = byId("pageError");
    element.textContent = message || "";
    element.hidden = !message;
  }

  function setFormError(id, message) {
    var element = byId(id);
    element.textContent = message || "";
    element.setAttribute("data-visible", message ? "true" : "false");
  }

  function setSaving(buttonId, saving) {
    var button = byId(buttonId);
    button.disabled = saving;
    button.setAttribute("data-loading", String(saving));
  }

  function errorMessage(error) {
    if (!error) {
      return workforceText("actionFailed");
    }
    if (error.code === "23505") {
      return workforceText("duplicateValue");
    }
    if (error.code === "23P01") {
      return workforceText("overlap");
    }
    if (error.code === "23514" || error.code === "22023") {
      return workforceText("invalidData");
    }
    return error.message || workforceText("actionFailed");
  }

  function requireValue(value, message) {
    if (!String(value || "").trim()) {
      throw new Error(message);
    }
  }

  function validateDateRange(from, until) {
    if (from && until && until < from) {
      throw new Error(workforceText("invalidDateRange"));
    }
  }

  function queryData(query) {
    return query.then(function (result) {
      if (result.error) {
        throw result.error;
      }
      return result.data || [];
    });
  }

  function loadBaseData() {
    return Promise.all([
      queryData(state.client.from("employees").select("*").order("employee_number", { ascending: true })),
      queryData(state.client.from("user_profiles").select("id,email,display_name,role,disabled,archived_at").eq("role", "employee").order("display_name", { ascending: true })),
      queryData(state.client.from("work_sites").select("*").order("name", { ascending: true })),
      queryData(state.client.from("employee_work_sites").select("*").order("created_at", { ascending: false }))
    ]).then(function (rows) {
      state.profiles = rows[1];
      var employeeProfileIds = new Set(state.profiles.filter(function (profile) {
        return !profile.archived_at;
      }).map(function (profile) { return profile.id; }));
      state.employees = rows[0].filter(function (employee) { return employeeProfileIds.has(employee.id); });
      state.sites = rows[2];
      state.assignments = rows[3];
      populateSelects();
      renderEmployees();
      renderSites();
      renderAssignments();
    });
  }

  function loadOverview() {
    var today = localDateValue();
    var tomorrow = addDays(today, 1);
    return Promise.all([
      queryData(state.client.from("time_entry_totals").select("*").in("status", ["working", "paused"]).order("started_at", { ascending: true })),
      queryData(state.client.from("work_shifts").select("id,scheduled_start,status").gte("scheduled_start", toIsoDatetime(today + "T00:00")).lt("scheduled_start", toIsoDatetime(tomorrow + "T00:00")).eq("status", "scheduled"))
    ]).then(function (rows) {
      state.liveEntries = rows[0];
      renderOverview(rows[1].length);
    });
  }

  function reloadAll() {
    setPageError("");
    byId("refreshBtn").disabled = true;
    return loadBaseData()
      .then(loadOverview)
      .then(function () {
        return state.activePanel === "overview" ? null : loadActivePanel();
      })
      .catch(function (error) {
        setPageError(workforceText("dataLoadFailed") + " " + errorMessage(error));
      })
      .finally(function () {
        byId("refreshBtn").disabled = false;
      });
  }

  function loadActivePanel() {
    if (state.activePanel === "schedule") {
      return loadSchedule();
    }
    if (state.activePanel === "absences") {
      return loadAbsences();
    }
    if (state.activePanel === "overview") {
      return loadOverview();
    }
    return Promise.resolve();
  }

  function renderOverview(todayShiftCount) {
    var activeEmployees = state.profiles.filter(function (profile) {
      return !profile.disabled && !profile.archived_at;
    }).length;
    var activeSites = state.sites.filter(function (site) {
      return site.active;
    }).length;
    var pausedCount = state.liveEntries.filter(function (entry) {
      return entry.status === "paused";
    }).length;
    byId("overviewMetrics").innerHTML =
      '<div class="workforce-metric"><span class="workforce-metric-value">' + activeEmployees + '</span><span class="workforce-metric-label">' + workforceText("activeEmployees") + '</span></div>' +
      '<div class="workforce-metric"><span class="workforce-metric-value">' + state.liveEntries.length + '</span><span class="workforce-metric-label">' + workforceText("onDuty") + '</span><span class="workforce-metric-detail">' + workforceText("inBreak", { count: pausedCount }) + '</span></div>' +
      '<div class="workforce-metric"><span class="workforce-metric-value">' + todayShiftCount + '</span><span class="workforce-metric-label">' + workforceText("shiftsToday") + '</span></div>' +
      '<div class="workforce-metric"><span class="workforce-metric-value">' + activeSites + '</span><span class="workforce-metric-label">' + workforceText("activeSites") + '</span></div>';

    if (!state.liveEntries.length) {
      byId("liveEntriesContainer").innerHTML = '<div class="admin-empty-state">' + workforceText("nobodyClocked") + '</div>';
      return;
    }
    byId("liveEntriesContainer").innerHTML = tableMarkup(
      [workforceText("employee"), workforceText("site"), workforceText("start"), workforceText("status"), workforceText("workTime")],
      state.liveEntries.map(function (entry) {
        return [
          escapeHtml(employeeName(entry.employee_id)),
          escapeHtml(siteName(entry.work_site_id)),
          formatDateTime(entry.started_at),
          statusBadge(entry.status),
          '<strong>' + formatDuration(entry.worked_seconds) + "</strong>"
        ];
      })
    );
  }

  function tableMarkup(headings, rows) {
    return (
      '<table class="workforce-table"><thead><tr>' +
      headings.map(function (heading) { return "<th>" + escapeHtml(heading) + "</th>"; }).join("") +
      "</tr></thead><tbody>" +
      rows.map(function (cells) {
        return "<tr>" + cells.map(function (cell) { return "<td>" + cell + "</td>"; }).join("") + "</tr>";
      }).join("") +
      "</tbody></table>"
    );
  }

  function statusBadge(status) {
    var keys = {
      working: "statusWorking",
      paused: "statusPaused",
      completed: "statusCompleted",
      scheduled: "statusScheduled",
      cancelled: "statusCancelled",
      approved: "statusApproved",
      pending: "statusPending",
      rejected: "statusRejected",
      active: "statusActive",
      disabled: "statusDisabled"
    };
    return '<span class="workforce-status" data-status="' + escapeHtml(status) + '">' + escapeHtml(keys[status] ? workforceText(keys[status]) : status) + "</span>";
  }

  function renderEmployees() {
    var search = String(byId("employeeSearch").value || "").trim().toLowerCase();
    var status = byId("employeeStatusFilter").value;
    var rows = state.employees.filter(function (employee) {
      var profile = profileById(employee.id);
      if (!profile) {
        return false;
      }
      var matchesSearch = !search || [profile.display_name, profile.email, employee.employee_number].join(" ").toLowerCase().indexOf(search) !== -1;
      var matchesStatus = !status || (status === "disabled" ? profile.disabled : !profile.disabled);
      return matchesSearch && matchesStatus;
    });
    if (!rows.length) {
      byId("employeesContainer").innerHTML = '<div class="admin-empty-state">' + workforceText("emptyEmployees") + '</div>';
      return;
    }
    byId("employeesContainer").innerHTML = tableMarkup(
      [workforceText("employee"), workforceText("employeeNumber"), workforceText("phone"), workforceText("employment"), workforceText("status"), workforceText("actions")],
      rows.map(function (employee) {
        var profile = profileById(employee.id);
        var employment = formatDate(employee.employment_start_date) + (employee.employment_end_date ? " – " + formatDate(employee.employment_end_date) : "");
        return [
          '<div class="workforce-person"><strong>' + escapeHtml(profile.display_name) + '</strong><span>' + escapeHtml(profile.email) + "</span></div>",
          escapeHtml(employee.employee_number),
          escapeHtml(employee.phone || "—"),
          employment,
          statusBadge(profile.disabled ? "disabled" : "active"),
          '<div class="workforce-row-actions"><button type="button" class="btn-secondary btn-sm" data-employee-edit="' + employee.id + '">' + workforceText("edit") + '</button><button type="button" class="' + (profile.disabled ? "btn-secondary" : "btn-danger") + ' btn-sm" data-employee-toggle="' + employee.id + '">' + workforceText(profile.disabled ? "activate" : "deactivate") + '</button><button type="button" class="btn-danger btn-sm" data-employee-delete="' + employee.id + '">' + workforceText("delete") + "</button></div>"
        ];
      })
    );
    byId("employeesContainer").querySelectorAll("[data-employee-edit]").forEach(function (button) {
      button.addEventListener("click", function () { openEmployee(employeeById(button.getAttribute("data-employee-edit"))); });
    });
    byId("employeesContainer").querySelectorAll("[data-employee-toggle]").forEach(function (button) {
      button.addEventListener("click", function () { toggleEmployee(button.getAttribute("data-employee-toggle")); });
    });
    byId("employeesContainer").querySelectorAll("[data-employee-delete]").forEach(function (button) {
      button.addEventListener("click", function () { deleteEmployee(button.getAttribute("data-employee-delete")); });
    });
  }

  function renderSites() {
    if (!state.sites.length) {
      byId("sitesContainer").innerHTML = '<div class="admin-empty-state">Noch keine Objekte angelegt.</div>';
      return;
    }
    byId("sitesContainer").innerHTML = '<div class="workforce-compact-list">' + state.sites.map(function (site) {
      return '<article class="workforce-compact-item"><div><div class="workforce-compact-title"><span class="workforce-site-code">' + escapeHtml(site.code) + "</span> " + escapeHtml(site.name) + '</div><p>' + escapeHtml(site.address || "Keine Adresse") + '</p></div><div class="workforce-row-actions">' + statusBadge(site.active ? "active" : "disabled") + '<button type="button" class="btn-secondary btn-sm" data-site-edit="' + site.id + '">Bearbeiten</button></div></article>';
    }).join("") + "</div>";
    byId("sitesContainer").querySelectorAll("[data-site-edit]").forEach(function (button) {
      button.addEventListener("click", function () { openSite(siteById(button.getAttribute("data-site-edit"))); });
    });
  }

  function assignmentIsCurrent(assignment) {
    var today = localDateValue();
    return (!assignment.valid_from || assignment.valid_from <= today) && (!assignment.valid_until || assignment.valid_until >= today);
  }

  function renderAssignments() {
    if (!state.assignments.length) {
      byId("assignmentsContainer").innerHTML = '<div class="admin-empty-state">Noch keine Zuordnungen angelegt.</div>';
      return;
    }
    byId("assignmentsContainer").innerHTML = '<div class="workforce-compact-list">' + state.assignments.map(function (assignment) {
      var range = (assignment.valid_from ? formatDate(assignment.valid_from) : "offen") + " – " + (assignment.valid_until ? formatDate(assignment.valid_until) : "offen");
      return '<article class="workforce-compact-item"><div><div class="workforce-compact-title">' + escapeHtml(employeeName(assignment.employee_id)) + ' <span class="workforce-arrow">→</span> ' + escapeHtml(siteName(assignment.work_site_id)) + (assignment.is_primary ? ' <span class="workforce-primary-tag">Hauptobjekt</span>' : "") + '</div><p>' + escapeHtml(range) + '</p></div><div class="workforce-row-actions">' + statusBadge(assignmentIsCurrent(assignment) ? "active" : "disabled") + '<button type="button" class="btn-secondary btn-sm" data-assignment-edit="' + assignment.id + '">Bearbeiten</button></div></article>';
    }).join("") + "</div>";
    byId("assignmentsContainer").querySelectorAll("[data-assignment-edit]").forEach(function (button) {
      button.addEventListener("click", function () {
        openAssignment(state.assignments.find(function (item) { return item.id === button.getAttribute("data-assignment-edit"); }));
      });
    });
  }

  function populateSelect(selectId, rows, labelFn, includeAll) {
    var select = byId(selectId);
    var current = select.value;
    select.innerHTML = includeAll ? '<option value="">Alle</option>' : "";
    rows.forEach(function (row) {
      var option = document.createElement("option");
      option.value = row.id;
      option.textContent = labelFn(row);
      select.appendChild(option);
    });
    if (Array.from(select.options).some(function (option) { return option.value === current; })) {
      select.value = current;
    }
  }

  function populateSelects() {
    var employeeRows = state.employees.filter(function (employee) { return Boolean(profileById(employee.id)); });
    var activeSites = state.sites.filter(function (site) { return site.active; });
    ["scheduleEmployee", "absenceEmployee", "reportEmployee"].forEach(function (id) {
      populateSelect(id, employeeRows, function (row) { return employeeName(row.id); }, true);
    });
    ["assignmentEmployee", "shiftEmployee", "absenceFormEmployee"].forEach(function (id) {
      populateSelect(id, employeeRows, function (row) { return employeeName(row.id); }, false);
    });
    ["scheduleSite", "reportSite"].forEach(function (id) {
      populateSelect(id, state.sites, function (row) { return row.code + " · " + row.name; }, true);
    });
    ["employeePrimarySite", "assignmentSite", "shiftSite"].forEach(function (id) {
      var hasNone = id === "employeePrimarySite";
      populateSelect(id, activeSites, function (row) { return row.code + " · " + row.name; }, hasNone);
      if (hasNone && byId(id).options.length) {
        byId(id).options[0].textContent = workforceText("noPrimarySite");
      }
    });
  }

  function switchPanel(panelName) {
    state.activePanel = panelName;
    document.querySelectorAll("[data-panel-name]").forEach(function (panel) {
      panel.hidden = panel.getAttribute("data-panel-name") !== panelName;
    });
    byId("workforceTabs").querySelectorAll("[data-panel]").forEach(function (button) {
      var active = button.getAttribute("data-panel") === panelName;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    updateContextAction();
    loadActivePanel().catch(function (error) {
      setPageError(errorMessage(error));
    });
  }

  function updateContextAction() {
    var button = byId("contextActionBtn");
    var config = {
      overview: [workforceText("addEmployee"), function () { openEmployee(null); }],
      employees: [workforceText("addEmployee"), function () { openEmployee(null); }],
      sites: ["+ Objekt", function () { openSite(null); }],
      schedule: ["+ Schicht", function () { openShift(null); }],
      absences: ["+ Abwesenheit", function () { openAbsence(null); }],
      reports: ["Bericht erstellen", runReport]
    }[state.activePanel];
    button.textContent = config[0];
    button.onclick = config[1];
  }

  function openEmployee(employee) {
    var profile = employee ? profileById(employee.id) : null;
    byId("employeeForm").reset();
    setFormError("employeeError", "");
    byId("employeeId").value = employee ? employee.id : "";
    byId("employeeName").value = profile ? profile.display_name : "";
    byId("employeeEmail").value = profile ? profile.email : "";
    byId("employeeEmail").disabled = Boolean(employee);
    byId("employeeNumber").value = employee ? employee.employee_number : "";
    byId("employeePhone").value = employee ? employee.phone || "" : "";
    byId("employmentStart").value = employee ? employee.employment_start_date || "" : localDateValue();
    byId("employmentEnd").value = employee ? employee.employment_end_date || "" : "";
    byId("employeePrimarySiteField").hidden = Boolean(employee);
    byId("employeeInviteNote").hidden = Boolean(employee);
    byId("employeeModalTitle").textContent = workforceText(employee ? "employeeModalEdit" : "employeeModalAdd");
    window.AdminUI.openModal(byId("employeeScrim"));
  }

  function saveEmployee(event) {
    event.preventDefault();
    setFormError("employeeError", "");
    var id = byId("employeeId").value;
    var name = byId("employeeName").value.trim();
    var email = byId("employeeEmail").value.trim().toLowerCase();
    var number = byId("employeeNumber").value.trim();
    var start = byId("employmentStart").value || null;
    var end = byId("employmentEnd").value || null;
    try {
      requireValue(name, workforceText("nameRequired"));
      requireValue(email, workforceText("emailRequired"));
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error(workforceText("emailRequired"));
      }
      requireValue(number, workforceText("employeeNumberRequired"));
      validateDateRange(start, end);
    } catch (error) {
      setFormError("employeeError", error.message);
      return;
    }
    setSaving("employeeSaveBtn", true);
    if (!id) {
      if (!state.accessToken) {
        setFormError("employeeError", workforceText("sessionLoading"));
        setSaving("employeeSaveBtn", false);
        return;
      }
      var config = window.SAUBERPLUS_ADMIN_CONFIG;
      fetch(config.supabaseUrl + "/functions/v1/admin-create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + state.accessToken },
        body: JSON.stringify({
          displayName: name,
          email: email,
          role: "employee",
          employeeNumber: number,
          phone: byId("employeePhone").value.trim(),
          employmentStartDate: start || "",
          employmentEndDate: end || "",
          primaryWorkSiteId: byId("employeePrimarySite").value || null
        })
      }).then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) { return { ok: response.ok, data: data }; });
      }).then(function (result) {
        if (!result.ok) {
          throw new Error(window.AdminI18N.translateServerError(result.data.error || "Konto konnte nicht erstellt werden."));
        }
        window.AdminUI.closeModal(byId("employeeScrim"));
        window.AdminUI.toast(workforceText("employeeCreated"), "success");
        return reloadAll();
      }).catch(function (error) {
        setFormError("employeeError", errorMessage(error));
      }).finally(function () {
        setSaving("employeeSaveBtn", false);
      });
      return;
    }

    var currentProfile = profileById(id);
    queryData(state.client.rpc("update_employee_account", {
      p_employee_id: id,
      p_display_name: name,
      p_employee_number: number,
      p_phone: byId("employeePhone").value.trim(),
      p_employment_start_date: start,
      p_employment_end_date: end,
      p_disabled: Boolean(currentProfile && currentProfile.disabled)
    })).then(function () {
      window.AdminUI.closeModal(byId("employeeScrim"));
      window.AdminUI.toast(workforceText("employeeUpdated"), "success");
      return reloadAll();
    }).catch(function (error) {
      setFormError("employeeError", errorMessage(error));
    }).finally(function () {
      setSaving("employeeSaveBtn", false);
    });
  }

  function toggleEmployee(id) {
    var profile = profileById(id);
    if (!profile) {
      return;
    }
    var nextDisabled = !profile.disabled;
    window.AdminUI.confirmDialog({
      title: workforceText(nextDisabled ? "disableTitle" : "enableTitle"),
      message: workforceText(nextDisabled ? "disableMessage" : "enableMessage"),
      confirmLabel: workforceText(nextDisabled ? "deactivate" : "activate"),
      danger: nextDisabled
    }).then(function (confirmed) {
      if (!confirmed) {
        return;
      }
      return queryData(state.client.rpc("manage_user_account", {
        p_user_id: id,
        p_action: nextDisabled ? "disable" : "enable",
        p_role: null
      }))
        .then(function () {
          window.AdminUI.toast(workforceText(nextDisabled ? "employeeDisabled" : "employeeEnabled"), "success");
          return reloadAll();
        })
        .catch(function (error) { window.AdminUI.toast(errorMessage(error), "error"); });
    });
  }

  function deleteEmployee(id) {
    var profile = profileById(id);
    if (!profile) {
      return;
    }
    window.AdminUI.confirmDialog({
      title: workforceText("deleteTitle"),
      message: workforceText("deleteMessage", { name: profile.display_name }),
      confirmLabel: workforceText("delete"),
      danger: true
    }).then(function (confirmed) {
      if (!confirmed) {
        return;
      }
      return queryData(state.client.rpc("manage_user_account", {
        p_user_id: id,
        p_action: "delete",
        p_role: null
      })).then(function () {
        window.AdminUI.toast(workforceText("employeeDeleted"), "success");
        return reloadAll();
      }).catch(function (error) {
        window.AdminUI.toast(errorMessage(error), "error");
      });
    });
  }

  function openSite(site) {
    byId("siteForm").reset();
    setFormError("siteError", "");
    byId("siteId").value = site ? site.id : "";
    byId("siteCode").value = site ? site.code : "";
    byId("siteName").value = site ? site.name : "";
    byId("siteAddress").value = site ? site.address || "" : "";
    byId("siteNotes").value = site ? site.notes || "" : "";
    byId("siteActive").checked = site ? site.active : true;
    byId("siteModalTitle").textContent = site ? "Objekt bearbeiten" : "Objekt hinzufügen";
    window.AdminUI.openModal(byId("siteScrim"));
  }

  function saveSite(event) {
    event.preventDefault();
    setFormError("siteError", "");
    var id = byId("siteId").value;
    var payload = {
      code: byId("siteCode").value.trim(),
      name: byId("siteName").value.trim(),
      address: byId("siteAddress").value.trim(),
      notes: byId("siteNotes").value.trim(),
      active: byId("siteActive").checked,
      updated_by: state.profile.id
    };
    try {
      requireValue(payload.code, "Bitte eine Objekt-Nummer angeben.");
      requireValue(payload.name, "Bitte einen Objektnamen angeben.");
    } catch (error) {
      setFormError("siteError", error.message);
      return;
    }
    if (!id) {
      payload.created_by = state.profile.id;
    }
    setSaving("siteSaveBtn", true);
    var query = id ? state.client.from("work_sites").update(payload).eq("id", id) : state.client.from("work_sites").insert(payload);
    queryData(query.select("id")).then(function () {
      window.AdminUI.closeModal(byId("siteScrim"));
      window.AdminUI.toast(id ? "Objekt aktualisiert." : "Objekt angelegt.", "success");
      return reloadAll();
    }).catch(function (error) {
      setFormError("siteError", errorMessage(error));
    }).finally(function () {
      setSaving("siteSaveBtn", false);
    });
  }

  function openAssignment(assignment) {
    byId("assignmentForm").reset();
    setFormError("assignmentError", "");
    byId("assignmentId").value = assignment ? assignment.id : "";
    byId("assignmentEmployee").value = assignment ? assignment.employee_id : "";
    byId("assignmentSite").value = assignment ? assignment.work_site_id : "";
    byId("assignmentFrom").value = assignment ? assignment.valid_from || "" : localDateValue();
    byId("assignmentUntil").value = assignment ? assignment.valid_until || "" : "";
    byId("assignmentPrimary").checked = Boolean(assignment && assignment.is_primary);
    byId("assignmentModalTitle").textContent = assignment ? "Zuordnung bearbeiten" : "Zuordnung hinzufügen";
    window.AdminUI.openModal(byId("assignmentScrim"));
  }

  function saveAssignment(event) {
    event.preventDefault();
    setFormError("assignmentError", "");
    var id = byId("assignmentId").value;
    var employeeId = byId("assignmentEmployee").value;
    var from = byId("assignmentFrom").value || null;
    var until = byId("assignmentUntil").value || null;
    try {
      requireValue(employeeId, "Bitte einen Mitarbeiter wählen.");
      requireValue(byId("assignmentSite").value, "Bitte ein Objekt wählen.");
      validateDateRange(from, until);
    } catch (error) {
      setFormError("assignmentError", error.message);
      return;
    }
    var payload = {
      employee_id: employeeId,
      work_site_id: byId("assignmentSite").value,
      valid_from: from,
      valid_until: until,
      is_primary: byId("assignmentPrimary").checked,
      updated_by: state.profile.id
    };
    if (!id) {
      payload.created_by = state.profile.id;
    }
    var conflictingPrimary = payload.is_primary && state.assignments.some(function (assignment) {
      return assignment.employee_id === employeeId && assignment.is_primary && !assignment.valid_until && assignment.id !== id;
    });
    if (conflictingPrimary) {
      setFormError("assignmentError", "Für diesen Mitarbeiter besteht bereits ein Hauptobjekt. Bitte die bestehende Zuordnung zuerst bearbeiten.");
      return;
    }
    setSaving("assignmentSaveBtn", true);
    var assignmentQuery = id ? state.client.from("employee_work_sites").update(payload).eq("id", id) : state.client.from("employee_work_sites").insert(payload);
    queryData(assignmentQuery.select("id")).then(function () {
      window.AdminUI.closeModal(byId("assignmentScrim"));
      window.AdminUI.toast("Zuordnung gespeichert.", "success");
      return reloadAll();
    }).catch(function (error) {
      setFormError("assignmentError", errorMessage(error));
    }).finally(function () {
      setSaving("assignmentSaveBtn", false);
    });
  }

  function loadSchedule() {
    var from = byId("scheduleFrom").value || localDateValue();
    var to = byId("scheduleTo").value || addDays(from, 7);
    var query = state.client.from("work_shifts").select("*").gte("scheduled_start", toIsoDatetime(from + "T00:00")).lt("scheduled_start", toIsoDatetime(addDays(to, 1) + "T00:00")).order("scheduled_start", { ascending: true });
    if (byId("scheduleEmployee").value) {
      query = query.eq("employee_id", byId("scheduleEmployee").value);
    }
    if (byId("scheduleSite").value) {
      query = query.eq("work_site_id", byId("scheduleSite").value);
    }
    byId("scheduleContainer").innerHTML = '<div class="admin-loading-block">Wird geladen …</div>';
    return queryData(query).then(function (rows) {
      state.shifts = rows;
      renderSchedule();
    });
  }

  function renderSchedule() {
    if (!state.shifts.length) {
      byId("scheduleContainer").innerHTML = '<div class="admin-empty-state">Keine Schichten im gewählten Zeitraum.</div>';
      return;
    }
    byId("scheduleContainer").innerHTML = tableMarkup(
      ["Datum", "Mitarbeiter", "Objekt", "Beginn", "Ende", "Status", "Aktion"],
      state.shifts.map(function (shift) {
        return [
          formatDate(shift.scheduled_start.slice(0, 10)),
          escapeHtml(employeeName(shift.employee_id)),
          escapeHtml(siteName(shift.work_site_id)),
          formatDateTime(shift.scheduled_start).split(", ").pop(),
          formatDateTime(shift.scheduled_end).split(", ").pop(),
          statusBadge(shift.status),
          '<button type="button" class="btn-secondary btn-sm" data-shift-edit="' + shift.id + '">Bearbeiten</button>'
        ];
      })
    );
    byId("scheduleContainer").querySelectorAll("[data-shift-edit]").forEach(function (button) {
      button.addEventListener("click", function () {
        openShift(state.shifts.find(function (row) { return row.id === button.getAttribute("data-shift-edit"); }));
      });
    });
  }

  function openShift(shift) {
    byId("shiftForm").reset();
    setFormError("shiftError", "");
    byId("shiftId").value = shift ? shift.id : "";
    byId("shiftEmployee").value = shift ? shift.employee_id : "";
    byId("shiftSite").value = shift ? shift.work_site_id : "";
    var defaultStart = new Date();
    defaultStart.setMinutes(0, 0, 0);
    defaultStart.setHours(defaultStart.getHours() + 1);
    var defaultEnd = new Date(defaultStart.getTime() + 8 * 3600000);
    byId("shiftStart").value = shift ? toLocalDatetime(shift.scheduled_start) : toLocalDatetime(defaultStart.toISOString());
    byId("shiftEnd").value = shift ? toLocalDatetime(shift.scheduled_end) : toLocalDatetime(defaultEnd.toISOString());
    byId("shiftNotes").value = shift ? shift.notes || "" : "";
    byId("shiftCancelled").checked = Boolean(shift && shift.status === "cancelled");
    byId("shiftModalTitle").textContent = shift ? "Schicht bearbeiten" : "Schicht planen";
    window.AdminUI.openModal(byId("shiftScrim"));
  }

  function saveShift(event) {
    event.preventDefault();
    setFormError("shiftError", "");
    var id = byId("shiftId").value;
    var start = byId("shiftStart").value;
    var end = byId("shiftEnd").value;
    try {
      requireValue(byId("shiftEmployee").value, "Bitte einen Mitarbeiter wählen.");
      requireValue(byId("shiftSite").value, "Bitte ein Objekt wählen.");
      requireValue(start, "Bitte den Schichtbeginn angeben.");
      requireValue(end, "Bitte das Schichtende angeben.");
      if (new Date(end).getTime() <= new Date(start).getTime()) {
        throw new Error("Das Schichtende muss nach dem Beginn liegen.");
      }
    } catch (error) {
      setFormError("shiftError", error.message);
      return;
    }
    var payload = {
      employee_id: byId("shiftEmployee").value,
      work_site_id: byId("shiftSite").value,
      scheduled_start: toIsoDatetime(start),
      scheduled_end: toIsoDatetime(end),
      status: byId("shiftCancelled").checked ? "cancelled" : "scheduled",
      notes: byId("shiftNotes").value.trim(),
      updated_by: state.profile.id
    };
    if (!id) {
      payload.created_by = state.profile.id;
    }
    setSaving("shiftSaveBtn", true);
    var query = id ? state.client.from("work_shifts").update(payload).eq("id", id) : state.client.from("work_shifts").insert(payload);
    queryData(query.select("id")).then(function () {
      window.AdminUI.closeModal(byId("shiftScrim"));
      window.AdminUI.toast("Schicht gespeichert.", "success");
      return loadSchedule().then(loadOverview);
    }).catch(function (error) {
      setFormError("shiftError", errorMessage(error));
    }).finally(function () {
      setSaving("shiftSaveBtn", false);
    });
  }

  function loadAbsences() {
    var from = byId("absenceFrom").value || startOfMonth();
    var to = byId("absenceTo").value || endOfMonth();
    var query = state.client.from("employee_absences").select("*").lte("start_date", to).gte("end_date", from).order("start_date", { ascending: true });
    if (byId("absenceEmployee").value) {
      query = query.eq("employee_id", byId("absenceEmployee").value);
    }
    if (byId("absenceType").value) {
      query = query.eq("absence_type", byId("absenceType").value);
    }
    byId("absencesContainer").innerHTML = '<div class="admin-loading-block">Wird geladen …</div>';
    return queryData(query).then(function (rows) {
      state.absences = rows;
      renderAbsences();
    });
  }

  function renderAbsences() {
    if (!state.absences.length) {
      byId("absencesContainer").innerHTML = '<div class="admin-empty-state">Keine Abwesenheiten im gewählten Zeitraum.</div>';
      return;
    }
    byId("absencesContainer").innerHTML = tableMarkup(
      ["Mitarbeiter", "Typ", "Von", "Bis", "Status", "Notiz", "Aktion"],
      state.absences.map(function (absence) {
        return [
          escapeHtml(employeeName(absence.employee_id)),
          '<span class="workforce-absence-type" data-type="' + absence.absence_type + '">' + (absence.absence_type === "vacation" ? "Urlaub" : "Krank") + "</span>",
          formatDate(absence.start_date),
          formatDate(absence.end_date),
          statusBadge(absence.approval_status),
          escapeHtml(absence.notes || "—"),
          '<button type="button" class="btn-secondary btn-sm" data-absence-edit="' + absence.id + '">Bearbeiten</button>'
        ];
      })
    );
    byId("absencesContainer").querySelectorAll("[data-absence-edit]").forEach(function (button) {
      button.addEventListener("click", function () {
        openAbsence(state.absences.find(function (row) { return row.id === button.getAttribute("data-absence-edit"); }));
      });
    });
  }

  function openAbsence(absence) {
    byId("absenceForm").reset();
    setFormError("absenceError", "");
    byId("absenceId").value = absence ? absence.id : "";
    byId("absenceFormEmployee").value = absence ? absence.employee_id : "";
    byId("absenceFormType").value = absence ? absence.absence_type : "vacation";
    byId("absenceStatus").value = absence ? absence.approval_status : "approved";
    byId("absenceFormFrom").value = absence ? absence.start_date : localDateValue();
    byId("absenceFormTo").value = absence ? absence.end_date : localDateValue();
    byId("absenceNotes").value = absence ? absence.notes || "" : "";
    byId("absenceModalTitle").textContent = absence ? "Abwesenheit bearbeiten" : "Abwesenheit erfassen";
    window.AdminUI.openModal(byId("absenceScrim"));
  }

  function saveAbsence(event) {
    event.preventDefault();
    setFormError("absenceError", "");
    var id = byId("absenceId").value;
    var from = byId("absenceFormFrom").value;
    var to = byId("absenceFormTo").value;
    try {
      requireValue(byId("absenceFormEmployee").value, "Bitte einen Mitarbeiter wählen.");
      requireValue(from, "Bitte den Beginn angeben.");
      requireValue(to, "Bitte das Ende angeben.");
      validateDateRange(from, to);
    } catch (error) {
      setFormError("absenceError", error.message);
      return;
    }
    var payload = {
      employee_id: byId("absenceFormEmployee").value,
      absence_type: byId("absenceFormType").value,
      start_date: from,
      end_date: to,
      approval_status: byId("absenceStatus").value,
      notes: byId("absenceNotes").value.trim(),
      updated_by: state.profile.id
    };
    if (!id) {
      payload.created_by = state.profile.id;
    }
    setSaving("absenceSaveBtn", true);
    var query = id ? state.client.from("employee_absences").update(payload).eq("id", id) : state.client.from("employee_absences").insert(payload);
    queryData(query.select("id")).then(function () {
      window.AdminUI.closeModal(byId("absenceScrim"));
      window.AdminUI.toast("Abwesenheit gespeichert.", "success");
      return loadAbsences();
    }).catch(function (error) {
      setFormError("absenceError", errorMessage(error));
    }).finally(function () {
      setSaving("absenceSaveBtn", false);
    });
  }

  function runReport() {
    var from = byId("reportFrom").value;
    var to = byId("reportTo").value;
    try {
      requireValue(from, "Bitte ein Startdatum wählen.");
      requireValue(to, "Bitte ein Enddatum wählen.");
      validateDateRange(from, to);
      var maxDate = new Date(from + "T12:00:00");
      maxDate.setDate(maxDate.getDate() + 370);
      if (new Date(to + "T12:00:00") > maxDate) {
        throw new Error("Der Berichtszeitraum darf höchstens 370 Tage umfassen.");
      }
    } catch (error) {
      window.AdminUI.toast(error.message, "error");
      return Promise.resolve();
    }
    var button = byId("runReportBtn");
    button.disabled = true;
    byId("reportContainer").innerHTML = '<div class="admin-loading-block">Bericht wird erstellt …</div>';
    var query = state.client.from("time_entry_totals").select("*").gte("work_date", from).lte("work_date", to).order("work_date", { ascending: true }).order("started_at", { ascending: true });
    if (byId("reportEmployee").value) {
      query = query.eq("employee_id", byId("reportEmployee").value);
    }
    if (byId("reportSite").value) {
      query = query.eq("work_site_id", byId("reportSite").value);
    }
    return queryData(query).then(function (rows) {
      state.reportRows = rows;
      renderReport();
    }).catch(function (error) {
      byId("reportContainer").innerHTML = '<div class="admin-empty-state">' + escapeHtml(errorMessage(error)) + "</div>";
    }).finally(function () {
      button.disabled = false;
    });
  }

  function renderReport() {
    var summary = {};
    var total = 0;
    state.reportRows.forEach(function (row) {
      summary[row.employee_id] = (summary[row.employee_id] || 0) + Number(row.worked_seconds || 0);
      total += Number(row.worked_seconds || 0);
    });
    byId("reportSummary").hidden = false;
    byId("reportSummary").innerHTML = '<div><span>Gesamtstunden</span><strong>' + formatDuration(total) + '</strong></div><div><span>Mitarbeiter</span><strong>' + Object.keys(summary).length + '</strong></div><div><span>Arbeitstage</span><strong>' + new Set(state.reportRows.map(function (row) { return row.employee_id + ":" + row.work_date; })).size + '</strong></div><button type="button" class="btn-secondary btn-sm" id="exportReportBtn"' + (state.reportRows.length ? "" : " disabled") + '>CSV exportieren</button>';
    byId("exportReportBtn").addEventListener("click", exportReportCsv);
    if (!state.reportRows.length) {
      byId("reportContainer").innerHTML = '<div class="admin-empty-state">Keine Arbeitszeiten im gewählten Zeitraum.</div>';
      return;
    }
    var subtotalRows = Object.keys(summary).sort(function (a, b) { return employeeName(a).localeCompare(employeeName(b), "de"); }).map(function (employeeId) {
      return '<div class="workforce-report-person"><span>' + escapeHtml(employeeName(employeeId)) + '</span><strong>' + formatDuration(summary[employeeId]) + "</strong></div>";
    }).join("");
    var bucket = byId("reportBucket").value;
    var grouped = {};
    state.reportRows.forEach(function (row) {
      var start = reportPeriodStart(row.work_date, bucket);
      var key = row.employee_id + "|" + start;
      if (!grouped[key]) {
        grouped[key] = { employeeId: row.employee_id, periodStart: start, seconds: 0 };
      }
      grouped[key].seconds += Number(row.worked_seconds || 0);
    });
    var groupedRows = Object.keys(grouped).map(function (key) { return grouped[key]; }).sort(function (a, b) {
      return a.periodStart.localeCompare(b.periodStart) || employeeName(a.employeeId).localeCompare(employeeName(b.employeeId), "de");
    });
    var bucketLabels = { day: "Tägliche Summen", week: "Wöchentliche Summen", month: "Monatliche Summen" };
    var groupedTable = '<div class="workforce-report-groups"><h3>' + bucketLabels[bucket] + "</h3>" + tableMarkup(
      [bucket === "day" ? "Tag" : bucket === "week" ? "Woche ab" : "Monat", "Mitarbeiter", "Arbeitszeit"],
      groupedRows.map(function (row) { return [formatDate(row.periodStart), escapeHtml(employeeName(row.employeeId)), '<strong>' + formatDuration(row.seconds) + "</strong>"]; })
    ) + "</div>";
    byId("reportContainer").innerHTML = '<div class="workforce-report-people">' + subtotalRows + "</div>" + groupedTable + '<div class="workforce-report-groups"><h3>Einzelne Zeiteinträge</h3>' + tableMarkup(
      ["Datum", "Mitarbeiter", "Objekt", "Start", "Ende", "Pause", "Arbeitszeit", "Notiz"],
      state.reportRows.map(function (row) {
        return [formatDate(row.work_date), escapeHtml(employeeName(row.employee_id)), escapeHtml(siteName(row.work_site_id)), formatDateTime(row.started_at), formatDateTime(row.ended_at), formatDuration(row.break_seconds), '<strong>' + formatDuration(row.worked_seconds) + "</strong>", escapeHtml(row.note || "—")];
      })
    ) + "</div>";
  }

  function reportPeriodStart(dateText, bucket) {
    if (bucket === "month") {
      return dateText.slice(0, 7) + "-01";
    }
    if (bucket === "week") {
      var date = new Date(dateText + "T12:00:00");
      var daysSinceMonday = (date.getDay() + 6) % 7;
      date.setDate(date.getDate() - daysSinceMonday);
      return localDateValue(date);
    }
    return dateText;
  }

  function csvCell(value) {
    return '"' + String(value == null ? "" : value).replace(/"/g, '""') + '"';
  }

  function exportReportCsv() {
    var lines = [["Datum", "Mitarbeiter", "Personalnummer", "Objekt", "Start", "Ende", "Pause (Sek.)", "Arbeitszeit (Sek.)", "Notiz"]];
    state.reportRows.forEach(function (row) {
      var employee = employeeById(row.employee_id);
      lines.push([row.work_date, employeeName(row.employee_id), employee ? employee.employee_number : "", siteName(row.work_site_id), row.started_at, row.ended_at || "", row.break_seconds, row.worked_seconds, row.note || ""]);
    });
    var csv = "\ufeff" + lines.map(function (line) { return line.map(csvCell).join(";"); }).join("\r\n");
    var url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    var link = document.createElement("a");
    link.href = url;
    link.download = "sauberplus-arbeitszeiten-" + byId("reportFrom").value + "-" + byId("reportTo").value + ".csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function setInitialDates() {
    var today = localDateValue();
    byId("scheduleFrom").value = today;
    byId("scheduleTo").value = addDays(today, 7);
    byId("absenceFrom").value = startOfMonth();
    byId("absenceTo").value = endOfMonth();
    byId("reportFrom").value = startOfMonth();
    byId("reportTo").value = endOfMonth();
  }

  function wireEvents() {
    byId("workforceTabs").querySelectorAll("[data-panel]").forEach(function (button) {
      button.addEventListener("click", function () { switchPanel(button.getAttribute("data-panel")); });
    });
    byId("refreshBtn").addEventListener("click", reloadAll);
    byId("employeeSearch").addEventListener("input", renderEmployees);
    byId("employeeStatusFilter").addEventListener("change", renderEmployees);
    byId("newSiteBtn").addEventListener("click", function () { openSite(null); });
    byId("newAssignmentBtn").addEventListener("click", function () { openAssignment(null); });
    byId("applyScheduleFilters").addEventListener("click", function () { loadSchedule().catch(function (error) { setPageError(errorMessage(error)); }); });
    byId("applyAbsenceFilters").addEventListener("click", function () { loadAbsences().catch(function (error) { setPageError(errorMessage(error)); }); });
    byId("runReportBtn").addEventListener("click", runReport);
    byId("reportBucket").addEventListener("change", function () {
      if (state.reportRows.length) {
        renderReport();
      }
    });
    byId("employeeForm").addEventListener("submit", saveEmployee);
    byId("siteForm").addEventListener("submit", saveSite);
    byId("assignmentForm").addEventListener("submit", saveAssignment);
    byId("shiftForm").addEventListener("submit", saveShift);
    byId("absenceForm").addEventListener("submit", saveAbsence);
    byId("logoutBtn").addEventListener("click", function () {
      window.AdminAuth.signOut().then(function () { window.location.href = "index.html"; });
    });
  }

  applyWorkforceCopy();
  setInitialDates();
  wireEvents();

  window.AdminAuth.requireSession().then(function (profile) {
    if (!profile || !window.AdminAuth.requireRole(profile, "super_admin")) {
      return;
    }
    state.profile = profile;
    state.client = window.AdminSupabase.getClient();
    window.AdminUI.applyRoleGatedNav(profile.role);
    byId("topbarUser").textContent = profile.email;
    state.client.auth.getSession().then(function (result) {
      state.accessToken = result.data.session ? result.data.session.access_token : null;
    });
    byId("adminShell").hidden = false;
    updateContextAction();
    reloadAll();
  });
})();
