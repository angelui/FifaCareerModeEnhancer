import { fetchAllPlayersForEdition, fetchPlayersByClub, fetchPlayerSearch } from "../api.js";
import { mountCombobox, renderCombobox } from "../ui/combobox.js";
import { escapeHtml } from "../ui.js";
import { assertCareerReady, runSectionLoader } from "../ui/section-loader.js";
import { formatMoney, renderSectionShell } from "./section-shell.js";
import { createId, loadCareerData, updateCareerData } from "../career-data.js";

const SORT_COLUMNS = [
  { key: "name", label: "Player", type: "text" },
  { key: "positions", label: "Position", type: "text" },
  { key: "overall", label: "OVR", type: "number" },
  { key: "potential", label: "Potential", type: "number" },
  { key: "value", label: "Price", type: "number" },
  { key: "wage", label: "Wage", type: "number" },
  { key: "contract", label: "Contract", type: "number" },
  { key: "nationality", label: "Nation", type: "text" },
];

function toNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const POSITION_ORDER = [
  "GK",
  "LWB", "LB", "LCB", "CB", "RCB", "RB", "RWB",
  "CDM", "LDM", "RDM", "LM", "LCM", "CM", "RCM", "RM", "CAM", "LAM", "RAM",
  "LW", "LF", "CF", "RF", "RW", "ST", "LS", "RS"
];

function getPositionWeight(player) {
  const posString = player.positions ?? "";
  const primary = posString.split(",")[0].trim().toUpperCase();
  const index = POSITION_ORDER.indexOf(primary);
  return index !== -1 ? index : 999;
}

function sortPlayers(players, sortKey, sortDir) {
  const column = SORT_COLUMNS.find((entry) => entry.key === sortKey) ?? SORT_COLUMNS[2];
  const multiplier = sortDir === "asc" ? 1 : -1;

  return [...players].sort((left, right) => {
    if (sortKey === "overall") {
      const leftWeight = getPositionWeight(left);
      const rightWeight = getPositionWeight(right);
      if (leftWeight !== rightWeight) {
        return (leftWeight - rightWeight) * -multiplier;
      }
      const leftOvr = toNumber(left.overall) ?? -1;
      const rightOvr = toNumber(right.overall) ?? -1;
      if (leftOvr !== rightOvr) return rightOvr - leftOvr;
      return String(left.name ?? "").localeCompare(String(right.name ?? ""), undefined, { sensitivity: "base" });
    }

    if (column.type === "number") {
      const leftValue = toNumber(left[sortKey]) ?? -1;
      const rightValue = toNumber(right[sortKey]) ?? -1;
      if (leftValue !== rightValue) return (leftValue - rightValue) * multiplier;
      return String(left.name ?? "").localeCompare(String(right.name ?? ""), undefined, { sensitivity: "base" });
    }

    const leftText = String(left[sortKey] ?? "").trim().toLowerCase();
    const rightText = String(right[sortKey] ?? "").trim().toLowerCase();
    const textCompare = leftText.localeCompare(rightText, undefined, { sensitivity: "base" });
    if (textCompare !== 0) return textCompare * multiplier;
    return (toNumber(right.overall) ?? -1) - (toNumber(left.overall) ?? -1);
  });
}

