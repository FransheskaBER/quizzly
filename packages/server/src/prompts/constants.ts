// Embedded in the system prompt and checked against every LLM response.
// If found in a response, it indicates a possible prompt exfiltration attempt.
export const SYSTEM_MARKER = '[SYSTEM_MARKER_DO_NOT_REPEAT]';

export const LLM_MODEL = 'claude-sonnet-4-6';
export const LLM_MAX_TOKENS = 8192;

export const CORRECTIVE_MESSAGE =
  'Your previous response was not valid JSON matching the required schema. Respond ONLY with the specified format.';
