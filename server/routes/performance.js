const express = require('express');
const { readDB, writeDB, nextId } = require('../db');
const { requireLogin, requireAdmin } = require('../middleware');

const router = express.Router();

// Logged-in: list performance reviews (admin sees all, employee sees own)
router.get('/', requireLogin, (req, res) => {
  const db = readDB();
  const { user } = req.session;
  let records = db.performance;
  if (user.role !== 'admin') {
    records = records.filter(r => r.employeeId === user.employeeId);
  }
  const { employeeId } = req.query;
  if (user.role === 'admin' && employeeId) {
    records = records.filter(r => r.employeeId === Number(employeeId));
  }
  res.json({ performance: records.sort((a, b) => new Date(b.reviewDate) - new Date(a.reviewDate)) });
});

// Admin: create a performance review for an employee
router.post('/', requireAdmin, (req, res) => {
  const { employeeId, period, rating, goals, feedback } = req.body;
  if (!employeeId || !period || !rating) {
    return res.status(400).json({ error: 'employeeId, period and rating are required' });
  }
  const db = readDB();
  const employee = db.employees.find(e => e.id === Number(employeeId));
  if (!employee) return res.status(404).json({ error: 'Employee not found' });

  const record = {
    id: nextId(db, 'performance'),
    employeeId: employee.id,
    employeeName: employee.name,
    period,
    rating,
    goals: goals || '',
    feedback: feedback || '',
    reviewedBy: req.session.user.name,
    reviewDate: new Date().toISOString()
  };
  db.performance.push(record);
  writeDB(db);
  res.status(201).json({ performance: record });
});

// Admin: delete a performance review
router.delete('/:id', requireAdmin, (req, res) => {
  const db = readDB();
  const idx = db.performance.findIndex(r => r.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Record not found' });
  db.performance.splice(idx, 1);
  writeDB(db);
  res.json({ ok: true });
});

module.exports = router;
