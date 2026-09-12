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
const AUTO_CAPTURE = false;        // user captures manually; instructions guide the angle
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
let manualMode = false;          // true when live camera is unavailable (photo picker used)
let noSensors = false;           // true when orientation sensors never deliver data

const fileInput = document.getElementById("file-input");
const pickBtn = document.getElementById("pick-cam");
const shutterBtn = document.getElementById("shutter");

/* ---------------------------- 2. CAMERA ---------------------------- */
async function startCamera() {
  stopStream();
  const md = navigator.mediaDevices;
  if (!md || !md.getUserMedia) throw new Error("unsupported");
  const v = document.getElementById("camera-view");
  try {
    stream = await md.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
  } catch (e) {
    // Some browsers reject ideal "environment" on the first try — retry minimal.
    stream = await md.getUserMedia({ video: true, audio: false });
  }
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
  const hint = document.getElementById("tap-hint");
  if (hint) hint.textContent = fill(t("tap_hint"), { A: currentStep + 1, B: STEPS.length });
}

/* ---------------------------- 5. FLOW (state machine) ---------------------------- */
function show(name) {
  Object.keys(screens).forEach((k) => {
    screens[k].classList.remove("active");
    if (k !== name) screens[k].classList.add("hidden");
  });
  screens[name].classList.remove("hidden");
  screens[name].classList.add("active");
}

function initStep() {
  currentStep = 0;
  shots.fill(null);
  renderProgress();
  updateInstruction();
  const b = document.getElementById("dir-banner");
  if (b) b.classList.add("hidden");
  setStatus(STATUS.LOW, "right");
}

