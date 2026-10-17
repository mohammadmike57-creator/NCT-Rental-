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

/** Every permission in the app, grouped the way the sidebar is organised. */
export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: 'core', title: 'Daily operations', description: 'Screens front-desk staff use every day',
    permissions: [
      p(P.VIEW_HOME_DASHBOARD, 'Home dashboard', "Today's pickups, returns and key numbers"),
      p(P.VIEW_RESERVATIONS, 'Reservations', 'See the reservation list'),
      p(P.VIEW_TODAYS_RESERVATIONS, "Today's reservations", "Today's schedule view"),
      p(P.VIEW_FLEET_AVAILABILITY, 'Fleet availability', 'Calendar of which cars are free'),
      p(P.VIEW_INTERNAL_MESSAGES, 'Internal messages', 'Send and read staff messages'),
      p(P.VIEW_MY_PROFILE, 'My profile', 'View and edit their own profile'),
    ],
  },
  {
    id: 'reservations', title: 'Reservations & agreements', description: 'Creating and changing bookings',
    permissions: [
      p(P.ACTION_RESERVATIONS_ADD, 'Create reservations', 'Add new bookings'),
      p(P.ACTION_RESERVATIONS_EDIT, 'Edit reservations', 'Change booking details and share bookings'),
      p(P.ACTION_RESERVATIONS_DELETE, 'Delete reservations', 'Remove bookings that are not checked out'),
      p(P.ACTION_RESERVATIONS_EXTEND, 'Extend rentals', 'Extend a rental that is on rent'),
      p(P.ACTION_RESERVATIONS_STATUS_CHANGE, 'Change status', 'Confirm, cancel or mark no-show'),
      p(P.ACTION_VOUCHER_MANAGE, 'Check-out & check-in', 'Open rental agreements, inspect cars and take signatures'),
      p(P.ACTION_RESERVATIONS_ASSIGN, 'Assign vehicles', 'Assign a specific car to a booking'),
      p(P.ACTION_RESERVATIONS_UPGRADE_VEHICLE, 'Upgrade vehicles', 'Move a customer to a different car'),
      p(P.ACTION_RESERVATIONS_MANAGE_EXTRAS, 'Manage extras', 'Add or remove extras on a booking'),
      p(P.ACTION_ADMIN_MANAGE_RESERVATIONS, 'Reservation administration', 'Advanced reservation management'),
    ],
  },
  {
    id: 'reports', title: 'Reports', description: 'Performance and revenue reporting',
    permissions: [
      p(P.VIEW_REPORTS_YEARLY_SUMMARY, 'Yearly summary', 'Monthly revenue, commission and franchise fees'),
      p(P.VIEW_REPORTS_SOURCE_PERFORMANCE, 'Source performance', 'Bookings and revenue by channel'),
      p(P.VIEW_REPORTS_INVOICE_GENERATION, 'Invoices', 'Generate invoices'),
    ],
  },
  {
    id: 'finance', title: 'Finance', description: 'Money in and out',
    permissions: [
      p(P.VIEW_FINANCIALS_ACCOUNTING, 'Accounting', 'View the accounting dashboard'),
      p(P.ACTION_FINANCIALS_MANAGE_EXPENSES, 'Manage expenses', 'Add and edit expenses'),
      p(P.ACTION_FINANCIALS_MANAGE_FRANCHISE_PAYMENTS, 'Franchise payments', 'Record and reverse franchise fee payments'),
      p(P.VIEW_FINANCIALS_PAYMENT_APPROVALS, 'View payment approvals', 'See payments waiting for approval'),
      p(P.ACTION_FINANCIALS_MANAGE_PAYMENT_APPROVALS, 'Approve payments', 'Approve or reject payments'),
      p(P.VIEW_FINANCIALS_DEFERRED_PAYMENTS, 'View deferred payments', 'See payments due later'),
      p(P.ACTION_FINANCIALS_MANAGE_DEFERRED_PAYMENTS, 'Manage deferred payments', 'Settle deferred payments'),
      p(P.VIEW_FINANCIALS_LATE_RETURNS, 'View late returns', 'See late-return fees'),
      p(P.ACTION_FINANCIALS_MANAGE_LATE_RETURNS, 'Manage late returns', 'Charge or waive late-return fees'),
    ],
  },
  {
    id: 'incidents', title: 'Incidents', description: 'Traffic tickets and vehicle damage',
    permissions: [
      p(P.VIEW_TRAFFIC_TICKETS, 'View traffic tickets', 'See tickets linked to rentals'),
      p(P.ACTION_TRAFFIC_TICKETS_MANAGE, 'Manage traffic tickets', 'Add, settle and assign tickets'),
      p(P.VIEW_VEHICLE_DAMAGES, 'View vehicle damage', 'See damage reports'),
      p(P.ACTION_VEHICLE_DAMAGES_MANAGE, 'Manage vehicle damage', 'Record and resolve damage'),
    ],
  },
  {
    id: 'channels', title: 'Channel manager', description: 'OTA XML distribution',
    permissions: [
      p(P.VIEW_AGGREGATOR_SETUP, 'Channel manager', 'Open the OTA XML channel manager'),
      p(P.ACTION_ADMIN_MANAGE_RATE_PLANS, 'Rates', 'Edit and publish channel rates'),
      p(P.ACTION_ADMIN_MANAGE_TERMS, 'Terms', 'Edit channel terms & conditions'),
    ],
  },
  {
    id: 'admin', title: 'Administration', description: 'Company settings — give only to trusted staff',
    permissions: [
      p(P.VIEW_ADMIN_PANEL, 'Administration menu', 'Show the Administration section'),
      p(P.ACTION_ADMIN_MANAGE_USERS, 'Staff & permissions', 'Create accounts, reset passwords and change permissions'),
      p(P.ACTION_ADMIN_MANAGE_FLEET, 'Fleet', 'Add and edit vehicles'),
      p(P.ACTION_ADMIN_MANAGE_SOURCES, 'Booking sources', 'Manage website sources'),
      p(P.ACTION_ADMIN_MANAGE_EXTRAS, 'Extras', 'Manage the extras catalogue'),
      p(P.ACTION_ADMIN_MANAGE_LOCATIONS, 'Locations', 'Manage pickup locations'),
      p(P.ACTION_ADMIN_MANAGE_COMPANY_DETAILS, 'Company details', 'Edit company name, address and settings'),
      p(P.ACTION_ADMIN_MANAGE_YEARS, 'Years', 'Manage reporting years'),
      p(P.VIEW_SYSTEM_ACTIVITY_LOG, 'Activity log', 'See who did what'),
      p(P.ACTION_ADMIN_DELETE_ALL_RESERVATIONS, 'Bulk delete', 'Delete a whole month of reservations'),
    ],
  },
];

