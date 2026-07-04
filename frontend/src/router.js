import { loadConfig } from "./config.js";
import { beginSectionScope } from "./section-scope.js";
import { isCareerReady, loadCareer } from "./state.js";
import { renderSetup, bindSetupForm } from "./views/setup.js";
import { renderHome } from "./views/home.js";
import { renderSection, bindSection } from "./views/section.js";
import { fetchClubNarrative, fetchPlayersByClub } from "./api.js";
import { escapeHtml } from "./ui.js";
import { formatMoney } from "./views/section-shell.js";

const routes = {
  setup: renderSetup,
  home: renderHome,
  section: renderSection,
};

function parseRoute() {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const [path, queryString = ""] = hash.split("?");
  const segments = path.split("/").filter(Boolean);
  const params = Object.fromEntries(new URLSearchParams(queryString));

  return { segments, params };
}

function defaultRoute(career) {
  return isCareerReady(career) ? "home" : "setup";
}

export async function navigate(routeName, params = {}, { replace = false } = {}) {
  const query = new URLSearchParams(params).toString();
  const hash = query ? `#/${routeName}?${query}` : `#/${routeName}`;

  if (replace) {
    window.location.replace(hash);
  } else {
    window.location.hash = hash.slice(1);
  }
}

async function render() {
  const scope = beginSectionScope();
  const app = document.getElementById("app");
  const config = await loadConfig();
  const career = loadCareer();
  const { segments, params } = parseRoute();

  let routeName = segments[0] || defaultRoute(career);
  if (routeName === "home" && !isCareerReady(career)) {
    routeName = "setup";
  }

  const renderer = routes[routeName] ?? routes.setup;
  const result = await renderer({ config, career, params, segments, scope });
  const html = typeof result === "string" ? result : result.html;
  app.innerHTML = html;
  bindGlobalHandlers(config, career);
  if (routeName === "home") {
    bindHomePanel(career);
  }
  if (routeName === "setup") {
    bindSetupForm(config, career);
  }
  if (routeName === "section" && typeof result === "object" && result.itemId) {
    bindSection({ config, career, params, segments, scope }, result.itemId);
  }
}

function bindGlobalHandlers(config, career) {
  document.querySelectorAll("[data-nav]").forEach((element) => {
    element.addEventListener("click", (event) => {
      event.preventDefault();
      const route = element.getAttribute("data-nav");
      const paramKeys = (element.getAttribute("data-nav-params") || "")
        .split(",")
        .map((key) => key.trim())
        .filter(Boolean);

      const params = {};
      paramKeys.forEach((key) => {
        const value = element.getAttribute(`data-${key}`);
        if (value) params[key] = value;
      });

      navigate(route, params);
    });
  });

  const changeCareerBtn = document.getElementById("change-career");
  if (changeCareerBtn) {
    changeCareerBtn.addEventListener("click", () => navigate("setup"));
  }
}

function bindHomePanel(career) {
  const panel = document.getElementById("home-career-panel");
  if (!panel) return;

  if (!isCareerReady(career)) {
    panel.innerHTML = `<p class="form-hint">Select a FIFA edition and club on the setup screen to unlock the career hub.</p>`;
    return;
  }

  panel.innerHTML = `<p class="form-hint">Loading ${escapeHtml(career.team)} overview…</p>`;

  Promise.all([
    fetchPlayersByClub(career.edition, career.team),
    fetchClubNarrative(career.edition, career.team).catch(() => null),
  ])
    .then(([players, narrative]) => {
      const profile = narrative?.profile ?? {};
      const philosophy = narrative?.philosophy ?? {};
      const budget = narrative?.budget ?? {};

      const overalls = players
        .map((player) => Number(player.overall))
        .filter((value) => Number.isFinite(value));
      const avgOverall = overalls.length
        ? Math.round(overalls.reduce((sum, value) => sum + value, 0) / overalls.length)
        : profile.avgOverall ?? "—";

      const tags = (philosophy.tags ?? [])
        .slice(0, 4)
        .map((tag) => `<span class="pill">${escapeHtml(tag)}</span>`)
        .join("");

      panel.innerHTML = `
        <p class="eyebrow">${escapeHtml(career.team)} · FIFA ${escapeHtml(String(career.edition))}</p>
        <h1 class="home-club-title">${escapeHtml(philosophy.title ?? career.team)}</h1>
        ${
          philosophy.summary
            ? `<p class="lead home-club-lead">${escapeHtml(philosophy.summary)}</p>`
            : `<p class="lead home-club-lead">Career hub for ${escapeHtml(career.team)} in FIFA ${escapeHtml(String(career.edition))}.</p>`
        }
        ${tags ? `<div class="tag-row">${tags}</div>` : ""}
        <div class="stat-grid home-stat-grid">
          <div><span class="stat-label">Squad size</span><span class="stat-value">${players.length || profile.count || 0}</span></div>
          <div><span class="stat-label">Avg OVR</span><span class="stat-value">${avgOverall}</span></div>
          <div><span class="stat-label">Stars (85+)</span><span class="stat-value">${profile.starCount ?? "—"}</span></div>
          <div><span class="stat-label">Prospects</span><span class="stat-value">${profile.prospectCount ?? "—"}</span></div>
          <div><span class="stat-label">Max transfer</span><span class="stat-value">${budget.maxTransfer ? formatMoney(budget.maxTransfer) : "—"}</span></div>
          <div><span class="stat-label">Max wage</span><span class="stat-value">${budget.maxWage ? formatMoney(budget.maxWage) : "—"}</span></div>
        </div>
      `;
    })
    .catch((error) => {
      panel.innerHTML = `<p class="status status-error">${escapeHtml(error.message || "Could not load career overview.")}</p>`;
    });
}

export function startRouter() {
  window.addEventListener("hashchange", render);
  render();
}
