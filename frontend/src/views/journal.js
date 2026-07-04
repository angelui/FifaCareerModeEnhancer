import { fetchClubNarrative, fetchGenAiEnhance, fetchGenAiStatus } from "../api.js";
import { escapeHtml } from "../ui.js";
import { assertCareerReady, markSectionReady, runSectionLoader } from "../ui/section-loader.js";
import { bindSectionNav } from "../ui/section-nav.js";
import { renderSectionShell, renderStatus } from "./section-shell.js";

const storylineLabels = {
  era: "Current era",
  philosophy: "Identity",
  squad: "Squad arc",
  future: "Timeline",
  legacy: "Club history",
  timeline: "Long-term arc",
};

function renderStoryline(storyline, { ai = false } = {}) {
  const aiClass = ai ? " narrative-card-ai" : "";
  const aiBadge = ai ? '<span class="pill pill-ai">AI</span>' : "";
  return `
    <article class="narrative-card storyline-card storyline-${escapeHtml(storyline.type ?? "default")}${aiClass}">
      <div class="narrative-card-head">
        <p class="eyebrow">${escapeHtml(storylineLabels[storyline.type] ?? "Storyline")}</p>
        ${aiBadge}
      </div>
      <h3>${escapeHtml(storyline.title ?? "")}</h3>
      <p class="narrative-body">${escapeHtml(storyline.body ?? "")}</p>
    </article>
  `;
}

function renderObjectives(objectives = [], { ai = false, hint = null } = {}) {
  if (!objectives.length) {
    return renderStatus("No board objectives generated for this club.", "muted");
  }

  const items = objectives
    .map((objective) => {
      const goldClass = objective.gold ? " narrative-list-gold" : "";
      return `<li class="${goldClass.trim()}">${escapeHtml(objective.text)}</li>`;
    })
    .join("");

  const defaultHint = ai
    ? "Generated locally with Ollama from your squad data and save progress."
    : "Derived from squad tier and club philosophy — use these to frame your career mode story.";

  return `
    <section class="narrative-card${ai ? " narrative-card-ai" : ""}">
      <div class="narrative-card-head">
        <p class="eyebrow">Board expectations</p>
        ${ai ? '<span class="pill pill-ai">AI</span>' : ""}
      </div>
      <h3>${ai ? "AI objectives" : "Suggested objectives"}</h3>
      <p class="form-hint">${escapeHtml(hint ?? defaultHint)}</p>
      <ul class="narrative-list">${items}</ul>
    </section>
  `;
}

function renderAiInsights() {
  return `
    <section class="panel section-panel genai-panel">
      <div class="panel-header-inline">
        <div>
          <h3>AI narrative layer</h3>
          <p class="form-hint">Offline generation via Ollama — click Enhance to refresh.</p>
        </div>
        <button type="button" class="btn btn-primary" id="journal-genai-btn">Enhance with AI</button>
      </div>
      <div id="journal-genai-status"></div>
      <div id="journal-genai-content" hidden></div>
    </section>
  `;
}

export async function renderJournal({ career }) {
  return renderSectionShell({
    career,
    title: "Career Narrative",
    description: "Dataset storylines plus optional offline AI enhancement via Ollama.",
    defaultPane: "storylines",
    panes: [
      {
        id: "storylines",
        label: "Storylines",
        icon: "book",
        content: `
          <div id="journal-loading"></div>
          <div id="journal-storylines-root" hidden></div>
          <div id="journal-ai-root"></div>
        `,
      },
      {
        id: "objectives",
        label: "Board objectives",
        icon: "target",
        content: `
          <div id="journal-objectives-root"></div>
          <div id="journal-ai-objectives-root"></div>
        `,
      },
    ],
  });
}

function renderGenAiStatus(message, tone = "muted") {
  return renderStatus(message, tone);
}

