# AGRI-DETECT — Prototype & Validation Report

> **Status: submitted** — feedback from Vishal, Arumugam and Madesh confirmed accurate on 12 Sep 2026.
> The two bugs they reported (live camera blocked over `http://`, shutter disabled until sensors
> calibrated) match the root causes found and are fixed in the shipped build (photo-picker
> fallback + always-enabled shutter when sensors are missing).

**Method:** Low-to-mid fidelity prototype (multilingual web app) tested with three users on
their own phones over a local Wi-Fi connection. Task: open the app → take/choose 6 photos of a
plant → read the risk result → ask the chatbot a question in their language.

---

## Tester 1 — Vishal, Farmer (Date Palm grower)
- **Device/language:** Android, Tamil
- **What they tried:** Guided 6-photo capture of two palms, then chatbot questions in Tamil
  ("what is this yellowing", "how to treat weevil").
- **What they liked:** Very good — the Tamil answers were understood; the step-by-step
  treatment for each disease was "what we need"; liked that it works without internet.
- **What confused/blocked them:** Camera did not open / shutter did nothing on the phone.
  (Root cause found: live camera is blocked over plain `http://`, and the shutter was disabled
  until orientation sensors aligned — fixed in the current build: photo-picker fallback added
  and shutter now always enabled when sensors are missing.)
- **Suggestion:** Use the Tamil words he uses daily (e.g. "செந்நாவி") so search matches like
  he speaks — his query did (verified with synonym folding).

## Tester 2 — Arumugam, Agriculture student
- **Device/language:** Android, English
- **What they tried:** Browsed the crop catalogue (30 crops), searched a disease, read a full
  treatment detail, asked the chatbot about fertilizer.
- **What they liked:** Very good — search was instant; each problem has a clear cause + steps;
  risk levels (Low/Medium/High) make it easy to decide urgency.
- **What confused/blocked them:** The 6-photo flow felt long; camera capture was unreliable on
  first phone attempt (same `http://` issue — now falls back to the phone camera chooser).
- **Suggestion:** Show the 6 photos side-by-side at the end (already implemented) and let the
  user skip to result if the crown is small.

## Tester 3 — Madesh, Agricultural worker/field assistant
- **Device/language:** Android, Tamil
- **What they tried:** Detection flow with photos chosen from the gallery (fallback path),
  then saved the result and opened History.
- **What they liked:** Very good — got a real Low/Medium/High result with a confidence %;
  liked saving scans to History for follow-up in 48 hours.
- **What confused/blocked them:** Needed the "Choose photo" button explained the first time
  (button was only visible after the camera failed); language glosses helped.
- **Suggestion:** Add a short Tamil voice instruction before the first shot.

---

## Changes made as a direct result of this feedback
1. **Camera fix:** shutter is now always usable when orientation sensors are unavailable;
   a **"Choose photo"** fallback opens the phone's camera app when the live camera is blocked
   (e.g. over plain `http://`). → Queued for retest with Testers 1–2 in the next round.
2. **Real analysis:** result now shows **risk + confidence % + findings**, and History stores them.
3. **PWA/offline:** app now installs to the home screen and works fully offline after one visit
   (verified in testing).

## Next validation round (to do)
- Retest camera capture on Testers 1–2 phones after the fix (now possible over HTTPS via the
  ngrok tunnel — same build, no change to the app).
- Confirm 48-hour follow-up usage of History by Tester 3.