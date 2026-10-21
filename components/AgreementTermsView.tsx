import React, { useEffect, useMemo, useState } from 'react';
import { CompanyDetails, User } from '../types';
import { DEFAULT_AGREEMENT_TERMS, DEFAULT_AGREEMENT_TERMS_AR, TermsClause, parseTerms, parseTermsAr } from '../services/agreementTerms';
import { Page, PageHeader, Panel, Badge, Button, Segmented, inputCls, textareaCls } from './ui/Crm';
import { PlusIcon } from './icons';

interface Props {
  details: CompanyDetails;
  currentUser: User | null;
  onSave: (details: CompanyDetails) => Promise<void>;
}

type Row = { id: string; en: TermsClause; ar: TermsClause };

const blank = (): TermsClause => ({ title: '', body: '' });
let seq = 0;
const newId = () => `c${Date.now().toString(36)}${(seq++).toString(36)}`;

const toRows = (en: TermsClause[], ar: TermsClause[]): Row[] =>
  Array.from({ length: Math.max(en.length, ar.length) }, (_, i) => ({ id: newId(), en: en[i] || blank(), ar: ar[i] || blank() }));

/** Same text format the agreement reads: one clause per paragraph, first line is the title. */
const serialize = (clauses: TermsClause[]) => clauses
  .map(c => ({ title: c.title.replace(/\s*\n\s*/g, ' ').trim(), body: c.body.replace(/\n\s*\n+/g, '\n').trim() }))
  .filter(c => c.title || c.body)
  .map(c => (c.title ? `${c.title}\n${c.body}` : c.body))
  .join('\n\n');

const sameText = (a: string, b: string) => a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim();

const when = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