export const ALL_PERMISSIONS: P[] = PERMISSION_GROUPS.flatMap(g => g.permissions.map(x => x.key));

/** Permissions that can do serious damage; highlighted in the editor. */
export const SENSITIVE_PERMISSIONS = new Set<P>([
  P.ACTION_ADMIN_MANAGE_USERS,
  P.ACTION_ADMIN_DELETE_ALL_RESERVATIONS,
  P.ACTION_RESERVATIONS_DELETE,
  P.ACTION_FINANCIALS_MANAGE_FRANCHISE_PAYMENTS,
  P.ACTION_FINANCIALS_MANAGE_PAYMENT_APPROVALS,
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

const OPS: P[] = [P.VIEW_HOME_DASHBOARD, P.VIEW_RESERVATIONS, P.VIEW_TODAYS_RESERVATIONS, P.VIEW_FLEET_AVAILABILITY, P.VIEW_INTERNAL_MESSAGES, P.VIEW_MY_PROFILE];

export const ROLE_TEMPLATES: RoleTemplate[] = [
  {
    id: 'admin', name: 'Administrator', color: 'bg-rose-600',
    description: 'Full access, including staff accounts and company settings',
    permissions: [...ALL_PERMISSIONS],
  },
  {
    id: 'manager', name: 'Branch manager', color: 'bg-indigo-600',
    description: 'Runs the branch: bookings, agreements, reports, finance and incidents',
    permissions: ALL_PERMISSIONS.filter(k => ![P.ACTION_ADMIN_MANAGE_USERS, P.ACTION_ADMIN_DELETE_ALL_RESERVATIONS, P.ACTION_ADMIN_MANAGE_COMPANY_DETAILS, P.ACTION_ADMIN_MANAGE_YEARS].includes(k)),
  },
  {
    id: 'agent', name: 'Reservations agent', color: 'bg-sky-600',
    description: 'Takes bookings and handles check-out and check-in',
    permissions: [...OPS, P.ACTION_RESERVATIONS_ADD, P.ACTION_RESERVATIONS_EDIT, P.ACTION_RESERVATIONS_EXTEND, P.ACTION_VOUCHER_MANAGE, P.ACTION_RESERVATIONS_MANAGE_EXTRAS, P.VIEW_TRAFFIC_TICKETS, P.VIEW_VEHICLE_DAMAGES],
  },
  {
    id: 'accountant', name: 'Accountant', color: 'bg-emerald-600',
    description: 'Reports, accounting, payments and franchise fees',
    permissions: [P.VIEW_HOME_DASHBOARD, P.VIEW_RESERVATIONS, P.VIEW_INTERNAL_MESSAGES, P.VIEW_MY_PROFILE,
      ...PERMISSION_GROUPS.find(g => g.id === 'reports')!.permissions.map(x => x.key),
      ...PERMISSION_GROUPS.find(g => g.id === 'finance')!.permissions.map(x => x.key),
      P.VIEW_TRAFFIC_TICKETS],
  },
  {
    id: 'fleet', name: 'Fleet & incidents', color: 'bg-amber-600',
    description: 'Vehicles, damage and traffic tickets',
    permissions: [...OPS, P.VIEW_TRAFFIC_TICKETS, P.ACTION_TRAFFIC_TICKETS_MANAGE, P.VIEW_VEHICLE_DAMAGES, P.ACTION_VEHICLE_DAMAGES_MANAGE, P.VIEW_ADMIN_PANEL, P.ACTION_ADMIN_MANAGE_FLEET, P.ACTION_RESERVATIONS_ASSIGN],
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
