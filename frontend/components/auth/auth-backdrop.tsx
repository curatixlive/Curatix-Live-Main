import * as React from 'react';
import { CreatureSides } from './creatures';

/**
 * A quiet backdrop for the sign-in page: two soft colour washes and a faint dot
 * grid that fades toward the edges, plus a few drifting confetti shapes. It is
 * detail, not decoration to look at — everything is low contrast, behind the
 * card, never under text that has to be read, and still under reduced motion.
 *
 * Pure CSS and token colours, so it is correct in both themes and costs no
 * request. `pointer-events-none` and `aria-hidden`: it is not content.
 */
const CSS = `
.auth-backdrop{position:absolute;inset:0;z-index:-10;pointer-events:none;
background:
radial-gradient(60rem 28rem at 12% -6%,rgb(var(--primary)/.10),transparent 70%),
radial-gradient(52rem 26rem at 92% 108%,rgb(var(--accent)/.09),transparent 70%)}
.auth-backdrop::before{content:'';position:absolute;inset:0;
background-image:radial-gradient(rgb(var(--foreground)/.10) 1px,transparent 1.2px);
background-size:24px 24px;
-webkit-mask-image:radial-gradient(ellipse at center,black 0%,transparent 72%);
mask-image:radial-gradient(ellipse at center,black 0%,transparent 72%)}
.auth-confetti{position:absolute;border-radius:2px;opacity:.5;animation:auth-drift 9s ease-in-out infinite}
@keyframes auth-drift{0%,100%{transform:translateY(0) rotate(var(--r,0deg))}50%{transform:translateY(-10px) rotate(calc(var(--r,0deg) + 14deg))}}
@media (prefers-reduced-motion:reduce){.auth-confetti{animation:none}}
`;

const BITS = [
  { left: '8%', top: '18%', w: 10, h: 5, r: '-24deg', c: 'primary', d: '0s' },
  { left: '17%', top: '70%', w: 7, h: 7, r: '0deg', c: 'accent', d: '-3s', round: true },
  { left: '86%', top: '22%', w: 9, h: 5, r: '30deg', c: 'accent', d: '-5s' },
  { left: '93%', top: '64%', w: 7, h: 7, r: '0deg', c: 'primary', d: '-2s', round: true },
  { left: '72%', top: '88%', w: 10, h: 5, r: '-14deg', c: 'primary', d: '-6s' },
  { left: '28%', top: '8%', w: 6, h: 6, r: '0deg', c: 'accent', d: '-4s', round: true },
];

export function AuthBackdrop() {
  return (
    <div aria-hidden className="auth-backdrop">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <CreatureSides />
      {BITS.map((b, i) => (
        <span
          key={i}
          className="auth-confetti hidden sm:block"
          style={
            {
              left: b.left,
              top: b.top,
              width: b.w,
              height: b.h,
              borderRadius: b.round ? '9999px' : undefined,
              background: `rgb(var(--${b.c}))`,
              animationDelay: b.d,
              '--r': b.r,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
