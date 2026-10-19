import { UserPermission as P } from '../types';

export interface PermissionInfo {
  key: P;
  label: string;
  description: string;
}

export interface PermissionGroup {
  id: string;
  title: string;
  description: string;
  permissions: PermissionInfo[];
}

const p = (key: P, label: string, description: string): PermissionInfo => ({ key, label, description });

/** One sidebar screen: the permission that opens it, plus what the user may do inside it. */
export interface PermissionSection {
  id: string;
  /** Name as it appears in the sidebar. */
  name: string;
  description: string;
  access: PermissionInfo;
  actions: PermissionInfo[];
}

export interface PermissionArea {
  id: string;
  title: string;
  description: string;
  sections: PermissionSection[];
}

const sec = (id: string, name: string, description: string, access: P, actions: PermissionInfo[] = []): PermissionSection =>
  ({ id, name, description, access: p(access, `Open ${name}`, description), actions });

/** Every screen in the app, grouped exactly as the sidebar is. */
export const PERMISSION_AREAS: PermissionArea[] = [
  {
    id: 'core', title: 'Core operations', description: 'Front-desk screens used every day',
    sections: [
      sec('home', 'Home', "Today's pickups, returns and what needs attention", P.VIEW_HOME_DASHBOARD),
      sec('reservations', 'Reservations', 'The reservation list and booking records', P.VIEW_RESERVATIONS, [
        p(P.ACTION_RESERVATIONS_ADD, 'Create', 'Add new bookings'),
        p(P.ACTION_RESERVATIONS_EDIT, 'Edit', 'Change booking details'),
        p(P.ACTION_RESERVATIONS_STATUS_CHANGE, 'Change status', 'Confirm, cancel or mark no-show'),
        p(P.ACTION_RESERVATIONS_EXTEND, 'Extend', 'Extend a rental that is on rent'),
        p(P.ACTION_RESERVATIONS_ASSIGN, 'Assign vehicle', 'Assign a specific car to a booking'),
        p(P.ACTION_RESERVATIONS_UPGRADE_VEHICLE, 'Upgrade vehicle', 'Move a customer to a different car'),
        p(P.ACTION_RESERVATIONS_MANAGE_EXTRAS, 'Extras', 'Add or remove extras on a booking'),
        p(P.ACTION_RESERVATIONS_DELETE, 'Delete', 'Remove bookings that are not checked out'),
        p(P.ACTION_ADMIN_MANAGE_RESERVATIONS, 'Advanced', 'Reservation administration and customer emails'),
      ]),
      sec('agreement', 'Agreement', 'Rental agreements for check-out and check-in', P.VIEW_AGREEMENTS, [
        p(P.ACTION_VOUCHER_MANAGE, 'Check-out & check-in', 'Inspect cars, record damage and take signatures'),
        p(P.ACTION_AGREEMENT_WITHOUT_RESERVATION, 'Without reservation', 'Open an agreement before the booking is listed'),
      ]),
      sec('unlisted', 'Unlisted Agreements', 'Agreements opened before their booking was in the system', P.VIEW_UNLISTED_AGREEMENTS, [
        p(P.ACTION_UNLISTED_AGREEMENTS_LIST, 'List & link', 'Create or link the reservation, or reject the agreement'),
      ]),
      sec('today', "Today's Reservations", "Today's schedule", P.VIEW_TODAYS_RESERVATIONS),
      sec('messages', 'Internal Messages', 'Send and read staff messages', P.VIEW_INTERNAL_MESSAGES),
      sec('fleet-availability', 'Fleet Availability', 'Which cars are free and the planning board', P.VIEW_FLEET_AVAILABILITY),
    ],
  },
  {
    id: 'reports', title: 'Reports', description: 'Performance and partner billing',
    sections: [
      sec('yearly', 'Yearly Summary', 'Monthly revenue, commission and franchise fees', P.VIEW_REPORTS_YEARLY_SUMMARY),
      sec('sources', 'Source Performance', 'Bookings and revenue by channel', P.VIEW_REPORTS_SOURCE_PERFORMANCE),
      sec('invoices', 'Invoice Generation', 'Bill booking partners', P.VIEW_REPORTS_INVOICE_GENERATION),
    ],
  },
  {
    id: 'finance', title: 'Financials & incidents', description: 'Money in and out, tickets and damage',
    sections: [
      sec('accounting', 'Accounting', 'Income, expenses and profit', P.VIEW_FINANCIALS_ACCOUNTING, [
        p(P.ACTION_FINANCIALS_MANAGE_EXPENSES, 'Expenses', 'Add and edit expenses'),
        p(P.ACTION_FINANCIALS_MANAGE_FRANCHISE_PAYMENTS, 'Franchise payments', 'Record and reverse franchise fee payments'),
      ]),
      sec('approvals', 'Payment Approvals', 'Payments waiting for approval', P.VIEW_FINANCIALS_PAYMENT_APPROVALS, [
        p(P.ACTION_FINANCIALS_MANAGE_PAYMENT_APPROVALS, 'Approve / reject', 'Decide on pending payments'),
      ]),
      sec('deferred', 'Deferred Payments', 'Payments due later', P.VIEW_FINANCIALS_DEFERRED_PAYMENTS, [
        p(P.ACTION_FINANCIALS_MANAGE_DEFERRED_PAYMENTS, 'Collect', 'Settle deferred payments'),
      ]),
      sec('late', 'Late Returns', 'Late-return fees', P.VIEW_FINANCIALS_LATE_RETURNS, [
        p(P.ACTION_FINANCIALS_MANAGE_LATE_RETURNS, 'Charge / waive', 'Charge or waive late-return fees'),
      ]),
      sec('tickets', 'Traffic Tickets', 'Fines linked to rentals', P.VIEW_TRAFFIC_TICKETS, [
        p(P.ACTION_TRAFFIC_TICKETS_MANAGE, 'Manage', 'Add, settle and assign tickets'),
      ]),
      sec('damages', 'Vehicle Damages', 'Damage reports', P.VIEW_VEHICLE_DAMAGES, [
        p(P.ACTION_VEHICLE_DAMAGES_MANAGE, 'Manage', 'Record and resolve damage'),
      ]),
    ],
  },
  {
    id: 'data', title: 'Data management', description: 'Bringing bookings into the system',
    sections: [
      sec('import', 'Import Reservations', 'Upload partner and website booking files', P.VIEW_IMPORT_RESERVATIONS),
    ],
  },
  {
    id: 'ota', title: 'OTA XML', description: 'Channel manager and online distribution',
    sections: [
      sec('ota', 'OTA XML', 'Channels, inventory and stop sales', P.VIEW_AGGREGATOR_SETUP, [
        p(P.ACTION_ADMIN_MANAGE_RATE_PLANS, 'Rates', 'Edit and publish channel rates'),
        p(P.ACTION_ADMIN_MANAGE_TERMS, 'Terms', 'Edit channel terms & conditions'),
      ]),
    ],
  },
  {
    id: 'admin', title: 'Administration', description: 'Company settings — give only to trusted staff',
    sections: [
      sec('users', 'User & Staff Management', 'Accounts, passwords and permissions', P.ACTION_ADMIN_MANAGE_USERS),
      sec('fleet', 'Fleet Management', 'Add and edit vehicles', P.ACTION_ADMIN_MANAGE_FLEET),
      sec('web-sources', 'Website Sources', 'Booking sources and commissions', P.ACTION_ADMIN_MANAGE_SOURCES),
      sec('extras', 'Manage Extras', 'The extras catalogue and prices', P.ACTION_ADMIN_MANAGE_EXTRAS),
      sec('locations', 'Manage Locations', 'Branches and pickup points', P.ACTION_ADMIN_MANAGE_LOCATIONS),
      sec('company', 'Company Details', 'Company profile, agreement terms and settings', P.ACTION_ADMIN_MANAGE_COMPANY_DETAILS, [
        p(P.ACTION_ADMIN_DELETE_ALL_RESERVATIONS, 'Bulk delete', 'Delete a whole month of reservations'),
      ]),
      sec('email', 'Email Settings', 'Outgoing mail server for agreements and invoices', P.ACTION_ADMIN_MANAGE_EMAIL_SETTINGS),
      sec('years', 'Manage Years', 'Reporting years', P.ACTION_ADMIN_MANAGE_YEARS),
      sec('activity', 'Activity Log', 'Who did what, and when', P.VIEW_SYSTEM_ACTIVITY_LOG),
    ],
  },
  {
    id: 'account', title: 'Account', description: 'The staff member\'s own account',
    sections: [
      sec('profile', 'My Profile', 'View and edit their own profile and password', P.VIEW_MY_PROFILE),
    ],
  },
];

