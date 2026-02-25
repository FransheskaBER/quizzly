// Embedded in the system prompt and checked against every LLM response.
// If found in a response, it indicates a possible prompt exfiltration attempt.
export const SYSTEM_MARKER = '[SYSTEM_MARKER_DO_NOT_REPEAT]';

export const LLM_MODEL = 'claude-sonnet-4-6';

// Max output tokens. Sonnet 4.6 supports up to 64K. 8192 is sufficient for
// 20 hard questions with full explanations (~300-400 tokens each).
export const LLM_MAX_TOKENS = 8192;

// Lower temperature for generation produces consistent JSON schema compliance
// while still varying exercise scenarios across sessions.
export const LLM_GENERATION_TEMPERATURE = 0.7;

// Grading must be near-deterministic — the same answer should score the same
// every time. Keep low to minimise variance in the 0 / 0.5 / 1 scoring.
export const LLM_GRADING_TEMPERATURE = 0.2;

export const CORRECTIVE_MESSAGE =
  'Your previous response was not valid JSON matching the required schema. Respond ONLY with the specified format.';
