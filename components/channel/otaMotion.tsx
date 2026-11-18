import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Motion for the OTA XML console: numbers that roll, a highlight that slides between menu items, cards that
 * rise in as they scroll into view, a light that follows the mouse, rings and bars that fill, screens that fade
 * in. Easing is an "expo out" curve (fast start, soft landing). Everything is switched off for people whose
 * device asks for reduced motion.
 */

export const reducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const NUM = /\d[\d,]*(?:\.\d+)?/g;
const ease = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

const nums = (s: string) => (s.match(NUM) || []).map(m => Number(m.replace(/,/g, '')));
/**
 * Shows a text and rolls every number in it: up from 0 the first time real numbers appear, then from the
 * old value to the new one whenever it changes (e.g. switching "7 days" to "30 days"). Works on "1 / 3", "4,250 USD"…
 */
export const CountUp: React.FC<{ value: React.ReactNode; duration?: number }> = ({ value, duration = 1100 }) => {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value : null;
  const [shown, setShown] = useState<string | null>(() => (text && /\d/.test(text) && !reducedMotion() && typeof requestAnimationFrame !== 'undefined' ? text.replace(NUM, '0') : text));
  const from = useRef<number[] | null>(null);
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (text === null) return;
    if (!/\d/.test(text) || reducedMotion() || typeof requestAnimationFrame === 'undefined') { setShown(text); last.current = /\d/.test(text) ? text : last.current; return; }
    const to = nums(text);
    const prev = last.current ? nums(last.current) : null;
    const start0 = prev && prev.length === to.length ? prev : to.map(() => 0);
    if (last.current === text) { setShown(text); return; }
    from.current = start0; last.current = text;
    let raf = 0; const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / duration), k = ease(p);
      let i = 0;
      setShown(p >= 1 ? text : text.replace(NUM, m => {
        const decimals = (m.split('.')[1] || '').length;
        const n = start0[i] + (to[i] - start0[i]) * k; i++;
        return m.includes(',') ? n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : n.toFixed(decimals);
      }));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  if (text === null) return <>{value}</>;
  return <>{shown ?? text}</>;
};

/**
 * True once the element has scrolled into view (and stays true), so cards further down animate when
 * people reach them rather than while they are still off screen. Shows at once without IntersectionObserver.
 */
export function useInView<T extends Element>(): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined' || reducedMotion());
  useEffect(() => {
    if (seen || !ref.current) return;
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: '0px 0px -8% 0px' });
    io.observe(ref.current);
    const safety = setTimeout(() => setSeen(true), 4000);   // never leave a card hidden
    return () => { io.disconnect(); clearTimeout(safety); };
  }, [seen]);
  return [ref, seen];
}

/**
 * A soft light that follows the mouse over cards marked `ota-spot` inside the element this is attached to
 * (one listener for the whole page; the light itself is CSS, see index.css).
 */
export function useSpotlight<T extends HTMLElement>(): React.RefObject<T> {
  const ref = useRef<T>(null);
  useEffect(() => {
    const host = ref.current;
    if (!host || reducedMotion()) return;
    const move = (e: PointerEvent) => {
      const card = (e.target as HTMLElement | null)?.closest?.('.ota-spot') as HTMLElement | null;
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    };
    host.addEventListener('pointermove', move, { passive: true });
    return () => host.removeEventListener('pointermove', move);
  }, []);
  return ref;
}

/** A ring that fills to `value` (0–1), for a health score. */
export const Ring: React.FC<{ value: number; size?: number; stroke?: number; color: string; children?: React.ReactNode }> = ({ value, size = 64, stroke = 7, color, children }) => {
  const [on, setOn] = useState(reducedMotion());
  useEffect(() => { const t = setTimeout(() => setOn(true), 60); return () => clearTimeout(t); }, []);
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, value));
  return (
    <span className="relative inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef2f7" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={on ? c * (1 - v) : c} style={{ transition: 'stroke-dashoffset 1.3s cubic-bezier(.16,1,.3,1)' }} />
      </svg>
      {children && <span className="absolute inset-0 flex items-center justify-center">{children}</span>}
    </span>
  );
};

/**
 * A highlight that slides to the active item of a menu. Put it inside a `relative` container whose
 * items carry `data-pill={key}`; it measures the active one and moves there.
 */
export const SlidingPill: React.FC<{ active: string; className?: string; deps?: unknown[] }> = ({ active, className = '', deps = [] }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const first = useRef(true);
  useLayoutEffect(() => {
    const measure = () => {
      const host = ref.current?.parentElement;
      const el = host?.querySelector<HTMLElement>(`[data-pill="${CSS.escape(active)}"]`);
      if (!host || !el) { setBox(null); return; }
      setBox({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
    };
    measure();
    const host = ref.current?.parentElement;
    const ro = typeof ResizeObserver !== 'undefined' && host ? new ResizeObserver(measure) : null;
    if (ro && host) ro.observe(host);
    window.addEventListener('resize', measure);
    return () => { ro?.disconnect(); window.removeEventListener('resize', measure); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ...deps]);
  const animate = !first.current && !reducedMotion();
  useEffect(() => { if (box) first.current = false; }, [box]);
  return (
    <span ref={ref} aria-hidden
      className={`pointer-events-none absolute left-0 top-0 ${animate ? 'transition-[transform,width,height,opacity] duration-[460ms] ease-[cubic-bezier(.16,1,.3,1)]' : ''} ${className}`}
      style={box ? { transform: `translate(${box.x}px, ${box.y}px)`, width: box.w, height: box.h, opacity: 1 } : { opacity: 0 }} />
  );
};

/** Fades and lifts its content in whenever `k` changes (a new screen or section). */
export const FadeIn: React.FC<{ k: string; children: React.ReactNode; className?: string }> = ({ k, children, className = '' }) => (
  <div key={k} className={`ota-enter ${className}`}>{children}</div>
);

/** A bar that fills to `value` (0–1) after it appears. */
export const GrowBar: React.FC<{ value: number; className?: string; track?: string; vertical?: boolean; delay?: number }> = ({ value, className = 'bg-indigo-500', track = 'bg-slate-100', vertical, delay = 0 }) => {
  const [on, setOn] = useState(reducedMotion());
  useEffect(() => { const t = setTimeout(() => setOn(true), 30 + delay); return () => clearTimeout(t); }, [delay]);
  const v = `${Math.max(0, Math.min(1, value)) * 100}%`;
  return (
    <span className={`relative block overflow-hidden rounded-full ${track} ${vertical ? 'w-full h-full' : 'h-1.5 w-full'}`}>
      <span className={`absolute ${vertical ? 'bottom-0 left-0 right-0' : 'left-0 top-0 bottom-0'} rounded-full ${className} transition-[width,height] duration-1000 ease-[cubic-bezier(.16,1,.3,1)]`}
        style={vertical ? { height: on ? v : '0%' } : { width: on ? v : '0%' }} />
    </span>
  );
};
