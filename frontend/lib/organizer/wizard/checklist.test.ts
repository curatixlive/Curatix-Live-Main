import { describe, expect, it } from 'vitest';
import { checklistItems, stepForBlocker } from './checklist';
import { POSTER_BLOCKER, UNSAVED_DRAFT_BLOCKER, emptyDraft } from './model';

const draft = () => ({ ...emptyDraft(), eventId: 'evt-1', title: 'A show' });

describe('checklistItems', () => {
  it('names the section each save requirement lives in', () => {
    const items = checklistItems(draft(), [], ['A venue — on Venue', 'A title — on Basics']);
    expect(items.slice(0, 2)).toEqual([
      { text: 'A venue', step: 'venue' },
      { text: 'A title', step: 'basics' },
    ]);
  });

  it('includes the server readiness gate: tickets, tags and the poster', () => {
    const texts = checklistItems(draft(), [], []).map((item) => item.text);
    expect(texts).toContain('Add at least one ticket type.');
    expect(texts).toContain(POSTER_BLOCKER);
    expect(texts.some((text) => /tag/i.test(text))).toBe(true);
  });

  it('leaves out the unsaved-draft blocker, which autosave resolves itself', () => {
    const unsaved = { ...draft(), eventId: null };
    const texts = checklistItems(unsaved, [], []).map((item) => item.text);
    expect(texts).not.toContain(UNSAVED_DRAFT_BLOCKER);
  });

  it('never lists the same sentence twice', () => {
    const texts = checklistItems(draft(), [], ['Add at least one ticket type. — on Basics']).map(
      (item) => item.text,
    );
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('carries field issues with their own section', () => {
    const items = checklistItems(
      draft(),
      [{ step: 'schedule', field: 'endsAt', message: 'The end time has to be after the start.' }],
      [],
    );
    expect(items).toContainEqual({
      text: 'The end time has to be after the start.',
      step: 'schedule',
    });
  });
});

describe('stepForBlocker', () => {
  it('routes by what the sentence is about', () => {
    expect(stepForBlocker('Add at least one ticket type.')).toBe('tickets');
    expect(stepForBlocker('Pick 3 more tags so people can find this event.')).toBe('details');
    expect(stepForBlocker(POSTER_BLOCKER)).toBe('media');
    expect(stepForBlocker('Open Air Live needs to be verified.')).toBe('basics');
  });
});
