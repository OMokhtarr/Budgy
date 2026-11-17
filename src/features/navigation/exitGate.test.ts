import { describe, expect, it, vi } from 'vitest';
import { EXIT_WINDOW_MS, createBackToExit } from './exitGate';

function setup() {
  let time = 1_000;
  const onFirst = vi.fn();
  const onExit = vi.fn();
  const press = createBackToExit(onFirst, onExit, () => time);
  return { press, onFirst, onExit, advance: (ms: number) => (time += ms) };
}

describe('createBackToExit', () => {
  it('asks for a second press the first time instead of exiting', () => {
    const { press, onFirst, onExit } = setup();
    press();
    expect(onFirst).toHaveBeenCalledTimes(1);
    expect(onExit).not.toHaveBeenCalled();
  });

  it('exits on a second press within the window', () => {
    const { press, onExit, advance } = setup();
    press();
    advance(EXIT_WINDOW_MS);
    press();
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('asks again when the second press comes after the window', () => {
    const { press, onFirst, onExit, advance } = setup();
    press();
    advance(EXIT_WINDOW_MS + 1);
    press();
    expect(onFirst).toHaveBeenCalledTimes(2);
    expect(onExit).not.toHaveBeenCalled();
  });
});
