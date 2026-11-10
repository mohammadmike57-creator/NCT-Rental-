import { useEffect, useState } from 'react';
import { loadedSection, saveAllData } from '../firebase/api';
import type { CommissionMonthOverride, CommissionMonthOverrides } from './revenueByMonth';

/**
 * The months chosen by hand for single add-ons (saved as "commissionMonths", apart from the bookings).
 * One shared copy, so Yearly Summary and Reservation Add-ons always show the same choice.
 */
let current: CommissionMonthOverrides | null = null;
const listeners = new Set<(o: CommissionMonthOverrides) => void>();
const read = () => (current ??= loadedSection<CommissionMonthOverrides>('commissionMonths') || {});

export async function setCommissionMonth(eventId: string, to: CommissionMonthOverride | null): Promise<void> {
  const next = { ...read() };
  if (to) next[eventId] = to; else delete next[eventId];
  current = next;
  listeners.forEach(l => l(next));
  await saveAllData({ commissionMonths: next } as never);
}

export function useCommissionMonths(): CommissionMonthOverrides {
  const [o, setO] = useState<CommissionMonthOverrides>(read);
  useEffect(() => { listeners.add(setO); setO(read()); return () => { listeners.delete(setO); }; }, []);
  return o;
}
