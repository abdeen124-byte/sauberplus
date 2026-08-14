(function () {
  var config = window.SAUBERPLUS_CONFIG || {};
  var POPUP_DISMISS_PREFIX = "sp_popup_dismissed_";
  var countdownEntries = [];
  var countdownTimer = null;
  var serverClockOffsetMs = 0;

  function getElement(id) {
    return document.getElementById(id);
  }

  function isConfigured() {
    return Boolean(
      config.supabaseUrl && config.supabaseAnonKey && config.supabaseUrl.indexOf("REPLACE_WITH") !== 0
    );
  }

  // Plain REST (PostgREST) fetch, no SDK — this only ever needs a couple of
  // read-only, RLS-filtered SELECTs, so pulling in the ~200KB Supabase JS
  // client onto the public homepage isn't worth it. Same fail-soft pattern
  // as the existing visitor-counter fetch: any failure here is swallowed,
  // never surfaced to the visitor, mount points just stay empty.
  function restFetch(path) {
    return fetch(config.supabaseUrl + "/rest/v1/" + path, {
      headers: {
        apikey: config.supabaseAnonKey,
        Authorization: "Bearer " + config.supabaseAnonKey
      },
      cache: "no-store"
    }).then(function (response) {
      if (!response.ok) {
        throw new Error("SauberPlus content fetch failed");
      }
      return response.json();
    });
  }

  function rpcFetch(functionName) {
    return fetch(config.supabaseUrl + "/rest/v1/rpc/" + functionName, {
      method: "POST",
      headers: {
        apikey: config.supabaseAnonKey,
        Authorization: "Bearer " + config.supabaseAnonKey,
        "Content-Type": "application/json"
      },
      body: "{}",
      cache: "no-store"
    }).then(function (response) {
      if (!response.ok) {
        throw new Error("SauberPlus clock fetch failed");
      }
      return response.json();
    });
  }

  function readServerTimestamp(payload) {
    var value = payload;
    if (Array.isArray(value)) {
      value = value[0];
    }
    if (value && typeof value === "object") {
      value = value.server_now || value.get_public_server_time || value.now;
    }
    var parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }

  function syncServerClock() {
    var requestStartedAt = Date.now();
    return rpcFetch("get_public_server_time").then(function (payload) {
      var serverTime = readServerTimestamp(payload);
      if (serverTime !== null) {
        var requestFinishedAt = Date.now();
        serverClockOffsetMs = serverTime - Math.round((requestStartedAt + requestFinishedAt) / 2);
      }
    });
  }

  function clockNow() {
    return Date.now() + serverClockOffsetMs;
  }

  function safeUrl(url) {
    return /^https?:\/\//i.test(url || "") ? url : "#";
  }

  function storagePublicUrl(path) {
    return config.supabaseUrl + "/storage/v1/object/public/cms-media/" + path;
  }

  function countdownLabels() {
    var language = document.documentElement.lang || "de";
    if (language === "ar") {
      return { days: "أيام", hours: "ساعات", minutes: "دقائق", seconds: "ثوانٍ", remaining: "الوقت المتبقي" };
    }
    if (language === "en") {
      return { days: "Days", hours: "Hours", minutes: "Minutes", seconds: "Seconds", remaining: "Time remaining" };
    }
    return { days: "Tage", hours: "Std.", minutes: "Min.", seconds: "Sek.", remaining: "Verbleibende Zeit" };
  }

  function buildDiscount(row) {
    if (row.discount_percentage === null || row.discount_percentage === undefined || row.discount_percentage === "") {
      return null;
    }
    var value = Number(row.discount_percentage);
    if (!Number.isFinite(value)) {
      return null;
    }
    var badge = document.createElement("span");
    badge.className = "announcement-discount";
    badge.textContent = "−" + new Intl.NumberFormat(document.documentElement.lang || "de", { maximumFractionDigits: 2 }).format(value) + "%";
    return badge;
  }

  function buildCountdown() {
    var labels = countdownLabels();
    var countdown = document.createElement("div");
    countdown.className = "countdown-live";
    countdown.setAttribute("role", "timer");
    countdown.setAttribute("aria-label", labels.remaining);

    ["days", "hours", "minutes", "seconds"].forEach(function (unit) {
      var part = document.createElement("span");
      part.className = "countdown-unit";
      var value = document.createElement("strong");
      value.setAttribute("data-countdown-unit", unit);
      value.textContent = "00";
      var label = document.createElement("small");
      label.setAttribute("data-countdown-label", unit);
      label.textContent = labels[unit];
      part.appendChild(value);
      part.appendChild(label);
      countdown.appendChild(part);
    });
    return countdown;
  }

  function registerTimedAnnouncement(row, owner, countdown) {
    if (!row.end_date) {
      return;
    }
    countdownEntries.push({ row: row, owner: owner, countdown: countdown });
  }

  function appendOfferDetails(container, row, owner) {
    var discount = buildDiscount(row);
    if (discount) {
      container.appendChild(discount);
    }

    var countdown = null;
    if (row.countdown_enabled && row.end_date) {
      countdown = buildCountdown();
      container.appendChild(countdown);
    }
    registerTimedAnnouncement(row, owner, countdown);
  }

  function updateCountdownEntry(entry, now) {
    if (!entry.owner.isConnected) {
      return false;
    }
    var parts = window.SauberPlusCountdown.getRemaining(entry.row.end_date, now);
    if (!parts) {
      return false;
    }
    if (parts.expired && entry.row.auto_hide_after_end !== false) {
      entry.owner.remove();
      return false;
    }
    if (entry.countdown) {
      var labels = countdownLabels();
      ["days", "hours", "minutes", "seconds"].forEach(function (unit) {
        var target = entry.countdown.querySelector('[data-countdown-unit="' + unit + '"]');
        var label = entry.countdown.querySelector('[data-countdown-label="' + unit + '"]');
        if (target) {
          target.textContent = window.SauberPlusCountdown.pad(parts[unit]);
        }
        if (label) {
          label.textContent = labels[unit];
        }
      });
      entry.countdown.setAttribute("aria-label", labels.remaining + ": " + window.SauberPlusCountdown.format(parts));
    }
    return !parts.expired;
  }

  function updateCountdowns() {
    var now = clockNow();
    countdownEntries = countdownEntries.filter(function (entry) {
      return updateCountdownEntry(entry, now);
    });
    if (countdownEntries.length === 0 && countdownTimer !== null) {
      window.clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

  function startCountdowns() {
    updateCountdowns();
    if (countdownEntries.length > 0 && countdownTimer === null) {
      countdownTimer = window.setInterval(updateCountdowns, 1000);
    }
  }

  function buildBanner(row) {
    var wrap = document.createElement("div");
    wrap.className = "cms-banner";

    if (row.image_path) {
      var mediaDiv = document.createElement("div");
      mediaDiv.className = "cms-banner-media";
      var img = document.createElement("img");
      img.src = storagePublicUrl(row.image_path);
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      mediaDiv.appendChild(img);
      wrap.appendChild(mediaDiv);
    }

    var body = document.createElement("div");
    body.className = "cms-banner-body";

    appendOfferDetails(body, row, wrap);

    var title = document.createElement("h3");
    title.className = "cms-banner-title";
    title.textContent = row.title;
    body.appendChild(title);

    if (row.description) {
      var desc = document.createElement("p");
      desc.className = "cms-banner-desc";
      desc.textContent = row.description;
      body.appendChild(desc);
    }

    var link = safeUrl(row.button_url);
    if (row.button_label && row.button_url && link !== "#") {
      var btn = document.createElement("a");
      btn.className = "cms-banner-btn";
      btn.href = link;
      btn.rel = "noopener";
      btn.textContent = row.button_label;
      body.appendChild(btn);
    }

    wrap.appendChild(body);
    return wrap;
  }

  function renderBannerPlacement(mountId, row) {
    var mount = getElement(mountId);
    if (!mount || !row) {
      return;
    }
    mount.appendChild(buildBanner(row));
  }

  function renderTopBar(row) {
    var mount = getElement("cms-top-bar");
    if (!mount || !row) {
      return;
    }

    var content = document.createElement("div");
    content.className = "announcement-top-bar-content";

    var text = document.createElement("span");
    text.textContent = row.description ? row.title + " — " + row.description : row.title;
    content.appendChild(text);

    var link = safeUrl(row.button_url);
    if (row.button_label && row.button_url && link !== "#") {
      var anchor = document.createElement("a");
      anchor.href = link;
      anchor.rel = "noopener";
      anchor.textContent = row.button_label;
      content.appendChild(anchor);
    }

    appendOfferDetails(content, row, content);
    mount.appendChild(content);
  }

  function isPopupDismissed(id) {
    try {
      return window.sessionStorage.getItem(POPUP_DISMISS_PREFIX + id) === "1";
    } catch (error) {
      return false;
    }
  }

  function dismissPopup(id) {
    try {
      window.sessionStorage.setItem(POPUP_DISMISS_PREFIX + id, "1");
    } catch (error) {
      // Storage unavailable (private browsing, etc). Popup may show again
      // next load — harmless, not worth failing louder over.
    }
  }

  function renderPopup(row) {
    var root = getElement("cms-popup-root");
    if (!root || !row || isPopupDismissed(row.id)) {
      return;
    }

    var scrim = document.createElement("div");
    scrim.className = "cms-popup-scrim";

    var card = document.createElement("div");
    card.className = "cms-popup-card";

    function close() {
      scrim.setAttribute("data-open", "false");
      dismissPopup(row.id);
      window.setTimeout(function () {
        scrim.remove();
      }, 300);
    }

    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "cms-popup-close";
    closeBtn.setAttribute("aria-label", "Schließen");
    closeBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"></path></svg>';
    closeBtn.addEventListener("click", close);
    card.appendChild(closeBtn);

    if (row.image_path) {
      var mediaDiv = document.createElement("div");
      mediaDiv.className = "cms-popup-media";
      var img = document.createElement("img");
      img.src = storagePublicUrl(row.image_path);
      img.alt = "";
      mediaDiv.appendChild(img);
      card.appendChild(mediaDiv);
    }

    appendOfferDetails(card, row, scrim);

    var title = document.createElement("h3");
    title.className = "cms-banner-title";
    title.textContent = row.title;
    card.appendChild(title);

    if (row.description) {
      var desc = document.createElement("p");
      desc.className = "cms-banner-desc";
      desc.textContent = row.description;
      card.appendChild(desc);
    }

    var link = safeUrl(row.button_url);
    if (row.button_label && row.button_url && link !== "#") {
      var btn = document.createElement("a");
      btn.className = "cms-banner-btn";
      btn.href = link;
      btn.rel = "noopener";
      btn.textContent = row.button_label;
      card.appendChild(btn);
    }

    scrim.addEventListener("click", function (event) {
      if (event.target === scrim) {
        close();
      }
    });

    scrim.appendChild(card);
    root.appendChild(scrim);

    window.setTimeout(function () {
      scrim.setAttribute("data-open", "true");
    }, 1200);
  }

  function buildGalleryImg(src, alt) {
    var img = document.createElement("img");
    img.src = src;
    img.alt = alt || "";
    img.loading = "lazy";
    img.decoding = "async";
    return img;
  }

  function buildGalleryCard(row) {
    var card = document.createElement("div");
    var caption = row.caption || "";

    if (row.kind === "before_after") {
      card.className = "ba-card ba-pair";
      card.appendChild(buildGalleryImg(storagePublicUrl(row.before_path), caption));
      card.appendChild(buildGalleryImg(storagePublicUrl(row.after_path), caption));
      return card;
    }

    card.className = "ba-card";
    var img = buildGalleryImg(storagePublicUrl(row.image_path), caption);
    img.className = "ba-comparison";
    card.appendChild(img);
    return card;
  }

  function initGallery() {
    restFetch("gallery_images?select=kind,image_path,before_path,after_path,caption&hidden=eq.false&order=sort_order.asc")
      .then(function (rows) {
        if (!rows.length) {
          return; // keep the static fallback grid already in index.html
        }
        var grid = document.querySelector(".gal-grid");
        if (!grid) {
          return;
        }
        grid.innerHTML = "";
        rows.forEach(function (row) {
          grid.appendChild(buildGalleryCard(row));
        });
      })
      .catch(function () {
        // Fail-soft: static fallback grid in index.html stays as-is.
      });
  }

  function initAnnouncements() {
    var fields =
      "id,placement,title,description,image_path,button_label,button_url,start_date,end_date,countdown_enabled,auto_hide_after_end,discount_percentage";
    var announcementsRequest = restFetch(
      "announcements?select=" + fields + "&status=eq.active&order=sort_order.asc"
    ).catch(function () {
      return restFetch(
        "announcements?select=id,placement,title,description,image_path,button_label,button_url&status=eq.active&order=sort_order.asc"
      );
    });

    Promise.all([announcementsRequest, syncServerClock().catch(function () {})])
      .then(function (results) {
        var rows = results[0];
        var byPlacement = {};
        rows.forEach(function (row) {
          if (!byPlacement[row.placement]) {
            byPlacement[row.placement] = row;
          }
        });

        renderTopBar(byPlacement.top_bar);
        renderBannerPlacement("cms-homepage-banner", byPlacement.homepage_banner);
        renderBannerPlacement("cms-seasonal", byPlacement.seasonal);
        renderBannerPlacement("cms-promo-section", byPlacement.promo_section);
        renderPopup(byPlacement.popup);
        startCountdowns();
      })
      .catch(function () {
        // Fail-soft: mount points stay empty (:empty{display:none} in
        // sauberplus.css), the public page looks exactly as it does today.
      });
  }

  if (isConfigured()) {
    initAnnouncements();
    initGallery();
  }
})();
