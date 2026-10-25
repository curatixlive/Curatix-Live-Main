import {
  UNSAVED_DRAFT_BLOCKER,
  publishBlockers,
  type Draft,
  type Issue,
  type StepId,
} from './model';

/**
 * "What is still missing" for the single-page create form, as ONE list.
 *
 * The form's actions sit at the end of a long page, and an organiser used to
 * learn that the event had no cover image, or needed three more tags, only after
 * pressing Create. Three sources already know: `missingForSave` (cannot even be
 * saved yet), `validate()` issues (a field that is wrong) and `publishBlockers`
 * (the server's own readiness gate, mirrored). This merges them, in the order an
 * organiser would fix them, and names the section each one lives in so a row can
 * take them straight there.
 *
 * Pure, because the way this fails is quietly: a blocker whose text matches no
 * rule below lands on Basics, which is merely unhelpful — and a blocker dropped
 * by mistake is an organiser who presses Create and is refused.
 */

export type ChecklistItem = { text: string; step: StepId };

const SAVE_STEPS: Record<string, StepId> = {
  Basics: 'basics',
  Venue: 'venue',
  Schedule: 'schedule',
};

/** `'A title — on Basics'` → `{ text: 'A title', step: 'basics' }`. */
function fromMissing(entry: string): ChecklistItem {
  const match = /^(.*?)\s+—\s+on\s+(Basics|Venue|Schedule)$/.exec(entry);
  if (!match) return { text: entry, step: 'basics' };
  return { text: match[1] ?? entry, step: SAVE_STEPS[match[2] ?? ''] ?? 'basics' };
}

/** Which section fixes a publish blocker, from what the blocker says. */
export function stepForBlocker(text: string): StepId {
  if (/ticket/i.test(text)) return 'tickets';
  if (/tag/i.test(text)) return 'details';
  if (/poster|cover|image|artwork/i.test(text)) return 'media';
  return 'basics';
}

export function checklistItems(
  draft: Draft,
  issues: readonly Issue[],
  missingForSave: readonly string[],
  organizations?: readonly { id: string; name: string; verified_level: string }[],
): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  const seen = new Set<string>();
  const push = (item: ChecklistItem) => {
    if (seen.has(item.text)) return;
    seen.add(item.text);
    items.push(item);
  };

  missingForSave.forEach((entry) => push(fromMissing(entry)));
  issues.forEach((issue) => push({ text: issue.message, step: issue.step }));
  publishBlockers(draft, organizations)
    // Autosave resolves this one on its own once the fields above are filled.
    .filter((blocker) => blocker !== UNSAVED_DRAFT_BLOCKER)
    .forEach((blocker) => push({ text: blocker, step: stepForBlocker(blocker) }));

  return items;
}
