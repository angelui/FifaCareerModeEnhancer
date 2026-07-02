import { fetchClubNarrative, fetchSigningSuggestions } from "../api.js";
import { escapeHtml } from "../ui.js";
import { renderLoadComplete, renderLoadingPanel, startLoadTimer } from "../ui/loading.js";
import { assertCareerReady } from "../ui/section-loader.js";
import { searchPlayers } from "../utils/csv.js";
import {
  formatMoney,
  renderPlayerTable,
  renderSectionShell,
  renderStatus,
} from "./section-shell.js";

function renderSuggestionTable(players, { emptyMessage, reasonLabel }) {
  if (!players.length) {
    return `<div class="empty-state">${emptyMessage}</div>`;
  }

  const rows = players
    .map((player) => {
      const meta =
        player.reason === "ex-player"
          ? `Ex-player · last at club FIFA ${player.lastAtClubEdition} · ${player.nationality || "—"}`
          : player.reason === "future-player"
            ? `Future signing · joins FIFA ${player.joinsClubEdition} · ${player.nationality || "—"}`
            : player.reason === "other-player"
              ? `Other signing · ${player.nationality || "—"}`
            : reasonLabel;

      return `
        <tr>
          <td>
            <strong>${escapeHtml(player.name)}</strong>
            <span class="table-sub">${escapeHtml(player.fullName)}</span>
            <span class="table-sub suggestion-reason">${escapeHtml(meta)}</span>
          </td>
          <td>${escapeHtml(player.club)}</td>
          <td>${escapeHtml(player.positions)}</td>
          <td>${escapeHtml(player.nationality || "—")}</td>
          <td>${player.age}</td>
          <td><span class="rating">${player.overall}</span></td>
          <td>${player.potential}</td>
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
            <input
              id="roster-search"
              type="search"
              placeholder="Name, club, nationality..."
              autocomplete="off"
            />
          </label>
          <p id="roster-status" class="status" aria-live="polite">Type at least 2 characters to search.</p>
          <div id="roster-results"></div>
        </div>

        <div id="tab-suggestions" class="tab-panel" hidden>
          <div class="form-grid roster-budget-row">
            <label class="field">
              <span>Max transfer value (€)</span>
              <input
                id="suggestion-budget"
                type="number"
                min="0"
                step="100000"
                placeholder="Filled from generated club budget"
                value=""
              />
            </label>
            <label class="field">
              <span>Max weekly wage (€)</span>
              <input
                id="suggestion-wage"
                type="number"
                min="0"
                step="1000"
                placeholder="Optional"
                value=""
              />
            </label>
            <div class="form-actions">
              <button type="button" id="load-suggestions" class="btn btn-primary">Load suggestions</button>
            </div>
          </div>
          <p id="suggestions-status" class="status" aria-live="polite">
            Open this tab and load suggestions — budget is prefilled from generated club context.
          </p>
          <div id="suggestions-loading" hidden></div>

          <div class="tab-row">
            <button type="button" class="tab-btn tab-btn-active" data-sug-tab="ex">Ex-players</button>
            <button type="button" class="tab-btn" data-sug-tab="future">Future players</button>
            <button type="button" class="tab-btn" data-sug-tab="other">Other players</button>
          </div>

          <div id="sug-tab-ex" class="tab-panel">
            <div id="ex-players-results"></div>
          </div>
          <div id="sug-tab-future" class="tab-panel" hidden>
            <div id="future-players-results"></div>
          </div>
          <div id="sug-tab-other" class="tab-panel" hidden>
            <div id="other-players-results"></div>
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
  const budgetInput = document.getElementById("suggestion-budget");
  const wageInput = document.getElementById("suggestion-wage");

  if (!assertCareerReady(career, suggestionsStatus)) return;

  let searchTimer = null;

  fetchClubNarrative(career.edition, career.team)
    .then((payload) => {
      if (!scope.isActive()) return;
      if (budgetInput && payload.budget?.maxTransfer) {
        budgetInput.value = payload.budget.maxTransfer;
      }
      if (wageInput && payload.budget?.maxWage) {
        wageInput.value = payload.budget.maxWage;
      }
    })
    .catch(() => {
      // Budget field stays editable if narrative is unavailable.
    });

  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.getAttribute("data-tab");
      document.querySelectorAll("[data-tab]").forEach((el) => {
        el.classList.toggle("tab-btn-active", el.getAttribute("data-tab") === tab);
      });
      document.getElementById("tab-search").hidden = tab !== "search";
      document.getElementById("tab-suggestions").hidden = tab !== "suggestions";
    });
  });

  document.querySelectorAll("[data-sug-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.getAttribute("data-sug-tab");
      document.querySelectorAll("[data-sug-tab]").forEach((el) => {
        el.classList.toggle("tab-btn-active", el.getAttribute("data-sug-tab") === tab);
      });
      document.getElementById("sug-tab-ex").hidden = tab !== "ex";
      document.getElementById("sug-tab-future").hidden = tab !== "future";
      document.getElementById("sug-tab-other").hidden = tab !== "other";
    });
  });

  const runSearch = async () => {
    const query = input.value.trim();

    if (query.length < 2) {
      status.textContent = "Type at least 2 characters to search.";
      results.innerHTML = "";
      return;
    }

    status.textContent = "Searching...";
    results.innerHTML = "";

    try {
      const players = await searchPlayers(null, config.playerColumns, query, 50, career.edition);
      if (!scope.isActive()) return;
      status.textContent = `${players.length} result${players.length === 1 ? "" : "s"} for "${query}".`;
      results.innerHTML = renderPlayerTable(players, { highlightClub: career.team });
    } catch (error) {
      if (!scope.isActive()) return;
      status.textContent = error.message;
    }
  };

  input?.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(runSearch, 220);
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

    const timer = startLoadTimer(loadingBox);
    const maxValue = Number(budgetInput?.value);
    const maxWage = Number(wageInput?.value);
    const params = Number.isFinite(maxValue) && maxValue > 0 ? maxValue : null;
    const wageParams = Number.isFinite(maxWage) && maxWage > 0 ? maxWage : null;

    try {
      timer.setStep("Filtering by transfer value and wage…");
      const payload = await fetchSigningSuggestions(career.edition, career.team, params, wageParams);
      if (!scope.isActive()) return;

      const exPlayers = payload.exPlayers ?? [];
      const futurePlayers = payload.futurePlayers ?? [];
      const otherPlayers = payload.otherPlayers ?? [];
      timer.stop();

      if (loadingBox) {
        loadingBox.innerHTML = renderLoadComplete("Suggestions ready", {
          detail: `${exPlayers.length} ex-players · ${futurePlayers.length} future players · ${otherPlayers.length} other players${
            params ? ` within €${params.toLocaleString()} transfer value` : ""
          }${wageParams ? ` and €${wageParams.toLocaleString()} wage` : ""}`,
        });
      }

      exResults.innerHTML = renderSuggestionTable(exPlayers, {
        emptyMessage: "No ex-players matched your budget in the current edition.",
        reasonLabel: "Ex-player",
      });
      futureResults.innerHTML = renderSuggestionTable(futurePlayers, {
        emptyMessage: "No future club signings found in later FIFA editions.",
        reasonLabel: "Future player",
      });
      otherResults.innerHTML = renderSuggestionTable(otherPlayers, {
        emptyMessage: "No other players matched your value/wage filters in the current edition.",
        reasonLabel: "Other player",
      });
    } catch (error) {
      if (!scope.isActive()) return;
      timer.stop();
      if (loadingBox) {
        loadingBox.innerHTML = renderLoadComplete(error.message, { variant: "error" });
      }
    }
  });
}
