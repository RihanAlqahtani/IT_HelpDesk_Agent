/**
 * Azure AD Service
 *
 * Handles all Microsoft Graph API interactions for user management.
 *
 * This service provides:
 * - User lookup and search
 * - Password reset
 * - Account enable/disable
 * - Group membership checks
 *
 * Security features:
 * - Automatic token management
 * - Admin role protection (cannot modify admins)
 * - Audit logging for all operations
 * - PII redaction in logs
 */

import { getAzureADConfig, isAzureADConfigured, env } from '../config/env.js';
import { logAudit } from '../middleware/audit.middleware.js';

/**
 * Azure AD User information
 */
export interface AzureADUser {
  id: string;
  userPrincipalName: string;
  displayName: string;
  mail: string | null;
  accountEnabled: boolean;
  department: string | null;
  jobTitle: string | null;
  officeLocation: string | null;
  mobilePhone: string | null;
}

/**
 * Azure AD operation result
 */
export interface AzureADResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
}

/**
 * Password reset result
 */
export interface PasswordResetResult {
  temporaryPassword: string;
  forceChangeOnNextLogin: boolean;
}

/**
 * Azure AD Service class
 */
export class AzureADService {
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private readonly TOKEN_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 minutes early

  /**
   * Check if Azure AD service is available
   */
  isConfigured(): boolean {
    return isAzureADConfigured();
  }

  /**
   * Check if privileged actions are enabled
   */
  isEnabled(): boolean {
    return env.FEATURE_PRIVILEGED_ACTIONS && this.isConfigured();
  }

  /**
   * Get an access token for Microsoft Graph API
   */
  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid
    if (this.accessToken && Date.now() < this.tokenExpiresAt - this.TOKEN_BUFFER_MS) {
      return this.accessToken;
    }

    const config = getAzureADConfig();

    const response = await fetch(
      `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          scope: 'https://graph.microsoft.com/.default',
          grant_type: 'client_credentials',
        }),
      }
    );

    const data = await response.json() as {
      access_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };

    if (!response.ok) {
      throw new Error(`Azure AD token error: ${data.error_description || data.error}`);
    }

    if (!data.access_token) {
      throw new Error('No access token received from Azure AD');
    }

    this.accessToken = data.access_token;
    // Token typically expires in 3600 seconds (1 hour)
    this.tokenExpiresAt = Date.now() + ((data.expires_in || 3600) * 1000);

    return this.accessToken;
  }

  /**
   * Call Microsoft Graph API
   */
  private async callGraphAPI<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<AzureADResult<T>> {
    try {
      const token = await this.getAccessToken();
      const config = getAzureADConfig();

      const response = await fetch(`${config.graphEndpoint}${endpoint}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      // Handle 204 No Content (success with no body)
      if (response.status === 204) {
        return { success: true };
      }

      const text = await response.text();
      let data: unknown;

      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { rawResponse: text };
      }

      if (!response.ok) {
        const errorData = data as { error?: { code?: string; message?: string } };
        return {
          success: false,
          error: errorData.error?.message || 'Unknown error',
          errorCode: errorData.error?.code,
        };
      }

      return { success: true, data: data as T };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get a user by email address
   */
  async getUser(email: string): Promise<AzureADResult<AzureADUser>> {
    if (!this.isConfigured()) {
      return { success: false, error: 'Azure AD is not configured' };
    }

    const encodedEmail = encodeURIComponent(email);
    return this.callGraphAPI<AzureADUser>(
      `/users/${encodedEmail}?$select=id,userPrincipalName,displayName,mail,accountEnabled,department,jobTitle,officeLocation,mobilePhone`
    );
  }

