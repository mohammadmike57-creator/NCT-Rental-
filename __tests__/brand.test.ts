import { brandColor, documentLogo, initialsOf, isPrimarySupplier, setBrand } from '../services/brand';
import { URDRIVE_LOGO_B64 } from '../constants';
import { CompanyDetails } from '../types';

const company = (extra: Partial<CompanyDetails> = {}): CompanyDetails =>
  ({ name: 'Desert Drive Rentals', subName: '', address: '', phone: '', email: '', taxNumber: '', ...extra });

describe('supplier branding on documents', () => {
  it('UR-Drive Jordan keeps its own logo', () => {
    setBrand('urd', company({ name: 'UR-Drive Jordan' }));
    expect(isPrimarySupplier()).toBe(true);
    expect(documentLogo()).toBe(URDRIVE_LOGO_B64);
  });

  it("another supplier never prints UR-Drive's logo: its own, or its name", () => {
    setBrand('ddr', company());
    expect(isPrimarySupplier()).toBe(false);
    expect(documentLogo()).toBeUndefined();
    setBrand('ddr', company({ logoUrl: 'data:image/png;base64,AAAA' }));
    expect(documentLogo()).toBe('data:image/png;base64,AAAA');
    expect(documentLogo()).not.toBe(URDRIVE_LOGO_B64);
  });

  it('a support view is never treated as UR-Drive Jordan', () => {
    setBrand('support-view', company());
    expect(documentLogo()).toBeUndefined();
  });

  it('uses a valid brand colour only, and makes initials', () => {
    expect(brandColor(company({ brandColor: '#0f766e' }))).toBe('#0f766e');
    expect(brandColor(company({ brandColor: 'red; background:url(x)' }))).toBe('#4f46e5');
    expect(initialsOf('Desert Drive Rentals')).toBe('DD');
  });
});
