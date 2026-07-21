const express = require('express');
const { readDB, writeDB, nextId } = require('../db');
const { requireLogin, requireAdmin } = require('../middleware');

const router = express.Router();

// Logged-in: list tasks (admin sees all, employee sees their own)
router.get('/', requireLogin, (req, res) => {
  const db = readDB();
  const { user } = req.session;
  let tasks = db.tasks;
  if (user.role !== 'admin') {
    tasks = tasks.filter(t => t.employeeId === user.employeeId);
  }
  res.json({ tasks: tasks.sort((a, b) => new Date(a.dueDate || 0) - new Date(b.dueDate || 0)) });
});

// Admin: assign a task to an employee
router.post('/', requireAdmin, (req, res) => {
  const { employeeId, title, description, dueDate } = req.body;
  if (!employeeId || !title) return res.status(400).json({ error: 'employeeId and title are required' });
  const db = readDB();
  const employee = db.employees.find(e => e.id === Number(employeeId));
  if (!employee) return res.status(404).json({ error: 'Employee not found' });

  const task = {
    id: nextId(db, 'tasks'),
    employeeId: employee.id,
    employeeName: employee.name,
    title, description: description || '', dueDate: dueDate || null,
    status: 'pending',
    createdDate: new Date().toISOString()
  };
  db.tasks.push(task);
  writeDB(db);
  res.status(201).json({ task });
});

// Logged-in: update task status (employee marking their own task done, or admin editing any)
router.put('/:id/status', requireLogin, (req, res) => {
  const { status } = req.body;
  if (!['pending', 'in-progress', 'done'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const db = readDB();
  const task = db.tasks.find(t => t.id === Number(req.params.id));
  if (!task) return res.status(404).json({ error: 'Task not found' });
  const { user } = req.session;
  if (user.role !== 'admin' && task.employeeId !== user.employeeId) {
    return res.status(403).json({ error: 'Not your task' });
  }
  task.status = status;
  writeDB(db);
  res.json({ task });
});

// Admin: delete a task
router.delete('/:id', requireAdmin, (req, res) => {
  const db = readDB();
  const idx = db.tasks.findIndex(t => t.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Task not found' });
  db.tasks.splice(idx, 1);
  writeDB(db);
  res.json({ ok: true });
});

module.exports = router;
