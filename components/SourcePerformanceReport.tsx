
import React, { useState, useMemo, useEffect } from 'react';
import { Reservation, ReservationStatus } from '../types';
import { MONTHS } from '../constants';
import { PdfIcon, ChartBarIcon, CalendarIcon } from './icons';

interface SourcePerformanceReportProps {
  reservations: Reservation[];
  year: number;
  month: string;
}

interface ReportRow {
  source: string;
  confirmed: number;
  cancelled: number;
  noShow: number;
  totalAmount: number;
}

const SourcePerformanceReport: React.FC<SourcePerformanceReportProps> = ({ reservations, year, month }) => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    const monthIndex = MONTHS.indexOf(month);
    if (monthIndex !== -1) {
      const firstDay = new Date(year, monthIndex, 1);
      const lastDay = new Date(year, monthIndex + 1, 0);
      setStartDate(firstDay.toISOString().split('T')[0]);
      setEndDate(lastDay.toISOString().split('T')[0]);
    }
  }, [year, month]);

  const reportData = useMemo<ReportRow[]>(() => {
    if (!startDate || !endDate || reservations.length === 0) {
      return [];
    }
    
    const filteredReservations = reservations.filter(r => {
      // Analyze based on the reservation's start date being within the selected period
      return r.startDate && r.startDate >= startDate && r.startDate <= endDate;
    });
    
    const sourceStats = new Map<string, { confirmed: number, cancelled: number, noShow: number, totalAmount: number }>();

    filteredReservations.forEach(r => {
      if (!r.source) return;

      const stats = sourceStats.get(r.source) || { confirmed: 0, cancelled: 0, noShow: 0, totalAmount: 0 };

      switch (r.status) {
        case ReservationStatus.CONFIRMED:
          stats.confirmed += 1;
          stats.totalAmount += (r.amount || 0);
          break;
        case ReservationStatus.CANCELLED:
          stats.cancelled += 1;
          break;
        case ReservationStatus.NO_SHOW:
          stats.noShow += 1;
          break;
        default:
          break;
      }
      sourceStats.set(r.source, stats);
    });

    return Array.from(sourceStats.entries()).map(([source, stats]) => ({
      source,
      ...stats
    })).sort((a, b) => b.totalAmount - a.totalAmount);

  }, [reservations, startDate, endDate]);

  const grandTotal = useMemo(() => {
    return reportData.reduce((totals, row) => {
        totals.confirmed += row.confirmed;
        totals.cancelled += row.cancelled;
        totals.noShow += row.noShow;
        totals.totalAmount += row.totalAmount;
        return totals;
    }, { confirmed: 0, cancelled: 0, noShow: 0, totalAmount: 0 });
  }, [reportData]);

  const statusBreakdown = useMemo(() => {
    const total = grandTotal.confirmed + grandTotal.cancelled + grandTotal.noShow;
    const pct = (n: number) => (total ? (n / total) * 100 : 0);
    return {
      total,
      items: [
        { key: 'confirmed', label: 'Confirmed', value: grandTotal.confirmed, pct: pct(grandTotal.confirmed), bar: 'bg-emerald-500', dot: 'bg-emerald-500' },
        { key: 'cancelled', label: 'Cancelled', value: grandTotal.cancelled, pct: pct(grandTotal.cancelled), bar: 'bg-rose-500', dot: 'bg-rose-500' },
        { key: 'noShow', label: 'No show', value: grandTotal.noShow, pct: pct(grandTotal.noShow), bar: 'bg-amber-500', dot: 'bg-amber-500' },
      ],
    };
  }, [grandTotal]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };

  const handleExportPDF = () => {
    if (reportData.length === 0) {
      alert("No data to export for the selected date range.");
      return;
    }

    // @ts-ignore
    if (typeof window.jspdf === 'undefined' || typeof window.jspdf.jsPDF === 'undefined') {
        alert('The PDF generation library is not available. Please check your connection or try again later.');
        return;
    }
    // @ts-ignore
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    if (typeof (doc as any).autoTable !== 'function') {
        alert('The PDF table generation library is not available. Please check your connection or try again later.');
        return;
    }

    const tableHead = [['Source', 'Confirmed', 'Cancelled', 'No Show', 'Total Amount']];
    const tableBody = reportData.map(row => [
      row.source,
      row.confirmed,
      row.cancelled,
      row.noShow,
      formatCurrency(row.totalAmount),
    ]);
    const tableFoot = [[
        'Grand Total',
        grandTotal.confirmed,
        grandTotal.cancelled,
        grandTotal.noShow,
        formatCurrency(grandTotal.totalAmount),
    ]];

    doc.setFontSize(18);
    doc.text(`Source Performance Report`, 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Period: ${startDate} to ${endDate}`, 14, 28);
    
    (doc as any).autoTable({
      startY: 35,
      head: tableHead,
      body: tableBody,
      foot: tableFoot,
      theme: 'grid',
      headStyles: { fillColor: [30, 64, 175] },
      footStyles: { fillColor: [243, 244, 246], textColor: [17, 24, 39], fontStyle: 'bold' },
    });

    doc.save(`source_performance_${startDate}_to_${endDate}.pdf`);
  };

  const totalBookings = grandTotal.confirmed + grandTotal.cancelled + grandTotal.noShow;
  const conversion = totalBookings ? (grandTotal.confirmed / totalBookings) * 100 : 0;
  const shareOf = (amount: number) => (grandTotal.totalAmount ? (amount / grandTotal.totalAmount) * 100 : 0);
  const maxAmount = Math.max(1, ...reportData.map(r => r.totalAmount));
  const inputCls = 'w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none';
  const rowRate = (row: ReportRow) => {
    const t = row.confirmed + row.cancelled + row.noShow;
    return t ? (row.confirmed / t) * 100 : 0;
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <ChartBarIcon className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Source performance</h2>
              <p className="text-sm text-slate-500">Bookings, cancellations and confirmed revenue by rental source.</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-end gap-2 w-full lg:w-auto">
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-end">
              <div className="min-w-0">
                <label htmlFor="report-start-date" className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">From</label>
                <input type="date" id="report-start-date" value={startDate} onChange={e => setStartDate(e.target.value)} className={`${inputCls} min-w-0`} />
              </div>
              <div className="min-w-0">
                <label htmlFor="report-end-date" className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">To</label>
                <input type="date" id="report-end-date" value={endDate} onChange={e => setEndDate(e.target.value)} className={`${inputCls} min-w-0`} />
              </div>
            </div>
            <button
              onClick={handleExportPDF}
              disabled={reportData.length === 0}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed whitespace-nowrap"
            >
              <PdfIcon className="w-4 h-4" /> Export PDF
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 border-t border-slate-100 divide-x divide-y lg:divide-y-0 divide-slate-100">
          <div className="px-5 py-4 min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Confirmed revenue</p>
            <p className="mt-1 text-xl sm:text-2xl font-bold tabular-nums text-slate-900 truncate">{formatCurrency(grandTotal.totalAmount)}</p>
            <p className="text-xs text-slate-400 truncate">{reportData.length} source{reportData.length === 1 ? '' : 's'}</p>
          </div>
          <div className="px-5 py-4 min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Confirmed</p>
            <p className="mt-1 text-xl sm:text-2xl font-bold tabular-nums text-emerald-700">{grandTotal.confirmed}</p>
            <p className="text-xs text-slate-400 truncate">{conversion.toFixed(1)}% of {totalBookings} bookings</p>
          </div>
          <div className="px-5 py-4 min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Cancelled</p>
            <p className="mt-1 text-xl sm:text-2xl font-bold tabular-nums text-rose-600">{grandTotal.cancelled}</p>
            <p className="text-xs text-slate-400 truncate">{totalBookings ? ((grandTotal.cancelled / totalBookings) * 100).toFixed(1) : '0.0'}% of bookings</p>
          </div>
          <div className="px-5 py-4 min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">No show</p>
            <p className="mt-1 text-xl sm:text-2xl font-bold tabular-nums text-amber-600">{grandTotal.noShow}</p>
            <p className="text-xs text-slate-400 truncate">{totalBookings ? ((grandTotal.noShow / totalBookings) * 100).toFixed(1) : '0.0'}% of bookings</p>
          </div>
        </div>
      </div>

      {reportData.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-6 py-16 text-center">
          <div className="w-12 h-12 mx-auto rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center"><CalendarIcon className="w-6 h-6" /></div>
          <h3 className="mt-4 text-sm font-semibold text-slate-900">No bookings in this period</h3>
          <p className="mt-1 text-sm text-slate-500">Adjust the date range above to see how each source performed.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Revenue by source */}
            <section className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 min-w-0">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h3 className="text-sm font-semibold text-slate-900">Revenue by source</h3>
                <span className="text-xs text-slate-400">Confirmed bookings</span>
              </div>
              <ul className="space-y-3">
                {reportData.map(row => (
                  <li key={row.source} className="min-w-0">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="font-medium text-slate-700 truncate">{row.source}</span>
                      <span className="shrink-0 tabular-nums text-slate-900 font-semibold">
                        {formatCurrency(row.totalAmount)}
                        <span className="ml-2 text-xs font-medium text-slate-400">{shareOf(row.totalAmount).toFixed(1)}%</span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full bg-indigo-500" style={{ width: `${(row.totalAmount / maxAmount) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            {/* Status breakdown */}
            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 min-w-0">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h3 className="text-sm font-semibold text-slate-900">Status breakdown</h3>
                <span className="text-xs text-slate-400 tabular-nums">{statusBreakdown.total} bookings</span>
              </div>
              <div className="flex h-3 rounded-full overflow-hidden bg-slate-100">
                {statusBreakdown.items.map(i => i.pct > 0 && (
                  <div key={i.key} className={i.bar} style={{ width: `${i.pct}%` }} title={`${i.label}: ${i.value}`} />
                ))}
              </div>
              <ul className="mt-5 divide-y divide-slate-100">
                {statusBreakdown.items.map(i => (
                  <li key={i.key} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="inline-flex items-center gap-2 text-slate-600"><span className={`w-2.5 h-2.5 rounded-sm ${i.dot}`} />{i.label}</span>
                    <span className="tabular-nums">
                      <span className="font-semibold text-slate-900">{i.value}</span>
                      <span className="ml-2 text-xs text-slate-400">{i.pct.toFixed(1)}%</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {/* Table (md+) */}
          <section className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                    <th scope="col" className="text-left font-semibold px-5 py-3">Rental source</th>
                    <th scope="col" className="text-right font-semibold px-4 py-3">Confirmed</th>
                    <th scope="col" className="text-right font-semibold px-4 py-3">Cancelled</th>
                    <th scope="col" className="text-right font-semibold px-4 py-3">No show</th>
                    <th scope="col" className="text-right font-semibold px-4 py-3 hidden lg:table-cell">Confirm rate</th>
                    <th scope="col" className="text-right font-semibold px-4 py-3">Total amount</th>
                    <th scope="col" className="text-left font-semibold px-5 py-3 w-40 hidden lg:table-cell">Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reportData.map(row => (
                    <tr key={row.source} className="hover:bg-slate-50/60">
                      <td className="px-5 py-3 font-medium text-slate-900 whitespace-nowrap">{row.source}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{row.confirmed}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{row.cancelled}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{row.noShow}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-500 hidden lg:table-cell">{rowRate(row).toFixed(1)}%</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-900 whitespace-nowrap">{formatCurrency(row.totalAmount)}</td>
                      <td className="px-5 py-3 hidden lg:table-cell">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div className="h-full rounded-full bg-indigo-500" style={{ width: `${shareOf(row.totalAmount)}%` }} />
                          </div>
                          <span className="w-12 text-right text-xs tabular-nums text-slate-500">{shareOf(row.totalAmount).toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-900 text-white">
                    <th scope="row" className="px-5 py-3 text-left font-semibold">Grand total</th>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">{grandTotal.confirmed}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">{grandTotal.cancelled}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">{grandTotal.noShow}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold hidden lg:table-cell">{conversion.toFixed(1)}%</td>
                    <td className="px-4 py-3 text-right tabular-nums font-bold whitespace-nowrap">{formatCurrency(grandTotal.totalAmount)}</td>
                    <td className="px-5 py-3 hidden lg:table-cell text-xs text-slate-300">100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          {/* Cards (mobile) */}
          <div className="md:hidden space-y-3">
            {reportData.map(row => (
              <div key={row.source} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-slate-900 truncate min-w-0">{row.source}</p>
                  <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ring-1 ring-inset bg-indigo-50 text-indigo-700 ring-indigo-200 tabular-nums">{shareOf(row.totalAmount).toFixed(1)}%</span>
                </div>
                <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{formatCurrency(row.totalAmount)}</p>
                <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full bg-indigo-500" style={{ width: `${shareOf(row.totalAmount)}%` }} />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div className="flex justify-between gap-2"><dt className="text-slate-500">Confirmed</dt><dd className="font-semibold tabular-nums text-emerald-700">{row.confirmed}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-slate-500">Cancelled</dt><dd className="font-semibold tabular-nums text-rose-600">{row.cancelled}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-slate-500">No show</dt><dd className="font-semibold tabular-nums text-amber-600">{row.noShow}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-slate-500">Rate</dt><dd className="font-semibold tabular-nums text-slate-700">{rowRate(row).toFixed(0)}%</dd></div>
                </dl>
              </div>
            ))}
            <div className="bg-slate-900 text-white rounded-2xl p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-semibold">Grand total</p>
                <p className="text-lg font-bold tabular-nums">{formatCurrency(grandTotal.totalAmount)}</p>
              </div>
              <p className="mt-1 text-xs text-slate-300 tabular-nums">{grandTotal.confirmed} confirmed · {grandTotal.cancelled} cancelled · {grandTotal.noShow} no show</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default SourcePerformanceReport;
