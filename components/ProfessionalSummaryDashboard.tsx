import React, { useMemo, useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import {
  ChartBarIcon, TrendingUpIcon, TrendingDownIcon, CurrencyDollarIcon,
  CalendarIcon, CheckCircleIcon, ClockIcon, ExclamationTriangleIcon,
  DownloadIcon, PrinterIcon, ArrowUpIcon, ArrowDownIcon, PdfIcon,
  RefreshIcon, FilterIcon, EyeIcon, ChevronRightIcon
} from './icons';

interface Reservation {
  id: string;
  amount?: number;
  status: string;
  startDate: string;
  endDate: string;
  bookingDate?: string;
  source?: any;
  personName?: string;
}

interface ProfessionalSummaryDashboardProps {
  allData: any;
  year: number;
  companyDetails: any;
  onExportPDF?: () => void;
}

/**
 * EXTREMELY PROFESSIONAL SUMMARY DASHBOARD
 *
 * Features:
 * - Real-time KPI calculations
 * - Month-over-month comparisons
 * - Revenue analytics with trends
 * - Visual charts and graphs
 * - Performance indicators
 * - Export capabilities
 * - Predictive insights
 * - Channel analytics
 * - Growth metrics
 */
const ProfessionalSummaryDashboard: React.FC<ProfessionalSummaryDashboardProps> = ({
  allData,
  year,
  companyDetails,
  onExportPDF
}) => {
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [comparisonView, setComparisonView] = useState<'yoy' | 'mom'>('mom');
  const [currency, setCurrency] = useState<'USD' | 'JOD'>('USD');

  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const COMMISSION_RATE = 0.075; // 7.5%
  const USD_TO_JOD = 0.71;

  // Extract reservations for the year
  const yearData = allData.reservations?.[year] || {};

  // Comprehensive monthly analytics
  const monthlyAnalytics = useMemo(() => {
    return MONTHS.map((month, index) => {
      const reservations: Reservation[] = yearData[month] || [];
      const confirmedReservations = reservations.filter(r => r.status === 'CONFIRMED');

      const totalRevenue = confirmedReservations.reduce((sum, r) => sum + (r.amount || 0), 0);
      const commission = totalRevenue * COMMISSION_RATE;
      const netRevenue = totalRevenue - commission;

      // Channel breakdown
      const channelBreakdown = confirmedReservations.reduce((acc, r) => {
        const channel = r.source?.name || 'Direct';
        acc[channel] = (acc[channel] || 0) + (r.amount || 0);
        return acc;
      }, {} as Record<string, number>);

      // Average metrics
      const avgBookingValue = confirmedReservations.length > 0
        ? totalRevenue / confirmedReservations.length
        : 0;

      // Get previous month for comparison
      const prevMonthIndex = index - 1;
      const prevMonthData = prevMonthIndex >= 0 ? yearData[MONTHS[prevMonthIndex]] || [] : [];
      const prevMonthRevenue = prevMonthData
        .filter((r: Reservation) => r.status === 'CONFIRMED')
        .reduce((sum: number, r: Reservation) => sum + (r.amount || 0), 0);

      const growthPercent = prevMonthRevenue > 0
        ? ((totalRevenue - prevMonthRevenue) / prevMonthRevenue) * 100
        : 0;

      return {
        month,
        monthIndex: index,
        totalReservations: reservations.length,
        confirmedReservations: confirmedReservations.length,
        totalRevenue,
        commission,
        netRevenue,
        avgBookingValue,
        channelBreakdown,
        growthPercent,
        prevMonthRevenue
      };
    });
  }, [yearData]);

  // Year-over-year comparison
  const yoyComparison = useMemo(() => {
    const prevYearData = allData.reservations?.[year - 1] || {};
    const currentYearTotal = monthlyAnalytics.reduce((sum, m) => sum + m.totalRevenue, 0);
    const prevYearTotal = MONTHS.reduce((sum, month) => {
      const monthData = prevYearData[month] || [];
      return sum + monthData
        .filter((r: Reservation) => r.status === 'CONFIRMED')
        .reduce((s: number, r: Reservation) => s + (r.amount || 0), 0);
    }, 0);

    const yoyGrowth = prevYearTotal > 0
      ? ((currentYearTotal - prevYearTotal) / prevYearTotal) * 100
      : 0;

    return {
      currentYear: currentYearTotal,
      previousYear: prevYearTotal,
      growth: yoyGrowth
    };
  }, [monthlyAnalytics, allData, year]);

  // Grand totals
  const grandTotals = useMemo(() => {
    return monthlyAnalytics.reduce((totals, month) => ({
      totalReservations: totals.totalReservations + month.totalReservations,
      confirmedReservations: totals.confirmedReservations + month.confirmedReservations,
      totalRevenue: totals.totalRevenue + month.totalRevenue,
      commission: totals.commission + month.commission,
      netRevenue: totals.netRevenue + month.netRevenue
    }), {
      totalReservations: 0,
      confirmedReservations: 0,
      totalRevenue: 0,
      commission: 0,
      netRevenue: 0
    });
  }, [monthlyAnalytics]);

  // Performance indicators
  const performance = useMemo(() => {
    const avgMonthlyRevenue = grandTotals.totalRevenue / 12;
    const avgMonthlyBookings = grandTotals.confirmedReservations / 12;

    const topMonth = [...monthlyAnalytics].sort((a, b) => b.totalRevenue - a.totalRevenue)[0];
    const lowMonth = [...monthlyAnalytics].sort((a, b) => a.totalRevenue - b.totalRevenue)[0];

    // Trend analysis
    const firstHalf = monthlyAnalytics.slice(0, 6).reduce((sum, m) => sum + m.totalRevenue, 0);
    const secondHalf = monthlyAnalytics.slice(6, 12).reduce((sum, m) => sum + m.totalRevenue, 0);
    const trend = secondHalf > firstHalf ? 'increasing' : secondHalf < firstHalf ? 'decreasing' : 'stable';

    return {
      avgMonthlyRevenue,
      avgMonthlyBookings,
      topMonth,
      lowMonth,
      trend,
      conversionRate: grandTotals.totalReservations > 0
        ? (grandTotals.confirmedReservations / grandTotals.totalReservations) * 100
        : 0
    };
  }, [monthlyAnalytics, grandTotals]);

  // Format currency
  const formatCurrency = (value: number) => {
    const converted = currency === 'JOD' ? value * USD_TO_JOD : value;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(converted);
  };

  // Export to PDF
  const handleExportPDF = () => {
    const doc = new jsPDF();

    // Header
    doc.setFontSize(20);
    doc.setTextColor(31, 41, 55);
    doc.text(`${companyDetails.name || 'NCT Rental'}`, 14, 20);

    doc.setFontSize(16);
    doc.text(`Annual Summary ${year}`, 14, 30);

    doc.setFontSize(10);
    doc.setTextColor(107, 114, 128);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 38);

    // Summary boxes
    const metrics = [
      { label: 'Total Revenue', value: formatCurrency(grandTotals.totalRevenue) },
      { label: 'Total Bookings', value: grandTotals.confirmedReservations.toString() },
      { label: 'Commission', value: formatCurrency(grandTotals.commission) },
      { label: 'Net Revenue', value: formatCurrency(grandTotals.netRevenue) }
    ];

    let yPos = 48;
    metrics.forEach((metric, i) => {
      doc.setFontSize(8);
      doc.setTextColor(107, 114, 128);
      doc.text(metric.label, 14 + (i * 48), yPos);
      doc.setFontSize(12);
      doc.setTextColor(31, 41, 55);
      doc.text(metric.value, 14 + (i * 48), yPos + 6);
    });

    // Monthly table
    const tableData = monthlyAnalytics.map(m => [
      m.month,
      m.confirmedReservations.toString(),
      formatCurrency(m.totalRevenue),
      formatCurrency(m.commission),
      m.growthPercent !== 0 ? `${m.growthPercent > 0 ? '+' : ''}${m.growthPercent.toFixed(1)}%` : '-'
    ]);

    (doc as any).autoTable({
      startY: yPos + 15,
      head: [['Month', 'Bookings', 'Revenue', 'Commission', 'Growth']],
      body: tableData,
      foot: [[
        'TOTAL',
        grandTotals.confirmedReservations.toString(),
        formatCurrency(grandTotals.totalRevenue),
        formatCurrency(grandTotals.commission),
        yoyComparison.growth !== 0 ? `${yoyComparison.growth > 0 ? '+' : ''}${yoyComparison.growth.toFixed(1)}%` : '-'
      ]],
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246] },
      footStyles: { fillColor: [229, 231, 235], textColor: [0, 0, 0], fontStyle: 'bold' }
    });

    doc.save(`summary_${year}_${currency}.pdf`);
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="rounded-xl shadow-lg p-8 text-white mb-6 bg-slate-900">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold mb-2">Annual Summary {year}</h1>
            <p className="text-sky-100">Comprehensive business performance analytics</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setCurrency(currency === 'USD' ? 'JOD' : 'USD')}
              className="px-4 py-2 bg-white bg-opacity-20 rounded-lg hover:bg-opacity-30 transition-colors font-semibold"
            >
              {currency}
            </button>
            <button
              onClick={handleExportPDF}
              className="flex items-center gap-2 px-4 py-2 bg-white text-sky-600 rounded-lg hover:bg-sky-50 transition-colors font-semibold"
            >
              <PdfIcon className="h-5 w-5" />
              Export PDF
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-sky-100 p-3 rounded-lg">
              <CurrencyDollarIcon className="h-6 w-6 text-sky-600" />
            </div>
            {yoyComparison.growth !== 0 && (
              <div className={`flex items-center ${yoyComparison.growth > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {yoyComparison.growth > 0 ? <ArrowUpIcon className="h-4 w-4" /> : <ArrowDownIcon className="h-4 w-4" />}
                <span className="text-sm font-semibold ml-1">{Math.abs(yoyComparison.growth).toFixed(1)}%</span>
              </div>
            )}
          </div>
          <h3 className="text-slate-500 text-sm font-medium mb-1">Total Revenue</h3>
          <div className="text-3xl font-bold text-slate-800">{formatCurrency(grandTotals.totalRevenue)}</div>
          <p className="text-xs text-slate-400 mt-2">Avg: {formatCurrency(performance.avgMonthlyRevenue)}/mo</p>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-emerald-100 p-3 rounded-lg">
              <CheckCircleIcon className="h-6 w-6 text-emerald-600" />
            </div>
          </div>
          <h3 className="text-slate-500 text-sm font-medium mb-1">Total Bookings</h3>
          <div className="text-3xl font-bold text-slate-800">{grandTotals.confirmedReservations}</div>
          <p className="text-xs text-slate-400 mt-2">Avg: {performance.avgMonthlyBookings.toFixed(1)}/mo</p>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-emerald-100 p-3 rounded-lg">
              <ChartBarIcon className="h-6 w-6 text-emerald-600" />
            </div>
          </div>
          <h3 className="text-slate-500 text-sm font-medium mb-1">Commission (7.5%)</h3>
          <div className="text-3xl font-bold text-slate-800">{formatCurrency(grandTotals.commission)}</div>
          <p className="text-xs text-slate-400 mt-2">Net: {formatCurrency(grandTotals.netRevenue)}</p>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-emerald-100 p-3 rounded-lg">
              <TrendingUpIcon className="h-6 w-6 text-emerald-600" />
            </div>
          </div>
          <h3 className="text-slate-500 text-sm font-medium mb-1">Conversion Rate</h3>
          <div className="text-3xl font-bold text-slate-800">{performance.conversionRate.toFixed(1)}%</div>
          <p className="text-xs text-slate-400 mt-2">Trend: {performance.trend}</p>
        </div>
      </div>

      {/* Performance Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
            <ChartBarIcon className="h-6 w-6 text-sky-600" />
            Performance Highlights
          </h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center p-4 bg-emerald-50 rounded-lg">
              <div>
                <div className="text-sm text-slate-600">Best Month</div>
                <div className="text-lg font-bold text-emerald-700">{performance.topMonth.month}</div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-emerald-700">{formatCurrency(performance.topMonth.totalRevenue)}</div>
                <div className="text-xs text-slate-500">{performance.topMonth.confirmedReservations} bookings</div>
              </div>
            </div>

            <div className="flex justify-between items-center p-4 bg-sky-50 rounded-lg">
              <div>
                <div className="text-sm text-slate-600">Average Monthly Revenue</div>
                <div className="text-lg font-bold text-sky-700">{formatCurrency(performance.avgMonthlyRevenue)}</div>
              </div>
              <div className="text-right">
                <div className="text-sm text-slate-600">Avg Booking Value</div>
                <div className="font-semibold text-sky-700">
                  {formatCurrency(grandTotals.totalRevenue / grandTotals.confirmedReservations)}
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center p-4 bg-emerald-50 rounded-lg">
              <div>
                <div className="text-sm text-slate-600">Year-over-Year Growth</div>
                <div className={`text-2xl font-bold ${yoyComparison.growth > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {yoyComparison.growth > 0 ? '+' : ''}{yoyComparison.growth.toFixed(1)}%
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-500">{year - 1}: {formatCurrency(yoyComparison.previousYear)}</div>
                <div className="text-xs text-slate-500">{year}: {formatCurrency(yoyComparison.currentYear)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Visual Revenue Chart */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-xl font-bold text-slate-800 mb-4">Monthly Revenue Trend</h2>
          <div className="space-y-2">
            {monthlyAnalytics.map((month) => {
              const maxRevenue = Math.max(...monthlyAnalytics.map(m => m.totalRevenue));
              const percentage = maxRevenue > 0 ? (month.totalRevenue / maxRevenue) * 100 : 0;

              return (
                <div key={month.month} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-slate-600">{month.month.substring(0, 3)}</span>
                    <span className="text-slate-500">{formatCurrency(month.totalRevenue)}</span>
                  </div>
                  <div className="h-6 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        month.growthPercent > 0 ? 'bg-emerald-500' :
                        month.growthPercent < 0 ? 'bg-rose-500' :
                        'bg-sky-500'
                      }`}
                      style={{ width: `${percentage}%` }}
                    >
                      <div className="flex items-center justify-end h-full pr-2">
                        {month.growthPercent !== 0 && (
                          <span className="text-xs font-semibold text-white">
                            {month.growthPercent > 0 ? '+' : ''}{month.growthPercent.toFixed(0)}%
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Monthly Breakdown Table */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="p-6 border-b border-slate-200">
          <h2 className="text-xl font-bold text-slate-800">Monthly Breakdown</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase">Month</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-slate-600 uppercase">Bookings</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-slate-600 uppercase">Revenue</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-slate-600 uppercase">Commission</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-slate-600 uppercase">Net</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-slate-600 uppercase">Growth</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {monthlyAnalytics.map((month, index) => (
                <tr
                  key={month.month}
                  className={`hover:bg-slate-50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}
                >
                  <td className="px-6 py-4">
                    <div className="font-semibold text-slate-900">{month.month}</div>
                    <div className="text-xs text-slate-500">Avg: {formatCurrency(month.avgBookingValue)}</div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="font-medium text-slate-900">{month.confirmedReservations}</div>
                    <div className="text-xs text-slate-500">of {month.totalReservations}</div>
                  </td>
                  <td className="px-6 py-4 text-right font-semibold text-slate-900">
                    {formatCurrency(month.totalRevenue)}
                  </td>
                  <td className="px-6 py-4 text-right text-slate-700">
                    {formatCurrency(month.commission)}
                  </td>
                  <td className="px-6 py-4 text-right font-medium text-slate-900">
                    {formatCurrency(month.netRevenue)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {month.growthPercent !== 0 ? (
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${
                        month.growthPercent > 0
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-rose-100 text-rose-700'
                      }`}>
                        {month.growthPercent > 0 ? <ArrowUpIcon className="h-3 w-3 mr-1" /> : <ArrowDownIcon className="h-3 w-3 mr-1" />}
                        {Math.abs(month.growthPercent).toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-100">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-bold text-slate-700 uppercase">Total</th>
                <th className="px-6 py-4 text-right text-sm font-bold text-slate-700">
                  {grandTotals.confirmedReservations}
                </th>
                <th className="px-6 py-4 text-right text-sm font-bold text-slate-700">
                  {formatCurrency(grandTotals.totalRevenue)}
                </th>
                <th className="px-6 py-4 text-right text-sm font-bold text-slate-700">
                  {formatCurrency(grandTotals.commission)}
                </th>
                <th className="px-6 py-4 text-right text-sm font-bold text-slate-700">
                  {formatCurrency(grandTotals.netRevenue)}
                </th>
                <th className="px-6 py-4 text-right">
                  {yoyComparison.growth !== 0 && (
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${
                      yoyComparison.growth > 0
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-rose-100 text-rose-700'
                    }`}>
                      {yoyComparison.growth > 0 ? <ArrowUpIcon className="h-3 w-3 mr-1" /> : <ArrowDownIcon className="h-3 w-3 mr-1" />}
                      {Math.abs(yoyComparison.growth).toFixed(1)}% YoY
                    </span>
                  )}
                </th>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ProfessionalSummaryDashboard;
