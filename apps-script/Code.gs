const SPREADSHEET_ID = "PASTE_YOUR_PRIVATE_GOOGLE_SHEET_ID_HERE";
const LOG_SHEET_NAME = "DailyLog";
const MEDICATION_PLAN_SHEET_NAME = "MedicationPlan";

const LOG_HEADERS = [
  "id",
  "createdAt",
  "date",
  "time",
  "type",
  "medicationName",
  "dose",
  "givenBy",
  "feeling",
  "symptom",
  "behaviour",
  "severity",
  "notes",
  "rawJson",
  "mealType"
];

const MEDICATION_PLAN_HEADERS = [
  "id",
  "medicationName",
  "dose",
  "time",
  "sortOrder",
  "foodInstruction",
  "notes",
  "isActive",
  "updatedAt"
];

function doGet(event) {
  const action = event.parameter.action;

  if (action === "listLogs") {
    return jsonResponse(event, {
      ok: true,
      entries: listLogs()
    });
  }

  if (action === "listMedicationPlan") {
    return jsonResponse(event, {
      ok: true,
      plan: listMedicationPlan()
    });
  }

  if (action === "deleteLog") {
    return jsonResponse(event, {
      ok: true,
      deleted: deleteLog(event.parameter.id)
    });
  }

  return jsonResponse(event, {
    ok: false,
    error: "Unknown action"
  });
}

function doPost(event) {
  const payload = JSON.parse(event.postData.contents || "{}");

  if (payload.action === "appendLog") {
    appendLog(payload.entry || {});
    return jsonResponse({}, { ok: true });
  }

  if (payload.action === "deleteLog") {
    return jsonResponse({}, {
      ok: true,
      deleted: deleteLog(payload.id)
    });
  }

  if (payload.action === "saveMedicationPlan") {
    saveMedicationPlan(payload.plan || []);
    return jsonResponse({}, { ok: true });
  }

  return jsonResponse({}, {
    ok: false,
    error: "Unknown action"
  });
}

function listMedicationPlan() {
  const sheet = medicationPlanSheet();
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];

  return values.slice(1).filter((row) => row[0] || row[1]).map((row, index) => ({
    id: row[0] || Utilities.getUuid(),
    medicationName: row[1] || "",
    dose: row[2] || "",
    time: row[3] || "",
    sortOrder: Number(row[4]) || index + 1,
    foodInstruction: row[5] || "No food instruction",
    notes: row[6] || "",
    isActive: row[7] === false || row[7] === "false" ? false : true
  }));
}

function saveMedicationPlan(plan) {
  const sheet = medicationPlanSheet();
  sheet.clearContents();
  sheet.getRange(1, 1, 1, MEDICATION_PLAN_HEADERS.length).setValues([MEDICATION_PLAN_HEADERS]);
  sheet.setFrozenRows(1);

  const updatedAt = new Date().toISOString();
  const rows = plan.map((item, index) => [
    item.id || Utilities.getUuid(),
    item.medicationName || "",
    item.dose || "",
    item.time || "",
    Number(item.sortOrder) || index + 1,
    item.foodInstruction || "No food instruction",
    item.notes || "",
    item.isActive === false || item.isActive === "false" ? false : true,
    updatedAt
  ]);

  if (rows.length) {
    sheet.getRange(2, 1, rows.length, MEDICATION_PLAN_HEADERS.length).setValues(rows);
  }
}

function listLogs() {
  const sheet = logSheet();
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];

  return values.slice(1).filter((row) => row[0]).map((row) => {
    const rawJson = row[13];
    if (rawJson) {
      try {
        return JSON.parse(rawJson);
      } catch (error) {
        // Fall through to column reconstruction.
      }
    }

    return {
      id: row[0],
      createdAt: row[1],
      date: row[2],
      time: row[3],
      type: row[4],
      medicationName: row[5],
      dose: row[6],
      givenBy: row[7],
      feeling: splitMultiValue(row[8]),
      symptom: splitMultiValue(row[9]),
      behaviour: splitMultiValue(row[10]),
      severity: row[11],
      notes: row[12],
      mealType: row[14] || ""
    };
  });
}

