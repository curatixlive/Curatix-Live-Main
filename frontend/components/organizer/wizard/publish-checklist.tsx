'use client';

import * as React from 'react';
import { ArrowRight, Check, ListChecks } from 'lucide-react';
import type { ChecklistItem } from '@/lib/organizer/wizard/checklist';
import { STEPS, type StepId } from '@/lib/organizer/wizard/model';
import { cn } from '@/lib/utils/cn';

/**
 * What is still missing, directly above the buttons that need it.
 *
 * The form's actions are at the END of a long page on purpose — a pinned bar
 * covered the field being edited on a phone — so the place to say "not yet" is
 * beside them, not on them. Every row is a button that scrolls to the section
 * that fixes it, so the list is a route through the form and not just a
 * complaint about it.
 *
 * Absent while there is nothing to say would be wrong here: an organiser who
 * has finished needs to SEE that they have, so the empty state is a plain
 * "everything needed is filled in" line rather than nothing.
 */
export function PublishChecklist({
  items,
  onJump,
  className,
}: {
  items: readonly ChecklistItem[];
  onJump: (step: StepId) => void;
  className?: string;
}) {
  if (items.length === 0) {
    return (
      <p
        className={cn(
          'flex items-center gap-2 rounded-2xl border border-border bg-surface px-card py-3 text-body-sm text-muted-foreground',
          className,
        )}
      >
        <Check className="size-4 shrink-0 text-success-subtle-foreground" aria-hidden />
        Everything needed to create this event is filled in.
      </p>
    );
  }

  const label = (step: StepId) => STEPS.find((entry) => entry.id === step)?.label ?? 'Go';

  return (
    <section
      aria-label="Still needed to create this event"
      className={cn('rounded-2xl border border-border bg-surface shadow-sm', className)}
    >
      <h2 className="flex items-center gap-2 border-b border-border px-card py-3 text-body-sm font-semibold">
        <ListChecks className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        Still needed ({items.length})
      </h2>
      <ul className="divide-y divide-border">
        {items.map((item) => (
          <li key={item.text}>
            <button
              type="button"
              onClick={() => onJump(item.step)}
              className="flex w-full items-center justify-between gap-3 px-card py-3 text-left text-body-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <span className="min-w-0">{item.text}</span>
              <span className="inline-flex shrink-0 items-center gap-1 text-caption text-muted-foreground">
                {label(item.step)}
                <ArrowRight className="size-3.5" aria-hidden />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
