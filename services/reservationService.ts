import { AppData, Reservation, ImportReport } from '../types';
import { pickupMonthOf } from './pickupMonth';
import { ReservationRepository } from './ReservationRepository';
import { ExcelImportService } from './ExcelImportService';
import { ReservationSummaryService } from './ReservationSummaryService';
import { ReservationSyncService } from './ReservationSyncService';
import { bookingKey } from './duplicates';

export { pickupMonthOf };

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
          const key = bookingKey(res);
          if (key && !globalInvoiceMap.has(key)) globalInvoiceMap.set(key, { y, m, id: res.id });
        });
      });
    });

    reservations.forEach(res => {
      // Matched on the booking number however it is written, so a booking already worked on
      // (agreement opened or closed) is updated rather than imported a second time.
      const key = bookingKey({ bookingId: res.invoice || res.bookingId });
      if (key && globalInvoiceMap.has(key)) {
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
          // A booking is listed in its pick-up month: one filed under another month moves there.
          const ty = res.storageYear, tm = res.storageMonth;
          if (ty && tm && (ty !== y || tm !== m)) {
            const [moved] = updatedData[y][m].splice(index, 1);
            if (!updatedData[ty]) updatedData[ty] = {};
            if (!updatedData[ty][tm]) updatedData[ty][tm] = [];
            updatedData[ty][tm].push({ ...moved, storageYear: ty, storageMonth: tm });
            globalInvoiceMap.set(key, { y: ty, m: tm, id });
          }
        }
      } else {
        const y = res.storageYear || fallback.year;
        const m = res.storageMonth || fallback.month;
        if (!updatedData[y]) updatedData[y] = {};
        if (!updatedData[y][m]) updatedData[y][m] = [];
        updatedData[y][m].push({ ...res, storageYear: y, storageMonth: m });
        if (key) globalInvoiceMap.set(key, { y, m, id: res.id });
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

  /** Bookings filed under a month other than their pick-up month (e.g. 29 Dec listed in January). */
  static misfiled(data: AppData): { reservation: Reservation; from: { y: number; m: string }; to: { y: number; m: string } }[] {
    const out: { reservation: Reservation; from: { y: number; m: string }; to: { y: number; m: string } }[] = [];
    Object.keys(data || {}).forEach(yKey => {
      const y = +yKey;
      Object.keys(data[y] || {}).forEach(m => (data[y][m] || []).forEach(r => {
        const to = pickupMonthOf(r);
        if (to && (to.y !== y || to.m !== m)) out.push({ reservation: r, from: { y, m }, to });
      }));
    });
    return out;
  }

  /**
   * Moves misfiled bookings to their pick-up month and saves.
   * edits: corrections made by hand first (by reservation id); ids: only these bookings (default all).
   */
  async moveToPickupMonths(current?: AppData, opts: { ids?: string[]; edits?: Record<string, Partial<Reservation>> } = {}): Promise<{ data: AppData; moved: number; edited: number }> {
    if (current) this.setData(current);
    const updatedData = JSON.parse(JSON.stringify(this.repository.getData())) as AppData;
    const pick = opts.ids ? new Set(opts.ids) : null;
    let edited = 0;
    const now = new Date().toISOString();
    Object.keys(updatedData).forEach(y => Object.keys(updatedData[+y] || {}).forEach(m => {
      updatedData[+y][m] = (updatedData[+y][m] || []).map(r => {
        const e = opts.edits?.[r.id];
        if (!e || (pick && !pick.has(r.id))) return r;
        edited++;
        return { ...r, ...e, updatedAt: now };
      });
    }));
    const list = ReservationService.misfiled(updatedData).filter(x => !pick || pick.has(x.reservation.id));
    list.forEach(({ reservation, from, to }) => {
      updatedData[from.y][from.m] = updatedData[from.y][from.m].filter(r => r.id !== reservation.id);
      if (!updatedData[to.y]) updatedData[to.y] = {};
      if (!updatedData[to.y][to.m]) updatedData[to.y][to.m] = [];
      updatedData[to.y][to.m].push({ ...reservation, storageYear: to.y, storageMonth: to.m });
    });
    if ((list.length || edited) && !(await ReservationSyncService.saveToBackend(updatedData))) {
      throw new Error('Failed to save the moved reservations');
    }
    this.setData(updatedData);
    return { data: updatedData, moved: list.length, edited };
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
