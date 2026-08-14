(function () {
  "use strict";

  var BERLIN_TIME_ZONE = "Europe/Berlin";
  var CLOCK_INTERVAL_MS = 1000;
  var SHIFT_LOOKAROUND_MS = 48 * 60 * 60 * 1000;
  var MAX_NOTE_LENGTH = 1000;

  var client = null;
  var elements = {};
  var refreshTimer = null;
  var clockTimer = null;
  var actionPending = false;
  var notePending = false;
  var activeProfile = null;
  var activeEmployee = null;
  var activeTimeState = null;
  var activeAbsence = null;
  var todayShifts = [];
  var availableSites = [];
  var selectedWorkSiteId = null;
  var latestEntry = null;
  var savedNote = "";
  var dailyBaseSeconds = 0;
  var dailyBaseServerMs = 0;
  var serverClockOffsetMs = 0;
  var currentBerlinDate = "";
  var pendingRequestIds = Object.create(null);
  var inviteFlow = readAuthFlowType() === "invite";

  document.addEventListener("DOMContentLoaded", initialize);

  function cacheElements() {
    [
      "loadingView", "loginView", "inviteView", "staffView", "appView", "loginForm", "loginEmail",
      "loginPassword", "loginButton", "loginError", "passwordToggle", "staffLogoutButton",
      "logoutButton", "accountName", "todayLabel", "greetingHeading", "statePill", "stateLabel",
      "globalAlert", "clockHeading", "siteAddress", "siteSelectWrap", "siteSelect", "shiftTime",
      "employeeNumber", "workedTime", "timerHint", "clockActions", "actionFeedback", "scheduleDate",
      "scheduleEmpty", "scheduleList", "workNote", "noteStatus", "noteCounter", "saveNoteButton",
      "inviteForm", "invitePassword", "invitePasswordConfirm", "inviteButton", "inviteError"
    ].forEach(function (id) {
      elements[id] = document.getElementById(id);
    });
  }

  function bindEvents() {
    elements.loginForm.addEventListener("submit", handleLogin);
    elements.inviteForm.addEventListener("submit", handleInvitePassword);
    elements.passwordToggle.addEventListener("click", togglePasswordVisibility);
    elements.staffLogoutButton.addEventListener("click", handleLogout);
    elements.logoutButton.addEventListener("click", handleLogout);
    elements.siteSelect.addEventListener("change", function () {
      selectedWorkSiteId = elements.siteSelect.value || null;
      renderWorkContext();
      renderActionAvailability();
    });
    elements.clockActions.addEventListener("click", function (event) {
      var button = event.target.closest("[data-action]");
      if (!button || button.disabled) {
        return;
      }
      recordTimeAction(button.getAttribute("data-action"));
    });
    elements.workNote.addEventListener("input", renderNoteControls);
    elements.saveNoteButton.addEventListener("click", saveNote);
  }

  async function initialize() {
    cacheElements();
    bindEvents();

    try {
      client = createClient();
      client.auth.onAuthStateChange(function (event) {
        window.setTimeout(function () {
          if (event === "SIGNED_OUT") {
            resetEmployeeState();
            showView("login");
          }
        }, 0);
      });

      var sessionResult = await client.auth.getSession();
      if (sessionResult.error) {
        throw sessionResult.error;
      }

      if (!sessionResult.data.session) {
        showView("login");
        return;
      }

      await routeSession(sessionResult.data.session);
    } catch (error) {
      showView("login");
      showLoginError("Der Mitarbeiter-Zugang ist momentan nicht erreichbar. Bitte versuchen Sie es später erneut.");
    }
  }

  function createClient() {
    var config = window.SAUBERPLUS_ADMIN_CONFIG || {};
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      throw new Error("Supabase configuration is missing.");
    }
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      throw new Error("Supabase client failed to load.");
    }

    return window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
  }

  async function routeSession(session) {
    showView("loading");
    var profileResult = await client
      .from("user_profiles")
      .select("id,email,display_name,role,disabled")
      .eq("id", session.user.id)
      .maybeSingle();

    if (profileResult.error || !profileResult.data || profileResult.data.disabled) {
      await client.auth.signOut();
      showView("login");
      showLoginError("Dieses Konto ist nicht aktiv. Bitte wenden Sie sich an die Verwaltung.");
      return;
    }

    activeProfile = profileResult.data;
    if (activeProfile.role === "super_admin" || activeProfile.role === "content_manager") {
      showView("staff");
      return;
    }

    if (activeProfile.role !== "employee") {
      await client.auth.signOut();
      showView("login");
      showLoginError("Dieses Konto ist nicht für die Zeiterfassung freigeschaltet.");
      return;
    }

    if (inviteFlow) {
      showView("invite");
      return;
    }

    showView("app");
    await refreshEmployeeDay();
    startClock();
    scheduleBackgroundRefresh();
  }

  async function handleLogin(event) {
    event.preventDefault();
    hideLoginError();

    var email = String(elements.loginEmail.value || "").trim().toLowerCase();
    var password = elements.loginPassword.value;
    if (!email || !password || !elements.loginEmail.validity.valid) {
      showLoginError("Bitte geben Sie eine gültige E-Mail-Adresse und Ihr Passwort ein.");
      return;
    }

    setLoginPending(true);
    try {
      var lockoutResult = await client.rpc("is_locked_out", { p_email: email });
      if (lockoutResult.error) {
        throw lockoutResult.error;
      }
      if (lockoutResult.data === true) {
        showLoginError("Zu viele Anmeldeversuche. Bitte warten Sie kurz und versuchen Sie es erneut.");
        return;
      }

      var signInResult = await client.auth.signInWithPassword({ email: email, password: password });
      if (signInResult.error) {
        await client.rpc("register_failed_login", { p_email: email });
        showLoginError("E-Mail-Adresse oder Passwort ist nicht korrekt.");
        return;
      }

      await client.rpc("register_successful_login", { p_email: email });
      elements.loginPassword.value = "";
      await routeSession(signInResult.data.session);
    } catch (error) {
      showLoginError("Die Anmeldung ist momentan nicht möglich. Prüfen Sie Ihre Verbindung und versuchen Sie es erneut.");
    } finally {
      setLoginPending(false);
    }
  }

  async function handleLogout() {
    stopTimers();
    elements.staffLogoutButton.disabled = true;
    elements.logoutButton.disabled = true;
    try {
      await client.auth.signOut();
    } finally {
      resetEmployeeState();
      elements.staffLogoutButton.disabled = false;
      elements.logoutButton.disabled = false;
      showView("login");
    }
  }

  async function handleInvitePassword(event) {
    event.preventDefault();
    var password = elements.invitePassword.value;
    var confirmation = elements.invitePasswordConfirm.value;
    elements.inviteError.hidden = true;
    elements.inviteError.textContent = "";

    if (password.length < 8) {
      elements.inviteError.textContent = "Das Passwort muss mindestens 8 Zeichen lang sein.";
      elements.inviteError.hidden = false;
      return;
    }
    if (password !== confirmation) {
      elements.inviteError.textContent = "Die Passwörter stimmen nicht überein.";
      elements.inviteError.hidden = false;
      return;
    }

    elements.inviteButton.disabled = true;
    elements.inviteButton.setAttribute("data-loading", "true");
    try {
      var updateResult = await client.auth.updateUser({ password: password });
      if (updateResult.error) {
        throw updateResult.error;
      }
      inviteFlow = false;
      elements.inviteForm.reset();
      window.history.replaceState({}, document.title, window.location.pathname);
      var sessionResult = await client.auth.getSession();
      if (!sessionResult.data.session) {
        throw new Error("The invite session is unavailable.");
      }
      await routeSession(sessionResult.data.session);
    } catch (error) {
      elements.inviteError.textContent = "Das Passwort konnte nicht gespeichert werden. Bitte öffnen Sie einen neuen Einladungslink oder wenden Sie sich an die Verwaltung.";
      elements.inviteError.hidden = false;
    } finally {
      elements.inviteButton.disabled = false;
      elements.inviteButton.setAttribute("data-loading", "false");
    }
  }

  function togglePasswordVisibility() {
    var showPassword = elements.loginPassword.type === "password";
    elements.loginPassword.type = showPassword ? "text" : "password";
    elements.passwordToggle.setAttribute("aria-pressed", String(showPassword));
    elements.passwordToggle.setAttribute("aria-label", showPassword ? "Passwort ausblenden" : "Passwort anzeigen");
  }

  function showView(viewName) {
    elements.loadingView.hidden = viewName !== "loading";
    elements.loginView.hidden = viewName !== "login";
    elements.inviteView.hidden = viewName !== "invite";
    elements.staffView.hidden = viewName !== "staff";
    elements.appView.hidden = viewName !== "app";
  }

  function setLoginPending(pending) {
    elements.loginButton.disabled = pending;
    elements.loginButton.setAttribute("data-loading", String(pending));
    elements.loginEmail.disabled = pending;
    elements.loginPassword.disabled = pending;
  }

  function showLoginError(message) {
    elements.loginError.textContent = message;
    elements.loginError.hidden = false;
  }

  function hideLoginError() {
    elements.loginError.hidden = true;
    elements.loginError.textContent = "";
  }

  async function refreshEmployeeDay(options) {
    var settings = options || {};
    if (!settings.silent) {
      hideGlobalAlert();
    }

    try {
      var timeStateResult = await client.rpc("get_my_time_state");
      if (timeStateResult.error) {
        throw timeStateResult.error;
      }

      activeTimeState = Array.isArray(timeStateResult.data) && timeStateResult.data.length
        ? timeStateResult.data[0]
        : null;

      if (activeTimeState && activeTimeState.server_now) {
        serverClockOffsetMs = Date.parse(activeTimeState.server_now) - Date.now();
      }

      var nowMs = getServerNowMs();
      currentBerlinDate = getBerlinDateKey(nowMs);
      var lowerBound = new Date(nowMs - SHIFT_LOOKAROUND_MS).toISOString();
      var upperBound = new Date(nowMs + SHIFT_LOOKAROUND_MS).toISOString();

      var employeeRequest = client
        .from("employees")
        .select("id,employee_number,phone,employment_start_date,employment_end_date")
        .eq("id", activeProfile.id)
        .maybeSingle();
      var assignmentRequest = client
        .from("employee_work_sites")
        .select("work_site_id,is_primary,valid_from,valid_until")
        .eq("employee_id", activeProfile.id);
      var shiftRequest = client
        .from("work_shifts")
        .select("id,work_site_id,scheduled_start,scheduled_end,status,notes")
        .eq("employee_id", activeProfile.id)
        .eq("status", "scheduled")
        .gte("scheduled_start", lowerBound)
        .lte("scheduled_start", upperBound)
        .order("scheduled_start", { ascending: true });
      var absenceRequest = client
        .from("employee_absences")
        .select("absence_type,start_date,end_date,approval_status")
        .eq("employee_id", activeProfile.id)
        .eq("approval_status", "approved")
        .lte("start_date", currentBerlinDate)
        .gte("end_date", currentBerlinDate)
        .limit(1);
      var latestEntryRequest = client
        .from("time_entries")
        .select("id,note,work_date,started_at,status")
        .eq("employee_id", activeProfile.id)
        .eq("work_date", currentBerlinDate)
        .order("started_at", { ascending: false })
        .limit(1);
      var summaryRequest = client.rpc("get_time_summary", {
        p_employee_id: activeProfile.id,
        p_from: currentBerlinDate,
        p_to: currentBerlinDate,
        p_bucket: "day",
        p_work_site_id: null
      });

      var results = await Promise.all([
        employeeRequest,
        assignmentRequest,
        shiftRequest,
        absenceRequest,
        latestEntryRequest,
        summaryRequest
      ]);

      var firstError = results.find(function (result) { return result.error; });
      if (firstError) {
        throw firstError.error;
      }
      if (!results[0].data) {
        throw new Error("Employee record is not available.");
      }

      activeEmployee = results[0].data;
      activeAbsence = results[3].data && results[3].data.length ? results[3].data[0] : null;
      latestEntry = results[4].data && results[4].data.length ? results[4].data[0] : null;
      todayShifts = (results[2].data || []).filter(function (shift) {
        return getBerlinDateKey(Date.parse(shift.scheduled_start)) === currentBerlinDate;
      });

      var currentAssignments = (results[1].data || []).filter(function (assignment) {
        return (!assignment.valid_from || assignment.valid_from <= currentBerlinDate)
          && (!assignment.valid_until || assignment.valid_until >= currentBerlinDate);
      });
      var workSiteIds = uniqueValues(
        currentAssignments.map(function (assignment) { return assignment.work_site_id; })
          .concat(todayShifts.map(function (shift) { return shift.work_site_id; }))
          .concat(activeTimeState ? [activeTimeState.work_site_id] : [])
      );

      var sites = [];
      if (workSiteIds.length) {
        var sitesResult = await client
          .from("work_sites")
          .select("id,code,name,address,active")
          .in("id", workSiteIds);
        if (sitesResult.error) {
          throw sitesResult.error;
        }
        sites = sitesResult.data || [];
      }

      availableSites = buildAvailableSites(sites, currentAssignments);
      chooseWorkSite();

      dailyBaseSeconds = (results[5].data || []).reduce(function (total, row) {
        return total + toSafeSeconds(row.worked_seconds);
      }, 0);
      dailyBaseServerMs = getServerNowMs();
      savedNote = latestEntry ? String(latestEntry.note || "") : "";

      renderEmployeeDay();
    } catch (error) {
      if (isAuthorizationError(error)) {
        await client.auth.signOut();
        resetEmployeeState();
        showView("login");
        showLoginError("Dieses Mitarbeiterkonto ist nicht aktiv.");
        return;
      }
      showGlobalAlert("Die aktuellen Arbeitsdaten konnten nicht geladen werden. Bitte prüfen Sie Ihre Verbindung und laden Sie die Seite erneut.");
    }
  }

  function buildAvailableSites(sites, assignments) {
    var assignmentBySite = Object.create(null);
    assignments.forEach(function (assignment) {
      assignmentBySite[assignment.work_site_id] = assignment;
    });

    return sites
      .filter(function (site) {
        return site.active || (activeTimeState && activeTimeState.work_site_id === site.id);
      })
      .map(function (site) {
        var assignment = assignmentBySite[site.id];
        return {
          id: site.id,
          code: site.code,
          name: site.name,
          address: site.address,
          active: site.active,
          isPrimary: Boolean(assignment && assignment.is_primary)
        };
      })
      .sort(function (left, right) {
        if (left.isPrimary !== right.isPrimary) {
          return left.isPrimary ? -1 : 1;
        }
        return left.name.localeCompare(right.name, "de");
      });
  }

  function chooseWorkSite() {
    var validSelectedSite = availableSites.some(function (site) { return site.id === selectedWorkSiteId; });
    if (activeTimeState) {
      selectedWorkSiteId = activeTimeState.work_site_id;
      return;
    }
    if (validSelectedSite) {
      return;
    }

    var firstShift = todayShifts[0];
    var primarySite = availableSites.find(function (site) { return site.isPrimary; });
    selectedWorkSiteId = firstShift
      ? firstShift.work_site_id
      : primarySite
        ? primarySite.id
        : availableSites.length
          ? availableSites[0].id
          : null;
  }

  function renderEmployeeDay() {
    var displayName = activeProfile.display_name || activeProfile.email || "Mitarbeiter";
    var greetingName = firstName(displayName);
    elements.accountName.textContent = displayName;
    elements.greetingHeading.textContent = getGreeting() + (greetingName ? ", " + greetingName : "");
    elements.todayLabel.textContent = formatBerlinDate(getServerNowMs(), { weekday: "long", day: "2-digit", month: "long" }).toUpperCase();
    elements.scheduleDate.textContent = formatBerlinDate(getServerNowMs(), { day: "2-digit", month: "2-digit", year: "numeric" });
    elements.employeeNumber.textContent = activeEmployee.employee_number || "–";
    renderState();
    renderWorkContext();
    renderSchedule();
    renderNote();
    renderActionAvailability();
    renderWorkedTime();
  }

  function renderState() {
    var status = activeTimeState ? activeTimeState.entry_status : "idle";
    var label = status === "working"
      ? "Arbeitszeit läuft"
      : status === "paused"
        ? "Pause"
        : "Nicht gestartet";
    elements.statePill.setAttribute("data-state", status);
    elements.stateLabel.textContent = label;
    elements.timerHint.textContent = status === "working"
      ? "Arbeitszeit wird erfasst"
      : status === "paused"
        ? "Die Arbeitszeit ist angehalten"
        : dailyBaseSeconds > 0
          ? "Ihr letzter Arbeitseinsatz ist beendet"
          : "Bereit für Ihren Arbeitsbeginn";
  }

  function renderWorkContext() {
    var site = availableSites.find(function (candidate) { return candidate.id === selectedWorkSiteId; });
    var shift = getSelectedShift();

    elements.clockHeading.textContent = site ? site.name : "Kein Einsatzort";
    elements.siteAddress.textContent = site
      ? [site.code, site.address].filter(Boolean).join(" · ") || "SauberPlus Objekt"
      : "Für heute ist kein Objekt zugewiesen.";
    elements.shiftTime.textContent = shift ? formatTimeRange(shift.scheduled_start, shift.scheduled_end) : "Kein Dienst geplant";

    elements.siteSelect.replaceChildren();
    availableSites.forEach(function (candidate) {
      var option = document.createElement("option");
      option.value = candidate.id;
      option.textContent = candidate.name + (candidate.code ? " · " + candidate.code : "");
      option.selected = candidate.id === selectedWorkSiteId;
      elements.siteSelect.appendChild(option);
    });
    elements.siteSelect.disabled = Boolean(activeTimeState) || actionPending;
    elements.siteSelectWrap.hidden = availableSites.length < 2;
  }

  function renderSchedule() {
    elements.scheduleList.replaceChildren();
    elements.scheduleEmpty.hidden = todayShifts.length > 0 || Boolean(activeAbsence);

    if (activeAbsence) {
      var absence = document.createElement("div");
      absence.className = "employee-absence-note";
      absence.textContent = activeAbsence.absence_type === "sick"
        ? "Heute als krank gemeldet."
        : "Heute ist Urlaub eingetragen.";
      elements.scheduleList.appendChild(absence);
    }

    todayShifts.forEach(function (shift) {
      var site = availableSites.find(function (candidate) { return candidate.id === shift.work_site_id; });
      var item = document.createElement("article");
      item.className = "employee-schedule-item";
      var copy = document.createElement("div");
      var heading = document.createElement("h3");
      var note = document.createElement("p");
      var time = document.createElement("time");
      heading.textContent = site ? site.name : "Einsatzort";
      note.textContent = shift.notes || (site && site.address) || "Geplanter Dienst";
      time.textContent = formatTimeRange(shift.scheduled_start, shift.scheduled_end);
      copy.appendChild(heading);
      copy.appendChild(note);
      item.appendChild(copy);
      item.appendChild(time);
      elements.scheduleList.appendChild(item);
    });
  }

  function renderNote() {
    elements.workNote.value = savedNote;
    elements.workNote.disabled = !latestEntry;
    elements.workNote.placeholder = latestEntry
      ? "Optional: Übergabe, Besonderheiten oder Hinweise …"
      : "Nach dem Start können Sie hier eine Tagesnotiz ergänzen.";
    elements.noteStatus.textContent = latestEntry ? "In der Zeiterfassung gespeichert" : "Noch kein Eintrag";
    renderNoteControls();
  }

  function renderNoteControls() {
    var value = elements.workNote.value || "";
    elements.noteCounter.textContent = value.length + " / " + MAX_NOTE_LENGTH;
    elements.saveNoteButton.disabled = !latestEntry || notePending || value === savedNote || value.length > MAX_NOTE_LENGTH;
  }

  function renderActionAvailability() {
    var status = activeTimeState ? activeTimeState.entry_status : "idle";
    var canStart = status === "idle" && Boolean(selectedWorkSiteId) && !activeAbsence;
    var allowed = {
      start: canStart,
      pause: status === "working",
      resume: status === "paused",
      end: status === "working" || status === "paused"
    };

    elements.clockActions.querySelectorAll("[data-action]").forEach(function (button) {
      button.disabled = actionPending || !allowed[button.getAttribute("data-action")];
    });
    elements.clockActions.setAttribute("data-pending", String(actionPending));
    elements.siteSelect.disabled = Boolean(activeTimeState) || actionPending;

    if (!activeTimeState && activeAbsence) {
      setActionFeedback(
        activeAbsence.absence_type === "sick"
          ? "Die Zeiterfassung ist während der Krankmeldung nicht verfügbar."
          : "Die Zeiterfassung ist während des Urlaubs nicht verfügbar.",
        ""
      );
    } else if (!activeTimeState && !selectedWorkSiteId) {
      setActionFeedback("Kein aktiver Einsatzort für heute verfügbar.", "");
    } else if (!actionPending && !elements.actionFeedback.hasAttribute("data-tone")) {
      setActionFeedback("", "");
    }
  }

  async function recordTimeAction(action) {
    if (actionPending) {
      return;
    }

    var requestId;
    try {
      requestId = pendingRequestIds[action] || createRequestId();
    } catch (error) {
      setActionFeedback("Dieser Browser unterstützt keine sichere Zeiterfassung.", "error");
      return;
    }

    pendingRequestIds[action] = requestId;
    actionPending = true;
    renderActionAvailability();
    setActionFeedback(actionProgressLabel(action), "");

    var selectedShift = action === "start" ? getSelectedShift() : null;
    var rpcResult;
    try {
      rpcResult = await client.rpc("record_time_event", {
        p_action: action,
        p_request_id: requestId,
        p_work_site_id: action === "start" ? selectedWorkSiteId : null,
        p_shift_id: selectedShift ? selectedShift.id : null,
        p_note: String(elements.workNote.value || "").trim() || null
      });

      if (rpcResult.error) {
        throw rpcResult.error;
      }

      delete pendingRequestIds[action];
      var actionRow = Array.isArray(rpcResult.data) ? rpcResult.data[0] : rpcResult.data;
      if (actionRow && actionRow.server_now) {
        serverClockOffsetMs = Date.parse(actionRow.server_now) - Date.now();
      }
      setActionFeedback(actionSuccessLabel(action), "success");
      await refreshEmployeeDay({ silent: true });
    } catch (error) {
      if (!isNetworkError(error)) {
        delete pendingRequestIds[action];
      }
      setActionFeedback(formatTimeActionError(error), "error");
    } finally {
      actionPending = false;
      renderActionAvailability();
    }
  }

  async function saveNote() {
    if (!latestEntry || notePending) {
      return;
    }

    var note = String(elements.workNote.value || "").trim();
    notePending = true;
    elements.noteStatus.textContent = "Wird gespeichert …";
    renderNoteControls();
    try {
      var result = await client.rpc("update_own_time_entry_note", {
        p_time_entry_id: latestEntry.id,
        p_note: note
      });
      if (result.error) {
        throw result.error;
      }
      savedNote = note;
      elements.workNote.value = note;
      elements.noteStatus.textContent = "Gespeichert";
    } catch (error) {
      elements.noteStatus.textContent = "Speichern fehlgeschlagen";
      showGlobalAlert("Die Tagesnotiz konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.");
    } finally {
      notePending = false;
      renderNoteControls();
    }
  }

  function startClock() {
    window.clearInterval(clockTimer);
    clockTimer = window.setInterval(renderWorkedTime, CLOCK_INTERVAL_MS);
    renderWorkedTime();
  }

  function scheduleBackgroundRefresh() {
    window.clearInterval(refreshTimer);
    refreshTimer = window.setInterval(function () {
      if (!actionPending && document.visibilityState === "visible") {
        refreshEmployeeDay({ silent: true });
      }
    }, 5 * 60 * 1000);
  }

  function renderWorkedTime() {
    var seconds = dailyBaseSeconds;
    if (
      activeTimeState
      && activeTimeState.entry_status === "working"
      && activeTimeState.work_date === currentBerlinDate
      && dailyBaseServerMs
    ) {
      seconds += Math.max(0, Math.floor((getServerNowMs() - dailyBaseServerMs) / 1000));
    }
    elements.workedTime.textContent = formatDuration(seconds);
  }

  function stopTimers() {
    window.clearInterval(clockTimer);
    window.clearInterval(refreshTimer);
    clockTimer = null;
    refreshTimer = null;
  }

  function resetEmployeeState() {
    stopTimers();
    activeProfile = null;
    activeEmployee = null;
    activeTimeState = null;
    activeAbsence = null;
    todayShifts = [];
    availableSites = [];
    selectedWorkSiteId = null;
    latestEntry = null;
    savedNote = "";
    dailyBaseSeconds = 0;
    dailyBaseServerMs = 0;
    serverClockOffsetMs = 0;
    currentBerlinDate = "";
    pendingRequestIds = Object.create(null);
    actionPending = false;
    notePending = false;
  }

  function getSelectedShift() {
    if (activeTimeState && activeTimeState.shift_id) {
      return todayShifts.find(function (shift) { return shift.id === activeTimeState.shift_id; }) || null;
    }
    return todayShifts.find(function (shift) { return shift.work_site_id === selectedWorkSiteId; }) || null;
  }

  function createRequestId() {
    if (!window.crypto || typeof window.crypto.randomUUID !== "function") {
      throw new Error("crypto.randomUUID is unavailable.");
    }
    return window.crypto.randomUUID();
  }

  function getServerNowMs() {
    return Date.now() + serverClockOffsetMs;
  }

  function getBerlinDateKey(timestamp) {
    var parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: BERLIN_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date(timestamp));
    var values = Object.create(null);
    parts.forEach(function (part) { values[part.type] = part.value; });
    return values.year + "-" + values.month + "-" + values.day;
  }

  function getGreeting() {
    var hourParts = new Intl.DateTimeFormat("de-DE", {
      timeZone: BERLIN_TIME_ZONE,
      hour: "2-digit",
      hourCycle: "h23"
    }).formatToParts(new Date(getServerNowMs()));
    var hourPart = hourParts.find(function (part) { return part.type === "hour"; });
    var hour = hourPart ? Number(hourPart.value) : 12;
    if (hour < 11) {
      return "Guten Morgen";
    }
    if (hour < 18) {
      return "Guten Tag";
    }
    return "Guten Abend";
  }

  function firstName(displayName) {
    var name = String(displayName || "").trim();
    if (name.indexOf("@") !== -1) {
      return "Mitarbeiter";
    }
    return name.split(/\s+/)[0] || "";
  }

  function formatBerlinDate(timestamp, options) {
    var formatOptions = Object.assign({ timeZone: BERLIN_TIME_ZONE }, options || {});
    return new Intl.DateTimeFormat("de-DE", formatOptions).format(new Date(timestamp));
  }

  function formatTimeRange(start, end) {
    var options = { timeZone: BERLIN_TIME_ZONE, hour: "2-digit", minute: "2-digit" };
    return new Intl.DateTimeFormat("de-DE", options).format(new Date(start))
      + " – "
      + new Intl.DateTimeFormat("de-DE", options).format(new Date(end));
  }

  function formatDuration(value) {
    var seconds = Math.max(0, toSafeSeconds(value));
    var hours = Math.floor(seconds / 3600);
    var minutes = Math.floor((seconds % 3600) / 60);
    var remainingSeconds = seconds % 60;
    return padNumber(hours) + ":" + padNumber(minutes) + ":" + padNumber(remainingSeconds);
  }

  function padNumber(value) {
    return String(value).padStart(2, "0");
  }

  function toSafeSeconds(value) {
    var number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
  }

  function uniqueValues(values) {
    return Array.from(new Set(values.filter(Boolean)));
  }

  function readAuthFlowType() {
    var searchType = new URLSearchParams(window.location.search).get("type");
    var hashType = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("type");
    return searchType || hashType || "";
  }

  function setActionFeedback(message, tone) {
    elements.actionFeedback.textContent = message;
    if (tone) {
      elements.actionFeedback.setAttribute("data-tone", tone);
    } else {
      elements.actionFeedback.removeAttribute("data-tone");
    }
  }

  function showGlobalAlert(message) {
    elements.globalAlert.textContent = message;
    elements.globalAlert.hidden = false;
  }

  function hideGlobalAlert() {
    elements.globalAlert.hidden = true;
    elements.globalAlert.textContent = "";
  }

  function actionProgressLabel(action) {
    return {
      start: "Arbeitsbeginn wird gespeichert …",
      pause: "Pause wird gespeichert …",
      resume: "Arbeitszeit wird fortgesetzt …",
      end: "Arbeitsende wird gespeichert …"
    }[action] || "Änderung wird gespeichert …";
  }

  function actionSuccessLabel(action) {
    return {
      start: "Arbeitszeit gestartet.",
      pause: "Pause gestartet.",
      resume: "Arbeitszeit fortgesetzt.",
      end: "Arbeitszeit beendet."
    }[action] || "Gespeichert.";
  }

  function formatTimeActionError(error) {
    var message = String((error && error.message) || "").toLowerCase();
    if (isNetworkError(error)) {
      return "Keine Verbindung. Tippen Sie erneut, sobald Sie online sind – die Aktion wird nicht doppelt gespeichert.";
    }
    if (message.indexOf("already paused") !== -1) {
      return "Die Arbeitszeit ist bereits pausiert.";
    }
    if (message.indexOf("not paused") !== -1) {
      return "Es gibt keine aktive Pause zum Fortsetzen.";
    }
    if (message.indexOf("no active work session") !== -1) {
      return "Es ist keine laufende Arbeitszeit vorhanden.";
    }
    if (message.indexOf("active work session already") !== -1) {
      return "Eine Arbeitszeit läuft bereits. Die Anzeige wird aktualisiert.";
    }
    if (message.indexOf("approved absence") !== -1) {
      return "Für heute ist Urlaub oder Krankheit eingetragen. Die Zeiterfassung kann nicht gestartet werden.";
    }
    if (message.indexOf("assigned") !== -1 || message.indexOf("work site") !== -1) {
      return "Der gewählte Einsatzort ist für heute nicht freigegeben.";
    }
    if (isAuthorizationError(error)) {
      return "Ihr Konto ist für diese Aktion nicht freigeschaltet.";
    }
    return "Die Aktion konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.";
  }

  function isNetworkError(error) {
    var message = String((error && error.message) || "").toLowerCase();
    return (error && error.status === 0)
      || message.indexOf("failed to fetch") !== -1
      || message.indexOf("network") !== -1
      || message.indexOf("fetcherror") !== -1;
  }

  function isAuthorizationError(error) {
    var code = String((error && error.code) || "");
    var message = String((error && error.message) || "").toLowerCase();
    return code === "42501"
      || message.indexOf("not active") !== -1
      || message.indexOf("not permitted") !== -1
      || message.indexOf("permission denied") !== -1;
  }
})();
