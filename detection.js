/* ============================================================================
   Ulavan Tech — Sensor-Guided Multi-Angle Plant Photo Capture
   Modules: CONFIG, CAMERA, SENSORS, OVERLAY/GUIDANCE, FLOW (state machine)
   ========================================================================== */

/* ---------------------------- 1. CONFIG ---------------------------- */
const STEP_KEYS = [
  { nameKey: "step_front",  textKey: "step_front_t", target: { yaw: 0, pitch: 0 }, tol: 10 },
  { nameKey: "step_left",   textKey: "step_left_t",  target: { yaw: -90, pitch: 0 }, tol: 10 },
  { nameKey: "step_back",   textKey: "step_back_t", target: { yaw: 180, pitch: 0 }, tol: 10 },
  { nameKey: "step_right",  textKey: "step_right_t", target: { yaw: 90, pitch: 0 }, tol: 10 },
  { nameKey: "step_crown",  textKey: "step_crown_t", target: { yaw: 0, pitch: 55 }, tol: 10 },
  { nameKey: "step_damage", textKey: "step_damage_t", target: { yaw: 0, pitch: -20 }, tol: 10 },
];
function currentSteps() {
  return STEP_KEYS.map((s) => ({
    name: (window.t ? t(s.nameKey) : s.nameKey),
    text: (window.t ? t(s.textKey) : s.textKey),
    target: s.target,
    tol: s.tol,
  }));
}
const STEPS = currentSteps();
const SMOOTH_WINDOW = 5;          // moving-average length for sensor readings
const STABLE_MS = 1400;           // ms held aligned before auto-capture
const AUTO_CAPTURE = true;        // auto-capture when aligned + stable; false => manual shutter after aligned
const CAP_QUALITY = 0.85;         // jpeg quality for stored captures
const CAP_WIDTH = 800;            // output width in px

const screens = {
  start: document.getElementById("start-screen"),
  capture: document.getElementById("capture-screen"),
  review: document.getElementById("review-screen"),
  result: document.getElementById("result-screen"),
};

let shots = new Array(STEPS.length).fill(null);
let currentStep = 0;
let stream = null;
let sensorsOn = false;           // true if orientation is delivering data
let alignedStart = 0;            // timestamp when alignment first became good

/* ---------------------------- 2. CAMERA ---------------------------- */
async function startCamera() {
  stopStream();
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  const v = document.getElementById("camera-view");
  v.srcObject = stream;
  await v.play().catch(() => {});
}

function stopStream() {
  if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
}

