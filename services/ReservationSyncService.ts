import { AppData } from '../types';
import { fetchInitialData, saveAllData } from '../firebase/api';

export class ReservationSyncService {
  private static lastSyncTimestamp: string = new Date(0).toISOString();
  private static isSaving: boolean = false;
  private static hasLocalChanges: boolean = false;

  static setSaving(value: boolean) {
    this.isSaving = value;
  }

  static setLocalChanges(value: boolean) {
    this.hasLocalChanges = value;
  }

  /** False while a save is running or there are changes not saved yet. */
  static canSync() { return !this.isSaving && !this.hasLocalChanges; }

  static async syncWithBackend(_currentData: AppData): Promise<AppData | null> {
    if (this.isSaving) {
      return null;
    }

    if (this.hasLocalChanges) {
      return null;
    }

    try {
      const backendData = await fetchInitialData();
      if (!backendData) return null;
      // In a real scenario, we would check timestamps at a more granular level.
      // For this overhaul, we'll assume the backend is the source of truth if we have no local changes.
      this.lastSyncTimestamp = new Date().toISOString();
      return backendData.reservations;
    } catch (error) {
      console.error('[SYNC LOG] Sync failed', error);
      return null;
    }
  }

  static async saveToBackend(data: AppData): Promise<boolean> {
    this.isSaving = true;
    try {
      await saveAllData({ reservations: data } as any);
      this.hasLocalChanges = false;
      this.lastSyncTimestamp = new Date().toISOString();
      return true;
    } catch (error) {
      console.error('[SAVE LOG] Failed to save data', error);
      return false;
    } finally {
      this.isSaving = false;
    }
  }
}
