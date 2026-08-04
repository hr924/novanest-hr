// Sends outgoing email (currently just password-reset links) via plain SMTP.
// Works with Gmail, Outlook/Microsoft 365, SendGrid, Mailgun, Zoho, AWS SES,
// or any other provider that offers SMTP credentials — just set the
// SMTP_* environment variables below to match whichever provider you use.
//
// Required env vars:
//   SMTP_HOST     e.g. smtp.gmail.com
//   SMTP_PORT     e.g. 587 (STARTTLS) or 465 (SSL)
//   SMTP_USER     the account/login used to authenticate
//   SMTP_PASS     the password / app password / API key
//   SMTP_FROM     the "from" address shown to recipients (optional — defaults to SMTP_USER)
//   APP_URL       the public base URL of this app, e.g. https://novanest-hr.onrender.com
//                 (used to build the link inside the reset email)
//
// If SMTP_HOST/SMTP_USER/SMTP_PASS aren't set, emails aren't sent — instead
// the reset link is printed to the server logs, so the feature still works
// for local testing without any email account configured.

const nodemailer = require('nodemailer');

function isConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

let transporter = null;
function getTransporter() {
  if (!isConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
  }
  return transporter;
}

function appUrl() {
  return (process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
}

async function sendPasswordResetEmail(toEmail, token) {
  const link = `${appUrl()}/reset-password.html?token=${encodeURIComponent(token)}`;
  const subject = 'Reset your Novanest HRM password';
  const text = `We received a request to reset your Novanest HRM password.\n\n` +
    `Click the link below to set a new password. This link expires in 1 hour and can only be used once.\n\n` +
    `${link}\n\n` +
    `If you didn't request this, you can safely ignore this email — your password will not change.`;
  const html = `
    <p>We received a request to reset your Novanest HRM password.</p>
    <p><a href="${link}" style="display:inline-block; padding:10px 18px; background:#03A9E7; color:#fff; text-decoration:none; border-radius:6px;">Set a new password</a></p>
    <p>Or copy and paste this link into your browser:<br>${link}</p>
    <p style="color:#777; font-size:13px;">This link expires in 1 hour and can only be used once. If you didn't request this, you can safely ignore this email — your password will not change.</p>
  `;

  const t = getTransporter();
  if (!t) {
    // No SMTP configured — fall back to logging so the flow is still testable.
    console.log('----------------------------------------------------------------');
    console.log('SMTP is not configured (SMTP_HOST/SMTP_USER/SMTP_PASS not set).');
    console.log('Password reset link for ' + toEmail + ':');
    console.log('  ' + link);
    console.log('----------------------------------------------------------------');
    return;
  }

  await t.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: toEmail,
    subject,
    text,
    html
  });
  console.log(`Password reset email sent successfully to ${toEmail} via ${process.env.SMTP_HOST}`);
}

module.exports = { sendPasswordResetEmail, isConfigured };
