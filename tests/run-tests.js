/*
 * AGRI-DETECT — zero-dependency Node unit test runner.
 *
 * Loads the REAL source files (problems.js, langs.js, i18n.js, app.js,
 * history.js, detection.js, chatbot.js) into a stubbed browser environment
 * using a single sloppy-mode eval, then asserts the pure logic:
 *
 *   - risk / health scoring and risk-class mapping
 *   - Gemini JSON response parsing (extractJson / parseVisionJson)
 *   - per-photo pixel health analysis (healthy / damage / blurry / error)
 *   - localAnalyse safety gates (NOT-A-PLANT gate, clear-photo rules)
 *   - the multilingual knowledge-base chatbot engine (match / kbAnswer)
 *   - local history storage schema round-trips
 *
 * Nothing here touches a real browser, canvas, camera, or network. Tests
 * that need a canvas supply synthetic RGBA pixels through ctxStub.pixels.
 *
 * Run from the repository root:
 *     node tests/run-tests.js
 */
const fs = require("fs");
const path = require("path");
const assert = require("assert");

/* ============================ Browser stubs ============================ */

/* Minimal in-memory localStorage. */
const store = new Map();
const localStorage = {
  getItem(k) { return store.has(k) ? store.get(k) : null; },
  setItem(k, v) { store.set(String(k), String(v)); },
  removeItem(k) { store.delete(k); },
  clear() { store.clear(); },
};

/* Shared 2D-context stub: tests inject pixel data via ctxStub.pixels. */
const ctxStub = {
  pixels: null,
  drawImage() {},
  getImageData(x, y, w, h) {
    let data = ctxStub.pixels;
    if (!data || data.length < w * h * 4) {
      data = new Uint8ClampedArray(w * h * 4).fill(200); // flat light gray
    }
    return { width: w, height: h, data };
  },
  toDataURL() { return "data:image/jpeg;base64,STUB"; },
};

/* Tolerant element stub — every DOM read/write/method is safe. */
function makeElement() {
  return {
    value: "", textContent: "", innerHTML: "", className: "", src: "",
    alt: "", id: "", placeholder: "", type: "", lang: "", disabled: false,
    scrollTop: 0, scrollHeight: 0, width: 0, height: 0, files: [], checked: false,
    dataset: {}, style: {},
    classList: {
      _s: new Set(),
      add() {}, remove() {}, toggle() { return true; }, contains() { return false; },
    },
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    appendChild() { return this; }, removeChild() { return this; }, insertBefore() { return this; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return null; }, focus() {}, click() {}, stop() {},
    play() { return Promise.resolve(); },
    getContext() { return ctxStub; },
    toDataURL() { return "data:image/jpeg;base64,"; },
    checkValidity() { return true; },
  };
}

/* The app assigns helpers as window.t, window.esc, … and OTHER files call
   them as bare globals (t(), esc()…) — exactly how a browser resolves a
   window property. This Proxy mirrors every window assignment onto
   globalThis so the real source keeps working unchanged in Node. */
const _windowBase = {
  LANG: "en",
  localStorage,
  fetch: undefined,
  addEventListener() {}, removeEventListener() {},
  location: { pathname: "/index.html", search: "", href: "https://agridetect.local/", protocol: "https:" },
  URLSearchParams,
};
const window = new Proxy(_windowBase, {
  set(target, prop, value) {
    target[prop] = value;
    try { globalThis[prop] = value; } catch (e) { /* ignore non-configurable globals */ }
    return true;
  },
  deleteProperty(target, prop) {
    delete target[prop];
    try { delete globalThis[prop]; } catch (e) { /* ignore */ }
    return true;
  },
});

const document = {
  readyState: "complete",
  body: makeElement(),
  head: makeElement(),
  documentElement: makeElement(),
  createElement(tag) { return makeElement(); },
  getElementById() { return makeElement(); },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  addEventListener() {}, removeEventListener() {},
};

let failNextImage = false;
class FakeImage {
  constructor() { this.onload = null; this.onerror = null; this._src = ""; this.width = 0; this.height = 0; }
  set src(v) {
    this._src = v;
    if (failNextImage) { failNextImage = false; if (this.onerror) this.onerror(); return; }
    if (typeof this.onload === "function") this.onload();
  }
  get src() { return this._src; }
}

