
import React, { useState, useMemo, useEffect } from 'react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { Reservation, ReservationStatus } from '../types';
import { MONTHS, USD_TO_JOD_RATE } from '../constants';
import { PdfIcon } from './icons';

interface SourcePerformanceReportProps {
  reservations: Reservation[];
  year: number;
  month: string;
}

interface SourceRow {
  source: string;
  total: number;
  confirmed: number;
  pending: number;
  cancelled: number;
  noShow: number;
  revenue: number;
  prevRevenue: number;
}

type Preset = 'month' | 'lastMonth' | 'quarter' | 'ytd' | 'year' | 'custom';
type SortKey = 'source' | 'total' | 'confirmed' | 'conversion' | 'cancelled' | 'noShow' | 'revenue' | 'avg' | 'share' | 'change';

const PRESETS: { id: Preset, label: string }[] = [
  { id: 'month', label: 'Month' },
  { id: 'lastMonth', label: 'Previous month' },
  { id: 'quarter', label: 'Quarter' },
  { id: 'ytd', label: 'Year to date' },
  { id: 'year', label: 'Full year' },
  { id: 'custom', label: 'Custom' },
];

const SOURCE_COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#14b8a6', '#6366f1', '#ef4444', '#84cc16', '#64748b'];

const toDateInput = (date: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const parseDateInput = (value: string) => {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const rangeForPreset = (preset: Preset, year: number, monthIndex: number): [string, string] | null => {
  const today = new Date();
  switch (preset) {
    case 'month': return [toDateInput(new Date(year, monthIndex, 1)), toDateInput(new Date(year, monthIndex + 1, 0))];
    case 'lastMonth': return [toDateInput(new Date(year, monthIndex - 1, 1)), toDateInput(new Date(year, monthIndex, 0))];
    case 'quarter': {
      const q = Math.floor(monthIndex / 3) * 3;
      return [toDateInput(new Date(year, q, 1)), toDateInput(new Date(year, q + 3, 0))];
    }
    case 'ytd': return [toDateInput(new Date(year, 0, 1)), toDateInput(year === today.getFullYear() ? today : new Date(year, 11, 31))];
    case 'year': return [toDateInput(new Date(year, 0, 1)), toDateInput(new Date(year, 11, 31))];
    default: return null;
  }
};

const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);

const SourcePerformanceReport: React.FC<SourcePerformanceReportProps> = ({ reservations, year, month }) => {
  const monthIndex = Math.max(0, MONTHS.indexOf(month));
  const [preset, setPreset] = useState<Preset>('month');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currency, setCurrency] = useState<'USD' | 'JOD'>('USD');
  const [sort, setSort] = useState<{ key: SortKey, dir: 'asc' | 'desc' }>({ key: 'revenue', dir: 'desc' });

  useEffect(() => {
    const range = rangeForPreset(preset, year, monthIndex);
    if (range) {
      setStartDate(range[0]);
      setEndDate(range[1]);
    }
  }, [preset, year, monthIndex]);

  const rate = currency === 'JOD' ? USD_TO_JOD_RATE : 1;
  const formatMoney = (usd: number, digits = 2) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(usd * rate);

  // The previous period has the same length and ends the day before this one starts
  const previousRange = useMemo<[string, string] | null>(() => {
    if (!startDate || !endDate) return null;
    const start = parseDateInput(startDate);
    const end = parseDateInput(endDate);
    // Whole calendar months compare with the same number of months before them
    const isWholeMonths = start.getDate() === 1 && new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1).getDate() === 1;
    if (isWholeMonths) {
      const months = (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth() + 1;
      return [toDateInput(new Date(start.getFullYear(), start.getMonth() - months, 1)), toDateInput(new Date(start.getFullYear(), start.getMonth(), 0))];
    }
    const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    const prevEnd = new Date(start.getFullYear(), start.getMonth(), start.getDate() - 1);
    const prevStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), prevEnd.getDate() - days + 1);
    return [toDateInput(prevStart), toDateInput(prevEnd)];
  }, [startDate, endDate]);

  const rows = useMemo<SourceRow[]>(() => {
    if (!startDate || !endDate) return [];
    const inRange = (r: Reservation, from: string, to: string) => {
      const day = (r.startDate || '').slice(0, 10);
      return day >= from && day <= to;
    };

    const stats = new Map<string, SourceRow>();
    const rowFor = (source: string) => {
      let row = stats.get(source);
      if (!row) {
        row = { source, total: 0, confirmed: 0, pending: 0, cancelled: 0, noShow: 0, revenue: 0, prevRevenue: 0 };
        stats.set(source, row);
      }
      return row;
    };

    reservations.forEach(r => {
      const source = r.source || 'Unspecified';
      if (inRange(r, startDate, endDate)) {
        const row = rowFor(source);
        row.total += 1;
        switch (r.status) {
          case ReservationStatus.CONFIRMED:
            row.confirmed += 1;
            row.revenue += r.amount || 0;
            break;
          case ReservationStatus.CANCELLED: row.cancelled += 1; break;
          case ReservationStatus.NO_SHOW: row.noShow += 1; break;
          default: row.pending += 1; break;
        }
      } else if (previousRange && inRange(r, previousRange[0], previousRange[1]) && r.status === ReservationStatus.CONFIRMED) {
        rowFor(source).prevRevenue += r.amount || 0;
      }
    });

    return Array.from(stats.values()).filter(r => r.total > 0 || r.prevRevenue > 0);
  }, [reservations, startDate, endDate, previousRange]);

  const totals = useMemo(() => rows.reduce((t, r) => ({
    total: t.total + r.total,
    confirmed: t.confirmed + r.confirmed,
    pending: t.pending + r.pending,
    cancelled: t.cancelled + r.cancelled,
    noShow: t.noShow + r.noShow,
    revenue: t.revenue + r.revenue,
    prevRevenue: t.prevRevenue + r.prevRevenue,
  }), { total: 0, confirmed: 0, pending: 0, cancelled: 0, noShow: 0, revenue: 0, prevRevenue: 0 }), [rows]);

  const colorFor = useMemo(() => {
    const byRevenue = [...rows].sort((a, b) => b.revenue - a.revenue).map(r => r.source);
    return (source: string) => SOURCE_COLORS[byRevenue.indexOf(source) % SOURCE_COLORS.length];
  }, [rows]);

  const sortedRows = useMemo(() => {
    const value = (r: SourceRow): number | string => {
      switch (sort.key) {
        case 'source': return r.source.toLowerCase();
        case 'conversion': return pct(r.confirmed, r.total);
        case 'avg': return r.confirmed ? r.revenue / r.confirmed : 0;
        case 'share': return pct(r.revenue, totals.revenue);
        case 'change': return r.prevRevenue > 0 ? (r.revenue - r.prevRevenue) / r.prevRevenue : (r.revenue > 0 ? Infinity : 0);
        default: return r[sort.key];
      }
    };
    return [...rows].sort((a, b) => {
      const va = value(a), vb = value(b);
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sort, totals.revenue]);

  const revenueChange = totals.prevRevenue > 0 ? ((totals.revenue - totals.prevRevenue) / totals.prevRevenue) * 100 : null;
  const topSource = [...rows].sort((a, b) => b.revenue - a.revenue)[0];
  const hasData = totals.total > 0;

  const periodLabel = startDate && endDate
    ? `${parseDateInput(startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} – ${parseDateInput(endDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : '';

  const toggleSort = (key: SortKey) => {
    setSort(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'source' ? 'asc' : 'desc' });
  };

  const handleExportPDF = () => {
    if (!hasData) return;
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(16);
    doc.text('Source Performance Report', 14, 18);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Period: ${periodLabel} · Amounts in ${currency}`, 14, 25);
    doc.text(`Generated ${new Date().toLocaleString()}`, doc.internal.pageSize.getWidth() - 14, 18, { align: 'right' });

    (doc as any).autoTable({
      startY: 32,
      head: [['Source', 'Bookings', 'Confirmed', 'Conversion', 'Pending', 'Cancelled', 'No-show', 'Revenue', 'Avg booking', 'Share', 'vs prev. period']],
      body: sortedRows.map(r => [
        r.source, r.total, r.confirmed, `${pct(r.confirmed, r.total).toFixed(1)}%`, r.pending, r.cancelled, r.noShow,
        formatMoney(r.revenue), r.confirmed ? formatMoney(r.revenue / r.confirmed) : '—', `${pct(r.revenue, totals.revenue).toFixed(1)}%`,
        r.prevRevenue > 0 ? `${(((r.revenue - r.prevRevenue) / r.prevRevenue) * 100).toFixed(1)}%` : '—',
      ]),
      foot: [['Total', totals.total, totals.confirmed, `${pct(totals.confirmed, totals.total).toFixed(1)}%`, totals.pending, totals.cancelled, totals.noShow,
        formatMoney(totals.revenue), totals.confirmed ? formatMoney(totals.revenue / totals.confirmed) : '—', '100%', revenueChange !== null ? `${revenueChange.toFixed(1)}%` : '—']],
      theme: 'grid',
      styles: { fontSize: 9 },
      headStyles: { fillColor: [15, 23, 42] },
      footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
    });
    doc.save(`source_performance_${startDate}_to_${endDate}.pdf`);
  };

  const kpis = [
    {
      label: 'Confirmed revenue',
      value: formatMoney(totals.revenue),
      sub: revenueChange === null ? 'No revenue in previous period' : `${revenueChange >= 0 ? '▲' : '▼'} ${Math.abs(revenueChange).toFixed(1)}% vs previous period`,
      subTone: revenueChange === null ? 'text-slate-500' : revenueChange >= 0 ? 'text-emerald-600' : 'text-rose-600',
    },
    { label: 'Bookings', value: totals.total.toLocaleString(), sub: `${totals.confirmed} confirmed (${pct(totals.confirmed, totals.total).toFixed(0)}%)`, subTone: 'text-slate-500' },
    { label: 'Avg. booking value', value: totals.confirmed ? formatMoney(totals.revenue / totals.confirmed) : '—', sub: 'Per confirmed booking', subTone: 'text-slate-500' },
    {
      label: 'Lost bookings',
      value: `${pct(totals.cancelled + totals.noShow, totals.total).toFixed(1)}%`,
      sub: `${totals.cancelled} cancelled · ${totals.noShow} no-show`,
      subTone: totals.cancelled + totals.noShow > 0 ? 'text-rose-600' : 'text-slate-500',
    },
    { label: 'Top source', value: topSource && topSource.revenue > 0 ? topSource.source : '—', sub: topSource && topSource.revenue > 0 ? `${pct(topSource.revenue, totals.revenue).toFixed(0)}% of revenue` : 'No confirmed revenue', subTone: 'text-slate-500' },
  ];

  // Donut geometry for the booking outcome chart
  const outcomes = [
    { label: 'Confirmed', value: totals.confirmed, color: '#10b981' },
    { label: 'Pending', value: totals.pending, color: '#94a3b8' },
    { label: 'Cancelled', value: totals.cancelled, color: '#f43f5e' },
    { label: 'No-show', value: totals.noShow, color: '#f59e0b' },
  ];
  const circumference = 2 * Math.PI * 52;
  let offset = 0;

  const SortHeader: React.FC<{ k: SortKey, label: string, align?: 'left' | 'right' }> = ({ k, label, align = 'right' }) => (
    <th className={`px-2.5 py-3 whitespace-nowrap ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button onClick={() => toggleSort(k)} className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-slate-800 ${sort.key === k ? 'text-slate-800' : ''}`}>
        {label}
        <span className="text-[9px] w-2">{sort.key === k ? (sort.dir === 'asc' ? '▲' : '▼') : ''}</span>
      </button>
    </th>
  );

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Reports</p>
          <h3 className="text-2xl font-semibold text-slate-900 mt-0.5">Source Performance</h3>
          <p className="text-sm text-slate-500 mt-1">Which booking channels bring revenue, and which lose bookings. {periodLabel && <span className="text-slate-700 font-medium">{periodLabel}</span>}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex p-0.5 rounded-lg bg-slate-100">
            {(['USD', 'JOD'] as const).map(c => (
              <button key={c} onClick={() => setCurrency(c)} className={`px-3 h-8 rounded-md text-sm font-medium ${currency === c ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{c}</button>
            ))}
          </div>
          <button onClick={handleExportPDF} disabled={!hasData} className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed">
            <PdfIcon className="w-4 h-4" /> Export PDF
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 flex flex-col xl:flex-row xl:items-center gap-3">
        <div className="flex flex-wrap gap-1">
          {PRESETS.map(p => (
            <button key={p.id} onClick={() => setPreset(p.id)} className={`px-3 h-8 rounded-lg text-sm font-medium transition-colors ${preset === p.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              {p.id === 'month' ? `${month} ${year}` : p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 xl:ml-auto">
          <input type="date" aria-label="Start date" value={startDate} onChange={e => { setStartDate(e.target.value); setPreset('custom'); }} className="h-9 px-2.5 rounded-lg border border-slate-300 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500" />
          <span className="text-slate-400 text-sm">to</span>
          <input type="date" aria-label="End date" value={endDate} min={startDate} onChange={e => { setEndDate(e.target.value); setPreset('custom'); }} className="h-9 px-2.5 rounded-lg border border-slate-300 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500" />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        {kpis.map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{k.label}</p>
            <p className="mt-1.5 text-xl sm:text-2xl font-semibold text-slate-900 tabular-nums truncate">{k.value}</p>
            <p className={`mt-1 text-xs truncate ${k.subTone}`}>{k.sub}</p>
          </div>
        ))}
      </div>

      {!hasData ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 py-16 text-center">
          <p className="text-slate-700 font-medium">No bookings in this period</p>
          <p className="text-sm text-slate-500 mt-1">Choose a wider range above to see channel performance.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-baseline justify-between">
                <h4 className="text-base font-semibold text-slate-900">Revenue by source</h4>
                <span className="text-xs text-slate-500">Confirmed bookings only</span>
              </div>
              <div className="mt-4 space-y-3">
                {[...rows].filter(r => r.revenue > 0).sort((a, b) => b.revenue - a.revenue).map(r => {
                  const share = pct(r.revenue, totals.revenue);
                  const maxRevenue = Math.max(...rows.map(x => x.revenue), 1);
                  return (
                    <div key={r.source}>
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="flex items-center gap-2 font-medium text-slate-800 min-w-0">
                          <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: colorFor(r.source) }} />
                          <span className="truncate">{r.source}</span>
                        </span>
                        <span className="tabular-nums text-slate-700 whitespace-nowrap ml-3">{formatMoney(r.revenue)} <span className="text-slate-400 text-xs">· {share.toFixed(1)}%</span></span>
                      </div>
                      <div className="mt-1.5 h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(r.revenue / maxRevenue) * 100}%`, backgroundColor: colorFor(r.source) }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h4 className="text-base font-semibold text-slate-900">Booking outcomes</h4>
              <div className="mt-4 flex items-center gap-5">
                <svg viewBox="0 0 120 120" className="w-32 h-32 flex-shrink-0" role="img" aria-label="Booking outcomes">
                  <g transform="rotate(-90 60 60)">
                  <circle cx="60" cy="60" r="52" fill="none" stroke="#f1f5f9" strokeWidth="14" />
                  {outcomes.filter(o => o.value > 0).map(o => {
                    const length = (o.value / totals.total) * circumference;
                    const el = <circle key={o.label} cx="60" cy="60" r="52" fill="none" stroke={o.color} strokeWidth="14" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset} />;
                    offset += length;
                    return el;
                  })}
                  </g>
                  <text x="60" y="58" textAnchor="middle" fill="#0f172a" style={{ fontSize: 20, fontWeight: 600 }}>{totals.total}</text>
                  <text x="60" y="74" textAnchor="middle" fill="#64748b" style={{ fontSize: 9 }}>bookings</text>
                </svg>
                <ul className="space-y-2 text-sm flex-1 min-w-0">
                  {outcomes.map(o => (
                    <li key={o.label} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-slate-600"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: o.color }} />{o.label}</span>
                      <span className="tabular-nums text-slate-900 font-medium">{o.value} <span className="text-slate-400 text-xs font-normal">{pct(o.value, totals.total).toFixed(0)}%</span></span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs font-medium text-slate-500">
                  <SortHeader k="source" label="Source" align="left" />
                  <SortHeader k="total" label="Bookings" />
                  <SortHeader k="confirmed" label="Confirmed" />
                  <SortHeader k="conversion" label="Conversion" />
                  <SortHeader k="cancelled" label="Cancelled" />
                  <SortHeader k="noShow" label="No-show" />
                  <SortHeader k="revenue" label="Revenue" />
                  <SortHeader k="avg" label="Avg value" />
                  <SortHeader k="share" label="Share" />
                  <SortHeader k="change" label="vs prev." />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedRows.map(r => {
                  const conversion = pct(r.confirmed, r.total);
                  const change = r.prevRevenue > 0 ? ((r.revenue - r.prevRevenue) / r.prevRevenue) * 100 : null;
                  return (
                    <tr key={r.source} className="hover:bg-slate-50/60">
                      <td className="pl-4 pr-2.5 py-3 font-medium text-slate-900 whitespace-nowrap">
                        <span className="inline-flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: colorFor(r.source) }} />{r.source}</span>
                      </td>
                      <td className="px-2.5 py-3 text-right tabular-nums text-slate-700">{r.total}</td>
                      <td className="px-2.5 py-3 text-right tabular-nums text-slate-700">{r.confirmed}</td>
                      <td className="px-2.5 py-3 text-right tabular-nums">
                        <span className={conversion >= 80 ? 'text-emerald-700' : conversion >= 60 ? 'text-amber-700' : 'text-rose-700'}>{r.total ? `${conversion.toFixed(0)}%` : '—'}</span>
                      </td>
                      <td className={`px-2.5 py-3 text-right tabular-nums ${r.cancelled ? 'text-rose-600' : 'text-slate-400'}`}>{r.cancelled}</td>
                      <td className={`px-2.5 py-3 text-right tabular-nums ${r.noShow ? 'text-amber-600' : 'text-slate-400'}`}>{r.noShow}</td>
                      <td className="px-2.5 py-3 text-right tabular-nums font-semibold text-slate-900">{formatMoney(r.revenue)}</td>
                      <td className="px-2.5 py-3 text-right tabular-nums text-slate-700">{r.confirmed ? formatMoney(r.revenue / r.confirmed) : '—'}</td>
                      <td className="px-2.5 py-3 text-right tabular-nums text-slate-700">{pct(r.revenue, totals.revenue).toFixed(1)}%</td>
                      <td className={`px-2.5 py-3 text-right tabular-nums whitespace-nowrap ${change === null ? 'text-slate-400' : change >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {change === null ? (r.revenue > 0 ? 'New' : '—') : `${change >= 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(0)}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-semibold text-slate-900">
                  <td className="pl-4 pr-2.5 py-3">Total</td>
                  <td className="px-2.5 py-3 text-right tabular-nums">{totals.total}</td>
                  <td className="px-2.5 py-3 text-right tabular-nums">{totals.confirmed}</td>
                  <td className="px-2.5 py-3 text-right tabular-nums">{pct(totals.confirmed, totals.total).toFixed(0)}%</td>
                  <td className="px-2.5 py-3 text-right tabular-nums">{totals.cancelled}</td>
                  <td className="px-2.5 py-3 text-right tabular-nums">{totals.noShow}</td>
                  <td className="px-2.5 py-3 text-right tabular-nums">{formatMoney(totals.revenue)}</td>
                  <td className="px-2.5 py-3 text-right tabular-nums">{totals.confirmed ? formatMoney(totals.revenue / totals.confirmed) : '—'}</td>
                  <td className="px-2.5 py-3 text-right tabular-nums">100%</td>
                  <td className={`px-2.5 py-3 text-right tabular-nums ${revenueChange === null ? '' : revenueChange >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {revenueChange === null ? '—' : `${revenueChange >= 0 ? '▲' : '▼'} ${Math.abs(revenueChange).toFixed(0)}%`}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          {previousRange && (
            <p className="text-xs text-slate-500">
              “vs prev.” compares confirmed revenue with the previous period ({parseDateInput(previousRange[0]).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – {parseDateInput(previousRange[1]).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}).
            </p>
          )}
        </>
      )}
    </div>
  );
};

export default SourcePerformanceReport;
