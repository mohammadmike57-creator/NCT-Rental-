import React, { useMemo } from 'react';
import { CalendarIcon, DocumentTextIcon, CheckCircleIcon, ClockIcon, TruckIcon } from './icons';

interface HomePageProps {
  currentUser: any;
  allData: any;
  onNavigate: (view: string, filters?: any) => void;
}

const HomePage: React.FC<HomePageProps> = ({ currentUser, allData, onNavigate }) => {
  const reservations = allData.reservations || {};
  const fleet = allData.fleet || [];

  const allReservationsFlat = useMemo(() => {
    const flat: any[] = [];
    Object.keys(reservations).forEach(year => {
      const yearData = reservations[year];
      Object.keys(yearData).forEach(month => {
        flat.push(...(yearData[month] || []));
      });
    });
    return flat;
  }, [reservations]);

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);
  const nextWeekStr = nextWeek.toISOString().split('T')[0];

  const todaysPickups = useMemo(() => {
    return allReservationsFlat.filter(res => {
      if (!res.startDate) return false;
      const pickupDate = res.startDate.split('T')[0];
      return pickupDate === todayStr && res.status === 'CONFIRMED';
    }).length;
  }, [allReservationsFlat, todayStr]);

  const openAgreements = useMemo(() => {
    return allReservationsFlat.filter(res => 
      res.voucherSubmitted === true && res.dropOffCompleted !== true
    ).length;
  }, [allReservationsFlat]);

  const closedAgreements = useMemo(() => {
    return allReservationsFlat.filter(res => res.dropOffCompleted === true).length;
  }, [allReservationsFlat]);

  const upcomingReservations = useMemo(() => {
    return allReservationsFlat.filter(res => {
      if (!res.startDate || res.voucherSubmitted) return false;
      const pickupDate = res.startDate.split('T')[0];
      return pickupDate >= todayStr && pickupDate <= nextWeekStr && res.status === 'CONFIRMED';
    }).length;
  }, [allReservationsFlat, todayStr, nextWeekStr]);

  const upcomingReturns = useMemo(() => {
    return allReservationsFlat.filter(res => {
      if (!res.endDate || !res.voucherSubmitted || res.dropOffCompleted) return false;
      const returnDate = res.endDate.split('T')[0];
      return returnDate >= todayStr && returnDate <= nextWeekStr && res.status === 'CONFIRMED';
    }).length;
  }, [allReservationsFlat, todayStr, nextWeekStr]);

  const totalCars = fleet.length;
  const carsInUse = allReservationsFlat.filter(res => 
    res.status === 'CONFIRMED' && res.voucherSubmitted && !res.dropOffCompleted
  ).length;
  const carsAvailable = totalCars - carsInUse;

  const Logo = () => (
    <svg width="600" height="120" viewBox="0 0 600 120" xmlns="http://www.w3.org/2000/svg">
      <style>
        {`.dark { fill: #1f2933; font-family: Arial, Helvetica, sans-serif; font-weight: 700; }
         .orange { fill: #ff6a00; font-family: Arial, Helvetica, sans-serif; font-weight: 700; }`}
      </style>
      <text x="20" y="80" fontSize="64" className="dark">
        URDRI<tspan className="orange">V</tspan>E.JO
      </text>
    </svg>
  );

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center gap-6">
          <Logo />
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              Welcome back, {currentUser?.fullName || 'User'}!
            </h1>
            <p className="text-gray-500">Here's what's happening with your rentals today.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Today's Pickups */}
        <div 
          className="bg-white p-5 rounded-lg shadow-md border-l-4 border-blue-500 cursor-pointer hover:shadow-lg transition-all"
          onClick={() => onNavigate('Reservations', { dateFilter: todayStr })}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 uppercase tracking-wide">Today's Pickups</p>
              <p className="text-3xl font-bold text-gray-800 mt-1">{todaysPickups}</p>
            </div>
            <CalendarIcon className="w-10 h-10 text-blue-500" />
          </div>
          <p className="mt-2 text-xs text-blue-600">Click to view →</p>
        </div>

        {/* Open Agreements */}
        <div 
          className="bg-white p-5 rounded-lg shadow-md border-l-4 border-green-500 cursor-pointer hover:shadow-lg transition-all"
          onClick={() => onNavigate('Reservations', { voucherSubmitted: true, dropOffCompleted: false })}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 uppercase tracking-wide">Open Agreements</p>
              <p className="text-3xl font-bold text-gray-800 mt-1">{openAgreements}</p>
            </div>
            <DocumentTextIcon className="w-10 h-10 text-green-500" />
          </div>
          <p className="mt-2 text-xs text-green-600">Click to view →</p>
        </div>

        {/* Closed Agreements */}
        <div 
          className="bg-white p-5 rounded-lg shadow-md border-l-4 border-purple-500 cursor-pointer hover:shadow-lg transition-all"
          onClick={() => onNavigate('Reservations', { dropOffCompleted: true })}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 uppercase tracking-wide">Closed Agreements</p>
              <p className="text-3xl font-bold text-gray-800 mt-1">{closedAgreements}</p>
            </div>
            <CheckCircleIcon className="w-10 h-10 text-purple-500" />
          </div>
          <p className="mt-2 text-xs text-purple-600">Click to view →</p>
        </div>

        {/* Upcoming Reservations */}
        <div 
          className="bg-white p-5 rounded-lg shadow-md border-l-4 border-yellow-500 cursor-pointer hover:shadow-lg transition-all"
          onClick={() => onNavigate('Reservations', { upcomingReservations: true })}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 uppercase tracking-wide">Upcoming Reservations</p>
              <p className="text-3xl font-bold text-gray-800 mt-1">{upcomingReservations}</p>
            </div>
            <ClockIcon className="w-10 h-10 text-yellow-500" />
          </div>
          <p className="mt-2 text-xs text-yellow-600">Next 7 days →</p>
        </div>

        {/* Upcoming Returns */}
        <div 
          className="bg-white p-5 rounded-lg shadow-md border-l-4 border-orange-500 cursor-pointer hover:shadow-lg transition-all"
          onClick={() => onNavigate('Reservations', { upcomingReturns: true })}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 uppercase tracking-wide">Upcoming Returns</p>
              <p className="text-3xl font-bold text-gray-800 mt-1">{upcomingReturns}</p>
            </div>
            <ClockIcon className="w-10 h-10 text-orange-500" />
          </div>
          <p className="mt-2 text-xs text-orange-600">Next 7 days →</p>
        </div>

        {/* Fleet Status */}
        <div className="bg-white p-5 rounded-lg shadow-md border-l-4 border-indigo-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 uppercase tracking-wide">Fleet Status</p>
              <p className="text-xl font-bold text-gray-800 mt-1">{carsAvailable} / {totalCars} available</p>
            </div>
            <TruckIcon className="w-10 h-10 text-indigo-500" />
          </div>
          <button
            onClick={() => onNavigate('Fleet Availability')}
            className="mt-2 text-xs text-indigo-600 hover:underline"
          >
            View details →
          </button>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
