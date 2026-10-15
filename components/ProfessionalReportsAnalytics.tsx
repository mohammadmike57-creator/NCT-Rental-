import React, { useState, useMemo } from 'react';
import { YearData, AppData, Fleet, RentalSource, CompanyDetails, Reservation } from '../types';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// Icon Components
const ChartBarIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);

const DocumentReportIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const CalendarIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

const FilterIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
  </svg>
);

const DownloadIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
);

const TrendingUpIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
  </svg>
);

const TrendingDownIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
  </svg>
);

const PrinterIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
  </svg>
);

interface ProfessionalReportsAnalyticsProps {
  yearData: YearData;
  allYearsData: AppData;
  fleet: Fleet;
  sources: RentalSource[];
  year: number;
  companyDetails: CompanyDetails;
}

type DateRangePreset = 'month' | 'quarter' | 'year' | 'ytd' | 'custom';
type ReportTab = 'executive' | 'financial' | 'operational' | 'customer' | 'fleet';
type ComparisonPeriod = 'mom' | 'yoy' | 'none';

const ProfessionalReportsAnalytics: React.FC<ProfessionalReportsAnalyticsProps> = ({
  yearData,
  allYearsData,
  fleet,
  sources,
  year,
  companyDetails
}) => {
  const [activeTab, setActiveTab] = useState<ReportTab>('executive');
  const [dateRangePreset, setDateRangePreset] = useState<DateRangePreset>('year');
  const [comparisonPeriod, setComparisonPeriod] = useState<ComparisonPeriod>('yoy');
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSource, setSelectedSource] = useState<string>('all');

  // Calculate comprehensive analytics
  const analytics = useMemo(() => {
    const currentYearReservations = yearData?.reservations || [];
    const previousYearReservations = allYearsData?.[year - 1]?.reservations || [];

    // Current period metrics
    const totalRevenue = currentYearReservations.reduce((sum, res) => sum + (res.totalCost || 0), 0);
    const totalReservations = currentYearReservations.length;
    const completedReservations = currentYearReservations.filter(r => r.status === 'completed').length;
    const avgBookingValue = totalReservations > 0 ? totalRevenue / totalReservations : 0;

    // Previous period metrics
    const prevTotalRevenue = previousYearReservations.reduce((sum, res) => sum + (res.totalCost || 0), 0);
    const prevTotalReservations = previousYearReservations.length;
    const prevAvgBookingValue = prevTotalReservations > 0 ? prevTotalRevenue / prevTotalReservations : 0;

    // Growth calculations
    const revenueGrowth = prevTotalRevenue > 0 ? ((totalRevenue - prevTotalRevenue) / prevTotalRevenue) * 100 : 0;
    const reservationsGrowth = prevTotalReservations > 0 ? ((totalReservations - prevTotalReservations) / prevTotalReservations) * 100 : 0;
    const avgBookingGrowth = prevAvgBookingValue > 0 ? ((avgBookingValue - prevAvgBookingValue) / prevAvgBookingValue) * 100 : 0;

    // Utilization rate
    const totalFleetDays = Object.keys(fleet).length * 365;
    const totalRentalDays = currentYearReservations.reduce((sum, res) => {
      const start = new Date(res.startDate);
      const end = new Date(res.endDate);
      const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      return sum + days;
    }, 0);
    const utilizationRate = totalFleetDays > 0 ? (totalRentalDays / totalFleetDays) * 100 : 0;

    // Revenue by month
    const revenueByMonth = MONTHS.map((_, monthIndex) => {
      const monthRevenue = currentYearReservations
        .filter(res => new Date(res.startDate).getMonth() === monthIndex)
        .reduce((sum, res) => sum + (res.totalCost || 0), 0);
      return { month: MONTHS[monthIndex], revenue: monthRevenue };
    });

    // Revenue by source
    const revenueBySource = sources.map(source => {
      const sourceRevenue = currentYearReservations
        .filter(res => res.source === source.name)
        .reduce((sum, res) => sum + (res.totalCost || 0), 0);
      return { source: source.name, revenue: sourceRevenue };
    });

    // Revenue by category
    const revenueByCategory: { [key: string]: number } = {};
    currentYearReservations.forEach(res => {
      const vehicle = fleet[res.vehicleId];
      if (vehicle) {
        const category = vehicle.category || 'Uncategorized';
        revenueByCategory[category] = (revenueByCategory[category] || 0) + (res.totalCost || 0);
      }
    });

    // Customer analytics
    const customerFrequency: { [key: string]: number } = {};
    currentYearReservations.forEach(res => {
      const customerId = res.customerName + res.customerEmail;
      customerFrequency[customerId] = (customerFrequency[customerId] || 0) + 1;
    });
    const repeatCustomers = Object.values(customerFrequency).filter(freq => freq > 1).length;
    const repeatCustomerRate = Object.keys(customerFrequency).length > 0
      ? (repeatCustomers / Object.keys(customerFrequency).length) * 100
      : 0;

    // Fleet performance
    const fleetPerformance = Object.entries(fleet).map(([id, vehicle]) => {
      const vehicleReservations = currentYearReservations.filter(res => res.vehicleId === id);
      const vehicleRevenue = vehicleReservations.reduce((sum, res) => sum + (res.totalCost || 0), 0);
      const vehicleDays = vehicleReservations.reduce((sum, res) => {
        const start = new Date(res.startDate);
        const end = new Date(res.endDate);
        return sum + Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      }, 0);
      const vehicleUtilization = (vehicleDays / 365) * 100;

      return {
        id,
        name: `${vehicle.make} ${vehicle.model}`,
        category: vehicle.category,
        revenue: vehicleRevenue,
        reservations: vehicleReservations.length,
        utilization: vehicleUtilization,
        avgRevenue: vehicleReservations.length > 0 ? vehicleRevenue / vehicleReservations.length : 0
      };
    }).sort((a, b) => b.revenue - a.revenue);

    // Booking completion rate
    const totalBookings = currentYearReservations.length;
    const completionRate = totalBookings > 0 ? (completedReservations / totalBookings) * 100 : 0;

    // Average rental duration
    const avgDuration = currentYearReservations.length > 0
      ? currentYearReservations.reduce((sum, res) => {
          const start = new Date(res.startDate);
          const end = new Date(res.endDate);
          return sum + Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        }, 0) / currentYearReservations.length
      : 0;

    // Payment method breakdown
    const paymentMethods: { [key: string]: number } = {};
    currentYearReservations.forEach(res => {
      const method = res.paymentMethod || 'Unknown';
      paymentMethods[method] = (paymentMethods[method] || 0) + (res.totalCost || 0);
    });

    // Outstanding payments
    const outstandingPayments = currentYearReservations
      .filter(res => res.status === 'confirmed' && !res.paymentStatus)
      .reduce((sum, res) => sum + (res.totalCost || 0), 0);

    return {
      totalRevenue,
      totalReservations,
      avgBookingValue,
      utilizationRate,
      revenueGrowth,
      reservationsGrowth,
      avgBookingGrowth,
      revenueByMonth,
      revenueBySource,
      revenueByCategory,
      repeatCustomerRate,
      fleetPerformance,
      completionRate,
      avgDuration,
      paymentMethods,
      outstandingPayments,
      customerFrequency
    };
  }, [yearData, allYearsData, fleet, sources, year]);

  // Format currency
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  };

  // Format percentage
  const formatPercentage = (value: number): string => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
  };

  // Export to PDF
  const exportToPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header
    doc.setFontSize(20);
    doc.setTextColor(31, 41, 55);
    doc.text('Analytics Report', pageWidth / 2, 20, { align: 'center' });

    doc.setFontSize(12);
    doc.setTextColor(107, 114, 128);
    doc.text(`${companyDetails.name || 'Car Rental Business'}`, pageWidth / 2, 28, { align: 'center' });
    doc.text(`Report Period: ${year}`, pageWidth / 2, 35, { align: 'center' });

    // Executive Summary
    doc.setFontSize(16);
    doc.setTextColor(31, 41, 55);
    doc.text('Executive Summary', 14, 50);

    const summaryData = [
      ['Total Revenue', formatCurrency(analytics.totalRevenue), formatPercentage(analytics.revenueGrowth)],
      ['Total Reservations', analytics.totalReservations.toString(), formatPercentage(analytics.reservationsGrowth)],
      ['Average Booking Value', formatCurrency(analytics.avgBookingValue), formatPercentage(analytics.avgBookingGrowth)],
      ['Fleet Utilization', `${analytics.utilizationRate.toFixed(1)}%`, '-'],
      ['Completion Rate', `${analytics.completionRate.toFixed(1)}%`, '-'],
      ['Repeat Customer Rate', `${analytics.repeatCustomerRate.toFixed(1)}%`, '-']
    ];

    (doc as any).autoTable({
      startY: 55,
      head: [['Metric', 'Value', 'Growth']],
      body: summaryData,
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246] }
    });

    // Revenue by Month
    doc.addPage();
    doc.setFontSize(16);
    doc.text('Monthly Revenue Breakdown', 14, 20);

    const monthlyData = analytics.revenueByMonth.map(item => [
      item.month,
      formatCurrency(item.revenue)
    ]);

    (doc as any).autoTable({
      startY: 25,
      head: [['Month', 'Revenue']],
      body: monthlyData,
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246] }
    });

    // Fleet Performance
    doc.addPage();
    doc.setFontSize(16);
    doc.text('Fleet Performance', 14, 20);

    const fleetData = analytics.fleetPerformance.slice(0, 10).map(vehicle => [
      vehicle.name,
      formatCurrency(vehicle.revenue),
      vehicle.reservations.toString(),
      `${vehicle.utilization.toFixed(1)}%`
    ]);

    (doc as any).autoTable({
      startY: 25,
      head: [['Vehicle', 'Revenue', 'Bookings', 'Utilization']],
      body: fleetData,
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246] }
    });

    // Save PDF
    doc.save(`Analytics_Report_${year}.pdf`);
  };

  // Export to CSV
  const exportToCSV = () => {
    const csvData = analytics.revenueByMonth.map(item =>
      `${item.month},${item.revenue}`
    ).join('\n');

    const blob = new Blob([`Month,Revenue\n${csvData}`], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Analytics_Report_${year}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  // Print report
  const printReport = () => {
    window.print();
  };

  return (
    <div className="professional-reports-analytics">
      {/* Header */}
      <div className="reports-header">
        <div className="header-content">
          <div className="header-icon">
            <ChartBarIcon className="icon" />
          </div>
          <div>
            <h1 className="header-title">Reports & Analytics</h1>
            <p className="header-subtitle">Comprehensive Business Intelligence Dashboard</p>
          </div>
        </div>

        <div className="header-actions">
          <button onClick={exportToPDF} className="action-button">
            <DownloadIcon className="icon" />
            Export PDF
          </button>
          <button onClick={exportToCSV} className="action-button">
            <DownloadIcon className="icon" />
            Export CSV
          </button>
          <button onClick={printReport} className="action-button">
            <PrinterIcon className="icon" />
            Print
          </button>
        </div>
      </div>

      {/* Date Range & Filters */}
      <div className="filters-section">
        <div className="filter-group">
          <label className="filter-label">
            <CalendarIcon className="icon" />
            Date Range
          </label>
          <select
            value={dateRangePreset}
            onChange={(e) => setDateRangePreset(e.target.value as DateRangePreset)}
            className="filter-select"
          >
            <option value="month">This Month</option>
            <option value="quarter">This Quarter</option>
            <option value="year">This Year</option>
            <option value="ytd">Year to Date</option>
            <option value="custom">Custom Range</option>
          </select>
        </div>

        <div className="filter-group">
          <label className="filter-label">
            <FilterIcon className="icon" />
            Compare To
          </label>
          <select
            value={comparisonPeriod}
            onChange={(e) => setComparisonPeriod(e.target.value as ComparisonPeriod)}
            className="filter-select"
          >
            <option value="none">No Comparison</option>
            <option value="mom">Previous Month</option>
            <option value="yoy">Previous Year</option>
          </select>
        </div>

        <div className="filter-group">
          <label className="filter-label">Category</label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Categories</option>
            {Object.keys(analytics.revenueByCategory).map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label className="filter-label">Source</label>
          <select
            value={selectedSource}
            onChange={(e) => setSelectedSource(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Sources</option>
            {sources.map(source => (
              <option key={source.name} value={source.name}>{source.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="tab-navigation">
        <button
          className={`tab-button ${activeTab === 'executive' ? 'active' : ''}`}
          onClick={() => setActiveTab('executive')}
        >
          Executive Dashboard
        </button>
        <button
          className={`tab-button ${activeTab === 'financial' ? 'active' : ''}`}
          onClick={() => setActiveTab('financial')}
        >
          Financial Reports
        </button>
        <button
          className={`tab-button ${activeTab === 'operational' ? 'active' : ''}`}
          onClick={() => setActiveTab('operational')}
        >
          Operational Reports
        </button>
        <button
          className={`tab-button ${activeTab === 'customer' ? 'active' : ''}`}
          onClick={() => setActiveTab('customer')}
        >
          Customer Analytics
        </button>
        <button
          className={`tab-button ${activeTab === 'fleet' ? 'active' : ''}`}
          onClick={() => setActiveTab('fleet')}
        >
          Fleet Performance
        </button>
      </div>

      {/* Executive Dashboard Tab */}
      {activeTab === 'executive' && (
        <div className="tab-content">
          {/* KPI Cards */}
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-header">
                <span className="kpi-label">Total Revenue</span>
                <div className={`kpi-trend ${analytics.revenueGrowth >= 0 ? 'positive' : 'negative'}`}>
                  {analytics.revenueGrowth >= 0 ? <TrendingUpIcon className="icon" /> : <TrendingDownIcon className="icon" />}
                  {formatPercentage(analytics.revenueGrowth)}
                </div>
              </div>
              <div className="kpi-value">{formatCurrency(analytics.totalRevenue)}</div>
              <div className="kpi-footer">vs. previous year</div>
            </div>

            <div className="kpi-card">
              <div className="kpi-header">
                <span className="kpi-label">Total Reservations</span>
                <div className={`kpi-trend ${analytics.reservationsGrowth >= 0 ? 'positive' : 'negative'}`}>
                  {analytics.reservationsGrowth >= 0 ? <TrendingUpIcon className="icon" /> : <TrendingDownIcon className="icon" />}
                  {formatPercentage(analytics.reservationsGrowth)}
                </div>
              </div>
              <div className="kpi-value">{analytics.totalReservations.toLocaleString()}</div>
              <div className="kpi-footer">vs. previous year</div>
            </div>

            <div className="kpi-card">
              <div className="kpi-header">
                <span className="kpi-label">Average Booking Value</span>
                <div className={`kpi-trend ${analytics.avgBookingGrowth >= 0 ? 'positive' : 'negative'}`}>
                  {analytics.avgBookingGrowth >= 0 ? <TrendingUpIcon className="icon" /> : <TrendingDownIcon className="icon" />}
                  {formatPercentage(analytics.avgBookingGrowth)}
                </div>
              </div>
              <div className="kpi-value">{formatCurrency(analytics.avgBookingValue)}</div>
              <div className="kpi-footer">vs. previous year</div>
            </div>

            <div className="kpi-card">
              <div className="kpi-header">
                <span className="kpi-label">Fleet Utilization</span>
                <div className="kpi-badge">
                  {analytics.utilizationRate > 70 ? 'Excellent' : analytics.utilizationRate > 50 ? 'Good' : 'Low'}
                </div>
              </div>
              <div className="kpi-value">{analytics.utilizationRate.toFixed(1)}%</div>
              <div className="kpi-progress">
                <div className="progress-bar" style={{ width: `${Math.min(analytics.utilizationRate, 100)}%` }}></div>
              </div>
            </div>
          </div>

          {/* Revenue Trend Chart */}
          <div className="chart-section">
            <div className="section-header">
              <h2 className="section-title">Revenue Trend</h2>
              <div className="section-actions">
                <button className="chart-toggle active">Monthly</button>
                <button className="chart-toggle">Quarterly</button>
                <button className="chart-toggle">Yearly</button>
              </div>
            </div>

            <div className="bar-chart">
              {analytics.revenueByMonth.map((item, index) => {
                const maxRevenue = Math.max(...analytics.revenueByMonth.map(m => m.revenue));
                const height = maxRevenue > 0 ? (item.revenue / maxRevenue) * 100 : 0;

                return (
                  <div key={index} className="bar-container">
                    <div className="bar-wrapper">
                      <div className="bar-value">{formatCurrency(item.revenue)}</div>
                      <div className="bar" style={{ height: `${height}%` }}>
                        <div className="bar-fill"></div>
                      </div>
                    </div>
                    <div className="bar-label">{item.month.substring(0, 3)}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Stats */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon revenue">
                <DocumentReportIcon className="icon" />
              </div>
              <div className="stat-content">
                <div className="stat-label">Completion Rate</div>
                <div className="stat-value">{analytics.completionRate.toFixed(1)}%</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon bookings">
                <CalendarIcon className="icon" />
              </div>
              <div className="stat-content">
                <div className="stat-label">Avg. Rental Duration</div>
                <div className="stat-value">{analytics.avgDuration.toFixed(1)} days</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon customers">
                <ChartBarIcon className="icon" />
              </div>
              <div className="stat-content">
                <div className="stat-label">Repeat Customers</div>
                <div className="stat-value">{analytics.repeatCustomerRate.toFixed(1)}%</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon outstanding">
                <DocumentReportIcon className="icon" />
              </div>
              <div className="stat-content">
                <div className="stat-label">Outstanding Payments</div>
                <div className="stat-value">{formatCurrency(analytics.outstandingPayments)}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Financial Reports Tab */}
      {activeTab === 'financial' && (
        <div className="tab-content">
          <div className="reports-grid">
            {/* Revenue by Source */}
            <div className="report-card">
              <h3 className="report-title">Revenue by Source</h3>
              <div className="report-content">
                {analytics.revenueBySource.map((item, index) => (
                  <div key={index} className="report-row">
                    <span className="report-label">{item.source}</span>
                    <div className="report-bar-container">
                      <div
                        className="report-bar"
                        style={{
                          width: `${(item.revenue / analytics.totalRevenue) * 100}%`
                        }}
                      ></div>
                    </div>
                    <span className="report-value">{formatCurrency(item.revenue)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Revenue by Category */}
            <div className="report-card">
              <h3 className="report-title">Revenue by Category</h3>
              <div className="report-content">
                {Object.entries(analytics.revenueByCategory)
                  .sort(([, a], [, b]) => b - a)
                  .map(([category, revenue], index) => (
                    <div key={index} className="report-row">
                      <span className="report-label">{category}</span>
                      <div className="report-bar-container">
                        <div
                          className="report-bar category"
                          style={{
                            width: `${(revenue / analytics.totalRevenue) * 100}%`
                          }}
                        ></div>
                      </div>
                      <span className="report-value">{formatCurrency(revenue)}</span>
                    </div>
                  ))}
              </div>
            </div>

            {/* Payment Methods */}
            <div className="report-card">
              <h3 className="report-title">Revenue by Payment Method</h3>
              <div className="report-content">
                {Object.entries(analytics.paymentMethods)
                  .sort(([, a], [, b]) => b - a)
                  .map(([method, revenue], index) => (
                    <div key={index} className="report-row">
                      <span className="report-label">{method}</span>
                      <div className="report-bar-container">
                        <div
                          className="report-bar payment"
                          style={{
                            width: `${(revenue / analytics.totalRevenue) * 100}%`
                          }}
                        ></div>
                      </div>
                      <span className="report-value">{formatCurrency(revenue)}</span>
                    </div>
                  ))}
              </div>
            </div>

            {/* Financial Summary */}
            <div className="report-card">
              <h3 className="report-title">Financial Summary</h3>
              <div className="report-content summary">
                <div className="summary-row">
                  <span className="summary-label">Total Revenue</span>
                  <span className="summary-value positive">{formatCurrency(analytics.totalRevenue)}</span>
                </div>
                <div className="summary-row">
                  <span className="summary-label">Outstanding Payments</span>
                  <span className="summary-value warning">{formatCurrency(analytics.outstandingPayments)}</span>
                </div>
                <div className="summary-row">
                  <span className="summary-label">Completed Transactions</span>
                  <span className="summary-value">{analytics.totalReservations}</span>
                </div>
                <div className="summary-row total">
                  <span className="summary-label">Net Revenue</span>
                  <span className="summary-value positive">
                    {formatCurrency(analytics.totalRevenue - analytics.outstandingPayments)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Operational Reports Tab */}
      {activeTab === 'operational' && (
        <div className="tab-content">
          <div className="reports-grid">
            {/* Fleet Utilization */}
            <div className="report-card full-width">
              <h3 className="report-title">Fleet Utilization Overview</h3>
              <div className="utilization-grid">
                {analytics.fleetPerformance.map((vehicle, index) => (
                  <div key={index} className="utilization-item">
                    <div className="utilization-header">
                      <span className="vehicle-name">{vehicle.name}</span>
                      <span className="utilization-percent">{vehicle.utilization.toFixed(1)}%</span>
                    </div>
                    <div className="utilization-bar-bg">
                      <div
                        className={`utilization-bar ${
                          vehicle.utilization > 70 ? 'high' :
                          vehicle.utilization > 40 ? 'medium' : 'low'
                        }`}
                        style={{ width: `${Math.min(vehicle.utilization, 100)}%` }}
                      ></div>
                    </div>
                    <div className="utilization-stats">
                      <span>{vehicle.reservations} bookings</span>
                      <span>{formatCurrency(vehicle.revenue)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Booking Performance */}
            <div className="report-card">
              <h3 className="report-title">Booking Performance</h3>
              <div className="metrics-list">
                <div className="metric-item">
                  <span className="metric-label">Total Bookings</span>
                  <span className="metric-value">{analytics.totalReservations}</span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Completion Rate</span>
                  <span className="metric-value">{analytics.completionRate.toFixed(1)}%</span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Avg. Duration</span>
                  <span className="metric-value">{analytics.avgDuration.toFixed(1)} days</span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Avg. Booking Value</span>
                  <span className="metric-value">{formatCurrency(analytics.avgBookingValue)}</span>
                </div>
              </div>
            </div>

            {/* Monthly Bookings */}
            <div className="report-card">
              <h3 className="report-title">Monthly Booking Trends</h3>
              <div className="mini-chart">
                {analytics.revenueByMonth.map((item, index) => {
                  const maxRevenue = Math.max(...analytics.revenueByMonth.map(m => m.revenue));
                  const height = maxRevenue > 0 ? (item.revenue / maxRevenue) * 100 : 0;

                  return (
                    <div key={index} className="mini-bar">
                      <div className="mini-bar-fill" style={{ height: `${height}%` }}></div>
                      <div className="mini-bar-label">{item.month.substring(0, 1)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Customer Analytics Tab */}
      {activeTab === 'customer' && (
        <div className="tab-content">
          <div className="reports-grid">
            {/* Customer Metrics */}
            <div className="report-card">
              <h3 className="report-title">Customer Metrics</h3>
              <div className="metrics-list">
                <div className="metric-item">
                  <span className="metric-label">Total Customers</span>
                  <span className="metric-value">
                    {Object.keys(analytics.customerFrequency).length}
                  </span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Repeat Customer Rate</span>
                  <span className="metric-value">{analytics.repeatCustomerRate.toFixed(1)}%</span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Avg. Customer Value</span>
                  <span className="metric-value">
                    {formatCurrency(
                      analytics.totalRevenue / Math.max(Object.keys(analytics.customerFrequency).length, 1)
                    )}
                  </span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Avg. Bookings per Customer</span>
                  <span className="metric-value">
                    {(analytics.totalReservations / Math.max(Object.keys(analytics.customerFrequency).length, 1)).toFixed(1)}
                  </span>
                </div>
              </div>
            </div>

            {/* Customer Distribution */}
            <div className="report-card">
              <h3 className="report-title">Customer Booking Frequency</h3>
              <div className="report-content">
                {Object.entries(
                  Object.values(analytics.customerFrequency).reduce((acc: { [key: string]: number }, freq) => {
                    const key = freq === 1 ? '1 booking' : freq <= 3 ? '2-3 bookings' : freq <= 5 ? '4-5 bookings' : '6+ bookings';
                    acc[key] = (acc[key] || 0) + 1;
                    return acc;
                  }, {})
                ).map(([range, count], index) => (
                  <div key={index} className="report-row">
                    <span className="report-label">{range}</span>
                    <div className="report-bar-container">
                      <div
                        className="report-bar customer"
                        style={{
                          width: `${(count / Object.keys(analytics.customerFrequency).length) * 100}%`
                        }}
                      ></div>
                    </div>
                    <span className="report-value">{count} customers</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Customer Acquisition */}
            <div className="report-card full-width">
              <h3 className="report-title">Customer Acquisition by Source</h3>
              <div className="report-content">
                {analytics.revenueBySource.map((item, index) => {
                  const customerCount = yearData?.reservations?.filter(
                    res => res.source === item.source
                  ).length || 0;

                  return (
                    <div key={index} className="acquisition-row">
                      <div className="acquisition-source">
                        <span className="source-name">{item.source}</span>
                        <span className="source-count">{customerCount} customers</span>
                      </div>
                      <div className="acquisition-metrics">
                        <div className="acquisition-metric">
                          <span className="metric-label">Revenue</span>
                          <span className="metric-value">{formatCurrency(item.revenue)}</span>
                        </div>
                        <div className="acquisition-metric">
                          <span className="metric-label">Avg. Value</span>
                          <span className="metric-value">
                            {formatCurrency(customerCount > 0 ? item.revenue / customerCount : 0)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fleet Performance Tab */}
      {activeTab === 'fleet' && (
        <div className="tab-content">
          <div className="fleet-performance-table">
            <table className="performance-table">
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Category</th>
                  <th>Revenue</th>
                  <th>Bookings</th>
                  <th>Utilization</th>
                  <th>Avg. Revenue</th>
                  <th>Performance</th>
                </tr>
              </thead>
              <tbody>
                {analytics.fleetPerformance.map((vehicle, index) => (
                  <tr key={index}>
                    <td className="vehicle-cell">
                      <div className="vehicle-name">{vehicle.name}</div>
                      <div className="vehicle-id">ID: {vehicle.id}</div>
                    </td>
                    <td>{vehicle.category || 'N/A'}</td>
                    <td className="revenue-cell">{formatCurrency(vehicle.revenue)}</td>
                    <td>{vehicle.reservations}</td>
                    <td>
                      <div className="utilization-cell">
                        <span>{vehicle.utilization.toFixed(1)}%</span>
                        <div className="mini-progress">
                          <div
                            className={`mini-progress-bar ${
                              vehicle.utilization > 70 ? 'high' :
                              vehicle.utilization > 40 ? 'medium' : 'low'
                            }`}
                            style={{ width: `${Math.min(vehicle.utilization, 100)}%` }}
                          ></div>
                        </div>
                      </div>
                    </td>
                    <td>{formatCurrency(vehicle.avgRevenue)}</td>
                    <td>
                      <span className={`performance-badge ${
                        vehicle.utilization > 70 ? 'excellent' :
                        vehicle.utilization > 40 ? 'good' : 'poor'
                      }`}>
                        {vehicle.utilization > 70 ? 'Excellent' :
                         vehicle.utilization > 40 ? 'Good' : 'Needs Attention'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Fleet Summary Cards */}
          <div className="fleet-summary-grid">
            <div className="summary-card">
              <h4 className="summary-title">Top Performer</h4>
              {analytics.fleetPerformance[0] && (
                <>
                  <div className="summary-vehicle">{analytics.fleetPerformance[0].name}</div>
                  <div className="summary-stat">
                    {formatCurrency(analytics.fleetPerformance[0].revenue)}
                  </div>
                </>
              )}
            </div>

            <div className="summary-card">
              <h4 className="summary-title">Highest Utilization</h4>
              {(() => {
                const highest = [...analytics.fleetPerformance].sort((a, b) => b.utilization - a.utilization)[0];
                return highest ? (
                  <>
                    <div className="summary-vehicle">{highest.name}</div>
                    <div className="summary-stat">{highest.utilization.toFixed(1)}%</div>
                  </>
                ) : null;
              })()}
            </div>

            <div className="summary-card">
              <h4 className="summary-title">Most Bookings</h4>
              {(() => {
                const mostBooked = [...analytics.fleetPerformance].sort((a, b) => b.reservations - a.reservations)[0];
                return mostBooked ? (
                  <>
                    <div className="summary-vehicle">{mostBooked.name}</div>
                    <div className="summary-stat">{mostBooked.reservations} bookings</div>
                  </>
                ) : null;
              })()}
            </div>

            <div className="summary-card">
              <h4 className="summary-title">Fleet Average</h4>
              <div className="summary-vehicle">Utilization Rate</div>
              <div className="summary-stat">{analytics.utilizationRate.toFixed(1)}%</div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .professional-reports-analytics {
          padding: 2rem;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
        }

        .reports-header {
          background: white;
          border-radius: 12px;
          padding: 2rem;
          margin-bottom: 2rem;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .header-content {
          display: flex;
          align-items: center;
          gap: 1.5rem;
        }

        .header-icon {
          width: 64px;
          height: 64px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .header-icon .icon {
          width: 32px;
          height: 32px;
          color: white;
        }

        .header-title {
          font-size: 2rem;
          font-weight: 700;
          color: #1f2937;
          margin: 0;
        }

        .header-subtitle {
          font-size: 1rem;
          color: #6b7280;
          margin: 0.25rem 0 0 0;
        }

        .header-actions {
          display: flex;
          gap: 1rem;
        }

        .action-button {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1.5rem;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .action-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }

        .action-button .icon {
          width: 20px;
          height: 20px;
        }

        .filters-section {
          background: white;
          border-radius: 12px;
          padding: 1.5rem;
          margin-bottom: 2rem;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1.5rem;
        }

        .filter-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .filter-label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-weight: 600;
          color: #374151;
          font-size: 0.875rem;
        }

        .filter-label .icon {
          width: 16px;
          height: 16px;
          color: #667eea;
        }

        .filter-select {
          padding: 0.75rem;
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          font-size: 0.875rem;
          background: white;
          cursor: pointer;
          transition: border-color 0.2s;
        }

        .filter-select:focus {
          outline: none;
          border-color: #667eea;
        }

        .tab-navigation {
          background: white;
          border-radius: 12px;
          padding: 0.5rem;
          margin-bottom: 2rem;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          display: flex;
          gap: 0.5rem;
          overflow-x: auto;
        }

        .tab-button {
          flex: 1;
          padding: 1rem 2rem;
          border: none;
          background: transparent;
          color: #6b7280;
          font-weight: 600;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
        }

        .tab-button:hover {
          background: #f3f4f6;
        }

        .tab-button.active {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }

        .tab-content {
          animation: fadeIn 0.3s ease-in;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 1.5rem;
          margin-bottom: 2rem;
        }

        .kpi-card {
          background: white;
          border-radius: 12px;
          padding: 1.5rem;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }

        .kpi-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }

        .kpi-label {
          font-size: 0.875rem;
          font-weight: 600;
          color: #6b7280;
          text-transform: uppercase;
        }

        .kpi-trend {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          font-weight: 600;
          font-size: 0.875rem;
          padding: 0.25rem 0.75rem;
          border-radius: 20px;
        }

        .kpi-trend.positive {
          background: #d1fae5;
          color: #065f46;
        }

        .kpi-trend.negative {
          background: #fee2e2;
          color: #991b1b;
        }

        .kpi-trend .icon {
          width: 16px;
          height: 16px;
        }

        .kpi-value {
          font-size: 2rem;
          font-weight: 700;
          color: #1f2937;
          margin-bottom: 0.5rem;
        }

        .kpi-footer {
          font-size: 0.75rem;
          color: #9ca3af;
        }

        .kpi-badge {
          padding: 0.25rem 0.75rem;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 600;
          background: #dbeafe;
          color: #1e40af;
        }

        .kpi-progress {
          height: 8px;
          background: #e5e7eb;
          border-radius: 4px;
          overflow: hidden;
        }

        .progress-bar {
          height: 100%;
          background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
          border-radius: 4px;
          transition: width 0.3s ease;
        }

        .chart-section {
          background: white;
          border-radius: 12px;
          padding: 2rem;
          margin-bottom: 2rem;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
        }

        .section-title {
          font-size: 1.5rem;
          font-weight: 700;
          color: #1f2937;
          margin: 0;
        }

        .section-actions {
          display: flex;
          gap: 0.5rem;
        }

        .chart-toggle {
          padding: 0.5rem 1rem;
          border: 2px solid #e5e7eb;
          background: white;
          color: #6b7280;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .chart-toggle.active {
          border-color: #667eea;
          background: #667eea;
          color: white;
        }

        .bar-chart {
          display: flex;
          gap: 1rem;
          align-items: flex-end;
          height: 300px;
          padding: 1rem 0;
        }

        .bar-container {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          height: 100%;
        }

        .bar-wrapper {
          flex: 1;
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-end;
        }

        .bar-value {
          font-size: 0.75rem;
          font-weight: 600;
          color: #6b7280;
          margin-bottom: 0.5rem;
          white-space: nowrap;
        }

        .bar {
          width: 100%;
          min-height: 4px;
          border-radius: 4px 4px 0 0;
          background: #f3f4f6;
          position: relative;
          transition: all 0.3s ease;
        }

        .bar-fill {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 100%;
          background: linear-gradient(180deg, #667eea 0%, #764ba2 100%);
          border-radius: 4px 4px 0 0;
        }

        .bar-label {
          font-size: 0.75rem;
          font-weight: 600;
          color: #6b7280;
          margin-top: 0.5rem;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 1.5rem;
        }

        .stat-card {
          background: white;
          border-radius: 12px;
          padding: 1.5rem;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .stat-icon {
          width: 48px;
          height: 48px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .stat-icon.revenue {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        }

        .stat-icon.bookings {
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
        }

        .stat-icon.customers {
          background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
        }

        .stat-icon.outstanding {
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
        }

        .stat-icon .icon {
          width: 24px;
          height: 24px;
          color: white;
        }

        .stat-content {
          flex: 1;
        }

        .stat-label {
          display: block;
          font-size: 0.875rem;
          color: #6b7280;
          margin-bottom: 0.25rem;
        }

        .stat-value {
          font-size: 1.5rem;
          font-weight: 700;
          color: #1f2937;
        }

        .reports-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
          gap: 1.5rem;
        }

        .report-card {
          background: white;
          border-radius: 12px;
          padding: 1.5rem;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }

        .report-card.full-width {
          grid-column: 1 / -1;
        }

        .report-title {
          font-size: 1.25rem;
          font-weight: 700;
          color: #1f2937;
          margin: 0 0 1.5rem 0;
        }

        .report-content {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .report-row {
          display: grid;
          grid-template-columns: 150px 1fr 120px;
          align-items: center;
          gap: 1rem;
        }

        .report-label {
          font-weight: 600;
          color: #374151;
          font-size: 0.875rem;
        }

        .report-bar-container {
          height: 24px;
          background: #f3f4f6;
          border-radius: 12px;
          overflow: hidden;
        }

        .report-bar {
          height: 100%;
          background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
          border-radius: 12px;
          transition: width 0.5s ease;
        }

        .report-bar.category {
          background: linear-gradient(90deg, #10b981 0%, #059669 100%);
        }

        .report-bar.payment {
          background: linear-gradient(90deg, #f59e0b 0%, #d97706 100%);
        }

        .report-bar.customer {
          background: linear-gradient(90deg, #8b5cf6 0%, #7c3aed 100%);
        }

        .report-value {
          font-weight: 600;
          color: #1f2937;
          text-align: right;
        }

        .report-content.summary {
          gap: 0;
        }

        .summary-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 0;
          border-bottom: 1px solid #e5e7eb;
        }

        .summary-row.total {
          border-bottom: none;
          border-top: 2px solid #374151;
          margin-top: 0.5rem;
          padding-top: 1.5rem;
        }

        .summary-label {
          font-weight: 600;
          color: #6b7280;
        }

        .summary-value {
          font-weight: 700;
          color: #1f2937;
          font-size: 1.125rem;
        }

        .summary-value.positive {
          color: #059669;
        }

        .summary-value.warning {
          color: #d97706;
        }

        .metrics-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .metric-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
          background: #f9fafb;
          border-radius: 8px;
        }

        .metric-label {
          font-weight: 600;
          color: #6b7280;
          font-size: 0.875rem;
        }

        .metric-value {
          font-weight: 700;
          color: #1f2937;
          font-size: 1.125rem;
        }

        .utilization-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 1rem;
        }

        .utilization-item {
          padding: 1rem;
          background: #f9fafb;
          border-radius: 8px;
        }

        .utilization-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.75rem;
        }

        .vehicle-name {
          font-weight: 600;
          color: #1f2937;
          font-size: 0.875rem;
        }

        .utilization-percent {
          font-weight: 700;
          color: #667eea;
        }

        .utilization-bar-bg {
          height: 8px;
          background: #e5e7eb;
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 0.5rem;
        }

        .utilization-bar {
          height: 100%;
          border-radius: 4px;
          transition: width 0.5s ease;
        }

        .utilization-bar.high {
          background: linear-gradient(90deg, #10b981 0%, #059669 100%);
        }

        .utilization-bar.medium {
          background: linear-gradient(90deg, #f59e0b 0%, #d97706 100%);
        }

        .utilization-bar.low {
          background: linear-gradient(90deg, #ef4444 0%, #dc2626 100%);
        }

        .utilization-stats {
          display: flex;
          justify-content: space-between;
          font-size: 0.75rem;
          color: #6b7280;
        }

        .mini-chart {
          display: flex;
          gap: 0.5rem;
          align-items: flex-end;
          height: 100px;
          padding: 1rem 0;
        }

        .mini-bar {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          height: 100%;
        }

        .mini-bar-fill {
          width: 100%;
          background: linear-gradient(180deg, #667eea 0%, #764ba2 100%);
          border-radius: 4px 4px 0 0;
          min-height: 2px;
        }

        .mini-bar-label {
          font-size: 0.625rem;
          color: #9ca3af;
          margin-top: 0.25rem;
        }

        .acquisition-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
          background: #f9fafb;
          border-radius: 8px;
        }

        .acquisition-source {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .source-name {
          font-weight: 600;
          color: #1f2937;
        }

        .source-count {
          font-size: 0.875rem;
          color: #6b7280;
        }

        .acquisition-metrics {
          display: flex;
          gap: 2rem;
        }

        .acquisition-metric {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
        }

        .fleet-performance-table {
          background: white;
          border-radius: 12px;
          padding: 1.5rem;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          margin-bottom: 2rem;
          overflow-x: auto;
        }

        .performance-table {
          width: 100%;
          border-collapse: collapse;
        }

        .performance-table th {
          text-align: left;
          padding: 1rem;
          background: #f9fafb;
          color: #6b7280;
          font-weight: 600;
          font-size: 0.875rem;
          text-transform: uppercase;
          border-bottom: 2px solid #e5e7eb;
        }

        .performance-table td {
          padding: 1rem;
          border-bottom: 1px solid #f3f4f6;
        }

        .performance-table tbody tr:hover {
          background: #f9fafb;
        }

        .vehicle-cell {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .vehicle-id {
          font-size: 0.75rem;
          color: #9ca3af;
        }

        .revenue-cell {
          font-weight: 700;
          color: #059669;
        }

        .utilization-cell {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .mini-progress {
          height: 4px;
          background: #e5e7eb;
          border-radius: 2px;
          overflow: hidden;
        }

        .mini-progress-bar {
          height: 100%;
          border-radius: 2px;
          transition: width 0.3s ease;
        }

        .mini-progress-bar.high {
          background: #10b981;
        }

        .mini-progress-bar.medium {
          background: #f59e0b;
        }

        .mini-progress-bar.low {
          background: #ef4444;
        }

        .performance-badge {
          padding: 0.25rem 0.75rem;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 600;
          display: inline-block;
        }

        .performance-badge.excellent {
          background: #d1fae5;
          color: #065f46;
        }

        .performance-badge.good {
          background: #fef3c7;
          color: #92400e;
        }

        .performance-badge.poor {
          background: #fee2e2;
          color: #991b1b;
        }

        .fleet-summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 1.5rem;
        }

        .summary-card {
          background: white;
          border-radius: 12px;
          padding: 1.5rem;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          text-align: center;
        }

        .summary-title {
          font-size: 0.875rem;
          color: #6b7280;
          font-weight: 600;
          margin: 0 0 1rem 0;
          text-transform: uppercase;
        }

        .summary-vehicle {
          font-weight: 600;
          color: #374151;
          margin-bottom: 0.5rem;
        }

        .summary-stat {
          font-size: 1.75rem;
          font-weight: 700;
          color: #667eea;
        }

        @media print {
          .reports-header,
          .filters-section,
          .tab-navigation,
          .header-actions,
          .section-actions {
            display: none !important;
          }

          .professional-reports-analytics {
            background: white;
            padding: 0;
          }

          .tab-content {
            page-break-inside: avoid;
          }
        }

        @media (max-width: 768px) {
          .professional-reports-analytics {
            padding: 1rem;
          }

          .reports-header {
            flex-direction: column;
            gap: 1rem;
          }

          .header-actions {
            width: 100%;
            flex-direction: column;
          }

          .action-button {
            width: 100%;
            justify-content: center;
          }

          .filters-section {
            grid-template-columns: 1fr;
          }

          .tab-navigation {
            overflow-x: scroll;
          }

          .kpi-grid,
          .stats-grid,
          .reports-grid,
          .fleet-summary-grid {
            grid-template-columns: 1fr;
          }

          .report-row {
            grid-template-columns: 1fr;
            gap: 0.5rem;
          }

          .report-bar-container {
            order: 2;
          }

          .report-value {
            text-align: left;
          }

          .bar-chart {
            height: 200px;
          }

          .bar-value {
            font-size: 0.625rem;
          }

          .fleet-performance-table {
            overflow-x: scroll;
          }

          .performance-table {
            min-width: 800px;
          }
        }
      `}</style>
    </div>
  );
};

export default ProfessionalReportsAnalytics;
