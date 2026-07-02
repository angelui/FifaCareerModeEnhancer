const clubsByEdition = new Map();
let allClubsCache = null;

export function getCachedClubs(edition) {
  const key = Number(edition);
  if (!key) return null;
  return clubsByEdition.get(key) ?? null;
}

export function setCachedClubs(edition, clubs) {
  const key = Number(edition);
  if (!key) return;
  clubsByEdition.set(key, [...clubs]);
}

export function hasCachedClubs(edition) {
  return getCachedClubs(edition) !== null;
}

export function getCachedAllClubs() {
  return allClubsCache;
}

export function setCachedAllClubs(clubs) {
  allClubsCache = clubs ? [...clubs] : null;
}

export function getMergedClubsFromEditions(editions) {
  const merged = new Set();

  for (const edition of editions) {
    const clubs = getCachedClubs(Number(edition));
    if (!clubs) continue;
    clubs.forEach((club) => merged.add(club));
  }

  if (!merged.size) return null;
  return [...merged].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export async function prefetchClubsForEditions(editions, fetchClubs) {
  const pending = editions
    .map((edition) => Number(edition))
    .filter((edition) => edition && !hasCachedClubs(edition))
    .map(async (edition) => {
      const clubs = await fetchClubs(edition);
      setCachedClubs(edition, clubs);
      return edition;
    });

  await Promise.all(pending);
}
