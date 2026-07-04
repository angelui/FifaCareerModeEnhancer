import { loadClubsFromPlayersCsv } from "../utils/csv.js";
import { getCachedClubs } from "../data-cache.js";
import { saveCareer } from "../state.js";
import { navigate } from "../router.js";
import { escapeHtml, icon } from "../ui.js";
import { formatLoadError, mountCombobox, renderCombobox } from "../ui/combobox.js";
import {
  fetchCareerSaveProfiles,
  fetchCareerSaves,
  fetchHealth,
  saveCareerSaveState,
  fetchRandomClub,
  fetchRandomPlayer,
} from "../api.js";
import { bindClubArchive } from "./club-archive.js";
import { renderClubPicker, formatMoney } from "./section-shell.js";

const SETUP_RESTORE_KEY = "fcm-setup-restore";

function saveSetupRandomRestore(payload) {
  try {
    sessionStorage.setItem(SETUP_RESTORE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage errors
  }
}

function consumeSetupRandomRestore() {
  try {
    const raw = sessionStorage.getItem(SETUP_RESTORE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(SETUP_RESTORE_KEY);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function renderShell(config, content) {
  return `
    <div class="page setup-page">
      <div class="ambient ambient-a"></div>
      <div class="ambient ambient-b"></div>
      <header class="hero">
        <p class="eyebrow">Offline career companion</p>
        <h1>${escapeHtml(config.appName)}</h1>
        <p class="lead">${escapeHtml(config.tagline)}</p>
      </header>
      ${content}
    </div>
  `;
}

function renderSetupActions(config) {
  return config.setupActions
    .map(
      (action) => `
        <button
          type="button"
          class="setup-action"
          data-nav="section"
          data-nav-params="id,origin"
          data-id="${escapeHtml(action.id)}"
          data-origin="setup"
        >
          <span class="setup-action-icon">${icon(action.icon ?? "archive")}</span>
          <span>
            <strong>${escapeHtml(action.label)}</strong>
            <small>${escapeHtml(action.description)}</small>
          </span>
        </button>
      `,
    )
    .join("");
}


function renderRandomClubInfo(data) {
  const { club, edition, league, best11Overall, nationalityCounts, topPlayers, prospects, seniors } = data;

  const sortedNations = Object.entries(nationalityCounts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8);
  const moreNationsCount = Math.max(0, Object.keys(nationalityCounts).length - 8);
  const nationsHtml = sortedNations
    .map(([nation, count]) => `<span class="pill pill-muted">${escapeHtml(nation)} (${count})</span>`)
    .join(" ");
  const moreNationsHtml = moreNationsCount ? `<span class="pill pill-muted">+${moreNationsCount} more</span>` : "";

  const topPlayersHtml = topPlayers
    .map(p => `
      <li style="display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid var(--line);">
        <span><strong>${escapeHtml(p.name)}</strong> <small style="color: var(--text-muted);">${escapeHtml(p.positions)}</small></span>
        <span><span class="rating">${p.overall}</span> OVR</span>
      </li>
    `).join("");

  const prospectsHtml = prospects.length ? prospects
    .map(p => `
      <li style="display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid var(--line);">
        <span><strong>${escapeHtml(p.name)}</strong> <small style="color: var(--text-muted);">${escapeHtml(p.positions)} (Age ${p.age})</small></span>
        <span><span class="rating">${p.overall}</span> OVR · <span style="color: var(--accent);">${p.potential}</span> POT</span>
      </li>
    `).join("") : `<p class="status status-muted">No prospects under 23 found.</p>`;

  const seniorsHtml = seniors.length ? seniors
    .map(p => `
      <li style="display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid var(--line);">
        <span><strong>${escapeHtml(p.name)}</strong> <small style="color: var(--text-muted);">${escapeHtml(p.positions)} (Age ${p.age})</small></span>
        <span><span class="rating">${p.overall}</span> OVR</span>
      </li>
    `).join("") : `<p class="status status-muted">No senior players found.</p>`;

  return `
    <div class="panel section-panel" style="animation: setup-fade-in 0.3s ease-out; margin-top: 1.5rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--line); padding-bottom: 1rem; margin-bottom: 1rem;">
        <div>
          <h3 style="margin: 0; font-size: 1.5rem; color: var(--accent);">${escapeHtml(club)}</h3>
          <p style="margin: 0.25rem 0 0; color: var(--text-muted);">FIFA ${edition} Dataset · ${escapeHtml(league ?? "Unknown")}</p>
        </div>
        <div style="text-align: right;">
          <span class="stat-label" style="display: block; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted);">Best XI OVR</span>
          <span class="stat-value" style="font-size: 2rem; font-weight: bold; color: var(--gold);">${best11Overall}</span>
        </div>
      </div>

      <div style="margin-bottom: 1.5rem;">
        <h4 style="margin: 0 0 0.5rem; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted);">Squad Nationalities</h4>
        <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
          ${nationsHtml}
          ${moreNationsHtml}
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr; gap: 1.5rem; margin-bottom: 1.5rem;">
        <div>
          <h4 style="margin: 0 0 0.5rem; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); display: flex; align-items: center; gap: 0.5rem;">
            ${icon("shield", "icon-inline")} Key Players (Top 3)
          </h4>
          <ul style="list-style: none; padding: 0; margin: 0;">
            ${topPlayersHtml}
          </ul>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 1.5rem;">
        <div>
          <h4 style="margin: 0 0 0.5rem; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); display: flex; align-items: center; gap: 0.5rem;">
            ${icon("target", "icon-inline")} Prospects (Under 23)
          </h4>
          <ul style="list-style: none; padding: 0; margin: 0;">
            ${prospectsHtml}
          </ul>
        </div>
        <div>
          <h4 style="margin: 0 0 0.5rem; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); display: flex; align-items: center; gap: 0.5rem;">
            ${icon("users", "icon-inline")} Senior Leaders
          </h4>
          <ul style="list-style: none; padding: 0; margin: 0;">
            ${seniorsHtml}
          </ul>
        </div>
      </div>

      <div style="display: flex; gap: 1rem; border-top: 1px solid var(--line); padding-top: 1rem; margin-top: 1rem;">
        <button type="button" class="btn btn-ghost" id="random-club-inspect-btn" style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
          ${icon("archive", "icon-inline")} View in Club Archive
        </button>
        <button type="button" class="btn btn-primary" id="random-club-select-btn" style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
          ${icon("arrow", "icon-inline")} Select for Career
        </button>
      </div>
    </div>
  `;
}


function renderRandomPlayerInfo(player) {
  const { name, fullName, club, overall, potential, value, wage, positions, nationality, age, isGoalkeeper, stats } = player;

  const statBars = Object.entries(stats)
    .map(([key, val]) => {
      const label = key.replace("gk_", "GK ").replace("_", " ").toUpperCase();
      let ratingColor = "#ff4d4d";
      if (val >= 80) ratingColor = "var(--accent-strong)";
      else if (val >= 70) ratingColor = "var(--accent)";
      else if (val >= 60) ratingColor = "var(--gold)";
      else if (val >= 50) ratingColor = "#ffa64d";

      return `
        <div style="margin-bottom: 0.75rem;">
          <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 0.25rem;">
            <span style="font-weight: 600; color: var(--text-muted);">${escapeHtml(label)}</span>
            <span style="font-weight: bold; color: ${ratingColor};">${val}</span>
          </div>
          <div style="height: 8px; background: var(--bg-soft); border-radius: 4px; overflow: hidden; border: 1px solid var(--line);">
            <div style="height: 100%; width: ${val}%; background: ${ratingColor}; border-radius: 4px; transition: width 0.6s ease-out;"></div>
          </div>
        </div>
      `;
    }).join("");

  return `
    <div class="panel section-panel" style="animation: setup-fade-in 0.3s ease-out; margin-top: 1.5rem;">
      <div style="display: grid; grid-template-columns: 1fr; gap: 1.5rem;">
        <div style="display: flex; gap: 1.5rem; border-bottom: 1px solid var(--line); padding-bottom: 1.25rem; align-items: center; flex-wrap: wrap;">
          <div style="width: 72px; height: 72px; background: var(--bg-soft); border: 2px solid var(--gold); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.75rem; font-weight: bold; color: var(--gold);">
            ${overall}
          </div>
          <div style="flex: 1; min-width: 200px;">
            <h3 style="margin: 0; font-size: 1.5rem; color: var(--text);">${escapeHtml(name)}</h3>
            <p style="margin: 0.15rem 0 0.5rem; font-size: 0.9rem; color: var(--text-muted);">${escapeHtml(fullName)}</p>
            <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
              <span class="pill">${escapeHtml(positions)}</span>
              <span class="pill pill-muted">${escapeHtml(nationality)}</span>
              <span class="pill pill-muted">Age ${age}</span>
            </div>
          </div>
          <div style="text-align: right; min-width: 120px;">
            <p style="margin: 0; font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase;">Potential</p>
            <p style="margin: 0; font-size: 1.5rem; font-weight: bold; color: var(--accent);">${potential} POT</p>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1.2fr; gap: 2rem; align-items: start; flex-wrap: wrap;">
          <div style="display: grid; gap: 1.25rem;">
            <div>
              <h4 style="margin: 0 0 0.25rem; font-size: 0.8rem; text-transform: uppercase; color: var(--text-muted);">Current Club</h4>
              <p style="margin: 0; font-size: 1.15rem; font-weight: 600; color: var(--accent);">${escapeHtml(club || "Free Agent")}</p>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
              <div>
                <h4 style="margin: 0 0 0.25rem; font-size: 0.8rem; text-transform: uppercase; color: var(--text-muted);">Value</h4>
                <p style="margin: 0; font-size: 1.15rem; font-weight: 600; color: var(--gold);">${formatMoney(value)}</p>
              </div>
              <div>
                <h4 style="margin: 0 0 0.25rem; font-size: 0.8rem; text-transform: uppercase; color: var(--text-muted);">Weekly Wage</h4>
                <p style="margin: 0; font-size: 1.15rem; font-weight: 600; color: var(--gold);">${formatMoney(wage)}</p>
              </div>
            </div>
            <div style="border-top: 1px solid var(--line); padding-top: 1rem; margin-top: 0.5rem;">
              <button type="button" class="btn btn-ghost" id="random-player-club-inspect-btn" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 0.5rem;" ${club ? "" : "disabled"}>
                ${icon("shield", "icon-inline")} Inspect ${escapeHtml(club || "Club")}
              </button>
            </div>
          </div>

          <div>
            <h4 style="margin: 0 0 1rem; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); display: flex; align-items: center; justify-content: space-between;">
              <span>Key Attributes</span>
              <span style="font-size: 0.75rem; font-weight: normal; text-transform: none; color: var(--text-muted);">${isGoalkeeper ? "Goalkeeper Stats" : "Outfield Stats"}</span>
            </h4>
            ${statBars}
          </div>
        </div>
      </div>
    </div>
  `;
}


function formatSaveDate(iso) {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function renderSavedCareerCard(save, activeCareer) {
  const isActive =
    Number(activeCareer?.edition) === Number(save.edition) &&
    activeCareer?.team === save.team &&
    (activeCareer?.profileName ?? "Default") === (save.profileName ?? "Default");

  const updatedLabel = formatSaveDate(save.updatedAt);
  const metaParts = [
    `FIFA ${save.edition}`,
    save.profileName && save.profileName !== "Default" ? save.profileName : null,
    save.season > 1 ? `Season ${save.season}` : null,
    updatedLabel ? `Updated ${updatedLabel}` : null,
  ].filter(Boolean);

  return `
    <button
      type="button"
      class="saved-career-card${isActive ? " is-active" : ""}"
      data-edition="${save.edition}"
      data-team="${escapeHtml(save.team)}"
      data-profile-name="${escapeHtml(save.profileName ?? "Default")}"
    >
      <span class="saved-career-icon">${icon("shield", "icon-inline")}</span>
      <span class="saved-career-body">
        <strong>${escapeHtml(save.team)}</strong>
        <span>${escapeHtml(metaParts.join(" · "))}</span>
      </span>
      <span class="saved-career-arrow">${icon("arrow", "icon-inline")}</span>
    </button>
  `;
}

function renderSavedCareersPanel() {
  return `
    <section id="saved-careers-panel" class="panel setup-panel setup-saved-careers">
      <div class="panel-header">
        <h2>Your saved careers</h2>
        <p>Continue a career you started before.</p>
      </div>
      <div id="saved-careers-list" class="saved-careers-list">
        <p class="form-hint">Loading saved careers…</p>
      </div>
    </section>
  `;
}


export async function renderSetup({ config, career }) {
  const editionOptions = config.editions
    .map(
      (edition) =>
        `<option value="${edition}" ${Number(career.edition) === Number(edition) ? "selected" : ""}>FIFA ${edition}</option>`,
    )
    .join("");

  const hasEdition = Number(career.edition) > 0;

  const html = renderShell(
    config,
    `
      <div class="setup-container">
        <aside class="setup-sidebar">
          <button type="button" id="menu-btn-career" class="setup-menu-btn active">
            ${icon("arrow", "icon-inline")} Start your Career
          </button>
          <button type="button" id="menu-btn-archive" class="setup-menu-btn">
            ${icon("archive", "icon-inline")} Club Archive
          </button>
          <button type="button" id="menu-btn-random" class="setup-menu-btn">
            ${icon("users", "icon-inline")} Random Selection
          </button>
        </aside>

        <div class="setup-content">
          <!-- Pane 1: Start your Career -->
          <div id="pane-career" class="setup-pane active">
            <section id="setup-panel" class="panel setup-panel">
              <div class="panel-header">
                <h2>Start your career</h2>
                <p>Choose the FIFA edition and club you are managing.</p>
              </div>

              <form id="setup-form" class="setup-form">
                <p id="backend-status" class="setup-backend-status" hidden role="alert"></p>
                <p class="setup-env-note">
                  Open this app at <strong>http://localhost:5173</strong> only.
                  Port 8000 is the API (backend) — not the web UI.
                </p>
                <div id="edition-field" class="field field-edition">
                  <label for="edition-select">
                    <span>FIFA edition</span>
                  </label>
                  <div class="edition-control">
                    <select id="edition-select" name="edition" required>
                      <option value="" disabled ${hasEdition ? "" : "selected"}>Select edition</option>
                      ${editionOptions}
                    </select>
                    <button type="button" id="edition-apply-btn" class="btn btn-primary edition-apply-btn" disabled>
                      Load edition
                    </button>
                    <span id="edition-spinner" class="edition-spinner" hidden aria-hidden="true"></span>
                  </div>

                  <div id="edition-feedback" class="edition-feedback edition-feedback-idle" aria-live="assertive">
                    <p id="edition-feedback-title" class="edition-feedback-title">
                      Step 1 — choose your FIFA year
                    </p>
                    <p id="edition-feedback-detail" class="edition-feedback-detail">
                      Pick a year in the dropdown, then click <strong>Load edition</strong>. Progress appears here.
                    </p>
                    <div id="edition-progress" class="edition-progress edition-progress-idle">
                      <div id="edition-progress-fill" class="edition-progress-fill"></div>
                    </div>
                    <p id="edition-elapsed" class="edition-elapsed edition-elapsed-idle">Waiting for edition…</p>
                  </div>
                </div>

                <div id="club-field-wrap" class="club-field-wrap club-field-wrap-locked">
                  ${renderCombobox({
                    idPrefix: "team",
                    label: "Club",
                    placeholder: "Select a FIFA edition first",
                    disabled: true,
                    hint: "Choose a year and click Load edition above.",
                    hintVariant: "info",
                    selectedValue: career.team ?? "",
                    required: true,
                    inputName: "team",
                  })}
                </div>

                <div id="profile-field-wrap" style="opacity: ${career.team ? 1 : 0.72}; ${career.team ? "" : "pointer-events: none;"}">
                  <label for="profile-name" class="field">
                    <span>Career profile (per club)</span>
                    <input
                      id="profile-name"
                      type="text"
                      placeholder="Default"
                      list="profile-list"
                      value="${escapeHtml(career.profileName ?? "Default")}"
                      autocomplete="off"
                    />
                  </label>
                  <datalist id="profile-list"></datalist>
                  <p class="form-hint">Customizations will be saved under this profile only.</p>
                </div>

                <button type="submit" class="btn btn-primary btn-wide" id="continue-btn" disabled>
                  Enter career hub
                  ${icon("arrow", "icon-inline")}
                </button>
              </form>
            </section>

            ${renderSavedCareersPanel()}
          </div>

          <!-- Pane 2: Club Archive -->
          <div id="pane-archive" class="setup-pane">
            <section class="panel setup-panel">
              <div class="panel-header">
                <h2>Club Archive</h2>
                <p>Browse how clubs evolved across FIFA editions.</p>
              </div>
              <div class="archive-controls" style="margin-top: 1.5rem;">
                <div id="archive-club-picker">
                  ${renderClubPicker({
                    idPrefix: "archive-club",
                    selectedClub: career.team ?? "",
                    label: "Club to inspect",
                    placeholder: career.team ? career.team : "Select a club to inspect…",
                    hint: "Preparing club index…",
                    hintVariant: "loading",
                    disabled: true,
                  })}
                </div>
                <div id="archive-status" style="margin-top: 1rem;"></div>
              </div>
              <div id="archive-timeline" style="margin-top: 1.5rem;"></div>
            </section>
          </div>

          <!-- Pane 3: Random Selection -->
          <div id="pane-random" class="setup-pane">
            <section class="panel setup-panel">
              <div class="panel-header">
                <h2>Random Selection</h2>
                <p>Generate a random club or player from a chosen FIFA edition.</p>
              </div>
              <div class="random-controls" style="margin-top: 1.5rem; display: grid; gap: 1.25rem;">
                <div class="field">
                  <label for="random-edition-select">
                    <span>FIFA edition</span>
                  </label>
                  <select id="random-edition-select" class="select-field" style="width: 100%; padding: 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--line); background: var(--bg-elevated); color: var(--text);">
                    ${config.editions.map(edition => `<option value="${edition}">FIFA ${edition}</option>`).join("")}
                  </select>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                  <button type="button" id="random-club-btn" class="btn btn-ghost" style="padding: 1rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
                    ${icon("shield", "icon-inline")} Generate Random Club
                  </button>
                  <button type="button" id="random-player-btn" class="btn btn-ghost" style="padding: 1rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
                    ${icon("users", "icon-inline")} Generate Random Player
                  </button>
                </div>
              </div>
              <div id="random-result" style="margin-top: 1rem;"></div>
            </section>
          </div>
        </div>
      </div>
    `,
  );

  return html;
}

async function loadSavedCareersList(activeCareer, onSelect) {
  const listEl = document.getElementById("saved-careers-list");
  if (!listEl) return;

  try {
    const payload = await fetchCareerSaves();
    const saves = payload?.saves ?? [];

    if (!saves.length) {
      listEl.innerHTML = `<p class="form-hint">No saved careers yet. Create one above to get started.</p>`;
      return;
    }

    listEl.innerHTML = saves.map((save) => renderSavedCareerCard(save, activeCareer)).join("");

    listEl.querySelectorAll(".saved-career-card").forEach((button) => {
      button.addEventListener("click", () => {
        onSelect({
          edition: Number(button.dataset.edition),
          team: button.dataset.team,
          profileName: button.dataset.profileName || "Default",
        });
      });
    });
  } catch {
    listEl.innerHTML = `<p class="status status-error">Could not load saved careers. Check that the backend is running.</p>`;
  }
}

function updateContinueState() {
  const edition = document.getElementById("edition-select")?.value;
  const team = document.getElementById("team-value")?.value;
  const continueBtn = document.getElementById("continue-btn");

  if (continueBtn) {
    continueBtn.disabled = !(edition && team);
  }
}

function updateEditionApplyState() {
  const editionSelect = document.getElementById("edition-select");
  const applyBtn = document.getElementById("edition-apply-btn");
  if (!applyBtn) return;

  const edition = Number(editionSelect?.value);
  if (edition) {
    applyBtn.disabled = false;
    applyBtn.textContent = `Load FIFA ${edition}`;
  } else {
    applyBtn.disabled = true;
    applyBtn.textContent = "Load edition";
  }
}

function setEditionApplyLoading(isLoading) {
  const applyBtn = document.getElementById("edition-apply-btn");
  if (!applyBtn) return;

  if (isLoading) {
    applyBtn.disabled = true;
    applyBtn.textContent = "Loading…";
    return;
  }

  updateEditionApplyState();
}

function setEditionFeedback(phase, details = {}) {
  const field = document.getElementById("edition-field");
  const feedback = document.getElementById("edition-feedback");
  const title = document.getElementById("edition-feedback-title");
  const detail = document.getElementById("edition-feedback-detail");
  const progress = document.getElementById("edition-progress");
  const progressFill = document.getElementById("edition-progress-fill");
  const elapsed = document.getElementById("edition-elapsed");
  const spinner = document.getElementById("edition-spinner");
  const select = document.getElementById("edition-select");
  const retryBtn = document.getElementById("setup-retry-btn");
  const clubWrap = document.getElementById("club-field-wrap");
  const profileWrap = document.getElementById("profile-field-wrap");
  const panel = document.getElementById("setup-panel");

  if (!feedback || !title || !detail || !progress) return;

  feedback.className = `edition-feedback edition-feedback-${phase}`;
  field?.classList.toggle("field-edition-loading", phase === "loading");
  panel?.classList.toggle("setup-panel-loading", phase === "loading");
  clubWrap?.classList.toggle("club-field-wrap-locked", phase !== "success" && phase !== "loading");
  clubWrap?.classList.toggle("club-field-wrap-loading", phase === "loading");
  clubWrap?.classList.toggle("club-field-wrap-ready", phase === "success");

  if (profileWrap) {
    const enabled = phase === "success" || phase === "loading";
    profileWrap.style.opacity = enabled ? "1" : "0.72";
    profileWrap.style.pointerEvents = enabled ? "auto" : "none";
  }

  if (select) {
    select.classList.toggle("is-loading", phase === "loading");
  }

  if (spinner) spinner.hidden = phase !== "loading";
  if (retryBtn) retryBtn.hidden = phase !== "error";

  if (phase === "idle") {
    progress.className = "edition-progress edition-progress-idle";
    progressFill?.classList.remove("is-active");
    elapsed.className = "edition-elapsed edition-elapsed-idle";
    elapsed.textContent = "Waiting for edition…";
    title.textContent = "Step 1 — choose your FIFA year";
    detail.textContent = "Pick a year in the dropdown, then click Load edition. Progress appears here.";
    return;
  }

  const editionLabel = details.edition ? `FIFA ${details.edition}` : "your edition";

  if (phase === "loading") {
    progress.className = "edition-progress edition-progress-loading";
    progressFill?.classList.add("is-active");
    elapsed.className = "edition-elapsed edition-elapsed-loading";
    title.textContent = `Loading ${editionLabel} clubs…`;
    detail.textContent = "Reading clubs from preloaded datasets.";
    elapsed.textContent = details.elapsedSec != null ? `${details.elapsedSec}s elapsed` : "Starting…";
    return;
  }

  if (phase === "success") {
    progress.className = "edition-progress edition-progress-success is-complete";
    progressFill?.classList.remove("is-active");
    elapsed.className = "edition-elapsed edition-elapsed-success";
    title.textContent = `${editionLabel} ready`;
    detail.textContent = `${details.clubCount ?? 0} clubs loaded. You can now search and pick your club below.`;
    elapsed.textContent = details.elapsedSec != null ? `Finished in ${details.elapsedSec}s` : "Done";
    return;
  }

  if (phase === "error") {
    progress.className = "edition-progress edition-progress-error";
    progressFill?.classList.remove("is-active");
    elapsed.className = "edition-elapsed edition-elapsed-error";
    elapsed.textContent = "Load failed";
    title.textContent = `Could not load ${editionLabel} clubs`;
    detail.textContent = details.message || "Check that the backend is running, then retry.";
  }
}

async function checkBackendStatus() {
  const banner = document.getElementById("backend-status");
  if (!banner) return;

  try {
    await fetchHealth();
    banner.hidden = true;
    banner.textContent = "";
  } catch {
    banner.hidden = false;
    banner.textContent =
      "Backend API is not reachable. In a separate terminal run: uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000";
  }
}

function showImmediateEditionLoading(edition, combobox) {
  setEditionFeedback("loading", { edition, elapsedSec: "0.0" });
  combobox?.setValue("", { notify: false });
  combobox?.setDisabled(true);
  combobox?.setPlaceholder("Loading clubs…");
  combobox?.setStatus(`Loading clubs for FIFA ${edition}…`, "loading");
  updateContinueState();
}

async function populateTeams(config, edition, selectedTeam, combobox) {
  if (!combobox) {
    setEditionFeedback("error", {
      edition,
      message: "Club search could not start. Refresh the page and try again.",
    });
    return;
  }

  const startedAt = Date.now();
  let elapsedTimer = window.setInterval(() => {
    const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
    setEditionFeedback("loading", { edition, elapsedSec });
  }, 200);

  try {
    let clubs = getCachedClubs(edition);
    if (!clubs) {
      clubs = await loadClubsFromPlayersCsv(null, config.clubColumn, edition);
    }

    await new Promise((resolve) => window.requestAnimationFrame(resolve));

    const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);

    combobox.setDisabled(false);
    combobox.setPlaceholder("Type a club name and press Enter…");
    combobox.updateItems(clubs, selectedTeam || "", { renderList: false });

    if (selectedTeam) {
      combobox.setStatus(`Selected: ${selectedTeam}`, "success");
    } else {
      combobox.setStatus(`${clubs.length} clubs loaded — type to search, Enter to select.`, "success");
    }

    setEditionFeedback("success", { edition, clubCount: clubs.length, elapsedSec });
    updateContinueState();
  } catch (error) {
    const { message, hint } = formatLoadError(error);
    combobox.updateItems([], "", { renderList: false });
    combobox.setDisabled(true);
    combobox.setPlaceholder("Club list unavailable");
    combobox.setStatus(`${message} ${hint}`, "error");
    setEditionFeedback("error", { edition, message: `${message} ${hint}` });
    updateContinueState();
  } finally {
    window.clearInterval(elapsedTimer);
    document.getElementById("edition-select")?.classList.remove("is-loading");
    setEditionApplyLoading(false);
    updateEditionApplyState();
  }
}

export function bindSetupForm(config, career) {
  const form = document.getElementById("setup-form");
  const editionSelect = document.getElementById("edition-select");
  const applyBtn = document.getElementById("edition-apply-btn");
  const retryBtn = document.getElementById("setup-retry-btn");

  if (!form || !editionSelect || !applyBtn) {
    return;
  }

  const profileList = document.getElementById("profile-list");
  let profileFetchGeneration = 0;
  const localCareerDataKey = "fifa-cm-career-data";

  const populateProfileSuggestions = (teamValue) => {
    if (!profileList) return;
    profileList.innerHTML = "";

    const edition = Number(editionSelect.value);
    const team = teamValue ?? combobox?.getValue?.() ?? "";
    if (!edition || !team) return;

    const currentGen = ++profileFetchGeneration;
    fetchCareerSaveProfiles(edition, team)
      .then((payload) => {
        if (!profileList) return;
        if (currentGen !== profileFetchGeneration) return;
        const profiles = payload?.profiles ?? [];
        const renderProfiles = (items) => {
          profileList.innerHTML = items.map((p) => `<option value="${escapeHtml(p.profileName)}"></option>`).join("");
        };

        if (profiles.length) {
          renderProfiles(profiles);
          return;
        }

        const migrateAndReload = async () => {
          try {
            const raw = localStorage.getItem(localCareerDataKey);
            const store = raw ? JSON.parse(raw) : {};
            const prefix = `${edition}|${team}|`;

            const keys = Object.keys(store);
            const relevant = keys.filter((k) => k === `${edition}|${team}` || k.startsWith(prefix));
            if (!relevant.length) return;

            const savePromises = relevant.map((key) => {
              if (key === `${edition}|${team}`) {
                const value = store[key] ?? {};
                return saveCareerSaveState({
                  edition,
                  team,
                  profileId: "default",
                  profileName: "Default",
                  season: Number(value.season ?? 1),
                  objectives: Array.isArray(value.objectives) ? value.objectives : [],
                  matches: Array.isArray(value.matches) ? value.matches : [],
                });
              }

              const profileId = key.split("|")[2] ?? "default";
              const value = store[key] ?? {};
              return saveCareerSaveState({
                edition,
                team,
                profileId,
                profileName: profileId === "default" ? "Default" : profileId,
                season: Number(value.season ?? 1),
                objectives: Array.isArray(value.objectives) ? value.objectives : [],
                matches: Array.isArray(value.matches) ? value.matches : [],
              });
            });

            await Promise.all(savePromises);

            const retry = await fetchCareerSaveProfiles(edition, team);
            const nextProfiles = retry?.profiles ?? [];
            if (currentGen !== profileFetchGeneration) return;
            renderProfiles(nextProfiles);
          } catch {
            // ignore migration errors, keep suggestions empty
          }
        };

        migrateAndReload();
      })
      .catch(() => {
        if (currentGen !== profileFetchGeneration) return;
        profileList.innerHTML = "";
      });
  };

  const combobox = mountCombobox("team", {
    items: [],
    selectedValue: career.team ?? "",
    disabled: true,
    onSelect: (value) => {
      updateContinueState();
      populateProfileSuggestions(value);
    },
  });

  // Tab switching logic
  const menuBtnCareer = document.getElementById("menu-btn-career");
  const menuBtnArchive = document.getElementById("menu-btn-archive");
  const menuBtnRandom = document.getElementById("menu-btn-random");

  const paneCareer = document.getElementById("pane-career");
  const paneArchive = document.getElementById("pane-archive");
  const paneRandom = document.getElementById("pane-random");

  let archiveBound = false;

  const switchTab = (tabId) => {
    menuBtnCareer?.classList.remove("active");
    menuBtnArchive?.classList.remove("active");
    menuBtnRandom?.classList.remove("active");

    if (paneCareer) paneCareer.style.display = "none";
    if (paneArchive) paneArchive.style.display = "none";
    if (paneRandom) paneRandom.style.display = "none";

    if (tabId === "career") {
      menuBtnCareer?.classList.add("active");
      if (paneCareer) paneCareer.style.display = "block";
    } else if (tabId === "archive") {
      menuBtnArchive?.classList.add("active");
      if (paneArchive) paneArchive.style.display = "block";

      if (!archiveBound) {
        archiveBound = true;
        bindClubArchive({
          config,
          career,
          scope: {
            isActive: () => paneArchive && paneArchive.style.display !== "none"
          },
          params: {
            team: combobox?.getValue() || career.team || ""
          }
        });
      }
    } else if (tabId === "random") {
      menuBtnRandom?.classList.add("active");
      if (paneRandom) paneRandom.style.display = "block";
    }
  };

  menuBtnCareer?.addEventListener("click", () => switchTab("career"));
  menuBtnArchive?.addEventListener("click", () => switchTab("archive"));
  menuBtnRandom?.addEventListener("click", () => switchTab("random"));

  let loadGeneration = 0;

  const loadForCurrentEdition = async (selectedTeam = null) => {
    const edition = Number(editionSelect.value);
    if (!edition) {
      setEditionFeedback("idle");
      combobox?.setDisabled(true);
      combobox?.setPlaceholder("Select a FIFA edition first");
      combobox?.setStatus("Pick a FIFA edition above, then click Load edition.", "info");
      updateContinueState();
      updateEditionApplyState();
      return;
    }

    showImmediateEditionLoading(edition, combobox);
    setEditionApplyLoading(true);

    try {
      const generation = ++loadGeneration;
      await populateTeams(config, edition, selectedTeam, combobox);
      if (generation !== loadGeneration) return;
    } catch (error) {
      setEditionFeedback("error", {
        edition,
        message: error?.message || "Unexpected error while loading clubs.",
      });
      setEditionApplyLoading(false);
      updateEditionApplyState();
    }
  };

  const onEditionSelectChange = () => {
    updateEditionApplyState();
    setEditionFeedback("idle");
    combobox?.setDisabled(true);
    combobox?.setPlaceholder("Click Load edition to fetch clubs");
    combobox?.setStatus("Choose a year and click Load edition above.", "info");
    updateContinueState();
  };

  editionSelect.addEventListener("change", onEditionSelectChange);
  applyBtn.addEventListener("click", () => loadForCurrentEdition(null));
  retryBtn?.addEventListener("click", () => loadForCurrentEdition(combobox?.getValue() || null));

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const edition = Number(editionSelect.value);
    const team = combobox?.getValue();
    const profileName = document.getElementById("profile-name")?.value?.trim() || "Default";

    if (!edition || !team) {
      combobox?.setStatus("Select both a FIFA edition and a club before continuing.", "error");
      return;
    }

    saveCareer({ edition, team, profileName });
    navigate("home");
  });

  const resumeSavedCareer = async (save) => {
    if (!save?.edition || !save?.team) return;

    editionSelect.value = String(save.edition);
    updateEditionApplyState();

    const profileInput = document.getElementById("profile-name");
    if (profileInput) {
      profileInput.value = save.profileName || "Default";
    }

    await loadForCurrentEdition(save.team);
    combobox?.setValue(save.team, { notify: true });
    populateProfileSuggestions(save.team);
    updateContinueState();

    saveCareer({
      edition: save.edition,
      team: save.team,
      profileName: save.profileName || "Default",
    });
    navigate("home");
  };

  loadSavedCareersList(career, resumeSavedCareer);

  // Random Selection tab logic
  const randomClubBtn = document.getElementById("random-club-btn");
  const randomPlayerBtn = document.getElementById("random-player-btn");
  const randomEditionSelect = document.getElementById("random-edition-select");
  const randomResult = document.getElementById("random-result");

  if (randomClubBtn && randomPlayerBtn && randomEditionSelect && randomResult) {
    const persistRandomState = (kind, edition, payload) => {
      saveSetupRandomRestore({
        tab: "random",
        edition,
        kind,
        player: kind === "player" ? payload : null,
        clubData: kind === "club" ? payload : null,
      });
    };

    const openClubArchive = (edition, team, kind, payload) => {
      persistRandomState(kind, edition, payload);
      navigate("section", {
        id: "club-archive",
        origin: "setup",
        edition,
        team,
      });
    };

    const bindRandomClubResult = (data, edition) => {
      const inspectBtn = document.getElementById("random-club-inspect-btn");
      const selectBtn = document.getElementById("random-club-select-btn");

      inspectBtn?.addEventListener("click", () => openClubArchive(edition, data.club, "club", data));

      selectBtn?.addEventListener("click", () => {
        switchTab("career");
        const editionSelectEl = document.getElementById("edition-select");
        if (editionSelectEl) {
          editionSelectEl.value = edition;
          editionSelectEl.dispatchEvent(new Event("change"));
          loadForCurrentEdition(data.club);
        }
      });
    };

    const bindRandomPlayerResult = (player, edition) => {
      const inspectClubBtn = document.getElementById("random-player-club-inspect-btn");
      if (inspectClubBtn && player.club) {
        inspectClubBtn.addEventListener("click", () => openClubArchive(edition, player.club, "player", player));
      }
    };

    randomClubBtn.addEventListener("click", async () => {
      const edition = Number(randomEditionSelect.value);
      randomResult.innerHTML = `
        <div class="panel section-panel" style="text-align: center; padding: 2rem;">
          <span class="edition-spinner" style="display: inline-block; margin-bottom: 1rem;"></span>
          <p class="status">Generating random club for FIFA ${edition}…</p>
        </div>
      `;

      try {
        const data = await fetchRandomClub(edition);
        randomResult.innerHTML = renderRandomClubInfo(data);
        bindRandomClubResult(data, edition);
      } catch (error) {
        randomResult.innerHTML = `
          <div class="panel section-panel" style="text-align: center; padding: 2rem; border-color: var(--line);">
            <p class="status status-error">Error: ${escapeHtml(error.message)}</p>
          </div>
        `;
      }
    });

    randomPlayerBtn.addEventListener("click", async () => {
      const edition = Number(randomEditionSelect.value);
      randomResult.innerHTML = `
        <div class="panel section-panel" style="text-align: center; padding: 2rem;">
          <span class="edition-spinner" style="display: inline-block; margin-bottom: 1rem;"></span>
          <p class="status">Generating random player for FIFA ${edition}…</p>
        </div>
      `;

      try {
        const player = await fetchRandomPlayer(edition);
        randomResult.innerHTML = renderRandomPlayerInfo(player);
        bindRandomPlayerResult(player, edition);
      } catch (error) {
        randomResult.innerHTML = `
          <div class="panel section-panel" style="text-align: center; padding: 2rem; border-color: var(--line);">
            <p class="status status-error">Error: ${escapeHtml(error.message)}</p>
          </div>
        `;
      }
    });

    const restore = consumeSetupRandomRestore();
    if (restore?.tab === "random") {
      switchTab("random");
      if (restore.edition) randomEditionSelect.value = String(restore.edition);
      if (restore.kind === "player" && restore.player) {
        randomResult.innerHTML = renderRandomPlayerInfo(restore.player);
        bindRandomPlayerResult(restore.player, restore.edition);
      } else if (restore.kind === "club" && restore.clubData) {
        randomResult.innerHTML = renderRandomClubInfo(restore.clubData);
        bindRandomClubResult(restore.clubData, restore.edition);
      }
    }
  }

  checkBackendStatus();
  updateEditionApplyState();

  if (Number(career.edition) > 0 && combobox) {
    loadForCurrentEdition(career.team).then(() => populateProfileSuggestions(career.team)).catch(() => {});
  } else {
    setEditionFeedback("idle");
    updateContinueState();
  }
}