/** Flat groups (one per sidebar area) for search and labels. */
export const PERMISSION_GROUPS: PermissionGroup[] = PERMISSION_AREAS.map(a => ({
  id: a.id, title: a.title, description: a.description,
  permissions: a.sections.flatMap(s => [s.access, ...s.actions.map(x => ({ ...x, label: `${s.name}: ${x.label}` }))]),
}));

export const ALL_PERMISSIONS: P[] = PERMISSION_GROUPS.flatMap(g => g.permissions.map(x => x.key));

/** Permissions that can do serious damage; highlighted in the editor. */
export const SENSITIVE_PERMISSIONS = new Set<P>([
  P.ACTION_ADMIN_MANAGE_USERS,
  P.ACTION_ADMIN_DELETE_ALL_RESERVATIONS,
  P.ACTION_RESERVATIONS_DELETE,
  P.ACTION_FINANCIALS_MANAGE_FRANCHISE_PAYMENTS,
  P.ACTION_FINANCIALS_MANAGE_PAYMENT_APPROVALS,
  P.ACTION_ADMIN_MANAGE_COMPANY_DETAILS,
  P.ACTION_ADMIN_MANAGE_EMAIL_SETTINGS,
]);

export const permissionLabel = (key: string) =>
  PERMISSION_GROUPS.flatMap(g => g.permissions).find(x => x.key === key)?.label || key.replace(/_/g, ' ').toLowerCase();

