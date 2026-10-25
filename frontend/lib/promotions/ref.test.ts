import { beforeEach, describe, expect, it } from 'vitest';
import { parseRefParam, readRef, rememberRef } from './ref';

describe('partner link capture', () => {
  beforeEach(() => window.localStorage.clear());

  it('accepts a well-formed code and upper-cases it', () => {
    expect(parseRefParam(' ria-night ')).toBe('RIA-NIGHT');
    expect(parseRefParam('a')).toBeNull();
    expect(parseRefParam('<script>')).toBeNull();
    expect(parseRefParam(null)).toBeNull();
  });

  it('counts a new link once and keeps the first touch', () => {
    const t = Date.UTC(2026, 9, 25);
    expect(rememberRef('AAA', t)).toBe(true);
    expect(rememberRef('AAA', t + 1000)).toBe(false);
    expect(rememberRef('BBB', t + 1000)).toBe(false);
    expect(readRef(t + 2000)?.code).toBe('AAA');
  });

  it('lets a later link replace one that has aged out', () => {
    const t = Date.UTC(2026, 9, 1);
    rememberRef('AAA', t);
    expect(rememberRef('BBB', t + 8 * 24 * 3600 * 1000)).toBe(true);
    expect(readRef(t + 9 * 24 * 3600 * 1000)?.code).toBe('BBB');
  });

  it('forgets a link older than the longest window', () => {
    const t = Date.UTC(2026, 0, 1);
    rememberRef('AAA', t);
    expect(readRef(t + 100 * 24 * 3600 * 1000)).toBeNull();
  });
});
