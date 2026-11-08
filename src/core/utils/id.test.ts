import { describe, expect, it } from 'vitest';
import { idFromKey, sha256Hex } from './id';

describe('ids from keys', () => {
  it('the same key always gives the same UUID, and another key another one', async () => {
    const a = await idFromKey('a');
    expect(await idFromKey('a')).toBe(a);
    expect(await idFromKey('b')).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('sha256Hex gives the standard SHA-256 digest', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