function appendLog(entry) {
  const sheet = logSheet();
  const normalized = {
    id: entry.id || Utilities.getUuid(),
    createdAt: entry.createdAt || new Date().toISOString(),
    date: entry.date || "",
    time: entry.time || "",
    type: entry.type || "",
    medicationName: entry.medicationName || "",
    dose: entry.dose || "",
    givenBy: entry.givenBy || "",
    feeling: entry.feeling || "",
    symptom: entry.symptom || "",
    behaviour: entry.behaviour || "",
    severity: entry.severity || "",
    notes: entry.notes || "",
    mealType: entry.mealType || ""
  };

  sheet.appendRow([
    normalized.id,
    normalized.createdAt,
    normalized.date,
    normalized.time,
    normalized.type,
    normalized.medicationName,
    normalized.dose,
    normalized.givenBy,
    joinMultiValue(normalized.feeling),
    joinMultiValue(normalized.symptom),
    joinMultiValue(normalized.behaviour),
    normalized.severity,
    normalized.notes,
    JSON.stringify(normalized),
    normalized.mealType
  ]);
}

function deleteLog(id) {
  const targetId = normalizeLogId(id);
  if (!targetId) return false;

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return deleteSingleLogRowById(targetId);
  } finally {
    lock.releaseLock();
  }
}

function deleteSingleLogRowById(targetId) {
  const sheet = logSheet();
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return false;

  const headers = values[0].map((value) => String(value || ""));
  const idColumnIndex = headers.indexOf("id");
  if (idColumnIndex === -1) return false;

  for (let index = values.length - 1; index >= 1; index -= 1) {
    if (String(values[index][idColumnIndex]) === targetId) {
      sheet.deleteRow(index + 1);
      return true;
    }
  }

  return false;
}

function normalizeLogId(id) {
  const value = String(id || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value
    : "";
}

function logSheet() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(LOG_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(LOG_SHEET_NAME);

  const firstRowWidth = Math.max(sheet.getLastColumn(), LOG_HEADERS.length);
  const firstRow = sheet.getRange(1, 1, 1, firstRowWidth).getValues()[0];
  const hasHeaders = firstRow.join("") !== "";
  if (!hasHeaders) {
    sheet.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS]);
    sheet.setFrozenRows(1);
    return sheet;
  }

  // Append new columns without shifting existing log data.
  const currentHeaders = firstRow.map((value) => String(value || ""));
  LOG_HEADERS.forEach((header) => {
    if (currentHeaders.includes(header)) return;
    const nextColumn = sheet.getLastColumn() + 1;
    sheet.getRange(1, nextColumn).setValue(header);
    currentHeaders.push(header);
  });

  return sheet;
}

function medicationPlanSheet() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(MEDICATION_PLAN_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(MEDICATION_PLAN_SHEET_NAME);

  const firstRowWidth = Math.max(sheet.getLastColumn(), MEDICATION_PLAN_HEADERS.length);
  const firstRow = sheet.getRange(1, 1, 1, firstRowWidth).getValues()[0];
  const hasHeaders = firstRow.join("") !== "";
  if (!hasHeaders) {
    sheet.getRange(1, 1, 1, MEDICATION_PLAN_HEADERS.length).setValues([MEDICATION_PLAN_HEADERS]);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function jsonResponse(event, payload) {
  const callback = event.parameter && event.parameter.callback;
  const json = JSON.stringify(payload);
  if (callback) {
    return ContentService
      .createTextOutput(`${callback}(${json});`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function joinMultiValue(value) {
  return Array.isArray(value) ? value.join("; ") : value;
}

function splitMultiValue(value) {
  if (!value) return "";
  const parts = String(value).split(";").map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts : parts[0] || "";
}
