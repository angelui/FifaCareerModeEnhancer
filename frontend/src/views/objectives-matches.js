import { createId, loadCareerData, saveCareerData } from "../career-data.js";
import { fetchClubNarrative, fetchClubsForEdition, fetchFixtureHints } from "../api.js";
import { escapeHtml } from "../ui.js";
import { mountCombobox, renderCombobox } from "../ui/combobox.js";
import { renderLoadComplete, renderLoadingPanel, startLoadTimer } from "../ui/loading.js";
import { assertCareerReady } from "../ui/section-loader.js";
import { bindSectionNav } from "../ui/section-nav.js";
import { renderSectionShell, renderStatus } from "./section-shell.js";

function renderObjectiveItem(objective) {
  return `
    <li class="list-item ${objective.gold ? "list-item-gold" : ""} ${objective.done ? "list-item-done" : ""}" data-id="${escapeHtml(objective.id)}">
      <label class="check-row">
        <input type="checkbox" data-action="toggle-objective" data-id="${escapeHtml(objective.id)}" ${objective.done ? "checked" : ""} />
        <span>${escapeHtml(objective.text)}</span>
      </label>
      <button type="button" class="btn btn-ghost btn-icon" data-action="delete-objective" data-id="${escapeHtml(objective.id)}" title="Remove">×</button>
    </li>
  `;
}

function buildGoldObjectives(payload, fixturePayload) {
  const profile = payload?.profile ?? {};
  const edition = payload?.edition ?? "";

  const hints = fixturePayload?.hints ?? [];
  const rivals = hints.filter((h) => Boolean(h.isRivalry));

  const cityDerby = hints.find((h) => Boolean(h.isRivalry) && h.distanceKm === 0) || rivals[0] || null;

  const nearestCandidates = hints
    .filter((h) => h.distanceKm != null && Number(h.distanceKm) <= 250)
    .sort((a, b) => Number(a.distanceKm ?? 99999) - Number(b.distanceKm ?? 99999))
    .slice(0, 30);

  // Prefer a "top side" within travel range; otherwise the nearest same-country test.
  const topWithinRange =
    nearestCandidates.find((h) => Boolean(h.isTopSide) && !Boolean(h.isRivalry)) ??
    nearestCandidates.find((h) => Boolean(h.sameCountry) && !Boolean(h.isRivalry)) ??
    nearestCandidates[0] ??
    null;

  const starCount = Number(profile.starCount ?? 0);
  const youthUnder23 = Number(profile.youngUnder23Count ?? 0);
  const dominantNat = (profile.dominantNationalities ?? [])[0];

  const pickTone = () => {
    if (starCount >= 2) return "your match-winner stars";
    if (youthUnder23 >= 4) return "your under-23 core";
    return dominantNat ? `your ${dominantNat} identity` : "your club identity";
  };

  const derbyName = cityDerby?.club ?? "your city rival";
  const nearestName = topWithinRange?.club ?? "a close domestic rival";
  const nearestKm = topWithinRange?.distanceKm != null ? Number(topWithinRange.distanceKm) : null;

  const t1 = {
    id: "obj-gold-1",
    gold: true,
    source: "generated",
    text: `Gold objective (${edition}): Win the same-city derby vs ${derbyName} with ${pickTone()} leading the charge.`,
  };

  const distancePart = nearestKm != null ? ` (${nearestKm} km travel)` : "";
  const derbyOrTopTag = topWithinRange?.isTopSide ? "a statement" : "a rare focus";
  const t2 = {
    id: "obj-gold-2",
    gold: true,
    source: "generated",
    text: `Gold objective (${edition}): Deliver ${derbyOrTopTag} — secure a key result vs ${nearestName}${distancePart}.`,
  };

  return [t1, t2];
}

