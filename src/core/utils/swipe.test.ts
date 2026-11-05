import { describe, expect, it } from 'vitest';
import { swipeStep } from './swipe';

describe('swipeStep', () => {
  it('goes to the next page when the finger moves left', () => {
    expect(swipeStep(-80, 0, 300, false)).toBe(1);
  });

  it('goes to the previous page when the finger moves right', () => {
    expect(swipeStep(80, 0, 300, false)).toBe(-1);
  });

  it('mirrors both directions in right-to-left languages', () => {
    expect(swipeStep(-80, 0, 300, true)).toBe(-1);
    expect(swipeStep(80, 0, 300, true)).toBe(1);
  });

  it('ignores a slow, short drag', () => {
    expect(swipeStep(-40, 0, 400, false)).toBe(0);
  });

  it('accepts a short drag when it is a quick flick', () => {
    expect(swipeStep(-40, 0, 80, false)).toBe(1);
  });

  it('ignores a quick flick that barely moved', () => {
    expect(swipeStep(-15, 0, 16, false)).toBe(0);
  });

  it('accepts a slightly diagonal swipe', () => {
    expect(swipeStep(-100, 40, 200, false)).toBe(1);
  });

  it('ignores a drag that is mostly scrolling', () => {
    expect(swipeStep(-100, 90, 200, false)).toBe(0);
  });
});
