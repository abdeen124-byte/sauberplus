/**
 * Core auth logic shared by every admin page: sign-in (with the account
 * lockout check), sign-out, the session guard/role gate protected pages call
 * on load, and the idle-session timeout. No DOM wiring for a specific page
 * lives here (that belongs in each page's own admin-<page>.js) other than
 * the small idle-warning banner, which is shared chrome every protected
 * page gets for free.
 *
 * Security note: everything here is a UX convenience layer. The actual
 * permission boundary is the Row Level Security policies in
 * supabase/schema.sql — a page redirecting an unauthorized user away is not
 * what stops them from reading/writing data they shouldn't; the database
 * does that regardless of whether this JS ran at all.
 */
(function () {
  "use strict";

  var IDLE_WARNING_AFTER_MS = 25 * 60 * 1000; // 25 minutes
  var IDLE_SIGNOUT_AFTER_MS = 60 * 1000; // + 60s grace after the warning
  var ACTIVITY_EVENTS = ["mousemove", "keydown", "click", "scroll", "touchstart"];
  var ACTIVITY_THROTTLE_MS = 5000;

  function getClient() {
    return window.AdminSupabase.getClient();
  }

  function redirectToLogin(reason) {
    var target = "index.html";
    if (reason) {
      target += "?reason=" + encodeURIComponent(reason);
    }
    window.location.href = target;
  }

  async function fetchProfile(userId) {
    var client = getClient();
    var result = await client
      .from("user_profiles")
      .select("id, email, display_name, role, disabled")
      .eq("id", userId)
      .single();

    if (result.error) {
      return null;
    }

    return result.data;
  }

  /**
   * Sign in with the account-lockout pre-check. Returns { ok: true, profile }
   * on success, or { ok: false, message } on any failure — callers should
   * always show `message` as-is (it's already written to never distinguish
   * "wrong password" from "unknown email", which matters since partner
   * emails are public on impressum.html).
   */
  async function signIn(email, password, remember) {
    var client = getClient();
    var normalizedEmail = String(email || "").trim().toLowerCase();

    var lockedCheck = await client.rpc("is_locked_out", { p_email: normalizedEmail });
    if (lockedCheck.error) {
      return { ok: false, message: "Anmeldung derzeit nicht möglich. Bitte später erneut versuchen." };
    }
    if (lockedCheck.data === true) {
      return {
        ok: false,
        message: "Zu viele Fehlversuche. Bitte warten Sie 15 Minuten oder setzen Sie Ihr Passwort zurück."
      };
    }

    var signInResult = await client.auth.signInWithPassword({
      email: normalizedEmail,
      password: password
    });

    if (signInResult.error) {
      await client.rpc("register_failed_login", { p_email: normalizedEmail });
      return { ok: false, message: "E-Mail-Adresse oder Passwort ist falsch." };
    }

    var profile = await fetchProfile(signInResult.data.user.id);

    if (!profile || profile.disabled) {
      await client.auth.signOut();
      return { ok: false, message: "Dieses Konto ist deaktiviert. Bitte wenden Sie sich an einen Super Admin." };
    }

    window.AdminSupabase.setRememberPreference(Boolean(remember));
    await client.rpc("register_successful_login", { p_email: normalizedEmail });

    return { ok: true, profile: profile };
  }

  async function signOut() {
    stopIdleTimer();
    await getClient().auth.signOut();
  }

  /**
   * Call at the top of every protected page. Redirects to the login page
   * (with a `reason` query param) if there's no valid, non-disabled session,
   * otherwise returns the caller's profile and starts the idle timer.
   */
  async function requireSession() {
    var client = getClient();
    var sessionResult = await client.auth.getSession();

    if (!sessionResult.data.session) {
      redirectToLogin("signed_out");
      return null;
    }

    var profile = await fetchProfile(sessionResult.data.session.user.id);

    if (!profile || profile.disabled) {
      await client.auth.signOut();
      redirectToLogin("disabled");
      return null;
    }

    client.auth.onAuthStateChange(function (event) {
      if (event === "SIGNED_OUT") {
        redirectToLogin("signed_out");
      }
    });

    startIdleTimer();

    return profile;
  }

  /** Call after requireSession() on pages restricted to one role (Super Admin only). */
  function requireRole(profile, role) {
    if (!profile || profile.role !== role) {
      window.location.href = "dashboard.html";
      return false;
    }
    return true;
  }

  // ---------------------------------------------------------------
  // Idle timeout
  // ---------------------------------------------------------------

  var idleWarnTimeout = null;
  var idleSignOutTimeout = null;
  var lastActivityHandledAt = 0;
  var banner = null;

  function buildBanner() {
    var el = document.createElement("div");
    el.className = "admin-idle-banner";
    el.setAttribute("role", "alert");
    el.innerHTML =
      '<span>Ihre Sitzung läuft bald ab.</span><button type="button">Angemeldet bleiben</button>';
    el.querySelector("button").addEventListener("click", function () {
      resetIdleTimer();
      hideIdleBanner();
    });
    document.body.appendChild(el);
    return el;
  }

  function showIdleBanner() {
    if (!banner) {
      banner = buildBanner();
    }
    banner.setAttribute("data-visible", "true");
  }

  function hideIdleBanner() {
    if (banner) {
      banner.setAttribute("data-visible", "false");
    }
  }

  function onIdleWarning() {
    showIdleBanner();
    idleSignOutTimeout = window.setTimeout(onIdleTimeout, IDLE_SIGNOUT_AFTER_MS);
  }

  function onIdleTimeout() {
    hideIdleBanner();
    signOut().then(function () {
      redirectToLogin("idle");
    });
  }

  function resetIdleTimer() {
    window.clearTimeout(idleWarnTimeout);
    window.clearTimeout(idleSignOutTimeout);
    idleWarnTimeout = window.setTimeout(onIdleWarning, IDLE_WARNING_AFTER_MS);
  }

  function handleActivity() {
    var now = Date.now();
    if (now - lastActivityHandledAt < ACTIVITY_THROTTLE_MS) {
      return;
    }
    lastActivityHandledAt = now;
    hideIdleBanner();
    resetIdleTimer();
  }

  function startIdleTimer() {
    ACTIVITY_EVENTS.forEach(function (eventName) {
      window.addEventListener(eventName, handleActivity, { passive: true });
    });
    resetIdleTimer();
  }

  function stopIdleTimer() {
    window.clearTimeout(idleWarnTimeout);
    window.clearTimeout(idleSignOutTimeout);
    ACTIVITY_EVENTS.forEach(function (eventName) {
      window.removeEventListener(eventName, handleActivity);
    });
  }

  window.AdminAuth = {
    signIn: signIn,
    signOut: signOut,
    requireSession: requireSession,
    requireRole: requireRole
  };
})();
