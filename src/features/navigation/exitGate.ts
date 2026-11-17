/** How long after the first back press a second one still closes the app. */
export const EXIT_WINDOW_MS = 2000;

/**
 * Returns the back press handler: the first press calls `onFirst` (show "press again to exit"),
 * and a second one within EXIT_WINDOW_MS calls `onExit`.
 */
export function createBackToExit(onFirst: () => void, onExit: () => void, now: () => number = Date.now): () => void {
  let lastPress = -Infinity;
  return () => {
    const time = now();
    if (time - lastPress <= EXIT_WINDOW_MS) {
      lastPress = -Infinity;
      onExit();
    } else {
      lastPress = time;
      onFirst();
    }
  };
}
