const DAY = 86400000;
/** Rental days with the 2-hour grace period used across the system. */
export const rentalDaysOf = (start: string, end: string) => {
  const diff = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(diff) || diff <= DAY) return 1;
  const full = Math.floor(diff / DAY);
  return diff % DAY >= 2 * 3600000 ? full + 1 : full;
};
