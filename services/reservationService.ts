import { AppData, Reservation, ImportReport } from '../types';
import { ReservationRepository } from './ReservationRepository';
import { ExcelImportService } from './ExcelImportService';
import { ReservationSummaryService } from './ReservationSummaryService';
import { ReservationSyncService } from './ReservationSyncService';

export class ReservationService {
  private repository: ReservationRepository;

  constructor(initialData?: AppData) {
    this.repository = new ReservationRepository(initialData);
  }

  async initialize(): Promise<AppData> {
    return await this.repository.fetchAll();
  }

  setData(data: AppData) {
    this.repository = new ReservationRepository(data);
  }

  getReservations(year: number, month: string): Reservation[] {
    return this.repository.getBucket(year, month);
  }

  async importFromExcel(
    data: any[],
    year: number,
    month: string,
    fileName: string
  ): Promise<{ data: AppData; report: ImportReport }> {
    const { reservations, report } = ExcelImportService.processExcelData(data, year, month, fileName);
    return this.importReservations(reservations, report, { year, month });
  }

  /**
   * Adds imported reservations. A booking number that already exists anywhere updates that booking
   * in place; new ones go to their own storage month (or the fallback month given).
   * `current` is the data on screen, so nothing saved since the last sync is lost.
   */
  async importReservations(
    reservations: Reservation[],
    report: ImportReport,
    fallback: { year: number; month: string },
    current?: AppData,
  ): Promise<{ data: AppData; report: ImportReport }> {
    if (current) this.setData(current);
    const allData = this.repository.getData();
    const updatedData = JSON.parse(JSON.stringify(allData)) as AppData;

    // Create a global map of invoice -> {year, month, index}
    const globalInvoiceMap = new Map<string, { y: number; m: string; id: string }>();
    Object.keys(updatedData).forEach(yKey => {
      const y = parseInt(yKey);
      Object.keys(updatedData[y]).forEach(m => {
        updatedData[y][m].forEach(res => {
          const key = res.invoice || res.bookingId;
          if (key) globalInvoiceMap.set(key, { y, m, id: res.id });
        });
      });
    });

    reservations.forEach(res => {
      const key = res.invoice;
      if (globalInvoiceMap.has(key)) {
        report.duplicates++;
        report.imported = Math.max(0, report.imported - 1);
        const { y, m, id } = globalInvoiceMap.get(key)!;
        const index = updatedData[y][m].findIndex(r => r.id === id);
        if (index !== -1) {
          const existing = updatedData[y][m][index];
          // Blank cells in the sheet never wipe what the booking already has; its status is kept.
          const keep = (k: string, v: unknown) => {
            if (k === 'status' || k === 'id') return false;
            if (v === '' || v === undefined || v === null) return false;
            if ((k === 'amount' || k === 'baseAmount') && v === 0) return false;
            return true;
          };
          const incoming = Object.fromEntries(Object.entries(res).filter(([k, v]) => keep(k, v))) as Partial<Reservation>;
          // Update existing, keeping its original storage bucket and ID
          updatedData[y][m][index] = {
            ...existing,
            ...incoming,
            id: id,
            storageYear: y,
            storageMonth: m,
            createdAt: existing.createdAt || res.createdAt,
            updatedAt: new Date().toISOString()
          };
          // An agreement opened at the counter before the booking was entered: the import
          // lists it. The car actually handed over and the counter notes are kept.
          if (existing.awaitingConfirmation) {
            Object.assign(updatedData[y][m][index], {
              awaitingConfirmation: false,
              confirmedBy: 'Excel import',
              confirmedAt: new Date().toISOString(),
              notes: [existing.notes, res.notes].filter(Boolean).join(' · '),
              ...(existing.voucherSubmitted ? { carModel: existing.carModel || res.carModel, licensePlate: existing.licensePlate } : {}),
            });
          }
          // Work already done on the booking (agreement, check-in) keeps the car that was handed over.
          if (existing.voucherSubmitted || existing.dropOffCompleted) {
            Object.assign(updatedData[y][m][index], { carModel: existing.carModel, licensePlate: existing.licensePlate });
          }
        }
      } else {
        const y = res.storageYear || fallback.year;
        const m = res.storageMonth || fallback.month;
        if (!updatedData[y]) updatedData[y] = {};
        if (!updatedData[y][m]) updatedData[y][m] = [];
        updatedData[y][m].push({ ...res, storageYear: y, storageMonth: m });
        globalInvoiceMap.set(key, { y, m, id: res.id });
      }
    });

    const saved = await ReservationSyncService.saveToBackend(updatedData);
    if (!saved) {
      throw new Error("Failed to save imported reservations to backend");
    }

    // Refresh the repository store with the new data
    this.setData(updatedData);

    return { data: updatedData, report };
  }

  async updateReservation(reservation: Reservation): Promise<AppData> {
    const updatedData = this.repository.updateLocalReservation(reservation);
    const saved = await ReservationSyncService.saveToBackend(updatedData);
    if (!saved) {
      throw new Error("Failed to save updated reservation to backend");
    }
    // Refresh the repository store with the new data
    this.setData(updatedData);
    return updatedData;
  }

  async deleteReservation(id: string, year: number, month: string): Promise<AppData> {
    const updatedData = this.repository.deleteLocalReservation(id, year, month);
    const saved = await ReservationSyncService.saveToBackend(updatedData);
    if (!saved) {
      throw new Error("Failed to delete reservation from backend");
    }
    // Refresh the repository store with the new data
    this.setData(updatedData);
    return updatedData;
  }

  getSummary(year: number, month: string) {
    const reservations = this.repository.getBucket(year, month);
    return ReservationSummaryService.calculateSummary(reservations);
  }

  async sync(currentData: AppData): Promise<AppData | null> {
    return await ReservationSyncService.syncWithBackend(currentData);
  }

  getData(): AppData {
    return this.repository.getData();
  }
}

export const reservationService = new ReservationService();
export default reservationService;
