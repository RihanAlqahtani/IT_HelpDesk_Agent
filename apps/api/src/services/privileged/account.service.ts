/**
 * Account Service (Privileged)
 *
 * Handles privileged account management operations.
 *
 * This service integrates with Azure AD via the azureADService
 * to perform account operations.
 *
 * Security features:
 * - Feature flag control (FEATURE_PRIVILEGED_ACTIONS)
 * - Cannot modify admin accounts
 * - Full audit logging
 * - Rollback data for undo capability
 */

import { env } from '../../config/env.js';
import { logAudit } from '../../middleware/audit.middleware.js';
import { azureADService } from '../azure-ad.service.js';

/**
 * Account operation types
 */
export type AccountOperation = 'create' | 'modify' | 'disable' | 'enable';

/**
 * Account creation payload
 */
export interface CreateAccountPayload {
  email: string;
  displayName: string;
  department: string;
  jobTitle?: string;
  manager?: string;
}

/**
 * Account modification payload
 */
export interface ModifyAccountPayload {
  targetEmail: string;
  changes: {
    displayName?: string;
    department?: string;
    jobTitle?: string;
    manager?: string;
  };
}

/**
 * Account disable payload
 */
export interface DisableAccountPayload {
  targetEmail: string;
  reason: string;
}

/**
 * Account enable payload
 */
export interface EnableAccountPayload {
  targetEmail: string;
  reason: string;
}

/**
 * Operation result
 */
export interface PrivilegedOperationResult {
  success: boolean;
  error?: string;
  data?: Record<string, unknown>;
  rollbackData?: Record<string, unknown>;
}

/**
 * Account Service class
 */
export class AccountService {
  /**
   * Check if privileged account actions are enabled
   */
  isEnabled(): boolean {
    return env.FEATURE_PRIVILEGED_ACTIONS;
  }

  /**
   * Check if Azure AD is configured
   */
  isAzureADReady(): boolean {
    return azureADService.isEnabled();
  }

  /**
   * Create a new user account
   *
   * Note: Account creation in Azure AD requires additional permissions
   * and is more complex. This is stubbed for future implementation.
   */
  async createAccount(
    payload: CreateAccountPayload,
    requestedBy: string,
    ticketId: string,
    approvalId?: string
  ): Promise<PrivilegedOperationResult> {
    if (!this.isEnabled()) {
      await this.logDisabledAttempt('account.create', requestedBy, ticketId, payload);
      return {
        success: false,
        error: 'Privileged account creation is not enabled in this deployment',
      };
    }

    // Future implementation:
    // 1. Validate payload
    // 2. Check approval if required
    // 3. Call Azure AD API to create account
    // 4. Assign licenses
    // 5. Add to groups
    // 6. Log the action with rollback data
    // 7. Return result

    return {
      success: false,
      error: 'Account creation is not yet implemented. Please create accounts manually in Azure AD.',
    };
  }

  /**
   * Modify an existing user account
   *
   * Note: Account modification is stubbed for future implementation.
   */
  async modifyAccount(
    payload: ModifyAccountPayload,
    requestedBy: string,
    ticketId: string,
    approvalId?: string
  ): Promise<PrivilegedOperationResult> {
    if (!this.isEnabled()) {
      await this.logDisabledAttempt('account.modify', requestedBy, ticketId, payload);
      return {
        success: false,
        error: 'Privileged account modification is not enabled in this deployment',
      };
    }

    // Future implementation placeholder
    return {
      success: false,
      error: 'Account modification is not yet implemented.',
    };
  }

