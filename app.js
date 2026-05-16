const STORAGE_KEY = "neurolog_entries_v1";
const PATIENT_KEY = "neurolog_patient_v1";
const SESSION_KEY = "neurolog_session_v1";
const NAV_KEY = "neurolog_nav_collapsed_v1";
const MEDICATION_OPTIONS_KEY = "neurolog_medication_options_v2";
const CAREGIVER_OPTIONS_KEY = "neurolog_caregiver_options_v1";
const SHEET_API_URL_KEY = "neurolog_sheet_api_url_v1";
const DEMO_PASSWORD = "care";
const DEFAULT_SHEET_API_URL = "https://script.google.com/macros/s/AKfycbxgT7Jy4EkygawrzfEm6k1LBKLcUdW1ro_U2_gI5ELUfHvjHymkA90KfbYfE2An3cR1/exec";
let sheetApiUrl = DEFAULT_SHEET_API_URL;

const state = {
  entries: [],
  patient: {
    name: "One patient",
    context: "Brain tumour recovery care log for family caregivers.",
    medications: "Add current medications, usual doses, and timing here.",
    watchList: "Headache, nausea, dizziness, fatigue, confusion, speech changes, seizure activity, balance changes.",
    emergency: "Add emergency contacts, oncology/neurosurgery instructions, and red flag actions here."
  },
  route: "today"
};

const typeConfig = {
  Medication: { icon: "medication", color: "Medication", title: "Log medication" },
  Feeling: { icon: "sentiment_satisfied", color: "Feeling", title: "Log feeling" },
  Symptom: { icon: "sick", color: "Symptom", title: "Log symptom" },
  Behaviour: { icon: "psychology", color: "Behaviour", title: "Log behaviour" },
  Note: { icon: "edit_note", color: "Note", title: "Add care note" }
};

const presets = {
  feelings: ["Good", "Tired", "Anxious", "Low", "Irritable", "Confused", "In pain", "Nauseous"],
  symptoms: ["Headache", "Dizziness", "Nausea", "Fatigue", "Weakness", "Vision change", "Speech difficulty", "Memory issue", "Seizure", "Sleep issue", "Appetite change"],
  behaviours: ["Confusion", "Agitation", "Repetition", "Forgetfulness", "Mood swing", "Withdrawal", "Restlessness", "Poor concentration", "Speech change", "Balance issue", "Unusual behaviour"],
  severity: ["Mild", "Moderate", "Severe"],
  medications: [
    { name: "Dexamethasone", defaultDose: "2mg tablets" },
    { name: "Paracetamol", defaultDose: "500mg tablets" },
    { name: "Ibuprofen", defaultDose: "200mg tablets" }
  ],
  caregivers: ["Alison", "Hamish", "Tami", "Nurse", "Doctor", "Family member", "Friend"]
};

const appView = document.querySelector('[data-view="app"]');
const loginView = document.querySelector('[data-view="login"]');
const loginForm = document.querySelector("#loginForm");
const entryDialog = document.querySelector("#entryDialog");
const entryForm = document.querySelector("#entryForm");
const dynamicFields = document.querySelector("#dynamicFields");
const patientForm = document.querySelector("#patientForm");
const settingsForm = document.querySelector("#settingsForm");
const medicationSettingsList = document.querySelector("#medicationSettingsList");
const caregiverSettingsList = document.querySelector("#caregiverSettingsList");
const saveSettingsTopButton = document.querySelector("#saveSettingsTopButton");
const sheetApiUrlInput = document.querySelector("#sheetApiUrl");
const copySetupLinkButton = document.querySelector("#copySetupLinkButton");
const exportScope = document.querySelector("#exportScope");
const exportFrom = document.querySelector("#exportFrom");
const exportTo = document.querySelector("#exportTo");
const exportCount = document.querySelector("#exportCount");
const syncHint = document.querySelector("#syncHint");
const dateLabel = document.querySelector("#dateLabel");
const routeTitle = document.querySelector("#routeTitle");
const navToggle = document.querySelector("#navToggle");
const datePicker = document.querySelector("#datePicker");
const timePicker = document.querySelector("#timePicker");
const dateDisplay = document.querySelector("#dateDisplay");
const timeDisplay = document.querySelector("#timeDisplay");

let pickerMonth = new Date();
const dirtySettings = {
  medication: new Set(),
  caregiver: new Set(),
  sheet: false
};

function loadState() {
  const savedEntries = localStorage.getItem(STORAGE_KEY);
  const savedPatient = localStorage.getItem(PATIENT_KEY);
  const savedMedications = localStorage.getItem(MEDICATION_OPTIONS_KEY);
  const savedCaregivers = localStorage.getItem(CAREGIVER_OPTIONS_KEY);
  const savedSheetApiUrl = localStorage.getItem(SHEET_API_URL_KEY);
  const setupSheetApiUrl = setupSheetUrlFromLocation();

  state.entries = savedEntries ? JSON.parse(savedEntries) : seedEntries();
  state.patient = savedPatient ? JSON.parse(savedPatient) : state.patient;
  presets.medications = normalizeMedicationOptions(savedMedications ? JSON.parse(savedMedications) : presets.medications);
  presets.caregivers = savedCaregivers ? JSON.parse(savedCaregivers) : presets.caregivers;
  sheetApiUrl = setupSheetApiUrl || savedSheetApiUrl || DEFAULT_SHEET_API_URL;

  if (!savedEntries) saveEntries();
  if (!savedPatient) savePatient();
  if (!savedMedications || savedMedications.includes('"')) saveMedicationOptions();
  if (!savedCaregivers) saveCaregiverOptions();
  if (setupSheetApiUrl) saveSheetApiUrlValue(setupSheetApiUrl);
}