  /**
   * Check if a user has admin roles
   */
  async userHasAdminRoles(userId: string): Promise<AzureADResult<boolean>> {
    if (!this.isConfigured()) {
      return { success: false, error: 'Azure AD is not configured' };
    }

    const result = await this.callGraphAPI<{ value: Array<{ displayName?: string }> }>(
      `/users/${userId}/memberOf?$select=displayName`
    );

    if (!result.success) {
      return { success: false, error: result.error, errorCode: result.errorCode };
    }

    const adminRoles = result.data?.value?.filter(
      (r) =>
        r.displayName?.toLowerCase().includes('admin') ||
        r.displayName?.toLowerCase().includes('global')
    );

    return { success: true, data: (adminRoles?.length ?? 0) > 0 };
  }

  /**
   * Reset a user's password
   *
   * SAFETY: Cannot reset passwords for admin users
   */
  async resetPassword(
    email: string,
    requestedBy: string,
    ticketId: string
  ): Promise<AzureADResult<PasswordResetResult>> {
    if (!this.isEnabled()) {
      return { success: false, error: 'Privileged actions are not enabled' };
    }

    // Get user first
    const userResult = await this.getUser(email);
    if (!userResult.success || !userResult.data) {
      return { success: false, error: userResult.error || 'User not found' };
    }

    const user = userResult.data;

    // Safety check: Cannot reset admin passwords
    const adminCheck = await this.userHasAdminRoles(user.id);
    if (adminCheck.success && adminCheck.data) {
      await logAudit({
        userId: requestedBy,
        action: 'PASSWORD_RESET_BLOCKED',
        resourceType: 'azure_ad_user',
        resourceId: user.id,
        details: {
          reason: 'Target user has admin roles',
          targetEmail: '[REDACTED]',
          ticketId,
        },
      });
      return {
        success: false,
        error: 'Cannot reset password for admin users',
        errorCode: 'ADMIN_PROTECTED',
      };
    }

    // Generate temporary password
    const temporaryPassword = this.generateTemporaryPassword();

    // Call Azure AD to reset password
    const resetResult = await this.callGraphAPI(`/users/${user.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        passwordProfile: {
          password: temporaryPassword,
          forceChangePasswordNextSignIn: true,
        },
      }),
    });

    if (!resetResult.success) {
      await logAudit({
        userId: requestedBy,
        action: 'PASSWORD_RESET_FAILED',
        resourceType: 'azure_ad_user',
        resourceId: user.id,
        details: {
          error: resetResult.error,
          errorCode: resetResult.errorCode,
          ticketId,
        },
      });
      return resetResult as AzureADResult<PasswordResetResult>;
    }

    // Log successful reset (without the password!)
    await logAudit({
      userId: requestedBy,
      action: 'PASSWORD_RESET_SUCCESS',
      resourceType: 'azure_ad_user',
      resourceId: user.id,
      details: {
        targetDisplayName: user.displayName,
        forceChangeOnNextLogin: true,
        ticketId,
      },
    });

    return {
      success: true,
      data: {
        temporaryPassword,
        forceChangeOnNextLogin: true,
      },
    };
  }

  /**
   * Disable a user account
   *
   * SAFETY: Cannot disable admin users
   */
  async disableAccount(
    email: string,
    reason: string,
    requestedBy: string,
    ticketId: string
  ): Promise<AzureADResult<{ previousState: boolean }>> {
    if (!this.isEnabled()) {
      return { success: false, error: 'Privileged actions are not enabled' };
    }

    // Get user first
    const userResult = await this.getUser(email);
    if (!userResult.success || !userResult.data) {
      return { success: false, error: userResult.error || 'User not found' };
    }

    const user = userResult.data;

    // Safety check: Cannot disable admin accounts
    const adminCheck = await this.userHasAdminRoles(user.id);
    if (adminCheck.success && adminCheck.data) {
      await logAudit({
        userId: requestedBy,
        action: 'ACCOUNT_DISABLE_BLOCKED',
        resourceType: 'azure_ad_user',
        resourceId: user.id,
        details: {
          reason: 'Target user has admin roles',
          ticketId,
        },
      });
      return {
        success: false,
        error: 'Cannot disable admin accounts',
        errorCode: 'ADMIN_PROTECTED',
      };
    }

    // Store previous state for rollback
    const previousState = user.accountEnabled;

    // Disable the account
    const disableResult = await this.callGraphAPI(`/users/${user.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ accountEnabled: false }),
    });

    if (!disableResult.success) {
      await logAudit({
        userId: requestedBy,
        action: 'ACCOUNT_DISABLE_FAILED',
        resourceType: 'azure_ad_user',
        resourceId: user.id,
        details: {
          error: disableResult.error,
          ticketId,
        },
      });
      return disableResult as AzureADResult<{ previousState: boolean }>;
    }

    await logAudit({
      userId: requestedBy,
      action: 'ACCOUNT_DISABLED',
      resourceType: 'azure_ad_user',
      resourceId: user.id,
      details: {
        targetDisplayName: user.displayName,
        reason,
        previousState,
        ticketId,
      },
    });

    return { success: true, data: { previousState } };
  }

  /**
   * Enable a user account
   */
  async enableAccount(
    email: string,
    reason: string,
    requestedBy: string,
    ticketId: string
  ): Promise<AzureADResult<{ previousState: boolean }>> {
    if (!this.isEnabled()) {
      return { success: false, error: 'Privileged actions are not enabled' };
    }

    // Get user first
    const userResult = await this.getUser(email);
    if (!userResult.success || !userResult.data) {
      return { success: false, error: userResult.error || 'User not found' };
    }

    const user = userResult.data;
    const previousState = user.accountEnabled;

    // Enable the account
    const enableResult = await this.callGraphAPI(`/users/${user.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ accountEnabled: true }),
    });

    if (!enableResult.success) {
      await logAudit({
        userId: requestedBy,
        action: 'ACCOUNT_ENABLE_FAILED',
        resourceType: 'azure_ad_user',
        resourceId: user.id,
        details: {
          error: enableResult.error,
          ticketId,
        },
      });
      return enableResult as AzureADResult<{ previousState: boolean }>;
    }

    await logAudit({
      userId: requestedBy,
      action: 'ACCOUNT_ENABLED',
      resourceType: 'azure_ad_user',
      resourceId: user.id,
      details: {
        targetDisplayName: user.displayName,
        reason,
        previousState,
        ticketId,
      },
    });

    return { success: true, data: { previousState } };
  }

  /**
   * Search for users by name or email
   */
  async searchUsers(
    query: string,
    limit: number = 10
  ): Promise<AzureADResult<AzureADUser[]>> {
    if (!this.isConfigured()) {
      return { success: false, error: 'Azure AD is not configured' };
    }

    const encodedQuery = encodeURIComponent(query);
    const result = await this.callGraphAPI<{ value: AzureADUser[] }>(
      `/users?$filter=startswith(displayName,'${encodedQuery}') or startswith(mail,'${encodedQuery}')&$top=${limit}&$select=id,userPrincipalName,displayName,mail,accountEnabled,department,jobTitle`
    );

    if (!result.success) {
      return { success: false, error: result.error, errorCode: result.errorCode };
    }

    return { success: true, data: result.data?.value || [] };
  }

  /**
   * Generate a secure temporary password
   */
  private generateTemporaryPassword(): string {
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lower = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%^&*';
    const all = upper + lower + numbers + special;

    let password = '';

    // Ensure at least one of each type
    password += upper[Math.floor(Math.random() * upper.length)];
    password += lower[Math.floor(Math.random() * lower.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];

    // Fill rest with random characters
    for (let i = 4; i < 16; i++) {
      password += all[Math.floor(Math.random() * all.length)];
    }

    // Shuffle the password
    return password
      .split('')
      .sort(() => Math.random() - 0.5)
      .join('');
  }
}

// Export singleton instance
export const azureADService = new AzureADService();
