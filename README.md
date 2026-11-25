# BCC Maintenance Management System

## Run locally

1. Install Node.js 22.5 or later.
2. From this project folder, run `node src/server.js`.
3. Open `http://127.0.0.1:3000`.
4. Sign in with one of the demo accounts shown on the login page.

The server creates `data/maintenance.sqlite` automatically and seeds example equipment and repair requests on first start. The dashboard can add, edit, and delete equipment, create maintenance requests, assign staff, and change request status. Its summary counts are read from SQLite.

The application binds to localhost only. Set `PORT` to change the port. The SQLite database and environment files are excluded from Git.
Login accounts are demo-only and are not production authentication; do not expose this prototype to a public network.

## ML failure detection

The ML scan is deliberately unavailable until a model/API is selected and configured. No model or provider is included in this project, so it does not display simulated predictions as real ML results. If an API key is needed later, keep it in a server-side environment variable and never put it in `script.js` or other browser code.

## Tests

Run `node --test test/server.test.js` to exercise the API and SQLite-backed workflows.
