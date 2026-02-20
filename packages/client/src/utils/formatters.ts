/**
 * Formats an ISO date string into a human-readable date (e.g., "Feb 20, 2026").
 */
export const formatDate = (isoString: string): string => {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(isoString));
};

/**
 * Formats a score (0–100) as a percentage string with 1 decimal place.
 * Returns "—" for null (no quizzes completed yet).
 */
export const formatScore = (score: number | null): string => {
  if (score === null) return '—';
  return `${score.toFixed(1)}%`;
};
