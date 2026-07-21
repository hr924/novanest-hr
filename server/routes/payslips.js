const express = require('express');
const { readDB, writeDB, nextId } = require('../db');
const { requireLogin, requireAdmin } = require('../middleware');

const router = express.Router();

// Logged-in: list payslips (admin sees all, employee sees own)
router.get('/', requireLogin, (req, res) => {
  const db = readDB();
  const { user } = req.session;
  let payslips = db.payslips;
  if (user.role !== 'admin') {
    payslips = payslips.filter(p => p.employeeId === user.employeeId);
  }
  const { employeeId } = req.query;
  if (user.role === 'admin' && employeeId) {
    payslips = payslips.filter(p => p.employeeId === Number(employeeId));
  }
  res.json({ payslips: payslips.sort((a, b) => (b.month || '').localeCompare(a.month || '')) });
});

// Admin: create a payslip for an employee
router.post('/', requireAdmin, (req, res) => {
  const { employeeId, month, basic, allowances, deductions } = req.body;
  if (!employeeId || !month || basic == null) {
    return res.status(400).json({ error: 'employeeId, month and basic are required' });
  }
  const db = readDB();
  const employee = db.employees.find(e => e.id === Number(employeeId));
  if (!employee) return res.status(404).json({ error: 'Employee not found' });

  const basicNum = Number(basic) || 0;
  const allowancesNum = Number(allowances) || 0;
  const deductionsNum = Number(deductions) || 0;
  const netPay = basicNum + allowancesNum - deductionsNum;

  const payslip = {
    id: nextId(db, 'payslips'),
    employeeId: employee.id,
    employeeName: employee.name,
    month,
    basic: basicNum,
    allowances: allowancesNum,
    deductions: deductionsNum,
    netPay,
    generatedDate: new Date().toISOString()
  };
  db.payslips.push(payslip);
  writeDB(db);
  res.status(201).json({ payslip });
});

// Admin: delete a payslip
router.delete('/:id', requireAdmin, (req, res) => {
  const db = readDB();
  const idx = db.payslips.findIndex(p => p.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Payslip not found' });
  db.payslips.splice(idx, 1);
  writeDB(db);
  res.json({ ok: true });
});

module.exports = router;
