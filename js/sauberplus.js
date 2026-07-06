(function () {
  var currentLanguage = "de";
  var formType = "inquiry";
  var starRating = 0;
  var countersStarted = false;

  function getElement(id) {
    return document.getElementById(id);
  }

  function setText(element, value) {
    if (element && value) {
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

  function readVisitorCount(key, fallback) {
    try {
      var storedValue = parseInt(localStorage.getItem(key) || fallback, 10);
      return Number.isNaN(storedValue) || storedValue < fallback ? fallback : storedValue;
    } catch (error) {
      return fallback;
    }
  }

  function saveVisitorCount(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      return false;
    }

    return true;
  }

  function initializeVisitorCounter() {
    var element = getElement("vcount");
    if (!element) return;

    var storageKey = "sp_v5_total";
    var baseCount = 500;
    var total = readVisitorCount(storageKey, baseCount) + 1;
    var start = Math.max(baseCount, total - 34);
    var duration = 1300;
    var startTime = null;

    saveVisitorCount(storageKey, total);

    function easeOutCubic(value) {
      return 1 - Math.pow(1 - value, 3);
    }

    function tick(timestamp) {
      if (!startTime) {
        startTime = timestamp;
      }

      var progress = Math.min((timestamp - startTime) / duration, 1);
      var current = Math.round(start + (total - start) * easeOutCubic(progress));

      element.textContent = current.toLocaleString("de-DE");

      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    }

    requestAnimationFrame(tick);
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

    var visitorLabels = { de: "Besucher", en: "Visitors", ar: "زائر" };
    var headerTexts = {
      de: 'Sauber Plus · <span style="color:var(--green);font-weight:700">www.SauberPlus.plus</span>',
      en: 'Sauber Plus · <span style="color:var(--green);font-weight:700">www.SauberPlus.plus</span>',
      ar: 'سوبر بلس · <span style="color:var(--green);font-weight:700">www.SauberPlus.plus</span>'
    };
    var placeholders = {
      de: ["Max Mustermann", "+49 ...", "Ihre Nachricht hier..."],
      en: ["John Smith", "+49 ...", "Your message here..."],
      ar: ["الاسم الكامل", "+49 ...", "اكتب رسالتك هنا..."]
    };
    var languagePlaceholders = placeholders[language] || placeholders.de;
    var languageBarText = getElement("lb-text");
    var navButton = document.querySelector(".nav-cta");
    var currentLabel = getElement("currentLangLabel");

    setText(getElement("v-label"), visitorLabels[language] || visitorLabels.de);
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
      ["c1", 5, 300],
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

  function markInvalidField(field) {
    if (!field) return;

    field.style.borderColor = "#ff6b6b";
    setTimeout(function () {
      field.style.borderColor = "";
    }, 2500);
  }

  function doSend() {
    var nameInput = getElement("f-name");
    var phoneInput = getElement("f-tel");
    var messageInput = getElement("f-msg");
    var serviceSelect = getElement("f-srv");
    var requiredFields = [nameInput, phoneInput, messageInput];
    var isValid = true;

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
      labels.name + ": " + nameInput.value.trim(),
      labels.phone + ": " + phoneInput.value.trim(),
      labels.service + ": " + selectedService
    ];

    if (formType === "praise") {
      messageLines.push(labels.rating + ": " + starRating + "/5");
    }

    messageLines.push(labels.message + ": " + messageInput.value.trim());

    var message = messageLines.join("\n");
    var emailBody = [
      "SauberPlus",
      labels.type + ": " + typeLabel,
      labels.name + ": " + nameInput.value.trim(),
      labels.phone + ": " + phoneInput.value.trim(),
      labels.service + ": " + selectedService,
      formType === "praise" ? labels.rating + ": " + starRating + "/5" : "",
      "",
      labels.message + ":",
      messageInput.value.trim(),
      "",
      "---",
      "Gesendet über www.SauberPlus.plus"
    ].join("\n");
    var whatsappUrl = "https://wa.me/4915210316162?text=" + encodeURIComponent(message);
    var mailUrl = "mailto:SauberPlus1@gmail.com?subject=" + encodeURIComponent("[SauberPlus] " + typeLabel + " - " + nameInput.value.trim()) + "&body=" + encodeURIComponent(emailBody);

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
