const STORAGE_KEY = "neurolog_entries_v1";
const PATIENT_KEY = "neurolog_patient_v1";
const NAV_KEY = "neurolog_nav_collapsed_v1";
const MEDICATION_OPTIONS_KEY = "neurolog_medication_options_v3";
const CAREGIVER_OPTIONS_KEY = "neurolog_caregiver_options_v2";
const SHEET_API_URL_KEY = "neurolog_sheet_api_url_v1";
const DEFAULT_SHEET_API_URL = "https://script.google.com/macros/s/AKfycbxgT7Jy4EkygawrzfEm6k1LBKLcUdW1ro_U2_gI5ELUfHvjHymkA90KfbYfE2An3cR1/exec";
const GOOGLE_SHEET_URL = "https://docs.google.com/spreadsheets/d/1hGzv8MHI8NURpMbNap-SIUH-1La8ggM9hgkVU8POv3c/edit?usp=sharing";
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
    { name: "Dexamethasone", defaultDose: "4mg per tablet" },
    { name: "Ondansetron", defaultDose: "4mg per tablet" },
    { name: "Candesartan cilexetil", defaultDose: "16mg per tablet" },
    { name: "Atorvastatin", defaultDose: "40mg per tablet" },
    { name: "Omeprazole", defaultDose: "20mg per tablet" },
    { name: "Paracetamol", defaultDose: "500mg per tablet" },
    { name: "Ibuprofen", defaultDose: "200mg per tablet" }
  ],
  caregivers: ["Alison", "Hamish", "Tami", "Nurse", "Doctor", "Paramedic", "Family member", "Friend"]
};

const appView = document.querySelector('[data-view="app"]');
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
const syncButton = document.querySelector("#syncButton");
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
const pdfPreviewDialog = document.querySelector("#pdfPreviewDialog");
const pdfPreviewContent = document.querySelector("#pdfPreviewContent");
const pdfPrintArea = document.querySelector("#pdfPrintArea");

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

async function refreshSheetNow() {
  if (!syncEnabled()) {
    alert("Google Sheets sync is not configured.");
    return;
  }

  syncButton.disabled = true;
  syncButton.title = "Refreshing from spreadsheet";
  syncButton.setAttribute("aria-label", "Refreshing from spreadsheet");
  syncButton.innerHTML = '<span class="material-symbols-outlined">progress_activity</span>';

  try {
    await loadEntriesFromSheet();
    syncButton.innerHTML = '<span class="material-symbols-outlined">cloud_done</span>';
    syncButton.title = "Spreadsheet refreshed";
    syncButton.setAttribute("aria-label", "Spreadsheet refreshed");
    window.setTimeout(() => {
      syncButton.innerHTML = '<span class="material-symbols-outlined">sync</span>';
      syncButton.title = "Refresh from spreadsheet";
      syncButton.setAttribute("aria-label", "Refresh from spreadsheet");
    }, 1600);
  } catch (error) {
    syncButton.innerHTML = '<span class="material-symbols-outlined">sync_problem</span>';
    syncButton.title = "Refresh failed";
    syncButton.setAttribute("aria-label", "Refresh failed");
    alert(error.message);
  } finally {
    syncButton.disabled = false;
  }
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
    return `${feelings || "Feeling"}${entry.severity ? `, ${severityLabel(entry.severity)}` : ""}`;
  }
  if (entry.type === "Symptom") {
    const symptoms = Array.isArray(entry.symptom) ? entry.symptom.join(", ") : entry.symptom;
    return `${symptoms || "Symptom"}${entry.severity ? `, ${severityLabel(entry.severity)}` : ""}`;
  }
  if (entry.type === "Behaviour") {
    const behaviours = Array.isArray(entry.behaviour) ? entry.behaviour.join(", ") : entry.behaviour;
    return `${behaviours || "Behaviour"}${entry.severity ? `, ${severityLabel(entry.severity)}` : ""}`;
  }
  return "Care note";
}

function severityTerm(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return String(value || "").toLowerCase();
  if (score <= 2) return "mild";
  if (score <= 5) return "moderate";
  if (score <= 8) return "severe";
  return "extreme";
}

function severityLabel(value) {
  return /^\d+$/.test(String(value)) ? `${value}/10, ${severityTerm(value)}` : String(value).toLowerCase();
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
    Severity: entry.severity ? severityLabel(entry.severity) : "",
    Notes: entry.notes || "",
    "Logged at": entry.createdAt || ""
  }));
}

function exportRangeLabel() {
  return exportScope.value === "range"
    ? `${exportFrom.value || "Start"} to ${exportTo.value || "Today"}`
    : "All logs";
}

