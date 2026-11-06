import { describe, expect, it } from 'vitest';
import { debtSideOf, signedFor, unsigned } from './debtSide';

describe('debtSideOf', () => {
  it.each<[string, string[], ReturnType<typeof debtSideOf>]>([
    ['a new debt', [''], undefined],
    ['a settled debt', ['0', '0'], undefined],
    ['money they owe you', ['500'], 'owed'],
    ['money you owe them', ['-500'], 'owe'],
    ['two currencies you owe in', ['-500', '-20'], 'owe'],
    ['one currency owed and the other settled', ['0', '-20'], 'owe'],
    ['two currencies owing opposite ways', ['500', '-20'], 'mixed'],
  ])('%s', (_name, balances, want) => {
    expect(debtSideOf(balances)).toBe(want);
  });
});

describe('signedFor', () => {
  it.each<[string, Parameters<typeof signedFor>, string]>([
    ['keeps money they owe you positive', ['500', 'owed'], '500'],
    ['makes money you owe negative', ['500', 'owe'], '-500'],
    ['flips a negative balance when they owe you', ['-500', 'owed'], '500'],
    ['leaves an empty field empty', ['', 'owe'], ''],
    ['leaves zero without a sign', ['0', 'owe'], '0'],
  ])('%s', (_name, args, want) => {
    expect(signedFor(...args)).toBe(want);
  });
});

describe('unsigned', () => {
  it('shows the amount without its minus sign', () => {
    expect(unsigned('-1250.5')).toBe('1250.5');
    expect(unsigned('300')).toBe('300');
  });
});
