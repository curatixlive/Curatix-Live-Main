import { revalidatePath, revalidateTag } from 'next/cache';
import { HOMEPAGE_CACHE_TAG } from '@/lib/api/cms';

/**
 * Purges the cached front page right after an operator saves a section change,
 * so the edit shows immediately instead of after the 30s ISR window.
 *
 * It carries no data in and none out: it only marks cached output stale, which
 * the page rebuilds from the backend's own (admin-written) state. That is why it
 * needs no credential — the worst a stranger can do is cause a rebuild that the
 * revalidate window would have caused anyway. The backend remains the only
 * thing that decides what the page contains.
 */
export async function POST() {
  revalidateTag(HOMEPAGE_CACHE_TAG);
  revalidatePath('/');
  return Response.json({ revalidated: true });
}