function renderMatchItem(match) {
  const tags = [
    match.isRivalry ? '<span class="pill">Rivalry</span>' : "",
    match.distanceKm ? `<span class="pill pill-muted">${escapeHtml(String(match.distanceKm))} km</span>` : "",
    match.played ? `<span class="pill pill-muted">${escapeHtml(match.result || "Played")}</span>` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `
    <li class="list-item match-item${match.played ? " list-item-played" : ""}" data-id="${escapeHtml(match.id)}">
      <div class="match-item-body">
        <strong>${escapeHtml(match.opponent)}</strong>
        ${match.date ? `<span class="table-sub">${escapeHtml(match.date)}</span>` : ""}
        ${match.notes ? `<p class="match-notes">${escapeHtml(match.notes)}</p>` : ""}
        ${tags ? `<div class="tag-row">${tags}</div>` : ""}
      </div>
      <div class="match-item-actions">
        <label class="check-row check-row-compact">
          <input type="checkbox" data-action="toggle-match" data-id="${escapeHtml(match.id)}" ${match.played ? "checked" : ""} />
          <span>Played</span>
        </label>
        <button type="button" class="btn btn-ghost btn-icon" data-action="delete-match" data-id="${escapeHtml(match.id)}" title="Remove">×</button>
      </div>
    </li>
  `;
}

function showMatchPlayedDialog({ opponent, date = "", notes = "", onConfirm, onCancel }) {
  const existing = document.getElementById("match-played-dialog");
  existing?.remove();

  const overlay = document.createElement("div");
  overlay.id = "match-played-dialog";
  overlay.className = "app-dialog-overlay";
  overlay.innerHTML = `
    <div class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="match-played-dialog-title">
      <div class="app-dialog-header">
        <h3 id="match-played-dialog-title">Mark fixture as played</h3>
        <p class="form-hint">${escapeHtml(opponent)}</p>
      </div>
      <form id="match-played-form" class="app-dialog-body">
        <label class="field field-stack">
          <span>Date</span>
          <input id="match-played-date" type="date" value="${escapeHtml(date)}" />
        </label>
        <label class="field field-stack">
          <span>Notes</span>
          <textarea id="match-played-notes" rows="4" placeholder="Scoreline, standout performers, context...">${escapeHtml(notes)}</textarea>
        </label>
        <div class="app-dialog-actions">
          <button type="button" class="btn btn-ghost" data-action="cancel-match-played">Cancel</button>
          <button type="submit" class="btn btn-primary">Save</button>
        </div>
      </form>
    </div>
  `;

  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close(false);
    }
  };

  const close = (confirmed, values = null) => {
    document.removeEventListener("keydown", onKeyDown);
    overlay.remove();
    document.body.classList.remove("app-dialog-open");
    if (confirmed) {
      onConfirm?.(values);
    } else {
      onCancel?.();
    }
  };

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close(false);
  });

  document.addEventListener("keydown", onKeyDown);

  overlay.querySelector('[data-action="cancel-match-played"]')?.addEventListener("click", () => close(false));

  overlay.querySelector("#match-played-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    close(true, {
      date: overlay.querySelector("#match-played-date")?.value ?? "",
      notes: overlay.querySelector("#match-played-notes")?.value.trim() ?? "",
    });
  });

  document.body.classList.add("app-dialog-open");
  document.body.appendChild(overlay);

  const dateInput = overlay.querySelector("#match-played-date");
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().slice(0, 10);
  }
  dateInput?.focus();
}

