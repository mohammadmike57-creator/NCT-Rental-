import React, { useState } from 'react';
import { Panel, Button, Badge, inputCls } from './ui/Crm';

export interface CleanupSection { key: string; label: string; hint: string; count: number; defaultOn: boolean }

interface Props {
  sections: CleanupSection[];
  onClear: (keys: string[]) => Promise<void>;
}

/**
 * Administrator tool to start the system clean: clears the chosen data after a full backup is
 * downloaded and kept on the server. Company details, agreement terms, staff and settings stay.
 */
const DataCleanupPanel: React.FC<Props> = ({ sections, onClear }) => {
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(sections.filter(s => s.defaultOn).map(s => s.key)));
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const toggle = (k: string) => setChosen(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const total = sections.filter(s => chosen.has(s.key)).reduce((n, s) => n + s.count, 0);
  const ready = chosen.size > 0 && typed.trim().toUpperCase() === 'DELETE' && !busy;

  const run = async () => {
    if (!ready) return;
    if (!window.confirm(`Permanently clear ${chosen.size} section${chosen.size === 1 ? '' : 's'} (${total} record${total === 1 ? '' : 's'})? A backup is downloaded and kept on the server first.`)) return;
    setBusy(true);
    try { await onClear(Array.from(chosen)); setTyped(''); } finally { setBusy(false); }
  };

  return (
    <Panel className="border-rose-200">
      <div className="p-4 space-y-4">
        <div>
          <p className="text-[13px] font-semibold text-slate-900">Clean up data</p>
          <p className="text-[13px] text-slate-500">Start fresh by clearing the data you choose. A full backup is downloaded to this computer and kept on the server before anything is removed.</p>
        </div>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {sections.map(s => {
            const on = chosen.has(s.key);
            return (
              <li key={s.key}>
                <label className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${on ? 'border-rose-300 bg-rose-50/60' : 'border-slate-200 hover:border-slate-300'}`}>
                  <input type="checkbox" className="mt-0.5 rounded border-slate-300 text-rose-600" checked={on} onChange={() => toggle(s.key)} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2 text-[13px] font-semibold text-slate-900">{s.label}<Badge tone={s.count ? 'muted' : 'default'} dot={false}>{s.count}</Badge></span>
                    <span className="block text-xs text-slate-500">{s.hint}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        <p className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800">
          <b>Always kept:</b> company details, agreement terms, staff accounts and permissions, booking sources, branches, extras, years, email settings, OTA channels and the activity log.
        </p>
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <label className="block flex-1 min-w-0">
            <span className="block text-xs font-medium text-slate-600 mb-1">Type <b>DELETE</b> to confirm</span>
            <input className={inputCls} value={typed} onChange={e => setTyped(e.target.value)} placeholder="DELETE" autoComplete="off" />
          </label>
          <Button variant="danger" onClick={run} disabled={!ready} className="shrink-0">
            {busy ? 'Backing up and clearing…' : `Clear ${chosen.size} section${chosen.size === 1 ? '' : 's'}`}
          </Button>
        </div>
      </div>
    </Panel>
  );
};

export default DataCleanupPanel;
