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

Open:
- `http://localhost:3000/index.html` — public careers page
- `http://localhost:3000/login.html` — sign in

## Demo accounts

| Role      | Email                | Password      |
|-----------|-----------------------|--------------|
| HR Admin  | admin@company.com     | admin123     |
| Employee  | jordan@company.com    | employee123  |

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