function bindGenAiEnhance({ career }) {
  const btn = document.getElementById("journal-genai-btn");
  const statusRoot = document.getElementById("journal-genai-status");
  const contentRoot = document.getElementById("journal-genai-content");
  const aiObjectivesRoot = document.getElementById("journal-ai-objectives-root");

  if (!btn || !statusRoot) return;

  const renderAiResult = (result) => {
    const storylines = result?.storylines ?? [];
    const objectives = result?.objectives ?? [];
    const insights = result?.insights ?? [];
    const seasonHook = result?.seasonHook ?? "";

    if (contentRoot) {
      contentRoot.hidden = false;
      contentRoot.innerHTML = `
        ${seasonHook ? `
          <section class="narrative-card narrative-card-ai narrative-card-featured">
            <div class="narrative-card-head">
              <p class="eyebrow">Season opener</p>
              <span class="pill pill-ai">AI</span>
            </div>
            <p class="narrative-body">${escapeHtml(seasonHook)}</p>
          </section>
        ` : ""}
        ${insights.length ? `
          <section class="narrative-card narrative-card-ai">
            <div class="narrative-card-head">
              <p class="eyebrow">Insights</p>
              <span class="pill pill-ai">AI</span>
            </div>
            <ul class="narrative-list">${insights.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
          </section>
        ` : ""}
        <div class="storyline-grid">
          ${storylines.length
            ? storylines.map((item) => renderStoryline(item, { ai: true })).join("")
            : renderStatus("No AI storylines returned.", "muted")}
        </div>
      `;
    }

    if (aiObjectivesRoot && objectives.length) {
      aiObjectivesRoot.innerHTML = renderObjectives(objectives, { ai: true });
    }
  };

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    statusRoot.innerHTML = renderGenAiStatus("Generating with local Ollama model…", "muted");

    try {
      const result = await fetchGenAiEnhance({
        edition: career.edition,
        team: career.team,
        profileId: career.profileId,
        scope: "all",
      });
      statusRoot.innerHTML = renderGenAiStatus("AI narrative ready.", "success");
      renderAiResult(result);
    } catch (error) {
      statusRoot.innerHTML = renderGenAiStatus(error?.message ?? "AI generation failed.", "error");
    } finally {
      btn.disabled = false;
    }
  });

  fetchGenAiStatus()
    .then((status) => {
      if (!status.available) {
        statusRoot.innerHTML = renderGenAiStatus(
          status.hint ?? "Ollama is offline. Install it and pull a small model to enable AI.",
          "muted",
        );
        btn.disabled = true;
        return;
      }
      if (!status.modelReady) {
        statusRoot.innerHTML = renderGenAiStatus(status.hint ?? "Model not installed.", "muted");
        btn.disabled = true;
        return;
      }
      statusRoot.innerHTML = renderGenAiStatus(
        `Ready · ${status.model} (offline)`,
        "muted",
      );
    })
    .catch(() => {
      statusRoot.innerHTML = renderGenAiStatus("Could not reach GenAI status endpoint.", "muted");
    });
}

export function bindJournal({ career, scope }) {
  const loading = document.getElementById("journal-loading");
  const storylinesRoot = document.getElementById("journal-storylines-root");
  const objectivesRoot = document.getElementById("journal-objectives-root");
  const aiRoot = document.getElementById("journal-ai-root");

  if (!assertCareerReady(career, loading)) return;

  bindSectionNav("section-nav");

  runSectionLoader(scope, loading, async ({ setStep }) => {
    setStep("Generating storylines from squad and timeline data…");
    const payload = await fetchClubNarrative(career.edition, career.team);
    const storylines = payload.storylines ?? [];

    markSectionReady(
      loading,
      "Narrative ready",
      `${storylines.length} storylines · ${payload.suggestedObjectives?.length ?? 0} board objectives`,
    );

    if (storylinesRoot) {
      storylinesRoot.hidden = false;
      storylinesRoot.innerHTML = `
        <section class="panel section-panel">
          <div class="panel-header-inline">
            <div>
              <h3>FIFA ${career.edition} storylines</h3>
              <p class="form-hint">Generated from ${escapeHtml(career.team)} squad profile, era shifts, and cross-edition player movement.</p>
            </div>
          </div>
          <div class="storyline-grid">
            ${storylines.length ? storylines.map((item) => renderStoryline(item)).join("") : renderStatus("No storylines available for this club.", "muted")}
          </div>
        </section>
      `;
    }
    if (objectivesRoot) {
      objectivesRoot.innerHTML = renderObjectives(payload.suggestedObjectives);
    }
    if (aiRoot) {
      aiRoot.innerHTML = renderAiInsights();
      bindGenAiEnhance({ career });
    }

    return payload;
  }, {
    message: "Building career narrative…",
    detail: "Cross-checking squad data, era shifts, and player movement.",
    step: "Starting…",
  });
}