function captureToDataUrl() {
  const v = document.getElementById("camera-view");
  const canvas = document.createElement("canvas");
  canvas.width = CAP_WIDTH;
  canvas.height = v.videoHeight
    ? Math.round((v.videoHeight / v.videoWidth) * CAP_WIDTH)
    : Math.round(CAP_WIDTH * 4 / 3);
  canvas.getContext("2d").drawImage(v, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", CAP_QUALITY);
}

/* ---------------------------- 3. SENSORS ---------------------------- */
/* Orientation: alpha=z (compass), beta=x (front-back tilt), gamma=y (left-right tilt).
   We derive a simple "yaw" from gamma (L-R tilt) and "pitch" from beta (front-back tilt),
   then normalize so step 1 baseline is 0. */
let yaw = 0, pitch = 0;            // latest smoothed values (degrees), normalized to baseline
let baselineYaw = 0, baselinePitch = 0;
const yawBuf = [], pitchBuf = [];

function lerp(a, b, t) { return a + (b - a) * t; }
function wrap180(a) { a = ((a + 180) % 360 + 360) % 360 - 180; return a; }

function pushSmooth(buf, val, max) {
  buf.push(val);
  if (buf.length > max) buf.shift();
  return buf.reduce((a, b) => a + b, 0) / buf.length;
}

function onOrientation(e) {
  if (e.gamma == null || e.beta == null) return;
  const rawYaw = -e.gamma;            // negative: moving phone left => yaw negative
  const rawPitch = e.beta - 90;       // 90 = flat on table; 0 = upright
  yaw = pushSmooth(yawBuf, wrap180(rawYaw - baselineYaw), SMOOTH_WINDOW);
  pitch = pushSmooth(pitchBuf, wrap180(rawPitch - baselinePitch), SMOOTH_WINDOW);
  sensorsOn = true;
}

/* Permission for iOS + some Android Chrome */
async function requestSensorPermission() {
  if (typeof DeviceOrientationEvent !== "undefined" &&
      typeof DeviceOrientationEvent.requestPermission === "function") {
    try { await DeviceOrientationEvent.requestPermission(); } catch (e) { /* ignore */ }
  }
  window.addEventListener("deviceorientation", onOrientation, true);
  window.addEventListener("devicemotion", onMotion, true);
}

function onMotion(e) {
  // acceleration is optional; we only use it to detect shake (future use).
  /* kept for DeviceMotionEvent hook */
}

/* ---------------------------- 4. OVERLAY / GUIDANCE ---------------------------- */
const STATUS = { LOW: 0, MID: 1, OK: 2 };
const STATUS_CLASS = ["low", "mid", "ok"];

function setStatus(level, arrowDir) {
  const ring = document.getElementById("aim-ring");
  const arrow = document.getElementById("aim-arrow");
  const status = document.getElementById("status-line");
  const L = t, F = fill;
  ring.className = "ring " + STATUS_CLASS[level];
  arrow.className = "arrow " + (arrowDir || "none");
  const dir = arrowDir === "left" ? "left" : "right";
  if (level === STATUS.OK) {
    arrow.className = "arrow none";
    status.textContent = L("st_perfect");
    status.className = "line ok";
  } else if (level === STATUS.MID) {
    status.textContent = F(L("st_almost"), { DIR: L(dir === "left" ? "st_left" : "st_right") });
    status.className = "line mid";
  } else {
    status.textContent = F(L("st_move"), { DIR: L(dir === "left" ? "st_left" : "st_right") });
    status.className = "line low";
  }
}

function renderProgress() {
  const wrap = document.getElementById("progress-dots");
  wrap.innerHTML = STEPS.map((_, i) =>
    '<span class="pdot ' + (i < currentStep ? "done" : i === currentStep ? "now" : "") + '"></span>'
  ).join("");
}

function updateInstruction() {
  document.getElementById("instr-head").textContent =
    fill(t("photo_of"), { A: currentStep + 1, B: STEPS.length });
  document.getElementById("instr-text").textContent = STEPS[currentStep].text;
}

/* ---------------------------- 5. FLOW (state machine) ---------------------------- */
function show(name) {
  Object.keys(screens).forEach((k) => screens[k].classList.remove("active"));
  screens[name].classList.add("active");
}

function initStep() {
  currentStep = 0;
  shots.fill(null);
  renderProgress();
  updateInstruction();
  setStatus(STATUS.LOW, "right");
}

async function openCapture() {
  show("capture");
  document.body.classList.add("cam-open");
  initStep();
  try {
    await startCamera();
  } catch (err) {
    alert(fill(t("cam_unavailable"), { ERR: err.name }));
    show("start");
    return;
  }
  await requestSensorPermission();
  // after a moment, read baseline orientation for step 1
  setTimeout(readBaseline, 400);
  requestAnimationFrame(tick);
}

function readBaseline() {
  if (!sensorsOn) return;
  baselineYaw = lastRawYaw();
  baselinePitch = lastRawPitch();
}

/* Keep the last raw (unsmoothed) values for baseline capture */
let _lastRawYaw = 0, _lastRawPitch = 0;
function lastRawYaw() { return _lastRawYaw; }
function lastRawPitch() { return _lastRawPitch; }

/* override onOrientation to also keep raw values */
const __onOrientation = onOrientation;
onOrientation = function (e) {
  if (e.gamma != null && e.beta != null) {
    _lastRawYaw = -e.gamma;
    _lastRawPitch = e.beta - 90;
  }
  __onOrientation(e);
};

function isAligned() {
  const st = STEPS[currentStep];
  const dy = wrap180(yaw - st.target.yaw);
  const dp = wrap180(pitch - st.target.pitch);
  const dist = Math.sqrt(dy * dy + dp * dp);
  if (dist <= st.tol) return { aligned: true, level: STATUS.OK, dy };
  if (dist <= st.tol * 2.2) return { aligned: false, level: STATUS.MID, dy };
  return { aligned: false, level: STATUS.LOW, dy };
}

function tick() {
  if (!screens.capture.classList.contains("active")) return;
  const res = isAligned();
  const dy = res.dy;
  const moveLeft = dy > 0;          // need to increase yaw => move left? heuristic
  const arrowDir = moveLeft ? "right" : "left";

  if (res.aligned) {
    if (!alignedStart) alignedStart = performance.now();
    setStatus(STATUS.OK, null);
    const shutter = document.getElementById("shutter");
    shutter.disabled = false;
    if (AUTO_CAPTURE && performance.now() - alignedStart >= STABLE_MS) {
      doCapture();
      return;
    }
  } else {
    alignedStart = 0;
    document.getElementById("shutter").disabled = true;
    setStatus(res.level, arrowDir);
  }
  requestAnimationFrame(tick);
}

function doCapture() {
  shots[currentStep] = captureToDataUrl();
  buzz();
  if (currentStep === STEPS.length - 1) {
    finishedCapture();
    return;
  }
  currentStep++;
  renderProgress();
  updateInstruction();
  alignedStart = 0;
  setStatus(STATUS.LOW, "right");
  // baseline anchor: treat current position as the new start for next step
  baselineYaw = _lastRawYaw;
  baselinePitch = _lastRawPitch;
  yawBuf.length = 0; pitchBuf.length = 0;
  requestAnimationFrame(tick);
}

function finishedCapture() {
  stopStream();
  document.body.classList.remove("cam-open");
  renderReview();
  show("review");
}

function buzz() {
  if (navigator.vibrate) { try { navigator.vibrate(60); } catch (e) {} }
}

/* ---------------------------- Review ---------------------------- */
function renderReview() {
  document.getElementById("review-grid").innerHTML = shots
    .map((s, i) =>
      '<figure class="review-cell"><img src="' + s + '" alt="' + STEPS[i].name +
      '"><figcaption>' + (i + 1) + ". " + STEPS[i].name + "</figcaption></figure>"
    )
    .join("");
}

/* ---------------------------- Analysis (demo risk) ---------------------------- */
function decideRisk(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas"); c.width = c.height = 48;
      const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0, 48, 48);
      const px = ctx.getImageData(0, 0, 48, 48).data;
      let dark = 0, hash = 2166136261;
      for (let i = 0; i < px.length; i++) {
        hash ^= px[i]; hash = Math.imul(hash, 16777619);
        if (i % 4 === 0 && px[i] < 90 && px[i + 1] < 90 && px[i + 2] < 90) dark++;
      }
      const darkRatio = dark / (48 * 48);
      const roll = (hash >>> 0) % 1000;
      const score = darkRatio * 4 + roll / 5000;
      resolve(score < 0.22 ? "low" : score < 0.5 ? "medium" : "high");
    };
    img.src = dataUrl;
  });
}

