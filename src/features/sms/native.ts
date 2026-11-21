import { registerPlugin, type PermissionState } from '@capacitor/core';
import type { SmsMessage } from './parser/types';

/** The local `plugins/sms-inbox` plugin (Android only). */
export interface SmsInboxPlugin {
  /** Whether this build declares READ_SMS (the app's main manifest does, so every Android build). */
  isAvailable(): Promise<{ available: boolean }>;
  checkPermissions(): Promise<{ sms: PermissionState }>;
  requestPermissions(): Promise<{ sms: PermissionState }>;
  /** Inbox texts received at or after `since` (ms epoch), newest first. */
  list(options: { since: number }): Promise<{ messages: SmsMessage[] }>;
}

export const SmsInbox = registerPlugin<SmsInboxPlugin>('SmsInbox');
