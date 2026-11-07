import { describe, expect, it } from 'vitest';
import { parseSms } from './parseSms';
import type { BankTemplate } from './types';

// SYNTHETIC fixtures: invented to look like Egyptian bank texts, not copied from real messages.
// Replace or extend them with real (masked) samples per bank when templates are added.
const t = (body: string, sender = 'CIB') => parseSms(sender, body, []);

describe('parseSms', () => {
  it('reads an English debit', () => {
    expect(t('Your card **4821 was debited with EGP 450.00 at CARREFOUR MAADI on 03/11/2026 10:15'))
      .toEqual({ status: 'understood', amount: 450, currency: 'EGP', direction: 'out', merchant: 'CARREFOUR MAADI', digits: '4821' });
  });
  it('reads an Arabic debit', () => {
    expect(t('تم خصم مبلغ ٣٢٠٫٥٠ ج.م من حسابكم رقم ****7781 لدى سوبر ماركت المعادي', 'Bank-AlAhly'))
      .toMatchObject({ status: 'understood', amount: 320.5, currency: 'EGP', direction: 'out', digits: '7781' });
  });
  it('reads a credit', () => {
    expect(t('Your account xx1234 has been credited with 12,000.00 EGP')).toMatchObject({ status: 'understood', direction: 'in', amount: 12000 });
  });
  it('ignores the balance amount', () => {
    expect(t('Card **4821 debited EGP 450.00 at UBER. Available balance EGP 5,000.00')).toMatchObject({ amount: 450 });
  });
  it('filters OTPs, promos and balance notices', () => {
    expect(t('Your OTP is 482913. Do not share it with anyone')).toEqual({ status: 'ignored', reason: 'otp' });
    expect(t('كود التحقق الخاص بك 4521')).toEqual({ status: 'ignored', reason: 'otp' });
    expect(t('Get 10% cashback on all purchases! Visit https://x.example')).toEqual({ status: 'ignored', reason: 'promo' });
    expect(t('Your available balance is EGP 5,000.00')).toEqual({ status: 'ignored', reason: 'balance' });
  });
  it('marks unclear texts unreadable but keeps what it found', () => {
    expect(t('Transaction of EGP 200.00 on card **4821')).toEqual({ status: 'unreadable', amount: 200, currency: 'EGP', digits: '4821' });
  });
  it('prefers a matching template over the generic reader', () => {
    const tpl: BankTemplate = {
      id: 'test-bank',
      sender: /^TESTBANK$/i,
      formats: [{ match: /^POS/, direction: 'out', amount: /AMT:([\d.,]+)/, currency: /CUR:(\w+)/, merchant: /MER:(.+?);/, digits: /C:(\d{4})/ }],
    };
    expect(parseSms('TestBank', 'POS AMT:99.5 CUR:EGP MER:KIOSK; C:1111', [tpl]))
      .toEqual({ status: 'understood', amount: 99.5, currency: 'EGP', direction: 'out', merchant: 'KIOSK', digits: '1111' });
  });
});

// From the final review: realistic phrasings that used to give a wrong 'understood' or get dropped.
describe('parseSms review cases', () => {
  it('never takes the balance for the amount', () => {
    expect(t('تم إضافة ١٠٠٠ جنيه، رصيدكم المتاح بعد تنفيذ العملية ٥٠٠٠ جنيه')).toMatchObject({ status: 'understood', direction: 'in', amount: 1000 });
    expect(t('تم خصم ٤٥٠ جنيه، لدى اوبر')).toMatchObject({ status: 'understood', direction: 'out', amount: 450 });
    expect(t('Your available balance after this transaction is EGP 5,000.00. EGP 450.00 was debited at UBER')).toMatchObject({ amount: 450 });
    expect(t('Avl Bal EGP 5,000.00. Debited EGP 450.00 at UBER')).toMatchObject({ amount: 450 });
    expect(t('Bal: EGP 5,000.00 | Debited EGP 450.00')).toMatchObject({ amount: 450 });
  });
  it('never takes masked digits or clock times for the amount', () => {
    expect(t('Card **4821 EGP 450.00 debited at UBER')).toMatchObject({ status: 'understood', amount: 450, digits: '4821' });
    expect(t('Purchase on card **4821 EGP 450.00 at UBER')).toMatchObject({ amount: 450 });
    expect(t('03/11/2026 10:15 EGP 450.00 debited card **4821')).toMatchObject({ amount: 450 });
    expect(t('card 4821 EGP 450.00 debited at UBER')).toMatchObject({ amount: 450 });
  });
  it('does not confirm transactions that did not happen', () => {
    for (const body of [
      'Purchase of EGP 450.00 at UBER declined due to insufficient balance',
      'لم تتم عملية الشراء بمبلغ 450 جنيه لعدم كفاية الرصيد',
      'Your loan installment EGP 1,000.00 will be deducted on 05/11',
      'سيتم خصم قسط بمبلغ 1000 جنيه',
      'credit card statement: min payment EGP 500.00, total due EGP 10,000.00',
      'a payment of EGP 450.00 at UBER is pending',
    ]) expect(t(body).status, body).toBe('unreadable');
  });
  it('keeps transactions that mention OTPs, links or offers', () => {
    expect(t('تم خصم 450 جنيه من بطاقتك. رمز العملية 12345')).toMatchObject({ status: 'understood', amount: 450 });
    expect(t('Card **4821 debited EGP 450.00 at UBER. Never share your card details, PIN or OTP')).toMatchObject({ status: 'understood', amount: 450 });
    expect(t('تم خصم 450 جنيه لدى سوبر ماركت. لا تشارك بياناتك مع أحد')).toMatchObject({ status: 'understood', amount: 450 });
    expect(t('Card **4821 debited EGP 450 at UBER. For more info visit www.cibeg.com')).toMatchObject({ status: 'understood', amount: 450 });
    expect(t('تم خصم 450 جنيه لدى معرض الأثاث')).toMatchObject({ status: 'understood', amount: 450 });
    expect(t('Cashback of EGP 50.00 has been credited')).toMatchObject({ status: 'understood', direction: 'in', amount: 50 });
    expect(t('تم شحن رصيد 50 جنيه').status).toBe('unreadable');
  });
  it('still drops OTPs that quote a purchase', () => {
    expect(t('Your OTP for purchase of EGP 450.00 at AMAZON is 482913')).toEqual({ status: 'ignored', reason: 'otp' });
    expect(t('رمز التحقق لعملية شراء بمبلغ 450 جنيه هو 4821')).toEqual({ status: 'ignored', reason: 'otp' });
  });
  it('reads decimal commas', () => {
    expect(t('EGP 450,50 debited')).toMatchObject({ amount: 450.5 });
    expect(t('EGP 1.500,00 debited')).toMatchObject({ amount: 1500 });
  });
  it('lets a template read texts the filters would drop', () => {
    const tpl: BankTemplate = { id: 't', sender: /^TESTBANK$/i, formats: [{ match: /^POS/, direction: 'out', amount: /AMT:([\d.,]+)/ }] };
    expect(parseSms('TestBank', 'POS AMT:99.5 never share your OTP', [tpl])).toMatchObject({ status: 'understood', amount: 99.5 });
  });
});

