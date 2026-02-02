/**
 * Permission Service
 *
 * Handles permission checks and role management.
 * In MVP, all privileged permissions are disabled.
 */

import { supabaseAdmin } from '../config/supabase.js';
import { env } from '../config/env.js';
import type { Permission, UserRole, PermissionCheckResult } from '@it-helpdesk/shared';
import { PERMISSION_INFO, isPrivilegedPermission } from '@it-helpdesk/shared';

/**
 * Permission record from database
 */
interface PermissionRecord {
  id: string;
  name: string;
  description: string;
  is_privileged: boolean;
  is_enabled: boolean;
  minimum_role: string;
}

/**
 * Permission Service class
 */
export class PermissionService {
  private permissionCache: Map<string, PermissionRecord> = new Map();
  private cacheExpiry: number = 0;
  private readonly CACHE_TTL_MS = 60000; // 1 minute

  /**
   * Get a permission by name
   */
  async getPermission(name: Permission): Promise<PermissionRecord | null> {
    // Check cache first
    await this.refreshCacheIfNeeded();

    return this.permissionCache.get(name) || null;
  }

  /**
   * Check if a user has a specific permission
   */
  async userHasPermission(userId: string, permission: Permission): Promise<boolean> {
    // Get user's role
    const { data: userData, error: userError } = await supabaseAdmin
      .from('it_users')
      .select('role_id, it_roles(name)')
      .eq('id', userId)
      .single();

    if (userError || !userData) {
      return false;
    }

    const roles = userData.it_roles as unknown as { name: string } | { name: string }[];
    const roleName = (Array.isArray(roles) ? roles[0]?.name : roles?.name) as UserRole;

    // Get role's permissions
    const { data: rolePermissions, error: permError } = await supabaseAdmin
      .from('it_role_permissions')
      .select('it_permissions(name)')
      .eq('role_id', userData.role_id);

    if (permError || !rolePermissions) {
      return false;
    }

    const userPermissions = rolePermissions.map((rp) => {
      const perms = rp.it_permissions as unknown as { name: string } | { name: string }[];
      return Array.isArray(perms) ? perms[0]?.name : perms?.name;
    }).filter(Boolean) as string[];

    return userPermissions.includes(permission);
  }

  /**
   * Check permission with detailed result
   */
  async checkPermission(
    userId: string,
    permission: Permission
  ): Promise<PermissionCheckResult> {
    // Get permission record
    const permRecord = await this.getPermission(permission);

    if (!permRecord) {
      return {
        allowed: false,
        reason: 'Permission not found',
      };
    }

    // Check if permission is privileged and disabled
    if (permRecord.is_privileged && !permRecord.is_enabled) {
      return {
        allowed: false,
        reason: 'This privileged action is not enabled',
        permissionDisabled: true,
      };
    }

    // Check feature flag
    if (permRecord.is_privileged && !env.FEATURE_PRIVILEGED_ACTIONS) {
      return {
        allowed: false,
        reason: 'Privileged actions are disabled',
        permissionDisabled: true,
      };
    }

    // Check if user has permission
    const hasPermission = await this.userHasPermission(userId, permission);

    if (!hasPermission) {
      return {
        allowed: false,
        reason: 'User does not have this permission',
        missingRole: true,
      };
    }

    return { allowed: true };
  }

  /**
   * Get all permissions for a user
   */
  async getUserPermissions(userId: string): Promise<Permission[]> {
    const { data: userData, error: userError } = await supabaseAdmin
      .from('it_users')
      .select('role_id')
      .eq('id', userId)
      .single();

    if (userError || !userData) {
      return [];
    }

    const { data: rolePermissions, error: permError } = await supabaseAdmin
      .from('it_role_permissions')
      .select('it_permissions(name, is_enabled, is_privileged)')
      .eq('role_id', userData.role_id);

    if (permError || !rolePermissions) {
      return [];
    }

    // Filter out disabled privileged permissions
    return rolePermissions
      .map((rp) => {
        const perms = rp.it_permissions as unknown as { name: string; is_enabled: boolean; is_privileged: boolean } | { name: string; is_enabled: boolean; is_privileged: boolean }[];
        return Array.isArray(perms) ? perms[0] : perms;
      })
      .filter((p) => p && (!p.is_privileged || p.is_enabled))
      .map((p) => p!.name as Permission);
  }

  /**
   * Get user's role
   */
  async getUserRole(userId: string): Promise<UserRole | null> {
    const { data, error } = await supabaseAdmin
      .from('it_users')
      .select('it_roles(name)')
      .eq('id', userId)
      .single();

    if (error || !data) {
      return null;
    }

    const roles = data.it_roles as unknown as { name: string } | { name: string }[];
    return (Array.isArray(roles) ? roles[0]?.name : roles?.name) as UserRole;
  }

  /**
   * Check if user is IT staff
   */
  async isITStaff(userId: string): Promise<boolean> {
    const role = await this.getUserRole(userId);
    return role !== null && ['it_support', 'it_admin'].includes(role);
  }

  /**
   * Check if user is IT admin
   */
  async isITAdmin(userId: string): Promise<boolean> {
    const role = await this.getUserRole(userId);
    return role === 'it_admin';
  }

  /**
   * Get all privileged permissions and their status
   */
  async getPrivilegedPermissionsStatus(): Promise<
    Array<{ name: string; enabled: boolean; description: string }>
  > {
    await this.refreshCacheIfNeeded();

    const privileged: Array<{ name: string; enabled: boolean; description: string }> = [];

    for (const [name, record] of this.permissionCache) {
      if (record.is_privileged) {
        privileged.push({
          name,
          enabled: record.is_enabled && env.FEATURE_PRIVILEGED_ACTIONS,
          description: record.description,
        });
      }
    }

    return privileged;
  }

  /**
   * Refresh permission cache if expired
   */
  private async refreshCacheIfNeeded(): Promise<void> {
    const now = Date.now();

    if (now < this.cacheExpiry && this.permissionCache.size > 0) {
      return;
    }

    const { data, error } = await supabaseAdmin.from('it_permissions').select('*');

    if (error) {
      console.error('Failed to refresh permission cache:', error);
      return;
    }

    this.permissionCache.clear();

    for (const record of data || []) {
      this.permissionCache.set(record.name, record);
    }

    this.cacheExpiry = now + this.CACHE_TTL_MS;
  }
}

// Export singleton instance
export const permissionService = new PermissionService();