  /**
   * Disable a user account
   *
   * This prevents the user from signing in to any Microsoft 365 services.
   */
  async disableAccount(
    payload: DisableAccountPayload,
    requestedBy: string,
    ticketId: string,
    approvalId?: string
  ): Promise<PrivilegedOperationResult> {
    if (!this.isEnabled()) {
      await this.logDisabledAttempt('account.disable', requestedBy, ticketId, payload);
      return {
        success: false,
        error: 'Privileged account disabling is not enabled in this deployment',
      };
    }

    // Check if Azure AD is configured
    if (!azureADService.isConfigured()) {
      return {
        success: false,
        error: 'Azure AD is not configured. Cannot disable account.',
      };
    }

    // Log the attempt
    await logAudit({
      userId: requestedBy,
      action: 'ACCOUNT_DISABLE_INITIATED',
      resourceType: 'privileged_action',
      resourceId: ticketId,
      details: {
        targetEmail: '[REDACTED]',
        reason: payload.reason,
        approvalId,
      },
    });

    // Perform the disable via Azure AD
    const result = await azureADService.disableAccount(
      payload.targetEmail,
      payload.reason,
      requestedBy,
      ticketId
    );

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Failed to disable account',
        data: { errorCode: result.errorCode },
      };
    }

    // Get user info for the response
    const userInfo = await azureADService.getUser(payload.targetEmail);

    return {
      success: true,
      data: {
        targetEmail: payload.targetEmail,
        targetDisplayName: userInfo.data?.displayName,
        accountEnabled: false,
      },
      rollbackData: {
        action: 'account_disable',
        targetEmail: payload.targetEmail,
        previousState: result.data?.previousState,
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Enable a user account
   *
   * This allows the user to sign in to Microsoft 365 services again.
   */
  async enableAccount(
    payload: EnableAccountPayload,
    requestedBy: string,
    ticketId: string,
    approvalId?: string
  ): Promise<PrivilegedOperationResult> {
    if (!this.isEnabled()) {
      await this.logDisabledAttempt('account.enable', requestedBy, ticketId, payload);
      return {
        success: false,
        error: 'Privileged account enabling is not enabled in this deployment',
      };
    }

    // Check if Azure AD is configured
    if (!azureADService.isConfigured()) {
      return {
        success: false,
        error: 'Azure AD is not configured. Cannot enable account.',
      };
    }

    // Log the attempt
    await logAudit({
      userId: requestedBy,
      action: 'ACCOUNT_ENABLE_INITIATED',
      resourceType: 'privileged_action',
      resourceId: ticketId,
      details: {
        targetEmail: '[REDACTED]',
        reason: payload.reason,
        approvalId,
      },
    });

    // Perform the enable via Azure AD
    const result = await azureADService.enableAccount(
      payload.targetEmail,
      payload.reason,
      requestedBy,
      ticketId
    );

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Failed to enable account',
        data: { errorCode: result.errorCode },
      };
    }

    // Get user info for the response
    const userInfo = await azureADService.getUser(payload.targetEmail);

    return {
      success: true,
      data: {
        targetEmail: payload.targetEmail,
        targetDisplayName: userInfo.data?.displayName,
        accountEnabled: true,
      },
      rollbackData: {
        action: 'account_enable',
        targetEmail: payload.targetEmail,
        previousState: result.data?.previousState,
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Rollback a previous account operation
   */
  async rollbackOperation(
    operationId: string,
    requestedBy: string
  ): Promise<PrivilegedOperationResult> {
    if (!this.isEnabled()) {
      return {
        success: false,
        error: 'Privileged actions are not enabled',
      };
    }

    // Future: Fetch rollback data from privileged_action_logs and reverse the operation
    return {
      success: false,
      error: 'Rollback is not yet implemented',
    };
  }

  /**
   * Log an attempt to use a disabled privileged action
   */
  private async logDisabledAttempt(
    action: string,
    userId: string,
    ticketId: string,
    payload: unknown
  ): Promise<void> {
    await logAudit({
      userId,
      action: 'PRIVILEGED_ACTION_BLOCKED',
      resourceType: 'privileged_action',
      resourceId: ticketId,
      details: {
        attemptedAction: action,
        reason: 'Feature disabled',
        payload: { type: typeof payload }, // Don't log actual payload for security
      },
    });
  }
}

// Export singleton instance
export const accountService = new AccountService();
