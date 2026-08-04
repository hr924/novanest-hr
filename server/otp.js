// Sends and verifies mobile OTPs via 2Factor.in — an Indian SMS provider built
// specifically for OTP verification, so it doesn't need its own DLT template
// registration the way generic/custom SMS text does. Uses their standard
// AUTOGEN endpoint, which sends a 6-digit OTP.
//
// Required env var:
//   TWO_FACTOR_API_KEY   your API key from https://2factor.in
//
// If it isn't set, OTPs aren't actually sent by SMS — instead a 6-digit code
// is generated locally and printed to the server logs, so the flow is still
// testable without a provider account.

const fetch = require('node-fetch');
const crypto = require('crypto');

function isConfigured() {
  return !!process.env.TWO_FACTOR_API_KEY;
}

function normalizePhone(raw) {
  // Keep digits only, then take the last 10 (a plain Indian mobile number,
  // regardless of whether +91/91/spaces/dashes were typed in front of it).
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.slice(-10);
}

// Sends an OTP to `phone` (a normalized 10-digit number).
// Returns either { mode: 'provider', sessionId } or { mode: 'local', otpHash }
// depending on whether a real provider is configured.
async function sendOtp(phone) {
  if (!isConfigured()) {
    const otp = String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
    console.log('----------------------------------------------------------------');
    console.log('SMS OTP is not configured (TWO_FACTOR_API_KEY not set).');
    console.log(`OTP for +91${phone}: ${otp}`);
    console.log('----------------------------------------------------------------');
    return { mode: 'local', otpHash: crypto.createHash('sha256').update(otp).digest('hex') };
  }

  const url = `https://2factor.in/API/V1/${process.env.TWO_FACTOR_API_KEY}/SMS/+91${phone}/AUTOGEN`;
  const response = await fetch(url);
  const data = await response.json();
  if (data.Status !== 'Success') {
    throw new Error(data.Details || 'Failed to send OTP');
  }
  return { mode: 'provider', sessionId: data.Details };
}

// Verifies an OTP sent via the real provider (session-based).
async function verifyProviderOtp(sessionId, otp) {
  const url = `https://2factor.in/API/V1/${process.env.TWO_FACTOR_API_KEY}/SMS/VERIFY/${encodeURIComponent(sessionId)}/${encodeURIComponent(otp)}`;
  const response = await fetch(url);
  const data = await response.json();
  return data.Status === 'Success' && data.Details === 'OTP Matched';
}

module.exports = { sendOtp, verifyProviderOtp, normalizePhone, isConfigured };
