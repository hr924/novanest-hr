const express = require('express');
const { readDB, writeDB, nextId } = require('../db');
const { requireLogin, requireAdmin } = require('../middleware');

const router = express.Router();

// Logged-in: list Form 16 records (admin sees all, employee sees own)
router.get('/', requireLogin, (req, res) => {
  const db = readDB();
  const { user } = req.session;
  let records = db.formSixteens;
  if (user.role !== 'admin') {
    records = records.filter(r => r.employeeId === user.employeeId);
  }
  const { employeeId } = req.query;
  if (user.role === 'admin' && employeeId) {
    records = records.filter(r => r.employeeId === Number(employeeId));
  }
  res.json({ formSixteens: records.sort((a, b) => (b.financialYear || '').localeCompare(a.financialYear || '')) });
});

// Admin: create a Form 16 record for an employee
router.post('/', requireAdmin, (req, res) => {
  const { employeeId, financialYear, grossSalary, taxDeducted } = req.body;
  if (!employeeId || !financialYear || grossSalary == null) {
    return res.status(400).json({ error: 'employeeId, financialYear and grossSalary are required' });
  }
  const db = readDB();
  const employee = db.employees.find(e => e.id === Number(employeeId));
  if (!employee) return res.status(404).json({ error: 'Employee not found' });

  const record = {
    id: nextId(db, 'formSixteens'),
    employeeId: employee.id,
    employeeName: employee.name,
    financialYear,
    grossSalary: Number(grossSalary) || 0,
    taxDeducted: Number(taxDeducted) || 0,
    generatedDate: new Date().toISOString()
  };
  db.formSixteens.push(record);
  writeDB(db);
  res.status(201).json({ formSixteen: record });
});

// Admin: delete a Form 16 record
router.delete('/:id', requireAdmin, (req, res) => {
  const db = readDB();
  const idx = db.formSixteens.findIndex(r => r.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Record not found' });
  db.formSixteens.splice(idx, 1);
  writeDB(db);
  res.json({ ok: true });
});

module.exports = router;
