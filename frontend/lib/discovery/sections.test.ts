import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  SECTION_KEYS,
  boolSetting,
  isSectionVisible,
  numberSetting,
  resolveSections,
  visibleSections,
} from './sections';

/**
 * The contract with `backend/apps/cms/sections.py`.
 *
 * A section must exist on both sides or the admin gets a switch that does nothing
 * (backend only) or a section with no switch (frontend only). This reads the
 * backend registry and compares, so the mismatch fails CI.
 */
const backend = readFileSync(join(process.cwd(), '../backend/apps/cms/sections.py'), 'utf8');
const blocks = backend.split('SectionSpec(').slice(1); // [0] is everything before the first section
const backendKeys = blocks.map((block) => /^\s*"([a-z_]+)"/.exec(block)?.[1]);

describe('the registry matches the backend', () => {
  it('has the same sections in the same order', () => {
    expect(backendKeys).toEqual([...SECTION_KEYS]);
  });

  it('has the same setting names and defaults for every section', () => {
    blocks.forEach((block, index) => {
      const key = SECTION_KEYS[index]!;
      const settings: Record<string, boolean | number> = {};
      for (const m of block.matchAll(
        /SettingSpec\(\s*"([a-z_]+)",\s*"(bool|int)",\s*(True|False|\d+)/g,
      )) {
        settings[m[1]!] = m[3] === 'True' ? true : m[3] === 'False' ? false : Number(m[3]);
      }
      expect(DEFAULT_SETTINGS[key], key).toEqual(settings);
    });
  });
});

describe('resolveSections', () => {
  it('falls back to everything on, in default order, when there is no payload', () => {
    for (const payload of [undefined, null, []]) {
      const resolved = resolveSections(payload);
      expect(resolved.map((s) => s.key)).toEqual([...SECTION_KEYS]);
      expect(resolved.every((s) => s.visible)).toBe(true);
    }
  });

  it('never loses a section the payload omits', () => {
    const resolved = resolveSections([
      { key: 'featured', visible: false, position: 0, settings: {} },
    ]);
    expect(resolved).toHaveLength(SECTION_KEYS.length);
    expect(resolved.find((s) => s.key === 'explore')?.visible).toBe(true);
    expect(resolved.find((s) => s.key === 'featured')?.visible).toBe(false);
  });

  it('ignores a section the page does not know', () => {
    const resolved = resolveSections([{ key: 'gone', visible: false, position: 0, settings: {} }]);
    expect(resolved.map((s) => s.key)).toEqual([...SECTION_KEYS]);
  });

  it('orders by position, then registry order', () => {
    const resolved = resolveSections([
      { key: 'subscribe', visible: true, position: 0, settings: {} },
      { key: 'promotions', visible: true, position: 1, settings: {} },
    ]);
    expect(resolved[0]?.key).toBe('subscribe');
    expect(resolved[1]?.key).toBe('promotions');
  });

  it('shows only visible sections to render, and a hidden one is simply absent', () => {
    const visible = visibleSections([
      { key: 'editors_picks', visible: false, position: 5, settings: {} },
      { key: 'highlights', visible: false, position: 4, settings: {} },
    ]);
    const keys = visible.map((s) => s.key);
    expect(keys).not.toContain('editors_picks');
    expect(keys).not.toContain('highlights');
    expect(keys).toHaveLength(SECTION_KEYS.length - 2);
  });

  it('answers isSectionVisible, defaulting to visible', () => {
    expect(isSectionVisible(undefined, 'featured')).toBe(true);
    expect(
      isSectionVisible(
        [{ key: 'featured', visible: false, position: 1, settings: {} }],
        'featured',
      ),
    ).toBe(false);
  });

  it('takes a setting only if its type matches the default', () => {
    const [promo] = resolveSections([
      {
        key: 'promotions',
        visible: true,
        position: 0,
        settings: { interval_seconds: '9' as unknown as number },
      },
    ]);
    expect(promo?.settings.interval_seconds).toBe(7);
    const [ok] = resolveSections([
      { key: 'promotions', visible: true, position: 0, settings: { interval_seconds: 12 } },
    ]);
    expect(ok?.settings.interval_seconds).toBe(12);
  });
});

describe('setting helpers', () => {
  const config = (settings: Record<string, boolean | number>) =>
    resolveSections([{ key: 'featured', visible: true, position: 1, settings }]).find(
      (s) => s.key === 'featured',
    );

  it('clamps a number so a bad value cannot make a zero-length timer', () => {
    expect(
      numberSetting(config({ interval_seconds: 0 }), 'interval_seconds', { min: 2, max: 15 }),
    ).toBe(2);
    expect(
      numberSetting(config({ interval_seconds: 999 }), 'interval_seconds', { min: 2, max: 15 }),
    ).toBe(15);
    expect(numberSetting(undefined, 'interval_seconds', { min: 2, max: 15 })).toBe(7);
  });

  it('reads a bool, defaulting to the registry default', () => {
    expect(boolSetting(config({ autoscroll: false }), 'autoscroll')).toBe(false);
    expect(boolSetting(config({}), 'autoscroll')).toBe(true);
  });
});
