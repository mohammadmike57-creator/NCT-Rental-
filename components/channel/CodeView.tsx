import React, { useMemo, useRef, useState } from 'react';
import MessageReader from './MessageReader';

/**
 * Professional code viewer for XML and JSON messages: syntax colours, line numbers, search with
 * match count, wrap, copy, download, and a summary of an OTA / native XML / JSON answer
 * (root message, EchoToken, Success, Warnings, Errors with their codes). Read only.
 */

export type CodeLang = 'xml' | 'json' | 'text';

export const detectLang = (s?: string): CodeLang => {
  const t = (s || '').trim();
  if (t.startsWith('<')) return 'xml';
  if (t.startsWith('{') || t.startsWith('[')) return 'json';
  return 'text';
};

/** Indents XML (attributes kept on the element) or JSON. Text is returned as it is. */
export const formatCode = (s?: string): string => {
  if (!s) return '';
  const t = s.trim();
  if (t.startsWith('{') || t.startsWith('[')) { try { return JSON.stringify(JSON.parse(t), null, 2); } catch { return s; } }
  if (!t.startsWith('<')) return s;
  const parts = t.replace(/>\s+</g, '><').replace(/(<!\[CDATA\[[\s\S]*?\]\]>)|></g, (m, cdata) => (cdata ? m : '>\n<')).split('\n');
  let depth = 0;
  return parts.map(line => {
    const l = line.trim();
    if (/^<\//.test(l)) depth = Math.max(0, depth - 1);
    const out = '  '.repeat(depth) + l;
    if (/^<[^!?/][^>]*[^/]>$/.test(l) && !/<\/[\w:.-]+>$/.test(l)) depth++;
    else if (/^<[^!?/][^>]*>$/.test(l) && /<\/[\w:.-]+>$/.test(l)) { /* <a>text</a>: same depth */ }
    return out;
  }).join('\n');
};

export interface MessageCheck {
  ok: boolean;
  error?: string;
  /** XML: the message element (inside a SOAP envelope when there is one). */
  root?: string;
  soap?: boolean;
  echo?: string;
  timestamp?: string;
  version?: string;
  success?: boolean;
  warnings: { code?: string; text: string }[];
  errors: { code?: string; type?: string; text: string }[];
  elements?: number;
}

/** Well-formedness and the standard OTA / native result parts of a message. */
export const checkMessage = (s?: string): MessageCheck | null => {
  const t = (s || '').trim();
  if (!t) return null;
  const lang = detectLang(t);
  if (lang === 'json') {
    try {
      const j = JSON.parse(t);
      const errs = Array.isArray(j?.errors) ? j.errors : j?.error ? [j.error] : [];
      return { ok: true, warnings: (j?.warnings || []).map((w: any) => ({ code: w?.code, text: w?.message || String(w) })),
        errors: errs.map((e: any) => ({ code: e?.code, text: e?.message || e?.detail || String(e) })), success: !errs.length, root: Array.isArray(j) ? 'array' : 'object' };
    } catch (e: any) { return { ok: false, error: String(e?.message || 'Invalid JSON'), warnings: [], errors: [] }; }
  }
  if (lang !== 'xml' || typeof DOMParser === 'undefined') return null;
  const doc = new DOMParser().parseFromString(t, 'application/xml');
  const pe = doc.getElementsByTagName('parsererror')[0];
  if (pe) {
    const raw = (pe.textContent || '').replace(/\s+/g, ' ');
    const chrome = /line (\d+) at column (\d+):\s*(.*?)(?: Below is a rendering.*)?$/i.exec(raw);
    const firefox = /XML Parsing Error:\s*(.*?)\s*Location:.*?Line Number (\d+), Column (\d+)/i.exec(raw);
    const error = chrome ? `Line ${chrome[1]}, column ${chrome[2]}: ${chrome[3].trim()}` : firefox ? `Line ${firefox[2]}, column ${firefox[3]}: ${firefox[1]}` : 'Not well-formed XML';
    return { ok: false, error, warnings: [], errors: [] };
  }
  let el: Element = doc.documentElement;
  const soap = /Envelope$/.test(el.localName);
  if (soap) {
    const body = Array.from(el.children).find(c => c.localName === 'Body');
    if (body?.firstElementChild) el = body.firstElementChild;
  }
  const all = (name: string) => Array.from(el.getElementsByTagNameNS('*', name));
  const errNodes = [...all('Error'), ...all('Fault')].filter(n => n.localName === 'Error' || n.localName === 'Fault');
  const warnNodes = all('Warning');
  const text = (n: Element) => n.getAttribute('ShortText') || n.getAttribute('Message') || n.textContent?.trim() || n.localName;
  return {
    ok: true, soap, root: el.localName,
    echo: el.getAttribute('EchoToken') || undefined, timestamp: el.getAttribute('TimeStamp') || undefined, version: el.getAttribute('Version') || undefined,
    success: all('Success').length > 0 || (!errNodes.length && /RS$|Response$/.test(el.localName)),
    warnings: warnNodes.map(n => ({ code: n.getAttribute('Code') || undefined, text: text(n) })),
    errors: errNodes.map(n => ({ code: n.getAttribute('Code') || n.getElementsByTagName('faultcode')[0]?.textContent || undefined, type: n.getAttribute('Type') || undefined, text: text(n) })),
    elements: doc.getElementsByTagName('*').length,
  };
};

// ---------------------------------------------------------------- highlighting

const XML_TOKEN = /(<!--.*?-->)|(<!\[CDATA\[.*?\]\]>)|(<\?.*?\?>)|(<\/?[\w:.-]+)|([\w:.-]+)(\s*=\s*)("[^"]*"|'[^']*')|(\/?>)/g;
const JSON_TOKEN = /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(true|false|null)|([{}[\],])/g;

type Theme = 'dark' | 'light';
const C = {
  dark: { text: 'text-slate-300', tag: 'text-sky-300', attr: 'text-violet-300', eq: 'text-slate-500', val: 'text-emerald-300', com: 'text-slate-500 italic', cdata: 'text-amber-200', pi: 'text-slate-500', key: 'text-sky-300', str: 'text-emerald-300', num: 'text-amber-300', kw: 'text-violet-300', punc: 'text-slate-500' },
  light: { text: 'text-slate-800', tag: 'text-sky-700', attr: 'text-violet-700', eq: 'text-slate-400', val: 'text-emerald-700', com: 'text-slate-400 italic', cdata: 'text-amber-700', pi: 'text-slate-400', key: 'text-sky-700', str: 'text-emerald-700', num: 'text-amber-700', kw: 'text-violet-700', punc: 'text-slate-400' },
};

const markSearch = (s: string, q: string, cls: string, key: string): React.ReactNode => {
  if (!q) return <span key={key} className={cls}>{s}</span>;
  const out: React.ReactNode[] = [];
  const low = s.toLowerCase(), ql = q.toLowerCase();
  let i = 0, k = 0;
  for (let at = low.indexOf(ql); at >= 0; at = low.indexOf(ql, i)) {
    if (at > i) out.push(s.slice(i, at));
    out.push(<mark key={k++} className="rounded-sm bg-amber-300/80 text-slate-900">{s.slice(at, at + q.length)}</mark>);
    i = at + q.length;
  }
  if (i < s.length) out.push(s.slice(i));
  return <span key={key} className={cls}>{out}</span>;
};

const highlightLine = (line: string, lang: CodeLang, theme: Theme, q: string): React.ReactNode[] => {
  const c = C[theme];
  if (lang === 'text') return [markSearch(line, q, c.text, 't')];
  const re = lang === 'xml' ? XML_TOKEN : JSON_TOKEN;
  re.lastIndex = 0;
  const nodes: React.ReactNode[] = [];
  let last = 0, k = 0, m: RegExpExecArray | null;
  const push = (s: string, cls: string) => { if (s) nodes.push(markSearch(s, q, cls, String(k++))); };
  while ((m = re.exec(line))) {
    if (m.index > last) push(line.slice(last, m.index), c.text);
    if (lang === 'xml') {
      if (m[1]) push(m[1], c.com); else if (m[2]) push(m[2], c.cdata); else if (m[3]) push(m[3], c.pi);
      else if (m[4]) push(m[4], c.tag);
      else if (m[5]) { push(m[5], c.attr); push(m[6], c.eq); push(m[7], c.val); }
      else if (m[8]) push(m[8], c.tag);
    } else {
      if (m[1]) { if (m[2]) { push(m[1], c.key); push(m[2], c.punc); } else push(m[1], c.str); }
      else if (m[3]) push(m[3], c.num); else if (m[4]) push(m[4], c.kw); else if (m[5]) push(m[5], c.punc);
    }
    last = re.lastIndex;
    if (m[0] === '') re.lastIndex++;
  }
  if (last < line.length) push(line.slice(last), c.text);
  return nodes;
};

// ---------------------------------------------------------------- summary strip

export const ResultStrip: React.FC<{ check: MessageCheck | null; theme?: Theme }> = ({ check, theme = 'dark' }) => {
  if (!check) return null;
  const dark = theme === 'dark';
  const chip = (cls: string, children: React.ReactNode, title?: string) => (
    <span title={title} className={`inline-flex items-center gap-1.5 h-6 px-2 rounded-md text-[11px] font-semibold ring-1 ring-inset whitespace-nowrap ${cls}`}>{children}</span>
  );
  if (!check.ok) return (
    <div className={`px-3 py-2 border-b text-[11.5px] ${dark ? 'border-white/10 bg-rose-500/10 text-rose-200' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
      <b>Not well-formed.</b> {check.error}
    </div>
  );
  const neutral = dark ? 'bg-white/5 text-slate-300 ring-white/10' : 'bg-white text-slate-600 ring-slate-200';
  return (
    <div className={`px-3 py-2 border-b flex flex-wrap items-center gap-1.5 ${dark ? 'border-white/10 bg-white/[0.03]' : 'border-slate-200 bg-slate-50/70'}`}>
      {check.root && chip(neutral, <><span className="font-mono">{check.root}</span>{check.soap && <span className="opacity-70">in SOAP</span>}</>)}
      {check.errors.length
        ? chip(dark ? 'bg-rose-500/15 text-rose-200 ring-rose-400/30' : 'bg-rose-50 text-rose-700 ring-rose-200', <><span className="w-1.5 h-1.5 rounded-full bg-rose-400" />{check.errors.length} error{check.errors.length === 1 ? '' : 's'}</>)
        : check.success ? chip(dark ? 'bg-emerald-500/15 text-emerald-200 ring-emerald-400/30' : 'bg-emerald-50 text-emerald-700 ring-emerald-200', <><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Success</>) : null}
      {check.warnings.length > 0 && chip(dark ? 'bg-amber-500/15 text-amber-200 ring-amber-400/30' : 'bg-amber-50 text-amber-800 ring-amber-200', <>{check.warnings.length} warning{check.warnings.length === 1 ? '' : 's'}</>, check.warnings.map(w => w.text).join('\n'))}
      {check.echo && chip(neutral, <>EchoToken <span className="font-mono">{check.echo}</span></>)}
      {check.version && chip(neutral, <>v{check.version}</>)}
      {check.elements != null && <span className={`ml-auto text-[11px] tabular-nums ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{check.elements} elements</span>}
      {check.errors.length > 0 && (
        <ul className="basis-full mt-1 space-y-0.5">
          {check.errors.slice(0, 4).map((e, i) => (
            <li key={i} className={`text-[11.5px] ${dark ? 'text-rose-200' : 'text-rose-700'}`}>
              {e.code && <span className="font-mono font-semibold">{e.code}</span>}{e.type && <span className="opacity-70"> · type {e.type}</span>} — {e.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// ---------------------------------------------------------------- viewer

const Tool: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { dark: boolean; on?: boolean }> = ({ dark, on, className, ...rest }) => (
  <button type="button" {...rest} className={`h-7 px-2 rounded-md text-[11.5px] font-semibold transition-colors ${on
    ? (dark ? 'bg-white/15 text-white' : 'bg-slate-900 text-white')
    : (dark ? 'text-slate-300 hover:bg-white/10 hover:text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900')} ${className || ''}`} />
);

const CodeView: React.FC<{
  code?: string;
  title?: string;
  meta?: React.ReactNode;
  lang?: CodeLang;
  theme?: Theme;
  /** Max height of the scroll area, e.g. '28rem'. */
  height?: string;
  format?: boolean;
  summary?: boolean;
  download?: string;
  actions?: React.ReactNode;
  empty?: string;
  className?: string;
  /** Offer the readable (business document) view next to the code. */
  readable?: boolean;
  defaultView?: 'readable' | 'code';
}> = ({ code, title, meta, lang, theme = 'dark', height = '28rem', format = true, summary = false, download, actions, empty = 'Nothing to show yet.', className, readable = false, defaultView = 'code' }) => {
  const [view, setView] = useState<'readable' | 'code'>(readable ? defaultView : 'code');
  const [wrap, setWrap] = useState(false);
  const [raw, setRaw] = useState(false);
  const [q, setQ] = useState('');
  const [copied, setCopied] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const language = lang || detectLang(code);
  const text = useMemo(() => (format && !raw ? formatCode(code) : code || ''), [code, format, raw]);
  const lines = useMemo(() => (text ? text.split('\n') : []), [text]);
  const check = useMemo(() => (summary ? checkMessage(code) : null), [summary, code]);
  const hits = useMemo(() => {
    if (!q) return [] as number[];
    const ql = q.toLowerCase();
    return lines.reduce<number[]>((a, l, i) => (l.toLowerCase().includes(ql) ? [...a, i] : a), []);
  }, [lines, q]);
  const [hit, setHit] = useState(0);
  const goto = (n: number) => {
    if (!hits.length) return;
    const i = ((n % hits.length) + hits.length) % hits.length;
    setHit(i);
    scroller.current?.querySelector(`[data-line="${hits[i]}"]`)?.scrollIntoView({ block: 'center' });
  };
  const dark = theme === 'dark';
  const bytes = new Blob([code || '']).size;
  const copy = () => navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); });
  const save = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: language === 'json' ? 'application/json' : language === 'xml' ? 'application/xml' : 'text/plain' }));
    a.download = download || `message.${language === 'json' ? 'json' : language === 'xml' ? 'xml' : 'txt'}`;
    a.click(); URL.revokeObjectURL(a.href);
  };
  const gutter = String(Math.max(1, lines.length)).length;

  return (
    <div className={`rounded-xl overflow-hidden flex flex-col min-w-0 ring-1 ${dark ? 'bg-[#0b1020] ring-slate-800' : 'bg-white ring-slate-200'} ${className || ''}`}>
      <div className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 border-b ${dark ? 'border-white/10 bg-white/[0.04]' : 'border-slate-200 bg-slate-50'}`}>
        <span className="flex items-center gap-1.5 mr-1" aria-hidden>
          {['bg-rose-400/80', 'bg-amber-400/80', 'bg-emerald-400/80'].map(c => <span key={c} className={`w-2.5 h-2.5 rounded-full ${dark ? c : 'bg-slate-300'}`} />)}
        </span>
        {title && <span className={`text-[12px] font-mono font-semibold truncate ${dark ? 'text-slate-200' : 'text-slate-700'}`}>{title}</span>}
        <span className={`px-1.5 rounded text-[10px] font-bold uppercase tracking-wider ${dark ? 'bg-white/10 text-slate-300' : 'bg-slate-200 text-slate-600'}`}>{language}</span>
        {code && <span className={`text-[11px] tabular-nums ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{lines.length} lines · {bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`}</span>}
        {meta}
        <span className="flex-1" />
        {readable && language !== 'text' && (
          <span role="tablist" aria-label="View" className={`inline-flex p-0.5 rounded-md ring-1 ring-inset ${dark ? 'ring-white/10 bg-white/5' : 'ring-slate-200 bg-slate-100'}`}>
            {(['readable', 'code'] as const).map(v => (
              <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}
                className={`h-6 px-2.5 rounded text-[11.5px] font-semibold transition-colors ${view === v ? (dark ? 'bg-white text-slate-900' : 'bg-white text-slate-900 shadow-sm') : (dark ? 'text-slate-300 hover:text-white' : 'text-slate-500 hover:text-slate-900')}`}>
                {v === 'readable' ? 'Readable' : language.toUpperCase()}
              </button>
            ))}
          </span>
        )}
        {view === 'code' && <>
        <span className={`inline-flex items-center h-7 rounded-md ring-1 ring-inset ${dark ? 'ring-white/10 bg-white/5' : 'ring-slate-200 bg-white'}`}>
          <input value={q} onChange={e => { setQ(e.target.value); setHit(0); }} onKeyDown={e => { if (e.key === 'Enter') goto(hit + (e.shiftKey ? -1 : 1)); }}
            placeholder="Find" aria-label="Find in message" className={`w-24 sm:w-32 h-full px-2 bg-transparent text-[11.5px] outline-none ${dark ? 'text-slate-200 placeholder:text-slate-500' : 'text-slate-700 placeholder:text-slate-400'}`} />
          {q && <span className={`pr-2 text-[10.5px] tabular-nums ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{hits.length ? `${hit + 1}/${hits.length}` : '0'}</span>}
        </span>
        {format && language !== 'text' && <Tool dark={dark} on={!raw} onClick={() => setRaw(r => !r)} title="Indent the message">Pretty</Tool>}
        <Tool dark={dark} on={wrap} onClick={() => setWrap(w => !w)}>Wrap</Tool>
        </>}
        <Tool dark={dark} onClick={copy} disabled={!code}>{copied ? 'Copied ✓' : 'Copy'}</Tool>
        {download !== undefined && <Tool dark={dark} onClick={save} disabled={!code}>Download</Tool>}
        {actions}
      </div>
      {summary && view === 'code' && <ResultStrip check={check} theme={theme} />}
      {view === 'readable' ? (
        <div className="overflow-auto bg-white" style={{ maxHeight: height }}><MessageReader code={code} /></div>
      ) : <div ref={scroller} className="overflow-auto font-mono text-[11.5px] leading-[1.6]" style={{ maxHeight: height }}>
        {!lines.length ? <p className={`px-4 py-10 text-center font-sans text-[12.5px] ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{empty}</p> : (
          <div className={`py-1.5 ${wrap ? '' : 'min-w-max'}`}>
            {lines.map((l, i) => {
              const isHit = hits.length > 0 && hits[hit] === i;
              return (
                <div key={i} data-line={i} className={`flex ${isHit ? (dark ? 'bg-amber-400/10' : 'bg-amber-50') : dark ? 'hover:bg-white/[0.03]' : 'hover:bg-slate-50'}`}>
                  <span className={`shrink-0 select-none text-right pl-3 pr-3 tabular-nums sticky left-0 ${dark ? 'text-slate-600 bg-[#0b1020]' : 'text-slate-300 bg-white'}`} style={{ width: `${gutter + 3}ch` }}>{i + 1}</span>
                  <span className={`pr-4 ${wrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'}`}>{highlightLine(l, language, theme, q)}{l === '' ? ' ' : null}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>}
    </div>
  );
};

export default CodeView;
