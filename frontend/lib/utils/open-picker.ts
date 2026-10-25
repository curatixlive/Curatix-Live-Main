/**
 * Open a native date/time picker from a click anywhere on the field.
 *
 * Browsers open the picker only from the small calendar or clock icon, which
 * is a tiny target and not obvious on a phone. Calling `showPicker()` on click
 * makes the whole box open it, while typing a value still works. It throws in
 * some contexts (a cross-origin frame, an input that is not user-activated),
 * and older browsers do not have it, so every failure falls back to the
 * browser's default behaviour.
 */
export function openPicker(event: { currentTarget: HTMLInputElement }): void {
  try {
    event.currentTarget.showPicker?.();
  } catch {
    // keep the browser's default: the icon still opens it
  }
}
