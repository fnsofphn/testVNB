export function formatQuizOptionText(textValue: unknown, optionIdValue: unknown) {
  const text = String(textValue || '').trim();
  const optionId = String(optionIdValue || '').trim();
  const escapedId = optionId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!escapedId) return text;
  return text.replace(new RegExp(`^\\s*(?:\\(${escapedId}\\)|${escapedId}\\s*[.):-])\\s*`, 'i'), '').trim() || text;
}
