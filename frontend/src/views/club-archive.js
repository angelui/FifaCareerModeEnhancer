import { escapeHtml } from "../ui.js";
import { formatLoadError } from "../ui/combobox.js";
import { renderLoadComplete, renderLoadingPanel, startLoadTimer } from "../ui/loading.js";
import { resolveClubIndex } from "../utils/clubs.js";
import { loadClubArchiveTimeline } from "../utils/csv.js";
import {
  bindClubPicker,
  renderClubPicker,
  renderSectionShell,
  renderStatus,
} from "./section-shell.js";

function renderEditionCard(edition, summary, activeEdition, league) {
  const activeClass = Number(edition) === Number(activeEdition) ? " era-card-active" : "";
  const count = summary?.count ?? 0;

  if (count === 0) {
    return `
      <article class="era-card era-card-empty${activeClass}">
        <div class="era-card-head">
          <strong>FIFA ${edition}</strong>
          <span class="pill pill-muted">Not in dataset</span>
        </div>
      </article>
    `;
  }

  const topPlayers = summary.topPlayers ?? [];
  const dominantNationalities = summary.dominantNationalities ?? [];
  const nationalityCount = summary.nationalityCount ?? dominantNationalities.length;
  const nationalityCounts = summary.nationalityCounts ?? {};
  const sortedNationals = Object.entries(nationalityCounts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], undefined, { sensitivity: "base" }));
  const topNationals = sortedNationals.slice(0, 6);
  const moreCount = Math.max(0, sortedNationals.length - topNationals.length);
  const nationalityLine = topNationals.length
    ? `<p class="table-sub">National identity: ${topNationals
        .map(([n, c]) => `<span class="pill pill-muted">${escapeHtml(n)} (${c})</span>`)
        .join(" ")} <span class="pill pill-muted">${nationalityCount} nationalities</span>${
        moreCount ? ` <span class="pill pill-muted">+${moreCount} more</span>` : ""
      }</p>`
    : "";

  const youngCount = summary.youngUnder23Count ?? "—";
  const seniorCount = summary.seniorOver32Count ?? "—";
  const ageLine =
    count > 0
      ? `<p class="table-sub">Youth (&lt;23): ${youngCount} · Senior (&gt;32): ${seniorCount}</p>`
      : "";
  const topList = topPlayers
    .map(
      (player) => `
        <li>
          <span>${escapeHtml(player.name)}</span>
          <span>${player.overall} OVR · ${escapeHtml(player.positions)}</span>
        </li>
      `,
    )
    .join("");

  return `
    <article class="era-card${activeClass}">
      <div class="era-card-head">
        <div style="display: flex; flex-direction: column; gap: 0.15rem;">
          <strong>FIFA ${edition}</strong>
          <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 500; text-transform: uppercase; letter-spacing: 0.03em;">${escapeHtml(league ?? "Unknown")}</span>
        </div>
        <span class="pill">${count} players</span>
      </div>
      <div class="era-stats era-stats-split">
        <div>
          <span class="stat-label">Total OVR</span>
          <span class="stat-value">${summary.avgOverall ?? "—"}</span>
        </div>
        <div>
          <span class="stat-label">Best XI OVR</span>
          <span class="stat-value">${summary.best11Overall ?? "—"}</span>
        </div>
        <div>
          <span class="stat-label">Subs OVR</span>
          <span class="stat-value">${summary.subsOverall ?? "—"}</span>
        </div>
      </div>
      ${nationalityLine}
      ${ageLine}
      <ul class="era-top-list">${topList}</ul>
    </article>
  `;
}

function renderTimeline(editionData, activeEdition) {
  if (editionData.length === 0) {
    return `<div class="panel section-panel"><p class="status">Select a club to explore its timeline.</p></div>`;
  }

  const cards = editionData
    .map(({ edition, summary, league }) => renderEditionCard(edition, summary, activeEdition, league))
    .join("");

  return `<section class="era-grid">${cards}</section>`;
}

export async function renderClubArchive({ config, career, params = {} }) {
  const initialClub = params.team ?? career.team ?? "";
  const rawEdition = params.edition;
  const initialEdition = rawEdition === "" || rawEdition == null ? null : Number(rawEdition);
  const priorityEdition = initialEdition || config.editions[config.editions.length - 1];
  const origin = params.origin ?? null;

  return renderSectionShell({
    career,
    title: "Club Archive",
    description: "Browse how clubs evolved across FIFA editions.",
    origin,
    content: `
      <section class="panel section-panel archive-controls">
        <div id="archive-club-picker">
          ${renderClubPicker({
            idPrefix: "archive-club",
            selectedClub: initialClub,
            label: "Club to inspect",
            placeholder: initialClub ? initialClub : "Select a club to inspect…",
            hint: "Preparing club index…",
            hintVariant: "loading",
            disabled: true,
          })}
        </div>
        <div id="archive-status"></div>
      </section>
      <div id="archive-timeline"></div>
    `,
  });
}

