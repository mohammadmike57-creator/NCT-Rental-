
import React, { useMemo } from 'react';
import { Fleet, Vehicle, Reservation } from '../types';
import { DailyAssignments } from './FleetAvailability';
import { CarIcon, ClockIcon, CheckCircleIcon, UserIcon, CalendarIcon } from './icons';

interface FleetStatusTrackerProps {
    fleet: Fleet;
    assignments: DailyAssignments;
    selectedDate: string;
}

const calculateDaysRemaining = (endDateStr: string, selectedDateStr: string): number | null => {
    if (!endDateStr || !selectedDateStr) return null;

    try {
        const endDate = new Date(endDateStr);
        const selectedDate = new Date(selectedDateStr);
        
        if (isNaN(endDate.getTime()) || isNaN(selectedDate.getTime())) return null;

        // Reset time components to just compare days
        endDate.setHours(0, 0, 0, 0);
        selectedDate.setHours(0, 0, 0, 0);

        if (endDate < selectedDate) return null; // Date passed

        const diffTime = endDate.getTime() - selectedDate.getTime();
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
        return diffDays;
    } catch (e) {
        return null;
    }
};

const calculateDuration = (start: string, end: string) => {
    if (!start || !end) return 0;
    const s = new Date(start).getTime();
    const e = new Date(end).getTime();
    if (isNaN(s) || isNaN(e)) return 0;
    const diff = Math.abs(e - s);
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return Math.max(1, days); // Minimum 1 day
};

const formatDateTime = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return 'Invalid Date';
    return date.toLocaleDateString('en-US', { 
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true 
    });
};

const formatDateShort = (dateStr: string) => {
     if (!dateStr) return 'N/A';
     const date = new Date(dateStr);
     if (isNaN(date.getTime())) return 'N/A';
     return date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
}

const StatusBadge: React.FC<{ days: number | null, isBusy: boolean }> = ({ days, isBusy }) => {
    if (!isBusy) {
        return (
            <div className="flex flex-col items-center justify-center p-3 bg-green-100 text-green-800 rounded-lg border border-green-200 w-full text-center">
                <span className="text-xs font-bold uppercase tracking-widest text-green-600 mb-1">Status</span>
                <span className="text-lg font-extrabold">AVAILABLE</span>
            </div>
        );
    }

    let colorClass = "bg-blue-100 text-blue-800 border-blue-200";
    let label = "RETURNS IN";
    let value = `${days} DAYS`;
    
    if (days === null) {
         colorClass = "bg-red-100 text-red-800 border-red-200";
         label = "STATUS";
         value = "OVERDUE";
    } else if (days === 0) {
        colorClass = "bg-orange-100 text-orange-800 border-orange-200";
        label = "URGENT";
        value = "RETURNS TODAY";
    } else if (days === 1) {
        colorClass = "bg-yellow-100 text-yellow-800 border-yellow-200";
        label = "UPCOMING";
        value = "TOMORROW";
    }

    return (
        <div className={`flex flex-col items-center justify-center p-3 rounded-lg border w-full text-center ${colorClass}`}>
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-75 mb-1">{label}</span>
            <span className="text-lg font-extrabold leading-tight">{value}</span>
        </div>
    );
}

