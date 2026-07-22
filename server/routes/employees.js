const express = require('express');
const bcrypt = require('bcryptjs');
const { readDB, writeDB, nextId } = require('../db');
const { requireAdmin, requireLogin } = require('../middleware');

const router = express.Router();

function genPassword() {
  return Math.random().toString(36).slice(-4) + Math.random().toString(36).slice(-4);
}

function genEmployeeCode(db) {
  if (typeof db.nextId.employeeCode !== 'number') db.nextId.employeeCode = 1001;
  const code = 'NN' + String(db.nextId.employeeCode).padStart(6, '0');
  db.nextId.employeeCode += 1;
  return code;
}

// Admin: list all employees (flags whether each has a login account)
router.get('/', requireAdmin, (req, res) => {
  const db = readDB();
  const employees = db.employees.map(e => {
    const loginUser = db.users.find(u => u.employeeId === e.id);
    const manager = e.managerId ? db.employees.find(m => m.id === e.managerId) : null;
    return {
      ...e,
      hasLogin: !!loginUser,
      loginRole: loginUser ? loginUser.role : null,
      managerName: manager ? manager.name : null
    };
  });
  res.json({ employees });
});

// Logged-in user: get own profile (employee role)
router.get('/me', requireLogin, (req, res) => {
  const db = readDB();
  const emp = db.employees.find(e => e.id === req.session.user.employeeId);
  if (!emp) return res.status(404).json({ error: 'No employee profile linked to this account' });
  res.json({ employee: emp });
});

router.get('/:id', requireAdmin, (req, res) => {
  const db = readDB();
  const emp = db.employees.find(e => e.id === Number(req.params.id));
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  res.json({ employee: emp });
});

// Admin: add employee directly, optionally creating a login account too
router.post('/', requireAdmin, (req, res) => {
  const { name, email, department, position, joinDate, phone, createLogin, password, basicSalary, allowances, deductions, managerId, role } = req.body;
  if (!name || !email || !department || !position) {
    return res.status(400).json({ error: 'name, email, department and position are required' });
  }
  const db = readDB();

  if (createLogin && db.users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(400).json({ error: 'A login account with this email already exists' });
  }

  const employee = {
    id: nextId(db, 'employees'),
    employeeCode: genEmployeeCode(db),
    name, email, department, position,
    joinDate: joinDate || new Date().toISOString().slice(0, 10),
    status: 'active',
    phone: phone || '',
    managerId: managerId ? Number(managerId) : null,
    basicSalary: Number(basicSalary) || 0,
    allowances: Number(allowances) || 0,
    deductions: Number(deductions) || 0
  };
  db.employees.push(employee);

  let credentials = null;
  if (createLogin) {
    const plainPassword = password && password.trim() ? password.trim() : genPassword();
    db.users.push({
      id: nextId(db, 'users'),
      name, email,
      password: bcrypt.hashSync(plainPassword, 8),
      role: role === 'manager' ? 'manager' : 'employee',
      employeeId: employee.id
    });
    credentials = { email, password: plainPassword };
  }

  writeDB(db);
  res.status(201).json({ employee, credentials });
});

// Admin: create a login account for an employee who doesn't have one yet
router.post('/:id/create-login', requireAdmin, (req, res) => {
  const { password, role } = req.body;
  const db = readDB();
  const employee = db.employees.find(e => e.id === Number(req.params.id));
  if (!employee) return res.status(404).json({ error: 'Employee not found' });
  if (db.users.some(u => u.employeeId === employee.id)) {
    return res.status(400).json({ error: 'This employee already has a login account' });
  }
  if (db.users.some(u => u.email.toLowerCase() === employee.email.toLowerCase())) {
    return res.status(400).json({ error: 'A login account with this email already exists' });
  }
  const plainPassword = password && password.trim() ? password.trim() : genPassword();
  db.users.push({
    id: nextId(db, 'users'),
    name: employee.name,
    email: employee.email,
    password: bcrypt.hashSync(plainPassword, 8),
    role: role === 'manager' ? 'manager' : 'employee',
    employeeId: employee.id
  });
  writeDB(db);
  res.status(201).json({ credentials: { email: employee.email, password: plainPassword } });
});

// Admin: update employee
router.put('/:id', requireAdmin, (req, res) => {
  const db = readDB();
  const emp = db.employees.find(e => e.id === Number(req.params.id));
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  const body = { ...req.body };
  ['basicSalary', 'allowances', 'deductions'].forEach((field) => {
    if (body[field] !== undefined) body[field] = Number(body[field]) || 0;
  });
  if (body.managerId !== undefined) {
    body.managerId = body.managerId === '' || body.managerId === null ? null : Number(body.managerId);
  }
  Object.assign(emp, body);
  writeDB(db);
  res.json({ employee: emp });
});

// Admin: remove employee (also removes their login account, if any)
router.delete('/:id', requireAdmin, (req, res) => {
  const db = readDB();
  const empId = Number(req.params.id);
  const idx = db.employees.findIndex(e => e.id === empId);
  if (idx === -1) return res.status(404).json({ error: 'Employee not found' });
  db.employees.splice(idx, 1);
  db.users = db.users.filter(u => u.employeeId !== empId);
  writeDB(db);
  res.json({ ok: true });
});

module.exports = router;