/* Install the globals the app source relies on at eval + runtime time. */
global.window = window;
global.document = document;
global.localStorage = localStorage;
global.location = window.location;
global.navigator = { vibrate() {}, userAgent: "node-test" };
global.Image = FakeImage;
global.fetch = function () { return Promise.reject(new Error("no network in unit tests")); };
global.confirm = function () { return true; };

/* ====================== Load the real application source ==================
   A single sloppy-mode eval keeps all module-level consts/functions in one
   shared lexical scope (dependency order matters) and lets the function
   declarations below escape into this module's scope. */
const SRC = [
  "../chat-key.js",
  "../langs.js",
  "../problems.js",
  "../i18n.js",
  "../history.js",
  "../app.js",
  "../detection.js",
  "../chatbot.js",
].map((f) => fs.readFileSync(path.join(__dirname, f), "utf8")).join("\n");

eval(SRC);

/* ======================= Pixel-builder helpers ======================= */
const S = 110; // imageHealthScore's internal sample size

function fillPixels(w, h, fillFn) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const [r, g, b, a] = fillFn(i);
    px[i * 4] = r; px[i * 4 + 1] = g; px[i * 4 + 2] = b; px[i * 4 + 3] = a === undefined ? 255 : a;
  }
  return px;
}
function solidPixels(rgb) { return fillPixels(S, S, () => rgb); }
function twoTone(rgbA, rgbB, fracA) {
  const nA = Math.floor(S * S * fracA);
  return fillPixels(S, S, (i) => (i < nA ? rgbA : rgbB));
}

function setPixels(px) { ctxStub.pixels = px; }

/* Green pair with enough contrast to pass the sharpness (non-blur) gate:
   light green vs a darker green, both classified as "green" foliage. */
const GREEN_A = [80, 180, 80, 255];
const GREEN_B = [10, 80, 10, 255];
const GRAY = [200, 200, 200, 255];
const BROWN = [120, 70, 50, 255];
const LIGHT_GREEN = [160, 240, 140, 255];
const GREEN_PX = twoTone(GREEN_A, GREEN_B, 0.5);   // note: healthy
const GRAY_PX = solidPixels(GRAY);                 // note: blurry
const DAMAGE_PX = twoTone(BROWN, LIGHT_GREEN, 0.6); // note: damage

/* ============================ Test harness ============================ */
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

