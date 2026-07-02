import { escapeHtml } from "../ui.js";
import { isCareerReady } from "../state.js";
import { renderLoadComplete, renderLoadingPanel, startLoadTimer } from "./loading.js";

export function renderCareerRequiredPanel() {
  return renderLoadComplete("Career not configured", {
    detail: "Select a FIFA edition and club on the setup screen first.",
    variant: "error",
  });
}

export function runSectionLoader(scope, root, task, { message, detail = "", step = "" } = {}) {
  if (!root) return;

  if (!scope?.isActive()) return;

  root.innerHTML = renderLoadingPanel(message, { detail, step });
  const timer = startLoadTimer(root);

  return (async () => {
    try {
      const result = await task({
        setStep: (text) => {
          if (scope.isActive()) timer.setStep(text);
        },
      });

      if (!scope.isActive()) return null;

      timer.stop();
      return result;
    } catch (error) {
      if (!scope.isActive()) return null;
      timer.stop();
      root.innerHTML = renderLoadComplete(error.message || "Something went wrong.", { variant: "error" });
      throw error;
    }
  })();
}

export function markSectionReady(root, message, detail = "") {
  if (!root) return;
  root.innerHTML = renderLoadComplete(message, { detail });
}

export function assertCareerReady(career, root) {
  if (isCareerReady(career)) return true;
  if (root) root.innerHTML = renderCareerRequiredPanel();
  return false;
}

export function careerGuardMessage(career) {
  if (isCareerReady(career)) return null;
  return `Missing career setup (${escapeHtml(String(career?.team ?? "no club"))} / FIFA ${career?.edition ?? "—"}).`;
}
