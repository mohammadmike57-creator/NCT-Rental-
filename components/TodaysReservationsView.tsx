import React, { useMemo, useState, useEffect } from 'react';
import {
  CalendarIcon, ClockIcon, TruckIcon, UserIcon, PhoneIcon,
  CheckCircleIcon, XCircleIcon, ExclamationTriangleIcon,
  ArrowUpIcon, ArrowDownIcon, RefreshIcon, BellIcon
} from './icons';

interface Reservation {
  id: string;
  bookingId: string;
  personName: string;
  contactNumber: string;
  customerEmail?: string;
  startDate: string;
  endDate: string;
  reservationVehicle: string;
  assignedVehicle?: any;
  status: string;
  amount?: number;
  voucherSubmitted?: boolean;
  dropOffCompleted?: boolean;
  pickupKmOut?: number;
  dropOffKmIn?: number;
  pickupFuelLevel?: number;
  dropOffFuelLevel?: number;
  notes?: string;
}

interface TodaysReservationsViewProps {
  reservations: Reservation[];
  onStartRental: (reservation: Reservation) => void;
  onCompleteReturn: (reservation: Reservation) => void;
  onViewDetails: (reservation: Reservation) => void;
}

/**
 * TODAY'S RESERVATIONS - REAL-TIME DASHBOARD
 *
 * Features:
 * - Live activity tracking
 * - Pickup/Return timeline
 * - Real-time status updates
 * - Quick actions
 * - Priority alerts
 * - Performance metrics
 */
