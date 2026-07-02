const STORAGE_KEY = "fifa-cm-career";

const defaultCareer = {
  edition: null,
  team: null,
  profileName: "Default",
};

function canonicalizeProfileName(name) {
  const raw = String(name ?? "").trim();
  if (!raw) return "default";

  const slug = raw
    .toLowerCase()
    .replaceAll(/\s+/g, "-")
    .replaceAll(/[^a-z0-9_-]/g, "");

  return slug || "default";
}

export function loadCareer() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultCareer };
    const parsed = JSON.parse(raw);
    return {
      ...defaultCareer,
      ...parsed,
      edition: parsed.edition != null ? Number(parsed.edition) : null,
      profileName: parsed.profileName ?? defaultCareer.profileName,
      profileId: canonicalizeProfileName(parsed.profileName ?? defaultCareer.profileName),
    };
  } catch {
    return { ...defaultCareer };
  }
}

export function saveCareer(career) {
  const profileName = career?.profileName ?? defaultCareer.profileName;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      ...career,
      edition: career.edition != null ? Number(career.edition) : null,
      profileName,
      profileId: canonicalizeProfileName(profileName),
    }),
  );
}

export function clearCareer() {
  localStorage.removeItem(STORAGE_KEY);
}

export function isCareerReady(career) {
  return Boolean(career?.edition && career?.team);
}
