import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/**
 * Saves a text file. On Android/iOS it's written to the app cache and handed to the
 * native share sheet (save to Files / Drive / WhatsApp…). On the web it downloads.
 * Resolves to false when the user closes the share sheet without picking anything.
 */
export async function saveTextFile(filename: string, content: string, mime: string): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    const res = await Filesystem.writeFile({
      path: filename,
      data: content,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    try {
      await Share.share({ title: filename, url: res.uri, dialogTitle: filename });
    } catch (err) {
      // Closing the share sheet rejects with "Share canceled": not a failure, just nothing saved.
      if (/cancel/i.test(err instanceof Error ? err.message : String(err))) return false;
      throw err;
    }
    return true;
  }
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

/** Opens the system file picker and returns the chosen file's text. */
export function pickTextFile(accept = '.json,application/json'): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = async () => {
      const file = input.files?.[0];
      resolve(file ? await file.text() : null);
    };
    input.click();
  });
}

export function toCsv(rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // BOM so Excel opens UTF-8 (Arabic) correctly
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
}