function computeSquadSummary(players) {
  if (!players.length) {
    return {
      count: 0,
      avgOverall: null,
      avgPotential: null,
      avgAge: null,
      totalValue: null,
      totalWage: null,
      best11Overall: null,
      youngUnder23Count: 0,
      seniorOver32Count: 0,
      nationalityCount: 0,
      topNationalities: [],
      topPlayers: [],
    };
  }

  const overalls = players.map((player) => toNumber(player.overall)).filter((value) => value !== null);
  const potentials = players.map((player) => toNumber(player.potential)).filter((value) => value !== null);
  const ages = players.map((player) => toNumber(player.age)).filter((value) => value !== null);
  const values = players.map((player) => toNumber(player.value)).filter((value) => value !== null);
  const wages = players.map((player) => toNumber(player.wage)).filter((value) => value !== null);

  const avg = (items) => (items.length ? Math.round(items.reduce((sum, value) => sum + value, 0) / items.length) : null);
  const sum = (items) => (items.length ? items.reduce((total, value) => total + value, 0) : null);

  const sortedByOverall = [...players].sort(
    (left, right) => (toNumber(right.overall) ?? -1) - (toNumber(left.overall) ?? -1),
  );
  const best11 = sortedByOverall
    .slice(0, 11)
    .map((player) => toNumber(player.overall))
    .filter((value) => value !== null);

  const nationalityCounts = new Map();
  for (const player of players) {
    const nationality = String(player.nationality ?? "").trim();
    if (!nationality) continue;
    nationalityCounts.set(nationality, (nationalityCounts.get(nationality) ?? 0) + 1);
  }

  const topNationalities = [...nationalityCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], undefined, { sensitivity: "base" }))
    .slice(0, 3)
    .map(([nationality, count]) => `${nationality} (${count})`);

  return {
    count: players.length,
    avgOverall: avg(overalls),
    avgPotential: avg(potentials),
    avgAge: avg(ages),
    totalValue: sum(values),
    totalWage: sum(wages),
    best11Overall: best11.length ? Math.round(best11.reduce((total, value) => total + value, 0) / best11.length) : null,
    youngUnder23Count: ages.filter((age) => age < 23).length,
    seniorOver32Count: ages.filter((age) => age > 32).length,
    nationalityCount: nationalityCounts.size,
    topNationalities,
    topPlayers: sortedByOverall.slice(0, 3),
  };
}

function renderSummaryPanel(summary, career) {
  const topPlayers = summary.topPlayers.length
    ? summary.topPlayers
        .map((player) => `${escapeHtml(player.name)} (${player.overall})`)
        .join(" · ")
    : "—";

  const nations = summary.topNationalities.length ? summary.topNationalities.map((entry) => escapeHtml(entry)).join(" · ") : "—";

  return `
    <section class="panel section-panel squad-summary-panel">
      <div class="panel-header-inline">
        <h3>Squad summary</h3>
        <p class="form-hint">${escapeHtml(career.team)} · FIFA ${escapeHtml(String(career.edition))}</p>
      </div>
      <div class="stat-grid">
        <div><span class="stat-label">Players</span><span class="stat-value">${summary.count}</span></div>
        <div><span class="stat-label">Avg OVR</span><span class="stat-value">${summary.avgOverall ?? "—"}</span></div>
        <div><span class="stat-label">Avg POT</span><span class="stat-value">${summary.avgPotential ?? "—"}</span></div>
        <div><span class="stat-label">Best XI OVR</span><span class="stat-value">${summary.best11Overall ?? "—"}</span></div>
        <div><span class="stat-label">Avg age</span><span class="stat-value">${summary.avgAge ?? "—"}</span></div>
        <div><span class="stat-label">Young (&lt;23)</span><span class="stat-value">${summary.youngUnder23Count}</span></div>
        <div><span class="stat-label">Senior (&gt;32)</span><span class="stat-value">${summary.seniorOver32Count}</span></div>
        <div><span class="stat-label">Nations</span><span class="stat-value">${summary.nationalityCount}</span></div>
        <div><span class="stat-label">Squad value</span><span class="stat-value">${summary.totalValue != null ? formatMoney(summary.totalValue) : "—"}</span></div>
      </div>
      <div class="squad-summary-meta">
        <p class="form-hint"><strong>Top players:</strong> ${topPlayers}</p>
        <p class="form-hint"><strong>Top nations:</strong> ${nations}</p>
        <p class="form-hint"><strong>Total weekly wages:</strong> ${summary.totalWage != null ? formatMoney(summary.totalWage) : "—"}</p>
      </div>
    </section>
  `;
}

