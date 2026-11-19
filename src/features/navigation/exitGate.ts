/** How long after the first back press a second one still closes the app. */
export const EXIT_WINDOW_MS = 2000;

/** The bottom tabs: back on one of these asks to exit instead of stepping back through pages. */
const TAB_PATHS = ['/accounts', '/categories', '/transactions', '/overview'];

/** Where a page opened on top of the tabs returns to when there is no history to go back through. */
const PARENT_PATHS: Record<string, string> = { '/sms/links': '/sms' };
const HOME_PATH = '/categories';

/**
 * Where back leads from `pathname`: null on a tab (back asks to exit), otherwise the page to fall
 * back to when there is no history, matching that page's on-screen back arrow.
 */
export function backFallback(pathname: string): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (path === '/' || TAB_PATHS.includes(path)) return null;
  return PARENT_PATHS[path] ?? HOME_PATH;
}

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
