import { cache } from 'react';
import { fetchCommunity, type Community } from '@/lib/api/community';
import { isApiError } from '@/lib/api/errors';

/** One fetch per request however many of layout/page ask for it; null when the organiser does not exist. */
export const loadCommunity = cache(async (id: string): Promise<Community | null> => {
  try {
    return await fetchCommunity(id);
  } catch (error) {
    if (isApiError(error) && (error.status === 404 || error.status === 422)) return null;
    throw error;
  }
});
