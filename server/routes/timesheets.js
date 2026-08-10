const express = require('express');
const { readDB, writeDB, nextId } = require('../db');
const { requireLogin, requireAdmin } = require('../middleware');

const router = express.Router();

function num(v) {
  return Number(v) || 0;
}

function totalOf(entries, field) {
  return (entries || []).reduce((sum, e) => sum + num(e[field]), 0);
}

// Logged-in: MY OWN timesheets only — this is the "fill your timesheet"
// page, used by both employees and managers for their own weeks. It never
// returns anyone else's data, regardless of role.
router.get('/', requireLogin, (req, res) => {
  const db = readDB();
  const { user } = req.session;
  const own = user.employeeId ? db.timesheets.filter(t => t.employeeId === user.employeeId) : [];
  res.json({ timesheets: own.sort((a, b) => (b.weekStarting || '').localeCompare(a.weekStarting || '')) });
});

// Manager only: timesheets from the people who report to them (for their
// Team Approvals page). Never available to plain employees, and never
// includes the manager's own timesheet — that comes from GET / above.
router.get('/team', requireLogin, (req, res) => {
  const { user } = req.session;
  if (user.role !== 'manager') {
    return res.status(403).json({ error: 'Manager access required' });
  }
  const db = readDB();
  const reportIds = db.employees.filter(e => e.managerId === user.employeeId).map(e => e.id);
  const teamTimesheets = db.timesheets.filter(t => reportIds.includes(t.employeeId));
  res.json({ timesheets: teamTimesheets.sort((a, b) => (b.weekStarting || '').localeCompare(a.weekStarting || '')) });
});

// Admin only: every timesheet in the company, but ONLY once a manager has
// approved it — a timesheet that's still a draft, submitted, or rejected
// never shows up here. Approval itself is a manager-only action (below).
router.get('/company', requireAdmin, (req, res) => {
  const db = readDB();
  const approved = db.timesheets.filter(t => t.status === 'approved');
  res.json({ timesheets: approved.sort((a, b) => (b.weekStarting || '').localeCompare(a.weekStarting || '')) });
});

// Employee/manager: start/save a draft timesheet for a week, or update it
// while it's still a draft or was sent back for changes.
router.post('/', requireLogin, (req, res) => {
  const { weekStarting, entries, notes } = req.body;
  const { user } = req.session;
  if (!user.employeeId) return res.status(400).json({ error: 'No employee profile linked to this account' });
  if (!weekStarting) return res.status(400).json({ error: 'weekStarting is required' });

  const db = readDB();

  const existing = db.timesheets.find(t => t.employeeId === user.employeeId && t.weekStarting === weekStarting);
  if (existing && !['draft', 'rejected'].includes(existing.status)) {
    return res.status(400).json({ error: 'This week has already been submitted and cannot be re-created. Edit the existing one instead.' });
  }

  const employee = db.employees.find(e => e.id === user.employeeId);
  const hasManager = !!(employee && employee.managerId);
  const cleanEntries = Array.isArray(entries) ? entries.map(e => ({
    date: e.date || '',
    project: (e.project || '').trim(),
    workingHours: num(e.workingHours),
    leaveHours: num(e.leaveHours)
  })) : [];

  const totalWorkingHours = totalOf(cleanEntries, 'workingHours');
  const totalLeaveHours = totalOf(cleanEntries, 'leaveHours');

  if (existing) {
    existing.entries = cleanEntries;
    existing.notes = notes || '';
    existing.totalWorkingHours = totalWorkingHours;
    existing.totalLeaveHours = totalLeaveHours;
    existing.totalHours = totalWorkingHours; // kept for backward compatibility
    existing.status = 'draft';
    existing.managerStatus = hasManager ? 'pending' : 'approved';
    existing.managerComment = '';
    existing.updatedDate = new Date().toISOString();
    writeDB(db);
    return res.json({ timesheet: existing });
  }

  const timesheet = {
    id: nextId(db, 'timesheets'),
    employeeId: user.employeeId,
    employeeName: user.name,
    weekStarting,
    entries: cleanEntries,
    totalWorkingHours,
    totalLeaveHours,
    totalHours: totalWorkingHours, // kept for backward compatibility
    notes: notes || '',
    status: 'draft',
    managerStatus: hasManager ? 'pending' : 'approved',
    managerComment: '',
    submittedDate: null,
    updatedDate: new Date().toISOString()
  };
  db.timesheets.push(timesheet);
  writeDB(db);
  res.status(201).json({ timesheet });
});

// Employee/manager: submit a draft (or previously rejected) timesheet for
// manager approval
router.put('/:id/submit', requireLogin, (req, res) => {
  const db = readDB();
  const { user } = req.session;
  const timesheet = db.timesheets.find(t => t.id === Number(req.params.id));
  if (!timesheet) return res.status(404).json({ error: 'Timesheet not found' });
  if (timesheet.employeeId !== user.employeeId) {
    return res.status(403).json({ error: 'You can only submit your own timesheet' });
  }
  if (!['draft', 'rejected'].includes(timesheet.status)) {
    return res.status(400).json({ error: 'This timesheet has already been submitted' });
  }
  if (!timesheet.entries || timesheet.entries.length === 0) {
    return res.status(400).json({ error: 'Add at least one entry before submitting' });
  }

  timesheet.status = 'submitted';
  timesheet.managerStatus = timesheet.managerStatus === 'approved' ? 'approved' : 'pending';
  timesheet.managerComment = '';
  timesheet.submittedDate = new Date().toISOString();
  writeDB(db);
  res.json({ timesheet });
});

// Manager ONLY: approve/reject a submitted timesheet from one of their
// direct reports. Admins cannot approve timesheets — they only ever see
// the already-approved ones (GET /company above).
router.put('/:id/manager-status', requireLogin, (req, res) => {
  const { user } = req.session;
  if (user.role !== 'manager') {
    return res.status(403).json({ error: 'Only the assigned manager can approve or reject a timesheet' });
  }
  const { status, comment } = req.body;
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const db = readDB();
  const timesheet = db.timesheets.find(t => t.id === Number(req.params.id));
  if (!timesheet) return res.status(404).json({ error: 'Timesheet not found' });

  const employee = db.employees.find(e => e.id === timesheet.employeeId);
  if (!employee || employee.managerId !== user.employeeId) {
    return res.status(403).json({ error: 'You are not the manager for this employee' });
  }
  if (timesheet.status !== 'submitted') {
    return res.status(400).json({ error: 'Only a submitted timesheet can be approved or rejected' });
  }

  timesheet.managerStatus = status;
  timesheet.managerComment = comment || '';
  timesheet.status = status === 'approved' ? 'approved' : 'rejected';
  timesheet.decidedDate = new Date().toISOString();
  writeDB(db);
  res.json({ timesheet });
});

// Employee: delete a draft timesheet (never a submitted/approved one)
router.delete('/:id', requireLogin, (req, res) => {
  const db = readDB();
  const { user } = req.session;
  const idx = db.timesheets.findIndex(t => t.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Timesheet not found' });
  const timesheet = db.timesheets[idx];
  if (user.role !== 'admin' && timesheet.employeeId !== user.employeeId) {
    return res.status(403).json({ error: 'You can only delete your own timesheet' });
  }
  if (timesheet.status !== 'draft' && user.role !== 'admin') {
    return res.status(400).json({ error: 'Only a draft timesheet can be deleted' });
  }
  db.timesheets.splice(idx, 1);
  writeDB(db);
  res.json({ ok: true });
});

module.exports = router;
