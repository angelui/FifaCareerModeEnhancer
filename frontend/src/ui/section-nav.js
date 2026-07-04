import { escapeHtml, icon } from "../ui.js";

/**
 * Renders a left-sidebar layout with one visible pane at a time.
 * @param {{ id: string, label: string, icon?: string, content: string }[]} panes
 * @param {string} [activeId] - defaults to first pane
 * @param {string} [navId] - optional root id for bindSectionNav
 */
export function renderSectionNav(panes, activeId, navId = "section-nav") {
  if (!panes?.length) return "";

  const defaultId = activeId ?? panes[0].id;
  const buttons = panes
    .map(
      ({ id, label, icon: iconName }) => `
        <button
          type="button"
          class="sidebar-menu-btn${id === defaultId ? " active" : ""}"
          data-section-pane="${escapeHtml(id)}"
          aria-current="${id === defaultId ? "page" : "false"}"
        >
          ${iconName ? icon(iconName, "icon-inline") : ""}
          ${escapeHtml(label)}
        </button>
      `,
    )
    .join("");

  const paneHtml = panes
    .map(
      ({ id, content }) => `
        <div
          class="sidebar-pane${id === defaultId ? " active" : ""}"
          data-pane-panel="${escapeHtml(id)}"
          ${id !== defaultId ? "hidden" : ""}
        >
          ${content}
        </div>
      `,
    )
    .join("");

  return `
    <div id="${escapeHtml(navId)}" class="sidebar-layout">
      <aside class="sidebar-nav">${buttons}</aside>
      <div class="sidebar-content">${paneHtml}</div>
    </div>
  `;
}

/**
 * Binds sidebar button clicks. Optionally lazy-activates panes on first visit.
 * @param {string|HTMLElement} root - nav root id or element
 * @param {{ onActivate?: (paneId: string) => void, defaultPane?: string }} [options]
 */
export function bindSectionNav(root, { onActivate, defaultPane } = {}) {
  const navRoot = typeof root === "string" ? document.getElementById(root) : root;
  if (!navRoot) return;

  const activated = new Set();
  const buttons = navRoot.querySelectorAll("[data-section-pane]");
  const panels = navRoot.querySelectorAll("[data-pane-panel]");

  const showPane = (paneId) => {
    buttons.forEach((btn) => {
      const isActive = btn.getAttribute("data-section-pane") === paneId;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-current", isActive ? "page" : "false");
    });

    panels.forEach((panel) => {
      const isActive = panel.getAttribute("data-pane-panel") === paneId;
      panel.classList.toggle("active", isActive);
      panel.hidden = !isActive;
    });

    if (onActivate && !activated.has(paneId)) {
      activated.add(paneId);
      onActivate(paneId);
    }
  };

  const initial =
    defaultPane ??
    navRoot.querySelector(".sidebar-menu-btn.active")?.getAttribute("data-section-pane") ??
    buttons[0]?.getAttribute("data-section-pane");

  if (initial) {
    activated.add(initial);
    showPane(initial);
    if (onActivate) onActivate(initial);
  }

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const paneId = button.getAttribute("data-section-pane");
      if (paneId) showPane(paneId);
    });
  });
}
