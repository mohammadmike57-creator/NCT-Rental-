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
    <div className="space-y-6 p-6 bg-gray-50 min-h-screen">
      {/* Header Section */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-xl shadow-lg p-8 text-white">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold mb-2">
              Good {currentTime.getHours() < 12 ? 'Morning' : currentTime.getHours() < 18 ? 'Afternoon' : 'Evening'}, {currentUser?.fullName || 'User'}!
            </h1>
            <p className="text-blue-100 text-lg">
              {currentTime.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </p>
          </div>
          <div className="text-right">
            <div className="text-5xl font-bold">{currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
            <div className="text-blue-200 mt-1">Live Dashboard</div>
          </div>
        </div>
      </div>

      {/* Alerts Section */}
      {kpis.overdueReturns > 0 && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-lg shadow">
          <div className="flex items-center">
            <ExclamationTriangleIcon className="h-6 w-6 text-red-500 mr-3" />
            <div>
              <h3 className="text-red-800 font-semibold">
                {kpis.overdueReturns} Overdue Return{kpis.overdueReturns !== 1 ? 's' : ''}
              </h3>
              <p className="text-red-600 text-sm">
                Immediate attention required. Click to view details.
              </p>
            </div>
            <button
              onClick={() => onNavigate('reservations', { filter: 'overdue' })}
              className="ml-auto bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition-colors"
            >
              View Now
            </button>
          </div>
        </div>
      )}

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statsCards.map((card, index) => {
          const Icon = card.icon;
          const colorClasses = {
            blue: 'bg-blue-500',
            green: 'bg-green-500',
            purple: 'bg-purple-500',
            gray: 'bg-gray-500',
            red: 'bg-red-500',
            yellow: 'bg-yellow-500'
          };

          return (
            <div
              key={index}
              onClick={card.onClick}
              className="bg-white rounded-xl shadow-lg p-6 cursor-pointer hover:shadow-xl transition-all transform hover:-translate-y-1"
            >
              <div className="flex items-center justify-between mb-4">
                <div className={`${colorClasses[card.color]} p-3 rounded-lg`}>
                  <Icon className="h-6 w-6 text-white" />
                </div>
                {card.trend !== undefined && card.trend !== 0 && (
                  <div className={`flex items-center ${card.trend > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {card.trend > 0 ? <ArrowUpIcon className="h-4 w-4" /> : <ArrowDownIcon className="h-4 w-4" />}
                    <span className="text-sm font-semibold ml-1">{Math.abs(card.trend)}</span>
                  </div>
                )}
              </div>
              <h3 className="text-gray-500 text-sm font-medium mb-1">{card.title}</h3>
              <div className="text-3xl font-bold text-gray-800">{card.value}</div>
              {card.subtitle && (
                <p className="text-gray-400 text-sm mt-1">{card.subtitle}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Revenue & Performance Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {revenueCards.map((card, index) => {
          const Icon = card.icon;
          const colorClasses = {
            green: 'from-green-500 to-green-600',
            indigo: 'from-indigo-500 to-indigo-600',
            red: 'from-red-500 to-red-600',
            yellow: 'from-yellow-500 to-yellow-600'
          };

          return (
            <div
              key={index}
              className={`bg-gradient-to-br ${colorClasses[card.color]} rounded-xl shadow-lg p-6 text-white`}
            >
              <div className="flex items-center justify-between mb-4">
                <Icon className="h-8 w-8 opacity-80" />
                {card.trend !== undefined && card.trend !== 0 && (
                  <div className="flex items-center bg-white bg-opacity-20 px-3 py-1 rounded-full">
                    {card.trend > 0 ? <ArrowUpIcon className="h-4 w-4" /> : <ArrowDownIcon className="h-4 w-4" />}
                    <span className="text-sm font-semibold ml-1">{Math.abs(card.trend).toFixed(1)}%</span>
                  </div>
                )}
              </div>
              <h3 className="text-white text-opacity-90 text-sm font-medium mb-2">{card.title}</h3>
              <div className="text-3xl font-bold mb-1">{card.value}</div>
              {card.subtitle && (
                <p className="text-white text-opacity-75 text-sm">{card.subtitle}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h2 className="text-xl font-bold text-gray-800 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <button
            onClick={() => onNavigate('reservations', { action: 'new' })}
            className="flex flex-col items-center p-4 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
          >
            <CalendarIcon className="h-8 w-8 text-blue-600 mb-2" />
            <span className="text-sm font-semibold text-gray-700">New Reservation</span>
          </button>
          <button
            onClick={() => onNavigate('reservations-today')}
            className="flex flex-col items-center p-4 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
          >
            <ClockIcon className="h-8 w-8 text-green-600 mb-2" />
            <span className="text-sm font-semibold text-gray-700">Today's Activity</span>
          </button>
          <button
            onClick={() => onNavigate('invoice')}
            className="flex flex-col items-center p-4 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors"
          >
            <DocumentTextIcon className="h-8 w-8 text-purple-600 mb-2" />
            <span className="text-sm font-semibold text-gray-700">Generate Invoice</span>
          </button>
          <button
            onClick={() => onNavigate('fleet-balance')}
            className="flex flex-col items-center p-4 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
          >
            <ChartBarIcon className="h-8 w-8 text-indigo-600 mb-2" />
            <span className="text-sm font-semibold text-gray-700">Fleet Analytics</span>
          </button>
        </div>
      </div>

      {/* Upcoming Activity */}
      {kpis.upcomingReservations > 0 && (
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-800">Upcoming This Week</h2>
            <button
              onClick={() => onNavigate('reservations', { filter: 'upcoming' })}
              className="text-blue-600 hover:text-blue-700 font-semibold text-sm"
            >
              View All →
            </button>
          </div>
          <div className="flex items-center text-gray-600">
            <UserGroupIcon className="h-5 w-5 mr-2" />
            <span>{kpis.upcomingReservations} reservation{kpis.upcomingReservations !== 1 ? 's' : ''} scheduled for the next 7 days</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfessionalHomeDashboard;