export function bindClubArchive({ config, career, scope, params = {} }) {
  const initialClub = params.team ?? career.team ?? "";
  const rawEdition = params.edition;
  const initialEdition = rawEdition === "" || rawEdition == null ? null : Number(rawEdition);
  const priorityEdition = initialEdition || config.editions[config.editions.length - 1];
  const statusRoot = document.getElementById("archive-status");
  const timeline = document.getElementById("archive-timeline");

  if (!statusRoot) return;

  statusRoot.innerHTML = renderLoadingPanel("Loading club index…", {
    detail: "Loading clubs edition by edition (first load can take up to a minute).",
    step: "Starting…",
  });

  let clubPicker = null;
  let pickerReady = false;

  const ensurePicker = (clubs, { partial = false } = {}) => {
    if (!clubs.length || !scope.isActive()) return;

    if (!pickerReady) {
      clubPicker = bindClubPicker("archive-club", loadTimeline, {
        items: clubs,
        selectedValue: initialClub,
        autoSelectSingle: false,
      });

      if (!clubPicker) return;

      pickerReady = true;
      clubPicker.setDisabled(false);
      clubPicker.setPlaceholder("Type a club name and press Enter…");
    } else {
      clubPicker.updateItems(clubs, clubPicker.getValue() || initialClub, { renderList: false });
    }

    const suffix = partial ? " (still loading more editions…)" : "";
    clubPicker.setStatus(`${clubs.length.toLocaleString()} clubs ready — type to search, Enter to select.${suffix}`, partial ? "info" : "success");
  };

  const loadTimeline = async (clubName) => {
    if (!scope.isActive()) return;

    if (!clubName) {
      statusRoot.innerHTML = renderStatus("Pick a club to compare its squads across editions.", "muted");
      timeline.innerHTML = "";
      return;
    }

    statusRoot.innerHTML = renderLoadingPanel(`Loading ${clubName} timeline…`, {
      detail: `Scanning ${config.editions.length} FIFA editions.`,
      step: "Fetching squad summaries…",
    });
    timeline.innerHTML = "";
    const timer = startLoadTimer(statusRoot);

    try {
      const editionData = await loadClubArchiveTimeline(clubName);
      if (!scope.isActive()) return;

      timer.stop();
      const present = editionData.filter(({ summary }) => (summary?.count ?? 0) > 0).length;
      statusRoot.innerHTML = renderLoadComplete(`${clubName} timeline ready`, {
        detail: `Found in ${present} of ${config.editions.length} editions.`,
      });
      timeline.innerHTML = renderTimeline(editionData, initialEdition ?? career.edition);
    } catch (error) {
      if (!scope.isActive()) return;
      timer.stop();
      statusRoot.innerHTML = renderLoadComplete(error.message, { variant: "error" });
      timeline.innerHTML = "";
    }
  };

  const boot = async () => {
    const indexTimer = startLoadTimer(statusRoot);

    try {
      const clubs = await resolveClubIndex(config.editions, {
        priorityEdition,
        onProgress: (message) => {
          if (!scope.isActive()) return;
          indexTimer.setStep(message);
        },
        onPartial: (clubs, { done }) => {
          if (!scope.isActive() || !clubs.length) return;
          ensurePicker(clubs, { partial: !done });
        },
      });

      if (!scope.isActive()) return;

      ensurePicker(clubs, { partial: false });
      indexTimer.stop();
      statusRoot.innerHTML = renderLoadComplete("Club index ready", {
        detail: `${clubs.length.toLocaleString()} clubs available. ${initialClub ? `Loading ${initialClub}…` : "Select a club below."}`,
      });

      if (initialClub) {
        await loadTimeline(initialClub);
      } else {
        timeline.innerHTML = "";
      }
    } catch (error) {
      if (!scope.isActive()) return;
      indexTimer.stop();
      const { message, hint } = formatLoadError(error);
      statusRoot.innerHTML = renderLoadComplete(`${message} ${hint}`, { variant: "error" });
    }
  };

  boot();
}