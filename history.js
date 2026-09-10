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
  const thumb = rec.thumb
    ? '<img class="history-thumb" src="' + rec.thumb + '" alt="Palm photo">'
    : '<div class="history-thumb">🌴</div>';
  const note = rec.note ? '<p class="history-note">' + rec.note + "</p>" : "";
  return `
    <div class="history-item" data-id="${rec.id}">
      ${thumb}
      <div class="history-info">
        <div class="row">
          <span class="crop">${rec.crop}</span>
          <span class="risk-badge ${riskClass(rec.risk)}">${riskLabel(rec.risk)}</span>
        </div>
        <div class="row" style="margin-top:4px">
          <span class="date">${rec.date}</span>
          <button class="del" data-del="${rec.id}" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:.8rem">${t("delete")}</button>
        </div>
        ${note}
      </div>
    </div>`;
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
    btn.addEventListener("click", () => {
      saveHistory(loadHistory().filter((r) => r.id !== Number(btn.dataset.del)));
      renderHistory();
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