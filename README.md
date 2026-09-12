# 🌿 AgriDetect (Ulavan Tech)

**AI-powered crop health & plant-care assistant built for Tamil Nadu farmers.** Multi-language, works fully offline for knowledge, chat, and on-device photo detection. No server, no backend, no API key required to use the core features.

---

## ✨ Features

- **8 Indian languages** — Tamil, Hindi, Telugu, Kannada, Malayalam, Bengali, Marathi, English (full UI, data, search, and voice replies).
- **30 crops** — vegetables, fruits, palms, legumes, spices, and oilseeds, each with field photos.
- **317 problems** — diseases, pests, and nutritional disorders, each with:
  - Symptoms / signs
  - Causes
  - Step-by-step solution & treatment
  - Risk level (Low / Medium / High)
- **6-photo 360° crown detection** — guided capture (4 angles + 2 close-ups) feeding an **on-device neural network** that runs inside the browser, outputting a combined risk result with a 48-hour early-warning objective.
- **Multilingual chatbot** — offline answer engine over all 317 problems in every language, plus app-intent answers (risk levels, capture flow, history, model info), voice (TTS) replies, and an optional free live model fallback (your own key).
- **Save & history** — detection results are stored locally per browser.

---

## 🧠 On-device AI detection model (deep dive)

Detection does **not** send photos anywhere. A trained neural network runs **inside the browser** (TensorFlow.js) after the first load and works with zero signal — a key requirement for village farms.

### Model architecture

| | |
|---|---|
| **Backbone** | MobileNetV2 (ImageNet-pretrained) |
| **Task** | Binary healthy-vs-diseased leaf classification |
| **Input** | RGB image, **96×96**, normalized to **[-1, 1]** |
| **Output** | Single sigmoid → **P(healthy)** in 0..1 |
| **Framework** | Keras 3 (TensorFlow 2.19) → TensorFlow.js graph model |
| **Weights** | 4.4 MB after **2-byte quantization** |
| **Model ID** | `models/plant-health/model.json` + 2 weight shards |

The normalization is **baked into the app** (`/127.5 - 1` in `imageModelHealth`), so the graph stays small and no server or preprocessing layer is needed.

### Training data

| | |
|---|---|
| **Source** | PlantVillage images — `Hemg/new-plant-diseases-dataset` (Hugging Face) |
| **Shards** | 3 parquet shards → 70,295 labeled leaf images |
| **Classes** | 38 PlantVillage crop-disease classes (apple, potato, grape, corn, tomato, …) |
| **Final split** | **16,000 balanced images** (8,000 healthy + 8,000 diseased) |
| **Augmentation** | Train-time augmentation (flips, shifts, brightness) inside the pipeline |

### Training procedure (two-phase transfer learning)

| Phase | What is trained | Optimizer / lr | Epochs | Validation accuracy |
|---|---|---|---|---|
| **1. Head only** | New classification head on **frozen** MobileNetV2 features | Adam, `3e-3` | 8 | **98.7%** |
| **2. Fine-tune** | Top MobileNetV2 blocks (`block_13`–`block_16`) + head | Adam, `1e-4` | 2 | **99.71%** |

- **Freeze first, fine-tune second** — the standard recipe for small custom datasets, it prevents destroying the ImageNet features while still adapting the top layers to leaf textures.
- **Best validation accuracy: 99.71%** on the balanced hold-out set.
- Barrier: on-device latency + 4 MB budget forced us to 96×96 + quantization. The two-phase schedule recovered the accuracy lost by downscaling.

### Model → TF.js conversion pipeline

The full conversion chain that produced the bundled model:

```
train_fast.py (Keras 3, two-phase) 
   → plant-health.h5
   → model.export('plant-health-saved')    # SavedModel, signature "serving_default"
   → tensorflowjs_converter \
       --input_format tf_saved_model \
       --output_format tfjs_graph_model \
       --signature_name serving_default \
       --quantization_bytes=2 \
   → models/plant-health/  (model.json + group1-shard*.bin)
```

Notable fixes that made this work (kept for anyone reproducing it):
- **Keras 3 → TF.js**: exporting a SavedModel via `model.export()` then converting is required; a direct Keras-h5 → TF.js conversion fails on `InputLayer` config deserialization (`batch_shape` / `optional`).
- **No `preprocess_input` layer** inside the graph — it broke h5 reload with `Unknown layer: 'TrueDivide'`. Normalization is instead done in plain JS before inference.
- **Protobuf pinning**: `protobuf==5.29.6` (the TF.js converter and TF disagreed on the protobuf version).
- **`pkg_resources`**: `setuptools<81` was needed for `tensorflow_hub` during conversion imports.

### Inference flow in the browser

