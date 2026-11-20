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
 * After a prompt that ended while Budgy was in the background, a return within this long is the prompt's own
 * return (its answer can reach Budgy just before the resume), not the owner coming back later.
 */
export const PROMPT_RETURN_GRACE_MS = 2_000;

/**
 * The app lock's rules. Android's unlock prompt is a separate screen, so it pauses and resumes Budgy around
 * every unlock: pause and resume don't cover or lock while a prompt is open, so coming back from it never locks
 * again. If the prompt ends while Budgy is in the background (Android cancels it when the owner leaves), the
 * time away starts then, so leaving mid-prompt still locks.
 */
export function createLockController(deps: LockDeps): LockController {
  let view: LockView = 'open';
  let awayAt: number | null = null;
  let awayFromPrompt = false;
  let prompting = false;
  let active = true;

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
      if (!active && deps.settings().enabled) {
        awayAt = deps.now();
        awayFromPrompt = true;
      }
    }
  };

  /** Shows the app, or keeps it covered while Budgy is still away. */
  const showUnlessAway = () => show(awayAt === null ? 'open' : 'covered');

  const unlock = async () => {
    const result = await prompt();
    if (result === 'ok' || result === 'no-screen-lock') showUnlessAway();
  };

  return {
    view: () => view,
    start() {
      if (!deps.settings().enabled) return show('open');
      show('locked');
      void unlock();
    },
    pause() {
      active = false;
      if (prompting || !deps.settings().enabled) return;
      awayAt = deps.now();
      awayFromPrompt = false;
      show('covered');
    },
    resume() {
      active = true;
      if (prompting || awayAt === null) return;
      const away = deps.now() - awayAt;
      const { enabled, afterMs } = deps.settings();
      const after = awayFromPrompt ? Math.max(afterMs, PROMPT_RETURN_GRACE_MS) : afterMs;
      awayAt = null;
      if (enabled && away >= after) {
        show('locked');
        void unlock();
      } else {
        show('open');
      }
    },
    unlock,
    async confirm() {
      const result = (await prompt()) ?? 'cancelled';
      if (view === 'open' && awayAt !== null) show('covered');
      return result;
    },
  };
}
