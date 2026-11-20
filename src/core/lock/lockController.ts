/** "Lock after" choices: how long Budgy can be away before coming back asks to unlock. */
export const LOCK_AFTER_OPTIONS = [0, 60_000, 300_000] as const;
export const DEFAULT_LOCK_AFTER_MS = 60_000;

/** Per device: never synced or backed up. */
export interface AppLockSettings {
  enabled: boolean;
  /** Time away (ms) after which coming back asks to unlock; 0 = every time. */
  afterMs: number;
}

/** open: the app shows. covered: hidden while away, no prompt. locked: hidden until the owner unlocks. */
export type LockView = 'open' | 'covered' | 'locked';
export type ConfirmResult = 'ok' | 'cancelled' | 'no-screen-lock';

export interface LockDeps {
  /** A clock that changing the phone's time doesn't move and that keeps counting while it sleeps (ms). */
  now(): Promise<number>;
  settings(): AppLockSettings;
  /** Whether the phone has a screen lock (PIN, pattern or password). */
  isSecure(): Promise<boolean>;
  /** Shows the phone's unlock prompt; true once unlocked, false on any cancel or failure. */
  verify(): Promise<boolean>;
  onView(view: LockView): void;
}

export interface LockController {
  view(): LockView;
  start(): void;
  /** The owner left Budgy (Home, another app, screen off). Budgy's own prompt doesn't count. */
  leave(): void;
  /** The owner came back to Budgy. */
  comeBack(): Promise<void>;
  /** The cover's Unlock button, and the prompt that opens by itself. */
  unlock(): Promise<void>;
  /** For turning the lock on or off: the owner unlocks once, without changing what the app shows. */
  confirm(): Promise<ConfirmResult>;
}

/**
 * The app lock's rules. Time away runs from leaving Budgy to coming back; Android's unlock prompt sits over
 * Budgy without leaving it, so it never counts. When the owner leaves while a prompt is open, Android holds the
 * prompt's answer until Budgy is back: a return that must lock waits for that prompt to end, then asks again.
 * Once locked, only an unlock (or a phone with no screen lock) opens Budgy.
 */
export function createLockController(deps: LockDeps): LockController {
  let view: LockView = 'open';
  let awayAt: number | null = null;
  let leaving: Promise<void> = Promise.resolve();
  let prompting = false;
  let unlockWhenPromptEnds = false;

  const show = (next: LockView) => {
    if (next === view) return;
    view = next;
    deps.onView(next);
  };

  /** Runs the prompt once at a time; null when another prompt is already open. */
  const prompt = async (): Promise<ConfirmResult | null> => {
    if (prompting) return null;
    prompting = true;
    try {
      // Without a screen lock anyone could open the phone, so there's nothing to ask for.
      if (!(await deps.isSecure())) return 'no-screen-lock';
      return (await deps.verify()) ? 'ok' : 'cancelled';
    } finally {
      prompting = false;
      if (unlockWhenPromptEnds) {
        unlockWhenPromptEnds = false;
        void unlock();
      }
    }
  };

  const unlock = async () => {
    const result = await prompt();
    // Still away (the answer came before the return): stay covered until the return decides.
    if (result === 'ok' || result === 'no-screen-lock') show(awayAt === null ? 'open' : 'covered');
  };

  const lock = () => {
    show('locked');
    if (prompting) unlockWhenPromptEnds = true;
    else void unlock();
  };

  return {
    view: () => view,
    start() {
      if (!deps.settings().enabled) return show('open');
      lock();
    },
    leave() {
      if (!deps.settings().enabled) return;
      if (view === 'open') show('covered');
      leaving = deps.now().then((t) => {
        awayAt = t;
      });
    },
    async comeBack() {
      await leaving;
      if (awayAt === null) return;
      const away = (await deps.now()) - awayAt;
      awayAt = null;
      const { enabled, afterMs } = deps.settings();
      // A negative time away means the clock can't be trusted, so lock.
      if (view === 'locked' || (enabled && (away >= afterMs || away < 0))) lock();
      else show('open');
    },
    unlock,
    async confirm() {
      return (await prompt()) ?? 'cancelled';
    },
  };
}