function renderHintCard(hint, { action = "add-hint" } = {}) {
  const badges = [
    hint.isRivalry ? '<span class="pill">Rival</span>' : "",
    hint.isTopSide ? '<span class="pill pill-muted">Top side</span>' : "",
    hint.distanceKm != null ? `<span class="pill pill-muted">${escapeHtml(String(hint.distanceKm))} km</span>` : "",
    hint.city ? `<span class="pill pill-muted">${escapeHtml(hint.city)}</span>` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const meta = [
    hint.topPlayer ? `Top: ${hint.topPlayer}` : "",
    hint.country ? hint.country : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return `
    <article class="hint-card">
      <div>
        <strong>${escapeHtml(hint.club)}</strong>
        <p class="table-sub">Best XI OVR ${hint.best11Overall ?? hint.avgOverall ?? "—"} · ${hint.squadSize} players</p>
        ${meta ? `<p class="table-sub">${escapeHtml(meta)}</p>` : ""}
        ${badges ? `<div class="tag-row">${badges}</div>` : ""}
      </div>
      <button type="button" class="btn btn-ghost" data-action="${action}" data-club="${escapeHtml(hint.club)}" data-rivalry="${hint.isRivalry ? "1" : "0"}" data-distance="${hint.distanceKm ?? ""}">
        Track
      </button>
    </article>
  `;
}

function renderRelationSection(title, description, items, { emptyMessage, action = "add-hint" } = {}) {
  return `
    <section class="panel section-panel relation-panel">
      <div class="panel-header-inline">
        <h3>${escapeHtml(title)}</h3>
        <p class="form-hint">${escapeHtml(description)}</p>
      </div>
      <div class="hint-grid">
        ${items.length ? items.map((item) => renderHintCard(item, { action })).join("") : renderStatus(emptyMessage, "muted")}
      </div>
    </section>
  `;
}

export async function renderObjectivesMatches({ career }) {
  const data = await loadCareerData(career);

  return renderSectionShell({
    career,
    title: "Objectives & Matches",
    description: "Generated board goals plus fixture tracking for your save.",
    defaultPane: "board",
    panes: [
      {
        id: "board",
        label: "Board objectives",
        icon: "target",
        content: `
          <section id="generated-objectives" class="panel section-panel">
            <div class="panel-header-inline">
              <h3>Board objectives</h3>
              <p class="form-hint">Generated from squad tier and club philosophy.</p>
            </div>
            <div id="generated-objectives-body"></div>
          </section>
        `,
      },
      {
        id: "season",
        label: "Your season",
        icon: "shield",
        content: `
          <section class="panel section-panel form-panel">
            <div class="panel-header-inline">
              <h3>Season ${data.season}</h3>
              <label class="field field-inline">
                <span>Season #</span>
                <input id="season-input" type="number" min="1" value="${data.season}" />
              </label>
            </div>

            <form id="objective-form" class="inline-form">
              <label class="field field-grow">
                <span>Custom objective</span>
                <input id="objective-input" type="text" placeholder="Add your own board goal..." required />
              </label>
              <button type="submit" class="btn btn-primary">Add</button>
            </form>
            <ul id="objectives-list" class="item-list">
              ${data.objectives.length ? data.objectives.map(renderObjectiveItem).join("") : '<li class="empty-inline">No objectives yet.</li>'}
            </ul>
          </section>
        `,
      },
      {
        id: "fixtures",
        label: "Fixtures",
        icon: "table",
        content: `
          <section class="panel section-panel form-panel">
            <div class="panel-header-inline">
              <div>
                <h3>Add fixture</h3>
                <p class="form-hint">Track an important upcoming match.</p>
              </div>
            </div>
            <form id="match-form" class="form-grid match-form">
              <div class="field field-span-2">
                ${renderCombobox({
                  idPrefix: "match-opponent",
                  label: "Opponent",
                  placeholder: "Type a club and press Enter…",
                  hint: "Pick from your FIFA edition or type any name.",
                })}
              </div>
              <p id="match-opponent-extra" class="form-hint field-span-2" hidden aria-live="polite"></p>
              <label class="field">
                <span>Date (optional)</span>
                <input id="match-date" type="date" />
              </label>
              <label class="field">
                <span>Distance (km)</span>
                <input id="match-distance" type="number" min="0" step="1" placeholder="e.g. 450" />
              </label>
              <label class="field field-check">
                <input id="match-rivalry" type="checkbox" />
                <span>Rivalry fixture</span>
              </label>
              <label class="field field-stack field-span-2">
                <span>Notes</span>
                <input id="match-notes" type="text" placeholder="Derby, long away trip, must-win..." />
              </label>
              <div class="form-actions field-span-2">
                <button type="submit" class="btn btn-primary">Add fixture</button>
              </div>
            </form>
          </section>

          <section class="panel section-panel">
            <div class="panel-header-inline">
              <div>
                <h3>Important fixtures</h3>
                <p class="form-hint">Fixtures you've saved for this career.</p>
              </div>
            </div>
            <ul id="matches-list" class="item-list">
              ${data.matches.length ? data.matches.map(renderMatchItem).join("") : '<li class="empty-inline">No fixtures tracked yet.</li>'}
            </ul>
          </section>
        `,
      },
      {
        id: "suggested",
        label: "Suggested fixtures",
        icon: "archive",
        content: `
          <section class="panel section-panel">
            <div class="panel-header-inline">
              <h3>Fixture intelligence</h3>
              <p class="form-hint">Rivals and nearby clubs compiled from squad nationality, city names, and name overlap.</p>
            </div>
            <div id="fixture-hints-status"></div>
          </section>
          <section class="panel section-panel">
            <div class="panel-header-inline">
              <h3>Suggested fixtures</h3>
              <p class="form-hint">Mixed rivals, nearby sides, and top opponents for FIFA ${career.edition}.</p>
            </div>
            <div class="tab-row">
              <button type="button" class="tab-btn tab-btn-active" data-fixtab="rivals">Rivalries</button>
              <button type="button" class="tab-btn" data-fixtab="top">Top sides</button>
              <button type="button" class="tab-btn" data-fixtab="nearest">Nearest</button>
              <button type="button" class="tab-btn" data-fixtab="other">Others</button>
            </div>
            <div id="fixture-hints" class="hint-grid"></div>
            <div class="form-actions">
              <button type="button" id="fixture-hints-show-more" class="btn btn-ghost" hidden>
                Show more
              </button>
            </div>
          </section>
        `,
      },
    ],
  });
}

export async function bindObjectivesMatches({ career, scope }) {
  if (!scope?.isActive()) return;

  const generatedRoot = document.getElementById("generated-objectives-body");
  const hintsStatus = document.getElementById("fixture-hints-status");
  const objectivesList = document.getElementById("objectives-list");
  const matchesList = document.getElementById("matches-list");
  const hintsRoot = document.getElementById("fixture-hints");
  const opponentExtra = document.getElementById("match-opponent-extra");
  const fixtureHintsShowMore = document.getElementById("fixture-hints-show-more");

  if (!assertCareerReady(career, generatedRoot)) return;

  bindSectionNav("section-nav");

  let state = await loadCareerData(career);

  const persist = () => saveCareerData(career, state);

  const refreshObjectives = () => {
    if (!objectivesList) return;
    objectivesList.innerHTML = state.objectives.length
      ? state.objectives.map(renderObjectiveItem).join("")
      : '<li class="empty-inline">No objectives yet.</li>';
  };

  const refreshMatches = () => {
    if (!matchesList) return;
    matchesList.innerHTML = state.matches.length
      ? state.matches.map(renderMatchItem).join("")
      : '<li class="empty-inline">No fixtures tracked yet.</li>';
  };

  document.getElementById("season-input")?.addEventListener("change", (event) => {
    state.season = Math.max(1, Number(event.target.value) || 1);
    persist();
  });

  document.getElementById("objective-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = document.getElementById("objective-input");
    const text = input?.value.trim();
    if (!text) return;

    state.objectives.unshift({
      id: createId("obj"),
      text,
      done: false,
      season: state.season,
    });
    persist();
    refreshObjectives();
    if (input) input.value = "";
  });

  let opponentPicker = null;
  let suggestedObjectives = [];

  document.getElementById("match-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const opponent = opponentPicker?.getValue()?.trim();
    if (!opponent) {
      opponentPicker?.setStatus("Select an opponent club.", "error");
      return;
    }

    state.matches.unshift({
      id: createId("match"),
      opponent,
      date: document.getElementById("match-date")?.value ?? "",
      distanceKm: document.getElementById("match-distance")?.value ?? "",
      isRivalry: Boolean(document.getElementById("match-rivalry")?.checked),
      notes: document.getElementById("match-notes")?.value.trim() ?? "",
      played: false,
      result: "",
      season: state.season,
    });
    persist();
    refreshMatches();
    event.target.reset();
    opponentPicker?.setValue("", { notify: false });
  });

  objectivesList?.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;

    const action = target.getAttribute("data-action");
    const id = target.getAttribute("data-id");
    if (action === "delete-objective" && id) {
      state.objectives = state.objectives.filter((item) => item.id !== id);
      persist();
      refreshObjectives();
    }
  });

  objectivesList?.addEventListener("change", (event) => {
    const target = event.target.closest('[data-action="toggle-objective"]');
    if (!target) return;
    const id = target.getAttribute("data-id");
    const item = state.objectives.find((entry) => entry.id === id);
    if (item) {
      item.done = target.checked;
      persist();
      refreshObjectives();
    }
  });

  matchesList?.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;

    const action = target.getAttribute("data-action");
    const id = target.getAttribute("data-id");

    if (action === "delete-match" && id) {
      state.matches = state.matches.filter((item) => item.id !== id);
      persist();
      refreshMatches();
    }
  });

  const trackHint = (target) => {
    const club = target.getAttribute("data-club");
    const isRivalry = target.getAttribute("data-rivalry") === "1";
    const distanceKm = target.getAttribute("data-distance") ?? "";
    if (!club) return;

    state.matches.unshift({
      id: createId("match"),
      opponent: club,
      date: "",
      distanceKm,
      isRivalry,
      notes: isRivalry ? "Suggested rivalry fixture" : "Suggested important fixture",
      played: false,
      result: "",
      season: state.season,
    });
    persist();
    refreshMatches();
    target.textContent = "Added";
    target.disabled = true;
  };

  hintsRoot?.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action='add-hint']");
    if (!target) return;
    trackHint(target);
  });

  // `club-rivals` / `club-nearest` panels intentionally removed to focus UX
  // on the main "Suggested fixtures" section.

  matchesList?.addEventListener("change", (event) => {
    const target = event.target.closest('[data-action="toggle-match"]');
    if (!target) return;
    const id = target.getAttribute("data-id");
    const item = state.matches.find((entry) => entry.id === id);
    if (!item) return;

    if (target.checked) {
      target.checked = false;
      showMatchPlayedDialog({
        opponent: item.opponent,
        date: item.date || "",
        notes: item.notes || "",
        onConfirm: ({ date, notes }) => {
          item.played = true;
          item.date = date;
          item.notes = notes;
          persist();
          refreshMatches();
        },
      });
      return;
    }

    item.played = false;
    persist();
    refreshMatches();
  });

  document.getElementById("generated-objectives")?.addEventListener("click", (event) => {
    const target = event.target.closest('[data-action="import-objective"]');
    if (!target) return;

    const index = Number(target.getAttribute("data-index"));
    const objective = suggestedObjectives[index];
    if (!objective) return;

    const exists = state.objectives.some((item) => item.text === objective.text);
    if (exists) {
      target.textContent = "Tracked";
      target.disabled = true;
      return;
    }

    state.objectives.unshift({
      id: createId("obj"),
      text: objective.text,
      gold: Boolean(objective.gold),
      done: false,
      season: state.season,
    });
    persist();
    refreshObjectives();
    target.textContent = "Tracked";
    target.disabled = true;
  });

  generatedRoot.innerHTML = renderLoadingPanel("Generating board objectives…", { step: "Analyzing squad tier…" });
  hintsStatus.innerHTML = renderLoadingPanel("Finding suggested fixtures…", { step: "Ranking rivals and top sides…" });

  const generatedTimer = startLoadTimer(generatedRoot);
  const hintsTimer = startLoadTimer(hintsStatus);

  (async () => {
    try {
      generatedTimer.setStep("Building board expectations…");
      hintsTimer.setStep("Scanning edition opponents…");

      const [payload, fixturePayload, clubsForEdition] = await Promise.all([
        fetchClubNarrative(career.edition, career.team),
        fetchFixtureHints(career.edition, career.team, 60),
        fetchClubsForEdition(career.edition),
      ]);
      if (!scope.isActive()) return;

      const base = payload.suggestedObjectives ?? [];
      const goldExtras = buildGoldObjectives(payload, fixturePayload);
      const existing = new Set(base.map((o) => o.text));
      suggestedObjectives = [...base, ...goldExtras.filter((o) => o?.text && !existing.has(o.text))];
      generatedTimer.stop();
      generatedRoot.innerHTML = `
        ${renderLoadComplete("Board objectives ready", { detail: `${suggestedObjectives.length} generated goals` })}
        ${
          suggestedObjectives.length
            ? `<ul class="item-list">${suggestedObjectives
                .map(
                  (objective, index) => `
                    <li class="list-item ${objective.gold ? "list-item-gold" : ""}">
                      <span>${escapeHtml(objective.text)}</span>
                      <button type="button" class="btn btn-ghost" data-action="import-objective" data-index="${index}">Track</button>
                    </li>
                  `,
                )
                .join("")}</ul>`
            : renderStatus("No objectives generated.", "muted")
        }
      `;

      const hints = fixturePayload.hints ?? [];
      const rivals = fixturePayload.rivals ?? [];
      const nearestClubs = fixturePayload.nearestClubs ?? [];
      hintsTimer.stop();
      hintsStatus.innerHTML = renderLoadComplete("Fixture intelligence ready", {
        detail: `${rivals.length} rivals · ${nearestClubs.length} nearby clubs · ${hints.length} suggested fixtures`,
      });

      // Keep "rivals" / "nearestClubs" in the payload for potential future use,
      // but render them inside the capped, tabbed "Suggested fixtures" grid.
      // Make suggested fixtures less of a doomscroll:
      // - show tabbed categories
      // - show only a capped amount by default with a "Show more" toggle
      let currentTab = "rivals";
      const tabButtons = Array.from(document.querySelectorAll("[data-fixtab]"));
      tabButtons.forEach((btn) => {
        if (btn.classList.contains("tab-btn-active")) currentTab = btn.getAttribute("data-fixtab") || "rivals";
      });

      let showAll = false;
      const LIMIT = 12;

      const subsetByTab = (tab) => {
        const t = tab || "rivals";
        if (t === "rivals") return hints.filter((h) => Boolean(h.isRivalry));
        if (t === "top") return hints.filter((h) => Boolean(h.isTopSide));
        if (t === "nearest") return hints.filter((h) => Boolean(h.sameCountry) && !Boolean(h.isRivalry));
        if (t === "other") return hints.filter((h) => !Boolean(h.isRivalry) && !Boolean(h.isTopSide) && !Boolean(h.sameCountry));
        return hints;
      };

      const renderFixtureHints = () => {
        if (!hintsRoot) return;
        const subset = subsetByTab(currentTab);
        const shown = showAll ? subset : subset.slice(0, LIMIT);
        hintsRoot.innerHTML = shown.length ? shown.map((hint) => renderHintCard(hint)).join("") : renderStatus("No suggestions available.", "muted");

        if (!fixtureHintsShowMore) return;
        const shouldShow = subset.length > LIMIT;
        fixtureHintsShowMore.hidden = !shouldShow;
        fixtureHintsShowMore.textContent = showAll ? "Show less" : "Show more";
      };

      tabButtons.forEach((button) => {
        button.addEventListener("click", () => {
          tabButtons.forEach((b) => b.classList.toggle("tab-btn-active", b === button));
          currentTab = button.getAttribute("data-fixtab") || "rivals";
          showAll = false;
          renderFixtureHints();
        });
      });

      fixtureHintsShowMore?.addEventListener("click", () => {
        showAll = !showAll;
        renderFixtureHints();
      });

      renderFixtureHints();

      // Fallback set (only if club list fetch fails for some reason).
      const comboboxItemsFallback = [...rivals, ...nearestClubs, ...hints].map((entry) => entry.club);

      const comboboxItems = Array.isArray(clubsForEdition) && clubsForEdition.length ? clubsForEdition : [...new Set(comboboxItemsFallback)];
      const opponentMetaByClub = new Map();
      const upsert = (entry) => {
        if (!entry?.club) return;
        opponentMetaByClub.set(entry.club, entry);
      };
      rivals.forEach(upsert);
      nearestClubs.forEach(upsert);
      hints.forEach(upsert);

      const renderOpponentExtra = (club) => {
        if (!opponentExtra) return;
        const meta = opponentMetaByClub.get(club);
        if (!meta) {
          opponentExtra.hidden = true;
          opponentExtra.textContent = "";
          return;
        }

        const ovr = meta.best11Overall ?? meta.avgOverall ?? "—";
        const squadSize = meta.squadSize != null ? String(meta.squadSize) : "—";
        const city = meta.city ? String(meta.city) : "";
        const distance = meta.distanceKm != null ? `${String(meta.distanceKm)} km` : "";
        const parts = [];
        if (meta.isRivalry) parts.push("Rivalry");
        if (distance) parts.push(distance);
        if (city) parts.push(city);
        parts.push(`${ovr} OVR`);
        parts.push(`${squadSize} players`);

        opponentExtra.hidden = false;
        opponentExtra.textContent = parts.join(" · ");
      };

      opponentPicker = mountCombobox("match-opponent", {
        items: [...new Set(comboboxItems)],
        autoSelectSingle: false,
        onSelect: (club) => renderOpponentExtra(club),
      });

      // If there is already a selected value (e.g. after hot reload), show its meta.
      renderOpponentExtra(opponentPicker?.getValue?.() || "");
    } catch (error) {
      if (!scope.isActive()) return;
      generatedTimer.stop();
      hintsTimer.stop();
      generatedRoot.innerHTML = renderLoadComplete(error.message, { variant: "error" });
      hintsStatus.innerHTML = renderLoadComplete(error.message, { variant: "error" });
      opponentPicker = mountCombobox("match-opponent", { items: [], autoSelectSingle: false });
    }
  })();
}
