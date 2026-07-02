import { fetchBootstrapStart, fetchBootstrapStatus, fetchHealth, fetchClubsForEdition, fetchAllClubs } from "./api.js";
import { prefetchClubsForEditions, setCachedAllClubs } from "./data-cache.js";
import { loadConfig } from "./config.js";
import { escapeHtml } from "./ui.js";

const POLL_MS = 400;

function formatNumber(value) {
  if (value == null) return null;
  return Number(value).toLocaleString();
}

function formatStepMeta(step) {
  if (step.state === "error" && step.message) {
    return step.message;
  }

  if (step.state === "active") {
    return "Loading…";
  }

  if (step.state === "pending") {
    return "Waiting";
  }

  const parts = [];
  if (step.rows != null) {
    parts.push(`${formatNumber(step.rows)} players`);
  }
  if (step.clubs != null) {
    parts.push(`${formatNumber(step.clubs)} clubs`);
  }

  return parts.length ? parts.join(" · ") : "Ready";
}

function renderStepIcon(state) {
  if (state === "done") {
    return `<span class="bootstrap-step-icon bootstrap-step-icon-done" aria-hidden="true">✓</span>`;
  }
  if (state === "active") {
    return `<span class="bootstrap-step-icon bootstrap-step-icon-active" aria-hidden="true"></span>`;
  }
  if (state === "error") {
    return `<span class="bootstrap-step-icon bootstrap-step-icon-error" aria-hidden="true">!</span>`;
  }
  return `<span class="bootstrap-step-icon bootstrap-step-icon-pending" aria-hidden="true"></span>`;
}

