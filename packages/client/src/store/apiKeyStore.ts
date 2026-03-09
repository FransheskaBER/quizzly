import { useSyncExternalStore } from 'react';

// Module-level variable — invisible to Redux DevTools and React DevTools.
// Cleared on page refresh (module reloads).
let apiKey: string | null = null;
let listeners: Array<() => void> = [];

const notifyListeners = (): void => {
  for (const listener of listeners) {
    listener();
  }
};

export const getApiKey = (): string | null => apiKey;

export const setApiKey = (key: string | null): void => {
  apiKey = key;
  notifyListeners();
};

export const subscribeApiKey = (listener: () => void): (() => void) => {
  listeners = [...listeners, listener];
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
};

/** Reactive hook backed by useSyncExternalStore — re-renders when setApiKey is called. */
export const useApiKey = (): string | null =>
  useSyncExternalStore(subscribeApiKey, getApiKey);
