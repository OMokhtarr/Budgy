import { describe, expect, it } from 'vitest';
import { addSender, removeSender } from './senderList';

describe('senderList', () => {
  it('adds normalized keywords once', () => {
    expect(addSender(['CIB'], '  Bank  AlAhly ')).toEqual(['CIB', 'Bank AlAhly']);
    expect(addSender(['CIB'], 'cib')).toEqual(['CIB']);
    expect(addSender(['CIB'], '   ')).toEqual(['CIB']);
  });
  it('removes a keyword', () => expect(removeSender(['CIB', 'Bank'], 'Bank')).toEqual(['CIB']));
});
