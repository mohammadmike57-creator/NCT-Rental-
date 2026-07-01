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
    <div className="bg-white p-8 rounded-[2.5rem] shadow-lg border border-slate-200 hover:shadow-2xl hover:shadow-indigo-100 transition-all duration-700 group">
        <div className="flex justify-between items-start mb-6">
            <div className="min-w-0">
                <p className="font-black text-slate-900 truncate tracking-tighter text-2xl group-hover:text-indigo-600 transition-colors">{reservation.personName}</p>
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mt-2 bg-slate-50 px-3 py-1 rounded-lg border border-slate-100 inline-block">ID: {reservation.bookingId || 'N/A'}</p>
            </div>
            <button
                onClick={() => onShowVoucher(reservation, year, month)}
                className="p-3.5 rounded-2xl text-indigo-600 bg-indigo-50 hover:bg-indigo-600 hover:text-white transition-all shadow-md active:scale-95 border border-indigo-100"
                title="View Agreement"
            >
                <DocumentTextIcon className="w-6 h-6" />
            </button>
        </div>
        <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 rounded-3xl bg-slate-50 border border-slate-100 group-hover:bg-white group-hover:border-indigo-100 transition-all duration-500">
                <div className="p-3 bg-white rounded-2xl shadow-sm border border-slate-100 text-indigo-600">
                   <CarIcon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                   <p className="text-[9px] text-slate-400 font-black uppercase tracking-[0.2em] leading-none mb-1.5">Vehicle</p>
                   <p className="text-sm font-black text-slate-800 truncate">{reservation.carModel} <span className="text-slate-400 font-medium ml-1 text-xs">({reservation.licensePlate || 'TBD'})</span></p>
                </div>
            </div>
             <div className="p-6 rounded-[2rem] bg-slate-900 text-white shadow-xl shadow-slate-200 relative overflow-hidden group-hover:bg-indigo-950 transition-all duration-700">
                <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full blur-2xl -mr-12 -mt-12" />
                <div className="flex items-center gap-3 mb-4 relative z-10">
                   <div className="p-2 bg-white/10 rounded-xl backdrop-blur-md">
                      <ClockIcon className="w-4 h-4 text-emerald-400" />
                   </div>
                   <p className="text-[9px] text-slate-300 font-black uppercase tracking-[0.2em]">Duration & Time</p>
                </div>
                <div className="grid grid-cols-2 gap-4 relative z-10">
                   <div className="border-l border-emerald-500/30 pl-3">
                      <p className="text-[8px] text-emerald-400 font-bold uppercase mb-1">Pickup</p>
                      <p className="text-[11px] font-black">{reservation.startDate?.split('T')[0]}</p>
                      <p className="text-lg font-light text-emerald-50">{reservation.startDate?.split('T')[1]?.substring(0,5)}</p>
                   </div>
                   <div className="border-l border-rose-500/30 pl-3">
                      <p className="text-[8px] text-rose-400 font-bold uppercase mb-1">Return</p>
                      <p className="text-[11px] font-black">{reservation.endDate?.split('T')[0]}</p>
                      <p className="text-lg font-light text-rose-50">{reservation.endDate?.split('T')[1]?.substring(0,5)}</p>
                   </div>
                </div>
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
