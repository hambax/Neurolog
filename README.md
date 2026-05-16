# Neurolog

Neurolog is a simple one-patient family caregiver app for logging brain tumour recovery care notes.

The first local version is a static web app that stores data in the browser with `localStorage`. It is intentionally built without a frontend framework so it can be deployed to GitHub Pages later with almost no moving parts.

## Local Preview

Run a static server from this folder:

```sh
python3 -m http.server 4173
```

Then open:

```text
http://localhost:4173
```

## MVP Scope

- One patient only
- Quick medication logging
- Quick feeling logging
- Quick symptom logging
- Quick behaviour logging
- Care notes
- Today timeline
- Searchable history
- Editable patient information
- Email sharing of the Google Sheet link
- CSV and A4 PDF exports with optional date range

## Google Sheets Database

GitHub Pages hosts the static interface. Logs are read and written through a Google Apps Script web app connected to a private Google Sheet.

The Apps Script backend is in:

```text
apps-script/Code.gs
```

It creates/uses a `DailyLog` tab with doctor-readable columns.

## Apps Script Deploy Steps

1. Open the Google Sheet.
2. Go to `Extensions` > `Apps Script`.
3. Paste the contents of `apps-script/Code.gs`.
4. Replace `PASTE_YOUR_PRIVATE_GOOGLE_SHEET_ID_HERE` with the Sheet ID from the private Sheet URL.
5. Add `apps-script/appsscript.json` settings if using the manifest editor.
6. Deploy as a Web App.
7. Set execution to run as you.
8. Allow access to the script.
9. Copy the Web App URL.
10. Open the deployed app, go to `Settings`, paste the Web App URL into `Google Sheets sync`, and save settings.

The public app includes the current Apps Script Web App URL so family devices can load from and write to Google Sheets by default. This is convenient for the family workflow, but it is not strong security because the endpoint can be viewed in the public site source.

For phone setup, open the app, go to `Settings`, paste the Apps Script Web App URL, then use `Copy setup link`. Open that setup link once on each caregiver phone/browser before saving the webpage to the Home Screen. After that, the app loads logs from Google Sheets when sync is configured.

Suggested sheet tabs:

- `DailyLog`

`DailyLog` columns:

```text
id | createdAt | date | time | type | medicationName | dose | givenBy | feeling | symptom | behaviour | severity | notes | rawJson
```
