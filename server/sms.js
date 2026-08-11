// MSG91 SMS wrapper — sends OTP codes via MSG91's transactional Flow API
// using a DLT-approved template (required for sending transactional SMS to
// Indian mobile numbers). Uses Node's built-in https module, so no extra
// npm package is needed.
//
// Unlike 2Factor (which generates and verifies the OTP on their own end),
// MSG91's Flow API just sends whatever text/variables you give it — so the
// OTP itself is generated, hashed, and verified by this app (see
// server/routes/auth.js), and MSG91's only job is delivering the SMS.
//
// Configure via environment variables:
//   MSG91_AUTH_KEY     your MSG91 auth key
//   MSG91_TEMPLATE_ID  the DLT-approved template ID in your MSG91 account.
//                       The template must contain one variable for the
//                       code itself, e.g. "Your OTP is ##OTP##" — the
//                       variable name must match MSG91_OTP_VAR below.
//   MSG91_OTP_VAR      the variable name used in your template for the
//                       code (default: "OTP")
//
// If these aren't set, sendOtpSms() logs a warning and returns without
// throwing — same behavior as the email mailer before SMTP is configured,
// so the rest of the app keeps working even before MSG91 is set up.

const https = require('https');

function isConfigured() {
  return !!(process.env.MSG91_AUTH_KEY && process.env.MSG91_TEMPLATE_ID);
}

// Normalizes a mobile number to MSG91's expected "91XXXXXXXXXX" format for
// Indian numbers — strips everything but digits, and adds the 91 country
// code if it's missing.
function normalizeIndianMobile(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 10) return '91' + digits;
  return digits;
}

function postJson(url, headers, bodyObj) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(bodyObj);
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...headers
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch (e) { parsed = { raw: data }; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function sendOtpSms(mobile, otp) {
  if (!isConfigured()) {
    console.warn(
      `[sms] MSG91 is not configured — skipped sending OTP to ${mobile}. ` +
      `Set MSG91_AUTH_KEY and MSG91_TEMPLATE_ID (see README) to enable OTP SMS.`
    );
    return { sent: false };
  }
  const varName = process.env.MSG91_OTP_VAR || 'OTP';
  const payload = {
    template_id: process.env.MSG91_TEMPLATE_ID,
    short_url: '0',
    recipients: [
      { mobiles: normalizeIndianMobile(mobile), [varName]: String(otp) }
    ]
  };
  const { status, body } = await postJson(
    'https://control.msg91.com/api/v5/flow',
    { authkey: process.env.MSG91_AUTH_KEY },
    payload
  );
  if (status >= 400 || (body && body.type === 'error')) {
    throw new Error((body && body.message) || 'Failed to send OTP SMS via MSG91');
  }
  return { sent: true };
}

module.exports = { sendOtpSms, isConfigured, normalizeIndianMobile };
