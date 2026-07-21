const express = require('express');
const { readDB, writeDB, nextId } = require('../db');
const { requireLogin, requireAdmin } = require('../middleware');

const router = express.Router();

// Logged-in: list workflow checklists (admin sees all, employee sees their own)
router.get('/', requireLogin, (req, res) => {
  const db = readDB();
  const { user } = req.session;
  let workflows = db.workflows;
  if (user.role !== 'admin') {
    workflows = workflows.filter(w => w.employeeId === user.employeeId);
  }
  res.json({ workflows: workflows.sort((a, b) => new Date(b.createdDate) - new Date(a.createdDate)) });
});

// Admin: assign a checklist to an employee
router.post('/', requireAdmin, (req, res) => {
  const { employeeId, name, steps } = req.body;
  if (!employeeId || !name || !Array.isArray(steps) || steps.length === 0) {
    return res.status(400).json({ error: 'employeeId, name and at least one step are required' });
  }
  const db = readDB();
  const employee = db.employees.find(e => e.id === Number(employeeId));
  if (!employee) return res.status(404).json({ error: 'Employee not found' });

  const workflow = {
    id: nextId(db, 'workflows'),
    employeeId: employee.id,
    employeeName: employee.name,
    name,
    steps: steps.filter(Boolean).map((label, i) => ({ id: i + 1, label, done: false })),
    createdDate: new Date().toISOString()
  };
  db.workflows.push(workflow);
  writeDB(db);
  res.status(201).json({ workflow });
});

// Logged-in: toggle a step done/not done (employee on their own, admin on any)
router.put('/:id/steps/:stepId', requireLogin, (req, res) => {
  const { done } = req.body;
  const db = readDB();
  const workflow = db.workflows.find(w => w.id === Number(req.params.id));
  if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
  const { user } = req.session;
  if (user.role !== 'admin' && workflow.employeeId !== user.employeeId) {
    return res.status(403).json({ error: 'Not your workflow' });
  }
  const step = workflow.steps.find(s => s.id === Number(req.params.stepId));
  if (!step) return res.status(404).json({ error: 'Step not found' });
  step.done = !!done;
  writeDB(db);
  res.json({ workflow });
});

// Admin: delete a workflow
router.delete('/:id', requireAdmin, (req, res) => {
  const db = readDB();
  const idx = db.workflows.findIndex(w => w.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Workflow not found' });
  db.workflows.splice(idx, 1);
  writeDB(db);
  res.json({ ok: true });
});

module.exports = router;
