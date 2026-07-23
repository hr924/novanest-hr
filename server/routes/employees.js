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
  // If there are no employees left at all (e.g. everyone was deleted), start
  // fresh from NN001001 instead of continuing to climb forever.
  if (db.employees.length === 0) db.nextId.employeeCode = 1001;
  const usedCodes = new Set(db.employees.map(e => e.employeeCode).filter(Boolean));
  let code;
  do {
    code = 'NN' + String(db.nextId.employeeCode).padStart(6, '0');
    db.nextId.employeeCode += 1;
  } while (usedCodes.has(code));
  return code;
}

const EXTENDED_PROFILE_FIELDS = [
  'dob', 'gender', 'bloodGroup', 'address',
  'emergencyContactName', 'emergencyContactRelation', 'emergencyContactPhone',
  'aadhaarNumber', 'panNumber', 'passportNumber',
  'bankAccountNumber', 'bankIFSC', 'bankName'
];

// Returns an error message string if invalid, or null if OK / left blank.
function validateIdFormats(body) {
  if (body.aadhaarNumber !== undefined && body.aadhaarNumber !== '') {
    if (!/^\d{12}$/.test(body.aadhaarNumber)) {
      return 'Aadhaar number must be exactly 12 digits';
    }
  }
  if (body.panNumber !== undefined && body.panNumber !== '') {
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(String(body.panNumber).toUpperCase())) {
      return 'PAN number must be in the format AAAAA9999A (5 letters, 4 digits, 1 letter)';
    }
  }
  if (body.bankAccountNumber !== undefined && body.bankAccountNumber !== '') {
    if (!/^\d{6,20}$/.test(body.bankAccountNumber)) {
      return 'Bank account number must be 6–20 digits';
    }
  }
  if (body.bankIFSC !== undefined && body.bankIFSC !== '') {
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(String(body.bankIFSC).toUpperCase())) {
      return 'IFSC code must be in the format AAAA0999999 (4 letters, a 0, then 6 characters)';
    }
  }
  return null;
}

function pickExtendedFields(body) {
  const picked = {};
  EXTENDED_PROFILE_FIELDS.forEach((field) => {
    let value = body[field] !== undefined ? String(body[field]) : '';
    if (field === 'panNumber' || field === 'bankIFSC') value = value.toUpperCase();
    picked[field] = value;
  });
  return picked;
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
  const idFormatError = validateIdFormats(req.body);
  if (idFormatError) return res.status(400).json({ error: idFormatError });

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
    deductions: Number(deductions) || 0,
    ...pickExtendedFields(req.body)
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

  const idFormatError = validateIdFormats(req.body);
  if (idFormatError) return res.status(400).json({ error: idFormatError });

  const body = { ...req.body };
  delete body.documents; // documents are managed via their own endpoints, not overwritten wholesale here
  ['basicSalary', 'allowances', 'deductions'].forEach((field) => {
    if (body[field] !== undefined) body[field] = Number(body[field]) || 0;
  });
  if (body.managerId !== undefined) {
    body.managerId = body.managerId === '' || body.managerId === null ? null : Number(body.managerId);
  }
  if (body.panNumber !== undefined) body.panNumber = String(body.panNumber).toUpperCase();
  if (body.bankIFSC !== undefined) body.bankIFSC = String(body.bankIFSC).toUpperCase();
  Object.assign(emp, body);
  writeDB(db);
  res.json({ employee: emp });
});

// Admin: upload/replace a document for an employee (base64 data URL)
router.post('/:id/documents', requireAdmin, (req, res) => {
  const { name, dataUrl } = req.body;
  if (!name || !dataUrl) return res.status(400).json({ error: 'name and dataUrl are required' });
  const db = readDB();
  const emp = db.employees.find(e => e.id === Number(req.params.id));
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  if (!Array.isArray(emp.documents)) emp.documents = [];
  const doc = {
    id: nextId(db, 'employeeDocument'),
    name,
    dataUrl,
    uploadedDate: new Date().toISOString()
  };
  emp.documents.push(doc);
  writeDB(db);
  res.status(201).json({ document: doc });
});

// Admin: remove a document from an employee
router.delete('/:id/documents/:docId', requireAdmin, (req, res) => {
  const db = readDB();
  const emp = db.employees.find(e => e.id === Number(req.params.id));
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  emp.documents = (emp.documents || []).filter(d => d.id !== Number(req.params.docId));
  writeDB(db);
  res.json({ ok: true });
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
