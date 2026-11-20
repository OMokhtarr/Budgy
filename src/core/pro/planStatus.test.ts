import { describe, expect, it } from 'vitest';
import { planStatus } from './planStatus';
import type { ProPlan } from './revenuecat';

const DATE = '2027-11-20T10:00:00Z';
const plan = (p: Partial<ProPlan>): ProPlan => ({
  period: 'yearly',
  trial: false,
  willRenew: true,
  endsAt: DATE,
  billingIssue: false,
  ...p,
});

describe('planStatus', () => {
  it('names a renewing plan and its renewal date', () => {
    expect(planStatus(plan({ period: 'monthly' }))).toEqual({ key: 'pro.planRenews', plan: 'pro.planMonthly', date: DATE, attention: false });
    expect(planStatus(plan({ period: 'yearly' }))).toEqual({ key: 'pro.planRenews', plan: 'pro.planYearly', date: DATE, attention: false });
  });

  it('flags a plan that will not renew', () => {
    expect(planStatus(plan({ willRenew: false }))).toEqual({ key: 'pro.planEnds', plan: 'pro.planYearly', date: DATE, attention: true });
  });

  it('leaves out the plan name when the plan is not a monthly or yearly one (a promotional grant)', () => {
    expect(planStatus(plan({ period: 'other', willRenew: false }))).toEqual({ key: 'pro.endsOn', date: DATE, attention: true });
    expect(planStatus(plan({ period: 'other' }))).toEqual({ key: 'pro.renewsOn', date: DATE, attention: false });
  });

  it('says when a trial turns into a payment, and flags a trial that will end', () => {
    expect(planStatus(plan({ trial: true }))).toEqual({ key: 'pro.trialRenews', date: DATE, attention: false });
    expect(planStatus(plan({ trial: true, willRenew: false }))).toEqual({ key: 'pro.trialEnds', date: DATE, attention: true });
  });

  it('calls a plan with no end lifetime access', () => {
    expect(planStatus(plan({ period: 'lifetime', endsAt: null, willRenew: false }))).toEqual({ key: 'pro.lifetimeAccess', attention: false });
    expect(planStatus(plan({ period: 'other', endsAt: null }))).toEqual({ key: 'pro.lifetimeAccess', attention: false });
  });

  it('puts a billing problem before everything else', () => {
    expect(planStatus(plan({ billingIssue: true, trial: true }))).toEqual({ key: 'pro.billingIssue', attention: true });
  });
});
