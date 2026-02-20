import { describe, it, expect } from 'vitest';
import { assertOwnership } from '../ownership.js';
import { ForbiddenError } from '../errors.js';

describe('assertOwnership', () => {
  it('does not throw when resource owner matches the authenticated user', () => {
    expect(() => assertOwnership('user-123', 'user-123')).not.toThrow();
  });

  it('throws ForbiddenError when the IDs do not match', () => {
    expect(() => assertOwnership('user-123', 'user-456')).toThrow(ForbiddenError);
  });

  it('throws ForbiddenError with a message', () => {
    expect(() => assertOwnership('user-abc', 'user-xyz')).toThrowError(
      /permission/i,
    );
  });
});
