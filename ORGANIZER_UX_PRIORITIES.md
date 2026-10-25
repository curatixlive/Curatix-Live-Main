# Organiser event creation — what to fix, in priority order

**The goal:** an organiser creates a complete event in a few minutes, without
getting stuck, without losing work, and without hunting for a button.

Found by creating five different events through the live portal (a concert, a
multi-day festival, a seated comedy night, an invite-only workshop and a gender-priced
rooftop party), then by auditing the portal at 320–412px phone widths.

Legend: DONE = fixed and tested (items 8–15 of the first list: see below). NEXT = the order to work in.

## DONE

| # | Problem | Fix |
|---|---|---|
| 1 | The first save forgot everything typed before it (summary, language, age, tags, policies, invite-only, ticket edits) | Create, then update, in one save |
| 2 | Toggling one co-host or crew permission reset the others | Update only the named keys, merged under a row lock |
| 3 | A one-day event could not end after midnight (nightlife) | An end time at or before the start means the next day |
| 4 | A ticket's session was locked before the organiser reached the dropdown | Session field is now first in the ticket form |
| 5 | The "Ends" date picker opened on today's month | Opens at the earliest allowed date |
| 6 | Cloning was hidden behind selecting a row | Clone event: row icon, mobile tile, editor header, one tap "clone latest" |
| 7 | Phone layout: tab bars clipped, event page 771px wide on tablets, rails flush to the edge, analytics date row overflowed | See commits 73d33b2 and 31674fe |

## NEXT (do in this order)

### P0 — an organiser gets stuck or loses work

1. **Saved tickets cannot be deleted, even on a draft with no sales.**
   A typo in a ticket is permanent. Allow deleting a ticket that has nothing sold,
   reserved or booked (backend: an unsold-only delete, guarded by the same
   counters the no-oversell constraint uses; frontend: show the trash icon when
   `sold === 0`).
2. **Say what is missing before the organiser presses "Create event".**
   The buttons sit at the end of a very long page, and the first time the
   organiser learns about a missing cover image or "pick 3 more tags" is after
   pressing. Add a "Before you can create this event" checklist right above the
   buttons, each line a link that jumps to the field. (The owner decided to keep the
   buttons at the END of the form, not in a sticky bar, because a sticky bar covered
   fields on a phone — so this adds information beside them rather than moving them.)
3. **Seated events have no way to set gender prices per section.**
   Today it can only be done through the API. Add the same "Price by gender" control
   to each seating section's price row.

### P1 — slows an organiser down or looks like an error

4. **Red validation errors on a blank form.** Show an error only after the field
   has been touched or the organiser has tried to continue.
5. **Organisation is not preselected when there is only one.** Preselect it.
6. **The empty policies box looks like a text field but is not clickable.** Make the
   whole box open the "Add a rule" editor.
7. **No visible confirmation after "Save draft".** Show "Saved at 4:32 pm" beside
   the buttons and a short toast.
8. **The date shows "12 Dec" with no year.** Show the year when it is not this year.
9. **Image upload wording contradicts itself.** "This event already has its portrait
   poster" appears while asking for a description of the image being added; the button
   reads "Upload image" once and "Add image" another time.
10. **Tag chips jump when selected** (the tick widens the chip and the row reflows),
    so the next tap can miss. Reserve the tick's width.

### P2 — polish

11. Typing into the native time field does not work on the first click (Chrome opens
    its picker over it). Use the app's own time control or open on focus.
12. The section label echoes the (truncated) title above the title field.
13. The seat-map preview becomes enormous when the layout has few columns.
14. Copying an event does not seem to carry language and age restriction over.
15. "Landscape 3:4" wording on the portrait poster (fixed) — audit the other zones'
    copy for the same mistake.

## How to verify each fix

- Unit test next to the code, plus (for anything the organiser sees) a pass in a
  browser at 390px and 1280px.
- For anything that saves data: create an event in the portal, then read it back
  from the API and compare — do not trust the screen. That is how problem 1 was
  found: every field looked saved.

## Status (25 Oct)

Done locally and tested, not yet deployed: P0 1–3, P1 4–10 (delete unused ticket,
"still needed" checklist, seated gender prices, quiet required errors, last-used
organisation, clickable policies box, Saved-at badge + toast beside the buttons,
year on non-current dates, image wording, stable tag chips). P2 11–15 remain.
