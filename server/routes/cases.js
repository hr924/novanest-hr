const express = require('express');
const { readDB, writeDB, nextId } = require('../db');
const { requireLogin, requireAdmin } = require('../middleware');

const router = express.Router();

// Logged-in: list cases (admin sees all, employee sees their own)
router.get('/', requireLogin, (req, res) => {
  const db = readDB();
  const { user } = req.session;
  let cases = db.cases;
  if (user.role !== 'admin') {
    cases = cases.filter(c => c.employeeId === user.employeeId);
  }
  res.json({ cases: cases.sort((a, b) => new Date(b.createdDate) - new Date(a.createdDate)) });
});

// Employee: raise a case
router.post('/', requireLogin, (req, res) => {
  const { subject, description } = req.body;
  const { user } = req.session;
  if (!user.employeeId) return res.status(400).json({ error: 'No employee profile linked to this account' });
  if (!subject) return res.status(400).json({ error: 'subject is required' });
  const db = readDB();
  const item = {
    id: nextId(db, 'cases'),
    employeeId: user.employeeId,
    employeeName: user.name,
    subject, description: description || '',
    status: 'open', // open -> in-progress -> resolved
    response: '',
    createdDate: new Date().toISOString()
  };
  db.cases.push(item);
  writeDB(db);
  res.status(201).json({ case: item });
});

// Admin: respond to / update a case
router.put('/:id', requireAdmin, (req, res) => {
  const { status, response } = req.body;
  const db = readDB();
  const item = db.cases.find(c => c.id === Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'Case not found' });
  if (status) item.status = status;
  if (response !== undefined) item.response = response;
  writeDB(db);
  res.json({ case: item });
});

module.exports = router;
