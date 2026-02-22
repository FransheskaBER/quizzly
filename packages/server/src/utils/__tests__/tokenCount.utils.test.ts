import { describe, it, expect } from 'vitest';
import { estimateTokenCount } from '../tokenCount.utils.js';

describe('estimateTokenCount', () => {
  it('returns 0 for an empty string', () => {
    expect(estimateTokenCount('')).toBe(0);
  });

  it('applies ~4 chars per token with 10% overcount', () => {
    // 400 chars / 4 = 100 tokens × 1.1 = 110.000...001 in IEEE 754 → Math.ceil → 111
    const text = 'a'.repeat(400);
    expect(estimateTokenCount(text)).toBe(111);
  });

  it('rounds up (uses Math.ceil)', () => {
    // 1 char / 4 * 1.1 = 0.275 → ceil → 1
    expect(estimateTokenCount('a')).toBe(1);
  });

  it('is deterministic for the same input', () => {
    const text = 'Hello, world! This is a test string.';
    expect(estimateTokenCount(text)).toBe(estimateTokenCount(text));
  });

  it('produces a larger count for longer text', () => {
    const short = 'Hello';
    const long = 'Hello'.repeat(100);
    expect(estimateTokenCount(long)).toBeGreaterThan(estimateTokenCount(short));
  });
});
