/** Formats 16 bytes as UUID text. */
const uuidText = (b: Uint8Array) => {
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
};

/**
 * Random record ids (UUID v4), so records made on different devices never collide once they sync.
 * `crypto.randomUUID` is missing before iOS 15.4, hence the fallback.
 */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  return uuidText(b);
}

const sha256 = async (text: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));

/** SHA-256 of `text` (UTF-8), as lowercase hex. */
export async function sha256Hex(text: string): Promise<string> {
  return [...(await sha256(text))].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/**
 * The same UUID for the same key on every device (version 5 bits, from the first 16 bytes of the key's
 * SHA-256), so two phones that learn the same thing write the same record and "last edit wins" settles it.
 */
export async function idFromKey(key: string): Promise<string> {
  const b = (await sha256(key)).slice(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  return uuidText(b);
}
