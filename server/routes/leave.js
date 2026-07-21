const express = require('express');
const { readDB, writeDB, nextId } = require('../db');
const { requireLogin, requireAdmin } = require('../middleware');

const router = express.Router();

// Logged-in: list leave requests (admin sees all, employee sees own)
router.get('/', requireLogin, (req, res) => {
  const db = readDB();
  const { user } = req.session;
  let requests = db.leave;
  if (user.role !== 'admin') {
    requests = requests.filter(r => r.employeeId === user.employeeId);
  }
  res.json({ leave: requests.sort((a, b) => new Date(b.requestedDate) - new Date(a.requestedDate)) });
});

// Employee: submit a leave request
router.post('/', requireLogin, (req, res) => {
  const { type, startDate, endDate, reason } = req.body;
  const { user } = req.session;
  if (!user.employeeId) return res.status(400).json({ error: 'No employee profile linked to this account' });
  if (!type || !startDate || !endDate) return res.status(400).json({ error: 'type, startDate and endDate are required' });

  const db = readDB();
  const request = {
    id: nextId(db, 'leave'),
    employeeId: user.employeeId,
    employeeName: user.name,
    type, startDate, endDate,
    reason: reason || '',
    status: 'pending',
    requestedDate: new Date().toISOString()
  };
  db.leave.push(request);
  writeDB(db);
  res.status(201).json({ leave: request });
});

// Admin: approve/reject
router.put('/:id/status', requireAdmin, (req, res) => {
  const { status } = req.body;
  if (!['approved', 'rejected', 'pending'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const db = readDB();
  const request = db.leave.find(r => r.id === Number(req.params.id));
  if (!request) return res.status(404).json({ error: 'Leave request not found' });
  request.status = status;
  writeDB(db);
  res.json({ leave: request });
});

module.exports = router;
