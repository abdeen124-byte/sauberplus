(function () {
  "use strict";

  var BERLIN_TIME_ZONE = "Europe/Berlin";
  var LANGUAGE_STORAGE_KEY = "sp_employee_lang";
  var MAX_NOTE_LENGTH = 1000;
  var MAX_SHIFT_MINUTES = 16 * 60;

  var translations = {
    de: {
      "common.loading": "Arbeitsbereich wird geladen …",
      "login.kicker": "Mitarbeiter-Zugang",
      "login.title": "Arbeitszeiten einfach und sicher erfassen.",
      "login.copy": "Melden Sie sich mit Ihrem persönlichen SauberPlus Konto an.",
      "login.portal": "Zeiterfassung",
      "login.signIn": "Anmelden",
      "login.email": "E-Mail-Adresse",
      "login.password": "Passwort",
      "login.foot": "Nur für aktive SauberPlus Mitarbeiter.",
      "invite.kicker": "Mitarbeiter-Zugang",
      "invite.title": "Willkommen bei SauberPlus.",
      "invite.copy": "Legen Sie zuerst Ihr persönliches Passwort fest.",
      "invite.invitation": "Einladung",
      "invite.setPassword": "Passwort festlegen",
      "invite.newPassword": "Neues Passwort",
      "invite.confirmPassword": "Passwort bestätigen",
      "invite.savePassword": "Passwort speichern",
      "gate.kicker": "Mitarbeiter-Zugang",
      "gate.title": "Dieses Konto gehört zur Verwaltung.",
      "gate.copy": "Öffnen Sie die SauberPlus-Verwaltung, um fortzufahren.",
      "gate.admin": "Zur Verwaltung",
      "gate.otherAccount": "Anderes Konto verwenden",
      "app.area": "MITARBEITERBEREICH",
      "app.overview": "Übersicht",
      "app.greeting": "Guten Tag",
      "app.install": "App installieren",
      "today.kicker": "HEUTE",
      "today.loading": "Schicht wird geladen",
      "today.hours": "heute erfasst",
      "today.noShift": "Keine Schicht geplant",
      "today.noShiftDetail": "Für heute ist kein Einsatzort hinterlegt.",
      "today.activeDetail": "Aktive Zeiterfassung an diesem Einsatzort.",
      "today.shiftDetail": "Geplante Arbeitszeit",
      "summary.kicker": "MEINE ZEITERFASSUNG",
      "summary.title": "Arbeitszeiten klar erfassen.",
      "summary.copy": "Wählen Sie Ihren Einsatzort, tragen Sie Ihre Schicht ein und reichen Sie sie direkt ein.",
      "summary.action": "Stunden eintragen",
      "form.title": "Neue Arbeitszeit erfassen",
      "form.copy": "Tragen Sie Ihre Zeiten am Ende jeder Schicht vollständig ein.",
      "form.date": "Datum",
      "form.site": "Einsatzort",
      "form.sitePlaceholder": "Objekt auswählen",
      "form.start": "Beginn",
      "form.end": "Ende",
      "form.break": "Pause in Minuten",
      "form.estimated": "Voraussichtliche Arbeitszeit:",
      "form.completeTimes": "Zeitangaben ergänzen",
      "form.overnight": "Nachtschichten werden unterstützt.",
      "form.note": "Bemerkung",
      "form.optional": "(optional)",
      "form.notePlaceholder": "z. B. Vertretung, Sonderreinigung oder Zugangshinweis",
      "form.signature": "Unterschrift des Mitarbeiters",
      "form.signatureHint": "Unterschreiben Sie mit dem Finger oder der Maus im Feld.",
      "form.clear": "Löschen",
      "form.signHere": "Hier unterschreiben",
      "form.confirm": "Ich bestätige, dass die Angaben vollständig und richtig sind und dass die Unterschrift von mir stammt.",
      "form.submit": "Unterschreiben & einreichen",
      "stats.month": "DIESER MONAT",
      "stats.monthHelp": "erfasste Arbeitszeit",
      "stats.active": "IN BEARBEITUNG",
      "stats.activeHelp": "laufende oder pausierte Einträge",
      "stats.completed": "ABGESCHLOSSEN",
      "stats.completedHelp": "Einträge in diesem Monat",
      "recent.title": "Letzte Einträge",
      "recent.copy": "Ihre zuletzt erfassten Arbeitszeiten.",
      "recent.empty": "Noch kein Eintrag vorhanden. Beginnen Sie mit Ihrer ersten Schicht.",
      "contact.title": "Wichtig für Ihre Schicht",
      "contact.copy": "Erfassen Sie Beginn, Ende und Pause vollständig. Prüfen Sie Ihre Angaben vor dem Einreichen.",
      "contact.questions": "Bei Fragen:",
      "status.completed": "Abgeschlossen",
      "status.working": "Läuft",
      "status.paused": "Pausiert",
      "status.scheduled": "Geplant",
      "status.none": "Keine aktive Zeit",
      "error.loginFields": "Bitte geben Sie eine gültige E-Mail-Adresse und Ihr Passwort ein.",
      "error.locked": "Zu viele Anmeldeversuche. Bitte warten Sie kurz und versuchen Sie es erneut.",
      "error.credentials": "E-Mail-Adresse oder Passwort ist nicht korrekt.",
      "error.loginUnavailable": "Die Anmeldung ist momentan nicht möglich. Prüfen Sie Ihre Verbindung und versuchen Sie es erneut.",
      "error.inactive": "Dieses Konto ist nicht aktiv. Bitte wenden Sie sich an die Verwaltung.",
      "error.notEmployee": "Dieses Konto ist nicht für die Zeiterfassung freigeschaltet.",
      "error.load": "Die Arbeitsdaten konnten nicht geladen werden. Bitte prüfen Sie Ihre Verbindung und laden Sie die Seite erneut.",
      "error.required": "Bitte füllen Sie alle Pflichtfelder vollständig aus.",
      "error.site": "Für dieses Datum ist kein freigegebener Einsatzort ausgewählt.",
      "error.duration": "Beginn, Ende oder Pause ergeben keine gültige Arbeitszeit von höchstens 16 Stunden.",
      "error.signature": "Bitte unterschreiben Sie den Stundennachweis.",
      "error.confirm": "Bitte bestätigen Sie die Richtigkeit Ihrer Angaben.",
      "error.submit": "Der Eintrag konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.",
      "error.overlap": "Diese Arbeitszeit überschneidet sich mit einem vorhandenen Eintrag.",
      "error.assignment": "Der gewählte Einsatzort ist für dieses Datum nicht freigegeben.",
      "error.future": "Arbeitszeiten können nicht für ein zukünftiges Datum eingereicht werden.",
      "error.activeSession": "Es besteht noch ein laufender oder pausierter Eintrag. Bitte wenden Sie sich vor einer neuen Einreichung an die Verwaltung.",
      "success.saved": "Arbeitszeit gespeichert. Stunden, Status und letzte Einträge wurden aktualisiert.",
      "invite.short": "Das Passwort muss mindestens 8 Zeichen lang sein.",
      "invite.mismatch": "Die Passwörter stimmen nicht überein.",
      "invite.failed": "Das Passwort konnte nicht gespeichert werden. Bitte öffnen Sie einen neuen Einladungslink oder wenden Sie sich an die Verwaltung.",
      "password.show": "Passwort anzeigen",
      "password.hide": "Passwort ausblenden",
      "logout": "Abmelden"
    },
    en: {
      "common.loading": "Loading employee portal …",
      "login.kicker": "EMPLOYEE ACCESS", "login.title": "Record working hours simply and securely.", "login.copy": "Sign in with your personal SauberPlus account.", "login.portal": "Time tracking", "login.signIn": "Sign in", "login.email": "Email address", "login.password": "Password", "login.foot": "For active SauberPlus employees only.",
      "invite.kicker": "EMPLOYEE ACCESS", "invite.title": "Welcome to SauberPlus.", "invite.copy": "First set your personal password.", "invite.invitation": "Invitation", "invite.setPassword": "Set password", "invite.newPassword": "New password", "invite.confirmPassword": "Confirm password", "invite.savePassword": "Save password",
      "gate.kicker": "EMPLOYEE ACCESS", "gate.title": "This account belongs to administration.", "gate.copy": "Open SauberPlus administration to continue.", "gate.admin": "Open administration", "gate.otherAccount": "Use another account",
      "app.area": "EMPLOYEE PORTAL", "app.overview": "Overview",
      "app.greeting": "Good day",
      "app.install": "Install app",
      "today.kicker": "TODAY", "today.loading": "Loading shift", "today.hours": "recorded today", "today.noShift": "No shift planned", "today.noShiftDetail": "No work site is scheduled for today.", "today.activeDetail": "Active time tracking at this work site.", "today.shiftDetail": "Scheduled working time",
      "summary.kicker": "MY TIME TRACKING", "summary.title": "Record working hours clearly.", "summary.copy": "Choose your work site, enter your shift and submit it directly.", "summary.action": "Enter hours",
      "form.title": "Record new working time", "form.copy": "Complete your times at the end of each shift.", "form.date": "Date", "form.site": "Work site", "form.sitePlaceholder": "Choose a site", "form.start": "Start", "form.end": "End", "form.break": "Break in minutes", "form.estimated": "Estimated working time:", "form.completeTimes": "Complete the time fields", "form.overnight": "Overnight shifts are supported.", "form.note": "Note", "form.optional": "(optional)", "form.notePlaceholder": "e.g. cover shift, special cleaning or access note", "form.signature": "Employee signature", "form.signatureHint": "Sign in the field with your finger or mouse.", "form.clear": "Clear", "form.signHere": "Sign here", "form.confirm": "I confirm that the information is complete and correct and that this is my signature.", "form.submit": "Sign & submit",
      "stats.month": "THIS MONTH", "stats.monthHelp": "recorded working time", "stats.active": "IN PROGRESS", "stats.activeHelp": "running or paused entries", "stats.completed": "COMPLETED", "stats.completedHelp": "entries this month",
      "recent.title": "Latest entries", "recent.copy": "Your most recently recorded working hours.", "recent.empty": "No entry yet. Start with your first shift.",
      "contact.title": "Important for your shift", "contact.copy": "Record the start, end and break in full. Check your details before submitting.", "contact.questions": "Questions:",
      "status.completed": "Completed", "status.working": "Running", "status.paused": "Paused",
      "status.scheduled": "Scheduled", "status.none": "No active time",
      "error.loginFields": "Enter a valid email address and password.", "error.locked": "Too many sign-in attempts. Please wait and try again.", "error.credentials": "The email address or password is incorrect.", "error.loginUnavailable": "Sign-in is currently unavailable. Check your connection and try again.", "error.inactive": "This account is not active. Contact administration.", "error.notEmployee": "This account is not enabled for time tracking.", "error.load": "Working-time data could not be loaded. Check your connection and reload the page.", "error.required": "Complete all required fields.", "error.site": "No approved work site is selected for this date.", "error.duration": "Start, end or break do not result in a valid shift of no more than 16 hours.", "error.signature": "Please sign the timesheet.", "error.confirm": "Please confirm that your details are correct.", "error.submit": "The entry could not be saved. Please try again.", "error.overlap": "This shift overlaps an existing entry.", "error.assignment": "The selected work site is not approved for this date.", "error.future": "Working time cannot be submitted for a future date.", "error.activeSession": "A running or paused entry already exists. Contact administration before submitting another entry.",
      "success.saved": "Working time saved. Hours, status and latest entries have been updated.", "invite.short": "The password must contain at least 8 characters.", "invite.mismatch": "The passwords do not match.", "invite.failed": "The password could not be saved. Open a new invitation link or contact administration.", "password.show": "Show password", "password.hide": "Hide password", "logout": "Sign out"
    },
    ar: {
      "common.loading": "جارٍ تحميل بوابة الموظف…",
      "login.kicker": "دخول الموظفين", "login.title": "سجّل ساعات العمل بسهولة وأمان.", "login.copy": "سجّل الدخول باستخدام حساب SauberPlus الشخصي.", "login.portal": "تسجيل الساعات", "login.signIn": "تسجيل الدخول", "login.email": "البريد الإلكتروني", "login.password": "كلمة المرور", "login.foot": "للموظفين النشطين في SauberPlus فقط.",
      "invite.kicker": "دخول الموظفين", "invite.title": "مرحبًا بك في SauberPlus.", "invite.copy": "عيّن كلمة مرورك الشخصية أولًا.", "invite.invitation": "الدعوة", "invite.setPassword": "تعيين كلمة المرور", "invite.newPassword": "كلمة المرور الجديدة", "invite.confirmPassword": "تأكيد كلمة المرور", "invite.savePassword": "حفظ كلمة المرور",
      "gate.kicker": "دخول الموظفين", "gate.title": "هذا الحساب تابع للإدارة.", "gate.copy": "افتح لوحة إدارة SauberPlus للمتابعة.", "gate.admin": "فتح لوحة الإدارة", "gate.otherAccount": "استخدام حساب آخر",
      "app.area": "منطقة الموظفين", "app.overview": "ملخص",
      "app.greeting": "مرحبًا",
      "app.install": "تثبيت التطبيق",
      "today.kicker": "اليوم", "today.loading": "جارٍ تحميل الوردية", "today.hours": "مسجّل اليوم", "today.noShift": "لا توجد وردية مجدولة", "today.noShiftDetail": "لا يوجد موقع عمل مجدول لليوم.", "today.activeDetail": "تسجيل الوقت نشط في موقع العمل هذا.", "today.shiftDetail": "وقت العمل المجدول",
      "summary.kicker": "تسجيل ساعاتي", "summary.title": "سجّل ساعات العمل بوضوح.", "summary.copy": "اختر موقع العمل، أدخل فترة عملك ثم أرسلها مباشرة.", "summary.action": "تسجيل الساعات",
      "form.title": "تسجيل ساعات عمل جديدة", "form.copy": "أدخل الأوقات كاملة بعد نهاية كل فترة عمل.", "form.date": "التاريخ", "form.site": "موقع العمل", "form.sitePlaceholder": "اختر الموقع", "form.start": "البداية", "form.end": "النهاية", "form.break": "الاستراحة بالدقائق", "form.estimated": "ساعات العمل المتوقعة:", "form.completeTimes": "أكمل حقول الوقت", "form.overnight": "فترات العمل الليلية مدعومة.", "form.note": "الملاحظة", "form.optional": "(اختياري)", "form.notePlaceholder": "مثال: مناوبة بديلة أو تنظيف خاص أو ملاحظة دخول", "form.signature": "توقيع الموظف", "form.signatureHint": "وقّع داخل الحقل بالإصبع أو الماوس.", "form.clear": "مسح", "form.signHere": "وقّع هنا", "form.confirm": "أؤكد أن البيانات المدخلة كاملة وصحيحة وأن هذا التوقيع يعود إليّ.", "form.submit": "التوقيع والإرسال",
      "stats.month": "هذا الشهر", "stats.monthHelp": "ساعات العمل المسجلة", "stats.active": "قيد التنفيذ", "stats.activeHelp": "إدخالات جارية أو متوقفة", "stats.completed": "مكتملة", "stats.completedHelp": "إدخالات هذا الشهر",
      "recent.title": "أحدث المشاركات", "recent.copy": "أحدث ساعات العمل التي سجلتها.", "recent.empty": "لا توجد مشاركات بعد. ابدأ بأول فترة عمل.",
      "contact.title": "مهم لفترة عملك", "contact.copy": "سجّل البداية والنهاية والاستراحة بالكامل، وراجع بياناتك قبل الإرسال.", "contact.questions": "للاستفسار:",
      "status.completed": "مكتمل", "status.working": "جارٍ", "status.paused": "متوقف",
      "status.scheduled": "مجدولة", "status.none": "لا يوجد وقت نشط",
      "error.loginFields": "أدخل بريدًا إلكترونيًا صالحًا وكلمة المرور.", "error.locked": "محاولات دخول كثيرة. انتظر قليلًا ثم حاول مجددًا.", "error.credentials": "البريد الإلكتروني أو كلمة المرور غير صحيحة.", "error.loginUnavailable": "تسجيل الدخول غير متاح حاليًا. تحقق من الاتصال وحاول مجددًا.", "error.inactive": "هذا الحساب غير نشط. تواصل مع الإدارة.", "error.notEmployee": "هذا الحساب غير مخصص لتسجيل الساعات.", "error.load": "تعذر تحميل بيانات العمل. تحقق من الاتصال وأعد تحميل الصفحة.", "error.required": "أكمل جميع الحقول المطلوبة.", "error.site": "لم يتم اختيار موقع عمل معتمد لهذا التاريخ.", "error.duration": "البداية أو النهاية أو الاستراحة لا تنتج فترة عمل صحيحة لا تتجاوز 16 ساعة.", "error.signature": "يرجى توقيع سجل الساعات.", "error.confirm": "يرجى تأكيد صحة البيانات.", "error.submit": "تعذر حفظ المشاركة. حاول مجددًا.", "error.overlap": "تتداخل فترة العمل هذه مع مشاركة موجودة.", "error.assignment": "موقع العمل المحدد غير معتمد لهذا التاريخ.", "error.future": "لا يمكن إرسال ساعات عمل بتاريخ مستقبلي.", "error.activeSession": "توجد مشاركة جارية أو متوقفة. تواصل مع الإدارة قبل إرسال مشاركة جديدة.",
      "success.saved": "تم حفظ ساعات العمل وتحديث ساعات الشهر والحالة وأحدث المشاركات.", "invite.short": "يجب ألا تقل كلمة المرور عن 8 أحرف.", "invite.mismatch": "كلمتا المرور غير متطابقتين.", "invite.failed": "تعذر حفظ كلمة المرور. افتح رابط دعوة جديدًا أو تواصل مع الإدارة.", "password.show": "إظهار كلمة المرور", "password.hide": "إخفاء كلمة المرور", "logout": "تسجيل الخروج"
    }
  };

  var client = null;
  var elements = {};
  var activeProfile = null;
  var activeEmployee = null;
  var activeTimeState = null;
  var assignments = [];
  var scheduledShifts = [];
  var workSites = [];
  var recentEntries = [];
  var monthStatuses = [];
  var serverClockOffsetMs = 0;
  var currentBerlinDate = "";
  var currentLanguage = readStoredLanguage();
  var signatureDataUrl = null;
  var signatureDrawing = false;
  var signatureHasInk = false;
  var signatureResizeTimer = null;
  var submissionPending = false;
  var pendingSubmissionId = null;
  var inviteFlow = readAuthFlowType() === "invite";
  var deferredInstallPrompt = null;

  document.addEventListener("DOMContentLoaded", initialize);
  registerServiceWorker();

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("./service-worker.js", { scope: "./" }).catch(function () {});
    });
  }

  function cacheElements() {
    [
      "loadingView", "loginView", "inviteView", "staffView", "appView", "loginForm", "loginEmail",
      "loginPassword", "loginButton", "loginError", "passwordToggle", "staffLogoutButton", "logoutButton",
      "installAppButton",
      "accountName", "employeeGreeting", "todayShiftHeading", "todayShiftDetail", "todayShiftStatus", "todayHours", "globalAlert", "focusRecordButton", "recordCard", "timeEntryForm", "workDate", "workSite",
      "startTime", "endTime", "breakMinutes", "durationPreview", "workNote", "signatureCanvas",
      "signaturePlaceholder", "clearSignatureButton", "confirmEntry", "formFeedback", "submitTimeButton",
      "monthHours", "activeEntries", "completedEntries", "recentEntries", "inviteForm", "invitePassword",
      "invitePasswordConfirm", "inviteButton", "inviteError"
    ].forEach(function (id) { elements[id] = document.getElementById(id); });
  }

  function bindEvents() {
    elements.loginForm.addEventListener("submit", handleLogin);
    elements.inviteForm.addEventListener("submit", handleInvitePassword);
    elements.passwordToggle.addEventListener("click", togglePasswordVisibility);
    elements.staffLogoutButton.addEventListener("click", handleLogout);
    elements.logoutButton.addEventListener("click", handleLogout);
    elements.installAppButton.addEventListener("click", installApp);
    elements.focusRecordButton.addEventListener("click", function () {
      elements.recordCard.scrollIntoView({ behavior: "smooth", block: "start" });
      window.setTimeout(function () { elements.workDate.focus(); }, 350);
    });
    document.querySelectorAll("[data-language]").forEach(function (button) {
      button.addEventListener("click", function () { setLanguage(button.getAttribute("data-language")); });
    });
    elements.workDate.addEventListener("change", function () { renderAvailableSites(); updateSubmitAvailability(); });
    elements.workSite.addEventListener("change", updateSubmitAvailability);
    elements.startTime.addEventListener("input", renderDuration);
    elements.endTime.addEventListener("input", renderDuration);
    elements.breakMinutes.addEventListener("input", renderDuration);
    elements.confirmEntry.addEventListener("change", updateSubmitAvailability);
    elements.timeEntryForm.addEventListener("input", updateSubmitAvailability);
    elements.timeEntryForm.addEventListener("submit", submitTimeEntry);
    elements.clearSignatureButton.addEventListener("click", clearSignature);
    initializeSignaturePad();
  }

  async function initialize() {
    cacheElements();
    applyLanguage();
    bindEvents();
    initializeInstallPrompt();
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
      if (sessionResult.error) throw sessionResult.error;
      if (!sessionResult.data.session) {
        showView("login");
        return;
      }
      await routeSession(sessionResult.data.session);
    } catch (error) {
      showView("login");
      showLoginError(t("error.loginUnavailable"));
    }
  }

  function initializeInstallPrompt() {
    window.addEventListener("beforeinstallprompt", function (event) {
      event.preventDefault();
      deferredInstallPrompt = event;
      updateInstallButton();
    });
    window.addEventListener("appinstalled", function () {
      deferredInstallPrompt = null;
      updateInstallButton();
    });
    var standaloneQuery = window.matchMedia("(display-mode: standalone)");
    if (typeof standaloneQuery.addEventListener === "function") {
      standaloneQuery.addEventListener("change", updateInstallButton);
    }
    updateInstallButton();
  }

  async function installApp() {
    if (!deferredInstallPrompt || isStandalone()) return;
    deferredInstallPrompt.prompt();
    try {
      await deferredInstallPrompt.userChoice;
    } finally {
      deferredInstallPrompt = null;
      updateInstallButton();
    }
  }

  function updateInstallButton() {
    if (!elements.installAppButton) return;
    elements.installAppButton.hidden = !deferredInstallPrompt || isStandalone();
  }

  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }

  function createClient() {
    var config = window.SAUBERPLUS_ADMIN_CONFIG || {};
    if (!config.supabaseUrl || !config.supabaseAnonKey) throw new Error("Supabase configuration is missing.");
    if (!window.supabase || typeof window.supabase.createClient !== "function") throw new Error("Supabase client failed to load.");
    return window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  }

  async function routeSession(session) {
    showView("loading");
    var profileResult = await client.from("user_profiles").select("id,email,display_name,role,disabled").eq("id", session.user.id).maybeSingle();
    if (profileResult.error || !profileResult.data || profileResult.data.disabled) {
      await client.auth.signOut();
      showView("login");
      showLoginError(t("error.inactive"));
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
      showLoginError(t("error.notEmployee"));
      return;
    }
    if (inviteFlow) {
      showView("invite");
      return;
    }
    showView("app");
    await refreshPortal();
  }

  async function handleLogin(event) {
    event.preventDefault();
    hideLoginError();
    var email = String(elements.loginEmail.value || "").trim().toLowerCase();
    var password = elements.loginPassword.value;
    if (!email || !password || !elements.loginEmail.validity.valid) {
      showLoginError(t("error.loginFields"));
      return;
    }
    setLoginPending(true);
    try {
      var lockoutResult = await client.rpc("is_locked_out", { p_email: email });
      if (lockoutResult.error) throw lockoutResult.error;
      if (lockoutResult.data === true) {
        showLoginError(t("error.locked"));
        return;
      }
      var signInResult = await client.auth.signInWithPassword({ email: email, password: password });
      if (signInResult.error) {
        await client.rpc("register_failed_login", { p_email: email });
        showLoginError(t("error.credentials"));
        return;
      }
      await client.rpc("register_successful_login", { p_email: email });
      elements.loginPassword.value = "";
      await routeSession(signInResult.data.session);
    } catch (error) {
      showLoginError(t("error.loginUnavailable"));
    } finally {
      setLoginPending(false);
    }
  }

  async function handleLogout() {
    elements.staffLogoutButton.disabled = true;
    elements.logoutButton.disabled = true;
    try { await client.auth.signOut(); } finally {
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
    if (password.length < 8) return showInviteError(t("invite.short"));
    if (password !== confirmation) return showInviteError(t("invite.mismatch"));
    elements.inviteButton.disabled = true;
    elements.inviteButton.setAttribute("data-loading", "true");
    try {
      var result = await client.auth.updateUser({ password: password });
      if (result.error) throw result.error;
      inviteFlow = false;
      elements.inviteForm.reset();
      window.history.replaceState({}, document.title, window.location.pathname);
      var sessionResult = await client.auth.getSession();
      if (!sessionResult.data.session) throw new Error("Invite session unavailable.");
      await routeSession(sessionResult.data.session);
    } catch (error) {
      showInviteError(t("invite.failed"));
    } finally {
      elements.inviteButton.disabled = false;
      elements.inviteButton.setAttribute("data-loading", "false");
    }
  }

  async function refreshPortal(options) {
    var settings = options || {};
    if (!settings.keepAlert) hideGlobalAlert();
    try {
      var nowMs = getServerNowMs();
      currentBerlinDate = getBerlinDateKey(nowMs);
      var monthStart = currentBerlinDate.slice(0, 8) + "01";
      var monthEnd = currentBerlinDate;
      var lowerShiftBound = new Date(nowMs - 62 * 24 * 60 * 60 * 1000).toISOString();
      var upperShiftBound = new Date(nowMs + 2 * 24 * 60 * 60 * 1000).toISOString();
      var requests = [
        client.rpc("get_my_time_state"),
        client.from("employees").select("id,employee_number,phone,employment_start_date,employment_end_date").eq("id", activeProfile.id).maybeSingle(),
        client.from("employee_work_sites").select("work_site_id,is_primary,valid_from,valid_until").eq("employee_id", activeProfile.id),
        client.from("work_shifts").select("id,work_site_id,scheduled_start,scheduled_end,status").eq("employee_id", activeProfile.id).eq("status", "scheduled").gte("scheduled_start", lowerShiftBound).lte("scheduled_start", upperShiftBound),
        client.from("time_entry_totals").select("id,work_site_id,work_date,started_at,ended_at,status,break_seconds,worked_seconds").eq("employee_id", activeProfile.id).order("started_at", { ascending: false }).limit(4),
        client.from("time_entries").select("id,status").eq("employee_id", activeProfile.id).gte("work_date", monthStart).lte("work_date", monthEnd),
        client.rpc("get_time_summary", { p_employee_id: activeProfile.id, p_from: monthStart, p_to: monthEnd, p_bucket: "month", p_work_site_id: null })
      ];
      var results = await Promise.all(requests);
      var firstError = results.find(function (result) { return result.error; });
      if (firstError) throw firstError.error;
      if (!results[1].data) throw new Error("Employee record unavailable.");

      activeTimeState = Array.isArray(results[0].data) && results[0].data.length ? results[0].data[0] : null;
      if (activeTimeState && activeTimeState.server_now) {
        serverClockOffsetMs = Date.parse(activeTimeState.server_now) - Date.now();
        currentBerlinDate = getBerlinDateKey(getServerNowMs());
      }
      activeEmployee = results[1].data;
      assignments = results[2].data || [];
      scheduledShifts = results[3].data || [];
      recentEntries = results[4].data || [];
      monthStatuses = results[5].data || [];
      var summarySeconds = (results[6].data || []).reduce(function (total, row) { return total + toSafeSeconds(row.worked_seconds); }, 0);

      var siteIds = uniqueValues(assignments.map(function (item) { return item.work_site_id; })
        .concat(scheduledShifts.map(function (item) { return item.work_site_id; }))
        .concat(recentEntries.map(function (item) { return item.work_site_id; }))
        .concat(activeTimeState ? [activeTimeState.work_site_id] : []));
      workSites = [];
      if (siteIds.length) {
        var sitesResult = await client.from("work_sites").select("id,code,name,address,active,timezone_name").in("id", siteIds);
        if (sitesResult.error) throw sitesResult.error;
        workSites = sitesResult.data || [];
      }

      elements.accountName.textContent = activeProfile.display_name || activeProfile.email || "";
      elements.workDate.max = currentBerlinDate;
      elements.workDate.min = activeEmployee.employment_start_date || "";
      if (!elements.workDate.value || elements.workDate.value > currentBerlinDate) elements.workDate.value = currentBerlinDate;
      elements.monthHours.textContent = formatDuration(summarySeconds);
      elements.activeEntries.textContent = String(monthStatuses.filter(function (entry) { return entry.status === "working" || entry.status === "paused"; }).length);
      elements.completedEntries.textContent = String(monthStatuses.filter(function (entry) { return entry.status === "completed"; }).length);
      renderAvailableSites();
      renderTodayOverview();
      renderRecentEntries();
      renderDuration();
      if (activeTimeState) showGlobalAlert(t("error.activeSession"), "");
      updateSubmitAvailability();
    } catch (error) {
      showGlobalAlert(t("error.load"), "");
    }
  }

  function renderAvailableSites() {
    var selectedDate = elements.workDate.value || currentBerlinDate;
    var previousValue = elements.workSite.value;
    var permittedIds = uniqueValues(assignments.filter(function (assignment) {
      return (!assignment.valid_from || assignment.valid_from <= selectedDate)
        && (!assignment.valid_until || assignment.valid_until >= selectedDate);
    }).map(function (assignment) { return assignment.work_site_id; }).concat(scheduledShifts.filter(function (shift) {
      return getBerlinDateKey(Date.parse(shift.scheduled_start)) === selectedDate;
    }).map(function (shift) { return shift.work_site_id; })));

    var sites = workSites.filter(function (site) { return site.active && permittedIds.indexOf(site.id) !== -1; }).sort(function (left, right) {
      return left.name.localeCompare(right.name, currentLanguage);
    });
    elements.workSite.replaceChildren();
    var placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = t("form.sitePlaceholder");
    elements.workSite.appendChild(placeholder);
    sites.forEach(function (site) {
      var option = document.createElement("option");
      option.value = site.id;
      option.textContent = [site.code, site.name].filter(Boolean).join(" · ");
      elements.workSite.appendChild(option);
    });
    if (sites.some(function (site) { return site.id === previousValue; })) {
      elements.workSite.value = previousValue;
    } else {
      var primaryAssignment = assignments.find(function (assignment) {
        return assignment.is_primary && permittedIds.indexOf(assignment.work_site_id) !== -1;
      });
      if (primaryAssignment && sites.some(function (site) { return site.id === primaryAssignment.work_site_id; })) {
        elements.workSite.value = primaryAssignment.work_site_id;
      } else if (sites.length === 1) {
        elements.workSite.value = sites[0].id;
      }
    }
    elements.workSite.disabled = sites.length === 0 || submissionPending || Boolean(activeTimeState);
  }

  function renderTodayOverview() {
    var name = activeProfile.display_name || activeProfile.email || "";
    var activeSite = activeTimeState && workSites.find(function (site) { return site.id === activeTimeState.work_site_id; });
    var scheduledShift = scheduledShifts.find(function (shift) { return getBerlinDateKey(Date.parse(shift.scheduled_start)) === currentBerlinDate; });
    var scheduledSite = scheduledShift && workSites.find(function (site) { return site.id === scheduledShift.work_site_id; });
    var todaySeconds = recentEntries.filter(function (entry) { return entry.work_date === currentBerlinDate; }).reduce(function (total, entry) { return total + toSafeSeconds(entry.worked_seconds); }, 0);
    var status = "none";

    elements.employeeGreeting.textContent = name ? t("app.greeting") + ", " + name : t("app.greeting");
    elements.todayHours.textContent = formatDuration(todaySeconds);

    if (activeTimeState) {
      status = activeTimeState.status === "paused" ? "paused" : "working";
      elements.todayShiftHeading.textContent = activeSite ? activeSite.name : t("form.site");
      elements.todayShiftDetail.textContent = t("today.activeDetail");
    } else if (scheduledShift) {
      status = "scheduled";
      elements.todayShiftHeading.textContent = scheduledSite ? scheduledSite.name : t("form.site");
      elements.todayShiftDetail.textContent = formatTime(scheduledShift.scheduled_start) + " – " + formatTime(scheduledShift.scheduled_end) + " · " + t("today.shiftDetail");
    } else {
      elements.todayShiftHeading.textContent = t("today.noShift");
      elements.todayShiftDetail.textContent = t("today.noShiftDetail");
    }

    elements.todayShiftStatus.setAttribute("data-status", status);
    elements.todayShiftStatus.textContent = t("status." + status);
  }

  function renderRecentEntries() {
    elements.recentEntries.replaceChildren();
    if (!recentEntries.length) {
      var empty = document.createElement("p");
      empty.className = "employee-recent-empty";
      empty.textContent = t("recent.empty");
      elements.recentEntries.appendChild(empty);
      return;
    }
    recentEntries.forEach(function (entry) {
      var site = workSites.find(function (candidate) { return candidate.id === entry.work_site_id; });
      var item = document.createElement("article");
      item.className = "employee-recent-item";
      var copy = document.createElement("div");
      var title = document.createElement("h3");
      var detail = document.createElement("p");
      title.textContent = site ? site.name : t("form.site");
      detail.textContent = formatDate(entry.work_date) + " · " + formatTime(entry.started_at) + " – " + (entry.ended_at ? formatTime(entry.ended_at) : "—");
      copy.appendChild(title);
      copy.appendChild(detail);
      var meta = document.createElement("div");
      meta.className = "employee-recent-meta";
      var duration = document.createElement("strong");
      duration.textContent = formatDuration(toSafeSeconds(entry.worked_seconds));
      var badge = document.createElement("span");
      badge.className = "employee-status-badge";
      badge.setAttribute("data-status", entry.status);
      badge.textContent = t("status." + entry.status);
      meta.appendChild(duration);
      meta.appendChild(badge);
      item.appendChild(copy);
      item.appendChild(meta);
      elements.recentEntries.appendChild(item);
    });
  }

  function renderDuration() {
    var minutes = calculateWorkedMinutes();
    elements.durationPreview.textContent = minutes === null ? t("form.completeTimes") : formatMinutes(minutes);
    updateSubmitAvailability();
  }

  function calculateWorkedMinutes() {
    if (!elements.startTime.value || !elements.endTime.value) return null;
    var startParts = elements.startTime.value.split(":").map(Number);
    var endParts = elements.endTime.value.split(":").map(Number);
    var breakMinutes = Number(elements.breakMinutes.value);
    if (startParts.some(Number.isNaN) || endParts.some(Number.isNaN) || !Number.isInteger(breakMinutes) || breakMinutes < 0 || breakMinutes > 240) return null;
    var duration = endParts[0] * 60 + endParts[1] - (startParts[0] * 60 + startParts[1]);
    if (duration <= 0) duration += 24 * 60;
    var workedMinutes = duration - breakMinutes;
    return workedMinutes > 0 && duration <= MAX_SHIFT_MINUTES ? workedMinutes : null;
  }

  async function submitTimeEntry(event) {
    event.preventDefault();
    if (submissionPending) return;
    setFormFeedback("", "");
    if (!elements.timeEntryForm.checkValidity()) {
      elements.timeEntryForm.reportValidity();
      setFormFeedback(t("error.required"), "error");
      return;
    }
    if (!elements.workSite.value) return setFormFeedback(t("error.site"), "error");
    if (calculateWorkedMinutes() === null) return setFormFeedback(t("error.duration"), "error");
    if (!signatureDataUrl) return setFormFeedback(t("error.signature"), "error");
    if (!elements.confirmEntry.checked) return setFormFeedback(t("error.confirm"), "error");
    if (activeTimeState) return setFormFeedback(t("error.activeSession"), "error");

    if (!pendingSubmissionId) pendingSubmissionId = createRequestId();
    submissionPending = true;
    updateSubmitAvailability();
    elements.submitTimeButton.setAttribute("data-loading", "true");
    try {
      var result = await client.rpc("submit_manual_time_entry", {
        p_request_id: pendingSubmissionId,
        p_work_site_id: elements.workSite.value,
        p_work_date: elements.workDate.value,
        p_start_time: elements.startTime.value,
        p_end_time: elements.endTime.value,
        p_break_minutes: Number(elements.breakMinutes.value),
        p_note: String(elements.workNote.value || "").trim() || null,
        p_signature_data_url: signatureDataUrl
      });
      if (result.error) throw result.error;
      pendingSubmissionId = null;
      var retainedSite = elements.workSite.value;
      elements.timeEntryForm.reset();
      elements.workDate.value = currentBerlinDate;
      elements.breakMinutes.value = "0";
      clearSignature();
      renderAvailableSites();
      if ([].some.call(elements.workSite.options, function (option) { return option.value === retainedSite; })) elements.workSite.value = retainedSite;
      setFormFeedback(t("success.saved"), "success");
      await refreshPortal({ keepAlert: true });
    } catch (error) {
      if (!isNetworkError(error)) pendingSubmissionId = null;
      setFormFeedback(formatSubmissionError(error), "error");
    } finally {
      submissionPending = false;
      elements.submitTimeButton.setAttribute("data-loading", "false");
      renderAvailableSites();
      updateSubmitAvailability();
    }
  }

  function initializeSignaturePad() {
    var canvas = elements.signatureCanvas;
    canvas.tabIndex = 0;
    resizeSignatureCanvas();
    canvas.addEventListener("pointerdown", function (event) {
      if (submissionPending || (event.pointerType === "mouse" && event.button !== 0)) return;
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      signatureDrawing = true;
      var point = getCanvasPoint(event);
      var context = canvas.getContext("2d");
      context.beginPath();
      context.moveTo(point.x, point.y);
      context.arc(point.x, point.y, 1.3, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.moveTo(point.x, point.y);
      signatureHasInk = true;
      signatureDataUrl = canvas.toDataURL("image/png");
      renderSignatureState();
    });
    canvas.addEventListener("pointermove", function (event) {
      if (!signatureDrawing) return;
      event.preventDefault();
      var point = getCanvasPoint(event);
      var context = canvas.getContext("2d");
      context.lineTo(point.x, point.y);
      context.stroke();
    });
    ["pointerup", "pointercancel"].forEach(function (eventName) {
      canvas.addEventListener(eventName, function (event) {
        if (!signatureDrawing) return;
        signatureDrawing = false;
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
        signatureDataUrl = signatureHasInk ? canvas.toDataURL("image/png") : null;
        renderSignatureState();
      });
    });
    window.addEventListener("resize", function () {
      window.clearTimeout(signatureResizeTimer);
      signatureResizeTimer = window.setTimeout(resizeSignatureCanvas, 120);
    });
  }

  function resizeSignatureCanvas() {
    var canvas = elements.signatureCanvas;
    if (!canvas) return;
    var savedSignature = signatureDataUrl;
    var rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    var ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    var context = canvas.getContext("2d");
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 2.6;
    context.strokeStyle = "#0b2948";
    context.fillStyle = "#0b2948";
    if (savedSignature) {
      var image = new Image();
      image.onload = function () { context.drawImage(image, 0, 0, rect.width, rect.height); };
      image.src = savedSignature;
    }
  }

  function getCanvasPoint(event) {
    var rect = elements.signatureCanvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function clearSignature() {
    var canvas = elements.signatureCanvas;
    var context = canvas.getContext("2d");
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.restore();
    signatureDataUrl = null;
    signatureHasInk = false;
    signatureDrawing = false;
    renderSignatureState();
  }

  function renderSignatureState() {
    elements.signaturePlaceholder.hidden = signatureHasInk;
    elements.clearSignatureButton.disabled = !signatureHasInk || submissionPending;
    updateSubmitAvailability();
  }

  function updateSubmitAvailability() {
    if (!elements.submitTimeButton) return;
    var ready = Boolean(elements.workDate.value && elements.workSite.value && elements.startTime.value && elements.endTime.value)
      && calculateWorkedMinutes() !== null
      && Boolean(signatureDataUrl)
      && elements.confirmEntry.checked
      && !activeTimeState;
    elements.submitTimeButton.disabled = submissionPending || !ready;
    elements.clearSignatureButton.disabled = submissionPending || !signatureHasInk;
    elements.workDate.disabled = submissionPending || Boolean(activeTimeState);
    elements.startTime.disabled = submissionPending || Boolean(activeTimeState);
    elements.endTime.disabled = submissionPending || Boolean(activeTimeState);
    elements.breakMinutes.disabled = submissionPending || Boolean(activeTimeState);
    elements.workNote.disabled = submissionPending || Boolean(activeTimeState);
    elements.confirmEntry.disabled = submissionPending || Boolean(activeTimeState);
  }

  function setLanguage(language) {
    if (!translations[language]) return;
    currentLanguage = language;
    try { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language); } catch (error) { /* storage is optional */ }
    applyLanguage();
    if (workSites.length) {
      renderAvailableSites();
      renderTodayOverview();
      renderRecentEntries();
      renderDuration();
    }
  }

  function applyLanguage() {
    document.documentElement.lang = currentLanguage;
    document.documentElement.dir = currentLanguage === "ar" ? "rtl" : "ltr";
    document.body.classList.toggle("ar", currentLanguage === "ar");
    document.querySelectorAll("[data-i18n]").forEach(function (element) {
      var value = t(element.getAttribute("data-i18n"));
      if (value) element.textContent = value;
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(function (element) {
      element.placeholder = t(element.getAttribute("data-i18n-placeholder"));
    });
    document.querySelectorAll("[data-language]").forEach(function (button) {
      button.setAttribute("aria-pressed", String(button.getAttribute("data-language") === currentLanguage));
    });
    if (elements.logoutButton) {
      elements.logoutButton.setAttribute("aria-label", t("logout"));
      elements.logoutButton.title = t("logout");
    }
  }

  function readStoredLanguage() {
    try {
      var stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (translations[stored]) return stored;
    } catch (error) { /* use default */ }
    return "de";
  }

  function t(key) { return (translations[currentLanguage] && translations[currentLanguage][key]) || translations.de[key] || key; }

  function showView(viewName) {
    elements.loadingView.hidden = viewName !== "loading";
    elements.loginView.hidden = viewName !== "login";
    elements.inviteView.hidden = viewName !== "invite";
    elements.staffView.hidden = viewName !== "staff";
    elements.appView.hidden = viewName !== "app";
    if (viewName === "app") window.requestAnimationFrame(resizeSignatureCanvas);
  }

  function resetEmployeeState() {
    activeProfile = null;
    activeEmployee = null;
    activeTimeState = null;
    assignments = [];
    scheduledShifts = [];
    workSites = [];
    recentEntries = [];
    monthStatuses = [];
    serverClockOffsetMs = 0;
    currentBerlinDate = "";
    pendingSubmissionId = null;
    submissionPending = false;
    if (elements.timeEntryForm) elements.timeEntryForm.reset();
    if (elements.signatureCanvas) clearSignature();
  }

  function togglePasswordVisibility() {
    var showPassword = elements.loginPassword.type === "password";
    elements.loginPassword.type = showPassword ? "text" : "password";
    elements.passwordToggle.setAttribute("aria-pressed", String(showPassword));
    elements.passwordToggle.setAttribute("aria-label", t(showPassword ? "password.hide" : "password.show"));
  }

  function setLoginPending(pending) {
    elements.loginButton.disabled = pending;
    elements.loginButton.setAttribute("data-loading", String(pending));
    elements.loginEmail.disabled = pending;
    elements.loginPassword.disabled = pending;
  }

  function showLoginError(message) { elements.loginError.textContent = message; elements.loginError.hidden = false; }
  function hideLoginError() { elements.loginError.textContent = ""; elements.loginError.hidden = true; }
  function showInviteError(message) { elements.inviteError.textContent = message; elements.inviteError.hidden = false; }
  function showGlobalAlert(message, tone) { elements.globalAlert.textContent = message; elements.globalAlert.hidden = false; if (tone) elements.globalAlert.setAttribute("data-tone", tone); else elements.globalAlert.removeAttribute("data-tone"); }
  function hideGlobalAlert() { elements.globalAlert.textContent = ""; elements.globalAlert.hidden = true; elements.globalAlert.removeAttribute("data-tone"); }
  function setFormFeedback(message, tone) { elements.formFeedback.textContent = message; if (tone) elements.formFeedback.setAttribute("data-tone", tone); else elements.formFeedback.removeAttribute("data-tone"); }

  function formatSubmissionError(error) {
    var message = String((error && error.message) || "").toLowerCase();
    if (message.indexOf("overlaps") !== -1) return t("error.overlap");
    if (message.indexOf("assigned") !== -1 || message.indexOf("work site") !== -1) return t("error.assignment");
    if (message.indexOf("future") !== -1) return t("error.future");
    if (message.indexOf("active work session") !== -1) return t("error.activeSession");
    return t("error.submit");
  }

  function getServerNowMs() { return Date.now() + serverClockOffsetMs; }

  function getBerlinDateKey(timestamp) {
    var parts = new Intl.DateTimeFormat("en-GB", { timeZone: BERLIN_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(timestamp));
    var values = Object.create(null);
    parts.forEach(function (part) { values[part.type] = part.value; });
    return values.year + "-" + values.month + "-" + values.day;
  }

  function formatDate(dateString) {
    var parts = String(dateString || "").split("-").map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return dateString || "—";
    return new Intl.DateTimeFormat(currentLanguage === "ar" ? "ar-DE" : currentLanguage + "-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(parts[0], parts[1] - 1, parts[2], 12));
  }

  function formatTime(timestamp) {
    return new Intl.DateTimeFormat(currentLanguage === "ar" ? "ar-DE" : currentLanguage + "-DE", { timeZone: BERLIN_TIME_ZONE, hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
  }

  function formatDuration(secondsValue) {
    var totalMinutes = Math.floor(toSafeSeconds(secondsValue) / 60);
    return padNumber(Math.floor(totalMinutes / 60)) + ":" + padNumber(totalMinutes % 60);
  }

  function formatMinutes(minutes) { return padNumber(Math.floor(minutes / 60)) + ":" + padNumber(minutes % 60); }
  function padNumber(value) { return String(value).padStart(2, "0"); }
  function toSafeSeconds(value) { var number = Number(value); return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0; }
  function uniqueValues(values) { return Array.from(new Set(values.filter(Boolean))); }
  function createRequestId() { if (!window.crypto || typeof window.crypto.randomUUID !== "function") throw new Error("crypto.randomUUID unavailable."); return window.crypto.randomUUID(); }
  function readAuthFlowType() { var searchType = new URLSearchParams(window.location.search).get("type"); var hashType = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("type"); return searchType || hashType || ""; }
  function isNetworkError(error) { var message = String((error && error.message) || "").toLowerCase(); return (error && error.status === 0) || message.indexOf("failed to fetch") !== -1 || message.indexOf("network") !== -1; }
})();
