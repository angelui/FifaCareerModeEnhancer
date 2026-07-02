import { findSection, findSetupAction } from "../config.js";
import { renderClubArchive, bindClubArchive } from "./club-archive.js";
import { renderClubContext, bindClubContext } from "./club-context.js";
import { renderObjectivesMatches, bindObjectivesMatches } from "./objectives-matches.js";
import { renderJournal, bindJournal } from "./journal.js";
import { renderRosterTools, bindRosterTools } from "./roster-tools.js";

const sectionRenderers = {
  "club-archive": renderClubArchive,
  "club-context": renderClubContext,
  "objectives-matches": renderObjectivesMatches,
  "roster-tools": renderRosterTools,
  journal: renderJournal,
};

const sectionBinders = {
  "club-archive": bindClubArchive,
  "club-context": bindClubContext,
  "objectives-matches": bindObjectivesMatches,
  "roster-tools": bindRosterTools,
  journal: bindJournal,
};

export async function renderSection(ctx) {
  const section = findSection(ctx.config, ctx.params.id);
  const setupAction = findSetupAction(ctx.config, ctx.params.id);
  const item = section ?? setupAction;

  if (!item) {
    return { html: `
      <div class="page section-page">
        <div class="panel panel-empty">
          <h2>Section not found</h2>
          <p>The requested view is not configured yet.</p>
          <button type="button" class="btn btn-primary" data-nav="home">Back to hub</button>
        </div>
      </div>
    ` };
  }

  const renderer = sectionRenderers[item.id];
  if (renderer) {
    const html = await renderer({ ...ctx, item });
    return { html, itemId: item.id };
  }

  return { html: `
    <div class="page section-page">
      <div class="panel panel-empty">
        <h2>Section not found</h2>
        <p>The requested view is not configured yet.</p>
        <button type="button" class="btn btn-primary" data-nav="home">Back to hub</button>
      </div>
    </div>
  ` };
}

export function bindSection(ctx, itemId) {
  const binder = sectionBinders[itemId];
  if (binder) binder(ctx);
}
