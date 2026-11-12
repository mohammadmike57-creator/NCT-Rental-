import { calculateDaysWithGrace, isDriverExtra, emailCheck, kmOutOk, kmInOk, chargesOk, signedCount, countChecked, firstMissingStep } from '../../components/voucher/agreementRules';

describe('rental days on the agreement', () => {
  it('counts at least one day', () => {
    expect(calculateDaysWithGrace('', '')).toBe(1);
    expect(calculateDaysWithGrace('2026-05-01T10:00', '2026-05-01T18:00')).toBe(1);
    expect(calculateDaysWithGrace('2026-05-02T10:00', '2026-05-01T10:00')).toBe(1);
  });
  it('counts whole days exactly', () => {
    expect(calculateDaysWithGrace('2026-05-01T10:00', '2026-05-04T10:00')).toBe(3);
  });
  it('allows under 2 hours late without an extra day', () => {
    expect(calculateDaysWithGrace('2026-05-01T10:00', '2026-05-04T11:59')).toBe(3);
  });
  it('charges an extra day from 2 hours late', () => {
    expect(calculateDaysWithGrace('2026-05-01T10:00', '2026-05-04T12:00')).toBe(4);
  });
});

describe('driver extras', () => {
  it('recognises driver extras in English and Arabic', () => {
    expect(isDriverExtra('Additional driver')).toBe(true);
    expect(isDriverExtra('Second Driver')).toBe(true);
    expect(isDriverExtra('سائق إضافي')).toBe(true);
    expect(isDriverExtra('GPS')).toBe(false);
  });
});

describe('what completes check-out and check-in', () => {
  const none: any = { items: [], currency: 'JOD' };
  const ready = { customerEmail: 'a@b.co', licensePlate: '10-1', pickupKmOut: 1000 } as any;

  it('needs a real email address', () => {
    expect(emailCheck('')).toEqual({ valid: false, hint: 'Email address required' });
    expect(emailCheck('not-an-email')).toEqual({ valid: false, hint: 'Email address not valid' });
    expect(emailCheck(' a@b.co ').valid).toBe(true);
  });

  it('checks the odometer readings', () => {
    expect(kmOutOk({ pickupKmOut: 0 })).toBe(true);
    expect(kmOutOk({})).toBe(false);
    expect(kmInOk({ pickupKmOut: 1000, dropOffKmIn: 1200 })).toBe(true);
    expect(kmInOk({ pickupKmOut: 1000, dropOffKmIn: 900 })).toBe(false);
    expect(kmInOk({ dropOffKmIn: 5 })).toBe(true);
  });

  it('accepts no charges, or complete, signed charges', () => {
    expect(chargesOk(none)).toBe(true);
    const line: any = { id: '1', kind: 'damage', description: 'Scratch', amount: 50 };
    expect(chargesOk({ ...none, items: [line] })).toBe(false);
    expect(chargesOk({ ...none, items: [line], settlement: 'claim', customerSignature: 'sig' })).toBe(true);
    expect(chargesOk({ ...none, items: [line], settlement: 'paid', customerSignature: 'sig' })).toBe(false);
    expect(chargesOk({ ...none, items: [{ ...line, amount: 0 }], settlement: 'claim', customerSignature: 'sig' })).toBe(false);
  });

  it('counts signatures and ticked items', () => {
    expect(signedCount('a', undefined)).toBe(1);
    expect(countChecked(['A', 'B', 'C'], { A: true, C: true, X: true })).toBe(2);
  });

  it('names the first step still missing, in the order the screen checks', () => {
    expect(firstMissingStep('pickup', { ...ready, customerEmail: '' }, true, none)).toBe('customer');
    expect(firstMissingStep('pickup', { ...ready, licensePlate: ' ' }, true, none)).toBe('vehicle');
    expect(firstMissingStep('pickup', { ...ready, pickupKmOut: undefined }, true, none)).toBe('fuel');
    expect(firstMissingStep('pickup', ready, false, none)).toBe('payment');
    expect(firstMissingStep('pickup', ready, true, none)).toBeUndefined();
    expect(firstMissingStep('dropoff', { ...ready, dropOffKmIn: 900 }, true, none)).toBe('fuel');
    expect(firstMissingStep('dropoff', { ...ready, dropOffKmIn: 1100 }, true, { ...none, items: [{ description: '', amount: 1 } as any] })).toBe('charges');
    expect(firstMissingStep('dropoff', { ...ready, dropOffKmIn: 1100 }, true, none)).toBeUndefined();
  });
});
