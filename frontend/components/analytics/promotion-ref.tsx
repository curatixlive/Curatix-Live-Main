'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { recordPromotionClick } from '@/lib/api/partner-promotions';
import { parseRefParam, rememberRef } from '@/lib/promotions/ref';

/**
 * Notices `?ref=CODE` on arrival, remembers it for the checkout, and counts the
 * click once. Renders nothing. Mounted by the public site layout only — an
 * organizer previewing inside the dashboard is not a visitor.
 */
export function PromotionRef() {
  const params = useSearchParams();
  const ref = params.get('ref');
  React.useEffect(() => {
    const code = parseRefParam(ref);
    if (code && rememberRef(code)) void recordPromotionClick(code);
  }, [ref]);
  return null;
}
