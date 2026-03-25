import React from 'react';

const LoadingSpinner: React.FC = () => (
  <div 
    className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center"
    role="status"
    aria-live="polite"
    aria-label="Loading"
  >
    <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-white"></div>
  </div>
);

export default LoadingSpinner;
