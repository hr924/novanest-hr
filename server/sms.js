// 2Factor.in SMS OTP wrapper. Unlike a plain SMS API, 2Factor generates,
// sends, AND verifies the OTP entirely on their end — this module is a
// thin wrapper around their two endpoints:
//   1. Start a verification (send OTP) -> returns a session ID
//   2. Check a code against that session ID -> true/false
//
// Configure via environment variable:
//   TWO_FACTOR_API_KEY   your 2Factor.in API key
//
// If it isn't set, sendOtp() logs a warning and returns an unusable session
// so the rest of the app doesn't crash — same pattern as the email mailer
// before SMTP is configured; only the SMS itself won't go out.

const https = require('https');

function isConfigured() {
  return !!process.env.TWO_FACTOR_API_KEY;
}

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch (e) { parsed = { raw: data }; }
        resolve({ status: res.statusCode, body: parsed });
      });
    }).on('error', reject);
  });
}

// Normalizes to a plain 10-digit Indian mobile number — 2Factor's SMS OTP
// endpoints expect just the 10 digits, no country code prefix.
function normalizeIndianMobile(value) {
  return String(value || '').replace(/\D/g, '').slice(-10);
}

// Starts a new OTP verification for this mobile number. Returns a session
// ID that must be passed into verifyOtp() along with the code the person
// types in.
async function sendOtp(mobile) {
  if (!isConfigured()) {
    console.warn(
      `[sms] 2Factor is not configured — skipped sending OTP to ${mobile}. ` +
      `Set TWO_FACTOR_API_KEY (see README) to enable OTP SMS.`
    );
    return { sent: false, sessionId: null };
  }
  const number = normalizeIndianMobile(mobile);
  const url = `https://2factor.in/API/V1/${process.env.TWO_FACTOR_API_KEY}/SMS/${number}/AUTOGEN`;
  const { body } = await get(url);
  if (!body || body.Status !== 'Success') {
    throw new Error((body && body.Details) || 'Failed to send OTP via 2Factor');
  }
  return { sent: true, sessionId: body.Details };
}

// Verifies a code against a previously-started session. Returns true/false
// for a normal right/wrong code — only throws on an actual API failure.
async function verifyOtp(sessionId, code) {
  if (!isConfigured() || !sessionId) {
    console.warn('[sms] 2Factor is not configured (or no session) — cannot verify OTP.');
    return false;
  }
  const url = `https://2factor.in/API/V1/${process.env.TWO_FACTOR_API_KEY}/SMS/VERIFY/${sessionId}/${encodeURIComponent(code)}`;
  const { body } = await get(url);
  return !!(body && body.Status === 'Success');
}

module.exports = { sendOtp, verifyOtp, isConfigured, normalizeIndianMobile };
