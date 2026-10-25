/**
 * The partner link a visitor arrived through, remembered between the landing
 * page and the checkout.
 *
 * `?ref=CODE` is captured on arrival and kept with the TIME of the click, so the
 * backend can check it against the promotion's attribution window rather than
 * trusting that "now" is when the link was opened. First touch wins: a later
 * link does not replace an earlier one that is still inside its window, matching
 * the server (which keeps the first attribution it records).
 *
 * localStorage can be unavailable (private windows, blocked storage), so every
 * access is wrapped and the checkout simply carries no attribution.
 */
const KEY = 'curatix-ref';
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // the server's longest window

export type StoredRef = { code: string; clickedAt: string };

const CODE = /^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/;

export function parseRefParam(value: string | null | undefined): string | null {
  const code = (value ?? '').trim();
  return CODE.test(code) ? code.toUpperCase() : null;
}

export function readRef(now: number = Date.now()): StoredRef | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredRef;
    const at = Date.parse(parsed.clickedAt);
    if (!parsed.code || Number.isNaN(at) || now - at > MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Store a freshly opened link. Returns true when it was NEW (so the click should be counted). */
export function rememberRef(code: string, now: number = Date.now()): boolean {
  try {
    const existing = readRef(now);
    if (existing && existing.code === code) return false;
    // First touch wins while the earlier one is still recent (7 days is the default window).
    if (existing && now - Date.parse(existing.clickedAt) < 7 * 24 * 60 * 60 * 1000) return false;
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ code, clickedAt: new Date(now).toISOString() } satisfies StoredRef),
    );
    return true;
  } catch {
    return false;
  }
}
