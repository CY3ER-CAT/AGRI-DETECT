const STORAGE_KEY = "agri_history";

const SEED = [
  {
    id: 1,
    crop: "Date Palm — Palm 12",
    risk: "medium",
    date: "2 Sep 2026, 08:40",
    note: "Demo entry — holes at crown base, recheck in 48h. Real entries are added by the Detection screen.",
  },
  {
    id: 2,
    crop: "Date Palm — Palm 31",
    risk: "low",
    date: "1 Sep 2026, 17:05",
    note: "Demo entry — routine weekly check, no damage signs.",
  },
  {
    id: 3,
    crop: "Date Palm — Palm 07",
    risk: "high",
    date: "1 Sep 2026, 09:15",
    note: "Demo entry — damaged shoot matched weevil activity pattern, logged for follow-up.",
  },
];

function loadHistory() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw !== null) return JSON.parse(raw);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED));
  return [...SEED];
}

function saveHistory(history) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

function historyItemHtml(rec) {
  const crop = esc(rec.crop);
  const thumb = rec.thumb
    ? '<img class="history-thumb" src="' + esc(rec.thumb) + '" alt="Palm photo">'
    : '<div class="history-thumb">🌴</div>';
  const note = rec.note ? '<p class="history-note">' + esc(rec.note) + "</p>" : "";
  const conf = rec.confidence ? esc(rec.confidence) + "%" : "";
  const meth = rec.method === "vision" ? t("method_vision") : rec.method === "local" ? t("method_local") : "";
  const meta = (conf || meth)
    ? '<span class="history-meta">' + meth + (meth && conf ? " · " : "") + conf + "</span>"
    : "";
  return `
    <div class="history-item" data-id="${esc(rec.id)}">
      ${thumb}
      <div class="history-info">
        <div class="row">
          <span class="crop">${crop}</span>
          <span class="risk-badge ${riskClass(rec.risk)}">${riskLabel(rec.risk)}</span>
        </div>
        <div class="row" style="margin-top:4px">
          <span class="date">${rec.date}</span>
          <button class="del" data-del="${rec.id}" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:.8rem">${t("delete")}</button>
        </div>
        ${meta}
        ${note}
      </div>
    </div>`;
}

function openHistoryDetail(rec) {
  const crop = esc(rec.crop);
  const thumb = rec.thumb
    ? '<img class="hm-thumb" src="' + esc(rec.thumb) + '" alt="Palm photo">'
    : '<div class="hm-thumb">🌴</div>';
  const findings = (Array.isArray(rec.findings) ? rec.findings : String(rec.findings || "").split(","))
    .map((f) => (f || "").trim())
    .filter(Boolean)
    .map((f) => t("f_" + f) || esc(f))
    .join(" · ");
  const conf = rec.confidence ? esc(rec.confidence) + "%" : "";
  const meth = rec.method === "vision" ? t("method_vision") : rec.method === "local" ? t("method_local") : "";
  const overlay = document.createElement("div");
  overlay.className = "history-overlay";
  overlay.innerHTML = `
    <div class="history-modal">
      ${thumb}
      <div class="row">
        <span class="hm-crop">${crop}</span>
        <span class="risk-badge ${riskClass(rec.risk)}">${riskLabel(rec.risk)}</span>
      </div>
      <div class="hm-meta">${rec.date}${(meth || conf) ? " · " + [meth, conf].filter(Boolean).join(" · ") : ""}</div>
      ${findings ? '<p class="hm-note">' + findings + "</p>" : ""}
      ${rec.note ? '<p class="hm-note">' + esc(rec.note) + "</p>" : ""}
      <div style="display:flex;gap:10px;margin-top:14px">
        <a class="btn" style="flex:1;text-align:center" href="detection.html?crop=${encodeURIComponent(rec.cropId || "date-palm")}&name=${encodeURIComponent(rec.crop.replace(/ — .*$/, ""))}">${t("rescan")}</a>
        <button class="btn" style="flex:1" id="hm-close">${t("close")}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || e.target.id === "hm-close") overlay.remove();
  });
}

function renderHistory() {
  const history = loadHistory();
  const list = document.getElementById("history-list");
  const count = document.getElementById("count");

  if (!history.length) {
    list.innerHTML =
      '<div class="empty-state">' + t("no_history") + '<br><br><a class="btn" href="detection.html">' + t("run_detection") + "</a></div>";
    count.textContent = "0 " + t("records");
    return;
  }

  list.innerHTML = history.map(historyItemHtml).join("");
  count.textContent = history.length + " " + (history.length > 1 ? t("records") : t("record"));

  list.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      saveHistory(loadHistory().filter((r) => r.id !== Number(btn.dataset.del)));
      renderHistory();
    });
  });

  list.querySelectorAll(".history-item").forEach((item) => {
    item.addEventListener("click", () => {
      const rec = loadHistory().find((r) => r.id === Number(item.dataset.id));
      if (rec) openHistoryDetail(rec);
    });
  });
}

document.getElementById("clear-all").addEventListener("click", () => {
  if (confirm(t("confirm_delete"))) {
    saveHistory([]);
    renderHistory();
  }
});

window.onLangChange = function () {
  renderHistory();
};

renderHistory();