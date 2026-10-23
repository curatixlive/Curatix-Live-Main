import type { Homepage } from '@/lib/api/cms';

/**
 * The homepage's sections, as the FRONTEND knows them.
 *
 * The backend's `cms/sections.py` is the source of truth for which sections exist,
 * their default order and the bounds of their settings. This file mirrors the
 * keys and defaults so the page can still render when the configuration cannot be
 * fetched — and `sections.test.ts` reads the backend file and fails if the two
 * ever disagree, so a section added on one side only is caught in CI rather than
 * discovered as a switch that does nothing (or a section with no switch).
 *
 * ── THE FALLBACK IS "EVERYTHING ON, IN THIS ORDER" ───────────────────────────
 *
 * If `GET /homepage` fails, returns an older payload with no `sections`, or omits
 * one section, that section is shown at its default place. A configuration
 * outage must never blank the front page; the worst it can do is show the
 * default arrangement.
 */

export const SECTION_KEYS = [
  'promotions',
  'featured',
  'explore',
  'partners',
  'highlights',
  'editors_picks',
  'recommended',
  'new_arrivals',
  'selling_fast',
  'hire_a_band',
  'why_curatix',
  'subscribe',
] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];
export type SettingValue = boolean | number;

export type SectionConfig = {
  key: SectionKey;
  visible: boolean;
  position: number;
  settings: Record<string, SettingValue>;
};

/** Mirrors the defaults in `cms/sections.py`. */
export const DEFAULT_SETTINGS: Record<SectionKey, Record<string, SettingValue>> = {
  promotions: { interval_seconds: 7 },
  featured: { autoscroll: true, interval_seconds: 4 },
  explore: {},
  partners: {},
  highlights: { autoplay: true },
  editors_picks: {},
  recommended: {},
  new_arrivals: {},
  selling_fast: {},
  hire_a_band: {},
  why_curatix: {},
  subscribe: {},
};

const isKey = (value: string): value is SectionKey =>
  (SECTION_KEYS as readonly string[]).includes(value);

/**
 * Every registered section, exactly once, in display order.
 *
 * Unknown keys in the payload are ignored (a section removed from the page); a
 * registered key missing from it is visible at its default position. Settings are
 * taken only if their type matches the default's, so a malformed value cannot
 * turn a timer into `NaN`.
 */
export function resolveSections(payload: Homepage['sections'] | null | undefined): SectionConfig[] {
  const byKey = new Map<string, NonNullable<Homepage['sections']>[number]>();
  for (const row of payload ?? []) if (isKey(row.key)) byKey.set(row.key, row);

  const resolved = SECTION_KEYS.map((key, index): SectionConfig & { index: number } => {
    const row = byKey.get(key);
    const settings: Record<string, SettingValue> = { ...DEFAULT_SETTINGS[key] };
    for (const [name, value] of Object.entries(row?.settings ?? {})) {
      const fallback = DEFAULT_SETTINGS[key][name];
      if (fallback !== undefined && typeof value === typeof fallback) {
        if (typeof value !== 'number' || Number.isFinite(value)) settings[name] = value;
      }
    }
    return {
      key,
      index,
      visible: row ? row.visible !== false : true,
      position: row && Number.isFinite(row.position) ? row.position : index,
      settings,
    };
  });

  return resolved
    .sort((a, b) => a.position - b.position || a.index - b.index)
    .map(({ index: _index, ...rest }) => rest);
}

/** The sections to RENDER: visible only, in order. A hidden section is simply
 *  absent — no component, no timer, no request, no empty container. */
export function visibleSections(payload: Homepage['sections'] | null | undefined): SectionConfig[] {
  return resolveSections(payload).filter((section) => section.visible);
}

export const isSectionVisible = (
  payload: Homepage['sections'] | null | undefined,
  key: SectionKey,
): boolean => resolveSections(payload).find((section) => section.key === key)?.visible ?? true;

/** A numeric setting, clamped so a bad value can never produce a zero-length timer. */
export function numberSetting(
  config: SectionConfig | undefined,
  name: string,
  { min, max }: { min: number; max: number },
): number {
  const fallback = DEFAULT_SETTINGS[config?.key ?? 'promotions'][name];
  const value = config?.settings[name];
  const n = typeof value === 'number' ? value : typeof fallback === 'number' ? fallback : min;
  return Math.min(max, Math.max(min, n));
}

export function boolSetting(config: SectionConfig | undefined, name: string): boolean {
  const value = config?.settings[name];
  if (typeof value === 'boolean') return value;
  const fallback = DEFAULT_SETTINGS[config?.key ?? 'promotions'][name];
  return typeof fallback === 'boolean' ? fallback : true;
}
