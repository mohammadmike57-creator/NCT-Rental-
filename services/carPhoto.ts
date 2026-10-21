import { Fleet } from '../types';
import { mediaUrl } from '../firebase/api';

/** Photo for a booking's car: the exact plate first, otherwise any car of the same model that has one. */
export const carPhotoFor = (fleet: Fleet | undefined, plate?: string, model?: string): string | undefined => {
  if (!fleet || !fleet.length) return undefined;
  const norm = (s?: string) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const byPlate = plate ? fleet.find(v => norm(v.licensePlate) === norm(plate) && v.imageUrl) : undefined;
  const byModel = model ? fleet.find(v => norm(v.modelName) === norm(model) && v.imageUrl) : undefined;
  return mediaUrl((byPlate || byModel)?.imageUrl);
};
