import { AppData, Reservation } from '../types';
import { pickupMonthOf } from './pickupMonth';

export class ReservationStore {
  private data: AppData = {};

  constructor(initialData?: AppData) {
    if (initialData) {
      this.data = JSON.parse(JSON.stringify(initialData));
    }
  }

  getData(): AppData {
    return this.data;
  }

  getBucket(year: number, month: string): Reservation[] {
    return this.data[year]?.[month] || [];
  }

  setBucket(year: number, month: string, reservations: Reservation[]): AppData {
    const newData = { ...this.data };
    if (!newData[year]) newData[year] = {};
    newData[year] = { ...newData[year], [month]: [...reservations] };
    this.data = newData;
    return this.data;
  }

  /** Every month a booking with this id is filed under (normally one). */
  private locate(id: string): { year: number; month: string }[] {
    const out: { year: number; month: string }[] = [];
    Object.keys(this.data).forEach(y => Object.keys(this.data[+y] || {}).forEach(m => {
      if ((this.data[+y][m] || []).some(r => r.id === id)) out.push({ year: +y, month: m });
    }));
    return out;
  }

  /**
   * Saves a booking in its pick-up month. When its pick-up date moved to another month (30 Sep →
   * 1 Oct), it leaves the old month; any stray copy under another month is removed too.
   */
  updateReservation(reservation: Reservation): AppData {
    const { id } = reservation;
    const found = this.locate(id);
    const target = pickupMonthOf(reservation)
      || (reservation.storageYear && reservation.storageMonth ? { y: +reservation.storageYear, m: reservation.storageMonth } : null)
      || (found[0] ? { y: found[0].year, m: found[0].month } : null);
    if (!target) {
      console.error(`[STORE ERROR] Cannot save reservation ${id}: no pick-up date or month`, reservation);
      return this.data;
    }
    const saved: Reservation = {
      ...reservation,
      storageYear: target.y,
      storageMonth: target.m,
      ...(reservation.importLockedYear || reservation.importLockedMonth ? { importLockedYear: target.y, importLockedMonth: target.m } : {}),
      updatedAt: new Date().toISOString(),
    };
    found.filter(f => f.year !== target.y || f.month !== target.m)
      .forEach(f => this.setBucket(f.year, f.month, this.getBucket(f.year, f.month).filter(r => r.id !== id)));
    const bucket = this.getBucket(target.y, target.m);
    const index = bucket.findIndex(r => r.id === id);
    const next = index === -1 ? [...bucket, saved] : bucket.map((r, i) => (i === index ? saved : r));
    return this.setBucket(target.y, target.m, next);
  }

  /** Deletes a booking wherever it is filed (year and month are only a hint). */
  deleteReservation(id: string, year?: number, month?: string): AppData {
    const found = this.locate(id);
    if (!found.length) console.warn(`[STORE LOG] Reservation ${id} not found (asked for ${month} ${year})`);
    found.forEach(f => this.setBucket(f.year, f.month, this.getBucket(f.year, f.month).filter(r => r.id !== id)));
    return this.data;
  }

  addReservations(year: number, month: string, newReservations: Reservation[]): AppData {
    const bucket = this.getBucket(year, month);
    // Use invoice (bookingId) for duplicate detection as requested
    const bucketMap = new Map(bucket.map(r => [r.invoice || r.bookingId, r]));
    
    newReservations.forEach(res => {
      bucketMap.set(res.invoice || res.bookingId, res);
    });

    return this.setBucket(year, month, Array.from(bucketMap.values()));
  }

  clear() {
    this.data = {};
  }
}
