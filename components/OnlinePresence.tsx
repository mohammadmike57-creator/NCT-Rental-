import React, { useEffect, useRef, useState } from 'react';
import { fetchOnlineNow, OnlineStaff } from '../firebase/api';

/** Online status shared by the staff screen and the top bar. */

export type Presence = 'online' | 'away' | 'offline';

/** The server keeps times in UTC without a zone suffix. */
export const serverTime = (s?: string | null): Date | null => {
  if (!s) return null;
  const t = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
  return isNaN(t.getTime()) ? null : t;
};

export const presenceOf = (u: { presence?: string; isOnline?: boolean }): Presence =>
  u.presence === 'online' || u.presence === 'away' || u.presence === 'offline' ? u.presence : u.isOnline ? 'online' : 'offline';

export const minutesSince = (t: Date | null) => (t ? Math.max(0, Math.round((Date.now() - t.getTime()) / 60000)) : null);

export const agoText = (mins: number | null) => {
  if (mins === null) return '';
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 24 * 60) return `${Math.floor(mins / 60)} h ago`;
  const d = Math.floor(mins / 1440);
  return d === 1 ? 'yesterday' : `${d} days ago`;
};

const fmt = (t: Date) => t.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

const STYLE: Record<Presence, { dot: string; pill: string; label: string }> = {
  online: { dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700 ring-emerald-200', label: 'Online' },
  away: { dot: 'bg-amber-400', pill: 'bg-amber-50 text-amber-700 ring-amber-200', label: 'Away' },
  offline: { dot: 'bg-slate-300', pill: 'bg-slate-100 text-slate-500 ring-slate-200', label: 'Offline' },
};

/** The small dot on an avatar; online pulses gently. */
export const PresenceDot: React.FC<{ presence: Presence; className?: string }> = ({ presence, className = '' }) =>
  presence === 'offline' ? null : (
    <span className={`absolute -bottom-0.5 -right-0.5 flex w-3 h-3 ${className}`} aria-label={STYLE[presence].label}>
      {presence === 'online' && <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-60 animate-ping" />}
      <span className={`relative inline-flex w-3 h-3 rounded-full ring-2 ring-white ${STYLE[presence].dot}`} />
    </span>
  );

export const PresencePill: React.FC<{ presence: Presence }> = ({ presence }) => (
  <span className={`inline-flex items-center gap-1.5 h-5 px-2 rounded-full text-[11px] font-semibold ring-1 ring-inset ${STYLE[presence].pill}`}>
    <span className={`w-1.5 h-1.5 rounded-full ${STYLE[presence].dot}`} />{STYLE[presence].label}
  </span>
);

/** "Last seen" cell: live status for people online, otherwise when they were last seen. */
export const LastSeenText: React.FC<{ user: { presence?: string; isOnline?: boolean; lastSeen?: string; lastActiveAt?: string } }> = ({ user }) => {
  const p = presenceOf(user);
  const seen = serverTime(user.lastSeen);
  if (p === 'online') return <span className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Online now</span>;
  if (p === 'away') {
    const idle = minutesSince(serverTime(user.lastActiveAt) || seen);
    return <span className="inline-flex items-center gap-1.5 text-amber-700 font-semibold" title="The app is open but has not been used for a while"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />Away{idle !== null && idle >= 1 ? <span className="font-normal text-amber-600"> · idle {idle < 60 ? `${idle} min` : `${Math.floor(idle / 60)} h`}</span> : null}</span>;
  }
  if (!seen) return <span className="text-slate-400">Never signed in</span>;
  const ago = agoText(minutesSince(seen));
  return <span title={seen.toLocaleString('en-GB')}><span className="text-slate-700">{ago}</span><span className="text-slate-400"> · {fmt(seen)}</span></span>;
};

const initials = (name?: string) => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('');

const DeviceIcon: React.FC<{ mobile: boolean }> = ({ mobile }) => mobile ? (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" /></svg>
) : (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" /></svg>
);

export interface PresencePerson { id?: string; email?: string; fullName?: string; username?: string; position?: string; presence?: string; isOnline?: boolean; currentScreen?: string; deviceType?: string; lastSeen?: string; lastActiveAt?: string }

/** One person in the "Online now" panel. */
const PersonCard: React.FC<{ person: PresencePerson; self: boolean; avatarClass: string; onOpen?: () => void }> = ({ person, self, avatarClass, onOpen }) => {
  const p = presenceOf(person);
  const active = minutesSince(serverTime(person.lastActiveAt) || serverTime(person.lastSeen));
  return (
    <button type="button" onClick={onOpen} className="group text-left w-full rounded-xl border border-slate-200 bg-white p-3.5 hover:border-indigo-200 hover:shadow-sm transition">
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <div className={`w-10 h-10 rounded-full ${avatarClass} font-semibold text-xs flex items-center justify-center`}>{initials(person.fullName || person.username)}</div>
          <PresenceDot presence={p} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] font-semibold text-slate-900 truncate">{person.fullName || person.username || person.email}{self && <span className="ml-1.5 text-[11px] font-medium text-slate-400">(you)</span>}</p>
            <PresencePill presence={p} />
          </div>
          <p className="text-xs text-slate-500 truncate">{person.position || person.email}</p>
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
        <span className="text-slate-500 truncate">{p === 'online' ? 'Working in' : 'Left open on'} <span className="font-medium text-slate-800">{person.currentScreen || 'the system'}</span></span>
        <span className="inline-flex items-center gap-1 text-slate-500"><DeviceIcon mobile={person.deviceType === 'mobile'} />{person.deviceType === 'mobile' ? 'Mobile' : 'Desktop'}</span>
        <span className="text-slate-400 tabular-nums">{p === 'online' ? `Active ${agoText(active)}` : `No activity for ${active !== null && active >= 60 ? `${Math.floor(active / 60)} h` : `${active ?? 0} min`}`}</span>
      </div>
    </button>
  );
};

/** "Online now" panel for the staff screen. */
export const OnlineNowPanel: React.FC<{ people: PresencePerson[]; selfEmail?: string; avatarClass: (s: string) => string; onOpen?: (p: PresencePerson) => void; lastSeenSomeone?: PresencePerson | null }> = ({ people, selfEmail, avatarClass, onOpen, lastSeenSomeone }) => {
  const online = people.filter(p => presenceOf(p) === 'online').length;
  const away = people.length - online;
  return (
    <section className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50/60 shadow-sm">
      <header className="px-4 sm:px-5 py-3.5 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <span className="relative flex w-2.5 h-2.5"><span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-60 animate-ping" /><span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-emerald-500" /></span>
          <h2 className="text-[15px] font-semibold text-slate-900">Online now</h2>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span><strong className="text-slate-900 tabular-nums">{online}</strong> online</span>
          <span className="w-px h-3 bg-slate-200" />
          <span><strong className="text-slate-900 tabular-nums">{away}</strong> away</span>
        </div>
        <span className="sm:ml-auto text-[11px] text-slate-400">Updates live every 30 seconds · Away = system open but not used for 5 minutes</span>
      </header>
      {people.length ? (
        <div className="p-3 sm:p-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {people.map(p => <PersonCard key={p.id || p.email} person={p} self={!!selfEmail && p.email?.toLowerCase() === selfEmail.toLowerCase()} avatarClass={avatarClass(p.email || p.fullName || '?')} onOpen={onOpen ? () => onOpen(p) : undefined} />)}
        </div>
      ) : (
        <div className="px-5 py-6 text-center">
          <p className="text-[13px] font-medium text-slate-700">No one is online right now</p>
          {lastSeenSomeone && <p className="mt-1 text-xs text-slate-500">Last seen: {lastSeenSomeone.fullName || lastSeenSomeone.email}, {agoText(minutesSince(serverTime(lastSeenSomeone.lastSeen)))}</p>}
        </div>
      )}
    </section>
  );
};

/** Top-bar indicator for managers: avatars of who is online, with a list on click. */
export const OnlineNowButton: React.FC<{ selfEmail?: string; onOpenStaff?: () => void }> = ({ selfEmail, onOpenStaff }) => {
  const [people, setPeople] = useState<OnlineStaff[] | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let stop = false;
    const load = () => { if (document.visibilityState === 'visible') fetchOnlineNow().then(p => { if (!stop) setPeople(p); }).catch(() => { if (!stop) setPeople(prev => prev ?? null); }); };
    load();
    const t = setInterval(load, 30000);
    return () => { stop = true; clearInterval(t); };
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  if (!people) return null;
  const online = people.filter(p => p.presence === 'online');
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(o => !o)} title="Who's online" aria-label={`${online.length} online`}
        className="h-9 pl-1.5 pr-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 flex items-center gap-2">
        <span className="flex -space-x-1">
          {people.slice(0, 3).map(p => (
            <span key={p.id} className="relative w-7 h-7 rounded-full bg-indigo-50 text-indigo-700 ring-2 ring-white text-[10px] font-bold flex items-center justify-center">
              {initials(p.fullName || p.email)}
              <span className={`absolute -bottom-px -right-px w-2 h-2 rounded-full ring-1 ring-white ${p.presence === 'online' ? 'bg-emerald-500' : 'bg-amber-400'}`} />
            </span>
          ))}
          {!people.length && <span className="w-6 h-6 rounded-full bg-slate-100 ring-2 ring-white" />}
        </span>
        <span className="text-xs font-semibold text-slate-700 tabular-nums whitespace-nowrap">{online.length} online</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white shadow-xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <p className="text-[13px] font-semibold text-slate-900">Who's online</p>
            <span className="text-[11px] text-slate-500">{online.length} online · {people.length - online.length} away</span>
          </div>
          <ul className="max-h-80 overflow-y-auto divide-y divide-slate-100">
            {people.length ? people.map(p => (
              <li key={p.id} className="px-4 py-2.5 flex items-center gap-3">
                <div className="relative shrink-0">
                  <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-700 text-[11px] font-semibold flex items-center justify-center">{initials(p.fullName || p.email)}</div>
                  <PresenceDot presence={p.presence} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-slate-900 truncate">{p.fullName || p.email}{selfEmail && p.email?.toLowerCase() === selfEmail.toLowerCase() && <span className="ml-1 text-[11px] text-slate-400">(you)</span>}</p>
                  <p className="text-[11px] text-slate-500 truncate">{p.currentScreen ? `${p.presence === 'online' ? 'In' : 'Left on'} ${p.currentScreen}` : (p.position || '')}{p.deviceType === 'mobile' ? ' · Mobile' : ''}</p>
                </div>
                <PresencePill presence={p.presence} />
              </li>
            )) : <li className="px-4 py-6 text-center text-xs text-slate-500">No one is online right now.</li>}
          </ul>
          {onOpenStaff && <button type="button" onClick={() => { setOpen(false); onOpenStaff(); }} className="w-full px-4 py-2.5 border-t border-slate-100 text-xs font-semibold text-indigo-600 hover:bg-slate-50 text-left">Open User & Staff Management →</button>}
        </div>
      )}
    </div>
  );
};
