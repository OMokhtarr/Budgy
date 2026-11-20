import { describe, expect, it } from 'vitest';
import { createLockController, type AppLockSettings, type LockView } from './lockController';

/** A pending prompt the test answers by hand, so it can send pause/resume while the prompt is open. */
function fakeDeps(initial: Partial<AppLockSettings> = {}, secure = true) {
  const state = {
    clock: 1_000_000,
    settings: { enabled: true, afterMs: 60_000, ...initial } as AppLockSettings,
    secure,
    verifyCalls: 0,
    answer: (_ok: boolean) => {},
    views: [] as LockView[],
  };
  const deps = {
    now: () => state.clock,
    settings: () => state.settings,
    isSecure: async () => state.secure,
    verify: () => {
      state.verifyCalls++;
      return new Promise<boolean>((resolve) => {
        state.answer = resolve;
      });
    },
    onView: (v: LockView) => state.views.push(v),
  };
  return { state, controller: createLockController(deps) };
}

/** Lets the controller's awaits (isSecure, verify) run. */
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('app lock controller', () => {
  it('starts locked and prompts when enabled', async () => {
    const { state, controller } = fakeDeps();
    controller.start();
    await settle();
    expect(controller.view()).toBe('locked');
    expect(state.verifyCalls).toBe(1);
    state.answer(true);
    await settle();
    expect(controller.view()).toBe('open');
  });

  it('starts open without a prompt when disabled', async () => {
    const { state, controller } = fakeDeps({ enabled: false });
    controller.start();
    await settle();
    expect(controller.view()).toBe('open');
    expect(state.verifyCalls).toBe(0);
  });

  it('covers on pause and opens on a return within the lock time', async () => {
    const { state, controller } = fakeDeps({ enabled: false });
    controller.start();
    state.settings.enabled = true;
    controller.pause();
    expect(controller.view()).toBe('covered');
    state.clock += 30_000;
    controller.resume();
    await settle();
    expect(controller.view()).toBe('open');
    expect(state.verifyCalls).toBe(0);
  });

  it('locks on a return after the lock time', async () => {
    const { state, controller } = fakeDeps({ enabled: false });
    controller.start();
    state.settings.enabled = true;
    controller.pause();
    state.clock += 60_000;
    controller.resume();
    await settle();
    expect(controller.view()).toBe('locked');
    expect(state.verifyCalls).toBe(1);
  });

  it('locks on any return with Immediately', async () => {
    const { state, controller } = fakeDeps({ enabled: false, afterMs: 0 });
    controller.start();
    state.settings.enabled = true;
    controller.pause();
    controller.resume();
    await settle();
    expect(controller.view()).toBe('locked');
    expect(state.verifyCalls).toBe(1);
  });

  it('ignores pause/resume during a prompt', async () => {
    const { state, controller } = fakeDeps();
    controller.start();
    await settle();
    controller.pause();
    state.clock += 600_000;
    controller.resume();
    await settle();
    expect(controller.view()).toBe('locked');
    expect(state.verifyCalls).toBe(1);
    state.answer(true);
    await settle();
    expect(controller.view()).toBe('open');
    controller.resume();
    await settle();
    expect(controller.view()).toBe('open');
    expect(state.verifyCalls).toBe(1);
  });

  it('stays locked when the prompt is cancelled', async () => {
    const { state, controller } = fakeDeps();
    controller.start();
    await settle();
    state.answer(false);
    await settle();
    expect(controller.view()).toBe('locked');
    const again = controller.unlock();
    await settle();
    expect(state.verifyCalls).toBe(2);
    state.answer(true);
    await again;
    expect(controller.view()).toBe('open');
  });

  it('does not open a second prompt while one is open', async () => {
    const { state, controller } = fakeDeps();
    controller.start();
    await settle();
    void controller.unlock();
    await settle();
    expect(state.verifyCalls).toBe(1);
  });

  it('opens without a prompt when the phone has no screen lock', async () => {
    const { state, controller } = fakeDeps({}, false);
    controller.start();
    await settle();
    expect(controller.view()).toBe('open');
    expect(state.verifyCalls).toBe(0);
  });

  it('does nothing on pause while disabled', () => {
    const { state, controller } = fakeDeps({ enabled: false });
    controller.start();
    state.views.length = 0;
    controller.pause();
    expect(controller.view()).toBe('open');
    expect(state.views).toEqual([]);
  });

  it('confirm reports no-screen-lock, cancelled and ok', async () => {
    const insecure = fakeDeps({ enabled: false }, false);
    expect(await insecure.controller.confirm()).toBe('no-screen-lock');
    expect(insecure.state.verifyCalls).toBe(0);

    const { state, controller } = fakeDeps({ enabled: false });
    const cancelled = controller.confirm();
    await settle();
    state.answer(false);
    expect(await cancelled).toBe('cancelled');
    const ok = controller.confirm();
    await settle();
    state.answer(true);
    expect(await ok).toBe('ok');
  });

  it('confirm ignores pause/resume and keeps the app open', async () => {
    const { state, controller } = fakeDeps({ enabled: false });
    controller.start();
    state.settings.enabled = true;
    const result = controller.confirm();
    await settle();
    controller.pause();
    state.clock += 600_000;
    controller.resume();
    await settle();
    expect(controller.view()).toBe('open');
    state.answer(true);
    expect(await result).toBe('ok');
    expect(controller.view()).toBe('open');
    expect(state.verifyCalls).toBe(1);
  });

  it('locks after the lock time when the owner leaves during a Settings prompt', async () => {
    const { state, controller } = fakeDeps({ enabled: false });
    controller.start();
    state.settings.enabled = true;
    const result = controller.confirm();
    await settle();
    controller.pause();
    // Android cancels the prompt once Budgy goes to the background.
    state.answer(false);
    expect(await result).toBe('cancelled');
    expect(controller.view()).toBe('covered');
    state.clock += 600_000;
    controller.resume();
    await settle();
    expect(controller.view()).toBe('locked');
    expect(state.verifyCalls).toBe(2);
  });

  it("doesn't lock on the return from Budgy's own prompt, even with Immediately", async () => {
    const { state, controller } = fakeDeps({ enabled: false, afterMs: 0 });
    controller.start();
    state.settings.enabled = true;
    const result = controller.confirm();
    await settle();
    controller.pause();
    // The prompt's answer can reach Budgy just before its resume.
    state.answer(true);
    expect(await result).toBe('ok');
    state.clock += 50;
    controller.resume();
    await settle();
    expect(controller.view()).toBe('open');
    expect(state.verifyCalls).toBe(1);
  });

  it('stays covered when an unlock prompt ends while Budgy is away', async () => {
    const { state, controller } = fakeDeps();
    controller.start();
    await settle();
    controller.pause();
    state.answer(true);
    await settle();
    expect(controller.view()).toBe('covered');
    state.clock += 600_000;
    controller.resume();
    await settle();
    expect(controller.view()).toBe('locked');
  });

  it('reports each view change once', async () => {
    const { state, controller } = fakeDeps();
    controller.start();
    await settle();
    state.answer(true);
    await settle();
    expect(state.views).toEqual(['locked', 'open']);
  });
});
