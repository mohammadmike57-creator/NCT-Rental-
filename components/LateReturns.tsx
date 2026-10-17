import React, { useMemo } from 'react';
import { Reservation } from '../types';
import { CheckCircleIcon, ShieldCheckIcon } from './icons';
import { Page, PageHeader, StatGrid, Panel, Badge, Plate, Button, EmptyState, table } from './ui/Crm';

interface LateReturnsProps {
  allData: any; // adjust based on your actual app structure
  onUpdateReservation: (reservation: Reservation) => void;
  // currentUser is still needed for display or other logic, but not for permission check
  currentUser?: any;
}

const formatDue = (value?: string) => {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const overdueLabel = (value?: string) => {
  if (!value) return '';
  const mins = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
  if (isNaN(mins) || mins < 0) return '';
  if (mins < 60) return `${mins} min late`;
  if (mins < 1440) return `${Math.floor(mins / 60)} h late`;
  const days = Math.floor(mins / 1440);
  return `${days} day${days === 1 ? '' : 's'} late`;
};

const overdueHours = (value?: string) => {
  const t = value ? new Date(value).getTime() : NaN;
  return isNaN(t) ? 0 : (Date.now() - t) / 3600000;
};

const LateReturns: React.FC<LateReturnsProps> = ({ allData, onUpdateReservation }) => {
  // Filter reservations that are late (endDate < now and not completed/dropped off)
  const lateReservations = useMemo(() => {
    const now = new Date();
    return Object.values(allData).flatMap((yearData: any) =>
      Object.values(yearData).flatMap((monthData: any) =>
        monthData.filter((r: Reservation) => {
          const end = new Date(r.endDate);
          return end < now && r.status !== 'COMPLETED' && !r.dropOffCompleted;
        })
      )
    );
  }, [allData]);

  const handleClose = (reservation: Reservation) => {
    // Mark as completed and drop off completed
    const updated = { ...reservation, status: 'COMPLETED', dropOffCompleted: true };
    onUpdateReservation(updated);
    alert(`Late return for ${reservation.personName} closed.`);
  };

  const sorted = useMemo(
    () => [...(lateReservations as Reservation[])].sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime()),
    [lateReservations]
  );

  const kpis = useMemo(() => {
    const hours = sorted.map(r => overdueHours(r.endDate));
    return {
      total: sorted.length,
      under24: hours.filter(h => h < 24).length,
      over24: hours.filter(h => h >= 24 && h < 72).length,
      over72: hours.filter(h => h >= 72).length,
    };
  }, [sorted]);

  const severity = (value?: string): 'danger' | 'warning' | 'muted' => {
    const h = overdueHours(value);
    if (h >= 72) return 'danger';
    if (h >= 24) return 'warning';
    return 'muted';
  };

  const renderClose = (res: Reservation, full?: boolean) => (
    <Button
      variant="primary"
      size="sm"
      onClick={() => handleClose(res)}
      icon={<CheckCircleIcon className="w-4 h-4 shrink-0" />}
      className={full ? 'w-full' : ''}
    >
      Close agreement
    </Button>
  );

  return (
    <Page>
      <PageHeader
        section="Financials & Incidents"
        title="Late Returns"
        subtitle="Rentals past their return time that have not been checked in."
      />

      <StatGrid items={[
        { label: 'Overdue', value: kpis.total, sub: 'open agreements', tone: kpis.total > 0 ? 'danger' : 'default' },
        { label: 'Under 24 h', value: kpis.under24, sub: 'recently due' },
        { label: '1 to 3 days', value: kpis.over24, sub: 'follow up', tone: kpis.over24 > 0 ? 'warning' : 'default' },
        { label: 'Over 3 days', value: kpis.over72, sub: 'escalate', tone: kpis.over72 > 0 ? 'danger' : 'default' },
      ]} />

      <Panel
        title={<>Overdue agreements <span className="ml-1 text-slate-400 font-normal tabular-nums">{sorted.length}</span></>}
        subtitle="Most overdue first"
      >
        {sorted.length === 0 ? (
          <EmptyState
            icon={<ShieldCheckIcon />}
            title="No late returns"
            hint="Every rental past its return time has been checked in."
          />
        ) : (
          <>
            {/* Desktop table */}
            <table className={`hidden md:table ${table.wrap}`}>
              <thead className={table.head}>
                <tr>
                  <th className={table.th}>Renter</th>
                  <th className={table.th}>Booking ID</th>
                  <th className={table.th}>Vehicle</th>
                  <th className={table.th}>Return due</th>
                  <th className={table.th}>Overdue</th>
                  <th className={table.th}><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className={table.body}>
                {sorted.map(res => (
                  <tr key={res.id} className={table.row}>
                    <td className={`${table.td} font-semibold text-slate-900`}>{res.personName}</td>
                    <td className={`${table.td} whitespace-nowrap font-mono text-xs text-slate-600`}>{res.bookingId || '—'}</td>
                    <td className={`${table.td} text-slate-600`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate">{res.carModel}</span>
                        <Plate value={res.licensePlate} />
                      </div>
                    </td>
                    <td className={`${table.td} text-slate-600 tabular-nums whitespace-nowrap`}>{formatDue(res.endDate)}</td>
                    <td className={table.td}><Badge tone={severity(res.endDate)}>{overdueLabel(res.endDate) || 'Overdue'}</Badge></td>
                    <td className={`${table.td} text-right whitespace-nowrap`}>{renderClose(res)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile list */}
            <ul className="md:hidden divide-y divide-slate-100">
              {sorted.map(res => (
                <li key={res.id} className="px-4 py-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-slate-900 truncate">{res.personName}</p>
                      <p className="mt-0.5 text-xs text-slate-500 truncate">
                        {res.bookingId && <span className="font-mono">{res.bookingId} · </span>}{res.carModel}
                      </p>
                    </div>
                    <Badge tone={severity(res.endDate)} className="shrink-0">{overdueLabel(res.endDate) || 'Overdue'}</Badge>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span>Due <span className="font-medium text-slate-700 tabular-nums">{formatDue(res.endDate)}</span></span>
                    <Plate value={res.licensePlate} />
                  </div>
                  {renderClose(res, true)}
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>
    </Page>
  );
};

export default LateReturns;
