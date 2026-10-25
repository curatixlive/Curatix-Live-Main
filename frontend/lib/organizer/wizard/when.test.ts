import { describe, expect, it } from 'vitest';

import { formatWhen } from './when';

describe('formatWhen', () => {
  const now = new Date(2026, 9, 25);
  it('omits the year in the current year', () => {
    expect(formatWhen(new Date(2026, 11, 12, 19, 0), now)).not.toMatch(/2026/);
  });
  it('shows the year otherwise', () => {
    expect(formatWhen(new Date(2027, 0, 12, 19, 0), now)).toMatch(/2027/);
  });
});
