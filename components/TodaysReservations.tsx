import React, { useMemo } from 'react';
import { AppData, Reservation, ReservationStatus } from '../types';
import { DocumentTextIcon, CarIcon, ClockIcon } from './icons';

interface TodaysReservationsProps {
  allData: AppData;
  onShowVoucher: (reservation: Reservation, year: number, month: string) => void;
}

const ReservationCard: React.FC<{
  reservation: Reservation;
  year: number;
  month: string;
  onShowVoucher: (reservation: Reservation, year: number, month: string) => void;
}> = ({ reservation, year, month, onShowVoucher }) => (
    <div className="bg-white p-4 rounded-lg shadow border border-gray-200 space-y-3">
        <div className="flex justify-between items-start">
            <div>
                <p className="font-bold text-gray-800">{reservation.personName}</p>
                <p className="text-xs text-gray-500">Booking ID: {reservation.bookingId}</p>
            </div>
            <button
                onClick={() => onShowVoucher(reservation, year, month)}
                className="p-1.5 rounded-md text-blue-600 hover:bg-blue-100"
                title="View Voucher"
            >
                <DocumentTextIcon />
            </button>
        </div>
        <div className="text-sm space-y-2">
            <div className="flex items-center gap-2 text-gray-700">
                <CarIcon />
                <span>{reservation.carModel} ({reservation.licensePlate || 'TBD'})</span>
            </div>
             <div className="flex items-center gap-2 text-gray-600">
                <ClockIcon />
                <span>{reservation.startDate.replace('T', ' ')} to {reservation.endDate.replace('T', ' ')}</span>
            </div>
        </div>
    </div>
);


const TodaysReservations: React.FC<TodaysReservationsProps> = ({ allData, onShowVoucher }) => {
    
    const today = new Date();

    const { pickups, returns, ongoing } = useMemo(() => {
        const todaysPickups: {res: Reservation, year: number, month: string}[] = [];
        const todaysReturns: {res: Reservation, year: number, month: string}[] = [];
        const currentlyOngoing: {res: Reservation, year: number, month: string}[] = [];
        
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        
        for (const yearStr in allData) {
            const year = parseInt(yearStr, 10);
            const yearData = allData[year];
            for (const month in yearData) {
                const monthReservations = yearData[month];
                monthReservations.forEach(res => {
                    if (res.status !== ReservationStatus.CONFIRMED || !res.startDate || !res.endDate) {
                        return;
                    }
                    
                    try {
                        const startDate = new Date(res.startDate);
                        const endDate = new Date(res.endDate);

                        const startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
                        const endDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
                        
                        if (isNaN(startDay.getTime()) || isNaN(endDay.getTime())) return;

                        const reservationData = { res, year, month };

                        if (todayStart >= startDay && todayStart <= endDay) {
                             if (startDay.getTime() === todayStart.getTime()) {
                                todaysPickups.push(reservationData);
                            } else if (endDay.getTime() === todayStart.getTime()) {
                                todaysReturns.push(reservationData);
                            } else {
                                currentlyOngoing.push(reservationData);
                            }
                        }
                    } catch (e) {
                         console.error('Error parsing date for reservation:', res.id, e);
                    }
                });
            }
        }
        return { pickups: todaysPickups, returns: todaysReturns, ongoing: currentlyOngoing };

    }, [allData]);

    return (
        <div>
            <div className="mb-6 bg-white p-4 rounded-lg shadow-sm border">
                <h3 className="text-2xl font-bold text-gray-800">Today's Activity</h3>
                <p className="text-md text-gray-500">{today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Pickups */}
                <section>
                    <h4 className="text-lg font-semibold text-green-700 mb-3 pb-2 border-b-2 border-green-200">Pickups ({pickups.length})</h4>
                    <div className="space-y-4 max-h-[calc(100vh-300px)] overflow-y-auto pr-2">
                        {pickups.length > 0 ? (
                            pickups.map(item => <ReservationCard key={item.res.id} reservation={item.res} year={item.year} month={item.month} onShowVoucher={onShowVoucher} />)
                        ) : (
                            <div className="text-center py-10 text-gray-500 bg-gray-50 rounded-lg">
                                <p>No pickups scheduled for today.</p>
                            </div>
                        )}
                    </div>
                </section>
                
                {/* Returns */}
                 <section>
                    <h4 className="text-lg font-semibold text-red-700 mb-3 pb-2 border-b-2 border-red-200">Returns ({returns.length})</h4>
                    <div className="space-y-4 max-h-[calc(100vh-300px)] overflow-y-auto pr-2">
                         {returns.length > 0 ? (
                            returns.map(item => <ReservationCard key={item.res.id} reservation={item.res} year={item.year} month={item.month} onShowVoucher={onShowVoucher} />)
                        ) : (
                             <div className="text-center py-10 text-gray-500 bg-gray-50 rounded-lg">
                                <p>No returns scheduled for today.</p>
                            </div>
                        )}
                    </div>
                </section>

                {/* Ongoing */}
                <section>
                    <h4 className="text-lg font-semibold text-blue-700 mb-3 pb-2 border-b-2 border-blue-200">Ongoing Rentals ({ongoing.length})</h4>
                    <div className="space-y-4 max-h-[calc(100vh-300px)] overflow-y-auto pr-2">
                         {ongoing.length > 0 ? (
                           ongoing.map(item => <ReservationCard key={item.res.id} reservation={item.res} year={item.year} month={item.month} onShowVoucher={onShowVoucher} />)
                        ) : (
                            <div className="text-center py-10 text-gray-500 bg-gray-50 rounded-lg">
                                <p>No other ongoing rentals today.</p>
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
};

export default TodaysReservations;