function seedEntries() {
  return [];
}

function saveEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.entries));
}

function syncEnabled() {
  return sheetApiUrl.startsWith("https://");
}

function setupSheetUrlFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const value = params.get("sheet") || params.get("sync") || hashParams.get("sheet") || hashParams.get("sync");
  if (!value) return "";

  const decoded = decodeURIComponent(value).trim();
  if (!decoded.startsWith("https://script.google.com/macros/s/")) return "";

  const cleanUrl = new URL(window.location.href);
  cleanUrl.searchParams.delete("sheet");
  cleanUrl.searchParams.delete("sync");
  if (hashParams.has("sheet") || hashParams.has("sync")) cleanUrl.hash = "";
  window.history.replaceState({}, document.title, cleanUrl.toString());
  return decoded;
}

function jsonpRequest(params) {
  return new Promise((resolve, reject) => {
    const callbackName = `neurologSheetCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const url = new URL(sheetApiUrl);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    url.searchParams.set("callback", callbackName);

    const script = document.createElement("script");
    const cleanup = () => {
      script.remove();
      delete window[callbackName];
    };

    window[callbackName] = (payload) => {
      cleanup();
      resolve(payload);
    };
    script.onerror = () => {
      cleanup();
      reject(new Error("Could not reach Google Sheet backend."));
    };
    script.src = url.toString();
    document.body.append(script);
  });
}

async function loadEntriesFromSheet() {
  if (!syncEnabled()) return;
  const response = await jsonpRequest({ action: "listLogs" });
  if (!response.ok) throw new Error(response.error || "Could not load logs.");
  state.entries = response.entries || [];
  saveEntries();
  render();
}

async function appendEntryToSheet(entry) {
  if (!syncEnabled()) return false;
  await fetch(sheetApiUrl, {
    method: "POST",
    mode: "no-cors",
    body: JSON.stringify({ action: "appendLog", entry })
  });
  return true;
}

async function deleteEntryFromSheet(id) {
  if (!syncEnabled() || !id) return false;
  await fetch(sheetApiUrl, {
    method: "POST",
    mode: "no-cors",
    body: JSON.stringify({ action: "deleteLog", id })
  });
  return true;
}

function refreshEntriesFromSheetSoon() {
  if (!syncEnabled()) return;
  window.setTimeout(() => {
    loadEntriesFromSheet().catch(() => {});
  }, 1400);
}

function savePatient() {
  localStorage.setItem(PATIENT_KEY, JSON.stringify(state.patient));
}

function saveMedicationOptions() {
  localStorage.setItem(MEDICATION_OPTIONS_KEY, JSON.stringify(presets.medications));
}

function saveCaregiverOptions() {
  localStorage.setItem(CAREGIVER_OPTIONS_KEY, JSON.stringify(presets.caregivers));
}

function saveSheetApiUrl() {
  saveSheetApiUrlValue(sheetApiUrlInput.value.trim());
}

function saveSheetApiUrlValue(value) {
  sheetApiUrl = value;
  if (value) {
    localStorage.setItem(SHEET_API_URL_KEY, value);
  } else {
    localStorage.removeItem(SHEET_API_URL_KEY);
  }
}

function publicSetupLink() {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("sync", sheetApiUrlInput.value.trim() || sheetApiUrl);
  return url.toString();
}

function setSession(isActive) {
  if (isActive) {
    sessionStorage.setItem(SESSION_KEY, "active");
    loginView.classList.add("is-hidden");
    appView.classList.remove("is-hidden");
  } else {
    sessionStorage.removeItem(SESSION_KEY);
    loginView.classList.remove("is-hidden");
    appView.classList.add("is-hidden");
  }
}

function setNavCollapsed(isCollapsed) {
  appView.classList.toggle("nav-collapsed", isCollapsed);
  localStorage.setItem(NAV_KEY, String(isCollapsed));
  navToggle.setAttribute("aria-expanded", String(!isCollapsed));
  navToggle.setAttribute("aria-label", isCollapsed ? "Expand navigation" : "Collapse navigation");
  navToggle.querySelector(".material-symbols-outlined").textContent = isCollapsed ? "left_panel_open" : "left_panel_close";
}

function todayString() {
  return localDateString(new Date());
}

function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDisplayDate() {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(new Date());
}

function formatShortDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

function formatTime(time) {
  if (!time) return "";
  return formatTimeParts(time).label;
}

function formatTimeHtml(time) {
  if (!time) return "";
  const parts = formatTimeParts(time);
  const period = parts.period ? `<span class="time-period">${escapeHtml(parts.period)}</span>` : "";
  return `<span class="time-clock">${escapeHtml(parts.clock)}</span>${period}`;
}

function formatTimeParts(time) {
  const [hour, minute] = time.split(":");
  const date = new Date();
  date.setHours(Number(hour), Number(minute));
  const label = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
  const match = label.match(/^(.+?)\s?([AP]M)$/i);
  return {
    clock: match ? match[1].trim() : label,
    period: match ? match[2].toUpperCase() : "",
    label
  };
}

function daylightGradient(time) {
  if (!time) return "linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)";
  const [hour] = time.split(":").map(Number);
  if (hour < 5) return "linear-gradient(135deg, #172033 0%, #28385d 100%)";
  if (hour < 8) return "linear-gradient(135deg, #fff7ed 0%, #e0f2fe 100%)";
  if (hour < 12) return "linear-gradient(135deg, #ecfeff 0%, #dff7ff 100%)";
  if (hour < 17) return "linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)";
  if (hour < 20) return "linear-gradient(135deg, #fff7ed 0%, #fef3c7 45%, #dbeafe 100%)";
  return "linear-gradient(135deg, #111827 0%, #1e3a5f 100%)";
}

function isNightTime(time) {
  if (!time) return false;
  const [hour] = time.split(":").map(Number);
  return hour < 5 || hour >= 20;
}

function setPickerValues(date, time) {
  entryForm.elements.date.value = date;
  entryForm.elements.time.value = time;
  dateDisplay.textContent = formatShortDate(date);
  timeDisplay.innerHTML = formatTimeHtml(time);
  const timeControl = timeDisplay.closest(".picker-control");
  timeControl.style.setProperty("--time-gradient", daylightGradient(time));
  timeControl.classList.toggle("time-night", isNightTime(time));
}

function closePickers() {
  datePicker.classList.add("is-hidden");
  timePicker.classList.add("is-hidden");
}

function renderDatePicker() {
  const selected = entryForm.elements.date.value;
  const selectedDate = selected ? parseLocalDate(selected) : new Date();
  const year = pickerMonth.getFullYear();
  const month = pickerMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - firstDay.getDay());
  const monthLabel = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(firstDay);
  const weekdays = ["S", "M", "T", "W", "T", "F", "S"];
  const days = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    const dayValue = localDateString(day);
    const classes = [
      day.getMonth() !== month ? "is-muted" : "",
      dayValue === localDateString(selectedDate) ? "is-selected" : ""
    ]
      .filter(Boolean)
      .join(" ");
    return `<button class="${classes}" data-date="${dayValue}" type="button">${day.getDate()}</button>`;
  }).join("");

  datePicker.innerHTML = `
    <div class="picker-header">
      <strong>${escapeHtml(monthLabel)}</strong>
      <div class="picker-nav">
        <button data-month-shift="-1" type="button" aria-label="Previous month"><span class="material-symbols-outlined">keyboard_arrow_left</span></button>
        <button data-month-shift="1" type="button" aria-label="Next month"><span class="material-symbols-outlined">keyboard_arrow_right</span></button>
      </div>
    </div>
    <div class="picker-weekdays">${weekdays.map((day) => `<span>${day}</span>`).join("")}</div>
    <div class="date-grid">${days}</div>
  `;
}

function renderTimePicker() {
  const selected = entryForm.elements.time.value;
  const options = [];
  const isQuarterHour = selected.endsWith(":00") || selected.endsWith(":15") || selected.endsWith(":30") || selected.endsWith(":45");
  if (selected && !isQuarterHour) {
    options.push(`<button class="is-selected ${isNightTime(selected) ? "time-night" : ""}" data-time="${selected}" style="--time-gradient: ${daylightGradient(selected)}" type="button">${formatTimeHtml(selected)}</button>`);
  }
  for (let hour = 0; hour < 24; hour += 1) {
    for (let minute = 0; minute < 60; minute += 15) {
      const value = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      options.push(`<button class="${value === selected ? "is-selected" : ""} ${isNightTime(value) ? "time-night" : ""}" data-time="${value}" style="--time-gradient: ${daylightGradient(value)}" type="button">${formatTimeHtml(value)}</button>`);
    }
  }

  timePicker.innerHTML = `
    <div class="picker-header">
      <strong>Choose time</strong>
      <button class="text-button" data-time-now type="button">Now</button>
    </div>
    <div class="time-grid">${options.join("")}</div>
  `;
}

function parseLocalDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function sortEntries(entries) {
  return [...entries].sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`));
}

