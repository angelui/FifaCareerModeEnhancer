import { fetchGenAiEnhance, fetchGenAiStatus } from "../api.js";
import { renderStatus } from "../views/section-shell.js";

export function renderGenAiStatus(message, tone = "muted") {
  return renderStatus(message, tone);
}

export function bindGenAiButton({ btn, statusRoot, career, scope, onSuccess, extraPayload = {} }) {
  if (!btn || !statusRoot) return;

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    statusRoot.innerHTML = renderGenAiStatus("Generating with local Ollama model… this can take 1–3 minutes on CPU.", "muted");

    try {
      const payloadExtras = typeof extraPayload === "function" ? extraPayload() : extraPayload;
      const result = await fetchGenAiEnhance({
        edition: career.edition,
        team: career.team,
        profileId: career.profileId,
        scope,
        ...payloadExtras,
      });
      statusRoot.innerHTML = renderGenAiStatus("AI generation ready.", "success");
      onSuccess?.(result);
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
      statusRoot.innerHTML = renderGenAiStatus(`Ready · ${status.model} (offline)`, "muted");
    })
    .catch(() => {
      statusRoot.innerHTML = renderGenAiStatus("Could not reach GenAI status endpoint.", "muted");
    });
}
