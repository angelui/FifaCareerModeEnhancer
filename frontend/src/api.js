import { getCachedAllClubs, getCachedClubs, setCachedAllClubs, setCachedClubs } from "./data-cache.js";
import { loadConfig } from "./config.js";

const DEFAULT_FETCH_TIMEOUT_MS = 30000;

let apiBaseUrlCache = null;

async function resolveApiBaseUrl() {
  if (apiBaseUrlCache) return apiBaseUrlCache;
  const config = await loadConfig();
  apiBaseUrlCache = config.apiBaseUrl ?? "/api";
  return apiBaseUrlCache;
}

async function apiFetch(
  path,
  params = {},
  { method = "GET", timeoutMs = DEFAULT_FETCH_TIMEOUT_MS, body = undefined } = {},
) {
  const base = await resolveApiBaseUrl();
  const url = new URL(`${base}${path}`, window.location.origin);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(url.toString(), {
      method,
      signal: controller.signal,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s (${path}).`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const payload = await response.json();
      detail = payload.detail ?? detail;
    } catch {
      // Keep default status text when body is not JSON.
    }
    throw new Error(detail || `Request failed (${response.status})`);
  }

  return response.json();
}

export async function fetchHealth() {
  return apiFetch("/health");
}

export async function fetchBootstrapStatus() {
  return apiFetch("/bootstrap/status");
}

export async function fetchBootstrapStart() {
  return apiFetch("/bootstrap/start", {}, { method: "POST" });
}

export async function fetchClubsForEdition(edition) {
  const normalizedEdition = Number(edition);
  const cached = getCachedClubs(normalizedEdition);
  if (cached) return cached;

  const payload = await apiFetch(`/editions/${normalizedEdition}/clubs`, {}, { timeoutMs: 90000 });
  const clubs = payload.clubs ?? [];
  setCachedClubs(normalizedEdition, clubs);
  return clubs;
}

export async function fetchAllClubs() {
  const cached = getCachedAllClubs();
  if (cached) return cached;

  const payload = await apiFetch("/clubs", {}, { timeoutMs: 90000 });
  const clubs = payload.clubs ?? [];
  setCachedAllClubs(clubs);
  return clubs;
}

export async function fetchPlayersByClub(edition, clubName) {
  const payload = await apiFetch(`/editions/${edition}/players`, { club: clubName });
  return payload.players ?? [];
}

export async function fetchPlayerSearch(edition, query, limit = 50) {
  const payload = await apiFetch(`/editions/${edition}/players/search`, { q: query, limit });
  return payload.players ?? [];
}

export async function fetchClubArchive(clubName) {
  return apiFetch("/clubs/archive", { club: clubName }, { timeoutMs: 120000 });
}

export async function fetchSigningSuggestions(edition, clubName, maxValue = null, maxWage = null, limit = 40, position = null) {
  const params = { club: clubName, limit };
  if (maxValue != null && maxValue > 0) {
    params.max_value = maxValue;
  }
  if (maxWage != null && maxWage > 0) {
    params.max_wage = maxWage;
  }
  if (position != null && position !== "") {
    params.position = position;
  }
  return apiFetch(`/editions/${edition}/signing-suggestions`, params, { timeoutMs: 120000 });
}

export async function fetchFixtureHints(edition, clubName, limit = 24) {
  return apiFetch(`/editions/${edition}/fixture-hints`, { club: clubName, limit });
}

export async function fetchClubNarrative(edition, clubName) {
  return apiFetch(`/editions/${edition}/narrative`, { club: clubName }, { timeoutMs: 120000 });
}

export async function fetchCareerSaves() {
  return apiFetch("/career-saves", {}, { timeoutMs: 30000 });
}

export async function fetchCareerSaveProfiles(edition, team) {
  const normalizedEdition = Number(edition);
  return apiFetch(`/career-saves/profiles`, { edition: normalizedEdition, team: team ?? "" }, { timeoutMs: 30000 });
}

export async function fetchCareerSaveState(edition, team, profileId) {
  const normalizedEdition = Number(edition);
  return apiFetch(
    `/career-saves/state`,
    { edition: normalizedEdition, team: team ?? "", profileId: profileId ?? "" },
    { timeoutMs: 30000 },
  );
}

export async function saveCareerSaveState(payload) {
  return apiFetch(`/career-saves/state`, {}, { method: "POST", body: payload, timeoutMs: 30000 });
}

export async function fetchRandomClub(edition) {
  const normalizedEdition = Number(edition);
  return apiFetch(`/editions/${normalizedEdition}/random-club`, {}, { timeoutMs: 30000 });
}

export async function fetchRandomPlayer(edition) {
  const normalizedEdition = Number(edition);
  return apiFetch(`/editions/${normalizedEdition}/random-player`, {}, { timeoutMs: 30000 });
}

export async function fetchAllPlayersForEdition(edition) {
  const normalizedEdition = Number(edition);
  return apiFetch(`/editions/${normalizedEdition}/all-players`, {}, { timeoutMs: 120000 });
}

export async function fetchGenAiStatus() {
  return apiFetch("/genai/status", {}, { timeoutMs: 10000 });
}

export async function fetchGenAiEnhance({
  edition,
  team,
  profileId,
  scope = "all",
  maxValue = null,
  maxWage = null,
  position = null,
}) {
  return apiFetch(
    "/genai/enhance",
    {},
    {
      method: "POST",
      body: {
        edition: Number(edition),
        team: team ?? "",
        profileId: profileId ?? undefined,
        scope: scope ?? "all",
        maxValue: maxValue ?? undefined,
        maxWage: maxWage ?? undefined,
        position: position ?? undefined,
      },
      timeoutMs: 300000,
    },
  );
}

