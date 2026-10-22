/**
 * Formats a user's full name to their avatar initials.
 */
export function getInitials(name) {
  if (!name) return 'AD';
  return name
    .trim()
    .split(/\s+/)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Formats an ISO date string to a readable localized string.
 */
export function formatDate(isoString) {
  if (!isoString) return '--';
  try {
    return new Date(isoString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch {
    return isoString;
  }
}
