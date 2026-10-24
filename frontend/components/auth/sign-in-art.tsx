import * as React from 'react';
import { cn } from '@/lib/utils/cn';
import { CreatureRow } from './creatures';

/**
 * The band across the top of the sign-in card on phones and tablets: five
 * colourful characters peeking up from its bottom edge. From `lg` the same
 * characters stand beside the card instead (see `CreatureSides`), so the band
 * steps aside rather than doubling them.
 *
 * It is decoration, so it is hidden from assistive technology in one piece, and
 * its motion is stopped under `prefers-reduced-motion`.
 */
export function SignInArt({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'relative h-24 overflow-hidden border-b border-border bg-sunken sm:h-28 lg:hidden',
        className,
      )}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(18rem 8rem at 15% 0%, rgb(var(--primary) / 0.16), transparent 70%), radial-gradient(18rem 8rem at 90% 100%, rgb(var(--accent) / 0.14), transparent 70%)',
        }}
      />
      {/* Pushed down so the bottom of each body is cropped by the band's edge:
          they look like they are peeking up over the card. */}
      <CreatureRow className="absolute inset-x-0 -bottom-6 sm:-bottom-7" />
    </div>
  );
}