export interface RoleTemplate {
  id: string;
  name: string;
  description: string;
  color: string;
  permissions: P[];
}

const OPS: P[] = [P.VIEW_HOME_DASHBOARD, P.VIEW_RESERVATIONS, P.VIEW_AGREEMENTS, P.VIEW_UNLISTED_AGREEMENTS, P.VIEW_TODAYS_RESERVATIONS, P.VIEW_FLEET_AVAILABILITY, P.VIEW_INTERNAL_MESSAGES, P.VIEW_MY_PROFILE];

export const ROLE_TEMPLATES: RoleTemplate[] = [
  {
    id: 'admin', name: 'Administrator', color: 'bg-rose-600',
    description: 'Full access, including staff accounts and company settings',
    permissions: [...ALL_PERMISSIONS],
  },
  {
    id: 'manager', name: 'Branch manager', color: 'bg-indigo-600',
    description: 'Runs the branch: bookings, agreements, reports, finance and incidents',
    permissions: ALL_PERMISSIONS.filter(k => ![P.ACTION_ADMIN_MANAGE_USERS, P.ACTION_ADMIN_DELETE_ALL_RESERVATIONS, P.ACTION_ADMIN_MANAGE_COMPANY_DETAILS, P.ACTION_ADMIN_MANAGE_EMAIL_SETTINGS, P.ACTION_ADMIN_MANAGE_YEARS].includes(k)),
  },
  {
    id: 'agent', name: 'Reservations agent', color: 'bg-sky-600',
    description: 'Takes bookings and handles check-out and check-in',
    permissions: [...OPS, P.ACTION_RESERVATIONS_ADD, P.ACTION_RESERVATIONS_EDIT, P.ACTION_RESERVATIONS_EXTEND, P.ACTION_VOUCHER_MANAGE, P.ACTION_AGREEMENT_WITHOUT_RESERVATION, P.ACTION_UNLISTED_AGREEMENTS_LIST, P.ACTION_RESERVATIONS_MANAGE_EXTRAS, P.VIEW_TRAFFIC_TICKETS, P.VIEW_VEHICLE_DAMAGES],
  },
  {
    id: 'accountant', name: 'Accountant', color: 'bg-emerald-600',
    description: 'Reports, accounting, payments and franchise fees',
    permissions: [P.VIEW_HOME_DASHBOARD, P.VIEW_RESERVATIONS, P.VIEW_INTERNAL_MESSAGES, P.VIEW_MY_PROFILE,
      ...PERMISSION_GROUPS.find(g => g.id === 'reports')!.permissions.map(x => x.key),
      ...PERMISSION_AREAS.find(a => a.id === 'finance')!.sections.filter(x => x.id !== 'tickets' && x.id !== 'damages').flatMap(x => [x.access.key, ...x.actions.map(y => y.key)]),
      P.VIEW_TRAFFIC_TICKETS],
  },
  {
    id: 'fleet', name: 'Fleet & incidents', color: 'bg-amber-600',
    description: 'Vehicles, damage and traffic tickets',
    permissions: [...OPS, P.VIEW_TRAFFIC_TICKETS, P.ACTION_TRAFFIC_TICKETS_MANAGE, P.VIEW_VEHICLE_DAMAGES, P.ACTION_VEHICLE_DAMAGES_MANAGE, P.ACTION_ADMIN_MANAGE_FLEET, P.ACTION_RESERVATIONS_ASSIGN],
  },
  {
    id: 'viewer', name: 'View only', color: 'bg-slate-500',
    description: 'Can look but not change anything',
    permissions: [...OPS, P.VIEW_REPORTS_YEARLY_SUMMARY],
  },
];

