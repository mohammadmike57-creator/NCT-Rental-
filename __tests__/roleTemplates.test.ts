import { ALL_PERMISSIONS, ROLE_TEMPLATES, rolesFor, matchRole } from '../services/permissionCatalog';
import { UserPermission as P } from '../types';

describe('ready-made supplier roles', () => {
  it('offers the ten supplier roles for the full system', () => {
    expect(rolesFor(ALL_PERMISSIONS).map(r => r.name)).toEqual([
      'Owner', 'Administrator', 'Operations manager', 'Fleet manager', 'Reservations agent', 'Pricing manager',
      'Finance user', 'Accountant', 'Broker integration manager', 'Read-only',
    ]);
  });

  it('an OTA XML-only package gets only roles that fit it, trimmed to the package', () => {
    const xml = [P.VIEW_AGGREGATOR_SETUP, P.ACTION_ADMIN_MANAGE_RATE_PLANS, P.ACTION_ADMIN_MANAGE_TERMS, P.VIEW_FLEET_AVAILABILITY, P.VIEW_MY_PROFILE,
      P.VIEW_INTERNAL_MESSAGES, P.VIEW_ADMIN_PANEL, P.ACTION_ADMIN_MANAGE_USERS, P.ACTION_ADMIN_MANAGE_FLEET, P.ACTION_ADMIN_MANAGE_LOCATIONS,
      P.ACTION_ADMIN_MANAGE_EXTRAS, P.ACTION_ADMIN_MANAGE_COMPANY_DETAILS, P.ACTION_ADMIN_MANAGE_EMAIL_SETTINGS, P.VIEW_SYSTEM_ACTIVITY_LOG];
    const roles = rolesFor(xml);
    const names = roles.map(r => r.name);
    expect(names).toContain('Pricing manager');
    expect(names).toContain('Broker integration manager');
    expect(names).not.toContain('Reservations agent');
    expect(names).not.toContain('Accountant');
    for (const r of roles) for (const k of r.permissions) expect(xml).toContain(k);
  });

  it('a CRM-only package gets no broker roles', () => {
    const crm = ALL_PERMISSIONS.filter(k => ![P.VIEW_AGGREGATOR_SETUP, P.ACTION_ADMIN_MANAGE_RATE_PLANS, P.ACTION_ADMIN_MANAGE_TERMS].includes(k));
    const names = rolesFor(crm).map(r => r.name);
    expect(names).not.toContain('Pricing manager');
    expect(names).not.toContain('Broker integration manager');
    expect(names).toContain('Reservations agent');
  });

  it('nobody is offered more than they have themselves', () => {
    const limited = ROLE_TEMPLATES.find(r => r.id === 'agent')!.permissions;
    for (const r of rolesFor(limited)) for (const k of r.permissions) expect(limited).toContain(k);
  });

  it('recognises a role from its permissions', () => {
    expect(matchRole(ROLE_TEMPLATES.find(r => r.id === 'accountant')!.permissions)?.name).toBe('Accountant');
  });
});
