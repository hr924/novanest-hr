// Sends and verifies mobile OTPs via MSG91 — using the "Novanest HRM Login
// OTP" DLT-approved transactional template registered under Sender ID
// NVNSHR.
//
// Required env vars:
//   MSG91_AUTH_KEY      your Auth Key from MSG91 (Settings → API)
//   MSG91_TEMPLATE_ID   the MSG91 Template ID for "Novanest_HRM_Login_OTP"
//                        (NOT the DLT Template ID — MSG91 has its own ID,
//                        e.g. 6a75e596a338d41c830e4df2)
//
// If these aren't set, OTPs aren't actually sent by SMS — instead a 6-digit
// code is generated locally and printed to the server logs, so the flow is
// still testable without a provider account.

const fetch = require('node-fetch');
const crypto = require('crypto');

const MSG91_BASE_URL = 'https://control.msg91.com/api/v5/otp';
const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 5; // keep in sync with OTP_TTL_MS in routes/auth.js

function isConfigured() {
  return !!(process.env.MSG91_AUTH_KEY && process.env.MSG91_TEMPLATE_ID);
}

function normalizePhone(raw) {
  // Keep digits only, then take the last 10 (a plain Indian mobile number,
  // regardless of whether +91/91/spaces/dashes were typed in front of it).
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.slice(-10);
}

// Sends an OTP to `phone` (a normalized 10-digit number).
// Returns either { mode: 'provider', phone } or { mode: 'local', otpHash }
// depending on whether MSG91 credentials are configured. The 'provider'
// shape just carries the phone forward — MSG91 verifies by mobile number,
// not by a session ID like some other providers.
async function sendOtp(phone) {
  if (!isConfigured()) {
    const otp = String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
    console.log('----------------------------------------------------------------');
    console.log('SMS OTP is not configured (MSG91_AUTH_KEY / MSG91_TEMPLATE_ID not set).');
    console.log(`OTP for +91${phone}: ${otp}`);
    console.log('----------------------------------------------------------------');
    return { mode: 'local', otpHash: crypto.createHash('sha256').update(otp).digest('hex') };
  }

  const url = `${MSG91_BASE_URL}?template_id=${encodeURIComponent(process.env.MSG91_TEMPLATE_ID)}` +
    `&mobile=91${phone}&otp_length=${OTP_LENGTH}&otp_expiry=${OTP_EXPIRY_MINUTES}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authkey: process.env.MSG91_AUTH_KEY,
      'Content-Type': 'application/json'
    }
  });
  const data = await response.json();
  if (data.type !== 'success') {
    throw new Error(data.message || 'Failed to send OTP');
  }
  return { mode: 'provider', phone };
}

// Verifies an OTP sent via MSG91. `identifier` here is the phone number
// (MSG91 verifies by mobile number, unlike session-based providers).
async function verifyProviderOtp(identifier, otp) {
  const phone = identifier;
  const url = `${MSG91_BASE_URL}/verify?mobile=91${phone}&otp=${encodeURIComponent(otp)}`;
  const response = await fetch(url, {
    headers: { authkey: process.env.MSG91_AUTH_KEY }
  });
  const data = await response.json();
  return data.type === 'success';
}

module.exports = { sendOtp, verifyProviderOtp, normalizePhone, isConfigured };
