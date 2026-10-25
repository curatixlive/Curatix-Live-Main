const BASE: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
};

/**
 * "Sat, 12 Dec, 7:00 pm" — plus the year when it is not this one.
 *
 * An organiser scheduling for next January read "12 Jan" and could not tell
 * which January the draft held. The year is omitted for the current year so
 * the common case stays short.
 */
export function formatWhen(date: Date, now: Date = new Date()): string {
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleString('en-IN', sameYear ? BASE : { ...BASE, year: 'numeric' });
}
