import React, { useState } from 'react';
import { Fleet } from '../types';
import { mediaUrl } from '../firebase/api';
import { VehicleArt, vehicleKind } from './VehicleGraphics';

/** Photo for a booking's car: the exact plate first, otherwise any car of the same model that has one. */
export const carPhotoFor = (fleet: Fleet | undefined, plate?: string, model?: string): string | undefined => {
  if (!fleet || !fleet.length) return undefined;
  const norm = (s?: string) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const byPlate = plate ? fleet.find(v => norm(v.licensePlate) === norm(plate) && v.imageUrl) : undefined;
  const byModel = model ? fleet.find(v => norm(v.modelName) === norm(model) && v.imageUrl) : undefined;
  return mediaUrl((byPlate || byModel)?.imageUrl);
};

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
