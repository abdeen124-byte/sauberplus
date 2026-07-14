/**
 * Gallery page: single + before/after images, drag-and-drop reorder, hide/
 * unhide, replace, delete. On first load (table still empty), the images
 * already hardcoded in the public index.html#gallery grid are imported
 * automatically — see importLegacyImages() below — so the CMS always
 * reflects what the public site actually shows.
 */
(function () {
  "use strict";

  function getElement(id) {
    return document.getElementById(id);
  }

  var t = window.AdminI18N.t;
  var SORT_ORDER_GAP = 1000;

  var state = {
    client: null,
    profile: null,
    all: [],
    kindFilter: "",
    editingRecord: null,
    editingKind: "single",
    pendingFiles: { single: null, before: null, after: null },
    removedExisting: { single: false, before: false, after: false },
    draggedId: null
  };

  // ---------------------------------------------------------------
  // One-time import of the images already hardcoded on the public site
  // (see index.html#gallery). Only runs when this table is still empty,
  // so it never fights with staff who've since edited/deleted rows.
  // ---------------------------------------------------------------

  var LEGACY_IMAGES = [
    { kind: "single", src: "/assets/images/before-after/5372830450818161500_121.jpg", caption: "Reinigungsergebnis 1" },
    { kind: "single", src: "/assets/images/before-after/5372830450818161501_121.jpg", caption: "Reinigungsergebnis 2" },
    { kind: "single", src: "/assets/images/before-after/5372830450818161502_121.jpg", caption: "Reinigungsergebnis 3" },
    { kind: "single", src: "/assets/images/before-after/5372830450818161503_121.jpg", caption: "Reinigungsergebnis 4" },
    {
      kind: "before_after",
      before: "/assets/images/before-after/additional/faucet-before.jpg",
      after: "/assets/images/before-after/additional/faucet-after.jpg",
      caption: "Wasserhahn Reinigung"
    },
    {
      kind: "before_after",
      before: "/assets/images/before-after/additional/oven-01-before.jpg",
      after: "/assets/images/before-after/additional/oven-01-after.jpg",
      caption: "Backofen Reinigung 1"
    },
    {
      kind: "before_after",
      before: "/assets/images/before-after/additional/oven-02-before.jpg",
      after: "/assets/images/before-after/additional/oven-02-after.jpg",
      caption: "Backofen Reinigung 2"
    }
  ];

  function fetchAsFile(src) {
    return fetch(src)
      .then(function (response) {
        if (!response.ok) {
          throw new Error("fetch failed: " + src);
        }
        return response.blob();
      })
      .then(function (blob) {
        var filename = src.split("/").pop();
        return new File([blob], filename, { type: blob.type });
      });
  }

  function importLegacyEntry(entry, index) {
    var uploads;
    if (entry.kind === "before_after") {
      uploads = Promise.all([fetchAsFile(entry.before), fetchAsFile(entry.after)]).then(function (files) {
        return Promise.all([
          window.AdminImageUpload.uploadImage(files[0], "gallery"),
          window.AdminImageUpload.uploadImage(files[1], "gallery")
        ]);
      });
    } else {
      uploads = fetchAsFile(entry.src)
        .then(function (file) {
          return window.AdminImageUpload.uploadImage(file, "gallery");
        })
        .then(function (result) {
          return [result];
        });
    }

    return uploads.then(function (results) {
      var payload = {
        kind: entry.kind,
        caption: entry.caption,
        hidden: false,
        sort_order: (index + 1) * SORT_ORDER_GAP,
        created_by: state.profile.id
      };
      if (entry.kind === "before_after") {
        payload.before_path = results[0].path;
        payload.after_path = results[1].path;
      } else {
        payload.image_path = results[0].path;
      }
      return state.client
        .from("gallery_images")
        .insert(payload)
        .then(function (result) {
          if (result.error) {
            throw result.error;
          }
        });
    });
  }

  function importLegacyImages() {
    return Promise.allSettled(LEGACY_IMAGES.map(importLegacyEntry)).then(function (outcomes) {
      var failures = outcomes.filter(function (outcome) {
        return outcome.status === "rejected";
      }).length;
      if (failures > 0) {
        window.AdminUI.toast(t("gallery.legacyImportPartialError"), "error");
      } else {
        window.AdminUI.toast(t("gallery.legacyImportSuccess"), "success");
      }
      return loadImages();
    });
  }

  // ---------------------------------------------------------------
  // Loading + rendering
  // ---------------------------------------------------------------

  function loadImages() {
    return state.client
      .from("gallery_images")
      .select("*")
      .order("sort_order", { ascending: true })
      .then(function (result) {
        if (result.error) {
          throw result.error;
        }
        state.all = result.data;
        renderList();
      });
  }

  function filteredImages() {
    return state.all.filter(function (row) {
      return !state.kindFilter || row.kind === state.kindFilter;
    });
  }

  function escapeHtml(value) {
    var div = document.createElement("div");
    div.textContent = value || "";
    return div.innerHTML;
  }

  function cardMedia(row) {
    if (row.kind === "before_after") {
      var beforeUrl = window.AdminImageUpload.getPublicUrl(row.before_path);
      var afterUrl = window.AdminImageUpload.getPublicUrl(row.after_path);
      return (
        '<div class="admin-item-card-media split"><img src="' +
        beforeUrl +
        '" alt="' +
        t("gallery.field.before") +
        '" draggable="false"><img src="' +
        afterUrl +
        '" alt="' +
        t("gallery.field.after") +
        '" draggable="false"></div>'
      );
    }
    var url = window.AdminImageUpload.getPublicUrl(row.image_path);
    return '<div class="admin-item-card-media"><img src="' + url + '" alt="" draggable="false"></div>';
  }

  function basename(path) {
    return path ? path.split("/").pop() : "";
  }

  function cardFilenameLabel(row) {
    return row.kind === "before_after"
      ? basename(row.before_path) + " / " + basename(row.after_path)
      : basename(row.image_path);
  }

  function renderCard(row, index) {
    var toggleIcon = row.hidden
      ? '<svg viewBox="0 0 24 24"><path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12z"></path><circle cx="12" cy="12" r="3"></circle></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M3 3l18 18"></path><path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c7 0 10.5 7 10.5 7a13.2 13.2 0 0 1-3.1 3.9M6.5 6.6C3.5 8.5 1.5 12 1.5 12s3.5 7 10.5 7a10.4 10.4 0 0 0 4.2-.9"></path><path d="M9.5 9.8a3 3 0 0 0 4.2 4.2"></path></svg>';

    return (
      '<div class="admin-item-card" data-id="' +
      row.id +
      '" draggable="true">' +
      cardMedia(row) +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">' +
      '<span class="admin-badge" data-status="' +
      (row.hidden ? "hidden" : "active") +
      '">' +
      (row.hidden ? t("status.hidden") : t("status.visible")) +
      "</span>" +
      '<span style="font-size:11px;color:var(--gray)">' +
      (row.kind === "before_after" ? t("gallery.kind.beforeAfterLabel") : t("gallery.kind.singleLabel")) +
      "</span>" +
      "</div>" +
      '<div class="admin-item-card-meta">' +
      "<span>#" +
      (index + 1) +
      " · " +
      escapeHtml(cardFilenameLabel(row)) +
      "</span><span>" +
      t("gallery.usedOnLabel") +
      "</span></div>" +
      '<p class="admin-item-card-desc" style="min-height:16px">' +
      escapeHtml(row.caption || "") +
      "</p>" +
      '<div class="admin-item-card-actions">' +
      '<button type="button" class="admin-icon-btn" data-action="edit" aria-label="' +
      t("common.edit") +
      '"><svg viewBox="0 0 24 24"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path></svg></button>' +
      '<button type="button" class="admin-icon-btn" data-action="toggle-visibility" aria-label="' +
      t("common.toggleVisibility") +
      '">' +
      toggleIcon +
      "</button>" +
      '<button type="button" class="admin-icon-btn danger" data-action="delete" aria-label="' +
      t("common.delete") +
      '"><svg viewBox="0 0 24 24"><path d="M4 7h16"></path><path d="M9 7V4h6v3"></path><path d="M6 7l1 13h10l1-13"></path></svg></button>' +
      "</div>" +
      "</div>"
    );
  }

  function renderList() {
    var container = getElement("listContainer");
    var rows = filteredImages();

    if (rows.length === 0) {
      container.innerHTML = '<div class="admin-empty-state">' + escapeHtml(t("gallery.emptyState")) + "</div>";
      return;
    }

    container.innerHTML =
      '<div class="admin-card-grid" id="cardGrid">' +
      rows
        .map(function (row, index) {
          return renderCard(row, index);
        })
        .join("") +
      "</div>";

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

    initDragAndDrop(getElement("cardGrid"));
  }

  function initTabs() {
    var container = getElement("kindTabs");
    container.querySelectorAll(".admin-tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        container.querySelectorAll(".admin-tab").forEach(function (other) {
          other.classList.remove("active");
        });
        tab.classList.add("active");
        state.kindFilter = tab.getAttribute("data-kind") || "";
        renderList();
      });
    });
  }

  // ---------------------------------------------------------------
  // Drag-and-drop reorder (gap-based sort_order, see schema comment)
  // ---------------------------------------------------------------

  function computeNewSortOrder(orderedRows, targetIndex) {
    if (orderedRows.length === 0) {
      return SORT_ORDER_GAP;
    }
    if (targetIndex <= 0) {
      return orderedRows[0].sort_order - SORT_ORDER_GAP;
    }
    if (targetIndex >= orderedRows.length) {
      return orderedRows[orderedRows.length - 1].sort_order + SORT_ORDER_GAP;
    }
    var prev = orderedRows[targetIndex - 1].sort_order;
    var next = orderedRows[targetIndex].sort_order;
    var mid = Math.floor((prev + next) / 2);
    if (mid === prev || mid === next) {
      return null; // Not enough integer room left — caller must renumber.
    }
    return mid;
  }

  function renumberAndSave(finalOrderIds) {
    var updates = finalOrderIds.map(function (id, index) {
      return state.client
        .from("gallery_images")
        .update({ sort_order: (index + 1) * SORT_ORDER_GAP })
        .eq("id", id);
    });
    return Promise.all(updates);
  }

  function moveItem(movedId, targetIndex) {
    var currentOrder = filteredImages(); // already sorted by sort_order
    var without = currentOrder.filter(function (row) {
      return row.id !== movedId;
    });
    var newSortOrder = computeNewSortOrder(without, targetIndex);

    if (newSortOrder !== null) {
      return state.client
        .from("gallery_images")
        .update({ sort_order: newSortOrder })
        .eq("id", movedId)
        .then(function () {
          return loadImages();
        });
    }

    // Ran out of integer gap between neighbors: renumber everything in the
    // new visual order (moved item inserted at targetIndex), a rare fallback
    // rather than the normal path.
    var finalIds = without.map(function (row) {
      return row.id;
    });
    finalIds.splice(targetIndex, 0, movedId);

    return renumberAndSave(finalIds).then(function () {
      return loadImages();
    });
  }

  function initDragAndDrop(grid) {
    if (!grid) {
      return;
    }

    grid.querySelectorAll(".admin-item-card").forEach(function (card) {
      card.addEventListener("dragstart", function () {
        state.draggedId = card.getAttribute("data-id");
        window.setTimeout(function () {
          card.style.opacity = "0.4";
        }, 0);
      });
      card.addEventListener("dragend", function () {
        card.style.opacity = "";
        state.draggedId = null;
      });
    });

    grid.addEventListener("dragover", function (event) {
      event.preventDefault();
    });

    grid.addEventListener("drop", function (event) {
      event.preventDefault();
      if (!state.draggedId) {
        return;
      }

      var targetCard = event.target.closest ? event.target.closest(".admin-item-card") : null;
      var cards = Array.prototype.slice.call(grid.querySelectorAll(".admin-item-card"));
      var visibleIds = cards.map(function (c) {
        return c.getAttribute("data-id");
      });

      var targetIndex = visibleIds.length;
      if (targetCard) {
        var rect = targetCard.getBoundingClientRect();
        var isAfter = event.clientY > rect.top + rect.height / 2;
        var targetCardIndex = visibleIds.indexOf(targetCard.getAttribute("data-id"));
        targetIndex = isAfter ? targetCardIndex + 1 : targetCardIndex;
      }

      var draggedId = state.draggedId;
      var draggedCurrentIndex = visibleIds.indexOf(draggedId);
      if (draggedCurrentIndex !== -1 && draggedCurrentIndex < targetIndex) {
        targetIndex -= 1; // account for removing the dragged card from its old spot
      }

      moveItem(draggedId, targetIndex);
    });
  }

  // ---------------------------------------------------------------
  // Editor modal (single or before/after, add or replace)
  // ---------------------------------------------------------------

  function resetEditorState(kind) {
    state.editingRecord = null;
    state.editingKind = kind;
    state.pendingFiles = { single: null, before: null, after: null };
    state.removedExisting = { single: false, before: false, after: false };
  }

  function setDropzonePreview(key, url) {
    var preview = document.querySelector('[data-preview="' + key + '"]');
    var label = document.querySelector('[data-label="' + key + '"]');
    if (url) {
      preview.src = url;
      preview.setAttribute("data-visible", "true");
      label.style.display = "none";
    } else {
      preview.removeAttribute("src");
      preview.setAttribute("data-visible", "false");
      label.style.display = "block";
    }
  }

  function openEditor(record) {
    var kind = record ? record.kind : state.editingKind;
    resetEditorState(kind);
    state.editingRecord = record || null;

    getElement("editorTitle").textContent = record
      ? t("gallery.editTitle")
      : kind === "before_after"
      ? t("gallery.addPairTitle")
      : t("gallery.addSingleTitle");
    getElement("editorForm").reset();
    hideEditorError();

    getElement("fieldCaption").value = record ? record.caption || "" : "";
    getElement("fieldHidden").checked = record ? Boolean(record.hidden) : false;

    var isPair = kind === "before_after";
    getElement("singleDropzoneGroup").style.display = isPair ? "none" : "block";
    getElement("pairDropzoneGroup").style.display = isPair ? "grid" : "none";

    setDropzonePreview("single", record && kind === "single" ? window.AdminImageUpload.getPublicUrl(record.image_path) : null);
    setDropzonePreview("before", record && kind === "before_after" ? window.AdminImageUpload.getPublicUrl(record.before_path) : null);
    setDropzonePreview("after", record && kind === "before_after" ? window.AdminImageUpload.getPublicUrl(record.after_path) : null);

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

  function initDropzone(key) {
    var dropzone = document.querySelector('[data-dropzone="' + key + '"]');
    var fileInput = document.querySelector('[data-file-input="' + key + '"]');

    dropzone.addEventListener("click", function () {
      fileInput.click();
    });

    fileInput.addEventListener("change", function () {
      if (fileInput.files && fileInput.files[0]) {
        selectFile(key, fileInput.files[0]);
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
        selectFile(key, file);
      }
    });
  }

  function selectFile(key, file) {
    state.pendingFiles[key] = file;
    state.removedExisting[key] = false;
    setDropzonePreview(key, URL.createObjectURL(file));
  }

  // ---------------------------------------------------------------
  // Save / delete / toggle
  // ---------------------------------------------------------------

  function setSaving(isSaving) {
    var btn = getElement("saveBtn");
    btn.disabled = isSaving;
    btn.setAttribute("data-loading", String(isSaving));
  }

  function handleSave(event) {
    event.preventDefault();
    hideEditorError();

    var isPair = state.editingKind === "before_after";
    var isNew = !state.editingRecord;

    if (isPair) {
      var needsBefore = isNew && !state.pendingFiles.before;
      var needsAfter = isNew && !state.pendingFiles.after;
      if (needsBefore || needsAfter) {
        showEditorError(t("gallery.errors.needBothImages"));
        return;
      }
    } else if (isNew && !state.pendingFiles.single) {
      showEditorError(t("gallery.errors.needImage"));
      return;
    }

    setSaving(true);

    var uploadSteps = [];
    if (isPair) {
      uploadSteps.push(
        state.pendingFiles.before
          ? window.AdminImageUpload.uploadImage(state.pendingFiles.before, "gallery")
          : Promise.resolve(null)
      );
      uploadSteps.push(
        state.pendingFiles.after
          ? window.AdminImageUpload.uploadImage(state.pendingFiles.after, "gallery")
          : Promise.resolve(null)
      );
    } else {
      uploadSteps.push(
        state.pendingFiles.single ? window.AdminImageUpload.uploadImage(state.pendingFiles.single, "gallery") : Promise.resolve(null)
      );
    }

    Promise.all(uploadSteps)
      .then(function (results) {
        var payload = {
          kind: state.editingKind,
          caption: getElement("fieldCaption").value.trim() || null,
          hidden: getElement("fieldHidden").checked
        };

        var oldPathsToDelete = [];

        if (isPair) {
          var beforeUpload = results[0];
          var afterUpload = results[1];
          payload.before_path = beforeUpload ? beforeUpload.path : state.editingRecord.before_path;
          payload.after_path = afterUpload ? afterUpload.path : state.editingRecord.after_path;
          if (beforeUpload && state.editingRecord) oldPathsToDelete.push(state.editingRecord.before_path);
          if (afterUpload && state.editingRecord) oldPathsToDelete.push(state.editingRecord.after_path);
        } else {
          var singleUpload = results[0];
          payload.image_path = singleUpload ? singleUpload.path : state.editingRecord.image_path;
          if (singleUpload && state.editingRecord) oldPathsToDelete.push(state.editingRecord.image_path);
        }

        var dbCall;
        if (state.editingRecord) {
          dbCall = state.client.from("gallery_images").update(payload).eq("id", state.editingRecord.id);
        } else {
          payload.sort_order = (state.all.length + 1) * SORT_ORDER_GAP;
          payload.created_by = state.profile.id;
          dbCall = state.client.from("gallery_images").insert(payload);
        }

        return dbCall.then(function (result) {
          if (result.error) {
            throw result.error;
          }
          oldPathsToDelete.forEach(function (path) {
            window.AdminImageUpload.deleteImage(path);
          });
          return null;
        });
      })
      .then(function () {
        setSaving(false);
        window.AdminUI.closeModal(getElement("editorScrim"));
        window.AdminUI.toast(state.editingRecord ? t("gallery.saveSuccessUpdate") : t("gallery.saveSuccessCreate"), "success");
        return loadImages();
      })
      .catch(function (error) {
        setSaving(false);
        showEditorError(error && error.message ? error.message : t("common.saveFailedRetry"));
      });
  }

  function handleDelete(record) {
    window.AdminUI.confirmDialog({
      title: t("gallery.deleteConfirmTitle"),
      message: t("gallery.deleteConfirmMessage"),
      confirmLabel: t("common.delete"),
      danger: true
    }).then(function (confirmed) {
      if (!confirmed) {
        return;
      }
      state.client
        .from("gallery_images")
        .delete()
        .eq("id", record.id)
        .then(function (result) {
          if (result.error) {
            window.AdminUI.toast(t("common.deleteFailed"), "error");
            return;
          }
          if (record.kind === "before_after") {
            window.AdminImageUpload.deleteImage(record.before_path);
            window.AdminImageUpload.deleteImage(record.after_path);
          } else {
            window.AdminImageUpload.deleteImage(record.image_path);
          }
          window.AdminUI.toast(t("gallery.deleteSuccess"), "success");
          loadImages();
        });
    });
  }

  function handleToggleVisibility(record) {
    state.client
      .from("gallery_images")
      .update({ hidden: !record.hidden })
      .eq("id", record.id)
      .then(function (result) {
        if (result.error) {
          window.AdminUI.toast(t("common.actionFailed"), "error");
          return;
        }
        window.AdminUI.toast(record.hidden ? t("announcements.shownToast") : t("announcements.hiddenToast"), "success");
        loadImages();
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

    initTabs();
    initDropzone("single");
    initDropzone("before");
    initDropzone("after");

    getElement("newSingleBtn").addEventListener("click", function () {
      resetEditorState("single");
      openEditor(null);
    });
    getElement("newPairBtn").addEventListener("click", function () {
      resetEditorState("before_after");
      openEditor(null);
    });
    getElement("editorForm").addEventListener("submit", handleSave);

    loadImages()
      .then(function () {
        if (state.all.length === 0) {
          window.AdminUI.toast(t("gallery.legacyImportRunning"), "success");
          return importLegacyImages();
        }
      })
      .catch(function () {
        getElement("listContainer").innerHTML = '<div class="admin-empty-state">' + escapeHtml(t("gallery.loadError")) + "</div>";
      });
  });

  getElement("logoutBtn").addEventListener("click", function () {
    window.AdminAuth.signOut().then(function () {
      window.location.href = "index.html";
    });
  });
})();
