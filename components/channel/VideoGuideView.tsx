import React, { useEffect, useState } from 'react';
import { GUIDE_CHAPTERS, GUIDE_POSTER, GuideStep } from './videoGuide';
import { formatTime, loadGuideSteps, openGuideVideo, useGuidePlayer } from '../../app/GuidePlayer';

const STORE = 'nct.otaGuideChapter';
const seconds = (len: string) => { const [m, s] = len.split(':').map(Number); return m * 60 + s; };
const TOTAL_MINUTES = Math.round(GUIDE_CHAPTERS.reduce((t, c) => t + seconds(c.length), 0) / 60);

const PlayGlyph: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.14v13.72a1 1 0 001.52.85l10.6-6.86a1 1 0 000-1.7L9.52 4.29A1 1 0 008 5.14z" /></svg>
);

/**
 * OTA XML → Video guide: a captioned video for every part of OTA XML, recorded from the real system.
 * A chapter plays in the floating player, so it keeps playing while the person works on any screen.
 * Below the chapters: what each page in the selected chapter is and what it is used for.
 */
const VideoGuideView: React.FC = () => {
  const player = useGuidePlayer();
  const [selected, setSelected] = useState(() => {
    try { const v = localStorage.getItem(STORE); return GUIDE_CHAPTERS.some(c => c.id === v) ? v! : GUIDE_CHAPTERS[0].id; }
    catch { return GUIDE_CHAPTERS[0].id; }
  });
  useEffect(() => { try { localStorage.setItem(STORE, selected); } catch { /* storage unavailable */ } }, [selected]);
  const chapter = GUIDE_CHAPTERS.find(c => c.id === selected) || GUIDE_CHAPTERS[0];
  const index = GUIDE_CHAPTERS.indexOf(chapter);
  const play = (id: string) => { setSelected(id); openGuideVideo(id); };
  const [steps, setSteps] = useState<GuideStep[]>([]);
  useEffect(() => { setSteps([]); let live = true; void loadGuideSteps(selected).then(x => { if (live) setSteps(x.filter(c => c.step > 0)); }); return () => { live = false; }; }, [selected]);

  return (
    <div className="space-y-4" data-testid="video-guide">
      <section className="rounded-xl bg-white border border-slate-200 px-4 py-3.5 sm:px-5 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold text-slate-900">Learn OTA XML, one step at a time</h3>
          <p className="text-[12.5px] text-slate-500">{GUIDE_CHAPTERS.length} chapters · {TOTAL_MINUTES} minutes, recorded from this system with captions. A video opens in a floating window: keep working on any screen while it plays.</p>
        </div>
        <button type="button" onClick={() => play(GUIDE_CHAPTERS[0].id)}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-indigo-600 text-white text-[13px] font-semibold hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500">
          <PlayGlyph className="w-4 h-4" />Play from the start
        </button>
      </section>

      <ol className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5 gap-3">
        {GUIDE_CHAPTERS.map((c, i) => {
          const playing = player.id === c.id;
          return (
            <li key={c.id}>
              <article className={`h-full flex flex-col rounded-xl border bg-white overflow-hidden transition-shadow ${selected === c.id ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-slate-200 hover:shadow-md'}`}>
                <button type="button" onClick={() => play(c.id)} aria-label={`Play chapter ${i + 1}: ${c.title}`}
                  className="group relative block aspect-video bg-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-indigo-500">
                  <img src={GUIDE_POSTER(c.id)} alt="" loading="lazy" className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="w-12 h-12 rounded-full bg-white/95 text-indigo-600 shadow-lg inline-flex items-center justify-center group-hover:scale-105 transition-transform">
                      <PlayGlyph className="w-5 h-5 ml-0.5" />
                    </span>
                  </span>
                  <span className="absolute bottom-1.5 right-1.5 px-1.5 py-px rounded bg-slate-900/85 text-[11px] font-medium text-white tabular-nums">{c.length}</span>
                  {playing && <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 px-1.5 py-px rounded bg-indigo-600 text-[10.5px] font-semibold text-white"><span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />Playing</span>}
                </button>
                <button type="button" onClick={() => setSelected(c.id)} className="flex-1 text-left px-3 py-2.5 hover:bg-slate-50" aria-pressed={selected === c.id}>
                  <span className="block text-[11px] font-semibold text-indigo-600">Chapter {i + 1}</span>
                  <span className="block text-[13.5px] font-semibold text-slate-900 leading-snug">{c.title}</span>
                  <span className="mt-1 block text-[12px] text-slate-500 leading-snug line-clamp-2">{c.summary}</span>
                </button>
              </article>
            </li>
          );
        })}
      </ol>

      <section className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5" aria-live="polite">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600">Chapter {index + 1} of {GUIDE_CHAPTERS.length} · {chapter.length}</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">{chapter.title}</h3>
            <p className="mt-1 text-[13.5px] text-slate-600">{chapter.summary}</p>
          </div>
          <button type="button" onClick={() => play(chapter.id)}
            className="inline-flex items-center gap-2 h-9 px-3.5 rounded-lg border border-slate-200 text-[13px] font-semibold text-slate-800 hover:bg-slate-50">
            <PlayGlyph className="w-4 h-4 text-indigo-600" />{player.id === chapter.id ? 'Playing' : 'Play this chapter'}
          </button>
        </div>
        {steps.length > 0 && (<>
          <h4 className="mt-5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Steps in this video <span className="normal-case tracking-normal font-normal text-slate-400">· click a step to watch it</span></h4>
          <ol className="mt-2 grid grid-cols-1 lg:grid-cols-2 gap-x-4 gap-y-1" data-testid="guide-steps">
            {steps.map(c => (
              <li key={`${c.step}-${c.start}`}>
                <button type="button" onClick={() => openGuideVideo(chapter.id, c.start)}
                  className="w-full text-left flex items-start gap-3 rounded-lg px-2.5 py-2 hover:bg-indigo-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500">
                  <span className="shrink-0 w-7 h-7 rounded-md bg-indigo-50 text-indigo-700 text-[12px] font-bold inline-flex items-center justify-center tabular-nums">{c.step}</span>
                  <span className="min-w-0 flex-1 text-[13px] leading-snug text-slate-800">{c.title}</span>
                  <span className="shrink-0 text-[12px] text-slate-400 tabular-nums pt-0.5">{formatTime(c.start)}</span>
                </button>
              </li>
            ))}
          </ol>
        </>)}
        <h4 className="mt-5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">In this chapter</h4>
        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {chapter.pages.map(p => (
            <article key={p.name} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <h5 className="text-[14px] font-semibold text-slate-900">{p.name}</h5>
                <span className="text-[11.5px] text-slate-500">{p.where}</span>
              </div>
              <p className="mt-2 text-[13px] text-slate-700"><span className="font-semibold text-slate-900">What it is: </span>{p.what}</p>
              <p className="mt-1.5 text-[13px] text-slate-700"><span className="font-semibold text-emerald-700">Used for: </span>{p.usedFor}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
};

export default VideoGuideView;
