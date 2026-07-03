import { AppData, Reservation } from '../types';
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

  static async syncWithBackend(currentData: AppData): Promise<AppData | null> {
    if (this.isSaving) {
      console.log('[SYNC LOG] Skipping sync: Saving in progress');
      return null;
    }

    if (this.hasLocalChanges) {
      console.log('[SYNC LOG] Skipping sync: Unsaved local changes exist');
      return null;
    }

    try {
      const backendData = await fetchInitialData();
      if (!backendData) return null;
      // In a real scenario, we would check timestamps at a more granular level.
      // For this overhaul, we'll assume the backend is the source of truth if we have no local changes.
      console.log('[SYNC LOG] Sync successful');
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
      console.log('[SAVE LOG] Data saved to backend successfully');
      return true;
    } catch (error) {
      console.error('[SAVE LOG] Failed to save data', error);
      return false;
    } finally {
      this.isSaving = false;
    }
  }
}