function entryTitle(entry) {
  if (entry.type === "Medication") return `${entry.medicationName || "Medication"}${entry.dose ? `, ${entry.dose}` : ""}`;
  if (entry.type === "Feeling") {
    const feelings = Array.isArray(entry.feeling) ? entry.feeling.join(", ") : entry.feeling;
    return `${feelings || "Feeling"}${entry.severity ? `, ${entry.severity.toLowerCase()}` : ""}`;
  }
  if (entry.type === "Symptom") {
    const symptoms = Array.isArray(entry.symptom) ? entry.symptom.join(", ") : entry.symptom;
    return `${symptoms || "Symptom"}${entry.severity ? `, ${severityLabel(entry.severity)}` : ""}`;
  }
  if (entry.type === "Behaviour") {
    const behaviours = Array.isArray(entry.behaviour) ? entry.behaviour.join(", ") : entry.behaviour;
    return `${behaviours || "Behaviour"}${entry.severity ? `, ${entry.severity.toLowerCase()}` : ""}`;
  }
  return "Care note";
}

function severityLabel(value) {
  return /^\d+$/.test(String(value)) ? `${value}/10` : String(value).toLowerCase();
}

function entryMeta(entry) {
  const pieces = [];
  if (entry.givenBy) pieces.push(`Given by ${entry.givenBy}`);
  if (entry.notes) pieces.push(entry.notes);
  return pieces.join(" · ");
}

