import { describe, expect, it } from 'vitest';
import { moveItem } from './reorder';

describe('moveItem', () => {
  it.each<[string, string, string, string[]]>([
    ['forward, shifting the ones in between back', 'a', 'c', ['b', 'c', 'a', 'd']],
    ['backward, shifting the ones in between on', 'd', 'b', ['a', 'd', 'b', 'c']],
    ['onto its neighbour, swapping them', 'b', 'c', ['a', 'c', 'b', 'd']],
  ])('moves an item %s', (_name, id, target, want) => {
    expect(moveItem(['a', 'b', 'c', 'd'], id, target)).toEqual(want);
  });

  it('returns the same list when nothing moves', () => {
    const ids = ['a', 'b'];
    expect(moveItem(ids, 'a', 'a')).toBe(ids);
    expect(moveItem(ids, 'a', 'gone')).toBe(ids);
  });
});
