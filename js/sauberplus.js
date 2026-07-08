(function () {
  var currentLanguage = "de";
  var formType = "inquiry";
  var starRating = 0;
  var countersStarted = false;
  var visitorCounterFailed = false;
  var visitorSessionCookieName = "sp_visitor_session";
  var formLimits = {
    name: 80,
    phone: 40,
    message: 1200,
    maxUrls: 2
  };

  function getElement(id) {
    return document.getElementById(id);
  }

  function setText(element, value) {
    if (element && value !== undefined && value !== null) {
      element.textContent = value;
    }
  }

  function setDisplay(element, value) {
    if (element) {
      element.style.display = value;
    }
  }

  function initializeBubbles() {
    var container = getElement("bubs");
    if (!container) return;

    ["rgba(46,107,230,.25)", "rgba(45,179,74,.2)", "rgba(255,255,255,.07)"].forEach(function (color) {
      for (var index = 0; index < 6; index += 1) {
        var bubble = document.createElement("div");
        var size = Math.random() * 14 + 5;

        bubble.className = "bub";
        bubble.style.width = size + "px";
        bubble.style.height = size + "px";
        bubble.style.left = Math.random() * 100 + "%";
        bubble.style.background = color;
        bubble.style.animationDuration = Math.random() * 10 + 8 + "s";
        bubble.style.animationDelay = Math.random() * 8 + "s";

        container.appendChild(bubble);
      }
    });
  }

  function initializeNavbar() {
    var navigation = getElement("nav");
    if (!navigation) return;

    window.addEventListener("scroll", function () {
      navigation.classList.toggle("scrolled", window.scrollY > 50);
    });
  }

  function initializeVisitorCounter() {
    var element = getElement("vcount");
    if (!element) return;

    element.textContent = "0";

    var config = window.SAUBERPLUS_CONFIG || {};
    var visitorCounterApiUrl = config.visitorCounterApiUrl || "/api/visitor-count";
    var visitorSessionId = getVisitorSessionId();
    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timeoutId = null;

    if (controller) {
      timeoutId = setTimeout(function () {
        controller.abort();
      }, 8000);
    }

    fetch(visitorCounterApiUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "X-Visitor-Session": visitorSessionId
      },
      cache: "no-store",
      credentials: "include",
      signal: controller ? controller.signal : undefined
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("Visitor counter request failed");
        }

        return response.json();
      })
      .then(function (data) {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        if (!data || typeof data.total !== "number") {
          throw new Error("Visitor counter response is invalid");
        }

        visitorCounterFailed = false;
        element.textContent = data.total.toLocaleString("de-DE");
        setText(getElement("v-label"), getVisitorLabel(currentLanguage));
      })
      .catch(function () {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        visitorCounterFailed = true;
        element.textContent = getVisitorCounterError(currentLanguage);
        setText(getElement("v-label"), "");
      });
  }

  function getVisitorSessionId() {
    var sessionId = readCookie(visitorSessionCookieName);

    if (isValidVisitorSessionId(sessionId)) {
      return sessionId;
    }

    sessionId = createVisitorSessionId();
    writeVisitorSessionCookie(sessionId);

    return sessionId;
  }

  function readCookie(name) {
    var cookies = document.cookie ? document.cookie.split(";") : [];
    var prefix = name + "=";
    var index;
    var cookie;

    for (index = 0; index < cookies.length; index += 1) {
      cookie = cookies[index].trim();

      if (cookie.indexOf(prefix) === 0) {
        return decodeURIComponent(cookie.slice(prefix.length));
      }
    }

    return "";
  }

  function writeVisitorSessionCookie(sessionId) {
    var maxAge = 60 * 60 * 24 * 30;
    var cookieParts = [
      visitorSessionCookieName + "=" + encodeURIComponent(sessionId),
      "Max-Age=" + maxAge,
      "Path=/",
      "SameSite=Lax",
      "Secure"
    ];

    if (window.location.hostname === "sauberplus.plus" || window.location.hostname.endsWith(".sauberplus.plus")) {
      cookieParts.push("Domain=.sauberplus.plus");
    }

    document.cookie = cookieParts.join("; ");
  }

  function isValidVisitorSessionId(sessionId) {
    return /^[A-Za-z0-9_-]{32,80}$/.test(sessionId || "");
  }

  function createVisitorSessionId() {
    var bytes;
    var index;
    var id = "";

    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID().replace(/-/g, "");
    }

    if (window.crypto && typeof window.crypto.getRandomValues === "function") {
      bytes = new Uint8Array(32);
      window.crypto.getRandomValues(bytes);

      for (index = 0; index < bytes.length; index += 1) {
        id += bytes[index].toString(16).padStart(2, "0");
      }

      return id;
    }

    return String(Date.now()) + String(Math.random()).slice(2) + String(Math.random()).slice(2);
  }

  function getVisitorLabel(language) {
    var visitorLabels = { de: "Besucher", en: "Visitors", ar: "زائر" };
    return visitorLabels[language] || visitorLabels.de;
  }

  function getVisitorCounterError(language) {
    var counterErrors = {
      de: "Backend fehlt",
      en: "Backend missing",
      ar: "الخادم غير متاح"
    };

    return counterErrors[language] || counterErrors.de;
  }

  function setLang(language) {
    currentLanguage = language;

    document.querySelectorAll(".lang-option").forEach(function (button) {
      button.classList.toggle("active", button.getAttribute("data-lang") === language);
    });

    var htmlRoot = getElement("htmlRoot");
    var body = document.body;

    if (htmlRoot) {
      htmlRoot.setAttribute("dir", language === "ar" ? "rtl" : "ltr");
      htmlRoot.setAttribute("lang", language);
    }

    if (body) {
      body.classList.toggle("ar", language === "ar");
    }

    document.querySelectorAll(".t").forEach(function (element) {
      var translatedText = element.getAttribute("data-" + language);
      if (translatedText) {
        element.textContent = translatedText;
      }
    });

    document.querySelectorAll("select option").forEach(function (option) {
      var translatedText = option.getAttribute("data-" + language);
      if (translatedText) {
        option.textContent = translatedText;
      }
    });

    var headerTexts = {
      de: 'SauberPlus · <span style="color:var(--green);font-weight:700">www.sauberplus.plus</span>',
      en: 'SauberPlus · <span style="color:var(--green);font-weight:700">www.sauberplus.plus</span>',
      ar: 'SauberPlus · <span style="color:var(--green);font-weight:700">www.sauberplus.plus</span>'
    };
    var placeholders = {
      de: ["Ihr Name", "Telefonnummer oder WhatsApp", "Beschreiben Sie kurz Ihr Objekt und die gewünschte Leistung."],
      en: ["Your name", "Phone or WhatsApp number", "Briefly describe the property and service you need."],
      ar: ["اسمك", "رقم الهاتف أو واتساب", "صف المكان والخدمة المطلوبة باختصار."]
    };
    var languagePlaceholders = placeholders[language] || placeholders.de;
    var languageBarText = getElement("lb-text");
    var navButton = document.querySelector(".nav-cta");
    var currentLabel = getElement("currentLangLabel");

    if (visitorCounterFailed) {
      setText(getElement("vcount"), getVisitorCounterError(language));
      setText(getElement("v-label"), "");
    } else {
      setText(getElement("v-label"), getVisitorLabel(language));
    }

    setText(currentLabel, language.toUpperCase());

    if (languageBarText) {
      languageBarText.innerHTML = headerTexts[language] || headerTexts.de;
    }

    if (navButton) {
      navButton.style.fontFamily = language === "ar" ? "'Cairo', sans-serif" : "'Inter', sans-serif";
    }

    var nameInput = getElement("f-name");
    var phoneInput = getElement("f-tel");
    var messageInput = getElement("f-msg");

    if (nameInput) nameInput.placeholder = languagePlaceholders[0];
    if (phoneInput) phoneInput.placeholder = languagePlaceholders[1];
    if (messageInput) messageInput.placeholder = languagePlaceholders[2];

    closeLanguageMenu();
  }

  function closeLanguageMenu() {
    var selector = getElement("languageSelect");
    var toggle = getElement("languageToggle");

    if (selector) {
      selector.classList.remove("open");
    }

    if (toggle) {
      toggle.setAttribute("aria-expanded", "false");
    }
  }

  function toggleLanguageMenu() {
    var selector = getElement("languageSelect");
    var toggle = getElement("languageToggle");
    var isOpen;

    if (!selector || !toggle) return;

    isOpen = selector.classList.toggle("open");
    toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  }

  function initializeLanguageSelect() {
    var selector = getElement("languageSelect");
    var toggle = getElement("languageToggle");

    if (!selector || !toggle) return;

    toggle.addEventListener("click", function (event) {
      event.stopPropagation();
      toggleLanguageMenu();
    });

    document.querySelectorAll(".lang-option").forEach(function (option) {
      option.addEventListener("click", function (event) {
        event.stopPropagation();
        setLang(option.getAttribute("data-lang") || "de");
      });
    });

    document.addEventListener("click", function (event) {
      if (!selector.contains(event.target)) {
        closeLanguageMenu();
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        closeLanguageMenu();
      }
    });
  }

  function runCounters() {
    if (countersStarted) return;
    countersStarted = true;

    [
      ["c2", 5, 300],
      ["c3", 5, 300],
      ["c4", 10, 150]
    ].forEach(function (item) {
      var element = getElement(item[0]);
      var target = item[1];
      var speed = item[2];
      var value = 0;

      if (!element) return;

      var timer = setInterval(function () {
        value += 1;

        if (value >= target) {
          value = target;
          clearInterval(timer);
        }

        element.textContent = value + "+";
      }, speed);
    });
  }

  function initializeRevealAnimations() {
    var revealElements = document.querySelectorAll(".rv,.rv-l,.rv-r");
    var statsElement = document.querySelector(".hero-stats");

    if (!("IntersectionObserver" in window)) {
      revealElements.forEach(function (element) {
        element.classList.add("on");
      });
      runCounters();
      return;
    }

    if (statsElement) {
      new IntersectionObserver(function (entries, observer) {
        if (entries[0] && entries[0].isIntersecting) {
          runCounters();
          observer.disconnect();
        }
      }, { threshold: 0.4 }).observe(statsElement);
    }

    revealElements.forEach(function (element) {
      new IntersectionObserver(function (entries, observer) {
        if (entries[0] && entries[0].isIntersecting) {
          element.classList.add("on");
          observer.disconnect();
        }
      }, { threshold: 0.1 }).observe(element);
    });
  }

  function pickType(button, type) {
    formType = type;

    document.querySelectorAll(".ttype").forEach(function (item) {
      item.classList.remove("active", "comp");
    });

    if (button) {
      button.classList.add("active");

      if (type === "complaint") {
        button.classList.add("comp");
      }
    }

    setDisplay(getElement("star-row"), type === "praise" ? "block" : "none");

    if (type !== "praise") {
      starRating = 0;
      document.querySelectorAll(".star").forEach(function (star) {
        star.classList.remove("lit");
      });
    }
  }

  function rateStar(rating) {
    starRating = rating;
    var starsRow = document.querySelector(".stars-row");

    if (starsRow) {
      starsRow.classList.remove("invalid");
    }

    document.querySelectorAll(".star").forEach(function (star, index) {
      star.classList.toggle("lit", index < rating);
      star.setAttribute("aria-pressed", index < rating ? "true" : "false");
    });
  }

  function previewStars(rating) {
    document.querySelectorAll(".star").forEach(function (star, index) {
      star.classList.toggle("preview", index < rating);
    });
  }

  function clearStarPreview() {
    document.querySelectorAll(".star").forEach(function (star) {
      star.classList.remove("preview");
    });
  }

  function markInvalidField(field) {
    if (!field) return;

    field.style.borderColor = "#ff6b6b";
    setTimeout(function () {
      field.style.borderColor = "";
    }, 2500);
  }

  function sanitizeFormValue(value, maxLength) {
    return String(value || "")
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
      .trim()
      .slice(0, maxLength);
  }

  function hasUnsafeFormContent(value) {
    return /<\s*\/?\s*script|javascript:|data:text\/html|on[a-z]+\s*=/i.test(value || "");
  }

  function hasSpamSignals(value) {
    var matches = String(value || "").match(/https?:\/\/|www\./gi);

    return matches ? matches.length > formLimits.maxUrls : false;
  }

  function doSend() {
    var nameInput = getElement("f-name");
    var phoneInput = getElement("f-tel");
    var messageInput = getElement("f-msg");
    var serviceSelect = getElement("f-srv");
    var honeypotInput = getElement("f-company");
    var requiredFields = [nameInput, phoneInput, messageInput];
    var isValid = true;

    if (honeypotInput && honeypotInput.value.trim()) {
      return;
    }

    var name = sanitizeFormValue(nameInput ? nameInput.value : "", formLimits.name);
    var phone = sanitizeFormValue(phoneInput ? phoneInput.value : "", formLimits.phone);
    var messageText = sanitizeFormValue(messageInput ? messageInput.value : "", formLimits.message);

    if (nameInput) nameInput.value = name;
    if (phoneInput) phoneInput.value = phone;
    if (messageInput) messageInput.value = messageText;

    requiredFields.forEach(function (field) {
      if (!field || !field.value.trim()) {
        markInvalidField(field);
        isValid = false;
      }
    });

    if (!serviceSelect || serviceSelect.selectedIndex === 0) {
      markInvalidField(serviceSelect);
      isValid = false;
    }

    if (formType === "praise" && starRating === 0) {
      var starsRow = document.querySelector(".stars-row");

      if (starsRow) {
        starsRow.classList.add("invalid");
      }

      isValid = false;
    }

    if (hasUnsafeFormContent(name) || hasUnsafeFormContent(phone) || hasUnsafeFormContent(messageText) || hasSpamSignals(messageText)) {
      markInvalidField(messageInput);
      isValid = false;
    }

    if (!isValid || !serviceSelect) return;

    var typeLabels = {
      inquiry: { de: "Anfrage", en: "Inquiry", ar: "استفسار" },
      complaint: { de: "Beschwerde", en: "Complaint", ar: "شكوى" },
      suggestion: { de: "Vorschlag", en: "Suggestion", ar: "اقتراح" },
      praise: { de: "Bewertung", en: "Review", ar: "تقييم" }
    };
    var fieldLabels = {
      de: {
        type: "Kategorie",
        name: "Name",
        phone: "Telefon/WhatsApp",
        service: "Leistung",
        rating: "Bewertung",
        message: "Nachricht"
      },
      en: {
        type: "Category",
        name: "Name",
        phone: "Phone/WhatsApp",
        service: "Service",
        rating: "Rating",
        message: "Message"
      },
      ar: {
        type: "النوع",
        name: "الاسم",
        phone: "الهاتف/واتساب",
        service: "الخدمة",
        rating: "التقييم",
        message: "الرسالة"
      }
    };
    var typeLabel = typeLabels[formType] && typeLabels[formType][currentLanguage] ? typeLabels[formType][currentLanguage] : formType;
    var labels = fieldLabels[currentLanguage] || fieldLabels.de;
    var selectedService = serviceSelect.options[serviceSelect.selectedIndex].text;
    var messageLines = [
      "SauberPlus",
      labels.type + ": " + typeLabel,
      labels.name + ": " + name,
      labels.phone + ": " + phone,
      labels.service + ": " + selectedService
    ];

    if (formType === "praise") {
      messageLines.push(labels.rating + ": " + starRating + "/5");
    }

    messageLines.push(labels.message + ": " + messageText);

    var message = messageLines.join("\n");
    var emailBody = [
      "SauberPlus",
      labels.type + ": " + typeLabel,
      labels.name + ": " + name,
      labels.phone + ": " + phone,
      labels.service + ": " + selectedService,
      formType === "praise" ? labels.rating + ": " + starRating + "/5" : "",
      "",
      labels.message + ":",
      messageText,
      "",
      "---",
      "Gesendet über www.sauberplus.plus"
    ].join("\n");
    var whatsappUrl = "https://wa.me/4915210316162?text=" + encodeURIComponent(message);
    var mailUrl = "mailto:SauberPlus1@gmail.com?subject=" + encodeURIComponent("[SauberPlus] " + typeLabel + " - " + name) + "&body=" + encodeURIComponent(emailBody);

    setDisplay(getElement("formBody"), "none");
    setDisplay(getElement("formOk"), "block");

    setTimeout(function () {
      window.open(whatsappUrl, "_blank", "noopener,noreferrer");
    }, 500);

    setTimeout(function () {
      window.location.href = mailUrl;
    }, 1200);
  }

  function initializeSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(function (link) {
      link.addEventListener("click", function (event) {
        var target = document.querySelector(link.getAttribute("href"));

        if (!target) return;

        event.preventDefault();
        target.scrollIntoView({ behavior: "smooth" });
      });
    });
  }

  function initializeKeyboardRating() {
    document.querySelectorAll(".star").forEach(function (star, index) {
      star.addEventListener("mouseenter", function () {
        previewStars(index + 1);
      });

      star.addEventListener("focus", function () {
        previewStars(index + 1);
      });

      star.addEventListener("mouseleave", clearStarPreview);
      star.addEventListener("blur", clearStarPreview);

      star.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          rateStar(index + 1);
        }
      });
    });
  }

  window.setLang = setLang;
  window.toggleLanguageMenu = toggleLanguageMenu;
  window.pickType = pickType;
  window.rateStar = rateStar;
  window.doSend = doSend;

  initializeBubbles();
  initializeNavbar();
  initializeVisitorCounter();
  initializeLanguageSelect();
  initializeRevealAnimations();
  initializeSmoothScroll();
  initializeKeyboardRating();
})();
