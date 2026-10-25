'use client';

import * as React from 'react';
import type { DraftTier } from '@/lib/organizer/wizard/model';
import { Input } from '@/components/ui';

/**
 * Price by gender, for a SEATED event.
 *
 * The ticket builder — where gender prices have always been set — is replaced by
 * the seat map on a seated event ("each seating section is its own ticket type"),
 * so the one control that decides whether a buyer can pick a gender was simply
 * unreachable: the buyer-side seat picker reads it, the door shows it, and nothing
 * in the organiser's form could write it. This puts it back, one row per section.
 *
 * It edits the same `genderMale` / `genderFemale` fields the ticket builder does,
 * so saving, the fingerprint and the API call are the existing ones — no second
 * write path. Blank means "no price for that gender": a buyer who picks it pays
 * the section's normal price.
 */
export function SeatedGenderPrices({
  tiers,
  onChange,
}: {
  tiers: DraftTier[];
  onChange: (next: DraftTier[]) => void;
}) {
  if (tiers.length === 0) return null;

  const patch = (key: string, changes: Partial<DraftTier>) =>
    onChange(tiers.map((tier) => (tier.key === key ? { ...tier, ...changes } : tier)));

  return (
    <fieldset className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-card">
      <legend className="px-1 text-body-sm font-semibold">Price by gender (optional)</legend>
      <p className="text-caption text-muted-foreground">
        Buyers choose male or female when they pick seats, and pay that price. Leave a box empty for
        no special price. The door sees which one was chosen.
      </p>
      <ul className="flex flex-col divide-y divide-border">
        {tiers.map((tier) => (
          <li
            key={tier.key}
            className="grid grid-cols-1 items-end gap-3 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_9rem_9rem]"
          >
            <span className="min-w-0 truncate text-body-sm font-medium">
              {tier.name || 'Section'}
              <span className="ml-2 font-normal text-muted-foreground">₹{tier.price || '0'}</span>
            </span>
            <label className="flex flex-col gap-1 text-caption text-muted-foreground">
              Male (₹)
              <Input
                type="number"
                min="0"
                inputMode="numeric"
                value={tier.genderMale}
                aria-label={`${tier.name || 'Section'} — male price`}
                onChange={(event) => patch(tier.key, { genderMale: event.target.value })}
                placeholder="e.g. 1499"
              />
            </label>
            <label className="flex flex-col gap-1 text-caption text-muted-foreground">
              Female (₹)
              <Input
                type="number"
                min="0"
                inputMode="numeric"
                value={tier.genderFemale}
                aria-label={`${tier.name || 'Section'} — female price`}
                onChange={(event) => patch(tier.key, { genderFemale: event.target.value })}
                placeholder="e.g. 1299"
              />
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
