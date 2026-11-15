import { displayDay, displayDayTime, displayStamp, displayTime } from '../services/displayDate';

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

describe('displayStamp', () => {
  it('shows a moment with weekday, date and 24-hour time', () => {
    expect(displayStamp(new Date(2026, 10, 15, 4, 34, 54))).toBe('Sun, 15 Nov 2026, 04:34');
    expect(displayStamp(new Date(2026, 10, 15, 16, 5, 9), true)).toBe('Sun, 15 Nov 2026, 16:05:09');
    expect(displayStamp(undefined)).toBe('—');
    expect(displayStamp('garbage')).toBe('garbage');
  });
});
