// Face ID — enrollment + kiosk check-in/out.
//
// Stores face templates (128-number descriptors, not photos) and the
// check-in log in its own file, face.json, next to db.json (respects
// DATA_DIR just like the main database), so it never touches db.json.

const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
const FACE_FILE = path.join(DATA_DIR, 'face.json');

const MATCH_THRESHOLD = Number(process.env.FACE_MATCH_THRESHOLD || 0.5); // lower = stricter
const COOLDOWN_MS = 60 * 1000; // ignore repeat scans of the same person within 1 minute
const MAX_SAMPLES = 5;

function load() {
  try {
    const d = JSON.parse(fs.readFileSync(FACE_FILE, 'utf8'));
    return { enrollments: d.enrollments || [], logs: d.logs || [] };
  } catch (e) {
    return { enrollments: [], logs: [] };
  }
}

function save(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = FACE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, FACE_FILE);
}

// Any signed-in session may use these endpoints (the kiosk device is
// normally signed in as HR/admin).
function requireLogin(req, res, next) {
  const s = req.session;
  const signedIn = s && Object.keys(s).some((k) => k !== 'cookie' && s[k]);
  if (!signedIn) return res.status(401).json({ error: 'Please sign in first.' });
  next();
}

function isDescriptor(d) {
  return Array.isArray(d) && d.length === 128 && d.every((n) => typeof n === 'number' && isFinite(n));
}

function distance(a, b) {
  let sum = 0;
  for (let i = 0; i < 128; i++) { const x = a[i] - b[i]; sum += x * x; }
  return Math.sqrt(sum);
}

function localDate(ts) {
  // India time for the "which day" grouping
  return new Date(ts + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

router.use(requireLogin);

// List enrolled employees (no descriptors sent back)
router.get('/enrollments', (req, res) => {
  const { enrollments } = load();
  res.json(enrollments.map((e) => ({
    employeeId: e.employeeId, code: e.code, name: e.name,
    samples: e.descriptors.length, enrolledAt: e.enrolledAt
  })));
});

// Enroll or re-enroll an employee
router.post('/enroll', (req, res) => {
  const { employeeId, code, name, descriptors } = req.body || {};
  if (!employeeId || !name) return res.status(400).json({ error: 'Employee is required.' });
  if (!Array.isArray(descriptors) || !descriptors.length || !descriptors.every(isDescriptor)) {
    return res.status(400).json({ error: 'Face capture data is missing or invalid. Please capture again.' });
  }
  const data = load();

  // Refuse if this face already belongs to someone else
  for (const e of data.enrollments) {
    if (String(e.employeeId) === String(employeeId)) continue;
    for (const d of e.descriptors) {
      if (descriptors.some((n) => distance(n, d) < 0.4)) {
        return res.status(409).json({ error: `This face is already enrolled for ${e.name}. Remove that enrollment first if it is wrong.` });
      }
    }
  }

  const record = {
    employeeId: String(employeeId), code: code ? String(code) : '', name: String(name),
    descriptors: descriptors.slice(0, MAX_SAMPLES), enrolledAt: new Date().toISOString()
  };
  const idx = data.enrollments.findIndex((e) => String(e.employeeId) === String(employeeId));
  if (idx >= 0) data.enrollments[idx] = record; else data.enrollments.push(record);
  save(data);
  res.json({ ok: true });
});

router.delete('/enroll/:employeeId', (req, res) => {
  const data = load();
  const before = data.enrollments.length;
  data.enrollments = data.enrollments.filter((e) => String(e.employeeId) !== String(req.params.employeeId));
  if (data.enrollments.length === before) return res.status(404).json({ error: 'Not enrolled.' });
  save(data);
  res.json({ ok: true });
});

// Kiosk: identify a face and record check-in / check-out
router.post('/identify', (req, res) => {
  const { descriptor } = req.body || {};
  if (!isDescriptor(descriptor)) return res.status(400).json({ error: 'Invalid face data.' });
  const data = load();
  if (!data.enrollments.length) return res.json({ match: null, reason: 'No one is enrolled yet.' });

  let best = null;
  for (const e of data.enrollments) {
    for (const d of e.descriptors) {
      const dist = distance(descriptor, d);
      if (!best || dist < best.dist) best = { e, dist };
    }
  }
  if (!best || best.dist > MATCH_THRESHOLD) return res.json({ match: null, reason: 'Face not recognised.' });

  const now = Date.now();
  const today = localDate(now);
  const mine = data.logs.filter((l) => String(l.employeeId) === String(best.e.employeeId) && l.date === today);
  const last = mine[mine.length - 1];
  const match = { employeeId: best.e.employeeId, code: best.e.code, name: best.e.name, confidence: Math.round((1 - best.dist) * 100) };

  if (last && now - last.ts < COOLDOWN_MS) {
    return res.json({ match, action: last.type, time: last.time, repeat: true });
  }
  const type = last && last.type === 'in' ? 'out' : 'in';
  const log = { employeeId: best.e.employeeId, code: best.e.code, name: best.e.name, type, ts: now, date: today, time: new Date(now).toISOString() };
  data.logs.push(log);
  // keep the file from growing forever: ~13 months of logs
  const cutoff = now - 400 * 24 * 3600 * 1000;
  if (data.logs.length && data.logs[0].ts < cutoff) data.logs = data.logs.filter((l) => l.ts >= cutoff);
  save(data);
  res.json({ match, action: type, time: log.time });
});

// Check-in log, ?from=YYYY-MM-DD&to=YYYY-MM-DD (defaults to today)
router.get('/logs', (req, res) => {
  const today = localDate(Date.now());
  const from = req.query.from || today;
  const to = req.query.to || from;
  const { logs } = load();
  res.json(logs.filter((l) => l.date >= from && l.date <= to));
});

module.exports = router;
