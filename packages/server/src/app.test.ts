import { describe, it, expect } from 'vitest';
import { redactSensitiveHeaders } from './app.js';

describe('redactSensitiveHeaders', () => {
  it('removes x-anthropic-key from headers', () => {
    const mockReq = {
      headers: { 'x-anthropic-key': 'sk-ant-secret-key-value', 'content-type': 'application/json' },
      method: 'GET',
      url: '/api/test',
    };

    const result = redactSensitiveHeaders(mockReq);

    expect(result.headers).not.toHaveProperty('x-anthropic-key');
    expect((result.headers as Record<string, string>)['content-type']).toBe('application/json');
  });

  it('preserves all other headers when x-anthropic-key is absent', () => {
    const mockReq = {
      headers: { 'authorization': 'Bearer token', 'content-type': 'application/json' },
      method: 'GET',
      url: '/api/test',
    };

    const result = redactSensitiveHeaders(mockReq);

    expect(result.headers).toEqual({ 'authorization': 'Bearer token', 'content-type': 'application/json' });
  });

  it('does not mutate the original request object', () => {
    const originalHeaders = { 'x-anthropic-key': 'sk-ant-secret-key-value', 'content-type': 'application/json' };
    const mockReq = { headers: originalHeaders, method: 'GET', url: '/api/test' };

    redactSensitiveHeaders(mockReq);

    expect(originalHeaders['x-anthropic-key']).toBe('sk-ant-secret-key-value');
  });
});
