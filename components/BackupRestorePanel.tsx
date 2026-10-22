import React, { useEffect, useState } from 'react';
import { Panel, Button, Badge } from './ui/Crm';
import { DataBackup, listBackups, restoreBackup } from '../firebase/api';

/** Turns "auto-2026-10-22T09-15-02.123Z" into a readable local date and time. */
const whenOf = (id: string) => {
  const m = id.match(/(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})/);
  if (!m) return id;
  const d = new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4]}Z`);
  return Number.isNaN(d.getTime()) ? id : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

/**
 * Administrator tool: the server keeps a full copy of the data every hour while it changes, and
 * before every clean-up or restore. Any of them can be put back; the current data is kept first.
 */
const BackupRestorePanel: React.FC<{ onRestored: () => Promise<void> }> = ({ onRestored }) => {
  const [list, setList] = useState<DataBackup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  const load = () => listBackups().then(setList).catch(e => setError(e?.response?.data?.error || 'Backups could not be loaded.'));
  useEffect(() => { load(); }, []);

  const restore = async (id: string) => {
    setBusy(id);
    try {
      await restoreBackup(id);
      setConfirm(null);
      await onRestored();
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'The backup could not be restored.');
    } finally { setBusy(null); }
  };

  return (
    <Panel>
      <div className="p-4 space-y-3">
        <div>
          <p className="text-[13px] font-semibold text-slate-900">Restore a backup</p>
          <p className="text-[13px] text-slate-500">The server keeps a full copy of all data every hour while it changes, and before every clean-up or restore. Restoring puts that copy back; today's data is kept as a backup first, so nothing is lost.</p>
        </div>
        {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
        {list === null && !error && <p className="text-xs text-slate-500">Loading backups…</p>}
        {list && list.length === 0 && <p className="text-xs text-slate-500">No backups yet. The first one is made with the next change.</p>}
        {list && list.length > 0 && (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 max-h-80 overflow-y-auto">
            {list.map(b => (
              <li key={b.id} className="px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-slate-900 tabular-nums">{whenOf(b.id)} <Badge tone={b.kind === 'automatic' ? 'muted' : 'info'} className="ml-1">{b.kind === 'automatic' ? 'Hourly' : b.id.includes('before-restore') ? 'Before restore' : 'Before clean-up'}</Badge></p>
                  <p className="text-xs text-slate-500 tabular-nums">{b.bookings ?? 0} bookings · {b.fleet ?? 0} cars · {b.sources ?? 0} sources{b.company ? ` · ${b.company}` : ''}</p>
                </div>
                {confirm === b.id ? (
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-slate-600">Replace the current data?</span>
                    <Button size="sm" variant="danger" disabled={!!busy} onClick={() => restore(b.id)}>{busy === b.id ? 'Restoring…' : 'Yes, restore'}</Button>
                    <Button size="sm" onClick={() => setConfirm(null)}>Cancel</Button>
                  </span>
                ) : (
                  <Button size="sm" onClick={() => setConfirm(b.id)} disabled={!!busy}>Restore</Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
};

export default BackupRestorePanel;