function renderTimeline(container, entries, options = {}) {
  if (!entries.length) {
    container.innerHTML = '<div class="empty-state">No logs yet. Use quick log to add the first one.</div>';
    return;
  }

  container.innerHTML = sortEntries(entries)
    .map((entry) => {
      const config = typeConfig[entry.type] || typeConfig.Note;
      return `
        <article class="timeline-item">
          <div class="timeline-icon">
            <span class="material-symbols-outlined">${config.icon}</span>
          </div>
          <div class="timeline-body">
            <h4>${escapeHtml(entryTitle(entry))}</h4>
            <p>${escapeHtml(entryMeta(entry) || entry.type)}</p>
          </div>
          <div class="timeline-actions">
            ${entry.time ? `<span class="time-pill ${isNightTime(entry.time) ? "time-night" : ""}" style="--time-gradient: ${daylightGradient(entry.time)}">${formatTimeHtml(entry.time)}</span>` : ""}
            ${options.canDelete ? `
              <button class="icon-button delete-log-button" data-delete-log="${escapeHtml(entry.id)}" type="button" title="Delete log" aria-label="Delete ${escapeHtml(entryTitle(entry))}">
                <span class="material-symbols-outlined">delete</span>
              </button>
            ` : ""}
          </div>
        </article>
      `;
    })
    .join("");
}

function renderToday() {
  const todayEntries = state.entries.filter((entry) => entry.date === todayString());
  const meds = todayEntries.filter((entry) => entry.type === "Medication");
  const behaviours = todayEntries.filter((entry) => entry.type === "Behaviour");
  const lastFeeling = sortEntries(state.entries.filter((entry) => entry.type === "Feeling"))[0];

  document.querySelector("#lastFeeling").textContent = lastFeeling ? entryTitle(lastFeeling) : "No feeling logged yet";
  document.querySelector("#medsToday").textContent = `${meds.length} logged`;
  document.querySelector("#behavioursToday").textContent = `${behaviours.length} today`;

  renderTimeline(document.querySelector("#todayTimeline"), todayEntries);
}

function renderHistory() {
  const query = document.querySelector("#historySearch").value.trim().toLowerCase();
  const type = document.querySelector("#typeFilter").value;
  const filtered = state.entries.filter((entry) => {
    const matchesType = type === "All" || entry.type === type;
    const haystack = JSON.stringify(entry).toLowerCase();
    return matchesType && (!query || haystack.includes(query));
  });

  renderTimeline(document.querySelector("#historyTimeline"), filtered, { canDelete: true });
  renderExportCount();
}

function exportEntries() {
  return sortEntries(state.entries).filter((entry) => {
    if (exportScope.value !== "range") return true;
    const afterStart = !exportFrom.value || entry.date >= exportFrom.value;
    const beforeEnd = !exportTo.value || entry.date <= exportTo.value;
    return afterStart && beforeEnd;
  });
}

function renderExportCount() {
  const count = exportEntries().length;
  exportCount.textContent = `${count} ${count === 1 ? "log" : "logs"}`;
  syncHint.textContent = syncEnabled()
    ? "Google Sheets sync is configured for this device."
    : "Google Sheets sync is not configured on this device.";
  syncHint.classList.toggle("is-synced", syncEnabled());
}

function entryValue(value) {
  return Array.isArray(value) ? value.join("; ") : value || "";
}

