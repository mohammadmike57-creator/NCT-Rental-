
import React from 'react';
import { Fleet } from '../types';
import { DailyAssignments } from './FleetAvailability';
import { CloseIcon } from './icons';

interface DailyAvailabilityModalProps {
  date: string;
  assignments: DailyAssignments;
  fleet: Fleet;
  onClose: () => void;
}

const DailyAvailabilityModal: React.FC<DailyAvailabilityModalProps> = ({ date, assignments, fleet, onClose }) => {
  const sortedFleet = [...fleet].sort((a, b) => a.modelName.localeCompare(b.modelName) || a.licensePlate.localeCompare(b.licensePlate));

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4"
      aria-modal="true"
      role="dialog"
    >
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <header className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800">
            Fleet Status for {new Date(date + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-secondary rounded-full p-1"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </header>
        <div className="p-6 overflow-y-auto">
          <ul className="space-y-3">
            {sortedFleet.map(vehicle => {
              const reservation = assignments[vehicle.licensePlate];
              const isBooked = !!reservation;
              return (
                <li key={vehicle.id} className="flex items-center justify-between bg-gray-50 p-3 rounded-md">
                  <div>
                    <p className="font-semibold text-gray-800">{vehicle.modelName}</p>
                    <p className="text-sm text-gray-500">{vehicle.licensePlate}</p>
                  </div>
                  {isBooked ? (
                    <div className="text-right">
                        <span className="px-3 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                           Booked
                        </span>
                        <p className="text-sm text-gray-600 mt-1">Renter: {reservation.personName}</p>
                    </div>
                  ) : (
                    <span className="px-3 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                      Available
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default DailyAvailabilityModal;
