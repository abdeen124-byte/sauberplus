"use strict";

const CACHE_PREFIX = "sauberplus-employee-shell-";
const CACHE_NAME = CACHE_PREFIX + "v2";
const APP_PATH = "/mitarbeiter/";
const APP_SHELL = [
  APP_PATH,
  APP_PATH + "index.html",
  APP_PATH + "css/employee.css",
  APP_PATH + "js/employee-app.js",
  APP_PATH + "manifest.webmanifest",
  APP_PATH + "icons/sauberplus-logo.png",
  APP_PATH + "icons/sauberplus-192.png",
  APP_PATH + "icons/sauberplus-512.png",
  APP_PATH + "icons/sauberplus-180.png",
  "/admin/js/vendor/supabase.js",
  "/admin/js/admin-config.js"
];
const STATIC_PATHS = new Set(APP_SHELL.map((asset) => new URL(asset, self.location.origin).pathname));

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate" && url.pathname.startsWith(APP_PATH)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (!response.ok) return response;
          const responseCopy = response.clone();
          return caches.open(CACHE_NAME)
            .then((cache) => cache.put(APP_PATH, responseCopy))
            .then(() => response);
        })
        .catch(() => caches.match(APP_PATH))
    );
    return;
  }

  if (!STATIC_PATHS.has(url.pathname)) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => cachedResponse || fetch(request))
  );
});