const VehicleCard: React.FC<{ vehicle: Vehicle; isBusy: boolean; daysRemaining: number | null; reservation?: Reservation | null }> = ({ vehicle, isBusy, daysRemaining, reservation }) => (
    <div className={`flex flex-col h-full rounded-xl border shadow-sm transition-all hover:shadow-md ${isBusy ? 'bg-white border-gray-200' : 'bg-white border-green-200 hover:border-green-300'}`}>
        <div className={`px-4 py-3 border-b flex justify-between items-center rounded-t-xl ${isBusy ? 'bg-gray-50' : 'bg-green-50'}`}>
             <div className="flex items-center gap-2 overflow-hidden">
                 <div className={`p-1.5 rounded-full flex-shrink-0 ${isBusy ? 'bg-gray-200 text-gray-500' : 'bg-green-200 text-green-600'}`}>
                    <CarIcon className="w-4 h-4" />
                 </div>
                 <h5 className="font-bold text-gray-800 truncate text-sm" title={vehicle.modelName}>{vehicle.modelName}</h5>
             </div>
             <div className="font-mono text-xs bg-white border border-gray-200 px-2 py-1 rounded text-gray-600 whitespace-nowrap">
                 {vehicle.licensePlate}
             </div>
        </div>
        
        <div className="p-4 flex-grow flex flex-col gap-3">
            <div className="text-center">
               <StatusBadge days={daysRemaining} isBusy={isBusy} />
            </div>
            
            {isBusy && reservation ? (
                <div className="space-y-3 mt-1">
                    {/* Renter Info */}
                    <div className="flex items-center justify-between text-sm border-b pb-2 border-gray-100">
                        <div className="flex items-center gap-2 text-gray-700">
                            <UserIcon className="w-4 h-4 text-gray-400" />
                            <span className="font-medium text-gray-900 truncate w-24" title={reservation.personName}>{reservation.personName}</span>
                        </div>
                         <span className="text-xs font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100">
                            {calculateDuration(reservation.startDate, reservation.endDate)} Days
                        </span>
                    </div>

                    {/* Exact Return Time */}
                     <div className="bg-orange-50 p-2.5 rounded-lg border border-orange-100 flex items-start gap-2.5">
                        <ClockIcon className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                        <div className="overflow-hidden">
                            <p className="text-[10px] font-bold text-orange-400 uppercase tracking-wide leading-none mb-1">Returns Exact</p>
                            <p className="text-sm font-bold text-gray-800 leading-tight truncate" title={formatDateTime(reservation.endDate)}>{formatDateTime(reservation.endDate)}</p>
                        </div>
                    </div>
                    
                    {/* Date Range */}
                    <div className="flex items-center gap-2 text-xs text-gray-400 px-1 justify-center">
                         <CalendarIcon className="w-3 h-3" />
                         <span>{formatDateShort(reservation.startDate)} - {formatDateShort(reservation.endDate)}</span>
                    </div>
                </div>
            ) : !isBusy && (
                <div className="flex items-center justify-center gap-1 text-green-600 text-sm font-medium py-4">
                    <CheckCircleIcon className="w-4 h-4"/>
                    <span>Ready for Rent</span>
                </div>
            )}
        </div>
    </div>
);

const FleetStatusTracker: React.FC<FleetStatusTrackerProps> = ({ fleet, assignments, selectedDate }) => {
    
    // Group fleet by category
    const groupedFleet = useMemo(() => {
        const groups: { [category: string]: Vehicle[] } = {};
        fleet.forEach(vehicle => {
            const cat = vehicle.category || 'Uncategorized';
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(vehicle);
        });
        return groups;
    }, [fleet]);

    const categories = Object.keys(groupedFleet).sort();

    if (fleet.length === 0) {
        return (
            <div className="text-center py-12 text-gray-500 bg-white rounded-lg border border-dashed border-gray-300">
                <p>No vehicles in the fleet. Add vehicles in 'Manage Fleet' to see their status.</p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {categories.map(category => {
                const vehicles = groupedFleet[category].sort((a, b) => a.modelName.localeCompare(b.modelName));
                const availableCount = vehicles.filter(v => !assignments[v.licensePlate]).length;
                const totalCount = vehicles.length;
                
                return (
                    <div key={category} className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
                        <div className="flex items-center gap-3 mb-5">
                            <h4 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                {category} 
                                <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">{totalCount}</span>
                            </h4>
                            <div className="flex-grow h-px bg-gray-100"></div>
                            <span className={`px-3 py-1 text-xs font-bold rounded-full ${availableCount > 0 ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-600'}`}>
                                {availableCount} Available
                            </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                            {vehicles.map(vehicle => {
                                const reservation = assignments[vehicle.licensePlate];
                                const isBusy = !!reservation;
                                const daysRemaining = isBusy ? calculateDaysRemaining(reservation.endDate, selectedDate) : null;

                                return (
                                    <VehicleCard 
                                        key={vehicle.id} 
                                        vehicle={vehicle} 
                                        isBusy={isBusy} 
                                        daysRemaining={daysRemaining} 
                                        reservation={reservation}
                                    />
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default FleetStatusTracker;
