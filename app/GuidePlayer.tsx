import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { GUIDE_CHAPTERS, GUIDE_POSTER, GUIDE_VIDEO } from '../components/channel/videoGuide';

/**
 * The floating video-guide player. A chapter opens in a window that stays on screen while the person
 * keeps working anywhere in the app: drag it by its title bar, make it small or large, minimise it to a
 * slim bar, pop it out (picture-in-picture) or close it. Where it is, its size and the second it was
 * stopped at are remembered, so a reload continues where it was.
 */

type Size = 'small' | 'large';
interface PlayerState { id: string | null; size: Size; minimised: boolean; x: number | null; y: number | null; time: number }

const STORE = 'nct.guidePlayer';
const WIDTH: Record<Size, number> = { small: 440, large: 760 };
const MARGIN = 16;

const read = (): PlayerState => {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (s && (s.id === null || GUIDE_CHAPTERS.some(c => c.id === s.id))) return { size: 'small', minimised: false, x: null, y: null, time: 0, ...s };
  } catch { /* storage unavailable */ }
  return { id: null, size: 'small', minimised: false, x: null, y: null, time: 0 };
};

// A small store so any screen can open the player and the player itself lives once, above every screen.
let state: PlayerState = read();
const listeners = new Set<() => void>();
const set = (patch: Partial<PlayerState>) => {
  state = { ...state, ...patch };
  try { localStorage.setItem(STORE, JSON.stringify(state)); } catch { /* storage unavailable */ }
  listeners.forEach(l => l());
};
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** Opens a chapter in the floating player (from the start, unless it is already the one playing). */
export const openGuideVideo = (id: string) => set({ id, minimised: false, time: state.id === id ? state.time : 0 });
export const useGuidePlayer = () => useSyncExternalStore(subscribe, () => state);

