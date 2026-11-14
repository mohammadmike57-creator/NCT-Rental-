import { User, UserPermission } from '../types';
import { effectivePermissions } from '../services/permissionCatalog';

/** True when the person may use this screen or action (the server checks again; this only hides what they cannot use). */
export const hasPermission = (user: User | null | undefined, permission: UserPermission): boolean => {
  if (!user) return false;
  // The supplier's package (Full system, CRM only, OTA XML only) caps everything; the server applies the same cap.
  if (Array.isArray(user.planPermissions) && !user.planPermissions.includes(permission)) return false;
  return effectivePermissions(user.permissions || []).includes(permission);
};