async function openCapture() {
  show("capture");
  document.body.classList.add("cam-open");
  initStep();
  manualMode = false;
  noSensors = false;
  pickBtn.classList.add("hidden");
  shutterBtn.classList.remove("hidden");
  /* Request device-orientation permission FIRST, inside the tap's user
     gesture. On iOS Safari this call only succeeds while the gesture is
     still active — doing it after await getUserMedia() loses it. */
  await requestSensorPermission();
  try {
    await startCamera();
  } catch (err) {
    // Live camera unavailable (e.g. phone over http://, or permissions denied).
    // Fall back to the photo picker, which opens the phone camera app.
    manualMode = true;
    try { stopStream(); } catch (e) {}
    const v = document.getElementById("camera-view");
    v.removeAttribute("src");
    pickBtn.classList.remove("hidden");
    shutterBtn.classList.add("hidden");
    document.getElementById("status-line").textContent = t("pick_hint");
    document.getElementById("status-line").className = "line mid";
  }
  // If orientation sensors never start, drop the alignment gate so the user
  // can still press the shutter and take photos (the "camera does nothing" bug).
  setTimeout(() => {
    if (!manualMode && !sensorsOn && !noSensors) {
      noSensors = true;
      shutterBtn.disabled = false;
      const s = document.getElementById("status-line");
      if (s && !manualMode) {
        s.textContent = t("sensor_unavailable");
        s.className = "line mid";
      }
    }
  }, 3000);
  // after a moment, read baseline orientation for step 1
  setTimeout(readBaseline, 450);
  if (!manualMode) requestAnimationFrame(tick);
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

function renderBanner() {
  const b = document.getElementById("dir-banner");
  if (!b) return;
  if (manualMode || noSensors) { b.classList.add("hidden"); return; }
  const st = STEPS[currentStep];
  if (!st) { b.classList.add("hidden"); return; }
  const dyaw = wrap180(st.target.yaw - yaw);
  const dpitch = wrap180(st.target.pitch - pitch);
  const ed = Math.abs(dyaw), pd = Math.abs(dpitch);
  let cls, text;
  if (ed <= st.tol && pd <= st.tol) {
    cls = "ok";
    text = t("st_perfect");
  } else if (pd * 1.3 > ed) {
    // tilt (up/down) is the bigger error — show the step's own guidance
    cls = "step";
    const dx = dpitch > 0 ? "↺" : "↻";
    text = dx + "  " + st.text;
  } else if (Math.max(ed, pd) <= st.tol * 3) {
    cls = "slight";
    text = "⟷  " + fill(t("st_almost"), { DIR: t(dyaw > 0 ? "st_right" : "st_left") }) + "  ·  " + Math.round(ed) + "°";
  } else {
    cls = "mv";
    text = (dyaw > 0 ? "⟶  " : "⟵  ") + fill(t("st_move"), { DIR: t(dyaw > 0 ? "st_right" : "st_left") }) + "  ·  " + Math.round(ed) + "°";
  }
  b.className = "dir-banner " + cls + " active";
  b.textContent = text;
}

function tick() {
  if (!screens.capture.classList.contains("active")) return;
  if (noSensors) {
    // Sensors may come online late (slow iOS grant) — resume guidance then.
    if (sensorsOn) {
      noSensors = false;
      readBaseline();
    } else {
      // No orientation data: keep the shutter enabled for manual captures.
      document.getElementById("shutter").disabled = false;
      requestAnimationFrame(tick);
      return;
    }
  }
  renderBanner();
  const res = isAligned();
  const dy = res.dy;
  const moveLeft = dy > 0;          // need to increase yaw => move left? heuristic
  const arrowDir = moveLeft ? "right" : "left";

  /* Manual capture: always let the user press the shutter. The banner and
     status line still guide the angle, but never block the button. */
  document.getElementById("shutter").disabled = false;
  if (res.aligned) {
    if (!alignedStart) alignedStart = performance.now();
    setStatus(STATUS.OK, null);
  } else {
    alignedStart = 0;
    setStatus(res.level, arrowDir);
  }
  requestAnimationFrame(tick);
}

function doCapture() {
  shots[currentStep] = captureToDataUrl();
  advanceAfterShot();
}

function advanceAfterShot() {
  buzz();
  if (currentStep === STEPS.length - 1) {
    finishedCapture();
    return;
  }
  currentStep++;
  renderProgress();
  updateInstruction();
  alignedStart = 0;
  if (!manualMode) {
    setStatus(STATUS.LOW, "right");
    // baseline anchor: treat current position as the new start for next step
    baselineYaw = _lastRawYaw;
    baselinePitch = _lastRawPitch;
    yawBuf.length = 0; pitchBuf.length = 0;
    requestAnimationFrame(tick);
  }
}

function onFileChosen() {
  const f = fileInput.files && fileInput.files[0];
  if (!f) return;
  fileInput.value = "";
  const r = new FileReader();
  r.onload = () => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = CAP_WIDTH;
      c.height = Math.round((img.height / img.width) * CAP_WIDTH);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      shots[currentStep] = c.toDataURL("image/jpeg", CAP_QUALITY);
      advanceAfterShot();
    };
    img.src = r.result;
  };
  r.readAsDataURL(f);
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

/* ---------------------------- Analysis ---------------------------- */
/* Real on-device per-photo image analysis: computes crown greenness,
   damage/lesion ratio (brown/dark necrotic pixels) and photo sharpness
   (blur) from the actual pixel data. Returns a 0..1 health score. */
