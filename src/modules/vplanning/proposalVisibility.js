function normalizeIdentity(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .trim()
    .toLowerCase();
}

function currentUserOwnerIds(currentUser = {}) {
  const values = [
    ...(Array.isArray(currentUser.ownerIds) ? currentUser.ownerIds : []),
    ...(Array.isArray(currentUser.owner_ids) ? currentUser.owner_ids : []),
    currentUser.id,
  ];
  return new Set(values.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean));
}

export function isVWorkCollaborationProposalParticipant(item, currentUser = {}) {
  if (item?.type !== 'collaboration') return false;

  const ownerIds = currentUserOwnerIds(currentUser);
  const collaboratorOwnerIds = Array.isArray(item?.collaboratorOwnerIds) ? item.collaboratorOwnerIds : [];
  if (collaboratorOwnerIds.some((value) => ownerIds.has(String(value || '').trim().toLowerCase()))) {
    return true;
  }

  const currentName = normalizeIdentity(
    currentUser.name || currentUser.fullName || currentUser.full_name,
  );
  const collaboratorNames = Array.isArray(item?.collaboratorNames) ? item.collaboratorNames : [];
  return Boolean(
    currentName
      && collaboratorNames.some((value) => normalizeIdentity(value) === currentName),
  );
}
