const express = require('express');
const { readDB, writeDB, nextId } = require('../db');
const { requireLogin, requireManagerOrAdmin } = require('../middleware');

const router = express.Router();

function num(v) {
  return Number(v) || 0;
}

function totalHours(entries) {
  return (entries || []).reduce((sum, e) => sum + num(e.hours), 0);
}

// Logged-in: list timesheets
// - admin sees all
// - manager sees timesheets from employees who report to them
// - employee sees their own
router.get('/', requireLogin, (req, res) => {
  const db = readDB();
  const { user } = req.session;
  let timesheets = db.timesheets;

  if (user.role === 'manager') {
    const reportIds = db.employees.filter(e => e.managerId === user.employeeId).map(e => e.id);
    timesheets = timesheets.filter(t => reportIds.includes(t.employeeId));
  } else if (user.role === 'employee') {
    timesheets = timesheets.filter(t => t.employeeId === user.employeeId);
  }
  // admin: no filter, sees everything

  res.json({ timesheets: timesheets.sort((a, b) => (b.weekStarting || '').localeCompare(a.weekStarting || '')) });
});

// Employee: start/save a draft timesheet for a week, or update it while it's
// still a draft or was sent back for changes.
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
    task: (e.task || '').trim(),
    hours: num(e.hours)
  })) : [];

  if (existing) {
    existing.entries = cleanEntries;
    existing.notes = notes || '';
    existing.totalHours = totalHours(cleanEntries);
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
    totalHours: totalHours(cleanEntries),
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

// Employee: submit a draft (or previously rejected) timesheet for manager approval
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

// Manager (or admin): approve/reject a submitted timesheet
router.put('/:id/manager-status', requireManagerOrAdmin, (req, res) => {
  const { status, comment } = req.body;
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const db = readDB();
  const timesheet = db.timesheets.find(t => t.id === Number(req.params.id));
  if (!timesheet) return res.status(404).json({ error: 'Timesheet not found' });

  const { user } = req.session;
  if (user.role === 'manager') {
    const employee = db.employees.find(e => e.id === timesheet.employeeId);
    if (!employee || employee.managerId !== user.employeeId) {
      return res.status(403).json({ error: 'You are not the manager for this employee' });
    }
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
