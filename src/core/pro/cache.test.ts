import '@/test/setup-db';
import { beforeEach, describe, expect, it } from 'vitest';
import { readProCache, writeProCache } from './cache';

beforeEach(() => localStorage.clear());

describe('pro cache', () => {
  it('reads false when nothing is stored', () => {
    expect(readProCache('u1')).toBe(false);
    expect(readProCache(null)).toBe(false);
  });

  it('reads back what was written for the same account', () => {
    writeProCache('u1', true);
    expect(readProCache('u1')).toBe(true);
  });

  it('ignores a cache written for another account', () => {
    writeProCache('u1', true);
    expect(readProCache('u2')).toBe(false);
    expect(readProCache(null)).toBe(false);
  });

  it('keeps a signed-out cache apart from signed-in accounts', () => {
    writeProCache(null, true);
    expect(readProCache(null)).toBe(true);
    expect(readProCache('u1')).toBe(false);
  });

  it.each(['1', '{'])('treats the corrupt value %j as not Pro', (raw) => {
    localStorage.setItem('budgy-pro', raw);
    expect(readProCache('u1')).toBe(false);
  });
});
