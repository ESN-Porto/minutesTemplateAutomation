# ESN Porto GM minutes generator

Static browser UI with protected Vercel Functions. The browser signs in with the existing Supabase Auth project. Every protected request verifies the access token with Supabase and calls the existing `has_project_access` RPC with the verified user ID. Google Sheets, Drive and Docs operations use server-only service-account credentials.

## Local development

Use Node.js 22 and the Vercel CLI. Copy `.env.example` to `.env.local`, fill in the Supabase and Google values, then run:

```sh
npm install
npm test
npm run local
```

For local Google access, store the downloaded key outside the repository's publicly served directory and set `GOOGLE_SERVICE_ACCOUNT_FILE` to its absolute path in `.env.local`. Do not paste the JSON key into chat. For Vercel, set `GOOGLE_SERVICE_ACCOUNT_JSON` as a Secret and leave `GOOGLE_SERVICE_ACCOUNT_FILE` unset.

Share the agenda spreadsheet with the service account's `client_email` as **Viewer**, and share the template as **Viewer**. Give it **Contributor** access to the destination Shared Drive (or the narrowest folder access that permits copying and editing newly created files). The application does not change sharing permissions automatically. The spreadsheet ID is already in `.env.example`; provide the template and destination folder IDs in the environment.

Also enable the Google Sheets API, Google Drive API, and Google Docs API in the service account's Google Cloud project. Workspace sharing rules can prevent external or service-account access, and Drive copy restrictions can block copying even when the account can view the template; verify those constraints with the Workspace administrator.

`.env.local` and service-account JSON files are ignored by git. The Supabase URL and anon key are public client configuration; `SUPABASE_PROJECT_SLUG` is server-side authorization configuration. The slug must already exist in the shared project's project registry and its access policy must be appropriate for this application. This repository does not provision it.

Configure development, preview, and production with separate Google destinations and credentials. Do not give preview deployments production Google credentials. Changing Vercel environment variables requires a new deployment before those values take effect.

## Current integration boundaries

- The server validates each token against Supabase Auth's `/auth/v1/user`, then calls `has_project_access` with the returned user ID. Requests fail closed on missing configuration, auth failure, access denial, or RPC failure.
- Read-only review of the current shared database found `has_project_access` executable by `PUBLIC` and accepting an arbitrary user ID. This application always passes the ID returned by verified `getUser`, but direct RPC callers may be able to probe the function's boolean access result for other IDs. Review this exposure before rollout; it was not changed here.
- `api/_lib/agenda.js` reads the 2026/27 meeting layout using its current headers and the `Chairing Teams 26/27` tab. It was checked read-only against the 26 October meeting, including attendance counts, start/end times, topics and the team seven days later. A differently structured workbook needs a reviewed mapping.
- Missing or invalid individual fields are left blank, and the result lists items to review. The next chairing team still uses the date seven days later; if no unambiguous entry exists, its fields remain blank. A missing attendance name leaves that category's count blank rather than presenting an incomplete count as exact.
- The original `Auto Minutes Template` has the 19 expected placeholders, and the service account can read and copy it. The adapter replaces those fields and formats topic headings and labels. A live write and visual review of the generated document have not yet been performed.
- The shared Supabase registry contains `minutes_generator` as an active `staff_only` project with signup disabled. Set `SUPABASE_PROJECT_SLUG` to that value. The local service account can read the current source and template and has add-file capability on the selected Shared Drive. Real HTTP allowed/denied checks, a confirmed generation and a visual document review remain necessary before rollout.

## Manual UI checklist

- Signed out: only the Supabase email/password sign-in form is available.
- Authorized volunteer/admin: meeting dates load; unauthorized students receive a denial.
- Select no date: generation is blocked with an actionable message.
- Confirm generation: the UI states that each confirmation creates a new document.
- Complete generation: a validated Google Docs link is shown.
- Partial failure after copy: generation is reported as failed and the recovery link is shown separately.
- Sign out: protected controls and prior result links are cleared.

## Project structure

- `index.html`, `style.css`, `ui.js`, `assets/app.js`: static UI and Supabase sign-in.
- `api/session.js`, `api/meetings.js`, `api/generate.js`, `api/config.js`: Vercel Functions.
- `api/_lib/auth.js`, `agenda.js`, `google.js`, `http.js`: authorization, agenda adapter contract, server-only Google integration, and response helpers.
- `test/`: Node built-in tests with injected clients.
