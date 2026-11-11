import { normalizePaymentType, normalizeSources } from '../../services/paymentType';
import { PaymentType } from '../../types';

describe('source payment types from the server', () => {
  it('reads every spelling', () => {
    expect(normalizePaymentType('Prepaid')).toBe(PaymentType.PREPAID);
    expect(normalizePaymentType('PREPAID')).toBe(PaymentType.PREPAID);
    expect(normalizePaymentType('Pay on Arrival')).toBe(PaymentType.PAY_ON_ARRIVAL);
    expect(normalizePaymentType('PAY_ON_ARRIVAL')).toBe(PaymentType.PAY_ON_ARRIVAL);
    expect(normalizePaymentType('Both')).toBe(PaymentType.BOTH);
    expect(normalizePaymentType(undefined)).toBe(PaymentType.PAY_ON_ARRIVAL);
  });
  it('leaves correct sources untouched and fixes the rest', () => {
    const ok = { id: '1', name: 'Website', paymentType: PaymentType.PREPAID };
    const [a, b] = normalizeSources([ok, { id: '2', name: 'Phone', paymentType: 'PAY_ON_ARRIVAL' as PaymentType }]);
    expect(a).toBe(ok);
    expect(b.paymentType).toBe(PaymentType.PAY_ON_ARRIVAL);
  });
});
