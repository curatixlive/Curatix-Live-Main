import { describe, expect, it } from 'vitest';
import { PRESETS, newRule, toApiRule, validateRules } from './audience';

describe('audience rules', () => {
  it('sends only the parameters a rule actually uses', () => {
    expect(toApiRule(newRule('follower', { value: '9', city: 'Pune', eventId: 'x' }))).toEqual({
      type: 'follower',
    });
    expect(
      toApiRule(newRule('orders', { op: 'lte', value: '3', city: 'Pune', eventId: 'x' })),
    ).toEqual({ type: 'orders', op: 'lte', value: 3 });
    expect(
      toApiRule(newRule('bought', { city: 'Pune', days: '30', eventId: 'e1', negate: true })),
    ).toEqual({ type: 'bought', negate: true, event_id: 'e1', city: 'Pune', days: 30 });
    expect(toApiRule(newRule('waitlist', { eventId: 'e2', city: 'Pune' }))).toEqual({
      type: 'waitlist',
      event_id: 'e2',
    });
  });

  it('refuses an empty or non-numeric count instead of treating it as zero', () => {
    const a = newRule('orders', { value: '' });
    const b = newRule('spent', { value: '12x' });
    const ok = newRule('orders', { value: '2' });
    expect(validateRules([a, b, ok]).map((i) => i.key)).toEqual([a.key, b.key]);
    expect(validateRules([newRule('bought', { days: '0' })])).toHaveLength(1);
    expect(validateRules([newRule('bought', { days: '' })])).toHaveLength(0);
  });

  it('every preset builds valid rules with unique keys', () => {
    for (const preset of PRESETS) {
      const rules = preset.rules();
      expect(rules.length).toBeGreaterThan(0);
      expect(validateRules(rules)).toEqual([]);
      expect(new Set(rules.map((r) => r.key)).size).toBe(rules.length);
    }
  });

  it('the "never attended" preset is a negated attended rule', () => {
    const rules = PRESETS.find((p) => p.id === 'no-show')!.rules();
    expect(rules.map(toApiRule)).toEqual([{ type: 'bought' }, { type: 'attended', negate: true }]);
  });
});
