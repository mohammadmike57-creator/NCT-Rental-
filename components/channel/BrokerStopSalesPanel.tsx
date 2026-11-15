import React from 'react';
import { Aggregator } from '../../types';
import { removeBrokerStopSale, todayIso } from '../../services/channelManager';
import { displayDay } from '../../services/displayDate';
import { Panel, Button, table } from '../ui/Crm';

/**
 * OTA XML → Stop sales: the stop sales kept in each broker's Price rules, next to the general ones, so every
 * stop sale is in one place. Remove takes it off at once (live and draft), without a Publish.
 */
const BrokerStopSalesPanel: React.FC<{ aggregators: Aggregator[]; onUpdate: (a: Aggregator) => void; currentUserName?: string; notify?: (m: string) => void }> = ({ aggregators, onUpdate, currentUserName, notify }) => {
  const today = todayIso();
  const rows = aggregators.flatMap(a => (a.bookingRules?.commercial?.blackouts || [])
    .filter(b => b.from && (b.to || b.from) >= today)
    .map(b => ({ a, b })));
  if (!rows.length) return null;
  return (
    <Panel title="Stop sales in brokers' Price rules" subtitle={`${rows.length} stop sale${rows.length === 1 ? '' : 's'} set on a single broker. They close cars for that broker even when cars are free.`}>
      <div data-testid="broker-stop-sales">
        <table className={`hidden md:table ${table.wrap}`}>
          <thead className={table.head}><tr><th className={table.th}>Broker</th><th className={table.th}>Period</th><th className={table.th}>Car groups</th><th className={table.th}>Reason</th><th className={`${table.th} text-right`}>Action</th></tr></thead>
          <tbody className={table.body}>
            {rows.map(({ a, b }, i) => (
              <tr key={`${a.id}-${i}`} className={table.row}>
                <td className={`${table.td} font-semibold text-slate-900`}>{a.name}</td>
                <td className={`${table.td} whitespace-nowrap tabular-nums text-slate-700`}>{displayDay(b.from)} &rarr; {displayDay(b.to || b.from)}</td>
                <td className={`${table.td} text-slate-600`}>{b.groups?.length ? b.groups.join(', ') : 'Every car group'}</td>
                <td className={`${table.td} text-slate-600`}>{b.note || '-'}</td>
                <td className={`${table.td} text-right`}>
                  <Button size="sm" variant="ghost" className="hover:!text-rose-600 hover:!bg-rose-50" aria-label={`Remove ${a.name} stop sale ${b.from}`}
                    onClick={() => { onUpdate(removeBrokerStopSale(a, b, currentUserName)); notify?.(`Stop sale removed from ${a.name}: the next search already uses it.`); }}>Remove</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="md:hidden divide-y divide-slate-100">
          {rows.map(({ a, b }, i) => (
            <li key={`${a.id}-${i}`} className="px-4 py-3 flex items-start gap-3">
              <div className="min-w-0 flex-1 text-[13px]">
                <p className="font-semibold text-slate-900">{a.name}</p>
                <p className="text-xs text-slate-600 tabular-nums">{displayDay(b.from)} &rarr; {displayDay(b.to || b.from)} · {b.groups?.length ? b.groups.join(', ') : 'Every car group'}</p>
                {b.note && <p className="text-xs text-slate-500">{b.note}</p>}
              </div>
              <Button size="sm" variant="ghost" onClick={() => { onUpdate(removeBrokerStopSale(a, b, currentUserName)); notify?.(`Stop sale removed from ${a.name}.`); }}>Remove</Button>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
};

export default BrokerStopSalesPanel;
