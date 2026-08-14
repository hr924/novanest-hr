const KIOSK_TOKEN_KEY = 'kioskDeviceToken';
const DETECT_INTERVAL_MS = 900;
// How long to keep showing a result on screen, and how long to wait before
// this device will try matching the *same* person again locally. The server
// enforces its own (longer) cooldown independently — this one just stops the
// kiosk hammering the API every 900ms while someone is still standing there.
const RESULT_DISPLAY_MS = 4000;
const LOCAL_RETRY_COOLDOWN_MS = 15000;

let profiles = [];
let cameraStream = null;
let detectTimer = null;
let busy = false;
let lastAttemptByEmployee = new Map();

function kioskToken() {
  return localStorage.getItem(KIOSK_TOKEN_KEY);
}

async function kioskFetch(path, options = {}) {
  const res = await fetch('/api' + path, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json', 'X-Kiosk-Token': kioskToken() },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  let data = {};
  try { data = await res.json(); } catch (e) { /* no body */ }
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status, data });
  return data;
}

function showSetup() {
  document.getElementById('setupScreen').classList.add('show');
  document.getElementById('mainScreen').classList.add('hide');
  if (cameraStream) { FaceEngine.stopCamera(cameraStream); cameraStream = null; }
  if (detectTimer) { clearInterval(detectTimer); detectTimer = null; }
}

function showMain() {
  document.getElementById('setupScreen').classList.remove('show');
  document.getElementById('mainScreen').classList.remove('hide');
}

function setStatus(text, sub) {
  document.getElementById('statusText').textContent = text;
  document.getElementById('subText').textContent = sub || '';
}

function showResult(kind, name, action) {
  const box = document.getElementById('resultBox');
  document.getElementById('resultName').textContent = name;
  document.getElementById('resultAction').textContent = action;
  box.className = 'kiosk-result show ' + kind;
  clearTimeout(box._t);
  box._t = setTimeout(() => box.classList.remove('show'), RESULT_DISPLAY_MS);
}

async function loadProfiles() {
  try {
    const data = await kioskFetch('/face/descriptors');
    profiles = data.profiles;
  } catch (err) {
    // Non-fatal: keep using whatever profiles we already have. A transient
    // network blip shouldn't stop the kiosk from recognizing people it
    // already downloaded templates for.
    console.warn('Could not refresh face profiles:', err.message);
  }
}

async function markAttendance(employeeId, matchDistance) {
  try {
    const res = await kioskFetch('/face/mark', { method: 'POST', body: { employeeId, matchDistance } });
    const label = res.action === 'checkin' ? 'Checked in' : 'Checked out';
    showResult('ok', res.employeeName, label + ' · ' + new Date().toLocaleTimeString());
  } catch (err) {
    if (err.status === 429) {
      showResult('warn', err.data.employeeName || '', 'Already marked — one moment');
    } else if (err.status === 400) {
      showResult('warn', err.data.employeeName || '', "Today's attendance is already complete");
    } else {
      showResult('err', '', 'Could not reach the server — try again');
    }
  }
}

async function tick() {
  if (busy || !cameraStream) return;
  busy = true;
  try {
    const video = document.getElementById('video');
    const found = await FaceEngine.detectFace(video);
    if (!found) {
      setStatus('Show your face to check in or out', '');
      return;
    }
    const match = FaceEngine.matchAgainstProfiles(found.descriptor, profiles);
    if (!match) {
      setStatus('Face not recognized', 'If you are enrolled, try better lighting or ask HR to re-enroll you');
      return;
    }
    setStatus('Recognized ' + match.employeeName, '');
    const last = lastAttemptByEmployee.get(match.employeeId) || 0;
    if (Date.now() - last < LOCAL_RETRY_COOLDOWN_MS) return; // already attempted recently, don't spam the API
    lastAttemptByEmployee.set(match.employeeId, Date.now());
    await markAttendance(match.employeeId, match.distance);
  } catch (err) {
    console.warn('Detection tick failed:', err.message);
  } finally {
    busy = false;
  }
}

async function runMain() {
  showMain();
  setStatus('Loading face recognition…', 'This can take a few seconds on first launch');
  try {
    await FaceEngine.loadModels();
  } catch (err) {
    setStatus('Failed to load face recognition', err.message);
    return;
  }
  setStatus('Starting camera…', '');
  try {
    cameraStream = await FaceEngine.startCamera(document.getElementById('video'));
  } catch (err) {
    setStatus('Camera access needed', 'Allow camera permission for this device and reload');
    return;
  }
  await loadProfiles();
  setInterval(loadProfiles, 5 * 60 * 1000); // pick up newly enrolled/removed employees without a restart
  setStatus('Show your face to check in or out', '');
  detectTimer = setInterval(tick, DETECT_INTERVAL_MS);
}

document.getElementById('setupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const token = document.getElementById('tokenInput').value.trim();
  const errEl = document.getElementById('setupError');
  errEl.textContent = '';
  try {
    const res = await fetch('/api/face/descriptors', { headers: { 'X-Kiosk-Token': token } });
    if (!res.ok) throw new Error('Invalid token');
    localStorage.setItem(KIOSK_TOKEN_KEY, token);
    runMain();
  } catch (err) {
    errEl.textContent = 'That token was rejected — check it and try again.';
  }
});

document.getElementById('setupToggle').addEventListener('click', () => {
  document.getElementById('tokenInput').value = '';
  showSetup();
});

if (kioskToken()) {
  runMain();
} else {
  showSetup();
}
