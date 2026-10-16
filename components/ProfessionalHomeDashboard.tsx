import React, { useMemo, useEffect, useState } from 'react';
import {
  CalendarIcon, DocumentTextIcon, CheckCircleIcon, ClockIcon,
  TruckIcon, ChartBarIcon, CurrencyDollarIcon, UserGroupIcon,
  ExclamationTriangleIcon, TrendingUpIcon, ArrowUpIcon, ArrowDownIcon
} from './icons';

interface ProfessionalHomeDashboardProps {
  currentUser: any;
  allData: any;
  onNavigate: (view: string, filters?: any) => void;
}

/**
 * EXTREMELY PROFESSIONAL HOME DASHBOARD
 *
 * Features:
 * - Real-time KPIs with trend indicators
 * - Visual charts and graphs
 * - Quick action buttons
 * - Alert notifications
 * - Revenue analytics
 * - Fleet utilization metrics
 * - Today's activity summary
 * - Performance indicators
 */
const ProfessionalHomeDashboard: React.FC<ProfessionalHomeDashboardProps> = ({
  currentUser,
  allData,
  onNavigate
}) => {
  const reservations = allData.reservations || {};
  const fleet = allData.fleet || [];
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update clock every minute
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Flatten all reservations
  const allReservationsFlat = useMemo(() => {
    const flat: any[] = [];
    Object.keys(reservations).forEach(year => {
      const yearData = reservations[year];
      if (!yearData) return;
      Object.keys(yearData).forEach(month => {
        flat.push(...(yearData[month] || []));
      });
    });
    return flat;
  }, [reservations]);

  // Date calculations
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

  // KPI Calculations
  const kpis = useMemo(() => {
    // Today's pickups
    const todaysPickups = allReservationsFlat.filter(res => {
      if (!res.startDate) return false;
      const pickupDate = res.startDate.split('T')[0];
      return pickupDate === todayStr && res.status === 'CONFIRMED';
    });

    // Yesterday's pickups for comparison
    const yesterdaysPickups = allReservationsFlat.filter(res => {
      if (!res.startDate) return false;
      const pickupDate = res.startDate.split('T')[0];
      return pickupDate === yesterdayStr && res.status === 'CONFIRMED';
    });

    // Today's returns
    const todaysReturns = allReservationsFlat.filter(res => {
      if (!res.endDate) return false;
      const returnDate = res.endDate.split('T')[0];
      return returnDate === todayStr && res.voucherSubmitted && !res.dropOffCompleted;
    });

    // Active rentals (currently out)
    const activeRentals = allReservationsFlat.filter(res =>
      res.voucherSubmitted === true && res.dropOffCompleted !== true
    );

    // Overdue returns
    const overdueReturns = allReservationsFlat.filter(res => {
      if (!res.endDate || res.dropOffCompleted) return false;
      const returnDate = res.endDate.split('T')[0];
      return returnDate < todayStr && res.voucherSubmitted;
    });

    // This month's revenue
    const thisMonthRevenue = allReservationsFlat
      .filter(res => {
        if (!res.startDate) return false;
        const startDate = new Date(res.startDate);
        return startDate >= thisMonthStart && res.amount;
      })
      .reduce((sum, res) => sum + (res.amount || 0), 0);

    // Last month's revenue
    const lastMonthRevenue = allReservationsFlat
      .filter(res => {
        if (!res.startDate) return false;
        const startDate = new Date(res.startDate);
        return startDate >= lastMonthStart && startDate <= lastMonthEnd && res.amount;
      })
      .reduce((sum, res) => sum + (res.amount || 0), 0);

    // Today's revenue
    const todaysRevenue = allReservationsFlat
      .filter(res => {
        if (!res.startDate) return false;
        const pickupDate = res.startDate.split('T')[0];
        return pickupDate === todayStr && res.amount;
      })
      .reduce((sum, res) => sum + (res.amount || 0), 0);

    // Fleet utilization
    const totalCars = fleet.length;
    const carsInUse = activeRentals.length;
    const utilizationRate = totalCars > 0 ? (carsInUse / totalCars) * 100 : 0;

    // Upcoming reservations (next 7 days)
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);
    const nextWeekStr = nextWeek.toISOString().split('T')[0];

    const upcomingReservations = allReservationsFlat.filter(res => {
      if (!res.startDate || res.voucherSubmitted) return false;
      const pickupDate = res.startDate.split('T')[0];
      return pickupDate > todayStr && pickupDate <= nextWeekStr && res.status === 'CONFIRMED';
    });

    return {
      todaysPickups: todaysPickups.length,
      todaysPickupsTrend: todaysPickups.length - yesterdaysPickups.length,
      todaysReturns: todaysReturns.length,
      activeRentals: activeRentals.length,
      overdueReturns: overdueReturns.length,
      thisMonthRevenue,
      lastMonthRevenue,
      todaysRevenue,
      revenueGrowth: lastMonthRevenue > 0
        ? ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100
        : 0,
      totalCars,
      carsAvailable: totalCars - carsInUse,
      utilizationRate,
      upcomingReservations: upcomingReservations.length
    };
  }, [allReservationsFlat, fleet, todayStr, yesterdayStr]);

  // Quick stats cards
  const statsCards = [
    {
      title: "Today's Pickups",
      value: kpis.todaysPickups,
      icon: CalendarIcon,
      color: 'blue',
      trend: kpis.todaysPickupsTrend,
      onClick: () => onNavigate('reservations-today', { filter: 'pickups' })
    },
    {
      title: "Today's Returns",
      value: kpis.todaysReturns,
      icon: ClockIcon,
      color: 'green',
      onClick: () => onNavigate('reservations-today', { filter: 'returns' })
    },
    {
      title: "Active Rentals",
      value: kpis.activeRentals,
      icon: TruckIcon,
      color: 'purple',
      onClick: () => onNavigate('reservations', { filter: 'active' })
    },
    {
      title: "Available Vehicles",
      value: kpis.carsAvailable,
      subtitle: `${kpis.totalCars} total`,
      icon: TruckIcon,
      color: 'gray',
      onClick: () => onNavigate('fleet')
    }
  ];

  const revenueCards = [
    {
      title: "Today's Revenue",
      value: `$${kpis.todaysRevenue.toFixed(2)}`,
      icon: CurrencyDollarIcon,
      color: 'green'
    },
    {
      title: "This Month",
      value: `$${kpis.thisMonthRevenue.toFixed(2)}`,
      subtitle: kpis.revenueGrowth !== 0 ? `${kpis.revenueGrowth > 0 ? '+' : ''}${kpis.revenueGrowth.toFixed(1)}% vs last month` : '',
      icon: ChartBarIcon,
      color: 'indigo',
      trend: kpis.revenueGrowth
    },
    {
      title: "Fleet Utilization",
      value: `${kpis.utilizationRate.toFixed(1)}%`,
      subtitle: `${kpis.activeRentals} of ${kpis.totalCars} cars in use`,
      icon: TrendingUpIcon,
      color: kpis.utilizationRate > 80 ? 'green' : kpis.utilizationRate > 50 ? 'yellow' : 'red'
    }
  ];

  return (
    <div className="space-y-4 sm:space-y-6 p-4 sm:p-6 bg-slate-50 min-h-screen">
      {/* Header Section */}
      <div className="rounded-xl shadow-lg p-4 sm:p-6 lg:p-8 text-white bg-slate-900">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
          <div className="flex-1">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold mb-2">
              Good {currentTime.getHours() < 12 ? 'Morning' : currentTime.getHours() < 18 ? 'Afternoon' : 'Evening'}, {currentUser?.fullName || 'User'}!
            </h1>
            <p className="text-sky-100 text-sm sm:text-base lg:text-lg">
              {currentTime.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </p>
          </div>
          <div className="text-left sm:text-right">
            <div className="text-3xl sm:text-4xl lg:text-5xl font-bold">{currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
            <div className="text-sky-200 mt-1 text-sm sm:text-base">Live Dashboard</div>
          </div>
        </div>
      </div>

      {/* Alerts Section */}
      {kpis.overdueReturns > 0 && (
        <div className="bg-rose-50 border-l-4 border-rose-500 p-4 rounded-lg shadow">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-start flex-1">
              <ExclamationTriangleIcon className="h-6 w-6 text-rose-500 mr-3 flex-shrink-0" />
              <div>
                <h3 className="text-rose-800 font-semibold text-sm sm:text-base">
                  {kpis.overdueReturns} Overdue Return{kpis.overdueReturns !== 1 ? 's' : ''}
                </h3>
                <p className="text-rose-600 text-xs sm:text-sm">
                  Immediate attention required. Click to view details.
                </p>
              </div>
            </div>
            <button
              onClick={() => onNavigate('reservations', { filter: 'overdue' })}
              className="w-full sm:w-auto bg-rose-500 text-white px-4 py-3 sm:py-2 rounded-lg hover:bg-rose-600 transition-colors text-sm sm:text-base min-h-[44px] sm:min-h-0"
            >
              View Now
            </button>
          </div>
        </div>
      )}

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {statsCards.map((card, index) => {
          const Icon = card.icon;
          const colorClasses = {
            blue: 'bg-sky-500',
            green: 'bg-emerald-500',
            purple: 'bg-emerald-500',
            gray: 'bg-slate-500',
            red: 'bg-rose-500',
            yellow: 'bg-amber-500'
          };

          return (
            <div
              key={index}
              onClick={card.onClick}
              className="bg-white rounded-xl shadow-lg p-4 sm:p-6 cursor-pointer hover:shadow-xl transition-all transform hover:-translate-y-1 active:scale-95"
            >
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <div className={`${colorClasses[card.color]} p-2 sm:p-3 rounded-lg`}>
                  <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                </div>
                {card.trend !== undefined && card.trend !== 0 && (
                  <div className={`flex items-center ${card.trend > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {card.trend > 0 ? <ArrowUpIcon className="h-3 w-3 sm:h-4 sm:w-4" /> : <ArrowDownIcon className="h-3 w-3 sm:h-4 sm:w-4" />}
                    <span className="text-xs sm:text-sm font-semibold ml-1">{Math.abs(card.trend)}</span>
                  </div>
                )}
              </div>
              <h3 className="text-slate-500 text-xs sm:text-sm font-medium mb-1">{card.title}</h3>
              <div className="text-2xl sm:text-3xl font-bold text-slate-800">{card.value}</div>
              {card.subtitle && (
                <p className="text-slate-400 text-xs sm:text-sm mt-1">{card.subtitle}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Revenue & Performance Section */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {revenueCards.map((card, index) => {
          const Icon = card.icon;
          const colorClasses = {
            green: 'from-emerald-500 to-emerald-600',
            indigo: 'from-emerald-500 to-emerald-600',
            red: 'from-rose-500 to-rose-600',
            yellow: 'from-amber-500 to-amber-600'
          };

          return (
            <div
              key={index}
              className={`${colorClasses[card.color]} rounded-xl shadow-lg p-4 sm:p-6 text-white bg-slate-900`}
            >
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <Icon className="h-6 w-6 sm:h-8 sm:w-8 opacity-80" />
                {card.trend !== undefined && card.trend !== 0 && (
                  <div className="flex items-center bg-white bg-opacity-20 px-2 sm:px-3 py-1 rounded-full">
                    {card.trend > 0 ? <ArrowUpIcon className="h-3 w-3 sm:h-4 sm:w-4" /> : <ArrowDownIcon className="h-3 w-3 sm:h-4 sm:w-4" />}
                    <span className="text-xs sm:text-sm font-semibold ml-1">{Math.abs(card.trend).toFixed(1)}%</span>
                  </div>
                )}
              </div>
              <h3 className="text-white text-opacity-90 text-xs sm:text-sm font-medium mb-2">{card.title}</h3>
              <div className="text-2xl sm:text-3xl font-bold mb-1">{card.value}</div>
              {card.subtitle && (
                <p className="text-white text-opacity-75 text-xs sm:text-sm">{card.subtitle}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6">
        <h2 className="text-lg sm:text-xl font-bold text-slate-800 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <button
            onClick={() => onNavigate('reservations', { action: 'new' })}
            className="flex flex-col items-center p-3 sm:p-4 bg-sky-50 rounded-lg hover:bg-sky-100 active:bg-sky-200 transition-colors min-h-[88px] sm:min-h-0"
          >
            <CalendarIcon className="h-7 w-7 sm:h-8 sm:w-8 text-sky-600 mb-2" />
            <span className="text-xs sm:text-sm font-semibold text-slate-700 text-center">New Reservation</span>
          </button>
          <button
            onClick={() => onNavigate('reservations-today')}
            className="flex flex-col items-center p-3 sm:p-4 bg-emerald-50 rounded-lg hover:bg-emerald-100 active:bg-emerald-200 transition-colors min-h-[88px] sm:min-h-0"
          >
            <ClockIcon className="h-7 w-7 sm:h-8 sm:w-8 text-emerald-600 mb-2" />
            <span className="text-xs sm:text-sm font-semibold text-slate-700 text-center">Today's Activity</span>
          </button>
          <button
            onClick={() => onNavigate('invoice')}
            className="flex flex-col items-center p-3 sm:p-4 bg-emerald-50 rounded-lg hover:bg-emerald-100 active:bg-emerald-200 transition-colors min-h-[88px] sm:min-h-0"
          >
            <DocumentTextIcon className="h-7 w-7 sm:h-8 sm:w-8 text-emerald-600 mb-2" />
            <span className="text-xs sm:text-sm font-semibold text-slate-700 text-center">Generate Invoice</span>
          </button>
          <button
            onClick={() => onNavigate('fleet-balance')}
            className="flex flex-col items-center p-3 sm:p-4 bg-emerald-50 rounded-lg hover:bg-emerald-100 active:bg-emerald-200 transition-colors min-h-[88px] sm:min-h-0"
          >
            <ChartBarIcon className="h-7 w-7 sm:h-8 sm:w-8 text-emerald-600 mb-2" />
            <span className="text-xs sm:text-sm font-semibold text-slate-700 text-center">Fleet Analytics</span>
          </button>
        </div>
      </div>

      {/* Upcoming Activity */}
      {kpis.upcomingReservations > 0 && (
        <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 gap-3">
            <h2 className="text-lg sm:text-xl font-bold text-slate-800">Upcoming This Week</h2>
            <button
              onClick={() => onNavigate('reservations', { filter: 'upcoming' })}
              className="text-sky-600 hover:text-sky-700 font-semibold text-sm self-start sm:self-auto min-h-[44px] sm:min-h-0 flex items-center"
            >
              View All →
            </button>
          </div>
          <div className="flex items-center text-slate-600">
            <UserGroupIcon className="h-5 w-5 mr-2 flex-shrink-0" />
            <span className="text-sm sm:text-base">{kpis.upcomingReservations} reservation{kpis.upcomingReservations !== 1 ? 's' : ''} scheduled for the next 7 days</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfessionalHomeDashboard;
