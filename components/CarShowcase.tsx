import React, { useState } from 'react';
import { Fleet } from '../types';
import { carPhotoFor } from '../services/carPhoto';
import { VehicleArt, vehicleKind, vehicleKindLabel } from './VehicleGraphics';

/**
 * Presentation card for the car on a booking: the real photo (or the drawn vehicle type when the
 * fleet has no photo) with model, plate and key specs over it.
 */
const CarShowcase: React.FC<{ fleet?: Fleet; plate?: string; model?: string; className?: string; size?: 'md' | 'lg' }> = ({ fleet, plate, model, className = '', size = 'md' }) => {
  const norm = (s?: string) => (s || '').toLowerCase().trim();
  const car = (fleet || []).find(v => plate && norm(v.licensePlate) === norm(plate)) || (fleet || []).find(v => model && norm(v.modelName) === norm(model));
  const src = carPhotoFor(fleet, plate, model);
  const [failed, setFailed] = useState(false);
  const kind = vehicleKind(model, fleet);
  const specs = [car?.category || vehicleKindLabel[kind], car?.transmission, car?.sippCode].filter(Boolean) as string[];
  const h = size === 'lg' ? 'aspect-[16/9]' : 'aspect-[16/8]';

  return (
    <div className={`relative overflow-hidden rounded-xl ring-1 ring-slate-200 ${h} ${className}`}>
      {src && !failed ? (
        <img src={src} alt={model || 'Vehicle'} onError={() => setFailed(true)} className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-100 via-white to-indigo-50 flex items-center justify-center">
          <VehicleArt kind={kind} className="w-3/5 h-auto max-h-[65%] drop-shadow-md" />
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/85 via-slate-950/45 to-transparent px-3.5 pt-8 pb-3">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className={`${size === 'lg' ? 'text-lg' : 'text-[15px]'} font-semibold text-white leading-tight truncate drop-shadow`}>{model || 'No vehicle assigned'}</p>
            {specs.length > 0 && <p className="mt-0.5 text-[11.5px] text-white/80 truncate">{specs.join(' · ')}</p>}
          </div>
          <span className="shrink-0 px-2 py-0.5 rounded-md bg-white text-slate-900 font-mono text-[12px] font-bold tracking-wider shadow ring-1 ring-black/10">{plate || 'NO PLATE'}</span>
        </div>
      </div>
    </div>
  );
};

export default CarShowcase;
