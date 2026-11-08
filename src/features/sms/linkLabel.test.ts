import { describe, expect, it } from 'vitest';
import { linkCardLabel } from './linkLabel';

describe('linkCardLabel', () => {
  it('shows the sender in upper case with the card digits', () => {
    expect(linkCardLabel({ address: 'cib', digits: '4821' })).toEqual({ sender: 'CIB', digits: '••4821' });
  });
  it('has no digits for a sender-only link', () => {
    expect(linkCardLabel({ address: 'bank-alahly' })).toEqual({ sender: 'BANK-ALAHLY', digits: undefined });
  });
});
