const PLANTS = [
  { id: "date-palm", name: "Date Palm", img: "images/01-date-palm.jpg", is_active: true },
  { id: "coconut", name: "Coconut", img: "images/02-coconut.jpg", is_active: true },
  { id: "banana", name: "Banana", img: "images/03-banana.jpg", is_active: true },
  { id: "mango", name: "Mango", img: "images/04-mango.jpg", is_active: true },
  { id: "tomato", name: "Tomato", img: "images/05-tomato.jpg", is_active: true },
  { id: "chilli", name: "Chilli", img: "images/06-chilli.jpg", is_active: true },
  { id: "brinjal", name: "Brinjal (Eggplant)", img: "images/07-brinjal.jpg", is_active: true },
  { id: "okra", name: "Okra (Ladies finger)", img: "images/08-okra.jpg", is_active: true },
  { id: "paddy", name: "Paddy (Rice)", img: "images/09-paddy.jpg", is_active: true },
  { id: "sugarcane", name: "Sugarcane", img: "images/10-sugarcane.jpg", is_active: true },
  { id: "cotton", name: "Cotton", img: "images/11-cotton.jpg", is_active: true },
  { id: "groundnut", name: "Groundnut", img: "images/12-groundnut.jpg", is_active: true },
  { id: "maize", name: "Maize", img: "images/13-maize.jpg", is_active: true },
  { id: "areca-nut", name: "Areca nut", img: "images/14-areca-nut.jpg", is_active: true },
  { id: "black-pepper", name: "Black pepper", img: "images/15-black-pepper.jpg", is_active: true },
  { id: "turmeric", name: "Turmeric", img: "images/16-turmeric.jpg", is_active: true },
  { id: "ginger", name: "Ginger", img: "images/17-ginger.jpg", is_active: true },
  { id: "papaya", name: "Papaya", img: "images/18-papaya.jpg", is_active: true },
  { id: "guava", name: "Guava", img: "images/19-guava.jpg", is_active: true },
  { id: "pomegranate", name: "Pomegranate", img: "images/20-pomegranate.jpg", is_active: true },
  { id: "grapes", name: "Grapes", img: "images/21-grapes.jpg", is_active: true },
  { id: "onion", name: "Onion", img: "images/22-onion.jpg", is_active: true },
  { id: "potato", name: "Potato", img: "images/23-potato.jpg", is_active: true },
  { id: "cabbage", name: "Cabbage", img: "images/24-cabbage.jpg", is_active: true },
  { id: "cauliflower", name: "Cauliflower", img: "images/25-cauliflower.jpg", is_active: true },
  { id: "cucumber", name: "Cucumber", img: "images/26-cucumber.jpg", is_active: true },
  { id: "watermelon", name: "Watermelon", img: "images/27-watermelon.jpg", is_active: true },
  { id: "drumstick", name: "Drumstick (Moringa)", img: "images/28-drumstick.jpg", is_active: true },
  { id: "curry-leaf", name: "Curry leaf", img: "images/29-curry-leaf.jpg", is_active: true },
  { id: "coffee", name: "Coffee", img: "images/30-coffee.jpg", is_active: true },
];

const IMG_VERSION = "?v=8";

/* Localized name + problems */
function localizedName(plant) {
  return (window.cropName ? cropName(plant.id) : plant.name) || plant.name;
}

function localizedProblems() {
  return window.currentProblems ? currentProblems() : PROBLEMS;
}

function getPlant(id) {
  return PLANTS.find((p) => p.id === id);
}

function cardMarkup(plant, hits) {
  const display = localizedName(plant);
  const badge = '<span class="badge active">' + t("badge_active") + "</span>";
  const hint = hits && hits.length
    ? '<span class="card-hint">' + hits.slice(0, 2).map((h) => "▸ " + h.name).join(" ") + "</span>"
    : "";
  return `
    <button class="card ${plant.is_active ? "active" : ""}" data-id="${plant.id}">
      <div class="card-photo">
        <img src="${plant.img}${IMG_VERSION}" alt="${display}" loading="lazy">
      </div>
      <div class="card-body">
        <span class="card-name">${display}</span>
        ${hint}
        ${badge}
      </div>
    </button>`;
}

function toSteps(p) {
  if (Array.isArray(p.steps) && p.steps.length) return p.steps;
  if (Array.isArray(p.solution)) return p.solution;
  const raw = p.solution || "";
  const lines = raw.split(/(?<=[.!?])\s+/);
  const cleaned = lines
    .map((s) => s.trim().replace(/\s+$/, ""))
    .filter((s) => s.length > 8);
  return cleaned.length ? cleaned : [raw];
}

function problemMatches(plant, term) {
  return (localizedProblems()[plant.id] || []).filter(
    (p) =>
      p.name.toLowerCase().includes(term) ||
      (p.type || "").toLowerCase().includes(term) ||
      (p.signs || []).some((s) => s.toLowerCase().includes(term)) ||
      (p.cause || "").toLowerCase().includes(term)
  );
}

