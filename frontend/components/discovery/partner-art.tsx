import * as React from 'react';
import type { PartnerCardId } from '@/lib/discovery/partner-cards';
import { cn } from '@/lib/utils/cn';

/**
 * One drawn scene per partner card — a CONCEPT, not a photograph.
 *
 *   organiser  A ticket on a lit stage with a dashboard rising behind it:
 *              "run your event from one place".
 *   venue      A glowing venue with a location pin over it and tickets flying in
 *              from organisers: "put your space in front of them".
 *   sponsor    A badge at the centre of widening rings of people: "reach the
 *              people who show up".
 *
 * Drawn in the brand's own palette ramps (violet, pink, amber, blue) rather than
 * the semantic tokens: an illustration is an object, and an object does not swap
 * colours with the theme. Everything is decoration and is hidden from assistive
 * technology — the card's text carries the meaning.
 *
 * Motion is slow float / twinkle / ripple, transform and opacity only, and is
 * removed under `prefers-reduced-motion`.
 */

const CSS = `
.pa-float{animation:pa-float 5s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
.pa-float.b{animation-delay:-1.7s}.pa-float.c{animation-delay:-3.2s}
.pa-twinkle{animation:pa-twinkle 3.4s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
.pa-twinkle.b{animation-delay:-1.1s}.pa-twinkle.c{animation-delay:-2.2s}
.pa-ripple{animation:pa-ripple 5.5s ease-out infinite;transform-box:fill-box;transform-origin:center}
.pa-ripple.b{animation-delay:-1.8s}.pa-ripple.c{animation-delay:-3.6s}
.pa-grow{animation:pa-grow 4.2s ease-in-out infinite;transform-box:fill-box;transform-origin:bottom}
.pa-grow.b{animation-delay:-.8s}.pa-grow.c{animation-delay:-1.6s}.pa-grow.d{animation-delay:-2.4s}
.pa-fly{stroke-dasharray:4 9;animation:pa-fly 3s linear infinite}
@keyframes pa-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
@keyframes pa-twinkle{0%,100%{opacity:.35;transform:scale(.8)}50%{opacity:1;transform:scale(1.15)}}
@keyframes pa-ripple{0%{opacity:.5;transform:scale(.55)}100%{opacity:0;transform:scale(1.25)}}
@keyframes pa-grow{0%,100%{transform:scaleY(.82)}50%{transform:scaleY(1)}}
@keyframes pa-fly{to{stroke-dashoffset:-26}}
@media (prefers-reduced-motion:reduce){.pa-float,.pa-twinkle,.pa-ripple,.pa-grow,.pa-fly{animation:none}.pa-ripple{opacity:.25}}
`;

const V = 'rgb(var(--violet-500))';
const V4 = 'rgb(var(--violet-400))';
const V3 = 'rgb(var(--violet-300))';
const P = 'rgb(var(--pink-500))';
const P3 = 'rgb(var(--pink-300))';
const A = 'rgb(var(--warning-400))';
const B = 'rgb(var(--info-500))';
const W = 'rgb(var(--brand-on-brand))';
const INK = 'rgb(var(--ink-950))';

function Spark({ x, y, s, c, cls }: { x: number; y: number; s: number; c: string; cls?: string }) {
  return (
    <path
      className={cn('pa-twinkle', cls)}
      d={`M${x} ${y - s}L${x + s * 0.24} ${y - s * 0.24}L${x + s} ${y}L${x + s * 0.24} ${y + s * 0.24}L${x} ${y + s}L${x - s * 0.24} ${y + s * 0.24}L${x - s} ${y}L${x - s * 0.24} ${y - s * 0.24}Z`}
      fill={c}
    />
  );
}