/** Administration page for the Terms and Conditions printed on the back of every rental agreement. */
const AgreementTermsView: React.FC<Props> = ({ details, currentUser, onSave }) => {
  const initial = useMemo(() => toRows(parseTerms(details.agreementTerms), parseTermsAr(details.agreementTermsAr)), [details.agreementTerms, details.agreementTermsAr]);
  const [rows, setRows] = useState<Row[]>(initial);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [saving, setSaving] = useState(false);
  useEffect(() => { setRows(initial); }, [initial]);

  const en = serialize(rows.map(r => r.en));
  const ar = serialize(rows.map(r => r.ar));
  const savedEn = serialize(parseTerms(details.agreementTerms));
  const savedAr = serialize(parseTermsAr(details.agreementTermsAr));
  const dirty = !sameText(en, savedEn) || !sameText(ar, savedAr);
  const isStandard = sameText(en, DEFAULT_AGREEMENT_TERMS) && sameText(ar, DEFAULT_AGREEMENT_TERMS_AR);
  const untranslated = rows.filter(r => !!(r.en.title || r.en.body) !== !!(r.ar.title || r.ar.body)).length;

  const set = (id: string, lang: 'en' | 'ar', patch: Partial<TermsClause>) =>
    setRows(rs => rs.map(r => (r.id === id ? { ...r, [lang]: { ...r[lang], ...patch } } : r)));
  const move = (i: number, d: -1 | 1) => setRows(rs => {
    const j = i + d;
    if (j < 0 || j >= rs.length) return rs;
    const next = [...rs];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const remove = (id: string) => {
    const r = rows.find(x => x.id === id);
    if (r && (r.en.body || r.ar.body) && !window.confirm(`Remove the clause "${r.en.title || r.ar.title || 'untitled'}" in both languages?`)) return;
    setRows(rs => rs.filter(x => x.id !== id));
  };
  const add = () => setRows(rs => [...rs, { id: newId(), en: blank(), ar: blank() }]);
  const resetStandard = () => {
    if (!window.confirm('Replace the current text with the standard terms in English and Arabic? Nothing is saved until you click Save changes.')) return;
    setRows(toRows(parseTerms(DEFAULT_AGREEMENT_TERMS), parseTermsAr(DEFAULT_AGREEMENT_TERMS_AR)));
  };
  const discard = () => setRows(initial);
  const save = async () => {
    if (!rows.some(r => r.en.body.trim())) { window.alert('Add at least one clause before saving.'); return; }
    setSaving(true);
    try {
      await onSave({
        ...details,
        // Empty means "standard terms", so later improvements to the standard text reach this company too.
        agreementTerms: sameText(en, DEFAULT_AGREEMENT_TERMS) ? '' : en,
        agreementTermsAr: sameText(ar, DEFAULT_AGREEMENT_TERMS_AR) ? '' : ar,
        agreementTermsUpdatedAt: new Date().toISOString(),
        agreementTermsUpdatedBy: currentUser?.fullName || currentUser?.email || undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const enClauses = rows.map(r => r.en).filter(c => c.title || c.body);
  const arClauses = rows.map(r => r.ar).filter(c => c.title || c.body);

  return (
    <Page>
      <PageHeader
        section="Administration"
        title={<>Agreement Terms <span lang="ar" dir="rtl" className="ar-ui ml-2 !text-[18px] !text-slate-500">شروط العقد</span></>}
        subtitle="The Terms and Conditions printed on the back of every rental agreement, in English and Arabic. Changes apply to agreements printed or emailed after you save."
        actions={
          <>
            <Segmented value={mode} onChange={k => setMode(k as typeof mode)} options={[{ key: 'edit', label: 'Edit' }, { key: 'preview', label: 'Preview' }]} />
            <Button variant="primary" onClick={save} disabled={!dirty || saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[13px]">
        {isStandard ? <Badge tone="info">Standard terms</Badge> : <Badge tone="success">Customised terms</Badge>}
        <span className="text-slate-600"><b className="text-slate-900 tabular-nums">{enClauses.length}</b> clause{enClauses.length === 1 ? '' : 's'}</span>
        {untranslated > 0 && <Badge tone="warning">{untranslated} clause{untranslated === 1 ? '' : 's'} missing a translation</Badge>}
        {details.agreementTermsUpdatedAt && (
          <span className="text-slate-500">Last updated {when(details.agreementTermsUpdatedAt)}{details.agreementTermsUpdatedBy ? ` by ${details.agreementTermsUpdatedBy}` : ''}</span>
        )}
        <span className="flex-1" />
        {dirty && <Badge tone="warning">Unsaved changes</Badge>}
        {dirty && <button type="button" onClick={discard} className="text-xs font-semibold text-slate-500 hover:text-slate-800">Discard</button>}
        {!isStandard && <button type="button" onClick={resetStandard} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">Reset to standard</button>}
      </div>

      {mode === 'edit' ? (
        <div className="space-y-3">
          <div className="hidden md:grid grid-cols-2 gap-4 px-14 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <span>English</span>
            <span className="text-right normal-case tracking-normal"><span lang="ar" dir="rtl" className="ar-ui !text-[13px]">العربية</span></span>
          </div>
          {rows.map((r, i) => {
            const missing = !!(r.en.title || r.en.body) !== !!(r.ar.title || r.ar.body);
            return (
              <section key={r.id} className={`rounded-xl border bg-white shadow-sm ${missing ? 'border-amber-200' : 'border-slate-200'}`}>
                <header className="flex items-center gap-2 px-3 sm:px-4 py-2 border-b border-slate-100 bg-slate-50/70 rounded-t-xl">
                  <span className="w-7 h-7 rounded-lg bg-slate-900 text-white text-xs font-bold tabular-nums flex items-center justify-center shrink-0">{i + 1}</span>
                  <p className="min-w-0 flex-1 text-[13px] font-semibold text-slate-800 truncate">{r.en.title || r.ar.title || 'Untitled clause'}</p>
                  {missing && <Badge tone="warning">Translation missing</Badge>}
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="w-8 h-8 rounded-md text-slate-500 hover:bg-white hover:text-slate-900 disabled:opacity-30">↑</button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label="Move down" className="w-8 h-8 rounded-md text-slate-500 hover:bg-white hover:text-slate-900 disabled:opacity-30">↓</button>
                    <button type="button" onClick={() => remove(r.id)} className="h-8 px-2.5 rounded-md text-xs font-semibold text-rose-600 hover:bg-rose-50">Remove</button>
                  </div>
                </header>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 p-3 sm:p-4">
                  <div className="space-y-2 min-w-0">
                    <p className="md:hidden text-[11px] font-semibold uppercase tracking-wider text-slate-500">English</p>
                    <input className={`${inputCls} font-semibold`} value={r.en.title} placeholder="Clause title, e.g. Fuel and mileage" onChange={e => set(r.id, 'en', { title: e.target.value })} />
                    <textarea className={`${textareaCls} leading-relaxed`} rows={5} value={r.en.body} placeholder="Clause text" onChange={e => set(r.id, 'en', { body: e.target.value })} />
                  </div>
                  <div className="space-y-2 min-w-0" lang="ar" dir="rtl">
                    <p className="md:hidden ar-ui !text-[13px]">العربية</p>
                    <input className={`${inputCls} ar-ui !text-slate-900 !font-semibold`} value={r.ar.title} placeholder="عنوان البند" onChange={e => set(r.id, 'ar', { title: e.target.value })} />
                    <textarea className={`${textareaCls} ar-ui !text-slate-800 !font-normal leading-relaxed`} rows={5} value={r.ar.body} placeholder="نص البند" onChange={e => set(r.id, 'ar', { body: e.target.value })} />
                  </div>
                </div>
              </section>
            );
          })}
          <button type="button" onClick={add}
            className="w-full h-12 rounded-xl border-2 border-dashed border-slate-300 text-[13px] font-semibold text-slate-600 hover:border-indigo-400 hover:text-indigo-700 hover:bg-indigo-50/40 inline-flex items-center justify-center gap-2">
            <PlusIcon className="w-4 h-4" /> Add clause
          </button>
        </div>
      ) : (
        <Panel padded>
          <div className="mx-auto max-w-4xl">
            <div className="flex items-end justify-between border-b-[3px] border-slate-900 pb-2 mb-4">
              <h2 className="text-lg font-extrabold uppercase tracking-wide text-slate-900">Terms and Conditions of Rental
                <span lang="ar" dir="rtl" className="ar-ui block !text-[17px] !text-slate-900 !font-bold">شروط وأحكام التأجير</span>
              </h2>
              <span className="text-xs text-slate-500">{details.name}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-[12.5px] leading-relaxed text-slate-700">
              <div>
                {enClauses.map((c, n) => (
                  <div key={n} className="mb-3 text-justify">
                    {c.title && <h4 className="text-[12px] font-bold uppercase tracking-wide text-slate-900 border-b border-slate-200 pb-0.5 mb-1"><span className="text-slate-400 mr-1">{n + 1}.</span>{c.title}</h4>}
                    <p>{c.body}</p>
                  </div>
                ))}
              </div>
              <div lang="ar" dir="rtl" className="md:border-l md:border-slate-200 md:pl-0 md:pr-6 ar-ui !text-slate-700 !font-normal !text-[13.5px] leading-loose">
                {arClauses.map((c, n) => (
                  <div key={n} className="mb-3 text-justify">
                    {c.title && <h4 className="font-bold text-slate-900 border-b border-slate-200 pb-0.5 mb-1"><span className="text-slate-400 ml-1">{n + 1}.</span>{c.title}</h4>}
                    <p>{c.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Panel>
      )}

      {dirty && (
        <div className="sticky bottom-3 z-10 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/95 backdrop-blur px-4 py-3 shadow-lg">
          <p className="text-[13px] text-slate-600">You have unsaved changes to the agreement terms.</p>
          <div className="flex gap-2">
            <Button onClick={discard} disabled={saving}>Discard</Button>
            <Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
          </div>
        </div>
      )}
    </Page>
  );
};

export default AgreementTermsView;
