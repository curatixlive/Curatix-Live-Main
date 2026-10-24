import * as React from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * The sign-in page's colourful crowd: five little characters who share the
 * page with the form. They are the event theme — a ticketing product greeting
 * you with a party rather than a padlock.
 *
 * ── WHAT THEY DO ─────────────────────────────────────────────────────────
 *
 * They blink on their own, and look toward whichever field is being filled in.
 * While a HIDDEN password is typed their eyes shut and two paws come up over
 * them; reveal the password and they open again — no peeking. This is CSS only
 * (`.auth-scene:has(#auth-password[type="password"]:focus)`), so nothing is
 * shared with the form and the form stays portable. The state is real even
 * under `prefers-reduced-motion`: only the movement is removed, not the meaning.
 *
 * ── COLOURS ──────────────────────────────────────────────────────────────
 *
 * The fixed palette ramps (violet, pink, amber, blue, green), not the semantic
 * tokens: a character is an object, and an object does not swap colours when
 * somebody flips the theme. Eyes use `brand-on-brand` (white) and `ink-900`.
 */

type Shape = {
  /** Body silhouette, drawn in a 120 x 140 box. */
  body: string;
  /** Palette token for the body. */
  fill: string;
  /** Eye centre y, and the two eye x positions. */
  eyeY: number;
  eyeX: [number, number];
  extra?: React.ReactNode;
};

const SHAPES = {
  bean: {
    body: 'M18 136V54A42 42 0 0 1 102 54V136Z',
    fill: '--violet-500',
    eyeY: 58,
    eyeX: [45, 75],
    extra: (
      <>
        <path
          d="M44 14l8 14M60 8v18M76 14l-8 14"
          stroke="rgb(var(--violet-300))"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </>
    ),
  },
  blob: {
    body: 'M60 20C98 20 114 52 110 88C106 120 86 134 60 134C34 134 14 120 10 88C6 52 22 20 60 20Z',
    fill: '--pink-500',
    eyeY: 68,
    eyeX: [42, 78],
    extra: <circle cx="60" cy="16" r="7" fill="rgb(var(--pink-300))" />,
  },
  square: {
    body: 'M18 36H102A14 14 0 0 1 116 50V118A14 14 0 0 1 102 132H18A14 14 0 0 1 4 118V50A14 14 0 0 1 18 36Z',
    fill: '--warning-400',
    eyeY: 72,
    eyeX: [38, 82],
    extra: (
      <>
        <path
          d="M60 36V18"
          stroke="rgb(var(--ink-900) / 0.55)"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <circle cx="60" cy="14" r="7" fill="rgb(var(--pink-500))" />
      </>
    ),
  },
  cone: {
    body: 'M60 12C70 12 76 18 84 36L108 108C112 122 104 134 92 134H28C16 134 8 122 12 108L36 36C44 18 50 12 60 12Z',
    fill: '--info-500',
    eyeY: 80,
    eyeX: [44, 76],
    extra: <circle cx="60" cy="20" r="5" fill="rgb(var(--brand-on-brand))" opacity="0.7" />,
  },
  sprout: {
    body: 'M60 44C90 44 110 66 110 92C110 118 90 134 60 134C30 134 10 118 10 92C10 66 30 44 60 44Z',
    fill: '--success-500',
    eyeY: 88,
    eyeX: [42, 78],
    extra: (
      <path
        d="M60 44C60 28 70 18 86 16C86 32 76 42 60 44ZM60 44C60 32 52 24 40 22C40 34 48 42 60 44Z"
        fill="rgb(var(--success-600))"
      />
    ),
  },
} satisfies Record<string, Shape>;

export type CreatureKind = keyof typeof SHAPES;

