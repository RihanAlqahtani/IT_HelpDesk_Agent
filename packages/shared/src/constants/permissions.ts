/**
 * Permission Constants
 *
 * Defines all permissions, roles, and their relationships.
 * In MVP, all privileged permissions have is_enabled = false.
 */

import type {
  Permission,
  PermissionInfo,
  UserRole,
  RoleInfo,
} from '../types/permissions.js';

/**
 * All available permissions
 */
export const PERMISSIONS = {
  // Ticket permissions (MVP - enabled)
  TICKET_READ: 'ticket.read' as Permission,
  TICKET_CREATE: 'ticket.create' as Permission,
  TICKET_RESPOND: 'ticket.respond' as Permission,
  TICKET_ESCALATE: 'ticket.escalate' as Permission,
  TICKET_CLOSE: 'ticket.close' as Permission,

  // Privileged permissions (MVP - disabled)
  ACCOUNT_CREATE: 'account.create' as Permission,
  ACCOUNT_MODIFY: 'account.modify' as Permission,
  ACCOUNT_DISABLE: 'account.disable' as Permission,
  PASSWORD_RESET: 'password.reset' as Permission,
  PERMISSION_MODIFY: 'permission.modify' as Permission,
  ONBOARDING_EXECUTE: 'onboarding.execute' as Permission,
  OFFBOARDING_EXECUTE: 'offboarding.execute' as Permission,
} as const;

/**
 * Detailed permission metadata
 */
export const PERMISSION_INFO: Record<Permission, PermissionInfo> = {
  'ticket.read': {
    name: 'ticket.read',
    description: 'View tickets',
    isPrivileged: false,
    isEnabledInMVP: true,
    minimumRole: 'employee',
  },
  'ticket.create': {
    name: 'ticket.create',
    description: 'Create new tickets',
    isPrivileged: false,
    isEnabledInMVP: true,
    minimumRole: 'employee',
  },
  'ticket.respond': {
    name: 'ticket.respond',
    description: 'Respond to tickets',
    isPrivileged: false,
    isEnabledInMVP: true,
    minimumRole: 'it_support',
  },
  'ticket.escalate': {
    name: 'ticket.escalate',
    description: 'Escalate tickets',
    isPrivileged: false,
    isEnabledInMVP: true,
    minimumRole: 'it_support',
  },
  'ticket.close': {
    name: 'ticket.close',
    description: 'Close tickets',
    isPrivileged: false,
    isEnabledInMVP: true,
    minimumRole: 'it_support',
  },
  'account.create': {
    name: 'account.create',
    description: 'Create user accounts',
    isPrivileged: true,
    isEnabledInMVP: false,
    minimumRole: 'it_admin',
  },
  'account.modify': {
    name: 'account.modify',
    description: 'Modify user accounts',
    isPrivileged: true,
    isEnabledInMVP: false,
    minimumRole: 'it_admin',
  },
  'account.disable': {
    name: 'account.disable',
    description: 'Disable user accounts',
    isPrivileged: true,
    isEnabledInMVP: false,
    minimumRole: 'it_admin',
  },
  'password.reset': {
    name: 'password.reset',
    description: 'Reset user passwords',
    isPrivileged: true,
    isEnabledInMVP: false,
    minimumRole: 'it_admin',
  },
  'permission.modify': {
    name: 'permission.modify',
    description: 'Modify user permissions',
    isPrivileged: true,
    isEnabledInMVP: false,
    minimumRole: 'it_admin',
  },
  'onboarding.execute': {
    name: 'onboarding.execute',
    description: 'Execute employee onboarding workflows',
    isPrivileged: true,
    isEnabledInMVP: false,
    minimumRole: 'it_admin',
  },
  'offboarding.execute': {
    name: 'offboarding.execute',
    description: 'Execute employee offboarding workflows',
    isPrivileged: true,
    isEnabledInMVP: false,
    minimumRole: 'it_admin',
  },
};

/**
 * Role definitions with hierarchy levels
 */
export const ROLES: Record<UserRole, RoleInfo> = {
  employee: {
    name: 'employee',
    description: 'Regular employee - can create and view own tickets',
    level: 1,
    canAccessAdmin: false,
  },
  it_support: {
    name: 'it_support',
    description: 'IT Support staff - can respond to and manage tickets',
    level: 2,
    canAccessAdmin: false,
  },
  it_admin: {
    name: 'it_admin',
    description: 'IT Administrator - full system access',
    level: 3,
    canAccessAdmin: true,
  },
  system_service: {
    name: 'system_service',
    description: 'System service account - backend only',
    level: 4,
    canAccessAdmin: false,
  },
};

/**
 * Default permissions assigned to each role
 */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  employee: [PERMISSIONS.TICKET_READ, PERMISSIONS.TICKET_CREATE],
  it_support: [
    PERMISSIONS.TICKET_READ,
    PERMISSIONS.TICKET_CREATE,
    PERMISSIONS.TICKET_RESPOND,
    PERMISSIONS.TICKET_ESCALATE,
    PERMISSIONS.TICKET_CLOSE,
  ],
  it_admin: Object.values(PERMISSIONS),
  system_service: [], // Service accounts get permissions via service role key
};

/**
 * Get all permissions for a role
 */
export function getPermissionsForRole(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role] || [];
}

/**
 * Check if a role has a specific permission
 */
export function roleHasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/**
 * Get all privileged permissions
 */
export function getPrivilegedPermissions(): Permission[] {
  return Object.entries(PERMISSION_INFO)
    .filter(([, info]) => info.isPrivileged)
    .map(([name]) => name as Permission);
}

/**
 * Check if a permission is privileged
 */
export function isPrivilegedPermission(permission: Permission): boolean {
  return PERMISSION_INFO[permission]?.isPrivileged ?? false;
}

/**
 * Check if a permission is enabled in MVP
 */
export function isPermissionEnabledInMVP(permission: Permission): boolean {
  return PERMISSION_INFO[permission]?.isEnabledInMVP ?? false;
}