const Icon: React.FC<{ d: string; className?: string }> = ({ d, className = 'w-4 h-4' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d={d} /></svg>
);
const I = {
  prev: 'M15.75 19.5L8.25 12l7.5-7.5',
  next: 'M8.25 4.5l7.5 7.5-7.5 7.5',
  grow: 'M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15',
  shrink: 'M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25',
  min: 'M19.5 12h-15',
  up: 'M4.5 15.75l7.5-7.5 7.5 7.5',
  pip: 'M3.75 6A2.25 2.25 0 016 3.75h12A2.25 2.25 0 0120.25 6v6M3.75 6v12A2.25 2.25 0 006 20.25h4.5M12.75 15h6.75a.75.75 0 01.75.75v3.75a.75.75 0 01-.75.75h-6.75a.75.75 0 01-.75-.75v-3.75a.75.75 0 01.75-.75z',
  close: 'M6 18L18 6M6 6l12 12',
};

const GuidePlayer: React.FC = () => {
  const s = useGuidePlayer();
  const video = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const [phone, setPhone] = useState(() => window.innerWidth < 640);
  const index = GUIDE_CHAPTERS.findIndex(c => c.id === s.id);
  const chapter = index >= 0 ? GUIDE_CHAPTERS[index] : null;
  const width = phone ? window.innerWidth - 2 * 8 : WIDTH[s.size];

  useEffect(() => {
    const onResize = () => setPhone(window.innerWidth < 640);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Keeps the window inside the screen (after a resize, or a size change near an edge).
  const place = useCallback((x: number, y: number) => {
    const h = box.current?.offsetHeight || 260;
    return {
      x: Math.min(Math.max(MARGIN, x), window.innerWidth - width - MARGIN),
      y: Math.min(Math.max(MARGIN, y), window.innerHeight - h - MARGIN),
    };
  }, [width]);

  // Resumes where it stopped, and remembers the second every few seconds.
  const onLoaded = () => { if (video.current && s.time > 1) video.current.currentTime = s.time; void video.current?.play().catch(() => undefined); };
  const onTime = () => { const t = video.current?.currentTime || 0; if (Math.abs(t - state.time) > 3) set({ time: t }); };

  const go = (i: number) => { const c = GUIDE_CHAPTERS[i]; if (c) set({ id: c.id, time: 0 }); };

  const onPointerDown = (e: React.PointerEvent) => {
    if (phone || (e.target as HTMLElement).closest('button')) return;
    const r = box.current!.getBoundingClientRect();
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current || !box.current) return;
    const p = place(e.clientX - drag.current.dx, e.clientY - drag.current.dy);
    box.current.style.left = `${p.x}px`; box.current.style.top = `${p.y}px`;
    box.current.style.right = 'auto'; box.current.style.bottom = 'auto';
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!drag.current || !box.current) return;
    drag.current = null;
    const r = box.current.getBoundingClientRect();
    set({ x: r.left, y: r.top });
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && state.id && !state.minimised && document.activeElement?.closest('[data-guide-player]')) set({ minimised: true }); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!chapter) return null;
  const pos: React.CSSProperties = phone
    ? { left: 8, right: 8, bottom: 8 }
    : s.x !== null && s.y !== null ? { left: place(s.x, s.y).x, top: place(s.x, s.y).y } : { right: 20, bottom: 20 };
  const canPip = typeof document !== 'undefined' && 'pictureInPictureEnabled' in document && (document as Document & { pictureInPictureEnabled: boolean }).pictureInPictureEnabled;
  const btn = 'w-7 h-7 inline-flex items-center justify-center rounded-md text-slate-300 hover:text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400 disabled:opacity-30 disabled:hover:bg-transparent';

  return (
    <div ref={box} data-guide-player role="dialog" aria-label={`Video guide: ${chapter.title}`}
      className="fixed z-[120] rounded-xl overflow-hidden bg-slate-900 text-white shadow-[0_20px_60px_-10px_rgba(15,23,42,0.55)] ring-1 ring-white/10"
      style={{ width, ...pos }}>
      <div onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        className={`flex items-center gap-2 pl-3 pr-1.5 h-11 select-none ${phone ? '' : 'cursor-grab active:cursor-grabbing'}`}
        title={phone ? undefined : 'Drag to move'}>
        <span className="shrink-0 w-6 h-6 rounded-md bg-indigo-500/20 ring-1 ring-inset ring-indigo-400/30 inline-flex items-center justify-center text-[11px] font-bold text-indigo-200 tabular-nums">{index + 1}</span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-indigo-300 whitespace-nowrap">OTA XML guide · Chapter {index + 1} of {GUIDE_CHAPTERS.length}</p>
          <p className="text-[12.5px] font-semibold truncate">{chapter.title}</p>
        </div>
        {!phone && <button type="button" className={btn} onClick={() => set({ size: s.size === 'small' ? 'large' : 'small', minimised: false })}
          aria-label={s.size === 'small' ? 'Larger' : 'Smaller'} title={s.size === 'small' ? 'Larger' : 'Smaller'}><Icon d={s.size === 'small' ? I.grow : I.shrink} /></button>}
        {canPip && !s.minimised && <button type="button" className={btn} aria-label="Picture in picture" title="Picture in picture: keep the video on top of other windows"
          onClick={() => { void (video.current as HTMLVideoElement & { requestPictureInPicture?: () => Promise<unknown> })?.requestPictureInPicture?.().catch(() => undefined); }}><Icon d={I.pip} /></button>}
        <button type="button" className={btn} onClick={() => set({ minimised: !s.minimised })} aria-label={s.minimised ? 'Show video' : 'Minimise'} title={s.minimised ? 'Show video' : 'Minimise'}>
          <Icon d={s.minimised ? I.up : I.min} /></button>
        <button type="button" className={btn} onClick={() => { video.current?.pause(); set({ id: null, time: 0 }); }} aria-label="Close video" title="Close"><Icon d={I.close} /></button>
      </div>
      <div className={s.minimised ? 'hidden' : 'block'}>
        <video key={chapter.id} ref={video} controls playsInline preload="metadata" poster={GUIDE_POSTER(chapter.id)}
          className="block w-full aspect-video bg-black" onLoadedMetadata={onLoaded} onTimeUpdate={onTime}
          onEnded={() => (index < GUIDE_CHAPTERS.length - 1 ? go(index + 1) : set({ time: 0 }))}>
          <source src={GUIDE_VIDEO(chapter.id)} type="video/mp4" />
        </video>
        <div className="flex items-center gap-1 px-1.5 py-1.5">
          <button type="button" className={btn} onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous chapter" title="Previous chapter"><Icon d={I.prev} /></button>
          <p className="min-w-0 flex-1 px-1 text-[11.5px] text-slate-400 truncate">
            {index < GUIDE_CHAPTERS.length - 1 ? <>Up next: <span className="text-slate-200">{GUIDE_CHAPTERS[index + 1].title}</span></> : 'Last chapter'}
          </p>
          <button type="button" className={btn} onClick={() => go(index + 1)} disabled={index === GUIDE_CHAPTERS.length - 1} aria-label="Next chapter" title="Next chapter"><Icon d={I.next} /></button>
        </div>
      </div>
    </div>
  );
};

export default GuidePlayer;
