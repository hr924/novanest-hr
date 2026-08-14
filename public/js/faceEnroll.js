/* ---------------- Admin: face enrollment modal ----------------
   Captures live webcam samples in the admin's browser, extracts a face
   descriptor from each locally (via FaceEngine / face-api.js), and only
   sends those descriptors to the server — never the photo itself. */

const FACE_ENROLL_MIN_SAMPLES = 3;
const FACE_ENROLL_MAX_SAMPLES = 5;

let faceEnrollStream = null;
let faceEnrollSamples = [];
let faceEnrollEmployeeId = null;
let faceEnrollModelsReady = false;

function faceEnrollDotsHtml() {
  let html = '';
  for (let i = 0; i < FACE_ENROLL_MAX_SAMPLES; i++) {
    const filled = i < faceEnrollSamples.length;
    const required = i < FACE_ENROLL_MIN_SAMPLES;
    html += `<span style="width:10px; height:10px; border-radius:50%; display:inline-block; background:${filled ? 'var(--ledger)' : 'transparent'}; border:2px solid ${filled ? 'var(--ledger)' : (required ? 'var(--line)' : 'transparent')};"></span>`;
  }
  return html;
}

function faceEnrollRefreshUI() {
  document.getElementById('faceEnrollDots').innerHTML = faceEnrollDotsHtml();
  const saveBtn = document.getElementById('faceEnrollSave');
  const captureBtn = document.getElementById('faceEnrollCapture');
  saveBtn.style.display = faceEnrollSamples.length >= FACE_ENROLL_MIN_SAMPLES ? 'block' : 'none';
  captureBtn.style.display = faceEnrollSamples.length >= FACE_ENROLL_MAX_SAMPLES ? 'none' : 'block';
}

async function openFaceEnrollModal(employeeId) {
  const employee = (typeof FACE_ID_EMPLOYEES !== 'undefined' ? FACE_ID_EMPLOYEES : []).find((e) => e.employeeId === employeeId);
  faceEnrollEmployeeId = employeeId;
  faceEnrollSamples = [];
  document.getElementById('faceEnrollTitle').textContent = 'Enroll face — ' + (employee ? employee.employeeName : '');
  document.getElementById('faceEnrollModal').classList.add('show');
  faceEnrollRefreshUI();
  const statusEl = document.getElementById('faceEnrollStatus');
  statusEl.textContent = 'Loading face recognition…';
  statusEl.style.color = 'var(--ink-soft)';
  try {
    if (!faceEnrollModelsReady) {
      await FaceEngine.loadModels();
      faceEnrollModelsReady = true;
    }
    statusEl.textContent = 'Starting camera…';
    faceEnrollStream = await FaceEngine.startCamera(document.getElementById('faceEnrollVideo'));
    statusEl.textContent = `Look at the camera and capture ${FACE_ENROLL_MIN_SAMPLES}+ samples`;
  } catch (err) {
    statusEl.textContent = 'Could not start camera/recognition: ' + err.message;
    statusEl.style.color = 'var(--rust)';
  }
}

function closeFaceEnrollModal() {
  document.getElementById('faceEnrollModal').classList.remove('show');
  if (faceEnrollStream) { FaceEngine.stopCamera(faceEnrollStream); faceEnrollStream = null; }
}

document.getElementById('faceEnrollCapture').addEventListener('click', async () => {
  const statusEl = document.getElementById('faceEnrollStatus');
  const video = document.getElementById('faceEnrollVideo');
  statusEl.style.color = 'var(--ink-soft)';
  statusEl.textContent = 'Capturing…';
  try {
    const found = await FaceEngine.detectFace(video);
    if (!found) {
      statusEl.textContent = 'No face detected — center your face in frame and try again';
      statusEl.style.color = 'var(--rust)';
      return;
    }
    faceEnrollSamples.push(found.descriptor);
    faceEnrollRefreshUI();
    statusEl.textContent = `Captured ${faceEnrollSamples.length} sample${faceEnrollSamples.length === 1 ? '' : 's'}`;
  } catch (err) {
    statusEl.textContent = 'Capture failed: ' + err.message;
    statusEl.style.color = 'var(--rust)';
  }
});

document.getElementById('faceEnrollRetake').addEventListener('click', () => {
  faceEnrollSamples = [];
  faceEnrollRefreshUI();
  document.getElementById('faceEnrollStatus').textContent = `Look at the camera and capture ${FACE_ENROLL_MIN_SAMPLES}+ samples`;
  document.getElementById('faceEnrollStatus').style.color = 'var(--ink-soft)';
});

document.getElementById('faceEnrollSave').addEventListener('click', async () => {
  try {
    await api('/face/enroll', { method: 'POST', body: { employeeId: faceEnrollEmployeeId, descriptors: faceEnrollSamples } });
    toast('Face enrolled');
    closeFaceEnrollModal();
    if (typeof VIEW !== 'undefined' && VIEW === 'faceid') renderFaceId();
  } catch (err) {
    toast(err.message, true);
  }
});
