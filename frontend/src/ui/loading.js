import { escapeHtml } from "../ui.js";

export function renderLoadingPanel(message, { detail = "", step = "" } = {}) {
  return `
    <section class="panel section-panel load-panel" aria-busy="true">
      <div class="load-panel-head">
        <span class="load-spinner" aria-hidden="true"></span>
        <div>
          <p class="load-title">${escapeHtml(message)}</p>
          ${detail ? `<p class="load-detail">${escapeHtml(detail)}</p>` : ""}
        </div>
      </div>
      ${step ? `<p class="load-step" data-load-step>${escapeHtml(step)}</p>` : `<p class="load-step" data-load-step hidden></p>`}
      <p class="load-elapsed" data-load-elapsed>0.0s elapsed</p>
    </section>
  `;
}

export function renderLoadComplete(message, { detail = "", variant = "success" } = {}) {
  return `
    <section class="panel section-panel load-panel load-panel-${variant}" aria-busy="false">
      <div class="load-panel-head">
        <span class="load-icon load-icon-${variant}" aria-hidden="true">${variant === "success" ? "✓" : "!"}</span>
        <div>
          <p class="load-title">${escapeHtml(message)}</p>
          ${detail ? `<p class="load-detail">${escapeHtml(detail)}</p>` : ""}
        </div>
      </div>
    </section>
  `;
}

export function startLoadTimer(root, { intervalMs = 200 } = {}) {
  if (!root) {
    return { stop() {} };
  }

  const elapsedNode = root.querySelector("[data-load-elapsed]");
  const stepNode = root.querySelector("[data-load-step]");
  const startedAt = Date.now();

  const tick = () => {
    if (!elapsedNode) return;
    const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
    elapsedNode.textContent = `${elapsedSec}s elapsed`;
  };

  tick();
  const timerId = window.setInterval(tick, intervalMs);

  return {
    stop() {
      window.clearInterval(timerId);
    },
    setStep(text) {
      if (!stepNode) return;
      stepNode.hidden = !text;
      stepNode.textContent = text ?? "";
    },
  };
}

export async function runWithLoading(root, message, task, { detail = "" } = {}) {
  if (root) {
    root.innerHTML = renderLoadingPanel(message, { detail });
  }

  const timer = startLoadTimer(root);
  const startedAt = Date.now();

  try {
    const result = await task({
      setStep: (text) => timer.setStep(text),
    });
    timer.stop();
    return result;
  } catch (error) {
    timer.stop();
    if (root) {
      root.innerHTML = renderLoadComplete(error.message || "Something went wrong.", {
        variant: "error",
      });
    }
    throw error;
  } finally {
    const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
    timer.stop();
    if (root && root.querySelector("[data-load-elapsed]")) {
      root.querySelector("[data-load-elapsed]").textContent = `Finished in ${elapsedSec}s`;
    }
  }
}
