const express = require('express');
const bcrypt = require('bcryptjs');
const { readDB } = require('../db');

const router = express.Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  const db = readDB();
  const user = db.users.find(u => u.email.toLowerCase() === String(email).toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid email or password' });
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

module.exports = router;