function exportRows() {
  return exportEntries().map((entry) => ({
    Date: entry.date || "",
    Time: formatTime(entry.time || "00:00"),
    Category: entry.type || "",
    Medication: entry.medicationName || "",
    Dose: entry.dose || "",
    "Given by": entry.givenBy || "",
    Feelings: entryValue(entry.feeling),
    Symptoms: entryValue(entry.symptom),
    Behaviours: entryValue(entry.behaviour),
    Severity: entry.type === "Symptom" && entry.severity ? severityLabel(entry.severity) : entry.severity || "",
    Notes: entry.notes || "",
    "Logged at": entry.createdAt || ""
  }));
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function exportCsv() {
  const rows = exportRows();
  const headers = ["Date", "Time", "Category", "Medication", "Dose", "Given by", "Feelings", "Symptoms", "Behaviours", "Severity", "Notes", "Logged at"];
  const csvRows = [headers.join(",")];
  rows.forEach((row) => {
    csvRows.push(headers.map((header) => csvEscape(row[header])).join(","));
  });
  return csvRows.join("\n");
}

function exportFilename() {
  const stamp = exportScope.value === "range" && (exportFrom.value || exportTo.value)
    ? `${exportFrom.value || "start"}_to_${exportTo.value || "today"}`
    : "all_logs";
  return `neurolog_${stamp}.csv`;
}

function downloadExport() {
  const csv = exportCsv();
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = exportFilename();
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function emailExport() {
  const rows = exportRows();
  const csv = exportCsv();
  const subject = encodeURIComponent(`Neurolog care log export (${rows.length} ${rows.length === 1 ? "log" : "logs"})`);
  const rangeText = exportScope.value === "range" ? `Date range: ${exportFrom.value || "start"} to ${exportTo.value || "today"}` : "Date range: all logs";
  const body = encodeURIComponent([
    "Neurolog care log export for doctor review.",
    "",
    rangeText,
    `Log count: ${rows.length}`,
    "",
    "CSV data:",
    csv
  ].join("\n"));
  window.location.href = `mailto:?subject=${subject}&body=${body}`;
}

function renderPatient() {
  Object.entries(state.patient).forEach(([key, value]) => {
    const field = patientForm.elements[key];
    if (field) field.value = value;
  });
}

function renderSettings() {
  sheetApiUrlInput.value = sheetApiUrl;

  medicationSettingsList.innerHTML = presets.medications
    .map((medication, index) => `
      <div class="settings-row">
        <label>
          Medication name
          <input name="medicationName_${index}" type="text" value="${escapeHtml(medication.name)}" />
        </label>
        <label>
          Default dose/unit
          <input name="medicationDose_${index}" type="text" value="${escapeHtml(medication.defaultDose)}" />
        </label>
        ${settingsActionButton("medication", index, dirtySettings.medication.has(index))}
      </div>
    `)
    .join("");

  caregiverSettingsList.innerHTML = presets.caregivers
    .map((caregiver, index) => `
      <div class="settings-row caregiver-row">
        <label>
          Caregiver name
          <input name="caregiver_${index}" type="text" value="${escapeHtml(caregiver)}" />
        </label>
        ${settingsActionButton("caregiver", index, dirtySettings.caregiver.has(index))}
      </div>
    `)
    .join("");
}

function settingsActionButton(kind, index, isDirty) {
  const action = isDirty ? "save" : "remove";
  const icon = isDirty ? "save" : "delete";
  const label = isDirty ? "Save" : "Remove";
  return `
    <button class="ghost-button settings-action settings-${action}" data-${action}-setting="${kind}" data-index="${index}" type="button">
      <span class="material-symbols-outlined">${icon}</span>
      ${label}
    </button>
  `;
}

function render() {
  dateLabel.textContent = formatDisplayDate();
  renderToday();
  renderHistory();
  renderPatient();
  renderSettings();
  updateSettingsSaveButton();
}

function setRoute(route) {
  state.route = route;
  routeTitle.textContent = route.charAt(0).toUpperCase() + route.slice(1);
  document.querySelectorAll("[data-route-panel]").forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.routePanel === route);
  });
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.route === route);
  });
  if (route === "history") renderExportCount();
  updateSettingsSaveButton();
}

function hasUnsavedSettings() {
  return dirtySettings.medication.size > 0 || dirtySettings.caregiver.size > 0 || dirtySettings.sheet;
}

function updateSettingsSaveButton() {
  const shouldShow = state.route === "settings";
  const isDirty = hasUnsavedSettings();
  saveSettingsTopButton.classList.toggle("is-hidden", !shouldShow);
  saveSettingsTopButton.disabled = !isDirty;
}

function choiceField(name, label, options, isMultiple = false) {
  return `
    <fieldset>
      <legend>${label}</legend>
      <div class="choice-grid">
        ${options
          .map(
            (option, index) => `
              <label>
                <input type="${isMultiple ? "checkbox" : "radio"}" name="${name}" value="${escapeHtml(option)}" ${!isMultiple && index === 0 ? "checked" : ""} />
                <span>${escapeHtml(option)}</span>
              </label>
            `
          )
          .join("")}
      </div>
    </fieldset>
  `;
}

function severitySliderField() {
  return `
    <fieldset class="severity-slider-field">
      <legend>Severity</legend>
      <div class="severity-value" aria-live="polite">
        <strong data-severity-value>5</strong>
        <span>/10</span>
      </div>
      <input class="severity-slider" name="severity" type="range" min="0" max="10" step="1" value="5" aria-label="Symptom severity from 0 mild to 10 severe" />
      <div class="severity-scale" aria-hidden="true">
        <span>0 Mild</span>
        <span>10 Severe</span>
      </div>
    </fieldset>
  `;
}

function normalizeMedicationOptions(options) {
  return options.map((option) => {
    if (typeof option === "string") {
      return { name: option, defaultDose: defaultDoseForMedication(option) };
    }
    return {
      name: option.name || "",
      defaultDose: option.defaultDose || ""
    };
  }).filter((option) => option.name);
}

function defaultDoseForMedication(name) {
  const normalized = name.toLowerCase();
  if (normalized.includes("ibuprofen")) return "200mg tablets";
  if (normalized.includes("paracetamol")) return "500mg tablets";
  if (normalized.includes("dexamethasone")) return "2mg tablets";
  return "";
}

function medicationNames() {
  return presets.medications.map((medication) => medication.name);
}

