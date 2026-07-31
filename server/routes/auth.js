const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { readDB, writeDB } = require('../db');
const { requireLogin } = require('../middleware');
const { sendPasswordResetEmail } = require('../mailer');

const router = express.Router();

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

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
    if (user.role === 'employee') {
      return res.status(403).json({ error: 'Employees cannot set a new password here. Use "Forgot password?" on the sign-in page instead.' });
    }
    user.password = bcrypt.hashSync(newPassword.trim(), 8);
  }
  writeDB(db);

  req.session.user.name = user.name;
  res.json({ user: req.session.user });
});

// Step 1: employee requests a reset link by email.
// Always responds with the same generic message, whether or not that email
// exists, so this endpoint can't be used to check who has an account.
router.post('/forgot-password', async (req, res) => {
  const email = String(req.body.email || '').trim();
  const genericMessage = 'If an account exists for that email, a password reset link has been sent.';
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const db = readDB();
  const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());

  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    user.resetTokenHash = hashToken(token);
    user.resetTokenExpires = Date.now() + RESET_TOKEN_TTL_MS;
    writeDB(db);

    try {
      await sendPasswordResetEmail(user.email, token);
    } catch (err) {
      console.error('Failed to send password reset email:', err.message);
      // Don't reveal delivery failures to the caller — same generic response either way.
    }
  }

  res.json({ message: genericMessage });
});

// Step 2: employee submits the token from their email link plus a new password.
router.post('/reset-password', (req, res) => {
  const { token, password } = req.body;
  if (!token || !password || String(password).trim().length < 6) {
    return res.status(400).json({ error: 'A valid token and a password of at least 6 characters are required' });
  }

  const db = readDB();
  const tokenHash = hashToken(String(token));
  const user = db.users.find(u => u.resetTokenHash === tokenHash);

  if (!user || !user.resetTokenExpires || user.resetTokenExpires < Date.now()) {
    return res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });
  }

  user.password = bcrypt.hashSync(String(password).trim(), 8);
  delete user.resetTokenHash;
  delete user.resetTokenExpires;
  writeDB(db);

  res.json({ message: 'Your password has been updated. You can now sign in.' });
});

module.exports = router;
