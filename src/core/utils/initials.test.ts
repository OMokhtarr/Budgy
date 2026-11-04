import { describe, expect, it } from 'vitest';
import { initials } from './initials';

const NO_JOIN = '‌';

describe('initials', () => {
  it('takes the first and last names, capitalised', () => {
    expect(initials('omar mokhtar')).toBe(`O${NO_JOIN}M`);
    expect(initials('Omar Ali Mokhtar')).toBe(`O${NO_JOIN}M`);
  });

  it('uses one letter for a single name', () => {
    expect(initials('Omar')).toBe('O');
  });

  it('ignores extra spaces', () => {
    expect(initials('  Omar   Mokhtar ')).toBe(`O${NO_JOIN}M`);
  });

  it('is empty without a name', () => {
    expect(initials('')).toBe('');
    expect(initials('   ')).toBe('');
  });

  it('keeps Arabic letters apart, so they read as initials and not as a word', () => {
    expect(initials('محمد علي')).toBe(`م${NO_JOIN}ع`);
  });

  it("doesn't split a character made of two code units", () => {
    expect(initials('😀 Ali')).toBe(`😀${NO_JOIN}A`);
  });
});
