# Traxer

A local-first personal expense dashboard built with React, Vite, Express, and SQLite. Traxer helps you track spending, understand your habits, and stay in control of your money. Accounts are private, expense records are stored on the server, and dashboard totals aggregate across the full matching result set.

## Requirements

- Node.js 24.7 or newer (the server uses Node's built-in SQLite and Argon2 APIs)
- npm

## Run locally

```sh
npm install
npm run dev
```

Open the Vite address printed in the terminal (normally `http://127.0.0.1:5173`). The API runs at `http://127.0.0.1:4000` and is proxied by Vite. Create an account from the sign-in screen to get started. The SQLite database remains at `server/data/expensetrack.sqlite` to preserve existing local records across the Traxer rebrand and persists across restarts.

Run a production client build with `npm run build`, start the API with `npm start`, and run the API integration tests with `npm test`.

## Data and security

- Passwords are hashed with Argon2id; the raw password is never stored.
- Authentication uses an HTTP-only, same-site cookie and server-side sessions.
- Every expense query and mutation is scoped to the signed-in account.
- Amounts are stored as integer paise, and dates are stored as date-only `YYYY-MM-DD` values.
- Set `DATABASE_PATH` to use a different SQLite file and `PORT` to change the API port.
- Set `VITE_CONTACT_EMAIL` to add a project contact link to the footer. The footer links to the Traxer GitHub and LinkedIn profiles.
- For a production HTTPS deployment, set `NODE_ENV=production` so the session cookie receives the `Secure` attribute. This initial build is intended for local use and does not include a production hosting setup.

## Interface

The monochrome dashboard and responsive expense controls follow the supplied visual references. The footer links to the Traxer GitHub and LinkedIn profiles and includes a contact link when `VITE_CONTACT_EMAIL` is configured.