function printableRows() {
  return exportEntries().map((entry) => {
    const detailParts = [];
    if (entry.medicationName) detailParts.push(entry.medicationName);
    if (entry.dose) detailParts.push(entry.dose);
    if (entry.givenBy) detailParts.push(`Given by ${entry.givenBy}`);
    if (entryValue(entry.feeling)) detailParts.push(`Feeling: ${entryValue(entry.feeling)}`);
    if (entryValue(entry.symptom)) detailParts.push(`Symptom: ${entryValue(entry.symptom)}`);
    if (entryValue(entry.behaviour)) detailParts.push(`Behaviour: ${entryValue(entry.behaviour)}`);

    return {
      date: entry.date || "",
      time: formatTime(entry.time || "00:00"),
      category: entry.type || "",
      details: detailParts.join(" · ") || entry.type || "",
      severity: entry.severity ? severityLabel(entry.severity) : "",
      notes: entry.notes || ""
    };
  });
}

function pdfDocumentHtml() {
  const rows = printableRows();
  const generatedAt = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date());

  return `
    <section class="pdf-page">
      <header class="pdf-header">
        <div>
          <p>Neurolog care log</p>
          <h1>Doctor review export</h1>
        </div>
        <div>
          <strong>${escapeHtml(exportRangeLabel())}</strong>
          <span>${rows.length} ${rows.length === 1 ? "log" : "logs"}</span>
        </div>
      </header>
      <table class="pdf-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Time</th>
            <th>Type</th>
            <th>Details</th>
            <th>Severity</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length ? rows.map((row) => `
            <tr>
              <td>${escapeHtml(row.date)}</td>
              <td>${escapeHtml(row.time)}</td>
              <td>${escapeHtml(row.category)}</td>
              <td>${escapeHtml(row.details)}</td>
              <td>${escapeHtml(row.severity)}</td>
              <td>${escapeHtml(row.notes)}</td>
            </tr>
          `).join("") : '<tr><td colspan="6">No logs in this export range.</td></tr>'}
        </tbody>
      </table>
      <footer class="pdf-footer">
        <span>Generated ${escapeHtml(generatedAt)}</span>
        <span>${escapeHtml(GOOGLE_SHEET_URL)}</span>
      </footer>
    </section>
  `;
}

function pdfSafeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pdfEscape(value) {
  return pdfSafeText(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function pdfText(x, y, size, text, font = "F1") {
  return `BT /${font} ${size} Tf ${x} ${y} Td (${pdfEscape(text)}) Tj ET`;
}

function wrapPdfText(value, maxChars) {
  const words = pdfSafeText(value).split(" ").filter(Boolean);
  const lines = [];
  let line = "";

  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= maxChars) {
      line = next;
      return;
    }
    if (line) lines.push(line);
    line = word.length > maxChars ? `${word.slice(0, maxChars - 1)}...` : word;
  });

  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function buildPdfPages() {
  const rows = printableRows();
  const pageWidth = 842;
  const pageHeight = 595;
  const margin = 36;
  const columns = [
    { label: "Date", key: "date", x: 36, width: 70, chars: 12 },
    { label: "Time", key: "time", x: 106, width: 52, chars: 9 },
    { label: "Type", key: "category", x: 158, width: 70, chars: 11 },
    { label: "Details", key: "details", x: 228, width: 284, chars: 45 },
    { label: "Severity", key: "severity", x: 512, width: 62, chars: 10 },
    { label: "Notes", key: "notes", x: 574, width: 232, chars: 36 }
  ];
  const pages = [];
  let commands = [];
  let y = 0;

  function startPage() {
    commands = [
      "0.93 0.97 1 rg 0 0 842 595 re f",
      "1 1 1 rg 24 24 794 547 re f",
      "0.82 0.90 0.96 RG 24 24 794 547 re S",
      pdfText(margin, 548, 10, "Neurolog care log", "F2"),
      pdfText(margin, 526, 20, "Doctor review export", "F2"),
      pdfText(610, 548, 10, exportRangeLabel(), "F2"),
      pdfText(610, 530, 10, `${rows.length} ${rows.length === 1 ? "log" : "logs"}`),
      "0.86 0.95 1 rg 36 494 770 24 re f",
      "0.74 0.84 0.92 RG 36 494 770 24 re S"
    ];
    columns.forEach((column) => {
      commands.push(pdfText(column.x + 5, 502, 9, column.label, "F2"));
    });
    y = 480;
  }

  function finishPage() {
    commands.push(pdfText(margin, 34, 8, `Generated ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date())}`));
    commands.push(pdfText(282, 34, 8, GOOGLE_SHEET_URL));
    pages.push(commands.join("\n"));
  }

  startPage();

  const sourceRows = rows.length ? rows : [{ date: "", time: "", category: "", details: "No logs in this export range.", severity: "", notes: "" }];
  sourceRows.forEach((row) => {
    const wrapped = columns.map((column) => wrapPdfText(row[column.key], column.chars));
    const lineCount = Math.max(...wrapped.map((lines) => lines.length));
    const rowHeight = Math.max(24, lineCount * 11 + 12);

    if (y - rowHeight < 54) {
      finishPage();
      startPage();
    }

    commands.push("1 1 1 rg");
    commands.push(`36 ${y - rowHeight + 8} 770 ${rowHeight} re f`);
    commands.push("0.88 0.93 0.97 RG");
    commands.push(`36 ${y - rowHeight + 8} 770 ${rowHeight} re S`);

    wrapped.forEach((lines, columnIndex) => {
      const column = columns[columnIndex];
      lines.slice(0, 5).forEach((line, lineIndex) => {
        commands.push(pdfText(column.x + 5, y - 5 - lineIndex * 11, 8.5, line));
      });
    });
    y -= rowHeight;
  });

  finishPage();
  return { pages, pageWidth, pageHeight };
}

