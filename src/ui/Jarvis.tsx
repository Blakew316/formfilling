/**
 * JARVIS-style holographic core: a glowing centre with the name, ringed by thin
 * concentric bands, segmented arcs and tick scales that each turn at their own
 * speed and direction. Pure SVG, so it is sharp at any size; motion is CSS
 * (src/styles/app.css, .jv-*) and stops under prefers-reduced-motion.
 */

/** Builds a dash pattern of `n` arcs, each `arc` long with `gap` between, scaled to the ring's circumference. */
function segments(r: number, parts: number[]): string {
  const c = 2 * Math.PI * r;
  const total = parts.reduce((a, b) => a + b, 0);
  return parts.map((p) => ((p / total) * c).toFixed(2)).join(' ');
}

function ticks(r: number, count: number, len: number, every = 0, long = 0) {
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    const l = every && i % every === 0 ? long : len;
    const x1 = 200 + Math.cos(a) * r;
    const y1 = 200 + Math.sin(a) * r;
    const x2 = 200 + Math.cos(a) * (r - l);
    const y2 = 200 + Math.sin(a) * (r - l);
    return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
  });
}

export function JarvisCore({ size, title, subtitle }: { size: number; title?: string; subtitle?: string }) {
  return (
    <svg className="jv" width={size} height={size} viewBox="0 0 400 400" role="img" aria-label={title ?? 'Suit Up'}>
      <defs>
        <radialGradient id="jv-core" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#0f3b52" />
          <stop offset=".7" stopColor="#06202e" />
          <stop offset="1" stopColor="#0a4a66" />
        </radialGradient>
        <radialGradient id="jv-halo" cx="50%" cy="50%" r="50%">
          <stop offset=".55" stopColor="rgba(90,220,255,0)" />
          <stop offset=".8" stopColor="rgba(90,220,255,.18)" />
          <stop offset="1" stopColor="rgba(90,220,255,0)" />
        </radialGradient>
      </defs>

      <circle cx="200" cy="200" r="198" fill="url(#jv-halo)" />

      {/* outer scale: fine ticks with a long mark every 10 */}
      <g className="jv-spin jv-s240r jv-dim" stroke="currentColor" strokeWidth="1">{ticks(194, 120, 5, 10, 12)}</g>
      <circle className="jv-dim" cx="200" cy="200" r="184" fill="none" stroke="currentColor" strokeWidth=".75" />

      {/* segmented outer band */}
      <circle className="jv-spin jv-s60" cx="200" cy="200" r="176" fill="none" stroke="currentColor" strokeWidth="3"
        strokeDasharray={segments(176, [90, 14, 22, 14, 160, 30, 8, 30, 70, 40])} />
      <circle className="jv-spin jv-s90r jv-dim" cx="200" cy="200" r="168" fill="none" stroke="currentColor" strokeWidth="1"
        strokeDasharray={segments(168, [2, 6])} />

      {/* wide translucent band */}
      <circle className="jv-spin jv-s40r jv-faint" cx="200" cy="200" r="152" fill="none" stroke="currentColor" strokeWidth="14"
        strokeDasharray={segments(152, [140, 10, 60, 10, 30, 10, 100, 40])} />
      <circle className="jv-dim" cx="200" cy="200" r="142" fill="none" stroke="currentColor" strokeWidth=".75" />

      {/* bright fast arcs */}
      <circle className="jv-spin jv-s12 jv-glow" cx="200" cy="200" r="132" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"
        strokeDasharray={segments(132, [70, 110, 40, 140])} />
      <circle className="jv-spin jv-s20r" cx="200" cy="200" r="122" fill="none" stroke="currentColor" strokeWidth="1.5"
        strokeDasharray={segments(122, [30, 8, 30, 8, 30, 8, 120, 40])} />

      {/* inner scale */}
      <g className="jv-spin jv-s120 jv-dim" stroke="currentColor" strokeWidth="1">{ticks(112, 72, 4, 6, 8)}</g>

      {/* core */}
      <circle cx="200" cy="200" r="98" fill="url(#jv-core)" stroke="currentColor" strokeWidth="1.5" className="jv-glow" />
      <circle className="jv-spin jv-s30r jv-dim" cx="200" cy="200" r="90" fill="none" stroke="currentColor" strokeWidth="1"
        strokeDasharray={segments(90, [40, 4, 10, 4, 80, 4, 10, 4])} />

      {/* crosshair notches */}
      <g className="jv-dim" stroke="currentColor" strokeWidth="1.5">
        <line x1="200" y1="2" x2="200" y2="14" /><line x1="200" y1="386" x2="200" y2="398" />
        <line x1="2" y1="200" x2="14" y2="200" /><line x1="386" y1="200" x2="398" y2="200" />
      </g>

      {title && (
        <text className="jv-title" x="200" y={subtitle ? 206 : 214} textAnchor="middle">
          {title}
        </text>
      )}
      {subtitle && (
        <text className="jv-sub" x="200" y="236" textAnchor="middle">
          {subtitle}
        </text>
      )}
    </svg>
  );
}

/** Small static mark (rings and a lit core) for the editor and the browser tab. */
export function JarvisMark({ size }: { size: number }) {
  return (
    <svg className="jv jv-mark" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="29" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="34 6 12 6 60 8 22 34" opacity=".55" />
      <circle cx="32" cy="32" r="22" fill="none" stroke="currentColor" strokeWidth="3.2" strokeDasharray="28 40 18 52" strokeLinecap="round" />
      <circle cx="32" cy="32" r="14" fill="#06202e" stroke="currentColor" strokeWidth="2" />
      <circle cx="32" cy="32" r="6" fill="currentColor" />
    </svg>
  );
}
