import { escapeHtml, icon } from "../ui.js";
import { isCareerReady } from "../state.js";

export async function renderHome({ config, career }) {
  const sectionCards = config.sections
    .map(
      (section) => `
        <button
          type="button"
          class="menu-card"
          data-nav="section"
          data-nav-params="id,origin"
          data-id="${escapeHtml(section.id)}"
          data-origin="home"
        >
          <span class="menu-card-icon">${icon(section.icon ?? "shield")}</span>
          <span class="menu-card-body">
            <strong>${escapeHtml(section.label)}</strong>
            <span>${escapeHtml(section.description)}</span>
          </span>
          <span class="menu-card-arrow">${icon("arrow", "icon-inline")}</span>
        </button>
      `,
    )
    .join("");

  return `
    <div class="page home-page">
      <div class="ambient ambient-a"></div>
      <div class="ambient ambient-b"></div>

      <header class="home-header">
        <div class="home-header-top">
          <button type="button" class="btn btn-ghost" id="change-career">Change club</button>
          ${
            isCareerReady(career)
              ? `<p class="eyebrow home-header-info">${escapeHtml(career.team)} · FIFA ${escapeHtml(String(career.edition))}</p>`
              : ""
          }
        </div>
      </header>
 
      <br>
      <main class="home-grid">
        ${sectionCards}
      </main>
      <br>
      <header class="home-header">
        <div id="home-career-panel" class="home-career-panel">
          <p class="form-hint">Loading career overview…</p>
        </div>
      </header>
    </div>
  `;
}
