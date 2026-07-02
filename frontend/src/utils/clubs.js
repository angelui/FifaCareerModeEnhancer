import { fetchClubsForEdition } from "../api.js";
import {
  getCachedAllClubs,
  getCachedClubs,
  getMergedClubsFromEditions,
  setCachedAllClubs,
} from "../data-cache.js";

function sortClubs(clubs) {
  return [...clubs].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export async function resolveClubIndex(editions, { onProgress, onPartial, priorityEdition } = {}) {
  const cachedAll = getCachedAllClubs();
  if (cachedAll?.length) {
    onProgress?.(`Using cached club index (${cachedAll.length.toLocaleString()} clubs).`);
    onPartial?.(cachedAll, { done: true });
    return cachedAll;
  }

  const mergedFromCache = getMergedClubsFromEditions(editions);
  if (mergedFromCache?.length) {
    setCachedAllClubs(mergedFromCache);
    onProgress?.(`Built club index from cache (${mergedFromCache.length.toLocaleString()} clubs).`);
    onPartial?.(mergedFromCache, { done: true });
    return mergedFromCache;
  }

  const merged = new Set();
  const ordered = [...new Set(editions.map((edition) => Number(edition)).filter(Boolean))].sort(
    (a, b) => a - b,
  );

  if (priorityEdition) {
    const preferred = Number(priorityEdition);
    ordered.sort((a, b) => {
      if (a === preferred) return -1;
      if (b === preferred) return 1;
      return a - b;
    });
  }

  let completed = 0;

  for (const edition of ordered) {
    onProgress?.(`Loading FIFA ${edition} clubs… (${completed}/${ordered.length} editions done)`);

    const cached = getCachedClubs(edition);
    const clubs = cached ?? (await fetchClubsForEdition(edition));
    clubs.forEach((club) => merged.add(club));
    completed += 1;

    const snapshot = sortClubs(merged);
    onPartial?.(snapshot, { done: completed === ordered.length, edition, completed, total: ordered.length });
    onProgress?.(
      `Loaded FIFA ${edition} — ${snapshot.length.toLocaleString()} clubs (${completed}/${ordered.length} editions).`,
    );
  }

  const result = sortClubs(merged);
  setCachedAllClubs(result);
  return result;
}