function worstRisk(rs) { return rs.includes("high") ? "high" : rs.includes("medium") ? "medium" : "low"; }

function riskMeta(r) {
  const L = t;
  return {
    low:    { label: L("low_label"),    icon: "✅", title: L("low_title"), msg: L("low_msg") },
    medium: { label: L("med_label"),    icon: "⚠️", title: L("med_title"), msg: L("med_msg") },
    high:   { label: L("high_label"),   icon: "🚨", title: L("high_title"), msg: L("high_msg") },
  }[r];
}
function riskSolution(r) {
  return { low: t("low_sol"), medium: t("med_sol"), high: t("high_sol") }[r];
}

async function runAnalysis() {
  document.getElementById("result-icon").textContent = "🔍";
  const risks = [];
  for (const s of shots) risks.push(await decideRisk(s));
  const risk = worstRisk(risks);
  const meta = riskMeta(risk);
  document.getElementById("result-icon").textContent = meta.icon;
  document.getElementById("result-badge").textContent = meta.label;
  document.getElementById("result-badge").className = "risk-badge " + risk;
  document.getElementById("result-card").className = "result-card " + risk;
  document.getElementById("result-title").textContent = meta.title;
  document.getElementById("result-message").textContent = meta.msg;
  document.getElementById("result-action").textContent = riskSolution(risk);
  window._currentRisk = risk;
  window._currentThumbs = [...shots];
  show("result");
}

