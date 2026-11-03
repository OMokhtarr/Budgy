import type { BankTemplate } from './types';

/**
 * Known bank formats, tried before the generic reader. Add one per bank once real (masked) sample
 * texts are available, with those samples as fixtures in `parseSms.test.ts`.
 */
export const BANK_TEMPLATES: BankTemplate[] = [];
