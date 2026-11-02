import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import { Fleet, RatePlan } from '../../types';
import { Button, Dialog } from '../ui/Crm';
import { formatMoney } from '../../services/channelManager';
import { RateImport, mergeImportedPlans, parseRateSheet, rateSheetRows } from '../../services/rateExcel';
import { bandLabel, bandsOf, matrixOf } from '../../services/rateBuilder';

const HOW_TO = [
  ['How to fill in this sheet'],
  [''],
  ['One row per period and car group. Rows with the same Period name, From and To make one period.'],
  ['Period', 'Name of the season, e.g. Summer 2027.'],
  ['From / To', 'First and last pick-up date of the period, e.g. 2027-06-01 or 01/06/2027. Periods must not overlap.'],
  ['Car group', 'The SIPP code of the group, e.g. CDAR. It must match the groups in Fleet Management.'],
  ['1-2, 3-6, …, 30+', 'Daily price for that rental length. The whole rental is charged at the price of the band its length falls in.'],
  [''],
  ['Empty cell', 'That rental length is not sold for that group in that period.'],
  ['Columns', 'You can change the bands: name a column like 1-3, 4-7, 8+ . They must start at 1, follow on without gaps, and the last one must end with +.'],
  ['Upload', 'OTA XML › channel › Rates › Excel › Upload. You see a preview and the checks first; nothing changes until you apply.'],
];

