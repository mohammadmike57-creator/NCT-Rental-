import React, { useMemo } from 'react';
import { Reservation } from '../types';
import { ClockIcon, CheckCircleIcon, ShieldCheckIcon } from './icons';

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

  const severity = (value?: string) => {
    const h = overdueHours(value);
    if (h >= 72) return 'bg-rose-50 text-rose-700 ring-rose-200';
    if (h >= 24) return 'bg-amber-50 text-amber-700 ring-amber-200';
    return 'bg-slate-100 text-slate-600 ring-slate-200';
  };

  const renderClose = (res: Reservation, full?: boolean) => (
    <button
      onClick={() => handleClose(res)}
      className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 shadow-sm whitespace-nowrap ${full ? 'w-full' : ''}`}
    >
      <CheckCircleIcon className="w-4 h-4 shrink-0" /> Close agreement
    </button>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="p-5 sm:p-6 flex items-center gap-4 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
            <ClockIcon className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Late returns</h2>
            <p className="text-sm text-slate-500">Rentals past their return time that have not been checked in.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 border-t border-slate-100 divide-x divide-y lg:divide-y-0 divide-slate-100">
          {[
            { label: 'Overdue', value: kpis.total, sub: 'open agreements', tone: kpis.total > 0 ? 'text-rose-600' : 'text-slate-900' },
            { label: 'Under 24 h', value: kpis.under24, sub: 'recently due', tone: 'text-slate-900' },
            { label: '1 to 3 days', value: kpis.over24, sub: 'follow up', tone: kpis.over24 > 0 ? 'text-amber-600' : 'text-slate-900' },
            { label: 'Over 3 days', value: kpis.over72, sub: 'escalate', tone: kpis.over72 > 0 ? 'text-rose-600' : 'text-slate-900' },
          ].map(k => (
            <div key={k.label} className="px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{k.label}</p>
              <p className={`mt-1 text-2xl font-bold tabular-nums ${k.tone}`}>{k.value}</p>
              <p className="text-xs text-slate-400">{k.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 sm:p-16 text-center">
          <div className="mx-auto w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <ShieldCheckIcon className="w-6 h-6" />
          </div>
          <p className="mt-4 font-semibold text-slate-800">No late returns</p>
          <p className="text-sm text-slate-500">Every rental past its return time has been checked in.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Overdue · {sorted.length}</span>
            <span className="text-xs text-slate-400">Most overdue first</span>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3 text-left font-semibold">Renter</th>
                  <th className="px-5 py-3 text-left font-semibold">Booking ID</th>
                  <th className="px-5 py-3 text-left font-semibold">Vehicle</th>
                  <th className="px-5 py-3 text-left font-semibold">Return due</th>
                  <th className="px-5 py-3 text-left font-semibold">Overdue</th>
                  <th className="px-5 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.map(res => (
                  <tr key={res.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-5 py-3.5 text-sm font-semibold text-slate-900 whitespace-nowrap">{res.personName}</td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 font-mono text-xs text-slate-600">{res.bookingId || '—'}</span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-slate-600 whitespace-nowrap">
                      {res.carModel}
                      {res.licensePlate && <span className="ml-1.5 text-xs text-slate-400">{res.licensePlate}</span>}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-slate-600 tabular-nums whitespace-nowrap">{formatDue(res.endDate)}</td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${severity(res.endDate)}`}>{overdueLabel(res.endDate) || 'Overdue'}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right whitespace-nowrap">{renderClose(res)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="md:hidden divide-y divide-slate-100">
            {sorted.map(res => (
              <li key={res.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{res.personName}</p>
                    <p className="mt-0.5 text-xs text-slate-500 truncate">
                      {res.bookingId && <span className="font-mono">{res.bookingId} · </span>}{res.carModel}{res.licensePlate ? ` (${res.licensePlate})` : ''}
                    </p>
                  </div>
                  <span className={`shrink-0 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${severity(res.endDate)}`}>{overdueLabel(res.endDate) || 'Overdue'}</span>
                </div>
                <p className="text-xs text-slate-500">Return due <span className="font-semibold text-slate-700 tabular-nums">{formatDue(res.endDate)}</span></p>
                {renderClose(res, true)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default LateReturns;
