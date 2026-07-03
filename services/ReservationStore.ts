import { AppData, Reservation } from '../types';

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

  updateReservation(reservation: Reservation): AppData {
    const { storageYear: year, storageMonth: month, id } = reservation;
    
    if (!year || !month) {
      console.error(`[STORE ERROR] Cannot update reservation ${id}: Missing storage bucket info`, reservation);
      return this.data;
    }

    console.log(`[STORE LOG] Updating reservation ${id} in bucket ${year}/${month}`);
    const bucket = this.getBucket(year, month);
    const index = bucket.findIndex(r => r.id === id);
    
    if (index !== -1) {
      const newBucket = [...bucket];
      newBucket[index] = { ...reservation, updatedAt: new Date().toISOString() };
      return this.setBucket(year, month, newBucket);
    }
    
    console.log(`[STORE LOG] Reservation ${id} not found in bucket ${year}/${month}, adding as new`);
    const newBucket = [...bucket, { ...reservation, updatedAt: new Date().toISOString() }];
    return this.setBucket(year, month, newBucket);
  }

  deleteReservation(id: string, year: number, month: string): AppData {
    if (!year || !month) {
      console.error(`[STORE ERROR] Cannot delete reservation ${id}: Missing storage bucket info`);
      return this.data;
    }

    console.log(`[STORE LOG] Deleting reservation ${id} from bucket ${year}/${month}`);
    const bucket = this.getBucket(year, month);
    const newBucket = bucket.filter(r => r.id !== id);
    return this.setBucket(year, month, newBucket);
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
