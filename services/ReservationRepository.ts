import { AppData, Reservation, ImportReport } from '../types';
import { ReservationStore } from './ReservationStore';
import { fetchInitialData, saveAllData } from '../firebase/api';

export class ReservationRepository {
  private store: ReservationStore;

  constructor(initialData?: AppData) {
    this.store = new ReservationStore(initialData);
  }

  getData(): AppData {
    return this.store.getData();
  }

  getBucket(year: number, month: string): Reservation[] {
    return this.store.getBucket(year, month);
  }

  async fetchAll(): Promise<AppData> {
    const state = await fetchInitialData();
    if (state && state.reservations) {
      // Re-initialize store with backend data
      this.store = new ReservationStore(state.reservations);
    }
    return this.store.getData();
  }

  async save(data: AppData): Promise<void> {
    await saveAllData({ reservations: data } as any);
  }

  updateLocalBucket(year: number, month: string, reservations: Reservation[]): AppData {
    return this.store.setBucket(year, month, reservations);
  }

  updateLocalReservation(reservation: Reservation): AppData {
    return this.store.updateReservation(reservation);
  }

  deleteLocalReservation(id: string, year: number, month: string): AppData {
    return this.store.deleteReservation(id, year, month);
  }
}
