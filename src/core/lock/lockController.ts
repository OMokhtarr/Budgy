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
  now(): number;
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
  pause(): void;
  resume(): void;
  unlock(): Promise<void>;
  /** For turning the lock on or off: the owner unlocks once, without changing what the app shows. */
  confirm(): Promise<ConfirmResult>;
}

/**
 * The app lock's rules. Android's unlock prompt is a separate screen, so it pauses and resumes Budgy around
 * every unlock: pause and resume are ignored while a prompt is open, so coming back from it never locks again.
 */
export function createLockController(deps: LockDeps): LockController {
  let view: LockView = 'open';
  let awayAt: number | null = null;
  let prompting = false;

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
    }
  };

  const unlock = async () => {
    const result = await prompt();
    if (result === 'ok' || result === 'no-screen-lock') show('open');
  };

  return {
    view: () => view,
    start() {
      if (!deps.settings().enabled) return show('open');
      show('locked');
      void unlock();
    },
    pause() {
      if (prompting || !deps.settings().enabled) return;
      awayAt = deps.now();
      show('covered');
    },
    resume() {
      if (prompting || awayAt === null) return;
      const away = deps.now() - awayAt;
      awayAt = null;
      if (deps.settings().enabled && away >= deps.settings().afterMs) {
        show('locked');
        void unlock();
      } else {
        show('open');
      }
    },
    unlock,
    async confirm() {
      return (await prompt()) ?? 'cancelled';
    },
  };
}
