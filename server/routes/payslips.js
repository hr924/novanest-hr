const express = require('express');
const { readDB, writeDB, nextId } = require('../db');
const { requireLogin, requireAdmin } = require('../middleware');

const router = express.Router();

function daysInMonth(monthStr) {
  // monthStr is 'YYYY-MM'
  const [y, m] = String(monthStr).split('-').map(Number);
  if (!y || !m) return 30;
  return new Date(y, m, 0).getDate();
}

function num(v) {
  return Number(v) || 0;
}

// Snapshot the parts of an employee's profile that belong on a payslip, so
// the payslip stays accurate even if the employee's profile changes later.
function snapshotEmployee(employee) {
  return {
    employeeId: employee.id,
    employeeCode: employee.employeeCode || '',
    employeeName: employee.name,
    department: employee.department || '',
    designation: employee.position || '',
    location: employee.location || '',
    doj: employee.joinDate || '',
    bankName: employee.bankName || '',
    bankAccountNumber: employee.bankAccountNumber || '',
    pfNumber: employee.pfNumber || '',
    uan: employee.uan || ''
  };
}

// Builds the earnings/deductions breakdown + totals given the raw inputs.
function buildAmounts(input) {
  const basic = num(input.basic);
  const hra = num(input.hra);
  const flexibleAllowance = num(input.flexibleAllowance);
  const personalAllowance = num(input.personalAllowance);
  const otherAllowance = num(input.otherAllowance);

  const employeePF = num(input.employeePF);
  const provisionTax = num(input.provisionTax);
  const otherDeduction = num(input.otherDeduction);

  const grossEarnings = basic + hra + flexibleAllowance + personalAllowance + otherAllowance;
  const grossDeductions = employeePF + provisionTax + otherDeduction;
  const netPay = grossEarnings - grossDeductions;

  return {
    basic, hra, flexibleAllowance, personalAllowance, otherAllowance,
    employeePF, provisionTax, otherDeduction,
    grossEarnings, grossDeductions, netPay
  };
}

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

// Admin: get a single payslip (used by the print/view page)
router.get('/:id', requireLogin, (req, res) => {
  const db = readDB();
  const { user } = req.session;
  const payslip = db.payslips.find(p => p.id === Number(req.params.id));
  if (!payslip) return res.status(404).json({ error: 'Payslip not found' });
  if (user.role !== 'admin' && payslip.employeeId !== user.employeeId) {
    return res.status(403).json({ error: 'Not authorized to view this payslip' });
  }
  res.json({ payslip });
});

// Admin: create a payslip for an employee
router.post('/', requireAdmin, (req, res) => {
  const { employeeId, month, lopDays, note } = req.body;
  if (!employeeId || !month || req.body.basic == null) {
    return res.status(400).json({ error: 'employeeId, month and basic are required' });
  }
  const db = readDB();
  const employee = db.employees.find(e => e.id === Number(employeeId));
  if (!employee) return res.status(404).json({ error: 'Employee not found' });

  if (db.payslips.some(p => p.employeeId === employee.id && p.month === month)) {
    return res.status(400).json({ error: 'A payslip for this employee and month already exists' });
  }

  const stdDays = daysInMonth(month);
  const lop = Math.min(num(lopDays), stdDays);
  const workedDays = stdDays - lop;

  const amounts = buildAmounts(req.body);

  const payslip = {
    id: nextId(db, 'payslips'),
    ...snapshotEmployee(employee),
    month,
    stdDays,
    workedDays,
    lopDays: lop,
    ...amounts,
    // legacy fields kept for backward compatibility with older UI/reports
    allowances: amounts.flexibleAllowance,
    deductions: amounts.grossDeductions,
    netPay: amounts.netPay,
    note: note || '',
    generatedDate: new Date().toISOString()
  };
  db.payslips.push(payslip);
  writeDB(db);
  res.status(201).json({ payslip });
});

// Admin: auto-generate payslips for all active employees for a given month,
// using each employee's stored salary structure. Skips anyone who already
// has a payslip for that month.
router.post('/generate-all', requireAdmin, (req, res) => {
  const { month } = req.body;
  if (!month) return res.status(400).json({ error: 'month is required' });
  const db = readDB();

  const alreadyGenerated = new Set(
    db.payslips.filter(p => p.month === month).map(p => p.employeeId)
  );

  const stdDays = daysInMonth(month);

  const generated = [];
  const skipped = [];
  db.employees.forEach((employee) => {
    if (employee.status !== 'active') return;
    if (alreadyGenerated.has(employee.id)) { skipped.push(employee.name); return; }

    const amounts = buildAmounts({
      basic: employee.basicSalary,
      hra: employee.hra,
      flexibleAllowance: employee.allowances,
      personalAllowance: 0,
      otherAllowance: 0,
      employeePF: employee.employeePF,
      provisionTax: employee.professionalTax,
      otherDeduction: 0
    });

    const payslip = {
      id: nextId(db, 'payslips'),
      ...snapshotEmployee(employee),
      month,
      stdDays,
      workedDays: stdDays,
      lopDays: 0,
      ...amounts,
      allowances: amounts.flexibleAllowance,
      deductions: amounts.grossDeductions,
      netPay: amounts.netPay,
      note: '',
      generatedDate: new Date().toISOString(),
      autoGenerated: true
    };
    db.payslips.push(payslip);
    generated.push(payslip);
  });

  writeDB(db);
  res.status(201).json({ generated, skipped, generatedCount: generated.length, skippedCount: skipped.length });
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
