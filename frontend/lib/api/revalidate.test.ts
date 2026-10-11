import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PUBLIC_LIST_REVALIDATE_SECONDS } from './events';

/**
 * Next 15 rejects an imported constant as `export const revalidate`, so the
 * pages repeat the number as a literal. This keeps the copies from drifting
 * from the one the data layer and the backend's `s-maxage` are tuned to.
 */
describe('page revalidate literals', () => {
  it.each(['app/(site)/page.tsx', 'app/(site)/categories/[slug]/page.tsx'])(
    '%s matches PUBLIC_LIST_REVALIDATE_SECONDS',
    (file) => {
      const source = readFileSync(join(process.cwd(), file), 'utf8');
      const match = /export const revalidate = (\d+);/.exec(source);
      expect(match, `${file} must export a literal revalidate`).not.toBeNull();
      expect(Number(match?.[1])).toBe(PUBLIC_LIST_REVALIDATE_SECONDS);
    },
  );
});
