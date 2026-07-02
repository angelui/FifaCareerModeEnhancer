let activeScopeId = 0;

export function beginSectionScope() {
  activeScopeId += 1;
  const scopeId = activeScopeId;
  return {
    id: scopeId,
    isActive: () => scopeId === activeScopeId,
  };
}

export function getActiveSectionScope() {
  const scopeId = activeScopeId;
  return {
    id: scopeId,
    isActive: () => scopeId === activeScopeId,
  };
}
