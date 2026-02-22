import pino from 'pino';

// Exported so tests can vi.spyOn(logger, 'warn')
export const logger = pino({ name: 'sanitize' });

/**
 * Strips control characters, zero-width unicode, and invisible text from a string.
 * Applied to user-provided content (subject, goal, material text) before storage
 * as Layer 1 of prompt injection defense.
 */
export const sanitizeString = (input: string): string => {
  return (
    input
      // Strip ASCII control characters except tab (\x09), newline (\x0A), carriage return (\x0D)
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      // Strip zero-width and invisible Unicode characters
      .replace(/[\u200B-\u200F\u2028-\u202F\u205F-\u206F\uFEFF]/g, '')
  );
};

/**
 * Sanitizes a string for use in LLM prompts.
 * Extends sanitizeString with soft hyphen stripping, newline collapsing, and trimming.
 */
export const sanitizeForPrompt = (input: string): string => {
  return sanitizeString(input)
    .replace(/\u00AD/g, '')       // strip soft hyphen
    .replace(/\n{3,}/g, '\n\n')   // collapse 3+ newlines to 2
    .trim();
};

// Common injection-attempt patterns to detect in user-provided content
const SUSPICIOUS_PATTERNS = [
  /ignore\s+(previous|above|all)\s+instructions/i,
  /forget\s+(previous|all)\s+instructions/i,
  /system\s+prompt/i,
  /\[INST\]/i,
  /<\|im_start\|>/i,
  /###\s*(system|instruction)/i,
];

/**
 * Logs a warning if the input contains patterns that look like prompt injection attempts.
 * Part of Layer 1 prompt injection defense — call before building prompts.
 */
export const logSuspiciousPatterns = (input: string, fieldName: string): void => {
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(input)) {
      logger.warn(
        { fieldName, pattern: pattern.toString() },
        'Suspicious pattern detected in user input',
      );
      return;
    }
  }
};
