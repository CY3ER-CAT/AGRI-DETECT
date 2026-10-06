# AGRI-DETECT — Unit Tests

Zero-dependency unit test suite for the real application source. It loads the
actual `problems.js / langs.js / i18n.js / app.js / history.js / detection.js /
chatbot.js` files into a stubbed browser environment and asserts the **pure
logic** — risk scoring, JSON parsing, the healthy-vs-damage pixel analysis, the
safety gates, the multilingual chatbot engine, and the history storage schema.

## Run it

Requires **Node.js ≥ 18** (uses the built-in `assert` module — nothing to
install).

```bash
node tests/run-tests.js
```

Exit code is `0` when every test passes, `1` on any failure.

## What is covered (31 assertions)

| Area | What is verified |
|---|---|
| **i18n / DOM safety** | `riskClass()` mappings (incl. legacy `med`, unknown → `low`); `esc()` HTML-escaping (XSS guard); `fill()` placeholder replacement |
| **Catalogue search** | full 30-crop list on empty term; problem-name + case-insensitive hits; display-name match |
| **Parse layer** | `extractJson()` object extraction + graceful `null` on garbage; `parseVisionJson()` risk whitelist, confidence clamping, issues slicing |
| **Pixel health analysis** | green photo → `healthy`; brown-heavy photo → `damage`; low-contrast → `blurry`; decode error → neutral defaults, never a throw |
| **Safety gates** | NOT-A-PLANT gate returns `no_plant`; six clean green photos → `low` / `looks_healthy` |
| **Health → risk** | score-to-risk boundaries and confidence widening |
| **Chatbot (KB engine)** | exact problem lookup; crop+symptom query; bare-crop list; greeting/app intents; config loading; normalization |
| **History storage** | demo-seed on first load; save→load round-trip |
| **Model pipeline** | `imageModelHealth()` returns `null` without a loaded model; model never auto-loads without TensorFlow.js |

## How it works

- `tests/run-tests.js` sets up **browser stubs** (`window`, `document`,
  `localStorage`, `navigator`, `Image`, a canvas 2D-context whose pixel buffer
  tests inject, …).
- All app source files are concatenated and evaluated in **one sloppy-mode
  scope**, so cross-file references keep working exactly as they do in a page.
- Pure units are reached through the same, behavior-neutral **test hooks** that
  the app now ships:
  - `window.agriTest` (detection.js) — `localAnalyse`, `imageHealthScore`,
    `healthToRisk`, `extractJson`, `parseVisionJson`, `setShots`
  - `window.cbTest` (chatbot.js) — `match`, `kbAnswer`, `norm`, `buildIndex`,
    `tokenPick`, `isBareCrop`, `loadCfg`
  - `window.historyTest` (history.js) — `loadHistory`, `saveHistory`,
    `STORAGE_KEY`

These hooks are test-only surface; none of them change runtime behavior.

## Testing pyramid (how unit tests fit the whole app)

1. **Unit tests (this folder)** — deterministic, headless, ~instant: pure code
   and safety-gate decisions.
2. **Browser smoke checks** — after any change, load the app and run the
   detection flow with the 📷 + photo-picker fallback on a phone over HTTPS
   (see `VALIDATION.md`).
3. **Model evaluation** — 30,295-photo held-out test set reported in the README
   measures real generalization of the on-device classifier.
4. **Field validation** — qualitative sessions with farmers (see `VALIDATION.md`).
   Manual checks are labelled `captNN` in the dev log.

Before submitting a review, run `node tests/run-tests.js` and confirm
**31 passed, 0 failed**.