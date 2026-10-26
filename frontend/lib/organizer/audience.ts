/**
 * Campaign audience rules, on the browser's side of the wire.
 *
 * An audience is a list of rules plus "match all" or "match any". The server
 * owns the meaning (see `backend/apps/organizer/audience.py`) and re-validates
 * everything; this file only holds the editable shape, the one-click presets,
 * and the conversion to the request body — pure, so it can be tested.
 */

export type RuleType = 'bought' | 'orders' | 'spent' | 'follower' | 'waitlist' | 'attended';
export type Op = 'gte' | 'lte' | 'eq';
export type Match = 'all' | 'any';

export type RuleDraft = {
  /** Stable key for React lists; never sent. */
  key: string;
  type: RuleType;
  /** "is not" — the rule is inverted. */
  negate: boolean;
  op: Op;
  /** Kept as typed so an empty field is not silently a zero. */
  value: string;
  eventId: string;
  city: string;
  days: string;
};

export const MAX_RULES = 6;

export const RULE_LABELS: Record<RuleType, string> = {
  bought: 'Bought tickets',
  orders: 'Number of paid orders',
  spent: 'Total spent (₹)',
  follower: 'Follows you (community member)',
  waitlist: 'Is on a waiting list',
  attended: 'Attended (checked in)',
};

export const OP_LABELS: Record<Op, string> = {
  gte: 'at least',
  lte: 'at most',
  eq: 'exactly',
};

let counter = 0;
export const newRule = (type: RuleType = 'bought', over: Partial<RuleDraft> = {}): RuleDraft => ({
  key: `r${++counter}`,
  type,
  negate: false,
  op: 'gte',
  value: type === 'orders' ? '2' : '',
  eventId: '',
  city: '',
  days: '',
  ...over,
});

export type Preset = { id: string; label: string; match: Match; rules: () => RuleDraft[] };

/** One-click starting points. Each is only a set of rules the organiser can then change. */
export const PRESETS: Preset[] = [
  { id: 'buyers', label: 'Everyone who bought', match: 'all', rules: () => [newRule('bought')] },
  {
    id: 'regulars',
    label: 'Regulars (2+ orders)',
    match: 'all',
    rules: () => [newRule('orders', { op: 'gte', value: '2' })],
  },
  {
    id: 'recent',
    label: 'Bought in the last 90 days',
    match: 'all',
    rules: () => [newRule('bought', { days: '90' })],
  },
  {
    id: 'lapsed',
    label: 'Haven’t bought in 6 months',
    match: 'all',
    rules: () => [newRule('bought'), newRule('bought', { negate: true, days: '180' })],
  },
  { id: 'community', label: 'Community members', match: 'all', rules: () => [newRule('follower')] },
  {
    id: 'followers-no-buy',
    label: 'Followers who never bought',
    match: 'all',
    rules: () => [newRule('follower'), newRule('orders', { op: 'gte', value: '1', negate: true })],
  },
  { id: 'waitlist', label: 'On a waiting list', match: 'all', rules: () => [newRule('waitlist')] },
  { id: 'attended', label: 'Attended an event', match: 'all', rules: () => [newRule('attended')] },
  {
    id: 'no-show',
    label: 'Bought but never attended',
    match: 'all',
    rules: () => [newRule('bought'), newRule('attended', { negate: true })],
  },
];

export type RuleIssue = { key: string; message: string };

/** Problems the organiser can fix before asking the server. */
export function validateRules(rules: RuleDraft[]): RuleIssue[] {
  const issues: RuleIssue[] = [];
  for (const rule of rules) {
    if (rule.type === 'orders' || rule.type === 'spent') {
      if (rule.value.trim() === '' || !/^\d+$/.test(rule.value.trim())) {
        issues.push({ key: rule.key, message: 'Enter a whole number.' });
      }
    }
    if (rule.type === 'bought' && rule.days.trim() !== '' && !/^[1-9]\d*$/.test(rule.days.trim())) {
      issues.push({ key: rule.key, message: 'Days must be a whole number above zero.' });
    }
  }
  return issues;
}

/** The request body for one rule: only the parameters that rule uses. */
export function toApiRule(rule: RuleDraft): Record<string, unknown> {
  const out: Record<string, unknown> = { type: rule.type };
  if (rule.negate) out.negate = true;
  if (rule.type === 'orders' || rule.type === 'spent') {
    out.op = rule.op;
    out.value = Number(rule.value);
  }
  if (rule.type === 'bought' || rule.type === 'waitlist' || rule.type === 'attended') {
    if (rule.eventId) out.event_id = rule.eventId;
  }
  if (rule.type === 'bought' || rule.type === 'attended') {
    if (rule.city) out.city = rule.city;
  }
  if (rule.type === 'bought' && rule.days.trim()) out.days = Number(rule.days);
  return out;
}

export const toApiRules = (rules: RuleDraft[]) => rules.map(toApiRule);
