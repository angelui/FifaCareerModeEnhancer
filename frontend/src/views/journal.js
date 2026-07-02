import { fetchClubNarrative } from "../api.js";
import { escapeHtml } from "../ui.js";
import { assertCareerReady, markSectionReady, runSectionLoader } from "../ui/section-loader.js";
import { renderSectionShell, renderStatus } from "./section-shell.js";

const storylineLabels = {
  era: "Current era",
  philosophy: "Identity",
  squad: "Squad arc",
  future: "Timeline",
  legacy: "Club history",
  timeline: "Long-term arc",
};

function renderStoryline(storyline) {
  return `
    <article class="narrative-card storyline-card storyline-${escapeHtml(storyline.type ?? "default")}">
      <p class="eyebrow">${escapeHtml(storylineLabels[storyline.type] ?? "Storyline")}</p>
      <h3>${escapeHtml(storyline.title ?? "")}</h3>
      <p class="narrative-body">${escapeHtml(storyline.body ?? "")}</p>
    </article>
  `;
}

function renderObjectives(objectives = []) {
  if (!objectives.length) {
    return renderStatus("No board objectives generated for this club.", "muted");
  }

  const items = objectives
    .map((objective) => `<li>${escapeHtml(objective.text)}</li>`)
    .join("");

  return `
    <section class="narrative-card">
      <p class="eyebrow">Board expectations</p>
      <h3>Suggested objectives</h3>
      <p class="form-hint">Derived from squad tier and club philosophy — use these to frame your career mode story.</p>
      <ul class="narrative-list">${items}</ul>
    </section>
  `;
}

export async function renderJournal({ career }) {
  return renderSectionShell({
    career,
    title: "Career Narrative",
    description: "Auto-generated storylines, arcs, and board expectations for your save.",
    content: `
      <div id="journal-loading"></div>
      <div id="journal-content" hidden></div>
    `,
  });
}

export function bindJournal({ career, scope }) {
  const loading = document.getElementById("journal-loading");
  const content = document.getElementById("journal-content");

  if (!assertCareerReady(career, loading)) return;

  runSectionLoader(scope, loading, async ({ setStep }) => {
    setStep("Generating storylines from squad and timeline data…");
    const payload = await fetchClubNarrative(career.edition, career.team);
    const storylines = payload.storylines ?? [];

    markSectionReady(loading, "Narrative ready", `${storylines.length} storylines · ${payload.suggestedObjectives?.length ?? 0} board objectives`);
    content.hidden = false;
    content.innerHTML = `
      <section class="panel section-panel">
        <div class="panel-header-inline">
          <h3>FIFA ${career.edition} storylines</h3>
          <p class="form-hint">Generated from ${escapeHtml(career.team)} squad profile, era shifts, and cross-edition player movement.</p>
        </div>
        <div class="storyline-grid">
          ${storylines.length ? storylines.map(renderStoryline).join("") : renderStatus("No storylines available for this club.", "muted")}
        </div>
      </section>
      ${renderObjectives(payload.suggestedObjectives)}
    `;

    return payload;
  }, {
    message: "Building career narrative…",
    detail: "Cross-checking squad data, era shifts, and player movement.",
    step: "Starting…",
  });
}