function exportPdfBlob() {
  const { pages, pageWidth, pageHeight } = buildPdfPages();
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids ${pages.map((_, index) => `${5 + index * 2} 0 R`).join(" ")} /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"
  ];

  pages.forEach((content, index) => {
    const pageObjectNumber = 5 + index * 2;
    const contentObjectNumber = pageObjectNumber + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`);
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Blob([pdf], { type: "application/pdf" });
}

function pdfFilename() {
  return exportFilename().replace(/\.csv$/, ".pdf");
}

function previewPdfExport() {
  const html = pdfDocumentHtml();
  pdfPreviewContent.innerHTML = html;
  pdfPrintArea.innerHTML = html;
  pdfPreviewDialog.showModal();
}

function printPdfExport() {
  pdfPrintArea.innerHTML = pdfDocumentHtml();
  window.print();
}

function downloadPdfExport() {
  const blob = exportPdfBlob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = pdfFilename();
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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
  const subject = `Neurolog care log sheet (${rows.length} ${rows.length === 1 ? "log" : "logs"})`;
  const body = [
    "Neurolog care log for doctor review:",
    "",
    GOOGLE_SHEET_URL,
    "",
    `Date range selected in app: ${exportRangeLabel()}`,
    `Log count: ${rows.length}`,
  ].join("\n");
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

async function sharePdfExport() {
  const rows = exportRows();
  const subject = `Neurolog care log sheet (${rows.length} ${rows.length === 1 ? "log" : "logs"})`;
  const text = [
    "Neurolog care log for doctor review:",
    GOOGLE_SHEET_URL,
    "",
    `Date range selected in app: ${exportRangeLabel()}`,
    `Log count: ${rows.length}`
  ].join("\n");
  const file = new File([exportPdfBlob()], pdfFilename(), { type: "application/pdf" });

  if (navigator.canShare?.({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({
        title: subject,
        text,
        files: [file]
      });
      return;
    } catch (error) {
      if (error.name === "AbortError") return;
    }
  }

  downloadPdfExport();
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`${text}\n\nPDF downloaded separately. Attach the downloaded PDF to this email if needed.`)}`;
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
          Single pill size
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
  const defaultSeverity = 5;
  return `
    <fieldset class="severity-slider-field">
      <legend>Severity</legend>
      <div class="severity-value" aria-live="polite">
        <strong data-severity-value>${defaultSeverity}</strong>
        <span>/10</span>
        <em data-severity-term>${severityTerm(defaultSeverity)}</em>
      </div>
      <input class="severity-slider" name="severity" type="range" min="0" max="10" step="1" value="${defaultSeverity}" aria-label="Severity from 0 mild to 10 extreme" />
      <div class="severity-scale" aria-hidden="true">
        <span>0 Mild</span>
        <span>10 Extreme</span>
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
  if (normalized.includes("ibuprofen")) return "200mg per tablet";
  if (normalized.includes("paracetamol")) return "500mg per tablet";
  if (normalized.includes("omeprazole")) return "20mg per tablet";
  if (normalized.includes("atorvastatin")) return "40mg per tablet";
  if (normalized.includes("candesartan")) return "16mg per tablet";
  if (normalized.includes("ondansetron")) return "4mg per tablet";
  if (normalized.includes("dexamethasone") || normalized.includes("dexamethazone")) return "4mg per tablet";
  return "";
}

function medicationNames() {
  return presets.medications.map((medication) => medication.name);
}

function medicationDefaultDose(name) {
  return presets.medications.find((medication) => medication.name === name)?.defaultDose || "";
}

function parseDoseText(value) {
  const match = String(value || "").trim().match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)(.*)$/);
  if (!match) return null;
  return {
    amount: Number(match[1]),
    unit: match[2],
    suffix: match[3].trim()
  };
}

function formatDoseAmount(amount, unit, suffix = "") {
  const cleanAmount = Number.isInteger(amount) ? String(amount) : String(Number(amount.toFixed(2)));
  return suffix ? `${cleanAmount}${unit} ${suffix}` : `${cleanAmount}${unit}`;
}

function selectedMedicationDoseUnit() {
  const selectedMedication = entryForm.elements.medicationName?.value;
  if (selectedMedication && selectedMedication !== "__add__") return medicationDefaultDose(selectedMedication);
  return entryForm.elements.newMedicationDose?.value.trim() || "";
}

function stepMedicationDose(direction) {
  const doseInput = entryForm.elements.dose;
  if (!doseInput) return;

  const baseDose = parseDoseText(selectedMedicationDoseUnit());
  if (!baseDose || !Number.isFinite(baseDose.amount) || baseDose.amount <= 0) return;

  const currentDose = parseDoseText(doseInput.value);
  const currentAmount = currentDose && currentDose.unit.toLowerCase() === baseDose.unit.toLowerCase()
    ? currentDose.amount
    : baseDose.amount;
  const nextAmount = Math.max(baseDose.amount, currentAmount + baseDose.amount * direction);

  doseInput.value = nextAmount === baseDose.amount
    ? formatDoseAmount(baseDose.amount, baseDose.unit, baseDose.suffix)
    : formatDoseAmount(nextAmount, baseDose.unit);
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
          Single pill size
          <input name="newMedicationDose" type="text" placeholder="e.g. 200mg per tablet" />
        </label>
      </div>
      <div class="field-row">
        <label class="dose-field">
          Dose
          <div class="dose-stepper">
            <button class="dose-step-button" data-dose-step="-1" type="button" aria-label="Decrease dose">
              <span class="material-symbols-outlined">remove</span>
            </button>
            <input name="dose" type="text" placeholder="Dose given" value="${escapeHtml(medicationDefaultDose(defaultMedication))}" />
            <button class="dose-step-button" data-dose-step="1" type="button" aria-label="Increase dose">
              <span class="material-symbols-outlined">add</span>
            </button>
          </div>
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
    return `${choiceField("feeling", "Feeling", presets.feelings, true)}${severitySliderField()}`;
  }

  if (type === "Symptom") {
    return `${choiceField("symptom", "Symptom", presets.symptoms, true)}${severitySliderField()}`;
  }

  if (type === "Behaviour") {
    return `${choiceField("behaviour", "Behaviour", presets.behaviours, true)}${severitySliderField()}`;
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

document.querySelectorAll("[data-route]").forEach((button) => {
  button.addEventListener("click", () => setRoute(button.dataset.route));
});

document.querySelectorAll("[data-entry-type]").forEach((button) => {
  button.addEventListener("click", () => openEntryDialog(button.dataset.entryType));
});

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
document.querySelector("#emailExportButton").addEventListener("click", sharePdfExport);
document.querySelector("#previewPdfButton").addEventListener("click", previewPdfExport);
document.querySelector("#printPdfButton").addEventListener("click", printPdfExport);
syncButton.addEventListener("click", refreshSheetNow);
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
  if (event.target.matches('[name="newMedicationDose"]') && entryForm.elements.medicationName?.value === "__add__" && entryForm.elements.dose && !entryForm.elements.dose.value.trim()) {
    entryForm.elements.dose.value = event.target.value.trim();
  }
  if (!event.target.matches(".severity-slider")) return;
  const field = event.target.closest(".severity-slider-field");
  const value = field?.querySelector("[data-severity-value]");
  const term = field?.querySelector("[data-severity-term]");
  if (value) value.textContent = event.target.value;
  if (term) term.textContent = severityTerm(event.target.value);
});
dynamicFields.addEventListener("click", (event) => {
  const doseButton = event.target.closest("[data-dose-step]");
  if (doseButton) {
    stepMedicationDose(Number(doseButton.dataset.doseStep));
    return;
  }

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
setRoute("today");
render();
loadEntriesFromSheet().catch(() => {});
