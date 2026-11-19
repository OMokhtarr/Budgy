import { describe, expect, it } from 'vitest';
import { addKeyword, removeKeyword } from './keywordList';

describe('keywordList', () => {
  it('adds normalized keywords once', () => {
    expect(addKeyword(['CIB'], '  Bank  AlAhly ')).toEqual(['CIB', 'Bank AlAhly']);
    expect(addKeyword(['CIB'], 'cib')).toEqual(['CIB']);
    expect(addKeyword(['CIB'], '   ')).toEqual(['CIB']);
  });
  it('removes a keyword', () => expect(removeKeyword(['CIB', 'Bank'], 'Bank')).toEqual(['CIB']));
});