/** The role whose permissions match exactly, if any. */
export const matchRole = (perms: string[]): RoleTemplate | undefined => {
  // Only compare permissions the catalogue knows about (older accounts may carry retired names).
  const known = new Set<string>(ALL_PERMISSIONS);
  const set = new Set(perms.filter(k => known.has(k)));
  return ROLE_TEMPLATES.find(r => r.permissions.length === set.size && r.permissions.every(k => set.has(k)));
};

/** Password generator for new accounts / resets: letters and digits, no look-alikes. */
export const generatePassword = (length = 12): string => {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const all = letters + digits;
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, b => all[b % all.length]);
  chars[0] = letters[bytes[0] % letters.length];
  chars[length - 1] = digits[bytes[length - 1] % digits.length];
  return chars.join('');
};

export const passwordProblems = (pw: string): string[] => {
  const out: string[] = [];
  if (pw.length < 8) out.push('At least 8 characters');
  if (!/[A-Za-z]/.test(pw)) out.push('A letter');
  if (!/\d/.test(pw)) out.push('A number');
  return out;
};

/** Permissions added when every sidebar screen got its own permission. */
const SECTION_PERMISSIONS: P[] = [
  P.VIEW_AGREEMENTS, P.ACTION_AGREEMENT_WITHOUT_RESERVATION, P.VIEW_UNLISTED_AGREEMENTS,
  P.ACTION_UNLISTED_AGREEMENTS_LIST, P.VIEW_IMPORT_RESERVATIONS, P.ACTION_ADMIN_MANAGE_EMAIL_SETTINGS,
];

/**
 * The permissions an account effectively has. Accounts saved before the per-section permissions
 * existed carry none of them; they keep exactly what they could do before (everyone could open
 * agreements, with or without a listed reservation, and so on). This does not depend on the
 * server's one-time permission update having run. Once an account is saved from the staff
 * editor it carries the new permissions explicitly and is used as is.
 */
export const effectivePermissions = (perms: string[] = []): P[] => {
  const set = new Set(perms as P[]);
  if (SECTION_PERMISSIONS.some(k => set.has(k))) return Array.from(set);
  set.add(P.VIEW_AGREEMENTS);
  set.add(P.ACTION_AGREEMENT_WITHOUT_RESERVATION);
  if (set.has(P.VIEW_RESERVATIONS)) set.add(P.VIEW_UNLISTED_AGREEMENTS);
  if (set.has(P.ACTION_RESERVATIONS_EDIT)) set.add(P.ACTION_UNLISTED_AGREEMENTS_LIST);
  if (set.has(P.VIEW_ADMIN_PANEL)) set.add(P.VIEW_IMPORT_RESERVATIONS);
  if (set.has(P.ACTION_ADMIN_MANAGE_COMPANY_DETAILS)) set.add(P.ACTION_ADMIN_MANAGE_EMAIL_SETTINGS);
  if (set.has(P.ACTION_ADMIN_MANAGE_USERS)) SECTION_PERMISSIONS.forEach(k => set.add(k));
  return Array.from(set);
};