function resizeDataUrl(dataUrl, size) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas"); c.width = size;
      c.height = Math.round((img.height / img.width) * size);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", 0.8));
    };
    img.src = dataUrl;
  });
}

function saveToHistory(risk, thumbs) {
  const p = new URLSearchParams(window.location.search);
  const cropId = decodeURIComponent(p.get("crop") || "date-palm");
  const cropName = decodeURIComponent(p.get("name") || "Date Palm");
  const h = JSON.parse(localStorage.getItem("agri_history") || "[]");
  h.unshift({
    id: Date.now(),
    crop: cropName,
    cropId,
    risk,
    date: new Date().toLocaleString("en-IN"),
    thumb: thumbs[0] || "",
    note: t("history_note"),
  });
  localStorage.setItem("agri_history", JSON.stringify(h.slice(0, 50)));
}

/* ---------------------------- Wire up ---------------------------- */
(function initCropLabel() {
  const p = new URLSearchParams(window.location.search);
  const name = decodeURIComponent(p.get("name") || "");
  const el = document.getElementById("start-crop-name");
  if (el && name) el.textContent = name;
})();

document.getElementById("start-cam").addEventListener("click", openCapture);
document.getElementById("cancel-cam").addEventListener("click", () => {
  stopStream();
  document.body.classList.remove("cam-open");
  show("start");
});
document.getElementById("shutter").addEventListener("click", () => {
  if (isAligned().aligned) doCapture();
});
document.getElementById("retake-btn").addEventListener("click", () => {
  shots = new Array(STEPS.length).fill(null);
  openCapture();
});
document.getElementById("submit-btn").addEventListener("click", async () => {
  document.getElementById("result-icon").textContent = "🔍";
  document.getElementById("result-title").textContent = t("analyzing");
  document.getElementById("result-message").textContent = t("analyzing_msg");
  document.getElementById("result-action").textContent = "";
  document.getElementById("result-badge").textContent = "";
  document.getElementById("result-card").className = "result-card low";
  show("result");
  await new Promise((r) => setTimeout(r, 60));
  await runAnalysis();
});
document.getElementById("save").addEventListener("click", async () => {
  const thumbs = [];
  for (const s of window._currentThumbs) thumbs.push(await resizeDataUrl(s, 200));
  saveToHistory(window._currentRisk, thumbs);
  const b = document.getElementById("save"); b.textContent = t("saved"); b.disabled = true;
  setTimeout(() => (window.location.href = "history.html"), 700);
});
document.getElementById("scan-again").addEventListener("click", () => {
  shots = new Array(STEPS.length).fill(null);
  openCapture();
});

window.addEventListener("beforeunload", stopStream);

/* init */
(async function init() {
  await requestSensorPermission();   // attach listeners early
  if (!sensorsOn) {
    // sensors unavailable => text-only manual mode
    document.getElementById("status-line").textContent = t("sensor_unavailable");
  }
})();
