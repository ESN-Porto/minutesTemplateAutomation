# Volunteer access and shared-drive minutes generation

## Purpose

Allow ESN Porto volunteers and administrators to generate General Meeting minutes without signing in to Google in the application. The application uses the existing shared Supabase instance for user authentication and a Google service account on the server to read the agenda and create the finished document in a Shared Drive.

## Hosting and deployment

- Host the application and its server-side functions on Vercel, in an ESN Porto team intended for small organizational projects. The existing self-hosted Supabase remains the identity and authorization service; hosting the application on Vercel does not move Supabase off the VPS.
- Team creation, plan selection, member invitations, project provisioning and deployment are separate setup steps, not part of this specification. Prefer individual team memberships over shared credentials. Confirm plan, costs and collaboration limits before setup.
- Verify that Vercel server functions can securely reach the existing Supabase Auth and authorization endpoints, including network, TLS and redirect configuration, without exposing the database directly.
- Configure production, preview and development separately. Preview and test deployments must not inadvertently create documents in production or receive production Google credentials.

## User experience

1. A user signs in with their existing ESN Porto Supabase account.
2. The application checks whether the user is permitted to use the project and displays the interface to authorized users.
3. The user selects a meeting date from the available agenda sheets and confirms generation.
4. The server reads the selected agenda, copies the minutes template into the configured Shared Drive folder, and fills in the copy.
5. The interface reports success and provides a link to the resulting Google document. If a step fails, it reports an actionable error without claiming success.

The generated document remains subject to Google Drive permissions. Access to this application does not automatically grant a user access to open or edit the document.

## Access control

- Restrict the project to ESN Porto volunteers and administrators using the existing shared Supabase identity and project access system, with the `staff_only` access level where supported and verified.
- Users with a student role and unauthenticated users must not access protected operations. The application must not grant a role merely because someone creates an account or signs in.
- Validate the Supabase user token on the server and check current project authorization before listing meeting dates, reading agenda data, or generating a document. Hiding the interface is not an authorization boundary. Deny access if identity or authorization cannot be verified.
- Reuse the existing project authorization mechanism after verifying its live implementation and permissions. Do not assume that documentation alone establishes the current database behavior.
- Before relying on `profiles.role`, review all relevant profile creation and update paths to ensure users cannot grant themselves volunteer or administrator privileges. A read-only inspection found the role-change protection trigger enabled on the current database; that observation is not a complete security audit.
- Check authorization on every protected request so that access changes take effect without relying solely on a potentially stale role embedded in a token.

## Current agenda source and mapping

- The intended current-year agenda source is the Google spreadsheet at https://docs.google.com/spreadsheets/d/10hxz_UfN27ZV4lzKeUQ3vNl78pOixWU_oFo0FrGTOM0/edit?gid=744514008. The `gid` identifies a tab, not the whole spreadsheet.
- The linked spreadsheet could not be inspected through the connected Google Drive tool during specification. Its tab names, structure, columns, date conventions, attendance fields and chairing-team layout remain to be verified. Inspect a representative current meeting and compare it with the old parser before choosing ranges or implementing mappings. Confirm whether the output Google Docs template has also changed and obtain its current ID if needed.
- Updating the spreadsheet ID alone is insufficient if the layout or semantics changed. Adapt and validate the extraction and document mapping for the current source, including missing or renamed fields; do not assume the old fixed ranges still apply.
- Configure the source spreadsheet ID separately from source parsing rules. Changing an ID through configuration should work without a code change only when the replacement spreadsheet follows the supported layout. A different layout requires a reviewed mapping or code update.

## Google integration

