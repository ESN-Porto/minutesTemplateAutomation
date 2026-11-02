# ESN Porto Minutes Template Automation

This is a tool that ESN Porto uses to automatically fill in the minutes template for a given GM. It requires an @esnporto.org email account, and is available [here](https://esnporto-minutes.web.app). The user can choose to fill in everything at once, or fill in only what is available at the start of the GM to return and fill in the rest later.

## Development

Use Node.js 22. Install the pinned dependencies with `npm install`, run the automated checks with `npm test`, and start the local Vercel development server with `npm run dev` after configuring the environment variables documented in `.env.example`.

Here's a brief description of each file:
- `index.html`: structure of the page
- `style.css`: style of the page
- `api_setup.js`: code used to set up the connection to the used Google APIs.
- `fetch.js`: code that uses the Google Sheets API to fetch data from the agenda sheet.
- `copy.js`: code that uses the Google Drive API to create a copy of the template.
- `insert.js`: code that uses the Google Docs API to fill in the template with the fetched data.
- `logo.png`: ESN Porto logo used in the page.
