import type { SmsLink } from '@/shared/models';

/** The card a link names for display: `CIB ••4821`, or just `CIB` when it has no digits (the caller adds "no number"). */
export function linkCardLabel(link: Pick<SmsLink, 'address' | 'digits'>): { sender: string; digits?: string } {
  return { sender: link.address.toUpperCase(), digits: link.digits ? `••${link.digits}` : undefined };
}