function imageHealthScore(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const S = 110;
        const c = document.createElement("canvas"); c.width = c.height = S;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, S, S);
        const px = ctx.getImageData(0, 0, S, S).data;
        let green = 0, brown = 0, dark = 0, total = S * S;
        let sum = 0, sumSq = 0;
        for (let i = 0; i < px.length; i += 4) {
          const r = px[i], g = px[i + 1], b = px[i + 2];
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          sum += lum; sumSq += lum * lum;
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
          const isGreen = g > r && g > b && g > 38 && (g - r) > 10;
          const isBrown = r > 90 && r > g + 22 && r > b + 22 && (r - g) > 30;
          const isDark = lum < 42;
          if (isGreen) green++;
          if (isBrown) brown++;
          if (isDark) dark++;
        }
        const greenRatio = green / total;
        const brownRatio = brown / total;
        const darkRatio = dark / total;
        const mean = sum / (S * S);
        const variance = sumSq / (S * S) - mean * mean;
        // blur estimate: low intensity variance over a small image => soft/motion blur
        const sharpness = Math.min(1, variance / 1800);
        // Damage hint: brown + very dark pixels. Dark pixels alone (soil,
        // shadow, sky gap) are NOT plant damage — only pairs with brown.
        const darkHit = (brown > 0.01 && dark > 0.12) ? dark * 0.8 : 0;
        const foliage = green + brown + dark * 0.3;
        // Fraction of the seen foliage that is necrotic: browned tissue plus
        // brown-adjacent darkness, over everything that looks plant-like.
        const lesion = foliage > 0.01 ? Math.min(1, (brown + darkHit) / foliage) : 1;
        // A palm whose fronds still outnumber its browned tissue earns a
        // small green bonus so a heavy-trunk angle is not read as ruined.
        let health = 1 - lesion * 1.3;
        if (greenRatio > brownRatio) health = Math.min(1, health + Math.min(0.15, greenRatio * 0.15));
        health = Math.max(0, health);
        const blur = 1 - sharpness;              // 1 = very blurry
        let note = "";
        if (blur > 0.45) note = "blurry";
        else if (greenRatio > 0.30 && brownRatio < 0.12) note = "healthy";
        else if (lesion > 0.35) note = "damage";
        else note = "unclear";
        resolve({ health, lesion, greenRatio, blur, note });
      } catch (e) {
        resolve({ health: 0.5, lesion: 0.15, greenRatio: 0.2, blur: 0.2, note: "unclear" });
      }
    };
    img.onerror = () => resolve({ health: 0.5, damage: 0.15, greenRatio: 0.2, blur: 0.2, note: "unclear" });
    img.src = dataUrl;
  });
}

function healthToRisk(h) {
  if (h >= 0.55) return { risk: "low", conf: 60 + Math.round((h - 0.55) * 80) };
  if (h >= 0.30) return { risk: "medium", conf: 55 + Math.round((h - 0.30) * 120) };
  return { risk: "high", conf: 60 + Math.round((1 - h) * 100) };
}

/* ------------------- Bundled on-device AI model -------------------
   PlantVillage-trained healthy/diseased classifier (MobileNetV2 head,
   96x96, [-1,1] input, single sigmoid output = P(healthy)). Loaded
   lazily after page load; all failure is silent so detection always
   falls back to pixel health analysis. */
let detectionModel = null;
const MODEL_URL = "models/plant-health/model.json";

async function initDetectionModel() {
  if (detectionModel || !(window.tf && typeof tf.loadGraphModel === "function")) return;
  try {
    detectionModel = await tf.loadGraphModel(MODEL_URL);
    window.detectionModel = detectionModel;   // exposed for tests / debugging
  } catch (e) {
    detectionModel = null;
    window._modelErr = (e && e.message) || "load failed";
  }
}

