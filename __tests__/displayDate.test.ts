import { displayDay, displayDayTime, displayTime } from '../services/displayDate';

describe('displayDate', () => {
  it('shows a date with weekday and year', () => {
    expect(displayDay('2026-11-10')).toBe('Tue, 10 Nov 2026');
    expect(displayDay('2026-11-10T10:00', false)).toBe('Tue, 10 Nov');
  });
  it('shows day and time together', () => {
    expect(displayDayTime('2026-11-10T10:00')).toBe('Tue, 10 Nov 10:00');
    expect(displayDayTime('2026-11-10')).toBe('Tue, 10 Nov');
    expect(displayTime('2026-11-10T09:30')).toBe('09:30');
  });
  it('keeps unreadable values and dashes empty ones', () => {
    expect(displayDay('')).toBe('—');
    expect(displayDay(undefined)).toBe('—');
    expect(displayDay('next week')).toBe('next week');
  });
});
