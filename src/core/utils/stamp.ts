/**
 * Now, but always later than `prev`: an edit must count as newer than the version it changes, even when
 * that version came from a device whose clock runs ahead (otherwise "last edit wins" would drop it).
 */
export function stampAfter(prev: string | undefined): string {
  return new Date(Math.max(Date.now(), prev ? Date.parse(prev) + 1 : 0)).toISOString();
}
