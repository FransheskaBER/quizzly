import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getApiKey, setApiKey, subscribeApiKey } from './apiKeyStore';

describe('apiKeyStore', () => {
  beforeEach(() => {
    setApiKey(null);
  });

  it('returns null initially', () => {
    expect(getApiKey()).toBeNull();
  });

  it('stores and returns key after setApiKey', () => {
    setApiKey('sk-ant-test-key-12345678');
    expect(getApiKey()).toBe('sk-ant-test-key-12345678');
  });

  it('clears key when setApiKey is called with null', () => {
    setApiKey('sk-ant-test-key-12345678');
    setApiKey(null);
    expect(getApiKey()).toBeNull();
  });

  it('notifies subscriber when key changes', () => {
    const mockListener = vi.fn();
    const unsubscribe = subscribeApiKey(mockListener);

    setApiKey('sk-ant-test-key-12345678');
    expect(mockListener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it('stops notifying after unsubscribe', () => {
    const mockListener = vi.fn();
    const unsubscribe = subscribeApiKey(mockListener);
    unsubscribe();

    setApiKey('sk-ant-test-key-12345678');
    expect(mockListener).not.toHaveBeenCalled();
  });
});
