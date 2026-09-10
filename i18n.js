/* Ulavan Tech — i18n engine.
   - Injects a language <select> into .header-inner
   - Persists choice to localStorage
   - Translates [data-i18n] elements and [data-i18n-ph] placeholders
   - Exposes: LANG, t(key), cropName(id), typeLabel(t), riskLabel(r),
     currentProblems() -> PROBLEMS (en) / PROBLEMS_TA / PROBLEMS_HI / PROBLEMS_TE
     / PROBLEMS_KN / PROBLEMS_ML / PROBLEMS_BN / PROBLEMS_MR
   - After language change, pages re-render via a callback (onLangChange). */

(function () {
  var KEY = "ulavan_lang";
  var DEFAULT_LANG = "en";

  window.LANG = localStorage.getItem(KEY) || DEFAULT_LANG;
  if (LANGUAGE_LIST.indexOf(window.LANG) === -1) window.LANG = DEFAULT_LANG;

  window.t = function (key) {
    var map = UI[window.LANG] || UI.en;
    return map[key] !== undefined ? map[key] : (UI.en[key] !== undefined ? UI.en[key] : key);
  };

  window.cropName = function (id) {
    var map = CROP_NAMES[window.LANG] || CROP_NAMES.en;
    return (map && map[id]) || id;
  };

  window.typeLabel = function (type) {
    var map = TYPE_LABEL[window.LANG] || TYPE_LABEL.en;
    return (map && map[type]) || type;
  };

  window.riskLabel = function (risk) {
    var map = RISK_LABEL[window.LANG] || RISK_LABEL.en;
    key = (risk || "").toLowerCase();
    return (map && map[risk]) || (map && map[key]) || risk;
  };

  /* Replace __X__ placeholders in a UI string. */
  window.fill = function (str, vars) {
    if (!str) return str;
    return str.replace(/__(\w+)__/g, function (_, k) {
      return vars && vars[k] !== undefined ? vars[k] : "__" + k + "__";
    });
  };

  /* Return the problems object for the current language, merging per-crop
     so any crop not yet translated falls back to English for that crop. */
  window.currentProblems = function () {
    var PROBLEM_LANG = {
      ta: "PROBLEMS_TA",
      hi: "PROBLEMS_HI",
      te: "PROBLEMS_TE",
      kn: "PROBLEMS_KN",
      ml: "PROBLEMS_ML",
      bn: "PROBLEMS_BN",
      mr: "PROBLEMS_MR",
    };
    var varName = PROBLEM_LANG[window.LANG];
    var langData = varName ? window[varName] : null;
    if (!langData) return PROBLEMS;
    var merged = {};
    for (var id in PROBLEMS) {
      merged[id] = (langData[id] && langData[id].length) ? langData[id] : PROBLEMS[id];
    }
    return merged;
  };

  window.onLangChange = null;

  function renderStatic() {
    document.documentElement.lang = window.LANG;
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      var txt = t(key);
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
        el.setAttribute("placeholder", txt);
      } else {
        el.textContent = txt;
      }
    });
    document.querySelectorAll("[data-i18n-attr]").forEach(function (el) {
      var parts = el.getAttribute("data-i18n-attr").split("|");
      el.setAttribute(parts[0], t(parts[1]));
    });
    var tag = document.querySelector(".logo-tagline");
    if (tag) tag.textContent = t("tagline");
    var sel = document.getElementById("lang-select");
    if (sel) sel.value = window.LANG;
  }

  function buildSelector() {
    var host = document.getElementById("lang-wrap");
    if (!host || host.querySelector("select")) return;
    var sel = document.createElement("select");
    sel.id = "lang-select";
    sel.className = "lang-select";
    sel.setAttribute("aria-label", "Language");
    LANGUAGE_LIST.forEach(function (l) {
      var o = document.createElement("option");
      o.value = l;
      o.textContent = LANG_NAME[l];
      sel.appendChild(o);
    });
    sel.value = window.LANG;
    sel.addEventListener("change", function () {
      window.LANG = sel.value;
      localStorage.setItem(KEY, window.LANG);
      renderStatic();
      if (typeof window.onLangChange === "function") window.onLangChange();
    });
    host.appendChild(sel);
  }

  document.addEventListener("DOMContentLoaded", function () {
    buildSelector();
    renderStatic();
    if (typeof window.onLangChange === "function") window.onLangChange();
  });

  /* Re-run if the script loads after DOM ready. */
  if (document.readyState === "complete" || document.readyState === "interactive") {
    var done = false;
    setTimeout(function () {
      if (!done) {
        done = true;
        buildSelector();
        renderStatic();
        if (typeof window.onLangChange === "function") window.onLangChange();
      }
    }, 0);
  }
})();
