import { isCareerReady } from "../state.js";
import { escapeHtml, icon } from "../ui.js";
import { mountCombobox, renderCombobox } from "../ui/combobox.js";

export function renderSectionShell({ career, title, description, content, origin = null }) {
  const backRoute = origin === "setup" ? "setup" : isCareerReady(career) ? "home" : "setup";
  const context = isCareerReady(career)
    ? `${escapeHtml(career.team)} · FIFA ${career.edition}`
    : "Reference";

  return `
    <div class="page section-page">
      <div class="ambient ambient-a"></div>
      <div class="ambient ambient-b"></div>

      <header class="section-header">
        <button type="button" class="btn btn-ghost btn-back" data-nav="${backRoute}">
          ${icon("back", "icon-inline")}
          Back
        </button>
        <div>
          <p class="eyebrow">${context}</p>
          <p class="section-title">${escapeHtml(title)}</p>
          <p class="lead section-description">${escapeHtml(description)}</p>
        </div>
      </header>

      ${content}
    </div>
  `;
}

export function formatMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "—";

  if (amount >= 1_000_000) {
    return `€${(amount / 1_000_000).toFixed(1)}M`;
  }

  if (amount >= 1_000) {
    return `€${Math.round(amount / 1_000)}K`;
  }

  return `€${amount}`;
}

export function renderStatus(message, variant = "muted") {
  return `<p class="status status-${variant}" aria-live="polite">${escapeHtml(message)}</p>`;
}

export function renderClubPicker({
  idPrefix,
  clubs,
  selectedClub,
  label = "Club",
  placeholder = "Type a club name and press Enter...",
  hint = "Type to search clubs across all editions.",
  disabled = false,
}) {
  return renderCombobox({
    idPrefix,
    label,
    placeholder,
    hint,
    hintVariant: selectedClub ? "success" : disabled ? "loading" : "info",
    selectedValue: selectedClub,
    disabled,
  });
}

export function bindClubPicker(idPrefix, onChange, { items = [], selectedValue = "", autoSelectSingle = true } = {}) {
  return mountCombobox(idPrefix, {
    items,
    selectedValue,
    onSelect: (value) => onChange(value),
    autoSelectSingle,
  });
}

export function renderPlayerTable(players, { highlightClub } = {}) {
  if (players.length === 0) {
    return `<div class="empty-state">No players matched your search.</div>`;
  }

  const rows = players
    .map((player) => {
      const isCurrentClub = highlightClub && player.club === highlightClub;
      return `
        <tr class="${isCurrentClub ? "row-highlight" : ""}">
          <td>
            <strong>${escapeHtml(player.name)}</strong>
            <span class="table-sub">${escapeHtml(player.fullName)}</span>
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
            <th>Club</th>
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
