# Supabase Auth Minutes Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the minutes generator to Supabase-authenticated access and server-side Google Sheets/Drive/Docs operations, with local verification and no production rollout.

**Architecture:** Keep the static HTML/CSS frontend and serve it with Vercel. Add Node.js serverless endpoints that verify each bearer token against the existing Supabase Auth service, evaluate current project authorization, and use a least-privileged Google service account for agenda reads and document generation. Separate agenda parsing, Google API operations, authorization, and HTTP handlers so they can be verified without live production resources.

**Tech Stack:** Node.js Vercel Functions, vanilla browser JavaScript, pinned `@supabase/supabase-js` and `googleapis`, Node's built-in test runner.

**Spec:** `docs/superpowers/specs/2026-11-02-supabase-auth-minutes-generation-design.md`

## Global Constraints

- Do not deploy, change the shared database, provision Google/Vercel resources, or change external permissions.
- Validate the Supabase user token on the server and check current project authorization before every protected operation.
- Never send Google service-account credentials or a Supabase secret/service-role key to the browser or commit them.
- Keep spreadsheet, template, destination folder, Supabase, and Google service-account configuration in environment variables; document names in an example file.
- Explicitly support Shared Drives and set the destination folder when copying the template.
- Do not create a document until authorization and source-data validation succeed.
- On post-copy failure, report the document ID/link as incomplete and never claim success.
- Verify existing authorization behavior and current agenda/template mapping before rollout; do not guess at unknown live project behavior or source layout.
- Each confirmed generation creates a new document and the UI must make this clear.

## Review Focus

- Missing/expired/forged bearer token or auth service outage must deny protected requests — test authorization middleware with absent, invalid, and unavailable auth responses.
- A student, removed volunteer, or unknown project role must be denied on each request — test current authorization lookup and deny-on-error behavior.
- Malformed dates, missing agenda cells, or a missing chairing-team entry must fail before Drive copy — test parser validation and ensure the Google adapter is not called.
- Shared Drive copy succeeds but Docs update fails — test an incomplete response with the created document identifier and no success state.
- Secrets or personal meeting data must not leak in errors/logs or static files — test generic HTTP errors and scan the browser bundle/config example for secret-only variables.

## Files and Responsibilities

- `api/_lib/auth.js`: extract and verify bearer token; query the established authorization mechanism on each call.
- `api/_lib/agenda.js`: list valid meeting tabs and parse/validate selected meeting data.
- `api/_lib/google.js`: server-only Google client, spreadsheet reads, Shared Drive copy, Docs population and formatting.
- `api/_lib/http.js`: shared JSON response, method, and safe-error helpers.
- `api/meetings.js`, `api/generate.js`: protected Vercel HTTP entry points.
- `assets/app.js` (or a replacement `app.js`): Supabase browser sign-in/session and protected API calls; remove browser Google OAuth scripts.
- `index.html`, `style.css`: update auth and generation UI, loading, result, and actionable error states.
- `package.json`, lockfile, `vercel.json`, `.env.example`, `.gitignore`, `README.md`: runtime, deployment routing, environment template, setup notes, and legacy deployment/config cleanup.
- `test/*.test.js`: parser, auth, endpoint, and generation failure coverage using injected clients/mocks.
- Existing `api_setup.js`, `fetch.js`, `copy.js`, and `insert.js`: remove or retire browser-side privileged Google API implementation once replacement is wired.

## Tasks

### Task 1: Establish server runtime and isolated helpers

**Files:** create `package.json`, lockfile, `vercel.json`, `api/_lib/http.js`, `test/http.test.js`; modify `.gitignore` and README setup notes.

**Interfaces:** `jsonResponse(res, status, payload)` sends a no-store JSON response. `requireMethod(req, res, method)` sends a 405 response and returns `false` when the method differs.

- [x] Add a failing Node test for JSON responses, unsupported methods, and safe generic errors.
- [x] Run the helper tests and confirm the helper import fails before implementation.
- [x] Pin required runtime dependencies and implement the helpers; configure Vercel static output and `/api` functions without Firebase rewrites.
- [x] Run the HTTP helper tests and confirm pass.
- [x] Confirm `.env.local` and service-account files are ignored; keep only variable names in `.env.example`.

### Task 2: Implement and validate agenda mapping

**Files:** create `api/_lib/agenda.js`, `test/agenda.test.js`; modify source mapping only after inspecting the linked current-year sheet and current template or recording that access is unavailable.

**Interfaces:** `listMeetings(sheetsClient, spreadsheetId)` returns `{date, title}` entries; `readMeeting(sheetsClient, spreadsheetId, date)` returns validated normalized fields for date, times, attendee categories, chairing teams, topic list, and topic details.

- [ ] Add fixture tests for valid representative agenda values, date + seven-day following-chair lookup, missing ranges, malformed dates, and absent chairing-team data.
- [ ] Run agenda tests and confirm parser implementation fails initially.
- [ ] Inspect current source tabs/ranges and compare template placeholders/formatting; implement a reviewed mapping for the observed layout.
- [ ] Validate required fields and return actionable safe errors before any document creation.
- [ ] Run agenda tests and confirm pass. If source/template access is unavailable, stop this mapping at a clearly marked adapter contract and do not claim full-flow completion.

