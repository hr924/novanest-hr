# Novanest HR — Full HR Portal

A complete HR system: a public careers page for candidates, a recruitment
pipeline, an employee roster, leave management, and attendance tracking.

## What's included

- **Careers page** (`/index.html`) — public job listings, no login required to apply.
- **Admin dashboard** (`/admin.html`) — for HR/admins: manage job postings,
  review and move applications through a pipeline, manage the employee
  roster, approve/decline leave requests, and view attendance.
- **Employee workspace** (`/employee.html`) — for staff: view their profile,
  check in/out, and submit leave requests.
- A small REST API (`server/`) backed by a JSON file database — no external
  database or native modules required.

## Requirements

- Node.js 16 or newer

## Setup

```bash
cd hr-portal
npm install
npm start
```

The server starts at **http://localhost:3000**.

## Password reset emails (forgot password)

Employees can reset a forgotten password from the login page ("Forgot
password?"). This sends a one-time reset link by email, so it needs SMTP
credentials — set these environment variables before starting the server:

```bash
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_USER=your-smtp-username
SMTP_PASS=your-smtp-password-or-api-key
SMTP_FROM="Novanest HR <hr@yourcompany.com>"
npm start
```

- Use `SMTP_PORT=465` with `SMTP_SECURE=true` if your provider requires SSL
  instead of STARTTLS.
- Works with any standard SMTP provider — Gmail (with an app password),
  SendGrid, Mailgun, Amazon SES, your company's own mail server, etc.
- If these aren't set, the app still runs fine — the reset request is
  accepted and logged to the server console, but no email actually goes
  out. Reset links expire after 1 hour and can only be used once.

### Mobile OTP reset (alternative to email)

The "Forgot password" page has a mobile OTP flow, resetting via a 4-digit
SMS code sent to the mobile number saved on the employee's profile
(`Admin → Employees → phone field`). This uses MSG91 — the OTP itself is
generated and verified by this app, MSG91 only delivers the SMS:

```bash
MSG91_AUTH_KEY=your-msg91-auth-key
MSG91_TEMPLATE_ID=your-approved-template-id
npm start
```

- MSG91 requires a **DLT-approved transactional SMS template** to send to
  Indian numbers — this needs to be set up in your MSG91 account first
  (this is what the "Header"/DLT registration process was for).
  The template must contain exactly one variable for the code itself, e.g.
  `Your Novanest HR verification code is ##OTP##`. If your template uses a
  different variable name than `OTP`, set `MSG91_OTP_VAR` to match it.
- If these aren't set, OTP requests are still accepted and logged to the
  server console, but no SMS actually goes out.
- Codes expire after 5 minutes, allow 5 incorrect attempts before locking,
  and requests are limited to once per minute per number.



All employee/payroll data lives in one file: `data/db.json`. That file is
**not** part of the app's source code, so whenever you receive an updated
version of this project (a new zip), do **not** just delete the old folder
and extract the new one over it — that deletes `data/db.json` along with it
and every employee record is gone.

Safe update steps:

1. **Before** replacing anything, copy `data/db.json` from your current
   deployment somewhere safe (Desktop, USB drive, etc.).
2. Extract/copy in the new version of the app.
3. Copy your saved `data/db.json` back into the new `data/` folder,
   **overwriting** the empty one that came with the update.
4. Restart the server (`npm start`).

Even better — set the `DATA_DIR` environment variable once to a folder
*outside* the app's own directory (e.g. `DATA_DIR=/home/you/hr-data`) and the
database will always live there, so future updates can never touch it no
matter how you redeploy:

```bash
DATA_DIR=/home/you/hr-data npm start
```

Open:
- `http://localhost:3000/index.html` — public careers page
- `http://localhost:3000/login.html` — sign in

## Demo accounts

| Role      | Email                | Password      |
|-----------|-----------------------|--------------|
| HR Admin  | hr@novanest.com        | Novanest#Admin2026 |
| Employee  | jordan.lee@novanest.com | Novanest#Emp2026   |

Change or remove these in `server/db.js` (see `defaultData()`) before using
this in anything resembling production.

## Data storage

All data lives in `data/db.json`, created automatically on first run. Delete
that file to reset the portal back to its seeded demo data. This is fine for
local use, demos, and small teams; for real production use you'd want to
swap the storage layer in `server/db.js` for a proper database.

## Project structure

```
hr-portal/
├── server/
│   ├── index.js          # Express app entry point
│   ├── db.js              # JSON file-based data layer
│   ├── middleware.js      # auth guards
│   └── routes/
│       ├── auth.js
│       ├── jobs.js
│       ├── applications.js
│       ├── employees.js
│       ├── leave.js
│       └── attendance.js
├── public/                # frontend (plain HTML/CSS/JS, no build step)
│   ├── index.html          # careers page
│   ├── login.html
│   ├── admin.html
│   ├── employee.html
│   ├── css/styles.css
│   └── js/
├── data/                   # db.json created here on first run
└── package.json
```

## Installing it as an app on your phone

Once the portal is hosted somewhere reachable from your phone (your local
network, or a real deployment like Render), you can add it to your home
screen like a real app:

**Android (Chrome):** open the site → tap the **⋮** menu → **Install app** /
**Add to Home screen**.

**iPhone (Safari):** open the site → tap the **Share** icon → **Add to Home
Screen**.

It launches full-screen without browser address bars, with its own icon and
name ("Novanest HR"). It still needs a network connection to reach the
server for login and data — it's an installable web app, not an offline
native app.

## Notes on security

This is a starter/demo project. Before using it for real employee data,
you'll want to at minimum:
- Set a strong, unique `SESSION_SECRET` environment variable
- Serve over HTTPS
- Add rate limiting on the login and public application endpoints
- Consider a real database instead of the JSON file store for concurrent
  write safety
