
import React, { useState, useMemo, useEffect } from 'react';
import { Reservation, ReservationStatus } from '../types';
import { MONTHS } from '../constants';
import { PdfIcon } from './icons';
import BarChart from './BarChart';
import PieChart from './PieChart';

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

  const revenueChartData = useMemo(() => {
    const sortedData = [...reportData].sort((a, b) => b.totalAmount - a.totalAmount);
    const labels = sortedData.map(row => row.source);
    const data = sortedData.map(row => row.totalAmount);
    
    return {
      labels,
      datasets: [
        {
          label: 'Total Revenue (Confirmed)',
          data,
          color: '#475569' // primary-dark
        }
      ]
    };
  }, [reportData]);

  const statusChartData = useMemo(() => {
    return {
        labels: ['Confirmed', 'Cancelled', 'No Show'],
        datasets: [{
            data: [grandTotal.confirmed, grandTotal.cancelled, grandTotal.noShow],
            backgroundColor: ['#10B981', '#EF4444', '#F59E0B'] // secondary, red, yellow
        }]
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

  return (
     <div className="p-4 sm:p-6">
       <div className="flex flex-col sm:flex-row justify-between items-start mb-6">
        <div>
          <h3 className="text-2xl font-bold text-gray-800 mb-1">Source Performance Report</h3>
          <p className="text-md text-gray-500">Analyze reservation performance by source for a selected period.</p>
        </div>
        <button 
          onClick={handleExportPDF} 
          disabled={reportData.length === 0}
          className="mt-4 sm:mt-0 flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-600 text-sm font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          <PdfIcon />
          Export to PDF
        </button>
       </div>
        <div className="flex items-center gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
            <div className="flex-1">
                <label htmlFor="report-start-date" className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input 
                    type="date" 
                    id="report-start-date"
                    value={startDate} 
                    onChange={e => setStartDate(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-secondary focus:border-secondary"
                />
            </div>
            <div className="flex-1">
                <label htmlFor="report-end-date" className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <input 
                    type="date" 
                    id="report-end-date"
                    value={endDate} 
                    onChange={e => setEndDate(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-secondary focus:border-secondary"
                />
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <div className="lg:col-span-2">
                <BarChart data={revenueChartData} title="Revenue by Source" unit="$" unitPosition="before" />
            </div>
            <div>
                <PieChart data={statusChartData} title="Reservation Status Breakdown" />
            </div>
        </div>
        
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rental Source</th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Confirmed</th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Cancelled</th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">No Show</th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total Amount (Confirmed)</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {reportData.length > 0 ? reportData.map((row, index) => (
              <tr key={row.source} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{row.source}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">{row.confirmed}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">{row.cancelled}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">{row.noShow}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">{formatCurrency(row.totalAmount)}</td>
              </tr>
            )) : (
              <tr>
                <td colSpan={5} className="text-center py-10 text-gray-500">
                  No data available for the selected date range.
                </td>
              </tr>
            )}
          </tbody>
           {reportData.length > 0 && (
              <tfoot className="bg-gray-100">
                  <tr>
                      <th scope="row" className="px-6 py-3 text-left text-sm font-bold text-gray-700 uppercase">Grand Total</th>
                      <td className="px-6 py-3 text-right text-sm font-bold text-gray-700">{grandTotal.confirmed}</td>
                      <td className="px-6 py-3 text-right text-sm font-bold text-gray-700">{grandTotal.cancelled}</td>
                      <td className="px-6 py-3 text-right text-sm font-bold text-gray-700">{grandTotal.noShow}</td>
                      <td className="px-6 py-3 text-right text-sm font-bold text-gray-700">{formatCurrency(grandTotal.totalAmount)}</td>
                  </tr>
              </tfoot>
           )}
        </table>
      </div>
    </div>
  );
};

export default SourcePerformanceReport;
