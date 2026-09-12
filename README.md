# 🌿 AgriDetect (Ulavan Tech)

**AI-powered crop health & plant-care assistant built for Tamil Nadu farmers.** Multi-language, works fully offline for knowledge and chat, and detects crop problems from field photos.

---

## ✨ Features

- **8 Indian languages** — Tamil, Hindi, Telugu, Kannada, Malayalam, Bengali, Marathi, English (full UI, data, search, and voice replies).
- **30 crops** — vegetables, fruits, palms, legumes, spices, and oilseeds, each with high-quality field photos.
- **317 problems** — diseases, pests, and nutritional disorders, each with:
  - Symptoms / signs
  - Causes
  - Step-by-step solution & treatment
  - Risk level (Low / Medium / High)
- **6-photo 360° crown detection** — guided capture (4 angles + 2 close-ups) feeding an AI health model, outputting a combined risk result with a 48-hour early-warning objective.
- **Multilingual chatbot** — offline answer engine over all 317 problems in every language, plus app-intent answers (risk levels, capture flow, history, model info), voice (TTS) replies, and an optional free live model fallback (keyless endpoint or your OpenRouter key).
- **Save & history** — detection results are stored locally per browser.

---

## 🚀 Getting started

No build step, no install, no API key required to run the knowledge base and chatbot.

```bash
# serve the folder over HTTP
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

> Detection runs against a small Python model endpoint (YOLO-style). The app's knowledge, crop catalogue, and chatbot work fully offline without it.

## 🌐 Switch language

Language is selected in the header (Tāmiḻ, हिन्दी, తెలుగు, ಕನ್ನಡ, മലയാളം, বাংলা, मराठी, English) — the whole app, all data, and the chatbot reply in the chosen language.

## 🧪 How the chatbot picks answers

1. **Offline knowledge base** — crop problems, treatments, risk levels (instant, no internet).
2. **App intents** — capture flow, history, model info, greetings.
3. **Live model** — only for questions the offline engine can't answer (free keyless endpoint; optionally add an OpenRouter key in `chat-key.js`).

## 📁 Project structure

```
├── index.html          Home: browse crops & problems
├── detection.html      6-photo 360° detection flow
├── history.html        Saved detection results
├── about.html          Project / detection info
├── problems.js         English crop-problem data
├── problems-*.js       Localized data (ta, hi, te, kn, ml, bn, mr)
├── chatbot.js          Multilingual answer engine + chat UI
├── langs.js            UI & chat strings, all 8 languages
├── i18n.js             Language switching + helpers
├── detection.js        Capture + model wiring
└── images/             Crop & field photos
```

## ⚖️ Detected problems (sample)

Red Palm Weevil, Rhizome Rot, Fruit Fly, Downy Mildew, Bacterial Wilt, Leaf Blotch, Root-Knot Nematode, Ginger Mosaic Virus, Bayoud Disease, Lethal Yellowing, and many more — each fully documented in all 8 languages.

---

Made for the Ulavan Tech plantation project. 🌴