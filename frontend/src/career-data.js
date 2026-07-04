import { fetchCareerSaveState, saveCareerSaveState } from "./api.js";

const STORAGE_KEY = "fifa-cm-career-data";

function careerKey(career) {
  if (!career?.edition || !career?.team) return null;
  const profileId = career?.profileId ?? "default";
  return `${career.edition}|${career.team}|${profileId}`;
}

function legacyCareerKey(career) {
  if (!career?.edition || !career?.team) return null;
  return `${career.edition}|${career.team}`;
}

function defaultCareerData() {
  return {
    objectives: [],
    matches: [],
    transactions: [],
    season: 1,
  };
}

function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStore(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function loadCareerDataFromLocalStorage(career) {
  const key = careerKey(career);
  if (!key) return defaultCareerData();

  const store = loadStore();
  // Backward compatibility for older saves (no profileId in the storage key).
  const saved = store[key] ?? store[legacyCareerKey(career)] ?? {};

  return {
    ...defaultCareerData(),
    ...saved,
  };
}

export async function loadCareerData(career) {
  const normalizedEdition = Number(career?.edition);
  if (!normalizedEdition || !career?.team) return defaultCareerData();

  const profileId = career?.profileId ?? "default";
  const team = String(career.team);

  // 1) Prefer CSV-backed backend store.
  try {
    const payload = await fetchCareerSaveState(normalizedEdition, team, profileId);
    const backendData = {
      objectives: payload?.objectives ?? [],
      matches: payload?.matches ?? [],
      transactions: payload?.transactions ?? [],
      season: payload?.season ?? 1,
    };

    // 2) If backend looks like a fresh slot but localStorage has progress,
    // migrate it once so older saves are not lost.
    const localData = loadCareerDataFromLocalStorage({ ...career, profileId });
    const localHasAnything =
      (localData?.objectives?.length ?? 0) > 0 || (localData?.matches?.length ?? 0) > 0 || Number(localData?.season ?? 1) !== 1;
    const backendLooksEmpty =
      (backendData?.objectives?.length ?? 0) === 0 && (backendData?.matches?.length ?? 0) === 0 && Number(backendData?.season ?? 1) === 1;

    if (localHasAnything && backendLooksEmpty) {
      // Best-effort migration: backend becomes source of truth.
      saveCareerSaveState({
        edition: normalizedEdition,
        team,
        profileId,
        profileName: career?.profileName ?? "Default",
        season: localData.season ?? 1,
        objectives: localData.objectives ?? [],
        matches: localData.matches ?? [],
        transactions: localData.transactions ?? [],
      }).catch(() => {});
      return localData;
    }

    return backendData;
  } catch {
    // If backend isn't reachable, keep working with localStorage.
    return loadCareerDataFromLocalStorage({ ...career, profileId });
  }
}

export async function saveCareerData(career, data) {
  const key = careerKey(career);
  const normalizedEdition = Number(career?.edition);
  if (!normalizedEdition || !career?.team || !key) return;

  const profileId = career?.profileId ?? "default";
  const team = String(career.team);
  const profileName = career?.profileName ?? "Default";

  const payload = {
    edition: normalizedEdition,
    team,
    profileId,
    profileName,
    season: Number(data?.season ?? 1),
    objectives: Array.isArray(data?.objectives) ? data.objectives : [],
    matches: Array.isArray(data?.matches) ? data.matches : [],
    transactions: Array.isArray(data?.transactions) ? data.transactions : [],
  };

  // Best effort: primary destination is backend CSV.
  try {
    await saveCareerSaveState(payload);
    return;
  } catch {
    // Fallback if backend is down: persist locally so user doesn't lose progress.
    const store = loadStore();
    store[key] = {
      season: payload.season,
      objectives: payload.objectives,
      matches: payload.matches,
      transactions: payload.transactions,
    };
    saveStore(store);
  }
}

export async function updateCareerData(career, updater) {
  const current = await loadCareerData(career);
  const next = typeof updater === "function" ? updater(current) : { ...current, ...updater };
  await saveCareerData(career, next);
  return next;
}

export function createId(prefix = "item") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
