import React, { useEffect, useState } from 'react';
import { endSupportView, supportInfo } from '../../services/session';

/** Across the top of a platform support view: whose data this is, that it is read-only, and when it ends. */
const SupportBanner: React.FC<{ company: string }> = ({ company }) => {
  const { until } = supportInfo();
  const [left, setLeft] = useState('');
  useEffect(() => {
    if (!until) return;
    const tick = () => {
      const ms = new Date(until).getTime() - Date.now();
      if (ms <= 0) { endSupportView(); window.location.href = '/admin'; return; }
      const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000);
      setLeft(`${m}:${String(s).padStart(2, '0')}`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [until]);
  const end = () => { endSupportView(); window.location.href = '/admin'; };
  return (
    <div role="status" data-testid="support-banner"
      className="h-10 flex items-center gap-3 px-4 text-[13px] bg-amber-400 text-amber-950 font-medium no-print">
      <svg viewBox="0 0 20 20" className="w-4 h-4 shrink-0" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M10 1.5a.75.75 0 01.67.41l7.5 14.5A.75.75 0 0117.5 17.5h-15a.75.75 0 01-.67-1.09l7.5-14.5A.75.75 0 0110 1.5zM10 7a.75.75 0 00-.75.75v3.5a.75.75 0 001.5 0v-3.5A.75.75 0 0010 7zm0 7.5a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>
      <span className="truncate">Platform support view of <b>{company || 'this supplier'}</b> · read-only, nothing can be changed{left && <> · ends in <span className="tabular-nums">{left}</span></>}</span>
      <button type="button" onClick={end} className="ml-auto shrink-0 rounded-md bg-amber-950/90 hover:bg-amber-950 text-amber-50 px-3 py-1 text-[12px] font-semibold">End support view</button>
    </div>
  );
};

export default SupportBanner;
