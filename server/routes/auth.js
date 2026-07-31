const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { readDB, writeDB } = require('../db');
const { requireLogin } = require('../middleware');
const { sendMail } = require('../mailer');

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

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// Anyone: request a password reset link by email. Always responds with the
// same generic message whether or not that email exists, so this endpoint
// can't be used to discover which emails have accounts.
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  const generic = { message: 'If an account exists for that email, a password reset link has been sent.' };
  if (!email || !String(email).trim()) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const db = readDB();
  const user = db.users.find(u => u.email.toLowerCase() === String(email).trim().toLowerCase());

  if (user) {
    // Clear out any previous unused tokens for this user, then issue a
    // fresh one — only the most recent reset link is ever valid.
    db.passwordResets = db.passwordResets.filter(r => r.userId !== user.id);
    const token = crypto.randomBytes(32).toString('hex');
    db.passwordResets.push({
      token,
      userId: user.id,
      email: user.email,
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString(),
      used: false,
      createdAt: new Date().toISOString()
    });
    writeDB(db);

    const resetUrl = `${req.protocol}://${req.get('host')}/reset-password.html?token=${token}`;
    try {
      await sendMail({
        to: user.email,
        subject: 'Reset your Novanest HR password',
        html: `
          <p>Hi ${user.name || ''},</p>
          <p>Someone requested a password reset for your Novanest HR account. Click below to choose a new password. This link expires in 1 hour and can only be used once.</p>
          <p><a href="${resetUrl}" style="display:inline-block; padding:10px 18px; background:#03A9E7; color:#fff; text-decoration:none; border-radius:6px;">Reset password</a></p>
          <p>Or copy this link: ${resetUrl}</p>
          <p>If you didn't request this, you can safely ignore this email — your password won't change.</p>
        `,
        text: `Reset your Novanest HR password: ${resetUrl} (expires in 1 hour, one-time use)`
      });
    } catch (err) {
      console.error('[auth] Failed to send password reset email:', err.message);
      // Don't leak the failure to the client — still return the generic message.
    }
  }

  res.json(generic);
});

// Anyone with a valid, unexpired, unused token: set a new password.
router.post('/reset-password', (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword || newPassword.trim().length < 6) {
    return res.status(400).json({ error: 'A valid token and a password of at least 6 characters are required' });
  }
  const db = readDB();
  const record = db.passwordResets.find(r => r.token === token);
  if (!record || record.used || new Date(record.expiresAt) < new Date()) {
    return res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });
  }
  const user = db.users.find(u => u.id === record.userId);
  if (!user) {
    return res.status(400).json({ error: 'Account not found' });
  }

  user.password = bcrypt.hashSync(newPassword.trim(), 8);
  record.used = true;
  writeDB(db);
  res.json({ ok: true });
});

module.exports = router;
