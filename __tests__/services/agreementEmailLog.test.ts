import { withEmailLog, documentsSentMessage } from '../../services/agreementEmailLog';
import { Reservation } from '../../types';

describe('agreement emails', () => {
  const base = { id: 'r1', agreementEmails: [{ to: 'old@x.co', kind: 'checkout', sentAt: 't0' }] } as unknown as Reservation;

  it('adds the email to the agreement log and keeps earlier entries', () => {
    const r = withEmailLog(base, 'a@b.co', 'checkout', 't1');
    expect(r.agreementEmails).toEqual([{ to: 'old@x.co', kind: 'checkout', sentAt: 't0' }, { to: 'a@b.co', kind: 'checkout', sentAt: 't1' }]);
    expect(r.returnCharges).toBeUndefined();
  });

  it('logs it on the return charges too when they were sent at check-in', () => {
    const withCharges = { ...base, returnCharges: { items: [{ id: 'c', kind: 'damage', description: 'Dent', amount: 20 }], currency: 'JOD' } } as unknown as Reservation;
    expect(withEmailLog(withCharges, 'a@b.co', 'checkin', 't2').returnCharges?.emails).toEqual([{ to: 'a@b.co', sentAt: 't2' }]);
    expect(withEmailLog(withCharges, 'a@b.co', 'checkout', 't2').returnCharges?.emails).toBeUndefined();
  });

  it('tells staff what was sent', () => {
    expect(documentsSentMessage(false, 'a@b.co', true, { ok: true })).toBe('The agreement and the receipt were emailed to a@b.co.');
    expect(documentsSentMessage(true, 'a@b.co', true, { ok: false })).toBe('The closed agreement, the termination statement were sent; the receipt could not be sent to a@b.co.');
    expect(documentsSentMessage(false, 'a@b.co', false, { ok: false, reason: 'unconfigured' }, 'Saved.')).toBe('Email is not set up yet (Email Settings), so nothing was sent. Saved.');
  });
});
