'use client';

import { useOptionalLocation } from '@/lib/location/location-context';
import { formatDistance, haversineKm, venuePoint } from '@/lib/location/distance';

/**
 * "3.2 km away" — rendered only when the viewer granted location AND the venue
 * has a pinned position. Anything less renders nothing at all, never a guess.
 */
export function DistanceLabel({
  venue,
  className,
  prefix = '',
}: {
  venue: { latitude?: number | string | null; longitude?: number | string | null };
  className?: string;
  /** Text drawn before the distance — and only when there is one. */
  prefix?: string;
}) {
  const location = useOptionalLocation();
  const from = location?.coords ?? null;
  const to = venuePoint(venue);
  if (!from || !to) return null;
  const text = formatDistance(haversineKm(from, to));
  if (!text) return null;
  return (
    <span className={className}>
      {prefix}
      {text}
    </span>
  );
}
