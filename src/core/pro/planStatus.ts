import type { ProPlan } from './revenuecat';

/** The one status line under an active plan, as translation keys: what it is and when it renews or ends. */
export interface PlanStatus {
  key: string;
  /** Translation key of the plan's name, when it has one (monthly or yearly). */
  plan?: string;
  /** ISO date it renews or ends. */
  date?: string;
  /** It needs the subscriber's attention: it won't renew, or the store couldn't charge. */
  attention: boolean;
}

export function planStatus(p: ProPlan): PlanStatus {
  if (p.billingIssue) return { key: 'pro.billingIssue', attention: true };
  if (p.period === 'lifetime' || !p.endsAt) return { key: 'pro.lifetimeAccess', attention: false };
  const date = p.endsAt;
  if (p.trial) return p.willRenew ? { key: 'pro.trialRenews', date, attention: false } : { key: 'pro.trialEnds', date, attention: true };
  const plan = p.period === 'monthly' ? 'pro.planMonthly' : p.period === 'yearly' ? 'pro.planYearly' : undefined;
  if (!plan) return p.willRenew ? { key: 'pro.renewsOn', date, attention: false } : { key: 'pro.endsOn', date, attention: true };
  return p.willRenew ? { key: 'pro.planRenews', plan, date, attention: false } : { key: 'pro.planEnds', plan, date, attention: true };
}
