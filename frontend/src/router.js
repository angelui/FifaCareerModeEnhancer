import { loadConfig } from "./config.js";
import { beginSectionScope } from "./section-scope.js";
import { isCareerReady, loadCareer } from "./state.js";
import { renderSetup, bindSetupForm } from "./views/setup.js";
import { renderHome } from "./views/home.js";
import { renderSection, bindSection } from "./views/section.js";

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

export function startRouter() {
  window.addEventListener("hashchange", render);
  render();
}
