import { Fleet, Vehicle } from '../types';

const norm = (s?: string) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const normPlate = (s?: string) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** The fleet car a booking uses: the exact car by plate, else the first car of the same model. */
export function fleetCarFor(fleet: Fleet | undefined, plate?: string, model?: string): Vehicle | undefined {
  if (!fleet || !fleet.length) return undefined;
  const p = normPlate(plate);
  const byPlate = p ? fleet.find(v => normPlate(v.licensePlate) === p) : undefined;
  if (byPlate) return byPlate;
  const m = norm(model);
  return m ? fleet.find(v => norm(v.modelName) === m) : undefined;
}

/** Deposit and excess of the car a booking uses, or undefined when the car is not in the fleet. */
export function depositTermsFor(fleet: Fleet | undefined, plate?: string, model?: string) {
  const car = fleetCarFor(fleet, plate, model);
  return car ? { securityDeposit: car.securityDeposit || 0, excess: car.excess || 0, car } : undefined;
}
