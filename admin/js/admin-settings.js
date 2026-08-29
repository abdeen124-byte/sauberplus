/**
 * Settings (Super Admin only): export/import backup for content tables
 * only. Accounts are deliberately excluded from both directions — see
 * docs/admin-cms-setup.md — this is a content-recovery tool, not account
 * disaster-recovery, and Supabase's free tier has no automatic backups at
 * all, so this is the only backup mechanism available unless upgraded.
 */
(function () {
  "use strict";

  function getElement(id) {
    return document.getElementById(id);
  }

  var t = window.AdminI18N.t;

  var state = {
    client: null,
    profile: null
  };

  var invoiceSettingsFields = {
    legal_name: "settingsLegalName",
    street_address: "settingsStreet",
    postal_code: "settingsPostalCode",
    city: "settingsCity",
    phone: "settingsPhone",
    email: "settingsEmail",
    website: "settingsWebsite",
    tax_number: "settingsTaxNumber",
    account_holder: "settingsAccountHolder",
    iban: "settingsIban",
    default_payment_terms: "settingsPaymentTerms",
    invoice_prefix: "settingsPrefix"
  };

  function showMessage(elementId, message) {
    var el = getElement(elementId);
    el.textContent = message;
    el.setAttribute("data-visible", "true");
  }

  function hideMessages() {
    ["importError", "importSuccess"].forEach(function (id) {
      var el = getElement(id);
      el.setAttribute("data-visible", "false");
      el.textContent = "";
    });
  }

  function setInvoiceSettingsMessage(kind, message) {
    var error = getElement("invoiceSettingsError");
    var success = getElement("invoiceSettingsSuccess");
    error.setAttribute("data-visible", "false");
    success.setAttribute("data-visible", "false");
    var target = kind === "success" ? success : error;
    target.textContent = message;
    target.setAttribute("data-visible", "true");
  }

  function populateInvoiceSettings(settings) {
    Object.keys(invoiceSettingsFields).forEach(function (key) {
      getElement(invoiceSettingsFields[key]).value = settings && settings[key] || (key === "invoice_prefix" ? "SP" : "");
    });
    getElement("settingsVat").value = ((settings && settings.default_vat_bps || 1900) / 100).toFixed(2).replace(".", ",");
    if (!getElement("settingsPaymentTerms").value) {
      getElement("settingsPaymentTerms").value = "zahlbar nach Erhalt";
    }
  }

  function parseVatBasisPoints(value) {
    var text = String(value || "").trim();
    if (!/^\d+(?:[,.]\d{1,2})?$/.test(text)) {
      throw new Error(t("settings.invoiceSettingsInvalid"));
    }
    var parts = text.replace(",", ".").split(".");
    var bps = Number(parts[0]) * 100 + Number((parts[1] || "").padEnd(2, "0"));
    if (!Number.isInteger(bps) || bps < 0 || bps > 10000) {
      throw new Error(t("settings.invoiceSettingsInvalid"));
    }
    return bps;
  }

  async function loadInvoiceSettings() {
    var result = await state.client.from("invoice_settings").select("*").eq("singleton", true).maybeSingle();
    if (result.error) {
      return false;
    }
    populateInvoiceSettings(result.data);
    getElement("invoiceSettingsCard").hidden = false;
    return true;
  }

  async function saveInvoiceSettings(event) {
    event.preventDefault();
    var button = getElement("saveInvoiceSettingsBtn");
    button.disabled = true;
    button.classList.add("loading");
    try {
      var payload = {};
      Object.keys(invoiceSettingsFields).forEach(function (key) {
        payload[key] = getElement(invoiceSettingsFields[key]).value.trim();
      });
      payload.default_vat_bps = parseVatBasisPoints(getElement("settingsVat").value);
      var result = await state.client.rpc("save_invoice_settings", { p_settings: payload });
      if (result.error) {
        throw result.error;
      }
      populateInvoiceSettings(result.data);
      setInvoiceSettingsMessage("success", t("settings.invoiceSettingsSaved"));
      window.AdminUI.toast(t("settings.invoiceSettingsSaved"), "success");
    } catch (error) {
      setInvoiceSettingsMessage("error", error && error.message ? error.message : t("settings.invoiceSettingsSaveFailed"));
    } finally {
      button.disabled = false;
      button.classList.remove("loading");
    }
  }

  // ---------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------

  function handleExport() {
    Promise.all([
      state.client.from("announcements").select("*"),
      state.client.from("gallery_images").select("*")
    ])
      .then(function (results) {
        if (results[0].error || results[1].error) {
          throw new Error("export failed");
        }

        var payload = {
          exportedAt: new Date().toISOString(),
          exportedBy: state.profile.email,
          announcements: results[0].data,
          gallery_images: results[1].data
        };

        var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        var url = URL.createObjectURL(blob);
        var link = document.createElement("a");
        link.href = url;
        link.download = "sauberplus-cms-backup-" + new Date().toISOString().slice(0, 10) + ".json";
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);

        return state.client.rpc("log_activity", {
          p_action: "export",
          p_entity_type: "backup",
          p_entity_id: null,
          p_new_value: {
            announcements: results[0].data.length,
            gallery_images: results[1].data.length
          }
        });
      })
      .then(function () {
        window.AdminUI.toast(t("settings.exportSuccess"), "success");
      })
      .catch(function () {
        window.AdminUI.toast(t("settings.exportFailed"), "error");
      });
  }

  // ---------------------------------------------------------------
  // Import
  // ---------------------------------------------------------------

  // Strips fields that must not be blindly restored: ids get fresh values on
  // insert (avoids clobbering current live data if an id happens to already
  // exist), and creator/updater are reassigned to whoever is running the
  // import right now rather than trusting stale values from the export.
  function sanitizeForImport(rows) {
    return rows.map(function (row) {
      var clone = Object.assign({}, row);
      delete clone.id;
      delete clone.created_at;
      delete clone.updated_at;
      clone.created_by = state.profile.id;
      if ("updated_by" in clone) {
        clone.updated_by = state.profile.id;
      }
      return clone;
    });
  }

  function validateBackupShape(data) {
    return data && Array.isArray(data.announcements) && Array.isArray(data.gallery_images);
  }

  function performImport(data) {
    var announcementRows = sanitizeForImport(data.announcements);
    var galleryRows = sanitizeForImport(data.gallery_images);

    var insertSteps = [];
    if (announcementRows.length) {
      insertSteps.push(state.client.from("announcements").insert(announcementRows));
    }
    if (galleryRows.length) {
      insertSteps.push(state.client.from("gallery_images").insert(galleryRows));
    }

    return Promise.all(insertSteps)
      .then(function (results) {
        var failed = results.filter(function (result) {
          return result.error;
        });
        if (failed.length) {
          throw new Error("import failed");
        }

        return state.client.rpc("log_activity", {
          p_action: "import",
          p_entity_type: "backup",
          p_entity_id: null,
          p_new_value: { announcements: announcementRows.length, gallery_images: galleryRows.length }
        });
      })
      .then(function () {
        showMessage(
          "importSuccess",
          t("settings.importResultMessage", { count1: announcementRows.length, count2: galleryRows.length })
        );
        window.AdminUI.toast(t("settings.importSuccess"), "success");
      });
  }

  function handleFileSelected(file) {
    hideMessages();

    file
      .text()
      .then(function (text) {
        var data;
        try {
          data = JSON.parse(text);
        } catch (error) {
          throw new Error(t("settings.invalidJson"));
        }

        if (!validateBackupShape(data)) {
          throw new Error(t("settings.notABackupFile"));
        }

        return window.AdminUI.confirmDialog({
          title: t("settings.importConfirmTitle"),
          message: t("settings.importConfirmMessage", {
            count1: data.announcements.length,
            count2: data.gallery_images.length
          })
        }).then(function (confirmed) {
          if (!confirmed) {
            return;
          }
          return performImport(data);
        });
      })
      .catch(function (error) {
        showMessage("importError", error && error.message ? error.message : t("settings.importFailed"));
      });
  }

  window.AdminAuth.requireSession().then(function (profile) {
    if (!profile) {
      return;
    }

    window.AdminUI.applyRoleGatedNav(profile.role);
    getElement("topbarUser").textContent = profile.email;
    getElement("adminShell").hidden = false;

    if (profile.role !== "super_admin") {
      document.querySelector(".admin-main").innerHTML = '<div class="admin-empty-state">' + t("common.noAccess") + "</div>";
      return;
    }

    state.profile = profile;
    state.client = window.AdminSupabase.getClient();

    loadInvoiceSettings().then(function (available) {
      if (available) {
        getElement("invoiceSettingsForm").addEventListener("submit", saveInvoiceSettings);
      }
    });

    getElement("exportBtn").addEventListener("click", handleExport);

    var fileInput = getElement("importFile");
    getElement("importBtn").addEventListener("click", function () {
      fileInput.click();
    });
    fileInput.addEventListener("change", function () {
      if (fileInput.files && fileInput.files[0]) {
        handleFileSelected(fileInput.files[0]);
        fileInput.value = "";
      }
    });
  });

  getElement("logoutBtn").addEventListener("click", function () {
    window.AdminAuth.signOut().then(function () {
      window.location.href = "index.html";
    });
  });
})();