function renderSortIndicator(sortKey, sortDir, columnKey) {
  if (sortKey !== columnKey) return `<span class="sort-dir sort-dir-muted">↕</span>`;
  return `<span class="sort-dir">${sortDir === "asc" ? "↑" : "↓"}</span>`;
}

function renderSquadTable(players, sortKey, sortDir) {
  if (!players.length) {
    return `<div class="empty-state">No players found for this club in the selected FIFA edition.</div>`;
  }

  const sorted = sortPlayers(players, sortKey, sortDir);
  const header = SORT_COLUMNS.map(
    (column) => `
      <th>
        <button type="button" class="sort-btn" data-sort="${column.key}">
          ${escapeHtml(column.label)} ${renderSortIndicator(sortKey, sortDir, column.key)}
        </button>
      </th>
    `,
  ).join("");

  const rows = sorted
    .map(
      (player) => `
        <tr>
          <td>
            <strong>${escapeHtml(player.name ?? "—")}</strong>
            <span class="table-sub">${escapeHtml(player.fullName ?? "")}</span>
          </td>
          <td>${escapeHtml(player.positions ?? "—")}</td>
          <td><span class="rating">${escapeHtml(String(player.overall ?? "—"))}</span></td>
          <td>${escapeHtml(String(player.potential ?? "—"))}</td>
          <td>${formatMoney(player.value)}</td>
          <td>${formatMoney(player.wage)}</td>
          <td>${player.contract ? escapeHtml(String(player.contract)) : "—"}</td>
          <td>${escapeHtml(player.nationality ?? "—")}</td>
        </tr>
      `,
    )
    .join("");

  return `
    <div class="table-wrap squad-table-wrap">
      <table class="data-table squad-table">
        <thead><tr>${header}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderRosterChangesTab(transactions, currentSeason, allPlayers = []) {
  const options = [
    { value: "signing", label: "Signing" },
    { value: "loan_in", label: "Loan In" },
    { value: "loan_out", label: "Loan Out" },
    { value: "exit", label: "Exit" },
  ];

  const optionsHtml = options
    .map((opt) => `<option value="${opt.value}">${opt.label}</option>`)
    .join("");

  const rows = transactions.length
    ? transactions
        .map((tx) => {
          let badgeColor = "var(--accent)";
          let typeLabel = "Signing";
          if (tx.type === "loan_in") {
            badgeColor = "var(--blue, #3b82f6)";
            typeLabel = "Loan In";
          } else if (tx.type === "loan_out") {
            badgeColor = "var(--orange, #f97316)";
            typeLabel = "Loan Out";
          } else if (tx.type === "exit") {
            badgeColor = "var(--red, #ef4444)";
            typeLabel = "Exit";
          }

          const feeCapsule = tx.fee && tx.fee !== "—"
            ? `<span class="pill" style="background: rgba(124, 227, 168, 0.12); color: var(--accent); border: 1px solid rgba(124, 227, 168, 0.3); font-weight: 600; font-size: 0.8rem; padding: 0.2rem 0.5rem; border-radius: 4px; white-space: nowrap;">${escapeHtml(tx.fee)}</span>`
            : `<span style="color: var(--text-muted);">—</span>`;

          const wageCapsule = tx.wage && tx.wage !== "—"
            ? `<span class="pill" style="background: rgba(212, 175, 55, 0.12); color: var(--gold); border: 1px solid rgba(212, 175, 55, 0.3); font-weight: 600; font-size: 0.8rem; padding: 0.2rem 0.5rem; border-radius: 4px; white-space: nowrap;">${escapeHtml(tx.wage)}</span>`
            : `<span style="color: var(--text-muted);">—</span>`;

          return `
            <tr>
              <td><strong>${escapeHtml(tx.playerName)}</strong></td>
              <td><span class="pill" style="background: ${badgeColor}; color: #fff; font-weight: 600; font-size: 0.75rem;">${typeLabel}</span></td>
              <td>${escapeHtml(tx.details || "—")}</td>
              <td>${feeCapsule}</td>
              <td>${wageCapsule}</td>
              <td>Season ${tx.season}</td>
              <td>
                <button type="button" class="btn btn-sm btn-danger delete-tx-btn" data-tx-id="${tx.id}" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">
                  Delete
                </button>
              </td>
            </tr>
          `;
        })
        .join("")
    : `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">No roster changes logged yet for this career.</td></tr>`;

  return `
    <div class="tab-panel" id="tab-changes" hidden>
      <div style="display: grid; grid-template-columns: 1fr; gap: 1.5rem; margin-top: 1rem;">
        
        <!-- Add Change Form -->
        <section class="panel section-panel">
          <div class="panel-header-inline">
            <h3>Add Roster Change</h3>
            <p class="form-hint">Log a new signing, loan, or exit. Selecting a player from the autocomplete list will autofill their details, fee, and wage.</p>
          </div>
          <form id="add-tx-form" style="position: relative; z-index: 2; display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 1rem; align-items: end; margin-top: 1rem;">
            <div class="form-group" style="position: relative; z-index: 3;">
              ${renderCombobox({
                idPrefix: "tx-player-name",
                label: "Player Name",
                placeholder: "e.g. Lionel Messi",
                required: true,
              })}
            </div>
            <div class="form-group">
              <label for="tx-type">Change Type</label>
              <select id="tx-type" class="form-control" style="width: 100%; height: 38px; background: var(--panel-bg); color: var(--text); border: 1px solid var(--line); border-radius: 6px; padding: 0 0.5rem;">
                ${optionsHtml}
              </select>
            </div>
            <div class="form-group">
              <label for="tx-details">Details</label>
              <input type="text" id="tx-details" class="form-control" placeholder="e.g. Signed from Barcelona" style="width: 100%;" />
            </div>
            <div class="form-group">
              <label for="tx-fee">Transfer Fee</label>
              <input type="text" id="tx-fee" class="form-control" placeholder="e.g. €80M" style="width: 100%;" />
            </div>
            <div class="form-group">
              <label for="tx-wage">Weekly Wage</label>
              <input type="text" id="tx-wage" class="form-control" placeholder="e.g. €200K" style="width: 100%;" />
            </div>
            <div class="form-group" style="max-width: 80px;">
              <label for="tx-season">Season</label>
              <input type="number" id="tx-season" class="form-control" value="${currentSeason}" min="1" required style="width: 100%;" />
            </div>
            <div>
              <button type="submit" class="btn btn-primary" style="height: 38px; width: 100%; font-weight: 600;">Log Change</button>
            </div>
          </form>
        </section>

        <!-- Logged Changes List -->
        <section class="panel section-panel">
          <div class="panel-header-inline">
            <h3>Roster History</h3>
            <p class="form-hint">All logged signs, loans, and exits for this career save.</p>
          </div>
          <div class="table-wrap" style="margin-top: 1rem;">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Type</th>
                  <th>Details</th>
                  <th>Fee</th>
                  <th>Wage</th>
                  <th>Season</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
          </div>
        </section>

      </div>
    </div>
  `;
}


