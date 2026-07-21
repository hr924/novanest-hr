const express = require('express');
const { readDB, writeDB, nextId } = require('../db');
const { requireLogin, requireAdmin } = require('../middleware');

const router = express.Router();

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Logged-in: list attendance (admin sees all, employee sees own)
router.get('/', requireLogin, (req, res) => {
  const db = readDB();
  const { user } = req.session;
  let records = db.attendance;
  if (user.role !== 'admin') {
    records = records.filter(r => r.employeeId === user.employeeId);
  }
  res.json({ attendance: records.sort((a, b) => new Date(b.date) - new Date(a.date)) });
});

// Employee: check in for today
router.post('/checkin', requireLogin, (req, res) => {
  const { user } = req.session;
  if (!user.employeeId) return res.status(400).json({ error: 'No employee profile linked to this account' });
  const db = readDB();
  const today = todayStr();
  let record = db.attendance.find(r => r.employeeId === user.employeeId && r.date === today);
  if (record) return res.status(400).json({ error: 'Already checked in today' });
  record = {
    id: nextId(db, 'attendance'),
    employeeId: user.employeeId,
    employeeName: user.name,
    date: today,
    checkIn: new Date().toISOString(),
    checkOut: null,
    status: 'present'
  };
  db.attendance.push(record);
  writeDB(db);
  res.status(201).json({ attendance: record });
});

// Employee: check out for today
router.post('/checkout', requireLogin, (req, res) => {
  const { user } = req.session;
  const db = readDB();
  const today = todayStr();
  const record = db.attendance.find(r => r.employeeId === user.employeeId && r.date === today);
  if (!record) return res.status(400).json({ error: 'No check-in found for today' });
  if (record.checkOut) return res.status(400).json({ error: 'Already checked out today' });
  record.checkOut = new Date().toISOString();
  writeDB(db);
  res.json({ attendance: record });
});

module.exports = router;
