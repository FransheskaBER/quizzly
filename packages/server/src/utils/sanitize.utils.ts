/**
 * Strips control characters, zero-width unicode, and invisible text from a string.
 * Applied to user-provided content (subject, goal, material text) before storage
 * as Layer 1 of prompt injection defense.
 */
export const sanitizeString = (input: string): string => {
  return (
    input
      // Strip ASCII control characters except tab (\x09), newline (\x0A), carriage return (\x0D)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      // Strip zero-width and invisible Unicode characters
      .replace(/[\u200B-\u200F\u2028-\u202F\u205F-\u206F\uFEFF]/g, '')
  );
};