function searchPlants(term) {
  if (!term) return PLANTS.map((p) => ({ plant: p, hits: [] }));
  const out = [];
  for (const plant of PLANTS) {
    if (localizedName(plant).toLowerCase().includes(term)) {
      out.push({ plant, hits: problemMatches(plant, term) });
    } else {
      const hits = problemMatches(plant, term);
      if (hits.length) out.push({ plant, hits });
    }
  }
  return out;
}

function renderGrid(results, container) {
  container.innerHTML = results.length
    ? results.map((r) => cardMarkup(r.plant, r.hits)).join("")
    : '<p class="empty">' + t("home_empty") + "</p>";
}

let currentPlant = null;

function showModal(plant) {
  currentPlant = plant;
  const modal = document.getElementById("modal");
  const photo = document.getElementById("modal-photo");
  const title = document.getElementById("modal-name");
  const status = document.getElementById("modal-status");
  const msg = document.getElementById("modal-message");
  const action = document.getElementById("modal-action");
  const display = localizedName(plant);

  photo.innerHTML = '<img src="' + plant.img + IMG_VERSION + '" alt="' + display + '">';
  title.textContent = display;
  status.textContent = t("status_active");
  status.className = "status-badge active";

  msg.textContent = fill(t("msg_crop"), { CROP: display });

  action.classList.remove("hidden");
  action.textContent = t("open_camera");
  action.onclick = () => {
    const cropId = (plant && plant.id) || "";
    const cropName = (plant && plant.name) || "";
    window.location.href = "detection.html?crop=" + encodeURIComponent(cropId) + "&name=" + encodeURIComponent(cropName);
  };

  renderProblemList(plant);
  document.getElementById("problem-view").classList.add("hidden");
  document.getElementById("crop-view").classList.remove("hidden");
  resetModalScroll();
  document.body.classList.add("modal-open");
  modal.classList.remove("hidden");
}

function problemMarkup(p) {
  const typeLower = (p.type || "").toLowerCase();
  const typeClass = typeLower === "pest" ? "pest" : typeLower === "nutrition" ? "nutrition" : "disease";
  return `
    <button class="problem-item" data-p="${p.name}">
      <span class="p-name">${p.name}</span>
      <span class="p-type ${typeClass}">${typeLabel(p.type)}</span>
    </button>`;
}

function renderProblemList(plant) {
  const list = document.getElementById("problem-list");
  const problems = localizedProblems()[plant.id] || [];
  list.innerHTML = problems.length
    ? problems.map(problemMarkup).join("")
    : '<p class="empty">' + t("no_guide") + "</p>";
}

function showProblem(p) {
  const view = document.getElementById("problem-view");
  document.getElementById("prob-name").textContent = p.name;
  const typeBadge = document.getElementById("prob-type");
  typeBadge.textContent = typeLabel(p.type) + " · " + riskLabel(p.risk);
  typeBadge.className = "risk-badge " + (riskClass(p.risk));
  document.getElementById("prob-signs").innerHTML = p.signs
    .map((s) => "<li>" + s + "</li>").join("");
  document.getElementById("prob-cause").textContent = p.cause;
  document.getElementById("prob-steps").innerHTML = (Array.isArray(p.steps) && p.steps.length ? p.steps : toSteps(p))
    .map((s) => "<li>" + s + "</li>").join("");

  const detectBtn = document.getElementById("prob-detect");
  detectBtn.classList.remove("hidden");
  detectBtn.textContent = t("open_detection");
  detectBtn.onclick = () => {
    const cropId = (currentPlant && currentPlant.id) || "";
    const cropName = (currentPlant && currentPlant.name) || "";
    window.location.href = "detection.html?crop=" + encodeURIComponent(cropId) + "&name=" + encodeURIComponent(cropName);
  };

  document.getElementById("crop-view").classList.add("hidden");
  view.classList.remove("hidden");
  resetModalScroll();
}

function riskClass(risk) {
  const r = (risk || "").toLowerCase();
  if (r === "high") return "high";
  if (r === "medium" || r === "med") return "medium";
  return "low";
}

function resetModalScroll() {
  const card = document.getElementById("modal-card");
  if (card) card.scrollTop = 0;
}

function hideModal() {
  document.getElementById("modal").classList.add("hidden");
  document.body.classList.remove("modal-open");
}

