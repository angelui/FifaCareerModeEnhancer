import { loadClubsFromPlayersCsv } from "../utils/csv.js";
import { getCachedClubs } from "../data-cache.js";
import { saveCareer } from "../state.js";
import { navigate } from "../router.js";
import { escapeHtml, icon } from "../ui.js";
import { formatLoadError, mountCombobox, renderCombobox } from "../ui/combobox.js";
import { fetchHealth } from "../api.js";

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
              <button type="button" id="setup-retry-btn" class="btn btn-ghost setup-retry-btn" hidden>
                Retry loading clubs
              </button>
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
                value="${escapeHtml(career.profileName ?? "Default")}"
                autocomplete="off"
              />
            </label>
            <p class="form-hint">Customizations will be saved under this profile only.</p>
          </div>

          <div class="setup-actions">
            ${renderSetupActions(config)}
          </div>

          <button type="submit" class="btn btn-primary btn-wide" id="continue-btn" disabled>
            Enter career hub
            ${icon("arrow", "icon-inline")}
          </button>
        </form>
      </section>
    `,
  );

  return html;
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
  retryBtn.hidden = phase !== "error";

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

  const combobox = mountCombobox("team", {
    items: [],
    selectedValue: career.team ?? "",
    disabled: true,
    onSelect: updateContinueState,
  });

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

  // Ensure Club Archive gets the current picker selection even before the user saves the career.
  document.querySelectorAll('[data-nav="section"][data-id="club-archive"]').forEach((button) => {
    button.addEventListener("click", () => {
      const edition = Number(editionSelect.value);
      const team = combobox?.getValue() || "";
      navigate("section", {
        id: "club-archive",
        origin: "setup",
        edition: Number.isFinite(edition) && edition > 0 ? edition : "",
        team,
      });
    });
  });

  checkBackendStatus();
  updateEditionApplyState();

  if (Number(career.edition) > 0 && combobox) {
    loadForCurrentEdition(career.team);
  } else {
    setEditionFeedback("idle");
    updateContinueState();
  }
}
