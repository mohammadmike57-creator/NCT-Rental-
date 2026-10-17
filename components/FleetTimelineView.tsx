import React, { useMemo } from 'react';
import { Fleet, Reservation } from '../types';
import { MONTHS } from '../constants';
import { EmptyState, Plate } from './ui/Crm';

interface FleetTimelineViewProps {
    year: number;
    month: string;
    fleet: Fleet;
    reservations: Reservation[];
}

const FleetTimelineView: React.FC<FleetTimelineViewProps> = ({ year, month, fleet, reservations }) => {
    const monthIndex = useMemo(() => MONTHS.indexOf(month), [month]);
    const daysInMonth = useMemo(() => new Date(year, monthIndex + 1, 0).getDate(), [year, monthIndex]);

    const sortedFleet = [...fleet].sort((a, b) => a.modelName.localeCompare(b.modelName) || a.licensePlate.localeCompare(b.licensePlate));
    
    // Create a map to hold reservations for each vehicle
    const reservationsByVehicle = useMemo(() => {
        const assignments = new Map<string, Reservation[]>();
        const reservationsToAssign = [...reservations].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
        
        const vehicleAvailability: { [licensePlate: string]: Date } = {};
        fleet.forEach(v => vehicleAvailability[v.licensePlate] = new Date(0));

        reservationsToAssign.forEach(res => {
            const startDate = new Date(res.startDate);
            
            // Find an available vehicle of the correct model
            const availableVehicle = fleet.find(v => 
                v.modelName === res.carModel && 
                vehicleAvailability[v.licensePlate] < startDate
            );

            if (availableVehicle) {
                const plate = availableVehicle.licensePlate;
                if (!assignments.has(plate)) {
                    assignments.set(plate, []);
                }
                assignments.get(plate)?.push(res);
                
                const endDate = new Date(res.endDate);
                endDate.setDate(endDate.getDate() + 1); // Vehicle is available the day after
                vehicleAvailability[plate] = endDate;
            }
        });
        return assignments;
    }, [reservations, fleet]);

    const headerDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    const getReservationStyle = (res: Reservation) => {
        const start = new Date(res.startDate);
        const end = new Date(res.endDate);
        
        let gridColumnStart = start.getMonth() === monthIndex ? start.getDate() : 1;
        let gridColumnEnd = end.getMonth() === monthIndex ? end.getDate() + 1 : daysInMonth + 1;
        
        // Prevent overlap visual glitch if start/end are same day (1 day rental)
        if (gridColumnStart === gridColumnEnd) gridColumnEnd += 1;

        return {
            gridColumn: `${gridColumnStart} / ${gridColumnEnd}`,
        };
    };

    // Calculate today's position
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === monthIndex;
    const currentDay = today.getDate();

    if (sortedFleet.length === 0) {
        return <EmptyState title="No vehicles to show" hint="Add vehicles to the fleet or clear the category filter." />;
    }

    const gridCols = `160px repeat(${daysInMonth}, minmax(36px, 1fr))`;

    return (
        <div>
            <div className="flex items-center justify-end gap-4 px-4 py-2 bg-slate-50/50 border-b border-slate-100 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-indigo-500 rounded-sm" /> Rented</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-0.5 h-3.5 bg-rose-500" /> Today</span>
            </div>
            <div className="overflow-x-auto bg-white relative">
                <div className="grid sticky top-0 z-20 bg-slate-50 border-b border-slate-200 min-w-[1400px]" style={{ gridTemplateColumns: gridCols }}>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 px-4 py-2.5 border-r border-slate-200 flex items-center bg-slate-50 z-30 sticky left-0">Vehicle</div>
                    {headerDays.map(day => {
                        const isToday = day === currentDay && isCurrentMonth;
                        return (
                            <div key={day} className={`text-[11px] font-semibold text-center py-1.5 border-r border-slate-100 flex flex-col justify-center tabular-nums ${isToday ? 'bg-rose-50 text-rose-600' : 'text-slate-600'}`}>
                                <span>{day}</span>
                                <span className={`text-[9px] font-medium ${isToday ? 'text-rose-400' : 'text-slate-400'}`}>
                                    {new Date(year, monthIndex, day).toLocaleDateString('en-US', { weekday: 'narrow' })}
                                </span>
                            </div>
                        );
                    })}
                </div>
                <div className="grid relative min-w-[1400px]" style={{ gridTemplateColumns: gridCols }}>

                    {/* Today marker line */}
                    {isCurrentMonth && (
                        <div className="absolute top-0 bottom-0 w-px bg-rose-500 z-10 pointer-events-none"
                            style={{
                                gridColumnStart: currentDay + 1, // +1 because first col is names
                                left: '-1px',
                                height: '100%'
                            }}
                        />
                    )}

                    {sortedFleet.map(vehicle => (
                        <React.Fragment key={vehicle.id}>
                            <div className="px-4 py-2 border-r border-slate-200 border-b border-slate-100 sticky left-0 z-10 bg-white">
                                <p className="text-[13px] font-medium text-slate-900 truncate" title={vehicle.modelName}>{vehicle.modelName}</p>
                                <p className="mt-0.5"><Plate value={vehicle.licensePlate} /></p>
                            </div>
                            <div className="col-span-1 grid border-b border-slate-100 relative bg-white" style={{ gridTemplateColumns: `repeat(${daysInMonth}, 1fr)`, gridColumn: `2 / -1` }}>
                                {Array.from({ length: daysInMonth }).map((_, dayIndex) => (
                                    <div key={dayIndex} className="border-r border-slate-100 h-full" style={{ gridColumn: `${dayIndex + 1}`, gridRow: 1 }}></div>
                                ))}

                                {/* Reservation bars */}
                                {(reservationsByVehicle.get(vehicle.licensePlate) || []).map(res => (
                                    <div
                                        key={res.id}
                                        style={{ ...getReservationStyle(res), gridRow: 1 }}
                                        className="h-6 my-auto mx-0.5 rounded-md bg-indigo-500 hover:bg-indigo-600 text-white text-[11px] font-medium px-2 flex items-center overflow-hidden cursor-help z-0 transition-colors"
                                        title={`Renter: ${res.personName}\nBooking ID: ${res.bookingId}\nDates: ${res.startDate} - ${res.endDate}`}
                                    >
                                        <span className="truncate">{res.personName}</span>
                                    </div>
                                ))}
                            </div>
                        </React.Fragment>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default FleetTimelineView;
