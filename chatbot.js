(function () {
  "use strict";

  var SPEECH_ENABLED = false;
  var SPEECH_LANG = {
    en: "en-IN", ta: "ta-IN", hi: "hi-IN", te: "te-IN",
    kn: "kn-IN", ml: "ml-IN", bn: "bn-IN", mr: "mr-IN"
  };

  /* Colloquial terms folded into their matching English problem names. */
  var SYNONYMS = {
    ta: { "செந்நாவி": "red palm weevil", "பழ ஈ": "fruit fly" },
    hi: { "लाल घुन": "red palm weevil", "फल मक्खी": "fruit fly", "फ्रूट फ्लाई": "fruit fly" },
    te: { "ఎర్ర తాటి గొంగళి": "red palm weevil", "పండ్ల ఈగ": "fruit fly" },
    kn: { "ಹಣ್ಣಿನ ನೊಣ": "fruit fly" },
    ml: { "പഴ ഈച്ച": "fruit fly" },
    bn: { "লাল তাল ঘুন": "red palm weevil", "ফলের মাছি": "fruit fly" },
    mr: { "फळमाशी": "fruit fly", "लाल ताड घोकणा": "red palm weevil" }
  };

  /* Short/alternate spellings that should resolve to a crop. */
  var EXTRA_ALIAS = {
    "date-palm": ["date", "dates", "datepalm", "date palm"]
  };

  /* Words that make "onion disease" / "open ginger" read as bare crop queries
     (answered with the offline problem list) rather than live questions. */
  var STOP = {
    a: 1, an: 1, the: 1, is: 1, are: 1, was: 1, am: 1, in: 1, on: 1, of: 1,
    to: 1, for: 1, with: 1, and: 1, or: 1, so: 1, what: 1, how: 1, why: 1,
    do: 1, does: 1, did: 1, i: 1, me: 1, my: 1, it: 1, its: 1, please: 1,
    show: 1, list: 1, open: 1, all: 1, about: 1, want: 1, tell: 1, know: 1,
    problem: 1, problems: 1, disease: 1, diseases: 1, pest: 1, pests: 1,
    treatment: 1, treat: 1, cure: 1, care: 1
  };

  /* True when, after removing the crop name and filler words, nothing real
     is left — i.e. the user just typed a crop (or "open <crop>", "list"…),
     so answer with the offline problem list instead of the live model. */
  function isBareCrop(t) {
    var alias = buildIndex();
    var toks = t.split(/\s+/);
    for (var i = 0; i < toks.length; i++) {
      var w = toks[i];
      if (w.length < 1) continue;
      if (STOP[w] || alias[w]) continue;
      if (w.length >= 4) return false;
    }
    return true;
  }

  /* Ordered app-intent rules. Crop / problem questions are handled by the
     knowledge-base engine first; these answer app-specific topics. */
  var KB = [
    { keys: ["hi", "hello", "hey", "namaste", "vanakkam", "vanakam"], replyKey: "welcome" },
    { keys: ["what is this", "what is this app", "about this app", "what is agridetect", "what is agrivalam", "agrivalam", "what is ulavan", "ulavan", "what does this", "project"], replyKey: "what_is" },
    { keys: ["48 hour", "48h", "screen within", "warn"], replyKey: "obj48" },
    { keys: ["low risk", "risk low", "safe", "healthy", "குறைந்த ஆபத்து", "कम जोखिम", "తక్కువ ప్రమాదం", "ಕಡಿಮೆ ಅಪಾಯ", "കുറഞ്ഞ അപകടം", "কম ঝুঁকি", "कमी जोखीम"], replyKey: "low_risk" },
    { keys: ["medium risk", "risk medium", "நடு ஆபத்து", "मध्यम जोखिम", "మధ్యస్థ ప్రమాదం", "ಮಧ್ಯಮ ಅಪಾಯ", "ഇടത്തരം അപകടം", "মাঝারি ঝুঁকি", "मध्यम जोखीम"], replyKey: "med_risk" },
    { keys: ["high risk", "risk high", "act now", "அதிக ஆபத்து", "उच्च जोखिम", "अधिक प्रमाण", "అధిక ప్రమాదం", "ಅಧಿಕ ಅಪಾಯ", "ഉയർന്ന അപകടം", "উচ্চ ঝুঁকি", "उच्च जोखीम"], replyKey: "high_risk" },
    { keys: ["360", "6 photo", "six photo", "how to capture", "capture", "take photo", "photo"], replyKey: "capture" },
    { keys: ["history", "record", "save result", "log"], replyKey: "history" },
    { keys: ["yolo", "model", "ai", "ml", "machine learning", "computer vision", "algorithm"], replyKey: "model" },
    { keys: ["price", "sell", "market"], replyKey: "no_price" },
    { keys: ["thank", "thanks", "thx"], replyKey: "thanks" },
    { keys: ["bye", "goodbye"], replyKey: "bye" }
  ];

  var INTENT = {
    list: {
      en: ["list", "all the problems", "all problems", "which problems", "types of", "show me", "open"],
      ta: ["எல்லா", "அனைத்து", "பட்டியல்", "எத்தனை", "வகைகள்"],
      hi: ["सूची", "सभी", "कौन कौन", "कितने", "समस्याएं"],
      te: ["జాబితా", "అన్ని", "ఎన్ని", "ఏ సమస్యలు"],
      kn: ["ಪಟ್ಟಿ", "ಎಲ್ಲಾ", "ಎಷ್ಟು", "ಸಮಸ್ಯೆಗಳು"],
      ml: ["പട്ടിക", "എല്ലാ", "എത്ര", "പ്രശ്നങ്ങൾ"],
      bn: ["তালিকা", "সব", "কতগুলো"],
      mr: ["यादी", "सर्व", "किती"]
    },
    signs: {
      en: ["sign", "symptom", "how to identify", "what happens", "look like", "appear", "detect"],
      ta: ["அறிகுறி", "லட்சணம்", "தெரிய", "எப்படி"],
      hi: ["लक्षण", "दिख", "पहचान"],
      te: ["లక్షణం", "లక్షణాలు", "గుర్తించ"],
      kn: ["ಲಕ್ಷಣ", "ಗುರುತಿಸ"],
      ml: ["ലക്ഷണം", "തിരിച്ചറിയ"],
      bn: ["লক্ষণ", "চেনার"],
      mr: ["लक्षणे", "ओळख"]
    },
    cause: {
      en: ["cause", "because", "why", "reason", "due to"],
      ta: ["காரணம்", "ஏன்", "எதனால்"],
      hi: ["कारण", "क्यों"],
      te: ["కారణం", "ఎందుకు"],
      kn: ["ಕಾರಣ", "ಏಕೆ"],
      ml: ["കാരണം", "എന്തുകൊണ്ട്"],
      bn: ["কারণ", "কেন"],
      mr: ["कारण", "का"]
    },
    solve: {
      en: ["solution", "treatment", "cure", "spray", "medicine", "remedy", "treat", "control", "prevent", "protect", "apply", "save"],
      ta: ["தீர்வு", "சிகிச்சை", "மருந்து", "தெளி", "கட்டுப்படுத்த", "தடு", "நீக்க"],
      hi: ["समाधान", "उपचार", "इलाज", "दवा", "छिड़काव", "रोक", "काबू"],
      te: ["పరిష్కారం", "చికిత్స", "మందు", "నివారణ", "నియంత్రించ"],
      kn: ["ಪರಿಹಾರ", "ಚಿಕಿತ್ಸೆ", "ಔಷಧಿ", "ನಿಯಂತ್ರಿಸ", "ತಡೆ", "ಸಿಂಪಡಿಸು"],
      ml: ["പരിഹാരം", "ചികിത്സ", "മരുന്ന്", "നിയന്ത്രണം", "തടയുക", "കുത്തിവയ്പ്പ്"],
      bn: ["সমাধান", "চিকিৎসা", "ঔষধ", "নিয়ন্ত্রণ", "প্রতিরোধ", "স্প্রে"],
      mr: ["उपाय", "उपचार", "इलाज", "औषध", "नियंत्रण", "प्रतिबंध", "फवारणी"]
    },
    crops: {
      en: ["available crops", "list of crops", "which crops", "all crops", "crops are", "show crops"],
      ta: ["பயிர்கள்", "என்ன பயிர்"],
      hi: ["फसलें", "कौन सी फसल"],
      te: ["పంటలు", "ఏ పంటలు"],
      kn: ["ಬೆಳೆಗಳು", "ಏನು ಬೆಳೆ"],
      ml: ["വിളകൾ", "ഏത് വിള"],
      bn: ["ফসল", "কোন ফসল"],
      mr: ["పికె", "कोणती पिके"]
    }
  };

  function chatT(key) {
    var map = CHAT[window.LANG] || CHAT.en;
    return map[key] !== undefined ? map[key] : (CHAT.en[key] || "");
  }

  /* Normalize for matching: lowercase, strip punctuation, collapse spaces. */
  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[!"#$%&'()*+,\-.\\/:;<=>?@[\]^_`{|}~]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  var IX = null;

  /* Build a crop-name alias map (all 8 languages + English keys), including
     trimmed variants so inflected forms (e.g. "மாவின", "தக்காளியின்") match. */
  function buildIndex() {
    if (IX) return IX;
    var alias = {};
    function add(name, cid) {
      var n = norm(name);
      if (!n || n.length < 2) return;
      if (!alias[n] || alias[n].len < n.length) alias[n] = { cid: cid, len: n.length };
      if (n.length >= 3) {
        var a = norm(name.slice(0, -1));
        var b = norm(name.slice(0, -2));
        if (a && a.length >= 2 && !alias[a]) alias[a] = { cid: cid, len: a.length };
        if (b && b.length >= 2 && !alias[b]) alias[b] = { cid: cid, len: b.length };
      }
    }
    var lang, cid, c;
    for (lang in CROP_NAMES) {
      var map = CROP_NAMES[lang] || {};
      for (cid in map) add(map[cid], cid);
    }
    for (c in PROBLEMS) add(c, c);
    for (var ex in EXTRA_ALIAS) {
      EXTRA_ALIAS[ex].forEach(function (s) { add(s, ex); });
    }
    IX = alias;
    return IX;
  }

  function bestCrop(t) {
    var best = null, bestLen = 0;
    var alias = buildIndex();
    for (var k in alias) {
      if (alias[k].len > bestLen && t.indexOf(k) !== -1) {
        best = alias[k].cid; bestLen = alias[k].len;
      }
    }
    return best;
  }

  function hasIntent(q, which) {
    var words = INTENT[which] || {};
    var set = words[window.LANG] || words.en;
    if (!set) return false;
    for (var i = 0; i < set.length; i++) {
      if (q.indexOf(norm(set[i])) !== -1) return true;
    }
    return false;
  }

  /* Full-name contained matches in the CURRENT language (with English fallback
     for the same slot). Never relies on cross-language index alignment. */
  function entMatch(t) {
    var probs = window.currentProblems();
    var out = [];
    for (var cid in probs) {
      var arr = probs[cid] || [];
      var enArr = PROBLEMS[cid] || [];
      for (var i = 0; i < arr.length; i++) {
        var p = arr[i];
        if (!p || !p.name) continue;
        var nm = norm(p.name);
        var enN = (enArr[i] && enArr[i].name) ? norm(enArr[i].name) : null;
        if (nm.length >= 3 && t.indexOf(nm) !== -1) {
          out.push({ cid: cid, i: i, len: nm.length, usesEN: false });
        } else if (enN && enN.length >= 3 && t.indexOf(enN) !== -1) {
          out.push({ cid: cid, i: i, len: enN.length, usesEN: true });
        }
      }
    }
    return out;
  }

  /* Word-overlap pick within a single crop: counts tokens of each problem
     name (current lang + English) that appear in the question, ignoring the
     crop's own name tokens so "mango" alone does not pick a random problem. */
  function tokMin(w) {
    return /[\u{0900}-\u{0FFF}]/u.test(w) ? 1 : 1;
  }

  /* Token match: short tokens must be a whole word (avoids क रु collisions
     inside compound names); long tokens may also match as a substring. */
  function tokHit(t, w) {
    if (w.length < 1) return false;
    if ((" " + t + " ").indexOf(" " + w + " ") !== -1) return true;
    return w.length >= 6 && t.indexOf(w) !== -1;
  }

  function tokenPick(cid, t) {
    var probs = window.currentProblems()[cid] || PROBLEMS[cid] || [];
    var cropTok = {};
    norm(window.cropName(cid) || cid).split(" ").forEach(function (w) {
      if (w.length >= 3) cropTok[w] = 1;
    });
    var best = null, bestScore = 0, bestCnt = 0, bestMax = 0;
    for (var i = 0; i < probs.length; i++) {
      var p = probs[i];
      if (!p || !p.name) continue;
      var en = (PROBLEMS[cid] && PROBLEMS[cid][i] && PROBLEMS[cid][i].name) || null;
      var cands = [p.name];
      if (en && norm(en) !== norm(p.name)) cands.push(en);
      var score = 0, cnt = 0, maxW = 0, seen = {};
      for (var c = 0; c < cands.length; c++) {
        var toks = norm(cands[c]).split(" ");
        for (var u = 0; u < toks.length; u++) {
          var w = toks[u];
          if (w.length < 1 || seen[w] || cropTok[w]) continue;
          seen[w] = 1;
          if (tokHit(t, w)) { score += w.length; cnt++; if (w.length > maxW) maxW = w.length; }
        }
      }
      if (score > bestScore) { bestScore = score; best = i; bestCnt = cnt; bestMax = maxW; }
    }
    return (best !== null && bestScore >= 3 && (bestCnt >= 2 || bestMax >= 7)) ? best : null;
  }

  /* Global word-overlap pick (no crop detected): finds the most relevant
     problem across all crops, e.g. a Tamil "செந்நாவி" without the crop name. */
  function globalTokenPick(t) {
    var probs = window.currentProblems();
    var best = null, bestScore = 0, bestCnt = 0, bestMax = 0;
    for (var cid in probs) {
      var arr = probs[cid] || [];
      for (var i = 0; i < arr.length; i++) {
        var p = arr[i];
        if (!p || !p.name) continue;
        var en = (PROBLEMS[cid] && PROBLEMS[cid][i] && PROBLEMS[cid][i].name) || null;
        var cands = [p.name];
        if (en && norm(en) !== norm(p.name)) cands.push(en);
        var score = 0, cnt = 0, maxW = 0, seen = {};
        for (var c = 0; c < cands.length; c++) {
          var toks = norm(cands[c]).split(" ");
          for (var u = 0; u < toks.length; u++) {
            var w = toks[u];
            if (w.length < 1 || seen[w]) continue;
            seen[w] = 1;
            if (tokHit(t, w)) { score += w.length; cnt++; if (w.length > maxW) maxW = w.length; }
          }
        }
        if (score > bestScore) { bestScore = score; best = { cid: cid, i: i }; bestCnt = cnt; bestMax = maxW; }
      }
    }
    return (best && bestScore >= 3 && (bestCnt >= 2 || bestMax >= 7)) ? best : null;
  }

  function listProblems(crop) {
    var plist = window.currentProblems()[crop] || PROBLEMS[crop] || [];
    if (!plist.length) return null;
    var out = [];
    for (var j = 0; j < plist.length; j++) {
      var tp = window.typeLabel ? window.typeLabel(plist[j].type) : plist[j].type;
      out.push((j + 1) + ") " + plist[j].name + (tp ? " — " + tp : ""));
    }
    return window.fill(chatT("kb_problems_of"), {
      crop: window.cropName(crop) || crop,
      n: plist.length
    }) + "\n" + out.join("\n") + "\n" + chatT("kb_hint");
  }

  function detailFor(cid, i, text) {
    var probs = window.currentProblems()[cid] || PROBLEMS[cid] || [];
    var p = probs[i];
    if (!p) return null;
    var t = norm(text);
    var lines = ["🔎 " + ((window.cropName(cid) || cid)) + " — " + p.name];
    var wantAll = !(hasIntent(t, "signs") || hasIntent(t, "cause") || hasIntent(t, "solve"));
    if (wantAll || hasIntent(t, "signs")) {
      if (p.signs) lines.push(chatT("kb_signs") + " " + p.signs);
    }
    if (wantAll || hasIntent(t, "cause")) {
      if (p.cause) lines.push(chatT("kb_cause") + " " + p.cause);
    }
    if (wantAll || hasIntent(t, "solve")) {
      if (p.solution) lines.push(chatT("kb_solution") + " " + p.solution);
    }
    var type = window.typeLabel ? window.typeLabel(p.type) : p.type;
    var risk = window.riskLabel ? window.riskLabel(p.risk) : p.risk;
    lines.push(window.fill(chatT("kb_type_line"), { type: type || "-", risk: risk || "-" }));
    return lines.join("\n");
  }

  /* Answer from the 317-problem multilingual knowledge base. */
  function kbAnswer(text) {
    var t = norm(text);
    if (!t) return null;
    /* Fold colloquial terms into their English problem names. */
    var syn = SYNONYMS[window.LANG];
    if (syn) {
      for (var sk in syn) {
        if (t.indexOf(norm(sk)) !== -1) t += " " + syn[sk];
      }
    }
    var crop = bestCrop(t);

    if (hasIntent(t, "crops") && !crop) {
      var list = [];
      for (var c in PROBLEMS) list.push(window.cropName(c) || c);
      return chatT("kb_crops") + "\n" + list.join(", ");
    }

    var matches = entMatch(t);

    if (crop) {
      /* Exact-phrase match inside the detected crop wins first. */
      var cp = null, cpLen = 0;
      for (var mm = 0; mm < matches.length; mm++) {
        if (matches[mm].cid === crop && matches[mm].len > cpLen) {
          cp = matches[mm].i; cpLen = matches[mm].len;
        }
      }
      if (cp !== null && cpLen > 0) return detailFor(crop, cp, text);
      /* "all problems / list" of a crop → show the list, not a fake pick. */
      if (hasIntent(t, "list")) return listProblems(crop);
      /* Otherwise fall back to word overlap inside that crop. */
      var tk = tokenPick(crop, t);
      if (tk !== null) return detailFor(crop, tk, text);
    }

    if (!matches.length) {
      if (crop && isBareCrop(t)) return listProblems(crop);
      var gt = globalTokenPick(t);
      if (gt !== null) return detailFor(gt.cid, gt.i, text);
      return null;
    }

    var maxLen = 0;
    for (var m = 0; m < matches.length; m++) {
      if (matches[m].len > maxLen) maxLen = matches[m].len;
    }
    var top = [];
    var cids = {};
    for (var k = 0; k < matches.length; k++) {
      if (matches[k].len === maxLen) {
        top.push(matches[k]);
        cids[matches[k].cid] = 1;
      }
    }
    var cropSet = Object.keys(cids);

    if (crop && cids[crop]) {
      for (var x = 0; x < top.length; x++) {
        if (top[x].cid === crop) return detailFor(crop, top[x].i, text);
      }
    }
    if (cropSet.length === 1) {
      return detailFor(cropSet[0], top[0].i, text);
    }

    var names = cropSet.map(function (x) {
      return window.cropName(x) || x;
    });
    var probs = window.currentProblems();
    var label = (probs[top[0].cid] && probs[top[0].cid][top[0].i])
      ? probs[top[0].cid][top[0].i].name
      : top[0].cid;
    return window.fill(chatT("kb_affects"), { problem: label, crops: names.join(", ") }) +
      "\n" + chatT("kb_hint");
  }

  function match(text) {
    var t = text.toLowerCase();
    var kb = kbAnswer(text);
    if (kb) return kb;
    for (var i = 0; i < KB.length; i++) {
      var item = KB[i];
      if (!item.replyKey) continue;
      for (var j = 0; j < item.keys.length; j++) {
        if (t.indexOf(item.keys[j]) !== -1) return chatT(item.replyKey);
      }
    }
    return null; /* unsure → live ask (or fallback) */
  }

  /* Ground the live model with the app's crop list in the current language. */
  function liveGround() {
    var out = [];
    for (var c in PROBLEMS) out.push(window.cropName(c) || c);
    return out.join(", ");
  }

  var DEFAULT_OR_MODEL = "openai/gpt-4o-mini";
  var CFG_KEY = "ulavanChatCfg";

  /* Live-model config: first choice is localStorage (set via the ⚙ panel),
     else the static chat-key.js values, else the free keyless endpoint. */
  function loadCfg() {
    try {
      var s = window.localStorage && window.localStorage.getItem(CFG_KEY);
      if (s) {
        var o = JSON.parse(s);
        return {
          provider: o.provider || "free",
          openrouterKey: o.openrouterKey || "",
          openrouterModel: o.openrouterModel || DEFAULT_OR_MODEL
        };
      }
    } catch (e) {}
    return {
      provider: "free",
      openrouterKey: (typeof window.OPENROUTER_KEY === "string") ? window.OPENROUTER_KEY : "",
      openrouterModel: ((typeof window.OPENROUTER_MODEL === "string") && window.OPENROUTER_MODEL)
        ? window.OPENROUTER_MODEL : DEFAULT_OR_MODEL
    };
  }

  function saveCfg(c) {
    try {
      if (window.localStorage) window.localStorage.setItem(CFG_KEY, JSON.stringify(c));
    } catch (e) {}
  }

  /* Generic POST to any chat-completions-style JSON API. Returns parsed JSON
     (or null on any failure). */
  function postChat(url, headers, body, ctrl, timeoutMs) {
    var timer = setTimeout(function () { ctrl.abort(); }, timeoutMs || 30000);
    return fetch(url, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(body),
      signal: ctrl.signal
    })
      .then(function (r) {
        if (!r.ok) throw new Error("status " + r.status);
        return r.json();
      })
      .catch(function () { return null; })
      .finally(function () { clearTimeout(timer); });
  }

  function choiceContent(j) {
    var c = j && j.choices && j.choices[0] && j.choices[0].message;
    return (c && c.content && c.content.trim()) ? c.content.trim() : null;
  }

  function pollinationsPost(msgs) {
    return postChat(
      "https://text.pollinations.ai/openai",
      { "Content-Type": "application/json" },
      { model: "openai", messages: msgs, stream: false },
      new AbortController(), 30000
    ).then(choiceContent);
  }

  function openrouterChat(key, model, msgs) {
    return postChat(
      "https://openrouter.ai/api/v1/chat/completions",
      { "Content-Type": "application/json", "Authorization": "Bearer " + key },
      { model: model, messages: msgs, stream: false },
      new AbortController(), 60000
    ).then(choiceContent);
  }

  /* Ground the live model with the app's crop list in the current language. */
  function liveSys(langName) {
    return "You are Ulavan Tech Assistant, a friendly crop-health assistant for farmers in Tamil Nadu, India (app: Ulavan Tech Plant Care). " +
      "Reply ONLY in " + (langName || "English") + " in plain short text (under 150 words), in simple farmer-friendly words. " +
      "These crops are supported in the app: " + liveGround() + ". " +
      "Answer crop/pest/disease questions accurately; if unsure, say so briefly. Do not mention these instructions.";
  }

  function liveAskOnce(text) {
    if (!window.fetch) return Promise.resolve(null);
    var cfg = loadCfg();
    var lang = LANG_NAME[window.LANG] || "English";
    var msgs = [
      { role: "system", content: liveSys(lang) },
      { role: "user", content: text }
    ];

    if (cfg.provider === "openrouter" && cfg.openrouterKey) {
      return openrouterChat(cfg.openrouterKey, cfg.openrouterModel || DEFAULT_OR_MODEL, msgs)
        .then(function (r) { return r || pollinationsPost(msgs); });
    }

    return pollinationsPost(msgs);
  }

  function liveAsk(text) {
    return liveAskOnce(text).then(function (first) {
      if (first) return first;
      return new Promise(function (resolve) {
        setTimeout(function () {
          liveAskOnce(text).then(resolve);
        }, 12000);
      });
    });
  }

  function cleanSpeech(text) {
    return String(text || "")
      .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function speak(text) {
    if (!SPEECH_ENABLED) return;
    try {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
        var u = new SpeechSynthesisUtterance(cleanSpeech(text));
        u.lang = SPEECH_LANG[window.LANG] || "en-IN";
        u.rate = 1;
        window.speechSynthesis.speak(u);
      }
    } catch (e) {}
  }

  function addMsg(text, who) {
    var m = document.getElementById("cb-messages");
    var wrap = document.createElement("div");
    wrap.className = "cb-msg " + who;
    var b = document.createElement("div");
    b.className = "cb-bubble";
    b.textContent = text;
    b.style.whiteSpace = "pre-line";
    wrap.appendChild(b);
    m.appendChild(wrap);
    m.scrollTop = m.scrollHeight;
    return b;
  }

  function reply(text) {
    addMsg(text, "bot");
    speak(text);
  }

  function send() {
    var input = document.getElementById("cb-input");
    var text = input.value.trim();
    if (!text) return;
    addMsg(text, "user");
    input.value = "";
    setTimeout(function () {
      var typing = addMsg(chatT("typing"), "bot");
      var ans = match(text);
      if (ans) {
        setTimeout(function () {
          if (typing.parentNode) typing.parentNode.remove();
          reply(ans);
        }, 450);
        return;
      }
      /* Unsure from the offline KB → ask the free live model. */
      liveAsk(text).then(function (live) {
        if (typing.parentNode) typing.parentNode.remove();
        reply(live || chatT("liveBusy"));
      });
    }, 120);
  }

  function togglePanel() {
    var panel = document.getElementById("cb-panel");
    var open = panel.classList.toggle("cb-open");
    document.getElementById("cb-fab").textContent = open ? "✕" : "💬";
    if (open) document.getElementById("cb-input").focus();
  }

  function build() {
    var host = document.createElement("div");
    host.id = "cb-host";
    host.innerHTML =
      '<button id="cb-fab" aria-label="Chat with assistant">💬</button>' +
      '<div id="cb-panel" class="cb-panel">' +
      '  <div class="cb-head">' +
      '    <span>' + chatT("head") + '</span>' +
      '    <div>' +
      '      <button id="cb-voice" title="Speak replies">🔇</button>' +
      '      <button id="cb-close" title="Close">✕</button>' +
      '    </div>' +
      '  </div>' +
      '  <div id="cb-messages" class="cb-messages"></div>' +
      '  <div class="cb-input-row">' +
      '    <input id="cb-input" placeholder="' + chatT("placeholder") + '" autocomplete="off">' +
      '    <button id="cb-send">' + chatT("send") + '</button>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(host);

    document.getElementById("cb-fab").addEventListener("click", togglePanel);
    document.getElementById("cb-close").addEventListener("click", togglePanel);
    document.getElementById("cb-send").addEventListener("click", send);
    document.getElementById("cb-input").addEventListener("keydown", function (e) {
      if (e.key === "Enter") send();
    });
    document.getElementById("cb-voice").addEventListener("click", function (e) {
      SPEECH_ENABLED = !SPEECH_ENABLED;
      e.target.textContent = SPEECH_ENABLED ? "🔊" : "🔇";
      if (SPEECH_ENABLED) {
        speak(chatT("voice_on"));
      } else if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    });

    addMsg(chatT("greet"), "bot");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();