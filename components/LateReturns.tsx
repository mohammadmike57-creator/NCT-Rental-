import React, { useMemo } from 'react';
import { Reservation } from '../types';

interface LateReturnsProps {
  allData: any; // adjust based on your actual app structure
  onUpdateReservation: (reservation: Reservation) => void;
  // currentUser is still needed for display or other logic, but not for permission check
  currentUser?: any;
}

const LateReturns: React.FC<LateReturnsProps> = ({ allData, onUpdateReservation }) => {
  // Filter reservations that are late (endDate < now and not completed/dropped off)
  const lateReservations = useMemo(() => {
    const now = new Date();
    return Object.values(allData).flatMap((yearData: any) =>
      Object.values(yearData).flatMap((monthData: any) =>
        monthData.filter((r: Reservation) => {
          const end = new Date(r.endDate);
          return end < now && r.status !== 'COMPLETED' && !r.dropOffCompleted;
        })
      )
    );
  }, [allData]);

  const handleClose = (reservation: Reservation) => {
    // Mark as completed and drop off completed
    const updated = { ...reservation, status: 'COMPLETED', dropOffCompleted: true };
    onUpdateReservation(updated);
    alert(`Late return for ${reservation.personName} closed.`);
  };

  if (lateReservations.length === 0) {
    return <div className="p-8 text-center text-gray-500">No late returns at this time.</div>;
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold mb-4">Late Returns</h2>
      <div className="space-y-4">
        {lateReservations.map(res => (
          <div key={res.id} className="border rounded-lg p-4 bg-white shadow-sm">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-medium">{res.personName}</div>
                <div className="text-sm text-gray-600">Car: {res.carModel}</div>
                <div className="text-sm text-gray-600">Return due: {new Date(res.endDate).toLocaleString()}</div>
              </div>
              <div>
                <button
                  onClick={() => handleClose(res)}
                  className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Close Agreement
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LateReturns;
