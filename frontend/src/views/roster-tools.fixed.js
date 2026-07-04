import { fetchClubNarrative, fetchSigningSuggestions, fetchClubArchive } from "../api.js";
import { escapeHtml } from "../ui.js";
import { renderLoadComplete, renderLoadingPanel, startLoadTimer } from "../ui/loading.js";
import { assertCareerReady } from "../ui/section-loader.js";
import { searchPlayers } from "../utils/csv.js";
import {
  formatMoney,
  renderPlayerTable,
  renderSectionShell,
} from "./section-shell.js";

const NATIONAL_TEAM_CLUB_KEYS = new Set([
  "brazil",
  "cotedivoire",
  "ctedivoire",
  "czechrepublic",
  "ivorycoast",
]);

function normalizeClubKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

function isFreeAgentPlayer(player) {
  const clubName = String(player.sourceClub || player.club || "").toLowerCase();
  const isCountry = 
    clubName.includes("brazil") || 
    clubName.includes("ivoire") || 
    clubName.includes("ivory") || 
    clubName.includes("cote") || 
    clubName.includes("cted") || 
    clubName.includes("czech");

  const clubKey = normalizeClubKey(player.sourceClub || player.club);
  return (
    Boolean(player.isFreeAgent) ||
    isCountry ||
    NATIONAL_TEAM_CLUB_KEYS.has(clubKey) ||
    !(Number.isFinite(Number(player.value)) && Number.isFinite(Number(player.wage)))
  );
}