function wireModal() {
  const modal = document.getElementById("modal");
  if (!modal) return;
  document.getElementById("modal-close").addEventListener("click", hideModal);
  document.getElementById("prob-back").addEventListener("click", () => {
    document.getElementById("problem-view").classList.add("hidden");
    document.getElementById("crop-view").classList.remove("hidden");
    resetModalScroll();
  });
  document.getElementById("problem-list").addEventListener("click", (e) => {
    const item = e.target.closest(".problem-item");
    if (!item) return;
    const p = (localizedProblems()[currentPlant.id] || []).find((x) => x.name === item.dataset.p);
    if (p) showProblem(p);
  });
  modal.addEventListener("click", (e) => {
    if (e.target === modal || e.target === document.getElementById("modal-card")) {
      hideModal();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideModal();
  });
}

function markActiveNav() {
  const link = document.querySelector('.nav a[href="' + location.pathname.split("/").pop() + '"]');
  if (link) link.classList.add("active");
}

(function init() {
  wireModal();
  markActiveNav();
  wireSettings();

  const grid = document.getElementById("home-grid");
  const search = document.getElementById("search");
  const searchCount = document.getElementById("search-count");

  function refreshSearchLabel() {
    if (!searchCount) return;
    const term = (search && search.value.trim()) || "";
    searchCount.textContent = term
      ? fill(t("search_match"), { N: searchPlants(term.toLowerCase()).length, TOTAL: PLANTS.length, Q: search.value.trim() })
      : fill(t("search_default"), { N: PLANTS.length });
  }

  if (grid) {
    renderGrid(searchPlants(""), grid);
    refreshSearchLabel();

    grid.addEventListener("click", (e) => {
      const card = e.target.closest(".card");
      if (!card) return;
      showModal(getPlant(card.dataset.id));
    });

    if (search) {
      search.setAttribute("data-i18n", "search_ph");
      search.setAttribute("placeholder", t("search_ph"));
      search.addEventListener("input", (e) => {
        const term = e.target.value.trim().toLowerCase();
        renderGrid(searchPlants(term), grid);
        refreshSearchLabel();
      });
    }
  }

  /* ---------- Settings panel ---------- */
  var CFG_KEY = "ulavanChatCfg";

  function settingsLoad() {
    var c = { provider: "free", geminiKey: "", geminiModel: "", openrouterKey: "", openrouterModel: "" };
    try {
      var s = window.localStorage && window.localStorage.getItem(CFG_KEY);
      if (s) c = Object.assign(c, JSON.parse(s));
    } catch (e) {}
    if (!c.geminiModel && typeof window.GEMINI_MODEL === "string") c.geminiModel = window.GEMINI_MODEL;
    if (!c.geminiKey && typeof window.GEMINI_KEY === "string" && window.GEMINI_KEY) c.geminiKey = window.GEMINI_KEY;
    return c;
  }

  function settingsApply(c) {
    var prov = document.getElementById("set-provider");
    var gk = document.getElementById("set-gemini-key");
    var gm = document.getElementById("set-gemini-model");
    var ok = document.getElementById("set-or-key");
    var om = document.getElementById("set-or-model");
    if (prov) prov.value = c.provider || "free";
    if (gk) gk.value = c.geminiKey || "";
    if (gm) gm.value = c.geminiModel || "";
    if (ok) ok.value = c.openrouterKey || "";
    if (om) om.value = c.openrouterModel || "";
  }

  function wireSettings() {
    var panel = document.getElementById("settings");
    if (!panel) return;
    var head = document.getElementById("settings-head");
    var saved = document.getElementById("settings-saved");
    // localStorage is not readable during early script eval on a reload,
    // so apply after the DOM is interactive.
    function applyNow() {
      settingsApply(settingsLoad());
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", applyNow);
    } else {
      applyNow();
    }
    function collect() {
      return {
        provider: document.getElementById("set-provider").value,
        geminiKey: (document.getElementById("set-gemini-key").value || "").trim(),
        geminiModel: (document.getElementById("set-gemini-model").value || "").trim(),
        openrouterKey: (document.getElementById("set-or-key").value || "").trim(),
        openrouterModel: (document.getElementById("set-or-model").value || "").trim()
      };
    }
    function persist() {
      try {
        if (window.localStorage) window.localStorage.setItem(CFG_KEY, JSON.stringify(collect()));
      } catch (e) {}
      if (saved) {
        saved.classList.remove("hidden");
        clearTimeout(saved._t);
        saved._t = setTimeout(function () { saved.classList.add("hidden"); }, 1800);
      }
    }
    if (head) head.addEventListener("click", function () { panel.classList.toggle("open"); });
    /* Auto-save: every change to provider/keys/models persists immediately. */
    ["set-provider", "set-gemini-key", "set-gemini-model", "set-or-key", "set-or-model"]
      .forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener(el.tagName === "SELECT" ? "change" : "input", persist);
      });
    var oldSave = document.getElementById("settings-save");
    if (oldSave) oldSave.addEventListener("click", persist);
  }

  /* Re-render the whole page when the language changes. */
  window.onLangChange = function () {
    if (search) search.setAttribute("placeholder", t("search_ph"));
    if (grid) {
      const term = (search && search.value.trim()) || "";
      renderGrid(searchPlants(term.toLowerCase()), grid);
      refreshSearchLabel();
    }
    if (currentPlant) {
      showModal(currentPlant);
      hideModal();
    }
  };
})();