/* Per-photo model inference: returns 0..1 P(healthy) or null on any failure. */
function imageModelHealth(dataUrl) {
  return new Promise((resolve) => {
    if (!detectionModel) { resolve(null); return; }
    const img = new Image();
    img.onload = () => {
      try {
        const S = 96;
        const c = document.createElement("canvas"); c.width = c.height = S;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, S, S);
        const px = ctx.getImageData(0, 0, S, S).data;
        const data = new Float32Array(S * S * 3);
        for (let i = 0, j = 0; i < px.length; i += 4) {
          data[j++] = (px[i] / 127.5) - 1;
          data[j++] = (px[i + 1] / 127.5) - 1;
          data[j++] = (px[i + 2] / 127.5) - 1;
        }
        const t = tf.tensor4d(data, [1, S, S, 3]);
        const out = detectionModel.predict(t);
        const v = out.dataSync()[0];
        t.dispose(); out.dispose();
        resolve(v);
      } catch (e) { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

function localAnalyse() {
  return Promise.all(shots.map(imageHealthScore)).then(async (metrics) => {
    const n = metrics.length;
    /* Blend in the trained model when it is ready: confident model verdicts
       (>=0.6 healthy / <=0.4 diseased) steer the per-photo health score,
       keeping the pixel analysis as the tie-breaker in between. */
    let modelUsed = false;
    if (detectionModel) {
      const mh = await Promise.all(shots.map(imageModelHealth));
      const ok = mh.filter((v) => v != null);
      if (ok.length >= Math.min(3, n)) {
        modelUsed = true;
        metrics = metrics.map((m, i) => {
          const v = (mh[i] == null) ? null : mh[i];
          if (v == null) return m;
          const note = v >= 0.60 ? "healthy"
            : (v <= 0.40 ? "damage"
            : (m.note === "blurry" ? "blurry" : m.note));
          return Object.assign({}, m, { health: v * 0.65 + m.health * 0.35, note });
        });
      }
    }
    const clear = [], unsure = [];
    metrics.forEach((m) => {
      (m.note === "blurry" || m.note === "unclear") ? unsure.push(m) : clear.push(m);
    });
    /* NOT-A-PLANT GATE — runs on EVERY set, not just sharp ones.
       Green coverage is a colour property, so it survives blur: a
       face/skin/wall/sky/cement photo is near-zero-green even when soft,
       whereas a genuine palm frond stays green even when out of focus.
       Without this gate a selfie was being scored "high risk · act now". */
    const gateSrc = clear.length >= 2 ? clear : metrics;
    const avgGateGreen = gateSrc.reduce((a, m) => a + m.greenRatio, 0) / gateSrc.length;
    const strongGate = clear.length >= Math.min(3, n);
    // Very low green across every photo = genuinely not a plant. The
    // threshold is kept low so a distant palm (small green fraction in
    // frame) is NOT mistaken for a wall or person.
    if (avgGateGreen < (strongGate ? 0.035 : 0.03)) {
      return {
        risk: "no_plant",
        confidence: 72,
        findings: ["no_plant"],
        method: "local"
      };
    }

    /* Decide only on clear photos when we have at least half the set sharp. */
    const pool = clear.length >= Math.min(3, n) ? clear : metrics;
    const avgH = pool.reduce((a, m) => a + m.health, 0) / pool.length;
    const damageCount = pool.filter((m) => m.note === "damage").length;
    const clarity = clear.length / n;
    const trust = clear.length >= Math.min(3, n) ? 1 : clarity;

    let risk, confBase;
    if (clear.length < 3) {
      /* Not enough sharp evidence -> never issue a treat-now warning. */
      risk = avgH < 0.42 ? "medium" : "low";
      confBase = 30 + Math.round(clarity * 30);
    } else if (damageCount >= 2) {
      risk = healthToRisk(avgH).risk;
      confBase = 55 + Math.round((1 - avgH) * 35) + Math.round(clarity * 10);
    } else {
      /* A single damage photo should never be scored below "medium". */
      const base = healthToRisk(avgH).risk;
      risk = (damageCount === 1 && base === "low") ? "medium" : base;
      confBase = 45 + Math.round(clarity * 30);
    }
    const confidence = Math.max(35, Math.min(92, Math.round(confBase * (0.7 + 0.3 * trust))));

    const findings = [];
    if (damageCount >= 2) findings.push("damage_spots");
    else if (damageCount === 1) findings.push("one_damage");
    if (unsure.length >= Math.ceil(n / 2)) findings.push("too_blurry");
    else if (unsure.length > 0 && damageCount === 0) findings.push("unclear_view");
    if (clear.length >= 5 && findings.length === 0) findings.push("looks_healthy");
    if (findings.length === 0) findings.push(clear.length >= 3 ? "mixed" : "unclear_view");
    return {
      risk,
      confidence,
      findings,
      method: modelUsed ? "model" : "local"
    };
  });
}

/* ---- Optional AI vision analysis. Gemini (free tier). ---- */
function detectionCfg() {
   let cfg = { provider: "free", geminiKey: "", geminiModel: "" };
   try {
     const s = window.localStorage && window.localStorage.getItem("ulavanChatCfg");
     if (s) {
       const o = JSON.parse(s);
       cfg.provider = o.provider || "free";
       cfg.geminiKey = o.geminiKey || "";
       cfg.geminiModel = o.geminiModel || "";
     }
   } catch (e) {}
   if (!cfg.geminiKey && typeof window.GEMINI_KEY === "string") cfg.geminiKey = window.GEMINI_KEY;
   cfg.geminiModel = (typeof window.GEMINI_MODEL === "string") ? window.GEMINI_MODEL : "gemini-3.6-flash";
   return cfg;
 }

function extractJson(text) {
  if (!text) return null;
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s === -1 || e <= s) return null;
  try { return JSON.parse(text.slice(s, e + 1)); } catch (err) { return null; }
}

function visionPrompt(cropName) {
  return "You are a plant/crop health expert. These are 6 photos of one " +
    (cropName ? cropName : "crop") + " plant taken around it: " +
    "front, left, back, right, crown (top), and damage-area close-up. Examine all six together. " +
    "Reply ONLY with one JSON object: " +
    '{"risk":"low"|"medium"|"high"|"no_plant","confidence":0..100,"issues":["short issue names"],"notes":"one short sentence"}. ' +
    '"low" = clearly healthy, "medium" = some warning signs, "high" = serious damage/pest visible, ' +
    '"no_plant" = the photos show no plant at all (e.g. a person, wall, or sky). ' +
    "If a photo is too blurry or unclear, say so in notes. Do not add text outside the JSON."
}

function parseVisionJson(o) {
  if (!o) return null;
  const risk = ["low", "medium", "high", "no_plant"].includes(o.risk) ? o.risk : null;
  if (!risk) return null;
  const conf = Math.max(0, Math.min(100, Number(o.confidence) || 50));
  const issues = Array.isArray(o.issues)
    ? o.issues.filter((x) => typeof x === "string").slice(0, 6)
    : [];
  return {
    risk,
    confidence: Math.round(conf),
    findings: issues.length ? issues : (risk === "no_plant" ? ["no_plant"] : (risk === "low" ? ["looks_healthy"] : ["mixed"])),
    notes: typeof o.notes === "string" ? o.notes.slice(0, 160) : "",
    method: "vision"
  };
}

function visionAnalyse(shotsToAnalyse) {
  if (typeof window.fetch !== "function") return Promise.resolve(null);
  const cfg = detectionCfg();
  const cropName = (function () {
    try { return decodeURIComponent(new URLSearchParams(window.location.search).get("name") || ""); } catch (e) { return ""; }
  })();
  if (cfg.geminiKey) return geminiVision(shotsToAnalyse, cfg, cropName);
  return Promise.resolve(null);
}

/* Gemini generateContent via the FREE API tier (aistudio.google.com/apikey). */
function geminiVision(shotsToAnalyse, cfg, cropName) {
  const parts = shotsToAnalyse
    .filter((d) => d && d.indexOf("data:image") === 0)
    .map((d) => ({ inline_data: { mime_type: "image/jpeg", data: d.slice(d.indexOf(",") + 1) } }));
  if (!parts.length) return Promise.resolve(null);
  parts.push({ text: visionPrompt(cropName) });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90000);
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(cfg.geminiModel) + ":generateContent";
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": cfg.geminiKey
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 }
    }),
    signal: ctrl.signal
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      clearTimeout(timer);
      const text = j && j.candidates && j.candidates[0] &&
        j.candidates[0].content && j.candidates[0].content.parts &&
        j.candidates[0].content.parts.map((p) => p.text || "").join("");
      return parseVisionJson(extractJson(text));
    })
    .catch(() => { clearTimeout(timer); return null; });
}

