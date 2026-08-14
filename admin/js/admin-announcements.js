/**
 * Announcements page: list + filter, create/edit modal (with image upload,
 * live preview), publish/draft/hide, delete. Covers every placement listed
 * in the brief (top bar, homepage banner, promo section, popup, seasonal)
 * through the one unified `announcements` table/editor — see schema.sql's
 * header comment for why they're not split into separate tables.
 */
(function () {
  "use strict";

  function getElement(id) {
    return document.getElementById(id);
  }

  var t = window.AdminI18N.t;

  var state = {
    client: null,
    profile: null,
    all: [],
    placementFilter: "",
    statusFilter: "",
    editingRecord: null,
    pendingImageFile: null,
    imageRemoved: false
  };

  function translatedError(key, germanFallback, arabicFallback) {
    var translated = t(key);
    if (translated !== key) {
      return translated;
    }
    return window.AdminI18N.getLang() === "ar" ? arabicFallback : germanFallback;
  }

  // ---------------------------------------------------------------
  // Loading + rendering the list
  // ---------------------------------------------------------------

  function loadAnnouncements() {
    return state.client
      .from("announcements")
      .select("*")
      .order("created_at", { ascending: false })
      .then(function (result) {
        if (result.error) {
          throw result.error;
        }
        state.all = result.data;
        renderList();
      });
  }

  function filteredAnnouncements() {
    return state.all.filter(function (row) {
      var matchesPlacement = !state.placementFilter || row.placement === state.placementFilter;
      var matchesStatus = !state.statusFilter || row.status === state.statusFilter;
      return matchesPlacement && matchesStatus;
    });
  }

  function formatDate(value) {
    if (!value) {
      return null;
    }
    var locale = window.AdminI18N.getLang() === "ar" ? "ar" : "de-DE";
    return new Date(value).toLocaleString(locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function dateRangeLabel(row) {
    var start = formatDate(row.start_date);
    var end = formatDate(row.end_date);
    if (!start && !end) {
      return t("announcements.noDateRange");
    }
    return (start || "…") + " – " + (end || "…");
  }

  /**
   * Display-only status derivation — never written back to the database.
   * The stored `status` stays exactly draft/active/hidden as designed; this
   * only decides which badge/label an "active" row shows, based on its own
   * start/end dates, so partners see "Scheduled"/"Expired" instead of a
   * misleading "Active" for a not-yet-started or already-finished item.
   */
  function getDisplayStatus(row) {
    if (row.status !== "active") {
      return row.status;
    }
    var now = Date.now();
    if (row.start_date && new Date(row.start_date).getTime() > now) {
      return "scheduled";
    }
    if (row.end_date && new Date(row.end_date).getTime() < now) {
      return "expired";
    }
    return "active";
  }

  function escapeHtml(value) {
    var div = document.createElement("div");
    div.textContent = value || "";
    return div.innerHTML;
  }

  function cardMedia(row) {
    if (row.image_path) {
      var url = window.AdminImageUpload.getPublicUrl(row.image_path);
      return '<div class="admin-item-card-media"><img src="' + url + '" alt="" loading="lazy"></div>';
    }
    return (
      '<div class="admin-item-card-media"><span class="admin-nav-ico" style="width:40px;height:40px;border-radius:12px" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24"><path d="M4 10v4a2 2 0 0 0 2 2h1l9 5V3l-9 5H6a2 2 0 0 0-2 2z"></path><path d="M18 9a4 4 0 0 1 0 6"></path></svg>' +
      "</span></div>"
    );
  }

  function renderCard(row) {
    var canToggleVisibility = row.status === "active" || row.status === "hidden";
    var displayStatus = getDisplayStatus(row);
    var toggleIcon =
      row.status === "hidden"
        ? '<svg viewBox="0 0 24 24"><path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12z"></path><circle cx="12" cy="12" r="3"></circle></svg>'
        : '<svg viewBox="0 0 24 24"><path d="M3 3l18 18"></path><path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c7 0 10.5 7 10.5 7a13.2 13.2 0 0 1-3.1 3.9M6.5 6.6C3.5 8.5 1.5 12 1.5 12s3.5 7 10.5 7a10.4 10.4 0 0 0 4.2-.9"></path><path d="M9.5 9.8a3 3 0 0 0 4.2 4.2"></path></svg>';

    return (
      '<div class="admin-item-card" data-id="' +
      row.id +
      '">' +
      cardMedia(row) +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">' +
      '<span class="admin-badge" data-status="' +
      displayStatus +
      '">' +
      t("status." + displayStatus) +
      "</span>" +
      '<span style="font-size:11px;color:var(--gray)">' +
      t("announcements.placement." + row.placement) +
      "</span>" +
      "</div>" +
      '<h3 class="admin-item-card-title">' +
      escapeHtml(row.title) +
      "</h3>" +
      '<p class="admin-item-card-desc">' +
      escapeHtml(row.description || t("announcements.noDescription")) +
      "</p>" +
      '<div class="admin-item-card-meta"><span>' +
      dateRangeLabel(row) +
      "</span></div>" +
      '<div class="announcement-card-flags">' +
      (row.discount_percentage !== null && row.discount_percentage !== undefined
        ? '<span>−' + escapeHtml(String(row.discount_percentage)) + "%</span>"
        : "") +
      (row.countdown_enabled ? '<span>Countdown</span>' : "") +
      (row.auto_hide_after_end ? '<span>Auto-Hide</span>' : "") +
      "</div>" +
      '<div class="admin-item-card-actions">' +
      '<button type="button" class="admin-icon-btn" data-action="edit" aria-label="' +
      t("common.edit") +
      '"><svg viewBox="0 0 24 24"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path></svg></button>' +
      (canToggleVisibility
        ? '<button type="button" class="admin-icon-btn" data-action="toggle-visibility" aria-label="' +
          t("common.toggleVisibility") +
          '">' +
          toggleIcon +
          "</button>"
        : "") +
      '<button type="button" class="admin-icon-btn danger" data-action="delete" aria-label="' +
      t("common.delete") +
      '"><svg viewBox="0 0 24 24"><path d="M4 7h16"></path><path d="M9 7V4h6v3"></path><path d="M6 7l1 13h10l1-13"></path></svg></button>' +
      "</div>" +
      "</div>"
    );
  }

  function renderList() {
    var container = getElement("listContainer");
    var rows = filteredAnnouncements();

    if (rows.length === 0) {
      container.innerHTML = '<div class="admin-empty-state">' + escapeHtml(t("announcements.emptyState")) + "</div>";
      return;
    }

    container.innerHTML = '<div class="admin-card-grid">' + rows.map(renderCard).join("") + "</div>";

    container.querySelectorAll("[data-action]").forEach(function (button) {
      var card = button.closest("[data-id]");
      var record = state.all.filter(function (row) {
        return row.id === card.getAttribute("data-id");
      })[0];

      button.addEventListener("click", function () {
        var action = button.getAttribute("data-action");
        if (action === "edit") {
          openEditor(record);
        } else if (action === "delete") {
          handleDelete(record);
        } else if (action === "toggle-visibility") {
          handleToggleVisibility(record);
        }
      });
    });
  }

  function initTabs(containerId, filterKey, attr) {
    var container = getElement(containerId);
    container.querySelectorAll(".admin-tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        container.querySelectorAll(".admin-tab").forEach(function (other) {
          other.classList.remove("active");
        });
        tab.classList.add("active");
        state[filterKey] = tab.getAttribute(attr) || "";
        renderList();
      });
    });
  }

  // ---------------------------------------------------------------
  // Editor modal
  // ---------------------------------------------------------------

  function resetEditorState() {
    state.editingRecord = null;
    state.pendingImageFile = null;
    state.imageRemoved = false;
  }

  function toLocalDateTimeParts(isoString) {
    if (!isoString) {
      return { date: "", time: "" };
    }
    var date = new Date(isoString);
    var offset = date.getTimezoneOffset();
    var local = new Date(date.getTime() - offset * 60000);
    var value = local.toISOString();
    return { date: value.slice(0, 10), time: value.slice(11, 16) };
  }

  function localDateTimeToIso(dateId, timeId) {
    var dateValue = getElement(dateId).value;
    var timeValue = getElement(timeId).value;
    if (!dateValue && !timeValue) {
      return null;
    }
    if (!dateValue || !timeValue) {
      throw new Error(translatedError("announcements.errors.dateTimeIncomplete", "Bitte Datum und Uhrzeit vollständig eingeben.", "يرجى إدخال التاريخ والوقت معًا."));
    }
    var localDate = new Date(dateValue + "T" + timeValue);
    if (Number.isNaN(localDate.getTime())) {
      throw new Error(translatedError("announcements.errors.dateTimeInvalid", "Datum oder Uhrzeit ist ungültig.", "التاريخ أو الوقت غير صالح."));
    }
    return localDate.toISOString();
  }

  function openEditor(record) {
    resetEditorState();
    state.editingRecord = record || null;

    getElement("editorTitle").textContent = record ? t("announcements.editorTitleEdit") : t("announcements.editorTitleNew");
    getElement("editorForm").reset();
    hideEditorError();

    getElement("fieldTitle").value = record ? record.title : "";
    getElement("fieldDescription").value = record ? record.description || "" : "";
    getElement("fieldPlacement").value = record ? record.placement : "top_bar";
    getElement("fieldStatus").value = record ? record.status : "draft";
    getElement("fieldButtonLabel").value = record ? record.button_label || "" : "";
    getElement("fieldButtonUrl").value = record ? record.button_url || "" : "";
    var startParts = toLocalDateTimeParts(record && record.start_date);
    var endParts = toLocalDateTimeParts(record && record.end_date);
    getElement("fieldStartDate").value = startParts.date;
    getElement("fieldStartTime").value = startParts.time;
    getElement("fieldEndDate").value = endParts.date;
    getElement("fieldEndTime").value = endParts.time;
    getElement("fieldCountdownEnabled").checked = Boolean(record && record.countdown_enabled);
    getElement("fieldAutoHideAfterEnd").checked = record ? record.auto_hide_after_end !== false : true;
    getElement("fieldDiscountPercentage").value =
      record && record.discount_percentage !== null && record.discount_percentage !== undefined
        ? String(record.discount_percentage)
        : "";
    getElement("fieldCampaignLabel").value = record ? record.campaign_label || "" : "";

    setDropzoneImage(record && record.image_path ? window.AdminImageUpload.getPublicUrl(record.image_path) : null);
    updatePreview();

    window.AdminUI.openModal(getElement("editorScrim"));
  }

  function showEditorError(message) {
    var el = getElement("editorError");
    el.textContent = message;
    el.setAttribute("data-visible", "true");
  }

  function hideEditorError() {
    var el = getElement("editorError");
    el.setAttribute("data-visible", "false");
    el.textContent = "";
  }

  function setDropzoneImage(url) {
    var preview = getElement("dropzonePreview");
    var label = getElement("dropzoneLabel");
    var removeBtn = getElement("removeImageBtn");

    if (url) {
      preview.src = url;
      preview.setAttribute("data-visible", "true");
      label.style.display = "none";
      removeBtn.style.display = "inline-block";
    } else {
      preview.removeAttribute("src");
      preview.setAttribute("data-visible", "false");
      label.style.display = "block";
      removeBtn.style.display = "none";
    }
  }

  function initDropzone() {
    var dropzone = getElement("dropzone");
    var fileInput = getElement("fileInput");
    var removeBtn = getElement("removeImageBtn");

    dropzone.addEventListener("click", function (event) {
      if (event.target !== removeBtn) {
        fileInput.click();
      }
    });

    fileInput.addEventListener("change", function () {
      if (fileInput.files && fileInput.files[0]) {
        selectImageFile(fileInput.files[0]);
      }
    });

    ["dragover", "dragenter"].forEach(function (eventName) {
      dropzone.addEventListener(eventName, function (event) {
        event.preventDefault();
        dropzone.setAttribute("data-dragover", "true");
      });
    });
    ["dragleave", "drop"].forEach(function (eventName) {
      dropzone.addEventListener(eventName, function () {
        dropzone.setAttribute("data-dragover", "false");
      });
    });
    dropzone.addEventListener("drop", function (event) {
      event.preventDefault();
      var file = event.dataTransfer.files && event.dataTransfer.files[0];
      if (file) {
        selectImageFile(file);
      }
    });

    removeBtn.addEventListener("click", function (event) {
      event.stopPropagation();
      state.pendingImageFile = null;
      state.imageRemoved = true;
      setDropzoneImage(null);
      updatePreview();
    });
  }

  function selectImageFile(file) {
    state.pendingImageFile = file;
    state.imageRemoved = false;
    setDropzoneImage(URL.createObjectURL(file));
    updatePreview();
  }

  function updatePreview() {
    var title = getElement("fieldTitle").value.trim();
    var description = getElement("fieldDescription").value.trim();
    var buttonLabel = getElement("fieldButtonLabel").value.trim();
    var buttonUrl = getElement("fieldButtonUrl").value.trim();

    getElement("previewTitle").textContent = title || t("announcements.preview.noTitle");
    getElement("previewDesc").textContent = description || t("announcements.preview.noDescription");

    var imageWrap = getElement("previewImageWrap");
    var previewImg = getElement("previewImage");
    var dzPreview = getElement("dropzonePreview");
    if (dzPreview.getAttribute("data-visible") === "true") {
      imageWrap.style.display = "block";
      previewImg.src = dzPreview.src;
    } else {
      imageWrap.style.display = "none";
    }

    var buttonEl = getElement("previewButton");
    if (buttonLabel && buttonUrl) {
      buttonEl.textContent = buttonLabel;
      buttonEl.style.display = "inline-block";
    } else {
      buttonEl.style.display = "none";
    }
  }

  function initLivePreviewBindings() {
    ["fieldTitle", "fieldDescription", "fieldButtonLabel", "fieldButtonUrl"].forEach(function (id) {
      getElement(id).addEventListener("input", updatePreview);
    });
  }

  // ---------------------------------------------------------------
  // Save / delete / toggle
  // ---------------------------------------------------------------

  function isValidHttpUrl(value) {
    if (!value) {
      return true;
    }
    return /^https?:\/\//i.test(value);
  }

  function buildPayloadBase() {
    var discountValue = getElement("fieldDiscountPercentage").value.trim();
    return {
      title: getElement("fieldTitle").value.trim(),
      description: getElement("fieldDescription").value.trim(),
      placement: getElement("fieldPlacement").value,
      status: getElement("fieldStatus").value,
      button_label: getElement("fieldButtonLabel").value.trim() || null,
      button_url: getElement("fieldButtonUrl").value.trim() || null,
      start_date: localDateTimeToIso("fieldStartDate", "fieldStartTime"),
      end_date: localDateTimeToIso("fieldEndDate", "fieldEndTime"),
      countdown_enabled: getElement("fieldCountdownEnabled").checked,
      auto_hide_after_end: getElement("fieldAutoHideAfterEnd").checked,
      discount_percentage: discountValue === "" ? null : Number(discountValue),
      campaign_label: getElement("fieldCampaignLabel").value.trim() || null
    };
  }

  function setSaving(isSaving) {
    var btn = getElement("saveBtn");
    btn.disabled = isSaving;
    btn.setAttribute("data-loading", String(isSaving));
  }

  function handleSave(event) {
    event.preventDefault();
    hideEditorError();

    var payload;
    try {
      payload = buildPayloadBase();
    } catch (error) {
      showEditorError(error.message);
      return;
    }

    if (!payload.title) {
      showEditorError(t("announcements.errors.titleRequired"));
      return;
    }
    if (!isValidHttpUrl(payload.button_url)) {
      showEditorError(t("announcements.errors.buttonUrlInvalid"));
      return;
    }
    if (payload.button_label && !payload.button_url) {
      showEditorError(t("announcements.errors.buttonUrlMissing"));
      return;
    }
    if (payload.button_url && !payload.button_label) {
      showEditorError(t("announcements.errors.buttonLabelMissing"));
      return;
    }
    if (payload.start_date && payload.end_date && new Date(payload.end_date) <= new Date(payload.start_date)) {
      showEditorError(translatedError("announcements.errors.endAfterStart", "Die Endzeit muss nach der Startzeit liegen.", "يجب أن يكون وقت الانتهاء بعد وقت البداية."));
      return;
    }
    if (payload.countdown_enabled && !payload.end_date) {
      showEditorError(translatedError("announcements.errors.countdownEndRequired", "Für den Countdown ist eine Endzeit erforderlich.", "يرجى تحديد وقت انتهاء لتفعيل العد التنازلي."));
      return;
    }
    if (
      payload.discount_percentage !== null &&
      (!Number.isFinite(payload.discount_percentage) || payload.discount_percentage <= 0 || payload.discount_percentage > 100)
    ) {
      showEditorError(translatedError("announcements.errors.discountRange", "Der Rabatt muss größer als 0 und höchstens 100 sein.", "يجب أن تكون نسبة الخصم أكبر من 0 ولا تتجاوز 100."));
      return;
    }

    setSaving(true);

    var imageStep = Promise.resolve(null);
    var previousImagePath = state.editingRecord ? state.editingRecord.image_path : null;

    if (state.pendingImageFile) {
      imageStep = window.AdminImageUpload.uploadImage(state.pendingImageFile, "announcements");
    }

    imageStep
      .then(function (uploadResult) {
        if (uploadResult) {
          payload.image_path = uploadResult.path;
        } else if (state.imageRemoved) {
          payload.image_path = null;
        } else if (state.editingRecord) {
          payload.image_path = state.editingRecord.image_path;
        } else {
          payload.image_path = null;
        }

        if (state.editingRecord) {
          payload.updated_by = state.profile.id;
          return state.client.from("announcements").update(payload).eq("id", state.editingRecord.id);
        }

        payload.created_by = state.profile.id;
        payload.updated_by = state.profile.id;
        return state.client.from("announcements").insert(payload);
      })
      .then(function (result) {
        if (result.error) {
          throw result.error;
        }

        // Clean up the old image only after the row referencing it was
        // successfully replaced/cleared, so a failed save never orphans a
        // still-referenced file.
        var imageChanged = payload.image_path !== previousImagePath;
        if (imageChanged && previousImagePath) {
          window.AdminImageUpload.deleteImage(previousImagePath);
        }

        setSaving(false);
        window.AdminUI.closeModal(getElement("editorScrim"));
        window.AdminUI.toast(state.editingRecord ? t("announcements.saveSuccessUpdate") : t("announcements.saveSuccessCreate"), "success");
        return loadAnnouncements();
      })
      .catch(function (error) {
        setSaving(false);
        showEditorError(error && error.message ? error.message : t("common.saveFailedRetry"));
      });
  }

  function handleDelete(record) {
    window.AdminUI.confirmDialog({
      title: t("announcements.deleteConfirmTitle"),
      message: t("announcements.deleteConfirmMessage", { title: record.title }),
      confirmLabel: t("common.delete"),
      danger: true
    }).then(function (confirmed) {
      if (!confirmed) {
        return;
      }
      state.client
        .from("announcements")
        .delete()
        .eq("id", record.id)
        .then(function (result) {
          if (result.error) {
            window.AdminUI.toast(t("common.deleteFailed"), "error");
            return;
          }
          if (record.image_path) {
            window.AdminImageUpload.deleteImage(record.image_path);
          }
          window.AdminUI.toast(t("announcements.deleteSuccess"), "success");
          loadAnnouncements();
        });
    });
  }

  function handleToggleVisibility(record) {
    var nextStatus = record.status === "hidden" ? "active" : "hidden";
    state.client
      .from("announcements")
      .update({ status: nextStatus, updated_by: state.profile.id })
      .eq("id", record.id)
      .then(function (result) {
        if (result.error) {
          window.AdminUI.toast(t("common.actionFailed"), "error");
          return;
        }
        window.AdminUI.toast(nextStatus === "hidden" ? t("announcements.hiddenToast") : t("announcements.shownToast"), "success");
        loadAnnouncements();
      });
  }

  // ---------------------------------------------------------------
  // Bootstrap
  // ---------------------------------------------------------------

  window.AdminAuth.requireSession().then(function (profile) {
    if (!profile) {
      return;
    }

    state.profile = profile;
    state.client = window.AdminSupabase.getClient();

    window.AdminUI.applyRoleGatedNav(profile.role);
    getElement("topbarUser").textContent = profile.email;
    getElement("adminShell").hidden = false;

    initTabs("placementTabs", "placementFilter", "data-placement");
    initTabs("statusTabs", "statusFilter", "data-status");
    initDropzone();
    initLivePreviewBindings();

    getElement("newAnnouncementBtn").addEventListener("click", function () {
      openEditor(null);
    });
    getElement("editorForm").addEventListener("submit", handleSave);

    loadAnnouncements().catch(function () {
      getElement("listContainer").innerHTML = '<div class="admin-empty-state">' + escapeHtml(t("announcements.loadError")) + "</div>";
    });
  });

  getElement("logoutBtn").addEventListener("click", function () {
    window.AdminAuth.signOut().then(function () {
      window.location.href = "index.html";
    });
  });
})();