1. `initDetectionModel()` lazily loads `models/plant-health/model.json` with `tf.loadGraphModel(...)` after page load. **All failures are silent** — detection always still works via the pixel fallback.
2. Each captured photo goes through `imageModelHealth(dataUrl)`:
   - draw to a 96×96 offscreen canvas
   - read RGBA pixels → `Float32Array` → RGB only, mapped to **[-1, 1]** (`/127.5 - 1`)
   - `tf.tensor4d(...)` → `model.predict(...)` → `dataSync()[0]` → **P(healthy)**
   - tensors are disposed immediately (no memory leak on 6+ inference passes)
3. `localAnalyse()` blends the verdict:
   - Needs **≥ 3 model scores** (or all photos if fewer than 3 shots) to claim it used the model — a few missed inferences don't kill the result.
   - Per-photo health = `model × 0.65 + pixel-analysis × 0.35`.
   - Photo note flips to `"healthy"` when model ≥ 0.60, `"damage"` when ≤ 0.40.
   - Result chip shows **"On-device AI model"** only when the model actually steered the answer.

### Safety gates that sit on top of the model

A purely model-driven answer is intentionally not used alone. `localAnalyse()` layers three guards on top:

1. **NOT-A-PLANT GATE** — runs on *every* set, blurry or not. Average green coverage below a low threshold (≈3%) means the "photos" are a face, wall, or sky → outcome `no_plant`, never a bogus "high risk". The threshold is kept very low so a distant palm is never mistaken for a wall.
2. **Blur gate** — photos flagged blurry/unclear don't count toward the final risk; if fewer than 3 clear photos exist, the app refuses to issue an "act now" warning and stays `low`/`medium`.
3. **Two-photo damage rule** — a `high`/damage verdict needs at least 2 clear photos showing damage, so one glinty frame can't scare a farmer.

### Verified model results (real browser, headless)

| Photo | Model P(healthy) | Expected |
|---|---|---|
| Potato — healthy | **0.9684** | healthy |
| Potato — late blight | **0.0001** | diseased |
| Grape — healthy | **0.9996** | healthy |
| Grape — black rot | **0.0000** | diseased |
| Corn — healthy | **1.0000** | healthy |
| Tomato — early blight | **0.0000** | diseased |
| Apple — healthy | **1.0000** | healthy |
| Apple — scab/diseased | **0.0000** | diseased |

**8/8 correct** with clean separation between healthy (0.97–1.00) and diseased (0.0000–0.0001). The end-to-end app run (6 captures → review → result) also produced the correct verdict with the **"On-device AI model"** chip.

### Honest limitations

- The model was trained on **close-up, single-leaf** PlantVillage photos. On field shots taken from a distance (whole canopy in frame), the model score still contributes, but the pixel analysis has a stronger say — by design.
- It answers **healthy vs diseased**, not "which disease". Disease identification is handled by the knowledge base + optional Gemini vision.
- Dark, motion-blurred, or low-contrast photos are handled by the blur gate rather than trusted.

### Reproducing the training

```bash
python3 -m venv .agritrain/venv
source .agritrain/venv/bin/activate
pip install "tensorflow-cpu==2.19.0" "tensorflowjs==4.22.0" "protobuf==5.29.6" "setuptools<81"

# download Hemg/new-plant-diseases-dataset parquet shards into .agritrain/
# then run two-phase training (defaults: PER_CLASS=4000, EPOCHS=6)
PER_CLASS=8000 EPOCHS=8 python3 .agritrain/train_fast.py

# convert (see pipeline above)
model.export('plant-health-saved')
tensorflowjs_converter --input_format tf_saved_model --output_format tfjs_graph_model \
  --signature_name serving_default --quantization_bytes=2 plant-health-saved models/plant-health
```

---

## 🔑 API keys (optional — each user adds their own)

No key is needed to use the knowledge base, chatbot, or on-device detection. The app ships with **empty keys** — only the user's own device can hold *their* key.

To enable the optional live AI fallback (Gemini vision on the photos, plus richer chat):

1. Open **AI Settings**.
2. Click **"Get a free Gemini key →"** (opens Google AI Studio — free tier).
3. Paste the `AIza…` key → the provider **auto-switches to Gemini**.
4. Press **Save** (or just type — every change saves automatically).
5. The key is stored **only on your device** (localStorage), survives refresh, and is **never sent anywhere except Google Gemini**.

The Gemini model field is **fixed and read-only** (`gemini-3.6-flash`) so the app always talks to the tested model. The key field has a **👁 show/hide toggle**.

---

## 📸 How detection works end-to-end

1. **Guided 6-photo capture** — the app shows per-photo instructions: **front → left → back → right → crown (top) → damage close-up**, with live preview between shots.
2. **Review** — all 6 thumbnails are shown; the farmer confirms before analysis.
3. **On-device analysis** — the bundled model scores each photo locally; pixel health, blur, and not-a-plant gates refine the result.
4. **Result** — a combined risk (Low / Medium / High) + confidence + findings with a 48-hour early-warning message, method chip ("On-device AI model" · "Local analysis"), and a save button for history.
5. **Optional Gemini vision** — if the user added a key, the 6 photos are also sent to Gemini for a richer disease read; if the quota is exhausted, the app says so honestly and shows the on-device result instead.