function renderSuggestionTable(players, { emptyMessage, reasonLabel } = {}) {
  if (!players || !players.length) {
    return `<div class="empty-state">${emptyMessage ?? "No players."}</div>`;
  }

  const rows = players
    .map((player) => {
      const currentClub = isFreeAgentPlayer(player) ? "Free agent" : player.club;
      const meta =
        player.customReason
          ? player.customReason
          : player.reason === "ex-player"
          ? `Ex-player · last at club FIFA ${player.lastAtClubEdition} · ${player.nationality || "—"}`
          : player.reason === "future-player"
          ? `Future signing · joins FIFA ${player.joinsClubEdition} · ${player.nationality || "—"}`
          : player.reason === "other-player"
          ? `Other signing · ${player.nationality || "—"}`
          : reasonLabel ?? "";

      return `
        <tr>
          <td>
            <strong>${escapeHtml(player.name)}</strong>
            <span class="table-sub">${escapeHtml(player.fullName)}</span>
            <span class="table-sub suggestion-reason">${escapeHtml(meta)}</span>
          </td>
          <td>${escapeHtml(currentClub)}</td>
          <td>${escapeHtml(player.positions)}</td>
          <td>${escapeHtml(player.nationality || "—")}</td>
          <td>${escapeHtml(String(player.age ?? "—"))}</td>
          <td><span class="rating">${escapeHtml(String(player.overall ?? "—"))}</span></td>
          <td>${escapeHtml(String(player.potential ?? "—"))}</td>
          <td>${formatMoney(player.value)}</td>
          <td>${formatMoney(player.wage)}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Player</th>
            <th>Current club</th>
            <th>Positions</th>
            <th>Nationality</th>
            <th>Age</th>
            <th>OVR</th>
            <th>POT</th>
            <th>Value</th>
            <th>Wage</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

export async function renderRosterTools({ config, career }) {
  return renderSectionShell({
    career,
    title: "Roster Tools",
    description: "Search players and explore signing suggestions that fit your club.",
    content: `
      <section class="panel section-panel roster-panel">
        <div class="tab-row">
          <button type="button" class="tab-btn tab-btn-active" data-tab="search">Player search</button>
          <button type="button" class="tab-btn" data-tab="suggestions">Signing suggestions</button>
        </div>

        <div id="tab-search" class="tab-panel">
          <label class="field">
            <span>Player search · FIFA ${career.edition}</span>
            <input id="roster-search" type="search" placeholder="Name, club, nationality..." autocomplete="off" />
          </label>
          <p id="roster-status" class="status" aria-live="polite">Type at least 2 characters to search.</p>
          <div id="roster-results"></div>
        </div>

        <div id="tab-suggestions" class="tab-panel" hidden>
          <section id="nationality-breakdown" class="panel section-panel" style="margin-bottom:1rem;">
            <h3>Nationality breakdown (all editions)</h3>
            <div id="nationality-breakdown-body" class="form-hint">Load suggestions to view nationality counts per edition.</div>
          </section>

          <div class="form-grid roster-budget-row" style="grid-template-columns: repeat(4, minmax(0, 1fr));">
            <label class="field">
              <span>Max transfer value (€)</span>
              <input id="suggestion-budget" type="number" min="0" step="100000" placeholder="Filled from generated club budget" value="" />
            </label>
            <label class="field">
              <span>Max weekly wage (€)</span>
              <input id="suggestion-wage" type="number" min="0" step="1000" placeholder="Optional" value="" />
            </label>
            <label class="field">
              <span>Position search</span>
              <input id="suggestion-position-search" type="search" placeholder="e.g. ST, CAM, CB" autocomplete="off" />
            </label>
            <div class="form-actions">
              <button type="button" id="load-suggestions" class="btn btn-primary">Load suggestions</button>
            </div>
          </div>
          <p id="suggestions-status" class="status" aria-live="polite">Open this tab and load suggestions — budget is prefilled from generated club context.</p>
          <div id="suggestions-loading" hidden></div>

          <div class="form-grid" style="align-items:center; margin-top:0.5rem;">
            <label class="field field-inline">
              <span>Exclude free agents</span>
              <input id="exclude-free-agents" type="checkbox" />
            </label>
            <div class="form-hint" style="margin-top:0.25rem; grid-column: 1 / -1;">Toggle to remove players with missing price/wage (free agents) from "Other players".</div>
          </div>

          <div class="tab-row">
            <button type="button" class="tab-btn tab-btn-active" data-sug-tab="ex">Ex-players</button>
            <button type="button" class="tab-btn" data-sug-tab="future">Future players</button>
            <button type="button" class="tab-btn" data-sug-tab="other">Other players</button>
          </div>

          <section id="special-suggestions" class="panel section-panel" style="margin-top:1rem;">
            <div class="panel-header-inline">
              <h3 id="special-suggestions-title">Special suggestions</h3>
              <p id="special-suggestions-hint" class="form-hint">Players selected based on your club's dominant nationalities.</p>
            </div>
            <div id="special-suggestions-body"></div>
          </section>

          <div id="tab-suggestions-results">
            <div id="sug-tab-ex" class="tab-panel"><div id="ex-players-results"></div></div>
            <div id="sug-tab-future" class="tab-panel" hidden><div id="future-players-results"></div></div>
            <div id="sug-tab-other" class="tab-panel" hidden>
              <div id="other-players-results"></div>
            </div>
          </div>
        </div>
      </section>
    `,
  });
}

export function bindRosterTools({ config, career, scope }) {
  if (!scope?.isActive()) return;

  const input = document.getElementById("roster-search");
  const status = document.getElementById("roster-status");
  const results = document.getElementById("roster-results");
  const suggestionsStatus = document.getElementById("suggestions-status");
  const exResults = document.getElementById("ex-players-results");
  const futureResults = document.getElementById("future-players-results");
  const otherResults = document.getElementById("other-players-results");
  const excludeFreeAgentsCheckbox = document.getElementById("exclude-free-agents");
  const suggestionPositionSearchInput = document.getElementById("suggestion-position-search");
  const nationalityBreakdownBody = document.getElementById("nationality-breakdown-body");
  const specialSuggestionsBody = document.getElementById("special-suggestions-body");
  const budgetInput = document.getElementById("suggestion-budget");
  const wageInput = document.getElementById("suggestion-wage");

  if (!assertCareerReady(career, suggestionsStatus)) return;

  let lastExPlayers = [];
  let lastFuturePlayers = [];
  let lastOtherPlayers = [];
  let lastTimeline = [];
  let excludeFreeAgents = false;
  let positionSearchQuery = "";
  let activeSugTab = "ex";

  const matchesPositionFilter = (player) => {
    if (!positionSearchQuery) return true;
    return String(player.positions || "").toLowerCase().includes(positionSearchQuery);
  };

  const renderEx = () => {
    const filtered = lastExPlayers.filter(matchesPositionFilter);
    exResults.innerHTML = renderSuggestionTable(filtered, {
      emptyMessage: "No ex-players matched your filters in the current edition.",
      reasonLabel: "Ex-player",
    });
  };

  const renderFuture = () => {
    const filtered = lastFuturePlayers.filter(matchesPositionFilter);
    futureResults.innerHTML = renderSuggestionTable(filtered, {
      emptyMessage: "No future club signings matched your filters.",
      reasonLabel: "Future player",
    });
  };

  const renderOther = () => {
    const filtered = lastOtherPlayers.filter((player) => {
      return (!excludeFreeAgents || !isFreeAgentPlayer(player)) && matchesPositionFilter(player);
    });
    otherResults.innerHTML = renderSuggestionTable(filtered, {
      emptyMessage: "No other players matched your value/wage filters in the current edition.",
      reasonLabel: "Other player",
    });
  };

  const renderSpecial = () => {
    if (!lastTimeline || !lastTimeline.length) {
      specialSuggestionsBody.innerHTML = '<p class="form-hint">Load suggestions to compute special suggestions.</p>';
      return;
    }

    // Update title and hint based on active sub-tab
    const titleEl = document.getElementById("special-suggestions-title");
    const hintEl = document.getElementById("special-suggestions-hint");
    if (titleEl && hintEl) {
      if (activeSugTab === "ex") {
        titleEl.textContent = "Special suggestions (Ex-players)";
        hintEl.textContent = "Ex-players selected and scored based on your club's dominant nationalities and historical connection.";
      } else if (activeSugTab === "future") {
        titleEl.textContent = "Special suggestions (Future signings)";
        hintEl.textContent = "Future signings selected and scored based on your club's dominant nationalities and connection.";
      } else {
        titleEl.textContent = "Special suggestions (Other signings)";
        hintEl.textContent = "Other players selected and scored based on your club's dominant nationalities.";
      }
    }

    // Collect candidates based on the active sub-tab
    const allCandidates = [];
    if (activeSugTab === "ex") {
      lastExPlayers.forEach(p => {
        allCandidates.push({ ...p, sourceList: "ex" });
      });
    } else if (activeSugTab === "future") {
      lastFuturePlayers.forEach(p => {
        allCandidates.push({ ...p, sourceList: "future" });
      });
    } else if (activeSugTab === "other") {
      lastOtherPlayers.forEach(p => {
        allCandidates.push({ ...p, sourceList: "other" });
      });
    }

    const uniqueCandidatesMap = new Map();
    allCandidates.forEach(p => {
      const id = p.id || p.sofifa_id;
      if (!id) return;
      if (!uniqueCandidatesMap.has(id)) {
        uniqueCandidatesMap.set(id, p);
      } else {
        const existing = uniqueCandidatesMap.get(id);
        // Prefer ex or future over other
        if (p.sourceList !== "other" && existing.sourceList === "other") {
          uniqueCandidatesMap.set(id, p);
        }
      }
    });

    let candidates = Array.from(uniqueCandidatesMap.values());

    // Filter by position search query
    candidates = candidates.filter(matchesPositionFilter);

    // Filter by exclude free agents if checked
    if (excludeFreeAgents) {
      candidates = candidates.filter(p => !isFreeAgentPlayer(p));
    }

    // Compute historical nationality counts from timeline
    const historicalNats = {};
    let totalHistoricalPlayers = 0;
    lastTimeline.forEach(entry => {
      const counts = entry.summary?.nationalityCounts ?? {};
      for (const [nat, count] of Object.entries(counts)) {
        historicalNats[nat] = (historicalNats[nat] || 0) + count;
        totalHistoricalPlayers += count;
      }
    });

    const currentEntry = lastTimeline.find((entry) => Number(entry.edition) === Number(career.edition));
    const dominantNats = currentEntry?.summary?.dominantNationalities ?? [];

    const scoredCandidates = candidates.map(player => {
      let score = 0;

      // 1. Overall rating contribution
      const ovr = Number(player.overall) || 0;
      score += ovr * 2; // base score from overall

      // 2. Potential contribution
      const pot = Number(player.potential) || 0;
      score += (pot - ovr) * 1.5; // bonus for growth potential

      // 3. Nationality contribution
      const nat = player.nationality;
      if (nat) {
        // Current dominant nationality bonus
        if (dominantNats.includes(nat)) {
          score += 30; // Strong bonus for current dominant nationality
        }
        // Historical nationality bonus
        const histCount = historicalNats[nat] || 0;
        if (histCount > 0 && totalHistoricalPlayers > 0) {
          score += (histCount / totalHistoricalPlayers) * 50; // Up to 50 points bonus for highly historical nationalities
        }
      }

      // 4. Club history connection bonus
      if (player.sourceList === "ex") {
        score += 25; // Ex-players have club history
      } else if (player.sourceList === "future") {
        score += 20; // Future signings also have connection
      }

      return { player, score };
    });

    // Sort by score descending
    scoredCandidates.sort((a, b) => b.score - a.score);

    // Select top 5, ensuring no more than 3 from the same nation
    const selected = [];
    const nationCounts = {};

    for (const item of scoredCandidates) {
      if (selected.length >= 5) break;
      const nat = item.player.nationality || "Unknown";
      const currentNatCount = nationCounts[nat] || 0;
      if (currentNatCount < 3) {
        // Calculate fit percentage based on a sensible max score of 300
        const fitPercentage = Math.min(100, Math.max(50, Math.round((item.score / 300) * 100)));
        
        // Create custom reason
        let customReason = "";
        if (item.player.sourceList === "ex") {
          customReason = `Special suggestion · Ex-player · ${item.player.nationality || "—"} · ${fitPercentage}% fit`;
        } else if (item.player.sourceList === "future") {
          customReason = `Special suggestion · Future signing · ${item.player.nationality || "—"} · ${fitPercentage}% fit`;
        } else {
          customReason = `Special suggestion · Dominant nationality · ${item.player.nationality || "—"} · ${fitPercentage}% fit`;
        }
        
        selected.push({
          ...item.player,
          customReason
        });
        nationCounts[nat] = currentNatCount + 1;
      }
    }

    // Render the selected 5 players
    specialSuggestionsBody.innerHTML = renderSuggestionTable(selected, {
      emptyMessage: "No special suggestions available.",
      reasonLabel: "Special suggestion",
    });
  };

  const renderAllSuggestions = () => {
    renderEx();
    renderFuture();
    renderOther();
    renderSpecial();
  };

  fetchClubNarrative(career.edition, career.team)
    .then((payload) => {
      if (!scope.isActive()) return;
      if (budgetInput && payload.budget?.maxTransfer) budgetInput.value = payload.budget.maxTransfer;
      if (wageInput && payload.budget?.maxWage) wageInput.value = payload.budget.maxWage;
    })
    .catch(() => {});

  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.getAttribute("data-tab");
      document.querySelectorAll("[data-tab]").forEach((el) => el.classList.toggle("tab-btn-active", el.getAttribute("data-tab") === tab));
      document.getElementById("tab-search").hidden = tab !== "search";
      document.getElementById("tab-suggestions").hidden = tab !== "suggestions";
    });
  });

  document.querySelectorAll("[data-sug-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.getAttribute("data-sug-tab");
      activeSugTab = tab;
      document.querySelectorAll("[data-sug-tab]").forEach((el) => el.classList.toggle("tab-btn-active", el.getAttribute("data-sug-tab") === tab));
      document.getElementById("sug-tab-ex").hidden = tab !== "ex";
      document.getElementById("sug-tab-future").hidden = tab !== "future";
      document.getElementById("sug-tab-other").hidden = tab !== "other";
      renderSpecial();
    });
  });

  input?.addEventListener("input", () => {
    const q = input.value.trim();
    if (q.length < 2) {
      status.textContent = "Type at least 2 characters to search.";
      results.innerHTML = "";
      return;
    }
    status.textContent = "Searching...";
    results.innerHTML = "";
    searchPlayers(null, config.playerColumns, q, 50, career.edition)
      .then((players) => {
        if (!scope.isActive()) return;
        status.textContent = `${players.length} result${players.length === 1 ? "" : "s"} for "${q}".`;
        results.innerHTML = renderPlayerTable(players, { highlightClub: career.team });
      })
      .catch((err) => {
        if (!scope.isActive()) return;
        status.textContent = err.message || String(err);
      });
  });

  document.getElementById("load-suggestions")?.addEventListener("click", async () => {
    const loadingBox = document.getElementById("suggestions-loading");
    if (loadingBox) {
      loadingBox.hidden = false;
      loadingBox.innerHTML = renderLoadingPanel("Computing signing suggestions…", {
        detail: "Scanning ex-players, future arrivals, and other value+fit signings.",
        step: "Matching sofifa_id across datasets…",
      });
    }
    suggestionsStatus.textContent = "";
    exResults.innerHTML = "";
    futureResults.innerHTML = "";
    otherResults.innerHTML = "";
    lastTimeline = [];
    specialSuggestionsBody.innerHTML = "";

    const timer = startLoadTimer(loadingBox);
    const maxValue = Number(budgetInput?.value);
    const maxWage = Number(wageInput?.value);
    const params = Number.isFinite(maxValue) && maxValue > 0 ? maxValue : null;
    const wageParams = Number.isFinite(maxWage) && maxWage > 0 ? maxWage : null;
    positionSearchQuery = suggestionPositionSearchInput?.value.trim().toLowerCase() ?? "";

    try {
      timer.setStep("Filtering by transfer value, wage, and position…");
      const payload = await fetchSigningSuggestions(
        career.edition,
        career.team,
        params,
        wageParams,
        40,
        positionSearchQuery || null,
      );
      if (!scope.isActive()) return;

      lastExPlayers = payload.exPlayers ?? [];
      lastFuturePlayers = payload.futurePlayers ?? [];
      lastOtherPlayers = payload.otherPlayers ?? [];
      timer.stop();

      if (loadingBox) {
        loadingBox.innerHTML = renderLoadComplete("Suggestions ready", {
          detail: `${lastExPlayers.length} ex-players · ${lastFuturePlayers.length} future players · ${lastOtherPlayers.length} other players${
            params ? ` within €${params.toLocaleString()} transfer value` : ""
          }${wageParams ? ` and €${wageParams.toLocaleString()} wage` : ""}${
            positionSearchQuery ? ` · position ${positionSearchQuery.toUpperCase()}` : ""
          }`,
        });
      }

      renderAllSuggestions();

      try {
        const archive = await fetchClubArchive(career.team);
        if (!scope.isActive()) return;
        const timeline = archive.timeline ?? [];
        if (!timeline.length) {
          nationalityBreakdownBody.textContent = "No archive data available.";
        } else {
          const rows = timeline
            .map((entry) => {
              const counts = entry.summary?.nationalityCounts ?? {};
              const top = Object.entries(counts)
                .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], undefined, { sensitivity: "base" }))
                .slice(0, 3)
                .map(([nat, count]) => `${escapeHtml(nat)} (${count})`)
                .join(" · ");
              return `<div><strong>FIFA ${entry.edition}</strong>: ${top || "—"}</div>`;
            })
            .join("");
          nationalityBreakdownBody.innerHTML = rows;
        }

        lastTimeline = timeline;
        renderSpecial();
      } catch {
        nationalityBreakdownBody.textContent = "Could not load nationality breakdown.";
        specialSuggestionsBody.innerHTML = '<p class="form-hint">Could not compute special suggestions.</p>';
      }
    } catch (error) {
      if (!scope.isActive()) return;
      timer.stop();
      if (loadingBox) {
        loadingBox.innerHTML = renderLoadComplete(error.message, { variant: "error" });
      }
    }
  });

  excludeFreeAgentsCheckbox?.addEventListener("change", () => {
    excludeFreeAgents = Boolean(excludeFreeAgentsCheckbox.checked);
    renderOther();
    renderSpecial();
  });

  suggestionPositionSearchInput?.addEventListener("input", () => {
    positionSearchQuery = suggestionPositionSearchInput.value.trim().toLowerCase();
    renderAllSuggestions();
  });
}
