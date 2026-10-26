import * as XLSX from 'xlsx';
import { parseDate, parseTime, matchSource, matchCar, readTables, detectColumns, detectDateOrder, prepareRows, parseAmount } from '../../services/smartImport';

const sources = [
  { id: 's1', name: 'Website', paymentType: 'Pay on Arrival' },
  { id: 's2', name: 'Booking.com', paymentType: 'Prepaid' },
  { id: 's3', name: 'Discover Cars', paymentType: 'Prepaid' },
  { id: 's4', name: 'Walk-in', paymentType: 'Pay on Arrival' },
] as any;
const fleet = [
  { id: 'v1', modelName: 'Kia Pegas', licensePlate: '1', category: 'Economy', sippCode: 'EDMR' },
  { id: 'v2', modelName: 'Nissan Sunny', licensePlate: '2', category: 'Compact' },
  { id: 'v3', modelName: 'Hyundai Elantra', licensePlate: '3', category: 'Intermediate' },
] as any;

describe('dates are read day / month / year', () => {
  it.each([
    ['15/10/2026', '2026-10-15'], ['5/3/2026', '2026-03-05'], ['05-03-26', '2026-03-05'], ['15.10.2026', '2026-10-15'],
    ['15 Oct 2026', '2026-10-15'], ['15-Oct-26', '2026-10-15'], ['October 15, 2026', '2026-10-15'], ['Thu 15th Oct 2026', '2026-10-15'],
    ['2026-10-15', '2026-10-15'], ['2026/10/05', '2026-10-05'],
  ])('%s', (v, d) => expect(parseDate(v)?.date).toBe(d));
  it('reads the time with the date', () => {
    expect(parseDate('15/10/2026 14:30')).toEqual({ date: '2026-10-15', time: '14:30' });
    expect(parseDate('15/10/2026 2:30 PM')).toEqual({ date: '2026-10-15', time: '14:30' });
    expect(parseDate('2026-10-15T09:05')).toEqual({ date: '2026-10-15', time: '09:05' });
  });
  it('reads Excel dates exactly (no time-zone shift)', () => {
    expect(parseDate(46310)).toEqual({ date: '2026-10-15', time: undefined });
    expect(parseDate(46310.5)).toEqual({ date: '2026-10-15', time: '12:00' });
  });
  it('switches only for dates that cannot be day-first', () => {
    expect(parseDate('10/25/2026')?.date).toBe('2026-10-25');
    expect(parseDate('03/05/2026', 'MDY')?.date).toBe('2026-03-05');
    expect(parseDate('32/10/2026')).toBeNull();
    expect(parseDate('hello')).toBeNull();
  });
  it('reads times', () => {
    expect(parseTime('9am')).toBe('09:00');
    expect(parseTime('21.15')).toBe('21:15');
    expect(parseTime(0.75)).toBe('18:00');
  });
});

describe('sources match the ones already set up', () => {
  it.each([
    ['website', 'Website'], ['WEBSITE ', 'Website'], ['Web', 'Website'], ['www.nctrental.com', 'Website'], ['Online', 'Website'],
    ['booking.com', 'Booking.com'], ['Booking', 'Booking.com'], ['DiscoverCars', 'Discover Cars'], ['discover cars ltd', 'Discover Cars'], ['walk in', 'Walk-in'],
  ])('%s → %s', (raw, name) => expect(matchSource(raw, sources).match).toBe(name));
  it('suggests a clean name for a new source', () => {
    expect(matchSource('EXPEDIA', sources)).toEqual({ raw: 'EXPEDIA', suggested: 'Expedia' });
  });
});

describe('cars match the fleet or known models', () => {
  it.each([
    ['Pegas', 'Kia Pegas'], ['KIA PEGAS or similar', 'Kia Pegas'], ['sunny', 'Nissan Sunny'], ['Nissan Sunny / similar', 'Nissan Sunny'],
    ['Elantra', 'Hyundai Elantra'], ['Economy - Kia Pegas (Manual)', 'Kia Pegas'], ['EDMR', 'Kia Pegas'],
    ['Accent', 'Hyundai Accent'], ['Toyota Corolla', 'Toyota Corolla'], ['Picanto', 'Kia Picanto'],
  ])('%s → %s', (raw, model) => expect(matchCar(raw, fleet).match).toBe(model));
  it('leaves unknown names as written', () => expect(matchCar('Economy', fleet).match).toBeUndefined());
  it('needs the brand for short names', () => expect(matchCar('GT', fleet).match).toBeUndefined());
});

