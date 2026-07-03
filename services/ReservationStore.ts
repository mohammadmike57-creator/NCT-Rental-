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
    const bucket = this.getBucket(year, month);
    const index = bucket.findIndex(r => r.id === id);
    
    if (index !== -1) {
      const newBucket = [...bucket];
      newBucket[index] = { ...reservation, updatedAt: new Date().toISOString() };
      return this.setBucket(year, month, newBucket);
    }
    return this.data;
  }

  deleteReservation(id: string, year: number, month: string): AppData {
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
