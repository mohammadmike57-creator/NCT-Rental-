import React, { useState, useEffect } from 'react';

/** Modal that fades and scales in and out. */
const AnimatedModal: React.FC<{ 
  isOpen: boolean; 
  onClose: () => void; 
  children: React.ReactNode;
  className?: string;
}> = ({ isOpen, onClose, children, className = "" }) => {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [animationClass, setAnimationClass] = useState("");

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setAnimationClass("animate-modal-enter");
    } else {
      setAnimationClass("animate-modal-exit");
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 300); // match duration of animate-modal-exit
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!shouldRender) return null;

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto ${className}`}>
      <div 
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`} 
        onClick={onClose}
      />
      <div className={`relative w-full max-w-5xl z-10 ${animationClass}`}>
        {children}
      </div>
    </div>
  );
};

export default AnimatedModal;
