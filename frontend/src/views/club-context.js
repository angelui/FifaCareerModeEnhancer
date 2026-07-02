import { fetchClubNarrative } from "../api.js";
import { escapeHtml } from "../ui.js";
import { assertCareerReady, markSectionReady, runSectionLoader } from "../ui/section-loader.js";
import { formatMoney, renderSectionShell } from "./section-shell.js";

function renderTags(tags = []) {
  if (!tags.length) return "";
  return `<div class="tag-row">${tags.map((tag) => `<span class="pill">${escapeHtml(tag)}</span>`).join("")}</div>`;
}

function renderProfileStats(profile) {
  return `
    <div class="stat-grid">
      <div><span class="stat-label">Squad size</span><span class="stat-value">${profile.count}</span></div>
      <div><span class="stat-label">Avg age</span><span class="stat-value">${profile.avgAge ?? "—"}</span></div>
      <div><span class="stat-label">Avg OVR</span><span class="stat-value">${profile.avgOverall ?? "—"}</span></div>
      <div><span class="stat-label">Young (&lt;23)</span><span class="stat-value">${profile.youngUnder23Count ?? profile.youthCount ?? "—"}</span></div>
      <div><span class="stat-label">Senior (&gt;32)</span><span class="stat-value">${profile.seniorOver32Count ?? profile.veteranCount ?? "—"}</span></div>
      <div><span class="stat-label">Stars (85+)</span><span class="stat-value">${profile.starCount}</span></div>
      <div><span class="stat-label">Prospects</span><span class="stat-value">${profile.prospectCount}</span></div>
    </div>
  `;
}

function renderPhilosophy(philosophy) {
  const pillars = (philosophy.pillars ?? [])
    .map((pillar) => `<li>${escapeHtml(pillar)}</li>`)
    .join("");

  return `
    <section class="narrative-card narrative-card-featured">
      <p class="eyebrow">Generated philosophy</p>
      <h3>${escapeHtml(philosophy.title ?? "Club identity")}</h3>
      ${renderTags(philosophy.tags)}
      <p class="narrative-body">${escapeHtml(philosophy.summary ?? "")}</p>
      ${pillars ? `<ul class="narrative-list">${pillars}</ul>` : ""}
    </section>
  `;
}

function renderBudget(budget) {
  return `
    <section class="narrative-card">
      <p class="eyebrow">Transfer guidance</p>
      <h3>Budget limits</h3>
      <div class="stat-grid stat-grid-compact">
        <div><span class="stat-label">Max transfer</span><span class="stat-value">${formatMoney(budget.maxTransfer)}</span></div>
        <div><span class="stat-label">Max weekly wage</span><span class="stat-value">${formatMoney(budget.maxWage)}</span></div>
      </div>
      <p class="narrative-body">${escapeHtml(budget.rationale ?? "")}</p>
    </section>
  `;
}

function renderEraTimeline(eras, activeEdition) {
  const cards = eras
    .map((era) => {
      const activeClass = Number(era.edition) === Number(activeEdition) ? " era-card-active" : "";
      const delta =
        era.deltaOverall == null
          ? ""
          : `<span class="pill pill-muted">${era.deltaOverall > 0 ? "+" : ""}${era.deltaOverall} OVR</span>`;

      return `
        <article class="era-card${activeClass}">
          <div class="era-card-head">
            <strong>FIFA ${era.edition}</strong>
            ${delta}
          </div>
          <h4>${escapeHtml(era.headline ?? "")}</h4>
          <p class="narrative-body">${escapeHtml(era.narrative ?? "")}</p>
        </article>
      `;
    })
    .join("");

  return `<section class="era-grid">${cards}</section>`;
}

export async function renderClubContext({ career }) {
  return renderSectionShell({
    career,
    title: "Club Context",
    description: "Dataset-driven philosophy, budget guidance, and era narratives for your club.",
    content: `
      <div id="context-loading"></div>
      <div id="context-content" hidden></div>
    `,
  });
}

export function bindClubContext({ career, scope }) {
  const loading = document.getElementById("context-loading");
  const content = document.getElementById("context-content");

  if (!assertCareerReady(career, loading)) return;

  runSectionLoader(scope, loading, async ({ setStep }) => {
    setStep("Analyzing squad profile and edition timeline…");
    const payload = await fetchClubNarrative(career.edition, career.team);

    markSectionReady(loading, "Club context ready", `${payload.philosophy?.title ?? "Identity"} · ${payload.eraNarratives?.length ?? 0} era snapshots`);
    content.hidden = false;
    content.innerHTML = `
      ${renderPhilosophy(payload.philosophy ?? {})}
      ${renderBudget(payload.budget ?? {})}
      <section class="panel section-panel">
        <h3>Squad profile · FIFA ${career.edition}</h3>
        ${renderProfileStats(payload.profile ?? {})}
      </section>
      <section class="panel section-panel">
        <div class="panel-header-inline">
          <h3>Era narratives</h3>
          <p class="form-hint">How ${escapeHtml(career.team)} shifts across FIFA 15–20 in the dataset.</p>
        </div>
        ${renderEraTimeline(payload.eraNarratives ?? [], career.edition)}
      </section>
    `;

    return payload;
  }, {
    message: "Generating club context…",
    detail: "Building philosophy, budget guidance, and era narratives.",
    step: "Starting…",
  });
}
