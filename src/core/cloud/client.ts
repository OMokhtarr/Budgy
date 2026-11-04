import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import type { SyncedTable } from '@/core/db/db';
import type { Remote, RemoteRow, RemoteSettings, RemoteStamp } from './sync';

/**
 * Cloud settings come from the build environment (see `.env.example`). Without a Supabase URL and
 * publishable key the app is offline-only: sign-in is hidden and nothing leaves the device.
 */
export const cloudConfig = {
  url: (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '',
  /** The publishable key (sb_publishable_…). Never the secret / service_role key. */
  key: (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ?? '',
  googleWebClientId: (import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID as string | undefined) ?? '',
  googleIosClientId: (import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID as string | undefined) ?? '',
  /** Sign in with Apple on the web (needs an Apple Services ID set up in Supabase). Always on for iOS. */
  appleOnWeb: import.meta.env.VITE_APPLE_SIGN_IN_WEB === 'true',
};

export const cloudEnabled = !!(cloudConfig.url && cloudConfig.key);

export const supabase: SupabaseClient | null = cloudEnabled
  ? createClient(cloudConfig.url, cloudConfig.key, {
      auth: {
        storageKey: 'budgy-auth',
        persistSession: true,
        autoRefreshToken: true,
        // Web sign-in comes back with ?code=… in the URL (PKCE); native sign-in uses ID tokens instead.
        detectSessionInUrl: !Capacitor.isNativePlatform(),
        flowType: 'pkce',
      },
    })
  : null;

// Phones suspend the app in the background: only refresh tokens while it's in front.
if (supabase && Capacitor.isNativePlatform()) {
  void CapApp.addListener('appStateChange', ({ isActive }) => {
    if (isActive) void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  });
}

const SELECT = 'id, data, updated_at, deleted_at, server_updated_at';

/** Keeps the HTTP status with the error, so sync can tell a rejected session (401) from other failures. */
const withStatus = <E extends object>(error: E, status: number) => Object.assign(error, { status });

/** The cloud copy of one user's data, through the Data API (row-level security limits it to them). */
export class SupabaseRemote implements Remote {
  constructor(
    private client: SupabaseClient,
    private userId: string,
  ) {}

  async push(table: SyncedTable, rows: RemoteRow[]): Promise<void> {
    const { error, status } = await this.client
      .from(table)
      .upsert(rows.map((r) => ({ ...r, user_id: this.userId })), { onConflict: 'user_id,id' });
    if (error) throw withStatus(error, status);
  }

  async pull(table: SyncedTable, since: string | null, limit: number): Promise<RemoteRow[]> {
    let q = this.client.from(table).select(SELECT).order('server_updated_at').limit(limit);
    if (since) q = q.gt('server_updated_at', since);
    const { data, error, status } = await q;
    if (error) throw withStatus(error, status);
    return (data ?? []) as RemoteRow[];
  }

  async allStamps(table: SyncedTable): Promise<RemoteStamp[]> {
    const stamps: RemoteStamp[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error, status } = await this.client.from(table).select('id, updated_at').order('id').range(from, from + 999);
      if (error) throw withStatus(error, status);
      stamps.push(...((data ?? []) as RemoteStamp[]));
      if ((data?.length ?? 0) < 1000) return stamps;
    }
  }

  async hasTransactions(): Promise<boolean> {
    const { count, error, status } = await this.client
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null);
    if (error) throw withStatus(error, status);
    return (count ?? 0) > 0;
  }

  async getSettings(): Promise<RemoteSettings | null> {
    const { data, error, status } = await this.client.from('settings').select('data, updated_at').maybeSingle();
    if (error) throw withStatus(error, status);
    return data as RemoteSettings | null;
  }

  async putSettings(settings: RemoteSettings): Promise<void> {
    const { error, status } = await this.client
      .from('settings')
      .upsert({ ...settings, user_id: this.userId }, { onConflict: 'user_id' });
    if (error) throw withStatus(error, status);
  }
}
