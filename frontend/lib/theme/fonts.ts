import localFont from 'next/font/local';

/**
 * Self-hosted fonts via next/font/local (`display: swap`, so no layout shift
 * and no render-blocking network).
 *
 * ── WHY LOCAL AND NOT `next/font/google` ─────────────────────────────────
 * The Google loader fetches fonts.googleapis.com AT BUILD TIME and parses the
 * CSS it gets back. When that response is not the shape the loader expects it
 * throws `Cannot read properties of null (reading '1')` and the whole build
 * fails — which broke the release and e2e pipelines with no code change. The
 * latin variable files now live beside this module (OFL licensed, copies of
 * the fontsource packages), so a build needs no network and cannot be broken
 * by a third party. Variable files: one download covers every weight. Each exposes a CSS variable that the
 * Tailwind `fontFamily` tokens consume — nothing in the app names a font
 * directly.
 *
 * ── ONE FAMILY, TWO ROLES ─────────────────────────────────────────────────
 *
 * This shipped as Space Grotesk for headings over Inter for body: two families
 * whose skeletons disagree, which is why the old headings read as a different
 * product from the paragraphs under them.
 *
 * **Plus Jakarta Sans** now does both jobs. It is a geometric grotesque with
 * near-circular bowls, a tall x-height and a genuinely wide weight axis
 * (200–800), so the SAME family covers a 40px extrabold display line and a
 * 13px medium chip label without either looking borrowed. That is what the
 * reference design does — a single face, separated by weight and tracking
 * rather than by family — and it is also cheaper: one font to download instead
 * of two, on the page that decides whether somebody stays.
 *
 * `--font-display` and `--font-sans` therefore resolve to the same face. They
 * stay as SEPARATE variables on purpose: every heading in the app already says
 * `font-display`, so putting a real display face back later is a change to
 * this file and nothing else.
 */
const jakarta = localFont({
  src: './fonts/plus-jakarta-sans-latin-wght-normal.woff2',
  display: 'swap',
  // The variable file's own axis (200-800); the type scale uses 400-800.
  weight: '200 800',
  variable: '--font-sans',
});

const jakartaDisplay = localFont({
  src: './fonts/plus-jakarta-sans-latin-wght-normal.woff2',
  display: 'swap',
  weight: '200 800',
  variable: '--font-display',
});

export const fontSans = jakarta;
export const fontDisplay = jakartaDisplay;

export const fontMono = localFont({
  src: './fonts/jetbrains-mono-latin-wght-normal.woff2',
  display: 'swap',
  weight: '100 800',
  variable: '--font-mono',
});

/** All font CSS-variable classes, applied once at the app/root (or Storybook). */
export const fontClassNames = `${fontSans.variable} ${fontDisplay.variable} ${fontMono.variable}`;
