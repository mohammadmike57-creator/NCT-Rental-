import { directionOf, invoiceStates } from '../components/channel/AccountsView';
import { autoRepair } from '../services/channelRepair';
import { Aggregator, BrokerAccounting } from '../types';

const inv = (id: string, amount: number, dueDate: string) => ({ id, number: id, month: '2026-10', issuedAt: '2026-11-01', dueDate, direction: 'we_pay' as const, amount, currency: 'USD', bookings: 3 });

describe('broker accounts', () => {
  test('each invoice is open, part paid, paid or overdue from its payments and due date', () => {
    const acc: BrokerAccounting = {
      invoices: [inv('A', 100, '2026-12-01'), inv('B', 80, '2026-11-10'), inv('C', 50, '2026-12-01'), inv('D', 40, '2026-11-10')],
      payments: [{ id: 'p1', date: '2026-11-05', amount: 100, currency: 'USD', invoiceId: 'A' }, { id: 'p2', date: '2026-11-05', amount: 20, currency: 'USD', invoiceId: 'C' },
        { id: 'p3', date: '2026-11-05', amount: 40, currency: 'USD', invoiceId: 'D' }],
    };
    const s = invoiceStates(acc, '2026-11-21');
    expect(s.map(x => [x.inv.id, x.state, x.open])).toEqual([['A', 'paid', 0], ['B', 'overdue', 80], ['C', 'part', 30], ['D', 'paid', 0]]);
  });

  test('who pays whom follows the settlement agreed with the broker', () => {
    const a = (settlement?: string, direction?: string) => ({ connectionProfile: { settlement }, accounting: direction ? { invoices: [], payments: [], direction } : undefined } as unknown as Aggregator);
    expect(directionOf(a('COUNTER'))).toBe('we_pay');
    expect(directionOf(a('BROKER_VOUCHER'))).toBe('broker_pays');
    expect(directionOf(a('COUNTER', 'broker_pays'))).toBe('broker_pays');
    expect(directionOf(a())).toBe('we_pay');
  });

  test('brokers never see the system name: supplier code NCT becomes URD', () => {
    const a = { id: 'a', name: 'Hogicar', vendorCode: 'NCT', vendorName: 'NCT Rental', currentRatePlans: [] } as unknown as Aggregator;
    const r = autoRepair(a);
    expect(r.agg.vendorCode).toBe('URD');
    expect(r.agg.vendorName).toBe('UR-Drive Jordan');
    expect(r.fixes).toHaveLength(2);
    expect(autoRepair(r.agg).fixes).toEqual([]);
  });
});
