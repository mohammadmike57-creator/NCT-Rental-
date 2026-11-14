/**
 * One way to show dates on screen: "Tue, 10 Nov 2026" and "Tue, 10 Nov 10:00".
 * Values are the app's local "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm" strings; anything
 * that can't be read is shown as it is, and an empty value as a dash.
 */
const parse = (value: string) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00` : value);

/** "Tue, 10 Nov 2026" (year left out with withYear = false). */
export const displayDay = (value?: string, withYear = true): string => {
  if (!value) return '—';
  const d = parse(value);
  if (Number.isNaN(d.getTime())) return value;
  const part = (o: Intl.DateTimeFormatOptions) => d.toLocaleDateString('en-GB', o);
  const text = `${part({ weekday: 'short' })}, ${part({ day: '2-digit' })} ${part({ month: 'short' })}`;
  return withYear ? `${text} ${d.getFullYear()}` : text;
};

/** "10:00", or "" when the value has no time. */
export const displayTime = (value?: string): string => (value && value.includes('T') ? value.split('T')[1].slice(0, 5) : '');

/** "Tue, 10 Nov 10:00": the day without the year, then the time when there is one. */
export const displayDayTime = (value?: string): string => {
  const time = displayTime(value);
  return time ? `${displayDay(value, false)} ${time}` : displayDay(value, false);
};
