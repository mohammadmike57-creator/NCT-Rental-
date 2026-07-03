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
        const { y, m, id } = globalInvoiceMap.get(key)!;
        const index = updatedData[y][m].findIndex(r => r.id === id);
        if (index !== -1) {
          // Update existing, keeping its original storage bucket and ID
          updatedData[y][m][index] = { 
            ...updatedData[y][m][index], 
            ...res, 
            id: id, 
            storageYear: y, 
            storageMonth: m,
            updatedAt: new Date().toISOString() 
          };
        }
      } else {
        // Create new in target bucket
        if (!updatedData[year]) updatedData[year] = {};
        if (!updatedData[year][month]) updatedData[year][month] = [];
        updatedData[year][month].push(res);
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
