let configCache = null;

export async function loadConfig() {
  if (configCache) return configCache;

  const response = await fetch("/config/app.json");
  if (!response.ok) {
    throw new Error("Could not load app configuration.");
  }

  configCache = await response.json();
  return configCache;
}

export function playersFileForEdition(config, edition) {
  return config.playersFilePattern.replace("{edition}", String(edition));
}

export function playersUrl(config, edition) {
  const fileName = playersFileForEdition(config, edition);
  return `${config.dataPath}/${fileName}`;
}

export function findSection(config, id) {
  return config.sections.find((section) => section.id === id) ?? null;
}

export function findSetupAction(config, id) {
  return config.setupActions.find((action) => action.id === id) ?? null;
}