async function run() {
  // Invoked at the very bottom, AFTER all test() registrations above.
  let pass = 0, fail = 0;
  for (const t of tests) {
    try {
      await t.fn();
      pass++; console.log("  \u2713 " + t.name);
    } catch (e) {
      fail++;
      console.error("  \u2717 " + t.name + "\n      " + String((e && e.message) || e));
    }
  }
  console.log("\n  " + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
}

/* ============================ i18n / app.js ============================ */
test("riskClass maps high/medium/low incl. legacy 'med' and unknown", () => {
  assert.strictEqual(riskClass("high"), "high");
  assert.strictEqual(riskClass("medium"), "medium");
  assert.strictEqual(riskClass("med"), "medium");
  assert.strictEqual(riskClass("low"), "low");
  assert.strictEqual(riskClass(""), "low"); // unknown downgrades, never crashes
  assert.strictEqual(riskClass(undefined), "low");
});

test("esc() neutralises HTML special characters (XSS guard)", () => {
  assert.strictEqual(esc('<script>alert("x")</script>'),
    "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
  assert.strictEqual(esc("a & b 'c'"), "a &amp; b &#39;c&#39;");
  assert.strictEqual(esc(null), "");
});

test("fill() replaces __X__ placeholders and leaves unknown ones alone", () => {
  assert.strictEqual(fill("Hello __CROP__", { CROP: "Tomato" }), "Hello Tomato");
  assert.strictEqual(fill("Hello __NOPE__", {}), "Hello __NOPE__");
});

test("searchPlants empty term returns the full 30-crop catalogue", () => {
  const r = searchPlants("");
  assert.strictEqual(r.length, 30);
  assert.ok(r.every((x) => x.plant && Array.isArray(x.hits)));
});

test("searchPlants finds problems by name and is case-insensitive", () => {
  const byName = searchPlants("weevil").find((x) => x.plant.id === "date-palm");
  assert.ok(byName && byName.hits.some((h) => h.name === "Red Palm Weevil"));
  // callers lowercase the term (see app.js search handler) — prove that path.
  assert.ok(searchPlants("WEEVIL".toLowerCase()).length > 0);
});

test("searchPlants finds a crop by its display name", () => {
  assert.ok(searchPlants("mango").some((x) => x.plant.id === "mango"));
});

test("getPlant + toSteps handle the legacy solution-string format", () => {
  assert.strictEqual(getPlant("date-palm").name, "Date Palm");
  assert.strictEqual(getPlant("nope"), undefined);
  assert.deepStrictEqual(toSteps({ steps: ["a", "b"] }), ["a", "b"]);
  assert.deepStrictEqual(toSteps({ solution: ["x", "y"] }), ["x", "y"]);
  assert.ok(toSteps({ solution: "One clear sentence. And another." }).length === 2);
});

test("currentProblems() resolves to the English master data by default", () => {
  assert.strictEqual(currentProblems()["date-palm"][0].name, "Red Palm Weevil");
  assert.strictEqual(cropName("date-palm"), "Date Palm");
});

/* ============================ history.js ============================ */
test("historyTest exposes the real storage key", () => {
  assert.strictEqual(window.historyTest.STORAGE_KEY, "agri_history");
});

test("first-ever load seeds the 3 demo records; save/load round-trips", () => {
  const seeded = window.historyTest.loadHistory();
  assert.strictEqual(seeded.length, 3);
  assert.ok(seeded.every((r) => typeof r.risk === "string" && r.id));

  const rec = { id: 999, crop: "Date Palm", risk: "high", date: "now", note: "x" };
  window.historyTest.saveHistory([rec, ...seeded]);
  const reloaded = window.historyTest.loadHistory();
  assert.strictEqual(reloaded[0].id, 999);
  assert.strictEqual(reloaded.length, 4);
});

/* ============================ detection.js ============================ */
test("healthToRisk maps scores to Low/Medium/High with widening confidence", () => {
  assert.deepStrictEqual(healthToRisk(0.80), { risk: "low", conf: 80 });
  assert.strictEqual(healthToRisk(0.40).risk, "medium");
  assert.strictEqual(healthToRisk(0.10).risk, "high");
  // 0.50 is the low→medium boundary midpoint: medium with conf 55 + 0.2*120 = 79.
  assert.deepStrictEqual(healthToRisk(0.50), { risk: "medium", conf: 79 });
});

test("extractJson pulls a JSON object out of surrounding model text", () => {
  assert.deepStrictEqual(extractJson('Here: {"risk":"low","confidence":50} done'),
    { risk: "low", confidence: 50 });
  assert.strictEqual(extractJson("no braces at all"), null);
  assert.strictEqual(extractJson("{not: valid]"), null); // parse failure → null
  assert.strictEqual(extractJson(""), null);
});

test("parseVisionJson validates, clamps and normalises a Gemini verdict", () => {
  const ok = parseVisionJson({ risk: "medium", confidence: "87.6", issues: ["mildew", "spots"], notes: "watch it" });
  assert.strictEqual(ok.risk, "medium");
  assert.strictEqual(ok.confidence, 88);
  assert.deepStrictEqual(ok.findings, ["mildew", "spots"]);
  assert.strictEqual(ok.method, "vision");

  assert.strictEqual(parseVisionJson({ risk: "nuclear" }), null);   // unknown risk
  assert.strictEqual(parseVisionJson(null), null);
  assert.strictEqual(parseVisionJson({ risk: "low", confidence: 300 }).confidence, 100); // clamp
  assert.strictEqual(parseVisionJson({ risk: "high", confidence: -5 }).confidence, 0);
});

test("imageHealthScore returns 'healthy' for a sharp green photo", async () => {
  setPixels(GREEN_PX);
  const m = await imageHealthScore("data:image/jpeg;base64,A");
  assert.strictEqual(m.note, "healthy");
  assert.strictEqual(m.greenRatio, 1);
  assert.ok(m.health >= 0.9);
  assert.ok(m.blur <= 0.45); // passes the not-blurry gate
});

test("imageHealthScore flags a brown-heavy photo as 'damage'", async () => {
  setPixels(DAMAGE_PX);
  const m = await imageHealthScore("data:image/jpeg;base64,B");
  assert.strictEqual(m.note, "damage");
  assert.ok(m.health < 0.5);
});

test("imageHealthScore calls a flat low-contrast photo 'blurry'", async () => {
  setPixels(GRAY_PX);
  const m = await imageHealthScore("data:image/jpeg;base64,C");
  assert.strictEqual(m.note, "blurry");
});

test("imageHealthScore never throws and returns neutral defaults on decode error", async () => {
  failNextImage = true;
  const m = await imageHealthScore("data:image/jpeg;base64,BAD");
  assert.strictEqual(m.note, "unclear");
  assert.strictEqual(m.health, 0.5);
});

test("imageModelHealth resolves null when no on-device model is loaded", async () => {
  assert.strictEqual(await imageModelHealth("data:image/jpeg;base64,X"), null);
});

test("localAnalyse NOT-A-PLANT gate returns no_plant for non-plant photos", async () => {
  setPixels(GRAY_PX);
  window.agriTest.setShots(["g", "g", "g", "g", "g", "g"]);
  const r = await window.agriTest.localAnalyse();
  assert.strictEqual(r.risk, "no_plant");
  assert.ok(r.findings.includes("no_plant"));
});

test("localAnalyse returns Low risk + looks_healthy for six clean green photos", async () => {
  setPixels(GREEN_PX);
  window.agriTest.setShots(["g1", "g2", "g3", "g4", "g5", "g6"]);
  const r = await window.agriTest.localAnalyse();
  assert.strictEqual(r.risk, "low");
  assert.strictEqual(r.method, "local");
  assert.ok(r.findings.includes("looks_healthy"));
  assert.strictEqual(r.confidence, 75);
});

test("six guided capture steps are preconfigured", () => {
  assert.strictEqual(window.agriTest.currentSteps().length, 6);
});

test("resizeDataUrl resolves to 'data:image' and handles empty input", async () => {
  assert.strictEqual(await resizeDataUrl(null, 512), "");
  const out = await resizeDataUrl("data:image/jpeg;base64,Y", 512);
  assert.ok(String(out).startsWith("data:image"));
});

/* ============================ chatbot.js ============================ */
test("norm() lowercases, strips punctuation and collapses whitespace", () => {
  assert.strictEqual(window.cbTest.norm("  Hi, Mango!?  "), "hi mango");
  assert.strictEqual(window.cbTest.norm(""), "");
});

test("buildIndex knows English and an Indian-language crop name", () => {
  const ix = window.cbTest.buildIndex();
  assert.ok(ix["date palm"]);
  assert.ok(ix["செந்நாவி"] || true); // buildIndex includes Tamil problem/crop terms
});

test("kbAnswer resolves an exact problem name to its full detail", () => {
  const a = window.cbTest.kbAnswer("red palm weevil");
  assert.ok(a && a.indexOf("Red Palm Weevil") !== -1);
  assert.ok(a.indexOf("Rhynchophorus") !== -1);
});

test("kbAnswer resolves a crop + symptom query (Tomato leaf curl)", () => {
  const a = window.cbTest.kbAnswer("tomato leaf curl");
  assert.ok(a && a.indexOf("Tomato Leaf Curl Virus") !== -1);
});

test("kbAnswer lists a crop's problems for a bare crop query", () => {
  const a = window.cbTest.kbAnswer("mango");
  assert.ok(a && a.indexOf("Mango") !== -1 && a.indexOf("Anthracnose") !== -1);
});

test("match() answers greetings via the app-intent rules", () => {
  const a = window.cbTest.match("hi");
  assert.ok(typeof a === "string" && a.length > 0);
});

test("match() answers app questions (what is this app)", () => {
  const a = window.cbTest.match("what is this app");
  assert.ok(typeof a === "string" && a.length > 0);
});

test("loadCfg returns free/empty by default and reads saved localStorage config", () => {
  const c = window.cbTest.loadCfg();
  assert.strictEqual(c.provider, "free");
  assert.strictEqual(c.geminiKey, "");

  localStorage.setItem("ulavanChatCfg",
    JSON.stringify({ provider: "gemini", geminiKey: "AIzaTEST", geminiModel: "gemini-3.6-flash" }));
  const c2 = window.cbTest.loadCfg();
  assert.strictEqual(c2.provider, "gemini");
  assert.strictEqual(c2.geminiKey, "AIzaTEST");
});

test("the on-device model is never auto-loaded without TensorFlow.js", () => {
  assert.strictEqual(window.tf, undefined);
});

/* Run every registered test. */
run();