describe('reading a sheet', () => {
  const book = (aoa: unknown[][]) => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Bookings');
    return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  };
  it('finds the header under a title and reads every field', () => {
    const t = readTables(book([
      ['October bookings'], [],
      ['Res #', 'Driver Name', 'Pick-up', 'Pick-up Time', 'Return', 'Car Group', 'Broker', 'Total (JOD)'],
      ['A100', 'John Doe', '05/11/2026', '10:30', '09/11/2026', 'Pegas', 'website', '120.5'],
      ['A101', 'Jane Roe', '25/10/2026', '', '28/10/2026', 'sunny', 'Booking.com', 99],
      ['', '', '', '', '', '', 'Total', 219.5],
    ]))[0];
    const map = detectColumns(t);
    expect(map).toMatchObject({ bookingId: 0, customer: 1, pickupDate: 2, pickupTime: 3, dropoffDate: 4, vehicle: 5, source: 6, amount: 7 });
    expect(detectDateOrder(t, map)).toBe('DMY');
    const rows = prepareRows(t, map, 'DMY');
    expect(rows[0]).toMatchObject({ bookingId: 'A100', customer: 'John Doe', pickup: '2026-11-05T10:30', dropoff: '2026-11-09T12:00', carRaw: 'Pegas', sourceRaw: 'website', amount: 120.5, problems: [] });
    expect(rows[1]).toMatchObject({ pickup: '2026-10-25T12:00', dropoff: '2026-10-28T12:00' });
  });
  it('detects month-first files', () => {
    const t = readTables(book([['Booking ID', 'Name', 'Start Date', 'End Date'], ['1', 'A', '10/25/2026', '10/28/2026'], ['2', 'B', '11/02/2026', '11/05/2026']]))[0];
    const map = detectColumns(t);
    expect(detectDateOrder(t, map)).toBe('MDY');
    expect(prepareRows(t, map, 'MDY')[1].pickup).toBe('2026-11-02T12:00');
  });
  it('handles rentals into 2027, missing years and a wrong return year', () => {
    const t = readTables(book([
      ['Booking ID', 'Name', 'Pickup Date', 'Return Date'],
      ['Y1', 'A', '28/12/2026', '04/01/2027'],   // runs into 2027
      ['Y2', 'B', '15/01/2027', '20/01/2027'],   // all in 2027
      ['Y3', 'C', '30/12/2026', '03/01/2026'],   // return typed with the old year
      ['Y4', 'D', '27/12', '2/1'],               // no years at all
      ['Y5', 'E', 46387, 46392],                 // Excel dates: 31 Dec 2026 → 5 Jan 2027
      ['Y6', 'F', '10/12/2026', '10/06/2027'],   // long rental, kept with a note
      ['Y7', 'G', '10/01/2027', '05/01/2027'],   // really wrong: return before pick-up
    ]))[0];
    const rows = prepareRows(t, detectColumns(t), 'DMY', new Date(2026, 9, 26));
    const by = (id: string) => rows.find(r => r.bookingId === id)!;
    expect(by('Y1')).toMatchObject({ pickup: '2026-12-28T12:00', dropoff: '2027-01-04T12:00', problems: [], fixes: [] });
    expect(by('Y2')).toMatchObject({ pickup: '2027-01-15T12:00', dropoff: '2027-01-20T12:00', problems: [] });
    expect(by('Y3').dropoff).toBe('2027-01-03T12:00');
    expect(by('Y3').fixes[0]).toMatch(/corrected to 2027/);
    expect(by('Y4')).toMatchObject({ pickup: '2026-12-27T12:00', dropoff: '2027-01-02T12:00', problems: [] });
    expect(by('Y5')).toMatchObject({ pickup: '2026-12-31T12:00', dropoff: '2027-01-05T12:00' });
    expect(by('Y6').problems).toEqual([]);
    expect(by('Y6').fixes[0]).toMatch(/Long rental: 182 days/);
    expect(by('Y7').problems).toContain('Drop-off is before pick-up');
  });
  it('fills a missing year with the next time that day comes round', () => {
    const t = readTables(book([['Ref', 'Customer', 'From', 'To'], ['N1', 'A', '5 Jan', '9 Jan']]))[0];
    expect(prepareRows(t, detectColumns(t), 'DMY', new Date(2026, 9, 26))[0]).toMatchObject({ pickup: '2027-01-05T12:00', dropoff: '2027-01-09T12:00' });
  });
  it('never takes times or amounts for dates', () => {
    expect(parseDate('10.30')).toBeNull();
    expect(parseDate(1.5)).toBeNull();
  });
  it('reads amounts in any format', () => {
    expect(parseAmount('JOD 1,234.50')).toBe(1234.5);
    expect(parseAmount('1.234,50 €')).toBe(1234.5);
    expect(parseAmount('')).toBe(0);
  });
});
