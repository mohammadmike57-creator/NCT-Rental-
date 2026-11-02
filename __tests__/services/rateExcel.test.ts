import { DEFAULT_BANDS, buildRatePlans, jordanSeasons, matrixOf, bandsOf } from '../../services/rateBuilder';
import { mergeImportedPlans, parseBandHeader, parseRateSheet, parseSheetDate, rateSheetRows } from '../../services/rateExcel';

const plans = () => buildRatePlans({ seasons: jordanSeasons(2027), bands: DEFAULT_BANDS, basePrices: { ECAR: 30, CDAR: 40 }, rounding: 'cents' }, 1);

describe('rates in Excel', () => {
  it('downloads and uploads back the same rates', () => {
    const p = plans();
    const rows = rateSheetRows(p);
    expect(rows[0]).toEqual(['Period', 'From', 'To', 'Car group', '1-2', '3-6', '7-13', '14-29', '30+']);
    expect(rows.length).toBe(1 + p.length * 2);
    const back = parseRateSheet(rows, ['ECAR', 'CDAR'], 7);
    expect(back.errors).toEqual([]);
    expect(back.plans.map(x => [x.name, x.startDate, x.endDate])).toEqual(p.map(x => [x.name, x.startDate, x.endDate]));
    back.plans.forEach((x, i) => expect(matrixOf(x, bandsOf(x))).toEqual(matrixOf(p[i], bandsOf(p[i]))));
  });

  it('reads the column names and dates people type', () => {
    expect(parseBandHeader('1-2')).toEqual({ fromDay: 1, toDay: 2 });
    expect(parseBandHeader('3 – 6 days')).toEqual({ fromDay: 3, toDay: 6 });
    expect(parseBandHeader('30+ days')).toEqual({ fromDay: 30, toDay: null });
    expect(parseBandHeader('Notes')).toBeNull();
    expect(parseSheetDate('2027-06-01')).toBe('2027-06-01');
    expect(parseSheetDate('01/06/2027')).toBe('2027-06-01');
    expect(parseSheetDate(46539)).toBe('2027-06-01');
    expect(parseSheetDate(new Date(2027, 5, 1))).toBe('2027-06-01');
    expect(parseSheetDate('31/02/2027')).toBeNull();
  });

  it('lists every problem with its row instead of loading bad prices', () => {
    const r = parseRateSheet([
      ['Period', 'From', 'To', 'Car group', '1-3', '4+'],
      ['Summer', '2027-06-01', '2027-08-31', 'CDAR', 40, 'abc'],
      ['Summer', '2027-06-01', '2027-08-31', 'CDAR', 40, 35],
      ['Autumn', '2027-08-15', '2027-10-31', 'ECAR', 30, 25],
      ['Winter', 'soon', '2027-12-31', 'ECAR', 30, 25],
    ], ['CDAR', 'ECAR']);
    expect(r.errors.join('\n')).toMatch(/Row 2 .*"abc" in column 4\+ is not a price/);
    expect(r.errors.join('\n')).toMatch(/Row 3: CDAR appears twice/);
    expect(r.errors.join('\n')).toMatch(/Row 5 \(Winter\): From is not a date/);
    expect(r.errors.join('\n')).toMatch(/"Summer" .* and "Autumn" .* overlap/);
  });

  it('refuses columns with gaps and missing columns', () => {
    expect(parseRateSheet([['Period', 'From', 'To', 'Car group', '1-2', '5+'], ['A', '2027-01-01', '2027-01-31', 'ECAR', 1, 1]]).errors[0]).toMatch(/Day 3 is in no band/);
    expect(parseRateSheet([['Season', 'Start', 'Group', '1+'], ['A', '2027-01-01', 'ECAR', 1]]).errors[0]).toMatch(/Missing column: To/);
  });

  it('updates periods by name and keeps or removes the others', () => {
    const current = plans();
    const sheet = rateSheetRows([current[1]]);
    sheet[1][4] = 99;
    const imp = parseRateSheet(sheet).plans;
    const kept = mergeImportedPlans(current, imp, false);
    expect(kept.length).toBe(current.length);
    expect(kept.find(p => p.name === current[1].name)!.id).toBe(current[1].id);
    expect(kept.find(p => p.name === current[1].name)!.sippRates[0].tiers[0].dailyPrice).toBe(99);
    expect(mergeImportedPlans(current, imp, true).map(p => p.name)).toEqual([current[1].name]);
  });
});
