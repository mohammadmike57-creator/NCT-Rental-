import { CompanyDetails } from '../types';
import { CustomerEmailPayload, sendCustomerEmail } from '../firebase/api';

/** Where customers get help: the support contacts from Company Details, else the main company contacts. */
export function supportOf(c: CompanyDetails) {
  return {
    email: (c.supportEmail || '').trim() || (c.email || '').trim(),
    phone: (c.supportPhone || '').trim() || (c.phone || '').trim(),
    hours: (c.supportHours || '').trim(),
  };
}

/** "+962 6 555 0101 or support@company.com", for use inside a sentence. */
export function supportLine(c: CompanyDetails): string {
  const s = supportOf(c);
  return s.phone && s.email ? `${s.phone} or ${s.email}` : s.phone || s.email || 'our customer support team';
}

/** Company and support details every branded email carries (header, support box and footer). */
export function brandFields(c: CompanyDetails): Pick<CustomerEmailPayload, 'companyName' | 'companyAddress' | 'companyPhone' | 'companyEmail' | 'companyWebsite' | 'supportEmail' | 'supportPhone' | 'supportHours'> {
  const s = supportOf(c);
  return {
    companyName: c.name,
    companyAddress: c.address,
    companyPhone: c.phone,
    companyEmail: c.email,
    companyWebsite: c.website,
    supportEmail: s.email,
    supportPhone: s.phone,
    supportHours: s.hours,
  };
}

/** Plain-text sign-off with the support contacts, for emails opened in the staff member's own mail app. */
export function textSignature(c: CompanyDetails): string {
  const s = supportOf(c);
  return [
    '\n\nKind regards,',
    '',
    `Customer Service Team`,
    c.name,
    ...(c.address ? [c.address] : []),
    '',
    'Customer support',
    ...(s.phone ? [`Tel: ${s.phone}`] : []),
    ...(s.email ? [`Email: ${s.email}`] : []),
    ...(s.hours ? [`Hours: ${s.hours}`] : []),
    ...(c.website ? [c.website] : []),
  ].join('\n');
}

/** The same email as plain text, for the staff member's own mail app. */
export function plainTextOf(p: Pick<CustomerEmailPayload, 'intro' | 'rows' | 'closing'>, c: CompanyDetails): string {
  const rows = (p.rows || []).map(([k, v]) => `- ${k}: ${v}`).join('\n');
  return `${p.intro}${rows ? `\n\nSummary\n${rows}` : ''}${p.closing ? `\n\n${p.closing}` : ''}${textSignature(c)}`;
}

/**
 * Sends the branded email through the system. When outgoing email is not set up yet, opens the
 * same email in the staff member's mail app instead. Reports the result to the user.
 */
export async function deliverCustomerEmail(payload: CustomerEmailPayload, c: CompanyDetails): Promise<void> {
  const outcome = await sendCustomerEmail(payload);
  if (outcome.ok) { window.alert(`Email sent to ${payload.to}.`); return; }
  if (outcome.reason === 'unconfigured') {
    window.location.href = `mailto:${payload.to}?subject=${encodeURIComponent(payload.subject)}&body=${encodeURIComponent(plainTextOf(payload, c))}`;
    return;
  }
  window.alert(outcome.message || 'The email could not be sent.');
}
