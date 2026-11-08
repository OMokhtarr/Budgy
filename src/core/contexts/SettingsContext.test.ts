import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { stampIfSynced, withoutLastScan, type Settings } from './SettingsContext';

const settings = (s: Partial<Settings>) => ({ currency: 'USD', ...s }) as Settings;

describe('stampIfSynced', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.parse('2026-11-04T12:00:00Z') });
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('stamps a change with the current time and marks it for upload', () => {
    const next = stampIfSynced(settings({ syncedUpdatedAt: '2026-11-04T09:00:00.000Z' }), settings({ currency: 'EUR' }));
    expect([next.syncedUpdatedAt, next.syncedDirty]).toEqual(['2026-11-04T12:00:00.000Z', true]);
  });

  it('stamps a change later than the version it changes, even when the clock is behind it', () => {
    const next = stampIfSynced(settings({ syncedUpdatedAt: '2026-11-04T15:00:00.000Z' }), settings({ currency: 'EUR' }));
    expect(next.syncedUpdatedAt).toBe('2026-11-04T15:00:00.001Z');
  });

  it('stamps the first change on a device that has no stamp yet', () => {
    expect(stampIfSynced(settings({}), settings({ currency: 'EUR' })).syncedUpdatedAt).toBe('2026-11-04T12:00:00.000Z');
  });

  it("leaves the stamp alone when no synced setting changed", () => {
    const prev = settings({ syncedUpdatedAt: '2026-11-04T09:00:00.000Z' });
    const next = { ...prev, theme: 'dark' as const };
    expect(stampIfSynced(prev, next)).toBe(next);
  });
});

describe('withoutLastScan', () => {
  it('forgets the last scan and keeps the rest, without marking anything for upload', () => {
    const prev = settings({ syncedUpdatedAt: '2026-11-04T09:00:00.000Z', smsImport: { enabled: true, senders: ['CIB'], lastScanAt: '2026-11-07T10:00:00.000Z' } });
    const next = withoutLastScan(prev);
    expect(next.smsImport).toEqual({ enabled: true, senders: ['CIB'] });
    expect([next.currency, next.syncedUpdatedAt, next.syncedDirty]).toEqual(['USD', '2026-11-04T09:00:00.000Z', undefined]);
  });
});