function medicationDefaultDose(name) {
  return presets.medications.find((medication) => medication.name === name)?.defaultDose || "";
}

function selectOptions(options, selected = "") {
  return options.map((option) => `<option value="${escapeHtml(option)}" ${option === selected ? "selected" : ""}>${escapeHtml(option)}</option>`).join("");
}

function quickSelectField(name, label, options, selected) {
  return `
    <label>
      ${label}
      <select name="${name}" data-quick-select="${name}">
        ${selectOptions(options, selected)}
        <option value="">Not sure yet</option>
        <option value="__add__">Add new...</option>
      </select>
    </label>
  `;
}

function openEntryDialog(type) {
  entryForm.reset();
  entryForm.elements.type.value = type;
  setPickerValues(todayString(), new Date().toTimeString().slice(0, 5));
  pickerMonth = parseLocalDate(entryForm.elements.date.value);
  closePickers();
  document.querySelector("#entryTitle").textContent = typeConfig[type].title;
  document.querySelector("#entryEyebrow").textContent = "Quick log";
  dynamicFields.innerHTML = fieldsForType(type);
  entryDialog.showModal();
}

function fieldsForType(type) {
  if (type === "Medication") {
    const defaultMedication = medicationNames()[0] || "";
    return `
      ${quickSelectField("medicationName", "Medication", medicationNames(), defaultMedication)}
      <div class="inline-add-fields is-hidden" data-add-fields="medicationName">
        <label>
          New Medication Name
          <input name="newMedicationName" type="text" placeholder="Medication name" />
        </label>
        <label>
          Normal dose/unit
          <input name="newMedicationDose" type="text" placeholder="e.g. 200mg tablets" />
        </label>
      </div>
      <div class="field-row">
        <label>
          Dose
          <input name="dose" type="text" placeholder="Dose" value="${escapeHtml(medicationDefaultDose(defaultMedication))}" />
        </label>
        ${quickSelectField("givenBy", "Given by", presets.caregivers, "Alison")}
      </div>
      <div class="inline-add-fields is-hidden" data-add-fields="givenBy">
        <label>
          New Caregiver Name
          <input name="newCaregiverName" type="text" placeholder="Caregiver name" />
        </label>
      </div>
    `;
  }

  if (type === "Feeling") {
    return `${choiceField("feeling", "Feeling", presets.feelings, true)}${choiceField("severity", "Intensity", presets.severity)}`;
  }

  if (type === "Symptom") {
    return `${choiceField("symptom", "Symptom", presets.symptoms, true)}${severitySliderField()}`;
  }

  if (type === "Behaviour") {
    return `${choiceField("behaviour", "Behaviour", presets.behaviours, true)}${choiceField("severity", "Severity", presets.severity)}`;
  }

  return "";
}

async function handleEntrySubmit(event) {
  event.preventDefault();
  const submitter = event.submitter;
  if (submitter?.value === "cancel") {
    entryDialog.close();
    return;
  }

  const formData = new FormData(entryForm);
  const entry = {};
  formData.forEach((value, key) => {
    if (entry[key]) {
      entry[key] = Array.isArray(entry[key]) ? [...entry[key], value] : [entry[key], value];
    } else {
      entry[key] = value;
    }
  });
  Object.keys(entry).forEach((key) => {
    if (entry[key] === "__add__") entry[key] = "";
  });
  if (entry.type === "Medication") {
    const newMedicationName = entry.newMedicationName?.trim();
    const newMedicationDose = entry.newMedicationDose?.trim();
    const newCaregiverName = entry.newCaregiverName?.trim();

    if (newMedicationName) {
      entry.medicationName = newMedicationName;
      if (!entry.dose) entry.dose = newMedicationDose || "";
      if (!presets.medications.some((option) => option.name.toLowerCase() === newMedicationName.toLowerCase())) {
        presets.medications.push({ name: newMedicationName, defaultDose: newMedicationDose || "" });
        saveMedicationOptions();
      }
    }

    if (newCaregiverName) {
      entry.givenBy = newCaregiverName;
      if (!presets.caregivers.some((option) => option.toLowerCase() === newCaregiverName.toLowerCase())) {
        presets.caregivers.push(newCaregiverName);
        saveCaregiverOptions();
      }
    }
  }
  delete entry.newMedicationName;
  delete entry.newMedicationDose;
  delete entry.newCaregiverName;
  const savedEntry = {
    ...entry,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString()
  };
  state.entries.push(savedEntry);

  saveEntries();
  entryDialog.close();
  render();
  setRoute("today");

  if (syncEnabled()) {
    appendEntryToSheet(savedEntry)
      .then((didSync) => {
        if (didSync) refreshEntriesFromSheetSoon();
      })
      .catch(() => {});
  }
}

