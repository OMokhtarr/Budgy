import { describe, expect, it } from 'vitest';
import { createLockController, type AppLockSettings, type LockView } from './lockController';

/**
 * Fakes in the order Android sends things. The prompt is a see-through screen over Budgy, so it doesn't count as
 * leaving: only pressing Home / switching apps sends `leave`, and coming back sends `comeBack`. When the owner
 * leaves while a prompt is open, the prompt's answer reaches Budgy only after it comes back.
 */
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
    now: async () => state.clock,
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

/** Lets the controller's awaits run. */
const settle = () => new Promise((r) => setTimeout(r, 0));

/** Starts with the lock off, then turns it on, as after turning it on in Settings. */
async function openWithLockOn(initial: Partial<AppLockSettings> = {}) {
  const fake = fakeDeps({ ...initial, enabled: false });
  fake.controller.start();
  fake.state.settings.enabled = true;
  await settle();
  return fake;
}

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

  it('covers when Budgy is left and opens on a return within the lock time', async () => {
    const { state, controller } = await openWithLockOn();
    controller.leave();
    expect(controller.view()).toBe('covered');
    await settle();
    state.clock += 30_000;
    await controller.comeBack();
    expect(controller.view()).toBe('open');
    expect(state.verifyCalls).toBe(0);
  });

  it('locks on a return after the lock time', async () => {
    const { state, controller } = await openWithLockOn();
    controller.leave();
    state.clock += 60_000;
    await controller.comeBack();
    expect(controller.view()).toBe('locked');
    expect(state.verifyCalls).toBe(1);
  });

  it('locks on any return with Immediately', async () => {
    const { state, controller } = await openWithLockOn({ afterMs: 0 });
    controller.leave();
    await controller.comeBack();
    expect(controller.view()).toBe('locked');
    expect(state.verifyCalls).toBe(1);
  });

  it('locks when the phone clock was set back while Budgy was away', async () => {
    const { state, controller } = await openWithLockOn();
    controller.leave();
    await settle();
    state.clock -= 600_000;
    await controller.comeBack();
    expect(controller.view()).toBe('locked');
  });

  it('stays on the lock cover without a new prompt when the prompt is cancelled', async () => {
    const { state, controller } = fakeDeps();
    controller.start();
    await settle();
    state.answer(false);
    await settle();
    expect(controller.view()).toBe('locked');
    expect(state.verifyCalls).toBe(1);
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

  it('does nothing when Budgy is left while the lock is off', async () => {
    const { state, controller } = fakeDeps({ enabled: false });
    controller.start();
    state.views.length = 0;
    controller.leave();
    await controller.comeBack();
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

  it('keeps the app open, with no cover, around a Settings prompt', async () => {
    const { state, controller } = await openWithLockOn();
    state.views.length = 0;
    const result = controller.confirm();
    await settle();
    state.answer(true);
    expect(await result).toBe('ok');
    expect(controller.view()).toBe('open');
    expect(state.views).toEqual([]);
  });

  it('locks when the owner leaves during a Settings prompt and comes back after the lock time', async () => {
    const { state, controller } = await openWithLockOn();
    const result = controller.confirm();
    await settle();
    controller.leave();
    expect(controller.view()).toBe('covered');
    await settle();
    state.clock += 600_000;
    const back = controller.comeBack();
    // Android hands over the held answer (a cancel) only once Budgy is back.
    state.answer(false);
    await back;
    expect(await result).toBe('cancelled');
    await settle();
    expect(controller.view()).toBe('locked');
    expect(state.verifyCalls).toBe(2);
  });

  it('opens when the owner leaves during a Settings prompt and comes straight back', async () => {
    const { state, controller } = await openWithLockOn();
    const result = controller.confirm();
    await settle();
    controller.leave();
    await settle();
    state.clock += 5_000;
    const back = controller.comeBack();
    state.answer(false);
    await back;
    expect(await result).toBe('cancelled');
    await settle();
    expect(controller.view()).toBe('open');
    expect(state.verifyCalls).toBe(1);
  });

  it('prompts again when the owner leaves during the unlock prompt and comes straight back', async () => {
    const { state, controller } = fakeDeps();
    controller.start();
    await settle();
    controller.leave();
    await settle();
    state.clock += 50;
    const back = controller.comeBack();
    state.answer(false);
    await back;
    await settle();
    expect(controller.view()).toBe('locked');
    expect(state.verifyCalls).toBe(2);
  });

  it('stays locked when Budgy is left from the lock cover and reopened within the lock time', async () => {
    const { state, controller } = fakeDeps();
    controller.start();
    await settle();
    state.answer(false);
    await settle();
    controller.leave();
    expect(controller.view()).toBe('locked');
    await settle();
    state.clock += 10_000;
    await controller.comeBack();
    expect(controller.view()).toBe('locked');
    expect(state.verifyCalls).toBe(2);
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