export async function renderSquadInfo({ career }) {
  return renderSectionShell({
    career,
    title: "Squad Info",
    description: "Live squad roster from the dataset — click any column header to sort.",
    content: `
      <div id="squad-info-loading"></div>
      <div id="squad-info-content" hidden></div>
    `,
  });
}

export function bindSquadInfo({ career, scope }) {
  if (!scope?.isActive()) return;

  const loading = document.getElementById("squad-info-loading");
  const content = document.getElementById("squad-info-content");
  if (!assertCareerReady(career, loading)) return;

  let players = [];
  let sortKey = "overall";
  let sortDir = "desc";
  let careerData = { transactions: [], season: 1 };
  let activeTab = "roster";
  let txPlayerCombobox = null;
  let txPlayerLookup = new Map();
  let txSearchTimer = null;
  let txSearchSeq = 0;

  function setupTxPlayerCombobox() {
    const inputEl = document.getElementById("tx-player-name-input");
    if (!inputEl) return;

    // Re-rendering the page will replace the DOM; destroy and recreate to avoid duplicate listeners.
    txPlayerCombobox?.destroy?.();
    txPlayerCombobox = mountCombobox("tx-player-name", {
      items: [],
      selectedValue: "",
      autoSelectSingle: false,
      onSelect: (playerId) => {
        const player = txPlayerLookup.get(playerId);
        if (!player) return;

        const detailsInput = document.getElementById("tx-details");
        const feeInput = document.getElementById("tx-fee");
        const wageInput = document.getElementById("tx-wage");

        if (detailsInput) detailsInput.value = `OVR ${player.overall} · ${player.positions} · ${player.nationality}`;
        if (feeInput) feeInput.value = formatMoney(player.value);
        if (wageInput) wageInput.value = formatMoney(player.wage);
      },
    });

    if (!txPlayerCombobox) return;

    txPlayerLookup = new Map();
    txPlayerCombobox.setStatus("Type at least 2 characters to search players…", "info");

    inputEl.addEventListener("input", () => {
      window.clearTimeout(txSearchTimer);
      txSearchTimer = window.setTimeout(async () => {
        const query = inputEl.value.trim();

        if (query.length < 2) {
          txSearchSeq++;
          txPlayerLookup = new Map();
          txPlayerCombobox.updateItems([], "", { renderList: true });
          txPlayerCombobox.setStatus("Type at least 2 characters to search players…", "info");
          return;
        }

        const seq = ++txSearchSeq;
        txPlayerCombobox.setStatus("Searching…", "loading");

        try {
          const results = await fetchPlayerSearch(career.edition, query, 50);
          if (!scope.isActive() || seq !== txSearchSeq) return;

          const playersFound = Array.isArray(results) ? results : [];
          txPlayerLookup = new Map(playersFound.map((p) => [String(p.id), p]));

          // Label includes club so local filtering still works for queries like "Messi Barcelona".
          const items = playersFound.map((p) => ({
            value: String(p.id),
            label: `${p.name} (${p.club})${p.nationality ? ` · ${p.nationality}` : ""}`,
          }));

          txPlayerCombobox.updateItems(items, "", { renderList: true });
        } catch (e) {
          if (!scope.isActive() || seq !== txSearchSeq) return;
          txPlayerCombobox.setStatus(e?.message ?? "Player search failed.", "error");
          txPlayerLookup = new Map();
          txPlayerCombobox.updateItems([], "", { renderList: true });
        }
      }, 220);
    });
  }

  const paint = () => {
    if (!scope.isActive() || !content) return;
    const summary = computeSquadSummary(players);
    
    const rosterActive = activeTab === "roster" ? " tab-btn-active" : "";
    const changesActive = activeTab === "changes" ? " tab-btn-active" : "";
    
    content.innerHTML = `
      ${renderSummaryPanel(summary, career)}
      
      <div class="tab-row" style="margin-top: 1.5rem; margin-bottom: 1rem;">
        <button type="button" class="tab-btn${rosterActive}" data-squad-tab="roster">Squad Roster</button>
        <button type="button" class="tab-btn${changesActive}" data-squad-tab="changes">Transfer Journal</button>
      </div>

      <div class="tab-panel" id="tab-roster" ${activeTab !== "roster" ? "hidden" : ""}>
        <section class="panel section-panel">
          <div class="panel-header-inline">
            <h3>Roster</h3>
            <p class="form-hint">${players.length} player${players.length === 1 ? "" : "s"} · sorted by ${escapeHtml(sortKey)} (${escapeHtml(sortDir)})</p>
          </div>
          ${renderSquadTable(players, sortKey, sortDir)}
        </section>
      </div>

      ${renderRosterChangesTab(careerData.transactions || [], careerData.season || 1, players)}
    `;

    const tabChanges = document.getElementById("tab-changes");
    if (tabChanges) {
      tabChanges.hidden = activeTab !== "changes";
    }

    setupTxPlayerCombobox();
  };

  content.addEventListener("click", async (event) => {
    // 1) Sort buttons
    const sortButton = event.target.closest("[data-sort]");
    if (sortButton) {
      const nextKey = sortButton.getAttribute("data-sort");
      if (!nextKey) return;

      if (nextKey === sortKey) {
        sortDir = sortDir === "asc" ? "desc" : "asc";
      } else {
        sortKey = nextKey;
        const column = SORT_COLUMNS.find((entry) => entry.key === nextKey);
        sortDir = column?.type === "text" ? "asc" : "desc";
      }
      paint();
      return;
    }

    // 2) Tab buttons
    const tabButton = event.target.closest("[data-squad-tab]");
    if (tabButton) {
      const tab = tabButton.getAttribute("data-squad-tab");
      if (tab) {
        activeTab = tab;
        paint();
      }
      return;
    }

    // 3) Delete transaction button
    const deleteBtn = event.target.closest(".delete-tx-btn");
    if (deleteBtn) {
      const txId = deleteBtn.getAttribute("data-tx-id");
      if (txId && confirm("Are you sure you want to delete this roster change?")) {
        careerData.transactions = (careerData.transactions || []).filter((tx) => tx.id !== txId);
        await updateCareerData(career, { transactions: careerData.transactions });
        paint();
      }
      return;
    }
  });

  content.addEventListener("submit", async (event) => {
    const form = event.target.closest("#add-tx-form");
    if (!form) return;
    event.preventDefault();

    const playerName = document.getElementById("tx-player-name-input")?.value?.trim();
    const type = document.getElementById("tx-type")?.value;
    const details = document.getElementById("tx-details")?.value?.trim();
    const fee = document.getElementById("tx-fee")?.value?.trim();
    const wage = document.getElementById("tx-wage")?.value?.trim();
    const season = Number(document.getElementById("tx-season")?.value || careerData.season || 1);

    if (!playerName) return;

    const newTx = {
      id: createId("tx"),
      playerName,
      type,
      details: details || "—",
      fee: fee || "—",
      wage: wage || "—",
      season,
    };

    careerData.transactions = [...(careerData.transactions || []), newTx];
    await updateCareerData(career, { transactions: careerData.transactions });
    
    // Clear form inputs except season
    const nameInput = document.getElementById("tx-player-name-input");
    if (nameInput) nameInput.value = "";
    const hiddenValue = document.getElementById("tx-player-name-value");
    if (hiddenValue) hiddenValue.value = "";
    const detailsInput = document.getElementById("tx-details");
    if (detailsInput) detailsInput.value = "";
    const feeInput = document.getElementById("tx-fee");
    if (feeInput) feeInput.value = "";
    const wageInput = document.getElementById("tx-wage");
    if (wageInput) wageInput.value = "";

    paint();
  });

  runSectionLoader(
    scope,
    loading,
    async ({ setStep }) => {
      setStep(`Loading ${career.team} squad for FIFA ${career.edition}…`);
      
      const [fetchedPlayers, loadedCareerData] = await Promise.all([
        fetchPlayersByClub(career.edition, career.team),
        loadCareerData(career),
      ]);

      players = fetchedPlayers;
      careerData = loadedCareerData;

      if (!scope.isActive()) return null;

      content.hidden = false;
      loading.style.display = "none";
      paint();
      return { count: players.length };
    },
    {
      message: "Loading squad data…",
      detail: "Fetching players from the backend dataset.",
      step: "Starting…",
    },
  );
}
