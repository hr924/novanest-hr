const express = require('express');
const { readDB, writeDB, nextId } = require('../db');
const { requireLogin, requireAdmin, requireManagerOrAdmin } = require('../middleware');

const router = express.Router();

// Combine manager + HR decisions into one overall status for display.
function withOverallStatus(request) {
  let overall = 'pending-manager';
  if (request.managerStatus === 'rejected' || request.hrStatus === 'rejected') {
    overall = 'rejected';
  } else if (request.hrStatus === 'approved') {
    overall = 'approved';
  } else if (request.managerStatus === 'approved') {
    overall = 'pending-hr';
  }
  return { ...request, overallStatus: overall };
}

// Logged-in: list leave requests
// - admin sees all
// - manager sees requests from employees who report to them
// - employee sees their own
router.get('/', requireLogin, (req, res) => {
  const db = readDB();
  const { user } = req.session;
  let requests = db.leave;

  if (user.role === 'manager') {
    const reportIds = db.employees.filter(e => e.managerId === user.employeeId).map(e => e.id);
    requests = requests.filter(r => reportIds.includes(r.employeeId));
  } else if (user.role === 'employee') {
    requests = requests.filter(r => r.employeeId === user.employeeId);
  }
  // admin: no filter, sees everything

  res.json({ leave: requests.map(withOverallStatus).sort((a, b) => new Date(b.requestedDate) - new Date(a.requestedDate)) });
});

// Employee: submit a leave request
router.post('/', requireLogin, (req, res) => {
  const { type, startDate, endDate, reason } = req.body;
  const { user } = req.session;
  if (!user.employeeId) return res.status(400).json({ error: 'No employee profile linked to this account' });
  if (!type || !startDate || !endDate) return res.status(400).json({ error: 'type, startDate and endDate are required' });

  const db = readDB();
  const employee = db.employees.find(e => e.id === user.employeeId);
  // If the employee has no manager assigned, there's no one to give manager approval,
  // so that stage is auto-cleared and the request goes straight to HR.
  const hasManager = !!(employee && employee.managerId);

  const request = {
    id: nextId(db, 'leave'),
    employeeId: user.employeeId,
    employeeName: user.name,
    type, startDate, endDate,
    reason: reason || '',
    managerStatus: hasManager ? 'pending' : 'approved',
    hrStatus: 'pending',
    status: 'pending', // kept for backward compatibility with older UI, not the source of truth
    requestedDate: new Date().toISOString()
  };
  db.leave.push(request);
  writeDB(db);
  res.status(201).json({ leave: withOverallStatus(request) });
});

// Manager (or admin): approve/reject at the manager stage
router.put('/:id/manager-status', requireManagerOrAdmin, (req, res) => {
  const { status } = req.body;
  if (!['approved', 'rejected', 'pending'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const db = readDB();
  const request = db.leave.find(r => r.id === Number(req.params.id));
  if (!request) return res.status(404).json({ error: 'Leave request not found' });

  const { user } = req.session;
  if (user.role === 'manager') {
    const employee = db.employees.find(e => e.id === request.employeeId);
    if (!employee || employee.managerId !== user.employeeId) {
      return res.status(403).json({ error: 'You are not the manager for this employee' });
    }
  }

  request.managerStatus = status;
  writeDB(db);
  res.json({ leave: withOverallStatus(request) });
});

// Admin (HR): final approve/reject — requires manager approval to already be in place
router.put('/:id/status', requireAdmin, (req, res) => {
  const { status } = req.body;
  if (!['approved', 'rejected', 'pending'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const db = readDB();
  const request = db.leave.find(r => r.id === Number(req.params.id));
  if (!request) return res.status(404).json({ error: 'Leave request not found' });

  if (status === 'approved' && request.managerStatus !== 'approved') {
    return res.status(400).json({ error: 'Manager approval is required before HR can approve this request' });
  }

  request.hrStatus = status;
  request.status = status; // keep legacy field roughly in sync
  writeDB(db);
  res.json({ leave: withOverallStatus(request) });
});

module.exports = router;