function deleteEntry(id) {
  const entry = state.entries.find((item) => item.id === id);
  if (!entry) return;
  const confirmed = window.confirm(`Delete this ${entry.type.toLowerCase()} log?`);
  if (!confirmed) return;

  state.entries = state.entries.filter((item) => item.id !== id);
  saveEntries();
  render();

  if (syncEnabled()) {
    deleteEntryFromSheet(id)
      .then((didSync) => {
        if (didSync) refreshEntriesFromSheetSoon();
      })
      .catch(() => {});
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function activeOptionList(name) {
  if (name === "medicationName") {
    return {
      values: medicationNames(),
      save: saveMedicationOptions,
      label: "medication"
    };
  }

  return {
    values: presets.caregivers,
    save: saveCaregiverOptions,
    label: "caregiver"
  };
}

function refreshMedicationFields() {
  const currentMedication = entryForm.elements.medicationName?.value;
  const currentCaregiver = entryForm.elements.givenBy?.value;
  const currentDose = entryForm.elements.dose?.value;
  dynamicFields.innerHTML = fieldsForType("Medication");
  if (entryForm.elements.medicationName && medicationNames().includes(currentMedication)) {
    entryForm.elements.medicationName.value = currentMedication;
  }
  if (entryForm.elements.givenBy && presets.caregivers.includes(currentCaregiver)) {
    entryForm.elements.givenBy.value = currentCaregiver;
  }
  if (entryForm.elements.dose) entryForm.elements.dose.value = currentDose || "";
}

function toggleInlineAddFields(name, shouldShow) {
  const fields = dynamicFields.querySelector(`[data-add-fields="${name}"]`);
  fields?.classList.toggle("is-hidden", !shouldShow);
  if (shouldShow) {
    fields?.querySelector("input")?.focus();
  }
}

function removeQuickOption(name) {
  const select = entryForm.elements[name];
  const value = select?.value;
  const list = activeOptionList(name);
  if (!value || value === "__add__" || list.values.length <= 1) return;

  if (name === "medicationName") {
    presets.medications = presets.medications.filter((option) => option.name !== value);
  }
  if (name === "givenBy") {
    presets.caregivers = presets.caregivers.filter((option) => option !== value);
  }
  list.save();
  refreshMedicationFields();
}

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const password = new FormData(loginForm).get("password");
  if (password === DEMO_PASSWORD) {
    setSession(true);
    render();
  } else {
    loginForm.querySelector("#password").value = "";
    loginForm.querySelector("#password").placeholder = "Try the local demo password";
  }
});

document.querySelectorAll("[data-route]").forEach((button) => {
  button.addEventListener("click", () => setRoute(button.dataset.route));
});

document.querySelectorAll("[data-entry-type]").forEach((button) => {
  button.addEventListener("click", () => openEntryDialog(button.dataset.entryType));
});

document.querySelector("#logoutButton").addEventListener("click", () => setSession(false));
navToggle.addEventListener("click", () => {
  setNavCollapsed(!appView.classList.contains("nav-collapsed"));
});
document.querySelectorAll("[data-picker]").forEach((button) => {
  button.addEventListener("click", () => {
    const pickerType = button.dataset.picker;
    const picker = pickerType === "date" ? datePicker : timePicker;
    const isOpen = !picker.classList.contains("is-hidden");
    closePickers();
    if (!isOpen) {
      if (pickerType === "date") renderDatePicker();
      if (pickerType === "time") renderTimePicker();
      picker.classList.remove("is-hidden");
    }
  });
});
datePicker.addEventListener("click", (event) => {
  const monthButton = event.target.closest("[data-month-shift]");
  const dateButton = event.target.closest("[data-date]");
  if (monthButton) {
    pickerMonth.setMonth(pickerMonth.getMonth() + Number(monthButton.dataset.monthShift));
    renderDatePicker();
  }
  if (dateButton) {
    setPickerValues(dateButton.dataset.date, entryForm.elements.time.value);
    pickerMonth = parseLocalDate(dateButton.dataset.date);
    closePickers();
  }
});
timePicker.addEventListener("click", (event) => {
  const nowButton = event.target.closest("[data-time-now]");
  const timeButton = event.target.closest("[data-time]");
  if (nowButton) {
    setPickerValues(entryForm.elements.date.value, new Date().toTimeString().slice(0, 5));
    closePickers();
  }
  if (timeButton) {
    setPickerValues(entryForm.elements.date.value, timeButton.dataset.time);
    closePickers();
  }
});
document.querySelector("#historySearch").addEventListener("input", renderHistory);
document.querySelector("#typeFilter").addEventListener("change", renderHistory);
document.querySelector("#historyTimeline").addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-delete-log]");
  if (!deleteButton) return;
  deleteEntry(deleteButton.dataset.deleteLog);
});
exportScope.addEventListener("change", () => {
  const isRange = exportScope.value === "range";
  document.querySelectorAll(".export-date-field").forEach((field) => {
    field.classList.toggle("is-hidden", !isRange);
  });
  renderExportCount();
});
exportFrom.addEventListener("change", renderExportCount);
exportTo.addEventListener("change", renderExportCount);
document.querySelector("#downloadExportButton").addEventListener("click", downloadExport);
document.querySelector("#emailExportButton").addEventListener("click", emailExport);
document.querySelector("#clearDemoButton").addEventListener("click", () => {
  state.entries = [];
  saveEntries();
  render();
});
document.querySelector("#syncButton").addEventListener("click", () => {
  if (!syncEnabled()) {
    alert("Add the Apps Script Web App URL in Settings to turn on Google Sheets sync.");
    return;
  }
  loadEntriesFromSheet().catch((error) => alert(error.message));
});
document.querySelector("#addMedicationSetting").addEventListener("click", () => {
  presets.medications.push({ name: "", defaultDose: "" });
  dirtySettings.medication.add(presets.medications.length - 1);
  renderSettings();
  updateSettingsSaveButton();
});
document.querySelector("#addCaregiverSetting").addEventListener("click", () => {
  presets.caregivers.push("");
  dirtySettings.caregiver.add(presets.caregivers.length - 1);
  renderSettings();
  updateSettingsSaveButton();
});
saveSettingsTopButton.addEventListener("click", () => {
  if (saveSettingsTopButton.disabled) return;
  saveSheetApiUrl();
  saveSettingsFromForm();
  dirtySettings.medication.clear();
  dirtySettings.caregiver.clear();
  dirtySettings.sheet = false;
  renderSettings();
  updateSettingsSaveButton();
});
copySetupLinkButton.addEventListener("click", async () => {
  saveSheetApiUrl();
  if (!syncEnabled()) {
    alert("Add the Apps Script Web App URL first, then copy the setup link.");
    return;
  }

  const link = publicSetupLink();
  try {
    await navigator.clipboard.writeText(link);
    copySetupLinkButton.innerHTML = '<span class="material-symbols-outlined">check</span> Copied';
    setTimeout(() => {
      copySetupLinkButton.innerHTML = '<span class="material-symbols-outlined">link</span> Copy setup link';
    }, 1800);
  } catch (error) {
    window.prompt("Copy this setup link and open it once in each browser/device:", link);
  }
});

