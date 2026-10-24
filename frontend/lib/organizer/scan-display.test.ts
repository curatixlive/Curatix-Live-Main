import { describe, expect, it } from 'vitest';
import { scanLines } from './scan-display';

describe('scanLines', () => {
  it('1. a plain event shows nothing beyond the verdict', () => {
    expect(scanLines({ ticket_type: 'General' }, 1)).toEqual([]);
  });

  it('2. assigned seating shows the section and the seat', () => {
    expect(
      scanLines({ ticket_type: 'Platinum', seat_label: 'A4', seat_section: 'Platinum' }, 4),
    ).toEqual(['Platinum', 'Seat A4']);
  });

  it('2b. a seated event with one section still names it', () => {
    expect(scanLines({ ticket_type: 'Hall', seat_label: 'B2', seat_section: 'Hall' }, 1)).toEqual([
      'Hall',
      'Seat B2',
    ]);
  });

  it('3. several tiers without seats show the tier only', () => {
    expect(scanLines({ ticket_type: 'Gold' }, 3)).toEqual(['Gold']);
  });

  it('4. a gender-priced ticket shows tier and gender', () => {
    expect(scanLines({ ticket_type: 'General', gender: 'female' }, 1)).toEqual([
      'General',
      'Female',
    ]);
  });

  it('4b. gender-priced and seated shows tier, seat and gender', () => {
    expect(
      scanLines({ ticket_type: 'VIP', seat_label: 'B2', seat_section: 'VIP', gender: 'male' }, 2),
    ).toEqual(['VIP', 'Seat B2', 'Male']);
  });

  it('ignores blanks and an unknown gender rather than inventing a line', () => {
    expect(scanLines({ ticket_type: 'General', gender: '', seat_label: '' }, 2)).toEqual([
      'General',
    ]);
    expect(scanLines({ ticket_type: 'General', gender: 'robot' }, 1)).toEqual([]);
  });
});
