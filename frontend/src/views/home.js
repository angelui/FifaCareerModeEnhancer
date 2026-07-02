import { escapeHtml, icon } from "../ui.js";

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
      <div class="home-actions">
        <button type="button" class="btn btn-ghost" id="change-career">Change club</button>
      </div>

      <main class="home-grid">
        ${sectionCards}
      </main>
    </div>
  `;
}
