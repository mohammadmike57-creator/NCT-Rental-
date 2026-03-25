import React, { useMemo } from 'react';
import { Fleet, Reservation } from '../types';
import { MONTHS } from '../constants';

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

    return (
        <div>
            <div className="flex items-center justify-end gap-4 p-2 bg-gray-50 border-b text-xs text-gray-600">
                <div className="flex items-center gap-2">
                    <span className="w-3 h-3 bg-blue-500 rounded-sm"></span> Rented
                </div>
                <div className="flex items-center gap-2">
                    <span className="w-0.5 h-4 bg-red-500"></span> Today
                </div>
            </div>
            <div className="overflow-x-auto bg-white relative">
                <div className="grid sticky top-0 z-20 bg-gray-50 border-b border-gray-200 min-w-[1500px]" style={{ gridTemplateColumns: `150px repeat(${daysInMonth}, minmax(40px, 1fr))` }}>
                    <div className="font-bold text-xs uppercase text-gray-500 p-3 border-r border-gray-200 flex items-center bg-gray-50 z-30 sticky left-0 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Vehicle</div>
                    {headerDays.map(day => (
                        <div key={day} className={`font-semibold text-xs text-center p-2 border-r border-gray-100 flex flex-col justify-center ${day === currentDay && isCurrentMonth ? 'bg-red-50 text-red-600' : 'text-gray-600'}`}>
                            <span>{day}</span>
                            <span className="text-[9px] font-normal opacity-70">
                                {new Date(year, monthIndex, day).toLocaleDateString('en-US', { weekday: 'narrow' })}
                            </span>
                        </div>
                    ))}
                </div>
                <div className="grid relative min-w-[1500px]" style={{ gridTemplateColumns: `150px repeat(${daysInMonth}, minmax(40px, 1fr))` }}>
                    
                    {/* Today Marker Line - Placed absolutely over the grid */}
                    {isCurrentMonth && (
                        <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10 shadow-[0_0_8px_rgba(239,68,68,0.4)] pointer-events-none"
                            style={{
                                gridColumnStart: currentDay + 1, // +1 because first col is names
                                left: '-1px', // Center on the grid line
                                height: '100%'
                            }}
                        >
                            <div className="absolute -top-1 -left-[3px] w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                        </div>
                    )}

                    {sortedFleet.map((vehicle, index) => (
                        <React.Fragment key={vehicle.id}>
                            <div className={`px-3 py-3 border-r border-gray-200 text-sm border-b border-gray-100 sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] ${index % 2 ? 'bg-gray-50' : 'bg-white'}`}>
                                <p className="font-bold text-gray-800 truncate" title={vehicle.modelName}>{vehicle.modelName}</p>
                                <p className="text-[10px] text-gray-500 font-mono mt-0.5">{vehicle.licensePlate}</p>
                            </div>
                            <div className={`col-span-1 grid border-b border-gray-100 relative ${index % 2 ? 'bg-gray-50' : 'bg-white'}`} style={{ gridTemplateColumns: `repeat(${daysInMonth}, 1fr)`, gridColumn: `2 / -1` }}>
                                {Array.from({ length: daysInMonth }).map((_, dayIndex) => (
                                    <div key={dayIndex} className="border-r border-gray-100 h-full"></div>
                                ))}
                                
                                {/* Reservation bars */}
                                {(reservationsByVehicle.get(vehicle.licensePlate) || []).map(res => (
                                    <div
                                        key={res.id}
                                        style={getReservationStyle(res)}
                                        className="h-7 my-auto mx-0.5 rounded-md shadow-sm text-white text-xs px-2 flex items-center overflow-hidden relative group cursor-help z-0 transition-all hover:scale-[1.02] hover:shadow-md hover:z-20"
                                        title={`Renter: ${res.personName}\nBooking ID: ${res.bookingId}\nDates: ${res.startDate} - ${res.endDate}`}
                                    >
                                        {/* Gradient Background */}
                                        <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-indigo-600 opacity-90"></div>
                                        <span className="relative z-10 truncate font-medium text-white/90 drop-shadow-sm">{res.personName}</span>
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
