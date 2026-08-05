const express = require('express');
const { readDB, writeDB, nextId } = require('../db');
const { requireLogin, requireAdmin } = require('../middleware');

const router = express.Router();

// Logged-in: list public holidays (used by the Leave Calendar and by the
// leave/LOP calculations to know which dates never count as leave).
router.get('/', requireLogin, (req, res) => {
  const db = readDB();
  const { year } = req.query;
  let holidays = db.holidays || [];
  if (year) holidays = holidays.filter(h => h.date.startsWith(String(year)));
  res.json({ holidays: holidays.sort((a, b) => a.date.localeCompare(b.date)) });
});

// Admin: add a public holiday
router.post('/', requireAdmin, (req, res) => {
  const { date, name } = req.body;
  if (!date || !name) return res.status(400).json({ error: 'date and name are required' });
  const db = readDB();
  if ((db.holidays || []).some(h => h.date === date)) {
    return res.status(400).json({ error: 'A holiday is already recorded for that date' });
  }
  const holiday = { id: nextId(db, 'holidays'), date, name };
  db.holidays.push(holiday);
  writeDB(db);
  res.status(201).json({ holiday });
});

// Admin: remove a public holiday
router.delete('/:id', requireAdmin, (req, res) => {
  const db = readDB();
  const idx = (db.holidays || []).findIndex(h => h.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Holiday not found' });
  db.holidays.splice(idx, 1);
  writeDB(db);
  res.json({ ok: true });
});

module.exports = router;
