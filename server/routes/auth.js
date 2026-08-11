const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { readDB, writeDB, nextId } = require('../db');
const { requireLogin } = require('../middleware');
const { sendMail } = require('../mailer');
const sms = require('../sms');

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

// Anyone: request a password reset OTP by mobile number. Always responds
// with the same generic message whether or not that number is on file, so
// this can't be used to discover whose numbers are registered. Also rate
// limited per mobile number so it can't be used to spam someone with SMS.
// Unlike 2Factor, MSG91's Flow API only delivers the SMS — the OTP itself
// is generated, hashed, and verified here.
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const OTP_RESEND_COOLDOWN_MS = 60 * 1000; // 1 minute between requests
const OTP_MAX_ATTEMPTS = 5;

function last10Digits(value) {
  return String(value || '').replace(/\D/g, '').slice(-10);
}

router.post('/send-otp', async (req, res) => {
  const { mobile } = req.body;
  const digits = last10Digits(mobile);
  const generic = { message: 'If that mobile number is on file, a verification code has been sent.' };
  if (digits.length !== 10) {
    return res.status(400).json({ error: 'Enter a valid 10-digit mobile number' });
  }

  const db = readDB();

  const recent = db.otpRequests.find(r => r.mobile === digits && !r.used && (Date.now() - new Date(r.createdAt).getTime()) < OTP_RESEND_COOLDOWN_MS);
  if (recent) {
    return res.status(429).json({ error: 'Please wait a minute before requesting another code.' });
  }

  const employee = db.employees.find(e => last10Digits(e.phone) === digits);
  const user = employee ? db.users.find(u => u.employeeId === employee.id) : null;

  if (user) {
    const otp = String(Math.floor(1000 + Math.random() * 9000)); // 4-digit code
    db.otpRequests = db.otpRequests.filter(r => r.mobile !== digits);
    db.otpRequests.push({
      id: nextId(db, 'otpRequests'),
      mobile: digits,
      userId: user.id,
      otpHash: bcrypt.hashSync(otp, 8),
      expiresAt: new Date(Date.now() + OTP_TTL_MS).toISOString(),
      attempts: 0,
      used: false,
      createdAt: new Date().toISOString()
    });
    writeDB(db);

    try {
      await sms.sendOtpSms(digits, otp);
    } catch (err) {
      console.error('[auth] Failed to send OTP SMS:', err.message);
    }
  }

  res.json(generic);
});

// Anyone: verify a mobile OTP against the hash we generated. On success,
// issues a short-lived reset token (the same kind the email flow uses), so
// the client can then call the existing /reset-password endpoint to
// actually set the new password.
router.post('/verify-otp', (req, res) => {
  const { mobile, otp } = req.body;
  const digits = last10Digits(mobile);
  if (digits.length !== 10 || !otp) {
    return res.status(400).json({ error: 'Mobile number and code are required' });
  }

  const db = readDB();
  const record = db.otpRequests.find(r => r.mobile === digits && !r.used);
  if (!record || new Date(record.expiresAt) < new Date()) {
    return res.status(400).json({ error: 'This code has expired. Please request a new one.' });
  }
  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    record.used = true;
    writeDB(db);
    return res.status(400).json({ error: 'Too many incorrect attempts. Please request a new code.' });
  }

  if (!bcrypt.compareSync(String(otp).trim(), record.otpHash)) {
    record.attempts += 1;
    writeDB(db);
    return res.status(400).json({ error: 'Incorrect code. Please try again.' });
  }

  record.used = true;

  // Issue a reset token exactly like the email flow does, so the same
  // /reset-password endpoint can be reused for the final "set new
  // password" step.
  db.passwordResets = db.passwordResets.filter(r => r.userId !== record.userId);
  const token = crypto.randomBytes(32).toString('hex');
  db.passwordResets.push({
    token,
    userId: record.userId,
    expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString(),
    used: false,
    createdAt: new Date().toISOString()
  });
  writeDB(db);
  res.json({ resetToken: token });
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
