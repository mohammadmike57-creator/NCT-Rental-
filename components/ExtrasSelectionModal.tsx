import React, { useState, useEffect, useMemo } from 'react';
import { AvailableExtra, Reservation } from '../types';

interface ExtrasSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  reservation: Reservation;
  availableExtras: AvailableExtra[];
  onConfirm: (updatedReservation: Reservation) => void;
}

const ExtrasSelectionModal: React.FC<ExtrasSelectionModalProps> = ({
  isOpen,
  onClose,
  reservation,
  availableExtras,
  onConfirm,
}) => {
  const [selectedExtras, setSelectedExtras] = useState<string[]>([]);

  // Calculate duration in days
  const durationDays = useMemo(() => {
    if (!reservation.startDate || !reservation.endDate) return 0;
    const start = new Date(reservation.startDate);
    const end = new Date(reservation.endDate);
    const diff = end.getTime() - start.getTime();
    return Math.max(0, diff / (1000 * 3600 * 24));
  }, [reservation.startDate, reservation.endDate]);

  // Calculate total extra cost
  const totalExtraCost = useMemo(() => {
    return selectedExtras.reduce((sum, extraId) => {
      const extra = availableExtras.find(e => e.id === extraId);
      if (extra && extra.pricePerDay) {
        return sum + (extra.pricePerDay * durationDays);
      }
      return sum;
    }, 0);
  }, [selectedExtras, availableExtras, durationDays]);

  const handleToggleExtra = (extraId: string) => {
    setSelectedExtras(prev =>
      prev.includes(extraId) ? prev.filter(id => id !== extraId) : [...prev, extraId]
    );
  };

  const handleConfirm = () => {
    if (selectedExtras.length === 0) {
      alert('Please select at least one extra.');
      return;
    }

    // Create extra objects for each selected extra
    const newExtras = selectedExtras.map(extraId => {
      const extra = availableExtras.find(e => e.id === extraId)!;
      return {
        id: `extra-${Date.now()}-${extraId}`,
        name: extra.name,
        price: extra.pricePerDay * durationDays,
        addedAt: new Date().toISOString(),
      };
    });

    const updatedReservation: Reservation = {
      ...reservation,
      extras: [...(reservation.extras || []), ...newExtras],
      amount: (reservation.amount || 0) + totalExtraCost,
      lastEditedBy: reservation.lastEditedBy,
    };

    onConfirm(updatedReservation);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose} aria-hidden="true"></div>
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4" id="modal-title">
              Add Extras to {reservation.personName}
            </h3>
            <div className="space-y-3">
              <p className="text-sm text-gray-600">Duration: {durationDays.toFixed(1)} days</p>
              <div className="border rounded p-3 max-h-60 overflow-y-auto">
                {availableExtras.map(extra => (
                  <label key={extra.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedExtras.includes(extra.id)}
                        onChange={() => handleToggleExtra(extra.id)}
                        className="rounded"
                      />
                      <span className="text-sm">{extra.name}</span>
                    </div>
                    <span className="text-sm font-medium text-gray-700">
                      ${(extra.pricePerDay * durationDays).toFixed(2)}
                    </span>
                  </label>
                ))}
              </div>
              <div className="flex justify-between items-center pt-3 border-t">
                <span className="text-sm font-semibold">Total Extra Cost:</span>
                <span className="text-lg font-bold text-primary">${totalExtraCost.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold">Current Total:</span>
                <span className="text-lg font-bold">${reservation.amount?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center bg-gray-50 p-2 rounded">
                <span className="text-sm font-semibold">New Total:</span>
                <span className="text-xl font-bold text-green-600">${(reservation.amount + totalExtraCost).toFixed(2)}</span>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              type="button"
              onClick={handleConfirm}
              className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary text-base font-medium text-white hover:bg-primary-dark focus:outline-none sm:ml-3 sm:w-auto sm:text-sm"
            >
              Add Selected Extras
            </button>
            <button
              type="button"
              onClick={onClose}
              className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExtrasSelectionModal;
