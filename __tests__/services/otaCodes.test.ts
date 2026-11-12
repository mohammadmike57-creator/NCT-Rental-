import { coverageTypeFor, isOtaCode } from '../../services/otaCodes';

describe('OpenTravel codes for covers', () => {
  it('knows the official codes of the common covers', () => {
    expect(coverageTypeFor('cdw')).toBe('7');
    expect(coverageTypeFor('PAI')).toBe('32');
  });
  it("uses the broker's own code first, and only a valid one", () => {
    expect(coverageTypeFor('SCDW', { SCDW: '38' })).toBe('38');
    expect(coverageTypeFor('CDW', { CDW: '7' })).toBe('7');
    expect(coverageTypeFor('SCDW', { SCDW: 'super' })).toBeNull();
  });
  it('has no code for a cover the broker has not mapped', () => {
    expect(coverageTypeFor('SCDW')).toBeNull();
  });
  it('checks the OpenTravel code format', () => {
    expect(['7', '101', '101.EQP', '101.EQP.X'].every(isOtaCode)).toBe(true);
    expect(['SCDW', '', '7a', '1234'].some(isOtaCode)).toBe(false);
  });
});
