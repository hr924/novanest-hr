// Generic SMTP mailer — works with any provider (not just one vendor),
// configured entirely through environment variables so no credentials ever
// live in source code:
//
//   SMTP_HOST      e.g. smtp.yourprovider.com
//   SMTP_PORT      e.g. 587 (STARTTLS) or 465 (SSL)
//   SMTP_SECURE    "true" if using port 465, otherwise leave unset
//   SMTP_USER      SMTP login username
//   SMTP_PASS      SMTP login password / API key
//   SMTP_FROM      the "From" address shown to recipients, e.g.
//                  "Novanest HR <hr@yourcompany.com>"
//
// If these aren't set, sendMail() logs a warning and returns without
// throwing — so the rest of the app keeps working even before SMTP is
// configured; only the emails themselves won't go out.

let nodemailer;
try {
  nodemailer = require('nodemailer');
} catch (e) {
  nodemailer = null;
}

function isConfigured() {
  return !!(nodemailer && process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

let transporter = null;
function getTransporter() {
  if (!isConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
  }
  return transporter;
}

async function sendMail({ to, subject, html, text }) {
  const t = getTransporter();
  if (!t) {
    console.warn(
      `[mailer] SMTP is not configured — skipped sending "${subject}" to ${to}. ` +
      `Set SMTP_HOST, SMTP_USER, and SMTP_PASS (see README) to enable outgoing email.`
    );
    return { sent: false };
  }
  await t.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to, subject, html, text
  });
  return { sent: true };
}

module.exports = { sendMail, isConfigured };