**Status:** Date-tab listing and the canonical contract are implemented and tested. Current meeting field ranges, the seven-day chair lookup, and current template formatting remain unverified because the agenda/template cells could not be read. Generation fails closed with `503` until a reviewed mapping is supplied; full-flow acceptance is not complete.

### Task 3: Add per-request Supabase identity and authorization

**Files:** create `api/_lib/auth.js`, `test/auth.test.js`; document required Supabase env variables.

**Interfaces:** `authorizeRequest(req, deps)` returns a minimal verified actor `{id, email}` or throws a typed 401/403/503 error. Dependencies for token verification and project authorization are injectable.

- [x] Add tests for missing, malformed, expired/invalid tokens, volunteer/admin access, student/removed-user denial, and authorization service errors.
- [x] Run tests and confirm auth helper behavior is absent.
- [x] Verify the actual shared project access function and profile role protections from the available project implementation/configuration; implement against the verified interface. Never fall back to user metadata or trust role claims alone.
- [x] Use server-side verified user identity and perform a fresh authorization lookup for each protected request.
- [x] Run auth tests and confirm pass. No project slug is provisioned; configuration fails closed until it exists.

### Task 4: Move Google operations server-side

**Files:** create `api/_lib/google.js`, `test/google.test.js`; remove browser Google API scripts, OAuth setup, and static Google config.

**Interfaces:** `createGoogleServices(env)` returns Sheets/Drive/Docs clients; `createMinutesDocument({drive, docs, folderId, templateId, meeting})` returns `{id, url, complete}` and retains the new document identifier if a later update fails.

- [x] Test that Google integration rejects missing configuration and that configuration errors are safe.
- [x] Test copy options include the configured destination parent and Shared Drive support; test Docs write and post-copy failure behavior with injected clients.
- [ ] Run tests to confirm required server operations are absent.
- [ ] Implement least-privilege server-only credentials, source reads, copy into destination folder, placeholder replacement, and topic formatting based on inspected template.
- [x] Ensure failed post-copy writes return an incomplete result with recovery link/id and never set complete.
- [x] Run Google adapter tests and confirm pass; do not call live Google APIs or alter permissions.

### Task 5: Add protected Vercel endpoints

**Files:** create `api/meetings.js`, `api/generate.js`, `test/endpoints.test.js`.

**Interfaces:** `GET /api/meetings` and `POST /api/generate` both call `authorizeRequest`; generation accepts `{date}` and returns `{url, complete}` only after validated read and document fill.

- [x] Test protected endpoint methods and deny unauthorized identity before protected operations.
- [x] Test validation-before-copy, success, and partial-copy failure responses.
- [ ] Run tests and confirm the handlers fail before implementation.
- [x] Implement handlers with dependency injection for unit tests, safe responses, and minimal audit logging of actor ID, operation, and outcome only.
- [x] Run endpoint tests and confirm pass.

### Task 6: Connect the UI and document environment setup

**Files:** modify `index.html`, `style.css`, README; create `assets/app.js` and `.env.example`; remove retired scripts/config from page loading.

- [x] Add a documented manual verification checklist for signed-out, loading, denied, empty dates, duplicate-warning confirmation, success link, and partial-failure states.
- [x] Replace Google login copy with Supabase sign-in; load dates only after authorization and call protected API endpoints with the current Supabase access token.
- [x] Require a clear confirmation that each generation creates a new document; enable result link only for complete generation, and show the recovery link separately for incomplete writes.
- [x] Add env variable names and local Vercel instructions; distinguish development, preview, and production credentials/destinations in the documentation.
- [x] Remove unused Firebase setup and browser Google OAuth/API files after confirming no remaining references.
- [x] Review generated static assets for service account or Supabase secret exposure.

### Task 7: Verify the local implementation and report rollout prerequisites

**Files:** modify README only for final verified local run steps and unresolved rollout prerequisites.

- [x] Run all Node tests and inspect the full output.
- [x] Run local Vercel development and route checks without contacting production Supabase or Google resources.
- [x] Verify `.env.example`, ignored local secrets, and client assets contain no privileged credentials.
- [x] Record acceptance criteria that require organization-provided test accounts, a non-production Shared Drive, verified project authorization details, source/template mapping, or reachable self-hosted Supabase; leave those out of production claims until they can be exercised.

## Spec coverage and known dependency

The tasks cover identity, current authorization, agenda extraction, Google Shared Drive generation, failure recovery, environment separation, UI behavior, and local verification. Production deployment, team/project provisioning, shared database changes, live permission changes, and resource creation are explicitly excluded. Full source mapping and an allowed/denied end-to-end run depend on read access to the current sheet/template and test resources; the spec itself records that these inputs were unavailable during design.
