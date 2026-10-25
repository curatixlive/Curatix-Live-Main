import { describe, expect, it } from 'vitest';
import {
  describeCommission,
  partnerLinkUrl,
  toCommissionValue,
  validatePartnerDraft,
  type PartnerDraft,
} from './partner-links';

const ok: PartnerDraft = {
  name: 'Ria',
  partner: '',
  code: 'RIA-10',
  kind: 'percent',
  amount: '10',
  windowDays: '7',
  eventId: '',
};
const money = (m: number) => `₹${m / 100}`;

describe('partner links', () => {
  it('builds event-scoped and organisation-wide links', () => {
    expect(partnerLinkUrl('https://x.test', { code: 'A-1', event_id: 'e1' })).toBe(
      'https://x.test/events/e1?ref=A-1',
    );
    expect(partnerLinkUrl('https://x.test', { code: 'A-1', event_id: null })).toBe(
      'https://x.test/?ref=A-1',
    );
  });

  it('describes both commission kinds', () => {
    expect(describeCommission('percent', 1050, money)).toBe('10.5% of ticket revenue');
    expect(describeCommission('fixed_per_ticket', 3000, money)).toBe('₹30 per ticket');
  });

  it('stores 10% as 1000 basis points and ₹30 as 3000 paise', () => {
    expect(toCommissionValue('percent', '10')).toBe(1000);
    expect(toCommissionValue('fixed_per_ticket', '30')).toBe(3000);
  });

  it('accepts a good draft and names each problem otherwise', () => {
    expect(validatePartnerDraft(ok)).toEqual({});
    expect(
      validatePartnerDraft({ ...ok, name: ' ', code: 'a', amount: '0', windowDays: '0' }),
    ).toEqual({
      name: expect.any(String),
      code: expect.any(String),
      amount: expect.any(String),
      windowDays: expect.any(String),
    });
    expect(validatePartnerDraft({ ...ok, amount: '60' }).amount).toMatch(/50%/);
  });
});
