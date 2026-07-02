import {
  fetchAllClubs,
  fetchClubArchive,
  fetchClubsForEdition,
  fetchPlayerSearch,
  fetchPlayersByClub,
} from "../api.js";

export async function loadClubsFromPlayersCsv(_url, _clubColumn, edition) {
  if (!edition) {
    throw new Error("Edition is required to load clubs.");
  }
  return fetchClubsForEdition(edition);
}

export async function loadAllClubs(_config) {
  return fetchAllClubs();
}

export async function loadPlayersByClub(_url, _playerColumns, _clubColumn, clubName, edition) {
  if (!edition) {
    throw new Error("Edition is required to load players.");
  }
  return fetchPlayersByClub(edition, clubName);
}

export async function searchPlayers(_url, _playerColumns, query, limit = 40, edition) {
  if (!edition) {
    throw new Error("Edition is required to search players.");
  }
  return fetchPlayerSearch(edition, query, limit);
}

export async function loadClubArchiveTimeline(clubName) {
  const payload = await fetchClubArchive(clubName);
  return (payload.timeline ?? []).map(({ edition, summary }) => ({
    edition,
    summary: summary ?? { count: 0, avgOverall: null, best11Overall: null, subsOverall: null, topPlayers: [] },
  }));
}

export function summarizeSquad(players) {
  if (players.length === 0) {
    return { count: 0, avgOverall: null, best11Overall: null, subsOverall: null, topPlayers: [] };
  }

  const sorted = [...players].sort((a, b) => Number(b.overall || 0) - Number(a.overall || 0));
  const overalls = sorted.map((player) => Number(player.overall || 0)).filter((value) => Number.isFinite(value));
  const best11 = overalls.slice(0, 11);
  const subs = overalls.slice(11);

  return {
    count: players.length,
    avgOverall: overalls.length ? Math.round(overalls.reduce((sum, value) => sum + value, 0) / overalls.length) : null,
    best11Overall: best11.length ? Math.round(best11.reduce((sum, value) => sum + value, 0) / best11.length) : null,
    subsOverall: subs.length ? Math.round(subs.reduce((sum, value) => sum + value, 0) / subs.length) : null,
    topPlayers: sorted.slice(0, 3),
  };
}
