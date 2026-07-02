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

export function loadCareerData(career) {
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

export function saveCareerData(career, data) {
  const key = careerKey(career);
  if (!key) return;

  const store = loadStore();
  store[key] = data;
  saveStore(store);
}

export function updateCareerData(career, updater) {
  const current = loadCareerData(career);
  const next = typeof updater === "function" ? updater(current) : { ...current, ...updater };
  saveCareerData(career, next);
  return next;
}

export function createId(prefix = "item") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