const TodaysReservationsView: React.FC<TodaysReservationsViewProps> = ({
  reservations,
  onStartRental,
  onCompleteReturn,
  onViewDetails
}) => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedTab, setSelectedTab] = useState<'pickups' | 'returns' | 'all'>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Update time every minute
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      // Trigger refresh - in real app this would fetch new data
      setCurrentTime(new Date());
    }, 300000); // 5 minutes
    return () => clearInterval(timer);
  }, [autoRefresh]);

  const today = new Date().toISOString().split('T')[0];

  // Today's pickups and returns
  const todaysActivity = useMemo(() => {
    const pickups = reservations.filter(res => {
      if (!res.startDate) return false;
      const pickupDate = res.startDate.split('T')[0];
      return pickupDate === today && res.status === 'CONFIRMED';
    });

    const returns = reservations.filter(res => {
      if (!res.endDate) return false;
      const returnDate = res.endDate.split('T')[0];
      return returnDate === today && res.voucherSubmitted && !res.dropOffCompleted;
    });

    const active = reservations.filter(res =>
      res.voucherSubmitted && !res.dropOffCompleted
    );

    const overduePickups = pickups.filter(res => {
      const pickupTime = new Date(res.startDate);
      return pickupTime < currentTime && !res.voucherSubmitted;
    });

    const overdueReturns = returns.filter(res => {
      const returnTime = new Date(res.endDate);
      return returnTime < currentTime;
    });

    return {
      pickups,
      returns,
      active,
      overduePickups,
      overdueReturns,
      completedPickups: pickups.filter(r => r.voucherSubmitted).length,
      completedReturns: returns.filter(r => r.dropOffCompleted).length,
      totalRevenue: pickups.reduce((sum, r) => sum + (r.amount || 0), 0)
    };
  }, [reservations, today, currentTime]);

  // Sort by time
  const sortedPickups = [...todaysActivity.pickups].sort((a, b) =>
    new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
  );

  const sortedReturns = [...todaysActivity.returns].sort((a, b) =>
    new Date(a.endDate).getTime() - new Date(b.endDate).getTime()
  );

  const getTimeStatus = (dateTime: string) => {
    const time = new Date(dateTime);
    const diff = time.getTime() - currentTime.getTime();
    const hours = Math.floor(Math.abs(diff) / (1000 * 60 * 60));
    const minutes = Math.floor((Math.abs(diff) % (1000 * 60 * 60)) / (1000 * 60));

    if (diff < 0) {
      return {
        text: `${hours}h ${minutes}m overdue`,
        color: 'text-rose-600',
        bgColor: 'bg-rose-50',
        borderColor: 'border-rose-300'
      };
    } else if (diff < 3600000) { // Less than 1 hour
      return {
        text: `${minutes}m`,
        color: 'text-amber-600',
        bgColor: 'bg-amber-50',
        borderColor: 'border-amber-300'
      };
    } else {
      return {
        text: `${hours}h ${minutes}m`,
        color: 'text-sky-600',
        bgColor: 'bg-sky-50',
        borderColor: 'border-sky-300'
      };
    }
  };

  const PickupCard = ({ reservation }: { reservation: Reservation }) => {
    const timeStatus = getTimeStatus(reservation.startDate);
    const isOverdue = new Date(reservation.startDate) < currentTime && !reservation.voucherSubmitted;

    return (
      <div className={`bg-white rounded-lg shadow-md p-5 border-l-4 ${isOverdue ? 'border-rose-500' : 'border-sky-500'} hover:shadow-lg transition-all`}>
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-lg font-bold text-slate-800">{reservation.personName}</h3>
              {isOverdue && <ExclamationTriangleIcon className="h-5 w-5 text-rose-500" />}
            </div>
            <div className="text-sm text-slate-600 space-y-1">
              <div className="flex items-center gap-2">
                <PhoneIcon className="h-4 w-4" />
                {reservation.contactNumber}
              </div>
              <div className="flex items-center gap-2">
                <TruckIcon className="h-4 w-4" />
                {reservation.reservationVehicle}
              </div>
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4" />
                {new Date(reservation.startDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
          <div className={`px-3 py-2 rounded-lg ${timeStatus.bgColor} ${timeStatus.borderColor} border text-center`}>
            <div className={`text-xs font-semibold ${timeStatus.color}`}>{timeStatus.text}</div>
            <div className="text-xs text-slate-500 mt-1">
              {isOverdue ? 'Late' : 'Until pickup'}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-slate-200">
          <div>
            <div className="text-sm text-slate-500">Amount</div>
            <div className="text-lg font-bold text-slate-900">${reservation.amount?.toFixed(2) || '0.00'}</div>
          </div>
          {reservation.voucherSubmitted ? (
            <div className="flex items-center gap-2 text-emerald-600">
              <CheckCircleIcon className="h-5 w-5" />
              <span className="font-semibold">Checked Out</span>
            </div>
          ) : (
            <button
              onClick={() => onStartRental(reservation)}
              className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                isOverdue
                  ? 'bg-rose-600 hover:bg-rose-700 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-600 text-white'
              }`}
            >
              Start Rental
            </button>
          )}
        </div>
      </div>
    );
  };

  const ReturnCard = ({ reservation }: { reservation: Reservation }) => {
    const timeStatus = getTimeStatus(reservation.endDate);
    const isOverdue = new Date(reservation.endDate) < currentTime;

    return (
      <div className={`bg-white rounded-lg shadow-md p-5 border-l-4 ${isOverdue ? 'border-rose-500' : 'border-emerald-500'} hover:shadow-lg transition-all`}>
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-lg font-bold text-slate-800">{reservation.personName}</h3>
              {isOverdue && <ExclamationTriangleIcon className="h-5 w-5 text-rose-500" />}
            </div>
            <div className="text-sm text-slate-600 space-y-1">
              <div className="flex items-center gap-2">
                <PhoneIcon className="h-4 w-4" />
                {reservation.contactNumber}
              </div>
              <div className="flex items-center gap-2">
                <TruckIcon className="h-4 w-4" />
                {reservation.reservationVehicle}
                {reservation.assignedVehicle && ` (${reservation.assignedVehicle.licensePlate})`}
              </div>
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4" />
                {new Date(reservation.endDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
          <div className={`px-3 py-2 rounded-lg ${timeStatus.bgColor} ${timeStatus.borderColor} border text-center`}>
            <div className={`text-xs font-semibold ${timeStatus.color}`}>{timeStatus.text}</div>
            <div className="text-xs text-slate-500 mt-1">
              {isOverdue ? 'Overdue' : 'Until return'}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-slate-200">
          <div className="flex gap-4">
            <div>
              <div className="text-xs text-slate-500">Out KM</div>
              <div className="font-semibold text-slate-900">{reservation.pickupKmOut || 'N/A'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Fuel</div>
              <div className="font-semibold text-slate-900">{reservation.pickupFuelLevel || 'N/A'}</div>
            </div>
          </div>
          <button
            onClick={() => onCompleteReturn(reservation)}
            className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
              isOverdue
                ? 'bg-rose-600 hover:bg-rose-700 text-white'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
          >
            Complete Return
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="rounded-xl shadow-lg p-8 text-white mb-6 bg-slate-900">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold mb-2">Today's Activity</h1>
            <p className="text-sky-100 text-lg">
              {currentTime.toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric'
              })}
            </p>
          </div>
          <div className="text-right">
            <div className="text-4xl font-bold">{currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm ${
                  autoRefresh ? 'bg-emerald-500' : 'bg-slate-500'
                }`}
              >
                <RefreshIcon className="h-4 w-4" />
                {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow-md p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sky-600">
              <ArrowUpIcon className="h-6 w-6" />
            </div>
            <div className="text-2xl font-bold text-slate-800">{todaysActivity.pickups.length}</div>
          </div>
          <div className="text-slate-600 text-sm font-semibold">Scheduled Pickups</div>
          <div className="text-emerald-600 text-xs mt-1">{todaysActivity.completedPickups} completed</div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-emerald-600">
              <ArrowDownIcon className="h-6 w-6" />
            </div>
            <div className="text-2xl font-bold text-slate-800">{todaysActivity.returns.length}</div>
          </div>
          <div className="text-slate-600 text-sm font-semibold">Expected Returns</div>
          <div className="text-emerald-600 text-xs mt-1">{todaysActivity.completedReturns} completed</div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-emerald-600">
              <TruckIcon className="h-6 w-6" />
            </div>
            <div className="text-2xl font-bold text-slate-800">{todaysActivity.active.length}</div>
          </div>
          <div className="text-slate-600 text-sm font-semibold">Currently Out</div>
          <div className="text-slate-400 text-xs mt-1">Active rentals</div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-emerald-600">
              <span className="text-2xl">$</span>
            </div>
            <div className="text-2xl font-bold text-slate-800">${todaysActivity.totalRevenue.toFixed(0)}</div>
          </div>
          <div className="text-slate-600 text-sm font-semibold">Today's Revenue</div>
          <div className="text-slate-400 text-xs mt-1">From pickups</div>
        </div>
      </div>

      {/* Alerts */}
      {(todaysActivity.overduePickups.length > 0 || todaysActivity.overdueReturns.length > 0) && (
        <div className="bg-rose-50 border-l-4 border-rose-500 p-4 rounded-lg shadow mb-6">
          <div className="flex items-start">
            <BellIcon className="h-6 w-6 text-rose-500 mr-3 mt-1" />
            <div className="flex-1">
              <h3 className="text-rose-800 font-bold text-lg mb-2">Priority Alerts</h3>
              {todaysActivity.overduePickups.length > 0 && (
                <div className="text-rose-700 mb-1">
                  ⚠️ {todaysActivity.overduePickups.length} overdue pickup{todaysActivity.overduePickups.length !== 1 ? 's' : ''}
                </div>
              )}
              {todaysActivity.overdueReturns.length > 0 && (
                <div className="text-rose-700">
                  ⚠️ {todaysActivity.overdueReturns.length} overdue return{todaysActivity.overdueReturns.length !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-md mb-6">
        <div className="border-b border-slate-200">
          <div className="flex">
            <button
              onClick={() => setSelectedTab('all')}
              className={`px-6 py-4 font-semibold transition-colors ${
                selectedTab === 'all'
                  ? 'border-b-2 border-sky-600 text-sky-600'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              All ({todaysActivity.pickups.length + todaysActivity.returns.length})
            </button>
            <button
              onClick={() => setSelectedTab('pickups')}
              className={`px-6 py-4 font-semibold transition-colors ${
                selectedTab === 'pickups'
                  ? 'border-b-2 border-sky-600 text-sky-600'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              Pickups ({todaysActivity.pickups.length})
            </button>
            <button
              onClick={() => setSelectedTab('returns')}
              className={`px-6 py-4 font-semibold transition-colors ${
                selectedTab === 'returns'
                  ? 'border-b-2 border-sky-600 text-sky-600'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              Returns ({todaysActivity.returns.length})
            </button>
          </div>
        </div>
      </div>

      {/* Reservations Grid */}
      <div className="space-y-6">
        {/* Pickups Section */}
        {(selectedTab === 'all' || selectedTab === 'pickups') && (
          <div>
            <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
              <ArrowUpIcon className="h-5 w-5 text-sky-600" />
              Today's Pickups ({sortedPickups.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sortedPickups.map(reservation => (
                <PickupCard key={reservation.id} reservation={reservation} />
              ))}
              {sortedPickups.length === 0 && (
                <div className="col-span-full text-center py-12 text-slate-500">
                  No pickups scheduled for today
                </div>
              )}
            </div>
          </div>
        )}

        {/* Returns Section */}
        {(selectedTab === 'all' || selectedTab === 'returns') && (
          <div>
            <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
              <ArrowDownIcon className="h-5 w-5 text-emerald-600" />
              Today's Returns ({sortedReturns.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sortedReturns.map(reservation => (
                <ReturnCard key={reservation.id} reservation={reservation} />
              ))}
              {sortedReturns.length === 0 && (
                <div className="col-span-full text-center py-12 text-slate-500">
                  No returns scheduled for today
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TodaysReservationsView;