/** A ticket with its two bites and a perforation. `w` x `h` around (0,0). */
function Ticket({ w, h, id }: { w: number; h: number; id: string }) {
  const x = -w / 2;
  const y = -h / 2;
  const cut = Math.round(h * 0.11);
  const px = x + w * 0.68;
  const d = `M${x + 14} ${y}H${px - cut}A${cut} ${cut} 0 0 0 ${px + cut} ${y}H${x + w - 14}A14 14 0 0 1 ${x + w} ${y + 14}V${y + h - 14}A14 14 0 0 1 ${x + w - 14} ${y + h}H${px + cut}A${cut} ${cut} 0 0 0 ${px - cut} ${y + h}H${x + 14}A14 14 0 0 1 ${x} ${y + h - 14}V${y + 14}A14 14 0 0 1 ${x + 14} ${y}Z`;
  return (
    <g>
      <path d={d} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={W} strokeOpacity="0.35" strokeWidth="1.5" />
      <path
        d={`M${px} ${y + cut + 6}V${y + h - cut - 6}`}
        stroke={W}
        strokeOpacity="0.55"
        strokeWidth="2"
        strokeDasharray="3 6"
        strokeLinecap="round"
      />
      <circle cx={x + w * 0.2} cy={y + h * 0.34} r={h * 0.13} fill={W} fillOpacity="0.9" />
      <rect
        x={x + w * 0.34}
        y={y + h * 0.26}
        width={w * 0.24}
        height="7"
        rx="3.5"
        fill={W}
        fillOpacity="0.85"
      />
      <rect
        x={x + w * 0.34}
        y={y + h * 0.44}
        width={w * 0.16}
        height="7"
        rx="3.5"
        fill={W}
        fillOpacity="0.5"
      />
      <rect
        x={x + w * 0.1}
        y={y + h * 0.72}
        width={w * 0.44}
        height="6"
        rx="3"
        fill={W}
        fillOpacity="0.4"
      />
      {[0, 1].map((r) =>
        [0, 1].map((c) => (
          <rect
            key={`${r}${c}`}
            x={px + 18 + c * 17}
            y={y + h * 0.3 + r * 17}
            width="12"
            height="12"
            rx="3"
            fill="none"
            stroke={W}
            strokeOpacity="0.8"
            strokeWidth="2.4"
          />
        )),
      )}
    </g>
  );
}

function Organiser({ uid }: { uid: string }) {
  const beam = `${uid}-beam`;
  const stage = `${uid}-stage`;
  const t1 = `${uid}-t1`;
  const t2 = `${uid}-t2`;
  const t3 = `${uid}-t3`;
  const glass = `${uid}-glass`;
  return (
    <>
      <defs>
        <linearGradient id={beam} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={W} stopOpacity="0.32" />
          <stop offset="1" stopColor={W} stopOpacity="0" />
        </linearGradient>
        <linearGradient id={stage} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={V} />
          <stop offset="1" stopColor={P} />
        </linearGradient>
        <linearGradient id={t1} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={V4} />
          <stop offset="1" stopColor={P} />
        </linearGradient>
        <linearGradient id={t2} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={A} />
          <stop offset="1" stopColor={P} />
        </linearGradient>
        <linearGradient id={t3} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={B} />
          <stop offset="1" stopColor={V4} />
        </linearGradient>
        <linearGradient id={glass} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={W} stopOpacity="0.14" />
          <stop offset="1" stopColor={W} stopOpacity="0.04" />
        </linearGradient>
      </defs>
      <ellipse cx="400" cy="210" rx="250" ry="170" fill={V} fillOpacity="0.18" />
      {/* spotlight beams */}
      <polygon points="210,-10 250,-10 420,300 330,300" fill={`url(#${beam})`} />
      <polygon points="610,-10 650,-10 480,300 560,300" fill={`url(#${beam})`} />
      {/* dashboard behind: bars rising */}
      <g transform="translate(470 52)">
        <rect
          width="150"
          height="112"
          rx="16"
          fill={`url(#${glass})`}
          stroke={W}
          strokeOpacity="0.2"
        />
        <rect x="16" y="16" width="52" height="7" rx="3.5" fill={W} fillOpacity="0.45" />
        {[0, 1, 2, 3].map((i) => (
          <rect
            key={i}
            className={cn('pa-grow', ['', 'b', 'c', 'd'][i])}
            x={20 + i * 30}
            y={96 - [30, 46, 38, 62][i]!}
            width="18"
            height={[30, 46, 38, 62][i]}
            rx="5"
            fill={[V3, P3, A, W][i]}
            fillOpacity="0.9"
          />
        ))}
      </g>
      {/* stage */}
      <ellipse cx="400" cy="322" rx="214" ry="30" fill={`url(#${stage})`} fillOpacity="0.9" />
      <ellipse cx="400" cy="316" rx="214" ry="30" fill={INK} fillOpacity="0.35" />
      <ellipse cx="400" cy="308" rx="190" ry="24" fill={`url(#${stage})`} />
      <ellipse cx="400" cy="304" rx="150" ry="16" fill={W} fillOpacity="0.14" />
      {/* the hero ticket */}
      <g transform="translate(396 196)">
        <g className="pa-float">
          <g transform="rotate(-8)">
            <Ticket w={262} h={150} id={t1} />
          </g>
        </g>
      </g>
      <g transform="translate(318 74) rotate(-14)">
        <g className="pa-float b">
          <Ticket w={112} h={64} id={t2} />
        </g>
      </g>
      <g transform="translate(588 262) rotate(12)">
        <g className="pa-float c">
          <Ticket w={104} h={60} id={t3} />
        </g>
      </g>
      <Spark x={196} y={238} s={11} c={A} />
      <Spark x={640} y={206} s={9} c={P3} cls="b" />
      <Spark x={330} y={46} s={9} c={V3} cls="c" />
      <Spark x={560} y={196} s={7} c={W} cls="b" />
    </>
  );
}