/** Download the rates as Excel, upload them back with a preview and checks. */
const RateExcelDialog: React.FC<{
  plans: RatePlan[];
  fleet: Fleet;
  currency: string;
  channelName: string;
  onApply: (plans: RatePlan[], summary: string) => void;
  onClose: () => void;
}> = ({ plans, fleet, currency, channelName, onApply, onClose }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<(RateImport & { file: string }) | null>(null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [readError, setReadError] = useState('');
  const fleetGroups = [...new Set(fleet.map(v => (v.sippCode || '').toUpperCase()).filter(Boolean))].sort();

  const download = () => {
    const wb = XLSX.utils.book_new();
    const rows = rateSheetRows(plans, fleetGroups);
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = rows[0].map((_, i) => ({ wch: i === 0 ? 22 : i < 3 ? 12 : i === 3 ? 11 : 9 }));
    ws['!freeze'] = { xSplit: 4, ySplit: 1 };
    XLSX.utils.book_append_sheet(wb, ws, 'Rates');
    const help = XLSX.utils.aoa_to_sheet(HOW_TO);
    help['!cols'] = [{ wch: 18 }, { wch: 110 }];
    XLSX.utils.book_append_sheet(wb, help, 'How to fill in');
    XLSX.writeFile(wb, `Rates-${channelName.replace(/[^A-Za-z0-9]+/g, '-')}-${currency}.xlsx`);
  };

  const read = async (f: File) => {
    setReadError(''); setResult(null);
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { cellDates: true });
      const name = wb.SheetNames.find(n => /rate/i.test(n)) || wb.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: null });
      setResult({ ...parseRateSheet(rows, fleetGroups), file: f.name });
    } catch {
      setReadError('This file could not be read. Save it as .xlsx (or .csv) and try again.');
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const apply = () => {
    if (!result || result.errors.length || !result.plans.length) return;
    const next = mergeImportedPlans(plans, result.plans, mode === 'replace');
    const names = new Set(plans.map(p => p.name.trim().toLowerCase()));
    const updated = result.plans.filter(p => names.has(p.name.trim().toLowerCase())).length;
    const added = result.plans.length - updated;
    const removed = mode === 'replace' ? plans.filter(p => !result.plans.some(q => q.name.trim().toLowerCase() === p.name.trim().toLowerCase())).length : 0;
    onApply(next, [updated && `${updated} updated`, added && `${added} added`, removed && `${removed} removed`].filter(Boolean).join(', ') || 'no changes');
  };

  const blocking = !!result && (result.errors.length > 0 || result.plans.length === 0);

  return createPortal(
    <div className="relative z-[100]">
      <Dialog open onClose={onClose} size="wide" title="Rates in Excel"
        subtitle={`Download the rates of ${channelName}, change them in Excel, and upload the file. Nothing changes until you apply, and brokers see the new prices only after you publish.`}
        footer={<>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={apply} disabled={!result || blocking}>
            {result && !blocking ? `Apply ${result.plans.length} period${result.plans.length === 1 ? '' : 's'} to the draft` : 'Apply to the draft'}
          </Button>
        </>}>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="text-[13px] font-semibold text-slate-900">1. Download</p>
              <p className="text-xs text-slate-500 mt-1">{plans.length ? `Your ${plans.length} current period${plans.length === 1 ? '' : 's'}, one row per car group, one column per rental length.` : 'An example to fill in, with your car groups.'} A second sheet explains every column.</p>
              <Button className="mt-3" onClick={download}>Download Excel</Button>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="text-[13px] font-semibold text-slate-900">2. Upload</p>
              <p className="text-xs text-slate-500 mt-1">The edited file (.xlsx, .xls or .csv). You see what will change and every problem before anything is saved.</p>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void read(f); }} />
              <Button className="mt-3" variant="primary" onClick={() => fileRef.current?.click()}>Upload Excel</Button>
            </div>
          </div>

          {readError && <p className="text-xs px-3 py-2 rounded-md border bg-rose-50 border-rose-200 text-rose-800">{readError}</p>}

          {result && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="font-semibold text-slate-900">{result.file}</span>
                <span className="text-slate-500">· {result.rows} row{result.rows === 1 ? '' : 's'} · {result.plans.length} period{result.plans.length === 1 ? '' : 's'}</span>
                {result.errors.length > 0
                  ? <span className="ml-auto text-rose-700 font-semibold">{result.errors.length} problem{result.errors.length === 1 ? '' : 's'} to fix in the file</span>
                  : <span className="ml-auto text-emerald-700 font-semibold">Ready to apply</span>}
              </div>

              {result.errors.length > 0 && (
                <ul className="space-y-1 text-xs max-h-48 overflow-y-auto">
                  {result.errors.slice(0, 30).map((m, i) => <li key={i} className="px-3 py-1.5 rounded-md border bg-rose-50 border-rose-200 text-rose-800">{m}</li>)}
                  {result.errors.length > 30 && <li className="text-slate-500 px-1">…and {result.errors.length - 30} more.</li>}
                </ul>
              )}

              {result.plans.length > 0 && (
                <div className="space-y-3">
                  {result.plans.map(p => {
                    const bands = bandsOf(p), m = matrixOf(p, bands);
                    const exists = plans.some(q => q.name.trim().toLowerCase() === p.name.trim().toLowerCase());
                    return (
                      <div key={p.id} className="rounded-lg border border-slate-200 overflow-hidden">
                        <div className="px-3 py-2 bg-slate-50 flex flex-wrap items-center gap-2 text-[13px]">
                          <span className="font-semibold text-slate-900">{p.name}</span>
                          <span className="font-mono text-[11px] text-slate-500">{p.startDate} → {p.endDate}</span>
                          <span className={`ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-full ${exists ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{exists ? 'Updates the period with this name' : 'New period'}</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[520px] text-[12px]">
                            <thead><tr className="text-slate-500"><th className="text-left px-3 py-1.5 font-semibold">Group</th>{bands.map((b, i) => <th key={i} className="text-right px-3 py-1.5 font-semibold whitespace-nowrap">{bandLabel(b)}</th>)}</tr></thead>
                            <tbody className="divide-y divide-slate-100">
                              {p.sippRates.map(r => <tr key={r.id}><td className="px-3 py-1.5 font-mono font-semibold">{r.sippCode}</td>{bands.map((_, i) => <td key={i} className="px-3 py-1.5 text-right tabular-nums">{m[r.sippCode]?.[i] != null ? formatMoney(m[r.sippCode][i] as number, currency) : <span className="text-slate-300">—</span>}</td>)}</tr>)}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {result.warnings.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-amber-800 font-semibold">{result.warnings.length} warning{result.warnings.length === 1 ? '' : 's'} (you can still apply)</summary>
                  <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto">{result.warnings.slice(0, 40).map((m, i) => <li key={i} className="px-3 py-1.5 rounded-md border bg-amber-50 border-amber-200 text-amber-900">{m}</li>)}</ul>
                </details>
              )}

              {!blocking && (
                <fieldset className="rounded-lg border border-slate-200 p-3 space-y-2 text-[13px]">
                  <legend className="px-1 text-xs font-semibold text-slate-600">Your other periods</legend>
                  <label className="flex items-start gap-2"><input type="radio" className="mt-1" checked={mode === 'merge'} onChange={() => setMode('merge')} />
                    <span>Keep them<span className="block text-xs text-slate-500">Periods in the file replace the ones with the same name; new ones are added; the rest stay as they are.</span></span></label>
                  <label className="flex items-start gap-2"><input type="radio" className="mt-1" checked={mode === 'replace'} onChange={() => setMode('replace')} />
                    <span>Replace everything with the file<span className="block text-xs text-slate-500">Periods that are not in the file are removed from the draft.</span></span></label>
                </fieldset>
              )}
            </div>
          )}
        </div>
      </Dialog>
    </div>,
    document.body,
  );
};

export default RateExcelDialog;
