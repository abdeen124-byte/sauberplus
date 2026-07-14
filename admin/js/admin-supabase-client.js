/**
 * Supabase client bootstrap for the SauberPlus admin panel.
 *
 * Every admin/*.html page is a full page load (no SPA router), so the
 * session has to survive navigation via Web Storage — there is no server
 * available to issue an HttpOnly cookie instead, which is the whole reason
 * this admin runs against Supabase directly from the browser in the first
 * place. The Remember Me checkbox on the login page decides which storage
 * backs the session: checked -> localStorage (survives a browser restart),
 * unchecked -> sessionStorage (cleared when the tab closes). Every other
 * page has to be able to find that same session without knowing which one
 * was chosen at login time, so a small preference flag (not the session
 * itself, just a "which store did we use" marker) is kept in localStorage
 * and consulted on every page load.
 */
(function () {
  "use strict";

  var REMEMBER_FLAG_KEY = "sp_admin_remember";

  function getPreferredStorage() {
    var remember = window.localStorage.getItem(REMEMBER_FLAG_KEY);
    return remember === "1" ? window.localStorage : window.sessionStorage;
  }

  function setRememberPreference(remember) {
    if (remember) {
      window.localStorage.setItem(REMEMBER_FLAG_KEY, "1");
    } else {
      window.localStorage.removeItem(REMEMBER_FLAG_KEY);
    }
  }

  var hybridStorage = {
    getItem: function (key) {
      return getPreferredStorage().getItem(key);
    },
    setItem: function (key, value) {
      getPreferredStorage().setItem(key, value);
    },
    removeItem: function (key) {
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
    }
  };

  var cachedClient = null;

  function isConfigured(config) {
    return Boolean(
      config &&
        config.supabaseUrl &&
        config.supabaseAnonKey &&
        config.supabaseUrl.indexOf("REPLACE_WITH") !== 0
    );
  }

  function getClient() {
    if (cachedClient) {
      return cachedClient;
    }

    var config = window.SAUBERPLUS_ADMIN_CONFIG || {};

    if (!isConfigured(config)) {
      throw new Error(
        "SauberPlus admin: Supabase is not configured yet. Fill in admin/js/admin-config.js."
      );
    }

    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      throw new Error("SauberPlus admin: vendored supabase-js failed to load.");
    }

    cachedClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        storage: hybridStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });

    return cachedClient;
  }

  window.AdminSupabase = {
    getClient: getClient,
    setRememberPreference: setRememberPreference,
    isConfigured: function () {
      return isConfigured(window.SAUBERPLUS_ADMIN_CONFIG || {});
    }
  };
})();