export function Creature({ kind, className }: { kind: CreatureKind; className?: string }) {
  const shape: Shape = SHAPES[kind];
  const [lx, rx] = shape.eyeX;
  const y = shape.eyeY;
  const ink = 'rgb(var(--ink-900))';
  return (
    <svg
      viewBox="0 0 120 140"
      focusable="false"
      aria-hidden
      className={cn('cr', className)}
      style={{ overflow: 'visible' }}
    >
      <ellipse cx="60" cy="136" rx="40" ry="4" fill={ink} opacity="0.12" />
      {shape.extra}
      <path d={shape.body} fill={`rgb(var(${shape.fill}))`} />
      {/* Cheeks */}
      <ellipse cx={lx - 11} cy={y + 14} rx="6" ry="3.6" fill="rgb(var(--pink-300))" opacity="0.7" />
      <ellipse cx={rx + 11} cy={y + 14} rx="6" ry="3.6" fill="rgb(var(--pink-300))" opacity="0.7" />
      {[lx, rx].map((x) => (
        <g key={x} className="cr-eye">
          <ellipse cx={x} cy={y} rx="9.5" ry="11" fill="rgb(var(--brand-on-brand))" />
          <circle className="cr-pupil" cx={x} cy={y + 1} r="4.6" fill={ink} />
          <circle cx={x + 1.6} cy={y - 1.6} r="1.4" fill="rgb(var(--brand-on-brand))" />
        </g>
      ))}
      <path
        className="cr-mouth"
        d={`M${lx + 7} ${y + 19}Q60 ${y + 30} ${rx - 7} ${y + 19}`}
        fill="none"
        stroke={ink}
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      {[lx, rx].map((x) => (
        <g key={`paw-${x}`} className="cr-paw">
          <ellipse
            cx={x}
            cy={y + 2}
            rx="14"
            ry="12"
            fill={`rgb(var(${shape.fill}))`}
            stroke="rgb(var(--ink-900) / 0.4)"
            strokeWidth="2.2"
          />
          {/* A lighter patch and three finger lines: it reads as a hand, not a
              second pair of glasses. */}
          <ellipse cx={x} cy={y} rx="9" ry="7" fill="rgb(var(--brand-on-brand) / 0.28)" />
          <path
            d={`M${x - 5} ${y - 6}V${y + 1}M${x} ${y - 7}V${y + 1}M${x + 5} ${y - 6}V${y + 1}`}
            stroke="rgb(var(--ink-900) / 0.3)"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </g>
      ))}
    </svg>
  );
}

const CSS = `
.cr-eye,.cr-paw,.cr-mouth,.cr-pupil{transform-box:fill-box;transform-origin:center}
.cr-eye{animation:cr-blink 5.6s infinite;transition:transform 200ms ease-out}
.cr-pupil{transition:transform 200ms ease-out}
.cr-paw{opacity:0;transform:translateY(30px);transition:transform 260ms cubic-bezier(.2,.8,.3,1),opacity 180ms ease-out}
.cr-mouth{transition:transform 200ms ease-out}
.cr-float{animation:cr-bob 4.2s ease-in-out infinite}
.cr-float:nth-child(2n){animation-delay:-1.4s}
.cr-float:nth-child(3n){animation-delay:-2.6s}
@keyframes cr-blink{0%,93%,100%{transform:scaleY(1)}96%{transform:scaleY(.08)}}
@keyframes cr-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
.auth-scene:has(#auth-email:focus) .cr-pupil,.auth-scene:has(#auth-name:focus) .cr-pupil{transform:translate(0,2.4px)}
.auth-scene:has(#auth-password[type="password"]:focus) .cr-eye{animation:none;transform:scaleY(.07)}
.auth-scene:has(#auth-password[type="password"]:focus) .cr-paw{opacity:1;transform:translateY(0)}
.auth-scene:has(#auth-password[type="password"]:focus) .cr-mouth{transform:scale(.8)}
@media (prefers-reduced-motion:reduce){.cr-eye,.cr-float{animation:none}.cr-eye,.cr-pupil,.cr-paw,.cr-mouth{transition:none}}
`;

export function CreatureStyles() {
  return <style dangerouslySetInnerHTML={{ __html: CSS }} />;
}

/** The tall pair on the left and the shorter trio on the right, beside the card. */
export function CreatureSides({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute left-1/2 top-28 hidden w-[60rem] -translate-x-1/2 lg:flex lg:justify-between',
        className,
      )}
    >
      <CreatureStyles />
      <div className="flex w-52 flex-col items-center gap-2">
        <div className="cr-float w-36 -rotate-6">
          <Creature kind="bean" />
        </div>
        <div className="cr-float ml-16 w-28 rotate-3">
          <Creature kind="blob" />
        </div>
      </div>
      <div className="flex w-52 flex-col items-center gap-2">
        <div className="cr-float w-28 rotate-6">
          <Creature kind="cone" />
        </div>
        <div className="cr-float mr-12 w-32 -rotate-3">
          <Creature kind="square" />
        </div>
        <div className="cr-float ml-12 w-20 rotate-6">
          <Creature kind="sprout" />
        </div>
      </div>
    </div>
  );
}

/** The row that peeks over the top of the card on phones and tablets. */
export function CreatureRow({ className }: { className?: string }) {
  const kinds: CreatureKind[] = ['cone', 'blob', 'bean', 'square', 'sprout'];
  return (
    <div aria-hidden className={cn('flex items-end justify-center gap-3 px-4', className)}>
      <CreatureStyles />
      {kinds.map((kind) => (
        <div key={kind} className="cr-float w-14 shrink-0 sm:w-16">
          <Creature kind={kind} />
        </div>
      ))}
    </div>
  );
}