// Wording from many banks: the generic reader is the main parser (no per-bank samples are collected).
describe('parseSms common wording', () => {
  const cases: [string, 'out' | 'in', number][] = [
    ['Your Credit Card ending with 4821 was charged for EGP 450.00 at UBER', 'out', 450],
    ['You have sent EGP 500.00 via InstaPay to AHMED ALI', 'out', 500],
    ['EGP 2,000.00 transferred from your account **1234 to account **9999', 'out', 2000],
    ['Your card **4821 was used for EGP 120.00 at TALABAT', 'out', 120],
    ['Bill payment of EGP 300.00 for VODAFONE was successful', 'out', 300],
    ['Refund of EGP 450.00 from UBER has been processed', 'in', 450],
    ['Transaction of EGP 450.00 at UBER was reversed', 'in', 450],
    ['You have received EGP 500.00 via InstaPay from MONA', 'in', 500],
    ['Salary of EGP 15,000.00 has been deposited to your account **1234', 'in', 15000],
    ['Cash deposit of EGP 1,000.00 to your account **1234', 'in', 1000],
    ['تم سداد فاتورة بمبلغ 300 جنيه', 'out', 300],
    ['تم تحويل 2000 جنيه من حسابكم إلى حساب ****9999', 'out', 2000],
    ['تم تحويل 500 جنيه إلى حسابكم من أحمد', 'in', 500],
    ['تم استرداد مبلغ 450 جنيه لدى اوبر', 'in', 450],
    ['تم استخدام بطاقتكم المنتهية ب 4821 في عملية بمبلغ 120 جنيه', 'out', 120],
    ['مشتريات بمبلغ 120 جنيه لدى طلبات', 'out', 120],
    ['تم إيداع الراتب بمبلغ 15000 جنيه', 'in', 15000],
    ['حوالة واردة بمبلغ 500 جنيه', 'in', 500],
  ];
  it.each(cases)('%s', (body, direction, amount) => {
    expect(t(body)).toMatchObject({ status: 'understood', direction, amount });
  });
  it('stops the merchant before trailing words', () => {
    expect(t('Card **4821 debited EGP 85.00 at UBER using card **4821')).toMatchObject({ merchant: 'UBER' });
    expect(t('Purchase of EGP 85.00 at UBER is pending')).toMatchObject({ merchant: 'UBER' });
    expect(t('EGP 120.00 paid at TALABAT via Apple Pay')).toMatchObject({ merchant: 'TALABAT' });
    expect(t('تم خصم ١٢٠ ج.م لدى طلبات باستخدام بطاقتك ****4821')).toMatchObject({ merchant: 'طلبات' });
  });
  it('picks the masked digits on the right side of a transfer', () => {
    expect(t('EGP 500.00 transferred from **9999 to **1234, debited')).toMatchObject({ direction: 'out', digits: '9999' });
    expect(t('EGP 500.00 credited from **9999 to **1234')).toMatchObject({ direction: 'in', digits: '1234' });
  });
  it('falls back to the currency next to a template amount', () => {
    const tpl: BankTemplate = { id: 'x', sender: /^TB$/i, formats: [{ match: /^POS/, direction: 'out', amount: /AMT:([\d.,]+)/ }] };
    expect(parseSms('TB', 'POS AMT:99.5 EGP', [tpl])).toMatchObject({ amount: 99.5, currency: 'EGP' });
  });
  it('keeps merchants that contain xx or # and still stops at a mask', () => {
    expect(t('EGP 85.00 debited at Exxon Mobil using card **4821')).toMatchObject({ merchant: 'Exxon Mobil' });
    expect(t('EGP 85.00 debited at Maxxi')).toMatchObject({ merchant: 'Maxxi' });
    expect(t('EGP 85.00 debited at Shop#12 on 03/11')).toMatchObject({ merchant: 'Shop#12' });
    expect(t('EGP 85.00 debited at UBER **4821')).toMatchObject({ merchant: 'UBER' });
  });
});
