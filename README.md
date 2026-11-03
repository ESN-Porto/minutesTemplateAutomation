# ESN Porto GM minutes generator

A web app that creates General Meeting minutes from the GM agenda spreadsheet. An authorized volunteer selects a meeting and confirms generation; the app copies a Google Docs template into the configured Shared Drive or folder, fills it with the available meeting data, and returns a link to the new document. Every confirmation creates a new document.

The deployed app is available at [minutes-auto.vercel.app](https://minutes-auto.vercel.app/).

## How it works

1. The user signs in with their [IT Manager](https://it.esnporto.org/login) account. A volunteer account is required; an `@esnporto.org` email address is not required. Contact the IT Manager administrators if you need an invitation or volunteer access.
2. The browser signs in through the shared Supabase Auth project. For every protected request, the server validates the access token with Supabase and checks the verified user against the `has_project_access` function and the configured project slug. The current project is `minutes_generator`, configured for staff access; the shared access policy determines who is allowed in.
3. The server uses a Google service account to read the agenda spreadsheet. Meeting tabs named as valid dates in `DD/MM/YYYY` format appear in the selector, newest first.
4. After confirmation, the server reads the selected meeting, copies the configured Google Docs template to the destination, and fills the copy with the date, times, chairing teams, attendance and agenda topics. It also formats topic headings and labels.
5. The app shows a link to the new document and any warnings about missing information. Missing or invalid individual fields are left blank; users should review and complete the document. The next chairing team is looked up for exactly seven days after the selected meeting. If it cannot be identified, its fields are left blank with a warning.

If the copy is created but filling it fails, the app reports the failure and provides a recovery link to the incomplete document. Review that document before trying again: another confirmation creates another copy.

**App access and Google Drive access are separate.** The service account creates the documents, but the application does not automatically grant users permission to open them. Give the appropriate Google Group or people access to the destination Shared Drive or folder using Google Drive's sharing settings. A document link alone does not grant access.

## Annual maintenance

The spreadsheet mapping reflects the **2026/27 agenda layout**. At the start of each academic year, a maintainer should:

1. Set `GOOGLE_SPREADSHEET_ID` to the current agenda workbook ID if the workbook has changed. The ID is the part of its Google Sheets URL between `/d/` and the next `/`.
2. Review [api/_lib/agenda.js](api/_lib/agenda.js). The chairing-team tab is currently hard-coded as `Chairing Teams 26/27` and must be updated for the new year. Meeting data is currently read from `P1:AR66`, and the team table from `B2:E100`. Check that the ranges, header names, row positions, presence values, date format and topic fields still match the new agenda. Update the mapping and its tests if the layout changes.
3. Review the Google Docs template. If a new template is used, set `GOOGLE_TEMPLATE_ID` to its document ID and grant the service account Viewer access. Update `GOOGLE_DESTINATION_FOLDER_ID` if the destination has changed.
4. If template placeholders or its structure change, update the replacement and formatting logic in [api/_lib/google.js](api/_lib/google.js) and the corresponding tests. The generator expects all of its placeholders to be present; a missing placeholder makes generation fail after the copy is created.
5. Run the tests, deploy the updated configuration and code, and check an actual meeting and generated document: data, warnings, formatting, destination and access for intended users.

The current template uses `{{DATE}}`, `{{START}}`, `{{END}}`, `{{MAIN CHAIR}}`, `{{SPEAKERS}}`, `{{MINUTES}}`, `{{NEXT MAIN CHAIR}}`, `{{NEXT SPEAKERS}}`, `{{NEXT MINUTES}}`, `{{TOPIC LIST}}`, `{{TOPICS}}`, and the attendance placeholders for `MEMBERS`, `NEWMEMBERS`, `EXTERNALS` and `PARACHUTES`, including each category's `PRESENT` count (for example, `{{MEMBERS PRESENT}}`). Placeholder matching is case-sensitive.

## Setup and configuration

Use Node.js 22 and the Vercel CLI. Copy `.env.example` to `.env.local` and configure:

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Shared Supabase project URL, also used by the browser. |
| `SUPABASE_ANON_KEY` | Public Supabase anon key, also used by the browser. |
| `SUPABASE_PROJECT_SLUG` | Server-side project access identifier; currently `minutes_generator`. The project and its policy must already exist in the shared registry. |
| `GOOGLE_SERVICE_ACCOUNT_FILE` | Local development only: absolute path to the service-account JSON key outside the publicly served project directory. |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Full service-account JSON, stored as a secret environment variable in Vercel. If both credential variables are set, this takes precedence. |
| `GOOGLE_SPREADSHEET_ID` | Agenda spreadsheet ID. |
| `GOOGLE_TEMPLATE_ID` | Google Docs template ID. |
| `GOOGLE_DESTINATION_FOLDER_ID` | Destination Shared Drive or folder ID. |

The Supabase URL and anon key are public client configuration; the Google service-account key is secret. Never commit the key or paste it into chat. `.env.local` and service-account JSON files are ignored by Git. Keep local credentials outside the directory served by the development server.

Enable the Google Sheets, Google Drive and Google Docs APIs in the service account's Google Cloud project. Share the agenda spreadsheet and template with the service account's email as **Viewer**, and give it **Contributor** access to the destination Shared Drive, or the narrowest folder access that allows it to copy and edit the new documents. Google Workspace policies and template copy restrictions can still prevent access; ask the Workspace administrator if needed.

For Vercel, configure the variables for the appropriate environment and keep `GOOGLE_SERVICE_ACCOUNT_FILE` unset. Use separate credentials and destinations for development, preview and production; do not give preview deployments production Google credentials. Redeploy after changing Vercel environment variables so the new values take effect.

## Local development

```sh
npm install
npm test
npm run local
```

`npm run local` loads `.env.local` and starts the Vercel development server. Sign in with an account authorized for the configured Supabase project to exercise the protected endpoints. Generation creates a real Google document in the configured destination.

## Troubleshooting

- **Sign-in is disabled:** check `SUPABASE_URL` and `SUPABASE_ANON_KEY` for the deployed environment, then redeploy.
- **Signed in but access denied:** check the account's volunteer access and the `minutes_generator` policy in the shared IT Manager/Supabase project.
- **Dates do not load / `GOOGLE_CONFIG_MISSING`:** check `GOOGLE_SPREADSHEET_ID` and the service-account credentials in the active environment. Confirm the account can read the spreadsheet and the Sheets API is enabled.
- **A date is missing:** its sheet tab must be named as a valid `DD/MM/YYYY` date.
- **Generation fails or fields are missing:** check template and destination IDs, Google permissions, the current spreadsheet mapping, warnings and template placeholders. If a recovery link is shown, inspect the incomplete copy.
- **A user cannot open the generated document:** check the user's Google Drive or group membership and the destination's sharing permissions; app login does not grant Drive access.

The shared `has_project_access` function has historically been callable with an arbitrary user ID. This app passes only the ID returned by Supabase's verified user lookup, but maintainers of the shared project should review direct RPC access and its implications separately.

## Project structure

- `index.html`, `style.css`, `ui.js`, `assets/app.js`: browser interface and sign-in.
- `api/config.js`, `api/session.js`, `api/meetings.js`, `api/generate.js`: Vercel endpoints.
- `api/_lib/auth.js`: server-side authentication and project authorization.
- `api/_lib/agenda.js`: meeting discovery and spreadsheet mapping.
- `api/_lib/google.js`: server-side Google credentials, API requests and document generation.
- `test/`: Node.js tests for the endpoints and integration logic.