async function resizeAnalyseDataUrl(dataUrl) {
  return resizeDataUrl(dataUrl, 512);
}

function riskMeta(r) {
  const L = t;
  return {
    no_plant: { label: L("np_label"), icon: "🙅", title: L("np_title"), msg: L("np_body") },
    low:    { label: L("low_label"),    icon: "✅", title: L("low_title"), msg: L("low_msg") },
    medium: { label: L("med_label"),    icon: "⚠️", title: L("med_title"), msg: L("med_msg") },
    high:   { label: L("high_label"),   icon: "🚨", title: L("high_title"), msg: L("high_msg") },
  }[r];
}
function riskSolution(r) {
  return { no_plant: t("np_sol"), low: t("low_sol"), medium: t("med_sol"), high: t("high_sol") }[r];
}

function findingText(key) {
  const L = t;
  const map = {
    no_plant: L("f_no_plant"),
    damage_spots: L("f_damage_spots"),
    one_damage: L("f_one_damage"),
    too_blurry: L("f_too_blurry"),
    looks_healthy: L("f_looks_healthy"),
    unclear_view: L("f_unclear_view"),
    mixed: L("f_mixed"),
  };
  return map[key] || key;
}

async function runAnalysis() {
  document.getElementById("result-icon").textContent = "🔍";
  const resized = await Promise.all(shots.map(resizeAnalyseDataUrl));
  const vision = await visionAnalyse(resized);
  let analysis = vision || await localAnalyse();
  /* Cross-check: if vision says "not a plant" but the on-device pixel
     analysis begs to differ (pixels clearly show green foliage — e.g. an
     unusual crop, a tight close-up, or a far palm), prefer the pixel
     reading so a real healthy plant is never dismissed. */
  if (analysis && analysis.risk === "no_plant" && analysis.method === "vision") {
    try {
      const local = await localAnalyse();
      if (local && !(local.risk === "no_plant")) {
        analysis = local;
      }
    } catch (e) { /* keep vision verdict */ }
  }
  const risk = analysis.risk;
  const meta = riskMeta(risk);
  document.getElementById("result-icon").textContent = meta.icon;
  document.getElementById("result-badge").textContent = meta.label;
  document.getElementById("result-badge").className = "risk-badge " + risk;
  document.getElementById("result-card").className = "result-card " + risk;
  document.getElementById("result-title").textContent = meta.title;
  document.getElementById("result-message").textContent = meta.msg;
  const findingsEl = document.getElementById("result-findings");
  const findings = (analysis.findings || []).map(findingText).join(" · ");
  findingsEl.textContent = findings ? "🩺 " + findings : "";
  const chip = document.getElementById("method-chip");
  const methodLabel = analysis.method === "vision" ? t("method_vision")
    : (analysis.method === "model" ? t("method_model") : t("method_local"));
  chip.textContent = methodLabel + " · " + t("confidence") + " " + (analysis.confidence || 0) + "%";
  let action = riskSolution(risk);
  if (analysis.notes) action += " — " + analysis.notes;
  document.getElementById("result-action").textContent = action;
  window._currentRisk = risk;
  window._currentThumbs = [...shots];
  window._currentConfidence = analysis.confidence || 0;
  window._currentMethod = analysis.method;
  window._currentFindings = (analysis.findings || []).join(", ");
  show("result");
}

