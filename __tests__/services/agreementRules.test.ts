import { calculateDaysWithGrace, isDriverExtra } from '../../components/voucher/agreementRules';

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
