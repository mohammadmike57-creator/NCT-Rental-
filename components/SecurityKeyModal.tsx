import React, { useState, useEffect, useRef } from 'react';

const SECURITY_KEY = '2024';

interface SecurityKeyModalProps {
  onSuccess: () => void;
  onClose: () => void;
}

const SecurityKeyModal: React.FC<SecurityKeyModalProps> = ({ onSuccess, onClose }) => {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Auto-focus the input field when the modal opens
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (key === SECURITY_KEY) {
      setError('');
      onSuccess();
    } else {
      setError('Invalid security key. Please try again.');
      setKey('');
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4"
      aria-modal="true"
      role="dialog"
    >
      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-2xl w-full max-w-sm">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-800">Security Check</h3>
          <p className="mt-2 text-sm text-gray-600">
            This action requires authorization. Please enter the security key to proceed.
          </p>
          <input
            ref={inputRef}
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="mt-4 w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-secondary focus:border-secondary"
            placeholder="Enter security key"
            aria-describedby="key-error"
          />
          {error && (
            <p id="key-error" className="mt-2 text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 p-4 bg-gray-50 border-t border-gray-200 rounded-b-lg">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-secondary text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-primary text-white rounded-md hover:bg-secondary transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary text-sm font-medium"
          >
            Submit
          </button>
        </div>
      </form>
    </div>
  );
};

export default SecurityKeyModal;