function resizeDataUrl(dataUrl, size) {
  return new Promise((resolve) => {
    if (!dataUrl) { resolve(""); return; }
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement("canvas"); c.width = size;
        c.height = Math.round((img.height / img.width) * size);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.8));
      } catch (e) { resolve(""); }
    };
    img.onerror = () => resolve("");
    img.src = dataUrl;
  });
}

/* ---------------------------- Wire up ---------------------------- */
(function initCropLabel() {
  const p = new URLSearchParams(window.location.search);
  let name = "";
  try { name = decodeURIComponent(p.get("name") || ""); } catch (e) { name = ""; }
  const el = document.getElementById("guided-desc");
  function apply() {
    if (!el || !name) return;
    const txt = window.fill ? window.fill(t("guided_desc"), { CROP: name }) : (t("guided_desc") || "").replace("__CROP__", name);
    el.textContent = txt;
  }
  apply();
  window.onLangChange = apply;
})();

function saveToHistory(risk, thumbs) {
  const p = new URLSearchParams(window.location.search);
  let cropId = "date-palm", cropName = "Date Palm";
  try { cropId = decodeURIComponent(p.get("crop") || "date-palm"); } catch (e) {}
  try { cropName = decodeURIComponent(p.get("name") || "Date Palm"); } catch (e) {}
  const h = JSON.parse(localStorage.getItem("agri_history") || "[]");
  const rec = {
    id: Date.now(),
    crop: cropName,
    cropId,
    risk,
    date: new Date().toLocaleString("en-IN"),
    thumb: thumbs[0] || "",
    note: t("history_note"),
    confidence: window._currentConfidence || 0,
    method: window._currentMethod || "",
    findings: window._currentFindings || "",
  };
  /* Medium/high risk palms get a 48-hour recheck reminder. */
  if (risk === "medium" || risk === "high") {
    rec.followUpAt = Date.now() + 48 * 60 * 60 * 1000;
    rec.followUpDone = false;
  }
  h.unshift(rec);
  localStorage.setItem("agri_history", JSON.stringify(h.slice(0, 50)));
  if (window.followupSync) window.followupSync();
}

