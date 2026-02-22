/**
 * Estimates token count for a string using a fast character-based approximation.
 * Rule of thumb: ~4 characters per token. We overcount by 10% for safety so we
 * never accidentally exceed the 150 000-token session budget.
 */
const CHARS_PER_TOKEN = 4;
const OVERCOUNT_FACTOR = 1.1;

export const estimateTokenCount = (text: string): number =>
  Math.ceil((text.length / CHARS_PER_TOKEN) * OVERCOUNT_FACTOR);
