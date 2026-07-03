import { Reservation } from '../types';

export class ReservationSummaryService {
  static calculateSummary(reservations: Reservation[]) {
    const totalCount = reservations.length;
    const totalAmount = reservations.reduce((sum, res) => sum + (res.amount || 0), 0);
    
    // Group by status
    const statusCounts = reservations.reduce((acc, res) => {
      const status = res.status || 'UNKNOWN';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalCount,
      totalAmount,
      statusCounts
    };
  }
}
