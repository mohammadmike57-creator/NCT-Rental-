import React from 'react';
import { CloseIcon, ShieldExclamationIcon } from './icons';

interface Notification {
  id: string;
  message: string;
  type: 'warning' | 'error' | 'info';
  title?: string;
  vehicleInfo?: { modelName: string; licensePlate: string };
}

interface ExpiryAlertModalProps {
  alerts: Notification[];
  onClose: () => void;
}

const ExpiryAlertModal: React.FC<ExpiryAlertModalProps> = ({ alerts, onClose }) => {
  if (alerts.length === 0) return null;

  const alertStyles = {
    warning: 'bg-yellow-100 border-yellow-500 text-yellow-800',
    error: 'bg-red-100 border-red-500 text-red-800',
    info: 'bg-blue-100 border-blue-500 text-blue-800',
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4" aria-modal="true" role="dialog">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <header className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <ShieldExclamationIcon />
            <h2 className="text-xl font-semibold text-gray-800">Important System Alerts</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200" aria-label="Close alerts">
            <CloseIcon />
          </button>
        </header>
        <div className="p-6 overflow-y-auto space-y-3">
          {alerts.map(alert => (
            <div key={alert.id} className={`${alertStyles[alert.type]} border-l-4 p-4 rounded-md`}>
              <p className="font-bold">{alert.title}</p>
              {alert.vehicleInfo && (
                <div className="font-semibold text-base my-1">
                    <span className="font-bold">{alert.vehicleInfo.modelName}</span>
                    <span> ({alert.vehicleInfo.licensePlate})</span>
                </div>
              )}
              <p className="text-sm">{alert.message}</p>
            </div>
          ))}
        </div>
        <footer className="p-4 bg-gray-50 border-t flex justify-end">
          <button onClick={onClose} className="px-6 py-2 bg-primary text-white rounded-md hover:bg-secondary">
            Acknowledge & Close
          </button>
        </footer>
      </div>
    </div>
  );
};

export default ExpiryAlertModal;