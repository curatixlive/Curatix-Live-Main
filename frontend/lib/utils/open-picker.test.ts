import { describe, expect, it, vi } from 'vitest';
import { openPicker } from './open-picker';

describe('openPicker', () => {
  it('opens the native picker from a click on the field', () => {
    const showPicker = vi.fn();
    openPicker({ currentTarget: { showPicker } as unknown as HTMLInputElement });
    expect(showPicker).toHaveBeenCalledTimes(1);
  });

  it('falls back quietly where the picker refuses or does not exist', () => {
    const refusing = vi.fn(() => {
      throw new DOMException('not allowed');
    });
    expect(() =>
      openPicker({ currentTarget: { showPicker: refusing } as unknown as HTMLInputElement }),
    ).not.toThrow();
    expect(() => openPicker({ currentTarget: {} as HTMLInputElement })).not.toThrow();
  });
});