function Venue({ uid }: { uid: string }) {
  const wall = `${uid}-wall`;
  const sign = `${uid}-sign`;
  const pin = `${uid}-pin`;
  const glow = `${uid}-glow`;
  const t = `${uid}-t`;
  return (
    <>
      <defs>
        <linearGradient id={wall} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={V} />
          <stop offset="1" stopColor={rgbVar('--violet-800')} />
        </linearGradient>
        <linearGradient id={sign} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={P} />
          <stop offset="1" stopColor={A} />
        </linearGradient>
        <linearGradient id={pin} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={P3} />
          <stop offset="1" stopColor={P} />
        </linearGradient>
        <radialGradient id={glow} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor={A} stopOpacity="0.55" />
          <stop offset="1" stopColor={A} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={t} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={B} />
          <stop offset="1" stopColor={V4} />
        </linearGradient>
      </defs>
      <ellipse cx="410" cy="250" rx="260" ry="170" fill={P} fillOpacity="0.14" />
      <ellipse cx="410" cy="300" rx="230" ry="120" fill={`url(#${glow})`} />
      {/* flight paths of tickets coming in from organisers */}
      <path
        className="pa-fly"
        d="M70 120C170 60 250 90 318 190"
        fill="none"
        stroke={V3}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        className="pa-fly"
        d="M60 300C150 330 240 330 312 296"
        fill="none"
        stroke={P3}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <g transform="translate(84 112) rotate(-14)">
        <g className="pa-float">
          <Ticket w={92} h={54} id={t} />
        </g>
      </g>
      <g transform="translate(84 304) rotate(10)">
        <g className="pa-float b">
          <Ticket w={92} h={54} id={`${uid}-t2`} />
        </g>
      </g>
      <defs>
        <linearGradient id={`${uid}-t2`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={A} />
          <stop offset="1" stopColor={P} />
        </linearGradient>
      </defs>
      {/* the venue */}
      <g transform="translate(330 150)">
        <rect x="0" y="40" width="250" height="140" rx="10" fill={`url(#${wall})`} />
        <rect x="-10" y="26" width="270" height="30" rx="10" fill={`url(#${sign})`} />
        {[...Array(9)].map((_, i) => (
          <circle
            key={i}
            cx={8 + i * 29.5}
            cy="41"
            r="4"
            fill={W}
            fillOpacity={i % 2 ? 0.95 : 0.55}
          />
        ))}
        {[0, 1, 2].map((r) =>
          [0, 1, 2, 3].map((c) => (
            <rect
              key={`${r}${c}`}
              x={22 + c * 38 + (c > 1 ? 40 : 0)}
              y={72 + r * 34}
              width="26"
              height="22"
              rx="5"
              fill={A}
              fillOpacity={(r + c) % 3 === 0 ? 0.95 : (r + c) % 3 === 1 ? 0.6 : 0.3}
            />
          )),
        )}
        {/* door */}
        <path d="M108 180V132A17 17 0 0 1 142 132V180Z" fill={INK} fillOpacity="0.8" />
        <path d="M112 180V134A13 13 0 0 1 138 134V180Z" fill={A} fillOpacity="0.5" />
        {/* awning */}
        <path d="M92 112H158L166 126H84Z" fill={P} />
        <path
          d="M100 112L96 126M117 112L115 126M133 112L135 126M150 112L154 126"
          stroke={W}
          strokeOpacity="0.5"
          strokeWidth="3"
        />
        {/* crowd at the door */}
        {[70, 96, 156, 182].map((x, i) => (
          <g key={x} fill={INK} fillOpacity="0.85">
            <circle cx={x} cy={152 - (i % 2) * 2} r="7" />
            <path d={`M${x - 10} 180V164A10 10 0 0 1 ${x + 10} 164V180Z`} />
          </g>
        ))}
        <rect x="-20" y="180" width="290" height="8" rx="4" fill={INK} fillOpacity="0.4" />
      </g>
      {/* location pin with ripples */}
      <g transform="translate(455 118)">
        <ellipse
          className="pa-ripple"
          cx="0"
          cy="62"
          rx="50"
          ry="12"
          fill="none"
          stroke={P3}
          strokeWidth="2"
        />
        <ellipse
          className="pa-ripple b"
          cx="0"
          cy="62"
          rx="50"
          ry="12"
          fill="none"
          stroke={P3}
          strokeWidth="2"
        />
        <g className="pa-float c">
          <path
            d="M0 58C-22 30 -34 18 -34 -4A34 34 0 0 1 34 -4C34 18 22 30 0 58Z"
            fill={`url(#${pin})`}
          />
          <circle cx="0" cy="-4" r="13" fill={W} />
          <circle cx="0" cy="-4" r="6" fill={P} />
        </g>
      </g>
      <Spark x={620} y={110} s={11} c={A} />
      <Spark x={664} y={250} s={8} c={P3} cls="b" />
      <Spark x={250} y={52} s={8} c={V3} cls="c" />
    </>
  );
}

function rgbVar(name: string) {
  return `rgb(var(${name}))`;
}

function Sponsor({ uid }: { uid: string }) {
  const badge = `${uid}-badge`;
  const ring = `${uid}-ring`;
  const flag = `${uid}-flag`;
  const people: Array<[number, number, string]> = [
    [330, 130, V3],
    [470, 96, P3],
    [560, 150, A],
    [610, 250, V3],
    [560, 330, P3],
    [430, 360, A],
    [300, 330, V3],
    [250, 230, P3],
    [376, 60, W],
    [654, 180, B],
    [210, 130, A],
    [506, 244, W],
    [330, 250, B],
  ];
  return (
    <>
      <defs>
        <linearGradient id={badge} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={A} />
          <stop offset="1" stopColor={P} />
        </linearGradient>
        <radialGradient id={ring} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor={V} stopOpacity="0.5" />
          <stop offset="1" stopColor={V} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={flag} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={P} />
          <stop offset="1" stopColor={V4} />
        </linearGradient>
      </defs>
      <circle cx="430" cy="210" r="230" fill={`url(#${ring})`} />
      {/* widening rings */}
      {[70, 120, 170, 220].map((r, i) => (
        <circle
          key={r}
          cx="430"
          cy="210"
          r={r}
          fill="none"
          stroke={W}
          strokeOpacity={0.16 - i * 0.025}
          strokeWidth="1.6"
          strokeDasharray={i % 2 ? '3 9' : undefined}
        />
      ))}
      <circle
        className="pa-ripple"
        cx="430"
        cy="210"
        r="120"
        fill="none"
        stroke={A}
        strokeWidth="2"
      />
      <circle
        className="pa-ripple b"
        cx="430"
        cy="210"
        r="120"
        fill="none"
        stroke={P3}
        strokeWidth="2"
      />
      <circle
        className="pa-ripple c"
        cx="430"
        cy="210"
        r="120"
        fill="none"
        stroke={V3}
        strokeWidth="2"
      />
      {/* the audience */}
      {people.map(([x, y, c], i) => (
        <g key={`${x}-${y}`} className={cn('pa-twinkle', ['', 'b', 'c'][i % 3])} fill={c}>
          <circle cx={x} cy={y - 6} r="6.5" />
          <path d={`M${x - 10} ${y + 12}V${y + 4}A10 10 0 0 1 ${x + 10} ${y + 4}V${y + 12}Z`} />
        </g>
      ))}
      {/* hanging banners */}
      <g className="pa-float b">
        <path d="M90 0V70" stroke={W} strokeOpacity="0.3" strokeWidth="2" />
        <path d="M60 70H120V130L90 112L60 130Z" fill={`url(#${flag})`} />
        <circle cx="90" cy="92" r="8" fill={W} fillOpacity="0.9" />
      </g>
      <g className="pa-float c">
        <path d="M168 0V46" stroke={W} strokeOpacity="0.3" strokeWidth="2" />
        <path d="M146 46H190V90L168 77L146 90Z" fill={A} fillOpacity="0.9" />
      </g>
      {/* the sponsor badge */}
      <g transform="translate(430 210)">
        <g className="pa-float">
          <circle r="62" fill={`url(#${badge})`} />
          <circle r="62" fill="none" stroke={W} strokeOpacity="0.5" strokeWidth="2.5" />
          <circle
            r="48"
            fill="none"
            stroke={W}
            strokeOpacity="0.45"
            strokeWidth="1.6"
            strokeDasharray="2 7"
            strokeLinecap="round"
          />
          <path
            d="M0 -30L8.8 -9.6L31 -7.6L14.3 7.2L19.2 28.9L0 17.6L-19.2 28.9L-14.3 7.2L-31 -7.6L-8.8 -9.6Z"
            fill={W}
          />
        </g>
      </g>
      <Spark x={640} y={80} s={11} c={A} />
      <Spark x={260} y={380} s={8} c={P3} cls="b" />
      <Spark x={640} y={350} s={8} c={V3} cls="c" />
    </>
  );
}

export function PartnerArt({ id, className }: { id: PartnerCardId; className?: string }) {
  const uid = React.useId().replace(/:/g, '');
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox="0 0 720 400"
      preserveAspectRatio="xMidYMid slice"
      className={cn('size-full', className)}
    >
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {id === 'organiser' ? <Organiser uid={uid} /> : null}
      {id === 'venue' ? <Venue uid={uid} /> : null}
      {id === 'sponsor' ? <Sponsor uid={uid} /> : null}
    </svg>
  );
}