- Move Google Sheets, Drive and Docs operations to a server-side component. The browser must not receive Google service-account credentials or a Supabase secret/service-role key.
- Use a dedicated Google service account with only the access required to read the configured agenda spreadsheet and template, and to create and edit documents in the designated Shared Drive destination. Store credentials as server-only Vercel Secret environment variables or an appropriate server-side secret mechanism; do not commit them to the repository.
- Configure the spreadsheet ID, template ID and destination folder ID as Vercel project environment variables outside application code; use a local ignored environment file for development and document variable names in an example file. Changing a Vercel environment variable requires a new deployment to take effect. Grant the service account access to those resources and confirm that the Shared Drive and Workspace policies permit the intended operations.
- Explicitly support Shared Drives in applicable Drive API calls, including `files.copy`, and specify the destination folder when creating the copy. The document belongs to the organization through the Shared Drive.
- Preserve the current data mapping: meeting date, start and end times, present participants and counts by category, current and following chairing teams, agenda topic list, and topic details. Preserve the existing template's intended formatting.
- Preserve the existing convention of looking up the following chairing team for the date seven days after the chosen meeting. Make missing or malformed source data clear to the user rather than silently reporting success.

## Scope and boundaries

- This change provides authentication, authorization and server-side Google integration for the existing minutes generator.
- It does not transcribe meetings, generate discussion summaries, manage Shared Drive membership, or automatically update an already generated document.
- Each confirmed generation creates a new document. The interface should make this behavior clear so users can avoid accidental duplicates.
- This specification does not authorize production deployment, changes to the shared database, creation of Google resources, or changes to existing permissions by itself.

## Failure handling and operational considerations

- Do not create a document if authentication, authorization, or required source-data validation fails.
- If creation succeeds but a later write fails, report that generation failed and identify the partially created document for cleanup or recovery; do not present it as complete.
- Provide useful errors for unavailable agenda data, insufficient Google permissions, invalid configuration, and document-generation failures, without exposing credentials or unnecessary personal data.
- Record sufficient server-side operational information to diagnose failures and identify who initiated a generation, without logging tokens, secrets, or document contents unnecessarily.
- Confirm how volunteer status is maintained and revoked in the existing system, and how administrators are authorized, before enabling the application.

## Acceptance criteria

- Existing authorized volunteer and administrator accounts can sign in and view the interface; students and unauthenticated users cannot use protected operations.
- Direct requests to protected endpoints are rejected when the token is absent or invalid, or the user lacks authorization. Revoked access is enforced on subsequent requests.
- An authorized user can select a valid meeting from the current-year spreadsheet, confirm generation, and receive a link to a correctly populated document in the configured Shared Drive folder. Verify representative mappings against the actual source and current template.
- The application runs on Vercel and securely reaches the existing self-hosted Supabase. Configuring a compatible replacement spreadsheet ID and redeploying changes the data source without a code edit.
- The service account can access only the Google resources needed for the workflow; its credentials and privileged Supabase keys are never exposed to the browser or committed.
- Missing source data and Google API failures produce an honest error. A partially created document is identifiable, and the interface does not report successful completion.
- Verify the existing role protections and project-access function against the live configuration before rollout. Test both allowed and denied access, the full generation flow, and Google Drive permissions using suitable test accounts and resources.

## References

- [Supabase: verify JWT claims](https://supabase.com/docs/reference/javascript/auth-getclaims)
- [Supabase: role-based access control](https://supabase.com/docs/guides/api/custom-claims-and-role-based-access-control-rbac)
- [Google Drive: implement Shared Drive support](https://developers.google.com/workspace/drive/api/guides/enable-shareddrives)
- [Google Drive: Shared Drive overview and service accounts](https://developers.google.com/workspace/drive/api/guides/about-shareddrives)
- Existing VPS documentation: `/root/it-managment/docs/ARCHITECTURE.md` and `/root/it-managment/docs/CREATING_NEW_PROJECT.md`. These describe the intended architecture and must be checked against the running system.

- [Vercel environment variables](https://vercel.com/docs/environment-variables)
- [Vercel Config and Secret variables](https://vercel.com/changelog/environment-variables-now-use-config-and-secret-types)
- [Vercel accounts and teams](https://vercel.com/docs/accounts)
