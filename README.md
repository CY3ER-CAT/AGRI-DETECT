# 🌿 AgriDetect (Ulavan Tech)

**AI-powered crop health & plant-care assistant built for Tamil Nadu farmers.** Multi-language, works fully offline for knowledge, chat, and on-device photo detection. No server, no backend, no API key required.

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

## 🔬 What we built & added (dev log)

Everything here is already merged and live. Details on the biggest pieces:

### 1. Real on-device AI model (trained, not heuristics)

| | |
|---|---|
| **Backbone** | MobileNetV2 (ImageNet-pretrained), frozen first, then fine-tuned |
| **Training data** | PlantVillage dataset (`Hemg/new-plant-diseases-dataset`) — 16,000 balanced images (8,000 healthy / 8,000 diseased) across 38 crop-disease classes |
| **Input** | 96×96 RGB, normalized to [-1, 1] (baked into the graph, no server-side preprocess) |
| **Output** | single sigmoid → P(healthy) |
| **Accuracy** | Phase 1 (frozen backbone, 8 epochs): 98.7% val · Phase 2 (top-block fine-tune, 2 epochs): **99.71% val** |
| **Size** | ~4.4 MB after 2-byte quantization |
| **Format** | Keras SavedModel → `tensorflowjs_converter` → TF.js graph model |
| **Verified** | 8/8 labeled crop photos in a real headless browser — healthy leaves 0.97–1.00, diseased 0.0000–0.0001 |

The model scores each of the 6 captured photos locally (`imageModelHealth`), then `localAnalyse` blends the model's score (65%) with pixel-level health logic (35%), and the result chip says **"On-device AI model"** when the model was used. If the model is unavailable, the app silently falls back to pixel heuristics — no broken feature.

### 2. Guided 6-photo capture flow

Per-step instructions (front → left → back → right → crown → damage close-up) with a live preview, so even a first-time farmer captures usable photos. After capture you review the 6 thumbnails before the analysis runs.

### 3. Per-user API keys (no key shipped)

`chat-key.js` ships **empty** (`GEMINI_KEY = ""`). A key is only ever present if *you* add yours in **Settings** — saved to your device's localStorage, survives refresh, and is never committed to the repo. No-key users automatically get the offline answer engine + on-device detection.

### 4. Settings page (Save button)

Keys and provider are edited on `settings.html`. Get a free Gemini key link, paste, press **Save** — persists per-device and survives refresh (verified).

### 5. Chatbot fixes

- Fixed the repeated greeting loop on cold start
- Answer flow: offline knowledge base → app intents → live model (only with your key)
- When the AI quota is exhausted, the app says so honestly and stays on the offline engine instead of pretending

### 6. Offline-first (PWA)

Service worker (`agridetect-v38`) caches every page, all localized data, the vendored TF.js, and the model weights. After the first full load the app + AI work with no connection. `VERSION` is bumped on every change so phones pull updates.

---

## 🧠 AI model (on-device)

Detection runs a **MobileNetV2** classifier trained on plant-health imagery, converted to **TensorFlow.js** and quantized to ~4.4 MB. It loads fully offline after the first visit — no server request, no latency, works on a farm with no signal.

- Model files: `models/plant-health/` (`model.json` + weight shards)
- TF.js library is vendored locally at `vendor/tf.min.js` (4.22.0) — no CDN dependency
- The result chip shows **"On-device AI model"** when the model scored the photos, and blends model confidence (65%) with pixel-level health heuristics (35%) for robustness

## 🔑 API keys (optional — each user adds their own)

No key is needed to use the knowledge base, chatbot, or on-device detection. The app ships with **empty keys**.

For the optional live AI fallback (chat on topics outside the offline engine, or AI vision review), any user can add **their own free key** in *Settings* → complete each keystroke is saved **on their device** (localStorage) and survives refresh:

- **Gemini (free)** — https://aistudio.google.com/apikey → `AIza…`

Keys are never stored in the repo, never sent to any server other than the provider you chose, and are stored only locally on each device.

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

- **Android (Chrome):** menu → *Add to Home screen* — refresh twice on first install to pull the full cache (app + AI model).
- **iOS (Safari):** Share → *Add to Home Screen*.
- After the first full load, everything — pages, images, chatbot data, and the AI model — is cached by the service worker and works with no connection.

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
├── settings.html       AI Settings: per-user keys & provider
├── problems.js         English crop-problem data
├── problems-*.js       Localized data (ta, hi, te, kn, ml, bn, mr)
├── chatbot.js          Multilingual answer engine + chat UI
├── langs.js            UI & chat strings, all 8 languages
├── i18n.js             Language switching + helpers
├── detection.js        Capture + on-device model wiring + vision fallback
├── chat-key.js         Default-key placeholders (shipped empty)
├── models/plant-health/  TF.js plant-health model (bundled)
├── vendor/tf.min.js    TensorFlow.js (vendored, no CDN)
├── service-worker.js   Offline cache (bump VERSION on every change)
└── images/             Crop & field photos
```

## ⚖️ Detected problems (sample)

Red Palm Weevil, Rhizome Rot, Fruit Fly, Downy Mildew, Bacterial Wilt, Leaf Blotch, Root-Knot Nematode, Ginger Mosaic Virus, Bayoud Disease, Lethal Yellowing, and many more — each fully documented in all 8 languages.

---

Made for the Ulavan Tech plantation project. 🌴