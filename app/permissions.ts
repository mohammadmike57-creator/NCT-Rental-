import { User, UserPermission } from '../types';
import { effectivePermissions } from '../services/permissionCatalog';

/** True when the person may use this screen or action (the server checks again; this only hides what they cannot use). */
export const hasPermission = (user: User | null | undefined, permission: UserPermission): boolean => {
  if (!user) return false;
  return effectivePermissions(user.permissions || []).includes(permission);
};
