import React, { useEffect } from 'react';

/** Green confirmation note in the corner that closes itself after 3 seconds. */
const ConfirmationMessage: React.FC<{ message: string; onClose: () => void; }> = ({ message, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);
  return (
    <div className="fixed bottom-5 right-5 bg-green-500 text-white py-3 px-6 rounded-lg shadow-lg z-50 animate-in slide-in-from-bottom-2 fade-in">
      <p>{message}</p>
    </div>
  );
};

export default ConfirmationMessage;
