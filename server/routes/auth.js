const express = require('express');
const bcrypt = require('bcryptjs');
const { readDB, writeDB } = require('../db');
const { requireLogin } = require('../middleware');

const router = express.Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email/Employee ID and password are required' });
  }
  const db = readDB();
  const identifier = String(email).trim();

  let user = db.users.find(u => u.email.toLowerCase() === identifier.toLowerCase());

  // Not found by email — try matching as an employee ID (e.g. NN001001).
  if (!user) {
    const employee = db.employees.find(e => e.employeeCode && e.employeeCode.toLowerCase() === identifier.toLowerCase());
    if (employee) {
      user = db.users.find(u => u.employeeId === employee.id);
    }
  }

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid email/Employee ID or password' });
  }
  req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role, employeeId: user.employeeId || null };
  res.json({ user: req.session.user });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', (req, res) => {
  res.json({ user: req.session.user || null });
});

// Logged-in user: update their own display name, and optionally their password.
router.put('/me', requireLogin, (req, res) => {
  const { name, newPassword } = req.body;
  const db = readDB();
  const user = db.users.find(u => u.id === req.session.user.id);
  if (!user) return res.status(404).json({ error: 'Account not found' });

  if (name && name.trim()) {
    user.name = name.trim();
  }
  if (newPassword && newPassword.trim()) {
    user.password = bcrypt.hashSync(newPassword.trim(), 8);
  }
  writeDB(db);

  req.session.user.name = user.name;
  res.json({ user: req.session.user });
});

module.exports = router;
