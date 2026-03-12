import { describe, expect, it } from 'vitest';

import { extractHttpStatus, getUserMessage } from './error-messages';

describe('getUserMessage', () => {
  it('returns a context-specific message when code and context match', () => {
    const message = getUserMessage('CONFLICT', 'signup', 409);

    expect(message.title).toBe("Couldn't create your account");
  });

  it('falls back to code default when context message is missing', () => {
    const message = getUserMessage('CONFLICT', 'delete-session', 409);

    expect(message.title).toBe('Ran into a conflict');
  });

  it('returns transient fallback for 502 and 503 statuses', () => {
    const transient502 = getUserMessage('UNKNOWN_CODE', 'create-session', 502);
    const transient503 = getUserMessage('UNKNOWN_CODE', 'create-session', 503);

    expect(transient502.description).toContain('few minutes');
    expect(transient503.description).toContain('few minutes');
  });

  it('returns persistent fallback for non-transient 5xx statuses', () => {
    const message = getUserMessage('UNKNOWN_CODE', 'create-session', 500);

    expect(message.description).toContain('few hours');
  });

  it('returns network message when status is missing', () => {
    const noStatusMessage = getUserMessage('UNKNOWN_CODE', 'create-session', null);

    expect(noStatusMessage.title).toBe("Couldn't reach the server");
  });

  it('returns unknown fallback when code is missing but status is present', () => {
    const noCodeMessage = getUserMessage(null, 'create-session', 400);

    expect(noCodeMessage.title).toBe("Couldn't do that");
  });

  it('returns unknown fallback for unmatched 4xx codes', () => {
    const message = getUserMessage('UNKNOWN_CODE', 'create-session', 400);

    expect(message.title).toBe("Couldn't do that");
  });
});

describe('extractHttpStatus', () => {
  it('returns numeric status when available', () => {
    const status = extractHttpStatus({ status: 409 });

    expect(status).toBe(409);
  });

  it('returns originalStatus when status is absent', () => {
    const status = extractHttpStatus({ originalStatus: 503 });

    expect(status).toBe(503);
  });

  it('returns null when no status fields are present', () => {
    const status = extractHttpStatus({});

    expect(status).toBeNull();
  });
});
