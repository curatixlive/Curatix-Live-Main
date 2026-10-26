'use client';

import * as React from 'react';
import { Plus, Trash2, Users } from 'lucide-react';
import {
  MAX_RULES,
  OP_LABELS,
  PRESETS,
  RULE_LABELS,
  newRule,
  type Match,
  type Op,
  type RuleDraft,
  type RuleIssue,
  type RuleType,
} from '@/lib/organizer/audience';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils/cn';

const SELECT =
  'h-control rounded-lg border border-border bg-background px-3 text-body-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export type EventChoice = { id: string; title: string };

/**
 * Choose who a campaign goes to, by combining rules.
 *
 * Start from a one-click preset or from scratch, then add rules — "bought" /
 * "attended" / "on a waiting list" / "follows you" / "number of orders" /
 * "total spent" — each of which can be flipped to "is not", optionally scoped
 * to one event, a city or a time window. "Match ALL" narrows (bought AND
 * attended); "match ANY" widens (waiting list OR follower).
 *
 * The count under it comes from the server for exactly these rules, and the
 * server only ever draws from your own customers, waiting lists and followers.
 */
export function AudienceBuilder({
  rules,
  match,
  onRules,
  onMatch,
  events,
  cities,
  issues,
  count,
  counting,
  countError,
}: {
  rules: RuleDraft[];
  match: Match;
  onRules: (rules: RuleDraft[], match?: Match) => void;
  onMatch: (match: Match) => void;
  events: EventChoice[];
  cities: string[];
  issues: RuleIssue[];
  count: number | null;
  counting: boolean;
  countError: string | null;
}) {
  const patch = (key: string, changes: Partial<RuleDraft>) =>
    onRules(rules.map((r) => (r.key === key ? { ...r, ...changes } : r)));
  const issueFor = (key: string) => issues.find((i) => i.key === key)?.message;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="text-label">Start from</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => onRules(preset.rules(), preset.match)}
              className="inline-flex h-control-sm items-center rounded-full border border-border bg-surface px-3 text-caption font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {rules.map((rule, index) => (
          <li
            key={rule.key}
            className="flex flex-col gap-2 rounded-xl border border-border bg-sunken p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-12 shrink-0 text-caption text-muted-foreground">
                {index === 0 ? 'People who' : match === 'all' ? 'and' : 'or'}
              </span>
              <select
                aria-label={`Rule ${index + 1}: condition`}
                value={rule.negate ? 'not' : 'is'}
                onChange={(e) => patch(rule.key, { negate: e.target.value === 'not' })}
                className={SELECT}
              >
                <option value="is">Match</option>
                <option value="not">Do NOT match</option>
              </select>
              <select
                aria-label={`Rule ${index + 1}: what to check`}
                value={rule.type}
                onChange={(e) =>
                  patch(rule.key, {
                    type: e.target.value as RuleType,
                    value: e.target.value === 'orders' ? '2' : '',
                    eventId: '',
                    city: '',
                    days: '',
                  })
                }
                className={cn(SELECT, 'min-w-0 flex-1')}
              >
                {(Object.keys(RULE_LABELS) as RuleType[]).map((type) => (
                  <option key={type} value={type}>
                    {RULE_LABELS[type]}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove rule ${index + 1}`}
                disabled={rules.length === 1}
                onClick={() => onRules(rules.filter((r) => r.key !== rule.key))}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2 pl-0 sm:pl-14">
              {rule.type === 'orders' || rule.type === 'spent' ? (
                <>
                  <select
                    aria-label={`Rule ${index + 1}: comparison`}
                    value={rule.op}
                    onChange={(e) => patch(rule.key, { op: e.target.value as Op })}
                    className={SELECT}
                  >
                    {(Object.keys(OP_LABELS) as Op[]).map((op) => (
                      <option key={op} value={op}>
                        {OP_LABELS[op]}
                      </option>
                    ))}
                  </select>
                  <Input
                    aria-label={`Rule ${index + 1}: number`}
                    inputMode="numeric"
                    value={rule.value}
                    onChange={(e) => patch(rule.key, { value: e.target.value })}
                    className="w-28"
                    placeholder={rule.type === 'spent' ? '₹ amount' : 'How many'}
                  />
                  <span className="text-caption text-muted-foreground">
                    {rule.type === 'orders' ? 'paid orders' : 'rupees on tickets'}
                  </span>
                </>
              ) : null}

              {rule.type === 'bought' || rule.type === 'waitlist' || rule.type === 'attended' ? (
                <select
                  aria-label={`Rule ${index + 1}: event`}
                  value={rule.eventId}
                  onChange={(e) => patch(rule.key, { eventId: e.target.value })}
                  className={cn(SELECT, 'max-w-full')}
                >
                  <option value="">Any event</option>
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.title}
                    </option>
                  ))}
                </select>
              ) : null}

              {rule.type === 'bought' || rule.type === 'attended' ? (
                <select
                  aria-label={`Rule ${index + 1}: city`}
                  value={rule.city}
                  onChange={(e) => patch(rule.key, { city: e.target.value })}
                  className={SELECT}
                >
                  <option value="">Any city</option>
                  {cities.map((city) => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ))}
                </select>
              ) : null}

              {rule.type === 'bought' ? (
                <label className="inline-flex items-center gap-2 text-caption text-muted-foreground">
                  in the last
                  <Input
                    aria-label={`Rule ${index + 1}: days`}
                    inputMode="numeric"
                    value={rule.days}
                    onChange={(e) => patch(rule.key, { days: e.target.value })}
                    className="w-20"
                    placeholder="any time"
                  />
                  days
                </label>
              ) : null}
            </div>
            {issueFor(rule.key) ? (
              <p role="alert" className="pl-0 text-caption text-muted-foreground sm:pl-14">
                {issueFor(rule.key)}
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={rules.length >= MAX_RULES}
          onClick={() => onRules([...rules, newRule('bought')])}
        >
          <Plus className="size-4" aria-hidden />
          Add rule
        </Button>

        {rules.length > 1 ? (
          <div
            role="radiogroup"
            aria-label="How the rules combine"
            className="inline-flex rounded-full border border-border bg-surface p-0.5"
          >
            {(['all', 'any'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={match === value}
                onClick={() => onMatch(value)}
                className={cn(
                  'rounded-full px-3 py-1 text-caption font-medium transition-colors',
                  match === value
                    ? 'bg-nav-active text-nav-active-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {value === 'all' ? 'Match all rules' : 'Match any rule'}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <p
        role="status"
        aria-live="polite"
        className="inline-flex items-center gap-2 rounded-lg bg-sunken px-3 py-2 text-body-sm"
      >
        <Users className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        {countError ? (
          <span className="text-muted-foreground">{countError}</span>
        ) : counting || count === null ? (
          <span className="text-muted-foreground">Counting who matches…</span>
        ) : (
          <span>
            <strong className="tabular-nums">{count}</strong>{' '}
            {count === 1 ? 'person matches' : 'people match'} right now
          </span>
        )}
      </p>
    </div>
  );
}