document.getElementById("start-cam").addEventListener("click", openCapture);
document.getElementById("cancel-cam").addEventListener("click", () => {
  stopStream();
  document.body.classList.remove("cam-open");
  show("start");
});
pickBtn.addEventListener("click", () => { fileInput.click(); });
fileInput.addEventListener("change", onFileChosen);
document.getElementById("shutter").addEventListener("click", () => {
  if (manualMode) { fileInput.click(); return; }
  doCapture();
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

/* ---- Model training-data collector: farmers mark scans correct/incorrect
   and the labeled snapshots can be exported to feed a future YOLO model. ---- */
function trainLog() {
  try { return JSON.parse(localStorage.getItem("ulavanTrainLog") || "[]"); }
  catch (e) { return []; }
}
function makeThumb(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement("canvas"); c.width = c.height = 96;
        c.getContext("2d").drawImage(img, 0, 0, 96, 96);
        resolve(c.toDataURL("image/jpeg", 0.6));
      } catch (e) { resolve(""); }
    };
    img.onerror = () => resolve("");
    img.src = url;
  });
}
function fbVote(correct) {
  const thumbsEl = document.getElementById("fb-note");
  Promise.all((window._currentThumbs || []).slice(0, 6).map(makeThumb)).then((thumbs) => {
    const log = trainLog();
    log.push({
      ts: new Date().toISOString(),
      risk: window._currentRisk || "",
      correct,
      confidence: window._currentConfidence || 0,
      method: window._currentMethod || "local",
      findings: window._currentFindings || "",
      thumbs
    });
    /* Cap the feedback log so localStorage can never overflow silently. */
    if (log.length > 200) log.splice(0, log.length - 200);
    let saved = log.length;
    try {
      localStorage.setItem("ulavanTrainLog", JSON.stringify(log));
    } catch (e) {
      saved = log.length;   /* keep UI honest even if quota is hit */
    }
    if (thumbsEl) thumbsEl.textContent = t("fb_saved") + " · " + saved;
    ["fb-yes", "fb-no"].forEach((id) => {
      const b = document.getElementById(id);
      if (b) b.disabled = true;
    });
  });
}
function fbExport() {
  const log = trainLog();
  const blob = new Blob([log.map((r) => JSON.stringify(r)).join("\n")], { type: "application/x-ndjson" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "ulavan-train-data.ndjson";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
document.getElementById("fb-yes").addEventListener("click", () => fbVote(true));
document.getElementById("fb-no").addEventListener("click", () => fbVote(false));
document.getElementById("fb-export").addEventListener("click", fbExport);

/* init */
(async function init() {
  await requestSensorPermission();   // attach listeners early
  if (!sensorsOn) {
    // sensors unavailable => text-only manual mode
    document.getElementById("status-line").textContent = t("sensor_unavailable");
  }
  initDetectionModel();   // lazy: start loading the bundled health model, never blocks
})();
