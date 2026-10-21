import React, { useState } from 'react';
import { Fleet } from '../types';
import { carPhotoFor } from '../services/carPhoto';
import { VehicleArt, vehicleKind } from './VehicleGraphics';

export { carPhotoFor };

/**
 * The real car photo when the fleet has one, otherwise the drawn vehicle type.
 * `className` sizes the frame (e.g. "w-16 h-10"); the photo fills it, cropped to fit.
 */
const CarPicture: React.FC<{ fleet?: Fleet; plate?: string; model?: string; className?: string; artClassName?: string; rounded?: string }> = ({ fleet, plate, model, className = 'w-16 h-10', artClassName, rounded = 'rounded-md' }) => {
  const src = carPhotoFor(fleet, plate, model);
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return <img src={src} alt={model || 'Vehicle'} loading="lazy" onError={() => setFailed(true)}
      className={`${className} ${rounded} object-cover bg-slate-100 ring-1 ring-inset ring-slate-200 shrink-0`} />;
  }
  return <VehicleArt kind={vehicleKind(model, fleet)} className={artClassName || className} />;
};

export default CarPicture;
