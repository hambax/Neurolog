const SPREADSHEET_ID = "PASTE_YOUR_PRIVATE_GOOGLE_SHEET_ID_HERE";
const LOG_SHEET_NAME = "DailyLog";

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

function doGet(event) {
  const action = event.parameter.action;

  if (action === "listLogs") {
    return jsonResponse(event, {
      ok: true,
      entries: listLogs()
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

  return jsonResponse({}, {
    ok: false,
    error: "Unknown action"
  });
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
  if (!id) return false;

  const sheet = logSheet();
  const values = sheet.getDataRange().getValues();
  for (let index = values.length - 1; index >= 1; index -= 1) {
    if (String(values[index][0]) === String(id)) {
      sheet.deleteRow(index + 1);
      return true;
    }
  }

  return false;
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
