/* ---------------- Shared face-recognition engine ----------------
   Used by both the admin enrollment screen (kiosk.js) and the kiosk
   attendance screen (admin.js's Face ID panel). Everything here runs
   in the browser: face detection, descriptor extraction, and matching
   all happen locally. Raw camera frames are never sent to the server —
   only the resulting 128-number descriptor is, and only when the admin
   explicitly enrolls someone or the kiosk confirms a match.

   Requires face-api.js (https://github.com/justadudewhohacks/face-api.js)
   to already be loaded as a global `faceapi`, via:
     <script src="https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js"></script>

   IMPORTANT: the MODEL_URL below points at a public CDN mirror of the
   model weight files. If this deployment's network blocks third-party
   CDNs (common on locked-down corporate networks), download the
   "weights" folder from the face-api.js repo, put it at
   /public/models/, and change MODEL_URL to '/models'. */

const FaceEngine = (() => {
  const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';
  // Euclidean distance below which two descriptors are treated as the same
  // person. Lower = stricter (fewer false accepts, more false rejects).
  // face-api.js's own docs suggest ~0.6 as a workable ceiling; we default
  // stricter than that because a false accept here means someone gets
  // attendance credit for a day they weren't there.
  const DEFAULT_THRESHOLD = 0.5;

  let modelsLoaded = false;

  async function loadModels() {
    if (modelsLoaded) return;
    if (typeof faceapi === 'undefined') {
      throw new Error('face-api.js did not load — check network access to the CDN script tag');
    }
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
    ]);
    modelsLoaded = true;
  }

  async function startCamera(videoEl) {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    videoEl.srcObject = stream;
    await videoEl.play();
    return stream;
  }

  function stopCamera(stream) {
    if (stream) stream.getTracks().forEach((t) => t.stop());
  }

  // Returns { descriptor: Float32Array, box } for the single most prominent
  // face in the current video frame, or null if no face is confidently
  // detected. Only ever looks at one face on purpose — a kiosk matching
  // multiple people in frame at once is a feature that invites mistakes.
  async function detectFace(videoEl) {
    const result = await faceapi
      .detectSingleFace(videoEl, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();
    if (!result) return null;
    return { descriptor: Array.from(result.descriptor), box: result.detection.box };
  }

  function distance(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
    return Math.sqrt(sum);
  }

  // profiles: [{ employeeId, employeeName, descriptors: [[128 numbers], ...] }]
  // Compares against every stored sample for every person and returns the
  // closest overall match, if it clears the threshold.
  function matchAgainstProfiles(descriptor, profiles, threshold = DEFAULT_THRESHOLD) {
    let best = null;
    for (const profile of profiles) {
      for (const sample of profile.descriptors) {
        const d = distance(descriptor, sample);
        if (!best || d < best.distance) {
          best = { employeeId: profile.employeeId, employeeName: profile.employeeName, distance: d };
        }
      }
    }
    if (best && best.distance <= threshold) return best;
    return null;
  }

  return { loadModels, startCamera, stopCamera, detectFace, distance, matchAgainstProfiles, DEFAULT_THRESHOLD };
})();
