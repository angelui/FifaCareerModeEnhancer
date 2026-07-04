const icons = {
  shield: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
  target: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>`,
  users: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3ZM8 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm8 2c2.2 0 4 1.2 4 3v1H12v-1c0-1.8 1.8-3 4-3ZM4 16c0-1.8 1.8-3 4-3s4 1.2 4 3v1H4v-1Z" fill="currentColor"/></svg>`,
  book: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h8a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Zm10 0h4v16h-4V4Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
  archive: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="4" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8M10 12h4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  arrow: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h12M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  back: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H7M11 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  table: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 10h18M9 10v9M15 10v9" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`,
};

export function icon(name, className = "icon") {
  const markup = icons[name] ?? icons.shield;
  return `<span class="${className}">${markup}</span>`;
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function button(label, { type = "button", variant = "primary", className = "", attrs = "" } = {}) {
  return `<button type="${type}" class="btn btn-${variant} ${className}" ${attrs}>${label}</button>`;
}
