/**
 * What the scan screen says about an ADMITTED ticket — only the lines that apply.
 *
 * 1. A plain event with one price and no features: nothing beyond "Allowed".
 * 2. Assigned seating: the section's name, then the seat.
 * 3. Several tiers, no seats: the tier's name.
 * 4. A gender-priced ticket: the tier, the seat if there is one, and the gender
 *    the buyer chose, so the door can check it against the person in front of it.
 *
 * A denied scan never goes through here: it stays red with its reason.
 */

export type ScanFacts = {
  ticket_type?: string | null;
  seat_label?: string | null;
  seat_section?: string | null;
  gender?: string | null;
};

const GENDER_LABEL: Record<string, string> = { male: 'Male', female: 'Female' };

export function scanLines(facts: ScanFacts, tierCount: number): string[] {
  const seat = (facts.seat_label ?? '').trim();
  const gender = GENDER_LABEL[(facts.gender ?? '').trim()] ?? '';
  const lines: string[] = [];

  // The tier's name is shown only where it tells the steward something: an event
  // with more than one tier, a seated one (the section), or a gender price.
  const tier = ((seat && facts.seat_section) || facts.ticket_type || '').trim();
  if (tier && (tierCount > 1 || seat || gender)) lines.push(tier);
  if (seat) lines.push(`Seat ${seat}`);
  if (gender) lines.push(gender);
  return lines;
}
