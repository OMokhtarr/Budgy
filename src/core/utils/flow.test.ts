import { describe, expect, it } from 'vitest';
import { flowOfTx, isMoneyBack } from './flow';

describe('flowOfTx', () => {
  it('counts money back as spending', () => {
    expect(flowOfTx({ type: 'income', moneyBack: true })).toBe('expense');
  });

  it('keeps plain income and expenses as they are', () => {
    expect(flowOfTx({ type: 'income' })).toBe('income');
    expect(flowOfTx({ type: 'expense' })).toBe('expense');
  });

  it('gives a transfer no flow', () => {
    expect(flowOfTx({ type: 'transfer' })).toBeUndefined();
  });

  it('ignores the mark on anything but income', () => {
    expect(flowOfTx({ type: 'expense', moneyBack: true })).toBe('expense');
    expect(isMoneyBack({ type: 'expense', moneyBack: true })).toBe(false);
    expect(isMoneyBack({ type: 'transfer', moneyBack: true })).toBe(false);
    expect(isMoneyBack({ type: 'income', moneyBack: true })).toBe(true);
  });
});