function renderBootstrapPage(config, status) {
  const percent = status?.progress?.percent ?? 0;
  const completed = status?.progress?.completedSteps ?? 0;
  const total = status?.progress?.totalSteps ?? 0;
  const elapsedSec =
    status?.elapsedMs != null ? (status.elapsedMs / 1000).toFixed(1) : "0.0";
  const steps = status?.steps ?? [];
  const isError = status?.status === "error";
  const isReady = status?.status === "ready";

  const stepRows = steps
    .map(
      (step) => `
        <li class="bootstrap-step bootstrap-step-${step.state}">
          ${renderStepIcon(step.state)}
          <div class="bootstrap-step-body">
            <strong>${escapeHtml(step.label)}</strong>
            <span>${escapeHtml(formatStepMeta(step))}</span>
          </div>
        </li>
      `,
    )
    .join("");

  const headline = isReady
    ? "Datasets ready"
    : isError
      ? "Could not load datasets"
      : "Preparing offline datasets…";

  const subline = isReady
    ? "All editions are cached. Opening the app…"
    : isError
      ? escapeHtml(status?.errorMessage || "Check that the backend is running, then retry.")
      : "Loading FIFA 15–20 player data into memory. First start can take a few seconds.";

  return `
    <div class="page bootstrap-page">
      <div class="ambient ambient-a"></div>
      <div class="ambient ambient-b"></div>

      <header class="bootstrap-header">
        <p class="eyebrow">Offline career companion</p>
        <h1>${escapeHtml(config.appName)}</h1>
        <p class="lead bootstrap-lead">${headline}</p>
        <p class="bootstrap-subline">${subline}</p>
      </header>

      <section class="panel bootstrap-panel">
        <div class="bootstrap-progress-head">
          <span>${completed} of ${total} steps</span>
          <span>${percent}%</span>
        </div>
        <div class="bootstrap-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}">
          <div class="bootstrap-progress-fill" style="width: ${percent}%"></div>
        </div>
        <p class="bootstrap-elapsed">${elapsedSec}s elapsed</p>

        <ol class="bootstrap-steps">${stepRows}</ol>

        <div class="bootstrap-actions">
          <button type="button" class="btn btn-ghost" id="bootstrap-retry" ${isError ? "" : "hidden"}>
            Retry loading
          </button>
        </div>
      </section>
    </div>
  `;
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function buildInitialSteps(editions) {
  const steps = [
    { id: "health", label: "API connection", state: "pending", rows: null, clubs: null, message: null },
  ];

  for (const edition of editions) {
    steps.push({
      id: `edition-${edition}`,
      label: `FIFA ${edition} players`,
      state: "pending",
      rows: null,
      clubs: null,
      message: null,
    });
  }

  steps.push({
    id: "clubs-index",
    label: "Global club index",
    state: "pending",
    rows: null,
    clubs: null,
    message: null,
  });

  return steps;
}

function progressFromSteps(steps) {
  const total = steps.length;
  const completed = steps.filter((step) => step.state === "done").length;
  return {
    completedSteps: completed,
    totalSteps: total,
    percent: total ? Math.round((completed / total) * 100) : 0,
  };
}

function formatBootstrapError(error) {
  const message = error?.message || "Unknown error";

  if (message === "Not Found" || message.includes("404")) {
    return "Bootstrap API not found. Stop the backend (Ctrl+C) and restart it: uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000";
  }

  if (message.includes("Failed to fetch") || message.includes("NetworkError")) {
    return "Cannot reach the backend API. Start it with: uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000";
  }

  return message;
}

async function runClientBootstrap(config, onUpdate) {
  const startedAt = Date.now();
  const steps = buildInitialSteps(config.editions);

  const update = (patch = {}) => {
    const status = {
      status: patch.status ?? "loading",
      steps,
      progress: progressFromSteps(steps),
      elapsedMs: Date.now() - startedAt,
      errorMessage: patch.errorMessage ?? null,
    };
    onUpdate(status);
    return status;
  };

  const setStep = (stepId, state, meta = {}) => {
    const step = steps.find((entry) => entry.id === stepId);
    if (!step) return;
    step.state = state;
    Object.assign(step, meta);
  };

  update();

  try {
    setStep("health", "active");
    update();
    await fetchHealth();
    setStep("health", "done");
    update();

    for (const edition of config.editions) {
      const stepId = `edition-${edition}`;
      setStep(stepId, "active");
      update();
      const clubs = await fetchClubsForEdition(edition);
      setStep(stepId, "done", { clubs: clubs.length });
      update();
    }

    setStep("clubs-index", "active");
    update();
    const allClubs = await fetchAllClubs();
    setCachedAllClubs(allClubs);
    setStep("clubs-index", "done", { clubs: allClubs.length });
    return update({ status: "ready" });
  } catch (error) {
    const activeStep = steps.find((step) => step.state === "active");
    if (activeStep) {
      activeStep.state = "error";
      activeStep.message = error.message;
    }
    return update({ status: "error", errorMessage: formatBootstrapError(error) });
  }
}

function isBootstrapMissingError(error) {
  const message = error?.message || "";
  return message === "Not Found" || message.includes("404");
}

function emptyErrorStatus(message, steps = []) {
  const resolvedSteps = steps.length ? steps : buildInitialSteps([]);
  return {
    status: "error",
    errorMessage: formatBootstrapError({ message }),
    steps: resolvedSteps,
    progress: progressFromSteps(resolvedSteps),
    elapsedMs: 0,
  };
}

async function runServerBootstrap(onUpdate) {
  let status = await fetchBootstrapStart();
  onUpdate(status);

  while (status.status === "loading") {
    await sleep(POLL_MS);
    status = await fetchBootstrapStatus();
    onUpdate(status);
  }

  return status;
}

export async function runBootstrap() {
  const app = document.getElementById("app");
  const config = await loadConfig();
  let status = null;
  let retryHandler = null;

  const paint = () => {
    app.innerHTML = renderBootstrapPage(config, status);
    document.getElementById("bootstrap-retry")?.addEventListener("click", () => retryHandler?.());
  };

  const waitForRetry = () =>
    new Promise((resolve) => {
      retryHandler = resolve;
    });

  while (true) {
    try {
      status = await runServerBootstrap((nextStatus) => {
        status = nextStatus;
        paint();
      });
    } catch (error) {
      if (isBootstrapMissingError(error)) {
        status = await runClientBootstrap(config, (nextStatus) => {
          status = nextStatus;
          paint();
        });
      } else {
        status = emptyErrorStatus(error.message, buildInitialSteps(config.editions));
        paint();
        await waitForRetry();
        continue;
      }
    }

    paint();

    if (status.status === "ready") {
      await prefetchClubsForEditions(config.editions, fetchClubsForEdition);
      try {
        const allClubs = await fetchAllClubs();
        setCachedAllClubs(allClubs);
      } catch {
        // Per-edition caches are enough for most views.
      }
      await sleep(450);
      return;
    }

    if (status.status === "error") {
      await waitForRetry();
      continue;
    }
  }
}
