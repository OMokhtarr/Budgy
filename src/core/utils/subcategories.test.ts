import { describe, expect, it } from 'vitest';
import { cleanSubcategories, pickableSubcategories, subcategoryName, withoutSubcategory } from './subcategories';
import type { Category } from '@/shared/models';

const A = { id: 'a', name: 'Groceries', icon: 'cart' };
const B = { id: 'b', name: 'Akl', icon: 'restaurant' };
const HIDDEN = { id: 'h', name: 'Old', icon: 'other', archived: true };
const FOOD: Category = { id: 'food', name: 'Food', kind: 'expense', icon: 'restaurant', color: '#f00', order: 0, subcategories: [A, HIDDEN, B] };

describe('pickableSubcategories', () => {
  it('offers the active subcategories, not hidden ones', () => {
    expect(pickableSubcategories(FOOD)).toEqual([A, B]);
  });

  it("still offers a hidden one when it's already on the transaction, so editing doesn't lose it", () => {
    expect(pickableSubcategories(FOOD, 'h')).toEqual([A, HIDDEN, B]);
  });

  it('offers nothing for a category without subcategories, or no category', () => {
    expect(pickableSubcategories({ ...FOOD, subcategories: undefined })).toEqual([]);
    expect(pickableSubcategories(undefined)).toEqual([]);
  });
});

describe('withoutSubcategory', () => {
  it('removes a subcategory with no transactions', () => {
    expect(withoutSubcategory([A, B], 'a', 0)).toEqual([B]);
  });

  it('hides a subcategory with transactions, so they keep their label', () => {
    expect(withoutSubcategory([A, B], 'a', 3)).toEqual([{ ...A, archived: true }, B]);
  });
});

describe('cleanSubcategories', () => {
  it('trims names and drops ones left blank', () => {
    expect(cleanSubcategories([{ ...A, name: '  Groceries ' }, { ...B, name: '   ' }])).toEqual([A]);
  });

  it('keeps the saved name when a saved subcategory is left blank, so its transactions keep their label', () => {
    expect(cleanSubcategories([{ ...A, name: ' ' }], [A])).toEqual([A]);
  });
});

describe('subcategoryName', () => {
  it("gives the name of a transaction's subcategory", () => {
    expect(subcategoryName(FOOD, 'b')).toBe('Akl');
  });

  it('gives nothing when there is no subcategory, or it no longer exists', () => {
    expect(subcategoryName(FOOD, undefined)).toBe('');
    expect(subcategoryName(FOOD, 'gone')).toBe('');
    expect(subcategoryName(undefined, 'b')).toBe('');
  });
});
