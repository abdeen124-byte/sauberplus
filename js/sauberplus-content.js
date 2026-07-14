(function () {
  var config = window.SAUBERPLUS_CONFIG || {};
  var POPUP_DISMISS_PREFIX = "sp_popup_dismissed_";

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

  function safeUrl(url) {
    return /^https?:\/\//i.test(url || "") ? url : "#";
  }

  function storagePublicUrl(path) {
    return config.supabaseUrl + "/storage/v1/object/public/cms-media/" + path;
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

    var text = document.createElement("span");
    text.textContent = row.description ? row.title + " — " + row.description : row.title;
    mount.appendChild(text);

    var link = safeUrl(row.button_url);
    if (row.button_label && row.button_url && link !== "#") {
      var anchor = document.createElement("a");
      anchor.href = link;
      anchor.rel = "noopener";
      anchor.textContent = row.button_label;
      mount.appendChild(anchor);
    }
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

  function initAnnouncements() {
    restFetch(
      "announcements?select=id,placement,title,description,image_path,button_label,button_url&status=eq.active&order=sort_order.asc"
    )
      .then(function (rows) {
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
      })
      .catch(function () {
        // Fail-soft: mount points stay empty (:empty{display:none} in
        // sauberplus.css), the public page looks exactly as it does today.
      });
  }

  if (isConfigured()) {
    initAnnouncements();
  }
})();
