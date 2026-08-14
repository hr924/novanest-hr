const express = require('express');
const { readDB, writeDB, nextId } = require('../db');
const { requireAdmin, requireKiosk } = require('../middleware');

const router = express.Router();

// Matching happens against 128-length face descriptors (the standard output
// of face-api.js's face recognition model). We never receive or store raw
// photos or video here — only these numeric vectors — which is deliberate:
// it's the minimum needed to recognize a face again, and (unlike a photo)
// isn't itself a picture of someone.
const DESCRIPTOR_LENGTH = 128;
const MAX_SAMPLES_PER_EMPLOYEE = 5;

// How long, in ms, after a kiosk marks someone's attendance before that same
// employee can be marked again. Continuous camera matching would otherwise
// toggle check-in/check-out every second while someone stands at the kiosk.
const MARK_COOLDOWN_MS = 60 * 1000;
const recentMarks = new Map(); // employeeId -> timestamp, in-memory is fine (resets on restart, which just re-opens the cooldown window)

function isValidDescriptor(d) {
  return Array.isArray(d) && d.length === DESCRIPTOR_LENGTH && d.every((n) => typeof n === 'number' && Number.isFinite(n));
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ---------------- Admin: enrollment management ----------------

// List every active employee with their enrollment status, for the admin
// Face ID screen.
router.get('/status', requireAdmin, (req, res) => {
  const db = readDB();
  const profiles = new Map(db.faceProfiles.map((p) => [p.employeeId, p]));
  const employees = db.employees
    .filter((e) => e.status === 'active')
    .map((e) => {
      const profile = profiles.get(e.id);
      return {
        employeeId: e.id,
        employeeName: e.name,
        employeeCode: e.employeeCode,
        enrolled: !!profile,
        sampleCount: profile ? profile.descriptors.length : 0,
        updatedAt: profile ? profile.updatedAt : null
      };
    });
  res.json({ employees, kioskToken: db.settings.kioskToken });
});

// Enroll (or re-enroll, which fully replaces) an employee's face templates.
// Body: { employeeId, descriptors: [ [128 numbers], ... up to 5 ] }
// The descriptors are computed client-side (in the admin's browser, from a
// live webcam capture) — the server never sees the actual photo.
router.post('/enroll', requireAdmin, (req, res) => {
  const { employeeId, descriptors } = req.body;
  const db = readDB();
  const employee = db.employees.find((e) => e.id === Number(employeeId));
  if (!employee) return res.status(404).json({ error: 'Employee not found' });
  if (!Array.isArray(descriptors) || descriptors.length === 0) {
    return res.status(400).json({ error: 'At least one face sample is required' });
  }
  if (descriptors.length > MAX_SAMPLES_PER_EMPLOYEE) {
    return res.status(400).json({ error: `No more than ${MAX_SAMPLES_PER_EMPLOYEE} samples per enrollment` });
  }
  if (!descriptors.every(isValidDescriptor)) {
    return res.status(400).json({ error: 'Malformed face descriptor data' });
  }

  const existingIdx = db.faceProfiles.findIndex((p) => p.employeeId === employee.id);
  const profile = {
    id: existingIdx >= 0 ? db.faceProfiles[existingIdx].id : nextId(db, 'faceProfiles'),
    employeeId: employee.id,
    employeeName: employee.name,
    descriptors,
    updatedAt: new Date().toISOString()
  };
  if (existingIdx >= 0) db.faceProfiles[existingIdx] = profile;
  else db.faceProfiles.push(profile);
  writeDB(db);
  res.status(201).json({ profile: { employeeId: profile.employeeId, sampleCount: profile.descriptors.length, updatedAt: profile.updatedAt } });
});

// Purge an employee's biometric data entirely (they leave the company, opt
// out, or an admin just wants to re-baseline them from scratch).
router.delete('/enroll/:employeeId', requireAdmin, (req, res) => {
  const db = readDB();
  const before = db.faceProfiles.length;
  db.faceProfiles = db.faceProfiles.filter((p) => p.employeeId !== Number(req.params.employeeId));
  if (db.faceProfiles.length === before) return res.status(404).json({ error: 'No enrollment found for this employee' });
  writeDB(db);
  res.json({ ok: true });
});

// Regenerate the kiosk device token (e.g. a kiosk tablet was lost or
// decommissioned). Any device using the old token stops working immediately.
router.post('/kiosk-token/regenerate', requireAdmin, (req, res) => {
  const db = readDB();
  db.settings.kioskToken = require('crypto').randomBytes(18).toString('base64url');
  writeDB(db);
  res.json({ kioskToken: db.settings.kioskToken });
});

// ---------------- Kiosk device: read templates, mark attendance ----------------

// The kiosk downloads all enrolled templates once (and periodically after)
// and does matching locally in the browser — it does not stream faces to the
// server for matching. This keeps the actual camera feed off the network
// entirely; only the final match result is ever sent back.
router.get('/descriptors', requireKiosk, (req, res) => {
  const db = readDB();
  const activeIds = new Set(db.employees.filter((e) => e.status === 'active').map((e) => e.id));
  const profiles = db.faceProfiles
    .filter((p) => activeIds.has(p.employeeId))
    .map((p) => ({ employeeId: p.employeeId, employeeName: p.employeeName, descriptors: p.descriptors }));
  res.json({ profiles });
});

// The kiosk decided (client-side) which employee matched. This endpoint does
// NOT trust that decision blindly for anything beyond attendance marking: it
// re-checks the employee is real and active, and enforces the cooldown so a
// person standing in frame doesn't get checked in and out repeatedly.
router.post('/mark', requireKiosk, (req, res) => {
  // matchDistance is the euclidean distance the kiosk's local match was
  // decided at — lower is a closer/better match, not higher. Stored purely
  // as an audit trail (e.g. to spot an employee who's consistently matching
  // near the threshold and may need to be re-enrolled).
  const { employeeId, matchDistance } = req.body;
  const db = readDB();
  const employee = db.employees.find((e) => e.id === Number(employeeId) && e.status === 'active');
  if (!employee) return res.status(404).json({ error: 'Employee not recognized or inactive' });

  const last = recentMarks.get(employee.id);
  if (last && Date.now() - last < MARK_COOLDOWN_MS) {
    return res.status(429).json({ error: 'Already marked recently', employeeName: employee.name });
  }

  const today = todayStr();
  let record = db.attendance.find((r) => r.employeeId === employee.id && r.date === today);
  let action;
  if (!record) {
    record = {
      id: nextId(db, 'attendance'),
      employeeId: employee.id,
      employeeName: employee.name,
      date: today,
      checkIn: new Date().toISOString(),
      checkOut: null,
      status: 'present',
      source: 'face-kiosk',
      matchDistance: typeof matchDistance === 'number' ? matchDistance : null
    };
    db.attendance.push(record);
    action = 'checkin';
  } else if (!record.checkOut) {
    record.checkOut = new Date().toISOString();
    action = 'checkout';
  } else {
    return res.status(400).json({ error: 'Already completed attendance for today', employeeName: employee.name });
  }

  recentMarks.set(employee.id, Date.now());
  writeDB(db);
  res.json({ action, employeeName: employee.name, attendance: record });
});

module.exports = router;