---

## 🚀 Getting started

No build step, no install.

```bash
# serve the folder over HTTP
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## 📱 Install offline (PWA)

Open the site, then:

- **Android (Chrome):** menu → *Add to Home screen* — **refresh twice** on first install to pull the full cache (app + AI model).
- **iOS (Safari):** Share → *Add to Home Screen*.
- After the first full load, everything — pages, images, chatbot data, and the AI model — is cached by the service worker and works with **no connection**.

## 🌐 Switch language

Language is selected in the header (Tāmiḻ, हिन्दी, తెలుగు, ಕನ್ನಡ, മലയാളം, বাংলা, मराठी, English) — the whole app, all data, and the chatbot reply in the chosen language.

## 🧪 How the chatbot picks answers

1. **Offline knowledge base** — crop problems, treatments, risk levels (instant, no internet).
2. **App intents** — capture flow, history, model info, greetings.
3. **Live model** — only for questions the offline engine can't answer, and only if the user added their own Gemini key; otherwise it honestly says it can't reach the AI.

## 📁 Project structure

```
├── index.html          Home: browse crops & problems
├── detection.html      6-photo 360° detection flow
├── history.html        Saved detection results
├── about.html          Project / detection info
├── settings.html       AI Settings: per-user Gemini key (+ show/hide), Save
├── problems.js         English crop-problem data
├── problems-*.js       Localized data (ta, hi, te, kn, ml, bn, mr)
├── chatbot.js          Multilingual answer engine + chat UI
├── langs.js            UI & chat strings, all 8 languages
├── i18n.js             Language switching + helpers
├── detection.js        Capture + on-device model inference + vision fallback
├── chat-key.js         Key placeholders (shipped empty)
├── models/plant-health/  TF.js plant-health model (bundled, 4.4 MB)
├── vendor/tf.min.js    TensorFlow.js 4.22.0 (vendored, no CDN)
├── service-worker.js   Offline cache (bump VERSION on every change)
└── images/             Crop & field photos
```

## ⚖️ Detected problems (sample)

Red Palm Weevil, Rhizome Rot, Fruit Fly, Downy Mildew, Bacterial Wilt, Leaf Blotch, Root-Knot Nematode, Ginger Mosaic Virus, Bayoud Disease, Lethal Yellowing, and many more — each fully documented in all 8 languages.

---

## 🔬 Dev log (what we built & added)

### 1. Real on-device AI model — trained, not heuristics
Two-phase MobileNetV2 transfer training on 16k PlantVillage images → **99.71%** validation, quantized to 4.4 MB TF.js, verified 8/8 in a real browser. Details in the model deep-dive above.

### 2. Guided 6-photo capture flow
Per-step instructions (front → left → back → right → crown → damage close-up) with live preview, and a 6-thumbnail review before analysis.

### 3. Per-user API keys (no key shipped)
`chat-key.js` ships empty. Your key lives only in your device's localStorage. No-key users get the offline engine + on-device detection.

### 4. Settings page (Gemini-only)
Provider Free/Gemini, explicit **Save** button, key show/hide toggle, fixed read-only model, auto-switch to Gemini when a key is typed, "Get a free Gemini key" link.

### 5. Chatbot fixes
- Fixed the repeated greeting loop on cold start
- Answer flow: offline knowledge base → app intents → live model (only with your key)
- On AI quota exhaustion, the app says so honestly and stays on the offline engine

### 6. Offline-first PWA
Service worker (currently `agridetect-v42`) caches every page, all localized data, the vendored TF.js, and the model weights. `VERSION` is bumped on every change so phones pull updates.

### 7. Security & performance pass (from a full code review)
- **Stored XSS fixed** — the `name` URL parameter is escaped before any `innerHTML` interpolation (History list + detail modal both escaped). A crafted `detection.html?name=<img onerror=…>` link can no longer run attacker JS or exfiltrate the stored Gemini key.
- **No hidden third-party calls** — the undisclosed `text.pollinations.ai` chat fallback was removed completely. Live AI now uses *only* the user's own Gemini key; without a key the chat gives an honest offline reply.
- **API key moved out of URLs** — Gemini requests now send the key via the `x-goog-api-key` header instead of `?key=…`, so it won't leak through browser history or proxy logs.
- **Content-Security-Policy added** on every page (`script-src 'self'`, `connect-src` limited to Google's Gemini API, no inline scripts). The detection page additionally needs `'unsafe-eval'` for TensorFlow.js's WebGL shader compiler.
- **Fixed**: missing `var` (globally leaked `key`) in `riskLabel`; dead no-op conditional in risk scoring; fragile active-nav fallback at bare `/`; unbounded `ulavanTrainLog` (now capped at 200 + quota-safe).
- **~2 MB lighter first load** — only the active language's problem file is parsed; others lazy-load on language switch. Manual `?v=` cache-busting removed (the SW `VERSION` is the single invalidation point).

---

Made for the Ulavan Tech plantation project. 🌴