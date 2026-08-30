/**
 * SauberPlus Admin — DE/AR localization engine.
 *
 * Loaded in <head> (blocking, before <body> is parsed) so `dir`/`lang` on
 * <html> are correct before anything paints — avoids a flash of the wrong
 * direction/font. The dictionary walk of the DOM (`applyStaticTranslations`)
 * still has to wait for DOMContentLoaded since the body doesn't exist yet
 * when this script runs; it's wired up automatically at the bottom of this
 * file, so no other page needs to call it.
 *
 * Switching language reloads the page rather than hot-swapping in place.
 * Every admin page loads its data async and renders it via string-built
 * markup; re-translating already-rendered DOM nodes in place would mean
 * re-running that same render pipeline anyway, so a reload is simpler and
 * cannot leave the page half-translated. Dynamic content (toasts, rendered
 * cards, confirm dialogs, etc.) just needs to call `AdminI18N.t(...)` at
 * render time — since render always happens fresh after a reload, it's
 * automatically in the right language.
 */
(function () {
  "use strict";

  var STORAGE_KEY = "sp_admin_lang";
  var DEFAULT_LANG = "de";

  var DICT = {
    de: {
      common: {
        logout: "Abmelden",
        save: "Speichern",
        cancel: "Abbrechen",
        delete: "Löschen",
        edit: "Bearbeiten",
        close: "Schließen",
        confirm: "Bestätigen",
        pleaseConfirm: "Bitte bestätigen",
        loading: "Wird geladen …",
        actionFailed: "Aktion fehlgeschlagen.",
        saveFailedRetry: "Speichern fehlgeschlagen. Bitte erneut versuchen.",
        connectionError: "Verbindung zum Server nicht möglich. Bitte versuchen Sie es erneut.",
        system: "System",
        you: "(Sie)",
        emailLabel: "E-Mail-Adresse",
        passwordLabel: "Passwort",
        allStatuses: "Alle Status",
        noAccess: "Kein Zugriff.",
        deleteFailed: "Löschen fehlgeschlagen.",
        menuOpen: "Menü öffnen",
        languageSwitcher: "Sprache wechseln",
        toggleVisibility: "Sichtbarkeit umschalten"
      },
      nav: {
        dashboard: "Übersicht",
        announcements: "Ankündigungen",
        gallery: "Galerie",
        management: "Verwaltung",
        users: "Team",
        timeTracking: "Mitarbeiter & Zeiterfassung",
        activityLog: "Aktivitätsprotokoll",
        invoices: "Rechnungen",
        expenses: "Ausgaben",
        settings: "Einstellungen"
      },
      expenses: {
        kicker: "FINANZEN", title: "Ausgaben", subtitle: "Digitales Kassenbuch, Belege und Partner-Auslagen.", add: "+ Beleg erfassen",
        overview: "Übersicht", partners: "Gesellschafter", ledger: "Ausgabenjournal", search: "Lieferant oder Nummer", income: "Einnahmen",
        outgoing: "Ausgaben", result: "Ergebnis", openAdvances: "Offene Partner-Auslagen", entries: "Einträge", empty: "Keine Ausgaben gefunden.",
        number: "Interne Nummer", status: "Status", receipt: "Beleg", finalize: "Als bezahlt buchen", finalized: "Entwurf wurde gebucht.", cancel: "Stornieren", cancelTitle: "Ausgabe stornieren", cancelMessage: "Die Ausgabe bleibt revisionssicher gespeichert.", cancelled: "Ausgabe storniert.", contributions: "Einzahlungen", reimbursements: "Erstattungen"
      },
      expenseEditor: {
        back: "← Ausgaben", kicker: "SCHNELLERFASSUNG", title: "Beleg erfassen", subtitle: "Foto hochladen, Angaben prüfen, speichern.",
        stepScan: "Beleg", stepExtract: "Auslesen", stepReview: "Prüfen", stepSave: "Speichern", capture: "Beleg fotografieren oder auswählen",
        fileHint: "JPG, PNG, WebP oder PDF · max. 10 MB", privacy: "Der Beleg wird privat archiviert. Bilder werden lokal auf dem SauberPlus-Server gelesen und nicht an externe KI-Dienste gesendet.",
        manual: "Angaben bitte manuell prüfen und ergänzen.", extracted: "Automatisch ausgelesen. Sicherheit:", supplier: "Lieferant", date: "Belegdatum",
        category: "Kategorie", customCategory: "Eigene Kategorie", description: "Beschreibung", total: "Brutto", vat: "MwSt.", mixed: "Gemischt",
        mixedHint: "Bruttobeträge je Steuersatz eingeben.", payment: "Zahlungsart", payer: "Bezahlt von", partner: "Gesellschafter",
        more: "Mehr Details", documentNumber: "Belegnummer", notes: "Notiz", save: "Ausgabe speichern", invalidFile: "Ungültige Datei oder Datei größer als 10 MB.",
        invalidMoney: "Bitte einen gültigen Betrag eingeben.", required: "Bitte alle Pflichtfelder ausfüllen.", duplicate: "Möglicherweise bereits erfasst:",
        duplicateTitle: "Doppelten Beleg prüfen", saveAnyway: "Trotzdem speichern", saved: "Gespeichert:", openPdf: "PDF zur Prüfung öffnen",
        net: "Netto", gross: "Brutto", companyAccount: "Firmenkonto", companyCash: "Firmenkasse", partnerPrivate: "Gesellschafter privat", other: "Sonstige",
        card: "Karte", bankTransfer: "Überweisung", cash: "Bar", directDebit: "Lastschrift", unknown: "Unbekannt", paid: "Bezahlt", reviewed: "Geprüft", draft: "Entwurf"
      },
      partners: {
        kicker: "GESELLSCHAFTERKONTO", title: "Einzahlungen & Auslagen", subtitle: "Beiträge und private Auslagen getrennt und nachvollziehbar führen.",
        addContribution: "+ Einzahlung", openAdvances: "Offene Partner-Auslagen", openAdvancesHint: "Erstattungen ändern niemals die Einzahlungen.",
        history: "Transaktionsverlauf", partner: "Gesellschafter", ofTarget: "von Ziel", privateAdvances: "Private Auslagen", openReimbursement: "Offen zur Erstattung",
        target: "Einzahlungsziel", amount: "Betrag", noOpenAdvances: "Keine offenen Partner-Auslagen.", reimburse: "Erstatten", reimburseConfirm: "Vollständig per Überweisung erstatten:",
        reimbursed: "Erstattung gespeichert.", contributionSaved: "Einzahlung gespeichert.", targetSaved: "Ziel gespeichert.", unknownDate: "Datum unbekannt",
        opening: "Eröffnungsbestand", contribution: "Einzahlung", advance: "Private Auslage", reimbursement: "Erstattung", reversal: "Storno / Korrektur", adjustment: "Korrektur",
        correct: "Korrigieren", correctConfirm: "Die Originalbuchung bleibt erhalten und wird durch eine Gegenbuchung korrigiert.", correctionNote: "Kontrollierte Korrektur", corrected: "Korrektur gespeichert."
      },
      role: {
        super_admin: "Super Admin",
        content_manager: "Content Manager",
        employee: "Mitarbeiter/in"
      },
      status: {
        active: "Aktiv",
        activeOption: "Aktiv (veröffentlicht)",
        draft: "Entwurf",
        scheduled: "Geplant",
        expired: "Abgelaufen",
        hidden: "Ausgeblendet",
        disabled: "Deaktiviert",
        visible: "Sichtbar"
      },
      session: {
        expiringSoon: "Ihre Sitzung läuft bald ab.",
        staySignedIn: "Angemeldet bleiben"
      },
      login: {
        brandTag: "ADMIN-BEREICH",
        brandTitle: "Alles, was Sie zur Pflege Ihrer Website brauchen – an einem Ort.",
        brandDesc: "Verwalten Sie Ankündigungen, Banner und die Galerie selbst – ganz ohne Code, GitHub oder Vercel.",
        feature1: "Ankündigungen & Banner verwalten",
        feature2: "Galerie mit Vorher/Nachher-Bildern pflegen",
        feature3: "Team & Zugriffsrechte steuern",
        feature4: "Jede Änderung wird protokolliert",
        welcomeBack: "Willkommen zurück",
        signInPrompt: "Melden Sie sich an, um fortzufahren.",
        rememberMe: "Angemeldet bleiben",
        forgotPassword: "Passwort vergessen?",
        signInButton: "Anmelden",
        footerNote: "Nur für autorisierte SauberPlus Partner.",
        passwordShow: "Passwort anzeigen",
        passwordHide: "Passwort verbergen",
        resetTitle: "Passwort zurücksetzen",
        resetPrompt: "Geben Sie Ihre E-Mail-Adresse ein. Wir senden Ihnen einen Link zum Zurücksetzen.",
        sendLink: "Link senden",
        backToLogin: "Zurück zum Login",
        forgotSuccess: "Falls ein Konto mit dieser E-Mail-Adresse existiert, wurde ein Link zum Zurücksetzen gesendet.",
        errors: {
          serviceUnavailable: "Anmeldung derzeit nicht möglich. Bitte später erneut versuchen.",
          tooManyAttempts: "Zu viele Fehlversuche. Bitte warten Sie 15 Minuten oder setzen Sie Ihr Passwort zurück.",
          invalidCredentials: "E-Mail-Adresse oder Passwort ist falsch.",
          accountDisabled: "Dieses Konto ist deaktiviert. Bitte wenden Sie sich an einen Super Admin.",
          idleLogout: "Sie wurden wegen Inaktivität automatisch abgemeldet."
        }
      },
      resetPw: {
        title: "Neues Passwort festlegen",
        prompt: "Bitte wählen Sie ein neues Passwort für Ihr Konto.",
        newPasswordLabel: "Neues Passwort",
        passwordPlaceholder: "Mindestens 8 Zeichen",
        confirmPasswordLabel: "Passwort bestätigen",
        saveButton: "Passwort speichern",
        invalidTitle: "Link ungültig oder abgelaufen",
        invalidDesc: "Dieser Link zum Zurücksetzen des Passworts ist nicht mehr gültig. Bitte fordern Sie über den Login-Bildschirm einen neuen Link an.",
        backToLogin: "Zurück zum Login",
        successTitle: "Passwort aktualisiert",
        successDesc: "Ihr Passwort wurde erfolgreich geändert. Sie werden zum Login weitergeleitet …",
        errors: {
          tooShort: "Das Passwort muss mindestens 8 Zeichen lang sein.",
          mismatch: "Die Passwörter stimmen nicht überein.",
          saveFailed: "Passwort konnte nicht gespeichert werden. Bitte fordern Sie einen neuen Link an."
        }
      },
      dashboard: {
        welcome: "Willkommen, {name}",
        signedInAs: "Angemeldet als {role}.",
        recentActivity: "Letzte Aktivität",
        noActivity: "Noch keine Aktivität.",
        statsLoadError: "Statistiken konnten nicht geladen werden.",
        activityLoadError: "Aktivität konnte nicht geladen werden.",
        stat: {
          activeAnnouncements: "Aktive Ankündigungen",
          drafts: "Entwürfe",
          galleryImages: "Galeriebilder",
          beforeAfterPairs: "Vorher/Nachher-Paare",
          recentUploads: "Uploads (7 Tage)"
        }
      },
      activityFeed: {
        loggedIn: "{actor} hat sich angemeldet",
        action: "{actor} hat {entity} {action}"
      },
      entityLabel: {
        announcements: "Ankündigung",
        gallery_images: "Galeriebild",
        user_profiles: "Konto",
        employees: "Mitarbeiter",
        employee_work_sites: "Mitarbeiterzuordnung",
        work_sites: "Objekt",
        work_shifts: "Schicht",
        employee_absences: "Abwesenheit",
        time_entries: "Zeiteintrag",
        time_breaks: "Pause",
        time_entry_events: "Zeiterfassungsereignis",
        invoices: "Rechnung"
      },
      fieldLabel: {
        display_name: "Name",
        email: "E-Mail-Adresse",
        role: "Rolle",
        disabled: "Zugriff",
        archived_at: "Archivierung",
        employee_number: "Personalnummer",
        employment_start_date: "Beschäftigungsbeginn",
        employment_end_date: "Beschäftigungsende",
        status: "Status",
        approval_status: "Freigabestatus"
      },
      action: {
        create: "erstellt",
        update: "aktualisiert",
        delete: "gelöscht"
      },
      announcements: {
        title: "Ankündigungen",
        subtitle: "Banner, Top-Leiste, Promo-Bereich, Popup und saisonale Kampagnen — an einem Ort.",
        newButton: "+ Neue Ankündigung",
        emptyState: "Keine Ankündigungen in dieser Ansicht.",
        loadError: "Ankündigungen konnten nicht geladen werden.",
        noDescription: "Keine Beschreibung",
        noDateRange: "Kein Zeitraum",
        editorTitleNew: "Neue Ankündigung",
        editorTitleEdit: "Ankündigung bearbeiten",
        saveSuccessUpdate: "Ankündigung aktualisiert.",
        saveSuccessCreate: "Ankündigung erstellt.",
        deleteSuccess: "Ankündigung gelöscht.",
        deleteConfirmTitle: "Ankündigung löschen?",
        deleteConfirmMessage: "„{title}“ wird dauerhaft gelöscht. Dies kann nicht rückgängig gemacht werden.",
        hiddenToast: "Ausgeblendet.",
        shownToast: "Wieder sichtbar.",
        placement: {
          all: "Alle",
          top_bar: "Top-Leiste",
          homepage_banner: "Homepage-Banner",
          promo_section: "Promo-Bereich",
          popup: "Popup",
          seasonal: "Saisonale Kampagne"
        },
        field: {
          title: "Titel",
          description: "Beschreibung",
          placement: "Position",
          status: "Status",
          buttonLabel: "Button-Text (optional)",
          buttonLabelPlaceholder: "z. B. Jetzt anfragen",
          buttonUrl: "Button-Link (optional)",
          schedule: "Zeitraum (optional)",
          startDate: "Start",
          endDate: "Ende",
          date: "Datum",
          time: "Uhrzeit",
          discountPercentage: "Rabatt in % (optional)",
          countdownEnabled: "Countdown anzeigen",
          countdownHint: "Benötigt eine Endzeit.",
          autoHideAfterEnd: "Nach Ablauf automatisch ausblenden",
          autoHideHint: "Sonst bleibt der Countdown bei null sichtbar.",
          campaignLabel: "Kampagnen-Label (optional, nur intern sichtbar)",
          campaignLabelPlaceholder: "z. B. Winterputz 2026",
          image: "Bild (optional)",
          preview: "Vorschau"
        },
        preview: {
          noTitle: "(Ohne Titel)",
          noDescription: "(Keine Beschreibung)"
        },
        errors: {
          titleRequired: "Bitte geben Sie einen Titel ein.",
          buttonUrlInvalid: "Der Button-Link muss mit http:// oder https:// beginnen.",
          buttonUrlMissing: "Bitte geben Sie einen Button-Link an oder entfernen Sie den Button-Text.",
          buttonLabelMissing: "Bitte geben Sie einen Button-Text an oder entfernen Sie den Button-Link.",
          dateTimeIncomplete: "Bitte Datum und Uhrzeit vollständig eingeben.",
          dateTimeInvalid: "Datum oder Uhrzeit ist ungültig.",
          endAfterStart: "Die Endzeit muss nach der Startzeit liegen.",
          countdownEndRequired: "Für den Countdown ist eine Endzeit erforderlich.",
          discountRange: "Der Rabatt muss größer als 0 und höchstens 100 Prozent sein."
        }
      },
      gallery: {
        title: "Galerie",
        subtitle: "Bilder ziehen, um die Reihenfolge zu ändern. Änderungen sind sofort live.",
        newSingleButton: "+ Einzelbild",
        newPairButton: "+ Vorher/Nachher",
        emptyState: "Keine Bilder in dieser Ansicht.",
        loadError: "Galerie konnte nicht geladen werden.",
        addSingleTitle: "Einzelbild hinzufügen",
        addPairTitle: "Vorher/Nachher hinzufügen",
        editTitle: "Bild bearbeiten",
        saveSuccessUpdate: "Bild aktualisiert.",
        saveSuccessCreate: "Bild hinzugefügt.",
        deleteSuccess: "Bild gelöscht.",
        deleteConfirmTitle: "Bild löschen?",
        deleteConfirmMessage: "Dieses Galeriebild wird dauerhaft gelöscht. Dies kann nicht rückgängig gemacht werden.",
        hiddenToggleLabel: "Ausgeblendet (nicht auf der Website sichtbar)",
        usedOnLabel: "Startseite → Galerie",
        legacyImportRunning: "Bestehende Website-Bilder werden importiert …",
        legacyImportSuccess: "Bestehende Website-Bilder wurden importiert.",
        legacyImportPartialError: "Einige Website-Bilder konnten nicht importiert werden.",
        kind: {
          all: "Alle",
          single: "Einzelbilder",
          before_after: "Vorher/Nachher",
          singleLabel: "Einzelbild",
          beforeAfterLabel: "Vorher/Nachher"
        },
        field: {
          image: "Bild",
          before: "Vorher",
          after: "Nachher",
          caption: "Bildunterschrift (optional)",
          captionPlaceholder: "z. B. Büroreinigung Solingen"
        },
        errors: {
          needBothImages: "Bitte wählen Sie beide Bilder (Vorher und Nachher) aus.",
          needImage: "Bitte wählen Sie ein Bild aus."
        }
      },
      dropzone: {
        instructions: "Klicken oder Bild hierher ziehen (JPG, PNG, WEBP, max. 5 MB)",
        selectImage: "Bild wählen",
        removeImage: "Bild entfernen"
      },
      users: {
        title: "Team",
        subtitle: "Partnerkonten anlegen, Rollen verwalten, Zugriff sperren.",
        newButton: "+ Neuer Partner",
        emptyState: "Noch keine Partnerkonten.",
        loadError: "Team konnte nicht geladen werden.",
        resetPasswordButton: "Passwort zurücksetzen",
        disableButton: "Deaktivieren",
        enableButton: "Aktivieren",
        newPartnerModalTitle: "Neuer Partner",
        inviteExplain: "Das neue Konto erhält eine E-Mail-Einladung und legt sein eigenes Passwort selbst fest.",
        inviteButton: "Einladen",
        createFailed: "Konto konnte nicht erstellt werden.",
        inviteSent: "Einladung gesendet.",
        edgeErrors: {
          notSuperAdmin: "Nur Super Admins können Konten erstellen.",
          invalidEmail: "Ungültige E-Mail-Adresse.",
          nameRequired: "Bitte einen Namen angeben.",
          invalidRole: "Ungültige Rolle.",
          emailTaken: "Diese E-Mail-Adresse ist bereits registriert.",
          profileSaveFailed: "Konto wurde angelegt, Profil konnte aber nicht gespeichert werden. Bitte SauberPlus-Entwickler kontaktieren."
        },
        roleChangeConfirmTitle: "Rolle ändern?",
        roleChangeConfirmMessage: "{name} erhält die Rolle „{role}“.",
        roleChangeFailed: "Rolle konnte nicht geändert werden.",
        roleChangeSuccess: "Rolle aktualisiert.",
        disableConfirmTitle: "Konto deaktivieren?",
        enableConfirmTitle: "Konto aktivieren?",
        disableConfirmMessage: "{name} kann sich danach nicht mehr anmelden.",
        enableConfirmMessage: "{name} kann sich danach wieder anmelden.",
        disableSuccess: "Konto deaktiviert.",
        enableSuccess: "Konto aktiviert.",
        deleteConfirmTitle: "Konto löschen?",
        deleteConfirmMessage: "{name} wird dauerhaft deaktiviert. Historische Nachweise bleiben erhalten.",
        deleteSuccess: "Konto gelöscht und sicher archiviert.",
        lastAdminProtected: "Der letzte aktive Super Admin kann nicht deaktiviert, gelöscht oder herabgestuft werden.",
        ownAccountProtected: "Das eigene Administratorkonto kann hier nicht geändert werden.",
        resetPasswordConfirmTitle: "Passwort zurücksetzen?",
        resetPasswordConfirmMessage: "Eine E-Mail zum Zurücksetzen des Passworts wird an {email} gesendet.",
        resetPasswordEmailFailed: "E-Mail konnte nicht gesendet werden.",
        resetPasswordEmailSent: "E-Mail zum Zurücksetzen gesendet.",
        field: {
          name: "Name",
          role: "Rolle"
        }
      },
      activityLog: {
        title: "Aktivitätsprotokoll",
        subtitle: "Jede Änderung wird automatisch protokolliert — Benutzer, Zeitpunkt, Aktion, vorher/nachher.",
        loadMore: "Mehr laden",
        emptyState: "Keine Einträge.",
        loadError: "Protokoll konnte nicht geladen werden.",
        before: "Vorher",
        after: "Nachher",
        entity: {
          all: "Alle",
          announcements: "Ankündigungen",
          gallery: "Galerie",
          accounts: "Konten"
        }
      },
      settings: {
        title: "Einstellungen",
        subtitle: "Sicherung der Inhalte (Ankündigungen & Galerie). Kontodaten sind aus Sicherheitsgründen nicht enthalten.",
        exportHeading: "Daten exportieren",
        exportDesc: "Lädt alle Ankündigungen und Galeriebilder als JSON-Datei herunter. Diese Datei kann später zur Wiederherstellung importiert werden. Bilddateien selbst sind nicht enthalten, nur die Verweise darauf.",
        exportButton: "Backup herunterladen",
        exportSuccess: "Backup heruntergeladen.",
        exportFailed: "Export fehlgeschlagen.",
        importHeading: "Daten importieren",
        importDesc: "Fügt die Einträge aus einer zuvor exportierten Backup-Datei als neue Einträge hinzu (bestehende Daten werden nicht überschrieben oder gelöscht).",
        importButton: "Backup-Datei auswählen …",
        importSuccess: "Import abgeschlossen.",
        importFailed: "Import fehlgeschlagen.",
        invalidJson: "Datei ist kein gültiges JSON.",
        notABackupFile: "Diese Datei sieht nicht wie ein SauberPlus-Backup aus.",
        importConfirmTitle: "Backup importieren?",
        importConfirmMessage: "{count1} Ankündigung(en) und {count2} Galeriebild(er) werden als neue Einträge hinzugefügt. Bestehende Daten bleiben unverändert.",
        importResultMessage: "{count1} Ankündigung(en) und {count2} Galeriebild(er) wurden hinzugefügt.",
        invoiceEyebrow: "Nur für Rechnungen",
        invoiceHeading: "Rechnungseinstellungen",
        invoiceDesc: "Diese geschützten Daten werden beim Ausstellen in der Rechnung eingefroren und nicht öffentlich gespeichert.",
        legalName: "Rechtlicher Firmenname",
        taxNumber: "Steuernummer",
        street: "Straße + Hausnummer",
        postalCode: "PLZ",
        city: "Ort",
        phone: "Telefon",
        email: "E-Mail",
        website: "Website",
        bankHeading: "Bankverbindung",
        accountHolder: "Kontoinhaber",
        defaultVat: "Standard-Umsatzsteuer",
        defaultPaymentTerms: "Standard-Zahlungsziel",
        invoicePrefix: "Rechnungspräfix",
        saveInvoiceSettings: "Rechnungseinstellungen speichern",
        invoiceSettingsSaved: "Rechnungseinstellungen gespeichert.",
        invoiceSettingsInvalid: "Die Rechnungseinstellungen sind ungültig.",
        invoiceSettingsLoadFailed: "Rechnungseinstellungen konnten nicht geladen werden.",
        invoiceSettingsSaveFailed: "Rechnungseinstellungen konnten nicht gespeichert werden."
      },
      invoiceStatus: {
        draft: "Entwurf",
        open: "Offen",
        paid: "Bezahlt",
        cancelled: "Storniert"
      },
      invoices: {
        title: "Rechnungen",
        subtitle: "Entwürfe, offene und abgeschlossene Rechnungen sicher verwalten.",
        newButton: "+ Neue Rechnung",
        searchLabel: "Rechnungen durchsuchen",
        searchPlaceholder: "Nummer oder Kunde",
        emptyTitle: "Noch keine Rechnungen",
        emptyDesc: "Erstellen Sie die erste Rechnung in weniger als 30 Sekunden.",
        loadError: "Rechnungen konnten nicht geladen werden.",
        pdfArchived: "PDF archiviert",
        pdfPending: "PDF ausstehend",
        pdfSuccess: "PDF wurde erstellt und heruntergeladen.",
        paidSuccess: "Rechnung wurde als bezahlt markiert.",
        cancelSuccess: "Rechnung wurde storniert.",
        confirmPaidTitle: "Zahlung bestätigen?",
        confirmPaidMessage: "Die Rechnung wird als bezahlt markiert und erhält einen serverseitigen Zahlungszeitpunkt.",
        confirmCancelTitle: "Rechnung stornieren?",
        confirmCancelMessage: "Die Rechnung bleibt unveränderbar im Archiv und wird als storniert gekennzeichnet.",
        column: {
          number: "Rechnungsnummer",
          customer: "Kunde",
          invoiceDate: "Rechnungsdatum",
          serviceDate: "Leistungsdatum",
          net: "Netto",
          vat: "MwSt.",
          gross: "Brutto",
          status: "Status",
          actions: "Aktionen"
        },
        action: {
          open: "Öffnen",
          paid: "Bezahlt",
          cancel: "Storno",
          download: "PDF laden",
          generatePdf: "PDF erstellen",
          duplicate: "Duplizieren"
        }
      },
      invoiceEditor: {
        back: "← Rechnungen",
        title: "Neue Rechnung",
        subtitle: "In wenigen Schritten zur fertigen Rechnung.",
        customerSection: "Kunde",
        customer: "Kunde",
        customerPlaceholder: "Kunde auswählen oder Namen eingeben",
        address: "Adresse",
        addressPlaceholder: "Straße und Hausnummer\nPLZ Ort",
        serviceSection: "Leistung",
        serviceType: "Leistungsart",
        serviceDate: "Leistungsdatum",
        customService: "Eigene Leistungsbeschreibung",
        amountGross: "Betrag (Brutto)",
        paymentMethod: "Zahlungsart",
        bankTransfer: "Überweisung",
        cash: "Barzahlung",
        net: "Netto",
        total: "Gesamt",
        vatShort: "MwSt. {rate} %",
        note: "Optionale Notiz",
        notePlaceholder: "z. B. ergänzende Vereinbarung",
        moreOptions: "Mehr Optionen",
        salutation: "Anrede",
        company: "Firma",
        firstName: "Vorname",
        lastName: "Nachname",
        street: "Straße + Hausnummer",
        postalCode: "PLZ",
        city: "Ort",
        email: "E-Mail",
        phone: "Telefon",
        invoiceDate: "Rechnungsdatum",
        paymentTerms: "Zahlungsziel",
        vatRate: "Umsatzsteuer",
        multipleItems: "Mehrere Positionen",
        multipleItemsHint: "Menge, Einheit und Nettopreis detailliert erfassen.",
        addItem: "+ Position hinzufügen",
        position: "Position {number}",
        description: "Beschreibung",
        details: "Zusatzbeschreibung",
        quantity: "Menge / Zeit",
        unit: "Einheit",
        netUnitPrice: "Einzelpreis netto",
        customUnit: "Eigene Einheit",
        preview: "Vorschau",
        a4Hint: "A4 PDF",
        saveDraft: "Als Entwurf speichern",
        create: "Rechnung erstellen",
        draftSaved: "Entwurf gespeichert.",
        issuePdfSuccess: "Rechnung ausgestellt, archiviert und als PDF heruntergeladen.",
        issuePdfPending: "Rechnung wurde ausgestellt. Das PDF ist noch ausstehend und kann erneut erstellt werden.",
        downloadPdf: "PDF herunterladen",
        generatePdf: "PDF erstellen",
        numberAutomatic: "wird automatisch vergeben",
        settingsFromAdmin: "aus Rechnungseinstellungen",
        error: {
          invalidMoney: "Bitte geben Sie einen gültigen Betrag mit höchstens zwei Nachkommastellen ein.",
          invalidVat: "Bitte geben Sie einen gültigen Umsatzsteuersatz ein.",
          invalidQuantity: "Bitte geben Sie eine gültige Menge mit höchstens drei Nachkommastellen ein.",
          invalidItems: "Bitte prüfen Sie alle Rechnungspositionen.",
          customerRequired: "Kunde und Adresse sind erforderlich.",
          serviceRequired: "Bitte wählen oder beschreiben Sie eine Leistung."
        }
      },
      imageUpload: {
        tooLarge: "Datei ist zu groß (maximal 5 MB).",
        invalidType: "Nur JPG-, PNG- oder WEBP-Bilder sind erlaubt.",
        uploadFailed: "Upload fehlgeschlagen. Bitte erneut versuchen."
      }
    },

    ar: {
      common: {
        logout: "تسجيل الخروج",
        save: "حفظ",
        cancel: "إلغاء",
        delete: "حذف",
        edit: "تعديل",
        close: "إغلاق",
        confirm: "تأكيد",
        pleaseConfirm: "يرجى التأكيد",
        loading: "جارٍ التحميل…",
        actionFailed: "فشل تنفيذ الإجراء.",
        saveFailedRetry: "فشل الحفظ. يرجى المحاولة مرة أخرى.",
        connectionError: "تعذّر الاتصال بالخادم. يرجى المحاولة مرة أخرى.",
        system: "النظام",
        you: "(أنت)",
        emailLabel: "البريد الإلكتروني",
        passwordLabel: "كلمة المرور",
        allStatuses: "كل الحالات",
        noAccess: "لا توجد صلاحية للوصول.",
        deleteFailed: "فشل الحذف.",
        menuOpen: "فتح القائمة",
        languageSwitcher: "تغيير اللغة",
        toggleVisibility: "تبديل الظهور"
      },
      nav: {
        dashboard: "لوحة التحكم",
        announcements: "الإعلانات",
        gallery: "المعرض",
        management: "الإدارة",
        users: "الفريق",
        timeTracking: "الموظفون وتسجيل الوقت",
        activityLog: "سجل النشاط",
        invoices: "الفواتير",
        expenses: "المصروفات",
        settings: "الإعدادات"
      },
      expenses: {
        kicker: "المالية", title: "المصروفات", subtitle: "دفتر مصروفات رقمي، إيصالات ومصاريف الشركاء.", add: "+ تسجيل إيصال",
        overview: "نظرة عامة", partners: "الشركاء", ledger: "سجل المصروفات", search: "المورّد أو الرقم", income: "الإيرادات",
        outgoing: "المصروفات", result: "النتيجة", openAdvances: "مصاريف شركاء معلّقة", entries: "قيود", empty: "لا توجد مصروفات.",
        number: "الرقم الداخلي", status: "الحالة", receipt: "الإيصال", finalize: "تسجيله كمدفوع", finalized: "تم تسجيل المسودة.", cancel: "إلغاء", cancelTitle: "إلغاء المصروف", cancelMessage: "يبقى المصروف محفوظًا للمراجعة.", cancelled: "تم إلغاء المصروف.", contributions: "المساهمات", reimbursements: "التعويضات"
      },
      expenseEditor: {
        back: "← المصروفات", kicker: "إدخال سريع", title: "تسجيل إيصال", subtitle: "صوّر الإيصال، راجع البيانات، ثم احفظ.",
        stepScan: "الإيصال", stepExtract: "القراءة", stepReview: "المراجعة", stepSave: "الحفظ", capture: "صوّر الإيصال أو اختر ملفًا",
        fileHint: "JPG أو PNG أو WebP أو PDF · حتى 10 MB", privacy: "يُحفظ الإيصال بشكل خاص. تُقرأ الصور محليًا على خادم SauberPlus ولا تُرسل إلى خدمات ذكاء اصطناعي خارجية.",
        manual: "يرجى مراجعة البيانات وإكمالها يدويًا.", extracted: "تمت القراءة الآلية. الثقة:", supplier: "المورّد", date: "تاريخ الإيصال",
        category: "الفئة", customCategory: "فئة مخصصة", description: "الوصف", total: "الإجمالي", vat: "الضريبة", mixed: "مختلطة",
        mixedHint: "أدخل الإجمالي لكل نسبة ضريبة.", payment: "طريقة الدفع", payer: "دفع بواسطة", partner: "الشريك",
        more: "تفاصيل إضافية", documentNumber: "رقم الإيصال", notes: "ملاحظة", save: "حفظ المصروف", invalidFile: "ملف غير صالح أو أكبر من 10 MB.",
        invalidMoney: "أدخل مبلغًا صحيحًا.", required: "أكمل الحقول المطلوبة.", duplicate: "قد يكون هذا الإيصال مسجلاً:",
        duplicateTitle: "مراجعة التكرار", saveAnyway: "حفظ رغم ذلك", saved: "تم الحفظ:", openPdf: "فتح PDF للمراجعة",
        net: "الصافي", gross: "الإجمالي", companyAccount: "حساب الشركة", companyCash: "صندوق الشركة", partnerPrivate: "دفعه شريك خاص", other: "أخرى",
        card: "بطاقة", bankTransfer: "تحويل بنكي", cash: "نقدًا", directDebit: "خصم مباشر", unknown: "غير معروف", paid: "مدفوع", reviewed: "تمت المراجعة", draft: "مسودة"
      },
      partners: {
        kicker: "حساب الشركاء", title: "المساهمات والمصاريف", subtitle: "فصل مساهمات الشركاء عن مصاريفهم الخاصة بوضوح.",
        addContribution: "+ مساهمة", openAdvances: "مصاريف الشركاء المعلّقة", openAdvancesHint: "التعويضات لا تغيّر المساهمات.",
        history: "سجل المعاملات", partner: "الشريك", ofTarget: "من الهدف", privateAdvances: "مصاريف خاصة", openReimbursement: "متبقي للتعويض",
        target: "هدف المساهمة", amount: "المبلغ", noOpenAdvances: "لا توجد مصاريف شركاء معلّقة.", reimburse: "تعويض", reimburseConfirm: "تعويض كامل عبر التحويل:",
        reimbursed: "تم حفظ التعويض.", contributionSaved: "تم حفظ المساهمة.", targetSaved: "تم حفظ الهدف.", unknownDate: "التاريخ غير معروف",
        opening: "رصيد افتتاحي", contribution: "مساهمة", advance: "مصروف خاص", reimbursement: "تعويض", reversal: "إلغاء / تصحيح", adjustment: "تصحيح",
        correct: "تصحيح", correctConfirm: "سيبقى القيد الأصلي محفوظًا ويُصحح بقيد عكسي.", correctionNote: "تصحيح مراقب", corrected: "تم حفظ التصحيح."
      },
      role: {
        super_admin: "المدير العام",
        content_manager: "مدير المحتوى",
        employee: "موظف/ة"
      },
      status: {
        active: "نشط",
        activeOption: "نشط (منشور)",
        draft: "مسودة",
        scheduled: "مجدول",
        expired: "منتهي",
        hidden: "مخفي",
        disabled: "معطل",
        visible: "ظاهر"
      },
      session: {
        expiringSoon: "ستنتهي جلستك قريبًا.",
        staySignedIn: "البقاء مسجّلاً للدخول"
      },
      login: {
        brandTag: "منطقة الإدارة",
        brandTitle: "كل ما تحتاجه لإدارة موقعك الإلكتروني — في مكان واحد.",
        brandDesc: "أدر الإعلانات واللافتات والمعرض بنفسك — دون الحاجة إلى أكواد برمجية أو GitHub أو Vercel.",
        feature1: "إدارة الإعلانات واللافتات الترويجية",
        feature2: "تحديث معرض الصور بمقارنات قبل/بعد",
        feature3: "إدارة الفريق وصلاحيات الوصول",
        feature4: "يتم تسجيل كل تغيير تلقائيًا",
        welcomeBack: "مرحبًا بعودتك",
        signInPrompt: "سجّل الدخول للمتابعة.",
        rememberMe: "تذكرني",
        forgotPassword: "هل نسيت كلمة المرور؟",
        signInButton: "تسجيل الدخول",
        footerNote: "لشركاء SauberPlus المخوّلين فقط.",
        passwordShow: "إظهار كلمة المرور",
        passwordHide: "إخفاء كلمة المرور",
        resetTitle: "إعادة تعيين كلمة المرور",
        resetPrompt: "أدخل بريدك الإلكتروني، وسنرسل لك رابطًا لإعادة التعيين.",
        sendLink: "إرسال الرابط",
        backToLogin: "العودة إلى تسجيل الدخول",
        forgotSuccess: "إذا كان هناك حساب مرتبط بهذا البريد الإلكتروني، فسيتم إرسال رابط إعادة التعيين إليه.",
        errors: {
          serviceUnavailable: "تعذّر تسجيل الدخول حاليًا. يرجى المحاولة لاحقًا.",
          tooManyAttempts: "عدد كبير من المحاولات الفاشلة. يرجى الانتظار 15 دقيقة أو إعادة تعيين كلمة المرور.",
          invalidCredentials: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
          accountDisabled: "هذا الحساب معطّل. يرجى التواصل مع المدير العام.",
          idleLogout: "تم تسجيل خروجك تلقائيًا بسبب عدم النشاط."
        }
      },
      resetPw: {
        title: "تعيين كلمة مرور جديدة",
        prompt: "يرجى اختيار كلمة مرور جديدة لحسابك.",
        newPasswordLabel: "كلمة المرور الجديدة",
        passwordPlaceholder: "8 أحرف على الأقل",
        confirmPasswordLabel: "تأكيد كلمة المرور",
        saveButton: "حفظ كلمة المرور",
        invalidTitle: "الرابط غير صالح أو منتهي الصلاحية",
        invalidDesc: "رابط إعادة تعيين كلمة المرور هذا لم يعد صالحًا. يرجى طلب رابط جديد من شاشة تسجيل الدخول.",
        backToLogin: "العودة إلى تسجيل الدخول",
        successTitle: "تم تحديث كلمة المرور",
        successDesc: "تم تغيير كلمة المرور بنجاح. سيتم تحويلك إلى صفحة تسجيل الدخول…",
        errors: {
          tooShort: "يجب أن تتكوّن كلمة المرور من 8 أحرف على الأقل.",
          mismatch: "كلمتا المرور غير متطابقتين.",
          saveFailed: "تعذّر حفظ كلمة المرور. يرجى طلب رابط جديد."
        }
      },
      dashboard: {
        welcome: "مرحبًا، {name}",
        signedInAs: "تم تسجيل الدخول باسم {role}.",
        recentActivity: "أحدث النشاطات",
        noActivity: "لا يوجد نشاط بعد.",
        statsLoadError: "تعذّر تحميل الإحصائيات.",
        activityLoadError: "تعذّر تحميل النشاط.",
        stat: {
          activeAnnouncements: "الإعلانات النشطة",
          drafts: "المسودات",
          galleryImages: "صور المعرض",
          beforeAfterPairs: "أزواج قبل/بعد",
          recentUploads: "الرفوعات (٧ أيام)"
        }
      },
      activityFeed: {
        loggedIn: "سجّل {actor} الدخول",
        action: "قام {actor} {action} {entity}"
      },
      entityLabel: {
        announcements: "إعلان",
        gallery_images: "صورة معرض",
        user_profiles: "حساب",
        employees: "موظف",
        employee_work_sites: "تعيين موظف",
        work_sites: "موقع عمل",
        work_shifts: "وردية",
        employee_absences: "غياب",
        time_entries: "إدخال وقت",
        time_breaks: "استراحة",
        time_entry_events: "حدث تسجيل وقت",
        invoices: "فاتورة"
      },
      fieldLabel: {
        display_name: "الاسم",
        email: "البريد الإلكتروني",
        role: "الدور",
        disabled: "الوصول",
        archived_at: "الأرشفة",
        employee_number: "رقم الموظف",
        employment_start_date: "بداية التوظيف",
        employment_end_date: "نهاية التوظيف",
        status: "الحالة",
        approval_status: "حالة الاعتماد"
      },
      action: {
        create: "بإنشاء",
        update: "بتحديث",
        delete: "بحذف"
      },
      announcements: {
        title: "الإعلانات",
        subtitle: "اللافتات، الشريط العلوي، القسم الترويجي، النوافذ المنبثقة، والحملات الموسمية — في مكان واحد.",
        newButton: "+ إعلان جديد",
        emptyState: "لا توجد إعلانات في هذا العرض.",
        loadError: "تعذّر تحميل الإعلانات.",
        noDescription: "بدون وصف",
        noDateRange: "بدون فترة زمنية",
        editorTitleNew: "إعلان جديد",
        editorTitleEdit: "تعديل الإعلان",
        saveSuccessUpdate: "تم تحديث الإعلان.",
        saveSuccessCreate: "تم إنشاء الإعلان.",
        deleteSuccess: "تم حذف الإعلان.",
        deleteConfirmTitle: "حذف الإعلان؟",
        deleteConfirmMessage: "سيتم حذف «{title}» نهائيًا. لا يمكن التراجع عن هذا الإجراء.",
        hiddenToast: "تم الإخفاء.",
        shownToast: "تم الإظهار مجددًا.",
        placement: {
          all: "الكل",
          top_bar: "الشريط العلوي",
          homepage_banner: "لافتة الصفحة الرئيسية",
          promo_section: "القسم الترويجي",
          popup: "نافذة منبثقة",
          seasonal: "حملة موسمية"
        },
        field: {
          title: "العنوان",
          description: "الوصف",
          placement: "الموضع",
          status: "الحالة",
          buttonLabel: "نص الزر (اختياري)",
          buttonLabelPlaceholder: "مثال: اطلب الآن",
          buttonUrl: "رابط الزر (اختياري)",
          schedule: "الفترة الزمنية (اختيارية)",
          startDate: "البداية",
          endDate: "النهاية",
          date: "التاريخ",
          time: "الوقت",
          discountPercentage: "نسبة الخصم % (اختيارية)",
          countdownEnabled: "إظهار العد التنازلي",
          countdownHint: "يتطلب تحديد وقت انتهاء.",
          autoHideAfterEnd: "الإخفاء تلقائيًا بعد الانتهاء",
          autoHideHint: "وإلا يبقى العداد ظاهرًا عند الصفر.",
          campaignLabel: "اسم الحملة (اختياري، للاستخدام الداخلي فقط)",
          campaignLabelPlaceholder: "مثال: تنظيف الشتاء 2026",
          image: "الصورة (اختياري)",
          preview: "معاينة"
        },
        preview: {
          noTitle: "(بدون عنوان)",
          noDescription: "(بدون وصف)"
        },
        errors: {
          titleRequired: "يرجى إدخال عنوان.",
          buttonUrlInvalid: "يجب أن يبدأ رابط الزر بـ http:// أو https://.",
          buttonUrlMissing: "يرجى إدخال رابط للزر أو إزالة نص الزر.",
          buttonLabelMissing: "يرجى إدخال نص للزر أو إزالة رابط الزر.",
          dateTimeIncomplete: "يرجى إدخال التاريخ والوقت معًا.",
          dateTimeInvalid: "التاريخ أو الوقت غير صالح.",
          endAfterStart: "يجب أن يكون وقت الانتهاء بعد وقت البداية.",
          countdownEndRequired: "يرجى تحديد وقت انتهاء لتفعيل العد التنازلي.",
          discountRange: "يجب أن تكون نسبة الخصم أكبر من 0 ولا تتجاوز 100 بالمائة."
        }
      },
      gallery: {
        title: "المعرض",
        subtitle: "اسحب الصور لتغيير ترتيبها. التغييرات تُنشر فورًا.",
        newSingleButton: "+ صورة مفردة",
        newPairButton: "+ قبل/بعد",
        emptyState: "لا توجد صور في هذا العرض.",
        loadError: "تعذّر تحميل المعرض.",
        addSingleTitle: "إضافة صورة مفردة",
        addPairTitle: "إضافة صورة قبل/بعد",
        editTitle: "تعديل الصورة",
        saveSuccessUpdate: "تم تحديث الصورة.",
        saveSuccessCreate: "تمت إضافة الصورة.",
        deleteSuccess: "تم حذف الصورة.",
        deleteConfirmTitle: "حذف الصورة؟",
        deleteConfirmMessage: "سيتم حذف صورة المعرض هذه نهائيًا. لا يمكن التراجع عن هذا الإجراء.",
        hiddenToggleLabel: "مخفي (غير ظاهر على الموقع)",
        usedOnLabel: "الصفحة الرئيسية → المعرض",
        legacyImportRunning: "جارٍ استيراد صور الموقع الحالية …",
        legacyImportSuccess: "تم استيراد صور الموقع الحالية.",
        legacyImportPartialError: "تعذّر استيراد بعض صور الموقع.",
        kind: {
          all: "الكل",
          single: "صور مفردة",
          before_after: "قبل/بعد",
          singleLabel: "صورة مفردة",
          beforeAfterLabel: "قبل/بعد"
        },
        field: {
          image: "الصورة",
          before: "قبل",
          after: "بعد",
          caption: "التسمية التوضيحية (اختياري)",
          captionPlaceholder: "مثال: تنظيف مكاتب زولينغن"
        },
        errors: {
          needBothImages: "يرجى اختيار كلتا الصورتين (قبل وبعد).",
          needImage: "يرجى اختيار صورة."
        }
      },
      dropzone: {
        instructions: "انقر أو اسحب الصورة هنا (JPG، PNG، WEBP، بحد أقصى 5 ميجابايت)",
        selectImage: "اختر صورة",
        removeImage: "إزالة الصورة"
      },
      users: {
        title: "الفريق",
        subtitle: "إنشاء حسابات الشركاء وإدارة الأدوار وتقييد الوصول.",
        newButton: "+ شريك جديد",
        emptyState: "لا توجد حسابات شركاء بعد.",
        loadError: "تعذّر تحميل الفريق.",
        resetPasswordButton: "إعادة تعيين كلمة المرور",
        disableButton: "تعطيل",
        enableButton: "تفعيل",
        newPartnerModalTitle: "شريك جديد",
        inviteExplain: "سيتلقى الحساب الجديد دعوة عبر البريد الإلكتروني ويقوم بتعيين كلمة المرور بنفسه.",
        inviteButton: "دعوة",
        createFailed: "تعذّر إنشاء الحساب.",
        inviteSent: "تم إرسال الدعوة.",
        edgeErrors: {
          notSuperAdmin: "يقتصر إنشاء الحسابات على المدير العام فقط.",
          invalidEmail: "البريد الإلكتروني غير صالح.",
          nameRequired: "يرجى إدخال اسم.",
          invalidRole: "دور غير صالح.",
          emailTaken: "هذا البريد الإلكتروني مسجّل بالفعل.",
          profileSaveFailed: "تم إنشاء الحساب، لكن تعذّر حفظ الملف الشخصي. يرجى التواصل مع مطوّر SauberPlus."
        },
        roleChangeConfirmTitle: "تغيير الدور؟",
        roleChangeConfirmMessage: "سيحصل {name} على دور «{role}».",
        roleChangeFailed: "تعذّر تغيير الدور.",
        roleChangeSuccess: "تم تحديث الدور.",
        disableConfirmTitle: "تعطيل الحساب؟",
        enableConfirmTitle: "تفعيل الحساب؟",
        disableConfirmMessage: "لن يتمكن {name} من تسجيل الدخول بعد ذلك.",
        enableConfirmMessage: "سيتمكن {name} من تسجيل الدخول مرة أخرى.",
        disableSuccess: "تم تعطيل الحساب.",
        enableSuccess: "تم تفعيل الحساب.",
        deleteConfirmTitle: "حذف الحساب؟",
        deleteConfirmMessage: "سيتم تعطيل حساب {name} نهائيًا، مع الاحتفاظ بالسجلات التاريخية.",
        deleteSuccess: "تم حذف الحساب وأرشفته بأمان.",
        lastAdminProtected: "لا يمكن تعطيل آخر مدير عام نشط أو حذفه أو تخفيض صلاحياته.",
        ownAccountProtected: "لا يمكن تغيير حساب المدير الحالي من هنا.",
        resetPasswordConfirmTitle: "إعادة تعيين كلمة المرور؟",
        resetPasswordConfirmMessage: "سيتم إرسال بريد إلكتروني لإعادة تعيين كلمة المرور إلى {email}.",
        resetPasswordEmailFailed: "تعذّر إرسال البريد الإلكتروني.",
        resetPasswordEmailSent: "تم إرسال بريد إعادة التعيين.",
        field: {
          name: "الاسم",
          role: "الدور"
        }
      },
      activityLog: {
        title: "سجل النشاط",
        subtitle: "يتم تسجيل كل تغيير تلقائيًا — المستخدم، التوقيت، الإجراء، قبل/بعد.",
        loadMore: "تحميل المزيد",
        emptyState: "لا توجد سجلات.",
        loadError: "تعذّر تحميل السجل.",
        before: "قبل",
        after: "بعد",
        entity: {
          all: "الكل",
          announcements: "الإعلانات",
          gallery: "المعرض",
          accounts: "الحسابات"
        }
      },
      settings: {
        title: "الإعدادات",
        subtitle: "نسخ احتياطي للمحتوى (الإعلانات والمعرض). لا تشمل بيانات الحسابات لأسباب أمنية.",
        exportHeading: "تصدير البيانات",
        exportDesc: "يقوم بتنزيل جميع الإعلانات وصور المعرض كملف JSON. يمكن استيراد هذا الملف لاحقًا لاستعادة البيانات. لا يشمل ملفات الصور نفسها، بل الروابط إليها فقط.",
        exportButton: "تنزيل النسخة الاحتياطية",
        exportSuccess: "تم تنزيل النسخة الاحتياطية.",
        exportFailed: "فشل التصدير.",
        importHeading: "استيراد البيانات",
        importDesc: "يضيف العناصر من ملف نسخة احتياطية تم تصديره سابقًا كعناصر جديدة (لا يتم استبدال البيانات الحالية أو حذفها).",
        importButton: "اختيار ملف النسخة الاحتياطية…",
        importSuccess: "اكتمل الاستيراد.",
        importFailed: "فشل الاستيراد.",
        invalidJson: "الملف ليس بصيغة JSON صالحة.",
        notABackupFile: "لا يبدو أن هذا الملف نسخة احتياطية من SauberPlus.",
        importConfirmTitle: "استيراد النسخة الاحتياطية؟",
        importConfirmMessage: "ستتم إضافة {count1} إعلان(ات) و{count2} صورة (صور) من المعرض كعناصر جديدة. لن تتأثر البيانات الحالية.",
        importResultMessage: "تمت إضافة {count1} إعلان(ات) و{count2} صورة (صور) من المعرض.",
        invoiceEyebrow: "للفواتير فقط",
        invoiceHeading: "إعدادات الفواتير",
        invoiceDesc: "تُجمّد هذه البيانات المحمية داخل الفاتورة عند إصدارها ولا تُحفظ بصورة عامة.",
        legalName: "الاسم القانوني للشركة",
        taxNumber: "الرقم الضريبي",
        street: "الشارع ورقم المبنى",
        postalCode: "الرمز البريدي",
        city: "المدينة",
        phone: "الهاتف",
        email: "البريد الإلكتروني",
        website: "الموقع الإلكتروني",
        bankHeading: "البيانات البنكية",
        accountHolder: "صاحب الحساب",
        defaultVat: "ضريبة القيمة المضافة الافتراضية",
        defaultPaymentTerms: "أجل الدفع الافتراضي",
        invoicePrefix: "بادئة رقم الفاتورة",
        saveInvoiceSettings: "حفظ إعدادات الفواتير",
        invoiceSettingsSaved: "تم حفظ إعدادات الفواتير.",
        invoiceSettingsInvalid: "إعدادات الفواتير غير صالحة.",
        invoiceSettingsLoadFailed: "تعذّر تحميل إعدادات الفواتير.",
        invoiceSettingsSaveFailed: "تعذّر حفظ إعدادات الفواتير."
      },
      invoiceStatus: {
        draft: "مسودة",
        open: "مفتوحة",
        paid: "مدفوعة",
        cancelled: "ملغاة"
      },
      invoices: {
        title: "الفواتير",
        subtitle: "إدارة المسودات والفواتير المفتوحة والمكتملة بأمان.",
        newButton: "+ فاتورة جديدة",
        searchLabel: "البحث في الفواتير",
        searchPlaceholder: "الرقم أو العميل",
        emptyTitle: "لا توجد فواتير بعد",
        emptyDesc: "أنشئ أول فاتورة خلال أقل من 30 ثانية.",
        loadError: "تعذّر تحميل الفواتير.",
        pdfArchived: "تمت أرشفة PDF",
        pdfPending: "ملف PDF قيد الانتظار",
        pdfSuccess: "تم إنشاء ملف PDF وتنزيله.",
        paidSuccess: "تم تعليم الفاتورة كمدفوعة.",
        cancelSuccess: "تم إلغاء الفاتورة.",
        confirmPaidTitle: "تأكيد الدفع؟",
        confirmPaidMessage: "ستُعلّم الفاتورة كمدفوعة ويُسجل وقت الدفع من الخادم.",
        confirmCancelTitle: "إلغاء الفاتورة؟",
        confirmCancelMessage: "ستبقى الفاتورة ثابتة في الأرشيف مع تعليمها كملغاة.",
        column: {
          number: "رقم الفاتورة",
          customer: "العميل",
          invoiceDate: "تاريخ الفاتورة",
          serviceDate: "تاريخ الخدمة",
          net: "الصافي",
          vat: "الضريبة",
          gross: "الإجمالي",
          status: "الحالة",
          actions: "الإجراءات"
        },
        action: {
          open: "فتح",
          paid: "مدفوعة",
          cancel: "إلغاء",
          download: "تنزيل PDF",
          generatePdf: "إنشاء PDF",
          duplicate: "نسخ كمسودة"
        }
      },
      invoiceEditor: {
        back: "→ الفواتير",
        title: "فاتورة جديدة",
        subtitle: "خطوات قليلة للوصول إلى فاتورة جاهزة.",
        customerSection: "العميل",
        customer: "العميل",
        customerPlaceholder: "اختر عميلاً أو اكتب الاسم",
        address: "العنوان",
        addressPlaceholder: "الشارع ورقم المبنى\nالرمز البريدي والمدينة",
        serviceSection: "الخدمة",
        serviceType: "نوع الخدمة",
        serviceDate: "تاريخ الخدمة",
        customService: "وصف خدمة مخصص",
        amountGross: "المبلغ الإجمالي",
        paymentMethod: "طريقة الدفع",
        bankTransfer: "تحويل بنكي",
        cash: "نقدًا",
        net: "الصافي",
        total: "الإجمالي",
        vatShort: "الضريبة {rate} %",
        note: "ملاحظة اختيارية",
        notePlaceholder: "مثلاً اتفاق إضافي",
        moreOptions: "خيارات إضافية",
        salutation: "اللقب",
        company: "الشركة",
        firstName: "الاسم الأول",
        lastName: "اسم العائلة",
        street: "الشارع ورقم المبنى",
        postalCode: "الرمز البريدي",
        city: "المدينة",
        email: "البريد الإلكتروني",
        phone: "الهاتف",
        invoiceDate: "تاريخ الفاتورة",
        paymentTerms: "أجل الدفع",
        vatRate: "ضريبة القيمة المضافة",
        multipleItems: "عدة بنود",
        multipleItemsHint: "إدخال الكمية والوحدة والسعر الصافي بالتفصيل.",
        addItem: "+ إضافة بند",
        position: "البند {number}",
        description: "الوصف",
        details: "وصف إضافي",
        quantity: "الكمية / الوقت",
        unit: "الوحدة",
        netUnitPrice: "سعر الوحدة الصافي",
        customUnit: "وحدة مخصصة",
        preview: "معاينة",
        a4Hint: "PDF A4",
        saveDraft: "حفظ كمسودة",
        create: "إنشاء الفاتورة",
        draftSaved: "تم حفظ المسودة.",
        issuePdfSuccess: "تم إصدار الفاتورة وأرشفتها وتنزيلها كملف PDF.",
        issuePdfPending: "تم إصدار الفاتورة. ملف PDF ما زال قيد الانتظار ويمكن إنشاؤه مجددًا.",
        downloadPdf: "تنزيل PDF",
        generatePdf: "إنشاء PDF",
        numberAutomatic: "يُنشأ تلقائيًا",
        settingsFromAdmin: "من إعدادات الفواتير",
        error: {
          invalidMoney: "أدخل مبلغًا صالحًا بمنزلتين عشريتين كحد أقصى.",
          invalidVat: "أدخل نسبة ضريبة صالحة.",
          invalidQuantity: "أدخل كمية صالحة بثلاث منازل عشرية كحد أقصى.",
          invalidItems: "راجع جميع بنود الفاتورة.",
          customerRequired: "اسم العميل والعنوان مطلوبان.",
          serviceRequired: "اختر الخدمة أو اكتب وصفها."
        }
      },
      imageUpload: {
        tooLarge: "حجم الملف كبير جدًا (الحد الأقصى 5 ميجابايت).",
        invalidType: "يُسمح فقط بصور JPG أو PNG أو WEBP.",
        uploadFailed: "فشل الرفع. يرجى المحاولة مرة أخرى."
      }
    }
  };

  // ---------------------------------------------------------------
  // Engine
  // ---------------------------------------------------------------

  function getLang() {
    try {
      var stored = window.localStorage.getItem(STORAGE_KEY);
      return stored === "ar" ? "ar" : DEFAULT_LANG;
    } catch (error) {
      return DEFAULT_LANG;
    }
  }

  function lookup(dict, key) {
    var parts = key.split(".");
    var node = dict;
    for (var i = 0; i < parts.length; i += 1) {
      if (node == null || typeof node !== "object") {
        return null;
      }
      node = node[parts[i]];
    }
    return typeof node === "string" ? node : null;
  }

  function t(key, vars) {
    var lang = getLang();
    var value = lookup(DICT[lang], key);
    if (value == null && lang !== DEFAULT_LANG) {
      value = lookup(DICT[DEFAULT_LANG], key);
    }
    if (value == null) {
      return key;
    }
    if (vars) {
      Object.keys(vars).forEach(function (varName) {
        value = value.replace(new RegExp("\\{" + varName + "\\}", "g"), vars[varName]);
      });
    }
    return value;
  }

  // The admin-create-user Edge Function (server-side, out of scope for this
  // localization layer) always replies in German. Rather than making server
  // code language-aware, this maps its known fixed responses to a
  // translation key so the UI can still show them in the active language.
  // Anything not in this map (an unexpected server error) is returned as-is.
  var SERVER_ERROR_KEY_MAP = {
    "Nur Super Admins können Konten erstellen.": "users.edgeErrors.notSuperAdmin",
    "Ungültige E-Mail-Adresse.": "users.edgeErrors.invalidEmail",
    "Bitte einen Namen angeben.": "users.edgeErrors.nameRequired",
    "Ungültige Rolle.": "users.edgeErrors.invalidRole",
    "Diese E-Mail-Adresse ist bereits registriert.": "users.edgeErrors.emailTaken",
    "Konto konnte nicht erstellt werden.": "users.createFailed",
    "Der letzte aktive Super Admin kann nicht deaktiviert, gelöscht oder herabgestuft werden.": "users.lastAdminProtected",
    "Das eigene Administratorkonto kann hier nicht geändert werden.": "users.ownAccountProtected",
    "Konto wurde angelegt, Profil konnte aber nicht gespeichert werden. Bitte SauberPlus-Entwickler kontaktieren.": "users.edgeErrors.profileSaveFailed"
  };

  function translateServerError(message) {
    var key = SERVER_ERROR_KEY_MAP[message];
    return key ? t(key) : message;
  }

  function applyDirection(lang) {
    var root = document.documentElement;
    root.lang = lang;
    root.dir = lang === "ar" ? "rtl" : "ltr";
  }

  // Apply direction immediately (script runs in <head>, document.documentElement
  // already exists even though <body> hasn't been parsed yet).
  applyDirection(getLang());

  function setLang(lang) {
    try {
      window.localStorage.setItem(STORAGE_KEY, lang === "ar" ? "ar" : "de");
    } catch (error) {
      // Storage unavailable — language choice just won't persist, harmless.
    }
    window.location.reload();
  }

  function applyStaticTranslations() {
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
      el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
    });
    document.querySelectorAll("[data-i18n-aria-label]").forEach(function (el) {
      el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria-label")));
    });
  }

  // ---------------------------------------------------------------
  // Switcher UI — built and injected automatically, reusing the public
  // site's existing .lang-select/.lang-toggle/.lang-menu recipe (available
  // for free since admin.css links css/sauberplus.css first).
  // ---------------------------------------------------------------

  function buildSwitcher() {
    var current = getLang();
    var wrap = document.createElement("div");
    wrap.className = "lang-select admin-lang-select";
    wrap.id = "adminLanguageSelect";
    wrap.innerHTML =
      '<button class="lang-toggle" type="button" aria-haspopup="true" aria-expanded="false">' +
      '<span class="lang-globe" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"></circle><path d="M3.6 9h16.8"></path><path d="M3.6 15h16.8"></path><path d="M12 3c2.4 2.5 3.6 5.5 3.6 9S14.4 18.5 12 21"></path><path d="M12 3c-2.4 2.5-3.6 5.5-3.6 9S9.6 18.5 12 21"></path></svg></span>' +
      '<span class="lang-current">' +
      (current === "ar" ? "AR" : "DE") +
      '</span><span class="lang-chevron" aria-hidden="true">⌄</span>' +
      "</button>" +
      '<div class="lang-menu" role="menu">' +
      '<button class="lang-option' +
      (current === "de" ? " active" : "") +
      '" type="button" data-lang="de" role="menuitem"><span class="lang-code">DE</span><span>Deutsch</span></button>' +
      '<button class="lang-option' +
      (current === "ar" ? " active" : "") +
      '" type="button" data-lang="ar" role="menuitem"><span class="lang-code">AR</span><span>العربية</span></button>' +
      "</div>";
    return wrap;
  }

  function wireSwitcher(wrap) {
    var toggle = wrap.querySelector(".lang-toggle");
    var menu = wrap.querySelector(".lang-menu");

    function close() {
      wrap.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    }

    toggle.addEventListener("click", function () {
      var willOpen = !wrap.classList.contains("open");
      wrap.classList.toggle("open", willOpen);
      toggle.setAttribute("aria-expanded", String(willOpen));
    });

    menu.querySelectorAll(".lang-option").forEach(function (option) {
      option.addEventListener("click", function () {
        var lang = option.getAttribute("data-lang");
        if (lang !== getLang()) {
          setLang(lang);
        } else {
          close();
        }
      });
    });

    document.addEventListener("click", function (event) {
      if (!wrap.contains(event.target)) {
        close();
      }
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        close();
      }
    });
  }

  function initSwitcher() {
    var mountPoints = document.querySelectorAll("[data-lang-switcher-mount]");
    mountPoints.forEach(function (mount) {
      var switcherEl = buildSwitcher();
      mount.appendChild(switcherEl);
      wireSwitcher(switcherEl);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    applyStaticTranslations();
    initSwitcher();
  });

  window.AdminI18N = {
    t: t,
    getLang: getLang,
    setLang: setLang,
    applyStaticTranslations: applyStaticTranslations,
    translateServerError: translateServerError
  };
})();