entryForm.addEventListener("submit", handleEntrySubmit);
dynamicFields.addEventListener("change", (event) => {
  const select = event.target.closest("[data-quick-select]");
  if (select) toggleInlineAddFields(select.name, select.value === "__add__");
  if (select?.name === "medicationName" && select.value !== "__add__" && entryForm.elements.dose) {
    entryForm.elements.dose.value = medicationDefaultDose(select.value);
  }
});
dynamicFields.addEventListener("input", (event) => {
  if (!event.target.matches(".severity-slider")) return;
  const value = event.target.closest(".severity-slider-field")?.querySelector("[data-severity-value]");
  if (value) value.textContent = event.target.value;
});
dynamicFields.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-option]");
  if (removeButton) removeQuickOption(removeButton.dataset.removeOption);
});
patientForm.addEventListener("submit", (event) => {
  event.preventDefault();
  state.patient = Object.fromEntries(new FormData(patientForm).entries());
  savePatient();
});
settingsForm.addEventListener("click", (event) => {
  const saveButton = event.target.closest("[data-save-setting]");
  if (saveButton) {
    saveSheetApiUrl();
    saveSettingsFromForm();
    dirtySettings.medication.clear();
    dirtySettings.caregiver.clear();
    dirtySettings.sheet = false;
    renderSettings();
    updateSettingsSaveButton();
    return;
  }

  const removeButton = event.target.closest("[data-remove-setting]");
  if (!removeButton) return;

  const index = Number(removeButton.dataset.index);
  if (removeButton.dataset.removeSetting === "medication") {
    presets.medications.splice(index, 1);
  }
  if (removeButton.dataset.removeSetting === "caregiver") {
    presets.caregivers.splice(index, 1);
  }
  dirtySettings.medication.clear();
  dirtySettings.caregiver.clear();
  dirtySettings.sheet = false;
  renderSettings();
  updateSettingsSaveButton();
});
settingsForm.addEventListener("input", (event) => {
  if (event.target.matches("#sheetApiUrl")) {
    dirtySettings.sheet = true;
    updateSettingsSaveButton();
    return;
  }

  const row = event.target.closest(".settings-row");
  if (!row) return;

  const button = row.querySelector("[data-remove-setting], [data-save-setting]");
  const kind = button?.dataset.removeSetting || button?.dataset.saveSetting;
  const index = Number(button?.dataset.index);
  if (!kind || Number.isNaN(index)) return;

  dirtySettings[kind].add(index);
  button.outerHTML = settingsActionButton(kind, index, true);
  updateSettingsSaveButton();
});
settingsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveSheetApiUrl();
  saveSettingsFromForm();
  dirtySettings.medication.clear();
  dirtySettings.caregiver.clear();
  dirtySettings.sheet = false;
  renderSettings();
  updateSettingsSaveButton();
});

function saveSettingsFromForm() {
  const data = new FormData(settingsForm);

  presets.medications = presets.medications
    .map((_, index) => ({
      name: data.get(`medicationName_${index}`)?.trim() || "",
      defaultDose: data.get(`medicationDose_${index}`)?.trim() || ""
    }))
    .filter((medication) => medication.name);

  presets.caregivers = presets.caregivers
    .map((_, index) => data.get(`caregiver_${index}`)?.trim() || "")
    .filter(Boolean);

  saveMedicationOptions();
  saveCaregiverOptions();
}

loadState();
setNavCollapsed(localStorage.getItem(NAV_KEY) === "true");
setSession(sessionStorage.getItem(SESSION_KEY) === "active");
setRoute("today");
render();
loadEntriesFromSheet().catch(() => {});
