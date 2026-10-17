
import React, { useState, useMemo, useEffect } from 'react';
import { Reservation, ReservationStatus } from '../types';
import { MONTHS } from '../constants';
import { PdfIcon, CalendarIcon } from './icons';
import { Page, PageHeader, StatGrid, Panel, Toolbar, Button, EmptyState, inputCls, table } from './ui/Crm';

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
  const rowRate = (row: ReportRow) => {
    const t = row.confirmed + row.cancelled + row.noShow;
    return t ? (row.confirmed / t) * 100 : 0;
  };

  const pctOf = (n: number) => (totalBookings ? ((n / totalBookings) * 100).toFixed(1) : '0.0');

  return (
    <Page>
      <PageHeader
        section="Reports"
        title="Source performance"
        subtitle="Bookings, cancellations and confirmed revenue by rental source."
        actions={
          <Button variant="primary" icon={<PdfIcon className="w-4 h-4" />} onClick={handleExportPDF} disabled={reportData.length === 0}>Export PDF</Button>
        }
      />

      <StatGrid items={[
        { label: 'Confirmed revenue', value: formatCurrency(grandTotal.totalAmount), sub: `${reportData.length} source${reportData.length === 1 ? '' : 's'}` },
        { label: 'Confirmed', value: grandTotal.confirmed, sub: `${conversion.toFixed(1)}% of ${totalBookings} bookings`, tone: 'success' },
        { label: 'Cancelled', value: grandTotal.cancelled, sub: `${pctOf(grandTotal.cancelled)}% of bookings`, tone: 'danger' },
        { label: 'No show', value: grandTotal.noShow, sub: `${pctOf(grandTotal.noShow)}% of bookings`, tone: 'warning' },
      ]} />

      <Panel
        title="Performance by source"
        subtitle={startDate && endDate ? `Pickups from ${startDate} to ${endDate}` : 'Select a period'}
      >
        <Toolbar>
          <div className="grid grid-cols-2 gap-2 md:flex md:items-center">
            <label htmlFor="report-start-date" className="flex items-center gap-2 min-w-0">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 shrink-0">From</span>
              <input type="date" id="report-start-date" value={startDate} onChange={e => setStartDate(e.target.value)} className={`${inputCls} min-w-0 md:w-auto`} />
            </label>
            <label htmlFor="report-end-date" className="flex items-center gap-2 min-w-0">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 shrink-0">To</span>
              <input type="date" id="report-end-date" value={endDate} onChange={e => setEndDate(e.target.value)} className={`${inputCls} min-w-0 md:w-auto`} />
            </label>
          </div>
        </Toolbar>

        {reportData.length === 0 ? (
          <EmptyState icon={<CalendarIcon />} title="No bookings in this period" hint="Adjust the date range above to see how each source performed." />
        ) : (
          <>
            <table className={`hidden md:table ${table.wrap}`}>
              <thead className={table.head}>
                <tr>
                  <th scope="col" className={table.th}>Rental source</th>
                  <th scope="col" className={`${table.th} text-right`}>Confirmed</th>
                  <th scope="col" className={`${table.th} text-right`}>Cancelled</th>
                  <th scope="col" className={`${table.th} text-right`}>No show</th>
                  <th scope="col" className={`${table.th} text-right hidden lg:table-cell`}>Confirm rate</th>
                  <th scope="col" className={`${table.th} text-right`}>Total amount</th>
                  <th scope="col" className={`${table.th} w-44 hidden lg:table-cell`}>Share</th>
                </tr>
              </thead>
              <tbody className={table.body}>
                {reportData.map(row => (
                  <tr key={row.source} className={table.row}>
                    <td className={`${table.td} font-medium text-slate-900 whitespace-nowrap`}>{row.source}</td>
                    <td className={`${table.td} text-right tabular-nums text-slate-700`}>{row.confirmed}</td>
                    <td className={`${table.td} text-right tabular-nums text-slate-700`}>{row.cancelled}</td>
                    <td className={`${table.td} text-right tabular-nums text-slate-700`}>{row.noShow}</td>
                    <td className={`${table.td} text-right tabular-nums text-slate-500 hidden lg:table-cell`}>{rowRate(row).toFixed(1)}%</td>
                    <td className={`${table.td} text-right tabular-nums font-semibold text-slate-900 whitespace-nowrap`}>{formatCurrency(row.totalAmount)}</td>
                    <td className={`${table.td} hidden lg:table-cell`}>
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
              <tfoot className="bg-slate-50 border-t border-slate-200 text-slate-900">
                <tr>
                  <th scope="row" className={`${table.td} text-left font-semibold`}>Grand total</th>
                  <td className={`${table.td} text-right tabular-nums font-semibold`}>{grandTotal.confirmed}</td>
                  <td className={`${table.td} text-right tabular-nums font-semibold`}>{grandTotal.cancelled}</td>
                  <td className={`${table.td} text-right tabular-nums font-semibold`}>{grandTotal.noShow}</td>
                  <td className={`${table.td} text-right tabular-nums font-semibold hidden lg:table-cell`}>{conversion.toFixed(1)}%</td>
                  <td className={`${table.td} text-right tabular-nums font-semibold whitespace-nowrap`}>{formatCurrency(grandTotal.totalAmount)}</td>
                  <td className={`${table.td} hidden lg:table-cell text-xs text-slate-500`}>100%</td>
                </tr>
              </tfoot>
            </table>

            <ul className="md:hidden divide-y divide-slate-100">
              {reportData.map(row => (
                <li key={row.source} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-[13px] font-semibold text-slate-900 truncate min-w-0">{row.source}</p>
                    <p className="shrink-0 text-[13px] font-semibold tabular-nums text-slate-900">{formatCurrency(row.totalAmount)}</p>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full bg-indigo-500" style={{ width: `${shareOf(row.totalAmount)}%` }} />
                    </div>
                    <span className="text-[11px] tabular-nums text-slate-500">{shareOf(row.totalAmount).toFixed(1)}%</span>
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500 tabular-nums">
                    <span className="text-emerald-700 font-medium">{row.confirmed} confirmed</span>
                    <span className="text-slate-300 mx-1.5">&middot;</span>
                    <span className="text-rose-600 font-medium">{row.cancelled} cancelled</span>
                    <span className="text-slate-300 mx-1.5">&middot;</span>
                    <span className="text-amber-600 font-medium">{row.noShow} no show</span>
                    <span className="text-slate-300 mx-1.5">&middot;</span>
                    {rowRate(row).toFixed(0)}% rate
                  </p>
                </li>
              ))}
              <li className="px-4 py-3 bg-slate-50">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[13px] font-semibold text-slate-900">Grand total</p>
                  <p className="text-[13px] font-semibold tabular-nums text-slate-900">{formatCurrency(grandTotal.totalAmount)}</p>
                </div>
                <p className="mt-1 text-xs text-slate-500 tabular-nums">{grandTotal.confirmed} confirmed &middot; {grandTotal.cancelled} cancelled &middot; {grandTotal.noShow} no show</p>
              </li>
            </ul>
          </>
        )}
      </Panel>

      {reportData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Panel className="lg:col-span-2" title="Revenue by source" subtitle="Confirmed bookings" padded>
            <ul className="space-y-3">
              {reportData.map(row => (
                <li key={row.source} className="min-w-0">
                  <div className="flex items-baseline justify-between gap-3 text-[13px]">
                    <span className="font-medium text-slate-700 truncate">{row.source}</span>
                    <span className="shrink-0 tabular-nums text-slate-900 font-semibold">
                      {formatCurrency(row.totalAmount)}
                      <span className="ml-2 text-xs font-medium text-slate-400">{shareOf(row.totalAmount).toFixed(1)}%</span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full bg-indigo-500" style={{ width: `${(row.totalAmount / maxAmount) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Status breakdown" subtitle={`${statusBreakdown.total} bookings`} padded>
            <div className="flex h-2 rounded-full overflow-hidden bg-slate-100">
              {statusBreakdown.items.map(i => i.pct > 0 && (
                <div key={i.key} className={i.bar} style={{ width: `${i.pct}%` }} title={`${i.label}: ${i.value}`} />
              ))}
            </div>
            <ul className="mt-4 divide-y divide-slate-100">
              {statusBreakdown.items.map(i => (
                <li key={i.key} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                  <span className="inline-flex items-center gap-2 text-slate-600"><span className={`w-2 h-2 rounded-full ${i.dot}`} />{i.label}</span>
                  <span className="tabular-nums">
                    <span className="font-semibold text-slate-900">{i.value}</span>
                    <span className="ml-2 text-xs text-slate-400">{i.pct.toFixed(1)}%</span>
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}
    </Page>
  );
};

export default SourcePerformanceReport;
